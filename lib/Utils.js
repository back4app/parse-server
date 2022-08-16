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
    const basePath = path.dirname(defaultPath); // If locale is not set return default file

    if (!locale) {
      return {
        path: defaultPath
      };
    } // Check file for locale exists


    const localePath = path.join(basePath, locale, file);
    const localeFileExists = await Utils.fileExists(localePath); // If file for locale exists return file

    if (localeFileExists) {
      return {
        path: localePath,
        subdir: locale
      };
    } // Check file for language exists


    const language = locale.split('-')[0];
    const languagePath = path.join(basePath, language, file);
    const languageFileExists = await Utils.fileExists(languagePath); // If file for language exists return file

    if (languageFileExists) {
      return {
        path: languagePath,
        subdir: language
      };
    } // Return default file


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
    let parts = text.split(' '); // Filter out whitespace

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
    } // strip the 'ago' or 'in'


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

}

module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiZSIsImlzUGF0aCIsInMiLCJ0ZXN0IiwiZmxhdHRlbk9iamVjdCIsIm9iaiIsInBhcmVudEtleSIsImRlbGltaXRlciIsInJlc3VsdCIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5ld0tleSIsImlzUHJvbWlzZSIsIm9iamVjdCIsIlByb21pc2UiLCJnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMiLCJpbmRleCIsImN1cnJlbnQiLCJyZXN1bHRzIiwia2V5cyIsInZhbHVlcyIsInZhbHVlIiwibmV4dEluZGV4IiwibGVuZ3RoIiwiYXNzaWduIiwicHVzaCIsInZhbGlkYXRlUGFyYW1zIiwicGFyYW1zIiwidHlwZXMiLCJ0eXBlIiwiaXNPcHRpb25hbCIsIm8iLCJwYXJhbSIsInYiLCJ0IiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsIkRhdGUiLCJ0b0xvd2VyQ2FzZSIsInBhcnRzIiwiZmlsdGVyIiwicGFydCIsImZ1dHVyZSIsInBhc3QiLCJzdGF0dXMiLCJpbmZvIiwic2xpY2UiLCJwYWlycyIsInNoaWZ0Iiwic2Vjb25kcyIsIm51bSIsImludGVydmFsIiwidmFsIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwibWlsbGlzZWNvbmRzIiwidmFsdWVPZiIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJpc01hdGNoIiwiYSIsImIiLCJSZWdFeHAiLCJpc0tleU1hdGNoIiwiayIsImlzVmFsdWVNYXRjaCIsImVudHJpZXMiLCJ1bmRlZmluZWQiLCJpbmNsdWRlcyIsInRvU3RyaW5nIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9VdGlscy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIHV0aWxzLmpzXG4gKiBAZmlsZSBHZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzXG4gKiBAZGVzY3JpcHRpb24gR2VuZXJhbCBwdXJwb3NlIHV0aWxpdGllcy5cbiAqL1xuXG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuY29uc3QgZnMgPSByZXF1aXJlKCdmcycpLnByb21pc2VzO1xuXG4vKipcbiAqIFRoZSBnZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzLlxuICovXG5jbGFzcyBVdGlscyB7XG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gZ2V0TG9jYWxpemVkUGF0aFxuICAgKiBAZGVzY3JpcHRpb24gUmV0dXJucyBhIGxvY2FsaXplZCBmaWxlIHBhdGggYWNjb3JpbmcgdG8gdGhlIGxvY2FsZS5cbiAgICpcbiAgICogTG9jYWxpemVkIGZpbGVzIGFyZSBzZWFyY2hlZCBpbiBzdWJmb2xkZXJzIG9mIGEgZ2l2ZW4gcGF0aCwgZS5nLlxuICAgKlxuICAgKiByb290L1xuICAgKiDilJzilIDilIAgYmFzZS8gICAgICAgICAgICAgICAgICAgIC8vIGJhc2UgcGF0aCB0byBmaWxlc1xuICAgKiDilIIgICDilJzilIDilIAgZXhhbXBsZS5odG1sICAgICAgICAgLy8gZGVmYXVsdCBmaWxlXG4gICAqIOKUgiAgIOKUlOKUgOKUgCBkZS8gICAgICAgICAgICAgICAgICAvLyBkZSBsYW5ndWFnZSBmb2xkZXJcbiAgICog4pSCICAg4pSCICAg4pSU4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgLy8gZGUgbG9jYWxpemVkIGZpbGVcbiAgICog4pSCICAg4pSU4pSA4pSAIGRlLUFULyAgICAgICAgICAgICAgIC8vIGRlLUFUIGxvY2FsZSBmb2xkZXJcbiAgICog4pSCICAg4pSCICAg4pSU4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgLy8gZGUtQVQgbG9jYWxpemVkIGZpbGVcbiAgICpcbiAgICogRmlsZXMgYXJlIG1hdGNoZWQgd2l0aCB0aGUgbG9jYWxlIGluIHRoZSBmb2xsb3dpbmcgb3JkZXI6XG4gICAqIDEuIExvY2FsZSBtYXRjaCwgZS5nLiBsb2NhbGUgYGRlLUFUYCBtYXRjaGVzIGZpbGUgaW4gZm9sZGVyIGBkZS1BVGAuXG4gICAqIDIuIExhbmd1YWdlIG1hdGNoLCBlLmcuIGxvY2FsZSBgZGUtQVRgIG1hdGNoZXMgZmlsZSBpbiBmb2xkZXIgYGRlYC5cbiAgICogMy4gRGVmYXVsdDsgZmlsZSBpbiBiYXNlIGZvbGRlciBpcyByZXR1cm5lZC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlZmF1bHRQYXRoIFRoZSBhYnNvbHV0ZSBmaWxlIHBhdGgsIHdoaWNoIGlzIGFsc29cbiAgICogdGhlIGRlZmF1bHQgcGF0aCByZXR1cm5lZCBpZiBsb2NhbGl6YXRpb24gaXMgbm90IGF2YWlsYWJsZS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBUaGUgb2JqZWN0IGNvbnRhaW5zOlxuICAgKiAtIGBwYXRoYDogVGhlIHBhdGggdG8gdGhlIGxvY2FsaXplZCBmaWxlLCBvciB0aGUgb3JpZ2luYWwgcGF0aCBpZlxuICAgKiAgIGxvY2FsaXphdGlvbiBpcyBub3QgYXZhaWxhYmxlLlxuICAgKiAtIGBzdWJkaXJgOiBUaGUgc3ViZGlyZWN0b3J5IG9mIHRoZSBsb2NhbGl6ZWQgZmlsZSwgb3IgdW5kZWZpbmVkIGlmXG4gICAqICAgdGhlcmUgaXMgbm8gbWF0Y2hpbmcgbG9jYWxpemVkIGZpbGUuXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZ2V0TG9jYWxpemVkUGF0aChkZWZhdWx0UGF0aCwgbG9jYWxlKSB7XG4gICAgLy8gR2V0IGZpbGUgbmFtZSBhbmQgcGF0aHNcbiAgICBjb25zdCBmaWxlID0gcGF0aC5iYXNlbmFtZShkZWZhdWx0UGF0aCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBwYXRoLmRpcm5hbWUoZGVmYXVsdFBhdGgpO1xuXG4gICAgLy8gSWYgbG9jYWxlIGlzIG5vdCBzZXQgcmV0dXJuIGRlZmF1bHQgZmlsZVxuICAgIGlmICghbG9jYWxlKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBkZWZhdWx0UGF0aCB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZpbGUgZm9yIGxvY2FsZSBleGlzdHNcbiAgICBjb25zdCBsb2NhbGVQYXRoID0gcGF0aC5qb2luKGJhc2VQYXRoLCBsb2NhbGUsIGZpbGUpO1xuICAgIGNvbnN0IGxvY2FsZUZpbGVFeGlzdHMgPSBhd2FpdCBVdGlscy5maWxlRXhpc3RzKGxvY2FsZVBhdGgpO1xuXG4gICAgLy8gSWYgZmlsZSBmb3IgbG9jYWxlIGV4aXN0cyByZXR1cm4gZmlsZVxuICAgIGlmIChsb2NhbGVGaWxlRXhpc3RzKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBsb2NhbGVQYXRoLCBzdWJkaXI6IGxvY2FsZSB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZpbGUgZm9yIGxhbmd1YWdlIGV4aXN0c1xuICAgIGNvbnN0IGxhbmd1YWdlID0gbG9jYWxlLnNwbGl0KCctJylbMF07XG4gICAgY29uc3QgbGFuZ3VhZ2VQYXRoID0gcGF0aC5qb2luKGJhc2VQYXRoLCBsYW5ndWFnZSwgZmlsZSk7XG4gICAgY29uc3QgbGFuZ3VhZ2VGaWxlRXhpc3RzID0gYXdhaXQgVXRpbHMuZmlsZUV4aXN0cyhsYW5ndWFnZVBhdGgpO1xuXG4gICAgLy8gSWYgZmlsZSBmb3IgbGFuZ3VhZ2UgZXhpc3RzIHJldHVybiBmaWxlXG4gICAgaWYgKGxhbmd1YWdlRmlsZUV4aXN0cykge1xuICAgICAgcmV0dXJuIHsgcGF0aDogbGFuZ3VhZ2VQYXRoLCBzdWJkaXI6IGxhbmd1YWdlIH07XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIGRlZmF1bHQgZmlsZVxuICAgIHJldHVybiB7IHBhdGg6IGRlZmF1bHRQYXRoIH07XG4gIH1cblxuICAvKipcbiAgICogQGZ1bmN0aW9uIGZpbGVFeGlzdHNcbiAgICogQGRlc2NyaXB0aW9uIENoZWNrcyB3aGV0aGVyIGEgZmlsZSBleGlzdHMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBmaWxlIHBhdGguXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPEJvb2xlYW4+fSBJcyB0cnVlIGlmIHRoZSBmaWxlIGNhbiBiZSBhY2Nlc3NlZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGZpbGVFeGlzdHMocGF0aCkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBmcy5hY2Nlc3MocGF0aCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBpc1BhdGhcbiAgICogQGRlc2NyaXB0aW9uIEV2YWx1YXRlcyB3aGV0aGVyIGEgc3RyaW5nIGlzIGEgZmlsZSBwYXRoIChhcyBvcHBvc2VkIHRvIGEgVVJMIGZvciBleGFtcGxlKS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHMgVGhlIHN0cmluZyB0byBldmFsdWF0ZS5cbiAgICogQHJldHVybnMge0Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgZXZhbHVhdGVkIHN0cmluZyBpcyBhIHBhdGguXG4gICAqL1xuICBzdGF0aWMgaXNQYXRoKHMpIHtcbiAgICByZXR1cm4gLyheXFwvKXwoXlxcLlxcLyl8KF5cXC5cXC5cXC8pLy50ZXN0KHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEZsYXR0ZW5zIGFuIG9iamVjdCBhbmQgY3JhdGVzIG5ldyBrZXlzIHdpdGggY3VzdG9tIGRlbGltaXRlcnMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBmbGF0dGVuLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW2RlbGltaXRlcj0nLiddIFRoZSBkZWxpbWl0ZXIgb2YgdGhlIG5ld2x5IGdlbmVyYXRlZCBrZXlzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzdWx0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBmbGF0dGVuZWQgb2JqZWN0LlxuICAgKiovXG4gIHN0YXRpYyBmbGF0dGVuT2JqZWN0KG9iaiwgcGFyZW50S2V5LCBkZWxpbWl0ZXIgPSAnLicsIHJlc3VsdCA9IHt9KSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICBjb25zdCBuZXdLZXkgPSBwYXJlbnRLZXkgPyBwYXJlbnRLZXkgKyBkZWxpbWl0ZXIgKyBrZXkgOiBrZXk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ29iamVjdCcgJiYgb2JqW2tleV0gIT09IG51bGwpIHtcbiAgICAgICAgICB0aGlzLmZsYXR0ZW5PYmplY3Qob2JqW2tleV0sIG5ld0tleSwgZGVsaW1pdGVyLCByZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdFtuZXdLZXldID0gb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZXRlcm1pbmVzIHdoZXRoZXIgYW4gb2JqZWN0IGlzIGEgUHJvbWlzZS5cbiAgICogQHBhcmFtIHthbnl9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHZhbGlkYXRlLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBvYmplY3QgaXMgYSBwcm9taXNlLlxuICAgKi9cbiAgc3RhdGljIGlzUHJvbWlzZShvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgUHJvbWlzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGFuIG9iamVjdCB3aXRoIGFsbCBwZXJtdXRhdGlvbnMgb2YgdGhlIG9yaWdpbmFsIGtleXMuXG4gICAqIEZvciBleGFtcGxlLCB0aGlzIGRlZmluaXRpb246XG4gICAqIGBgYFxuICAgKiB7XG4gICAqICAgYTogW3RydWUsIGZhbHNlXSxcbiAgICogICBiOiBbMSwgMl0sXG4gICAqICAgYzogWyd4J11cbiAgICogfVxuICAgKiBgYGBcbiAgICogcGVybXV0YXRlcyB0bzpcbiAgICogYGBgXG4gICAqIFtcbiAgICogICB7IGE6IHRydWUsIGI6IDEsIGM6ICd4JyB9LFxuICAgKiAgIHsgYTogdHJ1ZSwgYjogMiwgYzogJ3gnIH0sXG4gICAqICAgeyBhOiBmYWxzZSwgYjogMSwgYzogJ3gnIH0sXG4gICAqICAgeyBhOiBmYWxzZSwgYjogMiwgYzogJ3gnIH1cbiAgICogXVxuICAgKiBgYGBcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHBlcm11dGF0ZS5cbiAgICogQHBhcmFtIHtJbnRlZ2VyfSBbaW5kZXg9MF0gVGhlIGN1cnJlbnQga2V5IGluZGV4LlxuICAgKiBAcGFyYW0ge09iamVjdH0gW2N1cnJlbnQ9e31dIFRoZSBjdXJyZW50IHJlc3VsdCBlbnRyeSBiZWluZyBjb21wb3NlZC5cbiAgICogQHBhcmFtIHtBcnJheX0gW3Jlc3VsdHM9W11dIFRoZSByZXN1bHRpbmcgYXJyYXkgb2YgcGVybXV0YXRpb25zLlxuICAgKi9cbiAgc3RhdGljIGdldE9iamVjdEtleVBlcm11dGF0aW9ucyhvYmplY3QsIGluZGV4ID0gMCwgY3VycmVudCA9IHt9LCByZXN1bHRzID0gW10pIHtcbiAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBrZXkgPSBrZXlzW2luZGV4XTtcbiAgICBjb25zdCB2YWx1ZXMgPSBvYmplY3Rba2V5XTtcblxuICAgIGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG4gICAgICBjdXJyZW50W2tleV0gPSB2YWx1ZTtcbiAgICAgIGNvbnN0IG5leHRJbmRleCA9IGluZGV4ICsgMTtcblxuICAgICAgaWYgKG5leHRJbmRleCA8IGtleXMubGVuZ3RoKSB7XG4gICAgICAgIFV0aWxzLmdldE9iamVjdEtleVBlcm11dGF0aW9ucyhvYmplY3QsIG5leHRJbmRleCwgY3VycmVudCwgcmVzdWx0cyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBPYmplY3QuYXNzaWduKHt9LCBjdXJyZW50KTtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBwYXJhbWV0ZXJzIGFuZCB0aHJvd3MgaWYgYSBwYXJhbWV0ZXIgaXMgaW52YWxpZC5cbiAgICogRXhhbXBsZSBwYXJhbWV0ZXIgdHlwZXMgc3ludGF4OlxuICAgKiBgYGBcbiAgICoge1xuICAgKiAgIHBhcmFtZXRlck5hbWU6IHtcbiAgICogICAgICB0OiAnYm9vbGVhbicsXG4gICAqICAgICAgdjogaXNCb29sZWFuLFxuICAgKiAgICAgIG86IHRydWVcbiAgICogICB9LFxuICAgKiAgIC4uLlxuICAgKiB9XG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzIHRvIHZhbGlkYXRlLlxuICAgKiBAcGFyYW0ge0FycmF5PE9iamVjdD59IHR5cGVzIFRoZSBwYXJhbWV0ZXIgdHlwZXMgdXNlZCBmb3IgdmFsaWRhdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHR5cGVzLnQgVGhlIHBhcmFtZXRlciB0eXBlOyB1c2VkIGZvciBlcnJvciBtZXNzYWdlLCBub3QgZm9yIHZhbGlkYXRpb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0eXBlcy52IFRoZSBmdW5jdGlvbiB0byB2YWxpZGF0ZSB0aGUgcGFyYW1ldGVyIHZhbHVlLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFt0eXBlcy5vPWZhbHNlXSBJcyB0cnVlIGlmIHRoZSBwYXJhbWV0ZXIgaXMgb3B0aW9uYWwuXG4gICAqL1xuICBzdGF0aWMgdmFsaWRhdGVQYXJhbXMocGFyYW1zLCB0eXBlcykge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHBhcmFtcykpIHtcbiAgICAgIGNvbnN0IHR5cGUgPSB0eXBlc1trZXldO1xuICAgICAgY29uc3QgaXNPcHRpb25hbCA9ICEhdHlwZS5vO1xuICAgICAgY29uc3QgcGFyYW0gPSBwYXJhbXNba2V5XTtcbiAgICAgIGlmICghKGlzT3B0aW9uYWwgJiYgcGFyYW0gPT0gbnVsbCkgJiYgIXR5cGUudihwYXJhbSkpIHtcbiAgICAgICAgdGhyb3cgYEludmFsaWQgcGFyYW1ldGVyICR7a2V5fSBtdXN0IGJlIG9mIHR5cGUgJHt0eXBlLnR9IGJ1dCBpcyAke3R5cGVvZiBwYXJhbX1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDb21wdXRlcyB0aGUgcmVsYXRpdmUgZGF0ZSBiYXNlZCBvbiBhIHN0cmluZy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIHN0cmluZyB0byBpbnRlcnByZXQgdGhlIGRhdGUgZnJvbS5cbiAgICogQHBhcmFtIHtEYXRlfSBub3cgVGhlIGRhdGUgdGhlIHN0cmluZyBpcyBjb21wYXJpbmcgYWdhaW5zdC5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHJlbGF0aXZlIGRhdGUgb2JqZWN0LlxuICAgKiovXG4gIHN0YXRpYyByZWxhdGl2ZVRpbWVUb0RhdGUodGV4dCwgbm93ID0gbmV3IERhdGUoKSkge1xuICAgIHRleHQgPSB0ZXh0LnRvTG93ZXJDYXNlKCk7XG4gICAgbGV0IHBhcnRzID0gdGV4dC5zcGxpdCgnICcpO1xuXG4gICAgLy8gRmlsdGVyIG91dCB3aGl0ZXNwYWNlXG4gICAgcGFydHMgPSBwYXJ0cy5maWx0ZXIocGFydCA9PiBwYXJ0ICE9PSAnJyk7XG5cbiAgICBjb25zdCBmdXR1cmUgPSBwYXJ0c1swXSA9PT0gJ2luJztcbiAgICBjb25zdCBwYXN0ID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV0gPT09ICdhZ28nO1xuXG4gICAgaWYgKCFmdXR1cmUgJiYgIXBhc3QgJiYgdGV4dCAhPT0gJ25vdycpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgaW5mbzogXCJUaW1lIHNob3VsZCBlaXRoZXIgc3RhcnQgd2l0aCAnaW4nIG9yIGVuZCB3aXRoICdhZ28nXCIsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmIChmdXR1cmUgJiYgcGFzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICBpbmZvOiBcIlRpbWUgY2Fubm90IGhhdmUgYm90aCAnaW4nIGFuZCAnYWdvJ1wiLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBzdHJpcCB0aGUgJ2Fnbycgb3IgJ2luJ1xuICAgIGlmIChmdXR1cmUpIHtcbiAgICAgIHBhcnRzID0gcGFydHMuc2xpY2UoMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHBhc3RcbiAgICAgIHBhcnRzID0gcGFydHMuc2xpY2UoMCwgcGFydHMubGVuZ3RoIC0gMSk7XG4gICAgfVxuXG4gICAgaWYgKHBhcnRzLmxlbmd0aCAlIDIgIT09IDAgJiYgdGV4dCAhPT0gJ25vdycpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgaW5mbzogJ0ludmFsaWQgdGltZSBzdHJpbmcuIERhbmdsaW5nIHVuaXQgb3IgbnVtYmVyLicsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHBhaXJzID0gW107XG4gICAgd2hpbGUgKHBhcnRzLmxlbmd0aCkge1xuICAgICAgcGFpcnMucHVzaChbcGFydHMuc2hpZnQoKSwgcGFydHMuc2hpZnQoKV0pO1xuICAgIH1cblxuICAgIGxldCBzZWNvbmRzID0gMDtcbiAgICBmb3IgKGNvbnN0IFtudW0sIGludGVydmFsXSBvZiBwYWlycykge1xuICAgICAgY29uc3QgdmFsID0gTnVtYmVyKG51bSk7XG4gICAgICBpZiAoIU51bWJlci5pc0ludGVnZXIodmFsKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgICBpbmZvOiBgJyR7bnVtfScgaXMgbm90IGFuIGludGVnZXIuYCxcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChpbnRlcnZhbCkge1xuICAgICAgICBjYXNlICd5cic6XG4gICAgICAgIGNhc2UgJ3lycyc6XG4gICAgICAgIGNhc2UgJ3llYXInOlxuICAgICAgICBjYXNlICd5ZWFycyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiAzMTUzNjAwMDsgLy8gMzY1ICogMjQgKiA2MCAqIDYwXG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnd2snOlxuICAgICAgICBjYXNlICd3a3MnOlxuICAgICAgICBjYXNlICd3ZWVrJzpcbiAgICAgICAgY2FzZSAnd2Vla3MnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogNjA0ODAwOyAvLyA3ICogMjQgKiA2MCAqIDYwXG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnZCc6XG4gICAgICAgIGNhc2UgJ2RheSc6XG4gICAgICAgIGNhc2UgJ2RheXMnOlxuICAgICAgICAgIHNlY29uZHMgKz0gdmFsICogODY0MDA7IC8vIDI0ICogNjAgKiA2MFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ2hyJzpcbiAgICAgICAgY2FzZSAnaHJzJzpcbiAgICAgICAgY2FzZSAnaG91cic6XG4gICAgICAgIGNhc2UgJ2hvdXJzJzpcbiAgICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDM2MDA7IC8vIDYwICogNjBcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICdtaW4nOlxuICAgICAgICBjYXNlICdtaW5zJzpcbiAgICAgICAgY2FzZSAnbWludXRlJzpcbiAgICAgICAgY2FzZSAnbWludXRlcyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA2MDtcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICdzZWMnOlxuICAgICAgICBjYXNlICdzZWNzJzpcbiAgICAgICAgY2FzZSAnc2Vjb25kJzpcbiAgICAgICAgY2FzZSAnc2Vjb25kcyc6XG4gICAgICAgICAgc2Vjb25kcyArPSB2YWw7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgICAgICAgaW5mbzogYEludmFsaWQgaW50ZXJ2YWw6ICcke2ludGVydmFsfSdgLFxuICAgICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbWlsbGlzZWNvbmRzID0gc2Vjb25kcyAqIDEwMDA7XG4gICAgaWYgKGZ1dHVyZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgIGluZm86ICdmdXR1cmUnLFxuICAgICAgICByZXN1bHQ6IG5ldyBEYXRlKG5vdy52YWx1ZU9mKCkgKyBtaWxsaXNlY29uZHMpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHBhc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICBpbmZvOiAncGFzdCcsXG4gICAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSAtIG1pbGxpc2Vjb25kcyksXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgaW5mbzogJ3ByZXNlbnQnLFxuICAgICAgICByZXN1bHQ6IG5ldyBEYXRlKG5vdy52YWx1ZU9mKCkpLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGVlcC1zY2FucyBhbiBvYmplY3QgZm9yIGEgbWF0Y2hpbmcga2V5L3ZhbHVlIGRlZmluaXRpb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBzY2FuLlxuICAgKiBAcGFyYW0ge1N0cmluZyB8IHVuZGVmaW5lZH0ga2V5IFRoZSBrZXkgdG8gbWF0Y2gsIG9yIHVuZGVmaW5lZCBpZiBvbmx5IHRoZSB2YWx1ZSBzaG91bGQgYmUgbWF0Y2hlZC5cbiAgICogQHBhcmFtIHthbnkgfCB1bmRlZmluZWR9IHZhbHVlIFRoZSB2YWx1ZSB0byBtYXRjaCwgb3IgdW5kZWZpbmVkIGlmIG9ubHkgdGhlIGtleSBzaG91bGQgYmUgbWF0Y2hlZC5cbiAgICogQHJldHVybnMge0Jvb2xlYW59IFRydWUgaWYgYSBtYXRjaCB3YXMgZm91bmQsIGZhbHNlIG90aGVyd2lzZS5cbiAgICovXG4gIHN0YXRpYyBvYmplY3RDb250YWluc0tleVZhbHVlKG9iaiwga2V5LCB2YWx1ZSkge1xuICAgIGNvbnN0IGlzTWF0Y2ggPSAoYSwgYikgPT4gKHR5cGVvZiBhID09PSAnc3RyaW5nJyAmJiBuZXcgUmVnRXhwKGIpLnRlc3QoYSkpIHx8IGEgPT09IGI7XG4gICAgY29uc3QgaXNLZXlNYXRjaCA9IGsgPT4gaXNNYXRjaChrLCBrZXkpO1xuICAgIGNvbnN0IGlzVmFsdWVNYXRjaCA9IHYgPT4gaXNNYXRjaCh2LCB2YWx1ZSk7XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuICAgICAgaWYgKGtleSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlID09PSB1bmRlZmluZWQgJiYgaXNLZXlNYXRjaChrKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IHVuZGVmaW5lZCAmJiBpc1ZhbHVlTWF0Y2godikpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2UgaWYgKGtleSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSB1bmRlZmluZWQgJiYgaXNLZXlNYXRjaChrKSAmJiBpc1ZhbHVlTWF0Y2godikpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICBpZiAoWydbb2JqZWN0IE9iamVjdF0nLCAnW29iamVjdCBBcnJheV0nXS5pbmNsdWRlcyhPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodikpKSB7XG4gICAgICAgIHJldHVybiBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKHYsIGtleSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBVdGlscztcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxPQUFPLENBQUMsTUFBRCxDQUFwQjs7QUFDQSxNQUFNQyxFQUFFLEdBQUdELE9BQU8sQ0FBQyxJQUFELENBQVAsQ0FBY0UsUUFBekI7QUFFQTtBQUNBO0FBQ0E7OztBQUNBLE1BQU1DLEtBQU4sQ0FBWTtFQUNWO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQytCLGFBQWhCQyxnQkFBZ0IsQ0FBQ0MsV0FBRCxFQUFjQyxNQUFkLEVBQXNCO0lBQ2pEO0lBQ0EsTUFBTUMsSUFBSSxHQUFHUixJQUFJLENBQUNTLFFBQUwsQ0FBY0gsV0FBZCxDQUFiO0lBQ0EsTUFBTUksUUFBUSxHQUFHVixJQUFJLENBQUNXLE9BQUwsQ0FBYUwsV0FBYixDQUFqQixDQUhpRCxDQUtqRDs7SUFDQSxJQUFJLENBQUNDLE1BQUwsRUFBYTtNQUNYLE9BQU87UUFBRVAsSUFBSSxFQUFFTTtNQUFSLENBQVA7SUFDRCxDQVJnRCxDQVVqRDs7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