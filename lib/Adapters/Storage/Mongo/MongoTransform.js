"use strict";

var _logger = _interopRequireDefault(require("../../../logger"));

var _lodash = _interopRequireDefault(require("lodash"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var mongodb = require('mongodb');

var Parse = require('parse/node').Parse;

const transformKey = (className, fieldName, schema) => {
  // Check if the schema is known since it's a built-in field.
  switch (fieldName) {
    case 'objectId':
      return '_id';

    case 'createdAt':
      return '_created_at';

    case 'updatedAt':
      return '_updated_at';

    case 'sessionToken':
      return '_session_token';

    case 'lastUsed':
      return '_last_used';

    case 'timesUsed':
      return 'times_used';
  }

  if (schema.fields[fieldName] && schema.fields[fieldName].__type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  } else if (schema.fields[fieldName] && schema.fields[fieldName].type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  }

  return fieldName;
};

const transformKeyValueForUpdate = (className, restKey, restValue, parseFormatSchema) => {
  // Check if the schema is known since it's a built-in field.
  var key = restKey;
  var timeField = false;

  switch (key) {
    case 'objectId':
    case '_id':
      if (['_GlobalConfig', '_GraphQLConfig'].includes(className)) {
        return {
          key: key,
          value: parseInt(restValue)
        };
      }

      key = '_id';
      break;

    case 'createdAt':
    case '_created_at':
      key = '_created_at';
      timeField = true;
      break;

    case 'updatedAt':
    case '_updated_at':
      key = '_updated_at';
      timeField = true;
      break;

    case 'sessionToken':
    case '_session_token':
      key = '_session_token';
      break;

    case 'expiresAt':
    case '_expiresAt':
      key = 'expiresAt';
      timeField = true;
      break;

    case '_email_verify_token_expires_at':
      key = '_email_verify_token_expires_at';
      timeField = true;
      break;

    case '_account_lockout_expires_at':
      key = '_account_lockout_expires_at';
      timeField = true;
      break;

    case '_failed_login_count':
      key = '_failed_login_count';
      break;

    case '_perishable_token_expires_at':
      key = '_perishable_token_expires_at';
      timeField = true;
      break;

    case '_password_changed_at':
      key = '_password_changed_at';
      timeField = true;
      break;

    case '_rperm':
    case '_wperm':
      return {
        key: key,
        value: restValue
      };

    case 'lastUsed':
    case '_last_used':
      key = '_last_used';
      timeField = true;
      break;

    case 'timesUsed':
    case 'times_used':
      key = 'times_used';
      timeField = true;
      break;
  }

  if (parseFormatSchema.fields[key] && parseFormatSchema.fields[key].type === 'Pointer' || !parseFormatSchema.fields[key] && restValue && restValue.__type == 'Pointer') {
    key = '_p_' + key;
  } // Handle atomic values


  var value = transformTopLevelAtom(restValue);

  if (value !== CannotTransform) {
    if (timeField && typeof value === 'string') {
      value = new Date(value);
    }

    if (restKey.indexOf('.') > 0) {
      return {
        key,
        value: restValue
      };
    }

    return {
      key,
      value
    };
  } // Handle arrays


  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key,
      value
    };
  } // Handle update operators


  if (typeof restValue === 'object' && '__op' in restValue) {
    return {
      key,
      value: transformUpdateOperator(restValue, false)
    };
  } // Handle normal objects by recursing


  value = mapValues(restValue, transformInteriorValue);
  return {
    key,
    value
  };
};

const isRegex = value => {
  return value && value instanceof RegExp;
};

const isStartsWithRegex = value => {
  if (!isRegex(value)) {
    return false;
  }

  const matches = value.toString().match(/\/\^\\Q.*\\E\//);
  return !!matches;
};

const isAllValuesRegexOrNone = values => {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }

  const firstValuesIsRegex = isStartsWithRegex(values[0]);

  if (values.length === 1) {
    return firstValuesIsRegex;
  }

  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i])) {
      return false;
    }
  }

  return true;
};

const isAnyValueRegex = values => {
  return values.some(function (value) {
    return isRegex(value);
  });
};

const transformInteriorValue = restValue => {
  if (restValue !== null && typeof restValue === 'object' && Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  } // Handle atomic values


  var value = transformInteriorAtom(restValue);

  if (value !== CannotTransform) {
    return value;
  } // Handle arrays


  if (restValue instanceof Array) {
    return restValue.map(transformInteriorValue);
  } // Handle update operators


  if (typeof restValue === 'object' && '__op' in restValue) {
    return transformUpdateOperator(restValue, true);
  } // Handle normal objects by recursing


  return mapValues(restValue, transformInteriorValue);
};

const valueAsDate = value => {
  if (typeof value === 'string') {
    return new Date(value);
  } else if (value instanceof Date) {
    return value;
  }

  return false;
};

function transformQueryKeyValue(className, key, value, schema, count = false) {
  switch (key) {
    case 'createdAt':
      if (valueAsDate(value)) {
        return {
          key: '_created_at',
          value: valueAsDate(value)
        };
      }

      key = '_created_at';
      break;

    case 'updatedAt':
      if (valueAsDate(value)) {
        return {
          key: '_updated_at',
          value: valueAsDate(value)
        };
      }

      key = '_updated_at';
      break;

    case 'expiresAt':
      if (valueAsDate(value)) {
        return {
          key: 'expiresAt',
          value: valueAsDate(value)
        };
      }

      break;

    case '_email_verify_token_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_email_verify_token_expires_at',
          value: valueAsDate(value)
        };
      }

      break;

    case 'objectId':
      {
        if (['_GlobalConfig', '_GraphQLConfig'].includes(className)) {
          value = parseInt(value);
        }

        return {
          key: '_id',
          value
        };
      }

    case '_account_lockout_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_account_lockout_expires_at',
          value: valueAsDate(value)
        };
      }

      break;

    case '_failed_login_count':
      return {
        key,
        value
      };

    case 'sessionToken':
      return {
        key: '_session_token',
        value
      };

    case '_perishable_token_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_perishable_token_expires_at',
          value: valueAsDate(value)
        };
      }

      break;

    case '_password_changed_at':
      if (valueAsDate(value)) {
        return {
          key: '_password_changed_at',
          value: valueAsDate(value)
        };
      }

      break;

    case '_rperm':
    case '_wperm':
    case '_perishable_token':
    case '_email_verify_token':
      return {
        key,
        value
      };

    case '$or':
    case '$and':
    case '$nor':
      return {
        key: key,
        value: value.map(subQuery => transformWhere(className, subQuery, schema, count))
      };

    case 'lastUsed':
      if (valueAsDate(value)) {
        return {
          key: '_last_used',
          value: valueAsDate(value)
        };
      }

      key = '_last_used';
      break;

    case 'timesUsed':
      return {
        key: 'times_used',
        value: value
      };

    default:
      {
        // Other auth data
        const authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);

        if (authDataMatch) {
          const provider = authDataMatch[1]; // Special-case auth data.

          return {
            key: `_auth_data_${provider}.id`,
            value
          };
        }
      }
  }

  const expectedTypeIsArray = schema && schema.fields[key] && schema.fields[key].type === 'Array';
  const expectedTypeIsPointer = schema && schema.fields[key] && schema.fields[key].type === 'Pointer';
  const field = schema && schema.fields[key];

  if (expectedTypeIsPointer || !schema && value && value.__type === 'Pointer') {
    key = '_p_' + key;
  } // Handle query constraints


  const transformedConstraint = transformConstraint(value, field, count);

  if (transformedConstraint !== CannotTransform) {
    if (transformedConstraint.$text) {
      return {
        key: '$text',
        value: transformedConstraint.$text
      };
    }

    if (transformedConstraint.$elemMatch) {
      return {
        key: '$nor',
        value: [{
          [key]: transformedConstraint
        }]
      };
    }

    return {
      key,
      value: transformedConstraint
    };
  }

  if (expectedTypeIsArray && !(value instanceof Array)) {
    return {
      key,
      value: {
        $all: [transformInteriorAtom(value)]
      }
    };
  } // Handle atomic values


  if (transformTopLevelAtom(value) !== CannotTransform) {
    return {
      key,
      value: transformTopLevelAtom(value)
    };
  } else {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `You cannot use ${value} as a query parameter.`);
  }
} // Main exposed method to help run queries.
// restWhere is the "where" clause in REST API form.
// Returns the mongo form of the query.


function transformWhere(className, restWhere, schema, count = false) {
  const mongoWhere = {};

  for (const restKey in restWhere) {
    const out = transformQueryKeyValue(className, restKey, restWhere[restKey], schema, count);
    mongoWhere[out.key] = out.value;
  }

  return mongoWhere;
}

const parseObjectKeyValueToMongoObjectKeyValue = (restKey, restValue, schema) => {
  // Check if the schema is known since it's a built-in field.
  let transformedValue;
  let coercedToDate;

  switch (restKey) {
    case 'objectId':
      return {
        key: '_id',
        value: restValue
      };

    case 'expiresAt':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: 'expiresAt',
        value: coercedToDate
      };

    case '_email_verify_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_email_verify_token_expires_at',
        value: coercedToDate
      };

    case '_account_lockout_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_account_lockout_expires_at',
        value: coercedToDate
      };

    case '_perishable_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_perishable_token_expires_at',
        value: coercedToDate
      };

    case '_password_changed_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_password_changed_at',
        value: coercedToDate
      };

    case '_failed_login_count':
    case '_rperm':
    case '_wperm':
    case '_email_verify_token':
    case '_hashed_password':
    case '_perishable_token':
      return {
        key: restKey,
        value: restValue
      };

    case 'sessionToken':
      return {
        key: '_session_token',
        value: restValue
      };

    default:
      // Auth data should have been transformed already
      if (restKey.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'can only query on ' + restKey);
      } // Trust that the auth data has been transformed and save it directly


      if (restKey.match(/^_auth_data_[a-zA-Z0-9_]+$/)) {
        return {
          key: restKey,
          value: restValue
        };
      }

  } //skip straight to transformTopLevelAtom for Bytes, they don't show up in the schema for some reason


  if (restValue && restValue.__type !== 'Bytes') {
    //Note: We may not know the type of a field here, as the user could be saving (null) to a field
    //That never existed before, meaning we can't infer the type.
    if (schema.fields[restKey] && schema.fields[restKey].type == 'Pointer' || restValue.__type == 'Pointer') {
      restKey = '_p_' + restKey;
    }
  } // Handle atomic values


  var value = transformTopLevelAtom(restValue);

  if (value !== CannotTransform) {
    return {
      key: restKey,
      value: value
    };
  } // ACLs are handled before this method is called
  // If an ACL key still exists here, something is wrong.


  if (restKey === 'ACL') {
    throw 'There was a problem transforming an ACL.';
  } // Handle arrays


  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key: restKey,
      value: value
    };
  } // Handle normal objects by recursing


  if (Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  }

  value = mapValues(restValue, transformInteriorValue);
  return {
    key: restKey,
    value
  };
};

const parseObjectToMongoObjectForCreate = (className, restCreate, schema) => {
  restCreate = addLegacyACL(restCreate);
  const mongoCreate = {};

  for (const restKey in restCreate) {
    if (restCreate[restKey] && restCreate[restKey].__type === 'Relation') {
      continue;
    }

    const {
      key,
      value
    } = parseObjectKeyValueToMongoObjectKeyValue(restKey, restCreate[restKey], schema);

    if (value !== undefined) {
      mongoCreate[key] = value;
    }
  } // Use the legacy mongo format for createdAt and updatedAt


  if (mongoCreate.createdAt) {
    mongoCreate._created_at = new Date(mongoCreate.createdAt.iso || mongoCreate.createdAt);
    delete mongoCreate.createdAt;
  }

  if (mongoCreate.updatedAt) {
    mongoCreate._updated_at = new Date(mongoCreate.updatedAt.iso || mongoCreate.updatedAt);
    delete mongoCreate.updatedAt;
  }

  return mongoCreate;
}; // Main exposed method to help update old objects.


const transformUpdate = (className, restUpdate, parseFormatSchema) => {
  const mongoUpdate = {};
  const acl = addLegacyACL(restUpdate);

  if (acl._rperm || acl._wperm || acl._acl) {
    mongoUpdate.$set = {};

    if (acl._rperm) {
      mongoUpdate.$set._rperm = acl._rperm;
    }

    if (acl._wperm) {
      mongoUpdate.$set._wperm = acl._wperm;
    }

    if (acl._acl) {
      mongoUpdate.$set._acl = acl._acl;
    }
  }

  for (var restKey in restUpdate) {
    if (restUpdate[restKey] && restUpdate[restKey].__type === 'Relation') {
      continue;
    }

    var out = transformKeyValueForUpdate(className, restKey, restUpdate[restKey], parseFormatSchema); // If the output value is an object with any $ keys, it's an
    // operator that needs to be lifted onto the top level update
    // object.

    if (typeof out.value === 'object' && out.value !== null && out.value.__op) {
      mongoUpdate[out.value.__op] = mongoUpdate[out.value.__op] || {};
      mongoUpdate[out.value.__op][out.key] = out.value.arg;
    } else {
      mongoUpdate['$set'] = mongoUpdate['$set'] || {};
      mongoUpdate['$set'][out.key] = out.value;
    }
  }

  return mongoUpdate;
}; // Add the legacy _acl format.


