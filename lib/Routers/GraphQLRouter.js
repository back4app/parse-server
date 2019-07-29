"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GraphQLRouter = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const GraphQLConfigPath = '/graphql-config';

class GraphQLRouter extends _PromiseRouter.default {
  async getGraphQLConfig(req) {
    const result = await req.config.parseGraphQLController.getGraphQLConfig();
    return {
      response: result
    };
  }

  async updateGraphQLConfig(req) {
    if (req.auth.isReadOnly) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to update the GraphQL config.");
    }

    const data = await req.config.parseGraphQLController.updateGraphQLConfig(req.body.params);
    return {
      response: data
    };
  }

  mountRoutes() {
    this.route('GET', GraphQLConfigPath, middleware.promiseEnforceMasterKeyAccess, req => {
      return this.getGraphQLConfig(req);
    });
    this.route('PUT', GraphQLConfigPath, middleware.promiseEnforceMasterKeyAccess, req => {
      return this.updateGraphQLConfig(req);
    });
  }

}

exports.GraphQLRouter = GraphQLRouter;
var _default = GraphQLRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXIuanMiXSwibmFtZXMiOlsiR3JhcGhRTENvbmZpZ1BhdGgiLCJHcmFwaFFMUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsImdldEdyYXBoUUxDb25maWciLCJyZXEiLCJyZXN1bHQiLCJjb25maWciLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwicmVzcG9uc2UiLCJ1cGRhdGVHcmFwaFFMQ29uZmlnIiwiYXV0aCIsImlzUmVhZE9ubHkiLCJQYXJzZSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImRhdGEiLCJib2R5IiwicGFyYW1zIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7Ozs7QUFFQSxNQUFNQSxpQkFBaUIsR0FBRyxpQkFBMUI7O0FBRU8sTUFBTUMsYUFBTixTQUE0QkMsc0JBQTVCLENBQTBDO0FBQy9DLFFBQU1DLGdCQUFOLENBQXVCQyxHQUF2QixFQUE0QjtBQUMxQixVQUFNQyxNQUFNLEdBQUcsTUFBTUQsR0FBRyxDQUFDRSxNQUFKLENBQVdDLHNCQUFYLENBQWtDSixnQkFBbEMsRUFBckI7QUFDQSxXQUFPO0FBQ0xLLE1BQUFBLFFBQVEsRUFBRUg7QUFETCxLQUFQO0FBR0Q7O0FBRUQsUUFBTUksbUJBQU4sQ0FBMEJMLEdBQTFCLEVBQStCO0FBQzdCLFFBQUlBLEdBQUcsQ0FBQ00sSUFBSixDQUFTQyxVQUFiLEVBQXlCO0FBQ3ZCLFlBQU0sSUFBSUMsY0FBTUMsS0FBVixDQUNKRCxjQUFNQyxLQUFOLENBQVlDLG1CQURSLEVBRUosaUVBRkksQ0FBTjtBQUlEOztBQUNELFVBQU1DLElBQUksR0FBRyxNQUFNWCxHQUFHLENBQUNFLE1BQUosQ0FBV0Msc0JBQVgsQ0FBa0NFLG1CQUFsQyxDQUNqQkwsR0FBRyxDQUFDWSxJQUFKLENBQVNDLE1BRFEsQ0FBbkI7QUFHQSxXQUFPO0FBQ0xULE1BQUFBLFFBQVEsRUFBRU87QUFETCxLQUFQO0FBR0Q7O0FBRURHLEVBQUFBLFdBQVcsR0FBRztBQUNaLFNBQUtDLEtBQUwsQ0FDRSxLQURGLEVBRUVuQixpQkFGRixFQUdFb0IsVUFBVSxDQUFDQyw2QkFIYixFQUlFakIsR0FBRyxJQUFJO0FBQ0wsYUFBTyxLQUFLRCxnQkFBTCxDQUFzQkMsR0FBdEIsQ0FBUDtBQUNELEtBTkg7QUFRQSxTQUFLZSxLQUFMLENBQ0UsS0FERixFQUVFbkIsaUJBRkYsRUFHRW9CLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRWpCLEdBQUcsSUFBSTtBQUNMLGFBQU8sS0FBS0ssbUJBQUwsQ0FBeUJMLEdBQXpCLENBQVA7QUFDRCxLQU5IO0FBUUQ7O0FBeEM4Qzs7O2VBMkNsQ0gsYSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5cbmNvbnN0IEdyYXBoUUxDb25maWdQYXRoID0gJy9ncmFwaHFsLWNvbmZpZyc7XG5cbmV4cG9ydCBjbGFzcyBHcmFwaFFMUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIGFzeW5jIGdldEdyYXBoUUxDb25maWcocmVxKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcmVxLmNvbmZpZy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKTtcbiAgICByZXR1cm4ge1xuICAgICAgcmVzcG9uc2U6IHJlc3VsdCxcbiAgICB9O1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlR3JhcGhRTENvbmZpZyhyZXEpIHtcbiAgICBpZiAocmVxLmF1dGguaXNSZWFkT25seSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byB1cGRhdGUgdGhlIEdyYXBoUUwgY29uZmlnLlwiXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVxLmNvbmZpZy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLnVwZGF0ZUdyYXBoUUxDb25maWcoXG4gICAgICByZXEuYm9keS5wYXJhbXNcbiAgICApO1xuICAgIHJldHVybiB7XG4gICAgICByZXNwb25zZTogZGF0YSxcbiAgICB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgR3JhcGhRTENvbmZpZ1BhdGgsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0R3JhcGhRTENvbmZpZyhyZXEpO1xuICAgICAgfVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQVVQnLFxuICAgICAgR3JhcGhRTENvbmZpZ1BhdGgsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMudXBkYXRlR3JhcGhRTENvbmZpZyhyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgR3JhcGhRTFJvdXRlcjtcbiJdfQ==