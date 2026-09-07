"use strict";

var equalObjects = require('./equalObjects');
var Id = require('./Id');
var Parse = require('parse/node');
var vm = require('vm');
var logger = require('../logger').default;
var regexTimeout = 0;
var vmContext = vm.createContext(Object.create(null));
var scriptCache = new Map();
var SCRIPT_CACHE_MAX = 1000;
function setRegexTimeout(ms) {
  regexTimeout = ms;
}
function safeRegexTest(pattern, flags, input) {
  try {
    if (!regexTimeout) {
      var re = new RegExp(pattern, flags);
      return re.test(input);
    }
    var cacheKey = flags + ':' + pattern;
    var script = scriptCache.get(cacheKey);
    if (!script) {
      if (scriptCache.size >= SCRIPT_CACHE_MAX) {
        scriptCache.clear();
      }
      script = new vm.Script('new RegExp(pattern, flags).test(input)');
      scriptCache.set(cacheKey, script);
    }
    vmContext.pattern = pattern;
    vmContext.flags = flags;
    vmContext.input = input;
    return script.runInContext(vmContext, {
      timeout: regexTimeout
    });
  } catch (e) {
    if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      logger.warn(`Regex timeout: pattern "${pattern}" with flags "${flags}" exceeded ${regexTimeout}ms limit`);
    } else {
      logger.warn(`Invalid regex: pattern "${pattern}" with flags "${flags}": ${e.message}`);
    }
    return false;
  }
}

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
    if (!Array.isArray(constraints)) {
      return false;
    }
    for (i = 0; i < constraints.length; i++) {
      if (matchesQuery(object, constraints[i])) {
        return true;
      }
    }
    return false;
  }
  if (key === '$and') {
    if (!Array.isArray(constraints)) {
      return false;
    }
    for (i = 0; i < constraints.length; i++) {
      if (!matchesQuery(object, constraints[i])) {
        return false;
      }
    }
    return true;
  }
  if (key === '$nor') {
    if (!Array.isArray(constraints)) {
      return false;
    }
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
    if (compareTo?.__type) {
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
        {
          if (typeof compareTo === 'object') {
            if (!safeRegexTest(compareTo.source, compareTo.flags, object[key])) {
              return false;
            }
            break;
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
          if (!safeRegexTest(expString, constraints.$options || '', object[key])) {
            return false;
          }
          break;
        }
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
  matchesQuery: matchesQuery,
  setRegexTimeout: setRegexTimeout
};
module.exports = QueryTools;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJlcXVhbE9iamVjdHMiLCJyZXF1aXJlIiwiSWQiLCJQYXJzZSIsInZtIiwibG9nZ2VyIiwiZGVmYXVsdCIsInJlZ2V4VGltZW91dCIsInZtQ29udGV4dCIsImNyZWF0ZUNvbnRleHQiLCJPYmplY3QiLCJjcmVhdGUiLCJzY3JpcHRDYWNoZSIsIk1hcCIsIlNDUklQVF9DQUNIRV9NQVgiLCJzZXRSZWdleFRpbWVvdXQiLCJtcyIsInNhZmVSZWdleFRlc3QiLCJwYXR0ZXJuIiwiZmxhZ3MiLCJpbnB1dCIsInJlIiwiUmVnRXhwIiwidGVzdCIsImNhY2hlS2V5Iiwic2NyaXB0IiwiZ2V0Iiwic2l6ZSIsImNsZWFyIiwiU2NyaXB0Iiwic2V0IiwicnVuSW5Db250ZXh0IiwidGltZW91dCIsImUiLCJjb2RlIiwid2FybiIsIm1lc3NhZ2UiLCJmbGF0dGVuT3JRdWVyaWVzIiwid2hlcmUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJhY2N1bSIsImkiLCIkb3IiLCJsZW5ndGgiLCJjb25jYXQiLCJzdHJpbmdpZnkiLCJvYmplY3QiLCJyZXBsYWNlIiwiQXJyYXkiLCJpc0FycmF5IiwiY29weSIsIm1hcCIsInNvcnQiLCJqb2luIiwic2VjdGlvbnMiLCJrZXlzIiwiayIsInB1c2giLCJxdWVyeUhhc2giLCJxdWVyeSIsIlF1ZXJ5IiwiY2xhc3NOYW1lIiwiX3doZXJlIiwiY29sdW1ucyIsInZhbHVlcyIsInVuaXF1ZUNvbHVtbnMiLCJzdWJWYWx1ZXMiLCJqIiwiY29udGFpbnMiLCJoYXlzdGFjayIsIm5lZWRsZSIsIl9fdHlwZSIsInB0ciIsIm9iamVjdElkIiwibmVlZCIsImluZGV4T2YiLCJtYXRjaGVzUXVlcnkiLCJpZCIsImZpZWxkIiwibWF0Y2hlc0tleUNvbnN0cmFpbnRzIiwiZXF1YWxPYmplY3RzR2VuZXJpYyIsIm9iaiIsImNvbXBhcmVUbyIsImVxbEZuIiwia2V5IiwiY29uc3RyYWludHMiLCJrZXlDb21wb25lbnRzIiwic3BsaXQiLCJzdWJPYmplY3RLZXkiLCJrZXlSZW1haW5kZXIiLCJzbGljZSIsIkRhdGUiLCJpc28iLCJfZGVjb2RlIiwiY29uZGl0aW9uIiwicHJvcGVydHlFeGlzdHMiLCJleGlzdGVuY2VJc1JlcXVpcmVkIiwic291cmNlIiwiZXhwU3RyaW5nIiwiZXNjYXBlRW5kIiwiZXNjYXBlU3RhcnQiLCJzdWJzdHJpbmciLCJNYXRoIiwibWF4IiwiJG9wdGlvbnMiLCJkaXN0YW5jZSIsInJhZGlhbnNUbyIsIiRtYXhEaXN0YW5jZSIsIkluZmluaXR5Iiwic291dGhXZXN0IiwiJGJveCIsIm5vcnRoRWFzdCIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwidmFsdWUiLCIkcG9seWdvbiIsInBvaW50cyIsImdlb1BvaW50IiwicG9seWdvbiIsIlBvbHlnb24iLCJjb250YWluc1BvaW50IiwiJGNlbnRlclNwaGVyZSIsIldHUzg0UG9pbnQiLCJtYXhEaXN0YW5jZSIsImNlbnRlclBvaW50IiwiR2VvUG9pbnQiLCJwb2ludCIsImNvb3JkaW5hdGVzIiwiJHBvaW50IiwiUXVlcnlUb29scyIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1F1ZXJ5VG9vbHMuanMiXSwic291cmNlc0NvbnRlbnQiOlsidmFyIGVxdWFsT2JqZWN0cyA9IHJlcXVpcmUoJy4vZXF1YWxPYmplY3RzJyk7XG52YXIgSWQgPSByZXF1aXJlKCcuL0lkJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG52YXIgdm0gPSByZXF1aXJlKCd2bScpO1xudmFyIGxvZ2dlciA9IHJlcXVpcmUoJy4uL2xvZ2dlcicpLmRlZmF1bHQ7XG5cbnZhciByZWdleFRpbWVvdXQgPSAwO1xudmFyIHZtQ29udGV4dCA9IHZtLmNyZWF0ZUNvbnRleHQoT2JqZWN0LmNyZWF0ZShudWxsKSk7XG52YXIgc2NyaXB0Q2FjaGUgPSBuZXcgTWFwKCk7XG52YXIgU0NSSVBUX0NBQ0hFX01BWCA9IDEwMDA7XG5cbmZ1bmN0aW9uIHNldFJlZ2V4VGltZW91dChtcykge1xuICByZWdleFRpbWVvdXQgPSBtcztcbn1cblxuZnVuY3Rpb24gc2FmZVJlZ2V4VGVzdChwYXR0ZXJuLCBmbGFncywgaW5wdXQpIHtcbiAgdHJ5IHtcbiAgICBpZiAoIXJlZ2V4VGltZW91dCkge1xuICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cChwYXR0ZXJuLCBmbGFncyk7XG4gICAgICByZXR1cm4gcmUudGVzdChpbnB1dCk7XG4gICAgfVxuICAgIHZhciBjYWNoZUtleSA9IGZsYWdzICsgJzonICsgcGF0dGVybjtcbiAgICB2YXIgc2NyaXB0ID0gc2NyaXB0Q2FjaGUuZ2V0KGNhY2hlS2V5KTtcbiAgICBpZiAoIXNjcmlwdCkge1xuICAgICAgaWYgKHNjcmlwdENhY2hlLnNpemUgPj0gU0NSSVBUX0NBQ0hFX01BWCkgeyBzY3JpcHRDYWNoZS5jbGVhcigpOyB9XG4gICAgICBzY3JpcHQgPSBuZXcgdm0uU2NyaXB0KCduZXcgUmVnRXhwKHBhdHRlcm4sIGZsYWdzKS50ZXN0KGlucHV0KScpO1xuICAgICAgc2NyaXB0Q2FjaGUuc2V0KGNhY2hlS2V5LCBzY3JpcHQpO1xuICAgIH1cbiAgICB2bUNvbnRleHQucGF0dGVybiA9IHBhdHRlcm47XG4gICAgdm1Db250ZXh0LmZsYWdzID0gZmxhZ3M7XG4gICAgdm1Db250ZXh0LmlucHV0ID0gaW5wdXQ7XG4gICAgcmV0dXJuIHNjcmlwdC5ydW5JbkNvbnRleHQodm1Db250ZXh0LCB7IHRpbWVvdXQ6IHJlZ2V4VGltZW91dCB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGlmIChlLmNvZGUgPT09ICdFUlJfU0NSSVBUX0VYRUNVVElPTl9USU1FT1VUJykge1xuICAgICAgbG9nZ2VyLndhcm4oYFJlZ2V4IHRpbWVvdXQ6IHBhdHRlcm4gXCIke3BhdHRlcm59XCIgd2l0aCBmbGFncyBcIiR7ZmxhZ3N9XCIgZXhjZWVkZWQgJHtyZWdleFRpbWVvdXR9bXMgbGltaXRgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9nZ2VyLndhcm4oYEludmFsaWQgcmVnZXg6IHBhdHRlcm4gXCIke3BhdHRlcm59XCIgd2l0aCBmbGFncyBcIiR7ZmxhZ3N9XCI6ICR7ZS5tZXNzYWdlfWApO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLyoqXG4gKiBRdWVyeSBIYXNoZXMgYXJlIGRldGVybWluaXN0aWMgaGFzaGVzIGZvciBQYXJzZSBRdWVyaWVzLlxuICogQW55IHR3byBxdWVyaWVzIHRoYXQgaGF2ZSB0aGUgc2FtZSBzZXQgb2YgY29uc3RyYWludHMgd2lsbCBwcm9kdWNlIHRoZSBzYW1lXG4gKiBoYXNoLiBUaGlzIGxldHMgdXMgcmVsaWFibHkgZ3JvdXAgY29tcG9uZW50cyBieSB0aGUgcXVlcmllcyB0aGV5IGRlcGVuZCB1cG9uLFxuICogYW5kIHF1aWNrbHkgZGV0ZXJtaW5lIGlmIGEgcXVlcnkgaGFzIGNoYW5nZWQuXG4gKi9cblxuLyoqXG4gKiBDb252ZXJ0ICRvciBxdWVyaWVzIGludG8gYW4gYXJyYXkgb2Ygd2hlcmUgY29uZGl0aW9uc1xuICovXG5mdW5jdGlvbiBmbGF0dGVuT3JRdWVyaWVzKHdoZXJlKSB7XG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHdoZXJlLCAnJG9yJykpIHtcbiAgICByZXR1cm4gd2hlcmU7XG4gIH1cbiAgdmFyIGFjY3VtID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgd2hlcmUuJG9yLmxlbmd0aDsgaSsrKSB7XG4gICAgYWNjdW0gPSBhY2N1bS5jb25jYXQod2hlcmUuJG9yW2ldKTtcbiAgfVxuICByZXR1cm4gYWNjdW07XG59XG5cbi8qKlxuICogRGV0ZXJtaW5pc3RpY2FsbHkgdHVybnMgYW4gb2JqZWN0IGludG8gYSBzdHJpbmcuIERpc3JlZ2FyZHMgb3JkZXJpbmdcbiAqL1xuZnVuY3Rpb24gc3RyaW5naWZ5KG9iamVjdCk6IHN0cmluZyB7XG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCBvYmplY3QgPT09IG51bGwpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiAnXCInICsgb2JqZWN0LnJlcGxhY2UoL1xcfC9nLCAnJXwnKSArICdcIic7XG4gICAgfVxuICAgIHJldHVybiBvYmplY3QgKyAnJztcbiAgfVxuICBpZiAoQXJyYXkuaXNBcnJheShvYmplY3QpKSB7XG4gICAgdmFyIGNvcHkgPSBvYmplY3QubWFwKHN0cmluZ2lmeSk7XG4gICAgY29weS5zb3J0KCk7XG4gICAgcmV0dXJuICdbJyArIGNvcHkuam9pbignLCcpICsgJ10nO1xuICB9XG4gIHZhciBzZWN0aW9ucyA9IFtdO1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gIGtleXMuc29ydCgpO1xuICBmb3IgKHZhciBrID0gMDsgayA8IGtleXMubGVuZ3RoOyBrKyspIHtcbiAgICBzZWN0aW9ucy5wdXNoKHN0cmluZ2lmeShrZXlzW2tdKSArICc6JyArIHN0cmluZ2lmeShvYmplY3Rba2V5c1trXV0pKTtcbiAgfVxuICByZXR1cm4gJ3snICsgc2VjdGlvbnMuam9pbignLCcpICsgJ30nO1xufVxuXG4vKipcbiAqIEdlbmVyYXRlIGEgaGFzaCBmcm9tIGEgcXVlcnksIHdpdGggdW5pcXVlIGZpZWxkcyBmb3IgY29sdW1ucywgdmFsdWVzLCBvcmRlcixcbiAqIHNraXAsIGFuZCBsaW1pdC5cbiAqL1xuZnVuY3Rpb24gcXVlcnlIYXNoKHF1ZXJ5KSB7XG4gIGlmIChxdWVyeSBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgcXVlcnkgPSB7XG4gICAgICBjbGFzc05hbWU6IHF1ZXJ5LmNsYXNzTmFtZSxcbiAgICAgIHdoZXJlOiBxdWVyeS5fd2hlcmUsXG4gICAgfTtcbiAgfVxuICB2YXIgd2hlcmUgPSBmbGF0dGVuT3JRdWVyaWVzKHF1ZXJ5LndoZXJlIHx8IHt9KTtcbiAgdmFyIGNvbHVtbnMgPSBbXTtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICB2YXIgaTtcbiAgaWYgKEFycmF5LmlzQXJyYXkod2hlcmUpKSB7XG4gICAgdmFyIHVuaXF1ZUNvbHVtbnMgPSB7fTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgd2hlcmUubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBzdWJWYWx1ZXMgPSB7fTtcbiAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMod2hlcmVbaV0pO1xuICAgICAga2V5cy5zb3J0KCk7XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGtleXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgc3ViVmFsdWVzW2tleXNbal1dID0gd2hlcmVbaV1ba2V5c1tqXV07XG4gICAgICAgIHVuaXF1ZUNvbHVtbnNba2V5c1tqXV0gPSB0cnVlO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goc3ViVmFsdWVzKTtcbiAgICB9XG4gICAgY29sdW1ucyA9IE9iamVjdC5rZXlzKHVuaXF1ZUNvbHVtbnMpO1xuICAgIGNvbHVtbnMuc29ydCgpO1xuICB9IGVsc2Uge1xuICAgIGNvbHVtbnMgPSBPYmplY3Qua2V5cyh3aGVyZSk7XG4gICAgY29sdW1ucy5zb3J0KCk7XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbHVtbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhbHVlcy5wdXNoKHdoZXJlW2NvbHVtbnNbaV1dKTtcbiAgICB9XG4gIH1cblxuICB2YXIgc2VjdGlvbnMgPSBbY29sdW1ucy5qb2luKCcsJyksIHN0cmluZ2lmeSh2YWx1ZXMpXTtcblxuICByZXR1cm4gcXVlcnkuY2xhc3NOYW1lICsgJzonICsgc2VjdGlvbnMuam9pbignfCcpO1xufVxuXG4vKipcbiAqIGNvbnRhaW5zIC0tIERldGVybWluZXMgaWYgYW4gb2JqZWN0IGlzIGNvbnRhaW5lZCBpbiBhIGxpc3Qgd2l0aCBzcGVjaWFsIGhhbmRsaW5nIGZvciBQYXJzZSBwb2ludGVycy5cbiAqL1xuZnVuY3Rpb24gY29udGFpbnMoaGF5c3RhY2s6IEFycmF5LCBuZWVkbGU6IGFueSk6IGJvb2xlYW4ge1xuICBpZiAobmVlZGxlICYmIG5lZWRsZS5fX3R5cGUgJiYgbmVlZGxlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgZm9yIChjb25zdCBpIGluIGhheXN0YWNrKSB7XG4gICAgICBjb25zdCBwdHIgPSBoYXlzdGFja1tpXTtcbiAgICAgIGlmICh0eXBlb2YgcHRyID09PSAnc3RyaW5nJyAmJiBwdHIgPT09IG5lZWRsZS5vYmplY3RJZCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGlmIChwdHIuY2xhc3NOYW1lID09PSBuZWVkbGUuY2xhc3NOYW1lICYmIHB0ci5vYmplY3RJZCA9PT0gbmVlZGxlLm9iamVjdElkKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChBcnJheS5pc0FycmF5KG5lZWRsZSkpIHtcbiAgICBmb3IgKGNvbnN0IG5lZWQgb2YgbmVlZGxlKSB7XG4gICAgICBpZiAoY29udGFpbnMoaGF5c3RhY2ssIG5lZWQpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSkgPiAtMTtcbn1cbi8qKlxuICogbWF0Y2hlc1F1ZXJ5IC0tIERldGVybWluZXMgaWYgYW4gb2JqZWN0IHdvdWxkIGJlIHJldHVybmVkIGJ5IGEgUGFyc2UgUXVlcnlcbiAqIEl0J3MgYSBsaWdodHdlaWdodCwgd2hlcmUtY2xhdXNlIG9ubHkgaW1wbGVtZW50YXRpb24gb2YgYSBmdWxsIHF1ZXJ5IGVuZ2luZS5cbiAqIFNpbmNlIHdlIGZpbmQgcXVlcmllcyB0aGF0IG1hdGNoIG9iamVjdHMsIHJhdGhlciB0aGFuIG9iamVjdHMgdGhhdCBtYXRjaFxuICogcXVlcmllcywgd2UgY2FuIGF2b2lkIGJ1aWxkaW5nIGEgZnVsbC1ibG93biBxdWVyeSB0b29sLlxuICovXG5mdW5jdGlvbiBtYXRjaGVzUXVlcnkob2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpOiBib29sZWFuIHtcbiAgaWYgKHF1ZXJ5IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICB2YXIgY2xhc3NOYW1lID0gb2JqZWN0LmlkIGluc3RhbmNlb2YgSWQgPyBvYmplY3QuaWQuY2xhc3NOYW1lIDogb2JqZWN0LmNsYXNzTmFtZTtcbiAgICBpZiAoY2xhc3NOYW1lICE9PSBxdWVyeS5jbGFzc05hbWUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIG1hdGNoZXNRdWVyeShvYmplY3QsIHF1ZXJ5Ll93aGVyZSk7XG4gIH1cbiAgZm9yICh2YXIgZmllbGQgaW4gcXVlcnkpIHtcbiAgICBpZiAoIW1hdGNoZXNLZXlDb25zdHJhaW50cyhvYmplY3QsIGZpZWxkLCBxdWVyeVtmaWVsZF0pKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlcXVhbE9iamVjdHNHZW5lcmljKG9iaiwgY29tcGFyZVRvLCBlcWxGbikge1xuICBpZiAoQXJyYXkuaXNBcnJheShvYmopKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChlcWxGbihvYmpbaV0sIGNvbXBhcmVUbykpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiBlcWxGbihvYmosIGNvbXBhcmVUbyk7XG59XG5cbi8qKlxuICogRGV0ZXJtaW5lcyB3aGV0aGVyIGFuIG9iamVjdCBtYXRjaGVzIGEgc2luZ2xlIGtleSdzIGNvbnN0cmFpbnRzXG4gKi9cbmZ1bmN0aW9uIG1hdGNoZXNLZXlDb25zdHJhaW50cyhvYmplY3QsIGtleSwgY29uc3RyYWludHMpIHtcbiAgaWYgKGNvbnN0cmFpbnRzID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChrZXkuaW5kZXhPZignLicpID49IDApIHtcbiAgICAvLyBLZXkgcmVmZXJlbmNlcyBhIHN1Ym9iamVjdFxuICAgIHZhciBrZXlDb21wb25lbnRzID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgdmFyIHN1Yk9iamVjdEtleSA9IGtleUNvbXBvbmVudHNbMF07XG4gICAgdmFyIGtleVJlbWFpbmRlciA9IGtleUNvbXBvbmVudHMuc2xpY2UoMSkuam9pbignLicpO1xuICAgIHJldHVybiBtYXRjaGVzS2V5Q29uc3RyYWludHMob2JqZWN0W3N1Yk9iamVjdEtleV0gfHwge30sIGtleVJlbWFpbmRlciwgY29uc3RyYWludHMpO1xuICB9XG4gIHZhciBpO1xuICBpZiAoa2V5ID09PSAnJG9yJykge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShjb25zdHJhaW50cykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbnN0cmFpbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAobWF0Y2hlc1F1ZXJ5KG9iamVjdCwgY29uc3RyYWludHNbaV0pKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGtleSA9PT0gJyRhbmQnKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnN0cmFpbnRzKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgY29uc3RyYWludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICghbWF0Y2hlc1F1ZXJ5KG9iamVjdCwgY29uc3RyYWludHNbaV0pKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKGtleSA9PT0gJyRub3InKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnN0cmFpbnRzKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgY29uc3RyYWludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChtYXRjaGVzUXVlcnkob2JqZWN0LCBjb25zdHJhaW50c1tpXSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAoa2V5ID09PSAnJHJlbGF0ZWRUbycpIHtcbiAgICAvLyBCYWlsISBXZSBjYW4ndCBoYW5kbGUgcmVsYXRpb25hbCBxdWVyaWVzIGxvY2FsbHlcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gRGVjb2RlIERhdGUgSlNPTiB2YWx1ZVxuICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX190eXBlID09ICdEYXRlJykge1xuICAgIG9iamVjdFtrZXldID0gbmV3IERhdGUob2JqZWN0W2tleV0uaXNvKTtcbiAgfVxuICAvLyBFcXVhbGl0eSAob3IgQXJyYXkgY29udGFpbnMpIGNhc2VzXG4gIGlmICh0eXBlb2YgY29uc3RyYWludHMgIT09ICdvYmplY3QnKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkob2JqZWN0W2tleV0pKSB7XG4gICAgICByZXR1cm4gb2JqZWN0W2tleV0uaW5kZXhPZihjb25zdHJhaW50cykgPiAtMTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdFtrZXldID09PSBjb25zdHJhaW50cztcbiAgfVxuICB2YXIgY29tcGFyZVRvO1xuICBpZiAoY29uc3RyYWludHMuX190eXBlKSB7XG4gICAgaWYgKGNvbnN0cmFpbnRzLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gZXF1YWxPYmplY3RzR2VuZXJpYyhvYmplY3Rba2V5XSwgY29uc3RyYWludHMsIGZ1bmN0aW9uIChvYmosIHB0cikge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIHR5cGVvZiBvYmogIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgcHRyLmNsYXNzTmFtZSA9PT0gb2JqLmNsYXNzTmFtZSAmJlxuICAgICAgICAgIHB0ci5vYmplY3RJZCA9PT0gb2JqLm9iamVjdElkXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZXF1YWxPYmplY3RzR2VuZXJpYyhvYmplY3Rba2V5XSwgUGFyc2UuX2RlY29kZShrZXksIGNvbnN0cmFpbnRzKSwgZXF1YWxPYmplY3RzKTtcbiAgfVxuICAvLyBNb3JlIGNvbXBsZXggY2FzZXNcbiAgZm9yICh2YXIgY29uZGl0aW9uIGluIGNvbnN0cmFpbnRzKSB7XG4gICAgY29tcGFyZVRvID0gY29uc3RyYWludHNbY29uZGl0aW9uXTtcbiAgICBpZiAoY29tcGFyZVRvPy5fX3R5cGUpIHtcbiAgICAgIGNvbXBhcmVUbyA9IFBhcnNlLl9kZWNvZGUoa2V5LCBjb21wYXJlVG8pO1xuICAgIH1cbiAgICBzd2l0Y2ggKGNvbmRpdGlvbikge1xuICAgICAgY2FzZSAnJGx0JzpcbiAgICAgICAgaWYgKG9iamVjdFtrZXldID49IGNvbXBhcmVUbykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRsdGUnOlxuICAgICAgICBpZiAob2JqZWN0W2tleV0gPiBjb21wYXJlVG8pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckZ3QnOlxuICAgICAgICBpZiAob2JqZWN0W2tleV0gPD0gY29tcGFyZVRvKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGd0ZSc6XG4gICAgICAgIGlmIChvYmplY3Rba2V5XSA8IGNvbXBhcmVUbykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRlcSc6XG4gICAgICAgIGlmICghZXF1YWxPYmplY3RzKG9iamVjdFtrZXldLCBjb21wYXJlVG8pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG5lJzpcbiAgICAgICAgaWYgKGVxdWFsT2JqZWN0cyhvYmplY3Rba2V5XSwgY29tcGFyZVRvKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRpbic6XG4gICAgICAgIGlmICghY29udGFpbnMoY29tcGFyZVRvLCBvYmplY3Rba2V5XSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbmluJzpcbiAgICAgICAgaWYgKGNvbnRhaW5zKGNvbXBhcmVUbywgb2JqZWN0W2tleV0pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGFsbCc6XG4gICAgICAgIGlmICghb2JqZWN0W2tleV0pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbXBhcmVUby5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmIChvYmplY3Rba2V5XS5pbmRleE9mKGNvbXBhcmVUb1tpXSkgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGV4aXN0cyc6IHtcbiAgICAgICAgY29uc3QgcHJvcGVydHlFeGlzdHMgPSB0eXBlb2Ygb2JqZWN0W2tleV0gIT09ICd1bmRlZmluZWQnO1xuICAgICAgICBjb25zdCBleGlzdGVuY2VJc1JlcXVpcmVkID0gY29uc3RyYWludHNbJyRleGlzdHMnXTtcbiAgICAgICAgaWYgKHR5cGVvZiBjb25zdHJhaW50c1snJGV4aXN0cyddICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAvLyBUaGUgU0RLIHdpbGwgbmV2ZXIgc3VibWl0IGEgbm9uLWJvb2xlYW4gZm9yICRleGlzdHMsIGJ1dCBpZiBzb21lb25lXG4gICAgICAgICAgLy8gdHJpZXMgdG8gc3VibWl0IGEgbm9uLWJvb2xlYW4gZm9yICRleGl0cyBvdXRzaWRlIHRoZSBTREtzLCBqdXN0IGlnbm9yZSBpdC5cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBpZiAoKCFwcm9wZXJ0eUV4aXN0cyAmJiBleGlzdGVuY2VJc1JlcXVpcmVkKSB8fCAocHJvcGVydHlFeGlzdHMgJiYgIWV4aXN0ZW5jZUlzUmVxdWlyZWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJHJlZ2V4Jzoge1xuICAgICAgICBpZiAodHlwZW9mIGNvbXBhcmVUbyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBpZiAoIXNhZmVSZWdleFRlc3QoY29tcGFyZVRvLnNvdXJjZSwgY29tcGFyZVRvLmZsYWdzLCBvYmplY3Rba2V5XSkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSlMgZG9lc24ndCBzdXBwb3J0IHBlcmwtc3R5bGUgZXNjYXBpbmdcbiAgICAgICAgdmFyIGV4cFN0cmluZyA9ICcnO1xuICAgICAgICB2YXIgZXNjYXBlRW5kID0gLTI7XG4gICAgICAgIHZhciBlc2NhcGVTdGFydCA9IGNvbXBhcmVUby5pbmRleE9mKCdcXFxcUScpO1xuICAgICAgICB3aGlsZSAoZXNjYXBlU3RhcnQgPiAtMSkge1xuICAgICAgICAgIC8vIEFkZCB0aGUgdW5lc2NhcGVkIHBvcnRpb25cbiAgICAgICAgICBleHBTdHJpbmcgKz0gY29tcGFyZVRvLnN1YnN0cmluZyhlc2NhcGVFbmQgKyAyLCBlc2NhcGVTdGFydCk7XG4gICAgICAgICAgZXNjYXBlRW5kID0gY29tcGFyZVRvLmluZGV4T2YoJ1xcXFxFJywgZXNjYXBlU3RhcnQpO1xuICAgICAgICAgIGlmIChlc2NhcGVFbmQgPiAtMSkge1xuICAgICAgICAgICAgZXhwU3RyaW5nICs9IGNvbXBhcmVUb1xuICAgICAgICAgICAgICAuc3Vic3RyaW5nKGVzY2FwZVN0YXJ0ICsgMiwgZXNjYXBlRW5kKVxuICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFxcXFxcXFxcXFxcXEUvZywgJ1xcXFxFJylcbiAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcVy9nLCAnXFxcXCQmJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZXNjYXBlU3RhcnQgPSBjb21wYXJlVG8uaW5kZXhPZignXFxcXFEnLCBlc2NhcGVFbmQpO1xuICAgICAgICB9XG4gICAgICAgIGV4cFN0cmluZyArPSBjb21wYXJlVG8uc3Vic3RyaW5nKE1hdGgubWF4KGVzY2FwZVN0YXJ0LCBlc2NhcGVFbmQgKyAyKSk7XG4gICAgICAgIGlmICghc2FmZVJlZ2V4VGVzdChleHBTdHJpbmcsIGNvbnN0cmFpbnRzLiRvcHRpb25zIHx8ICcnLCBvYmplY3Rba2V5XSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckbmVhclNwaGVyZSc6XG4gICAgICAgIGlmICghY29tcGFyZVRvIHx8ICFvYmplY3Rba2V5XSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgZGlzdGFuY2UgPSBjb21wYXJlVG8ucmFkaWFuc1RvKG9iamVjdFtrZXldKTtcbiAgICAgICAgdmFyIG1heCA9IGNvbnN0cmFpbnRzLiRtYXhEaXN0YW5jZSB8fCBJbmZpbml0eTtcbiAgICAgICAgcmV0dXJuIGRpc3RhbmNlIDw9IG1heDtcbiAgICAgIGNhc2UgJyR3aXRoaW4nOlxuICAgICAgICBpZiAoIWNvbXBhcmVUbyB8fCAhb2JqZWN0W2tleV0pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNvdXRoV2VzdCA9IGNvbXBhcmVUby4kYm94WzBdO1xuICAgICAgICB2YXIgbm9ydGhFYXN0ID0gY29tcGFyZVRvLiRib3hbMV07XG4gICAgICAgIGlmIChzb3V0aFdlc3QubGF0aXR1ZGUgPiBub3J0aEVhc3QubGF0aXR1ZGUgfHwgc291dGhXZXN0LmxvbmdpdHVkZSA+IG5vcnRoRWFzdC5sb25naXR1ZGUpIHtcbiAgICAgICAgICAvLyBJbnZhbGlkIGJveCwgY3Jvc3NlcyB0aGUgZGF0ZSBsaW5lXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgb2JqZWN0W2tleV0ubGF0aXR1ZGUgPiBzb3V0aFdlc3QubGF0aXR1ZGUgJiZcbiAgICAgICAgICBvYmplY3Rba2V5XS5sYXRpdHVkZSA8IG5vcnRoRWFzdC5sYXRpdHVkZSAmJlxuICAgICAgICAgIG9iamVjdFtrZXldLmxvbmdpdHVkZSA+IHNvdXRoV2VzdC5sb25naXR1ZGUgJiZcbiAgICAgICAgICBvYmplY3Rba2V5XS5sb25naXR1ZGUgPCBub3J0aEVhc3QubG9uZ2l0dWRlXG4gICAgICAgICk7XG4gICAgICBjYXNlICckY29udGFpbmVkQnknOiB7XG4gICAgICAgIGZvciAoY29uc3QgdmFsdWUgb2Ygb2JqZWN0W2tleV0pIHtcbiAgICAgICAgICBpZiAoIWNvbnRhaW5zKGNvbXBhcmVUbywgdmFsdWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb1dpdGhpbic6IHtcbiAgICAgICAgaWYgKGNvbXBhcmVUby4kcG9seWdvbikge1xuICAgICAgICAgIGNvbnN0IHBvaW50cyA9IGNvbXBhcmVUby4kcG9seWdvbi5tYXAoZ2VvUG9pbnQgPT4gW1xuICAgICAgICAgICAgZ2VvUG9pbnQubGF0aXR1ZGUsXG4gICAgICAgICAgICBnZW9Qb2ludC5sb25naXR1ZGUsXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgY29uc3QgcG9seWdvbiA9IG5ldyBQYXJzZS5Qb2x5Z29uKHBvaW50cyk7XG4gICAgICAgICAgcmV0dXJuIHBvbHlnb24uY29udGFpbnNQb2ludChvYmplY3Rba2V5XSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbXBhcmVUby4kY2VudGVyU3BoZXJlKSB7XG4gICAgICAgICAgY29uc3QgW1dHUzg0UG9pbnQsIG1heERpc3RhbmNlXSA9IGNvbXBhcmVUby4kY2VudGVyU3BoZXJlO1xuICAgICAgICAgIGNvbnN0IGNlbnRlclBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHtcbiAgICAgICAgICAgIGxhdGl0dWRlOiBXR1M4NFBvaW50WzFdLFxuICAgICAgICAgICAgbG9uZ2l0dWRlOiBXR1M4NFBvaW50WzBdLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvbnN0IHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KG9iamVjdFtrZXldKTtcbiAgICAgICAgICBjb25zdCBkaXN0YW5jZSA9IHBvaW50LnJhZGlhbnNUbyhjZW50ZXJQb2ludCk7XG4gICAgICAgICAgcmV0dXJuIGRpc3RhbmNlIDw9IG1heERpc3RhbmNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb0ludGVyc2VjdHMnOiB7XG4gICAgICAgIGNvbnN0IHBvbHlnb24gPSBuZXcgUGFyc2UuUG9seWdvbihvYmplY3Rba2V5XS5jb29yZGluYXRlcyk7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KGNvbXBhcmVUby4kcG9pbnQpO1xuICAgICAgICByZXR1cm4gcG9seWdvbi5jb250YWluc1BvaW50KHBvaW50KTtcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRvcHRpb25zJzpcbiAgICAgICAgLy8gTm90IGEgcXVlcnkgdHlwZSwgYnV0IGEgd2F5IHRvIGFkZCBvcHRpb25zIHRvICRyZWdleC4gSWdub3JlIGFuZFxuICAgICAgICAvLyBhdm9pZCB0aGUgZGVmYXVsdFxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZSc6XG4gICAgICAgIC8vIE5vdCBhIHF1ZXJ5IHR5cGUsIGJ1dCBhIHdheSB0byBhZGQgYSBjYXAgdG8gJG5lYXJTcGhlcmUuIElnbm9yZSBhbmRcbiAgICAgICAgLy8gYXZvaWQgdGhlIGRlZmF1bHRcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckc2VsZWN0JzpcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgY2FzZSAnJGRvbnRTZWxlY3QnOlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG52YXIgUXVlcnlUb29scyA9IHtcbiAgcXVlcnlIYXNoOiBxdWVyeUhhc2gsXG4gIG1hdGNoZXNRdWVyeTogbWF0Y2hlc1F1ZXJ5LFxuICBzZXRSZWdleFRpbWVvdXQ6IHNldFJlZ2V4VGltZW91dCxcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUXVlcnlUb29scztcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxJQUFJQSxZQUFZLEdBQUdDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztBQUM1QyxJQUFJQyxFQUFFLEdBQUdELE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDeEIsSUFBSUUsS0FBSyxHQUFHRixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ2pDLElBQUlHLEVBQUUsR0FBR0gsT0FBTyxDQUFDLElBQUksQ0FBQztBQUN0QixJQUFJSSxNQUFNLEdBQUdKLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQ0ssT0FBTztBQUV6QyxJQUFJQyxZQUFZLEdBQUcsQ0FBQztBQUNwQixJQUFJQyxTQUFTLEdB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LENBQUNzSCxPQUFPLENBQUNILE1BQU0sQ0FBQztZQUN6QyxPQUFPRSxPQUFPLENBQUNFLGFBQWEsQ0FBQzFFLE1BQU0sQ0FBQ3NDLEdBQUcsQ0FBQyxDQUFDO1VBQzNDO1VBQ0EsSUFBSUYsU0FBUyxDQUFDdUMsYUFBYSxFQUFFO1lBQzNCLE1BQU0sQ0FBQ0MsVUFBVSxFQUFFQyxXQUFXLENBQUMsR0FBR3pDLFNBQVMsQ0FBQ3VDLGFBQWE7WUFDekQsTUFBTUcsV0FBVyxHQUFHLElBQUkzSCxLQUFLLENBQUM0SCxRQUFRLENBQUM7Y0FDckNiLFFBQVEsRUFBRVUsVUFBVSxDQUFDLENBQUMsQ0FBQztjQUN2QlQsU0FBUyxFQUFFUyxVQUFVLENBQUMsQ0FBQztZQUN6QixDQUFDLENBQUM7WUFDRixNQUFNSSxLQUFLLEdBQUcsSUFBSTdILEtBQUssQ0FBQzRILFFBQVEsQ0FBQy9FLE1BQU0sQ0FBQ3NDLEdBQUcsQ0FBQyxDQUFDO1lBQzdDLE1BQU1xQixRQUFRLEdBQUdxQixLQUFLLENBQUNwQixTQUFTLENBQUNrQixXQUFXLENBQUM7WUFDN0MsT0FBT25CLFFBQVEsSUFBSWtCLFdBQVc7VUFDaEM7VUFDQTtRQUNGO01BQ0EsS0FBSyxnQkFBZ0I7UUFBRTtVQUNyQixNQUFNTCxPQUFPLEdBQUcsSUFBSXJILEtBQUssQ0FBQ3NILE9BQU8sQ0FBQ3pFLE1BQU0sQ0FBQ3NDLEdBQUcsQ0FBQyxDQUFDMkMsV0FBVyxDQUFDO1VBQzFELE1BQU1ELEtBQUssR0FBRyxJQUFJN0gsS0FBSyxDQUFDNEgsUUFBUSxDQUFDM0MsU0FBUyxDQUFDOEMsTUFBTSxDQUFDO1VBQ2xELE9BQU9WLE9BQU8sQ0FBQ0UsYUFBYSxDQUFDTSxLQUFLLENBQUM7UUFDckM7TUFDQSxLQUFLLFVBQVU7UUFDYjtRQUNBO1FBQ0E7TUFDRixLQUFLLGNBQWM7UUFDakI7UUFDQTtRQUNBO01BQ0YsS0FBSyxTQUFTO1FBQ1osT0FBTyxLQUFLO01BQ2QsS0FBSyxhQUFhO1FBQ2hCLE9BQU8sS0FBSztNQUNkO1FBQ0UsT0FBTyxLQUFLO0lBQ2hCO0VBQ0Y7RUFDQSxPQUFPLElBQUk7QUFDYjtBQUVBLElBQUlHLFVBQVUsR0FBRztFQUNmdkUsU0FBUyxFQUFFQSxTQUFTO0VBQ3BCa0IsWUFBWSxFQUFFQSxZQUFZO0VBQzFCL0QsZUFBZSxFQUFFQTtBQUNuQixDQUFDO0FBRURxSCxNQUFNLENBQUNDLE9BQU8sR0FBR0YsVUFBVSIsImlnbm9yZUxpc3QiOltdfQ==