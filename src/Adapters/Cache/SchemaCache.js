// The schema is cached per database adapter, so that several apps running in
// the same process do not read each other's schema.
const caches = new WeakMap();
// Incremented to invalidate the cached schema of all database adapters.
let generation = 0;

class AdapterSchemaCache {
  constructor() {
    this.ttl = { date: Date.now(), duration: undefined };
  }

  all() {
    if (this.generation !== generation) {
      return [];
    }
    return [...(this.allClasses || [])];
  }

  get(className) {
    return this.all().find(cached => cached.className === className);
  }

  put(allSchema) {
    this.allClasses = allSchema;
    this.generation = generation;
  }

  del(className) {
    this.put(this.all().filter(cached => cached.className !== className));
  }

  clear() {
    delete this.allClasses;
  }
}

export default {
  for(adapter) {
    let cache = caches.get(adapter);
    if (!cache) {
      cache = new AdapterSchemaCache();
      caches.set(adapter, cache);
    }
    return cache;
  },

  // Clears the cached schema of all database adapters.
  clear() {
    generation++;
  },
};
