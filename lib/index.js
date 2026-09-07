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
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfZnNGaWxlc0FkYXB0ZXIiLCJfSW5NZW1vcnlDYWNoZUFkYXB0ZXIiLCJfTnVsbENhY2hlQWRhcHRlciIsIl9SZWRpc0NhY2hlQWRhcHRlciIsIl9MUlVDYWNoZSIsIlRlc3RVdGlscyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiZXhwb3J0cyIsIlNjaGVtYU1pZ3JhdGlvbnMiLCJfQXV0aEFkYXB0ZXIiLCJfZGVwcmVjYXRlZCIsIl9sb2dnZXIiLCJfUHVzaFdvcmtlciIsIl9QYXJzZUdyYXBoUUxTZXJ2ZXIiLCJlIiwidCIsIldlYWtNYXAiLCJyIiwibiIsIl9fZXNNb2R1bGUiLCJvIiwiaSIsImYiLCJfX3Byb3RvX18iLCJkZWZhdWx0IiwiaGFzIiwiZ2V0Iiwic2V0IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJfUGFyc2VTZXJ2ZXIiLCJvcHRpb25zIiwic2VydmVyIiwiUGFyc2VTZXJ2ZXIiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJzdGFydEFwcCIsIlMzQWRhcHRlciIsInVzZUV4dGVybmFsIiwiR0NTQWRhcHRlciIsIm1vZHVsZSIsImdldExvZ2dlciIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vc3JjL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZVNlcnZlciBmcm9tICcuL1BhcnNlU2VydmVyJztcbmltcG9ydCBGaWxlU3lzdGVtQWRhcHRlciBmcm9tICdAcGFyc2UvZnMtZmlsZXMtYWRhcHRlcic7XG5pbXBvcnQgSW5NZW1vcnlDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9Jbk1lbW9yeUNhY2hlQWRhcHRlcic7XG5pbXBvcnQgTnVsbENhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL051bGxDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IFJlZGlzQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvUmVkaXNDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IExSVUNhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL0xSVUNhY2hlLmpzJztcbmltcG9ydCAqIGFzIFRlc3RVdGlscyBmcm9tICcuL1Rlc3RVdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFNaWdyYXRpb25zIGZyb20gJy4vU2NoZW1hTWlncmF0aW9ucy9NaWdyYXRpb25zJztcbmltcG9ydCBBdXRoQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0F1dGgvQXV0aEFkYXB0ZXInO1xuaW1wb3J0IHsgdXNlRXh0ZXJuYWwgfSBmcm9tICcuL2RlcHJlY2F0ZWQnO1xuaW1wb3J0IHsgZ2V0TG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHsgUHVzaFdvcmtlciB9IGZyb20gJy4vUHVzaC9QdXNoV29ya2VyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcblxuLy8gRmFjdG9yeSBmdW5jdGlvblxuY29uc3QgX1BhcnNlU2VydmVyID0gZnVuY3Rpb24gKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBjb25zdCBzZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gIHJldHVybiBzZXJ2ZXI7XG59O1xuLy8gTW91bnQgdGhlIGNyZWF0ZSBsaXZlUXVlcnlTZXJ2ZXJcbl9QYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIgPSBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXI7XG5fUGFyc2VTZXJ2ZXIuc3RhcnRBcHAgPSBQYXJzZVNlcnZlci5zdGFydEFwcDtcblxuY29uc3QgUzNBZGFwdGVyID0gdXNlRXh0ZXJuYWwoJ1MzQWRhcHRlcicsICdAcGFyc2UvczMtZmlsZXMtYWRhcHRlcicpO1xuY29uc3QgR0NTQWRhcHRlciA9IHVzZUV4dGVybmFsKCdHQ1NBZGFwdGVyJywgJ0BwYXJzZS9nY3MtZmlsZXMtYWRhcHRlcicpO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkobW9kdWxlLmV4cG9ydHMsICdsb2dnZXInLCB7XG4gIGdldDogZ2V0TG9nZ2VyLFxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuZXhwb3J0IHtcbiAgUzNBZGFwdGVyLFxuICBHQ1NBZGFwdGVyLFxuICBGaWxlU3lzdGVtQWRhcHRlcixcbiAgSW5NZW1vcnlDYWNoZUFkYXB0ZXIsXG4gIE51bGxDYWNoZUFkYXB0ZXIsXG4gIFJlZGlzQ2FjaGVBZGFwdGVyLFxuICBMUlVDYWNoZUFkYXB0ZXIsXG4gIFRlc3RVdGlscyxcbiAgUHVzaFdvcmtlcixcbiAgUGFyc2VHcmFwaFFMU2VydmVyLFxuICBfUGFyc2VTZXJ2ZXIgYXMgUGFyc2VTZXJ2ZXIsXG4gIFNjaGVtYU1pZ3JhdGlvbnMsXG4gIEF1dGhBZGFwdGVyLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxhQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxlQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxxQkFBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUcsaUJBQUEsR0FBQUosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFJLGtCQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxTQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxTQUFBLEdBQUFDLHVCQUFBLENBQUFQLE9BQUE7QUFBeUNRLE9BQUEsQ0FBQUYsU0FBQSxHQUFBQSxTQUFBO0FBQ3pDLElB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