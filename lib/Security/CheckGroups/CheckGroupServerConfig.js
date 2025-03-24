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
    })];
  }
}
module.exports = CheckGroupServerConfig;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQ2hlY2siLCJyZXF1aXJlIiwiX0NoZWNrR3JvdXAiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX0NvbmZpZyIsIl9ub2RlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiQ2hlY2tHcm91cFNlcnZlckNvbmZpZyIsIkNoZWNrR3JvdXAiLCJzZXROYW1lIiwic2V0Q2hlY2tzIiwiY29uZmlnIiwiQ29uZmlnIiwiZ2V0IiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwiQ2hlY2siLCJ0aXRsZSIsIndhcm5pbmciLCJzb2x1dGlvbiIsImNoZWNrIiwibWFzdGVyS2V5IiwiaGFzVXBwZXJDYXNlIiwidGVzdCIsImhhc0xvd2VyQ2FzZSIsImhhc051bWJlcnMiLCJoYXNOb25BbHBoYXNOdW1lcmljcyIsImxlbmd0aCIsInNlY3VyaXR5IiwiZW5hYmxlQ2hlY2tMb2ciLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwiZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL1NlY3VyaXR5L0NoZWNrR3JvdXBzL0NoZWNrR3JvdXBTZXJ2ZXJDb25maWcuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ2hlY2sgfSBmcm9tICcuLi9DaGVjayc7XG5pbXBvcnQgQ2hlY2tHcm91cCBmcm9tICcuLi9DaGVja0dyb3VwJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vLi4vQ29uZmlnJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuLyoqXG4gKiBUaGUgc2VjdXJpdHkgY2hlY2tzIGdyb3VwIGZvciBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbi5cbiAqIENoZWNrcyBjb21tb24gUGFyc2UgU2VydmVyIHBhcmFtZXRlcnMgc3VjaCBhcyBhY2Nlc3Mga2V5cy5cbiAqIEBtZW1iZXJvZiBtb2R1bGU6U2VjdXJpdHlDaGVja1xuICovXG5jbGFzcyBDaGVja0dyb3VwU2VydmVyQ29uZmlnIGV4dGVuZHMgQ2hlY2tHcm91cCB7XG4gIHNldE5hbWUoKSB7XG4gICAgcmV0dXJuICdQYXJzZSBTZXJ2ZXIgQ29uZmlndXJhdGlvbic7XG4gIH1cbiAgc2V0Q2hlY2tzKCkge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgcmV0dXJuIFtcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnU2VjdXJlIG1hc3RlciBrZXknLFxuICAgICAgICB3YXJuaW5nOiAnVGhlIFBhcnNlIFNlcnZlciBtYXN0ZXIga2V5IGlzIGluc2VjdXJlIGFuZCB2dWxuZXJhYmxlIHRvIGJydXRlIGZvcmNlIGF0dGFja3MuJyxcbiAgICAgICAgc29sdXRpb246XG4gICAgICAgICAgJ0Nob29zZSBhIGxvbmdlciBhbmQvb3IgbW9yZSBjb21wbGV4IG1hc3RlciBrZXkgd2l0aCBhIGNvbWJpbmF0aW9uIG9mIHVwcGVyLSBhbmQgbG93ZXJjYXNlIGNoYXJhY3RlcnMsIG51bWJlcnMgYW5kIHNwZWNpYWwgY2hhcmFjdGVycy4nLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IG1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXk7XG4gICAgICAgICAgY29uc3QgaGFzVXBwZXJDYXNlID0gL1tBLVpdLy50ZXN0KG1hc3RlcktleSk7XG4gICAgICAgICAgY29uc3QgaGFzTG93ZXJDYXNlID0gL1thLXpdLy50ZXN0KG1hc3RlcktleSk7XG4gICAgICAgICAgY29uc3QgaGFzTnVtYmVycyA9IC9cXGQvLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICBjb25zdCBoYXNOb25BbHBoYXNOdW1lcmljcyA9IC9cXFcvLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICAvLyBFbnN1cmUgbGVuZ3RoXG4gICAgICAgICAgaWYgKG1hc3RlcktleS5sZW5ndGggPCAxNCkge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIGF0IGxlYXN0IDMgb3V0IG9mIDQgcmVxdWlyZW1lbnRzIHBhc3NlZFxuICAgICAgICAgIGlmIChoYXNVcHBlckNhc2UgKyBoYXNMb3dlckNhc2UgKyBoYXNOdW1iZXJzICsgaGFzTm9uQWxwaGFzTnVtZXJpY3MgPCAzKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdTZWN1cml0eSBsb2cgZGlzYWJsZWQnLFxuICAgICAgICB3YXJuaW5nOlxuICAgICAgICAgICdTZWN1cml0eSBjaGVja3MgaW4gbG9ncyBtYXkgZXhwb3NlIHZ1bG5lcmFiaWxpdGllcyB0byBhbnlvbmUgd2l0aCBhY2Nlc3MgdG8gbG9ncy4nLFxuICAgICAgICBzb2x1dGlvbjogXCJDaGFuZ2UgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gdG8gJ3NlY3VyaXR5LmVuYWJsZUNoZWNrTG9nOiBmYWxzZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5zZWN1cml0eSAmJiBjb25maWcuc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ0NsaWVudCBjbGFzcyBjcmVhdGlvbiBkaXNhYmxlZCcsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ0F0dGFja2VycyBhcmUgYWxsb3dlZCB0byBjcmVhdGUgbmV3IGNsYXNzZXMgd2l0aG91dCByZXN0cmljdGlvbiBhbmQgZmxvb2QgdGhlIGRhdGFiYXNlLicsXG4gICAgICAgIHNvbHV0aW9uOiBcIkNoYW5nZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiB0byAnYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uOiBmYWxzZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gfHwgY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdVc2VycyBhcmUgY3JlYXRlZCB3aXRob3V0IHB1YmxpYyBhY2Nlc3MnLFxuICAgICAgICB3YXJuaW5nOlxuICAgICAgICAgICdVc2VycyB3aXRoIHB1YmxpYyByZWFkIGFjY2VzcyBhcmUgZXhwb3NlZCB0byBhbnlvbmUgd2hvIGtub3dzIHRoZWlyIG9iamVjdCBJRHMsIG9yIHRvIGFueW9uZSB3aG8gY2FuIHF1ZXJ5IHRoZSBQYXJzZS5Vc2VyIGNsYXNzLicsXG4gICAgICAgIHNvbHV0aW9uOiBcIkNoYW5nZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiB0byAnZW5mb3JjZVByaXZhdGVVc2VyczogdHJ1ZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCFjb25maWcuZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnSW5zZWN1cmUgYXV0aCBhZGFwdGVycyBkaXNhYmxlZCcsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgXCJBdHRhY2tlcnMgbWF5IGV4cGxvcmUgaW5zZWN1cmUgYXV0aCBhZGFwdGVycycgdnVsbmVyYWJpbGl0aWVzIGFuZCBsb2cgaW4gb24gYmVoYWxmIG9mIGFub3RoZXIgdXNlci5cIixcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdlbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVyczogZmFsc2UnLlwiLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGlmIChjb25maWcuZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIF07XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDaGVja0dyb3VwU2VydmVyQ29uZmlnO1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQUFBLE1BQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFdBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFJLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUYsT0FBQTtBQUErQixTQUFBRSx1QkFBQUcsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUUvQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUcsc0JBQXNCLFNBQVNDLG1CQUFVLENBQUM7RUFDOUNDLE9BQU9BLENBQUEsRUFBRztJQUNSLE9BQU8sNEJBQTRCO0VBQ3JDO0VBQ0FDLFNBQVNBLENBQUEsRUFBRztJQUNWLE1BQU1DLE1BQU0sR0FBR0MsZUFBTSxDQUFDQyxHQUFHLENBQUNDLGFBQUssQ0FBQ0MsYUFBYSxDQUFDO0lBQzlDLE9BQU8sQ0FDTCxJQUFJQyxZQUFLLENBQUM7TUFDUkMsS0FBSyxFQUFFLG1CQUFtQjtNQUMxQkMsT0FBTyxFQUFFLGdGQUFnRjtNQUN6RkMsUUFBUSxFQUNOLHVJQUF1STtNQUN6SUMsS0FBSyxFQUFFQSxDQUFBLEtBQU07UUFDWCxNQUFNQyxTQUFTLEdBQUdWLE1BQU0sQ0FBQ1UsU0FBUztRQUNsQyxNQUFNQyxZQUFZLEdBQUcsT0FBTyxDQUFDQyxJQUFJLENBQUNGLFNBQVMsQ0FBQztRQUM1QyxNQUFNRyxZQUFZLEdBQUcsT0FBTyxDQUFDRCxJQUFJLENBQUNGLFNBQVMsQ0FBQztRQUM1QyxNQUFNSSxVQUFVLEdBQUcsSUFBSSxDQUFDRixJQUFJLENBQUNGLFNBQVMsQ0FBQztRQUN2QyxNQUFNSyxvQkFBb0IsR0FBRyxJQUFJLENBQUNILElBQUksQ0FBQ0YsU0FBUyxDQUFDO1FBQ2pEO1FBQ0EsSUFBSUEsU0FBUyxDQUFDTSxNQUFNLEdBQUcsRUFBRSxFQUFFO1VBQ3pCLE1BQU0sQ0FBQztRQUNUO1FBQ0E7UUFDQSxJQUFJTCxZQUFZLEdBQUdFLFlBQVksR0FBR0MsVUFBVSxHQUFHQyxvQkFBb0IsR0FBRyxDQUFDLEVBQUU7VUFDdkUsTUFBTSxDQUFDO1FBQ1Q7TUFDRjtJQUNGLENBQUMsQ0FBQyxFQUNGLElBQUlWLFlBQUssQ0FBQztNQUNSQyxLQUFLLEVBQUUsdUJBQXVCO01BQzlCQyxPQUFPLEVBQ0wsbUZBQW1GO01BQ3JGQyxRQUFRLEVBQUUsd0VBQXdFO01BQ2xGQyxLQUFLLEVBQUVBLENBQUEsS0FBTTtRQUNYLElBQUlULE1BQU0sQ0FBQ2lCLFFBQVEsSUFBSWpCLE1BQU0sQ0FBQ2lCLFFBQVEsQ0FBQ0MsY0FBYyxFQUFFO1VBQ3JELE1BQU0sQ0FBQztRQUNUO01BQ0Y7SUFDRixDQUFDLENBQUMsRUFDRixJQUFJYixZQUFLLENBQUM7TUFDUkMsS0FBSyxFQUFFLGdDQUFnQztNQUN2Q0MsT0FBTyxFQUNMLHlGQUF5RjtNQUMzRkMsUUFBUSxFQUFFLHlFQUF5RTtNQUNuRkMsS0FBSyxFQUFFQSxDQUFBLEtBQU07UUFDWCxJQUFJVCxNQUFNLENBQUNtQix3QkFBd0IsSUFBSW5CLE1BQU0sQ0FBQ21CLHdCQUF3QixJQUFJLElBQUksRUFBRTtVQUM5RSxNQUFNLENBQUM7UUFDVDtNQUNGO0lBQ0YsQ0FBQyxDQUFDLEVBQ0YsSUFBSWQsWUFBSyxDQUFDO01BQ1JDLEtBQUssRUFBRSx5Q0FBeUM7TUFDaERDLE9BQU8sRUFDTCxrSUFBa0k7TUFDcElDLFFBQVEsRUFBRSxtRUFBbUU7TUFDN0VDLEtBQUssRUFBRUEsQ0FBQSxLQUFNO1FBQ1gsSUFBSSxDQUFDVCxNQUFNLENBQUNvQixtQkFBbUIsRUFBRTtVQUMvQixNQUFNLENBQUM7UUFDVDtNQUNGO0lBQ0YsQ0FBQyxDQUFDLEVBQ0YsSUFBSWYsWUFBSyxDQUFDO01BQ1JDLEtBQUssRUFBRSxpQ0FBaUM7TUFDeENDLE9BQU8sRUFDTCxxR0FBcUc7TUFDdkdDLFFBQVEsRUFBRSwyRUFBMkU7TUFDckZDLEtBQUssRUFBRUEsQ0FBQSxLQUFNO1FBQ1gsSUFBSVQsTUFBTSxDQUFDcUIsMEJBQTBCLEtBQUssS0FBSyxFQUFFO1VBQy9DLE1BQU0sQ0FBQztRQUNUO01BQ0Y7SUFDRixDQUFDLENBQUMsQ0FDSDtFQUNIO0FBQ0Y7QUFFQUMsTUFBTSxDQUFDQyxPQUFPLEdBQUczQixzQkFBc0IiLCJpZ25vcmVMaXN0IjpbXX0=