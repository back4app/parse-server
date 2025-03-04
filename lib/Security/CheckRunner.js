"use strict";

var _Utils = _interopRequireDefault(require("../Utils"));
var _Check = require("./Check");
var CheckGroups = _interopRequireWildcard(require("./CheckGroups/CheckGroups"));
var _logger = _interopRequireDefault(require("../logger"));
var _lodash = require("lodash");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * The security check runner.
 * @memberof module:SecurityCheck
 */
class CheckRunner {
  /**
   * The security check runner.
   * @param {Object} [config] The configuration options.
   * @param {Boolean} [config.enableCheck=false] Is true if Parse Server should report weak security settings.
   * @param {Boolean} [config.enableCheckLog=false] Is true if the security check report should be written to logs.
   * @param {Object} [config.checkGroups] The check groups to run. Default are the groups defined in `./CheckGroups/CheckGroups.js`.
   */
  constructor(config = {}) {
    this._validateParams(config);
    const {
      enableCheck = false,
      enableCheckLog = false,
      checkGroups = CheckGroups
    } = config;
    this.enableCheck = enableCheck;
    this.enableCheckLog = enableCheckLog;
    this.checkGroups = checkGroups;
  }

  /**
   * Runs all security checks and returns the results.
   * @params
   * @returns {Object} The security check report.
   */
  async run({
    version = '1.0.0'
  } = {}) {
    // Instantiate check groups
    const groups = Object.values(this.checkGroups).filter(c => typeof c === 'function').map(CheckGroup => new CheckGroup());

    // Run checks
    groups.forEach(group => group.run());

    // Generate JSON report
    const report = this._generateReport({
      groups,
      version
    });

    // If report should be written to logs
    if (this.enableCheckLog) {
      this._logReport(report);
    }
    return report;
  }

  /**
   * Generates a security check report in JSON format with schema:
   * ```
   * {
   *    report: {
   *      version: "1.0.0", // The report version, defines the schema
   *      state: "fail"     // The disjunctive indicator of failed checks in all groups.
   *      groups: [         // The check groups
   *        {
   *          name: "House",            // The group name
   *          state: "fail"             // The disjunctive indicator of failed checks in this group.
   *          checks: [                 // The checks
   *            title: "Door locked",   // The check title
   *            state: "fail"           // The check state
   *            warning: "Anyone can enter your house."   // The warning.
   *            solution: "Lock your door."               // The solution.
   *          ]
   *        },
   *        ...
   *      ]
   *    }
   * }
   * ```
   * @param {Object} params The parameters.
   * @param {Array<CheckGroup>} params.groups The check groups.
   * @param {String} params.version: The report schema version.
   * @returns {Object} The report.
   */
  _generateReport({
    groups,
    version
  }) {
    // Create report template
    const report = {
      report: {
        version,
        state: _Check.CheckState.success,
        groups: []
      }
    };

    // Identify report version
    switch (version) {
      case '1.0.0':
      default:
        // For each check group
        for (const group of groups) {
          // Create group report
          const groupReport = {
            name: group.name(),
            state: _Check.CheckState.success,
            checks: []
          };

          // Create check reports
          groupReport.checks = group.checks().map(check => {
            const checkReport = {
              title: check.title,
              state: check.checkState()
            };
            if (check.checkState() == _Check.CheckState.fail) {
              checkReport.warning = check.warning;
              checkReport.solution = check.solution;
              report.report.state = _Check.CheckState.fail;
              groupReport.state = _Check.CheckState.fail;
            }
            return checkReport;
          });
          report.report.groups.push(groupReport);
        }
    }
    return report;
  }

