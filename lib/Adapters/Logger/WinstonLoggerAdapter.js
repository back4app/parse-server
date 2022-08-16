"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.WinstonLoggerAdapter = void 0;

var _LoggerAdapter = require("./LoggerAdapter");

var _WinstonLogger = require("./WinstonLogger");

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

class WinstonLoggerAdapter extends _LoggerAdapter.LoggerAdapter {
  constructor(options) {
    super();

    if (options) {
      (0, _WinstonLogger.configureLogger)(options);
    }
  }

  log() {
    return _WinstonLogger.logger.log.apply(_WinstonLogger.logger, arguments);
  }

  addTransport(transport) {
    // Note that this is calling addTransport
    // from logger.  See import - confusing.
    // but this is not recursive.
    (0, _WinstonLogger.addTransport)(transport);
  } // custom query as winston is currently limited


  query(options, callback = () => {}) {
    if (!options) {
      options = {};
    } // defaults to 7 days prior


    const from = options.from || new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
    const until = options.until || new Date();
    const limit = options.size || 10;
    const order = options.order || 'desc';
    const level = options.level || 'info';
    const queryOptions = {
      from,
      until,
      limit,
      order
    };
    return new Promise((resolve, reject) => {
      _WinstonLogger.logger.query(queryOptions, (err, res) => {
        if (err) {
          callback(err);
          return reject(err);
        }

        if (level === 'error') {
          callback(res['parse-server-error']);
          resolve(res['parse-server-error']);
        } else {
          callback(res['parse-server']);
          resolve(res['parse-server']);
        }
      });
    });
  }

}

