"use strict";

var equalObjects = require('./equalObjects');
var Id = require('./Id');
var Parse = require('parse/node');

/**
 * Query Hashes are deterministic hashes for Parse Queries.
 * Any two queries that have the same set of constraints will produce the same
 * hash. This lets us reliably group components by the queries they depend upon,
 * and quickly determine if a query has changed.
 */

/**
 * Convert $or queries into an array of where conditions
 */
function flattenOrQueries(where) {
  if (!Object.prototype.hasOwnProperty.call(where, '$or')) {
    return where;
  }
  var accum = [];
  for (var i = 0; i < where.$or.length; i++) {
    accum = accum.concat(where.$or[i]);
  }
  return accum;
}

/**
 * Deterministically turns an object into a string. Disregards ordering
 */
function stringify(object) {
  if (typeof object !== 'object' || object === null) {
    if (typeof object === 'string') {
      return '"' + object.replace(/\|/g, '%|') + '"';
    }
    return object + '';
  }
  if (Array.isArray(object)) {
    var copy = object.map(stringify);
    copy.sort();
    return '[' + copy.join(',') + ']';
  }
  var sections = [];
  var keys = Object.keys(object);
  keys.sort();
  for (var k = 0; k < keys.length; k++) {
    sections.push(stringify(keys[k]) + ':' + stringify(object[keys[k]]));
  }
  return '{' + sections.join(',') + '}';
}

/**
 * Generate a hash from a query, with unique fields for columns, values, order,
 * skip, and limit.
 */
function queryHash(query) {
  if (query instanceof Parse.Query) {
    query = {
      className: query.className,
      where: query._where
    };
  }
  var where = flattenOrQueries(query.where || {});
  var columns = [];
  var values = [];
  var i;
  if (Array.isArray(where)) {
    var uniqueColumns = {};
    for (i = 0; i < where.length; i++) {
      var subValues = {};
      var keys = Object.keys(where[i]);
      keys.sort();
      for (var j = 0; j < keys.length; j++) {
        subValues[keys[j]] = where[i][keys[j]];
        uniqueColumns[keys[j]] = true;
      }
      values.push(subValues);
    }
    columns = Object.keys(uniqueColumns);
    columns.sort();
  } else {
    columns = Object.keys(where);
    columns.sort();
    for (i = 0; i < columns.length; i++) {
      values.push(where[columns[i]]);
    }
  }
  var sections = [columns.join(','), stringify(values)];
  return query.className + ':' + sections.join('|');
}

/**
 * contains -- Determines if an object is contained in a list with special handling for Parse pointers.
 */
function contains(haystack, needle) {
  if (needle && needle.__type && needle.__type === 'Pointer') {
    for (const i in haystack) {
      const ptr = haystack[i];
      if (typeof ptr === 'string' && ptr === needle.objectId) {
        return true;
      }
      if (ptr.className === needle.className && ptr.objectId === needle.objectId) {
        return true;
      }
    }
    return false;
  }
  if (Array.isArray(needle)) {
    for (const need of needle) {
      if (contains(haystack, need)) {
        return true;
      }
    }
  }
  return haystack.indexOf(needle) > -1;
}
/**
 * matchesQuery -- Determines if an object would be returned by a Parse Query
 * It's a lightweight, where-clause only implementation of a full query engine.
 * Since we find queries that match objects, rather than objects that match
 * queries, we can avoid building a full-blown query tool.
 */
function matchesQuery(object, query) {
  if (query instanceof Parse.Query) {
    var className = object.id instanceof Id ? object.id.className : object.className;
    if (className !== query.className) {
      return false;
    }
    return matchesQuery(object, query._where);
  }
  for (var field in query) {
    if (!matchesKeyConstraints(object, field, query[field])) {
      return false;
    }
  }
  return true;
}
function equalObjectsGeneric(obj, compareTo, eqlFn) {
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      if (eqlFn(obj[i], compareTo)) {
        return true;
      }
    }
    return false;
  }
  return eqlFn(obj, compareTo);
}

/**
 * Determines whether an object matches a single key's constraints
 */
