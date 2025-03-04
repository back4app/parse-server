"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.FilesAdapter = void 0;
exports.validateFilename = validateFilename;
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
// Adapter classes should implement the following functions:
// * validateFilename(filename)
// * handleFileStream(filename, req, res, contentType)
//
// Default is GridFSBucketAdapter, which requires mongo
// and for the API server to be using the DatabaseController with Mongo
// database adapter.

/**
 * @interface
 * @memberof module:Adapters
 */
class FilesAdapter {
  /** Responsible for storing the file in order to be retrieved later by its filename
   *
   * @param {string} filename - the filename to save
   * @param {*} data - the buffer of data from the file
   * @param {string} contentType - the supposed contentType
   * @discussion the contentType can be undefined if the controller was not able to determine it
   * @param {object} options - (Optional) options to be passed to file adapter (S3 File Adapter Only)
   * - tags: object containing key value pairs that will be stored with file
   * - metadata: object containing key value pairs that will be sotred with file (https://docs.aws.amazon.com/AmazonS3/latest/user-guide/add-object-metadata.html)
   * @discussion options are not supported by all file adapters. Check the your adapter's documentation for compatibility
   *
   * @return {Promise} a promise that should fail if the storage didn't succeed
   */
  createFile(filename, data, contentType, options) {}

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
   * @return {string | Promise<string>} Absolute URL
   */
  getFileLocation(config, filename) {}

  /** Validate a filename for this adapter type
   *
   * @param {string} filename
   *
   * @returns {null|Parse.Error} null if there are no errors
   */
  // validateFilename(filename: string): ?Parse.Error {}

  /** Handles Byte-Range Requests for Streaming
   *
   * @param {string} filename
   * @param {object} req
   * @param {object} res
   * @param {string} contentType
   *
   * @returns {Promise} Data for byte range
   */
  // handleFileStream(filename: string, res: any, req: any, contentType: string): Promise

  /** Responsible for retrieving metadata and tags
   *
   * @param {string} filename - the filename to retrieve metadata
   *
   * @return {Promise} a promise that should pass with metadata
   */
  // getMetadata(filename: string): Promise<any> {}
}

/**
 * Simple filename validation
 *
 * @param filename
 * @returns {null|Parse.Error}
 */
