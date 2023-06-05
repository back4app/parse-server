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
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
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
      username,
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if (!config) {
      this.invalidRequest();
    }
    if (!token || !username) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }
    const userController = config.userController;
    return userController.verifyEmail(username, token).then(() => {
      const params = {
        [pageParams.username]: username
      };
      return this.goToPage(req, pages.emailVerificationSuccess, params);
    }, () => {
      const params = {
        [pageParams.username]: username
      };
      return this.goToPage(req, pages.emailVerificationLinkExpired, params);
    });
  }
  resendVerificationEmail(req) {
    const config = req.config;
    const username = req.body.username;
    if (!config) {
      this.invalidRequest();
    }
    if (!username) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }
    const userController = config.userController;
    return userController.resendVerificationEmail(username).then(() => {
      return this.goToPage(req, pages.emailVerificationSendSuccess);
    }, () => {
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
      username,
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if (!username || !token) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }
    return config.userController.checkResetTokenValidity(username, token).then(() => {
      const params = {
        [pageParams.token]: token,
        [pageParams.username]: username,
        [pageParams.appId]: config.applicationId,
        [pageParams.appName]: config.appName
      };
      return this.goToPage(req, pages.passwordReset, params);
    }, () => {
      const params = {
        [pageParams.username]: username
      };
      return this.goToPage(req, pages.passwordResetLinkInvalid, params);
    });
  }
  resetPassword(req) {
    const config = req.config;
    if (!config) {
      this.invalidRequest();
    }
    const {
      username,
      new_password,
      token: rawToken
    } = req.body;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if ((!username || !token || !new_password) && req.xhr === false) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }
    if (!username) {
      throw new _node.Parse.Error(_node.Parse.Error.USERNAME_MISSING, 'Missing username');
    }
    if (!token) {
      throw new _node.Parse.Error(_node.Parse.Error.OTHER_CAUSE, 'Missing token');
    }
    if (!new_password) {
      throw new _node.Parse.Error(_node.Parse.Error.PASSWORD_MISSING, 'Missing password');
    }
    return config.userController.updatePassword(username, token, new_password).then(() => {
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
      const query = result.success ? {
        [pageParams.username]: username
      } : {
        [pageParams.username]: username,
        [pageParams.token]: token,
        [pageParams.appId]: config.applicationId,
        [pageParams.error]: result.err,
        [pageParams.appName]: config.appName
      };
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
    const relativePath = req.params[0];

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
    } catch (e) {
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
    } catch (e) {
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
    if (!normalizedPath.startsWith(this.pagesPath)) {
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
    } catch (e) {
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
    this.route('GET', `/${this.pagesEndpoint}/(*)?`, req => {
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
var _default = PagesRouter;
exports.default = _default;
module.exports = {
  PagesRouter,
  pageParamHeaderPrefix,
  pageParams,
  pages
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9leHByZXNzIiwiX3BhdGgiLCJfZnMiLCJfbm9kZSIsIl9VdGlscyIsIl9tdXN0YWNoZSIsIl9QYWdlIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJwYWdlcyIsIk9iamVjdCIsImZyZWV6ZSIsInBhc3N3b3JkUmVzZXQiLCJQYWdlIiwiaWQiLCJkZWZhdWx0RmlsZSIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFzc3dvcmRSZXNldExpbmtJbnZhbGlkIiwiZW1haWxWZXJpZmljYXRpb25TdWNjZXNzIiwiZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCIsImVtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3MiLCJlbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkIiwiZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCIsInBhZ2VQYXJhbXMiLCJhcHBOYW1lIiwiYXBwSWQiLCJ0b2tlbiIsInVzZXJuYW1lIiwiZXJyb3IiLCJsb2NhbGUiLCJwdWJsaWNTZXJ2ZXJVcmwiLCJwYWdlUGFyYW1IZWFkZXJQcmVmaXgiLCJlcnJvcnMiLCJqc29uRmFpbGVkRmlsZUxvYWRpbmciLCJmaWxlT3V0c2lkZUFsbG93ZWRTY29wZSIsIlBhZ2VzUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsImNvbnN0cnVjdG9yIiwicGFnZXNDb25maWciLCJwYWdlc0VuZHBvaW50IiwicGFnZXNQYXRoIiwicGF0aCIsInJlc29sdmUiLCJfX2Rpcm5hbWUiLCJsb2FkSnNvblJlc291cmNlIiwibW91bnRQYWdlc1JvdXRlcyIsIm1vdW50Q3VzdG9tUm91dGVzIiwibW91bnRTdGF0aWNSb3V0ZSIsInZlcmlmeUVtYWlsIiwicmVxIiwiY29uZmlnIiwicmF3VG9rZW4iLCJxdWVyeSIsInRvU3RyaW5nIiwiaW52YWxpZFJlcXVlc3QiLCJnb1RvUGFnZSIsInVzZXJDb250cm9sbGVyIiwidGhlbiIsInBhcmFtcyIsInJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiYm9keSIsInB1YmxpY1NlcnZlclVSTCIsInJlcXVlc3RSZXNldFBhc3N3b3JkIiwiY2hlY2tSZXNldFRva2VuVmFsaWRpdHkiLCJhcHBsaWNhdGlvbklkIiwicmVzZXRQYXNzd29yZCIsIm5ld19wYXNzd29yZCIsInhociIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiT1RIRVJfQ0FVU0UiLCJQQVNTV09SRF9NSVNTSU5HIiwidXBkYXRlUGFzc3dvcmQiLCJQcm9taXNlIiwic3VjY2VzcyIsImVyciIsInJlc3VsdCIsInN0YXR1cyIsInJlc3BvbnNlIiwicGFnZSIsInJlc3BvbnNlVHlwZSIsInJlZGlyZWN0IiwiZm9yY2VSZWRpcmVjdCIsInVuZGVmaW5lZCIsIm1ldGhvZCIsImRlZmF1bHRQYXJhbXMiLCJnZXREZWZhdWx0UGFyYW1zIiwidmFsdWVzIiwiaW5jbHVkZXMiLCJub3RGb3VuZCIsImFzc2lnbiIsImdldExvY2FsZSIsImRlZmF1bHRQYXRoIiwiZGVmYXVsdFBhZ2VQYXRoIiwiZGVmYXVsdFVybCIsImNvbXBvc2VQYWdlVXJsIiwiY3VzdG9tVXJsIiwiY3VzdG9tVXJscyIsIlV0aWxzIiwiaXNQYXRoIiwicmVkaXJlY3RSZXNwb25zZSIsInBsYWNlaG9sZGVycyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiZ2V0SnNvblBsYWNlaG9sZGVycyIsImdldExvY2FsaXplZFBhdGgiLCJzdWJkaXIiLCJwYWdlUmVzcG9uc2UiLCJzdGF0aWNSb3V0ZSIsInJlbGF0aXZlUGF0aCIsImFic29sdXRlUGF0aCIsImVuZHNXaXRoIiwiZmlsZVJlc3BvbnNlIiwiZ2V0SnNvblRyYW5zbGF0aW9uIiwianNvblBhcmFtZXRlcnMiLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsImxhbmd1YWdlIiwic3BsaXQiLCJyZXNvdXJjZSIsInRyYW5zbGF0aW9uIiwiSlNPTiIsInN0cmluZ2lmeSIsIm11c3RhY2hlIiwicmVuZGVyIiwicGFyc2UiLCJkYXRhIiwicmVhZEZpbGUiLCJlIiwiY29uZmlnUGxhY2Vob2xkZXJzIiwicHJvdG90eXBlIiwiY2FsbCIsImFsbFBsYWNlaG9sZGVycyIsInBhcmFtc0FuZFBsYWNlaG9sZGVycyIsImhlYWRlcnMiLCJlbnRyaWVzIiwicmVkdWNlIiwibSIsInAiLCJ0b0xvd2VyQ2FzZSIsInRleHQiLCJmaWxlUGF0aCIsIm5vcm1hbGl6ZWRQYXRoIiwibm9ybWFsaXplIiwic3RhcnRzV2l0aCIsImZzIiwianNvbiIsInVybCIsImxvY2F0aW9uIiwiVVJMIiwiZm9yRWFjaCIsInNlYXJjaFBhcmFtcyIsInNldCIsImxvY2F0aW9uU3RyaW5nIiwiZmlsZSIsImpvaW4iLCJtZXNzYWdlIiwic2V0Q29uZmlnIiwiZmFpbEdyYWNlZnVsbHkiLCJDb25maWciLCJnZXQiLCJyb3V0ZSIsImN1c3RvbVJvdXRlcyIsImhhbmRsZXIiLCJleHByZXNzUm91dGVyIiwicm91dGVyIiwiZXhwcmVzcyIsIlJvdXRlciIsInVzZSIsImV4cG9ydHMiLCJfZGVmYXVsdCIsIm1vZHVsZSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1BhZ2VzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHByb21pc2VzIGFzIGZzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgbXVzdGFjaGUgZnJvbSAnbXVzdGFjaGUnO1xuaW1wb3J0IFBhZ2UgZnJvbSAnLi4vUGFnZSc7XG5cbi8vIEFsbCBwYWdlcyB3aXRoIGN1c3RvbSBwYWdlIGtleSBmb3IgcmVmZXJlbmNlIGFuZCBmaWxlIG5hbWVcbmNvbnN0IHBhZ2VzID0gT2JqZWN0LmZyZWV6ZSh7XG4gIHBhc3N3b3JkUmVzZXQ6IG5ldyBQYWdlKHsgaWQ6ICdwYXNzd29yZFJlc2V0JywgZGVmYXVsdEZpbGU6ICdwYXNzd29yZF9yZXNldC5odG1sJyB9KSxcbiAgcGFzc3dvcmRSZXNldFN1Y2Nlc3M6IG5ldyBQYWdlKHtcbiAgICBpZDogJ3Bhc3N3b3JkUmVzZXRTdWNjZXNzJyxcbiAgICBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbCcsXG4gIH0pLFxuICBwYXNzd29yZFJlc2V0TGlua0ludmFsaWQ6IG5ldyBQYWdlKHtcbiAgICBpZDogJ3Bhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdwYXNzd29yZF9yZXNldF9saW5rX2ludmFsaWQuaHRtbCcsXG4gIH0pLFxuICBlbWFpbFZlcmlmaWNhdGlvblN1Y2Nlc3M6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uU3VjY2VzcycsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWw6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWwnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX3NlbmRfZmFpbC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3M6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3MnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX3NlbmRfc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQ6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX2xpbmtfaW52YWxpZC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQ6IG5ldyBQYWdlKHtcbiAgICBpZDogJ2VtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQnLFxuICAgIGRlZmF1bHRGaWxlOiAnZW1haWxfdmVyaWZpY2F0aW9uX2xpbmtfZXhwaXJlZC5odG1sJyxcbiAgfSksXG59KTtcblxuLy8gQWxsIHBhZ2UgcGFyYW1ldGVycyBmb3IgcmVmZXJlbmNlIHRvIGJlIHVzZWQgYXMgdGVtcGxhdGUgcGxhY2Vob2xkZXJzIG9yIHF1ZXJ5IHBhcmFtc1xuY29uc3QgcGFnZVBhcmFtcyA9IE9iamVjdC5mcmVlemUoe1xuICBhcHBOYW1lOiAnYXBwTmFtZScsXG4gIGFwcElkOiAnYXBwSWQnLFxuICB0b2tlbjogJ3Rva2VuJyxcbiAgdXNlcm5hbWU6ICd1c2VybmFtZScsXG4gIGVycm9yOiAnZXJyb3InLFxuICBsb2NhbGU6ICdsb2NhbGUnLFxuICBwdWJsaWNTZXJ2ZXJVcmw6ICdwdWJsaWNTZXJ2ZXJVcmwnLFxufSk7XG5cbi8vIFRoZSBoZWFkZXIgcHJlZml4IHRvIGFkZCBwYWdlIHBhcmFtcyBhcyByZXNwb25zZSBoZWFkZXJzXG5jb25zdCBwYWdlUGFyYW1IZWFkZXJQcmVmaXggPSAneC1wYXJzZS1wYWdlLXBhcmFtLSc7XG5cbi8vIFRoZSBlcnJvcnMgYmVpbmcgdGhyb3duXG5jb25zdCBlcnJvcnMgPSBPYmplY3QuZnJlZXplKHtcbiAganNvbkZhaWxlZEZpbGVMb2FkaW5nOiAnZmFpbGVkIHRvIGxvYWQgSlNPTiBmaWxlJyxcbiAgZmlsZU91dHNpZGVBbGxvd2VkU2NvcGU6ICdub3QgYWxsb3dlZCB0byByZWFkIGZpbGUgb3V0c2lkZSBvZiBwYWdlcyBkaXJlY3RvcnknLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBQYWdlc1JvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICAvKipcbiAgICogQ29uc3RydWN0cyBhIFBhZ2VzUm91dGVyLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFnZXMgVGhlIHBhZ2VzIG9wdGlvbnMgZnJvbSB0aGUgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4gICAqL1xuICBjb25zdHJ1Y3RvcihwYWdlcyA9IHt9KSB7XG4gICAgc3VwZXIoKTtcblxuICAgIC8vIFNldCBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gICAgdGhpcy5wYWdlc0NvbmZpZyA9IHBhZ2VzO1xuICAgIHRoaXMucGFnZXNFbmRwb2ludCA9IHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPyBwYWdlcy5wYWdlc0VuZHBvaW50IDogJ2FwcHMnO1xuICAgIHRoaXMucGFnZXNQYXRoID0gcGFnZXMucGFnZXNQYXRoXG4gICAgICA/IHBhdGgucmVzb2x2ZSgnLi8nLCBwYWdlcy5wYWdlc1BhdGgpXG4gICAgICA6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9wdWJsaWMnKTtcbiAgICB0aGlzLmxvYWRKc29uUmVzb3VyY2UoKTtcbiAgICB0aGlzLm1vdW50UGFnZXNSb3V0ZXMoKTtcbiAgICB0aGlzLm1vdW50Q3VzdG9tUm91dGVzKCk7XG4gICAgdGhpcy5tb3VudFN0YXRpY1JvdXRlKCk7XG4gIH1cblxuICB2ZXJpZnlFbWFpbChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLnF1ZXJ5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgaWYgKCF0b2tlbiB8fCAhdXNlcm5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnZlcmlmeUVtYWlsKHVzZXJuYW1lLCB0b2tlbikudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25TdWNjZXNzLCBwYXJhbXMpO1xuICAgICAgfSxcbiAgICAgICgpID0+IHtcbiAgICAgICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCwgcGFyYW1zKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgcmVzZW5kVmVyaWZpY2F0aW9uRW1haWwocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCB1c2VybmFtZSA9IHJlcS5ib2R5LnVzZXJuYW1lO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuXG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXJuYW1lKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3MpO1xuICAgICAgfSxcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblNlbmRGYWlsKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgcGFzc3dvcmRSZXNldChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgIFtwYWdlUGFyYW1zLmFwcElkXTogcmVxLnBhcmFtcy5hcHBJZCxcbiAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgIFtwYWdlUGFyYW1zLnRva2VuXTogcmVxLnF1ZXJ5LnRva2VuLFxuICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiByZXEucXVlcnkudXNlcm5hbWUsXG4gICAgICBbcGFnZVBhcmFtcy5wdWJsaWNTZXJ2ZXJVcmxdOiBjb25maWcucHVibGljU2VydmVyVVJMLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0LCBwYXJhbXMpO1xuICB9XG5cbiAgcmVxdWVzdFJlc2V0UGFzc3dvcmQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgY29uc3QgeyB1c2VybmFtZSwgdG9rZW46IHJhd1Rva2VuIH0gPSByZXEucXVlcnk7XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCF1c2VybmFtZSB8fCAhdG9rZW4pIHtcbiAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldExpbmtJbnZhbGlkKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29uZmlnLnVzZXJDb250cm9sbGVyLmNoZWNrUmVzZXRUb2tlblZhbGlkaXR5KHVzZXJuYW1lLCB0b2tlbikudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgICAgIFtwYWdlUGFyYW1zLnRva2VuXTogdG9rZW4sXG4gICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IGNvbmZpZy5hcHBsaWNhdGlvbklkLFxuICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0LCBwYXJhbXMpO1xuICAgICAgfSxcbiAgICAgICgpID0+IHtcbiAgICAgICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldExpbmtJbnZhbGlkLCBwYXJhbXMpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICByZXNldFBhc3N3b3JkKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGNvbnN0IHsgdXNlcm5hbWUsIG5ld19wYXNzd29yZCwgdG9rZW46IHJhd1Rva2VuIH0gPSByZXEuYm9keTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoKCF1c2VybmFtZSB8fCAhdG9rZW4gfHwgIW5ld19wYXNzd29yZCkgJiYgcmVxLnhociA9PT0gZmFsc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldExpbmtJbnZhbGlkKTtcbiAgICB9XG5cbiAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ01pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdNaXNzaW5nIHRva2VuJyk7XG4gICAgfVxuXG4gICAgaWYgKCFuZXdfcGFzc3dvcmQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAnTWlzc2luZyBwYXNzd29yZCcpO1xuICAgIH1cblxuICAgIHJldHVybiBjb25maWcudXNlckNvbnRyb2xsZXJcbiAgICAgIC51cGRhdGVQYXNzd29yZCh1c2VybmFtZSwgdG9rZW4sIG5ld19wYXNzd29yZClcbiAgICAgIC50aGVuKFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBlcnIgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBlcnIsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXEueGhyKSB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgICAgc3RhdHVzOiAyMDAsXG4gICAgICAgICAgICAgIHJlc3BvbnNlOiAnUGFzc3dvcmQgc3VjY2Vzc2Z1bGx5IHJlc2V0JyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocmVzdWx0LmVycikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgJHtyZXN1bHQuZXJyfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gcmVzdWx0LnN1Y2Nlc3NcbiAgICAgICAgICA/IHtcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogdXNlcm5hbWUsXG4gICAgICAgICAgfVxuICAgICAgICAgIDoge1xuICAgICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLnRva2VuXTogdG9rZW4sXG4gICAgICAgICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IGNvbmZpZy5hcHBsaWNhdGlvbklkLFxuICAgICAgICAgICAgW3BhZ2VQYXJhbXMuZXJyb3JdOiByZXN1bHQuZXJyLFxuICAgICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIGNvbnN0IHBhZ2UgPSByZXN1bHQuc3VjY2VzcyA/IHBhZ2VzLnBhc3N3b3JkUmVzZXRTdWNjZXNzIDogcGFnZXMucGFzc3dvcmRSZXNldDtcblxuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2UsIHF1ZXJ5LCBmYWxzZSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHBhZ2UgY29udGVudCBpZiB0aGUgcGFnZSBpcyBhIGxvY2FsIGZpbGUgb3IgcmV0dXJucyBhXG4gICAqIHJlZGlyZWN0IHRvIGEgY3VzdG9tIHBhZ2UuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtQYWdlfSBwYWdlIFRoZSBwYWdlIHRvIGdvIHRvLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW3BhcmFtcz17fV0gVGhlIHF1ZXJ5IHBhcmFtZXRlcnMgdG8gYXR0YWNoIHRvIHRoZSBVUkwgaW4gY2FzZSBvZlxuICAgKiBIVFRQIHJlZGlyZWN0IHJlc3BvbnNlcyBmb3IgUE9TVCByZXF1ZXN0cywgb3IgdGhlIHBsYWNlaG9sZGVycyB0byBmaWxsIGludG9cbiAgICogdGhlIHJlc3BvbnNlIGNvbnRlbnQgaW4gY2FzZSBvZiBIVFRQIGNvbnRlbnQgcmVzcG9uc2VzIGZvciBHRVQgcmVxdWVzdHMuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW3Jlc3BvbnNlVHlwZV0gSXMgdHJ1ZSBpZiBhIHJlZGlyZWN0IHJlc3BvbnNlIHNob3VsZCBiZSBmb3JjZWQsXG4gICAqIGZhbHNlIGlmIGEgY29udGVudCByZXNwb25zZSBzaG91bGQgYmUgZm9yY2VkLCB1bmRlZmluZWQgaWYgdGhlIHJlc3BvbnNlIHR5cGVcbiAgICogc2hvdWxkIGRlcGVuZCBvbiB0aGUgcmVxdWVzdCB0eXBlIGJ5IGRlZmF1bHQ6XG4gICAqIC0gR0VUIHJlcXVlc3QgLT4gY29udGVudCByZXNwb25zZVxuICAgKiAtIFBPU1QgcmVxdWVzdCAtPiByZWRpcmVjdCByZXNwb25zZSAoUFJHIHBhdHRlcm4pXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSBQcm9taXNlUm91dGVyIHJlc3BvbnNlLlxuICAgKi9cbiAgZ29Ub1BhZ2UocmVxLCBwYWdlLCBwYXJhbXMgPSB7fSwgcmVzcG9uc2VUeXBlKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcblxuICAgIC8vIERldGVybWluZSByZWRpcmVjdCBlaXRoZXIgYnkgZm9yY2UsIHJlc3BvbnNlIHNldHRpbmcgb3IgcmVxdWVzdCBtZXRob2RcbiAgICBjb25zdCByZWRpcmVjdCA9IGNvbmZpZy5wYWdlcy5mb3JjZVJlZGlyZWN0XG4gICAgICA/IHRydWVcbiAgICAgIDogcmVzcG9uc2VUeXBlICE9PSB1bmRlZmluZWRcbiAgICAgICAgPyByZXNwb25zZVR5cGVcbiAgICAgICAgOiByZXEubWV0aG9kID09ICdQT1NUJztcblxuICAgIC8vIEluY2x1ZGUgZGVmYXVsdCBwYXJhbWV0ZXJzXG4gICAgY29uc3QgZGVmYXVsdFBhcmFtcyA9IHRoaXMuZ2V0RGVmYXVsdFBhcmFtcyhjb25maWcpO1xuICAgIGlmIChPYmplY3QudmFsdWVzKGRlZmF1bHRQYXJhbXMpLmluY2x1ZGVzKHVuZGVmaW5lZCkpIHtcbiAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgfVxuICAgIHBhcmFtcyA9IE9iamVjdC5hc3NpZ24ocGFyYW1zLCBkZWZhdWx0UGFyYW1zKTtcblxuICAgIC8vIEFkZCBsb2NhbGUgdG8gcGFyYW1zIHRvIGVuc3VyZSBpdCBpcyBwYXNzZWQgb24gd2l0aCBldmVyeSByZXF1ZXN0O1xuICAgIC8vIHRoYXQgbWVhbnMsIG9uY2UgYSBsb2NhbGUgaXMgc2V0LCBpdCBpcyBwYXNzZWQgb24gdG8gYW55IGZvbGxvdy11cCBwYWdlLFxuICAgIC8vIGUuZy4gcmVxdWVzdF9wYXNzd29yZF9yZXNldCAtPiBwYXNzd29yZF9yZXNldCAtPiBwYXNzd29yZF9yZXNldF9zdWNjZXNzXG4gICAgY29uc3QgbG9jYWxlID0gdGhpcy5nZXRMb2NhbGUocmVxKTtcbiAgICBwYXJhbXNbcGFnZVBhcmFtcy5sb2NhbGVdID0gbG9jYWxlO1xuXG4gICAgLy8gQ29tcG9zZSBwYXRocyBhbmQgVVJMc1xuICAgIGNvbnN0IGRlZmF1bHRGaWxlID0gcGFnZS5kZWZhdWx0RmlsZTtcbiAgICBjb25zdCBkZWZhdWx0UGF0aCA9IHRoaXMuZGVmYXVsdFBhZ2VQYXRoKGRlZmF1bHRGaWxlKTtcbiAgICBjb25zdCBkZWZhdWx0VXJsID0gdGhpcy5jb21wb3NlUGFnZVVybChkZWZhdWx0RmlsZSwgY29uZmlnLnB1YmxpY1NlcnZlclVSTCk7XG5cbiAgICAvLyBJZiBjdXN0b20gVVJMIGlzIHNldCByZWRpcmVjdCB0byBpdCB3aXRob3V0IGxvY2FsaXphdGlvblxuICAgIGNvbnN0IGN1c3RvbVVybCA9IGNvbmZpZy5wYWdlcy5jdXN0b21VcmxzW3BhZ2UuaWRdO1xuICAgIGlmIChjdXN0b21VcmwgJiYgIVV0aWxzLmlzUGF0aChjdXN0b21VcmwpKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWRpcmVjdFJlc3BvbnNlKGN1c3RvbVVybCwgcGFyYW1zKTtcbiAgICB9XG5cbiAgICAvLyBHZXQgSlNPTiBwbGFjZWhvbGRlcnNcbiAgICBsZXQgcGxhY2Vob2xkZXJzID0ge307XG4gICAgaWYgKGNvbmZpZy5wYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gJiYgY29uZmlnLnBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSB7XG4gICAgICBwbGFjZWhvbGRlcnMgPSB0aGlzLmdldEpzb25QbGFjZWhvbGRlcnMobG9jYWxlLCBwYXJhbXMpO1xuICAgIH1cblxuICAgIC8vIFNlbmQgcmVzcG9uc2VcbiAgICBpZiAoY29uZmlnLnBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiAmJiBsb2NhbGUpIHtcbiAgICAgIHJldHVybiBVdGlscy5nZXRMb2NhbGl6ZWRQYXRoKGRlZmF1bHRQYXRoLCBsb2NhbGUpLnRoZW4oKHsgcGF0aCwgc3ViZGlyIH0pID0+XG4gICAgICAgIHJlZGlyZWN0XG4gICAgICAgICAgPyB0aGlzLnJlZGlyZWN0UmVzcG9uc2UoXG4gICAgICAgICAgICB0aGlzLmNvbXBvc2VQYWdlVXJsKGRlZmF1bHRGaWxlLCBjb25maWcucHVibGljU2VydmVyVVJMLCBzdWJkaXIpLFxuICAgICAgICAgICAgcGFyYW1zXG4gICAgICAgICAgKVxuICAgICAgICAgIDogdGhpcy5wYWdlUmVzcG9uc2UocGF0aCwgcGFyYW1zLCBwbGFjZWhvbGRlcnMpXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcmVkaXJlY3RcbiAgICAgICAgPyB0aGlzLnJlZGlyZWN0UmVzcG9uc2UoZGVmYXVsdFVybCwgcGFyYW1zKVxuICAgICAgICA6IHRoaXMucGFnZVJlc3BvbnNlKGRlZmF1bHRQYXRoLCBwYXJhbXMsIHBsYWNlaG9sZGVycyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlcnZlcyBhIHJlcXVlc3QgdG8gYSBzdGF0aWMgcmVzb3VyY2UgYW5kIGxvY2FsaXplcyB0aGUgcmVzb3VyY2UgaWYgaXRcbiAgICogaXMgYSBIVE1MIGZpbGUuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBUaGUgcmVzcG9uc2UuXG4gICAqL1xuICBzdGF0aWNSb3V0ZShyZXEpIHtcbiAgICAvLyBHZXQgcmVxdWVzdGVkIHBhdGhcbiAgICBjb25zdCByZWxhdGl2ZVBhdGggPSByZXEucGFyYW1zWzBdO1xuXG4gICAgLy8gUmVzb2x2ZSByZXF1ZXN0ZWQgcGF0aCB0byBhYnNvbHV0ZSBwYXRoXG4gICAgY29uc3QgYWJzb2x1dGVQYXRoID0gcGF0aC5yZXNvbHZlKHRoaXMucGFnZXNQYXRoLCByZWxhdGl2ZVBhdGgpO1xuXG4gICAgLy8gSWYgdGhlIHJlcXVlc3RlZCBmaWxlIGlzIG5vdCBhIEhUTUwgZmlsZSBzZW5kIGl0cyByYXcgY29udGVudFxuICAgIGlmICghYWJzb2x1dGVQYXRoIHx8ICFhYnNvbHV0ZVBhdGguZW5kc1dpdGgoJy5odG1sJykpIHtcbiAgICAgIHJldHVybiB0aGlzLmZpbGVSZXNwb25zZShhYnNvbHV0ZVBhdGgpO1xuICAgIH1cblxuICAgIC8vIEdldCBwYXJhbWV0ZXJzXG4gICAgY29uc3QgcGFyYW1zID0gdGhpcy5nZXREZWZhdWx0UGFyYW1zKHJlcS5jb25maWcpO1xuICAgIGNvbnN0IGxvY2FsZSA9IHRoaXMuZ2V0TG9jYWxlKHJlcSk7XG4gICAgaWYgKGxvY2FsZSkge1xuICAgICAgcGFyYW1zLmxvY2FsZSA9IGxvY2FsZTtcbiAgICB9XG5cbiAgICAvLyBHZXQgSlNPTiBwbGFjZWhvbGRlcnNcbiAgICBjb25zdCBwbGFjZWhvbGRlcnMgPSB0aGlzLmdldEpzb25QbGFjZWhvbGRlcnMobG9jYWxlLCBwYXJhbXMpO1xuXG4gICAgcmV0dXJuIHRoaXMucGFnZVJlc3BvbnNlKGFic29sdXRlUGF0aCwgcGFyYW1zLCBwbGFjZWhvbGRlcnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSB0cmFuc2xhdGlvbiBmcm9tIHRoZSBKU09OIHJlc291cmNlIGZvciBhIGdpdmVuIGxvY2FsZS4gVGhlIEpTT05cbiAgICogcmVzb3VyY2UgaXMgcGFyc2VkIGFjY29yZGluZyB0byBpMThuZXh0IHN5bnRheC5cbiAgICpcbiAgICogRXhhbXBsZSBKU09OIGNvbnRlbnQ6XG4gICAqIGBgYGpzXG4gICAqICB7XG4gICAqICAgIFwiZW5cIjogeyAgICAgICAgICAgICAgIC8vIHJlc291cmNlIGZvciBsYW5ndWFnZSBgZW5gIChFbmdsaXNoKVxuICAgKiAgICAgIFwidHJhbnNsYXRpb25cIjoge1xuICAgKiAgICAgICAgXCJncmVldGluZ1wiOiBcIkhlbGxvIVwiXG4gICAqICAgICAgfVxuICAgKiAgICB9LFxuICAgKiAgICBcImRlXCI6IHsgICAgICAgICAgICAgICAvLyByZXNvdXJjZSBmb3IgbGFuZ3VhZ2UgYGRlYCAoR2VybWFuKVxuICAgKiAgICAgIFwidHJhbnNsYXRpb25cIjoge1xuICAgKiAgICAgICAgXCJncmVldGluZ1wiOiBcIkhhbGxvIVwiXG4gICAqICAgICAgfVxuICAgKiAgICB9XG4gICAqICAgIFwiZGUtQ0hcIjogeyAgICAgICAgICAgIC8vIHJlc291cmNlIGZvciBsb2NhbGUgYGRlLUNIYCAoU3dpc3MgR2VybWFuKVxuICAgKiAgICAgIFwidHJhbnNsYXRpb25cIjoge1xuICAgKiAgICAgICAgXCJncmVldGluZ1wiOiBcIkdyw7xlemkhXCJcbiAgICogICAgICB9XG4gICAqICAgIH1cbiAgICogIH1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBsb2NhbGUgVGhlIGxvY2FsZSB0byB0cmFuc2xhdGUgdG8uXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSB0cmFuc2xhdGlvbiBvciBhbiBlbXB0eSBvYmplY3QgaWYgbm8gbWF0Y2hpbmdcbiAgICogdHJhbnNsYXRpb24gd2FzIGZvdW5kLlxuICAgKi9cbiAgZ2V0SnNvblRyYW5zbGF0aW9uKGxvY2FsZSkge1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIEpTT04gcmVzb3VyY2VcbiAgICBpZiAodGhpcy5qc29uUGFyYW1ldGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuXG4gICAgLy8gSWYgbG9jYWxlIGlzIG5vdCBzZXQgdXNlIHRoZSBmYWxsYmFjayBsb2NhbGVcbiAgICBsb2NhbGUgPSBsb2NhbGUgfHwgdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZTtcblxuICAgIC8vIEdldCBtYXRjaGluZyB0cmFuc2xhdGlvbiBieSBsb2NhbGUsIGxhbmd1YWdlIG9yIGZhbGxiYWNrIGxvY2FsZVxuICAgIGNvbnN0IGxhbmd1YWdlID0gbG9jYWxlLnNwbGl0KCctJylbMF07XG4gICAgY29uc3QgcmVzb3VyY2UgPVxuICAgICAgdGhpcy5qc29uUGFyYW1ldGVyc1tsb2NhbGVdIHx8XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzW2xhbmd1YWdlXSB8fFxuICAgICAgdGhpcy5qc29uUGFyYW1ldGVyc1t0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlXSB8fFxuICAgICAge307XG4gICAgY29uc3QgdHJhbnNsYXRpb24gPSByZXNvdXJjZS50cmFuc2xhdGlvbiB8fCB7fTtcbiAgICByZXR1cm4gdHJhbnNsYXRpb247XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhIHRyYW5zbGF0aW9uIGZyb20gdGhlIEpTT04gcmVzb3VyY2UgZm9yIGEgZ2l2ZW4gbG9jYWxlIHdpdGhcbiAgICogcGxhY2Vob2xkZXJzIGZpbGxlZCBpbiBieSBnaXZlbiBwYXJhbWV0ZXJzLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUgdG8gdHJhbnNsYXRlIHRvLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzIHRvIGZpbGwgaW50byBhbnkgcGxhY2Vob2xkZXJzXG4gICAqIHdpdGhpbiB0aGUgdHJhbnNsYXRpb25zLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgdHJhbnNsYXRpb24gb3IgYW4gZW1wdHkgb2JqZWN0IGlmIG5vIG1hdGNoaW5nXG4gICAqIHRyYW5zbGF0aW9uIHdhcyBmb3VuZC5cbiAgICovXG4gIGdldEpzb25QbGFjZWhvbGRlcnMobG9jYWxlLCBwYXJhbXMgPSB7fSkge1xuICAgIC8vIElmIGxvY2FsaXphdGlvbiBpcyBkaXNhYmxlZCBvciB0aGVyZSBpcyBubyBKU09OIHJlc291cmNlXG4gICAgaWYgKCF0aGlzLnBhZ2VzQ29uZmlnLmVuYWJsZUxvY2FsaXphdGlvbiB8fCAhdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25Kc29uUGF0aCkge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cblxuICAgIC8vIEdldCBKU09OIHBsYWNlaG9sZGVyc1xuICAgIGxldCBwbGFjZWhvbGRlcnMgPSB0aGlzLmdldEpzb25UcmFuc2xhdGlvbihsb2NhbGUpO1xuXG4gICAgLy8gRmlsbCBpbiBhbnkgcGxhY2Vob2xkZXJzIGluIHRoZSB0cmFuc2xhdGlvbjsgdGhpcyBhbGxvd3MgYSB0cmFuc2xhdGlvblxuICAgIC8vIHRvIGNvbnRhaW4gZGVmYXVsdCBwbGFjZWhvbGRlcnMgbGlrZSB7e2FwcE5hbWV9fSB3aGljaCBhcmUgZmlsbGVkIGhlcmVcbiAgICBwbGFjZWhvbGRlcnMgPSBKU09OLnN0cmluZ2lmeShwbGFjZWhvbGRlcnMpO1xuICAgIHBsYWNlaG9sZGVycyA9IG11c3RhY2hlLnJlbmRlcihwbGFjZWhvbGRlcnMsIHBhcmFtcyk7XG4gICAgcGxhY2Vob2xkZXJzID0gSlNPTi5wYXJzZShwbGFjZWhvbGRlcnMpO1xuXG4gICAgcmV0dXJuIHBsYWNlaG9sZGVycztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgcmVzcG9uc2Ugd2l0aCBmaWxlIGNvbnRlbnQuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBmaWxlIHRvIHJldHVybi5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtwYXJhbXM9e31dIFRoZSBwYXJhbWV0ZXJzIHRvIGJlIGluY2x1ZGVkIGluIHRoZSByZXNwb25zZVxuICAgKiBoZWFkZXIuIFRoZXNlIHdpbGwgYWxzbyBiZSB1c2VkIHRvIGZpbGwgcGxhY2Vob2xkZXJzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW3BsYWNlaG9sZGVycz17fV0gVGhlIHBsYWNlaG9sZGVycyB0byBmaWxsIGluIHRoZSBjb250ZW50LlxuICAgKiBUaGVzZSB3aWxsIG5vdCBiZSBpbmNsdWRlZCBpbiB0aGUgcmVzcG9uc2UgaGVhZGVyLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgUHJvbWlzZSBSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBhc3luYyBwYWdlUmVzcG9uc2UocGF0aCwgcGFyYW1zID0ge30sIHBsYWNlaG9sZGVycyA9IHt9KSB7XG4gICAgLy8gR2V0IGZpbGUgY29udGVudFxuICAgIGxldCBkYXRhO1xuICAgIHRyeSB7XG4gICAgICBkYXRhID0gYXdhaXQgdGhpcy5yZWFkRmlsZShwYXRoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3RGb3VuZCgpO1xuICAgIH1cblxuICAgIC8vIEdldCBjb25maWcgcGxhY2Vob2xkZXJzOyBjYW4gYmUgYW4gb2JqZWN0LCBhIGZ1bmN0aW9uIG9yIGFuIGFzeW5jIGZ1bmN0aW9uXG4gICAgbGV0IGNvbmZpZ1BsYWNlaG9sZGVycyA9XG4gICAgICB0eXBlb2YgdGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnMgPT09ICdmdW5jdGlvbidcbiAgICAgICAgPyB0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVycyhwYXJhbXMpXG4gICAgICAgIDogT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHRoaXMucGFnZXNDb25maWcucGxhY2Vob2xkZXJzKSA9PT0gJ1tvYmplY3QgT2JqZWN0XSdcbiAgICAgICAgICA/IHRoaXMucGFnZXNDb25maWcucGxhY2Vob2xkZXJzXG4gICAgICAgICAgOiB7fTtcbiAgICBpZiAoY29uZmlnUGxhY2Vob2xkZXJzIGluc3RhbmNlb2YgUHJvbWlzZSkge1xuICAgICAgY29uZmlnUGxhY2Vob2xkZXJzID0gYXdhaXQgY29uZmlnUGxhY2Vob2xkZXJzO1xuICAgIH1cblxuICAgIC8vIEZpbGwgcGxhY2Vob2xkZXJzXG4gICAgY29uc3QgYWxsUGxhY2Vob2xkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgY29uZmlnUGxhY2Vob2xkZXJzLCBwbGFjZWhvbGRlcnMpO1xuICAgIGNvbnN0IHBhcmFtc0FuZFBsYWNlaG9sZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIHBhcmFtcywgYWxsUGxhY2Vob2xkZXJzKTtcbiAgICBkYXRhID0gbXVzdGFjaGUucmVuZGVyKGRhdGEsIHBhcmFtc0FuZFBsYWNlaG9sZGVycyk7XG5cbiAgICAvLyBBZGQgcGxhY2Vob2xkZXJzIGluIGhlYWRlciB0byBhbGxvdyBwYXJzaW5nIGZvciBwcm9ncmFtbWF0aWMgdXNlXG4gICAgLy8gb2YgcmVzcG9uc2UsIGluc3RlYWQgb2YgaGF2aW5nIHRvIHBhcnNlIHRoZSBIVE1MIGNvbnRlbnQuXG4gICAgY29uc3QgaGVhZGVycyA9IE9iamVjdC5lbnRyaWVzKHBhcmFtcykucmVkdWNlKChtLCBwKSA9PiB7XG4gICAgICBpZiAocFsxXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIG1bYCR7cGFnZVBhcmFtSGVhZGVyUHJlZml4fSR7cFswXS50b0xvd2VyQ2FzZSgpfWBdID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIHJldHVybiB7IHRleHQ6IGRhdGEsIGhlYWRlcnM6IGhlYWRlcnMgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgcmVzcG9uc2Ugd2l0aCBmaWxlIGNvbnRlbnQuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBmaWxlIHRvIHJldHVybi5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIFByb21pc2VSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBhc3luYyBmaWxlUmVzcG9uc2UocGF0aCkge1xuICAgIC8vIEdldCBmaWxlIGNvbnRlbnRcbiAgICBsZXQgZGF0YTtcbiAgICB0cnkge1xuICAgICAgZGF0YSA9IGF3YWl0IHRoaXMucmVhZEZpbGUocGF0aCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICB9XG5cbiAgICByZXR1cm4geyB0ZXh0OiBkYXRhIH07XG4gIH1cblxuICAvKipcbiAgICogUmVhZHMgYW5kIHJldHVybnMgdGhlIGNvbnRlbnQgb2YgYSBmaWxlIGF0IGEgZ2l2ZW4gcGF0aC4gRmlsZSByZWFkaW5nIHRvXG4gICAqIHNlcnZlIGNvbnRlbnQgb24gdGhlIHN0YXRpYyByb3V0ZSBpcyBvbmx5IGFsbG93ZWQgZnJvbSB0aGUgcGFnZXNcbiAgICogZGlyZWN0b3J5IG9uIGRvd253YXJkcy5cbiAgICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICogKipXQVJOSU5HOioqIEFsbCBmaWxlIHJlYWRzIGluIHRoZSBQYWdlc1JvdXRlciBtdXN0IGJlIGV4ZWN1dGVkIGJ5IHRoaXNcbiAgICogd3JhcHBlciBiZWNhdXNlIGl0IGFsc28gZGV0ZWN0cyBhbmQgcHJldmVudHMgY29tbW9uIGV4cGxvaXRzLlxuICAgKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgKiBAcGFyYW0ge1N0cmluZ30gZmlsZVBhdGggVGhlIHBhdGggdG8gdGhlIGZpbGUgdG8gcmVhZC5cbiAgICogQHJldHVybnMge1Byb21pc2U8U3RyaW5nPn0gVGhlIGZpbGUgY29udGVudC5cbiAgICovXG4gIGFzeW5jIHJlYWRGaWxlKGZpbGVQYXRoKSB7XG4gICAgLy8gTm9ybWFsaXplIHBhdGggdG8gcHJldmVudCBpdCBmcm9tIGNvbnRhaW5pbmcgYW55IGRpcmVjdG9yeSBjaGFuZ2luZ1xuICAgIC8vIFVOSVggcGF0dGVybnMgd2hpY2ggY291bGQgZXhwb3NlIHRoZSB3aG9sZSBmaWxlIHN5c3RlbSwgZS5nLlxuICAgIC8vIGBodHRwOi8vZXhhbXBsZS5jb20vcGFyc2UvYXBwcy8uLi9maWxlLnR4dGAgcmVxdWVzdHMgYSBmaWxlIG91dHNpZGVcbiAgICAvLyBvZiB0aGUgcGFnZXMgZGlyZWN0b3J5IHNjb3BlLlxuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcGF0aC5ub3JtYWxpemUoZmlsZVBhdGgpO1xuXG4gICAgLy8gQWJvcnQgaWYgdGhlIHBhdGggaXMgb3V0c2lkZSBvZiB0aGUgcGF0aCBkaXJlY3Rvcnkgc2NvcGVcbiAgICBpZiAoIW5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgodGhpcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyBlcnJvcnMuZmlsZU91dHNpZGVBbGxvd2VkU2NvcGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGF3YWl0IGZzLnJlYWRGaWxlKG5vcm1hbGl6ZWRQYXRoLCAndXRmLTgnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2FkcyBhIGxhbmd1YWdlIHJlc291cmNlIEpTT04gZmlsZSB0aGF0IGlzIHVzZWQgZm9yIHRyYW5zbGF0aW9ucy5cbiAgICovXG4gIGxvYWRKc29uUmVzb3VyY2UoKSB7XG4gICAgaWYgKHRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QganNvbiA9IHJlcXVpcmUocGF0aC5yZXNvbHZlKCcuLycsIHRoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uSnNvblBhdGgpKTtcbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnMgPSBqc29uO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRocm93IGVycm9ycy5qc29uRmFpbGVkRmlsZUxvYWRpbmc7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEV4dHJhY3RzIGFuZCByZXR1cm5zIHRoZSBwYWdlIGRlZmF1bHQgcGFyYW1ldGVycyBmcm9tIHRoZSBQYXJzZSBTZXJ2ZXJcbiAgICogY29uZmlndXJhdGlvbi4gVGhlc2UgcGFyYW1ldGVycyBhcmUgbWFkZSBhY2Nlc3NpYmxlIGluIGV2ZXJ5IHBhZ2Ugc2VydmVkXG4gICAqIGJ5IHRoaXMgcm91dGVyLlxuICAgKiBAcGFyYW0ge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbi5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIGRlZmF1bHQgcGFyYW1ldGVycy5cbiAgICovXG4gIGdldERlZmF1bHRQYXJhbXMoY29uZmlnKSB7XG4gICAgcmV0dXJuIGNvbmZpZ1xuICAgICAgPyB7XG4gICAgICAgIFtwYWdlUGFyYW1zLmFwcElkXTogY29uZmlnLmFwcElkLFxuICAgICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIFtwYWdlUGFyYW1zLnB1YmxpY1NlcnZlclVybF06IGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICB9XG4gICAgICA6IHt9O1xuICB9XG5cbiAgLyoqXG4gICAqIEV4dHJhY3RzIGFuZCByZXR1cm5zIHRoZSBsb2NhbGUgZnJvbSBhbiBleHByZXNzIHJlcXVlc3QuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHJldHVybnMge1N0cmluZ3x1bmRlZmluZWR9IFRoZSBsb2NhbGUsIG9yIHVuZGVmaW5lZCBpZiBubyBsb2NhbGUgd2FzIHNldC5cbiAgICovXG4gIGdldExvY2FsZShyZXEpIHtcbiAgICBjb25zdCBsb2NhbGUgPVxuICAgICAgKHJlcS5xdWVyeSB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLmJvZHkgfHwge30pW3BhZ2VQYXJhbXMubG9jYWxlXSB8fFxuICAgICAgKHJlcS5wYXJhbXMgfHwge30pW3BhZ2VQYXJhbXMubG9jYWxlXSB8fFxuICAgICAgKHJlcS5oZWFkZXJzIHx8IHt9KVtwYWdlUGFyYW1IZWFkZXJQcmVmaXggKyBwYWdlUGFyYW1zLmxvY2FsZV07XG4gICAgcmV0dXJuIGxvY2FsZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgcmVzcG9uc2Ugd2l0aCBodHRwIHJlZGlyZWN0LlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSBleHByZXNzIHJlcXVlc3QuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBmaWxlIHRvIHJldHVybi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcXVlcnkgcGFyYW1ldGVycyB0byBpbmNsdWRlLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgUHJvbWlzZSBSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBhc3luYyByZWRpcmVjdFJlc3BvbnNlKHVybCwgcGFyYW1zKSB7XG4gICAgLy8gUmVtb3ZlIGFueSBwYXJhbWV0ZXJzIHdpdGggdW5kZWZpbmVkIHZhbHVlXG4gICAgcGFyYW1zID0gT2JqZWN0LmVudHJpZXMocGFyYW1zKS5yZWR1Y2UoKG0sIHApID0+IHtcbiAgICAgIGlmIChwWzFdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbVtwWzBdXSA9IHBbMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gbTtcbiAgICB9LCB7fSk7XG5cbiAgICAvLyBDb21wb3NlIFVSTCB3aXRoIHBhcmFtZXRlcnMgaW4gcXVlcnlcbiAgICBjb25zdCBsb2NhdGlvbiA9IG5ldyBVUkwodXJsKTtcbiAgICBPYmplY3QuZW50cmllcyhwYXJhbXMpLmZvckVhY2gocCA9PiBsb2NhdGlvbi5zZWFyY2hQYXJhbXMuc2V0KHBbMF0sIHBbMV0pKTtcbiAgICBjb25zdCBsb2NhdGlvblN0cmluZyA9IGxvY2F0aW9uLnRvU3RyaW5nKCk7XG5cbiAgICAvLyBBZGQgcGFyYW1ldGVycyB0byBoZWFkZXIgdG8gYWxsb3cgcGFyc2luZyBmb3IgcHJvZ3JhbW1hdGljIHVzZVxuICAgIC8vIG9mIHJlc3BvbnNlLCBpbnN0ZWFkIG9mIGhhdmluZyB0byBwYXJzZSB0aGUgSFRNTCBjb250ZW50LlxuICAgIGNvbnN0IGhlYWRlcnMgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLnJlZHVjZSgobSwgcCkgPT4ge1xuICAgICAgaWYgKHBbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtW2Ake3BhZ2VQYXJhbUhlYWRlclByZWZpeH0ke3BbMF0udG9Mb3dlckNhc2UoKX1gXSA9IHBbMV07XG4gICAgICB9XG4gICAgICByZXR1cm4gbTtcbiAgICB9LCB7fSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAzMDMsXG4gICAgICBsb2NhdGlvbjogbG9jYXRpb25TdHJpbmcsXG4gICAgICBoZWFkZXJzOiBoZWFkZXJzLFxuICAgIH07XG4gIH1cblxuICBkZWZhdWx0UGFnZVBhdGgoZmlsZSkge1xuICAgIHJldHVybiBwYXRoLmpvaW4odGhpcy5wYWdlc1BhdGgsIGZpbGUpO1xuICB9XG5cbiAgY29tcG9zZVBhZ2VVcmwoZmlsZSwgcHVibGljU2VydmVyVXJsLCBsb2NhbGUpIHtcbiAgICBsZXQgdXJsID0gcHVibGljU2VydmVyVXJsO1xuICAgIHVybCArPSB1cmwuZW5kc1dpdGgoJy8nKSA/ICcnIDogJy8nO1xuICAgIHVybCArPSB0aGlzLnBhZ2VzRW5kcG9pbnQgKyAnLyc7XG4gICAgdXJsICs9IGxvY2FsZSA9PT0gdW5kZWZpbmVkID8gJycgOiBsb2NhbGUgKyAnLyc7XG4gICAgdXJsICs9IGZpbGU7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxuXG4gIG5vdEZvdW5kKCkge1xuICAgIHJldHVybiB7XG4gICAgICB0ZXh0OiAnTm90IGZvdW5kLicsXG4gICAgICBzdGF0dXM6IDQwNCxcbiAgICB9O1xuICB9XG5cbiAgaW52YWxpZFJlcXVlc3QoKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoKTtcbiAgICBlcnJvci5zdGF0dXMgPSA0MDM7XG4gICAgZXJyb3IubWVzc2FnZSA9ICd1bmF1dGhvcml6ZWQnO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIGluIHRoZSByZXF1ZXN0IG9iamVjdCB0byBtYWtlIGl0XG4gICAqIGVhc2lseSBhY2Nlc3NpYmxlIHRocm91Z2h0b3V0IHJlcXVlc3QgcHJvY2Vzc2luZy5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtCb29sZWFufSBmYWlsR3JhY2VmdWxseSBJcyB0cnVlIGlmIGZhaWxpbmcgdG8gc2V0IHRoZSBjb25maWcgc2hvdWxkXG4gICAqIG5vdCByZXN1bHQgaW4gYW4gaW52YWxpZCByZXF1ZXN0IHJlc3BvbnNlLiBEZWZhdWx0IGlzIGBmYWxzZWAuXG4gICAqL1xuICBzZXRDb25maWcocmVxLCBmYWlsR3JhY2VmdWxseSA9IGZhbHNlKSB7XG4gICAgcmVxLmNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCB8fCByZXEucXVlcnkuYXBwSWQpO1xuICAgIGlmICghcmVxLmNvbmZpZyAmJiAhZmFpbEdyYWNlZnVsbHkpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgbW91bnRQYWdlc1JvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvdmVyaWZ5X2VtYWlsYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmVyaWZ5RW1haWwocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQT1NUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC9yZXNlbmRfdmVyaWZpY2F0aW9uX2VtYWlsYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVzZW5kVmVyaWZpY2F0aW9uRW1haWwocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vY2hvb3NlX3Bhc3N3b3JkYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFzc3dvcmRSZXNldChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BPU1QnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNldFBhc3N3b3JkKHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVxdWVzdFJlc2V0UGFzc3dvcmQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgbW91bnRDdXN0b21Sb3V0ZXMoKSB7XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiB0aGlzLnBhZ2VzQ29uZmlnLmN1c3RvbVJvdXRlcyB8fCBbXSkge1xuICAgICAgdGhpcy5yb3V0ZShcbiAgICAgICAgcm91dGUubWV0aG9kLFxuICAgICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvJHtyb3V0ZS5wYXRofWAsXG4gICAgICAgIHJlcSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgICAgfSxcbiAgICAgICAgYXN5bmMgcmVxID0+IHtcbiAgICAgICAgICBjb25zdCB7IGZpbGUsIHF1ZXJ5ID0ge30gfSA9IChhd2FpdCByb3V0ZS5oYW5kbGVyKHJlcSkpIHx8IHt9O1xuXG4gICAgICAgICAgLy8gSWYgcm91dGUgaGFuZGxlciBkaWQgbm90IHJldHVybiBhIHBhZ2Ugc2VuZCA0MDQgcmVzcG9uc2VcbiAgICAgICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gU2VuZCBwYWdlIHJlc3BvbnNlXG4gICAgICAgICAgY29uc3QgcGFnZSA9IG5ldyBQYWdlKHsgaWQ6IGZpbGUsIGRlZmF1bHRGaWxlOiBmaWxlIH0pO1xuICAgICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZSwgcXVlcnksIGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBtb3VudFN0YXRpY1JvdXRlKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LygqKT9gLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxLCB0cnVlKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5zdGF0aWNSb3V0ZShyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBleHByZXNzUm91dGVyKCkge1xuICAgIGNvbnN0IHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG4gICAgcm91dGVyLnVzZSgnLycsIHN1cGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG4gICAgcmV0dXJuIHJvdXRlcjtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBQYWdlc1JvdXRlcjtcbm1vZHVsZS5leHBvcnRzID0ge1xuICBQYWdlc1JvdXRlcixcbiAgcGFnZVBhcmFtSGVhZGVyUHJlZml4LFxuICBwYWdlUGFyYW1zLFxuICBwYWdlcyxcbn07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLGNBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLFFBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFHLEtB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