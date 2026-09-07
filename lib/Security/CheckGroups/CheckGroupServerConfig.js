"use strict";

var _Check = require("../Check");
var _CheckGroup = _interopRequireDefault(require("../CheckGroup"));
var _Config = _interopRequireDefault(require("../../Config"));
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * The security checks group for Parse Server configuration.
 * Checks common Parse Server parameters such as access keys.
 * @memberof module:SecurityCheck
 */
class CheckGroupServerConfig extends _CheckGroup.default {
  setName() {
    return 'Parse Server Configuration';
  }
  setChecks() {
    const config = _Config.default.get(_node.default.applicationId);
    return [new _Check.Check({
      title: 'Secure master key',
      warning: 'The Parse Server master key is insecure and vulnerable to brute force attacks.',
      solution: 'Choose a longer and/or more complex master key with a combination of upper- and lowercase characters, numbers and special characters.',
      check: () => {
        const masterKey = config.masterKey;
        const hasUpperCase = /[A-Z]/.test(masterKey);
        const hasLowerCase = /[a-z]/.test(masterKey);
        const hasNumbers = /\d/.test(masterKey);
        const hasNonAlphasNumerics = /\W/.test(masterKey);
        // Ensure length
        if (masterKey.length < 14) {
          throw 1;
        }
        // Ensure at least 3 out of 4 requirements passed
        if (hasUpperCase + hasLowerCase + hasNumbers + hasNonAlphasNumerics < 3) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Security log disabled',
      warning: 'Security checks in logs may expose vulnerabilities to anyone with access to logs.',
      solution: "Change Parse Server configuration to 'security.enableCheckLog: false'.",
      check: () => {
        if (config.security && config.security.enableCheckLog) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Client class creation disabled',
      warning: 'Attackers are allowed to create new classes without restriction and flood the database.',
      solution: "Change Parse Server configuration to 'allowClientClassCreation: false'.",
      check: () => {
        if (config.allowClientClassCreation || config.allowClientClassCreation == null) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Users are created without public access',
      warning: 'Users with public read access are exposed to anyone who knows their object IDs, or to anyone who can query the Parse.User class.',
      solution: "Change Parse Server configuration to 'enforcePrivateUsers: true'.",
      check: () => {
        if (!config.enforcePrivateUsers) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Insecure auth adapters disabled',
      warning: "Attackers may explore insecure auth adapters' vulnerabilities and log in on behalf of another user.",
      solution: "Change Parse Server configuration to 'enableInsecureAuthAdapters: false'.",
      check: () => {
        if (config.enableInsecureAuthAdapters !== false) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'GraphQL public introspection disabled',
      warning: 'GraphQL public introspection is enabled, which allows anyone to access the GraphQL schema.',
      solution: "Change Parse Server configuration to 'graphQLPublicIntrospection: false'. You will need to use master key or maintenance key to access the GraphQL schema.",
      check: () => {
        if (config.graphQLPublicIntrospection !== false) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Public database explain disabled',
      warning: 'Database explain queries are publicly accessible, which may expose sensitive database performance information and schema details.',
      solution: "Change Parse Server configuration to 'databaseOptions.allowPublicExplain: false'. You will need to use master key to run explain queries.",
      check: () => {
        if (config.databaseOptions?.allowPublicExplain === true || config.databaseOptions?.allowPublicExplain == null) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Request complexity limits enabled',
      warning: 'One or more request complexity limits are disabled, which may allow denial-of-service attacks through deeply nested or excessively broad queries.',
      solution: "Ensure all properties in 'requestComplexity' are set to positive integers. Set to '-1' only if you have other mitigations in place.",
      check: () => {
        const rc = config.requestComplexity;
        if (!rc) {
          throw 1;
        }
        const values = [rc.includeDepth, rc.includeCount, rc.subqueryDepth, rc.queryDepth, rc.graphQLDepth, rc.graphQLFields];
        if (values.some(v => v === -1)) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Password reset endpoint user enumeration mitigated',
      warning: 'The password reset endpoint returns distinct error responses for invalid email addresses, which allows attackers to enumerate registered users.',
      solution: "Change Parse Server configuration to 'passwordPolicy.resetPasswordSuccessOnInvalidEmail: true'.",
      check: () => {
        if (config.passwordPolicy?.resetPasswordSuccessOnInvalidEmail === false) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Email verification endpoint user enumeration mitigated',
      warning: 'The email verification endpoint returns distinct error responses for invalid email addresses, which allows attackers to enumerate registered users.',
      solution: "Change Parse Server configuration to 'emailVerifySuccessOnInvalidEmail: true'.",
      check: () => {
        if (config.emailVerifySuccessOnInvalidEmail === false) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'LiveQuery regex timeout enabled',
      warning: 'LiveQuery regex timeout is disabled. A malicious client can subscribe with a crafted $regex pattern that causes catastrophic backtracking, blocking the Node.js event loop and making the server unresponsive.',
      solution: "Change Parse Server configuration to 'liveQuery.regexTimeout: 100' to set a 100ms timeout for regex evaluation in LiveQuery.",
      check: () => {
        if (config.liveQuery?.classNames?.length > 0 && config.liveQuery?.regexTimeout === 0) {
          throw 1;
        }
      }
    })];
  }
}
module.exports = CheckGroupServerConfig;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQ2hlY2siLCJyZXF1aXJlIiwiX0NoZWNrR3JvdXAiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX0NvbmZpZyIsIl9ub2RlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiQ2hlY2tHcm91cFNlcnZlckNvbmZpZyIsIkNoZWNrR3JvdXAiLCJzZXROYW1lIiwic2V0Q2hlY2tzIiwiY29uZmlnIiwiQ29uZmlnIiwiZ2V0IiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwiQ2hlY2siLCJ0aXRsZSIsIndhcm5pbmciLCJzb2x1dGlvbiIsImNoZWNrIiwibWFzdGVyS2V5IiwiaGFzVXBwZXJDYXNlIiwidGVzdCIsImhhc0xvd2VyQ2FzZSIsImhhc051bWJlcnMiLCJoYXNOb25BbHBoYXNOdW1lcmljcyIsImxlbmd0aCIsInNlY3VyaXR5IiwiZW5hYmxlQ2hlY2tMb2ciLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwiZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMiLCJncmFwaFFMUHVibGljSW50cm9zcGVjdGlvbiIsImRhdGFiYXNlT3B0aW9ucyIsImFsbG93UHVibGljRXhwbGFpbiIsInJjIiwicmVxdWVzdENvbXBsZXhpdHkiLCJ2YWx1ZXMiLCJpbmNsdWRlRGVwdGgiLCJpbmNsdWRlQ291bnQiLCJzdWJxdWVyeURlcHRoIiwicXVlcnlEZXB0aCIsImdyYXBoUUxEZXB0aCIsImdyYXBoUUxGaWVsZHMiLCJzb21lIiwidiIsInBhc3N3b3JkUG9saWN5IiwicmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCIsImVtYWlsVmVyaWZ5U3VjY2Vzc09uSW52YWxpZEVtYWlsIiwibGl2ZVF1ZXJ5IiwiY2xhc3NOYW1lcyIsInJlZ2V4VGltZW91dCIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvU2VjdXJpdHkvQ2hlY2tHcm91cHMvQ2hlY2tHcm91cFNlcnZlckNvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDaGVjayB9IGZyb20gJy4uL0NoZWNrJztcbmltcG9ydCBDaGVja0dyb3VwIGZyb20gJy4uL0NoZWNrR3JvdXAnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi8uLi9Db25maWcnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG4vKipcbiAqIFRoZSBzZWN1cml0eSBjaGVja3MgZ3JvdXAgZm9yIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uLlxuICogQ2hlY2tzIGNvbW1vbiBQYXJzZSBTZXJ2ZXIgcGFyYW1ldGVycyBzdWNoIGFzIGFjY2VzcyBrZXlzLlxuICogQG1lbWJlcm9mIG1vZHVsZTpTZWN1cml0eUNoZWNrXG4gKi9cbmNsYXNzIENoZWNrR3JvdXBTZXJ2ZXJDb25maWcgZXh0ZW5kcyBDaGVja0dyb3VwIHtcbiAgc2V0TmFtZSgpIHtcbiAgICByZXR1cm4gJ1BhcnNlIFNlcnZlciBDb25maWd1cmF0aW9uJztcbiAgfVxuICBzZXRDaGVja3MoKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICByZXR1cm4gW1xuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdTZWN1cmUgbWFzdGVyIGtleScsXG4gICAgICAgIHdhcm5pbmc6ICdUaGUgUGFyc2UgU2VydmVyIG1hc3RlciBrZXkgaXMgaW5zZWN1cmUgYW5kIHZ1bG5lcmFibGUgdG8gYnJ1dGUgZm9yY2UgYXR0YWNrcy4nLFxuICAgICAgICBzb2x1dGlvbjpcbiAgICAgICAgICAnQ2hvb3NlIGEgbG9uZ2VyIGFuZC9vciBtb3JlIGNvbXBsZXggbWFzdGVyIGtleSB3aXRoIGEgY29tYmluYXRpb24gb2YgdXBwZXItIGFuZCBsb3dlcmNhc2UgY2hhcmFjdGVycywgbnVtYmVycyBhbmQgc3BlY2lhbCBjaGFyYWN0ZXJzLicsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgbWFzdGVyS2V5ID0gY29uZmlnLm1hc3RlcktleTtcbiAgICAgICAgICBjb25zdCBoYXNVcHBlckNhc2UgPSAvW0EtWl0vLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICBjb25zdCBoYXNMb3dlckNhc2UgPSAvW2Etel0vLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICBjb25zdCBoYXNOdW1iZXJzID0gL1xcZC8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIGNvbnN0IGhhc05vbkFscGhhc051bWVyaWNzID0gL1xcVy8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIC8vIEVuc3VyZSBsZW5ndGhcbiAgICAgICAgICBpZiAobWFzdGVyS2V5Lmxlbmd0aCA8IDE0KSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgYXQgbGVhc3QgMyBvdXQgb2YgNCByZXF1aXJlbWVudHMgcGFzc2VkXG4gICAgICAgICAgaWYgKGhhc1VwcGVyQ2FzZSArIGhhc0xvd2VyQ2FzZSArIGhhc051bWJlcnMgKyBoYXNOb25BbHBoYXNOdW1lcmljcyA8IDMpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1NlY3VyaXR5IGxvZyBkaXNhYmxlZCcsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ1NlY3VyaXR5IGNoZWNrcyBpbiBsb2dzIG1heSBleHBvc2UgdnVsbmVyYWJpbGl0aWVzIHRvIGFueW9uZSB3aXRoIGFjY2VzcyB0byBsb2dzLicsXG4gICAgICAgIHNvbHV0aW9uOiBcIkNoYW5nZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiB0byAnc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2c6IGZhbHNlJy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoY29uZmlnLnNlY3VyaXR5ICYmIGNvbmZpZy5zZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnQ2xpZW50IGNsYXNzIGNyZWF0aW9uIGRpc2FibGVkJyxcbiAgICAgICAgd2FybmluZzpcbiAgICAgICAgICAnQXR0YWNrZXJzIGFyZSBhbGxvd2VkIHRvIGNyZWF0ZSBuZXcgY2xhc3NlcyB3aXRob3V0IHJlc3RyaWN0aW9uIGFuZCBmbG9vZCB0aGUgZGF0YWJhc2UuJyxcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdhbGxvd0NsaWVudENsYXNzQ3JlYXRpb246IGZhbHNlJy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiB8fCBjb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1VzZXJzIGFyZSBjcmVhdGVkIHdpdGhvdXQgcHVibGljIGFjY2VzcycsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ1VzZXJzIHdpdGggcHVibGljIHJlYWQgYWNjZXNzIGFyZSBleHBvc2VkIHRvIGFueW9uZSB3aG8ga25vd3MgdGhlaXIgb2JqZWN0IElEcywgb3IgdG8gYW55b25lIHdobyBjYW4gcXVlcnkgdGhlIFBhcnNlLlVzZXIgY2xhc3MuJyxcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdlbmZvcmNlUHJpdmF0ZVVzZXJzOiB0cnVlJy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIWNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdJbnNlY3VyZSBhdXRoIGFkYXB0ZXJzIGRpc2FibGVkJyxcbiAgICAgICAgd2FybmluZzpcbiAgICAgICAgICBcIkF0dGFja2VycyBtYXkgZXhwbG9yZSBpbnNlY3VyZSBhdXRoIGFkYXB0ZXJzJyB2dWxuZXJhYmlsaXRpZXMgYW5kIGxvZyBpbiBvbiBiZWhhbGYgb2YgYW5vdGhlciB1c2VyLlwiLFxuICAgICAgICBzb2x1dGlvbjogXCJDaGFuZ2UgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gdG8gJ2VuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzOiBmYWxzZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5lbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ0dyYXBoUUwgcHVibGljIGludHJvc3BlY3Rpb24gZGlzYWJsZWQnLFxuICAgICAgICB3YXJuaW5nOiAnR3JhcGhRTCBwdWJsaWMgaW50cm9zcGVjdGlvbiBpcyBlbmFibGVkLCB3aGljaCBhbGxvd3MgYW55b25lIHRvIGFjY2VzcyB0aGUgR3JhcGhRTCBzY2hlbWEuJyxcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdncmFwaFFMUHVibGljSW50cm9zcGVjdGlvbjogZmFsc2UnLiBZb3Ugd2lsbCBuZWVkIHRvIHVzZSBtYXN0ZXIga2V5IG9yIG1haW50ZW5hbmNlIGtleSB0byBhY2Nlc3MgdGhlIEdyYXBoUUwgc2NoZW1hLlwiLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGlmIChjb25maWcuZ3JhcGhRTFB1YmxpY0ludHJvc3BlY3Rpb24gIT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdQdWJsaWMgZGF0YWJhc2UgZXhwbGFpbiBkaXNhYmxlZCcsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ0RhdGFiYXNlIGV4cGxhaW4gcXVlcmllcyBhcmUgcHVibGljbHkgYWNjZXNzaWJsZSwgd2hpY2ggbWF5IGV4cG9zZSBzZW5zaXRpdmUgZGF0YWJhc2UgcGVyZm9ybWFuY2UgaW5mb3JtYXRpb24gYW5kIHNjaGVtYSBkZXRhaWxzLicsXG4gICAgICAgIHNvbHV0aW9uOlxuICAgICAgICAgIFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdkYXRhYmFzZU9wdGlvbnMuYWxsb3dQdWJsaWNFeHBsYWluOiBmYWxzZScuIFlvdSB3aWxsIG5lZWQgdG8gdXNlIG1hc3RlciBrZXkgdG8gcnVuIGV4cGxhaW4gcXVlcmllcy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBjb25maWcuZGF0YWJhc2VPcHRpb25zPy5hbGxvd1B1YmxpY0V4cGxhaW4gPT09IHRydWUgfHxcbiAgICAgICAgICAgIGNvbmZpZy5kYXRhYmFzZU9wdGlvbnM/LmFsbG93UHVibGljRXhwbGFpbiA9PSBudWxsXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdSZXF1ZXN0IGNvbXBsZXhpdHkgbGltaXRzIGVuYWJsZWQnLFxuICAgICAgICB3YXJuaW5nOlxuICAgICAgICAgICdPbmUgb3IgbW9yZSByZXF1ZXN0IGNvbXBsZXhpdHkgbGltaXRzIGFyZSBkaXNhYmxlZCwgd2hpY2ggbWF5IGFsbG93IGRlbmlhbC1vZi1zZXJ2aWNlIGF0dGFja3MgdGhyb3VnaCBkZWVwbHkgbmVzdGVkIG9yIGV4Y2Vzc2l2ZWx5IGJyb2FkIHF1ZXJpZXMuJyxcbiAgICAgICAgc29sdXRpb246XG4gICAgICAgICAgXCJFbnN1cmUgYWxsIHByb3BlcnRpZXMgaW4gJ3JlcXVlc3RDb21wbGV4aXR5JyBhcmUgc2V0IHRvIHBvc2l0aXZlIGludGVnZXJzLiBTZXQgdG8gJy0xJyBvbmx5IGlmIHlvdSBoYXZlIG90aGVyIG1pdGlnYXRpb25zIGluIHBsYWNlLlwiLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJjID0gY29uZmlnLnJlcXVlc3RDb21wbGV4aXR5O1xuICAgICAgICAgIGlmICghcmMpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHZhbHVlcyA9IFtyYy5pbmNsdWRlRGVwdGgsIHJjLmluY2x1ZGVDb3VudCwgcmMuc3VicXVlcnlEZXB0aCwgcmMucXVlcnlEZXB0aCwgcmMuZ3JhcGhRTERlcHRoLCByYy5ncmFwaFFMRmllbGRzXTtcbiAgICAgICAgICBpZiAodmFsdWVzLnNvbWUodiA9PiB2ID09PSAtMSkpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1Bhc3N3b3JkIHJlc2V0IGVuZHBvaW50IHVzZXIgZW51bWVyYXRpb24gbWl0aWdhdGVkJyxcbiAgICAgICAgd2FybmluZzpcbiAgICAgICAgICAnVGhlIHBhc3N3b3JkIHJlc2V0IGVuZHBvaW50IHJldHVybnMgZGlzdGluY3QgZXJyb3IgcmVzcG9uc2VzIGZvciBpbnZhbGlkIGVtYWlsIGFkZHJlc3Nlcywgd2hpY2ggYWxsb3dzIGF0dGFja2VycyB0byBlbnVtZXJhdGUgcmVnaXN0ZXJlZCB1c2Vycy4nLFxuICAgICAgICBzb2x1dGlvbjpcbiAgICAgICAgICBcIkNoYW5nZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiB0byAncGFzc3dvcmRQb2xpY3kucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbDogdHJ1ZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5wYXNzd29yZFBvbGljeT8ucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ0VtYWlsIHZlcmlmaWNhdGlvbiBlbmRwb2ludCB1c2VyIGVudW1lcmF0aW9uIG1pdGlnYXRlZCcsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ1RoZSBlbWFpbCB2ZXJpZmljYXRpb24gZW5kcG9pbnQgcmV0dXJucyBkaXN0aW5jdCBlcnJvciByZXNwb25zZXMgZm9yIGludmFsaWQgZW1haWwgYWRkcmVzc2VzLCB3aGljaCBhbGxvd3MgYXR0YWNrZXJzIHRvIGVudW1lcmF0ZSByZWdpc3RlcmVkIHVzZXJzLicsXG4gICAgICAgIHNvbHV0aW9uOlxuICAgICAgICAgIFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdlbWFpbFZlcmlmeVN1Y2Nlc3NPbkludmFsaWRFbWFpbDogdHJ1ZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5lbWFpbFZlcmlmeVN1Y2Nlc3NPbkludmFsaWRFbWFpbCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ0xpdmVRdWVyeSByZWdleCB0aW1lb3V0IGVuYWJsZWQnLFxuICAgICAgICB3YXJuaW5nOlxuICAgICAgICAgICdMaXZlUXVlcnkgcmVnZXggdGltZW91dCBpcyBkaXNhYmxlZC4gQSBtYWxpY2lvdXMgY2xpZW50IGNhbiBzdWJzY3JpYmUgd2l0aCBhIGNyYWZ0ZWQgJHJlZ2V4IHBhdHRlcm4gdGhhdCBjYXVzZXMgY2F0YXN0cm9waGljIGJhY2t0cmFja2luZywgYmxvY2tpbmcgdGhlIE5vZGUuanMgZXZlbnQgbG9vcCBhbmQgbWFraW5nIHRoZSBzZXJ2ZXIgdW5yZXNwb25zaXZlLicsXG4gICAgICAgIHNvbHV0aW9uOlxuICAgICAgICAgIFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdsaXZlUXVlcnkucmVnZXhUaW1lb3V0OiAxMDAnIHRvIHNldCBhIDEwMG1zIHRpbWVvdXQgZm9yIHJlZ2V4IGV2YWx1YXRpb24gaW4gTGl2ZVF1ZXJ5LlwiLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGlmIChjb25maWcubGl2ZVF1ZXJ5Py5jbGFzc05hbWVzPy5sZW5ndGggPiAwICYmIGNvbmZpZy5saXZlUXVlcnk/LnJlZ2V4VGltZW91dCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICBdO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ2hlY2tHcm91cFNlcnZlckNvbmZpZztcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxJQUFBQSxNQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxXQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFGLHNCQUFBLENBQUFGLE9BQUE7QUFBK0IsU0FBQUUsdUJBQUFHLENBQUEsV0FBQUEsQ0FBQSxJ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