const addLegacyACL = restObject => {
  const restObjectCopy = _objectSpread({}, restObject);

  const _acl = {};

  if (restObject._wperm) {
    restObject._wperm.forEach(entry => {
      _acl[entry] = {
        w: true
      };
    });

    restObjectCopy._acl = _acl;
  }

  if (restObject._rperm) {
    restObject._rperm.forEach(entry => {
      if (!(entry in _acl)) {
        _acl[entry] = {
          r: true
        };
      } else {
        _acl[entry].r = true;
      }
    });

    restObjectCopy._acl = _acl;
  }

  return restObjectCopy;
}; // A sentinel value that helper transformations return when they
// cannot perform a transformation


function CannotTransform() {}

const transformInteriorAtom = atom => {
  // TODO: check validity harder for the __type-defined types
  if (typeof atom === 'object' && atom && !(atom instanceof Date) && atom.__type === 'Pointer') {
    return {
      __type: 'Pointer',
      className: atom.className,
      objectId: atom.objectId
    };
  } else if (typeof atom === 'function' || typeof atom === 'symbol') {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `cannot transform value: ${atom}`);
  } else if (DateCoder.isValidJSON(atom)) {
    return DateCoder.JSONToDatabase(atom);
  } else if (BytesCoder.isValidJSON(atom)) {
    return BytesCoder.JSONToDatabase(atom);
  } else if (typeof atom === 'object' && atom && atom.$regex !== undefined) {
    return new RegExp(atom.$regex);
  } else {
    return atom;
  }
}; // Helper function to transform an atom from REST format to Mongo format.
// An atom is anything that can't contain other expressions. So it
// includes things where objects are used to represent other
// datatypes, like pointers and dates, but it does not include objects
// or arrays with generic stuff inside.
// Raises an error if this cannot possibly be valid REST format.
// Returns CannotTransform if it's just not an atom


function transformTopLevelAtom(atom, field) {
  switch (typeof atom) {
    case 'number':
    case 'boolean':
    case 'undefined':
      return atom;

    case 'string':
      if (field && field.type === 'Pointer') {
        return `${field.targetClass}$${atom}`;
      }

      return atom;

    case 'symbol':
    case 'function':
      throw new Parse.Error(Parse.Error.INVALID_JSON, `cannot transform value: ${atom}`);

    case 'object':
      if (atom instanceof Date) {
        // Technically dates are not rest format, but, it seems pretty
        // clear what they should be transformed to, so let's just do it.
        return atom;
      }

      if (atom === null) {
        return atom;
      } // TODO: check validity harder for the __type-defined types


      if (atom.__type == 'Pointer') {
        return `${atom.className}$${atom.objectId}`;
      }

      if (DateCoder.isValidJSON(atom)) {
        return DateCoder.JSONToDatabase(atom);
      }

      if (BytesCoder.isValidJSON(atom)) {
        return BytesCoder.JSONToDatabase(atom);
      }

      if (GeoPointCoder.isValidJSON(atom)) {
        return GeoPointCoder.JSONToDatabase(atom);
      }

      if (PolygonCoder.isValidJSON(atom)) {
        return PolygonCoder.JSONToDatabase(atom);
      }

      if (FileCoder.isValidJSON(atom)) {
        return FileCoder.JSONToDatabase(atom);
      }

      return CannotTransform;

    default:
      // I don't think typeof can ever let us get here
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, `really did not expect value: ${atom}`);
  }
}

function relativeTimeToDate(text, now = new Date()) {
  text = text.toLowerCase();
  let parts = text.split(' '); // Filter out whitespace

  parts = parts.filter(part => part !== '');
  const future = parts[0] === 'in';
  const past = parts[parts.length - 1] === 'ago';

  if (!future && !past && text !== 'now') {
    return {
      status: 'error',
      info: "Time should either start with 'in' or end with 'ago'"
    };
  }

  if (future && past) {
    return {
      status: 'error',
      info: "Time cannot have both 'in' and 'ago'"
    };
  } // strip the 'ago' or 'in'


  if (future) {
    parts = parts.slice(1);
  } else {
    // past
    parts = parts.slice(0, parts.length - 1);
  }

  if (parts.length % 2 !== 0 && text !== 'now') {
    return {
      status: 'error',
      info: 'Invalid time string. Dangling unit or number.'
    };
  }

  const pairs = [];

  while (parts.length) {
    pairs.push([parts.shift(), parts.shift()]);
  }

  let seconds = 0;

  for (const [num, interval] of pairs) {
    const val = Number(num);

    if (!Number.isInteger(val)) {
      return {
        status: 'error',
        info: `'${num}' is not an integer.`
      };
    }

    switch (interval) {
      case 'yr':
      case 'yrs':
      case 'year':
      case 'years':
        seconds += val * 31536000; // 365 * 24 * 60 * 60

        break;

      case 'wk':
      case 'wks':
      case 'week':
      case 'weeks':
        seconds += val * 604800; // 7 * 24 * 60 * 60

        break;

      case 'd':
      case 'day':
      case 'days':
        seconds += val * 86400; // 24 * 60 * 60

        break;

      case 'hr':
      case 'hrs':
      case 'hour':
      case 'hours':
        seconds += val * 3600; // 60 * 60

        break;

      case 'min':
      case 'mins':
      case 'minute':
      case 'minutes':
        seconds += val * 60;
        break;

      case 'sec':
      case 'secs':
      case 'second':
      case 'seconds':
        seconds += val;
        break;

      default:
        return {
          status: 'error',
          info: `Invalid interval: '${interval}'`
        };
    }
  }

  const milliseconds = seconds * 1000;

  if (future) {
    return {
      status: 'success',
      info: 'future',
      result: new Date(now.valueOf() + milliseconds)
    };
  } else if (past) {
    return {
      status: 'success',
      info: 'past',
      result: new Date(now.valueOf() - milliseconds)
    };
  } else {
    return {
      status: 'success',
      info: 'present',
      result: new Date(now.valueOf())
    };
  }
} // Transforms a query constraint from REST API format to Mongo format.
// A constraint is something with fields like $lt.
// If it is not a valid constraint but it could be a valid something
// else, return CannotTransform.
// inArray is whether this is an array field.