exports.WinstonLoggerAdapter = WinstonLoggerAdapter;
var _default = WinstonLoggerAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJNSUxMSVNFQ09ORFNfSU5fQV9EQVkiLCJXaW5zdG9uTG9nZ2VyQWRhcHRlciIsIkxvZ2dlckFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJjb25maWd1cmVMb2dnZXIiLCJsb2ciLCJsb2dnZXIiLCJhcHBseSIsImFyZ3VtZW50cyIsImFkZFRyYW5zcG9ydCIsInRyYW5zcG9ydCIsInF1ZXJ5IiwiY2FsbGJhY2siLCJmcm9tIiwiRGF0ZSIsIm5vdyIsInVudGlsIiwibGltaXQiLCJzaXplIiwib3JkZXIiLCJsZXZlbCIsInF1ZXJ5T3B0aW9ucyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZXJyIiwicmVzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0xvZ2dlci9XaW5zdG9uTG9nZ2VyQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBMb2dnZXJBZGFwdGVyIH0gZnJvbSAnLi9Mb2dnZXJBZGFwdGVyJztcbmltcG9ydCB7IGxvZ2dlciwgYWRkVHJhbnNwb3J0LCBjb25maWd1cmVMb2dnZXIgfSBmcm9tICcuL1dpbnN0b25Mb2dnZXInO1xuXG5jb25zdCBNSUxMSVNFQ09ORFNfSU5fQV9EQVkgPSAyNCAqIDYwICogNjAgKiAxMDAwO1xuXG5leHBvcnQgY2xhc3MgV2luc3RvbkxvZ2dlckFkYXB0ZXIgZXh0ZW5kcyBMb2dnZXJBZGFwdGVyIHtcbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIHN1cGVyKCk7XG4gICAgaWYgKG9wdGlvbnMpIHtcbiAgICAgIGNvbmZpZ3VyZUxvZ2dlcihvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICBsb2coKSB7XG4gICAgcmV0dXJuIGxvZ2dlci5sb2cuYXBwbHkobG9nZ2VyLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgYWRkVHJhbnNwb3J0KHRyYW5zcG9ydCkge1xuICAgIC8vIE5vdGUgdGhhdCB0aGlzIGlzIGNhbGxpbmcgYWRkVHJhbnNwb3J0XG4gICAgLy8gZnJvbSBsb2dnZXIuICBTZWUgaW1wb3J0IC0gY29uZnVzaW5nLlxuICAgIC8vIGJ1dCB0aGlzIGlzIG5vdCByZWN1cnNpdmUuXG4gICAgYWRkVHJhbnNwb3J0KHRyYW5zcG9ydCk7XG4gIH1cblxuICAvLyBjdXN0b20gcXVlcnkgYXMgd2luc3RvbiBpcyBjdXJyZW50bHkgbGltaXRlZFxuICBxdWVyeShvcHRpb25zLCBjYWxsYmFjayA9ICgpID0+IHt9KSB7XG4gICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICBvcHRpb25zID0ge307XG4gICAgfVxuICAgIC8vIGRlZmF1bHRzIHRvIDcgZGF5cyBwcmlvclxuICAgIGNvbnN0IGZyb20gPSBvcHRpb25zLmZyb20gfHwgbmV3IERhdGUoRGF0ZS5ub3coKSAtIDcgKiBNSUxMSVNFQ09ORFNfSU5fQV9EQVkpO1xuICAgIGNvbnN0IHVudGlsID0gb3B0aW9ucy51bnRpbCB8fCBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IGxpbWl0ID0gb3B0aW9ucy5zaXplIHx8IDEwO1xuICAgIGNvbnN0IG9yZGVyID0gb3B0aW9ucy5vcmRlciB8fCAnZGVzYyc7XG4gICAgY29uc3QgbGV2ZWwgPSBvcHRpb25zLmxldmVsIHx8ICdpbmZvJztcblxuICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgIGZyb20sXG4gICAgICB1bnRpbCxcbiAgICAgIGxpbWl0LFxuICAgICAgb3JkZXIsXG4gICAgfTtcblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBsb2dnZXIucXVlcnkocXVlcnlPcHRpb25zLCAoZXJyLCByZXMpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGxldmVsID09PSAnZXJyb3InKSB7XG4gICAgICAgICAgY2FsbGJhY2socmVzWydwYXJzZS1zZXJ2ZXItZXJyb3InXSk7XG4gICAgICAgICAgcmVzb2x2ZShyZXNbJ3BhcnNlLXNlcnZlci1lcnJvciddKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYWxsYmFjayhyZXNbJ3BhcnNlLXNlcnZlciddKTtcbiAgICAgICAgICByZXNvbHZlKHJlc1sncGFyc2Utc2VydmVyJ10pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBXaW5zdG9uTG9nZ2VyQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUVBLE1BQU1BLHFCQUFxQixHQUFHLEtBQUssRUFBTCxHQUFVLEVBQVYsR0FBZSxJQUE3Qzs7QUFFTyxNQUFNQyxvQkFBTixTQUFtQ0MsNEJBQW5DLENBQWlEO0VBQ3REQyxXQUFXLENBQUNDLE9BQUQsRUFBVTtJQUNuQjs7SUFDQSxJQUFJQSxPQUFKLEVBQWE7TUFDWCxJQUFBQyw4QkFBQSxFQUFnQkQsT0FBaEI7SUFDRDtFQUNGOztFQUVERSxHQUFHLEdBQUc7SUFDSixPQUFPQyxxQkFBQSxDQUFPRCxHQUFQLENBQVdFLEtBQVgsQ0FBaUJELHFCQUFqQixFQUF5QkUsU0FBekIsQ0FBUDtFQUNEOztFQUVEQyxZQUFZLENBQUNDLFNBQUQsRUFBWTtJQUN0QjtJQUNBO0lBQ0E7SUFDQSxJQUFBRCwyQkFBQSxFQUFhQyxTQUFiO0VBQ0QsQ0FqQnFELENBbUJ0RDs7O0VBQ0FDLEtBQUssQ0FBQ1IsT0FBRCxFQUFVUyxRQUFRLEdBQUcsTUFBTSxDQUFFLENBQTdCLEVBQStCO0lBQ2xDLElBQUksQ0FBQ1QsT0FBTCxFQUFjO01BQ1pBLE9BQU8sR0FBRyxFQUFWO0lBQ0QsQ0FIaUMsQ0FJbEM7OztJQUNBLE1BQU1VLElBQUksR0FBR1YsT0FBTyxDQUFDVSxJQUFSLElBQWdCLElBQUlDLElBQUosQ0FBU0EsSUFBSSxDQUFDQyxHQUFMLEtBQWEsSUFBSWhCLHFCQUExQixDQUE3QjtJQUNBLE1BQU1pQixLQUFLLEdBQUdiLE9BQU8sQ0FBQ2EsS0FBUixJQUFpQixJQUFJRixJQUFKLEVBQS9CO0lBQ0EsTUFBTUcsS0FBSyxHQUFHZCxPQUFPLENBQUNlLElBQVIsSUFBZ0IsRUFBOUI7SUFDQSxNQUFNQyxLQUFLLEdBQUdoQixPQUFPLENBQUNnQixLQUFSLElBQWlCLE1BQS9CO0lBQ0EsTUFBTUMsS0FBSyxHQUFHakIsT0FBTyxDQUFDaUIsS0FBUixJQUFpQixNQUEvQjtJQUVBLE1BQU1DLFlBQVksR0FBRztNQUNuQlIsSUFEbUI7TUFFbkJHLEtBRm1CO01BR25CQyxLQUhtQjtNQUluQkU7SUFKbUIsQ0FBckI7SUFPQSxPQUFPLElBQUlHLE9BQUosQ0FBWSxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7TUFDdENsQixxQkFBQSxDQUFPSyxLQUFQLENBQWFVLFlBQWIsRUFBMkIsQ0FBQ0ksR0FBRCxFQUFNQyxHQUFOLEtBQWM7UUFDdkMsSUFBSUQsR0FBSixFQUFTO1VBQ1BiLFFBQVEsQ0FBQ2EsR0FBRCxDQUFSO1VBQ0EsT0FBT0QsTUFBTSxDQUFDQyxHQUFELENBQWI7UUFDRDs7UUFFRCxJQUFJTCxLQUFLLEtBQUssT0FBZCxFQUF1QjtVQUNyQlIsUUFBUSxDQUFDYyxHQUFHLENBQUMsb0JBQUQsQ0FBSixDQUFSO1VBQ0FILE9BQU8sQ0FBQ0csR0FBRyxDQUFDLG9CQUFELENBQUosQ0FBUDtRQUNELENBSEQsTUFHTztVQUNMZCxRQUFRLENBQUNjLEdBQUcsQ0FBQyxjQUFELENBQUosQ0FBUjtVQUNBSCxPQUFPLENBQUNHLEdBQUcsQ0FBQyxjQUFELENBQUosQ0FBUDtRQUNEO01BQ0YsQ0FiRDtJQWNELENBZk0sQ0FBUDtFQWdCRDs7QUF0RHFEOzs7ZUF5RHpDMUIsb0IifQ==