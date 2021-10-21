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

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function handleImportRelation(req, res) {
  var targetClass = void 0;

  function getOneSchema() {
    var className = req.params.className;
    return req.config.database.loadSchema({ clearCache: true }).then(function (schemaController) {
      return schemaController.getOneSchema(className);
    }).catch(function (error) {
      if (error === undefined) {
        return Promise.reject(new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'Class ' + className + ' does not exist.'));
      } else {
        return Promise.reject(new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.'));
      }
    });
  }

  function importRestObject(restObject) {
    return _rest2.default.update(req.config, req.auth, req.params.className, restObject.owningId, _defineProperty({}, req.params.relationName, {
      "__op": "AddRelation",
      "objects": [{ "__type": "Pointer", "className": targetClass, "objectId": restObject.relatedId }]
    }), req.info.clientSDK).catch(function (error) {
      if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
        return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found'));
      } else {
        return Promise.reject(error);
      }
    });
  }

  return getOneSchema().then(function (response) {
    if (!response.fields.hasOwnProperty(req.params.relationName)) {
      res.status(400);
      res.json({ response: 'Relation ' + req.params.relationName + ' does not exist in ' + req.params.className + '.' });
      return;
    } else if (response.fields[req.params.relationName].type !== 'Relation') {
      res.status(400);
      res.json({ response: 'Class ' + response.fields[req.params.relationName].targetClass + ' does not have Relation type.' });
      return;
    }

    targetClass = response.fields[req.params.relationName].targetClass;
    var importFile = void 0;
    var restObjects = [];
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
          text: 'We have successfully imported your data to the class ' + req.params.className + ', relation ' + req.params.relationName + '.',
          to: req.body.feedbackEmail,
          subject: 'Import completed'
        });
      }).catch(function (error) {
        emailControllerAdapter.sendMail({
          text: 'We could not import your data to the class ' + req.params.className + ', relation ' + req.params.relationName + '. Error: ' + error,
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
  }).catch(function (error) {
    res.status(400);
    res.json({ response: 'It was not possible to import your data: ' + error });
  });
}

function getRouter() {
  var upload = (0, _multer2.default)();
  var router = _express2.default.Router();
  router.post('/import_relation_data/:className/:relationName', upload.single('importFile'), middlewares.allowCrossDomain, middlewares.handleParseHeaders, middlewares.enforceMasterKeyAccess, function (req, res) {
    return handleImportRelation(req, res);
  });
  return router;
}