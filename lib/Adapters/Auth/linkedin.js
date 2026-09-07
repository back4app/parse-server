"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for LinkedIn.
 *
 * @class LinkedInAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your LinkedIn App Client ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your LinkedIn App Client Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for LinkedIn authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "linkedin": {
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
 *     "linkedin": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **Secure Authentication**: `code`, `redirect_uri`, and optionally `is_mobile_sdk`.
 * - **Insecure Authentication (Not Recommended)**: `id`, `access_token`, and optionally `is_mobile_sdk`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload
 * ```json
 * {
 *   "linkedin": {
 *     "code": "lmn789opq012rst345uvw",
 *     "redirect_uri": "https://your-redirect-uri.com/callback",
 *     "is_mobile_sdk": true
 *   }
 * }
 * ```
 *
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "linkedin": {
 *     "id": "7654321",
 *     "access_token": "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc",
 *     "is_mobile_sdk": true
 *   }
 * }
 * ```
 *
 * ## Notes
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using LinkedIn's OAuth API.
 * - Insecure authentication validates the user ID and access token directly, bypassing OAuth flows. This method is **not recommended** and may introduce security vulnerabilities.
 * - `enableInsecureAuth` is **deprecated** and may be removed in future versions.
 *
 * @see {@link https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication LinkedIn Authentication Documentation}
 */

class LinkedInAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super('LinkedIn');
  }
  async getUserFromAccessToken(access_token, authData) {
    const response = await fetch('https://api.linkedin.com/v2/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'x-li-format': 'json',
        'x-li-src': authData?.is_mobile_sdk ? 'msdk' : undefined
      }
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'LinkedIn API request failed.');
    }
    return response.json();
  }
  async getAccessTokenFromCode(authData) {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authData.code,
        redirect_uri: authData.redirect_uri,
        client_id: this.clientId,
        client_secret: this.clientSecret
      })
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'LinkedIn API request failed.');
    }
    const json = await response.json();
    return json.access_token;
  }
}
var _default = exports.default = new LinkedInAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiTGlua2VkSW5BZGFwdGVyIiwiQmFzZUF1dGhDb2RlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwiZ2V0VXNlckZyb21BY2Nlc3NUb2tlbiIsImFjY2Vzc190b2tlbiIsImF1dGhEYXRhIiwicmVzcG9uc2UiLCJmZXRjaCIsImhlYWRlcnMiLCJBdXRob3JpemF0aW9uIiwiaXNfbW9iaWxlX3NkayIsInVuZGVmaW5lZCIsIm9rIiwiUGFyc2UiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJqc29uIiwiZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZSIsIm1ldGhvZCIsImJvZHkiLCJVUkxTZWFyY2hQYXJhbXMiLCJncmFudF90eXBlIiwiY29kZSIsInJlZGlyZWN0X3VyaSIsImNsaWVudF9pZCIsImNsaWVudElkIiwiY2xpZW50X3NlY3JldCIsImNsaWVudFNlY3JldCIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL2xpbmtlZGluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUGFyc2UgU2VydmVyIGF1dGhlbnRpY2F0aW9uIGFkYXB0ZXIgZm9yIExpbmtlZEluLlxuICpcbiAqIEBjbGFzcyBMaW5rZWRJbkFkYXB0ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gVGhlIGFkYXB0ZXIgY29uZmlndXJhdGlvbiBvcHRpb25zLlxuICogQHBhcmFtIHtzdHJpbmd9IG9wdGlvbnMuY2xpZW50SWQgLSBZb3VyIExpbmtlZEluIEFwcCBDbGllbnQgSUQuIFJlcXVpcmVkIGZvciBzZWN1cmUgYXV0aGVudGljYXRpb24uXG4gKiBAcGFyYW0ge3N0cmluZ30gb3B0aW9ucy5jbGllbnRTZWNyZXQgLSBZb3VyIExpbmtlZEluIEFwcCBDbGllbnQgU2VjcmV0LiBSZXF1aXJlZCBmb3Igc2VjdXJlIGF1dGhlbnRpY2F0aW9uLlxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5lbmFibGVJbnNlY3VyZUF1dGg9ZmFsc2VdIC0gKipbREVQUkVDQVRFRF0qKiBFbmFibGUgaW5zZWN1cmUgYXV0aGVudGljYXRpb24gKG5vdCByZWNvbW1lbmRlZCkuXG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiAjIyBQYXJzZSBTZXJ2ZXIgQ29uZmlndXJhdGlvblxuICogVG8gY29uZmlndXJlIFBhcnNlIFNlcnZlciBmb3IgTGlua2VkSW4gYXV0aGVudGljYXRpb24sIHVzZSB0aGUgZm9sbG93aW5nIHN0cnVjdHVyZTpcbiAqICMjIyBTZWN1cmUgQ29uZmlndXJhdGlvblxuICogYGBganNvblxuICoge1xuICogICBcImF1dGhcIjoge1xuICogICAgIFwibGlua2VkaW5cIjoge1xuICogICAgICAgXCJjbGllbnRJZFwiOiBcInlvdXItY2xpZW50LWlkXCIsXG4gKiAgICAgICBcImNsaWVudFNlY3JldFwiOiBcInlvdXItY2xpZW50LXNlY3JldFwiXG4gKiAgICAgfVxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqICMjIyBJbnNlY3VyZSBDb25maWd1cmF0aW9uIChOb3QgUmVjb21tZW5kZWQpXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwiYXV0aFwiOiB7XG4gKiAgICAgXCJsaW5rZWRpblwiOiB7XG4gKiAgICAgICBcImVuYWJsZUluc2VjdXJlQXV0aFwiOiB0cnVlXG4gKiAgICAgfVxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiBUaGUgYWRhcHRlciByZXF1aXJlcyB0aGUgZm9sbG93aW5nIGBhdXRoRGF0YWAgZmllbGRzOlxuICogLSAqKlNlY3VyZSBBdXRoZW50aWNhdGlvbioqOiBgY29kZWAsIGByZWRpcmVjdF91cmlgLCBhbmQgb3B0aW9uYWxseSBgaXNfbW9iaWxlX3Nka2AuXG4gKiAtICoqSW5zZWN1cmUgQXV0aGVudGljYXRpb24gKE5vdCBSZWNvbW1lbmRlZCkqKjogYGlkYCwgYGFjY2Vzc190b2tlbmAsIGFuZCBvcHRpb25hbGx5IGBpc19tb2JpbGVfc2RrYC5cbiAqXG4gKiAjIyBBdXRoIFBheWxvYWRzXG4gKiAjIyMgU2VjdXJlIEF1dGhlbnRpY2F0aW9uIFBheWxvYWRcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJsaW5rZWRpblwiOiB7XG4gKiAgICAgXCJjb2RlXCI6IFwibG1uNzg5b3BxMDEycnN0MzQ1dXZ3XCIsXG4gKiAgICAgXCJyZWRpcmVjdF91cmlcIjogXCJodHRwczovL3lvdXItcmVkaXJlY3QtdXJpLmNvbS9jYWxsYmFja1wiLFxuICogICAgIFwiaXNfbW9iaWxlX3Nka1wiOiB0cnVlXG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqICMjIyBJbnNlY3VyZSBBdXRoZW50aWNhdGlvbiBQYXlsb2FkIChOb3QgUmVjb21tZW5kZWQpXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwibGlua2VkaW5cIjoge1xuICogICAgIFwiaWRcIjogXCI3NjU0MzIxXCIsXG4gKiAgICAgXCJhY2Nlc3NfdG9rZW5cIjogXCJBUVhObmQyaElUNno5YkhGelp6MktwMWdoaU16X1J0eXV2d1hZWjEyM2FiY1wiLFxuICogICAgIFwiaXNfbW9iaWxlX3Nka1wiOiB0cnVlXG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqICMjIE5vdGVzXG4gKiAtIFNlY3VyZSBhdXRoZW50aWNhdGlvbiBleGNoYW5nZXMgdGhlIGBjb2RlYCBhbmQgYHJlZGlyZWN0X3VyaWAgcHJvdmlkZWQgYnkgdGhlIGNsaWVudCBmb3IgYW4gYWNjZXNzIHRva2VuIHVzaW5nIExpbmtlZEluJ3MgT0F1dGggQVBJLlxuICogLSBJbnNlY3VyZSBhdXRoZW50aWNhdGlvbiB2YWxpZGF0ZXMgdGhlIHVzZXIgSUQgYW5kIGFjY2VzcyB0b2tlbiBkaXJlY3RseSwgYnlwYXNzaW5nIE9BdXRoIGZsb3dzLiBUaGlzIG1ldGhvZCBpcyAqKm5vdCByZWNvbW1lbmRlZCoqIGFuZCBtYXkgaW50cm9kdWNlIHNlY3VyaXR5IHZ1bG5lcmFiaWxpdGllcy5cbiAqIC0gYGVuYWJsZUluc2VjdXJlQXV0aGAgaXMgKipkZXByZWNhdGVkKiogYW5kIG1heSBiZSByZW1vdmVkIGluIGZ1dHVyZSB2ZXJzaW9ucy5cbiAqXG4gKiBAc2VlIHtAbGluayBodHRwczovL2xlYXJuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlua2VkaW4vc2hhcmVkL2F1dGhlbnRpY2F0aW9uL2F1dGhlbnRpY2F0aW9uIExpbmtlZEluIEF1dGhlbnRpY2F0aW9uIERvY3VtZW50YXRpb259XG4gKi9cblxuaW1wb3J0IEJhc2VBdXRoQ29kZUFkYXB0ZXIgZnJvbSAnLi9CYXNlQ29kZUF1dGhBZGFwdGVyJztcbmNsYXNzIExpbmtlZEluQWRhcHRlciBleHRlbmRzIEJhc2VBdXRoQ29kZUFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcignTGlua2VkSW4nKTtcbiAgfVxuICBhc3luYyBnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuKGFjY2Vzc190b2tlbiwgYXV0aERhdGEpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS5saW5rZWRpbi5jb20vdjIvbWUnLCB7XG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHthY2Nlc3NfdG9rZW59YCxcbiAgICAgICAgJ3gtbGktZm9ybWF0JzogJ2pzb24nLFxuICAgICAgICAneC1saS1zcmMnOiBhdXRoRGF0YT8uaXNfbW9iaWxlX3NkayA/ICdtc2RrJyA6IHVuZGVmaW5lZCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0xpbmtlZEluIEFQSSByZXF1ZXN0IGZhaWxlZC4nKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzcG9uc2UuanNvbigpO1xuICB9XG5cbiAgYXN5bmMgZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZShhdXRoRGF0YSkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vd3d3LmxpbmtlZGluLmNvbS9vYXV0aC92Mi9hY2Nlc3NUb2tlbicsIHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG4gICAgICB9LFxuICAgICAgYm9keTogbmV3IFVSTFNlYXJjaFBhcmFtcyh7XG4gICAgICAgIGdyYW50X3R5cGU6ICdhdXRob3JpemF0aW9uX2NvZGUnLFxuICAgICAgICBjb2RlOiBhdXRoRGF0YS5jb2RlLFxuICAgICAgICByZWRpcmVjdF91cmk6IGF1dGhEYXRhLnJlZGlyZWN0X3VyaSxcbiAgICAgICAgY2xpZW50X2lkOiB0aGlzLmNsaWVudElkLFxuICAgICAgICBjbGllbnRfc2VjcmV0OiB0aGlzLmNsaWVudFNlY3JldCxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdMaW5rZWRJbiBBUEkgcmVxdWVzdCBmYWlsZWQuJyk7XG4gICAgfVxuXG4gICAgY29uc3QganNvbiA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICByZXR1cm4ganNvbi5hY2Nlc3NfdG9rZW47XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgbmV3IExpbmtlZEluQWRhcHRlcigpO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFxRUEsSUFBQUEsb0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUF3RCxTQUFBRCx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQXJFeEQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFHQSxNQUFNRyxlQUFlLFNBQVNDLDRCQUFtQixDQUFDO0VBQ2hEQyxXQUFXQSxDQUFBLEVBQUc7SUFDWixLQUFLLENBQUMsVUFBVSxDQUFDO0VBQ25CO0VBQ0EsTUFBTUMsc0JBQXNCQSxDQUFDQyxZQUFZLEVBQUVDLFFBQVEsRUFBRTtJQUNuRCxNQUFNQyxRQUFRLEdBQUcsTUFBTUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFO01BQzdEQyxPQUFPLEVBQUU7UUFDUEMsYUFBYSxFQUFFLFVBQVVMLFlBQVksRUFBRTtRQUN2QyxhQUFhLEVBQUUsTUFBTTtRQUNyQixVQUFVLEVBQUVDLFFBQVEsRUFBRUssYUFBYSxHQUFHLE1BQU0sR0FBR0M7TUFDakQ7SUFDRixDQUFDLENBQUM7SUFFRixJQUFJLENBQUNMLFFBQVEsQ0FBQ00sRUFBRSxFQUFFO01BQ2hCLE1BQU0sSUFBSUMsS0FBSyxDQUFDQyxLQUFLLENBQUNELEtBQUssQ0FBQ0MsS0FBSyxDQUFDQyxnQkFBZ0IsRUFBRSw4QkFBOEIsQ0FBQztJQUNyRjtJQUVBLE9BQU9ULFFBQVEsQ0FBQ1UsSUFBSSxDQUFDLENBQUM7RUFDeEI7RUFFQSxNQUFNQyxzQkFBc0JBLENBQUNaLFFBQVEsRUFBRTtJQUNyQyxNQUFNQyxRQUFRLEdBQUcsTUFBTUMsS0FBSyxDQUFDLCtDQUErQyxFQUFFO01BQzVFVyxNQUFNLEVBQUUsTUFBTTtNQUNkVixPQUFPLEVBQUU7UUFDUCxjQUFjLEVBQUU7TUFDbEIsQ0FBQztNQUNEVyxJQUFJLEVBQUUsSUFBSUMsZUFBZSxDQUFDO1FBQ3hCQyxVQUFVLEVBQUUsb0JBQW9CO1FBQ2hDQyxJQUFJLEVBQUVqQixRQUFRLENBQUNpQixJQUFJO1FBQ25CQyxZQUFZLEVBQUVsQixRQUFRLENBQUNrQixZQUFZO1FBQ25DQyxTQUFTLEVBQUUsSUFBSSxDQUFDQyxRQUFRO1FBQ3hCQyxhQUFhLEVBQUUsSUFBSSxDQUFDQztNQUN0QixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsSUFBSSxDQUFDckIsUUFBUSxDQUFDTSxFQUFFLEVBQUU7TUFDaEIsTUFBTSxJQUFJQyxLQUFLLENBQUNDLEtBQUssQ0FBQ0QsS0FBSyxDQUFDQyxLQUFLLENBQUNDLGdCQUFnQixFQUFFLDhCQUE4QixDQUFDO0lBQ3JGO0lBRUEsTUFBTUMsSUFBSSxHQUFHLE1BQU1WLFFBQVEsQ0FBQ1UsSUFBSSxDQUFDLENBQUM7SUFDbEMsT0FBT0EsSUFBSSxDQUFDWixZQUFZO0VBQzFCO0FBQ0Y7QUFBQyxJQUFBd0IsUUFBQSxHQUFBQyxPQUFBLENBQUE5QixPQUFBLEdBRWMsSUFBSUMsZUFBZSxDQUFDLENBQUMiLCJpZ25vcmVMaXN0IjpbXX0=