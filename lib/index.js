"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "AuthAdapter", {
  enumerable: true,
  get: function () {
    return _AuthAdapter.default;
  }
});
Object.defineProperty(exports, "FileSystemAdapter", {
  enumerable: true,
  get: function () {
    return _fsFilesAdapter.default;
  }
});
exports.GCSAdapter = void 0;
Object.defineProperty(exports, "InMemoryCacheAdapter", {
  enumerable: true,
  get: function () {
    return _InMemoryCacheAdapter.default;
  }
});
Object.defineProperty(exports, "LRUCacheAdapter", {
  enumerable: true,
  get: function () {
    return _LRUCache.default;
  }
});
Object.defineProperty(exports, "NullCacheAdapter", {
  enumerable: true,
  get: function () {
    return _NullCacheAdapter.default;
  }
});
Object.defineProperty(exports, "ParseGraphQLServer", {
  enumerable: true,
  get: function () {
    return _ParseGraphQLServer.ParseGraphQLServer;
  }
});
exports.ParseServer = void 0;
Object.defineProperty(exports, "PushWorker", {
  enumerable: true,
  get: function () {
    return _PushWorker.PushWorker;
  }
});
Object.defineProperty(exports, "RedisCacheAdapter", {
  enumerable: true,
  get: function () {
    return _RedisCacheAdapter.default;
  }
});
exports.default = exports.TestUtils = exports.SchemaMigrations = exports.S3Adapter = void 0;
var _ParseServer2 = _interopRequireDefault(require("./ParseServer"));
var _fsFilesAdapter = _interopRequireDefault(require("@parse/fs-files-adapter"));
var _InMemoryCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/InMemoryCacheAdapter"));
var _NullCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/NullCacheAdapter"));
var _RedisCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/RedisCacheAdapter"));
var _LRUCache = _interopRequireDefault(require("./Adapters/Cache/LRUCache.js"));
var TestUtils = _interopRequireWildcard(require("./TestUtils"));
exports.TestUtils = TestUtils;
var SchemaMigrations = _interopRequireWildcard(require("./SchemaMigrations/Migrations"));
exports.SchemaMigrations = SchemaMigrations;
var _AuthAdapter = _interopRequireDefault(require("./Adapters/Auth/AuthAdapter"));
var _deprecated = require("./deprecated");
var _logger = require("./logger");
var _PushWorker = require("./Push/PushWorker");
var _Options = require("./Options");
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// Factory function
const _ParseServer = function (options) {
  const server = new _ParseServer2.default(options);
  return server;
};
// Mount the create liveQueryServer
exports.ParseServer = _ParseServer;
_ParseServer.createLiveQueryServer = _ParseServer2.default.createLiveQueryServer;
_ParseServer.startApp = _ParseServer2.default.startApp;
const S3Adapter = (0, _deprecated.useExternal)('S3Adapter', '@parse/s3-files-adapter');
exports.S3Adapter = S3Adapter;
const GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', '@parse/gcs-files-adapter');
exports.GCSAdapter = GCSAdapter;
Object.defineProperty(module.exports, 'logger', {
  get: _logger.getLogger
});
var _default = _ParseServer2.default;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfZnNGaWxlc0FkYXB0ZXIiLCJfSW5NZW1vcnlDYWNoZUFkYXB0ZXIiLCJfTnVsbENhY2hlQWRhcHRlciIsIl9SZWRpc0NhY2hlQWRhcHRlciIsIl9MUlVDYWNoZSIsIlRlc3RVdGlscyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiZXhwb3J0cyIsIlNjaGVtYU1pZ3JhdGlvbnMiLCJfQXV0aEFkYXB0ZXIiLCJfZGVwcmVjYXRlZCIsIl9sb2dnZXIiLCJfUHVzaFdvcmtlciIsIl9PcHRpb25zIiwiX1BhcnNlR3JhcGhRTFNlcnZlciIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJfUGFyc2VTZXJ2ZXIiLCJvcHRpb25zIiwic2VydmVyIiwiUGFyc2VTZXJ2ZXIiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJzdGFydEFwcCIsIlMzQWRhcHRlciIsInVzZUV4dGVybmFsIiwiR0NTQWRhcHRlciIsIm1vZHVsZSIsImdldExvZ2dlciIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vc3JjL2luZGV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZVNlcnZlciBmcm9tICcuL1BhcnNlU2VydmVyJztcbmltcG9ydCBGaWxlU3lzdGVtQWRhcHRlciBmcm9tICdAcGFyc2UvZnMtZmlsZXMtYWRhcHRlcic7XG5pbXBvcnQgSW5NZW1vcnlDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9Jbk1lbW9yeUNhY2hlQWRhcHRlcic7XG5pbXBvcnQgTnVsbENhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL051bGxDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IFJlZGlzQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvUmVkaXNDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IExSVUNhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL0xSVUNhY2hlLmpzJztcbmltcG9ydCAqIGFzIFRlc3RVdGlscyBmcm9tICcuL1Rlc3RVdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFNaWdyYXRpb25zIGZyb20gJy4vU2NoZW1hTWlncmF0aW9ucy9NaWdyYXRpb25zJztcbmltcG9ydCBBdXRoQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0F1dGgvQXV0aEFkYXB0ZXInO1xuXG5pbXBvcnQgeyB1c2VFeHRlcm5hbCB9IGZyb20gJy4vZGVwcmVjYXRlZCc7XG5pbXBvcnQgeyBnZXRMb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBQdXNoV29ya2VyIH0gZnJvbSAnLi9QdXNoL1B1c2hXb3JrZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuXG4vLyBGYWN0b3J5IGZ1bmN0aW9uXG5jb25zdCBfUGFyc2VTZXJ2ZXIgPSBmdW5jdGlvbiAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgcmV0dXJuIHNlcnZlcjtcbn07XG4vLyBNb3VudCB0aGUgY3JlYXRlIGxpdmVRdWVyeVNlcnZlclxuX1BhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlciA9IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcjtcbl9QYXJzZVNlcnZlci5zdGFydEFwcCA9IFBhcnNlU2VydmVyLnN0YXJ0QXBwO1xuXG5jb25zdCBTM0FkYXB0ZXIgPSB1c2VFeHRlcm5hbCgnUzNBZGFwdGVyJywgJ0BwYXJzZS9zMy1maWxlcy1hZGFwdGVyJyk7XG5jb25zdCBHQ1NBZGFwdGVyID0gdXNlRXh0ZXJuYWwoJ0dDU0FkYXB0ZXInLCAnQHBhcnNlL2djcy1maWxlcy1hZGFwdGVyJyk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShtb2R1bGUuZXhwb3J0cywgJ2xvZ2dlcicsIHtcbiAgZ2V0OiBnZXRMb2dnZXIsXG59KTtcblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXI7XG5leHBvcnQge1xuICBTM0FkYXB0ZXIsXG4gIEdDU0FkYXB0ZXIsXG4gIEZpbGVTeXN0ZW1BZGFwdGVyLFxuICBJbk1lbW9yeUNhY2hlQWRhcHRlcixcbiAgTnVsbENhY2hlQWRhcHRlcixcbiAgUmVkaXNDYWNoZUFkYXB0ZXIsXG4gIExSVUNhY2hlQWRhcHRlcixcbiAgVGVzdFV0aWxzLFxuICBQdXNoV29ya2VyLFxuICBQYXJzZUdyYXBoUUxTZXJ2ZXIsXG4gIF9QYXJzZVNlcnZlciBhcyBQYXJzZVNlcnZlcixcbiAgU2NoZW1hTWlncmF0aW9ucyxcbiAgQXV0aEFkYXB0ZXIsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLElBQUFBLGFBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLGVBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLHFCQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxpQkFBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksa0JBQUEsR0FBQUwsc0JBQUEsQ0FBQUMs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