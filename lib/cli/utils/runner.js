"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;

var _commander = _interopRequireDefault(require("./commander"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function logStartupOptions(options) {
  for (const key in options) {
    let value = options[key];

    if (key == 'masterKey') {
      value = '***REDACTED***';
    }

    if (key == 'push' && options.verbose != true) {
      value = '***REDACTED***';
    }

    if (typeof value === 'object') {
      try {
        value = JSON.stringify(value);
      } catch (e) {
        if (value && value.constructor && value.constructor.name) {
          value = value.constructor.name;
        }
      }
    }
    /* eslint-disable no-console */


    console.log(`${key}: ${value}`);
    /* eslint-enable no-console */
  }
}

function _default({
  definitions,
  help,
  usage,
  start
}) {
  _commander.default.loadDefinitions(definitions);

  if (usage) {
    _commander.default.usage(usage);
  }

  if (help) {
    _commander.default.on('--help', help);
  }

  _commander.default.parse(process.argv, process.env);

  const options = _commander.default.getOptions();

  start(_commander.default, options, function () {
    logStartupOptions(options);
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2dTdGFydHVwT3B0aW9ucyIsIm9wdGlvbnMiLCJrZXkiLCJ2YWx1ZSIsInZlcmJvc2UiLCJKU09OIiwic3RyaW5naWZ5IiwiZSIsImNvbnN0cnVjdG9yIiwibmFtZSIsImNvbnNvbGUiLCJsb2ciLCJkZWZpbml0aW9ucyIsImhlbHAiLCJ1c2FnZSIsInN0YXJ0IiwicHJvZ3JhbSIsImxvYWREZWZpbml0aW9ucyIsIm9uIiwicGFyc2UiLCJwcm9jZXNzIiwiYXJndiIsImVudiIsImdldE9wdGlvbnMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvY2xpL3V0aWxzL3J1bm5lci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcHJvZ3JhbSBmcm9tICcuL2NvbW1hbmRlcic7XG5cbmZ1bmN0aW9uIGxvZ1N0YXJ0dXBPcHRpb25zKG9wdGlvbnMpIHtcbiAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucykge1xuICAgIGxldCB2YWx1ZSA9IG9wdGlvbnNba2V5XTtcbiAgICBpZiAoa2V5ID09ICdtYXN0ZXJLZXknKSB7XG4gICAgICB2YWx1ZSA9ICcqKipSRURBQ1RFRCoqKic7XG4gICAgfVxuICAgIGlmIChrZXkgPT0gJ3B1c2gnICYmIG9wdGlvbnMudmVyYm9zZSAhPSB0cnVlKSB7XG4gICAgICB2YWx1ZSA9ICcqKipSRURBQ1RFRCoqKic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICB0cnkge1xuICAgICAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLmNvbnN0cnVjdG9yICYmIHZhbHVlLmNvbnN0cnVjdG9yLm5hbWUpIHtcbiAgICAgICAgICB2YWx1ZSA9IHZhbHVlLmNvbnN0cnVjdG9yLm5hbWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgIGNvbnNvbGUubG9nKGAke2tleX06ICR7dmFsdWV9YCk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHsgZGVmaW5pdGlvbnMsIGhlbHAsIHVzYWdlLCBzdGFydCB9KSB7XG4gIHByb2dyYW0ubG9hZERlZmluaXRpb25zKGRlZmluaXRpb25zKTtcbiAgaWYgKHVzYWdlKSB7XG4gICAgcHJvZ3JhbS51c2FnZSh1c2FnZSk7XG4gIH1cbiAgaWYgKGhlbHApIHtcbiAgICBwcm9ncmFtLm9uKCctLWhlbHAnLCBoZWxwKTtcbiAgfVxuICBwcm9ncmFtLnBhcnNlKHByb2Nlc3MuYXJndiwgcHJvY2Vzcy5lbnYpO1xuXG4gIGNvbnN0IG9wdGlvbnMgPSBwcm9ncmFtLmdldE9wdGlvbnMoKTtcbiAgc3RhcnQocHJvZ3JhbSwgb3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgIGxvZ1N0YXJ0dXBPcHRpb25zKG9wdGlvbnMpO1xuICB9KTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOzs7O0FBRUEsU0FBU0EsaUJBQVQsQ0FBMkJDLE9BQTNCLEVBQW9DO0VBQ2xDLEtBQUssTUFBTUMsR0FBWCxJQUFrQkQsT0FBbEIsRUFBMkI7SUFDekIsSUFBSUUsS0FBSyxHQUFHRixPQUFPLENBQUNDLEdBQUQsQ0FBbkI7O0lBQ0EsSUFBSUEsR0FBRyxJQUFJLFdBQVgsRUFBd0I7TUFDdEJDLEtBQUssR0FBRyxnQkFBUjtJQUNEOztJQUNELElBQUlELEdBQUcsSUFBSSxNQUFQLElBQWlCRCxPQUFPLENBQUNHLE9BQVIsSUFBbUIsSUFBeEMsRUFBOEM7TUFDNUNELEtBQUssR0FBRyxnQkFBUjtJQUNEOztJQUNELElBQUksT0FBT0EsS0FBUCxLQUFpQixRQUFyQixFQUErQjtNQUM3QixJQUFJO1FBQ0ZBLEtBQUssR0FBR0UsSUFBSSxDQUFDQyxTQUFMLENBQWVILEtBQWYsQ0FBUjtNQUNELENBRkQsQ0FFRSxPQUFPSSxDQUFQLEVBQVU7UUFDVixJQUFJSixLQUFLLElBQUlBLEtBQUssQ0FBQ0ssV0FBZixJQUE4QkwsS0FBSyxDQUFDSyxXQUFOLENBQWtCQyxJQUFwRCxFQUEwRDtVQUN4RE4sS0FBSyxHQUFHQSxLQUFLLENBQUNLLFdBQU4sQ0FBa0JDLElBQTFCO1FBQ0Q7TUFDRjtJQUNGO0lBQ0Q7OztJQUNBQyxPQUFPLENBQUNDLEdBQVIsQ0FBYSxHQUFFVCxHQUFJLEtBQUlDLEtBQU0sRUFBN0I7SUFDQTtFQUNEO0FBQ0Y7O0FBRWMsa0JBQVU7RUFBRVMsV0FBRjtFQUFlQyxJQUFmO0VBQXFCQyxLQUFyQjtFQUE0QkM7QUFBNUIsQ0FBVixFQUErQztFQUM1REMsa0JBQUEsQ0FBUUMsZUFBUixDQUF3QkwsV0FBeEI7O0VBQ0EsSUFBSUUsS0FBSixFQUFXO0lBQ1RFLGtCQUFBLENBQVFGLEtBQVIsQ0FBY0EsS0FBZDtFQUNEOztFQUNELElBQUlELElBQUosRUFBVTtJQUNSRyxrQkFBQSxDQUFRRSxFQUFSLENBQVcsUUFBWCxFQUFxQkwsSUFBckI7RUFDRDs7RUFDREcsa0JBQUEsQ0FBUUcsS0FBUixDQUFjQyxPQUFPLENBQUNDLElBQXRCLEVBQTRCRCxPQUFPLENBQUNFLEdBQXBDOztFQUVBLE1BQU1yQixPQUFPLEdBQUdlLGtCQUFBLENBQVFPLFVBQVIsRUFBaEI7O0VBQ0FSLEtBQUssQ0FBQ0Msa0JBQUQsRUFBVWYsT0FBVixFQUFtQixZQUFZO0lBQ2xDRCxpQkFBaUIsQ0FBQ0MsT0FBRCxDQUFqQjtFQUNELENBRkksQ0FBTDtBQUdEIn0=