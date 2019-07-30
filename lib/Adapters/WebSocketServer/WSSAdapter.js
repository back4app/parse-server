"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.WSSAdapter = void 0;

/*eslint no-unused-vars: "off"*/
// WebSocketServer Adapter
//
// Adapter classes must implement the following functions:
// * onListen()
// * onConnection(ws)
// * start()
// * close()
//
// Default is WSAdapter. The above functions will be binded.

/**
 * @module Adapters
 */

/**
 * @interface WSSAdapter
 */
class WSSAdapter {
  /**
   * @param {Object} options - {http.Server|https.Server} server
   */
  constructor(options) {
    this.onListen = () => {};

    this.onConnection = () => {};
  } // /**
  //  * Emitted when the underlying server has been bound.
  //  */
  // onListen() {}
  // /**
  //  * Emitted when the handshake is complete.
  //  *
  //  * @param {WebSocket} ws - RFC 6455 WebSocket.
  //  */
  // onConnection(ws) {}

  /**
   * Initialize Connection.
   *
   * @param {Object} options
   */


  start(options) {}
  /**
   * Closes server.
   */


  close() {}

}

exports.WSSAdapter = WSSAdapter;
var _default = WSSAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9XZWJTb2NrZXRTZXJ2ZXIvV1NTQWRhcHRlci5qcyJdLCJuYW1lcyI6WyJXU1NBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwib25MaXN0ZW4iLCJvbkNvbm5lY3Rpb24iLCJzdGFydCIsImNsb3NlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7QUFHQTs7O0FBR08sTUFBTUEsVUFBTixDQUFpQjtBQUN0Qjs7O0FBR0FDLEVBQUFBLFdBQVcsQ0FBQ0MsT0FBRCxFQUFVO0FBQ25CLFNBQUtDLFFBQUwsR0FBZ0IsTUFBTSxDQUFFLENBQXhCOztBQUNBLFNBQUtDLFlBQUwsR0FBb0IsTUFBTSxDQUFFLENBQTVCO0FBQ0QsR0FQcUIsQ0FTdEI7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7Ozs7QUFLQUMsRUFBQUEsS0FBSyxDQUFDSCxPQUFELEVBQVUsQ0FBRTtBQUVqQjs7Ozs7QUFHQUksRUFBQUEsS0FBSyxHQUFHLENBQUU7O0FBL0JZOzs7ZUFrQ1ROLFUiLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vLyBXZWJTb2NrZXRTZXJ2ZXIgQWRhcHRlclxuLy9cbi8vIEFkYXB0ZXIgY2xhc3NlcyBtdXN0IGltcGxlbWVudCB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbi8vICogb25MaXN0ZW4oKVxuLy8gKiBvbkNvbm5lY3Rpb24od3MpXG4vLyAqIHN0YXJ0KClcbi8vICogY2xvc2UoKVxuLy9cbi8vIERlZmF1bHQgaXMgV1NBZGFwdGVyLiBUaGUgYWJvdmUgZnVuY3Rpb25zIHdpbGwgYmUgYmluZGVkLlxuXG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIFdTU0FkYXB0ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIFdTU0FkYXB0ZXIge1xuICAvKipcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSB7aHR0cC5TZXJ2ZXJ8aHR0cHMuU2VydmVyfSBzZXJ2ZXJcbiAgICovXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICB0aGlzLm9uTGlzdGVuID0gKCkgPT4ge31cbiAgICB0aGlzLm9uQ29ubmVjdGlvbiA9ICgpID0+IHt9XG4gIH1cblxuICAvLyAvKipcbiAgLy8gICogRW1pdHRlZCB3aGVuIHRoZSB1bmRlcmx5aW5nIHNlcnZlciBoYXMgYmVlbiBib3VuZC5cbiAgLy8gICovXG4gIC8vIG9uTGlzdGVuKCkge31cblxuICAvLyAvKipcbiAgLy8gICogRW1pdHRlZCB3aGVuIHRoZSBoYW5kc2hha2UgaXMgY29tcGxldGUuXG4gIC8vICAqXG4gIC8vICAqIEBwYXJhbSB7V2ViU29ja2V0fSB3cyAtIFJGQyA2NDU1IFdlYlNvY2tldC5cbiAgLy8gICovXG4gIC8vIG9uQ29ubmVjdGlvbih3cykge31cblxuICAvKipcbiAgICogSW5pdGlhbGl6ZSBDb25uZWN0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICAgKi9cbiAgc3RhcnQob3B0aW9ucykge31cblxuICAvKipcbiAgICogQ2xvc2VzIHNlcnZlci5cbiAgICovXG4gIGNsb3NlKCkge31cbn1cblxuZXhwb3J0IGRlZmF1bHQgV1NTQWRhcHRlcjtcbiJdfQ==