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
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const triggers = require('../triggers');
const http = require('http');
const Utils = require('../Utils');
const downloadFileFromURI = uri => {
  return new Promise((res, rej) => {
    http.get(uri, response => {
      response.setDefaultEncoding('base64');
      let body = `data:${response.headers['content-type']};base64,`;
      response.on('data', data => body += data);
      response.on('end', () => res(body));
    }).on('error', e => {
      rej(`Error downloading file from ${uri}: ${e.message}`);
    });
  });
};
const addFileDataIfNeeded = async file => {
  if (file._source.format === 'uri') {
    const base64 = await downloadFileFromURI(file._source.uri);
    file._previousSave = file;
    file._data = base64;
    file._requestTask = null;
  }
  return file;
};
class FilesRouter {
  expressRouter({
    maxUploadSize = '20Mb'
  } = {}) {
    var router = _express.default.Router();
    router.get('/files/:appId/:filename', this.getHandler);
    router.get('/files/:appId/metadata/:filename', this.metadataHandler);
    router.post('/files', function (req, res, next) {
      next(new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename not provided.'));
    });
    router.post('/files/:filename', _bodyParser.default.raw({
      type: () => {
        return true;
      },
      limit: maxUploadSize
    }),
    // Allow uploads without Content-Type, or with any Content-Type.
    Middlewares.handleParseHeaders, Middlewares.handleParseSession, this.createHandler);
    router.delete('/files/:filename', Middlewares.handleParseHeaders, Middlewares.handleParseSession, Middlewares.enforceMasterKeyAccess, this.deleteHandler);
    return router;
  }
  getHandler(req, res) {
    const config = _Config.default.get(req.params.appId);
    if (!config) {
      res.status(403);
      const err = new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'Invalid application ID.');
      res.json({
        code: err.code,
        error: err.message
      });
      return;
    }
    const filesController = config.filesController;
    const filename = req.params.filename;
    const contentType = _mime.default.getType(filename);
    if (isFileStreamable(req, filesController)) {
      filesController.handleFileStream(config, filename, req, res, contentType).catch(() => {
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
  async createHandler(req, res, next) {
    var _config$fileUpload;
    const config = req.config;
    const user = req.auth.user;
    const isMaster = req.auth.isMaster;
    const isLinked = user && _node.default.AnonymousUtils.isLinked(user);
    if (!isMaster && !config.fileUpload.enableForAnonymousUser && isLinked) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by anonymous user is disabled.'));
      return;
    }
    if (!isMaster && !config.fileUpload.enableForAuthenticatedUser && !isLinked && user) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by authenticated user is disabled.'));
      return;
    }
    if (!isMaster && !config.fileUpload.enableForPublic && !user) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by public is disabled.'));
      return;
    }
    const filesController = config.filesController;
    const {
      filename
    } = req.params;
    const contentType = req.get('Content-type');
    if (!req.body || !req.body.length) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
      return;
    }
    const error = filesController.validateFilename(filename);
    if (error) {
      next(error);
      return;
    }
    const fileExtensions = (_config$fileUpload = config.fileUpload) === null || _config$fileUpload === void 0 ? void 0 : _config$fileUpload.fileExtensions;
    if (!isMaster && fileExtensions) {
      const isValidExtension = extension => {
        return fileExtensions.some(ext => {
          if (ext === '*') {
            return true;
          }
          const regex = new RegExp(fileExtensions);
          if (regex.test(extension)) {
            return true;
          }
        });
      };
      let extension = contentType;
      if (filename && filename.includes('.')) {
        extension = filename.split('.')[1];
      } else if (contentType && contentType.includes('/')) {
        extension = contentType.split('/')[1];
      }
      extension = extension.split(' ').join('');
      if (!isValidExtension(extension)) {
        next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `File upload of extension ${extension} is disabled.`));
        return;
      }
    }
    const base64 = req.body.toString('base64');
    const file = new _node.default.File(filename, {
      base64
    }, contentType);
    const {
      metadata = {},
      tags = {}
    } = req.fileData || {};
    if (req.config && req.config.requestKeywordDenylist) {
      // Scan request data for denied keywords
      for (const keyword of req.config.requestKeywordDenylist) {
        const match = Utils.objectContainsKeyValue(metadata, keyword.key, keyword.value) || Utils.objectContainsKeyValue(tags, keyword.key, keyword.value);
        if (match) {
          next(new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`));
          return;
        }
      }
    }
    file.setTags(tags);
    file.setMetadata(metadata);
    const fileSize = Buffer.byteLength(req.body);
    const fileObject = {
      file,
      fileSize
    };
    try {
      // run beforeSaveFile trigger
      const triggerResult = await triggers.maybeRunFileTrigger(triggers.Types.beforeSave, fileObject, config, req.auth);
      let saveResult;
      // if a new ParseFile is returned check if it's an already saved file
      if (triggerResult instanceof _node.default.File) {
        fileObject.file = triggerResult;
        if (triggerResult.url()) {
          // set fileSize to null because we wont know how big it is here
          fileObject.fileSize = null;
          saveResult = {
            url: triggerResult.url(),
            name: triggerResult._name
          };
        }
      }
      // if the file returned by the trigger has already been saved skip saving anything
      if (!saveResult) {
        // if the ParseFile returned is type uri, download the file before saving it
        await addFileDataIfNeeded(fileObject.file);
        // update fileSize
        const bufferData = Buffer.from(fileObject.file._data, 'base64');
        fileObject.fileSize = Buffer.byteLength(bufferData);
        // prepare file options
        const fileOptions = {
          metadata: fileObject.file._metadata
        };
        // some s3-compatible providers (DigitalOcean, Linode) do not accept tags
        // so we do not include the tags option if it is empty.
        const fileTags = Object.keys(fileObject.file._tags).length > 0 ? {
          tags: fileObject.file._tags
        } : {};
        Object.assign(fileOptions, fileTags);
        // save file
        const createFileResult = await filesController.createFile(config, fileObject.file._name, bufferData, fileObject.file._source.type, fileOptions);
        // update file with new data
        fileObject.file._name = createFileResult.name;
        fileObject.file._url = createFileResult.url;
        fileObject.file._requestTask = null;
        fileObject.file._previousSave = Promise.resolve(fileObject.file);
        saveResult = {
          url: createFileResult.url,
          name: createFileResult.name
        };
      }
      // run afterSaveFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterSave, fileObject, config, req.auth);
      res.status(201);
      res.set('Location', saveResult.url);
      res.json(saveResult);
    } catch (e) {
      _logger.default.error('Error creating a file: ', e);
      const error = triggers.resolveError(e, {
        code: _node.default.Error.FILE_SAVE_ERROR,
        message: `Could not store file: ${fileObject.file._name}.`
      });
      next(error);
    }
  }
  async deleteHandler(req, res, next) {
    try {
      const {
        filesController
      } = req.config;
      const {
        filename
      } = req.params;
      // run beforeDeleteFile trigger
      const file = new _node.default.File(filename);
      file._url = filesController.adapter.getFileLocation(req.config, filename);
      const fileObject = {
        file,
        fileSize: null
      };
      await triggers.maybeRunFileTrigger(triggers.Types.beforeDelete, fileObject, req.config, req.auth);
      // delete file
      await filesController.deleteFile(req.config, filename);
      // run afterDeleteFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterDelete, fileObject, req.config, req.auth);
      res.status(200);
      // TODO: return useful JSON here?
      res.end();
    } catch (e) {
      _logger.default.error('Error deleting a file: ', e);
      const error = triggers.resolveError(e, {
        code: _node.default.Error.FILE_DELETE_ERROR,
        message: 'Could not delete file.'
      });
      next(error);
    }
  }
  async metadataHandler(req, res) {
    try {
      const config = _Config.default.get(req.params.appId);
      const {
        filesController
      } = config;
      const {
        filename
      } = req.params;
      const data = await filesController.getMetadata(filename);
      res.status(200);
      res.json(data);
    } catch (e) {
      res.status(200);
      res.json({});
    }
  }
}
exports.FilesRouter = FilesRouter;
function isFileStreamable(req, filesController) {
  const range = (req.get('Range') || '/-/').split('-');
  const start = Number(range[0]);
  const end = Number(range[1]);
  return (!isNaN(start) || !isNaN(end)) && typeof filesController.adapter.handleFileStream === 'function';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZXhwcmVzcyIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2JvZHlQYXJzZXIiLCJNaWRkbGV3YXJlcyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX25vZGUiLCJfQ29uZmlnIiwiX21pbWUiLCJfbG9nZ2VyIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsInRyaWdnZXJzIiwiaHR0cCIsIlV0aWxzIiwiZG93bmxvYWRGaWxlRnJvbVVSSSIsInVyaSIsIlByb21pc2UiLCJyZXMiLCJyZWoiLCJyZXNwb25zZSIsInNldERlZmF1bHRFbmNvZGluZyIsImJvZHkiLCJoZWFkZXJzIiwib24iLCJkYXRhIiwiZSIsIm1lc3NhZ2UiLCJhZGRGaWxlRGF0YUlmTmVlZGVkIiwiZmlsZSIsIl9zb3VyY2UiLCJmb3JtYXQiLCJiYXNlNjQiLCJfcHJldmlvdXNTYXZlIiwiX2RhdGEiLCJfcmVxdWVzdFRhc2siLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJtYXhVcGxvYWRTaXplIiwicm91dGVyIiwiZXhwcmVzcyIsIlJvdXRlciIsImdldEhhbmRsZXIiLCJtZXRhZGF0YUhhbmRsZXIiLCJwb3N0IiwicmVxIiwibmV4dCIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsIkJvZHlQYXJzZXIiLCJyYXciLCJ0eXBlIiwibGltaXQiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJoYW5kbGVQYXJzZVNlc3Npb24iLCJjcmVhdGVIYW5kbGVyIiwiZGVsZXRlIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImRlbGV0ZUhhbmRsZXIiLCJjb25maWciLCJDb25maWciLCJwYXJhbXMiLCJhcHBJZCIsInN0YXR1cyIsImVyciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJqc29uIiwiY29kZSIsImVycm9yIiwiZmlsZXNDb250cm9sbGVyIiwiZmlsZW5hbWUiLCJjb250ZW50VHlwZSIsIm1pbWUiLCJnZXRUeXBlIiwiaXNGaWxlU3RyZWFtYWJsZSIsImhhbmRsZUZpbGVTdHJlYW0iLCJjYXRjaCIsImVuZCIsImdldEZpbGVEYXRhIiwidGhlbiIsImxlbmd0aCIsIl9jb25maWckZmlsZVVwbG9hZCIsInVzZXIiLCJhdXRoIiwiaXNNYXN0ZXIiLCJpc0xpbmtlZCIsIkFub255bW91c1V0aWxzIiwiZmlsZVVwbG9hZCIsImVuYWJsZUZvckFub255bW91c1VzZXIiLCJGSUxFX1NBVkVfRVJST1IiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImVuYWJsZUZvclB1YmxpYyIsInZhbGlkYXRlRmlsZW5hbWUiLCJmaWxlRXh0ZW5zaW9ucyIsImlzVmFsaWRFeHRlbnNpb24iLCJleHRlbnNpb24iLCJzb21lIiwiZXh0IiwicmVnZXgiLCJSZWdFeHAiLCJ0ZXN0IiwiaW5jbHVkZXMiLCJzcGxpdCIsImpvaW4iLCJ0b1N0cmluZyIsIkZpbGUiLCJtZXRhZGF0YSIsInRhZ3MiLCJmaWxlRGF0YSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwibWF0Y2giLCJvYmplY3RDb250YWluc0tleVZhbHVlIiwidmFsdWUiLCJJTlZBTElEX0tFWV9OQU1FIiwiSlNPTiIsInN0cmluZ2lmeSIsInNldFRhZ3MiLCJzZXRNZXRhZGF0YSIsImZpbGVTaXplIiwiQnVmZmVyIiwiYnl0ZUxlbmd0aCIsImZpbGVPYmplY3QiLCJ0cmlnZ2VyUmVzdWx0IiwibWF5YmVSdW5GaWxlVHJpZ2dlciIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsInNhdmVSZXN1bHQiLCJ1cmwiLCJuYW1lIiwiX25hbWUiLCJidWZmZXJEYXRhIiwiZnJvbSIsImZpbGVPcHRpb25zIiwiX21ldGFkYXRhIiwiZmlsZVRhZ3MiLCJrZXlzIiwiX3RhZ3MiLCJhc3NpZ24iLCJjcmVhdGVGaWxlUmVzdWx0IiwiY3JlYXRlRmlsZSIsIl91cmwiLCJyZXNvbHZlIiwiYWZ0ZXJTYXZlIiwibG9nZ2VyIiwicmVzb2x2ZUVycm9yIiwiYWRhcHRlciIsImdldEZpbGVMb2NhdGlvbiIsImJlZm9yZURlbGV0ZSIsImRlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZSIsIkZJTEVfREVMRVRFX0VSUk9SIiwiZ2V0TWV0YWRhdGEiLCJleHBvcnRzIiwicmFuZ2UiLCJzdGFydCIsIk51bWJlciIsImlzTmFOIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvRmlsZXNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgQm9keVBhcnNlciBmcm9tICdib2R5LXBhcnNlcic7XG5pbXBvcnQgKiBhcyBNaWRkbGV3YXJlcyBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgbWltZSBmcm9tICdtaW1lJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi4vdHJpZ2dlcnMnKTtcbmNvbnN0IGh0dHAgPSByZXF1aXJlKCdodHRwJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uL1V0aWxzJyk7XG5cbmNvbnN0IGRvd25sb2FkRmlsZUZyb21VUkkgPSB1cmkgPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PiB7XG4gICAgaHR0cFxuICAgICAgLmdldCh1cmksIHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2Uuc2V0RGVmYXVsdEVuY29kaW5nKCdiYXNlNjQnKTtcbiAgICAgICAgbGV0IGJvZHkgPSBgZGF0YToke3Jlc3BvbnNlLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddfTtiYXNlNjQsYDtcbiAgICAgICAgcmVzcG9uc2Uub24oJ2RhdGEnLCBkYXRhID0+IChib2R5ICs9IGRhdGEpKTtcbiAgICAgICAgcmVzcG9uc2Uub24oJ2VuZCcsICgpID0+IHJlcyhib2R5KSk7XG4gICAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIGUgPT4ge1xuICAgICAgICByZWooYEVycm9yIGRvd25sb2FkaW5nIGZpbGUgZnJvbSAke3VyaX06ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgfSk7XG4gIH0pO1xufTtcblxuY29uc3QgYWRkRmlsZURhdGFJZk5lZWRlZCA9IGFzeW5jIGZpbGUgPT4ge1xuICBpZiAoZmlsZS5fc291cmNlLmZvcm1hdCA9PT0gJ3VyaScpIHtcbiAgICBjb25zdCBiYXNlNjQgPSBhd2FpdCBkb3dubG9hZEZpbGVGcm9tVVJJKGZpbGUuX3NvdXJjZS51cmkpO1xuICAgIGZpbGUuX3ByZXZpb3VzU2F2ZSA9IGZpbGU7XG4gICAgZmlsZS5fZGF0YSA9IGJhc2U2NDtcbiAgICBmaWxlLl9yZXF1ZXN0VGFzayA9IG51bGw7XG4gIH1cbiAgcmV0dXJuIGZpbGU7XG59O1xuXG5leHBvcnQgY2xhc3MgRmlsZXNSb3V0ZXIge1xuICBleHByZXNzUm91dGVyKHsgbWF4VXBsb2FkU2l6ZSA9ICcyME1iJyB9ID0ge30pIHtcbiAgICB2YXIgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgICByb3V0ZXIuZ2V0KCcvZmlsZXMvOmFwcElkLzpmaWxlbmFtZScsIHRoaXMuZ2V0SGFuZGxlcik7XG4gICAgcm91dGVyLmdldCgnL2ZpbGVzLzphcHBJZC9tZXRhZGF0YS86ZmlsZW5hbWUnLCB0aGlzLm1ldGFkYXRhSGFuZGxlcik7XG5cbiAgICByb3V0ZXIucG9zdCgnL2ZpbGVzJywgZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIG5vdCBwcm92aWRlZC4nKSk7XG4gICAgfSk7XG5cbiAgICByb3V0ZXIucG9zdChcbiAgICAgICcvZmlsZXMvOmZpbGVuYW1lJyxcbiAgICAgIEJvZHlQYXJzZXIucmF3KHtcbiAgICAgICAgdHlwZTogKCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICBsaW1pdDogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pLCAvLyBBbGxvdyB1cGxvYWRzIHdpdGhvdXQgQ29udGVudC1UeXBlLCBvciB3aXRoIGFueSBDb250ZW50LVR5cGUuXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24sXG4gICAgICB0aGlzLmNyZWF0ZUhhbmRsZXJcbiAgICApO1xuXG4gICAgcm91dGVyLmRlbGV0ZShcbiAgICAgICcvZmlsZXMvOmZpbGVuYW1lJyxcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyxcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlU2Vzc2lvbixcbiAgICAgIE1pZGRsZXdhcmVzLmVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLmRlbGV0ZUhhbmRsZXJcbiAgICApO1xuICAgIHJldHVybiByb3V0ZXI7XG4gIH1cblxuICBnZXRIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdJbnZhbGlkIGFwcGxpY2F0aW9uIElELicpO1xuICAgICAgcmVzLmpzb24oeyBjb2RlOiBlcnIuY29kZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gcmVxLnBhcmFtcy5maWxlbmFtZTtcbiAgICBjb25zdCBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShmaWxlbmFtZSk7XG4gICAgaWYgKGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpKSB7XG4gICAgICBmaWxlc0NvbnRyb2xsZXIuaGFuZGxlRmlsZVN0cmVhbShjb25maWcsIGZpbGVuYW1lLCByZXEsIHJlcywgY29udGVudFR5cGUpLmNhdGNoKCgpID0+IHtcbiAgICAgICAgcmVzLnN0YXR1cyg0MDQpO1xuICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZC4nKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBmaWxlc0NvbnRyb2xsZXJcbiAgICAgICAgLmdldEZpbGVEYXRhKGNvbmZpZywgZmlsZW5hbWUpXG4gICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCBjb250ZW50VHlwZSk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1MZW5ndGgnLCBkYXRhLmxlbmd0aCk7XG4gICAgICAgICAgcmVzLmVuZChkYXRhKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICByZXMuc3RhdHVzKDQwNCk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY3JlYXRlSGFuZGxlcihyZXEsIHJlcywgbmV4dCkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgdXNlciA9IHJlcS5hdXRoLnVzZXI7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSByZXEuYXV0aC5pc01hc3RlcjtcbiAgICBjb25zdCBpc0xpbmtlZCA9IHVzZXIgJiYgUGFyc2UuQW5vbnltb3VzVXRpbHMuaXNMaW5rZWQodXNlcik7XG4gICAgaWYgKCFpc01hc3RlciAmJiAhY29uZmlnLmZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAmJiBpc0xpbmtlZCkge1xuICAgICAgbmV4dChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ZpbGUgdXBsb2FkIGJ5IGFub255bW91cyB1c2VyIGlzIGRpc2FibGVkLicpXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciAmJiAhaXNMaW5rZWQgJiYgdXNlcikge1xuICAgICAgbmV4dChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUixcbiAgICAgICAgICAnRmlsZSB1cGxvYWQgYnkgYXV0aGVudGljYXRlZCB1c2VyIGlzIGRpc2FibGVkLidcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFpc01hc3RlciAmJiAhY29uZmlnLmZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICYmICF1c2VyKSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdGaWxlIHVwbG9hZCBieSBwdWJsaWMgaXMgZGlzYWJsZWQuJykpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGNvbnN0IHsgZmlsZW5hbWUgfSA9IHJlcS5wYXJhbXM7XG4gICAgY29uc3QgY29udGVudFR5cGUgPSByZXEuZ2V0KCdDb250ZW50LXR5cGUnKTtcblxuICAgIGlmICghcmVxLmJvZHkgfHwgIXJlcS5ib2R5Lmxlbmd0aCkge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZXJyb3IgPSBmaWxlc0NvbnRyb2xsZXIudmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSk7XG4gICAgaWYgKGVycm9yKSB7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmaWxlRXh0ZW5zaW9ucyA9IGNvbmZpZy5maWxlVXBsb2FkPy5maWxlRXh0ZW5zaW9ucztcbiAgICBpZiAoIWlzTWFzdGVyICYmIGZpbGVFeHRlbnNpb25zKSB7XG4gICAgICBjb25zdCBpc1ZhbGlkRXh0ZW5zaW9uID0gZXh0ZW5zaW9uID0+IHtcbiAgICAgICAgcmV0dXJuIGZpbGVFeHRlbnNpb25zLnNvbWUoZXh0ID0+IHtcbiAgICAgICAgICBpZiAoZXh0ID09PSAnKicpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoZmlsZUV4dGVuc2lvbnMpO1xuICAgICAgICAgIGlmIChyZWdleC50ZXN0KGV4dGVuc2lvbikpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgbGV0IGV4dGVuc2lvbiA9IGNvbnRlbnRUeXBlO1xuICAgICAgaWYgKGZpbGVuYW1lICYmIGZpbGVuYW1lLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgZXh0ZW5zaW9uID0gZmlsZW5hbWUuc3BsaXQoJy4nKVsxXTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudFR5cGUgJiYgY29udGVudFR5cGUuaW5jbHVkZXMoJy8nKSkge1xuICAgICAgICBleHRlbnNpb24gPSBjb250ZW50VHlwZS5zcGxpdCgnLycpWzFdO1xuICAgICAgfVxuICAgICAgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uLnNwbGl0KCcgJykuam9pbignJyk7XG5cbiAgICAgIGlmICghaXNWYWxpZEV4dGVuc2lvbihleHRlbnNpb24pKSB7XG4gICAgICAgIG5leHQoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgYEZpbGUgdXBsb2FkIG9mIGV4dGVuc2lvbiAke2V4dGVuc2lvbn0gaXMgZGlzYWJsZWQuYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJhc2U2NCA9IHJlcS5ib2R5LnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICBjb25zdCBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUsIHsgYmFzZTY0IH0sIGNvbnRlbnRUeXBlKTtcbiAgICBjb25zdCB7IG1ldGFkYXRhID0ge30sIHRhZ3MgPSB7fSB9ID0gcmVxLmZpbGVEYXRhIHx8IHt9O1xuICAgIGlmIChyZXEuY29uZmlnICYmIHJlcS5jb25maWcucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHJlcS5jb25maWcucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9XG4gICAgICAgICAgVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZShtZXRhZGF0YSwga2V5d29yZC5rZXksIGtleXdvcmQudmFsdWUpIHx8XG4gICAgICAgICAgVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZSh0YWdzLCBrZXl3b3JkLmtleSwga2V5d29yZC52YWx1ZSk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgIG5leHQoXG4gICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgIGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gXG4gICAgICAgICAgICApXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgZmlsZS5zZXRUYWdzKHRhZ3MpO1xuICAgIGZpbGUuc2V0TWV0YWRhdGEobWV0YWRhdGEpO1xuICAgIGNvbnN0IGZpbGVTaXplID0gQnVmZmVyLmJ5dGVMZW5ndGgocmVxLmJvZHkpO1xuICAgIGNvbnN0IGZpbGVPYmplY3QgPSB7IGZpbGUsIGZpbGVTaXplIH07XG4gICAgdHJ5IHtcbiAgICAgIC8vIHJ1biBiZWZvcmVTYXZlRmlsZSB0cmlnZ2VyXG4gICAgICBjb25zdCB0cmlnZ2VyUmVzdWx0ID0gYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgZmlsZU9iamVjdCxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIGxldCBzYXZlUmVzdWx0O1xuICAgICAgLy8gaWYgYSBuZXcgUGFyc2VGaWxlIGlzIHJldHVybmVkIGNoZWNrIGlmIGl0J3MgYW4gYWxyZWFkeSBzYXZlZCBmaWxlXG4gICAgICBpZiAodHJpZ2dlclJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLkZpbGUpIHtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlID0gdHJpZ2dlclJlc3VsdDtcbiAgICAgICAgaWYgKHRyaWdnZXJSZXN1bHQudXJsKCkpIHtcbiAgICAgICAgICAvLyBzZXQgZmlsZVNpemUgdG8gbnVsbCBiZWNhdXNlIHdlIHdvbnQga25vdyBob3cgYmlnIGl0IGlzIGhlcmVcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGVTaXplID0gbnVsbDtcbiAgICAgICAgICBzYXZlUmVzdWx0ID0ge1xuICAgICAgICAgICAgdXJsOiB0cmlnZ2VyUmVzdWx0LnVybCgpLFxuICAgICAgICAgICAgbmFtZTogdHJpZ2dlclJlc3VsdC5fbmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBpZiB0aGUgZmlsZSByZXR1cm5lZCBieSB0aGUgdHJpZ2dlciBoYXMgYWxyZWFkeSBiZWVuIHNhdmVkIHNraXAgc2F2aW5nIGFueXRoaW5nXG4gICAgICBpZiAoIXNhdmVSZXN1bHQpIHtcbiAgICAgICAgLy8gaWYgdGhlIFBhcnNlRmlsZSByZXR1cm5lZCBpcyB0eXBlIHVyaSwgZG93bmxvYWQgdGhlIGZpbGUgYmVmb3JlIHNhdmluZyBpdFxuICAgICAgICBhd2FpdCBhZGRGaWxlRGF0YUlmTmVlZGVkKGZpbGVPYmplY3QuZmlsZSk7XG4gICAgICAgIC8vIHVwZGF0ZSBmaWxlU2l6ZVxuICAgICAgICBjb25zdCBidWZmZXJEYXRhID0gQnVmZmVyLmZyb20oZmlsZU9iamVjdC5maWxlLl9kYXRhLCAnYmFzZTY0Jyk7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZVNpemUgPSBCdWZmZXIuYnl0ZUxlbmd0aChidWZmZXJEYXRhKTtcbiAgICAgICAgLy8gcHJlcGFyZSBmaWxlIG9wdGlvbnNcbiAgICAgICAgY29uc3QgZmlsZU9wdGlvbnMgPSB7XG4gICAgICAgICAgbWV0YWRhdGE6IGZpbGVPYmplY3QuZmlsZS5fbWV0YWRhdGEsXG4gICAgICAgIH07XG4gICAgICAgIC8vIHNvbWUgczMtY29tcGF0aWJsZSBwcm92aWRlcnMgKERpZ2l0YWxPY2VhbiwgTGlub2RlKSBkbyBub3QgYWNjZXB0IHRhZ3NcbiAgICAgICAgLy8gc28gd2UgZG8gbm90IGluY2x1ZGUgdGhlIHRhZ3Mgb3B0aW9uIGlmIGl0IGlzIGVtcHR5LlxuICAgICAgICBjb25zdCBmaWxlVGFncyA9XG4gICAgICAgICAgT2JqZWN0LmtleXMoZmlsZU9iamVjdC5maWxlLl90YWdzKS5sZW5ndGggPiAwID8geyB0YWdzOiBmaWxlT2JqZWN0LmZpbGUuX3RhZ3MgfSA6IHt9O1xuICAgICAgICBPYmplY3QuYXNzaWduKGZpbGVPcHRpb25zLCBmaWxlVGFncyk7XG4gICAgICAgIC8vIHNhdmUgZmlsZVxuICAgICAgICBjb25zdCBjcmVhdGVGaWxlUmVzdWx0ID0gYXdhaXQgZmlsZXNDb250cm9sbGVyLmNyZWF0ZUZpbGUoXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGZpbGVPYmplY3QuZmlsZS5fbmFtZSxcbiAgICAgICAgICBidWZmZXJEYXRhLFxuICAgICAgICAgIGZpbGVPYmplY3QuZmlsZS5fc291cmNlLnR5cGUsXG4gICAgICAgICAgZmlsZU9wdGlvbnNcbiAgICAgICAgKTtcbiAgICAgICAgLy8gdXBkYXRlIGZpbGUgd2l0aCBuZXcgZGF0YVxuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX25hbWUgPSBjcmVhdGVGaWxlUmVzdWx0Lm5hbWU7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fdXJsID0gY3JlYXRlRmlsZVJlc3VsdC51cmw7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fcmVxdWVzdFRhc2sgPSBudWxsO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3ByZXZpb3VzU2F2ZSA9IFByb21pc2UucmVzb2x2ZShmaWxlT2JqZWN0LmZpbGUpO1xuICAgICAgICBzYXZlUmVzdWx0ID0ge1xuICAgICAgICAgIHVybDogY3JlYXRlRmlsZVJlc3VsdC51cmwsXG4gICAgICAgICAgbmFtZTogY3JlYXRlRmlsZVJlc3VsdC5uYW1lLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgLy8gcnVuIGFmdGVyU2F2ZUZpbGUgdHJpZ2dlclxuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsIGZpbGVPYmplY3QsIGNvbmZpZywgcmVxLmF1dGgpO1xuICAgICAgcmVzLnN0YXR1cygyMDEpO1xuICAgICAgcmVzLnNldCgnTG9jYXRpb24nLCBzYXZlUmVzdWx0LnVybCk7XG4gICAgICByZXMuanNvbihzYXZlUmVzdWx0KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGNyZWF0aW5nIGEgZmlsZTogJywgZSk7XG4gICAgICBjb25zdCBlcnJvciA9IHRyaWdnZXJzLnJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUixcbiAgICAgICAgbWVzc2FnZTogYENvdWxkIG5vdCBzdG9yZSBmaWxlOiAke2ZpbGVPYmplY3QuZmlsZS5fbmFtZX0uYCxcbiAgICAgIH0pO1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZGVsZXRlSGFuZGxlcihyZXEsIHJlcywgbmV4dCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IGZpbGVzQ29udHJvbGxlciB9ID0gcmVxLmNvbmZpZztcbiAgICAgIGNvbnN0IHsgZmlsZW5hbWUgfSA9IHJlcS5wYXJhbXM7XG4gICAgICAvLyBydW4gYmVmb3JlRGVsZXRlRmlsZSB0cmlnZ2VyXG4gICAgICBjb25zdCBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUpO1xuICAgICAgZmlsZS5fdXJsID0gZmlsZXNDb250cm9sbGVyLmFkYXB0ZXIuZ2V0RmlsZUxvY2F0aW9uKHJlcS5jb25maWcsIGZpbGVuYW1lKTtcbiAgICAgIGNvbnN0IGZpbGVPYmplY3QgPSB7IGZpbGUsIGZpbGVTaXplOiBudWxsIH07XG4gICAgICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1bkZpbGVUcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIHJlcS5hdXRoXG4gICAgICApO1xuICAgICAgLy8gZGVsZXRlIGZpbGVcbiAgICAgIGF3YWl0IGZpbGVzQ29udHJvbGxlci5kZWxldGVGaWxlKHJlcS5jb25maWcsIGZpbGVuYW1lKTtcbiAgICAgIC8vIHJ1biBhZnRlckRlbGV0ZUZpbGUgdHJpZ2dlclxuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJEZWxldGUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIHJlcS5hdXRoXG4gICAgICApO1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgLy8gVE9ETzogcmV0dXJuIHVzZWZ1bCBKU09OIGhlcmU/XG4gICAgICByZXMuZW5kKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBkZWxldGluZyBhIGZpbGU6ICcsIGUpO1xuICAgICAgY29uc3QgZXJyb3IgPSB0cmlnZ2Vycy5yZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5GSUxFX0RFTEVURV9FUlJPUixcbiAgICAgICAgbWVzc2FnZTogJ0NvdWxkIG5vdCBkZWxldGUgZmlsZS4nLFxuICAgICAgfSk7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBtZXRhZGF0YUhhbmRsZXIocmVxLCByZXMpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICAgIGNvbnN0IHsgZmlsZXNDb250cm9sbGVyIH0gPSBjb25maWc7XG4gICAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5nZXRNZXRhZGF0YShmaWxlbmFtZSk7XG4gICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICByZXMuanNvbihkYXRhKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICByZXMuanNvbih7fSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpIHtcbiAgY29uc3QgcmFuZ2UgPSAocmVxLmdldCgnUmFuZ2UnKSB8fCAnLy0vJykuc3BsaXQoJy0nKTtcbiAgY29uc3Qgc3RhcnQgPSBOdW1iZXIocmFuZ2VbMF0pO1xuICBjb25zdCBlbmQgPSBOdW1iZXIocmFuZ2VbMV0pO1xuICByZXR1cm4gKFxuICAgICghaXNOYU4oc3RhcnQpIHx8ICFpc05hTihlbmQpKSAmJiB0eXBlb2YgZmlsZXNDb250cm9sbGVyLmFkYXB0ZXIuaGFuZGxlRmlsZVN0cmVhbSA9PT0gJ2Z1bmN0aW9uJ1xuICApO1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxXQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxXQUFBLEdBQUFDLHVCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxLQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxPQUFBLEdBQUFSLHNCQUFBLENBQUFDLE9BQUE7QUFBK0IsU0FBQVEseUJBQUFD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