"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AuthAdapter = void 0;
/*eslint no-unused-vars: "off"*/

/**
 * @interface ParseAuthResponse
 * @property {Boolean} [doNotSave] If true, Parse Server will not save provided authData.
 * @property {Object} [response] If set, Parse Server will send the provided response to the client under authDataResponse
 * @property {Object} [save] If set, Parse Server will save the object provided into this key, instead of client provided authData
 */

/**
 * AuthPolicy
 * default: can be combined with ONE additional auth provider if additional configured on user
 * additional: could be only used with a default policy auth provider
 * solo: Will ignore ALL additional providers if additional configured on user
 * @typedef {"default" | "additional" | "solo"} AuthPolicy
 */

class AuthAdapter {
  constructor() {
    /**
     * Usage policy
     * @type {AuthPolicy}
     */
    if (!this.policy) {
      this.policy = 'default';
    }
  }
  /**
   * @param appIds The specified app IDs in the configuration
   * @param {Object} authData The client provided authData
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {(Promise<undefined|void>|void|undefined)} resolves or returns if the applicationId is valid
   */
  validateAppId(appIds, authData, options, request) {
    return Promise.resolve({});
  }

  /**
   * Legacy usage, if provided it will be triggered when authData related to this provider is touched (signup/update/login)
   * otherwise you should implement validateSetup, validateLogin and validateUpdate
   * @param {Object} authData The client provided authData
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateAuthData(authData, options, request) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide for the first time this auth provider
   * could be a register or the user adding a new auth service
   * @param {Object} authData The client provided authData
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateSetUp(authData, options, req) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide authData related to this provider
   * The user is not logged in and has already set this provider before
   * @param {Object} authData The client provided authData
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateLogin(authData, options, req) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide authData related to this provider
   * the user is logged in and has already set this provider before
   * @param {Object} authData The client provided authData
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<ParseAuthResponse|void|undefined>}
   */
  validateUpdate(authData, options, req) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user is looked up by authData with this provider. Override the `id` field if needed.
   * @param {Object} authData The client provided authData
   */
  beforeFind(authData) {}

  /**
   * Triggered in pre authentication process if needed (like webauthn, SMS OTP)
   * @param {Object} challengeData Data provided by the client
   * @param {(Object|undefined)} authData Auth data provided by the client, can be used for validation
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<Object>} A promise that resolves, resolved value will be added to challenge response under challenge key
   */
  challenge(challengeData, authData, options, request) {
    return Promise.resolve({});
  }

  /**
   * Triggered when auth data is fetched
   * @param {Object} authData authData
   * @param {Object} options additional adapter options
   * @param {Parse.Cloud.TriggerRequest} request
   * @returns {Promise<Object>} Any overrides required to authData
   */
  afterFind(authData, options, request) {
    return Promise.resolve({});
  }

