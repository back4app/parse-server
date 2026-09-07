"use strict";

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
    } catch {
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
    const stack = [obj];
    const seen = new WeakSet();
    while (stack.length > 0) {
      const current = stack.pop();
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);
      for (const [k, v] of Object.entries(current)) {
        if (key !== undefined && value === undefined && isKeyMatch(k)) {
          return true;
        } else if (key === undefined && value !== undefined && isValueMatch(v)) {
          return true;
        } else if (key !== undefined && value !== undefined && isKeyMatch(k) && isValueMatch(v)) {
          return true;
        }
        if (['[object Object]', '[object Array]'].includes(Object.prototype.toString.call(v))) {
          stack.push(v);
        }
      }
    }
    return false;
  }
  static checkProhibitedKeywords(config, data) {
    if (config?.requestKeywordDenylist) {
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
      Object.assign(obj, {
        ...obj[key]
      });
      // Delete original nested key
      delete obj[key];
    }
    return obj;
  }

  /**
   * Encodes a string to be used in a URL.
   * @param {String} input The string to encode.
   * @returns {String} The encoded string.
   */
  static encodeForUrl(input) {
    return encodeURIComponent(input).replace(/[!'.()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
  }

  /**
   * Creates a JSON replacer function that handles Map, Set, and circular references.
   * This replacer can be used with JSON.stringify to safely serialize complex objects.
   *
   * @returns {Function} A replacer function for JSON.stringify that:
   * - Converts Map instances to plain objects
   * - Converts Set instances to arrays
   * - Replaces circular references with '[Circular]' marker
   *
   * @example
   * const obj = { name: 'test', map: new Map([['key', 'value']]) };
   * obj.self = obj; // circular reference
   * JSON.stringify(obj, Utils.getCircularReplacer());
   * // Output: {"name":"test","map":{"key":"value"},"self":"[Circular]"}
   */
  static getCircularReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      if (value instanceof Set) {
        return Array.from(value);
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
  }

  /**
   * Gets a nested property value from an object using dot notation.
   * @param {Object} obj The object to get the property from.
   * @param {String} path The property path in dot notation, e.g. 'databaseOptions.allowPublicExplain'.
   * @returns {any} The property value or undefined if not found.
   * @example
   * const obj = { database: { options: { enabled: true } } };
   * Utils.getNestedProperty(obj, 'database.options.enabled');
   * // Output: true
   */
  static getNestedProperty(obj, path) {
    if (!obj || !path) {
      return undefined;
    }
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  /**
   * Returns the file extension as the substring after the last dot in the
   * filename. A trailing dot or a filename without a dot yields an empty
   * string. Callers apply any further normalization (whitespace, MIME
   * parameters, etc.) for their use case — this is a pure parser, not a
   * policy.
   *
   * @param {string} filename
   * @returns {string} the extension, or `''` if none
   */
  static getFileExtension(filename) {
    if (!filename || !filename.includes('.')) {
      return '';
    }
    return filename.substring(filename.lastIndexOf('.') + 1);
  }
}
module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiaXNQYXRoIiwicyIsInRlc3QiLCJmbGF0dGVuT2JqZWN0Iiwib2JqIiwicGFyZW50S2V5IiwiZGVsaW1pdGVyIiwicmVzdWx0Iiwia2V5IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwibmV3S2V5IiwiaXNQcm9taXNlIiwib2JqZWN0IiwiUHJvbWlzZSIsImdldE9iamVjdEtleVBlcm11dGF0aW9ucyIsImluZGV4IiwiY3VycmVudCIsInJlc3VsdHMiLCJrZXlzIiwidmFsdWVzIiwidmFsdWUiLCJuZXh0SW5kZXgiLCJsZW5ndGgiLCJhc3NpZ24iLCJwdXNoIiwidmFsaWRhdGVQYXJhbXMiLCJwYXJhbXMiLCJ0eXBlcyIsInR5cGUiLCJpc09wdGlvbmFsIiwibyIsInBhcmFtIiwidiIsInQiLCJyZWxhdGl2ZVRpbWVUb0RhdGUiLCJ0ZXh0Iiwibm93IiwiRGF0ZSIsInRvTG93ZXJDYXNlIiwicGFydHMiLCJmaWx0ZXIiLCJwYXJ0IiwiZnV0dXJlIiwicGFzdCIsInN0YXR1cyIsImluZm8iLCJzbGljZSIsInBhaXJzIiwic2hpZnQiLCJzZWNvbmRzIiwibnVtIiwiaW50ZXJ2YWwiLCJ2YWwiLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJtaWxsaXNlY29uZHMiLCJ2YWx1ZU9mIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsImlzTWF0Y2giLCJhIiwiYiIsIlJlZ0V4cCIsImlzS2V5TWF0Y2giLCJrIiwiaXNWYWx1ZU1hdGNoIiwic3RhY2siLCJzZWVuIiwiV2Vha1NldCIsInBvcCIsImhhcyIsImFkZCIsImVudHJpZXMiLCJ1bmRlZmluZWQiLCJpbmNsdWRlcyIsInRvU3RyaW5nIiwiY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMiLCJjb25maWciLCJkYXRhIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJtYXRjaCIsIkpTT04iLCJzdHJpbmdpZnkiLCJhZGROZXN0ZWRLZXlzVG9Sb290IiwiZW5jb2RlRm9yVXJsIiwiaW5wdXQiLCJlbmNvZGVVUklDb21wb25lbnQiLCJyZXBsYWNlIiwiY2hhciIsImNoYXJDb2RlQXQiLCJ0b1VwcGVyQ2FzZSIsImdldENpcmN1bGFyUmVwbGFjZXIiLCJNYXAiLCJmcm9tRW50cmllcyIsIlNldCIsIkFycmF5IiwiZnJvbSIsImdldE5lc3RlZFByb3BlcnR5IiwiZ2V0RmlsZUV4dGVuc2lvbiIsImZpbGVuYW1lIiwic3Vic3RyaW5nIiwibGFzdEluZGV4T2YiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1V0aWxzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogdXRpbHMuanNcbiAqIEBmaWxlIEdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXNcbiAqIEBkZXNjcmlwdGlvbiBHZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzLlxuICovXG5cbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5jb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJykucHJvbWlzZXM7XG5cbi8qKlxuICogVGhlIGdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXMuXG4gKi9cbmNsYXNzIFV0aWxzIHtcbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBnZXRMb2NhbGl6ZWRQYXRoXG4gICAqIEBkZXNjcmlwdGlvbiBSZXR1cm5zIGEgbG9jYWxpemVkIGZpbGUgcGF0aCBhY2NvcmluZyB0byB0aGUgbG9jYWxlLlxuICAgKlxuICAgKiBMb2NhbGl6ZWQgZmlsZXMgYXJlIHNlYXJjaGVkIGluIHN1YmZvbGRlcnMgb2YgYSBnaXZlbiBwYXRoLCBlLmcuXG4gICAqXG4gICAqIHJvb3QvXG4gICAqIOKUnOKUgOKUgCBiYXNlLyAgICAgICAgICAgICAgICAgICAgLy8gYmFzZSBwYXRoIHRvIGZpbGVzXG4gICAqIOKUgiAgIOKUnOKUgOKUgCBleGFtcGxlLmh0bWwgICAgICAgICAvLyBkZWZhdWx0IGZpbGVcbiAgICog4pSCICAg4pSU4pSA4pSAIGRlLyAgICAgICAgICAgICAgICAgIC8vIGRlIGxhbmd1YWdlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZSBsb2NhbGl6ZWQgZmlsZVxuICAgKiDilIIgICDilJTilIDilIAgZGUtQVQvICAgICAgICAgICAgICAgLy8gZGUtQVQgbG9jYWxlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZS1BVCBsb2NhbGl6ZWQgZmlsZVxuICAgKlxuICAgKiBGaWxlcyBhcmUgbWF0Y2hlZCB3aXRoIHRoZSBsb2NhbGUgaW4gdGhlIGZvbGxvd2luZyBvcmRlcjpcbiAgICogMS4gTG9jYWxlIG1hdGNoLCBlLmcuIGxvY2FsZSBgZGUtQVRgIG1hdGNoZXMgZmlsZSBpbiBmb2xkZXIgYGRlLUFUYC5cbiAgICogMi4gTGFuZ3VhZ2UgbWF0Y2gsIGUuZy4gbG9jYWxlIGBkZS1BVGAgbWF0Y2hlcyBmaWxlIGluIGZvbGRlciBgZGVgLlxuICAgKiAzLiBEZWZhdWx0OyBmaWxlIGluIGJhc2UgZm9sZGVyIGlzIHJldHVybmVkLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZGVmYXVsdFBhdGggVGhlIGFic29sdXRlIGZpbGUgcGF0aCwgd2hpY2ggaXMgYWxzb1xuICAgKiB0aGUgZGVmYXVsdCBwYXRoIHJldHVybmVkIGlmIGxvY2FsaXphdGlvbiBpcyBub3QgYXZhaWxhYmxlLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSBvYmplY3QgY29udGFpbnM6XG4gICAqIC0gYHBhdGhgOiBUaGUgcGF0aCB0byB0aGUgbG9jYWxpemVkIGZpbGUsIG9yIHRoZSBvcmlnaW5hbCBwYXRoIGlmXG4gICAqICAgbG9jYWxpemF0aW9uIGlzIG5vdCBhdmFpbGFibGUuXG4gICAqIC0gYHN1YmRpcmA6IFRoZSBzdWJkaXJlY3Rvcnkgb2YgdGhlIGxvY2FsaXplZCBmaWxlLCBvciB1bmRlZmluZWQgaWZcbiAgICogICB0aGVyZSBpcyBubyBtYXRjaGluZyBsb2NhbGl6ZWQgZmlsZS5cbiAgICovXG4gIHN0YXRpYyBhc3luYyBnZXRMb2NhbGl6ZWRQYXRoKGRlZmF1bHRQYXRoLCBsb2NhbGUpIHtcbiAgICAvLyBHZXQgZmlsZSBuYW1lIGFuZCBwYXRoc1xuICAgIGNvbnN0IGZpbGUgPSBwYXRoLmJhc2VuYW1lKGRlZmF1bHRQYXRoKTtcbiAgICBjb25zdCBiYXNlUGF0aCA9IHBhdGguZGlybmFtZShkZWZhdWx0UGF0aCk7XG5cbiAgICAvLyBJZiBsb2NhbGUgaXMgbm90IHNldCByZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgaWYgKCFsb2NhbGUpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGRlZmF1bHRQYXRoIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbG9jYWxlIGV4aXN0c1xuICAgIGNvbnN0IGxvY2FsZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxvY2FsZSwgZmlsZSk7XG4gICAgY29uc3QgbG9jYWxlRmlsZUV4aXN0cyA9IGF3YWl0IFV0aWxzLmZpbGVFeGlzdHMobG9jYWxlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsb2NhbGUgZXhpc3RzIHJldHVybiBmaWxlXG4gICAgaWYgKGxvY2FsZUZpbGVFeGlzdHMpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGxvY2FsZVBhdGgsIHN1YmRpcjogbG9jYWxlIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbGFuZ3VhZ2UgZXhpc3RzXG4gICAgY29uc3QgbGFuZ3VhZ2UgPSBsb2NhbGUuc3BsaXQoJy0nKVswXTtcbiAgICBjb25zdCBsYW5ndWFnZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxhbmd1YWdlLCBmaWxlKTtcbiAgICBjb25zdCBsYW5ndWFnZUZpbGVFeGlzdHMgPSBhd2FpdCBVdGlscy5maWxlRXhpc3RzKGxhbmd1YWdlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsYW5ndWFnZSBleGlzdHMgcmV0dXJuIGZpbGVcbiAgICBpZiAobGFuZ3VhZ2VGaWxlRXhpc3RzKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBsYW5ndWFnZVBhdGgsIHN1YmRpcjogbGFuZ3VhZ2UgfTtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgcmV0dXJuIHsgcGF0aDogZGVmYXVsdFBhdGggfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gZmlsZUV4aXN0c1xuICAgKiBAZGVzY3JpcHRpb24gQ2hlY2tzIHdoZXRoZXIgYSBmaWxlIGV4aXN0cy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIGZpbGUgcGF0aC5cbiAgICogQHJldHVybnMge1Byb21pc2U8Qm9vbGVhbj59IElzIHRydWUgaWYgdGhlIGZpbGUgY2FuIGJlIGFjY2Vzc2VkLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZmlsZUV4aXN0cyhwYXRoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLmFjY2VzcyhwYXRoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gaXNQYXRoXG4gICAqIEBkZXNjcmlwdGlvbiBFdmFsdWF0ZXMgd2hldGhlciBhIHN0cmluZyBpcyBhIGZpbGUgcGF0aCAoYXMgb3Bwb3NlZCB0byBhIFVSTCBmb3IgZXhhbXBsZSkuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzIFRoZSBzdHJpbmcgdG8gZXZhbHVhdGUuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBSZXR1cm5zIHRydWUgaWYgdGhlIGV2YWx1YXRlZCBzdHJpbmcgaXMgYSBwYXRoLlxuICAgKi9cbiAgc3RhdGljIGlzUGF0aChzKSB7XG4gICAgcmV0dXJuIC8oXlxcLyl8KF5cXC5cXC8pfCheXFwuXFwuXFwvKS8udGVzdChzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGbGF0dGVucyBhbiBvYmplY3QgYW5kIGNyYXRlcyBuZXcga2V5cyB3aXRoIGN1c3RvbSBkZWxpbWl0ZXJzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gZmxhdHRlbi5cbiAgICogQHBhcmFtIHtTdHJpbmd9IFtkZWxpbWl0ZXI9Jy4nXSBUaGUgZGVsaW1pdGVyIG9mIHRoZSBuZXdseSBnZW5lcmF0ZWQga2V5cy5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3VsdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgZmxhdHRlbmVkIG9iamVjdC5cbiAgICoqL1xuICBzdGF0aWMgZmxhdHRlbk9iamVjdChvYmosIHBhcmVudEtleSwgZGVsaW1pdGVyID0gJy4nLCByZXN1bHQgPSB7fSkge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgY29uc3QgbmV3S2V5ID0gcGFyZW50S2V5ID8gcGFyZW50S2V5ICsgZGVsaW1pdGVyICsga2V5IDoga2V5O1xuXG4gICAgICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdvYmplY3QnICYmIG9ialtrZXldICE9PSBudWxsKSB7XG4gICAgICAgICAgdGhpcy5mbGF0dGVuT2JqZWN0KG9ialtrZXldLCBuZXdLZXksIGRlbGltaXRlciwgcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHRbbmV3S2V5XSA9IG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIGFuIG9iamVjdCBpcyBhIFByb21pc2UuXG4gICAqIEBwYXJhbSB7YW55fSBvYmplY3QgVGhlIG9iamVjdCB0byB2YWxpZGF0ZS5cbiAgICogQHJldHVybnMge0Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgb2JqZWN0IGlzIGEgcHJvbWlzZS5cbiAgICovXG4gIHN0YXRpYyBpc1Byb21pc2Uob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIFByb21pc2U7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhbiBvYmplY3Qgd2l0aCBhbGwgcGVybXV0YXRpb25zIG9mIHRoZSBvcmlnaW5hbCBrZXlzLlxuICAgKiBGb3IgZXhhbXBsZSwgdGhpcyBkZWZpbml0aW9uOlxuICAgKiBgYGBcbiAgICoge1xuICAgKiAgIGE6IFt0cnVlLCBmYWxzZV0sXG4gICAqICAgYjogWzEsIDJdLFxuICAgKiAgIGM6IFsneCddXG4gICAqIH1cbiAgICogYGBgXG4gICAqIHBlcm11dGF0ZXMgdG86XG4gICAqIGBgYFxuICAgKiBbXG4gICAqICAgeyBhOiB0cnVlLCBiOiAxLCBjOiAneCcgfSxcbiAgICogICB7IGE6IHRydWUsIGI6IDIsIGM6ICd4JyB9LFxuICAgKiAgIHsgYTogZmFsc2UsIGI6IDEsIGM6ICd4JyB9LFxuICAgKiAgIHsgYTogZmFsc2UsIGI6IDIsIGM6ICd4JyB9XG4gICAqIF1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBwZXJtdXRhdGUuXG4gICAqIEBwYXJhbSB7SW50ZWdlcn0gW2luZGV4PTBdIFRoZSBjdXJyZW50IGtleSBpbmRleC5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtjdXJyZW50PXt9XSBUaGUgY3VycmVudCByZXN1bHQgZW50cnkgYmVpbmcgY29tcG9zZWQuXG4gICAqIEBwYXJhbSB7QXJyYXl9IFtyZXN1bHRzPVtdXSBUaGUgcmVzdWx0aW5nIGFycmF5IG9mIHBlcm11dGF0aW9ucy5cbiAgICovXG4gIHN0YXRpYyBnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMob2JqZWN0LCBpbmRleCA9IDAsIGN1cnJlbnQgPSB7fSwgcmVzdWx0cyA9IFtdKSB7XG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qga2V5ID0ga2V5c1tpbmRleF07XG4gICAgY29uc3QgdmFsdWVzID0gb2JqZWN0W2tleV07XG5cbiAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuICAgICAgY3VycmVudFtrZXldID0gdmFsdWU7XG4gICAgICBjb25zdCBuZXh0SW5kZXggPSBpbmRleCArIDE7XG5cbiAgICAgIGlmIChuZXh0SW5kZXggPCBrZXlzLmxlbmd0aCkge1xuICAgICAgICBVdGlscy5nZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMob2JqZWN0LCBuZXh0SW5kZXgsIGN1cnJlbnQsIHJlc3VsdHMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gT2JqZWN0LmFzc2lnbih7fSwgY3VycmVudCk7XG4gICAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgcGFyYW1ldGVycyBhbmQgdGhyb3dzIGlmIGEgcGFyYW1ldGVyIGlzIGludmFsaWQuXG4gICAqIEV4YW1wbGUgcGFyYW1ldGVyIHR5cGVzIHN5bnRheDpcbiAgICogYGBgXG4gICAqIHtcbiAgICogICBwYXJhbWV0ZXJOYW1lOiB7XG4gICAqICAgICAgdDogJ2Jvb2xlYW4nLFxuICAgKiAgICAgIHY6IGlzQm9vbGVhbixcbiAgICogICAgICBvOiB0cnVlXG4gICAqICAgfSxcbiAgICogICAuLi5cbiAgICogfVxuICAgKiBgYGBcbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycyB0byB2YWxpZGF0ZS5cbiAgICogQHBhcmFtIHtBcnJheTxPYmplY3Q+fSB0eXBlcyBUaGUgcGFyYW1ldGVyIHR5cGVzIHVzZWQgZm9yIHZhbGlkYXRpb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0eXBlcy50IFRoZSBwYXJhbWV0ZXIgdHlwZTsgdXNlZCBmb3IgZXJyb3IgbWVzc2FnZSwgbm90IGZvciB2YWxpZGF0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHlwZXMudiBUaGUgZnVuY3Rpb24gdG8gdmFsaWRhdGUgdGhlIHBhcmFtZXRlciB2YWx1ZS5cbiAgICogQHBhcmFtIHtCb29sZWFufSBbdHlwZXMubz1mYWxzZV0gSXMgdHJ1ZSBpZiB0aGUgcGFyYW1ldGVyIGlzIG9wdGlvbmFsLlxuICAgKi9cbiAgc3RhdGljIHZhbGlkYXRlUGFyYW1zKHBhcmFtcywgdHlwZXMpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhwYXJhbXMpKSB7XG4gICAgICBjb25zdCB0eXBlID0gdHlwZXNba2V5XTtcbiAgICAgIGNvbnN0IGlzT3B0aW9uYWwgPSAhIXR5cGUubztcbiAgICAgIGNvbnN0IHBhcmFtID0gcGFyYW1zW2tleV07XG4gICAgICBpZiAoIShpc09wdGlvbmFsICYmIHBhcmFtID09IG51bGwpICYmICF0eXBlLnYocGFyYW0pKSB7XG4gICAgICAgIHRocm93IGBJbnZhbGlkIHBhcmFtZXRlciAke2tleX0gbXVzdCBiZSBvZiB0eXBlICR7dHlwZS50fSBidXQgaXMgJHt0eXBlb2YgcGFyYW19YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ29tcHV0ZXMgdGhlIHJlbGF0aXZlIGRhdGUgYmFzZWQgb24gYSBzdHJpbmcuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBzdHJpbmcgdG8gaW50ZXJwcmV0IHRoZSBkYXRlIGZyb20uXG4gICAqIEBwYXJhbSB7RGF0ZX0gbm93IFRoZSBkYXRlIHRoZSBzdHJpbmcgaXMgY29tcGFyaW5nIGFnYWluc3QuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSByZWxhdGl2ZSBkYXRlIG9iamVjdC5cbiAgICoqL1xuICBzdGF0aWMgcmVsYXRpdmVUaW1lVG9EYXRlKHRleHQsIG5vdyA9IG5ldyBEYXRlKCkpIHtcbiAgICB0ZXh0ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuICAgIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoJyAnKTtcblxuICAgIC8vIEZpbHRlciBvdXQgd2hpdGVzcGFjZVxuICAgIHBhcnRzID0gcGFydHMuZmlsdGVyKHBhcnQgPT4gcGFydCAhPT0gJycpO1xuXG4gICAgY29uc3QgZnV0dXJlID0gcGFydHNbMF0gPT09ICdpbic7XG4gICAgY29uc3QgcGFzdCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdID09PSAnYWdvJztcblxuICAgIGlmICghZnV0dXJlICYmICFwYXN0ICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86IFwiVGltZSBzaG91bGQgZWl0aGVyIHN0YXJ0IHdpdGggJ2luJyBvciBlbmQgd2l0aCAnYWdvJ1wiLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoZnV0dXJlICYmIHBhc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgaW5mbzogXCJUaW1lIGNhbm5vdCBoYXZlIGJvdGggJ2luJyBhbmQgJ2FnbydcIixcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gc3RyaXAgdGhlICdhZ28nIG9yICdpbidcbiAgICBpZiAoZnV0dXJlKSB7XG4gICAgICBwYXJ0cyA9IHBhcnRzLnNsaWNlKDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBwYXN0XG4gICAgICBwYXJ0cyA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDEpO1xuICAgIH1cblxuICAgIGlmIChwYXJ0cy5sZW5ndGggJSAyICE9PSAwICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86ICdJbnZhbGlkIHRpbWUgc3RyaW5nLiBEYW5nbGluZyB1bml0IG9yIG51bWJlci4nLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwYWlycyA9IFtdO1xuICAgIHdoaWxlIChwYXJ0cy5sZW5ndGgpIHtcbiAgICAgIHBhaXJzLnB1c2goW3BhcnRzLnNoaWZ0KCksIHBhcnRzLnNoaWZ0KCldKTtcbiAgICB9XG5cbiAgICBsZXQgc2Vjb25kcyA9IDA7XG4gICAgZm9yIChjb25zdCBbbnVtLCBpbnRlcnZhbF0gb2YgcGFpcnMpIHtcbiAgICAgIGNvbnN0IHZhbCA9IE51bWJlcihudW0pO1xuICAgICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHZhbCkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgICAgaW5mbzogYCcke251bX0nIGlzIG5vdCBhbiBpbnRlZ2VyLmAsXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAoaW50ZXJ2YWwpIHtcbiAgICAgICAgY2FzZSAneXInOlxuICAgICAgICBjYXNlICd5cnMnOlxuICAgICAgICBjYXNlICd5ZWFyJzpcbiAgICAgICAgY2FzZSAneWVhcnMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogMzE1MzYwMDA7IC8vIDM2NSAqIDI0ICogNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ3drJzpcbiAgICAgICAgY2FzZSAnd2tzJzpcbiAgICAgICAgY2FzZSAnd2Vlayc6XG4gICAgICAgIGNhc2UgJ3dlZWtzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDYwNDgwMDsgLy8gNyAqIDI0ICogNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ2QnOlxuICAgICAgICBjYXNlICdkYXknOlxuICAgICAgICBjYXNlICdkYXlzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDg2NDAwOyAvLyAyNCAqIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICdocic6XG4gICAgICAgIGNhc2UgJ2hycyc6XG4gICAgICAgIGNhc2UgJ2hvdXInOlxuICAgICAgICBjYXNlICdob3Vycyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiAzNjAwOyAvLyA2MCAqIDYwXG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnbWluJzpcbiAgICAgICAgY2FzZSAnbWlucyc6XG4gICAgICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogNjA7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnc2VjJzpcbiAgICAgICAgY2FzZSAnc2Vjcyc6XG4gICAgICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgICAgIGluZm86IGBJbnZhbGlkIGludGVydmFsOiAnJHtpbnRlcnZhbH0nYCxcbiAgICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG1pbGxpc2Vjb25kcyA9IHNlY29uZHMgKiAxMDAwO1xuICAgIGlmIChmdXR1cmUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICBpbmZvOiAnZnV0dXJlJyxcbiAgICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpICsgbWlsbGlzZWNvbmRzKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChwYXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgaW5mbzogJ3Bhc3QnLFxuICAgICAgICByZXN1bHQ6IG5ldyBEYXRlKG5vdy52YWx1ZU9mKCkgLSBtaWxsaXNlY29uZHMpLFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgIGluZm86ICdwcmVzZW50JyxcbiAgICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpKSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERlZXAtc2NhbnMgYW4gb2JqZWN0IGZvciBhIG1hdGNoaW5nIGtleS92YWx1ZSBkZWZpbml0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gc2Nhbi5cbiAgICogQHBhcmFtIHtTdHJpbmcgfCB1bmRlZmluZWR9IGtleSBUaGUga2V5IHRvIG1hdGNoLCBvciB1bmRlZmluZWQgaWYgb25seSB0aGUgdmFsdWUgc2hvdWxkIGJlIG1hdGNoZWQuXG4gICAqIEBwYXJhbSB7YW55IHwgdW5kZWZpbmVkfSB2YWx1ZSBUaGUgdmFsdWUgdG8gbWF0Y2gsIG9yIHVuZGVmaW5lZCBpZiBvbmx5IHRoZSBrZXkgc2hvdWxkIGJlIG1hdGNoZWQuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBUcnVlIGlmIGEgbWF0Y2ggd2FzIGZvdW5kLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBzdGF0aWMgb2JqZWN0Q29udGFpbnNLZXlWYWx1ZShvYmosIGtleSwgdmFsdWUpIHtcbiAgICBjb25zdCBpc01hdGNoID0gKGEsIGIpID0+ICh0eXBlb2YgYSA9PT0gJ3N0cmluZycgJiYgbmV3IFJlZ0V4cChiKS50ZXN0KGEpKSB8fCBhID09PSBiO1xuICAgIGNvbnN0IGlzS2V5TWF0Y2ggPSBrID0+IGlzTWF0Y2goaywga2V5KTtcbiAgICBjb25zdCBpc1ZhbHVlTWF0Y2ggPSB2ID0+IGlzTWF0Y2godiwgdmFsdWUpO1xuICAgIGNvbnN0IHN0YWNrID0gW29ial07XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBXZWFrU2V0KCk7XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBzdGFjay5wb3AoKTtcbiAgICAgIGlmIChzZWVuLmhhcyhjdXJyZW50KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHNlZW4uYWRkKGN1cnJlbnQpO1xuICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoY3VycmVudCkpIHtcbiAgICAgICAgaWYgKGtleSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlID09PSB1bmRlZmluZWQgJiYgaXNLZXlNYXRjaChrKSkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKGtleSA9PT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSB1bmRlZmluZWQgJiYgaXNWYWx1ZU1hdGNoKHYpKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAoa2V5ICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IHVuZGVmaW5lZCAmJiBpc0tleU1hdGNoKGspICYmIGlzVmFsdWVNYXRjaCh2KSkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChbJ1tvYmplY3QgT2JqZWN0XScsICdbb2JqZWN0IEFycmF5XSddLmluY2x1ZGVzKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2KSkpIHtcbiAgICAgICAgICBzdGFjay5wdXNoKHYpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHN0YXRpYyBjaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyhjb25maWcsIGRhdGEpIHtcbiAgICBpZiAoY29uZmlnPy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKGRhdGEsIGtleXdvcmQua2V5LCBrZXl3b3JkLnZhbHVlKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogTW92ZXMgdGhlIG5lc3RlZCBrZXlzIG9mIGEgc3BlY2lmaWVkIGtleSBpbiBhbiBvYmplY3QgdG8gdGhlIHJvb3Qgb2YgdGhlIG9iamVjdC5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIG1vZGlmeS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleSBUaGUga2V5IHdob3NlIG5lc3RlZCBrZXlzIHdpbGwgYmUgbW92ZWQgdG8gcm9vdC5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIG1vZGlmaWVkIG9iamVjdCwgb3IgdGhlIG9yaWdpbmFsIG9iamVjdCBpZiBubyBtb2RpZmljYXRpb24gaGFwcGVuZWQuXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IG9iaiA9IHtcbiAgICogICBhOiAxLFxuICAgKiAgIGI6IHtcbiAgICogICAgIGM6IDIsXG4gICAqICAgICBkOiAzXG4gICAqICAgfSxcbiAgICogICBlOiA0XG4gICAqIH07XG4gICAqIGFkZE5lc3RlZEtleXNUb1Jvb3Qob2JqLCAnYicpO1xuICAgKiBjb25zb2xlLmxvZyhvYmopO1xuICAgKiAvLyBPdXRwdXQ6IHsgYTogMSwgZTogNCwgYzogMiwgZDogMyB9XG4gICovXG4gIHN0YXRpYyBhZGROZXN0ZWRLZXlzVG9Sb290KG9iaiwga2V5KSB7XG4gICAgaWYgKG9ialtrZXldICYmIHR5cGVvZiBvYmpba2V5XSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIC8vIEFkZCBuZXN0ZWQga2V5cyB0byByb290XG4gICAgICBPYmplY3QuYXNzaWduKG9iaiwgeyAuLi5vYmpba2V5XSB9KTtcbiAgICAgIC8vIERlbGV0ZSBvcmlnaW5hbCBuZXN0ZWQga2V5XG4gICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICAvKipcbiAgICogRW5jb2RlcyBhIHN0cmluZyB0byBiZSB1c2VkIGluIGEgVVJMLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIHN0cmluZyB0byBlbmNvZGUuXG4gICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBlbmNvZGVkIHN0cmluZy5cbiAgICovXG4gIHN0YXRpYyBlbmNvZGVGb3JVcmwoaW5wdXQpIHtcbiAgICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0KS5yZXBsYWNlKC9bIScuKCkqXS9nLCBjaGFyID0+XG4gICAgICAnJScgKyBjaGFyLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpLnRvVXBwZXJDYXNlKClcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBKU09OIHJlcGxhY2VyIGZ1bmN0aW9uIHRoYXQgaGFuZGxlcyBNYXAsIFNldCwgYW5kIGNpcmN1bGFyIHJlZmVyZW5jZXMuXG4gICAqIFRoaXMgcmVwbGFjZXIgY2FuIGJlIHVzZWQgd2l0aCBKU09OLnN0cmluZ2lmeSB0byBzYWZlbHkgc2VyaWFsaXplIGNvbXBsZXggb2JqZWN0cy5cbiAgICpcbiAgICogQHJldHVybnMge0Z1bmN0aW9ufSBBIHJlcGxhY2VyIGZ1bmN0aW9uIGZvciBKU09OLnN0cmluZ2lmeSB0aGF0OlxuICAgKiAtIENvbnZlcnRzIE1hcCBpbnN0YW5jZXMgdG8gcGxhaW4gb2JqZWN0c1xuICAgKiAtIENvbnZlcnRzIFNldCBpbnN0YW5jZXMgdG8gYXJyYXlzXG4gICAqIC0gUmVwbGFjZXMgY2lyY3VsYXIgcmVmZXJlbmNlcyB3aXRoICdbQ2lyY3VsYXJdJyBtYXJrZXJcbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogY29uc3Qgb2JqID0geyBuYW1lOiAndGVzdCcsIG1hcDogbmV3IE1hcChbWydrZXknLCAndmFsdWUnXV0pIH07XG4gICAqIG9iai5zZWxmID0gb2JqOyAvLyBjaXJjdWxhciByZWZlcmVuY2VcbiAgICogSlNPTi5zdHJpbmdpZnkob2JqLCBVdGlscy5nZXRDaXJjdWxhclJlcGxhY2VyKCkpO1xuICAgKiAvLyBPdXRwdXQ6IHtcIm5hbWVcIjpcInRlc3RcIixcIm1hcFwiOntcImtleVwiOlwidmFsdWVcIn0sXCJzZWxmXCI6XCJbQ2lyY3VsYXJdXCJ9XG4gICAqL1xuICBzdGF0aWMgZ2V0Q2lyY3VsYXJSZXBsYWNlcigpIHtcbiAgICBjb25zdCBzZWVuID0gbmV3IFdlYWtTZXQoKTtcbiAgICByZXR1cm4gKGtleSwgdmFsdWUpID0+IHtcbiAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIE1hcCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKHZhbHVlKTtcbiAgICAgIH1cbiAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFNldCkge1xuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbSh2YWx1ZSk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoc2Vlbi5oYXModmFsdWUpKSB7XG4gICAgICAgICAgcmV0dXJuICdbQ2lyY3VsYXJdJztcbiAgICAgICAgfVxuICAgICAgICBzZWVuLmFkZCh2YWx1ZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIGEgbmVzdGVkIHByb3BlcnR5IHZhbHVlIGZyb20gYW4gb2JqZWN0IHVzaW5nIGRvdCBub3RhdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIGdldCB0aGUgcHJvcGVydHkgZnJvbS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHByb3BlcnR5IHBhdGggaW4gZG90IG5vdGF0aW9uLCBlLmcuICdkYXRhYmFzZU9wdGlvbnMuYWxsb3dQdWJsaWNFeHBsYWluJy5cbiAgICogQHJldHVybnMge2FueX0gVGhlIHByb3BlcnR5IHZhbHVlIG9yIHVuZGVmaW5lZCBpZiBub3QgZm91bmQuXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IG9iaiA9IHsgZGF0YWJhc2U6IHsgb3B0aW9uczogeyBlbmFibGVkOiB0cnVlIH0gfSB9O1xuICAgKiBVdGlscy5nZXROZXN0ZWRQcm9wZXJ0eShvYmosICdkYXRhYmFzZS5vcHRpb25zLmVuYWJsZWQnKTtcbiAgICogLy8gT3V0cHV0OiB0cnVlXG4gICAqL1xuICBzdGF0aWMgZ2V0TmVzdGVkUHJvcGVydHkob2JqLCBwYXRoKSB7XG4gICAgaWYgKCFvYmogfHwgIXBhdGgpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IGtleXMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgbGV0IGN1cnJlbnQgPSBvYmo7XG4gICAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgICAgaWYgKGN1cnJlbnQgPT0gbnVsbCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50W2tleV07XG4gICAgfVxuICAgIHJldHVybiBjdXJyZW50O1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGZpbGUgZXh0ZW5zaW9uIGFzIHRoZSBzdWJzdHJpbmcgYWZ0ZXIgdGhlIGxhc3QgZG90IGluIHRoZVxuICAgKiBmaWxlbmFtZS4gQSB0cmFpbGluZyBkb3Qgb3IgYSBmaWxlbmFtZSB3aXRob3V0IGEgZG90IHlpZWxkcyBhbiBlbXB0eVxuICAgKiBzdHJpbmcuIENhbGxlcnMgYXBwbHkgYW55IGZ1cnRoZXIgbm9ybWFsaXphdGlvbiAod2hpdGVzcGFjZSwgTUlNRVxuICAgKiBwYXJhbWV0ZXJzLCBldGMuKSBmb3IgdGhlaXIgdXNlIGNhc2Ug4oCUIHRoaXMgaXMgYSBwdXJlIHBhcnNlciwgbm90IGFcbiAgICogcG9saWN5LlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWVcbiAgICogQHJldHVybnMge3N0cmluZ30gdGhlIGV4dGVuc2lvbiwgb3IgYCcnYCBpZiBub25lXG4gICAqL1xuICBzdGF0aWMgZ2V0RmlsZUV4dGVuc2lvbihmaWxlbmFtZSkge1xuICAgIGlmICghZmlsZW5hbWUgfHwgIWZpbGVuYW1lLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgIHJldHVybiAnJztcbiAgICB9XG4gICAgcmV0dXJuIGZpbGVuYW1lLnN1YnN0cmluZyhmaWxlbmFtZS5sYXN0SW5kZXhPZignLicpICsgMSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBVdGlscztcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLE1BQU1BLElBQUksR0FBR0MsT0FBTyxDQUFDLE1BQU0sQ0FBQztBQUM1QixNQUFNQyxFQUFFLEdBQUdELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQ0UsUUFBUTs7QUFFakM7QUFDQTtBQUNBO0FBQ0EsTUFBTUMsS0FBSyxDQUFDO0VBQ1Y7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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