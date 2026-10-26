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
// -disable-next
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
  ACL: {
    '*': {
      read: true,
      write: true
    }
  },
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
    clps = {
      ...emptyCLPS,
      ...schema.classLevelPermissions
    };
  }
  let indexes = {};
  if (schema.indexes) {
    indexes = {
      ...schema.indexes
    };
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
      // Only descend into an own object, never an inherited prototype member
      object[first] = Object.hasOwn(object, first) && object[first] && typeof object[first] === 'object' ? object[first] : {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];
      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      while (next = components.shift()) {
        if (components.length === 0) {
          currentObj[next] = value;
        } else {
          currentObj[next] = Object.hasOwn(currentObj, next) && currentObj[next] && typeof currentObj[next] === 'object' ? currentObj[next] : {};
          currentObj = currentObj[next];
        }
      }
      delete object[fieldName];
    }
  });
  return object;
};
const escapeSqlString = value => value.replace(/'/g, "''");
const transformDotFieldToComponents = fieldName => {
  return fieldName.split('.').map((cmpt, index) => {
    if (index === 0) {
      return `"${cmpt.replace(/"/g, '""')}"`;
    }
    if (isArrayIndex(cmpt)) {
      return Number(cmpt);
    } else {
      return `'${escapeSqlString(cmpt)}'`;
    }
  });
};
const transformDotField = fieldName => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName.replace(/"/g, '""')}"`;
  }
  const components = transformDotFieldToComponents(fieldName);
  let name = components.slice(0, components.length - 1).join('->');
  name += '->>' + components[components.length - 1];
  return name;
};
const validateAggregateFieldName = name => {
  if (typeof name !== 'string' || !name.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) {
    throw new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, `Invalid field name: ${name}`);
  }
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
  if (!fieldName.startsWith('$')) {
    throw new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}`);
  }
  const name = fieldName.substring(1);
  validateAggregateFieldName(name);
  return name;
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
        } else if (typeof fieldValue === 'object' && !Object.keys(fieldValue).some(key => key.startsWith('$'))) {
          name = transformDotFieldToComponents(fieldName).join('->');
          patterns.push(`($${index}:raw)::jsonb = $${index + 1}::jsonb`);
          values.push(name, JSON.stringify(fieldValue));
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
      regex = processRegexPattern(regex);
      if (fieldName.indexOf('.') >= 0) {
        const name = transformDotField(fieldName);
        patterns.push(`$${index}:raw ${operator} '$${index + 1}:raw'`);
        values.push(name, regex);
      } else {
        patterns.push(`$${index}:name ${operator} '$${index + 1}:raw'`);
        values.push(fieldName, regex);
      }
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
              // eslint-disable-next-line no-console
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
    const options = {
      ...databaseOptions
    };
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    this.disableIndexFieldValidation = !!databaseOptions.disableIndexFieldValidation;
    this.schemaCacheTtl = databaseOptions.schemaCacheTtl;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'disableIndexFieldValidation']) {
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
        // eslint-disable-next-line no-console
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
          if (!this.disableIndexFieldValidation && !Object.prototype.hasOwnProperty.call(fields, key)) {
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
      try {
        if (insertedIndexes.length > 0) {
          await self.createIndexes(className, insertedIndexes, t);
        }
      } catch (e) {
        // pg-promise use Batch error see https://github.com/vitaly-t/spex/blob/e572030f261be1a8e9341fc6f637e36ad07f5231/src/errors/batch.js#L59
        const columnDoesNotExistError = e.getErrors && e.getErrors()[0] && e.getErrors()[0].code === '42703';
        // Specific case when the column does not exist
        if (columnDoesNotExistError) {
          // If the disableIndexFieldValidation is true, we should ignore the error
          if (!this.disableIndexFieldValidation) {
            throw e;
          }
        } else {
          throw e;
        }
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
    if (this._client?.$pool.ended) {
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
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema({
        className: row.className,
        ...row.schema
      }));
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
          // Check for authData unique index violations first
          const authDataMatch = error.constraint.match(/_User_unique_authData_([a-zA-Z0-9_]+)_id/);
          if (authDataMatch) {
            err.userInfo = {
              duplicated_field: `_auth_data_${authDataMatch[1]}`
            };
          } else {
            const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
            if (matches && Array.isArray(matches)) {
              err.userInfo = {
                duplicated_field: matches[1]
              };
            }
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
    const originalUpdate = {
      ...update
    };

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
        const incrementValues = [];
        if (keysToIncrement.length > 0) {
          incrementPatterns = ' || ' + keysToIncrement.map(c => {
            const amount = fieldValue[c].amount;
            if (typeof amount !== 'number') {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'incrementing must provide a number');
            }
            incrementValues.push(amount);
            const amountIndex = index + incrementValues.length;
            const safeName = escapeSqlString(c);
            return `CONCAT('{"${safeName}":', COALESCE($${index}:name->>'${safeName}','0')::int + $${amountIndex}, '}')::jsonb`;
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
          return p + ` - '$${index + 1 + incrementValues.length + i}:value'`;
        }, '');
        // Override Object
        let updateObject = "'{}'::jsonb";
        if (dotNotationOptions[fieldName]) {
          // Merge Object
          updateObject = `COALESCE($${index}:name, '{}'::jsonb)`;
        }
        updatePatterns.push(`$${index}:name = (${updateObject} ${deletePatterns} ${incrementPatterns} || $${index + 1 + incrementValues.length + keysToDelete.length}::jsonb )`);
        values.push(fieldName, ...incrementValues, ...keysToDelete, JSON.stringify(fieldValue));
        index += 2 + incrementValues.length + keysToDelete.length;
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
    const promise = (transactionalSession ? transactionalSession.t : this._client).any(qs, values).catch(error => {
      if (error.code === PostgresUniqueIndexViolationError) {
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.constraint) {
          const authDataMatch = error.constraint.match(/_User_unique_authData_([a-zA-Z0-9_]+)_id/);
          if (authDataMatch) {
            err.userInfo = {
              duplicated_field: `_auth_data_${authDataMatch[1]}`
            };
          } else {
            const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
            if (matches && Array.isArray(matches)) {
              err.userInfo = {
                duplicated_field: matches[1]
              };
            }
          }
        }
        throw err;
      }
      throw error;
    });
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

  // Creates a unique index on authData-><provider>->>'id' to prevent
  // race conditions during concurrent signups with the same authData.
  async ensureAuthDataUniqueness(provider) {
    const indexName = `_User_unique_authData_${provider}_id`;
    const qs = `CREATE UNIQUE INDEX IF NOT EXISTS $1:name ON "_User" (("authData"->$2::text->>'id')) WHERE "authData"->$2::text->>'id' IS NOT NULL`;
    await this._client.none(qs, [indexName, provider]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(indexName)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(indexName)) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
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
    const fieldSegments = fieldName.split('.');
    for (const segment of fieldSegments) {
      if (!segment.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) {
        throw new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}`);
      }
    }
    let field = fieldName;
    let column = fieldName;
    const isNested = fieldName.indexOf('.') >= 0;
    if (isNested) {
      field = transformDotFieldToComponents(fieldName).join('->');
      column = fieldSegments[0];
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
      // eslint-disable-next-line no-console
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUG9zdGdyZXNDbGllbnQiLCJyZXF1aXJlIiwiX25vZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZGFzaCIsIl91dWlkIiwiX3NxbCIsIl9TdG9yYWdlQWRhcHRlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlV0aWxzIiwiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yIiwibG9nZ2VyIiwiZGVidWciLCJhcmdzIiwiYXJndW1lbnRzIiwiY29uY2F0Iiwic2xpY2UiLCJsZW5ndGgiLCJsb2ciLCJnZXRMb2dnZXIiLCJhcHBseSIsInBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlIiwidHlwZSIsImNvbnRlbnRzIiwiSlNPTiIsInN0cmluZ2lmeSIsIlBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciIsIiRndCIsIiRsdCIsIiRndGUiLCIkbHRlIiwibW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzIiwiJGRheU9mTW9udGgiLCIkZGF5T2ZXZWVrIiwiJGRheU9mWWVhciIsIiRpc29EYXlPZldlZWsiLCIkaXNvV2Vla1llYXIiLCIkaG91ciIsIiRtaW51dGUiLCIkc2Vjb25kIiwiJG1pbGxpc2Vjb25kIiwiJG1vbnRoIiwiJHdlZWsiLCIkeWVhciIsInRvUG9zdGdyZXNWYWx1ZSIsInZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlIiwicG9zdGdyZXNWYWx1ZSIsImNhc3RUeXBlIiwidW5kZWZpbmVkIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsIk9iamVjdCIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJBQ0wiLCJyZWFkIiwid3JpdGUiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaXNBcnJheUluZGV4IiwiYXJyYXlJbmRleCIsIkFycmF5IiwiZnJvbSIsImV2ZXJ5IiwiYyIsImhhbmRsZURvdEZpZWxkcyIsIm9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJoYXNPd24iLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJlc2NhcGVTcWxTdHJpbmciLCJyZXBsYWNlIiwidHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMiLCJtYXAiLCJjbXB0IiwiaW5kZXgiLCJOdW1iZXIiLCJ0cmFuc2Zvcm1Eb3RGaWVsZCIsImpvaW4iLCJ2YWxpZGF0ZUFnZ3JlZ2F0ZUZpZWxkTmFtZSIsIm1hdGNoIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfS0VZX05BTUUiLCJ0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCIsInN0YXJ0c1dpdGgiLCJzdWJzdHJpbmciLCJ2YWxpZGF0ZUtleXMiLCJrZXkiLCJpbmNsdWRlcyIsIklOVkFMSURfTkVTVEVEX0tFWSIsImpvaW5UYWJsZXNGb3JTY2hlbWEiLCJsaXN0IiwiZmllbGQiLCJwdXNoIiwiYnVpbGRXaGVyZUNsYXVzZSIsInF1ZXJ5IiwiY2FzZUluc2Vuc2l0aXZlIiwicGF0dGVybnMiLCJ2YWx1ZXMiLCJzb3J0cyIsImlzQXJyYXlGaWVsZCIsImluaXRpYWxQYXR0ZXJuc0xlbmd0aCIsImZpZWxkVmFsdWUiLCIkZXhpc3RzIiwiYXV0aERhdGFNYXRjaCIsIiRpbiIsIiRyZWdleCIsInNvbWUiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJjb25zdHJhaW50RmllbGROYW1lIiwiJHJlbGF0aXZlVGltZSIsIklOVkFMSURfSlNPTiIsInBvaW50IiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkZXEiLCJpc0luT3JOaW4iLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwiaSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIm9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwiZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uIiwic2NoZW1hQ2FjaGVUdGwiLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsInV1aWR2NCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIl9zdHJlYW0iLCJkb25lIiwiJHBvb2wiLCJlbmQiLCJfbGlzdGVuVG9TY2hlbWEiLCJjb25uZWN0IiwiZGlyZWN0Iiwib24iLCJkYXRhIiwicGF5bG9hZCIsInBhcnNlIiwic2VuZGVySWQiLCJub25lIiwiX25vdGlmeVNjaGVtYUNoYW5nZSIsImNhdGNoIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInRhc2siLCJ0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwic2VsZiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2lkXyIsIl9pZCIsImRlbGV0ZWRJbmRleGVzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInR4IiwiY3JlYXRlSW5kZXhlcyIsImNvbHVtbkRvZXNOb3RFeGlzdEVycm9yIiwiZ2V0RXJyb3JzIiwiY29kZSIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiYmF0Y2giLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsImZpbHRlciIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwiYW55IiwicGF0aCIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsInJlc3BvbnNlIiwiaGVscGVycyIsInRoZW4iLCJkZWxldGVBbGxDbGFzc2VzIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJlbmRlZCIsInJlc3VsdHMiLCJqb2lucyIsInJlZHVjZSIsImNsYXNzZXMiLCJxdWVyaWVzIiwiZGVsZXRlRmllbGRzIiwiZmllbGROYW1lcyIsImlkeCIsImdldEFsbENsYXNzZXMiLCJyb3ciLCJnZXRDbGFzcyIsImNyZWF0ZU9iamVjdCIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sdW1uc0FycmF5IiwiZ2VvUG9pbnRzIiwiYXV0aERhdGFBbHJlYWR5RXhpc3RzIiwiYXV0aERhdGEiLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJtYXRjaGVzIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJpbmNyZW1lbnRWYWx1ZXMiLCJhbW91bnRJbmRleCIsInNhZmVOYW1lIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsIlN0cmluZyIsInVwZGF0ZWRDb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwiZW5zdXJlQXV0aERhdGFVbmlxdWVuZXNzIiwiaW5kZXhOYW1lIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiZmllbGRTZWdtZW50cyIsInNlZ21lbnQiLCJjb2x1bW4iLCJpc05lc3RlZCIsImlzUG9pbnRlckZpZWxkIiwidHJhbnNmb3JtZXIiLCJjaGlsZCIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwiaGludCIsImNvdW50RmllbGQiLCJncm91cFZhbHVlcyIsImdyb3VwUGF0dGVybiIsInN0YWdlIiwiJGdyb3VwIiwiZ3JvdXBCeUZpZWxkcyIsImFsaWFzIiwic291cmNlIiwib3BlcmF0aW9uIiwiJHN1bSIsIiRtYXgiLCIkbWluIiwiJGF2ZyIsIiRwcm9qZWN0IiwiJG1hdGNoIiwiJG9yIiwiY29sbGFwc2UiLCJlbGVtZW50IiwibWF0Y2hQYXR0ZXJucyIsIiRsaW1pdCIsIiRza2lwIiwiJHNvcnQiLCJvcmRlciIsInRyaW0iLCJCb29sZWFuIiwicGFyc2VJbnQiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicHJvbWlzZXMiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJhbGwiLCJzcWwiLCJtaXNjIiwianNvbk9iamVjdFNldEtleXMiLCJhcnJheSIsImFkZCIsImFkZFVuaXF1ZSIsInJlbW92ZSIsImNvbnRhaW5zQWxsIiwiY29udGFpbnNBbGxSZWdleCIsImNvbnRhaW5zIiwiY3R4IiwiZHVyYXRpb24iLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJnZXRJbmRleGVzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJ1cGRhdGVFc3RpbWF0ZWRDb3VudCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiZW5zdXJlSW5kZXgiLCJkZWZhdWx0SW5kZXhOYW1lIiwiaW5kZXhOYW1lT3B0aW9ucyIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJlbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzIiwiZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbiIsInR0bE9wdGlvbnMiLCJ0dGwiLCJleHBvcnRzIiwidW5pcXVlIiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlbmRzV2l0aCIsInMiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJjcmVhdGVMaXRlcmFsUmVnZXgiLCJyZW1haW5pbmciLCJSZWdFeHAiLCJtYXRjaGVyMSIsInJlc3VsdDEiLCJwcmVmaXgiLCJtYXRjaGVyMiIsInJlc3VsdDIiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gJy4vUG9zdGdyZXNDbGllbnQnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHNxbCBmcm9tICcuL3NxbCc7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hVHlwZSwgUXVlcnlUeXBlLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uLy4uLy4uL1V0aWxzJyk7XG5cbmNvbnN0IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciA9ICc0MlAwMSc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgPSAnNDJQMDcnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciA9ICc0MjcwMSc7XG5jb25zdCBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciA9ICc0MjcwMyc7XG5jb25zdCBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgPSAnMjM1MDUnO1xuY29uc3QgbG9nZ2VyID0gcmVxdWlyZSgnLi4vLi4vLi4vbG9nZ2VyJyk7XG5cbmNvbnN0IGRlYnVnID0gZnVuY3Rpb24gKC4uLmFyZ3M6IGFueSkge1xuICBhcmdzID0gWydQRzogJyArIGFyZ3VtZW50c1swXV0uY29uY2F0KGFyZ3Muc2xpY2UoMSwgYXJncy5sZW5ndGgpKTtcbiAgY29uc3QgbG9nID0gbG9nZ2VyLmdldExvZ2dlcigpO1xuICBsb2cuZGVidWcuYXBwbHkobG9nLCBhcmdzKTtcbn07XG5cbmNvbnN0IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlID0gdHlwZSA9PiB7XG4gIHN3aXRjaCAodHlwZS50eXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gJ3RpbWVzdGFtcCB3aXRoIHRpbWUgem9uZSc7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiAnanNvbmInO1xuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiAnYm9vbGVhbic7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiAncG9pbnQnO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiAnanNvbmInO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuICdwb2x5Z29uJztcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICBpZiAodHlwZS5jb250ZW50cyAmJiB0eXBlLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiAndGV4dFtdJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAnanNvbmInO1xuICAgICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBgbm8gdHlwZSBmb3IgJHtKU09OLnN0cmluZ2lmeSh0eXBlKX0geWV0YDtcbiAgfVxufTtcblxuY29uc3QgUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yID0ge1xuICAkZ3Q6ICc+JyxcbiAgJGx0OiAnPCcsXG4gICRndGU6ICc+PScsXG4gICRsdGU6ICc8PScsXG59O1xuXG5jb25zdCBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMgPSB7XG4gICRkYXlPZk1vbnRoOiAnREFZJyxcbiAgJGRheU9mV2VlazogJ0RPVycsXG4gICRkYXlPZlllYXI6ICdET1knLFxuICAkaXNvRGF5T2ZXZWVrOiAnSVNPRE9XJyxcbiAgJGlzb1dlZWtZZWFyOiAnSVNPWUVBUicsXG4gICRob3VyOiAnSE9VUicsXG4gICRtaW51dGU6ICdNSU5VVEUnLFxuICAkc2Vjb25kOiAnU0VDT05EJyxcbiAgJG1pbGxpc2Vjb25kOiAnTUlMTElTRUNPTkRTJyxcbiAgJG1vbnRoOiAnTU9OVEgnLFxuICAkd2VlazogJ1dFRUsnLFxuICAkeWVhcjogJ1lFQVInLFxufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLmlzbztcbiAgICB9XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUubmFtZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUgPSB2YWx1ZSA9PiB7XG4gIGNvbnN0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUodmFsdWUpO1xuICBsZXQgY2FzdFR5cGU7XG4gIHN3aXRjaCAodHlwZW9mIHBvc3RncmVzVmFsdWUpIHtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgY2FzdFR5cGUgPSAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIGNhc3RUeXBlID0gJ2Jvb2xlYW4nO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgIGNhc3RUeXBlID0gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiBjYXN0VHlwZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIHJldHVybiB2YWx1ZS5vYmplY3RJZDtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG4vLyBEdXBsaWNhdGUgZnJvbSB0aGVuIG1vbmdvIGFkYXB0ZXIuLi5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgZ2V0OiB7fSxcbiAgY291bnQ6IHt9LFxuICBjcmVhdGU6IHt9LFxuICB1cGRhdGU6IHt9LFxuICBkZWxldGU6IHt9LFxuICBhZGRGaWVsZDoge30sXG4gIHByb3RlY3RlZEZpZWxkczoge30sXG59KTtcblxuY29uc3QgZGVmYXVsdENMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgQUNMOiB7XG4gICAgJyonOiB7XG4gICAgICByZWFkOiB0cnVlLFxuICAgICAgd3JpdGU6IHRydWUsXG4gICAgfSxcbiAgfSxcbiAgZmluZDogeyAnKic6IHRydWUgfSxcbiAgZ2V0OiB7ICcqJzogdHJ1ZSB9LFxuICBjb3VudDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuY29uc3QgdG9QYXJzZVNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgfVxuICBpZiAoc2NoZW1hLmZpZWxkcykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIH1cbiAgbGV0IGNscHMgPSBkZWZhdWx0Q0xQUztcbiAgaWYgKHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpIHtcbiAgICBjbHBzID0geyAuLi5lbXB0eUNMUFMsIC4uLnNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfTtcbiAgfVxuICBsZXQgaW5kZXhlcyA9IHt9O1xuICBpZiAoc2NoZW1hLmluZGV4ZXMpIHtcbiAgICBpbmRleGVzID0geyAuLi5zY2hlbWEuaW5kZXhlcyB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgIGZpZWxkczogc2NoZW1hLmZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGNscHMsXG4gICAgaW5kZXhlcyxcbiAgfTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoIXNjaGVtYSkge1xuICAgIHJldHVybiBzY2hlbWE7XG4gIH1cbiAgc2NoZW1hLmZpZWxkcyA9IHNjaGVtYS5maWVsZHMgfHwge307XG4gIHNjaGVtYS5maWVsZHMuX3dwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIHNjaGVtYS5maWVsZHMuX3JwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgIHNjaGVtYS5maWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgfVxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY29uc3QgaXNBcnJheUluZGV4ID0gKGFycmF5SW5kZXgpID0+IEFycmF5LmZyb20oYXJyYXlJbmRleCkuZXZlcnkoYyA9PiBjID49ICcwJyAmJiBjIDw9ICc5Jyk7XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgLy8gT25seSBkZXNjZW5kIGludG8gYW4gb3duIG9iamVjdCwgbmV2ZXIgYW4gaW5oZXJpdGVkIHByb3RvdHlwZSBtZW1iZXJcbiAgICAgIG9iamVjdFtmaXJzdF0gPVxuICAgICAgICBPYmplY3QuaGFzT3duKG9iamVjdCwgZmlyc3QpICYmIG9iamVjdFtmaXJzdF0gJiYgdHlwZW9mIG9iamVjdFtmaXJzdF0gPT09ICdvYmplY3QnXG4gICAgICAgICAgPyBvYmplY3RbZmlyc3RdXG4gICAgICAgICAgOiB7fTtcbiAgICAgIGxldCBjdXJyZW50T2JqID0gb2JqZWN0W2ZpcnN0XTtcbiAgICAgIGxldCBuZXh0O1xuICAgICAgbGV0IHZhbHVlID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICBpZiAodmFsdWUgJiYgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdmFsdWUgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICB3aGlsZSAoKG5leHQgPSBjb21wb25lbnRzLnNoaWZ0KCkpKSB7XG4gICAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjdXJyZW50T2JqW25leHRdID1cbiAgICAgICAgICAgIE9iamVjdC5oYXNPd24oY3VycmVudE9iaiwgbmV4dCkgJiYgY3VycmVudE9ialtuZXh0XSAmJiB0eXBlb2YgY3VycmVudE9ialtuZXh0XSA9PT0gJ29iamVjdCdcbiAgICAgICAgICAgICAgPyBjdXJyZW50T2JqW25leHRdXG4gICAgICAgICAgICAgIDoge307XG4gICAgICAgICAgY3VycmVudE9iaiA9IGN1cnJlbnRPYmpbbmV4dF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuY29uc3QgZXNjYXBlU3FsU3RyaW5nID0gdmFsdWUgPT4gdmFsdWUucmVwbGFjZSgvJy9nLCBcIicnXCIpO1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0LnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgO1xuICAgIH1cbiAgICBpZiAoaXNBcnJheUluZGV4KGNtcHQpKSB7XG4gICAgICByZXR1cm4gTnVtYmVyKGNtcHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYCcke2VzY2FwZVNxbFN0cmluZyhjbXB0KX0nYDtcbiAgICB9XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGQgPSBmaWVsZE5hbWUgPT4ge1xuICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcbiAgICByZXR1cm4gYFwiJHtmaWVsZE5hbWUucmVwbGFjZSgvXCIvZywgJ1wiXCInKX1cImA7XG4gIH1cbiAgY29uc3QgY29tcG9uZW50cyA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSk7XG4gIGxldCBuYW1lID0gY29tcG9uZW50cy5zbGljZSgwLCBjb21wb25lbnRzLmxlbmd0aCAtIDEpLmpvaW4oJy0+Jyk7XG4gIG5hbWUgKz0gJy0+PicgKyBjb21wb25lbnRzW2NvbXBvbmVudHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiBuYW1lO1xufTtcblxuY29uc3QgdmFsaWRhdGVBZ2dyZWdhdGVGaWVsZE5hbWUgPSBuYW1lID0+IHtcbiAgaWYgKHR5cGVvZiBuYW1lICE9PSAnc3RyaW5nJyB8fCAhbmFtZS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9dKiQvKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBmaWVsZCBuYW1lOiAke25hbWV9YCk7XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKHR5cGVvZiBmaWVsZE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF9jcmVhdGVkX2F0Jykge1xuICAgIHJldHVybiAnY3JlYXRlZEF0JztcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF91cGRhdGVkX2F0Jykge1xuICAgIHJldHVybiAndXBkYXRlZEF0JztcbiAgfVxuICBpZiAoIWZpZWxkTmFtZS5zdGFydHNXaXRoKCckJykpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9YCk7XG4gIH1cbiAgY29uc3QgbmFtZSA9IGZpZWxkTmFtZS5zdWJzdHJpbmcoMSk7XG4gIHZhbGlkYXRlQWdncmVnYXRlRmllbGROYW1lKG5hbWUpO1xuICByZXR1cm4gbmFtZTtcbn07XG5cbmNvbnN0IHZhbGlkYXRlS2V5cyA9IG9iamVjdCA9PiB7XG4gIGlmICh0eXBlb2Ygb2JqZWN0ID09ICdvYmplY3QnKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgIHZhbGlkYXRlS2V5cyhvYmplY3Rba2V5XSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gUmV0dXJucyB0aGUgbGlzdCBvZiBqb2luIHRhYmxlcyBvbiBhIHNjaGVtYVxuY29uc3Qgam9pblRhYmxlc0ZvclNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGNvbnN0IGxpc3QgPSBbXTtcbiAgaWYgKHNjaGVtYSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGBfSm9pbjoke2ZpZWxkfToke3NjaGVtYS5jbGFzc05hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGxpc3Q7XG59O1xuXG5pbnRlcmZhY2UgV2hlcmVDbGF1c2Uge1xuICBwYXR0ZXJuOiBzdHJpbmc7XG4gIHZhbHVlczogQXJyYXk8YW55PjtcbiAgc29ydHM6IEFycmF5PGFueT47XG59XG5cbmNvbnN0IGJ1aWxkV2hlcmVDbGF1c2UgPSAoeyBzY2hlbWEsIHF1ZXJ5LCBpbmRleCwgY2FzZUluc2Vuc2l0aXZlIH0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9IHBhdHRlcm5zLmxlbmd0aDtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gcXVlcnlbZmllbGROYW1lXTtcblxuICAgIC8vIG5vdGhpbmcgaW4gdGhlIHNjaGVtYSwgaXQncyBnb25uYSBibG93IHVwXG4gICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgIC8vIGFzIGl0IHdvbid0IGV4aXN0XG4gICAgICBpZiAoZmllbGRWYWx1ZSAmJiBmaWVsZFZhbHVlLiRleGlzdHMgPT09IGZhbHNlKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgIC8vIFRPRE86IEhhbmRsZSBxdWVyeWluZyBieSBfYXV0aF9kYXRhX3Byb3ZpZGVyLCBhdXRoRGF0YSBpcyBzdG9yZWQgaW4gYXV0aERhdGEgZmllbGRcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAoY2FzZUluc2Vuc2l0aXZlICYmIChmaWVsZE5hbWUgPT09ICd1c2VybmFtZScgfHwgZmllbGROYW1lID09PSAnZW1haWwnKSkge1xuICAgICAgcGF0dGVybnMucHVzaChgTE9XRVIoJCR7aW5kZXh9Om5hbWUpID0gTE9XRVIoJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICBsZXQgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3IElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2gobmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgICAgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9OnJhdyk6Ompzb25iIEA+ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kaW4pKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGxhdGVyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyA9ICQke2luZGV4ICsgMX06OnRleHRgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICFPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgnJCcpKVxuICAgICAgICApIHtcbiAgICAgICAgICBuYW1lID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06cmF3KTo6anNvbmIgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IGZpZWxkVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgLy8gQ2FuJ3QgY2FzdCBib29sZWFuIHRvIGRvdWJsZSBwcmVjaXNpb25cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdOdW1iZXInKSB7XG4gICAgICAgIC8vIFNob3VsZCBhbHdheXMgcmV0dXJuIHplcm8gcmVzdWx0c1xuICAgICAgICBjb25zdCBNQVhfSU5UX1BMVVNfT05FID0gOTIyMzM3MjAzNjg1NDc3NTgwODtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBNQVhfSU5UX1BMVVNfT05FKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICB9XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoWyckb3InLCAnJG5vcicsICckYW5kJ10uaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgY29uc3QgY2xhdXNlcyA9IFtdO1xuICAgICAgY29uc3QgY2xhdXNlVmFsdWVzID0gW107XG4gICAgICBmaWVsZFZhbHVlLmZvckVhY2goc3ViUXVlcnkgPT4ge1xuICAgICAgICBjb25zdCBjbGF1c2UgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgcXVlcnk6IHN1YlF1ZXJ5LFxuICAgICAgICAgIGluZGV4LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjbGF1c2UucGF0dGVybi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xhdXNlcy5wdXNoKGNsYXVzZS5wYXR0ZXJuKTtcbiAgICAgICAgICBjbGF1c2VWYWx1ZXMucHVzaCguLi5jbGF1c2UudmFsdWVzKTtcbiAgICAgICAgICBpbmRleCArPSBjbGF1c2UudmFsdWVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yT3JBbmQgPSBmaWVsZE5hbWUgPT09ICckYW5kJyA/ICcgQU5EICcgOiAnIE9SICc7XG4gICAgICBjb25zdCBub3QgPSBmaWVsZE5hbWUgPT09ICckbm9yJyA/ICcgTk9UICcgOiAnJztcblxuICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9KCR7Y2xhdXNlcy5qb2luKG9yT3JBbmQpfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKC4uLmNsYXVzZVZhbHVlcyk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgZmllbGRWYWx1ZS4kbmUgPSBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZS4kbmVdKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgTk9UIGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lID09PSBudWxsKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gaWYgbm90IG51bGwsIHdlIG5lZWQgdG8gbWFudWFsbHkgZXhjbHVkZSBudWxsXG4gICAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgYCgkJHtpbmRleH06bmFtZSA8PiBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgICAgID8gYENBU1QgKCgke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9KSBBUyAke2Nhc3RUeXBlfSlgXG4gICAgICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICAgIGAoJHtjb25zdHJhaW50RmllbGROYW1lfSA8PiAkJHtpbmRleCArIDF9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kbmUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSA8PiAkJHtpbmRleCArIDF9IE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmU7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUT0RPOiBzdXBwb3J0IGFycmF5c1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJG5lKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGVxICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRlcSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgY29uc3QgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke2NvbnN0cmFpbnRGaWVsZE5hbWV9ID0gJCR7aW5kZXgrK31gKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXEgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGVxLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGlzSW5Pck5pbiA9IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pIHx8IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kbmluKTtcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSAmJlxuICAgICAgaXNBcnJheUZpZWxkICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJ1xuICAgICkge1xuICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgbGV0IGFsbG93TnVsbCA9IGZhbHNlO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGZpZWxkVmFsdWUuJGluLmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGxpc3RFbGVtID09PSBudWxsKSB7XG4gICAgICAgICAgYWxsb3dOdWxsID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXggLSAoYWxsb3dOdWxsID8gMSA6IDApfWApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChhbGxvd051bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpuYW1lIElTIE5VTEwgT1IgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0gYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGwoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRhbGwpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRhbGwubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGFsbFswXS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kZXhpc3RzLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJGV4aXN0cykge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOT1QgTlVMTGApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5KSB7XG4gICAgICBjb25zdCBhcnIgPSBmaWVsZFZhbHVlLiRjb250YWluZWRCeTtcbiAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YCk7XG4gICAgICB9XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIDxAICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGFycikpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kdGV4dCkge1xuICAgICAgY29uc3Qgc2VhcmNoID0gZmllbGRWYWx1ZS4kdGV4dC4kc2VhcmNoO1xuICAgICAgbGV0IGxhbmd1YWdlID0gJ2VuZ2xpc2gnO1xuICAgICAgaWYgKHR5cGVvZiBzZWFyY2ggIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgKTtcbiAgICAgIH1cbiAgICAgIGlmICghc2VhcmNoLiR0ZXJtIHx8IHR5cGVvZiBzZWFyY2guJHRlcm0gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRsYW5ndWFnZSAmJiB0eXBlb2Ygc2VhcmNoLiRsYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UpIHtcbiAgICAgICAgbGFuZ3VhZ2UgPSBzZWFyY2guJGxhbmd1YWdlO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlIG5vdCBzdXBwb3J0ZWQsIHBsZWFzZSB1c2UgJHJlZ2V4IG9yIGNyZWF0ZSBhIHNlcGFyYXRlIGxvd2VyIGNhc2UgY29sdW1uLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlIC0gZmFsc2Ugbm90IHN1cHBvcnRlZCwgaW5zdGFsbCBQb3N0Z3JlcyBVbmFjY2VudCBFeHRlbnNpb25gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgdG9fdHN2ZWN0b3IoJCR7aW5kZXh9LCAkJHtpbmRleCArIDF9Om5hbWUpIEBAIHRvX3RzcXVlcnkoJCR7aW5kZXggKyAyfSwgJCR7aW5kZXggKyAzfSlgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2gobGFuZ3VhZ2UsIGZpZWxkTmFtZSwgbGFuZ3VhZ2UsIHNlYXJjaC4kdGVybSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZWFyU3BoZXJlKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lYXJTcGhlcmU7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGZpZWxkVmFsdWUuJG1heERpc3RhbmNlO1xuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgc29ydHMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgQVNDYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHdpdGhpbiAmJiBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveCkge1xuICAgICAgY29uc3QgYm94ID0gZmllbGRWYWx1ZS4kd2l0aGluLiRib3g7XG4gICAgICBjb25zdCBsZWZ0ID0gYm94WzBdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IGJvdHRvbSA9IGJveFswXS5sYXRpdHVkZTtcbiAgICAgIGNvbnN0IHJpZ2h0ID0gYm94WzFdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IHRvcCA9IGJveFsxXS5sYXRpdHVkZTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OmJveGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCgke2xlZnR9LCAke2JvdHRvbX0pLCAoJHtyaWdodH0sICR7dG9wfSkpYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlO1xuICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uKSB7XG4gICAgICBjb25zdCBwb2x5Z29uID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uO1xuICAgICAgbGV0IHBvaW50cztcbiAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBvaW50cyA9IHBvaW50c1xuICAgICAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAoJHtwb2ludFswXX0sICR7cG9pbnRbMV19KWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbignLCAnKTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50c30pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cyAmJiBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludCkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludDtcbiAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2x5Z29uIEA+ICQke2luZGV4ICsgMX06OnBvaW50YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICBsZXQgcmVnZXggPSBmaWVsZFZhbHVlLiRyZWdleDtcbiAgICAgIGxldCBvcGVyYXRvciA9ICd+JztcbiAgICAgIGNvbnN0IG9wdHMgPSBmaWVsZFZhbHVlLiRvcHRpb25zO1xuICAgICAgaWYgKG9wdHMpIHtcbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZignaScpID49IDApIHtcbiAgICAgICAgICBvcGVyYXRvciA9ICd+Kic7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZigneCcpID49IDApIHtcbiAgICAgICAgICByZWdleCA9IHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJlZ2V4ID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihyZWdleCk7XG5cbiAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgJHtvcGVyYXRvcn0gJyQke2luZGV4ICsgMX06cmF3J2ApO1xuICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCByZWdleCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke29wZXJhdG9yfSAnJCR7aW5kZXggKyAxfTpyYXcnYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcmVnZXgpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZV0pKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5pc28pO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGluZGV4ICs9IDM7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgbGV0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcblxuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBvc3RncmVzVmFsdWUgPT09ICdvYmplY3QnICYmIHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IFV0aWxzLnJlbGF0aXZlVGltZVRvRGF0ZShwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgICBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHBhcnNlclJlc3VsdC5yZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7cG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lfSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuICBlbmFibGVTY2hlbWFIb29rczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9wZ3A6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICBfdXVpZDogYW55O1xuICBzY2hlbWFDYWNoZVR0bDogP251bWJlcjtcbiAgZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uOiBib29sZWFuO1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIGRhdGFiYXNlT3B0aW9ucyA9IHt9IH06IGFueSkge1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7IC4uLmRhdGFiYXNlT3B0aW9ucyB9O1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MgPSAhIWRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcztcbiAgICB0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiA9ICEhZGF0YWJhc2VPcHRpb25zLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbjtcblxuICAgIHRoaXMuc2NoZW1hQ2FjaGVUdGwgPSBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGw7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWydlbmFibGVTY2hlbWFIb29rcycsICdzY2hlbWFDYWNoZVR0bCcsICdkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24nXSkge1xuICAgICAgZGVsZXRlIG9wdGlvbnNba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGNsaWVudCwgcGdwIH0gPSBjcmVhdGVDbGllbnQodXJpLCBvcHRpb25zKTtcbiAgICB0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSAoKSA9PiB7IH07XG4gICAgdGhpcy5fcGdwID0gcGdwO1xuICAgIHRoaXMuX3V1aWQgPSB1dWlkdjQoKTtcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSBmYWxzZTtcbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIC8vTm90ZSB0aGF0IGFuYWx5emU9dHJ1ZSB3aWxsIHJ1biB0aGUgcXVlcnksIGV4ZWN1dGluZyBJTlNFUlRTLCBERUxFVEVTLCBldGMuXG4gIGNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkocXVlcnk6IHN0cmluZywgYW5hbHl6ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgaWYgKGFuYWx5emUpIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoQU5BTFlaRSwgRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbS5kb25lKCk7XG4gICAgICBkZWxldGUgdGhpcy5fc3RyZWFtO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuX2NsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLl9jbGllbnQuJHBvb2wuZW5kKCk7XG4gIH1cblxuICBhc3luYyBfbGlzdGVuVG9TY2hlbWEoKSB7XG4gICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgdGhpcy5fc3RyZWFtID0gYXdhaXQgdGhpcy5fY2xpZW50LmNvbm5lY3QoeyBkaXJlY3Q6IHRydWUgfSk7XG4gICAgICB0aGlzLl9zdHJlYW0uY2xpZW50Lm9uKCdub3RpZmljYXRpb24nLCBkYXRhID0+IHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoZGF0YS5wYXlsb2FkKTtcbiAgICAgICAgaWYgKHBheWxvYWQuc2VuZGVySWQgIT09IHRoaXMuX3V1aWQpIHtcbiAgICAgICAgICB0aGlzLl9vbmNoYW5nZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuX3N0cmVhbS5ub25lKCdMSVNURU4gJDF+JywgJ3NjaGVtYS5jaGFuZ2UnKTtcbiAgICB9XG4gIH1cblxuICBfbm90aWZ5U2NoZW1hQ2hhbmdlKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbVxuICAgICAgICAubm9uZSgnTk9USUZZICQxfiwgJDInLCBbJ3NjaGVtYS5jaGFuZ2UnLCB7IHNlbmRlcklkOiB0aGlzLl91dWlkIH1dKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBOb3RpZnk6JywgZXJyb3IpOyAvLyB1bmxpa2VseSB0byBldmVyIGhhcHBlblxuICAgICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyhjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgYXdhaXQgY29ublxuICAgICAgLm5vbmUoXG4gICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBcIl9TQ0hFTUFcIiAoIFwiY2xhc3NOYW1lXCIgdmFyQ2hhcigxMjApLCBcInNjaGVtYVwiIGpzb25iLCBcImlzUGFyc2VDbGFzc1wiIGJvb2wsIFBSSU1BUlkgS0VZIChcImNsYXNzTmFtZVwiKSApJ1xuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQub25lKFxuICAgICAgJ1NFTEVDVCBFWElTVFMgKFNFTEVDVCAxIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlcyBXSEVSRSB0YWJsZV9uYW1lID0gJDEpJyxcbiAgICAgIFtuYW1lXSxcbiAgICAgIGEgPT4gYS5leGlzdHNcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudGFzaygnc2V0LWNsYXNzLWxldmVsLXBlcm1pc3Npb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2NsYXNzTGV2ZWxQZXJtaXNzaW9ucycsIEpTT04uc3RyaW5naWZ5KENMUHMpXTtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgYFVQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzXG4gICAgICApO1xuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVkSW5kZXhlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgZGVsZXRlZEluZGV4ZXMucHVzaChuYW1lKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIXRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uICYmXG4gICAgICAgICAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywga2V5KVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGFzeW5jIHQgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgYXdhaXQgc2VsZi5jcmVhdGVJbmRleGVzKGNsYXNzTmFtZSwgaW5zZXJ0ZWRJbmRleGVzLCB0KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBwZy1wcm9taXNlIHVzZSBCYXRjaCBlcnJvciBzZWUgaHR0cHM6Ly9naXRodWIuY29tL3ZpdGFseS10L3NwZXgvYmxvYi9lNTcyMDMwZjI2MWJlMWE4ZTkzNDFmYzZmNjM3ZTM2YWQwN2Y1MjMxL3NyYy9lcnJvcnMvYmF0Y2guanMjTDU5XG4gICAgICAgIGNvbnN0IGNvbHVtbkRvZXNOb3RFeGlzdEVycm9yID0gZS5nZXRFcnJvcnMgJiYgZS5nZXRFcnJvcnMoKVswXSAmJiBlLmdldEVycm9ycygpWzBdLmNvZGUgPT09ICc0MjcwMyc7XG4gICAgICAgIC8vIFNwZWNpZmljIGNhc2Ugd2hlbiB0aGUgY29sdW1uIGRvZXMgbm90IGV4aXN0XG4gICAgICAgIGlmIChjb2x1bW5Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIC8vIElmIHRoZSBkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24gaXMgdHJ1ZSwgd2Ugc2hvdWxkIGlnbm9yZSB0aGUgZXJyb3JcbiAgICAgICAgICBpZiAoIXRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uKSB7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDEnLFxuICAgICAgICBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2luZGV4ZXMnLCBKU09OLnN0cmluZ2lmeShleGlzdGluZ0luZGV4ZXMpXVxuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46ID9hbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcGFyc2VTY2hlbWEgPSBhd2FpdCBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLmNyZWF0ZVRhYmxlKGNsYXNzTmFtZSwgc2NoZW1hLCB0KTtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdJTlNFUlQgSU5UTyBcIl9TQ0hFTUFcIiAoXCJjbGFzc05hbWVcIiwgXCJzY2hlbWFcIiwgXCJpc1BhcnNlQ2xhc3NcIikgVkFMVUVTICgkPGNsYXNzTmFtZT4sICQ8c2NoZW1hPiwgdHJ1ZSknLFxuICAgICAgICAgIHsgY2xhc3NOYW1lLCBzY2hlbWEgfVxuICAgICAgICApO1xuICAgICAgICBhd2FpdCB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzLCB0KTtcbiAgICAgICAgcmV0dXJuIHRvUGFyc2VTY2hlbWEoc2NoZW1hKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiYgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJyk7XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBjb25zdCBwYXR0ZXJuc0FycmF5ID0gW107XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmFzc2lnbih7fSwgc2NoZW1hLmZpZWxkcyk7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9mYWlsZWRfbG9naW5fY291bnQgPSB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gICAgfVxuICAgIGxldCBpbmRleCA9IDI7XG4gICAgY29uc3QgcmVsYXRpb25zID0gW107XG4gICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShxcywgdmFsdWVzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgdGhlIGVycm9yLlxuICAgICAgfVxuICAgICAgYXdhaXQgdC50eCgnY3JlYXRlLXRhYmxlLXR4JywgdHggPT4ge1xuICAgICAgICByZXR1cm4gdHguYmF0Y2goXG4gICAgICAgICAgcmVsYXRpb25zLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJyk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgYXdhaXQgY29ubi50YXNrKCdzY2hlbWEtdXBncmFkZScsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgY29sdW1ucyA9IGF3YWl0IHQubWFwKFxuICAgICAgICAnU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgV0hFUkUgdGFibGVfbmFtZSA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgY2xhc3NOYW1lIH0sXG4gICAgICAgIGEgPT4gYS5jb2x1bW5fbmFtZVxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5ld0NvbHVtbnMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gY29sdW1ucy5pbmRleE9mKGl0ZW0pID09PSAtMSlcbiAgICAgICAgLm1hcChmaWVsZE5hbWUgPT4gc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycpO1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnYWRkLWZpZWxkLWlmLW5vdC1leGlzdHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmICh0eXBlLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgICAnQUxURVIgVEFCTEUgJDxjbGFzc05hbWU6bmFtZT4gQUREIENPTFVNTiBJRiBOT1QgRVhJU1RTICQ8ZmllbGROYW1lOm5hbWU+ICQ8cG9zdGdyZXNUeXBlOnJhdz4nLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgcG9zdGdyZXNUeXBlOiBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSh0eXBlKSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmNyZWF0ZUNsYXNzKGNsYXNzTmFtZSwgeyBmaWVsZHM6IHsgW2ZpZWxkTmFtZV06IHR5cGUgfSB9LCB0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDb2x1bW4gYWxyZWFkeSBleGlzdHMsIGNyZWF0ZWQgYnkgb3RoZXIgcmVxdWVzdC4gQ2Fycnkgb24gdG8gc2VlIGlmIGl0J3MgdGhlIHJpZ2h0IHR5cGUuXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0LmFueShcbiAgICAgICAgJ1NFTEVDVCBcInNjaGVtYVwiIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPiBhbmQgKFwic2NoZW1hXCI6Ompzb24tPlxcJ2ZpZWxkc1xcJy0+JDxmaWVsZE5hbWU+KSBpcyBub3QgbnVsbCcsXG4gICAgICAgIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdFswXSkge1xuICAgICAgICB0aHJvdyAnQXR0ZW1wdGVkIHRvIGFkZCBhIGZpZWxkIHRoYXQgYWxyZWFkeSBleGlzdHMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ3VwZGF0ZS1zY2hlbWEtZmllbGQtb3B0aW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChvcGVyYXRpb25zKSkpXG4gICAgICAudGhlbigoKSA9PiBjbGFzc05hbWUuaW5kZXhPZignX0pvaW46JykgIT0gMCk7IC8vIHJlc29sdmVzIHdpdGggZmFsc2Ugd2hlbiBfSm9pbiB0YWJsZVxuXG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG5cbiAgLy8gRGVsZXRlIGFsbCBkYXRhIGtub3duIHRvIHRoaXMgYWRhcHRlci4gVXNlZCBmb3IgdGVzdGluZy5cbiAgYXN5bmMgZGVsZXRlQWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBoZWxwZXJzID0gdGhpcy5fcGdwLmhlbHBlcnM7XG4gICAgZGVidWcoJ2RlbGV0ZUFsbENsYXNzZXMnKTtcbiAgICBpZiAodGhpcy5fY2xpZW50Py4kcG9vbC5lbmRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50YXNrKCdkZWxldGUtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInKTtcbiAgICAgICAgICBjb25zdCBqb2lucyA9IHJlc3VsdHMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGxpc3QuY29uY2F0KGpvaW5UYWJsZXNGb3JTY2hlbWEoc2NoZW1hLnNjaGVtYSkpO1xuICAgICAgICAgIH0sIFtdKTtcbiAgICAgICAgICBjb25zdCBjbGFzc2VzID0gW1xuICAgICAgICAgICAgJ19TQ0hFTUEnLFxuICAgICAgICAgICAgJ19QdXNoU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgICAgICAgJ19Ib29rcycsXG4gICAgICAgICAgICAnX0dsb2JhbENvbmZpZycsXG4gICAgICAgICAgICAnX0dyYXBoUUxDb25maWcnLFxuICAgICAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgICAgICAnX0lkZW1wb3RlbmN5JyxcbiAgICAgICAgICAgIC4uLnJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuY2xhc3NOYW1lKSxcbiAgICAgICAgICAgIC4uLmpvaW5zLFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3QgcXVlcmllcyA9IGNsYXNzZXMubWFwKGNsYXNzTmFtZSA9PiAoe1xuICAgICAgICAgICAgcXVlcnk6ICdEUk9QIFRBQkxFIElGIEVYSVNUUyAkPGNsYXNzTmFtZTpuYW1lPicsXG4gICAgICAgICAgICB2YWx1ZXM6IHsgY2xhc3NOYW1lIH0sXG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIGF3YWl0IHQudHgodHggPT4gdHgubm9uZShoZWxwZXJzLmNvbmNhdChxdWVyaWVzKSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBObyBfU0NIRU1BIGNvbGxlY3Rpb24uIERvbid0IGRlbGV0ZSBhbnl0aGluZy5cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgZGVidWcoYGRlbGV0ZUFsbENsYXNzZXMgZG9uZSBpbiAke25ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbm93fWApO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBhc3luYyBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnZGVsZXRlLWZpZWxkcycsIGFzeW5jIHQgPT4ge1xuICAgICAgYXdhaXQgdC5ub25lKCdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCIgPSAkPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uc31gLCB2YWx1ZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIHJldHVybiBhd2FpdCB0Lm1hcCgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicsIG51bGwsIHJvdyA9PlxuICAgICAgICB0b1BhcnNlU2NoZW1hKHsgY2xhc3NOYW1lOiByb3cuY2xhc3NOYW1lLCAuLi5yb3cuc2NoZW1hIH0pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgYXN5bmMgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZ2V0Q2xhc3MnKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnKTtcbiAgICBsZXQgY29sdW1uc0FycmF5ID0gW107XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzID0ge307XG5cbiAgICBvYmplY3QgPSBoYW5kbGVEb3RGaWVsZHMob2JqZWN0KTtcblxuICAgIHZhbGlkYXRlS2V5cyhvYmplY3QpO1xuXG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGNvbnN0IGF1dGhEYXRhQWxyZWFkeUV4aXN0cyA9ICEhb2JqZWN0LmF1dGhEYXRhO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddID0gb2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZmllbGROYW1lID0gJ2F1dGhEYXRhJztcbiAgICAgICAgLy8gQXZvaWQgYWRkaW5nIGF1dGhEYXRhIG11bHRpcGxlIHRpbWVzIHRvIHRoZSBxdWVyeVxuICAgICAgICBpZiAoYXV0aERhdGFBbHJlYWR5RXhpc3RzKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbHVtbnNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2ZhaWxlZF9sb2dpbl9jb3VudCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfaGlzdG9yeSdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Jykge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCdcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm9iamVjdElkKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyYXknOlxuICAgICAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkob2JqZWN0W2ZpZWxkTmFtZV0pKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ubmFtZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvbHlnb24nOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKG9iamVjdFtmaWVsZE5hbWVdLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgICAgLy8gcG9wIHRoZSBwb2ludCBhbmQgcHJvY2VzcyBsYXRlclxuICAgICAgICAgIGdlb1BvaW50c1tmaWVsZE5hbWVdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgY29sdW1uc0FycmF5LnBvcCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IGBUeXBlICR7c2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGV9IG5vdCBzdXBwb3J0ZWQgeWV0YDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbHVtbnNBcnJheSA9IGNvbHVtbnNBcnJheS5jb25jYXQoT2JqZWN0LmtleXMoZ2VvUG9pbnRzKSk7XG4gICAgY29uc3QgaW5pdGlhbFZhbHVlcyA9IHZhbHVlc0FycmF5Lm1hcCgodmFsLCBpbmRleCkgPT4ge1xuICAgICAgbGV0IHRlcm1pbmF0aW9uID0gJyc7XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBjb2x1bW5zQXJyYXlbaW5kZXhdO1xuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6dGV4dFtdJztcbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6anNvbmInO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtpbmRleCArIDIgKyBjb2x1bW5zQXJyYXkubGVuZ3RofSR7dGVybWluYXRpb259YDtcbiAgICB9KTtcbiAgICBjb25zdCBnZW9Qb2ludHNJbmplY3RzID0gT2JqZWN0LmtleXMoZ2VvUG9pbnRzKS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZ2VvUG9pbnRzW2tleV07XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlLmxvbmdpdHVkZSwgdmFsdWUubGF0aXR1ZGUpO1xuICAgICAgY29uc3QgbCA9IHZhbHVlc0FycmF5Lmxlbmd0aCArIGNvbHVtbnNBcnJheS5sZW5ndGg7XG4gICAgICByZXR1cm4gYFBPSU5UKCQke2x9LCAkJHtsICsgMX0pYDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbHVtbnNQYXR0ZXJuID0gY29sdW1uc0FycmF5Lm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApLmpvaW4oKTtcbiAgICBjb25zdCB2YWx1ZXNQYXR0ZXJuID0gaW5pdGlhbFZhbHVlcy5jb25jYXQoZ2VvUG9pbnRzSW5qZWN0cykuam9pbigpO1xuXG4gICAgY29uc3QgcXMgPSBgSU5TRVJUIElOVE8gJDE6bmFtZSAoJHtjb2x1bW5zUGF0dGVybn0pIFZBTFVFUyAoJHt2YWx1ZXNQYXR0ZXJufSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmNvbHVtbnNBcnJheSwgLi4udmFsdWVzQXJyYXldO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm5vbmUocXMsIHZhbHVlcylcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW29iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yKSB7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLmNvbnN0cmFpbnQpIHtcbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBhdXRoRGF0YSB1bmlxdWUgaW5kZXggdmlvbGF0aW9ucyBmaXJzdFxuICAgICAgICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGVycm9yLmNvbnN0cmFpbnQubWF0Y2goL19Vc2VyX3VuaXF1ZV9hdXRoRGF0YV8oW2EtekEtWjAtOV9dKylfaWQvKTtcbiAgICAgICAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogYF9hdXRoX2RhdGFfJHthdXRoRGF0YU1hdGNoWzFdfWAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5jb25zdHJhaW50Lm1hdGNoKC91bmlxdWVfKFthLXpBLVpdKykvKTtcbiAgICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yID0gZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgYXN5bmMgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2RlbGV0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3QgaW5kZXggPSAyO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGlmIChPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB3aGVyZS5wYXR0ZXJuID0gJ1RSVUUnO1xuICAgIH1cbiAgICBjb25zdCBxcyA9IGBXSVRIIGRlbGV0ZWQgQVMgKERFTEVURSBGUk9NICQxOm5hbWUgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufSBSRVRVUk5JTkcgKikgU0VMRUNUIGNvdW50KCopIEZST00gZGVsZXRlZGA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScpO1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbihcbiAgICAgIHZhbCA9PiB2YWxbMF1cbiAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHVwZGF0ZVBhdHRlcm5zID0gW107XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG5cbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHsgLi4udXBkYXRlIH07XG5cbiAgICAvLyBTZXQgZmxhZyBmb3IgZG90IG5vdGF0aW9uIGZpZWxkc1xuICAgIGNvbnN0IGRvdE5vdGF0aW9uT3B0aW9ucyA9IHt9O1xuICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmlyc3RdID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdXBkYXRlID0gaGFuZGxlRG90RmllbGRzKHVwZGF0ZSk7XG4gICAgLy8gUmVzb2x2ZSBhdXRoRGF0YSBmaXJzdCxcbiAgICAvLyBTbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCBtdWx0aXBsZSBrZXkgdXBkYXRlc1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ10gPSB1cGRhdGVbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGZpZWxkVmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIC8vIERyb3AgYW55IHVuZGVmaW5lZCB2YWx1ZXMuXG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09ICdhdXRoRGF0YScpIHtcbiAgICAgICAgLy8gVGhpcyByZWN1cnNpdmVseSBzZXRzIHRoZSBqc29uX29iamVjdFxuICAgICAgICAvLyBPbmx5IDEgbGV2ZWwgZGVlcFxuICAgICAgICBjb25zdCBnZW5lcmF0ZSA9IChqc29uYjogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBganNvbl9vYmplY3Rfc2V0X2tleShDT0FMRVNDRSgke2pzb25ifSwgJ3t9Jzo6anNvbmIpLCAke2tleX0sICR7dmFsdWV9KTo6anNvbmJgO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBsYXN0S2V5ID0gYCQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgY29uc3QgZmllbGROYW1lSW5kZXggPSBpbmRleDtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZmllbGRWYWx1ZSkucmVkdWNlKChsYXN0S2V5OiBzdHJpbmcsIGtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RyID0gZ2VuZXJhdGUobGFzdEtleSwgYCQke2luZGV4fTo6dGV4dGAsIGAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgbGV0IHZhbHVlID0gZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9LCBsYXN0S2V5KTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7ZmllbGROYW1lSW5kZXh9Om5hbWUgPSAke3VwZGF0ZX1gKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnSW5jcmVtZW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAwKSArICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmFtb3VudCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGQoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkVW5pcXVlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZF91bmlxdWUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIC8vVE9ETzogc3RvcCBzcGVjaWFsIGNhc2luZyB0aGlzLiBJdCBzaG91bGQgY2hlY2sgZm9yIF9fdHlwZSA9PT0gJ0RhdGUnIGFuZCB1c2UgLmlzb1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICkge1xuICAgICAgICAvLyBHYXRoZXIga2V5cyB0byBpbmNyZW1lbnRcbiAgICAgICAgY29uc3Qga2V5c1RvSW5jcmVtZW50ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgT2JqZWN0LmtleXMgaXMgaXRlcmF0aW5nIG92ZXIgdGhlICoqb3JpZ2luYWwqKiB1cGRhdGUgb2JqZWN0XG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBzb21lIG9mIHRoZSBrZXlzIG9mIHRoZSBvcmlnaW5hbCB1cGRhdGUgY291bGQgYmUgbnVsbCBvciB1bmRlZmluZWQ6XG4gICAgICAgICAgICAvLyAoU2VlIHRoZSBhYm92ZSBjaGVjayBgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIGZpZWxkVmFsdWUgPT0gXCJ1bmRlZmluZWRcIilgKVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgY29uc3QgaW5jcmVtZW50VmFsdWVzID0gW107XG4gICAgICAgIGlmIChrZXlzVG9JbmNyZW1lbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGluY3JlbWVudFBhdHRlcm5zID1cbiAgICAgICAgICAgICcgfHwgJyArXG4gICAgICAgICAgICBrZXlzVG9JbmNyZW1lbnRcbiAgICAgICAgICAgICAgLm1hcChjID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhbW91bnQgPSBmaWVsZFZhbHVlW2NdLmFtb3VudDtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdpbmNyZW1lbnRpbmcgbXVzdCBwcm92aWRlIGEgbnVtYmVyJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGluY3JlbWVudFZhbHVlcy5wdXNoKGFtb3VudCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYW1vdW50SW5kZXggPSBpbmRleCArIGluY3JlbWVudFZhbHVlcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2FmZU5hbWUgPSBlc2NhcGVTcWxTdHJpbmcoYyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBDT05DQVQoJ3tcIiR7c2FmZU5hbWV9XCI6JywgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUtPj4nJHtzYWZlTmFtZX0nLCcwJyk6OmludCArICQke2Ftb3VudEluZGV4fSwgJ30nKTo6anNvbmJgO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbignIHx8ICcpO1xuICAgICAgICAgIC8vIFN0cmlwIHRoZSBrZXlzXG4gICAgICAgICAga2V5c1RvSW5jcmVtZW50LmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXQuXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGNvbnN0IGRlbGV0ZVBhdHRlcm5zID0ga2V5c1RvRGVsZXRlLnJlZHVjZSgocDogc3RyaW5nLCBjOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpbmNyZW1lbnRWYWx1ZXMubGVuZ3RoICsgaX06dmFsdWUnYDtcbiAgICAgICAgfSwgJycpO1xuICAgICAgICAvLyBPdmVycmlkZSBPYmplY3RcbiAgICAgICAgbGV0IHVwZGF0ZU9iamVjdCA9IFwiJ3t9Jzo6anNvbmJcIjtcblxuICAgICAgICBpZiAoZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAvLyBNZXJnZSBPYmplY3RcbiAgICAgICAgICB1cGRhdGVPYmplY3QgPSBgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICd7fSc6Ompzb25iKWA7XG4gICAgICAgIH1cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSAoJHt1cGRhdGVPYmplY3R9ICR7ZGVsZXRlUGF0dGVybnN9ICR7aW5jcmVtZW50UGF0dGVybnN9IHx8ICQke2luZGV4ICsgMSArIGluY3JlbWVudFZhbHVlcy5sZW5ndGggKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5pbmNyZW1lbnRWYWx1ZXMsIC4uLmtleXNUb0RlbGV0ZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyICsgaW5jcmVtZW50VmFsdWVzLmxlbmd0aCArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIHsgZmllbGROYW1lLCBmaWVsZFZhbHVlIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdXBkYXRlICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9IHlldGBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvcikge1xuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5jb25zdHJhaW50KSB7XG4gICAgICAgICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZXJyb3IuY29uc3RyYWludC5tYXRjaCgvX1VzZXJfdW5pcXVlX2F1dGhEYXRhXyhbYS16QS1aMC05X10rKV9pZC8pO1xuICAgICAgICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBgX2F1dGhfZGF0YV8ke2F1dGhEYXRhTWF0Y2hbMV19YCB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLmNvbnN0cmFpbnQubWF0Y2goL3VuaXF1ZV8oW2EtekEtWl0rKS8pO1xuICAgICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSwgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygndXBzZXJ0T25lT2JqZWN0Jyk7XG4gICAgY29uc3QgY3JlYXRlVmFsdWUgPSBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgdXBkYXRlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVPYmplY3QoY2xhc3NOYW1lLCBzY2hlbWEsIGNyZWF0ZVZhbHVlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gaWdub3JlIGR1cGxpY2F0ZSB2YWx1ZSBlcnJvcnMgYXMgaXQncyB1cHNlcnRcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maW5kT25lQW5kVXBkYXRlKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgfSk7XG4gIH1cblxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9OiBRdWVyeU9wdGlvbnNcbiAgKSB7XG4gICAgZGVidWcoJ2ZpbmQnKTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBsaW1pdFBhdHRlcm4gPSBoYXNMaW1pdCA/IGBMSU1JVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc0xpbWl0KSB7XG4gICAgICB2YWx1ZXMucHVzaChsaW1pdCk7XG4gICAgfVxuICAgIGNvbnN0IHNraXBQYXR0ZXJuID0gaGFzU2tpcCA/IGBPRkZTRVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNTa2lwKSB7XG4gICAgICB2YWx1ZXMucHVzaChza2lwKTtcbiAgICB9XG5cbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBpZiAoc29ydCkge1xuICAgICAgY29uc3Qgc29ydENvcHk6IGFueSA9IHNvcnQ7XG4gICAgICBjb25zdCBzb3J0aW5nID0gT2JqZWN0LmtleXMoc29ydClcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybUtleSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGtleSkuam9pbignLT4nKTtcbiAgICAgICAgICAvLyBVc2luZyAkaWR4IHBhdHRlcm4gZ2l2ZXM6ICBub24taW50ZWdlciBjb25zdGFudCBpbiBPUkRFUiBCWVxuICAgICAgICAgIGlmIChzb3J0Q29weVtrZXldID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBBU0NgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBERVNDYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIE9iamVjdC5rZXlzKHNvcnQpLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICB9XG4gICAgaWYgKHdoZXJlLnNvcnRzICYmIE9iamVjdC5rZXlzKCh3aGVyZS5zb3J0czogYW55KSkubGVuZ3RoID4gMCkge1xuICAgICAgc29ydFBhdHRlcm4gPSBgT1JERVIgQlkgJHt3aGVyZS5zb3J0cy5qb2luKCl9YDtcbiAgICB9XG5cbiAgICBsZXQgY29sdW1ucyA9ICcqJztcbiAgICBpZiAoa2V5cykge1xuICAgICAgLy8gRXhjbHVkZSBlbXB0eSBrZXlzXG4gICAgICAvLyBSZXBsYWNlIEFDTCBieSBpdCdzIGtleXNcbiAgICAgIGtleXMgPSBrZXlzLnJlZHVjZSgobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtby5wdXNoKCdfcnBlcm0nKTtcbiAgICAgICAgICBtZW1vLnB1c2goJ193cGVybScpO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGtleS5sZW5ndGggPiAwICYmXG4gICAgICAgICAgLy8gUmVtb3ZlIHNlbGVjdGVkIGZpZWxkIG5vdCByZWZlcmVuY2VkIGluIHRoZSBzY2hlbWFcbiAgICAgICAgICAvLyBSZWxhdGlvbiBpcyBub3QgYSBjb2x1bW4gaW4gcG9zdGdyZXNcbiAgICAgICAgICAvLyAkc2NvcmUgaXMgYSBQYXJzZSBzcGVjaWFsIGZpZWxkIGFuZCBpcyBhbHNvIG5vdCBhIGNvbHVtblxuICAgICAgICAgICgoc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlICE9PSAnUmVsYXRpb24nKSB8fCBrZXkgPT09ICckc2NvcmUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBtZW1vLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sIFtdKTtcbiAgICAgIGNvbHVtbnMgPSBrZXlzXG4gICAgICAgIC5tYXAoKGtleSwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoa2V5ID09PSAnJHNjb3JlJykge1xuICAgICAgICAgICAgcmV0dXJuIGB0c19yYW5rX2NkKHRvX3RzdmVjdG9yKCQkezJ9LCAkJHszfTpuYW1lKSwgdG9fdHNxdWVyeSgkJHs0fSwgJCR7NX0pLCAzMikgYXMgc2NvcmVgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCQke2luZGV4ICsgdmFsdWVzLmxlbmd0aCArIDF9Om5hbWVgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgdmFsdWVzID0gdmFsdWVzLmNvbmNhdChrZXlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnN9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59ICR7c2tpcFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW4gPyB0aGlzLmNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkob3JpZ2luYWxRdWVyeSkgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFF1ZXJ5IG9uIG5vbiBleGlzdGluZyB0YWJsZSwgZG9uJ3QgY3Jhc2hcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgJiYgb2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgbGF0aXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLnksXG4gICAgICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbZmllbGROYW1lXS54LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgbGV0IGNvb3JkcyA9IG5ldyBTdHJpbmcob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMuc3Vic3RyaW5nKDIsIGNvb3Jkcy5sZW5ndGggLSAyKS5zcGxpdCgnKSwoJyk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZWRDb29yZHMgPSBjb29yZHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICByZXR1cm4gW3BhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVsxXSksIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSldO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IHVwZGF0ZWRDb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IGNvbnN0cmFpbnROYW1lID0gYCR7Y2xhc3NOYW1lfV91bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZShxcywgW2NsYXNzTmFtZSwgY29uc3RyYWludE5hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gQ3JlYXRlcyBhIHVuaXF1ZSBpbmRleCBvbiBhdXRoRGF0YS0+PHByb3ZpZGVyPi0+PidpZCcgdG8gcHJldmVudFxuICAvLyByYWNlIGNvbmRpdGlvbnMgZHVyaW5nIGNvbmN1cnJlbnQgc2lnbnVwcyB3aXRoIHRoZSBzYW1lIGF1dGhEYXRhLlxuICBhc3luYyBlbnN1cmVBdXRoRGF0YVVuaXF1ZW5lc3MocHJvdmlkZXI6IHN0cmluZykge1xuICAgIGNvbnN0IGluZGV4TmFtZSA9IGBfVXNlcl91bmlxdWVfYXV0aERhdGFfJHtwcm92aWRlcn1faWRgO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OIFwiX1VzZXJcIiAoKFwiYXV0aERhdGFcIi0+JDI6OnRleHQtPj4naWQnKSkgV0hFUkUgXCJhdXRoRGF0YVwiLT4kMjo6dGV4dC0+PidpZCcgSVMgTk9UIE5VTExgO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC5ub25lKHFzLCBbaW5kZXhOYW1lLCBwcm92aWRlcl0pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWUpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnVHJpZWQgdG8gZW5zdXJlIGZpZWxkIHVuaXF1ZW5lc3MgZm9yIGEgY2xhc3MgdGhhdCBhbHJlYWR5IGhhcyBkdXBsaWNhdGVzLidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgYXN5bmMgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPSAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiB7XG4gICAgICAgIGlmIChhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSBudWxsIHx8IGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IC0xKSB7XG4gICAgICAgICAgcmV0dXJuICFpc05hTigrYS5jb3VudCkgPyArYS5jb3VudCA6IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmFwcHJveGltYXRlX3Jvd19jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnKTtcbiAgICBjb25zdCBmaWVsZFNlZ21lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgZm9yIChjb25zdCBzZWdtZW50IG9mIGZpZWxkU2VnbWVudHMpIHtcbiAgICAgIGlmICghc2VnbWVudC5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9dKiQvKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGxldCBmaWVsZCA9IGZpZWxkTmFtZTtcbiAgICBsZXQgY29sdW1uID0gZmllbGROYW1lO1xuICAgIGNvbnN0IGlzTmVzdGVkID0gZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgZmllbGQgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICBjb2x1bW4gPSBmaWVsZFNlZ21lbnRzWzBdO1xuICAgIH1cbiAgICBjb25zdCBpc0FycmF5RmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSc7XG4gICAgY29uc3QgaXNQb2ludGVyRmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB2YWx1ZXMgPSBbZmllbGQsIGNvbHVtbiwgY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogNCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gaXNBcnJheUZpZWxkID8gJ2pzb25iX2FycmF5X2VsZW1lbnRzJyA6ICdPTic7XG4gICAgbGV0IHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpuYW1lKSAkMjpuYW1lIEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOnJhdykgJDI6cmF3IEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmICghaXNOZXN0ZWQpIHtcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIob2JqZWN0ID0+IG9iamVjdFtmaWVsZF0gIT09IG51bGwpO1xuICAgICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0W2ZpZWxkXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZF0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNoaWxkID0gZmllbGROYW1lLnNwbGl0KCcuJylbMV07XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gb2JqZWN0W2NvbHVtbl1bY2hpbGRdKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+XG4gICAgICAgIHJlc3VsdHMubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSlcbiAgICAgICk7XG4gIH1cblxuICBhc3luYyBhZ2dyZWdhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBhbnksXG4gICAgcGlwZWxpbmU6IGFueSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWQsXG4gICAgZXhwbGFpbj86IGJvb2xlYW5cbiAgKSB7XG4gICAgZGVidWcoJ2FnZ3JlZ2F0ZScpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGxldCBpbmRleDogbnVtYmVyID0gMjtcbiAgICBsZXQgY29sdW1uczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgY291bnRGaWVsZCA9IG51bGw7XG4gICAgbGV0IGdyb3VwVmFsdWVzID0gbnVsbDtcbiAgICBsZXQgd2hlcmVQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGxpbWl0UGF0dGVybiA9ICcnO1xuICAgIGxldCBza2lwUGF0dGVybiA9ICcnO1xuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGxldCBncm91cFBhdHRlcm4gPSAnJztcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBpcGVsaW5lLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBzdGFnZSA9IHBpcGVsaW5lW2ldO1xuICAgICAgaWYgKHN0YWdlLiRncm91cCkge1xuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRncm91cCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJGdyb3VwW2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZSAhPT0gJycpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgXCJvYmplY3RJZFwiYCk7XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKHZhbHVlKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgIGdyb3VwVmFsdWVzID0gdmFsdWU7XG4gICAgICAgICAgICBjb25zdCBncm91cEJ5RmllbGRzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGFsaWFzIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWVbYWxpYXNdID09PSAnc3RyaW5nJyAmJiB2YWx1ZVthbGlhc10pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc10pO1xuICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9wZXJhdGlvbiA9IE9iamVjdC5rZXlzKHZhbHVlW2FsaWFzXSlbMF07XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdW29wZXJhdGlvbl0pO1xuICAgICAgICAgICAgICAgIGlmIChtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXSkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goXG4gICAgICAgICAgICAgICAgICAgIGBFWFRSQUNUKCR7bW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl1cbiAgICAgICAgICAgICAgICAgICAgfSBGUk9NICQke2luZGV4fTpuYW1lIEFUIFRJTUUgWk9ORSAnVVRDJyk6OmludGVnZXIgQVMgJCR7aW5kZXggKyAxfTpuYW1lYFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06cmF3YDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGdyb3VwQnlGaWVsZHMuam9pbigpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZS4kc3VtKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUuJHN1bSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYFNVTSgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJHN1bSksIGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvdW50RmllbGQgPSBmaWVsZDtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYENPVU5UKCopIEFTICQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWF4KSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUFYKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1heCksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWluKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUlOKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1pbiksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kYXZnKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQVZHKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJGF2ZyksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbHVtbnMucHVzaCgnKicpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIGlmIChjb2x1bW5zLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICBjb2x1bW5zID0gW107XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJHByb2plY3RbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gMSB8fCB2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcGF0dGVybnMgPSBbXTtcbiAgICAgICAgY29uc3Qgb3JPckFuZCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdGFnZS4kbWF0Y2gsICckb3InKVxuICAgICAgICAgID8gJyBPUiAnXG4gICAgICAgICAgOiAnIEFORCAnO1xuXG4gICAgICAgIGlmIChzdGFnZS4kbWF0Y2guJG9yKSB7XG4gICAgICAgICAgY29uc3QgY29sbGFwc2UgPSB7fTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2guJG9yLmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBlbGVtZW50KSB7XG4gICAgICAgICAgICAgIGNvbGxhcHNlW2tleV0gPSBlbGVtZW50W2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoID0gY29sbGFwc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcpIHtcbiAgICAgICAgICAgIGZpZWxkID0gJ29iamVjdElkJztcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgbWF0Y2hQYXR0ZXJucyA9IFtdO1xuICAgICAgICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbHVlW2NtcF0pIHtcbiAgICAgICAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgICAgICAgIG1hdGNoUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHRvUG9zdGdyZXNWYWx1ZSh2YWx1ZVtjbXBdKSk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgaWYgKG1hdGNoUGF0dGVybnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgKCR7bWF0Y2hQYXR0ZXJucy5qb2luKCcgQU5EICcpfSlgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgbWF0Y2hQYXR0ZXJucy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHdoZXJlUGF0dGVybiA9IHBhdHRlcm5zLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHtwYXR0ZXJucy5qb2luKGAgJHtvck9yQW5kfSBgKX1gIDogJyc7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJGxpbWl0KSB7XG4gICAgICAgIGxpbWl0UGF0dGVybiA9IGBMSU1JVCAkJHtpbmRleH1gO1xuICAgICAgICB2YWx1ZXMucHVzaChzdGFnZS4kbGltaXQpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRza2lwKSB7XG4gICAgICAgIHNraXBQYXR0ZXJuID0gYE9GRlNFVCAkJHtpbmRleH1gO1xuICAgICAgICB2YWx1ZXMucHVzaChzdGFnZS4kc2tpcCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNvcnQpIHtcbiAgICAgICAgY29uc3Qgc29ydCA9IHN0YWdlLiRzb3J0O1xuICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc29ydCk7XG4gICAgICAgIGNvbnN0IHNvcnRpbmcgPSBrZXlzXG4gICAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdHJhbnNmb3JtZXIgPSBzb3J0W2tleV0gPT09IDEgPyAnQVNDJyA6ICdERVNDJztcbiAgICAgICAgICAgIGNvbnN0IG9yZGVyID0gYCQke2luZGV4fTpuYW1lICR7dHJhbnNmb3JtZXJ9YDtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICByZXR1cm4gb3JkZXI7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuam9pbigpO1xuICAgICAgICB2YWx1ZXMucHVzaCguLi5rZXlzKTtcbiAgICAgICAgc29ydFBhdHRlcm4gPSBzb3J0ICE9PSB1bmRlZmluZWQgJiYgc29ydGluZy5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGdyb3VwUGF0dGVybikge1xuICAgICAgY29sdW1ucy5mb3JFYWNoKChlLCBpLCBhKSA9PiB7XG4gICAgICAgIGlmIChlICYmIGUudHJpbSgpID09PSAnKicpIHtcbiAgICAgICAgICBhW2ldID0gJyc7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBgU0VMRUNUICR7Y29sdW1uc1xuICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgLmpvaW4oKX0gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NraXBQYXR0ZXJufSAke2dyb3VwUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW4gPyB0aGlzLmNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkob3JpZ2luYWxRdWVyeSkgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQuYW55KHFzLCB2YWx1ZXMpLnRoZW4oYSA9PiB7XG4gICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICByZXR1cm4gYTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3VsdCwgJ29iamVjdElkJykpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChncm91cFZhbHVlcykge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IHt9O1xuICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWRba2V5XSA9IHJlc3VsdFtrZXldO1xuICAgICAgICAgICAgZGVsZXRlIHJlc3VsdFtrZXldO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoY291bnRGaWVsZCkge1xuICAgICAgICAgIHJlc3VsdFtjb3VudEZpZWxkXSA9IHBhcnNlSW50KHJlc3VsdFtjb3VudEZpZWxkXSwgMTApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKHsgVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyB9OiBhbnkpIHtcbiAgICAvLyBUT0RPOiBUaGlzIG1ldGhvZCBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdG8gbWFrZSBwcm9wZXIgdXNlIG9mIGNvbm5lY3Rpb25zIChAdml0YWx5LXQpXG4gICAgZGVidWcoJ3BlcmZvcm1Jbml0aWFsaXphdGlvbicpO1xuICAgIGF3YWl0IHRoaXMuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVUYWJsZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpXG4gICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgfHxcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUVcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLnNjaGVtYVVwZ3JhZGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKSk7XG4gICAgfSk7XG4gICAgcHJvbWlzZXMucHVzaCh0aGlzLl9saXN0ZW5Ub1NjaGVtYSgpKTtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jbGllbnQudHgoJ3BlcmZvcm0taW5pdGlhbGl6YXRpb24nLCBhc3luYyB0ID0+IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLm1pc2MuanNvbk9iamVjdFNldEtleXMpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmFkZFVuaXF1ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5yZW1vdmUpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGwpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGxSZWdleCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWlucyk7XG4gICAgICAgICAgcmV0dXJuIHQuY3R4O1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihjdHggPT4ge1xuICAgICAgICBkZWJ1ZyhgaW5pdGlhbGl6YXRpb25Eb25lIGluICR7Y3R4LmR1cmF0aW9ufWApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46ID9hbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKGkgPT4gKHtcbiAgICAgIHF1ZXJ5OiAnRFJPUCBJTkRFWCAkMTpuYW1lJyxcbiAgICAgIHZhbHVlczogaSxcbiAgICB9KSk7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgfVxuXG4gIGFzeW5jIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxcyA9ICdTRUxFQ1QgKiBGUk9NIHBnX2luZGV4ZXMgV0hFUkUgdGFibGVuYW1lID0gJHtjbGFzc05hbWV9JztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgeyBjbGFzc05hbWUgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBVc2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gIGFzeW5jIHVwZGF0ZUVzdGltYXRlZENvdW50KGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKCdBTkFMWVpFICQxOm5hbWUnLCBbY2xhc3NOYW1lXSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZXNzaW9uID0ge307XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQgPSB0aGlzLl9jbGllbnQudHgodCA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgIH0pO1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCA9IFtdO1xuICAgICAgICByZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2U7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgZGVmYXVsdEluZGV4TmFtZSA9IGBwYXJzZV9kZWZhdWx0XyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID1cbiAgICAgIGluZGV4TmFtZSAhPSBudWxsID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHsgbmFtZTogZGVmYXVsdEluZGV4TmFtZSB9O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYGxvd2VyKCQke2luZGV4ICsgM306bmFtZSkgdmFyY2hhcl9wYXR0ZXJuX29wc2ApXG4gICAgICA6IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgY29uc3Qgc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9XG4gICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA6IGZhbHNlO1xuICAgIGlmIChzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uKSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucyk7XG4gICAgfVxuICAgIGF3YWl0IGNvbm4ubm9uZShxcywgW2luZGV4TmFtZU9wdGlvbnMubmFtZSwgY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbihvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBxcyA9ICdEUk9QIEZVTkNUSU9OIElGIEVYSVNUUyBpZGVtcG90ZW5jeV9kZWxldGVfZXhwaXJlZF9yZWNvcmRzKCknO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyhvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCB0dGxPcHRpb25zID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IGAke29wdGlvbnMudHRsfSBzZWNvbmRzYCA6ICc2MCBzZWNvbmRzJztcbiAgICBjb25zdCBxcyA9XG4gICAgICAnQ1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpIFJFVFVSTlMgdm9pZCBMQU5HVUFHRSBwbHBnc3FsIEFTICQkIEJFR0lOIERFTEVURSBGUk9NIFwiX0lkZW1wb3RlbmN5XCIgV0hFUkUgZXhwaXJlIDwgTk9XKCkgLSBJTlRFUlZBTCAkMTsgRU5EOyAkJDsnO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMsIFt0dGxPcHRpb25zXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmc6IHN0cmluZykge1xuICByZXR1cm4gcmVtYWluaW5nXG4gICAgLnNwbGl0KCcnKVxuICAgIC5tYXAoYyA9PiB7XG4gICAgICBjb25zdCByZWdleCA9IFJlZ0V4cCgnWzAtOSBdfFxcXFxwe0x9JywgJ3UnKTsgLy8gU3VwcG9ydCBhbGwgVW5pY29kZSBsZXR0ZXIgY2hhcnNcbiAgICAgIGlmIChjLm1hdGNoKHJlZ2V4KSAhPT0gbnVsbCkge1xuICAgICAgICAvLyBEb24ndCBlc2NhcGUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnNcbiAgICAgICAgcmV0dXJuIGM7XG4gICAgICB9XG4gICAgICAvLyBFc2NhcGUgZXZlcnl0aGluZyBlbHNlIChzaW5nbGUgcXVvdGVzIHdpdGggc2luZ2xlIHF1b3RlcywgZXZlcnl0aGluZyBlbHNlIHdpdGggYSBiYWNrc2xhc2gpXG4gICAgICByZXR1cm4gYyA9PT0gYCdgID8gYCcnYCA6IGBcXFxcJHtjfWA7XG4gICAgfSlcbiAgICAuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIGxpdGVyYWxpemVSZWdleFBhcnQoczogc3RyaW5nKSB7XG4gIGNvbnN0IG1hdGNoZXIxID0gL1xcXFxRKCg/IVxcXFxFKS4qKVxcXFxFJC87XG4gIGNvbnN0IHJlc3VsdDE6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjEpO1xuICBpZiAocmVzdWx0MSAmJiByZXN1bHQxLmxlbmd0aCA+IDEgJiYgcmVzdWx0MS5pbmRleCA+IC0xKSB7XG4gICAgLy8gUHJvY2VzcyBSZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBhbmQgYW4gZW5kIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyaW5nKDAsIHJlc3VsdDEuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDFbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyBQcm9jZXNzIFJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICBjb25zdCBtYXRjaGVyMiA9IC9cXFxcUSgoPyFcXFxcRSkuKikkLztcbiAgY29uc3QgcmVzdWx0MjogYW55ID0gcy5tYXRjaChtYXRjaGVyMik7XG4gIGlmIChyZXN1bHQyICYmIHJlc3VsdDIubGVuZ3RoID4gMSAmJiByZXN1bHQyLmluZGV4ID4gLTEpIHtcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cmluZygwLCByZXN1bHQyLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQyWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHByb2JsZW1hdGljIGNoYXJzIGZyb20gcmVtYWluaW5nIHRleHRcbiAgcmV0dXJuIHNcbiAgICAvLyBSZW1vdmUgYWxsIGluc3RhbmNlcyBvZiBcXFEgYW5kIFxcRVxuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXEUpLywgJyQxJylcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxRKS8sICckMScpXG4gICAgLnJlcGxhY2UoL15cXFxcRS8sICcnKVxuICAgIC5yZXBsYWNlKC9eXFxcXFEvLCAnJylcbiAgICAvLyBFbnN1cmUgZXZlbiBudW1iZXIgb2Ygc2luZ2xlIHF1b3RlIHNlcXVlbmNlcyBieSBhZGRpbmcgYW4gZXh0cmEgc2luZ2xlIHF1b3RlIGlmIG5lZWRlZDtcbiAgICAvLyB0aGlzIGVuc3VyZXMgdGhhdCBldmVyeSBzaW5nbGUgcXVvdGUgaXMgZXNjYXBlZFxuICAgIC5yZXBsYWNlKC8nKy9nLCBtYXRjaCA9PiB7XG4gICAgICByZXR1cm4gbWF0Y2gubGVuZ3RoICUgMiA9PT0gMCA/IG1hdGNoIDogbWF0Y2ggKyBcIidcIjtcbiAgICB9KTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsSUFBQUEsZUFBQSxHQUFBQyxPQUFBO0FBRUEsSUFBQUMsS0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUcsT0FBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUksS0FBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssSUFBQSxHQUFBSCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU0sZUFBQSxHQUFBTixPQUFBO0FBQW1ELFNB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