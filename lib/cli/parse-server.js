"use strict";

var _index = _interopRequireDefault(require("../index"));

var _parseServer = _interopRequireDefault(require("./definitions/parse-server"));

var _cluster = _interopRequireDefault(require("cluster"));

var _os = _interopRequireDefault(require("os"));

var _runner = _interopRequireDefault(require("./utils/runner"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable no-console */
const help = function () {
  console.log('  Get Started guide:');
  console.log('');
  console.log('    Please have a look at the get started guide!');
  console.log('    http://docs.parseplatform.org/parse-server/guide/');
  console.log('');
  console.log('');
  console.log('  Usage with npm start');
  console.log('');
  console.log('    $ npm start -- path/to/config.json');
  console.log('    $ npm start -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('    $ npm start -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('');
  console.log('');
  console.log('  Usage:');
  console.log('');
  console.log('    $ parse-server path/to/config.json');
  console.log('    $ parse-server -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('    $ parse-server -- --appId APP_ID --masterKey MASTER_KEY --serverURL serverURL');
  console.log('');
};

(0, _runner.default)({
  definitions: _parseServer.default,
  help,
  usage: '[options] <path/to/configuration.json>',
  start: function (program, options, logOptions) {
    if (!options.appId || !options.masterKey) {
      program.outputHelp();
      console.error('');
      console.error('\u001b[31mERROR: appId and masterKey are required\u001b[0m');
      console.error('');
      process.exit(1);
    }

    if (options['liveQuery.classNames']) {
      options.liveQuery = options.liveQuery || {};
      options.liveQuery.classNames = options['liveQuery.classNames'];
      delete options['liveQuery.classNames'];
    }

    if (options['liveQuery.redisURL']) {
      options.liveQuery = options.liveQuery || {};
      options.liveQuery.redisURL = options['liveQuery.redisURL'];
      delete options['liveQuery.redisURL'];
    }

    if (options['liveQuery.redisOptions']) {
      options.liveQuery = options.liveQuery || {};
      options.liveQuery.redisOptions = options['liveQuery.redisOptions'];
      delete options['liveQuery.redisOptions'];
    }

    if (options.cluster) {
      const numCPUs = typeof options.cluster === 'number' ? options.cluster : _os.default.cpus().length;

      if (_cluster.default.isMaster) {
        logOptions();

        for (let i = 0; i < numCPUs; i++) {
          _cluster.default.fork();
        }

        _cluster.default.on('exit', (worker, code) => {
          console.log(`worker ${worker.process.pid} died (${code})... Restarting`);

          _cluster.default.fork();
        });
      } else {
        _index.default.start(options, () => {
          printSuccessMessage();
        });
      }
    } else {
      _index.default.start(options, () => {
        logOptions();
        console.log('');
        printSuccessMessage();
      });
    }

    function printSuccessMessage() {
      console.log('[' + process.pid + '] parse-server running on ' + options.serverURL);

      if (options.mountGraphQL) {
        console.log('[' + process.pid + '] GraphQL running on http://localhost:' + options.port + options.graphQLPath);
      }

      if (options.mountPlayground) {
        console.log('[' + process.pid + '] Playground running on http://localhost:' + options.port + options.playgroundPath);
      }
    }
  }
});
/* eslint-enable no-console */
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJoZWxwIiwiY29uc29sZSIsImxvZyIsInJ1bm5lciIsImRlZmluaXRpb25zIiwidXNhZ2UiLCJzdGFydCIsInByb2dyYW0iLCJvcHRpb25zIiwibG9nT3B0aW9ucyIsImFwcElkIiwibWFzdGVyS2V5Iiwib3V0cHV0SGVscCIsImVycm9yIiwicHJvY2VzcyIsImV4aXQiLCJsaXZlUXVlcnkiLCJjbGFzc05hbWVzIiwicmVkaXNVUkwiLCJyZWRpc09wdGlvbnMiLCJjbHVzdGVyIiwibnVtQ1BVcyIsIm9zIiwiY3B1cyIsImxlbmd0aCIsImlzTWFzdGVyIiwiaSIsImZvcmsiLCJvbiIsIndvcmtlciIsImNvZGUiLCJwaWQiLCJQYXJzZVNlcnZlciIsInByaW50U3VjY2Vzc01lc3NhZ2UiLCJzZXJ2ZXJVUkwiLCJtb3VudEdyYXBoUUwiLCJwb3J0IiwiZ3JhcGhRTFBhdGgiLCJtb3VudFBsYXlncm91bmQiLCJwbGF5Z3JvdW5kUGF0aCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbGkvcGFyc2Utc2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbmltcG9ydCBQYXJzZVNlcnZlciBmcm9tICcuLi9pbmRleCc7XG5pbXBvcnQgZGVmaW5pdGlvbnMgZnJvbSAnLi9kZWZpbml0aW9ucy9wYXJzZS1zZXJ2ZXInO1xuaW1wb3J0IGNsdXN0ZXIgZnJvbSAnY2x1c3Rlcic7XG5pbXBvcnQgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHJ1bm5lciBmcm9tICcuL3V0aWxzL3J1bm5lcic7XG5cbmNvbnN0IGhlbHAgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnNvbGUubG9nKCcgIEdldCBTdGFydGVkIGd1aWRlOicpO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCcgICAgUGxlYXNlIGhhdmUgYSBsb29rIGF0IHRoZSBnZXQgc3RhcnRlZCBndWlkZSEnKTtcbiAgY29uc29sZS5sb2coJyAgICBodHRwOi8vZG9jcy5wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvZ3VpZGUvJyk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coJycpO1xuICBjb25zb2xlLmxvZygnICBVc2FnZSB3aXRoIG5wbSBzdGFydCcpO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCcgICAgJCBucG0gc3RhcnQgLS0gcGF0aC90by9jb25maWcuanNvbicpO1xuICBjb25zb2xlLmxvZygnICAgICQgbnBtIHN0YXJ0IC0tIC0tYXBwSWQgQVBQX0lEIC0tbWFzdGVyS2V5IE1BU1RFUl9LRVkgLS1zZXJ2ZXJVUkwgc2VydmVyVVJMJyk7XG4gIGNvbnNvbGUubG9nKCcgICAgJCBucG0gc3RhcnQgLS0gLS1hcHBJZCBBUFBfSUQgLS1tYXN0ZXJLZXkgTUFTVEVSX0tFWSAtLXNlcnZlclVSTCBzZXJ2ZXJVUkwnKTtcbiAgY29uc29sZS5sb2coJycpO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCcgIFVzYWdlOicpO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCcgICAgJCBwYXJzZS1zZXJ2ZXIgcGF0aC90by9jb25maWcuanNvbicpO1xuICBjb25zb2xlLmxvZygnICAgICQgcGFyc2Utc2VydmVyIC0tIC0tYXBwSWQgQVBQX0lEIC0tbWFzdGVyS2V5IE1BU1RFUl9LRVkgLS1zZXJ2ZXJVUkwgc2VydmVyVVJMJyk7XG4gIGNvbnNvbGUubG9nKCcgICAgJCBwYXJzZS1zZXJ2ZXIgLS0gLS1hcHBJZCBBUFBfSUQgLS1tYXN0ZXJLZXkgTUFTVEVSX0tFWSAtLXNlcnZlclVSTCBzZXJ2ZXJVUkwnKTtcbiAgY29uc29sZS5sb2coJycpO1xufTtcblxucnVubmVyKHtcbiAgZGVmaW5pdGlvbnMsXG4gIGhlbHAsXG4gIHVzYWdlOiAnW29wdGlvbnNdIDxwYXRoL3RvL2NvbmZpZ3VyYXRpb24uanNvbj4nLFxuICBzdGFydDogZnVuY3Rpb24gKHByb2dyYW0sIG9wdGlvbnMsIGxvZ09wdGlvbnMpIHtcbiAgICBpZiAoIW9wdGlvbnMuYXBwSWQgfHwgIW9wdGlvbnMubWFzdGVyS2V5KSB7XG4gICAgICBwcm9ncmFtLm91dHB1dEhlbHAoKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJycpO1xuICAgICAgY29uc29sZS5lcnJvcignXFx1MDAxYlszMW1FUlJPUjogYXBwSWQgYW5kIG1hc3RlcktleSBhcmUgcmVxdWlyZWRcXHUwMDFiWzBtJyk7XG4gICAgICBjb25zb2xlLmVycm9yKCcnKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG5cbiAgICBpZiAob3B0aW9uc1snbGl2ZVF1ZXJ5LmNsYXNzTmFtZXMnXSkge1xuICAgICAgb3B0aW9ucy5saXZlUXVlcnkgPSBvcHRpb25zLmxpdmVRdWVyeSB8fCB7fTtcbiAgICAgIG9wdGlvbnMubGl2ZVF1ZXJ5LmNsYXNzTmFtZXMgPSBvcHRpb25zWydsaXZlUXVlcnkuY2xhc3NOYW1lcyddO1xuICAgICAgZGVsZXRlIG9wdGlvbnNbJ2xpdmVRdWVyeS5jbGFzc05hbWVzJ107XG4gICAgfVxuICAgIGlmIChvcHRpb25zWydsaXZlUXVlcnkucmVkaXNVUkwnXSkge1xuICAgICAgb3B0aW9ucy5saXZlUXVlcnkgPSBvcHRpb25zLmxpdmVRdWVyeSB8fCB7fTtcbiAgICAgIG9wdGlvbnMubGl2ZVF1ZXJ5LnJlZGlzVVJMID0gb3B0aW9uc1snbGl2ZVF1ZXJ5LnJlZGlzVVJMJ107XG4gICAgICBkZWxldGUgb3B0aW9uc1snbGl2ZVF1ZXJ5LnJlZGlzVVJMJ107XG4gICAgfVxuICAgIGlmIChvcHRpb25zWydsaXZlUXVlcnkucmVkaXNPcHRpb25zJ10pIHtcbiAgICAgIG9wdGlvbnMubGl2ZVF1ZXJ5ID0gb3B0aW9ucy5saXZlUXVlcnkgfHwge307XG4gICAgICBvcHRpb25zLmxpdmVRdWVyeS5yZWRpc09wdGlvbnMgPSBvcHRpb25zWydsaXZlUXVlcnkucmVkaXNPcHRpb25zJ107XG4gICAgICBkZWxldGUgb3B0aW9uc1snbGl2ZVF1ZXJ5LnJlZGlzT3B0aW9ucyddO1xuICAgIH1cblxuICAgIGlmIChvcHRpb25zLmNsdXN0ZXIpIHtcbiAgICAgIGNvbnN0IG51bUNQVXMgPSB0eXBlb2Ygb3B0aW9ucy5jbHVzdGVyID09PSAnbnVtYmVyJyA/IG9wdGlvbnMuY2x1c3RlciA6IG9zLmNwdXMoKS5sZW5ndGg7XG4gICAgICBpZiAoY2x1c3Rlci5pc01hc3Rlcikge1xuICAgICAgICBsb2dPcHRpb25zKCk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtQ1BVczsgaSsrKSB7XG4gICAgICAgICAgY2x1c3Rlci5mb3JrKCk7XG4gICAgICAgIH1cbiAgICAgICAgY2x1c3Rlci5vbignZXhpdCcsICh3b3JrZXIsIGNvZGUpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgd29ya2VyICR7d29ya2VyLnByb2Nlc3MucGlkfSBkaWVkICgke2NvZGV9KS4uLiBSZXN0YXJ0aW5nYCk7XG4gICAgICAgICAgY2x1c3Rlci5mb3JrKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgUGFyc2VTZXJ2ZXIuc3RhcnQob3B0aW9ucywgKCkgPT4ge1xuICAgICAgICAgIHByaW50U3VjY2Vzc01lc3NhZ2UoKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIFBhcnNlU2VydmVyLnN0YXJ0KG9wdGlvbnMsICgpID0+IHtcbiAgICAgICAgbG9nT3B0aW9ucygpO1xuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICAgIHByaW50U3VjY2Vzc01lc3NhZ2UoKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByaW50U3VjY2Vzc01lc3NhZ2UoKSB7XG4gICAgICBjb25zb2xlLmxvZygnWycgKyBwcm9jZXNzLnBpZCArICddIHBhcnNlLXNlcnZlciBydW5uaW5nIG9uICcgKyBvcHRpb25zLnNlcnZlclVSTCk7XG4gICAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwpIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgJ1snICtcbiAgICAgICAgICAgIHByb2Nlc3MucGlkICtcbiAgICAgICAgICAgICddIEdyYXBoUUwgcnVubmluZyBvbiBodHRwOi8vbG9jYWxob3N0OicgK1xuICAgICAgICAgICAgb3B0aW9ucy5wb3J0ICtcbiAgICAgICAgICAgIG9wdGlvbnMuZ3JhcGhRTFBhdGhcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAnWycgK1xuICAgICAgICAgICAgcHJvY2Vzcy5waWQgK1xuICAgICAgICAgICAgJ10gUGxheWdyb3VuZCBydW5uaW5nIG9uIGh0dHA6Ly9sb2NhbGhvc3Q6JyArXG4gICAgICAgICAgICBvcHRpb25zLnBvcnQgK1xuICAgICAgICAgICAgb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfSxcbn0pO1xuXG4vKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiJdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUxBO0FBT0EsTUFBTUEsSUFBSSxHQUFHLFlBQVk7RUFDdkJDLE9BQU8sQ0FBQ0MsR0FBUixDQUFZLHNCQUFaO0VBQ0FELE9BQU8sQ0FBQ0MsR0FBUixDQUFZLEVBQVo7RUFDQUQsT0FBTyxDQUFDQyxHQUFSLENBQVksa0RBQVo7RUFDQUQsT0FBTyxDQUFDQyxHQUFSLENBQVksdURBQVo7RUFDQUQsT0FBTyxDQUFDQyxHQUFSLENBQVksRUFBWjtFQUNBRCxPQUFPLENBQUNDLEdBQVIsQ0FBWSxFQUFaO0VBQ0FELE9BQU8sQ0FBQ0MsR0FBUixDQUFZLHdCQUFaO0VBQ0FELE9BQU8sQ0FBQ0MsR0FBUixDQUFZLEVBQVo7RUFDQUQsT0FBTyxDQUFDQyxHQUFSLENBQVksd0NBQVo7RUFDQUQsT0FBTyxDQUFDQyxHQUFS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