  /**
   * Logs the security check report.
   * @param {Object} report The report to log.
   */
  _logReport(report) {
    // Determine log level depending on whether any check failed
    const log = report.report.state == _Check.CheckState.success ? s => _logger.default.info(s) : s => _logger.default.warn(s);

    // Declare output
    const indent = '   ';
    let output = '';
    let checksCount = 0;
    let failedChecksCount = 0;
    let skippedCheckCount = 0;

    // Traverse all groups and checks for compose output
    for (const group of report.report.groups) {
      output += `\n- ${group.name}`;
      for (const check of group.checks) {
        checksCount++;
        output += `\n${indent}${this._getLogIconForState(check.state)} ${check.title}`;
        if (check.state == _Check.CheckState.fail) {
          failedChecksCount++;
          output += `\n${indent}${indent}Warning: ${check.warning}`;
          output += ` ${check.solution}`;
        } else if (check.state == _Check.CheckState.none) {
          skippedCheckCount++;
          output += `\n${indent}${indent}Test did not execute, this is likely an internal server issue, please report.`;
        }
      }
    }
    output = `\n###################################` + `\n#                                 #` + `\n#   Parse Server Security Check   #` + `\n#                                 #` + `\n###################################` + `\n` + `\n${failedChecksCount > 0 ? 'Warning: ' : ''}${failedChecksCount} weak security setting(s) found${failedChecksCount > 0 ? '!' : ''}` + `\n${checksCount} check(s) executed` + `\n${skippedCheckCount} check(s) skipped` + `\n` + `${output}`;

    // Write log
    log(output);
  }

  /**
   * Returns an icon for use in the report log output.
   * @param {CheckState} state The check state.
   * @returns {String} The icon.
   */
  _getLogIconForState(state) {
    switch (state) {
      case _Check.CheckState.success:
        return '✅';
      case _Check.CheckState.fail:
        return '❌';
      default:
        return 'ℹ️';
    }
  }