function transformConstraint(constraint, field, count = false) {
  const inArray = field && field.type && field.type === 'Array';

  if (typeof constraint !== 'object' || !constraint) {
    return CannotTransform;
  }

  const transformFunction = inArray ? transformInteriorAtom : transformTopLevelAtom;

  const transformer = atom => {
    const result = transformFunction(atom, field);

    if (result === CannotTransform) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `bad atom: ${JSON.stringify(atom)}`);
    }

    return result;
  }; // keys is the constraints in reverse alphabetical order.
  // This is a hack so that:
  //   $regex is handled before $options
  //   $nearSphere is handled before $maxDistance


  var keys = Object.keys(constraint).sort().reverse();
  var answer = {};

  for (var key of keys) {
    switch (key) {
      case '$lt':
      case '$lte':
      case '$gt':
      case '$gte':
      case '$exists':
      case '$ne':
      case '$eq':
        {
          const val = constraint[key];

          if (val && typeof val === 'object' && val.$relativeTime) {
            if (field && field.type !== 'Date') {
              throw new Parse.Error(Parse.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }

            switch (key) {
              case '$exists':
              case '$ne':
              case '$eq':
                throw new Parse.Error(Parse.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
            }

            const parserResult = relativeTimeToDate(val.$relativeTime);

            if (parserResult.status === 'success') {
              answer[key] = parserResult.result;
              break;
            }

            _logger.default.info('Error while parsing relative date', parserResult);

            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $relativeTime (${key}) value. ${parserResult.info}`);
          }

          answer[key] = transformer(val);
          break;
        }

      case '$in':
      case '$nin':
        {
          const arr = constraint[key];

          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
          }

          answer[key] = _lodash.default.flatMap(arr, value => {
            return (atom => {
              if (Array.isArray(atom)) {
                return value.map(transformer);
              } else {
                return transformer(atom);
              }
            })(value);
          });
          break;
        }

      case '$all':
        {
          const arr = constraint[key];

          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
          }

          answer[key] = arr.map(transformInteriorAtom);
          const values = answer[key];

          if (isAnyValueRegex(values) && !isAllValuesRegexOrNone(values)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + values);
          }

          break;
        }

      case '$regex':
        var s = constraint[key];

        if (typeof s !== 'string') {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad regex: ' + s);
        }

        answer[key] = s;
        break;

      case '$containedBy':
        {
          const arr = constraint[key];

          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $containedBy: should be an array`);
          }

          answer.$elemMatch = {
            $nin: arr.map(transformer)
          };
          break;
        }

      case '$options':
        answer[key] = constraint[key];
        break;

      case '$text':
        {
          const search = constraint[key].$search;

          if (typeof search !== 'object') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $search, should be object`);
          }

          if (!search.$term || typeof search.$term !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $term, should be string`);
          } else {
            answer[key] = {
              $search: search.$term
            };
          }

          if (search.$language && typeof search.$language !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $language, should be string`);
          } else if (search.$language) {
            answer[key].$language = search.$language;
          }

          if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
          } else if (search.$caseSensitive) {
            answer[key].$caseSensitive = search.$caseSensitive;
          }

          if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
          } else if (search.$diacriticSensitive) {
            answer[key].$diacriticSensitive = search.$diacriticSensitive;
          }

          break;
        }

      case '$nearSphere':
        {
          const point = constraint[key];

          if (count) {
            answer.$geoWithin = {
              $centerSphere: [[point.longitude, point.latitude], constraint.$maxDistance]
            };
          } else {
            answer[key] = [point.longitude, point.latitude];
          }

          break;
        }

      case '$maxDistance':
        {
          if (count) {
            break;
          }

          answer[key] = constraint[key];
          break;
        }
      // The SDKs don't seem to use these but they are documented in the
      // REST API docs.

      case '$maxDistanceInRadians':
        answer['$maxDistance'] = constraint[key];
        break;

      case '$maxDistanceInMiles':
        answer['$maxDistance'] = constraint[key] / 3959;
        break;

      case '$maxDistanceInKilometers':
        answer['$maxDistance'] = constraint[key] / 6371;
        break;

      case '$select':
      case '$dontSelect':
        throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, 'the ' + key + ' constraint is not supported yet');

      case '$within':
        var box = constraint[key]['$box'];

        if (!box || box.length != 2) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'malformatted $within arg');
        }

        answer[key] = {
          $box: [[box[0].longitude, box[0].latitude], [box[1].longitude, box[1].latitude]]
        };
        break;

      case '$geoWithin':
        {
          const polygon = constraint[key]['$polygon'];
          const centerSphere = constraint[key]['$centerSphere'];

          if (polygon !== undefined) {
            let points;

            if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
              if (!polygon.coordinates || polygon.coordinates.length < 3) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
              }

              points = polygon.coordinates;
            } else if (polygon instanceof Array) {
              if (polygon.length < 3) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
              }

              points = polygon;
            } else {
              throw new Parse.Error(Parse.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
            }

            points = points.map(point => {
              if (point instanceof Array && point.length === 2) {
                Parse.GeoPoint._validate(point[1], point[0]);

                return point;
              }

              if (!GeoPointCoder.isValidJSON(point)) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value');
              } else {
                Parse.GeoPoint._validate(point.latitude, point.longitude);
              }

              return [point.longitude, point.latitude];
            });
            answer[key] = {
              $polygon: points
            };
          } else if (centerSphere !== undefined) {
            if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
            } // Get point, convert to geo point if necessary and validate


            let point = centerSphere[0];

            if (point instanceof Array && point.length === 2) {
              point = new Parse.GeoPoint(point[1], point[0]);
            } else if (!GeoPointCoder.isValidJSON(point)) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
            }

            Parse.GeoPoint._validate(point.latitude, point.longitude); // Get distance and validate


            const distance = centerSphere[1];

            if (isNaN(distance) || distance < 0) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
            }

            answer[key] = {
              $centerSphere: [[point.longitude, point.latitude], distance]
            };
          }

          break;
        }

      case '$geoIntersects':
        {
          const point = constraint[key]['$point'];

          if (!GeoPointCoder.isValidJSON(point)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
          } else {
            Parse.GeoPoint._validate(point.latitude, point.longitude);
          }

          answer[key] = {
            $geometry: {
              type: 'Point',
              coordinates: [point.longitude, point.latitude]
            }
          };
          break;
        }

      default:
        if (key.match(/^\$+/)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad constraint: ' + key);
        }

        return CannotTransform;
    }
  }

  return answer;
} // Transforms an update operator from REST format to mongo format.
// To be transformed, the input should have an __op field.
// If flatten is true, this will flatten operators to their static
// data format. For example, an increment of 2 would simply become a
// 2.
// The output for a non-flattened operator is a hash with __op being
// the mongo op, and arg being the argument.
// The output for a flattened operator is just a value.
// Returns undefined if this should be a no-op.


function transformUpdateOperator({
  __op,
  amount,
  objects
}, flatten) {
  switch (__op) {
    case 'Delete':
      if (flatten) {
        return undefined;
      } else {
        return {
          __op: '$unset',
          arg: ''
        };
      }

    case 'Increment':
      if (typeof amount !== 'number') {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'incrementing must provide a number');
      }

      if (flatten) {
        return amount;
      } else {
        return {
          __op: '$inc',
          arg: amount
        };
      }

    case 'Add':
    case 'AddUnique':
      if (!(objects instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
      }

      var toAdd = objects.map(transformInteriorAtom);

      if (flatten) {
        return toAdd;
      } else {
        var mongoOp = {
          Add: '$push',
          AddUnique: '$addToSet'
        }[__op];
        return {
          __op: mongoOp,
          arg: {
            $each: toAdd
          }
        };
      }

    case 'Remove':
      if (!(objects instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to remove must be an array');
      }

      var toRemove = objects.map(transformInteriorAtom);

      if (flatten) {
        return [];
      } else {
        return {
          __op: '$pullAll',
          arg: toRemove
        };
      }

    default:
      throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, `The ${__op} operator is not supported yet.`);
  }
}

function mapValues(object, iterator) {
  const result = {};
  Object.keys(object).forEach(key => {
    result[key] = iterator(object[key]);
  });
  return result;
}

const nestedMongoObjectToNestedParseObject = mongoObject => {
  switch (typeof mongoObject) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return mongoObject;

    case 'symbol':
    case 'function':
      throw 'bad value in nestedMongoObjectToNestedParseObject';

    case 'object':
      if (mongoObject === null) {
        return null;
      }

      if (mongoObject instanceof Array) {
        return mongoObject.map(nestedMongoObjectToNestedParseObject);
      }

      if (mongoObject instanceof Date) {
        return Parse._encode(mongoObject);
      }

      if (mongoObject instanceof mongodb.Long) {
        return mongoObject.toNumber();
      }

      if (mongoObject instanceof mongodb.Double) {
        return mongoObject.value;
      }

      if (BytesCoder.isValidDatabaseObject(mongoObject)) {
        return BytesCoder.databaseToJSON(mongoObject);
      }

      if (Object.prototype.hasOwnProperty.call(mongoObject, '__type') && mongoObject.__type == 'Date' && mongoObject.iso instanceof Date) {
        mongoObject.iso = mongoObject.iso.toJSON();
        return mongoObject;
      }

      return mapValues(mongoObject, nestedMongoObjectToNestedParseObject);

    default:
      throw 'unknown js type';
  }
};

const transformPointerString = (schema, field, pointerString) => {
  const objData = pointerString.split('$');

  if (objData[0] !== schema.fields[field].targetClass) {
    throw 'pointer to incorrect className';
  }

  return {
    __type: 'Pointer',
    className: objData[0],
    objectId: objData[1]
  };
}; // Converts from a mongo-format object to a REST-format object.
// Does not strip out anything based on a lack of authentication.


const mongoObjectToParseObject = (className, mongoObject, schema) => {
  switch (typeof mongoObject) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return mongoObject;

    case 'symbol':
    case 'function':
      throw 'bad value in mongoObjectToParseObject';

    case 'object':
      {
        if (mongoObject === null) {
          return null;
        }

        if (mongoObject instanceof Array) {
          return mongoObject.map(nestedMongoObjectToNestedParseObject);
        }

        if (mongoObject instanceof Date) {
          return Parse._encode(mongoObject);
        }

        if (mongoObject instanceof mongodb.Long) {
          return mongoObject.toNumber();
        }

        if (mongoObject instanceof mongodb.Double) {
          return mongoObject.value;
        }

        if (BytesCoder.isValidDatabaseObject(mongoObject)) {
          return BytesCoder.databaseToJSON(mongoObject);
        }

        const restObject = {};

        if (mongoObject._rperm || mongoObject._wperm) {
          restObject._rperm = mongoObject._rperm || [];
          restObject._wperm = mongoObject._wperm || [];
          delete mongoObject._rperm;
          delete mongoObject._wperm;
        }

        for (var key in mongoObject) {
          switch (key) {
            case '_id':
              restObject['objectId'] = '' + mongoObject[key];
              break;

            case '_hashed_password':
              restObject._hashed_password = mongoObject[key];
              break;

            case '_acl':
              break;

            case '_email_verify_token':
            case '_perishable_token':
            case '_perishable_token_expires_at':
            case '_password_changed_at':
            case '_tombstone':
            case '_email_verify_token_expires_at':
            case '_account_lockout_expires_at':
            case '_failed_login_count':
            case '_password_history':
              // Those keys will be deleted if needed in the DB Controller
              restObject[key] = mongoObject[key];
              break;

            case '_session_token':
              restObject['sessionToken'] = mongoObject[key];
              break;

            case 'updatedAt':
            case '_updated_at':
              restObject['updatedAt'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;

            case 'createdAt':
            case '_created_at':
              restObject['createdAt'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;

            case 'expiresAt':
            case '_expiresAt':
              restObject['expiresAt'] = Parse._encode(new Date(mongoObject[key]));
              break;

            case 'lastUsed':
            case '_last_used':
              restObject['lastUsed'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;

            case 'timesUsed':
            case 'times_used':
              restObject['timesUsed'] = mongoObject[key];
              break;

            default:
              // Check other auth data keys
              var authDataMatch = key.match(/^_auth_data_([a-zA-Z0-9_]+)$/);

              if (authDataMatch) {
                var provider = authDataMatch[1];
                restObject['authData'] = restObject['authData'] || {};
                restObject['authData'][provider] = mongoObject[key];
                break;
              }

              if (key.indexOf('_p_') == 0) {
                var newKey = key.substring(3);

                if (!schema.fields[newKey]) {
                  _logger.default.info('transform.js', 'Found a pointer column not in the schema, dropping it.', className, newKey);

                  break;
                }

                if (schema.fields[newKey].type !== 'Pointer') {
                  _logger.default.info('transform.js', 'Found a pointer in a non-pointer column, dropping it.', className, key);

                  break;
                }

                if (mongoObject[key] === null) {
                  break;
                }

                restObject[newKey] = transformPointerString(schema, newKey, mongoObject[key]);
                break;
              } else if (key[0] == '_' && key != '__type') {
                throw 'bad key in untransform: ' + key;
              } else {
                var value = mongoObject[key];

                if (schema.fields[key] && schema.fields[key].type === 'File' && FileCoder.isValidDatabaseObject(value)) {
                  restObject[key] = FileCoder.databaseToJSON(value);
                  break;
                }

                if (schema.fields[key] && schema.fields[key].type === 'GeoPoint' && GeoPointCoder.isValidDatabaseObject(value)) {
                  restObject[key] = GeoPointCoder.databaseToJSON(value);
                  break;
                }

                if (schema.fields[key] && schema.fields[key].type === 'Polygon' && PolygonCoder.isValidDatabaseObject(value)) {
                  restObject[key] = PolygonCoder.databaseToJSON(value);
                  break;
                }

                if (schema.fields[key] && schema.fields[key].type === 'Bytes' && BytesCoder.isValidDatabaseObject(value)) {
                  restObject[key] = BytesCoder.databaseToJSON(value);
                  break;
                }
              }

              restObject[key] = nestedMongoObjectToNestedParseObject(mongoObject[key]);
          }
        }

        const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
        const relationFields = {};
        relationFieldNames.forEach(relationFieldName => {
          relationFields[relationFieldName] = {
            __type: 'Relation',
            className: schema.fields[relationFieldName].targetClass
          };
        });
        return _objectSpread({}, restObject, {}, relationFields);
      }

    default:
      throw 'unknown js type';
  }
};

var DateCoder = {
  JSONToDatabase(json) {
    return new Date(json.iso);
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Date';
  }

};
var BytesCoder = {
  base64Pattern: new RegExp('^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'),

  isBase64Value(object) {
    if (typeof object !== 'string') {
      return false;
    }

    return this.base64Pattern.test(object);
  },

  databaseToJSON(object) {
    let value;

    if (this.isBase64Value(object)) {
      value = object;
    } else {
      value = object.buffer.toString('base64');
    }

    return {
      __type: 'Bytes',
      base64: value
    };
  },

  isValidDatabaseObject(object) {
    return object instanceof mongodb.Binary || this.isBase64Value(object);
  },

  JSONToDatabase(json) {
    return new mongodb.Binary(Buffer.from(json.base64, 'base64'));
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Bytes';
  }

};
var GeoPointCoder = {
  databaseToJSON(object) {
    return {
      __type: 'GeoPoint',
      latitude: object[1],
      longitude: object[0]
    };
  },

  isValidDatabaseObject(object) {
    return object instanceof Array && object.length == 2;
  },

  JSONToDatabase(json) {
    return [json.longitude, json.latitude];
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }

};
var PolygonCoder = {
  databaseToJSON(object) {
    // Convert lng/lat -> lat/lng
    const coords = object.coordinates[0].map(coord => {
      return [coord[1], coord[0]];
    });
    return {
      __type: 'Polygon',
      coordinates: coords
    };
  },

  isValidDatabaseObject(object) {
    const coords = object.coordinates[0];

    if (object.type !== 'Polygon' || !(coords instanceof Array)) {
      return false;
    }

    for (let i = 0; i < coords.length; i++) {
      const point = coords[i];

      if (!GeoPointCoder.isValidDatabaseObject(point)) {
        return false;
      }

      Parse.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    }

    return true;
  },

  JSONToDatabase(json) {
    let coords = json.coordinates; // Add first point to the end to close polygon

    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }

    const unique = coords.filter((item, index, ar) => {
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
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
    } // Convert lat/long -> long/lat


    coords = coords.map(coord => {
      return [coord[1], coord[0]];
    });
    return {
      type: 'Polygon',
      coordinates: [coords]
    };
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Polygon';
  }

};
var FileCoder = {
  databaseToJSON(object) {
    return {
      __type: 'File',
      name: object
    };
  },

  isValidDatabaseObject(object) {
    return typeof object === 'string';
  },

  JSONToDatabase(json) {
    return json.name;
  },

  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'File';
  }

};
module.exports = {
  transformKey,
  parseObjectToMongoObjectForCreate,
  transformUpdate,
  transformWhere,
  mongoObjectToParseObject,
  relativeTimeToDate,
  transformConstraint,
  transformPointerString
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvVHJhbnNmb3JtLmpzIl0sIm5hbWVzIjpbIm1vbmdvZGIiLCJyZXF1aXJlIiwiUGFyc2UiLCJ0cmFuc2Zvcm1LZXkiLCJjbGFzc05hbWUiLCJmaWVsZE5hbWUiLCJzY2hlbWEiLCJmaWVsZHMiLCJfX3R5cGUiLCJ0eXBlIiwidHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUiLCJyZXN0S2V5IiwicmVzdFZhbHVlIiwicGFyc2VGb3JtYXRTY2hlbWEiLCJrZXkiLCJ0aW1lRmllbGQiLCJpbmNsdWRlcyIsInZhbHVlIiwicGFyc2VJbnQiLCJ0cmFuc2Zvcm1Ub3BMZXZlbEF0b20iLCJDYW5ub3RUcmFuc2Zvcm0iLCJEYXRlIiwiaW5kZXhPZiIsIkFycmF5IiwibWFwIiwidHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSIsInRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yIiwibWFwVmFsdWVzIiwiaXNSZWdleCIsIlJlZ0V4cCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwibWF0Y2hlcyIsInRvU3RyaW5nIiwibWF0Y2giLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwidmFsdWVzIiwiaXNBcnJheSIsImxlbmd0aCIsImZpcnN0VmFsdWVzSXNSZWdleCIsImkiLCJpc0FueVZhbHVlUmVnZXgiLCJzb21lIiwiT2JqZWN0Iiwia2V5cyIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwiZXhwZWN0ZWRUeXBlSXNBcnJheSIsImV4cGVjdGVkVHlwZUlzUG9pbnRlciIsImZpZWxkIiwidHJhbnNmb3JtZWRDb25zdHJhaW50IiwidHJhbnNmb3JtQ29uc3RyYWludCIsIiR0ZXh0IiwiJGVsZW1NYXRjaCIsIiRhbGwiLCJJTlZBTElEX0pTT04iLCJyZXN0V2hlcmUiLCJtb25nb1doZXJlIiwib3V0IiwicGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSIsInRyYW5zZm9ybWVkVmFsdWUiLCJjb2VyY2VkVG9EYXRlIiwiSU5WQUxJRF9LRVlfTkFNRSIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsInJlc3RDcmVhdGUiLCJhZGRMZWdhY3lBQ0wiLCJtb25nb0NyZWF0ZSIsInVuZGVmaW5lZCIsImNyZWF0ZWRBdCIsIl9jcmVhdGVkX2F0IiwiaXNvIiwidXBkYXRlZEF0IiwiX3VwZGF0ZWRfYXQiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJyZXN0VXBkYXRlIiwibW9uZ29VcGRhdGUiLCJhY2wiLCJfcnBlcm0iLCJfd3Blcm0iLCJfYWNsIiwiJHNldCIsIl9fb3AiLCJhcmciLCJyZXN0T2JqZWN0IiwicmVzdE9iamVjdENvcHkiLCJmb3JFYWNoIiwiZW50cnkiLCJ3IiwiciIsImF0b20iLCJvYmplY3RJZCIsIkRhdGVDb2RlciIsImlzVmFsaWRKU09OIiwiSlNPTlRvRGF0YWJhc2UiLCJCeXRlc0NvZGVyIiwiJHJlZ2V4IiwidGFyZ2V0Q2xhc3MiLCJHZW9Qb2ludENvZGVyIiwiUG9seWdvbkNvZGVyIiwiRmlsZUNvZGVyIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsInRvTG93ZXJDYXNlIiwicGFydHMiLCJzcGxpdCIsImZpbHRlciIsInBhcnQiLCJmdXR1cmUiLCJwYXN0Iiwic3RhdHVzIiwiaW5mbyIsInNsaWNlIiwicGFpcnMiLCJwdXNoIiwic2hpZnQiLCJzZWNvbmRzIiwibnVtIiwiaW50ZXJ2YWwiLCJ2YWwiLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJtaWxsaXNlY29uZHMiLCJyZXN1bHQiLCJ2YWx1ZU9mIiwiY29uc3RyYWludCIsImluQXJyYXkiLCJ0cmFuc2Zvcm1GdW5jdGlvbiIsInRyYW5zZm9ybWVyIiwiSlNPTiIsInN0cmluZ2lmeSIsInNvcnQiLCJyZXZlcnNlIiwiYW5zd2VyIiwiJHJlbGF0aXZlVGltZSIsInBhcnNlclJlc3VsdCIsImxvZyIsImFyciIsIl8iLCJmbGF0TWFwIiwicyIsIiRuaW4iLCJzZWFyY2giLCIkc2VhcmNoIiwiJHRlcm0iLCIkbGFuZ3VhZ2UiLCIkY2FzZVNlbnNpdGl2ZSIsIiRkaWFjcml0aWNTZW5zaXRpdmUiLCJwb2ludCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkbWF4RGlzdGFuY2UiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwiYm94IiwiJGJveCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJwb2ludHMiLCJjb29yZGluYXRlcyIsIkdlb1BvaW50IiwiX3ZhbGlkYXRlIiwiJHBvbHlnb24iLCJkaXN0YW5jZSIsImlzTmFOIiwiJGdlb21ldHJ5IiwiYW1vdW50Iiwib2JqZWN0cyIsImZsYXR0ZW4iLCJ0b0FkZCIsIm1vbmdvT3AiLCJBZGQiLCJBZGRVbmlxdWUiLCIkZWFjaCIsInRvUmVtb3ZlIiwib2JqZWN0IiwiaXRlcmF0b3IiLCJuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QiLCJtb25nb09iamVjdCIsIl9lbmNvZGUiLCJMb25nIiwidG9OdW1iZXIiLCJEb3VibGUiLCJpc1ZhbGlkRGF0YWJhc2VPYmplY3QiLCJkYXRhYmFzZVRvSlNPTiIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInRvSlNPTiIsInRyYW5zZm9ybVBvaW50ZXJTdHJpbmciLCJwb2ludGVyU3RyaW5nIiwib2JqRGF0YSIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJuZXdLZXkiLCJzdWJzdHJpbmciLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJyZWxhdGlvbkZpZWxkcyIsInJlbGF0aW9uRmllbGROYW1lIiwianNvbiIsImJhc2U2NFBhdHRlcm4iLCJpc0Jhc2U2NFZhbHVlIiwidGVzdCIsImJ1ZmZlciIsImJhc2U2NCIsIkJpbmFyeSIsIkJ1ZmZlciIsImZyb20iLCJjb29yZHMiLCJjb29yZCIsInBhcnNlRmxvYXQiLCJ1bmlxdWUiLCJpdGVtIiwiaW5kZXgiLCJhciIsImZvdW5kSW5kZXgiLCJwdCIsIm5hbWUiLCJtb2R1bGUiLCJleHBvcnRzIl0sIm1hcHBpbmdzIjoiOztBQUFBOztBQUNBOzs7Ozs7Ozs7O0FBQ0EsSUFBSUEsT0FBTyxHQUFHQyxPQUFPLENBQUMsU0FBRCxDQUFyQjs7QUFDQSxJQUFJQyxLQUFLLEdBQUdELE9BQU8sQ0FBQyxZQUFELENBQVAsQ0FBc0JDLEtBQWxDOztBQUVBLE1BQU1DLFlBQVksR0FBRyxDQUFDQyxTQUFELEVBQVlDLFNBQVosRUFBdUJDLE1BQXZCLEtBQWtDO0FBQ3JEO0FBQ0EsVUFBUUQsU0FBUjtBQUNFLFNBQUssVUFBTDtBQUNFLGFBQU8sS0FBUDs7QUFDRixTQUFLLFdBQUw7QUFDRSxhQUFPLGFBQVA7O0FBQ0YsU0FBSyxXQUFMO0FBQ0UsYUFBTyxhQUFQOztBQUNGLFNBQUssY0FBTDtBQUNFLGFBQU8sZ0JBQVA7O0FBQ0YsU0FBSyxVQUFMO0FBQ0UsYUFBTyxZQUFQOztBQUNGLFNBQUssV0FBTDtBQUNFLGFBQU8sWUFBUDtBQVpKOztBQWVBLE1BQ0VDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjRixTQUFkLEtBQ0FDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjRixTQUFkLEVBQXlCRyxNQUF6QixJQUFtQyxTQUZyQyxFQUdFO0FBQ0FILElBQUFBLFNBQVMsR0FBRyxRQUFRQSxTQUFwQjtBQUNELEdBTEQsTUFLTyxJQUNMQyxNQUFNLENBQUNDLE1BQVAsQ0FBY0YsU0FBZCxLQUNBQyxNQUFNLENBQUNDLE1BQVAsQ0FBY0YsU0FBZCxFQUF5QkksSUFBekIsSUFBaUMsU0FGNUIsRUFHTDtBQUNBSixJQUFBQSxTQUFTLEdBQUcsUUFBUUEsU0FBcEI7QUFDRDs7QUFFRCxTQUFPQSxTQUFQO0FBQ0QsQ0E5QkQ7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T2ZsRCxFQUFBQSxtQkFQZTtBQVFmNEksRUFBQUE7QUFSZSxDQUFqQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBsb2cgZnJvbSAnLi4vLi4vLi4vbG9nZ2VyJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG52YXIgbW9uZ29kYiA9IHJlcXVpcmUoJ21vbmdvZGInKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcblxuY29uc3QgdHJhbnNmb3JtS2V5ID0gKGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIHN3aXRjaCAoZmllbGROYW1lKSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgICAgcmV0dXJuICdfaWQnO1xuICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgICByZXR1cm4gJ19jcmVhdGVkX2F0JztcbiAgICBjYXNlICd1cGRhdGVkQXQnOlxuICAgICAgcmV0dXJuICdfdXBkYXRlZF9hdCc7XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiAnX3Nlc3Npb25fdG9rZW4nO1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICAgIHJldHVybiAnX2xhc3RfdXNlZCc7XG4gICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICAgIHJldHVybiAndGltZXNfdXNlZCc7XG4gIH1cblxuICBpZiAoXG4gICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLl9fdHlwZSA9PSAnUG9pbnRlcidcbiAgKSB7XG4gICAgZmllbGROYW1lID0gJ19wXycgKyBmaWVsZE5hbWU7XG4gIH0gZWxzZSBpZiAoXG4gICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInXG4gICkge1xuICAgIGZpZWxkTmFtZSA9ICdfcF8nICsgZmllbGROYW1lO1xuICB9XG5cbiAgcmV0dXJuIGZpZWxkTmFtZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUtleVZhbHVlRm9yVXBkYXRlID0gKFxuICBjbGFzc05hbWUsXG4gIHJlc3RLZXksXG4gIHJlc3RWYWx1ZSxcbiAgcGFyc2VGb3JtYXRTY2hlbWFcbikgPT4ge1xuICAvLyBDaGVjayBpZiB0aGUgc2NoZW1hIGlzIGtub3duIHNpbmNlIGl0J3MgYSBidWlsdC1pbiBmaWVsZC5cbiAgdmFyIGtleSA9IHJlc3RLZXk7XG4gIHZhciB0aW1lRmllbGQgPSBmYWxzZTtcbiAgc3dpdGNoIChrZXkpIHtcbiAgICBjYXNlICdvYmplY3RJZCc6XG4gICAgY2FzZSAnX2lkJzpcbiAgICAgIGlmIChbJ19HbG9iYWxDb25maWcnLCAnX0dyYXBoUUxDb25maWcnXS5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiBrZXksXG4gICAgICAgICAgdmFsdWU6IHBhcnNlSW50KHJlc3RWYWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2lkJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgY2FzZSAnX2NyZWF0ZWRfYXQnOlxuICAgICAga2V5ID0gJ19jcmVhdGVkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd1cGRhdGVkQXQnOlxuICAgIGNhc2UgJ191cGRhdGVkX2F0JzpcbiAgICAgIGtleSA9ICdfdXBkYXRlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICBjYXNlICdfc2Vzc2lvbl90b2tlbic6XG4gICAgICBrZXkgPSAnX3Nlc3Npb25fdG9rZW4nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICBjYXNlICdfZXhwaXJlc0F0JzpcbiAgICAgIGtleSA9ICdleHBpcmVzQXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgICBrZXkgPSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICBrZXkgPSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19ycGVybSc6XG4gICAgY2FzZSAnX3dwZXJtJzpcbiAgICAgIHJldHVybiB7IGtleToga2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnbGFzdFVzZWQnOlxuICAgIGNhc2UgJ19sYXN0X3VzZWQnOlxuICAgICAga2V5ID0gJ19sYXN0X3VzZWQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgY2FzZSAndGltZXNfdXNlZCc6XG4gICAgICBrZXkgPSAndGltZXNfdXNlZCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoXG4gICAgKHBhcnNlRm9ybWF0U2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICBwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgKCFwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgcmVzdFZhbHVlICYmXG4gICAgICByZXN0VmFsdWUuX190eXBlID09ICdQb2ludGVyJylcbiAgKSB7XG4gICAga2V5ID0gJ19wXycgKyBrZXk7XG4gIH1cblxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICB2YXIgdmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgaWYgKHZhbHVlICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICBpZiAodGltZUZpZWxkICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHZhbHVlID0gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cbiAgICBpZiAocmVzdEtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICByZXR1cm4geyBrZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIGFycmF5c1xuICBpZiAocmVzdFZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB2YWx1ZSA9IHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIHVwZGF0ZSBvcGVyYXRvcnNcbiAgaWYgKHR5cGVvZiByZXN0VmFsdWUgPT09ICdvYmplY3QnICYmICdfX29wJyBpbiByZXN0VmFsdWUpIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcihyZXN0VmFsdWUsIGZhbHNlKSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICB2YWx1ZSA9IG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICByZXR1cm4geyBrZXksIHZhbHVlIH07XG59O1xuXG5jb25zdCBpc1JlZ2V4ID0gdmFsdWUgPT4ge1xuICByZXR1cm4gdmFsdWUgJiYgdmFsdWUgaW5zdGFuY2VvZiBSZWdFeHA7XG59O1xuXG5jb25zdCBpc1N0YXJ0c1dpdGhSZWdleCA9IHZhbHVlID0+IHtcbiAgaWYgKCFpc1JlZ2V4KHZhbHVlKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS50b1N0cmluZygpLm1hdGNoKC9cXC9cXF5cXFxcUS4qXFxcXEVcXC8vKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn07XG5cbmNvbnN0IGlzQWxsVmFsdWVzUmVnZXhPck5vbmUgPSB2YWx1ZXMgPT4ge1xuICBpZiAoIXZhbHVlcyB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZXMpIHx8IHZhbHVlcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGNvbnN0IGZpcnN0VmFsdWVzSXNSZWdleCA9IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1swXSk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0pKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5jb25zdCBpc0FueVZhbHVlUmVnZXggPSB2YWx1ZXMgPT4ge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gaXNSZWdleCh2YWx1ZSk7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSA9IHJlc3RWYWx1ZSA9PiB7XG4gIGlmIChcbiAgICByZXN0VmFsdWUgIT09IG51bGwgJiZcbiAgICB0eXBlb2YgcmVzdFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgIE9iamVjdC5rZXlzKHJlc3RWYWx1ZSkuc29tZShrZXkgPT4ga2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICk7XG4gIH1cbiAgLy8gSGFuZGxlIGF0b21pYyB2YWx1ZXNcbiAgdmFyIHZhbHVlID0gdHJhbnNmb3JtSW50ZXJpb3JBdG9tKHJlc3RWYWx1ZSk7XG4gIGlmICh2YWx1ZSAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgLy8gSGFuZGxlIGFycmF5c1xuICBpZiAocmVzdFZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgfVxuXG4gIC8vIEhhbmRsZSB1cGRhdGUgb3BlcmF0b3JzXG4gIGlmICh0eXBlb2YgcmVzdFZhbHVlID09PSAnb2JqZWN0JyAmJiAnX19vcCcgaW4gcmVzdFZhbHVlKSB7XG4gICAgcmV0dXJuIHRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yKHJlc3RWYWx1ZSwgdHJ1ZSk7XG4gIH1cblxuICAvLyBIYW5kbGUgbm9ybWFsIG9iamVjdHMgYnkgcmVjdXJzaW5nXG4gIHJldHVybiBtYXBWYWx1ZXMocmVzdFZhbHVlLCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbn07XG5cbmNvbnN0IHZhbHVlQXNEYXRlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBuZXcgRGF0ZSh2YWx1ZSk7XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVF1ZXJ5S2V5VmFsdWUoY2xhc3NOYW1lLCBrZXksIHZhbHVlLCBzY2hlbWEsIGNvdW50ID0gZmFsc2UpIHtcbiAgc3dpdGNoIChrZXkpIHtcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdfY3JlYXRlZF9hdCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfY3JlYXRlZF9hdCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd1cGRhdGVkQXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdfdXBkYXRlZF9hdCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfdXBkYXRlZF9hdCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdleHBpcmVzQXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICAgICAgICAgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ29iamVjdElkJzoge1xuICAgICAgaWYgKFsnX0dsb2JhbENvbmZpZycsICdfR3JhcGhRTENvbmZpZyddLmluY2x1ZGVzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdmFsdWUgPSBwYXJzZUludCh2YWx1ZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4geyBrZXk6ICdfaWQnLCB2YWx1ZSB9O1xuICAgIH1cbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICAgICAgICAgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4geyBrZXk6ICdfc2Vzc2lvbl90b2tlbicsIHZhbHVlIH07XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICAgICAgICAgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICAgIGNhc2UgJyRvcic6XG4gICAgY2FzZSAnJGFuZCc6XG4gICAgY2FzZSAnJG5vcic6XG4gICAgICByZXR1cm4ge1xuICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgdmFsdWU6IHZhbHVlLm1hcChzdWJRdWVyeSA9PlxuICAgICAgICAgIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgc3ViUXVlcnksIHNjaGVtYSwgY291bnQpXG4gICAgICAgICksXG4gICAgICB9O1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX2xhc3RfdXNlZCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfbGFzdF91c2VkJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICByZXR1cm4geyBrZXk6ICd0aW1lc191c2VkJywgdmFsdWU6IHZhbHVlIH07XG4gICAgZGVmYXVsdDoge1xuICAgICAgLy8gT3RoZXIgYXV0aCBkYXRhXG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0ga2V5Lm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgLy8gU3BlY2lhbC1jYXNlIGF1dGggZGF0YS5cbiAgICAgICAgcmV0dXJuIHsga2V5OiBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfS5pZGAsIHZhbHVlIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZXhwZWN0ZWRUeXBlSXNBcnJheSA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0FycmF5JztcblxuICBjb25zdCBleHBlY3RlZFR5cGVJc1BvaW50ZXIgPVxuICAgIHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2ludGVyJztcblxuICBjb25zdCBmaWVsZCA9IHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV07XG4gIGlmIChcbiAgICBleHBlY3RlZFR5cGVJc1BvaW50ZXIgfHxcbiAgICAoIXNjaGVtYSAmJiB2YWx1ZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJylcbiAgKSB7XG4gICAga2V5ID0gJ19wXycgKyBrZXk7XG4gIH1cblxuICAvLyBIYW5kbGUgcXVlcnkgY29uc3RyYWludHNcbiAgY29uc3QgdHJhbnNmb3JtZWRDb25zdHJhaW50ID0gdHJhbnNmb3JtQ29uc3RyYWludCh2YWx1ZSwgZmllbGQsIGNvdW50KTtcbiAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludCAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludC4kdGV4dCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJHRleHQnLCB2YWx1ZTogdHJhbnNmb3JtZWRDb25zdHJhaW50LiR0ZXh0IH07XG4gICAgfVxuICAgIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJGVsZW1NYXRjaCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJG5vcicsIHZhbHVlOiBbeyBba2V5XTogdHJhbnNmb3JtZWRDb25zdHJhaW50IH1dIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybWVkQ29uc3RyYWludCB9O1xuICB9XG5cbiAgaWYgKGV4cGVjdGVkVHlwZUlzQXJyYXkgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHsgJGFsbDogW3RyYW5zZm9ybUludGVyaW9yQXRvbSh2YWx1ZSldIH0gfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIGlmICh0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpIH07XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYFlvdSBjYW5ub3QgdXNlICR7dmFsdWV9IGFzIGEgcXVlcnkgcGFyYW1ldGVyLmBcbiAgICApO1xuICB9XG59XG5cbi8vIE1haW4gZXhwb3NlZCBtZXRob2QgdG8gaGVscCBydW4gcXVlcmllcy5cbi8vIHJlc3RXaGVyZSBpcyB0aGUgXCJ3aGVyZVwiIGNsYXVzZSBpbiBSRVNUIEFQSSBmb3JtLlxuLy8gUmV0dXJucyB0aGUgbW9uZ28gZm9ybSBvZiB0aGUgcXVlcnkuXG5mdW5jdGlvbiB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHJlc3RXaGVyZSwgc2NoZW1hLCBjb3VudCA9IGZhbHNlKSB7XG4gIGNvbnN0IG1vbmdvV2hlcmUgPSB7fTtcbiAgZm9yIChjb25zdCByZXN0S2V5IGluIHJlc3RXaGVyZSkge1xuICAgIGNvbnN0IG91dCA9IHRyYW5zZm9ybVF1ZXJ5S2V5VmFsdWUoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICByZXN0S2V5LFxuICAgICAgcmVzdFdoZXJlW3Jlc3RLZXldLFxuICAgICAgc2NoZW1hLFxuICAgICAgY291bnRcbiAgICApO1xuICAgIG1vbmdvV2hlcmVbb3V0LmtleV0gPSBvdXQudmFsdWU7XG4gIH1cbiAgcmV0dXJuIG1vbmdvV2hlcmU7XG59XG5cbmNvbnN0IHBhcnNlT2JqZWN0S2V5VmFsdWVUb01vbmdvT2JqZWN0S2V5VmFsdWUgPSAoXG4gIHJlc3RLZXksXG4gIHJlc3RWYWx1ZSxcbiAgc2NoZW1hXG4pID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIGxldCB0cmFuc2Zvcm1lZFZhbHVlO1xuICBsZXQgY29lcmNlZFRvRGF0ZTtcbiAgc3dpdGNoIChyZXN0S2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX2lkJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICAgICAgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKVxuICAgICAgICAgIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ2V4cGlyZXNBdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICAgICA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpXG4gICAgICAgICAgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgICAgID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSlcbiAgICAgICAgICA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgICAgID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSlcbiAgICAgICAgICA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICAgICAgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKVxuICAgICAgICAgIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgY2FzZSAnX2hhc2hlZF9wYXNzd29yZCc6XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19zZXNzaW9uX3Rva2VuJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBBdXRoIGRhdGEgc2hvdWxkIGhhdmUgYmVlbiB0cmFuc2Zvcm1lZCBhbHJlYWR5XG4gICAgICBpZiAocmVzdEtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgJ2NhbiBvbmx5IHF1ZXJ5IG9uICcgKyByZXN0S2V5XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBUcnVzdCB0aGF0IHRoZSBhdXRoIGRhdGEgaGFzIGJlZW4gdHJhbnNmb3JtZWQgYW5kIHNhdmUgaXQgZGlyZWN0bHlcbiAgICAgIGlmIChyZXN0S2V5Lm1hdGNoKC9eX2F1dGhfZGF0YV9bYS16QS1aMC05X10rJC8pKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgICAgfVxuICB9XG4gIC8vc2tpcCBzdHJhaWdodCB0byB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20gZm9yIEJ5dGVzLCB0aGV5IGRvbid0IHNob3cgdXAgaW4gdGhlIHNjaGVtYSBmb3Igc29tZSByZWFzb25cbiAgaWYgKHJlc3RWYWx1ZSAmJiByZXN0VmFsdWUuX190eXBlICE9PSAnQnl0ZXMnKSB7XG4gICAgLy9Ob3RlOiBXZSBtYXkgbm90IGtub3cgdGhlIHR5cGUgb2YgYSBmaWVsZCBoZXJlLCBhcyB0aGUgdXNlciBjb3VsZCBiZSBzYXZpbmcgKG51bGwpIHRvIGEgZmllbGRcbiAgICAvL1RoYXQgbmV2ZXIgZXhpc3RlZCBiZWZvcmUsIG1lYW5pbmcgd2UgY2FuJ3QgaW5mZXIgdGhlIHR5cGUuXG4gICAgaWYgKFxuICAgICAgKHNjaGVtYS5maWVsZHNbcmVzdEtleV0gJiYgc2NoZW1hLmZpZWxkc1tyZXN0S2V5XS50eXBlID09ICdQb2ludGVyJykgfHxcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInXG4gICAgKSB7XG4gICAgICByZXN0S2V5ID0gJ19wXycgKyByZXN0S2V5O1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHZhbHVlIH07XG4gIH1cblxuICAvLyBBQ0xzIGFyZSBoYW5kbGVkIGJlZm9yZSB0aGlzIG1ldGhvZCBpcyBjYWxsZWRcbiAgLy8gSWYgYW4gQUNMIGtleSBzdGlsbCBleGlzdHMgaGVyZSwgc29tZXRoaW5nIGlzIHdyb25nLlxuICBpZiAocmVzdEtleSA9PT0gJ0FDTCcpIHtcbiAgICB0aHJvdyAnVGhlcmUgd2FzIGEgcHJvYmxlbSB0cmFuc2Zvcm1pbmcgYW4gQUNMLic7XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICBpZiAoXG4gICAgT2JqZWN0LmtleXMocmVzdFZhbHVlKS5zb21lKGtleSA9PiBrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSlcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgKTtcbiAgfVxuICB2YWx1ZSA9IG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlIH07XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUgPSAoY2xhc3NOYW1lLCByZXN0Q3JlYXRlLCBzY2hlbWEpID0+IHtcbiAgcmVzdENyZWF0ZSA9IGFkZExlZ2FjeUFDTChyZXN0Q3JlYXRlKTtcbiAgY29uc3QgbW9uZ29DcmVhdGUgPSB7fTtcbiAgZm9yIChjb25zdCByZXN0S2V5IGluIHJlc3RDcmVhdGUpIHtcbiAgICBpZiAocmVzdENyZWF0ZVtyZXN0S2V5XSAmJiByZXN0Q3JlYXRlW3Jlc3RLZXldLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHsga2V5LCB2YWx1ZSB9ID0gcGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZShcbiAgICAgIHJlc3RLZXksXG4gICAgICByZXN0Q3JlYXRlW3Jlc3RLZXldLFxuICAgICAgc2NoZW1hXG4gICAgKTtcbiAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgbW9uZ29DcmVhdGVba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVzZSB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdCBmb3IgY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXRcbiAgaWYgKG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdCkge1xuICAgIG1vbmdvQ3JlYXRlLl9jcmVhdGVkX2F0ID0gbmV3IERhdGUoXG4gICAgICBtb25nb0NyZWF0ZS5jcmVhdGVkQXQuaXNvIHx8IG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdFxuICAgICk7XG4gICAgZGVsZXRlIG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdDtcbiAgfVxuICBpZiAobW9uZ29DcmVhdGUudXBkYXRlZEF0KSB7XG4gICAgbW9uZ29DcmVhdGUuX3VwZGF0ZWRfYXQgPSBuZXcgRGF0ZShcbiAgICAgIG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdC5pc28gfHwgbW9uZ29DcmVhdGUudXBkYXRlZEF0XG4gICAgKTtcbiAgICBkZWxldGUgbW9uZ29DcmVhdGUudXBkYXRlZEF0O1xuICB9XG5cbiAgcmV0dXJuIG1vbmdvQ3JlYXRlO1xufTtcblxuLy8gTWFpbiBleHBvc2VkIG1ldGhvZCB0byBoZWxwIHVwZGF0ZSBvbGQgb2JqZWN0cy5cbmNvbnN0IHRyYW5zZm9ybVVwZGF0ZSA9IChjbGFzc05hbWUsIHJlc3RVcGRhdGUsIHBhcnNlRm9ybWF0U2NoZW1hKSA9PiB7XG4gIGNvbnN0IG1vbmdvVXBkYXRlID0ge307XG4gIGNvbnN0IGFjbCA9IGFkZExlZ2FjeUFDTChyZXN0VXBkYXRlKTtcbiAgaWYgKGFjbC5fcnBlcm0gfHwgYWNsLl93cGVybSB8fCBhY2wuX2FjbCkge1xuICAgIG1vbmdvVXBkYXRlLiRzZXQgPSB7fTtcbiAgICBpZiAoYWNsLl9ycGVybSkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fcnBlcm0gPSBhY2wuX3JwZXJtO1xuICAgIH1cbiAgICBpZiAoYWNsLl93cGVybSkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fd3Blcm0gPSBhY2wuX3dwZXJtO1xuICAgIH1cbiAgICBpZiAoYWNsLl9hY2wpIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX2FjbCA9IGFjbC5fYWNsO1xuICAgIH1cbiAgfVxuICBmb3IgKHZhciByZXN0S2V5IGluIHJlc3RVcGRhdGUpIHtcbiAgICBpZiAocmVzdFVwZGF0ZVtyZXN0S2V5XSAmJiByZXN0VXBkYXRlW3Jlc3RLZXldLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHZhciBvdXQgPSB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZShcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RLZXksXG4gICAgICByZXN0VXBkYXRlW3Jlc3RLZXldLFxuICAgICAgcGFyc2VGb3JtYXRTY2hlbWFcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG91dHB1dCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbnkgJCBrZXlzLCBpdCdzIGFuXG4gICAgLy8gb3BlcmF0b3IgdGhhdCBuZWVkcyB0byBiZSBsaWZ0ZWQgb250byB0aGUgdG9wIGxldmVsIHVwZGF0ZVxuICAgIC8vIG9iamVjdC5cbiAgICBpZiAodHlwZW9mIG91dC52YWx1ZSA9PT0gJ29iamVjdCcgJiYgb3V0LnZhbHVlICE9PSBudWxsICYmIG91dC52YWx1ZS5fX29wKSB7XG4gICAgICBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF0gPSBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF0gfHwge307XG4gICAgICBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF1bb3V0LmtleV0gPSBvdXQudmFsdWUuYXJnO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb1VwZGF0ZVsnJHNldCddID0gbW9uZ29VcGRhdGVbJyRzZXQnXSB8fCB7fTtcbiAgICAgIG1vbmdvVXBkYXRlWyckc2V0J11bb3V0LmtleV0gPSBvdXQudmFsdWU7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1vbmdvVXBkYXRlO1xufTtcblxuLy8gQWRkIHRoZSBsZWdhY3kgX2FjbCBmb3JtYXQuXG5jb25zdCBhZGRMZWdhY3lBQ0wgPSByZXN0T2JqZWN0ID0+IHtcbiAgY29uc3QgcmVzdE9iamVjdENvcHkgPSB7IC4uLnJlc3RPYmplY3QgfTtcbiAgY29uc3QgX2FjbCA9IHt9O1xuXG4gIGlmIChyZXN0T2JqZWN0Ll93cGVybSkge1xuICAgIHJlc3RPYmplY3QuX3dwZXJtLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgX2FjbFtlbnRyeV0gPSB7IHc6IHRydWUgfTtcbiAgICB9KTtcbiAgICByZXN0T2JqZWN0Q29weS5fYWNsID0gX2FjbDtcbiAgfVxuXG4gIGlmIChyZXN0T2JqZWN0Ll9ycGVybSkge1xuICAgIHJlc3RPYmplY3QuX3JwZXJtLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCEoZW50cnkgaW4gX2FjbCkpIHtcbiAgICAgICAgX2FjbFtlbnRyeV0gPSB7IHI6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIF9hY2xbZW50cnldLnIgPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJlc3RPYmplY3RDb3B5Ll9hY2wgPSBfYWNsO1xuICB9XG5cbiAgcmV0dXJuIHJlc3RPYmplY3RDb3B5O1xufTtcblxuLy8gQSBzZW50aW5lbCB2YWx1ZSB0aGF0IGhlbHBlciB0cmFuc2Zvcm1hdGlvbnMgcmV0dXJuIHdoZW4gdGhleVxuLy8gY2Fubm90IHBlcmZvcm0gYSB0cmFuc2Zvcm1hdGlvblxuZnVuY3Rpb24gQ2Fubm90VHJhbnNmb3JtKCkge31cblxuY29uc3QgdHJhbnNmb3JtSW50ZXJpb3JBdG9tID0gYXRvbSA9PiB7XG4gIC8vIFRPRE86IGNoZWNrIHZhbGlkaXR5IGhhcmRlciBmb3IgdGhlIF9fdHlwZS1kZWZpbmVkIHR5cGVzXG4gIGlmIChcbiAgICB0eXBlb2YgYXRvbSA9PT0gJ29iamVjdCcgJiZcbiAgICBhdG9tICYmXG4gICAgIShhdG9tIGluc3RhbmNlb2YgRGF0ZSkgJiZcbiAgICBhdG9tLl9fdHlwZSA9PT0gJ1BvaW50ZXInXG4gICkge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogYXRvbS5jbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogYXRvbS5vYmplY3RJZCxcbiAgICB9O1xuICB9IGVsc2UgaWYgKHR5cGVvZiBhdG9tID09PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiBhdG9tID09PSAnc3ltYm9sJykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGBjYW5ub3QgdHJhbnNmb3JtIHZhbHVlOiAke2F0b219YFxuICAgICk7XG4gIH0gZWxzZSBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIERhdGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgfSBlbHNlIGlmIChCeXRlc0NvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIEJ5dGVzQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGF0b20gPT09ICdvYmplY3QnICYmIGF0b20gJiYgYXRvbS4kcmVnZXggIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBuZXcgUmVnRXhwKGF0b20uJHJlZ2V4KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYXRvbTtcbiAgfVxufTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIHRyYW5zZm9ybSBhbiBhdG9tIGZyb20gUkVTVCBmb3JtYXQgdG8gTW9uZ28gZm9ybWF0LlxuLy8gQW4gYXRvbSBpcyBhbnl0aGluZyB0aGF0IGNhbid0IGNvbnRhaW4gb3RoZXIgZXhwcmVzc2lvbnMuIFNvIGl0XG4vLyBpbmNsdWRlcyB0aGluZ3Mgd2hlcmUgb2JqZWN0cyBhcmUgdXNlZCB0byByZXByZXNlbnQgb3RoZXJcbi8vIGRhdGF0eXBlcywgbGlrZSBwb2ludGVycyBhbmQgZGF0ZXMsIGJ1dCBpdCBkb2VzIG5vdCBpbmNsdWRlIG9iamVjdHNcbi8vIG9yIGFycmF5cyB3aXRoIGdlbmVyaWMgc3R1ZmYgaW5zaWRlLlxuLy8gUmFpc2VzIGFuIGVycm9yIGlmIHRoaXMgY2Fubm90IHBvc3NpYmx5IGJlIHZhbGlkIFJFU1QgZm9ybWF0LlxuLy8gUmV0dXJucyBDYW5ub3RUcmFuc2Zvcm0gaWYgaXQncyBqdXN0IG5vdCBhbiBhdG9tXG5mdW5jdGlvbiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20oYXRvbSwgZmllbGQpIHtcbiAgc3dpdGNoICh0eXBlb2YgYXRvbSkge1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBhdG9tO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHtmaWVsZC50YXJnZXRDbGFzc30kJHthdG9tfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYXRvbTtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgY2Fubm90IHRyYW5zZm9ybSB2YWx1ZTogJHthdG9tfWBcbiAgICAgICk7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChhdG9tIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAvLyBUZWNobmljYWxseSBkYXRlcyBhcmUgbm90IHJlc3QgZm9ybWF0LCBidXQsIGl0IHNlZW1zIHByZXR0eVxuICAgICAgICAvLyBjbGVhciB3aGF0IHRoZXkgc2hvdWxkIGJlIHRyYW5zZm9ybWVkIHRvLCBzbyBsZXQncyBqdXN0IGRvIGl0LlxuICAgICAgICByZXR1cm4gYXRvbTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF0b20gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIGF0b207XG4gICAgICB9XG5cbiAgICAgIC8vIFRPRE86IGNoZWNrIHZhbGlkaXR5IGhhcmRlciBmb3IgdGhlIF9fdHlwZS1kZWZpbmVkIHR5cGVzXG4gICAgICBpZiAoYXRvbS5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHthdG9tLmNsYXNzTmFtZX0kJHthdG9tLm9iamVjdElkfWA7XG4gICAgICB9XG4gICAgICBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBEYXRlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBHZW9Qb2ludENvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKFBvbHlnb25Db2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gUG9seWdvbkNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEZpbGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gRmlsZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBJIGRvbid0IHRoaW5rIHR5cGVvZiBjYW4gZXZlciBsZXQgdXMgZ2V0IGhlcmVcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICBgcmVhbGx5IGRpZCBub3QgZXhwZWN0IHZhbHVlOiAke2F0b219YFxuICAgICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWxhdGl2ZVRpbWVUb0RhdGUodGV4dCwgbm93ID0gbmV3IERhdGUoKSkge1xuICB0ZXh0ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuXG4gIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoJyAnKTtcblxuICAvLyBGaWx0ZXIgb3V0IHdoaXRlc3BhY2VcbiAgcGFydHMgPSBwYXJ0cy5maWx0ZXIocGFydCA9PiBwYXJ0ICE9PSAnJyk7XG5cbiAgY29uc3QgZnV0dXJlID0gcGFydHNbMF0gPT09ICdpbic7XG4gIGNvbnN0IHBhc3QgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSA9PT0gJ2Fnbyc7XG5cbiAgaWYgKCFmdXR1cmUgJiYgIXBhc3QgJiYgdGV4dCAhPT0gJ25vdycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgaW5mbzogXCJUaW1lIHNob3VsZCBlaXRoZXIgc3RhcnQgd2l0aCAnaW4nIG9yIGVuZCB3aXRoICdhZ28nXCIsXG4gICAgfTtcbiAgfVxuXG4gIGlmIChmdXR1cmUgJiYgcGFzdCkge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICBpbmZvOiBcIlRpbWUgY2Fubm90IGhhdmUgYm90aCAnaW4nIGFuZCAnYWdvJ1wiLFxuICAgIH07XG4gIH1cblxuICAvLyBzdHJpcCB0aGUgJ2Fnbycgb3IgJ2luJ1xuICBpZiAoZnV0dXJlKSB7XG4gICAgcGFydHMgPSBwYXJ0cy5zbGljZSgxKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBwYXN0XG4gICAgcGFydHMgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIGlmIChwYXJ0cy5sZW5ndGggJSAyICE9PSAwICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgIGluZm86ICdJbnZhbGlkIHRpbWUgc3RyaW5nLiBEYW5nbGluZyB1bml0IG9yIG51bWJlci4nLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBwYWlycyA9IFtdO1xuICB3aGlsZSAocGFydHMubGVuZ3RoKSB7XG4gICAgcGFpcnMucHVzaChbcGFydHMuc2hpZnQoKSwgcGFydHMuc2hpZnQoKV0pO1xuICB9XG5cbiAgbGV0IHNlY29uZHMgPSAwO1xuICBmb3IgKGNvbnN0IFtudW0sIGludGVydmFsXSBvZiBwYWlycykge1xuICAgIGNvbnN0IHZhbCA9IE51bWJlcihudW0pO1xuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih2YWwpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86IGAnJHtudW19JyBpcyBub3QgYW4gaW50ZWdlci5gLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBzd2l0Y2ggKGludGVydmFsKSB7XG4gICAgICBjYXNlICd5cic6XG4gICAgICBjYXNlICd5cnMnOlxuICAgICAgY2FzZSAneWVhcic6XG4gICAgICBjYXNlICd5ZWFycyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsICogMzE1MzYwMDA7IC8vIDM2NSAqIDI0ICogNjAgKiA2MFxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnd2snOlxuICAgICAgY2FzZSAnd2tzJzpcbiAgICAgIGNhc2UgJ3dlZWsnOlxuICAgICAgY2FzZSAnd2Vla3MnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDYwNDgwMDsgLy8gNyAqIDI0ICogNjAgKiA2MFxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnZCc6XG4gICAgICBjYXNlICdkYXknOlxuICAgICAgY2FzZSAnZGF5cyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsICogODY0MDA7IC8vIDI0ICogNjAgKiA2MFxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnaHInOlxuICAgICAgY2FzZSAnaHJzJzpcbiAgICAgIGNhc2UgJ2hvdXInOlxuICAgICAgY2FzZSAnaG91cnMnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDM2MDA7IC8vIDYwICogNjBcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ21pbic6XG4gICAgICBjYXNlICdtaW5zJzpcbiAgICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgICBjYXNlICdtaW51dGVzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA2MDtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ3NlYyc6XG4gICAgICBjYXNlICdzZWNzJzpcbiAgICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgICBjYXNlICdzZWNvbmRzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWw7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgICBpbmZvOiBgSW52YWxpZCBpbnRlcnZhbDogJyR7aW50ZXJ2YWx9J2AsXG4gICAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgbWlsbGlzZWNvbmRzID0gc2Vjb25kcyAqIDEwMDA7XG4gIGlmIChmdXR1cmUpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICBpbmZvOiAnZnV0dXJlJyxcbiAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSArIG1pbGxpc2Vjb25kcyksXG4gICAgfTtcbiAgfSBlbHNlIGlmIChwYXN0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgaW5mbzogJ3Bhc3QnLFxuICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpIC0gbWlsbGlzZWNvbmRzKSxcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgIGluZm86ICdwcmVzZW50JyxcbiAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSksXG4gICAgfTtcbiAgfVxufVxuXG4vLyBUcmFuc2Zvcm1zIGEgcXVlcnkgY29uc3RyYWludCBmcm9tIFJFU1QgQVBJIGZvcm1hdCB0byBNb25nbyBmb3JtYXQuXG4vLyBBIGNvbnN0cmFpbnQgaXMgc29tZXRoaW5nIHdpdGggZmllbGRzIGxpa2UgJGx0LlxuLy8gSWYgaXQgaXMgbm90IGEgdmFsaWQgY29uc3RyYWludCBidXQgaXQgY291bGQgYmUgYSB2YWxpZCBzb21ldGhpbmdcbi8vIGVsc2UsIHJldHVybiBDYW5ub3RUcmFuc2Zvcm0uXG4vLyBpbkFycmF5IGlzIHdoZXRoZXIgdGhpcyBpcyBhbiBhcnJheSBmaWVsZC5cbmZ1bmN0aW9uIHRyYW5zZm9ybUNvbnN0cmFpbnQoY29uc3RyYWludCwgZmllbGQsIGNvdW50ID0gZmFsc2UpIHtcbiAgY29uc3QgaW5BcnJheSA9IGZpZWxkICYmIGZpZWxkLnR5cGUgJiYgZmllbGQudHlwZSA9PT0gJ0FycmF5JztcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50ICE9PSAnb2JqZWN0JyB8fCAhY29uc3RyYWludCkge1xuICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG4gIH1cbiAgY29uc3QgdHJhbnNmb3JtRnVuY3Rpb24gPSBpbkFycmF5XG4gICAgPyB0cmFuc2Zvcm1JbnRlcmlvckF0b21cbiAgICA6IHRyYW5zZm9ybVRvcExldmVsQXRvbTtcbiAgY29uc3QgdHJhbnNmb3JtZXIgPSBhdG9tID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB0cmFuc2Zvcm1GdW5jdGlvbihhdG9tLCBmaWVsZCk7XG4gICAgaWYgKHJlc3VsdCA9PT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYGJhZCBhdG9tOiAke0pTT04uc3RyaW5naWZ5KGF0b20pfWBcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG4gIC8vIGtleXMgaXMgdGhlIGNvbnN0cmFpbnRzIGluIHJldmVyc2UgYWxwaGFiZXRpY2FsIG9yZGVyLlxuICAvLyBUaGlzIGlzIGEgaGFjayBzbyB0aGF0OlxuICAvLyAgICRyZWdleCBpcyBoYW5kbGVkIGJlZm9yZSAkb3B0aW9uc1xuICAvLyAgICRuZWFyU3BoZXJlIGlzIGhhbmRsZWQgYmVmb3JlICRtYXhEaXN0YW5jZVxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGNvbnN0cmFpbnQpXG4gICAgLnNvcnQoKVxuICAgIC5yZXZlcnNlKCk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IG9mIGtleXMpIHtcbiAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgY2FzZSAnJGx0JzpcbiAgICAgIGNhc2UgJyRsdGUnOlxuICAgICAgY2FzZSAnJGd0JzpcbiAgICAgIGNhc2UgJyRndGUnOlxuICAgICAgY2FzZSAnJGV4aXN0cyc6XG4gICAgICBjYXNlICckbmUnOlxuICAgICAgY2FzZSAnJGVxJzoge1xuICAgICAgICBjb25zdCB2YWwgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh2YWwgJiYgdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgdmFsLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSAhPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIERhdGUgZmllbGQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICckZXhpc3RzJzpcbiAgICAgICAgICAgIGNhc2UgJyRuZSc6XG4gICAgICAgICAgICBjYXNlICckZXEnOlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZXJSZXN1bHQgPSByZWxhdGl2ZVRpbWVUb0RhdGUodmFsLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgIGlmIChwYXJzZXJSZXN1bHQuc3RhdHVzID09PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIGFuc3dlcltrZXldID0gcGFyc2VyUmVzdWx0LnJlc3VsdDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGxvZy5pbmZvKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtrZXl9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFuc3dlcltrZXldID0gdHJhbnNmb3JtZXIodmFsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGNhc2UgJyRpbic6XG4gICAgICBjYXNlICckbmluJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJyArIGtleSArICcgdmFsdWUnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IF8uZmxhdE1hcChhcnIsIHZhbHVlID0+IHtcbiAgICAgICAgICByZXR1cm4gKGF0b20gPT4ge1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXRvbSkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcCh0cmFuc2Zvcm1lcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gdHJhbnNmb3JtZXIoYXRvbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkodmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckYWxsJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJyArIGtleSArICcgdmFsdWUnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IGFyci5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcblxuICAgICAgICBjb25zdCB2YWx1ZXMgPSBhbnN3ZXJba2V5XTtcbiAgICAgICAgaWYgKGlzQW55VmFsdWVSZWdleCh2YWx1ZXMpICYmICFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKHZhbHVlcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgdmFsdWVzXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJHJlZ2V4JzpcbiAgICAgICAgdmFyIHMgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh0eXBlb2YgcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIHJlZ2V4OiAnICsgcyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBzO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJGNvbnRhaW5lZEJ5Jzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJGNvbnRhaW5lZEJ5OiBzaG91bGQgYmUgYW4gYXJyYXlgXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXIuJGVsZW1NYXRjaCA9IHtcbiAgICAgICAgICAkbmluOiBhcnIubWFwKHRyYW5zZm9ybWVyKSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckb3B0aW9ucyc6XG4gICAgICAgIGFuc3dlcltrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJHRleHQnOiB7XG4gICAgICAgIGNvbnN0IHNlYXJjaCA9IGNvbnN0cmFpbnRba2V5XS4kc2VhcmNoO1xuICAgICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2BcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJHNlYXJjaDogc2VhcmNoLiR0ZXJtLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJlxuICAgICAgICAgIHR5cGVvZiBzZWFyY2guJGNhc2VTZW5zaXRpdmUgIT09ICdib29sZWFuJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kY2FzZVNlbnNpdGl2ZSA9IHNlYXJjaC4kY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiZcbiAgICAgICAgICB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGRpYWNyaXRpY1NlbnNpdGl2ZSA9IHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG5lYXJTcGhlcmUnOiB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICBhbnN3ZXIuJGdlb1dpdGhpbiA9IHtcbiAgICAgICAgICAgICRjZW50ZXJTcGhlcmU6IFtcbiAgICAgICAgICAgICAgW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLFxuICAgICAgICAgICAgICBjb25zdHJhaW50LiRtYXhEaXN0YW5jZSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZSc6IHtcbiAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgLy8gVGhlIFNES3MgZG9uJ3Qgc2VlbSB0byB1c2UgdGhlc2UgYnV0IHRoZXkgYXJlIGRvY3VtZW50ZWQgaW4gdGhlXG4gICAgICAvLyBSRVNUIEFQSSBkb2NzLlxuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5SYWRpYW5zJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJbk1pbGVzJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XSAvIDM5NTk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XSAvIDYzNzE7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckc2VsZWN0JzpcbiAgICAgIGNhc2UgJyRkb250U2VsZWN0JzpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgJ3RoZSAnICsga2V5ICsgJyBjb25zdHJhaW50IGlzIG5vdCBzdXBwb3J0ZWQgeWV0J1xuICAgICAgICApO1xuXG4gICAgICBjYXNlICckd2l0aGluJzpcbiAgICAgICAgdmFyIGJveCA9IGNvbnN0cmFpbnRba2V5XVsnJGJveCddO1xuICAgICAgICBpZiAoIWJveCB8fCBib3gubGVuZ3RoICE9IDIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnbWFsZm9ybWF0dGVkICR3aXRoaW4gYXJnJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgJGJveDogW1xuICAgICAgICAgICAgW2JveFswXS5sb25naXR1ZGUsIGJveFswXS5sYXRpdHVkZV0sXG4gICAgICAgICAgICBbYm94WzFdLmxvbmdpdHVkZSwgYm94WzFdLmxhdGl0dWRlXSxcbiAgICAgICAgICBdLFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJGdlb1dpdGhpbic6IHtcbiAgICAgICAgY29uc3QgcG9seWdvbiA9IGNvbnN0cmFpbnRba2V5XVsnJHBvbHlnb24nXTtcbiAgICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gY29uc3RyYWludFtrZXldWyckY2VudGVyU3BoZXJlJ107XG4gICAgICAgIGlmIChwb2x5Z29uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsZXQgcG9pbnRzO1xuICAgICAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgICAgIH0gZWxzZSBpZiAocG9seWdvbiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwb2ludHMgPSBwb2ludHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHBvaW50O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZSdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV07XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgICAkcG9seWdvbjogcG9pbnRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSBpZiAoY2VudGVyU3BoZXJlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRjZW50ZXJTcGhlcmU6IFtbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sIGRpc3RhbmNlXSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb0ludGVyc2VjdHMnOiB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gY29uc3RyYWludFtrZXldWyckcG9pbnQnXTtcbiAgICAgICAgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAkZ2VvbWV0cnk6IHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludCcsXG4gICAgICAgICAgICBjb29yZGluYXRlczogW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGtleS5tYXRjaCgvXlxcJCsvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgY29uc3RyYWludDogJyArIGtleVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gVHJhbnNmb3JtcyBhbiB1cGRhdGUgb3BlcmF0b3IgZnJvbSBSRVNUIGZvcm1hdCB0byBtb25nbyBmb3JtYXQuXG4vLyBUbyBiZSB0cmFuc2Zvcm1lZCwgdGhlIGlucHV0IHNob3VsZCBoYXZlIGFuIF9fb3AgZmllbGQuXG4vLyBJZiBmbGF0dGVuIGlzIHRydWUsIHRoaXMgd2lsbCBmbGF0dGVuIG9wZXJhdG9ycyB0byB0aGVpciBzdGF0aWNcbi8vIGRhdGEgZm9ybWF0LiBGb3IgZXhhbXBsZSwgYW4gaW5jcmVtZW50IG9mIDIgd291bGQgc2ltcGx5IGJlY29tZSBhXG4vLyAyLlxuLy8gVGhlIG91dHB1dCBmb3IgYSBub24tZmxhdHRlbmVkIG9wZXJhdG9yIGlzIGEgaGFzaCB3aXRoIF9fb3AgYmVpbmdcbi8vIHRoZSBtb25nbyBvcCwgYW5kIGFyZyBiZWluZyB0aGUgYXJndW1lbnQuXG4vLyBUaGUgb3V0cHV0IGZvciBhIGZsYXR0ZW5lZCBvcGVyYXRvciBpcyBqdXN0IGEgdmFsdWUuXG4vLyBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGlzIHNob3VsZCBiZSBhIG5vLW9wLlxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcih7IF9fb3AsIGFtb3VudCwgb2JqZWN0cyB9LCBmbGF0dGVuKSB7XG4gIHN3aXRjaCAoX19vcCkge1xuICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyR1bnNldCcsIGFyZzogJycgfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICBpZiAodHlwZW9mIGFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnaW5jcmVtZW50aW5nIG11c3QgcHJvdmlkZSBhIG51bWJlcidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiBhbW91bnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJGluYycsIGFyZzogYW1vdW50IH07XG4gICAgICB9XG5cbiAgICBjYXNlICdBZGQnOlxuICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBpZiAoIShvYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB2YXIgdG9BZGQgPSBvYmplY3RzLm1hcCh0cmFuc2Zvcm1JbnRlcmlvckF0b20pO1xuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIHRvQWRkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIG1vbmdvT3AgPSB7XG4gICAgICAgICAgQWRkOiAnJHB1c2gnLFxuICAgICAgICAgIEFkZFVuaXF1ZTogJyRhZGRUb1NldCcsXG4gICAgICAgIH1bX19vcF07XG4gICAgICAgIHJldHVybiB7IF9fb3A6IG1vbmdvT3AsIGFyZzogeyAkZWFjaDogdG9BZGQgfSB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgIGlmICghKG9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnb2JqZWN0cyB0byByZW1vdmUgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHZhciB0b1JlbW92ZSA9IG9iamVjdHMubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJHB1bGxBbGwnLCBhcmc6IHRvUmVtb3ZlIH07XG4gICAgICB9XG5cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICBgVGhlICR7X19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgKTtcbiAgfVxufVxuZnVuY3Rpb24gbWFwVmFsdWVzKG9iamVjdCwgaXRlcmF0b3IpIHtcbiAgY29uc3QgcmVzdWx0ID0ge307XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgIHJlc3VsdFtrZXldID0gaXRlcmF0b3Iob2JqZWN0W2tleV0pO1xuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuY29uc3QgbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0ID0gbW9uZ29PYmplY3QgPT4ge1xuICBzd2l0Y2ggKHR5cGVvZiBtb25nb09iamVjdCkge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgJ2JhZCB2YWx1ZSBpbiBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QnO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAobW9uZ29PYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QubWFwKG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIFBhcnNlLl9lbmNvZGUobW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkxvbmcpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnRvTnVtYmVyKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuRG91YmxlKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KG1vbmdvT2JqZWN0KSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTihtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG1vbmdvT2JqZWN0LCAnX190eXBlJykgJiZcbiAgICAgICAgbW9uZ29PYmplY3QuX190eXBlID09ICdEYXRlJyAmJlxuICAgICAgICBtb25nb09iamVjdC5pc28gaW5zdGFuY2VvZiBEYXRlXG4gICAgICApIHtcbiAgICAgICAgbW9uZ29PYmplY3QuaXNvID0gbW9uZ29PYmplY3QuaXNvLnRvSlNPTigpO1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3Q7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBtYXBWYWx1ZXMobW9uZ29PYmplY3QsIG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICd1bmtub3duIGpzIHR5cGUnO1xuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nID0gKHNjaGVtYSwgZmllbGQsIHBvaW50ZXJTdHJpbmcpID0+IHtcbiAgY29uc3Qgb2JqRGF0YSA9IHBvaW50ZXJTdHJpbmcuc3BsaXQoJyQnKTtcbiAgaWYgKG9iakRhdGFbMF0gIT09IHNjaGVtYS5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzKSB7XG4gICAgdGhyb3cgJ3BvaW50ZXIgdG8gaW5jb3JyZWN0IGNsYXNzTmFtZSc7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICBjbGFzc05hbWU6IG9iakRhdGFbMF0sXG4gICAgb2JqZWN0SWQ6IG9iakRhdGFbMV0sXG4gIH07XG59O1xuXG4vLyBDb252ZXJ0cyBmcm9tIGEgbW9uZ28tZm9ybWF0IG9iamVjdCB0byBhIFJFU1QtZm9ybWF0IG9iamVjdC5cbi8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG5jb25zdCBtb25nb09iamVjdFRvUGFyc2VPYmplY3QgPSAoY2xhc3NOYW1lLCBtb25nb09iamVjdCwgc2NoZW1hKSA9PiB7XG4gIHN3aXRjaCAodHlwZW9mIG1vbmdvT2JqZWN0KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gbW9uZ29PYmplY3Q7XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICB0aHJvdyAnYmFkIHZhbHVlIGluIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCc7XG4gICAgY2FzZSAnb2JqZWN0Jzoge1xuICAgICAgaWYgKG1vbmdvT2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0Lm1hcChuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHJldHVybiBQYXJzZS5fZW5jb2RlKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Mb25nKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC50b051bWJlcigpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkRvdWJsZSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudmFsdWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChCeXRlc0NvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdChtb25nb09iamVjdCkpIHtcbiAgICAgICAgcmV0dXJuIEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04obW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN0T2JqZWN0ID0ge307XG4gICAgICBpZiAobW9uZ29PYmplY3QuX3JwZXJtIHx8IG1vbmdvT2JqZWN0Ll93cGVybSkge1xuICAgICAgICByZXN0T2JqZWN0Ll9ycGVybSA9IG1vbmdvT2JqZWN0Ll9ycGVybSB8fCBbXTtcbiAgICAgICAgcmVzdE9iamVjdC5fd3Blcm0gPSBtb25nb09iamVjdC5fd3Blcm0gfHwgW107XG4gICAgICAgIGRlbGV0ZSBtb25nb09iamVjdC5fcnBlcm07XG4gICAgICAgIGRlbGV0ZSBtb25nb09iamVjdC5fd3Blcm07XG4gICAgICB9XG5cbiAgICAgIGZvciAodmFyIGtleSBpbiBtb25nb09iamVjdCkge1xuICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgIGNhc2UgJ19pZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydvYmplY3RJZCddID0gJycgKyBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2hhc2hlZF9wYXNzd29yZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQgPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2FjbCc6XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuJzpcbiAgICAgICAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbic6XG4gICAgICAgICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgICAgIGNhc2UgJ190b21ic3RvbmUnOlxuICAgICAgICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgICAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgICAgICBjYXNlICdfcGFzc3dvcmRfaGlzdG9yeSc6XG4gICAgICAgICAgICAvLyBUaG9zZSBrZXlzIHdpbGwgYmUgZGVsZXRlZCBpZiBuZWVkZWQgaW4gdGhlIERCIENvbnRyb2xsZXJcbiAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfc2Vzc2lvbl90b2tlbic6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydzZXNzaW9uVG9rZW4nXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICd1cGRhdGVkQXQnOlxuICAgICAgICAgIGNhc2UgJ191cGRhdGVkX2F0JzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ3VwZGF0ZWRBdCddID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgICAgICAgbmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSlcbiAgICAgICAgICAgICkuaXNvO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgICAgICBjYXNlICdfY3JlYXRlZF9hdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydjcmVhdGVkQXQnXSA9IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgICAgICAgIG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pXG4gICAgICAgICAgICApLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICAgICAgY2FzZSAnX2V4cGlyZXNBdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydleHBpcmVzQXQnXSA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnbGFzdFVzZWQnOlxuICAgICAgICAgIGNhc2UgJ19sYXN0X3VzZWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnbGFzdFVzZWQnXSA9IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgICAgICAgIG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pXG4gICAgICAgICAgICApLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICAgICAgY2FzZSAndGltZXNfdXNlZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Wyd0aW1lc1VzZWQnXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gQ2hlY2sgb3RoZXIgYXV0aCBkYXRhIGtleXNcbiAgICAgICAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0ga2V5Lm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICAgICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddID0gcmVzdE9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgICAgICAgcmVzdE9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGtleS5pbmRleE9mKCdfcF8nKSA9PSAwKSB7XG4gICAgICAgICAgICAgIHZhciBuZXdLZXkgPSBrZXkuc3Vic3RyaW5nKDMpO1xuICAgICAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbbmV3S2V5XSkge1xuICAgICAgICAgICAgICAgIGxvZy5pbmZvKFxuICAgICAgICAgICAgICAgICAgJ3RyYW5zZm9ybS5qcycsXG4gICAgICAgICAgICAgICAgICAnRm91bmQgYSBwb2ludGVyIGNvbHVtbiBub3QgaW4gdGhlIHNjaGVtYSwgZHJvcHBpbmcgaXQuJyxcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG5ld0tleVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbbmV3S2V5XS50eXBlICE9PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICAgICAgICBsb2cuaW5mbyhcbiAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0uanMnLFxuICAgICAgICAgICAgICAgICAgJ0ZvdW5kIGEgcG9pbnRlciBpbiBhIG5vbi1wb2ludGVyIGNvbHVtbiwgZHJvcHBpbmcgaXQuJyxcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIGtleVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1vbmdvT2JqZWN0W2tleV0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXN0T2JqZWN0W25ld0tleV0gPSB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nKFxuICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICBuZXdLZXksXG4gICAgICAgICAgICAgICAgbW9uZ29PYmplY3Rba2V5XVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5WzBdID09ICdfJyAmJiBrZXkgIT0gJ19fdHlwZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgJ2JhZCBrZXkgaW4gdW50cmFuc2Zvcm06ICcgKyBrZXk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdGaWxlJyAmJlxuICAgICAgICAgICAgICAgIEZpbGVDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEZpbGVDb2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnICYmXG4gICAgICAgICAgICAgICAgR2VvUG9pbnRDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEdlb1BvaW50Q29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ1BvbHlnb24nICYmXG4gICAgICAgICAgICAgICAgUG9seWdvbkNvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gUG9seWdvbkNvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdCeXRlcycgJiZcbiAgICAgICAgICAgICAgICBCeXRlc0NvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdChcbiAgICAgICAgICAgICAgbW9uZ29PYmplY3Rba2V5XVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGRzID0ge307XG4gICAgICByZWxhdGlvbkZpZWxkTmFtZXMuZm9yRWFjaChyZWxhdGlvbkZpZWxkTmFtZSA9PiB7XG4gICAgICAgIHJlbGF0aW9uRmllbGRzW3JlbGF0aW9uRmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW3JlbGF0aW9uRmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4geyAuLi5yZXN0T2JqZWN0LCAuLi5yZWxhdGlvbkZpZWxkcyB9O1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ3Vua25vd24ganMgdHlwZSc7XG4gIH1cbn07XG5cbnZhciBEYXRlQ29kZXIgPSB7XG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4gbmV3IERhdGUoanNvbi5pc28pO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnRGF0ZSdcbiAgICApO1xuICB9LFxufTtcblxudmFyIEJ5dGVzQ29kZXIgPSB7XG4gIGJhc2U2NFBhdHRlcm46IG5ldyBSZWdFeHAoXG4gICAgJ14oPzpbQS1aYS16MC05Ky9dezR9KSooPzpbQS1aYS16MC05Ky9dezJ9PT18W0EtWmEtejAtOSsvXXszfT0pPyQnXG4gICksXG4gIGlzQmFzZTY0VmFsdWUob2JqZWN0KSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmJhc2U2NFBhdHRlcm4udGVzdChvYmplY3QpO1xuICB9LFxuXG4gIGRhdGFiYXNlVG9KU09OKG9iamVjdCkge1xuICAgIGxldCB2YWx1ZTtcbiAgICBpZiAodGhpcy5pc0Jhc2U2NFZhbHVlKG9iamVjdCkpIHtcbiAgICAgIHZhbHVlID0gb2JqZWN0O1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSA9IG9iamVjdC5idWZmZXIudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgYmFzZTY0OiB2YWx1ZSxcbiAgICB9O1xuICB9LFxuXG4gIGlzVmFsaWREYXRhYmFzZU9iamVjdChvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5CaW5hcnkgfHwgdGhpcy5pc0Jhc2U2NFZhbHVlKG9iamVjdCk7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBuZXcgbW9uZ29kYi5CaW5hcnkoQnVmZmVyLmZyb20oanNvbi5iYXNlNjQsICdiYXNlNjQnKSk7XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdCeXRlcydcbiAgICApO1xuICB9LFxufTtcblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGRhdGFiYXNlVG9KU09OKG9iamVjdCkge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICBsYXRpdHVkZTogb2JqZWN0WzFdLFxuICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbMF0sXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIEFycmF5ICYmIG9iamVjdC5sZW5ndGggPT0gMjtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIFtqc29uLmxvbmdpdHVkZSwganNvbi5sYXRpdHVkZV07XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCdcbiAgICApO1xuICB9LFxufTtcblxudmFyIFBvbHlnb25Db2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgLy8gQ29udmVydCBsbmcvbGF0IC0+IGxhdC9sbmdcbiAgICBjb25zdCBjb29yZHMgPSBvYmplY3QuY29vcmRpbmF0ZXNbMF0ubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICBjb29yZGluYXRlczogY29vcmRzLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIGNvbnN0IGNvb3JkcyA9IG9iamVjdC5jb29yZGluYXRlc1swXTtcbiAgICBpZiAob2JqZWN0LnR5cGUgIT09ICdQb2x5Z29uJyB8fCAhKGNvb3JkcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcG9pbnQgPSBjb29yZHNbaV07XG4gICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHBvaW50KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocGFyc2VGbG9hdChwb2ludFsxXSksIHBhcnNlRmxvYXQocG9pbnRbMF0pKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIGxldCBjb29yZHMgPSBqc29uLmNvb3JkaW5hdGVzO1xuICAgIC8vIEFkZCBmaXJzdCBwb2ludCB0byB0aGUgZW5kIHRvIGNsb3NlIHBvbHlnb25cbiAgICBpZiAoXG4gICAgICBjb29yZHNbMF1bMF0gIT09IGNvb3Jkc1tjb29yZHMubGVuZ3RoIC0gMV1bMF0gfHxcbiAgICAgIGNvb3Jkc1swXVsxXSAhPT0gY29vcmRzW2Nvb3Jkcy5sZW5ndGggLSAxXVsxXVxuICAgICkge1xuICAgICAgY29vcmRzLnB1c2goY29vcmRzWzBdKTtcbiAgICB9XG4gICAgY29uc3QgdW5pcXVlID0gY29vcmRzLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgICBsZXQgZm91bmRJbmRleCA9IC0xO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgICBpZiAocHRbMF0gPT09IGl0ZW1bMF0gJiYgcHRbMV0gPT09IGl0ZW1bMV0pIHtcbiAgICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICAgIH0pO1xuICAgIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIENvbnZlcnQgbGF0L2xvbmcgLT4gbG9uZy9sYXRcbiAgICBjb29yZHMgPSBjb29yZHMubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4geyB0eXBlOiAnUG9seWdvbicsIGNvb3JkaW5hdGVzOiBbY29vcmRzXSB9O1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnUG9seWdvbidcbiAgICApO1xuICB9LFxufTtcblxudmFyIEZpbGVDb2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgbmFtZTogb2JqZWN0LFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiB0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJztcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIGpzb24ubmFtZTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnXG4gICAgKTtcbiAgfSxcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0cmFuc2Zvcm1LZXksXG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgdHJhbnNmb3JtVXBkYXRlLFxuICB0cmFuc2Zvcm1XaGVyZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICByZWxhdGl2ZVRpbWVUb0RhdGUsXG4gIHRyYW5zZm9ybUNvbnN0cmFpbnQsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59O1xuIl19