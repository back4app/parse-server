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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9XZWJTb2NrZXRTZXJ2ZXIvV1NTQWRhcHRlci5qcyJdLCJuYW1lcyI6WyJXU1NBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwib25MaXN0ZW4iLCJvbkNvbm5lY3Rpb24iLCJzdGFydCIsImNsb3NlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7QUFHQTs7O0FBR08sTUFBTUEsVUFBTixDQUFpQjtBQUN0Qjs7O0FBR0FDLEVBQUFBLFdBQVcsQ0FBQ0MsT0FBRCxFQUFVO0FBQ25CLFNBQUtDLFFBQUwsR0FBZ0IsTUFBTSxDQUFFLENBQXhCOztBQUNBLFNBQUtDLFlBQUwsR0FBb0IsTUFBTSxDQUFFLENBQTVCO0FBQ0QsR0FQcUIsQ0FTdEI7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7Ozs7QUFLQUMsRUFBQUEsS0FBSyxDQUFDSCxPQUFELEVBQVUsQ0FBRTtBQUVqQjs7Ozs7QUFHQUksRUFBQUEsS0FBSyxHQUFHLENBQUU7O0FBL0JZOzs7ZUFrQ1ROLFUiLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vLyBXZWJTb2NrZXRTZXJ2ZXIgQWRhcHRlclxuLy9cbi8vIEFkYXB0ZXIgY2xhc3NlcyBtdXN0IGltcGxlbWVudCB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbi8vICogb25MaXN0ZW4oKVxuLy8gKiBvbkNvbm5lY3Rpb24od3MpXG4vLyAqIHN0YXJ0KClcbi8vICogY2xvc2UoKVxuLy9cbi8vIERlZmF1bHQgaXMgV1NBZGFwdGVyLiBUaGUgYWJvdmUgZnVuY3Rpb25zIHdpbGwgYmUgYmluZGVkLlxuXG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIFdTU0FkYXB0ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIFdTU0FkYXB0ZXIge1xuICAvKipcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSB7aHR0cC5TZXJ2ZXJ8aHR0cHMuU2VydmVyfSBzZXJ2ZXJcbiAgICovXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICB0aGlzLm9uTGlzdGVuID0gKCkgPT4ge307XG4gICAgdGhpcy5vbkNvbm5lY3Rpb24gPSAoKSA9PiB7fTtcbiAgfVxuXG4gIC8vIC8qKlxuICAvLyAgKiBFbWl0dGVkIHdoZW4gdGhlIHVuZGVybHlpbmcgc2VydmVyIGhhcyBiZWVuIGJvdW5kLlxuICAvLyAgKi9cbiAgLy8gb25MaXN0ZW4oKSB7fVxuXG4gIC8vIC8qKlxuICAvLyAgKiBFbWl0dGVkIHdoZW4gdGhlIGhhbmRzaGFrZSBpcyBjb21wbGV0ZS5cbiAgLy8gICpcbiAgLy8gICogQHBhcmFtIHtXZWJTb2NrZXR9IHdzIC0gUkZDIDY0NTUgV2ViU29ja2V0LlxuICAvLyAgKi9cbiAgLy8gb25Db25uZWN0aW9uKHdzKSB7fVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIENvbm5lY3Rpb24uXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gICAqL1xuICBzdGFydChvcHRpb25zKSB7fVxuXG4gIC8qKlxuICAgKiBDbG9zZXMgc2VydmVyLlxuICAgKi9cbiAgY2xvc2UoKSB7fVxufVxuXG5leHBvcnQgZGVmYXVsdCBXU1NBZGFwdGVyO1xuIl19