  /**
   * Validates the constructor parameters.
   * @param {Object} params The parameters to validate.
   */
  _validateParams(params) {
    _Utils.default.validateParams(params, {
      enableCheck: {
        t: 'boolean',
        v: _lodash.isBoolean,
        o: true
      },
      enableCheckLog: {
        t: 'boolean',
        v: _lodash.isBoolean,
        o: true
      },
      checkGroups: {
        t: 'array',
        v: _lodash.isArray,
        o: true
      }
    });
  }
}
module.exports = CheckRunner;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfVXRpbHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9DaGVjayIsIkNoZWNrR3JvdXBzIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJfbG9nZ2VyIiwiX2xvZGFzaCIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIkNoZWNrUnVubmVyIiwiY29uc3RydWN0b3IiLCJjb25maWciLCJfdmFsaWRhdGVQYXJhbXMiLCJlbmFibGVDaGVjayIsImVuYWJsZUNoZWNrTG9nIiwiY2hlY2tHcm91cHMiLCJydW4iLCJ2ZXJzaW9uIiwiZ3JvdXBzIiwidmFsdWVzIiwiZmlsdGVyIiwiYyIsIm1hcCIsIkNoZWNrR3JvdXAiLCJmb3JFYWNoIiwiZ3JvdXAiLCJyZXBvcnQiLCJfZ2VuZXJhdGVSZXBvcnQiLCJfbG9nUmVwb3J0Iiwic3RhdGUiLCJDaGVja1N0YXRlIiwic3VjY2VzcyIsImdyb3VwUmVwb3J0IiwibmFtZSIsImNoZWNrcyIsImNoZWNrIiwiY2hlY2tSZXBvcnQiLCJ0aXRsZSIsImNoZWNrU3RhdGUiLCJmYWlsIiwid2FybmluZyIsInNvbHV0aW9uIiwicHVzaCIsImxvZyIsInMiLCJsb2dnZXIiLCJpbmZvIiwid2FybiIsImluZGVudCIsIm91dHB1dCIsImNoZWNrc0NvdW50IiwiZmFpbGVkQ2hlY2tzQ291bnQiLCJza2lwcGVkQ2hlY2tDb3VudCIsIl9nZXRMb2dJY29uRm9yU3RhdGUiLCJub25lIiwicGFyYW1zIiwiVXRpbHMiLCJ2YWxpZGF0ZVBhcmFtcyIsInYiLCJpc0Jvb2xlYW4iLCJvIiwiaXNBcnJheSIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvU2VjdXJpdHkvQ2hlY2tSdW5uZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCB7IENoZWNrU3RhdGUgfSBmcm9tICcuL0NoZWNrJztcbmltcG9ydCAqIGFzIENoZWNrR3JvdXBzIGZyb20gJy4vQ2hlY2tHcm91cHMvQ2hlY2tHcm91cHMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IHsgaXNBcnJheSwgaXNCb29sZWFuIH0gZnJvbSAnbG9kYXNoJztcblxuLyoqXG4gKiBUaGUgc2VjdXJpdHkgY2hlY2sgcnVubmVyLlxuICogQG1lbWJlcm9mIG1vZHVsZTpTZWN1cml0eUNoZWNrXG4gKi9cbmNsYXNzIENoZWNrUnVubmVyIHtcbiAgLyoqXG4gICAqIFRoZSBzZWN1cml0eSBjaGVjayBydW5uZXIuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbY29uZmlnXSBUaGUgY29uZmlndXJhdGlvbiBvcHRpb25zLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtjb25maWcuZW5hYmxlQ2hlY2s9ZmFsc2VdIElzIHRydWUgaWYgUGFyc2UgU2VydmVyIHNob3VsZCByZXBvcnQgd2VhayBzZWN1cml0eSBzZXR0aW5ncy5cbiAgICogQHBhcmFtIHtCb29sZWFufSBbY29uZmlnLmVuYWJsZUNoZWNrTG9nPWZhbHNlXSBJcyB0cnVlIGlmIHRoZSBzZWN1cml0eSBjaGVjayByZXBvcnQgc2hvdWxkIGJlIHdyaXR0ZW4gdG8gbG9ncy5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtjb25maWcuY2hlY2tHcm91cHNdIFRoZSBjaGVjayBncm91cHMgdG8gcnVuLiBEZWZhdWx0IGFyZSB0aGUgZ3JvdXBzIGRlZmluZWQgaW4gYC4vQ2hlY2tHcm91cHMvQ2hlY2tHcm91cHMuanNgLlxuICAgKi9cbiAgY29uc3RydWN0b3IoY29uZmlnID0ge30pIHtcbiAgICB0aGlzLl92YWxpZGF0ZVBhcmFtcyhjb25maWcpO1xuICAgIGNvbnN0IHsgZW5hYmxlQ2hlY2sgPSBmYWxzZSwgZW5hYmxlQ2hlY2tMb2cgPSBmYWxzZSwgY2hlY2tHcm91cHMgPSBDaGVja0dyb3VwcyB9ID0gY29uZmlnO1xuICAgIHRoaXMuZW5hYmxlQ2hlY2sgPSBlbmFibGVDaGVjaztcbiAgICB0aGlzLmVuYWJsZUNoZWNrTG9nID0gZW5hYmxlQ2hlY2tMb2c7XG4gICAgdGhpcy5jaGVja0dyb3VwcyA9IGNoZWNrR3JvdXBzO1xuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgYWxsIHNlY3VyaXR5IGNoZWNrcyBhbmQgcmV0dXJucyB0aGUgcmVzdWx0cy5cbiAgICogQHBhcmFtc1xuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgc2VjdXJpdHkgY2hlY2sgcmVwb3J0LlxuICAgKi9cbiAgYXN5bmMgcnVuKHsgdmVyc2lvbiA9ICcxLjAuMCcgfSA9IHt9KSB7XG4gICAgLy8gSW5zdGFudGlhdGUgY2hlY2sgZ3JvdXBzXG4gICAgY29uc3QgZ3JvdXBzID0gT2JqZWN0LnZhbHVlcyh0aGlzLmNoZWNrR3JvdXBzKVxuICAgICAgLmZpbHRlcihjID0+IHR5cGVvZiBjID09PSAnZnVuY3Rpb24nKVxuICAgICAgLm1hcChDaGVja0dyb3VwID0+IG5ldyBDaGVja0dyb3VwKCkpO1xuXG4gICAgLy8gUnVuIGNoZWNrc1xuICAgIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IGdyb3VwLnJ1bigpKTtcblxuICAgIC8vIEdlbmVyYXRlIEpTT04gcmVwb3J0XG4gICAgY29uc3QgcmVwb3J0ID0gdGhpcy5fZ2VuZXJhdGVSZXBvcnQoeyBncm91cHMsIHZlcnNpb24gfSk7XG5cbiAgICAvLyBJZiByZXBvcnQgc2hvdWxkIGJlIHdyaXR0ZW4gdG8gbG9nc1xuICAgIGlmICh0aGlzLmVuYWJsZUNoZWNrTG9nKSB7XG4gICAgICB0aGlzLl9sb2dSZXBvcnQocmVwb3J0KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcG9ydDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZXMgYSBzZWN1cml0eSBjaGVjayByZXBvcnQgaW4gSlNPTiBmb3JtYXQgd2l0aCBzY2hlbWE6XG4gICAqIGBgYFxuICAgKiB7XG4gICAqICAgIHJlcG9ydDoge1xuICAgKiAgICAgIHZlcnNpb246IFwiMS4wLjBcIiwgLy8gVGhlIHJlcG9ydCB2ZXJzaW9uLCBkZWZpbmVzIHRoZSBzY2hlbWFcbiAgICogICAgICBzdGF0ZTogXCJmYWlsXCIgICAgIC8vIFRoZSBkaXNqdW5jdGl2ZSBpbmRpY2F0b3Igb2YgZmFpbGVkIGNoZWNrcyBpbiBhbGwgZ3JvdXBzLlxuICAgKiAgICAgIGdyb3VwczogWyAgICAgICAgIC8vIFRoZSBjaGVjayBncm91cHNcbiAgICogICAgICAgIHtcbiAgICogICAgICAgICAgbmFtZTogXCJIb3VzZVwiLCAgICAgICAgICAgIC8vIFRoZSBncm91cCBuYW1lXG4gICAqICAgICAgICAgIHN0YXRlOiBcImZhaWxcIiAgICAgICAgICAgICAvLyBUaGUgZGlzanVuY3RpdmUgaW5kaWNhdG9yIG9mIGZhaWxlZCBjaGVja3MgaW4gdGhpcyBncm91cC5cbiAgICogICAgICAgICAgY2hlY2tzOiBbICAgICAgICAgICAgICAgICAvLyBUaGUgY2hlY2tzXG4gICAqICAgICAgICAgICAgdGl0bGU6IFwiRG9vciBsb2NrZWRcIiwgICAvLyBUaGUgY2hlY2sgdGl0bGVcbiAgICogICAgICAgICAgICBzdGF0ZTogXCJmYWlsXCIgICAgICAgICAgIC8vIFRoZSBjaGVjayBzdGF0ZVxuICAgKiAgICAgICAgICAgIHdhcm5pbmc6IFwiQW55b25lIGNhbiBlbnRlciB5b3VyIGhvdXNlLlwiICAgLy8gVGhlIHdhcm5pbmcuXG4gICAqICAgICAgICAgICAgc29sdXRpb246IFwiTG9jayB5b3VyIGRvb3IuXCIgICAgICAgICAgICAgICAvLyBUaGUgc29sdXRpb24uXG4gICAqICAgICAgICAgIF1cbiAgICogICAgICAgIH0sXG4gICAqICAgICAgICAuLi5cbiAgICogICAgICBdXG4gICAqICAgIH1cbiAgICogfVxuICAgKiBgYGBcbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtBcnJheTxDaGVja0dyb3VwPn0gcGFyYW1zLmdyb3VwcyBUaGUgY2hlY2sgZ3JvdXBzLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGFyYW1zLnZlcnNpb246IFRoZSByZXBvcnQgc2NoZW1hIHZlcnNpb24uXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSByZXBvcnQuXG4gICAqL1xuICBfZ2VuZXJhdGVSZXBvcnQoeyBncm91cHMsIHZlcnNpb24gfSkge1xuICAgIC8vIENyZWF0ZSByZXBvcnQgdGVtcGxhdGVcbiAgICBjb25zdCByZXBvcnQgPSB7XG4gICAgICByZXBvcnQ6IHtcbiAgICAgICAgdmVyc2lvbixcbiAgICAgICAgc3RhdGU6IENoZWNrU3RhdGUuc3VjY2VzcyxcbiAgICAgICAgZ3JvdXBzOiBbXSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIElkZW50aWZ5IHJlcG9ydCB2ZXJzaW9uXG4gICAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gICAgICBjYXNlICcxLjAuMCc6XG4gICAgICBkZWZhdWx0OlxuICAgICAgICAvLyBGb3IgZWFjaCBjaGVjayBncm91cFxuICAgICAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuICAgICAgICAgIC8vIENyZWF0ZSBncm91cCByZXBvcnRcbiAgICAgICAgICBjb25zdCBncm91cFJlcG9ydCA9IHtcbiAgICAgICAgICAgIG5hbWU6IGdyb3VwLm5hbWUoKSxcbiAgICAgICAgICAgIHN0YXRlOiBDaGVja1N0YXRlLnN1Y2Nlc3MsXG4gICAgICAgICAgICBjaGVja3M6IFtdLFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICAvLyBDcmVhdGUgY2hlY2sgcmVwb3J0c1xuICAgICAgICAgIGdyb3VwUmVwb3J0LmNoZWNrcyA9IGdyb3VwLmNoZWNrcygpLm1hcChjaGVjayA9PiB7XG4gICAgICAgICAgICBjb25zdCBjaGVja1JlcG9ydCA9IHtcbiAgICAgICAgICAgICAgdGl0bGU6IGNoZWNrLnRpdGxlLFxuICAgICAgICAgICAgICBzdGF0ZTogY2hlY2suY2hlY2tTdGF0ZSgpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChjaGVjay5jaGVja1N0YXRlKCkgPT0gQ2hlY2tTdGF0ZS5mYWlsKSB7XG4gICAgICAgICAgICAgIGNoZWNrUmVwb3J0Lndhcm5pbmcgPSBjaGVjay53YXJuaW5nO1xuICAgICAgICAgICAgICBjaGVja1JlcG9ydC5zb2x1dGlvbiA9IGNoZWNrLnNvbHV0aW9uO1xuICAgICAgICAgICAgICByZXBvcnQucmVwb3J0LnN0YXRlID0gQ2hlY2tTdGF0ZS5mYWlsO1xuICAgICAgICAgICAgICBncm91cFJlcG9ydC5zdGF0ZSA9IENoZWNrU3RhdGUuZmFpbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjaGVja1JlcG9ydDtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHJlcG9ydC5yZXBvcnQuZ3JvdXBzLnB1c2goZ3JvdXBSZXBvcnQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXBvcnQ7XG4gIH1cblxuICAvKipcbiAgICogTG9ncyB0aGUgc2VjdXJpdHkgY2hlY2sgcmVwb3J0LlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVwb3J0IFRoZSByZXBvcnQgdG8gbG9nLlxuICAgKi9cbiAgX2xvZ1JlcG9ydChyZXBvcnQpIHtcbiAgICAvLyBEZXRlcm1pbmUgbG9nIGxldmVsIGRlcGVuZGluZyBvbiB3aGV0aGVyIGFueSBjaGVjayBmYWlsZWRcbiAgICBjb25zdCBsb2cgPVxuICAgICAgcmVwb3J0LnJlcG9ydC5zdGF0ZSA9PSBDaGVja1N0YXRlLnN1Y2Nlc3MgPyBzID0+IGxvZ2dlci5pbmZvKHMpIDogcyA9PiBsb2dnZXIud2FybihzKTtcblxuICAgIC8vIERlY2xhcmUgb3V0cHV0XG4gICAgY29uc3QgaW5kZW50ID0gJyAgICc7XG4gICAgbGV0IG91dHB1dCA9ICcnO1xuICAgIGxldCBjaGVja3NDb3VudCA9IDA7XG4gICAgbGV0IGZhaWxlZENoZWNrc0NvdW50ID0gMDtcbiAgICBsZXQgc2tpcHBlZENoZWNrQ291bnQgPSAwO1xuXG4gICAgLy8gVHJhdmVyc2UgYWxsIGdyb3VwcyBhbmQgY2hlY2tzIGZvciBjb21wb3NlIG91dHB1dFxuICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgcmVwb3J0LnJlcG9ydC5ncm91cHMpIHtcbiAgICAgIG91dHB1dCArPSBgXFxuLSAke2dyb3VwLm5hbWV9YDtcblxuICAgICAgZm9yIChjb25zdCBjaGVjayBvZiBncm91cC5jaGVja3MpIHtcbiAgICAgICAgY2hlY2tzQ291bnQrKztcbiAgICAgICAgb3V0cHV0ICs9IGBcXG4ke2luZGVudH0ke3RoaXMuX2dldExvZ0ljb25Gb3JTdGF0ZShjaGVjay5zdGF0ZSl9ICR7Y2hlY2sudGl0bGV9YDtcblxuICAgICAgICBpZiAoY2hlY2suc3RhdGUgPT0gQ2hlY2tTdGF0ZS5mYWlsKSB7XG4gICAgICAgICAgZmFpbGVkQ2hlY2tzQ291bnQrKztcbiAgICAgICAgICBvdXRwdXQgKz0gYFxcbiR7aW5kZW50fSR7aW5kZW50fVdhcm5pbmc6ICR7Y2hlY2sud2FybmluZ31gO1xuICAgICAgICAgIG91dHB1dCArPSBgICR7Y2hlY2suc29sdXRpb259YDtcbiAgICAgICAgfSBlbHNlIGlmIChjaGVjay5zdGF0ZSA9PSBDaGVja1N0YXRlLm5vbmUpIHtcbiAgICAgICAgICBza2lwcGVkQ2hlY2tDb3VudCsrO1xuICAgICAgICAgIG91dHB1dCArPSBgXFxuJHtpbmRlbnR9JHtpbmRlbnR9VGVzdCBkaWQgbm90IGV4ZWN1dGUsIHRoaXMgaXMgbGlrZWx5IGFuIGludGVybmFsIHNlcnZlciBpc3N1ZSwgcGxlYXNlIHJlcG9ydC5gO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgb3V0cHV0ID1cbiAgICAgIGBcXG4jIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI2AgK1xuICAgICAgYFxcbiMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjYCArXG4gICAgICBgXFxuIyAgIFBhcnNlIFNlcnZlciBTZWN1cml0eSBDaGVjayAgICNgICtcbiAgICAgIGBcXG4jICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI2AgK1xuICAgICAgYFxcbiMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjYCArXG4gICAgICBgXFxuYCArXG4gICAgICBgXFxuJHtcbiAgICAgICAgZmFpbGVkQ2hlY2tzQ291bnQgPiAwID8gJ1dhcm5pbmc6ICcgOiAnJ1xuICAgICAgfSR7ZmFpbGVkQ2hlY2tzQ291bnR9IHdlYWsgc2VjdXJpdHkgc2V0dGluZyhzKSBmb3VuZCR7ZmFpbGVkQ2hlY2tzQ291bnQgPiAwID8gJyEnIDogJyd9YCArXG4gICAgICBgXFxuJHtjaGVja3NDb3VudH0gY2hlY2socykgZXhlY3V0ZWRgICtcbiAgICAgIGBcXG4ke3NraXBwZWRDaGVja0NvdW50fSBjaGVjayhzKSBza2lwcGVkYCArXG4gICAgICBgXFxuYCArXG4gICAgICBgJHtvdXRwdXR9YDtcblxuICAgIC8vIFdyaXRlIGxvZ1xuICAgIGxvZyhvdXRwdXQpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYW4gaWNvbiBmb3IgdXNlIGluIHRoZSByZXBvcnQgbG9nIG91dHB1dC5cbiAgICogQHBhcmFtIHtDaGVja1N0YXRlfSBzdGF0ZSBUaGUgY2hlY2sgc3RhdGUuXG4gICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBpY29uLlxuICAgKi9cbiAgX2dldExvZ0ljb25Gb3JTdGF0ZShzdGF0ZSkge1xuICAgIHN3aXRjaCAoc3RhdGUpIHtcbiAgICAgIGNhc2UgQ2hlY2tTdGF0ZS5zdWNjZXNzOlxuICAgICAgICByZXR1cm4gJ+KchSc7XG4gICAgICBjYXNlIENoZWNrU3RhdGUuZmFpbDpcbiAgICAgICAgcmV0dXJuICfinYwnO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuICfihLnvuI8nO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgdGhlIGNvbnN0cnVjdG9yIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMgdG8gdmFsaWRhdGUuXG4gICAqL1xuICBfdmFsaWRhdGVQYXJhbXMocGFyYW1zKSB7XG4gICAgVXRpbHMudmFsaWRhdGVQYXJhbXMocGFyYW1zLCB7XG4gICAgICBlbmFibGVDaGVjazogeyB0OiAnYm9vbGVhbicsIHY6IGlzQm9vbGVhbiwgbzogdHJ1ZSB9LFxuICAgICAgZW5hYmxlQ2hlY2tMb2c6IHsgdDogJ2Jvb2xlYW4nLCB2OiBpc0Jvb2xlYW4sIG86IHRydWUgfSxcbiAgICAgIGNoZWNrR3JvdXBzOiB7IHQ6ICdhcnJheScsIHY6IGlzQXJyYXksIG86IHRydWUgfSxcbiAgICB9KTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENoZWNrUnVubmVyO1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQUFBLE1BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE1BQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLFdBQUEsR0FBQUMsdUJBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFJLE9BQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLE9BQUEsR0FBQUwsT0FBQTtBQUE0QyxTQUFBTSx5QkFBQUMsQ0FBQSw2QkFBQUMsT0FBQSxtQkFBQUMsQ0FBQSxPQUFBRCxPQUFBLElBQUFFLENBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxDQUFBLFdBQUFBLENBQUEsR0FBQUcsQ0FBQSxHQUFBRCxDQUFBLEtBQUFGLENBQUE7QUFBQSxTQUFBSix3QkFBQUksQ0FBQSxFQUFBRSxDQUFBLFNBQUFBLENBQUEsSUFBQUYsQ0FBQSxJQUFBQSxDQUFBLENBQUFJLFVBQUEsU0FBQUosQ0FBQSxlQUFBQSxDQUFB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TixLQUFLLElBQUlDLGlCQUFVLENBQUN3QixJQUFJLEVBQUU7VUFDekNGLGlCQUFpQixFQUFFO1VBQ25CSCxNQUFNLElBQUksS0FBS0QsTUFBTSxHQUFHQSxNQUFNLCtFQUErRTtRQUMvRztNQUNGO0lBQ0Y7SUFFQUMsTUFBTSxHQUNKLHVDQUF1QyxHQUN2Qyx1Q0FBdUMsR0FDdkMsdUNBQXVDLEdBQ3ZDLHVDQUF1QyxHQUN2Qyx1Q0FBdUMsR0FDdkMsSUFBSSxHQUNKLEtBQ0VFLGlCQUFpQixHQUFHLENBQUMsR0FBRyxXQUFXLEdBQUcsRUFBRSxHQUN2Q0EsaUJBQWlCLGtDQUFrQ0EsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLEVBQUUsR0FDeEYsS0FBS0QsV0FBVyxvQkFBb0IsR0FDcEMsS0FBS0UsaUJBQWlCLG1CQUFtQixHQUN6QyxJQUFJLEdBQ0osR0FBR0gsTUFBTSxFQUFFOztJQUViO0lBQ0FOLEdBQUcsQ0FBQ00sTUFBTSxDQUFDO0VBQ2I7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtFQUNFSSxtQkFBbUJBLENBQUN4QixLQUFLLEVBQUU7SUFDekIsUUFBUUEsS0FBSztNQUNYLEtBQUtDLGlCQUFVLENBQUNDLE9BQU87UUFDckIsT0FBTyxHQUFHO01BQ1osS0FBS0QsaUJBQVUsQ0FBQ1MsSUFBSTtRQUNsQixPQUFPLEdBQUc7TUFDWjtRQUNFLE9BQU8sSUFBSTtJQUNmO0VBQ0Y7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7RUFDRTNCLGVBQWVBLENBQUMyQyxNQUFNLEVBQUU7SUFDdEJDLGNBQUssQ0FBQ0MsY0FBYyxDQUFDRixNQUFNLEVBQUU7TUFDM0IxQyxXQUFXLEVBQUU7UUFBRXBCLENBQUMsRUFBRSxTQUFTO1FBQUVpRSxDQUFDLEVBQUVDLGlCQUFTO1FBQUVDLENBQUMsRUFBRTtNQUFLLENBQUM7TUFDcEQ5QyxjQUFjLEVBQUU7UUFBRXJCLENBQUMsRUFBRSxTQUFTO1FBQUVpRSxDQUFDLEVBQUVDLGlCQUFTO1FBQUVDLENBQUMsRUFBRTtNQUFLLENBQUM7TUFDdkQ3QyxXQUFXLEVBQUU7UUFBRXRCLENBQUMsRUFBRSxPQUFPO1FBQUVpRSxDQUFDLEVBQUVHLGVBQU87UUFBRUQsQ0FBQyxFQUFFO01BQUs7SUFDakQsQ0FBQyxDQUFDO0VBQ0o7QUFDRjtBQUVBRSxNQUFNLENBQUNDLE9BQU8sR0FBR3RELFdBQVciLCJpZ25vcmVMaXN0IjpbXX0=