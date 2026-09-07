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
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
            // If keepUnknownIndex is falsy, then delete all unknown indexes from the db.
            if (!this.schemaOptions.keepUnknownIndexes) {
              newLocalSchema.deleteIndex(indexName);
            }
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
    const clp = {
      ...(localSchema.classLevelPermissions || {})
    };
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwicmVxdWlyZSIsIl9Db25maWciLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2NoZW1hQ29udHJvbGxlciIsIl9PcHRpb25zIiwiTWlncmF0aW9ucyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0F1dGgiLCJfcmVzdCIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsIlBhcnNlIiwiRGVmaW5lZFNjaGVtYXMiLCJjb25zdHJ1Y3RvciIsInNjaGVtYU9wdGlvbnMiLCJjb25maWciLCJsb2NhbFNjaGVtYXMiLCJDb25maWciLCJhcHBJZCIsImRlZmluaXRpb25zIiwiQXJyYXkiLCJpc0FycmF5IiwicmV0cmllcyIsIm1heFJldHJpZXMiLCJzYXZlU2NoZW1hVG9EQiIsInNjaGVtYSIsInBheWxvYWQiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJfZmllbGRzIiwiaW5kZXhlcyIsIl9pbmRleGVzIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiX2NscCIsImludGVybmFsQ3JlYXRlU2NoZW1hIiwicmVzZXRTY2hlbWFPcHMiLCJ1cGRhdGVTY2hlbWFUb0RCIiwiaW50ZXJuYWxVcGRhdGVTY2hlbWEiLCJleGVjdXRlIiwibG9nZ2VyIiwiaW5mbyIsImJlZm9yZU1pZ3JhdGlvbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiZXhlY3V0ZU1pZ3JhdGlvbnMiLCJhZnRlck1pZ3JhdGlvbiIsImVycm9yIiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZXhpdCIsInRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiY3JlYXRlRGVsZXRlU2Vzc2lvbiIsInNjaGVtYUNvbnRyb2xsZXIiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJhbGxDbG91ZFNjaGVtYXMiLCJnZXRBbGxDbGFzc2VzIiwiY2xlYXJUaW1lb3V0IiwiYWxsIiwibWFwIiwibG9jYWxTY2hlbWEiLCJzYXZlT3JVcGRhdGUiLCJjaGVja0Zvck1pc3NpbmdTY2hlbWFzIiwiZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MiLCJ3YWl0Iiwic3RyaWN0IiwiY2xvdWRTY2hlbWFzIiwicyIsIm1pc3NpbmdTY2hlbWFzIiwiZmlsdGVyIiwiYyIsImluY2x1ZGVzIiwic3lzdGVtQ2xhc3NlcyIsIlNldCIsInNpemUiLCJsZW5ndGgiLCJqb2luIiwid2FybiIsInRpbWUiLCJub25Qcm92aWRlZENsYXNzZXMiLCJjbG91ZFNjaGVtYSIsInNvbWUiLCJwYXJzZVNjaGVtYSIsIlNjaGVtYSIsImhhbmRsZUNMUCIsInJlc3BvbnNlIiwicmVzdCIsImNyZWF0ZSIsIkF1dGgiLCJtYXN0ZXIiLCJkZWwiLCJvYmplY3RJZCIsImZpbmQiLCJzYyIsInVwZGF0ZVNjaGVtYSIsInNhdmVTY2hlbWEiLCJuZXdMb2NhbFNjaGVtYSIsImtleXMiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZvckVhY2giLCJmaWVsZCIsImhhbmRsZUZpZWxkcyIsImluZGV4TmFtZSIsImlzUHJvdGVjdGVkSW5kZXgiLCJhZGRJbmRleCIsImZpZWxkc1RvRGVsZXRlIiwiZmllbGRzVG9SZWNyZWF0ZSIsImZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zIiwicHVzaCIsImxvY2FsRmllbGQiLCJwYXJhbXNBcmVFcXVhbHMiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmcm9tIiwidG8iLCJkZWxldGVFeHRyYUZpZWxkcyIsImRlbGV0ZUZpZWxkIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImZpZWxkSW5mbyIsImluZGV4ZXNUb0FkZCIsImtlZXBVbmtub3duSW5kZXhlcyIsImRlbGV0ZUluZGV4IiwiaW5kZXgiLCJkZWJ1ZyIsImNscCIsImFkZEZpZWxkIiwic2V0Q0xQIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsImluZGV4T2YiLCJvYmpBIiwib2JqQiIsImtleXNBIiwia2V5c0IiLCJldmVyeSIsImsiLCJhZGRSZWxhdGlvbiIsImFkZFBvaW50ZXIiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIEBmbG93LWRpc2FibGUtbmV4dCBDYW5ub3QgcmVzb2x2ZSBtb2R1bGUgYHBhcnNlL25vZGVgLlxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IHsgaW50ZXJuYWxDcmVhdGVTY2hlbWEsIGludGVybmFsVXBkYXRlU2NoZW1hIH0gZnJvbSAnLi4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IGRlZmF1bHRDb2x1bW5zLCBzeXN0ZW1DbGFzc2VzIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCAqIGFzIE1pZ3JhdGlvbnMgZnJvbSAnLi9NaWdyYXRpb25zJztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5cbmV4cG9ydCBjbGFzcyBEZWZpbmVkU2NoZW1hcyB7XG4gIGNvbmZpZzogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBzY2hlbWFPcHRpb25zOiBNaWdyYXRpb25zLlNjaGVtYU9wdGlvbnM7XG4gIGxvY2FsU2NoZW1hczogTWlncmF0aW9ucy5KU09OU2NoZW1hW107XG4gIHJldHJpZXM6IG51bWJlcjtcbiAgbWF4UmV0cmllczogbnVtYmVyO1xuICBhbGxDbG91ZFNjaGVtYXM6IFBhcnNlLlNjaGVtYVtdO1xuXG4gIGNvbnN0cnVjdG9yKHNjaGVtYU9wdGlvbnM6IE1pZ3JhdGlvbnMuU2NoZW1hT3B0aW9ucywgY29uZmlnOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmxvY2FsU2NoZW1hcyA9IFtdO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLmdldChjb25maWcuYXBwSWQpO1xuICAgIHRoaXMuc2NoZW1hT3B0aW9ucyA9IHNjaGVtYU9wdGlvbnM7XG4gICAgaWYgKHNjaGVtYU9wdGlvbnMgJiYgc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucykge1xuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMpKSB7XG4gICAgICAgIHRocm93IGBcInNjaGVtYS5kZWZpbml0aW9uc1wiIG11c3QgYmUgYW4gYXJyYXkgb2Ygc2NoZW1hc2A7XG4gICAgICB9XG5cbiAgICAgIHRoaXMubG9jYWxTY2hlbWFzID0gc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucztcbiAgICB9XG5cbiAgICB0aGlzLnJldHJpZXMgPSAwO1xuICAgIHRoaXMubWF4UmV0cmllcyA9IDM7XG4gIH1cblxuICBhc3luYyBzYXZlU2NoZW1hVG9EQihzY2hlbWE6IFBhcnNlLlNjaGVtYSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgICBmaWVsZHM6IHNjaGVtYS5fZmllbGRzLFxuICAgICAgaW5kZXhlczogc2NoZW1hLl9pbmRleGVzLFxuICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuX2NscCxcbiAgICB9O1xuICAgIGF3YWl0IGludGVybmFsQ3JlYXRlU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUsIHBheWxvYWQsIHRoaXMuY29uZmlnKTtcbiAgICB0aGlzLnJlc2V0U2NoZW1hT3BzKHNjaGVtYSk7XG4gIH1cblxuICByZXNldFNjaGVtYU9wcyhzY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIC8vIFJlc2V0IG9wcyBsaWtlIFNES1xuICAgIHNjaGVtYS5fZmllbGRzID0ge307XG4gICAgc2NoZW1hLl9pbmRleGVzID0ge307XG4gIH1cblxuICAvLyBTaW11bGF0ZSB1cGRhdGUgbGlrZSB0aGUgU0RLXG4gIC8vIFdlIGNhbm5vdCB1c2UgU0RLIHNpbmNlIHJvdXRlcyBhcmUgZGlzYWJsZWRcbiAgYXN5bmMgdXBkYXRlU2NoZW1hVG9EQihzY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgICBmaWVsZHM6IHNjaGVtYS5fZmllbGRzLFxuICAgICAgaW5kZXhlczogc2NoZW1hLl9pbmRleGVzLFxuICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuX2NscCxcbiAgICB9O1xuICAgIGF3YWl0IGludGVybmFsVXBkYXRlU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUsIHBheWxvYWQsIHRoaXMuY29uZmlnKTtcbiAgICB0aGlzLnJlc2V0U2NoZW1hT3BzKHNjaGVtYSk7XG4gIH1cblxuICBhc3luYyBleGVjdXRlKCkge1xuICAgIHRyeSB7XG4gICAgICBsb2dnZXIuaW5mbygnUnVubmluZyBNaWdyYXRpb25zJyk7XG4gICAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zICYmIHRoaXMuc2NoZW1hT3B0aW9ucy5iZWZvcmVNaWdyYXRpb24pIHtcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2NoZW1hT3B0aW9ucy5iZWZvcmVNaWdyYXRpb24oKSk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZU1pZ3JhdGlvbnMoKTtcblxuICAgICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucyAmJiB0aGlzLnNjaGVtYU9wdGlvbnMuYWZ0ZXJNaWdyYXRpb24pIHtcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2NoZW1hT3B0aW9ucy5hZnRlck1pZ3JhdGlvbigpKTtcbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLmluZm8oJ1J1bm5pbmcgTWlncmF0aW9ucyBDb21wbGV0ZWQnKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBydW4gbWlncmF0aW9uczogJHtlfWApO1xuICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHsgcHJvY2Vzcy5leGl0KDEpOyB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZU1pZ3JhdGlvbnMoKSB7XG4gICAgbGV0IHRpbWVvdXQgPSBudWxsO1xuICAgIHRyeSB7XG4gICAgICAvLyBTZXQgdXAgYSB0aW1lIG91dCBpbiBwcm9kdWN0aW9uXG4gICAgICAvLyBpZiB3ZSBmYWlsIHRvIGdldCBzY2hlbWFcbiAgICAgIC8vIHBtMiBvciBLOHMgYW5kIG1hbnkgb3RoZXIgcHJvY2VzcyBtYW5hZ2VycyB3aWxsIHRyeSB0byByZXN0YXJ0IHRoZSBwcm9jZXNzXG4gICAgICAvLyBhZnRlciB0aGUgZXhpdFxuICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignVGltZW91dCBvY2N1cnJlZCBkdXJpbmcgZXhlY3V0aW9uIG9mIG1pZ3JhdGlvbnMuIEV4aXRpbmcuLi4nKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH0sIDIwMDAwKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5jcmVhdGVEZWxldGVTZXNzaW9uKCk7XG4gICAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHQtbGluZVxuICAgICAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgICAgIHRoaXMuYWxsQ2xvdWRTY2hlbWFzID0gYXdhaXQgc2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCk7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbCh0aGlzLmxvY2FsU2NoZW1hcy5tYXAoYXN5bmMgbG9jYWxTY2hlbWEgPT4gdGhpcy5zYXZlT3JVcGRhdGUobG9jYWxTY2hlbWEpKSk7XG5cbiAgICAgIHRoaXMuY2hlY2tGb3JNaXNzaW5nU2NoZW1hcygpO1xuICAgICAgYXdhaXQgdGhpcy5lbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcygpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0aW1lb3V0KSB7IGNsZWFyVGltZW91dCh0aW1lb3V0KTsgfVxuICAgICAgaWYgKHRoaXMucmV0cmllcyA8IHRoaXMubWF4UmV0cmllcykge1xuICAgICAgICB0aGlzLnJldHJpZXMrKztcbiAgICAgICAgLy8gZmlyc3QgcmV0cnkgMXNlYywgMnNlYywgM3NlYyB0b3RhbCA2c2VjIHJldHJ5IHNlcXVlbmNlXG4gICAgICAgIC8vIHJldHJ5IHdpbGwgb25seSBoYXBwZW4gaW4gY2FzZSBvZiBkZXBsb3lpbmcgbXVsdGkgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAgICAgIC8vIGF0IHRoZSBzYW1lIHRpbWUuIE1vZGVybiBzeXN0ZW1zIGxpa2UgazggYXZvaWQgdGhpcyBieSBkb2luZyByb2xsaW5nIHVwZGF0ZXNcbiAgICAgICAgYXdhaXQgdGhpcy53YWl0KDEwMDAgKiB0aGlzLnJldHJpZXMpO1xuICAgICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVNaWdyYXRpb25zKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBydW4gbWlncmF0aW9uczogJHtlfWApO1xuICAgICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykgeyBwcm9jZXNzLmV4aXQoMSk7IH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjaGVja0Zvck1pc3NpbmdTY2hlbWFzKCkge1xuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICE9PSB0cnVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2xvdWRTY2hlbWFzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMubWFwKHMgPT4gcy5jbGFzc05hbWUpO1xuICAgIGNvbnN0IGxvY2FsU2NoZW1hcyA9IHRoaXMubG9jYWxTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBtaXNzaW5nU2NoZW1hcyA9IGNsb3VkU2NoZW1hcy5maWx0ZXIoXG4gICAgICBjID0+ICFsb2NhbFNjaGVtYXMuaW5jbHVkZXMoYykgJiYgIXN5c3RlbUNsYXNzZXMuaW5jbHVkZXMoYylcbiAgICApO1xuXG4gICAgaWYgKG5ldyBTZXQobG9jYWxTY2hlbWFzKS5zaXplICE9PSBsb2NhbFNjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBUaGUgbGlzdCBvZiBzY2hlbWFzIHByb3ZpZGVkIGNvbnRhaW5zIGR1cGxpY2F0ZWQgXCJjbGFzc05hbWVcIiAgXCIke2xvY2FsU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIixcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgJiYgbWlzc2luZ1NjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgc2NoZW1hcyBhcmUgY3VycmVudGx5IHByZXNlbnQgaW4gdGhlIGRhdGFiYXNlLCBidXQgbm90IGV4cGxpY2l0bHkgZGVmaW5lZCBpbiBhIHNjaGVtYTogXCIke21pc3NpbmdTY2hlbWFzLmpvaW4oXG4gICAgICAgICAgJ1wiLCBcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmVxdWlyZWQgZm9yIHRlc3RpbmcgcHVycG9zZVxuICB3YWl0KHRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgdGltZSkpO1xuICB9XG5cbiAgYXN5bmMgZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm9uUHJvdmlkZWRDbGFzc2VzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgY2xvdWRTY2hlbWEgPT5cbiAgICAgICAgIXRoaXMubG9jYWxTY2hlbWFzLnNvbWUobG9jYWxTY2hlbWEgPT4gbG9jYWxTY2hlbWEuY2xhc3NOYW1lID09PSBjbG91ZFNjaGVtYS5jbGFzc05hbWUpXG4gICAgKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIG5vblByb3ZpZGVkQ2xhc3Nlcy5tYXAoYXN5bmMgc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB0aGlzLmhhbmRsZUNMUChzY2hlbWEsIHBhcnNlU2NoZW1hKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKHBhcnNlU2NoZW1hKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIGZha2Ugc2Vzc2lvbiBzaW5jZSBQYXJzZSBkbyBub3QgY3JlYXRlIHRoZSBfU2Vzc2lvbiB1bnRpbFxuICAvLyBhIHNlc3Npb24gaXMgY3JlYXRlZFxuICBhc3luYyBjcmVhdGVEZWxldGVTZXNzaW9uKCkge1xuICAgIGNvbnN0IHsgcmVzcG9uc2UgfSA9IGF3YWl0IHJlc3QuY3JlYXRlKHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHt9KTtcbiAgICBhd2FpdCByZXN0LmRlbCh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCByZXNwb25zZS5vYmplY3RJZCk7XG4gIH1cblxuICBhc3luYyBzYXZlT3JVcGRhdGUobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSkge1xuICAgIGNvbnN0IGNsb3VkU2NoZW1hID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmluZChzYyA9PiBzYy5jbGFzc05hbWUgPT09IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGNsb3VkU2NoZW1hKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYShsb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aHJvdyBgRXJyb3IgZHVyaW5nIHVwZGF0ZSBvZiBzY2hlbWEgZm9yIHR5cGUgJHtjbG91ZFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlU2NoZW1hKGxvY2FsU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIHdoaWxlIHNhdmluZyBTY2hlbWEgZm9yIHR5cGUgJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcbiAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAvLyBIYW5kbGUgZmllbGRzXG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIEhhbmRsZSBpbmRleGVzXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMgJiYgIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSkpIHtcbiAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zYXZlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWEobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSwgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIGNvbnN0IG5ld0xvY2FsU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuXG4gICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICBpZiAoIWNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWVsZHNUb0RlbGV0ZTogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNUb1JlY3JlYXRlOiB7XG4gICAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICAgIGZyb206IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgICAgdG86IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgIH1bXSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gQ2hlY2sgZGVsZXRpb25cbiAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5maWVsZHMpXG4gICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBpZiAoIWxvY2FsU2NoZW1hLmZpZWxkcyB8fCAhbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICBmaWVsZHNUb0RlbGV0ZS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbG9jYWxGaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAvLyBDaGVjayBpZiBmaWVsZCBoYXMgYSBjaGFuZ2VkIHR5cGVcbiAgICAgICAgaWYgKFxuICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhcbiAgICAgICAgICAgIHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB7IHR5cGU6IGxvY2FsRmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGxvY2FsRmllbGQudGFyZ2V0Q2xhc3MgfVxuICAgICAgICAgIClcbiAgICAgICAgKSB7XG4gICAgICAgICAgZmllbGRzVG9SZWNyZWF0ZS5wdXNoKHtcbiAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgIGZyb206IHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB0bzogeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgc29tZXRoaW5nIGNoYW5nZWQgb3RoZXIgdGhhbiB0aGUgdHlwZSAobGlrZSByZXF1aXJlZCwgZGVmYXVsdFZhbHVlKVxuICAgICAgICBpZiAoIXRoaXMucGFyYW1zQXJlRXF1YWxzKGZpZWxkLCBsb2NhbEZpZWxkKSkge1xuICAgICAgICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzID09PSB0cnVlKSB7XG4gICAgICBmaWVsZHNUb0RlbGV0ZS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb0RlbGV0ZS5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICBgVGhlIGZvbGxvd2luZyBmaWVsZHMgZXhpc3QgaW4gdGhlIGRhdGFiYXNlIGZvciBcIiR7XG4gICAgICAgICAgbG9jYWxTY2hlbWEuY2xhc3NOYW1lXG4gICAgICAgIH1cIiwgYnV0IGFyZSBtaXNzaW5nIGluIHRoZSBzY2hlbWEgOiBcIiR7ZmllbGRzVG9EZWxldGUuam9pbignXCIgLFwiJyl9XCJgXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlRmllbGQoZmllbGQuZmllbGROYW1lKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBEZWxldGUgZmllbGRzIGZyb20gdGhlIHNjaGVtYSB0aGVuIGFwcGx5IGNoYW5nZXNcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZEluZm8gPT4ge1xuICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGRJbmZvLmZpZWxkTmFtZV07XG4gICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkSW5mby5maWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ID09PSB0cnVlICYmIGZpZWxkc1RvUmVjcmVhdGUubGVuZ3RoKSB7XG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICBjb25zdCBmcm9tID1cbiAgICAgICAgICBmaWVsZC5mcm9tLnR5cGUgKyAoZmllbGQuZnJvbS50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQuZnJvbS50YXJnZXRDbGFzc30pYCA6ICcnKTtcbiAgICAgICAgY29uc3QgdG8gPSBmaWVsZC50by50eXBlICsgKGZpZWxkLnRvLnRhcmdldENsYXNzID8gYCAoJHtmaWVsZC50by50YXJnZXRDbGFzc30pYCA6ICcnKTtcblxuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBgVGhlIGZpZWxkIFwiJHtmaWVsZC5maWVsZE5hbWV9XCIgdHlwZSBkaWZmZXIgYmV0d2VlbiB0aGUgc2NoZW1hIGFuZCB0aGUgZGF0YWJhc2UgZm9yIFwiJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9XCI7IFNjaGVtYSBpcyBkZWZpbmVkIGFzIFwiJHt0b31cIiBhbmQgY3VycmVudCBkYXRhYmFzZSB0eXBlIGlzIFwiJHtmcm9tfVwiYFxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgSW5kZXhlc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICghY2xvdWRTY2hlbWEuaW5kZXhlcyB8fCAhY2xvdWRTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSAmJlxuICAgICAgICAgICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleGVzVG9BZGQgPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgaWYgKGNsb3VkU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNsb3VkU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5pbmRleGVzIHx8ICFsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pIHtcbiAgICAgICAgICAgIC8vIElmIGtlZXBVbmtub3duSW5kZXggaXMgZmFsc3ksIHRoZW4gZGVsZXRlIGFsbCB1bmtub3duIGluZGV4ZXMgZnJvbSB0aGUgZGIuXG4gICAgICAgICAgICBpZighdGhpcy5zY2hlbWFPcHRpb25zLmtlZXBVbmtub3duSW5kZXhlcyl7XG4gICAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sIGNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgICBpbmRleGVzVG9BZGQucHVzaCh7XG4gICAgICAgICAgICAgICAgaW5kZXhOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4OiBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hLCBjbG91ZFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgY2hhbmdlc1xuICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgbmV3L2NoYW5nZWQgaW5kZXhlc1xuICAgIGlmIChpbmRleGVzVG9BZGQubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBVcGRhdGluZyBpbmRleGVzIGZvciBcIiR7bmV3TG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiIDogICR7aW5kZXhlc1RvQWRkLmpvaW4oJyAsJyl9YFxuICAgICAgKTtcbiAgICAgIGluZGV4ZXNUb0FkZC5mb3JFYWNoKG8gPT4gbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoby5pbmRleE5hbWUsIG8uaW5kZXgpKTtcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlQ0xQKFxuICAgIGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsXG4gICAgbmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSxcbiAgICBjbG91ZFNjaGVtYTogUGFyc2UuU2NoZW1hXG4gICkge1xuICAgIGlmICghbG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zICYmICFjbG91ZFNjaGVtYSkge1xuICAgICAgbG9nZ2VyLndhcm4oYGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyBub3QgcHJvdmlkZWQgZm9yICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfS5gKTtcbiAgICB9XG4gICAgLy8gVXNlIHNwcmVhZCB0byBhdm9pZCByZWFkIG9ubHkgaXNzdWUgKGVuY291bnRlcmVkIGJ5IE1vdW1vdWxzIHVzaW5nIGRpcmVjdEFjY2VzcylcbiAgICBjb25zdCBjbHAgPSAoeyAuLi5sb2NhbFNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfHwge30gfTogUGFyc2UuQ0xQLlBlcm1pc3Npb25zTWFwKTtcbiAgICAvLyBUbyBhdm9pZCBpbmNvbnNpc3RlbmN5IHdlIG5lZWQgdG8gcmVtb3ZlIGFsbCByaWdodHMgb24gYWRkRmllbGRcbiAgICBjbHAuYWRkRmllbGQgPSB7fTtcbiAgICBuZXdMb2NhbFNjaGVtYS5zZXRDTFAoY2xwKTtcbiAgfVxuXG4gIGlzUHJvdGVjdGVkRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiAoXG4gICAgICAhIWRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0gfHxcbiAgICAgICEhKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKVxuICAgICk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleE5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGluZGV4ZXMgPSBbJ19pZF8nXTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgY2FzZSAnX1VzZXInOlxuICAgICAgICBpbmRleGVzLnB1c2goXG4gICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLFxuICAgICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJyxcbiAgICAgICAgICAndXNlcm5hbWVfMScsXG4gICAgICAgICAgJ2VtYWlsXzEnXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnX1JvbGUnOlxuICAgICAgICBpbmRleGVzLnB1c2goJ25hbWVfMScpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnX0lkZW1wb3RlbmN5JzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKCdyZXFJZF8xJyk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiBpbmRleGVzLmluZGV4T2YoaW5kZXhOYW1lKSAhPT0gLTE7XG4gIH1cblxuICBwYXJhbXNBcmVFcXVhbHM8VDogeyBba2V5OiBzdHJpbmddOiBhbnkgfT4ob2JqQTogVCwgb2JqQjogVCkge1xuICAgIGNvbnN0IGtleXNBOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakEpO1xuICAgIGNvbnN0IGtleXNCOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakIpO1xuXG4gICAgLy8gQ2hlY2sga2V5IG5hbWVcbiAgICBpZiAoa2V5c0EubGVuZ3RoICE9PSBrZXlzQi5sZW5ndGgpIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgcmV0dXJuIGtleXNBLmV2ZXJ5KGsgPT4gb2JqQVtrXSA9PT0gb2JqQltrXSk7XG4gIH1cblxuICBoYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSwgZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkOiBNaWdyYXRpb25zLkZpZWxkVHlwZSkge1xuICAgIGlmIChmaWVsZC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRSZWxhdGlvbihmaWVsZE5hbWUsIGZpZWxkLnRhcmdldENsYXNzKTtcbiAgICB9IGVsc2UgaWYgKGZpZWxkLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkUG9pbnRlcihmaWVsZE5hbWUsIGZpZWxkLnRhcmdldENsYXNzLCBmaWVsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEZpZWxkKGZpZWxkTmFtZSwgZmllbGQudHlwZSwgZmllbGQpO1xuICAgIH1cbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFHQSxJQUFBQSxPQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxjQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxpQkFBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssUUFBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sVUFBQSxHQUFBQyx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVEsS0FBQSxHQUFBTixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQVMsS0FBQSxHQUFBUCxzQkFBQSxDQUFBRixPQUFBO0FBQTJCLFNBQUFPLHdCQUFBRyxDQUFBLEVBQUFDLENBQUEsNkJBQUFDLE9BQUEsTUFBQUMsQ0FBQSxPQUFBRCxPQUFBLElBQUFFLENBQUEsT0FBQUYsT0FBQSxZQUFBTCx1QkFBQSxZQUFBQSxDQUFBRyxDQUFBLEVBQUFDLENBQUEsU0FBQUEsQ0FBQSxJQUFBRCxDQUFBLElBQUFBLENBQUEsQ0FBQUssVUFBQSxTQUFBTCxDQUFBLE1BQUFNLENBQUEsRUFBQUMsQ0FBQSxFQUFBQyxDQUFBLEtBQUFDLFNBQUEsUUFBQUMsT0FBQSxFQUFBVixDQUFBLGlCQUFBQSxDQUFBLHVCQUFBQSxDQUFBLHlCQUFBQSxDQUFBLFNBQUFRLENBQUEsTUFBQUYsQ0FBQSxHQUFBTCxDQUFBLEdBQUFHLENBQUEsR0FBQUQsQ0FBQSxRQUFBRyxDQUFBLENBQUFLLEdBQUEsQ0FBQVgsQ0FBQSxVQUFBTSxDQUFBLENBQUFNLEdBQUEsQ0FBQVosQ0FBQSxHQUFBTSxDQUFBLENBQUFPLEdBQUEsQ0FBQWIsQ0FBQSxFQUFBUSxDQUFBLGdCQUFBUCxDQUFBLElBQUFELENBQUEsZ0JBQUFDLENBQUEsT0FBQWEsY0FBQSxDQUFBQyxJQUFBLENBQUFmLENBQUEsRUFBQUMsQ0FBQSxPQUFBTSxDQUFBLElBQUFELENBQUEsR0FBQVUsTUFBQSxDQUFBQyxjQUFBLEtBQUFELE1BQUEsQ0FBQUUsd0JBQUEsQ0FBQWxCLENBQUEsRUFBQUMsQ0FBQSxPQUFBTSxDQUFBLENBQUFLLEdBQUEsSUFBQUwsQ0FBQSxDQUFBTSxHQUFBLElBQUFQLENBQUEsQ0FBQUUsQ0FBQSxFQUFBUCxDQUFBLEVBQUFNLENBQUEsSUFBQUMsQ0FBQSxDQUFBUCxDQUFBLElBQUFELENBQUEsQ0FBQUMsQ0FBQSxXQUFBTyxDQUFBLEtBQUFSLENBQUEsRUFBQUMsQ0FBQTtBQUFBLFNBQUFULHVCQUFBUSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBSyxVQUFBLEdBQUFMLENBQUEsS0FBQVUsT0FBQSxFQUFBVixDQUFBO0FBVDNCO0FBQ0EsTUFBTW1CLEtBQUssR0FBRzdCLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFVNUIsTUFBTThCLGNBQWMsQ0FBQztFQVExQkMsV0FBV0EsQ0FBQ0MsYUFBdUMsRUFBRUMsTUFBMEIsRUFBRTtJQUMvRSxJQUFJLENBQUNDLFlBQVksR0FBRyxFQUFFO0lBQ3RCLElBQUksQ0FBQ0QsTUFBTSxHQUFHRSxlQUFNLENBQUNiLEdBQUcsQ0FBQ1csTUFBTSxDQUFDRyxLQUFLLENBQUM7SUFDdEMsSUFBSSxDQUFDSixhQUFhLEdBQUdBLGFBQWE7SUFDbEMsSUFBSUEsYUFBYSxJQUFJQSxhQUFhLENBQUNLLFdBQVcsRUFBRTtNQUM5QyxJQUFJLENBQUNDLEtBQUssQ0FBQ0MsT0FBTyxDQUFDUCxhQUFhLENBQUNLLFdBQVcsQ0FBQyxFQUFFO1FBQzdDLE1BQU0sa0RBQWtEO01BQzFEO01BRUEsSUFBSSxDQUFDSCxZQUFZLEdBQUdGLGFBQWEsQ0FBQ0ssV0FBVztJQUMvQztJQUVBLElBQUksQ0FBQ0csT0FBTyxHQUFHLENBQUM7SUFDaEIsSUFBSSxDQUFDQyxVQUFVLEdBQUcsQ0FBQztFQUNyQjtFQUVBLE1BQU1DLGNBQWNBLENBQUNDLE1BQW9CLEVBQWlCO0lBQ3hELE1BQU1DLE9BQU8sR0FBRztNQUNkQyxTQUFTLEVBQUVGLE1BQU0sQ0FBQ0UsU0FBUztNQUMzQkMsTUFBTSxFQUFFSCxNQUFNLENBQUNJLE9BQU87TUFDdEJDLE9BQU8sRUFBRUwsTUFBTSxDQUFDTSxRQUFRO01BQ3hCQyxxQkFBcUIsRUFBRVAsTUFBTSxDQUFDUTtJQUNoQyxDQUFDO0lBQ0QsTUFBTSxJQUFBQyxtQ0FBb0IsRUFBQ1QsTUFBTSxDQUFDRSxTQUFTLEVBQUVELE9BQU8sRUFBRSxJQUFJLENBQUNYLE1BQU0sQ0FBQztJQUNsRSxJQUFJLENBQUNvQixjQUFjLENBQUNWLE1BQU0sQ0FBQztFQUM3QjtFQUVBVSxjQUFjQSxDQUFDVixNQUFvQixFQUFFO0lBQ25DO0lBQ0FBLE1BQU0sQ0FBQ0ksT0FBTyxHQUFHLENBQUMsQ0FBQztJQUNuQkosTUFBTSxDQUFDTSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0VBQ3RCOztFQUVBO0VBQ0E7RUFDQSxNQUFNSyxnQkFBZ0JBLENBQUNYLE1BQW9CLEVBQUU7SUFDM0MsTUFBTUMsT0FBTyxHQUFHO01BQ2RDLFNBQVMsRUFBRUYsTUFBTSxDQUFDRSxTQUFTO01BQzNCQyxNQUFNLEVBQUVILE1BQU0sQ0FBQ0ksT0FBTztNQUN0QkMsT0FBTyxFQUFFTCxNQUFNLENBQUNNLFFBQVE7TUFDeEJDLHFCQUFxQixFQUFFUCxNQUFNLENBQUNRO0lBQ2hDLENBQUM7SUFDRCxNQUFNLElBQUFJLG1DQUFvQixFQUFDWixNQUFNLENBQUNFLFNBQVMsRUFBRUQsT0FBTyxFQUFFLElBQUksQ0FBQ1gsTUFBTSxDQUFDO0lBQ2xFLElBQUksQ0FBQ29CLGNBQWMsQ0FBQ1YsTUFBTSxDQUFDO0VBQzdCO0VBRUEsTUFBTWEsT0FBT0EsQ0FBQSxFQUFHO0lBQ2QsSUFBSTtNQUNGQyxjQUFNLENBQUNDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQztNQUNqQyxJQUFJLElBQUksQ0FBQzFCLGFBQWEsSUFBSSxJQUFJLENBQUNBLGFBQWEsQ0FBQzJCLGVBQWUsRUFBRTtRQUM1RCxNQUFNQyxPQUFPLENBQUNDLE9BQU8sQ0FBQyxJQUFJLENBQUM3QixhQUFhLENBQUMyQixlQUFlLENBQUMsQ0FBQyxDQUFDO01BQzdEO01BRUEsTUFBTSxJQUFJLENBQUNHLGlCQUFpQixDQUFDLENBQUM7TUFFOUIsSUFBSSxJQUFJLENBQUM5QixhQUFhLElBQUksSUFBSSxDQUFDQSxhQUFhLENBQUMrQixjQUFjLEVBQUU7UUFDM0QsTUFBTUgsT0FBTyxDQUFDQyxPQUFPLENBQUMsSUFBSSxDQUFDN0IsYUFBYSxDQUFDK0IsY0FBYyxDQUFDLENBQUMsQ0FBQztNQUM1RDtNQUVBTixjQUFNLENBQUNDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQztJQUM3QyxDQUFDLENBQUMsT0FBT2hELENBQUMsRUFBRTtNQUNWK0MsY0FBTSxDQUFDTyxLQUFLLENBQUMsNkJBQTZCdEQsQ0FBQyxFQUFFLENBQUM7TUFDOUMsSUFBSXVELE9BQU8sQ0FBQ0MsR0FBRyxDQUFDQyxRQUFRLEtBQUssWUFBWSxFQUFFO1FBQUVGLE9BQU8sQ0FBQ0csSUFBSSxDQUFDLENBQUMsQ0FBQztNQUFFO0lBQ2hFO0VBQ0Y7RUFFQSxNQUFNTixpQkFBaUJBLENBQUEsRUFBRztJQUN4QixJQUFJTyxPQUFPLEdBQUcsSUFBSTtJQUNsQixJQUFJO01BQ0Y7TUFDQTtNQUNBO01BQ0E7TUFDQSxJQUFJSixPQUFPLENBQUNDLEdBQUcsQ0FBQ0MsUUFBUSxLQUFLLFlBQVksRUFBRTtRQUN6Q0UsT0FBTyxHQUFHQyxVQUFVLENBQUMsTUFBTTtVQUN6QmIsY0FBTSxDQUFDTyxLQUFLLENBQUMsNkRBQTZELENBQUM7VUFDM0VDLE9BQU8sQ0FBQ0csSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNqQixDQUFDLEVBQUUsS0FBSyxDQUFDO01BQ1g7TUFFQSxNQUFNLElBQUksQ0FBQ0csbUJBQW1CLENBQUMsQ0FBQztNQUNoQztNQUNBLE1BQU1DLGdCQUFnQixHQUFHLE1BQU0sSUFBSSxDQUFDdkMsTUFBTSxDQUFDd0MsUUFBUSxDQUFDQyxVQUFVLENBQUMsQ0FBQztNQUNoRSxJQUFJLENBQUNDLGVBQWUsR0FBRyxNQUFNSCxnQkFBZ0IsQ0FBQ0ksYUFBYSxDQUFDLENBQUM7TUFDN0RDLFlBQVksQ0FBQ1IsT0FBTyxDQUFDO01BQ3JCLE1BQU1ULE9BQU8sQ0FBQ2tCLEdBQUcsQ0FBQyxJQUFJLENBQUM1QyxZQUFZLENBQUM2QyxHQUFHLENBQUMsTUFBTUMsV0FBVyxJQUFJLElBQUksQ0FBQ0MsWUFBWSxDQUFDRCxXQUFXLENBQUMsQ0FBQyxDQUFDO01BRTdGLElBQUksQ0FBQ0Usc0JBQXNCLENBQUMsQ0FBQztNQUM3QixNQUFNLElBQUksQ0FBQ0MsNkJBQTZCLENBQUMsQ0FBQztJQUM1QyxDQUFDLENBQUMsT0FBT3pFLENBQUMsRUFBRTtNQUNWLElBQUkyRCxPQUFPLEVBQUU7UUFBRVEsWUFBWSxDQUFDUixPQUFPLENBQUM7TUFBRTtNQUN0QyxJQUFJLElBQUksQ0FBQzdCLE9BQU8sR0FBRyxJQUFJLENBQUNDLFVBQVUsRUFBRTtRQUNsQyxJQUFJLENBQUNELE9BQU8sRUFBRTtRQUNkO1FBQ0E7UUFDQTtRQUNBLE1BQU0sSUFBSSxDQUFDNEMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM1QyxPQUFPLENBQUM7UUFDcEMsTUFBTSxJQUFJLENBQUNzQixpQkFBaUIsQ0FBQyxDQUFDO01BQ2hDLENBQUMsTUFBTTtRQUNMTCxjQUFNLENBQUNPLEtBQUssQ0FBQyw2QkFBNkJ0RCxDQUFDLEVBQUUsQ0FBQztRQUM5QyxJQUFJdUQsT0FBTyxDQUFDQyxHQUFHLENBQUNDLFFBQVEsS0FBSyxZQUFZLEVBQUU7VUFBRUYsT0FBTyxDQUFDRyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQUU7TUFDaEU7SUFDRjtFQUNGO0VBRUFjLHNCQUFzQkEsQ0FBQSxFQUFHO0lBQ3ZCLElBQUksSUFBSSxDQUFDbEQsYUFBYSxDQUFDcUQsTUFBTSxLQUFLLElBQUksRUFBRTtNQUN0QztJQUNGO0lBRUEsTUFBTUMsWUFBWSxHQUFHLElBQUksQ0FBQ1gsZUFBZSxDQUFDSSxHQUFHLENBQUNRLENBQUMsSUFBSUEsQ0FBQyxDQUFDMUMsU0FBUyxDQUFDO0lBQy9ELE1BQU1YLFlBQVksR0FBRyxJQUFJLENBQUNBLFlBQVksQ0FBQzZDLEdBQUcsQ0FBQ1EsQ0FBQyxJQUFJQSxDQUFDLENBQUMxQyxTQUFTLENBQUM7SUFDNUQsTUFBTTJDLGNBQWMsR0FBR0YsWUFBWSxDQUFDRyxNQUFNLENBQ3hDQyxDQUFDLElBQUksQ0FBQ3hELFlBQVksQ0FBQ3lELFFBQVEsQ0FBQ0QsQ0FBQyxDQUFDLElBQUksQ0FBQ0UsK0JBQWEsQ0FBQ0QsUUFBUSxDQUFDRCxDQUFDLENBQzdELENBQUM7SUFFRCxJQUFJLElBQUlHLEdBQUcsQ0FBQzNELFlBQVksQ0FBQyxDQUFDNEQsSUFBSSxLQUFLNUQsWUFBWSxDQUFDNkQsTUFBTSxFQUFFO01BQ3REdEMsY0FBTSxDQUFDTyxLQUFLLENBQ1Ysa0VBQWtFOUIsWUFBWSxDQUFDOEQsSUFBSSxDQUNqRixLQUNGLENBQUMsR0FDSCxDQUFDO01BQ0QvQixPQUFPLENBQUNHLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDakI7SUFFQSxJQUFJLElBQUksQ0FBQ3BDLGFBQWEsQ0FBQ3FELE1BQU0sSUFBSUcsY0FBYyxDQUFDTyxNQUFNLEVBQUU7TUFDdER0QyxjQUFNLENBQUN3QyxJQUFJLENBQ1QseUdBQXlHVCxjQUFjLENBQUNRLElBQUksQ0FDMUgsTUFDRixDQUFDLEdBQ0gsQ0FBQztJQUNIO0VBQ0Y7O0VBRUE7RUFDQVosSUFBSUEsQ0FBQ2MsSUFBWSxFQUFFO0lBQ2pCLE9BQU8sSUFBSXRDLE9BQU8sQ0FBT0MsT0FBTyxJQUFJUyxVQUFVLENBQUNULE9BQU8sRUFBRXFDLElBQUksQ0FBQyxDQUFDO0VBQ2hFO0VBRUEsTUFBTWYsNkJBQTZCQSxDQUFBLEVBQWtCO0lBQ25ELE1BQU1nQixrQkFBa0IsR0FBRyxJQUFJLENBQUN4QixlQUFlLENBQUNjLE1BQU0sQ0FDcERXLFdBQVcsSUFDVCxDQUFDLElBQUksQ0FBQ2xFLFlBQVksQ0FBQ21FLElBQUksQ0FBQ3JCLFdBQVcsSUFBSUEsV0FBVyxDQUFDbkMsU0FBUyxLQUFLdUQsV0FBVyxDQUFDdkQsU0FBUyxDQUMxRixDQUFDO0lBQ0QsTUFBTWUsT0FBTyxDQUFDa0IsR0FBRyxDQUNmcUIsa0JBQWtCLENBQUNwQixHQUFHLENBQUMsTUFBTXBDLE1BQU0sSUFBSTtNQUNyQyxNQUFNMkQsV0FBVyxHQUFHLElBQUl6RSxLQUFLLENBQUMwRSxNQUFNLENBQUM1RCxNQUFNLENBQUNFLFNBQVMsQ0FBQztNQUN0RCxJQUFJLENBQUMyRCxTQUFTLENBQUM3RCxNQUFNLEVBQUUyRCxXQUFXLENBQUM7TUFDbkMsTUFBTSxJQUFJLENBQUNoRCxnQkFBZ0IsQ0FBQ2dELFdBQVcsQ0FBQztJQUMxQyxDQUFDLENBQ0gsQ0FBQztFQUNIOztFQUVBO0VBQ0E7RUFDQSxNQUFNL0IsbUJBQW1CQSxDQUFBLEVBQUc7SUFDMUIsTUFBTTtNQUFFa0M7SUFBUyxDQUFDLEdBQUcsTUFBTUMsYUFBSSxDQUFDQyxNQUFNLENBQUMsSUFBSSxDQUFDMUUsTUFBTSxFQUFFMkUsYUFBSSxDQUFDQyxNQUFNLENBQUMsSUFBSSxDQUFDNUUsTUFBTSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdGLE1BQU15RSxhQUFJLENBQUNJLEdBQUcsQ0FBQyxJQUFJLENBQUM3RSxNQUFNLEVBQUUyRSxhQUFJLENBQUNDLE1BQU0sQ0FBQyxJQUFJLENBQUM1RSxNQUFNLENBQUMsRUFBRSxVQUFVLEVBQUV3RSxRQUFRLENBQUNNLFFBQVEsQ0FBQztFQUN0RjtFQUVBLE1BQU05QixZQUFZQSxDQUFDRCxXQUFrQyxFQUFFO0lBQ3JELE1BQU1vQixXQUFXLEdBQUcsSUFBSSxDQUFDekIsZUFBZSxDQUFDcUMsSUFBSSxDQUFDQyxFQUFFLElBQUlBLEVBQUUsQ0FBQ3BFLFNBQVMsS0FBS21DLFdBQVcsQ0FBQ25DLFNBQVMsQ0FBQztJQUMzRixJQUFJdUQsV0FBVyxFQUFFO01BQ2YsSUFBSTtRQUNGLE1BQU0sSUFBSSxDQUFDYyxZQUFZLENBQUNsQyxXQUFXLEVBQUVvQixXQUFXLENBQUM7TUFDbkQsQ0FBQyxDQUFDLE9BQU8xRixDQUFDLEVBQUU7UUFDVixNQUFNLDBDQUEwQzBGLFdBQVcsQ0FBQ3ZELFNBQVMsS0FBS25DLENBQUMsRUFBRTtNQUMvRTtJQUNGLENBQUMsTUFBTTtNQUNMLElBQUk7UUFDRixNQUFNLElBQUksQ0FBQ3lHLFVBQVUsQ0FBQ25DLFdBQVcsQ0FBQztNQUNwQyxDQUFDLENBQUMsT0FBT3RFLENBQUMsRUFBRTtRQUNWLE1BQU0sc0NBQXNDc0UsV0FBVyxDQUFDbkMsU0FBUyxLQUFLbkMsQ0FBQyxFQUFFO01BQzNFO0lBQ0Y7RUFDRjtFQUVBLE1BQU15RyxVQUFVQSxDQUFDbkMsV0FBa0MsRUFBRTtJQUNuRCxNQUFNb0MsY0FBYyxHQUFHLElBQUl2RixLQUFLLENBQUMwRSxNQUFNLENBQUN2QixXQUFXLENBQUNuQyxTQUFTLENBQUM7SUFDOUQsSUFBSW1DLFdBQVcsQ0FBQ2xDLE1BQU0sRUFBRTtNQUN0QjtNQUNBcEIsTUFBTSxDQUFDMkYsSUFBSSxDQUFDckMsV0FBVyxDQUFDbEMsTUFBTSxDQUFDLENBQzVCMkMsTUFBTSxDQUFDNkIsU0FBUyxJQUFJLENBQUMsSUFBSSxDQUFDQyxpQkFBaUIsQ0FBQ3ZDLFdBQVcsQ0FBQ25DLFNBQVMsRUFBRXlFLFNBQVMsQ0FBQyxDQUFDLENBQzlFRSxPQUFPLENBQUNGLFNBQVMsSUFBSTtRQUNwQixJQUFJdEMsV0FBVyxDQUFDbEMsTUFBTSxFQUFFO1VBQ3RCLE1BQU0yRSxLQUFLLEdBQUd6QyxXQUFXLENBQUNsQyxNQUFNLENBQUN3RSxTQUFTLENBQUM7VUFDM0MsSUFBSSxDQUFDSSxZQUFZLENBQUNOLGNBQWMsRUFBRUUsU0FBUyxFQUFFRyxLQUFLLENBQUM7UUFDckQ7TUFDRixDQUFDLENBQUM7SUFDTjtJQUNBO0lBQ0EsSUFBSXpDLFdBQVcsQ0FBQ2hDLE9BQU8sRUFBRTtNQUN2QnRCLE1BQU0sQ0FBQzJGLElBQUksQ0FBQ3JDLFdBQVcsQ0FBQ2hDLE9BQU8sQ0FBQyxDQUFDd0UsT0FBTyxDQUFDRyxTQUFTLElBQUk7UUFDcEQsSUFBSTNDLFdBQVcsQ0FBQ2hDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQzRFLGdCQUFnQixDQUFDNUMsV0FBVyxDQUFDbkMsU0FBUyxFQUFFOEUsU0FBUyxDQUFDLEVBQUU7VUFDbkZQLGNBQWMsQ0FBQ1MsUUFBUSxDQUFDRixTQUFTLEVBQUUzQyxXQUFXLENBQUNoQyxPQUFPLENBQUMyRSxTQUFTLENBQUMsQ0FBQztRQUNwRTtNQUNGLENBQUMsQ0FBQztJQUNKO0lBRUEsSUFBSSxDQUFDbkIsU0FBUyxDQUFDeEIsV0FBVyxFQUFFb0MsY0FBYyxDQUFDO0lBRTNDLE9BQU8sTUFBTSxJQUFJLENBQUMxRSxjQUFjLENBQUMwRSxjQUFjLENBQUM7RUFDbEQ7RUFFQSxNQUFNRixZQUFZQSxDQUFDbEMsV0FBa0MsRUFBRW9CLFdBQXlCLEVBQUU7SUFDaEYsTUFBTWdCLGNBQWMsR0FBRyxJQUFJdkYsS0FBSyxDQUFDMEUsTUFBTSxDQUFDdkIsV0FBVyxDQUFDbkMsU0FBUyxDQUFDOztJQUU5RDtJQUNBO0lBQ0EsSUFBSW1DLFdBQVcsQ0FBQ2xDLE1BQU0sRUFBRTtNQUN0QnBCLE1BQU0sQ0FBQzJGLElBQUksQ0FBQ3JDLFdBQVcsQ0FBQ2xDLE1BQU0sQ0FBQyxDQUM1QjJDLE1BQU0sQ0FBQzZCLFNBQVMsSUFBSSxDQUFDLElBQUksQ0FBQ0MsaUJBQWlCLENBQUN2QyxXQUFXLENBQUNuQyxTQUFTLEVBQUV5RSxTQUFTLENBQUMsQ0FBQyxDQUM5RUUsT0FBTyxDQUFDRixTQUFTLElBQUk7UUFDcEI7UUFDQSxNQUFNRyxLQUFLLEdBQUd6QyxXQUFXLENBQUNsQyxNQUFNLENBQUN3RSxTQUFTLENBQUM7UUFDM0MsSUFBSSxDQUFDbEIsV0FBVyxDQUFDdEQsTUFBTSxDQUFDd0UsU0FBUyxDQUFDLEVBQUU7VUFDbEMsSUFBSSxDQUFDSSxZQUFZLENBQUNOLGNBQWMsRUFBRUUsU0FBUyxFQUFFRyxLQUFLLENBQUM7UUFDckQ7TUFDRixDQUFDLENBQUM7SUFDTjtJQUVBLE1BQU1LLGNBQXdCLEdBQUcsRUFBRTtJQUNuQyxNQUFNQyxnQkFJSCxHQUFHLEVBQUU7SUFDUixNQUFNQyx1QkFBaUMsR0FBRyxFQUFFOztJQUU1QztJQUNBdEcsTUFBTSxDQUFDMkYsSUFBSSxDQUFDakIsV0FBVyxDQUFDdEQsTUFBTSxDQUFDLENBQzVCMkMsTUFBTSxDQUFDNkIsU0FBUyxJQUFJLENBQUMsSUFBSSxDQUFDQyxpQkFBaUIsQ0FBQ3ZDLFdBQVcsQ0FBQ25DLFNBQVMsRUFBRXlFLFNBQVMsQ0FBQyxDQUFDLENBQzlFRSxPQUFPLENBQUNGLFNBQVMsSUFBSTtNQUNwQixNQUFNRyxLQUFLLEdBQUdyQixXQUFXLENBQUN0RCxNQUFNLENBQUN3RSxTQUFTLENBQUM7TUFDM0MsSUFBSSxDQUFDdEMsV0FBVyxDQUFDbEMsTUFBTSxJQUFJLENBQUNrQyxXQUFXLENBQUNsQyxNQUFNLENBQUN3RSxTQUFTLENBQUMsRUFBRTtRQUN6RFEsY0FBYyxDQUFDRyxJQUFJLENBQUNYLFNBQVMsQ0FBQztRQUM5QjtNQUNGO01BRUEsTUFBTVksVUFBVSxHQUFHbEQsV0FBVyxDQUFDbEMsTUFBTSxDQUFDd0UsU0FBUyxDQUFDO01BQ2hEO01BQ0EsSUFDRSxDQUFDLElBQUksQ0FBQ2EsZUFBZSxDQUNuQjtRQUFFQyxJQUFJLEVBQUVYLEtBQUssQ0FBQ1csSUFBSTtRQUFFQyxXQUFXLEVBQUVaLEtBQUssQ0FBQ1k7TUFBWSxDQUFDLEVBQ3BEO1FBQUVELElBQUksRUFBRUYsVUFBVSxDQUFDRSxJQUFJO1FBQUVDLFdBQVcsRUFBRUgsVUFBVSxDQUFDRztNQUFZLENBQy9ELENBQUMsRUFDRDtRQUNBTixnQkFBZ0IsQ0FBQ0UsSUFBSSxDQUFDO1VBQ3BCWCxTQUFTO1VBQ1RnQixJQUFJLEVBQUU7WUFBRUYsSUFBSSxFQUFFWCxLQUFLLENBQUNXLElBQUk7WUFBRUMsV0FBVyxFQUFFWixLQUFLLENBQUNZO1VBQVksQ0FBQztVQUMxREUsRUFBRSxFQUFFO1lBQUVILElBQUksRUFBRUYsVUFBVSxDQUFDRSxJQUFJO1lBQUVDLFdBQVcsRUFBRUgsVUFBVSxDQUFDRztVQUFZO1FBQ25FLENBQUMsQ0FBQztRQUNGO01BQ0Y7O01BRUE7TUFDQSxJQUFJLENBQUMsSUFBSSxDQUFDRixlQUFlLENBQUNWLEtBQUssRUFBRVMsVUFBVSxDQUFDLEVBQUU7UUFDNUNGLHVCQUF1QixDQUFDQyxJQUFJLENBQUNYLFNBQVMsQ0FBQztNQUN6QztJQUNGLENBQUMsQ0FBQztJQUVKLElBQUksSUFBSSxDQUFDdEYsYUFBYSxDQUFDd0csaUJBQWlCLEtBQUssSUFBSSxFQUFFO01BQ2pEVixjQUFjLENBQUNOLE9BQU8sQ0FBQ0YsU0FBUyxJQUFJO1FBQ2xDRixjQUFjLENBQUNxQixXQUFXLENBQUNuQixTQUFTLENBQUM7TUFDdkMsQ0FBQyxDQUFDOztNQUVGO01BQ0EsTUFBTSxJQUFJLENBQUNoRSxnQkFBZ0IsQ0FBQzhELGNBQWMsQ0FBQztJQUM3QyxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUNwRixhQUFhLENBQUNxRCxNQUFNLEtBQUssSUFBSSxJQUFJeUMsY0FBYyxDQUFDL0IsTUFBTSxFQUFFO01BQ3RFdEMsY0FBTSxDQUFDd0MsSUFBSSxDQUNULG1EQUNFakIsV0FBVyxDQUFDbkMsU0FBUyx1Q0FDZ0JpRixjQUFjLENBQUM5QixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQ3BFLENBQUM7SUFDSDtJQUVBLElBQUksSUFBSSxDQUFDaEUsYUFBYSxDQUFDMEcsc0JBQXNCLEtBQUssSUFBSSxFQUFFO01BQ3REWCxnQkFBZ0IsQ0FBQ1AsT0FBTyxDQUFDQyxLQUFLLElBQUk7UUFDaENMLGNBQWMsQ0FBQ3FCLFdBQVcsQ0FBQ2hCLEtBQUssQ0FBQ0gsU0FBUyxDQUFDO01BQzdDLENBQUMsQ0FBQzs7TUFFRjtNQUNBLE1BQU0sSUFBSSxDQUFDaEUsZ0JBQWdCLENBQUM4RCxjQUFjLENBQUM7TUFFM0NXLGdCQUFnQixDQUFDUCxPQUFPLENBQUNtQixTQUFTLElBQUk7UUFDcEMsSUFBSTNELFdBQVcsQ0FBQ2xDLE1BQU0sRUFBRTtVQUN0QixNQUFNMkUsS0FBSyxHQUFHekMsV0FBVyxDQUFDbEMsTUFBTSxDQUFDNkYsU0FBUyxDQUFDckIsU0FBUyxDQUFDO1VBQ3JELElBQUksQ0FBQ0ksWUFBWSxDQUFDTixjQUFjLEVBQUV1QixTQUFTLENBQUNyQixTQUFTLEVBQUVHLEtBQUssQ0FBQztRQUMvRDtNQUNGLENBQUMsQ0FBQztJQUNKLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQ3pGLGFBQWEsQ0FBQ3FELE1BQU0sS0FBSyxJQUFJLElBQUkwQyxnQkFBZ0IsQ0FBQ2hDLE1BQU0sRUFBRTtNQUN4RWdDLGdCQUFnQixDQUFDUCxPQUFPLENBQUNDLEtBQUssSUFBSTtRQUNoQyxNQUFNYSxJQUFJLEdBQ1JiLEtBQUssQ0FBQ2EsSUFBSSxDQUFDRixJQUFJLElBQUlYLEtBQUssQ0FBQ2EsSUFBSSxDQUFDRCxXQUFXLEdBQUcsS0FBS1osS0FBSyxDQUFDYSxJQUFJLENBQUNELFdBQVcsR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUNsRixNQUFNRSxFQUFFLEdBQUdkLEtBQUssQ0FBQ2MsRUFBRSxDQUFDSCxJQUFJLElBQUlYLEtBQUssQ0FBQ2MsRUFBRSxDQUFDRixXQUFXLEdBQUcsS0FBS1osS0FBSyxDQUFDYyxFQUFFLENBQUNGLFdBQVcsR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUVyRjVFLGNBQU0sQ0FBQ3dDLElBQUksQ0FDVCxjQUFjd0IsS0FBSyxDQUFDSCxTQUFTLDBEQUEwRHRDLFdBQVcsQ0FBQ25DLFNBQVMsNEJBQTRCMEYsRUFBRSxtQ0FBbUNELElBQUksR0FDbkwsQ0FBQztNQUNILENBQUMsQ0FBQztJQUNKO0lBRUFOLHVCQUF1QixDQUFDUixPQUFPLENBQUNGLFNBQVMsSUFBSTtNQUMzQyxJQUFJdEMsV0FBVyxDQUFDbEMsTUFBTSxFQUFFO1FBQ3RCLE1BQU0yRSxLQUFLLEdBQUd6QyxXQUFXLENBQUNsQyxNQUFNLENBQUN3RSxTQUFTLENBQUM7UUFDM0MsSUFBSSxDQUFDSSxZQUFZLENBQUNOLGNBQWMsRUFBRUUsU0FBUyxFQUFFRyxLQUFLLENBQUM7TUFDckQ7SUFDRixDQUFDLENBQUM7O0lBRUY7SUFDQTtJQUNBLElBQUl6QyxXQUFXLENBQUNoQyxPQUFPLEVBQUU7TUFDdkJ0QixNQUFNLENBQUMyRixJQUFJLENBQUNyQyxXQUFXLENBQUNoQyxPQUFPLENBQUMsQ0FBQ3dFLE9BQU8sQ0FBQ0csU0FBUyxJQUFJO1FBQ3BELElBQ0UsQ0FBQyxDQUFDdkIsV0FBVyxDQUFDcEQsT0FBTyxJQUFJLENBQUNvRCxXQUFXLENBQUNwRCxPQUFPLENBQUMyRSxTQUFTLENBQUMsS0FDeEQsQ0FBQyxJQUFJLENBQUNDLGdCQUFnQixDQUFDNUMsV0FBVyxDQUFDbkMsU0FBUyxFQUFFOEUsU0FBUyxDQUFDLEVBQ3hEO1VBQ0EsSUFBSTNDLFdBQVcsQ0FBQ2hDLE9BQU8sRUFBRTtZQUN2Qm9FLGNBQWMsQ0FBQ1MsUUFBUSxDQUFDRixTQUFTLEVBQUUzQyxXQUFXLENBQUNoQyxPQUFPLENBQUMyRSxTQUFTLENBQUMsQ0FBQztVQUNwRTtRQUNGO01BQ0YsQ0FBQyxDQUFDO0lBQ0o7SUFFQSxNQUFNaUIsWUFBWSxHQUFHLEVBQUU7O0lBRXZCO0lBQ0EsSUFBSXhDLFdBQVcsQ0FBQ3BELE9BQU8sRUFBRTtNQUN2QnRCLE1BQU0sQ0FBQzJGLElBQUksQ0FBQ2pCLFdBQVcsQ0FBQ3BELE9BQU8sQ0FBQyxDQUFDd0UsT0FBTyxDQUFDRyxTQUFTLElBQUk7UUFDcEQsSUFBSSxDQUFDLElBQUksQ0FBQ0MsZ0JBQWdCLENBQUM1QyxXQUFXLENBQUNuQyxTQUFTLEVBQUU4RSxTQUFTLENBQUMsRUFBRTtVQUM1RCxJQUFJLENBQUMzQyxXQUFXLENBQUNoQyxPQUFPLElBQUksQ0FBQ2dDLFdBQVcsQ0FBQ2hDLE9BQU8sQ0FBQzJFLFNBQVMsQ0FBQyxFQUFFO1lBQzNEO1lBQ0EsSUFBRyxDQUFDLElBQUksQ0FBQzNGLGFBQWEsQ0FBQzZHLGtCQUFrQixFQUFDO2NBQ3hDekIsY0FBYyxDQUFDMEIsV0FBVyxDQUFDbkIsU0FBUyxDQUFDO1lBQ3ZDO1VBQ0YsQ0FBQyxNQUFNLElBQ0wsQ0FBQyxJQUFJLENBQUNRLGVBQWUsQ0FBQ25ELFdBQVcsQ0FBQ2hDLE9BQU8sQ0FBQzJFLFNBQVMsQ0FBQyxFQUFFdkIsV0FBVyxDQUFDcEQsT0FBTyxDQUFDMkUsU0FBUyxDQUFDLENBQUMsRUFDckY7WUFDQVAsY0FBYyxDQUFDMEIsV0FBVyxDQUFDbkIsU0FBUyxDQUFDO1lBQ3JDLElBQUkzQyxXQUFXLENBQUNoQyxPQUFPLEVBQUU7Y0FDdkI0RixZQUFZLENBQUNYLElBQUksQ0FBQztnQkFDaEJOLFNBQVM7Z0JBQ1RvQixLQUFLLEVBQUUvRCxXQUFXLENBQUNoQyxPQUFPLENBQUMyRSxTQUFTO2NBQ3RDLENBQUMsQ0FBQztZQUNKO1VBQ0Y7UUFDRjtNQUNGLENBQUMsQ0FBQztJQUNKO0lBRUEsSUFBSSxDQUFDbkIsU0FBUyxDQUFDeEIsV0FBVyxFQUFFb0MsY0FBYyxFQUFFaEIsV0FBVyxDQUFDO0lBQ3hEO0lBQ0EsTUFBTSxJQUFJLENBQUM5QyxnQkFBZ0IsQ0FBQzhELGNBQWMsQ0FBQztJQUMzQztJQUNBLElBQUl3QixZQUFZLENBQUM3QyxNQUFNLEVBQUU7TUFDdkJ0QyxjQUFNLENBQUN1RixLQUFLLENBQ1YseUJBQXlCNUIsY0FBYyxDQUFDdkUsU0FBUyxRQUFRK0YsWUFBWSxDQUFDNUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUNsRixDQUFDO01BQ0Q0QyxZQUFZLENBQUNwQixPQUFPLENBQUN4RyxDQUFDLElBQUlvRyxjQUFjLENBQUNTLFFBQVEsQ0FBQzdHLENBQUMsQ0FBQzJHLFNBQVMsRUFBRTNHLENBQUMsQ0FBQytILEtBQUssQ0FBQyxDQUFDO01BQ3hFLE1BQU0sSUFBSSxDQUFDekYsZ0JBQWdCLENBQUM4RCxjQUFjLENBQUM7SUFDN0M7RUFDRjtFQUVBWixTQUFTQSxDQUNQeEIsV0FBa0MsRUFDbENvQyxjQUE0QixFQUM1QmhCLFdBQXlCLEVBQ3pCO0lBQ0EsSUFBSSxDQUFDcEIsV0FBVyxDQUFDOUIscUJBQXFCLElBQUksQ0FBQ2tELFdBQVcsRUFBRTtNQUN0RDNDLGNBQU0sQ0FBQ3dDLElBQUksQ0FBQywwQ0FBMENqQixXQUFXLENBQUNuQyxTQUFTLEdBQUcsQ0FBQztJQUNqRjtJQUNBO0lBQ0EsTUFBTW9HLEdBQUcsR0FBSTtNQUFFLElBQUdqRSxXQUFXLENBQUM5QixxQkFBcUIsSUFBSSxDQUFDLENBQUM7SUFBQyxDQUE0QjtJQUN0RjtJQUNBK0YsR0FBRyxDQUFDQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBQ2pCOUIsY0FBYyxDQUFDK0IsTUFBTSxDQUFDRixHQUFHLENBQUM7RUFDNUI7RUFFQTFCLGlCQUFpQkEsQ0FBQzFFLFNBQWlCLEVBQUV5RSxTQUFpQixFQUFFO0lBQ3RELE9BQ0UsQ0FBQyxDQUFDOEIsZ0NBQWMsQ0FBQ0MsUUFBUSxDQUFDL0IsU0FBUyxDQUFDLElBQ3BDLENBQUMsRUFBRThCLGdDQUFjLENBQUN2RyxTQUFTLENBQUMsSUFBSXVHLGdDQUFjLENBQUN2RyxTQUFTLENBQUMsQ0FBQ3lFLFNBQVMsQ0FBQyxDQUFDO0VBRXpFO0VBRUFNLGdCQUFnQkEsQ0FBQy9FLFNBQWlCLEVBQUU4RSxTQUFpQixFQUFFO0lBQ3JELE1BQU0zRSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUM7SUFDeEIsUUFBUUgsU0FBUztNQUNmLEtBQUssT0FBTztRQUNWRyxPQUFPLENBQUNpRixJQUFJLENBQ1YsMkJBQTJCLEVBQzNCLHdCQUF3QixFQUN4QixZQUFZLEVBQ1osU0FDRixDQUFDO1FBQ0Q7TUFDRixLQUFLLE9BQU87UUFDVmpGLE9BQU8sQ0FBQ2lGLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDdEI7TUFFRixLQUFLLGNBQWM7UUFDakJqRixPQUFPLENBQUNpRixJQUFJLENBQUMsU0FBUyxDQUFDO1FBQ3ZCO0lBQ0o7SUFFQSxPQUFPakYsT0FBTyxDQUFDc0csT0FBTyxDQUFDM0IsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0VBQzFDO0VBRUFRLGVBQWVBLENBQTRCb0IsSUFBTyxFQUFFQyxJQUFPLEVBQUU7SUFDM0QsTUFBTUMsS0FBZSxHQUFHL0gsTUFBTSxDQUFDMkYsSUFBSSxDQUFDa0MsSUFBSSxDQUFDO0lBQ3pDLE1BQU1HLEtBQWUsR0FBR2hJLE1BQU0sQ0FBQzJGLElBQUksQ0FBQ21DLElBQUksQ0FBQzs7SUFFekM7SUFDQSxJQUFJQyxLQUFLLENBQUMxRCxNQUFNLEtBQUsyRCxLQUFLLENBQUMzRCxNQUFNLEVBQUU7TUFBRSxPQUFPLEtBQUs7SUFBRTtJQUNuRCxPQUFPMEQsS0FBSyxDQUFDRSxLQUFLLENBQUNDLENBQUMsSUFBSUwsSUFBSSxDQUFDSyxDQUFDLENBQUMsS0FBS0osSUFBSSxDQUFDSSxDQUFDLENBQUMsQ0FBQztFQUM5QztFQUVBbEMsWUFBWUEsQ0FBQ04sY0FBNEIsRUFBRUUsU0FBaUIsRUFBRUcsS0FBMkIsRUFBRTtJQUN6RixJQUFJQSxLQUFLLENBQUNXLElBQUksS0FBSyxVQUFVLEVBQUU7TUFDN0JoQixjQUFjLENBQUN5QyxXQUFXLENBQUN2QyxTQUFTLEVBQUVHLEtBQUssQ0FBQ1ksV0FBVyxDQUFDO0lBQzFELENBQUMsTUFBTSxJQUFJWixLQUFLLENBQUNXLElBQUksS0FBSyxTQUFTLEVBQUU7TUFDbkNoQixjQUFjLENBQUMwQyxVQUFVLENBQUN4QyxTQUFTLEVBQUVHLEtBQUssQ0FBQ1ksV0FBVyxFQUFFWixLQUFLLENBQUM7SUFDaEUsQ0FBQyxNQUFNO01BQ0xMLGNBQWMsQ0FBQzhCLFFBQVEsQ0FBQzVCLFNBQVMsRUFBRUcsS0FBSyxDQUFDVyxJQUFJLEVBQUVYLEtBQUssQ0FBQztJQUN2RDtFQUNGO0FBQ0Y7QUFBQ3NDLE9BQUEsQ0FBQWpJLGNBQUEsR0FBQUEsY0FBQSIsImlnbm9yZUxpc3QiOltdfQ==