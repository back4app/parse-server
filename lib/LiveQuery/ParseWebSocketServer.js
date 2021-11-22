"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseWebSocket = exports.ParseWebSocketServer = void 0;

var _AdapterLoader = require("../Adapters/AdapterLoader");

var _WSAdapter = require("../Adapters/WebSocketServer/WSAdapter");

var _logger = _interopRequireDefault(require("../logger"));

var _events = _interopRequireDefault(require("events"));

var _util = require("util");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseWebSocketServer {
  constructor(server, onConnect, config) {
    config.server = server;
    const wss = (0, _AdapterLoader.loadAdapter)(config.wssAdapter, _WSAdapter.WSAdapter, config);

    wss.onListen = () => {
      _logger.default.info('Parse LiveQuery Server starts running');
    };

    wss.onConnection = ws => {
      ws.on('error', error => {
        _logger.default.error(error.message);

        _logger.default.error((0, _util.inspect)(ws, false));
      });
      onConnect(new ParseWebSocket(ws)); // Send ping to client periodically

      const pingIntervalId = setInterval(() => {
        if (ws.readyState == ws.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingIntervalId);
        }
      }, config.websocketTimeout || 10 * 1000);
    };

    wss.onError = error => {
      _logger.default.error(error);
    };

    wss.start();
    this.server = wss;
  }

  close() {
    if (this.server && this.server.close) {
      this.server.close();
    }
  }

}

exports.ParseWebSocketServer = ParseWebSocketServer;

class ParseWebSocket extends _events.default.EventEmitter {
  constructor(ws) {
    super();

    ws.onmessage = request => this.emit('message', request && request.data ? request.data : request);

    ws.onclose = () => this.emit('disconnect');

    this.ws = ws;
  }

  send(message) {
    this.ws.send(message);
  }

}

