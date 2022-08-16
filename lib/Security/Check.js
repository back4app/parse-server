"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _Utils = _interopRequireDefault(require("../Utils"));

var _lodash = require("lodash");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * @module SecurityCheck
 */

/**
 * A security check.
 * @class Check
 */
class Check {
  /**
   * Constructs a new security check.
   * @param {Object} params The parameters.
   * @param {String} params.title The title.
   * @param {String} params.warning The warning message if the check fails.
   * @param {String} params.solution The solution to fix the check.
   * @param {Promise} params.check The check as synchronous or asynchronous function.
   */
  constructor(params) {
    this._validateParams(params);

    const {
      title,
      warning,
      solution,
      check
    } = params;
    this.title = title;
    this.warning = warning;
    this.solution = solution;
    this.check = check; // Set default properties

    this._checkState = CheckState.none;
    this.error;
  }
  /**
   * Returns the current check state.
   * @return {CheckState} The check state.
   */


  checkState() {
    return this._checkState;
  }

  async run() {
    // Get check as synchronous or asynchronous function
    const check = this.check instanceof Promise ? await this.check : this.check; // Run check

    try {
      check();
      this._checkState = CheckState.success;
    } catch (e) {
      this.stateFailError = e;
      this._checkState = CheckState.fail;
    }
  }
  /**
   * Validates the constructor parameters.
   * @param {Object} params The parameters to validate.
   */


  _validateParams(params) {
    _Utils.default.validateParams(params, {
      group: {
        t: 'string',
        v: _lodash.isString
      },
      title: {
        t: 'string',
        v: _lodash.isString
      },
      warning: {
        t: 'string',
        v: _lodash.isString
      },
      solution: {
        t: 'string',
        v: _lodash.isString
      },
      check: {
        t: 'function',
        v: _lodash.isFunction
      }
    });
  }

}
/**
 * The check state.
 */


