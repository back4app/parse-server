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

  /**
   * @function safeToJSON
   * @description Serializes a Parse object, returning `undefined` if serialization
   * throws (for example a pointer left without an object ID by a dot notation write).
   * Use where a failed serialization must not interrupt control flow, such as logging.
   * @param {object} object The Parse object to serialize.
   * @returns {object|undefined} The serialized object, or `undefined` on failure.
   */
  static safeToJSON(object) {
    try {
      return object.toJSON();
    } catch {
      return undefined;
    }
  }
}
module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiaXNQYXRoIiwicyIsInRlc3QiLCJmbGF0dGVuT2JqZWN0Iiwib2JqIiwicGFyZW50S2V5IiwiZGVsaW1pdGVyIiwicmVzdWx0Iiwia2V5IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwibmV3S2V5IiwiaXNQcm9taXNlIiwib2JqZWN0IiwiUHJvbWlzZSIsImdldE9iamVjdEtleVBlcm11dGF0aW9ucyIsImluZGV4IiwiY3VycmVudCIsInJlc3VsdHMiLCJrZXlzIiwidmFsdWVzIiwidmFsdWUiLCJuZXh0SW5kZXgiLCJsZW5ndGgiLCJhc3NpZ24iLCJwdXNoIiwidmFsaWRhdGVQYXJhbXMiLCJwYXJhbXMiLCJ0eXBlcyIsInR5cGUiLCJpc09wdGlvbmFsIiwibyIsInBhcmFtIiwidiIsInQiLCJyZWxhdGl2ZVRpbWVUb0RhdGUiLCJ0ZXh0Iiwibm93IiwiRGF0ZSIsInRvTG93ZXJDYXNlIiwicGFydHMiLCJmaWx0ZXIiLCJwYXJ0IiwiZnV0dXJlIiwicGFzdCIsInN0YXR1cyIsImluZm8iLCJzbGljZSIsInBhaXJzIiwic2hpZnQiLCJzZWNvbmRzIiwibnVtIiwiaW50ZXJ2YWwiLCJ2YWwiLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJtaWxsaXNlY29uZHMiLCJ2YWx1ZU9mIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsImlzTWF0Y2giLCJhIiwiYiIsIlJlZ0V4cCIsImlzS2V5TWF0Y2giLCJrIiwiaXNWYWx1ZU1hdGNoIiwic3RhY2siLCJzZWVuIiwiV2Vha1NldCIsInBvcCIsImhhcyIsImFkZCIsImVudHJpZXMiLCJ1bmRlZmluZWQiLCJpbmNsdWRlcyIsInRvU3RyaW5nIiwiY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMiLCJjb25maWciLCJkYXRhIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJtYXRjaCIsIkpTT04iLCJzdHJpbmdpZnkiLCJhZGROZXN0ZWRLZXlzVG9Sb290IiwiZW5jb2RlRm9yVXJsIiwiaW5wdXQiLCJlbmNvZGVVUklDb21wb25lbnQiLCJyZXBsYWNlIiwiY2hhciIsImNoYXJDb2RlQXQiLCJ0b1VwcGVyQ2FzZSIsImdldENpcmN1bGFyUmVwbGFjZXIiLCJNYXAiLCJmcm9tRW50cmllcyIsIlNldCIsIkFycmF5IiwiZnJvbSIsImdldE5lc3RlZFByb3BlcnR5IiwiZ2V0RmlsZUV4dGVuc2lvbiIsImZpbGVuYW1lIiwic3Vic3RyaW5nIiwibGFzdEluZGV4T2YiLCJzYWZlVG9KU09OIiwidG9KU09OIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9VdGlscy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIHV0aWxzLmpzXG4gKiBAZmlsZSBHZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzXG4gKiBAZGVzY3JpcHRpb24gR2VuZXJhbCBwdXJwb3NlIHV0aWxpdGllcy5cbiAqL1xuXG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuY29uc3QgZnMgPSByZXF1aXJlKCdmcycpLnByb21pc2VzO1xuXG4vKipcbiAqIFRoZSBnZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzLlxuICovXG5jbGFzcyBVdGlscyB7XG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gZ2V0TG9jYWxpemVkUGF0aFxuICAgKiBAZGVzY3JpcHRpb24gUmV0dXJucyBhIGxvY2FsaXplZCBmaWxlIHBhdGggYWNjb3JpbmcgdG8gdGhlIGxvY2FsZS5cbiAgICpcbiAgICogTG9jYWxpemVkIGZpbGVzIGFyZSBzZWFyY2hlZCBpbiBzdWJmb2xkZXJzIG9mIGEgZ2l2ZW4gcGF0aCwgZS5nLlxuICAgKlxuICAgKiByb290L1xuICAgKiDilJzilIDilIAgYmFzZS8gICAgICAgICAgICAgICAgICAgIC8vIGJhc2UgcGF0aCB0byBmaWxlc1xuICAgKiDilIIgICDilJzilIDilIAgZXhhbXBsZS5odG1sICAgICAgICAgLy8gZGVmYXVsdCBmaWxlXG4gICAqIOKUgiAgIOKUlOKUgOKUgCBkZS8gICAgICAgICAgICAgICAgICAvLyBkZSBsYW5ndWFnZSBmb2xkZXJcbiAgICog4pSCICAg4pSCICAg4pSU4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgLy8gZGUgbG9jYWxpemVkIGZpbGVcbiAgICog4pSCICAg4pSU4pSA4pSAIGRlLUFULyAgICAgICAgICAgICAgIC8vIGRlLUFUIGxvY2FsZSBmb2xkZXJcbiAgICog4pSCICAg4pSCICAg4pSU4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgLy8gZGUtQVQgbG9jYWxpemVkIGZpbGVcbiAgICpcbiAgICogRmlsZXMgYXJlIG1hdGNoZWQgd2l0aCB0aGUgbG9jYWxlIGluIHRoZSBmb2xsb3dpbmcgb3JkZXI6XG4gICAqIDEuIExvY2FsZSBtYXRjaCwgZS5nLiBsb2NhbGUgYGRlLUFUYCBtYXRjaGVzIGZpbGUgaW4gZm9sZGVyIGBkZS1BVGAuXG4gICAqIDIuIExhbmd1YWdlIG1hdGNoLCBlLmcuIGxvY2FsZSBgZGUtQVRgIG1hdGNoZXMgZmlsZSBpbiBmb2xkZXIgYGRlYC5cbiAgICogMy4gRGVmYXVsdDsgZmlsZSBpbiBiYXNlIGZvbGRlciBpcyByZXR1cm5lZC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlZmF1bHRQYXRoIFRoZSBhYnNvbHV0ZSBmaWxlIHBhdGgsIHdoaWNoIGlzIGFsc29cbiAgICogdGhlIGRlZmF1bHQgcGF0aCByZXR1cm5lZCBpZiBsb2NhbGl6YXRpb24gaXMgbm90IGF2YWlsYWJsZS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBUaGUgb2JqZWN0IGNvbnRhaW5zOlxuICAgKiAtIGBwYXRoYDogVGhlIHBhdGggdG8gdGhlIGxvY2FsaXplZCBmaWxlLCBvciB0aGUgb3JpZ2luYWwgcGF0aCBpZlxuICAgKiAgIGxvY2FsaXphdGlvbiBpcyBub3QgYXZhaWxhYmxlLlxuICAgKiAtIGBzdWJkaXJgOiBUaGUgc3ViZGlyZWN0b3J5IG9mIHRoZSBsb2NhbGl6ZWQgZmlsZSwgb3IgdW5kZWZpbmVkIGlmXG4gICAqICAgdGhlcmUgaXMgbm8gbWF0Y2hpbmcgbG9jYWxpemVkIGZpbGUuXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZ2V0TG9jYWxpemVkUGF0aChkZWZhdWx0UGF0aCwgbG9jYWxlKSB7XG4gICAgLy8gR2V0IGZpbGUgbmFtZSBhbmQgcGF0aHNcbiAgICBjb25zdCBmaWxlID0gcGF0aC5iYXNlbmFtZShkZWZhdWx0UGF0aCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBwYXRoLmRpcm5hbWUoZGVmYXVsdFBhdGgpO1xuXG4gICAgLy8gSWYgbG9jYWxlIGlzIG5vdCBzZXQgcmV0dXJuIGRlZmF1bHQgZmlsZVxuICAgIGlmICghbG9jYWxlKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBkZWZhdWx0UGF0aCB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZpbGUgZm9yIGxvY2FsZSBleGlzdHNcbiAgICBjb25zdCBsb2NhbGVQYXRoID0gcGF0aC5qb2luKGJhc2VQYXRoLCBsb2NhbGUsIGZpbGUpO1xuICAgIGNvbnN0IGxvY2FsZUZpbGVFeGlzdHMgPSBhd2FpdCBVdGlscy5maWxlRXhpc3RzKGxvY2FsZVBhdGgpO1xuXG4gICAgLy8gSWYgZmlsZSBmb3IgbG9jYWxlIGV4aXN0cyByZXR1cm4gZmlsZVxuICAgIGlmIChsb2NhbGVGaWxlRXhpc3RzKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBsb2NhbGVQYXRoLCBzdWJkaXI6IGxvY2FsZSB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZpbGUgZm9yIGxhbmd1YWdlIGV4aXN0c1xuICAgIGNvbnN0IGxhbmd1YWdlID0gbG9jYWxlLnNwbGl0KCctJylbMF07XG4gICAgY29uc3QgbGFuZ3VhZ2VQYXRoID0gcGF0aC5qb2luKGJhc2VQYXRoLCBsYW5ndWFnZSwgZmlsZSk7XG4gICAgY29uc3QgbGFuZ3VhZ2VGaWxlRXhpc3RzID0gYXdhaXQgVXRpbHMuZmlsZUV4aXN0cyhsYW5ndWFnZVBhdGgpO1xuXG4gICAgLy8gSWYgZmlsZSBmb3IgbGFuZ3VhZ2UgZXhpc3RzIHJldHVybiBmaWxlXG4gICAgaWYgKGxhbmd1YWdlRmlsZUV4aXN0cykge1xuICAgICAgcmV0dXJuIHsgcGF0aDogbGFuZ3VhZ2VQYXRoLCBzdWJkaXI6IGxhbmd1YWdlIH07XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIGRlZmF1bHQgZmlsZVxuICAgIHJldHVybiB7IHBhdGg6IGRlZmF1bHRQYXRoIH07XG4gIH1cblxuICAvKipcbiAgICogQGZ1bmN0aW9uIGZpbGVFeGlzdHNcbiAgICogQGRlc2NyaXB0aW9uIENoZWNrcyB3aGV0aGVyIGEgZmlsZSBleGlzdHMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBmaWxlIHBhdGguXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPEJvb2xlYW4+fSBJcyB0cnVlIGlmIHRoZSBmaWxlIGNhbiBiZSBhY2Nlc3NlZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGZpbGVFeGlzdHMocGF0aCkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBmcy5hY2Nlc3MocGF0aCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQGZ1bmN0aW9uIGlzUGF0aFxuICAgKiBAZGVzY3JpcHRpb24gRXZhbHVhdGVzIHdoZXRoZXIgYSBzdHJpbmcgaXMgYSBmaWxlIHBhdGggKGFzIG9wcG9zZWQgdG8gYSBVUkwgZm9yIGV4YW1wbGUpLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcyBUaGUgc3RyaW5nIHRvIGV2YWx1YXRlLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBldmFsdWF0ZWQgc3RyaW5nIGlzIGEgcGF0aC5cbiAgICovXG4gIHN0YXRpYyBpc1BhdGgocykge1xuICAgIHJldHVybiAvKF5cXC8pfCheXFwuXFwvKXwoXlxcLlxcLlxcLykvLnRlc3Qocyk7XG4gIH1cblxuICAvKipcbiAgICogRmxhdHRlbnMgYW4gb2JqZWN0IGFuZCBjcmF0ZXMgbmV3IGtleXMgd2l0aCBjdXN0b20gZGVsaW1pdGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIGZsYXR0ZW4uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBbZGVsaW1pdGVyPScuJ10gVGhlIGRlbGltaXRlciBvZiB0aGUgbmV3bHkgZ2VuZXJhdGVkIGtleXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXN1bHRcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIGZsYXR0ZW5lZCBvYmplY3QuXG4gICAqKi9cbiAgc3RhdGljIGZsYXR0ZW5PYmplY3Qob2JqLCBwYXJlbnRLZXksIGRlbGltaXRlciA9ICcuJywgcmVzdWx0ID0ge30pIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIGNvbnN0IG5ld0tleSA9IHBhcmVudEtleSA/IHBhcmVudEtleSArIGRlbGltaXRlciArIGtleSA6IGtleTtcblxuICAgICAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnb2JqZWN0JyAmJiBvYmpba2V5XSAhPT0gbnVsbCkge1xuICAgICAgICAgIHRoaXMuZmxhdHRlbk9iamVjdChvYmpba2V5XSwgbmV3S2V5LCBkZWxpbWl0ZXIsIHJlc3VsdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W25ld0tleV0gPSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZXMgd2hldGhlciBhbiBvYmplY3QgaXMgYSBQcm9taXNlLlxuICAgKiBAcGFyYW0ge2FueX0gb2JqZWN0IFRoZSBvYmplY3QgdG8gdmFsaWRhdGUuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBSZXR1cm5zIHRydWUgaWYgdGhlIG9iamVjdCBpcyBhIHByb21pc2UuXG4gICAqL1xuICBzdGF0aWMgaXNQcm9taXNlKG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBQcm9taXNlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYW4gb2JqZWN0IHdpdGggYWxsIHBlcm11dGF0aW9ucyBvZiB0aGUgb3JpZ2luYWwga2V5cy5cbiAgICogRm9yIGV4YW1wbGUsIHRoaXMgZGVmaW5pdGlvbjpcbiAgICogYGBgXG4gICAqIHtcbiAgICogICBhOiBbdHJ1ZSwgZmFsc2VdLFxuICAgKiAgIGI6IFsxLCAyXSxcbiAgICogICBjOiBbJ3gnXVxuICAgKiB9XG4gICAqIGBgYFxuICAgKiBwZXJtdXRhdGVzIHRvOlxuICAgKiBgYGBcbiAgICogW1xuICAgKiAgIHsgYTogdHJ1ZSwgYjogMSwgYzogJ3gnIH0sXG4gICAqICAgeyBhOiB0cnVlLCBiOiAyLCBjOiAneCcgfSxcbiAgICogICB7IGE6IGZhbHNlLCBiOiAxLCBjOiAneCcgfSxcbiAgICogICB7IGE6IGZhbHNlLCBiOiAyLCBjOiAneCcgfVxuICAgKiBdXG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcGVybXV0YXRlLlxuICAgKiBAcGFyYW0ge0ludGVnZXJ9IFtpbmRleD0wXSBUaGUgY3VycmVudCBrZXkgaW5kZXguXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbY3VycmVudD17fV0gVGhlIGN1cnJlbnQgcmVzdWx0IGVudHJ5IGJlaW5nIGNvbXBvc2VkLlxuICAgKiBAcGFyYW0ge0FycmF5fSBbcmVzdWx0cz1bXV0gVGhlIHJlc3VsdGluZyBhcnJheSBvZiBwZXJtdXRhdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgZ2V0T2JqZWN0S2V5UGVybXV0YXRpb25zKG9iamVjdCwgaW5kZXggPSAwLCBjdXJyZW50ID0ge30sIHJlc3VsdHMgPSBbXSkge1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IGtleSA9IGtleXNbaW5kZXhdO1xuICAgIGNvbnN0IHZhbHVlcyA9IG9iamVjdFtrZXldO1xuXG4gICAgZm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcbiAgICAgIGN1cnJlbnRba2V5XSA9IHZhbHVlO1xuICAgICAgY29uc3QgbmV4dEluZGV4ID0gaW5kZXggKyAxO1xuXG4gICAgICBpZiAobmV4dEluZGV4IDwga2V5cy5sZW5ndGgpIHtcbiAgICAgICAgVXRpbHMuZ2V0T2JqZWN0S2V5UGVybXV0YXRpb25zKG9iamVjdCwgbmV4dEluZGV4LCBjdXJyZW50LCByZXN1bHRzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IE9iamVjdC5hc3NpZ24oe30sIGN1cnJlbnQpO1xuICAgICAgICByZXN1bHRzLnB1c2gocmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIHBhcmFtZXRlcnMgYW5kIHRocm93cyBpZiBhIHBhcmFtZXRlciBpcyBpbnZhbGlkLlxuICAgKiBFeGFtcGxlIHBhcmFtZXRlciB0eXBlcyBzeW50YXg6XG4gICAqIGBgYFxuICAgKiB7XG4gICAqICAgcGFyYW1ldGVyTmFtZToge1xuICAgKiAgICAgIHQ6ICdib29sZWFuJyxcbiAgICogICAgICB2OiBpc0Jvb2xlYW4sXG4gICAqICAgICAgbzogdHJ1ZVxuICAgKiAgIH0sXG4gICAqICAgLi4uXG4gICAqIH1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMgdG8gdmFsaWRhdGUuXG4gICAqIEBwYXJhbSB7QXJyYXk8T2JqZWN0Pn0gdHlwZXMgVGhlIHBhcmFtZXRlciB0eXBlcyB1c2VkIGZvciB2YWxpZGF0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHlwZXMudCBUaGUgcGFyYW1ldGVyIHR5cGU7IHVzZWQgZm9yIGVycm9yIG1lc3NhZ2UsIG5vdCBmb3IgdmFsaWRhdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHR5cGVzLnYgVGhlIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIHRoZSBwYXJhbWV0ZXIgdmFsdWUuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW3R5cGVzLm89ZmFsc2VdIElzIHRydWUgaWYgdGhlIHBhcmFtZXRlciBpcyBvcHRpb25hbC5cbiAgICovXG4gIHN0YXRpYyB2YWxpZGF0ZVBhcmFtcyhwYXJhbXMsIHR5cGVzKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocGFyYW1zKSkge1xuICAgICAgY29uc3QgdHlwZSA9IHR5cGVzW2tleV07XG4gICAgICBjb25zdCBpc09wdGlvbmFsID0gISF0eXBlLm87XG4gICAgICBjb25zdCBwYXJhbSA9IHBhcmFtc1trZXldO1xuICAgICAgaWYgKCEoaXNPcHRpb25hbCAmJiBwYXJhbSA9PSBudWxsKSAmJiAhdHlwZS52KHBhcmFtKSkge1xuICAgICAgICB0aHJvdyBgSW52YWxpZCBwYXJhbWV0ZXIgJHtrZXl9IG11c3QgYmUgb2YgdHlwZSAke3R5cGUudH0gYnV0IGlzICR7dHlwZW9mIHBhcmFtfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENvbXB1dGVzIHRoZSByZWxhdGl2ZSBkYXRlIGJhc2VkIG9uIGEgc3RyaW5nLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgc3RyaW5nIHRvIGludGVycHJldCB0aGUgZGF0ZSBmcm9tLlxuICAgKiBAcGFyYW0ge0RhdGV9IG5vdyBUaGUgZGF0ZSB0aGUgc3RyaW5nIGlzIGNvbXBhcmluZyBhZ2FpbnN0LlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcmVsYXRpdmUgZGF0ZSBvYmplY3QuXG4gICAqKi9cbiAgc3RhdGljIHJlbGF0aXZlVGltZVRvRGF0ZSh0ZXh0LCBub3cgPSBuZXcgRGF0ZSgpKSB7XG4gICAgdGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKTtcbiAgICBsZXQgcGFydHMgPSB0ZXh0LnNwbGl0KCcgJyk7XG5cbiAgICAvLyBGaWx0ZXIgb3V0IHdoaXRlc3BhY2VcbiAgICBwYXJ0cyA9IHBhcnRzLmZpbHRlcihwYXJ0ID0+IHBhcnQgIT09ICcnKTtcblxuICAgIGNvbnN0IGZ1dHVyZSA9IHBhcnRzWzBdID09PSAnaW4nO1xuICAgIGNvbnN0IHBhc3QgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSA9PT0gJ2Fnbyc7XG5cbiAgICBpZiAoIWZ1dHVyZSAmJiAhcGFzdCAmJiB0ZXh0ICE9PSAnbm93Jykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBpbmZvOiBcIlRpbWUgc2hvdWxkIGVpdGhlciBzdGFydCB3aXRoICdpbicgb3IgZW5kIHdpdGggJ2FnbydcIixcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKGZ1dHVyZSAmJiBwYXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86IFwiVGltZSBjYW5ub3QgaGF2ZSBib3RoICdpbicgYW5kICdhZ28nXCIsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIHN0cmlwIHRoZSAnYWdvJyBvciAnaW4nXG4gICAgaWYgKGZ1dHVyZSkge1xuICAgICAgcGFydHMgPSBwYXJ0cy5zbGljZSgxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcGFzdFxuICAgICAgcGFydHMgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAxKTtcbiAgICB9XG5cbiAgICBpZiAocGFydHMubGVuZ3RoICUgMiAhPT0gMCAmJiB0ZXh0ICE9PSAnbm93Jykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBpbmZvOiAnSW52YWxpZCB0aW1lIHN0cmluZy4gRGFuZ2xpbmcgdW5pdCBvciBudW1iZXIuJyxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcGFpcnMgPSBbXTtcbiAgICB3aGlsZSAocGFydHMubGVuZ3RoKSB7XG4gICAgICBwYWlycy5wdXNoKFtwYXJ0cy5zaGlmdCgpLCBwYXJ0cy5zaGlmdCgpXSk7XG4gICAgfVxuXG4gICAgbGV0IHNlY29uZHMgPSAwO1xuICAgIGZvciAoY29uc3QgW251bSwgaW50ZXJ2YWxdIG9mIHBhaXJzKSB7XG4gICAgICBjb25zdCB2YWwgPSBOdW1iZXIobnVtKTtcbiAgICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih2YWwpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICAgIGluZm86IGAnJHtudW19JyBpcyBub3QgYW4gaW50ZWdlci5gLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKGludGVydmFsKSB7XG4gICAgICAgIGNhc2UgJ3lyJzpcbiAgICAgICAgY2FzZSAneXJzJzpcbiAgICAgICAgY2FzZSAneWVhcic6XG4gICAgICAgIGNhc2UgJ3llYXJzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDMxNTM2MDAwOyAvLyAzNjUgKiAyNCAqIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICd3ayc6XG4gICAgICAgIGNhc2UgJ3drcyc6XG4gICAgICAgIGNhc2UgJ3dlZWsnOlxuICAgICAgICBjYXNlICd3ZWVrcyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA2MDQ4MDA7IC8vIDcgKiAyNCAqIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICdkJzpcbiAgICAgICAgY2FzZSAnZGF5JzpcbiAgICAgICAgY2FzZSAnZGF5cyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA4NjQwMDsgLy8gMjQgKiA2MCAqIDYwXG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnaHInOlxuICAgICAgICBjYXNlICdocnMnOlxuICAgICAgICBjYXNlICdob3VyJzpcbiAgICAgICAgY2FzZSAnaG91cnMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogMzYwMDsgLy8gNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ21pbic6XG4gICAgICAgIGNhc2UgJ21pbnMnOlxuICAgICAgICBjYXNlICdtaW51dGUnOlxuICAgICAgICBjYXNlICdtaW51dGVzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDYwO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ3NlYyc6XG4gICAgICAgIGNhc2UgJ3NlY3MnOlxuICAgICAgICBjYXNlICdzZWNvbmQnOlxuICAgICAgICBjYXNlICdzZWNvbmRzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbDtcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgICAgICBpbmZvOiBgSW52YWxpZCBpbnRlcnZhbDogJyR7aW50ZXJ2YWx9J2AsXG4gICAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBtaWxsaXNlY29uZHMgPSBzZWNvbmRzICogMTAwMDtcbiAgICBpZiAoZnV0dXJlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgaW5mbzogJ2Z1dHVyZScsXG4gICAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSArIG1pbGxpc2Vjb25kcyksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAocGFzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgIGluZm86ICdwYXN0JyxcbiAgICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpIC0gbWlsbGlzZWNvbmRzKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICBpbmZvOiAncHJlc2VudCcsXG4gICAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSksXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEZWVwLXNjYW5zIGFuIG9iamVjdCBmb3IgYSBtYXRjaGluZyBrZXkvdmFsdWUgZGVmaW5pdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHNjYW4uXG4gICAqIEBwYXJhbSB7U3RyaW5nIHwgdW5kZWZpbmVkfSBrZXkgVGhlIGtleSB0byBtYXRjaCwgb3IgdW5kZWZpbmVkIGlmIG9ubHkgdGhlIHZhbHVlIHNob3VsZCBiZSBtYXRjaGVkLlxuICAgKiBAcGFyYW0ge2FueSB8IHVuZGVmaW5lZH0gdmFsdWUgVGhlIHZhbHVlIHRvIG1hdGNoLCBvciB1bmRlZmluZWQgaWYgb25seSB0aGUga2V5IHNob3VsZCBiZSBtYXRjaGVkLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gVHJ1ZSBpZiBhIG1hdGNoIHdhcyBmb3VuZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgKi9cbiAgc3RhdGljIG9iamVjdENvbnRhaW5zS2V5VmFsdWUob2JqLCBrZXksIHZhbHVlKSB7XG4gICAgY29uc3QgaXNNYXRjaCA9IChhLCBiKSA9PiAodHlwZW9mIGEgPT09ICdzdHJpbmcnICYmIG5ldyBSZWdFeHAoYikudGVzdChhKSkgfHwgYSA9PT0gYjtcbiAgICBjb25zdCBpc0tleU1hdGNoID0gayA9PiBpc01hdGNoKGssIGtleSk7XG4gICAgY29uc3QgaXNWYWx1ZU1hdGNoID0gdiA9PiBpc01hdGNoKHYsIHZhbHVlKTtcbiAgICBjb25zdCBzdGFjayA9IFtvYmpdO1xuICAgIGNvbnN0IHNlZW4gPSBuZXcgV2Vha1NldCgpO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gc3RhY2sucG9wKCk7XG4gICAgICBpZiAoc2Vlbi5oYXMoY3VycmVudCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBzZWVuLmFkZChjdXJyZW50KTtcbiAgICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKGN1cnJlbnQpKSB7XG4gICAgICAgIGlmIChrZXkgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSA9PT0gdW5kZWZpbmVkICYmIGlzS2V5TWF0Y2goaykpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmIChrZXkgPT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIGlzVmFsdWVNYXRjaCh2KSkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKGtleSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSB1bmRlZmluZWQgJiYgaXNLZXlNYXRjaChrKSAmJiBpc1ZhbHVlTWF0Y2godikpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoWydbb2JqZWN0IE9iamVjdF0nLCAnW29iamVjdCBBcnJheV0nXS5pbmNsdWRlcyhPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodikpKSB7XG4gICAgICAgICAgc3RhY2sucHVzaCh2KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBzdGF0aWMgY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMoY29uZmlnLCBkYXRhKSB7XG4gICAgaWYgKGNvbmZpZz8ucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIGNvbmZpZy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZShkYXRhLCBrZXl3b3JkLmtleSwga2V5d29yZC52YWx1ZSk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgIHRocm93IGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIE1vdmVzIHRoZSBuZXN0ZWQga2V5cyBvZiBhIHNwZWNpZmllZCBrZXkgaW4gYW4gb2JqZWN0IHRvIHRoZSByb290IG9mIHRoZSBvYmplY3QuXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBtb2RpZnkuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgVGhlIGtleSB3aG9zZSBuZXN0ZWQga2V5cyB3aWxsIGJlIG1vdmVkIHRvIHJvb3QuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBtb2RpZmllZCBvYmplY3QsIG9yIHRoZSBvcmlnaW5hbCBvYmplY3QgaWYgbm8gbW9kaWZpY2F0aW9uIGhhcHBlbmVkLlxuICAgKiBAZXhhbXBsZVxuICAgKiBjb25zdCBvYmogPSB7XG4gICAqICAgYTogMSxcbiAgICogICBiOiB7XG4gICAqICAgICBjOiAyLFxuICAgKiAgICAgZDogM1xuICAgKiAgIH0sXG4gICAqICAgZTogNFxuICAgKiB9O1xuICAgKiBhZGROZXN0ZWRLZXlzVG9Sb290KG9iaiwgJ2InKTtcbiAgICogY29uc29sZS5sb2cob2JqKTtcbiAgICogLy8gT3V0cHV0OiB7IGE6IDEsIGU6IDQsIGM6IDIsIGQ6IDMgfVxuICAqL1xuICBzdGF0aWMgYWRkTmVzdGVkS2V5c1RvUm9vdChvYmosIGtleSkge1xuICAgIGlmIChvYmpba2V5XSAmJiB0eXBlb2Ygb2JqW2tleV0gPT09ICdvYmplY3QnKSB7XG4gICAgICAvLyBBZGQgbmVzdGVkIGtleXMgdG8gcm9vdFxuICAgICAgT2JqZWN0LmFzc2lnbihvYmosIHsgLi4ub2JqW2tleV0gfSk7XG4gICAgICAvLyBEZWxldGUgb3JpZ2luYWwgbmVzdGVkIGtleVxuICAgICAgZGVsZXRlIG9ialtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgLyoqXG4gICAqIEVuY29kZXMgYSBzdHJpbmcgdG8gYmUgdXNlZCBpbiBhIFVSTC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBzdHJpbmcgdG8gZW5jb2RlLlxuICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgZW5jb2RlZCBzdHJpbmcuXG4gICAqL1xuICBzdGF0aWMgZW5jb2RlRm9yVXJsKGlucHV0KSB7XG4gICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChpbnB1dCkucmVwbGFjZSgvWyEnLigpKl0vZywgY2hhciA9PlxuICAgICAgJyUnICsgY2hhci5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KS50b1VwcGVyQ2FzZSgpXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgSlNPTiByZXBsYWNlciBmdW5jdGlvbiB0aGF0IGhhbmRsZXMgTWFwLCBTZXQsIGFuZCBjaXJjdWxhciByZWZlcmVuY2VzLlxuICAgKiBUaGlzIHJlcGxhY2VyIGNhbiBiZSB1c2VkIHdpdGggSlNPTi5zdHJpbmdpZnkgdG8gc2FmZWx5IHNlcmlhbGl6ZSBjb21wbGV4IG9iamVjdHMuXG4gICAqXG4gICAqIEByZXR1cm5zIHtGdW5jdGlvbn0gQSByZXBsYWNlciBmdW5jdGlvbiBmb3IgSlNPTi5zdHJpbmdpZnkgdGhhdDpcbiAgICogLSBDb252ZXJ0cyBNYXAgaW5zdGFuY2VzIHRvIHBsYWluIG9iamVjdHNcbiAgICogLSBDb252ZXJ0cyBTZXQgaW5zdGFuY2VzIHRvIGFycmF5c1xuICAgKiAtIFJlcGxhY2VzIGNpcmN1bGFyIHJlZmVyZW5jZXMgd2l0aCAnW0NpcmN1bGFyXScgbWFya2VyXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IG9iaiA9IHsgbmFtZTogJ3Rlc3QnLCBtYXA6IG5ldyBNYXAoW1sna2V5JywgJ3ZhbHVlJ11dKSB9O1xuICAgKiBvYmouc2VsZiA9IG9iajsgLy8gY2lyY3VsYXIgcmVmZXJlbmNlXG4gICAqIEpTT04uc3RyaW5naWZ5KG9iaiwgVXRpbHMuZ2V0Q2lyY3VsYXJSZXBsYWNlcigpKTtcbiAgICogLy8gT3V0cHV0OiB7XCJuYW1lXCI6XCJ0ZXN0XCIsXCJtYXBcIjp7XCJrZXlcIjpcInZhbHVlXCJ9LFwic2VsZlwiOlwiW0NpcmN1bGFyXVwifVxuICAgKi9cbiAgc3RhdGljIGdldENpcmN1bGFyUmVwbGFjZXIoKSB7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBXZWFrU2V0KCk7XG4gICAgcmV0dXJuIChrZXksIHZhbHVlKSA9PiB7XG4gICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBNYXApIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyh2YWx1ZSk7XG4gICAgICB9XG4gICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBTZXQpIHtcbiAgICAgICAgcmV0dXJuIEFycmF5LmZyb20odmFsdWUpO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKHNlZW4uaGFzKHZhbHVlKSkge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgICAgc2Vlbi5hZGQodmFsdWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhIG5lc3RlZCBwcm9wZXJ0eSB2YWx1ZSBmcm9tIGFuIG9iamVjdCB1c2luZyBkb3Qgbm90YXRpb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBnZXQgdGhlIHByb3BlcnR5IGZyb20uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwcm9wZXJ0eSBwYXRoIGluIGRvdCBub3RhdGlvbiwgZS5nLiAnZGF0YWJhc2VPcHRpb25zLmFsbG93UHVibGljRXhwbGFpbicuXG4gICAqIEByZXR1cm5zIHthbnl9IFRoZSBwcm9wZXJ0eSB2YWx1ZSBvciB1bmRlZmluZWQgaWYgbm90IGZvdW5kLlxuICAgKiBAZXhhbXBsZVxuICAgKiBjb25zdCBvYmogPSB7IGRhdGFiYXNlOiB7IG9wdGlvbnM6IHsgZW5hYmxlZDogdHJ1ZSB9IH0gfTtcbiAgICogVXRpbHMuZ2V0TmVzdGVkUHJvcGVydHkob2JqLCAnZGF0YWJhc2Uub3B0aW9ucy5lbmFibGVkJyk7XG4gICAqIC8vIE91dHB1dDogdHJ1ZVxuICAgKi9cbiAgc3RhdGljIGdldE5lc3RlZFByb3BlcnR5KG9iaiwgcGF0aCkge1xuICAgIGlmICghb2JqIHx8ICFwYXRoKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBrZXlzID0gcGF0aC5zcGxpdCgnLicpO1xuICAgIGxldCBjdXJyZW50ID0gb2JqO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICAgIGlmIChjdXJyZW50ID09IG51bGwgfHwgdHlwZW9mIGN1cnJlbnQgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICBjdXJyZW50ID0gY3VycmVudFtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gY3VycmVudDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBmaWxlIGV4dGVuc2lvbiBhcyB0aGUgc3Vic3RyaW5nIGFmdGVyIHRoZSBsYXN0IGRvdCBpbiB0aGVcbiAgICogZmlsZW5hbWUuIEEgdHJhaWxpbmcgZG90IG9yIGEgZmlsZW5hbWUgd2l0aG91dCBhIGRvdCB5aWVsZHMgYW4gZW1wdHlcbiAgICogc3RyaW5nLiBDYWxsZXJzIGFwcGx5IGFueSBmdXJ0aGVyIG5vcm1hbGl6YXRpb24gKHdoaXRlc3BhY2UsIE1JTUVcbiAgICogcGFyYW1ldGVycywgZXRjLikgZm9yIHRoZWlyIHVzZSBjYXNlIOKAlCB0aGlzIGlzIGEgcHVyZSBwYXJzZXIsIG5vdCBhXG4gICAqIHBvbGljeS5cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gICAqIEByZXR1cm5zIHtzdHJpbmd9IHRoZSBleHRlbnNpb24sIG9yIGAnJ2AgaWYgbm9uZVxuICAgKi9cbiAgc3RhdGljIGdldEZpbGVFeHRlbnNpb24oZmlsZW5hbWUpIHtcbiAgICBpZiAoIWZpbGVuYW1lIHx8ICFmaWxlbmFtZS5pbmNsdWRlcygnLicpKSB7XG4gICAgICByZXR1cm4gJyc7XG4gICAgfVxuICAgIHJldHVybiBmaWxlbmFtZS5zdWJzdHJpbmcoZmlsZW5hbWUubGFzdEluZGV4T2YoJy4nKSArIDEpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBzYWZlVG9KU09OXG4gICAqIEBkZXNjcmlwdGlvbiBTZXJpYWxpemVzIGEgUGFyc2Ugb2JqZWN0LCByZXR1cm5pbmcgYHVuZGVmaW5lZGAgaWYgc2VyaWFsaXphdGlvblxuICAgKiB0aHJvd3MgKGZvciBleGFtcGxlIGEgcG9pbnRlciBsZWZ0IHdpdGhvdXQgYW4gb2JqZWN0IElEIGJ5IGEgZG90IG5vdGF0aW9uIHdyaXRlKS5cbiAgICogVXNlIHdoZXJlIGEgZmFpbGVkIHNlcmlhbGl6YXRpb24gbXVzdCBub3QgaW50ZXJydXB0IGNvbnRyb2wgZmxvdywgc3VjaCBhcyBsb2dnaW5nLlxuICAgKiBAcGFyYW0ge29iamVjdH0gb2JqZWN0IFRoZSBQYXJzZSBvYmplY3QgdG8gc2VyaWFsaXplLlxuICAgKiBAcmV0dXJucyB7b2JqZWN0fHVuZGVmaW5lZH0gVGhlIHNlcmlhbGl6ZWQgb2JqZWN0LCBvciBgdW5kZWZpbmVkYCBvbiBmYWlsdXJlLlxuICAgKi9cbiAgc3RhdGljIHNhZmVUb0pTT04ob2JqZWN0KSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBvYmplY3QudG9KU09OKCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzO1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxPQUFPLENBQUMsTUFBTSxDQUFDO0FBQzVCLE1BQU1DLEVBQUUsR0FBR0QsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDRSxRQUFROztBQUVqQztBQUNBO0FBQ0E7QUFDQSxNQUFNQyxLQUFLLENBQUM7RUFDVjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFLGFBQWFDLGdCQUFnQkEsQ0FBQ0MsV0FBVyxFQUFFQyxNQUFNLEVBQUU7SUFDakQ7SUFDQSxNQUFNQyxJQUFJLEdBQUdSLElBQUksQ0FBQ1MsUUFBUSxDQUFDSCxXQUFXLENBQUM7SUFDdkMsTUFBTUksUUFBUSxHQUFHVixJQUFJLENBQUNXLE9BQU8sQ0FBQ0wsV0FBVyxDQUFDOztJQUUxQztJQUNBLElBQUksQ0FBQ0MsTUFBTSxFQUFFO01BQ1gsT0FBTztRQUFFUCxJQUFJLEVBQUVNO01BQVksQ0FBQztJQUM5Qjs7SUFFQTtJQUNBLE1BQU1NLFVBQVUsR0FBR1osSUFBSSxDQUFDYSxJQUFJLENB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QSxLQUFLLEtBQUssSUFBSSxFQUFFO1FBQy9DLElBQUk4QyxJQUFJLENBQUNHLEdBQUcsQ0FBQ2pELEtBQUssQ0FBQyxFQUFFO1VBQ25CLE9BQU8sWUFBWTtRQUNyQjtRQUNBOEMsSUFBSSxDQUFDSSxHQUFHLENBQUNsRCxLQUFLLENBQUM7TUFDakI7TUFDQSxPQUFPQSxLQUFLO0lBQ2QsQ0FBQztFQUNIOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0UsT0FBTzZFLGlCQUFpQkEsQ0FBQ2hHLEdBQUcsRUFBRTFCLElBQUksRUFBRTtJQUNsQyxJQUFJLENBQUMwQixHQUFHLElBQUksQ0FBQzFCLElBQUksRUFBRTtNQUNqQixPQUFPaUcsU0FBUztJQUNsQjtJQUNBLE1BQU10RCxJQUFJLEdBQUczQyxJQUFJLENBQUNrQixLQUFLLENBQUMsR0FBRyxDQUFDO0lBQzVCLElBQUl1QixPQUFPLEdBQUdmLEdBQUc7SUFDakIsS0FBSyxNQUFNSSxHQUFHLElBQUlhLElBQUksRUFBRTtNQUN0QixJQUFJRixPQUFPLElBQUksSUFBSSxJQUFJLE9BQU9BLE9BQU8sS0FBSyxRQUFRLEVBQUU7UUFDbEQsT0FBT3dELFNBQVM7TUFDbEI7TUFDQXhELE9BQU8sR0FBR0EsT0FBTyxDQUFDWCxHQUFHLENBQUM7SUFDeEI7SUFDQSxPQUFPVyxPQUFPO0VBQ2hCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0UsT0FBT2tGLGdCQUFnQkEsQ0FBQ0MsUUFBUSxFQUFFO0lBQ2hDLElBQUksQ0FBQ0EsUUFBUSxJQUFJLENBQUNBLFFBQVEsQ0FBQzFCLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtNQUN4QyxPQUFPLEVBQUU7SUFDWDtJQUNBLE9BQU8wQixRQUFRLENBQUNDLFNBQVMsQ0FBQ0QsUUFBUSxDQUFDRSxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0VBQzFEOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRSxPQUFPQyxVQUFVQSxDQUFDMUYsTUFBTSxFQUFFO0lBQ3hCLElBQUk7TUFDRixPQUFPQSxNQUFNLENBQUMyRixNQUFNLENBQUMsQ0FBQztJQUN4QixDQUFDLENBQUMsTUFBTTtNQUNOLE9BQU8vQixTQUFTO0lBQ2xCO0VBQ0Y7QUFDRjtBQUVBZ0MsTUFBTSxDQUFDQyxPQUFPLEdBQUc5SCxLQUFLIiwiaWdub3JlTGlzdCI6W119