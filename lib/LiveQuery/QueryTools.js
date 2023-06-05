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
    compareTo = constraints[condition];
    if (compareTo.__type) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJlcXVhbE9iamVjdHMiLCJyZXF1aXJlIiwiSWQiLCJQYXJzZSIsImZsYXR0ZW5PclF1ZXJpZXMiLCJ3aGVyZSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImFjY3VtIiwiaSIsIiRvciIsImxlbmd0aCIsImNvbmNhdCIsInN0cmluZ2lmeSIsIm9iamVjdCIsInJlcGxhY2UiLCJBcnJheSIsImlzQXJyYXkiLCJjb3B5IiwibWFwIiwic29ydCIsImpvaW4iLCJzZWN0aW9ucyIsImtleXMiLCJrIiwicHVzaCIsInF1ZXJ5SGFzaCIsInF1ZXJ5IiwiUXVlcnkiLCJjbGFzc05hbWUiLCJfd2hlcmUiLCJjb2x1bW5zIiwidmFsdWVzIiwidW5pcXVlQ29sdW1ucyIsInN1YlZhbHVlcyIsImoiLCJjb250YWlucyIsImhheXN0YWNrIiwibmVlZGxlIiwiX190eXBlIiwicHRyIiwib2JqZWN0SWQiLCJuZWVkIiwiaW5kZXhPZiIsIm1hdGNoZXNRdWVyeSIsImlkIiwiZmllbGQiLCJtYXRjaGVzS2V5Q29uc3RyYWludHMiLCJlcXVhbE9iamVjdHNHZW5lcmljIiwib2JqIiwiY29tcGFyZVRvIiwiZXFsRm4iLCJrZXkiLCJjb25zdHJhaW50cyIsImtleUNvbXBvbmVudHMiLCJzcGxpdCIsInN1Yk9iamVjdEtleSIsImtleVJlbWFpbmRlciIsInNsaWNlIiwiRGF0ZSIsImlzbyIsIl9kZWNvZGUiLCJjb25kaXRpb24iLCJwcm9wZXJ0eUV4aXN0cyIsImV4aXN0ZW5jZUlzUmVxdWlyZWQiLCJ0ZXN0IiwiZXhwU3RyaW5nIiwiZXNjYXBlRW5kIiwiZXNjYXBlU3RhcnQiLCJzdWJzdHJpbmciLCJNYXRoIiwibWF4IiwiZXhwIiwiUmVnRXhwIiwiJG9wdGlvbnMiLCJkaXN0YW5jZSIsInJhZGlhbnNUbyIsIiRtYXhEaXN0YW5jZSIsIkluZmluaXR5Iiwic291dGhXZXN0IiwiJGJveCIsIm5vcnRoRWFzdCIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwidmFsdWUiLCIkcG9seWdvbiIsInBvaW50cyIsImdlb1BvaW50IiwicG9seWdvbiIsIlBvbHlnb24iLCJjb250YWluc1BvaW50IiwiJGNlbnRlclNwaGVyZSIsIldHUzg0UG9pbnQiLCJtYXhEaXN0YW5jZSIsImNlbnRlclBvaW50IiwiR2VvUG9pbnQiLCJwb2ludCIsImNvb3JkaW5hdGVzIiwiJHBvaW50IiwiUXVlcnlUb29scyIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1F1ZXJ5VG9vbHMuanMiXSwic291cmNlc0NvbnRlbnQiOlsidmFyIGVxdWFsT2JqZWN0cyA9IHJlcXVpcmUoJy4vZXF1YWxPYmplY3RzJyk7XG52YXIgSWQgPSByZXF1aXJlKCcuL0lkJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5cbi8qKlxuICogUXVlcnkgSGFzaGVzIGFyZSBkZXRlcm1pbmlzdGljIGhhc2hlcyBmb3IgUGFyc2UgUXVlcmllcy5cbiAqIEFueSB0d28gcXVlcmllcyB0aGF0IGhhdmUgdGhlIHNhbWUgc2V0IG9mIGNvbnN0cmFpbnRzIHdpbGwgcHJvZHVjZSB0aGUgc2FtZVxuICogaGFzaC4gVGhpcyBsZXRzIHVzIHJlbGlhYmx5IGdyb3VwIGNvbXBvbmVudHMgYnkgdGhlIHF1ZXJpZXMgdGhleSBkZXBlbmQgdXBvbixcbiAqIGFuZCBxdWlja2x5IGRldGVybWluZSBpZiBhIHF1ZXJ5IGhhcyBjaGFuZ2VkLlxuICovXG5cbi8qKlxuICogQ29udmVydCAkb3IgcXVlcmllcyBpbnRvIGFuIGFycmF5IG9mIHdoZXJlIGNvbmRpdGlvbnNcbiAqL1xuZnVuY3Rpb24gZmxhdHRlbk9yUXVlcmllcyh3aGVyZSkge1xuICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh3aGVyZSwgJyRvcicpKSB7XG4gICAgcmV0dXJuIHdoZXJlO1xuICB9XG4gIHZhciBhY2N1bSA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHdoZXJlLiRvci5sZW5ndGg7IGkrKykge1xuICAgIGFjY3VtID0gYWNjdW0uY29uY2F0KHdoZXJlLiRvcltpXSk7XG4gIH1cbiAgcmV0dXJuIGFjY3VtO1xufVxuXG4vKipcbiAqIERldGVybWluaXN0aWNhbGx5IHR1cm5zIGFuIG9iamVjdCBpbnRvIGEgc3RyaW5nLiBEaXNyZWdhcmRzIG9yZGVyaW5nXG4gKi9cbmZ1bmN0aW9uIHN0cmluZ2lmeShvYmplY3QpOiBzdHJpbmcge1xuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgb2JqZWN0ID09PSBudWxsKSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gJ1wiJyArIG9iamVjdC5yZXBsYWNlKC9cXHwvZywgJyV8JykgKyAnXCInO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0ICsgJyc7XG4gIH1cbiAgaWYgKEFycmF5LmlzQXJyYXkob2JqZWN0KSkge1xuICAgIHZhciBjb3B5ID0gb2JqZWN0Lm1hcChzdHJpbmdpZnkpO1xuICAgIGNvcHkuc29ydCgpO1xuICAgIHJldHVybiAnWycgKyBjb3B5LmpvaW4oJywnKSArICddJztcbiAgfVxuICB2YXIgc2VjdGlvbnMgPSBbXTtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICBrZXlzLnNvcnQoKTtcbiAgZm9yICh2YXIgayA9IDA7IGsgPCBrZXlzLmxlbmd0aDsgaysrKSB7XG4gICAgc2VjdGlvbnMucHVzaChzdHJpbmdpZnkoa2V5c1trXSkgKyAnOicgKyBzdHJpbmdpZnkob2JqZWN0W2tleXNba11dKSk7XG4gIH1cbiAgcmV0dXJuICd7JyArIHNlY3Rpb25zLmpvaW4oJywnKSArICd9Jztcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhIGhhc2ggZnJvbSBhIHF1ZXJ5LCB3aXRoIHVuaXF1ZSBmaWVsZHMgZm9yIGNvbHVtbnMsIHZhbHVlcywgb3JkZXIsXG4gKiBza2lwLCBhbmQgbGltaXQuXG4gKi9cbmZ1bmN0aW9uIHF1ZXJ5SGFzaChxdWVyeSkge1xuICBpZiAocXVlcnkgaW5zdGFuY2VvZiBQYXJzZS5RdWVyeSkge1xuICAgIHF1ZXJ5ID0ge1xuICAgICAgY2xhc3NOYW1lOiBxdWVyeS5jbGFzc05hbWUsXG4gICAgICB3aGVyZTogcXVlcnkuX3doZXJlLFxuICAgIH07XG4gIH1cbiAgdmFyIHdoZXJlID0gZmxhdHRlbk9yUXVlcmllcyhxdWVyeS53aGVyZSB8fCB7fSk7XG4gIHZhciBjb2x1bW5zID0gW107XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgdmFyIGk7XG4gIGlmIChBcnJheS5pc0FycmF5KHdoZXJlKSkge1xuICAgIHZhciB1bmlxdWVDb2x1bW5zID0ge307XG4gICAgZm9yIChpID0gMDsgaSA8IHdoZXJlLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgc3ViVmFsdWVzID0ge307XG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHdoZXJlW2ldKTtcbiAgICAgIGtleXMuc29ydCgpO1xuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBrZXlzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIHN1YlZhbHVlc1trZXlzW2pdXSA9IHdoZXJlW2ldW2tleXNbal1dO1xuICAgICAgICB1bmlxdWVDb2x1bW5zW2tleXNbal1dID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKHN1YlZhbHVlcyk7XG4gICAgfVxuICAgIGNvbHVtbnMgPSBPYmplY3Qua2V5cyh1bmlxdWVDb2x1bW5zKTtcbiAgICBjb2x1bW5zLnNvcnQoKTtcbiAgfSBlbHNlIHtcbiAgICBjb2x1bW5zID0gT2JqZWN0LmtleXMod2hlcmUpO1xuICAgIGNvbHVtbnMuc29ydCgpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBjb2x1bW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YWx1ZXMucHVzaCh3aGVyZVtjb2x1bW5zW2ldXSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIHNlY3Rpb25zID0gW2NvbHVtbnMuam9pbignLCcpLCBzdHJpbmdpZnkodmFsdWVzKV07XG5cbiAgcmV0dXJuIHF1ZXJ5LmNsYXNzTmFtZSArICc6JyArIHNlY3Rpb25zLmpvaW4oJ3wnKTtcbn1cblxuLyoqXG4gKiBjb250YWlucyAtLSBEZXRlcm1pbmVzIGlmIGFuIG9iamVjdCBpcyBjb250YWluZWQgaW4gYSBsaXN0IHdpdGggc3BlY2lhbCBoYW5kbGluZyBmb3IgUGFyc2UgcG9pbnRlcnMuXG4gKi9cbmZ1bmN0aW9uIGNvbnRhaW5zKGhheXN0YWNrOiBBcnJheSwgbmVlZGxlOiBhbnkpOiBib29sZWFuIHtcbiAgaWYgKG5lZWRsZSAmJiBuZWVkbGUuX190eXBlICYmIG5lZWRsZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIGZvciAoY29uc3QgaSBpbiBoYXlzdGFjaykge1xuICAgICAgY29uc3QgcHRyID0gaGF5c3RhY2tbaV07XG4gICAgICBpZiAodHlwZW9mIHB0ciA9PT0gJ3N0cmluZycgJiYgcHRyID09PSBuZWVkbGUub2JqZWN0SWQpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICBpZiAocHRyLmNsYXNzTmFtZSA9PT0gbmVlZGxlLmNsYXNzTmFtZSAmJiBwdHIub2JqZWN0SWQgPT09IG5lZWRsZS5vYmplY3RJZCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoQXJyYXkuaXNBcnJheShuZWVkbGUpKSB7XG4gICAgZm9yIChjb25zdCBuZWVkIG9mIG5lZWRsZSkge1xuICAgICAgaWYgKGNvbnRhaW5zKGhheXN0YWNrLCBuZWVkKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUpID4gLTE7XG59XG4vKipcbiAqIG1hdGNoZXNRdWVyeSAtLSBEZXRlcm1pbmVzIGlmIGFuIG9iamVjdCB3b3VsZCBiZSByZXR1cm5lZCBieSBhIFBhcnNlIFF1ZXJ5XG4gKiBJdCdzIGEgbGlnaHR3ZWlnaHQsIHdoZXJlLWNsYXVzZSBvbmx5IGltcGxlbWVudGF0aW9uIG9mIGEgZnVsbCBxdWVyeSBlbmdpbmUuXG4gKiBTaW5jZSB3ZSBmaW5kIHF1ZXJpZXMgdGhhdCBtYXRjaCBvYmplY3RzLCByYXRoZXIgdGhhbiBvYmplY3RzIHRoYXQgbWF0Y2hcbiAqIHF1ZXJpZXMsIHdlIGNhbiBhdm9pZCBidWlsZGluZyBhIGZ1bGwtYmxvd24gcXVlcnkgdG9vbC5cbiAqL1xuZnVuY3Rpb24gbWF0Y2hlc1F1ZXJ5KG9iamVjdDogYW55LCBxdWVyeTogYW55KTogYm9vbGVhbiB7XG4gIGlmIChxdWVyeSBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgdmFyIGNsYXNzTmFtZSA9IG9iamVjdC5pZCBpbnN0YW5jZW9mIElkID8gb2JqZWN0LmlkLmNsYXNzTmFtZSA6IG9iamVjdC5jbGFzc05hbWU7XG4gICAgaWYgKGNsYXNzTmFtZSAhPT0gcXVlcnkuY2xhc3NOYW1lKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzUXVlcnkob2JqZWN0LCBxdWVyeS5fd2hlcmUpO1xuICB9XG4gIGZvciAodmFyIGZpZWxkIGluIHF1ZXJ5KSB7XG4gICAgaWYgKCFtYXRjaGVzS2V5Q29uc3RyYWludHMob2JqZWN0LCBmaWVsZCwgcXVlcnlbZmllbGRdKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZXF1YWxPYmplY3RzR2VuZXJpYyhvYmosIGNvbXBhcmVUbywgZXFsRm4pIHtcbiAgaWYgKEFycmF5LmlzQXJyYXkob2JqKSkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb2JqLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoZXFsRm4ob2JqW2ldLCBjb21wYXJlVG8pKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gZXFsRm4ob2JqLCBjb21wYXJlVG8pO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBhbiBvYmplY3QgbWF0Y2hlcyBhIHNpbmdsZSBrZXkncyBjb25zdHJhaW50c1xuICovXG5mdW5jdGlvbiBtYXRjaGVzS2V5Q29uc3RyYWludHMob2JqZWN0LCBrZXksIGNvbnN0cmFpbnRzKSB7XG4gIGlmIChjb25zdHJhaW50cyA9PT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoa2V5LmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgLy8gS2V5IHJlZmVyZW5jZXMgYSBzdWJvYmplY3RcbiAgICB2YXIga2V5Q29tcG9uZW50cyA9IGtleS5zcGxpdCgnLicpO1xuICAgIHZhciBzdWJPYmplY3RLZXkgPSBrZXlDb21wb25lbnRzWzBdO1xuICAgIHZhciBrZXlSZW1haW5kZXIgPSBrZXlDb21wb25lbnRzLnNsaWNlKDEpLmpvaW4oJy4nKTtcbiAgICByZXR1cm4gbWF0Y2hlc0tleUNvbnN0cmFpbnRzKG9iamVjdFtzdWJPYmplY3RLZXldIHx8IHt9LCBrZXlSZW1haW5kZXIsIGNvbnN0cmFpbnRzKTtcbiAgfVxuICB2YXIgaTtcbiAgaWYgKGtleSA9PT0gJyRvcicpIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29uc3RyYWludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChtYXRjaGVzUXVlcnkob2JqZWN0LCBjb25zdHJhaW50c1tpXSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoa2V5ID09PSAnJGFuZCcpIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29uc3RyYWludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICghbWF0Y2hlc1F1ZXJ5KG9iamVjdCwgY29uc3RyYWludHNbaV0pKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKGtleSA9PT0gJyRub3InKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbnN0cmFpbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAobWF0Y2hlc1F1ZXJ5KG9iamVjdCwgY29uc3RyYWludHNbaV0pKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKGtleSA9PT0gJyRyZWxhdGVkVG8nKSB7XG4gICAgLy8gQmFpbCEgV2UgY2FuJ3QgaGFuZGxlIHJlbGF0aW9uYWwgcXVlcmllcyBsb2NhbGx5XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIERlY29kZSBEYXRlIEpTT04gdmFsdWVcbiAgaWYgKG9iamVjdFtrZXldICYmIG9iamVjdFtrZXldLl9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICBvYmplY3Rba2V5XSA9IG5ldyBEYXRlKG9iamVjdFtrZXldLmlzbyk7XG4gIH1cbiAgLy8gRXF1YWxpdHkgKG9yIEFycmF5IGNvbnRhaW5zKSBjYXNlc1xuICBpZiAodHlwZW9mIGNvbnN0cmFpbnRzICE9PSAnb2JqZWN0Jykge1xuICAgIGlmIChBcnJheS5pc0FycmF5KG9iamVjdFtrZXldKSkge1xuICAgICAgcmV0dXJuIG9iamVjdFtrZXldLmluZGV4T2YoY29uc3RyYWludHMpID4gLTE7XG4gICAgfVxuICAgIHJldHVybiBvYmplY3Rba2V5XSA9PT0gY29uc3RyYWludHM7XG4gIH1cbiAgdmFyIGNvbXBhcmVUbztcbiAgaWYgKGNvbnN0cmFpbnRzLl9fdHlwZSkge1xuICAgIGlmIChjb25zdHJhaW50cy5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIGVxdWFsT2JqZWN0c0dlbmVyaWMob2JqZWN0W2tleV0sIGNvbnN0cmFpbnRzLCBmdW5jdGlvbiAob2JqLCBwdHIpIHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICB0eXBlb2Ygb2JqICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgIHB0ci5jbGFzc05hbWUgPT09IG9iai5jbGFzc05hbWUgJiZcbiAgICAgICAgICBwdHIub2JqZWN0SWQgPT09IG9iai5vYmplY3RJZFxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVxdWFsT2JqZWN0c0dlbmVyaWMob2JqZWN0W2tleV0sIFBhcnNlLl9kZWNvZGUoa2V5LCBjb25zdHJhaW50cyksIGVxdWFsT2JqZWN0cyk7XG4gIH1cbiAgLy8gTW9yZSBjb21wbGV4IGNhc2VzXG4gIGZvciAodmFyIGNvbmRpdGlvbiBpbiBjb25zdHJhaW50cykge1xuICAgIGNvbXBhcmVUbyA9IGNvbnN0cmFpbnRzW2NvbmRpdGlvbl07XG4gICAgaWYgKGNvbXBhcmVUby5fX3R5cGUpIHtcbiAgICAgIGNvbXBhcmVUbyA9IFBhcnNlLl9kZWNvZGUoa2V5LCBjb21wYXJlVG8pO1xuICAgIH1cbiAgICBzd2l0Y2ggKGNvbmRpdGlvbikge1xuICAgICAgY2FzZSAnJGx0JzpcbiAgICAgICAgaWYgKG9iamVjdFtrZXldID49IGNvbXBhcmVUbykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRsdGUnOlxuICAgICAgICBpZiAob2JqZWN0W2tleV0gPiBjb21wYXJlVG8pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckZ3QnOlxuICAgICAgICBpZiAob2JqZWN0W2tleV0gPD0gY29tcGFyZVRvKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGd0ZSc6XG4gICAgICAgIGlmIChvYmplY3Rba2V5XSA8IGNvbXBhcmVUbykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRuZSc6XG4gICAgICAgIGlmIChlcXVhbE9iamVjdHMob2JqZWN0W2tleV0sIGNvbXBhcmVUbykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckaW4nOlxuICAgICAgICBpZiAoIWNvbnRhaW5zKGNvbXBhcmVUbywgb2JqZWN0W2tleV0pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG5pbic6XG4gICAgICAgIGlmIChjb250YWlucyhjb21wYXJlVG8sIG9iamVjdFtrZXldKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRhbGwnOlxuICAgICAgICBpZiAoIW9iamVjdFtrZXldKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb21wYXJlVG8ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2tleV0uaW5kZXhPZihjb21wYXJlVG9baV0pIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRleGlzdHMnOiB7XG4gICAgICAgIGNvbnN0IHByb3BlcnR5RXhpc3RzID0gdHlwZW9mIG9iamVjdFtrZXldICE9PSAndW5kZWZpbmVkJztcbiAgICAgICAgY29uc3QgZXhpc3RlbmNlSXNSZXF1aXJlZCA9IGNvbnN0cmFpbnRzWyckZXhpc3RzJ107XG4gICAgICAgIGlmICh0eXBlb2YgY29uc3RyYWludHNbJyRleGlzdHMnXSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgLy8gVGhlIFNESyB3aWxsIG5ldmVyIHN1Ym1pdCBhIG5vbi1ib29sZWFuIGZvciAkZXhpc3RzLCBidXQgaWYgc29tZW9uZVxuICAgICAgICAgIC8vIHRyaWVzIHRvIHN1Ym1pdCBhIG5vbi1ib29sZWFuIGZvciAkZXhpdHMgb3V0c2lkZSB0aGUgU0RLcywganVzdCBpZ25vcmUgaXQuXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCghcHJvcGVydHlFeGlzdHMgJiYgZXhpc3RlbmNlSXNSZXF1aXJlZCkgfHwgKHByb3BlcnR5RXhpc3RzICYmICFleGlzdGVuY2VJc1JlcXVpcmVkKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRyZWdleCc6XG4gICAgICAgIGlmICh0eXBlb2YgY29tcGFyZVRvID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHJldHVybiBjb21wYXJlVG8udGVzdChvYmplY3Rba2V5XSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSlMgZG9lc24ndCBzdXBwb3J0IHBlcmwtc3R5bGUgZXNjYXBpbmdcbiAgICAgICAgdmFyIGV4cFN0cmluZyA9ICcnO1xuICAgICAgICB2YXIgZXNjYXBlRW5kID0gLTI7XG4gICAgICAgIHZhciBlc2NhcGVTdGFydCA9IGNvbXBhcmVUby5pbmRleE9mKCdcXFxcUScpO1xuICAgICAgICB3aGlsZSAoZXNjYXBlU3RhcnQgPiAtMSkge1xuICAgICAgICAgIC8vIEFkZCB0aGUgdW5lc2NhcGVkIHBvcnRpb25cbiAgICAgICAgICBleHBTdHJpbmcgKz0gY29tcGFyZVRvLnN1YnN0cmluZyhlc2NhcGVFbmQgKyAyLCBlc2NhcGVTdGFydCk7XG4gICAgICAgICAgZXNjYXBlRW5kID0gY29tcGFyZVRvLmluZGV4T2YoJ1xcXFxFJywgZXNjYXBlU3RhcnQpO1xuICAgICAgICAgIGlmIChlc2NhcGVFbmQgPiAtMSkge1xuICAgICAgICAgICAgZXhwU3RyaW5nICs9IGNvbXBhcmVUb1xuICAgICAgICAgICAgICAuc3Vic3RyaW5nKGVzY2FwZVN0YXJ0ICsgMiwgZXNjYXBlRW5kKVxuICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFxcXFxcXFxcXFxcXEUvZywgJ1xcXFxFJylcbiAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcVy9nLCAnXFxcXCQmJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZXNjYXBlU3RhcnQgPSBjb21wYXJlVG8uaW5kZXhPZignXFxcXFEnLCBlc2NhcGVFbmQpO1xuICAgICAgICB9XG4gICAgICAgIGV4cFN0cmluZyArPSBjb21wYXJlVG8uc3Vic3RyaW5nKE1hdGgubWF4KGVzY2FwZVN0YXJ0LCBlc2NhcGVFbmQgKyAyKSk7XG4gICAgICAgIHZhciBleHAgPSBuZXcgUmVnRXhwKGV4cFN0cmluZywgY29uc3RyYWludHMuJG9wdGlvbnMgfHwgJycpO1xuICAgICAgICBpZiAoIWV4cC50ZXN0KG9iamVjdFtrZXldKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRuZWFyU3BoZXJlJzpcbiAgICAgICAgaWYgKCFjb21wYXJlVG8gfHwgIW9iamVjdFtrZXldKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHZhciBkaXN0YW5jZSA9IGNvbXBhcmVUby5yYWRpYW5zVG8ob2JqZWN0W2tleV0pO1xuICAgICAgICB2YXIgbWF4ID0gY29uc3RyYWludHMuJG1heERpc3RhbmNlIHx8IEluZmluaXR5O1xuICAgICAgICByZXR1cm4gZGlzdGFuY2UgPD0gbWF4O1xuICAgICAgY2FzZSAnJHdpdGhpbic6XG4gICAgICAgIGlmICghY29tcGFyZVRvIHx8ICFvYmplY3Rba2V5XSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc291dGhXZXN0ID0gY29tcGFyZVRvLiRib3hbMF07XG4gICAgICAgIHZhciBub3J0aEVhc3QgPSBjb21wYXJlVG8uJGJveFsxXTtcbiAgICAgICAgaWYgKHNvdXRoV2VzdC5sYXRpdHVkZSA+IG5vcnRoRWFzdC5sYXRpdHVkZSB8fCBzb3V0aFdlc3QubG9uZ2l0dWRlID4gbm9ydGhFYXN0LmxvbmdpdHVkZSkge1xuICAgICAgICAgIC8vIEludmFsaWQgYm94LCBjcm9zc2VzIHRoZSBkYXRlIGxpbmVcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBvYmplY3Rba2V5XS5sYXRpdHVkZSA+IHNvdXRoV2VzdC5sYXRpdHVkZSAmJlxuICAgICAgICAgIG9iamVjdFtrZXldLmxhdGl0dWRlIDwgbm9ydGhFYXN0LmxhdGl0dWRlICYmXG4gICAgICAgICAgb2JqZWN0W2tleV0ubG9uZ2l0dWRlID4gc291dGhXZXN0LmxvbmdpdHVkZSAmJlxuICAgICAgICAgIG9iamVjdFtrZXldLmxvbmdpdHVkZSA8IG5vcnRoRWFzdC5sb25naXR1ZGVcbiAgICAgICAgKTtcbiAgICAgIGNhc2UgJyRjb250YWluZWRCeSc6IHtcbiAgICAgICAgZm9yIChjb25zdCB2YWx1ZSBvZiBvYmplY3Rba2V5XSkge1xuICAgICAgICAgIGlmICghY29udGFpbnMoY29tcGFyZVRvLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICBjYXNlICckZ2VvV2l0aGluJzoge1xuICAgICAgICBpZiAoY29tcGFyZVRvLiRwb2x5Z29uKSB7XG4gICAgICAgICAgY29uc3QgcG9pbnRzID0gY29tcGFyZVRvLiRwb2x5Z29uLm1hcChnZW9Qb2ludCA9PiBbXG4gICAgICAgICAgICBnZW9Qb2ludC5sYXRpdHVkZSxcbiAgICAgICAgICAgIGdlb1BvaW50LmxvbmdpdHVkZSxcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBjb25zdCBwb2x5Z29uID0gbmV3IFBhcnNlLlBvbHlnb24ocG9pbnRzKTtcbiAgICAgICAgICByZXR1cm4gcG9seWdvbi5jb250YWluc1BvaW50KG9iamVjdFtrZXldKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29tcGFyZVRvLiRjZW50ZXJTcGhlcmUpIHtcbiAgICAgICAgICBjb25zdCBbV0dTODRQb2ludCwgbWF4RGlzdGFuY2VdID0gY29tcGFyZVRvLiRjZW50ZXJTcGhlcmU7XG4gICAgICAgICAgY29uc3QgY2VudGVyUG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQoe1xuICAgICAgICAgICAgbGF0aXR1ZGU6IFdHUzg0UG9pbnRbMV0sXG4gICAgICAgICAgICBsb25naXR1ZGU6IFdHUzg0UG9pbnRbMF0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY29uc3QgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQob2JqZWN0W2tleV0pO1xuICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gcG9pbnQucmFkaWFuc1RvKGNlbnRlclBvaW50KTtcbiAgICAgICAgICByZXR1cm4gZGlzdGFuY2UgPD0gbWF4RGlzdGFuY2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckZ2VvSW50ZXJzZWN0cyc6IHtcbiAgICAgICAgY29uc3QgcG9seWdvbiA9IG5ldyBQYXJzZS5Qb2x5Z29uKG9iamVjdFtrZXldLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQoY29tcGFyZVRvLiRwb2ludCk7XG4gICAgICAgIHJldHVybiBwb2x5Z29uLmNvbnRhaW5zUG9pbnQocG9pbnQpO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG9wdGlvbnMnOlxuICAgICAgICAvLyBOb3QgYSBxdWVyeSB0eXBlLCBidXQgYSB3YXkgdG8gYWRkIG9wdGlvbnMgdG8gJHJlZ2V4LiBJZ25vcmUgYW5kXG4gICAgICAgIC8vIGF2b2lkIHRoZSBkZWZhdWx0XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG1heERpc3RhbmNlJzpcbiAgICAgICAgLy8gTm90IGEgcXVlcnkgdHlwZSwgYnV0IGEgd2F5IHRvIGFkZCBhIGNhcCB0byAkbmVhclNwaGVyZS4gSWdub3JlIGFuZFxuICAgICAgICAvLyBhdm9pZCB0aGUgZGVmYXVsdFxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRzZWxlY3QnOlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICBjYXNlICckZG9udFNlbGVjdCc6XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbnZhciBRdWVyeVRvb2xzID0ge1xuICBxdWVyeUhhc2g6IHF1ZXJ5SGFzaCxcbiAgbWF0Y2hlc1F1ZXJ5OiBtYXRjaGVzUXVlcnksXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFF1ZXJ5VG9vbHM7XG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBSUEsWUFBWSxHQUFHQyxPQUFPLENBQUMsZ0JBQWdCLENBQUM7QUFDNUMsSUFBSUMsRUFBRSxHQUFHRCxPQUFPLENBQUMsTUFBTSxDQUFDO0FBQ3hCLElBQUlFLEtBQUssR0FBR0YsT0FBTyxDQUFDLFlBQVksQ0FBQzs7QUFFakM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLFNBQVNHLGdCQUFnQkEsQ0FBQ0MsS0FBSyxFQUFFO0VBQy9CLElBQUksQ0FBQ0MsTUFBTSxDQUFDQyxTQUFTLENBQUNDLGNBQWMsQ0FBQ0MsSUFBSSxDQUFDSixLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUU7SUFDdkQsT0FBT0EsS0FBSztFQUNkO0VBQ0EsSUFBSUssS0FBSyxHQUFHLEVBQUU7RUFDZCxLQUFLLElBQUlDLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR04sS0FBSyxDQUFDTyxHQUFHLENBQUNDLE1BQU0sRUFBRUYsQ0FBQyxFQUFFLEVBQUU7SUFDekNELEtBQUss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