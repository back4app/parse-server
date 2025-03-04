"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefinedSchemas = void 0;
var _logger = require("../logger");
var _Config = _interopRequireDefault(require("../Config"));
var _SchemasRouter = require("../Routers/SchemasRouter");
var _SchemaController = require("../Controllers/SchemaController");
var _Options = require("../Options");
var Migrations = _interopRequireWildcard(require("./Migrations"));
var _Auth = _interopRequireDefault(require("../Auth"));
var _rest = _interopRequireDefault(require("../rest"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
// -disable-next Cannot resolve module `parse/node`.
const Parse = require('parse/node');
class DefinedSchemas {
  constructor(schemaOptions, config) {
    this.localSchemas = [];
    this.config = _Config.default.get(config.appId);
    this.schemaOptions = schemaOptions;
    if (schemaOptions && schemaOptions.definitions) {
      if (!Array.isArray(schemaOptions.definitions)) {
        throw `"schema.definitions" must be an array of schemas`;
      }
      this.localSchemas = schemaOptions.definitions;
    }
    this.retries = 0;
    this.maxRetries = 3;
  }
  async saveSchemaToDB(schema) {
    const payload = {
      className: schema.className,
      fields: schema._fields,
      indexes: schema._indexes,
      classLevelPermissions: schema._clp
    };
    await (0, _SchemasRouter.internalCreateSchema)(schema.className, payload, this.config);
    this.resetSchemaOps(schema);
  }
  resetSchemaOps(schema) {
    // Reset ops like SDK
    schema._fields = {};
    schema._indexes = {};
  }

  // Simulate update like the SDK
  // We cannot use SDK since routes are disabled
  async updateSchemaToDB(schema) {
    const payload = {
      className: schema.className,
      fields: schema._fields,
      indexes: schema._indexes,
      classLevelPermissions: schema._clp
    };
    await (0, _SchemasRouter.internalUpdateSchema)(schema.className, payload, this.config);
    this.resetSchemaOps(schema);
  }
  async execute() {
    try {
      _logger.logger.info('Running Migrations');
      if (this.schemaOptions && this.schemaOptions.beforeMigration) {
        await Promise.resolve(this.schemaOptions.beforeMigration());
      }
      await this.executeMigrations();
      if (this.schemaOptions && this.schemaOptions.afterMigration) {
        await Promise.resolve(this.schemaOptions.afterMigration());
      }
      _logger.logger.info('Running Migrations Completed');
    } catch (e) {
      _logger.logger.error(`Failed to run migrations: ${e}`);
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    }
  }
  async executeMigrations() {
    let timeout = null;
    try {
      // Set up a time out in production
      // if we fail to get schema
      // pm2 or K8s and many other process managers will try to restart the process
      // after the exit
      if (process.env.NODE_ENV === 'production') {
        timeout = setTimeout(() => {
          _logger.logger.error('Timeout occurred during execution of migrations. Exiting...');
          process.exit(1);
        }, 20000);
      }
      await this.createDeleteSession();
      // -disable-next-line
      const schemaController = await this.config.database.loadSchema();
      this.allCloudSchemas = await schemaController.getAllClasses();
      clearTimeout(timeout);
      await Promise.all(this.localSchemas.map(async localSchema => this.saveOrUpdate(localSchema)));
      this.checkForMissingSchemas();
      await this.enforceCLPForNonProvidedClass();
    } catch (e) {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (this.retries < this.maxRetries) {
        this.retries++;
        // first retry 1sec, 2sec, 3sec total 6sec retry sequence
        // retry will only happen in case of deploying multi parse server instance
        // at the same time. Modern systems like k8 avoid this by doing rolling updates
        await this.wait(1000 * this.retries);
        await this.executeMigrations();
      } else {
        _logger.logger.error(`Failed to run migrations: ${e}`);
        if (process.env.NODE_ENV === 'production') {
          process.exit(1);
        }
      }
    }
  }
  checkForMissingSchemas() {
    if (this.schemaOptions.strict !== true) {
      return;
    }
    const cloudSchemas = this.allCloudSchemas.map(s => s.className);
    const localSchemas = this.localSchemas.map(s => s.className);
    const missingSchemas = cloudSchemas.filter(c => !localSchemas.includes(c) && !_SchemaController.systemClasses.includes(c));
    if (new Set(localSchemas).size !== localSchemas.length) {
      _logger.logger.error(`The list of schemas provided contains duplicated "className"  "${localSchemas.join('","')}"`);
      process.exit(1);
    }
    if (this.schemaOptions.strict && missingSchemas.length) {
      _logger.logger.warn(`The following schemas are currently present in the database, but not explicitly defined in a schema: "${missingSchemas.join('", "')}"`);
    }
  }

  // Required for testing purpose
  wait(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }
  async enforceCLPForNonProvidedClass() {
    const nonProvidedClasses = this.allCloudSchemas.filter(cloudSchema => !this.localSchemas.some(localSchema => localSchema.className === cloudSchema.className));
    await Promise.all(nonProvidedClasses.map(async schema => {
      const parseSchema = new Parse.Schema(schema.className);
      this.handleCLP(schema, parseSchema);
      await this.updateSchemaToDB(parseSchema);
    }));
  }

  // Create a fake session since Parse do not create the _Session until
  // a session is created
  async createDeleteSession() {
    const {
      response
    } = await _rest.default.create(this.config, _Auth.default.master(this.config), '_Session', {});
    await _rest.default.del(this.config, _Auth.default.master(this.config), '_Session', response.objectId);
  }
  async saveOrUpdate(localSchema) {
    const cloudSchema = this.allCloudSchemas.find(sc => sc.className === localSchema.className);
    if (cloudSchema) {
      try {
        await this.updateSchema(localSchema, cloudSchema);
      } catch (e) {
        throw `Error during update of schema for type ${cloudSchema.className}: ${e}`;
      }
    } else {
      try {
        await this.saveSchema(localSchema);
      } catch (e) {
        throw `Error while saving Schema for type ${localSchema.className}: ${e}`;
      }
    }
  }
  async saveSchema(localSchema) {
    const newLocalSchema = new Parse.Schema(localSchema.className);
    if (localSchema.fields) {
      // Handle fields
      Object.keys(localSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
        if (localSchema.fields) {
          const field = localSchema.fields[fieldName];
          this.handleFields(newLocalSchema, fieldName, field);
        }
      });
    }
    // Handle indexes
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if (localSchema.indexes && !this.isProtectedIndex(localSchema.className, indexName)) {
          newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
        }
      });
    }
    this.handleCLP(localSchema, newLocalSchema);
    return await this.saveSchemaToDB(newLocalSchema);
  }
  async updateSchema(localSchema, cloudSchema) {
    const newLocalSchema = new Parse.Schema(localSchema.className);

    // Handle fields
    // Check addition
    if (localSchema.fields) {
      Object.keys(localSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
        // -disable-next
        const field = localSchema.fields[fieldName];
        if (!cloudSchema.fields[fieldName]) {
          this.handleFields(newLocalSchema, fieldName, field);
        }
      });
    }
    const fieldsToDelete = [];
    const fieldsToRecreate = [];
    const fieldsWithChangedParams = [];

    // Check deletion
    Object.keys(cloudSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
      const field = cloudSchema.fields[fieldName];
      if (!localSchema.fields || !localSchema.fields[fieldName]) {
        fieldsToDelete.push(fieldName);
        return;
      }
      const localField = localSchema.fields[fieldName];
      // Check if field has a changed type
      if (!this.paramsAreEquals({
        type: field.type,
        targetClass: field.targetClass
      }, {
        type: localField.type,
        targetClass: localField.targetClass
      })) {
        fieldsToRecreate.push({
          fieldName,
          from: {
            type: field.type,
            targetClass: field.targetClass
          },
          to: {
            type: localField.type,
            targetClass: localField.targetClass
          }
        });
        return;
      }

      // Check if something changed other than the type (like required, defaultValue)
      if (!this.paramsAreEquals(field, localField)) {
        fieldsWithChangedParams.push(fieldName);
      }
    });
    if (this.schemaOptions.deleteExtraFields === true) {
      fieldsToDelete.forEach(fieldName => {
        newLocalSchema.deleteField(fieldName);
      });

      // Delete fields from the schema then apply changes
      await this.updateSchemaToDB(newLocalSchema);
    } else if (this.schemaOptions.strict === true && fieldsToDelete.length) {
      _logger.logger.warn(`The following fields exist in the database for "${localSchema.className}", but are missing in the schema : "${fieldsToDelete.join('" ,"')}"`);
    }
    if (this.schemaOptions.recreateModifiedFields === true) {
      fieldsToRecreate.forEach(field => {
        newLocalSchema.deleteField(field.fieldName);
      });

      // Delete fields from the schema then apply changes
      await this.updateSchemaToDB(newLocalSchema);
      fieldsToRecreate.forEach(fieldInfo => {
        if (localSchema.fields) {
          const field = localSchema.fields[fieldInfo.fieldName];
          this.handleFields(newLocalSchema, fieldInfo.fieldName, field);
        }
      });
    } else if (this.schemaOptions.strict === true && fieldsToRecreate.length) {
      fieldsToRecreate.forEach(field => {
        const from = field.from.type + (field.from.targetClass ? ` (${field.from.targetClass})` : '');
        const to = field.to.type + (field.to.targetClass ? ` (${field.to.targetClass})` : '');
        _logger.logger.warn(`The field "${field.fieldName}" type differ between the schema and the database for "${localSchema.className}"; Schema is defined as "${to}" and current database type is "${from}"`);
      });
    }
    fieldsWithChangedParams.forEach(fieldName => {
      if (localSchema.fields) {
        const field = localSchema.fields[fieldName];
        this.handleFields(newLocalSchema, fieldName, field);
      }
    });

    // Handle Indexes
    // Check addition
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if ((!cloudSchema.indexes || !cloudSchema.indexes[indexName]) && !this.isProtectedIndex(localSchema.className, indexName)) {
          if (localSchema.indexes) {
            newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
          }
        }
      });
    }
    const indexesToAdd = [];

    // Check deletion
    if (cloudSchema.indexes) {
      Object.keys(cloudSchema.indexes).forEach(indexName => {
        if (!this.isProtectedIndex(localSchema.className, indexName)) {
          if (!localSchema.indexes || !localSchema.indexes[indexName]) {
            newLocalSchema.deleteIndex(indexName);
          } else if (!this.paramsAreEquals(localSchema.indexes[indexName], cloudSchema.indexes[indexName])) {
            newLocalSchema.deleteIndex(indexName);
            if (localSchema.indexes) {
              indexesToAdd.push({
                indexName,
                index: localSchema.indexes[indexName]
              });
            }
          }
        }
      });
    }
    this.handleCLP(localSchema, newLocalSchema, cloudSchema);
    // Apply changes
    await this.updateSchemaToDB(newLocalSchema);
    // Apply new/changed indexes
    if (indexesToAdd.length) {
      _logger.logger.debug(`Updating indexes for "${newLocalSchema.className}" :  ${indexesToAdd.join(' ,')}`);
      indexesToAdd.forEach(o => newLocalSchema.addIndex(o.indexName, o.index));
      await this.updateSchemaToDB(newLocalSchema);
    }
  }
  handleCLP(localSchema, newLocalSchema, cloudSchema) {
    if (!localSchema.classLevelPermissions && !cloudSchema) {
      _logger.logger.warn(`classLevelPermissions not provided for ${localSchema.className}.`);
    }
    // Use spread to avoid read only issue (encountered by Moumouls using directAccess)
    const clp = _objectSpread({}, localSchema.classLevelPermissions) || {};
    // To avoid inconsistency we need to remove all rights on addField
    clp.addField = {};
    newLocalSchema.setCLP(clp);
  }
  isProtectedFields(className, fieldName) {
    return !!_SchemaController.defaultColumns._Default[fieldName] || !!(_SchemaController.defaultColumns[className] && _SchemaController.defaultColumns[className][fieldName]);
  }
  isProtectedIndex(className, indexName) {
    const indexes = ['_id_'];
    switch (className) {
      case '_User':
        indexes.push('case_insensitive_username', 'case_insensitive_email', 'username_1', 'email_1');
        break;
      case '_Role':
        indexes.push('name_1');
        break;
      case '_Idempotency':
        indexes.push('reqId_1');
        break;
    }
    return indexes.indexOf(indexName) !== -1;
  }
  paramsAreEquals(objA, objB) {
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    // Check key name
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every(k => objA[k] === objB[k]);
  }
  handleFields(newLocalSchema, fieldName, field) {
    if (field.type === 'Relation') {
      newLocalSchema.addRelation(fieldName, field.targetClass);
    } else if (field.type === 'Pointer') {
      newLocalSchema.addPointer(fieldName, field.targetClass, field);
    } else {
      newLocalSchema.addField(fieldName, field.type, field);
    }
  }
}
exports.DefinedSchemas = DefinedSchemas;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwicmVxdWlyZSIsIl9Db25maWciLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2NoZW1hQ29udHJvbGxlciIsIl9PcHRpb25zIiwiTWlncmF0aW9ucyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0F1dGgiLCJfcmVzdCIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIm93bktleXMiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJQYXJzZSIsIkRlZmluZWRTY2hlbWFzIiwiY29uc3RydWN0b3IiLCJzY2hlbWFPcHRpb25zIiwiY29uZmlnIiwibG9jYWxTY2hlbWFzIiwiQ29uZmlnIiwiYXBwSWQiLCJkZWZpbml0aW9ucyIsIkFycmF5IiwiaXNBcnJheSIsInJldHJpZXMiLCJtYXhSZXRyaWVzIiwic2F2ZVNjaGVtYVRvREIiLCJzY2hlbWEiLCJwYXlsb2FkIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2ZpZWxkcyIsImluZGV4ZXMiLCJfaW5kZXhlcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9jbHAiLCJpbnRlcm5hbENyZWF0ZVNjaGVtYSIsInJlc2V0U2NoZW1hT3BzIiwidXBkYXRlU2NoZW1hVG9EQiIsImludGVybmFsVXBkYXRlU2NoZW1hIiwiZXhlY3V0ZSIsImxvZ2dlciIsImluZm8iLCJiZWZvcmVNaWdyYXRpb24iLCJQcm9taXNlIiwicmVzb2x2ZSIsImV4ZWN1dGVNaWdyYXRpb25zIiwiYWZ0ZXJNaWdyYXRpb24iLCJlcnJvciIsInByb2Nlc3MiLCJlbnYiLCJOT0RFX0VOViIsImV4aXQiLCJ0aW1lb3V0Iiwic2V0VGltZW91dCIsImNyZWF0ZURlbGV0ZVNlc3Npb24iLCJzY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiYWxsQ2xvdWRTY2hlbWFzIiwiZ2V0QWxsQ2xhc3NlcyIsImNsZWFyVGltZW91dCIsImFsbCIsIm1hcCIsImxvY2FsU2NoZW1hIiwic2F2ZU9yVXBkYXRlIiwiY2hlY2tGb3JNaXNzaW5nU2NoZW1hcyIsImVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzIiwid2FpdCIsInN0cmljdCIsImNsb3VkU2NoZW1hcyIsInMiLCJtaXNzaW5nU2NoZW1hcyIsImMiLCJpbmNsdWRlcyIsInN5c3RlbUNsYXNzZXMiLCJTZXQiLCJzaXplIiwiam9pbiIsIndhcm4iLCJ0aW1lIiwibm9uUHJvdmlkZWRDbGFzc2VzIiwiY2xvdWRTY2hlbWEiLCJzb21lIiwicGFyc2VTY2hlbWEiLCJTY2hlbWEiLCJoYW5kbGVDTFAiLCJyZXNwb25zZSIsInJlc3QiLCJjcmVhdGUiLCJBdXRoIiwibWFzdGVyIiwiZGVsIiwib2JqZWN0SWQiLCJmaW5kIiwic2MiLCJ1cGRhdGVTY2hlbWEiLCJzYXZlU2NoZW1hIiwibmV3TG9jYWxTY2hlbWEiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZpZWxkIiwiaGFuZGxlRmllbGRzIiwiaW5kZXhOYW1lIiwiaXNQcm90ZWN0ZWRJbmRleCIsImFkZEluZGV4IiwiZmllbGRzVG9EZWxldGUiLCJmaWVsZHNUb1JlY3JlYXRlIiwiZmllbGRzV2l0aENoYW5nZWRQYXJhbXMiLCJsb2NhbEZpZWxkIiwicGFyYW1zQXJlRXF1YWxzIiwidHlwZSIsInRhcmdldENsYXNzIiwiZnJvbSIsInRvIiwiZGVsZXRlRXh0cmFGaWVsZHMiLCJkZWxldGVGaWVsZCIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJmaWVsZEluZm8iLCJpbmRleGVzVG9BZGQiLCJkZWxldGVJbmRleCIsImluZGV4IiwiZGVidWciLCJjbHAiLCJhZGRGaWVsZCIsInNldENMUCIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJpbmRleE9mIiwib2JqQSIsIm9iakIiLCJrZXlzQSIsImtleXNCIiwiZXZlcnkiLCJrIiwiYWRkUmVsYXRpb24iLCJhZGRQb2ludGVyIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vLyBAZmxvdy1kaXNhYmxlLW5leHQgQ2Fubm90IHJlc29sdmUgbW9kdWxlIGBwYXJzZS9ub2RlYC5cbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCB7IGludGVybmFsQ3JlYXRlU2NoZW1hLCBpbnRlcm5hbFVwZGF0ZVNjaGVtYSB9IGZyb20gJy4uL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBkZWZhdWx0Q29sdW1ucywgc3lzdGVtQ2xhc3NlcyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgKiBhcyBNaWdyYXRpb25zIGZyb20gJy4vTWlncmF0aW9ucyc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuXG5leHBvcnQgY2xhc3MgRGVmaW5lZFNjaGVtYXMge1xuICBjb25maWc6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgc2NoZW1hT3B0aW9uczogTWlncmF0aW9ucy5TY2hlbWFPcHRpb25zO1xuICBsb2NhbFNjaGVtYXM6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYVtdO1xuICByZXRyaWVzOiBudW1iZXI7XG4gIG1heFJldHJpZXM6IG51bWJlcjtcbiAgYWxsQ2xvdWRTY2hlbWFzOiBQYXJzZS5TY2hlbWFbXTtcblxuICBjb25zdHJ1Y3RvcihzY2hlbWFPcHRpb25zOiBNaWdyYXRpb25zLlNjaGVtYU9wdGlvbnMsIGNvbmZpZzogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBbXTtcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnLmFwcElkKTtcbiAgICB0aGlzLnNjaGVtYU9wdGlvbnMgPSBzY2hlbWFPcHRpb25zO1xuICAgIGlmIChzY2hlbWFPcHRpb25zICYmIHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMpIHtcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zKSkge1xuICAgICAgICB0aHJvdyBgXCJzY2hlbWEuZGVmaW5pdGlvbnNcIiBtdXN0IGJlIGFuIGFycmF5IG9mIHNjaGVtYXNgO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxvY2FsU2NoZW1hcyA9IHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnM7XG4gICAgfVxuXG4gICAgdGhpcy5yZXRyaWVzID0gMDtcbiAgICB0aGlzLm1heFJldHJpZXMgPSAzO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbENyZWF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgcmVzZXRTY2hlbWFPcHMoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICAvLyBSZXNldCBvcHMgbGlrZSBTREtcbiAgICBzY2hlbWEuX2ZpZWxkcyA9IHt9O1xuICAgIHNjaGVtYS5faW5kZXhlcyA9IHt9O1xuICB9XG5cbiAgLy8gU2ltdWxhdGUgdXBkYXRlIGxpa2UgdGhlIFNES1xuICAvLyBXZSBjYW5ub3QgdXNlIFNESyBzaW5jZSByb3V0ZXMgYXJlIGRpc2FibGVkXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbFVwZGF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZSgpIHtcbiAgICB0cnkge1xuICAgICAgbG9nZ2VyLmluZm8oJ1J1bm5pbmcgTWlncmF0aW9ucycpO1xuICAgICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucyAmJiB0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVNaWdyYXRpb25zKCk7XG5cbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMgJiYgdGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYWZ0ZXJNaWdyYXRpb24oKSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMgQ29tcGxldGVkJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSB7IHByb2Nlc3MuZXhpdCgxKTsgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGVNaWdyYXRpb25zKCkge1xuICAgIGxldCB0aW1lb3V0ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgLy8gU2V0IHVwIGEgdGltZSBvdXQgaW4gcHJvZHVjdGlvblxuICAgICAgLy8gaWYgd2UgZmFpbCB0byBnZXQgc2NoZW1hXG4gICAgICAvLyBwbTIgb3IgSzhzIGFuZCBtYW55IG90aGVyIHByb2Nlc3MgbWFuYWdlcnMgd2lsbCB0cnkgdG8gcmVzdGFydCB0aGUgcHJvY2Vzc1xuICAgICAgLy8gYWZ0ZXIgdGhlIGV4aXRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1RpbWVvdXQgb2NjdXJyZWQgZHVyaW5nIGV4ZWN1dGlvbiBvZiBtaWdyYXRpb25zLiBFeGl0aW5nLi4uJyk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9LCAyMDAwMCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuY3JlYXRlRGVsZXRlU2Vzc2lvbigpO1xuICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0LWxpbmVcbiAgICAgIGNvbnN0IHNjaGVtYUNvbnRyb2xsZXIgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCk7XG4gICAgICB0aGlzLmFsbENsb3VkU2NoZW1hcyA9IGF3YWl0IHNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpO1xuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5sb2NhbFNjaGVtYXMubWFwKGFzeW5jIGxvY2FsU2NoZW1hID0+IHRoaXMuc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hKSkpO1xuXG4gICAgICB0aGlzLmNoZWNrRm9yTWlzc2luZ1NjaGVtYXMoKTtcbiAgICAgIGF3YWl0IHRoaXMuZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodGltZW91dCkgeyBjbGVhclRpbWVvdXQodGltZW91dCk7IH1cbiAgICAgIGlmICh0aGlzLnJldHJpZXMgPCB0aGlzLm1heFJldHJpZXMpIHtcbiAgICAgICAgdGhpcy5yZXRyaWVzKys7XG4gICAgICAgIC8vIGZpcnN0IHJldHJ5IDFzZWMsIDJzZWMsIDNzZWMgdG90YWwgNnNlYyByZXRyeSBzZXF1ZW5jZVxuICAgICAgICAvLyByZXRyeSB3aWxsIG9ubHkgaGFwcGVuIGluIGNhc2Ugb2YgZGVwbG95aW5nIG11bHRpIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgICAgICAvLyBhdCB0aGUgc2FtZSB0aW1lLiBNb2Rlcm4gc3lzdGVtcyBsaWtlIGs4IGF2b2lkIHRoaXMgYnkgZG9pbmcgcm9sbGluZyB1cGRhdGVzXG4gICAgICAgIGF3YWl0IHRoaXMud2FpdCgxMDAwICogdGhpcy5yZXRyaWVzKTtcbiAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHsgcHJvY2Vzcy5leGl0KDEpOyB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY2hlY2tGb3JNaXNzaW5nU2NoZW1hcygpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCAhPT0gdHJ1ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNsb3VkU2NoZW1hcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBsb2NhbFNjaGVtYXMgPSB0aGlzLmxvY2FsU2NoZW1hcy5tYXAocyA9PiBzLmNsYXNzTmFtZSk7XG4gICAgY29uc3QgbWlzc2luZ1NjaGVtYXMgPSBjbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgYyA9PiAhbG9jYWxTY2hlbWFzLmluY2x1ZGVzKGMpICYmICFzeXN0ZW1DbGFzc2VzLmluY2x1ZGVzKGMpXG4gICAgKTtcblxuICAgIGlmIChuZXcgU2V0KGxvY2FsU2NoZW1hcykuc2l6ZSAhPT0gbG9jYWxTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgVGhlIGxpc3Qgb2Ygc2NoZW1hcyBwcm92aWRlZCBjb250YWlucyBkdXBsaWNhdGVkIFwiY2xhc3NOYW1lXCIgIFwiJHtsb2NhbFNjaGVtYXMuam9pbihcbiAgICAgICAgICAnXCIsXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICYmIG1pc3NpbmdTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBUaGUgZm9sbG93aW5nIHNjaGVtYXMgYXJlIGN1cnJlbnRseSBwcmVzZW50IGluIHRoZSBkYXRhYmFzZSwgYnV0IG5vdCBleHBsaWNpdGx5IGRlZmluZWQgaW4gYSBzY2hlbWE6IFwiJHttaXNzaW5nU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIiwgXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJlcXVpcmVkIGZvciB0ZXN0aW5nIHB1cnBvc2VcbiAgd2FpdCh0aW1lOiBudW1iZXIpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHRpbWUpKTtcbiAgfVxuXG4gIGFzeW5jIGVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vblByb3ZpZGVkQ2xhc3NlcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbHRlcihcbiAgICAgIGNsb3VkU2NoZW1hID0+XG4gICAgICAgICF0aGlzLmxvY2FsU2NoZW1hcy5zb21lKGxvY2FsU2NoZW1hID0+IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xvdWRTY2hlbWEuY2xhc3NOYW1lKVxuICAgICk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBub25Qcm92aWRlZENsYXNzZXMubWFwKGFzeW5jIHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgdGhpcy5oYW5kbGVDTFAoc2NoZW1hLCBwYXJzZVNjaGVtYSk7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihwYXJzZVNjaGVtYSk7XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBmYWtlIHNlc3Npb24gc2luY2UgUGFyc2UgZG8gbm90IGNyZWF0ZSB0aGUgX1Nlc3Npb24gdW50aWxcbiAgLy8gYSBzZXNzaW9uIGlzIGNyZWF0ZWRcbiAgYXN5bmMgY3JlYXRlRGVsZXRlU2Vzc2lvbigpIHtcbiAgICBjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCByZXN0LmNyZWF0ZSh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCB7fSk7XG4gICAgYXdhaXQgcmVzdC5kZWwodGhpcy5jb25maWcsIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSwgJ19TZXNzaW9uJywgcmVzcG9uc2Uub2JqZWN0SWQpO1xuICB9XG5cbiAgYXN5bmMgc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBjbG91ZFNjaGVtYSA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbmQoc2MgPT4gc2MuY2xhc3NOYW1lID09PSBsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuICAgIGlmIChjbG91ZFNjaGVtYSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWEobG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIGR1cmluZyB1cGRhdGUgb2Ygc2NoZW1hIGZvciB0eXBlICR7Y2xvdWRTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYShsb2NhbFNjaGVtYSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRocm93IGBFcnJvciB3aGlsZSBzYXZpbmcgU2NoZW1hIGZvciB0eXBlICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBIYW5kbGUgaW5kZXhlc1xuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzICYmICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmhhbmRsZUNMUChsb2NhbFNjaGVtYSwgbmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsIGNsb3VkU2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcblxuICAgIC8vIEhhbmRsZSBmaWVsZHNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgaWYgKCFjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmllbGRzVG9EZWxldGU6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZmllbGRzVG9SZWNyZWF0ZToge1xuICAgICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgICBmcm9tOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICAgIHRvOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICB9W10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgT2JqZWN0LmtleXMoY2xvdWRTY2hlbWEuZmllbGRzKVxuICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5maWVsZHMgfHwgIWxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgZmllbGRzVG9EZWxldGUucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxvY2FsRmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgZmllbGQgaGFzIGEgY2hhbmdlZCB0eXBlXG4gICAgICAgIGlmIChcbiAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMoXG4gICAgICAgICAgICB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH1cbiAgICAgICAgICApXG4gICAgICAgICkge1xuICAgICAgICAgIGZpZWxkc1RvUmVjcmVhdGUucHVzaCh7XG4gICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICBmcm9tOiB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgdG86IHsgdHlwZTogbG9jYWxGaWVsZC50eXBlLCB0YXJnZXRDbGFzczogbG9jYWxGaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHNvbWV0aGluZyBjaGFuZ2VkIG90aGVyIHRoYW4gdGhlIHR5cGUgKGxpa2UgcmVxdWlyZWQsIGRlZmF1bHRWYWx1ZSlcbiAgICAgICAgaWYgKCF0aGlzLnBhcmFtc0FyZUVxdWFscyhmaWVsZCwgbG9jYWxGaWVsZCkpIHtcbiAgICAgICAgICBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9EZWxldGUuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIERlbGV0ZSBmaWVsZHMgZnJvbSB0aGUgc2NoZW1hIHRoZW4gYXBwbHkgY2hhbmdlc1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgPT09IHRydWUgJiYgZmllbGRzVG9EZWxldGUubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgZmllbGRzIGV4aXN0IGluIHRoZSBkYXRhYmFzZSBmb3IgXCIke1xuICAgICAgICAgIGxvY2FsU2NoZW1hLmNsYXNzTmFtZVxuICAgICAgICB9XCIsIGJ1dCBhcmUgbWlzc2luZyBpbiB0aGUgc2NoZW1hIDogXCIke2ZpZWxkc1RvRGVsZXRlLmpvaW4oJ1wiICxcIicpfVwiYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHRydWUpIHtcbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkLmZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGRJbmZvID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkSW5mby5maWVsZE5hbWVdO1xuICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZEluZm8uZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb1JlY3JlYXRlLmxlbmd0aCkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgY29uc3QgZnJvbSA9XG4gICAgICAgICAgZmllbGQuZnJvbS50eXBlICsgKGZpZWxkLmZyb20udGFyZ2V0Q2xhc3MgPyBgICgke2ZpZWxkLmZyb20udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG4gICAgICAgIGNvbnN0IHRvID0gZmllbGQudG8udHlwZSArIChmaWVsZC50by50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQudG8udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG5cbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgYFRoZSBmaWVsZCBcIiR7ZmllbGQuZmllbGROYW1lfVwiIHR5cGUgZGlmZmVyIGJldHdlZW4gdGhlIHNjaGVtYSBhbmQgdGhlIGRhdGFiYXNlIGZvciBcIiR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiOyBTY2hlbWEgaXMgZGVmaW5lZCBhcyBcIiR7dG99XCIgYW5kIGN1cnJlbnQgZGF0YWJhc2UgdHlwZSBpcyBcIiR7ZnJvbX1cImBcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSGFuZGxlIEluZGV4ZXNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoIWNsb3VkU2NoZW1hLmluZGV4ZXMgfHwgIWNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSkgJiZcbiAgICAgICAgICAhdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgaW5kZXhlc1RvQWRkID0gW107XG5cbiAgICAvLyBDaGVjayBkZWxldGlvblxuICAgIGlmIChjbG91ZFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmICghdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKSkge1xuICAgICAgICAgIGlmICghbG9jYWxTY2hlbWEuaW5kZXhlcyB8fCAhbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMobG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLCBjbG91ZFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgICAgICAgICAgaW5kZXhlc1RvQWRkLnB1c2goe1xuICAgICAgICAgICAgICAgIGluZGV4TmFtZSxcbiAgICAgICAgICAgICAgICBpbmRleDogbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgIC8vIEFwcGx5IGNoYW5nZXNcbiAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIC8vIEFwcGx5IG5ldy9jaGFuZ2VkIGluZGV4ZXNcbiAgICBpZiAoaW5kZXhlc1RvQWRkLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgVXBkYXRpbmcgaW5kZXhlcyBmb3IgXCIke25ld0xvY2FsU2NoZW1hLmNsYXNzTmFtZX1cIiA6ICAke2luZGV4ZXNUb0FkZC5qb2luKCcgLCcpfWBcbiAgICAgICk7XG4gICAgICBpbmRleGVzVG9BZGQuZm9yRWFjaChvID0+IG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KG8uaW5kZXhOYW1lLCBvLmluZGV4KSk7XG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZUNMUChcbiAgICBsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hLFxuICAgIG5ld0xvY2FsU2NoZW1hOiBQYXJzZS5TY2hlbWEsXG4gICAgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYVxuICApIHtcbiAgICBpZiAoIWxvY2FsU2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyAmJiAhY2xvdWRTY2hlbWEpIHtcbiAgICAgIGxvZ2dlci53YXJuKGBjbGFzc0xldmVsUGVybWlzc2lvbnMgbm90IHByb3ZpZGVkIGZvciAke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX0uYCk7XG4gICAgfVxuICAgIC8vIFVzZSBzcHJlYWQgdG8gYXZvaWQgcmVhZCBvbmx5IGlzc3VlIChlbmNvdW50ZXJlZCBieSBNb3Vtb3VscyB1c2luZyBkaXJlY3RBY2Nlc3MpXG4gICAgY29uc3QgY2xwID0gKHsgLi4ubG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH0gfHwge306IFBhcnNlLkNMUC5QZXJtaXNzaW9uc01hcCk7XG4gICAgLy8gVG8gYXZvaWQgaW5jb25zaXN0ZW5jeSB3ZSBuZWVkIHRvIHJlbW92ZSBhbGwgcmlnaHRzIG9uIGFkZEZpZWxkXG4gICAgY2xwLmFkZEZpZWxkID0ge307XG4gICAgbmV3TG9jYWxTY2hlbWEuc2V0Q0xQKGNscCk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgISFkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdIHx8XG4gICAgICAhIShkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSlcbiAgICApO1xuICB9XG5cbiAgaXNQcm90ZWN0ZWRJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXhOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBpbmRleGVzID0gWydfaWRfJ107XG4gICAgc3dpdGNoIChjbGFzc05hbWUpIHtcbiAgICAgIGNhc2UgJ19Vc2VyJzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKFxuICAgICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJyxcbiAgICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsXG4gICAgICAgICAgJ3VzZXJuYW1lXzEnLFxuICAgICAgICAgICdlbWFpbF8xJ1xuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ19Sb2xlJzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKCduYW1lXzEnKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ19JZGVtcG90ZW5jeSc6XG4gICAgICAgIGluZGV4ZXMucHVzaCgncmVxSWRfMScpO1xuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gaW5kZXhlcy5pbmRleE9mKGluZGV4TmFtZSkgIT09IC0xO1xuICB9XG5cbiAgcGFyYW1zQXJlRXF1YWxzPFQ6IHsgW2tleTogc3RyaW5nXTogYW55IH0+KG9iakE6IFQsIG9iakI6IFQpIHtcbiAgICBjb25zdCBrZXlzQTogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpBKTtcbiAgICBjb25zdCBrZXlzQjogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpCKTtcblxuICAgIC8vIENoZWNrIGtleSBuYW1lXG4gICAgaWYgKGtleXNBLmxlbmd0aCAhPT0ga2V5c0IubGVuZ3RoKSB7IHJldHVybiBmYWxzZTsgfVxuICAgIHJldHVybiBrZXlzQS5ldmVyeShrID0+IG9iakFba10gPT09IG9iakJba10pO1xuICB9XG5cbiAgaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hOiBQYXJzZS5TY2hlbWEsIGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZDogTWlncmF0aW9ucy5GaWVsZFR5cGUpIHtcbiAgICBpZiAoZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkUmVsYXRpb24oZmllbGROYW1lLCBmaWVsZC50YXJnZXRDbGFzcyk7XG4gICAgfSBlbHNlIGlmIChmaWVsZC50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZFBvaW50ZXIoZmllbGROYW1lLCBmaWVsZC50YXJnZXRDbGFzcywgZmllbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRGaWVsZChmaWVsZE5hbWUsIGZpZWxkLnR5cGUsIGZpZWxkKTtcbiAgICB9XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBR0EsSUFBQUEsT0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsY0FBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksaUJBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLFFBQUEsR0FBQUwsT0FBQTtBQUNBLElBQUFNLFVB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