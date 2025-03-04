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
var _logger = _interopRequireDefault(require("../logger"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
  async getHandler(req, res) {
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
    const mime = (await import('mime')).default;
    const contentType = mime.getType(filename);
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
      var _extension;
      const isValidExtension = extension => {
        return fileExtensions.some(ext => {
          if (ext === '*') {
            return true;
          }
          const regex = new RegExp(ext);
          if (regex.test(extension)) {
            return true;
          }
        });
      };
      let extension = contentType;
      if (filename && filename.includes('.')) {
        extension = filename.substring(filename.lastIndexOf('.') + 1);
      } else if (contentType && contentType.includes('/')) {
        extension = contentType.split('/')[1];
      }
      extension = (_extension = extension) === null || _extension === void 0 || (_extension = _extension.split(' ')) === null || _extension === void 0 ? void 0 : _extension.join('');
      if (extension && !isValidExtension(extension)) {
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
    try {
      // Scan request data for denied keywords
      Utils.checkProhibitedKeywords(config, metadata);
      Utils.checkProhibitedKeywords(config, tags);
    } catch (error) {
      next(new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, error));
      return;
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
      file._url = await filesController.adapter.getFileLocation(req.config, filename);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZXhwcmVzcyIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2JvZHlQYXJzZXIiLCJNaWRkbGV3YXJlcyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX25vZGUiLCJfQ29uZmlnIiwiX2xvZ2dlciIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsInRyaWdnZXJzIiwiaHR0cCIsIlV0aWxzIiwiZG93bmxvYWRGaWxlRnJvbVVSSSIsInVyaSIsIlByb21pc2UiLCJyZXMiLCJyZWoiLCJyZXNwb25zZSIsInNldERlZmF1bHRFbmNvZGluZyIsImJvZHkiLCJoZWFkZXJzIiwib24iLCJkYXRhIiwibWVzc2FnZSIsImFkZEZpbGVEYXRhSWZOZWVkZWQiLCJmaWxlIiwiX3NvdXJjZSIsImZvcm1hdCIsImJhc2U2NCIsIl9wcmV2aW91c1NhdmUiLCJfZGF0YSIsIl9yZXF1ZXN0VGFzayIsIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsIm1heFVwbG9hZFNpemUiLCJyb3V0ZXIiLCJleHByZXNzIiwiUm91dGVyIiwiZ2V0SGFuZGxlciIsIm1ldGFkYXRhSGFuZGxlciIsInBvc3QiLCJyZXEiLCJuZXh0IiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfRklMRV9OQU1FIiwiQm9keVBhcnNlciIsInJhdyIsInR5cGUiLCJsaW1pdCIsImhhbmRsZVBhcnNlSGVhZGVycyIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsImNyZWF0ZUhhbmRsZXIiLCJkZWxldGUiLCJlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiZGVsZXRlSGFuZGxlciIsImNvbmZpZyIsIkNvbmZpZyIsInBhcmFtcyIsImFwcElkIiwic3RhdHVzIiwiZXJyIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImpzb24iLCJjb2RlIiwiZXJyb3IiLCJmaWxlc0NvbnRyb2xsZXIiLCJmaWxlbmFtZSIsIm1pbWUiLCJjb250ZW50VHlwZSIsImdldFR5cGUiLCJpc0ZpbGVTdHJlYW1hYmxlIiwiaGFuZGxlRmlsZVN0cmVhbSIsImNhdGNoIiwiZW5kIiwiZ2V0RmlsZURhdGEiLCJ0aGVuIiwibGVuZ3RoIiwiX2NvbmZpZyRmaWxlVXBsb2FkIiwidXNlciIsImF1dGgiLCJpc01hc3RlciIsImlzTGlua2VkIiwiQW5vbnltb3VzVXRpbHMiLCJmaWxlVXBsb2FkIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZJTEVfU0FWRV9FUlJPUiIsImVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIiwiZW5hYmxlRm9yUHVibGljIiwidmFsaWRhdGVGaWxlbmFtZSIsImZpbGVFeHRlbnNpb25zIiwiX2V4dGVuc2lvbiIsImlzVmFsaWRFeHRlbnNpb24iLCJleHRlbnNpb24iLCJzb21lIiwiZXh0IiwicmVnZXgiLCJSZWdFeHAiLCJ0ZXN0IiwiaW5jbHVkZXMiLCJzdWJzdHJpbmciLCJsYXN0SW5kZXhPZiIsInNwbGl0Iiwiam9pbiIsInRvU3RyaW5nIiwiRmlsZSIsIm1ldGFkYXRhIiwidGFncyIsImZpbGVEYXRhIiwiY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMiLCJJTlZBTElEX0tFWV9OQU1FIiwic2V0VGFncyIsInNldE1ldGFkYXRhIiwiZmlsZVNpemUiLCJCdWZmZXIiLCJieXRlTGVuZ3RoIiwiZmlsZU9iamVjdCIsInRyaWdnZXJSZXN1bHQiLCJtYXliZVJ1bkZpbGVUcmlnZ2VyIiwiVHlwZXMiLCJiZWZvcmVTYXZlIiwic2F2ZVJlc3VsdCIsInVybCIsIm5hbWUiLCJfbmFtZSIsImJ1ZmZlckRhdGEiLCJmcm9tIiwiZmlsZU9wdGlvbnMiLCJfbWV0YWRhdGEiLCJmaWxlVGFncyIsImtleXMiLCJfdGFncyIsImFzc2lnbiIsImNyZWF0ZUZpbGVSZXN1bHQiLCJjcmVhdGVGaWxlIiwiX3VybCIsInJlc29sdmUiLCJhZnRlclNhdmUiLCJsb2dnZXIiLCJyZXNvbHZlRXJyb3IiLCJhZGFwdGVyIiwiZ2V0RmlsZUxvY2F0aW9uIiwiYmVmb3JlRGVsZXRlIiwiZGVsZXRlRmlsZSIsImFmdGVyRGVsZXRlIiwiRklMRV9ERUxFVEVfRVJST1IiLCJnZXRNZXRhZGF0YSIsImV4cG9ydHMiLCJyYW5nZSIsInN0YXJ0IiwiTnVtYmVyIiwiaXNOYU4iXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9GaWxlc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCBCb2R5UGFyc2VyIGZyb20gJ2JvZHktcGFyc2VyJztcbmltcG9ydCAqIGFzIE1pZGRsZXdhcmVzIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi4vdHJpZ2dlcnMnKTtcbmNvbnN0IGh0dHAgPSByZXF1aXJlKCdodHRwJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uL1V0aWxzJyk7XG5cbmNvbnN0IGRvd25sb2FkRmlsZUZyb21VUkkgPSB1cmkgPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PiB7XG4gICAgaHR0cFxuICAgICAgLmdldCh1cmksIHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2Uuc2V0RGVmYXVsdEVuY29kaW5nKCdiYXNlNjQnKTtcbiAgICAgICAgbGV0IGJvZHkgPSBgZGF0YToke3Jlc3BvbnNlLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddfTtiYXNlNjQsYDtcbiAgICAgICAgcmVzcG9uc2Uub24oJ2RhdGEnLCBkYXRhID0+IChib2R5ICs9IGRhdGEpKTtcbiAgICAgICAgcmVzcG9uc2Uub24oJ2VuZCcsICgpID0+IHJlcyhib2R5KSk7XG4gICAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIGUgPT4ge1xuICAgICAgICByZWooYEVycm9yIGRvd25sb2FkaW5nIGZpbGUgZnJvbSAke3VyaX06ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgfSk7XG4gIH0pO1xufTtcblxuY29uc3QgYWRkRmlsZURhdGFJZk5lZWRlZCA9IGFzeW5jIGZpbGUgPT4ge1xuICBpZiAoZmlsZS5fc291cmNlLmZvcm1hdCA9PT0gJ3VyaScpIHtcbiAgICBjb25zdCBiYXNlNjQgPSBhd2FpdCBkb3dubG9hZEZpbGVGcm9tVVJJKGZpbGUuX3NvdXJjZS51cmkpO1xuICAgIGZpbGUuX3ByZXZpb3VzU2F2ZSA9IGZpbGU7XG4gICAgZmlsZS5fZGF0YSA9IGJhc2U2NDtcbiAgICBmaWxlLl9yZXF1ZXN0VGFzayA9IG51bGw7XG4gIH1cbiAgcmV0dXJuIGZpbGU7XG59O1xuXG5leHBvcnQgY2xhc3MgRmlsZXNSb3V0ZXIge1xuICBleHByZXNzUm91dGVyKHsgbWF4VXBsb2FkU2l6ZSA9ICcyME1iJyB9ID0ge30pIHtcbiAgICB2YXIgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgICByb3V0ZXIuZ2V0KCcvZmlsZXMvOmFwcElkLzpmaWxlbmFtZScsIHRoaXMuZ2V0SGFuZGxlcik7XG4gICAgcm91dGVyLmdldCgnL2ZpbGVzLzphcHBJZC9tZXRhZGF0YS86ZmlsZW5hbWUnLCB0aGlzLm1ldGFkYXRhSGFuZGxlcik7XG5cbiAgICByb3V0ZXIucG9zdCgnL2ZpbGVzJywgZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIG5vdCBwcm92aWRlZC4nKSk7XG4gICAgfSk7XG5cbiAgICByb3V0ZXIucG9zdChcbiAgICAgICcvZmlsZXMvOmZpbGVuYW1lJyxcbiAgICAgIEJvZHlQYXJzZXIucmF3KHtcbiAgICAgICAgdHlwZTogKCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICBsaW1pdDogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pLCAvLyBBbGxvdyB1cGxvYWRzIHdpdGhvdXQgQ29udGVudC1UeXBlLCBvciB3aXRoIGFueSBDb250ZW50LVR5cGUuXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24sXG4gICAgICB0aGlzLmNyZWF0ZUhhbmRsZXJcbiAgICApO1xuXG4gICAgcm91dGVyLmRlbGV0ZShcbiAgICAgICcvZmlsZXMvOmZpbGVuYW1lJyxcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyxcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlU2Vzc2lvbixcbiAgICAgIE1pZGRsZXdhcmVzLmVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLmRlbGV0ZUhhbmRsZXJcbiAgICApO1xuICAgIHJldHVybiByb3V0ZXI7XG4gIH1cblxuICBhc3luYyBnZXRIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdJbnZhbGlkIGFwcGxpY2F0aW9uIElELicpO1xuICAgICAgcmVzLmpzb24oeyBjb2RlOiBlcnIuY29kZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gcmVxLnBhcmFtcy5maWxlbmFtZTtcbiAgICBjb25zdCBtaW1lID0gKGF3YWl0IGltcG9ydCgnbWltZScpKS5kZWZhdWx0O1xuICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gbWltZS5nZXRUeXBlKGZpbGVuYW1lKTtcbiAgICBpZiAoaXNGaWxlU3RyZWFtYWJsZShyZXEsIGZpbGVzQ29udHJvbGxlcikpIHtcbiAgICAgIGZpbGVzQ29udHJvbGxlci5oYW5kbGVGaWxlU3RyZWFtKGNvbmZpZywgZmlsZW5hbWUsIHJlcSwgcmVzLCBjb250ZW50VHlwZSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICByZXMuc3RhdHVzKDQwNCk7XG4gICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtVHlwZScsICd0ZXh0L3BsYWluJyk7XG4gICAgICAgIHJlcy5lbmQoJ0ZpbGUgbm90IGZvdW5kLicpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpbGVzQ29udHJvbGxlclxuICAgICAgICAuZ2V0RmlsZURhdGEoY29uZmlnLCBmaWxlbmFtZSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtVHlwZScsIGNvbnRlbnRUeXBlKTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LUxlbmd0aCcsIGRhdGEubGVuZ3RoKTtcbiAgICAgICAgICByZXMuZW5kKGRhdGEpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIHJlcy5zdGF0dXMoNDA0KTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgICAgIHJlcy5lbmQoJ0ZpbGUgbm90IGZvdW5kLicpO1xuICAgICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjcmVhdGVIYW5kbGVyKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCB1c2VyID0gcmVxLmF1dGgudXNlcjtcbiAgICBjb25zdCBpc01hc3RlciA9IHJlcS5hdXRoLmlzTWFzdGVyO1xuICAgIGNvbnN0IGlzTGlua2VkID0gdXNlciAmJiBQYXJzZS5Bbm9ueW1vdXNVdGlscy5pc0xpbmtlZCh1c2VyKTtcbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyICYmIGlzTGlua2VkKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnRmlsZSB1cGxvYWQgYnkgYW5vbnltb3VzIHVzZXIgaXMgZGlzYWJsZWQuJylcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghaXNNYXN0ZXIgJiYgIWNvbmZpZy5maWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICYmICFpc0xpbmtlZCAmJiB1c2VyKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICdGaWxlIHVwbG9hZCBieSBhdXRoZW50aWNhdGVkIHVzZXIgaXMgZGlzYWJsZWQuJ1xuICAgICAgICApXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgJiYgIXVzZXIpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ZpbGUgdXBsb2FkIGJ5IHB1YmxpYyBpcyBkaXNhYmxlZC4nKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpbGVzQ29udHJvbGxlciA9IGNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgY29uc3QgeyBmaWxlbmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlcS5nZXQoJ0NvbnRlbnQtdHlwZScpO1xuXG4gICAgaWYgKCFyZXEuYm9keSB8fCAhcmVxLmJvZHkubGVuZ3RoKSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdJbnZhbGlkIGZpbGUgdXBsb2FkLicpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlcnJvciA9IGZpbGVzQ29udHJvbGxlci52YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lKTtcbiAgICBpZiAoZXJyb3IpIHtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGVFeHRlbnNpb25zID0gY29uZmlnLmZpbGVVcGxvYWQ/LmZpbGVFeHRlbnNpb25zO1xuICAgIGlmICghaXNNYXN0ZXIgJiYgZmlsZUV4dGVuc2lvbnMpIHtcbiAgICAgIGNvbnN0IGlzVmFsaWRFeHRlbnNpb24gPSBleHRlbnNpb24gPT4ge1xuICAgICAgICByZXR1cm4gZmlsZUV4dGVuc2lvbnMuc29tZShleHQgPT4ge1xuICAgICAgICAgIGlmIChleHQgPT09ICcqJykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChleHQpO1xuICAgICAgICAgIGlmIChyZWdleC50ZXN0KGV4dGVuc2lvbikpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgbGV0IGV4dGVuc2lvbiA9IGNvbnRlbnRUeXBlO1xuICAgICAgaWYgKGZpbGVuYW1lICYmIGZpbGVuYW1lLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgZXh0ZW5zaW9uID0gZmlsZW5hbWUuc3Vic3RyaW5nKGZpbGVuYW1lLmxhc3RJbmRleE9mKCcuJykgKyAxKTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudFR5cGUgJiYgY29udGVudFR5cGUuaW5jbHVkZXMoJy8nKSkge1xuICAgICAgICBleHRlbnNpb24gPSBjb250ZW50VHlwZS5zcGxpdCgnLycpWzFdO1xuICAgICAgfVxuICAgICAgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uPy5zcGxpdCgnICcpPy5qb2luKCcnKTtcblxuICAgICAgaWYgKGV4dGVuc2lvbiAmJiAhaXNWYWxpZEV4dGVuc2lvbihleHRlbnNpb24pKSB7XG4gICAgICAgIG5leHQoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgYEZpbGUgdXBsb2FkIG9mIGV4dGVuc2lvbiAke2V4dGVuc2lvbn0gaXMgZGlzYWJsZWQuYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJhc2U2NCA9IHJlcS5ib2R5LnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICBjb25zdCBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUsIHsgYmFzZTY0IH0sIGNvbnRlbnRUeXBlKTtcbiAgICBjb25zdCB7IG1ldGFkYXRhID0ge30sIHRhZ3MgPSB7fSB9ID0gcmVxLmZpbGVEYXRhIHx8IHt9O1xuICAgIHRyeSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBVdGlscy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyhjb25maWcsIG1ldGFkYXRhKTtcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKGNvbmZpZywgdGFncyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZpbGUuc2V0VGFncyh0YWdzKTtcbiAgICBmaWxlLnNldE1ldGFkYXRhKG1ldGFkYXRhKTtcbiAgICBjb25zdCBmaWxlU2l6ZSA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHJlcS5ib2R5KTtcbiAgICBjb25zdCBmaWxlT2JqZWN0ID0geyBmaWxlLCBmaWxlU2l6ZSB9O1xuICAgIHRyeSB7XG4gICAgICAvLyBydW4gYmVmb3JlU2F2ZUZpbGUgdHJpZ2dlclxuICAgICAgY29uc3QgdHJpZ2dlclJlc3VsdCA9IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGhcbiAgICAgICk7XG4gICAgICBsZXQgc2F2ZVJlc3VsdDtcbiAgICAgIC8vIGlmIGEgbmV3IFBhcnNlRmlsZSBpcyByZXR1cm5lZCBjaGVjayBpZiBpdCdzIGFuIGFscmVhZHkgc2F2ZWQgZmlsZVxuICAgICAgaWYgKHRyaWdnZXJSZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5GaWxlKSB7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZSA9IHRyaWdnZXJSZXN1bHQ7XG4gICAgICAgIGlmICh0cmlnZ2VyUmVzdWx0LnVybCgpKSB7XG4gICAgICAgICAgLy8gc2V0IGZpbGVTaXplIHRvIG51bGwgYmVjYXVzZSB3ZSB3b250IGtub3cgaG93IGJpZyBpdCBpcyBoZXJlXG4gICAgICAgICAgZmlsZU9iamVjdC5maWxlU2l6ZSA9IG51bGw7XG4gICAgICAgICAgc2F2ZVJlc3VsdCA9IHtcbiAgICAgICAgICAgIHVybDogdHJpZ2dlclJlc3VsdC51cmwoKSxcbiAgICAgICAgICAgIG5hbWU6IHRyaWdnZXJSZXN1bHQuX25hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gaWYgdGhlIGZpbGUgcmV0dXJuZWQgYnkgdGhlIHRyaWdnZXIgaGFzIGFscmVhZHkgYmVlbiBzYXZlZCBza2lwIHNhdmluZyBhbnl0aGluZ1xuICAgICAgaWYgKCFzYXZlUmVzdWx0KSB7XG4gICAgICAgIC8vIGlmIHRoZSBQYXJzZUZpbGUgcmV0dXJuZWQgaXMgdHlwZSB1cmksIGRvd25sb2FkIHRoZSBmaWxlIGJlZm9yZSBzYXZpbmcgaXRcbiAgICAgICAgYXdhaXQgYWRkRmlsZURhdGFJZk5lZWRlZChmaWxlT2JqZWN0LmZpbGUpO1xuICAgICAgICAvLyB1cGRhdGUgZmlsZVNpemVcbiAgICAgICAgY29uc3QgYnVmZmVyRGF0YSA9IEJ1ZmZlci5mcm9tKGZpbGVPYmplY3QuZmlsZS5fZGF0YSwgJ2Jhc2U2NCcpO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGVTaXplID0gQnVmZmVyLmJ5dGVMZW5ndGgoYnVmZmVyRGF0YSk7XG4gICAgICAgIC8vIHByZXBhcmUgZmlsZSBvcHRpb25zXG4gICAgICAgIGNvbnN0IGZpbGVPcHRpb25zID0ge1xuICAgICAgICAgIG1ldGFkYXRhOiBmaWxlT2JqZWN0LmZpbGUuX21ldGFkYXRhLFxuICAgICAgICB9O1xuICAgICAgICAvLyBzb21lIHMzLWNvbXBhdGlibGUgcHJvdmlkZXJzIChEaWdpdGFsT2NlYW4sIExpbm9kZSkgZG8gbm90IGFjY2VwdCB0YWdzXG4gICAgICAgIC8vIHNvIHdlIGRvIG5vdCBpbmNsdWRlIHRoZSB0YWdzIG9wdGlvbiBpZiBpdCBpcyBlbXB0eS5cbiAgICAgICAgY29uc3QgZmlsZVRhZ3MgPVxuICAgICAgICAgIE9iamVjdC5rZXlzKGZpbGVPYmplY3QuZmlsZS5fdGFncykubGVuZ3RoID4gMCA/IHsgdGFnczogZmlsZU9iamVjdC5maWxlLl90YWdzIH0gOiB7fTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihmaWxlT3B0aW9ucywgZmlsZVRhZ3MpO1xuICAgICAgICAvLyBzYXZlIGZpbGVcbiAgICAgICAgY29uc3QgY3JlYXRlRmlsZVJlc3VsdCA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5jcmVhdGVGaWxlKFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX25hbWUsXG4gICAgICAgICAgYnVmZmVyRGF0YSxcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3NvdXJjZS50eXBlLFxuICAgICAgICAgIGZpbGVPcHRpb25zXG4gICAgICAgICk7XG4gICAgICAgIC8vIHVwZGF0ZSBmaWxlIHdpdGggbmV3IGRhdGFcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9uYW1lID0gY3JlYXRlRmlsZVJlc3VsdC5uYW1lO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3VybCA9IGNyZWF0ZUZpbGVSZXN1bHQudXJsO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3JlcXVlc3RUYXNrID0gbnVsbDtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9wcmV2aW91c1NhdmUgPSBQcm9taXNlLnJlc29sdmUoZmlsZU9iamVjdC5maWxlKTtcbiAgICAgICAgc2F2ZVJlc3VsdCA9IHtcbiAgICAgICAgICB1cmw6IGNyZWF0ZUZpbGVSZXN1bHQudXJsLFxuICAgICAgICAgIG5hbWU6IGNyZWF0ZUZpbGVSZXN1bHQubmFtZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIC8vIHJ1biBhZnRlclNhdmVGaWxlIHRyaWdnZXJcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLCBmaWxlT2JqZWN0LCBjb25maWcsIHJlcS5hdXRoKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAxKTtcbiAgICAgIHJlcy5zZXQoJ0xvY2F0aW9uJywgc2F2ZVJlc3VsdC51cmwpO1xuICAgICAgcmVzLmpzb24oc2F2ZVJlc3VsdCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyBhIGZpbGU6ICcsIGUpO1xuICAgICAgY29uc3QgZXJyb3IgPSB0cmlnZ2Vycy5yZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgIG1lc3NhZ2U6IGBDb3VsZCBub3Qgc3RvcmUgZmlsZTogJHtmaWxlT2JqZWN0LmZpbGUuX25hbWV9LmAsXG4gICAgICB9KTtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUhhbmRsZXIocmVxLCByZXMsIG5leHQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBmaWxlc0NvbnRyb2xsZXIgfSA9IHJlcS5jb25maWc7XG4gICAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgLy8gcnVuIGJlZm9yZURlbGV0ZUZpbGUgdHJpZ2dlclxuICAgICAgY29uc3QgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lKTtcbiAgICAgIGZpbGUuX3VybCA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmdldEZpbGVMb2NhdGlvbihyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICBjb25zdCBmaWxlT2JqZWN0ID0geyBmaWxlLCBmaWxlU2l6ZTogbnVsbCB9O1xuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIC8vIGRlbGV0ZSBmaWxlXG4gICAgICBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZGVsZXRlRmlsZShyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICAvLyBydW4gYWZ0ZXJEZWxldGVGaWxlIHRyaWdnZXJcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgIC8vIFRPRE86IHJldHVybiB1c2VmdWwgSlNPTiBoZXJlP1xuICAgICAgcmVzLmVuZCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgZGVsZXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgIGNvbnN0IGVycm9yID0gdHJpZ2dlcnMucmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuRklMRV9ERUxFVEVfRVJST1IsXG4gICAgICAgIG1lc3NhZ2U6ICdDb3VsZCBub3QgZGVsZXRlIGZpbGUuJyxcbiAgICAgIH0pO1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbWV0YWRhdGFIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgICBjb25zdCB7IGZpbGVzQ29udHJvbGxlciB9ID0gY29uZmlnO1xuICAgICAgY29uc3QgeyBmaWxlbmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZ2V0TWV0YWRhdGEoZmlsZW5hbWUpO1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgcmVzLmpzb24oZGF0YSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgcmVzLmpzb24oe30pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBpc0ZpbGVTdHJlYW1hYmxlKHJlcSwgZmlsZXNDb250cm9sbGVyKSB7XG4gIGNvbnN0IHJhbmdlID0gKHJlcS5nZXQoJ1JhbmdlJykgfHwgJy8tLycpLnNwbGl0KCctJyk7XG4gIGNvbnN0IHN0YXJ0ID0gTnVtYmVyKHJhbmdlWzBdKTtcbiAgY29uc3QgZW5kID0gTnVtYmVyKHJhbmdlWzFdKTtcbiAgcmV0dXJuIChcbiAgICAoIWlzTmFOKHN0YXJ0KSB8fCAhaXNOYU4oZW5kKSkgJiYgdHlwZW9mIGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmhhbmRsZUZpbGVTdHJlYW0gPT09ICdmdW5jdGlvbidcbiAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsV0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsV0FBQSxHQUFBQyx1QkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksS0FBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU0sT0FBQSxHQUFBUCxzQkFBQSxDQUFBQyxPQUFBO0FBQStCLFNBQUFPLHlCQUFBQyxDQUFBLDZCQUFBQyxPQUFBLG1CQUFBQyxDQUFBLE9BQUFELE9BQUEsSUFBQUUsQ0FBQSxPQUFBRixPQUFBLFlBQUFGLHdCQUFBLFlBQUFBLENBQUFDLENBQUEsV0FBQUEsQ0FBQSxHQUFBRyxDQUFBLEdBQUFELENBQUEsS0FBQUYsQ0FBQTtBQUFBLFNBQUFMLHdCQUFBSyxDQUFBLEVBQUFFLENBQUEsU0FBQUEsQ0FBQSxJQUFBRixDQUFBLElBQUFBLENBQUEsQ0FBQUksVUFBQSxTQUFBSixDQUFBLGVBQUFBLENBQUEsdUJBQUFBLENBQUEseUJBQUFBLENBQUEsV0FBQUssT0FBQSxFQUFBTCxDQUFBLFFBQUFHLENBQUEsR0FBQUosd0JBQUEsQ0FBQUcsQ0FBQSxPQUFBQyxDQUFBLElBQUFBLENBQUEsQ0FBQUcsR0FBQSxDQUFBTixDQUFBLFVBQUFHLENBQUEsQ0FBQUksR0FBQSxDQUFBUCxDQUFBLE9BQUFRLENBQUEsS0FBQUMsU0FBQSxVQUFBQyxDQUFBLEdBQUFDLE1BQUEsQ0FBQUMsY0FBQSxJQUFBRCxNQUFBLENBQUFFLHdCQUFBLFdBQUFDLENBQUEsSUFBQWQsQ0FBQSxvQkFBQWMsQ0FBQSxPQUFBQyxjQUFBLENBQUFDLElBQUEsQ0FBQWhCLENBQUEsRUFBQWMsQ0FBQSxTQUFBRyxDQUFBLEdBQUFQLENBQUEsR0FBQUMsTUFBQSxDQUFBRSx3QkFBQSxDQUFBYixDQUFBLEVBQUFjLENBQUEsVUFBQUcsQ0FBQSxLQUFBQSxDQUFBLENBQUFWLEdBQUEsSUFBQVUsQ0FBQSxDQUFBQyxHQUFBLElBQUFQLE1BQUEsQ0FBQUMsY0FBQSxDQUFBSixDQUFBLEVBQUFNLENBQUEsRUFBQUcsQ0FBQSxJQUFBVCxDQUFBLENBQUFNLENBQUEsSUFBQWQsQ0FBQSxDQUFBYyxDQUFBLFlBQUFOLENBQUEsQ0FBQUgsT0FBQSxHQUFBTCxDQUFBLEVBQUFHLENBQUEsSUFBQUEsQ0FBQSxDQUFBZSxHQUFBLENBQUFsQixDQUFBLEVBQUFRLENBQUEsR0FBQUEsQ0FBQTtBQUFBLFNBQUFqQix1QkFBQVMsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUksVUFBQSxHQUFBSixDQUFBLEtBQUFLLE9BQUEsRUFBQUwsQ0FBQTtBQUMvQixNQUFNbUIsUUFBUSxHQUFHM0IsT0FBTyxDQUFDLGFBQWEsQ0FBQztBQUN2QyxNQUFNNEIsSUFBSSxHQUFHNUIsT0FBTyxDQUFDLE1BQU0sQ0FBQztBQUM1QixNQUFNNkIsS0FBSyxHQUFHN0IsT0FBTyxDQUFDLFVBQVUsQ0FBQztBQUVqQyxNQUFNOEIsbUJBQW1CLEdBQUdDLEdBQUcsSUFBSTtFQUNqQyxPQUFPLElBQUlDLE9BQU8sQ0FBQyxDQUFDQyxHQUFHLEVBQUVDLEdBQUcsS0FBSztJQUMvQk4sSUFBSSxDQUNEYixHQUFHLENBQUNnQixHQUFHLEVBQUVJLFFBQVEsSUFBSTtNQUNwQkEsUUFBUSxDQUFDQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUM7TUFDckMsSUFBSUMsSUFBSSxHQUFHLFFBQVFGLFFBQVEsQ0FBQ0csT0FBTyxDQUFDLGNBQWMsQ0FBQyxVQUFVO01BQzdESCxRQUFRLENBQUNJLEVBQUUsQ0FBQyxNQUFNLEVBQUVDLElBQUksSUFBS0gsSUFBSSxJQUFJRyxJQUFLLENBQUM7TUFDM0NMLFFBQVEsQ0FBQ0ksRUFBRSxDQUFDLEtBQUssRUFBRSxNQUFNTixHQUFHLENBQUNJLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUMsQ0FBQyxDQUNERSxFQUFFLENBQUMsT0FBTyxFQUFFL0IsQ0FBQyxJQUFJO01BQ2hCMEIsR0FBRyxDQUFDLCtCQUErQkgsR0FBRyxLQUFLdkIsQ0FBQyxDQUFDaUMsT0FBTyxFQUFFLENBQUM7SUFDekQsQ0FBQyxDQUFDO0VBQ04sQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELE1BQU1DLG1CQUFtQixHQUFHLE1BQU1DLElBQUksSUFBSTtFQUN4QyxJQUFJQSxJQUFJLENBQUNDLE9BQU8sQ0FBQ0MsTUFBTSxLQUFLLEtBQUssRUFBRTtJQUNqQyxNQUFNQyxNQUFNLEdBQUcsTUFBTWhCLG1CQUFtQixDQUFDYSxJQUFJLENBQUNDLE9BQU8sQ0FBQ2IsR0FBRyxDQUFDO0lBQzFEWSxJQUFJLENBQUNJLGFBQWEsR0FBR0osSUFBSTtJQUN6QkEsSUFBSSxDQUFDSyxLQUFLLEdBQUdGLE1BQU07SUFDbkJILElBQUksQ0FBQ00sWUFBWSxHQUFHLElBQUk7RUFDMUI7RUFDQSxPQUFPTixJQUFJO0FBQ2IsQ0FBQztBQUVNLE1BQU1PLFdBQVcsQ0FBQztFQUN2QkMsYUFBYUEsQ0FBQztJQUFFQyxhQUFhLEdBQUc7RUFBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUU7SUFDN0MsSUFBSUMsTUFBTSxHQUFHQyxnQkFBTyxDQUFDQyxNQUFNLENBQUMsQ0FBQztJQUM3QkYsTUFBTSxDQUFDdEMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQ3lDLFVBQVUsQ0FBQztJQUN0REgsTUFBTSxDQUFDdEMsR0FBRyxDQUFDLGtDQUFrQyxFQUFFLElBQUksQ0FBQzBDLGVBQWUsQ0FBQztJQUVwRUosTUFBTSxDQUFDSyxJQUFJLENBQUMsUUFBUSxFQUFFLFVBQVVDLEdBQUcsRUFBRTFCLEdBQUcsRUFBRTJCLElBQUksRUFBRTtNQUM5Q0EsSUFBSSxDQUFDLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0MsaUJBQWlCLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztJQUNoRixDQUFDLENBQUM7SUFFRlYsTUFBTSxDQUFDSyxJQUFJLENBQ1Qsa0JBQWtCLEVBQ2xCTSxtQkFBVSxDQUFDQyxHQUFHLENBQUM7TUFDYkMsSUFBSSxFQUFFQSxDQUFBLEtBQU07UUFDVixPQUFPLElBQUk7TUFDYixDQUFDO01BQ0RDLEtBQUssRUFBRWY7SUFDVCxDQUFDLENBQUM7SUFBRTtJQUNKbEQsV0FBVyxDQUFDa0Usa0JBQWtCLEVBQzlCbEUsV0FBVyxDQUFDbUUsa0JBQWtCLEVBQzlCLElBQUksQ0FBQ0MsYUFDUCxDQUFDO0lBRURqQixNQUFNLENBQUNrQixNQUFNLENBQ1gsa0JBQWtCLEVBQ2xCckUsV0FBVyxDQUFDa0Usa0JBQWtCLEVBQzlCbEUsV0FBVyxDQUFDbUUsa0JBQWtCLEVBQzlCbkUsV0FBVyxDQUFDc0Usc0JBQXNCLEVBQ2xDLElBQUksQ0FBQ0MsYUFDUCxDQUFDO0lBQ0QsT0FBT3BCLE1BQU07RUFDZjtFQUVBLE1BQU1HLFVBQVVBLENBQUNHLEdBQUcsRUFBRTFCLEdBQUcsRUFBRTtJQUN6QixNQUFNeUMsTUFBTSxHQUFHQyxlQUFNLENBQUM1RCxHQUFHLENBQUM0QyxHQUFHLENBQUNpQixNQUFNLENBQUNDLEtBQUssQ0FBQztJQUMzQyxJQUFJLENBQUNILE1BQU0sRUFBRTtNQUNYekMsR0FBRyxDQUFDNkMsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmLE1BQU1DLEdBQUcsR0FBRyxJQUFJbEIsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDa0IsbUJBQW1CLEVBQUUseUJBQXlCLENBQUM7TUFDdkYvQyxHQUFHLENBQUNnRCxJQUFJLENBQUM7UUFBRUMsSUFBSSxFQUFFSCxHQUFHLENBQUNHLElBQUk7UUFBRUMsS0FBSyxFQUFFSixHQUFHLENBQUN0QztNQUFRLENBQUMsQ0FBQztNQUNoRDtJQUNGO0lBQ0EsTUFBTTJDLGVBQWUsR0FBR1YsTUFBTSxDQUFDVSxlQUFlO0lBQzlDLE1BQU1DLFFBQVEsR0FBRzFCLEdBQUcsQ0FBQ2lCLE1BQU0sQ0FBQ1MsUUFBUTtJQUNwQyxNQUFNQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRXpFLE9BQU87SUFDM0MsTUFBTTBFLFdBQVcsR0FBR0QsSUFBSSxDQUFDRSxPQUFPLENBQUNILFFBQVEsQ0FBQztJQUMxQyxJQUFJSSxnQkFBZ0IsQ0FBQzlCLEdBQUcsRUFBRXlCLGVBQWUsQ0FBQyxFQUFFO01BQzFDQSxlQUFlLENBQUNNLGdCQUFnQixDQUFDaEIsTUFBTSxFQUFFVyxRQUFRLEVBQUUxQixHQUFHLEVBQUUxQixHQUFHLEVBQUVzRCxXQUFXLENBQUMsQ0FBQ0ksS0FBSyxDQUFDLE1BQU07UUFDcEYxRCxHQUFHLENBQUM2QyxNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2Y3QyxHQUFHLENBQUNQLEdBQUcsQ0FBQyxjQUFjLEVBQUUsWUFBWSxDQUFDO1FBQ3JDTyxHQUFHLENBQUMyRCxHQUFHLENBQUMsaUJBQWlCLENBQUM7TUFDNUIsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxNQUFNO01BQ0xSLGVBQWUsQ0FDWlMsV0FBVyxDQUFDbkIsTUFBTSxFQUFFVyxRQUFRLENBQUMsQ0FDN0JTLElBQUksQ0FBQ3RELElBQUksSUFBSTtRQUNaUCxHQUFHLENBQUM2QyxNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2Y3QyxHQUFHLENBQUNQLEdBQUcsQ0FBQyxjQUFjLEVBQUU2RCxXQUFXLENBQUM7UUFDcEN0RCxHQUFHLENBQUNQLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRWMsSUFBSSxDQUFDdUQsTUFBTSxDQUFDO1FBQ3RDOUQsR0FBRyxDQUFDMkQsR0FBRyxDQUFDcEQsSUFBSSxDQUFDO01BQ2YsQ0FBQyxDQUFDLENBQ0RtRCxLQUFLLENBQUMsTUFBTTtRQUNYMUQsR0FBRyxDQUFDNkMsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmN0MsR0FBRyxDQUFDUCxHQUFHLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQztRQUNyQ08sR0FBRyxDQUFDMkQsR0FBRyxDQUFDLGlCQUFpQixDQUFDO01BQzVCLENBQUMsQ0FBQztJQUNOO0VBQ0Y7RUFFQSxNQUFNdEIsYUFBYUEsQ0FBQ1gsR0FBRyxFQUFFMUIsR0FBRyxFQUFFMkIsSUFBSSxFQUFFO0lBQUEsSUFBQW9DLGtCQUFBO0lBQ2xDLE1BQU10QixNQUFNLEdBQUdmLEdBQUcsQ0FBQ2UsTUFBTTtJQUN6QixNQUFNdUIsSUFBSSxHQUFHdEMsR0FBRyxDQUFDdUMsSUFBSSxDQUFDRCxJQUFJO0lBQzFCLE1BQU1FLFFBQVEsR0FBR3hDLEdBQUcsQ0FBQ3VDLElBQUksQ0FBQ0MsUUFBUTtJQUNsQyxNQUFNQyxRQUFRLEdBQUdILElBQUksSUFBSXBDLGFBQUssQ0FBQ3dDLGNBQWMsQ0FBQ0QsUUFBUSxDQUFDSCxJQUFJLENBQUM7SUFDNUQsSUFBSSxDQUFDRSxRQUFRLElBQUksQ0FBQ3pCLE1BQU0sQ0FBQzRCLFVBQVUsQ0FBQ0Msc0JBQXNCLElBQUlILFFBQVEsRUFBRTtNQUN0RXhDLElBQUksQ0FDRixJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMwQyxlQUFlLEVBQUUsNENBQTRDLENBQzNGLENBQUM7TUFDRDtJQUNGO0lBQ0EsSUFBSSxDQUFDTCxRQUFRLElBQUksQ0FBQ3pCLE1BQU0sQ0FBQzRCLFVBQVUsQ0FBQ0csMEJBQTBCLElBQUksQ0FBQ0wsUUFBUSxJQUFJSCxJQUFJLEVBQUU7TUFDbkZyQyxJQUFJLENBQ0YsSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQ2JELGFBQUssQ0FBQ0MsS0FBSyxDQUFDMEMsZUFBZSxFQUMzQixnREFDRixDQUNGLENBQUM7TUFDRDtJQUNGO0lBQ0EsSUFBSSxDQUFDTCxRQUFRLElBQUksQ0FBQ3pCLE1BQU0sQ0FBQzRCLFVBQVUsQ0FBQ0ksZUFBZSxJQUFJLENBQUNULElBQUksRUFBRTtNQUM1RHJDLElBQUksQ0FBQyxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMwQyxlQUFlLEVBQUUsb0NBQW9DLENBQUMsQ0FBQztNQUN4RjtJQUNGO0lBQ0EsTUFBTXBCLGVBQWUsR0FBR1YsTUFBTSxDQUFDVSxlQUFlO0lBQzlDLE1BQU07TUFBRUM7SUFBUyxDQUFDLEdBQUcxQixHQUFHLENBQUNpQixNQUFNO0lBQy9CLE1BQU1XLFdBQVcsR0FBRzVCLEdBQUcsQ0FBQzVDLEdBQUcsQ0FBQyxjQUFjLENBQUM7SUFFM0MsSUFBSSxDQUFDNEMsR0FBRyxDQUFDdEIsSUFBSSxJQUFJLENBQUNzQixHQUFHLENBQUN0QixJQUFJLENBQUMwRCxNQUFNLEVBQUU7TUFDakNuQyxJQUFJLENBQUMsSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDMEMsZUFBZSxFQUFFLHNCQUFzQixDQUFDLENBQUM7TUFDMUU7SUFDRjtJQUVBLE1BQU1yQixLQUFLLEdBQUdDLGVBQWUsQ0FBQ3VCLGdCQUFnQixDQUFDdEIsUUFBUSxDQUFDO0lBQ3hELElBQUlGLEtBQUssRUFBRTtNQUNUdkIsSUFBSSxDQUFDdUIsS0FBSyxDQUFDO01BQ1g7SUFDRjtJQUVBLE1BQU15QixjQUFjLElBQUFaLGtCQUFBLEdBQUd0QixNQUFNLENBQUM0QixVQUFVLGNBQUFOLGtCQUFBLHVCQUFqQkEsa0JBQUEsQ0FBbUJZLGNBQWM7SUFDeEQsSUFBSSxDQUFDVCxRQUFRLElBQUlTLGNBQWMsRUFBRTtNQUFBLElBQUFDLFVBQUE7TUFDL0IsTUFBTUMsZ0JBQWdCLEdBQUdDLFNBQVMsSUFBSTtRQUNwQyxPQUFPSCxjQUFjLENBQUNJLElBQUksQ0FBQ0MsR0FBRyxJQUFJO1VBQ2hDLElBQUlBLEdBQUcsS0FBSyxHQUFHLEVBQUU7WUFDZixPQUFPLElBQUk7VUFDYjtVQUNBLE1BQU1DLEtBQUssR0FBRyxJQUFJQyxNQUFNLENBQUNGLEdBQUcsQ0FBQztVQUM3QixJQUFJQyxLQUFLLENBQUNFLElBQUksQ0FBQ0wsU0FBUyxDQUFDLEVBQUU7WUFDekIsT0FBTyxJQUFJO1VBQ2I7UUFDRixDQUFDLENBQUM7TUFDSixDQUFDO01BQ0QsSUFBSUEsU0FBUyxHQUFHeEIsV0FBVztNQUMzQixJQUFJRixRQUFRLElBQUlBLFFBQVEsQ0FBQ2dDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtRQUN0Q04sU0FBUyxHQUFHMUIsUUFBUSxDQUFDaUMsU0FBUyxDQUFDakMsUUFBUSxDQUFDa0MsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztNQUMvRCxDQUFDLE1BQU0sSUFBSWhDLFdBQVcsSUFBSUEsV0FBVyxDQUFDOEIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ25ETixTQUFTLEdBQUd4QixXQUFXLENBQUNpQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ3ZDO01BQ0FULFNBQVMsSUFBQUYsVUFBQSxHQUFHRSxTQUFTLGNBQUFGLFVBQUEsZ0JBQUFBLFVBQUEsR0FBVEEsVUFBQSxDQUFXVyxLQUFLLENBQUMsR0FBRyxDQUFDLGNBQUFYLFVBQUEsdUJBQXJCQSxVQUFBLENBQXVCWSxJQUFJLENBQUMsRUFBRSxDQUFDO01BRTNDLElBQUlWLFNBQVMsSUFBSSxDQUFDRCxnQkFBZ0IsQ0FBQ0MsU0FBUyxDQUFDLEVBQUU7UUFDN0NuRCxJQUFJLENBQ0YsSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQ2JELGFBQUssQ0FBQ0MsS0FBSyxDQUFDMEMsZUFBZSxFQUMzQiw0QkFBNEJPLFNBQVMsZUFDdkMsQ0FDRixDQUFDO1FBQ0Q7TUFDRjtJQUNGO0lBRUEsTUFBTWpFLE1BQU0sR0FBR2EsR0FBRyxDQUFDdEIsSUFBSSxDQUFDcUYsUUFBUSxDQUFDLFFBQVEsQ0FBQztJQUMxQyxNQUFNL0UsSUFBSSxHQUFHLElBQUlrQixhQUFLLENBQUM4RCxJQUFJLENBQUN0QyxRQUFRLEVBQUU7TUFBRXZDO0lBQU8sQ0FBQyxFQUFFeUMsV0FBVyxDQUFDO0lBQzlELE1BQU07TUFBRXFDLFFBQVEsR0FBRyxDQUFDLENBQUM7TUFBRUMsSUFBSSxHQUFHLENBQUM7SUFBRSxDQUFDLEdBQUdsRSxHQUFHLENBQUNtRSxRQUFRLElBQUksQ0FBQyxDQUFDO0lBQ3ZELElBQUk7TUFDRjtNQUNBakcsS0FBSyxDQUFDa0csdUJBQXVCLENBQUNyRCxNQUFNLEVBQUVrRCxRQUFRLENBQUM7TUFDL0MvRixLQUFLLENBQUNrRyx1QkFBdUIsQ0FBQ3JELE1BQU0sRUFBRW1ELElBQUksQ0FBQztJQUM3QyxDQUFDLENBQUMsT0FBTzFDLEtBQUssRUFBRTtNQUNkdkIsSUFBSSxDQUFDLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ2tFLGdCQUFnQixFQUFFN0MsS0FBSyxDQUFDLENBQUM7TUFDMUQ7SUFDRjtJQUNBeEMsSUFBSSxDQUFDc0YsT0FBTyxDQUFDSixJQUFJLENBQUM7SUFDbEJsRixJQUFJLENBQUN1RixXQUFXLENBQUNOLFFBQVEsQ0FBQztJQUMxQixNQUFNTyxRQUFRLEdBQUdDLE1BQU0sQ0FBQ0MsVUFBVSxDQUFDMUUsR0FBRyxDQUFDdEIsSUFBSSxDQUFDO0lBQzVDLE1BQU1pRyxVQUFVLEdBQUc7TUFBRTNGLElBQUk7TUFBRXdGO0lBQVMsQ0FBQztJQUNyQyxJQUFJO01BQ0Y7TUFDQSxNQUFNSSxhQUFhLEdBQUcsTUFBTTVHLFFBQVEsQ0FBQzZHLG1CQUFtQixDQUN0RDdHLFFBQVEsQ0FBQzhHLEtBQUssQ0FBQ0MsVUFBVSxFQUN6QkosVUFBVSxFQUNWNUQsTUFBTSxFQUNOZixHQUFHLENBQUN1QyxJQUNOLENBQUM7TUFDRCxJQUFJeUMsVUFBVTtNQUNkO01BQ0EsSUFBSUosYUFBYSxZQUFZMUUsYUFBSyxDQUFDOEQsSUFBSSxFQUFFO1FBQ3ZDVyxVQUFVLENBQUMzRixJQUFJLEdBQUc0RixhQUFhO1FBQy9CLElBQUlBLGFBQWEsQ0FBQ0ssR0FBRyxDQUFDLENBQUMsRUFBRTtVQUN2QjtVQUNBTixVQUFVLENBQUNILFFBQVEsR0FBRyxJQUFJO1VBQzFCUSxVQUFVLEdBQUc7WUFDWEMsR0FBRyxFQUFFTCxhQUFhLENBQUNLLEdBQUcsQ0FBQyxDQUFDO1lBQ3hCQyxJQUFJLEVBQUVOLGFBQWEsQ0FBQ087VUFDdEIsQ0FBQztRQUNIO01BQ0Y7TUFDQTtNQUNBLElBQUksQ0FBQ0gsVUFBVSxFQUFFO1FBQ2Y7UUFDQSxNQUFNakcsbUJBQW1CLENBQUM0RixVQUFVLENBQUMzRixJQUFJLENBQUM7UUFDMUM7UUFDQSxNQUFNb0csVUFBVSxHQUFHWCxNQUFNLENBQUNZLElBQUksQ0FBQ1YsVUFBVSxDQUFDM0YsSUFBSSxDQUFDSyxLQUFLLEVBQUUsUUFBUSxDQUFDO1FBQy9Ec0YsVUFBVSxDQUFDSCxRQUFRLEdBQUdDLE1BQU0sQ0FBQ0MsVUFBVSxDQUFDVSxVQUFVLENBQUM7UUFDbkQ7UUFDQSxNQUFNRSxXQUFXLEdBQUc7VUFDbEJyQixRQUFRLEVBQUVVLFVBQVUsQ0FBQzNGLElBQUksQ0FBQ3VHO1FBQzVCLENBQUM7UUFDRDtRQUNBO1FBQ0EsTUFBTUMsUUFBUSxHQUNaaEksTUFBTSxDQUFDaUksSUFBSSxDQUFDZCxVQUFVLENBQUMzRixJQUFJLENBQUMwRyxLQUFLLENBQUMsQ0FBQ3RELE1BQU0sR0FBRyxDQUFDLEdBQUc7VUFBRThCLElBQUksRUFBRVMsVUFBVSxDQUFDM0YsSUFBSSxDQUFDMEc7UUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RGbEksTUFBTSxDQUFDbUksTUFBTSxDQUFDTCxXQUFXLEVBQUVFLFFBQVEsQ0FBQztRQUNwQztRQUNBLE1BQU1JLGdCQUFnQixHQUFHLE1BQU1uRSxlQUFlLENBQUNvRSxVQUFVLENBQ3ZEOUUsTUFBTSxFQUNONEQsVUFBVSxDQUFDM0YsSUFBSSxDQUFDbUcsS0FBSyxFQUNyQkMsVUFBVSxFQUNWVCxVQUFVLENBQUMzRixJQUFJLENBQUNDLE9BQU8sQ0FBQ3NCLElBQUksRUFDNUIrRSxXQUNGLENBQUM7UUFDRDtRQUNBWCxVQUFVLENBQUMzRixJQUFJLENBQUNtRyxLQUFLLEdBQUdTLGdCQUFnQixDQUFDVixJQUFJO1FBQzdDUCxVQUFVLENBQUMzRixJQUFJLENBQUM4RyxJQUFJLEdBQUdGLGdCQUFnQixDQUFDWCxHQUFHO1FBQzNDTixVQUFVLENBQUMzRixJQUFJLENBQUNNLFlBQVksR0FBRyxJQUFJO1FBQ25DcUYsVUFBVSxDQUFDM0YsSUFBSSxDQUFDSSxhQUFhLEdBQUdmLE9BQU8sQ0FBQzBILE9BQU8sQ0FBQ3BCLFVBQVUsQ0FBQzNGLElBQUksQ0FBQztRQUNoRWdHLFVBQVUsR0FBRztVQUNYQyxHQUFHLEVBQUVXLGdCQUFnQixDQUFDWCxHQUFHO1VBQ3pCQyxJQUFJLEVBQUVVLGdCQUFnQixDQUFDVjtRQUN6QixDQUFDO01BQ0g7TUFDQTtNQUNBLE1BQU1sSCxRQUFRLENBQUM2RyxtQkFBbUIsQ0FBQzdHLFFBQVEsQ0FBQzhHLEtBQUssQ0FBQ2tCLFNBQVMsRUFBRXJCLFVBQVUsRUFBRTVELE1BQU0sRUFBRWYsR0FBRyxDQUFDdUMsSUFBSSxDQUFDO01BQzFGakUsR0FBRyxDQUFDNkMsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmN0MsR0FBRyxDQUFDUCxHQUFHLENBQUMsVUFBVSxFQUFFaUgsVUFBVSxDQUFDQyxHQUFHLENBQUM7TUFDbkMzRyxHQUFHLENBQUNnRCxJQUFJLENBQUMwRCxVQUFVLENBQUM7SUFDdEIsQ0FBQyxDQUFDLE9BQU9uSSxDQUFDLEVBQUU7TUFDVm9KLGVBQU0sQ0FBQ3pFLEtBQUssQ0FBQyx5QkFBeUIsRUFBRTNFLENBQUMsQ0FBQztNQUMxQyxNQUFNMkUsS0FBSyxHQUFHeEQsUUFBUSxDQUFDa0ksWUFBWSxDQUFDckosQ0FBQyxFQUFFO1FBQ3JDMEUsSUFBSSxFQUFFckIsYUFBSyxDQUFDQyxLQUFLLENBQUMwQyxlQUFlO1FBQ2pDL0QsT0FBTyxFQUFFLHlCQUF5QjZGLFVBQVUsQ0FBQzNGLElBQUksQ0FBQ21HLEtBQUs7TUFDekQsQ0FBQyxDQUFDO01BQ0ZsRixJQUFJLENBQUN1QixLQUFLLENBQUM7SUFDYjtFQUNGO0VBRUEsTUFBTVYsYUFBYUEsQ0FBQ2QsR0FBRyxFQUFFMUIsR0FBRyxFQUFFMkIsSUFBSSxFQUFFO0lBQ2xDLElBQUk7TUFDRixNQUFNO1FBQUV3QjtNQUFnQixDQUFDLEdBQUd6QixHQUFHLENBQUNlLE1BQU07TUFDdEMsTUFBTTtRQUFFVztNQUFTLENBQUMsR0FBRzFCLEdBQUcsQ0FBQ2lCLE1BQU07TUFDL0I7TUFDQSxNQUFNakMsSUFBSSxHQUFHLElBQUlrQixhQUFLLENBQUM4RCxJQUFJLENBQUN0QyxRQUFRLENBQUM7TUFDckMxQyxJQUFJLENBQUM4RyxJQUFJLEdBQUcsTUFBTXJFLGVBQWUsQ0FBQzBFLE9BQU8sQ0FBQ0MsZUFBZSxDQUFDcEcsR0FBRyxDQUFDZSxNQUFNLEVBQUVXLFFBQVEsQ0FBQztNQUMvRSxNQUFNaUQsVUFBVSxHQUFHO1FBQUUzRixJQUFJO1FBQUV3RixRQUFRLEVBQUU7TUFBSyxDQUFDO01BQzNDLE1BQU14RyxRQUFRLENBQUM2RyxtQkFBbUIsQ0FDaEM3RyxRQUFRLENBQUM4RyxLQUFLLENBQUN1QixZQUFZLEVBQzNCMUIsVUFBVSxFQUNWM0UsR0FBRyxDQUFDZSxNQUFNLEVBQ1ZmLEdBQUcsQ0FBQ3VDLElBQ04sQ0FBQztNQUNEO01BQ0EsTUFBTWQsZUFBZSxDQUFDNkUsVUFBVSxDQUFDdEcsR0FBRyxDQUFDZSxNQUFNLEVBQUVXLFFBQVEsQ0FBQztNQUN0RDtNQUNBLE1BQU0xRCxRQUFRLENBQUM2RyxtQkFBbUIsQ0FDaEM3RyxRQUFRLENBQUM4RyxLQUFLLENBQUN5QixXQUFXLEVBQzFCNUIsVUFBVSxFQUNWM0UsR0FBRyxDQUFDZSxNQUFNLEVBQ1ZmLEdBQUcsQ0FBQ3VDLElBQ04sQ0FBQztNQUNEakUsR0FBRyxDQUFDNkMsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmO01BQ0E3QyxHQUFHLENBQUMyRCxHQUFHLENBQUMsQ0FBQztJQUNYLENBQUMsQ0FBQyxPQUFPcEYsQ0FBQyxFQUFFO01BQ1ZvSixlQUFNLENBQUN6RSxLQUFLLENBQUMseUJBQXlCLEVBQUUzRSxDQUFDLENBQUM7TUFDMUMsTUFBTTJFLEtBQUssR0FBR3hELFFBQVEsQ0FBQ2tJLFlBQVksQ0FBQ3JKLENBQUMsRUFBRTtRQUNyQzBFLElBQUksRUFBRXJCLGFBQUssQ0FBQ0MsS0FBSyxDQUFDcUcsaUJBQWlCO1FBQ25DMUgsT0FBTyxFQUFFO01BQ1gsQ0FBQyxDQUFDO01BQ0ZtQixJQUFJLENBQUN1QixLQUFLLENBQUM7SUFDYjtFQUNGO0VBRUEsTUFBTTFCLGVBQWVBLENBQUNFLEdBQUcsRUFBRTFCLEdBQUcsRUFBRTtJQUM5QixJQUFJO01BQ0YsTUFBTXlDLE1BQU0sR0FBR0MsZUFBTSxDQUFDNUQsR0FBRyxDQUFDNEMsR0FBRyxDQUFDaUIsTUFBTSxDQUFDQyxLQUFLLENBQUM7TUFDM0MsTUFBTTtRQUFFTztNQUFnQixDQUFDLEdBQUdWLE1BQU07TUFDbEMsTUFBTTtRQUFFVztNQUFTLENBQUMsR0FBRzFCLEdBQUcsQ0FBQ2lCLE1BQU07TUFDL0IsTUFBTXBDLElBQUksR0FBRyxNQUFNNEMsZUFBZSxDQUFDZ0YsV0FBVyxDQUFDL0UsUUFBUSxDQUFDO01BQ3hEcEQsR0FBRyxDQUFDNkMsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmN0MsR0FBRyxDQUFDZ0QsSUFBSSxDQUFDekMsSUFBSSxDQUFDO0lBQ2hCLENBQUMsQ0FBQyxPQUFPaEMsQ0FBQyxFQUFFO01BQ1Z5QixHQUFHLENBQUM2QyxNQUFNLENBQUMsR0FBRyxDQUFDO01BQ2Y3QyxHQUFHLENBQUNnRCxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDZDtFQUNGO0FBQ0Y7QUFBQ29GLE9BQUEsQ0FBQW5ILFdBQUEsR0FBQUEsV0FBQTtBQUVELFNBQVN1QyxnQkFBZ0JBLENBQUM5QixHQUFHLEVBQUV5QixlQUFlLEVBQUU7RUFDOUMsTUFBTWtGLEtBQUssR0FBRyxDQUFDM0csR0FBRyxDQUFDNUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssRUFBRXlHLEtBQUssQ0FBQyxHQUFHLENBQUM7RUFDcEQsTUFBTStDLEtBQUssR0FBR0MsTUFBTSxDQUFDRixLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDOUIsTUFBTTFFLEdBQUcsR0FBRzRFLE1BQU0sQ0FBQ0YsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCLE9BQ0UsQ0FBQyxDQUFDRyxLQUFLLENBQUNGLEtBQUssQ0FBQyxJQUFJLENBQUNFLEtBQUssQ0FBQzdFLEdBQUcsQ0FBQyxLQUFLLE9BQU9SLGVBQWUsQ0FBQzBFLE9BQU8sQ0FBQ3BFLGdCQUFnQixLQUFLLFVBQVU7QUFFcEciLCJpZ25vcmVMaXN0IjpbXX0=