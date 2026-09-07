"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PushAdapter = void 0;
/* eslint-disable unused-imports/no-unused-vars */ // Push Adapter
//
// Allows you to change the push notification mechanism.
//
// Adapter classes must implement the following functions:
// * getValidPushTypes()
// * send(devices, installations, pushStatus)
//
// Default is ParsePushAdapter, which uses GCM for
// android push and APNS for ios push.
/**
 * @interface
 * @memberof module:Adapters
 */
class PushAdapter {
  /**
   * @param {any} body
   * @param {Parse.Installation[]} installations
   * @param {any} pushStatus
   * @returns {Promise}
   */
  send(body, installations, pushStatus) {}

  /**
   * Get an array of valid push types.
   * @returns {Array} An array of valid push types
   */
  getValidPushTypes() {
    return [];
  }
}
exports.PushAdapter = PushAdapter;
var _default = exports.default = PushAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQdXNoQWRhcHRlciIsInNlbmQiLCJib2R5IiwiaW5zdGFsbGF0aW9ucyIsInB1c2hTdGF0dXMiLCJnZXRWYWxpZFB1c2hUeXBlcyIsImV4cG9ydHMiLCJfZGVmYXVsdCIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvUHVzaC9QdXNoQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSB1bnVzZWQtaW1wb3J0cy9uby11bnVzZWQtdmFycyAqL1xuLy8gQGZsb3dcbi8vIFB1c2ggQWRhcHRlclxuLy9cbi8vIEFsbG93cyB5b3UgdG8gY2hhbmdlIHRoZSBwdXNoIG5vdGlmaWNhdGlvbiBtZWNoYW5pc20uXG4vL1xuLy8gQWRhcHRlciBjbGFzc2VzIG11c3QgaW1wbGVtZW50IHRoZSBmb2xsb3dpbmcgZnVuY3Rpb25zOlxuLy8gKiBnZXRWYWxpZFB1c2hUeXBlcygpXG4vLyAqIHNlbmQoZGV2aWNlcywgaW5zdGFsbGF0aW9ucywgcHVzaFN0YXR1cylcbi8vXG4vLyBEZWZhdWx0IGlzIFBhcnNlUHVzaEFkYXB0ZXIsIHdoaWNoIHVzZXMgR0NNIGZvclxuLy8gYW5kcm9pZCBwdXNoIGFuZCBBUE5TIGZvciBpb3MgcHVzaC5cblxuLyoqXG4gKiBAaW50ZXJmYWNlXG4gKiBAbWVtYmVyb2YgbW9kdWxlOkFkYXB0ZXJzXG4gKi9cbmV4cG9ydCBjbGFzcyBQdXNoQWRhcHRlciB7XG4gIC8qKlxuICAgKiBAcGFyYW0ge2FueX0gYm9keVxuICAgKiBAcGFyYW0ge1BhcnNlLkluc3RhbGxhdGlvbltdfSBpbnN0YWxsYXRpb25zXG4gICAqIEBwYXJhbSB7YW55fSBwdXNoU3RhdHVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgKi9cbiAgc2VuZChib2R5OiBhbnksIGluc3RhbGxhdGlvbnM6IGFueVtdLCBwdXNoU3RhdHVzOiBhbnkpOiA/UHJvbWlzZTwqPiB7fVxuXG4gIC8qKlxuICAgKiBHZXQgYW4gYXJyYXkgb2YgdmFsaWQgcHVzaCB0eXBlcy5cbiAgICogQHJldHVybnMge0FycmF5fSBBbiBhcnJheSBvZiB2YWxpZCBwdXNoIHR5cGVzXG4gICAqL1xuICBnZXRWYWxpZFB1c2hUeXBlcygpOiBzdHJpbmdbXSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFB1c2hBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxtREFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTUEsV0FBVyxDQUFDO0VBQ3ZCO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxJQUFJQSxDQUFDQyxJQUFTLEVBQUVDLGFBQW9CLEVBQUVDLFVBQWUsRUFBZSxDQUFDOztFQUVyRTtBQUNGO0FBQ0E7QUFDQTtFQUNFQyxpQkFBaUJBLENBQUEsRUFBYTtJQUM1QixPQUFPLEVBQUU7RUFDWDtBQUNGO0FBQUNDLE9BQUEsQ0FBQU4sV0FBQSxHQUFBQSxXQUFBO0FBQUEsSUFBQU8sUUFBQSxHQUFBRCxPQUFBLENBQUFFLE9BQUEsR0FFY1IsV0FBVyIsImlnbm9yZUxpc3QiOltdfQ==