const CheckState = Object.freeze({
  none: 'none',
  fail: 'fail',
  success: 'success'
});
var _default = Check;
exports.default = _default;
module.exports = {
  Check,
  CheckState
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDaGVjayIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwiX3ZhbGlkYXRlUGFyYW1zIiwidGl0bGUiLCJ3YXJuaW5nIiwic29sdXRpb24iLCJjaGVjayIsIl9jaGVja1N0YXRlIiwiQ2hlY2tTdGF0ZSIsIm5vbmUiLCJlcnJvciIsImNoZWNrU3RhdGUiLCJydW4iLCJQcm9taXNlIiwic3VjY2VzcyIsImUiLCJzdGF0ZUZhaWxFcnJvciIsImZhaWwiLCJVdGlscyIsInZhbGlkYXRlUGFyYW1zIiwiZ3JvdXAiLCJ0IiwidiIsImlzU3RyaW5nIiwiaXNGdW5jdGlvbiIsIk9iamVjdCIsImZyZWV6ZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvU2VjdXJpdHkvQ2hlY2suanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbW9kdWxlIFNlY3VyaXR5Q2hlY2tcbiAqL1xuXG5pbXBvcnQgVXRpbHMgZnJvbSAnLi4vVXRpbHMnO1xuaW1wb3J0IHsgaXNGdW5jdGlvbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuXG4vKipcbiAqIEEgc2VjdXJpdHkgY2hlY2suXG4gKiBAY2xhc3MgQ2hlY2tcbiAqL1xuY2xhc3MgQ2hlY2sge1xuICAvKipcbiAgICogQ29uc3RydWN0cyBhIG5ldyBzZWN1cml0eSBjaGVjay5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhcmFtcy50aXRsZSBUaGUgdGl0bGUuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMud2FybmluZyBUaGUgd2FybmluZyBtZXNzYWdlIGlmIHRoZSBjaGVjayBmYWlscy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhcmFtcy5zb2x1dGlvbiBUaGUgc29sdXRpb24gdG8gZml4IHRoZSBjaGVjay5cbiAgICogQHBhcmFtIHtQcm9taXNlfSBwYXJhbXMuY2hlY2sgVGhlIGNoZWNrIGFzIHN5bmNocm9ub3VzIG9yIGFzeW5jaHJvbm91cyBmdW5jdGlvbi5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHBhcmFtcykge1xuICAgIHRoaXMuX3ZhbGlkYXRlUGFyYW1zKHBhcmFtcyk7XG4gICAgY29uc3QgeyB0aXRsZSwgd2FybmluZywgc29sdXRpb24sIGNoZWNrIH0gPSBwYXJhbXM7XG5cbiAgICB0aGlzLnRpdGxlID0gdGl0bGU7XG4gICAgdGhpcy53YXJuaW5nID0gd2FybmluZztcbiAgICB0aGlzLnNvbHV0aW9uID0gc29sdXRpb247XG4gICAgdGhpcy5jaGVjayA9IGNoZWNrO1xuXG4gICAgLy8gU2V0IGRlZmF1bHQgcHJvcGVydGllc1xuICAgIHRoaXMuX2NoZWNrU3RhdGUgPSBDaGVja1N0YXRlLm5vbmU7XG4gICAgdGhpcy5lcnJvcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IGNoZWNrIHN0YXRlLlxuICAgKiBAcmV0dXJuIHtDaGVja1N0YXRlfSBUaGUgY2hlY2sgc3RhdGUuXG4gICAqL1xuICBjaGVja1N0YXRlKCkge1xuICAgIHJldHVybiB0aGlzLl9jaGVja1N0YXRlO1xuICB9XG5cbiAgYXN5bmMgcnVuKCkge1xuICAgIC8vIEdldCBjaGVjayBhcyBzeW5jaHJvbm91cyBvciBhc3luY2hyb25vdXMgZnVuY3Rpb25cbiAgICBjb25zdCBjaGVjayA9IHRoaXMuY2hlY2sgaW5zdGFuY2VvZiBQcm9taXNlID8gYXdhaXQgdGhpcy5jaGVjayA6IHRoaXMuY2hlY2s7XG5cbiAgICAvLyBSdW4gY2hlY2tcbiAgICB0cnkge1xuICAgICAgY2hlY2soKTtcbiAgICAgIHRoaXMuX2NoZWNrU3RhdGUgPSBDaGVja1N0YXRlLnN1Y2Nlc3M7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5zdGF0ZUZhaWxFcnJvciA9IGU7XG4gICAgICB0aGlzLl9jaGVja1N0YXRlID0gQ2hlY2tTdGF0ZS5mYWlsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgdGhlIGNvbnN0cnVjdG9yIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMgdG8gdmFsaWRhdGUuXG4gICAqL1xuICBfdmFsaWRhdGVQYXJhbXMocGFyYW1zKSB7XG4gICAgVXRpbHMudmFsaWRhdGVQYXJhbXMocGFyYW1zLCB7XG4gICAgICBncm91cDogeyB0OiAnc3RyaW5nJywgdjogaXNTdHJpbmcgfSxcbiAgICAgIHRpdGxlOiB7IHQ6ICdzdHJpbmcnLCB2OiBpc1N0cmluZyB9LFxuICAgICAgd2FybmluZzogeyB0OiAnc3RyaW5nJywgdjogaXNTdHJpbmcgfSxcbiAgICAgIHNvbHV0aW9uOiB7IHQ6ICdzdHJpbmcnLCB2OiBpc1N0cmluZyB9LFxuICAgICAgY2hlY2s6IHsgdDogJ2Z1bmN0aW9uJywgdjogaXNGdW5jdGlvbiB9LFxuICAgIH0pO1xuICB9XG59XG5cbi8qKlxuICogVGhlIGNoZWNrIHN0YXRlLlxuICovXG5jb25zdCBDaGVja1N0YXRlID0gT2JqZWN0LmZyZWV6ZSh7XG4gIG5vbmU6ICdub25lJyxcbiAgZmFpbDogJ2ZhaWwnLFxuICBzdWNjZXNzOiAnc3VjY2VzcycsXG59KTtcblxuZXhwb3J0IGRlZmF1bHQgQ2hlY2s7XG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgQ2hlY2ssXG4gIENoZWNrU3RhdGUsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBSUE7O0FBQ0E7Ozs7QUFMQTtBQUNBO0FBQ0E7O0FBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxLQUFOLENBQVk7RUFDVjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VDLFdBQVcsQ0FBQ0MsTUFBRCxFQUFTO0lBQ2xCLEtBQUtDLGVBQUwsQ0FBcUJELE1BQXJCOztJQUNBLE1BQU07TUFBRUUsS0FBRjtNQUFTQyxPQUFUO01BQWtCQyxRQUFsQjtNQUE0QkM7SUFBNUIsSUFBc0NMLE1BQTVDO0lBRUEsS0FBS0UsS0FBTCxHQUFhQSxLQUFiO0lBQ0EsS0FBS0MsT0FBTCxHQUFlQSxPQUFmO0lBQ0EsS0FBS0MsUUFBTCxHQUFnQkEsUUFBaEI7SUFDQSxLQUFLQyxLQUFMLEdBQWFBLEtBQWIsQ0FQa0IsQ0FTbEI7O0lBQ0EsS0FBS0MsV0FBTCxHQUFtQkMsVUFBVSxDQUFDQyxJQUE5QjtJQUNBLEtBQUtDLEtBQUw7RUFDRDtFQUVEO0FBQ0Y7QUFDQTtBQUNBOzs7RUFDRUMsVUFBVSxHQUFHO0lBQ1gsT0FBTyxLQUFLSixXQUFaO0VBQ0Q7O0VBRVEsTUFBSEssR0FBRyxHQUFHO0lBQ1Y7SUFDQSxNQUFNTixLQUFLLEdBQUcsS0FBS0EsS0FBTCxZQUFzQk8sT0FBdEIsR0FBZ0MsTUFBTSxLQUFLUCxLQUEzQyxHQUFtRCxLQUFLQSxLQUF0RSxDQUZVLENBSVY7O0lBQ0EsSUFBSTtNQUNGQSxLQUFLO01BQ0wsS0FBS0MsV0FBTCxHQUFtQkMsVUFBVSxDQUFDTSxPQUE5QjtJQUNELENBSEQsQ0FHRSxPQUFPQyxDQUFQLEVBQVU7TUFDVixLQUFLQyxjQUFMLEdBQXNCRCxDQUF0QjtNQUNBLEtBQUtSLFdBQUwsR0FBbUJDLFVBQVUsQ0FBQ1MsSUFBOUI7SUFDRDtFQUNGO0VBRUQ7QUFDRjtBQUNBO0FBQ0E7OztFQUNFZixlQUFlLENBQUNELE1BQUQsRUFBUztJQUN0QmlCLGNBQUEsQ0FBTUMsY0FBTixDQUFxQmxCLE1BQXJCLEVBQTZCO01BQzNCbUIsS0FBSyxFQUFFO1FBQUVDLENBQUMsRUFBRSxRQUFMO1FBQWVDLENBQUMsRUFBRUM7TUFBbEIsQ0FEb0I7TUFFM0JwQixLQUFLLEVBQUU7UUFBRWtCLENBQUMsRUFBRSxRQUFMO1FBQWVDLENBQUMsRUFBRUM7TUFBbEIsQ0FGb0I7TUFHM0JuQixPQUFPLEVBQUU7UUFBRWlCLENBQUMsRUFBRSxRQUFMO1FBQWVDLENBQUMsRUFBRUM7TUFBbEIsQ0FIa0I7TUFJM0JsQixRQUFRLEVBQUU7UUFBRWdCLENBQUMsRUFBRSxRQUFMO1FBQWVDLENBQUMsRUFBRUM7TUFBbEIsQ0FKaUI7TUFLM0JqQixLQUFLLEVBQUU7UUFBRWUsQ0FBQyxFQUFFLFVBQUw7UUFBaUJDLENBQUMsRUFBRUU7TUFBcEI7SUFMb0IsQ0FBN0I7RUFPRDs7QUF6RFM7QUE0RFo7QUFDQTtBQUNBOzs7QUFDQSxNQUFNaEIsVUFBVSxHQUFHaUIsTUFBTSxDQUFDQyxNQUFQLENBQWM7RUFDL0JqQixJQUFJLEVBQUUsTUFEeUI7RUFFL0JRLElBQUksRUFBRSxNQUZ5QjtFQUcvQkgsT0FBTyxFQUFFO0FBSHNCLENBQWQsQ0FBbkI7ZUFNZWYsSzs7QUFDZjRCLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQjtFQUNmN0IsS0FEZTtFQUVmUztBQUZlLENBQWpCIn0=