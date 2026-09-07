"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
var _querystring = _interopRequireDefault(require("querystring"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for Weibo.
 *
 * @class WeiboAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 * @param {string} options.clientId - Your Weibo client ID.
 * @param {string} options.clientSecret - Your Weibo client secret.
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Weibo authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "weibo": {
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
 *     "weibo": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `code`, `redirect_uri`.
 * - **Insecure Authentication (Not Recommended)**: `id`, `access_token`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "weibo": {
 *     "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 *     "redirect_uri": "https://example.com/callback"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "weibo": {
 *     "id": "1234567",
 *     "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - **Insecure Authentication**: When `enableInsecureAuth` is enabled, the adapter directly validates the `id` and `access_token` provided by the client.
 * - **Secure Authentication**: When `enableInsecureAuth` is disabled, the adapter exchanges the `code` and `redirect_uri` for an access token using Weibo's OAuth API.
 * - `enableInsecureAuth` is **deprecated** and may be removed in future versions. Use secure authentication with `code` and `redirect_uri`.
 *
 * @example <caption>Auth Data Example (Secure)</caption>
 * const authData = {
 *   weibo: {
 *     code: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 *     redirect_uri: "https://example.com/callback"
 *   }
 * };
 *
 * @example <caption>Auth Data Example (Insecure - Not Recommended)</caption>
 * const authData = {
 *   weibo: {
 *     id: "1234567",
 *     access_token: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * };
 *
 * @see {@link https://open.weibo.com/wiki/Oauth2/access_token Weibo Authentication Documentation}
 */

class WeiboAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super('Weibo');
  }
  async getUserFromAccessToken(access_token) {
    const postData = _querystring.default.stringify({
      access_token: access_token
    });
    const response = await fetch('https://api.weibo.com/oauth2/get_token_info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: postData
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Weibo auth is invalid for this user.');
    }
    return {
      id: data.uid
    };
  }
  async getAccessTokenFromCode(authData) {
    if (!authData?.code || !authData?.redirect_uri) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Weibo auth requires code and redirect_uri to be sent.');
    }
    const postData = _querystring.default.stringify({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code: authData.code,
      redirect_uri: authData.redirect_uri
    });
    const response = await fetch('https://api.weibo.com/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: postData
    });
    const data = await response.json();
    if (!response.ok || data.errcode) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Weibo auth is invalid for this user.');
    }
    return data.access_token;
  }
}
var _default = exports.default = new WeiboAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX3F1ZXJ5c3RyaW5nIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiV2VpYm9BZGFwdGVyIiwiQmFzZUF1dGhDb2RlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwiZ2V0VXNlckZyb21BY2Nlc3NUb2tlbiIsImFjY2Vzc190b2tlbiIsInBvc3REYXRhIiwicXVlcnlzdHJpbmciLCJzdHJpbmdpZnkiLCJyZXNwb25zZSIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsImJvZHkiLCJkYXRhIiwianNvbiIsIm9rIiwiUGFyc2UiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJpZCIsInVpZCIsImdldEFjY2Vzc1Rva2VuRnJvbUNvZGUiLCJhdXRoRGF0YSIsImNvZGUiLCJyZWRpcmVjdF91cmkiLCJjbGllbnRfaWQiLCJjbGllbnRJZCIsImNsaWVudF9zZWNyZXQiLCJjbGllbnRTZWNyZXQiLCJncmFudF90eXBlIiwiZXJyY29kZSIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL3dlaWJvLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUGFyc2UgU2VydmVyIGF1dGhlbnRpY2F0aW9uIGFkYXB0ZXIgZm9yIFdlaWJvLlxuICpcbiAqIEBjbGFzcyBXZWlib0FkYXB0ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gVGhlIGFkYXB0ZXIgY29uZmlndXJhdGlvbiBvcHRpb25zLlxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5lbmFibGVJbnNlY3VyZUF1dGg9ZmFsc2VdIC0gKipbREVQUkVDQVRFRF0qKiBFbmFibGUgaW5zZWN1cmUgYXV0aGVudGljYXRpb24gKG5vdCByZWNvbW1lbmRlZCkuXG4gKiBAcGFyYW0ge3N0cmluZ30gb3B0aW9ucy5jbGllbnRJZCAtIFlvdXIgV2VpYm8gY2xpZW50IElELlxuICogQHBhcmFtIHtzdHJpbmd9IG9wdGlvbnMuY2xpZW50U2VjcmV0IC0gWW91ciBXZWlibyBjbGllbnQgc2VjcmV0LlxuICpcbiAqIEBkZXNjcmlwdGlvblxuICogIyMgUGFyc2UgU2VydmVyIENvbmZpZ3VyYXRpb25cbiAqIFRvIGNvbmZpZ3VyZSBQYXJzZSBTZXJ2ZXIgZm9yIFdlaWJvIGF1dGhlbnRpY2F0aW9uLCB1c2UgdGhlIGZvbGxvd2luZyBzdHJ1Y3R1cmU6XG4gKiAjIyMgU2VjdXJlIENvbmZpZ3VyYXRpb25cbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJhdXRoXCI6IHtcbiAqICAgICBcIndlaWJvXCI6IHtcbiAqICAgICAgIFwiY2xpZW50SWRcIjogXCJ5b3VyLWNsaWVudC1pZFwiLFxuICogICAgICAgXCJjbGllbnRTZWNyZXRcIjogXCJ5b3VyLWNsaWVudC1zZWNyZXRcIlxuICogICAgIH1cbiAqICAgfVxuICogfVxuICogYGBgXG4gKiAjIyMgSW5zZWN1cmUgQ29uZmlndXJhdGlvbiAoTm90IFJlY29tbWVuZGVkKVxuICogYGBganNvblxuICoge1xuICogICBcImF1dGhcIjoge1xuICogICAgIFwid2VpYm9cIjoge1xuICogICAgICAgXCJlbmFibGVJbnNlY3VyZUF1dGhcIjogdHJ1ZVxuICogICAgIH1cbiAqICAgfVxuICogfVxuICogYGBgXG4gKlxuICogVGhlIGFkYXB0ZXIgcmVxdWlyZXMgdGhlIGZvbGxvd2luZyBgYXV0aERhdGFgIGZpZWxkczpcbiAqIC0gKipTZWN1cmUgQXV0aGVudGljYXRpb24qKjogYGNvZGVgLCBgcmVkaXJlY3RfdXJpYC5cbiAqIC0gKipJbnNlY3VyZSBBdXRoZW50aWNhdGlvbiAoTm90IFJlY29tbWVuZGVkKSoqOiBgaWRgLCBgYWNjZXNzX3Rva2VuYC5cbiAqXG4gKiAjIyBBdXRoIFBheWxvYWRzXG4gKiAjIyMgU2VjdXJlIEF1dGhlbnRpY2F0aW9uIFBheWxvYWRcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJ3ZWlib1wiOiB7XG4gKiAgICAgXCJjb2RlXCI6IFwieHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHhcIixcbiAqICAgICBcInJlZGlyZWN0X3VyaVwiOiBcImh0dHBzOi8vZXhhbXBsZS5jb20vY2FsbGJhY2tcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqICMjIyBJbnNlY3VyZSBBdXRoZW50aWNhdGlvbiBQYXlsb2FkIChOb3QgUmVjb21tZW5kZWQpXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwid2VpYm9cIjoge1xuICogICAgIFwiaWRcIjogXCIxMjM0NTY3XCIsXG4gKiAgICAgXCJhY2Nlc3NfdG9rZW5cIjogXCJ4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eFwiXG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqICMjIE5vdGVzXG4gKiAtICoqSW5zZWN1cmUgQXV0aGVudGljYXRpb24qKjogV2hlbiBgZW5hYmxlSW5zZWN1cmVBdXRoYCBpcyBlbmFibGVkLCB0aGUgYWRhcHRlciBkaXJlY3RseSB2YWxpZGF0ZXMgdGhlIGBpZGAgYW5kIGBhY2Nlc3NfdG9rZW5gIHByb3ZpZGVkIGJ5IHRoZSBjbGllbnQuXG4gKiAtICoqU2VjdXJlIEF1dGhlbnRpY2F0aW9uKio6IFdoZW4gYGVuYWJsZUluc2VjdXJlQXV0aGAgaXMgZGlzYWJsZWQsIHRoZSBhZGFwdGVyIGV4Y2hhbmdlcyB0aGUgYGNvZGVgIGFuZCBgcmVkaXJlY3RfdXJpYCBmb3IgYW4gYWNjZXNzIHRva2VuIHVzaW5nIFdlaWJvJ3MgT0F1dGggQVBJLlxuICogLSBgZW5hYmxlSW5zZWN1cmVBdXRoYCBpcyAqKmRlcHJlY2F0ZWQqKiBhbmQgbWF5IGJlIHJlbW92ZWQgaW4gZnV0dXJlIHZlcnNpb25zLiBVc2Ugc2VjdXJlIGF1dGhlbnRpY2F0aW9uIHdpdGggYGNvZGVgIGFuZCBgcmVkaXJlY3RfdXJpYC5cbiAqXG4gKiBAZXhhbXBsZSA8Y2FwdGlvbj5BdXRoIERhdGEgRXhhbXBsZSAoU2VjdXJlKTwvY2FwdGlvbj5cbiAqIGNvbnN0IGF1dGhEYXRhID0ge1xuICogICB3ZWlibzoge1xuICogICAgIGNvZGU6IFwieHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHhcIixcbiAqICAgICByZWRpcmVjdF91cmk6IFwiaHR0cHM6Ly9leGFtcGxlLmNvbS9jYWxsYmFja1wiXG4gKiAgIH1cbiAqIH07XG4gKlxuICogQGV4YW1wbGUgPGNhcHRpb24+QXV0aCBEYXRhIEV4YW1wbGUgKEluc2VjdXJlIC0gTm90IFJlY29tbWVuZGVkKTwvY2FwdGlvbj5cbiAqIGNvbnN0IGF1dGhEYXRhID0ge1xuICogICB3ZWlibzoge1xuICogICAgIGlkOiBcIjEyMzQ1NjdcIixcbiAqICAgICBhY2Nlc3NfdG9rZW46IFwieHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHhcIlxuICogICB9XG4gKiB9O1xuICpcbiAqIEBzZWUge0BsaW5rIGh0dHBzOi8vb3Blbi53ZWliby5jb20vd2lraS9PYXV0aDIvYWNjZXNzX3Rva2VuIFdlaWJvIEF1dGhlbnRpY2F0aW9uIERvY3VtZW50YXRpb259XG4gKi9cblxuaW1wb3J0IEJhc2VBdXRoQ29kZUFkYXB0ZXIgZnJvbSAnLi9CYXNlQ29kZUF1dGhBZGFwdGVyJztcbmltcG9ydCBxdWVyeXN0cmluZyBmcm9tICdxdWVyeXN0cmluZyc7XG5cbmNsYXNzIFdlaWJvQWRhcHRlciBleHRlbmRzIEJhc2VBdXRoQ29kZUFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcignV2VpYm8nKTtcbiAgfVxuXG4gIGFzeW5jIGdldFVzZXJGcm9tQWNjZXNzVG9rZW4oYWNjZXNzX3Rva2VuKSB7XG4gICAgY29uc3QgcG9zdERhdGEgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkoe1xuICAgICAgYWNjZXNzX3Rva2VuOiBhY2Nlc3NfdG9rZW4sXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS53ZWliby5jb20vb2F1dGgyL2dldF90b2tlbl9pbmZvJywge1xuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBwb3N0RGF0YSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1dlaWJvIGF1dGggaXMgaW52YWxpZCBmb3IgdGhpcyB1c2VyLicpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBpZDogZGF0YS51aWQsXG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZShhdXRoRGF0YSkge1xuICAgIGlmICghYXV0aERhdGE/LmNvZGUgfHwgIWF1dGhEYXRhPy5yZWRpcmVjdF91cmkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgJ1dlaWJvIGF1dGggcmVxdWlyZXMgY29kZSBhbmQgcmVkaXJlY3RfdXJpIHRvIGJlIHNlbnQuJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBwb3N0RGF0YSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh7XG4gICAgICBjbGllbnRfaWQ6IHRoaXMuY2xpZW50SWQsXG4gICAgICBjbGllbnRfc2VjcmV0OiB0aGlzLmNsaWVudFNlY3JldCxcbiAgICAgIGdyYW50X3R5cGU6ICdhdXRob3JpemF0aW9uX2NvZGUnLFxuICAgICAgY29kZTogYXV0aERhdGEuY29kZSxcbiAgICAgIHJlZGlyZWN0X3VyaTogYXV0aERhdGEucmVkaXJlY3RfdXJpLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcGkud2VpYm8uY29tL29hdXRoMi9hY2Nlc3NfdG9rZW4nLCB7XG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IHBvc3REYXRhLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblxuICAgIGlmICghcmVzcG9uc2Uub2sgfHwgZGF0YS5lcnJjb2RlKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1dlaWJvIGF1dGggaXMgaW52YWxpZCBmb3IgdGhpcyB1c2VyLicpO1xuICAgIH1cblxuICAgIHJldHVybiBkYXRhLmFjY2Vzc190b2tlbjtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBuZXcgV2VpYm9BZGFwdGVyKCk7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQWtGQSxJQUFBQSxvQkFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsWUFBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQXNDLFNBQUFELHVCQUFBRyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBbkZ0QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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