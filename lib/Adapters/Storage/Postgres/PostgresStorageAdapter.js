"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PostgresStorageAdapter = void 0;
var _PostgresClient = require("./PostgresClient");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _uuid = require("uuid");
var _sql = _interopRequireDefault(require("./sql"));
var _StorageAdapter = require("../StorageAdapter");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } // -disable-next
// -disable-next
// -disable-next
const Utils = require('../../../Utils');
const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresUniqueIndexViolationError = '23505';
const logger = require('../../../logger');
const debug = function (...args) {
  args = ['PG: ' + arguments[0]].concat(args.slice(1, args.length));
  const log = logger.getLogger();
  log.debug.apply(log, args);
};
const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String':
      return 'text';
    case 'Date':
      return 'timestamp with time zone';
    case 'Object':
      return 'jsonb';
    case 'File':
      return 'text';
    case 'Boolean':
      return 'boolean';
    case 'Pointer':
      return 'text';
    case 'Number':
      return 'double precision';
    case 'GeoPoint':
      return 'point';
    case 'Bytes':
      return 'jsonb';
    case 'Polygon':
      return 'polygon';
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        return 'jsonb';
      }
    default:
      throw `no type for ${JSON.stringify(type)} yet`;
  }
};
const ParseToPosgresComparator = {
  $gt: '>',
  $lt: '<',
  $gte: '>=',
  $lte: '<='
};
const mongoAggregateToPostgres = {
  $dayOfMonth: 'DAY',
  $dayOfWeek: 'DOW',
  $dayOfYear: 'DOY',
  $isoDayOfWeek: 'ISODOW',
  $isoWeekYear: 'ISOYEAR',
  $hour: 'HOUR',
  $minute: 'MINUTE',
  $second: 'SECOND',
  $millisecond: 'MILLISECONDS',
  $month: 'MONTH',
  $week: 'WEEK',
  $year: 'YEAR'
};
const toPostgresValue = value => {
  if (typeof value === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }
    if (value.__type === 'File') {
      return value.name;
    }
  }
  return value;
};
const toPostgresValueCastType = value => {
  const postgresValue = toPostgresValue(value);
  let castType;
  switch (typeof postgresValue) {
    case 'number':
      castType = 'double precision';
      break;
    case 'boolean':
      castType = 'boolean';
      break;
    default:
      castType = undefined;
  }
  return castType;
};
const transformValue = value => {
  if (typeof value === 'object' && value.__type === 'Pointer') {
    return value.objectId;
  }
  return value;
};

