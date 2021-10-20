'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushQueue = undefined;

var _ParseMessageQueue = require('../ParseMessageQueue');

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _utils = require('./utils');

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const PUSH_CHANNEL = 'parse-server-push';
const DEFAULT_BATCH_SIZE = 100;

class PushQueue {

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config = {}) {
    this.channel = config.channel || PushQueue.defaultPushChannel();
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.parsePublisher = _ParseMessageQueue.ParseMessageQueue.createPublisher(config);
  }

  static defaultPushChannel() {
    return `${_node2.default.applicationId}-${PUSH_CHANNEL}`;
  }

  enqueue(body, where, config, auth, pushStatus) {
    const limit = this.batchSize;

    where = (0, _utils.applyDeviceTokenExists)(where);

    // Order by objectId so no impact on the DB
    // const order = 'objectId';
    return Promise.resolve().then(() => {
      return _rest2.default.find(config, auth, '_Installation', where, { limit: 0, count: true });
    }).then(({ results, count }) => {
      if (!results || count == 0) {
        return pushStatus.complete();
      }
      const maxPages = Math.ceil(count / limit);
      pushStatus.setRunning(maxPages);
      // while (page < maxPages) {
      // changes request/limit/orderBy by id range intervals for better performance
      // https://docs.mongodb.com/manual/reference/method/cursor.skip/
      // Range queries can use indexes to avoid scanning unwanted documents,
      // typically yielding better performance as the offset grows compared
      // to using cursor.skip() for pagination.
      const query = { where };

      const pushWorkItem = {
        body,
        query,
        maxPages,
        pushStatus: { objectId: pushStatus.objectId },
        applicationId: config.applicationId
      };
      const publishResult = Promise.resolve(this.parsePublisher.publish(this.channel, JSON.stringify(pushWorkItem)));
      return publishResult.then(reponse => {
        const result = reponse.data || reponse;
        _logger2.default.info(`All ${maxPages} packages were enqueued for PushStatus ${pushStatus.objectId}`, result);
        return result;
      });
    }).catch(err => {
      _logger2.default.info(`Can't count installations for PushStatus ${pushStatus.objectId}: ${err.message}`);
      throw err;
    });
  }
}
exports.PushQueue = PushQueue;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9QdXNoL1B1c2hRdWV1ZS5qcyJdLCJuYW1lcyI6WyJQVVNIX0NIQU5ORUwiLCJERUZBVUxUX0JBVENIX1NJWkUiLCJQdXNoUXVldWUiLCJjb25zdHJ1Y3RvciIsImNvbmZpZyIsImNoYW5uZWwiLCJkZWZhdWx0UHVzaENoYW5uZWwiLCJiYXRjaFNpemUiLCJwYXJzZVB1Ymxpc2hlciIsIlBhcnNlTWVzc2FnZVF1ZXVlIiwiY3JlYXRlUHVibGlzaGVyIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwiZW5xdWV1ZSIsImJvZHkiLCJ3aGVyZSIsImF1dGgiLCJwdXNoU3RhdHVzIiwibGltaXQiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJyZXN0IiwiZmluZCIsImNvdW50IiwicmVzdWx0cyIsImNvbXBsZXRlIiwibWF4UGFnZXMiLCJNYXRoIiwiY2VpbCIsInNldFJ1bm5pbmciLCJxdWVyeSIsInB1c2hXb3JrSXRlbSIsIm9iamVjdElkIiwicHVibGlzaFJlc3VsdCIsInB1Ymxpc2giLCJKU09OIiwic3RyaW5naWZ5IiwicmVwb25zZSIsInJlc3VsdCIsImRhdGEiLCJsb2ciLCJpbmZvIiwiY2F0Y2giLCJlcnIiLCJtZXNzYWdlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7Ozs7QUFDQTs7QUFDQTs7OztBQUNBOzs7Ozs7QUFFQSxNQUFNQSxlQUFlLG1CQUFyQjtBQUNBLE1BQU1DLHFCQUFxQixHQUEzQjs7QUFFTyxNQUFNQyxTQUFOLENBQWdCOztBQUtyQjtBQUNBO0FBQ0FDLGNBQVlDLFNBQWMsRUFBMUIsRUFBOEI7QUFDNUIsU0FBS0MsT0FBTCxHQUFlRCxPQUFPQyxPQUFQLElBQWtCSCxVQUFVSSxrQkFBVixFQUFqQztBQUNBLFNBQUtDLFNBQUwsR0FBaUJILE9BQU9HLFNBQVAsSUFBb0JOLGtCQUFyQztBQUNBLFNBQUtPLGNBQUwsR0FBc0JDLHFDQUFrQkMsZUFBbEIsQ0FBa0NOLE1BQWxDLENBQXRCO0FBQ0Q7O0FBRUQsU0FBT0Usa0JBQVAsR0FBNEI7QUFDMUIsV0FBUSxHQUFFSyxlQUFNQyxhQUFjLElBQUdaLFlBQWEsRUFBOUM7QUFDRDs7QUFFRGEsVUFBUUMsSUFBUixFQUFjQyxLQUFkLEVBQXFCWCxNQUFyQixFQUE2QlksSUFBN0IsRUFBbUNDLFVBQW5DLEVBQStDO0FBQzdDLFVBQU1DLFFBQVEsS0FBS1gsU0FBbkI7O0FBRUFRLFlBQVEsbUNBQXVCQSxLQUF2QixDQUFSOztBQUVBO0FBQ0E7QUFDQSxXQUFPSSxRQUFRQyxPQUFSLEdBQWtCQyxJQUFsQixDQUF1QixNQUFNO0FBQ2xDLGFBQU9DLGVBQUtDLElBQUwsQ0FBVW5CLE1BQVYsRUFDTFksSUFESyxFQUVMLGVBRkssRUFHTEQsS0FISyxFQUlMLEVBQUNHLE9BQU8sQ0FBUixFQUFXTSxPQUFPLElBQWxCLEVBSkssQ0FBUDtBQUtELEtBTk0sRUFNSkgsSUFOSSxDQU1DLENBQUMsRUFBQ0ksT0FBRCxFQUFVRCxLQUFWLEVBQUQsS0FBc0I7QUFDNUIsVUFBSSxDQUFDQyxPQUFELElBQVlELFNBQVMsQ0FBekIsRUFBNEI7QUFDMUIsZUFBT1AsV0FBV1MsUUFBWCxFQUFQO0FBQ0Q7QUFDRCxZQUFNQyxXQUFXQyxLQUFLQyxJQUFMLENBQVVMLFFBQVFOLEtBQWxCLENBQWpCO0FBQ0FELGlCQUFXYSxVQUFYLENBQXNCSCxRQUF0QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFlBQU1JLFFBQVEsRUFBRWhCLEtBQUYsRUFBZDs7QUFFQSxZQUFNaUIsZUFBZTtBQUNuQmxCLFlBRG1CO0FBRW5CaUIsYUFGbUI7QUFHbkJKLGdCQUhtQjtBQUluQlYsb0JBQVksRUFBRWdCLFVBQVVoQixXQUFXZ0IsUUFBdkIsRUFKTztBQUtuQnJCLHVCQUFlUixPQUFPUTtBQUxILE9BQXJCO0FBT0EsWUFBTXNCLGdCQUFnQmYsUUFBUUMsT0FBUixDQUFnQixLQUFLWixjQUFMLENBQW9CMkIsT0FBcEIsQ0FBNEIsS0FBSzlCLE9BQWpDLEVBQTBDK0IsS0FBS0MsU0FBTCxDQUFlTCxZQUFmLENBQTFDLENBQWhCLENBQXRCO0FBQ0EsYUFBT0UsY0FBY2IsSUFBZCxDQUFtQmlCLFdBQVc7QUFDbkMsY0FBTUMsU0FBU0QsUUFBUUUsSUFBUixJQUFnQkYsT0FBL0I7QUFDQUcseUJBQUlDLElBQUosQ0FBVSxPQUFNZixRQUFTLDBDQUF5Q1YsV0FBV2dCLFFBQVMsRUFBdEYsRUFBeUZNLE1BQXpGO0FBQ0EsZUFBT0EsTUFBUDtBQUNELE9BSk0sQ0FBUDtBQUtELEtBakNNLEVBaUNKSSxLQWpDSSxDQWlDRUMsT0FBTztBQUNkSCx1QkFBSUMsSUFBSixDQUFVLDRDQUEyQ3pCLFdBQVdnQixRQUFTLEtBQUlXLElBQUlDLE9BQVEsRUFBekY7QUFDQSxZQUFNRCxHQUFOO0FBQ0QsS0FwQ00sQ0FBUDtBQXFDRDtBQTdEb0I7UUFBVjFDLFMsR0FBQUEsUyIsImZpbGUiOiJQdXNoUXVldWUuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQYXJzZU1lc3NhZ2VRdWV1ZSB9ICAgICAgZnJvbSAnLi4vUGFyc2VNZXNzYWdlUXVldWUnO1xuaW1wb3J0IHJlc3QgICAgICAgICAgICAgICAgICAgICAgIGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IHsgYXBwbHlEZXZpY2VUb2tlbkV4aXN0cyB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IGxvZyBmcm9tICcuLi9sb2dnZXInO1xuXG5jb25zdCBQVVNIX0NIQU5ORUwgPSAncGFyc2Utc2VydmVyLXB1c2gnO1xuY29uc3QgREVGQVVMVF9CQVRDSF9TSVpFID0gMTAwO1xuXG5leHBvcnQgY2xhc3MgUHVzaFF1ZXVlIHtcbiAgcGFyc2VQdWJsaXNoZXI6IE9iamVjdDtcbiAgY2hhbm5lbDogU3RyaW5nO1xuICBiYXRjaFNpemU6IE51bWJlcjtcblxuICAvLyBjb25maWcgb2JqZWN0IG9mIHRoZSBwdWJsaXNoZXIsIHJpZ2h0IG5vdyBpdCBvbmx5IGNvbnRhaW5zIHRoZSByZWRpc1VSTCxcbiAgLy8gYnV0IHdlIG1heSBleHRlbmQgaXQgbGF0ZXIuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLmNoYW5uZWwgPSBjb25maWcuY2hhbm5lbCB8fCBQdXNoUXVldWUuZGVmYXVsdFB1c2hDaGFubmVsKCk7XG4gICAgdGhpcy5iYXRjaFNpemUgPSBjb25maWcuYmF0Y2hTaXplIHx8IERFRkFVTFRfQkFUQ0hfU0laRTtcbiAgICB0aGlzLnBhcnNlUHVibGlzaGVyID0gUGFyc2VNZXNzYWdlUXVldWUuY3JlYXRlUHVibGlzaGVyKGNvbmZpZyk7XG4gIH1cblxuICBzdGF0aWMgZGVmYXVsdFB1c2hDaGFubmVsKCkge1xuICAgIHJldHVybiBgJHtQYXJzZS5hcHBsaWNhdGlvbklkfS0ke1BVU0hfQ0hBTk5FTH1gO1xuICB9XG5cbiAgZW5xdWV1ZShib2R5LCB3aGVyZSwgY29uZmlnLCBhdXRoLCBwdXNoU3RhdHVzKSB7XG4gICAgY29uc3QgbGltaXQgPSB0aGlzLmJhdGNoU2l6ZTtcblxuICAgIHdoZXJlID0gYXBwbHlEZXZpY2VUb2tlbkV4aXN0cyh3aGVyZSk7XG5cbiAgICAvLyBPcmRlciBieSBvYmplY3RJZCBzbyBubyBpbXBhY3Qgb24gdGhlIERCXG4gICAgLy8gY29uc3Qgb3JkZXIgPSAnb2JqZWN0SWQnO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiByZXN0LmZpbmQoY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICAnX0luc3RhbGxhdGlvbicsXG4gICAgICAgIHdoZXJlLFxuICAgICAgICB7bGltaXQ6IDAsIGNvdW50OiB0cnVlfSk7XG4gICAgfSkudGhlbigoe3Jlc3VsdHMsIGNvdW50fSkgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzIHx8IGNvdW50ID09IDApIHtcbiAgICAgICAgcmV0dXJuIHB1c2hTdGF0dXMuY29tcGxldGUoKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG1heFBhZ2VzID0gTWF0aC5jZWlsKGNvdW50IC8gbGltaXQpXG4gICAgICBwdXNoU3RhdHVzLnNldFJ1bm5pbmcobWF4UGFnZXMpO1xuICAgICAgLy8gd2hpbGUgKHBhZ2UgPCBtYXhQYWdlcykge1xuICAgICAgLy8gY2hhbmdlcyByZXF1ZXN0L2xpbWl0L29yZGVyQnkgYnkgaWQgcmFuZ2UgaW50ZXJ2YWxzIGZvciBiZXR0ZXIgcGVyZm9ybWFuY2VcbiAgICAgIC8vIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL21ldGhvZC9jdXJzb3Iuc2tpcC9cbiAgICAgIC8vIFJhbmdlIHF1ZXJpZXMgY2FuIHVzZSBpbmRleGVzIHRvIGF2b2lkIHNjYW5uaW5nIHVud2FudGVkIGRvY3VtZW50cyxcbiAgICAgIC8vIHR5cGljYWxseSB5aWVsZGluZyBiZXR0ZXIgcGVyZm9ybWFuY2UgYXMgdGhlIG9mZnNldCBncm93cyBjb21wYXJlZFxuICAgICAgLy8gdG8gdXNpbmcgY3Vyc29yLnNraXAoKSBmb3IgcGFnaW5hdGlvbi5cbiAgICAgIGNvbnN0IHF1ZXJ5ID0geyB3aGVyZSB9O1xuXG4gICAgICBjb25zdCBwdXNoV29ya0l0ZW0gPSB7XG4gICAgICAgIGJvZHksXG4gICAgICAgIHF1ZXJ5LFxuICAgICAgICBtYXhQYWdlcyxcbiAgICAgICAgcHVzaFN0YXR1czogeyBvYmplY3RJZDogcHVzaFN0YXR1cy5vYmplY3RJZCB9LFxuICAgICAgICBhcHBsaWNhdGlvbklkOiBjb25maWcuYXBwbGljYXRpb25JZFxuICAgICAgfVxuICAgICAgY29uc3QgcHVibGlzaFJlc3VsdCA9IFByb21pc2UucmVzb2x2ZSh0aGlzLnBhcnNlUHVibGlzaGVyLnB1Ymxpc2godGhpcy5jaGFubmVsLCBKU09OLnN0cmluZ2lmeShwdXNoV29ya0l0ZW0pKSlcbiAgICAgIHJldHVybiBwdWJsaXNoUmVzdWx0LnRoZW4ocmVwb25zZSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHJlcG9uc2UuZGF0YSB8fCByZXBvbnNlXG4gICAgICAgIGxvZy5pbmZvKGBBbGwgJHttYXhQYWdlc30gcGFja2FnZXMgd2VyZSBlbnF1ZXVlZCBmb3IgUHVzaFN0YXR1cyAke3B1c2hTdGF0dXMub2JqZWN0SWR9YCwgcmVzdWx0KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfSlcbiAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgbG9nLmluZm8oYENhbid0IGNvdW50IGluc3RhbGxhdGlvbnMgZm9yIFB1c2hTdGF0dXMgJHtwdXNoU3RhdHVzLm9iamVjdElkfTogJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgIHRocm93IGVyclxuICAgIH0pO1xuICB9XG59XG4iXX0=