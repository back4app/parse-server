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

// Operators whose array argument is a set, so element order carries no meaning.
// Their elements are sorted before hashing; every other array is hashed in order.
var ORDER_INSENSITIVE_OPERATORS = ['$or', '$and', '$nor', '$in', '$nin', '$all', '$containedBy'];

/**
 * Canonically serializes a query `where` into an unambiguous string. Object keys
 * are sorted so key order never affects the result, and the elements of a set
 * operator (see ORDER_INSENSITIVE_OPERATORS) are sorted so their order does not
 * either; all other array order is preserved. Keys and values are JSON-encoded,
 * so every key, the whole structure, and each value type is represented
 * distinctly. Unlike the former flatten-and-list approach, this keeps every key
 * next to `$or` (including the server-added `_Session` `user` pointer and
 * `beforeSubscribe` constraints), so queries that differ only in those keys hash
 * differently.
 */
function canonicalize(value, orderInsensitive) {
  if (Array.isArray(value)) {
    var items = value.map(function (item) {
      return canonicalize(item, false);
    });
    if (orderInsensitive) {
      items.sort();
    }
    return '[' + items.join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    var keys = Object.keys(value).sort();
    var sections = keys.map(function (key) {
      return JSON.stringify(key) + ':' + canonicalize(value[key], ORDER_INSENSITIVE_OPERATORS.indexOf(key) > -1);
    });
    return '{' + sections.join(',') + '}';
  }
  return JSON.stringify(value);
}

/**
 * Generate a deterministic hash from a query's class name and `where` clause.
 * Any two queries with equivalent constraints produce the same hash.
 */