  /**
   * Triggered when the adapter is first attached to Parse Server
   * @param {Object} options Adapter Options
   */
  validateOptions(options) {
    /* */
  }
}
exports.AuthAdapter = AuthAdapter;
var _default = exports.default = AuthAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBdXRoQWRhcHRlciIsImNvbnN0cnVjdG9yIiwicG9saWN5IiwidmFsaWRhdGVBcHBJZCIsImFwcElkcyIsImF1dGhEYXRhIiwib3B0aW9ucyIsInJlcXVlc3QiLCJQcm9taXNlIiwicmVzb2x2ZSIsInZhbGlkYXRlQXV0aERhdGEiLCJ2YWxpZGF0ZVNldFVwIiwicmVxIiwidmFsaWRhdGVMb2dpbiIsInZhbGlkYXRlVXBkYXRlIiwiYmVmb3JlRmluZCIsImNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiLCJhZnRlckZpbmQiLCJ2YWxpZGF0ZU9wdGlvbnMiLCJleHBvcnRzIiwiX2RlZmF1bHQiLCJkZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0F1dGgvQXV0aEFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2VBdXRoUmVzcG9uc2VcbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gW2RvTm90U2F2ZV0gSWYgdHJ1ZSwgUGFyc2UgU2VydmVyIHdpbGwgbm90IHNhdmUgcHJvdmlkZWQgYXV0aERhdGEuXG4gKiBAcHJvcGVydHkge09iamVjdH0gW3Jlc3BvbnNlXSBJZiBzZXQsIFBhcnNlIFNlcnZlciB3aWxsIHNlbmQgdGhlIHByb3ZpZGVkIHJlc3BvbnNlIHRvIHRoZSBjbGllbnQgdW5kZXIgYXV0aERhdGFSZXNwb25zZVxuICogQHByb3BlcnR5IHtPYmplY3R9IFtzYXZlXSBJZiBzZXQsIFBhcnNlIFNlcnZlciB3aWxsIHNhdmUgdGhlIG9iamVjdCBwcm92aWRlZCBpbnRvIHRoaXMga2V5LCBpbnN0ZWFkIG9mIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICovXG5cbi8qKlxuICogQXV0aFBvbGljeVxuICogZGVmYXVsdDogY2FuIGJlIGNvbWJpbmVkIHdpdGggT05FIGFkZGl0aW9uYWwgYXV0aCBwcm92aWRlciBpZiBhZGRpdGlvbmFsIGNvbmZpZ3VyZWQgb24gdXNlclxuICogYWRkaXRpb25hbDogY291bGQgYmUgb25seSB1c2VkIHdpdGggYSBkZWZhdWx0IHBvbGljeSBhdXRoIHByb3ZpZGVyXG4gKiBzb2xvOiBXaWxsIGlnbm9yZSBBTEwgYWRkaXRpb25hbCBwcm92aWRlcnMgaWYgYWRkaXRpb25hbCBjb25maWd1cmVkIG9uIHVzZXJcbiAqIEB0eXBlZGVmIHtcImRlZmF1bHRcIiB8IFwiYWRkaXRpb25hbFwiIHwgXCJzb2xvXCJ9IEF1dGhQb2xpY3lcbiAqL1xuXG5leHBvcnQgY2xhc3MgQXV0aEFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvKipcbiAgICAgKiBVc2FnZSBwb2xpY3lcbiAgICAgKiBAdHlwZSB7QXV0aFBvbGljeX1cbiAgICAgKi9cbiAgICBpZiAoIXRoaXMucG9saWN5KSB7XG4gICAgICB0aGlzLnBvbGljeSA9ICdkZWZhdWx0JztcbiAgICB9XG4gIH1cbiAgLyoqXG4gICAqIEBwYXJhbSBhcHBJZHMgVGhlIHNwZWNpZmllZCBhcHAgSURzIGluIHRoZSBjb25maWd1cmF0aW9uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGFkZGl0aW9uYWwgYWRhcHRlciBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMgeyhQcm9taXNlPHVuZGVmaW5lZHx2b2lkPnx2b2lkfHVuZGVmaW5lZCl9IHJlc29sdmVzIG9yIHJldHVybnMgaWYgdGhlIGFwcGxpY2F0aW9uSWQgaXMgdmFsaWRcbiAgICovXG4gIHZhbGlkYXRlQXBwSWQoYXBwSWRzLCBhdXRoRGF0YSwgb3B0aW9ucywgcmVxdWVzdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIExlZ2FjeSB1c2FnZSwgaWYgcHJvdmlkZWQgaXQgd2lsbCBiZSB0cmlnZ2VyZWQgd2hlbiBhdXRoRGF0YSByZWxhdGVkIHRvIHRoaXMgcHJvdmlkZXIgaXMgdG91Y2hlZCAoc2lnbnVwL3VwZGF0ZS9sb2dpbilcbiAgICogb3RoZXJ3aXNlIHlvdSBzaG91bGQgaW1wbGVtZW50IHZhbGlkYXRlU2V0dXAsIHZhbGlkYXRlTG9naW4gYW5kIHZhbGlkYXRlVXBkYXRlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGFkZGl0aW9uYWwgYWRhcHRlciBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VBdXRoUmVzcG9uc2V8dm9pZHx1bmRlZmluZWQ+fVxuICAgKi9cbiAgdmFsaWRhdGVBdXRoRGF0YShhdXRoRGF0YSwgb3B0aW9ucywgcmVxdWVzdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIHVzZXIgcHJvdmlkZSBmb3IgdGhlIGZpcnN0IHRpbWUgdGhpcyBhdXRoIHByb3ZpZGVyXG4gICAqIGNvdWxkIGJlIGEgcmVnaXN0ZXIgb3IgdGhlIHVzZXIgYWRkaW5nIGEgbmV3IGF1dGggc2VydmljZVxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgVGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBhZGRpdGlvbmFsIGFkYXB0ZXIgb3B0aW9uc1xuICAgKiBAcGFyYW0ge1BhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlQXV0aFJlc3BvbnNlfHZvaWR8dW5kZWZpbmVkPn1cbiAgICovXG4gIHZhbGlkYXRlU2V0VXAoYXV0aERhdGEsIG9wdGlvbnMsIHJlcSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIHVzZXIgcHJvdmlkZSBhdXRoRGF0YSByZWxhdGVkIHRvIHRoaXMgcHJvdmlkZXJcbiAgICogVGhlIHVzZXIgaXMgbm90IGxvZ2dlZCBpbiBhbmQgaGFzIGFscmVhZHkgc2V0IHRoaXMgcHJvdmlkZXIgYmVmb3JlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBUaGUgY2xpZW50IHByb3ZpZGVkIGF1dGhEYXRhXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGFkZGl0aW9uYWwgYWRhcHRlciBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VBdXRoUmVzcG9uc2V8dm9pZHx1bmRlZmluZWQ+fVxuICAgKi9cbiAgdmFsaWRhdGVMb2dpbihhdXRoRGF0YSwgb3B0aW9ucywgcmVxKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlcmVkIHdoZW4gdXNlciBwcm92aWRlIGF1dGhEYXRhIHJlbGF0ZWQgdG8gdGhpcyBwcm92aWRlclxuICAgKiB0aGUgdXNlciBpcyBsb2dnZWQgaW4gYW5kIGhhcyBhbHJlYWR5IHNldCB0aGlzIHByb3ZpZGVyIGJlZm9yZVxuICAgKiBAcGFyYW0ge09iamVjdH0gYXV0aERhdGEgVGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBhZGRpdGlvbmFsIGFkYXB0ZXIgb3B0aW9uc1xuICAgKiBAcGFyYW0ge1BhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlQXV0aFJlc3BvbnNlfHZvaWR8dW5kZWZpbmVkPn1cbiAgICovXG4gIHZhbGlkYXRlVXBkYXRlKGF1dGhEYXRhLCBvcHRpb25zLCByZXEpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyZWQgd2hlbiB1c2VyIGlzIGxvb2tlZCB1cCBieSBhdXRoRGF0YSB3aXRoIHRoaXMgcHJvdmlkZXIuIE92ZXJyaWRlIHRoZSBgaWRgIGZpZWxkIGlmIG5lZWRlZC5cbiAgICogQHBhcmFtIHtPYmplY3R9IGF1dGhEYXRhIFRoZSBjbGllbnQgcHJvdmlkZWQgYXV0aERhdGFcbiAgICovXG4gIGJlZm9yZUZpbmQoYXV0aERhdGEpIHtcblxuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCBpbiBwcmUgYXV0aGVudGljYXRpb24gcHJvY2VzcyBpZiBuZWVkZWQgKGxpa2Ugd2ViYXV0aG4sIFNNUyBPVFApXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjaGFsbGVuZ2VEYXRhIERhdGEgcHJvdmlkZWQgYnkgdGhlIGNsaWVudFxuICAgKiBAcGFyYW0geyhPYmplY3R8dW5kZWZpbmVkKX0gYXV0aERhdGEgQXV0aCBkYXRhIHByb3ZpZGVkIGJ5IHRoZSBjbGllbnQsIGNhbiBiZSB1c2VkIGZvciB2YWxpZGF0aW9uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGFkZGl0aW9uYWwgYWRhcHRlciBvcHRpb25zXG4gICAqIEBwYXJhbSB7UGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9IHJlcXVlc3RcbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMsIHJlc29sdmVkIHZhbHVlIHdpbGwgYmUgYWRkZWQgdG8gY2hhbGxlbmdlIHJlc3BvbnNlIHVuZGVyIGNoYWxsZW5nZSBrZXlcbiAgICovXG4gIGNoYWxsZW5nZShjaGFsbGVuZ2VEYXRhLCBhdXRoRGF0YSwgb3B0aW9ucywgcmVxdWVzdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIGF1dGggZGF0YSBpcyBmZXRjaGVkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YSBhdXRoRGF0YVxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBhZGRpdGlvbmFsIGFkYXB0ZXIgb3B0aW9uc1xuICAgKiBAcGFyYW0ge1BhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IEFueSBvdmVycmlkZXMgcmVxdWlyZWQgdG8gYXV0aERhdGFcbiAgICovXG4gIGFmdGVyRmluZChhdXRoRGF0YSwgb3B0aW9ucywgcmVxdWVzdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXJlZCB3aGVuIHRoZSBhZGFwdGVyIGlzIGZpcnN0IGF0dGFjaGVkIHRvIFBhcnNlIFNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBBZGFwdGVyIE9wdGlvbnNcbiAgICovXG4gIHZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKSB7XG4gICAgLyogKi9cbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBdXRoQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVPLE1BQU1BLFdBQVcsQ0FBQztFQUN2QkMsV0FBV0EsQ0FBQSxFQUFHO0lBQ1o7QUFDSjtBQUNBO0FBQ0E7SUFDSSxJQUFJLENBQUMsSUFBSSxDQUFDQyxNQUFNLEVBQUU7TUFDaEIsSUFBSSxDQUFDQSxNQUFNLEdBQUcsU0FBUztJQUN6QjtFQUNGO0VBQ0E7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsYUFBYUEsQ0FBQ0MsTUFBTSxFQUFFQyxRQUFRLEVBQUVDLE9BQU8sRUFBRUMsT0FBTyxFQUFFO0lBQ2hELE9BQU9DLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsZ0JBQWdCQSxDQUFDTCxRQUFRLEVBQUVDLE9BQU8sRUFBRUMsT0FBTyxFQUFFO0lBQzNDLE9BQU9DLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUUsYUFBYUEsQ0FBQ04sUUFBUSxFQUFFQyxPQUFPLEVBQUVNLEdBQUcsRUFBRTtJQUNwQyxPQUFPSixPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1Qjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VJLGFBQWFBLENBQUNSLFFBQVEsRUFBRUMsT0FBTyxFQUFFTSxHQUFHLEVBQUU7SUFDcEMsT0FBT0osT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDNUI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFSyxjQUFjQSxDQUFDVCxRQUFRLEVBQUVDLE9BQU8sRUFBRU0sR0FBRyxFQUFFO0lBQ3JDLE9BQU9KLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0VBQ0VNLFVBQVVBLENBQUNWLFFBQVEsRUFBRSxDQUVyQjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VXLFNBQVNBLENBQUNDLGFBQWEsRUFBRVosUUFBUSxFQUFFQyxPQUFPLEVBQUVDLE9BQU8sRUFBRTtJQUNuRCxPQUFPQyxPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUM1Qjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFUyxTQUFTQSxDQUFDYixRQUFRLEVBQUVDLE9BQU8sRUFBRUMsT0FBTyxFQUFFO0lBQ3BDLE9BQU9DLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0VBQ0VVLGVBQWVBLENBQUNiLE9BQU8sRUFBRTtJQUN2QjtFQUFBO0FBRUo7QUFBQ2MsT0FBQSxDQUFBcEIsV0FBQSxHQUFBQSxXQUFBO0FBQUEsSUFBQXFCLFFBQUEsR0FBQUQsT0FBQSxDQUFBRSxPQUFBLEdBRWN0QixXQUFXIiwiaWdub3JlTGlzdCI6W119