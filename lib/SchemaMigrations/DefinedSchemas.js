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
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
      if (process.env.NODE_ENV === 'production') process.exit(1);
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

      // Hack to force session schema to be created
      await this.createDeleteSession();
      this.allCloudSchemas = await Parse.Schema.all();
      clearTimeout(timeout);
      await Promise.all(this.localSchemas.map(async localSchema => this.saveOrUpdate(localSchema)));
      this.checkForMissingSchemas();
      await this.enforceCLPForNonProvidedClass();
    } catch (e) {
      if (timeout) clearTimeout(timeout);
      if (this.retries < this.maxRetries) {
        this.retries++;
        // first retry 1sec, 2sec, 3sec total 6sec retry sequence
        // retry will only happen in case of deploying multi parse server instance
        // at the same time. Modern systems like k8 avoid this by doing rolling updates
        await this.wait(1000 * this.retries);
        await this.executeMigrations();
      } else {
        _logger.logger.error(`Failed to run migrations: ${e}`);
        if (process.env.NODE_ENV === 'production') process.exit(1);
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
    const session = new Parse.Session();
    await session.save(null, {
      useMasterKey: true
    });
    await session.destroy({
      useMasterKey: true
    });
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
    let indexes = ['_id_'];
    if (className === '_User') {
      indexes = [...indexes, 'case_insensitive_username', 'case_insensitive_email', 'username_1', 'email_1'];
    }
    return indexes.indexOf(indexName) !== -1;
  }
  paramsAreEquals(objA, objB) {
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    // Check key name
    if (keysA.length !== keysB.length) return false;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwicmVxdWlyZSIsIl9Db25maWciLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2NoZW1hQ29udHJvbGxlciIsIl9PcHRpb25zIiwiTWlncmF0aW9ucyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsIm93bktleXMiLCJvYmplY3QiLCJlbnVtZXJhYmxlT25seSIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJzeW1ib2xzIiwiZmlsdGVyIiwic3ltIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJ0YXJnZXQiLCJpIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwic291cmNlIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiVHlwZUVycm9yIiwiTnVtYmVyIiwiUGFyc2UiLCJEZWZpbmVkU2NoZW1hcyIsImNvbnN0cnVjdG9yIiwic2NoZW1hT3B0aW9ucyIsImNvbmZpZyIsImxvY2FsU2NoZW1hcyIsIkNvbmZpZyIsImFwcElkIiwiZGVmaW5pdGlvbnMiLCJBcnJheSIsImlzQXJyYXkiLCJyZXRyaWVzIiwibWF4UmV0cmllcyIsInNhdmVTY2hlbWFUb0RCIiwic2NoZW1hIiwicGF5bG9hZCIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9maWVsZHMiLCJpbmRleGVzIiwiX2luZGV4ZXMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJfY2xwIiwiaW50ZXJuYWxDcmVhdGVTY2hlbWEiLCJyZXNldFNjaGVtYU9wcyIsInVwZGF0ZVNjaGVtYVRvREIiLCJpbnRlcm5hbFVwZGF0ZVNjaGVtYSIsImV4ZWN1dGUiLCJsb2dnZXIiLCJpbmZvIiwiYmVmb3JlTWlncmF0aW9uIiwiUHJvbWlzZSIsInJlc29sdmUiLCJleGVjdXRlTWlncmF0aW9ucyIsImFmdGVyTWlncmF0aW9uIiwiZSIsImVycm9yIiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZXhpdCIsInRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiY3JlYXRlRGVsZXRlU2Vzc2lvbiIsImFsbENsb3VkU2NoZW1hcyIsIlNjaGVtYSIsImFsbCIsImNsZWFyVGltZW91dCIsIm1hcCIsImxvY2FsU2NoZW1hIiwic2F2ZU9yVXBkYXRlIiwiY2hlY2tGb3JNaXNzaW5nU2NoZW1hcyIsImVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzIiwid2FpdCIsInN0cmljdCIsImNsb3VkU2NoZW1hcyIsInMiLCJtaXNzaW5nU2NoZW1hcyIsImMiLCJpbmNsdWRlcyIsInN5c3RlbUNsYXNzZXMiLCJTZXQiLCJzaXplIiwiam9pbiIsIndhcm4iLCJ0aW1lIiwibm9uUHJvdmlkZWRDbGFzc2VzIiwiY2xvdWRTY2hlbWEiLCJzb21lIiwicGFyc2VTY2hlbWEiLCJoYW5kbGVDTFAiLCJzZXNzaW9uIiwiU2Vzc2lvbiIsInNhdmUiLCJ1c2VNYXN0ZXJLZXkiLCJkZXN0cm95IiwiZmluZCIsInNjIiwidXBkYXRlU2NoZW1hIiwic2F2ZVNjaGVtYSIsIm5ld0xvY2FsU2NoZW1hIiwiZmllbGROYW1lIiwiaXNQcm90ZWN0ZWRGaWVsZHMiLCJmaWVsZCIsImhhbmRsZUZpZWxkcyIsImluZGV4TmFtZSIsImlzUHJvdGVjdGVkSW5kZXgiLCJhZGRJbmRleCIsImZpZWxkc1RvRGVsZXRlIiwiZmllbGRzVG9SZWNyZWF0ZSIsImZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zIiwibG9jYWxGaWVsZCIsInBhcmFtc0FyZUVxdWFscyIsInR5cGUiLCJ0YXJnZXRDbGFzcyIsImZyb20iLCJ0byIsImRlbGV0ZUV4dHJhRmllbGRzIiwiZGVsZXRlRmllbGQiLCJyZWNyZWF0ZU1vZGlmaWVkRmllbGRzIiwiZmllbGRJbmZvIiwiaW5kZXhlc1RvQWRkIiwiZGVsZXRlSW5kZXgiLCJpbmRleCIsImRlYnVnIiwibyIsImNscCIsImFkZEZpZWxkIiwic2V0Q0xQIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsImluZGV4T2YiLCJvYmpBIiwib2JqQiIsImtleXNBIiwia2V5c0IiLCJldmVyeSIsImsiLCJhZGRSZWxhdGlvbiIsImFkZFBvaW50ZXIiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIEBmbG93LWRpc2FibGUtbmV4dCBDYW5ub3QgcmVzb2x2ZSBtb2R1bGUgYHBhcnNlL25vZGVgLlxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IHsgaW50ZXJuYWxDcmVhdGVTY2hlbWEsIGludGVybmFsVXBkYXRlU2NoZW1hIH0gZnJvbSAnLi4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IGRlZmF1bHRDb2x1bW5zLCBzeXN0ZW1DbGFzc2VzIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCAqIGFzIE1pZ3JhdGlvbnMgZnJvbSAnLi9NaWdyYXRpb25zJztcblxuZXhwb3J0IGNsYXNzIERlZmluZWRTY2hlbWFzIHtcbiAgY29uZmlnOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIHNjaGVtYU9wdGlvbnM6IE1pZ3JhdGlvbnMuU2NoZW1hT3B0aW9ucztcbiAgbG9jYWxTY2hlbWFzOiBNaWdyYXRpb25zLkpTT05TY2hlbWFbXTtcbiAgcmV0cmllczogbnVtYmVyO1xuICBtYXhSZXRyaWVzOiBudW1iZXI7XG4gIGFsbENsb3VkU2NoZW1hczogUGFyc2UuU2NoZW1hW107XG5cbiAgY29uc3RydWN0b3Ioc2NoZW1hT3B0aW9uczogTWlncmF0aW9ucy5TY2hlbWFPcHRpb25zLCBjb25maWc6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRoaXMubG9jYWxTY2hlbWFzID0gW107XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcuZ2V0KGNvbmZpZy5hcHBJZCk7XG4gICAgdGhpcy5zY2hlbWFPcHRpb25zID0gc2NoZW1hT3B0aW9ucztcbiAgICBpZiAoc2NoZW1hT3B0aW9ucyAmJiBzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zKSB7XG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkoc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucykpIHtcbiAgICAgICAgdGhyb3cgYFwic2NoZW1hLmRlZmluaXRpb25zXCIgbXVzdCBiZSBhbiBhcnJheSBvZiBzY2hlbWFzYDtcbiAgICAgIH1cblxuICAgICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zO1xuICAgIH1cblxuICAgIHRoaXMucmV0cmllcyA9IDA7XG4gICAgdGhpcy5tYXhSZXRyaWVzID0gMztcbiAgfVxuXG4gIGFzeW5jIHNhdmVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxDcmVhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIHJlc2V0U2NoZW1hT3BzKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgLy8gUmVzZXQgb3BzIGxpa2UgU0RLXG4gICAgc2NoZW1hLl9maWVsZHMgPSB7fTtcbiAgICBzY2hlbWEuX2luZGV4ZXMgPSB7fTtcbiAgfVxuXG4gIC8vIFNpbXVsYXRlIHVwZGF0ZSBsaWtlIHRoZSBTREtcbiAgLy8gV2UgY2Fubm90IHVzZSBTREsgc2luY2Ugcm91dGVzIGFyZSBkaXNhYmxlZFxuICBhc3luYyB1cGRhdGVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxVcGRhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGUoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMnKTtcbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMgJiYgdGhpcy5zY2hlbWFPcHRpb25zLmJlZm9yZU1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmJlZm9yZU1pZ3JhdGlvbigpKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuXG4gICAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zICYmIHRoaXMuc2NoZW1hT3B0aW9ucy5hZnRlck1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIuaW5mbygnUnVubmluZyBNaWdyYXRpb25zIENvbXBsZXRlZCcpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJ1biBtaWdyYXRpb25zOiAke2V9YCk7XG4gICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGVNaWdyYXRpb25zKCkge1xuICAgIGxldCB0aW1lb3V0ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgLy8gU2V0IHVwIGEgdGltZSBvdXQgaW4gcHJvZHVjdGlvblxuICAgICAgLy8gaWYgd2UgZmFpbCB0byBnZXQgc2NoZW1hXG4gICAgICAvLyBwbTIgb3IgSzhzIGFuZCBtYW55IG90aGVyIHByb2Nlc3MgbWFuYWdlcnMgd2lsbCB0cnkgdG8gcmVzdGFydCB0aGUgcHJvY2Vzc1xuICAgICAgLy8gYWZ0ZXIgdGhlIGV4aXRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1RpbWVvdXQgb2NjdXJyZWQgZHVyaW5nIGV4ZWN1dGlvbiBvZiBtaWdyYXRpb25zLiBFeGl0aW5nLi4uJyk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9LCAyMDAwMCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhhY2sgdG8gZm9yY2Ugc2Vzc2lvbiBzY2hlbWEgdG8gYmUgY3JlYXRlZFxuICAgICAgYXdhaXQgdGhpcy5jcmVhdGVEZWxldGVTZXNzaW9uKCk7XG4gICAgICB0aGlzLmFsbENsb3VkU2NoZW1hcyA9IGF3YWl0IFBhcnNlLlNjaGVtYS5hbGwoKTtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHRoaXMubG9jYWxTY2hlbWFzLm1hcChhc3luYyBsb2NhbFNjaGVtYSA9PiB0aGlzLnNhdmVPclVwZGF0ZShsb2NhbFNjaGVtYSkpKTtcblxuICAgICAgdGhpcy5jaGVja0Zvck1pc3NpbmdTY2hlbWFzKCk7XG4gICAgICBhd2FpdCB0aGlzLmVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHRpbWVvdXQpIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGlmICh0aGlzLnJldHJpZXMgPCB0aGlzLm1heFJldHJpZXMpIHtcbiAgICAgICAgdGhpcy5yZXRyaWVzKys7XG4gICAgICAgIC8vIGZpcnN0IHJldHJ5IDFzZWMsIDJzZWMsIDNzZWMgdG90YWwgNnNlYyByZXRyeSBzZXF1ZW5jZVxuICAgICAgICAvLyByZXRyeSB3aWxsIG9ubHkgaGFwcGVuIGluIGNhc2Ugb2YgZGVwbG95aW5nIG11bHRpIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgICAgICAvLyBhdCB0aGUgc2FtZSB0aW1lLiBNb2Rlcm4gc3lzdGVtcyBsaWtlIGs4IGF2b2lkIHRoaXMgYnkgZG9pbmcgcm9sbGluZyB1cGRhdGVzXG4gICAgICAgIGF3YWl0IHRoaXMud2FpdCgxMDAwICogdGhpcy5yZXRyaWVzKTtcbiAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjaGVja0Zvck1pc3NpbmdTY2hlbWFzKCkge1xuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICE9PSB0cnVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2xvdWRTY2hlbWFzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMubWFwKHMgPT4gcy5jbGFzc05hbWUpO1xuICAgIGNvbnN0IGxvY2FsU2NoZW1hcyA9IHRoaXMubG9jYWxTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBtaXNzaW5nU2NoZW1hcyA9IGNsb3VkU2NoZW1hcy5maWx0ZXIoXG4gICAgICBjID0+ICFsb2NhbFNjaGVtYXMuaW5jbHVkZXMoYykgJiYgIXN5c3RlbUNsYXNzZXMuaW5jbHVkZXMoYylcbiAgICApO1xuXG4gICAgaWYgKG5ldyBTZXQobG9jYWxTY2hlbWFzKS5zaXplICE9PSBsb2NhbFNjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBUaGUgbGlzdCBvZiBzY2hlbWFzIHByb3ZpZGVkIGNvbnRhaW5zIGR1cGxpY2F0ZWQgXCJjbGFzc05hbWVcIiAgXCIke2xvY2FsU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIixcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgJiYgbWlzc2luZ1NjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgc2NoZW1hcyBhcmUgY3VycmVudGx5IHByZXNlbnQgaW4gdGhlIGRhdGFiYXNlLCBidXQgbm90IGV4cGxpY2l0bHkgZGVmaW5lZCBpbiBhIHNjaGVtYTogXCIke21pc3NpbmdTY2hlbWFzLmpvaW4oXG4gICAgICAgICAgJ1wiLCBcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmVxdWlyZWQgZm9yIHRlc3RpbmcgcHVycG9zZVxuICB3YWl0KHRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgdGltZSkpO1xuICB9XG5cbiAgYXN5bmMgZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm9uUHJvdmlkZWRDbGFzc2VzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgY2xvdWRTY2hlbWEgPT5cbiAgICAgICAgIXRoaXMubG9jYWxTY2hlbWFzLnNvbWUobG9jYWxTY2hlbWEgPT4gbG9jYWxTY2hlbWEuY2xhc3NOYW1lID09PSBjbG91ZFNjaGVtYS5jbGFzc05hbWUpXG4gICAgKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIG5vblByb3ZpZGVkQ2xhc3Nlcy5tYXAoYXN5bmMgc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB0aGlzLmhhbmRsZUNMUChzY2hlbWEsIHBhcnNlU2NoZW1hKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKHBhcnNlU2NoZW1hKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIGZha2Ugc2Vzc2lvbiBzaW5jZSBQYXJzZSBkbyBub3QgY3JlYXRlIHRoZSBfU2Vzc2lvbiB1bnRpbFxuICAvLyBhIHNlc3Npb24gaXMgY3JlYXRlZFxuICBhc3luYyBjcmVhdGVEZWxldGVTZXNzaW9uKCkge1xuICAgIGNvbnN0IHNlc3Npb24gPSBuZXcgUGFyc2UuU2Vzc2lvbigpO1xuICAgIGF3YWl0IHNlc3Npb24uc2F2ZShudWxsLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICBhd2FpdCBzZXNzaW9uLmRlc3Ryb3koeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBhc3luYyBzYXZlT3JVcGRhdGUobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSkge1xuICAgIGNvbnN0IGNsb3VkU2NoZW1hID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmluZChzYyA9PiBzYy5jbGFzc05hbWUgPT09IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGNsb3VkU2NoZW1hKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYShsb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aHJvdyBgRXJyb3IgZHVyaW5nIHVwZGF0ZSBvZiBzY2hlbWEgZm9yIHR5cGUgJHtjbG91ZFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlU2NoZW1hKGxvY2FsU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIHdoaWxlIHNhdmluZyBTY2hlbWEgZm9yIHR5cGUgJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcbiAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAvLyBIYW5kbGUgZmllbGRzXG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIEhhbmRsZSBpbmRleGVzXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMgJiYgIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSkpIHtcbiAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zYXZlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWEobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSwgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIGNvbnN0IG5ld0xvY2FsU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuXG4gICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICBpZiAoIWNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWVsZHNUb0RlbGV0ZTogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNUb1JlY3JlYXRlOiB7XG4gICAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICAgIGZyb206IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgICAgdG86IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgIH1bXSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gQ2hlY2sgZGVsZXRpb25cbiAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5maWVsZHMpXG4gICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBpZiAoIWxvY2FsU2NoZW1hLmZpZWxkcyB8fCAhbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICBmaWVsZHNUb0RlbGV0ZS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbG9jYWxGaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAvLyBDaGVjayBpZiBmaWVsZCBoYXMgYSBjaGFuZ2VkIHR5cGVcbiAgICAgICAgaWYgKFxuICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhcbiAgICAgICAgICAgIHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB7IHR5cGU6IGxvY2FsRmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGxvY2FsRmllbGQudGFyZ2V0Q2xhc3MgfVxuICAgICAgICAgIClcbiAgICAgICAgKSB7XG4gICAgICAgICAgZmllbGRzVG9SZWNyZWF0ZS5wdXNoKHtcbiAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgIGZyb206IHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB0bzogeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgc29tZXRoaW5nIGNoYW5nZWQgb3RoZXIgdGhhbiB0aGUgdHlwZSAobGlrZSByZXF1aXJlZCwgZGVmYXVsdFZhbHVlKVxuICAgICAgICBpZiAoIXRoaXMucGFyYW1zQXJlRXF1YWxzKGZpZWxkLCBsb2NhbEZpZWxkKSkge1xuICAgICAgICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzID09PSB0cnVlKSB7XG4gICAgICBmaWVsZHNUb0RlbGV0ZS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb0RlbGV0ZS5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICBgVGhlIGZvbGxvd2luZyBmaWVsZHMgZXhpc3QgaW4gdGhlIGRhdGFiYXNlIGZvciBcIiR7XG4gICAgICAgICAgbG9jYWxTY2hlbWEuY2xhc3NOYW1lXG4gICAgICAgIH1cIiwgYnV0IGFyZSBtaXNzaW5nIGluIHRoZSBzY2hlbWEgOiBcIiR7ZmllbGRzVG9EZWxldGUuam9pbignXCIgLFwiJyl9XCJgXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlRmllbGQoZmllbGQuZmllbGROYW1lKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBEZWxldGUgZmllbGRzIGZyb20gdGhlIHNjaGVtYSB0aGVuIGFwcGx5IGNoYW5nZXNcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZEluZm8gPT4ge1xuICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGRJbmZvLmZpZWxkTmFtZV07XG4gICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkSW5mby5maWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ID09PSB0cnVlICYmIGZpZWxkc1RvUmVjcmVhdGUubGVuZ3RoKSB7XG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICBjb25zdCBmcm9tID1cbiAgICAgICAgICBmaWVsZC5mcm9tLnR5cGUgKyAoZmllbGQuZnJvbS50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQuZnJvbS50YXJnZXRDbGFzc30pYCA6ICcnKTtcbiAgICAgICAgY29uc3QgdG8gPSBmaWVsZC50by50eXBlICsgKGZpZWxkLnRvLnRhcmdldENsYXNzID8gYCAoJHtmaWVsZC50by50YXJnZXRDbGFzc30pYCA6ICcnKTtcblxuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBgVGhlIGZpZWxkIFwiJHtmaWVsZC5maWVsZE5hbWV9XCIgdHlwZSBkaWZmZXIgYmV0d2VlbiB0aGUgc2NoZW1hIGFuZCB0aGUgZGF0YWJhc2UgZm9yIFwiJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9XCI7IFNjaGVtYSBpcyBkZWZpbmVkIGFzIFwiJHt0b31cIiBhbmQgY3VycmVudCBkYXRhYmFzZSB0eXBlIGlzIFwiJHtmcm9tfVwiYFxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgSW5kZXhlc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICghY2xvdWRTY2hlbWEuaW5kZXhlcyB8fCAhY2xvdWRTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSAmJlxuICAgICAgICAgICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleGVzVG9BZGQgPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgaWYgKGNsb3VkU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNsb3VkU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5pbmRleGVzIHx8ICFsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sIGNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgICBpbmRleGVzVG9BZGQucHVzaCh7XG4gICAgICAgICAgICAgICAgaW5kZXhOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4OiBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hLCBjbG91ZFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgY2hhbmdlc1xuICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgbmV3L2NoYW5nZWQgaW5kZXhlc1xuICAgIGlmIChpbmRleGVzVG9BZGQubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBVcGRhdGluZyBpbmRleGVzIGZvciBcIiR7bmV3TG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiIDogICR7aW5kZXhlc1RvQWRkLmpvaW4oJyAsJyl9YFxuICAgICAgKTtcbiAgICAgIGluZGV4ZXNUb0FkZC5mb3JFYWNoKG8gPT4gbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoby5pbmRleE5hbWUsIG8uaW5kZXgpKTtcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlQ0xQKFxuICAgIGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsXG4gICAgbmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSxcbiAgICBjbG91ZFNjaGVtYTogUGFyc2UuU2NoZW1hXG4gICkge1xuICAgIGlmICghbG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zICYmICFjbG91ZFNjaGVtYSkge1xuICAgICAgbG9nZ2VyLndhcm4oYGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyBub3QgcHJvdmlkZWQgZm9yICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfS5gKTtcbiAgICB9XG4gICAgLy8gVXNlIHNwcmVhZCB0byBhdm9pZCByZWFkIG9ubHkgaXNzdWUgKGVuY291bnRlcmVkIGJ5IE1vdW1vdWxzIHVzaW5nIGRpcmVjdEFjY2VzcylcbiAgICBjb25zdCBjbHAgPSAoeyAuLi5sb2NhbFNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfSB8fCB7fTogUGFyc2UuQ0xQLlBlcm1pc3Npb25zTWFwKTtcbiAgICAvLyBUbyBhdm9pZCBpbmNvbnNpc3RlbmN5IHdlIG5lZWQgdG8gcmVtb3ZlIGFsbCByaWdodHMgb24gYWRkRmllbGRcbiAgICBjbHAuYWRkRmllbGQgPSB7fTtcbiAgICBuZXdMb2NhbFNjaGVtYS5zZXRDTFAoY2xwKTtcbiAgfVxuXG4gIGlzUHJvdGVjdGVkRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiAoXG4gICAgICAhIWRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0gfHxcbiAgICAgICEhKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKVxuICAgICk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleE5hbWU6IHN0cmluZykge1xuICAgIGxldCBpbmRleGVzID0gWydfaWRfJ107XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgaW5kZXhlcyA9IFtcbiAgICAgICAgLi4uaW5kZXhlcyxcbiAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLFxuICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsXG4gICAgICAgICd1c2VybmFtZV8xJyxcbiAgICAgICAgJ2VtYWlsXzEnLFxuICAgICAgXTtcbiAgICB9XG5cbiAgICByZXR1cm4gaW5kZXhlcy5pbmRleE9mKGluZGV4TmFtZSkgIT09IC0xO1xuICB9XG5cbiAgcGFyYW1zQXJlRXF1YWxzPFQ6IHsgW2tleTogc3RyaW5nXTogYW55IH0+KG9iakE6IFQsIG9iakI6IFQpIHtcbiAgICBjb25zdCBrZXlzQTogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpBKTtcbiAgICBjb25zdCBrZXlzQjogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpCKTtcblxuICAgIC8vIENoZWNrIGtleSBuYW1lXG4gICAgaWYgKGtleXNBLmxlbmd0aCAhPT0ga2V5c0IubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGtleXNBLmV2ZXJ5KGsgPT4gb2JqQVtrXSA9PT0gb2JqQltrXSk7XG4gIH1cblxuICBoYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSwgZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkOiBNaWdyYXRpb25zLkZpZWxkVHlwZSkge1xuICAgIGlmIChmaWVsZC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRSZWxhdGlvbihmaWVsZE5hbWUsIGZpZWxkLnRhcmdldENsYXNzKTtcbiAgICB9IGVsc2UgaWYgKGZpZWxkLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkUG9pbnRlcihmaWVsZE5hbWUsIGZpZWxkLnRhcmdldENsYXNzLCBmaWVsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEZpZWxkKGZpZWxkTmFtZSwgZmllbGQudHlwZSwgZmllbGQpO1xuICAgIH1cbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFHQSxJQUFBQSxPQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxjQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxpQkFBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssUUFBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sVUFBQSxHQUFBQyx1QkFBQSxDQUFBUCxPQUFBO0FBQTJDLFNBQUFRLHlCQUFBQyxXQUFBLGVBQUFDLE9BQUEsa0NBQUFDLGlCQUFBLE9BQUFELE9BQUEsUUFBQUUsZ0JBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxXQUFBLFdBQUFBLFdBQUEsR0FBQUcsZ0JBQUEsR0FBQUQsaUJBQUEsS0FBQUYsV0FBQTtBQUFBLFNBQUFGLHdCQUFBTSxHQUFBLEVBQUFKLFdBQUEsU0FBQUEsV0FBQSxJQUFBSSxHQUFBLElB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