"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AggregateRouter = void 0;

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _rest = _interopRequireDefault(require("../rest"));

var middleware = _interopRequireWildcard(require("../middlewares"));

var _node = _interopRequireDefault(require("parse/node"));

var _UsersRouter = _interopRequireDefault(require("./UsersRouter"));

var _Deprecator = _interopRequireDefault(require("../Deprecator/Deprecator"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class AggregateRouter extends _ClassesRouter.default {
  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter.default.JSONFromQuery(req.query));
    const options = {};

    if (body.distinct) {
      options.distinct = String(body.distinct);
    }

    if (body.hint) {
      options.hint = body.hint;
      delete body.hint;
    }

    if (body.explain) {
      options.explain = body.explain;
      delete body.explain;
    }

    if (body.readPreference) {
      options.readPreference = body.readPreference;
      delete body.readPreference;
    }

    options.pipeline = AggregateRouter.getPipeline(body);

    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }

    return _rest.default.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK, req.info.context).then(response => {
      for (const result of response.results) {
        if (typeof result === 'object') {
          _UsersRouter.default.removeHiddenProperties(result);
        }
      }

      return {
        response
      };
    });
  }
  /* Builds a pipeline from the body. Originally the body could be passed as a single object,
   * and now we support many options
   *
   * Array
   *
   * body: [{
   *   group: { objectId: '$name' },
   * }]
   *
   * Object
   *
   * body: {
   *   group: { objectId: '$name' },
   * }
   *
   *
   * Pipeline Operator with an Array or an Object
   *
   * body: {
   *   pipeline: {
   *     group: { objectId: '$name' },
   *   }
   * }
   *
   */


  static getPipeline(body) {
    let pipeline = body.pipeline || body;

    if (!Array.isArray(pipeline)) {
      pipeline = Object.keys(pipeline).map(key => {
        return {
          [key]: pipeline[key]
        };
      });
    }

    return pipeline.map(stage => {
      const keys = Object.keys(stage);

      if (keys.length != 1) {
        throw new Error(`Pipeline stages should only have one key found ${keys.join(', ')}`);
      }

      return AggregateRouter.transformStage(keys[0], stage);
    });
  }

  static transformStage(stageName, stage) {
    if (stageName === 'group') {
      if (Object.prototype.hasOwnProperty.call(stage[stageName], 'objectId')) {
        _Deprecator.default.logRuntimeDeprecation({
          usage: 'The use of objectId in aggregation stage $group',
          solution: 'Use _id instead.'
        });

        stage[stageName]._id = stage[stageName].objectId;
        delete stage[stageName].objectId;
      }

      if (!Object.prototype.hasOwnProperty.call(stage[stageName], '_id')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. Missing key _id`);
      }
    }

    if (stageName[0] !== '$') {
      _Deprecator.default.logRuntimeDeprecation({
        usage: "Using aggregation stages without a leading '$'",
        solution: `Try $${stageName} instead.`
      });
    }

    const key = stageName[0] === '$' ? stageName : `$${stageName}`;
    return {
      [key]: stage[stageName]
    };
  }

  mountRoutes() {
    this.route('GET', '/aggregate/:className', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleFind(req);
    });
  }

}

exports.AggregateRouter = AggregateRouter;
var _default = AggregateRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJBZ2dyZWdhdGVSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiaGFuZGxlRmluZCIsInJlcSIsImJvZHkiLCJPYmplY3QiLCJhc3NpZ24iLCJKU09ORnJvbVF1ZXJ5IiwicXVlcnkiLCJvcHRpb25zIiwiZGlzdGluY3QiLCJTdHJpbmciLCJoaW50IiwiZXhwbGFpbiIsInJlYWRQcmVmZXJlbmNlIiwicGlwZWxpbmUiLCJnZXRQaXBlbGluZSIsIndoZXJlIiwiSlNPTiIsInBhcnNlIiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwiaW5mbyIsImNsaWVudFNESyIsImNvbnRleHQiLCJ0aGVuIiwicmVzcG9uc2UiLCJyZXN1bHQiLCJyZXN1bHRzIiwiVXNlcnNSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiQXJyYXkiLCJpc0FycmF5Iiwia2V5cyIsIm1hcCIsImtleSIsInN0YWdlIiwibGVuZ3RoIiwiRXJyb3IiLCJqb2luIiwidHJhbnNmb3JtU3RhZ2UiLCJzdGFnZU5hbWUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsIl9pZCIsIm9iamVjdElkIiwiUGFyc2UiLCJJTlZBTElEX1FVRVJZIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuL1VzZXJzUm91dGVyJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4uL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5cbmV4cG9ydCBjbGFzcyBBZ2dyZWdhdGVSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgaGFuZGxlRmluZChyZXEpIHtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmFzc2lnbihyZXEuYm9keSwgQ2xhc3Nlc1JvdXRlci5KU09ORnJvbVF1ZXJ5KHJlcS5xdWVyeSkpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBpZiAoYm9keS5kaXN0aW5jdCkge1xuICAgICAgb3B0aW9ucy5kaXN0aW5jdCA9IFN0cmluZyhib2R5LmRpc3RpbmN0KTtcbiAgICB9XG4gICAgaWYgKGJvZHkuaGludCkge1xuICAgICAgb3B0aW9ucy5oaW50ID0gYm9keS5oaW50O1xuICAgICAgZGVsZXRlIGJvZHkuaGludDtcbiAgICB9XG4gICAgaWYgKGJvZHkuZXhwbGFpbikge1xuICAgICAgb3B0aW9ucy5leHBsYWluID0gYm9keS5leHBsYWluO1xuICAgICAgZGVsZXRlIGJvZHkuZXhwbGFpbjtcbiAgICB9XG4gICAgaWYgKGJvZHkucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIG9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSBib2R5LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgZGVsZXRlIGJvZHkucmVhZFByZWZlcmVuY2U7XG4gICAgfVxuICAgIG9wdGlvbnMucGlwZWxpbmUgPSBBZ2dyZWdhdGVSb3V0ZXIuZ2V0UGlwZWxpbmUoYm9keSk7XG4gICAgaWYgKHR5cGVvZiBib2R5LndoZXJlID09PSAnc3RyaW5nJykge1xuICAgICAgYm9keS53aGVyZSA9IEpTT04ucGFyc2UoYm9keS53aGVyZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgIHRoaXMuY2xhc3NOYW1lKHJlcSksXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qIEJ1aWxkcyBhIHBpcGVsaW5lIGZyb20gdGhlIGJvZHkuIE9yaWdpbmFsbHkgdGhlIGJvZHkgY291bGQgYmUgcGFzc2VkIGFzIGEgc2luZ2xlIG9iamVjdCxcbiAgICogYW5kIG5vdyB3ZSBzdXBwb3J0IG1hbnkgb3B0aW9uc1xuICAgKlxuICAgKiBBcnJheVxuICAgKlxuICAgKiBib2R5OiBbe1xuICAgKiAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqIH1dXG4gICAqXG4gICAqIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfVxuICAgKlxuICAgKlxuICAgKiBQaXBlbGluZSBPcGVyYXRvciB3aXRoIGFuIEFycmF5IG9yIGFuIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgcGlwZWxpbmU6IHtcbiAgICogICAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqICAgfVxuICAgKiB9XG4gICAqXG4gICAqL1xuICBzdGF0aWMgZ2V0UGlwZWxpbmUoYm9keSkge1xuICAgIGxldCBwaXBlbGluZSA9IGJvZHkucGlwZWxpbmUgfHwgYm9keTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICBwaXBlbGluZSA9IE9iamVjdC5rZXlzKHBpcGVsaW5lKS5tYXAoa2V5ID0+IHtcbiAgICAgICAgcmV0dXJuIHsgW2tleV06IHBpcGVsaW5lW2tleV0gfTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwaXBlbGluZS5tYXAoc3RhZ2UgPT4ge1xuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHN0YWdlKTtcbiAgICAgIGlmIChrZXlzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUGlwZWxpbmUgc3RhZ2VzIHNob3VsZCBvbmx5IGhhdmUgb25lIGtleSBmb3VuZCAke2tleXMuam9pbignLCAnKX1gKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBBZ2dyZWdhdGVSb3V0ZXIudHJhbnNmb3JtU3RhZ2Uoa2V5c1swXSwgc3RhZ2UpO1xuICAgIH0pO1xuICB9XG5cbiAgc3RhdGljIHRyYW5zZm9ybVN0YWdlKHN0YWdlTmFtZSwgc3RhZ2UpIHtcbiAgICBpZiAoc3RhZ2VOYW1lID09PSAnZ3JvdXAnKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlW3N0YWdlTmFtZV0sICdvYmplY3RJZCcpKSB7XG4gICAgICAgIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICAgICAgICB1c2FnZTogJ1RoZSB1c2Ugb2Ygb2JqZWN0SWQgaW4gYWdncmVnYXRpb24gc3RhZ2UgJGdyb3VwJyxcbiAgICAgICAgICBzb2x1dGlvbjogJ1VzZSBfaWQgaW5zdGVhZC4nLFxuICAgICAgICB9KTtcbiAgICAgICAgc3RhZ2Vbc3RhZ2VOYW1lXS5faWQgPSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgc3RhZ2Vbc3RhZ2VOYW1lXS5vYmplY3RJZDtcbiAgICAgIH1cbiAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlW3N0YWdlTmFtZV0sICdfaWQnKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW52YWxpZCBwYXJhbWV0ZXIgZm9yIHF1ZXJ5OiBncm91cC4gTWlzc2luZyBrZXkgX2lkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdGFnZU5hbWVbMF0gIT09ICckJykge1xuICAgICAgRGVwcmVjYXRvci5sb2dSdW50aW1lRGVwcmVjYXRpb24oe1xuICAgICAgICB1c2FnZTogXCJVc2luZyBhZ2dyZWdhdGlvbiBzdGFnZXMgd2l0aG91dCBhIGxlYWRpbmcgJyQnXCIsXG4gICAgICAgIHNvbHV0aW9uOiBgVHJ5ICQke3N0YWdlTmFtZX0gaW5zdGVhZC5gLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGtleSA9IHN0YWdlTmFtZVswXSA9PT0gJyQnID8gc3RhZ2VOYW1lIDogYCQke3N0YWdlTmFtZX1gO1xuICAgIHJldHVybiB7IFtrZXldOiBzdGFnZVtzdGFnZU5hbWVdIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2FnZ3JlZ2F0ZS86Y2xhc3NOYW1lJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBZ2dyZWdhdGVSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxlQUFOLFNBQThCQyxzQkFBOUIsQ0FBNEM7RUFDakRD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