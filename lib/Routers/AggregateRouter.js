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

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const BASE_KEYS = ['where', 'distinct', 'pipeline'];
const PIPELINE_KEYS = ['addFields', 'bucket', 'bucketAuto', 'collStats', 'count', 'currentOp', 'facet', 'geoNear', 'graphLookup', 'group', 'indexStats', 'limit', 'listLocalSessions', 'listSessions', 'lookup', 'match', 'out', 'project', 'redact', 'replaceRoot', 'sample', 'skip', 'sort', 'sortByCount', 'unwind'];
const ALLOWED_KEYS = [...BASE_KEYS, ...PIPELINE_KEYS];

class AggregateRouter extends _ClassesRouter.default {
  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter.default.JSONFromQuery(req.query));
    const options = {};

    if (body.distinct) {
      options.distinct = String(body.distinct);
    }

    options.pipeline = AggregateRouter.getPipeline(body);

    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }

    return _rest.default.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK).then(response => {
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
    if (ALLOWED_KEYS.indexOf(stageName) === -1) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: ${stageName}`);
    }

    if (stageName === 'group') {
      if (Object.prototype.hasOwnProperty.call(stage[stageName], '_id')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. Please use objectId instead of _id`);
      }

      if (!Object.prototype.hasOwnProperty.call(stage[stageName], 'objectId')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. objectId is required`);
      }

      stage[stageName]._id = stage[stageName].objectId;
      delete stage[stageName].objectId;
    }

    return {
      [`$${stageName}`]: stage[stageName]
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJCQVNFX0tFWVMiLCJQSVBFTElORV9LRVlTIiwiQUxMT1dFRF9LRVlTIiwiQWdncmVnYXRlUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImhhbmRsZUZpbmQiLCJyZXEiLCJib2R5IiwiT2JqZWN0IiwiYXNzaWduIiwiSlNPTkZyb21RdWVyeSIsInF1ZXJ5Iiwib3B0aW9ucyIsImRpc3RpbmN0IiwiU3RyaW5nIiwicGlwZWxpbmUiLCJnZXRQaXBlbGluZSIsIndoZXJlIiwiSlNPTiIsInBhcnNlIiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwiaW5mbyIsImNsaWVudFNESyIsInRoZW4iLCJyZXNwb25zZSIsInJlc3VsdCIsInJlc3VsdHMiLCJVc2Vyc1JvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJBcnJheSIsImlzQXJyYXkiLCJrZXlzIiwibWFwIiwia2V5Iiwic3RhZ2UiLCJsZW5ndGgiLCJFcnJvciIsImpvaW4iLCJ0cmFuc2Zvcm1TdGFnZSIsInN0YWdlTmFtZSIsImluZGV4T2YiLCJQYXJzZSIsIklOVkFMSURfUVVFUlkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJfaWQiLCJvYmplY3RJZCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7O0FBRUEsTUFBTUEsU0FBUyxHQUFHLENBQUMsT0FBRCxFQUFVLFVBQVYsRUFBc0IsVUFBdEIsQ0FBbEI7QUFFQSxNQUFNQyxhQUFhLEdBQUcsQ0FDcEIsV0FEb0IsRUFFcEIsUUFGb0IsRUFHcEIsWUFIb0IsRUFJcEIsV0FKb0IsRUFLcEIsT0FMb0IsRUFNcEIsV0FOb0IsRUFPcEIsT0FQ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O0FBQTFCLEtBQVA7QUFDRDs7QUFFRFMsRUFBQUEsV0FBVyxHQUFHO0FBQ1osU0FBS0MsS0FBTCxDQUNFLEtBREYsRUFFRSx1QkFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUVqRCxHQUFHLElBQUk7QUFDTCxhQUFPLEtBQUtELFVBQUwsQ0FBZ0JDLEdBQWhCLENBQVA7QUFDRCxLQU5IO0FBUUQ7O0FBakhnRDs7O2VBb0hwQ0gsZSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFVzZXJzUm91dGVyIGZyb20gJy4vVXNlcnNSb3V0ZXInO1xuXG5jb25zdCBCQVNFX0tFWVMgPSBbJ3doZXJlJywgJ2Rpc3RpbmN0JywgJ3BpcGVsaW5lJ107XG5cbmNvbnN0IFBJUEVMSU5FX0tFWVMgPSBbXG4gICdhZGRGaWVsZHMnLFxuICAnYnVja2V0JyxcbiAgJ2J1Y2tldEF1dG8nLFxuICAnY29sbFN0YXRzJyxcbiAgJ2NvdW50JyxcbiAgJ2N1cnJlbnRPcCcsXG4gICdmYWNldCcsXG4gICdnZW9OZWFyJyxcbiAgJ2dyYXBoTG9va3VwJyxcbiAgJ2dyb3VwJyxcbiAgJ2luZGV4U3RhdHMnLFxuICAnbGltaXQnLFxuICAnbGlzdExvY2FsU2Vzc2lvbnMnLFxuICAnbGlzdFNlc3Npb25zJyxcbiAgJ2xvb2t1cCcsXG4gICdtYXRjaCcsXG4gICdvdXQnLFxuICAncHJvamVjdCcsXG4gICdyZWRhY3QnLFxuICAncmVwbGFjZVJvb3QnLFxuICAnc2FtcGxlJyxcbiAgJ3NraXAnLFxuICAnc29ydCcsXG4gICdzb3J0QnlDb3VudCcsXG4gICd1bndpbmQnLFxuXTtcblxuY29uc3QgQUxMT1dFRF9LRVlTID0gWy4uLkJBU0VfS0VZUywgLi4uUElQRUxJTkVfS0VZU107XG5cbmV4cG9ydCBjbGFzcyBBZ2dyZWdhdGVSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgaGFuZGxlRmluZChyZXEpIHtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHJlcS5ib2R5LFxuICAgICAgQ2xhc3Nlc1JvdXRlci5KU09ORnJvbVF1ZXJ5KHJlcS5xdWVyeSlcbiAgICApO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBpZiAoYm9keS5kaXN0aW5jdCkge1xuICAgICAgb3B0aW9ucy5kaXN0aW5jdCA9IFN0cmluZyhib2R5LmRpc3RpbmN0KTtcbiAgICB9XG4gICAgb3B0aW9ucy5waXBlbGluZSA9IEFnZ3JlZ2F0ZVJvdXRlci5nZXRQaXBlbGluZShib2R5KTtcbiAgICBpZiAodHlwZW9mIGJvZHkud2hlcmUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBib2R5LndoZXJlID0gSlNPTi5wYXJzZShib2R5LndoZXJlKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgdGhpcy5jbGFzc05hbWUocmVxKSxcbiAgICAgICAgYm9keS53aGVyZSxcbiAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLXG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3BvbnNlLnJlc3VsdHMpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2UgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyogQnVpbGRzIGEgcGlwZWxpbmUgZnJvbSB0aGUgYm9keS4gT3JpZ2luYWxseSB0aGUgYm9keSBjb3VsZCBiZSBwYXNzZWQgYXMgYSBzaW5nbGUgb2JqZWN0LFxuICAgKiBhbmQgbm93IHdlIHN1cHBvcnQgbWFueSBvcHRpb25zXG4gICAqXG4gICAqIEFycmF5XG4gICAqXG4gICAqIGJvZHk6IFt7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfV1cbiAgICpcbiAgICogT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBncm91cDogeyBvYmplY3RJZDogJyRuYW1lJyB9LFxuICAgKiB9XG4gICAqXG4gICAqXG4gICAqIFBpcGVsaW5lIE9wZXJhdG9yIHdpdGggYW4gQXJyYXkgb3IgYW4gT2JqZWN0XG4gICAqXG4gICAqIGJvZHk6IHtcbiAgICogICBwaXBlbGluZToge1xuICAgKiAgICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogICB9XG4gICAqIH1cbiAgICpcbiAgICovXG4gIHN0YXRpYyBnZXRQaXBlbGluZShib2R5KSB7XG4gICAgbGV0IHBpcGVsaW5lID0gYm9keS5waXBlbGluZSB8fCBib2R5O1xuXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcGlwZWxpbmUgPSBPYmplY3Qua2V5cyhwaXBlbGluZSkubWFwKGtleSA9PiB7XG4gICAgICAgIHJldHVybiB7IFtrZXldOiBwaXBlbGluZVtrZXldIH07XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGlwZWxpbmUubWFwKHN0YWdlID0+IHtcbiAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzdGFnZSk7XG4gICAgICBpZiAoa2V5cy5sZW5ndGggIT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYFBpcGVsaW5lIHN0YWdlcyBzaG91bGQgb25seSBoYXZlIG9uZSBrZXkgZm91bmQgJHtrZXlzLmpvaW4oJywgJyl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIEFnZ3JlZ2F0ZVJvdXRlci50cmFuc2Zvcm1TdGFnZShrZXlzWzBdLCBzdGFnZSk7XG4gICAgfSk7XG4gIH1cblxuICBzdGF0aWMgdHJhbnNmb3JtU3RhZ2Uoc3RhZ2VOYW1lLCBzdGFnZSkge1xuICAgIGlmIChBTExPV0VEX0tFWVMuaW5kZXhPZihzdGFnZU5hbWUpID09PSAtMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICBgSW52YWxpZCBwYXJhbWV0ZXIgZm9yIHF1ZXJ5OiAke3N0YWdlTmFtZX1gXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoc3RhZ2VOYW1lID09PSAnZ3JvdXAnKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlW3N0YWdlTmFtZV0sICdfaWQnKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW52YWxpZCBwYXJhbWV0ZXIgZm9yIHF1ZXJ5OiBncm91cC4gUGxlYXNlIHVzZSBvYmplY3RJZCBpbnN0ZWFkIG9mIF9pZGBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlW3N0YWdlTmFtZV0sICdvYmplY3RJZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBvYmplY3RJZCBpcyByZXF1aXJlZGBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHN0YWdlW3N0YWdlTmFtZV0uX2lkID0gc3RhZ2Vbc3RhZ2VOYW1lXS5vYmplY3RJZDtcbiAgICAgIGRlbGV0ZSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgIH1cbiAgICByZXR1cm4geyBbYCQke3N0YWdlTmFtZX1gXTogc3RhZ2Vbc3RhZ2VOYW1lXSB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgJy9hZ2dyZWdhdGUvOmNsYXNzTmFtZScsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQWdncmVnYXRlUm91dGVyO1xuIl19