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
    })];
  }
}
module.exports = CheckGroupServerConfig;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQ2hlY2siLCJyZXF1aXJlIiwiX0NoZWNrR3JvdXAiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX0NvbmZpZyIsIl9ub2RlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiQ2hlY2tHcm91cFNlcnZlckNvbmZpZyIsIkNoZWNrR3JvdXAiLCJzZXROYW1lIiwic2V0Q2hlY2tzIiwiY29uZmlnIiwiQ29uZmlnIiwiZ2V0IiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwiQ2hlY2siLCJ0aXRsZSIsIndhcm5pbmciLCJzb2x1dGlvbiIsImNoZWNrIiwibWFzdGVyS2V5IiwiaGFzVXBwZXJDYXNlIiwidGVzdCIsImhhc0xvd2VyQ2FzZSIsImhhc051bWJlcnMiLCJoYXNOb25BbHBoYXNOdW1lcmljcyIsImxlbmd0aCIsInNlY3VyaXR5IiwiZW5hYmxlQ2hlY2tMb2ciLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3Vwcy9DaGVja0dyb3VwU2VydmVyQ29uZmlnLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENoZWNrIH0gZnJvbSAnLi4vQ2hlY2snO1xuaW1wb3J0IENoZWNrR3JvdXAgZnJvbSAnLi4vQ2hlY2tHcm91cCc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uLy4uL0NvbmZpZyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbi8qKlxuICogVGhlIHNlY3VyaXR5IGNoZWNrcyBncm91cCBmb3IgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4gKiBDaGVja3MgY29tbW9uIFBhcnNlIFNlcnZlciBwYXJhbWV0ZXJzIHN1Y2ggYXMgYWNjZXNzIGtleXMuXG4gKiBAbWVtYmVyb2YgbW9kdWxlOlNlY3VyaXR5Q2hlY2tcbiAqL1xuY2xhc3MgQ2hlY2tHcm91cFNlcnZlckNvbmZpZyBleHRlbmRzIENoZWNrR3JvdXAge1xuICBzZXROYW1lKCkge1xuICAgIHJldHVybiAnUGFyc2UgU2VydmVyIENvbmZpZ3VyYXRpb24nO1xuICB9XG4gIHNldENoZWNrcygpIHtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgIHJldHVybiBbXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1NlY3VyZSBtYXN0ZXIga2V5JyxcbiAgICAgICAgd2FybmluZzogJ1RoZSBQYXJzZSBTZXJ2ZXIgbWFzdGVyIGtleSBpcyBpbnNlY3VyZSBhbmQgdnVsbmVyYWJsZSB0byBicnV0ZSBmb3JjZSBhdHRhY2tzLicsXG4gICAgICAgIHNvbHV0aW9uOlxuICAgICAgICAgICdDaG9vc2UgYSBsb25nZXIgYW5kL29yIG1vcmUgY29tcGxleCBtYXN0ZXIga2V5IHdpdGggYSBjb21iaW5hdGlvbiBvZiB1cHBlci0gYW5kIGxvd2VyY2FzZSBjaGFyYWN0ZXJzLCBudW1iZXJzIGFuZCBzcGVjaWFsIGNoYXJhY3RlcnMuJyxcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBjb25zdCBtYXN0ZXJLZXkgPSBjb25maWcubWFzdGVyS2V5O1xuICAgICAgICAgIGNvbnN0IGhhc1VwcGVyQ2FzZSA9IC9bQS1aXS8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIGNvbnN0IGhhc0xvd2VyQ2FzZSA9IC9bYS16XS8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIGNvbnN0IGhhc051bWJlcnMgPSAvXFxkLy50ZXN0KG1hc3RlcktleSk7XG4gICAgICAgICAgY29uc3QgaGFzTm9uQWxwaGFzTnVtZXJpY3MgPSAvXFxXLy50ZXN0KG1hc3RlcktleSk7XG4gICAgICAgICAgLy8gRW5zdXJlIGxlbmd0aFxuICAgICAgICAgIGlmIChtYXN0ZXJLZXkubGVuZ3RoIDwgMTQpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSBhdCBsZWFzdCAzIG91dCBvZiA0IHJlcXVpcmVtZW50cyBwYXNzZWRcbiAgICAgICAgICBpZiAoaGFzVXBwZXJDYXNlICsgaGFzTG93ZXJDYXNlICsgaGFzTnVtYmVycyArIGhhc05vbkFscGhhc051bWVyaWNzIDwgMykge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnU2VjdXJpdHkgbG9nIGRpc2FibGVkJyxcbiAgICAgICAgd2FybmluZzpcbiAgICAgICAgICAnU2VjdXJpdHkgY2hlY2tzIGluIGxvZ3MgbWF5IGV4cG9zZSB2dWxuZXJhYmlsaXRpZXMgdG8gYW55b25lIHdpdGggYWNjZXNzIHRvIGxvZ3MuJyxcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdzZWN1cml0eS5lbmFibGVDaGVja0xvZzogZmFsc2UnLlwiLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGlmIChjb25maWcuc2VjdXJpdHkgJiYgY29uZmlnLnNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdDbGllbnQgY2xhc3MgY3JlYXRpb24gZGlzYWJsZWQnLFxuICAgICAgICB3YXJuaW5nOlxuICAgICAgICAgICdBdHRhY2tlcnMgYXJlIGFsbG93ZWQgdG8gY3JlYXRlIG5ldyBjbGFzc2VzIHdpdGhvdXQgcmVzdHJpY3Rpb24gYW5kIGZsb29kIHRoZSBkYXRhYmFzZS4nLFxuICAgICAgICBzb2x1dGlvbjogXCJDaGFuZ2UgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gdG8gJ2FsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbjogZmFsc2UnLlwiLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGlmIChjb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIHx8IGNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnVXNlcnMgYXJlIGNyZWF0ZWQgd2l0aG91dCBwdWJsaWMgYWNjZXNzJyxcbiAgICAgICAgd2FybmluZzpcbiAgICAgICAgICAnVXNlcnMgd2l0aCBwdWJsaWMgcmVhZCBhY2Nlc3MgYXJlIGV4cG9zZWQgdG8gYW55b25lIHdobyBrbm93cyB0aGVpciBvYmplY3QgSURzLCBvciB0byBhbnlvbmUgd2hvIGNhbiBxdWVyeSB0aGUgUGFyc2UuVXNlciBjbGFzcy4nLFxuICAgICAgICBzb2x1dGlvbjogXCJDaGFuZ2UgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gdG8gJ2VuZm9yY2VQcml2YXRlVXNlcnM6IHRydWUnLlwiLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGlmICghY29uZmlnLmVuZm9yY2VQcml2YXRlVXNlcnMpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgXTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENoZWNrR3JvdXBTZXJ2ZXJDb25maWc7XG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBQUEsTUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsV0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsT0FBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUksS0FBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQStCLFNBQUFFLHVCQUFBRyxDQUFBLFdBQUFBLENBQUEs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