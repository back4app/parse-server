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
   * Deep-scans an object for a matching key/value definition.
   * @param {Object} obj The object to scan.
   * @param {String | undefined} key The key to match, or undefined if only the value should be matched.
   * @param {any | undefined} value The value to match, or undefined if only the key should be matched.
   * @returns {Boolean} True if a match was found, false otherwise.
   */
  static objectContainsKeyValue(obj, key, value) {
    const isMatch = (a, b) => typeof a === 'string' && new RegExp(a).test(b) || a === b;
    const isKeyMatch = k => isMatch(key, k);
    const isValueMatch = v => isMatch(value, v);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiZSIsImlzUGF0aCIsInMiLCJ0ZXN0IiwiZmxhdHRlbk9iamVjdCIsIm9iaiIsInBhcmVudEtleSIsImRlbGltaXRlciIsInJlc3VsdCIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5ld0tleSIsImlzUHJvbWlzZSIsIm9iamVjdCIsIlByb21pc2UiLCJnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMiLCJpbmRleCIsImN1cnJlbnQiLCJyZXN1bHRzIiwia2V5cyIsInZhbHVlcyIsInZhbHVlIiwibmV4dEluZGV4IiwibGVuZ3RoIiwiYXNzaWduIiwicHVzaCIsInZhbGlkYXRlUGFyYW1zIiwicGFyYW1zIiwidHlwZXMiLCJ0eXBlIiwiaXNPcHRpb25hbCIsIm8iLCJwYXJhbSIsInYiLCJ0Iiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsImlzTWF0Y2giLCJhIiwiYiIsIlJlZ0V4cCIsImlzS2V5TWF0Y2giLCJrIiwiaXNWYWx1ZU1hdGNoIiwiZW50cmllcyIsInVuZGVmaW5lZCIsImluY2x1ZGVzIiwidG9TdHJpbmciLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1V0aWxzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogdXRpbHMuanNcbiAqIEBmaWxlIEdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXNcbiAqIEBkZXNjcmlwdGlvbiBHZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzLlxuICovXG5cbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5jb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJykucHJvbWlzZXM7XG5cbi8qKlxuICogVGhlIGdlbmVyYWwgcHVycG9zZSB1dGlsaXRpZXMuXG4gKi9cbmNsYXNzIFV0aWxzIHtcbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBnZXRMb2NhbGl6ZWRQYXRoXG4gICAqIEBkZXNjcmlwdGlvbiBSZXR1cm5zIGEgbG9jYWxpemVkIGZpbGUgcGF0aCBhY2NvcmluZyB0byB0aGUgbG9jYWxlLlxuICAgKlxuICAgKiBMb2NhbGl6ZWQgZmlsZXMgYXJlIHNlYXJjaGVkIGluIHN1YmZvbGRlcnMgb2YgYSBnaXZlbiBwYXRoLCBlLmcuXG4gICAqXG4gICAqIHJvb3QvXG4gICAqIOKUnOKUgOKUgCBiYXNlLyAgICAgICAgICAgICAgICAgICAgLy8gYmFzZSBwYXRoIHRvIGZpbGVzXG4gICAqIOKUgiAgIOKUnOKUgOKUgCBleGFtcGxlLmh0bWwgICAgICAgICAvLyBkZWZhdWx0IGZpbGVcbiAgICog4pSCICAg4pSU4pSA4pSAIGRlLyAgICAgICAgICAgICAgICAgIC8vIGRlIGxhbmd1YWdlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZSBsb2NhbGl6ZWQgZmlsZVxuICAgKiDilIIgICDilJTilIDilIAgZGUtQVQvICAgICAgICAgICAgICAgLy8gZGUtQVQgbG9jYWxlIGZvbGRlclxuICAgKiDilIIgICDilIIgICDilJTilIDilIAgZXhhbXBsZS5odG1sICAgICAvLyBkZS1BVCBsb2NhbGl6ZWQgZmlsZVxuICAgKlxuICAgKiBGaWxlcyBhcmUgbWF0Y2hlZCB3aXRoIHRoZSBsb2NhbGUgaW4gdGhlIGZvbGxvd2luZyBvcmRlcjpcbiAgICogMS4gTG9jYWxlIG1hdGNoLCBlLmcuIGxvY2FsZSBgZGUtQVRgIG1hdGNoZXMgZmlsZSBpbiBmb2xkZXIgYGRlLUFUYC5cbiAgICogMi4gTGFuZ3VhZ2UgbWF0Y2gsIGUuZy4gbG9jYWxlIGBkZS1BVGAgbWF0Y2hlcyBmaWxlIGluIGZvbGRlciBgZGVgLlxuICAgKiAzLiBEZWZhdWx0OyBmaWxlIGluIGJhc2UgZm9sZGVyIGlzIHJldHVybmVkLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZGVmYXVsdFBhdGggVGhlIGFic29sdXRlIGZpbGUgcGF0aCwgd2hpY2ggaXMgYWxzb1xuICAgKiB0aGUgZGVmYXVsdCBwYXRoIHJldHVybmVkIGlmIGxvY2FsaXphdGlvbiBpcyBub3QgYXZhaWxhYmxlLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbG9jYWxlIFRoZSBsb2NhbGUuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSBvYmplY3QgY29udGFpbnM6XG4gICAqIC0gYHBhdGhgOiBUaGUgcGF0aCB0byB0aGUgbG9jYWxpemVkIGZpbGUsIG9yIHRoZSBvcmlnaW5hbCBwYXRoIGlmXG4gICAqICAgbG9jYWxpemF0aW9uIGlzIG5vdCBhdmFpbGFibGUuXG4gICAqIC0gYHN1YmRpcmA6IFRoZSBzdWJkaXJlY3Rvcnkgb2YgdGhlIGxvY2FsaXplZCBmaWxlLCBvciB1bmRlZmluZWQgaWZcbiAgICogICB0aGVyZSBpcyBubyBtYXRjaGluZyBsb2NhbGl6ZWQgZmlsZS5cbiAgICovXG4gIHN0YXRpYyBhc3luYyBnZXRMb2NhbGl6ZWRQYXRoKGRlZmF1bHRQYXRoLCBsb2NhbGUpIHtcbiAgICAvLyBHZXQgZmlsZSBuYW1lIGFuZCBwYXRoc1xuICAgIGNvbnN0IGZpbGUgPSBwYXRoLmJhc2VuYW1lKGRlZmF1bHRQYXRoKTtcbiAgICBjb25zdCBiYXNlUGF0aCA9IHBhdGguZGlybmFtZShkZWZhdWx0UGF0aCk7XG5cbiAgICAvLyBJZiBsb2NhbGUgaXMgbm90IHNldCByZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgaWYgKCFsb2NhbGUpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGRlZmF1bHRQYXRoIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbG9jYWxlIGV4aXN0c1xuICAgIGNvbnN0IGxvY2FsZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxvY2FsZSwgZmlsZSk7XG4gICAgY29uc3QgbG9jYWxlRmlsZUV4aXN0cyA9IGF3YWl0IFV0aWxzLmZpbGVFeGlzdHMobG9jYWxlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsb2NhbGUgZXhpc3RzIHJldHVybiBmaWxlXG4gICAgaWYgKGxvY2FsZUZpbGVFeGlzdHMpIHtcbiAgICAgIHJldHVybiB7IHBhdGg6IGxvY2FsZVBhdGgsIHN1YmRpcjogbG9jYWxlIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZmlsZSBmb3IgbGFuZ3VhZ2UgZXhpc3RzXG4gICAgY29uc3QgbGFuZ3VhZ2UgPSBsb2NhbGUuc3BsaXQoJy0nKVswXTtcbiAgICBjb25zdCBsYW5ndWFnZVBhdGggPSBwYXRoLmpvaW4oYmFzZVBhdGgsIGxhbmd1YWdlLCBmaWxlKTtcbiAgICBjb25zdCBsYW5ndWFnZUZpbGVFeGlzdHMgPSBhd2FpdCBVdGlscy5maWxlRXhpc3RzKGxhbmd1YWdlUGF0aCk7XG5cbiAgICAvLyBJZiBmaWxlIGZvciBsYW5ndWFnZSBleGlzdHMgcmV0dXJuIGZpbGVcbiAgICBpZiAobGFuZ3VhZ2VGaWxlRXhpc3RzKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBsYW5ndWFnZVBhdGgsIHN1YmRpcjogbGFuZ3VhZ2UgfTtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gZGVmYXVsdCBmaWxlXG4gICAgcmV0dXJuIHsgcGF0aDogZGVmYXVsdFBhdGggfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gZmlsZUV4aXN0c1xuICAgKiBAZGVzY3JpcHRpb24gQ2hlY2tzIHdoZXRoZXIgYSBmaWxlIGV4aXN0cy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIGZpbGUgcGF0aC5cbiAgICogQHJldHVybnMge1Byb21pc2U8Qm9vbGVhbj59IElzIHRydWUgaWYgdGhlIGZpbGUgY2FuIGJlIGFjY2Vzc2VkLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZmlsZUV4aXN0cyhwYXRoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZzLmFjY2VzcyhwYXRoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQGZ1bmN0aW9uIGlzUGF0aFxuICAgKiBAZGVzY3JpcHRpb24gRXZhbHVhdGVzIHdoZXRoZXIgYSBzdHJpbmcgaXMgYSBmaWxlIHBhdGggKGFzIG9wcG9zZWQgdG8gYSBVUkwgZm9yIGV4YW1wbGUpLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcyBUaGUgc3RyaW5nIHRvIGV2YWx1YXRlLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBldmFsdWF0ZWQgc3RyaW5nIGlzIGEgcGF0aC5cbiAgICovXG4gIHN0YXRpYyBpc1BhdGgocykge1xuICAgIHJldHVybiAvKF5cXC8pfCheXFwuXFwvKXwoXlxcLlxcLlxcLykvLnRlc3Qocyk7XG4gIH1cblxuICAvKipcbiAgICogRmxhdHRlbnMgYW4gb2JqZWN0IGFuZCBjcmF0ZXMgbmV3IGtleXMgd2l0aCBjdXN0b20gZGVsaW1pdGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIGZsYXR0ZW4uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBbZGVsaW1pdGVyPScuJ10gVGhlIGRlbGltaXRlciBvZiB0aGUgbmV3bHkgZ2VuZXJhdGVkIGtleXMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXN1bHRcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIGZsYXR0ZW5lZCBvYmplY3QuXG4gICAqKi9cbiAgc3RhdGljIGZsYXR0ZW5PYmplY3Qob2JqLCBwYXJlbnRLZXksIGRlbGltaXRlciA9ICcuJywgcmVzdWx0ID0ge30pIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIGNvbnN0IG5ld0tleSA9IHBhcmVudEtleSA/IHBhcmVudEtleSArIGRlbGltaXRlciArIGtleSA6IGtleTtcblxuICAgICAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnb2JqZWN0JyAmJiBvYmpba2V5XSAhPT0gbnVsbCkge1xuICAgICAgICAgIHRoaXMuZmxhdHRlbk9iamVjdChvYmpba2V5XSwgbmV3S2V5LCBkZWxpbWl0ZXIsIHJlc3VsdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W25ld0tleV0gPSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZXMgd2hldGhlciBhbiBvYmplY3QgaXMgYSBQcm9taXNlLlxuICAgKiBAcGFyYW0ge2FueX0gb2JqZWN0IFRoZSBvYmplY3QgdG8gdmFsaWRhdGUuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBSZXR1cm5zIHRydWUgaWYgdGhlIG9iamVjdCBpcyBhIHByb21pc2UuXG4gICAqL1xuICBzdGF0aWMgaXNQcm9taXNlKG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBQcm9taXNlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYW4gb2JqZWN0IHdpdGggYWxsIHBlcm11dGF0aW9ucyBvZiB0aGUgb3JpZ2luYWwga2V5cy5cbiAgICogRm9yIGV4YW1wbGUsIHRoaXMgZGVmaW5pdGlvbjpcbiAgICogYGBgXG4gICAqIHtcbiAgICogICBhOiBbdHJ1ZSwgZmFsc2VdLFxuICAgKiAgIGI6IFsxLCAyXSxcbiAgICogICBjOiBbJ3gnXVxuICAgKiB9XG4gICAqIGBgYFxuICAgKiBwZXJtdXRhdGVzIHRvOlxuICAgKiBgYGBcbiAgICogW1xuICAgKiAgIHsgYTogdHJ1ZSwgYjogMSwgYzogJ3gnIH0sXG4gICAqICAgeyBhOiB0cnVlLCBiOiAyLCBjOiAneCcgfSxcbiAgICogICB7IGE6IGZhbHNlLCBiOiAxLCBjOiAneCcgfSxcbiAgICogICB7IGE6IGZhbHNlLCBiOiAyLCBjOiAneCcgfVxuICAgKiBdXG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcGVybXV0YXRlLlxuICAgKiBAcGFyYW0ge0ludGVnZXJ9IFtpbmRleD0wXSBUaGUgY3VycmVudCBrZXkgaW5kZXguXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbY3VycmVudD17fV0gVGhlIGN1cnJlbnQgcmVzdWx0IGVudHJ5IGJlaW5nIGNvbXBvc2VkLlxuICAgKiBAcGFyYW0ge0FycmF5fSBbcmVzdWx0cz1bXV0gVGhlIHJlc3VsdGluZyBhcnJheSBvZiBwZXJtdXRhdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgZ2V0T2JqZWN0S2V5UGVybXV0YXRpb25zKG9iamVjdCwgaW5kZXggPSAwLCBjdXJyZW50ID0ge30sIHJlc3VsdHMgPSBbXSkge1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IGtleSA9IGtleXNbaW5kZXhdO1xuICAgIGNvbnN0IHZhbHVlcyA9IG9iamVjdFtrZXldO1xuXG4gICAgZm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcbiAgICAgIGN1cnJlbnRba2V5XSA9IHZhbHVlO1xuICAgICAgY29uc3QgbmV4dEluZGV4ID0gaW5kZXggKyAxO1xuXG4gICAgICBpZiAobmV4dEluZGV4IDwga2V5cy5sZW5ndGgpIHtcbiAgICAgICAgVXRpbHMuZ2V0T2JqZWN0S2V5UGVybXV0YXRpb25zKG9iamVjdCwgbmV4dEluZGV4LCBjdXJyZW50LCByZXN1bHRzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IE9iamVjdC5hc3NpZ24oe30sIGN1cnJlbnQpO1xuICAgICAgICByZXN1bHRzLnB1c2gocmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIHBhcmFtZXRlcnMgYW5kIHRocm93cyBpZiBhIHBhcmFtZXRlciBpcyBpbnZhbGlkLlxuICAgKiBFeGFtcGxlIHBhcmFtZXRlciB0eXBlcyBzeW50YXg6XG4gICAqIGBgYFxuICAgKiB7XG4gICAqICAgcGFyYW1ldGVyTmFtZToge1xuICAgKiAgICAgIHQ6ICdib29sZWFuJyxcbiAgICogICAgICB2OiBpc0Jvb2xlYW4sXG4gICAqICAgICAgbzogdHJ1ZVxuICAgKiAgIH0sXG4gICAqICAgLi4uXG4gICAqIH1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMgdG8gdmFsaWRhdGUuXG4gICAqIEBwYXJhbSB7QXJyYXk8T2JqZWN0Pn0gdHlwZXMgVGhlIHBhcmFtZXRlciB0eXBlcyB1c2VkIGZvciB2YWxpZGF0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHlwZXMudCBUaGUgcGFyYW1ldGVyIHR5cGU7IHVzZWQgZm9yIGVycm9yIG1lc3NhZ2UsIG5vdCBmb3IgdmFsaWRhdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHR5cGVzLnYgVGhlIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIHRoZSBwYXJhbWV0ZXIgdmFsdWUuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW3R5cGVzLm89ZmFsc2VdIElzIHRydWUgaWYgdGhlIHBhcmFtZXRlciBpcyBvcHRpb25hbC5cbiAgICovXG4gIHN0YXRpYyB2YWxpZGF0ZVBhcmFtcyhwYXJhbXMsIHR5cGVzKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocGFyYW1zKSkge1xuICAgICAgY29uc3QgdHlwZSA9IHR5cGVzW2tleV07XG4gICAgICBjb25zdCBpc09wdGlvbmFsID0gISF0eXBlLm87XG4gICAgICBjb25zdCBwYXJhbSA9IHBhcmFtc1trZXldO1xuICAgICAgaWYgKCEoaXNPcHRpb25hbCAmJiBwYXJhbSA9PSBudWxsKSAmJiAhdHlwZS52KHBhcmFtKSkge1xuICAgICAgICB0aHJvdyBgSW52YWxpZCBwYXJhbWV0ZXIgJHtrZXl9IG11c3QgYmUgb2YgdHlwZSAke3R5cGUudH0gYnV0IGlzICR7dHlwZW9mIHBhcmFtfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERlZXAtc2NhbnMgYW4gb2JqZWN0IGZvciBhIG1hdGNoaW5nIGtleS92YWx1ZSBkZWZpbml0aW9uLlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gc2Nhbi5cbiAgICogQHBhcmFtIHtTdHJpbmcgfCB1bmRlZmluZWR9IGtleSBUaGUga2V5IHRvIG1hdGNoLCBvciB1bmRlZmluZWQgaWYgb25seSB0aGUgdmFsdWUgc2hvdWxkIGJlIG1hdGNoZWQuXG4gICAqIEBwYXJhbSB7YW55IHwgdW5kZWZpbmVkfSB2YWx1ZSBUaGUgdmFsdWUgdG8gbWF0Y2gsIG9yIHVuZGVmaW5lZCBpZiBvbmx5IHRoZSBrZXkgc2hvdWxkIGJlIG1hdGNoZWQuXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBUcnVlIGlmIGEgbWF0Y2ggd2FzIGZvdW5kLCBmYWxzZSBvdGhlcndpc2UuXG4gICAqL1xuICBzdGF0aWMgb2JqZWN0Q29udGFpbnNLZXlWYWx1ZShvYmosIGtleSwgdmFsdWUpIHtcbiAgICBjb25zdCBpc01hdGNoID0gKGEsIGIpID0+ICh0eXBlb2YgYSA9PT0gJ3N0cmluZycgJiYgbmV3IFJlZ0V4cChhKS50ZXN0KGIpKSB8fCBhID09PSBiO1xuICAgIGNvbnN0IGlzS2V5TWF0Y2ggPSBrID0+IGlzTWF0Y2goa2V5LCBrKTtcbiAgICBjb25zdCBpc1ZhbHVlTWF0Y2ggPSB2ID0+IGlzTWF0Y2godmFsdWUsIHYpO1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKG9iaikpIHtcbiAgICAgIGlmIChrZXkgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSA9PT0gdW5kZWZpbmVkICYmIGlzS2V5TWF0Y2goaykpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSB1bmRlZmluZWQgJiYgaXNWYWx1ZU1hdGNoKHYpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIGlmIChrZXkgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIGlzS2V5TWF0Y2goaykgJiYgaXNWYWx1ZU1hdGNoKHYpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKFsnW29iamVjdCBPYmplY3RdJywgJ1tvYmplY3QgQXJyYXldJ10uaW5jbHVkZXMoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHYpKSkge1xuICAgICAgICByZXR1cm4gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZSh2LCBrZXksIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gVXRpbHM7XG4iXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDNUIsTUFBTUMsRUFBRSxHQUFHRCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUNFLFFBQVE7O0FBRWpDO0FBQ0E7QUFDQTtBQUNBLE1BQU1DLEtBQUssQ0FBQztFQUNWO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0UsYUFBYUMsZ0JBQWdCQSxDQUFDQyxXQUFXLEVBQUVD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