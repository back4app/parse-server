"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for Instagram.
 *
 * @class InstagramAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Instagram App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your Instagram App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Instagram authentication, use the following structure:
 * ```json
 * {
 *   "auth": {
 *     "instagram": {
 *       "clientId": "your-client-id",
 *       "clientSecret": "your-client-secret"
 *     }
 *   }
 * }
 * ```
 * ### Insecure Configuration (Not Recommended)
 * ```json
 * {
 *   "auth": {
 *     "instagram": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `code`, `redirect_uri`.
 * - **Insecure Authentication (Deprecated)**: `id`, `access_token`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "instagram": {
 *     "code": "lmn789opq012rst345uvw",
 *     "redirect_uri": "https://example.com/callback"
 *   }
 * }
 * ```
 *
 * ### Insecure Authentication Payload (Deprecated)
 * ```json
 * {
 *   "instagram": {
 *     "id": "1234567",
 *     "access_token": "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - `enableInsecureAuth` is **deprecated** and will be removed in future versions. Use secure authentication with `code` and `redirect_uri`.
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using Instagram's OAuth flow.
 *
 * @see {@link https://developers.facebook.com/docs/instagram-basic-display-api/getting-started Instagram Basic Display API - Getting Started}
 */

class InstagramAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super('Instagram');
  }
  async getAccessTokenFromCode(authData) {
    const response = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
        code: authData.code
      })
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram API request failed.');
    }
    const data = await response.json();
    if (data.error) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, data.error_description || data.error);
    }
    return data.access_token;
  }
  async getUserFromAccessToken(accessToken, authData) {
    const apiURL = 'https://graph.instagram.com/';
    const path = `${apiURL}me?fields=id&access_token=${accessToken}`;
    const response = await fetch(path);
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram API request failed.');
    }
    const user = await response.json();
    if (user?.id !== authData.id) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram auth is invalid for this user.');
    }
    return {
      id: user.id
    };
  }
}
var _default = exports.default = new InstagramAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiSW5zdGFncmFtQWRhcHRlciIsIkJhc2VBdXRoQ29kZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsImdldEFjY2Vzc1Rva2VuRnJvbUNvZGUiLCJhdXRoRGF0YSIsInJlc3BvbnNlIiwiZmV0Y2giLCJtZXRob2QiLCJoZWFkZXJzIiwiYm9keSIsIlVSTFNlYXJjaFBhcmFtcyIsImNsaWVudF9pZCIsImNsaWVudElkIiwiY2xpZW50X3NlY3JldCIsImNsaWVudFNlY3JldCIsImdyYW50X3R5cGUiLCJyZWRpcmVjdF91cmkiLCJyZWRpcmVjdFVyaSIsImNvZGUiLCJvayIsIlBhcnNlIiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiZGF0YSIsImpzb24iLCJlcnJvciIsImVycm9yX2Rlc2NyaXB0aW9uIiwiYWNjZXNzX3Rva2VuIiwiZ2V0VXNlckZyb21BY2Nlc3NUb2tlbiIsImFjY2Vzc1Rva2VuIiwiYXBpVVJMIiwicGF0aCIsInVzZXIiLCJpZCIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL2luc3RhZ3JhbS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFBhcnNlIFNlcnZlciBhdXRoZW50aWNhdGlvbiBhZGFwdGVyIGZvciBJbnN0YWdyYW0uXG4gKlxuICogQGNsYXNzIEluc3RhZ3JhbUFkYXB0ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gVGhlIGFkYXB0ZXIgY29uZmlndXJhdGlvbiBvcHRpb25zLlxuICogQHBhcmFtIHtzdHJpbmd9IG9wdGlvbnMuY2xpZW50SWQgLSBZb3VyIEluc3RhZ3JhbSBBcHAgQ2xpZW50IElELiBSZXF1aXJlZCBmb3Igc2VjdXJlIGF1dGhlbnRpY2F0aW9uLlxuICogQHBhcmFtIHtzdHJpbmd9IG9wdGlvbnMuY2xpZW50U2VjcmV0IC0gWW91ciBJbnN0YWdyYW0gQXBwIENsaWVudCBTZWNyZXQuIFJlcXVpcmVkIGZvciBzZWN1cmUgYXV0aGVudGljYXRpb24uXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmVuYWJsZUluc2VjdXJlQXV0aD1mYWxzZV0gLSAqKltERVBSRUNBVEVEXSoqIEVuYWJsZSBpbnNlY3VyZSBhdXRoZW50aWNhdGlvbiAobm90IHJlY29tbWVuZGVkKS5cbiAqXG4gKiBAZGVzY3JpcHRpb25cbiAqICMjIFBhcnNlIFNlcnZlciBDb25maWd1cmF0aW9uXG4gKiBUbyBjb25maWd1cmUgUGFyc2UgU2VydmVyIGZvciBJbnN0YWdyYW0gYXV0aGVudGljYXRpb24sIHVzZSB0aGUgZm9sbG93aW5nIHN0cnVjdHVyZTpcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJhdXRoXCI6IHtcbiAqICAgICBcImluc3RhZ3JhbVwiOiB7XG4gKiAgICAgICBcImNsaWVudElkXCI6IFwieW91ci1jbGllbnQtaWRcIixcbiAqICAgICAgIFwiY2xpZW50U2VjcmV0XCI6IFwieW91ci1jbGllbnQtc2VjcmV0XCJcbiAqICAgICB9XG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICogIyMjIEluc2VjdXJlIENvbmZpZ3VyYXRpb24gKE5vdCBSZWNvbW1lbmRlZClcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJhdXRoXCI6IHtcbiAqICAgICBcImluc3RhZ3JhbVwiOiB7XG4gKiAgICAgICBcImVuYWJsZUluc2VjdXJlQXV0aFwiOiB0cnVlXG4gKiAgICAgfVxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiBUaGUgYWRhcHRlciByZXF1aXJlcyB0aGUgZm9sbG93aW5nIGBhdXRoRGF0YWAgZmllbGRzOlxuICogLSAqKlNlY3VyZSBBdXRoZW50aWNhdGlvbioqOiBgY29kZWAsIGByZWRpcmVjdF91cmlgLlxuICogLSAqKkluc2VjdXJlIEF1dGhlbnRpY2F0aW9uIChEZXByZWNhdGVkKSoqOiBgaWRgLCBgYWNjZXNzX3Rva2VuYC5cbiAqXG4gKiAjIyBBdXRoIFBheWxvYWRzXG4gKiAjIyMgU2VjdXJlIEF1dGhlbnRpY2F0aW9uIFBheWxvYWRcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJpbnN0YWdyYW1cIjoge1xuICogICAgIFwiY29kZVwiOiBcImxtbjc4OW9wcTAxMnJzdDM0NXV2d1wiLFxuICogICAgIFwicmVkaXJlY3RfdXJpXCI6IFwiaHR0cHM6Ly9leGFtcGxlLmNvbS9jYWxsYmFja1wiXG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqICMjIyBJbnNlY3VyZSBBdXRoZW50aWNhdGlvbiBQYXlsb2FkIChEZXByZWNhdGVkKVxuICogYGBganNvblxuICoge1xuICogICBcImluc3RhZ3JhbVwiOiB7XG4gKiAgICAgXCJpZFwiOiBcIjEyMzQ1NjdcIixcbiAqICAgICBcImFjY2Vzc190b2tlblwiOiBcIkFRWE5uZDJoSVQ2ejliSEZ6WnoyS3AxZ2hpTXpfUnR5dXZ3WFlaMTIzYWJjXCJcbiAqICAgfVxuICogfVxuICogYGBgXG4gKlxuICogIyMgTm90ZXNcbiAqIC0gYGVuYWJsZUluc2VjdXJlQXV0aGAgaXMgKipkZXByZWNhdGVkKiogYW5kIHdpbGwgYmUgcmVtb3ZlZCBpbiBmdXR1cmUgdmVyc2lvbnMuIFVzZSBzZWN1cmUgYXV0aGVudGljYXRpb24gd2l0aCBgY29kZWAgYW5kIGByZWRpcmVjdF91cmlgLlxuICogLSBTZWN1cmUgYXV0aGVudGljYXRpb24gZXhjaGFuZ2VzIHRoZSBgY29kZWAgYW5kIGByZWRpcmVjdF91cmlgIHByb3ZpZGVkIGJ5IHRoZSBjbGllbnQgZm9yIGFuIGFjY2VzcyB0b2tlbiB1c2luZyBJbnN0YWdyYW0ncyBPQXV0aCBmbG93LlxuICpcbiAqIEBzZWUge0BsaW5rIGh0dHBzOi8vZGV2ZWxvcGVycy5mYWNlYm9vay5jb20vZG9jcy9pbnN0YWdyYW0tYmFzaWMtZGlzcGxheS1hcGkvZ2V0dGluZy1zdGFydGVkIEluc3RhZ3JhbSBCYXNpYyBEaXNwbGF5IEFQSSAtIEdldHRpbmcgU3RhcnRlZH1cbiAqL1xuXG5cbmltcG9ydCBCYXNlQXV0aENvZGVBZGFwdGVyIGZyb20gJy4vQmFzZUNvZGVBdXRoQWRhcHRlcic7XG5jbGFzcyBJbnN0YWdyYW1BZGFwdGVyIGV4dGVuZHMgQmFzZUF1dGhDb2RlQWRhcHRlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKCdJbnN0YWdyYW0nKTtcbiAgfVxuXG4gIGFzeW5jIGdldEFjY2Vzc1Rva2VuRnJvbUNvZGUoYXV0aERhdGEpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS5pbnN0YWdyYW0uY29tL29hdXRoL2FjY2Vzc190b2tlbicsIHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcgfSxcbiAgICAgIGJvZHk6IG5ldyBVUkxTZWFyY2hQYXJhbXMoe1xuICAgICAgICBjbGllbnRfaWQ6IHRoaXMuY2xpZW50SWQsXG4gICAgICAgIGNsaWVudF9zZWNyZXQ6IHRoaXMuY2xpZW50U2VjcmV0LFxuICAgICAgICBncmFudF90eXBlOiAnYXV0aG9yaXphdGlvbl9jb2RlJyxcbiAgICAgICAgcmVkaXJlY3RfdXJpOiB0aGlzLnJlZGlyZWN0VXJpLFxuICAgICAgICBjb2RlOiBhdXRoRGF0YS5jb2RlXG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnN0YWdyYW0gQVBJIHJlcXVlc3QgZmFpbGVkLicpO1xuICAgIH1cblxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgaWYgKGRhdGEuZXJyb3IpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCBkYXRhLmVycm9yX2Rlc2NyaXB0aW9uIHx8IGRhdGEuZXJyb3IpO1xuICAgIH1cblxuICAgIHJldHVybiBkYXRhLmFjY2Vzc190b2tlbjtcbiAgfVxuXG4gIGFzeW5jIGdldFVzZXJGcm9tQWNjZXNzVG9rZW4oYWNjZXNzVG9rZW4sIGF1dGhEYXRhKSB7XG4gICAgY29uc3QgYXBpVVJMID0gJ2h0dHBzOi8vZ3JhcGguaW5zdGFncmFtLmNvbS8nO1xuICAgIGNvbnN0IHBhdGggPSBgJHthcGlVUkx9bWU/ZmllbGRzPWlkJmFjY2Vzc190b2tlbj0ke2FjY2Vzc1Rva2VufWA7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHBhdGgpO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnN0YWdyYW0gQVBJIHJlcXVlc3QgZmFpbGVkLicpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgaWYgKHVzZXI/LmlkICE9PSBhdXRoRGF0YS5pZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnN0YWdyYW0gYXV0aCBpcyBpbnZhbGlkIGZvciB0aGlzIHVzZXIuJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiB1c2VyLmlkLFxuICAgIH1cblxuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IG5ldyBJbnN0YWdyYW1BZGFwdGVyKCk7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQWtFQSxJQUFBQSxvQkFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQXdELFNBQUFELHVCQUFBRSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBbEV4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