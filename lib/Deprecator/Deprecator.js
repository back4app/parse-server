"use strict";

var _logger = _interopRequireDefault(require("../logger"));
var _Deprecations = _interopRequireDefault(require("./Deprecations"));
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
      if (changeNewDefault != null && options[optionKey] == null) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfRGVwcmVjYXRpb25zIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJvcHRpb25zIiwiZGVwcmVjYXRpb24iLCJfZ2V0RGVwcmVjYXRpb25zIiwic29sdXRpb24iLCJvcHRpb25LZXkiLCJjaGFuZ2VOZXdEZWZhdWx0IiwiX2xvZ09wdGlvbiIsImxvZ1J1bnRpbWVEZXByZWNhdGlvbiIsIl9sb2dHZW5lcmljIiwiRGVwcmVjYXRpb25zIiwidXNhZ2UiLCJvdXRwdXQiLCJsb2dnZXIiLCJ3YXJuIiwiZW52S2V5IiwiY2hhbmdlTmV3S2V5IiwidHlwZSIsImtleSIsImtleUFjdGlvbiIsInVuZGVmaW5lZCIsImxlbmd0aCIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvRGVwcmVjYXRvci9EZXByZWNhdG9yLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBEZXByZWNhdGlvbnMgZnJvbSAnLi9EZXByZWNhdGlvbnMnO1xuXG4vKipcbiAqIFRoZSBkZXByZWNhdG9yIGNsYXNzLlxuICovXG5jbGFzcyBEZXByZWNhdG9yIHtcbiAgLyoqXG4gICAqIFNjYW5zIHRoZSBQYXJzZSBTZXJ2ZXIgZm9yIGRlcHJlY2F0ZWQgb3B0aW9ucy5cbiAgICogVGhpcyBuZWVkcyB0byBiZSBjYWxsZWQgYmVmb3JlIHNldHRpbmcgb3B0aW9uIGRlZmF1bHRzLCBvdGhlcndpc2UgaXRcbiAgICogYmVjb21lcyBpbmRpc3Rpbmd1aXNoYWJsZSB3aGV0aGVyIGFuIG9wdGlvbiBoYXMgYmVlbiBzZXQgbWFudWFsbHkgb3JcbiAgICogYnkgZGVmYXVsdC5cbiAgICogQHBhcmFtIHthbnl9IG9wdGlvbnMgVGhlIFBhcnNlIFNlcnZlciBvcHRpb25zLlxuICAgKi9cbiAgc3RhdGljIHNjYW5QYXJzZVNlcnZlck9wdGlvbnMob3B0aW9ucykge1xuICAgIC8vIFNjYW4gZm9yIGRlcHJlY2F0aW9uc1xuICAgIGZvciAoY29uc3QgZGVwcmVjYXRpb24gb2YgRGVwcmVjYXRvci5fZ2V0RGVwcmVjYXRpb25zKCkpIHtcbiAgICAgIC8vIEdldCBkZXByZWNhdGlvbiBwcm9wZXJ0aWVzXG4gICAgICBjb25zdCBzb2x1dGlvbiA9IGRlcHJlY2F0aW9uLnNvbHV0aW9uO1xuICAgICAgY29uc3Qgb3B0aW9uS2V5ID0gZGVwcmVjYXRpb24ub3B0aW9uS2V5O1xuICAgICAgY29uc3QgY2hhbmdlTmV3RGVmYXVsdCA9IGRlcHJlY2F0aW9uLmNoYW5nZU5ld0RlZmF1bHQ7XG5cbiAgICAgIC8vIElmIGRlZmF1bHQgd2lsbCBjaGFuZ2UsIG9ubHkgdGhyb3cgYSB3YXJuaW5nIGlmIG9wdGlvbiBpcyBub3Qgc2V0XG4gICAgICBpZiAoY2hhbmdlTmV3RGVmYXVsdCAhPSBudWxsICYmIG9wdGlvbnNbb3B0aW9uS2V5XSA9PSBudWxsKSB7XG4gICAgICAgIERlcHJlY2F0b3IuX2xvZ09wdGlvbih7IG9wdGlvbktleSwgY2hhbmdlTmV3RGVmYXVsdCwgc29sdXRpb24gfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIExvZ3MgYSBkZXByZWNhdGlvbiB3YXJuaW5nIGZvciBhIHBhcmFtZXRlciB0aGF0IGNhbiBvbmx5IGJlIGRldGVybWluZWQgZHluYW1pY2FsbHlcbiAgICogZHVyaW5nIHJ1bnRpbWUuXG4gICAqXG4gICAqIE5vdGU6IERvIG5vdCB1c2UgdGhpcyB0byBsb2cgZGVwcmVjYXRpb25zIG9mIFBhcnNlIFNlcnZlciBvcHRpb25zLCBidXQgYWRkIHN1Y2hcbiAgICogZGVwcmVjYXRpb25zIHRvIGBEZXByZWNhdGlvbnMuanNgIGluc3RlYWQuIFNlZSB0aGUgY29udHJpYnV0aW9uIGRvY3MgZm9yIG1vcmVcbiAgICogZGV0YWlscy5cbiAgICpcbiAgICogRm9yIGNvbnNpc3RlbmN5LCB0aGUgZGVwcmVjYXRpb24gd2FybmluZyBpcyBjb21wb3NlZCBvZiB0aGUgZm9sbG93aW5nIHBhcnRzOlxuICAgKlxuICAgKiA+IERlcHJlY2F0aW9uV2FybmluZzogYHVzYWdlYCBpcyBkZXByZWNhdGVkIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gYSBmdXR1cmUgdmVyc2lvbi5cbiAgICogYHNvbHV0aW9uYC5cbiAgICpcbiAgICogLSBgdXNhZ2VgOiBUaGUgZGVwcmVjYXRlZCB1c2FnZS5cbiAgICogLSBgc29sdXRpb25gOiBUaGUgaW5zdHJ1Y3Rpb24gdG8gcmVzb2x2ZSB0aGlzIGRlcHJlY2F0aW9uIHdhcm5pbmcuXG4gICAqXG4gICAqIEZvciBleGFtcGxlOlxuICAgKiA+IERlcHJlY2F0aW9uV2FybmluZzogYFByZWZpeGluZyBmaWVsZCBuYW1lcyB3aXRoIGRvbGxhciBzaWduICgkKSBpbiBhZ2dyZWdhdGlvbiBxdWVyeWBcbiAgICogaXMgZGVwcmVjYXRlZCBhbmQgd2lsbCBiZSByZW1vdmVkIGluIGEgZnV0dXJlIHZlcnNpb24uIGBSZWZlcmVuY2UgZmllbGQgbmFtZXMgd2l0aG91dFxuICAgKiBkb2xsYXIgc2lnbiBwcmVmaXguYFxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBUaGUgZGVwcmVjYXRpb24gb3B0aW9ucy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMudXNhZ2UgVGhlIHVzYWdlIHRoYXQgaXMgZGVwcmVjYXRlZC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IFtvcHRpb25zLnNvbHV0aW9uXSBUaGUgaW5zdHJ1Y3Rpb24gdG8gcmVzb2x2ZSB0aGlzIGRlcHJlY2F0aW9uIHdhcm5pbmcuXG4gICAqIE9wdGlvbmFsLiBJdCBpcyByZWNvbW1lbmRlZCB0byBhZGQgYW4gaW5zdHJ1Y3Rpb24gZm9yIHRoZSBjb252ZW5pZW5jZSBvZiB0aGUgZGV2ZWxvcGVyLlxuICAgKi9cbiAgc3RhdGljIGxvZ1J1bnRpbWVEZXByZWNhdGlvbihvcHRpb25zKSB7XG4gICAgRGVwcmVjYXRvci5fbG9nR2VuZXJpYyhvcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBkZXByZWNhdGlvbiBkZWZpbml0aW9ucy5cbiAgICogQHJldHVybnMge0FycmF5PE9iamVjdD59IFRoZSBkZXByZWNhdGlvbnMuXG4gICAqL1xuICBzdGF0aWMgX2dldERlcHJlY2F0aW9ucygpIHtcbiAgICByZXR1cm4gRGVwcmVjYXRpb25zO1xuICB9XG5cbiAgLyoqXG4gICAqIExvZ3MgYSBnZW5lcmljIGRlcHJlY2F0aW9uIHdhcm5pbmcuXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBkZXByZWNhdGlvbiBvcHRpb25zLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9ucy51c2FnZSBUaGUgdXNhZ2UgdGhhdCBpcyBkZXByZWNhdGVkLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW29wdGlvbnMuc29sdXRpb25dIFRoZSBpbnN0cnVjdGlvbiB0byByZXNvbHZlIHRoaXMgZGVwcmVjYXRpb24gd2FybmluZy5cbiAgICogT3B0aW9uYWwuIEl0IGlzIHJlY29tbWVuZGVkIHRvIGFkZCBhbiBpbnN0cnVjdGlvbiBmb3IgdGhlIGNvbnZlbmllbmNlIG9mIHRoZSBkZXZlbG9wZXIuXG4gICAqL1xuICBzdGF0aWMgX2xvZ0dlbmVyaWMoeyB1c2FnZSwgc29sdXRpb24gfSkge1xuICAgIC8vIENvbXBvc2UgbWVzc2FnZVxuICAgIGxldCBvdXRwdXQgPSBgRGVwcmVjYXRpb25XYXJuaW5nOiAke3VzYWdlfSBpcyBkZXByZWNhdGVkIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gYSBmdXR1cmUgdmVyc2lvbi5gO1xuICAgIG91dHB1dCArPSBzb2x1dGlvbiA/IGAgJHtzb2x1dGlvbn1gIDogJyc7XG4gICAgbG9nZ2VyLndhcm4ob3V0cHV0KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2dzIGEgZGVwcmVjYXRpb24gd2FybmluZyBmb3IgYSBQYXJzZSBTZXJ2ZXIgb3B0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9uS2V5IFRoZSBvcHRpb24ga2V5IGluY2wuIGl0cyBwYXRoLCBlLmcuIGBzZWN1cml0eS5lbmFibGVDaGVja2AuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBlbnZLZXkgVGhlIGVudmlyb25tZW50IGtleSwgZS5nLiBgUEFSU0VfU0VSVkVSX1NFQ1VSSVRZYC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGNoYW5nZU5ld0tleSBTZXQgdGhlIG5ldyBrZXkgbmFtZSBpZiB0aGUgY3VycmVudCBrZXkgd2lsbCBiZSByZXBsYWNlZCxcbiAgICogb3Igc2V0IHRvIGFuIGVtcHR5IHN0cmluZyBpZiB0aGUgY3VycmVudCBrZXkgd2lsbCBiZSByZW1vdmVkIHdpdGhvdXQgcmVwbGFjZW1lbnQuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjaGFuZ2VOZXdEZWZhdWx0IFNldCB0aGUgbmV3IGRlZmF1bHQgdmFsdWUgaWYgdGhlIGtleSdzIGRlZmF1bHQgdmFsdWVcbiAgICogd2lsbCBjaGFuZ2UgaW4gYSBmdXR1cmUgdmVyc2lvbi5cbiAgICogQHBhcmFtIHtTdHJpbmd9IFtzb2x1dGlvbl0gVGhlIGluc3RydWN0aW9uIHRvIHJlc29sdmUgdGhpcyBkZXByZWNhdGlvbiB3YXJuaW5nLiBUaGlzXG4gICAqIG1lc3NhZ2UgbXVzdCBub3QgaW5jbHVkZSB0aGUgd2FybmluZyB0aGF0IHRoZSBwYXJhbWV0ZXIgaXMgZGVwcmVjYXRlZCwgdGhhdCBpc1xuICAgKiBhdXRvbWF0aWNhbGx5IGFkZGVkIHRvIHRoZSBtZXNzYWdlLiBJdCBzaG91bGQgb25seSBjb250YWluIHRoZSBpbnN0cnVjdGlvbiBvbiBob3dcbiAgICogdG8gcmVzb2x2ZSB0aGlzIHdhcm5pbmcuXG4gICAqL1xuICBzdGF0aWMgX2xvZ09wdGlvbih7IG9wdGlvbktleSwgZW52S2V5LCBjaGFuZ2VOZXdLZXksIGNoYW5nZU5ld0RlZmF1bHQsIHNvbHV0aW9uIH0pIHtcbiAgICBjb25zdCB0eXBlID0gb3B0aW9uS2V5ID8gJ29wdGlvbicgOiAnZW52aXJvbm1lbnQga2V5JztcbiAgICBjb25zdCBrZXkgPSBvcHRpb25LZXkgPyBvcHRpb25LZXkgOiBlbnZLZXk7XG4gICAgY29uc3Qga2V5QWN0aW9uID1cbiAgICAgIGNoYW5nZU5ld0tleSA9PSBudWxsXG4gICAgICAgID8gdW5kZWZpbmVkXG4gICAgICAgIDogY2hhbmdlTmV3S2V5Lmxlbmd0aCA+IDBcbiAgICAgICAgICA/IGByZW5hbWVkIHRvICcke2NoYW5nZU5ld0tleX0nYFxuICAgICAgICAgIDogYHJlbW92ZWRgO1xuXG4gICAgLy8gQ29tcG9zZSBtZXNzYWdlXG4gICAgbGV0IG91dHB1dCA9IGBEZXByZWNhdGlvbldhcm5pbmc6IFRoZSBQYXJzZSBTZXJ2ZXIgJHt0eXBlfSAnJHtrZXl9JyBgO1xuICAgIG91dHB1dCArPSBjaGFuZ2VOZXdLZXkgPyBgaXMgZGVwcmVjYXRlZCBhbmQgd2lsbCBiZSAke2tleUFjdGlvbn0gaW4gYSBmdXR1cmUgdmVyc2lvbi5gIDogJyc7XG4gICAgb3V0cHV0ICs9IGNoYW5nZU5ld0RlZmF1bHRcbiAgICAgID8gYGRlZmF1bHQgd2lsbCBjaGFuZ2UgdG8gJyR7Y2hhbmdlTmV3RGVmYXVsdH0nIGluIGEgZnV0dXJlIHZlcnNpb24uYFxuICAgICAgOiAnJztcbiAgICBvdXRwdXQgKz0gc29sdXRpb24gPyBgICR7c29sdXRpb259YCA6ICcnO1xuICAgIGxvZ2dlci53YXJuKG91dHB1dCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEZXByZWNhdG9yO1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQUFBLE9BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLGFBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUEwQyxTQUFBRCx1QkFBQUcsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9B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