exports.ParseWebSocket = ParseWebSocket;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VXZWJTb2NrZXRTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsIm9uQ29ubmVjdCIsImNvbmZpZyIsIndzcyIsIndzc0FkYXB0ZXIiLCJXU0FkYXB0ZXIiLCJvbkxpc3RlbiIsImxvZ2dlciIsImluZm8iLCJvbkNvbm5lY3Rpb24iLCJ3cyIsIm9uIiwiZXJyb3IiLCJtZXNzYWdlIiwiUGFyc2VXZWJTb2NrZXQiLCJwaW5nSW50ZXJ2YWxJZCIsInNldEludGVydmFsIiwicmVhZHlTdGF0ZSIsIk9QRU4iLCJwaW5nIiwiY2xlYXJJbnRlcnZhbCIsIndlYnNvY2tldFRpbWVvdXQiLCJvbkVycm9yIiwic3RhcnQiLCJjbG9zZSIsImV2ZW50cyIsIkV2ZW50RW1pdHRlciIsIm9ubWVzc2FnZSIsInJlcXVlc3QiLCJlbWl0IiwiZGF0YSIsIm9uY2xvc2UiLCJzZW5kIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFFTyxNQUFNQSxvQkFBTixDQUEyQjtBQUdoQ0MsRUFBQUEsV0FBVyxDQUFDQyxNQUFELEVBQWNDLFNBQWQsRUFBbUNDLE1BQW5DLEVBQTJDO0FBQ3BEQSxJQUFBQSxNQUFNLENBQUNGLE1BQVAsR0FBZ0JBLE1BQWhCO0FBQ0EsVUFBTUcsR0FBRyxHQUFHLGdDQUFZRCxNQUFNLENBQUNFLFVBQW5CLEVBQStCQyxvQkFBL0IsRUFBMENILE1BQTFDLENBQVo7O0FBQ0FDLElBQUFBLEdBQUcsQ0FBQ0csUUFBSixHQUFlLE1BQU07QUFDbkJDLHNCQUFPQyxJQUFQLENBQVksdUNBQVo7QUFDRCxLQUZEOztBQUdBTCxJQUFBQSxHQUFHLENBQUNNLFlBQUosR0FBbUJDLEVBQUUsSUFBSTtBQUN2QkEsTUFBQUEsRUFBRSxDQUFDQyxFQUFILENBQU0sT0FBTixFQUFlQyxLQUFLLElBQUk7QUFDdEJMLHdCQUFPSyxLQUFQLENBQWFBLEtBQUssQ0FBQ0MsT0FBbkI7O0FBQ0FOLHdCQUFPSyxLQUFQLENBQWEsbUJBQVFGLEVBQVIsRUFBWSxLQUFaLENBQWI7QUFDRCxPQUhEO0FBSUFULE1BQUFBLFNBQVMsQ0FBQyxJQUFJYSxjQUFKLENBQW1CSixFQUFuQixDQUFELENBQVQsQ0FMdUIsQ0FNdkI7O0FBQ0EsWUFBTUssY0FBYyxHQUFHQyxXQUFXLENBQUMsTUFBTTtBQUN2QyxZQUFJTixFQUFFLENBQUNPLFVBQUgsSUFBaUJQLEVBQUUsQ0FBQ1EsSUFBeEIsRUFBOEI7QUFDNUJSLFVBQUFBLEVBQUUsQ0FBQ1MsSUFBSDtBQUNELFNBRkQsTUFFTztBQUNMQyxVQUFBQSxhQUFhLENBQUNMLGNBQUQsQ0FBYjtBQUNEO0FBQ0YsT0FOaUMsRUFNL0JiLE1BQU0sQ0FBQ21CLGdCQUFQLElBQTJCLEtBQUssSUFORCxDQUFsQztBQU9ELEtBZEQ7O0FBZUFsQixJQUFBQSxHQUFHLENBQUNtQixPQUFKLEdBQWNWLEtBQUssSUFBSTtBQUNyQkwsc0JBQU9LLEtBQVAsQ0FBYUEsS0FBYjtBQUNELEtBRkQ7O0FBR0FULElBQUFBLEdBQUcsQ0FBQ29CLEtBQUo7QUFDQSxTQUFLdkIsTUFBTCxHQUFjRyxHQUFkO0FBQ0Q7O0FBRURxQixFQUFBQSxLQUFLLEdBQUc7QUFDTixRQUFJLEtBQUt4QixNQUFMLElBQWUsS0FBS0EsTUFBTCxDQUFZd0IsS0FBL0IsRUFBc0M7QUFDcEMsV0FBS3hCLE1BQUwsQ0FBWXdCLEtBQVo7QUFDRDtBQUNGOztBQW5DK0I7Ozs7QUFzQzNCLE1BQU1WLGNBQU4sU0FBNkJXLGdCQUFPQyxZQUFwQyxDQUFpRDtBQUd0RDNCLEVBQUFBLFdBQVcsQ0FBQ1csRUFBRCxFQUFVO0FBQ25COztBQUNBQSxJQUFBQSxFQUFFLENBQUNpQixTQUFILEdBQWVDLE9BQU8sSUFDcEIsS0FBS0MsSUFBTCxDQUFVLFNBQVYsRUFBcUJELE9BQU8sSUFBSUEsT0FBTyxDQUFDRSxJQUFuQixHQUEwQkYsT0FBTyxDQUFDRSxJQUFsQyxHQUF5Q0YsT0FBOUQsQ0FERjs7QUFFQWxCLElBQUFBLEVBQUUsQ0FBQ3FCLE9BQUgsR0FBYSxNQUFNLEtBQUtGLElBQUwsQ0FBVSxZQUFWLENBQW5COztBQUNBLFNBQUtuQixFQUFMLEdBQVVBLEVBQVY7QUFDRDs7QUFFRHNCLEVBQUFBLElBQUksQ0FBQ25CLE9BQUQsRUFBcUI7QUFDdkIsU0FBS0gsRUFBTCxDQUFRc0IsSUFBUixDQUFhbkIsT0FBYjtBQUNEOztBQWJxRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGxvYWRBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvQWRhcHRlckxvYWRlcic7XG5pbXBvcnQgeyBXU0FkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9XZWJTb2NrZXRTZXJ2ZXIvV1NBZGFwdGVyJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBldmVudHMgZnJvbSAnZXZlbnRzJztcbmltcG9ydCB7IGluc3BlY3QgfSBmcm9tICd1dGlsJztcblxuZXhwb3J0IGNsYXNzIFBhcnNlV2ViU29ja2V0U2VydmVyIHtcbiAgc2VydmVyOiBPYmplY3Q7XG5cbiAgY29uc3RydWN0b3Ioc2VydmVyOiBhbnksIG9uQ29ubmVjdDogRnVuY3Rpb24sIGNvbmZpZykge1xuICAgIGNvbmZpZy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgY29uc3Qgd3NzID0gbG9hZEFkYXB0ZXIoY29uZmlnLndzc0FkYXB0ZXIsIFdTQWRhcHRlciwgY29uZmlnKTtcbiAgICB3c3Mub25MaXN0ZW4gPSAoKSA9PiB7XG4gICAgICBsb2dnZXIuaW5mbygnUGFyc2UgTGl2ZVF1ZXJ5IFNlcnZlciBzdGFydHMgcnVubmluZycpO1xuICAgIH07XG4gICAgd3NzLm9uQ29ubmVjdGlvbiA9IHdzID0+IHtcbiAgICAgIHdzLm9uKCdlcnJvcicsIGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICBsb2dnZXIuZXJyb3IoaW5zcGVjdCh3cywgZmFsc2UpKTtcbiAgICAgIH0pO1xuICAgICAgb25Db25uZWN0KG5ldyBQYXJzZVdlYlNvY2tldCh3cykpO1xuICAgICAgLy8gU2VuZCBwaW5nIHRvIGNsaWVudCBwZXJpb2RpY2FsbHlcbiAgICAgIGNvbnN0IHBpbmdJbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICBpZiAod3MucmVhZHlTdGF0ZSA9PSB3cy5PUEVOKSB7XG4gICAgICAgICAgd3MucGluZygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNsZWFySW50ZXJ2YWwocGluZ0ludGVydmFsSWQpO1xuICAgICAgICB9XG4gICAgICB9LCBjb25maWcud2Vic29ja2V0VGltZW91dCB8fCAxMCAqIDEwMDApO1xuICAgIH07XG4gICAgd3NzLm9uRXJyb3IgPSBlcnJvciA9PiB7XG4gICAgICBsb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgIH07XG4gICAgd3NzLnN0YXJ0KCk7XG4gICAgdGhpcy5zZXJ2ZXIgPSB3c3M7XG4gIH1cblxuICBjbG9zZSgpIHtcbiAgICBpZiAodGhpcy5zZXJ2ZXIgJiYgdGhpcy5zZXJ2ZXIuY2xvc2UpIHtcbiAgICAgIHRoaXMuc2VydmVyLmNsb3NlKCk7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBQYXJzZVdlYlNvY2tldCBleHRlbmRzIGV2ZW50cy5FdmVudEVtaXR0ZXIge1xuICB3czogYW55O1xuXG4gIGNvbnN0cnVjdG9yKHdzOiBhbnkpIHtcbiAgICBzdXBlcigpO1xuICAgIHdzLm9ubWVzc2FnZSA9IHJlcXVlc3QgPT5cbiAgICAgIHRoaXMuZW1pdCgnbWVzc2FnZScsIHJlcXVlc3QgJiYgcmVxdWVzdC5kYXRhID8gcmVxdWVzdC5kYXRhIDogcmVxdWVzdCk7XG4gICAgd3Mub25jbG9zZSA9ICgpID0+IHRoaXMuZW1pdCgnZGlzY29ubmVjdCcpO1xuICAgIHRoaXMud3MgPSB3cztcbiAgfVxuXG4gIHNlbmQobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgdGhpcy53cy5zZW5kKG1lc3NhZ2UpO1xuICB9XG59XG4iXX0=