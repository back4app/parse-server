'use strict';

const SchemaCache = require('../lib/Adapters/Cache/SchemaCache').default;
const DatabaseController = require('../lib/Controllers/DatabaseController.js');
const MongoStorageAdapter = require('../lib/Adapters/Storage/Mongo/MongoStorageAdapter').default;

describe('SchemaCache per database adapter', () => {
  it('keeps a separate cache for each adapter', () => {
    const adapterA = {};
    const adapterB = {};
    SchemaCache.for(adapterA).put([{ className: 'Secret', fields: {} }]);
    expect(SchemaCache.for(adapterA).get('Secret')).toBeDefined();
    expect(SchemaCache.for(adapterB).all()).toEqual([]);

    SchemaCache.for(adapterB).put([{ className: 'Boat', fields: {} }]);
    SchemaCache.for(adapterB).del('Boat');
    expect(SchemaCache.for(adapterB).all()).toEqual([]);
    expect(SchemaCache.for(adapterA).all().length).toBe(1);

    SchemaCache.clear();
    expect(SchemaCache.for(adapterA).all()).toEqual([]);
  });

  it_only_db('mongo')('does not share class level permissions between apps in the same process', async () => {
    const baseURI = 'mongodb://localhost:27017/';
    const adapterA = new MongoStorageAdapter({ uri: `${baseURI}schemaCachePerAdapterA` });
    const adapterB = new MongoStorageAdapter({ uri: `${baseURI}schemaCachePerAdapterB` });
    const databaseA = new DatabaseController(adapterA, { appId: Parse.applicationId });
    const databaseB = new DatabaseController(adapterB, { appId: Parse.applicationId });
    const masterOnly = { find: {}, get: {}, count: {}, create: {}, update: {}, delete: {}, addField: {} };
    try {
      await adapterA.deleteAllClasses(false);
      await adapterB.deleteAllClasses(false);

      const schemaA = await databaseA.loadSchema({ clearCache: true });
      await schemaA.addClassIfNotExists('Secret', { value: { type: 'String' } }, masterOnly);
      const schemaB = await databaseB.loadSchema({ clearCache: true });
      await schemaB.addClassIfNotExists('Secret', { value: { type: 'String' } });
      await databaseB.loadSchema({ clearCache: true });

      // App A must still see its own permissions after app B has loaded its schema.
      const reloadedA = await databaseA.loadSchema();
      expect(reloadedA.getClassLevelPermissions('Secret').find).toEqual({});
      expect(reloadedA.testPermissionsForClassName('Secret', ['*'], 'find')).toBe(false);

      const reloadedB = await databaseB.loadSchema();
      expect(reloadedB.testPermissionsForClassName('Secret', ['*'], 'find')).toBe(true);
    } finally {
      await adapterA.deleteAllClasses(false);
      await adapterB.deleteAllClasses(false);
      await adapterA.handleShutdown();
      await adapterB.handleShutdown();
    }
  });
});
