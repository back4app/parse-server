"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesRouter = void 0;

var _express = _interopRequireDefault(require("express"));

var _bodyParser = _interopRequireDefault(require("body-parser"));

var Middlewares = _interopRequireWildcard(require("../middlewares"));

var _node = _interopRequireDefault(require("parse/node"));

var _Config = _interopRequireDefault(require("../Config"));

var _mime = _interopRequireDefault(require("mime"));

var _logger = _interopRequireDefault(require("../logger"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class FilesRouter {
  expressRouter({
    maxUploadSize = '20Mb'
  } = {}) {
    var router = _express.default.Router();

    router.get('/files/:appId/:filename', this.getHandler);
    router.post('/files', function (req, res, next) {
      next(new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename not provided.'));
    });
    router.post('/files/:filename', Middlewares.allowCrossDomain, _bodyParser.default.raw({
      type: () => {
        return true;
      },
      limit: maxUploadSize
    }), // Allow uploads without Content-Type, or with any Content-Type.
    Middlewares.handleParseHeaders, this.createHandler);
    router.delete('/files/:filename', Middlewares.allowCrossDomain, Middlewares.handleParseHeaders, Middlewares.enforceMasterKeyAccess, this.deleteHandler);
    return router;
  }

  getHandler(req, res) {
    const config = _Config.default.get(req.params.appId);

    const filesController = config.filesController;
    const filename = req.params.filename;

    const contentType = _mime.default.getType(filename);

    if (isFileStreamable(req, filesController)) {
      filesController.getFileStream(config, filename).then(stream => {
        handleFileStream(stream, req, res, contentType);
      }).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
    } else {
      filesController.getFileData(config, filename).then(data => {
        res.status(200);
        res.set('Content-Type', contentType);
        res.set('Content-Length', data.length);
        res.end(data);
      }).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
    }
  }

  createHandler(req, res, next) {
    if (!req.body || !req.body.length) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
      return;
    }

    if (req.params.filename.length > 128) {
      next(new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename too long.'));
      return;
    }

    if (!req.params.filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
      next(new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.'));
      return;
    }

    const filename = req.params.filename;
    const contentType = req.get('Content-type');
    const config = req.config;
    const filesController = config.filesController;
    filesController.createFile(config, filename, req.body, contentType).then(result => {
      res.status(201);
      res.set('Location', result.url);
      res.json(result);
    }).catch(e => {
      _logger.default.error('Error creating a file: ', e);

      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `Could not store file: ${filename}.`));
    });
  }

  deleteHandler(req, res, next) {
    const filesController = req.config.filesController;
    filesController.deleteFile(req.config, req.params.filename).then(() => {
      res.status(200); // TODO: return useful JSON here?

      res.end();
    }).catch(() => {
      next(new _node.default.Error(_node.default.Error.FILE_DELETE_ERROR, 'Could not delete file.'));
    });
  }

}

exports.FilesRouter = FilesRouter;

function isFileStreamable(req, filesController) {
  return req.get('Range') && typeof filesController.adapter.getFileStream === 'function';
}

function getRange(req) {
  const parts = req.get('Range').replace(/bytes=/, '').split('-');
  return {
    start: parseInt(parts[0], 10),
    end: parseInt(parts[1], 10)
  };
} // handleFileStream is licenced under Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/).
// Author: LEROIB at weightingformypizza (https://weightingformypizza.wordpress.com/2015/06/24/stream-html5-media-content-like-video-audio-from-mongodb-using-express-and-gridstore/).


function handleFileStream(stream, req, res, contentType) {
  const buffer_size = 1024 * 1024; //1024Kb
  // Range request, partiall stream the file

  let {
    start,
    end
  } = getRange(req);
  const notEnded = !end && end !== 0;
  const notStarted = !start && start !== 0; // No end provided, we want all bytes

  if (notEnded) {
    end = stream.length - 1;
  } // No start provided, we're reading backwards


  if (notStarted) {
    start = stream.length - end;
    end = start + end - 1;
  } // Data exceeds the buffer_size, cap


  if (end - start >= buffer_size) {
    end = start + buffer_size - 1;
  }

  const contentLength = end - start + 1;
  res.writeHead(206, {
    'Content-Range': 'bytes ' + start + '-' + end + '/' + stream.length,
    'Accept-Ranges': 'bytes',
    'Content-Length': contentLength,
    'Content-Type': contentType
  });
  stream.seek(start, function () {
    // get gridFile stream
    const gridFileStream = stream.stream(true);
    let bufferAvail = 0;
    let remainingBytesToWrite = contentLength;
    let totalBytesWritten = 0; // write to response

    gridFileStream.on('data', function (data) {
      bufferAvail += data.length;

      if (bufferAvail > 0) {
        // slice returns the same buffer if overflowing
        // safe to call in any case
        const buffer = data.slice(0, remainingBytesToWrite); // write the buffer

        res.write(buffer); // increment total

        totalBytesWritten += buffer.length; // decrement remaining

        remainingBytesToWrite -= data.length; // decrement the avaialbe buffer

        bufferAvail -= buffer.length;
      } // in case of small slices, all values will be good at that point
      // we've written enough, end...


      if (totalBytesWritten >= contentLength) {
        stream.close();
        res.end();
        this.destroy();
      }
    });
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0ZpbGVzUm91dGVyLmpzIl0sIm5hbWVzIjpbIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsIm1heFVwbG9hZFNpemUiLCJyb3V0ZXIiLCJleHByZXNzIiwiUm91dGVyIiwiZ2V0IiwiZ2V0SGFuZGxlciIsInBvc3QiLCJyZXEiLCJyZXMiLCJuZXh0IiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfRklMRV9OQU1FIiwiTWlkZGxld2FyZXMiLCJhbGxvd0Nyb3NzRG9tYWluIiwiQm9keVBhcnNlciIsInJhdyIsInR5cGUiLCJsaW1pdCIsImhhbmRsZVBhcnNlSGVhZGVycyIsImNyZWF0ZUhhbmRsZXIiLCJkZWxldGUiLCJlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiZGVsZXRlSGFuZGxlciIsImNvbmZpZyIsIkNvbmZpZyIsInBhcmFtcyIsImFwcElkIiwiZmlsZXNDb250cm9sbGVyIiwiZmlsZW5hbWUiLCJjb250ZW50VHlwZSIsIm1pbWUiLCJnZXRUeXBlIiwiaXNGaWxlU3RyZWFtYWJsZSIsImdldEZpbGVTdHJlYW0iLCJ0aGVuIiwic3RyZWFtIiwiaGFuZGxlRmlsZVN0cmVhbSIsImNhdGNoIiwic3RhdHVzIiwic2V0IiwiZW5kIiwiZ2V0RmlsZURhdGEiLCJkYXRhIiwibGVuZ3RoIiwiYm9keSIsIkZJTEVfU0FWRV9FUlJPUiIsIm1hdGNoIiwiY3JlYXRlRmlsZSIsInJlc3VsdCIsInVybCIsImpzb24iLCJlIiwibG9nZ2VyIiwiZXJyb3IiLCJkZWxldGVGaWxlIiwiRklMRV9ERUxFVEVfRVJST1IiLCJhZGFwdGVyIiwiZ2V0UmFuZ2UiLCJwYXJ0cyIsInJlcGxhY2UiLCJzcGxpdCIsInN0YXJ0IiwicGFyc2VJbnQiLCJidWZmZXJfc2l6ZSIsIm5vdEVuZGVkIiwibm90U3RhcnRlZCIsImNvbnRlbnRMZW5ndGgiLCJ3cml0ZUhlYWQiLCJzZWVrIiwiZ3JpZEZpbGVTdHJlYW0iLCJidWZmZXJBdmFpbCIsInJlbWFpbmluZ0J5dGVzVG9Xcml0ZSIsInRvdGFsQnl0ZXNXcml0dGVuIiwib24iLCJidWZmZXIiLCJzbGljZSIsIndyaXRlIiwiY2xvc2UiLCJkZXN0cm95Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7OztBQUVPLE1BQU1BLFdBQU4sQ0FBa0I7QUFDdkJDLEVBQUFBLGFBQWEsQ0FBQztBQUFFQyxJQUFBQSxhQUFhLEdBQUc7QUFBbEIsTUFBNkIsRUFBOUIsRUFBa0M7QUFDN0MsUUFBSUMsTUFBTSxHQUFHQyxpQkFBUUMsTUFBUixFQUFiOztBQUNBRixJQUFBQSxNQUFNLENBQUNHLEdBQVAsQ0FBVyx5QkFBWCxFQUFzQyxLQUFLQyxVQUEzQztBQUVBSixJQUFBQSxNQUFNLENBQUNLLElBQVAsQ0FBWSxRQUFaLEVBQXNCLFVBQVNDLEdBQVQsRUFBY0MsR0FBZCxFQUFtQkMsSUFBbkIsRUFBeUI7QUFDN0NBLE1BQUFBLElBQUksQ0FDRixJQUFJQyxjQUFNQyxLQUFWLENBQWdCRCxjQUFNQyxLQUFOLENBQVlDLGlCQUE1QixFQUErQyx3QkFBL0MsQ0FERSxDQUFKO0FBR0QsS0FKRDtBQU1BWCxJQUFBQSxNQUFNLENBQUNLLElBQVAsQ0FDRSxrQkFERixFQUVFTyxXQUFXLENBQUNDLGdCQUZkLEVBR0VDLG9CQUFXQyxHQUFYLENBQWU7QUFDYkMsTUFBQUEsSUFBSSxFQUFFLE1BQU07QUFDVixlQUFPLElBQVA7QUFDRCxPQUhZO0FBSWJDLE1BQUFBLEtBQUssRUFBRWxCO0FBSk0sS0FBZixDQUhGLEVBUU07QUFDSmEsSUFBQUEsV0FBVyxDQUFDTSxrQkFUZCxFQVVFLEtBQUtDLGFBVlA7QUFhQW5CLElBQUFBLE1BQU0sQ0FBQ29CLE1BQVAsQ0FDRSxrQkFERixFQUVFUixXQUFXLENBQUNDLGdCQUZkLEVBR0VELFdBQVcsQ0FBQ00sa0JBSGQsRUFJRU4sV0FBVyxDQUFDUyxzQkFKZCxFQUtFLEtBQUtDLGFBTFA7QUFPQSxXQUFPdEIsTUFBUDtBQUNEOztBQUVESSxFQUFBQSxVQUFVLENBQUNFLEdBQUQsRUFBTUMsR0FBTixFQUFXO0FBQ25CLFVBQU1nQixNQUFNLEdBQUdDLGdCQUFPckIsR0FBUCxDQUFXRyxHQUFHLENBQUNtQixNQUFKLENBQVdDLEtBQXRCLENBQWY7O0FBQ0EsVUFBTUMsZUFBZSxHQUFHSixNQUFNLENBQUNJLGVBQS9CO0FBQ0EsVUFBTUMsUUFBUSxHQUFHdEIsR0FBRyxDQUFDbUIsTUFBSixDQUFXRyxRQUE1Qjs7QUFDQSxVQUFNQyxXQUFXLEdBQUdDLGNBQUtDLE9BQUwsQ0FBYUgsUUFBYixDQUFwQjs7QUFDQSxRQUFJSSxnQkFBZ0IsQ0FBQzFCLEdBQUQsRUFBTXFCLGVBQU4sQ0FBcEIsRUFBNEM7QUFDMUNBLE1BQUFBLGVBQWUsQ0FDWk0sYUFESCxDQUNpQlYsTUFEakIsRUFDeUJLLFFBRHpCLEVBRUdNLElBRkgsQ0FFUUMsTUFBTSxJQUFJO0FBQ2RDLFFBQUFBLGdCQUFnQixDQUFDRCxNQUFELEVBQVM3QixHQUFULEVBQWNDLEdBQWQsRUFBbUJzQixXQUFuQixDQUFoQjtBQUNELE9BSkgsRUFLR1EsS0FMSCxDQUtTLE1BQU07QUFDWDlCLFFBQUFBLEdBQUcsQ0FBQytCLE1BQUosQ0FBVyxHQUFYO0FBQ0EvQixRQUFBQSxHQUFHLENBQUNnQyxHQUFKLENBQVEsY0FBUixFQUF3QixZQUF4QjtBQUNBaEMsUUFBQUEsR0FBRyxDQUFDaUMsR0FBSixDQUFRLGlCQUFSO0FBQ0QsT0FUSDtBQVVELEtBWEQsTUFXTztBQUNMYixNQUFBQSxlQUFlLENBQ1pjLFdBREgsQ0FDZWxCLE1BRGYsRUFDdUJLLFFBRHZCLEVBRUdNLElBRkgsQ0FFUVEsSUFBSSxJQUFJO0FBQ1puQyxRQUFBQSxHQUFHLENBQUMrQixNQUFKLENBQVcsR0FBWDtBQUNBL0IsUUFBQUEsR0FBRyxDQUFDZ0MsR0FBSixDQUFRLGNBQVIsRUFBd0JWLFdBQXhCO0FBQ0F0QixRQUFBQSxHQUFHLENBQUNnQyxHQUFKLENBQVEsZ0JBQVIsRUFBMEJHLElBQUksQ0FBQ0MsTUFBL0I7QUFDQXBDLFFBQUFBLEdBQUcsQ0FBQ2lDLEdBQUosQ0FBUUUsSUFBUjtBQUNELE9BUEgsRUFRR0wsS0FSSCxDQVFTLE1BQU07QUFDWDlCLFFBQUFBLEdBQUcsQ0FBQytCLE1BQUosQ0FBVyxHQUFYO0FBQ0EvQixRQUFBQSxHQUFHLENBQUNnQyxHQUFKLENBQVEsY0FBUixFQUF3QixZQUF4QjtBQUNBaEMsUUFBQUEsR0FBRyxDQUFDaUMsR0FBSixDQUFRLGlCQUFSO0FBQ0QsT0FaSDtBQWFEO0FBQ0Y7O0FBRURyQixFQUFBQSxhQUFhLENBQUNiLEdBQUQsRUFBTUMsR0FBTixFQUFXQyxJQUFYLEVBQWlCO0FBQzVCLFFBQUksQ0FBQ0YsR0FBRyxDQUFDc0MsSUFBTCxJQUFhLENBQUN0QyxHQUFHLENBQUNzQyxJQUFKLENBQVNELE1BQTNCLEVBQW1DO0FBQ2pDbkMsTUFBQUEsSUFBSSxDQUNGLElBQUlDLGNBQU1DLEtBQVYsQ0FBZ0JELGNBQU1DLEtBQU4sQ0FBWW1DLGVBQTVCLEVBQTZDLHNCQUE3QyxDQURFLENBQUo7QUFHQTtBQUNEOztBQUVELFFBQUl2QyxHQUFHLENBQUNtQixNQUFKLENBQVdHLFFBQVgsQ0FBb0JlLE1BQXBCLEdBQTZCLEdBQWpDLEVBQXNDO0FBQ3BDbkMsTUFBQUEsSUFBSSxDQUNGLElBQUlDLGNBQU1DLEtBQVYsQ0FBZ0JELGNBQU1DLEtBQU4sQ0FBWUMsaUJBQTVCLEVBQStDLG9CQUEvQyxDQURFLENBQUo7QUFHQTtBQUNEOztBQUVELFFBQUksQ0FBQ0wsR0FBRyxDQUFDbUIsTUFBSixDQUFXRyxRQUFYLENBQW9Ca0IsS0FBcEIsQ0FBMEIsb0NBQTFCLENBQUwsRUFBc0U7QUFDcEV0QyxNQUFBQSxJQUFJLENBQ0YsSUFBSUMsY0FBTUMsS0FBVixDQUNFRCxjQUFNQyxLQUFOLENBQVlDLGlCQURkLEVBRUUsdUNBRkYsQ0FERSxDQUFKO0FBTUE7QUFDRDs7QUFFRCxVQUFNaUIsUUFBUSxHQUFHdEIsR0FBRyxDQUFDbUIsTUFBSixDQUFXRyxRQUE1QjtBQUNBLFVBQU1DLFdBQVcsR0FBR3ZCLEdBQUcsQ0FBQ0gsR0FBSixDQUFRLGNBQVIsQ0FBcEI7QUFDQSxVQUFNb0IsTUFBTSxHQUFHakIsR0FBRyxDQUFDaUIsTUFBbkI7QUFDQSxVQUFNSSxlQUFlLEdBQUdKLE1BQU0sQ0FBQ0ksZUFBL0I7QUFFQUEsSUFBQUEsZUFBZSxDQUNab0IsVUFESCxDQUNjeEIsTUFEZCxFQUNzQkssUUFEdEIsRUFDZ0N0QixHQUFHLENBQUNzQyxJQURwQyxFQUMwQ2YsV0FEMUMsRUFFR0ssSUFGSCxDQUVRYyxNQUFNLElBQUk7QUFDZHpDLE1BQUFBLEdBQUcsQ0FBQytCLE1BQUosQ0FBVyxHQUFYO0FBQ0EvQixNQUFBQSxHQUFHLENBQUNnQyxHQUFKLENBQVEsVUFBUixFQUFvQlMsTUFBTSxDQUFDQyxHQUEzQjtBQUNBMUMsTUFBQUEsR0FBRyxDQUFDMkMsSUFBSixDQUFTRixNQUFUO0FBQ0QsS0FOSCxFQU9HWCxLQVBILENBT1NjLENBQUMsSUFBSTtBQUNWQyxzQkFBT0MsS0FBUCxDQUFhLHlCQUFiLEVBQXdDRixDQUF4Qzs7QUFDQTNDLE1BQUFBLElBQUksQ0FDRixJQUFJQyxjQUFNQyxLQUFWLENBQ0VELGNBQU1DLEtBQU4sQ0FBWW1DLGVBRGQsRUFFRyx5QkFBd0JqQixRQUFTLEdBRnBDLENBREUsQ0FBSjtBQU1ELEtBZkg7QUFnQkQ7O0FBRUROLEVBQUFBLGFBQWEsQ0FBQ2hCLEdBQUQsRUFBTUMsR0FBTixFQUFXQyxJQUFYLEVBQWlCO0FBQzVCLFVBQU1tQixlQUFlLEdBQUdyQixHQUFHLENBQUNpQixNQUFKLENBQVdJLGVBQW5DO0FBQ0FBLElBQUFBLGVBQWUsQ0FDWjJCLFVBREgsQ0FDY2hELEdBQUcsQ0FBQ2lCLE1BRGxCLEVBQzBCakIsR0FBRyxDQUFDbUIsTUFBSixDQUFXRyxRQURyQyxFQUVHTSxJQUZILENBRVEsTUFBTTtBQUNWM0IsTUFBQUEsR0FBRyxDQUFDK0IsTUFBSixDQUFXLEdBQVgsRUFEVSxDQUVWOztBQUNBL0IsTUFBQUEsR0FBRyxDQUFDaUMsR0FBSjtBQUNELEtBTkgsRUFPR0gsS0FQSCxDQU9TLE1BQU07QUFDWDdCLE1BQUFBLElBQUksQ0FDRixJQUFJQyxjQUFNQyxLQUFWLENBQ0VELGNBQU1DLEtBQU4sQ0FBWTZDLGlCQURkLEVBRUUsd0JBRkYsQ0FERSxDQUFKO0FBTUQsS0FkSDtBQWVEOztBQXBJc0I7Ozs7QUF1SXpCLFNBQVN2QixnQkFBVCxDQUEwQjFCLEdBQTFCLEVBQStCcUIsZUFBL0IsRUFBZ0Q7QUFDOUMsU0FDRXJCLEdBQUcsQ0FBQ0gsR0FBSixDQUFRLE9BQVIsS0FDQSxPQUFPd0IsZUFBZSxDQUFDNkIsT0FBaEIsQ0FBd0J2QixhQUEvQixLQUFpRCxVQUZuRDtBQUlEOztBQUVELFNBQVN3QixRQUFULENBQWtCbkQsR0FBbEIsRUFBdUI7QUFDckIsUUFBTW9ELEtBQUssR0FBR3BELEdBQUcsQ0FDZEgsR0FEVyxDQUNQLE9BRE8sRUFFWHdELE9BRlcsQ0FFSCxRQUZHLEVBRU8sRUFGUCxFQUdYQyxLQUhXLENBR0wsR0FISyxDQUFkO0FBSUEsU0FBTztBQUFFQyxJQUFBQSxLQUFLLEVBQUVDLFFBQVEsQ0FBQ0osS0FBSyxDQUFDLENBQUQsQ0FBTixFQUFXLEVBQVgsQ0FBakI7QUFBaUNsQixJQUFBQSxHQUFHLEVBQUVzQixRQUFRLENBQUNKLEtBQUssQ0FBQyxDQUFELENBQU4sRUFBVyxFQUFYO0FBQTlDLEdBQVA7QUFDRCxDLENBRUQ7QUFDQTs7O0FBQ0EsU0FBU3RCLGdCQUFULENBQTBCRCxNQUExQixFQUFrQzdCLEdBQWxDLEVBQXVDQyxHQUF2QyxFQUE0Q3NCLFdBQTVDLEVBQXlEO0FBQ3ZELFFBQU1rQyxXQUFXLEdBQUcsT0FBTyxJQUEzQixDQUR1RCxDQUN0QjtBQUNqQzs7QUFDQSxNQUFJO0FBQUVGLElBQUFBLEtBQUY7QUFBU3JCLElBQUFBO0FBQVQsTUFBaUJpQixRQUFRLENBQUNuRCxHQUFELENBQTdCO0FBRUEsUUFBTTBELFFBQVEsR0FBRyxDQUFDeEIsR0FBRCxJQUFRQSxHQUFHLEtBQUssQ0FBakM7QUFDQSxRQUFNeUIsVUFBVSxHQUFHLENBQUNKLEtBQUQsSUFBVUEsS0FBSyxLQUFLLENBQXZDLENBTnVELENBT3ZEOztBQUNBLE1BQUlHLFFBQUosRUFBYztBQUNaeEIsSUFBQUEsR0FBRyxHQUFHTCxNQUFNLENBQUNRLE1BQVAsR0FBZ0IsQ0FBdEI7QUFDRCxHQVZzRCxDQVd2RDs7O0FBQ0EsTUFBSXNCLFVBQUosRUFBZ0I7QUFDZEosSUFBQUEsS0FBSyxHQUFHMUIsTUFBTSxDQUFDUSxNQUFQLEdBQWdCSCxHQUF4QjtBQUNBQSxJQUFBQSxHQUFHLEdBQUdxQixLQUFLLEdBQUdyQixHQUFSLEdBQWMsQ0FBcEI7QUFDRCxHQWZzRCxDQWlCdkQ7OztBQUNBLE1BQUlBLEdBQUcsR0FBR3FCLEtBQU4sSUFBZUUsV0FBbkIsRUFBZ0M7QUFDOUJ2QixJQUFBQSxHQUFHLEdBQUdxQixLQUFLLEdBQUdFLFdBQVIsR0FBc0IsQ0FBNUI7QUFDRDs7QUFFRCxRQUFNRyxhQUFhLEdBQUcxQixHQUFHLEdBQUdxQixLQUFOLEdBQWMsQ0FBcEM7QUFFQXRELEVBQUFBLEdBQUcsQ0FBQzRELFNBQUosQ0FBYyxHQUFkLEVBQW1CO0FBQ2pCLHFCQUFpQixXQUFXTixLQUFYLEdBQW1CLEdBQW5CLEdBQXlCckIsR0FBekIsR0FBK0IsR0FBL0IsR0FBcUNMLE1BQU0sQ0FBQ1EsTUFENUM7QUFFakIscUJBQWlCLE9BRkE7QUFHakIsc0JBQWtCdUIsYUFIRDtBQUlqQixvQkFBZ0JyQztBQUpDLEdBQW5CO0FBT0FNLEVBQUFBLE1BQU0sQ0FBQ2lDLElBQVAsQ0FBWVAsS0FBWixFQUFtQixZQUFXO0FBQzVCO0FBQ0EsVUFBTVEsY0FBYyxHQUFHbEMsTUFBTSxDQUFDQSxNQUFQLENBQWMsSUFBZCxDQUF2QjtBQUNBLFFBQUltQyxXQUFXLEdBQUcsQ0FBbEI7QUFDQSxRQUFJQyxxQkFBcUIsR0FBR0wsYUFBNUI7QUFDQSxRQUFJTSxpQkFBaUIsR0FBRyxDQUF4QixDQUw0QixDQU01Qjs7QUFDQUgsSUFBQUEsY0FBYyxDQUFDSSxFQUFmLENBQWtCLE1BQWxCLEVBQTBCLFVBQVMvQixJQUFULEVBQWU7QUFDdkM0QixNQUFBQSxXQUFXLElBQUk1QixJQUFJLENBQUNDLE1BQXBCOztBQUNBLFVBQUkyQixXQUFXLEdBQUcsQ0FBbEIsRUFBcUI7QUFDbkI7QUFDQTtBQUNBLGNBQU1JLE1BQU0sR0FBR2hDLElBQUksQ0FBQ2lDLEtBQUwsQ0FBVyxDQUFYLEVBQWNKLHFCQUFkLENBQWYsQ0FIbUIsQ0FJbkI7O0FBQ0FoRSxRQUFBQSxHQUFHLENBQUNxRSxLQUFKLENBQVVGLE1BQVYsRUFMbUIsQ0FNbkI7O0FBQ0FGLFFBQUFBLGlCQUFpQixJQUFJRSxNQUFNLENBQUMvQixNQUE1QixDQVBtQixDQVFuQjs7QUFDQTRCLFFBQUFBLHFCQUFxQixJQUFJN0IsSUFBSSxDQUFDQyxNQUE5QixDQVRtQixDQVVuQjs7QUFDQTJCLFFBQUFBLFdBQVcsSUFBSUksTUFBTSxDQUFDL0IsTUFBdEI7QUFDRCxPQWRzQyxDQWV2QztBQUNBOzs7QUFDQSxVQUFJNkIsaUJBQWlCLElBQUlOLGFBQXpCLEVBQXdDO0FBQ3RDL0IsUUFBQUEsTUFBTSxDQUFDMEMsS0FBUDtBQUNBdEUsUUFBQUEsR0FBRyxDQUFDaUMsR0FBSjtBQUNBLGFBQUtzQyxPQUFMO0FBQ0Q7QUFDRixLQXRCRDtBQXVCRCxHQTlCRDtBQStCRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzIGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IEJvZHlQYXJzZXIgZnJvbSAnYm9keS1wYXJzZXInO1xuaW1wb3J0ICogYXMgTWlkZGxld2FyZXMgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IG1pbWUgZnJvbSAnbWltZSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5cbmV4cG9ydCBjbGFzcyBGaWxlc1JvdXRlciB7XG4gIGV4cHJlc3NSb3V0ZXIoeyBtYXhVcGxvYWRTaXplID0gJzIwTWInIH0gPSB7fSkge1xuICAgIHZhciByb3V0ZXIgPSBleHByZXNzLlJvdXRlcigpO1xuICAgIHJvdXRlci5nZXQoJy9maWxlcy86YXBwSWQvOmZpbGVuYW1lJywgdGhpcy5nZXRIYW5kbGVyKTtcblxuICAgIHJvdXRlci5wb3N0KCcvZmlsZXMnLCBmdW5jdGlvbihyZXEsIHJlcywgbmV4dCkge1xuICAgICAgbmV4dChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgbm90IHByb3ZpZGVkLicpXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgcm91dGVyLnBvc3QoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBNaWRkbGV3YXJlcy5hbGxvd0Nyb3NzRG9tYWluLFxuICAgICAgQm9keVBhcnNlci5yYXcoe1xuICAgICAgICB0eXBlOiAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICAgIGxpbWl0OiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSksIC8vIEFsbG93IHVwbG9hZHMgd2l0aG91dCBDb250ZW50LVR5cGUsIG9yIHdpdGggYW55IENvbnRlbnQtVHlwZS5cbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyxcbiAgICAgIHRoaXMuY3JlYXRlSGFuZGxlclxuICAgICk7XG5cbiAgICByb3V0ZXIuZGVsZXRlKFxuICAgICAgJy9maWxlcy86ZmlsZW5hbWUnLFxuICAgICAgTWlkZGxld2FyZXMuYWxsb3dDcm9zc0RvbWFpbixcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyxcbiAgICAgIE1pZGRsZXdhcmVzLmVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLmRlbGV0ZUhhbmRsZXJcbiAgICApO1xuICAgIHJldHVybiByb3V0ZXI7XG4gIH1cblxuICBnZXRIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gcmVxLnBhcmFtcy5maWxlbmFtZTtcbiAgICBjb25zdCBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShmaWxlbmFtZSk7XG4gICAgaWYgKGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpKSB7XG4gICAgICBmaWxlc0NvbnRyb2xsZXJcbiAgICAgICAgLmdldEZpbGVTdHJlYW0oY29uZmlnLCBmaWxlbmFtZSlcbiAgICAgICAgLnRoZW4oc3RyZWFtID0+IHtcbiAgICAgICAgICBoYW5kbGVGaWxlU3RyZWFtKHN0cmVhbSwgcmVxLCByZXMsIGNvbnRlbnRUeXBlKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICByZXMuc3RhdHVzKDQwNCk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpbGVzQ29udHJvbGxlclxuICAgICAgICAuZ2V0RmlsZURhdGEoY29uZmlnLCBmaWxlbmFtZSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtVHlwZScsIGNvbnRlbnRUeXBlKTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LUxlbmd0aCcsIGRhdGEubGVuZ3RoKTtcbiAgICAgICAgICByZXMuZW5kKGRhdGEpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIHJlcy5zdGF0dXMoNDA0KTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgICAgIHJlcy5lbmQoJ0ZpbGUgbm90IGZvdW5kLicpO1xuICAgICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjcmVhdGVIYW5kbGVyKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgaWYgKCFyZXEuYm9keSB8fCAhcmVxLmJvZHkubGVuZ3RoKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAocmVxLnBhcmFtcy5maWxlbmFtZS5sZW5ndGggPiAxMjgpIHtcbiAgICAgIG5leHQoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIHRvbyBsb25nLicpXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghcmVxLnBhcmFtcy5maWxlbmFtZS5tYXRjaCgvXltfYS16QS1aMC05XVthLXpBLVowLTlAXFwuXFwgfl8tXSokLykpIHtcbiAgICAgIG5leHQoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSxcbiAgICAgICAgICAnRmlsZW5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLidcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlbmFtZSA9IHJlcS5wYXJhbXMuZmlsZW5hbWU7XG4gICAgY29uc3QgY29udGVudFR5cGUgPSByZXEuZ2V0KCdDb250ZW50LXR5cGUnKTtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IGZpbGVzQ29udHJvbGxlciA9IGNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG5cbiAgICBmaWxlc0NvbnRyb2xsZXJcbiAgICAgIC5jcmVhdGVGaWxlKGNvbmZpZywgZmlsZW5hbWUsIHJlcS5ib2R5LCBjb250ZW50VHlwZSlcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIHJlcy5zdGF0dXMoMjAxKTtcbiAgICAgICAgcmVzLnNldCgnTG9jYXRpb24nLCByZXN1bHQudXJsKTtcbiAgICAgICAgcmVzLmpzb24ocmVzdWx0KTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZSA9PiB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgICAgbmV4dChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgICBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZW5hbWV9LmBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZUhhbmRsZXIocmVxLCByZXMsIG5leHQpIHtcbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSByZXEuY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBmaWxlc0NvbnRyb2xsZXJcbiAgICAgIC5kZWxldGVGaWxlKHJlcS5jb25maWcsIHJlcS5wYXJhbXMuZmlsZW5hbWUpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgICAgLy8gVE9ETzogcmV0dXJuIHVzZWZ1bCBKU09OIGhlcmU/XG4gICAgICAgIHJlcy5lbmQoKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICBuZXh0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkZJTEVfREVMRVRFX0VSUk9SLFxuICAgICAgICAgICAgJ0NvdWxkIG5vdCBkZWxldGUgZmlsZS4nXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNGaWxlU3RyZWFtYWJsZShyZXEsIGZpbGVzQ29udHJvbGxlcikge1xuICByZXR1cm4gKFxuICAgIHJlcS5nZXQoJ1JhbmdlJykgJiZcbiAgICB0eXBlb2YgZmlsZXNDb250cm9sbGVyLmFkYXB0ZXIuZ2V0RmlsZVN0cmVhbSA9PT0gJ2Z1bmN0aW9uJ1xuICApO1xufVxuXG5mdW5jdGlvbiBnZXRSYW5nZShyZXEpIHtcbiAgY29uc3QgcGFydHMgPSByZXFcbiAgICAuZ2V0KCdSYW5nZScpXG4gICAgLnJlcGxhY2UoL2J5dGVzPS8sICcnKVxuICAgIC5zcGxpdCgnLScpO1xuICByZXR1cm4geyBzdGFydDogcGFyc2VJbnQocGFydHNbMF0sIDEwKSwgZW5kOiBwYXJzZUludChwYXJ0c1sxXSwgMTApIH07XG59XG5cbi8vIGhhbmRsZUZpbGVTdHJlYW0gaXMgbGljZW5jZWQgdW5kZXIgQ3JlYXRpdmUgQ29tbW9ucyBBdHRyaWJ1dGlvbiA0LjAgSW50ZXJuYXRpb25hbCBMaWNlbnNlIChodHRwczovL2NyZWF0aXZlY29tbW9ucy5vcmcvbGljZW5zZXMvYnkvNC4wLykuXG4vLyBBdXRob3I6IExFUk9JQiBhdCB3ZWlnaHRpbmdmb3JteXBpenphIChodHRwczovL3dlaWdodGluZ2Zvcm15cGl6emEud29yZHByZXNzLmNvbS8yMDE1LzA2LzI0L3N0cmVhbS1odG1sNS1tZWRpYS1jb250ZW50LWxpa2UtdmlkZW8tYXVkaW8tZnJvbS1tb25nb2RiLXVzaW5nLWV4cHJlc3MtYW5kLWdyaWRzdG9yZS8pLlxuZnVuY3Rpb24gaGFuZGxlRmlsZVN0cmVhbShzdHJlYW0sIHJlcSwgcmVzLCBjb250ZW50VHlwZSkge1xuICBjb25zdCBidWZmZXJfc2l6ZSA9IDEwMjQgKiAxMDI0OyAvLzEwMjRLYlxuICAvLyBSYW5nZSByZXF1ZXN0LCBwYXJ0aWFsbCBzdHJlYW0gdGhlIGZpbGVcbiAgbGV0IHsgc3RhcnQsIGVuZCB9ID0gZ2V0UmFuZ2UocmVxKTtcblxuICBjb25zdCBub3RFbmRlZCA9ICFlbmQgJiYgZW5kICE9PSAwO1xuICBjb25zdCBub3RTdGFydGVkID0gIXN0YXJ0ICYmIHN0YXJ0ICE9PSAwO1xuICAvLyBObyBlbmQgcHJvdmlkZWQsIHdlIHdhbnQgYWxsIGJ5dGVzXG4gIGlmIChub3RFbmRlZCkge1xuICAgIGVuZCA9IHN0cmVhbS5sZW5ndGggLSAxO1xuICB9XG4gIC8vIE5vIHN0YXJ0IHByb3ZpZGVkLCB3ZSdyZSByZWFkaW5nIGJhY2t3YXJkc1xuICBpZiAobm90U3RhcnRlZCkge1xuICAgIHN0YXJ0ID0gc3RyZWFtLmxlbmd0aCAtIGVuZDtcbiAgICBlbmQgPSBzdGFydCArIGVuZCAtIDE7XG4gIH1cblxuICAvLyBEYXRhIGV4Y2VlZHMgdGhlIGJ1ZmZlcl9zaXplLCBjYXBcbiAgaWYgKGVuZCAtIHN0YXJ0ID49IGJ1ZmZlcl9zaXplKSB7XG4gICAgZW5kID0gc3RhcnQgKyBidWZmZXJfc2l6ZSAtIDE7XG4gIH1cblxuICBjb25zdCBjb250ZW50TGVuZ3RoID0gZW5kIC0gc3RhcnQgKyAxO1xuXG4gIHJlcy53cml0ZUhlYWQoMjA2LCB7XG4gICAgJ0NvbnRlbnQtUmFuZ2UnOiAnYnl0ZXMgJyArIHN0YXJ0ICsgJy0nICsgZW5kICsgJy8nICsgc3RyZWFtLmxlbmd0aCxcbiAgICAnQWNjZXB0LVJhbmdlcyc6ICdieXRlcycsXG4gICAgJ0NvbnRlbnQtTGVuZ3RoJzogY29udGVudExlbmd0aCxcbiAgICAnQ29udGVudC1UeXBlJzogY29udGVudFR5cGUsXG4gIH0pO1xuXG4gIHN0cmVhbS5zZWVrKHN0YXJ0LCBmdW5jdGlvbigpIHtcbiAgICAvLyBnZXQgZ3JpZEZpbGUgc3RyZWFtXG4gICAgY29uc3QgZ3JpZEZpbGVTdHJlYW0gPSBzdHJlYW0uc3RyZWFtKHRydWUpO1xuICAgIGxldCBidWZmZXJBdmFpbCA9IDA7XG4gICAgbGV0IHJlbWFpbmluZ0J5dGVzVG9Xcml0ZSA9IGNvbnRlbnRMZW5ndGg7XG4gICAgbGV0IHRvdGFsQnl0ZXNXcml0dGVuID0gMDtcbiAgICAvLyB3cml0ZSB0byByZXNwb25zZVxuICAgIGdyaWRGaWxlU3RyZWFtLm9uKCdkYXRhJywgZnVuY3Rpb24oZGF0YSkge1xuICAgICAgYnVmZmVyQXZhaWwgKz0gZGF0YS5sZW5ndGg7XG4gICAgICBpZiAoYnVmZmVyQXZhaWwgPiAwKSB7XG4gICAgICAgIC8vIHNsaWNlIHJldHVybnMgdGhlIHNhbWUgYnVmZmVyIGlmIG92ZXJmbG93aW5nXG4gICAgICAgIC8vIHNhZmUgdG8gY2FsbCBpbiBhbnkgY2FzZVxuICAgICAgICBjb25zdCBidWZmZXIgPSBkYXRhLnNsaWNlKDAsIHJlbWFpbmluZ0J5dGVzVG9Xcml0ZSk7XG4gICAgICAgIC8vIHdyaXRlIHRoZSBidWZmZXJcbiAgICAgICAgcmVzLndyaXRlKGJ1ZmZlcik7XG4gICAgICAgIC8vIGluY3JlbWVudCB0b3RhbFxuICAgICAgICB0b3RhbEJ5dGVzV3JpdHRlbiArPSBidWZmZXIubGVuZ3RoO1xuICAgICAgICAvLyBkZWNyZW1lbnQgcmVtYWluaW5nXG4gICAgICAgIHJlbWFpbmluZ0J5dGVzVG9Xcml0ZSAtPSBkYXRhLmxlbmd0aDtcbiAgICAgICAgLy8gZGVjcmVtZW50IHRoZSBhdmFpYWxiZSBidWZmZXJcbiAgICAgICAgYnVmZmVyQXZhaWwgLT0gYnVmZmVyLmxlbmd0aDtcbiAgICAgIH1cbiAgICAgIC8vIGluIGNhc2Ugb2Ygc21hbGwgc2xpY2VzLCBhbGwgdmFsdWVzIHdpbGwgYmUgZ29vZCBhdCB0aGF0IHBvaW50XG4gICAgICAvLyB3ZSd2ZSB3cml0dGVuIGVub3VnaCwgZW5kLi4uXG4gICAgICBpZiAodG90YWxCeXRlc1dyaXR0ZW4gPj0gY29udGVudExlbmd0aCkge1xuICAgICAgICBzdHJlYW0uY2xvc2UoKTtcbiAgICAgICAgcmVzLmVuZCgpO1xuICAgICAgICB0aGlzLmRlc3Ryb3koKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59XG4iXX0=