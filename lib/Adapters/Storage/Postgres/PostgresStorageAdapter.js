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

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
}; // Duplicate from then mongo adapter...


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
}; // Returns the list of join tables on a schema


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
    const fieldValue = query[fieldName]; // nothing in the schema, it's gonna blow up

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
        } else if (fieldValue.$regex) {// Handle later
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
      patterns.push(`$${index}:name = $${index + 1}`); // Can't cast boolean to double precision

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
      } // Get point, convert to geo point if necessary and validate


      let point = centerSphere[0];

      if (point instanceof Array && point.length === 2) {
        point = new _node.default.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
      }

      _node.default.GeoPoint._validate(point.latitude, point.longitude); // Get distance and validate


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
  } //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.


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
  } // Just create a table, do not insert in schema


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
      const parseType = fields[fieldName]; // Skip when it's a relation
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
        } // ELSE: Table already exists, must have been created by a different request. Ignore the error.

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
          } // Column already exists, created by other request. Carry on to see if it's the right type.

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
  } // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
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
  } // Delete all data known to this adapter. Used for testing.


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
        } // No _SCHEMA collection. Don't delete anything.

      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
  } // Remove the column and all the data. For Relations, the _Join collection is handled
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
  } // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.


  async getAllClasses() {
    return this._client.task('get-all-classes', async t => {
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  } // Return a promise for the schema with the given name, in Parse format. If
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
  } // TODO: remove the mongo format dependency in the return value


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
  } // Remove all objects that match the given Parse Query.
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
      } // ELSE: Don't delete anything if doesn't exist

    });

    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }

    return promise;
  } // Return value not currently well specified.


  async findOneAndUpdate(className, schema, query, update, transactionalSession) {
    debug('findOneAndUpdate');
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  } // Apply the update to all objects that match the given Parse Query.


  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery');
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toPostgresSchema(schema);

    const originalUpdate = _objectSpread({}, update); // Set flag for dot notation fields


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
    update = handleDotFields(update); // Resolve authData first,
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
      const fieldValue = update[fieldName]; // Drop any undefined values.

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
      } else if (fieldValue.__type === 'Relation') {// noop
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
          }).join(' || '); // Strip the keys

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
        }, ''); // Override Object

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
  } // Hopefully, we can get rid of this. It's only used for config and hooks.


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
        const transformKey = transformDotFieldToComponents(key).join('->'); // Using $idx pattern gives:  non-integer constant in ORDER BY

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
        } else if (key.length > 0 && ( // Remove selected field not referenced in the schema
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
  } // Converts from a postgres-format object to a REST-format object.
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
    }); //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.

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
  } // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.


  async ensureUniqueness(className, schema, fieldNames) {
    const constraintName = `${className}_unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE UNIQUE INDEX IF NOT EXISTS $2:name ON $1:name(${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {// Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  } // Executes a count.


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
  } // Used for testing purposes


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
      if (error.code === PostgresDuplicateRelationError && error.message.includes(indexNameOptions.name)) {// Index already exists. Ignore error.
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
  } // remove non escaped comments


  return regex.replace(/([^\\])#.*\n/gim, '$1') // remove lines starting with a comment
  .replace(/^#.*\n/gim, '') // remove non escaped whitespace
  .replace(/([^\\])\s+/gim, '$1') // remove whitespace at the beginning of a line
  .replace(/^\s+/, '').trim();
}

function processRegexPattern(s) {
  if (s && s.startsWith('^')) {
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));
  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  } // regex for contains


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
    } // escape everything else (single quotes with single quotes, everything else with a backslash)


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
  } // process regex that has a beginning specified for the literal text


  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);

  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substr(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  } // remove all instances of \Q and \E from the remaining text & escape single quotes


  return s.replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '').replace(/([^'])'/, `$1''`).replace(/^'([^'])/, `''$1`);
}

var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }

};
var _default = PostgresStorageAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVdGlscyIsInJlcXVpcmUiLCJQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yIiwiUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IiLCJsb2dnZXIiLCJkZWJ1ZyIsImFyZ3MiLCJhcmd1bWVudHMiLCJjb25jYXQiLCJzbGljZSIsImxlbmd0aCIsImxvZyIsImdldExvZ2dlciIsImFwcGx5IiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwidmFsdWUiLCJfX3R5cGUiLCJpc28iLCJuYW1lIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsIk9iamVjdCIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaGFuZGxlRG90RmllbGRzIiwib2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJmaWVsZE5hbWUiLCJpbmRleE9mIiwiY29tcG9uZW50cyIsInNwbGl0IiwiZmlyc3QiLCJzaGlmdCIsImN1cnJlbnRPYmoiLCJuZXh0IiwiX19vcCIsInVuZGVmaW5lZCIsInRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzIiwibWFwIiwiY21wdCIsImluZGV4IiwidHJhbnNmb3JtRG90RmllbGQiLCJqb2luIiwidHJhbnNmb3JtQWdncmVnYXRlRmllbGQiLCJzdWJzdHIiLCJ2YWxpZGF0ZUtleXMiLCJrZXkiLCJpbmNsdWRlcyIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJqb2luVGFibGVzRm9yU2NoZW1hIiwibGlzdCIsImZpZWxkIiwicHVzaCIsImJ1aWxkV2hlcmVDbGF1c2UiLCJxdWVyeSIsImNhc2VJbnNlbnNpdGl2ZSIsInBhdHRlcm5zIiwidmFsdWVzIiwic29ydHMiLCJpc0FycmF5RmllbGQiLCJpbml0aWFsUGF0dGVybnNMZW5ndGgiLCJmaWVsZFZhbHVlIiwiJGV4aXN0cyIsImF1dGhEYXRhTWF0Y2giLCJtYXRjaCIsIiRpbiIsIiRyZWdleCIsIk1BWF9JTlRfUExVU19PTkUiLCJjbGF1c2VzIiwiY2xhdXNlVmFsdWVzIiwic3ViUXVlcnkiLCJjbGF1c2UiLCJwYXR0ZXJuIiwib3JPckFuZCIsIm5vdCIsIiRuZSIsImNvbnN0cmFpbnRGaWVsZE5hbWUiLCIkcmVsYXRpdmVUaW1lIiwiSU5WQUxJRF9KU09OIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsImkiLCJwcm9jZXNzUmVnZXhQYXR0ZXJuIiwic3Vic3RyaW5nIiwiJGNvbnRhaW5lZEJ5IiwiYXJyIiwiJHRleHQiLCJzZWFyY2giLCIkc2VhcmNoIiwibGFuZ3VhZ2UiLCIkdGVybSIsIiRsYW5ndWFnZSIsIiRjYXNlU2Vuc2l0aXZlIiwiJGRpYWNyaXRpY1NlbnNpdGl2ZSIsIiRuZWFyU3BoZXJlIiwiZGlzdGFuY2UiLCIkbWF4RGlzdGFuY2UiLCJkaXN0YW5jZUluS00iLCIkd2l0aGluIiwiJGJveCIsImJveCIsImxlZnQiLCJib3R0b20iLCJyaWdodCIsInRvcCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwiY2VudGVyU3BoZXJlIiwiR2VvUG9pbnQiLCJHZW9Qb2ludENvZGVyIiwiaXNWYWxpZEpTT04iLCJfdmFsaWRhdGUiLCJpc05hTiIsIiRwb2x5Z29uIiwicG9seWdvbiIsInBvaW50cyIsImNvb3JkaW5hdGVzIiwiJGdlb0ludGVyc2VjdHMiLCIkcG9pbnQiLCJyZWdleCIsIm9wZXJhdG9yIiwib3B0cyIsIiRvcHRpb25zIiwicmVtb3ZlV2hpdGVTcGFjZSIsImNvbnZlcnRQb2x5Z29uVG9TUUwiLCJjbXAiLCJwZ0NvbXBhcmF0b3IiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJwYXJzZXJSZXN1bHQiLCJyZWxhdGl2ZVRpbWVUb0RhdGUiLCJzdGF0dXMiLCJyZXN1bHQiLCJjb25zb2xlIiwiZXJyb3IiLCJpbmZvIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImNvbGxlY3Rpb25QcmVmaXgiLCJkYXRhYmFzZU9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwiY2xpZW50IiwicGdwIiwiY3JlYXRlQ2xpZW50IiwiX2NsaWVudCIsIl9vbmNoYW5nZSIsIl9wZ3AiLCJfdXVpZCIsInV1aWR2NCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIl9zdHJlYW0iLCJkb25lIiwiJHBvb2wiLCJlbmQiLCJfbGlzdGVuVG9TY2hlbWEiLCJjb25uZWN0IiwiZGlyZWN0Iiwib24iLCJkYXRhIiwicGF5bG9hZCIsInBhcnNlIiwic2VuZGVySWQiLCJub25lIiwiX25vdGlmeVNjaGVtYUNoYW5nZSIsImNhdGNoIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInRhc2siLCJ0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwic2VsZiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2lkXyIsIl9pZCIsImRlbGV0ZWRJbmRleGVzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInR4IiwiY3JlYXRlSW5kZXhlcyIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiY29kZSIsImRldGFpbCIsIkRVUExJQ0FURV9WQUxVRSIsInZhbHVlc0FycmF5IiwicGF0dGVybnNBcnJheSIsImFzc2lnbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfZmFpbGVkX2xvZ2luX2NvdW50IiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJyZWxhdGlvbnMiLCJwYXJzZVR5cGUiLCJxcyIsImJhdGNoIiwiam9pblRhYmxlIiwic2NoZW1hVXBncmFkZSIsImNvbHVtbnMiLCJjb2x1bW5fbmFtZSIsIm5ld0NvbHVtbnMiLCJmaWx0ZXIiLCJpdGVtIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInBvc3RncmVzVHlwZSIsImFueSIsInBhdGgiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJkZWxldGVDbGFzcyIsIm9wZXJhdGlvbnMiLCJyZXNwb25zZSIsImhlbHBlcnMiLCJ0aGVuIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJtYXRjaGVzIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsInBhcnNlRmxvYXQiLCJjcmVhdGVkQXQiLCJ0b0lTT1N0cmluZyIsInVwZGF0ZWRBdCIsImV4cGlyZXNBdCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRQYXR0ZXJucyIsIm1lc3NhZ2UiLCJyZWFkUHJlZmVyZW5jZSIsImVzdGltYXRlIiwiYXBwcm94aW1hdGVfcm93X2NvdW50IiwiZGlzdGluY3QiLCJjb2x1bW4iLCJpc05lc3RlZCIsImlzUG9pbnRlckZpZWxkIiwidHJhbnNmb3JtZXIiLCJjaGlsZCIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwiaGludCIsImNvdW50RmllbGQiLCJncm91cFZhbHVlcyIsImdyb3VwUGF0dGVybiIsInN0YWdlIiwiJGdyb3VwIiwiZ3JvdXBCeUZpZWxkcyIsImFsaWFzIiwic291cmNlIiwib3BlcmF0aW9uIiwiJHN1bSIsIiRtYXgiLCIkbWluIiwiJGF2ZyIsIiRwcm9qZWN0IiwiJG1hdGNoIiwiJG9yIiwiY29sbGFwc2UiLCJlbGVtZW50IiwibWF0Y2hQYXR0ZXJucyIsIiRsaW1pdCIsIiRza2lwIiwiJHNvcnQiLCJvcmRlciIsImUiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwib3B0aW9ucyIsImRlZmF1bHRJbmRleE5hbWUiLCJpbmRleE5hbWVPcHRpb25zIiwic2V0SWRlbXBvdGVuY3lGdW5jdGlvbiIsImVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMiLCJkZWxldGVJZGVtcG90ZW5jeUZ1bmN0aW9uIiwidHRsT3B0aW9ucyIsInR0bCIsInVuaXF1ZSIsImFyIiwiZm91bmRJbmRleCIsInB0IiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZW5kc1dpdGgiLCJyZXBsYWNlIiwicyIsInN0YXJ0c1dpdGgiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJzb21lIiwiY3JlYXRlTGl0ZXJhbFJlZ2V4IiwicmVtYWluaW5nIiwiUmVnRXhwIiwibWF0Y2hlcjEiLCJyZXN1bHQxIiwicHJlZml4IiwibWF0Y2hlcjIiLCJyZXN1bHQyIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAnLi9Qb3N0Z3Jlc0NsaWVudCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQgc3FsIGZyb20gJy4vc3FsJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFUeXBlLCBRdWVyeVR5cGUsIFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi4vLi4vLi4vVXRpbHMnKTtcblxuY29uc3QgUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yID0gJzQyUDAxJztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciA9ICc0MlAwNyc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yID0gJzQyNzAxJztcbmNvbnN0IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yID0gJzQyNzAzJztcbmNvbnN0IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciA9ICcyMzUwNSc7XG5jb25zdCBsb2dnZXIgPSByZXF1aXJlKCcuLi8uLi8uLi9sb2dnZXInKTtcblxuY29uc3QgZGVidWcgPSBmdW5jdGlvbiAoLi4uYXJnczogYW55KSB7XG4gIGFyZ3MgPSBbJ1BHOiAnICsgYXJndW1lbnRzWzBdXS5jb25jYXQoYXJncy5zbGljZSgxLCBhcmdzLmxlbmd0aCkpO1xuICBjb25zdCBsb2cgPSBsb2dnZXIuZ2V0TG9nZ2VyKCk7XG4gIGxvZy5kZWJ1Zy5hcHBseShsb2csIGFyZ3MpO1xufTtcblxuY29uc3QgcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUgPSB0eXBlID0+IHtcbiAgc3dpdGNoICh0eXBlLnR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuICdwb2ludCc7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gJ3BvbHlnb24nO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIGlmICh0eXBlLmNvbnRlbnRzICYmIHR5cGUuY29udGVudHMudHlwZSA9PT0gJ1N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuICd0ZXh0W10nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IGBubyB0eXBlIGZvciAke0pTT04uc3RyaW5naWZ5KHR5cGUpfSB5ZXRgO1xuICB9XG59O1xuXG5jb25zdCBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IgPSB7XG4gICRndDogJz4nLFxuICAkbHQ6ICc8JyxcbiAgJGd0ZTogJz49JyxcbiAgJGx0ZTogJzw9Jyxcbn07XG5cbmNvbnN0IG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3JlcyA9IHtcbiAgJGRheU9mTW9udGg6ICdEQVknLFxuICAkZGF5T2ZXZWVrOiAnRE9XJyxcbiAgJGRheU9mWWVhcjogJ0RPWScsXG4gICRpc29EYXlPZldlZWs6ICdJU09ET1cnLFxuICAkaXNvV2Vla1llYXI6ICdJU09ZRUFSJyxcbiAgJGhvdXI6ICdIT1VSJyxcbiAgJG1pbnV0ZTogJ01JTlVURScsXG4gICRzZWNvbmQ6ICdTRUNPTkQnLFxuICAkbWlsbGlzZWNvbmQ6ICdNSUxMSVNFQ09ORFMnLFxuICAkbW9udGg6ICdNT05USCcsXG4gICR3ZWVrOiAnV0VFSycsXG4gICR5ZWFyOiAnWUVBUicsXG59O1xuXG5jb25zdCB0b1Bvc3RncmVzVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUuaXNvO1xuICAgIH1cbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHIoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXgsIGNhc2VJbnNlbnNpdGl2ZSB9KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnNMZW5ndGggPSBwYXR0ZXJucy5sZW5ndGg7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IHF1ZXJ5W2ZpZWxkTmFtZV07XG5cbiAgICAvLyBub3RoaW5nIGluIHRoZSBzY2hlbWEsIGl0J3MgZ29ubmEgYmxvdyB1cFxuICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAvLyBhcyBpdCB3b24ndCBleGlzdFxuICAgICAgaWYgKGZpZWxkVmFsdWUgJiYgZmllbGRWYWx1ZS4kZXhpc3RzID09PSBmYWxzZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgIC8vIFRPRE86IEhhbmRsZSBxdWVyeWluZyBieSBfYXV0aF9kYXRhX3Byb3ZpZGVyLCBhdXRoRGF0YSBpcyBzdG9yZWQgaW4gYXV0aERhdGEgZmllbGRcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAoY2FzZUluc2Vuc2l0aXZlICYmIChmaWVsZE5hbWUgPT09ICd1c2VybmFtZScgfHwgZmllbGROYW1lID09PSAnZW1haWwnKSkge1xuICAgICAgcGF0dGVybnMucHVzaChgTE9XRVIoJCR7aW5kZXh9Om5hbWUpID0gTE9XRVIoJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICBsZXQgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3IElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2gobmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgICAgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9OnJhdyk6Ompzb25iIEA+ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kaW4pKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGxhdGVyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyA9ICQke2luZGV4ICsgMX06OnRleHRgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IGZpZWxkVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgLy8gQ2FuJ3QgY2FzdCBib29sZWFuIHRvIGRvdWJsZSBwcmVjaXNpb25cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdOdW1iZXInKSB7XG4gICAgICAgIC8vIFNob3VsZCBhbHdheXMgcmV0dXJuIHplcm8gcmVzdWx0c1xuICAgICAgICBjb25zdCBNQVhfSU5UX1BMVVNfT05FID0gOTIyMzM3MjAzNjg1NDc3NTgwODtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBNQVhfSU5UX1BMVVNfT05FKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICB9XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoWyckb3InLCAnJG5vcicsICckYW5kJ10uaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgY29uc3QgY2xhdXNlcyA9IFtdO1xuICAgICAgY29uc3QgY2xhdXNlVmFsdWVzID0gW107XG4gICAgICBmaWVsZFZhbHVlLmZvckVhY2goc3ViUXVlcnkgPT4ge1xuICAgICAgICBjb25zdCBjbGF1c2UgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgcXVlcnk6IHN1YlF1ZXJ5LFxuICAgICAgICAgIGluZGV4LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjbGF1c2UucGF0dGVybi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xhdXNlcy5wdXNoKGNsYXVzZS5wYXR0ZXJuKTtcbiAgICAgICAgICBjbGF1c2VWYWx1ZXMucHVzaCguLi5jbGF1c2UudmFsdWVzKTtcbiAgICAgICAgICBpbmRleCArPSBjbGF1c2UudmFsdWVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yT3JBbmQgPSBmaWVsZE5hbWUgPT09ICckYW5kJyA/ICcgQU5EICcgOiAnIE9SICc7XG4gICAgICBjb25zdCBub3QgPSBmaWVsZE5hbWUgPT09ICckbm9yJyA/ICcgTk9UICcgOiAnJztcblxuICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9KCR7Y2xhdXNlcy5qb2luKG9yT3JBbmQpfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKC4uLmNsYXVzZVZhbHVlcyk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgZmllbGRWYWx1ZS4kbmUgPSBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZS4kbmVdKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgTk9UIGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lID09PSBudWxsKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gaWYgbm90IG51bGwsIHdlIG5lZWQgdG8gbWFudWFsbHkgZXhjbHVkZSBudWxsXG4gICAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgYCgkJHtpbmRleH06bmFtZSA8PiBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgY29uc3QgY29uc3RyYWludEZpZWxkTmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgICAgYCgke2NvbnN0cmFpbnRGaWVsZE5hbWV9IDw+ICQke2luZGV4fSBPUiAke2NvbnN0cmFpbnRGaWVsZE5hbWV9IElTIE5VTEwpYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJG5lLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBhcnJheXNcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRlcSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXEgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9ID0gJCR7aW5kZXgrK31gKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXEgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGVxLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGlzSW5Pck5pbiA9IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pIHx8IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kbmluKTtcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSAmJlxuICAgICAgaXNBcnJheUZpZWxkICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJ1xuICAgICkge1xuICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgbGV0IGFsbG93TnVsbCA9IGZhbHNlO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGZpZWxkVmFsdWUuJGluLmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGxpc3RFbGVtID09PSBudWxsKSB7XG4gICAgICAgICAgYWxsb3dOdWxsID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXggLSAoYWxsb3dOdWxsID8gMSA6IDApfWApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChhbGxvd051bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpuYW1lIElTIE5VTEwgT1IgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0gYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGwoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRhbGwpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRhbGwubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGFsbFswXS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kZXhpc3RzLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJGV4aXN0cykge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOT1QgTlVMTGApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5KSB7XG4gICAgICBjb25zdCBhcnIgPSBmaWVsZFZhbHVlLiRjb250YWluZWRCeTtcbiAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YCk7XG4gICAgICB9XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIDxAICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGFycikpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kdGV4dCkge1xuICAgICAgY29uc3Qgc2VhcmNoID0gZmllbGRWYWx1ZS4kdGV4dC4kc2VhcmNoO1xuICAgICAgbGV0IGxhbmd1YWdlID0gJ2VuZ2xpc2gnO1xuICAgICAgaWYgKHR5cGVvZiBzZWFyY2ggIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgKTtcbiAgICAgIH1cbiAgICAgIGlmICghc2VhcmNoLiR0ZXJtIHx8IHR5cGVvZiBzZWFyY2guJHRlcm0gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRsYW5ndWFnZSAmJiB0eXBlb2Ygc2VhcmNoLiRsYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UpIHtcbiAgICAgICAgbGFuZ3VhZ2UgPSBzZWFyY2guJGxhbmd1YWdlO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlIG5vdCBzdXBwb3J0ZWQsIHBsZWFzZSB1c2UgJHJlZ2V4IG9yIGNyZWF0ZSBhIHNlcGFyYXRlIGxvd2VyIGNhc2UgY29sdW1uLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlIC0gZmFsc2Ugbm90IHN1cHBvcnRlZCwgaW5zdGFsbCBQb3N0Z3JlcyBVbmFjY2VudCBFeHRlbnNpb25gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgdG9fdHN2ZWN0b3IoJCR7aW5kZXh9LCAkJHtpbmRleCArIDF9Om5hbWUpIEBAIHRvX3RzcXVlcnkoJCR7aW5kZXggKyAyfSwgJCR7aW5kZXggKyAzfSlgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2gobGFuZ3VhZ2UsIGZpZWxkTmFtZSwgbGFuZ3VhZ2UsIHNlYXJjaC4kdGVybSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZWFyU3BoZXJlKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lYXJTcGhlcmU7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGZpZWxkVmFsdWUuJG1heERpc3RhbmNlO1xuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgc29ydHMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgQVNDYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHdpdGhpbiAmJiBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveCkge1xuICAgICAgY29uc3QgYm94ID0gZmllbGRWYWx1ZS4kd2l0aGluLiRib3g7XG4gICAgICBjb25zdCBsZWZ0ID0gYm94WzBdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IGJvdHRvbSA9IGJveFswXS5sYXRpdHVkZTtcbiAgICAgIGNvbnN0IHJpZ2h0ID0gYm94WzFdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IHRvcCA9IGJveFsxXS5sYXRpdHVkZTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OmJveGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCgke2xlZnR9LCAke2JvdHRvbX0pLCAoJHtyaWdodH0sICR7dG9wfSkpYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlO1xuICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uKSB7XG4gICAgICBjb25zdCBwb2x5Z29uID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uO1xuICAgICAgbGV0IHBvaW50cztcbiAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBvaW50cyA9IHBvaW50c1xuICAgICAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAoJHtwb2ludFswXX0sICR7cG9pbnRbMV19KWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbignLCAnKTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50c30pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cyAmJiBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludCkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludDtcbiAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2x5Z29uIEA+ICQke2luZGV4ICsgMX06OnBvaW50YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICBsZXQgcmVnZXggPSBmaWVsZFZhbHVlLiRyZWdleDtcbiAgICAgIGxldCBvcGVyYXRvciA9ICd+JztcbiAgICAgIGNvbnN0IG9wdHMgPSBmaWVsZFZhbHVlLiRvcHRpb25zO1xuICAgICAgaWYgKG9wdHMpIHtcbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZignaScpID49IDApIHtcbiAgICAgICAgICBvcGVyYXRvciA9ICd+Kic7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZigneCcpID49IDApIHtcbiAgICAgICAgICByZWdleCA9IHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgcmVnZXggPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKHJlZ2V4KTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyAke29wZXJhdG9yfSAnJCR7aW5kZXggKyAxfTpyYXcnYCk7XG4gICAgICB2YWx1ZXMucHVzaChuYW1lLCByZWdleCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlXSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmlzbyk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgaW5kZXggKz0gMztcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgaWYgKGZpZWxkVmFsdWVbY21wXSB8fCBmaWVsZFZhbHVlW2NtcF0gPT09IDApIHtcbiAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgIGxldCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWVbY21wXSk7XG4gICAgICAgIGxldCBjb25zdHJhaW50RmllbGROYW1lO1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgbGV0IGNhc3RUeXBlO1xuICAgICAgICAgIHN3aXRjaCAodHlwZW9mIHBvc3RncmVzVmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgICAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAgICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0eXBlb2YgcG9zdGdyZXNWYWx1ZSA9PT0gJ29iamVjdCcgJiYgcG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgIT09ICdEYXRlJykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBEYXRlIGZpZWxkJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcGFyc2VyUmVzdWx0ID0gVXRpbHMucmVsYXRpdmVUaW1lVG9EYXRlKHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSk7XG4gICAgICAgICAgICBpZiAocGFyc2VyUmVzdWx0LnN0YXR1cyA9PT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICAgIHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUocGFyc2VyUmVzdWx0LnJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWV9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBgJCR7aW5kZXgrK306bmFtZWA7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB2YWx1ZXMucHVzaChwb3N0Z3Jlc1ZhbHVlKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXgrK31gKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChpbml0aWFsUGF0dGVybnNMZW5ndGggPT09IHBhdHRlcm5zLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHRoaXMgcXVlcnkgdHlwZSB5ZXQgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuICB2YWx1ZXMgPSB2YWx1ZXMubWFwKHRyYW5zZm9ybVZhbHVlKTtcbiAgcmV0dXJuIHsgcGF0dGVybjogcGF0dGVybnMuam9pbignIEFORCAnKSwgdmFsdWVzLCBzb3J0cyB9O1xufTtcblxuZXhwb3J0IGNsYXNzIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG4gIGVuYWJsZVNjaGVtYUhvb2tzOiBib29sZWFuO1xuXG4gIC8vIFByaXZhdGVcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX2NsaWVudDogYW55O1xuICBfb25jaGFuZ2U6IGFueTtcbiAgX3BncDogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIF91dWlkOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoeyB1cmksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgZGF0YWJhc2VPcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5lbmFibGVTY2hlbWFIb29rcyA9ICEhZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzO1xuICAgIGRlbGV0ZSBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG5cbiAgICBjb25zdCB7IGNsaWVudCwgcGdwIH0gPSBjcmVhdGVDbGllbnQodXJpLCBkYXRhYmFzZU9wdGlvbnMpO1xuICAgIHRoaXMuX2NsaWVudCA9IGNsaWVudDtcbiAgICB0aGlzLl9vbmNoYW5nZSA9ICgpID0+IHt9O1xuICAgIHRoaXMuX3BncCA9IHBncDtcbiAgICB0aGlzLl91dWlkID0gdXVpZHY0KCk7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gZmFsc2U7XG4gIH1cblxuICB3YXRjaChjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuX29uY2hhbmdlID0gY2FsbGJhY2s7XG4gIH1cblxuICAvL05vdGUgdGhhdCBhbmFseXplPXRydWUgd2lsbCBydW4gdGhlIHF1ZXJ5LCBleGVjdXRpbmcgSU5TRVJUUywgREVMRVRFUywgZXRjLlxuICBjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcsIGFuYWx5emU6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGlmIChhbmFseXplKSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEFOQUxZWkUsIEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW0uZG9uZSgpO1xuICAgICAgZGVsZXRlIHRoaXMuX3N0cmVhbTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5fY2xpZW50LiRwb29sLmVuZCgpO1xuICB9XG5cbiAgYXN5bmMgX2xpc3RlblRvU2NoZW1hKCkge1xuICAgIGlmICghdGhpcy5fc3RyZWFtICYmIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MpIHtcbiAgICAgIHRoaXMuX3N0cmVhbSA9IGF3YWl0IHRoaXMuX2NsaWVudC5jb25uZWN0KHsgZGlyZWN0OiB0cnVlIH0pO1xuICAgICAgdGhpcy5fc3RyZWFtLmNsaWVudC5vbignbm90aWZpY2F0aW9uJywgZGF0YSA9PiB7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGRhdGEucGF5bG9hZCk7XG4gICAgICAgIGlmIChwYXlsb2FkLnNlbmRlcklkICE9PSB0aGlzLl91dWlkKSB7XG4gICAgICAgICAgdGhpcy5fb25jaGFuZ2UoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLl9zdHJlYW0ubm9uZSgnTElTVEVOICQxficsICdzY2hlbWEuY2hhbmdlJyk7XG4gICAgfVxuICB9XG5cbiAgX25vdGlmeVNjaGVtYUNoYW5nZSgpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW1cbiAgICAgICAgLm5vbmUoJ05PVElGWSAkMX4sICQyJywgWydzY2hlbWEuY2hhbmdlJywgeyBzZW5kZXJJZDogdGhpcy5fdXVpZCB9XSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIE5vdGlmeTonLCBlcnJvcik7IC8vIHVubGlrZWx5IHRvIGV2ZXIgaGFwcGVuXG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBhc3luYyBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50YXNrKCdzZXQtY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsICdzY2hlbWEnLCAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJywgSlNPTi5zdHJpbmdpZnkoQ0xQcyldO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGtleSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBjb25uLnR4KCdzZXQtaW5kZXhlcy13aXRoLXNjaGVtYS1mb3JtYXQnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgaWYgKGRlbGV0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgc2VsZi5kcm9wSW5kZXhlcyhjbGFzc05hbWUsIGRlbGV0ZWRJbmRleGVzLCB0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxJyxcbiAgICAgICAgW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdpbmRleGVzJywgSlNPTi5zdHJpbmdpZnkoZXhpc3RpbmdJbmRleGVzKV1cbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiA/YW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gYXdhaXQgY29ublxuICAgICAgLnR4KCdjcmVhdGUtY2xhc3MnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5jcmVhdGVUYWJsZShjbGFzc05hbWUsIHNjaGVtYSwgdCk7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnSU5TRVJUIElOVE8gXCJfU0NIRU1BXCIgKFwiY2xhc3NOYW1lXCIsIFwic2NoZW1hXCIsIFwiaXNQYXJzZUNsYXNzXCIpIFZBTFVFUyAoJDxjbGFzc05hbWU+LCAkPHNjaGVtYT4sIHRydWUpJyxcbiAgICAgICAgICB7IGNsYXNzTmFtZSwgc2NoZW1hIH1cbiAgICAgICAgKTtcbiAgICAgICAgYXdhaXQgdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChjbGFzc05hbWUsIHNjaGVtYS5pbmRleGVzLCB7fSwgc2NoZW1hLmZpZWxkcywgdCk7XG4gICAgICAgIHJldHVybiB0b1BhcnNlU2NoZW1hKHNjaGVtYSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmIGVyci5kZXRhaWwuaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHBhcnNlU2NoZW1hO1xuICB9XG5cbiAgLy8gSnVzdCBjcmVhdGUgYSB0YWJsZSwgZG8gbm90IGluc2VydCBpbiBzY2hlbWFcbiAgYXN5bmMgY3JlYXRlVGFibGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGRlYnVnKCdjcmVhdGVUYWJsZScpO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgY29uc3QgcGF0dGVybnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5hc3NpZ24oe30sIHNjaGVtYS5maWVsZHMpO1xuICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZmFpbGVkX2xvZ2luX2NvdW50ID0geyB0eXBlOiAnTnVtYmVyJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIGNvbnN0IHJlbGF0aW9ucyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKGZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgY29uc3QgcGFyc2VUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAvLyBTa2lwIHdoZW4gaXQncyBhIHJlbGF0aW9uXG4gICAgICAvLyBXZSdsbCBjcmVhdGUgdGhlIHRhYmxlcyBsYXRlclxuICAgICAgaWYgKHBhcnNlVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJlbGF0aW9ucy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICBwYXJzZVR5cGUuY29udGVudHMgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICB9XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHBhcnNlVHlwZSkpO1xuICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGAkJHtpbmRleH06bmFtZSAkJHtpbmRleCArIDF9OnJhd2ApO1xuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYFBSSU1BUlkgS0VZICgkJHtpbmRleH06bmFtZSlgKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gaW5kZXggKyAyO1xuICAgIH0pO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQxOm5hbWUgKCR7cGF0dGVybnNBcnJheS5qb2luKCl9KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4udmFsdWVzQXJyYXldO1xuXG4gICAgcmV0dXJuIGNvbm4udGFzaygnY3JlYXRlLXRhYmxlJywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUocXMsIHZhbHVlcyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogVGFibGUgYWxyZWFkeSBleGlzdHMsIG11c3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBkaWZmZXJlbnQgcmVxdWVzdC4gSWdub3JlIHRoZSBlcnJvci5cbiAgICAgIH1cbiAgICAgIGF3YWl0IHQudHgoJ2NyZWF0ZS10YWJsZS10eCcsIHR4ID0+IHtcbiAgICAgICAgcmV0dXJuIHR4LmJhdGNoKFxuICAgICAgICAgIHJlbGF0aW9ucy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHJldHVybiB0eC5ub25lKFxuICAgICAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2NoZW1hVXBncmFkZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBkZWJ1Zygnc2NoZW1hVXBncmFkZScpO1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGF3YWl0IGNvbm4udGFzaygnc2NoZW1hLXVwZ3JhZGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSBhd2FpdCB0Lm1hcChcbiAgICAgICAgJ1NFTEVDVCBjb2x1bW5fbmFtZSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIFdIRVJFIHRhYmxlX25hbWUgPSAkPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IGNsYXNzTmFtZSB9LFxuICAgICAgICBhID0+IGEuY29sdW1uX25hbWVcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXdDb2x1bW5zID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGNvbHVtbnMuaW5kZXhPZihpdGVtKSA9PT0gLTEpXG4gICAgICAgIC5tYXAoZmllbGROYW1lID0+IHNlbGYuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSk7XG5cbiAgICAgIGF3YWl0IHQuYmF0Y2gobmV3Q29sdW1ucyk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgLy8gVE9ETzogTXVzdCBiZSByZXZpc2VkIGZvciBpbnZhbGlkIGxvZ2ljLi4uXG4gICAgZGVidWcoJ2FkZEZpZWxkSWZOb3RFeGlzdHMnKTtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ2FkZC1maWVsZC1pZi1ub3QtZXhpc3RzJywgYXN5bmMgdCA9PiB7XG4gICAgICBpZiAodHlwZS50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICAgJ0FMVEVSIFRBQkxFICQ8Y2xhc3NOYW1lOm5hbWU+IEFERCBDT0xVTU4gSUYgTk9UIEVYSVNUUyAkPGZpZWxkTmFtZTpuYW1lPiAkPHBvc3RncmVzVHlwZTpyYXc+JyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICAgIHBvc3RncmVzVHlwZTogcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUodHlwZSksXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5jcmVhdGVDbGFzcyhjbGFzc05hbWUsIHsgZmllbGRzOiB7IFtmaWVsZE5hbWVdOiB0eXBlIH0gfSwgdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ29sdW1uIGFscmVhZHkgZXhpc3RzLCBjcmVhdGVkIGJ5IG90aGVyIHJlcXVlc3QuIENhcnJ5IG9uIHRvIHNlZSBpZiBpdCdzIHRoZSByaWdodCB0eXBlLlxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdC5hbnkoXG4gICAgICAgICdTRUxFQ1QgXCJzY2hlbWFcIiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4gYW5kIChcInNjaGVtYVwiOjpqc29uLT5cXCdmaWVsZHNcXCctPiQ8ZmllbGROYW1lPikgaXMgbm90IG51bGwnLFxuICAgICAgICB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH1cbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXN1bHRbMF0pIHtcbiAgICAgICAgdGhyb3cgJ0F0dGVtcHRlZCB0byBhZGQgYSBmaWVsZCB0aGF0IGFscmVhZHkgZXhpc3RzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCd1cGRhdGUtc2NoZW1hLWZpZWxkLW9wdGlvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGFzeW5jIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgb3BlcmF0aW9ucyA9IFtcbiAgICAgIHsgcXVlcnk6IGBEUk9QIFRBQkxFIElGIEVYSVNUUyAkMTpuYW1lYCwgdmFsdWVzOiBbY2xhc3NOYW1lXSB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYERFTEVURSBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlczogW2NsYXNzTmFtZV0sXG4gICAgICB9LFxuICAgIF07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQob3BlcmF0aW9ucykpKVxuICAgICAgLnRoZW4oKCkgPT4gY2xhc3NOYW1lLmluZGV4T2YoJ19Kb2luOicpICE9IDApOyAvLyByZXNvbHZlcyB3aXRoIGZhbHNlIHdoZW4gX0pvaW4gdGFibGVcblxuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBhbGwgZGF0YSBrbm93biB0byB0aGlzIGFkYXB0ZXIuIFVzZWQgZm9yIHRlc3RpbmcuXG4gIGFzeW5jIGRlbGV0ZUFsbENsYXNzZXMoKSB7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgY29uc3QgaGVscGVycyA9IHRoaXMuX3BncC5oZWxwZXJzO1xuICAgIGRlYnVnKCdkZWxldGVBbGxDbGFzc2VzJyk7XG5cbiAgICBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50YXNrKCdkZWxldGUtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInKTtcbiAgICAgICAgICBjb25zdCBqb2lucyA9IHJlc3VsdHMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGxpc3QuY29uY2F0KGpvaW5UYWJsZXNGb3JTY2hlbWEoc2NoZW1hLnNjaGVtYSkpO1xuICAgICAgICAgIH0sIFtdKTtcbiAgICAgICAgICBjb25zdCBjbGFzc2VzID0gW1xuICAgICAgICAgICAgJ19TQ0hFTUEnLFxuICAgICAgICAgICAgJ19QdXNoU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgICAgICAgJ19Ib29rcycsXG4gICAgICAgICAgICAnX0dsb2JhbENvbmZpZycsXG4gICAgICAgICAgICAnX0dyYXBoUUxDb25maWcnLFxuICAgICAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgICAgICAnX0lkZW1wb3RlbmN5JyxcbiAgICAgICAgICAgIC4uLnJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuY2xhc3NOYW1lKSxcbiAgICAgICAgICAgIC4uLmpvaW5zLFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3QgcXVlcmllcyA9IGNsYXNzZXMubWFwKGNsYXNzTmFtZSA9PiAoe1xuICAgICAgICAgICAgcXVlcnk6ICdEUk9QIFRBQkxFIElGIEVYSVNUUyAkPGNsYXNzTmFtZTpuYW1lPicsXG4gICAgICAgICAgICB2YWx1ZXM6IHsgY2xhc3NOYW1lIH0sXG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIGF3YWl0IHQudHgodHggPT4gdHgubm9uZShoZWxwZXJzLmNvbmNhdChxdWVyaWVzKSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBObyBfU0NIRU1BIGNvbGxlY3Rpb24uIERvbid0IGRlbGV0ZSBhbnl0aGluZy5cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgZGVidWcoYGRlbGV0ZUFsbENsYXNzZXMgZG9uZSBpbiAke25ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbm93fWApO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBhc3luYyBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnZGVsZXRlLWZpZWxkcycsIGFzeW5jIHQgPT4ge1xuICAgICAgYXdhaXQgdC5ub25lKCdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCIgPSAkPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uc31gLCB2YWx1ZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIHJldHVybiBhd2FpdCB0Lm1hcCgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicsIG51bGwsIHJvdyA9PlxuICAgICAgICB0b1BhcnNlU2NoZW1hKHsgY2xhc3NOYW1lOiByb3cuY2xhc3NOYW1lLCAuLi5yb3cuc2NoZW1hIH0pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgYXN5bmMgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZ2V0Q2xhc3MnKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnKTtcbiAgICBsZXQgY29sdW1uc0FycmF5ID0gW107XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzID0ge307XG5cbiAgICBvYmplY3QgPSBoYW5kbGVEb3RGaWVsZHMob2JqZWN0KTtcblxuICAgIHZhbGlkYXRlS2V5cyhvYmplY3QpO1xuXG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXSA9IG9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGZpZWxkTmFtZSA9ICdhdXRoRGF0YSc7XG4gICAgICB9XG5cbiAgICAgIGNvbHVtbnNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2ZhaWxlZF9sb2dpbl9jb3VudCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfaGlzdG9yeSdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Jykge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCdcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm9iamVjdElkKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyYXknOlxuICAgICAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkob2JqZWN0W2ZpZWxkTmFtZV0pKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ubmFtZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvbHlnb24nOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKG9iamVjdFtmaWVsZE5hbWVdLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgICAgLy8gcG9wIHRoZSBwb2ludCBhbmQgcHJvY2VzcyBsYXRlclxuICAgICAgICAgIGdlb1BvaW50c1tmaWVsZE5hbWVdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgY29sdW1uc0FycmF5LnBvcCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IGBUeXBlICR7c2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGV9IG5vdCBzdXBwb3J0ZWQgeWV0YDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbHVtbnNBcnJheSA9IGNvbHVtbnNBcnJheS5jb25jYXQoT2JqZWN0LmtleXMoZ2VvUG9pbnRzKSk7XG4gICAgY29uc3QgaW5pdGlhbFZhbHVlcyA9IHZhbHVlc0FycmF5Lm1hcCgodmFsLCBpbmRleCkgPT4ge1xuICAgICAgbGV0IHRlcm1pbmF0aW9uID0gJyc7XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBjb2x1bW5zQXJyYXlbaW5kZXhdO1xuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6dGV4dFtdJztcbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6anNvbmInO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtpbmRleCArIDIgKyBjb2x1bW5zQXJyYXkubGVuZ3RofSR7dGVybWluYXRpb259YDtcbiAgICB9KTtcbiAgICBjb25zdCBnZW9Qb2ludHNJbmplY3RzID0gT2JqZWN0LmtleXMoZ2VvUG9pbnRzKS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZ2VvUG9pbnRzW2tleV07XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlLmxvbmdpdHVkZSwgdmFsdWUubGF0aXR1ZGUpO1xuICAgICAgY29uc3QgbCA9IHZhbHVlc0FycmF5Lmxlbmd0aCArIGNvbHVtbnNBcnJheS5sZW5ndGg7XG4gICAgICByZXR1cm4gYFBPSU5UKCQke2x9LCAkJHtsICsgMX0pYDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbHVtbnNQYXR0ZXJuID0gY29sdW1uc0FycmF5Lm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApLmpvaW4oKTtcbiAgICBjb25zdCB2YWx1ZXNQYXR0ZXJuID0gaW5pdGlhbFZhbHVlcy5jb25jYXQoZ2VvUG9pbnRzSW5qZWN0cykuam9pbigpO1xuXG4gICAgY29uc3QgcXMgPSBgSU5TRVJUIElOVE8gJDE6bmFtZSAoJHtjb2x1bW5zUGF0dGVybn0pIFZBTFVFUyAoJHt2YWx1ZXNQYXR0ZXJufSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmNvbHVtbnNBcnJheSwgLi4udmFsdWVzQXJyYXldO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm5vbmUocXMsIHZhbHVlcylcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW29iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yKSB7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLmNvbnN0cmFpbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5jb25zdHJhaW50Lm1hdGNoKC91bmlxdWVfKFthLXpBLVpdKykvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yID0gZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgYXN5bmMgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2RlbGV0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3QgaW5kZXggPSAyO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGlmIChPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB3aGVyZS5wYXR0ZXJuID0gJ1RSVUUnO1xuICAgIH1cbiAgICBjb25zdCBxcyA9IGBXSVRIIGRlbGV0ZWQgQVMgKERFTEVURSBGUk9NICQxOm5hbWUgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufSBSRVRVUk5JTkcgKikgU0VMRUNUIGNvdW50KCopIEZST00gZGVsZXRlZGA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScpO1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbihcbiAgICAgIHZhbCA9PiB2YWxbMF1cbiAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHVwZGF0ZVBhdHRlcm5zID0gW107XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG5cbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHsgLi4udXBkYXRlIH07XG5cbiAgICAvLyBTZXQgZmxhZyBmb3IgZG90IG5vdGF0aW9uIGZpZWxkc1xuICAgIGNvbnN0IGRvdE5vdGF0aW9uT3B0aW9ucyA9IHt9O1xuICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmlyc3RdID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdXBkYXRlID0gaGFuZGxlRG90RmllbGRzKHVwZGF0ZSk7XG4gICAgLy8gUmVzb2x2ZSBhdXRoRGF0YSBmaXJzdCxcbiAgICAvLyBTbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCBtdWx0aXBsZSBrZXkgdXBkYXRlc1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ10gPSB1cGRhdGVbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGZpZWxkVmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIC8vIERyb3AgYW55IHVuZGVmaW5lZCB2YWx1ZXMuXG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09ICdhdXRoRGF0YScpIHtcbiAgICAgICAgLy8gVGhpcyByZWN1cnNpdmVseSBzZXRzIHRoZSBqc29uX29iamVjdFxuICAgICAgICAvLyBPbmx5IDEgbGV2ZWwgZGVlcFxuICAgICAgICBjb25zdCBnZW5lcmF0ZSA9IChqc29uYjogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBganNvbl9vYmplY3Rfc2V0X2tleShDT0FMRVNDRSgke2pzb25ifSwgJ3t9Jzo6anNvbmIpLCAke2tleX0sICR7dmFsdWV9KTo6anNvbmJgO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBsYXN0S2V5ID0gYCQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgY29uc3QgZmllbGROYW1lSW5kZXggPSBpbmRleDtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZmllbGRWYWx1ZSkucmVkdWNlKChsYXN0S2V5OiBzdHJpbmcsIGtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RyID0gZ2VuZXJhdGUobGFzdEtleSwgYCQke2luZGV4fTo6dGV4dGAsIGAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgbGV0IHZhbHVlID0gZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9LCBsYXN0S2V5KTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7ZmllbGROYW1lSW5kZXh9Om5hbWUgPSAke3VwZGF0ZX1gKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnSW5jcmVtZW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAwKSArICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmFtb3VudCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGQoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGRVbmlxdWUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkX3VuaXF1ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAvL1RPRE86IHN0b3Agc3BlY2lhbCBjYXNpbmcgdGhpcy4gSXQgc2hvdWxkIGNoZWNrIGZvciBfX3R5cGUgPT09ICdEYXRlJyBhbmQgdXNlIC5pc29cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdPYmplY3QnXG4gICAgICApIHtcbiAgICAgICAgLy8gR2F0aGVyIGtleXMgdG8gaW5jcmVtZW50XG4gICAgICAgIGNvbnN0IGtleXNUb0luY3JlbWVudCA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IE9iamVjdC5rZXlzIGlzIGl0ZXJhdGluZyBvdmVyIHRoZSAqKm9yaWdpbmFsKiogdXBkYXRlIG9iamVjdFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgc29tZSBvZiB0aGUga2V5cyBvZiB0aGUgb3JpZ2luYWwgdXBkYXRlIGNvdWxkIGJlIG51bGwgb3IgdW5kZWZpbmVkOlxuICAgICAgICAgICAgLy8gKFNlZSB0aGUgYWJvdmUgY2hlY2sgYGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IHR5cGVvZiBmaWVsZFZhbHVlID09IFwidW5kZWZpbmVkXCIpYClcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnSW5jcmVtZW50JyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgbGV0IGluY3JlbWVudFBhdHRlcm5zID0gJyc7XG4gICAgICAgIGlmIChrZXlzVG9JbmNyZW1lbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGluY3JlbWVudFBhdHRlcm5zID1cbiAgICAgICAgICAgICcgfHwgJyArXG4gICAgICAgICAgICBrZXlzVG9JbmNyZW1lbnRcbiAgICAgICAgICAgICAgLm1hcChjID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhbW91bnQgPSBmaWVsZFZhbHVlW2NdLmFtb3VudDtcbiAgICAgICAgICAgICAgICByZXR1cm4gYENPTkNBVCgne1wiJHtjfVwiOicsIENPQUxFU0NFKCQke2luZGV4fTpuYW1lLT4+JyR7Y30nLCcwJyk6OmludCArICR7YW1vdW50fSwgJ30nKTo6anNvbmJgO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbignIHx8ICcpO1xuICAgICAgICAgIC8vIFN0cmlwIHRoZSBrZXlzXG4gICAgICAgICAga2V5c1RvSW5jcmVtZW50LmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXQuXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGNvbnN0IGRlbGV0ZVBhdHRlcm5zID0ga2V5c1RvRGVsZXRlLnJlZHVjZSgocDogc3RyaW5nLCBjOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpfTp2YWx1ZSdgO1xuICAgICAgICB9LCAnJyk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDEgKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIHsgZmllbGROYW1lLCBmaWVsZFZhbHVlIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdXBkYXRlICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9IHlldGBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KS5hbnkocXMsIHZhbHVlcyk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSwgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygndXBzZXJ0T25lT2JqZWN0Jyk7XG4gICAgY29uc3QgY3JlYXRlVmFsdWUgPSBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgdXBkYXRlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVPYmplY3QoY2xhc3NOYW1lLCBzY2hlbWEsIGNyZWF0ZVZhbHVlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gaWdub3JlIGR1cGxpY2F0ZSB2YWx1ZSBlcnJvcnMgYXMgaXQncyB1cHNlcnRcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maW5kT25lQW5kVXBkYXRlKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgfSk7XG4gIH1cblxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9OiBRdWVyeU9wdGlvbnNcbiAgKSB7XG4gICAgZGVidWcoJ2ZpbmQnKTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IGxpbWl0UGF0dGVybiA9IGhhc0xpbWl0ID8gYExJTUlUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzTGltaXQpIHtcbiAgICAgIHZhbHVlcy5wdXNoKGxpbWl0KTtcbiAgICB9XG4gICAgY29uc3Qgc2tpcFBhdHRlcm4gPSBoYXNTa2lwID8gYE9GRlNFVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc1NraXApIHtcbiAgICAgIHZhbHVlcy5wdXNoKHNraXApO1xuICAgIH1cblxuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGlmIChzb3J0KSB7XG4gICAgICBjb25zdCBzb3J0Q29weTogYW55ID0gc29ydDtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBPYmplY3Qua2V5cyhzb3J0KVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPSBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgIH1cbiAgICBpZiAod2hlcmUuc29ydHMgJiYgT2JqZWN0LmtleXMoKHdoZXJlLnNvcnRzOiBhbnkpKS5sZW5ndGggPiAwKSB7XG4gICAgICBzb3J0UGF0dGVybiA9IGBPUkRFUiBCWSAke3doZXJlLnNvcnRzLmpvaW4oKX1gO1xuICAgIH1cblxuICAgIGxldCBjb2x1bW5zID0gJyonO1xuICAgIGlmIChrZXlzKSB7XG4gICAgICAvLyBFeGNsdWRlIGVtcHR5IGtleXNcbiAgICAgIC8vIFJlcGxhY2UgQUNMIGJ5IGl0J3Mga2V5c1xuICAgICAga2V5cyA9IGtleXMucmVkdWNlKChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vLnB1c2goJ19ycGVybScpO1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3dwZXJtJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAga2V5Lmxlbmd0aCA+IDAgJiZcbiAgICAgICAgICAvLyBSZW1vdmUgc2VsZWN0ZWQgZmllbGQgbm90IHJlZmVyZW5jZWQgaW4gdGhlIHNjaGVtYVxuICAgICAgICAgIC8vIFJlbGF0aW9uIGlzIG5vdCBhIGNvbHVtbiBpbiBwb3N0Z3Jlc1xuICAgICAgICAgIC8vICRzY29yZSBpcyBhIFBhcnNlIHNwZWNpYWwgZmllbGQgYW5kIGlzIGFsc28gbm90IGEgY29sdW1uXG4gICAgICAgICAgKChzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgIT09ICdSZWxhdGlvbicpIHx8IGtleSA9PT0gJyRzY29yZScpXG4gICAgICAgICkge1xuICAgICAgICAgIG1lbW8ucHVzaChrZXkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfSwgW10pO1xuICAgICAgY29sdW1ucyA9IGtleXNcbiAgICAgICAgLm1hcCgoa2V5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChrZXkgPT09ICckc2NvcmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gYHRzX3JhbmtfY2QodG9fdHN2ZWN0b3IoJCR7Mn0sICQkezN9Om5hbWUpLCB0b190c3F1ZXJ5KCQkezR9LCAkJHs1fSksIDMyKSBhcyBzY29yZWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJCR7aW5kZXggKyB2YWx1ZXMubGVuZ3RoICsgMX06bmFtZWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICB2YWx1ZXMgPSB2YWx1ZXMuY29uY2F0KGtleXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBgU0VMRUNUICR7Y29sdW1uc30gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn0gJHtza2lwUGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gUXVlcnkgb24gbm9uIGV4aXN0aW5nIHRhYmxlLCBkb24ndCBjcmFzaFxuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBDb252ZXJ0cyBmcm9tIGEgcG9zdGdyZXMtZm9ybWF0IG9iamVjdCB0byBhIFJFU1QtZm9ybWF0IG9iamVjdC5cbiAgLy8gRG9lcyBub3Qgc3RyaXAgb3V0IGFueXRoaW5nIGJhc2VkIG9uIGEgbGFjayBvZiBhdXRoZW50aWNhdGlvbi5cbiAgcG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgc2NoZW1hOiBhbnkpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyAmJiBvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICBsYXRpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueSxcbiAgICAgICAgICBsb25naXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLngsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBsZXQgY29vcmRzID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5zdWJzdHIoMiwgY29vcmRzLmxlbmd0aCAtIDQpLnNwbGl0KCcpLCgnKTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFtwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMV0pLCBwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMF0pXTtcbiAgICAgICAgfSk7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgICAgICAgIGNvb3JkaW5hdGVzOiBjb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IGNvbnN0cmFpbnROYW1lID0gYCR7Y2xhc3NOYW1lfV91bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZShxcywgW2NsYXNzTmFtZSwgY29uc3RyYWludE5hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgYXN5bmMgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPSAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiB7XG4gICAgICAgIGlmIChhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSBudWxsIHx8IGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IC0xKSB7XG4gICAgICAgICAgcmV0dXJuICFpc05hTigrYS5jb3VudCkgPyArYS5jb3VudCA6IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmFwcHJveGltYXRlX3Jvd19jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnKTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtmaWVsZCwgY29sdW1uLCBjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiA0LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgdHJhbnNmb3JtZXIgPSBpc0FycmF5RmllbGQgPyAnanNvbmJfYXJyYXlfZWxlbWVudHMnIDogJ09OJztcbiAgICBsZXQgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOm5hbWUpICQyOm5hbWUgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6cmF3KSAkMjpyYXcgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvcikge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKCFpc05lc3RlZCkge1xuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihvYmplY3QgPT4gb2JqZWN0W2ZpZWxkXSAhPT0gbnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvYmplY3RbZmllbGRdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkXSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2hpbGQgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVsxXTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiBvYmplY3RbY29sdW1uXVtjaGlsZF0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT5cbiAgICAgICAgcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKVxuICAgICAgKTtcbiAgfVxuXG4gIGFzeW5jIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICBkZWJ1ZygnYWdncmVnYXRlJyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAyO1xuICAgIGxldCBjb2x1bW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb3VudEZpZWxkID0gbnVsbDtcbiAgICBsZXQgZ3JvdXBWYWx1ZXMgPSBudWxsO1xuICAgIGxldCB3aGVyZVBhdHRlcm4gPSAnJztcbiAgICBsZXQgbGltaXRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNraXBQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGdyb3VwUGF0dGVybiA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGlwZWxpbmUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHN0YWdlID0gcGlwZWxpbmVbaV07XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kZ3JvdXBbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlICE9PSAnJykge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyBcIm9iamVjdElkXCJgKTtcbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVthbGlhc10gPT09ICdzdHJpbmcnICYmIHZhbHVlW2FsaWFzXSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc11bb3BlcmF0aW9uXSk7XG4gICAgICAgICAgICAgICAgaWYgKG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgYEVYVFJBQ1QoJHtcbiAgICAgICAgICAgICAgICAgICAgICBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXVxuICAgICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKTo6aW50ZWdlciBBUyAkJHtpbmRleCArIDF9Om5hbWVgXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpyYXdgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZ3JvdXBCeUZpZWxkcy5qb2luKCkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaWYgKHZhbHVlLiRzdW0pIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZS4kc3VtID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgU1VNKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kc3VtKSwgZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY291bnRGaWVsZCA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQ09VTlQoKikgQVMgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtYXgpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNQVgoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWF4KSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtaW4pIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNSU4oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWluKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRhdmcpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBBVkcoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kYXZnKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sdW1ucy5wdXNoKCcqJyk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgaWYgKGNvbHVtbnMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIGNvbHVtbnMgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kcHJvamVjdFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSAxIHx8IHZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICAgICAgICBjb25zdCBvck9yQW5kID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlLiRtYXRjaCwgJyRvcicpXG4gICAgICAgICAgPyAnIE9SICdcbiAgICAgICAgICA6ICcgQU5EICc7XG5cbiAgICAgICAgaWYgKHN0YWdlLiRtYXRjaC4kb3IpIHtcbiAgICAgICAgICBjb25zdCBjb2xsYXBzZSA9IHt9O1xuICAgICAgICAgIHN0YWdlLiRtYXRjaC4kb3IuZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgY29sbGFwc2Vba2V5XSA9IGVsZW1lbnRba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2ggPSBjb2xsYXBzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRtYXRjaCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJG1hdGNoW2ZpZWxkXTtcbiAgICAgICAgICBjb25zdCBtYXRjaFBhdHRlcm5zID0gW107XG4gICAgICAgICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsdWVbY21wXSkge1xuICAgICAgICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBtYXRjaFBhdHRlcm5zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hlcmVQYXR0ZXJuID0gcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBzb3J0aW5nLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZ3JvdXBQYXR0ZXJuKSB7XG4gICAgICBjb2x1bW5zLmZvckVhY2goKGUsIGksIGEpID0+IHtcbiAgICAgICAgaWYgKGUgJiYgZS50cmltKCkgPT09ICcqJykge1xuICAgICAgICAgIGFbaV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbigpfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c2tpcFBhdHRlcm59ICR7Z3JvdXBQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHZhbHVlcykudGhlbihhID0+IHtcbiAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgIHJldHVybiBhO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0cyA9IGEubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnb2JqZWN0SWQnKSkge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0ge307XG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZFtrZXldID0gcmVzdWx0W2tleV07XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudEZpZWxkKSB7XG4gICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oeyBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIH06IGFueSkge1xuICAgIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB0byBtYWtlIHByb3BlciB1c2Ugb2YgY29ubmVjdGlvbnMgKEB2aXRhbHktdClcbiAgICBkZWJ1ZygncGVyZm9ybUluaXRpYWxpemF0aW9uJyk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cygpO1xuICAgIGNvbnN0IHByb21pc2VzID0gVm9sYXRpbGVDbGFzc2VzU2NoZW1hcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRhYmxlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciB8fFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuc2NoZW1hVXBncmFkZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpKTtcbiAgICB9KTtcbiAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2xpc3RlblRvU2NoZW1hKCkpO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsIGFzeW5jIHQgPT4ge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwubWlzYy5qc29uT2JqZWN0U2V0S2V5cyk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGQpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LnJlbW92ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zKTtcbiAgICAgICAgICByZXR1cm4gdC5jdHg7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGN0eCA9PiB7XG4gICAgICAgIGRlYnVnKGBpbml0aWFsaXphdGlvbkRvbmUgaW4gJHtjdHguZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiA/YW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgICAgICAgIGkubmFtZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGkua2V5LFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzSWZOZWVkZWQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgZmllbGROYW1lLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHlwZSxcbiAgICBdKTtcbiAgfVxuXG4gIGFzeW5jIGRyb3BJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHF1ZXJpZXMgPSBpbmRleGVzLm1hcChpID0+ICh7XG4gICAgICBxdWVyeTogJ0RST1AgSU5ERVggJDE6bmFtZScsXG4gICAgICB2YWx1ZXM6IGksXG4gICAgfSkpO1xuICAgIGF3YWl0IChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gIH1cblxuICBhc3luYyBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICBhc3luYyB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KHQgPT4ge1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50ID0gdDtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2ggPSBbXTtcbiAgICAgICAgcmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdDtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdC5jYXRjaCgpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2goUHJvbWlzZS5yZWplY3QoKSk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IGRlZmF1bHRJbmRleE5hbWUgPSBgcGFyc2VfZGVmYXVsdF8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9XG4gICAgICBpbmRleE5hbWUgIT0gbnVsbCA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7IG5hbWU6IGRlZmF1bHRJbmRleE5hbWUgfTtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGBsb3dlcigkJHtpbmRleCArIDN9Om5hbWUpIHZhcmNoYXJfcGF0dGVybl9vcHNgKVxuICAgICAgOiBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIGNvbnN0IHNldElkZW1wb3RlbmN5RnVuY3Rpb24gPVxuICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gOiBmYWxzZTtcbiAgICBpZiAoc2V0SWRlbXBvdGVuY3lGdW5jdGlvbikge1xuICAgICAgYXdhaXQgdGhpcy5lbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzKG9wdGlvbnMpO1xuICAgIH1cbiAgICBhd2FpdCBjb25uLm5vbmUocXMsIFtpbmRleE5hbWVPcHRpb25zLm5hbWUsIGNsYXNzTmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24ob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcXMgPSAnRFJPUCBGVU5DVElPTiBJRiBFWElTVFMgaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpJztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgdHRsT3B0aW9ucyA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyBgJHtvcHRpb25zLnR0bH0gc2Vjb25kc2AgOiAnNjAgc2Vjb25kcyc7XG4gICAgY29uc3QgcXMgPVxuICAgICAgJ0NSRUFURSBPUiBSRVBMQUNFIEZVTkNUSU9OIGlkZW1wb3RlbmN5X2RlbGV0ZV9leHBpcmVkX3JlY29yZHMoKSBSRVRVUk5TIHZvaWQgTEFOR1VBR0UgcGxwZ3NxbCBBUyAkJCBCRUdJTiBERUxFVEUgRlJPTSBcIl9JZGVtcG90ZW5jeVwiIFdIRVJFIGV4cGlyZSA8IE5PVygpIC0gSU5URVJWQUwgJDE7IEVORDsgJCQ7JztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzLCBbdHRsT3B0aW9uc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQb2x5Z29uVG9TUUwocG9seWdvbikge1xuICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYFBvbHlnb24gbXVzdCBoYXZlIGF0IGxlYXN0IDMgdmFsdWVzYCk7XG4gIH1cbiAgaWYgKFxuICAgIHBvbHlnb25bMF1bMF0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVswXSB8fFxuICAgIHBvbHlnb25bMF1bMV0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVsxXVxuICApIHtcbiAgICBwb2x5Z29uLnB1c2gocG9seWdvblswXSk7XG4gIH1cbiAgY29uc3QgdW5pcXVlID0gcG9seWdvbi5maWx0ZXIoKGl0ZW0sIGluZGV4LCBhcikgPT4ge1xuICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgcHQgPSBhcltpXTtcbiAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmb3VuZEluZGV4ID09PSBpbmRleDtcbiAgfSk7XG4gIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICApO1xuICB9XG4gIGNvbnN0IHBvaW50cyA9IHBvbHlnb25cbiAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgICAgcmV0dXJuIGAoJHtwb2ludFsxXX0sICR7cG9pbnRbMF19KWA7XG4gICAgfSlcbiAgICAuam9pbignLCAnKTtcbiAgcmV0dXJuIGAoJHtwb2ludHN9KWA7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpIHtcbiAgaWYgKCFyZWdleC5lbmRzV2l0aCgnXFxuJykpIHtcbiAgICByZWdleCArPSAnXFxuJztcbiAgfVxuXG4gIC8vIHJlbW92ZSBub24gZXNjYXBlZCBjb21tZW50c1xuICByZXR1cm4gKFxuICAgIHJlZ2V4XG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pIy4qXFxuL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSBsaW5lcyBzdGFydGluZyB3aXRoIGEgY29tbWVudFxuICAgICAgLnJlcGxhY2UoL14jLipcXG4vZ2ltLCAnJylcbiAgICAgIC8vIHJlbW92ZSBub24gZXNjYXBlZCB3aGl0ZXNwYWNlXG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxzKy9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuICAgICAgLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAudHJpbSgpXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NSZWdleFBhdHRlcm4ocykge1xuICBpZiAocyAmJiBzLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIC8vIHJlZ2V4IGZvciBzdGFydHNXaXRoXG4gICAgcmV0dXJuICdeJyArIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgxKSk7XG4gIH0gZWxzZSBpZiAocyAmJiBzLmVuZHNXaXRoKCckJykpIHtcbiAgICAvLyByZWdleCBmb3IgZW5kc1dpdGhcbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDAsIHMubGVuZ3RoIC0gMSkpICsgJyQnO1xuICB9XG5cbiAgLy8gcmVnZXggZm9yIGNvbnRhaW5zXG4gIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMpO1xufVxuXG5mdW5jdGlvbiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZSkge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXFxeXFxcXFEuKlxcXFxFLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdLiRyZWdleCk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0uJHJlZ2V4KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKHZhbHVlcykge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlLiRyZWdleCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKSB7XG4gIHJldHVybiByZW1haW5pbmdcbiAgICAuc3BsaXQoJycpXG4gICAgLm1hcChjID0+IHtcbiAgICAgIGNvbnN0IHJlZ2V4ID0gUmVnRXhwKCdbMC05IF18XFxcXHB7TH0nLCAndScpOyAvLyBTdXBwb3J0IGFsbCB1bmljb2RlIGxldHRlciBjaGFyc1xuICAgICAgaWYgKGMubWF0Y2gocmVnZXgpICE9PSBudWxsKSB7XG4gICAgICAgIC8vIGRvbid0IGVzY2FwZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVyc1xuICAgICAgICByZXR1cm4gYztcbiAgICAgIH1cbiAgICAgIC8vIGVzY2FwZSBldmVyeXRoaW5nIGVsc2UgKHNpbmdsZSBxdW90ZXMgd2l0aCBzaW5nbGUgcXVvdGVzLCBldmVyeXRoaW5nIGVsc2Ugd2l0aCBhIGJhY2tzbGFzaClcbiAgICAgIHJldHVybiBjID09PSBgJ2AgPyBgJydgIDogYFxcXFwke2N9YDtcbiAgICB9KVxuICAgIC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzOiBzdHJpbmcpIHtcbiAgY29uc3QgbWF0Y2hlcjEgPSAvXFxcXFEoKD8hXFxcXEUpLiopXFxcXEUkLztcbiAgY29uc3QgcmVzdWx0MTogYW55ID0gcy5tYXRjaChtYXRjaGVyMSk7XG4gIGlmIChyZXN1bHQxICYmIHJlc3VsdDEubGVuZ3RoID4gMSAmJiByZXN1bHQxLmluZGV4ID4gLTEpIHtcbiAgICAvLyBwcm9jZXNzIHJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIGFuZCBhbiBlbmQgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0MS5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MVsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gIGNvbnN0IG1hdGNoZXIyID0gL1xcXFxRKCg/IVxcXFxFKS4qKSQvO1xuICBjb25zdCByZXN1bHQyOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIyKTtcbiAgaWYgKHJlc3VsdDIgJiYgcmVzdWx0Mi5sZW5ndGggPiAxICYmIHJlc3VsdDIuaW5kZXggPiAtMSkge1xuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyKDAsIHJlc3VsdDIuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDJbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyByZW1vdmUgYWxsIGluc3RhbmNlcyBvZiBcXFEgYW5kIFxcRSBmcm9tIHRoZSByZW1haW5pbmcgdGV4dCAmIGVzY2FwZSBzaW5nbGUgcXVvdGVzXG4gIHJldHVybiBzXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcRSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXFEpLywgJyQxJylcbiAgICAucmVwbGFjZSgvXlxcXFxFLywgJycpXG4gICAgLnJlcGxhY2UoL15cXFxcUS8sICcnKVxuICAgIC5yZXBsYWNlKC8oW14nXSknLywgYCQxJydgKVxuICAgIC5yZXBsYWNlKC9eJyhbXiddKS8sIGAnJyQxYCk7XG59XG5cbnZhciBHZW9Qb2ludENvZGVyID0ge1xuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50JztcbiAgfSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFDQTs7QUFFQTs7QUFFQTs7QUFFQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVBLE1BQU1BLEtBQUssR0FBR0MsT0FBTyxDQUFDLGdCQUFELENBQXJCOztBQUVBLE1BQU1DLGlDQUFpQyxHQUFHLE9BQTFDO0FBQ0EsTUFBTUMsOEJBQThCLEdBQUcsT0FBdkM7QUFDQSxNQUFNQyw0QkFBNEIsR0FBRyxPQUFyQztBQUNBLE1BQU1DLDBCQUEwQixHQUFHLE9BQW5DO0FBQ0EsTUFBTUMsaUNBQWlDLEdBQUcsT0FBMUM7O0FBQ0EsTUFBTUMsTUFBTSxHQUFHTixPQUFPLENBQUMsaUJBQUQsQ0FBdEI7O0FBRUEsTUFBTU8sS0FBSyxHQUFHLFVBQVUsR0FBR0MsSUFB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