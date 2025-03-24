"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for Google Play Games Services.
 *
 * @class GooglePlayGamesServicesAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Google Play Games Services App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your Google Play Games Services App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Google Play Games Services authentication, use the following structure:
 * ```json
 * {
 *   "auth": {
 *     "gpgames": {
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
 *     "gpgames": {
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
 *   "gpgames": {
 *     "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 *     "redirect_uri": "https://example.com/callback"
 *   }
 * }
 * ```
 *
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "gpgames": {
 *     "id": "123456789",
 *     "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - `enableInsecureAuth` is **not recommended** and may be removed in future versions. Use secure authentication with `code` and `redirect_uri`.
 * - Secure authentication exchanges the `code` provided by the client for an access token using Google Play Games Services' OAuth API.
 *
 * @see {@link https://developers.google.com/games/services/console/enabling Google Play Games Services Authentication Documentation}
 */

class GooglePlayGamesServicesAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super("gpgames");
  }
  async getAccessTokenFromCode(authData) {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: authData.code,
        redirect_uri: authData.redirectUri,
        grant_type: 'authorization_code'
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
  async getUserFromAccessToken(accessToken, authData) {
    const userApiUrl = `https://www.googleapis.com/games/v1/players/${authData.id}`;
    const response = await fetch(userApiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `Failed to fetch Google Play Games Services user: ${response.statusText}`);
    }
    const userData = await response.json();
    if (!userData.playerId || userData.playerId !== authData.id) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Invalid Google Play Games Services user data received.');
    }
    return {
      id: userData.playerId
    };
  }
}
var _default = exports.default = new GooglePlayGamesServicesAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiR29vZ2xlUGxheUdhbWVzU2VydmljZXNBZGFwdGVyIiwiQmFzZUNvZGVBdXRoQWRhcHRlciIsImNvbnN0cnVjdG9yIiwiZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZSIsImF1dGhEYXRhIiwidG9rZW5VcmwiLCJyZXNwb25zZSIsImZldGNoIiwibWV0aG9kIiwiaGVhZGVycyIsIkFjY2VwdCIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5IiwiY2xpZW50X2lkIiwiY2xpZW50SWQiLCJjbGllbnRfc2VjcmV0IiwiY2xpZW50U2VjcmV0IiwiY29kZSIsInJlZGlyZWN0X3VyaSIsInJlZGlyZWN0VXJpIiwiZ3JhbnRfdHlwZSIsIm9rIiwiUGFyc2UiLCJFcnJvciIsIlZBTElEQVRJT05fRVJST1IiLCJzdGF0dXNUZXh0IiwiZGF0YSIsImpzb24iLCJlcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJlcnJvcl9kZXNjcmlwdGlvbiIsImFjY2Vzc190b2tlbiIsImdldFVzZXJGcm9tQWNjZXNzVG9rZW4iLCJhY2Nlc3NUb2tlbiIsInVzZXJBcGlVcmwiLCJpZCIsIkF1dGhvcml6YXRpb24iLCJ1c2VyRGF0YSIsInBsYXllcklkIiwiX2RlZmF1bHQiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0F1dGgvZ3BnYW1lcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFBhcnNlIFNlcnZlciBhdXRoZW50aWNhdGlvbiBhZGFwdGVyIGZvciBHb29nbGUgUGxheSBHYW1lcyBTZXJ2aWNlcy5cbiAqXG4gKiBAY2xhc3MgR29vZ2xlUGxheUdhbWVzU2VydmljZXNBZGFwdGVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIFRoZSBhZGFwdGVyIGNvbmZpZ3VyYXRpb24gb3B0aW9ucy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRpb25zLmNsaWVudElkIC0gWW91ciBHb29nbGUgUGxheSBHYW1lcyBTZXJ2aWNlcyBBcHAgQ2xpZW50IElELiBSZXF1aXJlZCBmb3Igc2VjdXJlIGF1dGhlbnRpY2F0aW9uLlxuICogQHBhcmFtIHtzdHJpbmd9IG9wdGlvbnMuY2xpZW50U2VjcmV0IC0gWW91ciBHb29nbGUgUGxheSBHYW1lcyBTZXJ2aWNlcyBBcHAgQ2xpZW50IFNlY3JldC4gUmVxdWlyZWQgZm9yIHNlY3VyZSBhdXRoZW50aWNhdGlvbi5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMuZW5hYmxlSW5zZWN1cmVBdXRoPWZhbHNlXSAtICoqW0RFUFJFQ0FURURdKiogRW5hYmxlIGluc2VjdXJlIGF1dGhlbnRpY2F0aW9uIChub3QgcmVjb21tZW5kZWQpLlxuICpcbiAqIEBkZXNjcmlwdGlvblxuICogIyMgUGFyc2UgU2VydmVyIENvbmZpZ3VyYXRpb25cbiAqIFRvIGNvbmZpZ3VyZSBQYXJzZSBTZXJ2ZXIgZm9yIEdvb2dsZSBQbGF5IEdhbWVzIFNlcnZpY2VzIGF1dGhlbnRpY2F0aW9uLCB1c2UgdGhlIGZvbGxvd2luZyBzdHJ1Y3R1cmU6XG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwiYXV0aFwiOiB7XG4gKiAgICAgXCJncGdhbWVzXCI6IHtcbiAqICAgICAgIFwiY2xpZW50SWRcIjogXCJ5b3VyLWNsaWVudC1pZFwiLFxuICogICAgICAgXCJjbGllbnRTZWNyZXRcIjogXCJ5b3VyLWNsaWVudC1zZWNyZXRcIlxuICogICAgIH1cbiAqICAgfVxuICogfVxuICogYGBgXG4gKiAjIyMgSW5zZWN1cmUgQ29uZmlndXJhdGlvbiAoTm90IFJlY29tbWVuZGVkKVxuICogYGBganNvblxuICoge1xuICogICBcImF1dGhcIjoge1xuICogICAgIFwiZ3BnYW1lc1wiOiB7XG4gKiAgICAgICBcImVuYWJsZUluc2VjdXJlQXV0aFwiOiB0cnVlXG4gKiAgICAgfVxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiBUaGUgYWRhcHRlciByZXF1aXJlcyB0aGUgZm9sbG93aW5nIGBhdXRoRGF0YWAgZmllbGRzOlxuICogLSAqKlNlY3VyZSBBdXRoZW50aWNhdGlvbioqOiBgY29kZWAsIGByZWRpcmVjdF91cmlgLlxuICogLSAqKkluc2VjdXJlIEF1dGhlbnRpY2F0aW9uIChOb3QgUmVjb21tZW5kZWQpKio6IGBpZGAsIGBhY2Nlc3NfdG9rZW5gLlxuICpcbiAqICMjIEF1dGggUGF5bG9hZHNcbiAqICMjIyBTZWN1cmUgQXV0aGVudGljYXRpb24gUGF5bG9hZFxuICogYGBganNvblxuICoge1xuICogICBcImdwZ2FtZXNcIjoge1xuICogICAgIFwiY29kZVwiOiBcInh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHhcIixcbiAqICAgICBcInJlZGlyZWN0X3VyaVwiOiBcImh0dHBzOi8vZXhhbXBsZS5jb20vY2FsbGJhY2tcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiAjIyMgSW5zZWN1cmUgQXV0aGVudGljYXRpb24gUGF5bG9hZCAoTm90IFJlY29tbWVuZGVkKVxuICogYGBganNvblxuICoge1xuICogICBcImdwZ2FtZXNcIjoge1xuICogICAgIFwiaWRcIjogXCIxMjM0NTY3ODlcIixcbiAqICAgICBcImFjY2Vzc190b2tlblwiOiBcInh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHhcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiAjIyBOb3Rlc1xuICogLSBgZW5hYmxlSW5zZWN1cmVBdXRoYCBpcyAqKm5vdCByZWNvbW1lbmRlZCoqIGFuZCBtYXkgYmUgcmVtb3ZlZCBpbiBmdXR1cmUgdmVyc2lvbnMuIFVzZSBzZWN1cmUgYXV0aGVudGljYXRpb24gd2l0aCBgY29kZWAgYW5kIGByZWRpcmVjdF91cmlgLlxuICogLSBTZWN1cmUgYXV0aGVudGljYXRpb24gZXhjaGFuZ2VzIHRoZSBgY29kZWAgcHJvdmlkZWQgYnkgdGhlIGNsaWVudCBmb3IgYW4gYWNjZXNzIHRva2VuIHVzaW5nIEdvb2dsZSBQbGF5IEdhbWVzIFNlcnZpY2VzJyBPQXV0aCBBUEkuXG4gKlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vZ2FtZXMvc2VydmljZXMvY29uc29sZS9lbmFibGluZyBHb29nbGUgUGxheSBHYW1lcyBTZXJ2aWNlcyBBdXRoZW50aWNhdGlvbiBEb2N1bWVudGF0aW9ufVxuICovXG5cbmltcG9ydCBCYXNlQ29kZUF1dGhBZGFwdGVyIGZyb20gJy4vQmFzZUNvZGVBdXRoQWRhcHRlcic7XG5jbGFzcyBHb29nbGVQbGF5R2FtZXNTZXJ2aWNlc0FkYXB0ZXIgZXh0ZW5kcyBCYXNlQ29kZUF1dGhBZGFwdGVyIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJncGdhbWVzXCIpO1xuICB9XG5cbiAgYXN5bmMgZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZShhdXRoRGF0YSkge1xuICAgIGNvbnN0IHRva2VuVXJsID0gJ2h0dHBzOi8vb2F1dGgyLmdvb2dsZWFwaXMuY29tL3Rva2VuJztcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHRva2VuVXJsLCB7XG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgQWNjZXB0OiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBjbGllbnRfaWQ6IHRoaXMuY2xpZW50SWQsXG4gICAgICAgIGNsaWVudF9zZWNyZXQ6IHRoaXMuY2xpZW50U2VjcmV0LFxuICAgICAgICBjb2RlOiBhdXRoRGF0YS5jb2RlLFxuICAgICAgICByZWRpcmVjdF91cmk6IGF1dGhEYXRhLnJlZGlyZWN0VXJpLFxuICAgICAgICBncmFudF90eXBlOiAnYXV0aG9yaXphdGlvbl9jb2RlJyxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICBgRmFpbGVkIHRvIGV4Y2hhbmdlIGNvZGUgZm9yIHRva2VuOiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGlmIChkYXRhLmVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgIGRhdGEuZXJyb3JfZGVzY3JpcHRpb24gfHwgZGF0YS5lcnJvclxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGF0YS5hY2Nlc3NfdG9rZW47XG4gIH1cblxuICBhc3luYyBnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuKGFjY2Vzc1Rva2VuLCBhdXRoRGF0YSkge1xuICAgIGNvbnN0IHVzZXJBcGlVcmwgPSBgaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vZ2FtZXMvdjEvcGxheWVycy8ke2F1dGhEYXRhLmlkfWA7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1c2VyQXBpVXJsLCB7XG4gICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7YWNjZXNzVG9rZW59YCxcbiAgICAgICAgQWNjZXB0OiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICBgRmFpbGVkIHRvIGZldGNoIEdvb2dsZSBQbGF5IEdhbWVzIFNlcnZpY2VzIHVzZXI6ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGlmICghdXNlckRhdGEucGxheWVySWQgfHwgdXNlckRhdGEucGxheWVySWQgIT09IGF1dGhEYXRhLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICdJbnZhbGlkIEdvb2dsZSBQbGF5IEdhbWVzIFNlcnZpY2VzIHVzZXIgZGF0YSByZWNlaXZlZC4nXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBpZDogdXNlckRhdGEucGxheWVySWRcbiAgICB9O1xuICB9XG5cbn1cblxuZXhwb3J0IGRlZmF1bHQgbmV3IEdvb2dsZVBsYXlHYW1lc1NlcnZpY2VzQWRhcHRlcigpO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFpRUEsSUFBQUEsb0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUF3RCxTQUFBRCx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQWpFeEQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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