"use strict";

var _logger = _interopRequireDefault(require("../logger"));
var _Deprecations = _interopRequireDefault(require("./Deprecations"));
var _Utils = _interopRequireDefault(require("../Utils"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * The deprecator class.
 */
class Deprecator {
  /**
   * Scans the Parse Server for deprecated options.
   * This needs to be called before setting option defaults, otherwise it
   * becomes indistinguishable whether an option has been set manually or
   * by default.
   * @param {any} options The Parse Server options.
   */
  static scanParseServerOptions(options) {
    // Scan for deprecations
    for (const deprecation of Deprecator._getDeprecations()) {
      // Get deprecation properties
      const solution = deprecation.solution;
      const optionKey = deprecation.optionKey;
      const changeNewDefault = deprecation.changeNewDefault;

      // If default will change, only throw a warning if option is not set
      if (changeNewDefault != null && _Utils.default.getNestedProperty(options, optionKey) == null) {
        Deprecator._logOption({
          optionKey,
          changeNewDefault,
          solution
        });
      }
    }
  }

  /**
   * Logs a deprecation warning for a parameter that can only be determined dynamically
   * during runtime.
   *
   * Note: Do not use this to log deprecations of Parse Server options, but add such
   * deprecations to `Deprecations.js` instead. See the contribution docs for more
   * details.
   *
   * For consistency, the deprecation warning is composed of the following parts:
   *
   * > DeprecationWarning: `usage` is deprecated and will be removed in a future version.
   * `solution`.
   *
   * - `usage`: The deprecated usage.
   * - `solution`: The instruction to resolve this deprecation warning.
   *
   * For example:
   * > DeprecationWarning: `Prefixing field names with dollar sign ($) in aggregation query`
   * is deprecated and will be removed in a future version. `Reference field names without
   * dollar sign prefix.`
   *
   * @param {Object} options The deprecation options.
   * @param {String} options.usage The usage that is deprecated.
   * @param {String} [options.solution] The instruction to resolve this deprecation warning.
   * Optional. It is recommended to add an instruction for the convenience of the developer.
   */
  static logRuntimeDeprecation(options) {
    Deprecator._logGeneric(options);
  }

  /**
   * Returns the deprecation definitions.
   * @returns {Array<Object>} The deprecations.
   */
  static _getDeprecations() {
    return _Deprecations.default;
  }

  /**
   * Logs a generic deprecation warning.
   *
   * @param {Object} options The deprecation options.
   * @param {String} options.usage The usage that is deprecated.
   * @param {String} [options.solution] The instruction to resolve this deprecation warning.
   * Optional. It is recommended to add an instruction for the convenience of the developer.
   */
  static _logGeneric({
    usage,
    solution
  }) {
    // Compose message
    let output = `DeprecationWarning: ${usage} is deprecated and will be removed in a future version.`;
    output += solution ? ` ${solution}` : '';
    _logger.default.warn(output);
  }

  /**
   * Logs a deprecation warning for a Parse Server option.
   *
   * @param {String} optionKey The option key incl. its path, e.g. `security.enableCheck`.
   * @param {String} envKey The environment key, e.g. `PARSE_SERVER_SECURITY`.
   * @param {String} changeNewKey Set the new key name if the current key will be replaced,
   * or set to an empty string if the current key will be removed without replacement.
   * @param {String} changeNewDefault Set the new default value if the key's default value
   * will change in a future version.
   * @param {String} [solution] The instruction to resolve this deprecation warning. This
   * message must not include the warning that the parameter is deprecated, that is
   * automatically added to the message. It should only contain the instruction on how
   * to resolve this warning.
   */
  static _logOption({
    optionKey,
    envKey,
    changeNewKey,
    changeNewDefault,
    solution
  }) {
    const type = optionKey ? 'option' : 'environment key';
    const key = optionKey ? optionKey : envKey;
    const keyAction = changeNewKey == null ? undefined : changeNewKey.length > 0 ? `renamed to '${changeNewKey}'` : `removed`;

    // Compose message
    let output = `DeprecationWarning: The Parse Server ${type} '${key}' `;
    output += changeNewKey ? `is deprecated and will be ${keyAction} in a future version.` : '';
    output += changeNewDefault ? `default will change to '${changeNewDefault}' in a future version.` : '';
    output += solution ? ` ${solution}` : '';
    _logger.default.warn(output);
  }
}
module.exports = Deprecator;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfRGVwcmVjYXRpb25zIiwiX1V0aWxzIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJvcHRpb25zIiwiZGVwcmVjYXRpb24iLCJfZ2V0RGVwcmVjYXRpb25zIiwic29sdXRpb24iLCJvcHRpb25LZXkiLCJjaGFuZ2VOZXdEZWZhdWx0IiwiVXRpbHMiLCJnZXROZXN0ZWRQcm9wZXJ0eSIsIl9sb2dPcHRpb24iLCJsb2dSdW50aW1lRGVwcmVjYXRpb24iLCJfbG9nR2VuZXJpYyIsIkRlcHJlY2F0aW9ucyIsInVzYWdlIiwib3V0cHV0IiwibG9nZ2VyIiwid2FybiIsImVudktleSIsImNoYW5nZU5ld0tleSIsInR5cGUiLCJrZXkiLCJrZXlBY3Rpb24iLCJ1bmRlZmluZWQiLCJsZW5ndGgiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0RlcHJlY2F0b3IvRGVwcmVjYXRvci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgRGVwcmVjYXRpb25zIGZyb20gJy4vRGVwcmVjYXRpb25zJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5cbi8qKlxuICogVGhlIGRlcHJlY2F0b3IgY2xhc3MuXG4gKi9cbmNsYXNzIERlcHJlY2F0b3Ige1xuICAvKipcbiAgICogU2NhbnMgdGhlIFBhcnNlIFNlcnZlciBmb3IgZGVwcmVjYXRlZCBvcHRpb25zLlxuICAgKiBUaGlzIG5lZWRzIHRvIGJlIGNhbGxlZCBiZWZvcmUgc2V0dGluZyBvcHRpb24gZGVmYXVsdHMsIG90aGVyd2lzZSBpdFxuICAgKiBiZWNvbWVzIGluZGlzdGluZ3Vpc2hhYmxlIHdoZXRoZXIgYW4gb3B0aW9uIGhhcyBiZWVuIHNldCBtYW51YWxseSBvclxuICAgKiBieSBkZWZhdWx0LlxuICAgKiBAcGFyYW0ge2FueX0gb3B0aW9ucyBUaGUgUGFyc2UgU2VydmVyIG9wdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgc2NhblBhcnNlU2VydmVyT3B0aW9ucyhvcHRpb25zKSB7XG4gICAgLy8gU2NhbiBmb3IgZGVwcmVjYXRpb25zXG4gICAgZm9yIChjb25zdCBkZXByZWNhdGlvbiBvZiBEZXByZWNhdG9yLl9nZXREZXByZWNhdGlvbnMoKSkge1xuICAgICAgLy8gR2V0IGRlcHJlY2F0aW9uIHByb3BlcnRpZXNcbiAgICAgIGNvbnN0IHNvbHV0aW9uID0gZGVwcmVjYXRpb24uc29sdXRpb247XG4gICAgICBjb25zdCBvcHRpb25LZXkgPSBkZXByZWNhdGlvbi5vcHRpb25LZXk7XG4gICAgICBjb25zdCBjaGFuZ2VOZXdEZWZhdWx0ID0gZGVwcmVjYXRpb24uY2hhbmdlTmV3RGVmYXVsdDtcblxuICAgICAgLy8gSWYgZGVmYXVsdCB3aWxsIGNoYW5nZSwgb25seSB0aHJvdyBhIHdhcm5pbmcgaWYgb3B0aW9uIGlzIG5vdCBzZXRcbiAgICAgIGlmIChjaGFuZ2VOZXdEZWZhdWx0ICE9IG51bGwgJiYgVXRpbHMuZ2V0TmVzdGVkUHJvcGVydHkob3B0aW9ucywgb3B0aW9uS2V5KSA9PSBudWxsKSB7XG4gICAgICAgIERlcHJlY2F0b3IuX2xvZ09wdGlvbih7IG9wdGlvbktleSwgY2hhbmdlTmV3RGVmYXVsdCwgc29sdXRpb24gfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIExvZ3MgYSBkZXByZWNhdGlvbiB3YXJuaW5nIGZvciBhIHBhcmFtZXRlciB0aGF0IGNhbiBvbmx5IGJlIGRldGVybWluZWQgZHluYW1pY2FsbHlcbiAgICogZHVyaW5nIHJ1bnRpbWUuXG4gICAqXG4gICAqIE5vdGU6IERvIG5vdCB1c2UgdGhpcyB0byBsb2cgZGVwcmVjYXRpb25zIG9mIFBhcnNlIFNlcnZlciBvcHRpb25zLCBidXQgYWRkIHN1Y2hcbiAgICogZGVwcmVjYXRpb25zIHRvIGBEZXByZWNhdGlvbnMuanNgIGluc3RlYWQuIFNlZSB0aGUgY29udHJpYnV0aW9uIGRvY3MgZm9yIG1vcmVcbiAgICogZGV0YWlscy5cbiAgICpcbiAgICogRm9yIGNvbnNpc3RlbmN5LCB0aGUgZGVwcmVjYXRpb24gd2FybmluZyBpcyBjb21wb3NlZCBvZiB0aGUgZm9sbG93aW5nIHBhcnRzOlxuICAgKlxuICAgKiA+IERlcHJlY2F0aW9uV2FybmluZzogYHVzYWdlYCBpcyBkZXByZWNhdGVkIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gYSBmdXR1cmUgdmVyc2lvbi5cbiAgICogYHNvbHV0aW9uYC5cbiAgICpcbiAgICogLSBgdXNhZ2VgOiBUaGUgZGVwcmVjYXRlZCB1c2FnZS5cbiAgICogLSBgc29sdXRpb25gOiBUaGUgaW5zdHJ1Y3Rpb24gdG8gcmVzb2x2ZSB0aGlzIGRlcHJlY2F0aW9uIHdhcm5pbmcuXG4gICAqXG4gICAqIEZvciBleGFtcGxlOlxuICAgKiA+IERlcHJlY2F0aW9uV2FybmluZzogYFByZWZpeGluZyBmaWVsZCBuYW1lcyB3aXRoIGRvbGxhciBzaWduICgkKSBpbiBhZ2dyZWdhdGlvbiBxdWVyeWBcbiAgICogaXMgZGVwcmVjYXRlZCBhbmQgd2lsbCBiZSByZW1vdmVkIGluIGEgZnV0dXJlIHZlcnNpb24uIGBSZWZlcmVuY2UgZmllbGQgbmFtZXMgd2l0aG91dFxuICAgKiBkb2xsYXIgc2lnbiBwcmVmaXguYFxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBUaGUgZGVwcmVjYXRpb24gb3B0aW9ucy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMudXNhZ2UgVGhlIHVzYWdlIHRoYXQgaXMgZGVwcmVjYXRlZC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IFtvcHRpb25zLnNvbHV0aW9uXSBUaGUgaW5zdHJ1Y3Rpb24gdG8gcmVzb2x2ZSB0aGlzIGRlcHJlY2F0aW9uIHdhcm5pbmcuXG4gICAqIE9wdGlvbmFsLiBJdCBpcyByZWNvbW1lbmRlZCB0byBhZGQgYW4gaW5zdHJ1Y3Rpb24gZm9yIHRoZSBjb252ZW5pZW5jZSBvZiB0aGUgZGV2ZWxvcGVyLlxuICAgKi9cbiAgc3RhdGljIGxvZ1J1bnRpbWVEZXByZWNhdGlvbihvcHRpb25zKSB7XG4gICAgRGVwcmVjYXRvci5fbG9nR2VuZXJpYyhvcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBkZXByZWNhdGlvbiBkZWZpbml0aW9ucy5cbiAgICogQHJldHVybnMge0FycmF5PE9iamVjdD59IFRoZSBkZXByZWNhdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgX2dldERlcHJlY2F0aW9ucygpIHtcbiAgICByZXR1cm4gRGVwcmVjYXRpb25zO1xuICB9XG5cbiAgLyoqXG4gICAqIExvZ3MgYSBnZW5lcmljIGRlcHJlY2F0aW9uIHdhcm5pbmcuXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBkZXByZWNhdGlvbiBvcHRpb25zLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9ucy51c2FnZSBUaGUgdXNhZ2UgdGhhdCBpcyBkZXByZWNhdGVkLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMuc29sdXRpb25dIFRoZSBpbnN0cnVjdGlvbiB0byByZXNvbHZlIHRoaXMgZGVwcmVjYXRpb24gd2FybmluZy5cbiAgICogT3B0aW9uYWwuIEl0IGlzIHJlY29tbWVuZGVkIHRvIGFkZCBhbiBpbnN0cnVjdGlvbiBmb3IgdGhlIGNvbnZlbmllbmNlIG9mIHRoZSBkZXZlbG9wZXIuXG4gICAqL1xuICBzdGF0aWMgX2xvZ0dlbmVyaWMoeyB1c2FnZSwgc29sdXRpb24gfSkge1xuICAgIC8vIENvbXBvc2UgbWVzc2FnZVxuICAgIGxldCBvdXRwdXQgPSBgRGVwcmVjYXRpb25XYXJuaW5nOiAke3VzYWdlfSBpcyBkZXByZWNhdGVkIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gYSBmdXR1cmUgdmVyc2lvbi5gO1xuICAgIG91dHB1dCArPSBzb2x1dGlvbiA/IGAgJHtzb2x1dGlvbn1gIDogJyc7XG4gICAgbG9nZ2VyLndhcm4ob3V0cHV0KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2dzIGEgZGVwcmVjYXRpb24gd2FybmluZyBmb3IgYSBQYXJzZSBTZXJ2ZXIgb3B0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9uS2V5IFRoZSBvcHRpb24ga2V5IGluY2wuIGl0cyBwYXRoLCBlLmcuIGBzZWN1cml0eS5lbmFibGVDaGVja2AuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBlbnZLZXkgVGhlIGVudmlyb25tZW50IGtleSwgZS5nLiBgUEFSU0VfU0VSVkVSX1NFQ1VSSVRZYC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGNoYW5nZU5ld0tleSBTZXQgdGhlIG5ldyBrZXkgbmFtZSBpZiB0aGUgY3VycmVudCBrZXkgd2lsbCBiZSByZXBsYWNlZCxcbiAgICogb3Igc2V0IHRvIGFuIGVtcHR5IHN0cmluZyBpZiB0aGUgY3VycmVudCBrZXkgd2lsbCBiZSByZW1vdmVkIHdpdGhvdXQgcmVwbGFjZW1lbnQuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjaGFuZ2VOZXdEZWZhdWx0IFNldCB0aGUgbmV3IGRlZmF1bHQgdmFsdWUgaWYgdGhlIGtleSdzIGRlZmF1bHQgdmFsdWVcbiAgICogd2lsbCBjaGFuZ2UgaW4gYSBmdXR1cmUgdmVyc2lvbi5cbiAgICogQHBhcmFtIHtTdHJpbmd9IFtzb2x1dGlvbl0gVGhlIGluc3RydWN0aW9uIHRvIHJlc29sdmUgdGhpcyBkZXByZWNhdGlvbiB3YXJuaW5nLiBUaGlzXG4gICAqIG1lc3NhZ2UgbXVzdCBub3QgaW5jbHVkZSB0aGUgd2FybmluZyB0aGF0IHRoZSBwYXJhbWV0ZXIgaXMgZGVwcmVjYXRlZCwgdGhhdCBpc1xuICAgKiBhdXRvbWF0aWNhbGx5IGFkZGVkIHRvIHRoZSBtZXNzYWdlLiBJdCBzaG91bGQgb25seSBjb250YWluIHRoZSBpbnN0cnVjdGlvbiBvbiBob3dcbiAgICogdG8gcmVzb2x2ZSB0aGlzIHdhcm5pbmcuXG4gICAqL1xuICBzdGF0aWMgX2xvZ09wdGlvbih7IG9wdGlvbktleSwgZW52S2V5LCBjaGFuZ2VOZXdLZXksIGNoYW5nZU5ld0RlZmF1bHQsIHNvbHV0aW9uIH0pIHtcbiAgICBjb25zdCB0eXBlID0gb3B0aW9uS2V5ID8gJ29wdGlvbicgOiAnZW52aXJvbm1lbnQga2V5JztcbiAgICBjb25zdCBrZXkgPSBvcHRpb25LZXkgPyBvcHRpb25LZXkgOiBlbnZLZXk7XG4gICAgY29uc3Qga2V5QWN0aW9uID1cbiAgICAgIGNoYW5nZU5ld0tleSA9PSBudWxsXG4gICAgICAgID8gdW5kZWZpbmVkXG4gICAgICAgIDogY2hhbmdlTmV3S2V5Lmxlbmd0aCA+IDBcbiAgICAgICAgICA/IGByZW5hbWVkIHRvICcke2NoYW5nZU5ld0tleX0nYFxuICAgICAgICAgIDogYHJlbW92ZWRgO1xuXG4gICAgLy8gQ29tcG9zZSBtZXNzYWdlXG4gICAgbGV0IG91dHB1dCA9IGBEZXByZWNhdGlvbldhcm5pbmc6IFRoZSBQYXJzZSBTZXJ2ZXIgJHt0eXBlfSAnJHtrZXl9JyBgO1xuICAgIG91dHB1dCArPSBjaGFuZ2VOZXdLZXkgPyBgaXMgZGVwcmVjYXRlZCBhbmQgd2lsbCBiZSAke2tleUFjdGlvbn0gaW4gYSBmdXR1cmUgdmVyc2lvbi5gIDogJyc7XG4gICAgb3V0cHV0ICs9IGNoYW5nZU5ld0RlZmF1bHRcbiAgICAgID8gYGRlZmF1bHQgd2lsbCBjaGFuZ2UgdG8gJyR7Y2hhbmdlTmV3RGVmYXVsdH0nIGluIGEgZnV0dXJlIHZlcnNpb24uYFxuICAgICAgOiAnJztcbiAgICBvdXRwdXQgKz0gc29sdXRpb24gPyBgICR7c29sdXRpb259YCA6ICcnO1xuICAgIGxvZ2dlci53YXJuKG91dHB1dCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEZXByZWNhdG9yO1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQUFBLE9BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLGFBQUEsR0FBQUYs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