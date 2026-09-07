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
      Config.put(this);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwicmVxdWlyZSIsIl9uZXQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2NhY2hlIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX3BhY2thZ2UiLCJfRGVmaW5pdGlvbnMiLCJfUGFyc2UiLCJfRGVwcmVjYXRvciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsInJlbW92ZVRyYWlsaW5nU2xhc2giLCJzdHIiLCJlbmRzV2l0aCIsInN1YnN0cmluZyIsImxlbmd0aCIsImFzeW5jS2V5cyIsIkNvbmZpZyIsImdldCIsImFwcGxpY2F0aW9uSWQiLCJtb3VudCIsImNhY2hlSW5mbyIsIkFwcENhY2hlIiwiY29uZmlnIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJrZXkiLCJkYXRhYmFzZSIsIkRhdGFiYXNlQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImFkYXB0ZXIiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJiaW5kIiwiZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0IiwidmVyc2lvbiIsImxvYWRLZXlzIiwiUHJvbWlzZSIsImFsbCIsIm1hcCIsImVycm9yIiwiRXJyb3IiLCJtZXNzYWdlIiwiY2FjaGVkQ29uZmlnIiwiYXBwSWQiLCJ1cGRhdGVkQ29uZmlnIiwicHV0IiwidHJhbnNmb3JtQ29uZmlndXJhdGlvbiIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJpbmNsdWRlcyIsInZhbGlkYXRlT3B0aW9ucyIsInZhbGlkYXRlQ29udHJvbGxlcnMiLCJzZXR1cFBhc3N3b3JkVmFsaWRhdG9yIiwicGFzc3dvcmRQb2xpY3kiLCJjdXN0b21QYWdlcyIsInB1YmxpY1NlcnZlclVSTCIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJleHBpcmVJbmFjdGl2ZVNlc3Npb25zIiwic2Vzc2lvbkxlbmd0aCIsImRlZmF1bHRMaW1pdCIsIm1heExpbWl0IiwiYWNjb3VudExvY2tvdXQiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsIm1haW50ZW5hbmNlS2V5SXBzIiwicmVhZE9ubHlNYXN0ZXJLZXkiLCJhbGxvd0hlYWRlcnMiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJmaWxlVXBsb2FkIiwicGFnZXMiLCJzZWN1cml0eSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyIsInNjaGVtYSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwibG9nTGV2ZWxzIiwicmF0ZUxpbWl0IiwicmVxdWVzdENvbXBsZXhpdHkiLCJkYXRhYmFzZU9wdGlvbnMiLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJsaXZlUXVlcnkiLCJ2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5IiwidmFsaWRhdGVQYXNzd29yZFBvbGljeSIsInZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMiLCJ2YWxpZGF0ZVB1YmxpY1NlcnZlclVSTCIsInZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZUlwcyIsInZhbGlkYXRlRGVmYXVsdExpbWl0IiwidmFsaWRhdGVNYXhMaW1pdCIsInZhbGlkYXRlQWxsb3dIZWFkZXJzIiwidmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMiLCJ2YWxpZGF0ZVBhZ2VzT3B0aW9ucyIsInZhbGlkYXRlU2VjdXJpdHlPcHRpb25zIiwidmFsaWRhdGVTY2hlbWFPcHRpb25zIiwidmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzIiwidmFsaWRhdGVFbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyIsInZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInZhbGlkYXRlUmF0ZUxpbWl0IiwidmFsaWRhdGVSZXF1ZXN0Q29tcGxleGl0eSIsInZhbGlkYXRlTG9nTGV2ZWxzIiwidmFsaWRhdGVEYXRhYmFzZU9wdGlvbnMiLCJ2YWxpZGF0ZUN1c3RvbVBhZ2VzIiwidmFsaWRhdGVBbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJ2YWxpZGF0ZUxpdmVRdWVyeU9wdGlvbnMiLCJwcm90b3R5cGUiLCJ0b1N0cmluZyIsImNhbGwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwidXNlckNvbnRyb2xsZXIiLCJhcHBOYW1lIiwiX3B1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImVtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsIiwiZW1haWxBZGFwdGVyIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJ1bmRlZmluZWQiLCJBcnJheSIsImlzQXJyYXkiLCJlbmFibGVDaGVjayIsIlNlY3VyaXR5T3B0aW9ucyIsImlzQm9vbGVhbiIsImVuYWJsZUNoZWNrTG9nIiwiZGVmaW5pdGlvbnMiLCJTY2hlbWFPcHRpb25zIiwic3RyaWN0IiwiZGVsZXRlRXh0cmFGaWVsZHMiLCJyZWNyZWF0ZU1vZGlmaWVkRmllbGRzIiwibG9ja1NjaGVtYXMiLCJiZWZvcmVNaWdyYXRpb24iLCJhZnRlck1pZ3JhdGlvbiIsImVuYWJsZVJvdXRlciIsIlBhZ2VzT3B0aW9ucyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiaXNTdHJpbmciLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsInBsYWNlaG9sZGVycyIsImZvcmNlUmVkaXJlY3QiLCJwYWdlc1BhdGgiLCJwYWdlc0VuZHBvaW50IiwiY3VzdG9tVXJscyIsImN1c3RvbVJvdXRlcyIsInR0bCIsIklkZW1wb3RlbmN5T3B0aW9ucyIsImlzTmFOIiwicGF0aHMiLCJkdXJhdGlvbiIsIk51bWJlciIsImlzSW50ZWdlciIsInRocmVzaG9sZCIsInVubG9ja09uUGFzc3dvcmRSZXNldCIsIkFjY291bnRMb2Nrb3V0T3B0aW9ucyIsIm1heFBhc3N3b3JkQWdlIiwicmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJ2YWxpZGF0b3JQYXR0ZXJuIiwiUmVnRXhwIiwidmFsaWRhdG9yQ2FsbGJhY2siLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWx1ZSIsInRlc3QiLCJyZXF1aXJlZCIsInR5cGUiLCJzdGFydHNXaXRoIiwiUmVmZXJlbmNlRXJyb3IiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRmlsZVVwbG9hZE9wdGlvbnMiLCJlbmFibGVGb3JQdWJsaWMiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImZpbGVFeHRlbnNpb25zIiwiZmllbGQiLCJpcCIsInNwbGl0IiwibmV0IiwiaXNJUCIsIkRlcHJlY2F0b3IiLCJsb2dSdW50aW1lRGVwcmVjYXRpb24iLCJ1c2FnZSIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaGVhZGVyIiwidHJpbSIsIkxvZ0xldmVscyIsInZhbGlkTG9nTGV2ZWxzIiwiaW5kZXhPZiIsIkpTT04iLCJzdHJpbmdpZnkiLCJlbmFibGVTY2hlbWFIb29rcyIsIkRhdGFiYXNlT3B0aW9ucyIsInNjaGVtYUNhY2hlVHRsIiwiYWxsb3dQdWJsaWNFeHBsYWluIiwicmVnZXhUaW1lb3V0IiwiTGl2ZVF1ZXJ5T3B0aW9ucyIsIm9wdGlvbnMiLCJvcHRpb24iLCJyZXF1ZXN0UGF0aCIsInJlcXVlc3RUaW1lV2luZG93IiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsIlBhcnNlU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsInpvbmUiLCJmb3JtYXR0ZXIiLCJJbnRsIiwiTGlzdEZvcm1hdCIsInN0eWxlIiwiZm9ybWF0IiwidmFsaWRLZXlzIiwiUmVxdWVzdENvbXBsZXhpdHlPcHRpb25zIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsInVucmVnaXN0ZXJSYXRlTGltaXRlcnMiLCJpIiwicmF0ZUxpbWl0cyIsImxpbWl0IiwiY2xvdWQiLCJzcGxpY2UiLCJpbnZhbGlkTGlua1VSTCIsImludmFsaWRMaW5rIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGluayIsImxpbmtTZW5kU3VjY2Vzc1VSTCIsImxpbmtTZW5kU3VjY2VzcyIsImxpbmtTZW5kRmFpbFVSTCIsImxpbmtTZW5kRmFpbCIsInZlcmlmeUVtYWlsU3VjY2Vzc1VSTCIsInZlcmlmeUVtYWlsU3VjY2VzcyIsImNob29zZVBhc3N3b3JkVVJMIiwiY2hvb3NlUGFzc3dvcmQiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3MiLCJwYXJzZUZyYW1lVVJMIiwidmVyaWZ5RW1haWxVUkwiLCJsb2FkTWFzdGVyS2V5IiwidHRsSXNFbXB0eSIsIm1hc3RlcktleVR0bCIsImlzRXhwaXJlZCIsIm1hc3RlcktleUNhY2hlIiwiZXhwaXJlc0F0IiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vc3JjL0NvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIENvbmZpZyBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgaG93IGEgc3BlY2lmaWMgYXBwIGlzXG4vLyBjb25maWd1cmVkLlxuLy8gbW91bnQgaXMgdGhlIFVSTCBmb3IgdGhlIHJvb3Qgb2YgdGhlIEFQSTsgaW5jbHVkZXMgaHR0cCwgZG9tYWluLCBldGMuXG5cbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBsb2dMZXZlbHMgYXMgdmFsaWRMb2dMZXZlbHMgfSBmcm9tICcuL0NvbnRyb2xsZXJzL0xvZ2dlckNvbnRyb2xsZXInO1xuaW1wb3J0IHsgdmVyc2lvbiB9IGZyb20gJy4uL3BhY2thZ2UuanNvbic7XG5pbXBvcnQge1xuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIERhdGFiYXNlT3B0aW9ucyxcbiAgRmlsZVVwbG9hZE9wdGlvbnMsXG4gIElkZW1wb3RlbmN5T3B0aW9ucyxcbiAgTGl2ZVF1ZXJ5T3B0aW9ucyxcbiAgTG9nTGV2ZWxzLFxuICBQYWdlc09wdGlvbnMsXG4gIFBhcnNlU2VydmVyT3B0aW9ucyxcbiAgUmVxdWVzdENvbXBsZXhpdHlPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxuICBTZWN1cml0eU9wdGlvbnMsXG59IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgUGFyc2VTZXJ2ZXIgZnJvbSAnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcic7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG4vKipcbiAqIENvbmZpZyBrZXlzIHRoYXQgbmVlZCB0byBiZSBsb2FkZWQgYXN5bmNocm9ub3VzbHkuXG4gKi9cbmNvbnN0IGFzeW5jS2V5cyA9IFsncHVibGljU2VydmVyVVJMJ107XG5cbmV4cG9ydCBjbGFzcyBDb25maWcge1xuICBzdGF0aWMgZ2V0KGFwcGxpY2F0aW9uSWQ6IHN0cmluZywgbW91bnQ6IHN0cmluZykge1xuICAgIGNvbnN0IGNhY2hlSW5mbyA9IEFwcENhY2hlLmdldChhcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIWNhY2hlSW5mbykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjb25maWcgPSBuZXcgQ29uZmlnKCk7XG4gICAgY29uZmlnLmFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkO1xuICAgIE9iamVjdC5rZXlzKGNhY2hlSW5mbykuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PSAnZGF0YWJhc2VDb250cm9sbGVyJykge1xuICAgICAgICBjb25maWcuZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2VDb250cm9sbGVyKGNhY2hlSW5mby5kYXRhYmFzZUNvbnRyb2xsZXIuYWRhcHRlciwgY29uZmlnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbmZpZ1trZXldID0gY2FjaGVJbmZvW2tleV07XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uZmlnLm1vdW50ID0gcmVtb3ZlVHJhaWxpbmdTbGFzaChtb3VudCk7XG4gICAgY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQuYmluZChjb25maWcpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0LmJpbmQoXG4gICAgICBjb25maWdcbiAgICApO1xuICAgIGNvbmZpZy52ZXJzaW9uID0gdmVyc2lvbjtcbiAgICByZXR1cm4gY29uZmlnO1xuICB9XG5cbiAgYXN5bmMgbG9hZEtleXMoKSB7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBhc3luY0tleXMubWFwKGFzeW5jIGtleSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpc1tgXyR7a2V5fWBdID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXNba2V5XSA9IGF3YWl0IHRoaXNbYF8ke2tleX1gXSgpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byByZXNvbHZlIGFzeW5jIGNvbmZpZyBrZXkgJyR7a2V5fSc6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGNvbnN0IGNhY2hlZENvbmZpZyA9IEFwcENhY2hlLmdldCh0aGlzLmFwcElkKTtcbiAgICBpZiAoY2FjaGVkQ29uZmlnKSB7XG4gICAgICBjb25zdCB1cGRhdGVkQ29uZmlnID0geyAuLi5jYWNoZWRDb25maWcgfTtcbiAgICAgIGFzeW5jS2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgIHVwZGF0ZWRDb25maWdba2V5XSA9IHRoaXNba2V5XTtcbiAgICAgIH0pO1xuICAgICAgQXBwQ2FjaGUucHV0KHRoaXMuYXBwSWQsIHVwZGF0ZWRDb25maWcpO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB0cmFuc2Zvcm1Db25maWd1cmF0aW9uKHNlcnZlckNvbmZpZ3VyYXRpb24pIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhzZXJ2ZXJDb25maWd1cmF0aW9uKSkge1xuICAgICAgaWYgKGFzeW5jS2V5cy5pbmNsdWRlcyhrZXkpICYmIHR5cGVvZiBzZXJ2ZXJDb25maWd1cmF0aW9uW2tleV0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgc2VydmVyQ29uZmlndXJhdGlvbltgXyR7a2V5fWBdID0gc2VydmVyQ29uZmlndXJhdGlvbltrZXldO1xuICAgICAgICBkZWxldGUgc2VydmVyQ29uZmlndXJhdGlvbltrZXldO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyBwdXQoc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIENvbmZpZy52YWxpZGF0ZU9wdGlvbnMoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnZhbGlkYXRlQ29udHJvbGxlcnMoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnRyYW5zZm9ybUNvbmZpZ3VyYXRpb24oc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQXBwQ2FjaGUucHV0KHNlcnZlckNvbmZpZ3VyYXRpb24uYXBwSWQsIHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy5zZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHNlcnZlckNvbmZpZ3VyYXRpb24ucGFzc3dvcmRQb2xpY3kpO1xuICAgIHJldHVybiBzZXJ2ZXJDb25maWd1cmF0aW9uO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlT3B0aW9ucyh7XG4gICAgY3VzdG9tUGFnZXMsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQsXG4gICAgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyxcbiAgICBzZXNzaW9uTGVuZ3RoLFxuICAgIGRlZmF1bHRMaW1pdCxcbiAgICBtYXhMaW1pdCxcbiAgICBhY2NvdW50TG9ja291dCxcbiAgICBwYXNzd29yZFBvbGljeSxcbiAgICBtYXN0ZXJLZXlJcHMsXG4gICAgbWFzdGVyS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5SXBzLFxuICAgIHJlYWRPbmx5TWFzdGVyS2V5LFxuICAgIGFsbG93SGVhZGVycyxcbiAgICBpZGVtcG90ZW5jeU9wdGlvbnMsXG4gICAgZmlsZVVwbG9hZCxcbiAgICBwYWdlcyxcbiAgICBzZWN1cml0eSxcbiAgICBlbmZvcmNlUHJpdmF0ZVVzZXJzLFxuICAgIGVuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzLFxuICAgIHNjaGVtYSxcbiAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0LFxuICAgIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4sXG4gICAgbG9nTGV2ZWxzLFxuICAgIHJhdGVMaW1pdCxcbiAgICByZXF1ZXN0Q29tcGxleGl0eSxcbiAgICBkYXRhYmFzZU9wdGlvbnMsXG4gICAgZXh0ZW5kU2Vzc2lvbk9uVXNlLFxuICAgIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbixcbiAgICBsaXZlUXVlcnksXG4gIH0pIHtcbiAgICBpZiAobWFzdGVyS2V5ID09PSByZWFkT25seU1hc3RlcktleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIHJlYWRPbmx5TWFzdGVyS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICBpZiAobWFzdGVyS2V5ID09PSBtYWludGVuYW5jZUtleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIG1haW50ZW5hbmNlS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICB0aGlzLnZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpO1xuICAgIHRoaXMudmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSk7XG4gICAgdGhpcy52YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpO1xuXG4gICAgaWYgKHR5cGVvZiByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGV4dGVuZFNlc3Npb25PblVzZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZXh0ZW5kU2Vzc2lvbk9uVXNlIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICB0aGlzLnZhbGlkYXRlUHVibGljU2VydmVyVVJMKHsgcHVibGljU2VydmVyVVJMIH0pO1xuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlSXBzKCdtYXN0ZXJLZXlJcHMnLCBtYXN0ZXJLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVJcHMoJ21haW50ZW5hbmNlS2V5SXBzJywgbWFpbnRlbmFuY2VLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVEZWZhdWx0TGltaXQoZGVmYXVsdExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcyk7XG4gICAgdGhpcy52YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSk7XG4gICAgdGhpcy52YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMoZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pO1xuICAgIHRoaXMudmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpO1xuICAgIHRoaXMudmFsaWRhdGVSYXRlTGltaXQocmF0ZUxpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlUmVxdWVzdENvbXBsZXhpdHkocmVxdWVzdENvbXBsZXhpdHkpO1xuICAgIHRoaXMudmFsaWRhdGVMb2dMZXZlbHMobG9nTGV2ZWxzKTtcbiAgICB0aGlzLnZhbGlkYXRlRGF0YWJhc2VPcHRpb25zKGRhdGFiYXNlT3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZUN1c3RvbVBhZ2VzKGN1c3RvbVBhZ2VzKTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uKGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbik7XG4gICAgdGhpcy52YWxpZGF0ZUxpdmVRdWVyeU9wdGlvbnMobGl2ZVF1ZXJ5KTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUN1c3RvbVBhZ2VzKGN1c3RvbVBhZ2VzKSB7XG4gICAgaWYgKCFjdXN0b21QYWdlcykgeyByZXR1cm47IH1cblxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoY3VzdG9tUGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgRXJyb3IoJ1BhcnNlIFNlcnZlciBvcHRpb24gY3VzdG9tUGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJyk7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQ29udHJvbGxlcnMoe1xuICAgIHZlcmlmeVVzZXJFbWFpbHMsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgX3B1YmxpY1NlcnZlclVSTCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgIGVtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsLFxuICB9KSB7XG4gICAgY29uc3QgZW1haWxBZGFwdGVyID0gdXNlckNvbnRyb2xsZXIuYWRhcHRlcjtcbiAgICBpZiAodmVyaWZ5VXNlckVtYWlscykge1xuICAgICAgdGhpcy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcixcbiAgICAgICAgYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMOiBwdWJsaWNTZXJ2ZXJVUkwgfHwgX3B1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICAgIGVtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgaWYgKHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVxdWVzdEtleXdvcmREZW55bGlzdCA9IHJlcXVlc3RLZXl3b3JkRGVueWxpc3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiByZXF1ZXN0S2V5d29yZERlbnlsaXN0IG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzKGVuZm9yY2VQcml2YXRlVXNlcnMpIHtcbiAgICBpZiAodHlwZW9mIGVuZm9yY2VQcml2YXRlVXNlcnMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gZW5mb3JjZVByaXZhdGVVc2VycyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4oYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbikge1xuICAgIGlmICh0eXBlb2YgYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uKGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbikge1xuICAgIGlmICh0eXBlb2YgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSkge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2VjdXJpdHkpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2sgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrTG9nLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYTogU2NoZW1hT3B0aW9ucykge1xuICAgIGlmICghc2NoZW1hKSB7IHJldHVybjsgfVxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2NoZW1hKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlZmluaXRpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWZpbml0aW9ucyA9IFNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYS5kZWZpbml0aW9ucykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWZpbml0aW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuc3RyaWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5zdHJpY3QgPSBTY2hlbWFPcHRpb25zLnN0cmljdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuc3RyaWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnN0cmljdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9IFNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9IFNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEubG9ja1NjaGVtYXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmxvY2tTY2hlbWFzID0gU2NoZW1hT3B0aW9ucy5sb2NrU2NoZW1hcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEubG9ja1NjaGVtYXMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEubG9ja1NjaGVtYXMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmFmdGVyTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcykge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZVJvdXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXIgPSBQYWdlc09wdGlvbnMuZW5hYmxlUm91dGVyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZVJvdXRlcikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZVJvdXRlciBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9IFBhZ2VzT3B0aW9ucy5lbmFibGVMb2NhbGl6YXRpb24uZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25Kc29uUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBsYWNlaG9sZGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wbGFjZWhvbGRlcnMgPSBQYWdlc09wdGlvbnMucGxhY2Vob2xkZXJzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5wbGFjZWhvbGRlcnMpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgdHlwZW9mIHBhZ2VzLnBsYWNlaG9sZGVycyAhPT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGxhY2Vob2xkZXJzIG11c3QgYmUgYW4gb2JqZWN0IG9yIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmZvcmNlUmVkaXJlY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZm9yY2VSZWRpcmVjdCA9IFBhZ2VzT3B0aW9ucy5mb3JjZVJlZGlyZWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmZvcmNlUmVkaXJlY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5mb3JjZVJlZGlyZWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc1BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNQYXRoID0gUGFnZXNPcHRpb25zLnBhZ2VzUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc0VuZHBvaW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPSBQYWdlc09wdGlvbnMucGFnZXNFbmRwb2ludC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzRW5kcG9pbnQpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc0VuZHBvaW50IG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVVybHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tVXJscyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21VcmxzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMuY3VzdG9tVXJscykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21VcmxzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21Sb3V0ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tUm91dGVzID0gUGFnZXNPcHRpb25zLmN1c3RvbVJvdXRlcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShwYWdlcy5jdXN0b21Sb3V0ZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVJvdXRlcyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpZGVtcG90ZW5jeU9wdGlvbnMudHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPSBJZGVtcG90ZW5jeU9wdGlvbnMudHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkgJiYgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA8PSAwKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAgc2Vjb25kcyc7XG4gICAgfSBlbHNlIGlmIChpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyA9IElkZW1wb3RlbmN5T3B0aW9ucy5wYXRocy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBwYXRocyBtdXN0IGJlIG9mIGFuIGFycmF5IG9mIHN0cmluZ3MnO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KSB7XG4gICAgaWYgKGFjY291bnRMb2Nrb3V0KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBhY2NvdW50TG9ja291dC5kdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPD0gMCB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA+IDk5OTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCBkdXJhdGlvbiBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICFOdW1iZXIuaXNJbnRlZ2VyKGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCkgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkIDwgMSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPiA5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IHRocmVzaG9sZCBzaG91bGQgYmUgYW4gaW50ZWdlciBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID0gQWNjb3VudExvY2tvdXRPcHRpb25zLnVubG9ja09uUGFzc3dvcmRSZXNldC5kZWZhdWx0O1xuICAgICAgfSBlbHNlIGlmICghaXNCb29sZWFuKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkpIHtcbiAgICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kpIHtcbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSAnbnVtYmVyJyB8fCBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSA8IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPSBuZXcgUmVnRXhwKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pO1xuICAgICAgICB9IGVsc2UgaWYgKCEocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcbiAgICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBtdXN0IGJlIGEgcmVnZXggc3RyaW5nIG9yIFJlZ0V4cCBvYmplY3QuJztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAmJlxuICAgICAgICAoIU51bWJlci5pc0ludGVnZXIocGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA8PSAwIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ID4gMjApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSBtdXN0IGJlIGFuIGludGVnZXIgcmFuZ2luZyAwIC0gMjAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmICFwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgcmVzZXRUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IHJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpcyBjb25maWd1cmVkIHRoZW4gc2V0dXAgYSBjYWxsYmFjayB0byBwcm9jZXNzIHRoZSBwYXR0ZXJuXG4gIHN0YXRpYyBzZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5ICYmIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgIHBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgPSB2YWx1ZSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuLnRlc3QodmFsdWUpO1xuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQdWJsaWNTZXJ2ZXJVUkwoeyBwdWJsaWNTZXJ2ZXJVUkwsIHJlcXVpcmVkID0gZmFsc2UgfSkge1xuICAgIGlmICghcHVibGljU2VydmVyVVJMKSB7XG4gICAgICBpZiAoIXJlcXVpcmVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93ICdUaGUgb3B0aW9uIHB1YmxpY1NlcnZlclVSTCBpcyByZXF1aXJlZC4nO1xuICAgIH1cblxuICAgIGNvbnN0IHR5cGUgPSB0eXBlb2YgcHVibGljU2VydmVyVVJMO1xuXG4gICAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBpZiAoIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwOi8vJykgJiYgIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICAgIHRocm93ICdUaGUgb3B0aW9uIHB1YmxpY1NlcnZlclVSTCBtdXN0IGJlIGEgdmFsaWQgVVJMIHN0YXJ0aW5nIHdpdGggaHR0cDovLyBvciBodHRwczovLy4nO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhyb3cgYFRoZSBvcHRpb24gcHVibGljU2VydmVyVVJMIG11c3QgYmUgYSBzdHJpbmcgb3IgZnVuY3Rpb24sIGJ1dCBnb3QgJHt0eXBlfS5gO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICBlbWFpbFZlcmlmeVN1Y2Nlc3NPbkludmFsaWRFbWFpbCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgdGhpcy52YWxpZGF0ZVB1YmxpY1NlcnZlclVSTCh7IHB1YmxpY1NlcnZlclVSTCwgcmVxdWlyZWQ6IHRydWUgfSk7XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBpZiAoaXNOYU4oZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmIHR5cGVvZiBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgIWVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIGVtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdlbWFpbFZlcmlmeVN1Y2Nlc3NPbkludmFsaWRFbWFpbCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMgPSBGaWxlVXBsb2FkT3B0aW9ucy5maWxlRXh0ZW5zaW9ucy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkoZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucykpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVJcHMoZmllbGQsIG1hc3RlcktleUlwcykge1xuICAgIGZvciAobGV0IGlwIG9mIG1hc3RlcktleUlwcykge1xuICAgICAgaWYgKGlwLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgICAgaXAgPSBpcC5zcGxpdCgnLycpWzBdO1xuICAgICAgfVxuICAgICAgaWYgKCFuZXQuaXNJUChpcCkpIHtcbiAgICAgICAgdGhyb3cgYFRoZSBQYXJzZSBTZXJ2ZXIgb3B0aW9uIFwiJHtmaWVsZH1cIiBjb250YWlucyBhbiBpbnZhbGlkIElQIGFkZHJlc3MgXCIke2lwfVwiLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMoZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMpIHtcbiAgICBpZiAoZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMgJiYgdHlwZW9mIGVuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGVuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycykge1xuICAgICAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oeyB1c2FnZTogJ2luc2VjdXJlIGFkYXB0ZXInIH0pO1xuICAgIH1cbiAgfVxuXG4gIGdldCBtb3VudCgpIHtcbiAgICB2YXIgbW91bnQgPSB0aGlzLl9tb3VudDtcbiAgICBpZiAodGhpcy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIG1vdW50ID0gdGhpcy5wdWJsaWNTZXJ2ZXJVUkw7XG4gICAgfVxuICAgIHJldHVybiBtb3VudDtcbiAgfVxuXG4gIHNldCBtb3VudChuZXdWYWx1ZSkge1xuICAgIHRoaXMuX21vdW50ID0gbmV3VmFsdWU7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgaWYgKGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIGlmIChpc05hTihzZXNzaW9uTGVuZ3RoKSkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChzZXNzaW9uTGVuZ3RoIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZURlZmF1bHRMaW1pdChkZWZhdWx0TGltaXQpIHtcbiAgICBpZiAoZGVmYXVsdExpbWl0ID09IG51bGwpIHtcbiAgICAgIGRlZmF1bHRMaW1pdCA9IFBhcnNlU2VydmVyT3B0aW9ucy5kZWZhdWx0TGltaXQuZGVmYXVsdDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBkZWZhdWx0TGltaXQgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyAnRGVmYXVsdCBsaW1pdCBtdXN0IGJlIGEgbnVtYmVyLic7XG4gICAgfVxuICAgIGlmIChkZWZhdWx0TGltaXQgPD0gMCkge1xuICAgICAgdGhyb3cgJ0RlZmF1bHQgbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpIHtcbiAgICBpZiAobWF4TGltaXQgPD0gMCkge1xuICAgICAgdGhyb3cgJ01heCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKSB7XG4gICAgaWYgKCFbbnVsbCwgdW5kZWZpbmVkXS5pbmNsdWRlcyhhbGxvd0hlYWRlcnMpKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShhbGxvd0hlYWRlcnMpKSB7XG4gICAgICAgIGFsbG93SGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBoZWFkZXIgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG9ubHkgY29udGFpbiBzdHJpbmdzJztcbiAgICAgICAgICB9IGVsc2UgaWYgKCFoZWFkZXIudHJpbSgpLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBub3QgY29udGFpbiBlbXB0eSBzdHJpbmdzJztcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBiZSBhbiBhcnJheSc7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTG9nTGV2ZWxzKGxvZ0xldmVscykge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKExvZ0xldmVscykpIHtcbiAgICAgIGlmIChsb2dMZXZlbHNba2V5XSkge1xuICAgICAgICBpZiAodmFsaWRMb2dMZXZlbHMuaW5kZXhPZihsb2dMZXZlbHNba2V5XSkgPT09IC0xKSB7XG4gICAgICAgICAgdGhyb3cgYCcke2tleX0nIG11c3QgYmUgb25lIG9mICR7SlNPTi5zdHJpbmdpZnkodmFsaWRMb2dMZXZlbHMpfWA7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ0xldmVsc1trZXldID0gTG9nTGV2ZWxzW2tleV0uZGVmYXVsdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVEYXRhYmFzZU9wdGlvbnMoZGF0YWJhc2VPcHRpb25zKSB7XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucyA9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhYmFzZU9wdGlvbnMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucyBtdXN0IGJlIGFuIG9iamVjdGA7XG4gICAgfVxuXG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgPSBEYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgfVxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsID0gRGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICB9XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5hbGxvd1B1YmxpY0V4cGxhaW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLmFsbG93UHVibGljRXhwbGFpbiA9IERhdGFiYXNlT3B0aW9ucy5hbGxvd1B1YmxpY0V4cGxhaW4uZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhYmFzZU9wdGlvbnMuYWxsb3dQdWJsaWNFeHBsYWluICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93IGBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdkYXRhYmFzZU9wdGlvbnMuYWxsb3dQdWJsaWNFeHBsYWluJyBtdXN0IGJlIGEgYm9vbGVhbi5gO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUxpdmVRdWVyeU9wdGlvbnMobGl2ZVF1ZXJ5KSB7XG4gICAgaWYgKGxpdmVRdWVyeSA9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGxpdmVRdWVyeS5yZWdleFRpbWVvdXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgbGl2ZVF1ZXJ5LnJlZ2V4VGltZW91dCA9IExpdmVRdWVyeU9wdGlvbnMucmVnZXhUaW1lb3V0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbGl2ZVF1ZXJ5LnJlZ2V4VGltZW91dCAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93IGBsaXZlUXVlcnkucmVnZXhUaW1lb3V0IG11c3QgYmUgYSBudW1iZXJgO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJhdGVMaW1pdChyYXRlTGltaXQpIHtcbiAgICBpZiAoIXJhdGVMaW1pdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocmF0ZUxpbWl0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgICFBcnJheS5pc0FycmF5KHJhdGVMaW1pdClcbiAgICApIHtcbiAgICAgIHRocm93IGByYXRlTGltaXQgbXVzdCBiZSBhbiBhcnJheSBvciBvYmplY3RgO1xuICAgIH1cbiAgICBjb25zdCBvcHRpb25zID0gQXJyYXkuaXNBcnJheShyYXRlTGltaXQpID8gcmF0ZUxpbWl0IDogW3JhdGVMaW1pdF07XG4gICAgZm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvcHRpb24pICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0IG11c3QgYmUgYW4gYXJyYXkgb2Ygb2JqZWN0c2A7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RQYXRoID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0UGF0aCBtdXN0IGJlIGRlZmluZWRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHRpb24ucmVxdWVzdFBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFBhdGggbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RUaW1lV2luZG93ID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0VGltZVdpbmRvdyBtdXN0IGJlIGRlZmluZWRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHRpb24ucmVxdWVzdFRpbWVXaW5kb3cgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFRpbWVXaW5kb3cgbXVzdCBiZSBhIG51bWJlcmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzICYmIHR5cGVvZiBvcHRpb24uaW5jbHVkZUludGVybmFsUmVxdWVzdHMgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb24ucmVxdWVzdENvdW50ID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0Q291bnQgbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RDb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5yZXF1ZXN0Q291bnQgbXVzdCBiZSBhIG51bWJlcmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLmVycm9yUmVzcG9uc2VNZXNzYWdlICYmIHR5cGVvZiBvcHRpb24uZXJyb3JSZXNwb25zZU1lc3NhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQuZXJyb3JSZXNwb25zZU1lc3NhZ2UgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICB9XG4gICAgICBjb25zdCBvcHRpb25zID0gT2JqZWN0LmtleXMoUGFyc2VTZXJ2ZXIuUmF0ZUxpbWl0Wm9uZSk7XG4gICAgICBpZiAob3B0aW9uLnpvbmUgJiYgIW9wdGlvbnMuaW5jbHVkZXMob3B0aW9uLnpvbmUpKSB7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRlciA9IG5ldyBJbnRsLkxpc3RGb3JtYXQoJ2VuJywgeyBzdHlsZTogJ3Nob3J0JywgdHlwZTogJ2Rpc2p1bmN0aW9uJyB9KTtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC56b25lIG11c3QgYmUgb25lIG9mICR7Zm9ybWF0dGVyLmZvcm1hdChvcHRpb25zKX1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJlcXVlc3RDb21wbGV4aXR5KHJlcXVlc3RDb21wbGV4aXR5KSB7XG4gICAgaWYgKHJlcXVlc3RDb21wbGV4aXR5ID09IG51bGwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiByZXF1ZXN0Q29tcGxleGl0eSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShyZXF1ZXN0Q29tcGxleGl0eSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigncmVxdWVzdENvbXBsZXhpdHkgbXVzdCBiZSBhbiBvYmplY3QuJyk7XG4gICAgfVxuICAgIGNvbnN0IHZhbGlkS2V5cyA9IE9iamVjdC5rZXlzKFJlcXVlc3RDb21wbGV4aXR5T3B0aW9ucyk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocmVxdWVzdENvbXBsZXhpdHkpKSB7XG4gICAgICBpZiAoIXZhbGlkS2V5cy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgcmVxdWVzdENvbXBsZXhpdHkgY29udGFpbnMgdW5rbm93biBwcm9wZXJ0eSAnJHtrZXl9Jy5gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgdmFsaWRLZXlzKSB7XG4gICAgICBpZiAocmVxdWVzdENvbXBsZXhpdHlba2V5XSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gcmVxdWVzdENvbXBsZXhpdHlba2V5XTtcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSB8fCAodmFsdWUgPCAxICYmIHZhbHVlICE9PSAtMSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYHJlcXVlc3RDb21wbGV4aXR5LiR7a2V5fSBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlciBvciAtMSB0byBkaXNhYmxlLmApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXF1ZXN0Q29tcGxleGl0eVtrZXldID0gUmVxdWVzdENvbXBsZXhpdHlPcHRpb25zW2tleV0uZGVmYXVsdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnZlcmlmeVVzZXJFbWFpbHMgfHwgIXRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnBhc3N3b3JkUG9saWN5IHx8ICF0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5leHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuc2Vzc2lvbkxlbmd0aCAqIDEwMDApO1xuICB9XG5cbiAgdW5yZWdpc3RlclJhdGVMaW1pdGVycygpIHtcbiAgICBsZXQgaSA9IHRoaXMucmF0ZUxpbWl0cz8ubGVuZ3RoO1xuICAgIHdoaWxlIChpLS0pIHtcbiAgICAgIGNvbnN0IGxpbWl0ID0gdGhpcy5yYXRlTGltaXRzW2ldO1xuICAgICAgaWYgKGxpbWl0LmNsb3VkKSB7XG4gICAgICAgIHRoaXMucmF0ZUxpbWl0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGludmFsaWRMaW5rVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRMaW5rIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfbGluay5odG1sYDtcbiAgfVxuXG4gIGdldCBpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkVmVyaWZpY2F0aW9uTGluayB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF92ZXJpZmljYXRpb25fbGluay5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kU3VjY2VzcyB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRGYWlsVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kRmFpbCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfZmFpbC5odG1sYDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMudmVyaWZ5RW1haWxTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy92ZXJpZnlfZW1haWxfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgY2hvb3NlUGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuY2hvb3NlUGFzc3dvcmQgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvY2hvb3NlX3Bhc3N3b3JkYDtcbiAgfVxuXG4gIGdldCByZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vcmVxdWVzdF9wYXNzd29yZF9yZXNldGA7XG4gIH1cblxuICBnZXQgcGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IHBhcnNlRnJhbWVVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMucGFyc2VGcmFtZVVSTDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vdmVyaWZ5X2VtYWlsYDtcbiAgfVxuXG4gIGFzeW5jIGxvYWRNYXN0ZXJLZXkoKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLm1hc3RlcktleSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgdHRsSXNFbXB0eSA9ICF0aGlzLm1hc3RlcktleVR0bDtcbiAgICAgIGNvbnN0IGlzRXhwaXJlZCA9IHRoaXMubWFzdGVyS2V5Q2FjaGU/LmV4cGlyZXNBdCAmJiB0aGlzLm1hc3RlcktleUNhY2hlLmV4cGlyZXNBdCA8IG5ldyBEYXRlKCk7XG5cbiAgICAgIGlmICgoIWlzRXhwaXJlZCB8fCB0dGxJc0VtcHR5KSAmJiB0aGlzLm1hc3RlcktleUNhY2hlPy5tYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWFzdGVyS2V5Q2FjaGUubWFzdGVyS2V5O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBtYXN0ZXJLZXkgPSBhd2FpdCB0aGlzLm1hc3RlcktleSgpO1xuXG4gICAgICBjb25zdCBleHBpcmVzQXQgPSB0aGlzLm1hc3RlcktleVR0bCA/IG5ldyBEYXRlKERhdGUubm93KCkgKyAxMDAwICogdGhpcy5tYXN0ZXJLZXlUdGwpIDogbnVsbFxuICAgICAgdGhpcy5tYXN0ZXJLZXlDYWNoZSA9IHsgbWFzdGVyS2V5LCBleHBpcmVzQXQgfTtcbiAgICAgIENvbmZpZy5wdXQodGhpcyk7XG5cbiAgICAgIHJldHVybiB0aGlzLm1hc3RlcktleUNhY2hlLm1hc3RlcktleTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5tYXN0ZXJLZXk7XG4gIH1cblxuICAvLyBUT0RPOiBSZW1vdmUgdGhpcyBmdW5jdGlvbiBvbmNlIFBhZ2VzUm91dGVyIHJlcGxhY2VzIHRoZSBQdWJsaWNBUElSb3V0ZXI7XG4gIC8vIHRoZSAoZGVmYXVsdCkgZW5kcG9pbnQgaGFzIHRvIGJlIGRlZmluZWQgaW4gUGFnZXNSb3V0ZXIgb25seS5cbiAgZ2V0IHBhZ2VzRW5kcG9pbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMucGFnZXMgJiYgdGhpcy5wYWdlcy5lbmFibGVSb3V0ZXIgJiYgdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA/IHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgOiAnYXBwcyc7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQ29uZmlnO1xubW9kdWxlLmV4cG9ydHMgPSBDb25maWc7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUlBLElBQUFBLE9BQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLElBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLE1BQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFJLG1CQUFBLEdBQUFGLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSyxpQkFBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sUUFBQSxHQUFBTixPQUFBO0FBQ0EsSUFBQU8sWUFBQSxHQUFBUCxPQUFBO0FBYUEsSUFBQVEsTUFBQSxHQUFBTixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQVMsV0FBQSxHQUFBUCxzQkFBQSxDQUFBRixPQUFBO0FBQWlELFNBQUFFLHVCQUFBUSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBeEJqRDtBQUNBO0FBQ0E7O0FBd0JBLFNBQVNHLG1CQUFtQkEsQ0FBQ0MsR0FBRyxFQUFFO0VBQ2hDLElBQUksQ0FBQ0EsR0FBRyxFQUFFO0lBQ1IsT0FBT0EsR0FBRztFQUNaO0VBQ0EsSUFBSUEsR0FBRyxDQUFDQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7SUFDckJELEdBQUcsR0FBR0EsR0FBRyxDQUFDRSxTQUFTLENBQUMsQ0FBQyxFQUFFRixHQUFHLENBQUNHLE1B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