// Duplicate from then mongo adapter...
const emptyCLPS = Object.freeze({
  find: {},
  get: {},
  count: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {}
});
const defaultCLPS = Object.freeze({
  find: {
    '*': true
  },
  get: {
    '*': true
  },
  count: {
    '*': true
  },
  create: {
    '*': true
  },
  update: {
    '*': true
  },
  delete: {
    '*': true
  },
  addField: {
    '*': true
  },
  protectedFields: {
    '*': []
  }
});
const toParseSchema = schema => {
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }
  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }
  let clps = defaultCLPS;
  if (schema.classLevelPermissions) {
    clps = _objectSpread(_objectSpread({}, emptyCLPS), schema.classLevelPermissions);
  }
  let indexes = {};
  if (schema.indexes) {
    indexes = _objectSpread({}, schema.indexes);
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes
  };
};
const toPostgresSchema = schema => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  schema.fields._rperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  if (schema.className === '_User') {
    schema.fields._hashed_password = {
      type: 'String'
    };
    schema.fields._password_history = {
      type: 'Array'
    };
  }
  return schema;
};
const isArrayIndex = arrayIndex => Array.from(arrayIndex).every(c => c >= '0' && c <= '9');
const handleDotFields = object => {
  Object.keys(object).forEach(fieldName => {
    if (fieldName.indexOf('.') > -1) {
      const components = fieldName.split('.');
      const first = components.shift();
      object[first] = object[first] || {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];
      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      /* eslint-disable no-cond-assign */
      while (next = components.shift()) {
        /* eslint-enable no-cond-assign */
        currentObj[next] = currentObj[next] || {};
        if (components.length === 0) {
          currentObj[next] = value;
        }
        currentObj = currentObj[next];
      }
      delete object[fieldName];
    }
  });
  return object;
};
const transformDotFieldToComponents = fieldName => {
  return fieldName.split('.').map((cmpt, index) => {
    if (index === 0) {
      return `"${cmpt}"`;
    }
    if (isArrayIndex(cmpt)) {
      return Number(cmpt);
    } else {
      return `'${cmpt}'`;
    }
  });
};
const transformDotField = fieldName => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName}"`;
  }
  const components = transformDotFieldToComponents(fieldName);
  let name = components.slice(0, components.length - 1).join('->');
  name += '->>' + components[components.length - 1];
  return name;
};
const transformAggregateField = fieldName => {
  if (typeof fieldName !== 'string') {
    return fieldName;
  }
  if (fieldName === '$_created_at') {
    return 'createdAt';
  }
  if (fieldName === '$_updated_at') {
    return 'updatedAt';
  }
  return fieldName.substring(1);
};
const validateKeys = object => {
  if (typeof object == 'object') {
    for (const key in object) {
      if (typeof object[key] == 'object') {
        validateKeys(object[key]);
      }
      if (key.includes('$') || key.includes('.')) {
        throw new _node.default.Error(_node.default.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
      }
    }
  }
};

// Returns the list of join tables on a schema
const joinTablesForSchema = schema => {
  const list = [];
  if (schema) {
    Object.keys(schema.fields).forEach(field => {
      if (schema.fields[field].type === 'Relation') {
        list.push(`_Join:${field}:${schema.className}`);
      }
    });
  }
  return list;
};
const buildWhereClause = ({
  schema,
  query,
  index,
  caseInsensitive
}) => {
  const patterns = [];
  let values = [];
  const sorts = [];
  schema = toPostgresSchema(schema);
  for (const fieldName in query) {
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const initialPatternsLength = patterns.length;
    const fieldValue = query[fieldName];

    // nothing in the schema, it's gonna blow up
    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue && fieldValue.$exists === false) {
        continue;
      }
    }
    const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
    if (authDataMatch) {
      // TODO: Handle querying by _auth_data_provider, authData is stored in authData field
      continue;
    } else if (caseInsensitive && (fieldName === 'username' || fieldName === 'email')) {
      patterns.push(`LOWER($${index}:name) = LOWER($${index + 1})`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldName.indexOf('.') >= 0) {
      let name = transformDotField(fieldName);
      if (fieldValue === null) {
        patterns.push(`$${index}:raw IS NULL`);
        values.push(name);
        index += 1;
        continue;
      } else {
        if (fieldValue.$in) {
          name = transformDotFieldToComponents(fieldName).join('->');
          patterns.push(`($${index}:raw)::jsonb @> $${index + 1}::jsonb`);
          values.push(name, JSON.stringify(fieldValue.$in));
          index += 2;
        } else if (fieldValue.$regex) {
          // Handle later
        } else if (typeof fieldValue !== 'object') {
          patterns.push(`$${index}:raw = $${index + 1}::text`);
          values.push(name, fieldValue);
          index += 2;
        }
      }
    } else if (fieldValue === null || fieldValue === undefined) {
      patterns.push(`$${index}:name IS NULL`);
      values.push(fieldName);
      index += 1;
      continue;
    } else if (typeof fieldValue === 'string') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'boolean') {
      patterns.push(`$${index}:name = $${index + 1}`);
      // Can't cast boolean to double precision
      if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Number') {
        // Should always return zero results
        const MAX_INT_PLUS_ONE = 9223372036854775808;
        values.push(fieldName, MAX_INT_PLUS_ONE);
      } else {
        values.push(fieldName, fieldValue);
      }
      index += 2;
    } else if (typeof fieldValue === 'number') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (['$or', '$nor', '$and'].includes(fieldName)) {
      const clauses = [];
      const clauseValues = [];
      fieldValue.forEach(subQuery => {
        const clause = buildWhereClause({
          schema,
          query: subQuery,
          index,
          caseInsensitive
        });
        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push(...clause.values);
          index += clause.values.length;
        }
      });
      const orOrAnd = fieldName === '$and' ? ' AND ' : ' OR ';
      const not = fieldName === '$nor' ? ' NOT ' : '';
      patterns.push(`${not}(${clauses.join(orOrAnd)})`);
      values.push(...clauseValues);
    }
    if (fieldValue.$ne !== undefined) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push(`NOT array_contains($${index}:name, $${index + 1})`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name IS NOT NULL`);
          values.push(fieldName);
          index += 1;
          continue;
        } else {
          // if not null, we need to manually exclude null
          if (fieldValue.$ne.__type === 'GeoPoint') {
            patterns.push(`($${index}:name <> POINT($${index + 1}, $${index + 2}) OR $${index}:name IS NULL)`);
          } else {
            if (fieldName.indexOf('.') >= 0) {
              const castType = toPostgresValueCastType(fieldValue.$ne);
              const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
              patterns.push(`(${constraintFieldName} <> $${index + 1} OR ${constraintFieldName} IS NULL)`);
            } else if (typeof fieldValue.$ne === 'object' && fieldValue.$ne.$relativeTime) {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
            } else {
              patterns.push(`($${index}:name <> $${index + 1} OR $${index}:name IS NULL)`);
            }
          }
        }
      }
      if (fieldValue.$ne.__type === 'GeoPoint') {
        const point = fieldValue.$ne;
        values.push(fieldName, point.longitude, point.latitude);
        index += 3;
      } else {
        // TODO: support arrays
        values.push(fieldName, fieldValue.$ne);
        index += 2;
      }
    }
    if (fieldValue.$eq !== undefined) {
      if (fieldValue.$eq === null) {
        patterns.push(`$${index}:name IS NULL`);
        values.push(fieldName);
        index += 1;
      } else {
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue.$eq);
          const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
          values.push(fieldValue.$eq);
          patterns.push(`${constraintFieldName} = $${index++}`);
        } else if (typeof fieldValue.$eq === 'object' && fieldValue.$eq.$relativeTime) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
        } else {
          values.push(fieldName, fieldValue.$eq);
          patterns.push(`$${index}:name = $${index + 1}`);
          index += 2;
        }
      }
    }
    const isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);
    if (Array.isArray(fieldValue.$in) && isArrayField && schema.fields[fieldName].contents && schema.fields[fieldName].contents.type === 'String') {
      const inPatterns = [];
      let allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        if (listElem === null) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push(`$${index + 1 + listIndex - (allowNull ? 1 : 0)}`);
        }
      });
      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR $${index}:name && ARRAY[${inPatterns.join()}])`);
      } else {
        patterns.push(`$${index}:name && ARRAY[${inPatterns.join()}]`);
      }
      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        const not = notIn ? ' NOT ' : '';
        if (baseArray.length > 0) {
          if (isArrayField) {
            patterns.push(`${not} array_contains($${index}:name, $${index + 1})`);
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            // Handle Nested Dot Notation Above
            if (fieldName.indexOf('.') >= 0) {
              return;
            }
            const inPatterns = [];
            values.push(fieldName);
            baseArray.forEach((listElem, listIndex) => {
              if (listElem != null) {
                values.push(listElem);
                inPatterns.push(`$${index + 1 + listIndex}`);
              }
            });
            patterns.push(`$${index}:name ${not} IN (${inPatterns.join()})`);
            index = index + 1 + inPatterns.length;
          }
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push(`$${index}:name IS NULL`);
          index = index + 1;
        } else {
          // Handle empty array
          if (notIn) {
            patterns.push('1 = 1'); // Return all values
          } else {
            patterns.push('1 = 2'); // Return no values
          }
        }
      };
      if (fieldValue.$in) {
        createConstraint(_lodash.default.flatMap(fieldValue.$in, elt => elt), false);
      }
      if (fieldValue.$nin) {
        createConstraint(_lodash.default.flatMap(fieldValue.$nin, elt => elt), true);
      }
    } else if (typeof fieldValue.$in !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $in value');
    } else if (typeof fieldValue.$nin !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $nin value');
    }
    if (Array.isArray(fieldValue.$all) && isArrayField) {
      if (isAnyValueRegexStartsWith(fieldValue.$all)) {
        if (!isAllValuesRegexOrNone(fieldValue.$all)) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + fieldValue.$all);
        }
        for (let i = 0; i < fieldValue.$all.length; i += 1) {
          const value = processRegexPattern(fieldValue.$all[i].$regex);
          fieldValue.$all[i] = value.substring(1) + '%';
        }
        patterns.push(`array_contains_all_regex($${index}:name, $${index + 1}::jsonb)`);
      } else {
        patterns.push(`array_contains_all($${index}:name, $${index + 1}::jsonb)`);
      }
      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index += 2;
    } else if (Array.isArray(fieldValue.$all)) {
      if (fieldValue.$all.length === 1) {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.$all[0].objectId);
        index += 2;
      }
    }
    if (typeof fieldValue.$exists !== 'undefined') {
      if (typeof fieldValue.$exists === 'object' && fieldValue.$exists.$relativeTime) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
      } else if (fieldValue.$exists) {
        patterns.push(`$${index}:name IS NOT NULL`);
      } else {
        patterns.push(`$${index}:name IS NULL`);
      }
      values.push(fieldName);
      index += 1;
    }
    if (fieldValue.$containedBy) {
      const arr = fieldValue.$containedBy;
      if (!(arr instanceof Array)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $containedBy: should be an array`);
      }
      patterns.push(`$${index}:name <@ $${index + 1}::jsonb`);
      values.push(fieldName, JSON.stringify(arr));
      index += 2;
    }
    if (fieldValue.$text) {
      const search = fieldValue.$text.$search;
      let language = 'english';
      if (typeof search !== 'object') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $search, should be object`);
      }
      if (!search.$term || typeof search.$term !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $term, should be string`);
      }
      if (search.$language && typeof search.$language !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $language, should be string`);
      } else if (search.$language) {
        language = search.$language;
      }
      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
      } else if (search.$caseSensitive) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive not supported, please use $regex or create a separate lower case column.`);
      }
      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
      } else if (search.$diacriticSensitive === false) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive - false not supported, install Postgres Unaccent Extension`);
      }
      patterns.push(`to_tsvector($${index}, $${index + 1}:name) @@ to_tsquery($${index + 2}, $${index + 3})`);
      values.push(language, fieldName, language, search.$term);
      index += 4;
    }
    if (fieldValue.$nearSphere) {
      const point = fieldValue.$nearSphere;
      const distance = fieldValue.$maxDistance;
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      sorts.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) ASC`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$within && fieldValue.$within.$box) {
      const box = fieldValue.$within.$box;
      const left = box[0].longitude;
      const bottom = box[0].latitude;
      const right = box[1].longitude;
      const top = box[1].latitude;
      patterns.push(`$${index}:name::point <@ $${index + 1}::box`);
      values.push(fieldName, `((${left}, ${bottom}), (${right}, ${top}))`);
      index += 2;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$centerSphere) {
      const centerSphere = fieldValue.$geoWithin.$centerSphere;
      if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
      }
      // Get point, convert to geo point if necessary and validate
      let point = centerSphere[0];
      if (point instanceof Array && point.length === 2) {
        point = new _node.default.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
      }
      _node.default.GeoPoint._validate(point.latitude, point.longitude);
      // Get distance and validate
      const distance = centerSphere[1];
      if (isNaN(distance) || distance < 0) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
      }
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$polygon) {
      const polygon = fieldValue.$geoWithin.$polygon;
      let points;
      if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
        }
        points = polygon.coordinates;
      } else if (polygon instanceof Array) {
        if (polygon.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
        }
        points = polygon;
      } else {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
      }
      points = points.map(point => {
        if (point instanceof Array && point.length === 2) {
          _node.default.GeoPoint._validate(point[1], point[0]);
          return `(${point[0]}, ${point[1]})`;
        }
        if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          _node.default.GeoPoint._validate(point.latitude, point.longitude);
        }
        return `(${point.longitude}, ${point.latitude})`;
      }).join(', ');
      patterns.push(`$${index}:name::point <@ $${index + 1}::polygon`);
      values.push(fieldName, `(${points})`);
      index += 2;
    }
    if (fieldValue.$geoIntersects && fieldValue.$geoIntersects.$point) {
      const point = fieldValue.$geoIntersects.$point;
      if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
      } else {
        _node.default.GeoPoint._validate(point.latitude, point.longitude);
      }
      patterns.push(`$${index}:name::polygon @> $${index + 1}::point`);
      values.push(fieldName, `(${point.longitude}, ${point.latitude})`);
      index += 2;
    }
    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = '~';
      const opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }
        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }
      const name = transformDotField(fieldName);
      regex = processRegexPattern(regex);
      patterns.push(`$${index}:raw ${operator} '$${index + 1}:raw'`);
      values.push(name, regex);
      index += 2;
    }
    if (fieldValue.__type === 'Pointer') {
      if (isArrayField) {
        patterns.push(`array_contains($${index}:name, $${index + 1})`);
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
    }
    if (fieldValue.__type === 'Date') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }
    if (fieldValue.__type === 'GeoPoint') {
      patterns.push(`$${index}:name ~= POINT($${index + 1}, $${index + 2})`);
      values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
      index += 3;
    }
    if (fieldValue.__type === 'Polygon') {
      const value = convertPolygonToSQL(fieldValue.coordinates);
      patterns.push(`$${index}:name ~= $${index + 1}::polygon`);
      values.push(fieldName, value);
      index += 2;
    }
    Object.keys(ParseToPosgresComparator).forEach(cmp => {
      if (fieldValue[cmp] || fieldValue[cmp] === 0) {
        const pgComparator = ParseToPosgresComparator[cmp];
        let constraintFieldName;
        let postgresValue = toPostgresValue(fieldValue[cmp]);
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue[cmp]);
          constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
        } else {
          if (typeof postgresValue === 'object' && postgresValue.$relativeTime) {
            if (schema.fields[fieldName].type !== 'Date') {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }
            const parserResult = Utils.relativeTimeToDate(postgresValue.$relativeTime);
            if (parserResult.status === 'success') {
              postgresValue = toPostgresValue(parserResult.result);
            } else {
              console.error('Error while parsing relative date', parserResult);
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $relativeTime (${postgresValue.$relativeTime}) value. ${parserResult.info}`);
            }
          }
          constraintFieldName = `$${index++}:name`;
          values.push(fieldName);
        }
        values.push(postgresValue);
        patterns.push(`${constraintFieldName} ${pgComparator} $${index++}`);
      }
    });
    if (initialPatternsLength === patterns.length) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this query type yet ${JSON.stringify(fieldValue)}`);
    }
  }
  values = values.map(transformValue);
  return {
    pattern: patterns.join(' AND '),
    values,
    sorts
  };
};
class PostgresStorageAdapter {
  // Private

  constructor({
    uri,
    collectionPrefix = '',
    databaseOptions = {}
  }) {
    const options = _objectSpread({}, databaseOptions);
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    this.schemaCacheTtl = databaseOptions.schemaCacheTtl;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl']) {
      delete options[key];
    }
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, options);
    this._client = client;
    this._onchange = () => {};
    this._pgp = pgp;
    this._uuid = (0, _uuid.v4)();
    this.canSortOnJoinTables = false;
  }
  watch(callback) {
    this._onchange = callback;
  }

  //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.
  createExplainableQuery(query, analyze = false) {
    if (analyze) {
      return 'EXPLAIN (ANALYZE, FORMAT JSON) ' + query;
    } else {
      return 'EXPLAIN (FORMAT JSON) ' + query;
    }
  }
  handleShutdown() {
    if (this._stream) {
      this._stream.done();
      delete this._stream;
    }
    if (!this._client) {
      return;
    }
    this._client.$pool.end();
  }
  async _listenToSchema() {
    if (!this._stream && this.enableSchemaHooks) {
      this._stream = await this._client.connect({
        direct: true
      });
      this._stream.client.on('notification', data => {
        const payload = JSON.parse(data.payload);
        if (payload.senderId !== this._uuid) {
          this._onchange();
        }
      });
      await this._stream.none('LISTEN $1~', 'schema.change');
    }
  }
  _notifySchemaChange() {
    if (this._stream) {
      this._stream.none('NOTIFY $1~, $2', ['schema.change', {
        senderId: this._uuid
      }]).catch(error => {
        console.log('Failed to Notify:', error); // unlikely to ever happen
      });
    }
  }
  async _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    await conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      throw error;
    });
  }
  async classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }
  async setClassLevelPermissions(className, CLPs) {
    await this._client.task('set-class-level-permissions', async t => {
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1`, values);
    });
    this._notifySchemaChange();
  }
  async setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields, conn) {
    conn = conn || this._client;
    const self = this;
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }
    const deletedIndexes = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }
      if (field.__op === 'Delete') {
        deletedIndexes.push(name);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!Object.prototype.hasOwnProperty.call(fields, key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    await conn.tx('set-indexes-with-schema-format', async t => {
      if (insertedIndexes.length > 0) {
        await self.createIndexes(className, insertedIndexes, t);
      }
      if (deletedIndexes.length > 0) {
        await self.dropIndexes(className, deletedIndexes, t);
      }
      await t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
    this._notifySchemaChange();
  }
  async createClass(className, schema, conn) {
    conn = conn || this._client;
    const parseSchema = await conn.tx('create-class', async t => {
      await this.createTable(className, schema, t);
      await t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', {
        className,
        schema
      });
      await this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
      return toParseSchema(schema);
    }).catch(err => {
      if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
      }
      throw err;
    });
    this._notifySchemaChange();
    return parseSchema;
  }

  // Just create a table, do not insert in schema
  async createTable(className, schema, conn) {
    conn = conn || this._client;
    debug('createTable');
    const valuesArray = [];
    const patternsArray = [];
    const fields = Object.assign({}, schema.fields);
    if (className === '_User') {
      fields._email_verify_token_expires_at = {
        type: 'Date'
      };
      fields._email_verify_token = {
        type: 'String'
      };
      fields._account_lockout_expires_at = {
        type: 'Date'
      };
      fields._failed_login_count = {
        type: 'Number'
      };
      fields._perishable_token = {
        type: 'String'
      };
      fields._perishable_token_expires_at = {
        type: 'Date'
      };
      fields._password_changed_at = {
        type: 'Date'
      };
      fields._password_history = {
        type: 'Array'
      };
    }
    let index = 2;
    const relations = [];
    Object.keys(fields).forEach(fieldName => {
      const parseType = fields[fieldName];
      // Skip when it's a relation
      // We'll create the tables later
      if (parseType.type === 'Relation') {
        relations.push(fieldName);
        return;
      }
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        parseType.contents = {
          type: 'String'
        };
      }
      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index}:name $${index + 1}:raw`);
      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`);
      }
      index = index + 2;
    });
    const qs = `CREATE TABLE IF NOT EXISTS $1:name (${patternsArray.join()})`;
    const values = [className, ...valuesArray];
    return conn.task('create-table', async t => {
      try {
        await t.none(qs, values);
      } catch (error) {
        if (error.code !== PostgresDuplicateRelationError) {
          throw error;
        }
        // ELSE: Table already exists, must have been created by a different request. Ignore the error.
      }
      await t.tx('create-table-tx', tx => {
        return tx.batch(relations.map(fieldName => {
          return tx.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
            joinTable: `_Join:${fieldName}:${className}`
          });
        }));
      });
    });
  }
  async schemaUpgrade(className, schema, conn) {
    debug('schemaUpgrade');
    conn = conn || this._client;
    const self = this;
    await conn.task('schema-upgrade', async t => {
      const columns = await t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName]));
      await t.batch(newColumns);
    });
  }
  async addFieldIfNotExists(className, fieldName, type) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists');
    const self = this;
    await this._client.tx('add-field-if-not-exists', async t => {
      if (type.type !== 'Relation') {
        try {
          await t.none('ALTER TABLE $<className:name> ADD COLUMN IF NOT EXISTS $<fieldName:name> $<postgresType:raw>', {
            className,
            fieldName,
            postgresType: parseTypeToPostgresType(type)
          });
        } catch (error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return self.createClass(className, {
              fields: {
                [fieldName]: type
              }
            }, t);
          }
          if (error.code !== PostgresDuplicateColumnError) {
            throw error;
          }
          // Column already exists, created by other request. Carry on to see if it's the right type.
        }
      } else {
        await t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
          joinTable: `_Join:${fieldName}:${className}`
        });
      }
      const result = await t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className> and ("schema"::json->\'fields\'->$<fieldName>) is not null', {
        className,
        fieldName
      });
      if (result[0]) {
        throw 'Attempted to add a field that already exists';
      } else {
        const path = `{fields,${fieldName}}`;
        await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
          path,
          type,
          className
        });
      }
    });
    this._notifySchemaChange();
  }
  async updateFieldOptions(className, fieldName, type) {
    await this._client.tx('update-schema-field-options', async t => {
      const path = `{fields,${fieldName}}`;
      await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
        path,
        type,
        className
      });
    });
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  async deleteClass(className) {
    const operations = [{
      query: `DROP TABLE IF EXISTS $1:name`,
      values: [className]
    }, {
      query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`,
      values: [className]
    }];
    const response = await this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table

    this._notifySchemaChange();
    return response;
  }

  // Delete all data known to this adapter. Used for testing.
  async deleteAllClasses() {
    var _this$_client;
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
    if ((_this$_client = this._client) !== null && _this$_client !== void 0 && _this$_client.$pool.ended) {
      return;
    }
    await this._client.task('delete-all-classes', async t => {
      try {
        const results = await t.any('SELECT * FROM "_SCHEMA"');
        const joins = results.reduce((list, schema) => {
          return list.concat(joinTablesForSchema(schema.schema));
        }, []);
        const classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_JobSchedule', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_Audience', '_Idempotency', ...results.map(result => result.className), ...joins];
        const queries = classes.map(className => ({
          query: 'DROP TABLE IF EXISTS $<className:name>',
          values: {
            className
          }
        }));
        await t.tx(tx => tx.none(helpers.concat(queries)));
      } catch (error) {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        // No _SCHEMA collection. Don't delete anything.
      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  async deleteFields(className, schema, fieldNames) {
    debug('deleteFields');
    fieldNames = fieldNames.reduce((list, fieldName) => {
      const field = schema.fields[fieldName];
      if (field.type !== 'Relation') {
        list.push(fieldName);
      }
      delete schema.fields[fieldName];
      return list;
    }, []);
    const values = [className, ...fieldNames];
    const columns = fieldNames.map((name, idx) => {
      return `$${idx + 2}:name`;
    }).join(', DROP COLUMN');
    await this._client.tx('delete-fields', async t => {
      await t.none('UPDATE "_SCHEMA" SET "schema" = $<schema> WHERE "className" = $<className>', {
        schema,
        className
      });
      if (values.length > 1) {
        await t.none(`ALTER TABLE $1:name DROP COLUMN IF EXISTS ${columns}`, values);
      }
    });
    this._notifySchemaChange();
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  async getAllClasses() {
    return this._client.task('get-all-classes', async t => {
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  async getClass(className) {
    debug('getClass');
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className" = $<className>', {
      className
    }).then(result => {
      if (result.length !== 1) {
        throw undefined;
      }
      return result[0].schema;
    }).then(toParseSchema);
  }

  // TODO: remove the mongo format dependency in the return value
  async createObject(className, schema, object, transactionalSession) {
    debug('createObject');
    let columnsArray = [];
    const valuesArray = [];
    schema = toPostgresSchema(schema);
    const geoPoints = {};
    object = handleDotFields(object);
    validateKeys(object);
    Object.keys(object).forEach(fieldName => {
      if (object[fieldName] === null) {
        return;
      }
      var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      const authDataAlreadyExists = !!object.authData;
      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
        // Avoid adding authData multiple times to the query
        if (authDataAlreadyExists) {
          return;
        }
      }
      columnsArray.push(fieldName);
      if (!schema.fields[fieldName] && className === '_User') {
        if (fieldName === '_email_verify_token' || fieldName === '_failed_login_count' || fieldName === '_perishable_token' || fieldName === '_password_history') {
          valuesArray.push(object[fieldName]);
        }
        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        if (fieldName === '_account_lockout_expires_at' || fieldName === '_perishable_token_expires_at' || fieldName === '_password_changed_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        return;
      }
      switch (schema.fields[fieldName].type) {
        case 'Date':
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
          break;
        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;
        case 'Array':
          if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
            valuesArray.push(object[fieldName]);
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }
          break;
        case 'Object':
        case 'Bytes':
        case 'String':
        case 'Number':
        case 'Boolean':
          valuesArray.push(object[fieldName]);
          break;
        case 'File':
          valuesArray.push(object[fieldName].name);
          break;
        case 'Polygon':
          {
            const value = convertPolygonToSQL(object[fieldName].coordinates);
            valuesArray.push(value);
            break;
          }
        case 'GeoPoint':
          // pop the point and process later
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;
        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
      }
    });
    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    const initialValues = valuesArray.map((val, index) => {
      let termination = '';
      const fieldName = columnsArray[index];
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        termination = '::text[]';
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        termination = '::jsonb';
      }
      return `$${index + 2 + columnsArray.length}${termination}`;
    });
    const geoPointsInjects = Object.keys(geoPoints).map(key => {
      const value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
      const l = valuesArray.length + columnsArray.length;
      return `POINT($${l}, $${l + 1})`;
    });
    const columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join();
    const valuesPattern = initialValues.concat(geoPointsInjects).join();
    const qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`;
    const values = [className, ...columnsArray, ...valuesArray];
    const promise = (transactionalSession ? transactionalSession.t : this._client).none(qs, values).then(() => ({
      ops: [object]
    })).catch(error => {
      if (error.code === PostgresUniqueIndexViolationError) {
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.constraint) {
          const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        error = err;
      }
      throw error;
    });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  async deleteObjectsByQuery(className, schema, query, transactionalSession) {
    debug('deleteObjectsByQuery');
    const values = [className];
    const index = 2;
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    if (Object.keys(query).length === 0) {
      where.pattern = 'TRUE';
    }
    const qs = `WITH deleted AS (DELETE FROM $1:name WHERE ${where.pattern} RETURNING *) SELECT count(*) FROM deleted`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).one(qs, values, a => +a.count).then(count => {
      if (count === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      } else {
        return count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      // ELSE: Don't delete anything if doesn't exist
    });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }
  // Return value not currently well specified.
  async findOneAndUpdate(className, schema, query, update, transactionalSession) {
    debug('findOneAndUpdate');
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  }

  // Apply the update to all objects that match the given Parse Query.
  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery');
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toPostgresSchema(schema);
    const originalUpdate = _objectSpread({}, update);

    // Set flag for dot notation fields
    const dotNotationOptions = {};
    Object.keys(update).forEach(fieldName => {
      if (fieldName.indexOf('.') > -1) {
        const components = fieldName.split('.');
        const first = components.shift();
        dotNotationOptions[first] = true;
      } else {
        dotNotationOptions[fieldName] = false;
      }
    });
    update = handleDotFields(update);
    // Resolve authData first,
    // So we don't end up with multiple key updates
    for (const fieldName in update) {
      const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        const value = update[fieldName];
        delete update[fieldName];
        update['authData'] = update['authData'] || {};
        update['authData'][provider] = value;
      }
    }
    for (const fieldName in update) {
      const fieldValue = update[fieldName];
      // Drop any undefined values.
      if (typeof fieldValue === 'undefined') {
        delete update[fieldName];
      } else if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // This recursively sets the json_object
        // Only 1 level deep
        const generate = (jsonb, key, value) => {
          return `json_object_set_key(COALESCE(${jsonb}, '{}'::jsonb), ${key}, ${value})::jsonb`;
        };
        const lastKey = `$${index}:name`;
        const fieldNameIndex = index;
        index += 1;
        values.push(fieldName);
        const update = Object.keys(fieldValue).reduce((lastKey, key) => {
          const str = generate(lastKey, `$${index}::text`, `$${index + 1}::jsonb`);
          index += 2;
          let value = fieldValue[key];
          if (value) {
            if (value.__op === 'Delete') {
              value = null;
            } else {
              value = JSON.stringify(value);
            }
          }
          values.push(key, value);
          return str;
        }, lastKey);
        updatePatterns.push(`$${fieldNameIndex}:name = ${update}`);
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(`$${index}:name = array_add(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        updatePatterns.push(`$${index}:name = array_remove(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'AddUnique') {
        updatePatterns.push(`$${index}:name = array_add_unique(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldName === 'updatedAt') {
        //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'string') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'boolean') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'Pointer') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      } else if (fieldValue.__type === 'Date') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue instanceof Date) {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'File') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue.__type === 'GeoPoint') {
        updatePatterns.push(`$${index}:name = POINT($${index + 1}, $${index + 2})`);
        values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
        index += 3;
      } else if (fieldValue.__type === 'Polygon') {
        const value = convertPolygonToSQL(fieldValue.coordinates);
        updatePatterns.push(`$${index}:name = $${index + 1}::polygon`);
        values.push(fieldName, value);
        index += 2;
      } else if (fieldValue.__type === 'Relation') {
        // noop
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'object' && schema.fields[fieldName] && schema.fields[fieldName].type === 'Object') {
        // Gather keys to increment
        const keysToIncrement = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set
          // Note that Object.keys is iterating over the **original** update object
          // and that some of the keys of the original update could be null or undefined:
          // (See the above check `if (fieldValue === null || typeof fieldValue == "undefined")`)
          const value = originalUpdate[k];
          return value && value.__op === 'Increment' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        let incrementPatterns = '';
        if (keysToIncrement.length > 0) {
          incrementPatterns = ' || ' + keysToIncrement.map(c => {
            const amount = fieldValue[c].amount;
            return `CONCAT('{"${c}":', COALESCE($${index}:name->>'${c}','0')::int + ${amount}, '}')::jsonb`;
          }).join(' || ');
          // Strip the keys
          keysToIncrement.forEach(key => {
            delete fieldValue[key];
          });
        }
        const keysToDelete = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set.
          const value = originalUpdate[k];
          return value && value.__op === 'Delete' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        const deletePatterns = keysToDelete.reduce((p, c, i) => {
          return p + ` - '$${index + 1 + i}:value'`;
        }, '');
        // Override Object
        let updateObject = "'{}'::jsonb";
        if (dotNotationOptions[fieldName]) {
          // Merge Object
          updateObject = `COALESCE($${index}:name, '{}'::jsonb)`;
        }
        updatePatterns.push(`$${index}:name = (${updateObject} ${deletePatterns} ${incrementPatterns} || $${index + 1 + keysToDelete.length}::jsonb )`);
        values.push(fieldName, ...keysToDelete, JSON.stringify(fieldValue));
        index += 2 + keysToDelete.length;
      } else if (Array.isArray(fieldValue) && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        const expectedType = parseTypeToPostgresType(schema.fields[fieldName]);
        if (expectedType === 'text[]') {
          updatePatterns.push(`$${index}:name = $${index + 1}::text[]`);
          values.push(fieldName, fieldValue);
          index += 2;
        } else {
          updatePatterns.push(`$${index}:name = $${index + 1}::jsonb`);
          values.push(fieldName, JSON.stringify(fieldValue));
          index += 2;
        }
      } else {
        debug('Not supported update', {
          fieldName,
          fieldValue
        });
        return Promise.reject(new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support update ${JSON.stringify(fieldValue)} yet`));
      }
    }
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    const whereClause = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `UPDATE $1:name SET ${updatePatterns.join()} ${whereClause} RETURNING *`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).any(qs, values);
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    debug('upsertOneObject');
    const createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue, transactionalSession).catch(error => {
      // ignore duplicate value errors as it's upsert
      if (error.code !== _node.default.Error.DUPLICATE_VALUE) {
        throw error;
      }
      return this.findOneAndUpdate(className, schema, query, update, transactionalSession);
    });
  }
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    caseInsensitive,
    explain
  }) {
    debug('find');
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `LIMIT $${values.length + 1}` : '';
    if (hasLimit) {
      values.push(limit);
    }
    const skipPattern = hasSkip ? `OFFSET $${values.length + 1}` : '';
    if (hasSkip) {
      values.push(skip);
    }
    let sortPattern = '';
    if (sort) {
      const sortCopy = sort;
      const sorting = Object.keys(sort).map(key => {
        const transformKey = transformDotFieldToComponents(key).join('->');
        // Using $idx pattern gives:  non-integer constant in ORDER BY
        if (sortCopy[key] === 1) {
          return `${transformKey} ASC`;
        }
        return `${transformKey} DESC`;
      }).join();
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }
    if (where.sorts && Object.keys(where.sorts).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join()}`;
    }
    let columns = '*';
    if (keys) {
      // Exclude empty keys
      // Replace ACL by it's keys
      keys = keys.reduce((memo, key) => {
        if (key === 'ACL') {
          memo.push('_rperm');
          memo.push('_wperm');
        } else if (key.length > 0 && (
        // Remove selected field not referenced in the schema
        // Relation is not a column in postgres
        // $score is a Parse special field and is also not a column
        schema.fields[key] && schema.fields[key].type !== 'Relation' || key === '$score')) {
          memo.push(key);
        }
        return memo;
      }, []);
      columns = keys.map((key, index) => {
        if (key === '$score') {
          return `ts_rank_cd(to_tsvector($${2}, $${3}:name), to_tsquery($${4}, $${5}), 32) as score`;
        }
        return `$${index + values.length + 1}:name`;
      }).join();
      values = values.concat(keys);
    }
    const originalQuery = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).catch(error => {
      // Query on non existing table, don't crash
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return [];
    }).then(results => {
      if (explain) {
        return results;
      }
      return results.map(object => this.postgresObjectToParseObject(className, object, schema));
    });
  }

  // Converts from a postgres-format object to a REST-format object.
  // Does not strip out anything based on a lack of authentication.
  postgresObjectToParseObject(className, object, schema) {
    Object.keys(schema.fields).forEach(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
        object[fieldName] = {
          objectId: object[fieldName],
          __type: 'Pointer',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (schema.fields[fieldName].type === 'Relation') {
        object[fieldName] = {
          __type: 'Relation',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
        object[fieldName] = {
          __type: 'GeoPoint',
          latitude: object[fieldName].y,
          longitude: object[fieldName].x
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Polygon') {
        let coords = new String(object[fieldName]);
        coords = coords.substring(2, coords.length - 2).split('),(');
        const updatedCoords = coords.map(point => {
          return [parseFloat(point.split(',')[1]), parseFloat(point.split(',')[0])];
        });
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: updatedCoords
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'File') {
        object[fieldName] = {
          __type: 'File',
          name: object[fieldName]
        };
      }
    });
    //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.
    if (object.createdAt) {
      object.createdAt = object.createdAt.toISOString();
    }
    if (object.updatedAt) {
      object.updatedAt = object.updatedAt.toISOString();
    }
    if (object.expiresAt) {
      object.expiresAt = {
        __type: 'Date',
        iso: object.expiresAt.toISOString()
      };
    }
    if (object._email_verify_token_expires_at) {
      object._email_verify_token_expires_at = {
        __type: 'Date',
        iso: object._email_verify_token_expires_at.toISOString()
      };
    }
    if (object._account_lockout_expires_at) {
      object._account_lockout_expires_at = {
        __type: 'Date',
        iso: object._account_lockout_expires_at.toISOString()
      };
    }
    if (object._perishable_token_expires_at) {
      object._perishable_token_expires_at = {
        __type: 'Date',
        iso: object._perishable_token_expires_at.toISOString()
      };
    }
    if (object._password_changed_at) {
      object._password_changed_at = {
        __type: 'Date',
        iso: object._password_changed_at.toISOString()
      };
    }
    for (const fieldName in object) {
      if (object[fieldName] === null) {
        delete object[fieldName];
      }
      if (object[fieldName] instanceof Date) {
        object[fieldName] = {
          __type: 'Date',
          iso: object[fieldName].toISOString()
        };
      }
    }
    return object;
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  async ensureUniqueness(className, schema, fieldNames) {
    const constraintName = `${className}_unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE UNIQUE INDEX IF NOT EXISTS $2:name ON $1:name(${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }

  // Executes a count.
  async count(className, schema, query, readPreference, estimate = true) {
    debug('count');
    const values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    let qs = '';
    if (where.pattern.length > 0 || !estimate) {
      qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    } else {
      qs = 'SELECT reltuples AS approximate_row_count FROM pg_class WHERE relname = $1';
    }
    return this._client.one(qs, values, a => {
      if (a.approximate_row_count == null || a.approximate_row_count == -1) {
        return !isNaN(+a.count) ? +a.count : 0;
      } else {
        return +a.approximate_row_count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return 0;
    });
  }
  async distinct(className, schema, query, fieldName) {
    debug('distinct');
    let field = fieldName;
    let column = fieldName;
    const isNested = fieldName.indexOf('.') >= 0;
    if (isNested) {
      field = transformDotFieldToComponents(fieldName).join('->');
      column = fieldName.split('.')[0];
    }
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const isPointerField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const values = [field, column, className];
    const where = buildWhereClause({
      schema,
      query,
      index: 4,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const transformer = isArrayField ? 'jsonb_array_elements' : 'ON';
    let qs = `SELECT DISTINCT ${transformer}($1:name) $2:name FROM $3:name ${wherePattern}`;
    if (isNested) {
      qs = `SELECT DISTINCT ${transformer}($1:raw) $2:raw FROM $3:name ${wherePattern}`;
    }
    return this._client.any(qs, values).catch(error => {
      if (error.code === PostgresMissingColumnError) {
        return [];
      }
      throw error;
    }).then(results => {
      if (!isNested) {
        results = results.filter(object => object[field] !== null);
        return results.map(object => {
          if (!isPointerField) {
            return object[field];
          }
          return {
            __type: 'Pointer',
            className: schema.fields[fieldName].targetClass,
            objectId: object[field]
          };
        });
      }
      const child = fieldName.split('.')[1];
      return results.map(object => object[column][child]);
    }).then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  }
  async aggregate(className, schema, pipeline, readPreference, hint, explain) {
    debug('aggregate');
    const values = [className];
    let index = 2;
    let columns = [];
    let countField = null;
    let groupValues = null;
    let wherePattern = '';
    let limitPattern = '';
    let skipPattern = '';
    let sortPattern = '';
    let groupPattern = '';
    for (let i = 0; i < pipeline.length; i += 1) {
      const stage = pipeline[i];
      if (stage.$group) {
        for (const field in stage.$group) {
          const value = stage.$group[field];
          if (value === null || value === undefined) {
            continue;
          }
          if (field === '_id' && typeof value === 'string' && value !== '') {
            columns.push(`$${index}:name AS "objectId"`);
            groupPattern = `GROUP BY $${index}:name`;
            values.push(transformAggregateField(value));
            index += 1;
            continue;
          }
          if (field === '_id' && typeof value === 'object' && Object.keys(value).length !== 0) {
            groupValues = value;
            const groupByFields = [];
            for (const alias in value) {
              if (typeof value[alias] === 'string' && value[alias]) {
                const source = transformAggregateField(value[alias]);
                if (!groupByFields.includes(`"${source}"`)) {
                  groupByFields.push(`"${source}"`);
                }
                values.push(source, alias);
                columns.push(`$${index}:name AS $${index + 1}:name`);
                index += 2;
              } else {
                const operation = Object.keys(value[alias])[0];
                const source = transformAggregateField(value[alias][operation]);
                if (mongoAggregateToPostgres[operation]) {
                  if (!groupByFields.includes(`"${source}"`)) {
                    groupByFields.push(`"${source}"`);
                  }
                  columns.push(`EXTRACT(${mongoAggregateToPostgres[operation]} FROM $${index}:name AT TIME ZONE 'UTC')::integer AS $${index + 1}:name`);
                  values.push(source, alias);
                  index += 2;
                }
              }
            }
            groupPattern = `GROUP BY $${index}:raw`;
            values.push(groupByFields.join());
            index += 1;
            continue;
          }
          if (typeof value === 'object') {
            if (value.$sum) {
              if (typeof value.$sum === 'string') {
                columns.push(`SUM($${index}:name) AS $${index + 1}:name`);
                values.push(transformAggregateField(value.$sum), field);
                index += 2;
              } else {
                countField = field;
                columns.push(`COUNT(*) AS $${index}:name`);
                values.push(field);
                index += 1;
              }
            }
            if (value.$max) {
              columns.push(`MAX($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$max), field);
              index += 2;
            }
            if (value.$min) {
              columns.push(`MIN($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$min), field);
              index += 2;
            }
            if (value.$avg) {
              columns.push(`AVG($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$avg), field);
              index += 2;
            }
          }
        }
      } else {
        columns.push('*');
      }
      if (stage.$project) {
        if (columns.includes('*')) {
          columns = [];
        }
        for (const field in stage.$project) {
          const value = stage.$project[field];
          if (value === 1 || value === true) {
            columns.push(`$${index}:name`);
            values.push(field);
            index += 1;
          }
        }
      }
      if (stage.$match) {
        const patterns = [];
        const orOrAnd = Object.prototype.hasOwnProperty.call(stage.$match, '$or') ? ' OR ' : ' AND ';
        if (stage.$match.$or) {
          const collapse = {};
          stage.$match.$or.forEach(element => {
            for (const key in element) {
              collapse[key] = element[key];
            }
          });
          stage.$match = collapse;
        }
        for (let field in stage.$match) {
          const value = stage.$match[field];
          if (field === '_id') {
            field = 'objectId';
          }
          const matchPatterns = [];
          Object.keys(ParseToPosgresComparator).forEach(cmp => {
            if (value[cmp]) {
              const pgComparator = ParseToPosgresComparator[cmp];
              matchPatterns.push(`$${index}:name ${pgComparator} $${index + 1}`);
              values.push(field, toPostgresValue(value[cmp]));
              index += 2;
            }
          });
          if (matchPatterns.length > 0) {
            patterns.push(`(${matchPatterns.join(' AND ')})`);
          }
          if (schema.fields[field] && schema.fields[field].type && matchPatterns.length === 0) {
            patterns.push(`$${index}:name = $${index + 1}`);
            values.push(field, value);
            index += 2;
          }
        }
        wherePattern = patterns.length > 0 ? `WHERE ${patterns.join(` ${orOrAnd} `)}` : '';
      }
      if (stage.$limit) {
        limitPattern = `LIMIT $${index}`;
        values.push(stage.$limit);
        index += 1;
      }
      if (stage.$skip) {
        skipPattern = `OFFSET $${index}`;
        values.push(stage.$skip);
        index += 1;
      }
      if (stage.$sort) {
        const sort = stage.$sort;
        const keys = Object.keys(sort);
        const sorting = keys.map(key => {
          const transformer = sort[key] === 1 ? 'ASC' : 'DESC';
          const order = `$${index}:name ${transformer}`;
          index += 1;
          return order;
        }).join();
        values.push(...keys);
        sortPattern = sort !== undefined && sorting.length > 0 ? `ORDER BY ${sorting}` : '';
      }
    }
    if (groupPattern) {
      columns.forEach((e, i, a) => {
        if (e && e.trim() === '*') {
          a[i] = '';
        }
      });
    }
    const originalQuery = `SELECT ${columns.filter(Boolean).join()} FROM $1:name ${wherePattern} ${skipPattern} ${groupPattern} ${sortPattern} ${limitPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).then(a => {
      if (explain) {
        return a;
      }
      const results = a.map(object => this.postgresObjectToParseObject(className, object, schema));
      results.forEach(result => {
        if (!Object.prototype.hasOwnProperty.call(result, 'objectId')) {
          result.objectId = null;
        }
        if (groupValues) {
          result.objectId = {};
          for (const key in groupValues) {
            result.objectId[key] = result[key];
            delete result[key];
          }
        }
        if (countField) {
          result[countField] = parseInt(result[countField], 10);
        }
      });
      return results;
    });
  }
  async performInitialization({
    VolatileClassesSchemas
  }) {
    // TODO: This method needs to be rewritten to make proper use of connections (@vitaly-t)
    debug('performInitialization');
    await this._ensureSchemaCollectionExists();
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema).catch(err => {
        if (err.code === PostgresDuplicateRelationError || err.code === _node.default.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }
        throw err;
      }).then(() => this.schemaUpgrade(schema.className, schema));
    });
    promises.push(this._listenToSchema());
    return Promise.all(promises).then(() => {
      return this._client.tx('perform-initialization', async t => {
        await t.none(_sql.default.misc.jsonObjectSetKeys);
        await t.none(_sql.default.array.add);
        await t.none(_sql.default.array.addUnique);
        await t.none(_sql.default.array.remove);
        await t.none(_sql.default.array.containsAll);
        await t.none(_sql.default.array.containsAllRegex);
        await t.none(_sql.default.array.contains);
        return t.ctx;
      });
    }).then(ctx => {
      debug(`initializationDone in ${ctx.duration}`);
    }).catch(error => {
      /* eslint-disable no-console */
      console.error(error);
    });
  }
  async createIndexes(className, indexes, conn) {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }
  async createIndexesIfNeeded(className, fieldName, type, conn) {
    await (conn || this._client).none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [fieldName, className, type]);
  }
  async dropIndexes(className, indexes, conn) {
    const queries = indexes.map(i => ({
      query: 'DROP INDEX $1:name',
      values: i
    }));
    await (conn || this._client).tx(t => t.none(this._pgp.helpers.concat(queries)));
  }
  async getIndexes(className) {
    const qs = 'SELECT * FROM pg_indexes WHERE tablename = ${className}';
    return this._client.any(qs, {
      className
    });
  }
  async updateSchemaWithIndexes() {
    return Promise.resolve();
  }

  // Used for testing purposes
  async updateEstimatedCount(className) {
    return this._client.none('ANALYZE $1:name', [className]);
  }
  async createTransactionalSession() {
    return new Promise(resolve => {
      const transactionalSession = {};
      transactionalSession.result = this._client.tx(t => {
        transactionalSession.t = t;
        transactionalSession.promise = new Promise(resolve => {
          transactionalSession.resolve = resolve;
        });
        transactionalSession.batch = [];
        resolve(transactionalSession);
        return transactionalSession.promise;
      });
    });
  }
  commitTransactionalSession(transactionalSession) {
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return transactionalSession.result;
  }
  abortTransactionalSession(transactionalSession) {
    const result = transactionalSession.result.catch();
    transactionalSession.batch.push(Promise.reject());
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return result;
  }
  async ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const defaultIndexName = `parse_default_${fieldNames.sort().join('_')}`;
    const indexNameOptions = indexName != null ? {
      name: indexName
    } : {
      name: defaultIndexName
    };
    const constraintPatterns = caseInsensitive ? fieldNames.map((fieldName, index) => `lower($${index + 3}:name) varchar_pattern_ops`) : fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE INDEX IF NOT EXISTS $1:name ON $2:name (${constraintPatterns.join()})`;
    const setIdempotencyFunction = options.setIdempotencyFunction !== undefined ? options.setIdempotencyFunction : false;
    if (setIdempotencyFunction) {
      await this.ensureIdempotencyFunctionExists(options);
    }
    await conn.none(qs, [indexNameOptions.name, className, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(indexNameOptions.name)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(indexNameOptions.name)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }
  async deleteIdempotencyFunction(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const qs = 'DROP FUNCTION IF EXISTS idempotency_delete_expired_records()';
    return conn.none(qs).catch(error => {
      throw error;
    });
  }
  async ensureIdempotencyFunctionExists(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const ttlOptions = options.ttl !== undefined ? `${options.ttl} seconds` : '60 seconds';
    const qs = 'CREATE OR REPLACE FUNCTION idempotency_delete_expired_records() RETURNS void LANGUAGE plpgsql AS $$ BEGIN DELETE FROM "_Idempotency" WHERE expire < NOW() - INTERVAL $1; END; $$;';
    return conn.none(qs, [ttlOptions]).catch(error => {
      throw error;
    });
  }
}
exports.PostgresStorageAdapter = PostgresStorageAdapter;
function convertPolygonToSQL(polygon) {
  if (polygon.length < 3) {
    throw new _node.default.Error(_node.default.Error.INVALID_JSON, `Polygon must have at least 3 values`);
  }
  if (polygon[0][0] !== polygon[polygon.length - 1][0] || polygon[0][1] !== polygon[polygon.length - 1][1]) {
    polygon.push(polygon[0]);
  }
  const unique = polygon.filter((item, index, ar) => {
    let foundIndex = -1;
    for (let i = 0; i < ar.length; i += 1) {
      const pt = ar[i];
      if (pt[0] === item[0] && pt[1] === item[1]) {
        foundIndex = i;
        break;
      }
    }
    return foundIndex === index;
  });
  if (unique.length < 3) {
    throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
  }
  const points = polygon.map(point => {
    _node.default.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    return `(${point[1]}, ${point[0]})`;
  }).join(', ');
  return `(${points})`;
}
function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')) {
    regex += '\n';
  }

  // remove non escaped comments
  return regex.replace(/([^\\])#.*\n/gim, '$1')
  // remove lines starting with a comment
  .replace(/^#.*\n/gim, '')
  // remove non escaped whitespace
  .replace(/([^\\])\s+/gim, '$1')
  // remove whitespace at the beginning of a line
  .replace(/^\s+/, '').trim();
}
function processRegexPattern(s) {
  if (s && s.startsWith('^')) {
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));
  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  }

  // regex for contains
  return literalizeRegexPart(s);
}
function isStartsWithRegex(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('^')) {
    return false;
  }
  const matches = value.match(/\^\\Q.*\\E/);
  return !!matches;
}
function isAllValuesRegexOrNone(values) {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }
  const firstValuesIsRegex = isStartsWithRegex(values[0].$regex);
  if (values.length === 1) {
    return firstValuesIsRegex;
  }
  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i].$regex)) {
      return false;
    }
  }
  return true;
}
function isAnyValueRegexStartsWith(values) {
  return values.some(function (value) {
    return isStartsWithRegex(value.$regex);
  });
}
function createLiteralRegex(remaining) {
  return remaining.split('').map(c => {
    const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all Unicode letter chars
    if (c.match(regex) !== null) {
      // Don't escape alphanumeric characters
      return c;
    }
    // Escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}
function literalizeRegexPart(s) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // Process Regex that has a beginning and an end specified for the literal text
    const prefix = s.substring(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // Process Regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substring(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // Remove problematic chars from remaining text
  return s
  // Remove all instances of \Q and \E
  .replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '')
  // Ensure even number of single quote sequences by adding an extra single quote if needed;
  // this ensures that every single quote is escaped
  .replace(/'+/g, match => {
    return match.length % 2 === 0 ? match : match + "'";
  });
}
var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var _default = exports.default = PostgresStorageAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUG9zdGdyZXNDbGllbnQiLCJyZXF1aXJlIiwiX25vZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZGFzaCIsIl91dWlkIiwiX3NxbCIsIl9TdG9yYWdlQWRhcHRlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIm93bktleXMiLCJyIiwidCIsIk9iamVjdCIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsIl90b1Byb3BlcnR5S2V5IiwidmFsdWUiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImkiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsImNhbGwiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJVdGlscyIsIlBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciIsIlBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciIsIlBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsImxvZ2dlciIsImRlYnVnIiwiYXJncyIsImNvbmNhdCIsInNsaWNlIiwibG9nIiwiZ2V0TG9nZ2VyIiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlIiwicG9zdGdyZXNWYWx1ZSIsImNhc3RUeXBlIiwidW5kZWZpbmVkIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaXNBcnJheUluZGV4IiwiYXJyYXlJbmRleCIsIkFycmF5IiwiZnJvbSIsImV2ZXJ5IiwiYyIsImhhbmRsZURvdEZpZWxkcyIsIm9iamVjdCIsImZpZWxkTmFtZSIsImluZGV4T2YiLCJjb21wb25lbnRzIiwic3BsaXQiLCJmaXJzdCIsInNoaWZ0IiwiY3VycmVudE9iaiIsIm5leHQiLCJfX29wIiwidHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMiLCJtYXAiLCJjbXB0IiwiaW5kZXgiLCJ0cmFuc2Zvcm1Eb3RGaWVsZCIsImpvaW4iLCJ0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCIsInN1YnN0cmluZyIsInZhbGlkYXRlS2V5cyIsImtleSIsImluY2x1ZGVzIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfTkVTVEVEX0tFWSIsImpvaW5UYWJsZXNGb3JTY2hlbWEiLCJsaXN0IiwiZmllbGQiLCJidWlsZFdoZXJlQ2xhdXNlIiwicXVlcnkiLCJjYXNlSW5zZW5zaXRpdmUiLCJwYXR0ZXJucyIsInZhbHVlcyIsInNvcnRzIiwiaXNBcnJheUZpZWxkIiwiaW5pdGlhbFBhdHRlcm5zTGVuZ3RoIiwiZmllbGRWYWx1ZSIsIiRleGlzdHMiLCJhdXRoRGF0YU1hdGNoIiwibWF0Y2giLCIkaW4iLCIkcmVnZXgiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJjb25zdHJhaW50RmllbGROYW1lIiwiJHJlbGF0aXZlVGltZSIsIklOVkFMSURfSlNPTiIsInBvaW50IiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkZXEiLCJpc0luT3JOaW4iLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwicHJvY2Vzc1JlZ2V4UGF0dGVybiIsIiRjb250YWluZWRCeSIsImFyciIsIiR0ZXh0Iiwic2VhcmNoIiwiJHNlYXJjaCIsImxhbmd1YWdlIiwiJHRlcm0iLCIkbGFuZ3VhZ2UiLCIkY2FzZVNlbnNpdGl2ZSIsIiRkaWFjcml0aWNTZW5zaXRpdmUiLCIkbmVhclNwaGVyZSIsImRpc3RhbmNlIiwiJG1heERpc3RhbmNlIiwiZGlzdGFuY2VJbktNIiwiJHdpdGhpbiIsIiRib3giLCJib3giLCJsZWZ0IiwiYm90dG9tIiwicmlnaHQiLCJ0b3AiLCIkZ2VvV2l0aGluIiwiJGNlbnRlclNwaGVyZSIsImNlbnRlclNwaGVyZSIsIkdlb1BvaW50IiwiR2VvUG9pbnRDb2RlciIsImlzVmFsaWRKU09OIiwiX3ZhbGlkYXRlIiwiaXNOYU4iLCIkcG9seWdvbiIsInBvbHlnb24iLCJwb2ludHMiLCJjb29yZGluYXRlcyIsIiRnZW9JbnRlcnNlY3RzIiwiJHBvaW50IiwicmVnZXgiLCJvcGVyYXRvciIsIm9wdHMiLCIkb3B0aW9ucyIsInJlbW92ZVdoaXRlU3BhY2UiLCJjb252ZXJ0UG9seWdvblRvU1FMIiwiY21wIiwicGdDb21wYXJhdG9yIiwicGFyc2VyUmVzdWx0IiwicmVsYXRpdmVUaW1lVG9EYXRlIiwic3RhdHVzIiwicmVzdWx0IiwiY29uc29sZSIsImVycm9yIiwiaW5mbyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJ1cmkiLCJjb2xsZWN0aW9uUHJlZml4IiwiZGF0YWJhc2VPcHRpb25zIiwib3B0aW9ucyIsIl9jb2xsZWN0aW9uUHJlZml4IiwiZW5hYmxlU2NoZW1hSG9va3MiLCJzY2hlbWFDYWNoZVR0bCIsImNsaWVudCIsInBncCIsImNyZWF0ZUNsaWVudCIsIl9jbGllbnQiLCJfb25jaGFuZ2UiLCJfcGdwIiwidXVpZHY0IiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIndhdGNoIiwiY2FsbGJhY2siLCJjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5IiwiYW5hbHl6ZSIsImhhbmRsZVNodXRkb3duIiwiX3N0cmVhbSIsImRvbmUiLCIkcG9vbCIsImVuZCIsIl9saXN0ZW5Ub1NjaGVtYSIsImNvbm5lY3QiLCJkaXJlY3QiLCJvbiIsImRhdGEiLCJwYXlsb2FkIiwicGFyc2UiLCJzZW5kZXJJZCIsIm5vbmUiLCJfbm90aWZ5U2NoZW1hQ2hhbmdlIiwiY2F0Y2giLCJfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyIsImNvbm4iLCJjbGFzc0V4aXN0cyIsIm9uZSIsImEiLCJleGlzdHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwidGFzayIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsInNlbGYiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9pZF8iLCJfaWQiLCJkZWxldGVkSW5kZXhlcyIsImluc2VydGVkSW5kZXhlcyIsIklOVkFMSURfUVVFUlkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsInR4IiwiY3JlYXRlSW5kZXhlcyIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiY29kZSIsImRldGFpbCIsIkRVUExJQ0FURV9WQUxVRSIsInZhbHVlc0FycmF5IiwicGF0dGVybnNBcnJheSIsImFzc2lnbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfZmFpbGVkX2xvZ2luX2NvdW50IiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJyZWxhdGlvbnMiLCJwYXJzZVR5cGUiLCJxcyIsImJhdGNoIiwiam9pblRhYmxlIiwic2NoZW1hVXBncmFkZSIsImNvbHVtbnMiLCJjb2x1bW5fbmFtZSIsIm5ld0NvbHVtbnMiLCJpdGVtIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInBvc3RncmVzVHlwZSIsImFueSIsInBhdGgiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJkZWxldGVDbGFzcyIsIm9wZXJhdGlvbnMiLCJyZXNwb25zZSIsImhlbHBlcnMiLCJ0aGVuIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIl90aGlzJF9jbGllbnQiLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsImVuZGVkIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJhdXRoRGF0YUFscmVhZHlFeGlzdHMiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicG9wIiwiaW5pdGlhbFZhbHVlcyIsInZhbCIsInRlcm1pbmF0aW9uIiwiZ2VvUG9pbnRzSW5qZWN0cyIsImwiLCJjb2x1bW5zUGF0dGVybiIsImNvbCIsInZhbHVlc1BhdHRlcm4iLCJwcm9taXNlIiwib3BzIiwidW5kZXJseWluZ0Vycm9yIiwiY29uc3RyYWludCIsIm1hdGNoZXMiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsIndoZXJlIiwiT0JKRUNUX05PVF9GT1VORCIsImZpbmRPbmVBbmRVcGRhdGUiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZVBhdHRlcm5zIiwib3JpZ2luYWxVcGRhdGUiLCJkb3ROb3RhdGlvbk9wdGlvbnMiLCJnZW5lcmF0ZSIsImpzb25iIiwibGFzdEtleSIsImZpZWxkTmFtZUluZGV4Iiwic3RyIiwiYW1vdW50Iiwib2JqZWN0cyIsImtleXNUb0luY3JlbWVudCIsImsiLCJpbmNyZW1lbnRQYXR0ZXJucyIsImtleXNUb0RlbGV0ZSIsImRlbGV0ZVBhdHRlcm5zIiwicCIsInVwZGF0ZU9iamVjdCIsImV4cGVjdGVkVHlwZSIsInJlamVjdCIsIndoZXJlQ2xhdXNlIiwidXBzZXJ0T25lT2JqZWN0IiwiY3JlYXRlVmFsdWUiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZXhwbGFpbiIsImhhc0xpbWl0IiwiaGFzU2tpcCIsIndoZXJlUGF0dGVybiIsImxpbWl0UGF0dGVybiIsInNraXBQYXR0ZXJuIiwic29ydFBhdHRlcm4iLCJzb3J0Q29weSIsInNvcnRpbmciLCJ0cmFuc2Zvcm1LZXkiLCJtZW1vIiwib3JpZ2luYWxRdWVyeSIsInBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdCIsInRhcmdldENsYXNzIiwieSIsIngiLCJjb29yZHMiLCJ1cGRhdGVkQ29vcmRzIiwicGFyc2VGbG9hdCIsImNyZWF0ZWRBdCIsInRvSVNPU3RyaW5nIiwidXBkYXRlZEF0IiwiZXhwaXJlc0F0IiwiZW5zdXJlVW5pcXVlbmVzcyIsImNvbnN0cmFpbnROYW1lIiwiY29uc3RyYWludFBhdHRlcm5zIiwibWVzc2FnZSIsInJlYWRQcmVmZXJlbmNlIiwiZXN0aW1hdGUiLCJhcHByb3hpbWF0ZV9yb3dfY291bnQiLCJkaXN0aW5jdCIsImNvbHVtbiIsImlzTmVzdGVkIiwiaXNQb2ludGVyRmllbGQiLCJ0cmFuc2Zvcm1lciIsImNoaWxkIiwiYWdncmVnYXRlIiwicGlwZWxpbmUiLCJoaW50IiwiY291bnRGaWVsZCIsImdyb3VwVmFsdWVzIiwiZ3JvdXBQYXR0ZXJuIiwic3RhZ2UiLCIkZ3JvdXAiLCJncm91cEJ5RmllbGRzIiwiYWxpYXMiLCJzb3VyY2UiLCJvcGVyYXRpb24iLCIkc3VtIiwiJG1heCIsIiRtaW4iLCIkYXZnIiwiJHByb2plY3QiLCIkbWF0Y2giLCIkb3IiLCJjb2xsYXBzZSIsImVsZW1lbnQiLCJtYXRjaFBhdHRlcm5zIiwiJGxpbWl0IiwiJHNraXAiLCIkc29ydCIsIm9yZGVyIiwidHJpbSIsIkJvb2xlYW4iLCJwYXJzZUludCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJwcm9taXNlcyIsIklOVkFMSURfQ0xBU1NfTkFNRSIsImFsbCIsInNxbCIsIm1pc2MiLCJqc29uT2JqZWN0U2V0S2V5cyIsImFycmF5IiwiYWRkIiwiYWRkVW5pcXVlIiwicmVtb3ZlIiwiY29udGFpbnNBbGwiLCJjb250YWluc0FsbFJlZ2V4IiwiY29udGFpbnMiLCJjdHgiLCJkdXJhdGlvbiIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImdldEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsInVwZGF0ZUVzdGltYXRlZENvdW50IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJlbnN1cmVJbmRleCIsImluZGV4TmFtZSIsImRlZmF1bHRJbmRleE5hbWUiLCJpbmRleE5hbWVPcHRpb25zIiwic2V0SWRlbXBvdGVuY3lGdW5jdGlvbiIsImVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMiLCJkZWxldGVJZGVtcG90ZW5jeUZ1bmN0aW9uIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cG9ydHMiLCJ1bmlxdWUiLCJhciIsImZvdW5kSW5kZXgiLCJwdCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImVuZHNXaXRoIiwicmVwbGFjZSIsInMiLCJzdGFydHNXaXRoIiwibGl0ZXJhbGl6ZVJlZ2V4UGFydCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwiZmlyc3RWYWx1ZXNJc1JlZ2V4Iiwic29tZSIsImNyZWF0ZUxpdGVyYWxSZWdleCIsInJlbWFpbmluZyIsIlJlZ0V4cCIsIm1hdGNoZXIxIiwicmVzdWx0MSIsInByZWZpeCIsIm1hdGNoZXIyIiwicmVzdWx0MiIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAnLi9Qb3N0Z3Jlc0NsaWVudCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQgc3FsIGZyb20gJy4vc3FsJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFUeXBlLCBRdWVyeVR5cGUsIFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi4vLi4vLi4vVXRpbHMnKTtcblxuY29uc3QgUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yID0gJzQyUDAxJztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciA9ICc0MlAwNyc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yID0gJzQyNzAxJztcbmNvbnN0IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yID0gJzQyNzAzJztcbmNvbnN0IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciA9ICcyMzUwNSc7XG5jb25zdCBsb2dnZXIgPSByZXF1aXJlKCcuLi8uLi8uLi9sb2dnZXInKTtcblxuY29uc3QgZGVidWcgPSBmdW5jdGlvbiAoLi4uYXJnczogYW55KSB7XG4gIGFyZ3MgPSBbJ1BHOiAnICsgYXJndW1lbnRzWzBdXS5jb25jYXQoYXJncy5zbGljZSgxLCBhcmdzLmxlbmd0aCkpO1xuICBjb25zdCBsb2cgPSBsb2dnZXIuZ2V0TG9nZ2VyKCk7XG4gIGxvZy5kZWJ1Zy5hcHBseShsb2csIGFyZ3MpO1xufTtcblxuY29uc3QgcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUgPSB0eXBlID0+IHtcbiAgc3dpdGNoICh0eXBlLnR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuICdwb2ludCc7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gJ3BvbHlnb24nO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIGlmICh0eXBlLmNvbnRlbnRzICYmIHR5cGUuY29udGVudHMudHlwZSA9PT0gJ1N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuICd0ZXh0W10nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IGBubyB0eXBlIGZvciAke0pTT04uc3RyaW5naWZ5KHR5cGUpfSB5ZXRgO1xuICB9XG59O1xuXG5jb25zdCBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IgPSB7XG4gICRndDogJz4nLFxuICAkbHQ6ICc8JyxcbiAgJGd0ZTogJz49JyxcbiAgJGx0ZTogJzw9Jyxcbn07XG5cbmNvbnN0IG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3JlcyA9IHtcbiAgJGRheU9mTW9udGg6ICdEQVknLFxuICAkZGF5T2ZXZWVrOiAnRE9XJyxcbiAgJGRheU9mWWVhcjogJ0RPWScsXG4gICRpc29EYXlPZldlZWs6ICdJU09ET1cnLFxuICAkaXNvV2Vla1llYXI6ICdJU09ZRUFSJyxcbiAgJGhvdXI6ICdIT1VSJyxcbiAgJG1pbnV0ZTogJ01JTlVURScsXG4gICRzZWNvbmQ6ICdTRUNPTkQnLFxuICAkbWlsbGlzZWNvbmQ6ICdNSUxMSVNFQ09ORFMnLFxuICAkbW9udGg6ICdNT05USCcsXG4gICR3ZWVrOiAnV0VFSycsXG4gICR5ZWFyOiAnWUVBUicsXG59O1xuXG5jb25zdCB0b1Bvc3RncmVzVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUuaXNvO1xuICAgIH1cbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZSA9IHZhbHVlID0+IHtcbiAgY29uc3QgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZSh2YWx1ZSk7XG4gIGxldCBjYXN0VHlwZTtcbiAgc3dpdGNoICh0eXBlb2YgcG9zdGdyZXNWYWx1ZSkge1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICBjYXN0VHlwZSA9ICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgY2FzdFR5cGUgPSAnYm9vbGVhbic7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgY2FzdFR5cGUgPSB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIGNhc3RUeXBlO1xufTtcblxuY29uc3QgdHJhbnNmb3JtVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgcmV0dXJuIHZhbHVlLm9iamVjdElkO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbi8vIER1cGxpY2F0ZSBmcm9tIHRoZW4gbW9uZ28gYWRhcHRlci4uLlxuY29uc3QgZW1wdHlDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHt9LFxuICBnZXQ6IHt9LFxuICBjb3VudDoge30sXG4gIGNyZWF0ZToge30sXG4gIHVwZGF0ZToge30sXG4gIGRlbGV0ZToge30sXG4gIGFkZEZpZWxkOiB7fSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7fSxcbn0pO1xuXG5jb25zdCBkZWZhdWx0Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7ICcqJzogdHJ1ZSB9LFxuICBnZXQ6IHsgJyonOiB0cnVlIH0sXG4gIGNvdW50OiB7ICcqJzogdHJ1ZSB9LFxuICBjcmVhdGU6IHsgJyonOiB0cnVlIH0sXG4gIHVwZGF0ZTogeyAnKic6IHRydWUgfSxcbiAgZGVsZXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBhZGRGaWVsZDogeyAnKic6IHRydWUgfSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7ICcqJzogW10gfSxcbn0pO1xuXG5jb25zdCB0b1BhcnNlU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG4gIGlmIChzY2hlbWEuZmllbGRzKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgfVxuICBsZXQgY2xwcyA9IGRlZmF1bHRDTFBTO1xuICBpZiAoc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucykge1xuICAgIGNscHMgPSB7IC4uLmVtcHR5Q0xQUywgLi4uc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyB9O1xuICB9XG4gIGxldCBpbmRleGVzID0ge307XG4gIGlmIChzY2hlbWEuaW5kZXhlcykge1xuICAgIGluZGV4ZXMgPSB7IC4uLnNjaGVtYS5pbmRleGVzIH07XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogY2xwcyxcbiAgICBpbmRleGVzLFxuICB9O1xufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1NjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGlmICghc2NoZW1hKSB7XG4gICAgcmV0dXJuIHNjaGVtYTtcbiAgfVxuICBzY2hlbWEuZmllbGRzID0gc2NoZW1hLmZpZWxkcyB8fCB7fTtcbiAgc2NoZW1hLmZpZWxkcy5fd3Blcm0gPSB7IHR5cGU6ICdBcnJheScsIGNvbnRlbnRzOiB7IHR5cGU6ICdTdHJpbmcnIH0gfTtcbiAgc2NoZW1hLmZpZWxkcy5fcnBlcm0gPSB7IHR5cGU6ICdBcnJheScsIGNvbnRlbnRzOiB7IHR5cGU6ICdTdHJpbmcnIH0gfTtcbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgc2NoZW1hLmZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICB9XG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jb25zdCBpc0FycmF5SW5kZXggPSAoYXJyYXlJbmRleCkgPT4gQXJyYXkuZnJvbShhcnJheUluZGV4KS5ldmVyeShjID0+IGMgPj0gJzAnICYmIGMgPD0gJzknKTtcblxuY29uc3QgaGFuZGxlRG90RmllbGRzID0gb2JqZWN0ID0+IHtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICBvYmplY3RbZmlyc3RdID0gb2JqZWN0W2ZpcnN0XSB8fCB7fTtcbiAgICAgIGxldCBjdXJyZW50T2JqID0gb2JqZWN0W2ZpcnN0XTtcbiAgICAgIGxldCBuZXh0O1xuICAgICAgbGV0IHZhbHVlID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICBpZiAodmFsdWUgJiYgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdmFsdWUgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgd2hpbGUgKChuZXh0ID0gY29tcG9uZW50cy5zaGlmdCgpKSkge1xuICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbmQtYXNzaWduICovXG4gICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSBjdXJyZW50T2JqW25leHRdIHx8IHt9O1xuICAgICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjdXJyZW50T2JqW25leHRdID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudE9iaiA9IGN1cnJlbnRPYmpbbmV4dF07XG4gICAgICB9XG4gICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzID0gZmllbGROYW1lID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpLm1hcCgoY21wdCwgaW5kZXgpID0+IHtcbiAgICBpZiAoaW5kZXggPT09IDApIHtcbiAgICAgIHJldHVybiBgXCIke2NtcHR9XCJgO1xuICAgIH1cbiAgICBpZiAoaXNBcnJheUluZGV4KGNtcHQpKSB7XG4gICAgICByZXR1cm4gTnVtYmVyKGNtcHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYCcke2NtcHR9J2A7XG4gICAgfVxuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHJpbmcoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXgsIGNhc2VJbnNlbnNpdGl2ZSB9KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnNMZW5ndGggPSBwYXR0ZXJucy5sZW5ndGg7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IHF1ZXJ5W2ZpZWxkTmFtZV07XG5cbiAgICAvLyBub3RoaW5nIGluIHRoZSBzY2hlbWEsIGl0J3MgZ29ubmEgYmxvdyB1cFxuICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAvLyBhcyBpdCB3b24ndCBleGlzdFxuICAgICAgaWYgKGZpZWxkVmFsdWUgJiYgZmllbGRWYWx1ZS4kZXhpc3RzID09PSBmYWxzZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKGNhc2VJbnNlbnNpdGl2ZSAmJiAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJykpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnTnVtYmVyJykge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSkgT1IgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTClgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXggKyAxfSBPUiAke2NvbnN0cmFpbnRGaWVsZE5hbWV9IElTIE5VTEwpYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJG5lLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBhcnJheXNcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRlcSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXEgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGVxID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRlcS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPSBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSB8fCBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJG5pbik7XG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgJiZcbiAgICAgIGlzQXJyYXlGaWVsZCAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMudHlwZSA9PT0gJ1N0cmluZydcbiAgICApIHtcbiAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgIGxldCBhbGxvd051bGwgPSBmYWxzZTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBmaWVsZFZhbHVlLiRpbi5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgIGlmIChsaXN0RWxlbSA9PT0gbnVsbCkge1xuICAgICAgICAgIGFsbG93TnVsbCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4IC0gKGFsbG93TnVsbCA/IDEgOiAwKX1gKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoYWxsb3dOdWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSBJUyBOVUxMIE9SICQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKGlzSW5Pck5pbikge1xuICAgICAgdmFyIGNyZWF0ZUNvbnN0cmFpbnQgPSAoYmFzZUFycmF5LCBub3RJbikgPT4ge1xuICAgICAgICBjb25zdCBub3QgPSBub3RJbiA/ICcgTk9UICcgOiAnJztcbiAgICAgICAgaWYgKGJhc2VBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShiYXNlQXJyYXkpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhhbmRsZSBOZXN0ZWQgRG90IE5vdGF0aW9uIEFib3ZlXG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBiYXNlQXJyYXkuZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAobGlzdEVsZW0gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleH1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke25vdH0gSU4gKCR7aW5QYXR0ZXJucy5qb2luKCl9KWApO1xuICAgICAgICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIW5vdEluKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgICAgaW5kZXggPSBpbmRleCArIDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGFycmF5XG4gICAgICAgICAgaWYgKG5vdEluKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMScpOyAvLyBSZXR1cm4gYWxsIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMicpOyAvLyBSZXR1cm4gbm8gdmFsdWVzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJGluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICBmYWxzZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5pbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRuaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRpbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGluIHZhbHVlJyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkbmluIHZhbHVlJyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSAmJiBpc0FycmF5RmllbGQpIHtcbiAgICAgIGlmIChpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgaWYgKCFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgZmllbGRWYWx1ZS4kYWxsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRWYWx1ZS4kYWxsLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKGZpZWxkVmFsdWUuJGFsbFtpXS4kcmVnZXgpO1xuICAgICAgICAgIGZpZWxkVmFsdWUuJGFsbFtpXSA9IHZhbHVlLnN1YnN0cmluZygxKSArICclJztcbiAgICAgICAgfVxuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGxfcmVnZXgoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kYWxsKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kYWxsLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRhbGxbMF0ub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXhpc3RzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGV4aXN0cy4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke2luZGV4ICsgMn0sICQke2luZGV4ICsgM30pYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGxhbmd1YWdlLCBmaWVsZE5hbWUsIGxhbmd1YWdlLCBzZWFyY2guJHRlcm0pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmVhclNwaGVyZSkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZWFyU3BoZXJlO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBmaWVsZFZhbHVlLiRtYXhEaXN0YW5jZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHNvcnRzLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIEFTQ2BcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR3aXRoaW4gJiYgZmllbGRWYWx1ZS4kd2l0aGluLiRib3gpIHtcbiAgICAgIGNvbnN0IGJveCA9IGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94O1xuICAgICAgY29uc3QgbGVmdCA9IGJveFswXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCBib3R0b20gPSBib3hbMF0ubGF0aXR1ZGU7XG4gICAgICBjb25zdCByaWdodCA9IGJveFsxXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCB0b3AgPSBib3hbMV0ubGF0aXR1ZGU7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpib3hgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgoJHtsZWZ0fSwgJHtib3R0b219KSwgKCR7cmlnaHR9LCAke3RvcH0pKWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlKSB7XG4gICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZTtcbiAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbikge1xuICAgICAgY29uc3QgcG9seWdvbiA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbjtcbiAgICAgIGxldCBwb2ludHM7XG4gICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwb2ludHMgPSBwb2ludHNcbiAgICAgICAgLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgIHJldHVybiBgKCR7cG9pbnRbMF19LCAke3BvaW50WzFdfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJywgJyk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludHN9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMgJiYgZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQ7XG4gICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9seWdvbiBAPiAkJHtpbmRleCArIDF9Ojpwb2ludGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgbGV0IHJlZ2V4ID0gZmllbGRWYWx1ZS4kcmVnZXg7XG4gICAgICBsZXQgb3BlcmF0b3IgPSAnfic7XG4gICAgICBjb25zdCBvcHRzID0gZmllbGRWYWx1ZS4kb3B0aW9ucztcbiAgICAgIGlmIChvcHRzKSB7XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ2knKSA+PSAwKSB7XG4gICAgICAgICAgb3BlcmF0b3IgPSAnfionO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ3gnKSA+PSAwKSB7XG4gICAgICAgICAgcmVnZXggPSByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIHJlZ2V4ID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihyZWdleCk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgJHtvcGVyYXRvcn0gJyQke2luZGV4ICsgMX06cmF3J2ApO1xuICAgICAgdmFsdWVzLnB1c2gobmFtZSwgcmVnZXgpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZV0pKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5pc28pO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGluZGV4ICs9IDM7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgbGV0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcblxuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBvc3RncmVzVmFsdWUgPT09ICdvYmplY3QnICYmIHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IFV0aWxzLnJlbGF0aXZlVGltZVRvRGF0ZShwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgICBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHBhcnNlclJlc3VsdC5yZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7cG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lfSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuICBlbmFibGVTY2hlbWFIb29rczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9wZ3A6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICBfdXVpZDogYW55O1xuICBzY2hlbWFDYWNoZVR0bDogP251bWJlcjtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBkYXRhYmFzZU9wdGlvbnMgPSB7fSB9OiBhbnkpIHtcbiAgICBjb25zdCBvcHRpb25zID0geyAuLi5kYXRhYmFzZU9wdGlvbnMgfTtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgdGhpcy5zY2hlbWFDYWNoZVR0bCA9IGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bDtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbJ2VuYWJsZVNjaGVtYUhvb2tzJywgJ3NjaGVtYUNhY2hlVHRsJ10pIHtcbiAgICAgIGRlbGV0ZSBvcHRpb25zW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBjbGllbnQsIHBncCB9ID0gY3JlYXRlQ2xpZW50KHVyaSwgb3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG4gICAgdGhpcy5fcGdwID0gcGdwO1xuICAgIHRoaXMuX3V1aWQgPSB1dWlkdjQoKTtcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSBmYWxzZTtcbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIC8vTm90ZSB0aGF0IGFuYWx5emU9dHJ1ZSB3aWxsIHJ1biB0aGUgcXVlcnksIGV4ZWN1dGluZyBJTlNFUlRTLCBERUxFVEVTLCBldGMuXG4gIGNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkocXVlcnk6IHN0cmluZywgYW5hbHl6ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgaWYgKGFuYWx5emUpIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoQU5BTFlaRSwgRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbS5kb25lKCk7XG4gICAgICBkZWxldGUgdGhpcy5fc3RyZWFtO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuX2NsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLl9jbGllbnQuJHBvb2wuZW5kKCk7XG4gIH1cblxuICBhc3luYyBfbGlzdGVuVG9TY2hlbWEoKSB7XG4gICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgdGhpcy5fc3RyZWFtID0gYXdhaXQgdGhpcy5fY2xpZW50LmNvbm5lY3QoeyBkaXJlY3Q6IHRydWUgfSk7XG4gICAgICB0aGlzLl9zdHJlYW0uY2xpZW50Lm9uKCdub3RpZmljYXRpb24nLCBkYXRhID0+IHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoZGF0YS5wYXlsb2FkKTtcbiAgICAgICAgaWYgKHBheWxvYWQuc2VuZGVySWQgIT09IHRoaXMuX3V1aWQpIHtcbiAgICAgICAgICB0aGlzLl9vbmNoYW5nZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuX3N0cmVhbS5ub25lKCdMSVNURU4gJDF+JywgJ3NjaGVtYS5jaGFuZ2UnKTtcbiAgICB9XG4gIH1cblxuICBfbm90aWZ5U2NoZW1hQ2hhbmdlKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbVxuICAgICAgICAubm9uZSgnTk9USUZZICQxfiwgJDInLCBbJ3NjaGVtYS5jaGFuZ2UnLCB7IHNlbmRlcklkOiB0aGlzLl91dWlkIH1dKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gTm90aWZ5OicsIGVycm9yKTsgLy8gdW5saWtlbHkgdG8gZXZlciBoYXBwZW5cbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGF3YWl0IGNvbm5cbiAgICAgIC5ub25lKFxuICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgXCJfU0NIRU1BXCIgKCBcImNsYXNzTmFtZVwiIHZhckNoYXIoMTIwKSwgXCJzY2hlbWFcIiBqc29uYiwgXCJpc1BhcnNlQ2xhc3NcIiBib29sLCBQUklNQVJZIEtFWSAoXCJjbGFzc05hbWVcIikgKSdcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm9uZShcbiAgICAgICdTRUxFQ1QgRVhJU1RTIChTRUxFQ1QgMSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMgV0hFUkUgdGFibGVfbmFtZSA9ICQxKScsXG4gICAgICBbbmFtZV0sXG4gICAgICBhID0+IGEuZXhpc3RzXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgQ0xQczogYW55KSB7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnRhc2soJ3NldC1jbGFzcy1sZXZlbC1wZXJtaXNzaW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdjbGFzc0xldmVsUGVybWlzc2lvbnMnLCBKU09OLnN0cmluZ2lmeShDTFBzKV07XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgIGBVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlc1xuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlZEluZGV4ZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGRlbGV0ZWRJbmRleGVzLnB1c2gobmFtZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywga2V5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDEnLFxuICAgICAgICBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2luZGV4ZXMnLCBKU09OLnN0cmluZ2lmeShleGlzdGluZ0luZGV4ZXMpXVxuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46ID9hbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcGFyc2VTY2hlbWEgPSBhd2FpdCBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLmNyZWF0ZVRhYmxlKGNsYXNzTmFtZSwgc2NoZW1hLCB0KTtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdJTlNFUlQgSU5UTyBcIl9TQ0hFTUFcIiAoXCJjbGFzc05hbWVcIiwgXCJzY2hlbWFcIiwgXCJpc1BhcnNlQ2xhc3NcIikgVkFMVUVTICgkPGNsYXNzTmFtZT4sICQ8c2NoZW1hPiwgdHJ1ZSknLFxuICAgICAgICAgIHsgY2xhc3NOYW1lLCBzY2hlbWEgfVxuICAgICAgICApO1xuICAgICAgICBhd2FpdCB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzLCB0KTtcbiAgICAgICAgcmV0dXJuIHRvUGFyc2VTY2hlbWEoc2NoZW1hKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiYgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJyk7XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBjb25zdCBwYXR0ZXJuc0FycmF5ID0gW107XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmFzc2lnbih7fSwgc2NoZW1hLmZpZWxkcyk7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9mYWlsZWRfbG9naW5fY291bnQgPSB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gICAgfVxuICAgIGxldCBpbmRleCA9IDI7XG4gICAgY29uc3QgcmVsYXRpb25zID0gW107XG4gICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShxcywgdmFsdWVzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgdGhlIGVycm9yLlxuICAgICAgfVxuICAgICAgYXdhaXQgdC50eCgnY3JlYXRlLXRhYmxlLXR4JywgdHggPT4ge1xuICAgICAgICByZXR1cm4gdHguYmF0Y2goXG4gICAgICAgICAgcmVsYXRpb25zLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJyk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgYXdhaXQgY29ubi50YXNrKCdzY2hlbWEtdXBncmFkZScsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgY29sdW1ucyA9IGF3YWl0IHQubWFwKFxuICAgICAgICAnU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgV0hFUkUgdGFibGVfbmFtZSA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgY2xhc3NOYW1lIH0sXG4gICAgICAgIGEgPT4gYS5jb2x1bW5fbmFtZVxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5ld0NvbHVtbnMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gY29sdW1ucy5pbmRleE9mKGl0ZW0pID09PSAtMSlcbiAgICAgICAgLm1hcChmaWVsZE5hbWUgPT4gc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycpO1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnYWRkLWZpZWxkLWlmLW5vdC1leGlzdHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmICh0eXBlLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgICAnQUxURVIgVEFCTEUgJDxjbGFzc05hbWU6bmFtZT4gQUREIENPTFVNTiBJRiBOT1QgRVhJU1RTICQ8ZmllbGROYW1lOm5hbWU+ICQ8cG9zdGdyZXNUeXBlOnJhdz4nLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgcG9zdGdyZXNUeXBlOiBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSh0eXBlKSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmNyZWF0ZUNsYXNzKGNsYXNzTmFtZSwgeyBmaWVsZHM6IHsgW2ZpZWxkTmFtZV06IHR5cGUgfSB9LCB0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDb2x1bW4gYWxyZWFkeSBleGlzdHMsIGNyZWF0ZWQgYnkgb3RoZXIgcmVxdWVzdC4gQ2Fycnkgb24gdG8gc2VlIGlmIGl0J3MgdGhlIHJpZ2h0IHR5cGUuXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0LmFueShcbiAgICAgICAgJ1NFTEVDVCBcInNjaGVtYVwiIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPiBhbmQgKFwic2NoZW1hXCI6Ompzb24tPlxcJ2ZpZWxkc1xcJy0+JDxmaWVsZE5hbWU+KSBpcyBub3QgbnVsbCcsXG4gICAgICAgIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdFswXSkge1xuICAgICAgICB0aHJvdyAnQXR0ZW1wdGVkIHRvIGFkZCBhIGZpZWxkIHRoYXQgYWxyZWFkeSBleGlzdHMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ3VwZGF0ZS1zY2hlbWEtZmllbGQtb3B0aW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChvcGVyYXRpb25zKSkpXG4gICAgICAudGhlbigoKSA9PiBjbGFzc05hbWUuaW5kZXhPZignX0pvaW46JykgIT0gMCk7IC8vIHJlc29sdmVzIHdpdGggZmFsc2Ugd2hlbiBfSm9pbiB0YWJsZVxuXG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG5cbiAgLy8gRGVsZXRlIGFsbCBkYXRhIGtub3duIHRvIHRoaXMgYWRhcHRlci4gVXNlZCBmb3IgdGVzdGluZy5cbiAgYXN5bmMgZGVsZXRlQWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBoZWxwZXJzID0gdGhpcy5fcGdwLmhlbHBlcnM7XG4gICAgZGVidWcoJ2RlbGV0ZUFsbENsYXNzZXMnKTtcbiAgICBpZiAodGhpcy5fY2xpZW50Py4kcG9vbC5lbmRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50YXNrKCdkZWxldGUtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInKTtcbiAgICAgICAgICBjb25zdCBqb2lucyA9IHJlc3VsdHMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGxpc3QuY29uY2F0KGpvaW5UYWJsZXNGb3JTY2hlbWEoc2NoZW1hLnNjaGVtYSkpO1xuICAgICAgICAgIH0sIFtdKTtcbiAgICAgICAgICBjb25zdCBjbGFzc2VzID0gW1xuICAgICAgICAgICAgJ19TQ0hFTUEnLFxuICAgICAgICAgICAgJ19QdXNoU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgICAgICAgJ19Ib29rcycsXG4gICAgICAgICAgICAnX0dsb2JhbENvbmZpZycsXG4gICAgICAgICAgICAnX0dyYXBoUUxDb25maWcnLFxuICAgICAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgICAgICAnX0lkZW1wb3RlbmN5JyxcbiAgICAgICAgICAgIC4uLnJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuY2xhc3NOYW1lKSxcbiAgICAgICAgICAgIC4uLmpvaW5zLFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3QgcXVlcmllcyA9IGNsYXNzZXMubWFwKGNsYXNzTmFtZSA9PiAoe1xuICAgICAgICAgICAgcXVlcnk6ICdEUk9QIFRBQkxFIElGIEVYSVNUUyAkPGNsYXNzTmFtZTpuYW1lPicsXG4gICAgICAgICAgICB2YWx1ZXM6IHsgY2xhc3NOYW1lIH0sXG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIGF3YWl0IHQudHgodHggPT4gdHgubm9uZShoZWxwZXJzLmNvbmNhdChxdWVyaWVzKSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBObyBfU0NIRU1BIGNvbGxlY3Rpb24uIERvbid0IGRlbGV0ZSBhbnl0aGluZy5cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgZGVidWcoYGRlbGV0ZUFsbENsYXNzZXMgZG9uZSBpbiAke25ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbm93fWApO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBhc3luYyBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnZGVsZXRlLWZpZWxkcycsIGFzeW5jIHQgPT4ge1xuICAgICAgYXdhaXQgdC5ub25lKCdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCIgPSAkPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uc31gLCB2YWx1ZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIHJldHVybiBhd2FpdCB0Lm1hcCgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicsIG51bGwsIHJvdyA9PlxuICAgICAgICB0b1BhcnNlU2NoZW1hKHsgY2xhc3NOYW1lOiByb3cuY2xhc3NOYW1lLCAuLi5yb3cuc2NoZW1hIH0pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgYXN5bmMgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZ2V0Q2xhc3MnKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnKTtcbiAgICBsZXQgY29sdW1uc0FycmF5ID0gW107XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzID0ge307XG5cbiAgICBvYmplY3QgPSBoYW5kbGVEb3RGaWVsZHMob2JqZWN0KTtcblxuICAgIHZhbGlkYXRlS2V5cyhvYmplY3QpO1xuXG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGNvbnN0IGF1dGhEYXRhQWxyZWFkeUV4aXN0cyA9ICEhb2JqZWN0LmF1dGhEYXRhO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddID0gb2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZmllbGROYW1lID0gJ2F1dGhEYXRhJztcbiAgICAgICAgLy8gQXZvaWQgYWRkaW5nIGF1dGhEYXRhIG11bHRpcGxlIHRpbWVzIHRvIHRoZSBxdWVyeVxuICAgICAgICBpZiAoYXV0aERhdGFBbHJlYWR5RXhpc3RzKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbHVtbnNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2ZhaWxlZF9sb2dpbl9jb3VudCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfaGlzdG9yeSdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Jykge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCdcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm9iamVjdElkKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyYXknOlxuICAgICAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkob2JqZWN0W2ZpZWxkTmFtZV0pKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ubmFtZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvbHlnb24nOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKG9iamVjdFtmaWVsZE5hbWVdLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgICAgLy8gcG9wIHRoZSBwb2ludCBhbmQgcHJvY2VzcyBsYXRlclxuICAgICAgICAgIGdlb1BvaW50c1tmaWVsZE5hbWVdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgY29sdW1uc0FycmF5LnBvcCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IGBUeXBlICR7c2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGV9IG5vdCBzdXBwb3J0ZWQgeWV0YDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbHVtbnNBcnJheSA9IGNvbHVtbnNBcnJheS5jb25jYXQoT2JqZWN0LmtleXMoZ2VvUG9pbnRzKSk7XG4gICAgY29uc3QgaW5pdGlhbFZhbHVlcyA9IHZhbHVlc0FycmF5Lm1hcCgodmFsLCBpbmRleCkgPT4ge1xuICAgICAgbGV0IHRlcm1pbmF0aW9uID0gJyc7XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBjb2x1bW5zQXJyYXlbaW5kZXhdO1xuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6dGV4dFtdJztcbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6anNvbmInO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtpbmRleCArIDIgKyBjb2x1bW5zQXJyYXkubGVuZ3RofSR7dGVybWluYXRpb259YDtcbiAgICB9KTtcbiAgICBjb25zdCBnZW9Qb2ludHNJbmplY3RzID0gT2JqZWN0LmtleXMoZ2VvUG9pbnRzKS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZ2VvUG9pbnRzW2tleV07XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlLmxvbmdpdHVkZSwgdmFsdWUubGF0aXR1ZGUpO1xuICAgICAgY29uc3QgbCA9IHZhbHVlc0FycmF5Lmxlbmd0aCArIGNvbHVtbnNBcnJheS5sZW5ndGg7XG4gICAgICByZXR1cm4gYFBPSU5UKCQke2x9LCAkJHtsICsgMX0pYDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbHVtbnNQYXR0ZXJuID0gY29sdW1uc0FycmF5Lm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApLmpvaW4oKTtcbiAgICBjb25zdCB2YWx1ZXNQYXR0ZXJuID0gaW5pdGlhbFZhbHVlcy5jb25jYXQoZ2VvUG9pbnRzSW5qZWN0cykuam9pbigpO1xuXG4gICAgY29uc3QgcXMgPSBgSU5TRVJUIElOVE8gJDE6bmFtZSAoJHtjb2x1bW5zUGF0dGVybn0pIFZBTFVFUyAoJHt2YWx1ZXNQYXR0ZXJufSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmNvbHVtbnNBcnJheSwgLi4udmFsdWVzQXJyYXldO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm5vbmUocXMsIHZhbHVlcylcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW29iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yKSB7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLmNvbnN0cmFpbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5jb25zdHJhaW50Lm1hdGNoKC91bmlxdWVfKFthLXpBLVpdKykvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yID0gZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgYXN5bmMgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2RlbGV0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3QgaW5kZXggPSAyO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGlmIChPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB3aGVyZS5wYXR0ZXJuID0gJ1RSVUUnO1xuICAgIH1cbiAgICBjb25zdCBxcyA9IGBXSVRIIGRlbGV0ZWQgQVMgKERFTEVURSBGUk9NICQxOm5hbWUgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufSBSRVRVUk5JTkcgKikgU0VMRUNUIGNvdW50KCopIEZST00gZGVsZXRlZGA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScpO1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbihcbiAgICAgIHZhbCA9PiB2YWxbMF1cbiAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHVwZGF0ZVBhdHRlcm5zID0gW107XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG5cbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHsgLi4udXBkYXRlIH07XG5cbiAgICAvLyBTZXQgZmxhZyBmb3IgZG90IG5vdGF0aW9uIGZpZWxkc1xuICAgIGNvbnN0IGRvdE5vdGF0aW9uT3B0aW9ucyA9IHt9O1xuICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmlyc3RdID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdXBkYXRlID0gaGFuZGxlRG90RmllbGRzKHVwZGF0ZSk7XG4gICAgLy8gUmVzb2x2ZSBhdXRoRGF0YSBmaXJzdCxcbiAgICAvLyBTbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCBtdWx0aXBsZSBrZXkgdXBkYXRlc1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ10gPSB1cGRhdGVbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGZpZWxkVmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIC8vIERyb3AgYW55IHVuZGVmaW5lZCB2YWx1ZXMuXG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09ICdhdXRoRGF0YScpIHtcbiAgICAgICAgLy8gVGhpcyByZWN1cnNpdmVseSBzZXRzIHRoZSBqc29uX29iamVjdFxuICAgICAgICAvLyBPbmx5IDEgbGV2ZWwgZGVlcFxuICAgICAgICBjb25zdCBnZW5lcmF0ZSA9IChqc29uYjogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBganNvbl9vYmplY3Rfc2V0X2tleShDT0FMRVNDRSgke2pzb25ifSwgJ3t9Jzo6anNvbmIpLCAke2tleX0sICR7dmFsdWV9KTo6anNvbmJgO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBsYXN0S2V5ID0gYCQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgY29uc3QgZmllbGROYW1lSW5kZXggPSBpbmRleDtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZmllbGRWYWx1ZSkucmVkdWNlKChsYXN0S2V5OiBzdHJpbmcsIGtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RyID0gZ2VuZXJhdGUobGFzdEtleSwgYCQke2luZGV4fTo6dGV4dGAsIGAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgbGV0IHZhbHVlID0gZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9LCBsYXN0S2V5KTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7ZmllbGROYW1lSW5kZXh9Om5hbWUgPSAke3VwZGF0ZX1gKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnSW5jcmVtZW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAwKSArICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmFtb3VudCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGQoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGRVbmlxdWUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkX3VuaXF1ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAvL1RPRE86IHN0b3Agc3BlY2lhbCBjYXNpbmcgdGhpcy4gSXQgc2hvdWxkIGNoZWNrIGZvciBfX3R5cGUgPT09ICdEYXRlJyBhbmQgdXNlIC5pc29cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdPYmplY3QnXG4gICAgICApIHtcbiAgICAgICAgLy8gR2F0aGVyIGtleXMgdG8gaW5jcmVtZW50XG4gICAgICAgIGNvbnN0IGtleXNUb0luY3JlbWVudCA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IE9iamVjdC5rZXlzIGlzIGl0ZXJhdGluZyBvdmVyIHRoZSAqKm9yaWdpbmFsKiogdXBkYXRlIG9iamVjdFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgc29tZSBvZiB0aGUga2V5cyBvZiB0aGUgb3JpZ2luYWwgdXBkYXRlIGNvdWxkIGJlIG51bGwgb3IgdW5kZWZpbmVkOlxuICAgICAgICAgICAgLy8gKFNlZSB0aGUgYWJvdmUgY2hlY2sgYGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IHR5cGVvZiBmaWVsZFZhbHVlID09IFwidW5kZWZpbmVkXCIpYClcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnSW5jcmVtZW50JyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgbGV0IGluY3JlbWVudFBhdHRlcm5zID0gJyc7XG4gICAgICAgIGlmIChrZXlzVG9JbmNyZW1lbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGluY3JlbWVudFBhdHRlcm5zID1cbiAgICAgICAgICAgICcgfHwgJyArXG4gICAgICAgICAgICBrZXlzVG9JbmNyZW1lbnRcbiAgICAgICAgICAgICAgLm1hcChjID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhbW91bnQgPSBmaWVsZFZhbHVlW2NdLmFtb3VudDtcbiAgICAgICAgICAgICAgICByZXR1cm4gYENPTkNBVCgne1wiJHtjfVwiOicsIENPQUxFU0NFKCQke2luZGV4fTpuYW1lLT4+JyR7Y30nLCcwJyk6OmludCArICR7YW1vdW50fSwgJ30nKTo6anNvbmJgO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbignIHx8ICcpO1xuICAgICAgICAgIC8vIFN0cmlwIHRoZSBrZXlzXG4gICAgICAgICAga2V5c1RvSW5jcmVtZW50LmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXQuXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGNvbnN0IGRlbGV0ZVBhdHRlcm5zID0ga2V5c1RvRGVsZXRlLnJlZHVjZSgocDogc3RyaW5nLCBjOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpfTp2YWx1ZSdgO1xuICAgICAgICB9LCAnJyk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDEgKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIHsgZmllbGROYW1lLCBmaWVsZFZhbHVlIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdXBkYXRlICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9IHlldGBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KS5hbnkocXMsIHZhbHVlcyk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSwgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygndXBzZXJ0T25lT2JqZWN0Jyk7XG4gICAgY29uc3QgY3JlYXRlVmFsdWUgPSBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgdXBkYXRlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVPYmplY3QoY2xhc3NOYW1lLCBzY2hlbWEsIGNyZWF0ZVZhbHVlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gaWdub3JlIGR1cGxpY2F0ZSB2YWx1ZSBlcnJvcnMgYXMgaXQncyB1cHNlcnRcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maW5kT25lQW5kVXBkYXRlKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgfSk7XG4gIH1cblxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9OiBRdWVyeU9wdGlvbnNcbiAgKSB7XG4gICAgZGVidWcoJ2ZpbmQnKTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBsaW1pdFBhdHRlcm4gPSBoYXNMaW1pdCA/IGBMSU1JVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc0xpbWl0KSB7XG4gICAgICB2YWx1ZXMucHVzaChsaW1pdCk7XG4gICAgfVxuICAgIGNvbnN0IHNraXBQYXR0ZXJuID0gaGFzU2tpcCA/IGBPRkZTRVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNTa2lwKSB7XG4gICAgICB2YWx1ZXMucHVzaChza2lwKTtcbiAgICB9XG5cbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBpZiAoc29ydCkge1xuICAgICAgY29uc3Qgc29ydENvcHk6IGFueSA9IHNvcnQ7XG4gICAgICBjb25zdCBzb3J0aW5nID0gT2JqZWN0LmtleXMoc29ydClcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybUtleSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGtleSkuam9pbignLT4nKTtcbiAgICAgICAgICAvLyBVc2luZyAkaWR4IHBhdHRlcm4gZ2l2ZXM6ICBub24taW50ZWdlciBjb25zdGFudCBpbiBPUkRFUiBCWVxuICAgICAgICAgIGlmIChzb3J0Q29weVtrZXldID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBBU0NgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBERVNDYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIE9iamVjdC5rZXlzKHNvcnQpLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICB9XG4gICAgaWYgKHdoZXJlLnNvcnRzICYmIE9iamVjdC5rZXlzKCh3aGVyZS5zb3J0czogYW55KSkubGVuZ3RoID4gMCkge1xuICAgICAgc29ydFBhdHRlcm4gPSBgT1JERVIgQlkgJHt3aGVyZS5zb3J0cy5qb2luKCl9YDtcbiAgICB9XG5cbiAgICBsZXQgY29sdW1ucyA9ICcqJztcbiAgICBpZiAoa2V5cykge1xuICAgICAgLy8gRXhjbHVkZSBlbXB0eSBrZXlzXG4gICAgICAvLyBSZXBsYWNlIEFDTCBieSBpdCdzIGtleXNcbiAgICAgIGtleXMgPSBrZXlzLnJlZHVjZSgobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtby5wdXNoKCdfcnBlcm0nKTtcbiAgICAgICAgICBtZW1vLnB1c2goJ193cGVybScpO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGtleS5sZW5ndGggPiAwICYmXG4gICAgICAgICAgLy8gUmVtb3ZlIHNlbGVjdGVkIGZpZWxkIG5vdCByZWZlcmVuY2VkIGluIHRoZSBzY2hlbWFcbiAgICAgICAgICAvLyBSZWxhdGlvbiBpcyBub3QgYSBjb2x1bW4gaW4gcG9zdGdyZXNcbiAgICAgICAgICAvLyAkc2NvcmUgaXMgYSBQYXJzZSBzcGVjaWFsIGZpZWxkIGFuZCBpcyBhbHNvIG5vdCBhIGNvbHVtblxuICAgICAgICAgICgoc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlICE9PSAnUmVsYXRpb24nKSB8fCBrZXkgPT09ICckc2NvcmUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBtZW1vLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sIFtdKTtcbiAgICAgIGNvbHVtbnMgPSBrZXlzXG4gICAgICAgIC5tYXAoKGtleSwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoa2V5ID09PSAnJHNjb3JlJykge1xuICAgICAgICAgICAgcmV0dXJuIGB0c19yYW5rX2NkKHRvX3RzdmVjdG9yKCQkezJ9LCAkJHszfTpuYW1lKSwgdG9fdHNxdWVyeSgkJHs0fSwgJCR7NX0pLCAzMikgYXMgc2NvcmVgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCQke2luZGV4ICsgdmFsdWVzLmxlbmd0aCArIDF9Om5hbWVgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgdmFsdWVzID0gdmFsdWVzLmNvbmNhdChrZXlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnN9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59ICR7c2tpcFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW4gPyB0aGlzLmNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkob3JpZ2luYWxRdWVyeSkgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFF1ZXJ5IG9uIG5vbiBleGlzdGluZyB0YWJsZSwgZG9uJ3QgY3Jhc2hcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgJiYgb2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgbGF0aXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLnksXG4gICAgICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbZmllbGROYW1lXS54LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgbGV0IGNvb3JkcyA9IG5ldyBTdHJpbmcob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMuc3Vic3RyaW5nKDIsIGNvb3Jkcy5sZW5ndGggLSAyKS5zcGxpdCgnKSwoJyk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZWRDb29yZHMgPSBjb29yZHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICByZXR1cm4gW3BhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVsxXSksIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSldO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IHVwZGF0ZWRDb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IGNvbnN0cmFpbnROYW1lID0gYCR7Y2xhc3NOYW1lfV91bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZShxcywgW2NsYXNzTmFtZSwgY29uc3RyYWludE5hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgYXN5bmMgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPSAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiB7XG4gICAgICAgIGlmIChhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSBudWxsIHx8IGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IC0xKSB7XG4gICAgICAgICAgcmV0dXJuICFpc05hTigrYS5jb3VudCkgPyArYS5jb3VudCA6IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmFwcHJveGltYXRlX3Jvd19jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnKTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtmaWVsZCwgY29sdW1uLCBjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiA0LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgdHJhbnNmb3JtZXIgPSBpc0FycmF5RmllbGQgPyAnanNvbmJfYXJyYXlfZWxlbWVudHMnIDogJ09OJztcbiAgICBsZXQgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOm5hbWUpICQyOm5hbWUgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6cmF3KSAkMjpyYXcgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvcikge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKCFpc05lc3RlZCkge1xuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihvYmplY3QgPT4gb2JqZWN0W2ZpZWxkXSAhPT0gbnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvYmplY3RbZmllbGRdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkXSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2hpbGQgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVsxXTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiBvYmplY3RbY29sdW1uXVtjaGlsZF0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT5cbiAgICAgICAgcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKVxuICAgICAgKTtcbiAgfVxuXG4gIGFzeW5jIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICBkZWJ1ZygnYWdncmVnYXRlJyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAyO1xuICAgIGxldCBjb2x1bW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb3VudEZpZWxkID0gbnVsbDtcbiAgICBsZXQgZ3JvdXBWYWx1ZXMgPSBudWxsO1xuICAgIGxldCB3aGVyZVBhdHRlcm4gPSAnJztcbiAgICBsZXQgbGltaXRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNraXBQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGdyb3VwUGF0dGVybiA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGlwZWxpbmUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHN0YWdlID0gcGlwZWxpbmVbaV07XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kZ3JvdXBbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlICE9PSAnJykge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyBcIm9iamVjdElkXCJgKTtcbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVthbGlhc10gPT09ICdzdHJpbmcnICYmIHZhbHVlW2FsaWFzXSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc11bb3BlcmF0aW9uXSk7XG4gICAgICAgICAgICAgICAgaWYgKG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgYEVYVFJBQ1QoJHtcbiAgICAgICAgICAgICAgICAgICAgICBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXVxuICAgICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKTo6aW50ZWdlciBBUyAkJHtpbmRleCArIDF9Om5hbWVgXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpyYXdgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZ3JvdXBCeUZpZWxkcy5qb2luKCkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaWYgKHZhbHVlLiRzdW0pIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZS4kc3VtID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgU1VNKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kc3VtKSwgZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY291bnRGaWVsZCA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQ09VTlQoKikgQVMgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtYXgpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNQVgoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWF4KSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtaW4pIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNSU4oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWluKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRhdmcpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBBVkcoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kYXZnKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sdW1ucy5wdXNoKCcqJyk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgaWYgKGNvbHVtbnMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIGNvbHVtbnMgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kcHJvamVjdFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSAxIHx8IHZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICAgICAgICBjb25zdCBvck9yQW5kID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlLiRtYXRjaCwgJyRvcicpXG4gICAgICAgICAgPyAnIE9SICdcbiAgICAgICAgICA6ICcgQU5EICc7XG5cbiAgICAgICAgaWYgKHN0YWdlLiRtYXRjaC4kb3IpIHtcbiAgICAgICAgICBjb25zdCBjb2xsYXBzZSA9IHt9O1xuICAgICAgICAgIHN0YWdlLiRtYXRjaC4kb3IuZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgY29sbGFwc2Vba2V5XSA9IGVsZW1lbnRba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2ggPSBjb2xsYXBzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBmaWVsZCBpbiBzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRtYXRjaFtmaWVsZF07XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJykge1xuICAgICAgICAgICAgZmllbGQgPSAnb2JqZWN0SWQnO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBtYXRjaFBhdHRlcm5zID0gW107XG4gICAgICAgICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsdWVbY21wXSkge1xuICAgICAgICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBtYXRjaFBhdHRlcm5zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hlcmVQYXR0ZXJuID0gcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBzb3J0aW5nLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZ3JvdXBQYXR0ZXJuKSB7XG4gICAgICBjb2x1bW5zLmZvckVhY2goKGUsIGksIGEpID0+IHtcbiAgICAgICAgaWYgKGUgJiYgZS50cmltKCkgPT09ICcqJykge1xuICAgICAgICAgIGFbaV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbigpfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c2tpcFBhdHRlcm59ICR7Z3JvdXBQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHZhbHVlcykudGhlbihhID0+IHtcbiAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgIHJldHVybiBhO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0cyA9IGEubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnb2JqZWN0SWQnKSkge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0ge307XG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZFtrZXldID0gcmVzdWx0W2tleV07XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudEZpZWxkKSB7XG4gICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oeyBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIH06IGFueSkge1xuICAgIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB0byBtYWtlIHByb3BlciB1c2Ugb2YgY29ubmVjdGlvbnMgKEB2aXRhbHktdClcbiAgICBkZWJ1ZygncGVyZm9ybUluaXRpYWxpemF0aW9uJyk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cygpO1xuICAgIGNvbnN0IHByb21pc2VzID0gVm9sYXRpbGVDbGFzc2VzU2NoZW1hcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRhYmxlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciB8fFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuc2NoZW1hVXBncmFkZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpKTtcbiAgICB9KTtcbiAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2xpc3RlblRvU2NoZW1hKCkpO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsIGFzeW5jIHQgPT4ge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwubWlzYy5qc29uT2JqZWN0U2V0S2V5cyk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGQpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LnJlbW92ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zKTtcbiAgICAgICAgICByZXR1cm4gdC5jdHg7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGN0eCA9PiB7XG4gICAgICAgIGRlYnVnKGBpbml0aWFsaXphdGlvbkRvbmUgaW4gJHtjdHguZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiA/YW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgICAgICAgIGkubmFtZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGkua2V5LFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzSWZOZWVkZWQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgZmllbGROYW1lLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHlwZSxcbiAgICBdKTtcbiAgfVxuXG4gIGFzeW5jIGRyb3BJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHF1ZXJpZXMgPSBpbmRleGVzLm1hcChpID0+ICh7XG4gICAgICBxdWVyeTogJ0RST1AgSU5ERVggJDE6bmFtZScsXG4gICAgICB2YWx1ZXM6IGksXG4gICAgfSkpO1xuICAgIGF3YWl0IChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gIH1cblxuICBhc3luYyBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICBhc3luYyB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KHQgPT4ge1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50ID0gdDtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2ggPSBbXTtcbiAgICAgICAgcmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdDtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdC5jYXRjaCgpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2goUHJvbWlzZS5yZWplY3QoKSk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IGRlZmF1bHRJbmRleE5hbWUgPSBgcGFyc2VfZGVmYXVsdF8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9XG4gICAgICBpbmRleE5hbWUgIT0gbnVsbCA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7IG5hbWU6IGRlZmF1bHRJbmRleE5hbWUgfTtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGBsb3dlcigkJHtpbmRleCArIDN9Om5hbWUpIHZhcmNoYXJfcGF0dGVybl9vcHNgKVxuICAgICAgOiBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIGNvbnN0IHNldElkZW1wb3RlbmN5RnVuY3Rpb24gPVxuICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gOiBmYWxzZTtcbiAgICBpZiAoc2V0SWRlbXBvdGVuY3lGdW5jdGlvbikge1xuICAgICAgYXdhaXQgdGhpcy5lbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzKG9wdGlvbnMpO1xuICAgIH1cbiAgICBhd2FpdCBjb25uLm5vbmUocXMsIFtpbmRleE5hbWVPcHRpb25zLm5hbWUsIGNsYXNzTmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24ob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcXMgPSAnRFJPUCBGVU5DVElPTiBJRiBFWElTVFMgaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpJztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgdHRsT3B0aW9ucyA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyBgJHtvcHRpb25zLnR0bH0gc2Vjb25kc2AgOiAnNjAgc2Vjb25kcyc7XG4gICAgY29uc3QgcXMgPVxuICAgICAgJ0NSRUFURSBPUiBSRVBMQUNFIEZVTkNUSU9OIGlkZW1wb3RlbmN5X2RlbGV0ZV9leHBpcmVkX3JlY29yZHMoKSBSRVRVUk5TIHZvaWQgTEFOR1VBR0UgcGxwZ3NxbCBBUyAkJCBCRUdJTiBERUxFVEUgRlJPTSBcIl9JZGVtcG90ZW5jeVwiIFdIRVJFIGV4cGlyZSA8IE5PVygpIC0gSU5URVJWQUwgJDE7IEVORDsgJCQ7JztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzLCBbdHRsT3B0aW9uc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQb2x5Z29uVG9TUUwocG9seWdvbikge1xuICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYFBvbHlnb24gbXVzdCBoYXZlIGF0IGxlYXN0IDMgdmFsdWVzYCk7XG4gIH1cbiAgaWYgKFxuICAgIHBvbHlnb25bMF1bMF0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVswXSB8fFxuICAgIHBvbHlnb25bMF1bMV0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVsxXVxuICApIHtcbiAgICBwb2x5Z29uLnB1c2gocG9seWdvblswXSk7XG4gIH1cbiAgY29uc3QgdW5pcXVlID0gcG9seWdvbi5maWx0ZXIoKGl0ZW0sIGluZGV4LCBhcikgPT4ge1xuICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgcHQgPSBhcltpXTtcbiAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmb3VuZEluZGV4ID09PSBpbmRleDtcbiAgfSk7XG4gIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICApO1xuICB9XG4gIGNvbnN0IHBvaW50cyA9IHBvbHlnb25cbiAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgICAgcmV0dXJuIGAoJHtwb2ludFsxXX0sICR7cG9pbnRbMF19KWA7XG4gICAgfSlcbiAgICAuam9pbignLCAnKTtcbiAgcmV0dXJuIGAoJHtwb2ludHN9KWA7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpIHtcbiAgaWYgKCFyZWdleC5lbmRzV2l0aCgnXFxuJykpIHtcbiAgICByZWdleCArPSAnXFxuJztcbiAgfVxuXG4gIC8vIHJlbW92ZSBub24gZXNjYXBlZCBjb21tZW50c1xuICByZXR1cm4gKFxuICAgIHJlZ2V4XG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pIy4qXFxuL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSBsaW5lcyBzdGFydGluZyB3aXRoIGEgY29tbWVudFxuICAgICAgLnJlcGxhY2UoL14jLipcXG4vZ2ltLCAnJylcbiAgICAgIC8vIHJlbW92ZSBub24gZXNjYXBlZCB3aGl0ZXNwYWNlXG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxzKy9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuICAgICAgLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAudHJpbSgpXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NSZWdleFBhdHRlcm4ocykge1xuICBpZiAocyAmJiBzLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIC8vIHJlZ2V4IGZvciBzdGFydHNXaXRoXG4gICAgcmV0dXJuICdeJyArIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgxKSk7XG4gIH0gZWxzZSBpZiAocyAmJiBzLmVuZHNXaXRoKCckJykpIHtcbiAgICAvLyByZWdleCBmb3IgZW5kc1dpdGhcbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDAsIHMubGVuZ3RoIC0gMSkpICsgJyQnO1xuICB9XG5cbiAgLy8gcmVnZXggZm9yIGNvbnRhaW5zXG4gIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMpO1xufVxuXG5mdW5jdGlvbiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZSkge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXFxeXFxcXFEuKlxcXFxFLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdLiRyZWdleCk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0uJHJlZ2V4KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKHZhbHVlcykge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlLiRyZWdleCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIFVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gRG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gRXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIFByb2Nlc3MgUmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cmluZygwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gUHJvY2VzcyBSZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHJpbmcoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBwcm9ibGVtYXRpYyBjaGFycyBmcm9tIHJlbWFpbmluZyB0ZXh0XG4gIHJldHVybiBzXG4gICAgLy8gUmVtb3ZlIGFsbCBpbnN0YW5jZXMgb2YgXFxRIGFuZCBcXEVcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLy8gRW5zdXJlIGV2ZW4gbnVtYmVyIG9mIHNpbmdsZSBxdW90ZSBzZXF1ZW5jZXMgYnkgYWRkaW5nIGFuIGV4dHJhIHNpbmdsZSBxdW90ZSBpZiBuZWVkZWQ7XG4gICAgLy8gdGhpcyBlbnN1cmVzIHRoYXQgZXZlcnkgc2luZ2xlIHF1b3RlIGlzIGVzY2FwZWRcbiAgICAucmVwbGFjZSgvJysvZywgbWF0Y2ggPT4ge1xuICAgICAgcmV0dXJuIG1hdGNoLmxlbmd0aCAlIDIgPT09IDAgPyBtYXRjaCA6IG1hdGNoICsgXCInXCI7XG4gICAgfSk7XG59XG5cbnZhciBHZW9Qb2ludENvZGVyID0ge1xuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50JztcbiAgfSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLElBQUFBLGVBQUEsR0FBQUMsT0FBQTtBQUVBLElBQUFDLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFHLE9BQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElB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