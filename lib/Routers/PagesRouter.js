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
}); // All page parameters for reference to be used as template placeholders or query params

const pageParams = Object.freeze({
  appName: 'appName',
  appId: 'appId',
  token: 'token',
  username: 'username',
  error: 'error',
  locale: 'locale',
  publicServerUrl: 'publicServerUrl'
}); // The header prefix to add page params as response headers

const pageParamHeaderPrefix = 'x-parse-page-param-'; // The errors being thrown

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
    super(); // Set instance properties

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
    const config = req.config; // Determine redirect either by force, response setting or request method

    const redirect = config.pages.forceRedirect ? true : responseType !== undefined ? responseType : req.method == 'POST'; // Include default parameters

    const defaultParams = this.getDefaultParams(config);

    if (Object.values(defaultParams).includes(undefined)) {
      return this.notFound();
    }

    params = Object.assign(params, defaultParams); // Add locale to params to ensure it is passed on with every request;
    // that means, once a locale is set, it is passed on to any follow-up page,
    // e.g. request_password_reset -> password_reset -> password_reset_success

    const locale = this.getLocale(req);
    params[pageParams.locale] = locale; // Compose paths and URLs

    const defaultFile = page.defaultFile;
    const defaultPath = this.defaultPagePath(defaultFile);
    const defaultUrl = this.composePageUrl(defaultFile, config.publicServerURL); // If custom URL is set redirect to it without localization

    const customUrl = config.pages.customUrls[page.id];

    if (customUrl && !_Utils.default.isPath(customUrl)) {
      return this.redirectResponse(customUrl, params);
    } // Get JSON placeholders


    let placeholders = {};

    if (config.pages.enableLocalization && config.pages.localizationJsonPath) {
      placeholders = this.getJsonPlaceholders(locale, params);
    } // Send response


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
    const relativePath = req.params[0]; // Resolve requested path to absolute path

    const absolutePath = _path.default.resolve(this.pagesPath, relativePath); // If the requested file is not a HTML file send its raw content


    if (!absolutePath || !absolutePath.endsWith('.html')) {
      return this.fileResponse(absolutePath);
    } // Get parameters


    const params = this.getDefaultParams(req.config);
    const locale = this.getLocale(req);

    if (locale) {
      params.locale = locale;
    } // Get JSON placeholders


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
    } // If locale is not set use the fallback locale


    locale = locale || this.pagesConfig.localizationFallbackLocale; // Get matching translation by locale, language or fallback locale

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
    } // Get JSON placeholders


    let placeholders = this.getJsonTranslation(locale); // Fill in any placeholders in the translation; this allows a translation
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
    } // Get config placeholders; can be an object, a function or an async function


    let configPlaceholders = typeof this.pagesConfig.placeholders === 'function' ? this.pagesConfig.placeholders(params) : Object.prototype.toString.call(this.pagesConfig.placeholders) === '[object Object]' ? this.pagesConfig.placeholders : {};

    if (configPlaceholders instanceof Promise) {
      configPlaceholders = await configPlaceholders;
    } // Fill placeholders


    const allPlaceholders = Object.assign({}, configPlaceholders, placeholders);
    const paramsAndPlaceholders = Object.assign({}, params, allPlaceholders);
    data = _mustache.default.render(data, paramsAndPlaceholders); // Add placeholders in header to allow parsing for programmatic use
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
    const normalizedPath = _path.default.normalize(filePath); // Abort if the path is outside of the path directory scope


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
    }, {}); // Compose URL with parameters in query

    const location = new URL(url);
    Object.entries(params).forEach(p => location.searchParams.set(p[0], p[1]));
    const locationString = location.toString(); // Add parameters to header to allow parsing for programmatic use
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
        } = (await route.handler(req)) || {}; // If route handler did not return a page send 404 response

        if (!file) {
          return this.notFound();
        } // Send page response


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYWdlcyIsIk9iamVjdCIsImZyZWV6ZSIsInBhc3N3b3JkUmVzZXQiLCJQYWdlIiwiaWQiLCJkZWZhdWx0RmlsZSIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFzc3dvcmRSZXNldExpbmtJbnZhbGlkIiwiZW1haWxWZXJpZmljYXRpb25TdWNjZXNzIiwiZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCIsImVtYWlsVmVyaWZpY2F0aW9uU2VuZFN1Y2Nlc3MiLCJlbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkIiwiZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCIsInBhZ2VQYXJhbXMiLCJhcHBOYW1lIiwiYXBwSWQiLCJ0b2tlbiIsInVzZXJuYW1lIiwiZXJyb3IiLCJsb2NhbGUiLCJwdWJsaWNTZXJ2ZXJVcmwiLCJwYWdlUGFyYW1IZWFkZXJQcmVmaXgiLCJlcnJvcnMiLCJqc29uRmFpbGVkRmlsZUxvYWRpbmciLCJmaWxlT3V0c2lkZUFsbG93ZWRTY29wZSIsIlBhZ2VzUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsImNvbnN0cnVjdG9yIiwicGFnZXNDb25maWciLCJwYWdlc0VuZHBvaW50IiwicGFnZXNQYXRoIiwicGF0aCIsInJlc29sdmUiLCJfX2Rpcm5hbWUiLCJsb2FkSnNvblJlc291cmNlIiwibW91bnRQYWdlc1JvdXRlcyIsIm1vdW50Q3VzdG9tUm91dGVzIiwibW91bnRTdGF0aWNSb3V0ZSIsInZlcmlmeUVtYWlsIiwicmVxIiwiY29uZmlnIiwicmF3VG9rZW4iLCJxdWVyeSIsInRvU3RyaW5nIiwiaW52YWxpZFJlcXVlc3QiLCJnb1RvUGFnZSIsInVzZXJDb250cm9sbGVyIiwidGhlbiIsInBhcmFtcyIsInJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiYm9keSIsInB1YmxpY1NlcnZlclVSTCIsInJlcXVlc3RSZXNldFBhc3N3b3JkIiwiY2hlY2tSZXNldFRva2VuVmFsaWRpdHkiLCJhcHBsaWNhdGlvbklkIiwicmVzZXRQYXNzd29yZCIsIm5ld19wYXNzd29yZCIsInhociIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiT1RIRVJfQ0FVU0UiLCJQQVNTV09SRF9NSVNTSU5HIiwidXBkYXRlUGFzc3dvcmQiLCJQcm9taXNlIiwic3VjY2VzcyIsImVyciIsInJlc3VsdCIsInN0YXR1cyIsInJlc3BvbnNlIiwicGFnZSIsInJlc3BvbnNlVHlwZSIsInJlZGlyZWN0IiwiZm9yY2VSZWRpcmVjdCIsInVuZGVmaW5lZCIsIm1ldGhvZCIsImRlZmF1bHRQYXJhbXMiLCJnZXREZWZhdWx0UGFyYW1zIiwidmFsdWVzIiwiaW5jbHVkZXMiLCJub3RGb3VuZCIsImFzc2lnbiIsImdldExvY2FsZSIsImRlZmF1bHRQYXRoIiwiZGVmYXVsdFBhZ2VQYXRoIiwiZGVmYXVsdFVybCIsImNvbXBvc2VQYWdlVXJsIiwiY3VzdG9tVXJsIiwiY3VzdG9tVXJscyIsIlV0aWxzIiwiaXNQYXRoIiwicmVkaXJlY3RSZXNwb25zZSIsInBsYWNlaG9sZGVycyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiZ2V0SnNvblBsYWNlaG9sZGVycyIsImdldExvY2FsaXplZFBhdGgiLCJzdWJkaXIiLCJwYWdlUmVzcG9uc2UiLCJzdGF0aWNSb3V0ZSIsInJlbGF0aXZlUGF0aCIsImFic29sdXRlUGF0aCIsImVuZHNXaXRoIiwiZmlsZVJlc3BvbnNlIiwiZ2V0SnNvblRyYW5zbGF0aW9uIiwianNvblBhcmFtZXRlcnMiLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsImxhbmd1YWdlIiwic3BsaXQiLCJyZXNvdXJjZSIsInRyYW5zbGF0aW9uIiwiSlNPTiIsInN0cmluZ2lmeSIsIm11c3RhY2hlIiwicmVuZGVyIiwicGFyc2UiLCJkYXRhIiwicmVhZEZpbGUiLCJlIiwiY29uZmlnUGxhY2Vob2xkZXJzIiwicHJvdG90eXBlIiwiY2FsbCIsImFsbFBsYWNlaG9sZGVycyIsInBhcmFtc0FuZFBsYWNlaG9sZGVycyIsImhlYWRlcnMiLCJlbnRyaWVzIiwicmVkdWNlIiwibSIsInAiLCJ0b0xvd2VyQ2FzZSIsInRleHQiLCJmaWxlUGF0aCIsIm5vcm1hbGl6ZWRQYXRoIiwibm9ybWFsaXplIiwic3RhcnRzV2l0aCIsImZzIiwianNvbiIsInJlcXVpcmUiLCJ1cmwiLCJsb2NhdGlvbiIsIlVSTCIsImZvckVhY2giLCJzZWFyY2hQYXJhbXMiLCJzZXQiLCJsb2NhdGlvblN0cmluZyIsImZpbGUiLCJqb2luIiwibWVzc2FnZSIsInNldENvbmZpZyIsImZhaWxHcmFjZWZ1bGx5IiwiQ29uZmlnIiwiZ2V0Iiwicm91dGUiLCJjdXN0b21Sb3V0ZXMiLCJoYW5kbGVyIiwiZXhwcmVzc1JvdXRlciIsInJvdXRlciIsImV4cHJlc3MiLCJSb3V0ZXIiLCJ1c2UiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvUGFnZXNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzZXMgYXMgZnMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCBtdXN0YWNoZSBmcm9tICdtdXN0YWNoZSc7XG5pbXBvcnQgUGFnZSBmcm9tICcuLi9QYWdlJztcblxuLy8gQWxsIHBhZ2VzIHdpdGggY3VzdG9tIHBhZ2Uga2V5IGZvciByZWZlcmVuY2UgYW5kIGZpbGUgbmFtZVxuY29uc3QgcGFnZXMgPSBPYmplY3QuZnJlZXplKHtcbiAgcGFzc3dvcmRSZXNldDogbmV3IFBhZ2UoeyBpZDogJ3Bhc3N3b3JkUmVzZXQnLCBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0Lmh0bWwnIH0pLFxuICBwYXNzd29yZFJlc2V0U3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAncGFzc3dvcmRSZXNldFN1Y2Nlc3MnLFxuICAgIGRlZmF1bHRGaWxlOiAncGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIHBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAncGFzc3dvcmRSZXNldExpbmtJbnZhbGlkJyxcbiAgICBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0X2xpbmtfaW52YWxpZC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TdWNjZXNzJyxcbiAgICBkZWZhdWx0RmlsZTogJ2VtYWlsX3ZlcmlmaWNhdGlvbl9zdWNjZXNzLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc2VuZF9mYWlsLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzcycsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc2VuZF9zdWNjZXNzLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fbGlua19pbnZhbGlkLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fbGlua19leHBpcmVkLmh0bWwnLFxuICB9KSxcbn0pO1xuXG4vLyBBbGwgcGFnZSBwYXJhbWV0ZXJzIGZvciByZWZlcmVuY2UgdG8gYmUgdXNlZCBhcyB0ZW1wbGF0ZSBwbGFjZWhvbGRlcnMgb3IgcXVlcnkgcGFyYW1zXG5jb25zdCBwYWdlUGFyYW1zID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGFwcE5hbWU6ICdhcHBOYW1lJyxcbiAgYXBwSWQ6ICdhcHBJZCcsXG4gIHRva2VuOiAndG9rZW4nLFxuICB1c2VybmFtZTogJ3VzZXJuYW1lJyxcbiAgZXJyb3I6ICdlcnJvcicsXG4gIGxvY2FsZTogJ2xvY2FsZScsXG4gIHB1YmxpY1NlcnZlclVybDogJ3B1YmxpY1NlcnZlclVybCcsXG59KTtcblxuLy8gVGhlIGhlYWRlciBwcmVmaXggdG8gYWRkIHBhZ2UgcGFyYW1zIGFzIHJlc3BvbnNlIGhlYWRlcnNcbmNvbnN0IHBhZ2VQYXJhbUhlYWRlclByZWZpeCA9ICd4LXBhcnNlLXBhZ2UtcGFyYW0tJztcblxuLy8gVGhlIGVycm9ycyBiZWluZyB0aHJvd25cbmNvbnN0IGVycm9ycyA9IE9iamVjdC5mcmVlemUoe1xuICBqc29uRmFpbGVkRmlsZUxvYWRpbmc6ICdmYWlsZWQgdG8gbG9hZCBKU09OIGZpbGUnLFxuICBmaWxlT3V0c2lkZUFsbG93ZWRTY29wZTogJ25vdCBhbGxvd2VkIHRvIHJlYWQgZmlsZSBvdXRzaWRlIG9mIHBhZ2VzIGRpcmVjdG9yeScsXG59KTtcblxuZXhwb3J0IGNsYXNzIFBhZ2VzUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIC8qKlxuICAgKiBDb25zdHJ1Y3RzIGEgUGFnZXNSb3V0ZXIuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYWdlcyBUaGUgcGFnZXMgb3B0aW9ucyBmcm9tIHRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbi5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHBhZ2VzID0ge30pIHtcbiAgICBzdXBlcigpO1xuXG4gICAgLy8gU2V0IGluc3RhbmNlIHByb3BlcnRpZXNcbiAgICB0aGlzLnBhZ2VzQ29uZmlnID0gcGFnZXM7XG4gICAgdGhpcy5wYWdlc0VuZHBvaW50ID0gcGFnZXMucGFnZXNFbmRwb2ludCA/IHBhZ2VzLnBhZ2VzRW5kcG9pbnQgOiAnYXBwcyc7XG4gICAgdGhpcy5wYWdlc1BhdGggPSBwYWdlcy5wYWdlc1BhdGhcbiAgICAgID8gcGF0aC5yZXNvbHZlKCcuLycsIHBhZ2VzLnBhZ2VzUGF0aClcbiAgICAgIDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3B1YmxpYycpO1xuICAgIHRoaXMubG9hZEpzb25SZXNvdXJjZSgpO1xuICAgIHRoaXMubW91bnRQYWdlc1JvdXRlcygpO1xuICAgIHRoaXMubW91bnRDdXN0b21Sb3V0ZXMoKTtcbiAgICB0aGlzLm1vdW50U3RhdGljUm91dGUoKTtcbiAgfVxuXG4gIHZlcmlmeUVtYWlsKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgeyB1c2VybmFtZSwgdG9rZW46IHJhd1Rva2VuIH0gPSByZXEucXVlcnk7XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuIHx8ICF1c2VybmFtZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIudmVyaWZ5RW1haWwodXNlcm5hbWUsIHRva2VuKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblN1Y2Nlc3MsIHBhcmFtcyk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvbkxpbmtFeHBpcmVkLCBwYXJhbXMpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICByZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IHVzZXJuYW1lID0gcmVxLmJvZHkudXNlcm5hbWU7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIucmVzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcm5hbWUpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2Vzcyk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWwpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBwYXNzd29yZFJlc2V0KHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiByZXEucGFyYW1zLmFwcElkLFxuICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgW3BhZ2VQYXJhbXMudG9rZW5dOiByZXEucXVlcnkudG9rZW4sXG4gICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHJlcS5xdWVyeS51c2VybmFtZSxcbiAgICAgIFtwYWdlUGFyYW1zLnB1YmxpY1NlcnZlclVybF06IGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXQsIHBhcmFtcyk7XG4gIH1cblxuICByZXF1ZXN0UmVzZXRQYXNzd29yZChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHVzZXJuYW1lLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5xdWVyeTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIXVzZXJuYW1lIHx8ICF0b2tlbikge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0TGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIHJldHVybiBjb25maWcudXNlckNvbnRyb2xsZXIuY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMudG9rZW5dOiB0b2tlbixcbiAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcElkXTogY29uZmlnLmFwcGxpY2F0aW9uSWQsXG4gICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXQsIHBhcmFtcyk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0TGlua0ludmFsaWQsIHBhcmFtcyk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHJlc2V0UGFzc3dvcmQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgY29uc3QgeyB1c2VybmFtZSwgbmV3X3Bhc3N3b3JkLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5ib2R5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICgoIXVzZXJuYW1lIHx8ICF0b2tlbiB8fCAhbmV3X3Bhc3N3b3JkKSAmJiByZXEueGhyID09PSBmYWxzZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0TGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAnTWlzc2luZyB1c2VybmFtZScpO1xuICAgIH1cblxuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ01pc3NpbmcgdG9rZW4nKTtcbiAgICB9XG5cbiAgICBpZiAoIW5ld19wYXNzd29yZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdNaXNzaW5nIHBhc3N3b3JkJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbmZpZy51c2VyQ29udHJvbGxlclxuICAgICAgLnVwZGF0ZVBhc3N3b3JkKHVzZXJuYW1lLCB0b2tlbiwgbmV3X3Bhc3N3b3JkKVxuICAgICAgLnRoZW4oXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycixcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlcS54aHIpIHtcbiAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgICBzdGF0dXM6IDIwMCxcbiAgICAgICAgICAgICAgcmVzcG9uc2U6ICdQYXNzd29yZCBzdWNjZXNzZnVsbHkgcmVzZXQnLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXN1bHQuZXJyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsIGAke3Jlc3VsdC5lcnJ9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXN1bHQuc3VjY2Vzc1xuICAgICAgICAgID8ge1xuICAgICAgICAgICAgW3BhZ2VQYXJhbXMudXNlcm5hbWVdOiB1c2VybmFtZSxcbiAgICAgICAgICB9XG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICBbcGFnZVBhcmFtcy51c2VybmFtZV06IHVzZXJuYW1lLFxuICAgICAgICAgICAgW3BhZ2VQYXJhbXMudG9rZW5dOiB0b2tlbixcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcElkXTogY29uZmlnLmFwcGxpY2F0aW9uSWQsXG4gICAgICAgICAgICBbcGFnZVBhcmFtcy5lcnJvcl06IHJlc3VsdC5lcnIsXG4gICAgICAgICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgY29uc3QgcGFnZSA9IHJlc3VsdC5zdWNjZXNzID8gcGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgOiBwYWdlcy5wYXNzd29yZFJlc2V0O1xuXG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZSwgcXVlcnksIGZhbHNlKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgcGFnZSBjb250ZW50IGlmIHRoZSBwYWdlIGlzIGEgbG9jYWwgZmlsZSBvciByZXR1cm5zIGFcbiAgICogcmVkaXJlY3QgdG8gYSBjdXN0b20gcGFnZS5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge1BhZ2V9IHBhZ2UgVGhlIHBhZ2UgdG8gZ28gdG8uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGFyYW1zPXt9XSBUaGUgcXVlcnkgcGFyYW1ldGVycyB0byBhdHRhY2ggdG8gdGhlIFVSTCBpbiBjYXNlIG9mXG4gICAqIEhUVFAgcmVkaXJlY3QgcmVzcG9uc2VzIGZvciBQT1NUIHJlcXVlc3RzLCBvciB0aGUgcGxhY2Vob2xkZXJzIHRvIGZpbGwgaW50b1xuICAgKiB0aGUgcmVzcG9uc2UgY29udGVudCBpbiBjYXNlIG9mIEhUVFAgY29udGVudCByZXNwb25zZXMgZm9yIEdFVCByZXF1ZXN0cy5cbiAgICogQHBhcmFtIHtCb29sZWFufSBbcmVzcG9uc2VUeXBlXSBJcyB0cnVlIGlmIGEgcmVkaXJlY3QgcmVzcG9uc2Ugc2hvdWxkIGJlIGZvcmNlZCxcbiAgICogZmFsc2UgaWYgYSBjb250ZW50IHJlc3BvbnNlIHNob3VsZCBiZSBmb3JjZWQsIHVuZGVmaW5lZCBpZiB0aGUgcmVzcG9uc2UgdHlwZVxuICAgKiBzaG91bGQgZGVwZW5kIG9uIHRoZSByZXF1ZXN0IHR5cGUgYnkgZGVmYXVsdDpcbiAgICogLSBHRVQgcmVxdWVzdCAtPiBjb250ZW50IHJlc3BvbnNlXG4gICAqIC0gUE9TVCByZXF1ZXN0IC0+IHJlZGlyZWN0IHJlc3BvbnNlIChQUkcgcGF0dGVybilcbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gVGhlIFByb21pc2VSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBnb1RvUGFnZShyZXEsIHBhZ2UsIHBhcmFtcyA9IHt9LCByZXNwb25zZVR5cGUpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgLy8gRGV0ZXJtaW5lIHJlZGlyZWN0IGVpdGhlciBieSBmb3JjZSwgcmVzcG9uc2Ugc2V0dGluZyBvciByZXF1ZXN0IG1ldGhvZFxuICAgIGNvbnN0IHJlZGlyZWN0ID0gY29uZmlnLnBhZ2VzLmZvcmNlUmVkaXJlY3RcbiAgICAgID8gdHJ1ZVxuICAgICAgOiByZXNwb25zZVR5cGUgIT09IHVuZGVmaW5lZFxuICAgICAgICA/IHJlc3BvbnNlVHlwZVxuICAgICAgICA6IHJlcS5tZXRob2QgPT0gJ1BPU1QnO1xuXG4gICAgLy8gSW5jbHVkZSBkZWZhdWx0IHBhcmFtZXRlcnNcbiAgICBjb25zdCBkZWZhdWx0UGFyYW1zID0gdGhpcy5nZXREZWZhdWx0UGFyYW1zKGNvbmZpZyk7XG4gICAgaWYgKE9iamVjdC52YWx1ZXMoZGVmYXVsdFBhcmFtcykuaW5jbHVkZXModW5kZWZpbmVkKSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICB9XG4gICAgcGFyYW1zID0gT2JqZWN0LmFzc2lnbihwYXJhbXMsIGRlZmF1bHRQYXJhbXMpO1xuXG4gICAgLy8gQWRkIGxvY2FsZSB0byBwYXJhbXMgdG8gZW5zdXJlIGl0IGlzIHBhc3NlZCBvbiB3aXRoIGV2ZXJ5IHJlcXVlc3Q7XG4gICAgLy8gdGhhdCBtZWFucywgb25jZSBhIGxvY2FsZSBpcyBzZXQsIGl0IGlzIHBhc3NlZCBvbiB0byBhbnkgZm9sbG93LXVwIHBhZ2UsXG4gICAgLy8gZS5nLiByZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0IC0+IHBhc3N3b3JkX3Jlc2V0IC0+IHBhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3NcbiAgICBjb25zdCBsb2NhbGUgPSB0aGlzLmdldExvY2FsZShyZXEpO1xuICAgIHBhcmFtc1twYWdlUGFyYW1zLmxvY2FsZV0gPSBsb2NhbGU7XG5cbiAgICAvLyBDb21wb3NlIHBhdGhzIGFuZCBVUkxzXG4gICAgY29uc3QgZGVmYXVsdEZpbGUgPSBwYWdlLmRlZmF1bHRGaWxlO1xuICAgIGNvbnN0IGRlZmF1bHRQYXRoID0gdGhpcy5kZWZhdWx0UGFnZVBhdGgoZGVmYXVsdEZpbGUpO1xuICAgIGNvbnN0IGRlZmF1bHRVcmwgPSB0aGlzLmNvbXBvc2VQYWdlVXJsKGRlZmF1bHRGaWxlLCBjb25maWcucHVibGljU2VydmVyVVJMKTtcblxuICAgIC8vIElmIGN1c3RvbSBVUkwgaXMgc2V0IHJlZGlyZWN0IHRvIGl0IHdpdGhvdXQgbG9jYWxpemF0aW9uXG4gICAgY29uc3QgY3VzdG9tVXJsID0gY29uZmlnLnBhZ2VzLmN1c3RvbVVybHNbcGFnZS5pZF07XG4gICAgaWYgKGN1c3RvbVVybCAmJiAhVXRpbHMuaXNQYXRoKGN1c3RvbVVybCkpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0UmVzcG9uc2UoY3VzdG9tVXJsLCBwYXJhbXMpO1xuICAgIH1cblxuICAgIC8vIEdldCBKU09OIHBsYWNlaG9sZGVyc1xuICAgIGxldCBwbGFjZWhvbGRlcnMgPSB7fTtcbiAgICBpZiAoY29uZmlnLnBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiAmJiBjb25maWcucGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGgpIHtcbiAgICAgIHBsYWNlaG9sZGVycyA9IHRoaXMuZ2V0SnNvblBsYWNlaG9sZGVycyhsb2NhbGUsIHBhcmFtcyk7XG4gICAgfVxuXG4gICAgLy8gU2VuZCByZXNwb25zZVxuICAgIGlmIChjb25maWcucGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uICYmIGxvY2FsZSkge1xuICAgICAgcmV0dXJuIFV0aWxzLmdldExvY2FsaXplZFBhdGgoZGVmYXVsdFBhdGgsIGxvY2FsZSkudGhlbigoeyBwYXRoLCBzdWJkaXIgfSkgPT5cbiAgICAgICAgcmVkaXJlY3RcbiAgICAgICAgICA/IHRoaXMucmVkaXJlY3RSZXNwb25zZShcbiAgICAgICAgICAgIHRoaXMuY29tcG9zZVBhZ2VVcmwoZGVmYXVsdEZpbGUsIGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsIHN1YmRpciksXG4gICAgICAgICAgICBwYXJhbXNcbiAgICAgICAgICApXG4gICAgICAgICAgOiB0aGlzLnBhZ2VSZXNwb25zZShwYXRoLCBwYXJhbXMsIHBsYWNlaG9sZGVycylcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiByZWRpcmVjdFxuICAgICAgICA/IHRoaXMucmVkaXJlY3RSZXNwb25zZShkZWZhdWx0VXJsLCBwYXJhbXMpXG4gICAgICAgIDogdGhpcy5wYWdlUmVzcG9uc2UoZGVmYXVsdFBhdGgsIHBhcmFtcywgcGxhY2Vob2xkZXJzKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU2VydmVzIGEgcmVxdWVzdCB0byBhIHN0YXRpYyByZXNvdXJjZSBhbmQgbG9jYWxpemVzIHRoZSByZXNvdXJjZSBpZiBpdFxuICAgKiBpcyBhIEhUTUwgZmlsZS5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdCBvYmplY3QuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSByZXNwb25zZS5cbiAgICovXG4gIHN0YXRpY1JvdXRlKHJlcSkge1xuICAgIC8vIEdldCByZXF1ZXN0ZWQgcGF0aFxuICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHJlcS5wYXJhbXNbMF07XG5cbiAgICAvLyBSZXNvbHZlIHJlcXVlc3RlZCBwYXRoIHRvIGFic29sdXRlIHBhdGhcbiAgICBjb25zdCBhYnNvbHV0ZVBhdGggPSBwYXRoLnJlc29sdmUodGhpcy5wYWdlc1BhdGgsIHJlbGF0aXZlUGF0aCk7XG5cbiAgICAvLyBJZiB0aGUgcmVxdWVzdGVkIGZpbGUgaXMgbm90IGEgSFRNTCBmaWxlIHNlbmQgaXRzIHJhdyBjb250ZW50XG4gICAgaWYgKCFhYnNvbHV0ZVBhdGggfHwgIWFic29sdXRlUGF0aC5lbmRzV2l0aCgnLmh0bWwnKSkge1xuICAgICAgcmV0dXJuIHRoaXMuZmlsZVJlc3BvbnNlKGFic29sdXRlUGF0aCk7XG4gICAgfVxuXG4gICAgLy8gR2V0IHBhcmFtZXRlcnNcbiAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmdldERlZmF1bHRQYXJhbXMocmVxLmNvbmZpZyk7XG4gICAgY29uc3QgbG9jYWxlID0gdGhpcy5nZXRMb2NhbGUocmVxKTtcbiAgICBpZiAobG9jYWxlKSB7XG4gICAgICBwYXJhbXMubG9jYWxlID0gbG9jYWxlO1xuICAgIH1cblxuICAgIC8vIEdldCBKU09OIHBsYWNlaG9sZGVyc1xuICAgIGNvbnN0IHBsYWNlaG9sZGVycyA9IHRoaXMuZ2V0SnNvblBsYWNlaG9sZGVycyhsb2NhbGUsIHBhcmFtcyk7XG5cbiAgICByZXR1cm4gdGhpcy5wYWdlUmVzcG9uc2UoYWJzb2x1dGVQYXRoLCBwYXJhbXMsIHBsYWNlaG9sZGVycyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhIHRyYW5zbGF0aW9uIGZyb20gdGhlIEpTT04gcmVzb3VyY2UgZm9yIGEgZ2l2ZW4gbG9jYWxlLiBUaGUgSlNPTlxuICAgKiByZXNvdXJjZSBpcyBwYXJzZWQgYWNjb3JkaW5nIHRvIGkxOG5leHQgc3ludGF4LlxuICAgKlxuICAgKiBFeGFtcGxlIEpTT04gY29udGVudDpcbiAgICogYGBganNcbiAgICogIHtcbiAgICogICAgXCJlblwiOiB7ICAgICAgICAgICAgICAgLy8gcmVzb3VyY2UgZm9yIGxhbmd1YWdlIGBlbmAgKEVuZ2xpc2gpXG4gICAqICAgICAgXCJ0cmFuc2xhdGlvblwiOiB7XG4gICAqICAgICAgICBcImdyZWV0aW5nXCI6IFwiSGVsbG8hXCJcbiAgICogICAgICB9XG4gICAqICAgIH0sXG4gICAqICAgIFwiZGVcIjogeyAgICAgICAgICAgICAgIC8vIHJlc291cmNlIGZvciBsYW5ndWFnZSBgZGVgIChHZXJtYW4pXG4gICAqICAgICAgXCJ0cmFuc2xhdGlvblwiOiB7XG4gICAqICAgICAgICBcImdyZWV0aW5nXCI6IFwiSGFsbG8hXCJcbiAgICogICAgICB9XG4gICAqICAgIH1cbiAgICogICAgXCJkZS1DSFwiOiB7ICAgICAgICAgICAgLy8gcmVzb3VyY2UgZm9yIGxvY2FsZSBgZGUtQ0hgIChTd2lzcyBHZXJtYW4pXG4gICAqICAgICAgXCJ0cmFuc2xhdGlvblwiOiB7XG4gICAqICAgICAgICBcImdyZWV0aW5nXCI6IFwiR3LDvGV6aSFcIlxuICAgKiAgICAgIH1cbiAgICogICAgfVxuICAgKiAgfVxuICAgKiBgYGBcbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlIHRvIHRyYW5zbGF0ZSB0by5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHRyYW5zbGF0aW9uIG9yIGFuIGVtcHR5IG9iamVjdCBpZiBubyBtYXRjaGluZ1xuICAgKiB0cmFuc2xhdGlvbiB3YXMgZm91bmQuXG4gICAqL1xuICBnZXRKc29uVHJhbnNsYXRpb24obG9jYWxlKSB7XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gSlNPTiByZXNvdXJjZVxuICAgIGlmICh0aGlzLmpzb25QYXJhbWV0ZXJzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG5cbiAgICAvLyBJZiBsb2NhbGUgaXMgbm90IHNldCB1c2UgdGhlIGZhbGxiYWNrIGxvY2FsZVxuICAgIGxvY2FsZSA9IGxvY2FsZSB8fCB0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlO1xuXG4gICAgLy8gR2V0IG1hdGNoaW5nIHRyYW5zbGF0aW9uIGJ5IGxvY2FsZSwgbGFuZ3VhZ2Ugb3IgZmFsbGJhY2sgbG9jYWxlXG4gICAgY29uc3QgbGFuZ3VhZ2UgPSBsb2NhbGUuc3BsaXQoJy0nKVswXTtcbiAgICBjb25zdCByZXNvdXJjZSA9XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzW2xvY2FsZV0gfHxcbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnNbbGFuZ3VhZ2VdIHx8XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzW3RoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGVdIHx8XG4gICAgICB7fTtcbiAgICBjb25zdCB0cmFuc2xhdGlvbiA9IHJlc291cmNlLnRyYW5zbGF0aW9uIHx8IHt9O1xuICAgIHJldHVybiB0cmFuc2xhdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgdHJhbnNsYXRpb24gZnJvbSB0aGUgSlNPTiByZXNvdXJjZSBmb3IgYSBnaXZlbiBsb2NhbGUgd2l0aFxuICAgKiBwbGFjZWhvbGRlcnMgZmlsbGVkIGluIGJ5IGdpdmVuIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBsb2NhbGUgVGhlIGxvY2FsZSB0byB0cmFuc2xhdGUgdG8uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMgdG8gZmlsbCBpbnRvIGFueSBwbGFjZWhvbGRlcnNcbiAgICogd2l0aGluIHRoZSB0cmFuc2xhdGlvbnMuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSB0cmFuc2xhdGlvbiBvciBhbiBlbXB0eSBvYmplY3QgaWYgbm8gbWF0Y2hpbmdcbiAgICogdHJhbnNsYXRpb24gd2FzIGZvdW5kLlxuICAgKi9cbiAgZ2V0SnNvblBsYWNlaG9sZGVycyhsb2NhbGUsIHBhcmFtcyA9IHt9KSB7XG4gICAgLy8gSWYgbG9jYWxpemF0aW9uIGlzIGRpc2FibGVkIG9yIHRoZXJlIGlzIG5vIEpTT04gcmVzb3VyY2VcbiAgICBpZiAoIXRoaXMucGFnZXNDb25maWcuZW5hYmxlTG9jYWxpemF0aW9uIHx8ICF0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkpzb25QYXRoKSB7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuXG4gICAgLy8gR2V0IEpTT04gcGxhY2Vob2xkZXJzXG4gICAgbGV0IHBsYWNlaG9sZGVycyA9IHRoaXMuZ2V0SnNvblRyYW5zbGF0aW9uKGxvY2FsZSk7XG5cbiAgICAvLyBGaWxsIGluIGFueSBwbGFjZWhvbGRlcnMgaW4gdGhlIHRyYW5zbGF0aW9uOyB0aGlzIGFsbG93cyBhIHRyYW5zbGF0aW9uXG4gICAgLy8gdG8gY29udGFpbiBkZWZhdWx0IHBsYWNlaG9sZGVycyBsaWtlIHt7YXBwTmFtZX19IHdoaWNoIGFyZSBmaWxsZWQgaGVyZVxuICAgIHBsYWNlaG9sZGVycyA9IEpTT04uc3RyaW5naWZ5KHBsYWNlaG9sZGVycyk7XG4gICAgcGxhY2Vob2xkZXJzID0gbXVzdGFjaGUucmVuZGVyKHBsYWNlaG9sZGVycywgcGFyYW1zKTtcbiAgICBwbGFjZWhvbGRlcnMgPSBKU09OLnBhcnNlKHBsYWNlaG9sZGVycyk7XG5cbiAgICByZXR1cm4gcGxhY2Vob2xkZXJzO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGZpbGUgY29udGVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW3BhcmFtcz17fV0gVGhlIHBhcmFtZXRlcnMgdG8gYmUgaW5jbHVkZWQgaW4gdGhlIHJlc3BvbnNlXG4gICAqIGhlYWRlci4gVGhlc2Ugd2lsbCBhbHNvIGJlIHVzZWQgdG8gZmlsbCBwbGFjZWhvbGRlcnMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGxhY2Vob2xkZXJzPXt9XSBUaGUgcGxhY2Vob2xkZXJzIHRvIGZpbGwgaW4gdGhlIGNvbnRlbnQuXG4gICAqIFRoZXNlIHdpbGwgbm90IGJlIGluY2x1ZGVkIGluIHRoZSByZXNwb25zZSBoZWFkZXIuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBQcm9taXNlIFJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIHBhZ2VSZXNwb25zZShwYXRoLCBwYXJhbXMgPSB7fSwgcGxhY2Vob2xkZXJzID0ge30pIHtcbiAgICAvLyBHZXQgZmlsZSBjb250ZW50XG4gICAgbGV0IGRhdGE7XG4gICAgdHJ5IHtcbiAgICAgIGRhdGEgPSBhd2FpdCB0aGlzLnJlYWRGaWxlKHBhdGgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgfVxuXG4gICAgLy8gR2V0IGNvbmZpZyBwbGFjZWhvbGRlcnM7IGNhbiBiZSBhbiBvYmplY3QsIGEgZnVuY3Rpb24gb3IgYW4gYXN5bmMgZnVuY3Rpb25cbiAgICBsZXQgY29uZmlnUGxhY2Vob2xkZXJzID1cbiAgICAgIHR5cGVvZiB0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVycyA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICA/IHRoaXMucGFnZXNDb25maWcucGxhY2Vob2xkZXJzKHBhcmFtcylcbiAgICAgICAgOiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnMpID09PSAnW29iamVjdCBPYmplY3RdJ1xuICAgICAgICAgID8gdGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnNcbiAgICAgICAgICA6IHt9O1xuICAgIGlmIChjb25maWdQbGFjZWhvbGRlcnMgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICBjb25maWdQbGFjZWhvbGRlcnMgPSBhd2FpdCBjb25maWdQbGFjZWhvbGRlcnM7XG4gICAgfVxuXG4gICAgLy8gRmlsbCBwbGFjZWhvbGRlcnNcbiAgICBjb25zdCBhbGxQbGFjZWhvbGRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBjb25maWdQbGFjZWhvbGRlcnMsIHBsYWNlaG9sZGVycyk7XG4gICAgY29uc3QgcGFyYW1zQW5kUGxhY2Vob2xkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgcGFyYW1zLCBhbGxQbGFjZWhvbGRlcnMpO1xuICAgIGRhdGEgPSBtdXN0YWNoZS5yZW5kZXIoZGF0YSwgcGFyYW1zQW5kUGxhY2Vob2xkZXJzKTtcblxuICAgIC8vIEFkZCBwbGFjZWhvbGRlcnMgaW4gaGVhZGVyIHRvIGFsbG93IHBhcnNpbmcgZm9yIHByb2dyYW1tYXRpYyB1c2VcbiAgICAvLyBvZiByZXNwb25zZSwgaW5zdGVhZCBvZiBoYXZpbmcgdG8gcGFyc2UgdGhlIEhUTUwgY29udGVudC5cbiAgICBjb25zdCBoZWFkZXJzID0gT2JqZWN0LmVudHJpZXMocGFyYW1zKS5yZWR1Y2UoKG0sIHApID0+IHtcbiAgICAgIGlmIChwWzFdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbVtgJHtwYWdlUGFyYW1IZWFkZXJQcmVmaXh9JHtwWzBdLnRvTG93ZXJDYXNlKCl9YF0gPSBwWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG07XG4gICAgfSwge30pO1xuXG4gICAgcmV0dXJuIHsgdGV4dDogZGF0YSwgaGVhZGVyczogaGVhZGVycyB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGZpbGUgY29udGVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgUHJvbWlzZVJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIGZpbGVSZXNwb25zZShwYXRoKSB7XG4gICAgLy8gR2V0IGZpbGUgY29udGVudFxuICAgIGxldCBkYXRhO1xuICAgIHRyeSB7XG4gICAgICBkYXRhID0gYXdhaXQgdGhpcy5yZWFkRmlsZShwYXRoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3RGb3VuZCgpO1xuICAgIH1cblxuICAgIHJldHVybiB7IHRleHQ6IGRhdGEgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWFkcyBhbmQgcmV0dXJucyB0aGUgY29udGVudCBvZiBhIGZpbGUgYXQgYSBnaXZlbiBwYXRoLiBGaWxlIHJlYWRpbmcgdG9cbiAgICogc2VydmUgY29udGVudCBvbiB0aGUgc3RhdGljIHJvdXRlIGlzIG9ubHkgYWxsb3dlZCBmcm9tIHRoZSBwYWdlc1xuICAgKiBkaXJlY3Rvcnkgb24gZG93bndhcmRzLlxuICAgKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgKiAqKldBUk5JTkc6KiogQWxsIGZpbGUgcmVhZHMgaW4gdGhlIFBhZ2VzUm91dGVyIG11c3QgYmUgZXhlY3V0ZWQgYnkgdGhpc1xuICAgKiB3cmFwcGVyIGJlY2F1c2UgaXQgYWxzbyBkZXRlY3RzIGFuZCBwcmV2ZW50cyBjb21tb24gZXhwbG9pdHMuXG4gICAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlUGF0aCBUaGUgcGF0aCB0byB0aGUgZmlsZSB0byByZWFkLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxTdHJpbmc+fSBUaGUgZmlsZSBjb250ZW50LlxuICAgKi9cbiAgYXN5bmMgcmVhZEZpbGUoZmlsZVBhdGgpIHtcbiAgICAvLyBOb3JtYWxpemUgcGF0aCB0byBwcmV2ZW50IGl0IGZyb20gY29udGFpbmluZyBhbnkgZGlyZWN0b3J5IGNoYW5naW5nXG4gICAgLy8gVU5JWCBwYXR0ZXJucyB3aGljaCBjb3VsZCBleHBvc2UgdGhlIHdob2xlIGZpbGUgc3lzdGVtLCBlLmcuXG4gICAgLy8gYGh0dHA6Ly9leGFtcGxlLmNvbS9wYXJzZS9hcHBzLy4uL2ZpbGUudHh0YCByZXF1ZXN0cyBhIGZpbGUgb3V0c2lkZVxuICAgIC8vIG9mIHRoZSBwYWdlcyBkaXJlY3Rvcnkgc2NvcGUuXG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBwYXRoLm5vcm1hbGl6ZShmaWxlUGF0aCk7XG5cbiAgICAvLyBBYm9ydCBpZiB0aGUgcGF0aCBpcyBvdXRzaWRlIG9mIHRoZSBwYXRoIGRpcmVjdG9yeSBzY29wZVxuICAgIGlmICghbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aCh0aGlzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93IGVycm9ycy5maWxlT3V0c2lkZUFsbG93ZWRTY29wZTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXdhaXQgZnMucmVhZEZpbGUobm9ybWFsaXplZFBhdGgsICd1dGYtOCcpO1xuICB9XG5cbiAgLyoqXG4gICAqIExvYWRzIGEgbGFuZ3VhZ2UgcmVzb3VyY2UgSlNPTiBmaWxlIHRoYXQgaXMgdXNlZCBmb3IgdHJhbnNsYXRpb25zLlxuICAgKi9cbiAgbG9hZEpzb25SZXNvdXJjZSgpIHtcbiAgICBpZiAodGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBqc29uID0gcmVxdWlyZShwYXRoLnJlc29sdmUoJy4vJywgdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpO1xuICAgICAgdGhpcy5qc29uUGFyYW1ldGVycyA9IGpzb247XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhyb3cgZXJyb3JzLmpzb25GYWlsZWRGaWxlTG9hZGluZztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdHMgYW5kIHJldHVybnMgdGhlIHBhZ2UgZGVmYXVsdCBwYXJhbWV0ZXJzIGZyb20gdGhlIFBhcnNlIFNlcnZlclxuICAgKiBjb25maWd1cmF0aW9uLiBUaGVzZSBwYXJhbWV0ZXJzIGFyZSBtYWRlIGFjY2Vzc2libGUgaW4gZXZlcnkgcGFnZSBzZXJ2ZWRcbiAgICogYnkgdGhpcyByb3V0ZXIuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgZGVmYXVsdCBwYXJhbWV0ZXJzLlxuICAgKi9cbiAgZ2V0RGVmYXVsdFBhcmFtcyhjb25maWcpIHtcbiAgICByZXR1cm4gY29uZmlnXG4gICAgICA/IHtcbiAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwSWQsXG4gICAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgW3BhZ2VQYXJhbXMucHVibGljU2VydmVyVXJsXTogY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgIH1cbiAgICAgIDoge307XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdHMgYW5kIHJldHVybnMgdGhlIGxvY2FsZSBmcm9tIGFuIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcmV0dXJucyB7U3RyaW5nfHVuZGVmaW5lZH0gVGhlIGxvY2FsZSwgb3IgdW5kZWZpbmVkIGlmIG5vIGxvY2FsZSB3YXMgc2V0LlxuICAgKi9cbiAgZ2V0TG9jYWxlKHJlcSkge1xuICAgIGNvbnN0IGxvY2FsZSA9XG4gICAgICAocmVxLnF1ZXJ5IHx8IHt9KVtwYWdlUGFyYW1zLmxvY2FsZV0gfHxcbiAgICAgIChyZXEuYm9keSB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLnBhcmFtcyB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLmhlYWRlcnMgfHwge30pW3BhZ2VQYXJhbUhlYWRlclByZWZpeCArIHBhZ2VQYXJhbXMubG9jYWxlXTtcbiAgICByZXR1cm4gbG9jYWxlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGh0dHAgcmVkaXJlY3QuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBxdWVyeSBwYXJhbWV0ZXJzIHRvIGluY2x1ZGUuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBQcm9taXNlIFJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIHJlZGlyZWN0UmVzcG9uc2UodXJsLCBwYXJhbXMpIHtcbiAgICAvLyBSZW1vdmUgYW55IHBhcmFtZXRlcnMgd2l0aCB1bmRlZmluZWQgdmFsdWVcbiAgICBwYXJhbXMgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLnJlZHVjZSgobSwgcCkgPT4ge1xuICAgICAgaWYgKHBbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtW3BbMF1dID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIENvbXBvc2UgVVJMIHdpdGggcGFyYW1ldGVycyBpbiBxdWVyeVxuICAgIGNvbnN0IGxvY2F0aW9uID0gbmV3IFVSTCh1cmwpO1xuICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtcykuZm9yRWFjaChwID0+IGxvY2F0aW9uLnNlYXJjaFBhcmFtcy5zZXQocFswXSwgcFsxXSkpO1xuICAgIGNvbnN0IGxvY2F0aW9uU3RyaW5nID0gbG9jYXRpb24udG9TdHJpbmcoKTtcblxuICAgIC8vIEFkZCBwYXJhbWV0ZXJzIHRvIGhlYWRlciB0byBhbGxvdyBwYXJzaW5nIGZvciBwcm9ncmFtbWF0aWMgdXNlXG4gICAgLy8gb2YgcmVzcG9uc2UsIGluc3RlYWQgb2YgaGF2aW5nIHRvIHBhcnNlIHRoZSBIVE1MIGNvbnRlbnQuXG4gICAgY29uc3QgaGVhZGVycyA9IE9iamVjdC5lbnRyaWVzKHBhcmFtcykucmVkdWNlKChtLCBwKSA9PiB7XG4gICAgICBpZiAocFsxXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIG1bYCR7cGFnZVBhcmFtSGVhZGVyUHJlZml4fSR7cFswXS50b0xvd2VyQ2FzZSgpfWBdID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6IDMwMyxcbiAgICAgIGxvY2F0aW9uOiBsb2NhdGlvblN0cmluZyxcbiAgICAgIGhlYWRlcnM6IGhlYWRlcnMsXG4gICAgfTtcbiAgfVxuXG4gIGRlZmF1bHRQYWdlUGF0aChmaWxlKSB7XG4gICAgcmV0dXJuIHBhdGguam9pbih0aGlzLnBhZ2VzUGF0aCwgZmlsZSk7XG4gIH1cblxuICBjb21wb3NlUGFnZVVybChmaWxlLCBwdWJsaWNTZXJ2ZXJVcmwsIGxvY2FsZSkge1xuICAgIGxldCB1cmwgPSBwdWJsaWNTZXJ2ZXJVcmw7XG4gICAgdXJsICs9IHVybC5lbmRzV2l0aCgnLycpID8gJycgOiAnLyc7XG4gICAgdXJsICs9IHRoaXMucGFnZXNFbmRwb2ludCArICcvJztcbiAgICB1cmwgKz0gbG9jYWxlID09PSB1bmRlZmluZWQgPyAnJyA6IGxvY2FsZSArICcvJztcbiAgICB1cmwgKz0gZmlsZTtcbiAgICByZXR1cm4gdXJsO1xuICB9XG5cbiAgbm90Rm91bmQoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHRleHQ6ICdOb3QgZm91bmQuJyxcbiAgICAgIHN0YXR1czogNDA0LFxuICAgIH07XG4gIH1cblxuICBpbnZhbGlkUmVxdWVzdCgpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gaW4gdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIG1ha2UgaXRcbiAgICogZWFzaWx5IGFjY2Vzc2libGUgdGhyb3VnaHRvdXQgcmVxdWVzdCBwcm9jZXNzaW5nLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZhaWxHcmFjZWZ1bGx5IElzIHRydWUgaWYgZmFpbGluZyB0byBzZXQgdGhlIGNvbmZpZyBzaG91bGRcbiAgICogbm90IHJlc3VsdCBpbiBhbiBpbnZhbGlkIHJlcXVlc3QgcmVzcG9uc2UuIERlZmF1bHQgaXMgYGZhbHNlYC5cbiAgICovXG4gIHNldENvbmZpZyhyZXEsIGZhaWxHcmFjZWZ1bGx5ID0gZmFsc2UpIHtcbiAgICByZXEuY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkIHx8IHJlcS5xdWVyeS5hcHBJZCk7XG4gICAgaWYgKCFyZXEuY29uZmlnICYmICFmYWlsR3JhY2VmdWxseSkge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBtb3VudFBhZ2VzUm91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC92ZXJpZnlfZW1haWxgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy52ZXJpZnlFbWFpbChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BPU1QnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3Jlc2VuZF92ZXJpZmljYXRpb25fZW1haWxgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS9jaG9vc2VfcGFzc3dvcmRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXNzd29yZFJlc2V0KHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvcmVxdWVzdF9wYXNzd29yZF9yZXNldGAsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc2V0UGFzc3dvcmQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXF1ZXN0UmVzZXRQYXNzd29yZChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBtb3VudEN1c3RvbVJvdXRlcygpIHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMucGFnZXNDb25maWcuY3VzdG9tUm91dGVzIHx8IFtdKSB7XG4gICAgICB0aGlzLnJvdXRlKFxuICAgICAgICByb3V0ZS5tZXRob2QsXG4gICAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC8ke3JvdXRlLnBhdGh9YCxcbiAgICAgICAgcmVxID0+IHtcbiAgICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgICB9LFxuICAgICAgICBhc3luYyByZXEgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgZmlsZSwgcXVlcnkgPSB7fSB9ID0gKGF3YWl0IHJvdXRlLmhhbmRsZXIocmVxKSkgfHwge307XG5cbiAgICAgICAgICAvLyBJZiByb3V0ZSBoYW5kbGVyIGRpZCBub3QgcmV0dXJuIGEgcGFnZSBzZW5kIDQwNCByZXNwb25zZVxuICAgICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBTZW5kIHBhZ2UgcmVzcG9uc2VcbiAgICAgICAgICBjb25zdCBwYWdlID0gbmV3IFBhZ2UoeyBpZDogZmlsZSwgZGVmYXVsdEZpbGU6IGZpbGUgfSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlLCBxdWVyeSwgZmFsc2UpO1xuICAgICAgICB9XG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIG1vdW50U3RhdGljUm91dGUoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vKCopP2AsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEsIHRydWUpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXRpY1JvdXRlKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGV4cHJlc3NSb3V0ZXIoKSB7XG4gICAgY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgICByb3V0ZXIudXNlKCcvJywgc3VwZXIuZXhwcmVzc1JvdXRlcigpKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhZ2VzUm91dGVyO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIFBhZ2VzUm91dGVyLFxuICBwYWdlUGFyYW1IZWFkZXJQcmVmaXgsXG4gIHBhZ2VQYXJhbXMsXG4gIHBhZ2VzLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7O0FBRUE7QUFDQSxNQUFNQSxLQUFLLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjO0VBQzFCQyxhQUFhLEVBQUUsSUFBSUMsYUFBSixDQUFTO0lBQUVDLEVBQUUsRUFBRSxlQUFOO0lBQXVCQyxXQUFXLEVBQUU7RUFBcEMsQ0FBVCxDQURXO0VBRTFCQyxvQkFBb0IsRUFBRSxJQUFJSCxhQUFKLENBQVM7SUFDN0JDLEVBQUUsRUFBRSxzQkFEeUI7SUFFN0JDLFdBQVcsRUFBRTtFQUZnQixDQUFULENBRkk7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