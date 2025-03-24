"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for Spotify.
 *
 * @class SpotifyAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your Spotify application's Client ID. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Spotify authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "spotify": {
 *       "clientId": "your-client-id"
 *     }
 *   }
 * }
 * ```
 * ### Insecure Configuration (Not Recommended)
 * ```json
 * {
 *   "auth": {
 *     "spotify": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `code`, `redirect_uri`, and `code_verifier`.
 * - **Insecure Authentication (Not Recommended)**: `id`, `access_token`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "spotify": {
 *     "code": "abc123def456ghi789",
 *     "redirect_uri": "https://example.com/callback",
 *     "code_verifier": "secure-code-verifier"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "spotify": {
 *     "id": "1234567",
 *     "access_token": "abc123def456ghi789"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - `enableInsecureAuth` is **not recommended** and bypasses secure flows by validating the user ID and access token directly. This method is not suitable for production environments and may be removed in future versions.
 * - Secure authentication exchanges the `code` provided by the client for an access token using Spotify's OAuth API. This method ensures greater security and is the recommended approach.
 *
 * @see {@link https://developer.spotify.com/documentation/web-api/tutorials/getting-started Spotify OAuth Documentation}
 */

class SpotifyAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super('spotify');
  }
  async getUserFromAccessToken(access_token) {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify API request failed.');
    }
    const user = await response.json();
    return {
      id: user.id
    };
  }
  async getAccessTokenFromCode(authData) {
    if (!authData.code || !authData.redirect_uri || !authData.code_verifier) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify auth configuration authData.code and/or authData.redirect_uri and/or authData.code_verifier.');
    }
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authData.code,
        redirect_uri: authData.redirect_uri,
        code_verifier: authData.code_verifier,
        client_id: this.clientId
      })
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify API request failed.');
    }
    return response.json();
  }
}
var _default = exports.default = new SpotifyAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiU3BvdGlmeUFkYXB0ZXIiLCJCYXNlQXV0aENvZGVBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuIiwiYWNjZXNzX3Rva2VuIiwicmVzcG9uc2UiLCJmZXRjaCIsImhlYWRlcnMiLCJBdXRob3JpemF0aW9uIiwib2siLCJQYXJzZSIsIkVycm9yIiwiT0JKRUNUX05PVF9GT1VORCIsInVzZXIiLCJqc29uIiwiaWQiLCJnZXRBY2Nlc3NUb2tlbkZyb21Db2RlIiwiYXV0aERhdGEiLCJjb2RlIiwicmVkaXJlY3RfdXJpIiwiY29kZV92ZXJpZmllciIsIm1ldGhvZCIsImJvZHkiLCJVUkxTZWFyY2hQYXJhbXMiLCJncmFudF90eXBlIiwiY2xpZW50X2lkIiwiY2xpZW50SWQiLCJfZGVmYXVsdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvQXV0aC9zcG90aWZ5LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUGFyc2UgU2VydmVyIGF1dGhlbnRpY2F0aW9uIGFkYXB0ZXIgZm9yIFNwb3RpZnkuXG4gKlxuICogQGNsYXNzIFNwb3RpZnlBZGFwdGVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIFRoZSBhZGFwdGVyIGNvbmZpZ3VyYXRpb24gb3B0aW9ucy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRpb25zLmNsaWVudElkIC0gWW91ciBTcG90aWZ5IGFwcGxpY2F0aW9uJ3MgQ2xpZW50IElELiBSZXF1aXJlZCBmb3Igc2VjdXJlIGF1dGhlbnRpY2F0aW9uLlxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5lbmFibGVJbnNlY3VyZUF1dGg9ZmFsc2VdIC0gKipbREVQUkVDQVRFRF0qKiBFbmFibGUgaW5zZWN1cmUgYXV0aGVudGljYXRpb24gKG5vdCByZWNvbW1lbmRlZCkuXG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiAjIyBQYXJzZSBTZXJ2ZXIgQ29uZmlndXJhdGlvblxuICogVG8gY29uZmlndXJlIFBhcnNlIFNlcnZlciBmb3IgU3BvdGlmeSBhdXRoZW50aWNhdGlvbiwgdXNlIHRoZSBmb2xsb3dpbmcgc3RydWN0dXJlOlxuICogIyMjIFNlY3VyZSBDb25maWd1cmF0aW9uXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwiYXV0aFwiOiB7XG4gKiAgICAgXCJzcG90aWZ5XCI6IHtcbiAqICAgICAgIFwiY2xpZW50SWRcIjogXCJ5b3VyLWNsaWVudC1pZFwiXG4gKiAgICAgfVxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqICMjIyBJbnNlY3VyZSBDb25maWd1cmF0aW9uIChOb3QgUmVjb21tZW5kZWQpXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwiYXV0aFwiOiB7XG4gKiAgICAgXCJzcG90aWZ5XCI6IHtcbiAqICAgICAgIFwiZW5hYmxlSW5zZWN1cmVBdXRoXCI6IHRydWVcbiAqICAgICB9XG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqIFRoZSBhZGFwdGVyIHJlcXVpcmVzIHRoZSBmb2xsb3dpbmcgYGF1dGhEYXRhYCBmaWVsZHM6XG4gKiAtICoqU2VjdXJlIEF1dGhlbnRpY2F0aW9uKio6IGBjb2RlYCwgYHJlZGlyZWN0X3VyaWAsIGFuZCBgY29kZV92ZXJpZmllcmAuXG4gKiAtICoqSW5zZWN1cmUgQXV0aGVudGljYXRpb24gKE5vdCBSZWNvbW1lbmRlZCkqKjogYGlkYCwgYGFjY2Vzc190b2tlbmAuXG4gKlxuICogIyMgQXV0aCBQYXlsb2Fkc1xuICogIyMjIFNlY3VyZSBBdXRoZW50aWNhdGlvbiBQYXlsb2FkXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwic3BvdGlmeVwiOiB7XG4gKiAgICAgXCJjb2RlXCI6IFwiYWJjMTIzZGVmNDU2Z2hpNzg5XCIsXG4gKiAgICAgXCJyZWRpcmVjdF91cmlcIjogXCJodHRwczovL2V4YW1wbGUuY29tL2NhbGxiYWNrXCIsXG4gKiAgICAgXCJjb2RlX3ZlcmlmaWVyXCI6IFwic2VjdXJlLWNvZGUtdmVyaWZpZXJcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqICMjIyBJbnNlY3VyZSBBdXRoZW50aWNhdGlvbiBQYXlsb2FkIChOb3QgUmVjb21tZW5kZWQpXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwic3BvdGlmeVwiOiB7XG4gKiAgICAgXCJpZFwiOiBcIjEyMzQ1NjdcIixcbiAqICAgICBcImFjY2Vzc190b2tlblwiOiBcImFiYzEyM2RlZjQ1NmdoaTc4OVwiXG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqICMjIE5vdGVzXG4gKiAtIGBlbmFibGVJbnNlY3VyZUF1dGhgIGlzICoqbm90IHJlY29tbWVuZGVkKiogYW5kIGJ5cGFzc2VzIHNlY3VyZSBmbG93cyBieSB2YWxpZGF0aW5nIHRoZSB1c2VyIElEIGFuZCBhY2Nlc3MgdG9rZW4gZGlyZWN0bHkuIFRoaXMgbWV0aG9kIGlzIG5vdCBzdWl0YWJsZSBmb3IgcHJvZHVjdGlvbiBlbnZpcm9ubWVudHMgYW5kIG1heSBiZSByZW1vdmVkIGluIGZ1dHVyZSB2ZXJzaW9ucy5cbiAqIC0gU2VjdXJlIGF1dGhlbnRpY2F0aW9uIGV4Y2hhbmdlcyB0aGUgYGNvZGVgIHByb3ZpZGVkIGJ5IHRoZSBjbGllbnQgZm9yIGFuIGFjY2VzcyB0b2tlbiB1c2luZyBTcG90aWZ5J3MgT0F1dGggQVBJLiBUaGlzIG1ldGhvZCBlbnN1cmVzIGdyZWF0ZXIgc2VjdXJpdHkgYW5kIGlzIHRoZSByZWNvbW1lbmRlZCBhcHByb2FjaC5cbiAqXG4gKiBAc2VlIHtAbGluayBodHRwczovL2RldmVsb3Blci5zcG90aWZ5LmNvbS9kb2N1bWVudGF0aW9uL3dlYi1hcGkvdHV0b3JpYWxzL2dldHRpbmctc3RhcnRlZCBTcG90aWZ5IE9BdXRoIERvY3VtZW50YXRpb259XG4gKi9cblxuaW1wb3J0IEJhc2VBdXRoQ29kZUFkYXB0ZXIgZnJvbSAnLi9CYXNlQ29kZUF1dGhBZGFwdGVyJztcbmNsYXNzIFNwb3RpZnlBZGFwdGVyIGV4dGVuZHMgQmFzZUF1dGhDb2RlQWRhcHRlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKCdzcG90aWZ5Jyk7XG4gIH1cblxuICBhc3luYyBnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuKGFjY2Vzc190b2tlbikge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vYXBpLnNwb3RpZnkuY29tL3YxL21lJywge1xuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiAnQmVhcmVyICcgKyBhY2Nlc3NfdG9rZW4sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdTcG90aWZ5IEFQSSByZXF1ZXN0IGZhaWxlZC4nKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIHJldHVybiB7XG4gICAgICBpZDogdXNlci5pZCxcbiAgICB9O1xuICB9XG5cbiAgYXN5bmMgZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZShhdXRoRGF0YSkge1xuICAgIGlmICghYXV0aERhdGEuY29kZSB8fCAhYXV0aERhdGEucmVkaXJlY3RfdXJpIHx8ICFhdXRoRGF0YS5jb2RlX3ZlcmlmaWVyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICdTcG90aWZ5IGF1dGggY29uZmlndXJhdGlvbiBhdXRoRGF0YS5jb2RlIGFuZC9vciBhdXRoRGF0YS5yZWRpcmVjdF91cmkgYW5kL29yIGF1dGhEYXRhLmNvZGVfdmVyaWZpZXIuJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL2FjY291bnRzLnNwb3RpZnkuY29tL2FwaS90b2tlbicsIHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG4gICAgICB9LFxuICAgICAgYm9keTogbmV3IFVSTFNlYXJjaFBhcmFtcyh7XG4gICAgICAgIGdyYW50X3R5cGU6ICdhdXRob3JpemF0aW9uX2NvZGUnLFxuICAgICAgICBjb2RlOiBhdXRoRGF0YS5jb2RlLFxuICAgICAgICByZWRpcmVjdF91cmk6IGF1dGhEYXRhLnJlZGlyZWN0X3VyaSxcbiAgICAgICAgY29kZV92ZXJpZmllcjogYXV0aERhdGEuY29kZV92ZXJpZmllcixcbiAgICAgICAgY2xpZW50X2lkOiB0aGlzLmNsaWVudElkLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1Nwb3RpZnkgQVBJIHJlcXVlc3QgZmFpbGVkLicpO1xuICAgIH1cblxuICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgbmV3IFNwb3RpZnlBZGFwdGVyKCk7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQWdFQSxJQUFBQSxvQkFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQXdELFNBQUFELHVCQUFBRSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBaEV4RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBR0EsTUFBTUcsY0FBYyxTQUFTQyw0QkFBbUIsQ0FBQztFQUMvQ0MsV0FBV0EsQ0FBQSxFQUFHO0lBQ1osS0FBSyxDQUFDLFNBQVMsQ0FBQztFQUNsQjtFQUVBLE1BQU1DLHNCQUFzQkEsQ0FBQ0MsWUFBWSxFQUFFO0lBQ3pDLE1BQU1DLFFBQVEsR0FBRyxNQUFNQyxLQUFLLENBQUMsK0JBQStCLEVBQUU7TUFDNURDLE9BQU8sRUFBRTtRQUNQQyxhQUFhLEVBQUUsU0FBUyxHQUFHSjtNQUM3QjtJQUNGLENBQUMsQ0FBQztJQUVGLElBQUksQ0FBQ0MsUUFBUSxDQUFDSSxFQUFFLEVBQUU7TUFDaEIsTUFBTSxJQUFJQyxLQUFLLENBQUNDLEtBQUssQ0FBQ0QsS0FBSyxDQUFDQyxLQUFLLENBQUNDLGdCQUFnQixFQUFFLDZCQUE2QixDQUFDO0lBQ3BGO0lBRUEsTUFBTUMsSUFBSSxHQUFHLE1BQU1SLFFBQVEsQ0FBQ1MsSUFBSSxDQUFDLENBQUM7SUFDbEMsT0FBTztNQUNMQyxFQUFFLEVBQUVGLElBQUksQ0FBQ0U7SUFDWCxDQUFDO0VBQ0g7RUFFQSxNQUFNQyxzQkFBc0JBLENBQUNDLFFBQVEsRUFBRTtJQUNyQyxJQUFJLENBQUNBLFFBQVEsQ0FBQ0MsSUFBSSxJQUFJLENBQUNELFFBQVEsQ0FBQ0UsWUFBWSxJQUFJLENBQUNGLFFBQVEsQ0FBQ0csYUFBYSxFQUFFO01BQ3ZFLE1BQU0sSUFBSVYsS0FBSyxDQUFDQyxLQUFLLENBQ25CRCxLQUFLLENBQUNDLEtBQUssQ0FBQ0MsZ0JBQWdCLEVBQzVCLHNHQUNGLENBQUM7SUFDSDtJQUVBLE1BQU1QLFFBQVEsR0FBRyxNQUFNQyxLQUFLLENBQUMsd0NBQXdDLEVBQUU7TUFDckVlLE1BQU0sRUFBRSxNQUFNO01BQ2RkLE9BQU8sRUFBRTtRQUNQLGNBQWMsRUFBRTtNQUNsQixDQUFDO01BQ0RlLElBQUksRUFBRSxJQUFJQyxlQUFlLENBQUM7UUFDeEJDLFVBQVUsRUFBRSxvQkFBb0I7UUFDaENOLElBQUksRUFBRUQsUUFBUSxDQUFDQyxJQUFJO1FBQ25CQyxZQUFZLEVBQUVGLFFBQVEsQ0FBQ0UsWUFBWTtRQUNuQ0MsYUFBYSxFQUFFSCxRQUFRLENBQUNHLGFBQWE7UUFDckNLLFNBQVMsRUFBRSxJQUFJLENBQUNDO01BQ2xCLENBQUM7SUFDSCxDQUFDLENBQUM7SUFFRixJQUFJLENBQUNyQixRQUFRLENBQUNJLEVBQUUsRUFBRTtNQUNoQixNQUFNLElBQUlDLEtBQUssQ0FBQ0MsS0FBSyxDQUFDRCxLQUFLLENBQUNDLEtBQUssQ0FBQ0MsZ0JBQWdCLEVBQUUsNkJBQTZCLENBQUM7SUFDcEY7SUFFQSxPQUFPUCxRQUFRLENBQUNTLElBQUksQ0FBQyxDQUFDO0VBQ3hCO0FBQ0Y7QUFBQyxJQUFBYSxRQUFBLEdBQUFDLE9BQUEsQ0FBQTdCLE9BQUEsR0FFYyxJQUFJQyxjQUFjLENBQUMsQ0FBQyIsImlnbm9yZUxpc3QiOltdfQ==