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
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } // -disable-next
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
    return `'${cmpt}'`;
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
  return fieldName.substr(1);
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
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
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
        let coords = object[fieldName];
        coords = coords.substr(2, coords.length - 4).split('),(');
        coords = coords.map(point => {
          return [parseFloat(point.split(',')[1]), parseFloat(point.split(',')[0])];
        });
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: coords
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
    const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all unicode letter chars
    if (c.match(regex) !== null) {
      // don't escape alphanumeric characters
      return c;
    }
    // escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}
function literalizeRegexPart(s) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // process regex that has a beginning and an end specified for the literal text
    const prefix = s.substr(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // process regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substr(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // remove all instances of \Q and \E from the remaining text & escape single quotes
  return s.replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '').replace(/([^'])'/, `$1''`).replace(/^'([^'])/, `''$1`);
}
var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var _default = PostgresStorageAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUG9zdGdyZXNDbGllbnQiLCJyZXF1aXJlIiwiX25vZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZGFzaCIsIl91dWlkIiwiX3NxbCIsIl9TdG9yYWdlQWRhcHRlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsIm9iamVjdCIsImVudW1lcmFibGVPbmx5Iiwia2V5cyIsIk9iamVjdCIsImdldE93blByb3BlcnR5U3ltYm9scyIsInN5bWJvbHMiLCJmaWx0ZXIiLCJzeW0iLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsInRhcmdldCIsImkiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJzb3VyY2UiLCJmb3JFYWNoIiwia2V5IiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsImNhbGwiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJVdGlscyIsIlBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciIsIlBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciIsIlBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsImxvZ2dlciIsImRlYnVnIiwiYXJncyIsImNvbmNhdCIsInNsaWNlIiwibG9nIiwiZ2V0TG9nZ2VyIiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlIiwicG9zdGdyZXNWYWx1ZSIsImNhc3RUeXBlIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaGFuZGxlRG90RmllbGRzIiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJ0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyIsIm1hcCIsImNtcHQiLCJpbmRleCIsInRyYW5zZm9ybURvdEZpZWxkIiwiam9pbiIsInRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkIiwic3Vic3RyIiwidmFsaWRhdGVLZXlzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiam9pblRhYmxlc0ZvclNjaGVtYSIsImxpc3QiLCJmaWVsZCIsImJ1aWxkV2hlcmVDbGF1c2UiLCJxdWVyeSIsImNhc2VJbnNlbnNpdGl2ZSIsInBhdHRlcm5zIiwidmFsdWVzIiwic29ydHMiLCJpc0FycmF5RmllbGQiLCJpbml0aWFsUGF0dGVybnNMZW5ndGgiLCJmaWVsZFZhbHVlIiwiJGV4aXN0cyIsImF1dGhEYXRhTWF0Y2giLCJtYXRjaCIsIiRpbiIsIiRyZWdleCIsIk1BWF9JTlRfUExVU19PTkUiLCJjbGF1c2VzIiwiY2xhdXNlVmFsdWVzIiwic3ViUXVlcnkiLCJjbGF1c2UiLCJwYXR0ZXJuIiwib3JPckFuZCIsIm5vdCIsIiRuZSIsImNvbnN0cmFpbnRGaWVsZE5hbWUiLCIkcmVsYXRpdmVUaW1lIiwiSU5WQUxJRF9KU09OIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCJzdWJzdHJpbmciLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIm9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsInV1aWR2NCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIl9zdHJlYW0iLCJkb25lIiwiJHBvb2wiLCJlbmQiLCJfbGlzdGVuVG9TY2hlbWEiLCJjb25uZWN0IiwiZGlyZWN0Iiwib24iLCJkYXRhIiwicGF5bG9hZCIsInBhcnNlIiwic2VuZGVySWQiLCJub25lIiwiX25vdGlmeVNjaGVtYUNoYW5nZSIsImNhdGNoIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInRhc2siLCJ0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwic2VsZiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2lkXyIsIl9pZCIsImRlbGV0ZWRJbmRleGVzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwidHgiLCJjcmVhdGVJbmRleGVzIiwiZHJvcEluZGV4ZXMiLCJjcmVhdGVDbGFzcyIsInBhcnNlU2NoZW1hIiwiY3JlYXRlVGFibGUiLCJlcnIiLCJjb2RlIiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiYmF0Y2giLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwiYW55IiwicGF0aCIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsInJlc3BvbnNlIiwiaGVscGVycyIsInRoZW4iLCJkZWxldGVBbGxDbGFzc2VzIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJyZXN1bHRzIiwiam9pbnMiLCJyZWR1Y2UiLCJjbGFzc2VzIiwicXVlcmllcyIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJpZHgiLCJnZXRBbGxDbGFzc2VzIiwicm93IiwiZ2V0Q2xhc3MiLCJjcmVhdGVPYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbHVtbnNBcnJheSIsImdlb1BvaW50cyIsImF1dGhEYXRhQWxyZWFkeUV4aXN0cyIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJwb3AiLCJpbml0aWFsVmFsdWVzIiwidmFsIiwidGVybWluYXRpb24iLCJnZW9Qb2ludHNJbmplY3RzIiwibCIsImNvbHVtbnNQYXR0ZXJuIiwiY29sIiwidmFsdWVzUGF0dGVybiIsInByb21pc2UiLCJvcHMiLCJ1bmRlcmx5aW5nRXJyb3IiLCJjb25zdHJhaW50IiwibWF0Y2hlcyIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5Iiwid2hlcmUiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiZmluZE9uZUFuZFVwZGF0ZSIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlUGF0dGVybnMiLCJvcmlnaW5hbFVwZGF0ZSIsImRvdE5vdGF0aW9uT3B0aW9ucyIsImdlbmVyYXRlIiwianNvbmIiLCJsYXN0S2V5IiwiZmllbGROYW1lSW5kZXgiLCJzdHIiLCJhbW91bnQiLCJvYmplY3RzIiwia2V5c1RvSW5jcmVtZW50IiwiayIsImluY3JlbWVudFBhdHRlcm5zIiwiYyIsImtleXNUb0RlbGV0ZSIsImRlbGV0ZVBhdHRlcm5zIiwicCIsInVwZGF0ZU9iamVjdCIsImV4cGVjdGVkVHlwZSIsInJlamVjdCIsIndoZXJlQ2xhdXNlIiwidXBzZXJ0T25lT2JqZWN0IiwiY3JlYXRlVmFsdWUiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZXhwbGFpbiIsImhhc0xpbWl0IiwiaGFzU2tpcCIsIndoZXJlUGF0dGVybiIsImxpbWl0UGF0dGVybiIsInNraXBQYXR0ZXJuIiwic29ydFBhdHRlcm4iLCJzb3J0Q29weSIsInNvcnRpbmciLCJ0cmFuc2Zvcm1LZXkiLCJtZW1vIiwib3JpZ2luYWxRdWVyeSIsInBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdCIsInRhcmdldENsYXNzIiwieSIsIngiLCJjb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImNvdW50RmllbGQiLCJncm91cFZhbHVlcyIsImdyb3VwUGF0dGVybiIsInN0YWdlIiwiJGdyb3VwIiwiZ3JvdXBCeUZpZWxkcyIsImFsaWFzIiwib3BlcmF0aW9uIiwiJHN1bSIsIiRtYXgiLCIkbWluIiwiJGF2ZyIsIiRwcm9qZWN0IiwiJG1hdGNoIiwiJG9yIiwiY29sbGFwc2UiLCJlbGVtZW50IiwibWF0Y2hQYXR0ZXJucyIsIiRsaW1pdCIsIiRza2lwIiwiJHNvcnQiLCJvcmRlciIsImUiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwiZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyIsImRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24iLCJ0dGxPcHRpb25zIiwidHRsIiwiZXhwb3J0cyIsInVuaXF1ZSIsImFyIiwiZm91bmRJbmRleCIsInB0IiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZW5kc1dpdGgiLCJyZXBsYWNlIiwicyIsInN0YXJ0c1dpdGgiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJzb21lIiwiY3JlYXRlTGl0ZXJhbFJlZ2V4IiwicmVtYWluaW5nIiwiUmVnRXhwIiwibWF0Y2hlcjEiLCJyZXN1bHQxIiwicHJlZml4IiwibWF0Y2hlcjIiLCJyZXN1bHQyIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlID0gdmFsdWUgPT4ge1xuICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlKTtcbiAgbGV0IGNhc3RUeXBlO1xuICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gY2FzdFR5cGU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHIoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXgsIGNhc2VJbnNlbnNpdGl2ZSB9KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnNMZW5ndGggPSBwYXR0ZXJucy5sZW5ndGg7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IHF1ZXJ5W2ZpZWxkTmFtZV07XG5cbiAgICAvLyBub3RoaW5nIGluIHRoZSBzY2hlbWEsIGl0J3MgZ29ubmEgYmxvdyB1cFxuICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAvLyBhcyBpdCB3b24ndCBleGlzdFxuICAgICAgaWYgKGZpZWxkVmFsdWUgJiYgZmllbGRWYWx1ZS4kZXhpc3RzID09PSBmYWxzZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKGNhc2VJbnNlbnNpdGl2ZSAmJiAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJykpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnTnVtYmVyJykge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSkgT1IgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTClgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXggKyAxfSBPUiAke2NvbnN0cmFpbnRGaWVsZE5hbWV9IElTIE5VTEwpYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJG5lLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBhcnJheXNcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRlcSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXEgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGVxID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRlcS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPSBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSB8fCBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJG5pbik7XG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgJiZcbiAgICAgIGlzQXJyYXlGaWVsZCAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMudHlwZSA9PT0gJ1N0cmluZydcbiAgICApIHtcbiAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgIGxldCBhbGxvd051bGwgPSBmYWxzZTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBmaWVsZFZhbHVlLiRpbi5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgIGlmIChsaXN0RWxlbSA9PT0gbnVsbCkge1xuICAgICAgICAgIGFsbG93TnVsbCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4IC0gKGFsbG93TnVsbCA/IDEgOiAwKX1gKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoYWxsb3dOdWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSBJUyBOVUxMIE9SICQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKGlzSW5Pck5pbikge1xuICAgICAgdmFyIGNyZWF0ZUNvbnN0cmFpbnQgPSAoYmFzZUFycmF5LCBub3RJbikgPT4ge1xuICAgICAgICBjb25zdCBub3QgPSBub3RJbiA/ICcgTk9UICcgOiAnJztcbiAgICAgICAgaWYgKGJhc2VBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShiYXNlQXJyYXkpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhhbmRsZSBOZXN0ZWQgRG90IE5vdGF0aW9uIEFib3ZlXG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBiYXNlQXJyYXkuZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAobGlzdEVsZW0gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleH1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke25vdH0gSU4gKCR7aW5QYXR0ZXJucy5qb2luKCl9KWApO1xuICAgICAgICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIW5vdEluKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgICAgaW5kZXggPSBpbmRleCArIDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGFycmF5XG4gICAgICAgICAgaWYgKG5vdEluKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMScpOyAvLyBSZXR1cm4gYWxsIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMicpOyAvLyBSZXR1cm4gbm8gdmFsdWVzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJGluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICBmYWxzZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5pbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRuaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRpbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGluIHZhbHVlJyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkbmluIHZhbHVlJyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSAmJiBpc0FycmF5RmllbGQpIHtcbiAgICAgIGlmIChpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgaWYgKCFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgZmllbGRWYWx1ZS4kYWxsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRWYWx1ZS4kYWxsLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKGZpZWxkVmFsdWUuJGFsbFtpXS4kcmVnZXgpO1xuICAgICAgICAgIGZpZWxkVmFsdWUuJGFsbFtpXSA9IHZhbHVlLnN1YnN0cmluZygxKSArICclJztcbiAgICAgICAgfVxuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGxfcmVnZXgoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kYWxsKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kYWxsLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRhbGxbMF0ub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXhpc3RzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGV4aXN0cy4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke2luZGV4ICsgMn0sICQke2luZGV4ICsgM30pYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGxhbmd1YWdlLCBmaWVsZE5hbWUsIGxhbmd1YWdlLCBzZWFyY2guJHRlcm0pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmVhclNwaGVyZSkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZWFyU3BoZXJlO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBmaWVsZFZhbHVlLiRtYXhEaXN0YW5jZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHNvcnRzLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIEFTQ2BcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR3aXRoaW4gJiYgZmllbGRWYWx1ZS4kd2l0aGluLiRib3gpIHtcbiAgICAgIGNvbnN0IGJveCA9IGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94O1xuICAgICAgY29uc3QgbGVmdCA9IGJveFswXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCBib3R0b20gPSBib3hbMF0ubGF0aXR1ZGU7XG4gICAgICBjb25zdCByaWdodCA9IGJveFsxXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCB0b3AgPSBib3hbMV0ubGF0aXR1ZGU7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpib3hgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgoJHtsZWZ0fSwgJHtib3R0b219KSwgKCR7cmlnaHR9LCAke3RvcH0pKWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlKSB7XG4gICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZTtcbiAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbikge1xuICAgICAgY29uc3QgcG9seWdvbiA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbjtcbiAgICAgIGxldCBwb2ludHM7XG4gICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwb2ludHMgPSBwb2ludHNcbiAgICAgICAgLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgIHJldHVybiBgKCR7cG9pbnRbMF19LCAke3BvaW50WzFdfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJywgJyk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludHN9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMgJiYgZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQ7XG4gICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9seWdvbiBAPiAkJHtpbmRleCArIDF9Ojpwb2ludGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgbGV0IHJlZ2V4ID0gZmllbGRWYWx1ZS4kcmVnZXg7XG4gICAgICBsZXQgb3BlcmF0b3IgPSAnfic7XG4gICAgICBjb25zdCBvcHRzID0gZmllbGRWYWx1ZS4kb3B0aW9ucztcbiAgICAgIGlmIChvcHRzKSB7XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ2knKSA+PSAwKSB7XG4gICAgICAgICAgb3BlcmF0b3IgPSAnfionO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ3gnKSA+PSAwKSB7XG4gICAgICAgICAgcmVnZXggPSByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIHJlZ2V4ID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihyZWdleCk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgJHtvcGVyYXRvcn0gJyQke2luZGV4ICsgMX06cmF3J2ApO1xuICAgICAgdmFsdWVzLnB1c2gobmFtZSwgcmVnZXgpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZV0pKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5pc28pO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGluZGV4ICs9IDM7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgbGV0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcblxuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBvc3RncmVzVmFsdWUgPT09ICdvYmplY3QnICYmIHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IFV0aWxzLnJlbGF0aXZlVGltZVRvRGF0ZShwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgICBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHBhcnNlclJlc3VsdC5yZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7cG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lfSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuICBlbmFibGVTY2hlbWFIb29rczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9wZ3A6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICBfdXVpZDogYW55O1xuICBzY2hlbWFDYWNoZVR0bDogP251bWJlcjtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBkYXRhYmFzZU9wdGlvbnMgPSB7fSB9OiBhbnkpIHtcbiAgICBjb25zdCBvcHRpb25zID0geyAuLi5kYXRhYmFzZU9wdGlvbnMgfTtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgdGhpcy5zY2hlbWFDYWNoZVR0bCA9IGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bDtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbJ2VuYWJsZVNjaGVtYUhvb2tzJywgJ3NjaGVtYUNhY2hlVHRsJ10pIHtcbiAgICAgIGRlbGV0ZSBvcHRpb25zW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBjbGllbnQsIHBncCB9ID0gY3JlYXRlQ2xpZW50KHVyaSwgb3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG4gICAgdGhpcy5fcGdwID0gcGdwO1xuICAgIHRoaXMuX3V1aWQgPSB1dWlkdjQoKTtcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSBmYWxzZTtcbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIC8vTm90ZSB0aGF0IGFuYWx5emU9dHJ1ZSB3aWxsIHJ1biB0aGUgcXVlcnksIGV4ZWN1dGluZyBJTlNFUlRTLCBERUxFVEVTLCBldGMuXG4gIGNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkocXVlcnk6IHN0cmluZywgYW5hbHl6ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgaWYgKGFuYWx5emUpIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoQU5BTFlaRSwgRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbS5kb25lKCk7XG4gICAgICBkZWxldGUgdGhpcy5fc3RyZWFtO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuX2NsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLl9jbGllbnQuJHBvb2wuZW5kKCk7XG4gIH1cblxuICBhc3luYyBfbGlzdGVuVG9TY2hlbWEoKSB7XG4gICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgdGhpcy5fc3RyZWFtID0gYXdhaXQgdGhpcy5fY2xpZW50LmNvbm5lY3QoeyBkaXJlY3Q6IHRydWUgfSk7XG4gICAgICB0aGlzLl9zdHJlYW0uY2xpZW50Lm9uKCdub3RpZmljYXRpb24nLCBkYXRhID0+IHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoZGF0YS5wYXlsb2FkKTtcbiAgICAgICAgaWYgKHBheWxvYWQuc2VuZGVySWQgIT09IHRoaXMuX3V1aWQpIHtcbiAgICAgICAgICB0aGlzLl9vbmNoYW5nZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuX3N0cmVhbS5ub25lKCdMSVNURU4gJDF+JywgJ3NjaGVtYS5jaGFuZ2UnKTtcbiAgICB9XG4gIH1cblxuICBfbm90aWZ5U2NoZW1hQ2hhbmdlKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbVxuICAgICAgICAubm9uZSgnTk9USUZZICQxfiwgJDInLCBbJ3NjaGVtYS5jaGFuZ2UnLCB7IHNlbmRlcklkOiB0aGlzLl91dWlkIH1dKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gTm90aWZ5OicsIGVycm9yKTsgLy8gdW5saWtlbHkgdG8gZXZlciBoYXBwZW5cbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGF3YWl0IGNvbm5cbiAgICAgIC5ub25lKFxuICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgXCJfU0NIRU1BXCIgKCBcImNsYXNzTmFtZVwiIHZhckNoYXIoMTIwKSwgXCJzY2hlbWFcIiBqc29uYiwgXCJpc1BhcnNlQ2xhc3NcIiBib29sLCBQUklNQVJZIEtFWSAoXCJjbGFzc05hbWVcIikgKSdcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm9uZShcbiAgICAgICdTRUxFQ1QgRVhJU1RTIChTRUxFQ1QgMSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMgV0hFUkUgdGFibGVfbmFtZSA9ICQxKScsXG4gICAgICBbbmFtZV0sXG4gICAgICBhID0+IGEuZXhpc3RzXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgQ0xQczogYW55KSB7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnRhc2soJ3NldC1jbGFzcy1sZXZlbC1wZXJtaXNzaW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdjbGFzc0xldmVsUGVybWlzc2lvbnMnLCBKU09OLnN0cmluZ2lmeShDTFBzKV07XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgIGBVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlc1xuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlZEluZGV4ZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGRlbGV0ZWRJbmRleGVzLnB1c2gobmFtZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywga2V5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDEnLFxuICAgICAgICBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2luZGV4ZXMnLCBKU09OLnN0cmluZ2lmeShleGlzdGluZ0luZGV4ZXMpXVxuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46ID9hbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcGFyc2VTY2hlbWEgPSBhd2FpdCBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLmNyZWF0ZVRhYmxlKGNsYXNzTmFtZSwgc2NoZW1hLCB0KTtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdJTlNFUlQgSU5UTyBcIl9TQ0hFTUFcIiAoXCJjbGFzc05hbWVcIiwgXCJzY2hlbWFcIiwgXCJpc1BhcnNlQ2xhc3NcIikgVkFMVUVTICgkPGNsYXNzTmFtZT4sICQ8c2NoZW1hPiwgdHJ1ZSknLFxuICAgICAgICAgIHsgY2xhc3NOYW1lLCBzY2hlbWEgfVxuICAgICAgICApO1xuICAgICAgICBhd2FpdCB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzLCB0KTtcbiAgICAgICAgcmV0dXJuIHRvUGFyc2VTY2hlbWEoc2NoZW1hKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiYgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJyk7XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBjb25zdCBwYXR0ZXJuc0FycmF5ID0gW107XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmFzc2lnbih7fSwgc2NoZW1hLmZpZWxkcyk7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9mYWlsZWRfbG9naW5fY291bnQgPSB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gICAgfVxuICAgIGxldCBpbmRleCA9IDI7XG4gICAgY29uc3QgcmVsYXRpb25zID0gW107XG4gICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShxcywgdmFsdWVzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgdGhlIGVycm9yLlxuICAgICAgfVxuICAgICAgYXdhaXQgdC50eCgnY3JlYXRlLXRhYmxlLXR4JywgdHggPT4ge1xuICAgICAgICByZXR1cm4gdHguYmF0Y2goXG4gICAgICAgICAgcmVsYXRpb25zLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJyk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgYXdhaXQgY29ubi50YXNrKCdzY2hlbWEtdXBncmFkZScsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgY29sdW1ucyA9IGF3YWl0IHQubWFwKFxuICAgICAgICAnU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgV0hFUkUgdGFibGVfbmFtZSA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgY2xhc3NOYW1lIH0sXG4gICAgICAgIGEgPT4gYS5jb2x1bW5fbmFtZVxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5ld0NvbHVtbnMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gY29sdW1ucy5pbmRleE9mKGl0ZW0pID09PSAtMSlcbiAgICAgICAgLm1hcChmaWVsZE5hbWUgPT4gc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycpO1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnYWRkLWZpZWxkLWlmLW5vdC1leGlzdHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmICh0eXBlLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgICAnQUxURVIgVEFCTEUgJDxjbGFzc05hbWU6bmFtZT4gQUREIENPTFVNTiBJRiBOT1QgRVhJU1RTICQ8ZmllbGROYW1lOm5hbWU+ICQ8cG9zdGdyZXNUeXBlOnJhdz4nLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgcG9zdGdyZXNUeXBlOiBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSh0eXBlKSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmNyZWF0ZUNsYXNzKGNsYXNzTmFtZSwgeyBmaWVsZHM6IHsgW2ZpZWxkTmFtZV06IHR5cGUgfSB9LCB0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDb2x1bW4gYWxyZWFkeSBleGlzdHMsIGNyZWF0ZWQgYnkgb3RoZXIgcmVxdWVzdC4gQ2Fycnkgb24gdG8gc2VlIGlmIGl0J3MgdGhlIHJpZ2h0IHR5cGUuXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0LmFueShcbiAgICAgICAgJ1NFTEVDVCBcInNjaGVtYVwiIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPiBhbmQgKFwic2NoZW1hXCI6Ompzb24tPlxcJ2ZpZWxkc1xcJy0+JDxmaWVsZE5hbWU+KSBpcyBub3QgbnVsbCcsXG4gICAgICAgIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdFswXSkge1xuICAgICAgICB0aHJvdyAnQXR0ZW1wdGVkIHRvIGFkZCBhIGZpZWxkIHRoYXQgYWxyZWFkeSBleGlzdHMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ3VwZGF0ZS1zY2hlbWEtZmllbGQtb3B0aW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChvcGVyYXRpb25zKSkpXG4gICAgICAudGhlbigoKSA9PiBjbGFzc05hbWUuaW5kZXhPZignX0pvaW46JykgIT0gMCk7IC8vIHJlc29sdmVzIHdpdGggZmFsc2Ugd2hlbiBfSm9pbiB0YWJsZVxuXG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG5cbiAgLy8gRGVsZXRlIGFsbCBkYXRhIGtub3duIHRvIHRoaXMgYWRhcHRlci4gVXNlZCBmb3IgdGVzdGluZy5cbiAgYXN5bmMgZGVsZXRlQWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBoZWxwZXJzID0gdGhpcy5fcGdwLmhlbHBlcnM7XG4gICAgZGVidWcoJ2RlbGV0ZUFsbENsYXNzZXMnKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnRhc2soJ2RlbGV0ZS1hbGwtY2xhc3NlcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0LmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicpO1xuICAgICAgICAgIGNvbnN0IGpvaW5zID0gcmVzdWx0cy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbGlzdC5jb25jYXQoam9pblRhYmxlc0ZvclNjaGVtYShzY2hlbWEuc2NoZW1hKSk7XG4gICAgICAgICAgfSwgW10pO1xuICAgICAgICAgIGNvbnN0IGNsYXNzZXMgPSBbXG4gICAgICAgICAgICAnX1NDSEVNQScsXG4gICAgICAgICAgICAnX1B1c2hTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTY2hlZHVsZScsXG4gICAgICAgICAgICAnX0hvb2tzJyxcbiAgICAgICAgICAgICdfR2xvYmFsQ29uZmlnJyxcbiAgICAgICAgICAgICdfR3JhcGhRTENvbmZpZycsXG4gICAgICAgICAgICAnX0F1ZGllbmNlJyxcbiAgICAgICAgICAgICdfSWRlbXBvdGVuY3knLFxuICAgICAgICAgICAgLi4ucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5jbGFzc05hbWUpLFxuICAgICAgICAgICAgLi4uam9pbnMsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdCBxdWVyaWVzID0gY2xhc3Nlcy5tYXAoY2xhc3NOYW1lID0+ICh7XG4gICAgICAgICAgICBxdWVyeTogJ0RST1AgVEFCTEUgSUYgRVhJU1RTICQ8Y2xhc3NOYW1lOm5hbWU+JyxcbiAgICAgICAgICAgIHZhbHVlczogeyBjbGFzc05hbWUgfSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgYXdhaXQgdC50eCh0eCA9PiB0eC5ub25lKGhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIE5vIF9TQ0hFTUEgY29sbGVjdGlvbi4gRG9uJ3QgZGVsZXRlIGFueXRoaW5nLlxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBkZWJ1ZyhgZGVsZXRlQWxsQ2xhc3NlcyBkb25lIGluICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBub3d9YCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGFzeW5jIGRlbGV0ZUZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGRlYnVnKCdkZWxldGVGaWVsZHMnKTtcbiAgICBmaWVsZE5hbWVzID0gZmllbGROYW1lcy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIGZpZWxkTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIGlmIChmaWVsZC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChmaWVsZE5hbWUpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBsaXN0O1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBmaWVsZE5hbWVzXG4gICAgICAubWFwKChuYW1lLCBpZHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAkJHtpZHggKyAyfTpuYW1lYDtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCBEUk9QIENPTFVNTicpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdkZWxldGUtZmllbGRzJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCB0Lm5vbmUoJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIiA9ICQ8c2NoZW1hPiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+Jywge1xuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHZhbHVlcy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShgQUxURVIgVEFCTEUgJDE6bmFtZSBEUk9QIENPTFVNTiBJRiBFWElTVFMgJHtjb2x1bW5zfWAsIHZhbHVlcyk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgYXN5bmMgZ2V0QWxsQ2xhc3NlcygpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LnRhc2soJ2dldC1hbGwtY2xhc3NlcycsIGFzeW5jIHQgPT4ge1xuICAgICAgcmV0dXJuIGF3YWl0IHQubWFwKCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJywgbnVsbCwgcm93ID0+XG4gICAgICAgIHRvUGFyc2VTY2hlbWEoeyBjbGFzc05hbWU6IHJvdy5jbGFzc05hbWUsIC4uLnJvdy5zY2hlbWEgfSlcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBhc3luYyBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdnZXRDbGFzcycpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRbMF0uc2NoZW1hO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHRvUGFyc2VTY2hlbWEpO1xuICB9XG5cbiAgLy8gVE9ETzogcmVtb3ZlIHRoZSBtb25nbyBmb3JtYXQgZGVwZW5kZW5jeSBpbiB0aGUgcmV0dXJuIHZhbHVlXG4gIGFzeW5jIGNyZWF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2NyZWF0ZU9iamVjdCcpO1xuICAgIGxldCBjb2x1bW5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBnZW9Qb2ludHMgPSB7fTtcblxuICAgIG9iamVjdCA9IGhhbmRsZURvdEZpZWxkcyhvYmplY3QpO1xuXG4gICAgdmFsaWRhdGVLZXlzKG9iamVjdCk7XG5cbiAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgY29uc3QgYXV0aERhdGFBbHJlYWR5RXhpc3RzID0gISFvYmplY3QuYXV0aERhdGE7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ10gPSBvYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBmaWVsZE5hbWUgPSAnYXV0aERhdGEnO1xuICAgICAgICAvLyBBdm9pZCBhZGRpbmcgYXV0aERhdGEgbXVsdGlwbGUgdGltZXMgdG8gdGhlIHF1ZXJ5XG4gICAgICAgIGlmIChhdXRoRGF0YUFscmVhZHlFeGlzdHMpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29sdW1uc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZmFpbGVkX2xvZ2luX2NvdW50JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9oaXN0b3J5J1xuICAgICAgICApIHtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0J1xuICAgICAgICApIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSkge1xuICAgICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ub2JqZWN0SWQpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJheSc6XG4gICAgICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShvYmplY3RbZmllbGROYW1lXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgICBjYXNlICdOdW1iZXInOlxuICAgICAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5uYW1lKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9seWdvbic6IHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwob2JqZWN0W2ZpZWxkTmFtZV0uY29vcmRpbmF0ZXMpO1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgICAvLyBwb3AgdGhlIHBvaW50IGFuZCBwcm9jZXNzIGxhdGVyXG4gICAgICAgICAgZ2VvUG9pbnRzW2ZpZWxkTmFtZV0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgICBjb2x1bW5zQXJyYXkucG9wKCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgYFR5cGUgJHtzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZX0gbm90IHN1cHBvcnRlZCB5ZXRgO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29sdW1uc0FycmF5ID0gY29sdW1uc0FycmF5LmNvbmNhdChPYmplY3Qua2V5cyhnZW9Qb2ludHMpKTtcbiAgICBjb25zdCBpbml0aWFsVmFsdWVzID0gdmFsdWVzQXJyYXkubWFwKCh2YWwsIGluZGV4KSA9PiB7XG4gICAgICBsZXQgdGVybWluYXRpb24gPSAnJztcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGNvbHVtbnNBcnJheVtpbmRleF07XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjp0ZXh0W10nO1xuICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjpqc29uYic7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCQke2luZGV4ICsgMiArIGNvbHVtbnNBcnJheS5sZW5ndGh9JHt0ZXJtaW5hdGlvbn1gO1xuICAgIH0pO1xuICAgIGNvbnN0IGdlb1BvaW50c0luamVjdHMgPSBPYmplY3Qua2V5cyhnZW9Qb2ludHMpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBnZW9Qb2ludHNba2V5XTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUubG9uZ2l0dWRlLCB2YWx1ZS5sYXRpdHVkZSk7XG4gICAgICBjb25zdCBsID0gdmFsdWVzQXJyYXkubGVuZ3RoICsgY29sdW1uc0FycmF5Lmxlbmd0aDtcbiAgICAgIHJldHVybiBgUE9JTlQoJCR7bH0sICQke2wgKyAxfSlgO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sdW1uc1BhdHRlcm4gPSBjb2x1bW5zQXJyYXkubWFwKChjb2wsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAyfTpuYW1lYCkuam9pbigpO1xuICAgIGNvbnN0IHZhbHVlc1BhdHRlcm4gPSBpbml0aWFsVmFsdWVzLmNvbmNhdChnZW9Qb2ludHNJbmplY3RzKS5qb2luKCk7XG5cbiAgICBjb25zdCBxcyA9IGBJTlNFUlQgSU5UTyAkMTpuYW1lICgke2NvbHVtbnNQYXR0ZXJufSkgVkFMVUVTICgke3ZhbHVlc1BhdHRlcm59KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uY29sdW1uc0FycmF5LCAuLi52YWx1ZXNBcnJheV07XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAubm9uZShxcywgdmFsdWVzKVxuICAgICAgLnRoZW4oKCkgPT4gKHsgb3BzOiBbb2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IuY29uc3RyYWludCkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLmNvbnN0cmFpbnQubWF0Y2goL3VuaXF1ZV8oW2EtekEtWl0rKS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgZXJyb3IgPSBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBhc3luYyBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnZGVsZXRlT2JqZWN0c0J5UXVlcnknKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCBpbmRleCA9IDI7XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgaWYgKE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDApIHtcbiAgICAgIHdoZXJlLnBhdHRlcm4gPSAnVFJVRSc7XG4gICAgfVxuICAgIGNvbnN0IHFzID0gYFdJVEggZGVsZXRlZCBBUyAoREVMRVRFIEZST00gJDE6bmFtZSBXSEVSRSAke3doZXJlLnBhdHRlcm59IFJFVFVSTklORyAqKSBTRUxFQ1QgY291bnQoKikgRlJPTSBkZWxldGVkYDtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudClcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiArYS5jb3VudClcbiAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBjb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBEb24ndCBkZWxldGUgYW55dGhpbmcgaWYgZG9lc24ndCBleGlzdFxuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuICAvLyBSZXR1cm4gdmFsdWUgbm90IGN1cnJlbnRseSB3ZWxsIHNwZWNpZmllZC5cbiAgYXN5bmMgZmluZE9uZUFuZFVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGRlYnVnKCdmaW5kT25lQW5kVXBkYXRlJyk7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB1cGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKS50aGVuKFxuICAgICAgdmFsID0+IHZhbFswXVxuICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICBhc3luYyB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApOiBQcm9taXNlPFthbnldPiB7XG4gICAgZGVidWcoJ3VwZGF0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaXJzdF0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB1cGRhdGUgPSBoYW5kbGVEb3RGaWVsZHModXBkYXRlKTtcbiAgICAvLyBSZXNvbHZlIGF1dGhEYXRhIGZpcnN0LFxuICAgIC8vIFNvIHdlIGRvbid0IGVuZCB1cCB3aXRoIG11bHRpcGxlIGtleSB1cGRhdGVzXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXSA9IHVwZGF0ZVsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgZmllbGRWYWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgLy8gRHJvcCBhbnkgdW5kZWZpbmVkIHZhbHVlcy5cbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT0gJ2F1dGhEYXRhJykge1xuICAgICAgICAvLyBUaGlzIHJlY3Vyc2l2ZWx5IHNldHMgdGhlIGpzb25fb2JqZWN0XG4gICAgICAgIC8vIE9ubHkgMSBsZXZlbCBkZWVwXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlID0gKGpzb25iOiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBqc29uX29iamVjdF9zZXRfa2V5KENPQUxFU0NFKCR7anNvbmJ9LCAne30nOjpqc29uYiksICR7a2V5fSwgJHt2YWx1ZX0pOjpqc29uYmA7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGxhc3RLZXkgPSBgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICBjb25zdCBmaWVsZE5hbWVJbmRleCA9IGluZGV4O1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5yZWR1Y2UoKGxhc3RLZXk6IHN0cmluZywga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICBjb25zdCBzdHIgPSBnZW5lcmF0ZShsYXN0S2V5LCBgJCR7aW5kZXh9Ojp0ZXh0YCwgYCQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICBsZXQgdmFsdWUgPSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbHVlcy5wdXNoKGtleSwgdmFsdWUpO1xuICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgIH0sIGxhc3RLZXkpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtmaWVsZE5hbWVJbmRleH06bmFtZSA9ICR7dXBkYXRlfWApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsIDApICsgJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuYW1vdW50KTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZChDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtpbmRleCArIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgbnVsbCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ1JlbW92ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9yZW1vdmUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZFVuaXF1ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGRfdW5pcXVlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIC8vVE9ETzogc3RvcCBzcGVjaWFsIGNhc2luZyB0aGlzLiBJdCBzaG91bGQgY2hlY2sgZm9yIF9fdHlwZSA9PT0gJ0RhdGUnIGFuZCB1c2UgLmlzb1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICkge1xuICAgICAgICAvLyBHYXRoZXIga2V5cyB0byBpbmNyZW1lbnRcbiAgICAgICAgY29uc3Qga2V5c1RvSW5jcmVtZW50ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgT2JqZWN0LmtleXMgaXMgaXRlcmF0aW5nIG92ZXIgdGhlICoqb3JpZ2luYWwqKiB1cGRhdGUgb2JqZWN0XG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBzb21lIG9mIHRoZSBrZXlzIG9mIHRoZSBvcmlnaW5hbCB1cGRhdGUgY291bGQgYmUgbnVsbCBvciB1bmRlZmluZWQ6XG4gICAgICAgICAgICAvLyAoU2VlIHRoZSBhYm92ZSBjaGVjayBgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIGZpZWxkVmFsdWUgPT0gXCJ1bmRlZmluZWRcIilgKVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgaWYgKGtleXNUb0luY3JlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaW5jcmVtZW50UGF0dGVybnMgPVxuICAgICAgICAgICAgJyB8fCAnICtcbiAgICAgICAgICAgIGtleXNUb0luY3JlbWVudFxuICAgICAgICAgICAgICAubWFwKGMgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGZpZWxkVmFsdWVbY10uYW1vdW50O1xuICAgICAgICAgICAgICAgIHJldHVybiBgQ09OQ0FUKCd7XCIke2N9XCI6JywgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUtPj4nJHtjfScsJzAnKTo6aW50ICsgJHthbW91bnR9LCAnfScpOjpqc29uYmA7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5qb2luKCcgfHwgJyk7XG4gICAgICAgICAgLy8gU3RyaXAgdGhlIGtleXNcbiAgICAgICAgICBrZXlzVG9JbmNyZW1lbnQuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgZGVsZXRlIGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleXNUb0RlbGV0ZTogQXJyYXk8c3RyaW5nPiA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldC5cbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnRGVsZXRlJyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgY29uc3QgZGVsZXRlUGF0dGVybnMgPSBrZXlzVG9EZWxldGUucmVkdWNlKChwOiBzdHJpbmcsIGM6IHN0cmluZywgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHAgKyBgIC0gJyQke2luZGV4ICsgMSArIGl9OnZhbHVlJ2A7XG4gICAgICAgIH0sICcnKTtcbiAgICAgICAgLy8gT3ZlcnJpZGUgT2JqZWN0XG4gICAgICAgIGxldCB1cGRhdGVPYmplY3QgPSBcIid7fSc6Ompzb25iXCI7XG5cbiAgICAgICAgaWYgKGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgLy8gTWVyZ2UgT2JqZWN0XG4gICAgICAgICAgdXBkYXRlT2JqZWN0ID0gYENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAne30nOjpqc29uYilgO1xuICAgICAgICB9XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gKCR7dXBkYXRlT2JqZWN0fSAke2RlbGV0ZVBhdHRlcm5zfSAke2luY3JlbWVudFBhdHRlcm5zfSB8fCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMSArIGtleXNUb0RlbGV0ZS5sZW5ndGhcbiAgICAgICAgICB9Ojpqc29uYiApYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIC4uLmtleXNUb0RlbGV0ZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyICsga2V5c1RvRGVsZXRlLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZSkgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKTtcbiAgICAgICAgaWYgKGV4cGVjdGVkVHlwZSA9PT0gJ3RleHRbXScpIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnRleHRbXWApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWcoJ05vdCBzdXBwb3J0ZWQgdXBkYXRlJywgeyBmaWVsZE5hbWUsIGZpZWxkVmFsdWUgfSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgcXMgPSBgVVBEQVRFICQxOm5hbWUgU0VUICR7dXBkYXRlUGF0dGVybnMuam9pbigpfSAke3doZXJlQ2xhdXNlfSBSRVRVUk5JTkcgKmA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpLmFueShxcywgdmFsdWVzKTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5LCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCd1cHNlcnRPbmVPYmplY3QnKTtcbiAgICBjb25zdCBjcmVhdGVWYWx1ZSA9IE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZU9iamVjdChjbGFzc05hbWUsIHNjaGVtYSwgY3JlYXRlVmFsdWUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAvLyBpZ25vcmUgZHVwbGljYXRlIHZhbHVlIGVycm9ycyBhcyBpdCdzIHVwc2VydFxuICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLmZpbmRPbmVBbmRVcGRhdGUoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB1cGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgY2FzZUluc2Vuc2l0aXZlLCBleHBsYWluIH06IFF1ZXJ5T3B0aW9uc1xuICApIHtcbiAgICBkZWJ1ZygnZmluZCcpO1xuICAgIGNvbnN0IGhhc0xpbWl0ID0gbGltaXQgIT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBoYXNTa2lwID0gc2tpcCAhPT0gdW5kZWZpbmVkO1xuICAgIGxldCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IGxpbWl0UGF0dGVybiA9IGhhc0xpbWl0ID8gYExJTUlUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzTGltaXQpIHtcbiAgICAgIHZhbHVlcy5wdXNoKGxpbWl0KTtcbiAgICB9XG4gICAgY29uc3Qgc2tpcFBhdHRlcm4gPSBoYXNTa2lwID8gYE9GRlNFVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc1NraXApIHtcbiAgICAgIHZhbHVlcy5wdXNoKHNraXApO1xuICAgIH1cblxuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGlmIChzb3J0KSB7XG4gICAgICBjb25zdCBzb3J0Q29weTogYW55ID0gc29ydDtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBPYmplY3Qua2V5cyhzb3J0KVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPSBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgIH1cbiAgICBpZiAod2hlcmUuc29ydHMgJiYgT2JqZWN0LmtleXMoKHdoZXJlLnNvcnRzOiBhbnkpKS5sZW5ndGggPiAwKSB7XG4gICAgICBzb3J0UGF0dGVybiA9IGBPUkRFUiBCWSAke3doZXJlLnNvcnRzLmpvaW4oKX1gO1xuICAgIH1cblxuICAgIGxldCBjb2x1bW5zID0gJyonO1xuICAgIGlmIChrZXlzKSB7XG4gICAgICAvLyBFeGNsdWRlIGVtcHR5IGtleXNcbiAgICAgIC8vIFJlcGxhY2UgQUNMIGJ5IGl0J3Mga2V5c1xuICAgICAga2V5cyA9IGtleXMucmVkdWNlKChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vLnB1c2goJ19ycGVybScpO1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3dwZXJtJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAga2V5Lmxlbmd0aCA+IDAgJiZcbiAgICAgICAgICAvLyBSZW1vdmUgc2VsZWN0ZWQgZmllbGQgbm90IHJlZmVyZW5jZWQgaW4gdGhlIHNjaGVtYVxuICAgICAgICAgIC8vIFJlbGF0aW9uIGlzIG5vdCBhIGNvbHVtbiBpbiBwb3N0Z3Jlc1xuICAgICAgICAgIC8vICRzY29yZSBpcyBhIFBhcnNlIHNwZWNpYWwgZmllbGQgYW5kIGlzIGFsc28gbm90IGEgY29sdW1uXG4gICAgICAgICAgKChzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgIT09ICdSZWxhdGlvbicpIHx8IGtleSA9PT0gJyRzY29yZScpXG4gICAgICAgICkge1xuICAgICAgICAgIG1lbW8ucHVzaChrZXkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfSwgW10pO1xuICAgICAgY29sdW1ucyA9IGtleXNcbiAgICAgICAgLm1hcCgoa2V5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChrZXkgPT09ICckc2NvcmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gYHRzX3JhbmtfY2QodG9fdHN2ZWN0b3IoJCR7Mn0sICQkezN9Om5hbWUpLCB0b190c3F1ZXJ5KCQkezR9LCAkJHs1fSksIDMyKSBhcyBzY29yZWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJCR7aW5kZXggKyB2YWx1ZXMubGVuZ3RoICsgMX06bmFtZWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICB2YWx1ZXMgPSB2YWx1ZXMuY29uY2F0KGtleXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBgU0VMRUNUICR7Y29sdW1uc30gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn0gJHtza2lwUGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gUXVlcnkgb24gbm9uIGV4aXN0aW5nIHRhYmxlLCBkb24ndCBjcmFzaFxuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBDb252ZXJ0cyBmcm9tIGEgcG9zdGdyZXMtZm9ybWF0IG9iamVjdCB0byBhIFJFU1QtZm9ybWF0IG9iamVjdC5cbiAgLy8gRG9lcyBub3Qgc3RyaXAgb3V0IGFueXRoaW5nIGJhc2VkIG9uIGEgbGFjayBvZiBhdXRoZW50aWNhdGlvbi5cbiAgcG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgc2NoZW1hOiBhbnkpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyAmJiBvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICBsYXRpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueSxcbiAgICAgICAgICBsb25naXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLngsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBsZXQgY29vcmRzID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5zdWJzdHIoMiwgY29vcmRzLmxlbmd0aCAtIDQpLnNwbGl0KCcpLCgnKTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFtwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMV0pLCBwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMF0pXTtcbiAgICAgICAgfSk7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgICAgICAgIGNvb3JkaW5hdGVzOiBjb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IGNvbnN0cmFpbnROYW1lID0gYCR7Y2xhc3NOYW1lfV91bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZShxcywgW2NsYXNzTmFtZSwgY29uc3RyYWludE5hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgYXN5bmMgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPSAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiB7XG4gICAgICAgIGlmIChhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSBudWxsIHx8IGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IC0xKSB7XG4gICAgICAgICAgcmV0dXJuICFpc05hTigrYS5jb3VudCkgPyArYS5jb3VudCA6IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmFwcHJveGltYXRlX3Jvd19jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnKTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtmaWVsZCwgY29sdW1uLCBjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiA0LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgdHJhbnNmb3JtZXIgPSBpc0FycmF5RmllbGQgPyAnanNvbmJfYXJyYXlfZWxlbWVudHMnIDogJ09OJztcbiAgICBsZXQgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOm5hbWUpICQyOm5hbWUgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6cmF3KSAkMjpyYXcgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvcikge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKCFpc05lc3RlZCkge1xuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihvYmplY3QgPT4gb2JqZWN0W2ZpZWxkXSAhPT0gbnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvYmplY3RbZmllbGRdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkXSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2hpbGQgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVsxXTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiBvYmplY3RbY29sdW1uXVtjaGlsZF0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT5cbiAgICAgICAgcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKVxuICAgICAgKTtcbiAgfVxuXG4gIGFzeW5jIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICBkZWJ1ZygnYWdncmVnYXRlJyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAyO1xuICAgIGxldCBjb2x1bW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb3VudEZpZWxkID0gbnVsbDtcbiAgICBsZXQgZ3JvdXBWYWx1ZXMgPSBudWxsO1xuICAgIGxldCB3aGVyZVBhdHRlcm4gPSAnJztcbiAgICBsZXQgbGltaXRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNraXBQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGdyb3VwUGF0dGVybiA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGlwZWxpbmUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHN0YWdlID0gcGlwZWxpbmVbaV07XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kZ3JvdXBbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlICE9PSAnJykge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyBcIm9iamVjdElkXCJgKTtcbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVthbGlhc10gPT09ICdzdHJpbmcnICYmIHZhbHVlW2FsaWFzXSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc11bb3BlcmF0aW9uXSk7XG4gICAgICAgICAgICAgICAgaWYgKG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgYEVYVFJBQ1QoJHtcbiAgICAgICAgICAgICAgICAgICAgICBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXVxuICAgICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKTo6aW50ZWdlciBBUyAkJHtpbmRleCArIDF9Om5hbWVgXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpyYXdgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZ3JvdXBCeUZpZWxkcy5qb2luKCkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaWYgKHZhbHVlLiRzdW0pIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZS4kc3VtID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgU1VNKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kc3VtKSwgZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY291bnRGaWVsZCA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQ09VTlQoKikgQVMgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtYXgpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNQVgoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWF4KSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtaW4pIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNSU4oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWluKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRhdmcpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBBVkcoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kYXZnKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sdW1ucy5wdXNoKCcqJyk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgaWYgKGNvbHVtbnMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIGNvbHVtbnMgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kcHJvamVjdFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSAxIHx8IHZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICAgICAgICBjb25zdCBvck9yQW5kID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlLiRtYXRjaCwgJyRvcicpXG4gICAgICAgICAgPyAnIE9SICdcbiAgICAgICAgICA6ICcgQU5EICc7XG5cbiAgICAgICAgaWYgKHN0YWdlLiRtYXRjaC4kb3IpIHtcbiAgICAgICAgICBjb25zdCBjb2xsYXBzZSA9IHt9O1xuICAgICAgICAgIHN0YWdlLiRtYXRjaC4kb3IuZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgY29sbGFwc2Vba2V5XSA9IGVsZW1lbnRba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2ggPSBjb2xsYXBzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBmaWVsZCBpbiBzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRtYXRjaFtmaWVsZF07XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJykge1xuICAgICAgICAgICAgZmllbGQgPSAnb2JqZWN0SWQnO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBtYXRjaFBhdHRlcm5zID0gW107XG4gICAgICAgICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsdWVbY21wXSkge1xuICAgICAgICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBtYXRjaFBhdHRlcm5zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hlcmVQYXR0ZXJuID0gcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBzb3J0aW5nLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZ3JvdXBQYXR0ZXJuKSB7XG4gICAgICBjb2x1bW5zLmZvckVhY2goKGUsIGksIGEpID0+IHtcbiAgICAgICAgaWYgKGUgJiYgZS50cmltKCkgPT09ICcqJykge1xuICAgICAgICAgIGFbaV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbigpfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c2tpcFBhdHRlcm59ICR7Z3JvdXBQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHZhbHVlcykudGhlbihhID0+IHtcbiAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgIHJldHVybiBhO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0cyA9IGEubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnb2JqZWN0SWQnKSkge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0ge307XG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZFtrZXldID0gcmVzdWx0W2tleV07XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudEZpZWxkKSB7XG4gICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oeyBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIH06IGFueSkge1xuICAgIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB0byBtYWtlIHByb3BlciB1c2Ugb2YgY29ubmVjdGlvbnMgKEB2aXRhbHktdClcbiAgICBkZWJ1ZygncGVyZm9ybUluaXRpYWxpemF0aW9uJyk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cygpO1xuICAgIGNvbnN0IHByb21pc2VzID0gVm9sYXRpbGVDbGFzc2VzU2NoZW1hcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRhYmxlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciB8fFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuc2NoZW1hVXBncmFkZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpKTtcbiAgICB9KTtcbiAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2xpc3RlblRvU2NoZW1hKCkpO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsIGFzeW5jIHQgPT4ge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwubWlzYy5qc29uT2JqZWN0U2V0S2V5cyk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGQpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LnJlbW92ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zKTtcbiAgICAgICAgICByZXR1cm4gdC5jdHg7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGN0eCA9PiB7XG4gICAgICAgIGRlYnVnKGBpbml0aWFsaXphdGlvbkRvbmUgaW4gJHtjdHguZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiA/YW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgICAgICAgIGkubmFtZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGkua2V5LFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzSWZOZWVkZWQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgZmllbGROYW1lLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHlwZSxcbiAgICBdKTtcbiAgfVxuXG4gIGFzeW5jIGRyb3BJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHF1ZXJpZXMgPSBpbmRleGVzLm1hcChpID0+ICh7XG4gICAgICBxdWVyeTogJ0RST1AgSU5ERVggJDE6bmFtZScsXG4gICAgICB2YWx1ZXM6IGksXG4gICAgfSkpO1xuICAgIGF3YWl0IChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gIH1cblxuICBhc3luYyBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICBhc3luYyB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KHQgPT4ge1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50ID0gdDtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2ggPSBbXTtcbiAgICAgICAgcmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdDtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdC5jYXRjaCgpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2goUHJvbWlzZS5yZWplY3QoKSk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IGRlZmF1bHRJbmRleE5hbWUgPSBgcGFyc2VfZGVmYXVsdF8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9XG4gICAgICBpbmRleE5hbWUgIT0gbnVsbCA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7IG5hbWU6IGRlZmF1bHRJbmRleE5hbWUgfTtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGBsb3dlcigkJHtpbmRleCArIDN9Om5hbWUpIHZhcmNoYXJfcGF0dGVybl9vcHNgKVxuICAgICAgOiBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIGNvbnN0IHNldElkZW1wb3RlbmN5RnVuY3Rpb24gPVxuICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gOiBmYWxzZTtcbiAgICBpZiAoc2V0SWRlbXBvdGVuY3lGdW5jdGlvbikge1xuICAgICAgYXdhaXQgdGhpcy5lbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzKG9wdGlvbnMpO1xuICAgIH1cbiAgICBhd2FpdCBjb25uLm5vbmUocXMsIFtpbmRleE5hbWVPcHRpb25zLm5hbWUsIGNsYXNzTmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24ob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcXMgPSAnRFJPUCBGVU5DVElPTiBJRiBFWElTVFMgaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpJztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgdHRsT3B0aW9ucyA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyBgJHtvcHRpb25zLnR0bH0gc2Vjb25kc2AgOiAnNjAgc2Vjb25kcyc7XG4gICAgY29uc3QgcXMgPVxuICAgICAgJ0NSRUFURSBPUiBSRVBMQUNFIEZVTkNUSU9OIGlkZW1wb3RlbmN5X2RlbGV0ZV9leHBpcmVkX3JlY29yZHMoKSBSRVRVUk5TIHZvaWQgTEFOR1VBR0UgcGxwZ3NxbCBBUyAkJCBCRUdJTiBERUxFVEUgRlJPTSBcIl9JZGVtcG90ZW5jeVwiIFdIRVJFIGV4cGlyZSA8IE5PVygpIC0gSU5URVJWQUwgJDE7IEVORDsgJCQ7JztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzLCBbdHRsT3B0aW9uc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQb2x5Z29uVG9TUUwocG9seWdvbikge1xuICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYFBvbHlnb24gbXVzdCBoYXZlIGF0IGxlYXN0IDMgdmFsdWVzYCk7XG4gIH1cbiAgaWYgKFxuICAgIHBvbHlnb25bMF1bMF0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVswXSB8fFxuICAgIHBvbHlnb25bMF1bMV0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVsxXVxuICApIHtcbiAgICBwb2x5Z29uLnB1c2gocG9seWdvblswXSk7XG4gIH1cbiAgY29uc3QgdW5pcXVlID0gcG9seWdvbi5maWx0ZXIoKGl0ZW0sIGluZGV4LCBhcikgPT4ge1xuICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgcHQgPSBhcltpXTtcbiAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmb3VuZEluZGV4ID09PSBpbmRleDtcbiAgfSk7XG4gIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICApO1xuICB9XG4gIGNvbnN0IHBvaW50cyA9IHBvbHlnb25cbiAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgICAgcmV0dXJuIGAoJHtwb2ludFsxXX0sICR7cG9pbnRbMF19KWA7XG4gICAgfSlcbiAgICAuam9pbignLCAnKTtcbiAgcmV0dXJuIGAoJHtwb2ludHN9KWA7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpIHtcbiAgaWYgKCFyZWdleC5lbmRzV2l0aCgnXFxuJykpIHtcbiAgICByZWdleCArPSAnXFxuJztcbiAgfVxuXG4gIC8vIHJlbW92ZSBub24gZXNjYXBlZCBjb21tZW50c1xuICByZXR1cm4gKFxuICAgIHJlZ2V4XG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pIy4qXFxuL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSBsaW5lcyBzdGFydGluZyB3aXRoIGEgY29tbWVudFxuICAgICAgLnJlcGxhY2UoL14jLipcXG4vZ2ltLCAnJylcbiAgICAgIC8vIHJlbW92ZSBub24gZXNjYXBlZCB3aGl0ZXNwYWNlXG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxzKy9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuICAgICAgLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAudHJpbSgpXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NSZWdleFBhdHRlcm4ocykge1xuICBpZiAocyAmJiBzLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIC8vIHJlZ2V4IGZvciBzdGFydHNXaXRoXG4gICAgcmV0dXJuICdeJyArIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgxKSk7XG4gIH0gZWxzZSBpZiAocyAmJiBzLmVuZHNXaXRoKCckJykpIHtcbiAgICAvLyByZWdleCBmb3IgZW5kc1dpdGhcbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDAsIHMubGVuZ3RoIC0gMSkpICsgJyQnO1xuICB9XG5cbiAgLy8gcmVnZXggZm9yIGNvbnRhaW5zXG4gIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMpO1xufVxuXG5mdW5jdGlvbiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZSkge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXFxeXFxcXFEuKlxcXFxFLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdLiRyZWdleCk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0uJHJlZ2V4KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKHZhbHVlcykge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlLiRyZWdleCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKSB7XG4gIHJldHVybiByZW1haW5pbmdcbiAgICAuc3BsaXQoJycpXG4gICAgLm1hcChjID0+IHtcbiAgICAgIGNvbnN0IHJlZ2V4ID0gUmVnRXhwKCdbMC05IF18XFxcXHB7TH0nLCAndScpOyAvLyBTdXBwb3J0IGFsbCB1bmljb2RlIGxldHRlciBjaGFyc1xuICAgICAgaWYgKGMubWF0Y2gocmVnZXgpICE9PSBudWxsKSB7XG4gICAgICAgIC8vIGRvbid0IGVzY2FwZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVyc1xuICAgICAgICByZXR1cm4gYztcbiAgICAgIH1cbiAgICAgIC8vIGVzY2FwZSBldmVyeXRoaW5nIGVsc2UgKHNpbmdsZSBxdW90ZXMgd2l0aCBzaW5nbGUgcXVvdGVzLCBldmVyeXRoaW5nIGVsc2Ugd2l0aCBhIGJhY2tzbGFzaClcbiAgICAgIHJldHVybiBjID09PSBgJ2AgPyBgJydgIDogYFxcXFwke2N9YDtcbiAgICB9KVxuICAgIC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzOiBzdHJpbmcpIHtcbiAgY29uc3QgbWF0Y2hlcjEgPSAvXFxcXFEoKD8hXFxcXEUpLiopXFxcXEUkLztcbiAgY29uc3QgcmVzdWx0MTogYW55ID0gcy5tYXRjaChtYXRjaGVyMSk7XG4gIGlmIChyZXN1bHQxICYmIHJlc3VsdDEubGVuZ3RoID4gMSAmJiByZXN1bHQxLmluZGV4ID4gLTEpIHtcbiAgICAvLyBwcm9jZXNzIHJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIGFuZCBhbiBlbmQgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0MS5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MVsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gIGNvbnN0IG1hdGNoZXIyID0gL1xcXFxRKCg/IVxcXFxFKS4qKSQvO1xuICBjb25zdCByZXN1bHQyOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIyKTtcbiAgaWYgKHJlc3VsdDIgJiYgcmVzdWx0Mi5sZW5ndGggPiAxICYmIHJlc3VsdDIuaW5kZXggPiAtMSkge1xuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyKDAsIHJlc3VsdDIuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDJbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyByZW1vdmUgYWxsIGluc3RhbmNlcyBvZiBcXFEgYW5kIFxcRSBmcm9tIHRoZSByZW1haW5pbmcgdGV4dCAmIGVzY2FwZSBzaW5nbGUgcXVvdGVzXG4gIHJldHVybiBzXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcRSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXFEpLywgJyQxJylcbiAgICAucmVwbGFjZSgvXlxcXFxFLywgJycpXG4gICAgLnJlcGxhY2UoL15cXFxcUS8sICcnKVxuICAgIC5yZXBsYWNlKC8oW14nXSknLywgYCQxJydgKVxuICAgIC5yZXBsYWNlKC9eJyhbXiddKS8sIGAnJyQxYCk7XG59XG5cbnZhciBHZW9Qb2ludENvZGVyID0ge1xuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50JztcbiAgfSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLElBQUFBLGVBQUEsR0FBQUMsT0FBQTtBQUVBLElBQUFDLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFHLE9BQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFJLEtBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLElBQUEsR0FBQUgsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFNLGVBQUEsR0FBQU4sT0FBQTtBQUFtRCxTQUFBRSx1QkFBQUssR0FBQSxXQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLEtBQUFFLE9BQUEsRUFBQUYsR0FBQTtBQUFBLFNBQUFHLFFBQUFDLE1BQUEsRUFBQUMsY0FBQSxRQUFBQyxJQUFBLEdBQUFDLE1BQUEsQ0FBQUQsSUFBQSxDQUFBRixNQUFBLE9BQUFHLE1BQUEsQ0FBQUMscUJBQUEsUUFBQUMsT0FBQSxHQUFBRixNQUFBLENBQUFDLHFCQUFBLENBQUFKLE1BQUEsR0FBQUMsY0FBQSxLQUFBSSxPQUFBLEdBQUFBLE9BQUEsQ0FBQUMsTUFBQSxXQUFBQyxHQUFBLFdBQUFKLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQVIsTUFBQSxFQUFBTyxHQUFBLEVBQUFFLFVBQUEsT0FBQVAsSUFBQSxDQUFBUSxJQUFBLENBQUFDLEtBQUEsQ0FBQVQsSUFBQSxFQUFBRyxPQUFBLFlB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