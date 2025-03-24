"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for GitHub.
 * @class GitHubAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - The GitHub App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - The GitHub App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @param {Object} authData - The authentication data provided by the client.
 * @param {string} authData.code - The authorization code from GitHub. Required for secure authentication.
 * @param {string} [authData.id] - **[DEPRECATED]** The GitHub user ID (required for insecure authentication).
 * @param {string} [authData.access_token] - **[DEPRECATED]** The GitHub access token (required for insecure authentication).
 *
 * @description
 * ## Parse Server Configuration
 * * To configure Parse Server for GitHub authentication, use the following structure:
 * ```json
 * {
 *  "auth": {
 *   "github": {
 *     "clientId": "12345",
 *     "clientSecret": "abcde"
 *   }
 * }
 * ```
 *
 * The GitHub adapter exchanges the `authData.code` provided by the client for an access token using GitHub's OAuth API. The following `authData` field is required:
 * - `code`
 *
 * ## Insecure Authentication (Not Recommended)
 * Insecure authentication uses the `authData.id` and `authData.access_token` provided by the client. This flow is insecure, deprecated, and poses potential security risks. The following `authData` fields are required:
 * - `id` (**[DEPRECATED]**): The GitHub user ID.
 * - `access_token` (**[DEPRECATED]**): The GitHub access token.
 * To configure Parse Server for insecure authentication, use the following structure:
 * ```json
 * {
 *  "auth": {
 *    "github": {
 *    "enableInsecureAuth": true
 *  }
 * }
 * ```
 *
 * ### Deprecation Notice
 * The `enableInsecureAuth` option and insecure `authData` fields (`id`, `access_token`) are deprecated and will be removed in future versions. Use secure authentication with `clientId` and `clientSecret`.
 *
 * @example <caption>Secure Authentication Example</caption>
 * // Example authData for secure authentication:
 * const authData = {
 *   github: {
 *     code: "abc123def456ghi789"
 *   }
 * };
 *
 * @example <caption>Insecure Authentication Example (Not Recommended)</caption>
 * // Example authData for insecure authentication:
 * const authData = {
 *   github: {
 *     id: "1234567",
 *     access_token: "abc123def456ghi789" // Deprecated.
 *   }
 * };
 *
 * @note `enableInsecureAuth` will be removed in future versions. Use secure authentication with `clientId` and `clientSecret`.
 * @note Secure authentication exchanges the `code` provided by the client for an access token using GitHub's OAuth API.
 *
 * @see {@link https://docs.github.com/en/developers/apps/authorizing-oauth-apps GitHub OAuth Documentation}
 */

class GitHubAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super('GitHub');
  }
  async getAccessTokenFromCode(authData) {
    const tokenUrl = 'https://github.com/login/oauth/access_token';
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: authData.code
      })
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `Failed to exchange code for token: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, data.error_description || data.error);
    }
    return data.access_token;
  }
  async getUserFromAccessToken(accessToken) {
    const userApiUrl = 'https://api.github.com/user';
    const response = await fetch(userApiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `Failed to fetch GitHub user: ${response.statusText}`);
    }
    const userData = await response.json();
    if (!userData.id || !userData.login) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Invalid GitHub user data received.');
    }
    return userData;
  }
}
var _default = exports.default = new GitHubAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiR2l0SHViQWRhcHRlciIsIkJhc2VDb2RlQXV0aEFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsImdldEFjY2Vzc1Rva2VuRnJvbUNvZGUiLCJhdXRoRGF0YSIsInRva2VuVXJsIiwicmVzcG9uc2UiLCJmZXRjaCIsIm1ldGhvZCIsImhlYWRlcnMiLCJBY2NlcHQiLCJib2R5IiwiSlNPTiIsInN0cmluZ2lmeSIsImNsaWVudF9pZCIsImNsaWVudElkIiwiY2xpZW50X3NlY3JldCIsImNsaWVudFNlY3JldCIsImNvZGUiLCJvayIsIlBhcnNlIiwiRXJyb3IiLCJWQUxJREFUSU9OX0VSUk9SIiwic3RhdHVzVGV4dCIsImRhdGEiLCJqc29uIiwiZXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiZXJyb3JfZGVzY3JpcHRpb24iLCJhY2Nlc3NfdG9rZW4iLCJnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuIiwiYWNjZXNzVG9rZW4iLCJ1c2VyQXBpVXJsIiwiQXV0aG9yaXphdGlvbiIsInVzZXJEYXRhIiwiaWQiLCJsb2dpbiIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL2dpdGh1Yi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFBhcnNlIFNlcnZlciBhdXRoZW50aWNhdGlvbiBhZGFwdGVyIGZvciBHaXRIdWIuXG4gKiBAY2xhc3MgR2l0SHViQWRhcHRlclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBUaGUgYWRhcHRlciBjb25maWd1cmF0aW9uIG9wdGlvbnMuXG4gKiBAcGFyYW0ge3N0cmluZ30gb3B0aW9ucy5jbGllbnRJZCAtIFRoZSBHaXRIdWIgQXBwIENsaWVudCBJRC4gUmVxdWlyZWQgZm9yIHNlY3VyZSBhdXRoZW50aWNhdGlvbi5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRpb25zLmNsaWVudFNlY3JldCAtIFRoZSBHaXRIdWIgQXBwIENsaWVudCBTZWNyZXQuIFJlcXVpcmVkIGZvciBzZWN1cmUgYXV0aGVudGljYXRpb24uXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmVuYWJsZUluc2VjdXJlQXV0aD1mYWxzZV0gLSAqKltERVBSRUNBVEVEXSoqIEVuYWJsZSBpbnNlY3VyZSBhdXRoZW50aWNhdGlvbiAobm90IHJlY29tbWVuZGVkKS5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgLSBUaGUgYXV0aGVudGljYXRpb24gZGF0YSBwcm92aWRlZCBieSB0aGUgY2xpZW50LlxuICogQHBhcmFtIHtzdHJpbmd9IGF1dGhEYXRhLmNvZGUgLSBUaGUgYXV0aG9yaXphdGlvbiBjb2RlIGZyb20gR2l0SHViLiBSZXF1aXJlZCBmb3Igc2VjdXJlIGF1dGhlbnRpY2F0aW9uLlxuICogQHBhcmFtIHtzdHJpbmd9IFthdXRoRGF0YS5pZF0gLSAqKltERVBSRUNBVEVEXSoqIFRoZSBHaXRIdWIgdXNlciBJRCAocmVxdWlyZWQgZm9yIGluc2VjdXJlIGF1dGhlbnRpY2F0aW9uKS5cbiAqIEBwYXJhbSB7c3RyaW5nfSBbYXV0aERhdGEuYWNjZXNzX3Rva2VuXSAtICoqW0RFUFJFQ0FURURdKiogVGhlIEdpdEh1YiBhY2Nlc3MgdG9rZW4gKHJlcXVpcmVkIGZvciBpbnNlY3VyZSBhdXRoZW50aWNhdGlvbikuXG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiAjIyBQYXJzZSBTZXJ2ZXIgQ29uZmlndXJhdGlvblxuICogKiBUbyBjb25maWd1cmUgUGFyc2UgU2VydmVyIGZvciBHaXRIdWIgYXV0aGVudGljYXRpb24sIHVzZSB0aGUgZm9sbG93aW5nIHN0cnVjdHVyZTpcbiAqIGBgYGpzb25cbiAqIHtcbiAqICBcImF1dGhcIjoge1xuICogICBcImdpdGh1YlwiOiB7XG4gKiAgICAgXCJjbGllbnRJZFwiOiBcIjEyMzQ1XCIsXG4gKiAgICAgXCJjbGllbnRTZWNyZXRcIjogXCJhYmNkZVwiXG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqIFRoZSBHaXRIdWIgYWRhcHRlciBleGNoYW5nZXMgdGhlIGBhdXRoRGF0YS5jb2RlYCBwcm92aWRlZCBieSB0aGUgY2xpZW50IGZvciBhbiBhY2Nlc3MgdG9rZW4gdXNpbmcgR2l0SHViJ3MgT0F1dGggQVBJLiBUaGUgZm9sbG93aW5nIGBhdXRoRGF0YWAgZmllbGQgaXMgcmVxdWlyZWQ6XG4gKiAtIGBjb2RlYFxuICpcbiAqICMjIEluc2VjdXJlIEF1dGhlbnRpY2F0aW9uIChOb3QgUmVjb21tZW5kZWQpXG4gKiBJbnNlY3VyZSBhdXRoZW50aWNhdGlvbiB1c2VzIHRoZSBgYXV0aERhdGEuaWRgIGFuZCBgYXV0aERhdGEuYWNjZXNzX3Rva2VuYCBwcm92aWRlZCBieSB0aGUgY2xpZW50LiBUaGlzIGZsb3cgaXMgaW5zZWN1cmUsIGRlcHJlY2F0ZWQsIGFuZCBwb3NlcyBwb3RlbnRpYWwgc2VjdXJpdHkgcmlza3MuIFRoZSBmb2xsb3dpbmcgYGF1dGhEYXRhYCBmaWVsZHMgYXJlIHJlcXVpcmVkOlxuICogLSBgaWRgICgqKltERVBSRUNBVEVEXSoqKTogVGhlIEdpdEh1YiB1c2VyIElELlxuICogLSBgYWNjZXNzX3Rva2VuYCAoKipbREVQUkVDQVRFRF0qKik6IFRoZSBHaXRIdWIgYWNjZXNzIHRva2VuLlxuICogVG8gY29uZmlndXJlIFBhcnNlIFNlcnZlciBmb3IgaW5zZWN1cmUgYXV0aGVudGljYXRpb24sIHVzZSB0aGUgZm9sbG93aW5nIHN0cnVjdHVyZTpcbiAqIGBgYGpzb25cbiAqIHtcbiAqICBcImF1dGhcIjoge1xuICogICAgXCJnaXRodWJcIjoge1xuICogICAgXCJlbmFibGVJbnNlY3VyZUF1dGhcIjogdHJ1ZVxuICogIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqICMjIyBEZXByZWNhdGlvbiBOb3RpY2VcbiAqIFRoZSBgZW5hYmxlSW5zZWN1cmVBdXRoYCBvcHRpb24gYW5kIGluc2VjdXJlIGBhdXRoRGF0YWAgZmllbGRzIChgaWRgLCBgYWNjZXNzX3Rva2VuYCkgYXJlIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUgcmVtb3ZlZCBpbiBmdXR1cmUgdmVyc2lvbnMuIFVzZSBzZWN1cmUgYXV0aGVudGljYXRpb24gd2l0aCBgY2xpZW50SWRgIGFuZCBgY2xpZW50U2VjcmV0YC5cbiAqXG4gKiBAZXhhbXBsZSA8Y2FwdGlvbj5TZWN1cmUgQXV0aGVudGljYXRpb24gRXhhbXBsZTwvY2FwdGlvbj5cbiAqIC8vIEV4YW1wbGUgYXV0aERhdGEgZm9yIHNlY3VyZSBhdXRoZW50aWNhdGlvbjpcbiAqIGNvbnN0IGF1dGhEYXRhID0ge1xuICogICBnaXRodWI6IHtcbiAqICAgICBjb2RlOiBcImFiYzEyM2RlZjQ1NmdoaTc4OVwiXG4gKiAgIH1cbiAqIH07XG4gKlxuICogQGV4YW1wbGUgPGNhcHRpb24+SW5zZWN1cmUgQXV0aGVudGljYXRpb24gRXhhbXBsZSAoTm90IFJlY29tbWVuZGVkKTwvY2FwdGlvbj5cbiAqIC8vIEV4YW1wbGUgYXV0aERhdGEgZm9yIGluc2VjdXJlIGF1dGhlbnRpY2F0aW9uOlxuICogY29uc3QgYXV0aERhdGEgPSB7XG4gKiAgIGdpdGh1Yjoge1xuICogICAgIGlkOiBcIjEyMzQ1NjdcIixcbiAqICAgICBhY2Nlc3NfdG9rZW46IFwiYWJjMTIzZGVmNDU2Z2hpNzg5XCIgLy8gRGVwcmVjYXRlZC5cbiAqICAgfVxuICogfTtcbiAqXG4gKiBAbm90ZSBgZW5hYmxlSW5zZWN1cmVBdXRoYCB3aWxsIGJlIHJlbW92ZWQgaW4gZnV0dXJlIHZlcnNpb25zLiBVc2Ugc2VjdXJlIGF1dGhlbnRpY2F0aW9uIHdpdGggYGNsaWVudElkYCBhbmQgYGNsaWVudFNlY3JldGAuXG4gKiBAbm90ZSBTZWN1cmUgYXV0aGVudGljYXRpb24gZXhjaGFuZ2VzIHRoZSBgY29kZWAgcHJvdmlkZWQgYnkgdGhlIGNsaWVudCBmb3IgYW4gYWNjZXNzIHRva2VuIHVzaW5nIEdpdEh1YidzIE9BdXRoIEFQSS5cbiAqXG4gKiBAc2VlIHtAbGluayBodHRwczovL2RvY3MuZ2l0aHViLmNvbS9lbi9kZXZlbG9wZXJzL2FwcHMvYXV0aG9yaXppbmctb2F1dGgtYXBwcyBHaXRIdWIgT0F1dGggRG9jdW1lbnRhdGlvbn1cbiAqL1xuXG5pbXBvcnQgQmFzZUNvZGVBdXRoQWRhcHRlciBmcm9tICcuL0Jhc2VDb2RlQXV0aEFkYXB0ZXInO1xuY2xhc3MgR2l0SHViQWRhcHRlciBleHRlbmRzIEJhc2VDb2RlQXV0aEFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcignR2l0SHViJyk7XG4gIH1cbiAgYXN5bmMgZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZShhdXRoRGF0YSkge1xuICAgIGNvbnN0IHRva2VuVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbi9vYXV0aC9hY2Nlc3NfdG9rZW4nO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godG9rZW5VcmwsIHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICBBY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGNsaWVudF9pZDogdGhpcy5jbGllbnRJZCxcbiAgICAgICAgY2xpZW50X3NlY3JldDogdGhpcy5jbGllbnRTZWNyZXQsXG4gICAgICAgIGNvZGU6IGF1dGhEYXRhLmNvZGUsXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBgRmFpbGVkIHRvIGV4Y2hhbmdlIGNvZGUgZm9yIHRva2VuOiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICBpZiAoZGF0YS5lcnJvcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsIGRhdGEuZXJyb3JfZGVzY3JpcHRpb24gfHwgZGF0YS5lcnJvcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRhdGEuYWNjZXNzX3Rva2VuO1xuICB9XG5cbiAgYXN5bmMgZ2V0VXNlckZyb21BY2Nlc3NUb2tlbihhY2Nlc3NUb2tlbikge1xuICAgIGNvbnN0IHVzZXJBcGlVcmwgPSAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS91c2VyJztcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVzZXJBcGlVcmwsIHtcbiAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHthY2Nlc3NUb2tlbn1gLFxuICAgICAgICBBY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgYEZhaWxlZCB0byBmZXRjaCBHaXRIdWIgdXNlcjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGlmICghdXNlckRhdGEuaWQgfHwgIXVzZXJEYXRhLmxvZ2luKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgJ0ludmFsaWQgR2l0SHViIHVzZXIgZGF0YSByZWNlaXZlZC4nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdXNlckRhdGE7XG4gIH1cblxufVxuXG5leHBvcnQgZGVmYXVsdCBuZXcgR2l0SHViQWRhcHRlcigpO1xuXG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQXFFQSxJQUFBQSxvQkFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQXdELFNBQUFELHVCQUFBRSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBckV4RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUdBLE1BQU1HLGFBQWEsU0FBU0MsNEJBQW1CLENBQUM7RUFDOUNDLFdBQVdBLENBQUEsRUFBRztJQUNaLEtBQUssQ0FBQyxRQUFRLENBQUM7RUFDakI7RUFDQSxNQUFNQyxzQkFBc0JBLENBQUNDLFFBQVEsRUFBRTtJQUNyQyxNQUFNQyxRQUFRLEdBQUcsNkNBQTZDO0lBQzlELE1BQU1DLFFBQVEsR0FBRyxNQUFNQyxLQUFLLENBQUNGLFFBQVEsRUFBRTtNQUNyQ0csTUFBTSxFQUFFLE1BQU07TUFDZEMsT0FBTyxFQUFFO1FBQ1AsY0FBYyxFQUFFLGtCQUFrQjtRQUNsQ0MsTUFBTSxFQUFFO01BQ1YsQ0FBQztNQUNEQyxJQUFJLEVBQUVDLElBQUksQ0FBQ0MsU0FBUyxDQUFDO1FBQ25CQyxTQUFTLEVBQUUsSUFBSSxDQUFDQyxRQUFRO1FBQ3hCQyxhQUFhLEVBQUUsSUFBSSxDQUFDQyxZQUFZO1FBQ2hDQyxJQUFJLEVBQUVkLFFBQVEsQ0FBQ2M7TUFDakIsQ0FBQztJQUNILENBQUMsQ0FBQztJQUVGLElBQUksQ0FBQ1osUUFBUSxDQUFDYSxFQUFFLEVBQUU7TUFDaEIsTUFBTSxJQUFJQyxLQUFLLENBQUNDLEtBQUssQ0FBQ0QsS0FBSyxDQUFDQyxLQUFLLENBQUNDLGdCQUFnQixFQUFFLHNDQUFzQ2hCLFFBQVEsQ0FBQ2lCLFVBQVUsRUFBRSxDQUFDO0lBQ2xIO0lBRUEsTUFBTUMsSUFBSSxHQUFHLE1BQU1sQixRQUFRLENBQUNtQixJQUFJLENBQUMsQ0FBQztJQUNsQyxJQUFJRCxJQUFJLENBQUNFLEtBQUssRUFBRTtNQUNkLE1BQU0sSUFBSU4sS0FBSyxDQUFDQyxLQUFLLENBQUNELEtBQUssQ0FBQ0MsS0FBSyxDQUFDTSxnQkFBZ0IsRUFBRUgsSUFBSSxDQUFDSSxpQkFBaUIsSUFBSUosSUFBSSxDQUFDRSxLQUFLLENBQUM7SUFDM0Y7SUFFQSxPQUFPRixJQUFJLENBQUNLLFlBQVk7RUFDMUI7RUFFQSxNQUFNQyxzQkFBc0JBLENBQUNDLFdBQVcsRUFBRTtJQUN4QyxNQUFNQyxVQUFVLEdBQUcsNkJBQTZCO0lBQ2hELE1BQU0xQixRQUFRLEdBQUcsTUFBTUMsS0FBSyxDQUFDeUIsVUFBVSxFQUFFO01BQ3ZDeEIsTUFBTSxFQUFFLEtBQUs7TUFDYkMsT0FBTyxFQUFFO1FBQ1B3QixhQUFhLEVBQUUsVUFBVUYsV0FBVyxFQUFFO1FBQ3RDckIsTUFBTSxFQUFFO01BQ1Y7SUFDRixDQUFDLENBQUM7SUFFRixJQUFJLENBQUNKLFFBQVEsQ0FBQ2EsRUFBRSxFQUFFO01BQ2hCLE1BQU0sSUFBSUMsS0FBSyxDQUFDQyxLQUFLLENBQUNELEtBQUssQ0FBQ0MsS0FBSyxDQUFDQyxnQkFBZ0IsRUFBRSxnQ0FBZ0NoQixRQUFRLENBQUNpQixVQUFVLEVBQUUsQ0FBQztJQUM1RztJQUVBLE1BQU1XLFFBQVEsR0FBRyxNQUFNNUIsUUFBUSxDQUFDbUIsSUFBSSxDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDUyxRQUFRLENBQUNDLEVBQUUsSUFBSSxDQUFDRCxRQUFRLENBQUNFLEtBQUssRUFBRTtNQUNuQyxNQUFNLElBQUloQixLQUFLLENBQUNDLEtBQUssQ0FBQ0QsS0FBSyxDQUFDQyxLQUFLLENBQUNDLGdCQUFnQixFQUFFLG9DQUFvQyxDQUFDO0lBQzNGO0lBRUEsT0FBT1ksUUFBUTtFQUNqQjtBQUVGO0FBQUMsSUFBQUcsUUFBQSxHQUFBQyxPQUFBLENBQUF2QyxPQUFBLEdBRWMsSUFBSUMsYUFBYSxDQUFDLENBQUMiLCJpZ25vcmVMaXN0IjpbXX0=