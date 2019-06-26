"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlUpload = require("graphql-upload");

var _node = _interopRequireDefault(require("parse/node"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _logger = _interopRequireDefault(require("../../logger"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const load = parseGraphQLSchema => {
  const fields = {};
  fields.create = {
    description: 'The create mutation can be used to create and upload a new file.',
    args: {
      file: {
        description: 'This is the new file to be created and uploaded',
        type: new _graphql.GraphQLNonNull(_graphqlUpload.GraphQLUpload)
      }
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.FILE_INFO),

    async resolve(_source, args, context) {
      try {
        const {
          file
        } = args;
        const {
          config
        } = context;
        const {
          createReadStream,
          filename,
          mimetype
        } = await file;
        let data = null;

        if (createReadStream) {
          const stream = createReadStream();
          data = await new Promise((resolve, reject) => {
            let data = '';
            stream.on('error', reject).on('data', chunk => data += chunk).on('end', () => resolve(data));
          });
        }

        if (!data || !data.length) {
          throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
        }

        if (filename.length > 128) {
          throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename too long.');
        }

        if (!filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
          throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
        }

        try {
          return await config.filesController.createFile(config, filename, data, mimetype);
        } catch (e) {
          _logger.default.error('Error creating a file: ', e);

          throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `Could not store file: ${filename}.`);
        }
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const filesMutation = new _graphql.GraphQLObjectType({
    name: 'FilesMutation',
    description: 'FilesMutation is the top level type for files mutations.',
    fields
  });
  parseGraphQLSchema.graphQLTypes.push(filesMutation);
  parseGraphQLSchema.graphQLMutations.files = {
    description: 'This is the top level for files mutations.',
    type: filesMutation,
    resolve: () => new Object()
  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImZpZWxkcyIsImNyZWF0ZSIsImRlc2NyaXB0aW9uIiwiYXJncyIsImZpbGUiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMVXBsb2FkIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkZJTEVfSU5GTyIsInJlc29sdmUiLCJfc291cmNlIiwiY29udGV4dCIsImNvbmZpZyIsImNyZWF0ZVJlYWRTdHJlYW0iLCJmaWxlbmFtZSIsIm1pbWV0eXBlIiwiZGF0YSIsInN0cmVhbSIsIlByb21pc2UiLCJyZWplY3QiLCJvbiIsImNodW5rIiwibGVuZ3RoIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsIklOVkFMSURfRklMRV9OQU1FIiwibWF0Y2giLCJmaWxlc0NvbnRyb2xsZXIiLCJjcmVhdGVGaWxlIiwiZSIsImxvZ2dlciIsImVycm9yIiwiaGFuZGxlRXJyb3IiLCJmaWxlc011dGF0aW9uIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJuYW1lIiwiZ3JhcGhRTFR5cGVzIiwicHVzaCIsImdyYXBoUUxNdXRhdGlvbnMiLCJmaWxlcyIsIk9iamVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDLFFBQU1DLE1BQU0sR0FBRyxFQUFmO0FBRUFBLEVBQUFBLE1BQU0sQ0FBQ0MsTUFBUCxHQUFnQjtBQUNkQyxJQUFBQSxXQUFXLEVBQ1Qsa0VBRlk7QUFHZEMsSUFBQUEsSUFBSSxFQUFFO0FBQ0pDLE1BQUFBLElBQUksRUFBRTtBQUNKRixRQUFBQSxXQUFXLEVBQUUsaURBRFQ7QUFFSkcsUUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CQyw0QkFBbkI7QUFGRjtB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LENBcEZEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE9iamVjdFR5cGUsIEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBHcmFwaFFMVXBsb2FkIH0gZnJvbSAnZ3JhcGhxbC11cGxvYWQnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgZmllbGRzID0ge307XG5cbiAgZmllbGRzLmNyZWF0ZSA9IHtcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgY3JlYXRlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhbmQgdXBsb2FkIGEgbmV3IGZpbGUuJyxcbiAgICBhcmdzOiB7XG4gICAgICBmaWxlOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IGZpbGUgdG8gYmUgY3JlYXRlZCBhbmQgdXBsb2FkZWQnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFVwbG9hZCksXG4gICAgICB9LFxuICAgIH0sXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTkZPKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmlsZSB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcgfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyBjcmVhdGVSZWFkU3RyZWFtLCBmaWxlbmFtZSwgbWltZXR5cGUgfSA9IGF3YWl0IGZpbGU7XG4gICAgICAgIGxldCBkYXRhID0gbnVsbDtcbiAgICAgICAgaWYgKGNyZWF0ZVJlYWRTdHJlYW0pIHtcbiAgICAgICAgICBjb25zdCBzdHJlYW0gPSBjcmVhdGVSZWFkU3RyZWFtKCk7XG4gICAgICAgICAgZGF0YSA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICAgICAgICBzdHJlYW1cbiAgICAgICAgICAgICAgLm9uKCdlcnJvcicsIHJlamVjdClcbiAgICAgICAgICAgICAgLm9uKCdkYXRhJywgY2h1bmsgPT4gKGRhdGEgKz0gY2h1bmspKVxuICAgICAgICAgICAgICAub24oJ2VuZCcsICgpID0+IHJlc29sdmUoZGF0YSkpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFkYXRhIHx8ICFkYXRhLmxlbmd0aCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUixcbiAgICAgICAgICAgICdJbnZhbGlkIGZpbGUgdXBsb2FkLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpbGVuYW1lLmxlbmd0aCA+IDEyOCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLFxuICAgICAgICAgICAgJ0ZpbGVuYW1lIHRvbyBsb25nLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFmaWxlbmFtZS5tYXRjaCgvXltfYS16QS1aMC05XVthLXpBLVowLTlAXFwuXFwgfl8tXSokLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSxcbiAgICAgICAgICAgICdGaWxlbmFtZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBhd2FpdCBjb25maWcuZmlsZXNDb250cm9sbGVyLmNyZWF0ZUZpbGUoXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBmaWxlbmFtZSxcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICBtaW1ldHlwZVxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGNyZWF0aW5nIGEgZmlsZTogJywgZSk7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgYENvdWxkIG5vdCBzdG9yZSBmaWxlOiAke2ZpbGVuYW1lfS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcblxuICBjb25zdCBmaWxlc011dGF0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICBuYW1lOiAnRmlsZXNNdXRhdGlvbicsXG4gICAgZGVzY3JpcHRpb246ICdGaWxlc011dGF0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgZmlsZXMgbXV0YXRpb25zLicsXG4gICAgZmllbGRzLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGZpbGVzTXV0YXRpb24pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMTXV0YXRpb25zLmZpbGVzID0ge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdG9wIGxldmVsIGZvciBmaWxlcyBtdXRhdGlvbnMuJyxcbiAgICB0eXBlOiBmaWxlc011dGF0aW9uLFxuICAgIHJlc29sdmU6ICgpID0+IG5ldyBPYmplY3QoKSxcbiAgfTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==