"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "S3Adapter", {
  enumerable: true,
  get: function () {
    return _s3FilesAdapter.default;
  }
});
Object.defineProperty(exports, "FileSystemAdapter", {
  enumerable: true,
  get: function () {
    return _fsFilesAdapter.default;
  }
});
Object.defineProperty(exports, "InMemoryCacheAdapter", {
  enumerable: true,
  get: function () {
    return _InMemoryCacheAdapter.default;
  }
});
Object.defineProperty(exports, "NullCacheAdapter", {
  enumerable: true,
  get: function () {
    return _NullCacheAdapter.default;
  }
});
Object.defineProperty(exports, "RedisCacheAdapter", {
  enumerable: true,
  get: function () {
    return _RedisCacheAdapter.default;
  }
});
Object.defineProperty(exports, "LRUCacheAdapter", {
  enumerable: true,
  get: function () {
    return _LRUCache.default;
  }
});
Object.defineProperty(exports, "PushWorker", {
  enumerable: true,
  get: function () {
    return _PushWorker.PushWorker;
  }
});
Object.defineProperty(exports, "ParseGraphQLServer", {
  enumerable: true,
  get: function () {
    return _ParseGraphQLServer.ParseGraphQLServer;
  }
});
exports.TestUtils = exports.ParseServer = exports.GCSAdapter = exports.default = void 0;

var _ParseServer2 = _interopRequireDefault(require("./ParseServer"));

var _s3FilesAdapter = _interopRequireDefault(require("@parse/s3-files-adapter"));

var _fsFilesAdapter = _interopRequireDefault(require("@parse/fs-files-adapter"));

var _InMemoryCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/InMemoryCacheAdapter"));

var _NullCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/NullCacheAdapter"));

var _RedisCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/RedisCacheAdapter"));

var _LRUCache = _interopRequireDefault(require("./Adapters/Cache/LRUCache.js"));

var TestUtils = _interopRequireWildcard(require("./TestUtils"));

exports.TestUtils = TestUtils;

var _deprecated = require("./deprecated");

var _logger = require("./logger");

var _PushWorker = require("./Push/PushWorker");

var _Options = require("./Options");

var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Factory function
const _ParseServer = function (options) {
  const server = new _ParseServer2.default(options);
  return server.app;
}; // Mount the create liveQueryServer


exports.ParseServer = _ParseServer;
_ParseServer.createLiveQueryServer = _ParseServer2.default.createLiveQueryServer;
_ParseServer.start = _ParseServer2.default.start;
const GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', '@parse/gcs-files-adapter');
exports.GCSAdapter = GCSAdapter;
Object.defineProperty(module.exports, 'logger', {
  get: _logger.getLogger
});
var _default = _ParseServer2.default;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIiLCJvcHRpb25zIiwic2VydmVyIiwiUGFyc2VTZXJ2ZXIiLCJhcHAiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJzdGFydCIsIkdDU0FkYXB0ZXIiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsIm1vZHVsZSIsImV4cG9ydHMiLCJnZXQiLCJnZXRMb2dnZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7QUFFQTtBQUNBLE1BQU1BLFlBQVksR0FBRyxVQUFTQyxPQUFULEVBQXNDO0FBQ3pELFFBQU1DLE1BQU0sR0FBRyxJQUFJQyxxQkFBSixDQUFnQkYsT0FBaEIsQ0FBZjtBQUNBLFNBQU9DLE1BQU0sQ0FBQ0UsR0FBZDtBQUNELENBSEQsQyxDQUlBOzs7O0FBQ0FKLFlBQVksQ0FBQ0sscUJBQWIsR0FBcUNGLHNCQUFZRSxxQkFBakQ7QUFDQUwsWUFBWSxDQUFDTSxLQUFiLEdBQXFCSCxzQkFBWUcsS0FBakM7QUFFQSxNQUFNQyxVQUFVLEdBQUcsNkJBQVksWUFBWixFQUEwQiwwQkFBMUIsQ0FBbkI7O0FBRUFDLE1BQU0sQ0FBQ0MsY0FBUCxDQUFzQkMsTUFBTSxDQUFDQyxPQUE3QixFQUFzQyxRQUF0QyxFQUFnRDtBQUM5Q0MsRUFBQUEsR0FBRyxFQUFFQztBQUR5QyxDQUFoRDtlQUllVixxQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZVNlcnZlciBmcm9tICcuL1BhcnNlU2VydmVyJztcbmltcG9ydCBTM0FkYXB0ZXIgZnJvbSAnQHBhcnNlL3MzLWZpbGVzLWFkYXB0ZXInO1xuaW1wb3J0IEZpbGVTeXN0ZW1BZGFwdGVyIGZyb20gJ0BwYXJzZS9mcy1maWxlcy1hZGFwdGVyJztcbmltcG9ydCBJbk1lbW9yeUNhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL0luTWVtb3J5Q2FjaGVBZGFwdGVyJztcbmltcG9ydCBOdWxsQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvTnVsbENhY2hlQWRhcHRlcic7XG5pbXBvcnQgUmVkaXNDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9SZWRpc0NhY2hlQWRhcHRlcic7XG5pbXBvcnQgTFJVQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvTFJVQ2FjaGUuanMnO1xuaW1wb3J0ICogYXMgVGVzdFV0aWxzIGZyb20gJy4vVGVzdFV0aWxzJztcbmltcG9ydCB7IHVzZUV4dGVybmFsIH0gZnJvbSAnLi9kZXByZWNhdGVkJztcbmltcG9ydCB7IGdldExvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCB7IFB1c2hXb3JrZXIgfSBmcm9tICcuL1B1c2gvUHVzaFdvcmtlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuL09wdGlvbnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5cbi8vIEZhY3RvcnkgZnVuY3Rpb25cbmNvbnN0IF9QYXJzZVNlcnZlciA9IGZ1bmN0aW9uKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBjb25zdCBzZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gIHJldHVybiBzZXJ2ZXIuYXBwO1xufTtcbi8vIE1vdW50IHRoZSBjcmVhdGUgbGl2ZVF1ZXJ5U2VydmVyXG5fUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyID0gUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyO1xuX1BhcnNlU2VydmVyLnN0YXJ0ID0gUGFyc2VTZXJ2ZXIuc3RhcnQ7XG5cbmNvbnN0IEdDU0FkYXB0ZXIgPSB1c2VFeHRlcm5hbCgnR0NTQWRhcHRlcicsICdAcGFyc2UvZ2NzLWZpbGVzLWFkYXB0ZXInKTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KG1vZHVsZS5leHBvcnRzLCAnbG9nZ2VyJywge1xuICBnZXQ6IGdldExvZ2dlcixcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlcjtcbmV4cG9ydCB7XG4gIFMzQWRhcHRlcixcbiAgR0NTQWRhcHRlcixcbiAgRmlsZVN5c3RlbUFkYXB0ZXIsXG4gIEluTWVtb3J5Q2FjaGVBZGFwdGVyLFxuICBOdWxsQ2FjaGVBZGFwdGVyLFxuICBSZWRpc0NhY2hlQWRhcHRlcixcbiAgTFJVQ2FjaGVBZGFwdGVyLFxuICBUZXN0VXRpbHMsXG4gIFB1c2hXb3JrZXIsXG4gIFBhcnNlR3JhcGhRTFNlcnZlcixcbiAgX1BhcnNlU2VydmVyIGFzIFBhcnNlU2VydmVyLFxufTtcbiJdfQ==