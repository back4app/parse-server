"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.WSSAdapter = void 0;
/* eslint-disable unused-imports/no-unused-vars */
// WebSocketServer Adapter
//
// Adapter classes must implement the following functions:
// * onListen()
// * onConnection(ws)
// * onError(error)
// * start()
// * close()
//
// Default is WSAdapter. The above functions will be binded.

/**
 * @interface
 * @memberof module:Adapters
 */
class WSSAdapter {
  /**
   * @param {Object} options - {http.Server|https.Server} server
   */
  constructor(options) {
    this.onListen = () => {};
    this.onConnection = () => {};
    this.onError = () => {};
  }

  // /**
  //  * Emitted when the underlying server has been bound.
  //  */
  // onListen() {}

  // /**
  //  * Emitted when the handshake is complete.
  //  *
  //  * @param {WebSocket} ws - RFC 6455 WebSocket.
  //  */
  // onConnection(ws) {}

  // /**
  //  * Emitted when error event is called.
  //  *
  //  * @param {Error} error - WebSocketServer error
  //  */
  // onError(error) {}

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
var _default = exports.default = WSSAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJXU1NBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwib25MaXN0ZW4iLCJvbkNvbm5lY3Rpb24iLCJvbkVycm9yIiwic3RhcnQiLCJjbG9zZSIsImV4cG9ydHMiLCJfZGVmYXVsdCIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvV2ViU29ja2V0U2VydmVyL1dTU0FkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgdW51c2VkLWltcG9ydHMvbm8tdW51c2VkLXZhcnMgKi9cbi8vIFdlYlNvY2tldFNlcnZlciBBZGFwdGVyXG4vL1xuLy8gQWRhcHRlciBjbGFzc2VzIG11c3QgaW1wbGVtZW50IHRoZSBmb2xsb3dpbmcgZnVuY3Rpb25zOlxuLy8gKiBvbkxpc3RlbigpXG4vLyAqIG9uQ29ubmVjdGlvbih3cylcbi8vICogb25FcnJvcihlcnJvcilcbi8vICogc3RhcnQoKVxuLy8gKiBjbG9zZSgpXG4vL1xuLy8gRGVmYXVsdCBpcyBXU0FkYXB0ZXIuIFRoZSBhYm92ZSBmdW5jdGlvbnMgd2lsbCBiZSBiaW5kZWQuXG5cbi8qKlxuICogQGludGVyZmFjZVxuICogQG1lbWJlcm9mIG1vZHVsZTpBZGFwdGVyc1xuICovXG5leHBvcnQgY2xhc3MgV1NTQWRhcHRlciB7XG4gIC8qKlxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIHtodHRwLlNlcnZlcnxodHRwcy5TZXJ2ZXJ9IHNlcnZlclxuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIHRoaXMub25MaXN0ZW4gPSAoKSA9PiB7fTtcbiAgICB0aGlzLm9uQ29ubmVjdGlvbiA9ICgpID0+IHt9O1xuICAgIHRoaXMub25FcnJvciA9ICgpID0+IHt9O1xuICB9XG5cbiAgLy8gLyoqXG4gIC8vICAqIEVtaXR0ZWQgd2hlbiB0aGUgdW5kZXJseWluZyBzZXJ2ZXIgaGFzIGJlZW4gYm91bmQuXG4gIC8vICAqL1xuICAvLyBvbkxpc3RlbigpIHt9XG5cbiAgLy8gLyoqXG4gIC8vICAqIEVtaXR0ZWQgd2hlbiB0aGUgaGFuZHNoYWtlIGlzIGNvbXBsZXRlLlxuICAvLyAgKlxuICAvLyAgKiBAcGFyYW0ge1dlYlNvY2tldH0gd3MgLSBSRkMgNjQ1NSBXZWJTb2NrZXQuXG4gIC8vICAqL1xuICAvLyBvbkNvbm5lY3Rpb24od3MpIHt9XG5cbiAgLy8gLyoqXG4gIC8vICAqIEVtaXR0ZWQgd2hlbiBlcnJvciBldmVudCBpcyBjYWxsZWQuXG4gIC8vICAqXG4gIC8vICAqIEBwYXJhbSB7RXJyb3J9IGVycm9yIC0gV2ViU29ja2V0U2VydmVyIGVycm9yXG4gIC8vICAqL1xuICAvLyBvbkVycm9yKGVycm9yKSB7fVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIENvbm5lY3Rpb24uXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gICAqL1xuICBzdGFydChvcHRpb25zKSB7fVxuXG4gIC8qKlxuICAgKiBDbG9zZXMgc2VydmVyLlxuICAgKi9cbiAgY2xvc2UoKSB7fVxufVxuXG5leHBvcnQgZGVmYXVsdCBXU1NBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTUEsVUFBVSxDQUFDO0VBQ3RCO0FBQ0Y7QUFDQTtFQUNFQyxXQUFXQSxDQUFDQyxPQUFPLEVBQUU7SUFDbkIsSUFBSSxDQUFDQyxRQUFRLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDeEIsSUFBSSxDQUFDQyxZQUFZLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDNUIsSUFBSSxDQUFDQyxPQUFPLEdBQUcsTUFBTSxDQUFDLENBQUM7RUFDekI7O0VBRUE7RUFDQTtFQUNBO0VBQ0E7O0VBRUE7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBOztFQUVBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0VBQ0VDLEtBQUtBLENBQUNKLE9BQU8sRUFBRSxDQUFDOztFQUVoQjtBQUNGO0FBQ0E7RUFDRUssS0FBS0EsQ0FBQSxFQUFHLENBQUM7QUFDWDtBQUFDQyxPQUFBLENBQUFSLFVBQUEsR0FBQUEsVUFBQTtBQUFBLElBQUFTLFFBQUEsR0FBQUQsT0FBQSxDQUFBRSxPQUFBLEdBRWNWLFVBQVUiLCJpZ25vcmVMaXN0IjpbXX0=