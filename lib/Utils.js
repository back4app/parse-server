"use strict";

function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * utils.js
 * @file General purpose utilities
 * @description General purpose utilities.
 */

const path = require('path');
const fs = require('fs').promises;

/**
 * The general purpose utilities.
 */
class Utils {
  /**
   * @function getLocalizedPath
   * @description Returns a localized file path accoring to the locale.
   *
   * Localized files are searched in subfolders of a given path, e.g.
   *
   * root/
   * ├── base/                    // base path to files
   * │   ├── example.html         // default file
   * │   └── de/                  // de language folder
   * │   │   └── example.html     // de localized file
   * │   └── de-AT/               // de-AT locale folder
   * │   │   └── example.html     // de-AT localized file
   *
   * Files are matched with the locale in the following order:
   * 1. Locale match, e.g. locale `de-AT` matches file in folder `de-AT`.
   * 2. Language match, e.g. locale `de-AT` matches file in folder `de`.
   * 3. Default; file in base folder is returned.
   *
   * @param {String} defaultPath The absolute file path, which is also
   * the default path returned if localization is not available.
   * @param {String} locale The locale.
   * @returns {Promise<Object>} The object contains:
   * - `path`: The path to the localized file, or the original path if
   *   localization is not available.
   * - `subdir`: The subdirectory of the localized file, or undefined if
   *   there is no matching localized file.
   */
  static async getLocalizedPath(defaultPath, locale) {
    // Get file name and paths
    const file = path.basename(defaultPath);
    const basePath = path.dirname(defaultPath);

    // If locale is not set return default file
    if (!locale) {
      return {
        path: defaultPath
      };
    }

    // Check file for locale exists
    const localePath = path.join(basePath, locale, file);
    const localeFileExists = await Utils.fileExists(localePath);

    // If file for locale exists return file
    if (localeFileExists) {
      return {
        path: localePath,
        subdir: locale
      };
    }

    // Check file for language exists
    const language = locale.split('-')[0];
    const languagePath = path.join(basePath, language, file);
    const languageFileExists = await Utils.fileExists(languagePath);

    // If file for language exists return file
    if (languageFileExists) {
      return {
        path: languagePath,
        subdir: language
      };
    }

    // Return default file
    return {
      path: defaultPath
    };
  }

  /**
   * @function fileExists
   * @description Checks whether a file exists.
   * @param {String} path The file path.
   * @returns {Promise<Boolean>} Is true if the file can be accessed, false otherwise.
   */
  static async fileExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * @function isPath
   * @description Evaluates whether a string is a file path (as opposed to a URL for example).
   * @param {String} s The string to evaluate.
   * @returns {Boolean} Returns true if the evaluated string is a path.
   */
  static isPath(s) {
    return /(^\/)|(^\.\/)|(^\.\.\/)/.test(s);
  }

