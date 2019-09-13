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

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation('createFile', {
    description: 'The create mutation can be used to create and upload a new file.',
    args: {
      upload: {
        description: 'This is the new file to be created and uploaded',
        type: new _graphql.GraphQLNonNull(_graphqlUpload.GraphQLUpload)
      }
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.FILE_INFO),

    async resolve(_source, args, context) {
      try {
        const {
          upload
        } = args;
        const {
          config
        } = context;
        const {
          createReadStream,
          filename,
          mimetype
        } = await upload;
        let data = null;

        if (createReadStream) {
          const stream = createReadStream();
          data = await new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('error', reject).on('data', chunk => chunks.push(chunk)).on('end', () => resolve(Buffer.concat(chunks)));
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

  }, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImRlc2NyaXB0aW9uIiwiYXJncyIsInVwbG9hZCIsInR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkdyYXBoUUxVcGxvYWQiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiRklMRV9JTkZPIiwicmVzb2x2ZSIsIl9zb3VyY2UiLCJjb250ZXh0IiwiY29uZmlnIiwiY3JlYXRlUmVhZFN0cmVhbSIsImZpbGVuYW1lIiwibWltZXR5cGUiLCJkYXRhIiwic3RyZWFtIiwiUHJvbWlzZSIsInJlamVjdCIsImNodW5rcyIsIm9uIiwiY2h1bmsiLCJwdXNoIiwiQnVmZmVyIiwiY29uY2F0IiwibGVuZ3RoIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsIklOVkFMSURfRklMRV9OQU1FIiwibWF0Y2giLCJmaWxlc0NvbnRyb2xsZXIiLCJjcmVhdGVGaWxlIiwiZSIsImxvZ2dlciIsImVycm9yIiwiaGFuZGxlRXJyb3IiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDQSxFQUFBQSxrQkFBa0IsQ0FBQ0Msa0JBQW5CLENBQ0UsWUFERixFQUVFO0FBQ0VDLElBQUFBLFdBQVcsRUFDVCxrRUFGSjtBQUdFQyxJQUFBQSxJQUFJLEVBQUU7QUFDSkMsTUFBQUEsTUFBTSxFQUFFO0FBQ05GLFFBQUFBLFdBQVcsRUFBRSxpREFEUDtBQUVORyxRQUFBQSxJQUFJLEVBQUUsSUFBSUMsdUJBQUosQ0FBbUJDLDRCQUFuQjtBQUZBO0FBREosS0FIUjtBQVNFRixJQUFBQSxJQUFJLEVBQUUsSUFBSUMsdUJBQUosQ0FBbUJFLG1CQUFtQixDQUFDQyxTQUF2QyxDQVRSOztBQVVFLFVBQU1DLE9BQU4sQ0FBY0MsT0FBZCxFQUF1QlIsSUFBdkIsRUFBNkJTLE9BQTdCLEVBQXNDO0FBQ3BDLFVBQUk7QUFDRixjQUFNO0FBQUVSLFVBQUFBO0FBQUYsWUFBYUQsSUFBbkI7QUFDQSxjQUFNO0FBQUVVLFVBQUFBO0FBQUYsWUFBYUQsT0FBbkI7QUFFQSxjQUFNO0FBQUVFLFVBQUFBLGdCQUFGO0FBQW9CQyxVQUFBQSxRQUFwQjtBQUE4QkMsVUFBQUE7QUFBOUIsWUFBMkMsTUFBTVosTUFBdkQ7QUFDQSxZQUFJYSxJQUFJLEdBQUcsSUFBWDs7QUFDQSxZQUFJSCxnQkFBSixFQUFzQjtBQUNwQixnQkFBTUksTUFBTSxHQUFHSixnQkFBZ0IsRUFBL0I7QUFDQUcsVUFBQUEsSUFBSSxHQUFHLE1BQU0sSUFBSUUsT0FBSixDQUFZLENBQUNULE9BQUQsRUFBVVUsTUFBVixLQUFxQjtBQUM1QyxrQkFBTUMsTUFBTSxHQUFHLEVBQWY7QUFDQUgsWUFBQUEsTUFBTSxDQUNISSxFQURILENBQ00sT0FETixFQUNlRixNQURmLEVBRUdFLEVBRkgsQ0FFTSxNQUZOLEVBRWNDLEtBQUssSUFBSUYsTUFBTSxDQUFDRyxJQUFQLENBQVlELEtBQVosQ0FGdkIsRUFHR0QsRUFISCxDQUdNLEtBSE4sRUFHYSxNQUFNWixPQUFPLENBQUNlLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjTCxNQUFkLENBQUQsQ0FIMUI7QUFJRCxXQU5ZLENBQWI7QUFPRDs7QUFFRCxZQUFJLENBQUNKLElBQUQsSUFBUyxDQUFDQSxJQUFJLENBQUNVLE1BQW5CLEVBQTJCO0FBQ3pCLGdCQUFNLElBQUlDLGNBQU1DLEtBQVYsQ0FDSkQsY0FBTUMsS0FBTixDQUFZQyxlQURSLEVBRUosc0JBRkksQ0FBTjtBQUlEOztBQUVELFlBQUlmLFFBQVEsQ0FBQ1ksTUFBVCxHQUFrQixHQUF0QixFQUEyQjtBQUN6QixnQkFBTSxJQUFJQyxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUUsaUJBRFIsRUFFSixvQkFGSSxDQUFOO0FBSUQ7O0FBRUQsWUFBSSxDQUFDaEIsUUFBUSxDQUFDaUIsS0FBVCxDQUFlLG9DQUFmLENBQUwsRUFBMkQ7QUFDekQsZ0JBQU0sSUFBSUosY0FBTUMsS0FBVixDQUNKRCxjQUFNQyxLQUFOLENBQVlFLGlCQURSLEVBRUosdUNBRkksQ0FBTjtBQUlEOztBQUVELFlBQUk7QUFDRixpQkFBTyxNQUFNbEIsTUFBTSxDQUFDb0IsZUFBUCxDQUF1QkMsVUFBdkIsQ0FDWHJCLE1BRFcsRUFFWEUsUUFGVyxFQUdYRSxJQUhXLEVBSVhELFFBSlcsQ0FBYjtBQU1ELFNBUEQsQ0FPRSxPQUFPbUIsQ0FBUCxFQUFVO0FBQ1ZDLDBCQUFPQyxLQUFQLENBQWEseUJBQWIsRUFBd0NGLENBQXhDOztBQUNBLGdCQUFNLElBQUlQLGNBQU1DLEtBQVYsQ0FDSkQsY0FBTUMsS0FBTixDQUFZQyxlQURSLEVBRUgseUJBQXdCZixRQUFTLEdBRjlCLENBQU47QUFJRDtBQUNGLE9BcERELENBb0RFLE9BQU9vQixDQUFQLEVBQVU7QUFDVm5DLFFBQUFBLGtCQUFrQixDQUFDc0MsV0FBbkIsQ0FBK0JILENBQS9CO0FBQ0Q7QUFDRjs7QUFsRUgsR0FGRixFQXNFRSxJQXRFRixFQXVFRSxJQXZFRjtBQXlFRCxDQTFFRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBHcmFwaFFMVXBsb2FkIH0gZnJvbSAnZ3JhcGhxbC11cGxvYWQnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAnY3JlYXRlRmlsZScsXG4gICAge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGUgY3JlYXRlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhbmQgdXBsb2FkIGEgbmV3IGZpbGUuJyxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgdXBsb2FkOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBuZXcgZmlsZSB0byBiZSBjcmVhdGVkIGFuZCB1cGxvYWRlZCcsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxVcGxvYWQpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5GTyksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IHVwbG9hZCB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHsgY3JlYXRlUmVhZFN0cmVhbSwgZmlsZW5hbWUsIG1pbWV0eXBlIH0gPSBhd2FpdCB1cGxvYWQ7XG4gICAgICAgICAgbGV0IGRhdGEgPSBudWxsO1xuICAgICAgICAgIGlmIChjcmVhdGVSZWFkU3RyZWFtKSB7XG4gICAgICAgICAgICBjb25zdCBzdHJlYW0gPSBjcmVhdGVSZWFkU3RyZWFtKCk7XG4gICAgICAgICAgICBkYXRhID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBjaHVua3MgPSBbXTtcbiAgICAgICAgICAgICAgc3RyZWFtXG4gICAgICAgICAgICAgICAgLm9uKCdlcnJvcicsIHJlamVjdClcbiAgICAgICAgICAgICAgICAub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChjaHVuaykpXG4gICAgICAgICAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKEJ1ZmZlci5jb25jYXQoY2h1bmtzKSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCFkYXRhIHx8ICFkYXRhLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgICAgICdJbnZhbGlkIGZpbGUgdXBsb2FkLidcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGZpbGVuYW1lLmxlbmd0aCA+IDEyOCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSxcbiAgICAgICAgICAgICAgJ0ZpbGVuYW1lIHRvbyBsb25nLidcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCFmaWxlbmFtZS5tYXRjaCgvXltfYS16QS1aMC05XVthLXpBLVowLTlAXFwuXFwgfl8tXSokLykpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsXG4gICAgICAgICAgICAgICdGaWxlbmFtZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMuJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IGNvbmZpZy5maWxlc0NvbnRyb2xsZXIuY3JlYXRlRmlsZShcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBmaWxlbmFtZSxcbiAgICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgICAgbWltZXR5cGVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyBhIGZpbGU6ICcsIGUpO1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgICAgIGBDb3VsZCBub3Qgc3RvcmUgZmlsZTogJHtmaWxlbmFtZX0uYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==