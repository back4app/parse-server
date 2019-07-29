"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.definitions = void 0;

var _graphqlTag = _interopRequireDefault(require("graphql-tag"));

var _graphqlTools = require("graphql-tools");

var _FunctionsRouter = require("../../Routers/FunctionsRouter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const definitions = _graphqlTag.default`
  directive @namespace on FIELD_DEFINITION
  directive @resolve(to: String) on FIELD_DEFINITION
  directive @mock(with: Any!) on FIELD_DEFINITION
`;
exports.definitions = definitions;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;

  class NamespaceDirectiveVisitor extends _graphqlTools.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = () => ({});
    }

  }

  parseGraphQLSchema.graphQLSchemaDirectives.namespace = NamespaceDirectiveVisitor;

  class ResolveDirectiveVisitor extends _graphqlTools.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = async (_source, args, context) => {
        try {
          const {
            config,
            auth,
            info
          } = context;
          let functionName = field.name;

          if (this.args.to) {
            functionName = this.args.to;
          }

          return (await _FunctionsRouter.FunctionsRouter.handleCloudFunction({
            params: {
              functionName
            },
            config,
            auth,
            info,
            body: args
          })).response.result;
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      };
    }

  }

  parseGraphQLSchema.graphQLSchemaDirectives.resolve = ResolveDirectiveVisitor;

  class MockDirectiveVisitor extends _graphqlTools.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = () => {
        return this.args.with;
      };
    }

  }

  parseGraphQLSchema.graphQLSchemaDirectives.mock = MockDirectiveVisitor;
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcy5qcyJdLCJuYW1lcyI6WyJkZWZpbml0aW9ucyIsImdxbCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiTmFtZXNwYWNlRGlyZWN0aXZlVmlzaXRvciIsIlNjaGVtYURpcmVjdGl2ZVZpc2l0b3IiLCJ2aXNpdEZpZWxkRGVmaW5pdGlvbiIsImZpZWxkIiwicmVzb2x2ZSIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzIiwibmFtZXNwYWNlIiwiUmVzb2x2ZURpcmVjdGl2ZVZpc2l0b3IiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsImZ1bmN0aW9uTmFtZSIsIm5hbWUiLCJ0byIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iLCJwYXJhbXMiLCJib2R5IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJlIiwiaGFuZGxlRXJyb3IiLCJNb2NrRGlyZWN0aXZlVmlzaXRvciIsIndpdGgiLCJtb2NrIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7QUFFTyxNQUFNQSxXQUFXLEdBQUdDLG1CQUFJOzs7O0NBQXhCOzs7QUFNUCxNQUFNQyxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDQSxFQUFBQSxrQkFBa0IsQ0FBQ0Msa0NBQW5CLEdBQXdESixXQUF4RDs7QUFFQSxRQUFNSyx5QkFBTixTQUF3Q0Msb0NBQXhDLENBQStEO0FBQzdEQyxJQUFBQSxvQkFBb0IsQ0FBQ0MsS0FBRCxFQUFRO0FBQzFCQSxNQUFBQSxLQUFLLENBQUNDLE9BQU4sR0FBZ0IsT0FBTyxFQUFQLENBQWhCO0FBQ0Q7O0FBSDREOztBQU0vRE4sRUFBQUEsa0JBQWtCLENBQUNPLHVCQUFuQixDQUEyQ0MsU0FBM0MsR0FBdUROLHlCQUF2RDs7QUFFQSxRQUFNTyx1QkFBTixTQUFzQ04sb0NBQXRDLENBQTZEO0FBQzNEQyxJQUFBQSxvQkFBb0IsQ0FBQ0MsS0FBRCxFQUFRO0FBQzFCQSxNQUFBQSxLQUFLLENBQUNDLE9BQU4sR0FBZ0IsT0FBT0ksT0FBUCxFQUFnQkMsSUFBaEIsRUFBc0JDLE9BQXRCLEtBQWtDO0FBQ2hELFlBQUk7QUFDRixnQkFBTTtBQUFFQyxZQUFBQSxNQUFGO0FBQVVDLFlBQUFBLElBQVY7QUFBZ0JDLFlBQUFBO0FBQWhCLGNBQXlCSCxPQUEvQjtBQUVBLGNBQUlJLFlBQVksR0FBR1gsS0FBSyxDQUFDWSxJQUF6Qjs7QUFDQSxjQUFJLEtBQUtOLElBQUwsQ0FBVU8sRUFBZCxFQUFrQjtBQUNoQkYsWUFBQUEsWUFBWSxHQUFHLEtBQUtMLElBQUwsQ0FBVU8sRUFBekI7QUFDRDs7QUFFRCxpQkFBTyxDQUFDLE1BQU1DLGlDQUFnQkMsbUJBQWhCLENBQW9DO0FBQ2hEQyxZQUFBQSxNQUFNLEVBQUU7QUFDTkwsY0FBQUE7QUFETSxhQUR3QztBQUloREgsWUFBQUEsTUFKZ0Q7QUFLaERDLFlBQUFBLElBTGdEO0FBTWhEQyxZQUFBQSxJQU5nRDtBQU9oRE8sWUFBQUEsSUFBSSxFQUFFWDtBQVAwQyxXQUFwQyxDQUFQLEVBUUhZLFFBUkcsQ0FRTUMsTUFSYjtBQVNELFNBakJELENBaUJFLE9BQU9DLENBQVAsRUFBVTtBQUNWekIsVUFBQUEsa0JBQWtCLENBQUMwQixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGLE9BckJEO0FBc0JEOztBQXhCMEQ7O0FBMkI3RHpCLEVBQUFBLGtCQUFrQixDQUFDTyx1QkFBbkIsQ0FBMkNELE9BQTNDLEdBQXFERyx1QkFBckQ7O0FBRUEsUUFBTWtCLG9CQUFOLFNBQW1DeEIsb0NBQW5DLENBQTBEO0FBQ3hEQyxJQUFBQSxvQkFBb0IsQ0FBQ0MsS0FBRCxFQUFRO0FBQzFCQSxNQUFBQSxLQUFLLENBQUNDLE9BQU4sR0FBZ0IsTUFBTTtBQUNwQixlQUFPLEtBQUtLLElBQUwsQ0FBVWlCLElBQWpCO0FBQ0QsT0FGRDtBQUdEOztBQUx1RDs7QUFRMUQ1QixFQUFBQSxrQkFBa0IsQ0FBQ08sdUJBQW5CLENBQTJDc0IsSUFBM0MsR0FBa0RGLG9CQUFsRDtBQUNELENBakREIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGdxbCBmcm9tICdncmFwaHFsLXRhZyc7XG5pbXBvcnQgeyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIH0gZnJvbSAnZ3JhcGhxbC10b29scyc7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuLi8uLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5cbmV4cG9ydCBjb25zdCBkZWZpbml0aW9ucyA9IGdxbGBcbiAgZGlyZWN0aXZlIEBuYW1lc3BhY2Ugb24gRklFTERfREVGSU5JVElPTlxuICBkaXJlY3RpdmUgQHJlc29sdmUodG86IFN0cmluZykgb24gRklFTERfREVGSU5JVElPTlxuICBkaXJlY3RpdmUgQG1vY2sod2l0aDogQW55ISkgb24gRklFTERfREVGSU5JVElPTlxuYDtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zID0gZGVmaW5pdGlvbnM7XG5cbiAgY2xhc3MgTmFtZXNwYWNlRGlyZWN0aXZlVmlzaXRvciBleHRlbmRzIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3Ige1xuICAgIHZpc2l0RmllbGREZWZpbml0aW9uKGZpZWxkKSB7XG4gICAgICBmaWVsZC5yZXNvbHZlID0gKCkgPT4gKHt9KTtcbiAgICB9XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMubmFtZXNwYWNlID0gTmFtZXNwYWNlRGlyZWN0aXZlVmlzaXRvcjtcblxuICBjbGFzcyBSZXNvbHZlRGlyZWN0aXZlVmlzaXRvciBleHRlbmRzIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3Ige1xuICAgIHZpc2l0RmllbGREZWZpbml0aW9uKGZpZWxkKSB7XG4gICAgICBmaWVsZC5yZXNvbHZlID0gYXN5bmMgKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGxldCBmdW5jdGlvbk5hbWUgPSBmaWVsZC5uYW1lO1xuICAgICAgICAgIGlmICh0aGlzLmFyZ3MudG8pIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uTmFtZSA9IHRoaXMuYXJncy50bztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gKGF3YWl0IEZ1bmN0aW9uc1JvdXRlci5oYW5kbGVDbG91ZEZ1bmN0aW9uKHtcbiAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICBmdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBib2R5OiBhcmdzLFxuICAgICAgICAgIH0pKS5yZXNwb25zZS5yZXN1bHQ7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzLnJlc29sdmUgPSBSZXNvbHZlRGlyZWN0aXZlVmlzaXRvcjtcblxuICBjbGFzcyBNb2NrRGlyZWN0aXZlVmlzaXRvciBleHRlbmRzIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3Ige1xuICAgIHZpc2l0RmllbGREZWZpbml0aW9uKGZpZWxkKSB7XG4gICAgICBmaWVsZC5yZXNvbHZlID0gKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5hcmdzLndpdGg7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcy5tb2NrID0gTW9ja0RpcmVjdGl2ZVZpc2l0b3I7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=