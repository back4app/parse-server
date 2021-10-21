'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getRouter = getRouter;

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _middlewares = require('../middlewares');

var middlewares = _interopRequireWildcard(_middlewares);

var _multer = require('multer');

var _multer2 = _interopRequireDefault(_multer);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function handleImport(req, res) {
  var restObjects = [];
  var importFile = void 0;
  try {
    importFile = JSON.parse(req.file.buffer.toString());
  } catch (e) {
    res.status(400);
    res.json({ response: 'Failed to parse JSON based on the file sent' });
    return;
  }

  if (Array.isArray(importFile)) {
    restObjects = importFile;
  } else if (Array.isArray(importFile.results)) {
    restObjects = importFile.results;
  } else if (Array.isArray(importFile.rows)) {
    restObjects = importFile.rows;
  }

  if (!restObjects) {
    res.status(400);
    res.json({ response: 'No data to import' });
    return;
  }

  if (req.body.feedbackEmail) {
    var emailControllerAdapter = req.config.emailControllerAdapter;
    if (!emailControllerAdapter) {
      res.status(400);
      res.json({ response: 'You have to setup a Mail Adapter.' });
      return;
    } else {
      res.status(200);
      res.json({ response: 'We are importing your data. You will be notified by e-mail once it is completed.' });
    }
    _bluebird2.default.map(restObjects, importRestObject, { concurrency: 100 }).then(function () {
      emailControllerAdapter.sendMail({
        text: 'We have successfully imported your data to the class ' + req.params.className + '.',
        to: req.body.feedbackEmail,
        subject: 'Import completed'
      });
    }).catch(function (error) {
      emailControllerAdapter.sendMail({
        text: 'We could not import your data to the class ' + req.params.className + '. Error: ' + error,
        to: req.body.feedbackEmail,
        subject: 'Import failed'
      });
    });
  } else {
    _bluebird2.default.map(restObjects, importRestObject, { concurrency: 100 }).then(function (results) {
      res.status(200);
      res.json({ response: results });
    }).catch(function (error) {
      res.status(500);
      res.json({ response: 'Internal server error: ' + error });
    });
  }

  function importRestObject(restObject) {
    if (restObject.createdAt) {
      delete restObject.createdAt;
    }
    if (restObject.updatedAt) {
      delete restObject.updatedAt;
    }
    if (restObject.objectId) {
      return _rest2.default.update(req.config, req.auth, req.params.className, restObject.objectId, restObject).catch(function (error) {
        if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
          return _rest2.default.create(req.config, req.auth, req.params.className, restObject, req.info.clientSDK, { allowObjectId: true });
        } else {
          return Promise.reject(error);
        }
      });
    } else {
      return _rest2.default.create(req.config, req.auth, req.params.className, restObject);
    }
  }
}

function getRouter() {
  var upload = (0, _multer2.default)();
  var router = _express2.default.Router();
  router.post('/import_data/:className', upload.single('importFile'), middlewares.allowCrossDomain, middlewares.handleParseHeaders, middlewares.enforceMasterKeyAccess, function (req, res) {
    return handleImport(req, res);
  });
  return router;
}