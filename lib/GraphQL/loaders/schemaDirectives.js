"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.definitions = void 0;
var _graphqlTag = _interopRequireDefault(require("graphql-tag"));
var _utils = require("@graphql-tools/utils");
var _FunctionsRouter = require("../../Routers/FunctionsRouter");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const definitions = (0, _graphqlTag.default)`
  directive @resolve(to: String) on FIELD_DEFINITION
  directive @mock(with: Any!) on FIELD_DEFINITION
`;
exports.definitions = definitions;
const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;
  class ResolveDirectiveVisitor extends _utils.SchemaDirectiveVisitor {
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
  class MockDirectiveVisitor extends _utils.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = () => {
        return this.args.with;
      };
    }
  }
  parseGraphQLSchema.graphQLSchemaDirectives.mock = MockDirectiveVisitor;
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbFRhZyIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX3V0aWxzIiwiX0Z1bmN0aW9uc1JvdXRlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiZGVmaW5pdGlvbnMiLCJncWwiLCJleHBvcnRzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMiLCJSZXNvbHZlRGlyZWN0aXZlVmlzaXRvciIsIlNjaGVtYURpcmVjdGl2ZVZpc2l0b3IiLCJ2aXNpdEZpZWxkRGVmaW5pdGlvbiIsImZpZWxkIiwicmVzb2x2ZSIsIl9zb3VyY2UiLCJhcmdzIiwiY29udGV4dCIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwiZnVuY3Rpb25OYW1lIiwibmFtZSIsInRvIiwiRnVuY3Rpb25zUm91dGVyIiwiaGFuZGxlQ2xvdWRGdW5jdGlvbiIsInBhcmFtcyIsImJvZHkiLCJyZXNwb25zZSIsInJlc3VsdCIsImUiLCJoYW5kbGVFcnJvciIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzIiwiTW9ja0RpcmVjdGl2ZVZpc2l0b3IiLCJ3aXRoIiwibW9jayJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZ3FsIGZyb20gJ2dyYXBocWwtdGFnJztcbmltcG9ydCB7IFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IgfSBmcm9tICdAZ3JhcGhxbC10b29scy91dGlscyc7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuLi8uLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5cbmV4cG9ydCBjb25zdCBkZWZpbml0aW9ucyA9IGdxbGBcbiAgZGlyZWN0aXZlIEByZXNvbHZlKHRvOiBTdHJpbmcpIG9uIEZJRUxEX0RFRklOSVRJT05cbiAgZGlyZWN0aXZlIEBtb2NrKHdpdGg6IEFueSEpIG9uIEZJRUxEX0RFRklOSVRJT05cbmA7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyA9IGRlZmluaXRpb25zO1xuXG4gIGNsYXNzIFJlc29sdmVEaXJlY3RpdmVWaXNpdG9yIGV4dGVuZHMgU2NoZW1hRGlyZWN0aXZlVmlzaXRvciB7XG4gICAgdmlzaXRGaWVsZERlZmluaXRpb24oZmllbGQpIHtcbiAgICAgIGZpZWxkLnJlc29sdmUgPSBhc3luYyAoX3NvdXJjZSwgYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgbGV0IGZ1bmN0aW9uTmFtZSA9IGZpZWxkLm5hbWU7XG4gICAgICAgICAgaWYgKHRoaXMuYXJncy50bykge1xuICAgICAgICAgICAgZnVuY3Rpb25OYW1lID0gdGhpcy5hcmdzLnRvO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICBhd2FpdCBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRGdW5jdGlvbih7XG4gICAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgIGZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBib2R5OiBhcmdzLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICApLnJlc3BvbnNlLnJlc3VsdDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMucmVzb2x2ZSA9IFJlc29sdmVEaXJlY3RpdmVWaXNpdG9yO1xuXG4gIGNsYXNzIE1vY2tEaXJlY3RpdmVWaXNpdG9yIGV4dGVuZHMgU2NoZW1hRGlyZWN0aXZlVmlzaXRvciB7XG4gICAgdmlzaXRGaWVsZERlZmluaXRpb24oZmllbGQpIHtcbiAgICAgIGZpZWxkLnJlc29sdmUgPSAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmFyZ3Mud2l0aDtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzLm1vY2sgPSBNb2NrRGlyZWN0aXZlVmlzaXRvcjtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsV0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsTUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsZ0JBQUEsR0FBQUYsT0FBQTtBQUFnRSxTQUFBRCx1QkFBQUksR0FBQSxXQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLEtBQUFFLE9BQUEsRUFBQUYsR0FBQTtBQUV6RCxNQUFNRyxXQUFXLEdBQUcsSUFBQUMsbUJBQUcsQ0FBQztBQUMvQjtBQUNBO0FBQ0EsQ0FBQztBQUFDQyxPQUFBLENBQUFGLFdBQUEsR0FBQUEsV0FBQTtBQUVGLE1BQU1HLElBQUksR0FBR0Msa0JBQWtCLElBQUk7RUFDakNBLGtCQUFrQixDQUFDQyxrQ0FBa0MsR0FBR0wsV0FBVztFQUVuRSxNQUFNTSx1QkFBdUIsU0FBU0MsNkJBQXNCLENBQUM7SUFDM0RDLG9CQUFvQkEsQ0FBQ0MsS0FBSyxFQUFFO01BQzFCQSxLQUFLLENBQUNDLE9BQU8sR0FBRyxPQUFPQyxPQUFPLEVBQUVDLElBQUksRUFBRUMsT0FBTyxLQUFLO1FBQ2hELElBQUk7VUFDRixNQUFNO1lBQUVDLE1BQU07WUFBRUMsSUFBSTtZQUFFQztVQUFLLENBQUMsR0FBR0gsT0FBTztVQUV0QyxJQUFJSSxZQUFZLEdBQUdSLEtBQUssQ0FBQ1MsSUFBSTtVQUM3QixJQUFJLElBQUksQ0FBQ04sSUFBSSxDQUFDTyxFQUFFLEVBQUU7WUFDaEJGLFlBQVksR0FBRyxJQUFJLENBQUNMLElBQUksQ0FBQ08sRUFBRTtVQUM3QjtVQUVBLE9BQU8sQ0FDTCxNQUFNQyxnQ0FBZSxDQUFDQyxtQkFBbUIsQ0FBQztZQUN4Q0MsTUFBTSxFQUFFO2NBQ05MO1lBQ0YsQ0FBQztZQUNESCxNQUFNO1lBQ05DLElBQUk7WUFDSkMsSUFBSTtZQUNKTyxJQUFJLEVBQUVYO1VBQ1IsQ0FBQyxDQUFDLEVBQ0ZZLFFBQVEsQ0FBQ0MsTUFBTTtRQUNuQixDQUFDLENBQUMsT0FBT0MsQ0FBQyxFQUFFO1VBQ1Z0QixrQkFBa0IsQ0FBQ3VCLFdBQVcsQ0FBQ0QsQ0FBQyxDQUFDO1FBQ25DO01BQ0YsQ0FBQztJQUNIO0VBQ0Y7RUFFQXRCLGtCQUFrQixDQUFDd0IsdUJBQXVCLENBQUNsQixPQUFPLEdBQUdKLHVCQUF1QjtFQUU1RSxNQUFNdUIsb0JBQW9CLFNBQVN0Qiw2QkFBc0IsQ0FBQztJQUN4REMsb0JBQW9CQSxDQUFDQyxLQUFLLEVBQUU7TUFDMUJBLEtBQUssQ0FBQ0MsT0FBTyxHQUFHLE1BQU07UUFDcEIsT0FBTyxJQUFJLENBQUNFLElBQUksQ0FBQ2tCLElBQUk7TUFDdkIsQ0FBQztJQUNIO0VBQ0Y7RUFFQTFCLGtCQUFrQixDQUFDd0IsdUJBQXVCLENBQUNHLElBQUksR0FBR0Ysb0JBQW9CO0FBQ3hFLENBQUM7QUFBQzNCLE9BQUEsQ0FBQUMsSUFBQSxHQUFBQSxJQUFBIn0=