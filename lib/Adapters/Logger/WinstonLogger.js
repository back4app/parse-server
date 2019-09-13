"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.configureLogger = configureLogger;
exports.addTransport = addTransport;
exports.removeTransport = removeTransport;
exports.default = exports.logger = void 0;

var _winston = _interopRequireWildcard(require("winston"));

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _winstonDailyRotateFile = _interopRequireDefault(require("winston-daily-rotate-file"));

var _lodash = _interopRequireDefault(require("lodash"));

var _defaults = _interopRequireDefault(require("../../defaults"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const logger = _winston.default.createLogger();

exports.logger = logger;

function configureTransports(options) {
  const transports = [];

  if (options) {
    const silent = options.silent;
    delete options.silent;

    if (!_lodash.default.isNil(options.dirname)) {
      const parseServer = new _winstonDailyRotateFile.default(Object.assign({
        filename: 'parse-server.info',
        json: true,
        format: _winston.format.combine(_winston.format.timestamp(), _winston.format.splat(), _winston.format.json())
      }, options));
      parseServer.name = 'parse-server';
      transports.push(parseServer);
      const parseServerError = new _winstonDailyRotateFile.default(Object.assign({
        filename: 'parse-server.err',
        json: true,
        format: _winston.format.combine(_winston.format.timestamp(), _winston.format.splat(), _winston.format.json())
      }, options, {
        level: 'error'
      }));
      parseServerError.name = 'parse-server-error';
      transports.push(parseServerError);
    }

    const consoleFormat = options.json ? _winston.format.json() : _winston.format.simple();
    const consoleOptions = Object.assign({
      colorize: true,
      name: 'console',
      silent,
      format: consoleFormat
    }, options);
    transports.push(new _winston.default.transports.Console(consoleOptions));
  }

  logger.configure({
    transports
  });
}

function configureLogger({
  logsFolder = _defaults.default.logsFolder,
  jsonLogs = _defaults.default.jsonLogs,
  logLevel = _winston.default.level,
  verbose = _defaults.default.verbose,
  silent = _defaults.default.silent
} = {}) {
  if (verbose) {
    logLevel = 'verbose';
  }

  _winston.default.level = logLevel;
  const options = {};

  if (logsFolder) {
    if (!_path.default.isAbsolute(logsFolder)) {
      logsFolder = _path.default.resolve(process.cwd(), logsFolder);
    }

    try {
      _fs.default.mkdirSync(logsFolder);
    } catch (e) {
      /* */
    }
  }

  options.dirname = logsFolder;
  options.level = logLevel;
  options.silent = silent;

  if (jsonLogs) {
    options.json = true;
    options.stringify = true;
  }

  configureTransports(options);
}

function addTransport(transport) {
  // we will remove the existing transport
  // before replacing it with a new one
  removeTransport(transport.name);
  logger.add(transport);
}

function removeTransport(transport) {
  const matchingTransport = logger.transports.find(t1 => {
    return typeof transport === 'string' ? t1.name === transport : t1 === transport;
  });

  if (matchingTransport) {
    logger.remove(matchingTransport);
  }
}

var _default = logger;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvV2luc3RvbkxvZ2dlci5qcyJdLCJuYW1lcyI6WyJsb2dnZXIiLCJ3aW5zdG9uIiwiY3JlYXRlTG9nZ2VyIiwiY29uZmlndXJlVHJhbnNwb3J0cyIsIm9wdGlvbnMiLCJ0cmFuc3BvcnRzIiwic2lsZW50IiwiXyIsImlzTmlsIiwiZGlybmFtZSIsInBhcnNlU2VydmVyIiwiRGFpbHlSb3RhdGVGaWxlIiwiT2JqZWN0IiwiYXNzaWduIiwiZmlsZW5hbWUiLCJqc29uIiwiZm9ybWF0IiwiY29tYmluZSIsInRpbWVzdGFtcCIsInNwbGF0IiwibmFtZSIsInB1c2giLCJwYXJzZVNlcnZlckVycm9yIiwibGV2ZWwiLCJjb25zb2xlRm9ybWF0Iiwic2ltcGxlIiwiY29uc29sZU9wdGlvbnMiLCJjb2xvcml6ZSIsIkNvbnNvbGUiLCJjb25maWd1cmUiLCJjb25maWd1cmVMb2dnZXIiLCJsb2dzRm9sZGVyIiwiZGVmYXVsdHMiLCJqc29uTG9ncyIsImxvZ0xldmVsIiwidmVyYm9zZSIsInBhdGgiLCJpc0Fic29sdXRlIiwicmVzb2x2ZSIsInByb2Nlc3MiLCJjd2QiLCJmcyIsIm1rZGlyU3luYyIsImUiLCJzdHJpbmdpZnkiLCJhZGRUcmFuc3BvcnQiLCJ0cmFuc3BvcnQiLCJyZW1vdmVUcmFuc3BvcnQiLCJhZGQiLCJtYXRjaGluZ1RyYW5zcG9ydCIsImZpbmQiLCJ0MSIsInJlbW92ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLE1BQU0sR0FBR0MsaUJBQVFDLFlBQVIsRUFBZjs7OztBQUVBLFNBQVNDLG1CQUFULENBQTZCQyxPQUE3QixFQUFzQztBQUNwQyxRQUFNQyxVQUFVLEdBQUcsRUFBbkI7O0FBQ0EsTUFBSUQsT0FBSixFQUFhO0FBQ1gsVUFBTUUsTUFBTSxHQUFHRixPQUFPLENBQUNFLE1BQXZCO0FBQ0EsV0FB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QUFDRjs7QUFDRHZDLEVBQUFBLE9BQU8sQ0FBQ0ssT0FBUixHQUFrQnNCLFVBQWxCO0FBQ0EzQixFQUFBQSxPQUFPLENBQUNtQixLQUFSLEdBQWdCVyxRQUFoQjtBQUNBOUIsRUFBQUEsT0FBTyxDQUFDRSxNQUFSLEdBQWlCQSxNQUFqQjs7QUFFQSxNQUFJMkIsUUFBSixFQUFjO0FBQ1o3QixJQUFBQSxPQUFPLENBQUNXLElBQVIsR0FBZSxJQUFmO0FBQ0FYLElBQUFBLE9BQU8sQ0FBQ3dDLFNBQVIsR0FBb0IsSUFBcEI7QUFDRDs7QUFDRHpDLEVBQUFBLG1CQUFtQixDQUFDQyxPQUFELENBQW5CO0FBQ0Q7O0FBRU0sU0FBU3lDLFlBQVQsQ0FBc0JDLFNBQXRCLEVBQWlDO0FBQ3RDO0FBQ0E7QUFDQUMsRUFBQUEsZUFBZSxDQUFDRCxTQUFTLENBQUMxQixJQUFYLENBQWY7QUFFQXBCLEVBQUFBLE1BQU0sQ0FBQ2dELEdBQVAsQ0FBV0YsU0FBWDtBQUNEOztBQUVNLFNBQVNDLGVBQVQsQ0FBeUJELFNBQXpCLEVBQW9DO0FBQ3pDLFFBQU1HLGlCQUFpQixHQUFHakQsTUFBTSxDQUFDSyxVQUFQLENBQWtCNkMsSUFBbEIsQ0FBdUJDLEVBQUUsSUFBSTtBQUNyRCxXQUFPLE9BQU9MLFNBQVAsS0FBcUIsUUFBckIsR0FDSEssRUFBRSxDQUFDL0IsSUFBSCxLQUFZMEIsU0FEVCxHQUVISyxFQUFFLEtBQUtMLFNBRlg7QUFHRCxHQUp5QixDQUExQjs7QUFNQSxNQUFJRyxpQkFBSixFQUF1QjtBQUNyQmpELElBQUFBLE1BQU0sQ0FBQ29ELE1BQVAsQ0FBY0gsaUJBQWQ7QUFDRDtBQUNGOztlQUdjakQsTSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB3aW5zdG9uLCB7IGZvcm1hdCB9IGZyb20gJ3dpbnN0b24nO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IERhaWx5Um90YXRlRmlsZSBmcm9tICd3aW5zdG9uLWRhaWx5LXJvdGF0ZS1maWxlJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuXG5jb25zdCBsb2dnZXIgPSB3aW5zdG9uLmNyZWF0ZUxvZ2dlcigpO1xuXG5mdW5jdGlvbiBjb25maWd1cmVUcmFuc3BvcnRzKG9wdGlvbnMpIHtcbiAgY29uc3QgdHJhbnNwb3J0cyA9IFtdO1xuICBpZiAob3B0aW9ucykge1xuICAgIGNvbnN0IHNpbGVudCA9IG9wdGlvbnMuc2lsZW50O1xuICAgIGRlbGV0ZSBvcHRpb25zLnNpbGVudDtcblxuICAgIGlmICghXy5pc05pbChvcHRpb25zLmRpcm5hbWUpKSB7XG4gICAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBEYWlseVJvdGF0ZUZpbGUoXG4gICAgICAgIE9iamVjdC5hc3NpZ24oXG4gICAgICAgICAge1xuICAgICAgICAgICAgZmlsZW5hbWU6ICdwYXJzZS1zZXJ2ZXIuaW5mbycsXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxuICAgICAgICAgICAgZm9ybWF0OiBmb3JtYXQuY29tYmluZShcbiAgICAgICAgICAgICAgZm9ybWF0LnRpbWVzdGFtcCgpLFxuICAgICAgICAgICAgICBmb3JtYXQuc3BsYXQoKSxcbiAgICAgICAgICAgICAgZm9ybWF0Lmpzb24oKVxuICAgICAgICAgICAgKSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9wdGlvbnNcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAgIHBhcnNlU2VydmVyLm5hbWUgPSAncGFyc2Utc2VydmVyJztcbiAgICAgIHRyYW5zcG9ydHMucHVzaChwYXJzZVNlcnZlcik7XG5cbiAgICAgIGNvbnN0IHBhcnNlU2VydmVyRXJyb3IgPSBuZXcgRGFpbHlSb3RhdGVGaWxlKFxuICAgICAgICBPYmplY3QuYXNzaWduKFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGZpbGVuYW1lOiAncGFyc2Utc2VydmVyLmVycicsXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxuICAgICAgICAgICAgZm9ybWF0OiBmb3JtYXQuY29tYmluZShcbiAgICAgICAgICAgICAgZm9ybWF0LnRpbWVzdGFtcCgpLFxuICAgICAgICAgICAgICBmb3JtYXQuc3BsYXQoKSxcbiAgICAgICAgICAgICAgZm9ybWF0Lmpzb24oKVxuICAgICAgICAgICAgKSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICAgeyBsZXZlbDogJ2Vycm9yJyB9XG4gICAgICAgIClcbiAgICAgICk7XG4gICAgICBwYXJzZVNlcnZlckVycm9yLm5hbWUgPSAncGFyc2Utc2VydmVyLWVycm9yJztcbiAgICAgIHRyYW5zcG9ydHMucHVzaChwYXJzZVNlcnZlckVycm9yKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb25zb2xlRm9ybWF0ID0gb3B0aW9ucy5qc29uID8gZm9ybWF0Lmpzb24oKSA6IGZvcm1hdC5zaW1wbGUoKTtcbiAgICBjb25zdCBjb25zb2xlT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oXG4gICAgICB7XG4gICAgICAgIGNvbG9yaXplOiB0cnVlLFxuICAgICAgICBuYW1lOiAnY29uc29sZScsXG4gICAgICAgIHNpbGVudCxcbiAgICAgICAgZm9ybWF0OiBjb25zb2xlRm9ybWF0LFxuICAgICAgfSxcbiAgICAgIG9wdGlvbnNcbiAgICApO1xuXG4gICAgdHJhbnNwb3J0cy5wdXNoKG5ldyB3aW5zdG9uLnRyYW5zcG9ydHMuQ29uc29sZShjb25zb2xlT3B0aW9ucykpO1xuICB9XG5cbiAgbG9nZ2VyLmNvbmZpZ3VyZSh7XG4gICAgdHJhbnNwb3J0cyxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25maWd1cmVMb2dnZXIoe1xuICBsb2dzRm9sZGVyID0gZGVmYXVsdHMubG9nc0ZvbGRlcixcbiAganNvbkxvZ3MgPSBkZWZhdWx0cy5qc29uTG9ncyxcbiAgbG9nTGV2ZWwgPSB3aW5zdG9uLmxldmVsLFxuICB2ZXJib3NlID0gZGVmYXVsdHMudmVyYm9zZSxcbiAgc2lsZW50ID0gZGVmYXVsdHMuc2lsZW50LFxufSA9IHt9KSB7XG4gIGlmICh2ZXJib3NlKSB7XG4gICAgbG9nTGV2ZWwgPSAndmVyYm9zZSc7XG4gIH1cblxuICB3aW5zdG9uLmxldmVsID0gbG9nTGV2ZWw7XG4gIGNvbnN0IG9wdGlvbnMgPSB7fTtcblxuICBpZiAobG9nc0ZvbGRlcikge1xuICAgIGlmICghcGF0aC5pc0Fic29sdXRlKGxvZ3NGb2xkZXIpKSB7XG4gICAgICBsb2dzRm9sZGVyID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGxvZ3NGb2xkZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgZnMubWtkaXJTeW5jKGxvZ3NGb2xkZXIpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIC8qICovXG4gICAgfVxuICB9XG4gIG9wdGlvbnMuZGlybmFtZSA9IGxvZ3NGb2xkZXI7XG4gIG9wdGlvbnMubGV2ZWwgPSBsb2dMZXZlbDtcbiAgb3B0aW9ucy5zaWxlbnQgPSBzaWxlbnQ7XG5cbiAgaWYgKGpzb25Mb2dzKSB7XG4gICAgb3B0aW9ucy5qc29uID0gdHJ1ZTtcbiAgICBvcHRpb25zLnN0cmluZ2lmeSA9IHRydWU7XG4gIH1cbiAgY29uZmlndXJlVHJhbnNwb3J0cyhvcHRpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyYW5zcG9ydCh0cmFuc3BvcnQpIHtcbiAgLy8gd2Ugd2lsbCByZW1vdmUgdGhlIGV4aXN0aW5nIHRyYW5zcG9ydFxuICAvLyBiZWZvcmUgcmVwbGFjaW5nIGl0IHdpdGggYSBuZXcgb25lXG4gIHJlbW92ZVRyYW5zcG9ydCh0cmFuc3BvcnQubmFtZSk7XG5cbiAgbG9nZ2VyLmFkZCh0cmFuc3BvcnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJhbnNwb3J0KHRyYW5zcG9ydCkge1xuICBjb25zdCBtYXRjaGluZ1RyYW5zcG9ydCA9IGxvZ2dlci50cmFuc3BvcnRzLmZpbmQodDEgPT4ge1xuICAgIHJldHVybiB0eXBlb2YgdHJhbnNwb3J0ID09PSAnc3RyaW5nJ1xuICAgICAgPyB0MS5uYW1lID09PSB0cmFuc3BvcnRcbiAgICAgIDogdDEgPT09IHRyYW5zcG9ydDtcbiAgfSk7XG5cbiAgaWYgKG1hdGNoaW5nVHJhbnNwb3J0KSB7XG4gICAgbG9nZ2VyLnJlbW92ZShtYXRjaGluZ1RyYW5zcG9ydCk7XG4gIH1cbn1cblxuZXhwb3J0IHsgbG9nZ2VyIH07XG5leHBvcnQgZGVmYXVsdCBsb2dnZXI7XG4iXX0=