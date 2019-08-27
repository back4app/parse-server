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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImRlc2NyaXB0aW9uIiwiYXJncyIsInVwbG9hZCIsInR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkdyYXBoUUxVcGxvYWQiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiRklMRV9JTkZPIiwicmVzb2x2ZSIsIl9zb3VyY2UiLCJjb250ZXh0IiwiY29uZmlnIiwiY3JlYXRlUmVhZFN0cmVhbSIsImZpbGVuYW1lIiwibWltZXR5cGUiLCJkYXRhIiwic3RyZWFtIiwiUHJvbWlzZSIsInJlamVjdCIsImNodW5rcyIsIm9uIiwiY2h1bmsiLCJwdXNoIiwiQnVmZmVyIiwiY29uY2F0IiwibGVuZ3RoIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsIklOVkFMSURfRklMRV9OQU1FIiwibWF0Y2giLCJmaWxlc0NvbnRyb2xsZXIiLCJjcmVhdGVGaWxlIiwiZSIsImxvZ2dlciIsImVycm9yIiwiaGFuZGxlRXJyb3IiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7O0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQ0EsRUFBQUEsa0JBQWtCLENBQUNDLGtCQUFuQixDQUNFLFlBREYsRUFFRTtBQUNFQyxJQUFBQSxXQUFXLEVBQ1Qsa0VBRko7QUFHRUMsSUFBQUEsSUFBSSxFQUFFO0FBQ0pDLE1BQUFBLE1BQU0sRUFBRTtBQUNORixRQUFBQSxXQUFXLEVBQUUsaURBRFA7QUFFTkcsUUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CQyw0QkFBbkI7QUFGQTtBQURKLEtBSFI7QUFTRUYsSUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CRSxtQkFBbUIsQ0FBQ0MsU0FBdkMsQ0FUUjs7QUFVRSxVQUFNQyxPQUFOLENBQWNDLE9BQWQsRUFBdUJSLElBQXZCLEVBQTZCUyxPQUE3QixFQUFzQztBQUNwQyxVQUFJO0FBQ0YsY0FBTTtBQUFFUixVQUFBQTtBQUFGLFlBQWFELElBQW5CO0FBQ0EsY0FBTTtBQUFFVSxVQUFBQTtBQUFGLFlBQWFELE9BQW5CO0FBRUEsY0FBTTtBQUFFRSxVQUFBQSxnQkFBRjtBQUFvQkMsVUFBQUEsUUFBcEI7QUFBOEJDLFVBQUFBO0FBQTlCLFlBQTJDLE1BQU1aLE1BQXZEO0FBQ0EsWUFBSWEsSUFBSSxHQUFHLElBQVg7O0FBQ0EsWUFBSUgsZ0JBQUosRUFBc0I7QUFDcEIsZ0JBQU1JLE1BQU0sR0FBR0osZ0JBQWdCLEVBQS9CO0FBQ0FHLFVBQUFBLElBQUksR0FBRyxNQUFNLElBQUlFLE9BQUosQ0FBWSxDQUFDVCxPQUFELEVBQVVVLE1BQVYsS0FBcUI7QUFDNUMsa0JBQU1DLE1BQU0sR0FBRyxFQUFmO0FBQ0FILFlBQUFBLE1BQU0sQ0FDSEksRUFESCxDQUNNLE9BRE4sRUFDZUYsTUFEZixFQUVHRSxFQUZILENBRU0sTUFGTixFQUVjQyxLQUFLLElBQUlGLE1BQU0sQ0FBQ0csSUFBUCxDQUFZRCxLQUFaLENBRnZCLEVBR0dELEVBSEgsQ0FHTSxLQUhOLEVBR2EsTUFBTVosT0FBTyxDQUFDZSxNQUFNLENBQUNDLE1BQVAsQ0FBY0wsTUFBZCxDQUFELENBSDFCO0FBSUQsV0FOWSxDQUFiO0FBT0Q7O0FBRUQsWUFBSSxDQUFDSixJQUFELElBQVMsQ0FBQ0EsSUFBSSxDQUFDVSxNQUFuQixFQUEyQjtBQUN6QixnQkFBTSxJQUFJQyxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUMsZUFEUixFQUVKLHNCQUZJLENBQU47QUFJRDs7QUFFRCxZQUFJZixRQUFRLENBQUNZLE1BQVQsR0FBa0IsR0FBdEIsRUFBMkI7QUFDekIsZ0JBQU0sSUFBSUMsY0FBTUMsS0FBVixDQUNKRCxjQUFNQyxLQUFOLENBQVlFLGlCQURSLEVBRUosb0JBRkksQ0FBTjtBQUlEOztBQUVELFlBQUksQ0FBQ2hCLFFBQVEsQ0FBQ2lCLEtBQVQsQ0FBZSxvQ0FBZixDQUFMLEVBQTJEO0FBQ3pELGdCQUFNLElBQUlKLGNBQU1DLEtBQVYsQ0FDSkQsY0FBTUMsS0FBTixDQUFZRSxpQkFEUixFQUVKLHVDQUZJLENBQU47QUFJRDs7QUFFRCxZQUFJO0FBQ0YsaUJBQU8sTUFBTWxCLE1BQU0sQ0FBQ29CLGVBQVAsQ0FBdUJDLFVBQXZCLENBQ1hyQixNQURXLEVBRVhFLFFBRlcsRUFHWEUsSUFIVyxFQUlYRCxRQUpXLENBQWI7QUFNRCxTQVBELENBT0UsT0FBT21CLENBQVAsRUFBVTtBQUNWQywwQkFBT0MsS0FBUCxDQUFhLHlCQUFiLEVBQXdDRixDQUF4Qzs7QUFDQSxnQkFBTSxJQUFJUCxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUMsZUFEUixFQUVILHlCQUF3QmYsUUFBUyxHQUY5QixDQUFOO0FBSUQ7QUFDRixPQXBERCxDQW9ERSxPQUFPb0IsQ0FBUCxFQUFVO0FBQ1ZuQyxRQUFBQSxrQkFBa0IsQ0FBQ3NDLFdBQW5CLENBQStCSCxDQUEvQjtBQUNEO0FBQ0Y7O0FBbEVILEdBRkYsRUFzRUUsSUF0RUYsRUF1RUUsSUF2RUY7QUF5RUQsQ0ExRUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgR3JhcGhRTFVwbG9hZCB9IGZyb20gJ2dyYXBocWwtdXBsb2FkJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vLi4vbG9nZ2VyJztcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgJ2NyZWF0ZUZpbGUnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlIGNyZWF0ZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHVwbG9hZCBhIG5ldyBmaWxlLicsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIHVwbG9hZDoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IGZpbGUgdG8gYmUgY3JlYXRlZCBhbmQgdXBsb2FkZWQnLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMVXBsb2FkKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lORk8pLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyB1cGxvYWQgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcgfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCB7IGNyZWF0ZVJlYWRTdHJlYW0sIGZpbGVuYW1lLCBtaW1ldHlwZSB9ID0gYXdhaXQgdXBsb2FkO1xuICAgICAgICAgIGxldCBkYXRhID0gbnVsbDtcbiAgICAgICAgICBpZiAoY3JlYXRlUmVhZFN0cmVhbSkge1xuICAgICAgICAgICAgY29uc3Qgc3RyZWFtID0gY3JlYXRlUmVhZFN0cmVhbSgpO1xuICAgICAgICAgICAgZGF0YSA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgY2h1bmtzID0gW107XG4gICAgICAgICAgICAgIHN0cmVhbVxuICAgICAgICAgICAgICAgIC5vbignZXJyb3InLCByZWplY3QpXG4gICAgICAgICAgICAgICAgLm9uKCdkYXRhJywgY2h1bmsgPT4gY2h1bmtzLnB1c2goY2h1bmspKVxuICAgICAgICAgICAgICAgIC5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGNodW5rcykpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICghZGF0YSB8fCAhZGF0YS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgICAnSW52YWxpZCBmaWxlIHVwbG9hZC4nXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChmaWxlbmFtZS5sZW5ndGggPiAxMjgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsXG4gICAgICAgICAgICAgICdGaWxlbmFtZSB0b28gbG9uZy4nXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICghZmlsZW5hbWUubWF0Y2goL15bX2EtekEtWjAtOV1bYS16QS1aMC05QFxcLlxcIH5fLV0qJC8pKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLFxuICAgICAgICAgICAgICAnRmlsZW5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLidcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBhd2FpdCBjb25maWcuZmlsZXNDb250cm9sbGVyLmNyZWF0ZUZpbGUoXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgZmlsZW5hbWUsXG4gICAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICAgIG1pbWV0eXBlXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgICBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZW5hbWV9LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0sXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=