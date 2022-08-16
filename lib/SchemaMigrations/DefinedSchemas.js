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

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
  } // Simulate update like the SDK
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
      } // Hack to force session schema to be created


      await this.createDeleteSession();
      this.allCloudSchemas = await Parse.Schema.all();
      clearTimeout(timeout);
      await Promise.all(this.localSchemas.map(async localSchema => this.saveOrUpdate(localSchema)));
      this.checkForMissingSchemas();
      await this.enforceCLPForNonProvidedClass();
    } catch (e) {
      if (timeout) clearTimeout(timeout);

      if (this.retries < this.maxRetries) {
        this.retries++; // first retry 1sec, 2sec, 3sec total 6sec retry sequence
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
  } // Required for testing purpose


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
  } // Create a fake session since Parse do not create the _Session until
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
    } // Handle indexes


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
    const newLocalSchema = new Parse.Schema(localSchema.className); // Handle fields
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
    const fieldsWithChangedParams = []; // Check deletion

    Object.keys(cloudSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
      const field = cloudSchema.fields[fieldName];

      if (!localSchema.fields || !localSchema.fields[fieldName]) {
        fieldsToDelete.push(fieldName);
        return;
      }

      const localField = localSchema.fields[fieldName]; // Check if field has a changed type

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
      } // Check if something changed other than the type (like required, defaultValue)


      if (!this.paramsAreEquals(field, localField)) {
        fieldsWithChangedParams.push(fieldName);
      }
    });

    if (this.schemaOptions.deleteExtraFields === true) {
      fieldsToDelete.forEach(fieldName => {
        newLocalSchema.deleteField(fieldName);
      }); // Delete fields from the schema then apply changes

      await this.updateSchemaToDB(newLocalSchema);
    } else if (this.schemaOptions.strict === true && fieldsToDelete.length) {
      _logger.logger.warn(`The following fields exist in the database for "${localSchema.className}", but are missing in the schema : "${fieldsToDelete.join('" ,"')}"`);
    }

    if (this.schemaOptions.recreateModifiedFields === true) {
      fieldsToRecreate.forEach(field => {
        newLocalSchema.deleteField(field.fieldName);
      }); // Delete fields from the schema then apply changes

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
    }); // Handle Indexes
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

    const indexesToAdd = []; // Check deletion

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

    this.handleCLP(localSchema, newLocalSchema, cloudSchema); // Apply changes

    await this.updateSchemaToDB(newLocalSchema); // Apply new/changed indexes

    if (indexesToAdd.length) {
      _logger.logger.debug(`Updating indexes for "${newLocalSchema.className}" :  ${indexesToAdd.join(' ,')}`);

      indexesToAdd.forEach(o => newLocalSchema.addIndex(o.indexName, o.index));
      await this.updateSchemaToDB(newLocalSchema);
    }
  }

  handleCLP(localSchema, newLocalSchema, cloudSchema) {
    if (!localSchema.classLevelPermissions && !cloudSchema) {
      _logger.logger.warn(`classLevelPermissions not provided for ${localSchema.className}.`);
    } // Use spread to avoid read only issue (encountered by Moumouls using directAccess)


    const clp = _objectSpread({}, localSchema.classLevelPermissions) || {}; // To avoid inconsistency we need to remove all rights on addField

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
    const keysB = Object.keys(objB); // Check key name

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJEZWZpbmVkU2NoZW1hcyIsImNvbnN0cnVjdG9yIiwic2NoZW1hT3B0aW9ucyIsImNvbmZpZyIsImxvY2FsU2NoZW1hcyIsIkNvbmZpZyIsImdldCIsImFwcElkIiwiZGVmaW5pdGlvbnMiLCJBcnJheSIsImlzQXJyYXkiLCJyZXRyaWVzIiwibWF4UmV0cmllcyIsInNhdmVTY2hlbWFUb0RCIiwic2NoZW1hIiwicGF5bG9hZCIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9maWVsZHMiLCJpbmRleGVzIiwiX2luZGV4ZXMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJfY2xwIiwiaW50ZXJuYWxDcmVhdGVTY2hlbWEiLCJyZXNldFNjaGVtYU9wcyIsInVwZGF0ZVNjaGVtYVRvREIiLCJpbnRlcm5hbFVwZGF0ZVNjaGVtYSIsImV4ZWN1dGUiLCJsb2dnZXIiLCJpbmZvIiwiYmVmb3JlTWlncmF0aW9uIiwiUHJvbWlzZSIsInJlc29sdmUiLCJleGVjdXRlTWlncmF0aW9ucyIsImFmdGVyTWlncmF0aW9uIiwiZSIsImVycm9yIiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZXhpdCIsInRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiY3JlYXRlRGVsZXRlU2Vzc2lvbiIsImFsbENsb3VkU2NoZW1hcyIsIlNjaGVtYSIsImFsbCIsImNsZWFyVGltZW91dCIsIm1hcCIsImxvY2FsU2NoZW1hIiwic2F2ZU9yVXBkYXRlIiwiY2hlY2tGb3JNaXNzaW5nU2NoZW1hcyIsImVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzIiwid2FpdCIsInN0cmljdCIsImNsb3VkU2NoZW1hcyIsInMiLCJtaXNzaW5nU2NoZW1hcyIsImZpbHRlciIsImMiLCJpbmNsdWRlcyIsInN5c3RlbUNsYXNzZXMiLCJTZXQiLCJzaXplIiwibGVuZ3RoIiwiam9pbiIsIndhcm4iLCJ0aW1lIiwibm9uUHJvdmlkZWRDbGFzc2VzIiwiY2xvdWRTY2hlbWEiLCJzb21lIiwicGFyc2VTY2hlbWEiLCJoYW5kbGVDTFAiLCJzZXNzaW9uIiwiU2Vzc2lvbiIsInNhdmUiLCJ1c2VNYXN0ZXJLZXkiLCJkZXN0cm95IiwiZmluZCIsInNjIiwidXBkYXRlU2NoZW1hIiwic2F2ZVNjaGVtYSIsIm5ld0xvY2FsU2NoZW1hIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkTmFtZSIsImlzUHJvdGVjdGVkRmllbGRzIiwiZm9yRWFjaCIsImZpZWxkIiwiaGFuZGxlRmllbGRzIiwiaW5kZXhOYW1lIiwiaXNQcm90ZWN0ZWRJbmRleCIsImFkZEluZGV4IiwiZmllbGRzVG9EZWxldGUiLCJmaWVsZHNUb1JlY3JlYXRlIiwiZmllbGRzV2l0aENoYW5nZWRQYXJhbXMiLCJwdXNoIiwibG9jYWxGaWVsZCIsInBhcmFtc0FyZUVxdWFscyIsInR5cGUiLCJ0YXJnZXRDbGFzcyIsImZyb20iLCJ0byIsImRlbGV0ZUV4dHJhRmllbGRzIiwiZGVsZXRlRmllbGQiLCJyZWNyZWF0ZU1vZGlmaWVkRmllbGRzIiwiZmllbGRJbmZvIiwiaW5kZXhlc1RvQWRkIiwiZGVsZXRlSW5kZXgiLCJpbmRleCIsImRlYnVnIiwibyIsImNscCIsImFkZEZpZWxkIiwic2V0Q0xQIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsImluZGV4T2YiLCJvYmpBIiwib2JqQiIsImtleXNBIiwia2V5c0IiLCJldmVyeSIsImsiLCJhZGRSZWxhdGlvbiIsImFkZFBvaW50ZXIiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvU2NoZW1hTWlncmF0aW9ucy9EZWZpbmVkU2NoZW1hcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0IENhbm5vdCByZXNvbHZlIG1vZHVsZSBgcGFyc2Uvbm9kZWAuXG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgeyBpbnRlcm5hbENyZWF0ZVNjaGVtYSwgaW50ZXJuYWxVcGRhdGVTY2hlbWEgfSBmcm9tICcuLi9Sb3V0ZXJzL1NjaGVtYXNSb3V0ZXInO1xuaW1wb3J0IHsgZGVmYXVsdENvbHVtbnMsIHN5c3RlbUNsYXNzZXMgfSBmcm9tICcuLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4uL09wdGlvbnMnO1xuaW1wb3J0ICogYXMgTWlncmF0aW9ucyBmcm9tICcuL01pZ3JhdGlvbnMnO1xuXG5leHBvcnQgY2xhc3MgRGVmaW5lZFNjaGVtYXMge1xuICBjb25maWc6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgc2NoZW1hT3B0aW9uczogTWlncmF0aW9ucy5TY2hlbWFPcHRpb25zO1xuICBsb2NhbFNjaGVtYXM6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYVtdO1xuICByZXRyaWVzOiBudW1iZXI7XG4gIG1heFJldHJpZXM6IG51bWJlcjtcbiAgYWxsQ2xvdWRTY2hlbWFzOiBQYXJzZS5TY2hlbWFbXTtcblxuICBjb25zdHJ1Y3RvcihzY2hlbWFPcHRpb25zOiBNaWdyYXRpb25zLlNjaGVtYU9wdGlvbnMsIGNvbmZpZzogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBbXTtcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnLmFwcElkKTtcbiAgICB0aGlzLnNjaGVtYU9wdGlvbnMgPSBzY2hlbWFPcHRpb25zO1xuICAgIGlmIChzY2hlbWFPcHRpb25zICYmIHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMpIHtcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zKSkge1xuICAgICAgICB0aHJvdyBgXCJzY2hlbWEuZGVmaW5pdGlvbnNcIiBtdXN0IGJlIGFuIGFycmF5IG9mIHNjaGVtYXNgO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxvY2FsU2NoZW1hcyA9IHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnM7XG4gICAgfVxuXG4gICAgdGhpcy5yZXRyaWVzID0gMDtcbiAgICB0aGlzLm1heFJldHJpZXMgPSAzO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbENyZWF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgcmVzZXRTY2hlbWFPcHMoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICAvLyBSZXNldCBvcHMgbGlrZSBTREtcbiAgICBzY2hlbWEuX2ZpZWxkcyA9IHt9O1xuICAgIHNjaGVtYS5faW5kZXhlcyA9IHt9O1xuICB9XG5cbiAgLy8gU2ltdWxhdGUgdXBkYXRlIGxpa2UgdGhlIFNES1xuICAvLyBXZSBjYW5ub3QgdXNlIFNESyBzaW5jZSByb3V0ZXMgYXJlIGRpc2FibGVkXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbFVwZGF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZSgpIHtcbiAgICB0cnkge1xuICAgICAgbG9nZ2VyLmluZm8oJ1J1bm5pbmcgTWlncmF0aW9ucycpO1xuICAgICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucyAmJiB0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVNaWdyYXRpb25zKCk7XG5cbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMgJiYgdGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYWZ0ZXJNaWdyYXRpb24oKSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMgQ29tcGxldGVkJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZU1pZ3JhdGlvbnMoKSB7XG4gICAgbGV0IHRpbWVvdXQgPSBudWxsO1xuICAgIHRyeSB7XG4gICAgICAvLyBTZXQgdXAgYSB0aW1lIG91dCBpbiBwcm9kdWN0aW9uXG4gICAgICAvLyBpZiB3ZSBmYWlsIHRvIGdldCBzY2hlbWFcbiAgICAgIC8vIHBtMiBvciBLOHMgYW5kIG1hbnkgb3RoZXIgcHJvY2VzcyBtYW5hZ2VycyB3aWxsIHRyeSB0byByZXN0YXJ0IHRoZSBwcm9jZXNzXG4gICAgICAvLyBhZnRlciB0aGUgZXhpdFxuICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignVGltZW91dCBvY2N1cnJlZCBkdXJpbmcgZXhlY3V0aW9uIG9mIG1pZ3JhdGlvbnMuIEV4aXRpbmcuLi4nKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH0sIDIwMDAwKTtcbiAgICAgIH1cblxuICAgICAgLy8gSGFjayB0byBmb3JjZSBzZXNzaW9uIHNjaGVtYSB0byBiZSBjcmVhdGVkXG4gICAgICBhd2FpdCB0aGlzLmNyZWF0ZURlbGV0ZVNlc3Npb24oKTtcbiAgICAgIHRoaXMuYWxsQ2xvdWRTY2hlbWFzID0gYXdhaXQgUGFyc2UuU2NoZW1hLmFsbCgpO1xuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5sb2NhbFNjaGVtYXMubWFwKGFzeW5jIGxvY2FsU2NoZW1hID0+IHRoaXMuc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hKSkpO1xuXG4gICAgICB0aGlzLmNoZWNrRm9yTWlzc2luZ1NjaGVtYXMoKTtcbiAgICAgIGF3YWl0IHRoaXMuZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodGltZW91dCkgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgaWYgKHRoaXMucmV0cmllcyA8IHRoaXMubWF4UmV0cmllcykge1xuICAgICAgICB0aGlzLnJldHJpZXMrKztcbiAgICAgICAgLy8gZmlyc3QgcmV0cnkgMXNlYywgMnNlYywgM3NlYyB0b3RhbCA2c2VjIHJldHJ5IHNlcXVlbmNlXG4gICAgICAgIC8vIHJldHJ5IHdpbGwgb25seSBoYXBwZW4gaW4gY2FzZSBvZiBkZXBsb3lpbmcgbXVsdGkgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAgICAgIC8vIGF0IHRoZSBzYW1lIHRpbWUuIE1vZGVybiBzeXN0ZW1zIGxpa2UgazggYXZvaWQgdGhpcyBieSBkb2luZyByb2xsaW5nIHVwZGF0ZXNcbiAgICAgICAgYXdhaXQgdGhpcy53YWl0KDEwMDAgKiB0aGlzLnJldHJpZXMpO1xuICAgICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVNaWdyYXRpb25zKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBydW4gbWlncmF0aW9uczogJHtlfWApO1xuICAgICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNoZWNrRm9yTWlzc2luZ1NjaGVtYXMoKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgIT09IHRydWUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjbG91ZFNjaGVtYXMgPSB0aGlzLmFsbENsb3VkU2NoZW1hcy5tYXAocyA9PiBzLmNsYXNzTmFtZSk7XG4gICAgY29uc3QgbG9jYWxTY2hlbWFzID0gdGhpcy5sb2NhbFNjaGVtYXMubWFwKHMgPT4gcy5jbGFzc05hbWUpO1xuICAgIGNvbnN0IG1pc3NpbmdTY2hlbWFzID0gY2xvdWRTY2hlbWFzLmZpbHRlcihcbiAgICAgIGMgPT4gIWxvY2FsU2NoZW1hcy5pbmNsdWRlcyhjKSAmJiAhc3lzdGVtQ2xhc3Nlcy5pbmNsdWRlcyhjKVxuICAgICk7XG5cbiAgICBpZiAobmV3IFNldChsb2NhbFNjaGVtYXMpLnNpemUgIT09IGxvY2FsU2NoZW1hcy5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYFRoZSBsaXN0IG9mIHNjaGVtYXMgcHJvdmlkZWQgY29udGFpbnMgZHVwbGljYXRlZCBcImNsYXNzTmFtZVwiICBcIiR7bG9jYWxTY2hlbWFzLmpvaW4oXG4gICAgICAgICAgJ1wiLFwiJ1xuICAgICAgICApfVwiYFxuICAgICAgKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCAmJiBtaXNzaW5nU2NoZW1hcy5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICBgVGhlIGZvbGxvd2luZyBzY2hlbWFzIGFyZSBjdXJyZW50bHkgcHJlc2VudCBpbiB0aGUgZGF0YWJhc2UsIGJ1dCBub3QgZXhwbGljaXRseSBkZWZpbmVkIGluIGEgc2NoZW1hOiBcIiR7bWlzc2luZ1NjaGVtYXMuam9pbihcbiAgICAgICAgICAnXCIsIFwiJ1xuICAgICAgICApfVwiYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyBSZXF1aXJlZCBmb3IgdGVzdGluZyBwdXJwb3NlXG4gIHdhaXQodGltZTogbnVtYmVyKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCB0aW1lKSk7XG4gIH1cblxuICBhc3luYyBlbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBub25Qcm92aWRlZENsYXNzZXMgPSB0aGlzLmFsbENsb3VkU2NoZW1hcy5maWx0ZXIoXG4gICAgICBjbG91ZFNjaGVtYSA9PlxuICAgICAgICAhdGhpcy5sb2NhbFNjaGVtYXMuc29tZShsb2NhbFNjaGVtYSA9PiBsb2NhbFNjaGVtYS5jbGFzc05hbWUgPT09IGNsb3VkU2NoZW1hLmNsYXNzTmFtZSlcbiAgICApO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgbm9uUHJvdmlkZWRDbGFzc2VzLm1hcChhc3luYyBzY2hlbWEgPT4ge1xuICAgICAgICBjb25zdCBwYXJzZVNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgICAgIHRoaXMuaGFuZGxlQ0xQKHNjaGVtYSwgcGFyc2VTY2hlbWEpO1xuICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIocGFyc2VTY2hlbWEpO1xuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgZmFrZSBzZXNzaW9uIHNpbmNlIFBhcnNlIGRvIG5vdCBjcmVhdGUgdGhlIF9TZXNzaW9uIHVudGlsXG4gIC8vIGEgc2Vzc2lvbiBpcyBjcmVhdGVkXG4gIGFzeW5jIGNyZWF0ZURlbGV0ZVNlc3Npb24oKSB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IG5ldyBQYXJzZS5TZXNzaW9uKCk7XG4gICAgYXdhaXQgc2Vzc2lvbi5zYXZlKG51bGwsIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICAgIGF3YWl0IHNlc3Npb24uZGVzdHJveSh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVPclVwZGF0ZShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hKSB7XG4gICAgY29uc3QgY2xvdWRTY2hlbWEgPSB0aGlzLmFsbENsb3VkU2NoZW1hcy5maW5kKHNjID0+IHNjLmNsYXNzTmFtZSA9PT0gbG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcbiAgICBpZiAoY2xvdWRTY2hlbWEpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hKGxvY2FsU2NoZW1hLCBjbG91ZFNjaGVtYSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRocm93IGBFcnJvciBkdXJpbmcgdXBkYXRlIG9mIHNjaGVtYSBmb3IgdHlwZSAke2Nsb3VkU2NoZW1hLmNsYXNzTmFtZX06ICR7ZX1gO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVTY2hlbWEobG9jYWxTY2hlbWEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aHJvdyBgRXJyb3Igd2hpbGUgc2F2aW5nIFNjaGVtYSBmb3IgdHlwZSAke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX06ICR7ZX1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHNhdmVTY2hlbWEobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSkge1xuICAgIGNvbnN0IG5ld0xvY2FsU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgIC8vIEhhbmRsZSBmaWVsZHNcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgLy8gSGFuZGxlIGluZGV4ZXNcbiAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuaW5kZXhlcykuZm9yRWFjaChpbmRleE5hbWUgPT4ge1xuICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcyAmJiAhdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKSkge1xuICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KGluZGV4TmFtZSwgbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hKTtcblxuICAgIHJldHVybiBhd2FpdCB0aGlzLnNhdmVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hLCBjbG91ZFNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG5cbiAgICAvLyBIYW5kbGUgZmllbGRzXG4gICAgLy8gQ2hlY2sgYWRkaXRpb25cbiAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgIGlmICghY2xvdWRTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGZpZWxkc1RvRGVsZXRlOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkc1RvUmVjcmVhdGU6IHtcbiAgICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgICAgZnJvbTogeyB0eXBlOiBzdHJpbmcsIHRhcmdldENsYXNzPzogc3RyaW5nIH0sXG4gICAgICB0bzogeyB0eXBlOiBzdHJpbmcsIHRhcmdldENsYXNzPzogc3RyaW5nIH0sXG4gICAgfVtdID0gW107XG4gICAgY29uc3QgZmllbGRzV2l0aENoYW5nZWRQYXJhbXM6IHN0cmluZ1tdID0gW107XG5cbiAgICAvLyBDaGVjayBkZWxldGlvblxuICAgIE9iamVjdC5rZXlzKGNsb3VkU2NoZW1hLmZpZWxkcylcbiAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gY2xvdWRTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGlmICghbG9jYWxTY2hlbWEuZmllbGRzIHx8ICFsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgIGZpZWxkc1RvRGVsZXRlLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBsb2NhbEZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIC8vIENoZWNrIGlmIGZpZWxkIGhhcyBhIGNoYW5nZWQgdHlwZVxuICAgICAgICBpZiAoXG4gICAgICAgICAgIXRoaXMucGFyYW1zQXJlRXF1YWxzKFxuICAgICAgICAgICAgeyB0eXBlOiBmaWVsZC50eXBlLCB0YXJnZXRDbGFzczogZmllbGQudGFyZ2V0Q2xhc3MgfSxcbiAgICAgICAgICAgIHsgdHlwZTogbG9jYWxGaWVsZC50eXBlLCB0YXJnZXRDbGFzczogbG9jYWxGaWVsZC50YXJnZXRDbGFzcyB9XG4gICAgICAgICAgKVxuICAgICAgICApIHtcbiAgICAgICAgICBmaWVsZHNUb1JlY3JlYXRlLnB1c2goe1xuICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgZnJvbTogeyB0eXBlOiBmaWVsZC50eXBlLCB0YXJnZXRDbGFzczogZmllbGQudGFyZ2V0Q2xhc3MgfSxcbiAgICAgICAgICAgIHRvOiB7IHR5cGU6IGxvY2FsRmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGxvY2FsRmllbGQudGFyZ2V0Q2xhc3MgfSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiBzb21ldGhpbmcgY2hhbmdlZCBvdGhlciB0aGFuIHRoZSB0eXBlIChsaWtlIHJlcXVpcmVkLCBkZWZhdWx0VmFsdWUpXG4gICAgICAgIGlmICghdGhpcy5wYXJhbXNBcmVFcXVhbHMoZmllbGQsIGxvY2FsRmllbGQpKSB7XG4gICAgICAgICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMgPT09IHRydWUpIHtcbiAgICAgIGZpZWxkc1RvRGVsZXRlLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlRmllbGQoZmllbGROYW1lKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBEZWxldGUgZmllbGRzIGZyb20gdGhlIHNjaGVtYSB0aGVuIGFwcGx5IGNoYW5nZXNcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ID09PSB0cnVlICYmIGZpZWxkc1RvRGVsZXRlLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBUaGUgZm9sbG93aW5nIGZpZWxkcyBleGlzdCBpbiB0aGUgZGF0YWJhc2UgZm9yIFwiJHtcbiAgICAgICAgICBsb2NhbFNjaGVtYS5jbGFzc05hbWVcbiAgICAgICAgfVwiLCBidXQgYXJlIG1pc3NpbmcgaW4gdGhlIHNjaGVtYSA6IFwiJHtmaWVsZHNUb0RlbGV0ZS5qb2luKCdcIiAsXCInKX1cImBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzID09PSB0cnVlKSB7XG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVGaWVsZChmaWVsZC5maWVsZE5hbWUpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIERlbGV0ZSBmaWVsZHMgZnJvbSB0aGUgc2NoZW1hIHRoZW4gYXBwbHkgY2hhbmdlc1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcblxuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkSW5mbyA9PiB7XG4gICAgICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZEluZm8uZmllbGROYW1lXTtcbiAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGRJbmZvLmZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgPT09IHRydWUgJiYgZmllbGRzVG9SZWNyZWF0ZS5sZW5ndGgpIHtcbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICAgIGNvbnN0IGZyb20gPVxuICAgICAgICAgIGZpZWxkLmZyb20udHlwZSArIChmaWVsZC5mcm9tLnRhcmdldENsYXNzID8gYCAoJHtmaWVsZC5mcm9tLnRhcmdldENsYXNzfSlgIDogJycpO1xuICAgICAgICBjb25zdCB0byA9IGZpZWxkLnRvLnR5cGUgKyAoZmllbGQudG8udGFyZ2V0Q2xhc3MgPyBgICgke2ZpZWxkLnRvLnRhcmdldENsYXNzfSlgIDogJycpO1xuXG4gICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgIGBUaGUgZmllbGQgXCIke2ZpZWxkLmZpZWxkTmFtZX1cIiB0eXBlIGRpZmZlciBiZXR3ZWVuIHRoZSBzY2hlbWEgYW5kIHRoZSBkYXRhYmFzZSBmb3IgXCIke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX1cIjsgU2NoZW1hIGlzIGRlZmluZWQgYXMgXCIke3RvfVwiIGFuZCBjdXJyZW50IGRhdGFiYXNlIHR5cGUgaXMgXCIke2Zyb219XCJgXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEhhbmRsZSBJbmRleGVzXG4gICAgLy8gQ2hlY2sgYWRkaXRpb25cbiAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuaW5kZXhlcykuZm9yRWFjaChpbmRleE5hbWUgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgKCFjbG91ZFNjaGVtYS5pbmRleGVzIHx8ICFjbG91ZFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pICYmXG4gICAgICAgICAgIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KGluZGV4TmFtZSwgbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGluZGV4ZXNUb0FkZCA9IFtdO1xuXG4gICAgLy8gQ2hlY2sgZGVsZXRpb25cbiAgICBpZiAoY2xvdWRTY2hlbWEuaW5kZXhlcykge1xuICAgICAgT2JqZWN0LmtleXMoY2xvdWRTY2hlbWEuaW5kZXhlcykuZm9yRWFjaChpbmRleE5hbWUgPT4ge1xuICAgICAgICBpZiAoIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSkpIHtcbiAgICAgICAgICBpZiAoIWxvY2FsU2NoZW1hLmluZGV4ZXMgfHwgIWxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSkge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlSW5kZXgoaW5kZXhOYW1lKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgIXRoaXMucGFyYW1zQXJlRXF1YWxzKGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSwgY2xvdWRTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlSW5kZXgoaW5kZXhOYW1lKTtcbiAgICAgICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICAgICAgICAgIGluZGV4ZXNUb0FkZC5wdXNoKHtcbiAgICAgICAgICAgICAgICBpbmRleE5hbWUsXG4gICAgICAgICAgICAgICAgaW5kZXg6IGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmhhbmRsZUNMUChsb2NhbFNjaGVtYSwgbmV3TG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICAvLyBBcHBseSBjaGFuZ2VzXG4gICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICAvLyBBcHBseSBuZXcvY2hhbmdlZCBpbmRleGVzXG4gICAgaWYgKGluZGV4ZXNUb0FkZC5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgYFVwZGF0aW5nIGluZGV4ZXMgZm9yIFwiJHtuZXdMb2NhbFNjaGVtYS5jbGFzc05hbWV9XCIgOiAgJHtpbmRleGVzVG9BZGQuam9pbignICwnKX1gXG4gICAgICApO1xuICAgICAgaW5kZXhlc1RvQWRkLmZvckVhY2gobyA9PiBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChvLmluZGV4TmFtZSwgby5pbmRleCkpO1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVDTFAoXG4gICAgbG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSxcbiAgICBuZXdMb2NhbFNjaGVtYTogUGFyc2UuU2NoZW1hLFxuICAgIGNsb3VkU2NoZW1hOiBQYXJzZS5TY2hlbWFcbiAgKSB7XG4gICAgaWYgKCFsb2NhbFNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgJiYgIWNsb3VkU2NoZW1hKSB7XG4gICAgICBsb2dnZXIud2FybihgY2xhc3NMZXZlbFBlcm1pc3Npb25zIG5vdCBwcm92aWRlZCBmb3IgJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9LmApO1xuICAgIH1cbiAgICAvLyBVc2Ugc3ByZWFkIHRvIGF2b2lkIHJlYWQgb25seSBpc3N1ZSAoZW5jb3VudGVyZWQgYnkgTW91bW91bHMgdXNpbmcgZGlyZWN0QWNjZXNzKVxuICAgIGNvbnN0IGNscCA9ICh7IC4uLmxvY2FsU2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyB9IHx8IHt9OiBQYXJzZS5DTFAuUGVybWlzc2lvbnNNYXApO1xuICAgIC8vIFRvIGF2b2lkIGluY29uc2lzdGVuY3kgd2UgbmVlZCB0byByZW1vdmUgYWxsIHJpZ2h0cyBvbiBhZGRGaWVsZFxuICAgIGNscC5hZGRGaWVsZCA9IHt9O1xuICAgIG5ld0xvY2FsU2NoZW1hLnNldENMUChjbHApO1xuICB9XG5cbiAgaXNQcm90ZWN0ZWRGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICEhZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGROYW1lXSB8fFxuICAgICAgISEoZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSAmJiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV0pXG4gICAgKTtcbiAgfVxuXG4gIGlzUHJvdGVjdGVkSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4TmFtZTogc3RyaW5nKSB7XG4gICAgbGV0IGluZGV4ZXMgPSBbJ19pZF8nXTtcbiAgICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICBpbmRleGVzID0gW1xuICAgICAgICAuLi5pbmRleGVzLFxuICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsXG4gICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJyxcbiAgICAgICAgJ3VzZXJuYW1lXzEnLFxuICAgICAgICAnZW1haWxfMScsXG4gICAgICBdO1xuICAgIH1cblxuICAgIHJldHVybiBpbmRleGVzLmluZGV4T2YoaW5kZXhOYW1lKSAhPT0gLTE7XG4gIH1cblxuICBwYXJhbXNBcmVFcXVhbHM8VDogeyBba2V5OiBzdHJpbmddOiBhbnkgfT4ob2JqQTogVCwgb2JqQjogVCkge1xuICAgIGNvbnN0IGtleXNBOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakEpO1xuICAgIGNvbnN0IGtleXNCOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakIpO1xuXG4gICAgLy8gQ2hlY2sga2V5IG5hbWVcbiAgICBpZiAoa2V5c0EubGVuZ3RoICE9PSBrZXlzQi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4ga2V5c0EuZXZlcnkoayA9PiBvYmpBW2tdID09PSBvYmpCW2tdKTtcbiAgfVxuXG4gIGhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYTogUGFyc2UuU2NoZW1hLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGQ6IE1pZ3JhdGlvbnMuRmllbGRUeXBlKSB7XG4gICAgaWYgKGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZFJlbGF0aW9uKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MpO1xuICAgIH0gZWxzZSBpZiAoZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRQb2ludGVyKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MsIGZpZWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkRmllbGQoZmllbGROYW1lLCBmaWVsZC50eXBlLCBmaWVsZCk7XG4gICAgfVxuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFHQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFQQTtBQUNBLE1BQU1BLEtBQUssR0FBR0MsT0FBTyxDQUFDLFlBQUQsQ0FBckI7O0FBUU8sTUFBTUMsY0FBTixDQUFxQjtFQVExQkMsV0FBVyxDQUFDQyxhQUFELEVBQTBDQyxNQUExQyxFQUFzRTtJQUMvRSxLQUFLQyxZQUFMLEdBQW9CLEVBQXBCO0lBQ0EsS0FBS0QsTUFBTCxHQUFjRSxlQUFBLENBQU9DLEdBQVAsQ0FBV0gsTUFBTSxDQUFDSSxLQUFsQixDQUFkO0lBQ0EsS0FBS0wsYUFBTCxHQUFxQkEsYUFBckI7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