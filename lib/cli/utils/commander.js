'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _commander = require('commander');

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable no-console */
let _definitions;
let _reverseDefinitions;
let _defaults;

_commander.Command.prototype.loadDefinitions = function (definitions) {
  _definitions = definitions;

  Object.keys(definitions).reduce((program, opt) => {
    if (typeof definitions[opt] == "object") {
      const additionalOptions = definitions[opt];
      if (additionalOptions.required === true) {
        return program.option(`--${opt} <${opt}>`, additionalOptions.help, additionalOptions.action);
      } else {
        return program.option(`--${opt} [${opt}]`, additionalOptions.help, additionalOptions.action);
      }
    }
    return program.option(`--${opt} [${opt}]`);
  }, this);

  _reverseDefinitions = Object.keys(definitions).reduce((object, key) => {
    let value = definitions[key];
    if (typeof value == "object") {
      value = value.env;
    }
    if (value) {
      object[value] = key;
    }
    return object;
  }, {});

  _defaults = Object.keys(definitions).reduce((defs, opt) => {
    if (_definitions[opt].default) {
      defs[opt] = _definitions[opt].default;
    }
    return defs;
  }, {});

  /* istanbul ignore next */
  this.on('--help', function () {
    console.log('  Configure From Environment:');
    console.log('');
    Object.keys(_reverseDefinitions).forEach(key => {
      console.log(`    $ ${key}='${_reverseDefinitions[key]}'`);
    });
    console.log('');
  });
};

function parseEnvironment(env = {}) {
  return Object.keys(_reverseDefinitions).reduce((options, key) => {
    if (env[key]) {
      const originalKey = _reverseDefinitions[key];
      let action = option => option;
      if (typeof _definitions[originalKey] === "object") {
        action = _definitions[originalKey].action || action;
      }
      options[_reverseDefinitions[key]] = action(env[key]);
    }
    return options;
  }, {});
}

function parseConfigFile(program) {
  let options = {};
  if (program.args.length > 0) {
    let jsonPath = program.args[0];
    jsonPath = _path2.default.resolve(jsonPath);
    const jsonConfig = require(jsonPath);
    if (jsonConfig.apps) {
      if (jsonConfig.apps.length > 1) {
        throw 'Multiple apps are not supported';
      }
      options = jsonConfig.apps[0];
    } else {
      options = jsonConfig;
    }
    Object.keys(options).forEach(key => {
      const value = options[key];
      if (!_definitions[key]) {
        throw `error: unknown option ${key}`;
      }
      const action = _definitions[key].action;
      if (action) {
        options[key] = action(value);
      }
    });
    console.log(`Configuration loaded from ${jsonPath}`);
  }
  return options;
}

_commander.Command.prototype.setValuesIfNeeded = function (options) {
  Object.keys(options).forEach(key => {
    if (!this.hasOwnProperty(key)) {
      this[key] = options[key];
    }
  });
};

_commander.Command.prototype._parse = _commander.Command.prototype.parse;

_commander.Command.prototype.parse = function (args, env) {
  this._parse(args);
  // Parse the environment first
  const envOptions = parseEnvironment(env);
  const fromFile = parseConfigFile(this);
  // Load the env if not passed from command line
  this.setValuesIfNeeded(envOptions);
  // Load from file to override
  this.setValuesIfNeeded(fromFile);
  // Last set the defaults
  this.setValuesIfNeeded(_defaults);
};

_commander.Command.prototype.getOptions = function () {
  return Object.keys(_definitions).reduce((options, key) => {
    if (typeof this[key] !== 'undefined') {
      options[key] = this[key];
    }
    return options;
  }, {});
};

