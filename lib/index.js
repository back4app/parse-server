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
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// Factory function
const _ParseServer = function (options) {
  const server = new _ParseServer2.default(options);
  return server;
};
// Mount the create liveQueryServer
exports.ParseServer = _ParseServer;
_ParseServer.createLiveQueryServer = _ParseServer2.default.createLiveQueryServer;
_ParseServer.startApp = _ParseServer2.default.startApp;
const S3Adapter = exports.S3Adapter = (0, _deprecated.useExternal)('S3Adapter', '@parse/s3-files-adapter');
const GCSAdapter = exports.GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', '@parse/gcs-files-adapter');
Object.defineProperty(module.exports, 'logger', {
  get: _logger.getLogger
});
var _default = exports.default = _ParseServer2.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfZnNGaWxlc0FkYXB0ZXIiLCJfSW5NZW1vcnlDYWNoZUFkYXB0ZXIiLCJfTnVsbENhY2hlQWRhcHRlciIsIl9SZWRpc0NhY2hlQWRhcHRlciIsIl9MUlVDYWNoZSIsIlRlc3RVdGlscyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiZXhwb3J0cyIsIlNjaGVtYU1pZ3JhdGlvbnMiLCJfQXV0aEFkYXB0ZXIiLCJfZGVwcmVjYXRlZCIsIl9sb2dnZXIiLCJfUHVzaFdvcmtlciIsIl9PcHRpb25zIiwiX1BhcnNlR3JhcGhRTFNlcnZlciIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIl9QYXJzZVNlcnZlciIsIm9wdGlvbnMiLCJzZXJ2ZXIiLCJQYXJzZVNlcnZlciIsImNyZWF0ZUxpdmVRdWVyeVNlcnZlciIsInN0YXJ0QXBwIiwiUzNBZGFwdGVyIiwidXNlRXh0ZXJuYWwiLCJHQ1NBZGFwdGVyIiwibW9kdWxlIiwiZ2V0TG9nZ2VyIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi9zcmMvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlU2VydmVyIGZyb20gJy4vUGFyc2VTZXJ2ZXInO1xuaW1wb3J0IEZpbGVTeXN0ZW1BZGFwdGVyIGZyb20gJ0BwYXJzZS9mcy1maWxlcy1hZGFwdGVyJztcbmltcG9ydCBJbk1lbW9yeUNhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL0luTWVtb3J5Q2FjaGVBZGFwdGVyJztcbmltcG9ydCBOdWxsQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvTnVsbENhY2hlQWRhcHRlcic7XG5pbXBvcnQgUmVkaXNDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9SZWRpc0NhY2hlQWRhcHRlcic7XG5pbXBvcnQgTFJVQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvTFJVQ2FjaGUuanMnO1xuaW1wb3J0ICogYXMgVGVzdFV0aWxzIGZyb20gJy4vVGVzdFV0aWxzJztcbmltcG9ydCAqIGFzIFNjaGVtYU1pZ3JhdGlvbnMgZnJvbSAnLi9TY2hlbWFNaWdyYXRpb25zL01pZ3JhdGlvbnMnO1xuaW1wb3J0IEF1dGhBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQXV0aC9BdXRoQWRhcHRlcic7XG5pbXBvcnQgeyB1c2VFeHRlcm5hbCB9IGZyb20gJy4vZGVwcmVjYXRlZCc7XG5pbXBvcnQgeyBnZXRMb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBQdXNoV29ya2VyIH0gZnJvbSAnLi9QdXNoL1B1c2hXb3JrZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuXG4vLyBGYWN0b3J5IGZ1bmN0aW9uXG5jb25zdCBfUGFyc2VTZXJ2ZXIgPSBmdW5jdGlvbiAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgcmV0dXJuIHNlcnZlcjtcbn07XG4vLyBNb3VudCB0aGUgY3JlYXRlIGxpdmVRdWVyeVNlcnZlclxuX1BhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlciA9IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcjtcbl9QYXJzZVNlcnZlci5zdGFydEFwcCA9IFBhcnNlU2VydmVyLnN0YXJ0QXBwO1xuXG5jb25zdCBTM0FkYXB0ZXIgPSB1c2VFeHRlcm5hbCgnUzNBZGFwdGVyJywgJ0BwYXJzZS9zMy1maWxlcy1hZGFwdGVyJyk7XG5jb25zdCBHQ1NBZGFwdGVyID0gdXNlRXh0ZXJuYWwoJ0dDU0FkYXB0ZXInLCAnQHBhcnNlL2djcy1maWxlcy1hZGFwdGVyJyk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShtb2R1bGUuZXhwb3J0cywgJ2xvZ2dlcicsIHtcbiAgZ2V0OiBnZXRMb2dnZXIsXG59KTtcblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXI7XG5leHBvcnQge1xuICBTM0FkYXB0ZXIsXG4gIEdDU0FkYXB0ZXIsXG4gIEZpbGVTeXN0ZW1BZGFwdGVyLFxuICBJbk1lbW9yeUNhY2hlQWRhcHRlcixcbiAgTnVsbENhY2hlQWRhcHRlcixcbiAgUmVkaXNDYWNoZUFkYXB0ZXIsXG4gIExSVUNhY2hlQWRhcHRlcixcbiAgVGVzdFV0aWxzLFxuICBQdXNoV29ya2VyLFxuICBQYXJzZUdyYXBoUUxTZXJ2ZXIsXG4gIF9QYXJzZVNlcnZlciBhcyBQYXJzZVNlcnZlcixcbiAgU2NoZW1hTWlncmF0aW9ucyxcbiAgQXV0aEFkYXB0ZXIsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLElBQUFBLGFBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLGVBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLHFCQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxpQkFBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksa0JBQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLFNBQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLFNBQUEsR0FBQUMsdUJBQUEsQ0FBQVAsT0FBQTtBQUF5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