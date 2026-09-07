"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PagesRouter = void 0;
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var _Config = _interopRequireDefault(require("../Config"));
var _express = _interopRequireDefault(require("express"));
var _path = _interopRequireDefault(require("path"));
var _fs = require("fs");
var _node = require("parse/node");
var _Utils = _interopRequireDefault(require("../Utils"));
var _mustache = _interopRequireDefault(require("mustache"));
var _Page = _interopRequireDefault(require("../Page"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// All pages with custom page key for reference and file name
const pages = Object.freeze({
  passwordReset: new _Page.default({
    id: 'passwordReset',
    defaultFile: 'password_reset.html'
  }),
  passwordResetSuccess: new _Page.default({
    id: 'passwordResetSuccess',
    defaultFile: 'password_reset_success.html'
  }),
  passwordResetLinkInvalid: new _Page.default({
    id: 'passwordResetLinkInvalid',
    defaultFile: 'password_reset_link_invalid.html'
  }),
  emailVerificationSuccess: new _Page.default({
    id: 'emailVerificationSuccess',
    defaultFile: 'email_verification_success.html'
  }),
  emailVerificationSendFail: new _Page.default({
    id: 'emailVerificationSendFail',
    defaultFile: 'email_verification_send_fail.html'
  }),
  emailVerificationSendSuccess: new _Page.default({
    id: 'emailVerificationSendSuccess',
    defaultFile: 'email_verification_send_success.html'
  }),
  emailVerificationLinkInvalid: new _Page.default({
    id: 'emailVerificationLinkInvalid',
    defaultFile: 'email_verification_link_invalid.html'
  }),
  emailVerificationLinkExpired: new _Page.default({
    id: 'emailVerificationLinkExpired',
    defaultFile: 'email_verification_link_expired.html'
  })
});

// All page parameters for reference to be used as template placeholders or query params
const pageParams = Object.freeze({
  appName: 'appName',
  appId: 'appId',
  token: 'token',
  username: 'username',
  error: 'error',
  locale: 'locale',
  publicServerUrl: 'publicServerUrl'
});

// The header prefix to add page params as response headers
const pageParamHeaderPrefix = 'x-parse-page-param-';

// The errors being thrown
const errors = Object.freeze({
  jsonFailedFileLoading: 'failed to load JSON file',
  fileOutsideAllowedScope: 'not allowed to read file outside of pages directory'
});
class PagesRouter extends _PromiseRouter.default {
  /**
   * Constructs a PagesRouter.
   * @param {Object} pages The pages options from the Parse Server configuration.
   */
  constructor(pages = {}) {
    super();

    // Set instance properties
    this.pagesConfig = pages;
    this.pagesEndpoint = pages.pagesEndpoint ? pages.pagesEndpoint : 'apps';
    this.pagesPath = pages.pagesPath ? _path.default.resolve('./', pages.pagesPath) : _path.default.resolve(__dirname, '../../public');
    this.loadJsonResource();
    this.mountPagesRoutes();
    this.mountCustomRoutes();
    this.mountStaticRoute();
  }
  verifyEmail(req) {
    const config = req.config;
    const {
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if (!config) {
      this.invalidRequest();
    }
    if (!token) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }
    const userController = config.userController;
    return userController.verifyEmail(token).then(() => {
      return this.goToPage(req, pages.emailVerificationSuccess);
    }, () => {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    });
  }
  resendVerificationEmail(req) {
    const config = req.config;
    const username = req.body?.username;
    const rawToken = req.body?.token;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if (!config) {
      this.invalidRequest();
    }
    if (!username && !token) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }
    const userController = config.userController;
    const suppressError = config.emailVerifySuccessOnInvalidEmail ?? true;
    return userController.resendVerificationEmail(username, req, token).then(() => {
      return this.goToPage(req, pages.emailVerificationSendSuccess);
    }, () => {
      if (suppressError) {
        return this.goToPage(req, pages.emailVerificationSendSuccess);
      }
      return this.goToPage(req, pages.emailVerificationSendFail);
    });
  }
  passwordReset(req) {
    const config = req.config;
    const params = {
      [pageParams.appId]: req.params.appId,
      [pageParams.appName]: config.appName,
      [pageParams.token]: req.query.token,
      [pageParams.username]: req.query.username,
      [pageParams.publicServerUrl]: config.publicServerURL
    };
    return this.goToPage(req, pages.passwordReset, params);
  }
  requestResetPassword(req) {
    const config = req.config;
    if (!config) {
      this.invalidRequest();
    }
    const {
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if (!token) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }
    return config.userController.checkResetTokenValidity(token).then(() => {
      const params = {
        [pageParams.token]: token,
        [pageParams.appId]: config.applicationId,
        [pageParams.appName]: config.appName
      };
      return this.goToPage(req, pages.passwordReset, params);
    }, () => {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    });
  }
  resetPassword(req) {
    const config = req.config;
    if (!config) {
      this.invalidRequest();
    }
    const {
      new_password,
      token: rawToken
    } = req.body || {};
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if ((!token || !new_password) && req.xhr === false) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }
    if (!token) {
      throw new _node.Parse.Error(_node.Parse.Error.OTHER_CAUSE, 'Missing token');
    }
    if (!new_password) {
      throw new _node.Parse.Error(_node.Parse.Error.PASSWORD_MISSING, 'Missing password');
    }
    return config.userController.updatePassword(token, new_password).then(() => {
      return Promise.resolve({
        success: true
      });
    }, err => {
      return Promise.resolve({
        success: false,
        err
      });
    }).then(result => {
      if (req.xhr) {
        if (result.success) {
          return Promise.resolve({
            status: 200,
            response: 'Password successfully reset'
          });
        }
        if (result.err) {
          throw new _node.Parse.Error(_node.Parse.Error.OTHER_CAUSE, `${result.err}`);
        }
      }
      const query = result.success ? {} : {
        [pageParams.token]: token,
        [pageParams.appId]: config.applicationId,
        [pageParams.error]: result.err,
        [pageParams.appName]: config.appName
      };
      if (result?.err === 'The password reset link has expired') {
        delete query[pageParams.token];
        query[pageParams.token] = token;
      }
      const page = result.success ? pages.passwordResetSuccess : pages.passwordReset;
      return this.goToPage(req, page, query, false);
    });
  }

  /**
   * Returns page content if the page is a local file or returns a
   * redirect to a custom page.
   * @param {Object} req The express request.
   * @param {Page} page The page to go to.
   * @param {Object} [params={}] The query parameters to attach to the URL in case of
   * HTTP redirect responses for POST requests, or the placeholders to fill into
   * the response content in case of HTTP content responses for GET requests.
   * @param {Boolean} [responseType] Is true if a redirect response should be forced,
   * false if a content response should be forced, undefined if the response type
   * should depend on the request type by default:
   * - GET request -> content response
   * - POST request -> redirect response (PRG pattern)
   * @returns {Promise<Object>} The PromiseRouter response.
   */
  goToPage(req, page, params = {}, responseType) {
    const config = req.config;

    // Determine redirect either by force, response setting or request method
    const redirect = config.pages.forceRedirect ? true : responseType !== undefined ? responseType : req.method == 'POST';

    // Include default parameters
    const defaultParams = this.getDefaultParams(config);
    if (Object.values(defaultParams).includes(undefined)) {
      return this.notFound();
    }
    params = Object.assign(params, defaultParams);

    // Add locale to params to ensure it is passed on with every request;
    // that means, once a locale is set, it is passed on to any follow-up page,
    // e.g. request_password_reset -> password_reset -> password_reset_success
    const locale = this.getLocale(req);
    params[pageParams.locale] = locale;

    // Compose paths and URLs
    const defaultFile = page.defaultFile;
    const defaultPath = this.defaultPagePath(defaultFile);
    const defaultUrl = this.composePageUrl(defaultFile, config.publicServerURL);

    // If custom URL is set redirect to it without localization
    const customUrl = config.pages.customUrls[page.id];
    if (customUrl && !_Utils.default.isPath(customUrl)) {
      return this.redirectResponse(customUrl, params);
    }

    // Get JSON placeholders
    let placeholders = {};
    if (config.pages.enableLocalization && config.pages.localizationJsonPath) {
      placeholders = this.getJsonPlaceholders(locale, params);
    }

    // Send response
    if (config.pages.enableLocalization && locale) {
      return _Utils.default.getLocalizedPath(defaultPath, locale).then(({
        path,
        subdir
      }) => redirect ? this.redirectResponse(this.composePageUrl(defaultFile, config.publicServerURL, subdir), params) : this.pageResponse(path, params, placeholders));
    } else {
      return redirect ? this.redirectResponse(defaultUrl, params) : this.pageResponse(defaultPath, params, placeholders);
    }
  }

  /**
   * Serves a request to a static resource and localizes the resource if it
   * is a HTML file.
   * @param {Object} req The request object.
   * @returns {Promise<Object>} The response.
   */
  staticRoute(req) {
    // Get requested path
    const relativePath = req.params['resource'][0];

    // Resolve requested path to absolute path
    const absolutePath = _path.default.resolve(this.pagesPath, relativePath);

    // If the requested file is not a HTML file send its raw content
    if (!absolutePath || !absolutePath.endsWith('.html')) {
      return this.fileResponse(absolutePath);
    }

    // Get parameters
    const params = this.getDefaultParams(req.config);
    const locale = this.getLocale(req);
    if (locale) {
      params.locale = locale;
    }

    // Get JSON placeholders
    const placeholders = this.getJsonPlaceholders(locale, params);
    return this.pageResponse(absolutePath, params, placeholders);
  }

  /**
   * Returns a translation from the JSON resource for a given locale. The JSON
   * resource is parsed according to i18next syntax.
   *
   * Example JSON content:
   * ```js
   *  {
   *    "en": {               // resource for language `en` (English)
   *      "translation": {
   *        "greeting": "Hello!"
   *      }
   *    },
   *    "de": {               // resource for language `de` (German)
   *      "translation": {
   *        "greeting": "Hallo!"
   *      }
   *    }
   *    "de-CH": {            // resource for locale `de-CH` (Swiss German)
   *      "translation": {
   *        "greeting": "Grüezi!"
   *      }
   *    }
   *  }
   * ```
   * @param {String} locale The locale to translate to.
   * @returns {Object} The translation or an empty object if no matching
   * translation was found.
   */
  getJsonTranslation(locale) {
    // If there is no JSON resource
    if (this.jsonParameters === undefined) {
      return {};
    }

    // If locale is not set use the fallback locale
    locale = locale || this.pagesConfig.localizationFallbackLocale;

    // Get matching translation by locale, language or fallback locale
    const language = locale.split('-')[0];
    const resource = this.jsonParameters[locale] || this.jsonParameters[language] || this.jsonParameters[this.pagesConfig.localizationFallbackLocale] || {};
    const translation = resource.translation || {};
    return translation;
  }

  /**
   * Returns a translation from the JSON resource for a given locale with
   * placeholders filled in by given parameters.
   * @param {String} locale The locale to translate to.
   * @param {Object} params The parameters to fill into any placeholders
   * within the translations.
   * @returns {Object} The translation or an empty object if no matching
   * translation was found.
   */
  getJsonPlaceholders(locale, params = {}) {
    // If localization is disabled or there is no JSON resource
    if (!this.pagesConfig.enableLocalization || !this.pagesConfig.localizationJsonPath) {
      return {};
    }

    // Get JSON placeholders
    let placeholders = this.getJsonTranslation(locale);

    // Fill in any placeholders in the translation; this allows a translation
    // to contain default placeholders like {{appName}} which are filled here
    placeholders = JSON.stringify(placeholders);
    placeholders = _mustache.default.render(placeholders, params);
    placeholders = JSON.parse(placeholders);
    return placeholders;
  }

  /**
   * Creates a response with file content.
   * @param {String} path The path of the file to return.
   * @param {Object} [params={}] The parameters to be included in the response
   * header. These will also be used to fill placeholders.
   * @param {Object} [placeholders={}] The placeholders to fill in the content.
   * These will not be included in the response header.
   * @returns {Object} The Promise Router response.
   */
  async pageResponse(path, params = {}, placeholders = {}) {
    // Get file content
    let data;
    try {
      data = await this.readFile(path);
    } catch {
      return this.notFound();
    }

    // Get config placeholders; can be an object, a function or an async function
    let configPlaceholders = typeof this.pagesConfig.placeholders === 'function' ? this.pagesConfig.placeholders(params) : Object.prototype.toString.call(this.pagesConfig.placeholders) === '[object Object]' ? this.pagesConfig.placeholders : {};
    if (configPlaceholders instanceof Promise) {
      configPlaceholders = await configPlaceholders;
    }

    // Fill placeholders
    const allPlaceholders = Object.assign({}, configPlaceholders, placeholders);
    const paramsAndPlaceholders = Object.assign({}, params, allPlaceholders);
    data = _mustache.default.render(data, paramsAndPlaceholders);

    // Add placeholders in header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});
    return {
      text: data,
      headers: headers
    };
  }

  /**
   * Creates a response with file content.
   * @param {String} path The path of the file to return.
   * @returns {Object} The PromiseRouter response.
   */
  async fileResponse(path) {
    // Get file content
    let data;
    try {
      data = await this.readFile(path);
    } catch {
      return this.notFound();
    }
    return {
      text: data
    };
  }

  /**
   * Reads and returns the content of a file at a given path. File reading to
   * serve content on the static route is only allowed from the pages
   * directory on downwards.
   * -----------------------------------------------------------------------
   * **WARNING:** All file reads in the PagesRouter must be executed by this
   * wrapper because it also detects and prevents common exploits.
   * -----------------------------------------------------------------------
   * @param {String} filePath The path to the file to read.
   * @returns {Promise<String>} The file content.
   */
  async readFile(filePath) {
    // Normalize path to prevent it from containing any directory changing
    // UNIX patterns which could expose the whole file system, e.g.
    // `http://example.com/parse/apps/../file.txt` requests a file outside
    // of the pages directory scope.
    const normalizedPath = _path.default.normalize(filePath);

    // Abort if the path is outside of the path directory scope
    if (!normalizedPath.startsWith(this.pagesPath + _path.default.sep)) {
      throw errors.fileOutsideAllowedScope;
    }
    return await _fs.promises.readFile(normalizedPath, 'utf-8');
  }

  /**
   * Loads a language resource JSON file that is used for translations.
   */
  loadJsonResource() {
    if (this.pagesConfig.localizationJsonPath === undefined) {
      return;
    }
    try {
      const json = require(_path.default.resolve('./', this.pagesConfig.localizationJsonPath));
      this.jsonParameters = json;
    } catch {
      throw errors.jsonFailedFileLoading;
    }
  }

  /**
   * Extracts and returns the page default parameters from the Parse Server
   * configuration. These parameters are made accessible in every page served
   * by this router.
   * @param {Object} config The Parse Server configuration.
   * @returns {Object} The default parameters.
   */
  getDefaultParams(config) {
    return config ? {
      [pageParams.appId]: config.appId,
      [pageParams.appName]: config.appName,
      [pageParams.publicServerUrl]: config.publicServerURL
    } : {};
  }

  /**
   * Extracts and returns the locale from an express request.
   * @param {Object} req The express request.
   * @returns {String|undefined} The locale, or undefined if no locale was set.
   */
  getLocale(req) {
    const locale = (req.query || {})[pageParams.locale] || (req.body || {})[pageParams.locale] || (req.params || {})[pageParams.locale] || (req.headers || {})[pageParamHeaderPrefix + pageParams.locale];

    // Validate locale format to prevent path traversal and invalid
    // HTTP header characters; only allow standard locale patterns
    // like "en", "en-US", "de-AT", "zh-Hans-CN"
    if (locale !== undefined && typeof locale !== 'string') {
      return undefined;
    }
    if (typeof locale === 'string' && !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(locale)) {
      return undefined;
    }
    return locale;
  }

  /**
   * Creates a response with http redirect.
   * @param {Object} req The express request.
   * @param {String} path The path of the file to return.
   * @param {Object} params The query parameters to include.
   * @returns {Object} The Promise Router response.
   */
  async redirectResponse(url, params) {
    // Remove any parameters with undefined value
    params = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[p[0]] = p[1];
      }
      return m;
    }, {});

    // Compose URL with parameters in query
    const location = new URL(url);
    Object.entries(params).forEach(p => location.searchParams.set(p[0], p[1]));
    const locationString = location.toString();

    // Add parameters to header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});
    return {
      status: 303,
      location: locationString,
      headers: headers
    };
  }
  defaultPagePath(file) {
    return _path.default.join(this.pagesPath, file);
  }
  composePageUrl(file, publicServerUrl, locale) {
    let url = publicServerUrl;
    url += url.endsWith('/') ? '' : '/';
    url += this.pagesEndpoint + '/';
    url += locale === undefined ? '' : locale + '/';
    url += file;
    return url;
  }
  notFound() {
    return {
      text: 'Not found.',
      status: 404
    };
  }
  invalidRequest() {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }

  /**
   * Sets the Parse Server configuration in the request object to make it
   * easily accessible throughtout request processing.
   * @param {Object} req The request.
   * @param {Boolean} failGracefully Is true if failing to set the config should
   * not result in an invalid request response. Default is `false`.
   */
  setConfig(req, failGracefully = false) {
    req.config = _Config.default.get(req.params.appId || req.query.appId);
    if (!req.config && !failGracefully) {
      this.invalidRequest();
    }
    return Promise.resolve();
  }
  mountPagesRoutes() {
    this.route('GET', `/${this.pagesEndpoint}/:appId/verify_email`, req => {
      this.setConfig(req);
    }, req => {
      return this.verifyEmail(req);
    });
    this.route('POST', `/${this.pagesEndpoint}/:appId/resend_verification_email`, req => {
      this.setConfig(req);
    }, req => {
      return this.resendVerificationEmail(req);
    });
    this.route('GET', `/${this.pagesEndpoint}/choose_password`, req => {
      this.setConfig(req);
    }, req => {
      return this.passwordReset(req);
    });
    this.route('POST', `/${this.pagesEndpoint}/:appId/request_password_reset`, req => {
      this.setConfig(req);
    }, req => {
      return this.resetPassword(req);
    });
    this.route('GET', `/${this.pagesEndpoint}/:appId/request_password_reset`, req => {
      this.setConfig(req);
    }, req => {
      return this.requestResetPassword(req);
    });
  }
  mountCustomRoutes() {
    for (const route of this.pagesConfig.customRoutes || []) {
      this.route(route.method, `/${this.pagesEndpoint}/:appId/${route.path}`, req => {
        this.setConfig(req);
      }, async req => {
        const {
          file,
          query = {}
        } = (await route.handler(req)) || {};

        // If route handler did not return a page send 404 response
        if (!file) {
          return this.notFound();
        }

        // Send page response
        const page = new _Page.default({
          id: file,
          defaultFile: file
        });
        return this.goToPage(req, page, query, false);
      });
    }
  }
  mountStaticRoute() {
    this.route('GET', `/${this.pagesEndpoint}/*resource`, req => {
      this.setConfig(req, true);
    }, req => {
      return this.staticRoute(req);
    });
  }
  expressRouter() {
    const router = _express.default.Router();
    router.use('/', super.expressRouter());
    return router;
  }
}
exports.PagesRouter = PagesRouter;
var _default = exports.default = PagesRouter;
module.exports = {
  PagesRouter,
  pageParamHeaderPrefix,
  pageParams,
  pages
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9leHByZXNzIiwiX3BhdGgiLCJfZnMiLCJfbm9kZSIsIl9VdGlscyIsIl9tdXN0YWNoZSIsIl9QYWdlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwicGFnZXMiLCJPYmplY3QiLCJmcmVlemUiLCJwYXNzd29yZFJlc2V0IiwiUGFnZSIsImlkIiwiZGVmYXVsdEZpbGUiLCJwYXNzd29yZFJlc2V0U3VjY2VzcyIsInBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCIsImVtYWlsVmVyaWZpY2F0aW9uU3VjY2VzcyIsImVtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWwiLCJlbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzIiwiZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCIsImVtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQiLCJwYWdlUGFyYW1zIiwiYXBwTmFtZSIsImFwcElkIiwidG9rZW4iLCJ1c2VybmFtZSIsImVycm9yIiwibG9jYWxlIiwicHVibGljU2VydmVyVXJsIiwicGFnZVBhcmFtSGVhZGVyUHJlZml4IiwiZXJyb3JzIiwianNvbkZhaWxlZEZpbGVMb2FkaW5nIiwiZmlsZU91dHNpZGVBbGxvd2VkU2NvcGUiLCJQYWdlc1JvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJjb25zdHJ1Y3RvciIsInBhZ2VzQ29uZmlnIiwicGFnZXNFbmRwb2ludCIsInBhZ2VzUGF0aCIsInBhdGgiLCJyZXNvbHZlIiwiX19kaXJuYW1lIiwibG9hZEpzb25SZXNvdXJjZSIsIm1vdW50UGFnZXNSb3V0ZXMiLCJtb3VudEN1c3RvbVJvdXRlcyIsIm1vdW50U3RhdGljUm91dGUiLCJ2ZXJpZnlFbWFpbCIsInJlcSIsImNvbmZpZyIsInJhd1Rva2VuIiwicXVlcnkiLCJ0b1N0cmluZyIsImludmFsaWRSZXF1ZXN0IiwiZ29Ub1BhZ2UiLCJ1c2VyQ29udHJvbGxlciIsInRoZW4iLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsImJvZHkiLCJzdXBwcmVzc0Vycm9yIiwiZW1haWxWZXJpZnlTdWNjZXNzT25JbnZhbGlkRW1haWwiLCJwYXJhbXMiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZCIsImNoZWNrUmVzZXRUb2tlblZhbGlkaXR5IiwiYXBwbGljYXRpb25JZCIsInJlc2V0UGFzc3dvcmQiLCJuZXdfcGFzc3dvcmQiLCJ4aHIiLCJQYXJzZSIsIkVycm9yIiwiT1RIRVJfQ0FVU0UiLCJQQVNTV09SRF9NSVNTSU5HIiwidXBkYXRlUGFzc3dvcmQiLCJQcm9taXNlIiwic3VjY2VzcyIsImVyciIsInJlc3VsdCIsInN0YXR1cyIsInJlc3BvbnNlIiwicGFnZSIsInJlc3BvbnNlVHlwZSIsInJlZGlyZWN0IiwiZm9yY2VSZWRpcmVjdCIsInVuZGVmaW5lZCIsIm1ldGhvZCIsImRlZmF1bHRQYXJhbXMiLCJnZXREZWZhdWx0UGFyYW1zIiwidmFsdWVzIiwiaW5jbHVkZXMiLCJub3RGb3VuZCIsImFzc2lnbiIsImdldExvY2FsZSIsImRlZmF1bHRQYXRoIiwiZGVmYXVsdFBhZ2VQYXRoIiwiZGVmYXVsdFVybCIsImNvbXBvc2VQYWdlVXJsIiwiY3VzdG9tVXJsIiwiY3VzdG9tVXJscyIsIlV0aWxzIiwiaXNQYXRoIiwicmVkaXJlY3RSZXNwb25zZSIsInBsYWNlaG9sZGVycyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiZ2V0SnNvblBsYWNlaG9sZGVycyIsImdldExvY2FsaXplZFBhdGgiLCJzdWJkaXIiLCJwYWdlUmVzcG9uc2UiLCJzdGF0aWNSb3V0ZSIsInJlbGF0aXZlUGF0aCIsImFic29sdXRlUGF0aCIsImVuZHNXaXRoIiwiZmlsZVJlc3BvbnNlIiwiZ2V0SnNvblRyYW5zbGF0aW9uIiwianNvblBhcmFtZXRlcnMiLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsImxhbmd1YWdlIiwic3BsaXQiLCJyZXNvdXJjZSIsInRyYW5zbGF0aW9uIiwiSlNPTiIsInN0cmluZ2lmeSIsIm11c3RhY2hlIiwicmVuZGVyIiwicGFyc2UiLCJkYXRhIiwicmVhZEZpbGUiLCJjb25maWdQbGFjZWhvbGRlcnMiLCJwcm90b3R5cGUiLCJjYWxsIiwiYWxsUGxhY2Vob2xkZXJzIiwicGFyYW1zQW5kUGxhY2Vob2xkZXJzIiwiaGVhZGVycyIsImVudHJpZXMiLCJyZWR1Y2UiLCJtIiwicCIsInRvTG93ZXJDYXNlIiwidGV4dCIsImZpbGVQYXRoIiwibm9ybWFsaXplZFBhdGgiLCJub3JtYWxpemUiLCJzdGFydHNXaXRoIiwic2VwIiwiZnMiLCJqc29uIiwidGVzdCIsInVybCIsImxvY2F0aW9uIiwiVVJMIiwiZm9yRWFjaCIsInNlYXJjaFBhcmFtcyIsInNldCIsImxvY2F0aW9uU3RyaW5nIiwiZmlsZSIsImpvaW4iLCJtZXNzYWdlIiwic2V0Q29uZmlnIiwiZmFpbEdyYWNlZnVsbHkiLCJDb25maWciLCJnZXQiLCJyb3V0ZSIsImN1c3RvbVJvdXRlcyIsImhhbmRsZXIiLCJleHByZXNzUm91dGVyIiwicm91dGVyIiwiZXhwcmVzcyIsIlJvdXRlciIsInVzZSIsImV4cG9ydHMiLCJfZGVmYXVsdCIsIm1vZHVsZSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1BhZ2VzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHByb21pc2VzIGFzIGZzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgbXVzdGFjaGUgZnJvbSAnbXVzdGFjaGUnO1xuaW1wb3J0IFBhZ2UgZnJvbSAnLi4vUGFnZSc7XG5cbi8vIEFsbCBwYWdlcyB3aXRoIGN1c3RvbSBwYWdlIGtleSBmb3IgcmVmZXJlbmNlIGFuZCBmaWxlIG5hbWVcbmNvbnN0IHBhZ2VzID0gT2JqZWN0LmZyZWV6ZSh7XG4gIHBhc3N3b3JkUmVzZXQ6IG5ldyBQYWdlKHsgaWQ6ICdwYXNzd29yZFJlc2V0JywgZGVmYXVsdEZpbGU6ICdwYXNzd29yZF9yZXNldC5odG1sJyB9KSxcbiAgcGFzc3dvcmRSZXNldFN1Y2Nlc3M6IG5ldyBQYWdlKHtcbiAgICBpZDogJ3Bhc3N3b3JkUmVzZXRTdWNjZXNzJyxcbiAgICBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbCcsXG4gIH0pLFxuICBwYXNzd29yZFJlc2V0TGlua0ludmFsaWQ6IG5ldyBQYWdlKHtcbiAgICBpZDogJ3Bhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdwYXNzd29yZF9yZXNldF9saW5rX2ludmFsaWQuaHRtbCcsXG4gIH0pLFxuICBlbWFpbFZlcmlmaWNhdGlvblN1Y2Nlc3M6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uU3VjY2VzcycsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWw6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWwnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX3NlbmRfZmFpbC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3M6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3MnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX3NlbmRfc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQ6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX2xpbmtfaW52YWxpZC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQ6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX2xpbmtfZXhwaXJlZC5odG1sJyxcbiAgfSksXG59KTtcblxuLy8gQWxsIHBhZ2UgcGFyYW1ldGVycyBmb3IgcmVmZXJlbmNlIHRvIGJlIHVzZWQgYXMgdGVtcGxhdGUgcGxhY2Vob2xkZXJzIG9yIHF1ZXJ5IHBhcmFtc1xuY29uc3QgcGFnZVBhcmFtcyA9IE9iamVjdC5mcmVlemUoe1xuICBhcHBOYW1lOiAnYXBwTmFtZScsXG4gIGFwcElkOiAnYXBwSWQnLFxuICB0b2tlbjogJ3Rva2VuJyxcbiAgdXNlcm5hbWU6ICd1c2VybmFtZScsXG4gIGVycm9yOiAnZXJyb3InLFxuICBsb2NhbGU6ICdsb2NhbGUnLFxuICBwdWJsaWNTZXJ2ZXJVcmw6ICdwdWJsaWNTZXJ2ZXJVcmwnLFxufSk7XG5cbi8vIFRoZSBoZWFkZXIgcHJlZml4IHRvIGFkZCBwYWdlIHBhcmFtcyBhcyByZXNwb25zZSBoZWFkZXJzXG5jb25zdCBwYWdlUGFyYW1IZWFkZXJQcmVmaXggPSAneC1wYXJzZS1wYWdlLXBhcmFtLSc7XG5cbi8vIFRoZSBlcnJvcnMgYmVpbmcgdGhyb3duXG5jb25zdCBlcnJvcnMgPSBPYmplY3QuZnJlZXplKHtcbiAganNvbkZhaWxlZEZpbGVMb2FkaW5nOiAnZmFpbGVkIHRvIGxvYWQgSlNPTiBmaWxlJyxcbiAgZmlsZU91dHNpZGVBbGxvd2VkU2NvcGU6ICdub3QgYWxsb3dlZCB0byByZWFkIGZpbGUgb3V0c2lkZSBvZiBwYWdlcyBkaXJlY3RvcnknLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBQYWdlc1JvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICAvKipcbiAgICogQ29uc3RydWN0cyBhIFBhZ2VzUm91dGVyLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFnZXMgVGhlIHBhZ2VzIG9wdGlvbnMgZnJvbSB0aGUgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4gICAqL1xuICBjb25zdHJ1Y3RvcihwYWdlcyA9IHt9KSB7XG4gICAgc3VwZXIoKTtcblxuICAgIC8vIFNldCBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gICAgdGhpcy5wYWdlc0NvbmZpZyA9IHBhZ2VzO1xuICAgIHRoaXMucGFnZXNFbmRwb2ludCA9IHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPyBwYWdlcy5wYWdlc0VuZHBvaW50IDogJ2FwcHMnO1xuICAgIHRoaXMucGFnZXNQYXRoID0gcGFnZXMucGFnZXNQYXRoXG4gICAgICA/IHBhdGgucmVzb2x2ZSgnLi8nLCBwYWdlcy5wYWdlc1BhdGgpXG4gICAgICA6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9wdWJsaWMnKTtcbiAgICB0aGlzLmxvYWRKc29uUmVzb3VyY2UoKTtcbiAgICB0aGlzLm1vdW50UGFnZXNSb3V0ZXMoKTtcbiAgICB0aGlzLm1vdW50Q3VzdG9tUm91dGVzKCk7XG4gICAgdGhpcy5tb3VudFN0YXRpY1JvdXRlKCk7XG4gIH1cblxuICB2ZXJpZnlFbWFpbChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IHsgdG9rZW46IHJhd1Rva2VuIH0gPSByZXEucXVlcnk7XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci52ZXJpZnlFbWFpbCh0b2tlbikudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblN1Y2Nlc3MpO1xuICAgICAgfSxcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgcmVzZW5kVmVyaWZpY2F0aW9uRW1haWwocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCB1c2VybmFtZSA9IHJlcS5ib2R5Py51c2VybmFtZTtcbiAgICBjb25zdCByYXdUb2tlbiA9IHJlcS5ib2R5Py50b2tlbjtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGlmICghdXNlcm5hbWUgJiYgIXRva2VuKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIGNvbnN0IHN1cHByZXNzRXJyb3IgPSBjb25maWcuZW1haWxWZXJpZnlTdWNjZXNzT25JbnZhbGlkRW1haWwgPz8gdHJ1ZTtcblxuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZXNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VybmFtZSwgcmVxLCB0b2tlbikudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGlmIChzdXBwcmVzc0Vycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWwpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBwYXNzd29yZFJlc2V0KHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiByZXEucGFyYW1zLmFwcElkLFxuICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgW3BhZ2VQYXJhbXMudG9rZW5dOiByZXEucXVlcnkudG9rZW4sXG4gICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHJlcS5xdWVyeS51c2VybmFtZSxcbiAgICAgIFtwYWdlUGFyYW1zLnB1YmxpY1NlcnZlclVybF06IGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXQsIHBhcmFtcyk7XG4gIH1cblxuICByZXF1ZXN0UmVzZXRQYXNzd29yZChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLnF1ZXJ5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldExpbmtJbnZhbGlkKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29uZmlnLnVzZXJDb250cm9sbGVyLmNoZWNrUmVzZXRUb2tlblZhbGlkaXR5KHRva2VuKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMudG9rZW5dOiB0b2tlbixcbiAgICAgICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IGNvbmZpZy5hcHBsaWNhdGlvbklkLFxuICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0LCBwYXJhbXMpO1xuICAgICAgfSxcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0TGlua0ludmFsaWQpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICByZXNldFBhc3N3b3JkKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGNvbnN0IHsgbmV3X3Bhc3N3b3JkLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5ib2R5IHx8IHt9O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICgoIXRva2VuIHx8ICFuZXdfcGFzc3dvcmQpICYmIHJlcS54aHIgPT09IGZhbHNlKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTWlzc2luZyB0b2tlbicpO1xuICAgIH1cblxuICAgIGlmICghbmV3X3Bhc3N3b3JkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ01pc3NpbmcgcGFzc3dvcmQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29uZmlnLnVzZXJDb250cm9sbGVyXG4gICAgICAudXBkYXRlUGFzc3dvcmQodG9rZW4sIG5ld19wYXNzd29yZClcbiAgICAgIC50aGVuKFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBlcnIgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBlcnIsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXEueGhyKSB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgICAgICAgIHJlc3BvbnNlOiAnUGFzc3dvcmQgc3VjY2Vzc2Z1bGx5IHJlc2V0JyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocmVzdWx0LmVycikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgJHtyZXN1bHQuZXJyfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gcmVzdWx0LnN1Y2Nlc3NcbiAgICAgICAgICA/IHt9XG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHRva2VuLFxuICAgICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwbGljYXRpb25JZCxcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLmVycm9yXTogcmVzdWx0LmVycixcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgICB9O1xuXG4gICAgICAgIGlmIChyZXN1bHQ/LmVyciA9PT0gJ1RoZSBwYXNzd29yZCByZXNldCBsaW5rIGhhcyBleHBpcmVkJykge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVtwYWdlUGFyYW1zLnRva2VuXTtcbiAgICAgICAgICBxdWVyeVtwYWdlUGFyYW1zLnRva2VuXSA9IHRva2VuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhZ2UgPSByZXN1bHQuc3VjY2VzcyA/IHBhZ2VzLnBhc3N3b3JkUmVzZXRTdWNjZXNzIDogcGFnZXMucGFzc3dvcmRSZXNldDtcblxuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2UsIHF1ZXJ5LCBmYWxzZSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHBhZ2UgY29udGVudCBpZiB0aGUgcGFnZSBpcyBhIGxvY2FsIGZpbGUgb3IgcmV0dXJucyBhXG4gICAqIHJlZGlyZWN0IHRvIGEgY3VzdG9tIHBhZ2UuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtQYWdlfSBwYWdlIFRoZSBwYWdlIHRvIGdvIHRvLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW3BhcmFtcz17fV0gVGhlIHF1ZXJ5IHBhcmFtZXRlcnMgdG8gYXR0YWNoIHRvIHRoZSBVUkwgaW4gY2FzZSBvZlxuICAgKiBIVFRQIHJlZGlyZWN0IHJlc3BvbnNlcyBmb3IgUE9TVCByZXF1ZXN0cywgb3IgdGhlIHBsYWNlaG9sZGVycyB0byBmaWxsIGludG9cbiAgICogdGhlIHJlc3BvbnNlIGNvbnRlbnQgaW4gY2FzZSBvZiBIVFRQIGNvbnRlbnQgcmVzcG9uc2VzIGZvciBHRVQgcmVxdWVzdHMuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW3Jlc3BvbnNlVHlwZV0gSXMgdHJ1ZSBpZiBhIHJlZGlyZWN0IHJlc3BvbnNlIHNob3VsZCBiZSBmb3JjZWQsXG4gICAqIGZhbHNlIGlmIGEgY29udGVudCByZXNwb25zZSBzaG91bGQgYmUgZm9yY2VkLCB1bmRlZmluZWQgaWYgdGhlIHJlc3BvbnNlIHR5cGVcbiAgICogc2hvdWxkIGRlcGVuZCBvbiB0aGUgcmVxdWVzdCB0eXBlIGJ5IGRlZmF1bHQ6XG4gICAqIC0gR0VUIHJlcXVlc3QgLT4gY29udGVudCByZXNwb25zZVxuICAgKiAtIFBPU1QgcmVxdWVzdCAtPiByZWRpcmVjdCByZXNwb25zZSAoUFJHIHBhdHRlcm4pXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSBQcm9taXNlUm91dGVyIHJlc3BvbnNlLlxuICAgKi9cbiAgZ29Ub1BhZ2UocmVxLCBwYWdlLCBwYXJhbXMgPSB7fSwgcmVzcG9uc2VUeXBlKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcblxuICAgIC8vIERldGVybWluZSByZWRpcmVjdCBlaXRoZXIgYnkgZm9yY2UsIHJlc3BvbnNlIHNldHRpbmcgb3IgcmVxdWVzdCBtZXRob2RcbiAgICBjb25zdCByZWRpcmVjdCA9IGNvbmZpZy5wYWdlcy5mb3JjZVJlZGlyZWN0XG4gICAgICA/IHRydWVcbiAgICAgIDogcmVzcG9uc2VUeXBlICE9PSB1bmRlZmluZWRcbiAgICAgICAgPyByZXNwb25zZVR5cGVcbiAgICAgICAgOiByZXEubWV0aG9kID09ICdQT1NUJztcblxuICAgIC8vIEluY2x1ZGUgZGVmYXVsdCBwYXJhbWV0ZXJzXG4gICAgY29uc3QgZGVmYXVsdFBhcmFtcyA9IHRoaXMuZ2V0RGVmYXVsdFBhcmFtcyhjb25maWcpO1xuICAgIGlmIChPYmplY3QudmFsdWVzKGRlZmF1bHRQYXJhbXMpLmluY2x1ZGVzKHVuZGVmaW5lZCkpIHtcbiAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgfVxuICAgIHBhcmFtcyA9IE9iamVjdC5hc3NpZ24ocGFyYW1zLCBkZWZhdWx0UGFyYW1zKTtcblxuICAgIC8vIEFkZCBsb2NhbGUgdG8gcGFyYW1zIHRvIGVuc3VyZSBpdCBpcyBwYXNzZWQgb24gd2l0aCBldmVyeSByZXF1ZXN0O1xuICAgIC8vIHRoYXQgbWVhbnMsIG9uY2UgYSBsb2NhbGUgaXMgc2V0LCBpdCBpcyBwYXNzZWQgb24gdG8gYW55IGZvbGxvdy11cCBwYWdlLFxuICAgIC8vIGUuZy4gcmVxdWVzdF9wYXNzd29yZF9yZXNldCAtPiBwYXNzd29yZF9yZXNldCAtPiBwYXNzd29yZF9yZXNldF9zdWNjZXNzXG4gICAgY29uc3QgbG9jYWxlID0gdGhpcy5nZXRMb2NhbGUocmVxKTtcbiAgICBwYXJhbXNbcGFnZVBhcmFtcy5sb2NhbGVdID0gbG9jYWxlO1xuXG4gICAgLy8gQ29tcG9zZSBwYXRocyBhbmQgVVJMc1xuICAgIGNvbnN0IGRlZmF1bHRGaWxlID0gcGFnZS5kZWZhdWx0RmlsZTtcbiAgICBjb25zdCBkZWZhdWx0UGF0aCA9IHRoaXMuZGVmYXVsdFBhZ2VQYXRoKGRlZmF1bHRGaWxlKTtcbiAgICBjb25zdCBkZWZhdWx0VXJsID0gdGhpcy5jb21wb3NlUGFnZVVybChkZWZhdWx0RmlsZSwgY29uZmlnLnB1YmxpY1NlcnZlclVSTCk7XG5cbiAgICAvLyBJZiBjdXN0b20gVVJMIGlzIHNldCByZWRpcmVjdCB0byBpdCB3aXRob3V0IGxvY2FsaXphdGlvblxuICAgIGNvbnN0IGN1c3RvbVVybCA9IGNvbmZpZy5wYWdlcy5jdXN0b21VcmxzW3BhZ2UuaWRdO1xuICAgIGlmIChjdXN0b21VcmwgJiYgIVV0aWxzLmlzUGF0aChjdXN0b21VcmwpKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWRpcmVjdFJlc3BvbnNlKGN1c3RvbVVybCwgcGFyYW1zKTtcbiAgICB9XG5cbiAgICAvLyBHZXQgSlNPTiBwbGFjZWhvbGRlcnNcbiAgICBsZXQgcGxhY2Vob2xkZXJzID0ge307XG4gICAgaWYgKGNvbmZpZy5wYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gJiYgY29uZmlnLnBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSB7XG4gICAgICBwbGFjZWhvbGRlcnMgPSB0aGlzLmdldEpzb25QbGFjZWhvbGRlcnMobG9jYWxlLCBwYXJhbXMpO1xuICAgIH1cblxuICAgIC8vIFNlbmQgcmVzcG9uc2VcbiAgICBpZiAoY29uZmlnLnBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiAmJiBsb2NhbGUpIHtcbiAgICAgIHJldHVybiBVdGlscy5nZXRMb2NhbGl6ZWRQYXRoKGRlZmF1bHRQYXRoLCBsb2NhbGUpLnRoZW4oKHsgcGF0aCwgc3ViZGlyIH0pID0+XG4gICAgICAgIHJlZGlyZWN0XG4gICAgICAgICAgPyB0aGlzLnJlZGlyZWN0UmVzcG9uc2UoXG4gICAgICAgICAgICB0aGlzLmNvbXBvc2VQYWdlVXJsKGRlZmF1bHRGaWxlLCBjb25maWcucHVibGljU2VydmVyVVJMLCBzdWJkaXIpLFxuICAgICAgICAgICAgcGFyYW1zXG4gICAgICAgICAgKVxuICAgICAgICAgIDogdGhpcy5wYWdlUmVzcG9uc2UocGF0aCwgcGFyYW1zLCBwbGFjZWhvbGRlcnMpXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcmVkaXJlY3RcbiAgICAgICAgPyB0aGlzLnJlZGlyZWN0UmVzcG9uc2UoZGVmYXVsdFVybCwgcGFyYW1zKVxuICAgICAgICA6IHRoaXMucGFnZVJlc3BvbnNlKGRlZmF1bHRQYXRoLCBwYXJhbXMsIHBsYWNlaG9sZGVycyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlcnZlcyBhIHJlcXVlc3QgdG8gYSBzdGF0aWMgcmVzb3VyY2UgYW5kIGxvY2FsaXplcyB0aGUgcmVzb3VyY2UgaWYgaXRcbiAgICogaXMgYSBIVE1MIGZpbGUuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBUaGUgcmVzcG9uc2UuXG4gICAqL1xuICBzdGF0aWNSb3V0ZShyZXEpIHtcbiAgICAvLyBHZXQgcmVxdWVzdGVkIHBhdGhcbiAgICBjb25zdCByZWxhdGl2ZVBhdGggPSByZXEucGFyYW1zWydyZXNvdXJjZSddWzBdO1xuXG4gICAgLy8gUmVzb2x2ZSByZXF1ZXN0ZWQgcGF0aCB0byBhYnNvbHV0ZSBwYXRoXG4gICAgY29uc3QgYWJzb2x1dGVQYXRoID0gcGF0aC5yZXNvbHZlKHRoaXMucGFnZXNQYXRoLCByZWxhdGl2ZVBhdGgpO1xuXG4gICAgLy8gSWYgdGhlIHJlcXVlc3RlZCBmaWxlIGlzIG5vdCBhIEhUTUwgZmlsZSBzZW5kIGl0cyByYXcgY29udGVudFxuICAgIGlmICghYWJzb2x1dGVQYXRoIHx8ICFhYnNvbHV0ZVBhdGguZW5kc1dpdGgoJy5odG1sJykpIHtcbiAgICAgIHJldHVybiB0aGlzLmZpbGVSZXNwb25zZShhYnNvbHV0ZVBhdGgpO1xuICAgIH1cblxuICAgIC8vIEdldCBwYXJhbWV0ZXJzXG4gICAgY29uc3QgcGFyYW1zID0gdGhpcy5nZXREZWZhdWx0UGFyYW1zKHJlcS5jb25maWcpO1xuICAgIGNvbnN0IGxvY2FsZSA9IHRoaXMuZ2V0TG9jYWxlKHJlcSk7XG4gICAgaWYgKGxvY2FsZSkge1xuICAgICAgcGFyYW1zLmxvY2FsZSA9IGxvY2FsZTtcbiAgICB9XG5cbiAgICAvLyBHZXQgSlNPTiBwbGFjZWhvbGRlcnNcbiAgICBjb25zdCBwbGFjZWhvbGRlcnMgPSB0aGlzLmdldEpzb25QbGFjZWhvbGRlcnMobG9jYWxlLCBwYXJhbXMpO1xuXG4gICAgcmV0dXJuIHRoaXMucGFnZVJlc3BvbnNlKGFic29sdXRlUGF0aCwgcGFyYW1zLCBwbGFjZWhvbGRlcnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSB0cmFuc2xhdGlvbiBmcm9tIHRoZSBKU09OIHJlc291cmNlIGZvciBhIGdpdmVuIGxvY2FsZS4gVGhlIEpTT05cbiAgICogcmVzb3VyY2UgaXMgcGFyc2VkIGFjY29yZGluZyB0byBpMThuZXh0IHN5bnRheC5cbiAgICpcbiAgICogRXhhbXBsZSBKU09OIGNvbnRlbnQ6XG4gICAqIGBgYGpzXG4gICAqICB7XG4gICAqICAgIFwiZW5cIjogeyAgICAgICAgICAgICAgIC8vIHJlc291cmNlIGZvciBsYW5ndWFnZSBgZW5gIChFbmdsaXNoKVxuICAgKiAgICAgIFwidHJhbnNsYXRpb25cIjoge1xuICAgKiAgICAgICAgXCJncmVldGluZ1wiOiBcIkhlbGxvIVwiXG4gICAqICAgICAgfVxuICAgKiAgICB9LFxuICAgKiAgICBcImRlXCI6IHsgICAgICAgICAgICAgICAvLyByZXNvdXJjZSBmb3IgbGFuZ3VhZ2UgYGRlYCAoR2VybWFuKVxuICAgKiAgICAgIFwidHJhbnNsYXRpb25cIjoge1xuICAgKiAgICAgICAgXCJncmVldGluZ1wiOiBcIkhhbGxvIVwiXG4gICAqICAgICAgfVxuICAgKiAgICB9XG4gICAqICAgIFwiZGUtQ0hcIjogeyAgICAgICAgICAgIC8vIHJlc291cmNlIGZvciBsb2NhbGUgYGRlLUNIYCAoU3dpc3MgR2VybWFuKVxuICAgKiAgICAgIFwidHJhbnNsYXRpb25cIjoge1xuICAgKiAgICAgICAgXCJncmVldGluZ1wiOiBcIkdyw7xlemkhXCJcbiAgICogICAgICB9XG4gICAqICAgIH1cbiAgICogIH1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBsb2NhbGUgVGhlIGxvY2FsZSB0byB0cmFuc2xhdGUgdG8uXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSB0cmFuc2xhdGlvbiBvciBhbiBlbXB0eSBvYmplY3QgaWYgbm8gbWF0Y2hpbmdcbiAgICogdHJhbnNsYXRpb24gd2FzIGZvdW5kLlxuICAgKi9cbiAgZ2V0SnNvblRyYW5zbGF0aW9uKGxvY2FsZSkge1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIEpTT04gcmVzb3VyY2VcbiAgICBpZiAodGhpcy5qc29uUGFyYW1ldGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuXG4gICAgLy8gSWYgbG9jYWxlIGlzIG5vdCBzZXQgdXNlIHRoZSBmYWxsYmFjayBsb2NhbGVcbiAgICBsb2NhbGUgPSBsb2NhbGUgfHwgdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZTtcblxuICAgIC8vIEdldCBtYXRjaGluZyB0cmFuc2xhdGlvbiBieSBsb2NhbGUsIGxhbmd1YWdlIG9yIGZhbGxiYWNrIGxvY2FsZVxuICAgIGNvbnN0IGxhbmd1YWdlID0gbG9jYWxlLnNwbGl0KCctJylbMF07XG4gICAgY29uc3QgcmVzb3VyY2UgPVxuICAgICAgdGhpcy5qc29uUGFyYW1ldGVyc1tsb2NhbGVdIHx8XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzW2xhbmd1YWdlXSB8fFxuICAgICAgdGhpcy5qc29uUGFyYW1ldGVyc1t0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlXSB8fFxuICAgICAge307XG4gICAgY29uc3QgdHJhbnNsYXRpb24gPSByZXNvdXJjZS50cmFuc2xhdGlvbiB8fCB7fTtcbiAgICByZXR1cm4gdHJhbnNsYXRpb247XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhIHRyYW5zbGF0aW9uIGZyb20gdGhlIEpTT04gcmVzb3VyY2UgZm9yIGEgZ2l2ZW4gbG9jYWxlIHdpdGhcbiAgICogcGxhY2Vob2xkZXJzIGZpbGxlZCBpbiBieSBnaXZlbiBwYXJhbWV0ZXJzLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUgdG8gdHJhbnNsYXRlIHRvLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzIHRvIGZpbGwgaW50byBhbnkgcGxhY2Vob2xkZXJzXG4gICAqIHdpdGhpbiB0aGUgdHJhbnNsYXRpb25zLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgdHJhbnNsYXRpb24gb3IgYW4gZW1wdHkgb2JqZWN0IGlmIG5vIG1hdGNoaW5nXG4gICAqIHRyYW5zbGF0aW9uIHdhcyBmb3VuZC5cbiAgICovXG4gIGdldEpzb25QbGFjZWhvbGRlcnMobG9jYWxlLCBwYXJhbXMgPSB7fSkge1xuICAgIC8vIElmIGxvY2FsaXphdGlvbiBpcyBkaXNhYmxlZCBvciB0aGVyZSBpcyBubyBKU09OIHJlc291cmNlXG4gICAgaWYgKCF0aGlzLnBhZ2VzQ29uZmlnLmVuYWJsZUxvY2FsaXphdGlvbiB8fCAhdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25Kc29uUGF0aCkge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cblxuICAgIC8vIEdldCBKU09OIHBsYWNlaG9sZGVyc1xuICAgIGxldCBwbGFjZWhvbGRlcnMgPSB0aGlzLmdldEpzb25UcmFuc2xhdGlvbihsb2NhbGUpO1xuXG4gICAgLy8gRmlsbCBpbiBhbnkgcGxhY2Vob2xkZXJzIGluIHRoZSB0cmFuc2xhdGlvbjsgdGhpcyBhbGxvd3MgYSB0cmFuc2xhdGlvblxuICAgIC8vIHRvIGNvbnRhaW4gZGVmYXVsdCBwbGFjZWhvbGRlcnMgbGlrZSB7e2FwcE5hbWV9fSB3aGljaCBhcmUgZmlsbGVkIGhlcmVcbiAgICBwbGFjZWhvbGRlcnMgPSBKU09OLnN0cmluZ2lmeShwbGFjZWhvbGRlcnMpO1xuICAgIHBsYWNlaG9sZGVycyA9IG11c3RhY2hlLnJlbmRlcihwbGFjZWhvbGRlcnMsIHBhcmFtcyk7XG4gICAgcGxhY2Vob2xkZXJzID0gSlNPTi5wYXJzZShwbGFjZWhvbGRlcnMpO1xuXG4gICAgcmV0dXJuIHBsYWNlaG9sZGVycztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgcmVzcG9uc2Ugd2l0aCBmaWxlIGNvbnRlbnQuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBmaWxlIHRvIHJldHVybi5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtwYXJhbXM9e31dIFRoZSBwYXJhbWV0ZXJzIHRvIGJlIGluY2x1ZGVkIGluIHRoZSByZXNwb25zZVxuICAgKiBoZWFkZXIuIFRoZXNlIHdpbGwgYWxzbyBiZSB1c2VkIHRvIGZpbGwgcGxhY2Vob2xkZXJzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW3BsYWNlaG9sZGVycz17fV0gVGhlIHBsYWNlaG9sZGVycyB0byBmaWxsIGluIHRoZSBjb250ZW50LlxuICAgKiBUaGVzZSB3aWxsIG5vdCBiZSBpbmNsdWRlZCBpbiB0aGUgcmVzcG9uc2UgaGVhZGVyLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgUHJvbWlzZSBSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBhc3luYyBwYWdlUmVzcG9uc2UocGF0aCwgcGFyYW1zID0ge30sIHBsYWNlaG9sZGVycyA9IHt9KSB7XG4gICAgLy8gR2V0IGZpbGUgY29udGVudFxuICAgIGxldCBkYXRhO1xuICAgIHRyeSB7XG4gICAgICBkYXRhID0gYXdhaXQgdGhpcy5yZWFkRmlsZShwYXRoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgfVxuXG4gICAgLy8gR2V0IGNvbmZpZyBwbGFjZWhvbGRlcnM7IGNhbiBiZSBhbiBvYmplY3QsIGEgZnVuY3Rpb24gb3IgYW4gYXN5bmMgZnVuY3Rpb25cbiAgICBsZXQgY29uZmlnUGxhY2Vob2xkZXJzID1cbiAgICAgIHR5cGVvZiB0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVycyA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICA/IHRoaXMucGFnZXNDb25maWcucGxhY2Vob2xkZXJzKHBhcmFtcylcbiAgICAgICAgOiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnMpID09PSAnW29iamVjdCBPYmplY3RdJ1xuICAgICAgICAgID8gdGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnNcbiAgICAgICAgICA6IHt9O1xuICAgIGlmIChjb25maWdQbGFjZWhvbGRlcnMgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICBjb25maWdQbGFjZWhvbGRlcnMgPSBhd2FpdCBjb25maWdQbGFjZWhvbGRlcnM7XG4gICAgfVxuXG4gICAgLy8gRmlsbCBwbGFjZWhvbGRlcnNcbiAgICBjb25zdCBhbGxQbGFjZWhvbGRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBjb25maWdQbGFjZWhvbGRlcnMsIHBsYWNlaG9sZGVycyk7XG4gICAgY29uc3QgcGFyYW1zQW5kUGxhY2Vob2xkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgcGFyYW1zLCBhbGxQbGFjZWhvbGRlcnMpO1xuICAgIGRhdGEgPSBtdXN0YWNoZS5yZW5kZXIoZGF0YSwgcGFyYW1zQW5kUGxhY2Vob2xkZXJzKTtcblxuICAgIC8vIEFkZCBwbGFjZWhvbGRlcnMgaW4gaGVhZGVyIHRvIGFsbG93IHBhcnNpbmcgZm9yIHByb2dyYW1tYXRpYyB1c2VcbiAgICAvLyBvZiByZXNwb25zZSwgaW5zdGVhZCBvZiBoYXZpbmcgdG8gcGFyc2UgdGhlIEhUTUwgY29udGVudC5cbiAgICBjb25zdCBoZWFkZXJzID0gT2JqZWN0LmVudHJpZXMocGFyYW1zKS5yZWR1Y2UoKG0sIHApID0+IHtcbiAgICAgIGlmIChwWzFdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbVtgJHtwYWdlUGFyYW1IZWFkZXJQcmVmaXh9JHtwWzBdLnRvTG93ZXJDYXNlKCl9YF0gPSBwWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG07XG4gICAgfSwge30pO1xuXG4gICAgcmV0dXJuIHsgdGV4dDogZGF0YSwgaGVhZGVyczogaGVhZGVycyB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGZpbGUgY29udGVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgUHJvbWlzZVJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIGZpbGVSZXNwb25zZShwYXRoKSB7XG4gICAgLy8gR2V0IGZpbGUgY29udGVudFxuICAgIGxldCBkYXRhO1xuICAgIHRyeSB7XG4gICAgICBkYXRhID0gYXdhaXQgdGhpcy5yZWFkRmlsZShwYXRoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgdGV4dDogZGF0YSB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFJlYWRzIGFuZCByZXR1cm5zIHRoZSBjb250ZW50IG9mIGEgZmlsZSBhdCBhIGdpdmVuIHBhdGguIEZpbGUgcmVhZGluZyB0b1xuICAgKiBzZXJ2ZSBjb250ZW50IG9uIHRoZSBzdGF0aWMgcm91dGUgaXMgb25seSBhbGxvd2VkIGZyb20gdGhlIHBhZ2VzXG4gICAqIGRpcmVjdG9yeSBvbiBkb3dud2FyZHMuXG4gICAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAqICoqV0FSTklORzoqKiBBbGwgZmlsZSByZWFkcyBpbiB0aGUgUGFnZXNSb3V0ZXIgbXVzdCBiZSBleGVjdXRlZCBieSB0aGlzXG4gICAqIHdyYXBwZXIgYmVjYXVzZSBpdCBhbHNvIGRldGVjdHMgYW5kIHByZXZlbnRzIGNvbW1vbiBleHBsb2l0cy5cbiAgICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICogQHBhcmFtIHtTdHJpbmd9IGZpbGVQYXRoIFRoZSBwYXRoIHRvIHRoZSBmaWxlIHRvIHJlYWQuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFN0cmluZz59IFRoZSBmaWxlIGNvbnRlbnQuXG4gICAqL1xuICBhc3luYyByZWFkRmlsZShmaWxlUGF0aCkge1xuICAgIC8vIE5vcm1hbGl6ZSBwYXRoIHRvIHByZXZlbnQgaXQgZnJvbSBjb250YWluaW5nIGFueSBkaXJlY3RvcnkgY2hhbmdpbmdcbiAgICAvLyBVTklYIHBhdHRlcm5zIHdoaWNoIGNvdWxkIGV4cG9zZSB0aGUgd2hvbGUgZmlsZSBzeXN0ZW0sIGUuZy5cbiAgICAvLyBgaHR0cDovL2V4YW1wbGUuY29tL3BhcnNlL2FwcHMvLi4vZmlsZS50eHRgIHJlcXVlc3RzIGEgZmlsZSBvdXRzaWRlXG4gICAgLy8gb2YgdGhlIHBhZ2VzIGRpcmVjdG9yeSBzY29wZS5cbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IHBhdGgubm9ybWFsaXplKGZpbGVQYXRoKTtcblxuICAgIC8vIEFib3J0IGlmIHRoZSBwYXRoIGlzIG91dHNpZGUgb2YgdGhlIHBhdGggZGlyZWN0b3J5IHNjb3BlXG4gICAgaWYgKCFub3JtYWxpemVkUGF0aC5zdGFydHNXaXRoKHRoaXMucGFnZXNQYXRoICsgcGF0aC5zZXApKSB7XG4gICAgICB0aHJvdyBlcnJvcnMuZmlsZU91dHNpZGVBbGxvd2VkU2NvcGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGF3YWl0IGZzLnJlYWRGaWxlKG5vcm1hbGl6ZWRQYXRoLCAndXRmLTgnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2FkcyBhIGxhbmd1YWdlIHJlc291cmNlIEpTT04gZmlsZSB0aGF0IGlzIHVzZWQgZm9yIHRyYW5zbGF0aW9ucy5cbiAgICovXG4gIGxvYWRKc29uUmVzb3VyY2UoKSB7XG4gICAgaWYgKHRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QganNvbiA9IHJlcXVpcmUocGF0aC5yZXNvbHZlKCcuLycsIHRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uSnNvblBhdGgpKTtcbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnMgPSBqc29uO1xuICAgIH0gY2F0Y2gge1xuICAgICAgdGhyb3cgZXJyb3JzLmpzb25GYWlsZWRGaWxlTG9hZGluZztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdHMgYW5kIHJldHVybnMgdGhlIHBhZ2UgZGVmYXVsdCBwYXJhbWV0ZXJzIGZyb20gdGhlIFBhcnNlIFNlcnZlclxuICAgKiBjb25maWd1cmF0aW9uLiBUaGVzZSBwYXJhbWV0ZXJzIGFyZSBtYWRlIGFjY2Vzc2libGUgaW4gZXZlcnkgcGFnZSBzZXJ2ZWRcbiAgICogYnkgdGhpcyByb3V0ZXIuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgZGVmYXVsdCBwYXJhbWV0ZXJzLlxuICAgKi9cbiAgZ2V0RGVmYXVsdFBhcmFtcyhjb25maWcpIHtcbiAgICByZXR1cm4gY29uZmlnXG4gICAgICA/IHtcbiAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwSWQsXG4gICAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgW3BhZ2VQYXJhbXMucHVibGljU2VydmVyVXJsXTogY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgIH1cbiAgICAgIDoge307XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdHMgYW5kIHJldHVybnMgdGhlIGxvY2FsZSBmcm9tIGFuIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcmV0dXJucyB7U3RyaW5nfHVuZGVmaW5lZH0gVGhlIGxvY2FsZSwgb3IgdW5kZWZpbmVkIGlmIG5vIGxvY2FsZSB3YXMgc2V0LlxuICAgKi9cbiAgZ2V0TG9jYWxlKHJlcSkge1xuICAgIGNvbnN0IGxvY2FsZSA9XG4gICAgICAocmVxLnF1ZXJ5IHx8IHt9KVtwYWdlUGFyYW1zLmxvY2FsZV0gfHxcbiAgICAgIChyZXEuYm9keSB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLnBhcmFtcyB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLmhlYWRlcnMgfHwge30pW3BhZ2VQYXJhbUhlYWRlclByZWZpeCArIHBhZ2VQYXJhbXMubG9jYWxlXTtcblxuICAgIC8vIFZhbGlkYXRlIGxvY2FsZSBmb3JtYXQgdG8gcHJldmVudCBwYXRoIHRyYXZlcnNhbCBhbmQgaW52YWxpZFxuICAgIC8vIEhUVFAgaGVhZGVyIGNoYXJhY3RlcnM7IG9ubHkgYWxsb3cgc3RhbmRhcmQgbG9jYWxlIHBhdHRlcm5zXG4gICAgLy8gbGlrZSBcImVuXCIsIFwiZW4tVVNcIiwgXCJkZS1BVFwiLCBcInpoLUhhbnMtQ05cIlxuICAgIGlmIChsb2NhbGUgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgbG9jYWxlICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBsb2NhbGUgPT09ICdzdHJpbmcnICYmICEvXlthLXpBLVpdezIsM30oLVthLXpBLVowLTldezIsOH0pKiQvLnRlc3QobG9jYWxlKSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIGxvY2FsZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgcmVzcG9uc2Ugd2l0aCBodHRwIHJlZGlyZWN0LlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSBleHByZXNzIHJlcXVlc3QuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBmaWxlIHRvIHJldHVybi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcXVlcnkgcGFyYW1ldGVycyB0byBpbmNsdWRlLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgUHJvbWlzZSBSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBhc3luYyByZWRpcmVjdFJlc3BvbnNlKHVybCwgcGFyYW1zKSB7XG4gICAgLy8gUmVtb3ZlIGFueSBwYXJhbWV0ZXJzIHdpdGggdW5kZWZpbmVkIHZhbHVlXG4gICAgcGFyYW1zID0gT2JqZWN0LmVudHJpZXMocGFyYW1zKS5yZWR1Y2UoKG0sIHApID0+IHtcbiAgICAgIGlmIChwWzFdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbVtwWzBdXSA9IHBbMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gbTtcbiAgICB9LCB7fSk7XG5cbiAgICAvLyBDb21wb3NlIFVSTCB3aXRoIHBhcmFtZXRlcnMgaW4gcXVlcnlcbiAgICBjb25zdCBsb2NhdGlvbiA9IG5ldyBVUkwodXJsKTtcbiAgICBPYmplY3QuZW50cmllcyhwYXJhbXMpLmZvckVhY2gocCA9PiBsb2NhdGlvbi5zZWFyY2hQYXJhbXMuc2V0KHBbMF0sIHBbMV0pKTtcbiAgICBjb25zdCBsb2NhdGlvblN0cmluZyA9IGxvY2F0aW9uLnRvU3RyaW5nKCk7XG5cbiAgICAvLyBBZGQgcGFyYW1ldGVycyB0byBoZWFkZXIgdG8gYWxsb3cgcGFyc2luZyBmb3IgcHJvZ3JhbW1hdGljIHVzZVxuICAgIC8vIG9mIHJlc3BvbnNlLCBpbnN0ZWFkIG9mIGhhdmluZyB0byBwYXJzZSB0aGUgSFRNTCBjb250ZW50LlxuICAgIGNvbnN0IGhlYWRlcnMgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLnJlZHVjZSgobSwgcCkgPT4ge1xuICAgICAgaWYgKHBbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtW2Ake3BhZ2VQYXJhbUhlYWRlclByZWZpeH0ke3BbMF0udG9Mb3dlckNhc2UoKX1gXSA9IHBbMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gbTtcbiAgICB9LCB7fSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAzMDMsXG4gICAgICBsb2NhdGlvbjogbG9jYXRpb25TdHJpbmcsXG4gICAgICBoZWFkZXJzOiBoZWFkZXJzLFxuICAgIH07XG4gIH1cblxuICBkZWZhdWx0UGFnZVBhdGgoZmlsZSkge1xuICAgIHJldHVybiBwYXRoLmpvaW4odGhpcy5wYWdlc1BhdGgsIGZpbGUpO1xuICB9XG5cbiAgY29tcG9zZVBhZ2VVcmwoZmlsZSwgcHVibGljU2VydmVyVXJsLCBsb2NhbGUpIHtcbiAgICBsZXQgdXJsID0gcHVibGljU2VydmVyVXJsO1xuICAgIHVybCArPSB1cmwuZW5kc1dpdGgoJy8nKSA/ICcnIDogJy8nO1xuICAgIHVybCArPSB0aGlzLnBhZ2VzRW5kcG9pbnQgKyAnLyc7XG4gICAgdXJsICs9IGxvY2FsZSA9PT0gdW5kZWZpbmVkID8gJycgOiBsb2NhbGUgKyAnLyc7XG4gICAgdXJsICs9IGZpbGU7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxuXG4gIG5vdEZvdW5kKCkge1xuICAgIHJldHVybiB7XG4gICAgICB0ZXh0OiAnTm90IGZvdW5kLicsXG4gICAgICBzdGF0dXM6IDQwNCxcbiAgICB9O1xuICB9XG5cbiAgaW52YWxpZFJlcXVlc3QoKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoKTtcbiAgICBlcnJvci5zdGF0dXMgPSA0MDM7XG4gICAgZXJyb3IubWVzc2FnZSA9ICd1bmF1dGhvcml6ZWQnO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIGluIHRoZSByZXF1ZXN0IG9iamVjdCB0byBtYWtlIGl0XG4gICAqIGVhc2lseSBhY2Nlc3NpYmxlIHRocm91Z2h0b3V0IHJlcXVlc3QgcHJvY2Vzc2luZy5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtCb29sZWFufSBmYWlsR3JhY2VmdWxseSBJcyB0cnVlIGlmIGZhaWxpbmcgdG8gc2V0IHRoZSBjb25maWcgc2hvdWxkXG4gICAqIG5vdCByZXN1bHQgaW4gYW4gaW52YWxpZCByZXF1ZXN0IHJlc3BvbnNlLiBEZWZhdWx0IGlzIGBmYWxzZWAuXG4gICAqL1xuICBzZXRDb25maWcocmVxLCBmYWlsR3JhY2VmdWxseSA9IGZhbHNlKSB7XG4gICAgcmVxLmNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCB8fCByZXEucXVlcnkuYXBwSWQpO1xuICAgIGlmICghcmVxLmNvbmZpZyAmJiAhZmFpbEdyYWNlZnVsbHkpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgbW91bnRQYWdlc1JvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvdmVyaWZ5X2VtYWlsYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmVyaWZ5RW1haWwocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQT1NUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC9yZXNlbmRfdmVyaWZpY2F0aW9uX2VtYWlsYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVzZW5kVmVyaWZpY2F0aW9uRW1haWwocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vY2hvb3NlX3Bhc3N3b3JkYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFzc3dvcmRSZXNldChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BPU1QnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNldFBhc3N3b3JkKHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVxdWVzdFJlc2V0UGFzc3dvcmQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgbW91bnRDdXN0b21Sb3V0ZXMoKSB7XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiB0aGlzLnBhZ2VzQ29uZmlnLmN1c3RvbVJvdXRlcyB8fCBbXSkge1xuICAgICAgdGhpcy5yb3V0ZShcbiAgICAgICAgcm91dGUubWV0aG9kLFxuICAgICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvJHtyb3V0ZS5wYXRofWAsXG4gICAgICAgIHJlcSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgICAgfSxcbiAgICAgICAgYXN5bmMgcmVxID0+IHtcbiAgICAgICAgICBjb25zdCB7IGZpbGUsIHF1ZXJ5ID0ge30gfSA9IChhd2FpdCByb3V0ZS5oYW5kbGVyKHJlcSkpIHx8IHt9O1xuXG4gICAgICAgICAgLy8gSWYgcm91dGUgaGFuZGxlciBkaWQgbm90IHJldHVybiBhIHBhZ2Ugc2VuZCA0MDQgcmVzcG9uc2VcbiAgICAgICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gU2VuZCBwYWdlIHJlc3BvbnNlXG4gICAgICAgICAgY29uc3QgcGFnZSA9IG5ldyBQYWdlKHsgaWQ6IGZpbGUsIGRlZmF1bHRGaWxlOiBmaWxlIH0pO1xuICAgICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZSwgcXVlcnksIGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBtb3VudFN0YXRpY1JvdXRlKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LypyZXNvdXJjZWAsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEsIHRydWUpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXRpY1JvdXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGV4cHJlc3NSb3V0ZXIoKSB7XG4gICAgY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgICByb3V0ZXIudXNlKCcvJywgc3VwZXIuZXhwcmVzc1JvdXRlcigpKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhZ2VzUm91dGVyO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIFBhZ2VzUm91dGVyLFxuICBwYWdlUGFyYW1IZWFkZXJQcmVmaXgsXG4gIHBhZ2VQYXJhbXMsXG4gIHBhZ2VzLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsY0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsUUFBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUcsS0FBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksR0FBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssS0FBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sTUFBQSxHQUFBUCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU8sU0FBQSxHQUFBUixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVEsS0FBQSxHQUFBVCxzQkFBQSxDQUFBQyxPQUFBO0FBQTJCLFNBQUFELHVCQUFBVSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBRTNCO0FBQ0EsTUFBTUcsS0FBSyxHQUFHQyxNQUFNLENBQUNDLE1BQU0sQ0FBQztFQUMxQkMsYUFBYSxFQUFFLElBQUlDLGFBQUksQ0FBQztJQUFFQyxFQUFFLEVBQUUsZUFBZTtJQUFFQyxXQUFXLEVBQUU7RUFBc0IsQ0FBQyxDQUFDO0VBQ3BGQyxvQkFBb0IsRUFBRSxJQUFJSCxhQUFJLENBQUM7SUFDN0JDLEVBQUUsRUFBRSxzQkFBc0I7SUFDMUJDLFdBQVcsRUFBRTtFQUNmLENBQUMsQ0FBQztFQUNGRSx3QkFBd0IsRUFBRSxJ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