exports.FilesAdapter = FilesAdapter;
function validateFilename(filename) {
  if (filename.length > 128) {
    return new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename too long.');
  }
  const regx = /^[_a-zA-Z0-9][a-zA-Z0-9@. ~_-]*$/;
  if (!filename.match(regx)) {
    return new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
  }
  return null;
}
var _default = exports.default = FilesAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiRmlsZXNBZGFwdGVyIiwiY3JlYXRlRmlsZSIsImZpbGVuYW1lIiwiZGF0YSIsImNvbnRlbnRUeXBlIiwib3B0aW9ucyIsImRlbGV0ZUZpbGUiLCJnZXRGaWxlRGF0YSIsImdldEZpbGVMb2NhdGlvbiIsImNvbmZpZyIsImV4cG9ydHMiLCJ2YWxpZGF0ZUZpbGVuYW1lIiwibGVuZ3RoIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfRklMRV9OQU1FIiwicmVneCIsIm1hdGNoIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvRmlsZXMvRmlsZXNBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cbi8vIEZpbGVzIEFkYXB0ZXJcbi8vXG4vLyBBbGxvd3MgeW91IHRvIGNoYW5nZSB0aGUgZmlsZSBzdG9yYWdlIG1lY2hhbmlzbS5cbi8vXG4vLyBBZGFwdGVyIGNsYXNzZXMgbXVzdCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnM6XG4vLyAqIGNyZWF0ZUZpbGUoZmlsZW5hbWUsIGRhdGEsIGNvbnRlbnRUeXBlKVxuLy8gKiBkZWxldGVGaWxlKGZpbGVuYW1lKVxuLy8gKiBnZXRGaWxlRGF0YShmaWxlbmFtZSlcbi8vICogZ2V0RmlsZUxvY2F0aW9uKGNvbmZpZywgZmlsZW5hbWUpXG4vLyBBZGFwdGVyIGNsYXNzZXMgc2hvdWxkIGltcGxlbWVudCB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbi8vICogdmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSlcbi8vICogaGFuZGxlRmlsZVN0cmVhbShmaWxlbmFtZSwgcmVxLCByZXMsIGNvbnRlbnRUeXBlKVxuLy9cbi8vIERlZmF1bHQgaXMgR3JpZEZTQnVja2V0QWRhcHRlciwgd2hpY2ggcmVxdWlyZXMgbW9uZ29cbi8vIGFuZCBmb3IgdGhlIEFQSSBzZXJ2ZXIgdG8gYmUgdXNpbmcgdGhlIERhdGFiYXNlQ29udHJvbGxlciB3aXRoIE1vbmdvXG4vLyBkYXRhYmFzZSBhZGFwdGVyLlxuXG5pbXBvcnQgdHlwZSB7IENvbmZpZyB9IGZyb20gJy4uLy4uL0NvbmZpZyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vKipcbiAqIEBpbnRlcmZhY2VcbiAqIEBtZW1iZXJvZiBtb2R1bGU6QWRhcHRlcnNcbiAqL1xuZXhwb3J0IGNsYXNzIEZpbGVzQWRhcHRlciB7XG4gIC8qKiBSZXNwb25zaWJsZSBmb3Igc3RvcmluZyB0aGUgZmlsZSBpbiBvcmRlciB0byBiZSByZXRyaWV2ZWQgbGF0ZXIgYnkgaXRzIGZpbGVuYW1lXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZSAtIHRoZSBmaWxlbmFtZSB0byBzYXZlXG4gICAqIEBwYXJhbSB7Kn0gZGF0YSAtIHRoZSBidWZmZXIgb2YgZGF0YSBmcm9tIHRoZSBmaWxlXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBjb250ZW50VHlwZSAtIHRoZSBzdXBwb3NlZCBjb250ZW50VHlwZVxuICAgKiBAZGlzY3Vzc2lvbiB0aGUgY29udGVudFR5cGUgY2FuIGJlIHVuZGVmaW5lZCBpZiB0aGUgY29udHJvbGxlciB3YXMgbm90IGFibGUgdG8gZGV0ZXJtaW5lIGl0XG4gICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIC0gKE9wdGlvbmFsKSBvcHRpb25zIHRvIGJlIHBhc3NlZCB0byBmaWxlIGFkYXB0ZXIgKFMzIEZpbGUgQWRhcHRlciBPbmx5KVxuICAgKiAtIHRhZ3M6IG9iamVjdCBjb250YWluaW5nIGtleSB2YWx1ZSBwYWlycyB0aGF0IHdpbGwgYmUgc3RvcmVkIHdpdGggZmlsZVxuICAgKiAtIG1ldGFkYXRhOiBvYmplY3QgY29udGFpbmluZyBrZXkgdmFsdWUgcGFpcnMgdGhhdCB3aWxsIGJlIHNvdHJlZCB3aXRoIGZpbGUgKGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9BbWF6b25TMy9sYXRlc3QvdXNlci1ndWlkZS9hZGQtb2JqZWN0LW1ldGFkYXRhLmh0bWwpXG4gICAqIEBkaXNjdXNzaW9uIG9wdGlvbnMgYXJlIG5vdCBzdXBwb3J0ZWQgYnkgYWxsIGZpbGUgYWRhcHRlcnMuIENoZWNrIHRoZSB5b3VyIGFkYXB0ZXIncyBkb2N1bWVudGF0aW9uIGZvciBjb21wYXRpYmlsaXR5XG4gICAqXG4gICAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHNob3VsZCBmYWlsIGlmIHRoZSBzdG9yYWdlIGRpZG4ndCBzdWNjZWVkXG4gICAqL1xuICBjcmVhdGVGaWxlKGZpbGVuYW1lOiBzdHJpbmcsIGRhdGEsIGNvbnRlbnRUeXBlOiBzdHJpbmcsIG9wdGlvbnM6IE9iamVjdCk6IFByb21pc2Uge31cblxuICAvKiogUmVzcG9uc2libGUgZm9yIGRlbGV0aW5nIHRoZSBzcGVjaWZpZWQgZmlsZVxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWUgLSB0aGUgZmlsZW5hbWUgdG8gZGVsZXRlXG4gICAqXG4gICAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHNob3VsZCBmYWlsIGlmIHRoZSBkZWxldGlvbiBkaWRuJ3Qgc3VjY2VlZFxuICAgKi9cbiAgZGVsZXRlRmlsZShmaWxlbmFtZTogc3RyaW5nKTogUHJvbWlzZSB7fVxuXG4gIC8qKiBSZXNwb25zaWJsZSBmb3IgcmV0cmlldmluZyB0aGUgZGF0YSBvZiB0aGUgc3BlY2lmaWVkIGZpbGVcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lIC0gdGhlIG5hbWUgb2YgZmlsZSB0byByZXRyaWV2ZVxuICAgKlxuICAgKiBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCBzaG91bGQgcGFzcyB3aXRoIHRoZSBmaWxlIGRhdGEgb3IgZmFpbCBvbiBlcnJvclxuICAgKi9cbiAgZ2V0RmlsZURhdGEoZmlsZW5hbWU6IHN0cmluZyk6IFByb21pc2U8YW55PiB7fVxuXG4gIC8qKiBSZXR1cm5zIGFuIGFic29sdXRlIFVSTCB3aGVyZSB0aGUgZmlsZSBjYW4gYmUgYWNjZXNzZWRcbiAgICpcbiAgICogQHBhcmFtIHtDb25maWd9IGNvbmZpZyAtIHNlcnZlciBjb25maWd1cmF0aW9uXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZVxuICAgKlxuICAgKiBAcmV0dXJuIHtzdHJpbmcgfCBQcm9taXNlPHN0cmluZz59IEFic29sdXRlIFVSTFxuICAgKi9cbiAgZ2V0RmlsZUxvY2F0aW9uKGNvbmZpZzogQ29uZmlnLCBmaWxlbmFtZTogc3RyaW5nKTogc3RyaW5nIHwgUHJvbWlzZTxzdHJpbmc+IHt9XG5cbiAgLyoqIFZhbGlkYXRlIGEgZmlsZW5hbWUgZm9yIHRoaXMgYWRhcHRlciB0eXBlXG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlbmFtZVxuICAgKlxuICAgKiBAcmV0dXJucyB7bnVsbHxQYXJzZS5FcnJvcn0gbnVsbCBpZiB0aGVyZSBhcmUgbm8gZXJyb3JzXG4gICAqL1xuICAvLyB2YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lOiBzdHJpbmcpOiA/UGFyc2UuRXJyb3Ige31cblxuICAvKiogSGFuZGxlcyBCeXRlLVJhbmdlIFJlcXVlc3RzIGZvciBTdHJlYW1pbmdcbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGZpbGVuYW1lXG4gICAqIEBwYXJhbSB7b2JqZWN0fSByZXFcbiAgICogQHBhcmFtIHtvYmplY3R9IHJlc1xuICAgKiBAcGFyYW0ge3N0cmluZ30gY29udGVudFR5cGVcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IERhdGEgZm9yIGJ5dGUgcmFuZ2VcbiAgICovXG4gIC8vIGhhbmRsZUZpbGVTdHJlYW0oZmlsZW5hbWU6IHN0cmluZywgcmVzOiBhbnksIHJlcTogYW55LCBjb250ZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZVxuXG4gIC8qKiBSZXNwb25zaWJsZSBmb3IgcmV0cmlldmluZyBtZXRhZGF0YSBhbmQgdGFnc1xuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZW5hbWUgLSB0aGUgZmlsZW5hbWUgdG8gcmV0cmlldmUgbWV0YWRhdGFcbiAgICpcbiAgICogQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgc2hvdWxkIHBhc3Mgd2l0aCBtZXRhZGF0YVxuICAgKi9cbiAgLy8gZ2V0TWV0YWRhdGEoZmlsZW5hbWU6IHN0cmluZyk6IFByb21pc2U8YW55PiB7fVxufVxuXG4vKipcbiAqIFNpbXBsZSBmaWxlbmFtZSB2YWxpZGF0aW9uXG4gKlxuICogQHBhcmFtIGZpbGVuYW1lXG4gKiBAcmV0dXJucyB7bnVsbHxQYXJzZS5FcnJvcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWUpOiA/UGFyc2UuRXJyb3Ige1xuICBpZiAoZmlsZW5hbWUubGVuZ3RoID4gMTI4KSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIHRvbyBsb25nLicpO1xuICB9XG5cbiAgY29uc3QgcmVneCA9IC9eW19hLXpBLVowLTldW2EtekEtWjAtOUAuIH5fLV0qJC87XG4gIGlmICghZmlsZW5hbWUubWF0Y2gocmVneCkpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLicpO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZGVmYXVsdCBGaWxlc0FkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFtQkEsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQStCLFNBQUFELHVCQUFBRSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBbkIvQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTUcsWUFBWSxDQUFDO0VBQ3hCO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VDLFVBQVVBLENBQUNDLFFBQWdCLEVBQUVDLElBQUksRUFBRUMsV0FBbUIsRUFBRUMsT0FBZSxFQUFXLENBQUM7O0VBRW5GO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxVQUFVQSxDQUFDSixRQUFnQixFQUFXLENBQUM7O0VBRXZDO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFSyxXQUFXQSxDQUFDTCxRQUFnQixFQUFnQixDQUFDOztFQUU3QztBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFTSxlQUFlQSxDQUFDQyxNQUFjLEVBQUVQLFFBQWdCLEVBQTRCLENBQUM7O0VBRTdFO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFO0FBQ0Y7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTEFRLE9BQUEsQ0FBQVYsWUFBQSxHQUFBQSxZQUFBO0FBTU8sU0FBU1csZ0JBQWdCQSxDQUFDVCxRQUFRLEVBQWdCO0VBQ3ZELElBQUlBLFFBQVEsQ0FBQ1UsTUFBTSxHQUFHLEdBQUcsRUFBRTtJQUN6QixPQUFPLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0MsaUJBQWlCLEVBQUUsb0JBQW9CLENBQUM7RUFDN0U7RUFFQSxNQUFNQyxJQUFJLEdBQUcsa0NBQWtDO0VBQy9DLElBQUksQ0FBQ2QsUUFBUSxDQUFDZSxLQUFLLENBQUNELElBQUksQ0FBQyxFQUFFO0lBQ3pCLE9BQU8sSUFBSUgsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxpQkFBaUIsRUFBRSx1Q0FBdUMsQ0FBQztFQUNoRztFQUNBLE9BQU8sSUFBSTtBQUNiO0FBQUMsSUFBQUcsUUFBQSxHQUFBUixPQUFBLENBQUFYLE9BQUEsR0FFY0MsWUFBWSIsImlnbm9yZUxpc3QiOltdfQ==