function matchesKeyConstraints(object, key, constraints) {
  if (constraints === null) {
    return false;
  }
  if (key.indexOf('.') >= 0) {
    // Key references a subobject
    var keyComponents = key.split('.');
    var subObjectKey = keyComponents[0];
    var keyRemainder = keyComponents.slice(1).join('.');
    return matchesKeyConstraints(object[subObjectKey] || {}, keyRemainder, constraints);
  }
  var i;
  if (key === '$or') {
    for (i = 0; i < constraints.length; i++) {
      if (matchesQuery(object, constraints[i])) {
        return true;
      }
    }
    return false;
  }
  if (key === '$and') {
    for (i = 0; i < constraints.length; i++) {
      if (!matchesQuery(object, constraints[i])) {
        return false;
      }
    }
    return true;
  }
  if (key === '$nor') {
    for (i = 0; i < constraints.length; i++) {
      if (matchesQuery(object, constraints[i])) {
        return false;
      }
    }
    return true;
  }
  if (key === '$relatedTo') {
    // Bail! We can't handle relational queries locally
    return false;
  }
  // Decode Date JSON value
  if (object[key] && object[key].__type == 'Date') {
    object[key] = new Date(object[key].iso);
  }
  // Equality (or Array contains) cases
  if (typeof constraints !== 'object') {
    if (Array.isArray(object[key])) {
      return object[key].indexOf(constraints) > -1;
    }
    return object[key] === constraints;
  }
  var compareTo;
  if (constraints.__type) {
    if (constraints.__type === 'Pointer') {
      return equalObjectsGeneric(object[key], constraints, function (obj, ptr) {
        return typeof obj !== 'undefined' && ptr.className === obj.className && ptr.objectId === obj.objectId;
      });
    }
    return equalObjectsGeneric(object[key], Parse._decode(key, constraints), equalObjects);
  }
  // More complex cases
  for (var condition in constraints) {
    var _compareTo;
    compareTo = constraints[condition];
    if ((_compareTo = compareTo) !== null && _compareTo !== void 0 && _compareTo.__type) {
      compareTo = Parse._decode(key, compareTo);
    }
    switch (condition) {
      case '$lt':
        if (object[key] >= compareTo) {
          return false;
        }
        break;
      case '$lte':
        if (object[key] > compareTo) {
          return false;
        }
        break;
      case '$gt':
        if (object[key] <= compareTo) {
          return false;
        }
        break;
      case '$gte':
        if (object[key] < compareTo) {
          return false;
        }
        break;
      case '$eq':
        if (!equalObjects(object[key], compareTo)) {
          return false;
        }
        break;
      case '$ne':
        if (equalObjects(object[key], compareTo)) {
          return false;
        }
        break;
      case '$in':
        if (!contains(compareTo, object[key])) {
          return false;
        }
        break;
      case '$nin':
        if (contains(compareTo, object[key])) {
          return false;
        }
        break;
      case '$all':
        if (!object[key]) {
          return false;
        }
        for (i = 0; i < compareTo.length; i++) {
          if (object[key].indexOf(compareTo[i]) < 0) {
            return false;
          }
        }
        break;
      case '$exists':
        {
          const propertyExists = typeof object[key] !== 'undefined';
          const existenceIsRequired = constraints['$exists'];
          if (typeof constraints['$exists'] !== 'boolean') {
            // The SDK will never submit a non-boolean for $exists, but if someone
            // tries to submit a non-boolean for $exits outside the SDKs, just ignore it.
            break;
          }
          if (!propertyExists && existenceIsRequired || propertyExists && !existenceIsRequired) {
            return false;
          }
          break;
        }
      case '$regex':
        if (typeof compareTo === 'object') {
          return compareTo.test(object[key]);
        }
        // JS doesn't support perl-style escaping
        var expString = '';
        var escapeEnd = -2;
        var escapeStart = compareTo.indexOf('\\Q');
        while (escapeStart > -1) {
          // Add the unescaped portion
          expString += compareTo.substring(escapeEnd + 2, escapeStart);
          escapeEnd = compareTo.indexOf('\\E', escapeStart);
          if (escapeEnd > -1) {
            expString += compareTo.substring(escapeStart + 2, escapeEnd).replace(/\\\\\\\\E/g, '\\E').replace(/\W/g, '\\$&');
          }
          escapeStart = compareTo.indexOf('\\Q', escapeEnd);
        }
        expString += compareTo.substring(Math.max(escapeStart, escapeEnd + 2));
        var exp = new RegExp(expString, constraints.$options || '');
        if (!exp.test(object[key])) {
          return false;
        }
        break;
      case '$nearSphere':
        if (!compareTo || !object[key]) {
          return false;
        }
        var distance = compareTo.radiansTo(object[key]);
        var max = constraints.$maxDistance || Infinity;
        return distance <= max;
      case '$within':
        if (!compareTo || !object[key]) {
          return false;
        }
        var southWest = compareTo.$box[0];
        var northEast = compareTo.$box[1];
        if (southWest.latitude > northEast.latitude || southWest.longitude > northEast.longitude) {
          // Invalid box, crosses the date line
          return false;
        }
        return object[key].latitude > southWest.latitude && object[key].latitude < northEast.latitude && object[key].longitude > southWest.longitude && object[key].longitude < northEast.longitude;
      case '$containedBy':
        {
          for (const value of object[key]) {
            if (!contains(compareTo, value)) {
              return false;
            }
          }
          return true;
        }
      case '$geoWithin':
        {
          if (compareTo.$polygon) {
            const points = compareTo.$polygon.map(geoPoint => [geoPoint.latitude, geoPoint.longitude]);
            const polygon = new Parse.Polygon(points);
            return polygon.containsPoint(object[key]);
          }
          if (compareTo.$centerSphere) {
            const [WGS84Point, maxDistance] = compareTo.$centerSphere;
            const centerPoint = new Parse.GeoPoint({
              latitude: WGS84Point[1],
              longitude: WGS84Point[0]
            });
            const point = new Parse.GeoPoint(object[key]);
            const distance = point.radiansTo(centerPoint);
            return distance <= maxDistance;
          }
          break;
        }
      case '$geoIntersects':
        {
          const polygon = new Parse.Polygon(object[key].coordinates);
          const point = new Parse.GeoPoint(compareTo.$point);
          return polygon.containsPoint(point);
        }
      case '$options':
        // Not a query type, but a way to add options to $regex. Ignore and
        // avoid the default
        break;
      case '$maxDistance':
        // Not a query type, but a way to add a cap to $nearSphere. Ignore and
        // avoid the default
        break;
      case '$select':
        return false;
      case '$dontSelect':
        return false;
      default:
        return false;
    }
  }
  return true;
}
var QueryTools = {
  queryHash: queryHash,
  matchesQuery: matchesQuery
};
module.exports = QueryTools;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJlcXVhbE9iamVjdHMiLCJyZXF1aXJlIiwiSWQiLCJQYXJzZSIsImZsYXR0ZW5PclF1ZXJpZXMiLCJ3aGVyZSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImFjY3VtIiwiaSIsIiRvciIsImxlbmd0aCIsImNvbmNhdCIsInN0cmluZ2lmeSIsIm9iamVjdCIsInJlcGxhY2UiLCJBcnJheSIsImlzQXJyYXkiLCJjb3B5IiwibWFwIiwic29ydCIsImpvaW4iLCJzZWN0aW9ucyIsImtleXMiLCJrIiwicHVzaCIsInF1ZXJ5SGFzaCIsInF1ZXJ5IiwiUXVlcnkiLCJjbGFzc05hbWUiLCJfd2hlcmUiLCJjb2x1bW5zIiwidmFsdWVzIiwidW5pcXVlQ29sdW1ucyIsInN1YlZhbHVlcyIsImoiLCJjb250YWlucyIsImhheXN0YWNrIiwibmVlZGxlIiwiX190eXBlIiwicHRyIiwib2JqZWN0SWQiLCJuZWVkIiwiaW5kZXhPZiIsIm1hdGNoZXNRdWVyeSIsImlkIiwiZmllbGQiLCJtYXRjaGVzS2V5Q29uc3RyYWludHMiLCJlcXVhbE9iamVjdHNHZW5lcmljIiwib2JqIiwiY29tcGFyZVRvIiwiZXFsRm4iLCJrZXkiLCJjb25zdHJhaW50cyIsImtleUNvbXBvbmVudHMiLCJzcGxpdCIsInN1Yk9iamVjdEtleSIsImtleVJlbWFpbmRlciIsInNsaWNlIiwiRGF0ZSIsImlzbyIsIl9kZWNvZGUiLCJjb25kaXRpb24iLCJfY29tcGFyZVRvIiwicHJvcGVydHlFeGlzdHMiLCJleGlzdGVuY2VJc1JlcXVpcmVkIiwidGVzdCIsImV4cFN0cmluZyIsImVzY2FwZUVuZCIsImVzY2FwZVN0YXJ0Iiwic3Vic3RyaW5nIiwiTWF0aCIsIm1heCIsImV4cCIsIlJlZ0V4cCIsIiRvcHRpb25zIiwiZGlzdGFuY2UiLCJyYWRpYW5zVG8iLCIkbWF4RGlzdGFuY2UiLCJJbmZpbml0eSIsInNvdXRoV2VzdCIsIiRib3giLCJub3J0aEVhc3QiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsInZhbHVlIiwiJHBvbHlnb24iLCJwb2ludHMiLCJnZW9Qb2ludCIsInBvbHlnb24iLCJQb2x5Z29uIiwiY29udGFpbnNQb2ludCIsIiRjZW50ZXJTcGhlcmUiLCJXR1M4NFBvaW50IiwibWF4RGlzdGFuY2UiLCJjZW50ZXJQb2ludCIsIkdlb1BvaW50IiwicG9pbnQiLCJjb29yZGluYXRlcyIsIiRwb2ludCIsIlF1ZXJ5VG9vbHMiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0xpdmVRdWVyeS9RdWVyeVRvb2xzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbInZhciBlcXVhbE9iamVjdHMgPSByZXF1aXJlKCcuL2VxdWFsT2JqZWN0cycpO1xudmFyIElkID0gcmVxdWlyZSgnLi9JZCcpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuXG4vKipcbiAqIFF1ZXJ5IEhhc2hlcyBhcmUgZGV0ZXJtaW5pc3RpYyBoYXNoZXMgZm9yIFBhcnNlIFF1ZXJpZXMuXG4gKiBBbnkgdHdvIHF1ZXJpZXMgdGhhdCBoYXZlIHRoZSBzYW1lIHNldCBvZiBjb25zdHJhaW50cyB3aWxsIHByb2R1Y2UgdGhlIHNhbWVcbiAqIGhhc2guIFRoaXMgbGV0cyB1cyByZWxpYWJseSBncm91cCBjb21wb25lbnRzIGJ5IHRoZSBxdWVyaWVzIHRoZXkgZGVwZW5kIHVwb24sXG4gKiBhbmQgcXVpY2tseSBkZXRlcm1pbmUgaWYgYSBxdWVyeSBoYXMgY2hhbmdlZC5cbiAqL1xuXG4vKipcbiAqIENvbnZlcnQgJG9yIHF1ZXJpZXMgaW50byBhbiBhcnJheSBvZiB3aGVyZSBjb25kaXRpb25zXG4gKi9cbmZ1bmN0aW9uIGZsYXR0ZW5PclF1ZXJpZXMod2hlcmUpIHtcbiAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwod2hlcmUsICckb3InKSkge1xuICAgIHJldHVybiB3aGVyZTtcbiAgfVxuICB2YXIgYWNjdW0gPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB3aGVyZS4kb3IubGVuZ3RoOyBpKyspIHtcbiAgICBhY2N1bSA9IGFjY3VtLmNvbmNhdCh3aGVyZS4kb3JbaV0pO1xuICB9XG4gIHJldHVybiBhY2N1bTtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmlzdGljYWxseSB0dXJucyBhbiBvYmplY3QgaW50byBhIHN0cmluZy4gRGlzcmVnYXJkcyBvcmRlcmluZ1xuICovXG5mdW5jdGlvbiBzdHJpbmdpZnkob2JqZWN0KTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8IG9iamVjdCA9PT0gbnVsbCkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuICdcIicgKyBvYmplY3QucmVwbGFjZSgvXFx8L2csICclfCcpICsgJ1wiJztcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdCArICcnO1xuICB9XG4gIGlmIChBcnJheS5pc0FycmF5KG9iamVjdCkpIHtcbiAgICB2YXIgY29weSA9IG9iamVjdC5tYXAoc3RyaW5naWZ5KTtcbiAgICBjb3B5LnNvcnQoKTtcbiAgICByZXR1cm4gJ1snICsgY29weS5qb2luKCcsJykgKyAnXSc7XG4gIH1cbiAgdmFyIHNlY3Rpb25zID0gW107XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAga2V5cy5zb3J0KCk7XG4gIGZvciAodmFyIGsgPSAwOyBrIDwga2V5cy5sZW5ndGg7IGsrKykge1xuICAgIHNlY3Rpb25zLnB1c2goc3RyaW5naWZ5KGtleXNba10pICsgJzonICsgc3RyaW5naWZ5KG9iamVjdFtrZXlzW2tdXSkpO1xuICB9XG4gIHJldHVybiAneycgKyBzZWN0aW9ucy5qb2luKCcsJykgKyAnfSc7XG59XG5cbi8qKlxuICogR2VuZXJhdGUgYSBoYXNoIGZyb20gYSBxdWVyeSwgd2l0aCB1bmlxdWUgZmllbGRzIGZvciBjb2x1bW5zLCB2YWx1ZXMsIG9yZGVyLFxuICogc2tpcCwgYW5kIGxpbWl0LlxuICovXG5mdW5jdGlvbiBxdWVyeUhhc2gocXVlcnkpIHtcbiAgaWYgKHF1ZXJ5IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICBxdWVyeSA9IHtcbiAgICAgIGNsYXNzTmFtZTogcXVlcnkuY2xhc3NOYW1lLFxuICAgICAgd2hlcmU6IHF1ZXJ5Ll93aGVyZSxcbiAgICB9O1xuICB9XG4gIHZhciB3aGVyZSA9IGZsYXR0ZW5PclF1ZXJpZXMocXVlcnkud2hlcmUgfHwge30pO1xuICB2YXIgY29sdW1ucyA9IFtdO1xuICB2YXIgdmFsdWVzID0gW107XG4gIHZhciBpO1xuICBpZiAoQXJyYXkuaXNBcnJheSh3aGVyZSkpIHtcbiAgICB2YXIgdW5pcXVlQ29sdW1ucyA9IHt9O1xuICAgIGZvciAoaSA9IDA7IGkgPCB3aGVyZS5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHN1YlZhbHVlcyA9IHt9O1xuICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh3aGVyZVtpXSk7XG4gICAgICBrZXlzLnNvcnQoKTtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwga2V5cy5sZW5ndGg7IGorKykge1xuICAgICAgICBzdWJWYWx1ZXNba2V5c1tqXV0gPSB3aGVyZVtpXVtrZXlzW2pdXTtcbiAgICAgICAgdW5pcXVlQ29sdW1uc1trZXlzW2pdXSA9IHRydWU7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChzdWJWYWx1ZXMpO1xuICAgIH1cbiAgICBjb2x1bW5zID0gT2JqZWN0LmtleXModW5pcXVlQ29sdW1ucyk7XG4gICAgY29sdW1ucy5zb3J0KCk7XG4gIH0gZWxzZSB7XG4gICAgY29sdW1ucyA9IE9iamVjdC5rZXlzKHdoZXJlKTtcbiAgICBjb2x1bW5zLnNvcnQoKTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29sdW1ucy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFsdWVzLnB1c2god2hlcmVbY29sdW1uc1tpXV0pO1xuICAgIH1cbiAgfVxuXG4gIHZhciBzZWN0aW9ucyA9IFtjb2x1bW5zLmpvaW4oJywnKSwgc3RyaW5naWZ5KHZhbHVlcyldO1xuXG4gIHJldHVybiBxdWVyeS5jbGFzc05hbWUgKyAnOicgKyBzZWN0aW9ucy5qb2luKCd8Jyk7XG59XG5cbi8qKlxuICogY29udGFpbnMgLS0gRGV0ZXJtaW5lcyBpZiBhbiBvYmplY3QgaXMgY29udGFpbmVkIGluIGEgbGlzdCB3aXRoIHNwZWNpYWwgaGFuZGxpbmcgZm9yIFBhcnNlIHBvaW50ZXJzLlxuICovXG5mdW5jdGlvbiBjb250YWlucyhoYXlzdGFjazogQXJyYXksIG5lZWRsZTogYW55KTogYm9vbGVhbiB7XG4gIGlmIChuZWVkbGUgJiYgbmVlZGxlLl9fdHlwZSAmJiBuZWVkbGUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICBmb3IgKGNvbnN0IGkgaW4gaGF5c3RhY2spIHtcbiAgICAgIGNvbnN0IHB0ciA9IGhheXN0YWNrW2ldO1xuICAgICAgaWYgKHR5cGVvZiBwdHIgPT09ICdzdHJpbmcnICYmIHB0ciA9PT0gbmVlZGxlLm9iamVjdElkKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKHB0ci5jbGFzc05hbWUgPT09IG5lZWRsZS5jbGFzc05hbWUgJiYgcHRyLm9iamVjdElkID09PSBuZWVkbGUub2JqZWN0SWQpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKEFycmF5LmlzQXJyYXkobmVlZGxlKSkge1xuICAgIGZvciAoY29uc3QgbmVlZCBvZiBuZWVkbGUpIHtcbiAgICAgIGlmIChjb250YWlucyhoYXlzdGFjaywgbmVlZCkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGhheXN0YWNrLmluZGV4T2YobmVlZGxlKSA+IC0xO1xufVxuLyoqXG4gKiBtYXRjaGVzUXVlcnkgLS0gRGV0ZXJtaW5lcyBpZiBhbiBvYmplY3Qgd291bGQgYmUgcmV0dXJuZWQgYnkgYSBQYXJzZSBRdWVyeVxuICogSXQncyBhIGxpZ2h0d2VpZ2h0LCB3aGVyZS1jbGF1c2Ugb25seSBpbXBsZW1lbnRhdGlvbiBvZiBhIGZ1bGwgcXVlcnkgZW5naW5lLlxuICogU2luY2Ugd2UgZmluZCBxdWVyaWVzIHRoYXQgbWF0Y2ggb2JqZWN0cywgcmF0aGVyIHRoYW4gb2JqZWN0cyB0aGF0IG1hdGNoXG4gKiBxdWVyaWVzLCB3ZSBjYW4gYXZvaWQgYnVpbGRpbmcgYSBmdWxsLWJsb3duIHF1ZXJ5IHRvb2wuXG4gKi9cbmZ1bmN0aW9uIG1hdGNoZXNRdWVyeShvYmplY3Q6IGFueSwgcXVlcnk6IGFueSk6IGJvb2xlYW4ge1xuICBpZiAocXVlcnkgaW5zdGFuY2VvZiBQYXJzZS5RdWVyeSkge1xuICAgIHZhciBjbGFzc05hbWUgPSBvYmplY3QuaWQgaW5zdGFuY2VvZiBJZCA/IG9iamVjdC5pZC5jbGFzc05hbWUgOiBvYmplY3QuY2xhc3NOYW1lO1xuICAgIGlmIChjbGFzc05hbWUgIT09IHF1ZXJ5LmNsYXNzTmFtZSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KG9iamVjdCwgcXVlcnkuX3doZXJlKTtcbiAgfVxuICBmb3IgKHZhciBmaWVsZCBpbiBxdWVyeSkge1xuICAgIGlmICghbWF0Y2hlc0tleUNvbnN0cmFpbnRzKG9iamVjdCwgZmllbGQsIHF1ZXJ5W2ZpZWxkXSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVxdWFsT2JqZWN0c0dlbmVyaWMob2JqLCBjb21wYXJlVG8sIGVxbEZuKSB7XG4gIGlmIChBcnJheS5pc0FycmF5KG9iaikpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG9iai5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGVxbEZuKG9ialtpXSwgY29tcGFyZVRvKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIGVxbEZuKG9iaiwgY29tcGFyZVRvKTtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmVzIHdoZXRoZXIgYW4gb2JqZWN0IG1hdGNoZXMgYSBzaW5nbGUga2V5J3MgY29uc3RyYWludHNcbiAqL1xuZnVuY3Rpb24gbWF0Y2hlc0tleUNvbnN0cmFpbnRzKG9iamVjdCwga2V5LCBjb25zdHJhaW50cykge1xuICBpZiAoY29uc3RyYWludHMgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGtleS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgIC8vIEtleSByZWZlcmVuY2VzIGEgc3Vib2JqZWN0XG4gICAgdmFyIGtleUNvbXBvbmVudHMgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICB2YXIgc3ViT2JqZWN0S2V5ID0ga2V5Q29tcG9uZW50c1swXTtcbiAgICB2YXIga2V5UmVtYWluZGVyID0ga2V5Q29tcG9uZW50cy5zbGljZSgxKS5qb2luKCcuJyk7XG4gICAgcmV0dXJuIG1hdGNoZXNLZXlDb25zdHJhaW50cyhvYmplY3Rbc3ViT2JqZWN0S2V5XSB8fCB7fSwga2V5UmVtYWluZGVyLCBjb25zdHJhaW50cyk7XG4gIH1cbiAgdmFyIGk7XG4gIGlmIChrZXkgPT09ICckb3InKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbnN0cmFpbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAobWF0Y2hlc1F1ZXJ5KG9iamVjdCwgY29uc3RyYWludHNbaV0pKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGtleSA9PT0gJyRhbmQnKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbnN0cmFpbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoIW1hdGNoZXNRdWVyeShvYmplY3QsIGNvbnN0cmFpbnRzW2ldKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGlmIChrZXkgPT09ICckbm9yJykge1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb25zdHJhaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKG1hdGNoZXNRdWVyeShvYmplY3QsIGNvbnN0cmFpbnRzW2ldKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGlmIChrZXkgPT09ICckcmVsYXRlZFRvJykge1xuICAgIC8vIEJhaWwhIFdlIGNhbid0IGhhbmRsZSByZWxhdGlvbmFsIHF1ZXJpZXMgbG9jYWxseVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBEZWNvZGUgRGF0ZSBKU09OIHZhbHVlXG4gIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgb2JqZWN0W2tleV0gPSBuZXcgRGF0ZShvYmplY3Rba2V5XS5pc28pO1xuICB9XG4gIC8vIEVxdWFsaXR5IChvciBBcnJheSBjb250YWlucykgY2FzZXNcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50cyAhPT0gJ29iamVjdCcpIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShvYmplY3Rba2V5XSkpIHtcbiAgICAgIHJldHVybiBvYmplY3Rba2V5XS5pbmRleE9mKGNvbnN0cmFpbnRzKSA+IC0xO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0W2tleV0gPT09IGNvbnN0cmFpbnRzO1xuICB9XG4gIHZhciBjb21wYXJlVG87XG4gIGlmIChjb25zdHJhaW50cy5fX3R5cGUpIHtcbiAgICBpZiAoY29uc3RyYWludHMuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiBlcXVhbE9iamVjdHNHZW5lcmljKG9iamVjdFtrZXldLCBjb25zdHJhaW50cywgZnVuY3Rpb24gKG9iaiwgcHRyKSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgdHlwZW9mIG9iaiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICBwdHIuY2xhc3NOYW1lID09PSBvYmouY2xhc3NOYW1lICYmXG4gICAgICAgICAgcHRyLm9iamVjdElkID09PSBvYmoub2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBlcXVhbE9iamVjdHNHZW5lcmljKG9iamVjdFtrZXldLCBQYXJzZS5fZGVjb2RlKGtleSwgY29uc3RyYWludHMpLCBlcXVhbE9iamVjdHMpO1xuICB9XG4gIC8vIE1vcmUgY29tcGxleCBjYXNlc1xuICBmb3IgKHZhciBjb25kaXRpb24gaW4gY29uc3RyYWludHMpIHtcbiAgICBjb21wYXJlVG8gPSBjb25zdHJhaW50c1tjb25kaXRpb25dO1xuICAgIGlmIChjb21wYXJlVG8/Ll9fdHlwZSkge1xuICAgICAgY29tcGFyZVRvID0gUGFyc2UuX2RlY29kZShrZXksIGNvbXBhcmVUbyk7XG4gICAgfVxuICAgIHN3aXRjaCAoY29uZGl0aW9uKSB7XG4gICAgICBjYXNlICckbHQnOlxuICAgICAgICBpZiAob2JqZWN0W2tleV0gPj0gY29tcGFyZVRvKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGx0ZSc6XG4gICAgICAgIGlmIChvYmplY3Rba2V5XSA+IGNvbXBhcmVUbykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRndCc6XG4gICAgICAgIGlmIChvYmplY3Rba2V5XSA8PSBjb21wYXJlVG8pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckZ3RlJzpcbiAgICAgICAgaWYgKG9iamVjdFtrZXldIDwgY29tcGFyZVRvKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGVxJzpcbiAgICAgICAgaWYgKCFlcXVhbE9iamVjdHMob2JqZWN0W2tleV0sIGNvbXBhcmVUbykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbmUnOlxuICAgICAgICBpZiAoZXF1YWxPYmplY3RzKG9iamVjdFtrZXldLCBjb21wYXJlVG8pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGluJzpcbiAgICAgICAgaWYgKCFjb250YWlucyhjb21wYXJlVG8sIG9iamVjdFtrZXldKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRuaW4nOlxuICAgICAgICBpZiAoY29udGFpbnMoY29tcGFyZVRvLCBvYmplY3Rba2V5XSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckYWxsJzpcbiAgICAgICAgaWYgKCFvYmplY3Rba2V5XSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29tcGFyZVRvLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtrZXldLmluZGV4T2YoY29tcGFyZVRvW2ldKSA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckZXhpc3RzJzoge1xuICAgICAgICBjb25zdCBwcm9wZXJ0eUV4aXN0cyA9IHR5cGVvZiBvYmplY3Rba2V5XSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgICAgIGNvbnN0IGV4aXN0ZW5jZUlzUmVxdWlyZWQgPSBjb25zdHJhaW50c1snJGV4aXN0cyddO1xuICAgICAgICBpZiAodHlwZW9mIGNvbnN0cmFpbnRzWyckZXhpc3RzJ10gIT09ICdib29sZWFuJykge1xuICAgICAgICAgIC8vIFRoZSBTREsgd2lsbCBuZXZlciBzdWJtaXQgYSBub24tYm9vbGVhbiBmb3IgJGV4aXN0cywgYnV0IGlmIHNvbWVvbmVcbiAgICAgICAgICAvLyB0cmllcyB0byBzdWJtaXQgYSBub24tYm9vbGVhbiBmb3IgJGV4aXRzIG91dHNpZGUgdGhlIFNES3MsIGp1c3QgaWdub3JlIGl0LlxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGlmICgoIXByb3BlcnR5RXhpc3RzICYmIGV4aXN0ZW5jZUlzUmVxdWlyZWQpIHx8IChwcm9wZXJ0eUV4aXN0cyAmJiAhZXhpc3RlbmNlSXNSZXF1aXJlZCkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckcmVnZXgnOlxuICAgICAgICBpZiAodHlwZW9mIGNvbXBhcmVUbyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICByZXR1cm4gY29tcGFyZVRvLnRlc3Qob2JqZWN0W2tleV0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIEpTIGRvZXNuJ3Qgc3VwcG9ydCBwZXJsLXN0eWxlIGVzY2FwaW5nXG4gICAgICAgIHZhciBleHBTdHJpbmcgPSAnJztcbiAgICAgICAgdmFyIGVzY2FwZUVuZCA9IC0yO1xuICAgICAgICB2YXIgZXNjYXBlU3RhcnQgPSBjb21wYXJlVG8uaW5kZXhPZignXFxcXFEnKTtcbiAgICAgICAgd2hpbGUgKGVzY2FwZVN0YXJ0ID4gLTEpIHtcbiAgICAgICAgICAvLyBBZGQgdGhlIHVuZXNjYXBlZCBwb3J0aW9uXG4gICAgICAgICAgZXhwU3RyaW5nICs9IGNvbXBhcmVUby5zdWJzdHJpbmcoZXNjYXBlRW5kICsgMiwgZXNjYXBlU3RhcnQpO1xuICAgICAgICAgIGVzY2FwZUVuZCA9IGNvbXBhcmVUby5pbmRleE9mKCdcXFxcRScsIGVzY2FwZVN0YXJ0KTtcbiAgICAgICAgICBpZiAoZXNjYXBlRW5kID4gLTEpIHtcbiAgICAgICAgICAgIGV4cFN0cmluZyArPSBjb21wYXJlVG9cbiAgICAgICAgICAgICAgLnN1YnN0cmluZyhlc2NhcGVTdGFydCArIDIsIGVzY2FwZUVuZClcbiAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcXFxcXFxcXFxcXFxFL2csICdcXFxcRScpXG4gICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFcvZywgJ1xcXFwkJicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGVzY2FwZVN0YXJ0ID0gY29tcGFyZVRvLmluZGV4T2YoJ1xcXFxRJywgZXNjYXBlRW5kKTtcbiAgICAgICAgfVxuICAgICAgICBleHBTdHJpbmcgKz0gY29tcGFyZVRvLnN1YnN0cmluZyhNYXRoLm1heChlc2NhcGVTdGFydCwgZXNjYXBlRW5kICsgMikpO1xuICAgICAgICB2YXIgZXhwID0gbmV3IFJlZ0V4cChleHBTdHJpbmcsIGNvbnN0cmFpbnRzLiRvcHRpb25zIHx8ICcnKTtcbiAgICAgICAgaWYgKCFleHAudGVzdChvYmplY3Rba2V5XSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbmVhclNwaGVyZSc6XG4gICAgICAgIGlmICghY29tcGFyZVRvIHx8ICFvYmplY3Rba2V5XSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgZGlzdGFuY2UgPSBjb21wYXJlVG8ucmFkaWFuc1RvKG9iamVjdFtrZXldKTtcbiAgICAgICAgdmFyIG1heCA9IGNvbnN0cmFpbnRzLiRtYXhEaXN0YW5jZSB8fCBJbmZpbml0eTtcbiAgICAgICAgcmV0dXJuIGRpc3RhbmNlIDw9IG1heDtcbiAgICAgIGNhc2UgJyR3aXRoaW4nOlxuICAgICAgICBpZiAoIWNvbXBhcmVUbyB8fCAhb2JqZWN0W2tleV0pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNvdXRoV2VzdCA9IGNvbXBhcmVUby4kYm94WzBdO1xuICAgICAgICB2YXIgbm9ydGhFYXN0ID0gY29tcGFyZVRvLiRib3hbMV07XG4gICAgICAgIGlmIChzb3V0aFdlc3QubGF0aXR1ZGUgPiBub3J0aEVhc3QubGF0aXR1ZGUgfHwgc291dGhXZXN0LmxvbmdpdHVkZSA+IG5vcnRoRWFzdC5sb25naXR1ZGUpIHtcbiAgICAgICAgICAvLyBJbnZhbGlkIGJveCwgY3Jvc3NlcyB0aGUgZGF0ZSBsaW5lXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgb2JqZWN0W2tleV0ubGF0aXR1ZGUgPiBzb3V0aFdlc3QubGF0aXR1ZGUgJiZcbiAgICAgICAgICBvYmplY3Rba2V5XS5sYXRpdHVkZSA8IG5vcnRoRWFzdC5sYXRpdHVkZSAmJlxuICAgICAgICAgIG9iamVjdFtrZXldLmxvbmdpdHVkZSA+IHNvdXRoV2VzdC5sb25naXR1ZGUgJiZcbiAgICAgICAgICBvYmplY3Rba2V5XS5sb25naXR1ZGUgPCBub3J0aEVhc3QubG9uZ2l0dWRlXG4gICAgICAgICk7XG4gICAgICBjYXNlICckY29udGFpbmVkQnknOiB7XG4gICAgICAgIGZvciAoY29uc3QgdmFsdWUgb2Ygb2JqZWN0W2tleV0pIHtcbiAgICAgICAgICBpZiAoIWNvbnRhaW5zKGNvbXBhcmVUbywgdmFsdWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb1dpdGhpbic6IHtcbiAgICAgICAgaWYgKGNvbXBhcmVUby4kcG9seWdvbikge1xuICAgICAgICAgIGNvbnN0IHBvaW50cyA9IGNvbXBhcmVUby4kcG9seWdvbi5tYXAoZ2VvUG9pbnQgPT4gW1xuICAgICAgICAgICAgZ2VvUG9pbnQubGF0aXR1ZGUsXG4gICAgICAgICAgICBnZW9Qb2ludC5sb25naXR1ZGUsXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgY29uc3QgcG9seWdvbiA9IG5ldyBQYXJzZS5Qb2x5Z29uKHBvaW50cyk7XG4gICAgICAgICAgcmV0dXJuIHBvbHlnb24uY29udGFpbnNQb2ludChvYmplY3Rba2V5XSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbXBhcmVUby4kY2VudGVyU3BoZXJlKSB7XG4gICAgICAgICAgY29uc3QgW1dHUzg0UG9pbnQsIG1heERpc3RhbmNlXSA9IGNvbXBhcmVUby4kY2VudGVyU3BoZXJlO1xuICAgICAgICAgIGNvbnN0IGNlbnRlclBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHtcbiAgICAgICAgICAgIGxhdGl0dWRlOiBXR1M4NFBvaW50WzFdLFxuICAgICAgICAgICAgbG9uZ2l0dWRlOiBXR1M4NFBvaW50WzBdLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvbnN0IHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KG9iamVjdFtrZXldKTtcbiAgICAgICAgICBjb25zdCBkaXN0YW5jZSA9IHBvaW50LnJhZGlhbnNUbyhjZW50ZXJQb2ludCk7XG4gICAgICAgICAgcmV0dXJuIGRpc3RhbmNlIDw9IG1heERpc3RhbmNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb0ludGVyc2VjdHMnOiB7XG4gICAgICAgIGNvbnN0IHBvbHlnb24gPSBuZXcgUGFyc2UuUG9seWdvbihvYmplY3Rba2V5XS5jb29yZGluYXRlcyk7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KGNvbXBhcmVUby4kcG9pbnQpO1xuICAgICAgICByZXR1cm4gcG9seWdvbi5jb250YWluc1BvaW50KHBvaW50KTtcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRvcHRpb25zJzpcbiAgICAgICAgLy8gTm90IGEgcXVlcnkgdHlwZSwgYnV0IGEgd2F5IHRvIGFkZCBvcHRpb25zIHRvICRyZWdleC4gSWdub3JlIGFuZFxuICAgICAgICAvLyBhdm9pZCB0aGUgZGVmYXVsdFxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZSc6XG4gICAgICAgIC8vIE5vdCBhIHF1ZXJ5IHR5cGUsIGJ1dCBhIHdheSB0byBhZGQgYSBjYXAgdG8gJG5lYXJTcGhlcmUuIElnbm9yZSBhbmRcbiAgICAgICAgLy8gYXZvaWQgdGhlIGRlZmF1bHRcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckc2VsZWN0JzpcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgY2FzZSAnJGRvbnRTZWxlY3QnOlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG52YXIgUXVlcnlUb29scyA9IHtcbiAgcXVlcnlIYXNoOiBxdWVyeUhhc2gsXG4gIG1hdGNoZXNRdWVyeTogbWF0Y2hlc1F1ZXJ5LFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBRdWVyeVRvb2xzO1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQUlBLFlBQVksR0FBR0MsT0FBTyxDQUFDLGdCQUFnQixDQUFDO0FBQzVDLElBQUlDLEVBQUUsR0FBR0QsT0FBTyxDQUFDLE1BQU0sQ0FBQztBQUN4QixJQUFJRSxLQUFLLEdBQUdGLE9BQU8sQ0FBQyxZQUFZLENBQUM7O0FBRWpDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxTQUFTRyxnQkFBZ0JBLENBQUNDLEtBQUssRUFBRTtFQUMvQixJQUFJLENBQUNDLE1BQU0sQ0FBQ0MsU0FBUyxDQUFDQyxjQUFjLENBQUNDLElBQUksQ0FBQ0osS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFO0lBQ3ZELE9BQU9BLEtBQUs7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