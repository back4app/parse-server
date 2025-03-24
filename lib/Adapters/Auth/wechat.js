"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _BaseCodeAuthAdapter = _interopRequireDefault(require("./BaseCodeAuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parse Server authentication adapter for WeChat.
 *
 * @class WeChatAdapter
 * @param {Object} options - The adapter options object.
 * @param {boolean} [options.enableInsecureAuth=false] - **[DEPRECATED]** Enable insecure authentication (not recommended).
 * @param {string} options.clientId - Your WeChat App ID.
 * @param {string} options.clientSecret - Your WeChat App Secret.
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for WeChat authentication, use the following structure:
 * ### Secure Configuration (Recommended)
 * ```json
 * {
 *   "auth": {
 *     "wechat": {
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
 *     "wechat": {
 *       "enableInsecureAuth": true
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - **With `enableInsecureAuth` (Not Recommended)**: `id`, `access_token`.
 * - **Without `enableInsecureAuth`**: `code`.
 *
 * ## Auth Payloads
 * ### Secure Authentication Payload (Recommended)
 * ```json
 * {
 *   "wechat": {
 *     "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 * ### Insecure Authentication Payload (Not Recommended)
 * ```json
 * {
 *   "wechat": {
 *     "id": "1234567",
 *     "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * }
 * ```
 *
 * ## Notes
 * - With `enableInsecureAuth`, the adapter directly validates the `id` and `access_token` sent by the client.
 * - Without `enableInsecureAuth`, the adapter uses the `code` provided by the client to exchange for an access token via WeChat's OAuth API.
 * - The `enableInsecureAuth` flag is **deprecated** and may be removed in future versions. Use secure authentication with the `code` field instead.
 *
 * @example <caption>Auth Data Example</caption>
 * // Example authData provided by the client:
 * const authData = {
 *   wechat: {
 *     code: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   }
 * };
 *
 * @see {@link https://developers.weixin.qq.com/doc/offiaccount/en/OA_Web_Apps/Wechat_webpage_authorization.html WeChat Authentication Documentation}
 */

class WeChatAdapter extends _BaseCodeAuthAdapter.default {
  constructor() {
    super('WeChat');
  }
  async getUserFromAccessToken(access_token, authData) {
    const response = await fetch(`https://api.weixin.qq.com/sns/auth?access_token=${access_token}&openid=${authData.id}`);
    const data = await response.json();
    if (!response.ok || data.errcode !== 0) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'WeChat auth is invalid for this user.');
    }
    return data;
  }
  async getAccessTokenFromCode(authData) {
    if (!authData.code) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'WeChat auth requires a code to be sent.');
    }
    const appId = this.clientId;
    const appSecret = this.clientSecret;
    const response = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${authData.code}&grant_type=authorization_code`);
    const data = await response.json();
    if (!response.ok || data.errcode) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'WeChat auth is invalid for this user.');
    }
    authData.id = data.openid;
    return data.access_token;
  }
}
var _default = exports.default = new WeChatAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQmFzZUNvZGVBdXRoQWRhcHRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiV2VDaGF0QWRhcHRlciIsIkJhc2VBdXRoQ29kZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsImdldFVzZXJGcm9tQWNjZXNzVG9rZW4iLCJhY2Nlc3NfdG9rZW4iLCJhdXRoRGF0YSIsInJlc3BvbnNlIiwiZmV0Y2giLCJpZCIsImRhdGEiLCJqc29uIiwib2siLCJlcnJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJnZXRBY2Nlc3NUb2tlbkZyb21Db2RlIiwiY29kZSIsImFwcElkIiwiY2xpZW50SWQiLCJhcHBTZWNyZXQiLCJjbGllbnRTZWNyZXQiLCJvcGVuaWQiLCJfZGVmYXVsdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvQXV0aC93ZWNoYXQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQYXJzZSBTZXJ2ZXIgYXV0aGVudGljYXRpb24gYWRhcHRlciBmb3IgV2VDaGF0LlxuICpcbiAqIEBjbGFzcyBXZUNoYXRBZGFwdGVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIFRoZSBhZGFwdGVyIG9wdGlvbnMgb2JqZWN0LlxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5lbmFibGVJbnNlY3VyZUF1dGg9ZmFsc2VdIC0gKipbREVQUkVDQVRFRF0qKiBFbmFibGUgaW5zZWN1cmUgYXV0aGVudGljYXRpb24gKG5vdCByZWNvbW1lbmRlZCkuXG4gKiBAcGFyYW0ge3N0cmluZ30gb3B0aW9ucy5jbGllbnRJZCAtIFlvdXIgV2VDaGF0IEFwcCBJRC5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRpb25zLmNsaWVudFNlY3JldCAtIFlvdXIgV2VDaGF0IEFwcCBTZWNyZXQuXG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiAjIyBQYXJzZSBTZXJ2ZXIgQ29uZmlndXJhdGlvblxuICogVG8gY29uZmlndXJlIFBhcnNlIFNlcnZlciBmb3IgV2VDaGF0IGF1dGhlbnRpY2F0aW9uLCB1c2UgdGhlIGZvbGxvd2luZyBzdHJ1Y3R1cmU6XG4gKiAjIyMgU2VjdXJlIENvbmZpZ3VyYXRpb24gKFJlY29tbWVuZGVkKVxuICogYGBganNvblxuICoge1xuICogICBcImF1dGhcIjoge1xuICogICAgIFwid2VjaGF0XCI6IHtcbiAqICAgICAgIFwiY2xpZW50SWRcIjogXCJ5b3VyLWNsaWVudC1pZFwiLFxuICogICAgICAgXCJjbGllbnRTZWNyZXRcIjogXCJ5b3VyLWNsaWVudC1zZWNyZXRcIlxuICogICAgIH1cbiAqICAgfVxuICogfVxuICogYGBgXG4gKiAjIyMgSW5zZWN1cmUgQ29uZmlndXJhdGlvbiAoTm90IFJlY29tbWVuZGVkKVxuICogYGBganNvblxuICoge1xuICogICBcImF1dGhcIjoge1xuICogICAgIFwid2VjaGF0XCI6IHtcbiAqICAgICAgIFwiZW5hYmxlSW5zZWN1cmVBdXRoXCI6IHRydWVcbiAqICAgICB9XG4gKiAgIH1cbiAqIH1cbiAqIGBgYFxuICpcbiAqIFRoZSBhZGFwdGVyIHJlcXVpcmVzIHRoZSBmb2xsb3dpbmcgYGF1dGhEYXRhYCBmaWVsZHM6XG4gKiAtICoqV2l0aCBgZW5hYmxlSW5zZWN1cmVBdXRoYCAoTm90IFJlY29tbWVuZGVkKSoqOiBgaWRgLCBgYWNjZXNzX3Rva2VuYC5cbiAqIC0gKipXaXRob3V0IGBlbmFibGVJbnNlY3VyZUF1dGhgKio6IGBjb2RlYC5cbiAqXG4gKiAjIyBBdXRoIFBheWxvYWRzXG4gKiAjIyMgU2VjdXJlIEF1dGhlbnRpY2F0aW9uIFBheWxvYWQgKFJlY29tbWVuZGVkKVxuICogYGBganNvblxuICoge1xuICogICBcIndlY2hhdFwiOiB7XG4gKiAgICAgXCJjb2RlXCI6IFwieHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHhcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqICMjIyBJbnNlY3VyZSBBdXRoZW50aWNhdGlvbiBQYXlsb2FkIChOb3QgUmVjb21tZW5kZWQpXG4gKiBgYGBqc29uXG4gKiB7XG4gKiAgIFwid2VjaGF0XCI6IHtcbiAqICAgICBcImlkXCI6IFwiMTIzNDU2N1wiLFxuICogICAgIFwiYWNjZXNzX3Rva2VuXCI6IFwieHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHhcIlxuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiAjIyBOb3Rlc1xuICogLSBXaXRoIGBlbmFibGVJbnNlY3VyZUF1dGhgLCB0aGUgYWRhcHRlciBkaXJlY3RseSB2YWxpZGF0ZXMgdGhlIGBpZGAgYW5kIGBhY2Nlc3NfdG9rZW5gIHNlbnQgYnkgdGhlIGNsaWVudC5cbiAqIC0gV2l0aG91dCBgZW5hYmxlSW5zZWN1cmVBdXRoYCwgdGhlIGFkYXB0ZXIgdXNlcyB0aGUgYGNvZGVgIHByb3ZpZGVkIGJ5IHRoZSBjbGllbnQgdG8gZXhjaGFuZ2UgZm9yIGFuIGFjY2VzcyB0b2tlbiB2aWEgV2VDaGF0J3MgT0F1dGggQVBJLlxuICogLSBUaGUgYGVuYWJsZUluc2VjdXJlQXV0aGAgZmxhZyBpcyAqKmRlcHJlY2F0ZWQqKiBhbmQgbWF5IGJlIHJlbW92ZWQgaW4gZnV0dXJlIHZlcnNpb25zLiBVc2Ugc2VjdXJlIGF1dGhlbnRpY2F0aW9uIHdpdGggdGhlIGBjb2RlYCBmaWVsZCBpbnN0ZWFkLlxuICpcbiAqIEBleGFtcGxlIDxjYXB0aW9uPkF1dGggRGF0YSBFeGFtcGxlPC9jYXB0aW9uPlxuICogLy8gRXhhbXBsZSBhdXRoRGF0YSBwcm92aWRlZCBieSB0aGUgY2xpZW50OlxuICogY29uc3QgYXV0aERhdGEgPSB7XG4gKiAgIHdlY2hhdDoge1xuICogICAgIGNvZGU6IFwieHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHhcIlxuICogICB9XG4gKiB9O1xuICpcbiAqIEBzZWUge0BsaW5rIGh0dHBzOi8vZGV2ZWxvcGVycy53ZWl4aW4ucXEuY29tL2RvYy9vZmZpYWNjb3VudC9lbi9PQV9XZWJfQXBwcy9XZWNoYXRfd2VicGFnZV9hdXRob3JpemF0aW9uLmh0bWwgV2VDaGF0IEF1dGhlbnRpY2F0aW9uIERvY3VtZW50YXRpb259XG4gKi9cblxuaW1wb3J0IEJhc2VBdXRoQ29kZUFkYXB0ZXIgZnJvbSAnLi9CYXNlQ29kZUF1dGhBZGFwdGVyJztcblxuY2xhc3MgV2VDaGF0QWRhcHRlciBleHRlbmRzIEJhc2VBdXRoQ29kZUFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcignV2VDaGF0Jyk7XG4gIH1cblxuICBhc3luYyBnZXRVc2VyRnJvbUFjY2Vzc1Rva2VuKGFjY2Vzc190b2tlbiwgYXV0aERhdGEpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFxuICAgICAgYGh0dHBzOi8vYXBpLndlaXhpbi5xcS5jb20vc25zL2F1dGg/YWNjZXNzX3Rva2VuPSR7YWNjZXNzX3Rva2VufSZvcGVuaWQ9JHthdXRoRGF0YS5pZH1gXG4gICAgKTtcblxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLm9rIHx8IGRhdGEuZXJyY29kZSAhPT0gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdXZUNoYXQgYXV0aCBpcyBpbnZhbGlkIGZvciB0aGlzIHVzZXIuJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRhdGE7XG4gIH1cblxuICBhc3luYyBnZXRBY2Nlc3NUb2tlbkZyb21Db2RlKGF1dGhEYXRhKSB7XG4gICAgaWYgKCFhdXRoRGF0YS5jb2RlKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1dlQ2hhdCBhdXRoIHJlcXVpcmVzIGEgY29kZSB0byBiZSBzZW50LicpO1xuICAgIH1cblxuICAgIGNvbnN0IGFwcElkID0gdGhpcy5jbGllbnRJZDtcbiAgICBjb25zdCBhcHBTZWNyZXQgPSB0aGlzLmNsaWVudFNlY3JldFxuXG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFxuICAgICAgYGh0dHBzOi8vYXBpLndlaXhpbi5xcS5jb20vc25zL29hdXRoMi9hY2Nlc3NfdG9rZW4/YXBwaWQ9JHthcHBJZH0mc2VjcmV0PSR7YXBwU2VjcmV0fSZjb2RlPSR7YXV0aERhdGEuY29kZX0mZ3JhbnRfdHlwZT1hdXRob3JpemF0aW9uX2NvZGVgXG4gICAgKTtcblxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLm9rIHx8IGRhdGEuZXJyY29kZSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdXZUNoYXQgYXV0aCBpcyBpbnZhbGlkIGZvciB0aGlzIHVzZXIuJyk7XG4gICAgfVxuXG4gICAgYXV0aERhdGEuaWQgPSBkYXRhLm9wZW5pZDtcblxuICAgIHJldHVybiBkYXRhLmFjY2Vzc190b2tlbjtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBuZXcgV2VDaGF0QWRhcHRlcigpO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUF5RUEsSUFBQUEsb0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUF3RCxTQUFBRCx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQXpFeEQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUlBLE1BQU1HLGFBQWEsU0FBU0MsNEJBQW1CLENBQUM7RUFDOUNDLFdBQVdBLENBQUEsRUFBRztJQUNaLEtBQUssQ0FBQyxRQUFRLENBQUM7RUFDakI7RUFFQSxNQUFNQyxzQkFBc0JBLENBQUNDLFlBQVksRUFBRUMsUUFBUSxFQUFFO0lBQ25ELE1BQU1DLFFBQVEsR0FBRyxNQUFNQyxLQUFLLENBQzFCLG1EQUFtREgsWUFBWSxXQUFXQyxRQUFRLENBQUNHLEVBQUUsRUFDdkYsQ0FBQztJQUVELE1BQU1DLElBQUksR0FBRyxNQUFNSCxRQUFRLENBQUNJLElBQUksQ0FBQyxDQUFDO0lBRWxDLElBQUksQ0FBQ0osUUFBUSxDQUFDSyxFQUFFLElBQUlGLElBQUksQ0FBQ0csT0FBTyxLQUFLLENBQUMsRUFBRTtNQUN0QyxNQUFNLElBQUlDLEtBQUssQ0FBQ0MsS0FBSyxDQUFDRCxLQUFLLENBQUNDLEtBQUssQ0FBQ0MsZ0JBQWdCLEVBQUUsdUNBQXVDLENBQUM7SUFDOUY7SUFFQSxPQUFPTixJQUFJO0VBQ2I7RUFFQSxNQUFNTyxzQkFBc0JBLENBQUNYLFFBQVEsRUFBRTtJQUNyQyxJQUFJLENBQUNBLFFBQVEsQ0FBQ1ksSUFBSSxFQUFFO01BQ2xCLE1BQU0sSUFBSUosS0FBSyxDQUFDQyxLQUFLLENBQUNELEtBQUssQ0FBQ0MsS0FBSyxDQUFDQyxnQkFBZ0IsRUFBRSx5Q0FBeUMsQ0FBQztJQUNoRztJQUVBLE1BQU1HLEtBQUssR0FBRyxJQUFJLENBQUNDLFFBQVE7SUFDM0IsTUFBTUMsU0FBUyxHQUFHLElBQUksQ0FBQ0MsWUFBWTtJQUduQyxNQUFNZixRQUFRLEdBQUcsTUFBTUMsS0FBSyxDQUMxQiwyREFBMkRXLEtBQUssV0FBV0UsU0FBUyxTQUFTZixRQUFRLENBQUNZLElBQUksZ0NBQzVHLENBQUM7SUFFRCxNQUFNUixJQUFJLEdBQUcsTUFBTUgsUUFBUSxDQUFDSSxJQUFJLENBQUMsQ0FBQztJQUVsQyxJQUFJLENBQUNKLFFBQVEsQ0FBQ0ssRUFBRSxJQUFJRixJQUFJLENBQUNHLE9BQU8sRUFBRTtNQUNoQyxNQUFNLElBQUlDLEtBQUssQ0FBQ0MsS0FBSyxDQUFDRCxLQUFLLENBQUNDLEtBQUssQ0FBQ0MsZ0JBQWdCLEVBQUUsdUNBQXVDLENBQUM7SUFDOUY7SUFFQVYsUUFBUSxDQUFDRyxFQUFFLEdBQUdDLElBQUksQ0FBQ2EsTUFBTTtJQUV6QixPQUFPYixJQUFJLENBQUNMLFlBQVk7RUFDMUI7QUFDRjtBQUFDLElBQUFtQixRQUFBLEdBQUFDLE9BQUEsQ0FBQXpCLE9BQUEsR0FFYyxJQUFJQyxhQUFhLENBQUMsQ0FBQyIsImlnbm9yZUxpc3QiOltdfQ==