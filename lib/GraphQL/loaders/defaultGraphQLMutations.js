"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var objectsMutations = _interopRequireWildcard(require("./objectsMutations"));

var filesMutations = _interopRequireWildcard(require("./filesMutations"));

var usersMutations = _interopRequireWildcard(require("./usersMutations"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

const load = parseGraphQLSchema => {
  objectsMutations.load(parseGraphQLSchema);
  filesMutations.load(parseGraphQLSchema);
  usersMutations.load(parseGraphQLSchema);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsIm9iamVjdHNNdXRhdGlvbnMiLCJmaWxlc011dGF0aW9ucyIsInVzZXJzTXV0YXRpb25zIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDQyxFQUFBQSxnQkFBZ0IsQ0FBQ0YsSUFBakIsQ0FBc0JDLGtCQUF0QjtBQUNBRSxFQUFBQSxjQUFjLENBQUNILElBQWYsQ0FBb0JDLGtCQUFwQjtBQUNBRyxFQUFBQSxjQUFjLENBQUNKLElBQWYsQ0FBb0JDLGtCQUFwQjtBQUNELENBSkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4vb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBmaWxlc011dGF0aW9ucyBmcm9tICcuL2ZpbGVzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIHVzZXJzTXV0YXRpb25zIGZyb20gJy4vdXNlcnNNdXRhdGlvbnMnO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgb2JqZWN0c011dGF0aW9ucy5sb2FkKHBhcnNlR3JhcGhRTFNjaGVtYSk7XG4gIGZpbGVzTXV0YXRpb25zLmxvYWQocGFyc2VHcmFwaFFMU2NoZW1hKTtcbiAgdXNlcnNNdXRhdGlvbnMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19