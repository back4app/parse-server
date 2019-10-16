"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.FilesAdapter = void 0;

/*eslint no-unused-vars: "off"*/
// Files Adapter
//
// Allows you to change the file storage mechanism.
//
// Adapter classes must implement the following functions:
// * createFile(filename, data, contentType)
// * deleteFile(filename)
// * getFileData(filename)
// * getFileLocation(config, filename)
//
// Default is GridFSBucketAdapter, which requires mongo
// and for the API server to be using the DatabaseController with Mongo
// database adapter.

/**
 * @module Adapters
 */

/**
 * @interface FilesAdapter
 */
class FilesAdapter {
  /** Responsible for storing the file in order to be retrieved later by its filename
   *
   * @param {string} filename - the filename to save
   * @param {*} data - the buffer of data from the file
   * @param {string} contentType - the supposed contentType
   * @discussion the contentType can be undefined if the controller was not able to determine it
   *
   * @return {Promise} a promise that should fail if the storage didn't succeed
   */
  createFile(filename, data, contentType) {}
  /** Responsible for deleting the specified file
   *
   * @param {string} filename - the filename to delete
   *
   * @return {Promise} a promise that should fail if the deletion didn't succeed
   */


  deleteFile(filename) {}
  /** Responsible for retrieving the data of the specified file
   *
   * @param {string} filename - the name of file to retrieve
   *
   * @return {Promise} a promise that should pass with the file data or fail on error
   */


  getFileData(filename) {}
  /** Returns an absolute URL where the file can be accessed
   *
   * @param {Config} config - server configuration
   * @param {string} filename
   *
   * @return {string} Absolute URL
   */


  getFileLocation(config, filename) {}

}

