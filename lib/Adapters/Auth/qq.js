"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for QQ.
 *
 * @class QqAdapter
 * @param {Object} options - The adapter configuration options.
 * @param {string} options.clientId - Your QQ App ID. Required for secure authentication.
 * @param {string} options.clientSecret - Your QQ App Secret. Required for secure authentication.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for QQ authentication, use the following structure:
 * ### Secure Configuration
 * ```json
 * {
 *   "auth": {
 *     "qq": {
 *       "clientId": "your-app-id",
 *       "clientSecret": "your-app-secret"
 *     }
 *   }
 * }
 * ```
 * ### Insecure Configuration (Not Recommended)
 * ```json
 * {
 *   "auth": {
 *     "qq": {
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
 *   "qq": {
 *     "code": "abcd1234",
 *     "redirect_uri": "https://your-redirect-uri.com/callback"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "qq": {
 *     "id": "1234567",
 *     "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - Secure authentication exchanges the `code` and `redirect_uri` provided by the client for an access token using QQ's OAuth API.
 * - **Insecure authentication** validates the `id` and `access_token` directly, bypassing OAuth flows. This approach is not recommended and may be deprecated in future versions.
 *
 * @see {@link https://wiki.connect.qq.com/ QQ Authentication Documentation}
 */

class QqAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super('qq');
  }
  async getUserFromAccessToken(access_token) {
    const response = await fetch('https://graph.qq.com/oauth2.0/me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq API request failed.');
    }
    const data = await response.text();
    return this.parseResponseData(data);
  }
  async getAccessTokenFromCode(authData) {
    const response = await fetch('https://graph.qq.com/oauth2.0/token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: authData.redirect_uri,
        code: authData.code
      }).toString()
    });
    if (!response.ok) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq API request failed.');
    }
    const text = await response.text();
    const data = this.parseResponseData(text);
    return data.access_token;
  }
}
var _default = exports.default = new QqAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUXFBZGFwdGVyIiwiQmFzZUF1dGhDb2RlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwiZ2V0VXNlckZyb21BY2Nlc3NUb2tlbiIsImFjY2Vzc190b2tlbiIsInJlc3BvbnNlIiwiZmV0Y2giLCJoZWFkZXJzIiwiQXV0aG9yaXphdGlvbiIsIm9rIiwiUGFyc2UiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJkYXRhIiwidGV4dCIsInBhcnNlUmVzcG9uc2VEYXRhIiwiZ2V0QWNjZXNzVG9rZW5Gcm9tQ29kZSIsImF1dGhEYXRhIiwibWV0aG9kIiwiYm9keSIsIlVSTFNlYXJjaFBhcmFtcyIsImdyYW50X3R5cGUiLCJjbGllbnRfaWQiLCJjbGllbnRJZCIsImNsaWVudF9zZWNyZXQiLCJjbGllbnRTZWNyZXQiLCJyZWRpcmVjdF91cmkiLCJjb2RlIiwidG9TdHJpbmciLCJfZGVmYXVsdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvQXV0aC9xcS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFBhcnNlIFNlcnZlciBhdXRoZW50aWNhdGlvbiBhZGFwdGVyIGZvciBRUS5cbiAqXG4gKiBAY2xhc3MgUXFBZGFwdGVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIFRoZSBhZGFwdGVyIGNvbmZpZ3VyYXRpb24gb3B0aW9ucy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRpb25zLmNsaWVudElkIC0gWW91ciBRUSBBcHAgSUQuIFJlcXVpcmVkIGZvciBzZWN1cmUgYXV0aGVudGljYXRpb24uXG4gKiBAcGFyYW0ge3N0cmluZ30gb3B0aW9ucy5jbGllbnRTZWNyZXQgLSBZb3VyIFFRIEFwcCBTZWNyZXQuIFJlcXVpcmVkIGZvciBzZWN1cmUgYXV0aGVudGljYXRpb24uXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmVuYWJsZUluc2VjdXJlQXV0aD1mYWxzZV0gLSAqKltERVBSRUNBVEVEXSoqIEVuYWJsZSBpbnNlY3VyZSBhdXRoZW50aWNhdGlvbiAobm90IHJlY29tbWVuZGVkKS5cbiAqXG4gKiBAZGVzY3JpcHRpb25cbiAqICMjIFBhcnNlIFNlcnZlciBDb25maWd1cmF0aW9uXG4gKiBUbyBjb25maWd1cmUgUGFyc2UgU2VydmVyIGZvciBRUSBhdXRoZW50aWNhdGlvbiwgdXNlIHRoZSBmb2xsb3dpbmcgc3RydWN0dXJlOlxuICogIyMjIFNlY3VyZSBDb25maWd1cmF0aW9uXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwiYXV0aFwiOiB7XG4gKiAgICAgXCJxcVwiOiB7XG4gKiAgICAgICBcImNsaWVudElkXCI6IFwieW91ci1hcHAtaWRcIixcbiAqICAgICAgIFwiY2xpZW50U2VjcmV0XCI6IFwieW91ci1hcHAtc2VjcmV0XCJcbiAqICAgICB9XG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICogIyMjIEluc2VjdXJlIENvbmZpZ3VyYXRpb24gKE5vdCBSZWNvbW1lbmRlZClcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJhdXRoXCI6IHtcbiAqICAgICBcInFxXCI6IHtcbiAqICAgICAgIFwiZW5hYmxlSW5zZWN1cmVBdXRoXCI6IHRydWVcbiAqICAgICB9XG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqIFRoZSBhZGFwdGVyIHJlcXVpcmVzIHRoZSBmb2xsb3dpbmcgYGF1dGhEYXRhYCBmaWVsZHM6XG4gKiAtICoqU2VjdXJlIEF1dGhlbnRpY2F0aW9uKio6IGBjb2RlYCwgYHJlZGlyZWN0X3VyaWAuXG4gKiAtICoqSW5zZWN1cmUgQXV0aGVudGljYXRpb24gKE5vdCBSZWNvbW1lbmRlZCkqKjogYGlkYCwgYGFjY2Vzc190b2tlbmAuXG4gKlxuICogIyMgQXV0aCBQYXlsb2Fkc1xuICogIyMjIFNlY3VyZSBBdXRoZW50aWNhdGlvbiBQYXlsb2FkXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwicXFcIjoge1xuICogICAgIFwiY29kZVwiOiBcImFiY2QxMjM0XCIsXG4gKiAgICAgXCJyZWRpcmVjdF91cmlcIjogXCJodHRwczovL3lvdXItcmVkaXJlY3QtdXJpLmNvbS9jYWxsYmFja1wiXG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICogIyMjIEluc2VjdXJlIEF1dGhlbnRpY2F0aW9uIFBheWxvYWQgKE5vdCBSZWNvbW1lbmRlZClcbiAqIGBgYGpzb25cbiAqIHtcbiAqICAgXCJxcVwiOiB7XG4gKiAgICAgXCJpZFwiOiBcIjEyMzQ1NjdcIixcbiAqICAgICBcImFjY2Vzc190b2tlblwiOiBcInh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4XCJcbiAqICAgfVxuICogfVxuICogYGBgXG4gKlxuICogIyMgTm90ZXNcbiAqIC0gU2VjdXJlIGF1dGhlbnRpY2F0aW9uIGV4Y2hhbmdlcyB0aGUgYGNvZGVgIGFuZCBgcmVkaXJlY3RfdXJpYCBwcm92aWRlZCBieSB0aGUgY2xpZW50IGZvciBhbiBhY2Nlc3MgdG9rZW4gdXNpbmcgUVEncyBPQXV0aCBBUEkuXG4gKiAtICoqSW5zZWN1cmUgYXV0aGVudGljYXRpb24qKiB2YWxpZGF0ZXMgdGhlIGBpZGAgYW5kIGBhY2Nlc3NfdG9rZW5gIGRpcmVjdGx5LCBieXBhc3NpbmcgT0F1dGggZmxvd3MuIFRoaXMgYXBwcm9hY2ggaXMgbm90IHJlY29tbWVuZGVkIGFuZCBtYXkgYmUgZGVwcmVjYXRlZCBpbiBmdXR1cmUgdmVyc2lvbnMuXG4gKlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly93aWtpLmNvbm5lY3QucXEuY29tLyBRUSBBdXRoZW50aWNhdGlvbiBEb2N1bWVudGF0aW9ufVxuICovXG5cbmltcG9ydCBCYXNlQXV0aENvZGVBZGFwdGVyIGZyb20gJy4vQmFzZUNvZGVBdXRoQWRhcHRlcic7XG5jbGFzcyBRcUFkYXB0ZXIgZXh0ZW5kcyBCYXNlQXV0aENvZGVBZGFwdGVyIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoJ3FxJyk7XG4gIH1cblxuICBhc3luYyBnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuKGFjY2Vzc190b2tlbikge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vZ3JhcGgucXEuY29tL29hdXRoMi4wL21lJywge1xuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7YWNjZXNzX3Rva2VufWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdxcSBBUEkgcmVxdWVzdCBmYWlsZWQuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICByZXR1cm4gdGhpcy5wYXJzZVJlc3BvbnNlRGF0YShkYXRhKTtcbiAgfVxuXG4gIGFzeW5jIGdldEFjY2Vzc1Rva2VuRnJvbUNvZGUoYXV0aERhdGEpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL2dyYXBoLnFxLmNvbS9vYXV0aDIuMC90b2tlbicsIHtcbiAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcbiAgICAgICAgZ3JhbnRfdHlwZTogJ2F1dGhvcml6YXRpb25fY29kZScsXG4gICAgICAgIGNsaWVudF9pZDogdGhpcy5jbGllbnRJZCxcbiAgICAgICAgY2xpZW50X3NlY3JldDogdGhpcy5jbGllbnRTZWNyZXQsXG4gICAgICAgIHJlZGlyZWN0X3VyaTogYXV0aERhdGEucmVkaXJlY3RfdXJpLFxuICAgICAgICBjb2RlOiBhdXRoRGF0YS5jb2RlLFxuICAgICAgfSkudG9TdHJpbmcoKSxcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAncXEgQVBJIHJlcXVlc3QgZmFpbGVkLicpO1xuICAgIH1cblxuICAgIGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgY29uc3QgZGF0YSA9IHRoaXMucGFyc2VSZXNwb25zZURhdGEodGV4dCk7XG4gICAgcmV0dXJuIGRhdGEuYWNjZXNzX3Rva2VuO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IG5ldyBRcUFkYXB0ZXIoKTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBaUVBLElBQUFBLG9CQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFBd0QsU0FBQUQsdUJBQUFFLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFqRXhEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUdBLE1BQU1HLFNBQVMsU0FBU0MsNEJBQW1CLENBQUM7RUFDMUNDLFdBQVdBLENBQUEsRUFBRztJQUNaLEtBQUssQ0FBQyxJQUFJLENBQUM7RUFDYjtFQUVBLE1BQU1DLHNCQUFzQkEsQ0FBQ0MsWUFBWSxFQUFFO0lBQ3pDLE1BQU1DLFFBQVEsR0FBRyxNQUFNQyxLQUFLLENBQUMsa0NBQWtDLEVBQUU7TUFDL0RDLE9BQU8sRUFBRTtRQUNQQyxhQUFhLEVBQUUsVUFBVUosWUFBWTtNQUN2QztJQUNGLENBQUMsQ0FBQztJQUVGLElBQUksQ0FBQ0MsUUFBUSxDQUFDSSxFQUFFLEVBQUU7TUFDaEIsTUFBTSxJQUFJQyxLQUFLLENBQUNDLEtBQUssQ0FBQ0QsS0FBSyxDQUFDQyxLQUFLLENBQUNDLGdCQUFnQixFQUFFLHdCQUF3QixDQUFDO0lBQy9FO0lBRUEsTUFBTUMsSUFBSSxHQUFHLE1BQU1SLFFBQVEsQ0FBQ1MsSUFBSSxDQUFDLENBQUM7SUFDbEMsT0FBTyxJQUFJLENBQUNDLGlCQUFpQixDQUFDRixJQUFJLENBQUM7RUFDckM7RUFFQSxNQUFNRyxzQkFBc0JBLENBQUNDLFFBQVEsRUFBRTtJQUNyQyxNQUFNWixRQUFRLEdBQUcsTUFBTUMsS0FBSyxDQUFDLHFDQUFxQyxFQUFFO01BQ2xFWSxNQUFNLEVBQUUsS0FBSztNQUNiWCxPQUFPLEVBQUU7UUFDUCxjQUFjLEVBQUU7TUFDbEIsQ0FBQztNQUNEWSxJQUFJLEVBQUUsSUFBSUMsZUFBZSxDQUFDO1FBQ3hCQyxVQUFVLEVBQUUsb0JBQW9CO1FBQ2hDQyxTQUFTLEVBQUUsSUFBSSxDQUFDQyxRQUFRO1FBQ3hCQyxhQUFhLEVBQUUsSUFBSSxDQUFDQyxZQUFZO1FBQ2hDQyxZQUFZLEVBQUVULFFBQVEsQ0FBQ1MsWUFBWTtRQUNuQ0MsSUFBSSxFQUFFVixRQUFRLENBQUNVO01BQ2pCLENBQUMsQ0FBQyxDQUFDQyxRQUFRLENBQUM7SUFDZCxDQUFDLENBQUM7SUFFRixJQUFJLENBQUN2QixRQUFRLENBQUNJLEVBQUUsRUFBRTtNQUNoQixNQUFNLElBQUlDLEtBQUssQ0FBQ0MsS0FBSyxDQUFDRCxLQUFLLENBQUNDLEtBQUssQ0FBQ0MsZ0JBQWdCLEVBQUUsd0JBQXdCLENBQUM7SUFDL0U7SUFFQSxNQUFNRSxJQUFJLEdBQUcsTUFBTVQsUUFBUSxDQUFDUyxJQUFJLENBQUMsQ0FBQztJQUNsQyxNQUFNRCxJQUFJLEdBQUcsSUFBSSxDQUFDRSxpQkFBaUIsQ0FBQ0QsSUFBSSxDQUFDO0lBQ3pDLE9BQU9ELElBQUksQ0FBQ1QsWUFBWTtFQUMxQjtBQUNGO0FBQUMsSUFBQXlCLFFBQUEsR0FBQUMsT0FBQSxDQUFBL0IsT0FBQSxHQUVjLElBQUlDLFNBQVMsQ0FBQyxDQUFDIiwiaWdub3JlTGlzdCI6W119