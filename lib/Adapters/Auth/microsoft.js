"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for Microsoft.
 *
 * @class MicrosoftAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Microsoft App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your Microsoft App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Microsoft authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "microsoft": {
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
 *     "microsoft": {
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
 *   "microsoft": {
 *     "code": "lmn789opq012rst345uvw",
 *     "redirect_uri": "https://your-redirect-uri.com/callback"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "microsoft": {
 *     "id": "7654321",
 *     "access_token": "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using Microsoft's OAuth API.
 * - **Insecure authentication** validates the user ID and access token directly, bypassing OAuth flows (not recommended). This method is deprecated and may be removed in future versions.
 *
 * @see {@link https://docs.microsoft.com/en-us/graph/auth/auth-concepts Microsoft Authentication Documentation}
 */

class MicrosoftAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super('Microsoft');
  }
  async getUserFromAccessToken(access_token) {
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    });
    if (!userResponse.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Microsoft API request failed.');
    }
    return userResponse.json();
  }
  async getAccessTokenFromCode(authData) {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: authData.redirect_uri,
        code: authData.code
      })
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Microsoft API request failed.');
    }
    const json = await response.json();
    return json.access_token;
  }
}
var _default = exports.default = new MicrosoftAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiTWljcm9zb2Z0QWRhcHRlciIsIkJhc2VBdXRoQ29kZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsImdldFVzZXJGcm9tQWNjZXNzVG9rZW4iLCJhY2Nlc3NfdG9rZW4iLCJ1c2VyUmVzcG9uc2UiLCJmZXRjaCIsImhlYWRlcnMiLCJBdXRob3JpemF0aW9uIiwib2siLCJQYXJzZSIsIkVycm9yIiwiT0JKRUNUX05PVF9GT1VORCIsImpzb24iLCJnZXRBY2Nlc3NUb2tlbkZyb21Db2RlIiwiYXV0aERhdGEiLCJyZXNwb25zZSIsIm1ldGhvZCIsImJvZHkiLCJVUkxTZWFyY2hQYXJhbXMiLCJjbGllbnRfaWQiLCJjbGllbnRJZCIsImNsaWVudF9zZWNyZXQiLCJjbGllbnRTZWNyZXQiLCJncmFudF90eXBlIiwicmVkaXJlY3RfdXJpIiwiY29kZSIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL21pY3Jvc29mdC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFBhcnNlIFNlcnZlciBhdXRoZW50aWNhdGlvbiBhZGFwdGVyIGZvciBNaWNyb3NvZnQuXG4gKlxuICogQGNsYXNzIE1pY3Jvc29mdEFkYXB0ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gVGhlIGFkYXB0ZXIgY29uZmlndXJhdGlvbiBvcHRpb25zLlxuICogQHBhcmFtIHtzdHJpbmd9IG9wdGlvbnMuY2xpZW50SWQgLSBZb3VyIE1pY3Jvc29mdCBBcHAgQ2xpZW50IElELiBSZXF1aXJlZCBmb3Igc2VjdXJlIGF1dGhlbnRpY2F0aW9uLlxuICogQHBhcmFtIHtzdHJpbmd9IG9wdGlvbnMuY2xpZW50U2VjcmV0IC0gWW91ciBNaWNyb3NvZnQgQXBwIENsaWVudCBTZWNyZXQuIFJlcXVpcmVkIGZvciBzZWN1cmUgYXV0aGVudGljYXRpb24uXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmVuYWJsZUluc2VjdXJlQXV0aD1mYWxzZV0gLSAqKltERVBSRUNBVEVEXSoqIEVuYWJsZSBpbnNlY3VyZSBhdXRoZW50aWNhdGlvbiAobm90IHJlY29tbWVuZGVkKS5cbiAqXG4gKiBAZGVzY3JpcHRpb25cbiAqICMjIFBhcnNlIFNlcnZlciBDb25maWd1cmF0aW9uXG4gKiBUbyBjb25maWd1cmUgUGFyc2UgU2VydmVyIGZvciBNaWNyb3NvZnQgYXV0aGVudGljYXRpb24sIHVzZSB0aGUgZm9sbG93aW5nIHN0cnVjdHVyZTpcbiAqICMjIyBTZWN1cmUgQ29uZmlndXJhdGlvblxuICogYGBganNvblxuICoge1xuICogICBcImF1dGhcIjoge1xuICogICAgIFwibWljcm9zb2Z0XCI6IHtcbiAqICAgICAgIFwiY2xpZW50SWRcIjogXCJ5b3VyLWNsaWVudC1pZFwiLFxuICogICAgICAgXCJjbGllbnRTZWNyZXRcIjogXCJ5b3VyLWNsaWVudC1zZWNyZXRcIlxuICogICAgIH1cbiAqICAgfVxuICogfVxuICogYGBgXG4gKiAjIyMgSW5zZWN1cmUgQ29uZmlndXJhdGlvbiAoTm90IFJlY29tbWVuZGVkKVxuICogYGBganNvblxuICoge1xuICogICBcImF1dGhcIjoge1xuICogICAgIFwibWljcm9zb2Z0XCI6IHtcbiAqICAgICAgIFwiZW5hYmxlSW5zZWN1cmVBdXRoXCI6IHRydWVcbiAqICAgICB9XG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqIFRoZSBhZGFwdGVyIHJlcXVpcmVzIHRoZSBmb2xsb3dpbmcgYGF1dGhEYXRhYCBmaWVsZHM6XG4gKiAtICoqU2VjdXJlIEF1dGhlbnRpY2F0aW9uKio6IGBjb2RlYCwgYHJlZGlyZWN0X3VyaWAuXG4gKiAtICoqSW5zZWN1cmUgQXV0aGVudGljYXRpb24gKE5vdCBSZWNvbW1lbmRlZCkqKjogYGlkYCwgYGFjY2Vzc190b2tlbmAuXG4gKlxuICogIyMgQXV0aCBQYXlsb2Fkc1xuICogIyMjIFNlY3VyZSBBdXRoZW50aWNhdGlvbiBQYXlsb2FkXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwibWljcm9zb2Z0XCI6IHtcbiAqICAgICBcImNvZGVcIjogXCJsbW43ODlvcHEwMTJyc3QzNDV1dndcIixcbiAqICAgICBcInJlZGlyZWN0X3VyaVwiOiBcImh0dHBzOi8veW91ci1yZWRpcmVjdC11cmkuY29tL2NhbGxiYWNrXCJcbiAqICAgfVxuICogfVxuICogYGBgXG4gKiAjIyMgSW5zZWN1cmUgQXV0aGVudGljYXRpb24gUGF5bG9hZCAoTm90IFJlY29tbWVuZGVkKVxuICogYGBganNvblxuICoge1xuICogICBcIm1pY3Jvc29mdFwiOiB7XG4gKiAgICAgXCJpZFwiOiBcIjc2NTQzMjFcIixcbiAqICAgICBcImFjY2Vzc190b2tlblwiOiBcIkFRWE5uZDJoSVQ2ejliSEZ6WnoyS3AxZ2hpTXpfUnR5dXZ3WFlaMTIzYWJjXCJcbiAqICAgfVxuICogfVxuICogYGBgXG4gKlxuICogIyMgTm90ZXNcbiAqIC0gU2VjdXJlIGF1dGhlbnRpY2F0aW9uIGV4Y2hhbmdlcyB0aGUgYGNvZGVgIGFuZCBgcmVkaXJlY3RfdXJpYCBwcm92aWRlZCBieSB0aGUgY2xpZW50IGZvciBhbiBhY2Nlc3MgdG9rZW4gdXNpbmcgTWljcm9zb2Z0J3MgT0F1dGggQVBJLlxuICogLSAqKkluc2VjdXJlIGF1dGhlbnRpY2F0aW9uKiogdmFsaWRhdGVzIHRoZSB1c2VyIElEIGFuZCBhY2Nlc3MgdG9rZW4gZGlyZWN0bHksIGJ5cGFzc2luZyBPQXV0aCBmbG93cyAobm90IHJlY29tbWVuZGVkKS4gVGhpcyBtZXRob2QgaXMgZGVwcmVjYXRlZCBhbmQgbWF5IGJlIHJlbW92ZWQgaW4gZnV0dXJlIHZlcnNpb25zLlxuICpcbiAqIEBzZWUge0BsaW5rIGh0dHBzOi8vZG9jcy5taWNyb3NvZnQuY29tL2VuLXVzL2dyYXBoL2F1dGgvYXV0aC1jb25jZXB0cyBNaWNyb3NvZnQgQXV0aGVudGljYXRpb24gRG9jdW1lbnRhdGlvbn1cbiAqL1xuXG5pbXBvcnQgQmFzZUF1dGhDb2RlQWRhcHRlciBmcm9tICcuL0Jhc2VDb2RlQXV0aEFkYXB0ZXInO1xuY2xhc3MgTWljcm9zb2Z0QWRhcHRlciBleHRlbmRzIEJhc2VBdXRoQ29kZUFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcignTWljcm9zb2Z0Jyk7XG4gIH1cbiAgYXN5bmMgZ2V0VXNlckZyb21BY2Nlc3NUb2tlbihhY2Nlc3NfdG9rZW4pIHtcbiAgICBjb25zdCB1c2VyUmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3YxLjAvbWUnLCB7XG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246ICdCZWFyZXIgJyArIGFjY2Vzc190b2tlbixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoIXVzZXJSZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdNaWNyb3NvZnQgQVBJIHJlcXVlc3QgZmFpbGVkLicpO1xuICAgIH1cblxuICAgIHJldHVybiB1c2VyUmVzcG9uc2UuanNvbigpO1xuICB9XG5cbiAgYXN5bmMgZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZShhdXRoRGF0YSkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vbG9naW4ubWljcm9zb2Z0b25saW5lLmNvbS9jb21tb24vb2F1dGgyL3YyLjAvdG9rZW4nLCB7XG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IG5ldyBVUkxTZWFyY2hQYXJhbXMoe1xuICAgICAgICBjbGllbnRfaWQ6IHRoaXMuY2xpZW50SWQsXG4gICAgICAgIGNsaWVudF9zZWNyZXQ6IHRoaXMuY2xpZW50U2VjcmV0LFxuICAgICAgICBncmFudF90eXBlOiAnYXV0aG9yaXphdGlvbl9jb2RlJyxcbiAgICAgICAgcmVkaXJlY3RfdXJpOiBhdXRoRGF0YS5yZWRpcmVjdF91cmksXG4gICAgICAgIGNvZGU6IGF1dGhEYXRhLmNvZGUsXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnTWljcm9zb2Z0IEFQSSByZXF1ZXN0IGZhaWxlZC4nKTtcbiAgICB9XG5cbiAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIHJldHVybiBqc29uLmFjY2Vzc190b2tlbjtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBuZXcgTWljcm9zb2Z0QWRhcHRlcigpO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFpRUEsSUFBQUEsb0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUF3RCxTQUFBRCx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQWpFeEQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBR0EsTUFBTUcsZ0JBQWdCLFNBQVNDLDRCQUFtQixDQUFDO0VBQ2pEQyxXQUFXQSxDQUFBLEVBQUc7SUFDWixLQUFLLENBQUMsV0FBVyxDQUFDO0VBQ3BCO0VBQ0EsTUFBTUMsc0JBQXNCQSxDQUFDQyxZQUFZLEVBQUU7SUFDekMsTUFBTUMsWUFBWSxHQUFHLE1BQU1DLEtBQUssQ0FBQyxxQ0FBcUMsRUFBRTtNQUN0RUMsT0FBTyxFQUFFO1FBQ1BDLGFBQWEsRUFBRSxTQUFTLEdBQUdKO01BQzdCO0lBQ0YsQ0FBQyxDQUFDO0lBRUYsSUFBSSxDQUFDQyxZQUFZLENBQUNJLEVBQUUsRUFBRTtNQUNwQixNQUFNLElBQUlDLEtBQUssQ0FBQ0MsS0FBSyxDQUFDRCxLQUFLLENBQUNDLEtBQUssQ0FBQ0MsZ0JBQWdCLEVBQUUsK0JBQStCLENBQUM7SUFDdEY7SUFFQSxPQUFPUCxZQUFZLENBQUNRLElBQUksQ0FBQyxDQUFDO0VBQzVCO0VBRUEsTUFBTUMsc0JBQXNCQSxDQUFDQyxRQUFRLEVBQUU7SUFDckMsTUFBTUMsUUFBUSxHQUFHLE1BQU1WLEtBQUssQ0FBQyw0REFBNEQsRUFBRTtNQUN6RlcsTUFBTSxFQUFFLE1BQU07TUFDZFYsT0FBTyxFQUFFO1FBQ1AsY0FBYyxFQUFFO01BQ2xCLENBQUM7TUFDRFcsSUFBSSxFQUFFLElBQUlDLGVBQWUsQ0FBQztRQUN4QkMsU0FBUyxFQUFFLElBQUksQ0FBQ0MsUUFBUTtRQUN4QkMsYUFBYSxFQUFFLElBQUksQ0FBQ0MsWUFBWTtRQUNoQ0MsVUFBVSxFQUFFLG9CQUFvQjtRQUNoQ0MsWUFBWSxFQUFFVixRQUFRLENBQUNVLFlBQVk7UUFDbkNDLElBQUksRUFBRVgsUUFBUSxDQUFDVztNQUNqQixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsSUFBSSxDQUFDVixRQUFRLENBQUNQLEVBQUUsRUFBRTtNQUNoQixNQUFNLElBQUlDLEtBQUssQ0FBQ0MsS0FBSyxDQUFDRCxLQUFLLENBQUNDLEtBQUssQ0FBQ0MsZ0JBQWdCLEVBQUUsK0JBQStCLENBQUM7SUFDdEY7SUFFQSxNQUFNQyxJQUFJLEdBQUcsTUFBTUcsUUFBUSxDQUFDSCxJQUFJLENBQUMsQ0FBQztJQUNsQyxPQUFPQSxJQUFJLENBQUNULFlBQVk7RUFDMUI7QUFDRjtBQUFDLElBQUF1QixRQUFBLEdBQUFDLE9BQUEsQ0FBQTdCLE9BQUEsR0FFYyxJQUFJQyxnQkFBZ0IsQ0FBQyxDQUFDIiwiaWdub3JlTGlzdCI6W119