exports.default = new _commander.Command();
/* eslint-enable no-console */
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9jbGkvdXRpbHMvY29tbWFuZGVyLmpzIl0sIm5hbWVzIjpbIl9kZWZpbml0aW9ucyIsIl9yZXZlcnNlRGVmaW5pdGlvbnMiLCJfZGVmYXVsdHMiLCJDb21tYW5kIiwicHJvdG90eXBlIiwibG9hZERlZmluaXRpb25zIiwiZGVmaW5pdGlvbnMiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwicHJvZ3JhbSIsIm9wdCIsImFkZGl0aW9uYWxPcHRpb25zIiwicmVxdWlyZWQiLCJvcHRpb24iLCJoZWxwIiwiYWN0aW9uIiwib2JqZWN0Iiwia2V5IiwidmFsdWUiLCJlbnYiLCJkZWZzIiwiZGVmYXVsdCIsIm9uIiwiY29uc29sZSIsImxvZyIsImZvckVhY2giLCJwYXJzZUVudmlyb25tZW50Iiwib3B0aW9ucyIsIm9yaWdpbmFsS2V5IiwicGFyc2VDb25maWdGaWxlIiwiYXJncyIsImxlbmd0aCIsImpzb25QYXRoIiwicGF0aCIsInJlc29sdmUiLCJqc29uQ29uZmlnIiwicmVxdWlyZSIsImFwcHMiLCJzZXRWYWx1ZXNJZk5lZWRlZCIsImhhc093blByb3BlcnR5IiwiX3BhcnNlIiwicGFyc2UiLCJlbnZPcHRpb25zIiwiZnJvbUZpbGUiLCJnZXRPcHRpb25zIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQTs7QUFDQTs7Ozs7O0FBRkE7QUFHQSxJQUFJQSxZQUFKO0FBQ0EsSUFBSUMsbUJBQUo7QUFDQSxJQUFJQyxTQUFKOztBQUVBQyxtQkFBUUMsU0FBUixDQUFrQkMsZUFBbEIsR0FBb0MsVUFBU0MsV0FBVCxFQUFzQjtBQUN4RE4saUJBQWVNLFdBQWY7O0FBRUFDLFNBQU9DLElBQVAsQ0FBWUYsV0FBWixFQUF5QkcsTUFBekIsQ0FBZ0MsQ0FBQ0MsT0FBRCxFQUFVQyxHQUFWLEtBQWtCO0FBQ2hELFFBQUksT0FBT0wsWUFBWUssR0FBWixDQUFQLElBQTJCLFFBQS9CLEVBQXlDO0FBQ3ZDLFlBQU1DLG9CQUFvQk4sWUFBWUssR0FBWixDQUEx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LENBQWtCc0MsS0FBbEIsR0FBMEIsVUFBU1gsSUFBVCxFQUFlWCxHQUFmLEVBQW9CO0FBQzVDLE9BQUtxQixNQUFMLENBQVlWLElBQVo7QUFDQTtBQUNBLFFBQU1ZLGFBQWFoQixpQkFBaUJQLEdBQWpCLENBQW5CO0FBQ0EsUUFBTXdCLFdBQVdkLGdCQUFnQixJQUFoQixDQUFqQjtBQUNBO0FBQ0EsT0FBS1MsaUJBQUwsQ0FBdUJJLFVBQXZCO0FBQ0E7QUFDQSxPQUFLSixpQkFBTCxDQUF1QkssUUFBdkI7QUFDQTtBQUNBLE9BQUtMLGlCQUFMLENBQXVCckMsU0FBdkI7QUFDRCxDQVhEOztBQWFBQyxtQkFBUUMsU0FBUixDQUFrQnlDLFVBQWxCLEdBQStCLFlBQVc7QUFDeEMsU0FBT3RDLE9BQU9DLElBQVAsQ0FBWVIsWUFBWixFQUEwQlMsTUFBMUIsQ0FBaUMsQ0FBQ21CLE9BQUQsRUFBVVYsR0FBVixLQUFrQjtBQUN4RCxRQUFJLE9BQU8sS0FBS0EsR0FBTCxDQUFQLEtBQXFCLFdBQXpCLEVBQXNDO0FBQ3BDVSxjQUFRVixHQUFSLElBQWUsS0FBS0EsR0FBTCxDQUFmO0FBQ0Q7QUFDRCxXQUFPVSxPQUFQO0FBQ0QsR0FMTSxFQUtKLEVBTEksQ0FBUDtBQU1ELENBUEQ7O2tCQVNlLElBQUl6QixrQkFBSixFO0FBQ2YiLCJmaWxlIjoiY29tbWFuZGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuaW1wb3J0IHsgQ29tbWFuZCB9IGZyb20gJ2NvbW1hbmRlcic7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmxldCBfZGVmaW5pdGlvbnM7XG5sZXQgX3JldmVyc2VEZWZpbml0aW9ucztcbmxldCBfZGVmYXVsdHM7XG5cbkNvbW1hbmQucHJvdG90eXBlLmxvYWREZWZpbml0aW9ucyA9IGZ1bmN0aW9uKGRlZmluaXRpb25zKSB7XG4gIF9kZWZpbml0aW9ucyA9IGRlZmluaXRpb25zO1xuXG4gIE9iamVjdC5rZXlzKGRlZmluaXRpb25zKS5yZWR1Y2UoKHByb2dyYW0sIG9wdCkgPT4ge1xuICAgIGlmICh0eXBlb2YgZGVmaW5pdGlvbnNbb3B0XSA9PSBcIm9iamVjdFwiKSB7XG4gICAgICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IGRlZmluaXRpb25zW29wdF07XG4gICAgICBpZiAoYWRkaXRpb25hbE9wdGlvbnMucmVxdWlyZWQgPT09IHRydWUpIHtcbiAgICAgICAgcmV0dXJuIHByb2dyYW0ub3B0aW9uKGAtLSR7b3B0fSA8JHtvcHR9PmAsIGFkZGl0aW9uYWxPcHRpb25zLmhlbHAsIGFkZGl0aW9uYWxPcHRpb25zLmFjdGlvbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gcHJvZ3JhbS5vcHRpb24oYC0tJHtvcHR9IFske29wdH1dYCwgYWRkaXRpb25hbE9wdGlvbnMuaGVscCwgYWRkaXRpb25hbE9wdGlvbnMuYWN0aW9uKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHByb2dyYW0ub3B0aW9uKGAtLSR7b3B0fSBbJHtvcHR9XWApO1xuICB9LCB0aGlzKTtcblxuICBfcmV2ZXJzZURlZmluaXRpb25zID0gT2JqZWN0LmtleXMoZGVmaW5pdGlvbnMpLnJlZHVjZSgob2JqZWN0LCBrZXkpID0+IHtcbiAgICBsZXQgdmFsdWUgPSBkZWZpbml0aW9uc1trZXldO1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJvYmplY3RcIikge1xuICAgICAgdmFsdWUgPSB2YWx1ZS5lbnY7XG4gICAgfVxuICAgIGlmICh2YWx1ZSkge1xuICAgICAgb2JqZWN0W3ZhbHVlXSA9IGtleTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfSwge30pO1xuXG4gIF9kZWZhdWx0cyA9IE9iamVjdC5rZXlzKGRlZmluaXRpb25zKS5yZWR1Y2UoKGRlZnMsIG9wdCkgPT4ge1xuICAgIGlmKF9kZWZpbml0aW9uc1tvcHRdLmRlZmF1bHQpIHtcbiAgICAgIGRlZnNbb3B0XSA9IF9kZWZpbml0aW9uc1tvcHRdLmRlZmF1bHQ7XG4gICAgfVxuICAgIHJldHVybiBkZWZzO1xuICB9LCB7fSk7XG5cbiAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgdGhpcy5vbignLS1oZWxwJywgZnVuY3Rpb24oKXtcbiAgICBjb25zb2xlLmxvZygnICBDb25maWd1cmUgRnJvbSBFbnZpcm9ubWVudDonKTtcbiAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgT2JqZWN0LmtleXMoX3JldmVyc2VEZWZpbml0aW9ucykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhgICAgICQgJHtrZXl9PScke19yZXZlcnNlRGVmaW5pdGlvbnNba2V5XX0nYCk7XG4gICAgfSk7XG4gICAgY29uc29sZS5sb2coJycpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHBhcnNlRW52aXJvbm1lbnQoZW52ID0ge30pIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKF9yZXZlcnNlRGVmaW5pdGlvbnMpLnJlZHVjZSgob3B0aW9ucywga2V5KSA9PiB7XG4gICAgaWYgKGVudltrZXldKSB7XG4gICAgICBjb25zdCBvcmlnaW5hbEtleSA9IF9yZXZlcnNlRGVmaW5pdGlvbnNba2V5XTtcbiAgICAgIGxldCBhY3Rpb24gPSAob3B0aW9uKSA9PiAob3B0aW9uKTtcbiAgICAgIGlmICh0eXBlb2YgX2RlZmluaXRpb25zW29yaWdpbmFsS2V5XSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBhY3Rpb24gPSBfZGVmaW5pdGlvbnNbb3JpZ2luYWxLZXldLmFjdGlvbiB8fCBhY3Rpb247XG4gICAgICB9XG4gICAgICBvcHRpb25zW19yZXZlcnNlRGVmaW5pdGlvbnNba2V5XV0gPSBhY3Rpb24oZW52W2tleV0pO1xuICAgIH1cbiAgICByZXR1cm4gb3B0aW9ucztcbiAgfSwge30pO1xufVxuXG5mdW5jdGlvbiBwYXJzZUNvbmZpZ0ZpbGUocHJvZ3JhbSkge1xuICBsZXQgb3B0aW9ucyA9IHt9O1xuICBpZiAocHJvZ3JhbS5hcmdzLmxlbmd0aCA+IDApIHtcbiAgICBsZXQganNvblBhdGggPSBwcm9ncmFtLmFyZ3NbMF07XG4gICAganNvblBhdGggPSBwYXRoLnJlc29sdmUoanNvblBhdGgpO1xuICAgIGNvbnN0IGpzb25Db25maWcgPSByZXF1aXJlKGpzb25QYXRoKTtcbiAgICBpZiAoanNvbkNvbmZpZy5hcHBzKSB7XG4gICAgICBpZiAoanNvbkNvbmZpZy5hcHBzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdGhyb3cgJ011bHRpcGxlIGFwcHMgYXJlIG5vdCBzdXBwb3J0ZWQnO1xuICAgICAgfVxuICAgICAgb3B0aW9ucyA9IGpzb25Db25maWcuYXBwc1swXTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3B0aW9ucyA9IGpzb25Db25maWc7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKG9wdGlvbnMpLmZvckVhY2goKGtleSkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBvcHRpb25zW2tleV07XG4gICAgICBpZiAoIV9kZWZpbml0aW9uc1trZXldKSB7XG4gICAgICAgIHRocm93IGBlcnJvcjogdW5rbm93biBvcHRpb24gJHtrZXl9YDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGFjdGlvbiA9IF9kZWZpbml0aW9uc1trZXldLmFjdGlvbjtcbiAgICAgIGlmIChhY3Rpb24pIHtcbiAgICAgICAgb3B0aW9uc1trZXldID0gYWN0aW9uKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zb2xlLmxvZyhgQ29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSAke2pzb25QYXRofWApXG4gIH1cbiAgcmV0dXJuIG9wdGlvbnM7XG59XG5cbkNvbW1hbmQucHJvdG90eXBlLnNldFZhbHVlc0lmTmVlZGVkID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhvcHRpb25zKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICBpZiAoIXRoaXMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgdGhpc1trZXldID0gb3B0aW9uc1trZXldO1xuICAgIH1cbiAgfSk7XG59O1xuXG5Db21tYW5kLnByb3RvdHlwZS5fcGFyc2UgPSBDb21tYW5kLnByb3RvdHlwZS5wYXJzZTtcblxuQ29tbWFuZC5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbihhcmdzLCBlbnYpIHtcbiAgdGhpcy5fcGFyc2UoYXJncyk7XG4gIC8vIFBhcnNlIHRoZSBlbnZpcm9ubWVudCBmaXJzdFxuICBjb25zdCBlbnZPcHRpb25zID0gcGFyc2VFbnZpcm9ubWVudChlbnYpO1xuICBjb25zdCBmcm9tRmlsZSA9IHBhcnNlQ29uZmlnRmlsZSh0aGlzKTtcbiAgLy8gTG9hZCB0aGUgZW52IGlmIG5vdCBwYXNzZWQgZnJvbSBjb21tYW5kIGxpbmVcbiAgdGhpcy5zZXRWYWx1ZXNJZk5lZWRlZChlbnZPcHRpb25zKTtcbiAgLy8gTG9hZCBmcm9tIGZpbGUgdG8gb3ZlcnJpZGVcbiAgdGhpcy5zZXRWYWx1ZXNJZk5lZWRlZChmcm9tRmlsZSk7XG4gIC8vIExhc3Qgc2V0IHRoZSBkZWZhdWx0c1xuICB0aGlzLnNldFZhbHVlc0lmTmVlZGVkKF9kZWZhdWx0cyk7XG59O1xuXG5Db21tYW5kLnByb3RvdHlwZS5nZXRPcHRpb25zID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhfZGVmaW5pdGlvbnMpLnJlZHVjZSgob3B0aW9ucywga2V5KSA9PiB7XG4gICAgaWYgKHR5cGVvZiB0aGlzW2tleV0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBvcHRpb25zW2tleV0gPSB0aGlzW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvcHRpb25zO1xuICB9LCB7fSk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBuZXcgQ29tbWFuZCgpO1xuLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4iXX0=