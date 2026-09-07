"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LoggerAdapter = void 0;
/* eslint-disable unused-imports/no-unused-vars */
/**
 * @interface
 * @memberof module:Adapters
 * Logger Adapter
 * Allows you to change the logger mechanism
 * Default is WinstonLoggerAdapter.js
 */
class LoggerAdapter {
  constructor(options) {}
  /**
   * log
   * @param {String} level
   * @param {String} message
   * @param {Object} metadata
   */
  log(level, message /* meta */) {}
}
exports.LoggerAdapter = LoggerAdapter;
var _default = exports.default = LoggerAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJMb2dnZXJBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwibG9nIiwibGV2ZWwiLCJtZXNzYWdlIiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwiZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvTG9nZ2VyQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSB1bnVzZWQtaW1wb3J0cy9uby11bnVzZWQtdmFycyAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlXG4gKiBAbWVtYmVyb2YgbW9kdWxlOkFkYXB0ZXJzXG4gKiBMb2dnZXIgQWRhcHRlclxuICogQWxsb3dzIHlvdSB0byBjaGFuZ2UgdGhlIGxvZ2dlciBtZWNoYW5pc21cbiAqIERlZmF1bHQgaXMgV2luc3RvbkxvZ2dlckFkYXB0ZXIuanNcbiAqL1xuZXhwb3J0IGNsYXNzIExvZ2dlckFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7fVxuICAvKipcbiAgICogbG9nXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBsZXZlbFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAcGFyYW0ge09iamVjdH0gbWV0YWRhdGFcbiAgICovXG4gIGxvZyhsZXZlbCwgbWVzc2FnZSAvKiBtZXRhICovKSB7fVxufVxuXG5leHBvcnQgZGVmYXVsdCBMb2dnZXJBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTUEsYUFBYSxDQUFDO0VBQ3pCQyxXQUFXQSxDQUFDQyxPQUFPLEVBQUUsQ0FBQztFQUN0QjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsR0FBR0EsQ0FBQ0MsS0FBSyxFQUFFQyxPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ2xDO0FBQUNDLE9BQUEsQ0FBQU4sYUFBQSxHQUFBQSxhQUFBO0FBQUEsSUFBQU8sUUFBQSxHQUFBRCxPQUFBLENBQUFFLE9BQUEsR0FFY1IsYUFBYSIsImlnbm9yZUxpc3QiOltdfQ==