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
              const constraintFieldName = transformDotField(fieldName);
              patterns.push(`(${constraintFieldName} <> $${index} OR ${constraintFieldName} IS NULL)`);
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
          values.push(fieldValue.$eq);
          patterns.push(`${transformDotField(fieldName)} = $${index++}`);
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
        let postgresValue = toPostgresValue(fieldValue[cmp]);
        let constraintFieldName;
        if (fieldName.indexOf('.') >= 0) {
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
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    delete databaseOptions.enableSchemaHooks;
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, databaseOptions);
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
      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
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
        for (const field in stage.$match) {
          const value = stage.$match[field];
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUG9zdGdyZXNDbGllbnQiLCJyZXF1aXJlIiwiX25vZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZGFzaCIsIl91dWlkIiwiX3NxbCIsIl9TdG9yYWdlQWRhcHRlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsIm9iamVjdCIsImVudW1lcmFibGVPbmx5Iiwia2V5cyIsIk9iamVjdCIsImdldE93blByb3BlcnR5U3ltYm9scyIsInN5bWJvbHMiLCJmaWx0ZXIiLCJzeW0iLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsInRhcmdldCIsImkiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJzb3VyY2UiLCJmb3JFYWNoIiwia2V5IiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsImNhbGwiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJVdGlscyIsIlBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciIsIlBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciIsIlBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsImxvZ2dlciIsImRlYnVnIiwiYXJncyIsImNvbmNhdCIsInNsaWNlIiwibG9nIiwiZ2V0TG9nZ2VyIiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRyYW5zZm9ybVZhbHVlIiwib2JqZWN0SWQiLCJlbXB0eUNMUFMiLCJmcmVlemUiLCJmaW5kIiwiZ2V0IiwiY291bnQiLCJjcmVhdGUiLCJ1cGRhdGUiLCJkZWxldGUiLCJhZGRGaWVsZCIsInByb3RlY3RlZEZpZWxkcyIsImRlZmF1bHRDTFBTIiwidG9QYXJzZVNjaGVtYSIsInNjaGVtYSIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfd3Blcm0iLCJfcnBlcm0iLCJjbHBzIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaW5kZXhlcyIsInRvUG9zdGdyZXNTY2hlbWEiLCJfcGFzc3dvcmRfaGlzdG9yeSIsImhhbmRsZURvdEZpZWxkcyIsImZpZWxkTmFtZSIsImluZGV4T2YiLCJjb21wb25lbnRzIiwic3BsaXQiLCJmaXJzdCIsInNoaWZ0IiwiY3VycmVudE9iaiIsIm5leHQiLCJfX29wIiwidHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMiLCJtYXAiLCJjbXB0IiwiaW5kZXgiLCJ0cmFuc2Zvcm1Eb3RGaWVsZCIsImpvaW4iLCJ0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCIsInN1YnN0ciIsInZhbGlkYXRlS2V5cyIsImluY2x1ZGVzIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfTkVTVEVEX0tFWSIsImpvaW5UYWJsZXNGb3JTY2hlbWEiLCJsaXN0IiwiZmllbGQiLCJidWlsZFdoZXJlQ2xhdXNlIiwicXVlcnkiLCJjYXNlSW5zZW5zaXRpdmUiLCJwYXR0ZXJucyIsInZhbHVlcyIsInNvcnRzIiwiaXNBcnJheUZpZWxkIiwiaW5pdGlhbFBhdHRlcm5zTGVuZ3RoIiwiZmllbGRWYWx1ZSIsIiRleGlzdHMiLCJhdXRoRGF0YU1hdGNoIiwibWF0Y2giLCIkaW4iLCIkcmVnZXgiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJjb25zdHJhaW50RmllbGROYW1lIiwiJHJlbGF0aXZlVGltZSIsIklOVkFMSURfSlNPTiIsInBvaW50IiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkZXEiLCJpc0luT3JOaW4iLCJBcnJheSIsImlzQXJyYXkiLCIkbmluIiwiaW5QYXR0ZXJucyIsImFsbG93TnVsbCIsImxpc3RFbGVtIiwibGlzdEluZGV4IiwiY3JlYXRlQ29uc3RyYWludCIsImJhc2VBcnJheSIsIm5vdEluIiwiXyIsImZsYXRNYXAiLCJlbHQiLCIkYWxsIiwiaXNBbnlWYWx1ZVJlZ2V4U3RhcnRzV2l0aCIsImlzQWxsVmFsdWVzUmVnZXhPck5vbmUiLCJwcm9jZXNzUmVnZXhQYXR0ZXJuIiwic3Vic3RyaW5nIiwiJGNvbnRhaW5lZEJ5IiwiYXJyIiwiJHRleHQiLCJzZWFyY2giLCIkc2VhcmNoIiwibGFuZ3VhZ2UiLCIkdGVybSIsIiRsYW5ndWFnZSIsIiRjYXNlU2Vuc2l0aXZlIiwiJGRpYWNyaXRpY1NlbnNpdGl2ZSIsIiRuZWFyU3BoZXJlIiwiZGlzdGFuY2UiLCIkbWF4RGlzdGFuY2UiLCJkaXN0YW5jZUluS00iLCIkd2l0aGluIiwiJGJveCIsImJveCIsImxlZnQiLCJib3R0b20iLCJyaWdodCIsInRvcCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwiY2VudGVyU3BoZXJlIiwiR2VvUG9pbnQiLCJHZW9Qb2ludENvZGVyIiwiaXNWYWxpZEpTT04iLCJfdmFsaWRhdGUiLCJpc05hTiIsIiRwb2x5Z29uIiwicG9seWdvbiIsInBvaW50cyIsImNvb3JkaW5hdGVzIiwiJGdlb0ludGVyc2VjdHMiLCIkcG9pbnQiLCJyZWdleCIsIm9wZXJhdG9yIiwib3B0cyIsIiRvcHRpb25zIiwicmVtb3ZlV2hpdGVTcGFjZSIsImNvbnZlcnRQb2x5Z29uVG9TUUwiLCJjbXAiLCJwZ0NvbXBhcmF0b3IiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJwYXJzZXJSZXN1bHQiLCJyZWxhdGl2ZVRpbWVUb0RhdGUiLCJzdGF0dXMiLCJyZXN1bHQiLCJjb25zb2xlIiwiZXJyb3IiLCJpbmZvIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImNvbGxlY3Rpb25QcmVmaXgiLCJkYXRhYmFzZU9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwiY2xpZW50IiwicGdwIiwiY3JlYXRlQ2xpZW50IiwiX2NsaWVudCIsIl9vbmNoYW5nZSIsIl9wZ3AiLCJ1dWlkdjQiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwid2F0Y2giLCJjYWxsYmFjayIsImNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkiLCJhbmFseXplIiwiaGFuZGxlU2h1dGRvd24iLCJfc3RyZWFtIiwiZG9uZSIsIiRwb29sIiwiZW5kIiwiX2xpc3RlblRvU2NoZW1hIiwiY29ubmVjdCIsImRpcmVjdCIsIm9uIiwiZGF0YSIsInBheWxvYWQiLCJwYXJzZSIsInNlbmRlcklkIiwibm9uZSIsIl9ub3RpZnlTY2hlbWFDaGFuZ2UiLCJjYXRjaCIsIl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzIiwiY29ubiIsImNsYXNzRXhpc3RzIiwib25lIiwiYSIsImV4aXN0cyIsInNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIkNMUHMiLCJ0YXNrIiwidCIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsInNlbGYiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9pZF8iLCJfaWQiLCJkZWxldGVkSW5kZXhlcyIsImluc2VydGVkSW5kZXhlcyIsIklOVkFMSURfUVVFUlkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsInR4IiwiY3JlYXRlSW5kZXhlcyIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiY29kZSIsImRldGFpbCIsIkRVUExJQ0FURV9WQUxVRSIsInZhbHVlc0FycmF5IiwicGF0dGVybnNBcnJheSIsImFzc2lnbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfZmFpbGVkX2xvZ2luX2NvdW50IiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJyZWxhdGlvbnMiLCJwYXJzZVR5cGUiLCJxcyIsImJhdGNoIiwiam9pblRhYmxlIiwic2NoZW1hVXBncmFkZSIsImNvbHVtbnMiLCJjb2x1bW5fbmFtZSIsIm5ld0NvbHVtbnMiLCJpdGVtIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInBvc3RncmVzVHlwZSIsImFueSIsInBhdGgiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJkZWxldGVDbGFzcyIsIm9wZXJhdGlvbnMiLCJyZXNwb25zZSIsImhlbHBlcnMiLCJ0aGVuIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJtYXRjaGVzIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsInBhcnNlRmxvYXQiLCJjcmVhdGVkQXQiLCJ0b0lTT1N0cmluZyIsInVwZGF0ZWRBdCIsImV4cGlyZXNBdCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRQYXR0ZXJucyIsIm1lc3NhZ2UiLCJyZWFkUHJlZmVyZW5jZSIsImVzdGltYXRlIiwiYXBwcm94aW1hdGVfcm93X2NvdW50IiwiZGlzdGluY3QiLCJjb2x1bW4iLCJpc05lc3RlZCIsImlzUG9pbnRlckZpZWxkIiwidHJhbnNmb3JtZXIiLCJjaGlsZCIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwiY291bnRGaWVsZCIsImdyb3VwVmFsdWVzIiwiZ3JvdXBQYXR0ZXJuIiwic3RhZ2UiLCIkZ3JvdXAiLCJncm91cEJ5RmllbGRzIiwiYWxpYXMiLCJvcGVyYXRpb24iLCIkc3VtIiwiJG1heCIsIiRtaW4iLCIkYXZnIiwiJHByb2plY3QiLCIkbWF0Y2giLCIkb3IiLCJjb2xsYXBzZSIsImVsZW1lbnQiLCJtYXRjaFBhdHRlcm5zIiwiJGxpbWl0IiwiJHNraXAiLCIkc29ydCIsIm9yZGVyIiwiZSIsInRyaW0iLCJCb29sZWFuIiwicGFyc2VJbnQiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicHJvbWlzZXMiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJhbGwiLCJzcWwiLCJtaXNjIiwianNvbk9iamVjdFNldEtleXMiLCJhcnJheSIsImFkZCIsImFkZFVuaXF1ZSIsInJlbW92ZSIsImNvbnRhaW5zQWxsIiwiY29udGFpbnNBbGxSZWdleCIsImNvbnRhaW5zIiwiY3R4IiwiZHVyYXRpb24iLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJnZXRJbmRleGVzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJ1cGRhdGVFc3RpbWF0ZWRDb3VudCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiZW5zdXJlSW5kZXgiLCJpbmRleE5hbWUiLCJvcHRpb25zIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwiZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyIsImRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24iLCJ0dGxPcHRpb25zIiwidHRsIiwiZXhwb3J0cyIsInVuaXF1ZSIsImFyIiwiZm91bmRJbmRleCIsInB0IiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZW5kc1dpdGgiLCJyZXBsYWNlIiwicyIsInN0YXJ0c1dpdGgiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJzb21lIiwiY3JlYXRlTGl0ZXJhbFJlZ2V4IiwicmVtYWluaW5nIiwiUmVnRXhwIiwibWF0Y2hlcjEiLCJyZXN1bHQxIiwicHJlZml4IiwibWF0Y2hlcjIiLCJyZXN1bHQyIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIHJldHVybiB2YWx1ZS5vYmplY3RJZDtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG4vLyBEdXBsaWNhdGUgZnJvbSB0aGVuIG1vbmdvIGFkYXB0ZXIuLi5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgZ2V0OiB7fSxcbiAgY291bnQ6IHt9LFxuICBjcmVhdGU6IHt9LFxuICB1cGRhdGU6IHt9LFxuICBkZWxldGU6IHt9LFxuICBhZGRGaWVsZDoge30sXG4gIHByb3RlY3RlZEZpZWxkczoge30sXG59KTtcblxuY29uc3QgZGVmYXVsdENMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDogeyAnKic6IHRydWUgfSxcbiAgZ2V0OiB7ICcqJzogdHJ1ZSB9LFxuICBjb3VudDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuY29uc3QgdG9QYXJzZVNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgfVxuICBpZiAoc2NoZW1hLmZpZWxkcykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIH1cbiAgbGV0IGNscHMgPSBkZWZhdWx0Q0xQUztcbiAgaWYgKHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpIHtcbiAgICBjbHBzID0geyAuLi5lbXB0eUNMUFMsIC4uLnNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfTtcbiAgfVxuICBsZXQgaW5kZXhlcyA9IHt9O1xuICBpZiAoc2NoZW1hLmluZGV4ZXMpIHtcbiAgICBpbmRleGVzID0geyAuLi5zY2hlbWEuaW5kZXhlcyB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgIGZpZWxkczogc2NoZW1hLmZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGNscHMsXG4gICAgaW5kZXhlcyxcbiAgfTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoIXNjaGVtYSkge1xuICAgIHJldHVybiBzY2hlbWE7XG4gIH1cbiAgc2NoZW1hLmZpZWxkcyA9IHNjaGVtYS5maWVsZHMgfHwge307XG4gIHNjaGVtYS5maWVsZHMuX3dwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIHNjaGVtYS5maWVsZHMuX3JwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgIHNjaGVtYS5maWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgfVxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY29uc3QgaGFuZGxlRG90RmllbGRzID0gb2JqZWN0ID0+IHtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICBvYmplY3RbZmlyc3RdID0gb2JqZWN0W2ZpcnN0XSB8fCB7fTtcbiAgICAgIGxldCBjdXJyZW50T2JqID0gb2JqZWN0W2ZpcnN0XTtcbiAgICAgIGxldCBuZXh0O1xuICAgICAgbGV0IHZhbHVlID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICBpZiAodmFsdWUgJiYgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdmFsdWUgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgd2hpbGUgKChuZXh0ID0gY29tcG9uZW50cy5zaGlmdCgpKSkge1xuICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbmQtYXNzaWduICovXG4gICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSBjdXJyZW50T2JqW25leHRdIHx8IHt9O1xuICAgICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjdXJyZW50T2JqW25leHRdID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudE9iaiA9IGN1cnJlbnRPYmpbbmV4dF07XG4gICAgICB9XG4gICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzID0gZmllbGROYW1lID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpLm1hcCgoY21wdCwgaW5kZXgpID0+IHtcbiAgICBpZiAoaW5kZXggPT09IDApIHtcbiAgICAgIHJldHVybiBgXCIke2NtcHR9XCJgO1xuICAgIH1cbiAgICByZXR1cm4gYCcke2NtcHR9J2A7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGQgPSBmaWVsZE5hbWUgPT4ge1xuICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcbiAgICByZXR1cm4gYFwiJHtmaWVsZE5hbWV9XCJgO1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudHMgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpO1xuICBsZXQgbmFtZSA9IGNvbXBvbmVudHMuc2xpY2UoMCwgY29tcG9uZW50cy5sZW5ndGggLSAxKS5qb2luKCctPicpO1xuICBuYW1lICs9ICctPj4nICsgY29tcG9uZW50c1tjb21wb25lbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gbmFtZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKHR5cGVvZiBmaWVsZE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF9jcmVhdGVkX2F0Jykge1xuICAgIHJldHVybiAnY3JlYXRlZEF0JztcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF91cGRhdGVkX2F0Jykge1xuICAgIHJldHVybiAndXBkYXRlZEF0JztcbiAgfVxuICByZXR1cm4gZmllbGROYW1lLnN1YnN0cigxKTtcbn07XG5cbmNvbnN0IHZhbGlkYXRlS2V5cyA9IG9iamVjdCA9PiB7XG4gIGlmICh0eXBlb2Ygb2JqZWN0ID09ICdvYmplY3QnKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgIHZhbGlkYXRlS2V5cyhvYmplY3Rba2V5XSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gUmV0dXJucyB0aGUgbGlzdCBvZiBqb2luIHRhYmxlcyBvbiBhIHNjaGVtYVxuY29uc3Qgam9pblRhYmxlc0ZvclNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGNvbnN0IGxpc3QgPSBbXTtcbiAgaWYgKHNjaGVtYSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGBfSm9pbjoke2ZpZWxkfToke3NjaGVtYS5jbGFzc05hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGxpc3Q7XG59O1xuXG5pbnRlcmZhY2UgV2hlcmVDbGF1c2Uge1xuICBwYXR0ZXJuOiBzdHJpbmc7XG4gIHZhbHVlczogQXJyYXk8YW55PjtcbiAgc29ydHM6IEFycmF5PGFueT47XG59XG5cbmNvbnN0IGJ1aWxkV2hlcmVDbGF1c2UgPSAoeyBzY2hlbWEsIHF1ZXJ5LCBpbmRleCwgY2FzZUluc2Vuc2l0aXZlIH0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9IHBhdHRlcm5zLmxlbmd0aDtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gcXVlcnlbZmllbGROYW1lXTtcblxuICAgIC8vIG5vdGhpbmcgaW4gdGhlIHNjaGVtYSwgaXQncyBnb25uYSBibG93IHVwXG4gICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgIC8vIGFzIGl0IHdvbid0IGV4aXN0XG4gICAgICBpZiAoZmllbGRWYWx1ZSAmJiBmaWVsZFZhbHVlLiRleGlzdHMgPT09IGZhbHNlKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgLy8gVE9ETzogSGFuZGxlIHF1ZXJ5aW5nIGJ5IF9hdXRoX2RhdGFfcHJvdmlkZXIsIGF1dGhEYXRhIGlzIHN0b3JlZCBpbiBhdXRoRGF0YSBmaWVsZFxuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmIChjYXNlSW5zZW5zaXRpdmUgJiYgKGZpZWxkTmFtZSA9PT0gJ3VzZXJuYW1lJyB8fCBmaWVsZE5hbWUgPT09ICdlbWFpbCcpKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGBMT1dFUigkJHtpbmRleH06bmFtZSkgPSBMT1dFUigkJHtpbmRleCArIDF9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgIGxldCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChuYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgICBuYW1lID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06cmF3KTo6anNvbmIgQD4gJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRpbikpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgICAgICAvLyBIYW5kbGUgbGF0ZXJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ID0gJCR7aW5kZXggKyAxfTo6dGV4dGApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgZmllbGRWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAvLyBDYW4ndCBjYXN0IGJvb2xlYW4gdG8gZG91YmxlIHByZWNpc2lvblxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ051bWJlcicpIHtcbiAgICAgICAgLy8gU2hvdWxkIGFsd2F5cyByZXR1cm4gemVybyByZXN1bHRzXG4gICAgICAgIGNvbnN0IE1BWF9JTlRfUExVU19PTkUgPSA5MjIzMzcyMDM2ODU0Nzc1ODA4O1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIE1BWF9JTlRfUExVU19PTkUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChbJyRvcicsICckbm9yJywgJyRhbmQnXS5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICBjb25zdCBjbGF1c2VzID0gW107XG4gICAgICBjb25zdCBjbGF1c2VWYWx1ZXMgPSBbXTtcbiAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChzdWJRdWVyeSA9PiB7XG4gICAgICAgIGNvbnN0IGNsYXVzZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICBxdWVyeTogc3ViUXVlcnksXG4gICAgICAgICAgaW5kZXgsXG4gICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKGNsYXVzZS5wYXR0ZXJuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjbGF1c2VzLnB1c2goY2xhdXNlLnBhdHRlcm4pO1xuICAgICAgICAgIGNsYXVzZVZhbHVlcy5wdXNoKC4uLmNsYXVzZS52YWx1ZXMpO1xuICAgICAgICAgIGluZGV4ICs9IGNsYXVzZS52YWx1ZXMubGVuZ3RoO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3Qgb3JPckFuZCA9IGZpZWxkTmFtZSA9PT0gJyRhbmQnID8gJyBBTkQgJyA6ICcgT1IgJztcbiAgICAgIGNvbnN0IG5vdCA9IGZpZWxkTmFtZSA9PT0gJyRub3InID8gJyBOT1QgJyA6ICcnO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0oJHtjbGF1c2VzLmpvaW4ob3JPckFuZCl9KWApO1xuICAgICAgdmFsdWVzLnB1c2goLi4uY2xhdXNlVmFsdWVzKTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBmaWVsZFZhbHVlLiRuZSA9IEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlLiRuZV0pO1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBOT1QgYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGRWYWx1ZS4kbmUgPT09IG51bGwpIHtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOT1QgTlVMTGApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBpZiBub3QgbnVsbCwgd2UgbmVlZCB0byBtYW51YWxseSBleGNsdWRlIG51bGxcbiAgICAgICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICBgKCQke2luZGV4fTpuYW1lIDw+IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pIE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXh9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kbmUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSA8PiAkJHtpbmRleCArIDF9IE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmU7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUT0RPOiBzdXBwb3J0IGFycmF5c1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJG5lKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGVxICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRlcSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0gPSAkJHtpbmRleCsrfWApO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRlcSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kZXEuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgaXNJbk9yTmluID0gQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgfHwgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRuaW4pO1xuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pICYmXG4gICAgICBpc0FycmF5RmllbGQgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cyAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnXG4gICAgKSB7XG4gICAgICBjb25zdCBpblBhdHRlcm5zID0gW107XG4gICAgICBsZXQgYWxsb3dOdWxsID0gZmFsc2U7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgZmllbGRWYWx1ZS4kaW4uZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICBpZiAobGlzdEVsZW0gPT09IG51bGwpIHtcbiAgICAgICAgICBhbGxvd051bGwgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleCAtIChhbGxvd051bGwgPyAxIDogMCl9YCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKGFsbG93TnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgSVMgTlVMTCBPUiAkJHtpbmRleH06bmFtZSAmJiBBUlJBWVske2luUGF0dGVybnMuam9pbigpfV0pYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAmJiBBUlJBWVske2luUGF0dGVybnMuam9pbigpfV1gKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gaW5kZXggKyAxICsgaW5QYXR0ZXJucy5sZW5ndGg7XG4gICAgfSBlbHNlIGlmIChpc0luT3JOaW4pIHtcbiAgICAgIHZhciBjcmVhdGVDb25zdHJhaW50ID0gKGJhc2VBcnJheSwgbm90SW4pID0+IHtcbiAgICAgICAgY29uc3Qgbm90ID0gbm90SW4gPyAnIE5PVCAnIDogJyc7XG4gICAgICAgIGlmIChiYXNlQXJyYXkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoYmFzZUFycmF5KSk7XG4gICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBIYW5kbGUgTmVzdGVkIERvdCBOb3RhdGlvbiBBYm92ZVxuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBpblBhdHRlcm5zID0gW107XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgYmFzZUFycmF5LmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgaWYgKGxpc3RFbGVtICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXh9YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJHtub3R9IElOICgke2luUGF0dGVybnMuam9pbigpfSlgKTtcbiAgICAgICAgICAgIGluZGV4ID0gaW5kZXggKyAxICsgaW5QYXR0ZXJucy5sZW5ndGg7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCFub3RJbikge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICAgIGluZGV4ID0gaW5kZXggKyAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEhhbmRsZSBlbXB0eSBhcnJheVxuICAgICAgICAgIGlmIChub3RJbikge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaCgnMSA9IDEnKTsgLy8gUmV0dXJuIGFsbCB2YWx1ZXNcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaCgnMSA9IDInKTsgLy8gUmV0dXJuIG5vIHZhbHVlc1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRpbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgZmFsc2VcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZFZhbHVlLiRuaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kbmluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRpbiB2YWx1ZScpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJG5pbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJG5pbiB2YWx1ZScpO1xuICAgIH1cblxuICAgIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkgJiYgaXNBcnJheUZpZWxkKSB7XG4gICAgICBpZiAoaXNBbnlWYWx1ZVJlZ2V4U3RhcnRzV2l0aChmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICAgIGlmICghaXNBbGxWYWx1ZXNSZWdleE9yTm9uZShmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ0FsbCAkYWxsIHZhbHVlcyBtdXN0IGJlIG9mIHJlZ2V4IHR5cGUgb3Igbm9uZTogJyArIGZpZWxkVmFsdWUuJGFsbFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkVmFsdWUuJGFsbC5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihmaWVsZFZhbHVlLiRhbGxbaV0uJHJlZ2V4KTtcbiAgICAgICAgICBmaWVsZFZhbHVlLiRhbGxbaV0gPSB2YWx1ZS5zdWJzdHJpbmcoMSkgKyAnJSc7XG4gICAgICAgIH1cbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnNfYWxsX3JlZ2V4KCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zX2FsbCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYCk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGFsbCkpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGFsbC5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kYWxsWzBdLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXhpc3RzID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRleGlzdHMuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS4kZXhpc3RzKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kY29udGFpbmVkQnkpIHtcbiAgICAgIGNvbnN0IGFyciA9IGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5O1xuICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJGNvbnRhaW5lZEJ5OiBzaG91bGQgYmUgYW4gYXJyYXlgKTtcbiAgICAgIH1cblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPEAgJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoYXJyKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR0ZXh0KSB7XG4gICAgICBjb25zdCBzZWFyY2ggPSBmaWVsZFZhbHVlLiR0ZXh0LiRzZWFyY2g7XG4gICAgICBsZXQgbGFuZ3VhZ2UgPSAnZW5nbGlzaCc7XG4gICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHNlYXJjaCwgc2hvdWxkIGJlIG9iamVjdGApO1xuICAgICAgfVxuICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHRlcm0sIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGxhbmd1YWdlICYmIHR5cGVvZiBzZWFyY2guJGxhbmd1YWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkbGFuZ3VhZ2UsIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICBsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGNhc2VTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUgbm90IHN1cHBvcnRlZCwgcGxlYXNlIHVzZSAkcmVnZXggb3IgY3JlYXRlIGEgc2VwYXJhdGUgbG93ZXIgY2FzZSBjb2x1bW4uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUgLSBmYWxzZSBub3Qgc3VwcG9ydGVkLCBpbnN0YWxsIFBvc3RncmVzIFVuYWNjZW50IEV4dGVuc2lvbmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGB0b190c3ZlY3RvcigkJHtpbmRleH0sICQke2luZGV4ICsgMX06bmFtZSkgQEAgdG9fdHNxdWVyeSgkJHtpbmRleCArIDJ9LCAkJHtpbmRleCArIDN9KWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChsYW5ndWFnZSwgZmllbGROYW1lLCBsYW5ndWFnZSwgc2VhcmNoLiR0ZXJtKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lYXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmVhclNwaGVyZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gZmllbGRWYWx1ZS4kbWF4RGlzdGFuY2U7XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICBzb3J0cy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSBBU0NgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kd2l0aGluICYmIGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94KSB7XG4gICAgICBjb25zdCBib3ggPSBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveDtcbiAgICAgIGNvbnN0IGxlZnQgPSBib3hbMF0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgYm90dG9tID0gYm94WzBdLmxhdGl0dWRlO1xuICAgICAgY29uc3QgcmlnaHQgPSBib3hbMV0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgdG9wID0gYm94WzFdLmxhdGl0dWRlO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6Ym94YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoKCR7bGVmdH0sICR7Ym90dG9tfSksICgke3JpZ2h0fSwgJHt0b3B9KSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZSkge1xuICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmU7XG4gICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgbGV0IHBvaW50ID0gY2VudGVyU3BoZXJlWzBdO1xuICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICB9IGVsc2UgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBnZW8gcG9pbnQgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIC8vIEdldCBkaXN0YW5jZSBhbmQgdmFsaWRhdGVcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgaWYgKGlzTmFOKGRpc3RhbmNlKSB8fCBkaXN0YW5jZSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZGlzdGFuY2UgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb24pIHtcbiAgICAgIGNvbnN0IHBvbHlnb24gPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb247XG4gICAgICBsZXQgcG9pbnRzO1xuICAgICAgaWYgKHR5cGVvZiBwb2x5Z29uID09PSAnb2JqZWN0JyAmJiBwb2x5Z29uLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGlmICghcG9seWdvbi5jb29yZGluYXRlcyB8fCBwb2x5Z29uLmNvb3JkaW5hdGVzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7IFBvbHlnb24uY29vcmRpbmF0ZXMgc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBsb24vbGF0IHBhaXJzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbi5jb29yZGluYXRlcztcbiAgICAgIH0gZWxzZSBpZiAocG9seWdvbiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgR2VvUG9pbnRzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgXCJiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGJlIFBvbHlnb24gb2JqZWN0IG9yIEFycmF5IG9mIFBhcnNlLkdlb1BvaW50J3NcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcG9pbnRzID0gcG9pbnRzXG4gICAgICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgICByZXR1cm4gYCgke3BvaW50WzBdfSwgJHtwb2ludFsxXX0pYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRnZW9XaXRoaW4gdmFsdWUnKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcsICcpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnRzfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzICYmIGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50KSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50O1xuICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvSW50ZXJzZWN0IHZhbHVlOyAkcG9pbnQgc2hvdWxkIGJlIEdlb1BvaW50J1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvbHlnb24gQD4gJCR7aW5kZXggKyAxfTo6cG9pbnRgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgIGxldCByZWdleCA9IGZpZWxkVmFsdWUuJHJlZ2V4O1xuICAgICAgbGV0IG9wZXJhdG9yID0gJ34nO1xuICAgICAgY29uc3Qgb3B0cyA9IGZpZWxkVmFsdWUuJG9wdGlvbnM7XG4gICAgICBpZiAob3B0cykge1xuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCdpJykgPj0gMCkge1xuICAgICAgICAgIG9wZXJhdG9yID0gJ34qJztcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCd4JykgPj0gMCkge1xuICAgICAgICAgIHJlZ2V4ID0gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICByZWdleCA9IHByb2Nlc3NSZWdleFBhdHRlcm4ocmVnZXgpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ICR7b3BlcmF0b3J9ICckJHtpbmRleCArIDF9OnJhdydgKTtcbiAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIHJlZ2V4KTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWVdKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuaXNvKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICBpbmRleCArPSAzO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICBpZiAoZmllbGRWYWx1ZVtjbXBdIHx8IGZpZWxkVmFsdWVbY21wXSA9PT0gMCkge1xuICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgbGV0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcbiAgICAgICAgbGV0IGNvbnN0cmFpbnRGaWVsZE5hbWU7XG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICBsZXQgY2FzdFR5cGU7XG4gICAgICAgICAgc3dpdGNoICh0eXBlb2YgcG9zdGdyZXNWYWx1ZSkge1xuICAgICAgICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgICAgICAgY2FzdFR5cGUgPSAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgICAgICAgIGNhc3RUeXBlID0gJ2Jvb2xlYW4nO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIGNhc3RUeXBlID0gdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgID8gYENBU1QgKCgke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9KSBBUyAke2Nhc3RUeXBlfSlgXG4gICAgICAgICAgICA6IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlID09PSAnb2JqZWN0JyAmJiBwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSAhPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIERhdGUgZmllbGQnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBwYXJzZXJSZXN1bHQgPSBVdGlscy5yZWxhdGl2ZVRpbWVUb0RhdGUocG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lKTtcbiAgICAgICAgICAgIGlmIChwYXJzZXJSZXN1bHQuc3RhdHVzID09PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgICAgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZShwYXJzZXJSZXN1bHQucmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoaWxlIHBhcnNpbmcgcmVsYXRpdmUgZGF0ZScsIHBhcnNlclJlc3VsdCk7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgYGJhZCAkcmVsYXRpdmVUaW1lICgke3Bvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZX0pIHZhbHVlLiAke3BhcnNlclJlc3VsdC5pbmZvfWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGAkJHtpbmRleCsrfTpuYW1lYDtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHZhbHVlcy5wdXNoKHBvc3RncmVzVmFsdWUpO1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAke2NvbnN0cmFpbnRGaWVsZE5hbWV9ICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCsrfWApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9PT0gcGF0dGVybnMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdGhpcyBxdWVyeSB0eXBlIHlldCAke0pTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG4gIHZhbHVlcyA9IHZhbHVlcy5tYXAodHJhbnNmb3JtVmFsdWUpO1xuICByZXR1cm4geyBwYXR0ZXJuOiBwYXR0ZXJucy5qb2luKCcgQU5EICcpLCB2YWx1ZXMsIHNvcnRzIH07XG59O1xuXG5leHBvcnQgY2xhc3MgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBpbXBsZW1lbnRzIFN0b3JhZ2VBZGFwdGVyIHtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG5cbiAgLy8gUHJpdmF0ZVxuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfY2xpZW50OiBhbnk7XG4gIF9vbmNoYW5nZTogYW55O1xuICBfcGdwOiBhbnk7XG4gIF9zdHJlYW06IGFueTtcbiAgX3V1aWQ6IGFueTtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBkYXRhYmFzZU9wdGlvbnMgPSB7fSB9OiBhbnkpIHtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgZGVsZXRlIGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcztcblxuICAgIGNvbnN0IHsgY2xpZW50LCBwZ3AgfSA9IGNyZWF0ZUNsaWVudCh1cmksIGRhdGFiYXNlT3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG4gICAgdGhpcy5fcGdwID0gcGdwO1xuICAgIHRoaXMuX3V1aWQgPSB1dWlkdjQoKTtcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSBmYWxzZTtcbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIC8vTm90ZSB0aGF0IGFuYWx5emU9dHJ1ZSB3aWxsIHJ1biB0aGUgcXVlcnksIGV4ZWN1dGluZyBJTlNFUlRTLCBERUxFVEVTLCBldGMuXG4gIGNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkocXVlcnk6IHN0cmluZywgYW5hbHl6ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgaWYgKGFuYWx5emUpIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoQU5BTFlaRSwgRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbS5kb25lKCk7XG4gICAgICBkZWxldGUgdGhpcy5fc3RyZWFtO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuX2NsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLl9jbGllbnQuJHBvb2wuZW5kKCk7XG4gIH1cblxuICBhc3luYyBfbGlzdGVuVG9TY2hlbWEoKSB7XG4gICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgdGhpcy5fc3RyZWFtID0gYXdhaXQgdGhpcy5fY2xpZW50LmNvbm5lY3QoeyBkaXJlY3Q6IHRydWUgfSk7XG4gICAgICB0aGlzLl9zdHJlYW0uY2xpZW50Lm9uKCdub3RpZmljYXRpb24nLCBkYXRhID0+IHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoZGF0YS5wYXlsb2FkKTtcbiAgICAgICAgaWYgKHBheWxvYWQuc2VuZGVySWQgIT09IHRoaXMuX3V1aWQpIHtcbiAgICAgICAgICB0aGlzLl9vbmNoYW5nZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuX3N0cmVhbS5ub25lKCdMSVNURU4gJDF+JywgJ3NjaGVtYS5jaGFuZ2UnKTtcbiAgICB9XG4gIH1cblxuICBfbm90aWZ5U2NoZW1hQ2hhbmdlKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbVxuICAgICAgICAubm9uZSgnTk9USUZZICQxfiwgJDInLCBbJ3NjaGVtYS5jaGFuZ2UnLCB7IHNlbmRlcklkOiB0aGlzLl91dWlkIH1dKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gTm90aWZ5OicsIGVycm9yKTsgLy8gdW5saWtlbHkgdG8gZXZlciBoYXBwZW5cbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGF3YWl0IGNvbm5cbiAgICAgIC5ub25lKFxuICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgXCJfU0NIRU1BXCIgKCBcImNsYXNzTmFtZVwiIHZhckNoYXIoMTIwKSwgXCJzY2hlbWFcIiBqc29uYiwgXCJpc1BhcnNlQ2xhc3NcIiBib29sLCBQUklNQVJZIEtFWSAoXCJjbGFzc05hbWVcIikgKSdcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm9uZShcbiAgICAgICdTRUxFQ1QgRVhJU1RTIChTRUxFQ1QgMSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMgV0hFUkUgdGFibGVfbmFtZSA9ICQxKScsXG4gICAgICBbbmFtZV0sXG4gICAgICBhID0+IGEuZXhpc3RzXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgQ0xQczogYW55KSB7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnRhc2soJ3NldC1jbGFzcy1sZXZlbC1wZXJtaXNzaW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdjbGFzc0xldmVsUGVybWlzc2lvbnMnLCBKU09OLnN0cmluZ2lmeShDTFBzKV07XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgIGBVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlc1xuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlZEluZGV4ZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGRlbGV0ZWRJbmRleGVzLnB1c2gobmFtZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywga2V5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDEnLFxuICAgICAgICBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2luZGV4ZXMnLCBKU09OLnN0cmluZ2lmeShleGlzdGluZ0luZGV4ZXMpXVxuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46ID9hbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcGFyc2VTY2hlbWEgPSBhd2FpdCBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLmNyZWF0ZVRhYmxlKGNsYXNzTmFtZSwgc2NoZW1hLCB0KTtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdJTlNFUlQgSU5UTyBcIl9TQ0hFTUFcIiAoXCJjbGFzc05hbWVcIiwgXCJzY2hlbWFcIiwgXCJpc1BhcnNlQ2xhc3NcIikgVkFMVUVTICgkPGNsYXNzTmFtZT4sICQ8c2NoZW1hPiwgdHJ1ZSknLFxuICAgICAgICAgIHsgY2xhc3NOYW1lLCBzY2hlbWEgfVxuICAgICAgICApO1xuICAgICAgICBhd2FpdCB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzLCB0KTtcbiAgICAgICAgcmV0dXJuIHRvUGFyc2VTY2hlbWEoc2NoZW1hKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiYgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJyk7XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBjb25zdCBwYXR0ZXJuc0FycmF5ID0gW107XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmFzc2lnbih7fSwgc2NoZW1hLmZpZWxkcyk7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9mYWlsZWRfbG9naW5fY291bnQgPSB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gICAgfVxuICAgIGxldCBpbmRleCA9IDI7XG4gICAgY29uc3QgcmVsYXRpb25zID0gW107XG4gICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShxcywgdmFsdWVzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgdGhlIGVycm9yLlxuICAgICAgfVxuICAgICAgYXdhaXQgdC50eCgnY3JlYXRlLXRhYmxlLXR4JywgdHggPT4ge1xuICAgICAgICByZXR1cm4gdHguYmF0Y2goXG4gICAgICAgICAgcmVsYXRpb25zLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJyk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgYXdhaXQgY29ubi50YXNrKCdzY2hlbWEtdXBncmFkZScsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgY29sdW1ucyA9IGF3YWl0IHQubWFwKFxuICAgICAgICAnU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgV0hFUkUgdGFibGVfbmFtZSA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgY2xhc3NOYW1lIH0sXG4gICAgICAgIGEgPT4gYS5jb2x1bW5fbmFtZVxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5ld0NvbHVtbnMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gY29sdW1ucy5pbmRleE9mKGl0ZW0pID09PSAtMSlcbiAgICAgICAgLm1hcChmaWVsZE5hbWUgPT4gc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycpO1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnYWRkLWZpZWxkLWlmLW5vdC1leGlzdHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmICh0eXBlLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgICAnQUxURVIgVEFCTEUgJDxjbGFzc05hbWU6bmFtZT4gQUREIENPTFVNTiBJRiBOT1QgRVhJU1RTICQ8ZmllbGROYW1lOm5hbWU+ICQ8cG9zdGdyZXNUeXBlOnJhdz4nLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgcG9zdGdyZXNUeXBlOiBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSh0eXBlKSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmNyZWF0ZUNsYXNzKGNsYXNzTmFtZSwgeyBmaWVsZHM6IHsgW2ZpZWxkTmFtZV06IHR5cGUgfSB9LCB0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDb2x1bW4gYWxyZWFkeSBleGlzdHMsIGNyZWF0ZWQgYnkgb3RoZXIgcmVxdWVzdC4gQ2Fycnkgb24gdG8gc2VlIGlmIGl0J3MgdGhlIHJpZ2h0IHR5cGUuXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0LmFueShcbiAgICAgICAgJ1NFTEVDVCBcInNjaGVtYVwiIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPiBhbmQgKFwic2NoZW1hXCI6Ompzb24tPlxcJ2ZpZWxkc1xcJy0+JDxmaWVsZE5hbWU+KSBpcyBub3QgbnVsbCcsXG4gICAgICAgIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdFswXSkge1xuICAgICAgICB0aHJvdyAnQXR0ZW1wdGVkIHRvIGFkZCBhIGZpZWxkIHRoYXQgYWxyZWFkeSBleGlzdHMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ3VwZGF0ZS1zY2hlbWEtZmllbGQtb3B0aW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChvcGVyYXRpb25zKSkpXG4gICAgICAudGhlbigoKSA9PiBjbGFzc05hbWUuaW5kZXhPZignX0pvaW46JykgIT0gMCk7IC8vIHJlc29sdmVzIHdpdGggZmFsc2Ugd2hlbiBfSm9pbiB0YWJsZVxuXG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG5cbiAgLy8gRGVsZXRlIGFsbCBkYXRhIGtub3duIHRvIHRoaXMgYWRhcHRlci4gVXNlZCBmb3IgdGVzdGluZy5cbiAgYXN5bmMgZGVsZXRlQWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBoZWxwZXJzID0gdGhpcy5fcGdwLmhlbHBlcnM7XG4gICAgZGVidWcoJ2RlbGV0ZUFsbENsYXNzZXMnKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnRhc2soJ2RlbGV0ZS1hbGwtY2xhc3NlcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0LmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicpO1xuICAgICAgICAgIGNvbnN0IGpvaW5zID0gcmVzdWx0cy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbGlzdC5jb25jYXQoam9pblRhYmxlc0ZvclNjaGVtYShzY2hlbWEuc2NoZW1hKSk7XG4gICAgICAgICAgfSwgW10pO1xuICAgICAgICAgIGNvbnN0IGNsYXNzZXMgPSBbXG4gICAgICAgICAgICAnX1NDSEVNQScsXG4gICAgICAgICAgICAnX1B1c2hTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTY2hlZHVsZScsXG4gICAgICAgICAgICAnX0hvb2tzJyxcbiAgICAgICAgICAgICdfR2xvYmFsQ29uZmlnJyxcbiAgICAgICAgICAgICdfR3JhcGhRTENvbmZpZycsXG4gICAgICAgICAgICAnX0F1ZGllbmNlJyxcbiAgICAgICAgICAgICdfSWRlbXBvdGVuY3knLFxuICAgICAgICAgICAgLi4ucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5jbGFzc05hbWUpLFxuICAgICAgICAgICAgLi4uam9pbnMsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdCBxdWVyaWVzID0gY2xhc3Nlcy5tYXAoY2xhc3NOYW1lID0+ICh7XG4gICAgICAgICAgICBxdWVyeTogJ0RST1AgVEFCTEUgSUYgRVhJU1RTICQ8Y2xhc3NOYW1lOm5hbWU+JyxcbiAgICAgICAgICAgIHZhbHVlczogeyBjbGFzc05hbWUgfSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgYXdhaXQgdC50eCh0eCA9PiB0eC5ub25lKGhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIE5vIF9TQ0hFTUEgY29sbGVjdGlvbi4gRG9uJ3QgZGVsZXRlIGFueXRoaW5nLlxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBkZWJ1ZyhgZGVsZXRlQWxsQ2xhc3NlcyBkb25lIGluICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBub3d9YCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGFzeW5jIGRlbGV0ZUZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGRlYnVnKCdkZWxldGVGaWVsZHMnKTtcbiAgICBmaWVsZE5hbWVzID0gZmllbGROYW1lcy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIGZpZWxkTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIGlmIChmaWVsZC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChmaWVsZE5hbWUpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBsaXN0O1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBmaWVsZE5hbWVzXG4gICAgICAubWFwKChuYW1lLCBpZHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAkJHtpZHggKyAyfTpuYW1lYDtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCBEUk9QIENPTFVNTicpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdkZWxldGUtZmllbGRzJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCB0Lm5vbmUoJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIiA9ICQ8c2NoZW1hPiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+Jywge1xuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHZhbHVlcy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShgQUxURVIgVEFCTEUgJDE6bmFtZSBEUk9QIENPTFVNTiBJRiBFWElTVFMgJHtjb2x1bW5zfWAsIHZhbHVlcyk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgYXN5bmMgZ2V0QWxsQ2xhc3NlcygpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LnRhc2soJ2dldC1hbGwtY2xhc3NlcycsIGFzeW5jIHQgPT4ge1xuICAgICAgcmV0dXJuIGF3YWl0IHQubWFwKCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJywgbnVsbCwgcm93ID0+XG4gICAgICAgIHRvUGFyc2VTY2hlbWEoeyBjbGFzc05hbWU6IHJvdy5jbGFzc05hbWUsIC4uLnJvdy5zY2hlbWEgfSlcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBhc3luYyBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdnZXRDbGFzcycpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRbMF0uc2NoZW1hO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHRvUGFyc2VTY2hlbWEpO1xuICB9XG5cbiAgLy8gVE9ETzogcmVtb3ZlIHRoZSBtb25nbyBmb3JtYXQgZGVwZW5kZW5jeSBpbiB0aGUgcmV0dXJuIHZhbHVlXG4gIGFzeW5jIGNyZWF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2NyZWF0ZU9iamVjdCcpO1xuICAgIGxldCBjb2x1bW5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBnZW9Qb2ludHMgPSB7fTtcblxuICAgIG9iamVjdCA9IGhhbmRsZURvdEZpZWxkcyhvYmplY3QpO1xuXG4gICAgdmFsaWRhdGVLZXlzKG9iamVjdCk7XG5cbiAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddID0gb2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZmllbGROYW1lID0gJ2F1dGhEYXRhJztcbiAgICAgIH1cblxuICAgICAgY29sdW1uc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZmFpbGVkX2xvZ2luX2NvdW50JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9oaXN0b3J5J1xuICAgICAgICApIHtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0J1xuICAgICAgICApIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3dpdGNoIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSkge1xuICAgICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ub2JqZWN0SWQpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJheSc6XG4gICAgICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShvYmplY3RbZmllbGROYW1lXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgICBjYXNlICdOdW1iZXInOlxuICAgICAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5uYW1lKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9seWdvbic6IHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwob2JqZWN0W2ZpZWxkTmFtZV0uY29vcmRpbmF0ZXMpO1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgICAvLyBwb3AgdGhlIHBvaW50IGFuZCBwcm9jZXNzIGxhdGVyXG4gICAgICAgICAgZ2VvUG9pbnRzW2ZpZWxkTmFtZV0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgICBjb2x1bW5zQXJyYXkucG9wKCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgYFR5cGUgJHtzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZX0gbm90IHN1cHBvcnRlZCB5ZXRgO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29sdW1uc0FycmF5ID0gY29sdW1uc0FycmF5LmNvbmNhdChPYmplY3Qua2V5cyhnZW9Qb2ludHMpKTtcbiAgICBjb25zdCBpbml0aWFsVmFsdWVzID0gdmFsdWVzQXJyYXkubWFwKCh2YWwsIGluZGV4KSA9PiB7XG4gICAgICBsZXQgdGVybWluYXRpb24gPSAnJztcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGNvbHVtbnNBcnJheVtpbmRleF07XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjp0ZXh0W10nO1xuICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgdGVybWluYXRpb24gPSAnOjpqc29uYic7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCQke2luZGV4ICsgMiArIGNvbHVtbnNBcnJheS5sZW5ndGh9JHt0ZXJtaW5hdGlvbn1gO1xuICAgIH0pO1xuICAgIGNvbnN0IGdlb1BvaW50c0luamVjdHMgPSBPYmplY3Qua2V5cyhnZW9Qb2ludHMpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBnZW9Qb2ludHNba2V5XTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2godmFsdWUubG9uZ2l0dWRlLCB2YWx1ZS5sYXRpdHVkZSk7XG4gICAgICBjb25zdCBsID0gdmFsdWVzQXJyYXkubGVuZ3RoICsgY29sdW1uc0FycmF5Lmxlbmd0aDtcbiAgICAgIHJldHVybiBgUE9JTlQoJCR7bH0sICQke2wgKyAxfSlgO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sdW1uc1BhdHRlcm4gPSBjb2x1bW5zQXJyYXkubWFwKChjb2wsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAyfTpuYW1lYCkuam9pbigpO1xuICAgIGNvbnN0IHZhbHVlc1BhdHRlcm4gPSBpbml0aWFsVmFsdWVzLmNvbmNhdChnZW9Qb2ludHNJbmplY3RzKS5qb2luKCk7XG5cbiAgICBjb25zdCBxcyA9IGBJTlNFUlQgSU5UTyAkMTpuYW1lICgke2NvbHVtbnNQYXR0ZXJufSkgVkFMVUVTICgke3ZhbHVlc1BhdHRlcm59KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uY29sdW1uc0FycmF5LCAuLi52YWx1ZXNBcnJheV07XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAubm9uZShxcywgdmFsdWVzKVxuICAgICAgLnRoZW4oKCkgPT4gKHsgb3BzOiBbb2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IuY29uc3RyYWludCkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLmNvbnN0cmFpbnQubWF0Y2goL3VuaXF1ZV8oW2EtekEtWl0rKS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgZXJyb3IgPSBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBhc3luYyBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnZGVsZXRlT2JqZWN0c0J5UXVlcnknKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCBpbmRleCA9IDI7XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgaWYgKE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDApIHtcbiAgICAgIHdoZXJlLnBhdHRlcm4gPSAnVFJVRSc7XG4gICAgfVxuICAgIGNvbnN0IHFzID0gYFdJVEggZGVsZXRlZCBBUyAoREVMRVRFIEZST00gJDE6bmFtZSBXSEVSRSAke3doZXJlLnBhdHRlcm59IFJFVFVSTklORyAqKSBTRUxFQ1QgY291bnQoKikgRlJPTSBkZWxldGVkYDtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudClcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiArYS5jb3VudClcbiAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBjb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBEb24ndCBkZWxldGUgYW55dGhpbmcgaWYgZG9lc24ndCBleGlzdFxuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuICAvLyBSZXR1cm4gdmFsdWUgbm90IGN1cnJlbnRseSB3ZWxsIHNwZWNpZmllZC5cbiAgYXN5bmMgZmluZE9uZUFuZFVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGRlYnVnKCdmaW5kT25lQW5kVXBkYXRlJyk7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB1cGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKS50aGVuKFxuICAgICAgdmFsID0+IHZhbFswXVxuICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICBhc3luYyB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApOiBQcm9taXNlPFthbnldPiB7XG4gICAgZGVidWcoJ3VwZGF0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaXJzdF0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB1cGRhdGUgPSBoYW5kbGVEb3RGaWVsZHModXBkYXRlKTtcbiAgICAvLyBSZXNvbHZlIGF1dGhEYXRhIGZpcnN0LFxuICAgIC8vIFNvIHdlIGRvbid0IGVuZCB1cCB3aXRoIG11bHRpcGxlIGtleSB1cGRhdGVzXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXSA9IHVwZGF0ZVsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgZmllbGRWYWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgLy8gRHJvcCBhbnkgdW5kZWZpbmVkIHZhbHVlcy5cbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT0gJ2F1dGhEYXRhJykge1xuICAgICAgICAvLyBUaGlzIHJlY3Vyc2l2ZWx5IHNldHMgdGhlIGpzb25fb2JqZWN0XG4gICAgICAgIC8vIE9ubHkgMSBsZXZlbCBkZWVwXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlID0gKGpzb25iOiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBqc29uX29iamVjdF9zZXRfa2V5KENPQUxFU0NFKCR7anNvbmJ9LCAne30nOjpqc29uYiksICR7a2V5fSwgJHt2YWx1ZX0pOjpqc29uYmA7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGxhc3RLZXkgPSBgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICBjb25zdCBmaWVsZE5hbWVJbmRleCA9IGluZGV4O1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5yZWR1Y2UoKGxhc3RLZXk6IHN0cmluZywga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICBjb25zdCBzdHIgPSBnZW5lcmF0ZShsYXN0S2V5LCBgJCR7aW5kZXh9Ojp0ZXh0YCwgYCQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICBsZXQgdmFsdWUgPSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbHVlcy5wdXNoKGtleSwgdmFsdWUpO1xuICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgIH0sIGxhc3RLZXkpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtmaWVsZE5hbWVJbmRleH06bmFtZSA9ICR7dXBkYXRlfWApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsIDApICsgJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuYW1vdW50KTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZChDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtpbmRleCArIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgbnVsbCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ1JlbW92ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9yZW1vdmUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZFVuaXF1ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGRfdW5pcXVlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIC8vVE9ETzogc3RvcCBzcGVjaWFsIGNhc2luZyB0aGlzLiBJdCBzaG91bGQgY2hlY2sgZm9yIF9fdHlwZSA9PT0gJ0RhdGUnIGFuZCB1c2UgLmlzb1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICkge1xuICAgICAgICAvLyBHYXRoZXIga2V5cyB0byBpbmNyZW1lbnRcbiAgICAgICAgY29uc3Qga2V5c1RvSW5jcmVtZW50ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgT2JqZWN0LmtleXMgaXMgaXRlcmF0aW5nIG92ZXIgdGhlICoqb3JpZ2luYWwqKiB1cGRhdGUgb2JqZWN0XG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBzb21lIG9mIHRoZSBrZXlzIG9mIHRoZSBvcmlnaW5hbCB1cGRhdGUgY291bGQgYmUgbnVsbCBvciB1bmRlZmluZWQ6XG4gICAgICAgICAgICAvLyAoU2VlIHRoZSBhYm92ZSBjaGVjayBgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIGZpZWxkVmFsdWUgPT0gXCJ1bmRlZmluZWRcIilgKVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgaWYgKGtleXNUb0luY3JlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaW5jcmVtZW50UGF0dGVybnMgPVxuICAgICAgICAgICAgJyB8fCAnICtcbiAgICAgICAgICAgIGtleXNUb0luY3JlbWVudFxuICAgICAgICAgICAgICAubWFwKGMgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGZpZWxkVmFsdWVbY10uYW1vdW50O1xuICAgICAgICAgICAgICAgIHJldHVybiBgQ09OQ0FUKCd7XCIke2N9XCI6JywgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUtPj4nJHtjfScsJzAnKTo6aW50ICsgJHthbW91bnR9LCAnfScpOjpqc29uYmA7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5qb2luKCcgfHwgJyk7XG4gICAgICAgICAgLy8gU3RyaXAgdGhlIGtleXNcbiAgICAgICAgICBrZXlzVG9JbmNyZW1lbnQuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgZGVsZXRlIGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleXNUb0RlbGV0ZTogQXJyYXk8c3RyaW5nPiA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldC5cbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnRGVsZXRlJyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgY29uc3QgZGVsZXRlUGF0dGVybnMgPSBrZXlzVG9EZWxldGUucmVkdWNlKChwOiBzdHJpbmcsIGM6IHN0cmluZywgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHAgKyBgIC0gJyQke2luZGV4ICsgMSArIGl9OnZhbHVlJ2A7XG4gICAgICAgIH0sICcnKTtcbiAgICAgICAgLy8gT3ZlcnJpZGUgT2JqZWN0XG4gICAgICAgIGxldCB1cGRhdGVPYmplY3QgPSBcIid7fSc6Ompzb25iXCI7XG5cbiAgICAgICAgaWYgKGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgLy8gTWVyZ2UgT2JqZWN0XG4gICAgICAgICAgdXBkYXRlT2JqZWN0ID0gYENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAne30nOjpqc29uYilgO1xuICAgICAgICB9XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gKCR7dXBkYXRlT2JqZWN0fSAke2RlbGV0ZVBhdHRlcm5zfSAke2luY3JlbWVudFBhdHRlcm5zfSB8fCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMSArIGtleXNUb0RlbGV0ZS5sZW5ndGhcbiAgICAgICAgICB9Ojpqc29uYiApYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIC4uLmtleXNUb0RlbGV0ZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyICsga2V5c1RvRGVsZXRlLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZSkgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKTtcbiAgICAgICAgaWYgKGV4cGVjdGVkVHlwZSA9PT0gJ3RleHRbXScpIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnRleHRbXWApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWcoJ05vdCBzdXBwb3J0ZWQgdXBkYXRlJywgeyBmaWVsZE5hbWUsIGZpZWxkVmFsdWUgfSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgcXMgPSBgVVBEQVRFICQxOm5hbWUgU0VUICR7dXBkYXRlUGF0dGVybnMuam9pbigpfSAke3doZXJlQ2xhdXNlfSBSRVRVUk5JTkcgKmA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpLmFueShxcywgdmFsdWVzKTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5LCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCd1cHNlcnRPbmVPYmplY3QnKTtcbiAgICBjb25zdCBjcmVhdGVWYWx1ZSA9IE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZU9iamVjdChjbGFzc05hbWUsIHNjaGVtYSwgY3JlYXRlVmFsdWUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAvLyBpZ25vcmUgZHVwbGljYXRlIHZhbHVlIGVycm9ycyBhcyBpdCdzIHVwc2VydFxuICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLmZpbmRPbmVBbmRVcGRhdGUoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB1cGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgY2FzZUluc2Vuc2l0aXZlLCBleHBsYWluIH06IFF1ZXJ5T3B0aW9uc1xuICApIHtcbiAgICBkZWJ1ZygnZmluZCcpO1xuICAgIGNvbnN0IGhhc0xpbWl0ID0gbGltaXQgIT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBoYXNTa2lwID0gc2tpcCAhPT0gdW5kZWZpbmVkO1xuICAgIGxldCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgbGltaXRQYXR0ZXJuID0gaGFzTGltaXQgPyBgTElNSVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNMaW1pdCkge1xuICAgICAgdmFsdWVzLnB1c2gobGltaXQpO1xuICAgIH1cbiAgICBjb25zdCBza2lwUGF0dGVybiA9IGhhc1NraXAgPyBgT0ZGU0VUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzU2tpcCkge1xuICAgICAgdmFsdWVzLnB1c2goc2tpcCk7XG4gICAgfVxuXG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgaWYgKHNvcnQpIHtcbiAgICAgIGNvbnN0IHNvcnRDb3B5OiBhbnkgPSBzb3J0O1xuICAgICAgY29uc3Qgc29ydGluZyA9IE9iamVjdC5rZXlzKHNvcnQpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1LZXkgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhrZXkpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgLy8gVXNpbmcgJGlkeCBwYXR0ZXJuIGdpdmVzOiAgbm9uLWludGVnZXIgY29uc3RhbnQgaW4gT1JERVIgQllcbiAgICAgICAgICBpZiAoc29ydENvcHlba2V5XSA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gQVNDYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gREVTQ2A7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBPYmplY3Qua2V5cyhzb3J0KS5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgfVxuICAgIGlmICh3aGVyZS5zb3J0cyAmJiBPYmplY3Qua2V5cygod2hlcmUuc29ydHM6IGFueSkpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNvcnRQYXR0ZXJuID0gYE9SREVSIEJZICR7d2hlcmUuc29ydHMuam9pbigpfWA7XG4gICAgfVxuXG4gICAgbGV0IGNvbHVtbnMgPSAnKic7XG4gICAgaWYgKGtleXMpIHtcbiAgICAgIC8vIEV4Y2x1ZGUgZW1wdHkga2V5c1xuICAgICAgLy8gUmVwbGFjZSBBQ0wgYnkgaXQncyBrZXlzXG4gICAgICBrZXlzID0ga2V5cy5yZWR1Y2UoKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3JwZXJtJyk7XG4gICAgICAgICAgbWVtby5wdXNoKCdfd3Blcm0nKTtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBrZXkubGVuZ3RoID4gMCAmJlxuICAgICAgICAgIC8vIFJlbW92ZSBzZWxlY3RlZCBmaWVsZCBub3QgcmVmZXJlbmNlZCBpbiB0aGUgc2NoZW1hXG4gICAgICAgICAgLy8gUmVsYXRpb24gaXMgbm90IGEgY29sdW1uIGluIHBvc3RncmVzXG4gICAgICAgICAgLy8gJHNjb3JlIGlzIGEgUGFyc2Ugc3BlY2lhbCBmaWVsZCBhbmQgaXMgYWxzbyBub3QgYSBjb2x1bW5cbiAgICAgICAgICAoKHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSAhPT0gJ1JlbGF0aW9uJykgfHwga2V5ID09PSAnJHNjb3JlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgbWVtby5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LCBbXSk7XG4gICAgICBjb2x1bW5zID0ga2V5c1xuICAgICAgICAubWFwKChrZXksIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHJldHVybiBgdHNfcmFua19jZCh0b190c3ZlY3RvcigkJHsyfSwgJCR7M306bmFtZSksIHRvX3RzcXVlcnkoJCR7NH0sICQkezV9KSwgMzIpIGFzIHNjb3JlYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAkJHtpbmRleCArIHZhbHVlcy5sZW5ndGggKyAxfTpuYW1lYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHZhbHVlcyA9IHZhbHVlcy5jb25jYXQoa2V5cyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBRdWVyeSBvbiBub24gZXhpc3RpbmcgdGFibGUsIGRvbid0IGNyYXNoXG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW107XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIENvbnZlcnRzIGZyb20gYSBwb3N0Z3Jlcy1mb3JtYXQgb2JqZWN0IHRvIGEgUkVTVC1mb3JtYXQgb2JqZWN0LlxuICAvLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuICBwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBzY2hlbWE6IGFueSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInICYmIG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgIGxhdGl0dWRlOiBvYmplY3RbZmllbGROYW1lXS55LFxuICAgICAgICAgIGxvbmdpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueCxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGxldCBjb29yZHMgPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLnN1YnN0cigyLCBjb29yZHMubGVuZ3RoIC0gNCkuc3BsaXQoJyksKCcpO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICByZXR1cm4gW3BhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVsxXSksIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSldO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IGNvb3JkcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgICAgIG5hbWU6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vVE9ETzogcmVtb3ZlIHRoaXMgcmVsaWFuY2Ugb24gdGhlIG1vbmdvIGZvcm1hdC4gREIgYWRhcHRlciBzaG91bGRuJ3Qga25vdyB0aGVyZSBpcyBhIGRpZmZlcmVuY2UgYmV0d2VlbiBjcmVhdGVkIGF0IGFuZCBhbnkgb3RoZXIgZGF0ZSBmaWVsZC5cbiAgICBpZiAob2JqZWN0LmNyZWF0ZWRBdCkge1xuICAgICAgb2JqZWN0LmNyZWF0ZWRBdCA9IG9iamVjdC5jcmVhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC51cGRhdGVkQXQpIHtcbiAgICAgIG9iamVjdC51cGRhdGVkQXQgPSBvYmplY3QudXBkYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QuZXhwaXJlc0F0KSB7XG4gICAgICBvYmplY3QuZXhwaXJlc0F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuZXhwaXJlc0F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0KSB7XG4gICAgICBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICAgIGlzbzogb2JqZWN0W2ZpZWxkTmFtZV0udG9JU09TdHJpbmcoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBhc3luYyBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgY29uc3RyYWludE5hbWUgPSBgJHtjbGFzc05hbWV9X3VuaXF1ZV8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFVOSVFVRSBJTkRFWCBJRiBOT1QgRVhJU1RTICQyOm5hbWUgT04gJDE6bmFtZSgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKHFzLCBbY2xhc3NOYW1lLCBjb25zdHJhaW50TmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSkpIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIENhc3QgdGhlIGVycm9yIGludG8gdGhlIHByb3BlciBwYXJzZSBlcnJvclxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBhc3luYyBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZT86IHN0cmluZyxcbiAgICBlc3RpbWF0ZT86IGJvb2xlYW4gPSB0cnVlXG4gICkge1xuICAgIGRlYnVnKCdjb3VudCcpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgbGV0IHFzID0gJyc7XG5cbiAgICBpZiAod2hlcmUucGF0dGVybi5sZW5ndGggPiAwIHx8ICFlc3RpbWF0ZSkge1xuICAgICAgcXMgPSBgU0VMRUNUIGNvdW50KCopIEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH0gZWxzZSB7XG4gICAgICBxcyA9ICdTRUxFQ1QgcmVsdHVwbGVzIEFTIGFwcHJveGltYXRlX3Jvd19jb3VudCBGUk9NIHBnX2NsYXNzIFdIRVJFIHJlbG5hbWUgPSAkMSc7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+IHtcbiAgICAgICAgaWYgKGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IG51bGwgfHwgYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgPT0gLTEpIHtcbiAgICAgICAgICByZXR1cm4gIWlzTmFOKCthLmNvdW50KSA/ICthLmNvdW50IDogMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gK2EuYXBwcm94aW1hdGVfcm93X2NvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdkaXN0aW5jdCcpO1xuICAgIGxldCBmaWVsZCA9IGZpZWxkTmFtZTtcbiAgICBsZXQgY29sdW1uID0gZmllbGROYW1lO1xuICAgIGNvbnN0IGlzTmVzdGVkID0gZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgZmllbGQgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICBjb2x1bW4gPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbiAgICB9XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcic7XG4gICAgY29uc3QgdmFsdWVzID0gW2ZpZWxkLCBjb2x1bW4sIGNsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoIWlzTmVzdGVkKSB7XG4gICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKG9iamVjdCA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgIGlmICghaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtmaWVsZF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGRdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZCA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzFdO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IG9iamVjdFtjb2x1bW5dW2NoaWxkXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpXG4gICAgICApO1xuICB9XG5cbiAgYXN5bmMgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIGRlYnVnKCdhZ2dyZWdhdGUnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IDI7XG4gICAgbGV0IGNvbHVtbnM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNvdW50RmllbGQgPSBudWxsO1xuICAgIGxldCBncm91cFZhbHVlcyA9IG51bGw7XG4gICAgbGV0IHdoZXJlUGF0dGVybiA9ICcnO1xuICAgIGxldCBsaW1pdFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc2tpcFBhdHRlcm4gPSAnJztcbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBsZXQgZ3JvdXBQYXR0ZXJuID0gJyc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwaXBlbGluZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3Qgc3RhZ2UgPSBwaXBlbGluZVtpXTtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRncm91cFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTIFwib2JqZWN0SWRcImApO1xuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICBncm91cFZhbHVlcyA9IHZhbHVlO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBCeUZpZWxkcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBhbGlhcyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlW2FsaWFzXSA9PT0gJ3N0cmluZycgJiYgdmFsdWVbYWxpYXNdKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdKTtcbiAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRpb24gPSBPYmplY3Qua2V5cyh2YWx1ZVthbGlhc10pWzBdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXVtvcGVyYXRpb25dKTtcbiAgICAgICAgICAgICAgICBpZiAobW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl0pIHtcbiAgICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICBgRVhUUkFDVCgke1xuICAgICAgICAgICAgICAgICAgICAgIG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dXG4gICAgICAgICAgICAgICAgICAgIH0gRlJPTSAkJHtpbmRleH06bmFtZSBBVCBUSU1FIFpPTkUgJ1VUQycpOjppbnRlZ2VyIEFTICQke2luZGV4ICsgMX06bmFtZWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc3RhZ2UuJG1hdGNoLCAnJG9yJylcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB0b1Bvc3RncmVzVmFsdWUodmFsdWVbY21wXSkpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGlmIChtYXRjaFBhdHRlcm5zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgke21hdGNoUGF0dGVybnMuam9pbignIEFORCAnKX0pYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIG1hdGNoUGF0dGVybnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB3aGVyZVBhdHRlcm4gPSBwYXR0ZXJucy5sZW5ndGggPiAwID8gYFdIRVJFICR7cGF0dGVybnMuam9pbihgICR7b3JPckFuZH0gYCl9YCA6ICcnO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRsaW1pdCkge1xuICAgICAgICBsaW1pdFBhdHRlcm4gPSBgTElNSVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJGxpbWl0KTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc2tpcCkge1xuICAgICAgICBza2lwUGF0dGVybiA9IGBPRkZTRVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJHNraXApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRzb3J0KSB7XG4gICAgICAgIGNvbnN0IHNvcnQgPSBzdGFnZS4kc29ydDtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHNvcnQpO1xuICAgICAgICBjb25zdCBzb3J0aW5nID0ga2V5c1xuICAgICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gc29ydFtrZXldID09PSAxID8gJ0FTQycgOiAnREVTQyc7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IGAkJHtpbmRleH06bmFtZSAke3RyYW5zZm9ybWVyfWA7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgcmV0dXJuIG9yZGVyO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmpvaW4oKTtcbiAgICAgICAgdmFsdWVzLnB1c2goLi4ua2V5cyk7XG4gICAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChncm91cFBhdHRlcm4pIHtcbiAgICAgIGNvbHVtbnMuZm9yRWFjaCgoZSwgaSwgYSkgPT4ge1xuICAgICAgICBpZiAoZSAmJiBlLnRyaW0oKSA9PT0gJyonKSB7XG4gICAgICAgICAgYVtpXSA9ICcnO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnNcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5qb2luKCl9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtza2lwUGF0dGVybn0gJHtncm91cFBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgdmFsdWVzKS50aGVuKGEgPT4ge1xuICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHRzID0gYS5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSB7fTtcbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBncm91cFZhbHVlcykge1xuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHRba2V5XTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvdW50RmllbGQpIHtcbiAgICAgICAgICByZXN1bHRbY291bnRGaWVsZF0gPSBwYXJzZUludChyZXN1bHRbY291bnRGaWVsZF0sIDEwKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBhd2FpdCB0aGlzLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKCk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlVGFibGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5zY2hlbWFVcGdyYWRlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSkpO1xuICAgIH0pO1xuICAgIHByb21pc2VzLnB1c2godGhpcy5fbGlzdGVuVG9TY2hlbWEoKSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50LnR4KCdwZXJmb3JtLWluaXRpYWxpemF0aW9uJywgYXN5bmMgdCA9PiB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmFkZCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGRVbmlxdWUpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zQWxsUmVnZXgpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpO1xuICAgICAgICAgIHJldHVybiB0LmN0eDtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY3R4ID0+IHtcbiAgICAgICAgZGVidWcoYGluaXRpYWxpemF0aW9uRG9uZSBpbiAke2N0eC5kdXJhdGlvbn1gKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46ID9hbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKGkgPT4gKHtcbiAgICAgIHF1ZXJ5OiAnRFJPUCBJTkRFWCAkMTpuYW1lJyxcbiAgICAgIHZhbHVlczogaSxcbiAgICB9KSk7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgfVxuXG4gIGFzeW5jIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxcyA9ICdTRUxFQ1QgKiBGUk9NIHBnX2luZGV4ZXMgV0hFUkUgdGFibGVuYW1lID0gJHtjbGFzc05hbWV9JztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgeyBjbGFzc05hbWUgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBVc2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gIGFzeW5jIHVwZGF0ZUVzdGltYXRlZENvdW50KGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKCdBTkFMWVpFICQxOm5hbWUnLCBbY2xhc3NOYW1lXSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZXNzaW9uID0ge307XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQgPSB0aGlzLl9jbGllbnQudHgodCA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgIH0pO1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCA9IFtdO1xuICAgICAgICByZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2U7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgZGVmYXVsdEluZGV4TmFtZSA9IGBwYXJzZV9kZWZhdWx0XyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID1cbiAgICAgIGluZGV4TmFtZSAhPSBudWxsID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHsgbmFtZTogZGVmYXVsdEluZGV4TmFtZSB9O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYGxvd2VyKCQke2luZGV4ICsgM306bmFtZSkgdmFyY2hhcl9wYXR0ZXJuX29wc2ApXG4gICAgICA6IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgY29uc3Qgc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9XG4gICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA6IGZhbHNlO1xuICAgIGlmIChzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uKSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucyk7XG4gICAgfVxuICAgIGF3YWl0IGNvbm4ubm9uZShxcywgW2luZGV4TmFtZU9wdGlvbnMubmFtZSwgY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbihvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBxcyA9ICdEUk9QIEZVTkNUSU9OIElGIEVYSVNUUyBpZGVtcG90ZW5jeV9kZWxldGVfZXhwaXJlZF9yZWNvcmRzKCknO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyhvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCB0dGxPcHRpb25zID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IGAke29wdGlvbnMudHRsfSBzZWNvbmRzYCA6ICc2MCBzZWNvbmRzJztcbiAgICBjb25zdCBxcyA9XG4gICAgICAnQ1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpIFJFVFVSTlMgdm9pZCBMQU5HVUFHRSBwbHBnc3FsIEFTICQkIEJFR0lOIERFTEVURSBGUk9NIFwiX0lkZW1wb3RlbmN5XCIgV0hFUkUgZXhwaXJlIDwgTk9XKCkgLSBJTlRFUlZBTCAkMTsgRU5EOyAkJDsnO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMsIFt0dGxPcHRpb25zXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIHVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gZG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gZXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHJlbW92ZSBhbGwgaW5zdGFuY2VzIG9mIFxcUSBhbmQgXFxFIGZyb20gdGhlIHJlbWFpbmluZyB0ZXh0ICYgZXNjYXBlIHNpbmdsZSBxdW90ZXNcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLnJlcGxhY2UoLyhbXiddKScvLCBgJDEnJ2ApXG4gICAgLnJlcGxhY2UoL14nKFteJ10pLywgYCcnJDFgKTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsSUFBQUEsZUFBQSxHQUFBQyxPQUFBO0FBRUEsSUFBQUMsS0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUcsT0FBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUksS0FBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssSUFBQSxHQUFBSCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU0sZUFBQSxHQUFBTixPQUFBO0FBQW1ELFNBQUFFLHVCQUFBSyxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBQUEsU0FBQUcsUUFBQUMsTUFBQSxFQUFBQyxjQUFBLFFBQUFDLElBQUEsR0FBQUMsTUFBQSxDQUFBRCxJQUFBLENBQUFGLE1BQUEsT0FBQUcsTUFBQSxDQUFBQyxxQkFBQSxRQUFBQyxPQUFBLEdBQUFGLE1BQUEsQ0FBQUMscUJBQUEsQ0FBQUosTUFBQSxHQUFBQyxjQUFBLEtBQUFJLE9BQUEsR0FBQUEsT0FBQSxDQUFBQyxNQUFBLFdBQUFDLEdBQUEsV0FBQUosTUFBQSxDQUFBSyx3QkFBQSxDQUFBUixNQUFBLEVBQUFPLEdBQUEsRUFBQUUsVUFBQSxPQUFBUCxJQUFBLENBQUFRLElBQUEsQ0FBQUMsS0FBQSxDQUFBVCxJQUFBLEVBQUFHLE9BQUEsWUFBQUgsSUFBQTtBQUFBLFNBQUFVLGNBQUFDLE1BQUEsYUFBQUMsQ0FBQSxNQUFBQSxDQUFBLEdBQUFDLFNBQUEsQ0FBQUMsTUFBQSxFQUFBRixDQUFBLFVBQUFHLE1BQUEsV0FBQUYsU0FBQSxDQUFBRCxDQUFBLElBQUFDLFNBQUEsQ0FBQUQsQ0FBQSxRQUFBQSxDQUFBLE9BQUFmLE9BQUEsQ0FBQUksTUFBQSxDQUFBYyxNQUFBLE9BQUFDLE9BQUEsV0FBQUMsR0FBQSxJQUFBQyxlQUFBLENBQUFQLE1BQUEsRUFBQU0sR0FBQSxFQUFBRixNQUFBLENBQUFFLEdBQUEsU0FBQWhCLE1BQUEsQ0FBQWtCLHlCQUFBLEdBQUFsQixNQUFBLENBQUFtQixnQkFBQSxDQUFBVCxNQUFBLEVBQUFWLE1BQUEsQ0FBQWtCLHlCQUFBLENBQUFKLE1BQUEsS0FBQWxCLE9BQUEsQ0FBQUksTUFBQSxDQUFBYyxNQUFBLEdBQUFDLE9BQUEsV0FBQUMsR0FBQSxJQUFBaEIsTUFBQSxDQUFBb0IsY0FBQSxDQUFBVixNQUFBLEVBQUFNLEdBQUEsRUFBQWhCLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQVMsTUFBQSxFQUFBRSxHQUFBLGlCQUFBTixNQUFBO0FBQUEsU0FBQU8sZ0JBQUF4QixHQUFBLEVBQUF1QixHQUFBLEVBQUFLLEtBQUEsSUFBQUwsR0FBQSxHQUFBTSxjQUFBLENBQUFOLEdBQUEsT0FBQUEsR0FBQSxJQUFBdkIsR0FBQSxJQUFBTyxNQUFBLENBQUFvQixjQUFBLENBQUEzQixHQUFBLEVBQUF1QixHQUFBLElBQUFLLEtBQUEsRUFBQUEsS0FBQSxFQUFBZixVQUFBLFFBQUFpQixZQUFBLFFBQUFDLFFBQUEsb0JBQUEvQixHQUFBLENBQUF1QixHQUFBLElBQUFLLEtBQUEsV0FBQTVCLEdBQUE7QUFBQSxTQUFBNkIsZUFBQUcsR0FBQSxRQUFBVCxHQUFBLEdBQUFVLFlBQUEsQ0FBQUQsR0FBQSwyQkFBQVQsR0FBQSxnQkFBQUEsR0FBQSxHQUFBVyxNQUFBLENBQUFYLEdBQUE7QUFBQSxTQUFBVSxhQUFBRSxLQUFBLEVBQUFDLElBQUEsZUFBQUQsS0FBQSxpQkFBQUEsS0FBQSxrQkFBQUEsS0FBQSxNQUFBRSxJQUFBLEdBQUFGLEtBQUEsQ0FBQUcsTUFBQSxDQUFBQyxXQUFBLE9BQUFGLElBQUEsS0FBQUcsU0FBQSxRQUFBQyxHQUFBLEdBQUFKLElBQUEsQ0FBQUssSUFBQSxDQUFBUCxLQUFBLEVBQUFDLElBQUEsMkJBQUFLLEdBQUEsc0JBQUFBLEdBQUEsWUFBQUUsU0FBQSw0REFBQVAsSUFBQSxnQkFBQUYsTUFBQSxHQUFBVSxNQUFBLEVBQUFULEtBQUEsS0FQbkQ7QUFFQTtBQUVBO0FBS0EsTUFBTVUsS0FBSyxHQUFHcEQsT0FBTyxDQUFDLGdCQUFnQixDQUFDO0FBRXZDLE1BQU1xRCxpQ0FBaUMsR0FBRyxPQUFPO0FBQ2pELE1BQU1DLDhCQUE4QixHQUFHLE9BQU87QUFDOUMsTUFBTUMsNEJBQTRCLEdBQUcsT0FBTztBQUM1QyxNQUFNQywwQkFBMEIsR0FBRyxPQUFPO0FBQzFDLE1BQU1DLGlDQUFpQyxHQUFHLE9BQU87QUFDakQsTUFBTUMsTUFBTSxHQUFHMUQsT0FBTyxDQUFDLGlCQUFpQixDQUFDO0FBRXpDLE1BQU0yRCxLQUFLLEdBQUcsU0FBQUEsQ0FBVSxHQUFHQyxJQUFTLEVBQUU7RUFDcENBLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBR2xDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDbUMsTUFBTSxDQUFDRCxJQUFJLENBQUNFLEtBQUssQ0FBQyxDQUFDLEVBQUVGLElBQUksQ0FBQ2pDLE1BQU0sQ0FBQyxDQUFDO0VBQ2pFLE1BQU1vQyxHQUFHLEdBQUdMLE1BQU0sQ0FBQ00sU0FBUyxFQUFFO0VBQzlCRCxHQUFHLENBQUNKLEtBQUssQ0FBQ3JDLEtBQUssQ0FBQ3lDLEdBQUcsRUFBRUgsSUFBSSxDQUFDO0FBQzVCLENBQUM7QUFFRCxNQUFNSyx1QkFBdUIsR0FBR0MsSUFBSSxJQUFJO0VBQ3RDLFFBQVFBLElBQUksQ0FBQ0EsSUFBSTtJQUNmLEtBQUssUUFBUTtNQUNYLE9BQU8sTUFBTTtJQUNmLEtBQUssTUFBTTtNQUNULE9BQU8sMEJBQTBCO0lBQ25DLEtBQUssUUFBUTtNQUNYLE9BQU8sT0FBTztJQUNoQixLQUFLLE1BQU07TUFDVCxPQUFPLE1BQU07SUFDZixLQUFLLFNBQVM7TUFDWixPQUFPLFNBQVM7SUFDbEIsS0FBSyxTQUFTO01BQ1osT0FBTyxNQUFNO0lBQ2YsS0FBSyxRQUFRO01BQ1gsT0FBTyxrQkFBa0I7SUFDM0IsS0FBSyxVQUFVO01BQ2IsT0FBTyxPQUFPO0lBQ2hCLEtBQUssT0FBTztNQUNWLE9BQU8sT0FBTztJQUNoQixLQUFLLFNBQVM7TUFDWixPQUFPLFNBQVM7SUFDbEIsS0FBSyxPQUFPO01BQ1YsSUFBSUEsSUFBSSxDQUFDQyxRQUFRLElBQUlELElBQUksQ0FBQ0MsUUFBUSxDQUFDRCxJQUFJLEtBQUssUUFBUSxFQUFFO1FBQ3BELE9BQU8sUUFBUTtNQUNqQixDQUFDLE1BQU07UUFDTCxPQUFPLE9BQU87TUFDaEI7SUFDRjtNQUNFLE1BQU8sZUFBY0UsSUFBSSxDQUFDQyxTQUFTLENBQUNILElBQUksQ0FBRSxNQUFLO0VBQUM7QUFFdEQsQ0FBQztBQUVELE1BQU1JLHdCQUF3QixHQUFHO0VBQy9CQyxHQUFHLEVBQUUsR0FBRztFQUNSQyxHQUFHLEVBQUUsR0FBRztFQUNSQyxJQUFJLEVBQUUsSUFBSTtFQUNWQyxJQUFJLEVBQUU7QUFDUixDQUFDO0FBRUQsTUFBTUMsd0JBQXdCLEdBQUc7RUFDL0JDLFdBQVcsRUFBRSxLQUFLO0VBQ2xCQyxVQUFVLEVBQUUsS0FBSztFQUNqQkMsVUFBVSxFQUFFLEtBQUs7RUFDakJDLGFBQWEsRUFBRSxRQUFRO0VBQ3ZCQyxZQUFZLEVBQUUsU0FBUztFQUN2QkMsS0FBSyxFQUFFLE1BQU07RUFDYkMsT0FBTyxFQUFFLFFBQVE7RUFDakJDLE9BQU8sRUFBRSxRQUFRO0VBQ2pCQyxZQUFZLEVBQUUsY0FBYztFQUM1QkMsTUFBTSxFQUFFLE9BQU87RUFDZkMsS0FBSyxFQUFFLE1BQU07RUFDYkMsS0FBSyxFQUFFO0FBQ1QsQ0FBQztBQUVELE1BQU1DLGVBQWUsR0FBR3JELEtBQUssSUFBSTtFQUMvQixJQUFJLE9BQU9BLEtBQUssS0FBSyxRQUFRLEVBQUU7SUFDN0IsSUFBSUEsS0FBSyxDQUFDc0QsTUFBTSxLQUFLLE1BQU0sRUFBRTtNQUMzQixPQUFPdEQsS0FBSyxDQUFDdUQsR0FBRztJQUNsQjtJQUNBLElBQUl2RCxLQUFLLENBQUNzRCxNQUFNLEtBQUssTUFBTSxFQUFFO01BQzNCLE9BQU90RCxLQUFLLENBQUN3RCxJQUFJO0lBQ25CO0VBQ0Y7RUFDQSxPQUFPeEQsS0FBSztBQUNkLENBQUM7QUFFRCxNQUFNeUQsY0FBYyxHQUFHekQsS0FBSyxJQUFJO0VBQzlCLElBQUksT0FBT0EsS0FBSyxLQUFLLFFBQVEsSUFBSUEsS0FBSyxDQUFDc0QsTUFBTSxLQUFLLFNBQVMsRUFBRTtJQUMzRCxPQUFPdEQsS0FBSyxDQUFDMEQsUUFBUTtFQUN2QjtFQUNBLE9BQU8xRCxLQUFLO0FBQ2QsQ0FBQzs7QUFFRDtBQUNBLE1BQU0yRCxTQUFTLEdBQUdoRixNQUFNLENBQUNpRixNQUFNLENBQUM7RUFDOUJDLElBQUksRUFBRSxDQUFDLENBQUM7RUFDUkMsR0FBRyxFQUFFLENBQUMsQ0FBQztFQUNQQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0VBQ1RDLE1BQU0sRUFBRSxDQUFDLENBQUM7RUFDVkMsTUFBTSxFQUFFLENBQUMsQ0FBQztFQUNWQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0VBQ1ZDLFFBQVEsRUFBRSxDQUFDLENBQUM7RUFDWkMsZUFBZSxFQUFFLENBQUM7QUFDcEIsQ0FBQyxDQUFDO0FBRUYsTUFBTUMsV0FBVyxHQUFHMUYsTUFBTSxDQUFDaUYsTUFBTSxDQUFDO0VBQ2hDQyxJQUFJLEVBQUU7SUFBRSxHQUFHLEVBQUU7RUFBSyxDQUFDO0VBQ25CQyxHQUFHLEVBQUU7SUFBRSxHQUFHLEVBQUU7RUFBSyxDQUFDO0VBQ2xCQyxLQUFLLEVBQUU7SUFBRSxHQUFHLEVBQUU7RUFBSyxDQUFDO0VBQ3BCQyxNQUFNLEVBQUU7SUFBRSxHQUFHLEVBQUU7RUFBSyxDQUFDO0VBQ3JCQyxNQUFNLEVBQUU7SUFBRSxHQUFHLEVBQUU7RUFBSyxDQUFDO0VBQ3JCQyxNQUFNLEVBQUU7SUFBRSxHQUFHLEVBQUU7RUFBSyxDQUFDO0VBQ3JCQyxRQUFRLEVBQUU7SUFBRSxHQUFHLEVBQUU7RUFBSyxDQUFDO0VBQ3ZCQyxlQUFlLEVBQUU7SUFBRSxHQUFHLEVBQUU7RUFBRztBQUM3QixDQUFDLENBQUM7QUFFRixNQUFNRSxhQUFhLEdBQUdDLE1BQU0sSUFBSTtFQUM5QixJQUFJQSxNQUFNLENBQUNDLFNBQVMsS0FBSyxPQUFPLEVBQUU7SUFDaEMsT0FBT0QsTUFBTSxDQUFDRSxNQUFNLENBQUNDLGdCQUFnQjtFQUN2QztFQUNBLElBQUlILE1BQU0sQ0FBQ0UsTUFBTSxFQUFFO0lBQ2pCLE9BQU9GLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDRSxNQUFNO0lBQzNCLE9BQU9KLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDRyxNQUFNO0VBQzdCO0VBQ0EsSUFBSUMsSUFBSSxHQUFHUixXQUFXO0VBQ3RCLElBQUlFLE1BQU0sQ0FBQ08scUJBQXFCLEVBQUU7SUFDaENELElBQUksR0FBQXpGLGFBQUEsQ0FBQUEsYUFBQSxLQUFRdUUsU0FBUyxHQUFLWSxNQUFNLENBQUNPLHFCQUFxQixDQUFFO0VBQzFEO0VBQ0EsSUFBSUMsT0FBTyxHQUFHLENBQUMsQ0FBQztFQUNoQixJQUFJUixNQUFNLENBQUNRLE9BQU8sRUFBRTtJQUNsQkEsT0FBTyxHQUFBM0YsYUFBQSxLQUFRbUYsTUFBTSxDQUFDUSxPQUFPLENBQUU7RUFDakM7RUFDQSxPQUFPO0lBQ0xQLFNBQVMsRUFBRUQsTUFBTSxDQUFDQyxTQUFTO0lBQzNCQyxNQUFNLEVBQUVGLE1BQU0sQ0FBQ0UsTUFBTTtJQUNyQksscUJBQXFCLEVBQUVELElBQUk7SUFDM0JFO0VBQ0YsQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNQyxnQkFBZ0IsR0FBR1QsTUFBTSxJQUFJO0VBQ2pDLElBQUksQ0FBQ0EsTUFBTSxFQUFFO0lBQ1gsT0FBT0EsTUFBTTtFQUNmO0VBQ0FBLE1BQU0sQ0FBQ0UsTUFBTSxHQUFHRixNQUFNLENBQUNFLE1BQU0sSUFBSSxDQUFDLENBQUM7RUFDbkNGLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDRSxNQUFNLEdBQUc7SUFBRTVDLElBQUksRUFBRSxPQUFPO0lBQUVDLFFBQVEsRUFBRTtNQUFFRCxJQUFJLEVBQUU7SUFBUztFQUFFLENBQUM7RUFDdEV3QyxNQUFNLENBQUNFLE1BQU0sQ0FBQ0csTUFBTSxHQUFHO0lBQUU3QyxJQUFJLEVBQUUsT0FBTztJQUFFQyxRQUFRLEVBQUU7TUFBRUQsSUFBSSxFQUFFO0lBQVM7RUFBRSxDQUFDO0VBQ3RFLElBQUl3QyxNQUFNLENBQUNDLFNBQVMsS0FBSyxPQUFPLEVBQUU7SUFDaENELE1BQU0sQ0FBQ0UsTUFBTSxDQUFDQyxnQkFBZ0IsR0FBRztNQUFFM0MsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUNuRHdDLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDUSxpQkFBaUIsR0FBRztNQUFFbEQsSUFBSSxFQUFFO0lBQVEsQ0FBQztFQUNyRDtFQUNBLE9BQU93QyxNQUFNO0FBQ2YsQ0FBQztBQUVELE1BQU1XLGVBQWUsR0FBRzFHLE1BQU0sSUFBSTtFQUNoQ0csTUFBTSxDQUFDRCxJQUFJLENBQUNGLE1BQU0sQ0FBQyxDQUFDa0IsT0FBTyxDQUFDeUYsU0FBUyxJQUFJO0lBQ3ZDLElBQUlBLFNBQVMsQ0FBQ0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFO01BQy9CLE1BQU1DLFVBQVUsR0FBR0YsU0FBUyxDQUFDRyxLQUFLLENBQUMsR0FBRyxDQUFDO01BQ3ZDLE1BQU1DLEtBQUssR0FBR0YsVUFBVSxDQUFDRyxLQUFLLEVBQUU7TUFDaENoSCxNQUFNLENBQUMrRyxLQUFLLENBQUMsR0FBRy9HLE1BQU0sQ0FBQytHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztNQUNuQyxJQUFJRSxVQUFVLEdBQUdqSCxNQUFNLENBQUMrRyxLQUFLLENBQUM7TUFDOUIsSUFBSUcsSUFBSTtNQUNSLElBQUkxRixLQUFLLEdBQUd4QixNQUFNLENBQUMyRyxTQUFTLENBQUM7TUFDN0IsSUFBSW5GLEtBQUssSUFBSUEsS0FBSyxDQUFDMkYsSUFBSSxLQUFLLFFBQVEsRUFBRTtRQUNwQzNGLEtBQUssR0FBR1ksU0FBUztNQUNuQjtNQUNBO01BQ0EsT0FBUThFLElBQUksR0FBR0wsVUFBVSxDQUFDRyxLQUFLLEVBQUUsRUFBRztRQUNsQztRQUNBQyxVQUFVLENBQUNDLElBQUksQ0FBQyxHQUFHRCxVQUFVLENBQUNDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QyxJQUFJTCxVQUFVLENBQUM3RixNQUFNLEtBQUssQ0FBQyxFQUFFO1VBQzNCaUcsVUFBVSxDQUFDQyxJQUFJLENBQUMsR0FBRzFGLEtBQUs7UUFDMUI7UUFDQXlGLFVBQVUsR0FBR0EsVUFBVSxDQUFDQyxJQUFJLENBQUM7TUFDL0I7TUFDQSxPQUFPbEgsTUFBTSxDQUFDMkcsU0FBUyxDQUFDO0lBQzFCO0VBQ0YsQ0FBQyxDQUFDO0VBQ0YsT0FBTzNHLE1BQU07QUFDZixDQUFDO0FBRUQsTUFBTW9ILDZCQUE2QixHQUFHVCxTQUFTLElBQUk7RUFDakQsT0FBT0EsU0FBUyxDQUFDRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUNPLEdBQUcsQ0FBQyxDQUFDQyxJQUFJLEVBQUVDLEtBQUssS0FBSztJQUMvQyxJQUFJQSxLQUFLLEtBQUssQ0FBQyxFQUFFO01BQ2YsT0FBUSxJQUFHRCxJQUFLLEdBQUU7SUFDcEI7SUFDQSxPQUFRLElBQUdBLElBQUssR0FBRTtFQUNwQixDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsTUFBTUUsaUJBQWlCLEdBQUdiLFNBQVMsSUFBSTtFQUNyQyxJQUFJQSxTQUFTLENBQUNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtJQUNqQyxPQUFRLElBQUdELFNBQVUsR0FBRTtFQUN6QjtFQUNBLE1BQU1FLFVBQVUsR0FBR08sNkJBQTZCLENBQUNULFNBQVMsQ0FBQztFQUMzRCxJQUFJM0IsSUFBSSxHQUFHNkIsVUFBVSxDQUFDMUQsS0FBSyxDQUFDLENBQUMsRUFBRTBELFVBQVUsQ0FBQzdGLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQ3lHLElBQUksQ0FBQyxJQUFJLENBQUM7RUFDaEV6QyxJQUFJLElBQUksS0FBSyxHQUFHNkIsVUFBVSxDQUFDQSxVQUFVLENBQUM3RixNQUFNLEdBQUcsQ0FBQyxDQUFDO0VBQ2pELE9BQU9nRSxJQUFJO0FBQ2IsQ0FBQztBQUVELE1BQU0wQyx1QkFBdUIsR0FBR2YsU0FBUyxJQUFJO0VBQzNDLElBQUksT0FBT0EsU0FBUyxLQUFLLFFBQVEsRUFBRTtJQUNqQyxPQUFPQSxTQUFTO0VBQ2xCO0VBQ0EsSUFBSUEsU0FBUyxLQUFLLGNBQWMsRUFBRTtJQUNoQyxPQUFPLFdBQVc7RUFDcEI7RUFDQSxJQUFJQSxTQUFTLEtBQUssY0FBYyxFQUFFO0lBQ2hDLE9BQU8sV0FBVztFQUNwQjtFQUNBLE9BQU9BLFNBQVMsQ0FBQ2dCLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDNUIsQ0FBQztBQUVELE1BQU1DLFlBQVksR0FBRzVILE1BQU0sSUFBSTtFQUM3QixJQUFJLE9BQU9BLE1BQU0sSUFBSSxRQUFRLEVBQUU7SUFDN0IsS0FBSyxNQUFNbUIsR0FBRyxJQUFJbkIsTUFBTSxFQUFFO01BQ3hCLElBQUksT0FBT0EsTUFBTSxDQUFDbUIsR0FBRyxDQUFDLElBQUksUUFBUSxFQUFFO1FBQ2xDeUcsWUFBWSxDQUFDNUgsTUFBTSxDQUFDbUIsR0FBRyxDQUFDLENBQUM7TUFDM0I7TUFFQSxJQUFJQSxHQUFHLENBQUMwRyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUkxRyxHQUFHLENBQUMwRyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDMUMsTUFBTSxJQUFJQyxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxrQkFBa0IsRUFDOUIsMERBQTBELENBQzNEO01BQ0g7SUFDRjtFQUNGO0FBQ0YsQ0FBQzs7QUFFRDtBQUNBLE1BQU1DLG1CQUFtQixHQUFHbEMsTUFBTSxJQUFJO0VBQ3BDLE1BQU1tQyxJQUFJLEdBQUcsRUFBRTtFQUNmLElBQUluQyxNQUFNLEVBQUU7SUFDVjVGLE1BQU0sQ0FBQ0QsSUFBSSxDQUFDNkYsTUFBTSxDQUFDRSxNQUFNLENBQUMsQ0FBQy9FLE9BQU8sQ0FBQ2lILEtBQUssSUFBSTtNQUMxQyxJQUFJcEMsTUFBTSxDQUFDRSxNQUFNLENBQUNrQyxLQUFLLENBQUMsQ0FBQzVFLElBQUksS0FBSyxVQUFVLEVBQUU7UUFDNUMyRSxJQUFJLENBQUN4SCxJQUFJLENBQUUsU0FBUXlILEtBQU0sSUFBR3BDLE1BQU0sQ0FBQ0MsU0FBVSxFQUFDLENBQUM7TUFDakQ7SUFDRixDQUFDLENBQUM7RUFDSjtFQUNBLE9BQU9rQyxJQUFJO0FBQ2IsQ0FBQztBQVFELE1BQU1FLGdCQUFnQixHQUFHQSxDQUFDO0VBQUVyQyxNQUFNO0VBQUVzQyxLQUFLO0VBQUVkLEtBQUs7RUFBRWU7QUFBZ0IsQ0FBQyxLQUFrQjtFQUNuRixNQUFNQyxRQUFRLEdBQUcsRUFBRTtFQUNuQixJQUFJQyxNQUFNLEdBQUcsRUFBRTtFQUNmLE1BQU1DLEtBQUssR0FBRyxFQUFFO0VBRWhCMUMsTUFBTSxHQUFHUyxnQkFBZ0IsQ0FBQ1QsTUFBTSxDQUFDO0VBQ2pDLEtBQUssTUFBTVksU0FBUyxJQUFJMEIsS0FBSyxFQUFFO0lBQzdCLE1BQU1LLFlBQVksR0FDaEIzQyxNQUFNLENBQUNFLE1BQU0sSUFBSUYsTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxJQUFJWixNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLENBQUNwRCxJQUFJLEtBQUssT0FBTztJQUN4RixNQUFNb0YscUJBQXFCLEdBQUdKLFFBQVEsQ0FBQ3ZILE1BQU07SUFDN0MsTUFBTTRILFVBQVUsR0FBR1AsS0FBSyxDQUFDMUIsU0FBUyxDQUFDOztJQUVuQztJQUNBLElBQUksQ0FBQ1osTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxFQUFFO01BQzdCO01BQ0EsSUFBSWlDLFVBQVUsSUFBSUEsVUFBVSxDQUFDQyxPQUFPLEtBQUssS0FBSyxFQUFFO1FBQzlDO01BQ0Y7SUFDRjtJQUVBLE1BQU1DLGFBQWEsR0FBR25DLFNBQVMsQ0FBQ29DLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQztJQUNyRSxJQUFJRCxhQUFhLEVBQUU7TUFDakI7TUFDQTtJQUNGLENBQUMsTUFBTSxJQUFJUixlQUFlLEtBQUszQixTQUFTLEtBQUssVUFBVSxJQUFJQSxTQUFTLEtBQUssT0FBTyxDQUFDLEVBQUU7TUFDakY0QixRQUFRLENBQUM3SCxJQUFJLENBQUUsVUFBUzZHLEtBQU0sbUJBQWtCQSxLQUFLLEdBQUcsQ0FBRSxHQUFFLENBQUM7TUFDN0RpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVpQyxVQUFVLENBQUM7TUFDbENyQixLQUFLLElBQUksQ0FBQztJQUNaLENBQUMsTUFBTSxJQUFJWixTQUFTLENBQUNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7TUFDdEMsSUFBSTVCLElBQUksR0FBR3dDLGlCQUFpQixDQUFDYixTQUFTLENBQUM7TUFDdkMsSUFBSWlDLFVBQVUsS0FBSyxJQUFJLEVBQUU7UUFDdkJMLFFBQVEsQ0FBQzdILElBQUksQ0FBRSxJQUFHNkcsS0FBTSxjQUFhLENBQUM7UUFDdENpQixNQUFNLENBQUM5SCxJQUFJLENBQUNzRSxJQUFJLENBQUM7UUFDakJ1QyxLQUFLLElBQUksQ0FBQztRQUNWO01BQ0YsQ0FBQyxNQUFNO1FBQ0wsSUFBSXFCLFVBQVUsQ0FBQ0ksR0FBRyxFQUFFO1VBQ2xCaEUsSUFBSSxHQUFHb0MsNkJBQTZCLENBQUNULFNBQVMsQ0FBQyxDQUFDYyxJQUFJLENBQUMsSUFBSSxDQUFDO1VBQzFEYyxRQUFRLENBQUM3SCxJQUFJLENBQUUsS0FBSTZHLEtBQU0sb0JBQW1CQSxLQUFLLEdBQUcsQ0FBRSxTQUFRLENBQUM7VUFDL0RpQixNQUFNLENBQUM5SCxJQUFJLENBQUNzRSxJQUFJLEVBQUV2QixJQUFJLENBQUNDLFNBQVMsQ0FBQ2tGLFVBQVUsQ0FBQ0ksR0FBRyxDQUFDLENBQUM7VUFDakR6QixLQUFLLElBQUksQ0FBQztRQUNaLENBQUMsTUFBTSxJQUFJcUIsVUFBVSxDQUFDSyxNQUFNLEVBQUU7VUFDNUI7UUFBQSxDQUNELE1BQU0sSUFBSSxPQUFPTCxVQUFVLEtBQUssUUFBUSxFQUFFO1VBQ3pDTCxRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sV0FBVUEsS0FBSyxHQUFHLENBQUUsUUFBTyxDQUFDO1VBQ3BEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDc0UsSUFBSSxFQUFFNEQsVUFBVSxDQUFDO1VBQzdCckIsS0FBSyxJQUFJLENBQUM7UUFDWjtNQUNGO0lBQ0YsQ0FBQyxNQUFNLElBQUlxQixVQUFVLEtBQUssSUFBSSxJQUFJQSxVQUFVLEtBQUt4RyxTQUFTLEVBQUU7TUFDMURtRyxRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sZUFBYyxDQUFDO01BQ3ZDaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxDQUFDO01BQ3RCWSxLQUFLLElBQUksQ0FBQztNQUNWO0lBQ0YsQ0FBQyxNQUFNLElBQUksT0FBT3FCLFVBQVUsS0FBSyxRQUFRLEVBQUU7TUFDekNMLFFBQVEsQ0FBQzdILElBQUksQ0FBRSxJQUFHNkcsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7TUFDL0NpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVpQyxVQUFVLENBQUM7TUFDbENyQixLQUFLLElBQUksQ0FBQztJQUNaLENBQUMsTUFBTSxJQUFJLE9BQU9xQixVQUFVLEtBQUssU0FBUyxFQUFFO01BQzFDTCxRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO01BQy9DO01BQ0EsSUFBSXhCLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDVSxTQUFTLENBQUMsSUFBSVosTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxDQUFDcEQsSUFBSSxLQUFLLFFBQVEsRUFBRTtRQUMxRTtRQUNBLE1BQU0yRixnQkFBZ0IsR0FBRyxtQkFBbUI7UUFDNUNWLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRXVDLGdCQUFnQixDQUFDO01BQzFDLENBQUMsTUFBTTtRQUNMVixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVpQyxVQUFVLENBQUM7TUFDcEM7TUFDQXJCLEtBQUssSUFBSSxDQUFDO0lBQ1osQ0FBQyxNQUFNLElBQUksT0FBT3FCLFVBQVUsS0FBSyxRQUFRLEVBQUU7TUFDekNMLFFBQVEsQ0FBQzdILElBQUksQ0FBRSxJQUFHNkcsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7TUFDL0NpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVpQyxVQUFVLENBQUM7TUFDbENyQixLQUFLLElBQUksQ0FBQztJQUNaLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQ00sUUFBUSxDQUFDbEIsU0FBUyxDQUFDLEVBQUU7TUFDdEQsTUFBTXdDLE9BQU8sR0FBRyxFQUFFO01BQ2xCLE1BQU1DLFlBQVksR0FBRyxFQUFFO01BQ3ZCUixVQUFVLENBQUMxSCxPQUFPLENBQUNtSSxRQUFRLElBQUk7UUFDN0IsTUFBTUMsTUFBTSxHQUFHbEIsZ0JBQWdCLENBQUM7VUFDOUJyQyxNQUFNO1VBQ05zQyxLQUFLLEVBQUVnQixRQUFRO1VBQ2Y5QixLQUFLO1VBQ0xlO1FBQ0YsQ0FBQyxDQUFDO1FBQ0YsSUFBSWdCLE1BQU0sQ0FBQ0MsT0FBTyxDQUFDdkksTUFBTSxHQUFHLENBQUMsRUFBRTtVQUM3Qm1JLE9BQU8sQ0FBQ3pJLElBQUksQ0FBQzRJLE1BQU0sQ0FBQ0MsT0FBTyxDQUFDO1VBQzVCSCxZQUFZLENBQUMxSSxJQUFJLENBQUMsR0FBRzRJLE1BQU0sQ0FBQ2QsTUFBTSxDQUFDO1VBQ25DakIsS0FBSyxJQUFJK0IsTUFBTSxDQUFDZCxNQUFNLENBQUN4SCxNQUFNO1FBQy9CO01BQ0YsQ0FBQyxDQUFDO01BRUYsTUFBTXdJLE9BQU8sR0FBRzdDLFNBQVMsS0FBSyxNQUFNLEdBQUcsT0FBTyxHQUFHLE1BQU07TUFDdkQsTUFBTThDLEdBQUcsR0FBRzlDLFNBQVMsS0FBSyxNQUFNLEdBQUcsT0FBTyxHQUFHLEVBQUU7TUFFL0M0QixRQUFRLENBQUM3SCxJQUFJLENBQUUsR0FBRStJLEdBQUksSUFBR04sT0FBTyxDQUFDMUIsSUFBSSxDQUFDK0IsT0FBTyxDQUFFLEdBQUUsQ0FBQztNQUNqRGhCLE1BQU0sQ0FBQzlILElBQUksQ0FBQyxHQUFHMEksWUFBWSxDQUFDO0lBQzlCO0lBRUEsSUFBSVIsVUFBVSxDQUFDYyxHQUFHLEtBQUt0SCxTQUFTLEVBQUU7TUFDaEMsSUFBSXNHLFlBQVksRUFBRTtRQUNoQkUsVUFBVSxDQUFDYyxHQUFHLEdBQUdqRyxJQUFJLENBQUNDLFNBQVMsQ0FBQyxDQUFDa0YsVUFBVSxDQUFDYyxHQUFHLENBQUMsQ0FBQztRQUNqRG5CLFFBQVEsQ0FBQzdILElBQUksQ0FBRSx1QkFBc0I2RyxLQUFNLFdBQVVBLEtBQUssR0FBRyxDQUFFLEdBQUUsQ0FBQztNQUNwRSxDQUFDLE1BQU07UUFDTCxJQUFJcUIsVUFBVSxDQUFDYyxHQUFHLEtBQUssSUFBSSxFQUFFO1VBQzNCbkIsUUFBUSxDQUFDN0gsSUFBSSxDQUFFLElBQUc2RyxLQUFNLG1CQUFrQixDQUFDO1VBQzNDaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxDQUFDO1VBQ3RCWSxLQUFLLElBQUksQ0FBQztVQUNWO1FBQ0YsQ0FBQyxNQUFNO1VBQ0w7VUFDQSxJQUFJcUIsVUFBVSxDQUFDYyxHQUFHLENBQUM1RSxNQUFNLEtBQUssVUFBVSxFQUFFO1lBQ3hDeUQsUUFBUSxDQUFDN0gsSUFBSSxDQUNWLEtBQUk2RyxLQUFNLG1CQUFrQkEsS0FBSyxHQUFHLENBQUUsTUFBS0EsS0FBSyxHQUFHLENBQUUsU0FBUUEsS0FBTSxnQkFBZSxDQUNwRjtVQUNILENBQUMsTUFBTTtZQUNMLElBQUlaLFNBQVMsQ0FBQ0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtjQUMvQixNQUFNK0MsbUJBQW1CLEdBQUduQyxpQkFBaUIsQ0FBQ2IsU0FBUyxDQUFDO2NBQ3hENEIsUUFBUSxDQUFDN0gsSUFBSSxDQUNWLElBQUdpSixtQkFBb0IsUUFBT3BDLEtBQU0sT0FBTW9DLG1CQUFvQixXQUFVLENBQzFFO1lBQ0gsQ0FBQyxNQUFNLElBQUksT0FBT2YsVUFBVSxDQUFDYyxHQUFHLEtBQUssUUFBUSxJQUFJZCxVQUFVLENBQUNjLEdBQUcsQ0FBQ0UsYUFBYSxFQUFFO2NBQzdFLE1BQU0sSUFBSTlCLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUM4QixZQUFZLEVBQ3hCLDRFQUE0RSxDQUM3RTtZQUNILENBQUMsTUFBTTtjQUNMdEIsUUFBUSxDQUFDN0gsSUFBSSxDQUFFLEtBQUk2RyxLQUFNLGFBQVlBLEtBQUssR0FBRyxDQUFFLFFBQU9BLEtBQU0sZ0JBQWUsQ0FBQztZQUM5RTtVQUNGO1FBQ0Y7TUFDRjtNQUNBLElBQUlxQixVQUFVLENBQUNjLEdBQUcsQ0FBQzVFLE1BQU0sS0FBSyxVQUFVLEVBQUU7UUFDeEMsTUFBTWdGLEtBQUssR0FBR2xCLFVBQVUsQ0FBQ2MsR0FBRztRQUM1QmxCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRW1ELEtBQUssQ0FBQ0MsU0FBUyxFQUFFRCxLQUFLLENBQUNFLFFBQVEsQ0FBQztRQUN2RHpDLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNO1FBQ0w7UUFDQWlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWlDLFVBQVUsQ0FBQ2MsR0FBRyxDQUFDO1FBQ3RDbkMsS0FBSyxJQUFJLENBQUM7TUFDWjtJQUNGO0lBQ0EsSUFBSXFCLFVBQVUsQ0FBQ3FCLEdBQUcsS0FBSzdILFNBQVMsRUFBRTtNQUNoQyxJQUFJd0csVUFBVSxDQUFDcUIsR0FBRyxLQUFLLElBQUksRUFBRTtRQUMzQjFCLFFBQVEsQ0FBQzdILElBQUksQ0FBRSxJQUFHNkcsS0FBTSxlQUFjLENBQUM7UUFDdkNpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLENBQUM7UUFDdEJZLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNO1FBQ0wsSUFBSVosU0FBUyxDQUFDQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO1VBQy9CNEIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDa0ksVUFBVSxDQUFDcUIsR0FBRyxDQUFDO1VBQzNCMUIsUUFBUSxDQUFDN0gsSUFBSSxDQUFFLEdBQUU4RyxpQkFBaUIsQ0FBQ2IsU0FBUyxDQUFFLE9BQU1ZLEtBQUssRUFBRyxFQUFDLENBQUM7UUFDaEUsQ0FBQyxNQUFNLElBQUksT0FBT3FCLFVBQVUsQ0FBQ3FCLEdBQUcsS0FBSyxRQUFRLElBQUlyQixVQUFVLENBQUNxQixHQUFHLENBQUNMLGFBQWEsRUFBRTtVQUM3RSxNQUFNLElBQUk5QixhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDOEIsWUFBWSxFQUN4Qiw0RUFBNEUsQ0FDN0U7UUFDSCxDQUFDLE1BQU07VUFDTHJCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWlDLFVBQVUsQ0FBQ3FCLEdBQUcsQ0FBQztVQUN0QzFCLFFBQVEsQ0FBQzdILElBQUksQ0FBRSxJQUFHNkcsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7VUFDL0NBLEtBQUssSUFBSSxDQUFDO1FBQ1o7TUFDRjtJQUNGO0lBQ0EsTUFBTTJDLFNBQVMsR0FBR0MsS0FBSyxDQUFDQyxPQUFPLENBQUN4QixVQUFVLENBQUNJLEdBQUcsQ0FBQyxJQUFJbUIsS0FBSyxDQUFDQyxPQUFPLENBQUN4QixVQUFVLENBQUN5QixJQUFJLENBQUM7SUFDakYsSUFDRUYsS0FBSyxDQUFDQyxPQUFPLENBQUN4QixVQUFVLENBQUNJLEdBQUcsQ0FBQyxJQUM3Qk4sWUFBWSxJQUNaM0MsTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxDQUFDbkQsUUFBUSxJQUNqQ3VDLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDVSxTQUFTLENBQUMsQ0FBQ25ELFFBQVEsQ0FBQ0QsSUFBSSxLQUFLLFFBQVEsRUFDbkQ7TUFDQSxNQUFNK0csVUFBVSxHQUFHLEVBQUU7TUFDckIsSUFBSUMsU0FBUyxHQUFHLEtBQUs7TUFDckIvQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLENBQUM7TUFDdEJpQyxVQUFVLENBQUNJLEdBQUcsQ0FBQzlILE9BQU8sQ0FBQyxDQUFDc0osUUFBUSxFQUFFQyxTQUFTLEtBQUs7UUFDOUMsSUFBSUQsUUFBUSxLQUFLLElBQUksRUFBRTtVQUNyQkQsU0FBUyxHQUFHLElBQUk7UUFDbEIsQ0FBQyxNQUFNO1VBQ0wvQixNQUFNLENBQUM5SCxJQUFJLENBQUM4SixRQUFRLENBQUM7VUFDckJGLFVBQVUsQ0FBQzVKLElBQUksQ0FBRSxJQUFHNkcsS0FBSyxHQUFHLENBQUMsR0FBR2tELFNBQVMsSUFBSUYsU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUUsRUFBQyxDQUFDO1FBQ3BFO01BQ0YsQ0FBQyxDQUFDO01BQ0YsSUFBSUEsU0FBUyxFQUFFO1FBQ2JoQyxRQUFRLENBQUM3SCxJQUFJLENBQUUsS0FBSTZHLEtBQU0scUJBQW9CQSxLQUFNLGtCQUFpQitDLFVBQVUsQ0FBQzdDLElBQUksRUFBRyxJQUFHLENBQUM7TUFDNUYsQ0FBQyxNQUFNO1FBQ0xjLFFBQVEsQ0FBQzdILElBQUksQ0FBRSxJQUFHNkcsS0FBTSxrQkFBaUIrQyxVQUFVLENBQUM3QyxJQUFJLEVBQUcsR0FBRSxDQUFDO01BQ2hFO01BQ0FGLEtBQUssR0FBR0EsS0FBSyxHQUFHLENBQUMsR0FBRytDLFVBQVUsQ0FBQ3RKLE1BQU07SUFDdkMsQ0FBQyxNQUFNLElBQUlrSixTQUFTLEVBQUU7TUFDcEIsSUFBSVEsZ0JBQWdCLEdBQUdBLENBQUNDLFNBQVMsRUFBRUMsS0FBSyxLQUFLO1FBQzNDLE1BQU1uQixHQUFHLEdBQUdtQixLQUFLLEdBQUcsT0FBTyxHQUFHLEVBQUU7UUFDaEMsSUFBSUQsU0FBUyxDQUFDM0osTUFBTSxHQUFHLENBQUMsRUFBRTtVQUN4QixJQUFJMEgsWUFBWSxFQUFFO1lBQ2hCSCxRQUFRLENBQUM3SCxJQUFJLENBQUUsR0FBRStJLEdBQUksb0JBQW1CbEMsS0FBTSxXQUFVQSxLQUFLLEdBQUcsQ0FBRSxHQUFFLENBQUM7WUFDckVpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVsRCxJQUFJLENBQUNDLFNBQVMsQ0FBQ2lILFNBQVMsQ0FBQyxDQUFDO1lBQ2pEcEQsS0FBSyxJQUFJLENBQUM7VUFDWixDQUFDLE1BQU07WUFDTDtZQUNBLElBQUlaLFNBQVMsQ0FBQ0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtjQUMvQjtZQUNGO1lBQ0EsTUFBTTBELFVBQVUsR0FBRyxFQUFFO1lBQ3JCOUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxDQUFDO1lBQ3RCZ0UsU0FBUyxDQUFDekosT0FBTyxDQUFDLENBQUNzSixRQUFRLEVBQUVDLFNBQVMsS0FBSztjQUN6QyxJQUFJRCxRQUFRLElBQUksSUFBSSxFQUFFO2dCQUNwQmhDLE1BQU0sQ0FBQzlILElBQUksQ0FBQzhKLFFBQVEsQ0FBQztnQkFDckJGLFVBQVUsQ0FBQzVKLElBQUksQ0FBRSxJQUFHNkcsS0FBSyxHQUFHLENBQUMsR0FBR2tELFNBQVUsRUFBQyxDQUFDO2NBQzlDO1lBQ0YsQ0FBQyxDQUFDO1lBQ0ZsQyxRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sU0FBUWtDLEdBQUksUUFBT2EsVUFBVSxDQUFDN0MsSUFBSSxFQUFHLEdBQUUsQ0FBQztZQUNoRUYsS0FBSyxHQUFHQSxLQUFLLEdBQUcsQ0FBQyxHQUFHK0MsVUFBVSxDQUFDdEosTUFBTTtVQUN2QztRQUNGLENBQUMsTUFBTSxJQUFJLENBQUM0SixLQUFLLEVBQUU7VUFDakJwQyxNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLENBQUM7VUFDdEI0QixRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sZUFBYyxDQUFDO1VBQ3ZDQSxLQUFLLEdBQUdBLEtBQUssR0FBRyxDQUFDO1FBQ25CLENBQUMsTUFBTTtVQUNMO1VBQ0EsSUFBSXFELEtBQUssRUFBRTtZQUNUckMsUUFBUSxDQUFDN0gsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7VUFDMUIsQ0FBQyxNQUFNO1lBQ0w2SCxRQUFRLENBQUM3SCxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztVQUMxQjtRQUNGO01BQ0YsQ0FBQzs7TUFDRCxJQUFJa0ksVUFBVSxDQUFDSSxHQUFHLEVBQUU7UUFDbEIwQixnQkFBZ0IsQ0FDZEcsZUFBQyxDQUFDQyxPQUFPLENBQUNsQyxVQUFVLENBQUNJLEdBQUcsRUFBRStCLEdBQUcsSUFBSUEsR0FBRyxDQUFDLEVBQ3JDLEtBQUssQ0FDTjtNQUNIO01BQ0EsSUFBSW5DLFVBQVUsQ0FBQ3lCLElBQUksRUFBRTtRQUNuQkssZ0JBQWdCLENBQ2RHLGVBQUMsQ0FBQ0MsT0FBTyxDQUFDbEMsVUFBVSxDQUFDeUIsSUFBSSxFQUFFVSxHQUFHLElBQUlBLEdBQUcsQ0FBQyxFQUN0QyxJQUFJLENBQ0w7TUFDSDtJQUNGLENBQUMsTUFBTSxJQUFJLE9BQU9uQyxVQUFVLENBQUNJLEdBQUcsS0FBSyxXQUFXLEVBQUU7TUFDaEQsTUFBTSxJQUFJbEIsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDOEIsWUFBWSxFQUFFLGVBQWUsQ0FBQztJQUNsRSxDQUFDLE1BQU0sSUFBSSxPQUFPakIsVUFBVSxDQUFDeUIsSUFBSSxLQUFLLFdBQVcsRUFBRTtNQUNqRCxNQUFNLElBQUl2QyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUM4QixZQUFZLEVBQUUsZ0JBQWdCLENBQUM7SUFDbkU7SUFFQSxJQUFJTSxLQUFLLENBQUNDLE9BQU8sQ0FBQ3hCLFVBQVUsQ0FBQ29DLElBQUksQ0FBQyxJQUFJdEMsWUFBWSxFQUFFO01BQ2xELElBQUl1Qyx5QkFBeUIsQ0FBQ3JDLFVBQVUsQ0FBQ29DLElBQUksQ0FBQyxFQUFFO1FBQzlDLElBQUksQ0FBQ0Usc0JBQXNCLENBQUN0QyxVQUFVLENBQUNvQyxJQUFJLENBQUMsRUFBRTtVQUM1QyxNQUFNLElBQUlsRCxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDOEIsWUFBWSxFQUN4QixpREFBaUQsR0FBR2pCLFVBQVUsQ0FBQ29DLElBQUksQ0FDcEU7UUFDSDtRQUVBLEtBQUssSUFBSWxLLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBRzhILFVBQVUsQ0FBQ29DLElBQUksQ0FBQ2hLLE1BQU0sRUFBRUYsQ0FBQyxJQUFJLENBQUMsRUFBRTtVQUNsRCxNQUFNVSxLQUFLLEdBQUcySixtQkFBbUIsQ0FBQ3ZDLFVBQVUsQ0FBQ29DLElBQUksQ0FBQ2xLLENBQUMsQ0FBQyxDQUFDbUksTUFBTSxDQUFDO1VBQzVETCxVQUFVLENBQUNvQyxJQUFJLENBQUNsSyxDQUFDLENBQUMsR0FBR1UsS0FBSyxDQUFDNEosU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUc7UUFDL0M7UUFDQTdDLFFBQVEsQ0FBQzdILElBQUksQ0FBRSw2QkFBNEI2RyxLQUFNLFdBQVVBLEtBQUssR0FBRyxDQUFFLFVBQVMsQ0FBQztNQUNqRixDQUFDLE1BQU07UUFDTGdCLFFBQVEsQ0FBQzdILElBQUksQ0FBRSx1QkFBc0I2RyxLQUFNLFdBQVVBLEtBQUssR0FBRyxDQUFFLFVBQVMsQ0FBQztNQUMzRTtNQUNBaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxFQUFFbEQsSUFBSSxDQUFDQyxTQUFTLENBQUNrRixVQUFVLENBQUNvQyxJQUFJLENBQUMsQ0FBQztNQUN2RHpELEtBQUssSUFBSSxDQUFDO0lBQ1osQ0FBQyxNQUFNLElBQUk0QyxLQUFLLENBQUNDLE9BQU8sQ0FBQ3hCLFVBQVUsQ0FBQ29DLElBQUksQ0FBQyxFQUFFO01BQ3pDLElBQUlwQyxVQUFVLENBQUNvQyxJQUFJLENBQUNoSyxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQ2hDdUgsUUFBUSxDQUFDN0gsSUFBSSxDQUFFLElBQUc2RyxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztRQUMvQ2lCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWlDLFVBQVUsQ0FBQ29DLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzlGLFFBQVEsQ0FBQztRQUNuRHFDLEtBQUssSUFBSSxDQUFDO01BQ1o7SUFDRjtJQUVBLElBQUksT0FBT3FCLFVBQVUsQ0FBQ0MsT0FBTyxLQUFLLFdBQVcsRUFBRTtNQUM3QyxJQUFJLE9BQU9ELFVBQVUsQ0FBQ0MsT0FBTyxLQUFLLFFBQVEsSUFBSUQsVUFBVSxDQUFDQyxPQUFPLENBQUNlLGFBQWEsRUFBRTtRQUM5RSxNQUFNLElBQUk5QixhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDOEIsWUFBWSxFQUN4Qiw0RUFBNEUsQ0FDN0U7TUFDSCxDQUFDLE1BQU0sSUFBSWpCLFVBQVUsQ0FBQ0MsT0FBTyxFQUFFO1FBQzdCTixRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sbUJBQWtCLENBQUM7TUFDN0MsQ0FBQyxNQUFNO1FBQ0xnQixRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sZUFBYyxDQUFDO01BQ3pDO01BQ0FpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLENBQUM7TUFDdEJZLEtBQUssSUFBSSxDQUFDO0lBQ1o7SUFFQSxJQUFJcUIsVUFBVSxDQUFDeUMsWUFBWSxFQUFFO01BQzNCLE1BQU1DLEdBQUcsR0FBRzFDLFVBQVUsQ0FBQ3lDLFlBQVk7TUFDbkMsSUFBSSxFQUFFQyxHQUFHLFlBQVluQixLQUFLLENBQUMsRUFBRTtRQUMzQixNQUFNLElBQUlyQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUM4QixZQUFZLEVBQUcsc0NBQXFDLENBQUM7TUFDekY7TUFFQXRCLFFBQVEsQ0FBQzdILElBQUksQ0FBRSxJQUFHNkcsS0FBTSxhQUFZQSxLQUFLLEdBQUcsQ0FBRSxTQUFRLENBQUM7TUFDdkRpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVsRCxJQUFJLENBQUNDLFNBQVMsQ0FBQzRILEdBQUcsQ0FBQyxDQUFDO01BQzNDL0QsS0FBSyxJQUFJLENBQUM7SUFDWjtJQUVBLElBQUlxQixVQUFVLENBQUMyQyxLQUFLLEVBQUU7TUFDcEIsTUFBTUMsTUFBTSxHQUFHNUMsVUFBVSxDQUFDMkMsS0FBSyxDQUFDRSxPQUFPO01BQ3ZDLElBQUlDLFFBQVEsR0FBRyxTQUFTO01BQ3hCLElBQUksT0FBT0YsTUFBTSxLQUFLLFFBQVEsRUFBRTtRQUM5QixNQUFNLElBQUkxRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUM4QixZQUFZLEVBQUcsc0NBQXFDLENBQUM7TUFDekY7TUFDQSxJQUFJLENBQUMyQixNQUFNLENBQUNHLEtBQUssSUFBSSxPQUFPSCxNQUFNLENBQUNHLEtBQUssS0FBSyxRQUFRLEVBQUU7UUFDckQsTUFBTSxJQUFJN0QsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDOEIsWUFBWSxFQUFHLG9DQUFtQyxDQUFDO01BQ3ZGO01BQ0EsSUFBSTJCLE1BQU0sQ0FBQ0ksU0FBUyxJQUFJLE9BQU9KLE1BQU0sQ0FBQ0ksU0FBUyxLQUFLLFFBQVEsRUFBRTtRQUM1RCxNQUFNLElBQUk5RCxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUM4QixZQUFZLEVBQUcsd0NBQXVDLENBQUM7TUFDM0YsQ0FBQyxNQUFNLElBQUkyQixNQUFNLENBQUNJLFNBQVMsRUFBRTtRQUMzQkYsUUFBUSxHQUFHRixNQUFNLENBQUNJLFNBQVM7TUFDN0I7TUFDQSxJQUFJSixNQUFNLENBQUNLLGNBQWMsSUFBSSxPQUFPTCxNQUFNLENBQUNLLGNBQWMsS0FBSyxTQUFTLEVBQUU7UUFDdkUsTUFBTSxJQUFJL0QsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhCLFlBQVksRUFDdkIsOENBQTZDLENBQy9DO01BQ0gsQ0FBQyxNQUFNLElBQUkyQixNQUFNLENBQUNLLGNBQWMsRUFBRTtRQUNoQyxNQUFNLElBQUkvRCxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDOEIsWUFBWSxFQUN2QixvR0FBbUcsQ0FDckc7TUFDSDtNQUNBLElBQUkyQixNQUFNLENBQUNNLG1CQUFtQixJQUFJLE9BQU9OLE1BQU0sQ0FBQ00sbUJBQW1CLEtBQUssU0FBUyxFQUFFO1FBQ2pGLE1BQU0sSUFBSWhFLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUM4QixZQUFZLEVBQ3ZCLG1EQUFrRCxDQUNwRDtNQUNILENBQUMsTUFBTSxJQUFJMkIsTUFBTSxDQUFDTSxtQkFBbUIsS0FBSyxLQUFLLEVBQUU7UUFDL0MsTUFBTSxJQUFJaEUsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhCLFlBQVksRUFDdkIsMkZBQTBGLENBQzVGO01BQ0g7TUFDQXRCLFFBQVEsQ0FBQzdILElBQUksQ0FDVixnQkFBZTZHLEtBQU0sTUFBS0EsS0FBSyxHQUFHLENBQUUseUJBQXdCQSxLQUFLLEdBQUcsQ0FBRSxNQUFLQSxLQUFLLEdBQUcsQ0FBRSxHQUFFLENBQ3pGO01BQ0RpQixNQUFNLENBQUM5SCxJQUFJLENBQUNnTCxRQUFRLEVBQUUvRSxTQUFTLEVBQUUrRSxRQUFRLEVBQUVGLE1BQU0sQ0FBQ0csS0FBSyxDQUFDO01BQ3hEcEUsS0FBSyxJQUFJLENBQUM7SUFDWjtJQUVBLElBQUlxQixVQUFVLENBQUNtRCxXQUFXLEVBQUU7TUFDMUIsTUFBTWpDLEtBQUssR0FBR2xCLFVBQVUsQ0FBQ21ELFdBQVc7TUFDcEMsTUFBTUMsUUFBUSxHQUFHcEQsVUFBVSxDQUFDcUQsWUFBWTtNQUN4QyxNQUFNQyxZQUFZLEdBQUdGLFFBQVEsR0FBRyxJQUFJLEdBQUcsSUFBSTtNQUMzQ3pELFFBQVEsQ0FBQzdILElBQUksQ0FDVixzQkFBcUI2RyxLQUFNLDJCQUEwQkEsS0FBSyxHQUFHLENBQUUsTUFDOURBLEtBQUssR0FBRyxDQUNULG9CQUFtQkEsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUNoQztNQUNEa0IsS0FBSyxDQUFDL0gsSUFBSSxDQUNQLHNCQUFxQjZHLEtBQU0sMkJBQTBCQSxLQUFLLEdBQUcsQ0FBRSxNQUM5REEsS0FBSyxHQUFHLENBQ1Qsa0JBQWlCLENBQ25CO01BQ0RpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVtRCxLQUFLLENBQUNDLFNBQVMsRUFBRUQsS0FBSyxDQUFDRSxRQUFRLEVBQUVrQyxZQUFZLENBQUM7TUFDckUzRSxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXFCLFVBQVUsQ0FBQ3VELE9BQU8sSUFBSXZELFVBQVUsQ0FBQ3VELE9BQU8sQ0FBQ0MsSUFBSSxFQUFFO01BQ2pELE1BQU1DLEdBQUcsR0FBR3pELFVBQVUsQ0FBQ3VELE9BQU8sQ0FBQ0MsSUFBSTtNQUNuQyxNQUFNRSxJQUFJLEdBQUdELEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQ3RDLFNBQVM7TUFDN0IsTUFBTXdDLE1BQU0sR0FBR0YsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDckMsUUFBUTtNQUM5QixNQUFNd0MsS0FBSyxHQUFHSCxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUN0QyxTQUFTO01BQzlCLE1BQU0wQyxHQUFHLEdBQUdKLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQ3JDLFFBQVE7TUFFM0J6QixRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sb0JBQW1CQSxLQUFLLEdBQUcsQ0FBRSxPQUFNLENBQUM7TUFDNURpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUcsS0FBSTJGLElBQUssS0FBSUMsTUFBTyxPQUFNQyxLQUFNLEtBQUlDLEdBQUksSUFBRyxDQUFDO01BQ3BFbEYsS0FBSyxJQUFJLENBQUM7SUFDWjtJQUVBLElBQUlxQixVQUFVLENBQUM4RCxVQUFVLElBQUk5RCxVQUFVLENBQUM4RCxVQUFVLENBQUNDLGFBQWEsRUFBRTtNQUNoRSxNQUFNQyxZQUFZLEdBQUdoRSxVQUFVLENBQUM4RCxVQUFVLENBQUNDLGFBQWE7TUFDeEQsSUFBSSxFQUFFQyxZQUFZLFlBQVl6QyxLQUFLLENBQUMsSUFBSXlDLFlBQVksQ0FBQzVMLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDL0QsTUFBTSxJQUFJOEcsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhCLFlBQVksRUFDeEIsdUZBQXVGLENBQ3hGO01BQ0g7TUFDQTtNQUNBLElBQUlDLEtBQUssR0FBRzhDLFlBQVksQ0FBQyxDQUFDLENBQUM7TUFDM0IsSUFBSTlDLEtBQUssWUFBWUssS0FBSyxJQUFJTCxLQUFLLENBQUM5SSxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQ2hEOEksS0FBSyxHQUFHLElBQUloQyxhQUFLLENBQUMrRSxRQUFRLENBQUMvQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUVBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUNoRCxDQUFDLE1BQU0sSUFBSSxDQUFDZ0QsYUFBYSxDQUFDQyxXQUFXLENBQUNqRCxLQUFLLENBQUMsRUFBRTtRQUM1QyxNQUFNLElBQUloQyxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDOEIsWUFBWSxFQUN4Qix1REFBdUQsQ0FDeEQ7TUFDSDtNQUNBL0IsYUFBSyxDQUFDK0UsUUFBUSxDQUFDRyxTQUFTLENBQUNsRCxLQUFLLENBQUNFLFFBQVEsRUFBRUYsS0FBSyxDQUFDQyxTQUFTLENBQUM7TUFDekQ7TUFDQSxNQUFNaUMsUUFBUSxHQUFHWSxZQUFZLENBQUMsQ0FBQyxDQUFDO01BQ2hDLElBQUlLLEtBQUssQ0FBQ2pCLFFBQVEsQ0FBQyxJQUFJQSxRQUFRLEdBQUcsQ0FBQyxFQUFFO1FBQ25DLE1BQU0sSUFBSWxFLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUM4QixZQUFZLEVBQ3hCLHNEQUFzRCxDQUN2RDtNQUNIO01BQ0EsTUFBTXFDLFlBQVksR0FBR0YsUUFBUSxHQUFHLElBQUksR0FBRyxJQUFJO01BQzNDekQsUUFBUSxDQUFDN0gsSUFBSSxDQUNWLHNCQUFxQjZHLEtBQU0sMkJBQTBCQSxLQUFLLEdBQUcsQ0FBRSxNQUM5REEsS0FBSyxHQUFHLENBQ1Qsb0JBQW1CQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQ2hDO01BQ0RpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVtRCxLQUFLLENBQUNDLFNBQVMsRUFBRUQsS0FBSyxDQUFDRSxRQUFRLEVBQUVrQyxZQUFZLENBQUM7TUFDckUzRSxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXFCLFVBQVUsQ0FBQzhELFVBQVUsSUFBSTlELFVBQVUsQ0FBQzhELFVBQVUsQ0FBQ1EsUUFBUSxFQUFFO01BQzNELE1BQU1DLE9BQU8sR0FBR3ZFLFVBQVUsQ0FBQzhELFVBQVUsQ0FBQ1EsUUFBUTtNQUM5QyxJQUFJRSxNQUFNO01BQ1YsSUFBSSxPQUFPRCxPQUFPLEtBQUssUUFBUSxJQUFJQSxPQUFPLENBQUNySSxNQUFNLEtBQUssU0FBUyxFQUFFO1FBQy9ELElBQUksQ0FBQ3FJLE9BQU8sQ0FBQ0UsV0FBVyxJQUFJRixPQUFPLENBQUNFLFdBQVcsQ0FBQ3JNLE1BQU0sR0FBRyxDQUFDLEVBQUU7VUFDMUQsTUFBTSxJQUFJOEcsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhCLFlBQVksRUFDeEIsbUZBQW1GLENBQ3BGO1FBQ0g7UUFDQXVELE1BQU0sR0FBR0QsT0FBTyxDQUFDRSxXQUFXO01BQzlCLENBQUMsTUFBTSxJQUFJRixPQUFPLFlBQVloRCxLQUFLLEVBQUU7UUFDbkMsSUFBSWdELE9BQU8sQ0FBQ25NLE1BQU0sR0FBRyxDQUFDLEVBQUU7VUFDdEIsTUFBTSxJQUFJOEcsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhCLFlBQVksRUFDeEIsb0VBQW9FLENBQ3JFO1FBQ0g7UUFDQXVELE1BQU0sR0FBR0QsT0FBTztNQUNsQixDQUFDLE1BQU07UUFDTCxNQUFNLElBQUlyRixhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDOEIsWUFBWSxFQUN4QixzRkFBc0YsQ0FDdkY7TUFDSDtNQUNBdUQsTUFBTSxHQUFHQSxNQUFNLENBQ1ovRixHQUFHLENBQUN5QyxLQUFLLElBQUk7UUFDWixJQUFJQSxLQUFLLFlBQVlLLEtBQUssSUFBSUwsS0FBSyxDQUFDOUksTUFBTSxLQUFLLENBQUMsRUFBRTtVQUNoRDhHLGFBQUssQ0FBQytFLFFBQVEsQ0FBQ0csU0FBUyxDQUFDbEQsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7VUFDNUMsT0FBUSxJQUFHQSxLQUFLLENBQUMsQ0FBQyxDQUFFLEtBQUlBLEtBQUssQ0FBQyxDQUFDLENBQUUsR0FBRTtRQUNyQztRQUNBLElBQUksT0FBT0EsS0FBSyxLQUFLLFFBQVEsSUFBSUEsS0FBSyxDQUFDaEYsTUFBTSxLQUFLLFVBQVUsRUFBRTtVQUM1RCxNQUFNLElBQUlnRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUM4QixZQUFZLEVBQUUsc0JBQXNCLENBQUM7UUFDekUsQ0FBQyxNQUFNO1VBQ0wvQixhQUFLLENBQUMrRSxRQUFRLENBQUNHLFNBQVMsQ0FBQ2xELEtBQUssQ0FBQ0UsUUFBUSxFQUFFRixLQUFLLENBQUNDLFNBQVMsQ0FBQztRQUMzRDtRQUNBLE9BQVEsSUFBR0QsS0FBSyxDQUFDQyxTQUFVLEtBQUlELEtBQUssQ0FBQ0UsUUFBUyxHQUFFO01BQ2xELENBQUMsQ0FBQyxDQUNEdkMsSUFBSSxDQUFDLElBQUksQ0FBQztNQUViYyxRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sb0JBQW1CQSxLQUFLLEdBQUcsQ0FBRSxXQUFVLENBQUM7TUFDaEVpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUcsSUFBR3lHLE1BQU8sR0FBRSxDQUFDO01BQ3JDN0YsS0FBSyxJQUFJLENBQUM7SUFDWjtJQUNBLElBQUlxQixVQUFVLENBQUMwRSxjQUFjLElBQUkxRSxVQUFVLENBQUMwRSxjQUFjLENBQUNDLE1BQU0sRUFBRTtNQUNqRSxNQUFNekQsS0FBSyxHQUFHbEIsVUFBVSxDQUFDMEUsY0FBYyxDQUFDQyxNQUFNO01BQzlDLElBQUksT0FBT3pELEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssQ0FBQ2hGLE1BQU0sS0FBSyxVQUFVLEVBQUU7UUFDNUQsTUFBTSxJQUFJZ0QsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhCLFlBQVksRUFDeEIsb0RBQW9ELENBQ3JEO01BQ0gsQ0FBQyxNQUFNO1FBQ0wvQixhQUFLLENBQUMrRSxRQUFRLENBQUNHLFNBQVMsQ0FBQ2xELEtBQUssQ0FBQ0UsUUFBUSxFQUFFRixLQUFLLENBQUNDLFNBQVMsQ0FBQztNQUMzRDtNQUNBeEIsUUFBUSxDQUFDN0gsSUFBSSxDQUFFLElBQUc2RyxLQUFNLHNCQUFxQkEsS0FBSyxHQUFHLENBQUUsU0FBUSxDQUFDO01BQ2hFaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxFQUFHLElBQUdtRCxLQUFLLENBQUNDLFNBQVUsS0FBSUQsS0FBSyxDQUFDRSxRQUFTLEdBQUUsQ0FBQztNQUNqRXpDLEtBQUssSUFBSSxDQUFDO0lBQ1o7SUFFQSxJQUFJcUIsVUFBVSxDQUFDSyxNQUFNLEVBQUU7TUFDckIsSUFBSXVFLEtBQUssR0FBRzVFLFVBQVUsQ0FBQ0ssTUFBTTtNQUM3QixJQUFJd0UsUUFBUSxHQUFHLEdBQUc7TUFDbEIsTUFBTUMsSUFBSSxHQUFHOUUsVUFBVSxDQUFDK0UsUUFBUTtNQUNoQyxJQUFJRCxJQUFJLEVBQUU7UUFDUixJQUFJQSxJQUFJLENBQUM5RyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO1VBQzFCNkcsUUFBUSxHQUFHLElBQUk7UUFDakI7UUFDQSxJQUFJQyxJQUFJLENBQUM5RyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO1VBQzFCNEcsS0FBSyxHQUFHSSxnQkFBZ0IsQ0FBQ0osS0FBSyxDQUFDO1FBQ2pDO01BQ0Y7TUFFQSxNQUFNeEksSUFBSSxHQUFHd0MsaUJBQWlCLENBQUNiLFNBQVMsQ0FBQztNQUN6QzZHLEtBQUssR0FBR3JDLG1CQUFtQixDQUFDcUMsS0FBSyxDQUFDO01BRWxDakYsUUFBUSxDQUFDN0gsSUFBSSxDQUFFLElBQUc2RyxLQUFNLFFBQU9rRyxRQUFTLE1BQUtsRyxLQUFLLEdBQUcsQ0FBRSxPQUFNLENBQUM7TUFDOURpQixNQUFNLENBQUM5SCxJQUFJLENBQUNzRSxJQUFJLEVBQUV3SSxLQUFLLENBQUM7TUFDeEJqRyxLQUFLLElBQUksQ0FBQztJQUNaO0lBRUEsSUFBSXFCLFVBQVUsQ0FBQzlELE1BQU0sS0FBSyxTQUFTLEVBQUU7TUFDbkMsSUFBSTRELFlBQVksRUFBRTtRQUNoQkgsUUFBUSxDQUFDN0gsSUFBSSxDQUFFLG1CQUFrQjZHLEtBQU0sV0FBVUEsS0FBSyxHQUFHLENBQUUsR0FBRSxDQUFDO1FBQzlEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxFQUFFbEQsSUFBSSxDQUFDQyxTQUFTLENBQUMsQ0FBQ2tGLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDcERyQixLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTTtRQUNMZ0IsUUFBUSxDQUFDN0gsSUFBSSxDQUFFLElBQUc2RyxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztRQUMvQ2lCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWlDLFVBQVUsQ0FBQzFELFFBQVEsQ0FBQztRQUMzQ3FDLEtBQUssSUFBSSxDQUFDO01BQ1o7SUFDRjtJQUVBLElBQUlxQixVQUFVLENBQUM5RCxNQUFNLEtBQUssTUFBTSxFQUFFO01BQ2hDeUQsUUFBUSxDQUFDN0gsSUFBSSxDQUFFLElBQUc2RyxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztNQUMvQ2lCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWlDLFVBQVUsQ0FBQzdELEdBQUcsQ0FBQztNQUN0Q3dDLEtBQUssSUFBSSxDQUFDO0lBQ1o7SUFFQSxJQUFJcUIsVUFBVSxDQUFDOUQsTUFBTSxLQUFLLFVBQVUsRUFBRTtNQUNwQ3lELFFBQVEsQ0FBQzdILElBQUksQ0FBRSxJQUFHNkcsS0FBTSxtQkFBa0JBLEtBQUssR0FBRyxDQUFFLE1BQUtBLEtBQUssR0FBRyxDQUFFLEdBQUUsQ0FBQztNQUN0RWlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWlDLFVBQVUsQ0FBQ21CLFNBQVMsRUFBRW5CLFVBQVUsQ0FBQ29CLFFBQVEsQ0FBQztNQUNqRXpDLEtBQUssSUFBSSxDQUFDO0lBQ1o7SUFFQSxJQUFJcUIsVUFBVSxDQUFDOUQsTUFBTSxLQUFLLFNBQVMsRUFBRTtNQUNuQyxNQUFNdEQsS0FBSyxHQUFHcU0sbUJBQW1CLENBQUNqRixVQUFVLENBQUN5RSxXQUFXLENBQUM7TUFDekQ5RSxRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzZHLEtBQU0sYUFBWUEsS0FBSyxHQUFHLENBQUUsV0FBVSxDQUFDO01BQ3pEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxFQUFFbkYsS0FBSyxDQUFDO01BQzdCK0YsS0FBSyxJQUFJLENBQUM7SUFDWjtJQUVBcEgsTUFBTSxDQUFDRCxJQUFJLENBQUN5RCx3QkFBd0IsQ0FBQyxDQUFDekMsT0FBTyxDQUFDNE0sR0FBRyxJQUFJO01BQ25ELElBQUlsRixVQUFVLENBQUNrRixHQUFHLENBQUMsSUFBSWxGLFVBQVUsQ0FBQ2tGLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUM1QyxNQUFNQyxZQUFZLEdBQUdwSyx3QkFBd0IsQ0FBQ21LLEdBQUcsQ0FBQztRQUNsRCxJQUFJRSxhQUFhLEdBQUduSixlQUFlLENBQUMrRCxVQUFVLENBQUNrRixHQUFHLENBQUMsQ0FBQztRQUNwRCxJQUFJbkUsbUJBQW1CO1FBQ3ZCLElBQUloRCxTQUFTLENBQUNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7VUFDL0IsSUFBSXFILFFBQVE7VUFDWixRQUFRLE9BQU9ELGFBQWE7WUFDMUIsS0FBSyxRQUFRO2NBQ1hDLFFBQVEsR0FBRyxrQkFBa0I7Y0FDN0I7WUFDRixLQUFLLFNBQVM7Y0FDWkEsUUFBUSxHQUFHLFNBQVM7Y0FDcEI7WUFDRjtjQUNFQSxRQUFRLEdBQUc3TCxTQUFTO1VBQUM7VUFFekJ1SCxtQkFBbUIsR0FBR3NFLFFBQVEsR0FDekIsVUFBU3pHLGlCQUFpQixDQUFDYixTQUFTLENBQUUsUUFBT3NILFFBQVMsR0FBRSxHQUN6RHpHLGlCQUFpQixDQUFDYixTQUFTLENBQUM7UUFDbEMsQ0FBQyxNQUFNO1VBQ0wsSUFBSSxPQUFPcUgsYUFBYSxLQUFLLFFBQVEsSUFBSUEsYUFBYSxDQUFDcEUsYUFBYSxFQUFFO1lBQ3BFLElBQUk3RCxNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLENBQUNwRCxJQUFJLEtBQUssTUFBTSxFQUFFO2NBQzVDLE1BQU0sSUFBSXVFLGFBQUssQ0FBQ0MsS0FBSyxDQUNuQkQsYUFBSyxDQUFDQyxLQUFLLENBQUM4QixZQUFZLEVBQ3hCLGdEQUFnRCxDQUNqRDtZQUNIO1lBQ0EsTUFBTXFFLFlBQVksR0FBR3pMLEtBQUssQ0FBQzBMLGtCQUFrQixDQUFDSCxhQUFhLENBQUNwRSxhQUFhLENBQUM7WUFDMUUsSUFBSXNFLFlBQVksQ0FBQ0UsTUFBTSxLQUFLLFNBQVMsRUFBRTtjQUNyQ0osYUFBYSxHQUFHbkosZUFBZSxDQUFDcUosWUFBWSxDQUFDRyxNQUFNLENBQUM7WUFDdEQsQ0FBQyxNQUFNO2NBQ0xDLE9BQU8sQ0FBQ0MsS0FBSyxDQUFDLG1DQUFtQyxFQUFFTCxZQUFZLENBQUM7Y0FDaEUsTUFBTSxJQUFJcEcsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhCLFlBQVksRUFDdkIsc0JBQXFCbUUsYUFBYSxDQUFDcEUsYUFBYyxZQUFXc0UsWUFBWSxDQUFDTSxJQUFLLEVBQUMsQ0FDakY7WUFDSDtVQUNGO1VBQ0E3RSxtQkFBbUIsR0FBSSxJQUFHcEMsS0FBSyxFQUFHLE9BQU07VUFDeENpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLENBQUM7UUFDeEI7UUFDQTZCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ3NOLGFBQWEsQ0FBQztRQUMxQnpGLFFBQVEsQ0FBQzdILElBQUksQ0FBRSxHQUFFaUosbUJBQW9CLElBQUdvRSxZQUFhLEtBQUl4RyxLQUFLLEVBQUcsRUFBQyxDQUFDO01BQ3JFO0lBQ0YsQ0FBQyxDQUFDO0lBRUYsSUFBSW9CLHFCQUFxQixLQUFLSixRQUFRLENBQUN2SCxNQUFNLEVBQUU7TUFDN0MsTUFBTSxJQUFJOEcsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzBHLG1CQUFtQixFQUM5QixnREFBK0NoTCxJQUFJLENBQUNDLFNBQVMsQ0FBQ2tGLFVBQVUsQ0FBRSxFQUFDLENBQzdFO0lBQ0g7RUFDRjtFQUNBSixNQUFNLEdBQUdBLE1BQU0sQ0FBQ25CLEdBQUcsQ0FBQ3BDLGNBQWMsQ0FBQztFQUNuQyxPQUFPO0lBQUVzRSxPQUFPLEVBQUVoQixRQUFRLENBQUNkLElBQUksQ0FBQyxPQUFPLENBQUM7SUFBRWUsTUFBTTtJQUFFQztFQUFNLENBQUM7QUFDM0QsQ0FBQztBQUVNLE1BQU1pRyxzQkFBc0IsQ0FBMkI7RUFJNUQ7O0VBUUFDLFdBQVdBLENBQUM7SUFBRUMsR0FBRztJQUFFQyxnQkFBZ0IsR0FBRyxFQUFFO0lBQUVDLGVBQWUsR0FBRyxDQUFDO0VBQU8sQ0FBQyxFQUFFO0lBQ3JFLElBQUksQ0FBQ0MsaUJBQWlCLEdBQUdGLGdCQUFnQjtJQUN6QyxJQUFJLENBQUNHLGlCQUFpQixHQUFHLENBQUMsQ0FBQ0YsZUFBZSxDQUFDRSxpQkFBaUI7SUFDNUQsT0FBT0YsZUFBZSxDQUFDRSxpQkFBaUI7SUFFeEMsTUFBTTtNQUFFQyxNQUFNO01BQUVDO0lBQUksQ0FBQyxHQUFHLElBQUFDLDRCQUFZLEVBQUNQLEdBQUcsRUFBRUUsZUFBZSxDQUFDO0lBQzFELElBQUksQ0FBQ00sT0FBTyxHQUFHSCxNQUFNO0lBQ3JCLElBQUksQ0FBQ0ksU0FBUyxHQUFHLE1BQU0sQ0FBQyxDQUFDO0lBQ3pCLElBQUksQ0FBQ0MsSUFBSSxHQUFHSixHQUFHO0lBQ2YsSUFBSSxDQUFDelAsS0FBSyxHQUFHLElBQUE4UCxRQUFNLEdBQUU7SUFDckIsSUFBSSxDQUFDQyxtQkFBbUIsR0FBRyxLQUFLO0VBQ2xDO0VBRUFDLEtBQUtBLENBQUNDLFFBQW9CLEVBQVE7SUFDaEMsSUFBSSxDQUFDTCxTQUFTLEdBQUdLLFFBQVE7RUFDM0I7O0VBRUE7RUFDQUMsc0JBQXNCQSxDQUFDdEgsS0FBYSxFQUFFdUgsT0FBZ0IsR0FBRyxLQUFLLEVBQUU7SUFDOUQsSUFBSUEsT0FBTyxFQUFFO01BQ1gsT0FBTyxpQ0FBaUMsR0FBR3ZILEtBQUs7SUFDbEQsQ0FBQyxNQUFNO01BQ0wsT0FBTyx3QkFBd0IsR0FBR0EsS0FBSztJQUN6QztFQUNGO0VBRUF3SCxjQUFjQSxDQUFBLEVBQUc7SUFDZixJQUFJLElBQUksQ0FBQ0MsT0FBTyxFQUFFO01BQ2hCLElBQUksQ0FBQ0EsT0FBTyxDQUFDQyxJQUFJLEVBQUU7TUFDbkIsT0FBTyxJQUFJLENBQUNELE9BQU87SUFDckI7SUFDQSxJQUFJLENBQUMsSUFBSSxDQUFDVixPQUFPLEVBQUU7TUFDakI7SUFDRjtJQUNBLElBQUksQ0FBQ0EsT0FBTyxDQUFDWSxLQUFLLENBQUNDLEdBQUcsRUFBRTtFQUMxQjtFQUVBLE1BQU1DLGVBQWVBLENBQUEsRUFBRztJQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDSixPQUFPLElBQUksSUFBSSxDQUFDZCxpQkFBaUIsRUFBRTtNQUMzQyxJQUFJLENBQUNjLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQ1YsT0FBTyxDQUFDZSxPQUFPLENBQUM7UUFBRUMsTUFBTSxFQUFFO01BQUssQ0FBQyxDQUFDO01BQzNELElBQUksQ0FBQ04sT0FBTyxDQUFDYixNQUFNLENBQUNvQixFQUFFLENBQUMsY0FBYyxFQUFFQyxJQUFJLElBQUk7UUFDN0MsTUFBTUMsT0FBTyxHQUFHOU0sSUFBSSxDQUFDK00sS0FBSyxDQUFDRixJQUFJLENBQUNDLE9BQU8sQ0FBQztRQUN4QyxJQUFJQSxPQUFPLENBQUNFLFFBQVEsS0FBSyxJQUFJLENBQUNoUixLQUFLLEVBQUU7VUFDbkMsSUFBSSxDQUFDNFAsU0FBUyxFQUFFO1FBQ2xCO01BQ0YsQ0FBQyxDQUFDO01BQ0YsTUFBTSxJQUFJLENBQUNTLE9BQU8sQ0FBQ1ksSUFBSSxDQUFDLFlBQVksRUFBRSxlQUFlLENBQUM7SUFDeEQ7RUFDRjtFQUVBQyxtQkFBbUJBLENBQUEsRUFBRztJQUNwQixJQUFJLElBQUksQ0FBQ2IsT0FBTyxFQUFFO01BQ2hCLElBQUksQ0FBQ0EsT0FBTyxDQUNUWSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxlQUFlLEVBQUU7UUFBRUQsUUFBUSxFQUFFLElBQUksQ0FBQ2hSO01BQU0sQ0FBQyxDQUFDLENBQUMsQ0FDbkVtUixLQUFLLENBQUNyQyxLQUFLLElBQUk7UUFDZEQsT0FBTyxDQUFDbEwsR0FBRyxDQUFDLG1CQUFtQixFQUFFbUwsS0FBSyxDQUFDLENBQUMsQ0FBQztNQUMzQyxDQUFDLENBQUM7SUFDTjtFQUNGOztFQUVBLE1BQU1zQyw2QkFBNkJBLENBQUNDLElBQVMsRUFBRTtJQUM3Q0EsSUFBSSxHQUFHQSxJQUFJLElBQUksSUFBSSxDQUFDMUIsT0FBTztJQUMzQixNQUFNMEIsSUFBSSxDQUNQSixJQUFJLENBQ0gsbUlBQW1JLENBQ3BJLENBQ0FFLEtBQUssQ0FBQ3JDLEtBQUssSUFBSTtNQUNkLE1BQU1BLEtBQUs7SUFDYixDQUFDLENBQUM7RUFDTjtFQUVBLE1BQU13QyxXQUFXQSxDQUFDL0wsSUFBWSxFQUFFO0lBQzlCLE9BQU8sSUFBSSxDQUFDb0ssT0FBTyxDQUFDNEIsR0FBRyxDQUNyQiwrRUFBK0UsRUFDL0UsQ0FBQ2hNLElBQUksQ0FBQyxFQUNOaU0sQ0FBQyxJQUFJQSxDQUFDLENBQUNDLE1BQU0sQ0FDZDtFQUNIO0VBRUEsTUFBTUMsd0JBQXdCQSxDQUFDbkwsU0FBaUIsRUFBRW9MLElBQVMsRUFBRTtJQUMzRCxNQUFNLElBQUksQ0FBQ2hDLE9BQU8sQ0FBQ2lDLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxNQUFNQyxDQUFDLElBQUk7TUFDaEUsTUFBTTlJLE1BQU0sR0FBRyxDQUFDeEMsU0FBUyxFQUFFLFFBQVEsRUFBRSx1QkFBdUIsRUFBRXZDLElBQUksQ0FBQ0MsU0FBUyxDQUFDME4sSUFBSSxDQUFDLENBQUM7TUFDbkYsTUFBTUUsQ0FBQyxDQUFDWixJQUFJLENBQ1QseUdBQXdHLEVBQ3pHbEksTUFBTSxDQUNQO0lBQ0gsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDbUksbUJBQW1CLEVBQUU7RUFDNUI7RUFFQSxNQUFNWSwwQkFBMEJBLENBQzlCdkwsU0FBaUIsRUFDakJ3TCxnQkFBcUIsRUFDckJDLGVBQW9CLEdBQUcsQ0FBQyxDQUFDLEVBQ3pCeEwsTUFBVyxFQUNYNkssSUFBVSxFQUNLO0lBQ2ZBLElBQUksR0FBR0EsSUFBSSxJQUFJLElBQUksQ0FBQzFCLE9BQU87SUFDM0IsTUFBTXNDLElBQUksR0FBRyxJQUFJO0lBQ2pCLElBQUlGLGdCQUFnQixLQUFLcFAsU0FBUyxFQUFFO01BQ2xDLE9BQU91UCxPQUFPLENBQUNDLE9BQU8sRUFBRTtJQUMxQjtJQUNBLElBQUl6UixNQUFNLENBQUNELElBQUksQ0FBQ3VSLGVBQWUsQ0FBQyxDQUFDelEsTUFBTSxLQUFLLENBQUMsRUFBRTtNQUM3Q3lRLGVBQWUsR0FBRztRQUFFSSxJQUFJLEVBQUU7VUFBRUMsR0FBRyxFQUFFO1FBQUU7TUFBRSxDQUFDO0lBQ3hDO0lBQ0EsTUFBTUMsY0FBYyxHQUFHLEVBQUU7SUFDekIsTUFBTUMsZUFBZSxHQUFHLEVBQUU7SUFDMUI3UixNQUFNLENBQUNELElBQUksQ0FBQ3NSLGdCQUFnQixDQUFDLENBQUN0USxPQUFPLENBQUM4RCxJQUFJLElBQUk7TUFDNUMsTUFBTW1ELEtBQUssR0FBR3FKLGdCQUFnQixDQUFDeE0sSUFBSSxDQUFDO01BQ3BDLElBQUl5TSxlQUFlLENBQUN6TSxJQUFJLENBQUMsSUFBSW1ELEtBQUssQ0FBQ2hCLElBQUksS0FBSyxRQUFRLEVBQUU7UUFDcEQsTUFBTSxJQUFJVyxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUNrSyxhQUFhLEVBQUcsU0FBUWpOLElBQUsseUJBQXdCLENBQUM7TUFDMUY7TUFDQSxJQUFJLENBQUN5TSxlQUFlLENBQUN6TSxJQUFJLENBQUMsSUFBSW1ELEtBQUssQ0FBQ2hCLElBQUksS0FBSyxRQUFRLEVBQUU7UUFDckQsTUFBTSxJQUFJVyxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDa0ssYUFBYSxFQUN4QixTQUFRak4sSUFBSyxpQ0FBZ0MsQ0FDL0M7TUFDSDtNQUNBLElBQUltRCxLQUFLLENBQUNoQixJQUFJLEtBQUssUUFBUSxFQUFFO1FBQzNCNEssY0FBYyxDQUFDclIsSUFBSSxDQUFDc0UsSUFBSSxDQUFDO1FBQ3pCLE9BQU95TSxlQUFlLENBQUN6TSxJQUFJLENBQUM7TUFDOUIsQ0FBQyxNQUFNO1FBQ0w3RSxNQUFNLENBQUNELElBQUksQ0FBQ2lJLEtBQUssQ0FBQyxDQUFDakgsT0FBTyxDQUFDQyxHQUFHLElBQUk7VUFDaEMsSUFBSSxDQUFDaEIsTUFBTSxDQUFDK1IsU0FBUyxDQUFDQyxjQUFjLENBQUM3UCxJQUFJLENBQUMyRCxNQUFNLEVBQUU5RSxHQUFHLENBQUMsRUFBRTtZQUN0RCxNQUFNLElBQUkyRyxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDa0ssYUFBYSxFQUN4QixTQUFROVEsR0FBSSxvQ0FBbUMsQ0FDakQ7VUFDSDtRQUNGLENBQUMsQ0FBQztRQUNGc1EsZUFBZSxDQUFDek0sSUFBSSxDQUFDLEdBQUdtRCxLQUFLO1FBQzdCNkosZUFBZSxDQUFDdFIsSUFBSSxDQUFDO1VBQ25CUyxHQUFHLEVBQUVnSCxLQUFLO1VBQ1ZuRDtRQUNGLENBQUMsQ0FBQztNQUNKO0lBQ0YsQ0FBQyxDQUFDO0lBQ0YsTUFBTThMLElBQUksQ0FBQ3NCLEVBQUUsQ0FBQyxnQ0FBZ0MsRUFBRSxNQUFNZCxDQUFDLElBQUk7TUFDekQsSUFBSVUsZUFBZSxDQUFDaFIsTUFBTSxHQUFHLENBQUMsRUFBRTtRQUM5QixNQUFNMFEsSUFBSSxDQUFDVyxhQUFhLENBQUNyTSxTQUFTLEVBQUVnTSxlQUFlLEVBQUVWLENBQUMsQ0FBQztNQUN6RDtNQUNBLElBQUlTLGNBQWMsQ0FBQy9RLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDN0IsTUFBTTBRLElBQUksQ0FBQ1ksV0FBVyxDQUFDdE0sU0FBUyxFQUFFK0wsY0FBYyxFQUFFVCxDQUFDLENBQUM7TUFDdEQ7TUFDQSxNQUFNQSxDQUFDLENBQUNaLElBQUksQ0FDVix5R0FBeUcsRUFDekcsQ0FBQzFLLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFdkMsSUFBSSxDQUFDQyxTQUFTLENBQUMrTixlQUFlLENBQUMsQ0FBQyxDQUNsRTtJQUNILENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ2QsbUJBQW1CLEVBQUU7RUFDNUI7RUFFQSxNQUFNNEIsV0FBV0EsQ0FBQ3ZNLFNBQWlCLEVBQUVELE1BQWtCLEVBQUUrSyxJQUFVLEVBQUU7SUFDbkVBLElBQUksR0FBR0EsSUFBSSxJQUFJLElBQUksQ0FBQzFCLE9BQU87SUFDM0IsTUFBTW9ELFdBQVcsR0FBRyxNQUFNMUIsSUFBSSxDQUMzQnNCLEVBQUUsQ0FBQyxjQUFjLEVBQUUsTUFBTWQsQ0FBQyxJQUFJO01BQzdCLE1BQU0sSUFBSSxDQUFDbUIsV0FBVyxDQUFDek0sU0FBUyxFQUFFRCxNQUFNLEVBQUV1TCxDQUFDLENBQUM7TUFDNUMsTUFBTUEsQ0FBQyxDQUFDWixJQUFJLENBQ1Ysc0dBQXNHLEVBQ3RHO1FBQUUxSyxTQUFTO1FBQUVEO01BQU8sQ0FBQyxDQUN0QjtNQUNELE1BQU0sSUFBSSxDQUFDd0wsMEJBQTBCLENBQUN2TCxTQUFTLEVBQUVELE1BQU0sQ0FBQ1EsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFUixNQUFNLENBQUNFLE1BQU0sRUFBRXFMLENBQUMsQ0FBQztNQUN0RixPQUFPeEwsYUFBYSxDQUFDQyxNQUFNLENBQUM7SUFDOUIsQ0FBQyxDQUFDLENBQ0Q2SyxLQUFLLENBQUM4QixHQUFHLElBQUk7TUFDWixJQUFJQSxHQUFHLENBQUNDLElBQUksS0FBSzdQLGlDQUFpQyxJQUFJNFAsR0FBRyxDQUFDRSxNQUFNLENBQUMvSyxRQUFRLENBQUM3QixTQUFTLENBQUMsRUFBRTtRQUNwRixNQUFNLElBQUk4QixhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUM4SyxlQUFlLEVBQUcsU0FBUTdNLFNBQVUsa0JBQWlCLENBQUM7TUFDMUY7TUFDQSxNQUFNME0sR0FBRztJQUNYLENBQUMsQ0FBQztJQUNKLElBQUksQ0FBQy9CLG1CQUFtQixFQUFFO0lBQzFCLE9BQU82QixXQUFXO0VBQ3BCOztFQUVBO0VBQ0EsTUFBTUMsV0FBV0EsQ0FBQ3pNLFNBQWlCLEVBQUVELE1BQWtCLEVBQUUrSyxJQUFTLEVBQUU7SUFDbEVBLElBQUksR0FBR0EsSUFBSSxJQUFJLElBQUksQ0FBQzFCLE9BQU87SUFDM0JwTSxLQUFLLENBQUMsYUFBYSxDQUFDO0lBQ3BCLE1BQU04UCxXQUFXLEdBQUcsRUFBRTtJQUN0QixNQUFNQyxhQUFhLEdBQUcsRUFBRTtJQUN4QixNQUFNOU0sTUFBTSxHQUFHOUYsTUFBTSxDQUFDNlMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFak4sTUFBTSxDQUFDRSxNQUFNLENBQUM7SUFDL0MsSUFBSUQsU0FBUyxLQUFLLE9BQU8sRUFBRTtNQUN6QkMsTUFBTSxDQUFDZ04sOEJBQThCLEdBQUc7UUFBRTFQLElBQUksRUFBRTtNQUFPLENBQUM7TUFDeEQwQyxNQUFNLENBQUNpTixtQkFBbUIsR0FBRztRQUFFM1AsSUFBSSxFQUFFO01BQVMsQ0FBQztNQUMvQzBDLE1BQU0sQ0FBQ2tOLDJCQUEyQixHQUFHO1FBQUU1UCxJQUFJLEVBQUU7TUFBTyxDQUFDO01BQ3JEMEMsTUFBTSxDQUFDbU4sbUJBQW1CLEdBQUc7UUFBRTdQLElBQUksRUFBRTtNQUFTLENBQUM7TUFDL0MwQyxNQUFNLENBQUNvTixpQkFBaUIsR0FBRztRQUFFOVAsSUFBSSxFQUFFO01BQVMsQ0FBQztNQUM3QzBDLE1BQU0sQ0FBQ3FOLDRCQUE0QixHQUFHO1FBQUUvUCxJQUFJLEVBQUU7TUFBTyxDQUFDO01BQ3REMEMsTUFBTSxDQUFDc04sb0JBQW9CLEdBQUc7UUFBRWhRLElBQUksRUFBRTtNQUFPLENBQUM7TUFDOUMwQyxNQUFNLENBQUNRLGlCQUFpQixHQUFHO1FBQUVsRCxJQUFJLEVBQUU7TUFBUSxDQUFDO0lBQzlDO0lBQ0EsSUFBSWdFLEtBQUssR0FBRyxDQUFDO0lBQ2IsTUFBTWlNLFNBQVMsR0FBRyxFQUFFO0lBQ3BCclQsTUFBTSxDQUFDRCxJQUFJLENBQUMrRixNQUFNLENBQUMsQ0FBQy9FLE9BQU8sQ0FBQ3lGLFNBQVMsSUFBSTtNQUN2QyxNQUFNOE0sU0FBUyxHQUFHeE4sTUFBTSxDQUFDVSxTQUFTLENBQUM7TUFDbkM7TUFDQTtNQUNBLElBQUk4TSxTQUFTLENBQUNsUSxJQUFJLEtBQUssVUFBVSxFQUFFO1FBQ2pDaVEsU0FBUyxDQUFDOVMsSUFBSSxDQUFDaUcsU0FBUyxDQUFDO1FBQ3pCO01BQ0Y7TUFDQSxJQUFJLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDQyxPQUFPLENBQUNELFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNoRDhNLFNBQVMsQ0FBQ2pRLFFBQVEsR0FBRztVQUFFRCxJQUFJLEVBQUU7UUFBUyxDQUFDO01BQ3pDO01BQ0F1UCxXQUFXLENBQUNwUyxJQUFJLENBQUNpRyxTQUFTLENBQUM7TUFDM0JtTSxXQUFXLENBQUNwUyxJQUFJLENBQUM0Qyx1QkFBdUIsQ0FBQ21RLFNBQVMsQ0FBQyxDQUFDO01BQ3BEVixhQUFhLENBQUNyUyxJQUFJLENBQUUsSUFBRzZHLEtBQU0sVUFBU0EsS0FBSyxHQUFHLENBQUUsTUFBSyxDQUFDO01BQ3RELElBQUlaLFNBQVMsS0FBSyxVQUFVLEVBQUU7UUFDNUJvTSxhQUFhLENBQUNyUyxJQUFJLENBQUUsaUJBQWdCNkcsS0FBTSxRQUFPLENBQUM7TUFDcEQ7TUFDQUEsS0FBSyxHQUFHQSxLQUFLLEdBQUcsQ0FBQztJQUNuQixDQUFDLENBQUM7SUFDRixNQUFNbU0sRUFBRSxHQUFJLHVDQUFzQ1gsYUFBYSxDQUFDdEwsSUFBSSxFQUFHLEdBQUU7SUFDekUsTUFBTWUsTUFBTSxHQUFHLENBQUN4QyxTQUFTLEVBQUUsR0FBRzhNLFdBQVcsQ0FBQztJQUUxQyxPQUFPaEMsSUFBSSxDQUFDTyxJQUFJLENBQUMsY0FBYyxFQUFFLE1BQU1DLENBQUMsSUFBSTtNQUMxQyxJQUFJO1FBQ0YsTUFBTUEsQ0FBQyxDQUFDWixJQUFJLENBQUNnRCxFQUFFLEVBQUVsTCxNQUFNLENBQUM7TUFDMUIsQ0FBQyxDQUFDLE9BQU8rRixLQUFLLEVBQUU7UUFDZCxJQUFJQSxLQUFLLENBQUNvRSxJQUFJLEtBQUtoUSw4QkFBOEIsRUFBRTtVQUNqRCxNQUFNNEwsS0FBSztRQUNiO1FBQ0E7TUFDRjs7TUFDQSxNQUFNK0MsQ0FBQyxDQUFDYyxFQUFFLENBQUMsaUJBQWlCLEVBQUVBLEVBQUUsSUFBSTtRQUNsQyxPQUFPQSxFQUFFLENBQUN1QixLQUFLLENBQ2JILFNBQVMsQ0FBQ25NLEdBQUcsQ0FBQ1YsU0FBUyxJQUFJO1VBQ3pCLE9BQU95TCxFQUFFLENBQUMxQixJQUFJLENBQ1oseUlBQXlJLEVBQ3pJO1lBQUVrRCxTQUFTLEVBQUcsU0FBUWpOLFNBQVUsSUFBR1gsU0FBVTtVQUFFLENBQUMsQ0FDakQ7UUFDSCxDQUFDLENBQUMsQ0FDSDtNQUNILENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQztFQUNKO0VBRUEsTUFBTTZOLGFBQWFBLENBQUM3TixTQUFpQixFQUFFRCxNQUFrQixFQUFFK0ssSUFBUyxFQUFFO0lBQ3BFOU4sS0FBSyxDQUFDLGVBQWUsQ0FBQztJQUN0QjhOLElBQUksR0FBR0EsSUFBSSxJQUFJLElBQUksQ0FBQzFCLE9BQU87SUFDM0IsTUFBTXNDLElBQUksR0FBRyxJQUFJO0lBRWpCLE1BQU1aLElBQUksQ0FBQ08sSUFBSSxDQUFDLGdCQUFnQixFQUFFLE1BQU1DLENBQUMsSUFBSTtNQUMzQyxNQUFNd0MsT0FBTyxHQUFHLE1BQU14QyxDQUFDLENBQUNqSyxHQUFHLENBQ3pCLG9GQUFvRixFQUNwRjtRQUFFckI7TUFBVSxDQUFDLEVBQ2JpTCxDQUFDLElBQUlBLENBQUMsQ0FBQzhDLFdBQVcsQ0FDbkI7TUFDRCxNQUFNQyxVQUFVLEdBQUc3VCxNQUFNLENBQUNELElBQUksQ0FBQzZGLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDLENBQzFDM0YsTUFBTSxDQUFDMlQsSUFBSSxJQUFJSCxPQUFPLENBQUNsTixPQUFPLENBQUNxTixJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUM1QzVNLEdBQUcsQ0FBQ1YsU0FBUyxJQUFJK0ssSUFBSSxDQUFDd0MsbUJBQW1CLENBQUNsTyxTQUFTLEVBQUVXLFNBQVMsRUFBRVosTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxDQUFDLENBQUM7TUFFN0YsTUFBTTJLLENBQUMsQ0FBQ3FDLEtBQUssQ0FBQ0ssVUFBVSxDQUFDO0lBQzNCLENBQUMsQ0FBQztFQUNKO0VBRUEsTUFBTUUsbUJBQW1CQSxDQUFDbE8sU0FBaUIsRUFBRVcsU0FBaUIsRUFBRXBELElBQVMsRUFBRTtJQUN6RTtJQUNBUCxLQUFLLENBQUMscUJBQXFCLENBQUM7SUFDNUIsTUFBTTBPLElBQUksR0FBRyxJQUFJO0lBQ2pCLE1BQU0sSUFBSSxDQUFDdEMsT0FBTyxDQUFDZ0QsRUFBRSxDQUFDLHlCQUF5QixFQUFFLE1BQU1kLENBQUMsSUFBSTtNQUMxRCxJQUFJL04sSUFBSSxDQUFDQSxJQUFJLEtBQUssVUFBVSxFQUFFO1FBQzVCLElBQUk7VUFDRixNQUFNK04sQ0FBQyxDQUFDWixJQUFJLENBQ1YsOEZBQThGLEVBQzlGO1lBQ0UxSyxTQUFTO1lBQ1RXLFNBQVM7WUFDVHdOLFlBQVksRUFBRTdRLHVCQUF1QixDQUFDQyxJQUFJO1VBQzVDLENBQUMsQ0FDRjtRQUNILENBQUMsQ0FBQyxPQUFPZ0wsS0FBSyxFQUFFO1VBQ2QsSUFBSUEsS0FBSyxDQUFDb0UsSUFBSSxLQUFLalEsaUNBQWlDLEVBQUU7WUFDcEQsT0FBT2dQLElBQUksQ0FBQ2EsV0FBVyxDQUFDdk0sU0FBUyxFQUFFO2NBQUVDLE1BQU0sRUFBRTtnQkFBRSxDQUFDVSxTQUFTLEdBQUdwRDtjQUFLO1lBQUUsQ0FBQyxFQUFFK04sQ0FBQyxDQUFDO1VBQzFFO1VBQ0EsSUFBSS9DLEtBQUssQ0FBQ29FLElBQUksS0FBSy9QLDRCQUE0QixFQUFFO1lBQy9DLE1BQU0yTCxLQUFLO1VBQ2I7VUFDQTtRQUNGO01BQ0YsQ0FBQyxNQUFNO1FBQ0wsTUFBTStDLENBQUMsQ0FBQ1osSUFBSSxDQUNWLHlJQUF5SSxFQUN6STtVQUFFa0QsU0FBUyxFQUFHLFNBQVFqTixTQUFVLElBQUdYLFNBQVU7UUFBRSxDQUFDLENBQ2pEO01BQ0g7TUFFQSxNQUFNcUksTUFBTSxHQUFHLE1BQU1pRCxDQUFDLENBQUM4QyxHQUFHLENBQ3hCLDRIQUE0SCxFQUM1SDtRQUFFcE8sU0FBUztRQUFFVztNQUFVLENBQUMsQ0FDekI7TUFFRCxJQUFJMEgsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFO1FBQ2IsTUFBTSw4Q0FBOEM7TUFDdEQsQ0FBQyxNQUFNO1FBQ0wsTUFBTWdHLElBQUksR0FBSSxXQUFVMU4sU0FBVSxHQUFFO1FBQ3BDLE1BQU0ySyxDQUFDLENBQUNaLElBQUksQ0FDVixxR0FBcUcsRUFDckc7VUFBRTJELElBQUk7VUFBRTlRLElBQUk7VUFBRXlDO1FBQVUsQ0FBQyxDQUMxQjtNQUNIO0lBQ0YsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDMkssbUJBQW1CLEVBQUU7RUFDNUI7RUFFQSxNQUFNMkQsa0JBQWtCQSxDQUFDdE8sU0FBaUIsRUFBRVcsU0FBaUIsRUFBRXBELElBQVMsRUFBRTtJQUN4RSxNQUFNLElBQUksQ0FBQzZMLE9BQU8sQ0FBQ2dELEVBQUUsQ0FBQyw2QkFBNkIsRUFBRSxNQUFNZCxDQUFDLElBQUk7TUFDOUQsTUFBTStDLElBQUksR0FBSSxXQUFVMU4sU0FBVSxHQUFFO01BQ3BDLE1BQU0ySyxDQUFDLENBQUNaLElBQUksQ0FDVixxR0FBcUcsRUFDckc7UUFBRTJELElBQUk7UUFBRTlRLElBQUk7UUFBRXlDO01BQVUsQ0FBQyxDQUMxQjtJQUNILENBQUMsQ0FBQztFQUNKOztFQUVBO0VBQ0E7RUFDQSxNQUFNdU8sV0FBV0EsQ0FBQ3ZPLFNBQWlCLEVBQUU7SUFDbkMsTUFBTXdPLFVBQVUsR0FBRyxDQUNqQjtNQUFFbk0sS0FBSyxFQUFHLDhCQUE2QjtNQUFFRyxNQUFNLEVBQUUsQ0FBQ3hDLFNBQVM7SUFBRSxDQUFDLEVBQzlEO01BQ0VxQyxLQUFLLEVBQUcsOENBQTZDO01BQ3JERyxNQUFNLEVBQUUsQ0FBQ3hDLFNBQVM7SUFDcEIsQ0FBQyxDQUNGO0lBQ0QsTUFBTXlPLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQ3JGLE9BQU8sQ0FDaENnRCxFQUFFLENBQUNkLENBQUMsSUFBSUEsQ0FBQyxDQUFDWixJQUFJLENBQUMsSUFBSSxDQUFDcEIsSUFBSSxDQUFDb0YsT0FBTyxDQUFDeFIsTUFBTSxDQUFDc1IsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUNyREcsSUFBSSxDQUFDLE1BQU0zTyxTQUFTLENBQUNZLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDOztJQUVqRCxJQUFJLENBQUMrSixtQkFBbUIsRUFBRTtJQUMxQixPQUFPOEQsUUFBUTtFQUNqQjs7RUFFQTtFQUNBLE1BQU1HLGdCQUFnQkEsQ0FBQSxFQUFHO0lBQ3ZCLE1BQU1DLEdBQUcsR0FBRyxJQUFJQyxJQUFJLEVBQUUsQ0FBQ0MsT0FBTyxFQUFFO0lBQ2hDLE1BQU1MLE9BQU8sR0FBRyxJQUFJLENBQUNwRixJQUFJLENBQUNvRixPQUFPO0lBQ2pDMVIsS0FBSyxDQUFDLGtCQUFrQixDQUFDO0lBRXpCLE1BQU0sSUFBSSxDQUFDb00sT0FBTyxDQUNmaUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLE1BQU1DLENBQUMsSUFBSTtNQUNyQyxJQUFJO1FBQ0YsTUFBTTBELE9BQU8sR0FBRyxNQUFNMUQsQ0FBQyxDQUFDOEMsR0FBRyxDQUFDLHlCQUF5QixDQUFDO1FBQ3RELE1BQU1hLEtBQUssR0FBR0QsT0FBTyxDQUFDRSxNQUFNLENBQUMsQ0FBQ2hOLElBQW1CLEVBQUVuQyxNQUFXLEtBQUs7VUFDakUsT0FBT21DLElBQUksQ0FBQ2hGLE1BQU0sQ0FBQytFLG1CQUFtQixDQUFDbEMsTUFBTSxDQUFDQSxNQUFNLENBQUMsQ0FBQztRQUN4RCxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ04sTUFBTW9QLE9BQU8sR0FBRyxDQUNkLFNBQVMsRUFDVCxhQUFhLEVBQ2IsWUFBWSxFQUNaLGNBQWMsRUFDZCxRQUFRLEVBQ1IsZUFBZSxFQUNmLGdCQUFnQixFQUNoQixXQUFXLEVBQ1gsY0FBYyxFQUNkLEdBQUdILE9BQU8sQ0FBQzNOLEdBQUcsQ0FBQ2dILE1BQU0sSUFBSUEsTUFBTSxDQUFDckksU0FBUyxDQUFDLEVBQzFDLEdBQUdpUCxLQUFLLENBQ1Q7UUFDRCxNQUFNRyxPQUFPLEdBQUdELE9BQU8sQ0FBQzlOLEdBQUcsQ0FBQ3JCLFNBQVMsS0FBSztVQUN4Q3FDLEtBQUssRUFBRSx3Q0FBd0M7VUFDL0NHLE1BQU0sRUFBRTtZQUFFeEM7VUFBVTtRQUN0QixDQUFDLENBQUMsQ0FBQztRQUNILE1BQU1zTCxDQUFDLENBQUNjLEVBQUUsQ0FBQ0EsRUFBRSxJQUFJQSxFQUFFLENBQUMxQixJQUFJLENBQUNnRSxPQUFPLENBQUN4UixNQUFNLENBQUNrUyxPQUFPLENBQUMsQ0FBQyxDQUFDO01BQ3BELENBQUMsQ0FBQyxPQUFPN0csS0FBSyxFQUFFO1FBQ2QsSUFBSUEsS0FBSyxDQUFDb0UsSUFBSSxLQUFLalEsaUNBQWlDLEVBQUU7VUFDcEQsTUFBTTZMLEtBQUs7UUFDYjtRQUNBO01BQ0Y7SUFDRixDQUFDLENBQUMsQ0FDRG9HLElBQUksQ0FBQyxNQUFNO01BQ1YzUixLQUFLLENBQUUsNEJBQTJCLElBQUk4UixJQUFJLEVBQUUsQ0FBQ0MsT0FBTyxFQUFFLEdBQUdGLEdBQUksRUFBQyxDQUFDO0lBQ2pFLENBQUMsQ0FBQztFQUNOOztFQUVBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBOztFQUVBO0VBQ0E7RUFDQTs7RUFFQTtFQUNBLE1BQU1RLFlBQVlBLENBQUNyUCxTQUFpQixFQUFFRCxNQUFrQixFQUFFdVAsVUFBb0IsRUFBaUI7SUFDN0Z0UyxLQUFLLENBQUMsY0FBYyxDQUFDO0lBQ3JCc1MsVUFBVSxHQUFHQSxVQUFVLENBQUNKLE1BQU0sQ0FBQyxDQUFDaE4sSUFBbUIsRUFBRXZCLFNBQWlCLEtBQUs7TUFDekUsTUFBTXdCLEtBQUssR0FBR3BDLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDVSxTQUFTLENBQUM7TUFDdEMsSUFBSXdCLEtBQUssQ0FBQzVFLElBQUksS0FBSyxVQUFVLEVBQUU7UUFDN0IyRSxJQUFJLENBQUN4SCxJQUFJLENBQUNpRyxTQUFTLENBQUM7TUFDdEI7TUFDQSxPQUFPWixNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDO01BQy9CLE9BQU91QixJQUFJO0lBQ2IsQ0FBQyxFQUFFLEVBQUUsQ0FBQztJQUVOLE1BQU1NLE1BQU0sR0FBRyxDQUFDeEMsU0FBUyxFQUFFLEdBQUdzUCxVQUFVLENBQUM7SUFDekMsTUFBTXhCLE9BQU8sR0FBR3dCLFVBQVUsQ0FDdkJqTyxHQUFHLENBQUMsQ0FBQ3JDLElBQUksRUFBRXVRLEdBQUcsS0FBSztNQUNsQixPQUFRLElBQUdBLEdBQUcsR0FBRyxDQUFFLE9BQU07SUFDM0IsQ0FBQyxDQUFDLENBQ0Q5TixJQUFJLENBQUMsZUFBZSxDQUFDO0lBRXhCLE1BQU0sSUFBSSxDQUFDMkgsT0FBTyxDQUFDZ0QsRUFBRSxDQUFDLGVBQWUsRUFBRSxNQUFNZCxDQUFDLElBQUk7TUFDaEQsTUFBTUEsQ0FBQyxDQUFDWixJQUFJLENBQUMsNEVBQTRFLEVBQUU7UUFDekYzSyxNQUFNO1FBQ05DO01BQ0YsQ0FBQyxDQUFDO01BQ0YsSUFBSXdDLE1BQU0sQ0FBQ3hILE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDckIsTUFBTXNRLENBQUMsQ0FBQ1osSUFBSSxDQUFFLDZDQUE0Q29ELE9BQVEsRUFBQyxFQUFFdEwsTUFBTSxDQUFDO01BQzlFO0lBQ0YsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDbUksbUJBQW1CLEVBQUU7RUFDNUI7O0VBRUE7RUFDQTtFQUNBO0VBQ0EsTUFBTTZFLGFBQWFBLENBQUEsRUFBRztJQUNwQixPQUFPLElBQUksQ0FBQ3BHLE9BQU8sQ0FBQ2lDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxNQUFNQyxDQUFDLElBQUk7TUFDckQsT0FBTyxNQUFNQSxDQUFDLENBQUNqSyxHQUFHLENBQUMseUJBQXlCLEVBQUUsSUFBSSxFQUFFb08sR0FBRyxJQUNyRDNQLGFBQWEsQ0FBQWxGLGFBQUE7UUFBR29GLFNBQVMsRUFBRXlQLEdBQUcsQ0FBQ3pQO01BQVMsR0FBS3lQLEdBQUcsQ0FBQzFQLE1BQU0sRUFBRyxDQUMzRDtJQUNILENBQUMsQ0FBQztFQUNKOztFQUVBO0VBQ0E7RUFDQTtFQUNBLE1BQU0yUCxRQUFRQSxDQUFDMVAsU0FBaUIsRUFBRTtJQUNoQ2hELEtBQUssQ0FBQyxVQUFVLENBQUM7SUFDakIsT0FBTyxJQUFJLENBQUNvTSxPQUFPLENBQ2hCZ0YsR0FBRyxDQUFDLDBEQUEwRCxFQUFFO01BQy9EcE87SUFDRixDQUFDLENBQUMsQ0FDRDJPLElBQUksQ0FBQ3RHLE1BQU0sSUFBSTtNQUNkLElBQUlBLE1BQU0sQ0FBQ3JOLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDdkIsTUFBTW9CLFNBQVM7TUFDakI7TUFDQSxPQUFPaU0sTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDdEksTUFBTTtJQUN6QixDQUFDLENBQUMsQ0FDRDRPLElBQUksQ0FBQzdPLGFBQWEsQ0FBQztFQUN4Qjs7RUFFQTtFQUNBLE1BQU02UCxZQUFZQSxDQUNoQjNQLFNBQWlCLEVBQ2pCRCxNQUFrQixFQUNsQi9GLE1BQVcsRUFDWDRWLG9CQUEwQixFQUMxQjtJQUNBNVMsS0FBSyxDQUFDLGNBQWMsQ0FBQztJQUNyQixJQUFJNlMsWUFBWSxHQUFHLEVBQUU7SUFDckIsTUFBTS9DLFdBQVcsR0FBRyxFQUFFO0lBQ3RCL00sTUFBTSxHQUFHUyxnQkFBZ0IsQ0FBQ1QsTUFBTSxDQUFDO0lBQ2pDLE1BQU0rUCxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBRXBCOVYsTUFBTSxHQUFHMEcsZUFBZSxDQUFDMUcsTUFBTSxDQUFDO0lBRWhDNEgsWUFBWSxDQUFDNUgsTUFBTSxDQUFDO0lBRXBCRyxNQUFNLENBQUNELElBQUksQ0FBQ0YsTUFBTSxDQUFDLENBQUNrQixPQUFPLENBQUN5RixTQUFTLElBQUk7TUFDdkMsSUFBSTNHLE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQyxLQUFLLElBQUksRUFBRTtRQUM5QjtNQUNGO01BQ0EsSUFBSW1DLGFBQWEsR0FBR25DLFNBQVMsQ0FBQ29DLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQztNQUNuRSxJQUFJRCxhQUFhLEVBQUU7UUFDakIsSUFBSWlOLFFBQVEsR0FBR2pOLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDL0I5SSxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUdBLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0NBLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQytWLFFBQVEsQ0FBQyxHQUFHL1YsTUFBTSxDQUFDMkcsU0FBUyxDQUFDO1FBQ2hELE9BQU8zRyxNQUFNLENBQUMyRyxTQUFTLENBQUM7UUFDeEJBLFNBQVMsR0FBRyxVQUFVO01BQ3hCO01BRUFrUCxZQUFZLENBQUNuVixJQUFJLENBQUNpRyxTQUFTLENBQUM7TUFDNUIsSUFBSSxDQUFDWixNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLElBQUlYLFNBQVMsS0FBSyxPQUFPLEVBQUU7UUFDdEQsSUFDRVcsU0FBUyxLQUFLLHFCQUFxQixJQUNuQ0EsU0FBUyxLQUFLLHFCQUFxQixJQUNuQ0EsU0FBUyxLQUFLLG1CQUFtQixJQUNqQ0EsU0FBUyxLQUFLLG1CQUFtQixFQUNqQztVQUNBbU0sV0FBVyxDQUFDcFMsSUFBSSxDQUFDVixNQUFNLENBQUMyRyxTQUFTLENBQUMsQ0FBQztRQUNyQztRQUVBLElBQUlBLFNBQVMsS0FBSyxnQ0FBZ0MsRUFBRTtVQUNsRCxJQUFJM0csTUFBTSxDQUFDMkcsU0FBUyxDQUFDLEVBQUU7WUFDckJtTSxXQUFXLENBQUNwUyxJQUFJLENBQUNWLE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQyxDQUFDNUIsR0FBRyxDQUFDO1VBQ3pDLENBQUMsTUFBTTtZQUNMK04sV0FBVyxDQUFDcFMsSUFBSSxDQUFDLElBQUksQ0FBQztVQUN4QjtRQUNGO1FBRUEsSUFDRWlHLFNBQVMsS0FBSyw2QkFBNkIsSUFDM0NBLFNBQVMsS0FBSyw4QkFBOEIsSUFDNUNBLFNBQVMsS0FBSyxzQkFBc0IsRUFDcEM7VUFDQSxJQUFJM0csTUFBTSxDQUFDMkcsU0FBUyxDQUFDLEVBQUU7WUFDckJtTSxXQUFXLENBQUNwUyxJQUFJLENBQUNWLE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQyxDQUFDNUIsR0FBRyxDQUFDO1VBQ3pDLENBQUMsTUFBTTtZQUNMK04sV0FBVyxDQUFDcFMsSUFBSSxDQUFDLElBQUksQ0FBQztVQUN4QjtRQUNGO1FBQ0E7TUFDRjtNQUNBLFFBQVFxRixNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLENBQUNwRCxJQUFJO1FBQ25DLEtBQUssTUFBTTtVQUNULElBQUl2RCxNQUFNLENBQUMyRyxTQUFTLENBQUMsRUFBRTtZQUNyQm1NLFdBQVcsQ0FBQ3BTLElBQUksQ0FBQ1YsTUFBTSxDQUFDMkcsU0FBUyxDQUFDLENBQUM1QixHQUFHLENBQUM7VUFDekMsQ0FBQyxNQUFNO1lBQ0wrTixXQUFXLENBQUNwUyxJQUFJLENBQUMsSUFBSSxDQUFDO1VBQ3hCO1VBQ0E7UUFDRixLQUFLLFNBQVM7VUFDWm9TLFdBQVcsQ0FBQ3BTLElBQUksQ0FBQ1YsTUFBTSxDQUFDMkcsU0FBUyxDQUFDLENBQUN6QixRQUFRLENBQUM7VUFDNUM7UUFDRixLQUFLLE9BQU87VUFDVixJQUFJLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDMEIsT0FBTyxDQUFDRCxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDaERtTSxXQUFXLENBQUNwUyxJQUFJLENBQUNWLE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQyxDQUFDO1VBQ3JDLENBQUMsTUFBTTtZQUNMbU0sV0FBVyxDQUFDcFMsSUFBSSxDQUFDK0MsSUFBSSxDQUFDQyxTQUFTLENBQUMxRCxNQUFNLENBQUMyRyxTQUFTLENBQUMsQ0FBQyxDQUFDO1VBQ3JEO1VBQ0E7UUFDRixLQUFLLFFBQVE7UUFDYixLQUFLLE9BQU87UUFDWixLQUFLLFFBQVE7UUFDYixLQUFLLFFBQVE7UUFDYixLQUFLLFNBQVM7VUFDWm1NLFdBQVcsQ0FBQ3BTLElBQUksQ0FBQ1YsTUFBTSxDQUFDMkcsU0FBUyxDQUFDLENBQUM7VUFDbkM7UUFDRixLQUFLLE1BQU07VUFDVG1NLFdBQVcsQ0FBQ3BTLElBQUksQ0FBQ1YsTUFBTSxDQUFDMkcsU0FBUyxDQUFDLENBQUMzQixJQUFJLENBQUM7VUFDeEM7UUFDRixLQUFLLFNBQVM7VUFBRTtZQUNkLE1BQU14RCxLQUFLLEdBQUdxTSxtQkFBbUIsQ0FBQzdOLE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQyxDQUFDMEcsV0FBVyxDQUFDO1lBQ2hFeUYsV0FBVyxDQUFDcFMsSUFBSSxDQUFDYyxLQUFLLENBQUM7WUFDdkI7VUFDRjtRQUNBLEtBQUssVUFBVTtVQUNiO1VBQ0FzVSxTQUFTLENBQUNuUCxTQUFTLENBQUMsR0FBRzNHLE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQztVQUN4Q2tQLFlBQVksQ0FBQ0csR0FBRyxFQUFFO1VBQ2xCO1FBQ0Y7VUFDRSxNQUFPLFFBQU9qUSxNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLENBQUNwRCxJQUFLLG9CQUFtQjtNQUFDO0lBRXRFLENBQUMsQ0FBQztJQUVGc1MsWUFBWSxHQUFHQSxZQUFZLENBQUMzUyxNQUFNLENBQUMvQyxNQUFNLENBQUNELElBQUksQ0FBQzRWLFNBQVMsQ0FBQyxDQUFDO0lBQzFELE1BQU1HLGFBQWEsR0FBR25ELFdBQVcsQ0FBQ3pMLEdBQUcsQ0FBQyxDQUFDNk8sR0FBRyxFQUFFM08sS0FBSyxLQUFLO01BQ3BELElBQUk0TyxXQUFXLEdBQUcsRUFBRTtNQUNwQixNQUFNeFAsU0FBUyxHQUFHa1AsWUFBWSxDQUFDdE8sS0FBSyxDQUFDO01BQ3JDLElBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUNYLE9BQU8sQ0FBQ0QsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ2hEd1AsV0FBVyxHQUFHLFVBQVU7TUFDMUIsQ0FBQyxNQUFNLElBQUlwUSxNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLElBQUlaLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDVSxTQUFTLENBQUMsQ0FBQ3BELElBQUksS0FBSyxPQUFPLEVBQUU7UUFDaEY0UyxXQUFXLEdBQUcsU0FBUztNQUN6QjtNQUNBLE9BQVEsSUFBRzVPLEtBQUssR0FBRyxDQUFDLEdBQUdzTyxZQUFZLENBQUM3VSxNQUFPLEdBQUVtVixXQUFZLEVBQUM7SUFDNUQsQ0FBQyxDQUFDO0lBQ0YsTUFBTUMsZ0JBQWdCLEdBQUdqVyxNQUFNLENBQUNELElBQUksQ0FBQzRWLFNBQVMsQ0FBQyxDQUFDek8sR0FBRyxDQUFDbEcsR0FBRyxJQUFJO01BQ3pELE1BQU1LLEtBQUssR0FBR3NVLFNBQVMsQ0FBQzNVLEdBQUcsQ0FBQztNQUM1QjJSLFdBQVcsQ0FBQ3BTLElBQUksQ0FBQ2MsS0FBSyxDQUFDdUksU0FBUyxFQUFFdkksS0FBSyxDQUFDd0ksUUFBUSxDQUFDO01BQ2pELE1BQU1xTSxDQUFDLEdBQUd2RCxXQUFXLENBQUM5UixNQUFNLEdBQUc2VSxZQUFZLENBQUM3VSxNQUFNO01BQ2xELE9BQVEsVUFBU3FWLENBQUUsTUFBS0EsQ0FBQyxHQUFHLENBQUUsR0FBRTtJQUNsQyxDQUFDLENBQUM7SUFFRixNQUFNQyxjQUFjLEdBQUdULFlBQVksQ0FBQ3hPLEdBQUcsQ0FBQyxDQUFDa1AsR0FBRyxFQUFFaFAsS0FBSyxLQUFNLElBQUdBLEtBQUssR0FBRyxDQUFFLE9BQU0sQ0FBQyxDQUFDRSxJQUFJLEVBQUU7SUFDcEYsTUFBTStPLGFBQWEsR0FBR1AsYUFBYSxDQUFDL1MsTUFBTSxDQUFDa1QsZ0JBQWdCLENBQUMsQ0FBQzNPLElBQUksRUFBRTtJQUVuRSxNQUFNaU0sRUFBRSxHQUFJLHdCQUF1QjRDLGNBQWUsYUFBWUUsYUFBYyxHQUFFO0lBQzlFLE1BQU1oTyxNQUFNLEdBQUcsQ0FBQ3hDLFNBQVMsRUFBRSxHQUFHNlAsWUFBWSxFQUFFLEdBQUcvQyxXQUFXLENBQUM7SUFDM0QsTUFBTTJELE9BQU8sR0FBRyxDQUFDYixvQkFBb0IsR0FBR0Esb0JBQW9CLENBQUN0RSxDQUFDLEdBQUcsSUFBSSxDQUFDbEMsT0FBTyxFQUMxRXNCLElBQUksQ0FBQ2dELEVBQUUsRUFBRWxMLE1BQU0sQ0FBQyxDQUNoQm1NLElBQUksQ0FBQyxPQUFPO01BQUUrQixHQUFHLEVBQUUsQ0FBQzFXLE1BQU07SUFBRSxDQUFDLENBQUMsQ0FBQyxDQUMvQjRRLEtBQUssQ0FBQ3JDLEtBQUssSUFBSTtNQUNkLElBQUlBLEtBQUssQ0FBQ29FLElBQUksS0FBSzdQLGlDQUFpQyxFQUFFO1FBQ3BELE1BQU00UCxHQUFHLEdBQUcsSUFBSTVLLGFBQUssQ0FBQ0MsS0FBSyxDQUN6QkQsYUFBSyxDQUFDQyxLQUFLLENBQUM4SyxlQUFlLEVBQzNCLCtEQUErRCxDQUNoRTtRQUNESCxHQUFHLENBQUNpRSxlQUFlLEdBQUdwSSxLQUFLO1FBQzNCLElBQUlBLEtBQUssQ0FBQ3FJLFVBQVUsRUFBRTtVQUNwQixNQUFNQyxPQUFPLEdBQUd0SSxLQUFLLENBQUNxSSxVQUFVLENBQUM3TixLQUFLLENBQUMsb0JBQW9CLENBQUM7VUFDNUQsSUFBSThOLE9BQU8sSUFBSTFNLEtBQUssQ0FBQ0MsT0FBTyxDQUFDeU0sT0FBTyxDQUFDLEVBQUU7WUFDckNuRSxHQUFHLENBQUNvRSxRQUFRLEdBQUc7Y0FBRUMsZ0JBQWdCLEVBQUVGLE9BQU8sQ0FBQyxDQUFDO1lBQUUsQ0FBQztVQUNqRDtRQUNGO1FBQ0F0SSxLQUFLLEdBQUdtRSxHQUFHO01BQ2I7TUFDQSxNQUFNbkUsS0FBSztJQUNiLENBQUMsQ0FBQztJQUNKLElBQUlxSCxvQkFBb0IsRUFBRTtNQUN4QkEsb0JBQW9CLENBQUNqQyxLQUFLLENBQUNqVCxJQUFJLENBQUMrVixPQUFPLENBQUM7SUFDMUM7SUFDQSxPQUFPQSxPQUFPO0VBQ2hCOztFQUVBO0VBQ0E7RUFDQTtFQUNBLE1BQU1PLG9CQUFvQkEsQ0FDeEJoUixTQUFpQixFQUNqQkQsTUFBa0IsRUFDbEJzQyxLQUFnQixFQUNoQnVOLG9CQUEwQixFQUMxQjtJQUNBNVMsS0FBSyxDQUFDLHNCQUFzQixDQUFDO0lBQzdCLE1BQU13RixNQUFNLEdBQUcsQ0FBQ3hDLFNBQVMsQ0FBQztJQUMxQixNQUFNdUIsS0FBSyxHQUFHLENBQUM7SUFDZixNQUFNMFAsS0FBSyxHQUFHN08sZ0JBQWdCLENBQUM7TUFDN0JyQyxNQUFNO01BQ053QixLQUFLO01BQ0xjLEtBQUs7TUFDTEMsZUFBZSxFQUFFO0lBQ25CLENBQUMsQ0FBQztJQUNGRSxNQUFNLENBQUM5SCxJQUFJLENBQUMsR0FBR3VXLEtBQUssQ0FBQ3pPLE1BQU0sQ0FBQztJQUM1QixJQUFJckksTUFBTSxDQUFDRCxJQUFJLENBQUNtSSxLQUFLLENBQUMsQ0FBQ3JILE1BQU0sS0FBSyxDQUFDLEVBQUU7TUFDbkNpVyxLQUFLLENBQUMxTixPQUFPLEdBQUcsTUFBTTtJQUN4QjtJQUNBLE1BQU1tSyxFQUFFLEdBQUksOENBQTZDdUQsS0FBSyxDQUFDMU4sT0FBUSw0Q0FBMkM7SUFDbEgsTUFBTWtOLE9BQU8sR0FBRyxDQUFDYixvQkFBb0IsR0FBR0Esb0JBQW9CLENBQUN0RSxDQUFDLEdBQUcsSUFBSSxDQUFDbEMsT0FBTyxFQUMxRTRCLEdBQUcsQ0FBQzBDLEVBQUUsRUFBRWxMLE1BQU0sRUFBRXlJLENBQUMsSUFBSSxDQUFDQSxDQUFDLENBQUMxTCxLQUFLLENBQUMsQ0FDOUJvUCxJQUFJLENBQUNwUCxLQUFLLElBQUk7TUFDYixJQUFJQSxLQUFLLEtBQUssQ0FBQyxFQUFFO1FBQ2YsTUFBTSxJQUFJdUMsYUFBSyxDQUFDQyxLQUFLLENBQUNELGFBQUssQ0FBQ0MsS0FBSyxDQUFDbVAsZ0JBQWdCLEVBQUUsbUJBQW1CLENBQUM7TUFDMUUsQ0FBQyxNQUFNO1FBQ0wsT0FBTzNSLEtBQUs7TUFDZDtJQUNGLENBQUMsQ0FBQyxDQUNEcUwsS0FBSyxDQUFDckMsS0FBSyxJQUFJO01BQ2QsSUFBSUEsS0FBSyxDQUFDb0UsSUFBSSxLQUFLalEsaUNBQWlDLEVBQUU7UUFDcEQsTUFBTTZMLEtBQUs7TUFDYjtNQUNBO0lBQ0YsQ0FBQyxDQUFDOztJQUNKLElBQUlxSCxvQkFBb0IsRUFBRTtNQUN4QkEsb0JBQW9CLENBQUNqQyxLQUFLLENBQUNqVCxJQUFJLENBQUMrVixPQUFPLENBQUM7SUFDMUM7SUFDQSxPQUFPQSxPQUFPO0VBQ2hCO0VBQ0E7RUFDQSxNQUFNVSxnQkFBZ0JBLENBQ3BCblIsU0FBaUIsRUFDakJELE1BQWtCLEVBQ2xCc0MsS0FBZ0IsRUFDaEI1QyxNQUFXLEVBQ1htUSxvQkFBMEIsRUFDWjtJQUNkNVMsS0FBSyxDQUFDLGtCQUFrQixDQUFDO0lBQ3pCLE9BQU8sSUFBSSxDQUFDb1Usb0JBQW9CLENBQUNwUixTQUFTLEVBQUVELE1BQU0sRUFBRXNDLEtBQUssRUFBRTVDLE1BQU0sRUFBRW1RLG9CQUFvQixDQUFDLENBQUNqQixJQUFJLENBQzNGdUIsR0FBRyxJQUFJQSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQ2Q7RUFDSDs7RUFFQTtFQUNBLE1BQU1rQixvQkFBb0JBLENBQ3hCcFIsU0FBaUIsRUFDakJELE1BQWtCLEVBQ2xCc0MsS0FBZ0IsRUFDaEI1QyxNQUFXLEVBQ1htUSxvQkFBMEIsRUFDVjtJQUNoQjVTLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQztJQUM3QixNQUFNcVUsY0FBYyxHQUFHLEVBQUU7SUFDekIsTUFBTTdPLE1BQU0sR0FBRyxDQUFDeEMsU0FBUyxDQUFDO0lBQzFCLElBQUl1QixLQUFLLEdBQUcsQ0FBQztJQUNieEIsTUFBTSxHQUFHUyxnQkFBZ0IsQ0FBQ1QsTUFBTSxDQUFDO0lBRWpDLE1BQU11UixjQUFjLEdBQUExVyxhQUFBLEtBQVE2RSxNQUFNLENBQUU7O0lBRXBDO0lBQ0EsTUFBTThSLGtCQUFrQixHQUFHLENBQUMsQ0FBQztJQUM3QnBYLE1BQU0sQ0FBQ0QsSUFBSSxDQUFDdUYsTUFBTSxDQUFDLENBQUN2RSxPQUFPLENBQUN5RixTQUFTLElBQUk7TUFDdkMsSUFBSUEsU0FBUyxDQUFDQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUU7UUFDL0IsTUFBTUMsVUFBVSxHQUFHRixTQUFTLENBQUNHLEtBQUssQ0FBQyxHQUFHLENBQUM7UUFDdkMsTUFBTUMsS0FBSyxHQUFHRixVQUFVLENBQUNHLEtBQUssRUFBRTtRQUNoQ3VRLGtCQUFrQixDQUFDeFEsS0FBSyxDQUFDLEdBQUcsSUFBSTtNQUNsQyxDQUFDLE1BQU07UUFDTHdRLGtCQUFrQixDQUFDNVEsU0FBUyxDQUFDLEdBQUcsS0FBSztNQUN2QztJQUNGLENBQUMsQ0FBQztJQUNGbEIsTUFBTSxHQUFHaUIsZUFBZSxDQUFDakIsTUFBTSxDQUFDO0lBQ2hDO0lBQ0E7SUFDQSxLQUFLLE1BQU1rQixTQUFTLElBQUlsQixNQUFNLEVBQUU7TUFDOUIsTUFBTXFELGFBQWEsR0FBR25DLFNBQVMsQ0FBQ29DLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQztNQUNyRSxJQUFJRCxhQUFhLEVBQUU7UUFDakIsSUFBSWlOLFFBQVEsR0FBR2pOLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDL0IsTUFBTXRILEtBQUssR0FBR2lFLE1BQU0sQ0FBQ2tCLFNBQVMsQ0FBQztRQUMvQixPQUFPbEIsTUFBTSxDQUFDa0IsU0FBUyxDQUFDO1FBQ3hCbEIsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHQSxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdDQSxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUNzUSxRQUFRLENBQUMsR0FBR3ZVLEtBQUs7TUFDdEM7SUFDRjtJQUVBLEtBQUssTUFBTW1GLFNBQVMsSUFBSWxCLE1BQU0sRUFBRTtNQUM5QixNQUFNbUQsVUFBVSxHQUFHbkQsTUFBTSxDQUFDa0IsU0FBUyxDQUFDO01BQ3BDO01BQ0EsSUFBSSxPQUFPaUMsVUFBVSxLQUFLLFdBQVcsRUFBRTtRQUNyQyxPQUFPbkQsTUFBTSxDQUFDa0IsU0FBUyxDQUFDO01BQzFCLENBQUMsTUFBTSxJQUFJaUMsVUFBVSxLQUFLLElBQUksRUFBRTtRQUM5QnlPLGNBQWMsQ0FBQzNXLElBQUksQ0FBRSxJQUFHNkcsS0FBTSxjQUFhLENBQUM7UUFDNUNpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLENBQUM7UUFDdEJZLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUlaLFNBQVMsSUFBSSxVQUFVLEVBQUU7UUFDbEM7UUFDQTtRQUNBLE1BQU02USxRQUFRLEdBQUdBLENBQUNDLEtBQWEsRUFBRXRXLEdBQVcsRUFBRUssS0FBVSxLQUFLO1VBQzNELE9BQVEsZ0NBQStCaVcsS0FBTSxtQkFBa0J0VyxHQUFJLEtBQUlLLEtBQU0sVUFBUztRQUN4RixDQUFDO1FBQ0QsTUFBTWtXLE9BQU8sR0FBSSxJQUFHblEsS0FBTSxPQUFNO1FBQ2hDLE1BQU1vUSxjQUFjLEdBQUdwUSxLQUFLO1FBQzVCQSxLQUFLLElBQUksQ0FBQztRQUNWaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxDQUFDO1FBQ3RCLE1BQU1sQixNQUFNLEdBQUd0RixNQUFNLENBQUNELElBQUksQ0FBQzBJLFVBQVUsQ0FBQyxDQUFDc00sTUFBTSxDQUFDLENBQUN3QyxPQUFlLEVBQUV2VyxHQUFXLEtBQUs7VUFDOUUsTUFBTXlXLEdBQUcsR0FBR0osUUFBUSxDQUFDRSxPQUFPLEVBQUcsSUFBR25RLEtBQU0sUUFBTyxFQUFHLElBQUdBLEtBQUssR0FBRyxDQUFFLFNBQVEsQ0FBQztVQUN4RUEsS0FBSyxJQUFJLENBQUM7VUFDVixJQUFJL0YsS0FBSyxHQUFHb0gsVUFBVSxDQUFDekgsR0FBRyxDQUFDO1VBQzNCLElBQUlLLEtBQUssRUFBRTtZQUNULElBQUlBLEtBQUssQ0FBQzJGLElBQUksS0FBSyxRQUFRLEVBQUU7Y0FDM0IzRixLQUFLLEdBQUcsSUFBSTtZQUNkLENBQUMsTUFBTTtjQUNMQSxLQUFLLEdBQUdpQyxJQUFJLENBQUNDLFNBQVMsQ0FBQ2xDLEtBQUssQ0FBQztZQUMvQjtVQUNGO1VBQ0FnSCxNQUFNLENBQUM5SCxJQUFJLENBQUNTLEdBQUcsRUFBRUssS0FBSyxDQUFDO1VBQ3ZCLE9BQU9vVyxHQUFHO1FBQ1osQ0FBQyxFQUFFRixPQUFPLENBQUM7UUFDWEwsY0FBYyxDQUFDM1csSUFBSSxDQUFFLElBQUdpWCxjQUFlLFdBQVVsUyxNQUFPLEVBQUMsQ0FBQztNQUM1RCxDQUFDLE1BQU0sSUFBSW1ELFVBQVUsQ0FBQ3pCLElBQUksS0FBSyxXQUFXLEVBQUU7UUFDMUNrUSxjQUFjLENBQUMzVyxJQUFJLENBQUUsSUFBRzZHLEtBQU0scUJBQW9CQSxLQUFNLGdCQUFlQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7UUFDbkZpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVpQyxVQUFVLENBQUNpUCxNQUFNLENBQUM7UUFDekN0USxLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJcUIsVUFBVSxDQUFDekIsSUFBSSxLQUFLLEtBQUssRUFBRTtRQUNwQ2tRLGNBQWMsQ0FBQzNXLElBQUksQ0FDaEIsSUFBRzZHLEtBQU0sK0JBQThCQSxLQUFNLHlCQUF3QkEsS0FBSyxHQUFHLENBQUUsVUFBUyxDQUMxRjtRQUNEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxFQUFFbEQsSUFBSSxDQUFDQyxTQUFTLENBQUNrRixVQUFVLENBQUNrUCxPQUFPLENBQUMsQ0FBQztRQUMxRHZRLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUlxQixVQUFVLENBQUN6QixJQUFJLEtBQUssUUFBUSxFQUFFO1FBQ3ZDa1EsY0FBYyxDQUFDM1csSUFBSSxDQUFFLElBQUc2RyxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztRQUNyRGlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRSxJQUFJLENBQUM7UUFDNUJZLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUlxQixVQUFVLENBQUN6QixJQUFJLEtBQUssUUFBUSxFQUFFO1FBQ3ZDa1EsY0FBYyxDQUFDM1csSUFBSSxDQUNoQixJQUFHNkcsS0FBTSxrQ0FBaUNBLEtBQU0seUJBQy9DQSxLQUFLLEdBQUcsQ0FDVCxVQUFTLENBQ1g7UUFDRGlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWxELElBQUksQ0FBQ0MsU0FBUyxDQUFDa0YsVUFBVSxDQUFDa1AsT0FBTyxDQUFDLENBQUM7UUFDMUR2USxLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJcUIsVUFBVSxDQUFDekIsSUFBSSxLQUFLLFdBQVcsRUFBRTtRQUMxQ2tRLGNBQWMsQ0FBQzNXLElBQUksQ0FDaEIsSUFBRzZHLEtBQU0sc0NBQXFDQSxLQUFNLHlCQUNuREEsS0FBSyxHQUFHLENBQ1QsVUFBUyxDQUNYO1FBQ0RpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVsRCxJQUFJLENBQUNDLFNBQVMsQ0FBQ2tGLFVBQVUsQ0FBQ2tQLE9BQU8sQ0FBQyxDQUFDO1FBQzFEdlEsS0FBSyxJQUFJLENBQUM7TUFDWixDQUFDLE1BQU0sSUFBSVosU0FBUyxLQUFLLFdBQVcsRUFBRTtRQUNwQztRQUNBMFEsY0FBYyxDQUFDM1csSUFBSSxDQUFFLElBQUc2RyxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztRQUNyRGlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWlDLFVBQVUsQ0FBQztRQUNsQ3JCLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUksT0FBT3FCLFVBQVUsS0FBSyxRQUFRLEVBQUU7UUFDekN5TyxjQUFjLENBQUMzVyxJQUFJLENBQUUsSUFBRzZHLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO1FBQ3JEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxFQUFFaUMsVUFBVSxDQUFDO1FBQ2xDckIsS0FBSyxJQUFJLENBQUM7TUFDWixDQUFDLE1BQU0sSUFBSSxPQUFPcUIsVUFBVSxLQUFLLFNBQVMsRUFBRTtRQUMxQ3lPLGNBQWMsQ0FBQzNXLElBQUksQ0FBRSxJQUFHNkcsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7UUFDckRpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVpQyxVQUFVLENBQUM7UUFDbENyQixLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJcUIsVUFBVSxDQUFDOUQsTUFBTSxLQUFLLFNBQVMsRUFBRTtRQUMxQ3VTLGNBQWMsQ0FBQzNXLElBQUksQ0FBRSxJQUFHNkcsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7UUFDckRpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVpQyxVQUFVLENBQUMxRCxRQUFRLENBQUM7UUFDM0NxQyxLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJcUIsVUFBVSxDQUFDOUQsTUFBTSxLQUFLLE1BQU0sRUFBRTtRQUN2Q3VTLGNBQWMsQ0FBQzNXLElBQUksQ0FBRSxJQUFHNkcsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7UUFDckRpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUU5QixlQUFlLENBQUMrRCxVQUFVLENBQUMsQ0FBQztRQUNuRHJCLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUlxQixVQUFVLFlBQVlrTSxJQUFJLEVBQUU7UUFDckN1QyxjQUFjLENBQUMzVyxJQUFJLENBQUUsSUFBRzZHLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO1FBQ3JEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxFQUFFaUMsVUFBVSxDQUFDO1FBQ2xDckIsS0FBSyxJQUFJLENBQUM7TUFDWixDQUFDLE1BQU0sSUFBSXFCLFVBQVUsQ0FBQzlELE1BQU0sS0FBSyxNQUFNLEVBQUU7UUFDdkN1UyxjQUFjLENBQUMzVyxJQUFJLENBQUUsSUFBRzZHLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsRUFBQyxDQUFDO1FBQ3JEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxFQUFFOUIsZUFBZSxDQUFDK0QsVUFBVSxDQUFDLENBQUM7UUFDbkRyQixLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJcUIsVUFBVSxDQUFDOUQsTUFBTSxLQUFLLFVBQVUsRUFBRTtRQUMzQ3VTLGNBQWMsQ0FBQzNXLElBQUksQ0FBRSxJQUFHNkcsS0FBTSxrQkFBaUJBLEtBQUssR0FBRyxDQUFFLE1BQUtBLEtBQUssR0FBRyxDQUFFLEdBQUUsQ0FBQztRQUMzRWlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWlDLFVBQVUsQ0FBQ21CLFNBQVMsRUFBRW5CLFVBQVUsQ0FBQ29CLFFBQVEsQ0FBQztRQUNqRXpDLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQUlxQixVQUFVLENBQUM5RCxNQUFNLEtBQUssU0FBUyxFQUFFO1FBQzFDLE1BQU10RCxLQUFLLEdBQUdxTSxtQkFBbUIsQ0FBQ2pGLFVBQVUsQ0FBQ3lFLFdBQVcsQ0FBQztRQUN6RGdLLGNBQWMsQ0FBQzNXLElBQUksQ0FBRSxJQUFHNkcsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxXQUFVLENBQUM7UUFDOURpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVuRixLQUFLLENBQUM7UUFDN0IrRixLQUFLLElBQUksQ0FBQztNQUNaLENBQUMsTUFBTSxJQUFJcUIsVUFBVSxDQUFDOUQsTUFBTSxLQUFLLFVBQVUsRUFBRTtRQUMzQztNQUFBLENBQ0QsTUFBTSxJQUFJLE9BQU84RCxVQUFVLEtBQUssUUFBUSxFQUFFO1FBQ3pDeU8sY0FBYyxDQUFDM1csSUFBSSxDQUFFLElBQUc2RyxLQUFNLFlBQVdBLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztRQUNyRGlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2lHLFNBQVMsRUFBRWlDLFVBQVUsQ0FBQztRQUNsQ3JCLEtBQUssSUFBSSxDQUFDO01BQ1osQ0FBQyxNQUFNLElBQ0wsT0FBT3FCLFVBQVUsS0FBSyxRQUFRLElBQzlCN0MsTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxJQUN4QlosTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxDQUFDcEQsSUFBSSxLQUFLLFFBQVEsRUFDMUM7UUFDQTtRQUNBLE1BQU13VSxlQUFlLEdBQUc1WCxNQUFNLENBQUNELElBQUksQ0FBQ29YLGNBQWMsQ0FBQyxDQUNoRGhYLE1BQU0sQ0FBQzBYLENBQUMsSUFBSTtVQUNYO1VBQ0E7VUFDQTtVQUNBO1VBQ0EsTUFBTXhXLEtBQUssR0FBRzhWLGNBQWMsQ0FBQ1UsQ0FBQyxDQUFDO1VBQy9CLE9BQ0V4VyxLQUFLLElBQ0xBLEtBQUssQ0FBQzJGLElBQUksS0FBSyxXQUFXLElBQzFCNlEsQ0FBQyxDQUFDbFIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDOUYsTUFBTSxLQUFLLENBQUMsSUFDekJnWCxDQUFDLENBQUNsUixLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtILFNBQVM7UUFFakMsQ0FBQyxDQUFDLENBQ0RVLEdBQUcsQ0FBQzJRLENBQUMsSUFBSUEsQ0FBQyxDQUFDbFIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTVCLElBQUltUixpQkFBaUIsR0FBRyxFQUFFO1FBQzFCLElBQUlGLGVBQWUsQ0FBQy9XLE1BQU0sR0FBRyxDQUFDLEVBQUU7VUFDOUJpWCxpQkFBaUIsR0FDZixNQUFNLEdBQ05GLGVBQWUsQ0FDWjFRLEdBQUcsQ0FBQzZRLENBQUMsSUFBSTtZQUNSLE1BQU1MLE1BQU0sR0FBR2pQLFVBQVUsQ0FBQ3NQLENBQUMsQ0FBQyxDQUFDTCxNQUFNO1lBQ25DLE9BQVEsYUFBWUssQ0FBRSxrQkFBaUIzUSxLQUFNLFlBQVcyUSxDQUFFLGlCQUFnQkwsTUFBTyxlQUFjO1VBQ2pHLENBQUMsQ0FBQyxDQUNEcFEsSUFBSSxDQUFDLE1BQU0sQ0FBQztVQUNqQjtVQUNBc1EsZUFBZSxDQUFDN1csT0FBTyxDQUFDQyxHQUFHLElBQUk7WUFDN0IsT0FBT3lILFVBQVUsQ0FBQ3pILEdBQUcsQ0FBQztVQUN4QixDQUFDLENBQUM7UUFDSjtRQUVBLE1BQU1nWCxZQUEyQixHQUFHaFksTUFBTSxDQUFDRCxJQUFJLENBQUNvWCxjQUFjLENBQUMsQ0FDNURoWCxNQUFNLENBQUMwWCxDQUFDLElBQUk7VUFDWDtVQUNBLE1BQU14VyxLQUFLLEdBQUc4VixjQUFjLENBQUNVLENBQUMsQ0FBQztVQUMvQixPQUNFeFcsS0FBSyxJQUNMQSxLQUFLLENBQUMyRixJQUFJLEtBQUssUUFBUSxJQUN2QjZRLENBQUMsQ0FBQ2xSLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQzlGLE1BQU0sS0FBSyxDQUFDLElBQ3pCZ1gsQ0FBQyxDQUFDbFIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLSCxTQUFTO1FBRWpDLENBQUMsQ0FBQyxDQUNEVSxHQUFHLENBQUMyUSxDQUFDLElBQUlBLENBQUMsQ0FBQ2xSLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU1QixNQUFNc1IsY0FBYyxHQUFHRCxZQUFZLENBQUNqRCxNQUFNLENBQUMsQ0FBQ21ELENBQVMsRUFBRUgsQ0FBUyxFQUFFcFgsQ0FBUyxLQUFLO1VBQzlFLE9BQU91WCxDQUFDLEdBQUksUUFBTzlRLEtBQUssR0FBRyxDQUFDLEdBQUd6RyxDQUFFLFNBQVE7UUFDM0MsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNOO1FBQ0EsSUFBSXdYLFlBQVksR0FBRyxhQUFhO1FBRWhDLElBQUlmLGtCQUFrQixDQUFDNVEsU0FBUyxDQUFDLEVBQUU7VUFDakM7VUFDQTJSLFlBQVksR0FBSSxhQUFZL1EsS0FBTSxxQkFBb0I7UUFDeEQ7UUFDQThQLGNBQWMsQ0FBQzNXLElBQUksQ0FDaEIsSUFBRzZHLEtBQU0sWUFBVytRLFlBQWEsSUFBR0YsY0FBZSxJQUFHSCxpQkFBa0IsUUFDdkUxUSxLQUFLLEdBQUcsQ0FBQyxHQUFHNFEsWUFBWSxDQUFDblgsTUFDMUIsV0FBVSxDQUNaO1FBQ0R3SCxNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUUsR0FBR3dSLFlBQVksRUFBRTFVLElBQUksQ0FBQ0MsU0FBUyxDQUFDa0YsVUFBVSxDQUFDLENBQUM7UUFDbkVyQixLQUFLLElBQUksQ0FBQyxHQUFHNFEsWUFBWSxDQUFDblgsTUFBTTtNQUNsQyxDQUFDLE1BQU0sSUFDTG1KLEtBQUssQ0FBQ0MsT0FBTyxDQUFDeEIsVUFBVSxDQUFDLElBQ3pCN0MsTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxJQUN4QlosTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxDQUFDcEQsSUFBSSxLQUFLLE9BQU8sRUFDekM7UUFDQSxNQUFNZ1YsWUFBWSxHQUFHalYsdUJBQXVCLENBQUN5QyxNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLENBQUM7UUFDdEUsSUFBSTRSLFlBQVksS0FBSyxRQUFRLEVBQUU7VUFDN0JsQixjQUFjLENBQUMzVyxJQUFJLENBQUUsSUFBRzZHLEtBQU0sWUFBV0EsS0FBSyxHQUFHLENBQUUsVUFBUyxDQUFDO1VBQzdEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDaUcsU0FBUyxFQUFFaUMsVUFBVSxDQUFDO1VBQ2xDckIsS0FBSyxJQUFJLENBQUM7UUFDWixDQUFDLE1BQU07VUFDTDhQLGNBQWMsQ0FBQzNXLElBQUksQ0FBRSxJQUFHNkcsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxTQUFRLENBQUM7VUFDNURpQixNQUFNLENBQUM5SCxJQUFJLENBQUNpRyxTQUFTLEVBQUVsRCxJQUFJLENBQUNDLFNBQVMsQ0FBQ2tGLFVBQVUsQ0FBQyxDQUFDO1VBQ2xEckIsS0FBSyxJQUFJLENBQUM7UUFDWjtNQUNGLENBQUMsTUFBTTtRQUNMdkUsS0FBSyxDQUFDLHNCQUFzQixFQUFFO1VBQUUyRCxTQUFTO1VBQUVpQztRQUFXLENBQUMsQ0FBQztRQUN4RCxPQUFPK0ksT0FBTyxDQUFDNkcsTUFBTSxDQUNuQixJQUFJMVEsYUFBSyxDQUFDQyxLQUFLLENBQ2JELGFBQUssQ0FBQ0MsS0FBSyxDQUFDMEcsbUJBQW1CLEVBQzlCLG1DQUFrQ2hMLElBQUksQ0FBQ0MsU0FBUyxDQUFDa0YsVUFBVSxDQUFFLE1BQUssQ0FDcEUsQ0FDRjtNQUNIO0lBQ0Y7SUFFQSxNQUFNcU8sS0FBSyxHQUFHN08sZ0JBQWdCLENBQUM7TUFDN0JyQyxNQUFNO01BQ053QixLQUFLO01BQ0xjLEtBQUs7TUFDTEMsZUFBZSxFQUFFO0lBQ25CLENBQUMsQ0FBQztJQUNGRSxNQUFNLENBQUM5SCxJQUFJLENBQUMsR0FBR3VXLEtBQUssQ0FBQ3pPLE1BQU0sQ0FBQztJQUU1QixNQUFNaVEsV0FBVyxHQUFHeEIsS0FBSyxDQUFDMU4sT0FBTyxDQUFDdkksTUFBTSxHQUFHLENBQUMsR0FBSSxTQUFRaVcsS0FBSyxDQUFDMU4sT0FBUSxFQUFDLEdBQUcsRUFBRTtJQUM1RSxNQUFNbUssRUFBRSxHQUFJLHNCQUFxQjJELGNBQWMsQ0FBQzVQLElBQUksRUFBRyxJQUFHZ1IsV0FBWSxjQUFhO0lBQ25GLE1BQU1oQyxPQUFPLEdBQUcsQ0FBQ2Isb0JBQW9CLEdBQUdBLG9CQUFvQixDQUFDdEUsQ0FBQyxHQUFHLElBQUksQ0FBQ2xDLE9BQU8sRUFBRWdGLEdBQUcsQ0FBQ1YsRUFBRSxFQUFFbEwsTUFBTSxDQUFDO0lBQzlGLElBQUlvTixvQkFBb0IsRUFBRTtNQUN4QkEsb0JBQW9CLENBQUNqQyxLQUFLLENBQUNqVCxJQUFJLENBQUMrVixPQUFPLENBQUM7SUFDMUM7SUFDQSxPQUFPQSxPQUFPO0VBQ2hCOztFQUVBO0VBQ0FpQyxlQUFlQSxDQUNiMVMsU0FBaUIsRUFDakJELE1BQWtCLEVBQ2xCc0MsS0FBZ0IsRUFDaEI1QyxNQUFXLEVBQ1htUSxvQkFBMEIsRUFDMUI7SUFDQTVTLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztJQUN4QixNQUFNMlYsV0FBVyxHQUFHeFksTUFBTSxDQUFDNlMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFM0ssS0FBSyxFQUFFNUMsTUFBTSxDQUFDO0lBQ3BELE9BQU8sSUFBSSxDQUFDa1EsWUFBWSxDQUFDM1AsU0FBUyxFQUFFRCxNQUFNLEVBQUU0UyxXQUFXLEVBQUUvQyxvQkFBb0IsQ0FBQyxDQUFDaEYsS0FBSyxDQUFDckMsS0FBSyxJQUFJO01BQzVGO01BQ0EsSUFBSUEsS0FBSyxDQUFDb0UsSUFBSSxLQUFLN0ssYUFBSyxDQUFDQyxLQUFLLENBQUM4SyxlQUFlLEVBQUU7UUFDOUMsTUFBTXRFLEtBQUs7TUFDYjtNQUNBLE9BQU8sSUFBSSxDQUFDNEksZ0JBQWdCLENBQUNuUixTQUFTLEVBQUVELE1BQU0sRUFBRXNDLEtBQUssRUFBRTVDLE1BQU0sRUFBRW1RLG9CQUFvQixDQUFDO0lBQ3RGLENBQUMsQ0FBQztFQUNKO0VBRUF2USxJQUFJQSxDQUNGVyxTQUFpQixFQUNqQkQsTUFBa0IsRUFDbEJzQyxLQUFnQixFQUNoQjtJQUFFdVEsSUFBSTtJQUFFQyxLQUFLO0lBQUVDLElBQUk7SUFBRTVZLElBQUk7SUFBRW9JLGVBQWU7SUFBRXlRO0VBQXNCLENBQUMsRUFDbkU7SUFDQS9WLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFDYixNQUFNZ1csUUFBUSxHQUFHSCxLQUFLLEtBQUt6VyxTQUFTO0lBQ3BDLE1BQU02VyxPQUFPLEdBQUdMLElBQUksS0FBS3hXLFNBQVM7SUFDbEMsSUFBSW9HLE1BQU0sR0FBRyxDQUFDeEMsU0FBUyxDQUFDO0lBQ3hCLE1BQU1pUixLQUFLLEdBQUc3TyxnQkFBZ0IsQ0FBQztNQUM3QnJDLE1BQU07TUFDTnNDLEtBQUs7TUFDTGQsS0FBSyxFQUFFLENBQUM7TUFDUmU7SUFDRixDQUFDLENBQUM7SUFDRkUsTUFBTSxDQUFDOUgsSUFBSSxDQUFDLEdBQUd1VyxLQUFLLENBQUN6TyxNQUFNLENBQUM7SUFFNUIsTUFBTTBRLFlBQVksR0FBR2pDLEtBQUssQ0FBQzFOLE9BQU8sQ0FBQ3ZJLE1BQU0sR0FBRyxDQUFDLEdBQUksU0FBUWlXLEtBQUssQ0FBQzFOLE9BQVEsRUFBQyxHQUFHLEVBQUU7SUFDN0UsTUFBTTRQLFlBQVksR0FBR0gsUUFBUSxHQUFJLFVBQVN4USxNQUFNLENBQUN4SCxNQUFNLEdBQUcsQ0FBRSxFQUFDLEdBQUcsRUFBRTtJQUNsRSxJQUFJZ1ksUUFBUSxFQUFFO01BQ1p4USxNQUFNLENBQUM5SCxJQUFJLENBQUNtWSxLQUFLLENBQUM7SUFDcEI7SUFDQSxNQUFNTyxXQUFXLEdBQUdILE9BQU8sR0FBSSxXQUFVelEsTUFBTSxDQUFDeEgsTUFBTSxHQUFHLENBQUUsRUFBQyxHQUFHLEVBQUU7SUFDakUsSUFBSWlZLE9BQU8sRUFBRTtNQUNYelEsTUFBTSxDQUFDOUgsSUFBSSxDQUFDa1ksSUFBSSxDQUFDO0lBQ25CO0lBRUEsSUFBSVMsV0FBVyxHQUFHLEVBQUU7SUFDcEIsSUFBSVAsSUFBSSxFQUFFO01BQ1IsTUFBTVEsUUFBYSxHQUFHUixJQUFJO01BQzFCLE1BQU1TLE9BQU8sR0FBR3BaLE1BQU0sQ0FBQ0QsSUFBSSxDQUFDNFksSUFBSSxDQUFDLENBQzlCelIsR0FBRyxDQUFDbEcsR0FBRyxJQUFJO1FBQ1YsTUFBTXFZLFlBQVksR0FBR3BTLDZCQUE2QixDQUFDakcsR0FBRyxDQUFDLENBQUNzRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ2xFO1FBQ0EsSUFBSTZSLFFBQVEsQ0FBQ25ZLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRTtVQUN2QixPQUFRLEdBQUVxWSxZQUFhLE1BQUs7UUFDOUI7UUFDQSxPQUFRLEdBQUVBLFlBQWEsT0FBTTtNQUMvQixDQUFDLENBQUMsQ0FDRC9SLElBQUksRUFBRTtNQUNUNFIsV0FBVyxHQUFHUCxJQUFJLEtBQUsxVyxTQUFTLElBQUlqQyxNQUFNLENBQUNELElBQUksQ0FBQzRZLElBQUksQ0FBQyxDQUFDOVgsTUFBTSxHQUFHLENBQUMsR0FBSSxZQUFXdVksT0FBUSxFQUFDLEdBQUcsRUFBRTtJQUMvRjtJQUNBLElBQUl0QyxLQUFLLENBQUN4TyxLQUFLLElBQUl0SSxNQUFNLENBQUNELElBQUksQ0FBRStXLEtBQUssQ0FBQ3hPLEtBQUssQ0FBTyxDQUFDekgsTUFBTSxHQUFHLENBQUMsRUFBRTtNQUM3RHFZLFdBQVcsR0FBSSxZQUFXcEMsS0FBSyxDQUFDeE8sS0FBSyxDQUFDaEIsSUFBSSxFQUFHLEVBQUM7SUFDaEQ7SUFFQSxJQUFJcU0sT0FBTyxHQUFHLEdBQUc7SUFDakIsSUFBSTVULElBQUksRUFBRTtNQUNSO01BQ0E7TUFDQUEsSUFBSSxHQUFHQSxJQUFJLENBQUNnVixNQUFNLENBQUMsQ0FBQ3VFLElBQUksRUFBRXRZLEdBQUcsS0FBSztRQUNoQyxJQUFJQSxHQUFHLEtBQUssS0FBSyxFQUFFO1VBQ2pCc1ksSUFBSSxDQUFDL1ksSUFBSSxDQUFDLFFBQVEsQ0FBQztVQUNuQitZLElBQUksQ0FBQy9ZLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDckIsQ0FBQyxNQUFNLElBQ0xTLEdBQUcsQ0FBQ0gsTUFBTSxHQUFHLENBQUM7UUFDZDtRQUNBO1FBQ0E7UUFDRStFLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDOUUsR0FBRyxDQUFDLElBQUk0RSxNQUFNLENBQUNFLE1BQU0sQ0FBQzlFLEdBQUcsQ0FBQyxDQUFDb0MsSUFBSSxLQUFLLFVBQVUsSUFBS3BDLEdBQUcsS0FBSyxRQUFRLENBQUMsRUFDcEY7VUFDQXNZLElBQUksQ0FBQy9ZLElBQUksQ0FBQ1MsR0FBRyxDQUFDO1FBQ2hCO1FBQ0EsT0FBT3NZLElBQUk7TUFDYixDQUFDLEVBQUUsRUFBRSxDQUFDO01BQ04zRixPQUFPLEdBQUc1VCxJQUFJLENBQ1htSCxHQUFHLENBQUMsQ0FBQ2xHLEdBQUcsRUFBRW9HLEtBQUssS0FBSztRQUNuQixJQUFJcEcsR0FBRyxLQUFLLFFBQVEsRUFBRTtVQUNwQixPQUFRLDJCQUEwQixDQUFFLE1BQUssQ0FBRSx1QkFBc0IsQ0FBRSxNQUFLLENBQUUsaUJBQWdCO1FBQzVGO1FBQ0EsT0FBUSxJQUFHb0csS0FBSyxHQUFHaUIsTUFBTSxDQUFDeEgsTUFBTSxHQUFHLENBQUUsT0FBTTtNQUM3QyxDQUFDLENBQUMsQ0FDRHlHLElBQUksRUFBRTtNQUNUZSxNQUFNLEdBQUdBLE1BQU0sQ0FBQ3RGLE1BQU0sQ0FBQ2hELElBQUksQ0FBQztJQUM5QjtJQUVBLE1BQU13WixhQUFhLEdBQUksVUFBUzVGLE9BQVEsaUJBQWdCb0YsWUFBYSxJQUFHRyxXQUFZLElBQUdGLFlBQWEsSUFBR0MsV0FBWSxFQUFDO0lBQ3BILE1BQU0xRixFQUFFLEdBQUdxRixPQUFPLEdBQUcsSUFBSSxDQUFDcEosc0JBQXNCLENBQUMrSixhQUFhLENBQUMsR0FBR0EsYUFBYTtJQUMvRSxPQUFPLElBQUksQ0FBQ3RLLE9BQU8sQ0FDaEJnRixHQUFHLENBQUNWLEVBQUUsRUFBRWxMLE1BQU0sQ0FBQyxDQUNmb0ksS0FBSyxDQUFDckMsS0FBSyxJQUFJO01BQ2Q7TUFDQSxJQUFJQSxLQUFLLENBQUNvRSxJQUFJLEtBQUtqUSxpQ0FBaUMsRUFBRTtRQUNwRCxNQUFNNkwsS0FBSztNQUNiO01BQ0EsT0FBTyxFQUFFO0lBQ1gsQ0FBQyxDQUFDLENBQ0RvRyxJQUFJLENBQUNLLE9BQU8sSUFBSTtNQUNmLElBQUkrRCxPQUFPLEVBQUU7UUFDWCxPQUFPL0QsT0FBTztNQUNoQjtNQUNBLE9BQU9BLE9BQU8sQ0FBQzNOLEdBQUcsQ0FBQ3JILE1BQU0sSUFBSSxJQUFJLENBQUMyWiwyQkFBMkIsQ0FBQzNULFNBQVMsRUFBRWhHLE1BQU0sRUFBRStGLE1BQU0sQ0FBQyxDQUFDO0lBQzNGLENBQUMsQ0FBQztFQUNOOztFQUVBO0VBQ0E7RUFDQTRULDJCQUEyQkEsQ0FBQzNULFNBQWlCLEVBQUVoRyxNQUFXLEVBQUUrRixNQUFXLEVBQUU7SUFDdkU1RixNQUFNLENBQUNELElBQUksQ0FBQzZGLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDLENBQUMvRSxPQUFPLENBQUN5RixTQUFTLElBQUk7TUFDOUMsSUFBSVosTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxDQUFDcEQsSUFBSSxLQUFLLFNBQVMsSUFBSXZELE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQyxFQUFFO1FBQ3BFM0csTUFBTSxDQUFDMkcsU0FBUyxDQUFDLEdBQUc7VUFDbEJ6QixRQUFRLEVBQUVsRixNQUFNLENBQUMyRyxTQUFTLENBQUM7VUFDM0I3QixNQUFNLEVBQUUsU0FBUztVQUNqQmtCLFNBQVMsRUFBRUQsTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxDQUFDaVQ7UUFDdEMsQ0FBQztNQUNIO01BQ0EsSUFBSTdULE1BQU0sQ0FBQ0UsTUFBTSxDQUFDVSxTQUFTLENBQUMsQ0FBQ3BELElBQUksS0FBSyxVQUFVLEVBQUU7UUFDaER2RCxNQUFNLENBQUMyRyxTQUFTLENBQUMsR0FBRztVQUNsQjdCLE1BQU0sRUFBRSxVQUFVO1VBQ2xCa0IsU0FBUyxFQUFFRCxNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLENBQUNpVDtRQUN0QyxDQUFDO01BQ0g7TUFDQSxJQUFJNVosTUFBTSxDQUFDMkcsU0FBUyxDQUFDLElBQUlaLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDVSxTQUFTLENBQUMsQ0FBQ3BELElBQUksS0FBSyxVQUFVLEVBQUU7UUFDckV2RCxNQUFNLENBQUMyRyxTQUFTLENBQUMsR0FBRztVQUNsQjdCLE1BQU0sRUFBRSxVQUFVO1VBQ2xCa0YsUUFBUSxFQUFFaEssTUFBTSxDQUFDMkcsU0FBUyxDQUFDLENBQUNrVCxDQUFDO1VBQzdCOVAsU0FBUyxFQUFFL0osTUFBTSxDQUFDMkcsU0FBUyxDQUFDLENBQUNtVDtRQUMvQixDQUFDO01BQ0g7TUFDQSxJQUFJOVosTUFBTSxDQUFDMkcsU0FBUyxDQUFDLElBQUlaLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDVSxTQUFTLENBQUMsQ0FBQ3BELElBQUksS0FBSyxTQUFTLEVBQUU7UUFDcEUsSUFBSXdXLE1BQU0sR0FBRy9aLE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQztRQUM5Qm9ULE1BQU0sR0FBR0EsTUFBTSxDQUFDcFMsTUFBTSxDQUFDLENBQUMsRUFBRW9TLE1BQU0sQ0FBQy9ZLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQzhGLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDekRpVCxNQUFNLEdBQUdBLE1BQU0sQ0FBQzFTLEdBQUcsQ0FBQ3lDLEtBQUssSUFBSTtVQUMzQixPQUFPLENBQUNrUSxVQUFVLENBQUNsUSxLQUFLLENBQUNoRCxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRWtULFVBQVUsQ0FBQ2xRLEtBQUssQ0FBQ2hELEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNFLENBQUMsQ0FBQztRQUNGOUcsTUFBTSxDQUFDMkcsU0FBUyxDQUFDLEdBQUc7VUFDbEI3QixNQUFNLEVBQUUsU0FBUztVQUNqQnVJLFdBQVcsRUFBRTBNO1FBQ2YsQ0FBQztNQUNIO01BQ0EsSUFBSS9aLE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQyxJQUFJWixNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLENBQUNwRCxJQUFJLEtBQUssTUFBTSxFQUFFO1FBQ2pFdkQsTUFBTSxDQUFDMkcsU0FBUyxDQUFDLEdBQUc7VUFDbEI3QixNQUFNLEVBQUUsTUFBTTtVQUNkRSxJQUFJLEVBQUVoRixNQUFNLENBQUMyRyxTQUFTO1FBQ3hCLENBQUM7TUFDSDtJQUNGLENBQUMsQ0FBQztJQUNGO0lBQ0EsSUFBSTNHLE1BQU0sQ0FBQ2lhLFNBQVMsRUFBRTtNQUNwQmphLE1BQU0sQ0FBQ2lhLFNBQVMsR0FBR2phLE1BQU0sQ0FBQ2lhLFNBQVMsQ0FBQ0MsV0FBVyxFQUFFO0lBQ25EO0lBQ0EsSUFBSWxhLE1BQU0sQ0FBQ21hLFNBQVMsRUFBRTtNQUNwQm5hLE1BQU0sQ0FBQ21hLFNBQVMsR0FBR25hLE1BQU0sQ0FBQ21hLFNBQVMsQ0FBQ0QsV0FBVyxFQUFFO0lBQ25EO0lBQ0EsSUFBSWxhLE1BQU0sQ0FBQ29hLFNBQVMsRUFBRTtNQUNwQnBhLE1BQU0sQ0FBQ29hLFNBQVMsR0FBRztRQUNqQnRWLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRS9FLE1BQU0sQ0FBQ29hLFNBQVMsQ0FBQ0YsV0FBVztNQUNuQyxDQUFDO0lBQ0g7SUFDQSxJQUFJbGEsTUFBTSxDQUFDaVQsOEJBQThCLEVBQUU7TUFDekNqVCxNQUFNLENBQUNpVCw4QkFBOEIsR0FBRztRQUN0Q25PLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRS9FLE1BQU0sQ0FBQ2lULDhCQUE4QixDQUFDaUgsV0FBVztNQUN4RCxDQUFDO0lBQ0g7SUFDQSxJQUFJbGEsTUFBTSxDQUFDbVQsMkJBQTJCLEVBQUU7TUFDdENuVCxNQUFNLENBQUNtVCwyQkFBMkIsR0FBRztRQUNuQ3JPLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRS9FLE1BQU0sQ0FBQ21ULDJCQUEyQixDQUFDK0csV0FBVztNQUNyRCxDQUFDO0lBQ0g7SUFDQSxJQUFJbGEsTUFBTSxDQUFDc1QsNEJBQTRCLEVBQUU7TUFDdkN0VCxNQUFNLENBQUNzVCw0QkFBNEIsR0FBRztRQUNwQ3hPLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRS9FLE1BQU0sQ0FBQ3NULDRCQUE0QixDQUFDNEcsV0FBVztNQUN0RCxDQUFDO0lBQ0g7SUFDQSxJQUFJbGEsTUFBTSxDQUFDdVQsb0JBQW9CLEVBQUU7TUFDL0J2VCxNQUFNLENBQUN1VCxvQkFBb0IsR0FBRztRQUM1QnpPLE1BQU0sRUFBRSxNQUFNO1FBQ2RDLEdBQUcsRUFBRS9FLE1BQU0sQ0FBQ3VULG9CQUFvQixDQUFDMkcsV0FBVztNQUM5QyxDQUFDO0lBQ0g7SUFFQSxLQUFLLE1BQU12VCxTQUFTLElBQUkzRyxNQUFNLEVBQUU7TUFDOUIsSUFBSUEsTUFBTSxDQUFDMkcsU0FBUyxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQzlCLE9BQU8zRyxNQUFNLENBQUMyRyxTQUFTLENBQUM7TUFDMUI7TUFDQSxJQUFJM0csTUFBTSxDQUFDMkcsU0FBUyxDQUFDLFlBQVltTyxJQUFJLEVBQUU7UUFDckM5VSxNQUFNLENBQUMyRyxTQUFTLENBQUMsR0FBRztVQUNsQjdCLE1BQU0sRUFBRSxNQUFNO1VBQ2RDLEdBQUcsRUFBRS9FLE1BQU0sQ0FBQzJHLFNBQVMsQ0FBQyxDQUFDdVQsV0FBVztRQUNwQyxDQUFDO01BQ0g7SUFDRjtJQUVBLE9BQU9sYSxNQUFNO0VBQ2Y7O0VBRUE7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBLE1BQU1xYSxnQkFBZ0JBLENBQUNyVSxTQUFpQixFQUFFRCxNQUFrQixFQUFFdVAsVUFBb0IsRUFBRTtJQUNsRixNQUFNZ0YsY0FBYyxHQUFJLEdBQUV0VSxTQUFVLFdBQVVzUCxVQUFVLENBQUN3RCxJQUFJLEVBQUUsQ0FBQ3JSLElBQUksQ0FBQyxHQUFHLENBQUUsRUFBQztJQUMzRSxNQUFNOFMsa0JBQWtCLEdBQUdqRixVQUFVLENBQUNqTyxHQUFHLENBQUMsQ0FBQ1YsU0FBUyxFQUFFWSxLQUFLLEtBQU0sSUFBR0EsS0FBSyxHQUFHLENBQUUsT0FBTSxDQUFDO0lBQ3JGLE1BQU1tTSxFQUFFLEdBQUksd0RBQXVENkcsa0JBQWtCLENBQUM5UyxJQUFJLEVBQUcsR0FBRTtJQUMvRixPQUFPLElBQUksQ0FBQzJILE9BQU8sQ0FBQ3NCLElBQUksQ0FBQ2dELEVBQUUsRUFBRSxDQUFDMU4sU0FBUyxFQUFFc1UsY0FBYyxFQUFFLEdBQUdoRixVQUFVLENBQUMsQ0FBQyxDQUFDMUUsS0FBSyxDQUFDckMsS0FBSyxJQUFJO01BQ3RGLElBQUlBLEtBQUssQ0FBQ29FLElBQUksS0FBS2hRLDhCQUE4QixJQUFJNEwsS0FBSyxDQUFDaU0sT0FBTyxDQUFDM1MsUUFBUSxDQUFDeVMsY0FBYyxDQUFDLEVBQUU7UUFDM0Y7TUFBQSxDQUNELE1BQU0sSUFDTC9MLEtBQUssQ0FBQ29FLElBQUksS0FBSzdQLGlDQUFpQyxJQUNoRHlMLEtBQUssQ0FBQ2lNLE9BQU8sQ0FBQzNTLFFBQVEsQ0FBQ3lTLGNBQWMsQ0FBQyxFQUN0QztRQUNBO1FBQ0EsTUFBTSxJQUFJeFMsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhLLGVBQWUsRUFDM0IsK0RBQStELENBQ2hFO01BQ0gsQ0FBQyxNQUFNO1FBQ0wsTUFBTXRFLEtBQUs7TUFDYjtJQUNGLENBQUMsQ0FBQztFQUNKOztFQUVBO0VBQ0EsTUFBTWhKLEtBQUtBLENBQ1RTLFNBQWlCLEVBQ2pCRCxNQUFrQixFQUNsQnNDLEtBQWdCLEVBQ2hCb1MsY0FBdUIsRUFDdkJDLFFBQWtCLEdBQUcsSUFBSSxFQUN6QjtJQUNBMVgsS0FBSyxDQUFDLE9BQU8sQ0FBQztJQUNkLE1BQU13RixNQUFNLEdBQUcsQ0FBQ3hDLFNBQVMsQ0FBQztJQUMxQixNQUFNaVIsS0FBSyxHQUFHN08sZ0JBQWdCLENBQUM7TUFDN0JyQyxNQUFNO01BQ05zQyxLQUFLO01BQ0xkLEtBQUssRUFBRSxDQUFDO01BQ1JlLGVBQWUsRUFBRTtJQUNuQixDQUFDLENBQUM7SUFDRkUsTUFBTSxDQUFDOUgsSUFBSSxDQUFDLEdBQUd1VyxLQUFLLENBQUN6TyxNQUFNLENBQUM7SUFFNUIsTUFBTTBRLFlBQVksR0FBR2pDLEtBQUssQ0FBQzFOLE9BQU8sQ0FBQ3ZJLE1BQU0sR0FBRyxDQUFDLEdBQUksU0FBUWlXLEtBQUssQ0FBQzFOLE9BQVEsRUFBQyxHQUFHLEVBQUU7SUFDN0UsSUFBSW1LLEVBQUUsR0FBRyxFQUFFO0lBRVgsSUFBSXVELEtBQUssQ0FBQzFOLE9BQU8sQ0FBQ3ZJLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQzBaLFFBQVEsRUFBRTtNQUN6Q2hILEVBQUUsR0FBSSxnQ0FBK0J3RixZQUFhLEVBQUM7SUFDckQsQ0FBQyxNQUFNO01BQ0x4RixFQUFFLEdBQUcsNEVBQTRFO0lBQ25GO0lBRUEsT0FBTyxJQUFJLENBQUN0RSxPQUFPLENBQ2hCNEIsR0FBRyxDQUFDMEMsRUFBRSxFQUFFbEwsTUFBTSxFQUFFeUksQ0FBQyxJQUFJO01BQ3BCLElBQUlBLENBQUMsQ0FBQzBKLHFCQUFxQixJQUFJLElBQUksSUFBSTFKLENBQUMsQ0FBQzBKLHFCQUFxQixJQUFJLENBQUMsQ0FBQyxFQUFFO1FBQ3BFLE9BQU8sQ0FBQzFOLEtBQUssQ0FBQyxDQUFDZ0UsQ0FBQyxDQUFDMUwsS0FBSyxDQUFDLEdBQUcsQ0FBQzBMLENBQUMsQ0FBQzFMLEtBQUssR0FBRyxDQUFDO01BQ3hDLENBQUMsTUFBTTtRQUNMLE9BQU8sQ0FBQzBMLENBQUMsQ0FBQzBKLHFCQUFxQjtNQUNqQztJQUNGLENBQUMsQ0FBQyxDQUNEL0osS0FBSyxDQUFDckMsS0FBSyxJQUFJO01BQ2QsSUFBSUEsS0FBSyxDQUFDb0UsSUFBSSxLQUFLalEsaUNBQWlDLEVBQUU7UUFDcEQsTUFBTTZMLEtBQUs7TUFDYjtNQUNBLE9BQU8sQ0FBQztJQUNWLENBQUMsQ0FBQztFQUNOO0VBRUEsTUFBTXFNLFFBQVFBLENBQUM1VSxTQUFpQixFQUFFRCxNQUFrQixFQUFFc0MsS0FBZ0IsRUFBRTFCLFNBQWlCLEVBQUU7SUFDekYzRCxLQUFLLENBQUMsVUFBVSxDQUFDO0lBQ2pCLElBQUltRixLQUFLLEdBQUd4QixTQUFTO0lBQ3JCLElBQUlrVSxNQUFNLEdBQUdsVSxTQUFTO0lBQ3RCLE1BQU1tVSxRQUFRLEdBQUduVSxTQUFTLENBQUNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO0lBQzVDLElBQUlrVSxRQUFRLEVBQUU7TUFDWjNTLEtBQUssR0FBR2YsNkJBQTZCLENBQUNULFNBQVMsQ0FBQyxDQUFDYyxJQUFJLENBQUMsSUFBSSxDQUFDO01BQzNEb1QsTUFBTSxHQUFHbFUsU0FBUyxDQUFDRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xDO0lBQ0EsTUFBTTRCLFlBQVksR0FDaEIzQyxNQUFNLENBQUNFLE1BQU0sSUFBSUYsTUFBTSxDQUFDRSxNQUFNLENBQUNVLFNBQVMsQ0FBQyxJQUFJWixNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLENBQUNwRCxJQUFJLEtBQUssT0FBTztJQUN4RixNQUFNd1gsY0FBYyxHQUNsQmhWLE1BQU0sQ0FBQ0UsTUFBTSxJQUFJRixNQUFNLENBQUNFLE1BQU0sQ0FBQ1UsU0FBUyxDQUFDLElBQUlaLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDVSxTQUFTLENBQUMsQ0FBQ3BELElBQUksS0FBSyxTQUFTO0lBQzFGLE1BQU1pRixNQUFNLEdBQUcsQ0FBQ0wsS0FBSyxFQUFFMFMsTUFBTSxFQUFFN1UsU0FBUyxDQUFDO0lBQ3pDLE1BQU1pUixLQUFLLEdBQUc3TyxnQkFBZ0IsQ0FBQztNQUM3QnJDLE1BQU07TUFDTnNDLEtBQUs7TUFDTGQsS0FBSyxFQUFFLENBQUM7TUFDUmUsZUFBZSxFQUFFO0lBQ25CLENBQUMsQ0FBQztJQUNGRSxNQUFNLENBQUM5SCxJQUFJLENBQUMsR0FBR3VXLEtBQUssQ0FBQ3pPLE1BQU0sQ0FBQztJQUU1QixNQUFNMFEsWUFBWSxHQUFHakMsS0FBSyxDQUFDMU4sT0FBTyxDQUFDdkksTUFBTSxHQUFHLENBQUMsR0FBSSxTQUFRaVcsS0FBSyxDQUFDMU4sT0FBUSxFQUFDLEdBQUcsRUFBRTtJQUM3RSxNQUFNeVIsV0FBVyxHQUFHdFMsWUFBWSxHQUFHLHNCQUFzQixHQUFHLElBQUk7SUFDaEUsSUFBSWdMLEVBQUUsR0FBSSxtQkFBa0JzSCxXQUFZLGtDQUFpQzlCLFlBQWEsRUFBQztJQUN2RixJQUFJNEIsUUFBUSxFQUFFO01BQ1pwSCxFQUFFLEdBQUksbUJBQWtCc0gsV0FBWSxnQ0FBK0I5QixZQUFhLEVBQUM7SUFDbkY7SUFDQSxPQUFPLElBQUksQ0FBQzlKLE9BQU8sQ0FDaEJnRixHQUFHLENBQUNWLEVBQUUsRUFBRWxMLE1BQU0sQ0FBQyxDQUNmb0ksS0FBSyxDQUFDckMsS0FBSyxJQUFJO01BQ2QsSUFBSUEsS0FBSyxDQUFDb0UsSUFBSSxLQUFLOVAsMEJBQTBCLEVBQUU7UUFDN0MsT0FBTyxFQUFFO01BQ1g7TUFDQSxNQUFNMEwsS0FBSztJQUNiLENBQUMsQ0FBQyxDQUNEb0csSUFBSSxDQUFDSyxPQUFPLElBQUk7TUFDZixJQUFJLENBQUM4RixRQUFRLEVBQUU7UUFDYjlGLE9BQU8sR0FBR0EsT0FBTyxDQUFDMVUsTUFBTSxDQUFDTixNQUFNLElBQUlBLE1BQU0sQ0FBQ21JLEtBQUssQ0FBQyxLQUFLLElBQUksQ0FBQztRQUMxRCxPQUFPNk0sT0FBTyxDQUFDM04sR0FBRyxDQUFDckgsTUFBTSxJQUFJO1VBQzNCLElBQUksQ0FBQythLGNBQWMsRUFBRTtZQUNuQixPQUFPL2EsTUFBTSxDQUFDbUksS0FBSyxDQUFDO1VBQ3RCO1VBQ0EsT0FBTztZQUNMckQsTUFBTSxFQUFFLFNBQVM7WUFDakJrQixTQUFTLEVBQUVELE1BQU0sQ0FBQ0UsTUFBTSxDQUFDVSxTQUFTLENBQUMsQ0FBQ2lULFdBQVc7WUFDL0MxVSxRQUFRLEVBQUVsRixNQUFNLENBQUNtSSxLQUFLO1VBQ3hCLENBQUM7UUFDSCxDQUFDLENBQUM7TUFDSjtNQUNBLE1BQU04UyxLQUFLLEdBQUd0VSxTQUFTLENBQUNHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDckMsT0FBT2tPLE9BQU8sQ0FBQzNOLEdBQUcsQ0FBQ3JILE1BQU0sSUFBSUEsTUFBTSxDQUFDNmEsTUFBTSxDQUFDLENBQUNJLEtBQUssQ0FBQyxDQUFDO0lBQ3JELENBQUMsQ0FBQyxDQUNEdEcsSUFBSSxDQUFDSyxPQUFPLElBQ1hBLE9BQU8sQ0FBQzNOLEdBQUcsQ0FBQ3JILE1BQU0sSUFBSSxJQUFJLENBQUMyWiwyQkFBMkIsQ0FBQzNULFNBQVMsRUFBRWhHLE1BQU0sRUFBRStGLE1BQU0sQ0FBQyxDQUFDLENBQ25GO0VBQ0w7RUFFQSxNQUFNbVYsU0FBU0EsQ0FDYmxWLFNBQWlCLEVBQ2pCRCxNQUFXLEVBQ1hvVixRQUFhLEVBQ2JWLGNBQXVCLEVBQ3ZCelksSUFBWSxFQUNaK1csT0FBaUIsRUFDakI7SUFDQS9WLEtBQUssQ0FBQyxXQUFXLENBQUM7SUFDbEIsTUFBTXdGLE1BQU0sR0FBRyxDQUFDeEMsU0FBUyxDQUFDO0lBQzFCLElBQUl1QixLQUFhLEdBQUcsQ0FBQztJQUNyQixJQUFJdU0sT0FBaUIsR0FBRyxFQUFFO0lBQzFCLElBQUlzSCxVQUFVLEdBQUcsSUFBSTtJQUNyQixJQUFJQyxXQUFXLEdBQUcsSUFBSTtJQUN0QixJQUFJbkMsWUFBWSxHQUFHLEVBQUU7SUFDckIsSUFBSUMsWUFBWSxHQUFHLEVBQUU7SUFDckIsSUFBSUMsV0FBVyxHQUFHLEVBQUU7SUFDcEIsSUFBSUMsV0FBVyxHQUFHLEVBQUU7SUFDcEIsSUFBSWlDLFlBQVksR0FBRyxFQUFFO0lBQ3JCLEtBQUssSUFBSXhhLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR3FhLFFBQVEsQ0FBQ25hLE1BQU0sRUFBRUYsQ0FBQyxJQUFJLENBQUMsRUFBRTtNQUMzQyxNQUFNeWEsS0FBSyxHQUFHSixRQUFRLENBQUNyYSxDQUFDLENBQUM7TUFDekIsSUFBSXlhLEtBQUssQ0FBQ0MsTUFBTSxFQUFFO1FBQ2hCLEtBQUssTUFBTXJULEtBQUssSUFBSW9ULEtBQUssQ0FBQ0MsTUFBTSxFQUFFO1VBQ2hDLE1BQU1oYSxLQUFLLEdBQUcrWixLQUFLLENBQUNDLE1BQU0sQ0FBQ3JULEtBQUssQ0FBQztVQUNqQyxJQUFJM0csS0FBSyxLQUFLLElBQUksSUFBSUEsS0FBSyxLQUFLWSxTQUFTLEVBQUU7WUFDekM7VUFDRjtVQUNBLElBQUkrRixLQUFLLEtBQUssS0FBSyxJQUFJLE9BQU8zRyxLQUFLLEtBQUssUUFBUSxJQUFJQSxLQUFLLEtBQUssRUFBRSxFQUFFO1lBQ2hFc1MsT0FBTyxDQUFDcFQsSUFBSSxDQUFFLElBQUc2RyxLQUFNLHFCQUFvQixDQUFDO1lBQzVDK1QsWUFBWSxHQUFJLGFBQVkvVCxLQUFNLE9BQU07WUFDeENpQixNQUFNLENBQUM5SCxJQUFJLENBQUNnSCx1QkFBdUIsQ0FBQ2xHLEtBQUssQ0FBQyxDQUFDO1lBQzNDK0YsS0FBSyxJQUFJLENBQUM7WUFDVjtVQUNGO1VBQ0EsSUFBSVksS0FBSyxLQUFLLEtBQUssSUFBSSxPQUFPM0csS0FBSyxLQUFLLFFBQVEsSUFBSXJCLE1BQU0sQ0FBQ0QsSUFBSSxDQUFDc0IsS0FBSyxDQUFDLENBQUNSLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDbkZxYSxXQUFXLEdBQUc3WixLQUFLO1lBQ25CLE1BQU1pYSxhQUFhLEdBQUcsRUFBRTtZQUN4QixLQUFLLE1BQU1DLEtBQUssSUFBSWxhLEtBQUssRUFBRTtjQUN6QixJQUFJLE9BQU9BLEtBQUssQ0FBQ2thLEtBQUssQ0FBQyxLQUFLLFFBQVEsSUFBSWxhLEtBQUssQ0FBQ2thLEtBQUssQ0FBQyxFQUFFO2dCQUNwRCxNQUFNemEsTUFBTSxHQUFHeUcsdUJBQXVCLENBQUNsRyxLQUFLLENBQUNrYSxLQUFLLENBQUMsQ0FBQztnQkFDcEQsSUFBSSxDQUFDRCxhQUFhLENBQUM1VCxRQUFRLENBQUUsSUFBRzVHLE1BQU8sR0FBRSxDQUFDLEVBQUU7a0JBQzFDd2EsYUFBYSxDQUFDL2EsSUFBSSxDQUFFLElBQUdPLE1BQU8sR0FBRSxDQUFDO2dCQUNuQztnQkFDQXVILE1BQU0sQ0FBQzlILElBQUksQ0FBQ08sTUFBTSxFQUFFeWEsS0FBSyxDQUFDO2dCQUMxQjVILE9BQU8sQ0FBQ3BULElBQUksQ0FBRSxJQUFHNkcsS0FBTSxhQUFZQSxLQUFLLEdBQUcsQ0FBRSxPQUFNLENBQUM7Z0JBQ3BEQSxLQUFLLElBQUksQ0FBQztjQUNaLENBQUMsTUFBTTtnQkFDTCxNQUFNb1UsU0FBUyxHQUFHeGIsTUFBTSxDQUFDRCxJQUFJLENBQUNzQixLQUFLLENBQUNrYSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDOUMsTUFBTXphLE1BQU0sR0FBR3lHLHVCQUF1QixDQUFDbEcsS0FBSyxDQUFDa2EsS0FBSyxDQUFDLENBQUNDLFNBQVMsQ0FBQyxDQUFDO2dCQUMvRCxJQUFJM1gsd0JBQXdCLENBQUMyWCxTQUFTLENBQUMsRUFBRTtrQkFDdkMsSUFBSSxDQUFDRixhQUFhLENBQUM1VCxRQUFRLENBQUUsSUFBRzVHLE1BQU8sR0FBRSxDQUFDLEVBQUU7b0JBQzFDd2EsYUFBYSxDQUFDL2EsSUFBSSxDQUFFLElBQUdPLE1BQU8sR0FBRSxDQUFDO2tCQUNuQztrQkFDQTZTLE9BQU8sQ0FBQ3BULElBQUksQ0FDVCxXQUNDc0Qsd0JBQXdCLENBQUMyWCxTQUFTLENBQ25DLFVBQVNwVSxLQUFNLDBDQUF5Q0EsS0FBSyxHQUFHLENBQUUsT0FBTSxDQUMxRTtrQkFDRGlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ08sTUFBTSxFQUFFeWEsS0FBSyxDQUFDO2tCQUMxQm5VLEtBQUssSUFBSSxDQUFDO2dCQUNaO2NBQ0Y7WUFDRjtZQUNBK1QsWUFBWSxHQUFJLGFBQVkvVCxLQUFNLE1BQUs7WUFDdkNpQixNQUFNLENBQUM5SCxJQUFJLENBQUMrYSxhQUFhLENBQUNoVSxJQUFJLEVBQUUsQ0FBQztZQUNqQ0YsS0FBSyxJQUFJLENBQUM7WUFDVjtVQUNGO1VBQ0EsSUFBSSxPQUFPL0YsS0FBSyxLQUFLLFFBQVEsRUFBRTtZQUM3QixJQUFJQSxLQUFLLENBQUNvYSxJQUFJLEVBQUU7Y0FDZCxJQUFJLE9BQU9wYSxLQUFLLENBQUNvYSxJQUFJLEtBQUssUUFBUSxFQUFFO2dCQUNsQzlILE9BQU8sQ0FBQ3BULElBQUksQ0FBRSxRQUFPNkcsS0FBTSxjQUFhQSxLQUFLLEdBQUcsQ0FBRSxPQUFNLENBQUM7Z0JBQ3pEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDZ0gsdUJBQXVCLENBQUNsRyxLQUFLLENBQUNvYSxJQUFJLENBQUMsRUFBRXpULEtBQUssQ0FBQztnQkFDdkRaLEtBQUssSUFBSSxDQUFDO2NBQ1osQ0FBQyxNQUFNO2dCQUNMNlQsVUFBVSxHQUFHalQsS0FBSztnQkFDbEIyTCxPQUFPLENBQUNwVCxJQUFJLENBQUUsZ0JBQWU2RyxLQUFNLE9BQU0sQ0FBQztnQkFDMUNpQixNQUFNLENBQUM5SCxJQUFJLENBQUN5SCxLQUFLLENBQUM7Z0JBQ2xCWixLQUFLLElBQUksQ0FBQztjQUNaO1lBQ0Y7WUFDQSxJQUFJL0YsS0FBSyxDQUFDcWEsSUFBSSxFQUFFO2NBQ2QvSCxPQUFPLENBQUNwVCxJQUFJLENBQUUsUUFBTzZHLEtBQU0sY0FBYUEsS0FBSyxHQUFHLENBQUUsT0FBTSxDQUFDO2NBQ3pEaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDZ0gsdUJBQXVCLENBQUNsRyxLQUFLLENBQUNxYSxJQUFJLENBQUMsRUFBRTFULEtBQUssQ0FBQztjQUN2RFosS0FBSyxJQUFJLENBQUM7WUFDWjtZQUNBLElBQUkvRixLQUFLLENBQUNzYSxJQUFJLEVBQUU7Y0FDZGhJLE9BQU8sQ0FBQ3BULElBQUksQ0FBRSxRQUFPNkcsS0FBTSxjQUFhQSxLQUFLLEdBQUcsQ0FBRSxPQUFNLENBQUM7Y0FDekRpQixNQUFNLENBQUM5SCxJQUFJLENBQUNnSCx1QkFBdUIsQ0FBQ2xHLEtBQUssQ0FBQ3NhLElBQUksQ0FBQyxFQUFFM1QsS0FBSyxDQUFDO2NBQ3ZEWixLQUFLLElBQUksQ0FBQztZQUNaO1lBQ0EsSUFBSS9GLEtBQUssQ0FBQ3VhLElBQUksRUFBRTtjQUNkakksT0FBTyxDQUFDcFQsSUFBSSxDQUFFLFFBQU82RyxLQUFNLGNBQWFBLEtBQUssR0FBRyxDQUFFLE9BQU0sQ0FBQztjQUN6RGlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ2dILHVCQUF1QixDQUFDbEcsS0FBSyxDQUFDdWEsSUFBSSxDQUFDLEVBQUU1VCxLQUFLLENBQUM7Y0FDdkRaLEtBQUssSUFBSSxDQUFDO1lBQ1o7VUFDRjtRQUNGO01BQ0YsQ0FBQyxNQUFNO1FBQ0x1TSxPQUFPLENBQUNwVCxJQUFJLENBQUMsR0FBRyxDQUFDO01BQ25CO01BQ0EsSUFBSTZhLEtBQUssQ0FBQ1MsUUFBUSxFQUFFO1FBQ2xCLElBQUlsSSxPQUFPLENBQUNqTSxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7VUFDekJpTSxPQUFPLEdBQUcsRUFBRTtRQUNkO1FBQ0EsS0FBSyxNQUFNM0wsS0FBSyxJQUFJb1QsS0FBSyxDQUFDUyxRQUFRLEVBQUU7VUFDbEMsTUFBTXhhLEtBQUssR0FBRytaLEtBQUssQ0FBQ1MsUUFBUSxDQUFDN1QsS0FBSyxDQUFDO1VBQ25DLElBQUkzRyxLQUFLLEtBQUssQ0FBQyxJQUFJQSxLQUFLLEtBQUssSUFBSSxFQUFFO1lBQ2pDc1MsT0FBTyxDQUFDcFQsSUFBSSxDQUFFLElBQUc2RyxLQUFNLE9BQU0sQ0FBQztZQUM5QmlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ3lILEtBQUssQ0FBQztZQUNsQlosS0FBSyxJQUFJLENBQUM7VUFDWjtRQUNGO01BQ0Y7TUFDQSxJQUFJZ1UsS0FBSyxDQUFDVSxNQUFNLEVBQUU7UUFDaEIsTUFBTTFULFFBQVEsR0FBRyxFQUFFO1FBQ25CLE1BQU1pQixPQUFPLEdBQUdySixNQUFNLENBQUMrUixTQUFTLENBQUNDLGNBQWMsQ0FBQzdQLElBQUksQ0FBQ2laLEtBQUssQ0FBQ1UsTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUNyRSxNQUFNLEdBQ04sT0FBTztRQUVYLElBQUlWLEtBQUssQ0FBQ1UsTUFBTSxDQUFDQyxHQUFHLEVBQUU7VUFDcEIsTUFBTUMsUUFBUSxHQUFHLENBQUMsQ0FBQztVQUNuQlosS0FBSyxDQUFDVSxNQUFNLENBQUNDLEdBQUcsQ0FBQ2hiLE9BQU8sQ0FBQ2tiLE9BQU8sSUFBSTtZQUNsQyxLQUFLLE1BQU1qYixHQUFHLElBQUlpYixPQUFPLEVBQUU7Y0FDekJELFFBQVEsQ0FBQ2hiLEdBQUcsQ0FBQyxHQUFHaWIsT0FBTyxDQUFDamIsR0FBRyxDQUFDO1lBQzlCO1VBQ0YsQ0FBQyxDQUFDO1VBQ0ZvYSxLQUFLLENBQUNVLE1BQU0sR0FBR0UsUUFBUTtRQUN6QjtRQUNBLEtBQUssTUFBTWhVLEtBQUssSUFBSW9ULEtBQUssQ0FBQ1UsTUFBTSxFQUFFO1VBQ2hDLE1BQU16YSxLQUFLLEdBQUcrWixLQUFLLENBQUNVLE1BQU0sQ0FBQzlULEtBQUssQ0FBQztVQUNqQyxNQUFNa1UsYUFBYSxHQUFHLEVBQUU7VUFDeEJsYyxNQUFNLENBQUNELElBQUksQ0FBQ3lELHdCQUF3QixDQUFDLENBQUN6QyxPQUFPLENBQUM0TSxHQUFHLElBQUk7WUFDbkQsSUFBSXRNLEtBQUssQ0FBQ3NNLEdBQUcsQ0FBQyxFQUFFO2NBQ2QsTUFBTUMsWUFBWSxHQUFHcEssd0JBQXdCLENBQUNtSyxHQUFHLENBQUM7Y0FDbER1TyxhQUFhLENBQUMzYixJQUFJLENBQUUsSUFBRzZHLEtBQU0sU0FBUXdHLFlBQWEsS0FBSXhHLEtBQUssR0FBRyxDQUFFLEVBQUMsQ0FBQztjQUNsRWlCLE1BQU0sQ0FBQzlILElBQUksQ0FBQ3lILEtBQUssRUFBRXRELGVBQWUsQ0FBQ3JELEtBQUssQ0FBQ3NNLEdBQUcsQ0FBQyxDQUFDLENBQUM7Y0FDL0N2RyxLQUFLLElBQUksQ0FBQztZQUNaO1VBQ0YsQ0FBQyxDQUFDO1VBQ0YsSUFBSThVLGFBQWEsQ0FBQ3JiLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDNUJ1SCxRQUFRLENBQUM3SCxJQUFJLENBQUUsSUFBRzJiLGFBQWEsQ0FBQzVVLElBQUksQ0FBQyxPQUFPLENBQUUsR0FBRSxDQUFDO1VBQ25EO1VBQ0EsSUFBSTFCLE1BQU0sQ0FBQ0UsTUFBTSxDQUFDa0MsS0FBSyxDQUFDLElBQUlwQyxNQUFNLENBQUNFLE1BQU0sQ0FBQ2tDLEtBQUssQ0FBQyxDQUFDNUUsSUFBSSxJQUFJOFksYUFBYSxDQUFDcmIsTUFBTSxLQUFLLENBQUMsRUFBRTtZQUNuRnVILFFBQVEsQ0FBQzdILElBQUksQ0FBRSxJQUFHNkcsS0FBTSxZQUFXQSxLQUFLLEdBQUcsQ0FBRSxFQUFDLENBQUM7WUFDL0NpQixNQUFNLENBQUM5SCxJQUFJLENBQUN5SCxLQUFLLEVBQUUzRyxLQUFLLENBQUM7WUFDekIrRixLQUFLLElBQUksQ0FBQztVQUNaO1FBQ0Y7UUFDQTJSLFlBQVksR0FBRzNRLFFBQVEsQ0FBQ3ZILE1BQU0sR0FBRyxDQUFDLEdBQUksU0FBUXVILFFBQVEsQ0FBQ2QsSUFBSSxDQUFFLElBQUcrQixPQUFRLEdBQUUsQ0FBRSxFQUFDLEdBQUcsRUFBRTtNQUNwRjtNQUNBLElBQUkrUixLQUFLLENBQUNlLE1BQU0sRUFBRTtRQUNoQm5ELFlBQVksR0FBSSxVQUFTNVIsS0FBTSxFQUFDO1FBQ2hDaUIsTUFBTSxDQUFDOUgsSUFBSSxDQUFDNmEsS0FBSyxDQUFDZSxNQUFNLENBQUM7UUFDekIvVSxLQUFLLElBQUksQ0FBQztNQUNaO01BQ0EsSUFBSWdVLEtBQUssQ0FBQ2dCLEtBQUssRUFBRTtRQUNmbkQsV0FBVyxHQUFJLFdBQVU3UixLQUFNLEVBQUM7UUFDaENpQixNQUFNLENBQUM5SCxJQUFJLENBQUM2YSxLQUFLLENBQUNnQixLQUFLLENBQUM7UUFDeEJoVixLQUFLLElBQUksQ0FBQztNQUNaO01BQ0EsSUFBSWdVLEtBQUssQ0FBQ2lCLEtBQUssRUFBRTtRQUNmLE1BQU0xRCxJQUFJLEdBQUd5QyxLQUFLLENBQUNpQixLQUFLO1FBQ3hCLE1BQU10YyxJQUFJLEdBQUdDLE1BQU0sQ0FBQ0QsSUFBSSxDQUFDNFksSUFBSSxDQUFDO1FBQzlCLE1BQU1TLE9BQU8sR0FBR3JaLElBQUksQ0FDakJtSCxHQUFHLENBQUNsRyxHQUFHLElBQUk7VUFDVixNQUFNNlosV0FBVyxHQUFHbEMsSUFBSSxDQUFDM1gsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssR0FBRyxNQUFNO1VBQ3BELE1BQU1zYixLQUFLLEdBQUksSUFBR2xWLEtBQU0sU0FBUXlULFdBQVksRUFBQztVQUM3Q3pULEtBQUssSUFBSSxDQUFDO1VBQ1YsT0FBT2tWLEtBQUs7UUFDZCxDQUFDLENBQUMsQ0FDRGhWLElBQUksRUFBRTtRQUNUZSxNQUFNLENBQUM5SCxJQUFJLENBQUMsR0FBR1IsSUFBSSxDQUFDO1FBQ3BCbVosV0FBVyxHQUFHUCxJQUFJLEtBQUsxVyxTQUFTLElBQUltWCxPQUFPLENBQUN2WSxNQUFNLEdBQUcsQ0FBQyxHQUFJLFlBQVd1WSxPQUFRLEVBQUMsR0FBRyxFQUFFO01BQ3JGO0lBQ0Y7SUFFQSxJQUFJK0IsWUFBWSxFQUFFO01BQ2hCeEgsT0FBTyxDQUFDNVMsT0FBTyxDQUFDLENBQUN3YixDQUFDLEVBQUU1YixDQUFDLEVBQUVtUSxDQUFDLEtBQUs7UUFDM0IsSUFBSXlMLENBQUMsSUFBSUEsQ0FBQyxDQUFDQyxJQUFJLEVBQUUsS0FBSyxHQUFHLEVBQUU7VUFDekIxTCxDQUFDLENBQUNuUSxDQUFDLENBQUMsR0FBRyxFQUFFO1FBQ1g7TUFDRixDQUFDLENBQUM7SUFDSjtJQUVBLE1BQU00WSxhQUFhLEdBQUksVUFBUzVGLE9BQU8sQ0FDcEN4VCxNQUFNLENBQUNzYyxPQUFPLENBQUMsQ0FDZm5WLElBQUksRUFBRyxpQkFBZ0J5UixZQUFhLElBQUdFLFdBQVksSUFBR2tDLFlBQWEsSUFBR2pDLFdBQVksSUFBR0YsWUFBYSxFQUFDO0lBQ3RHLE1BQU16RixFQUFFLEdBQUdxRixPQUFPLEdBQUcsSUFBSSxDQUFDcEosc0JBQXNCLENBQUMrSixhQUFhLENBQUMsR0FBR0EsYUFBYTtJQUMvRSxPQUFPLElBQUksQ0FBQ3RLLE9BQU8sQ0FBQ2dGLEdBQUcsQ0FBQ1YsRUFBRSxFQUFFbEwsTUFBTSxDQUFDLENBQUNtTSxJQUFJLENBQUMxRCxDQUFDLElBQUk7TUFDNUMsSUFBSThILE9BQU8sRUFBRTtRQUNYLE9BQU85SCxDQUFDO01BQ1Y7TUFDQSxNQUFNK0QsT0FBTyxHQUFHL0QsQ0FBQyxDQUFDNUosR0FBRyxDQUFDckgsTUFBTSxJQUFJLElBQUksQ0FBQzJaLDJCQUEyQixDQUFDM1QsU0FBUyxFQUFFaEcsTUFBTSxFQUFFK0YsTUFBTSxDQUFDLENBQUM7TUFDNUZpUCxPQUFPLENBQUM5VCxPQUFPLENBQUNtTixNQUFNLElBQUk7UUFDeEIsSUFBSSxDQUFDbE8sTUFBTSxDQUFDK1IsU0FBUyxDQUFDQyxjQUFjLENBQUM3UCxJQUFJLENBQUMrTCxNQUFNLEVBQUUsVUFBVSxDQUFDLEVBQUU7VUFDN0RBLE1BQU0sQ0FBQ25KLFFBQVEsR0FBRyxJQUFJO1FBQ3hCO1FBQ0EsSUFBSW1XLFdBQVcsRUFBRTtVQUNmaE4sTUFBTSxDQUFDbkosUUFBUSxHQUFHLENBQUMsQ0FBQztVQUNwQixLQUFLLE1BQU0vRCxHQUFHLElBQUlrYSxXQUFXLEVBQUU7WUFDN0JoTixNQUFNLENBQUNuSixRQUFRLENBQUMvRCxHQUFHLENBQUMsR0FBR2tOLE1BQU0sQ0FBQ2xOLEdBQUcsQ0FBQztZQUNsQyxPQUFPa04sTUFBTSxDQUFDbE4sR0FBRyxDQUFDO1VBQ3BCO1FBQ0Y7UUFDQSxJQUFJaWEsVUFBVSxFQUFFO1VBQ2QvTSxNQUFNLENBQUMrTSxVQUFVLENBQUMsR0FBR3lCLFFBQVEsQ0FBQ3hPLE1BQU0sQ0FBQytNLFVBQVUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUN2RDtNQUNGLENBQUMsQ0FBQztNQUNGLE9BQU9wRyxPQUFPO0lBQ2hCLENBQUMsQ0FBQztFQUNKO0VBRUEsTUFBTThILHFCQUFxQkEsQ0FBQztJQUFFQztFQUE0QixDQUFDLEVBQUU7SUFDM0Q7SUFDQS9aLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQztJQUM5QixNQUFNLElBQUksQ0FBQzZOLDZCQUE2QixFQUFFO0lBQzFDLE1BQU1tTSxRQUFRLEdBQUdELHNCQUFzQixDQUFDMVYsR0FBRyxDQUFDdEIsTUFBTSxJQUFJO01BQ3BELE9BQU8sSUFBSSxDQUFDME0sV0FBVyxDQUFDMU0sTUFBTSxDQUFDQyxTQUFTLEVBQUVELE1BQU0sQ0FBQyxDQUM5QzZLLEtBQUssQ0FBQzhCLEdBQUcsSUFBSTtRQUNaLElBQ0VBLEdBQUcsQ0FBQ0MsSUFBSSxLQUFLaFEsOEJBQThCLElBQzNDK1AsR0FBRyxDQUFDQyxJQUFJLEtBQUs3SyxhQUFLLENBQUNDLEtBQUssQ0FBQ2tWLGtCQUFrQixFQUMzQztVQUNBLE9BQU90TCxPQUFPLENBQUNDLE9BQU8sRUFBRTtRQUMxQjtRQUNBLE1BQU1jLEdBQUc7TUFDWCxDQUFDLENBQUMsQ0FDRGlDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQ2QsYUFBYSxDQUFDOU4sTUFBTSxDQUFDQyxTQUFTLEVBQUVELE1BQU0sQ0FBQyxDQUFDO0lBQzdELENBQUMsQ0FBQztJQUNGaVgsUUFBUSxDQUFDdGMsSUFBSSxDQUFDLElBQUksQ0FBQ3dQLGVBQWUsRUFBRSxDQUFDO0lBQ3JDLE9BQU95QixPQUFPLENBQUN1TCxHQUFHLENBQUNGLFFBQVEsQ0FBQyxDQUN6QnJJLElBQUksQ0FBQyxNQUFNO01BQ1YsT0FBTyxJQUFJLENBQUN2RixPQUFPLENBQUNnRCxFQUFFLENBQUMsd0JBQXdCLEVBQUUsTUFBTWQsQ0FBQyxJQUFJO1FBQzFELE1BQU1BLENBQUMsQ0FBQ1osSUFBSSxDQUFDeU0sWUFBRyxDQUFDQyxJQUFJLENBQUNDLGlCQUFpQixDQUFDO1FBQ3hDLE1BQU0vTCxDQUFDLENBQUNaLElBQUksQ0FBQ3lNLFlBQUcsQ0FBQ0csS0FBSyxDQUFDQyxHQUFHLENBQUM7UUFDM0IsTUFBTWpNLENBQUMsQ0FBQ1osSUFBSSxDQUFDeU0sWUFBRyxDQUFDRyxLQUFLLENBQUNFLFNBQVMsQ0FBQztRQUNqQyxNQUFNbE0sQ0FBQyxDQUFDWixJQUFJLENBQUN5TSxZQUFHLENBQUNHLEtBQUssQ0FBQ0csTUFBTSxDQUFDO1FBQzlCLE1BQU1uTSxDQUFDLENBQUNaLElBQUksQ0FBQ3lNLFlBQUcsQ0FBQ0csS0FBSyxDQUFDSSxXQUFXLENBQUM7UUFDbkMsTUFBTXBNLENBQUMsQ0FBQ1osSUFBSSxDQUFDeU0sWUFBRyxDQUFDRyxLQUFLLENBQUNLLGdCQUFnQixDQUFDO1FBQ3hDLE1BQU1yTSxDQUFDLENBQUNaLElBQUksQ0FBQ3lNLFlBQUcsQ0FBQ0csS0FBSyxDQUFDTSxRQUFRLENBQUM7UUFDaEMsT0FBT3RNLENBQUMsQ0FBQ3VNLEdBQUc7TUFDZCxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FDRGxKLElBQUksQ0FBQ2tKLEdBQUcsSUFBSTtNQUNYN2EsS0FBSyxDQUFFLHlCQUF3QjZhLEdBQUcsQ0FBQ0MsUUFBUyxFQUFDLENBQUM7SUFDaEQsQ0FBQyxDQUFDLENBQ0RsTixLQUFLLENBQUNyQyxLQUFLLElBQUk7TUFDZDtNQUNBRCxPQUFPLENBQUNDLEtBQUssQ0FBQ0EsS0FBSyxDQUFDO0lBQ3RCLENBQUMsQ0FBQztFQUNOO0VBRUEsTUFBTThELGFBQWFBLENBQUNyTSxTQUFpQixFQUFFTyxPQUFZLEVBQUV1SyxJQUFVLEVBQWlCO0lBQzlFLE9BQU8sQ0FBQ0EsSUFBSSxJQUFJLElBQUksQ0FBQzFCLE9BQU8sRUFBRWdELEVBQUUsQ0FBQ2QsQ0FBQyxJQUNoQ0EsQ0FBQyxDQUFDcUMsS0FBSyxDQUNMcE4sT0FBTyxDQUFDYyxHQUFHLENBQUN2RyxDQUFDLElBQUk7TUFDZixPQUFPd1EsQ0FBQyxDQUFDWixJQUFJLENBQUMseURBQXlELEVBQUUsQ0FDdkU1UCxDQUFDLENBQUNrRSxJQUFJLEVBQ05nQixTQUFTLEVBQ1RsRixDQUFDLENBQUNLLEdBQUcsQ0FDTixDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQ0gsQ0FDRjtFQUNIO0VBRUEsTUFBTTRjLHFCQUFxQkEsQ0FDekIvWCxTQUFpQixFQUNqQlcsU0FBaUIsRUFDakJwRCxJQUFTLEVBQ1R1TixJQUFVLEVBQ0s7SUFDZixNQUFNLENBQUNBLElBQUksSUFBSSxJQUFJLENBQUMxQixPQUFPLEVBQUVzQixJQUFJLENBQUMseURBQXlELEVBQUUsQ0FDM0YvSixTQUFTLEVBQ1RYLFNBQVMsRUFDVHpDLElBQUksQ0FDTCxDQUFDO0VBQ0o7RUFFQSxNQUFNK08sV0FBV0EsQ0FBQ3RNLFNBQWlCLEVBQUVPLE9BQVksRUFBRXVLLElBQVMsRUFBaUI7SUFDM0UsTUFBTXNFLE9BQU8sR0FBRzdPLE9BQU8sQ0FBQ2MsR0FBRyxDQUFDdkcsQ0FBQyxLQUFLO01BQ2hDdUgsS0FBSyxFQUFFLG9CQUFvQjtNQUMzQkcsTUFBTSxFQUFFMUg7SUFDVixDQUFDLENBQUMsQ0FBQztJQUNILE1BQU0sQ0FBQ2dRLElBQUksSUFBSSxJQUFJLENBQUMxQixPQUFPLEVBQUVnRCxFQUFFLENBQUNkLENBQUMsSUFBSUEsQ0FBQyxDQUFDWixJQUFJLENBQUMsSUFBSSxDQUFDcEIsSUFBSSxDQUFDb0YsT0FBTyxDQUFDeFIsTUFBTSxDQUFDa1MsT0FBTyxDQUFDLENBQUMsQ0FBQztFQUNqRjtFQUVBLE1BQU00SSxVQUFVQSxDQUFDaFksU0FBaUIsRUFBRTtJQUNsQyxNQUFNME4sRUFBRSxHQUFHLHlEQUF5RDtJQUNwRSxPQUFPLElBQUksQ0FBQ3RFLE9BQU8sQ0FBQ2dGLEdBQUcsQ0FBQ1YsRUFBRSxFQUFFO01BQUUxTjtJQUFVLENBQUMsQ0FBQztFQUM1QztFQUVBLE1BQU1pWSx1QkFBdUJBLENBQUEsRUFBa0I7SUFDN0MsT0FBT3RNLE9BQU8sQ0FBQ0MsT0FBTyxFQUFFO0VBQzFCOztFQUVBO0VBQ0EsTUFBTXNNLG9CQUFvQkEsQ0FBQ2xZLFNBQWlCLEVBQUU7SUFDNUMsT0FBTyxJQUFJLENBQUNvSixPQUFPLENBQUNzQixJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQzFLLFNBQVMsQ0FBQyxDQUFDO0VBQzFEO0VBRUEsTUFBTW1ZLDBCQUEwQkEsQ0FBQSxFQUFpQjtJQUMvQyxPQUFPLElBQUl4TSxPQUFPLENBQUNDLE9BQU8sSUFBSTtNQUM1QixNQUFNZ0Usb0JBQW9CLEdBQUcsQ0FBQyxDQUFDO01BQy9CQSxvQkFBb0IsQ0FBQ3ZILE1BQU0sR0FBRyxJQUFJLENBQUNlLE9BQU8sQ0FBQ2dELEVBQUUsQ0FBQ2QsQ0FBQyxJQUFJO1FBQ2pEc0Usb0JBQW9CLENBQUN0RSxDQUFDLEdBQUdBLENBQUM7UUFDMUJzRSxvQkFBb0IsQ0FBQ2EsT0FBTyxHQUFHLElBQUk5RSxPQUFPLENBQUNDLE9BQU8sSUFBSTtVQUNwRGdFLG9CQUFvQixDQUFDaEUsT0FBTyxHQUFHQSxPQUFPO1FBQ3hDLENBQUMsQ0FBQztRQUNGZ0Usb0JBQW9CLENBQUNqQyxLQUFLLEdBQUcsRUFBRTtRQUMvQi9CLE9BQU8sQ0FBQ2dFLG9CQUFvQixDQUFDO1FBQzdCLE9BQU9BLG9CQUFvQixDQUFDYSxPQUFPO01BQ3JDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQztFQUNKO0VBRUEySCwwQkFBMEJBLENBQUN4SSxvQkFBeUIsRUFBaUI7SUFDbkVBLG9CQUFvQixDQUFDaEUsT0FBTyxDQUFDZ0Usb0JBQW9CLENBQUN0RSxDQUFDLENBQUNxQyxLQUFLLENBQUNpQyxvQkFBb0IsQ0FBQ2pDLEtBQUssQ0FBQyxDQUFDO0lBQ3RGLE9BQU9pQyxvQkFBb0IsQ0FBQ3ZILE1BQU07RUFDcEM7RUFFQWdRLHlCQUF5QkEsQ0FBQ3pJLG9CQUF5QixFQUFpQjtJQUNsRSxNQUFNdkgsTUFBTSxHQUFHdUgsb0JBQW9CLENBQUN2SCxNQUFNLENBQUN1QyxLQUFLLEVBQUU7SUFDbERnRixvQkFBb0IsQ0FBQ2pDLEtBQUssQ0FBQ2pULElBQUksQ0FBQ2lSLE9BQU8sQ0FBQzZHLE1BQU0sRUFBRSxDQUFDO0lBQ2pENUMsb0JBQW9CLENBQUNoRSxPQUFPLENBQUNnRSxvQkFBb0IsQ0FBQ3RFLENBQUMsQ0FBQ3FDLEtBQUssQ0FBQ2lDLG9CQUFvQixDQUFDakMsS0FBSyxDQUFDLENBQUM7SUFDdEYsT0FBT3RGLE1BQU07RUFDZjtFQUVBLE1BQU1pUSxXQUFXQSxDQUNmdFksU0FBaUIsRUFDakJELE1BQWtCLEVBQ2xCdVAsVUFBb0IsRUFDcEJpSixTQUFrQixFQUNsQmpXLGVBQXdCLEdBQUcsS0FBSyxFQUNoQ2tXLE9BQWdCLEdBQUcsQ0FBQyxDQUFDLEVBQ1A7SUFDZCxNQUFNMU4sSUFBSSxHQUFHME4sT0FBTyxDQUFDMU4sSUFBSSxLQUFLMU8sU0FBUyxHQUFHb2MsT0FBTyxDQUFDMU4sSUFBSSxHQUFHLElBQUksQ0FBQzFCLE9BQU87SUFDckUsTUFBTXFQLGdCQUFnQixHQUFJLGlCQUFnQm5KLFVBQVUsQ0FBQ3dELElBQUksRUFBRSxDQUFDclIsSUFBSSxDQUFDLEdBQUcsQ0FBRSxFQUFDO0lBQ3ZFLE1BQU1pWCxnQkFBd0IsR0FDNUJILFNBQVMsSUFBSSxJQUFJLEdBQUc7TUFBRXZaLElBQUksRUFBRXVaO0lBQVUsQ0FBQyxHQUFHO01BQUV2WixJQUFJLEVBQUV5WjtJQUFpQixDQUFDO0lBQ3RFLE1BQU1sRSxrQkFBa0IsR0FBR2pTLGVBQWUsR0FDdENnTixVQUFVLENBQUNqTyxHQUFHLENBQUMsQ0FBQ1YsU0FBUyxFQUFFWSxLQUFLLEtBQU0sVUFBU0EsS0FBSyxHQUFHLENBQUUsNEJBQTJCLENBQUMsR0FDckYrTixVQUFVLENBQUNqTyxHQUFHLENBQUMsQ0FBQ1YsU0FBUyxFQUFFWSxLQUFLLEtBQU0sSUFBR0EsS0FBSyxHQUFHLENBQUUsT0FBTSxDQUFDO0lBQzlELE1BQU1tTSxFQUFFLEdBQUksa0RBQWlENkcsa0JBQWtCLENBQUM5UyxJQUFJLEVBQUcsR0FBRTtJQUN6RixNQUFNa1gsc0JBQXNCLEdBQzFCSCxPQUFPLENBQUNHLHNCQUFzQixLQUFLdmMsU0FBUyxHQUFHb2MsT0FBTyxDQUFDRyxzQkFBc0IsR0FBRyxLQUFLO0lBQ3ZGLElBQUlBLHNCQUFzQixFQUFFO01BQzFCLE1BQU0sSUFBSSxDQUFDQywrQkFBK0IsQ0FBQ0osT0FBTyxDQUFDO0lBQ3JEO0lBQ0EsTUFBTTFOLElBQUksQ0FBQ0osSUFBSSxDQUFDZ0QsRUFBRSxFQUFFLENBQUNnTCxnQkFBZ0IsQ0FBQzFaLElBQUksRUFBRWdCLFNBQVMsRUFBRSxHQUFHc1AsVUFBVSxDQUFDLENBQUMsQ0FBQzFFLEtBQUssQ0FBQ3JDLEtBQUssSUFBSTtNQUNwRixJQUNFQSxLQUFLLENBQUNvRSxJQUFJLEtBQUtoUSw4QkFBOEIsSUFDN0M0TCxLQUFLLENBQUNpTSxPQUFPLENBQUMzUyxRQUFRLENBQUM2VyxnQkFBZ0IsQ0FBQzFaLElBQUksQ0FBQyxFQUM3QztRQUNBO01BQUEsQ0FDRCxNQUFNLElBQ0x1SixLQUFLLENBQUNvRSxJQUFJLEtBQUs3UCxpQ0FBaUMsSUFDaER5TCxLQUFLLENBQUNpTSxPQUFPLENBQUMzUyxRQUFRLENBQUM2VyxnQkFBZ0IsQ0FBQzFaLElBQUksQ0FBQyxFQUM3QztRQUNBO1FBQ0EsTUFBTSxJQUFJOEMsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhLLGVBQWUsRUFDM0IsK0RBQStELENBQ2hFO01BQ0gsQ0FBQyxNQUFNO1FBQ0wsTUFBTXRFLEtBQUs7TUFDYjtJQUNGLENBQUMsQ0FBQztFQUNKO0VBRUEsTUFBTXNRLHlCQUF5QkEsQ0FBQ0wsT0FBZ0IsR0FBRyxDQUFDLENBQUMsRUFBZ0I7SUFDbkUsTUFBTTFOLElBQUksR0FBRzBOLE9BQU8sQ0FBQzFOLElBQUksS0FBSzFPLFNBQVMsR0FBR29jLE9BQU8sQ0FBQzFOLElBQUksR0FBRyxJQUFJLENBQUMxQixPQUFPO0lBQ3JFLE1BQU1zRSxFQUFFLEdBQUcsOERBQThEO0lBQ3pFLE9BQU81QyxJQUFJLENBQUNKLElBQUksQ0FBQ2dELEVBQUUsQ0FBQyxDQUFDOUMsS0FBSyxDQUFDckMsS0FBSyxJQUFJO01BQ2xDLE1BQU1BLEtBQUs7SUFDYixDQUFDLENBQUM7RUFDSjtFQUVBLE1BQU1xUSwrQkFBK0JBLENBQUNKLE9BQWdCLEdBQUcsQ0FBQyxDQUFDLEVBQWdCO0lBQ3pFLE1BQU0xTixJQUFJLEdBQUcwTixPQUFPLENBQUMxTixJQUFJLEtBQUsxTyxTQUFTLEdBQUdvYyxPQUFPLENBQUMxTixJQUFJLEdBQUcsSUFBSSxDQUFDMUIsT0FBTztJQUNyRSxNQUFNMFAsVUFBVSxHQUFHTixPQUFPLENBQUNPLEdBQUcsS0FBSzNjLFNBQVMsR0FBSSxHQUFFb2MsT0FBTyxDQUFDTyxHQUFJLFVBQVMsR0FBRyxZQUFZO0lBQ3RGLE1BQU1yTCxFQUFFLEdBQ04sbUxBQW1MO0lBQ3JMLE9BQU81QyxJQUFJLENBQUNKLElBQUksQ0FBQ2dELEVBQUUsRUFBRSxDQUFDb0wsVUFBVSxDQUFDLENBQUMsQ0FBQ2xPLEtBQUssQ0FBQ3JDLEtBQUssSUFBSTtNQUNoRCxNQUFNQSxLQUFLO0lBQ2IsQ0FBQyxDQUFDO0VBQ0o7QUFDRjtBQUFDeVEsT0FBQSxDQUFBdFEsc0JBQUEsR0FBQUEsc0JBQUE7QUFFRCxTQUFTYixtQkFBbUJBLENBQUNWLE9BQU8sRUFBRTtFQUNwQyxJQUFJQSxPQUFPLENBQUNuTSxNQUFNLEdBQUcsQ0FBQyxFQUFFO0lBQ3RCLE1BQU0sSUFBSThHLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQzhCLFlBQVksRUFBRyxxQ0FBb0MsQ0FBQztFQUN4RjtFQUNBLElBQ0VzRCxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUtBLE9BQU8sQ0FBQ0EsT0FBTyxDQUFDbk0sTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUNoRG1NLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBS0EsT0FBTyxDQUFDQSxPQUFPLENBQUNuTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ2hEO0lBQ0FtTSxPQUFPLENBQUN6TSxJQUFJLENBQUN5TSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7RUFDMUI7RUFDQSxNQUFNOFIsTUFBTSxHQUFHOVIsT0FBTyxDQUFDN00sTUFBTSxDQUFDLENBQUMyVCxJQUFJLEVBQUUxTSxLQUFLLEVBQUUyWCxFQUFFLEtBQUs7SUFDakQsSUFBSUMsVUFBVSxHQUFHLENBQUMsQ0FBQztJQUNuQixLQUFLLElBQUlyZSxDQUFDLEdBQUcsQ0FBQyxFQUFFQSxDQUFDLEdBQUdvZSxFQUFFLENBQUNsZSxNQUFNLEVBQUVGLENBQUMsSUFBSSxDQUFDLEVBQUU7TUFDckMsTUFBTXNlLEVBQUUsR0FBR0YsRUFBRSxDQUFDcGUsQ0FBQyxDQUFDO01BQ2hCLElBQUlzZSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUtuTCxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUltTCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUtuTCxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDMUNrTCxVQUFVLEdBQUdyZSxDQUFDO1FBQ2Q7TUFDRjtJQUNGO0lBQ0EsT0FBT3FlLFVBQVUsS0FBSzVYLEtBQUs7RUFDN0IsQ0FBQyxDQUFDO0VBQ0YsSUFBSTBYLE1BQU0sQ0FBQ2plLE1BQU0sR0FBRyxDQUFDLEVBQUU7SUFDckIsTUFBTSxJQUFJOEcsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQ3NYLHFCQUFxQixFQUNqQyx1REFBdUQsQ0FDeEQ7RUFDSDtFQUNBLE1BQU1qUyxNQUFNLEdBQUdELE9BQU8sQ0FDbkI5RixHQUFHLENBQUN5QyxLQUFLLElBQUk7SUFDWmhDLGFBQUssQ0FBQytFLFFBQVEsQ0FBQ0csU0FBUyxDQUFDZ04sVUFBVSxDQUFDbFEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUVrUSxVQUFVLENBQUNsUSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwRSxPQUFRLElBQUdBLEtBQUssQ0FBQyxDQUFDLENBQUUsS0FBSUEsS0FBSyxDQUFDLENBQUMsQ0FBRSxHQUFFO0VBQ3JDLENBQUMsQ0FBQyxDQUNEckMsSUFBSSxDQUFDLElBQUksQ0FBQztFQUNiLE9BQVEsSUFBRzJGLE1BQU8sR0FBRTtBQUN0QjtBQUVBLFNBQVNRLGdCQUFnQkEsQ0FBQ0osS0FBSyxFQUFFO0VBQy9CLElBQUksQ0FBQ0EsS0FBSyxDQUFDOFIsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO0lBQ3pCOVIsS0FBSyxJQUFJLElBQUk7RUFDZjs7RUFFQTtFQUNBLE9BQ0VBLEtBQUssQ0FDRitSLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxJQUFJO0VBQ2hDO0VBQUEsQ0FDQ0EsT0FBTyxDQUFDLFdBQVcsRUFBRSxFQUFFO0VBQ3hCO0VBQUEsQ0FDQ0EsT0FBTyxDQUFDLGVBQWUsRUFBRSxJQUFJO0VBQzlCO0VBQUEsQ0FDQ0EsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FDbkI1QyxJQUFJLEVBQUU7QUFFYjtBQUVBLFNBQVN4UixtQkFBbUJBLENBQUNxVSxDQUFDLEVBQUU7RUFDOUIsSUFBSUEsQ0FBQyxJQUFJQSxDQUFDLENBQUNDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRTtJQUMxQjtJQUNBLE9BQU8sR0FBRyxHQUFHQyxtQkFBbUIsQ0FBQ0YsQ0FBQyxDQUFDcmMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQzlDLENBQUMsTUFBTSxJQUFJcWMsQ0FBQyxJQUFJQSxDQUFDLENBQUNGLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtJQUMvQjtJQUNBLE9BQU9JLG1CQUFtQixDQUFDRixDQUFDLENBQUNyYyxLQUFLLENBQUMsQ0FBQyxFQUFFcWMsQ0FBQyxDQUFDeGUsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRztFQUM1RDs7RUFFQTtFQUNBLE9BQU8wZSxtQkFBbUIsQ0FBQ0YsQ0FBQyxDQUFDO0FBQy9CO0FBRUEsU0FBU0csaUJBQWlCQSxDQUFDbmUsS0FBSyxFQUFFO0VBQ2hDLElBQUksQ0FBQ0EsS0FBSyxJQUFJLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUksQ0FBQ0EsS0FBSyxDQUFDaWUsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0lBQ2pFLE9BQU8sS0FBSztFQUNkO0VBRUEsTUFBTTVJLE9BQU8sR0FBR3JWLEtBQUssQ0FBQ3VILEtBQUssQ0FBQyxZQUFZLENBQUM7RUFDekMsT0FBTyxDQUFDLENBQUM4TixPQUFPO0FBQ2xCO0FBRUEsU0FBUzNMLHNCQUFzQkEsQ0FBQzFDLE1BQU0sRUFBRTtFQUN0QyxJQUFJLENBQUNBLE1BQU0sSUFBSSxDQUFDMkIsS0FBSyxDQUFDQyxPQUFPLENBQUM1QixNQUFNLENBQUMsSUFBSUEsTUFBTSxDQUFDeEgsTUFBTSxLQUFLLENBQUMsRUFBRTtJQUM1RCxPQUFPLElBQUk7RUFDYjtFQUVBLE1BQU00ZSxrQkFBa0IsR0FBR0QsaUJBQWlCLENBQUNuWCxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUNTLE1BQU0sQ0FBQztFQUM5RCxJQUFJVCxNQUFNLENBQUN4SCxNQUFNLEtBQUssQ0FBQyxFQUFFO0lBQ3ZCLE9BQU80ZSxrQkFBa0I7RUFDM0I7RUFFQSxLQUFLLElBQUk5ZSxDQUFDLEdBQUcsQ0FBQyxFQUFFRSxNQUFNLEdBQUd3SCxNQUFNLENBQUN4SCxNQUFNLEVBQUVGLENBQUMsR0FBR0UsTUFBTSxFQUFFLEVBQUVGLENBQUMsRUFBRTtJQUN2RCxJQUFJOGUsa0JBQWtCLEtBQUtELGlCQUFpQixDQUFDblgsTUFBTSxDQUFDMUgsQ0FBQyxDQUFDLENBQUNtSSxNQUFNLENBQUMsRUFBRTtNQUM5RCxPQUFPLEtBQUs7SUFDZDtFQUNGO0VBRUEsT0FBTyxJQUFJO0FBQ2I7QUFFQSxTQUFTZ0MseUJBQXlCQSxDQUFDekMsTUFBTSxFQUFFO0VBQ3pDLE9BQU9BLE1BQU0sQ0FBQ3FYLElBQUksQ0FBQyxVQUFVcmUsS0FBSyxFQUFFO0lBQ2xDLE9BQU9tZSxpQkFBaUIsQ0FBQ25lLEtBQUssQ0FBQ3lILE1BQU0sQ0FBQztFQUN4QyxDQUFDLENBQUM7QUFDSjtBQUVBLFNBQVM2VyxrQkFBa0JBLENBQUNDLFNBQVMsRUFBRTtFQUNyQyxPQUFPQSxTQUFTLENBQ2JqWixLQUFLLENBQUMsRUFBRSxDQUFDLENBQ1RPLEdBQUcsQ0FBQzZRLENBQUMsSUFBSTtJQUNSLE1BQU0xSyxLQUFLLEdBQUd3UyxNQUFNLENBQUMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDNUMsSUFBSTlILENBQUMsQ0FBQ25QLEtBQUssQ0FBQ3lFLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRTtNQUMzQjtNQUNBLE9BQU8wSyxDQUFDO0lBQ1Y7SUFDQTtJQUNBLE9BQU9BLENBQUMsS0FBTSxHQUFFLEdBQUksSUFBRyxHQUFJLEtBQUlBLENBQUUsRUFBQztFQUNwQyxDQUFDLENBQUMsQ0FDRHpRLElBQUksQ0FBQyxFQUFFLENBQUM7QUFDYjtBQUVBLFNBQVNpWSxtQkFBbUJBLENBQUNGLENBQVMsRUFBRTtFQUN0QyxNQUFNUyxRQUFRLEdBQUcsb0JBQW9CO0VBQ3JDLE1BQU1DLE9BQVksR0FBR1YsQ0FBQyxDQUFDelcsS0FBSyxDQUFDa1gsUUFBUSxDQUFDO0VBQ3RDLElBQUlDLE9BQU8sSUFBSUEsT0FBTyxDQUFDbGYsTUFBTSxHQUFHLENBQUMsSUFBSWtmLE9BQU8sQ0FBQzNZLEtBQUssR0FBRyxDQUFDLENBQUMsRUFBRTtJQUN2RDtJQUNBLE1BQU00WSxNQUFNLEdBQUdYLENBQUMsQ0FBQzdYLE1BQU0sQ0FBQyxDQUFDLEVBQUV1WSxPQUFPLENBQUMzWSxLQUFLLENBQUM7SUFDekMsTUFBTXdZLFNBQVMsR0FBR0csT0FBTyxDQUFDLENBQUMsQ0FBQztJQUU1QixPQUFPUixtQkFBbUIsQ0FBQ1MsTUFBTSxDQUFDLEdBQUdMLGtCQUFrQixDQUFDQyxTQUFTLENBQUM7RUFDcEU7O0VBRUE7RUFDQSxNQUFNSyxRQUFRLEdBQUcsaUJBQWlCO0VBQ2xDLE1BQU1DLE9BQVksR0FBR2IsQ0FBQyxDQUFDelcsS0FBSyxDQUFDcVgsUUFBUSxDQUFDO0VBQ3RDLElBQUlDLE9BQU8sSUFBSUEsT0FBTyxDQUFDcmYsTUFBTSxHQUFHLENBQUMsSUFBSXFmLE9BQU8sQ0FBQzlZLEtBQUssR0FBRyxDQUFDLENBQUMsRUFBRTtJQUN2RCxNQUFNNFksTUFBTSxHQUFHWCxDQUFDLENBQUM3WCxNQUFNLENBQUMsQ0FBQyxFQUFFMFksT0FBTyxDQUFDOVksS0FBSyxDQUFDO0lBQ3pDLE1BQU13WSxTQUFTLEdBQUdNLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFFNUIsT0FBT1gsbUJBQW1CLENBQUNTLE1BQU0sQ0FBQyxHQUFHTCxrQkFBa0IsQ0FBQ0MsU0FBUyxDQUFDO0VBQ3BFOztFQUVBO0VBQ0EsT0FBT1AsQ0FBQyxDQUNMRCxPQUFPLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUM3QkEsT0FBTyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FDN0JBLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQ25CQSxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUNuQkEsT0FBTyxDQUFDLFNBQVMsRUFBRyxNQUFLLENBQUMsQ0FDMUJBLE9BQU8sQ0FBQyxVQUFVLEVBQUcsTUFBSyxDQUFDO0FBQ2hDO0FBRUEsSUFBSXpTLGFBQWEsR0FBRztFQUNsQkMsV0FBV0EsQ0FBQ3ZMLEtBQUssRUFBRTtJQUNqQixPQUFPLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssS0FBSyxJQUFJLElBQUlBLEtBQUssQ0FBQ3NELE1BQU0sS0FBSyxVQUFVO0VBQ25GO0FBQ0YsQ0FBQztBQUFDLElBQUF3YixRQUFBLEdBRWE1UixzQkFBc0I7QUFBQXNRLE9BQUEsQ0FBQWxmLE9BQUEsR0FBQXdnQixRQUFBIn0=