exports.FilesAdapter = FilesAdapter;
var _default = FilesAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9GaWxlcy9GaWxlc0FkYXB0ZXIuanMiXSwibmFtZXMiOlsiRmlsZXNBZGFwdGVyIiwiY3JlYXRlRmlsZSIsImZpbGVuYW1lIiwiZGF0YSIsImNvbnRlbnRUeXBlIiwiZGVsZXRlRmlsZSIsImdldEZpbGVEYXRhIiwiZ2V0RmlsZUxvY2F0aW9uIiwiY29uZmlnIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFHQTs7OztBQUdBOzs7QUFHTyxNQUFNQSxZQUFOLENBQW1CO0FBQ3hCOzs7Ozs7Ozs7QUFTQUMsRUFBQUEsVUFBVSxDQUFDQyxRQUFELEVBQW1CQyxJQUFuQixFQUF5QkMsV0FBekIsRUFBdUQsQ0FBRTtBQUVuRTs7Ozs7Ozs7QUFNQUMsRUFBQUEsVUFBVSxDQUFDSCxRQUFELEVBQTRCLENBQUU7QUFFeEM7Ozs7Ozs7O0FBTUFJLEVBQUFBLFdBQVcsQ0FBQ0osUUFBRCxFQUFpQyxDQUFFO0FBRTlDOzs7Ozs7Ozs7QUFPQUssRUFBQUEsZUFBZSxDQUFDQyxNQUFELEVBQWlCTixRQUFqQixFQUEyQyxDQUFFOztBQW5DcEM7OztlQXNDWEYsWSIsInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cbi8vIEZpbGVzIEFkYXB0ZXJcbi8vXG4vLyBBbGxvd3MgeW91IHRvIGNoYW5nZSB0aGUgZmlsZSBzdG9yYWdlIG1lY2hhbmlzbS5cbi8vXG4vLyBBZGFwdGVyIGNsYXNzZXMgbXVzdCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnM6XG4vLyAqIGNyZWF0ZUZpbGUoZmlsZW5hbWUsIGRhdGEsIGNvbnRlbnRUeXBlKVxuLy8gKiBkZWxldGVGaWxlKGZpbGVuYW1lKVxuLy8gKiBnZXRGaWxlRGF0YShmaWxlbmFtZSlcbi8vICogZ2V0RmlsZUxvY2F0aW9uKGNvbmZpZywgZmlsZW5hbWUpXG4vL1xuLy8gRGVmYXVsdCBpcyBHcmlkRlNCdWNrZXRBZGFwdGVyLCB3aGljaCByZXF1aXJlcyBtb25nb1xuLy8gYW5kIGZvciB0aGUgQVBJIHNlcnZlciB0byBiZSB1c2luZyB0aGUgRGF0YWJhc2VDb250cm9sbGVyIHdpdGggTW9uZ29cbi8vIGRhdGFiYXNlIGFkYXB0ZXIuXG5cbmltcG9ydCB0eXBlIHsgQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29uZmlnJztcbi8qKlxuICogQG1vZHVsZSBBZGFwdGVyc1xuICovXG4vKipcbiAqIEBpbnRlcmZhY2UgRmlsZXNBZGFwdGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBGaWxlc0FkYXB0ZXIge1xuICAvKiogUmVzcG9uc2libGUgZm9yIHN0b3JpbmcgdGhlIGZpbGUgaW4gb3JkZXIgdG8gYmUgcmV0cmlldmVkIGxhdGVyIGJ5IGl0cyBmaWxlbmFtZVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWUgLSB0aGUgZmlsZW5hbWUgdG8gc2F2ZVxuICAgKiBAcGFyYW0geyp9IGRhdGEgLSB0aGUgYnVmZmVyIG9mIGRhdGEgZnJvbSB0aGUgZmlsZVxuICAgKiBAcGFyYW0ge3N0cmluZ30gY29udGVudFR5cGUgLSB0aGUgc3VwcG9zZWQgY29udGVudFR5cGVcbiAgICogQGRpc2N1c3Npb24gdGhlIGNvbnRlbnRUeXBlIGNhbiBiZSB1bmRlZmluZWQgaWYgdGhlIGNvbnRyb2xsZXIgd2FzIG5vdCBhYmxlIHRvIGRldGVybWluZSBpdFxuICAgKlxuICAgKiBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCBzaG91bGQgZmFpbCBpZiB0aGUgc3RvcmFnZSBkaWRuJ3Qgc3VjY2VlZFxuICAgKi9cbiAgY3JlYXRlRmlsZShmaWxlbmFtZTogc3RyaW5nLCBkYXRhLCBjb250ZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZSB7fVxuXG4gIC8qKiBSZXNwb25zaWJsZSBmb3IgZGVsZXRpbmcgdGhlIHNwZWNpZmllZCBmaWxlXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZSAtIHRoZSBmaWxlbmFtZSB0byBkZWxldGVcbiAgICpcbiAgICogQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgc2hvdWxkIGZhaWwgaWYgdGhlIGRlbGV0aW9uIGRpZG4ndCBzdWNjZWVkXG4gICAqL1xuICBkZWxldGVGaWxlKGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlIHt9XG5cbiAgLyoqIFJlc3BvbnNpYmxlIGZvciByZXRyaWV2aW5nIHRoZSBkYXRhIG9mIHRoZSBzcGVjaWZpZWQgZmlsZVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWUgLSB0aGUgbmFtZSBvZiBmaWxlIHRvIHJldHJpZXZlXG4gICAqXG4gICAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHNob3VsZCBwYXNzIHdpdGggdGhlIGZpbGUgZGF0YSBvciBmYWlsIG9uIGVycm9yXG4gICAqL1xuICBnZXRGaWxlRGF0YShmaWxlbmFtZTogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHt9XG5cbiAgLyoqIFJldHVybnMgYW4gYWJzb2x1dGUgVVJMIHdoZXJlIHRoZSBmaWxlIGNhbiBiZSBhY2Nlc3NlZFxuICAgKlxuICAgKiBAcGFyYW0ge0NvbmZpZ30gY29uZmlnIC0gc2VydmVyIGNvbmZpZ3VyYXRpb25cbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gICAqXG4gICAqIEByZXR1cm4ge3N0cmluZ30gQWJzb2x1dGUgVVJMXG4gICAqL1xuICBnZXRGaWxlTG9jYXRpb24oY29uZmlnOiBDb25maWcsIGZpbGVuYW1lOiBzdHJpbmcpOiBzdHJpbmcge31cbn1cblxuZXhwb3J0IGRlZmF1bHQgRmlsZXNBZGFwdGVyO1xuIl19