function queryHash(query) {
  if (query instanceof Parse.Query) {
    query = {
      className: query.className,
      where: query._where
    };
  }
  return query.className + ':' + canonicalize(query.where || {}, false);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJlcXVhbE9iamVjdHMiLCJyZXF1aXJlIiwiSWQiLCJQYXJzZSIsInZtIiwibG9nZ2VyIiwiZGVmYXVsdCIsInJlZ2V4VGltZW91dCIsInZtQ29udGV4dCIsImNyZWF0ZUNvbnRleHQiLCJPYmplY3QiLCJjcmVhdGUiLCJzY3JpcHRDYWNoZSIsIk1hcCIsIlNDUklQVF9DQUNIRV9NQVgiLCJzZXRSZWdleFRpbWVvdXQiLCJtcyIsInNhZmVSZWdleFRlc3QiLCJwYXR0ZXJuIiwiZmxhZ3MiLCJpbnB1dCIsInJlIiwiUmVnRXhwIiwidGVzdCIsImNhY2hlS2V5Iiwic2NyaXB0IiwiZ2V0Iiwic2l6ZSIsImNsZWFyIiwiU2NyaXB0Iiwic2V0IiwicnVuSW5Db250ZXh0IiwidGltZW91dCIsImUiLCJjb2RlIiwid2FybiIsIm1lc3NhZ2UiLCJPUkRFUl9JTlNFTlNJVElWRV9PUEVSQVRPUlMiLCJjYW5vbmljYWxpemUiLCJ2YWx1ZSIsIm9yZGVySW5zZW5zaXRpdmUiLCJBcnJheSIsImlzQXJyYXkiLCJpdGVtcyIsIm1hcCIsIml0ZW0iLCJzb3J0Iiwiam9pbiIsImtleXMiLCJzZWN0aW9ucyIsImtleSIsIkpTT04iLCJzdHJpbmdpZnkiLCJpbmRleE9mIiwicXVlcnlIYXNoIiwicXVlcnkiLCJRdWVyeSIsImNsYXNzTmFtZSIsIndoZXJlIiwiX3doZXJlIiwiY29udGFpbnMiLCJoYXlzdGFjayIsIm5lZWRsZSIsIl9fdHlwZSIsImkiLCJwdHIiLCJvYmplY3RJZCIsIm5lZWQiLCJtYXRjaGVzUXVlcnkiLCJvYmplY3QiLCJpZCIsImZpZWxkIiwibWF0Y2hlc0tleUNvbnN0cmFpbnRzIiwiZXF1YWxPYmplY3RzR2VuZXJpYyIsIm9iaiIsImNvbXBhcmVUbyIsImVxbEZuIiwibGVuZ3RoIiwiY29uc3RyYWludHMiLCJrZXlDb21wb25lbnRzIiwic3BsaXQiLCJzdWJPYmplY3RLZXkiLCJrZXlSZW1haW5kZXIiLCJzbGljZSIsIkRhdGUiLCJpc28iLCJfZGVjb2RlIiwiY29uZGl0aW9uIiwicHJvcGVydHlFeGlzdHMiLCJleGlzdGVuY2VJc1JlcXVpcmVkIiwic291cmNlIiwiZXhwU3RyaW5nIiwiZXNjYXBlRW5kIiwiZXNjYXBlU3RhcnQiLCJzdWJzdHJpbmciLCJyZXBsYWNlIiwiTWF0aCIsIm1heCIsIiRvcHRpb25zIiwiZGlzdGFuY2UiLCJyYWRpYW5zVG8iLCIkbWF4RGlzdGFuY2UiLCJJbmZpbml0eSIsInNvdXRoV2VzdCIsIiRib3giLCJub3J0aEVhc3QiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsIiRwb2x5Z29uIiwicG9pbnRzIiwiZ2VvUG9pbnQiLCJwb2x5Z29uIiwiUG9seWdvbiIsImNvbnRhaW5zUG9pbnQiLCIkY2VudGVyU3BoZXJlIiwiV0dTODRQb2ludCIsIm1heERpc3RhbmNlIiwiY2VudGVyUG9pbnQiLCJHZW9Qb2ludCIsInBvaW50IiwiY29vcmRpbmF0ZXMiLCIkcG9pbnQiLCJRdWVyeVRvb2xzIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUXVlcnlUb29scy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgZXF1YWxPYmplY3RzID0gcmVxdWlyZSgnLi9lcXVhbE9iamVjdHMnKTtcbnZhciBJZCA9IHJlcXVpcmUoJy4vSWQnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbnZhciB2bSA9IHJlcXVpcmUoJ3ZtJyk7XG52YXIgbG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyJykuZGVmYXVsdDtcblxudmFyIHJlZ2V4VGltZW91dCA9IDA7XG52YXIgdm1Db250ZXh0ID0gdm0uY3JlYXRlQ29udGV4dChPYmplY3QuY3JlYXRlKG51bGwpKTtcbnZhciBzY3JpcHRDYWNoZSA9IG5ldyBNYXAoKTtcbnZhciBTQ1JJUFRfQ0FDSEVfTUFYID0gMTAwMDtcblxuZnVuY3Rpb24gc2V0UmVnZXhUaW1lb3V0KG1zKSB7XG4gIHJlZ2V4VGltZW91dCA9IG1zO1xufVxuXG5mdW5jdGlvbiBzYWZlUmVnZXhUZXN0KHBhdHRlcm4sIGZsYWdzLCBpbnB1dCkge1xuICB0cnkge1xuICAgIGlmICghcmVnZXhUaW1lb3V0KSB7XG4gICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKHBhdHRlcm4sIGZsYWdzKTtcbiAgICAgIHJldHVybiByZS50ZXN0KGlucHV0KTtcbiAgICB9XG4gICAgdmFyIGNhY2hlS2V5ID0gZmxhZ3MgKyAnOicgKyBwYXR0ZXJuO1xuICAgIHZhciBzY3JpcHQgPSBzY3JpcHRDYWNoZS5nZXQoY2FjaGVLZXkpO1xuICAgIGlmICghc2NyaXB0KSB7XG4gICAgICBpZiAoc2NyaXB0Q2FjaGUuc2l6ZSA+PSBTQ1JJUFRfQ0FDSEVfTUFYKSB7IHNjcmlwdENhY2hlLmNsZWFyKCk7IH1cbiAgICAgIHNjcmlwdCA9IG5ldyB2bS5TY3JpcHQoJ25ldyBSZWdFeHAocGF0dGVybiwgZmxhZ3MpLnRlc3QoaW5wdXQpJyk7XG4gICAgICBzY3JpcHRDYWNoZS5zZXQoY2FjaGVLZXksIHNjcmlwdCk7XG4gICAgfVxuICAgIHZtQ29udGV4dC5wYXR0ZXJuID0gcGF0dGVybjtcbiAgICB2bUNvbnRleHQuZmxhZ3MgPSBmbGFncztcbiAgICB2bUNvbnRleHQuaW5wdXQgPSBpbnB1dDtcbiAgICByZXR1cm4gc2NyaXB0LnJ1bkluQ29udGV4dCh2bUNvbnRleHQsIHsgdGltZW91dDogcmVnZXhUaW1lb3V0IH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaWYgKGUuY29kZSA9PT0gJ0VSUl9TQ1JJUFRfRVhFQ1VUSU9OX1RJTUVPVVQnKSB7XG4gICAgICBsb2dnZXIud2FybihgUmVnZXggdGltZW91dDogcGF0dGVybiBcIiR7cGF0dGVybn1cIiB3aXRoIGZsYWdzIFwiJHtmbGFnc31cIiBleGNlZWRlZCAke3JlZ2V4VGltZW91dH1tcyBsaW1pdGApO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2dnZXIud2FybihgSW52YWxpZCByZWdleDogcGF0dGVybiBcIiR7cGF0dGVybn1cIiB3aXRoIGZsYWdzIFwiJHtmbGFnc31cIjogJHtlLm1lc3NhZ2V9YCk7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vKipcbiAqIFF1ZXJ5IEhhc2hlcyBhcmUgZGV0ZXJtaW5pc3RpYyBoYXNoZXMgZm9yIFBhcnNlIFF1ZXJpZXMuXG4gKiBBbnkgdHdvIHF1ZXJpZXMgdGhhdCBoYXZlIHRoZSBzYW1lIHNldCBvZiBjb25zdHJhaW50cyB3aWxsIHByb2R1Y2UgdGhlIHNhbWVcbiAqIGhhc2guIFRoaXMgbGV0cyB1cyByZWxpYWJseSBncm91cCBjb21wb25lbnRzIGJ5IHRoZSBxdWVyaWVzIHRoZXkgZGVwZW5kIHVwb24sXG4gKiBhbmQgcXVpY2tseSBkZXRlcm1pbmUgaWYgYSBxdWVyeSBoYXMgY2hhbmdlZC5cbiAqL1xuXG4vLyBPcGVyYXRvcnMgd2hvc2UgYXJyYXkgYXJndW1lbnQgaXMgYSBzZXQsIHNvIGVsZW1lbnQgb3JkZXIgY2FycmllcyBubyBtZWFuaW5nLlxuLy8gVGhlaXIgZWxlbWVudHMgYXJlIHNvcnRlZCBiZWZvcmUgaGFzaGluZzsgZXZlcnkgb3RoZXIgYXJyYXkgaXMgaGFzaGVkIGluIG9yZGVyLlxudmFyIE9SREVSX0lOU0VOU0lUSVZFX09QRVJBVE9SUyA9IFsnJG9yJywgJyRhbmQnLCAnJG5vcicsICckaW4nLCAnJG5pbicsICckYWxsJywgJyRjb250YWluZWRCeSddO1xuXG4vKipcbiAqIENhbm9uaWNhbGx5IHNlcmlhbGl6ZXMgYSBxdWVyeSBgd2hlcmVgIGludG8gYW4gdW5hbWJpZ3VvdXMgc3RyaW5nLiBPYmplY3Qga2V5c1xuICogYXJlIHNvcnRlZCBzbyBrZXkgb3JkZXIgbmV2ZXIgYWZmZWN0cyB0aGUgcmVzdWx0LCBhbmQgdGhlIGVsZW1lbnRzIG9mIGEgc2V0XG4gKiBvcGVyYXRvciAoc2VlIE9SREVSX0lOU0VOU0lUSVZFX09QRVJBVE9SUykgYXJlIHNvcnRlZCBzbyB0aGVpciBvcmRlciBkb2VzIG5vdFxuICogZWl0aGVyOyBhbGwgb3RoZXIgYXJyYXkgb3JkZXIgaXMgcHJlc2VydmVkLiBLZXlzIGFuZCB2YWx1ZXMgYXJlIEpTT04tZW5jb2RlZCxcbiAqIHNvIGV2ZXJ5IGtleSwgdGhlIHdob2xlIHN0cnVjdHVyZSwgYW5kIGVhY2ggdmFsdWUgdHlwZSBpcyByZXByZXNlbnRlZFxuICogZGlzdGluY3RseS4gVW5saWtlIHRoZSBmb3JtZXIgZmxhdHRlbi1hbmQtbGlzdCBhcHByb2FjaCwgdGhpcyBrZWVwcyBldmVyeSBrZXlcbiAqIG5leHQgdG8gYCRvcmAgKGluY2x1ZGluZyB0aGUgc2VydmVyLWFkZGVkIGBfU2Vzc2lvbmAgYHVzZXJgIHBvaW50ZXIgYW5kXG4gKiBgYmVmb3JlU3Vic2NyaWJlYCBjb25zdHJhaW50cyksIHNvIHF1ZXJpZXMgdGhhdCBkaWZmZXIgb25seSBpbiB0aG9zZSBrZXlzIGhhc2hcbiAqIGRpZmZlcmVudGx5LlxuICovXG5mdW5jdGlvbiBjYW5vbmljYWxpemUodmFsdWUsIG9yZGVySW5zZW5zaXRpdmUpIHtcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgdmFyIGl0ZW1zID0gdmFsdWUubWFwKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICByZXR1cm4gY2Fub25pY2FsaXplKGl0ZW0sIGZhbHNlKTtcbiAgICB9KTtcbiAgICBpZiAob3JkZXJJbnNlbnNpdGl2ZSkge1xuICAgICAgaXRlbXMuc29ydCgpO1xuICAgIH1cbiAgICByZXR1cm4gJ1snICsgaXRlbXMuam9pbignLCcpICsgJ10nO1xuICB9XG4gIGlmICh2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSkuc29ydCgpO1xuICAgIHZhciBzZWN0aW9ucyA9IGtleXMubWFwKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShrZXkpICsgJzonICsgY2Fub25pY2FsaXplKHZhbHVlW2tleV0sIE9SREVSX0lOU0VOU0lUSVZFX09QRVJBVE9SUy5pbmRleE9mKGtleSkgPiAtMSk7XG4gICAgfSk7XG4gICAgcmV0dXJuICd7JyArIHNlY3Rpb25zLmpvaW4oJywnKSArICd9JztcbiAgfVxuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xufVxuXG4vKipcbiAqIEdlbmVyYXRlIGEgZGV0ZXJtaW5pc3RpYyBoYXNoIGZyb20gYSBxdWVyeSdzIGNsYXNzIG5hbWUgYW5kIGB3aGVyZWAgY2xhdXNlLlxuICogQW55IHR3byBxdWVyaWVzIHdpdGggZXF1aXZhbGVudCBjb25zdHJhaW50cyBwcm9kdWNlIHRoZSBzYW1lIGhhc2guXG4gKi9cbmZ1bmN0aW9uIHF1ZXJ5SGFzaChxdWVyeSkge1xuICBpZiAocXVlcnkgaW5zdGFuY2VvZiBQYXJzZS5RdWVyeSkge1xuICAgIHF1ZXJ5ID0ge1xuICAgICAgY2xhc3NOYW1lOiBxdWVyeS5jbGFzc05hbWUsXG4gICAgICB3aGVyZTogcXVlcnkuX3doZXJlLFxuICAgIH07XG4gIH1cbiAgcmV0dXJuIHF1ZXJ5LmNsYXNzTmFtZSArICc6JyArIGNhbm9uaWNhbGl6ZShxdWVyeS53aGVyZSB8fCB7fSwgZmFsc2UpO1xufVxuXG4vKipcbiAqIGNvbnRhaW5zIC0tIERldGVybWluZXMgaWYgYW4gb2JqZWN0IGlzIGNvbnRhaW5lZCBpbiBhIGxpc3Qgd2l0aCBzcGVjaWFsIGhhbmRsaW5nIGZvciBQYXJzZSBwb2ludGVycy5cbiAqL1xuZnVuY3Rpb24gY29udGFpbnMoaGF5c3RhY2s6IEFycmF5LCBuZWVkbGU6IGFueSk6IGJvb2xlYW4ge1xuICBpZiAobmVlZGxlICYmIG5lZWRsZS5fX3R5cGUgJiYgbmVlZGxlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgZm9yIChjb25zdCBpIGluIGhheXN0YWNrKSB7XG4gICAgICBjb25zdCBwdHIgPSBoYXlzdGFja1tpXTtcbiAgICAgIGlmICh0eXBlb2YgcHRyID09PSAnc3RyaW5nJyAmJiBwdHIgPT09IG5lZWRsZS5vYmplY3RJZCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGlmIChwdHIuY2xhc3NOYW1lID09PSBuZWVkbGUuY2xhc3NOYW1lICYmIHB0ci5vYmplY3RJZCA9PT0gbmVlZGxlLm9iamVjdElkKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChBcnJheS5pc0FycmF5KG5lZWRsZSkpIHtcbiAgICBmb3IgKGNvbnN0IG5lZWQgb2YgbmVlZGxlKSB7XG4gICAgICBpZiAoY29udGFpbnMoaGF5c3RhY2ssIG5lZWQpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSkgPiAtMTtcbn1cbi8qKlxuICogbWF0Y2hlc1F1ZXJ5IC0tIERldGVybWluZXMgaWYgYW4gb2JqZWN0IHdvdWxkIGJlIHJldHVybmVkIGJ5IGEgUGFyc2UgUXVlcnlcbiAqIEl0J3MgYSBsaWdodHdlaWdodCwgd2hlcmUtY2xhdXNlIG9ubHkgaW1wbGVtZW50YXRpb24gb2YgYSBmdWxsIHF1ZXJ5IGVuZ2luZS5cbiAqIFNpbmNlIHdlIGZpbmQgcXVlcmllcyB0aGF0IG1hdGNoIG9iamVjdHMsIHJhdGhlciB0aGFuIG9iamVjdHMgdGhhdCBtYXRjaFxuICogcXVlcmllcywgd2UgY2FuIGF2b2lkIGJ1aWxkaW5nIGEgZnVsbC1ibG93biBxdWVyeSB0b29sLlxuICovXG5mdW5jdGlvbiBtYXRjaGVzUXVlcnkob2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpOiBib29sZWFuIHtcbiAgaWYgKHF1ZXJ5IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICB2YXIgY2xhc3NOYW1lID0gb2JqZWN0LmlkIGluc3RhbmNlb2YgSWQgPyBvYmplY3QuaWQuY2xhc3NOYW1lIDogb2JqZWN0LmNsYXNzTmFtZTtcbiAgICBpZiAoY2xhc3NOYW1lICE9PSBxdWVyeS5jbGFzc05hbWUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIG1hdGNoZXNRdWVyeShvYmplY3QsIHF1ZXJ5Ll93aGVyZSk7XG4gIH1cbiAgZm9yICh2YXIgZmllbGQgaW4gcXVlcnkpIHtcbiAgICBpZiAoIW1hdGNoZXNLZXlDb25zdHJhaW50cyhvYmplY3QsIGZpZWxkLCBxdWVyeVtmaWVsZF0pKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlcXVhbE9iamVjdHNHZW5lcmljKG9iaiwgY29tcGFyZVRvLCBlcWxGbikge1xuICBpZiAoQXJyYXkuaXNBcnJheShvYmopKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChlcWxGbihvYmpbaV0sIGNvbXBhcmVUbykpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiBlcWxGbihvYmosIGNvbXBhcmVUbyk7XG59XG5cbi8qKlxuICogRGV0ZXJtaW5lcyB3aGV0aGVyIGFuIG9iamVjdCBtYXRjaGVzIGEgc2luZ2xlIGtleSdzIGNvbnN0cmFpbnRzXG4gKi9cbmZ1bmN0aW9uIG1hdGNoZXNLZXlDb25zdHJhaW50cyhvYmplY3QsIGtleSwgY29uc3RyYWludHMpIHtcbiAgaWYgKGNvbnN0cmFpbnRzID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChrZXkuaW5kZXhPZignLicpID49IDApIHtcbiAgICAvLyBLZXkgcmVmZXJlbmNlcyBhIHN1Ym9iamVjdFxuICAgIHZhciBrZXlDb21wb25lbnRzID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgdmFyIHN1Yk9iamVjdEtleSA9IGtleUNvbXBvbmVudHNbMF07XG4gICAgdmFyIGtleVJlbWFpbmRlciA9IGtleUNvbXBvbmVudHMuc2xpY2UoMSkuam9pbignLicpO1xuICAgIHJldHVybiBtYXRjaGVzS2V5Q29uc3RyYWludHMob2JqZWN0W3N1Yk9iamVjdEtleV0gfHwge30sIGtleVJlbWFpbmRlciwgY29uc3RyYWludHMpO1xuICB9XG4gIHZhciBpO1xuICBpZiAoa2V5ID09PSAnJG9yJykge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShjb25zdHJhaW50cykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IGNvbnN0cmFpbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAobWF0Y2hlc1F1ZXJ5KG9iamVjdCwgY29uc3RyYWludHNbaV0pKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGtleSA9PT0gJyRhbmQnKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnN0cmFpbnRzKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgY29uc3RyYWludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICghbWF0Y2hlc1F1ZXJ5KG9iamVjdCwgY29uc3RyYWludHNbaV0pKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKGtleSA9PT0gJyRub3InKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnN0cmFpbnRzKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgY29uc3RyYWludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChtYXRjaGVzUXVlcnkob2JqZWN0LCBjb25zdHJhaW50c1tpXSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAoa2V5ID09PSAnJHJlbGF0ZWRUbycpIHtcbiAgICAvLyBCYWlsISBXZSBjYW4ndCBoYW5kbGUgcmVsYXRpb25hbCBxdWVyaWVzIGxvY2FsbHlcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gRGVjb2RlIERhdGUgSlNPTiB2YWx1ZVxuICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX190eXBlID09ICdEYXRlJykge1xuICAgIG9iamVjdFtrZXldID0gbmV3IERhdGUob2JqZWN0W2tleV0uaXNvKTtcbiAgfVxuICAvLyBFcXVhbGl0eSAob3IgQXJyYXkgY29udGFpbnMpIGNhc2VzXG4gIGlmICh0eXBlb2YgY29uc3RyYWludHMgIT09ICdvYmplY3QnKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkob2JqZWN0W2tleV0pKSB7XG4gICAgICByZXR1cm4gb2JqZWN0W2tleV0uaW5kZXhPZihjb25zdHJhaW50cykgPiAtMTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdFtrZXldID09PSBjb25zdHJhaW50cztcbiAgfVxuICB2YXIgY29tcGFyZVRvO1xuICBpZiAoY29uc3RyYWludHMuX190eXBlKSB7XG4gICAgaWYgKGNvbnN0cmFpbnRzLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gZXF1YWxPYmplY3RzR2VuZXJpYyhvYmplY3Rba2V5XSwgY29uc3RyYWludHMsIGZ1bmN0aW9uIChvYmosIHB0cikge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIHR5cGVvZiBvYmogIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgcHRyLmNsYXNzTmFtZSA9PT0gb2JqLmNsYXNzTmFtZSAmJlxuICAgICAgICAgIHB0ci5vYmplY3RJZCA9PT0gb2JqLm9iamVjdElkXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZXF1YWxPYmplY3RzR2VuZXJpYyhvYmplY3Rba2V5XSwgUGFyc2UuX2RlY29kZShrZXksIGNvbnN0cmFpbnRzKSwgZXF1YWxPYmplY3RzKTtcbiAgfVxuICAvLyBNb3JlIGNvbXBsZXggY2FzZXNcbiAgZm9yICh2YXIgY29uZGl0aW9uIGluIGNvbnN0cmFpbnRzKSB7XG4gICAgY29tcGFyZVRvID0gY29uc3RyYWludHNbY29uZGl0aW9uXTtcbiAgICBpZiAoY29tcGFyZVRvPy5fX3R5cGUpIHtcbiAgICAgIGNvbXBhcmVUbyA9IFBhcnNlLl9kZWNvZGUoa2V5LCBjb21wYXJlVG8pO1xuICAgIH1cbiAgICBzd2l0Y2ggKGNvbmRpdGlvbikge1xuICAgICAgY2FzZSAnJGx0JzpcbiAgICAgICAgaWYgKG9iamVjdFtrZXldID49IGNvbXBhcmVUbykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRsdGUnOlxuICAgICAgICBpZiAob2JqZWN0W2tleV0gPiBjb21wYXJlVG8pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckZ3QnOlxuICAgICAgICBpZiAob2JqZWN0W2tleV0gPD0gY29tcGFyZVRvKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGd0ZSc6XG4gICAgICAgIGlmIChvYmplY3Rba2V5XSA8IGNvbXBhcmVUbykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRlcSc6XG4gICAgICAgIGlmICghZXF1YWxPYmplY3RzKG9iamVjdFtrZXldLCBjb21wYXJlVG8pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG5lJzpcbiAgICAgICAgaWYgKGVxdWFsT2JqZWN0cyhvYmplY3Rba2V5XSwgY29tcGFyZVRvKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRpbic6XG4gICAgICAgIGlmICghY29udGFpbnMoY29tcGFyZVRvLCBvYmplY3Rba2V5XSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbmluJzpcbiAgICAgICAgaWYgKGNvbnRhaW5zKGNvbXBhcmVUbywgb2JqZWN0W2tleV0pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGFsbCc6XG4gICAgICAgIGlmICghb2JqZWN0W2tleV0pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbXBhcmVUby5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmIChvYmplY3Rba2V5XS5pbmRleE9mKGNvbXBhcmVUb1tpXSkgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJGV4aXN0cyc6IHtcbiAgICAgICAgY29uc3QgcHJvcGVydHlFeGlzdHMgPSB0eXBlb2Ygb2JqZWN0W2tleV0gIT09ICd1bmRlZmluZWQnO1xuICAgICAgICBjb25zdCBleGlzdGVuY2VJc1JlcXVpcmVkID0gY29uc3RyYWludHNbJyRleGlzdHMnXTtcbiAgICAgICAgaWYgKHR5cGVvZiBjb25zdHJhaW50c1snJGV4aXN0cyddICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAvLyBUaGUgU0RLIHdpbGwgbmV2ZXIgc3VibWl0IGEgbm9uLWJvb2xlYW4gZm9yICRleGlzdHMsIGJ1dCBpZiBzb21lb25lXG4gICAgICAgICAgLy8gdHJpZXMgdG8gc3VibWl0IGEgbm9uLWJvb2xlYW4gZm9yICRleGl0cyBvdXRzaWRlIHRoZSBTREtzLCBqdXN0IGlnbm9yZSBpdC5cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBpZiAoKCFwcm9wZXJ0eUV4aXN0cyAmJiBleGlzdGVuY2VJc1JlcXVpcmVkKSB8fCAocHJvcGVydHlFeGlzdHMgJiYgIWV4aXN0ZW5jZUlzUmVxdWlyZWQpKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJHJlZ2V4Jzoge1xuICAgICAgICBpZiAodHlwZW9mIGNvbXBhcmVUbyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBpZiAoIXNhZmVSZWdleFRlc3QoY29tcGFyZVRvLnNvdXJjZSwgY29tcGFyZVRvLmZsYWdzLCBvYmplY3Rba2V5XSkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSlMgZG9lc24ndCBzdXBwb3J0IHBlcmwtc3R5bGUgZXNjYXBpbmdcbiAgICAgICAgdmFyIGV4cFN0cmluZyA9ICcnO1xuICAgICAgICB2YXIgZXNjYXBlRW5kID0gLTI7XG4gICAgICAgIHZhciBlc2NhcGVTdGFydCA9IGNvbXBhcmVUby5pbmRleE9mKCdcXFxcUScpO1xuICAgICAgICB3aGlsZSAoZXNjYXBlU3RhcnQgPiAtMSkge1xuICAgICAgICAgIC8vIEFkZCB0aGUgdW5lc2NhcGVkIHBvcnRpb25cbiAgICAgICAgICBleHBTdHJpbmcgKz0gY29tcGFyZVRvLnN1YnN0cmluZyhlc2NhcGVFbmQgKyAyLCBlc2NhcGVTdGFydCk7XG4gICAgICAgICAgZXNjYXBlRW5kID0gY29tcGFyZVRvLmluZGV4T2YoJ1xcXFxFJywgZXNjYXBlU3RhcnQpO1xuICAgICAgICAgIGlmIChlc2NhcGVFbmQgPiAtMSkge1xuICAgICAgICAgICAgZXhwU3RyaW5nICs9IGNvbXBhcmVUb1xuICAgICAgICAgICAgICAuc3Vic3RyaW5nKGVzY2FwZVN0YXJ0ICsgMiwgZXNjYXBlRW5kKVxuICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFxcXFxcXFxcXFxcXEUvZywgJ1xcXFxFJylcbiAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcVy9nLCAnXFxcXCQmJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZXNjYXBlU3RhcnQgPSBjb21wYXJlVG8uaW5kZXhPZignXFxcXFEnLCBlc2NhcGVFbmQpO1xuICAgICAgICB9XG4gICAgICAgIGV4cFN0cmluZyArPSBjb21wYXJlVG8uc3Vic3RyaW5nKE1hdGgubWF4KGVzY2FwZVN0YXJ0LCBlc2NhcGVFbmQgKyAyKSk7XG4gICAgICAgIGlmICghc2FmZVJlZ2V4VGVzdChleHBTdHJpbmcsIGNvbnN0cmFpbnRzLiRvcHRpb25zIHx8ICcnLCBvYmplY3Rba2V5XSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckbmVhclNwaGVyZSc6XG4gICAgICAgIGlmICghY29tcGFyZVRvIHx8ICFvYmplY3Rba2V5XSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgZGlzdGFuY2UgPSBjb21wYXJlVG8ucmFkaWFuc1RvKG9iamVjdFtrZXldKTtcbiAgICAgICAgdmFyIG1heCA9IGNvbnN0cmFpbnRzLiRtYXhEaXN0YW5jZSB8fCBJbmZpbml0eTtcbiAgICAgICAgcmV0dXJuIGRpc3RhbmNlIDw9IG1heDtcbiAgICAgIGNhc2UgJyR3aXRoaW4nOlxuICAgICAgICBpZiAoIWNvbXBhcmVUbyB8fCAhb2JqZWN0W2tleV0pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNvdXRoV2VzdCA9IGNvbXBhcmVUby4kYm94WzBdO1xuICAgICAgICB2YXIgbm9ydGhFYXN0ID0gY29tcGFyZVRvLiRib3hbMV07XG4gICAgICAgIGlmIChzb3V0aFdlc3QubGF0aXR1ZGUgPiBub3J0aEVhc3QubGF0aXR1ZGUgfHwgc291dGhXZXN0LmxvbmdpdHVkZSA+IG5vcnRoRWFzdC5sb25naXR1ZGUpIHtcbiAgICAgICAgICAvLyBJbnZhbGlkIGJveCwgY3Jvc3NlcyB0aGUgZGF0ZSBsaW5lXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgb2JqZWN0W2tleV0ubGF0aXR1ZGUgPiBzb3V0aFdlc3QubGF0aXR1ZGUgJiZcbiAgICAgICAgICBvYmplY3Rba2V5XS5sYXRpdHVkZSA8IG5vcnRoRWFzdC5sYXRpdHVkZSAmJlxuICAgICAgICAgIG9iamVjdFtrZXldLmxvbmdpdHVkZSA+IHNvdXRoV2VzdC5sb25naXR1ZGUgJiZcbiAgICAgICAgICBvYmplY3Rba2V5XS5sb25naXR1ZGUgPCBub3J0aEVhc3QubG9uZ2l0dWRlXG4gICAgICAgICk7XG4gICAgICBjYXNlICckY29udGFpbmVkQnknOiB7XG4gICAgICAgIGZvciAoY29uc3QgdmFsdWUgb2Ygb2JqZWN0W2tleV0pIHtcbiAgICAgICAgICBpZiAoIWNvbnRhaW5zKGNvbXBhcmVUbywgdmFsdWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb1dpdGhpbic6IHtcbiAgICAgICAgaWYgKGNvbXBhcmVUby4kcG9seWdvbikge1xuICAgICAgICAgIGNvbnN0IHBvaW50cyA9IGNvbXBhcmVUby4kcG9seWdvbi5tYXAoZ2VvUG9pbnQgPT4gW1xuICAgICAgICAgICAgZ2VvUG9pbnQubGF0aXR1ZGUsXG4gICAgICAgICAgICBnZW9Qb2ludC5sb25naXR1ZGUsXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgY29uc3QgcG9seWdvbiA9IG5ldyBQYXJzZS5Qb2x5Z29uKHBvaW50cyk7XG4gICAgICAgICAgcmV0dXJuIHBvbHlnb24uY29udGFpbnNQb2ludChvYmplY3Rba2V5XSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbXBhcmVUby4kY2VudGVyU3BoZXJlKSB7XG4gICAgICAgICAgY29uc3QgW1dHUzg0UG9pbnQsIG1heERpc3RhbmNlXSA9IGNvbXBhcmVUby4kY2VudGVyU3BoZXJlO1xuICAgICAgICAgIGNvbnN0IGNlbnRlclBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHtcbiAgICAgICAgICAgIGxhdGl0dWRlOiBXR1M4NFBvaW50WzFdLFxuICAgICAgICAgICAgbG9uZ2l0dWRlOiBXR1M4NFBvaW50WzBdLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvbnN0IHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KG9iamVjdFtrZXldKTtcbiAgICAgICAgICBjb25zdCBkaXN0YW5jZSA9IHBvaW50LnJhZGlhbnNUbyhjZW50ZXJQb2ludCk7XG4gICAgICAgICAgcmV0dXJuIGRpc3RhbmNlIDw9IG1heERpc3RhbmNlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb0ludGVyc2VjdHMnOiB7XG4gICAgICAgIGNvbnN0IHBvbHlnb24gPSBuZXcgUGFyc2UuUG9seWdvbihvYmplY3Rba2V5XS5jb29yZGluYXRlcyk7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KGNvbXBhcmVUby4kcG9pbnQpO1xuICAgICAgICByZXR1cm4gcG9seWdvbi5jb250YWluc1BvaW50KHBvaW50KTtcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRvcHRpb25zJzpcbiAgICAgICAgLy8gTm90IGEgcXVlcnkgdHlwZSwgYnV0IGEgd2F5IHRvIGFkZCBvcHRpb25zIHRvICRyZWdleC4gSWdub3JlIGFuZFxuICAgICAgICAvLyBhdm9pZCB0aGUgZGVmYXVsdFxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZSc6XG4gICAgICAgIC8vIE5vdCBhIHF1ZXJ5IHR5cGUsIGJ1dCBhIHdheSB0byBhZGQgYSBjYXAgdG8gJG5lYXJTcGhlcmUuIElnbm9yZSBhbmRcbiAgICAgICAgLy8gYXZvaWQgdGhlIGRlZmF1bHRcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckc2VsZWN0JzpcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgY2FzZSAnJGRvbnRTZWxlY3QnOlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG52YXIgUXVlcnlUb29scyA9IHtcbiAgcXVlcnlIYXNoOiBxdWVyeUhhc2gsXG4gIG1hdGNoZXNRdWVyeTogbWF0Y2hlc1F1ZXJ5LFxuICBzZXRSZWdleFRpbWVvdXQ6IHNldFJlZ2V4VGltZW91dCxcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUXVlcnlUb29scztcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxJQUFJQSxZQUFZLEdBQUdDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztBQUM1QyxJQUFJQyxFQUFFLEdBQUdELE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDeEIsSUFBSUUsS0FBSyxHQUFHRixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ2pDLElBQUlHLEVBQUUsR0FBR0gsT0FBTyxDQUFDLElBQUksQ0FBQztBQUN0QixJQUFJSSxNQUFNLEdBQUdKLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQ0ssT0FBTztBQUV6QyxJQUFJQyxZQUFZLEdBQUcsQ0FBQztBQUNwQixJQUFJQyxTQUFTLEdBQUdKLEVBQUUsQ0FBQ0ssYUFBYSxDQUFDQyxNQUFNLENBQUNDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNyRCxJQUFJQyxXQUFXLEdBQUcsSUFBSUMsR0FBRyxDQUFDLENBQUM7QUFDM0IsSUFBSUMsZ0JBQWdCLEdBQUcsSUFBSTtBQUUzQixTQUFTQyxlQUFlQSxDQUFDQyxFQUFFLEVBQUU7RUFDM0JULFlBQVksR0FBR1MsRUFBRTtBQUNuQjtBQUVB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