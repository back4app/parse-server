"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var objectsQueries = _interopRequireWildcard(require("./objectsQueries"));

var usersQueries = _interopRequireWildcard(require("./usersQueries"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLQuery('health', {
    description: 'The health query can be used to check if the server is up and running.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean),
    resolve: () => true
  }, true, true);
  objectsQueries.load(parseGraphQLSchema);
  usersQueries.load(parseGraphQLSchema);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsInR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkdyYXBoUUxCb29sZWFuIiwicmVzb2x2ZSIsIm9iamVjdHNRdWVyaWVzIiwidXNlcnNRdWVyaWVzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDQSxFQUFBQSxrQkFBa0IsQ0FBQ0MsZUFBbkIsQ0FDRSxRQURGLEVBRUU7QUFDRUMsSUFBQUEsV0FBVyxFQUNULHdFQUZKO0FBR0VDLElBQUFBLElBQUksRUFBRSxJQUFJQyx1QkFBSixDQUFtQkMsdUJBQW5CLENBSFI7QUFJRUMsSUFBQUEsT0FBTyxFQUFFLE1BQU07QUFKakIsR0FGRixFQVFFLElBUkYsRUFTRSxJQVRGO0FBWUFDLEVBQUFBLGNBQWMsQ0FBQ1IsSUFBZixDQUFvQkMsa0JBQXBCO0FBQ0FRLEVBQUFBLFlBQVksQ0FBQ1QsSUFBYixDQUFrQkMsa0JBQWxCO0FBQ0QsQ0FmRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMQm9vbGVhbiB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgKiBhcyB1c2Vyc1F1ZXJpZXMgZnJvbSAnLi91c2Vyc1F1ZXJpZXMnO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShcbiAgICAnaGVhbHRoJyxcbiAgICB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoZSBoZWFsdGggcXVlcnkgY2FuIGJlIHVzZWQgdG8gY2hlY2sgaWYgdGhlIHNlcnZlciBpcyB1cCBhbmQgcnVubmluZy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIHJlc29sdmU6ICgpID0+IHRydWUsXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBvYmplY3RzUXVlcmllcy5sb2FkKHBhcnNlR3JhcGhRTFNjaGVtYSk7XG4gIHVzZXJzUXVlcmllcy5sb2FkKHBhcnNlR3JhcGhRTFNjaGVtYSk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=