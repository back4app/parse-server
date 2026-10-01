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

/**
 * Config keys that need to be loaded asynchronously.
 */
const asyncKeys = ['publicServerURL'];
class Config {
  static get(applicationId, mount) {
    const cacheInfo = _cache.default.get(applicationId);
    if (!cacheInfo) {
      return;
    }
    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key != 'databaseController' && key != 'database') {
        config[key] = cacheInfo[key];
      }
    });
    // Always create a new database controller, as it holds request-scoped state such as the
    // transactional session; a request-scoped config in the cache has `database` instead of
    // `databaseController`
    const databaseController = cacheInfo.databaseController || cacheInfo.database;
    if (databaseController) {
      config.database = new _DatabaseController.default(databaseController.adapter, config);
    }
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(config);
    config.version = _package.version;
    return config;
  }
  async loadKeys() {
    await Promise.all(asyncKeys.map(async key => {
      if (typeof this[`_${key}`] === 'function') {
        try {
          this[key] = await this[`_${key}`]();
        } catch (error) {
          throw new Error(`Failed to resolve async config key '${key}': ${error.message}`);
        }
      }
    }));
    const cachedConfig = _cache.default.get(this.appId);
    if (cachedConfig) {
      const updatedConfig = {
        ...cachedConfig
      };
      asyncKeys.forEach(key => {
        updatedConfig[key] = this[key];
      });
      _cache.default.put(this.appId, updatedConfig);
    }
  }
  static transformConfiguration(serverConfiguration) {
    for (const key of Object.keys(serverConfiguration)) {
      if (asyncKeys.includes(key) && typeof serverConfiguration[key] === 'function') {
        serverConfiguration[`_${key}`] = serverConfiguration[key];
        delete serverConfiguration[key];
      }
    }
  }
  static put(serverConfiguration) {
    Config.validateOptions(serverConfiguration);
    Config.validateControllers(serverConfiguration);
    Config.transformConfiguration(serverConfiguration);
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
    requestComplexity,
    databaseOptions,
    extendSessionOnUse,
    allowClientClassCreation,
    liveQuery
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
    this.validatePublicServerURL({
      publicServerURL
    });
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
    this.validateRequestComplexity(requestComplexity);
    this.validateLogLevels(logLevels);
    this.validateDatabaseOptions(databaseOptions);
    this.validateCustomPages(customPages);
    this.validateAllowClientClassCreation(allowClientClassCreation);
    this.validateLiveQueryOptions(liveQuery);
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
    _publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid,
    emailVerifySuccessOnInvalidEmail
  }) {
    const emailAdapter = userController.adapter;
    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL: publicServerURL || _publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid,
        emailVerifySuccessOnInvalidEmail
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
      if (passwordPolicy.resetPasswordSuccessOnInvalidEmail !== undefined && typeof passwordPolicy.resetPasswordSuccessOnInvalidEmail !== 'boolean') {
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
  static validatePublicServerURL({
    publicServerURL,
    required = false
  }) {
    if (!publicServerURL) {
      if (!required) {
        return;
      }
      throw 'The option publicServerURL is required.';
    }
    const type = typeof publicServerURL;
    if (type === 'string') {
      if (!publicServerURL.startsWith('http://') && !publicServerURL.startsWith('https://')) {
        throw 'The option publicServerURL must be a valid URL starting with http:// or https://.';
      }
      return;
    }
    if (type === 'function') {
      return;
    }
    throw `The option publicServerURL must be a string or function, but got ${type}.`;
  }
  static validateEmailConfiguration({
    emailAdapter,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid,
    emailVerifySuccessOnInvalidEmail
  }) {
    if (!emailAdapter) {
      throw 'An emailAdapter is required for e-mail verification and password resets.';
    }
    if (typeof appName !== 'string') {
      throw 'An app name is required for e-mail verification and password resets.';
    }
    this.validatePublicServerURL({
      publicServerURL,
      required: true
    });
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
    if (emailVerifySuccessOnInvalidEmail !== undefined && typeof emailVerifySuccessOnInvalidEmail !== 'boolean') {
      throw 'emailVerifySuccessOnInvalidEmail must be a boolean value';
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
    if (databaseOptions.allowPublicExplain === undefined) {
      databaseOptions.allowPublicExplain = _Definitions.DatabaseOptions.allowPublicExplain.default;
    } else if (typeof databaseOptions.allowPublicExplain !== 'boolean') {
      throw `Parse Server option 'databaseOptions.allowPublicExplain' must be a boolean.`;
    }
  }
  static validateLiveQueryOptions(liveQuery) {
    if (liveQuery == undefined) {
      return;
    }
    if (liveQuery.regexTimeout === undefined) {
      liveQuery.regexTimeout = _Definitions.LiveQueryOptions.regexTimeout.default;
    } else if (typeof liveQuery.regexTimeout !== 'number') {
      throw `liveQuery.regexTimeout must be a number`;
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
  static validateRequestComplexity(requestComplexity) {
    if (requestComplexity == null) {
      return;
    }
    if (typeof requestComplexity !== 'object' || Array.isArray(requestComplexity)) {
      throw new Error('requestComplexity must be an object.');
    }
    const validKeys = Object.keys(_Definitions.RequestComplexityOptions);
    for (const key of Object.keys(requestComplexity)) {
      if (!validKeys.includes(key)) {
        throw new Error(`requestComplexity contains unknown property '${key}'.`);
      }
    }
    for (const key of validKeys) {
      if (requestComplexity[key] !== undefined) {
        const value = requestComplexity[key];
        if (!Number.isInteger(value) || value < 1 && value !== -1) {
          throw new Error(`requestComplexity.${key} must be a positive integer or -1 to disable.`);
        }
      } else {
        requestComplexity[key] = _Definitions.RequestComplexityOptions[key].default;
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
    let i = this.rateLimits?.length;
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
  async loadMasterKey() {
    if (typeof this.masterKey === 'function') {
      const ttlIsEmpty = !this.masterKeyTtl;
      const isExpired = this.masterKeyCache?.expiresAt && this.masterKeyCache.expiresAt < new Date();
      if ((!isExpired || ttlIsEmpty) && this.masterKeyCache?.masterKey) {
        return this.masterKeyCache.masterKey;
      }
      const masterKey = await this.masterKey();
      const expiresAt = this.masterKeyTtl ? new Date(Date.now() + 1000 * this.masterKeyTtl) : null;
      this.masterKeyCache = {
        masterKey,
        expiresAt
      };
      // Update only the cached server config, as this config is request-scoped
      const serverConfig = _cache.default.get(this.applicationId);
      if (serverConfig) {
        serverConfig.masterKeyCache = this.masterKeyCache;
      }
      return this.masterKeyCache.masterKey;
    }
    return this.masterKey;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwicmVxdWlyZSIsIl9uZXQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2NhY2hlIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX3BhY2thZ2UiLCJfRGVmaW5pdGlvbnMiLCJfUGFyc2UiLCJfRGVwcmVjYXRvciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsInJlbW92ZVRyYWlsaW5nU2xhc2giLCJzdHIiLCJlbmRzV2l0aCIsInN1YnN0cmluZyIsImxlbmd0aCIsImFzeW5jS2V5cyIsIkNvbmZpZyIsImdldCIsImFwcGxpY2F0aW9uSWQiLCJtb3VudCIsImNhY2hlSW5mbyIsIkFwcENhY2hlIiwiY29uZmlnIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJrZXkiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZSIsIkRhdGFiYXNlQ29udHJvbGxlciIsImFkYXB0ZXIiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJiaW5kIiwiZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0IiwidmVyc2lvbiIsImxvYWRLZXlzIiwiUHJvbWlzZSIsImFsbCIsIm1hcCIsImVycm9yIiwiRXJyb3IiLCJtZXNzYWdlIiwiY2FjaGVkQ29uZmlnIiwiYXBwSWQiLCJ1cGRhdGVkQ29uZmlnIiwicHV0IiwidHJhbnNmb3JtQ29uZmlndXJhdGlvbiIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJpbmNsdWRlcyIsInZhbGlkYXRlT3B0aW9ucyIsInZhbGlkYXRlQ29udHJvbGxlcnMiLCJzZXR1cFBhc3N3b3JkVmFsaWRhdG9yIiwicGFzc3dvcmRQb2xpY3kiLCJjdXN0b21QYWdlcyIsInB1YmxpY1NlcnZlclVSTCIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJleHBpcmVJbmFjdGl2ZVNlc3Npb25zIiwic2Vzc2lvbkxlbmd0aCIsImRlZmF1bHRMaW1pdCIsIm1heExpbWl0IiwiYWNjb3VudExvY2tvdXQiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsIm1haW50ZW5hbmNlS2V5SXBzIiwicmVhZE9ubHlNYXN0ZXJLZXkiLCJhbGxvd0hlYWRlcnMiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJmaWxlVXBsb2FkIiwicGFnZXMiLCJzZWN1cml0eSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyIsInNjaGVtYSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwibG9nTGV2ZWxzIiwicmF0ZUxpbWl0IiwicmVxdWVzdENvbXBsZXhpdHkiLCJkYXRhYmFzZU9wdGlvbnMiLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJsaXZlUXVlcnkiLCJ2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5IiwidmFsaWRhdGVQYXNzd29yZFBvbGljeSIsInZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMiLCJ2YWxpZGF0ZVB1YmxpY1NlcnZlclVSTCIsInZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZUlwcyIsInZhbGlkYXRlRGVmYXVsdExpbWl0IiwidmFsaWRhdGVNYXhMaW1pdCIsInZhbGlkYXRlQWxsb3dIZWFkZXJzIiwidmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMiLCJ2YWxpZGF0ZVBhZ2VzT3B0aW9ucyIsInZhbGlkYXRlU2VjdXJpdHlPcHRpb25zIiwidmFsaWRhdGVTY2hlbWFPcHRpb25zIiwidmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzIiwidmFsaWRhdGVFbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyIsInZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInZhbGlkYXRlUmF0ZUxpbWl0IiwidmFsaWRhdGVSZXF1ZXN0Q29tcGxleGl0eSIsInZhbGlkYXRlTG9nTGV2ZWxzIiwidmFsaWRhdGVEYXRhYmFzZU9wdGlvbnMiLCJ2YWxpZGF0ZUN1c3RvbVBhZ2VzIiwidmFsaWRhdGVBbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJ2YWxpZGF0ZUxpdmVRdWVyeU9wdGlvbnMiLCJwcm90b3R5cGUiLCJ0b1N0cmluZyIsImNhbGwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwidXNlckNvbnRyb2xsZXIiLCJhcHBOYW1lIiwiX3B1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImVtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsIiwiZW1haWxBZGFwdGVyIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJ1bmRlZmluZWQiLCJBcnJheSIsImlzQXJyYXkiLCJlbmFibGVDaGVjayIsIlNlY3VyaXR5T3B0aW9ucyIsImlzQm9vbGVhbiIsImVuYWJsZUNoZWNrTG9nIiwiZGVmaW5pdGlvbnMiLCJTY2hlbWFPcHRpb25zIiwic3RyaWN0IiwiZGVsZXRlRXh0cmFGaWVsZHMiLCJyZWNyZWF0ZU1vZGlmaWVkRmllbGRzIiwibG9ja1NjaGVtYXMiLCJiZWZvcmVNaWdyYXRpb24iLCJhZnRlck1pZ3JhdGlvbiIsImVuYWJsZVJvdXRlciIsIlBhZ2VzT3B0aW9ucyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiaXNTdHJpbmciLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsInBsYWNlaG9sZGVycyIsImZvcmNlUmVkaXJlY3QiLCJwYWdlc1BhdGgiLCJwYWdlc0VuZHBvaW50IiwiY3VzdG9tVXJscyIsImN1c3RvbVJvdXRlcyIsInR0bCIsIklkZW1wb3RlbmN5T3B0aW9ucyIsImlzTmFOIiwicGF0aHMiLCJkdXJhdGlvbiIsIk51bWJlciIsImlzSW50ZWdlciIsInRocmVzaG9sZCIsInVubG9ja09uUGFzc3dvcmRSZXNldCIsIkFjY291bnRMb2Nrb3V0T3B0aW9ucyIsIm1heFBhc3N3b3JkQWdlIiwicmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJ2YWxpZGF0b3JQYXR0ZXJuIiwiUmVnRXhwIiwidmFsaWRhdG9yQ2FsbGJhY2siLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWx1ZSIsInRlc3QiLCJyZXF1aXJlZCIsInR5cGUiLCJzdGFydHNXaXRoIiwiUmVmZXJlbmNlRXJyb3IiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRmlsZVVwbG9hZE9wdGlvbnMiLCJlbmFibGVGb3JQdWJsaWMiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImZpbGVFeHRlbnNpb25zIiwiZmllbGQiLCJpcCIsInNwbGl0IiwibmV0IiwiaXNJUCIsIkRlcHJlY2F0b3IiLCJsb2dSdW50aW1lRGVwcmVjYXRpb24iLCJ1c2FnZSIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaGVhZGVyIiwidHJpbSIsIkxvZ0xldmVscyIsInZhbGlkTG9nTGV2ZWxzIiwiaW5kZXhPZiIsIkpTT04iLCJzdHJpbmdpZnkiLCJlbmFibGVTY2hlbWFIb29rcyIsIkRhdGFiYXNlT3B0aW9ucyIsInNjaGVtYUNhY2hlVHRsIiwiYWxsb3dQdWJsaWNFeHBsYWluIiwicmVnZXhUaW1lb3V0IiwiTGl2ZVF1ZXJ5T3B0aW9ucyIsIm9wdGlvbnMiLCJvcHRpb24iLCJyZXF1ZXN0UGF0aCIsInJlcXVlc3RUaW1lV2luZG93IiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsIlBhcnNlU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsInpvbmUiLCJmb3JtYXR0ZXIiLCJJbnRsIiwiTGlzdEZvcm1hdCIsInN0eWxlIiwiZm9ybWF0IiwidmFsaWRLZXlzIiwiUmVxdWVzdENvbXBsZXhpdHlPcHRpb25zIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsInVucmVnaXN0ZXJSYXRlTGltaXRlcnMiLCJpIiwicmF0ZUxpbWl0cyIsImxpbWl0IiwiY2xvdWQiLCJzcGxpY2UiLCJpbnZhbGlkTGlua1VSTCIsImludmFsaWRMaW5rIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGluayIsImxpbmtTZW5kU3VjY2Vzc1VSTCIsImxpbmtTZW5kU3VjY2VzcyIsImxpbmtTZW5kRmFpbFVSTCIsImxpbmtTZW5kRmFpbCIsInZlcmlmeUVtYWlsU3VjY2Vzc1VSTCIsInZlcmlmeUVtYWlsU3VjY2VzcyIsImNob29zZVBhc3N3b3JkVVJMIiwiY2hvb3NlUGFzc3dvcmQiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3MiLCJwYXJzZUZyYW1lVVJMIiwidmVyaWZ5RW1haWxVUkwiLCJsb2FkTWFzdGVyS2V5IiwidHRsSXNFbXB0eSIsIm1hc3RlcktleVR0bCIsImlzRXhwaXJlZCIsIm1hc3RlcktleUNhY2hlIiwiZXhwaXJlc0F0Iiwic2VydmVyQ29uZmlnIiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vc3JjL0NvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIENvbmZpZyBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgaG93IGEgc3BlY2lmaWMgYXBwIGlzXG4vLyBjb25maWd1cmVkLlxuLy8gbW91bnQgaXMgdGhlIFVSTCBmb3IgdGhlIHJvb3Qgb2YgdGhlIEFQSTsgaW5jbHVkZXMgaHR0cCwgZG9tYWluLCBldGMuXG5cbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBsb2dMZXZlbHMgYXMgdmFsaWRMb2dMZXZlbHMgfSBmcm9tICcuL0NvbnRyb2xsZXJzL0xvZ2dlckNvbnRyb2xsZXInO1xuaW1wb3J0IHsgdmVyc2lvbiB9IGZyb20gJy4uL3BhY2thZ2UuanNvbic7XG5pbXBvcnQge1xuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIERhdGFiYXNlT3B0aW9ucyxcbiAgRmlsZVVwbG9hZE9wdGlvbnMsXG4gIElkZW1wb3RlbmN5T3B0aW9ucyxcbiAgTGl2ZVF1ZXJ5T3B0aW9ucyxcbiAgTG9nTGV2ZWxzLFxuICBQYWdlc09wdGlvbnMsXG4gIFBhcnNlU2VydmVyT3B0aW9ucyxcbiAgUmVxdWVzdENvbXBsZXhpdHlPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxuICBTZWN1cml0eU9wdGlvbnMsXG59IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgUGFyc2VTZXJ2ZXIgZnJvbSAnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcic7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG4vKipcbiAqIENvbmZpZyBrZXlzIHRoYXQgbmVlZCB0byBiZSBsb2FkZWQgYXN5bmNocm9ub3VzbHkuXG4gKi9cbmNvbnN0IGFzeW5jS2V5cyA9IFsncHVibGljU2VydmVyVVJMJ107XG5cbmV4cG9ydCBjbGFzcyBDb25maWcge1xuICBzdGF0aWMgZ2V0KGFwcGxpY2F0aW9uSWQ6IHN0cmluZywgbW91bnQ6IHN0cmluZykge1xuICAgIGNvbnN0IGNhY2hlSW5mbyA9IEFwcENhY2hlLmdldChhcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIWNhY2hlSW5mbykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjb25maWcgPSBuZXcgQ29uZmlnKCk7XG4gICAgY29uZmlnLmFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkO1xuICAgIE9iamVjdC5rZXlzKGNhY2hlSW5mbykuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSAhPSAnZGF0YWJhc2VDb250cm9sbGVyJyAmJiBrZXkgIT0gJ2RhdGFiYXNlJykge1xuICAgICAgICBjb25maWdba2V5XSA9IGNhY2hlSW5mb1trZXldO1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vIEFsd2F5cyBjcmVhdGUgYSBuZXcgZGF0YWJhc2UgY29udHJvbGxlciwgYXMgaXQgaG9sZHMgcmVxdWVzdC1zY29wZWQgc3RhdGUgc3VjaCBhcyB0aGVcbiAgICAvLyB0cmFuc2FjdGlvbmFsIHNlc3Npb247IGEgcmVxdWVzdC1zY29wZWQgY29uZmlnIGluIHRoZSBjYWNoZSBoYXMgYGRhdGFiYXNlYCBpbnN0ZWFkIG9mXG4gICAgLy8gYGRhdGFiYXNlQ29udHJvbGxlcmBcbiAgICBjb25zdCBkYXRhYmFzZUNvbnRyb2xsZXIgPSBjYWNoZUluZm8uZGF0YWJhc2VDb250cm9sbGVyIHx8IGNhY2hlSW5mby5kYXRhYmFzZTtcbiAgICBpZiAoZGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgICBjb25maWcuZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2VDb250cm9sbGVyKGRhdGFiYXNlQ29udHJvbGxlci5hZGFwdGVyLCBjb25maWcpO1xuICAgIH1cbiAgICBjb25maWcubW91bnQgPSByZW1vdmVUcmFpbGluZ1NsYXNoKG1vdW50KTtcbiAgICBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdC5iaW5kKGNvbmZpZyk7XG4gICAgY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQuYmluZChcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgY29uZmlnLnZlcnNpb24gPSB2ZXJzaW9uO1xuICAgIHJldHVybiBjb25maWc7XG4gIH1cblxuICBhc3luYyBsb2FkS2V5cygpIHtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIGFzeW5jS2V5cy5tYXAoYXN5bmMga2V5ID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzW2BfJHtrZXl9YF0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpc1trZXldID0gYXdhaXQgdGhpc1tgXyR7a2V5fWBdKCk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHJlc29sdmUgYXN5bmMgY29uZmlnIGtleSAnJHtrZXl9JzogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuXG4gICAgY29uc3QgY2FjaGVkQ29uZmlnID0gQXBwQ2FjaGUuZ2V0KHRoaXMuYXBwSWQpO1xuICAgIGlmIChjYWNoZWRDb25maWcpIHtcbiAgICAgIGNvbnN0IHVwZGF0ZWRDb25maWcgPSB7IC4uLmNhY2hlZENvbmZpZyB9O1xuICAgICAgYXN5bmNLZXlzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgdXBkYXRlZENvbmZpZ1trZXldID0gdGhpc1trZXldO1xuICAgICAgfSk7XG4gICAgICBBcHBDYWNoZS5wdXQodGhpcy5hcHBJZCwgdXBkYXRlZENvbmZpZyk7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHRyYW5zZm9ybUNvbmZpZ3VyYXRpb24oc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHNlcnZlckNvbmZpZ3VyYXRpb24pKSB7XG4gICAgICBpZiAoYXN5bmNLZXlzLmluY2x1ZGVzKGtleSkgJiYgdHlwZW9mIHNlcnZlckNvbmZpZ3VyYXRpb25ba2V5XSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBzZXJ2ZXJDb25maWd1cmF0aW9uW2BfJHtrZXl9YF0gPSBzZXJ2ZXJDb25maWd1cmF0aW9uW2tleV07XG4gICAgICAgIGRlbGV0ZSBzZXJ2ZXJDb25maWd1cmF0aW9uW2tleV07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHB1dChzZXJ2ZXJDb25maWd1cmF0aW9uKSB7XG4gICAgQ29uZmlnLnZhbGlkYXRlT3B0aW9ucyhzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcudmFsaWRhdGVDb250cm9sbGVycyhzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcudHJhbnNmb3JtQ29uZmlndXJhdGlvbihzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBBcHBDYWNoZS5wdXQoc2VydmVyQ29uZmlndXJhdGlvbi5hcHBJZCwgc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnNldHVwUGFzc3dvcmRWYWxpZGF0b3Ioc2VydmVyQ29uZmlndXJhdGlvbi5wYXNzd29yZFBvbGljeSk7XG4gICAgcmV0dXJuIHNlcnZlckNvbmZpZ3VyYXRpb247XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVPcHRpb25zKHtcbiAgICBjdXN0b21QYWdlcyxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCxcbiAgICBleHBpcmVJbmFjdGl2ZVNlc3Npb25zLFxuICAgIHNlc3Npb25MZW5ndGgsXG4gICAgZGVmYXVsdExpbWl0LFxuICAgIG1heExpbWl0LFxuICAgIGFjY291bnRMb2Nrb3V0LFxuICAgIHBhc3N3b3JkUG9saWN5LFxuICAgIG1hc3RlcktleUlwcyxcbiAgICBtYXN0ZXJLZXksXG4gICAgbWFpbnRlbmFuY2VLZXksXG4gICAgbWFpbnRlbmFuY2VLZXlJcHMsXG4gICAgcmVhZE9ubHlNYXN0ZXJLZXksXG4gICAgYWxsb3dIZWFkZXJzLFxuICAgIGlkZW1wb3RlbmN5T3B0aW9ucyxcbiAgICBmaWxlVXBsb2FkLFxuICAgIHBhZ2VzLFxuICAgIHNlY3VyaXR5LFxuICAgIGVuZm9yY2VQcml2YXRlVXNlcnMsXG4gICAgZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMsXG4gICAgc2NoZW1hLFxuICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QsXG4gICAgYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbixcbiAgICBsb2dMZXZlbHMsXG4gICAgcmF0ZUxpbWl0LFxuICAgIHJlcXVlc3RDb21wbGV4aXR5LFxuICAgIGRhdGFiYXNlT3B0aW9ucyxcbiAgICBleHRlbmRTZXNzaW9uT25Vc2UsXG4gICAgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uLFxuICAgIGxpdmVRdWVyeSxcbiAgfSkge1xuICAgIGlmIChtYXN0ZXJLZXkgPT09IHJlYWRPbmx5TWFzdGVyS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgcmVhZE9ubHlNYXN0ZXJLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIGlmIChtYXN0ZXJLZXkgPT09IG1haW50ZW5hbmNlS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgbWFpbnRlbmFuY2VLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCk7XG4gICAgdGhpcy52YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KTtcbiAgICB0aGlzLnZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCk7XG5cbiAgICBpZiAodHlwZW9mIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ3Jldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZXh0ZW5kU2Vzc2lvbk9uVXNlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdleHRlbmRTZXNzaW9uT25Vc2UgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVQdWJsaWNTZXJ2ZXJVUkwoeyBwdWJsaWNTZXJ2ZXJVUkwgfSk7XG4gICAgdGhpcy52YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVJcHMoJ21hc3RlcktleUlwcycsIG1hc3RlcktleUlwcyk7XG4gICAgdGhpcy52YWxpZGF0ZUlwcygnbWFpbnRlbmFuY2VLZXlJcHMnLCBtYWludGVuYW5jZUtleUlwcyk7XG4gICAgdGhpcy52YWxpZGF0ZURlZmF1bHRMaW1pdChkZWZhdWx0TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMoaWRlbXBvdGVuY3lPcHRpb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlUGFnZXNPcHRpb25zKHBhZ2VzKTtcbiAgICB0aGlzLnZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KTtcbiAgICB0aGlzLnZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWEpO1xuICAgIHRoaXMudmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzKGVuZm9yY2VQcml2YXRlVXNlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVFbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyhlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4oYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbik7XG4gICAgdGhpcy52YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCk7XG4gICAgdGhpcy52YWxpZGF0ZVJhdGVMaW1pdChyYXRlTGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVSZXF1ZXN0Q29tcGxleGl0eShyZXF1ZXN0Q29tcGxleGl0eSk7XG4gICAgdGhpcy52YWxpZGF0ZUxvZ0xldmVscyhsb2dMZXZlbHMpO1xuICAgIHRoaXMudmFsaWRhdGVEYXRhYmFzZU9wdGlvbnMoZGF0YWJhc2VPcHRpb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlQ3VzdG9tUGFnZXMoY3VzdG9tUGFnZXMpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0NsaWVudENsYXNzQ3JlYXRpb24oYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uKTtcbiAgICB0aGlzLnZhbGlkYXRlTGl2ZVF1ZXJ5T3B0aW9ucyhsaXZlUXVlcnkpO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQ3VzdG9tUGFnZXMoY3VzdG9tUGFnZXMpIHtcbiAgICBpZiAoIWN1c3RvbVBhZ2VzKSB7IHJldHVybjsgfVxuXG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjdXN0b21QYWdlcykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyBFcnJvcignUGFyc2UgU2VydmVyIG9wdGlvbiBjdXN0b21QYWdlcyBtdXN0IGJlIGFuIG9iamVjdC4nKTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVDb250cm9sbGVycyh7XG4gICAgdmVyaWZ5VXNlckVtYWlscyxcbiAgICB1c2VyQ29udHJvbGxlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICBfcHVibGljU2VydmVyVVJMLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgZW1haWxWZXJpZnlTdWNjZXNzT25JbnZhbGlkRW1haWwsXG4gIH0pIHtcbiAgICBjb25zdCBlbWFpbEFkYXB0ZXIgPSB1c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICAgIGlmICh2ZXJpZnlVc2VyRW1haWxzKSB7XG4gICAgICB0aGlzLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyLFxuICAgICAgICBhcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHB1YmxpY1NlcnZlclVSTCB8fCBfcHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgICAgZW1haWxWZXJpZnlTdWNjZXNzT25JbnZhbGlkRW1haWwsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICBpZiAocmVxdWVzdEtleXdvcmREZW55bGlzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0ID0gcmVxdWVzdEtleXdvcmREZW55bGlzdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkocmVxdWVzdEtleXdvcmREZW55bGlzdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgIGlmICh0eXBlb2YgZW5mb3JjZVByaXZhdGVVc2VycyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBlbmZvcmNlUHJpdmF0ZVVzZXJzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbihhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgaWYgKHR5cGVvZiBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4gbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0NsaWVudENsYXNzQ3JlYXRpb24oYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uKSB7XG4gICAgaWYgKHR5cGVvZiBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzZWN1cml0eSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2suZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2spKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVjayBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2tMb2cuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVja0xvZyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hOiBTY2hlbWFPcHRpb25zKSB7XG4gICAgaWYgKCFzY2hlbWEpIHsgcmV0dXJuOyB9XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzY2hlbWEpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuZGVmaW5pdGlvbnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmRlZmluaXRpb25zID0gU2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkoc2NoZW1hLmRlZmluaXRpb25zKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlZmluaXRpb25zIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5zdHJpY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnN0cmljdCA9IFNjaGVtYU9wdGlvbnMuc3RyaWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5zdHJpY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuc3RyaWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID0gU2NoZW1hT3B0aW9ucy5kZWxldGVFeHRyYUZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzID0gU2NoZW1hT3B0aW9ucy5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5sb2NrU2NoZW1hcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEubG9ja1NjaGVtYXMgPSBTY2hlbWFPcHRpb25zLmxvY2tTY2hlbWFzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5sb2NrU2NoZW1hcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5sb2NrU2NoZW1hcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYmVmb3JlTWlncmF0aW9uID0gbnVsbDtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmFmdGVyTWlncmF0aW9uID0gbnVsbDtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFnZXNPcHRpb25zKHBhZ2VzKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlUm91dGVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlciA9IFBhZ2VzT3B0aW9ucy5lbmFibGVSb3V0ZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlUm91dGVyKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlUm91dGVyIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID0gUGFnZXNPcHRpb25zLmVuYWJsZUxvY2FsaXphdGlvbi5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24pKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkpzb25QYXRoLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZS5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGxhY2Vob2xkZXJzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBsYWNlaG9sZGVycyA9IFBhZ2VzT3B0aW9ucy5wbGFjZWhvbGRlcnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLnBsYWNlaG9sZGVycykgIT09ICdbb2JqZWN0IE9iamVjdF0nICYmXG4gICAgICB0eXBlb2YgcGFnZXMucGxhY2Vob2xkZXJzICE9PSAnZnVuY3Rpb24nXG4gICAgKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wbGFjZWhvbGRlcnMgbXVzdCBiZSBhbiBvYmplY3Qgb3IgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZm9yY2VSZWRpcmVjdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5mb3JjZVJlZGlyZWN0ID0gUGFnZXNPcHRpb25zLmZvcmNlUmVkaXJlY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZm9yY2VSZWRpcmVjdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmZvcmNlUmVkaXJlY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBhZ2VzUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc1BhdGggPSBQYWdlc09wdGlvbnMucGFnZXNQYXRoLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMucGFnZXNQYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNQYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNFbmRwb2ludCA9IFBhZ2VzT3B0aW9ucy5wYWdlc0VuZHBvaW50LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMucGFnZXNFbmRwb2ludCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tVXJscyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5jdXN0b21VcmxzID0gUGFnZXNPcHRpb25zLmN1c3RvbVVybHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5jdXN0b21VcmxzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVVybHMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVJvdXRlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5jdXN0b21Sb3V0ZXMgPSBQYWdlc09wdGlvbnMuY3VzdG9tUm91dGVzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghKHBhZ2VzLmN1c3RvbVJvdXRlcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tUm91dGVzIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMoaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9IElkZW1wb3RlbmN5T3B0aW9ucy50dGwuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSAmJiBpZGVtcG90ZW5jeU9wdGlvbnMudHRsIDw9IDApIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBncmVhdGVyIHRoYW4gMCBzZWNvbmRzJztcbiAgICB9IGVsc2UgaWYgKGlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgYSBudW1iZXInO1xuICAgIH1cbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocykge1xuICAgICAgaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzID0gSWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghKGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IHBhdGhzIG11c3QgYmUgb2YgYW4gYXJyYXkgb2Ygc3RyaW5ncyc7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpIHtcbiAgICBpZiAoYWNjb3VudExvY2tvdXQpIHtcbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uICE9PSAnbnVtYmVyJyB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA8PSAwIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uID4gOTk5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IGR1cmF0aW9uIHNob3VsZCBiZSBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAwMCc7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgIU51bWJlci5pc0ludGVnZXIoYWNjb3VudExvY2tvdXQudGhyZXNob2xkKSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPCAxIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA+IDk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgdGhyZXNob2xkIHNob3VsZCBiZSBhbiBpbnRlZ2VyIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMCc7XG4gICAgICB9XG5cbiAgICAgIGlmIChhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQgPSBBY2NvdW50TG9ja291dE9wdGlvbnMudW5sb2NrT25QYXNzd29yZFJlc2V0LmRlZmF1bHQ7XG4gICAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0KSkge1xuICAgICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSkge1xuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09ICdudW1iZXInIHx8IHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIDwgMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSAnbnVtYmVyJyB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIDw9IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybikge1xuICAgICAgICBpZiAodHlwZW9mIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9IG5ldyBSZWdFeHAocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybik7XG4gICAgICAgIH0gZWxzZSBpZiAoIShwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIGluc3RhbmNlb2YgUmVnRXhwKSkge1xuICAgICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIG11c3QgYmUgYSByZWdleCBzdHJpbmcgb3IgUmVnRXhwIG9iamVjdC4nO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICE9PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ICYmXG4gICAgICAgICghTnVtYmVyLmlzSW50ZWdlcihwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IDw9IDAgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPiAyMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IG11c3QgYmUgYW4gaW50ZWdlciByYW5naW5nIDAgLSAyMCc7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Jlc2V0VG9rZW5SZXVzZUlmVmFsaWQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgICAgfVxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiYgIXBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICAgIHRocm93ICdZb3UgY2Fubm90IHVzZSByZXNldFRva2VuUmV1c2VJZlZhbGlkIHdpdGhvdXQgcmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Jlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIGlzIGNvbmZpZ3VyZWQgdGhlbiBzZXR1cCBhIGNhbGxiYWNrIHRvIHByb2Nlc3MgdGhlIHBhdHRlcm5cbiAgc3RhdGljIHNldHVwUGFzc3dvcmRWYWxpZGF0b3IocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kgJiYgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybikge1xuICAgICAgcGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciA9IHZhbHVlID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4udGVzdCh2YWx1ZSk7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVB1YmxpY1NlcnZlclVSTCh7IHB1YmxpY1NlcnZlclVSTCwgcmVxdWlyZWQgPSBmYWxzZSB9KSB7XG4gICAgaWYgKCFwdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIGlmICghcmVxdWlyZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhyb3cgJ1RoZSBvcHRpb24gcHVibGljU2VydmVyVVJMIGlzIHJlcXVpcmVkLic7XG4gICAgfVxuXG4gICAgY29uc3QgdHlwZSA9IHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkw7XG5cbiAgICBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmICghcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSAmJiAhcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgdGhyb3cgJ1RoZSBvcHRpb24gcHVibGljU2VydmVyVVJMIG11c3QgYmUgYSB2YWxpZCBVUkwgc3RhcnRpbmcgd2l0aCBodHRwOi8vIG9yIGh0dHBzOi8vLic7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHR5cGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aHJvdyBgVGhlIG9wdGlvbiBwdWJsaWNTZXJ2ZXJVUkwgbXVzdCBiZSBhIHN0cmluZyBvciBmdW5jdGlvbiwgYnV0IGdvdCAke3R5cGV9LmA7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgIGVtYWlsQWRhcHRlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgIGVtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsLFxuICB9KSB7XG4gICAgaWYgKCFlbWFpbEFkYXB0ZXIpIHtcbiAgICAgIHRocm93ICdBbiBlbWFpbEFkYXB0ZXIgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGFwcE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQW4gYXBwIG5hbWUgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICB0aGlzLnZhbGlkYXRlUHVibGljU2VydmVyVVJMKHsgcHVibGljU2VydmVyVVJMLCByZXF1aXJlZDogdHJ1ZSB9KTtcbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIGlmIChpc05hTihlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikpIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgdHlwZW9mIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2VtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiAhZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHRocm93ICdZb3UgY2Fubm90IHVzZSBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIHdpdGhvdXQgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24nO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlTdWNjZXNzT25JbnZhbGlkRW1haWwgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlTdWNjZXNzT25JbnZhbGlkRW1haWwgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2VtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChmaWxlVXBsb2FkID09IG51bGwgfHwgdHlwZW9mIGZpbGVVcGxvYWQgIT09ICdvYmplY3QnIHx8IGZpbGVVcGxvYWQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICB0aHJvdyAnZmlsZVVwbG9hZCBtdXN0IGJlIGFuIG9iamVjdCB2YWx1ZS4nO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgUmVmZXJlbmNlRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBbm9ueW1vdXNVc2VyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yUHVibGljLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucyA9IEZpbGVVcGxvYWRPcHRpb25zLmZpbGVFeHRlbnNpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zKSkge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlwcyhmaWVsZCwgbWFzdGVyS2V5SXBzKSB7XG4gICAgZm9yIChsZXQgaXAgb2YgbWFzdGVyS2V5SXBzKSB7XG4gICAgICBpZiAoaXAuaW5jbHVkZXMoJy8nKSkge1xuICAgICAgICBpcCA9IGlwLnNwbGl0KCcvJylbMF07XG4gICAgICB9XG4gICAgICBpZiAoIW5ldC5pc0lQKGlwKSkge1xuICAgICAgICB0aHJvdyBgVGhlIFBhcnNlIFNlcnZlciBvcHRpb24gXCIke2ZpZWxkfVwiIGNvbnRhaW5zIGFuIGludmFsaWQgSVAgYWRkcmVzcyBcIiR7aXB9XCIuYDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyhlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycykge1xuICAgIGlmIChlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyAmJiB0eXBlb2YgZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKGVuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzKSB7XG4gICAgICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7IHVzYWdlOiAnaW5zZWN1cmUgYWRhcHRlcicgfSk7XG4gICAgfVxuICB9XG5cbiAgZ2V0IG1vdW50KCkge1xuICAgIHZhciBtb3VudCA9IHRoaXMuX21vdW50O1xuICAgIGlmICh0aGlzLnB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgbW91bnQgPSB0aGlzLnB1YmxpY1NlcnZlclVSTDtcbiAgICB9XG4gICAgcmV0dXJuIG1vdW50O1xuICB9XG5cbiAgc2V0IG1vdW50KG5ld1ZhbHVlKSB7XG4gICAgdGhpcy5fbW91bnQgPSBuZXdWYWx1ZTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICBpZiAoZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgICAgaWYgKGlzTmFOKHNlc3Npb25MZW5ndGgpKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKHNlc3Npb25MZW5ndGggPD0gMCkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRGVmYXVsdExpbWl0KGRlZmF1bHRMaW1pdCkge1xuICAgIGlmIChkZWZhdWx0TGltaXQgPT0gbnVsbCkge1xuICAgICAgZGVmYXVsdExpbWl0ID0gUGFyc2VTZXJ2ZXJPcHRpb25zLmRlZmF1bHRMaW1pdC5kZWZhdWx0O1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGRlZmF1bHRMaW1pdCAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93ICdEZWZhdWx0IGxpbWl0IG11c3QgYmUgYSBudW1iZXIuJztcbiAgICB9XG4gICAgaWYgKGRlZmF1bHRMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnRGVmYXVsdCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCkge1xuICAgIGlmIChtYXhMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnTWF4IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpIHtcbiAgICBpZiAoIVtudWxsLCB1bmRlZmluZWRdLmluY2x1ZGVzKGFsbG93SGVhZGVycykpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGFsbG93SGVhZGVycykpIHtcbiAgICAgICAgYWxsb3dIZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICBpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgb25seSBjb250YWluIHN0cmluZ3MnO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWhlYWRlci50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG5vdCBjb250YWluIGVtcHR5IHN0cmluZ3MnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVMb2dMZXZlbHMobG9nTGV2ZWxzKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoTG9nTGV2ZWxzKSkge1xuICAgICAgaWYgKGxvZ0xldmVsc1trZXldKSB7XG4gICAgICAgIGlmICh2YWxpZExvZ0xldmVscy5pbmRleE9mKGxvZ0xldmVsc1trZXldKSA9PT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBgJyR7a2V5fScgbXVzdCBiZSBvbmUgb2YgJHtKU09OLnN0cmluZ2lmeSh2YWxpZExvZ0xldmVscyl9YDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nTGV2ZWxzW2tleV0gPSBMb2dMZXZlbHNba2V5XS5kZWZhdWx0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyhkYXRhYmFzZU9wdGlvbnMpIHtcbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zID09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGFiYXNlT3B0aW9ucykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zIG11c3QgYmUgYW4gb2JqZWN0YDtcbiAgICB9XG5cbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyA9IERhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICB9XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgPSBEYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsIG11c3QgYmUgYSBudW1iZXJgO1xuICAgIH1cbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zLmFsbG93UHVibGljRXhwbGFpbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnMuYWxsb3dQdWJsaWNFeHBsYWluID0gRGF0YWJhc2VPcHRpb25zLmFsbG93UHVibGljRXhwbGFpbi5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFiYXNlT3B0aW9ucy5hbGxvd1B1YmxpY0V4cGxhaW4gIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgYFBhcnNlIFNlcnZlciBvcHRpb24gJ2RhdGFiYXNlT3B0aW9ucy5hbGxvd1B1YmxpY0V4cGxhaW4nIG11c3QgYmUgYSBib29sZWFuLmA7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTGl2ZVF1ZXJ5T3B0aW9ucyhsaXZlUXVlcnkpIHtcbiAgICBpZiAobGl2ZVF1ZXJ5ID09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAobGl2ZVF1ZXJ5LnJlZ2V4VGltZW91dCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBsaXZlUXVlcnkucmVnZXhUaW1lb3V0ID0gTGl2ZVF1ZXJ5T3B0aW9ucy5yZWdleFRpbWVvdXQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBsaXZlUXVlcnkucmVnZXhUaW1lb3V0ICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgYGxpdmVRdWVyeS5yZWdleFRpbWVvdXQgbXVzdCBiZSBhIG51bWJlcmA7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUmF0ZUxpbWl0KHJhdGVMaW1pdCkge1xuICAgIGlmICghcmF0ZUxpbWl0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChyYXRlTGltaXQpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgIUFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KVxuICAgICkge1xuICAgICAgdGhyb3cgYHJhdGVMaW1pdCBtdXN0IGJlIGFuIGFycmF5IG9yIG9iamVjdGA7XG4gICAgfVxuICAgIGNvbnN0IG9wdGlvbnMgPSBBcnJheS5pc0FycmF5KHJhdGVMaW1pdCkgPyByYXRlTGltaXQgOiBbcmF0ZUxpbWl0XTtcbiAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9wdGlvbikgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQgbXVzdCBiZSBhbiBhcnJheSBvZiBvYmplY3RzYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24ucmVxdWVzdFBhdGggPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RQYXRoIG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0UGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0UGF0aCBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24ucmVxdWVzdFRpbWVXaW5kb3cgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RUaW1lV2luZG93IG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0VGltZVdpbmRvdyAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0VGltZVdpbmRvdyBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24uaW5jbHVkZUludGVybmFsUmVxdWVzdHMgJiYgdHlwZW9mIG9wdGlvbi5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQuaW5jbHVkZUludGVybmFsUmVxdWVzdHMgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0Q291bnQgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RDb3VudCBtdXN0IGJlIGRlZmluZWRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHRpb24ucmVxdWVzdENvdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RDb3VudCBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24uZXJyb3JSZXNwb25zZU1lc3NhZ2UgJiYgdHlwZW9mIG9wdGlvbi5lcnJvclJlc3BvbnNlTWVzc2FnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5lcnJvclJlc3BvbnNlTWVzc2FnZSBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG9wdGlvbnMgPSBPYmplY3Qua2V5cyhQYXJzZVNlcnZlci5SYXRlTGltaXRab25lKTtcbiAgICAgIGlmIChvcHRpb24uem9uZSAmJiAhb3B0aW9ucy5pbmNsdWRlcyhvcHRpb24uem9uZSkpIHtcbiAgICAgICAgY29uc3QgZm9ybWF0dGVyID0gbmV3IEludGwuTGlzdEZvcm1hdCgnZW4nLCB7IHN0eWxlOiAnc2hvcnQnLCB0eXBlOiAnZGlzanVuY3Rpb24nIH0pO1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnpvbmUgbXVzdCBiZSBvbmUgb2YgJHtmb3JtYXR0ZXIuZm9ybWF0KG9wdGlvbnMpfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUmVxdWVzdENvbXBsZXhpdHkocmVxdWVzdENvbXBsZXhpdHkpIHtcbiAgICBpZiAocmVxdWVzdENvbXBsZXhpdHkgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHJlcXVlc3RDb21wbGV4aXR5ICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHJlcXVlc3RDb21wbGV4aXR5KSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZXF1ZXN0Q29tcGxleGl0eSBtdXN0IGJlIGFuIG9iamVjdC4nKTtcbiAgICB9XG4gICAgY29uc3QgdmFsaWRLZXlzID0gT2JqZWN0LmtleXMoUmVxdWVzdENvbXBsZXhpdHlPcHRpb25zKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhyZXF1ZXN0Q29tcGxleGl0eSkpIHtcbiAgICAgIGlmICghdmFsaWRLZXlzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGByZXF1ZXN0Q29tcGxleGl0eSBjb250YWlucyB1bmtub3duIHByb3BlcnR5ICcke2tleX0nLmApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiB2YWxpZEtleXMpIHtcbiAgICAgIGlmIChyZXF1ZXN0Q29tcGxleGl0eVtrZXldICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSByZXF1ZXN0Q29tcGxleGl0eVtrZXldO1xuICAgICAgICBpZiAoIU51bWJlci5pc0ludGVnZXIodmFsdWUpIHx8ICh2YWx1ZSA8IDEgJiYgdmFsdWUgIT09IC0xKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgcmVxdWVzdENvbXBsZXhpdHkuJHtrZXl9IG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyIG9yIC0xIHRvIGRpc2FibGUuYCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcXVlc3RDb21wbGV4aXR5W2tleV0gPSBSZXF1ZXN0Q29tcGxleGl0eU9wdGlvbnNba2V5XS5kZWZhdWx0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMudmVyaWZ5VXNlckVtYWlscyB8fCAhdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMucGFzc3dvcmRQb2xpY3kgfHwgIXRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLmV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5zZXNzaW9uTGVuZ3RoICogMTAwMCk7XG4gIH1cblxuICB1bnJlZ2lzdGVyUmF0ZUxpbWl0ZXJzKCkge1xuICAgIGxldCBpID0gdGhpcy5yYXRlTGltaXRzPy5sZW5ndGg7XG4gICAgd2hpbGUgKGktLSkge1xuICAgICAgY29uc3QgbGltaXQgPSB0aGlzLnJhdGVMaW1pdHNbaV07XG4gICAgICBpZiAobGltaXQuY2xvdWQpIHtcbiAgICAgICAgdGhpcy5yYXRlTGltaXRzLnNwbGljZShpLCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgaW52YWxpZExpbmtVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZExpbmsgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF9saW5rLmh0bWxgO1xuICB9XG5cbiAgZ2V0IGludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRWZXJpZmljYXRpb25MaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX3ZlcmlmaWNhdGlvbl9saW5rLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRTdWNjZXNzIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZEZhaWxVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRGYWlsIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9mYWlsLmh0bWxgO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3ZlcmlmeV9lbWFpbF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBjaG9vc2VQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5jaG9vc2VQYXNzd29yZCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9jaG9vc2VfcGFzc3dvcmRgO1xuICB9XG5cbiAgZ2V0IHJlcXVlc3RSZXNldFBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YDtcbiAgfVxuXG4gIGdldCBwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvcGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFyc2VGcmFtZVVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5wYXJzZUZyYW1lVVJMO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS92ZXJpZnlfZW1haWxgO1xuICB9XG5cbiAgYXN5bmMgbG9hZE1hc3RlcktleSgpIHtcbiAgICBpZiAodHlwZW9mIHRoaXMubWFzdGVyS2V5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCB0dGxJc0VtcHR5ID0gIXRoaXMubWFzdGVyS2V5VHRsO1xuICAgICAgY29uc3QgaXNFeHBpcmVkID0gdGhpcy5tYXN0ZXJLZXlDYWNoZT8uZXhwaXJlc0F0ICYmIHRoaXMubWFzdGVyS2V5Q2FjaGUuZXhwaXJlc0F0IDwgbmV3IERhdGUoKTtcblxuICAgICAgaWYgKCghaXNFeHBpcmVkIHx8IHR0bElzRW1wdHkpICYmIHRoaXMubWFzdGVyS2V5Q2FjaGU/Lm1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gdGhpcy5tYXN0ZXJLZXlDYWNoZS5tYXN0ZXJLZXk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG1hc3RlcktleSA9IGF3YWl0IHRoaXMubWFzdGVyS2V5KCk7XG5cbiAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IHRoaXMubWFzdGVyS2V5VHRsID8gbmV3IERhdGUoRGF0ZS5ub3coKSArIDEwMDAgKiB0aGlzLm1hc3RlcktleVR0bCkgOiBudWxsXG4gICAgICB0aGlzLm1hc3RlcktleUNhY2hlID0geyBtYXN0ZXJLZXksIGV4cGlyZXNBdCB9O1xuICAgICAgLy8gVXBkYXRlIG9ubHkgdGhlIGNhY2hlZCBzZXJ2ZXIgY29uZmlnLCBhcyB0aGlzIGNvbmZpZyBpcyByZXF1ZXN0LXNjb3BlZFxuICAgICAgY29uc3Qgc2VydmVyQ29uZmlnID0gQXBwQ2FjaGUuZ2V0KHRoaXMuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAoc2VydmVyQ29uZmlnKSB7XG4gICAgICAgIHNlcnZlckNvbmZpZy5tYXN0ZXJLZXlDYWNoZSA9IHRoaXMubWFzdGVyS2V5Q2FjaGU7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLm1hc3RlcktleUNhY2hlLm1hc3RlcktleTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5tYXN0ZXJLZXk7XG4gIH1cblxuICAvLyBUT0RPOiBSZW1vdmUgdGhpcyBmdW5jdGlvbiBvbmNlIFBhZ2VzUm91dGVyIHJlcGxhY2VzIHRoZSBQdWJsaWNBUElSb3V0ZXI7XG4gIC8vIHRoZSAoZGVmYXVsdCkgZW5kcG9pbnQgaGFzIHRvIGJlIGRlZmluZWQgaW4gUGFnZXNSb3V0ZXIgb25seS5cbiAgZ2V0IHBhZ2VzRW5kcG9pbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMucGFnZXMgJiYgdGhpcy5wYWdlcy5lbmFibGVSb3V0ZXIgJiYgdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA/IHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgOiAnYXBwcyc7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQ29uZmlnO1xubW9kdWxlLmV4cG9ydHMgPSBDb25maWc7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUlBLElBQUFBLE9BQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLElBQUEsR0FB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