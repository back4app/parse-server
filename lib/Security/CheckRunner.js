"use strict";

var _Utils = _interopRequireDefault(require("../Utils"));
var _Check = require("./Check");
var CheckGroups = _interopRequireWildcard(require("./CheckGroups/CheckGroups"));
var _logger = _interopRequireDefault(require("../logger"));
var _lodash = require("lodash");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfVXRpbHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9DaGVjayIsIkNoZWNrR3JvdXBzIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJfbG9nZ2VyIiwiX2xvZGFzaCIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsIkNoZWNrUnVubmVyIiwiY29uc3RydWN0b3IiLCJjb25maWciLCJfdmFsaWRhdGVQYXJhbXMiLCJlbmFibGVDaGVjayIsImVuYWJsZUNoZWNrTG9nIiwiY2hlY2tHcm91cHMiLCJydW4iLCJ2ZXJzaW9uIiwiZ3JvdXBzIiwidmFsdWVzIiwiZmlsdGVyIiwiYyIsIm1hcCIsIkNoZWNrR3JvdXAiLCJmb3JFYWNoIiwiZ3JvdXAiLCJyZXBvcnQiLCJfZ2VuZXJhdGVSZXBvcnQiLCJfbG9nUmVwb3J0Iiwic3RhdGUiLCJDaGVja1N0YXRlIiwic3VjY2VzcyIsImdyb3VwUmVwb3J0IiwibmFtZSIsImNoZWNrcyIsImNoZWNrIiwiY2hlY2tSZXBvcnQiLCJ0aXRsZSIsImNoZWNrU3RhdGUiLCJmYWlsIiwid2FybmluZyIsInNvbHV0aW9uIiwicHVzaCIsImxvZyIsInMiLCJsb2dnZXIiLCJpbmZvIiwid2FybiIsImluZGVudCIsIm91dHB1dCIsImNoZWNrc0NvdW50IiwiZmFpbGVkQ2hlY2tzQ291bnQiLCJza2lwcGVkQ2hlY2tDb3VudCIsIl9nZXRMb2dJY29uRm9yU3RhdGUiLCJub25lIiwicGFyYW1zIiwiVXRpbHMiLCJ2YWxpZGF0ZVBhcmFtcyIsInYiLCJpc0Jvb2xlYW4iLCJpc0FycmF5IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TZWN1cml0eS9DaGVja1J1bm5lci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgVXRpbHMgZnJvbSAnLi4vVXRpbHMnO1xuaW1wb3J0IHsgQ2hlY2tTdGF0ZSB9IGZyb20gJy4vQ2hlY2snO1xuaW1wb3J0ICogYXMgQ2hlY2tHcm91cHMgZnJvbSAnLi9DaGVja0dyb3Vwcy9DaGVja0dyb3Vwcyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgeyBpc0FycmF5LCBpc0Jvb2xlYW4gfSBmcm9tICdsb2Rhc2gnO1xuXG4vKipcbiAqIFRoZSBzZWN1cml0eSBjaGVjayBydW5uZXIuXG4gKiBAbWVtYmVyb2YgbW9kdWxlOlNlY3VyaXR5Q2hlY2tcbiAqL1xuY2xhc3MgQ2hlY2tSdW5uZXIge1xuICAvKipcbiAgICogVGhlIHNlY3VyaXR5IGNoZWNrIHJ1bm5lci5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtjb25maWddIFRoZSBjb25maWd1cmF0aW9uIG9wdGlvbnMuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW2NvbmZpZy5lbmFibGVDaGVjaz1mYWxzZV0gSXMgdHJ1ZSBpZiBQYXJzZSBTZXJ2ZXIgc2hvdWxkIHJlcG9ydCB3ZWFrIHNlY3VyaXR5IHNldHRpbmdzLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtjb25maWcuZW5hYmxlQ2hlY2tMb2c9ZmFsc2VdIElzIHRydWUgaWYgdGhlIHNlY3VyaXR5IGNoZWNrIHJlcG9ydCBzaG91bGQgYmUgd3JpdHRlbiB0byBsb2dzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW2NvbmZpZy5jaGVja0dyb3Vwc10gVGhlIGNoZWNrIGdyb3VwcyB0byBydW4uIERlZmF1bHQgYXJlIHRoZSBncm91cHMgZGVmaW5lZCBpbiBgLi9DaGVja0dyb3Vwcy9DaGVja0dyb3Vwcy5qc2AuXG4gICAqL1xuICBjb25zdHJ1Y3Rvcihjb25maWcgPSB7fSkge1xuICAgIHRoaXMuX3ZhbGlkYXRlUGFyYW1zKGNvbmZpZyk7XG4gICAgY29uc3QgeyBlbmFibGVDaGVjayA9IGZhbHNlLCBlbmFibGVDaGVja0xvZyA9IGZhbHNlLCBjaGVja0dyb3VwcyA9IENoZWNrR3JvdXBzIH0gPSBjb25maWc7XG4gICAgdGhpcy5lbmFibGVDaGVjayA9IGVuYWJsZUNoZWNrO1xuICAgIHRoaXMuZW5hYmxlQ2hlY2tMb2cgPSBlbmFibGVDaGVja0xvZztcbiAgICB0aGlzLmNoZWNrR3JvdXBzID0gY2hlY2tHcm91cHM7XG4gIH1cblxuICAvKipcbiAgICogUnVucyBhbGwgc2VjdXJpdHkgY2hlY2tzIGFuZCByZXR1cm5zIHRoZSByZXN1bHRzLlxuICAgKiBAcGFyYW1zXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBzZWN1cml0eSBjaGVjayByZXBvcnQuXG4gICAqL1xuICBhc3luYyBydW4oeyB2ZXJzaW9uID0gJzEuMC4wJyB9ID0ge30pIHtcbiAgICAvLyBJbnN0YW50aWF0ZSBjaGVjayBncm91cHNcbiAgICBjb25zdCBncm91cHMgPSBPYmplY3QudmFsdWVzKHRoaXMuY2hlY2tHcm91cHMpXG4gICAgICAuZmlsdGVyKGMgPT4gdHlwZW9mIGMgPT09ICdmdW5jdGlvbicpXG4gICAgICAubWFwKENoZWNrR3JvdXAgPT4gbmV3IENoZWNrR3JvdXAoKSk7XG5cbiAgICAvLyBSdW4gY2hlY2tzXG4gICAgZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4gZ3JvdXAucnVuKCkpO1xuXG4gICAgLy8gR2VuZXJhdGUgSlNPTiByZXBvcnRcbiAgICBjb25zdCByZXBvcnQgPSB0aGlzLl9nZW5lcmF0ZVJlcG9ydCh7IGdyb3VwcywgdmVyc2lvbiB9KTtcblxuICAgIC8vIElmIHJlcG9ydCBzaG91bGQgYmUgd3JpdHRlbiB0byBsb2dzXG4gICAgaWYgKHRoaXMuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgIHRoaXMuX2xvZ1JlcG9ydChyZXBvcnQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVwb3J0O1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlcyBhIHNlY3VyaXR5IGNoZWNrIHJlcG9ydCBpbiBKU09OIGZvcm1hdCB3aXRoIHNjaGVtYTpcbiAgICogYGBgXG4gICAqIHtcbiAgICogICAgcmVwb3J0OiB7XG4gICAqICAgICAgdmVyc2lvbjogXCIxLjAuMFwiLCAvLyBUaGUgcmVwb3J0IHZlcnNpb24sIGRlZmluZXMgdGhlIHNjaGVtYVxuICAgKiAgICAgIHN0YXRlOiBcImZhaWxcIiAgICAgLy8gVGhlIGRpc2p1bmN0aXZlIGluZGljYXRvciBvZiBmYWlsZWQgY2hlY2tzIGluIGFsbCBncm91cHMuXG4gICAqICAgICAgZ3JvdXBzOiBbICAgICAgICAgLy8gVGhlIGNoZWNrIGdyb3Vwc1xuICAgKiAgICAgICAge1xuICAgKiAgICAgICAgICBuYW1lOiBcIkhvdXNlXCIsICAgICAgICAgICAgLy8gVGhlIGdyb3VwIG5hbWVcbiAgICogICAgICAgICAgc3RhdGU6IFwiZmFpbFwiICAgICAgICAgICAgIC8vIFRoZSBkaXNqdW5jdGl2ZSBpbmRpY2F0b3Igb2YgZmFpbGVkIGNoZWNrcyBpbiB0aGlzIGdyb3VwLlxuICAgKiAgICAgICAgICBjaGVja3M6IFsgICAgICAgICAgICAgICAgIC8vIFRoZSBjaGVja3NcbiAgICogICAgICAgICAgICB0aXRsZTogXCJEb29yIGxvY2tlZFwiLCAgIC8vIFRoZSBjaGVjayB0aXRsZVxuICAgKiAgICAgICAgICAgIHN0YXRlOiBcImZhaWxcIiAgICAgICAgICAgLy8gVGhlIGNoZWNrIHN0YXRlXG4gICAqICAgICAgICAgICAgd2FybmluZzogXCJBbnlvbmUgY2FuIGVudGVyIHlvdXIgaG91c2UuXCIgICAvLyBUaGUgd2FybmluZy5cbiAgICogICAgICAgICAgICBzb2x1dGlvbjogXCJMb2NrIHlvdXIgZG9vci5cIiAgICAgICAgICAgICAgIC8vIFRoZSBzb2x1dGlvbi5cbiAgICogICAgICAgICAgXVxuICAgKiAgICAgICAgfSxcbiAgICogICAgICAgIC4uLlxuICAgKiAgICAgIF1cbiAgICogICAgfVxuICAgKiB9XG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzLlxuICAgKiBAcGFyYW0ge0FycmF5PENoZWNrR3JvdXA+fSBwYXJhbXMuZ3JvdXBzIFRoZSBjaGVjayBncm91cHMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMudmVyc2lvbjogVGhlIHJlcG9ydCBzY2hlbWEgdmVyc2lvbi5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHJlcG9ydC5cbiAgICovXG4gIF9nZW5lcmF0ZVJlcG9ydCh7IGdyb3VwcywgdmVyc2lvbiB9KSB7XG4gICAgLy8gQ3JlYXRlIHJlcG9ydCB0ZW1wbGF0ZVxuICAgIGNvbnN0IHJlcG9ydCA9IHtcbiAgICAgIHJlcG9ydDoge1xuICAgICAgICB2ZXJzaW9uLFxuICAgICAgICBzdGF0ZTogQ2hlY2tTdGF0ZS5zdWNjZXNzLFxuICAgICAgICBncm91cHM6IFtdLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gSWRlbnRpZnkgcmVwb3J0IHZlcnNpb25cbiAgICBzd2l0Y2ggKHZlcnNpb24pIHtcbiAgICAgIGNhc2UgJzEuMC4wJzpcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIC8vIEZvciBlYWNoIGNoZWNrIGdyb3VwXG4gICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG4gICAgICAgICAgLy8gQ3JlYXRlIGdyb3VwIHJlcG9ydFxuICAgICAgICAgIGNvbnN0IGdyb3VwUmVwb3J0ID0ge1xuICAgICAgICAgICAgbmFtZTogZ3JvdXAubmFtZSgpLFxuICAgICAgICAgICAgc3RhdGU6IENoZWNrU3RhdGUuc3VjY2VzcyxcbiAgICAgICAgICAgIGNoZWNrczogW10sXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIENyZWF0ZSBjaGVjayByZXBvcnRzXG4gICAgICAgICAgZ3JvdXBSZXBvcnQuY2hlY2tzID0gZ3JvdXAuY2hlY2tzKCkubWFwKGNoZWNrID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrUmVwb3J0ID0ge1xuICAgICAgICAgICAgICB0aXRsZTogY2hlY2sudGl0bGUsXG4gICAgICAgICAgICAgIHN0YXRlOiBjaGVjay5jaGVja1N0YXRlKCksXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGNoZWNrLmNoZWNrU3RhdGUoKSA9PSBDaGVja1N0YXRlLmZhaWwpIHtcbiAgICAgICAgICAgICAgY2hlY2tSZXBvcnQud2FybmluZyA9IGNoZWNrLndhcm5pbmc7XG4gICAgICAgICAgICAgIGNoZWNrUmVwb3J0LnNvbHV0aW9uID0gY2hlY2suc29sdXRpb247XG4gICAgICAgICAgICAgIHJlcG9ydC5yZXBvcnQuc3RhdGUgPSBDaGVja1N0YXRlLmZhaWw7XG4gICAgICAgICAgICAgIGdyb3VwUmVwb3J0LnN0YXRlID0gQ2hlY2tTdGF0ZS5mYWlsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNoZWNrUmVwb3J0O1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcmVwb3J0LnJlcG9ydC5ncm91cHMucHVzaChncm91cFJlcG9ydCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlcG9ydDtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2dzIHRoZSBzZWN1cml0eSBjaGVjayByZXBvcnQuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXBvcnQgVGhlIHJlcG9ydCB0byBsb2cuXG4gICAqL1xuICBfbG9nUmVwb3J0KHJlcG9ydCkge1xuICAgIC8vIERldGVybWluZSBsb2cgbGV2ZWwgZGVwZW5kaW5nIG9uIHdoZXRoZXIgYW55IGNoZWNrIGZhaWxlZFxuICAgIGNvbnN0IGxvZyA9XG4gICAgICByZXBvcnQucmVwb3J0LnN0YXRlID09IENoZWNrU3RhdGUuc3VjY2VzcyA/IHMgPT4gbG9nZ2VyLmluZm8ocykgOiBzID0+IGxvZ2dlci53YXJuKHMpO1xuXG4gICAgLy8gRGVjbGFyZSBvdXRwdXRcbiAgICBjb25zdCBpbmRlbnQgPSAnICAgJztcbiAgICBsZXQgb3V0cHV0ID0gJyc7XG4gICAgbGV0IGNoZWNrc0NvdW50ID0gMDtcbiAgICBsZXQgZmFpbGVkQ2hlY2tzQ291bnQgPSAwO1xuICAgIGxldCBza2lwcGVkQ2hlY2tDb3VudCA9IDA7XG5cbiAgICAvLyBUcmF2ZXJzZSBhbGwgZ3JvdXBzIGFuZCBjaGVja3MgZm9yIGNvbXBvc2Ugb3V0cHV0XG4gICAgZm9yIChjb25zdCBncm91cCBvZiByZXBvcnQucmVwb3J0Lmdyb3Vwcykge1xuICAgICAgb3V0cHV0ICs9IGBcXG4tICR7Z3JvdXAubmFtZX1gO1xuXG4gICAgICBmb3IgKGNvbnN0IGNoZWNrIG9mIGdyb3VwLmNoZWNrcykge1xuICAgICAgICBjaGVja3NDb3VudCsrO1xuICAgICAgICBvdXRwdXQgKz0gYFxcbiR7aW5kZW50fSR7dGhpcy5fZ2V0TG9nSWNvbkZvclN0YXRlKGNoZWNrLnN0YXRlKX0gJHtjaGVjay50aXRsZX1gO1xuXG4gICAgICAgIGlmIChjaGVjay5zdGF0ZSA9PSBDaGVja1N0YXRlLmZhaWwpIHtcbiAgICAgICAgICBmYWlsZWRDaGVja3NDb3VudCsrO1xuICAgICAgICAgIG91dHB1dCArPSBgXFxuJHtpbmRlbnR9JHtpbmRlbnR9V2FybmluZzogJHtjaGVjay53YXJuaW5nfWA7XG4gICAgICAgICAgb3V0cHV0ICs9IGAgJHtjaGVjay5zb2x1dGlvbn1gO1xuICAgICAgICB9IGVsc2UgaWYgKGNoZWNrLnN0YXRlID09IENoZWNrU3RhdGUubm9uZSkge1xuICAgICAgICAgIHNraXBwZWRDaGVja0NvdW50Kys7XG4gICAgICAgICAgb3V0cHV0ICs9IGBcXG4ke2luZGVudH0ke2luZGVudH1UZXN0IGRpZCBub3QgZXhlY3V0ZSwgdGhpcyBpcyBsaWtlbHkgYW4gaW50ZXJuYWwgc2VydmVyIGlzc3VlLCBwbGVhc2UgcmVwb3J0LmA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBvdXRwdXQgPVxuICAgICAgYFxcbiMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjYCArXG4gICAgICBgXFxuIyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICNgICtcbiAgICAgIGBcXG4jICAgUGFyc2UgU2VydmVyIFNlY3VyaXR5IENoZWNrICAgI2AgK1xuICAgICAgYFxcbiMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjYCArXG4gICAgICBgXFxuIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNgICtcbiAgICAgIGBcXG5gICtcbiAgICAgIGBcXG4ke1xuICAgICAgICBmYWlsZWRDaGVja3NDb3VudCA+IDAgPyAnV2FybmluZzogJyA6ICcnXG4gICAgICB9JHtmYWlsZWRDaGVja3NDb3VudH0gd2VhayBzZWN1cml0eSBzZXR0aW5nKHMpIGZvdW5kJHtmYWlsZWRDaGVja3NDb3VudCA+IDAgPyAnIScgOiAnJ31gICtcbiAgICAgIGBcXG4ke2NoZWNrc0NvdW50fSBjaGVjayhzKSBleGVjdXRlZGAgK1xuICAgICAgYFxcbiR7c2tpcHBlZENoZWNrQ291bnR9IGNoZWNrKHMpIHNraXBwZWRgICtcbiAgICAgIGBcXG5gICtcbiAgICAgIGAke291dHB1dH1gO1xuXG4gICAgLy8gV3JpdGUgbG9nXG4gICAgbG9nKG91dHB1dCk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhbiBpY29uIGZvciB1c2UgaW4gdGhlIHJlcG9ydCBsb2cgb3V0cHV0LlxuICAgKiBAcGFyYW0ge0NoZWNrU3RhdGV9IHN0YXRlIFRoZSBjaGVjayBzdGF0ZS5cbiAgICogQHJldHVybnMge1N0cmluZ30gVGhlIGljb24uXG4gICAqL1xuICBfZ2V0TG9nSWNvbkZvclN0YXRlKHN0YXRlKSB7XG4gICAgc3dpdGNoIChzdGF0ZSkge1xuICAgICAgY2FzZSBDaGVja1N0YXRlLnN1Y2Nlc3M6XG4gICAgICAgIHJldHVybiAn4pyFJztcbiAgICAgIGNhc2UgQ2hlY2tTdGF0ZS5mYWlsOlxuICAgICAgICByZXR1cm4gJ+KdjCc7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gJ+KEue+4jyc7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyB0aGUgY29uc3RydWN0b3IgcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycyB0byB2YWxpZGF0ZS5cbiAgICovXG4gIF92YWxpZGF0ZVBhcmFtcyhwYXJhbXMpIHtcbiAgICBVdGlscy52YWxpZGF0ZVBhcmFtcyhwYXJhbXMsIHtcbiAgICAgIGVuYWJsZUNoZWNrOiB7IHQ6ICdib29sZWFuJywgdjogaXNCb29sZWFuLCBvOiB0cnVlIH0sXG4gICAgICBlbmFibGVDaGVja0xvZzogeyB0OiAnYm9vbGVhbicsIHY6IGlzQm9vbGVhbiwgbzogdHJ1ZSB9LFxuICAgICAgY2hlY2tHcm91cHM6IHsgdDogJ2FycmF5JywgdjogaXNBcnJheSwgbzogdHJ1ZSB9LFxuICAgIH0pO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ2hlY2tSdW5uZXI7XG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBQUEsTUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsTUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsV0FBQSxHQUFBQyx1QkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksT0FBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBTCxPQUFBO0FBQTRDLFNBQUFHLHdCQUFBRyxDQUFBLEVBQUFDLENBQUEsNkJBQUFDLE9BQUEsTUFBQUMsQ0FBQSxPQUFBRCxPQUFBLElBQUFFLENBQUEsT0FBQUYsT0FBQSxZQUFBTCx1QkFBQSxZQUFBQSxDQUFBRyxDQUFBLEVBQUFDLENBQUEsU0FBQUEsQ0FBQSxJQUFBRCxDQUFBLElBQUFBLENBQUEsQ0FBQUssVUFBQSxTQUFBTCxDQUFBLE1BQUFNLENBQUEsRUFBQUMsQ0FBQSxFQUFBQyxDQUFBLEtBQUFDLFNBQUEsUUFBQUMsT0FBQSxFQUFBVixDQUFBLGlCQUFBQSxDQUFBLHVCQUFBQSxDQUFBLHlCQUFBQSxD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