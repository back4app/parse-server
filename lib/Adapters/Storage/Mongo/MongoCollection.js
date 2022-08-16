"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

const mongodb = require('mongodb');

const Collection = mongodb.Collection;

class MongoCollection {
  constructor(mongoCollection) {
    this._mongoCollection = mongoCollection;
  } // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.


  find(query, {
    skip,
    limit,
    sort,
    keys,
    maxTimeMS,
    readPreference,
    hint,
    caseInsensitive,
    explain
  } = {}) {
    // Support for Full Text Search - $text
    if (keys && keys.$score) {
      delete keys.$score;
      keys.score = {
        $meta: 'textScore'
      };
    }

    return this._rawFind(query, {
      skip,
      limit,
      sort,
      keys,
      maxTimeMS,
      readPreference,
      hint,
      caseInsensitive,
      explain
    }).catch(error => {
      // Check for "no geoindex" error
      if (error.code != 17007 && !error.message.match(/unable to find index for .geoNear/)) {
        throw error;
      } // Figure out what key needs an index


      const key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];

      if (!key) {
        throw error;
      }

      var index = {};
      index[key] = '2d';
      return this._mongoCollection.createIndex(index, {
        background: true
      }) // Retry, but just once.
      .then(() => this._rawFind(query, {
        skip,
        limit,
        sort,
        keys,
        maxTimeMS,
        readPreference,
        hint,
        caseInsensitive,
        explain
      }));
    });
  }
  /**
   * Collation to support case insensitive queries
   */


  static caseInsensitiveCollation() {
    return {
      locale: 'en_US',
      strength: 2
    };
  }

  _rawFind(query, {
    skip,
    limit,
    sort,
    keys,
    maxTimeMS,
    readPreference,
    hint,
    caseInsensitive,
    explain
  } = {}) {
    let findOperation = this._mongoCollection.find(query, {
      skip,
      limit,
      sort,
      readPreference,
      hint
    });

    if (keys) {
      findOperation = findOperation.project(keys);
    }

    if (caseInsensitive) {
      findOperation = findOperation.collation(MongoCollection.caseInsensitiveCollation());
    }

    if (maxTimeMS) {
      findOperation = findOperation.maxTimeMS(maxTimeMS);
    }

    return explain ? findOperation.explain(explain) : findOperation.toArray();
  }

  count(query, {
    skip,
    limit,
    sort,
    maxTimeMS,
    readPreference,
    hint
  } = {}) {
    // If query is empty, then use estimatedDocumentCount instead.
    // This is due to countDocuments performing a scan,
    // which greatly increases execution time when being run on large collections.
    // See https://github.com/Automattic/mongoose/issues/6713 for more info regarding this problem.
    if (typeof query !== 'object' || !Object.keys(query).length) {
      return this._mongoCollection.estimatedDocumentCount({
        maxTimeMS
      });
    }

    const countOperation = this._mongoCollection.countDocuments(query, {
      skip,
      limit,
      sort,
      maxTimeMS,
      readPreference,
      hint
    });

    return countOperation;
  }

  distinct(field, query) {
    return this._mongoCollection.distinct(field, query);
  }

  aggregate(pipeline, {
    maxTimeMS,
    readPreference,
    hint,
    explain
  } = {}) {
    return this._mongoCollection.aggregate(pipeline, {
      maxTimeMS,
      readPreference,
      hint,
      explain
    }).toArray();
  }

  insertOne(object, session) {
    return this._mongoCollection.insertOne(object, {
      session
    });
  } // Atomically updates data in the database for a single (first) object that matched the query
  // If there is nothing that matches the query - does insert
  // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.


  upsertOne(query, update, session) {
    return this._mongoCollection.updateOne(query, update, {
      upsert: true,
      session
    });
  }

  updateOne(query, update) {
    return this._mongoCollection.updateOne(query, update);
  }

  updateMany(query, update, session) {
    return this._mongoCollection.updateMany(query, update, {
      session
    });
  }

  deleteMany(query, session) {
    return this._mongoCollection.deleteMany(query, {
      session
    });
  }

  _ensureSparseUniqueIndexInBackground(indexRequest) {
    return new Promise((resolve, reject) => {
      this._mongoCollection.createIndex(indexRequest, {
        unique: true,
        background: true,
        sparse: true
      }, error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  drop() {
    return this._mongoCollection.drop();
  }

}

exports.default = MongoCollection;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJtb25nb2RiIiwicmVxdWlyZSIsIkNvbGxlY3Rpb24iLCJNb25nb0NvbGxlY3Rpb24iLCJjb25zdHJ1Y3RvciIsIm1vbmdvQ29sbGVjdGlvbiIsIl9tb25nb0NvbGxlY3Rpb24iLCJmaW5kIiwicXVlcnkiLCJza2lwIiwibGltaXQiLCJzb3J0Iiwia2V5cyIsIm1heFRpbWVNUyIsInJlYWRQcmVmZXJlbmNlIiwiaGludCIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCIkc2NvcmUiLCJzY29yZSIsIiRtZXRhIiwiX3Jhd0ZpbmQiLCJjYXRjaCIsImVycm9yIiwiY29kZSIsIm1lc3NhZ2UiLCJtYXRjaCIsImtleSIsImluZGV4IiwiY3JlYXRlSW5kZXgiLCJiYWNrZ3JvdW5kIiwidGhlbiIsImNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbiIsImxvY2FsZSIsInN0cmVuZ3RoIiwiZmluZE9wZXJhdGlvbiIsInByb2plY3QiLCJjb2xsYXRpb24iLCJ0b0FycmF5IiwiY291bnQiLCJPYmplY3QiLCJsZW5ndGgiLCJlc3RpbWF0ZWREb2N1bWVudENvdW50IiwiY291bnRPcGVyYXRpb24iLCJjb3VudERvY3VtZW50cyIsImRpc3RpbmN0IiwiZmllbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImluc2VydE9uZSIsIm9iamVjdCIsInNlc3Npb24iLCJ1cHNlcnRPbmUiLCJ1cGRhdGUiLCJ1cGRhdGVPbmUiLCJ1cHNlcnQiLCJ1cGRhdGVNYW55IiwiZGVsZXRlTWFueSIsIl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZCIsImluZGV4UmVxdWVzdCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwidW5pcXVlIiwic3BhcnNlIiwiZHJvcCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvQ29sbGVjdGlvbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBtb25nb2RiID0gcmVxdWlyZSgnbW9uZ29kYicpO1xuY29uc3QgQ29sbGVjdGlvbiA9IG1vbmdvZGIuQ29sbGVjdGlvbjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTW9uZ29Db2xsZWN0aW9uIHtcbiAgX21vbmdvQ29sbGVjdGlvbjogQ29sbGVjdGlvbjtcblxuICBjb25zdHJ1Y3Rvcihtb25nb0NvbGxlY3Rpb246IENvbGxlY3Rpb24pIHtcbiAgICB0aGlzLl9tb25nb0NvbGxlY3Rpb24gPSBtb25nb0NvbGxlY3Rpb247XG4gIH1cblxuICAvLyBEb2VzIGEgZmluZCB3aXRoIFwic21hcnQgaW5kZXhpbmdcIi5cbiAgLy8gQ3VycmVudGx5IHRoaXMganVzdCBtZWFucywgaWYgaXQgbmVlZHMgYSBnZW9pbmRleCBhbmQgdGhlcmUgaXNcbiAgLy8gbm9uZSwgdGhlbiBidWlsZCB0aGUgZ2VvaW5kZXguXG4gIC8vIFRoaXMgY291bGQgYmUgaW1wcm92ZWQgYSBsb3QgYnV0IGl0J3Mgbm90IGNsZWFyIGlmIHRoYXQncyBhIGdvb2RcbiAgLy8gaWRlYS4gT3IgZXZlbiBpZiB0aGlzIGJlaGF2aW9yIGlzIGEgZ29vZCBpZGVhLlxuICBmaW5kKFxuICAgIHF1ZXJ5LFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIG1heFRpbWVNUywgcmVhZFByZWZlcmVuY2UsIGhpbnQsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9ID0ge31cbiAgKSB7XG4gICAgLy8gU3VwcG9ydCBmb3IgRnVsbCBUZXh0IFNlYXJjaCAtICR0ZXh0XG4gICAgaWYgKGtleXMgJiYga2V5cy4kc2NvcmUpIHtcbiAgICAgIGRlbGV0ZSBrZXlzLiRzY29yZTtcbiAgICAgIGtleXMuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fcmF3RmluZChxdWVyeSwge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIGtleXMsXG4gICAgICBtYXhUaW1lTVMsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICBleHBsYWluLFxuICAgIH0pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIENoZWNrIGZvciBcIm5vIGdlb2luZGV4XCIgZXJyb3JcbiAgICAgIGlmIChlcnJvci5jb2RlICE9IDE3MDA3ICYmICFlcnJvci5tZXNzYWdlLm1hdGNoKC91bmFibGUgdG8gZmluZCBpbmRleCBmb3IgLmdlb05lYXIvKSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIC8vIEZpZ3VyZSBvdXQgd2hhdCBrZXkgbmVlZHMgYW4gaW5kZXhcbiAgICAgIGNvbnN0IGtleSA9IGVycm9yLm1lc3NhZ2UubWF0Y2goL2ZpZWxkPShbQS1aYS16XzAtOV0rKSAvKVsxXTtcbiAgICAgIGlmICgha2V5KSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuXG4gICAgICB2YXIgaW5kZXggPSB7fTtcbiAgICAgIGluZGV4W2tleV0gPSAnMmQnO1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgdGhpcy5fbW9uZ29Db2xsZWN0aW9uXG4gICAgICAgICAgLmNyZWF0ZUluZGV4KGluZGV4LCB7IGJhY2tncm91bmQ6IHRydWUgfSlcbiAgICAgICAgICAvLyBSZXRyeSwgYnV0IGp1c3Qgb25jZS5cbiAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgdGhpcy5fcmF3RmluZChxdWVyeSwge1xuICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICAgICAgc29ydCxcbiAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgbWF4VGltZU1TLFxuICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICApXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbGxhdGlvbiB0byBzdXBwb3J0IGNhc2UgaW5zZW5zaXRpdmUgcXVlcmllc1xuICAgKi9cbiAgc3RhdGljIGNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpIHtcbiAgICByZXR1cm4geyBsb2NhbGU6ICdlbl9VUycsIHN0cmVuZ3RoOiAyIH07XG4gIH1cblxuICBfcmF3RmluZChcbiAgICBxdWVyeSxcbiAgICB7IHNraXAsIGxpbWl0LCBzb3J0LCBrZXlzLCBtYXhUaW1lTVMsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfSA9IHt9XG4gICkge1xuICAgIGxldCBmaW5kT3BlcmF0aW9uID0gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmZpbmQocXVlcnksIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIHNvcnQsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgfSk7XG5cbiAgICBpZiAoa2V5cykge1xuICAgICAgZmluZE9wZXJhdGlvbiA9IGZpbmRPcGVyYXRpb24ucHJvamVjdChrZXlzKTtcbiAgICB9XG5cbiAgICBpZiAoY2FzZUluc2Vuc2l0aXZlKSB7XG4gICAgICBmaW5kT3BlcmF0aW9uID0gZmluZE9wZXJhdGlvbi5jb2xsYXRpb24oTW9uZ29Db2xsZWN0aW9uLmNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpKTtcbiAgICB9XG5cbiAgICBpZiAobWF4VGltZU1TKSB7XG4gICAgICBmaW5kT3BlcmF0aW9uID0gZmluZE9wZXJhdGlvbi5tYXhUaW1lTVMobWF4VGltZU1TKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZXhwbGFpbiA/IGZpbmRPcGVyYXRpb24uZXhwbGFpbihleHBsYWluKSA6IGZpbmRPcGVyYXRpb24udG9BcnJheSgpO1xuICB9XG5cbiAgY291bnQocXVlcnksIHsgc2tpcCwgbGltaXQsIHNvcnQsIG1heFRpbWVNUywgcmVhZFByZWZlcmVuY2UsIGhpbnQgfSA9IHt9KSB7XG4gICAgLy8gSWYgcXVlcnkgaXMgZW1wdHksIHRoZW4gdXNlIGVzdGltYXRlZERvY3VtZW50Q291bnQgaW5zdGVhZC5cbiAgICAvLyBUaGlzIGlzIGR1ZSB0byBjb3VudERvY3VtZW50cyBwZXJmb3JtaW5nIGEgc2NhbixcbiAgICAvLyB3aGljaCBncmVhdGx5IGluY3JlYXNlcyBleGVjdXRpb24gdGltZSB3aGVuIGJlaW5nIHJ1biBvbiBsYXJnZSBjb2xsZWN0aW9ucy5cbiAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL0F1dG9tYXR0aWMvbW9uZ29vc2UvaXNzdWVzLzY3MTMgZm9yIG1vcmUgaW5mbyByZWdhcmRpbmcgdGhpcyBwcm9ibGVtLlxuICAgIGlmICh0eXBlb2YgcXVlcnkgIT09ICdvYmplY3QnIHx8ICFPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmVzdGltYXRlZERvY3VtZW50Q291bnQoe1xuICAgICAgICBtYXhUaW1lTVMsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBjb3VudE9wZXJhdGlvbiA9IHRoaXMuX21vbmdvQ29sbGVjdGlvbi5jb3VudERvY3VtZW50cyhxdWVyeSwge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIG1heFRpbWVNUyxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICB9KTtcblxuICAgIHJldHVybiBjb3VudE9wZXJhdGlvbjtcbiAgfVxuXG4gIGRpc3RpbmN0KGZpZWxkLCBxdWVyeSkge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24uZGlzdGluY3QoZmllbGQsIHF1ZXJ5KTtcbiAgfVxuXG4gIGFnZ3JlZ2F0ZShwaXBlbGluZSwgeyBtYXhUaW1lTVMsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBleHBsYWluIH0gPSB7fSkge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb25cbiAgICAgIC5hZ2dyZWdhdGUocGlwZWxpbmUsIHsgbWF4VGltZU1TLCByZWFkUHJlZmVyZW5jZSwgaGludCwgZXhwbGFpbiB9KVxuICAgICAgLnRvQXJyYXkoKTtcbiAgfVxuXG4gIGluc2VydE9uZShvYmplY3QsIHNlc3Npb24pIHtcbiAgICByZXR1cm4gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmluc2VydE9uZShvYmplY3QsIHsgc2Vzc2lvbiB9KTtcbiAgfVxuXG4gIC8vIEF0b21pY2FsbHkgdXBkYXRlcyBkYXRhIGluIHRoZSBkYXRhYmFzZSBmb3IgYSBzaW5nbGUgKGZpcnN0KSBvYmplY3QgdGhhdCBtYXRjaGVkIHRoZSBxdWVyeVxuICAvLyBJZiB0aGVyZSBpcyBub3RoaW5nIHRoYXQgbWF0Y2hlcyB0aGUgcXVlcnkgLSBkb2VzIGluc2VydFxuICAvLyBQb3N0Z3JlcyBOb3RlOiBgSU5TRVJUIC4uLiBPTiBDT05GTElDVCBVUERBVEVgIHRoYXQgaXMgYXZhaWxhYmxlIHNpbmNlIDkuNS5cbiAgdXBzZXJ0T25lKHF1ZXJ5LCB1cGRhdGUsIHNlc3Npb24pIHtcbiAgICByZXR1cm4gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLnVwZGF0ZU9uZShxdWVyeSwgdXBkYXRlLCB7XG4gICAgICB1cHNlcnQ6IHRydWUsXG4gICAgICBzZXNzaW9uLFxuICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlT25lKHF1ZXJ5LCB1cGRhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLnVwZGF0ZU9uZShxdWVyeSwgdXBkYXRlKTtcbiAgfVxuXG4gIHVwZGF0ZU1hbnkocXVlcnksIHVwZGF0ZSwgc2Vzc2lvbikge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24udXBkYXRlTWFueShxdWVyeSwgdXBkYXRlLCB7IHNlc3Npb24gfSk7XG4gIH1cblxuICBkZWxldGVNYW55KHF1ZXJ5LCBzZXNzaW9uKSB7XG4gICAgcmV0dXJuIHRoaXMuX21vbmdvQ29sbGVjdGlvbi5kZWxldGVNYW55KHF1ZXJ5LCB7IHNlc3Npb24gfSk7XG4gIH1cblxuICBfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQoaW5kZXhSZXF1ZXN0KSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHRoaXMuX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleChcbiAgICAgICAgaW5kZXhSZXF1ZXN0LFxuICAgICAgICB7IHVuaXF1ZTogdHJ1ZSwgYmFja2dyb3VuZDogdHJ1ZSwgc3BhcnNlOiB0cnVlIH0sXG4gICAgICAgIGVycm9yID0+IHtcbiAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICBkcm9wKCkge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24uZHJvcCgpO1xuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQSxNQUFNQSxPQUFPLEdBQUdDLE9BQU8sQ0FBQyxTQUFELENBQXZCOztBQUNBLE1BQU1DLFVBQVUsR0FBR0YsT0FBTyxDQUFDRSxVQUEzQjs7QUFFZSxNQUFNQyxlQUFOLENBQXNCO0VBR25DQyxXQUFXLENBQUNDLGVBQUQsRUFBOEI7SUFDdkMsS0FBS0MsZ0JBQUwsR0FBd0JELGVBQXhCO0VBQ0QsQ0FMa0MsQ0FPbkM7RUFDQTtFQUNBO0VBQ0E7RUFDQTs7O0VBQ0FFLElBQUksQ0FDRkMsS0FERSxFQUVGO0lBQUVDLElBQUY7SUFBUUMsS0FBUjtJQUFlQyxJQUFmO0lBQXFCQyxJQUFyQjtJQUEyQkMsU0FBM0I7SUFBc0NDLGNBQXRDO0lBQXNEQyxJQUF0RDtJQUE0REMsZUFBNUQ7SUFBNkVDO0VBQTdFLElBQXlGLEVBRnZGLEVBR0Y7SUFD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