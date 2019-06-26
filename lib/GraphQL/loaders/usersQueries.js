"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const usersRouter = new _UsersRouter.default();

const load = parseGraphQLSchema => {
  const fields = {};
  fields.me = {
    description: 'The Me query can be used to return the current user data.',
    type: new _graphql.GraphQLNonNull(parseGraphQLSchema.meType),

    async resolve(_source, _args, context) {
      try {
        const {
          config,
          auth,
          info
        } = context;
        return (await usersRouter.handleMe({
          config,
          auth,
          info
        })).response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const usersQuery = new _graphql.GraphQLObjectType({
    name: 'UsersQuery',
    description: 'UsersQuery is the top level type for users queries.',
    fields
  });
  parseGraphQLSchema.graphQLTypes.push(usersQuery);
  parseGraphQLSchema.graphQLQueries.users = {
    description: 'This is the top level for users queries.',
    type: usersQuery,
    resolve: () => new Object()
  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNRdWVyaWVzLmpzIl0sIm5hbWVzIjpbInVzZXJzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiZmllbGRzIiwibWUiLCJkZXNjcmlwdGlvbiIsInR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIm1lVHlwZSIsInJlc29sdmUiLCJfc291cmNlIiwiX2FyZ3MiLCJjb250ZXh0IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJoYW5kbGVNZSIsInJlc3BvbnNlIiwiZSIsImhhbmRsZUVycm9yIiwidXNlcnNRdWVyeSIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImdyYXBoUUxUeXBlcyIsInB1c2giLCJncmFwaFFMUXVlcmllcyIsInVzZXJzIiwiT2JqZWN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7Ozs7QUFFQSxNQUFNQSxXQUFXLEdBQUcsSUFBSUMsb0JBQUosRUFBcEI7O0FBRUEsTUFBTUMsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQyxRQUFNQyxNQUFNLEdBQUcsRUFBZjtBQUVBQSxFQUFBQSxNQUFNLENBQUNDLEVBQVAsR0FBWTtBQUNWQyxJQUFBQSxXQUFXLEVBQUUsMkRBREg7QUFFVkMsSUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CTCxrQkFBa0IsQ0FBQ00sTUFBdEMsQ0FGSTs7QUFHVixVQUFNQyxPQUFOLENBQWNDLE9BQWQsRUFBdUJDLEtBQXZCLEVBQThCQyxPQUE5QixFQUF1QztBQUNyQyxVQUFJO0FBQ0YsY0FBTTtBQUFFQyxVQUFBQSxNQUFGO0FBQVVDLFVBQUFBLElBQVY7QUFBZ0JDLFVBQUFBO0FBQWhCLFlBQXlCSCxPQUEvQjtBQUNBLGVBQU8sQ0FBQyxNQUFNYixXQUFXLENBQUNpQixRQUFaLENBQXFCO0FBQUVILFVBQUFBLE1BQUY7QUFBVUMsVUFBQUEsSUFBVjtBQUFnQkMsVUFBQUE7QUFBaEIsU0FBckIsQ0FBUCxFQUFxREUsUUFBNUQ7QUFDRCxPQUhELENBR0UsT0FBT0MsQ0FBUCxFQUFVO0FBQ1ZoQixRQUFBQSxrQkFBa0IsQ0FBQ2lCLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7O0FBVlMsR0FBWjtBQWFBLFFBQU1FLFVBQVUsR0FBRyxJQUFJQywwQkFBSixDQUFzQjtBQUN2Q0MsSUFBQUEsSUFBSSxFQUFFLFlBRGlDO0FBRXZDakIsSUFBQUEsV0FBVyxFQUFFLHFEQUYwQjtBQUd2Q0YsSUFBQUE7QUFIdUMsR0FBdEIsQ0FBbkI7QUFLQUQsRUFBQUEsa0JBQWtCLENBQUNxQixZQUFuQixDQUFnQ0MsSUFBaEMsQ0FBcUNKLFVBQXJDO0FBRUFsQixFQUFBQSxrQkFBa0IsQ0FBQ3VCLGNBQW5CLENBQWtDQyxLQUFsQyxHQUEwQztBQUN4Q3JCLElBQUFBLFdBQVcsRUFBRSwwQ0FEMkI7QUFFeENDLElBQUFBLElBQUksRUFBRWMsVUFGa0M7QUFHeENYLElBQUFBLE9BQU8sRUFBRSxNQUFNLElBQUlrQixNQUFKO0FBSHlCLEdBQTFDO0FBS0QsQ0E1QkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTE9iamVjdFR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuLi8uLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcblxuY29uc3QgdXNlcnNSb3V0ZXIgPSBuZXcgVXNlcnNSb3V0ZXIoKTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGNvbnN0IGZpZWxkcyA9IHt9O1xuXG4gIGZpZWxkcy5tZSA9IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBNZSBxdWVyeSBjYW4gYmUgdXNlZCB0byByZXR1cm4gdGhlIGN1cnJlbnQgdXNlciBkYXRhLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS5tZVR5cGUpLFxuICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgX2FyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICByZXR1cm4gKGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZU1lKHsgY29uZmlnLCBhdXRoLCBpbmZvIH0pKS5yZXNwb25zZTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgdXNlcnNRdWVyeSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogJ1VzZXJzUXVlcnknLFxuICAgIGRlc2NyaXB0aW9uOiAnVXNlcnNRdWVyeSBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHVzZXJzIHF1ZXJpZXMuJyxcbiAgICBmaWVsZHMsXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2godXNlcnNRdWVyeSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxRdWVyaWVzLnVzZXJzID0ge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdG9wIGxldmVsIGZvciB1c2VycyBxdWVyaWVzLicsXG4gICAgdHlwZTogdXNlcnNRdWVyeSxcbiAgICByZXNvbHZlOiAoKSA9PiBuZXcgT2JqZWN0KCksXG4gIH07XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=