  /**
   * Flattens an object and crates new keys with custom delimiters.
   * @param {Object} obj The object to flatten.
   * @param {String} [delimiter='.'] The delimiter of the newly generated keys.
   * @param {Object} result
   * @returns {Object} The flattened object.
   **/
  static flattenObject(obj, parentKey, delimiter = '.', result = {}) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const newKey = parentKey ? parentKey + delimiter + key : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.flattenObject(obj[key], newKey, delimiter, result);
        } else {
          result[newKey] = obj[key];
        }
      }
    }
    return result;
  }

  /**
   * Determines whether an object is a Promise.
   * @param {any} object The object to validate.
   * @returns {Boolean} Returns true if the object is a promise.
   */
  static isPromise(object) {
    return object instanceof Promise;
  }

  /**
   * Creates an object with all permutations of the original keys.
   * For example, this definition:
   * ```
   * {
   *   a: [true, false],
   *   b: [1, 2],
   *   c: ['x']
   * }
   * ```
   * permutates to:
   * ```
   * [
   *   { a: true, b: 1, c: 'x' },
   *   { a: true, b: 2, c: 'x' },
   *   { a: false, b: 1, c: 'x' },
   *   { a: false, b: 2, c: 'x' }
   * ]
   * ```
   * @param {Object} object The object to permutate.
   * @param {Integer} [index=0] The current key index.
   * @param {Object} [current={}] The current result entry being composed.
   * @param {Array} [results=[]] The resulting array of permutations.
   */
  static getObjectKeyPermutations(object, index = 0, current = {}, results = []) {
    const keys = Object.keys(object);
    const key = keys[index];
    const values = object[key];
    for (const value of values) {
      current[key] = value;
      const nextIndex = index + 1;
      if (nextIndex < keys.length) {
        Utils.getObjectKeyPermutations(object, nextIndex, current, results);
      } else {
        const result = Object.assign({}, current);
        results.push(result);
      }
    }
    return results;
  }

  /**
   * Validates parameters and throws if a parameter is invalid.
   * Example parameter types syntax:
   * ```
   * {
   *   parameterName: {
   *      t: 'boolean',
   *      v: isBoolean,
   *      o: true
   *   },
   *   ...
   * }
   * ```
   * @param {Object} params The parameters to validate.
   * @param {Array<Object>} types The parameter types used for validation.
   * @param {Object} types.t The parameter type; used for error message, not for validation.
   * @param {Object} types.v The function to validate the parameter value.
   * @param {Boolean} [types.o=false] Is true if the parameter is optional.
   */
  static validateParams(params, types) {
    for (const key of Object.keys(params)) {
      const type = types[key];
      const isOptional = !!type.o;
      const param = params[key];
      if (!(isOptional && param == null) && !type.v(param)) {
        throw `Invalid parameter ${key} must be of type ${type.t} but is ${typeof param}`;
      }
    }
  }

  /**
   * Computes the relative date based on a string.
   * @param {String} text The string to interpret the date from.
   * @param {Date} now The date the string is comparing against.
   * @returns {Object} The relative date object.
   **/
  static relativeTimeToDate(text, now = new Date()) {
    text = text.toLowerCase();
    let parts = text.split(' ');

    // Filter out whitespace
    parts = parts.filter(part => part !== '');
    const future = parts[0] === 'in';
    const past = parts[parts.length - 1] === 'ago';
    if (!future && !past && text !== 'now') {
      return {
        status: 'error',
        info: "Time should either start with 'in' or end with 'ago'"
      };
    }
    if (future && past) {
      return {
        status: 'error',
        info: "Time cannot have both 'in' and 'ago'"
      };
    }

    // strip the 'ago' or 'in'
    if (future) {
      parts = parts.slice(1);
    } else {
      // past
      parts = parts.slice(0, parts.length - 1);
    }
    if (parts.length % 2 !== 0 && text !== 'now') {
      return {
        status: 'error',
        info: 'Invalid time string. Dangling unit or number.'
      };
    }
    const pairs = [];
    while (parts.length) {
      pairs.push([parts.shift(), parts.shift()]);
    }
    let seconds = 0;
    for (const [num, interval] of pairs) {
      const val = Number(num);
      if (!Number.isInteger(val)) {
        return {
          status: 'error',
          info: `'${num}' is not an integer.`
        };
      }
      switch (interval) {
        case 'yr':
        case 'yrs':
        case 'year':
        case 'years':
          seconds += val * 31536000; // 365 * 24 * 60 * 60
          break;
        case 'wk':
        case 'wks':
        case 'week':
        case 'weeks':
          seconds += val * 604800; // 7 * 24 * 60 * 60
          break;
        case 'd':
        case 'day':
        case 'days':
          seconds += val * 86400; // 24 * 60 * 60
          break;
        case 'hr':
        case 'hrs':
        case 'hour':
        case 'hours':
          seconds += val * 3600; // 60 * 60
          break;
        case 'min':
        case 'mins':
        case 'minute':
        case 'minutes':
          seconds += val * 60;
          break;
        case 'sec':
        case 'secs':
        case 'second':
        case 'seconds':
          seconds += val;
          break;
        default:
          return {
            status: 'error',
            info: `Invalid interval: '${interval}'`
          };
      }
    }
    const milliseconds = seconds * 1000;
    if (future) {
      return {
        status: 'success',
        info: 'future',
        result: new Date(now.valueOf() + milliseconds)
      };
    } else if (past) {
      return {
        status: 'success',
        info: 'past',
        result: new Date(now.valueOf() - milliseconds)
      };
    } else {
      return {
        status: 'success',
        info: 'present',
        result: new Date(now.valueOf())
      };
    }
  }

  /**
   * Deep-scans an object for a matching key/value definition.
   * @param {Object} obj The object to scan.
   * @param {String | undefined} key The key to match, or undefined if only the value should be matched.
   * @param {any | undefined} value The value to match, or undefined if only the key should be matched.
   * @returns {Boolean} True if a match was found, false otherwise.
   */
  static objectContainsKeyValue(obj, key, value) {
    const isMatch = (a, b) => typeof a === 'string' && new RegExp(b).test(a) || a === b;
    const isKeyMatch = k => isMatch(k, key);
    const isValueMatch = v => isMatch(v, value);
    for (const [k, v] of Object.entries(obj)) {
      if (key !== undefined && value === undefined && isKeyMatch(k)) {
        return true;
      } else if (key === undefined && value !== undefined && isValueMatch(v)) {
        return true;
      } else if (key !== undefined && value !== undefined && isKeyMatch(k) && isValueMatch(v)) {
        return true;
      }
      if (['[object Object]', '[object Array]'].includes(Object.prototype.toString.call(v))) {
        return Utils.objectContainsKeyValue(v, key, value);
      }
    }
    return false;
  }
  static checkProhibitedKeywords(config, data) {
    if (config !== null && config !== void 0 && config.requestKeywordDenylist) {
      // Scan request data for denied keywords
      for (const keyword of config.requestKeywordDenylist) {
        const match = Utils.objectContainsKeyValue(data, keyword.key, keyword.value);
        if (match) {
          throw `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`;
        }
      }
    }
  }

  /**
   * Moves the nested keys of a specified key in an object to the root of the object.
   *
   * @param {Object} obj The object to modify.
   * @param {String} key The key whose nested keys will be moved to root.
   * @returns {Object} The modified object, or the original object if no modification happened.
   * @example
   * const obj = {
   *   a: 1,
   *   b: {
   *     c: 2,
   *     d: 3
   *   },
   *   e: 4
   * };
   * addNestedKeysToRoot(obj, 'b');
   * console.log(obj);
   * // Output: { a: 1, e: 4, c: 2, d: 3 }
  */
  static addNestedKeysToRoot(obj, key) {
    if (obj[key] && typeof obj[key] === 'object') {
      // Add nested keys to root
      Object.assign(obj, _objectSpread({}, obj[key]));
      // Delete original nested key
      delete obj[key];
    }
    return obj;
  }
}
module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiZSIsImlzUGF0aCIsInMiLCJ0ZXN0IiwiZmxhdHRlbk9iamVjdCIsIm9iaiIsInBhcmVudEtleSIsImRlbGltaXRlciIsInJlc3VsdCIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5ld0tleSIsImlzUHJvbWlzZSIsIm9iamVjdCIsIlByb21pc2UiLCJnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMiLCJpbmRleCIsImN1cnJlbnQiLCJyZXN1bHRzIiwia2V5cyIsInZhbHVlcyIsInZhbHVlIiwibmV4dEluZGV4IiwibGVuZ3RoIiwiYXNzaWduIiwicHVzaCIsInZhbGlkYXRlUGFyYW1zIiwicGFyYW1zIiwidHlwZXMiLCJ0eXBlIiwiaXNPcHRpb25hbCIsIm8iLCJwYXJhbSIsInYiLCJ0IiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsIkRhdGUiLCJ0b0xvd2VyQ2FzZSIsInBhcnRzIiwiZmlsdGVyIiwicGFydCIsImZ1dHVyZSIsInBhc3QiLCJzdGF0dXMiLCJpbmZvIiwic2xpY2UiLCJwYWlycyIsInNoaWZ0Iiwic2Vjb25kcyIsIm51bSIsImludGVydmFsIiwidmFsIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwibWlsbGlzZWNvbmRzIiwidmFsdWVPZiIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJpc01hdGNoIiwiYSIsImIiLCJSZWdFeHAiLCJpc0tleU1hdGNoIiwiayIsImlzVmFsdWVNYXRjaCIsImVudHJpZXMiLCJ1bmRlZmluZWQiLCJpbmNsdWRlcyIsInRvU3RyaW5nIiwiY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMiLCJjb25maWciLCJkYXRhIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJtYXRjaCIsIkpTT04iLCJzdHJpbmdpZnkiLCJhZGROZXN0ZWRLZXlzVG9Sb290IiwiX29iamVjdFNwcmVhZCIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvVXRpbHMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiB1dGlscy5qc1xuICogQGZpbGUgR2VuZXJhbCBwdXJwb3NlIHV0aWxpdGllc1xuICogQGRlc2NyaXB0aW9uIEdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXMuXG4gKi9cblxuY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbmNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKS5wcm9taXNlcztcblxuLyoqXG4gKiBUaGUgZ2VuZXJhbCBwdXJwb3NlIHV0aWxpdGllcy5cbiAqL1xuY2xhc3MgVXRpbHMge1xuICAvKipcbiAgICogQGZ1bmN0aW9uIGdldExvY2FsaXplZFBhdGhcbiAgICogQGRlc2NyaXB0aW9uIFJldHVybnMgYSBsb2NhbGl6ZWQgZmlsZSBwYXRoIGFjY29yaW5nIHRvIHRoZSBsb2NhbGUuXG4gICAqXG4gICAqIExvY2FsaXplZCBmaWxlcyBhcmUgc2VhcmNoZWQgaW4gc3ViZm9sZGVycyBvZiBhIGdpdmVuIHBhdGgsIGUuZy5cbiAgICpcbiAgICogcm9vdC9cbiAgICog4pSc4pSA4pSAIGJhc2UvICAgICAgICAgICAgICAgICAgICAvLyBiYXNlIHBhdGggdG8gZmlsZXNcbiAgICog4pSCICAg4pSc4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgICAgIC8vIGRlZmF1bHQgZmlsZVxuICAgKiDilIIgICDilJTilIDilIAgZGUvICAgICAgICAgICAgICAgICAgLy8gZGUgbGFuZ3VhZ2UgZm9sZGVyXG4gICAqIOKUgiAgIOKUgiAgIOKUlOKUgOKUgCBleGFtcGxlLmh0bWwgICAgIC8vIGRlIGxvY2FsaXplZCBmaWxlXG4gICAqIOKUgiAgIOKUlOKUgOKUgCBkZS1BVC8gICAgICAgICAgICAgICAvLyBkZS1BVCBsb2NhbGUgZm9sZGVyXG4gICAqIOKUgiAgIOKUgiAgIOKUlOKUgOKUgCBleGFtcGxlLmh0bWwgICAgIC8vIGRlLUFUIGxvY2FsaXplZCBmaWxlXG4gICAqXG4gICAqIEZpbGVzIGFyZSBtYXRjaGVkIHdpdGggdGhlIGxvY2FsZSBpbiB0aGUgZm9sbG93aW5nIG9yZGVyOlxuICAgKiAxLiBMb2NhbGUgbWF0Y2gsIGUuZy4gbG9jYWxlIGBkZS1BVGAgbWF0Y2hlcyBmaWxlIGluIGZvbGRlciBgZGUtQVRgLlxuICAgKiAyLiBMYW5ndWFnZSBtYXRjaCwgZS5nLiBsb2NhbGUgYGRlLUFUYCBtYXRjaGVzIGZpbGUgaW4gZm9sZGVyIGBkZWAuXG4gICAqIDMuIERlZmF1bHQ7IGZpbGUgaW4gYmFzZSBmb2xkZXIgaXMgcmV0dXJuZWQuXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZWZhdWx0UGF0aCBUaGUgYWJzb2x1dGUgZmlsZSBwYXRoLCB3aGljaCBpcyBhbHNvXG4gICAqIHRoZSBkZWZhdWx0IHBhdGggcmV0dXJuZWQgaWYgbG9jYWxpemF0aW9uIGlzIG5vdCBhdmFpbGFibGUuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBsb2NhbGUgVGhlIGxvY2FsZS5cbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gVGhlIG9iamVjdCBjb250YWluczpcbiAgICogLSBgcGF0aGA6IFRoZSBwYXRoIHRvIHRoZSBsb2NhbGl6ZWQgZmlsZSwgb3IgdGhlIG9yaWdpbmFsIHBhdGggaWZcbiAgICogICBsb2NhbGl6YXRpb24gaXMgbm90IGF2YWlsYWJsZS5cbiAgICogLSBgc3ViZGlyYDogVGhlIHN1YmRpcmVjdG9yeSBvZiB0aGUgbG9jYWxpemVkIGZpbGUsIG9yIHVuZGVmaW5lZCBpZlxuICAgKiAgIHRoZXJlIGlzIG5vIG1hdGNoaW5nIGxvY2FsaXplZCBmaWxlLlxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGdldExvY2FsaXplZFBhdGgoZGVmYXVsdFBhdGgsIGxvY2FsZSkge1xuICAgIC8vIEdldCBmaWxlIG5hbWUgYW5kIHBhdGhzXG4gICAgY29uc3QgZmlsZSA9IHBhdGguYmFzZW5hbWUoZGVmYXVsdFBhdGgpO1xuICAgIGNvbnN0IGJhc2VQYXRoID0gcGF0aC5kaXJuYW1lKGRlZmF1bHRQYXRoKTtcblxuICAgIC8vIElmIGxvY2FsZSBpcyBub3Qgc2V0IHJldHVybiBkZWZhdWx0IGZpbGVcbiAgICBpZiAoIWxvY2FsZSkge1xuICAgICAgcmV0dXJuIHsgcGF0aDogZGVmYXVsdFBhdGggfTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBmaWxlIGZvciBsb2NhbGUgZXhpc3RzXG4gICAgY29uc3QgbG9jYWxlUGF0aCA9IHBhdGguam9pbihiYXNlUGF0aCwgbG9jYWxlLCBmaWxlKTtcbiAgICBjb25zdCBsb2NhbGVGaWxlRXhpc3RzID0gYXdhaXQgVXRpbHMuZmlsZUV4aXN0cyhsb2NhbGVQYXRoKTtcblxuICAgIC8vIElmIGZpbGUgZm9yIGxvY2FsZSBleGlzdHMgcmV0dXJuIGZpbGVcbiAgICBpZiAobG9jYWxlRmlsZUV4aXN0cykge1xuICAgICAgcmV0dXJuIHsgcGF0aDogbG9jYWxlUGF0aCwgc3ViZGlyOiBsb2NhbGUgfTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBmaWxlIGZvciBsYW5ndWFnZSBleGlzdHNcbiAgICBjb25zdCBsYW5ndWFnZSA9IGxvY2FsZS5zcGxpdCgnLScpWzBdO1xuICAgIGNvbnN0IGxhbmd1YWdlUGF0aCA9IHBhdGguam9pbihiYXNlUGF0aCwgbGFuZ3VhZ2UsIGZpbGUpO1xuICAgIGNvbnN0IGxhbmd1YWdlRmlsZUV4aXN0cyA9IGF3YWl0IFV0aWxzLmZpbGVFeGlzdHMobGFuZ3VhZ2VQYXRoKTtcblxuICAgIC8vIElmIGZpbGUgZm9yIGxhbmd1YWdlIGV4aXN0cyByZXR1cm4gZmlsZVxuICAgIGlmIChsYW5ndWFnZUZpbGVFeGlzdHMpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGxhbmd1YWdlUGF0aCwgc3ViZGlyOiBsYW5ndWFnZSB9O1xuICAgIH1cblxuICAgIC8vIFJldHVybiBkZWZhdWx0IGZpbGVcbiAgICByZXR1cm4geyBwYXRoOiBkZWZhdWx0UGF0aCB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBmaWxlRXhpc3RzXG4gICAqIEBkZXNjcmlwdGlvbiBDaGVja3Mgd2hldGhlciBhIGZpbGUgZXhpc3RzLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgZmlsZSBwYXRoLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxCb29sZWFuPn0gSXMgdHJ1ZSBpZiB0aGUgZmlsZSBjYW4gYmUgYWNjZXNzZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAgICovXG4gIHN0YXRpYyBhc3luYyBmaWxlRXhpc3RzKHBhdGgpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZnMuYWNjZXNzKHBhdGgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gaXNQYXRoXG4gICAqIEBkZXNjcmlwdGlvbiBFdmFsdWF0ZXMgd2hldGhlciBhIHN0cmluZyBpcyBhIGZpbGUgcGF0aCAoYXMgb3Bwb3NlZCB0byBhIFVSTCBmb3IgZXhhbXBsZSkuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzIFRoZSBzdHJpbmcgdG8gZXZhbHVhdGUuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBSZXR1cm5zIHRydWUgaWYgdGhlIGV2YWx1YXRlZCBzdHJpbmcgaXMgYSBwYXRoLlxuICAgKi9cbiAgc3RhdGljIGlzUGF0aChzKSB7XG4gICAgcmV0dXJuIC8oXlxcLyl8KF5cXC5cXC8pfCheXFwuXFwuXFwvKS8udGVzdChzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGbGF0dGVucyBhbiBvYmplY3QgYW5kIGNyYXRlcyBuZXcga2V5cyB3aXRoIGN1c3RvbSBkZWxpbWl0ZXJzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gZmxhdHRlbi5cbiAgICogQHBhcmFtIHtTdHJpbmd9IFtkZWxpbWl0ZXI9Jy4nXSBUaGUgZGVsaW1pdGVyIG9mIHRoZSBuZXdseSBnZW5lcmF0ZWQga2V5cy5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3VsdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgZmxhdHRlbmVkIG9iamVjdC5cbiAgICoqL1xuICBzdGF0aWMgZmxhdHRlbk9iamVjdChvYmosIHBhcmVudEtleSwgZGVsaW1pdGVyID0gJy4nLCByZXN1bHQgPSB7fSkge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgY29uc3QgbmV3S2V5ID0gcGFyZW50S2V5ID8gcGFyZW50S2V5ICsgZGVsaW1pdGVyICsga2V5IDoga2V5O1xuXG4gICAgICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdvYmplY3QnICYmIG9ialtrZXldICE9PSBudWxsKSB7XG4gICAgICAgICAgdGhpcy5mbGF0dGVuT2JqZWN0KG9ialtrZXldLCBuZXdLZXksIGRlbGltaXRlciwgcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHRbbmV3S2V5XSA9IG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIGFuIG9iamVjdCBpcyBhIFByb21pc2UuXG4gICAqIEBwYXJhbSB7YW55fSBvYmplY3QgVGhlIG9iamVjdCB0byB2YWxpZGF0ZS5cbiAgICogQHJldHVybnMge0Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgb2JqZWN0IGlzIGEgcHJvbWlzZS5cbiAgICovXG4gIHN0YXRpYyBpc1Byb21pc2Uob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIFByb21pc2U7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhbiBvYmplY3Qgd2l0aCBhbGwgcGVybXV0YXRpb25zIG9mIHRoZSBvcmlnaW5hbCBrZXlzLlxuICAgKiBGb3IgZXhhbXBsZSwgdGhpcyBkZWZpbml0aW9uOlxuICAgKiBgYGBcbiAgICoge1xuICAgKiAgIGE6IFt0cnVlLCBmYWxzZV0sXG4gICAqICAgYjogWzEsIDJdLFxuICAgKiAgIGM6IFsneCddXG4gICAqIH1cbiAgICogYGBgXG4gICAqIHBlcm11dGF0ZXMgdG86XG4gICAqIGBgYFxuICAgKiBbXG4gICAqICAgeyBhOiB0cnVlLCBiOiAxLCBjOiAneCcgfSxcbiAgICogICB7IGE6IHRydWUsIGI6IDIsIGM6ICd4JyB9LFxuICAgKiAgIHsgYTogZmFsc2UsIGI6IDEsIGM6ICd4JyB9LFxuICAgKiAgIHsgYTogZmFsc2UsIGI6IDIsIGM6ICd4JyB9XG4gICAqIF1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBwZXJtdXRhdGUuXG4gICAqIEBwYXJhbSB7SW50ZWdlcn0gW2luZGV4PTBdIFRoZSBjdXJyZW50IGtleSBpbmRleC5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtjdXJyZW50PXt9XSBUaGUgY3VycmVudCByZXN1bHQgZW50cnkgYmVpbmcgY29tcG9zZWQuXG4gICAqIEBwYXJhbSB7QXJyYXl9IFtyZXN1bHRzPVtdXSBUaGUgcmVzdWx0aW5nIGFycmF5IG9mIHBlcm11dGF0aW9ucy5cbiAgICovXG4gIHN0YXRpYyBnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMob2JqZWN0LCBpbmRleCA9IDAsIGN1cnJlbnQgPSB7fSwgcmVzdWx0cyA9IFtdKSB7XG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qga2V5ID0ga2V5c1tpbmRleF07XG4gICAgY29uc3QgdmFsdWVzID0gb2JqZWN0W2tleV07XG5cbiAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuICAgICAgY3VycmVudFtrZXldID0gdmFsdWU7XG4gICAgICBjb25zdCBuZXh0SW5kZXggPSBpbmRleCArIDE7XG5cbiAgICAgIGlmIChuZXh0SW5kZXggPCBrZXlzLmxlbmd0aCkge1xuICAgICAgICBVdGlscy5nZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMob2JqZWN0LCBuZXh0SW5kZXgsIGN1cnJlbnQsIHJlc3VsdHMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gT2JqZWN0LmFzc2lnbih7fSwgY3VycmVudCk7XG4gICAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgcGFyYW1ldGVycyBhbmQgdGhyb3dzIGlmIGEgcGFyYW1ldGVyIGlzIGludmFsaWQuXG4gICAqIEV4YW1wbGUgcGFyYW1ldGVyIHR5cGVzIHN5bnRheDpcbiAgICogYGBgXG4gICAqIHtcbiAgICogICBwYXJhbWV0ZXJOYW1lOiB7XG4gICAqICAgICAgdDogJ2Jvb2xlYW4nLFxuICAgKiAgICAgIHY6IGlzQm9vbGVhbixcbiAgICogICAgICBvOiB0cnVlXG4gICAqICAgfSxcbiAgICogICAuLi5cbiAgICogfVxuICAgKiBgYGBcbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycyB0byB2YWxpZGF0ZS5cbiAgICogQHBhcmFtIHtBcnJheTxPYmplY3Q+fSB0eXBlcyBUaGUgcGFyYW1ldGVyIHR5cGVzIHVzZWQgZm9yIHZhbGlkYXRpb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0eXBlcy50IFRoZSBwYXJhbWV0ZXIgdHlwZTsgdXNlZCBmb3IgZXJyb3IgbWVzc2FnZSwgbm90IGZvciB2YWxpZGF0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHlwZXMudiBUaGUgZnVuY3Rpb24gdG8gdmFsaWRhdGUgdGhlIHBhcmFtZXRlciB2YWx1ZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBbdHlwZXMubz1mYWxzZV0gSXMgdHJ1ZSBpZiB0aGUgcGFyYW1ldGVyIGlzIG9wdGlvbmFsLlxuICAgKi9cbiAgc3RhdGljIHZhbGlkYXRlUGFyYW1zKHBhcmFtcywgdHlwZXMpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhwYXJhbXMpKSB7XG4gICAgICBjb25zdCB0eXBlID0gdHlwZXNba2V5XTtcbiAgICAgIGNvbnN0IGlzT3B0aW9uYWwgPSAhIXR5cGUubztcbiAgICAgIGNvbnN0IHBhcmFtID0gcGFyYW1zW2tleV07XG4gICAgICBpZiAoIShpc09wdGlvbmFsICYmIHBhcmFtID09IG51bGwpICYmICF0eXBlLnYocGFyYW0pKSB7XG4gICAgICAgIHRocm93IGBJbnZhbGlkIHBhcmFtZXRlciAke2tleX0gbXVzdCBiZSBvZiB0eXBlICR7dHlwZS50fSBidXQgaXMgJHt0eXBlb2YgcGFyYW19YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ29tcHV0ZXMgdGhlIHJlbGF0aXZlIGRhdGUgYmFzZWQgb24gYSBzdHJpbmcuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBzdHJpbmcgdG8gaW50ZXJwcmV0IHRoZSBkYXRlIGZyb20uXG4gICAqIEBwYXJhbSB7RGF0ZX0gbm93IFRoZSBkYXRlIHRoZSBzdHJpbmcgaXMgY29tcGFyaW5nIGFnYWluc3QuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSByZWxhdGl2ZSBkYXRlIG9iamVjdC5cbiAgICoqL1xuICBzdGF0aWMgcmVsYXRpdmVUaW1lVG9EYXRlKHRleHQsIG5vdyA9IG5ldyBEYXRlKCkpIHtcbiAgICB0ZXh0ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoJyAnKTtcblxuICAgIC8vIEZpbHRlciBvdXQgd2hpdGVzcGFjZVxuICAgIHBhcnRzID0gcGFydHMuZmlsdGVyKHBhcnQgPT4gcGFydCAhPT0gJycpO1xuXG4gICAgY29uc3QgZnV0dXJlID0gcGFydHNbMF0gPT09ICdpbic7XG4gICAgY29uc3QgcGFzdCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdID09PSAnYWdvJztcblxuICAgIGlmICghZnV0dXJlICYmICFwYXN0ICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86IFwiVGltZSBzaG91bGQgZWl0aGVyIHN0YXJ0IHdpdGggJ2luJyBvciBlbmQgd2l0aCAnYWdvJ1wiLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoZnV0dXJlICYmIHBhc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgaW5mbzogXCJUaW1lIGNhbm5vdCBoYXZlIGJvdGggJ2luJyBhbmQgJ2FnbydcIixcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gc3RyaXAgdGhlICdhZ28nIG9yICdpbidcbiAgICBpZiAoZnV0dXJlKSB7XG4gICAgICBwYXJ0cyA9IHBhcnRzLnNsaWNlKDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBwYXN0XG4gICAgICBwYXJ0cyA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDEpO1xuICAgIH1cblxuICAgIGlmIChwYXJ0cy5sZW5ndGggJSAyICE9PSAwICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86ICdJbnZhbGlkIHRpbWUgc3RyaW5nLiBEYW5nbGluZyB1bml0IG9yIG51bWJlci4nLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwYWlycyA9IFtdO1xuICAgIHdoaWxlIChwYXJ0cy5sZW5ndGgpIHtcbiAgICAgIHBhaXJzLnB1c2goW3BhcnRzLnNoaWZ0KCksIHBhcnRzLnNoaWZ0KCldKTtcbiAgICB9XG5cbiAgICBsZXQgc2Vjb25kcyA9IDA7XG4gICAgZm9yIChjb25zdCBbbnVtLCBpbnRlcnZhbF0gb2YgcGFpcnMpIHtcbiAgICAgIGNvbnN0IHZhbCA9IE51bWJlcihudW0pO1xuICAgICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHZhbCkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgICAgaW5mbzogYCcke251bX0nIGlzIG5vdCBhbiBpbnRlZ2VyLmAsXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAoaW50ZXJ2YWwpIHtcbiAgICAgICAgY2FzZSAneXInOlxuICAgICAgICBjYXNlICd5cnMnOlxuICAgICAgICBjYXNlICd5ZWFyJzpcbiAgICAgICAgY2FzZSAneWVhcnMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogMzE1MzYwMDA7IC8vIDM2NSAqIDI0ICogNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ3drJzpcbiAgICAgICAgY2FzZSAnd2tzJzpcbiAgICAgICAgY2FzZSAnd2Vlayc6XG4gICAgICAgIGNhc2UgJ3dlZWtzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDYwNDgwMDsgLy8gNyAqIDI0ICogNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ2QnOlxuICAgICAgICBjYXNlICdkYXknOlxuICAgICAgICBjYXNlICdkYXlzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDg2NDAwOyAvLyAyNCAqIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICdocic6XG4gICAgICAgIGNhc2UgJ2hycyc6XG4gICAgICAgIGNhc2UgJ2hvdXInOlxuICAgICAgICBjYXNlICdob3Vycyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiAzNjAwOyAvLyA2MCAqIDYwXG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnbWluJzpcbiAgICAgICAgY2FzZSAnbWlucyc6XG4gICAgICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogNjA7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnc2VjJzpcbiAgICAgICAgY2FzZSAnc2Vjcyc6XG4gICAgICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgICAgIGluZm86IGBJbnZhbGlkIGludGVydmFsOiAnJHtpbnRlcnZhbH0nYCxcbiAgICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG1pbGxpc2Vjb25kcyA9IHNlY29uZHMgKiAxMDAwO1xuICAgIGlmIChmdXR1cmUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICBpbmZvOiAnZnV0dXJlJyxcbiAgICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpICsgbWlsbGlzZWNvbmRzKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChwYXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgaW5mbzogJ3Bhc3QnLFxuICAgICAgICByZXN1bHQ6IG5ldyBEYXRlKG5vdy52YWx1ZU9mKCkgLSBtaWxsaXNlY29uZHMpLFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgIGluZm86ICdwcmVzZW50JyxcbiAgICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpKSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERlZXAtc2NhbnMgYW4gb2JqZWN0IGZvciBhIG1hdGNoaW5nIGtleS92YWx1ZSBkZWZpbml0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gc2Nhbi5cbiAgICogQHBhcmFtIHtTdHJpbmcgfCB1bmRlZmluZWR9IGtleSBUaGUga2V5IHRvIG1hdGNoLCBvciB1bmRlZmluZWQgaWYgb25seSB0aGUgdmFsdWUgc2hvdWxkIGJlIG1hdGNoZWQuXG4gICAqIEBwYXJhbSB7YW55IHwgdW5kZWZpbmVkfSB2YWx1ZSBUaGUgdmFsdWUgdG8gbWF0Y2gsIG9yIHVuZGVmaW5lZCBpZiBvbmx5IHRoZSBrZXkgc2hvdWxkIGJlIG1hdGNoZWQuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBUcnVlIGlmIGEgbWF0Y2ggd2FzIGZvdW5kLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBzdGF0aWMgb2JqZWN0Q29udGFpbnNLZXlWYWx1ZShvYmosIGtleSwgdmFsdWUpIHtcbiAgICBjb25zdCBpc01hdGNoID0gKGEsIGIpID0+ICh0eXBlb2YgYSA9PT0gJ3N0cmluZycgJiYgbmV3IFJlZ0V4cChiKS50ZXN0KGEpKSB8fCBhID09PSBiO1xuICAgIGNvbnN0IGlzS2V5TWF0Y2ggPSBrID0+IGlzTWF0Y2goaywga2V5KTtcbiAgICBjb25zdCBpc1ZhbHVlTWF0Y2ggPSB2ID0+IGlzTWF0Y2godiwgdmFsdWUpO1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKG9iaikpIHtcbiAgICAgIGlmIChrZXkgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSA9PT0gdW5kZWZpbmVkICYmIGlzS2V5TWF0Y2goaykpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSB1bmRlZmluZWQgJiYgaXNWYWx1ZU1hdGNoKHYpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIGlmIChrZXkgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIGlzS2V5TWF0Y2goaykgJiYgaXNWYWx1ZU1hdGNoKHYpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKFsnW29iamVjdCBPYmplY3RdJywgJ1tvYmplY3QgQXJyYXldJ10uaW5jbHVkZXMoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHYpKSkge1xuICAgICAgICByZXR1cm4gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZSh2LCBrZXksIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgc3RhdGljIGNoZWNrUHJvaGliaXRlZEtleXdvcmRzKGNvbmZpZywgZGF0YSkge1xuICAgIGlmIChjb25maWc/LnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiBjb25maWcucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoZGF0YSwga2V5d29yZC5rZXksIGtleXdvcmQudmFsdWUpO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBgUHJvaGliaXRlZCBrZXl3b3JkIGluIHJlcXVlc3QgZGF0YTogJHtKU09OLnN0cmluZ2lmeShrZXl3b3JkKX0uYDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBNb3ZlcyB0aGUgbmVzdGVkIGtleXMgb2YgYSBzcGVjaWZpZWQga2V5IGluIGFuIG9iamVjdCB0byB0aGUgcm9vdCBvZiB0aGUgb2JqZWN0LlxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gbW9kaWZ5LlxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5IFRoZSBrZXkgd2hvc2UgbmVzdGVkIGtleXMgd2lsbCBiZSBtb3ZlZCB0byByb290LlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgbW9kaWZpZWQgb2JqZWN0LCBvciB0aGUgb3JpZ2luYWwgb2JqZWN0IGlmIG5vIG1vZGlmaWNhdGlvbiBoYXBwZW5lZC5cbiAgICogQGV4YW1wbGVcbiAgICogY29uc3Qgb2JqID0ge1xuICAgKiAgIGE6IDEsXG4gICAqICAgYjoge1xuICAgKiAgICAgYzogMixcbiAgICogICAgIGQ6IDNcbiAgICogICB9LFxuICAgKiAgIGU6IDRcbiAgICogfTtcbiAgICogYWRkTmVzdGVkS2V5c1RvUm9vdChvYmosICdiJyk7XG4gICAqIGNvbnNvbGUubG9nKG9iaik7XG4gICAqIC8vIE91dHB1dDogeyBhOiAxLCBlOiA0LCBjOiAyLCBkOiAzIH1cbiAgKi9cbiAgc3RhdGljIGFkZE5lc3RlZEtleXNUb1Jvb3Qob2JqLCBrZXkpIHtcbiAgICBpZiAob2JqW2tleV0gJiYgdHlwZW9mIG9ialtrZXldID09PSAnb2JqZWN0Jykge1xuICAgICAgLy8gQWRkIG5lc3RlZCBrZXlzIHRvIHJvb3RcbiAgICAgIE9iamVjdC5hc3NpZ24ob2JqLCB7IC4uLm9ialtrZXldIH0pO1xuICAgICAgLy8gRGVsZXRlIG9yaWdpbmFsIG5lc3RlZCBrZXlcbiAgICAgIGRlbGV0ZSBvYmpba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLE9BQU8sQ0FBQyxN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