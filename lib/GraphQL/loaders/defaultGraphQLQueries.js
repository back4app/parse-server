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
  parseGraphQLSchema.graphQLQueries.health = {
    description: 'The health query can be used to check if the server is up and running.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean),
    resolve: () => true
  };
  objectsQueries.load(parseGraphQLSchema);
  usersQueries.load(parseGraphQLSchema);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMUXVlcmllcyIsImhlYWx0aCIsImRlc2NyaXB0aW9uIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiR3JhcGhRTEJvb2xlYW4iLCJyZXNvbHZlIiwib2JqZWN0c1F1ZXJpZXMiLCJ1c2Vyc1F1ZXJpZXMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7OztBQUVBLE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakNBLEVBQUFBLGtCQUFrQixDQUFDQyxjQUFuQixDQUFrQ0MsTUFBbEMsR0FBMkM7QUFDekNDLElBQUFBLFdBQVcsRUFDVCx3RUFGdUM7QUFHekNDLElBQUFBLElBQUksRUFBRSxJQUFJQyx1QkFBSixDQUFtQkMsdUJBQW5CLENBSG1DO0FBSXpDQyxJQUFBQSxPQUFPLEVBQUUsTUFBTTtBQUowQixHQUEzQztBQU9BQyxFQUFBQSxjQUFjLENBQUNULElBQWYsQ0FBb0JDLGtCQUFwQjtBQUNBUyxFQUFBQSxZQUFZLENBQUNWLElBQWIsQ0FBa0JDLGtCQUFsQjtBQUNELENBVkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTEJvb2xlYW4gfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4vb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgdXNlcnNRdWVyaWVzIGZyb20gJy4vdXNlcnNRdWVyaWVzJztcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMUXVlcmllcy5oZWFsdGggPSB7XG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGhlYWx0aCBxdWVyeSBjYW4gYmUgdXNlZCB0byBjaGVjayBpZiB0aGUgc2VydmVyIGlzIHVwIGFuZCBydW5uaW5nLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICByZXNvbHZlOiAoKSA9PiB0cnVlLFxuICB9O1xuXG4gIG9iamVjdHNRdWVyaWVzLmxvYWQocGFyc2VHcmFwaFFMU2NoZW1hKTtcbiAgdXNlcnNRdWVyaWVzLmxvYWQocGFyc2VHcmFwaFFMU2NoZW1hKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==