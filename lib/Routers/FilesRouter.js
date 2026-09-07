"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesRouter = void 0;
var _express = _interopRequireDefault(require("express"));
var Middlewares = _interopRequireWildcard(require("../middlewares"));
var _node = _interopRequireDefault(require("parse/node"));
var _Config = _interopRequireDefault(require("../Config"));
var _logger = _interopRequireDefault(require("../logger"));
var _Error = require("../Error");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const triggers = require('../triggers');
const Utils = require('../Utils');
const auth = require('../Auth');
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
    router.post('/files/:filename', _express.default.raw({
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
  static async _resolveAuth(req, config) {
    const sessionToken = req.get('X-Parse-Session-Token');
    if (!sessionToken) {
      return null;
    }
    try {
      return await auth.getAuthForSessionToken({
        config,
        sessionToken,
        installationId: req.get('X-Parse-Installation-Id')
      });
    } catch {
      return null;
    }
  }
  async getHandler(req, res) {
    const config = _Config.default.get(req.params.appId);
    if (!config) {
      res.status(403);
      res.json({
        code: _node.default.Error.OPERATION_FORBIDDEN,
        error: 'Invalid application ID.'
      });
      return;
    }
    let filename = req.params.filename;
    try {
      const filesController = config.filesController;
      const mime = (await import('mime')).default;
      let contentType = mime.getType(filename);
      let file = new _node.default.File(filename, {
        base64: ''
      }, contentType);
      const fileAuth = await FilesRouter._resolveAuth(req, config);
      const triggerResult = await triggers.maybeRunFileTrigger(triggers.Types.beforeFind, {
        file
      }, config, fileAuth);
      if (triggerResult?.file?._name) {
        filename = triggerResult?.file?._name;
        contentType = mime.getType(filename);
      }
      if (isFileStreamable(req, filesController)) {
        const afterFind = await triggers.maybeRunFileTrigger(triggers.Types.afterFind, {
          file,
          forceDownload: false
        }, config, fileAuth);
        if (afterFind?.forceDownload) {
          res.set('Content-Disposition', `attachment;filename=${afterFind.file?._name || filename}`);
        }
        filesController.handleFileStream(config, filename, req, res, contentType).catch(() => {
          res.status(404);
          res.set('Content-Type', 'text/plain');
          res.end('File not found.');
        });
        return;
      }
      let data = await filesController.getFileData(config, filename).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
      if (!data) {
        return;
      }
      file = new _node.default.File(filename, {
        base64: data.toString('base64')
      }, contentType);
      const afterFind = await triggers.maybeRunFileTrigger(triggers.Types.afterFind, {
        file,
        forceDownload: false
      }, config, fileAuth);
      if (afterFind?.file) {
        contentType = mime.getType(afterFind.file._name);
        data = Buffer.from(afterFind.file._data, 'base64');
      }
      res.status(200);
      res.set('Content-Type', contentType);
      res.set('Content-Length', data.length);
      if (afterFind.forceDownload) {
        res.set('Content-Disposition', `attachment;filename=${afterFind.file._name}`);
      }
      res.end(data);
    } catch (e) {
      const err = triggers.resolveError(e, {
        code: _node.default.Error.SCRIPT_FAILED,
        message: `Could not find file: ${filename}.`
      });
      res.status(403);
      res.json({
        code: err.code,
        error: err.message
      });
    }
  }
  async createHandler(req, res, next) {
    if (req.auth.isReadOnly) {
      const error = (0, _Error.createSanitizedHttpError)(403, "read-only masterKey isn't allowed to create a file.", req.config);
      res.status(error.status);
      res.end(`{"error":"${error.message}"}`);
      return;
    }
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
    const fileExtensions = config.fileUpload?.fileExtensions;
    if (!isMaster && fileExtensions) {
      const mime = (await import('mime')).default;
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
      const rejectExtension = ext => {
        next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `File upload of extension ${ext} is disabled.`));
      };

      // Parse the filename extension token, stripping MIME parameters and whitespace.
      let extension = Utils.getFileExtension(filename);
      extension = extension?.split(';')[0]?.replace(/\s+/g, '');
      const isExtensionRecognized = extension && mime.getType(filename);
      if (extension && !isValidExtension(extension)) {
        rejectExtension(extension);
        return;
      }

      // When the filename extension is not recognized by `mime`,
      // `FilesController.createFile` cannot derive a Content-Type from the
      // filename and preserves the client-supplied Content-Type verbatim, so the
      // type the file is actually served as must be validated. Skip this when
      // extension filtering is disabled (`*`).
      const allowsAllExtensions = fileExtensions.includes('*');
      if (!isExtensionRecognized && contentType && !allowsAllExtensions) {
        const slashIndex = contentType.indexOf('/');
        const type = slashIndex > 0 ? contentType.slice(0, slashIndex).trim() : '';
        const subtype = slashIndex > 0 ? contentType.slice(slashIndex + 1).split(';')[0].trim() : '';
        // A valid media type is `type/subtype` where both are non-empty `token`s
        // (RFC 9110 §5.6.2). Reject anything else.
        const token = /^[!#$%&'*+\-.^_`|~A-Za-z0-9]+$/;
        if (!token.test(type) || !token.test(subtype)) {
          // A Content-Type that does not parse as `type/subtype` with valid,
          // non-empty type AND subtype tokens is malformed: there is no valid MIME
          // type without a subtype (RFC 9110 §8.3.1), and malformed tokens such as
          // `image//svg+xml` or `text/plain,text/html` are equally unparseable.
          // Browsers cannot parse such values and fall back to MIME-sniffing the
          // file body, which can render HTML/script markers as active content on
          // storage adapters that serve the stored Content-Type (e.g. `image`,
          // `image/`). Surface the precise blocklist message when the bare token
          // names a blocked extension (e.g. a no-slash `svg`), otherwise reject the
          // unparseable Content-Type.
          const bareToken = (slashIndex < 0 ? contentType.split(';')[0] : type).replace(/\s+/g, '');
          if (bareToken && !isValidExtension(bareToken)) {
            rejectExtension(bareToken);
            return;
          }
          next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid Content-Type.'));
          return;
        }
        // Validate the well-formed Content-Type subtype against the blocklist, e.g.
        // "image/svg+xml" -> "svg+xml", "image/svg+xml;charset=utf-8" -> "svg+xml".
        // Valid custom/vendor types (e.g. "application/vnd.api+json") parse and are
        // allowed; only blocked subtypes are rejected.
        const contentTypeExtension = subtype.replace(/\s+/g, '');
        if (!isValidExtension(contentTypeExtension)) {
          rejectExtension(contentTypeExtension);
          return;
        }
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
    if (req.auth.isReadOnly) {
      const error = (0, _Error.createSanitizedHttpError)(403, "read-only masterKey isn't allowed to delete a file.", req.config);
      res.status(error.status);
      res.end(`{"error":"${error.message}"}`);
      return;
    }
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
      if (!config) {
        res.status(200);
        res.json({});
        return;
      }
      const {
        filesController
      } = config;
      let {
        filename
      } = req.params;
      const file = new _node.default.File(filename, {
        base64: ''
      });
      const fileAuth = await FilesRouter._resolveAuth(req, config);
      const triggerResult = await triggers.maybeRunFileTrigger(triggers.Types.beforeFind, {
        file
      }, config, fileAuth);
      if (triggerResult?.file?._name) {
        filename = triggerResult.file._name;
      }
      const data = await filesController.getMetadata(filename).catch(() => {
        res.status(200);
        res.json({});
      });
      if (!data) {
        return;
      }
      await triggers.maybeRunFileTrigger(triggers.Types.afterFind, {
        file
      }, config, fileAuth);
      res.status(200);
      res.json(data);
    } catch (e) {
      const err = triggers.resolveError(e, {
        code: _node.default.Error.SCRIPT_FAILED,
        message: 'Could not get file metadata.'
      });
      res.status(403);
      res.json({
        code: err.code,
        error: err.message
      });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZXhwcmVzcyIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiTWlkZGxld2FyZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9ub2RlIiwiX0NvbmZpZyIsIl9sb2dnZXIiLCJfRXJyb3IiLCJlIiwidCIsIldlYWtNYXAiLCJyIiwibiIsIl9fZXNNb2R1bGUiLCJvIiwiaSIsImYiLCJfX3Byb3RvX18iLCJkZWZhdWx0IiwiaGFzIiwiZ2V0Iiwic2V0IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ0cmlnZ2VycyIsIlV0aWxzIiwiYXV0aCIsIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsIm1heFVwbG9hZFNpemUiLCJyb3V0ZXIiLCJleHByZXNzIiwiUm91dGVyIiwiZ2V0SGFuZGxlciIsIm1ldGFkYXRhSGFuZGxlciIsInBvc3QiLCJyZXEiLCJyZXMiLCJuZXh0IiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfRklMRV9OQU1FIiwicmF3IiwidHlwZSIsImxpbWl0IiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiY3JlYXRlSGFuZGxlciIsImRlbGV0ZSIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJkZWxldGVIYW5kbGVyIiwiX3Jlc29sdmVBdXRoIiwiY29uZmlnIiwic2Vzc2lvblRva2VuIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImluc3RhbGxhdGlvbklkIiwiQ29uZmlnIiwicGFyYW1zIiwiYXBwSWQiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJlcnJvciIsImZpbGVuYW1lIiwiZmlsZXNDb250cm9sbGVyIiwibWltZSIsImNvbnRlbnRUeXBlIiwiZ2V0VHlwZSIsImZpbGUiLCJGaWxlIiwiYmFzZTY0IiwiZmlsZUF1dGgiLCJ0cmlnZ2VyUmVzdWx0IiwibWF5YmVSdW5GaWxlVHJpZ2dlciIsIlR5cGVzIiwiYmVmb3JlRmluZCIsIl9uYW1lIiwiaXNGaWxlU3RyZWFtYWJsZSIsImFmdGVyRmluZCIsImZvcmNlRG93bmxvYWQiLCJoYW5kbGVGaWxlU3RyZWFtIiwiY2F0Y2giLCJlbmQiLCJkYXRhIiwiZ2V0RmlsZURhdGEiLCJ0b1N0cmluZyIsIkJ1ZmZlciIsImZyb20iLCJfZGF0YSIsImxlbmd0aCIsImVyciIsInJlc29sdmVFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJtZXNzYWdlIiwiaXNSZWFkT25seSIsImNyZWF0ZVNhbml0aXplZEh0dHBFcnJvciIsInVzZXIiLCJpc01hc3RlciIsImlzTGlua2VkIiwiQW5vbnltb3VzVXRpbHMiLCJmaWxlVXBsb2FkIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZJTEVfU0FWRV9FUlJPUiIsImVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIiwiZW5hYmxlRm9yUHVibGljIiwiYm9keSIsInZhbGlkYXRlRmlsZW5hbWUiLCJmaWxlRXh0ZW5zaW9ucyIsImlzVmFsaWRFeHRlbnNpb24iLCJleHRlbnNpb24iLCJzb21lIiwiZXh0IiwicmVnZXgiLCJSZWdFeHAiLCJ0ZXN0IiwicmVqZWN0RXh0ZW5zaW9uIiwiZ2V0RmlsZUV4dGVuc2lvbiIsInNwbGl0IiwicmVwbGFjZSIsImlzRXh0ZW5zaW9uUmVjb2duaXplZCIsImFsbG93c0FsbEV4dGVuc2lvbnMiLCJpbmNsdWRlcyIsInNsYXNoSW5kZXgiLCJpbmRleE9mIiwic2xpY2UiLCJ0cmltIiwic3VidHlwZSIsInRva2VuIiwiYmFyZVRva2VuIiwiY29udGVudFR5cGVFeHRlbnNpb24iLCJtZXRhZGF0YSIsInRhZ3MiLCJmaWxlRGF0YSIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiSU5WQUxJRF9LRVlfTkFNRSIsInNldFRhZ3MiLCJzZXRNZXRhZGF0YSIsImZpbGVTaXplIiwiYnl0ZUxlbmd0aCIsImZpbGVPYmplY3QiLCJiZWZvcmVTYXZlIiwic2F2ZVJlc3VsdCIsInVybCIsIm5hbWUiLCJidWZmZXJEYXRhIiwiZmlsZU9wdGlvbnMiLCJfbWV0YWRhdGEiLCJmaWxlVGFncyIsImtleXMiLCJfdGFncyIsImFzc2lnbiIsImNyZWF0ZUZpbGVSZXN1bHQiLCJjcmVhdGVGaWxlIiwiX3NvdXJjZSIsIl91cmwiLCJfcmVxdWVzdFRhc2siLCJfcHJldmlvdXNTYXZlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJhZnRlclNhdmUiLCJsb2dnZXIiLCJhZGFwdGVyIiwiZ2V0RmlsZUxvY2F0aW9uIiwiYmVmb3JlRGVsZXRlIiwiZGVsZXRlRmlsZSIsImFmdGVyRGVsZXRlIiwiRklMRV9ERUxFVEVfRVJST1IiLCJnZXRNZXRhZGF0YSIsImV4cG9ydHMiLCJyYW5nZSIsInN0YXJ0IiwiTnVtYmVyIiwiaXNOYU4iXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9GaWxlc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCAqIGFzIE1pZGRsZXdhcmVzIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi4vdHJpZ2dlcnMnKTtcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi4vVXRpbHMnKTtcbmNvbnN0IGF1dGggPSByZXF1aXJlKCcuLi9BdXRoJyk7XG5pbXBvcnQgeyBjcmVhdGVTYW5pdGl6ZWRIdHRwRXJyb3IgfSBmcm9tICcuLi9FcnJvcic7XG5cbmV4cG9ydCBjbGFzcyBGaWxlc1JvdXRlciB7XG4gIGV4cHJlc3NSb3V0ZXIoeyBtYXhVcGxvYWRTaXplID0gJzIwTWInIH0gPSB7fSkge1xuICAgIHZhciByb3V0ZXIgPSBleHByZXNzLlJvdXRlcigpO1xuICAgIHJvdXRlci5nZXQoJy9maWxlcy86YXBwSWQvOmZpbGVuYW1lJywgdGhpcy5nZXRIYW5kbGVyKTtcbiAgICByb3V0ZXIuZ2V0KCcvZmlsZXMvOmFwcElkL21ldGFkYXRhLzpmaWxlbmFtZScsIHRoaXMubWV0YWRhdGFIYW5kbGVyKTtcblxuICAgIHJvdXRlci5wb3N0KCcvZmlsZXMnLCBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgbm90IHByb3ZpZGVkLicpKTtcbiAgICB9KTtcblxuICAgIHJvdXRlci5wb3N0KFxuICAgICAgJy9maWxlcy86ZmlsZW5hbWUnLFxuICAgICAgZXhwcmVzcy5yYXcoe1xuICAgICAgICB0eXBlOiAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICAgIGxpbWl0OiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSksIC8vIEFsbG93IHVwbG9hZHMgd2l0aG91dCBDb250ZW50LVR5cGUsIG9yIHdpdGggYW55IENvbnRlbnQtVHlwZS5cbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyxcbiAgICAgIE1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlU2Vzc2lvbixcbiAgICAgIHRoaXMuY3JlYXRlSGFuZGxlclxuICAgICk7XG5cbiAgICByb3V0ZXIuZGVsZXRlKFxuICAgICAgJy9maWxlcy86ZmlsZW5hbWUnLFxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzLFxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uLFxuICAgICAgTWlkZGxld2FyZXMuZW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHRoaXMuZGVsZXRlSGFuZGxlclxuICAgICk7XG4gICAgcmV0dXJuIHJvdXRlcjtcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyBfcmVzb2x2ZUF1dGgocmVxLCBjb25maWcpIHtcbiAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSByZXEuZ2V0KCdYLVBhcnNlLVNlc3Npb24tVG9rZW4nKTtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYXdhaXQgYXV0aC5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBzZXNzaW9uVG9rZW4sXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuZ2V0KCdYLVBhcnNlLUluc3RhbGxhdGlvbi1JZCcpLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICBhc3luYyBnZXRIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgICAgcmVzLmpzb24oeyBjb2RlOiBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCBlcnJvcjogJ0ludmFsaWQgYXBwbGljYXRpb24gSUQuJyB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgZmlsZW5hbWUgPSByZXEucGFyYW1zLmZpbGVuYW1lO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgICAgY29uc3QgbWltZSA9IChhd2FpdCBpbXBvcnQoJ21pbWUnKSkuZGVmYXVsdDtcbiAgICAgIGxldCBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShmaWxlbmFtZSk7XG4gICAgICBsZXQgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lLCB7IGJhc2U2NDogJycgfSwgY29udGVudFR5cGUpO1xuICAgICAgY29uc3QgZmlsZUF1dGggPSBhd2FpdCBGaWxlc1JvdXRlci5fcmVzb2x2ZUF1dGgocmVxLCBjb25maWcpO1xuICAgICAgY29uc3QgdHJpZ2dlclJlc3VsdCA9IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUZpbmQsXG4gICAgICAgIHsgZmlsZSB9LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGZpbGVBdXRoXG4gICAgICApO1xuICAgICAgaWYgKHRyaWdnZXJSZXN1bHQ/LmZpbGU/Ll9uYW1lKSB7XG4gICAgICAgIGZpbGVuYW1lID0gdHJpZ2dlclJlc3VsdD8uZmlsZT8uX25hbWU7XG4gICAgICAgIGNvbnRlbnRUeXBlID0gbWltZS5nZXRUeXBlKGZpbGVuYW1lKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpKSB7XG4gICAgICAgIGNvbnN0IGFmdGVyRmluZCA9IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgICAgICAgIHsgZmlsZSwgZm9yY2VEb3dubG9hZDogZmFsc2UgfSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgZmlsZUF1dGhcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGFmdGVyRmluZD8uZm9yY2VEb3dubG9hZCkge1xuICAgICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtRGlzcG9zaXRpb24nLCBgYXR0YWNobWVudDtmaWxlbmFtZT0ke2FmdGVyRmluZC5maWxlPy5fbmFtZSB8fCBmaWxlbmFtZX1gKTtcbiAgICAgICAgfVxuICAgICAgICBmaWxlc0NvbnRyb2xsZXIuaGFuZGxlRmlsZVN0cmVhbShjb25maWcsIGZpbGVuYW1lLCByZXEsIHJlcywgY29udGVudFR5cGUpLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICByZXMuc3RhdHVzKDQwNCk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgICByZXMuZW5kKCdGaWxlIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbGV0IGRhdGEgPSBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZ2V0RmlsZURhdGEoY29uZmlnLCBmaWxlbmFtZSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICByZXMuc3RhdHVzKDQwNCk7XG4gICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtVHlwZScsICd0ZXh0L3BsYWluJyk7XG4gICAgICAgIHJlcy5lbmQoJ0ZpbGUgbm90IGZvdW5kLicpO1xuICAgICAgfSk7XG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lLCB7IGJhc2U2NDogZGF0YS50b1N0cmluZygnYmFzZTY0JykgfSwgY29udGVudFR5cGUpO1xuICAgICAgY29uc3QgYWZ0ZXJGaW5kID0gYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgICAgICB7IGZpbGUsIGZvcmNlRG93bmxvYWQ6IGZhbHNlIH0sXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgZmlsZUF1dGhcbiAgICAgICk7XG5cbiAgICAgIGlmIChhZnRlckZpbmQ/LmZpbGUpIHtcbiAgICAgICAgY29udGVudFR5cGUgPSBtaW1lLmdldFR5cGUoYWZ0ZXJGaW5kLmZpbGUuX25hbWUpO1xuICAgICAgICBkYXRhID0gQnVmZmVyLmZyb20oYWZ0ZXJGaW5kLmZpbGUuX2RhdGEsICdiYXNlNjQnKTtcbiAgICAgIH1cblxuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgY29udGVudFR5cGUpO1xuICAgICAgcmVzLnNldCgnQ29udGVudC1MZW5ndGgnLCBkYXRhLmxlbmd0aCk7XG4gICAgICBpZiAoYWZ0ZXJGaW5kLmZvcmNlRG93bmxvYWQpIHtcbiAgICAgICAgcmVzLnNldCgnQ29udGVudC1EaXNwb3NpdGlvbicsIGBhdHRhY2htZW50O2ZpbGVuYW1lPSR7YWZ0ZXJGaW5kLmZpbGUuX25hbWV9YCk7XG4gICAgICB9XG4gICAgICByZXMuZW5kKGRhdGEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVyciA9IHRyaWdnZXJzLnJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6IGBDb3VsZCBub3QgZmluZCBmaWxlOiAke2ZpbGVuYW1lfS5gLFxuICAgICAgfSk7XG4gICAgICByZXMuc3RhdHVzKDQwMyk7XG4gICAgICByZXMuanNvbih7IGNvZGU6IGVyci5jb2RlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY3JlYXRlSGFuZGxlcihyZXEsIHJlcywgbmV4dCkge1xuICAgIGlmIChyZXEuYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICBjb25zdCBlcnJvciA9IGNyZWF0ZVNhbml0aXplZEh0dHBFcnJvcig0MDMsIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIGNyZWF0ZSBhIGZpbGUuXCIsIHJlcS5jb25maWcpO1xuICAgICAgcmVzLnN0YXR1cyhlcnJvci5zdGF0dXMpO1xuICAgICAgcmVzLmVuZChge1wiZXJyb3JcIjpcIiR7ZXJyb3IubWVzc2FnZX1cIn1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCB1c2VyID0gcmVxLmF1dGgudXNlcjtcbiAgICBjb25zdCBpc01hc3RlciA9IHJlcS5hdXRoLmlzTWFzdGVyO1xuICAgIGNvbnN0IGlzTGlua2VkID0gdXNlciAmJiBQYXJzZS5Bbm9ueW1vdXNVdGlscy5pc0xpbmtlZCh1c2VyKTtcbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyICYmIGlzTGlua2VkKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnRmlsZSB1cGxvYWQgYnkgYW5vbnltb3VzIHVzZXIgaXMgZGlzYWJsZWQuJylcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghaXNNYXN0ZXIgJiYgIWNvbmZpZy5maWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICYmICFpc0xpbmtlZCAmJiB1c2VyKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICdGaWxlIHVwbG9hZCBieSBhdXRoZW50aWNhdGVkIHVzZXIgaXMgZGlzYWJsZWQuJ1xuICAgICAgICApXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgJiYgIXVzZXIpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ZpbGUgdXBsb2FkIGJ5IHB1YmxpYyBpcyBkaXNhYmxlZC4nKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpbGVzQ29udHJvbGxlciA9IGNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgY29uc3QgeyBmaWxlbmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlcS5nZXQoJ0NvbnRlbnQtdHlwZScpO1xuXG4gICAgaWYgKCFyZXEuYm9keSB8fCAhcmVxLmJvZHkubGVuZ3RoKSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdJbnZhbGlkIGZpbGUgdXBsb2FkLicpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlcnJvciA9IGZpbGVzQ29udHJvbGxlci52YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lKTtcbiAgICBpZiAoZXJyb3IpIHtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGVFeHRlbnNpb25zID0gY29uZmlnLmZpbGVVcGxvYWQ/LmZpbGVFeHRlbnNpb25zO1xuICAgIGlmICghaXNNYXN0ZXIgJiYgZmlsZUV4dGVuc2lvbnMpIHtcbiAgICAgIGNvbnN0IG1pbWUgPSAoYXdhaXQgaW1wb3J0KCdtaW1lJykpLmRlZmF1bHQ7XG4gICAgICBjb25zdCBpc1ZhbGlkRXh0ZW5zaW9uID0gZXh0ZW5zaW9uID0+IHtcbiAgICAgICAgcmV0dXJuIGZpbGVFeHRlbnNpb25zLnNvbWUoZXh0ID0+IHtcbiAgICAgICAgICBpZiAoZXh0ID09PSAnKicpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoZXh0KTtcbiAgICAgICAgICBpZiAocmVnZXgudGVzdChleHRlbnNpb24pKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHJlamVjdEV4dGVuc2lvbiA9IGV4dCA9PiB7XG4gICAgICAgIG5leHQoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgYEZpbGUgdXBsb2FkIG9mIGV4dGVuc2lvbiAke2V4dH0gaXMgZGlzYWJsZWQuYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFBhcnNlIHRoZSBmaWxlbmFtZSBleHRlbnNpb24gdG9rZW4sIHN0cmlwcGluZyBNSU1FIHBhcmFtZXRlcnMgYW5kIHdoaXRlc3BhY2UuXG4gICAgICBsZXQgZXh0ZW5zaW9uID0gVXRpbHMuZ2V0RmlsZUV4dGVuc2lvbihmaWxlbmFtZSk7XG4gICAgICBleHRlbnNpb24gPSBleHRlbnNpb24/LnNwbGl0KCc7JylbMF0/LnJlcGxhY2UoL1xccysvZywgJycpO1xuXG4gICAgICBjb25zdCBpc0V4dGVuc2lvblJlY29nbml6ZWQgPSBleHRlbnNpb24gJiYgbWltZS5nZXRUeXBlKGZpbGVuYW1lKTtcbiAgICAgIGlmIChleHRlbnNpb24gJiYgIWlzVmFsaWRFeHRlbnNpb24oZXh0ZW5zaW9uKSkge1xuICAgICAgICByZWplY3RFeHRlbnNpb24oZXh0ZW5zaW9uKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBXaGVuIHRoZSBmaWxlbmFtZSBleHRlbnNpb24gaXMgbm90IHJlY29nbml6ZWQgYnkgYG1pbWVgLFxuICAgICAgLy8gYEZpbGVzQ29udHJvbGxlci5jcmVhdGVGaWxlYCBjYW5ub3QgZGVyaXZlIGEgQ29udGVudC1UeXBlIGZyb20gdGhlXG4gICAgICAvLyBmaWxlbmFtZSBhbmQgcHJlc2VydmVzIHRoZSBjbGllbnQtc3VwcGxpZWQgQ29udGVudC1UeXBlIHZlcmJhdGltLCBzbyB0aGVcbiAgICAgIC8vIHR5cGUgdGhlIGZpbGUgaXMgYWN0dWFsbHkgc2VydmVkIGFzIG11c3QgYmUgdmFsaWRhdGVkLiBTa2lwIHRoaXMgd2hlblxuICAgICAgLy8gZXh0ZW5zaW9uIGZpbHRlcmluZyBpcyBkaXNhYmxlZCAoYCpgKS5cbiAgICAgIGNvbnN0IGFsbG93c0FsbEV4dGVuc2lvbnMgPSBmaWxlRXh0ZW5zaW9ucy5pbmNsdWRlcygnKicpO1xuICAgICAgaWYgKCFpc0V4dGVuc2lvblJlY29nbml6ZWQgJiYgY29udGVudFR5cGUgJiYgIWFsbG93c0FsbEV4dGVuc2lvbnMpIHtcbiAgICAgICAgY29uc3Qgc2xhc2hJbmRleCA9IGNvbnRlbnRUeXBlLmluZGV4T2YoJy8nKTtcbiAgICAgICAgY29uc3QgdHlwZSA9IHNsYXNoSW5kZXggPiAwID8gY29udGVudFR5cGUuc2xpY2UoMCwgc2xhc2hJbmRleCkudHJpbSgpIDogJyc7XG4gICAgICAgIGNvbnN0IHN1YnR5cGUgPVxuICAgICAgICAgIHNsYXNoSW5kZXggPiAwID8gY29udGVudFR5cGUuc2xpY2Uoc2xhc2hJbmRleCArIDEpLnNwbGl0KCc7JylbMF0udHJpbSgpIDogJyc7XG4gICAgICAgIC8vIEEgdmFsaWQgbWVkaWEgdHlwZSBpcyBgdHlwZS9zdWJ0eXBlYCB3aGVyZSBib3RoIGFyZSBub24tZW1wdHkgYHRva2VuYHNcbiAgICAgICAgLy8gKFJGQyA5MTEwIMKnNS42LjIpLiBSZWplY3QgYW55dGhpbmcgZWxzZS5cbiAgICAgICAgY29uc3QgdG9rZW4gPSAvXlshIyQlJicqK1xcLS5eX2B8fkEtWmEtejAtOV0rJC87XG4gICAgICAgIGlmICghdG9rZW4udGVzdCh0eXBlKSB8fCAhdG9rZW4udGVzdChzdWJ0eXBlKSkge1xuICAgICAgICAgIC8vIEEgQ29udGVudC1UeXBlIHRoYXQgZG9lcyBub3QgcGFyc2UgYXMgYHR5cGUvc3VidHlwZWAgd2l0aCB2YWxpZCxcbiAgICAgICAgICAvLyBub24tZW1wdHkgdHlwZSBBTkQgc3VidHlwZSB0b2tlbnMgaXMgbWFsZm9ybWVkOiB0aGVyZSBpcyBubyB2YWxpZCBNSU1FXG4gICAgICAgICAgLy8gdHlwZSB3aXRob3V0IGEgc3VidHlwZSAoUkZDIDkxMTAgwqc4LjMuMSksIGFuZCBtYWxmb3JtZWQgdG9rZW5zIHN1Y2ggYXNcbiAgICAgICAgICAvLyBgaW1hZ2UvL3N2Zyt4bWxgIG9yIGB0ZXh0L3BsYWluLHRleHQvaHRtbGAgYXJlIGVxdWFsbHkgdW5wYXJzZWFibGUuXG4gICAgICAgICAgLy8gQnJvd3NlcnMgY2Fubm90IHBhcnNlIHN1Y2ggdmFsdWVzIGFuZCBmYWxsIGJhY2sgdG8gTUlNRS1zbmlmZmluZyB0aGVcbiAgICAgICAgICAvLyBmaWxlIGJvZHksIHdoaWNoIGNhbiByZW5kZXIgSFRNTC9zY3JpcHQgbWFya2VycyBhcyBhY3RpdmUgY29udGVudCBvblxuICAgICAgICAgIC8vIHN0b3JhZ2UgYWRhcHRlcnMgdGhhdCBzZXJ2ZSB0aGUgc3RvcmVkIENvbnRlbnQtVHlwZSAoZS5nLiBgaW1hZ2VgLFxuICAgICAgICAgIC8vIGBpbWFnZS9gKS4gU3VyZmFjZSB0aGUgcHJlY2lzZSBibG9ja2xpc3QgbWVzc2FnZSB3aGVuIHRoZSBiYXJlIHRva2VuXG4gICAgICAgICAgLy8gbmFtZXMgYSBibG9ja2VkIGV4dGVuc2lvbiAoZS5nLiBhIG5vLXNsYXNoIGBzdmdgKSwgb3RoZXJ3aXNlIHJlamVjdCB0aGVcbiAgICAgICAgICAvLyB1bnBhcnNlYWJsZSBDb250ZW50LVR5cGUuXG4gICAgICAgICAgY29uc3QgYmFyZVRva2VuID0gKHNsYXNoSW5kZXggPCAwID8gY29udGVudFR5cGUuc3BsaXQoJzsnKVswXSA6IHR5cGUpLnJlcGxhY2UoXG4gICAgICAgICAgICAvXFxzKy9nLFxuICAgICAgICAgICAgJydcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChiYXJlVG9rZW4gJiYgIWlzVmFsaWRFeHRlbnNpb24oYmFyZVRva2VuKSkge1xuICAgICAgICAgICAgcmVqZWN0RXh0ZW5zaW9uKGJhcmVUb2tlbik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ludmFsaWQgQ29udGVudC1UeXBlLicpKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gVmFsaWRhdGUgdGhlIHdlbGwtZm9ybWVkIENvbnRlbnQtVHlwZSBzdWJ0eXBlIGFnYWluc3QgdGhlIGJsb2NrbGlzdCwgZS5nLlxuICAgICAgICAvLyBcImltYWdlL3N2Zyt4bWxcIiAtPiBcInN2Zyt4bWxcIiwgXCJpbWFnZS9zdmcreG1sO2NoYXJzZXQ9dXRmLThcIiAtPiBcInN2Zyt4bWxcIi5cbiAgICAgICAgLy8gVmFsaWQgY3VzdG9tL3ZlbmRvciB0eXBlcyAoZS5nLiBcImFwcGxpY2F0aW9uL3ZuZC5hcGkranNvblwiKSBwYXJzZSBhbmQgYXJlXG4gICAgICAgIC8vIGFsbG93ZWQ7IG9ubHkgYmxvY2tlZCBzdWJ0eXBlcyBhcmUgcmVqZWN0ZWQuXG4gICAgICAgIGNvbnN0IGNvbnRlbnRUeXBlRXh0ZW5zaW9uID0gc3VidHlwZS5yZXBsYWNlKC9cXHMrL2csICcnKTtcbiAgICAgICAgaWYgKCFpc1ZhbGlkRXh0ZW5zaW9uKGNvbnRlbnRUeXBlRXh0ZW5zaW9uKSkge1xuICAgICAgICAgIHJlamVjdEV4dGVuc2lvbihjb250ZW50VHlwZUV4dGVuc2lvbik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYmFzZTY0ID0gcmVxLmJvZHkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIGNvbnN0IGZpbGUgPSBuZXcgUGFyc2UuRmlsZShmaWxlbmFtZSwgeyBiYXNlNjQgfSwgY29udGVudFR5cGUpO1xuICAgIGNvbnN0IHsgbWV0YWRhdGEgPSB7fSwgdGFncyA9IHt9IH0gPSByZXEuZmlsZURhdGEgfHwge307XG4gICAgdHJ5IHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKGNvbmZpZywgbWV0YWRhdGEpO1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMoY29uZmlnLCB0YWdzKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgZXJyb3IpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmlsZS5zZXRUYWdzKHRhZ3MpO1xuICAgIGZpbGUuc2V0TWV0YWRhdGEobWV0YWRhdGEpO1xuICAgIGNvbnN0IGZpbGVTaXplID0gQnVmZmVyLmJ5dGVMZW5ndGgocmVxLmJvZHkpO1xuICAgIGNvbnN0IGZpbGVPYmplY3QgPSB7IGZpbGUsIGZpbGVTaXplIH07XG4gICAgdHJ5IHtcbiAgICAgIC8vIHJ1biBiZWZvcmVTYXZlRmlsZSB0cmlnZ2VyXG4gICAgICBjb25zdCB0cmlnZ2VyUmVzdWx0ID0gYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgZmlsZU9iamVjdCxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIGxldCBzYXZlUmVzdWx0O1xuICAgICAgLy8gaWYgYSBuZXcgUGFyc2VGaWxlIGlzIHJldHVybmVkIGNoZWNrIGlmIGl0J3MgYW4gYWxyZWFkeSBzYXZlZCBmaWxlXG4gICAgICBpZiAodHJpZ2dlclJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLkZpbGUpIHtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlID0gdHJpZ2dlclJlc3VsdDtcbiAgICAgICAgaWYgKHRyaWdnZXJSZXN1bHQudXJsKCkpIHtcbiAgICAgICAgICAvLyBzZXQgZmlsZVNpemUgdG8gbnVsbCBiZWNhdXNlIHdlIHdvbnQga25vdyBob3cgYmlnIGl0IGlzIGhlcmVcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGVTaXplID0gbnVsbDtcbiAgICAgICAgICBzYXZlUmVzdWx0ID0ge1xuICAgICAgICAgICAgdXJsOiB0cmlnZ2VyUmVzdWx0LnVybCgpLFxuICAgICAgICAgICAgbmFtZTogdHJpZ2dlclJlc3VsdC5fbmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBpZiB0aGUgZmlsZSByZXR1cm5lZCBieSB0aGUgdHJpZ2dlciBoYXMgYWxyZWFkeSBiZWVuIHNhdmVkIHNraXAgc2F2aW5nIGFueXRoaW5nXG4gICAgICBpZiAoIXNhdmVSZXN1bHQpIHtcbiAgICAgICAgLy8gdXBkYXRlIGZpbGVTaXplXG4gICAgICAgIGNvbnN0IGJ1ZmZlckRhdGEgPSBCdWZmZXIuZnJvbShmaWxlT2JqZWN0LmZpbGUuX2RhdGEsICdiYXNlNjQnKTtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlU2l6ZSA9IEJ1ZmZlci5ieXRlTGVuZ3RoKGJ1ZmZlckRhdGEpO1xuICAgICAgICAvLyBwcmVwYXJlIGZpbGUgb3B0aW9uc1xuICAgICAgICBjb25zdCBmaWxlT3B0aW9ucyA9IHtcbiAgICAgICAgICBtZXRhZGF0YTogZmlsZU9iamVjdC5maWxlLl9tZXRhZGF0YSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gc29tZSBzMy1jb21wYXRpYmxlIHByb3ZpZGVycyAoRGlnaXRhbE9jZWFuLCBMaW5vZGUpIGRvIG5vdCBhY2NlcHQgdGFnc1xuICAgICAgICAvLyBzbyB3ZSBkbyBub3QgaW5jbHVkZSB0aGUgdGFncyBvcHRpb24gaWYgaXQgaXMgZW1wdHkuXG4gICAgICAgIGNvbnN0IGZpbGVUYWdzID1cbiAgICAgICAgICBPYmplY3Qua2V5cyhmaWxlT2JqZWN0LmZpbGUuX3RhZ3MpLmxlbmd0aCA+IDAgPyB7IHRhZ3M6IGZpbGVPYmplY3QuZmlsZS5fdGFncyB9IDoge307XG4gICAgICAgIE9iamVjdC5hc3NpZ24oZmlsZU9wdGlvbnMsIGZpbGVUYWdzKTtcbiAgICAgICAgLy8gc2F2ZSBmaWxlXG4gICAgICAgIGNvbnN0IGNyZWF0ZUZpbGVSZXN1bHQgPSBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuY3JlYXRlRmlsZShcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgZmlsZU9iamVjdC5maWxlLl9uYW1lLFxuICAgICAgICAgIGJ1ZmZlckRhdGEsXG4gICAgICAgICAgZmlsZU9iamVjdC5maWxlLl9zb3VyY2UudHlwZSxcbiAgICAgICAgICBmaWxlT3B0aW9uc1xuICAgICAgICApO1xuICAgICAgICAvLyB1cGRhdGUgZmlsZSB3aXRoIG5ldyBkYXRhXG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fbmFtZSA9IGNyZWF0ZUZpbGVSZXN1bHQubmFtZTtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl91cmwgPSBjcmVhdGVGaWxlUmVzdWx0LnVybDtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9yZXF1ZXN0VGFzayA9IG51bGw7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fcHJldmlvdXNTYXZlID0gUHJvbWlzZS5yZXNvbHZlKGZpbGVPYmplY3QuZmlsZSk7XG4gICAgICAgIHNhdmVSZXN1bHQgPSB7XG4gICAgICAgICAgdXJsOiBjcmVhdGVGaWxlUmVzdWx0LnVybCxcbiAgICAgICAgICBuYW1lOiBjcmVhdGVGaWxlUmVzdWx0Lm5hbWUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICAvLyBydW4gYWZ0ZXJTYXZlRmlsZSB0cmlnZ2VyXG4gICAgICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1bkZpbGVUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSwgZmlsZU9iamVjdCwgY29uZmlnLCByZXEuYXV0aCk7XG4gICAgICByZXMuc3RhdHVzKDIwMSk7XG4gICAgICByZXMuc2V0KCdMb2NhdGlvbicsIHNhdmVSZXN1bHQudXJsKTtcbiAgICAgIHJlcy5qc29uKHNhdmVSZXN1bHQpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgIGNvbnN0IGVycm9yID0gdHJpZ2dlcnMucmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICBtZXNzYWdlOiBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZU9iamVjdC5maWxlLl9uYW1lfS5gLFxuICAgICAgfSk7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBkZWxldGVIYW5kbGVyKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgaWYgKHJlcS5hdXRoLmlzUmVhZE9ubHkpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gY3JlYXRlU2FuaXRpemVkSHR0cEVycm9yKDQwMywgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gZGVsZXRlIGEgZmlsZS5cIiwgcmVxLmNvbmZpZyk7XG4gICAgICByZXMuc3RhdHVzKGVycm9yLnN0YXR1cyk7XG4gICAgICByZXMuZW5kKGB7XCJlcnJvclwiOlwiJHtlcnJvci5tZXNzYWdlfVwifWApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBmaWxlc0NvbnRyb2xsZXIgfSA9IHJlcS5jb25maWc7XG4gICAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgLy8gcnVuIGJlZm9yZURlbGV0ZUZpbGUgdHJpZ2dlclxuICAgICAgY29uc3QgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lKTtcbiAgICAgIGZpbGUuX3VybCA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmdldEZpbGVMb2NhdGlvbihyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICBjb25zdCBmaWxlT2JqZWN0ID0geyBmaWxlLCBmaWxlU2l6ZTogbnVsbCB9O1xuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIC8vIGRlbGV0ZSBmaWxlXG4gICAgICBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZGVsZXRlRmlsZShyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICAvLyBydW4gYWZ0ZXJEZWxldGVGaWxlIHRyaWdnZXJcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgIC8vIFRPRE86IHJldHVybiB1c2VmdWwgSlNPTiBoZXJlP1xuICAgICAgcmVzLmVuZCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgZGVsZXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgIGNvbnN0IGVycm9yID0gdHJpZ2dlcnMucmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuRklMRV9ERUxFVEVfRVJST1IsXG4gICAgICAgIG1lc3NhZ2U6ICdDb3VsZCBub3QgZGVsZXRlIGZpbGUuJyxcbiAgICAgIH0pO1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbWV0YWRhdGFIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgICBpZiAoIWNvbmZpZykge1xuICAgICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICAgIHJlcy5qc29uKHt9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgeyBmaWxlc0NvbnRyb2xsZXIgfSA9IGNvbmZpZztcbiAgICAgIGxldCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgY29uc3QgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lLCB7IGJhc2U2NDogJycgfSk7XG4gICAgICBjb25zdCBmaWxlQXV0aCA9IGF3YWl0IEZpbGVzUm91dGVyLl9yZXNvbHZlQXV0aChyZXEsIGNvbmZpZyk7XG4gICAgICBjb25zdCB0cmlnZ2VyUmVzdWx0ID0gYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICAgICAgeyBmaWxlIH0sXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgZmlsZUF1dGhcbiAgICAgICk7XG4gICAgICBpZiAodHJpZ2dlclJlc3VsdD8uZmlsZT8uX25hbWUpIHtcbiAgICAgICAgZmlsZW5hbWUgPSB0cmlnZ2VyUmVzdWx0LmZpbGUuX25hbWU7XG4gICAgICB9XG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgZmlsZXNDb250cm9sbGVyLmdldE1ldGFkYXRhKGZpbGVuYW1lKS5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgICAgcmVzLmpzb24oe30pO1xuICAgICAgfSk7XG4gICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgICAgICB7IGZpbGUgfSxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBmaWxlQXV0aFxuICAgICAgKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgIHJlcy5qc29uKGRhdGEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVyciA9IHRyaWdnZXJzLnJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdDb3VsZCBub3QgZ2V0IGZpbGUgbWV0YWRhdGEuJyxcbiAgICAgIH0pO1xuICAgICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgICAgcmVzLmpzb24oeyBjb2RlOiBlcnIuY29kZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBpc0ZpbGVTdHJlYW1hYmxlKHJlcSwgZmlsZXNDb250cm9sbGVyKSB7XG4gIGNvbnN0IHJhbmdlID0gKHJlcS5nZXQoJ1JhbmdlJykgfHwgJy8tLycpLnNwbGl0KCctJyk7XG4gIGNvbnN0IHN0YXJ0ID0gTnVtYmVyKHJhbmdlWzBdKTtcbiAgY29uc3QgZW5kID0gTnVtYmVyKHJhbmdlWzFdKTtcbiAgcmV0dXJuIChcbiAgICAoIWlzTmFOKHN0YXJ0KSB8fCAhaXNOYU4oZW5kKSkgJiYgdHlwZW9mIGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmhhbmRsZUZpbGVTdHJlYW0gPT09ICdmdW5jdGlvbidcbiAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsV0FBQSxHQUFBQyx1QkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsS0FBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksT0FBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBSUEsSUFBQU0sTUFBQSxHQUFBTixPQUFBO0FBQW9ELFNBQUFFLHdCQUFBSyxDQUFBLEVBQUFDLENBQUEsNkJBQUFDLE9BQUEsTUFBQUMsQ0FBQSxPQUFBRCxPQUFBLElBQUFFLENBQUEsT0FBQUYsT0FBQSxZQUFBUCx1QkFBQSxZQUFBQSxDQUFBSyxDQUFBLEVBQUFDLENBQUEsU0FBQUEsQ0FBQSxJQUFBRCxDQUFBLElBQUFBLENBQUEsQ0FBQUssVUFBQSxTQUFBTCxDQUFBLE1BQUFNLENBQUEsRUFBQUMsQ0FBQSxFQUFBQyxDQUFBLEtBQUFDLFNBQUEsUUFBQUMsT0FBQSxFQUFBVixDQUFBLGlCQUFBQSxDQUFBLHVCQUFBQSxDQUFBLHlCQUFBQSxDQUFBLFNBQUFRLENBQUEsTUFBQUYsQ0FBQSxHQUFBTCxDQUFBLEdBQUFHLENBQUEsR0FBQUQsQ0FBQSxRQUFBRyxDQUFBLENBQUFLLEdBQUEsQ0FBQVgsQ0FBQSxVQUFBTSxDQUFBLENBQUFNLEdBQUEsQ0FBQVosQ0FBQSxHQUFBTSxDQUFBLENBQUFPLEdBQUEsQ0FBQWIsQ0FBQSxFQUFBUSxDQUFBLGdCQUFBUCxDQUFBLElBQUFELENBQUEsZ0JBQUFDLENBQUEsT0FBQWEsY0FBQSxDQUFBQyxJQUFBLENBQUFmLENBQUEsRUFBQUMsQ0FBQSxPQUFBTSxDQUFBLElBQUFELENBQUEsR0FBQVUsTUFBQSxDQUFBQyxjQUFBLEtBQUFELE1BQUEsQ0FBQUUsd0JBQUEsQ0FBQWxCLENBQUEsRUFBQUMsQ0FBQSxPQUFBTSxDQUFBLENBQUFLLEdBQUEsSUFBQUwsQ0FBQSxDQUFBTSxHQUFBLElBQUFQLENBQUEsQ0FBQUUsQ0FBQSxFQUFBUCxDQUFBLEVBQUFNLENBQUEsSUFBQUMsQ0FBQSxDQUFBUCxDQUFBLElBQUFELENBQUEsQ0FBQUMsQ0FBQSxXQUFBTyxDQUFBLEtBQUFSLENBQUEsRUFBQUMsQ0FBQTtBQUFBLFNBQUFULHVCQUFBUSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBSyxVQUFBLEdBQUFMLENBQUEsS0FBQVUsT0FBQSxFQUFBVixDQUFBO0FBSHBELE1BQU1tQixRQUFRLEdBQUcxQixPQUFPLENBQUMsYUFBYSxDQUFDO0FBQ3ZDLE1BQU0yQixLQUFLLEdBQUczQixPQUFPLENBQUMsVUFBVSxDQUFDO0FBQ2pDLE1BQU00QixJQUFJLEdBQUc1QixPQUFPLENBQUMsU0FBUyxDQUFDO0FBR3hCLE1BQU02QixXQUFXLENBQUM7RUFDdkJDLGFBQWFBLENBQUM7SUFBRUMsYUFBYSxHQUFHO0VBQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFO0lBQzdDLElBQUlDLE1BQU0sR0FBR0MsZ0JBQU8sQ0FBQ0MsTUFBTSxDQUFDLENBQUM7SUFDN0JGLE1BQU0sQ0FBQ2IsR0FBRyxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQ2dCLFVBQVUsQ0FBQztJQUN0REgsTUFBTSxDQUFDYixHQUFHLENBQUMsa0NBQWtDLEVBQUUsSUFBSSxDQUFDaUIsZUFBZSxDQUFDO0lBRXBFSixNQUFNLENBQUNLLElBQUksQ0FBQyxRQUFRLEVBQUUsVUFBVUMsR0FBRyxFQUFFQyxHQUFHLEVBQUVDLElBQUksRUFBRTtNQUM5Q0EsSUFBSSxDQUFDLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0MsaUJBQWlCLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztJQUNoRixDQUFDLENBQUM7SUFFRlgsTUFBTSxDQUFDSyxJQUFJLENBQ1Qsa0JBQWtCLEVBQ2xCSixnQkFBTyxDQUFDVyxHQUFHLENBQUM7TUFDVkMsSUFBSSxFQUFFQSxDQUFBLEtBQU07UUFDVixPQUFPLElBQUk7TUFDYixDQUFDO01BQ0RDLEtBQUssRUFBRWY7SUFDVCxDQUFDLENBQUM7SUFBRTtJQUNKOUIsV0FBVyxDQUFDOEMsa0JBQWtCLEVBQzlCOUMsV0FBVyxDQUFDK0Msa0JBQWtCLEVBQzlCLElBQUksQ0FBQ0MsYUFDUCxDQUFDO0lBRURqQixNQUFNLENBQUNrQixNQUFNLENBQ1gsa0JBQWtCLEVBQ2xCakQsV0FBVyxDQUFDOEMsa0JBQWtCLEVBQzlCOUMsV0FBVyxDQUFDK0Msa0JBQWtCLEVBQzlCL0MsV0FBVyxDQUFDa0Qsc0JBQXNCLEVBQ2xDLElBQUksQ0FBQ0MsYUFDUCxDQUFDO0lBQ0QsT0FBT3BCLE1BQU07RUFDZjtFQUVBLGFBQWFxQixZQUFZQSxDQUFDZixHQUFHLEVBQUVnQixNQUFNLEVBQUU7SUFDckMsTUFBTUMsWUFBWSxHQUFHakIsR0FBRyxDQUFDbkIsR0FBRyxDQUFDLHVCQUF1QixDQUFDO0lBQ3JELElBQUksQ0FBQ29DLFlBQVksRUFBRTtNQUNqQixPQUFPLElBQUk7SUFDYjtJQUNBLElBQUk7TUFDRixPQUFPLE1BQU0zQixJQUFJLENBQUM0QixzQkFBc0IsQ0FBQztRQUN2Q0YsTUFBTTtRQUNOQyxZQUFZO1FBQ1pFLGNBQWMsRUFBRW5CLEdBQUcsQ0FBQ25CLEdBQUcsQ0FBQyx5QkFBeUI7TUFDbkQsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLE1BQU07TUFDTixPQUFPLElBQUk7SUFDYjtFQUNGO0VBRUEsTUFBTWdCLFVBQVVBLENBQUNHLEdBQUcsRUFBRUMsR0FBRyxFQUFFO0lBQ3pCLE1BQU1lLE1BQU0sR0FBR0ksZUFBTSxDQUFDdkMsR0FBRyxDQUFDbUIsR0FBRyxDQUFDcUIsTUFBTSxDQUFDQyxLQUFLLENBQUM7SUFDM0MsSUFBSSxDQUFDTixNQUFNLEVBQUU7TUFDWGYsR0FBRyxDQUFDc0IsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmdEIsR0FBRyxDQUFDdUIsSUFBSSxDQUFDO1FBQUVDLElBQUksRUFBRXRCLGFBQUssQ0FBQ0MsS0FBSyxDQUFDc0IsbUJBQW1CO1FBQUVDLEtBQUssRUFBRTtNQUEwQixDQUFDLENBQUM7TUFDckY7SUFDRjtJQUVBLElBQUlDLFFBQVEsR0FBRzVCLEdBQUcsQ0FBQ3FCLE1BQU0sQ0FBQ08sUUFBUTtJQUNsQyxJQUFJO01BQ0YsTUFBTUMsZUFBZSxHQUFHYixNQUFNLENBQUNhLGVBQWU7TUFDOUMsTUFBTUMsSUFBSSxHQUFHLENBQUMsTUFBTSxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUVuRCxPQUFPO01BQzNDLElBQUlvRCxXQUFXLEdBQUdELElBQUksQ0FBQ0UsT0FBTyxDQUFDSixRQUFRLENBQUM7TUFDeEMsSUFBSUssSUFBSSxHQUFHLElBQUk5QixhQUFLLENBQUMrQixJQUFJLENBQUNOLFFBQVEsRUFBRTtRQUFFTyxNQUFNLEVBQUU7TUFBRyxDQUFDLEVBQUVKLFdBQVcsQ0FBQztNQUNoRSxNQUFNSyxRQUFRLEdBQUcsTUFBTTdDLFdBQVcsQ0FBQ3dCLFlBQVksQ0FBQ2YsR0FBRyxFQUFFZ0IsTUFBTSxDQUFDO01BQzVELE1BQU1xQixhQUFhLEdBQUcsTUFBTWpELFFBQVEsQ0FBQ2tELG1CQUFtQixDQUN0RGxELFFBQVEsQ0FBQ21ELEtBQUssQ0FBQ0MsVUFBVSxFQUN6QjtRQUFFUDtNQUFLLENBQUMsRUFDUmpCLE1BQU0sRUFDTm9CLFFBQ0YsQ0FBQztNQUNELElBQUlDLGFBQWEsRUFBRUosSUFBSSxFQUFFUSxLQUFLLEVBQUU7UUFDOUJiLFFBQVEsR0FBR1MsYUFBYSxFQUFFSixJQUFJLEVBQUVRLEtBQUs7UUFDckNWLFdBQVcsR0FBR0QsSUFBSSxDQUFDRSxPQUFPLENBQUNKLFFBQVEsQ0FBQztNQUN0QztNQUVBLElBQUljLGdCQUFnQixDQUFDMUMsR0FBRyxFQUFFNkIsZUFBZSxDQUFDLEVBQUU7UUFDMUMsTUFBTWMsU0FBUyxHQUFHLE1BQU12RCxRQUFRLENBQUNrRCxtQkFBbUIsQ0FDbERsRCxRQUFRLENBQUNtRCxLQUFLLENBQUNJLFNBQVMsRUFDeEI7VUFBRVYsSUFBSTtVQUFFVyxhQUFhLEVBQUU7UUFBTSxDQUFDLEVBQzlCNUIsTUFBTSxFQUNOb0IsUUFDRixDQUFDO1FBQ0QsSUFBSU8sU0FBUyxFQUFFQyxhQUFhLEVBQUU7VUFDNUIzQyxHQUFHLENBQUNuQixHQUFHLENBQUMscUJBQXFCLEVBQUUsdUJBQXVCNkQsU0FBUyxDQUFDVixJQUFJLEVBQUVRLEtBQUssSUFBSWIsUUFBUSxFQUFFLENBQUM7UUFDNUY7UUFDQUMsZUFBZSxDQUFDZ0IsZ0JBQWdCLENBQUM3QixNQUFNLEVBQUVZLFFBQVEsRUFBRTVCLEdBQUcsRUFBRUMsR0FBRyxFQUFFOEIsV0FBVyxDQUFDLENBQUNlLEtBQUssQ0FBQyxNQUFNO1VBQ3BGN0MsR0FBRyxDQUFDc0IsTUFBTSxDQUFDLEdBQUcsQ0FBQztVQUNmdEIsR0FBRyxDQUFDbkIsR0FBRyxDQUFDLGNBQWMsRUFBRSxZQUFZLENBQUM7VUFDckNtQixHQUFHLENBQUM4QyxHQUFHLENBQUMsaUJBQWlCLENBQUM7UUFDNUIsQ0FBQyxDQUFDO1FBQ0Y7TUFDRjtNQUVBLElBQUlDLElBQUksR0FBRyxNQUFNbkIsZUFBZSxDQUFDb0IsV0FBVyxDQUFDakMsTUFBTSxFQUFFWSxRQUFRLENBQUMsQ0FBQ2tCLEtBQUssQ0FBQyxNQUFNO1FBQ3pFN0MsR0FBRyxDQUFDc0IsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmdEIsR0FBRyxDQUFDbkIsR0FBRyxDQUFDLGNBQWMsRUFBRSxZQUFZLENBQUM7UUFDckNtQixHQUFHLENBQUM4QyxHQUFHLENBQUMsaUJBQWlCLENBQUM7TUFDNUIsQ0FBQyxDQUFDO01BQ0YsSUFBSSxDQUFDQyxJQUFJLEVBQUU7UUFDVDtNQUNGO01BQ0FmLElBQUksR0FBRyxJQUFJOUIsYUFBSyxDQUFDK0IsSUFBSSxDQUFDTixRQUFRLEVBQUU7UUFBRU8sTUFBTSxFQUFFYSxJQUFJLENBQUNFLFFBQVEsQ0FBQyxRQUFRO01BQUUsQ0FBQyxFQUFFbkIsV0FBVyxDQUFDO01BQ2pGLE1BQU1ZLFNBQVMsR0FBRyxNQUFNdkQsUUFBUSxDQUFDa0QsbUJBQW1CLENBQ2xEbEQsUUFBUSxDQUFDbUQsS0FBSyxDQUFDSSxTQUFTLEVBQ3hCO1FBQUVWLElBQUk7UUFBRVcsYUFBYSxFQUFFO01BQU0sQ0FBQyxFQUM5QjVCLE1BQU0sRUFDTm9CLFFBQ0YsQ0FBQztNQUVELElBQUlPLFNBQVMsRUFBRVYsSUFBSSxFQUFFO1FBQ25CRixXQUFXLEdBQUdELElBQUksQ0FBQ0UsT0FBTyxDQUFDVyxTQUFTLENBQUNWLElBQUksQ0FBQ1EsS0FBSyxDQUFDO1FBQ2hETyxJQUFJLEdBQUdHLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDVCxTQUFTLENBQUNWLElBQUksQ0FBQ29CLEtBQUssRUFBRSxRQUFRLENBQUM7TUFDcEQ7TUFFQXBELEdBQUcsQ0FBQ3NCLE1BQU0sQ0FBQyxHQUFHLENBQUM7TUFDZnRCLEdBQUcsQ0FBQ25CLEdBQUcsQ0FBQyxjQUFjLEVBQUVpRCxXQUFXLENBQUM7TUFDcEM5QixHQUFHLENBQUNuQixHQUFHLENBQUMsZ0JBQWdCLEVBQUVrRSxJQUFJLENBQUNNLE1BQU0sQ0FBQztNQUN0QyxJQUFJWCxTQUFTLENBQUNDLGFBQWEsRUFBRTtRQUMzQjNDLEdBQUcsQ0FBQ25CLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSx1QkFBdUI2RCxTQUFTLENBQUNWLElBQUksQ0FBQ1EsS0FBSyxFQUFFLENBQUM7TUFDL0U7TUFDQXhDLEdBQUcsQ0FBQzhDLEdBQUcsQ0FBQ0MsSUFBSSxDQUFDO0lBQ2YsQ0FBQyxDQUFDLE9BQU8vRSxDQUFDLEVBQUU7TUFDVixNQUFNc0YsR0FBRyxHQUFHbkUsUUFBUSxDQUFDb0UsWUFBWSxDQUFDdkYsQ0FBQyxFQUFFO1FBQ25Dd0QsSUFBSSxFQUFFdEIsYUFBSyxDQUFDQyxLQUFLLENBQUNxRCxhQUFhO1FBQy9CQyxPQUFPLEVBQUUsd0JBQXdCOUIsUUFBUTtNQUMzQyxDQUFDLENBQUM7TUFDRjNCLEdBQUcsQ0FBQ3NCLE1BQU0sQ0FBQyxHQUFHLENBQUM7TUFDZnRCLEdBQUcsQ0FBQ3VCLElBQUksQ0FBQztRQUFFQyxJQUFJLEVBQUU4QixHQUFHLENBQUM5QixJQUFJO1FBQUVFLEtBQUssRUFBRTRCLEdBQUcsQ0FBQ0c7TUFBUSxDQUFDLENBQUM7SUFDbEQ7RUFDRjtFQUVBLE1BQU0vQyxhQUFhQSxDQUFDWCxHQUFHLEVBQUVDLEdBQUcsRUFBRUMsSUFBSSxFQUFFO0lBQ2xDLElBQUlGLEdBQUcsQ0FBQ1YsSUFBSSxDQUFDcUUsVUFBVSxFQUFFO01BQ3ZCLE1BQU1oQyxLQUFLLEdBQUcsSUFBQWlDLCtCQUF3QixFQUFDLEdBQUcsRUFBRSxxREFBcUQsRUFBRTVELEdBQUcsQ0FBQ2dCLE1BQU0sQ0FBQztNQUM5R2YsR0FBRyxDQUFDc0IsTUFBTSxDQUFDSSxLQUFLLENBQUNKLE1BQU0sQ0FBQztNQUN4QnRCLEdBQUcsQ0FBQzhDLEdBQUcsQ0FBQyxhQUFhcEIsS0FBSyxDQUFDK0IsT0FBTyxJQUFJLENBQUM7TUFDdkM7SUFDRjtJQUNBLE1BQU0xQyxNQUFNLEdBQUdoQixHQUFHLENBQUNnQixNQUFNO0lBQ3pCLE1BQU02QyxJQUFJLEdBQUc3RCxHQUFHLENBQUNWLElBQUksQ0FBQ3VFLElBQUk7SUFDMUIsTUFBTUMsUUFBUSxHQUFHOUQsR0FBRyxDQUFDVixJQUFJLENBQUN3RSxRQUFRO0lBQ2xDLE1BQU1DLFFBQVEsR0FBR0YsSUFBSSxJQUFJMUQsYUFBSyxDQUFDNkQsY0FBYyxDQUFDRCxRQUFRLENBQUNGLElBQUksQ0FBQztJQUM1RCxJQUFJLENBQUNDLFFBQVEsSUFBSSxDQUFDOUMsTUFBTSxDQUFDaUQsVUFBVSxDQUFDQyxzQkFBc0IsSUFBSUgsUUFBUSxFQUFFO01BQ3RFN0QsSUFBSSxDQUNGLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQytELGVBQWUsRUFBRSw0Q0FBNEMsQ0FDM0YsQ0FBQztNQUNEO0lBQ0Y7SUFDQSxJQUFJLENBQUNMLFFBQVEsSUFBSSxDQUFDOUMsTUFBTSxDQUFDaUQsVUFBVSxDQUFDRywwQkFBMEIsSUFBSSxDQUFDTCxRQUFRLElBQUlGLElBQUksRUFBRTtNQUNuRjNELElBQUksQ0FDRixJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FDYkQsYUFBSyxDQUFDQyxLQUFLLENBQUMrRCxlQUFlLEVBQzNCLGdEQUNGLENBQ0YsQ0FBQztNQUNEO0lBQ0Y7SUFDQSxJQUFJLENBQUNMLFFBQVEsSUFBSSxDQUFDOUMsTUFBTSxDQUFDaUQsVUFBVSxDQUFDSSxlQUFlLElBQUksQ0FBQ1IsSUFBSSxFQUFFO01BQzVEM0QsSUFBSSxDQUFDLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQytELGVBQWUsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO01BQ3hGO0lBQ0Y7SUFDQSxNQUFNdEMsZUFBZSxHQUFHYixNQUFNLENBQUNhLGVBQWU7SUFDOUMsTUFBTTtNQUFFRDtJQUFTLENBQUMsR0FBRzVCLEdBQUcsQ0FBQ3FCLE1BQU07SUFDL0IsTUFBTVUsV0FBVyxHQUFHL0IsR0FBRyxDQUFDbkIsR0FBRyxDQUFDLGNBQWMsQ0FBQztJQUUzQyxJQUFJLENBQUNtQixHQUFHLENBQUNzRSxJQUFJLElBQUksQ0FBQ3RFLEdBQUcsQ0FBQ3NFLElBQUksQ0FBQ2hCLE1BQU0sRUFBRTtNQUNqQ3BELElBQUksQ0FBQyxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMrRCxlQUFlLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztNQUMxRTtJQUNGO0lBRUEsTUFBTXhDLEtBQUssR0FBR0UsZUFBZSxDQUFDMEMsZ0JBQWdCLENBQUMzQyxRQUFRLENBQUM7SUFDeEQsSUFBSUQsS0FBSyxFQUFFO01BQ1R6QixJQUFJLENBQUN5QixLQUFLLENBQUM7TUFDWDtJQUNGO0lBRUEsTUFBTTZDLGNBQWMsR0FBR3hELE1BQU0sQ0FBQ2lELFVBQVUsRUFBRU8sY0FBYztJQUN4RCxJQUFJLENBQUNWLFFBQVEsSUFBSVUsY0FBYyxFQUFFO01BQy9CLE1BQU0xQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRW5ELE9BQU87TUFDM0MsTUFBTThGLGdCQUFnQixHQUFHQyxTQUFTLElBQUk7UUFDcEMsT0FBT0YsY0FBYyxDQUFDRyxJQUFJLENBQUNDLEdBQUcsSUFBSTtVQUNoQyxJQUFJQSxHQUFHLEtBQUssR0FBRyxFQUFFO1lBQ2YsT0FBTyxJQUFJO1VBQ2I7VUFDQSxNQUFNQyxLQUFLLEdBQUcsSUFBSUMsTUFBTSxDQUFDRixHQUFHLENBQUM7VUFDN0IsSUFBSUMsS0FBSyxDQUFDRSxJQUFJLENBQUNMLFNBQVMsQ0FBQyxFQUFFO1lBQ3pCLE9BQU8sSUFBSTtVQUNiO1FBQ0YsQ0FBQyxDQUFDO01BQ0osQ0FBQztNQUNELE1BQU1NLGVBQWUsR0FBR0osR0FBRyxJQUFJO1FBQzdCMUUsSUFBSSxDQUNGLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUNiRCxhQUFLLENBQUNDLEtBQUssQ0FBQytELGVBQWUsRUFDM0IsNEJBQTRCUyxHQUFHLGVBQ2pDLENBQ0YsQ0FBQztNQUNILENBQUM7O01BRUQ7TUFDQSxJQUFJRixTQUFTLEdBQUdyRixLQUFLLENBQUM0RixnQkFBZ0IsQ0FBQ3JELFFBQVEsQ0FBQztNQUNoRDhDLFNBQVMsR0FBR0EsU0FBUyxFQUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUVDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO01BRXpELE1BQU1DLHFCQUFxQixHQUFHVixTQUFTLElBQUk1QyxJQUFJLENBQUNFLE9BQU8sQ0FBQ0osUUFBUSxDQUFDO01BQ2pFLElBQUk4QyxTQUFTLElBQUksQ0FBQ0QsZ0JBQWdCLENBQUNDLFNBQVMsQ0FBQyxFQUFFO1FBQzdDTSxlQUFlLENBQUNOLFNBQVMsQ0FBQztRQUMxQjtNQUNGOztNQUVBO01BQ0E7TUFDQTtNQUNBO01BQ0E7TUFDQSxNQUFNVyxtQkFBbUIsR0FBR2IsY0FBYyxDQUFDYyxRQUFRLENBQUMsR0FBRyxDQUFDO01BQ3hELElBQUksQ0FBQ0YscUJBQXFCLElBQUlyRCxXQUFXLElBQUksQ0FBQ3NELG1CQUFtQixFQUFFO1FBQ2pFLE1BQU1FLFVBQVUsR0FBR3hELFdBQVcsQ0FBQ3lELE9BQU8sQ0FBQyxHQUFHLENBQUM7UUFDM0MsTUFBTWpGLElBQUksR0FBR2dGLFVBQVUsR0FBRyxDQUFDLEdBQUd4RCxXQUFXLENBQUMwRCxLQUFLLENBQUMsQ0FBQyxFQUFFRixVQUFVLENBQUMsQ0FBQ0csSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFO1FBQzFFLE1BQU1DLE9BQU8sR0FDWEosVUFBVSxHQUFHLENBQUMsR0FBR3hELFdBQVcsQ0FBQzBELEtBQUssQ0FBQ0YsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDTCxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUNRLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRTtRQUM5RTtRQUNBO1FBQ0EsTUFBTUUsS0FBSyxHQUFHLGdDQUFnQztRQUM5QyxJQUFJLENBQUNBLEtBQUssQ0FBQ2IsSUFBSSxDQUFDeEUsSUFBSSxDQUFDLElBQUksQ0FBQ3FGLEtBQUssQ0FBQ2IsSUFBSSxDQUFDWSxPQUFPLENBQUMsRUFBRTtVQUM3QztVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBLE1BQU1FLFNBQVMsR0FBRyxDQUFDTixVQUFVLEdBQUcsQ0FBQyxHQUFHeEQsV0FBVyxDQUFDbUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHM0UsSUFBSSxFQUFFNEUsT0FBTyxDQUMzRSxNQUFNLEVBQ04sRUFDRixDQUFDO1VBQ0QsSUFBSVUsU0FBUyxJQUFJLENBQUNwQixnQkFBZ0IsQ0FBQ29CLFNBQVMsQ0FBQyxFQUFFO1lBQzdDYixlQUFlLENBQUNhLFNBQVMsQ0FBQztZQUMxQjtVQUNGO1VBQ0EzRixJQUFJLENBQUMsSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDK0QsZUFBZSxFQUFFLHVCQUF1QixDQUFDLENBQUM7VUFDM0U7UUFDRjtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0EsTUFBTTJCLG9CQUFvQixHQUFHSCxPQUFPLENBQUNSLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1FBQ3hELElBQUksQ0FBQ1YsZ0JBQWdCLENBQUNxQixvQkFBb0IsQ0FBQyxFQUFFO1VBQzNDZCxlQUFlLENBQUNjLG9CQUFvQixDQUFDO1VBQ3JDO1FBQ0Y7TUFDRjtJQUNGO0lBRUEsTUFBTTNELE1BQU0sR0FBR25DLEdBQUcsQ0FBQ3NFLElBQUksQ0FBQ3BCLFFBQVEsQ0FBQyxRQUFRLENBQUM7SUFDMUMsTUFBTWpCLElBQUksR0FBRyxJQUFJOUIsYUFBSyxDQUFDK0IsSUFBSSxDQUFDTixRQUFRLEVBQUU7TUFBRU87SUFBTyxDQUFDLEVBQUVKLFdBQVcsQ0FBQztJQUM5RCxNQUFNO01BQUVnRSxRQUFRLEdBQUcsQ0FBQyxDQUFDO01BQUVDLElBQUksR0FBRyxDQUFDO0lBQUUsQ0FBQyxHQUFHaEcsR0FBRyxDQUFDaUcsUUFBUSxJQUFJLENBQUMsQ0FBQztJQUN2RCxJQUFJO01BQ0Y7TUFDQTVHLEtBQUssQ0FBQzZHLHVCQUF1QixDQUFDbEYsTUFBTSxFQUFFK0UsUUFBUSxDQUFDO01BQy9DMUcsS0FBSyxDQUFDNkcsdUJBQXVCLENBQUNsRixNQUFNLEVBQUVnRixJQUFJLENBQUM7SUFDN0MsQ0FBQyxDQUFDLE9BQU9yRSxLQUFLLEVBQUU7TUFDZHpCLElBQUksQ0FBQyxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMrRixnQkFBZ0IsRUFBRXhFLEtBQUssQ0FBQyxDQUFDO01BQzFEO0lBQ0Y7SUFDQU0sSUFBSSxDQUFDbUUsT0FBTyxDQUFDSixJQUFJLENBQUM7SUFDbEIvRCxJQUFJLENBQUNvRSxXQUFXLENBQUNOLFFBQVEsQ0FBQztJQUMxQixNQUFNTyxRQUFRLEdBQUduRCxNQUFNLENBQUNvRCxVQUFVLENBQUN2RyxHQUFHLENBQUNzRSxJQUFJLENBQUM7SUFDNUMsTUFBTWtDLFVBQVUsR0FBRztNQUFFdkUsSUFBSTtNQUFFcUU7SUFBUyxDQUFDO0lBQ3JDLElBQUk7TUFDRjtNQUNBLE1BQU1qRSxhQUFhLEdBQUcsTUFBTWpELFFBQVEsQ0FBQ2tELG1CQUFtQixDQUN0RGxELFFBQVEsQ0FBQ21ELEtBQUssQ0FBQ2tFLFVBQVUsRUFDekJELFVBQVUsRUFDVnhGLE1BQU0sRUFDTmhCLEdBQUcsQ0FBQ1YsSUFDTixDQUFDO01BQ0QsSUFBSW9ILFVBQVU7TUFDZDtNQUNBLElBQUlyRSxhQUFhLFlBQVlsQyxhQUFLLENBQUMrQixJQUFJLEVBQUU7UUFDdkNzRSxVQUFVLENBQUN2RSxJQUFJLEdBQUdJLGFBQWE7UUFDL0IsSUFBSUEsYUFBYSxDQUFDc0UsR0FBRyxDQUFDLENBQUMsRUFBRTtVQUN2QjtVQUNBSCxVQUFVLENBQUNGLFFBQVEsR0FBRyxJQUFJO1VBQzFCSSxVQUFVLEdBQUc7WUFDWEMsR0FBRyxFQUFFdEUsYUFBYSxDQUFDc0UsR0FBRyxDQUFDLENBQUM7WUFDeEJDLElBQUksRUFBRXZFLGFBQWEsQ0FBQ0k7VUFDdEIsQ0FBQztRQUNIO01BQ0Y7TUFDQTtNQUNBLElBQUksQ0FBQ2lFLFVBQVUsRUFBRTtRQUNmO1FBQ0EsTUFBTUcsVUFBVSxHQUFHMUQsTUFBTSxDQUFDQyxJQUFJLENBQUNvRCxVQUFVLENBQUN2RSxJQUFJLENBQUNvQixLQUFLLEVBQUUsUUFBUSxDQUFDO1FBQy9EbUQsVUFBVSxDQUFDRixRQUFRLEdBQUduRCxNQUFNLENBQUNvRCxVQUFVLENBQUNNLFVBQVUsQ0FBQztRQUNuRDtRQUNBLE1BQU1DLFdBQVcsR0FBRztVQUNsQmYsUUFBUSxFQUFFUyxVQUFVLENBQUN2RSxJQUFJLENBQUM4RTtRQUM1QixDQUFDO1FBQ0Q7UUFDQTtRQUNBLE1BQU1DLFFBQVEsR0FDWi9ILE1BQU0sQ0FBQ2dJLElBQUksQ0FBQ1QsVUFBVSxDQUFDdkUsSUFBSSxDQUFDaUYsS0FBSyxDQUFDLENBQUM1RCxNQUFNLEdBQUcsQ0FBQyxHQUFHO1VBQUUwQyxJQUFJLEVBQUVRLFVBQVUsQ0FBQ3ZFLElBQUksQ0FBQ2lGO1FBQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0RmpJLE1BQU0sQ0FBQ2tJLE1BQU0sQ0FBQ0wsV0FBVyxFQUFFRSxRQUFRLENBQUM7UUFDcEM7UUFDQSxNQUFNSSxnQkFBZ0IsR0FBRyxNQUFNdkYsZUFBZSxDQUFDd0YsVUFBVSxDQUN2RHJHLE1BQU0sRUFDTndGLFVBQVUsQ0FBQ3ZFLElBQUksQ0FBQ1EsS0FBSyxFQUNyQm9FLFVBQVUsRUFDVkwsVUFBVSxDQUFDdkUsSUFBSSxDQUFDcUYsT0FBTyxDQUFDL0csSUFBSSxFQUM1QnVHLFdBQ0YsQ0FBQztRQUNEO1FBQ0FOLFVBQVUsQ0FBQ3ZFLElBQUksQ0FBQ1EsS0FBSyxHQUFHMkUsZ0JBQWdCLENBQUNSLElBQUk7UUFDN0NKLFVBQVUsQ0FBQ3ZFLElBQUksQ0FBQ3NGLElBQUksR0FBR0gsZ0JBQWdCLENBQUNULEdBQUc7UUFDM0NILFVBQVUsQ0FBQ3ZFLElBQUksQ0FBQ3VGLFlBQVksR0FBRyxJQUFJO1FBQ25DaEIsVUFBVSxDQUFDdkUsSUFBSSxDQUFDd0YsYUFBYSxHQUFHQyxPQUFPLENBQUNDLE9BQU8sQ0FBQ25CLFVBQVUsQ0FBQ3ZFLElBQUksQ0FBQztRQUNoRXlFLFVBQVUsR0FBRztVQUNYQyxHQUFHLEVBQUVTLGdCQUFnQixDQUFDVCxHQUFHO1VBQ3pCQyxJQUFJLEVBQUVRLGdCQUFnQixDQUFDUjtRQUN6QixDQUFDO01BQ0g7TUFDQTtNQUNBLE1BQU14SCxRQUFRLENBQUNrRCxtQkFBbUIsQ0FBQ2xELFFBQVEsQ0FBQ21ELEtBQUssQ0FBQ3FGLFNBQVMsRUFBRXBCLFVBQVUsRUFBRXhGLE1BQU0sRUFBRWhCLEdBQUcsQ0FBQ1YsSUFBSSxDQUFDO01BQzFGVyxHQUFHLENBQUNzQixNQUFNLENBQUMsR0FBRyxDQUFDO01BQ2Z0QixHQUFHLENBQUNuQixHQUFHLENBQUMsVUFBVSxFQUFFNEgsVUFBVSxDQUFDQyxHQUFHLENBQUM7TUFDbkMxRyxHQUFHLENBQUN1QixJQUFJLENBQUNrRixVQUFVLENBQUM7SUFDdEIsQ0FBQyxDQUFDLE9BQU96SSxDQUFDLEVBQUU7TUFDVjRKLGVBQU0sQ0FBQ2xHLEtBQUssQ0FBQyx5QkFBeUIsRUFBRTFELENBQUMsQ0FBQztNQUMxQyxNQUFNMEQsS0FBSyxHQUFHdkMsUUFBUSxDQUFDb0UsWUFBWSxDQUFDdkYsQ0FBQyxFQUFFO1FBQ3JDd0QsSUFBSSxFQUFFdEIsYUFBSyxDQUFDQyxLQUFLLENBQUMrRCxlQUFlO1FBQ2pDVCxPQUFPLEVBQUUseUJBQXlCOEMsVUFBVSxDQUFDdkUsSUFBSSxDQUFDUSxLQUFLO01BQ3pELENBQUMsQ0FBQztNQUNGdkMsSUFBSSxDQUFDeUIsS0FBSyxDQUFDO0lBQ2I7RUFDRjtFQUVBLE1BQU1iLGFBQWFBLENBQUNkLEdBQUcsRUFBRUMsR0FBRyxFQUFFQyxJQUFJLEVBQUU7SUFDbEMsSUFBSUYsR0FBRyxDQUFDVixJQUFJLENBQUNxRSxVQUFVLEVBQUU7TUFDdkIsTUFBTWhDLEtBQUssR0FBRyxJQUFBaUMsK0JBQXdCLEVBQUMsR0FBRyxFQUFFLHFEQUFxRCxFQUFFNUQsR0FBRyxDQUFDZ0IsTUFBTSxDQUFDO01BQzlHZixHQUFHLENBQUNzQixNQUFNLENBQUNJLEtBQUssQ0FBQ0osTUFBTSxDQUFDO01BQ3hCdEIsR0FBRyxDQUFDOEMsR0FBRyxDQUFDLGFBQWFwQixLQUFLLENBQUMrQixPQUFPLElBQUksQ0FBQztNQUN2QztJQUNGO0lBQ0EsSUFBSTtNQUNGLE1BQU07UUFBRTdCO01BQWdCLENBQUMsR0FBRzdCLEdBQUcsQ0FBQ2dCLE1BQU07TUFDdEMsTUFBTTtRQUFFWTtNQUFTLENBQUMsR0FBRzVCLEdBQUcsQ0FBQ3FCLE1BQU07TUFDL0I7TUFDQSxNQUFNWSxJQUFJLEdBQUcsSUFBSTlCLGFBQUssQ0FBQytCLElBQUksQ0FBQ04sUUFBUSxDQUFDO01BQ3JDSyxJQUFJLENBQUNzRixJQUFJLEdBQUcsTUFBTTFGLGVBQWUsQ0FBQ2lHLE9BQU8sQ0FBQ0MsZUFBZSxDQUFDL0gsR0FBRyxDQUFDZ0IsTUFBTSxFQUFFWSxRQUFRLENBQUM7TUFDL0UsTUFBTTRFLFVBQVUsR0FBRztRQUFFdkUsSUFBSTtRQUFFcUUsUUFBUSxFQUFFO01BQUssQ0FBQztNQUMzQyxNQUFNbEgsUUFBUSxDQUFDa0QsbUJBQW1CLENBQ2hDbEQsUUFBUSxDQUFDbUQsS0FBSyxDQUFDeUYsWUFBWSxFQUMzQnhCLFVBQVUsRUFDVnhHLEdBQUcsQ0FBQ2dCLE1BQU0sRUFDVmhCLEdBQUcsQ0FBQ1YsSUFDTixDQUFDO01BQ0Q7TUFDQSxNQUFNdUMsZUFBZSxDQUFDb0csVUFBVSxDQUFDakksR0FBRyxDQUFDZ0IsTUFBTSxFQUFFWSxRQUFRLENBQUM7TUFDdEQ7TUFDQSxNQUFNeEMsUUFBUSxDQUFDa0QsbUJBQW1CLENBQ2hDbEQsUUFBUSxDQUFDbUQsS0FBSyxDQUFDMkYsV0FBVyxFQUMxQjFCLFVBQVUsRUFDVnhHLEdBQUcsQ0FBQ2dCLE1BQU0sRUFDVmhCLEdBQUcsQ0FBQ1YsSUFDTixDQUFDO01BQ0RXLEdBQUcsQ0FBQ3NCLE1BQU0sQ0FBQyxHQUFHLENBQUM7TUFDZjtNQUNBdEIsR0FBRyxDQUFDOEMsR0FBRyxDQUFDLENBQUM7SUFDWCxDQUFDLENBQUMsT0FBTzlFLENBQUMsRUFBRTtNQUNWNEosZUFBTSxDQUFDbEcsS0FBSyxDQUFDLHlCQUF5QixFQUFFMUQsQ0FBQyxDQUFDO01BQzFDLE1BQU0wRCxLQUFLLEdBQUd2QyxRQUFRLENBQUNvRSxZQUFZLENBQUN2RixDQUFDLEVBQUU7UUFDckN3RCxJQUFJLEVBQUV0QixhQUFLLENBQUNDLEtBQUssQ0FBQytILGlCQUFpQjtRQUNuQ3pFLE9BQU8sRUFBRTtNQUNYLENBQUMsQ0FBQztNQUNGeEQsSUFBSSxDQUFDeUIsS0FBSyxDQUFDO0lBQ2I7RUFDRjtFQUVBLE1BQU03QixlQUFlQSxDQUFDRSxHQUFHLEVBQUVDLEdBQUcsRUFBRTtJQUM5QixJQUFJO01BQ0YsTUFBTWUsTUFBTSxHQUFHSSxlQUFNLENBQUN2QyxHQUFHLENBQUNtQixHQUFHLENBQUNxQixNQUFNLENBQUNDLEtBQUssQ0FBQztNQUMzQyxJQUFJLENBQUNOLE1BQU0sRUFBRTtRQUNYZixHQUFHLENBQUNzQixNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2Z0QixHQUFHLENBQUN1QixJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDWjtNQUNGO01BQ0EsTUFBTTtRQUFFSztNQUFnQixDQUFDLEdBQUdiLE1BQU07TUFDbEMsSUFBSTtRQUFFWTtNQUFTLENBQUMsR0FBRzVCLEdBQUcsQ0FBQ3FCLE1BQU07TUFDN0IsTUFBTVksSUFBSSxHQUFHLElBQUk5QixhQUFLLENBQUMrQixJQUFJLENBQUNOLFFBQVEsRUFBRTtRQUFFTyxNQUFNLEVBQUU7TUFBRyxDQUFDLENBQUM7TUFDckQsTUFBTUMsUUFBUSxHQUFHLE1BQU03QyxXQUFXLENBQUN3QixZQUFZLENBQUNmLEdBQUcsRUFBRWdCLE1BQU0sQ0FBQztNQUM1RCxNQUFNcUIsYUFBYSxHQUFHLE1BQU1qRCxRQUFRLENBQUNrRCxtQkFBbUIsQ0FDdERsRCxRQUFRLENBQUNtRCxLQUFLLENBQUNDLFVBQVUsRUFDekI7UUFBRVA7TUFBSyxDQUFDLEVBQ1JqQixNQUFNLEVBQ05vQixRQUNGLENBQUM7TUFDRCxJQUFJQyxhQUFhLEVBQUVKLElBQUksRUFBRVEsS0FBSyxFQUFFO1FBQzlCYixRQUFRLEdBQUdTLGFBQWEsQ0FBQ0osSUFBSSxDQUFDUSxLQUFLO01BQ3JDO01BQ0EsTUFBTU8sSUFBSSxHQUFHLE1BQU1uQixlQUFlLENBQUN1RyxXQUFXLENBQUN4RyxRQUFRLENBQUMsQ0FBQ2tCLEtBQUssQ0FBQyxNQUFNO1FBQ25FN0MsR0FBRyxDQUFDc0IsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmdEIsR0FBRyxDQUFDdUIsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ2QsQ0FBQyxDQUFDO01BQ0YsSUFBSSxDQUFDd0IsSUFBSSxFQUFFO1FBQ1Q7TUFDRjtNQUNBLE1BQU01RCxRQUFRLENBQUNrRCxtQkFBbUIsQ0FDaENsRCxRQUFRLENBQUNtRCxLQUFLLENBQUNJLFNBQVMsRUFDeEI7UUFBRVY7TUFBSyxDQUFDLEVBQ1JqQixNQUFNLEVBQ05vQixRQUNGLENBQUM7TUFDRG5DLEdBQUcsQ0FBQ3NCLE1BQU0sQ0FBQyxHQUFHLENBQUM7TUFDZnRCLEdBQUcsQ0FBQ3VCLElBQUksQ0FBQ3dCLElBQUksQ0FBQztJQUNoQixDQUFDLENBQUMsT0FBTy9FLENBQUMsRUFBRTtNQUNWLE1BQU1zRixHQUFHLEdBQUduRSxRQUFRLENBQUNvRSxZQUFZLENBQUN2RixDQUFDLEVBQUU7UUFDbkN3RCxJQUFJLEVBQUV0QixhQUFLLENBQUNDLEtBQUssQ0FBQ3FELGFBQWE7UUFDL0JDLE9BQU8sRUFBRTtNQUNYLENBQUMsQ0FBQztNQUNGekQsR0FBRyxDQUFDc0IsTUFBTSxDQUFDLEdBQUcsQ0FBQztNQUNmdEIsR0FBRyxDQUFDdUIsSUFBSSxDQUFDO1FBQUVDLElBQUksRUFBRThCLEdBQUcsQ0FBQzlCLElBQUk7UUFBRUUsS0FBSyxFQUFFNEIsR0FBRyxDQUFDRztNQUFRLENBQUMsQ0FBQztJQUNsRDtFQUNGO0FBQ0Y7QUFBQzJFLE9BQUEsQ0FBQTlJLFdBQUEsR0FBQUEsV0FBQTtBQUVELFNBQVNtRCxnQkFBZ0JBLENBQUMxQyxHQUFHLEVBQUU2QixlQUFlLEVBQUU7RUFDOUMsTUFBTXlHLEtBQUssR0FBRyxDQUFDdEksR0FBRyxDQUFDbkIsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssRUFBRXFHLEtBQUssQ0FBQyxHQUFHLENBQUM7RUFDcEQsTUFBTXFELEtBQUssR0FBR0MsTUFBTSxDQUFDRixLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDOUIsTUFBTXZGLEdBQUcsR0FBR3lGLE1BQU0sQ0FBQ0YsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzVCLE9BQ0UsQ0FBQyxDQUFDRyxLQUFLLENBQUNGLEtBQUssQ0FBQyxJQUFJLENBQUNFLEtBQUssQ0FBQzFGLEdBQUcsQ0FBQyxLQUFLLE9BQU9sQixlQUFlLENBQUNpRyxPQUFPLENBQUNqRixnQkFBZ0IsS0FBSyxVQUFVO0FBRXBHIiwiaWdub3JlTGlzdCI6W119