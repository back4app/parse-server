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
    const defaultURL = 'https://graph.instagram.com/';
    const apiURL = authData.apiURL || defaultURL;
    const path = `${apiURL}me?fields=id&access_token=${accessToken}`;
    const response = await fetch(path);
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram API request failed.');
    }
    const user = await response.json();
    if ((user === null || user === void 0 ? void 0 : user.id) !== authData.id) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram auth is invalid for this user.');
    }
    return {
      id: user.id
    };
  }
}
var _default = exports.default = new InstagramAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiSW5zdGFncmFtQWRhcHRlciIsIkJhc2VBdXRoQ29kZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsImdldEFjY2Vzc1Rva2VuRnJvbUNvZGUiLCJhdXRoRGF0YSIsInJlc3BvbnNlIiwiZmV0Y2giLCJtZXRob2QiLCJoZWFkZXJzIiwiYm9keSIsIlVSTFNlYXJjaFBhcmFtcyIsImNsaWVudF9pZCIsImNsaWVudElkIiwiY2xpZW50X3NlY3JldCIsImNsaWVudFNlY3JldCIsImdyYW50X3R5cGUiLCJyZWRpcmVjdF91cmkiLCJyZWRpcmVjdFVyaSIsImNvZGUiLCJvayIsIlBhcnNlIiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiZGF0YSIsImpzb24iLCJlcnJvciIsImVycm9yX2Rlc2NyaXB0aW9uIiwiYWNjZXNzX3Rva2VuIiwiZ2V0VXNlckZyb21BY2Nlc3NUb2tlbiIsImFjY2Vzc1Rva2VuIiwiZGVmYXVsdFVSTCIsImFwaVVSTCIsInBhdGgiLCJ1c2VyIiwiaWQiLCJfZGVmYXVsdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvQXV0aC9pbnN0YWdyYW0uanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQYXJzZSBTZXJ2ZXIgYXV0aGVudGljYXRpb24gYWRhcHRlciBmb3IgSW5zdGFncmFtLlxuICpcbiAqIEBjbGFzcyBJbnN0YWdyYW1BZGFwdGVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIFRoZSBhZGFwdGVyIGNvbmZpZ3VyYXRpb24gb3B0aW9ucy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRpb25zLmNsaWVudElkIC0gWW91ciBJbnN0YWdyYW0gQXBwIENsaWVudCBJRC4gUmVxdWlyZWQgZm9yIHNlY3VyZSBhdXRoZW50aWNhdGlvbi5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRpb25zLmNsaWVudFNlY3JldCAtIFlvdXIgSW5zdGFncmFtIEFwcCBDbGllbnQgU2VjcmV0LiBSZXF1aXJlZCBmb3Igc2VjdXJlIGF1dGhlbnRpY2F0aW9uLlxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5lbmFibGVJbnNlY3VyZUF1dGg9ZmFsc2VdIC0gKipbREVQUkVDQVRFRF0qKiBFbmFibGUgaW5zZWN1cmUgYXV0aGVudGljYXRpb24gKG5vdCByZWNvbW1lbmRlZCkuXG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiAjIyBQYXJzZSBTZXJ2ZXIgQ29uZmlndXJhdGlvblxuICogVG8gY29uZmlndXJlIFBhcnNlIFNlcnZlciBmb3IgSW5zdGFncmFtIGF1dGhlbnRpY2F0aW9uLCB1c2UgdGhlIGZvbGxvd2luZyBzdHJ1Y3R1cmU6XG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwiYXV0aFwiOiB7XG4gKiAgICAgXCJpbnN0YWdyYW1cIjoge1xuICogICAgICAgXCJjbGllbnRJZFwiOiBcInlvdXItY2xpZW50LWlkXCIsXG4gKiAgICAgICBcImNsaWVudFNlY3JldFwiOiBcInlvdXItY2xpZW50LXNlY3JldFwiXG4gKiAgICAgfVxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqICMjIyBJbnNlY3VyZSBDb25maWd1cmF0aW9uIChOb3QgUmVjb21tZW5kZWQpXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwiYXV0aFwiOiB7XG4gKiAgICAgXCJpbnN0YWdyYW1cIjoge1xuICogICAgICAgXCJlbmFibGVJbnNlY3VyZUF1dGhcIjogdHJ1ZVxuICogICAgIH1cbiAqICAgfVxuICogfVxuICogYGBgXG4gKlxuICogVGhlIGFkYXB0ZXIgcmVxdWlyZXMgdGhlIGZvbGxvd2luZyBgYXV0aERhdGFgIGZpZWxkczpcbiAqIC0gKipTZWN1cmUgQXV0aGVudGljYXRpb24qKjogYGNvZGVgLCBgcmVkaXJlY3RfdXJpYC5cbiAqIC0gKipJbnNlY3VyZSBBdXRoZW50aWNhdGlvbiAoRGVwcmVjYXRlZCkqKjogYGlkYCwgYGFjY2Vzc190b2tlbmAuXG4gKlxuICogIyMgQXV0aCBQYXlsb2Fkc1xuICogIyMjIFNlY3VyZSBBdXRoZW50aWNhdGlvbiBQYXlsb2FkXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwiaW5zdGFncmFtXCI6IHtcbiAqICAgICBcImNvZGVcIjogXCJsbW43ODlvcHEwMTJyc3QzNDV1dndcIixcbiAqICAgICBcInJlZGlyZWN0X3VyaVwiOiBcImh0dHBzOi8vZXhhbXBsZS5jb20vY2FsbGJhY2tcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiAjIyMgSW5zZWN1cmUgQXV0aGVudGljYXRpb24gUGF5bG9hZCAoRGVwcmVjYXRlZClcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJpbnN0YWdyYW1cIjoge1xuICogICAgIFwiaWRcIjogXCIxMjM0NTY3XCIsXG4gKiAgICAgXCJhY2Nlc3NfdG9rZW5cIjogXCJBUVhObmQyaElUNno5YkhGelp6MktwMWdoaU16X1J0eXV2d1hZWjEyM2FiY1wiXG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqICMjIE5vdGVzXG4gKiAtIGBlbmFibGVJbnNlY3VyZUF1dGhgIGlzICoqZGVwcmVjYXRlZCoqIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gZnV0dXJlIHZlcnNpb25zLiBVc2Ugc2VjdXJlIGF1dGhlbnRpY2F0aW9uIHdpdGggYGNvZGVgIGFuZCBgcmVkaXJlY3RfdXJpYC5cbiAqIC0gU2VjdXJlIGF1dGhlbnRpY2F0aW9uIGV4Y2hhbmdlcyB0aGUgYGNvZGVgIGFuZCBgcmVkaXJlY3RfdXJpYCBwcm92aWRlZCBieSB0aGUgY2xpZW50IGZvciBhbiBhY2Nlc3MgdG9rZW4gdXNpbmcgSW5zdGFncmFtJ3MgT0F1dGggZmxvdy5cbiAqXG4gKiBAc2VlIHtAbGluayBodHRwczovL2RldmVsb3BlcnMuZmFjZWJvb2suY29tL2RvY3MvaW5zdGFncmFtLWJhc2ljLWRpc3BsYXktYXBpL2dldHRpbmctc3RhcnRlZCBJbnN0YWdyYW0gQmFzaWMgRGlzcGxheSBBUEkgLSBHZXR0aW5nIFN0YXJ0ZWR9XG4gKi9cblxuXG5pbXBvcnQgQmFzZUF1dGhDb2RlQWRhcHRlciBmcm9tICcuL0Jhc2VDb2RlQXV0aEFkYXB0ZXInO1xuY2xhc3MgSW5zdGFncmFtQWRhcHRlciBleHRlbmRzIEJhc2VBdXRoQ29kZUFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcignSW5zdGFncmFtJyk7XG4gIH1cblxuICBhc3luYyBnZXRBY2Nlc3NUb2tlbkZyb21Db2RlKGF1dGhEYXRhKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcGkuaW5zdGFncmFtLmNvbS9vYXV0aC9hY2Nlc3NfdG9rZW4nLCB7XG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnIH0sXG4gICAgICBib2R5OiBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcbiAgICAgICAgY2xpZW50X2lkOiB0aGlzLmNsaWVudElkLFxuICAgICAgICBjbGllbnRfc2VjcmV0OiB0aGlzLmNsaWVudFNlY3JldCxcbiAgICAgICAgZ3JhbnRfdHlwZTogJ2F1dGhvcml6YXRpb25fY29kZScsXG4gICAgICAgIHJlZGlyZWN0X3VyaTogdGhpcy5yZWRpcmVjdFVyaSxcbiAgICAgICAgY29kZTogYXV0aERhdGEuY29kZVxuICAgICAgfSlcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW5zdGFncmFtIEFQSSByZXF1ZXN0IGZhaWxlZC4nKTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGlmIChkYXRhLmVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgZGF0YS5lcnJvcl9kZXNjcmlwdGlvbiB8fCBkYXRhLmVycm9yKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGF0YS5hY2Nlc3NfdG9rZW47XG4gIH1cblxuICBhc3luYyBnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuKGFjY2Vzc1Rva2VuLCBhdXRoRGF0YSkge1xuICAgIGNvbnN0IGRlZmF1bHRVUkwgPSAnaHR0cHM6Ly9ncmFwaC5pbnN0YWdyYW0uY29tLyc7XG4gICAgY29uc3QgYXBpVVJMID0gYXV0aERhdGEuYXBpVVJMIHx8IGRlZmF1bHRVUkw7XG4gICAgY29uc3QgcGF0aCA9IGAke2FwaVVSTH1tZT9maWVsZHM9aWQmYWNjZXNzX3Rva2VuPSR7YWNjZXNzVG9rZW59YDtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocGF0aCk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0luc3RhZ3JhbSBBUEkgcmVxdWVzdCBmYWlsZWQuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICBpZiAodXNlcj8uaWQgIT09IGF1dGhEYXRhLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0luc3RhZ3JhbSBhdXRoIGlzIGludmFsaWQgZm9yIHRoaXMgdXNlci4nKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHVzZXIuaWQsXG4gICAgfVxuXG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgbmV3IEluc3RhZ3JhbUFkYXB0ZXIoKTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBa0VBLElBQUFBLG9CQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFBd0QsU0FBQUQsdUJBQUFFLENBQUEsV0FB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