"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for Line.
 *
 * @class LineAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Line App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your Line App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Line authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "line": {
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
 *     "line": {
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
 *   "line": {
 *     "code": "xxxxxxxxx",
 *     "redirect_uri": "https://example.com/callback"
 *   }
 * }
 * ```
 *
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "line": {
 *     "id": "1234567",
 *     "access_token": "xxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - `enableInsecureAuth` is **not recommended** and will be removed in future versions. Use secure authentication with `clientId` and `clientSecret`.
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using Line's OAuth flow.
 *
 * @see {@link https://developers.line.biz/en/docs/line-login/integrate-line-login/ Line Login Documentation}
 */

class LineAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super('Line');
  }
  async getAccessTokenFromCode(authData) {
    if (!authData.code) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Line auth is invalid for this user.');
    }
    const tokenUrl = 'https://api.line.me/oauth2/v2.1/token';
    const response = await fetch(tokenUrl, {
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
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Failed to exchange code for token: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, data.error_description || data.error);
    }
    return data.access_token;
  }
  async getUserFromAccessToken(accessToken) {
    const userApiUrl = 'https://api.line.me/v2/profile';
    const response = await fetch(userApiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Failed to fetch Line user: ${response.statusText}`);
    }
    const userData = await response.json();
    if (!userData?.userId) {
      throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Invalid Line user data received.');
    }
    return userData;
  }
}
var _default = exports.default = new LineAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiTGluZUFkYXB0ZXIiLCJCYXNlQ29kZUF1dGhBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJnZXRBY2Nlc3NUb2tlbkZyb21Db2RlIiwiYXV0aERhdGEiLCJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ0b2tlblVybCIsInJlc3BvbnNlIiwiZmV0Y2giLCJtZXRob2QiLCJoZWFkZXJzIiwiYm9keSIsIlVSTFNlYXJjaFBhcmFtcyIsImNsaWVudF9pZCIsImNsaWVudElkIiwiY2xpZW50X3NlY3JldCIsImNsaWVudFNlY3JldCIsImdyYW50X3R5cGUiLCJyZWRpcmVjdF91cmkiLCJvayIsInN0YXR1c1RleHQiLCJkYXRhIiwianNvbiIsImVycm9yIiwiZXJyb3JfZGVzY3JpcHRpb24iLCJhY2Nlc3NfdG9rZW4iLCJnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuIiwiYWNjZXNzVG9rZW4iLCJ1c2VyQXBpVXJsIiwiQXV0aG9yaXphdGlvbiIsInVzZXJEYXRhIiwidXNlcklkIiwiVkFMSURBVElPTl9FUlJPUiIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL2xpbmUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQYXJzZSBTZXJ2ZXIgYXV0aGVudGljYXRpb24gYWRhcHRlciBmb3IgTGluZS5cbiAqXG4gKiBAY2xhc3MgTGluZUFkYXB0ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gVGhlIGFkYXB0ZXIgY29uZmlndXJhdGlvbiBvcHRpb25zLlxuICogQHBhcmFtIHtzdHJpbmd9IG9wdGlvbnMuY2xpZW50SWQgLSBZb3VyIExpbmUgQXBwIENsaWVudCBJRC4gUmVxdWlyZWQgZm9yIHNlY3VyZSBhdXRoZW50aWNhdGlvbi5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRpb25zLmNsaWVudFNlY3JldCAtIFlvdXIgTGluZSBBcHAgQ2xpZW50IFNlY3JldC4gUmVxdWlyZWQgZm9yIHNlY3VyZSBhdXRoZW50aWNhdGlvbi5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMuZW5hYmxlSW5zZWN1cmVBdXRoPWZhbHNlXSAtICoqW0RFUFJFQ0FURURdKiogRW5hYmxlIGluc2VjdXJlIGF1dGhlbnRpY2F0aW9uIChub3QgcmVjb21tZW5kZWQpLlxuICpcbiAqIEBkZXNjcmlwdGlvblxuICogIyMgUGFyc2UgU2VydmVyIENvbmZpZ3VyYXRpb25cbiAqIFRvIGNvbmZpZ3VyZSBQYXJzZSBTZXJ2ZXIgZm9yIExpbmUgYXV0aGVudGljYXRpb24sIHVzZSB0aGUgZm9sbG93aW5nIHN0cnVjdHVyZTpcbiAqICMjIyBTZWN1cmUgQ29uZmlndXJhdGlvblxuICogYGBganNvblxuICoge1xuICogICBcImF1dGhcIjoge1xuICogICAgIFwibGluZVwiOiB7XG4gKiAgICAgICBcImNsaWVudElkXCI6IFwieW91ci1jbGllbnQtaWRcIixcbiAqICAgICAgIFwiY2xpZW50U2VjcmV0XCI6IFwieW91ci1jbGllbnQtc2VjcmV0XCJcbiAqICAgICB9XG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICogIyMjIEluc2VjdXJlIENvbmZpZ3VyYXRpb24gKE5vdCBSZWNvbW1lbmRlZClcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJhdXRoXCI6IHtcbiAqICAgICBcImxpbmVcIjoge1xuICogICAgICAgXCJlbmFibGVJbnNlY3VyZUF1dGhcIjogdHJ1ZVxuICogICAgIH1cbiAqICAgfVxuICogfVxuICogYGBgXG4gKlxuICogVGhlIGFkYXB0ZXIgcmVxdWlyZXMgdGhlIGZvbGxvd2luZyBgYXV0aERhdGFgIGZpZWxkczpcbiAqIC0gKipTZWN1cmUgQXV0aGVudGljYXRpb24qKjogYGNvZGVgLCBgcmVkaXJlY3RfdXJpYC5cbiAqIC0gKipJbnNlY3VyZSBBdXRoZW50aWNhdGlvbiAoTm90IFJlY29tbWVuZGVkKSoqOiBgaWRgLCBgYWNjZXNzX3Rva2VuYC5cbiAqXG4gKiAjIyBBdXRoIFBheWxvYWRzXG4gKiAjIyMgU2VjdXJlIEF1dGhlbnRpY2F0aW9uIFBheWxvYWRcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJsaW5lXCI6IHtcbiAqICAgICBcImNvZGVcIjogXCJ4eHh4eHh4eHhcIixcbiAqICAgICBcInJlZGlyZWN0X3VyaVwiOiBcImh0dHBzOi8vZXhhbXBsZS5jb20vY2FsbGJhY2tcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiAjIyMgSW5zZWN1cmUgQXV0aGVudGljYXRpb24gUGF5bG9hZCAoTm90IFJlY29tbWVuZGVkKVxuICogYGBganNvblxuICoge1xuICogICBcImxpbmVcIjoge1xuICogICAgIFwiaWRcIjogXCIxMjM0NTY3XCIsXG4gKiAgICAgXCJhY2Nlc3NfdG9rZW5cIjogXCJ4eHh4eHh4eHhcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiAjIyBOb3Rlc1xuICogLSBgZW5hYmxlSW5zZWN1cmVBdXRoYCBpcyAqKm5vdCByZWNvbW1lbmRlZCoqIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gZnV0dXJlIHZlcnNpb25zLiBVc2Ugc2VjdXJlIGF1dGhlbnRpY2F0aW9uIHdpdGggYGNsaWVudElkYCBhbmQgYGNsaWVudFNlY3JldGAuXG4gKiAtIFNlY3VyZSBhdXRoZW50aWNhdGlvbiBleGNoYW5nZXMgdGhlIGBjb2RlYCBhbmQgYHJlZGlyZWN0X3VyaWAgcHJvdmlkZWQgYnkgdGhlIGNsaWVudCBmb3IgYW4gYWNjZXNzIHRva2VuIHVzaW5nIExpbmUncyBPQXV0aCBmbG93LlxuICpcbiAqIEBzZWUge0BsaW5rIGh0dHBzOi8vZGV2ZWxvcGVycy5saW5lLmJpei9lbi9kb2NzL2xpbmUtbG9naW4vaW50ZWdyYXRlLWxpbmUtbG9naW4vIExpbmUgTG9naW4gRG9jdW1lbnRhdGlvbn1cbiAqL1xuXG5pbXBvcnQgQmFzZUNvZGVBdXRoQWRhcHRlciBmcm9tICcuL0Jhc2VDb2RlQXV0aEFkYXB0ZXInO1xuXG5jbGFzcyBMaW5lQWRhcHRlciBleHRlbmRzIEJhc2VDb2RlQXV0aEFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcignTGluZScpO1xuICB9XG5cbiAgYXN5bmMgZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZShhdXRoRGF0YSkge1xuICAgIGlmICghYXV0aERhdGEuY29kZSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAnTGluZSBhdXRoIGlzIGludmFsaWQgZm9yIHRoaXMgdXNlci4nXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHRva2VuVXJsID0gJ2h0dHBzOi8vYXBpLmxpbmUubWUvb2F1dGgyL3YyLjEvdG9rZW4nO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godG9rZW5VcmwsIHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG4gICAgICB9LFxuICAgICAgYm9keTogbmV3IFVSTFNlYXJjaFBhcmFtcyh7XG4gICAgICAgIGNsaWVudF9pZDogdGhpcy5jbGllbnRJZCxcbiAgICAgICAgY2xpZW50X3NlY3JldDogdGhpcy5jbGllbnRTZWNyZXQsXG4gICAgICAgIGdyYW50X3R5cGU6ICdhdXRob3JpemF0aW9uX2NvZGUnLFxuICAgICAgICByZWRpcmVjdF91cmk6IGF1dGhEYXRhLnJlZGlyZWN0X3VyaSxcbiAgICAgICAgY29kZTogYXV0aERhdGEuY29kZSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICBgRmFpbGVkIHRvIGV4Y2hhbmdlIGNvZGUgZm9yIHRva2VuOiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGlmIChkYXRhLmVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgIGRhdGEuZXJyb3JfZGVzY3JpcHRpb24gfHwgZGF0YS5lcnJvclxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGF0YS5hY2Nlc3NfdG9rZW47XG4gIH1cblxuICBhc3luYyBnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuKGFjY2Vzc1Rva2VuKSB7XG4gICAgY29uc3QgdXNlckFwaVVybCA9ICdodHRwczovL2FwaS5saW5lLm1lL3YyL3Byb2ZpbGUnO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXNlckFwaVVybCwge1xuICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke2FjY2Vzc1Rva2VufWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICBgRmFpbGVkIHRvIGZldGNoIExpbmUgdXNlcjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgaWYgKCF1c2VyRGF0YT8udXNlcklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICdJbnZhbGlkIExpbmUgdXNlciBkYXRhIHJlY2VpdmVkLidcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHVzZXJEYXRhO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IG5ldyBMaW5lQWRhcHRlcigpO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFrRUEsSUFBQUEsb0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUF3RCxTQUFBRCx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQWxFeEQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFJQSxNQUFNRyxXQUFXLFNBQVNDLDRCQUFtQixDQUFDO0VBQzVDQyxXQUFXQSxDQUFBLEVBQUc7SUFDWixLQUFLLENBQUMsTUFBTSxDQUFDO0VBQ2Y7RUFFQSxNQUFNQyxzQkFBc0JBLENBQUNDLFFBQVEsRUFBRTtJQUNyQyxJQUFJLENBQUNBLFFBQVEsQ0FBQ0MsSUFBSSxFQUFFO01BQ2xCLE1BQU0sSUFBSUMsS0FBSyxDQUFDQyxLQUFLLENBQ25CRCxLQUFLLENBQUNDLEtBQUssQ0FBQ0MsZ0JBQWdCLEVBQzVCLHFDQUNGLENBQUM7SUFDSDtJQUVBLE1BQU1DLFFBQVEsR0FBRyx1Q0FBdUM7SUFDeEQsTUFBTUMsUUFBUSxHQUFHLE1BQU1DLEtBQUssQ0FBQ0YsUUFBUSxFQUFFO01BQ3JDRyxNQUFNLEVBQUUsTUFBTTtNQUNkQyxPQUFPLEVBQUU7UUFDUCxjQUFjLEVBQUU7TUFDbEIsQ0FBQztNQUNEQyxJQUFJLEVBQUUsSUFBSUMsZUFBZSxDQUFDO1FBQ3hCQyxTQUFTLEVBQUUsSUFBSSxDQUFDQyxRQUFRO1FBQ3hCQyxhQUFhLEVBQUUsSUFBSSxDQUFDQyxZQUFZO1FBQ2hDQyxVQUFVLEVBQUUsb0JBQW9CO1FBQ2hDQyxZQUFZLEVBQUVqQixRQUFRLENBQUNpQixZQUFZO1FBQ25DaEIsSUFBSSxFQUFFRCxRQUFRLENBQUNDO01BQ2pCLENBQUM7SUFDSCxDQUFDLENBQUM7SUFFRixJQUFJLENBQUNLLFFBQVEsQ0FBQ1ksRUFBRSxFQUFFO01BQ2hCLE1BQU0sSUFBSWhCLEtBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsS0FBSyxDQUFDQyxLQUFLLENBQUNDLGdCQUFnQixFQUM1QixzQ0FBc0NFLFFBQVEsQ0FBQ2EsVUFBVSxFQUMzRCxDQUFDO0lBQ0g7SUFFQSxNQUFNQyxJQUFJLEdBQUcsTUFBTWQsUUFBUSxDQUFDZSxJQUFJLENBQUMsQ0FBQztJQUNsQyxJQUFJRCxJQUFJLENBQUNFLEtBQUssRUFBRTtNQUNkLE1BQU0sSUFBSXBCLEtBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsS0FBSyxDQUFDQyxLQUFLLENBQUNDLGdCQUFnQixFQUM1QmdCLElBQUksQ0FBQ0csaUJBQWlCLElBQUlILElBQUksQ0FBQ0UsS0FDakMsQ0FBQztJQUNIO0lBRUEsT0FBT0YsSUFBSSxDQUFDSSxZQUFZO0VBQzFCO0VBRUEsTUFBTUMsc0JBQXNCQSxDQUFDQyxXQUFXLEVBQUU7SUFDeEMsTUFBTUMsVUFBVSxHQUFHLGdDQUFnQztJQUNuRCxNQUFNckIsUUFBUSxHQUFHLE1BQU1DLEtBQUssQ0FBQ29CLFVBQVUsRUFBRTtNQUN2Q25CLE1BQU0sRUFBRSxLQUFLO01BQ2JDLE9BQU8sRUFBRTtRQUNQbUIsYUFBYSxFQUFFLFVBQVVGLFdBQVc7TUFDdEM7SUFDRixDQUFDLENBQUM7SUFFRixJQUFJLENBQUNwQixRQUFRLENBQUNZLEVBQUUsRUFBRTtNQUNoQixNQUFNLElBQUloQixLQUFLLENBQUNDLEtBQUssQ0FDbkJELEtBQUssQ0FBQ0MsS0FBSyxDQUFDQyxnQkFBZ0IsRUFDNUIsOEJBQThCRSxRQUFRLENBQUNhLFVBQVUsRUFDbkQsQ0FBQztJQUNIO0lBRUEsTUFBTVUsUUFBUSxHQUFHLE1BQU12QixRQUFRLENBQUNlLElBQUksQ0FBQyxDQUFDO0lBQ3RDLElBQUksQ0FBQ1EsUUFBUSxFQUFFQyxNQUFNLEVBQUU7TUFDckIsTUFBTSxJQUFJNUIsS0FBSyxDQUFDQyxLQUFLLENBQ25CRCxLQUFLLENBQUNDLEtBQUssQ0FBQzRCLGdCQUFnQixFQUM1QixrQ0FDRixDQUFDO0lBQ0g7SUFFQSxPQUFPRixRQUFRO0VBQ2pCO0FBQ0Y7QUFBQyxJQUFBRyxRQUFBLEdBQUFDLE9BQUEsQ0FBQXRDLE9BQUEsR0FFYyxJQUFJQyxXQUFXLENBQUMsQ0FBQyIsImlnbm9yZUxpc3QiOltdfQ==