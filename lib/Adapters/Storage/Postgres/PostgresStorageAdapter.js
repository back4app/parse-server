"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PostgresStorageAdapter = void 0;

var _PostgresClient = require("./PostgresClient");

var _node = _interopRequireDefault(require("parse/node"));

var _lodash = _interopRequireDefault(require("lodash"));

var _sql = _interopRequireDefault(require("./sql"));

var _StorageAdapter = require("../StorageAdapter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresDuplicateObjectError = '42710';
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
      if (fieldValue.$exists) {
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
        const postgresValue = toPostgresValue(fieldValue[cmp]);
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
    databaseOptions
  }) {
    this._collectionPrefix = collectionPrefix;
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, databaseOptions);
    this._client = client;
    this._pgp = pgp;
    this.canSortOnJoinTables = false;
  } //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.


  createExplainableQuery(query, analyze = false) {
    if (analyze) {
      return 'EXPLAIN (ANALYZE, FORMAT JSON) ' + query;
    } else {
      return 'EXPLAIN (FORMAT JSON) ' + query;
    }
  }

  handleShutdown() {
    if (!this._client) {
      return;
    }

    this._client.$pool.end();
  }

  async _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    await conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      if (error.code === PostgresDuplicateRelationError || error.code === PostgresUniqueIndexViolationError || error.code === PostgresDuplicateObjectError) {// Table already exists, must have been created by a different request. Ignore error.
      } else {
        throw error;
      }
    });
  }

  async classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }

  async setClassLevelPermissions(className, CLPs) {
    const self = this;
    await this._client.task('set-class-level-permissions', async t => {
      await self._ensureSchemaCollectionExists(t);
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1`, values);
    });
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

      await self._ensureSchemaCollectionExists(t);
      await t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
  }

  async createClass(className, schema, conn) {
    conn = conn || this._client;
    return conn.tx('create-class', async t => {
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
  } // Just create a table, do not insert in schema


  async createTable(className, schema, conn) {
    conn = conn || this._client;
    const self = this;
    debug('createTable', className, schema);
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
    debug(qs, values);
    return conn.task('create-table', async t => {
      try {
        await self._ensureSchemaCollectionExists(t);
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
    debug('schemaUpgrade', {
      className,
      schema
    });
    conn = conn || this._client;
    const self = this;
    await conn.tx('schema-upgrade', async t => {
      const columns = await t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName], t));
      await t.batch(newColumns);
    });
  }

  async addFieldIfNotExists(className, fieldName, type, conn) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists', {
      className,
      fieldName,
      type
    });
    conn = conn || this._client;
    const self = this;
    await conn.tx('add-field-if-not-exists', async t => {
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
    return this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table
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
    debug('deleteFields', className, fieldNames);
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
  } // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.


  async getAllClasses() {
    const self = this;
    return this._client.task('get-all-classes', async t => {
      await self._ensureSchemaCollectionExists(t);
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  } // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.


  async getClass(className) {
    debug('getClass', className);
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
    debug('createObject', className, object);
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
    debug(qs, values);
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
    debug('deleteObjectsByQuery', className, query);
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
    debug(qs, values);
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
    debug('findOneAndUpdate', className, query, update);
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  } // Apply the update to all objects that match the given Parse Query.


  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery', className, query, update);
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
        debug('Not supported update', fieldName, fieldValue);
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
    debug('update: ', qs, values);
    const promise = (transactionalSession ? transactionalSession.t : this._client).any(qs, values);

    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }

    return promise;
  } // Hopefully, we can get rid of this. It's only used for config and hooks.


  upsertOneObject(className, schema, query, update, transactionalSession) {
    debug('upsertOneObject', {
      className,
      query,
      update
    });
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
    debug('find', className, query, {
      skip,
      limit,
      sort,
      keys,
      caseInsensitive,
      explain
    });
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
        } else if (key.length > 0) {
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
    debug(qs, values);
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
    debug('count', className, query, readPreference, estimate);
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
      if (a.approximate_row_count != null) {
        return +a.approximate_row_count;
      } else {
        return +a.count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }

      return 0;
    });
  }

  async distinct(className, schema, query, fieldName) {
    debug('distinct', className, query);
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

    debug(qs, values);
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
    debug('aggregate', className, pipeline, readPreference, hint, explain);
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

                  columns.push(`EXTRACT(${mongoAggregateToPostgres[operation]} FROM $${index}:name AT TIME ZONE 'UTC') AS $${index + 1}:name`);
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
    debug(qs, values);
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
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema).catch(err => {
        if (err.code === PostgresDuplicateRelationError || err.code === _node.default.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }

        throw err;
      }).then(() => this.schemaUpgrade(schema.className, schema));
    });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsImxvZ2dlciIsInJlcXVpcmUiLCJkZWJ1ZyIsImFyZ3MiLCJhcmd1bWVudHMiLCJjb25jYXQiLCJzbGljZSIsImxlbmd0aCIsImxvZyIsImdldExvZ2dlciIsImFwcGx5IiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwidmFsdWUiLCJfX3R5cGUiLCJpc28iLCJuYW1lIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsIk9iamVjdCIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaGFuZGxlRG90RmllbGRzIiwib2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJmaWVsZE5hbWUiLCJpbmRleE9mIiwiY29tcG9uZW50cyIsInNwbGl0IiwiZmlyc3QiLCJzaGlmdCIsImN1cnJlbnRPYmoiLCJuZXh0IiwiX19vcCIsInVuZGVmaW5lZCIsInRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzIiwibWFwIiwiY21wdCIsImluZGV4IiwidHJhbnNmb3JtRG90RmllbGQiLCJqb2luIiwidHJhbnNmb3JtQWdncmVnYXRlRmllbGQiLCJzdWJzdHIiLCJ2YWxpZGF0ZUtleXMiLCJrZXkiLCJpbmNsdWRlcyIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJqb2luVGFibGVzRm9yU2NoZW1hIiwibGlzdCIsImZpZWxkIiwicHVzaCIsImJ1aWxkV2hlcmVDbGF1c2UiLCJxdWVyeSIsImNhc2VJbnNlbnNpdGl2ZSIsInBhdHRlcm5zIiwidmFsdWVzIiwic29ydHMiLCJpc0FycmF5RmllbGQiLCJpbml0aWFsUGF0dGVybnNMZW5ndGgiLCJmaWVsZFZhbHVlIiwiJGV4aXN0cyIsImF1dGhEYXRhTWF0Y2giLCJtYXRjaCIsIiRpbiIsIiRyZWdleCIsIk1BWF9JTlRfUExVU19PTkUiLCJjbGF1c2VzIiwiY2xhdXNlVmFsdWVzIiwic3ViUXVlcnkiLCJjbGF1c2UiLCJwYXR0ZXJuIiwib3JPckFuZCIsIm5vdCIsIiRuZSIsImNvbnN0cmFpbnRGaWVsZE5hbWUiLCJwb2ludCIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJGVxIiwiaXNJbk9yTmluIiwiQXJyYXkiLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiSU5WQUxJRF9KU09OIiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwiaSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCJzdWJzdHJpbmciLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBvc3RncmVzVmFsdWUiLCJjYXN0VHlwZSIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJ1cmkiLCJjb2xsZWN0aW9uUHJlZml4IiwiZGF0YWJhc2VPcHRpb25zIiwiX2NvbGxlY3Rpb25QcmVmaXgiLCJjbGllbnQiLCJwZ3AiLCJfY2xpZW50IiwiX3BncCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5IiwiYW5hbHl6ZSIsImhhbmRsZVNodXRkb3duIiwiJHBvb2wiLCJlbmQiLCJfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyIsImNvbm4iLCJub25lIiwiY2F0Y2giLCJlcnJvciIsImNvZGUiLCJjbGFzc0V4aXN0cyIsIm9uZSIsImEiLCJleGlzdHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwic2VsZiIsInRhc2siLCJ0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfaWRfIiwiX2lkIiwiZGVsZXRlZEluZGV4ZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJJTlZBTElEX1FVRVJZIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidHgiLCJjcmVhdGVJbmRleGVzIiwiZHJvcEluZGV4ZXMiLCJjcmVhdGVDbGFzcyIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiYmF0Y2giLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsImZpbHRlciIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwicmVzdWx0IiwiYW55IiwicGF0aCIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsImhlbHBlcnMiLCJ0aGVuIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJtYXRjaGVzIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsInBhcnNlRmxvYXQiLCJjcmVhdGVkQXQiLCJ0b0lTT1N0cmluZyIsInVwZGF0ZWRBdCIsImV4cGlyZXNBdCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRQYXR0ZXJucyIsIm1lc3NhZ2UiLCJyZWFkUHJlZmVyZW5jZSIsImVzdGltYXRlIiwiYXBwcm94aW1hdGVfcm93X2NvdW50IiwiZGlzdGluY3QiLCJjb2x1bW4iLCJpc05lc3RlZCIsImlzUG9pbnRlckZpZWxkIiwidHJhbnNmb3JtZXIiLCJjaGlsZCIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwiaGludCIsImNvdW50RmllbGQiLCJncm91cFZhbHVlcyIsImdyb3VwUGF0dGVybiIsInN0YWdlIiwiJGdyb3VwIiwiZ3JvdXBCeUZpZWxkcyIsImFsaWFzIiwic291cmNlIiwib3BlcmF0aW9uIiwiJHN1bSIsIiRtYXgiLCIkbWluIiwiJGF2ZyIsIiRwcm9qZWN0IiwiJG1hdGNoIiwiJG9yIiwiY29sbGFwc2UiLCJlbGVtZW50IiwibWF0Y2hQYXR0ZXJucyIsIiRsaW1pdCIsIiRza2lwIiwiJHNvcnQiLCJvcmRlciIsImUiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY29uc29sZSIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImdldEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsInVwZGF0ZUVzdGltYXRlZENvdW50IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJlbnN1cmVJbmRleCIsImluZGV4TmFtZSIsIm9wdGlvbnMiLCJkZWZhdWx0SW5kZXhOYW1lIiwiaW5kZXhOYW1lT3B0aW9ucyIsInVuaXF1ZSIsImFyIiwiZm91bmRJbmRleCIsInB0IiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZW5kc1dpdGgiLCJyZXBsYWNlIiwicyIsInN0YXJ0c1dpdGgiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJzb21lIiwiY3JlYXRlTGl0ZXJhbFJlZ2V4IiwicmVtYWluaW5nIiwiUmVnRXhwIiwibWF0Y2hlcjEiLCJyZXN1bHQxIiwicHJlZml4IiwibWF0Y2hlcjIiLCJyZXN1bHQyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7O0FBRUE7O0FBRUE7O0FBQ0E7O0FBZ0JBOzs7Ozs7Ozs7O0FBZEEsTUFBTUEsaUNBQWlDLEdBQUcsT0FBMUM7QUFDQSxNQUFNQyw4QkFBOEIsR0FBRyxPQUF2QztBQUNBLE1BQU1DLDRCQUE0QixHQUFHLE9BQXJDO0FBQ0EsTUFBTUMsMEJBQTBCLEdBQUcsT0FBbkM7QUFDQSxNQUFNQyw0QkFBNEIsR0FBRyxPQUFyQztBQUNBLE1BQU1DLGlDQUFpQyxHQUFHLE9BQTFDOztBQUNBLE1BQU1DLE1BQU0sR0FBR0MsT0FBTyxDQUFDLGlCQUFELENBQXRCOztBQUVBLE1BQU1DLEtBQUssR0FBRyxVQUFVLEdBQUdDLElBQWIsRUFBd0I7QUFDcENBLEVBQUFBLElBQUksR0FBRyxD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Q0FNSSxVQU5KLEVBTWlCLE1BTmpCLENBQVA7QUFPRDs7QUFFRCxJQUFJL1EsYUFBYSxHQUFHO0FBQ2xCQyxFQUFBQSxXQUFXLENBQUN6SSxLQUFELEVBQVE7QUFDakIsV0FDRSxPQUFPQSxLQUFQLEtBQWlCLFFBQWpCLElBQTZCQSxLQUFLLEtBQUssSUFBdkMsSUFBK0NBLEtBQUssQ0FBQ0MsTUFBTixLQUFpQixVQURsRTtBQUdEOztBQUxpQixDQUFwQjtlQVFlNEosc0IiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAnLi9Qb3N0Z3Jlc0NsaWVudCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvciA9ICc0MjcxMCc7XG5jb25zdCBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgPSAnMjM1MDUnO1xuY29uc3QgbG9nZ2VyID0gcmVxdWlyZSgnLi4vLi4vLi4vbG9nZ2VyJyk7XG5cbmNvbnN0IGRlYnVnID0gZnVuY3Rpb24gKC4uLmFyZ3M6IGFueSkge1xuICBhcmdzID0gWydQRzogJyArIGFyZ3VtZW50c1swXV0uY29uY2F0KGFyZ3Muc2xpY2UoMSwgYXJncy5sZW5ndGgpKTtcbiAgY29uc3QgbG9nID0gbG9nZ2VyLmdldExvZ2dlcigpO1xuICBsb2cuZGVidWcuYXBwbHkobG9nLCBhcmdzKTtcbn07XG5cbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFUeXBlLCBRdWVyeVR5cGUsIFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcblxuY29uc3QgcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUgPSB0eXBlID0+IHtcbiAgc3dpdGNoICh0eXBlLnR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuICdwb2ludCc7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gJ3BvbHlnb24nO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIGlmICh0eXBlLmNvbnRlbnRzICYmIHR5cGUuY29udGVudHMudHlwZSA9PT0gJ1N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuICd0ZXh0W10nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICdqc29uYic7XG4gICAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IGBubyB0eXBlIGZvciAke0pTT04uc3RyaW5naWZ5KHR5cGUpfSB5ZXRgO1xuICB9XG59O1xuXG5jb25zdCBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IgPSB7XG4gICRndDogJz4nLFxuICAkbHQ6ICc8JyxcbiAgJGd0ZTogJz49JyxcbiAgJGx0ZTogJzw9Jyxcbn07XG5cbmNvbnN0IG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3JlcyA9IHtcbiAgJGRheU9mTW9udGg6ICdEQVknLFxuICAkZGF5T2ZXZWVrOiAnRE9XJyxcbiAgJGRheU9mWWVhcjogJ0RPWScsXG4gICRpc29EYXlPZldlZWs6ICdJU09ET1cnLFxuICAkaXNvV2Vla1llYXI6ICdJU09ZRUFSJyxcbiAgJGhvdXI6ICdIT1VSJyxcbiAgJG1pbnV0ZTogJ01JTlVURScsXG4gICRzZWNvbmQ6ICdTRUNPTkQnLFxuICAkbWlsbGlzZWNvbmQ6ICdNSUxMSVNFQ09ORFMnLFxuICAkbW9udGg6ICdNT05USCcsXG4gICR3ZWVrOiAnV0VFSycsXG4gICR5ZWFyOiAnWUVBUicsXG59O1xuXG5jb25zdCB0b1Bvc3RncmVzVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUuaXNvO1xuICAgIH1cbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHIoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHtcbiAgc2NoZW1hLFxuICBxdWVyeSxcbiAgaW5kZXgsXG4gIGNhc2VJbnNlbnNpdGl2ZSxcbn0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSc7XG4gICAgY29uc3QgaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID0gcGF0dGVybnMubGVuZ3RoO1xuICAgIGNvbnN0IGZpZWxkVmFsdWUgPSBxdWVyeVtmaWVsZE5hbWVdO1xuXG4gICAgLy8gbm90aGluZyBpbiB0aGUgc2NoZW1hLCBpdCdzIGdvbm5hIGJsb3cgdXBcbiAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgLy8gYXMgaXQgd29uJ3QgZXhpc3RcbiAgICAgIGlmIChmaWVsZFZhbHVlICYmIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gZmFsc2UpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgY2FzZUluc2Vuc2l0aXZlICYmXG4gICAgICAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJylcbiAgICApIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ051bWJlcidcbiAgICAgICkge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgICAgICAgIH0pIE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXh9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFRPRE86IHN1cHBvcnQgYXJyYXlzXG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZXEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGVxID09PSBudWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPVxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgfHwgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRuaW4pO1xuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pICYmXG4gICAgICBpc0FycmF5RmllbGQgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cyAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnXG4gICAgKSB7XG4gICAgICBjb25zdCBpblBhdHRlcm5zID0gW107XG4gICAgICBsZXQgYWxsb3dOdWxsID0gZmFsc2U7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgZmllbGRWYWx1ZS4kaW4uZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICBpZiAobGlzdEVsZW0gPT09IG51bGwpIHtcbiAgICAgICAgICBhbGxvd051bGwgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleCAtIChhbGxvd051bGwgPyAxIDogMCl9YCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKGFsbG93TnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgSVMgTlVMTCBPUiAkJHtpbmRleH06bmFtZSAmJiBBUlJBWVske2luUGF0dGVybnMuam9pbigpfV0pYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICBgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICBgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGFsbCkpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGFsbC5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS4kYWxsWzBdLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmXG4gICAgICAgIHR5cGVvZiBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9LCAkJHtpbmRleCArIDN9KWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChsYW5ndWFnZSwgZmllbGROYW1lLCBsYW5ndWFnZSwgc2VhcmNoLiR0ZXJtKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lYXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmVhclNwaGVyZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gZmllbGRWYWx1ZS4kbWF4RGlzdGFuY2U7XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICBzb3J0cy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSBBU0NgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kd2l0aGluICYmIGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94KSB7XG4gICAgICBjb25zdCBib3ggPSBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveDtcbiAgICAgIGNvbnN0IGxlZnQgPSBib3hbMF0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgYm90dG9tID0gYm94WzBdLmxhdGl0dWRlO1xuICAgICAgY29uc3QgcmlnaHQgPSBib3hbMV0ubG9uZ2l0dWRlO1xuICAgICAgY29uc3QgdG9wID0gYm94WzFdLmxhdGl0dWRlO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6Ym94YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoKCR7bGVmdH0sICR7Ym90dG9tfSksICgke3JpZ2h0fSwgJHt0b3B9KSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZSkge1xuICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmU7XG4gICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgbGV0IHBvaW50ID0gY2VudGVyU3BoZXJlWzBdO1xuICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICB9IGVsc2UgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBnZW8gcG9pbnQgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIC8vIEdldCBkaXN0YW5jZSBhbmQgdmFsaWRhdGVcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgaWYgKGlzTmFOKGRpc3RhbmNlKSB8fCBkaXN0YW5jZSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZGlzdGFuY2UgaW52YWxpZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb1dpdGhpbiAmJiBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb24pIHtcbiAgICAgIGNvbnN0IHBvbHlnb24gPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJHBvbHlnb247XG4gICAgICBsZXQgcG9pbnRzO1xuICAgICAgaWYgKHR5cGVvZiBwb2x5Z29uID09PSAnb2JqZWN0JyAmJiBwb2x5Z29uLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGlmICghcG9seWdvbi5jb29yZGluYXRlcyB8fCBwb2x5Z29uLmNvb3JkaW5hdGVzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7IFBvbHlnb24uY29vcmRpbmF0ZXMgc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBsb24vbGF0IHBhaXJzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbi5jb29yZGluYXRlcztcbiAgICAgIH0gZWxzZSBpZiAocG9seWdvbiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgR2VvUG9pbnRzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnRzID0gcG9seWdvbjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgXCJiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGJlIFBvbHlnb24gb2JqZWN0IG9yIEFycmF5IG9mIFBhcnNlLkdlb1BvaW50J3NcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcG9pbnRzID0gcG9pbnRzXG4gICAgICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgICByZXR1cm4gYCgke3BvaW50WzBdfSwgJHtwb2ludFsxXX0pYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcsICcpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9pbnQgPEAgJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnRzfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzICYmIGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50KSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMuJHBvaW50O1xuICAgICAgaWYgKHR5cGVvZiBwb2ludCAhPT0gJ29iamVjdCcgfHwgcG9pbnQuX190eXBlICE9PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvSW50ZXJzZWN0IHZhbHVlOyAkcG9pbnQgc2hvdWxkIGJlIEdlb1BvaW50J1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvbHlnb24gQD4gJCR7aW5kZXggKyAxfTo6cG9pbnRgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50LmxvbmdpdHVkZX0sICR7cG9pbnQubGF0aXR1ZGV9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgIGxldCByZWdleCA9IGZpZWxkVmFsdWUuJHJlZ2V4O1xuICAgICAgbGV0IG9wZXJhdG9yID0gJ34nO1xuICAgICAgY29uc3Qgb3B0cyA9IGZpZWxkVmFsdWUuJG9wdGlvbnM7XG4gICAgICBpZiAob3B0cykge1xuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCdpJykgPj0gMCkge1xuICAgICAgICAgIG9wZXJhdG9yID0gJ34qJztcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5pbmRleE9mKCd4JykgPj0gMCkge1xuICAgICAgICAgIHJlZ2V4ID0gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICByZWdleCA9IHByb2Nlc3NSZWdleFBhdHRlcm4ocmVnZXgpO1xuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3ICR7b3BlcmF0b3J9ICckJHtpbmRleCArIDF9OnJhdydgKTtcbiAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIHJlZ2V4KTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWVdKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuaXNvKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICBpbmRleCArPSAzO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSB+PSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICBpZiAoZmllbGRWYWx1ZVtjbXBdIHx8IGZpZWxkVmFsdWVbY21wXSA9PT0gMCkge1xuICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgY29uc3QgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGxldCBjYXN0VHlwZTtcbiAgICAgICAgICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgICAgICAgICBjYXNlICdudW1iZXInOlxuICAgICAgICAgICAgICBjYXN0VHlwZSA9ICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgICAgICAgY2FzdFR5cGUgPSAnYm9vbGVhbic7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgY2FzdFR5cGUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgZmllbGRWYWx1ZVxuICAgICAgICApfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG4gIHZhbHVlcyA9IHZhbHVlcy5tYXAodHJhbnNmb3JtVmFsdWUpO1xuICByZXR1cm4geyBwYXR0ZXJuOiBwYXR0ZXJucy5qb2luKCcgQU5EICcpLCB2YWx1ZXMsIHNvcnRzIH07XG59O1xuXG5leHBvcnQgY2xhc3MgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBpbXBsZW1lbnRzIFN0b3JhZ2VBZGFwdGVyIHtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX3BncDogYW55O1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIGRhdGFiYXNlT3B0aW9ucyB9OiBhbnkpIHtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICBjb25zdCB7IGNsaWVudCwgcGdwIH0gPSBjcmVhdGVDbGllbnQodXJpLCBkYXRhYmFzZU9wdGlvbnMpO1xuICAgIHRoaXMuX2NsaWVudCA9IGNsaWVudDtcbiAgICB0aGlzLl9wZ3AgPSBwZ3A7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gZmFsc2U7XG4gIH1cblxuICAvL05vdGUgdGhhdCBhbmFseXplPXRydWUgd2lsbCBydW4gdGhlIHF1ZXJ5LCBleGVjdXRpbmcgSU5TRVJUUywgREVMRVRFUywgZXRjLlxuICBjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcsIGFuYWx5emU6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGlmIChhbmFseXplKSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEFOQUxZWkUsIEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAoIXRoaXMuX2NsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLl9jbGllbnQuJHBvb2wuZW5kKCk7XG4gIH1cblxuICBhc3luYyBfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyhjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgYXdhaXQgY29ublxuICAgICAgLm5vbmUoXG4gICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBcIl9TQ0hFTUFcIiAoIFwiY2xhc3NOYW1lXCIgdmFyQ2hhcigxMjApLCBcInNjaGVtYVwiIGpzb25iLCBcImlzUGFyc2VDbGFzc1wiIGJvb2wsIFBSSU1BUlkgS0VZIChcImNsYXNzTmFtZVwiKSApJ1xuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciB8fFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciB8fFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlT2JqZWN0RXJyb3JcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gVGFibGUgYWxyZWFkeSBleGlzdHMsIG11c3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBkaWZmZXJlbnQgcmVxdWVzdC4gSWdub3JlIGVycm9yLlxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQub25lKFxuICAgICAgJ1NFTEVDVCBFWElTVFMgKFNFTEVDVCAxIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlcyBXSEVSRSB0YWJsZV9uYW1lID0gJDEpJyxcbiAgICAgIFtuYW1lXSxcbiAgICAgIGEgPT4gYS5leGlzdHNcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudGFzaygnc2V0LWNsYXNzLWxldmVsLXBlcm1pc3Npb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgY29uc3QgdmFsdWVzID0gW1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICdzY2hlbWEnLFxuICAgICAgICAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJyxcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoQ0xQcyksXG4gICAgICBdO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGtleSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBjb25uLnR4KCdzZXQtaW5kZXhlcy13aXRoLXNjaGVtYS1mb3JtYXQnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgaWYgKGRlbGV0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgc2VsZi5kcm9wSW5kZXhlcyhjbGFzc05hbWUsIGRlbGV0ZWRJbmRleGVzLCB0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMScsXG4gICAgICAgIFtjbGFzc05hbWUsICdzY2hlbWEnLCAnaW5kZXhlcycsIEpTT04uc3RyaW5naWZ5KGV4aXN0aW5nSW5kZXhlcyldXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogP2FueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICByZXR1cm4gY29ublxuICAgICAgLnR4KCdjcmVhdGUtY2xhc3MnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5jcmVhdGVUYWJsZShjbGFzc05hbWUsIHNjaGVtYSwgdCk7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnSU5TRVJUIElOVE8gXCJfU0NIRU1BXCIgKFwiY2xhc3NOYW1lXCIsIFwic2NoZW1hXCIsIFwiaXNQYXJzZUNsYXNzXCIpIFZBTFVFUyAoJDxjbGFzc05hbWU+LCAkPHNjaGVtYT4sIHRydWUpJyxcbiAgICAgICAgICB7IGNsYXNzTmFtZSwgc2NoZW1hIH1cbiAgICAgICAgKTtcbiAgICAgICAgYXdhaXQgdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAge30sXG4gICAgICAgICAgc2NoZW1hLmZpZWxkcyxcbiAgICAgICAgICB0XG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB0b1BhcnNlU2NoZW1hKHNjaGVtYSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmXG4gICAgICAgICAgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJywgY2xhc3NOYW1lLCBzY2hlbWEpO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgY29uc3QgcGF0dGVybnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5hc3NpZ24oe30sIHNjaGVtYS5maWVsZHMpO1xuICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZmFpbGVkX2xvZ2luX2NvdW50ID0geyB0eXBlOiAnTnVtYmVyJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIGNvbnN0IHJlbGF0aW9ucyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKGZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgY29uc3QgcGFyc2VUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAvLyBTa2lwIHdoZW4gaXQncyBhIHJlbGF0aW9uXG4gICAgICAvLyBXZSdsbCBjcmVhdGUgdGhlIHRhYmxlcyBsYXRlclxuICAgICAgaWYgKHBhcnNlVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJlbGF0aW9ucy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICBwYXJzZVR5cGUuY29udGVudHMgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICB9XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHBhcnNlVHlwZSkpO1xuICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGAkJHtpbmRleH06bmFtZSAkJHtpbmRleCArIDF9OnJhd2ApO1xuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYFBSSU1BUlkgS0VZICgkJHtpbmRleH06bmFtZSlgKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gaW5kZXggKyAyO1xuICAgIH0pO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQxOm5hbWUgKCR7cGF0dGVybnNBcnJheS5qb2luKCl9KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4udmFsdWVzQXJyYXldO1xuXG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIGNvbm4udGFzaygnY3JlYXRlLXRhYmxlJywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgICBhd2FpdCB0Lm5vbmUocXMsIHZhbHVlcyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogVGFibGUgYWxyZWFkeSBleGlzdHMsIG11c3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBkaWZmZXJlbnQgcmVxdWVzdC4gSWdub3JlIHRoZSBlcnJvci5cbiAgICAgIH1cbiAgICAgIGF3YWl0IHQudHgoJ2NyZWF0ZS10YWJsZS10eCcsIHR4ID0+IHtcbiAgICAgICAgcmV0dXJuIHR4LmJhdGNoKFxuICAgICAgICAgIHJlbGF0aW9ucy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHJldHVybiB0eC5ub25lKFxuICAgICAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2NoZW1hVXBncmFkZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBkZWJ1Zygnc2NoZW1hVXBncmFkZScsIHsgY2xhc3NOYW1lLCBzY2hlbWEgfSk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgYXdhaXQgY29ubi50eCgnc2NoZW1hLXVwZ3JhZGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSBhd2FpdCB0Lm1hcChcbiAgICAgICAgJ1NFTEVDVCBjb2x1bW5fbmFtZSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIFdIRVJFIHRhYmxlX25hbWUgPSAkPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IGNsYXNzTmFtZSB9LFxuICAgICAgICBhID0+IGEuY29sdW1uX25hbWVcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXdDb2x1bW5zID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGNvbHVtbnMuaW5kZXhPZihpdGVtKSA9PT0gLTEpXG4gICAgICAgIC5tYXAoZmllbGROYW1lID0+XG4gICAgICAgICAgc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLFxuICAgICAgICAgICAgdFxuICAgICAgICAgIClcbiAgICAgICAgKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGFkZEZpZWxkSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46IGFueVxuICApIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycsIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUgfSk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IGNvbm4udHgoJ2FkZC1maWVsZC1pZi1ub3QtZXhpc3RzJywgYXN5bmMgdCA9PiB7XG4gICAgICBpZiAodHlwZS50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICAgJ0FMVEVSIFRBQkxFICQ8Y2xhc3NOYW1lOm5hbWU+IEFERCBDT0xVTU4gSUYgTk9UIEVYSVNUUyAkPGZpZWxkTmFtZTpuYW1lPiAkPHBvc3RncmVzVHlwZTpyYXc+JyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICAgIHBvc3RncmVzVHlwZTogcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUodHlwZSksXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5jcmVhdGVDbGFzcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGZpZWxkczogeyBbZmllbGROYW1lXTogdHlwZSB9IH0sXG4gICAgICAgICAgICAgIHRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ29sdW1uIGFscmVhZHkgZXhpc3RzLCBjcmVhdGVkIGJ5IG90aGVyIHJlcXVlc3QuIENhcnJ5IG9uIHRvIHNlZSBpZiBpdCdzIHRoZSByaWdodCB0eXBlLlxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdC5hbnkoXG4gICAgICAgICdTRUxFQ1QgXCJzY2hlbWFcIiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4gYW5kIChcInNjaGVtYVwiOjpqc29uLT5cXCdmaWVsZHNcXCctPiQ8ZmllbGROYW1lPikgaXMgbm90IG51bGwnLFxuICAgICAgICB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH1cbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXN1bHRbMF0pIHtcbiAgICAgICAgdGhyb3cgJ0F0dGVtcHRlZCB0byBhZGQgYSBmaWVsZCB0aGF0IGFscmVhZHkgZXhpc3RzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KG9wZXJhdGlvbnMpKSlcbiAgICAgIC50aGVuKCgpID0+IGNsYXNzTmFtZS5pbmRleE9mKCdfSm9pbjonKSAhPSAwKTsgLy8gcmVzb2x2ZXMgd2l0aCBmYWxzZSB3aGVuIF9Kb2luIHRhYmxlXG4gIH1cblxuICAvLyBEZWxldGUgYWxsIGRhdGEga25vd24gdG8gdGhpcyBhZGFwdGVyLiBVc2VkIGZvciB0ZXN0aW5nLlxuICBhc3luYyBkZWxldGVBbGxDbGFzc2VzKCkge1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGhlbHBlcnMgPSB0aGlzLl9wZ3AuaGVscGVycztcbiAgICBkZWJ1ZygnZGVsZXRlQWxsQ2xhc3NlcycpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudGFzaygnZGVsZXRlLWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHQuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJyk7XG4gICAgICAgICAgY29uc3Qgam9pbnMgPSByZXN1bHRzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBsaXN0LmNvbmNhdChqb2luVGFibGVzRm9yU2NoZW1hKHNjaGVtYS5zY2hlbWEpKTtcbiAgICAgICAgICB9LCBbXSk7XG4gICAgICAgICAgY29uc3QgY2xhc3NlcyA9IFtcbiAgICAgICAgICAgICdfU0NIRU1BJyxcbiAgICAgICAgICAgICdfUHVzaFN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlNjaGVkdWxlJyxcbiAgICAgICAgICAgICdfSG9va3MnLFxuICAgICAgICAgICAgJ19HbG9iYWxDb25maWcnLFxuICAgICAgICAgICAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgICAgICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICAgICAgJ19JZGVtcG90ZW5jeScsXG4gICAgICAgICAgICAuLi5yZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmNsYXNzTmFtZSksXG4gICAgICAgICAgICAuLi5qb2lucyxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0IHF1ZXJpZXMgPSBjbGFzc2VzLm1hcChjbGFzc05hbWUgPT4gKHtcbiAgICAgICAgICAgIHF1ZXJ5OiAnRFJPUCBUQUJMRSBJRiBFWElTVFMgJDxjbGFzc05hbWU6bmFtZT4nLFxuICAgICAgICAgICAgdmFsdWVzOiB7IGNsYXNzTmFtZSB9LFxuICAgICAgICAgIH0pKTtcbiAgICAgICAgICBhd2FpdCB0LnR4KHR4ID0+IHR4Lm5vbmUoaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gTm8gX1NDSEVNQSBjb2xsZWN0aW9uLiBEb24ndCBkZWxldGUgYW55dGhpbmcuXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGRlYnVnKGBkZWxldGVBbGxDbGFzc2VzIGRvbmUgaW4gJHtuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIG5vd31gKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgYXN5bmMgZGVsZXRlRmllbGRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJywgY2xhc3NOYW1lLCBmaWVsZE5hbWVzKTtcbiAgICBmaWVsZE5hbWVzID0gZmllbGROYW1lcy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIGZpZWxkTmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIGlmIChmaWVsZC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChmaWVsZE5hbWUpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBsaXN0O1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBmaWVsZE5hbWVzXG4gICAgICAubWFwKChuYW1lLCBpZHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAkJHtpZHggKyAyfTpuYW1lYDtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCBEUk9QIENPTFVNTicpO1xuXG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCdkZWxldGUtZmllbGRzJywgYXN5bmMgdCA9PiB7XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCIgPSAkPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgc2NoZW1hLCBjbGFzc05hbWUgfVxuICAgICAgKTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uc31gLFxuICAgICAgICAgIHZhbHVlc1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICByZXR1cm4gYXdhaXQgdC5tYXAoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInLCBudWxsLCByb3cgPT5cbiAgICAgICAgdG9QYXJzZVNjaGVtYSh7IGNsYXNzTmFtZTogcm93LmNsYXNzTmFtZSwgLi4ucm93LnNjaGVtYSB9KVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGFzeW5jIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2dldENsYXNzJywgY2xhc3NOYW1lKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnLCBjbGFzc05hbWUsIG9iamVjdCk7XG4gICAgbGV0IGNvbHVtbnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGdlb1BvaW50cyA9IHt9O1xuXG4gICAgb2JqZWN0ID0gaGFuZGxlRG90RmllbGRzKG9iamVjdCk7XG5cbiAgICB2YWxpZGF0ZUtleXMob2JqZWN0KTtcblxuICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ10gPSBvYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBmaWVsZE5hbWUgPSAnYXV0aERhdGEnO1xuICAgICAgfVxuXG4gICAgICBjb2x1bW5zQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19mYWlsZWRfbG9naW5fY291bnQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2hpc3RvcnknXG4gICAgICAgICkge1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcpIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5vYmplY3RJZCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KG9iamVjdFtmaWVsZE5hbWVdKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdPYmplY3QnOlxuICAgICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm5hbWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2x5Z29uJzoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChvYmplY3RbZmllbGROYW1lXS5jb29yZGluYXRlcyk7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICAgIC8vIHBvcCB0aGUgcG9pbnQgYW5kIHByb2Nlc3MgbGF0ZXJcbiAgICAgICAgICBnZW9Qb2ludHNbZmllbGROYW1lXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICAgIGNvbHVtbnNBcnJheS5wb3AoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBgVHlwZSAke3NjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlfSBub3Qgc3VwcG9ydGVkIHlldGA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb2x1bW5zQXJyYXkgPSBjb2x1bW5zQXJyYXkuY29uY2F0KE9iamVjdC5rZXlzKGdlb1BvaW50cykpO1xuICAgIGNvbnN0IGluaXRpYWxWYWx1ZXMgPSB2YWx1ZXNBcnJheS5tYXAoKHZhbCwgaW5kZXgpID0+IHtcbiAgICAgIGxldCB0ZXJtaW5hdGlvbiA9ICcnO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gY29sdW1uc0FycmF5W2luZGV4XTtcbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6OnRleHRbXSc7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSdcbiAgICAgICkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6Ompzb25iJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7aW5kZXggKyAyICsgY29sdW1uc0FycmF5Lmxlbmd0aH0ke3Rlcm1pbmF0aW9ufWA7XG4gICAgfSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzSW5qZWN0cyA9IE9iamVjdC5rZXlzKGdlb1BvaW50cykubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdlb1BvaW50c1trZXldO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZS5sb25naXR1ZGUsIHZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGNvbnN0IGwgPSB2YWx1ZXNBcnJheS5sZW5ndGggKyBjb2x1bW5zQXJyYXkubGVuZ3RoO1xuICAgICAgcmV0dXJuIGBQT0lOVCgkJHtsfSwgJCR7bCArIDF9KWA7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2x1bW5zUGF0dGVybiA9IGNvbHVtbnNBcnJheVxuICAgICAgLm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApXG4gICAgICAuam9pbigpO1xuICAgIGNvbnN0IHZhbHVlc1BhdHRlcm4gPSBpbml0aWFsVmFsdWVzLmNvbmNhdChnZW9Qb2ludHNJbmplY3RzKS5qb2luKCk7XG5cbiAgICBjb25zdCBxcyA9IGBJTlNFUlQgSU5UTyAkMTpuYW1lICgke2NvbHVtbnNQYXR0ZXJufSkgVkFMVUVTICgke3ZhbHVlc1BhdHRlcm59KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uY29sdW1uc0FycmF5LCAuLi52YWx1ZXNBcnJheV07XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50XG4gICAgICA6IHRoaXMuX2NsaWVudFxuICAgIClcbiAgICAgIC5ub25lKHFzLCB2YWx1ZXMpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFtvYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvcikge1xuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5jb25zdHJhaW50KSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IuY29uc3RyYWludC5tYXRjaCgvdW5pcXVlXyhbYS16QS1aXSspLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBlcnJvciA9IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGFzeW5jIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdkZWxldGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnkpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IGluZGV4ID0gMjtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBpZiAoT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgd2hlcmUucGF0dGVybiA9ICdUUlVFJztcbiAgICB9XG4gICAgY29uc3QgcXMgPSBgV0lUSCBkZWxldGVkIEFTIChERUxFVEUgRlJPTSAkMTpuYW1lIFdIRVJFICR7d2hlcmUucGF0dGVybn0gUkVUVVJOSU5HICopIFNFTEVDVCBjb3VudCgqKSBGUk9NIGRlbGV0ZWRgO1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udFxuICAgICAgOiB0aGlzLl9jbGllbnRcbiAgICApXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIHVwZGF0ZSxcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgKS50aGVuKHZhbCA9PiB2YWxbMF0pO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaXJzdF0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB1cGRhdGUgPSBoYW5kbGVEb3RGaWVsZHModXBkYXRlKTtcbiAgICAvLyBSZXNvbHZlIGF1dGhEYXRhIGZpcnN0LFxuICAgIC8vIFNvIHdlIGRvbid0IGVuZCB1cCB3aXRoIG11bHRpcGxlIGtleSB1cGRhdGVzXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXSA9IHVwZGF0ZVsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgZmllbGRWYWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgLy8gRHJvcCBhbnkgdW5kZWZpbmVkIHZhbHVlcy5cbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT0gJ2F1dGhEYXRhJykge1xuICAgICAgICAvLyBUaGlzIHJlY3Vyc2l2ZWx5IHNldHMgdGhlIGpzb25fb2JqZWN0XG4gICAgICAgIC8vIE9ubHkgMSBsZXZlbCBkZWVwXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlID0gKGpzb25iOiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBqc29uX29iamVjdF9zZXRfa2V5KENPQUxFU0NFKCR7anNvbmJ9LCAne30nOjpqc29uYiksICR7a2V5fSwgJHt2YWx1ZX0pOjpqc29uYmA7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGxhc3RLZXkgPSBgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICBjb25zdCBmaWVsZE5hbWVJbmRleCA9IGluZGV4O1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5yZWR1Y2UoXG4gICAgICAgICAgKGxhc3RLZXk6IHN0cmluZywga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHN0ciA9IGdlbmVyYXRlKFxuICAgICAgICAgICAgICBsYXN0S2V5LFxuICAgICAgICAgICAgICBgJCR7aW5kZXh9Ojp0ZXh0YCxcbiAgICAgICAgICAgICAgYCQke2luZGV4ICsgMX06Ompzb25iYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBsYXN0S2V5XG4gICAgICAgICk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2ZpZWxkTmFtZUluZGV4fTpuYW1lID0gJHt1cGRhdGV9YCk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgMCkgKyAkJHtpbmRleCArIDF9YFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuYW1vdW50KTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZChDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBudWxsKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnUmVtb3ZlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X3JlbW92ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkVW5pcXVlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZF91bmlxdWUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgLy9UT0RPOiBzdG9wIHNwZWNpYWwgY2FzaW5nIHRoaXMuIEl0IHNob3VsZCBjaGVjayBmb3IgX190eXBlID09PSAnRGF0ZScgYW5kIHVzZSAuaXNvXG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICkge1xuICAgICAgICAvLyBHYXRoZXIga2V5cyB0byBpbmNyZW1lbnRcbiAgICAgICAgY29uc3Qga2V5c1RvSW5jcmVtZW50ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgT2JqZWN0LmtleXMgaXMgaXRlcmF0aW5nIG92ZXIgdGhlICoqb3JpZ2luYWwqKiB1cGRhdGUgb2JqZWN0XG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBzb21lIG9mIHRoZSBrZXlzIG9mIHRoZSBvcmlnaW5hbCB1cGRhdGUgY291bGQgYmUgbnVsbCBvciB1bmRlZmluZWQ6XG4gICAgICAgICAgICAvLyAoU2VlIHRoZSBhYm92ZSBjaGVjayBgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIGZpZWxkVmFsdWUgPT0gXCJ1bmRlZmluZWRcIilgKVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgaWYgKGtleXNUb0luY3JlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaW5jcmVtZW50UGF0dGVybnMgPVxuICAgICAgICAgICAgJyB8fCAnICtcbiAgICAgICAgICAgIGtleXNUb0luY3JlbWVudFxuICAgICAgICAgICAgICAubWFwKGMgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGZpZWxkVmFsdWVbY10uYW1vdW50O1xuICAgICAgICAgICAgICAgIHJldHVybiBgQ09OQ0FUKCd7XCIke2N9XCI6JywgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUtPj4nJHtjfScsJzAnKTo6aW50ICsgJHthbW91bnR9LCAnfScpOjpqc29uYmA7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5qb2luKCcgfHwgJyk7XG4gICAgICAgICAgLy8gU3RyaXAgdGhlIGtleXNcbiAgICAgICAgICBrZXlzVG9JbmNyZW1lbnQuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgZGVsZXRlIGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleXNUb0RlbGV0ZTogQXJyYXk8c3RyaW5nPiA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldC5cbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnRGVsZXRlJyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgY29uc3QgZGVsZXRlUGF0dGVybnMgPSBrZXlzVG9EZWxldGUucmVkdWNlKFxuICAgICAgICAgIChwOiBzdHJpbmcsIGM6IHN0cmluZywgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcCArIGAgLSAnJCR7aW5kZXggKyAxICsgaX06dmFsdWUnYDtcbiAgICAgICAgICB9LFxuICAgICAgICAgICcnXG4gICAgICAgICk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDEgKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID1cbiAgICAgIHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGRlYnVnKCd1cGRhdGU6ICcsIHFzLCB2YWx1ZXMpO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udFxuICAgICAgOiB0aGlzLl9jbGllbnRcbiAgICApLmFueShxcywgdmFsdWVzKTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5LCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCd1cHNlcnRPbmVPYmplY3QnLCB7IGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSB9KTtcbiAgICBjb25zdCBjcmVhdGVWYWx1ZSA9IE9iamVjdC5hc3NpZ24oe30sIHF1ZXJ5LCB1cGRhdGUpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZU9iamVjdChcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHNjaGVtYSxcbiAgICAgIGNyZWF0ZVZhbHVlLFxuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIGlnbm9yZSBkdXBsaWNhdGUgdmFsdWUgZXJyb3JzIGFzIGl0J3MgdXBzZXJ0XG4gICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBzY2hlbWEsXG4gICAgICAgIHF1ZXJ5LFxuICAgICAgICB1cGRhdGUsXG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7IHNraXAsIGxpbWl0LCBzb3J0LCBrZXlzLCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICkge1xuICAgIGRlYnVnKCdmaW5kJywgY2xhc3NOYW1lLCBxdWVyeSwge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIGtleXMsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICBleHBsYWluLFxuICAgIH0pO1xuICAgIGNvbnN0IGhhc0xpbWl0ID0gbGltaXQgIT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBoYXNTa2lwID0gc2tpcCAhPT0gdW5kZWZpbmVkO1xuICAgIGxldCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID1cbiAgICAgIHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IGxpbWl0UGF0dGVybiA9IGhhc0xpbWl0ID8gYExJTUlUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzTGltaXQpIHtcbiAgICAgIHZhbHVlcy5wdXNoKGxpbWl0KTtcbiAgICB9XG4gICAgY29uc3Qgc2tpcFBhdHRlcm4gPSBoYXNTa2lwID8gYE9GRlNFVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc1NraXApIHtcbiAgICAgIHZhbHVlcy5wdXNoKHNraXApO1xuICAgIH1cblxuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGlmIChzb3J0KSB7XG4gICAgICBjb25zdCBzb3J0Q29weTogYW55ID0gc29ydDtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBPYmplY3Qua2V5cyhzb3J0KVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPVxuICAgICAgICBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMFxuICAgICAgICAgID8gYE9SREVSIEJZICR7c29ydGluZ31gXG4gICAgICAgICAgOiAnJztcbiAgICB9XG4gICAgaWYgKHdoZXJlLnNvcnRzICYmIE9iamVjdC5rZXlzKCh3aGVyZS5zb3J0czogYW55KSkubGVuZ3RoID4gMCkge1xuICAgICAgc29ydFBhdHRlcm4gPSBgT1JERVIgQlkgJHt3aGVyZS5zb3J0cy5qb2luKCl9YDtcbiAgICB9XG5cbiAgICBsZXQgY29sdW1ucyA9ICcqJztcbiAgICBpZiAoa2V5cykge1xuICAgICAgLy8gRXhjbHVkZSBlbXB0eSBrZXlzXG4gICAgICAvLyBSZXBsYWNlIEFDTCBieSBpdCdzIGtleXNcbiAgICAgIGtleXMgPSBrZXlzLnJlZHVjZSgobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtby5wdXNoKCdfcnBlcm0nKTtcbiAgICAgICAgICBtZW1vLnB1c2goJ193cGVybScpO1xuICAgICAgICB9IGVsc2UgaWYgKGtleS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgbWVtby5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LCBbXSk7XG4gICAgICBjb2x1bW5zID0ga2V5c1xuICAgICAgICAubWFwKChrZXksIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHJldHVybiBgdHNfcmFua19jZCh0b190c3ZlY3RvcigkJHsyfSwgJCR7M306bmFtZSksIHRvX3RzcXVlcnkoJCR7NH0sICQkezV9KSwgMzIpIGFzIHNjb3JlYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAkJHtpbmRleCArIHZhbHVlcy5sZW5ndGggKyAxfTpuYW1lYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHZhbHVlcyA9IHZhbHVlcy5jb25jYXQoa2V5cyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluXG4gICAgICA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KVxuICAgICAgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFF1ZXJ5IG9uIG5vbiBleGlzdGluZyB0YWJsZSwgZG9uJ3QgY3Jhc2hcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+XG4gICAgICAgICAgdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgJiYgb2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgbGF0aXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLnksXG4gICAgICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbZmllbGROYW1lXS54LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgbGV0IGNvb3JkcyA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMuc3Vic3RyKDIsIGNvb3Jkcy5sZW5ndGggLSA0KS5zcGxpdCgnKSwoJyk7XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMV0pLFxuICAgICAgICAgICAgcGFyc2VGbG9hdChwb2ludC5zcGxpdCgnLCcpWzBdKSxcbiAgICAgICAgICBdO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IGNvb3JkcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgICAgIG5hbWU6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vVE9ETzogcmVtb3ZlIHRoaXMgcmVsaWFuY2Ugb24gdGhlIG1vbmdvIGZvcm1hdC4gREIgYWRhcHRlciBzaG91bGRuJ3Qga25vdyB0aGVyZSBpcyBhIGRpZmZlcmVuY2UgYmV0d2VlbiBjcmVhdGVkIGF0IGFuZCBhbnkgb3RoZXIgZGF0ZSBmaWVsZC5cbiAgICBpZiAob2JqZWN0LmNyZWF0ZWRBdCkge1xuICAgICAgb2JqZWN0LmNyZWF0ZWRBdCA9IG9iamVjdC5jcmVhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC51cGRhdGVkQXQpIHtcbiAgICAgIG9iamVjdC51cGRhdGVkQXQgPSBvYmplY3QudXBkYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QuZXhwaXJlc0F0KSB7XG4gICAgICBvYmplY3QuZXhwaXJlc0F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuZXhwaXJlc0F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0KSB7XG4gICAgICBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICAgIGlzbzogb2JqZWN0W2ZpZWxkTmFtZV0udG9JU09TdHJpbmcoKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBhc3luYyBlbnN1cmVVbmlxdWVuZXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXVxuICApIHtcbiAgICBjb25zdCBjb25zdHJhaW50TmFtZSA9IGAke2NsYXNzTmFtZX1fdW5pcXVlXyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgY29uc3RyYWludFBhdHRlcm5zID0gZmllbGROYW1lcy5tYXAoXG4gICAgICAoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWBcbiAgICApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5ub25lKHFzLCBbY2xhc3NOYW1lLCBjb25zdHJhaW50TmFtZSwgLi4uZmllbGROYW1lc10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGFzeW5jIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlPzogc3RyaW5nLFxuICAgIGVzdGltYXRlPzogYm9vbGVhbiA9IHRydWVcbiAgKSB7XG4gICAgZGVidWcoJ2NvdW50JywgY2xhc3NOYW1lLCBxdWVyeSwgcmVhZFByZWZlcmVuY2UsIGVzdGltYXRlKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBsZXQgcXMgPSAnJztcblxuICAgIGlmICh3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgfHwgIWVzdGltYXRlKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgY291bnQoKikgRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHFzID1cbiAgICAgICAgJ1NFTEVDVCByZWx0dXBsZXMgQVMgYXBwcm94aW1hdGVfcm93X2NvdW50IEZST00gcGdfY2xhc3MgV0hFUkUgcmVsbmFtZSA9ICQxJztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4ge1xuICAgICAgICBpZiAoYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiArYS5hcHByb3hpbWF0ZV9yb3dfY291bnQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmNvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBkaXN0aW5jdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICBmaWVsZE5hbWU6IHN0cmluZ1xuICApIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnLCBjbGFzc05hbWUsIHF1ZXJ5KTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB2YWx1ZXMgPSBbZmllbGQsIGNvbHVtbiwgY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogNCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCB0cmFuc2Zvcm1lciA9IGlzQXJyYXlGaWVsZCA/ICdqc29uYl9hcnJheV9lbGVtZW50cycgOiAnT04nO1xuICAgIGxldCBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6bmFtZSkgJDI6bmFtZSBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpyYXcpICQyOnJhdyBGUk9NICQzOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoIWlzTmVzdGVkKSB7XG4gICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuZmlsdGVyKG9iamVjdCA9PiBvYmplY3RbZmllbGRdICE9PSBudWxsKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgIGlmICghaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtmaWVsZF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGRdLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZCA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzFdO1xuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IG9iamVjdFtjb2x1bW5dW2NoaWxkXSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PlxuICAgICAgICByZXN1bHRzLm1hcChvYmplY3QgPT5cbiAgICAgICAgICB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKVxuICAgICAgICApXG4gICAgICApO1xuICB9XG5cbiAgYXN5bmMgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuXG4gICkge1xuICAgIGRlYnVnKCdhZ2dyZWdhdGUnLCBjbGFzc05hbWUsIHBpcGVsaW5lLCByZWFkUHJlZmVyZW5jZSwgaGludCwgZXhwbGFpbik7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAyO1xuICAgIGxldCBjb2x1bW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb3VudEZpZWxkID0gbnVsbDtcbiAgICBsZXQgZ3JvdXBWYWx1ZXMgPSBudWxsO1xuICAgIGxldCB3aGVyZVBhdHRlcm4gPSAnJztcbiAgICBsZXQgbGltaXRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNraXBQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGdyb3VwUGF0dGVybiA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGlwZWxpbmUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHN0YWdlID0gcGlwZWxpbmVbaV07XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kZ3JvdXBbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlICE9PSAnJykge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyBcIm9iamVjdElkXCJgKTtcbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBmaWVsZCA9PT0gJ19pZCcgJiZcbiAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKHZhbHVlKS5sZW5ndGggIT09IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIGdyb3VwVmFsdWVzID0gdmFsdWU7XG4gICAgICAgICAgICBjb25zdCBncm91cEJ5RmllbGRzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGFsaWFzIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWVbYWxpYXNdID09PSAnc3RyaW5nJyAmJiB2YWx1ZVthbGlhc10pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc10pO1xuICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9wZXJhdGlvbiA9IE9iamVjdC5rZXlzKHZhbHVlW2FsaWFzXSlbMF07XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdW29wZXJhdGlvbl0pO1xuICAgICAgICAgICAgICAgIGlmIChtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXSkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goXG4gICAgICAgICAgICAgICAgICAgIGBFWFRSQUNUKCR7XG4gICAgICAgICAgICAgICAgICAgICAgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl1cbiAgICAgICAgICAgICAgICAgICAgfSBGUk9NICQke2luZGV4fTpuYW1lIEFUIFRJTUUgWk9ORSAnVVRDJykgQVMgJCR7XG4gICAgICAgICAgICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgICAgICAgICAgIH06bmFtZWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9OnJhd2A7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChncm91cEJ5RmllbGRzLmpvaW4oKSk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUuJHN1bSkge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlLiRzdW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBTVU0oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRzdW0pLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb3VudEZpZWxkID0gZmllbGQ7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBDT1VOVCgqKSBBUyAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1heCkge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1BWCgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtYXgpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJG1pbikge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYE1JTigkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRtaW4pLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUuJGF2Zykge1xuICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYEFWRygkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlLiRhdmcpLCBmaWVsZCk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2x1bW5zLnB1c2goJyonKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBpZiAoY29sdW1ucy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgY29sdW1ucyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRwcm9qZWN0W2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IDEgfHwgdmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW107XG4gICAgICAgIGNvbnN0IG9yT3JBbmQgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoXG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLFxuICAgICAgICAgICckb3InXG4gICAgICAgIClcbiAgICAgICAgICA/ICcgT1IgJ1xuICAgICAgICAgIDogJyBBTkQgJztcblxuICAgICAgICBpZiAoc3RhZ2UuJG1hdGNoLiRvcikge1xuICAgICAgICAgIGNvbnN0IGNvbGxhcHNlID0ge307XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoLiRvci5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZWxlbWVudCkge1xuICAgICAgICAgICAgICBjb2xsYXBzZVtrZXldID0gZWxlbWVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHN0YWdlLiRtYXRjaCA9IGNvbGxhcHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGNvbnN0IG1hdGNoUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgICAgICAgIGlmICh2YWx1ZVtjbXBdKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICAgICAgICBtYXRjaFBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgICAgYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJlxuICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5sZW5ndGggPT09IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHdoZXJlUGF0dGVybiA9XG4gICAgICAgICAgcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9XG4gICAgICAgICAgc29ydCAhPT0gdW5kZWZpbmVkICYmIHNvcnRpbmcubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChncm91cFBhdHRlcm4pIHtcbiAgICAgIGNvbHVtbnMuZm9yRWFjaCgoZSwgaSwgYSkgPT4ge1xuICAgICAgICBpZiAoZSAmJiBlLnRyaW0oKSA9PT0gJyonKSB7XG4gICAgICAgICAgYVtpXSA9ICcnO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnNcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5qb2luKCl9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtza2lwUGF0dGVybn0gJHtncm91cFBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluXG4gICAgICA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KVxuICAgICAgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQuYW55KHFzLCB2YWx1ZXMpLnRoZW4oYSA9PiB7XG4gICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICByZXR1cm4gYTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhLm1hcChvYmplY3QgPT5cbiAgICAgICAgdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSlcbiAgICAgICk7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnb2JqZWN0SWQnKSkge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0ge307XG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZFtrZXldID0gcmVzdWx0W2tleV07XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudEZpZWxkKSB7XG4gICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oeyBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIH06IGFueSkge1xuICAgIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB0byBtYWtlIHByb3BlciB1c2Ugb2YgY29ubmVjdGlvbnMgKEB2aXRhbHktdClcbiAgICBkZWJ1ZygncGVyZm9ybUluaXRpYWxpemF0aW9uJyk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlVGFibGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgICBlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5zY2hlbWFVcGdyYWRlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSkpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsIGFzeW5jIHQgPT4ge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwubWlzYy5qc29uT2JqZWN0U2V0S2V5cyk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGQpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LnJlbW92ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zKTtcbiAgICAgICAgICByZXR1cm4gdC5jdHg7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGN0eCA9PiB7XG4gICAgICAgIGRlYnVnKGBpbml0aWFsaXphdGlvbkRvbmUgaW4gJHtjdHguZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBpbmRleGVzOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoXG4gICAgICBjb25uIHx8IHRoaXMuX2NsaWVudFxuICAgICkubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgIGZpZWxkTmFtZSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHR5cGUsXG4gICAgXSk7XG4gIH1cblxuICBhc3luYyBkcm9wSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBxdWVyaWVzID0gaW5kZXhlcy5tYXAoaSA9PiAoe1xuICAgICAgcXVlcnk6ICdEUk9QIElOREVYICQxOm5hbWUnLFxuICAgICAgdmFsdWVzOiBpLFxuICAgIH0pKTtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLnR4KHQgPT5cbiAgICAgIHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQocXVlcmllcykpXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxcyA9ICdTRUxFQ1QgKiBGUk9NIHBnX2luZGV4ZXMgV0hFUkUgdGFibGVuYW1lID0gJHtjbGFzc05hbWV9JztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgeyBjbGFzc05hbWUgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBVc2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gIGFzeW5jIHVwZGF0ZUVzdGltYXRlZENvdW50KGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKCdBTkFMWVpFICQxOm5hbWUnLCBbY2xhc3NOYW1lXSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZXNzaW9uID0ge307XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQgPSB0aGlzLl9jbGllbnQudHgodCA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgIH0pO1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCA9IFtdO1xuICAgICAgICByZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2U7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKFxuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24udC5iYXRjaCh0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaClcbiAgICApO1xuICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQ7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQuY2F0Y2goKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKFByb21pc2UucmVqZWN0KCkpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUoXG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKVxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IGRlZmF1bHRJbmRleE5hbWUgPSBgcGFyc2VfZGVmYXVsdF8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9XG4gICAgICBpbmRleE5hbWUgIT0gbnVsbCA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7IG5hbWU6IGRlZmF1bHRJbmRleE5hbWUgfTtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8gZmllbGROYW1lcy5tYXAoXG4gICAgICAgIChmaWVsZE5hbWUsIGluZGV4KSA9PiBgbG93ZXIoJCR7aW5kZXggKyAzfTpuYW1lKSB2YXJjaGFyX3BhdHRlcm5fb3BzYFxuICAgICAgKVxuICAgICAgOiBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIGF3YWl0IGNvbm5cbiAgICAgIC5ub25lKHFzLCBbaW5kZXhOYW1lT3B0aW9ucy5uYW1lLCBjbGFzc05hbWUsIC4uLmZpZWxkTmFtZXNdKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciAmJlxuICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBJbmRleCBhbHJlYWR5IGV4aXN0cy4gSWdub3JlIGVycm9yLlxuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjb252ZXJ0UG9seWdvblRvU1FMKHBvbHlnb24pIHtcbiAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGBQb2x5Z29uIG11c3QgaGF2ZSBhdCBsZWFzdCAzIHZhbHVlc2BcbiAgICApO1xuICB9XG4gIGlmIChcbiAgICBwb2x5Z29uWzBdWzBdICE9PSBwb2x5Z29uW3BvbHlnb24ubGVuZ3RoIC0gMV1bMF0gfHxcbiAgICBwb2x5Z29uWzBdWzFdICE9PSBwb2x5Z29uW3BvbHlnb24ubGVuZ3RoIC0gMV1bMV1cbiAgKSB7XG4gICAgcG9seWdvbi5wdXNoKHBvbHlnb25bMF0pO1xuICB9XG4gIGNvbnN0IHVuaXF1ZSA9IHBvbHlnb24uZmlsdGVyKChpdGVtLCBpbmRleCwgYXIpID0+IHtcbiAgICBsZXQgZm91bmRJbmRleCA9IC0xO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXIubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHB0ID0gYXJbaV07XG4gICAgICBpZiAocHRbMF0gPT09IGl0ZW1bMF0gJiYgcHRbMV0gPT09IGl0ZW1bMV0pIHtcbiAgICAgICAgZm91bmRJbmRleCA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZm91bmRJbmRleCA9PT0gaW5kZXg7XG4gIH0pO1xuICBpZiAodW5pcXVlLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAnR2VvSlNPTjogTG9vcCBtdXN0IGhhdmUgYXQgbGVhc3QgMyBkaWZmZXJlbnQgdmVydGljZXMnXG4gICAgKTtcbiAgfVxuICBjb25zdCBwb2ludHMgPSBwb2x5Z29uXG4gICAgLm1hcChwb2ludCA9PiB7XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocGFyc2VGbG9hdChwb2ludFsxXSksIHBhcnNlRmxvYXQocG9pbnRbMF0pKTtcbiAgICAgIHJldHVybiBgKCR7cG9pbnRbMV19LCAke3BvaW50WzBdfSlgO1xuICAgIH0pXG4gICAgLmpvaW4oJywgJyk7XG4gIHJldHVybiBgKCR7cG9pbnRzfSlgO1xufVxuXG5mdW5jdGlvbiByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KSB7XG4gIGlmICghcmVnZXguZW5kc1dpdGgoJ1xcbicpKSB7XG4gICAgcmVnZXggKz0gJ1xcbic7XG4gIH1cblxuICAvLyByZW1vdmUgbm9uIGVzY2FwZWQgY29tbWVudHNcbiAgcmV0dXJuIChcbiAgICByZWdleFxuICAgICAgLnJlcGxhY2UoLyhbXlxcXFxdKSMuKlxcbi9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgbGluZXMgc3RhcnRpbmcgd2l0aCBhIGNvbW1lbnRcbiAgICAgIC5yZXBsYWNlKC9eIy4qXFxuL2dpbSwgJycpXG4gICAgICAvLyByZW1vdmUgbm9uIGVzY2FwZWQgd2hpdGVzcGFjZVxuICAgICAgLnJlcGxhY2UoLyhbXlxcXFxdKVxccysvZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIHdoaXRlc3BhY2UgYXQgdGhlIGJlZ2lubmluZyBvZiBhIGxpbmVcbiAgICAgIC5yZXBsYWNlKC9eXFxzKy8sICcnKVxuICAgICAgLnRyaW0oKVxuICApO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzUmVnZXhQYXR0ZXJuKHMpIHtcbiAgaWYgKHMgJiYgcy5zdGFydHNXaXRoKCdeJykpIHtcbiAgICAvLyByZWdleCBmb3Igc3RhcnRzV2l0aFxuICAgIHJldHVybiAnXicgKyBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMSkpO1xuICB9IGVsc2UgaWYgKHMgJiYgcy5lbmRzV2l0aCgnJCcpKSB7XG4gICAgLy8gcmVnZXggZm9yIGVuZHNXaXRoXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgwLCBzLmxlbmd0aCAtIDEpKSArICckJztcbiAgfVxuXG4gIC8vIHJlZ2V4IGZvciBjb250YWluc1xuICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzKTtcbn1cblxuZnVuY3Rpb24gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUpIHtcbiAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnIHx8ICF2YWx1ZS5zdGFydHNXaXRoKCdeJykpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBtYXRjaGVzID0gdmFsdWUubWF0Y2goL1xcXlxcXFxRLipcXFxcRS8pO1xuICByZXR1cm4gISFtYXRjaGVzO1xufVxuXG5mdW5jdGlvbiBpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKHZhbHVlcykge1xuICBpZiAoIXZhbHVlcyB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZXMpIHx8IHZhbHVlcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGNvbnN0IGZpcnN0VmFsdWVzSXNSZWdleCA9IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1swXS4kcmVnZXgpO1xuICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBmaXJzdFZhbHVlc0lzUmVnZXg7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMSwgbGVuZ3RoID0gdmFsdWVzLmxlbmd0aDsgaSA8IGxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGZpcnN0VmFsdWVzSXNSZWdleCAhPT0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzW2ldLiRyZWdleCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNBbnlWYWx1ZVJlZ2V4U3RhcnRzV2l0aCh2YWx1ZXMpIHtcbiAgcmV0dXJuIHZhbHVlcy5zb21lKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZS4kcmVnZXgpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZykge1xuICByZXR1cm4gcmVtYWluaW5nXG4gICAgLnNwbGl0KCcnKVxuICAgIC5tYXAoYyA9PiB7XG4gICAgICBjb25zdCByZWdleCA9IFJlZ0V4cCgnWzAtOSBdfFxcXFxwe0x9JywgJ3UnKTsgLy8gU3VwcG9ydCBhbGwgdW5pY29kZSBsZXR0ZXIgY2hhcnNcbiAgICAgIGlmIChjLm1hdGNoKHJlZ2V4KSAhPT0gbnVsbCkge1xuICAgICAgICAvLyBkb24ndCBlc2NhcGUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnNcbiAgICAgICAgcmV0dXJuIGM7XG4gICAgICB9XG4gICAgICAvLyBlc2NhcGUgZXZlcnl0aGluZyBlbHNlIChzaW5nbGUgcXVvdGVzIHdpdGggc2luZ2xlIHF1b3RlcywgZXZlcnl0aGluZyBlbHNlIHdpdGggYSBiYWNrc2xhc2gpXG4gICAgICByZXR1cm4gYyA9PT0gYCdgID8gYCcnYCA6IGBcXFxcJHtjfWA7XG4gICAgfSlcbiAgICAuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIGxpdGVyYWxpemVSZWdleFBhcnQoczogc3RyaW5nKSB7XG4gIGNvbnN0IG1hdGNoZXIxID0gL1xcXFxRKCg/IVxcXFxFKS4qKVxcXFxFJC87XG4gIGNvbnN0IHJlc3VsdDE6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjEpO1xuICBpZiAocmVzdWx0MSAmJiByZXN1bHQxLmxlbmd0aCA+IDEgJiYgcmVzdWx0MS5pbmRleCA+IC0xKSB7XG4gICAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBhbmQgYW4gZW5kIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyKDAsIHJlc3VsdDEuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDFbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyBwcm9jZXNzIHJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICBjb25zdCBtYXRjaGVyMiA9IC9cXFxcUSgoPyFcXFxcRSkuKikkLztcbiAgY29uc3QgcmVzdWx0MjogYW55ID0gcy5tYXRjaChtYXRjaGVyMik7XG4gIGlmIChyZXN1bHQyICYmIHJlc3VsdDIubGVuZ3RoID4gMSAmJiByZXN1bHQyLmluZGV4ID4gLTEpIHtcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQyLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQyWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcmVtb3ZlIGFsbCBpbnN0YW5jZXMgb2YgXFxRIGFuZCBcXEUgZnJvbSB0aGUgcmVtYWluaW5nIHRleHQgJiBlc2NhcGUgc2luZ2xlIHF1b3Rlc1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXEUpLywgJyQxJylcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxRKS8sICckMScpXG4gICAgLnJlcGxhY2UoL15cXFxcRS8sICcnKVxuICAgIC5yZXBsYWNlKC9eXFxcXFEvLCAnJylcbiAgICAucmVwbGFjZSgvKFteJ10pJy8sIGAkMScnYClcbiAgICAucmVwbGFjZSgvXicoW14nXSkvLCBgJyckMWApO1xufVxuXG52YXIgR2VvUG9pbnRDb2RlciA9IHtcbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCdcbiAgICApO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdfQ==