"use strict";

var _logger = _interopRequireDefault(require("../../../logger"));

var _lodash = _interopRequireDefault(require("lodash"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { keys.push.apply(keys, Object.getOwnPropertySymbols(object)); } if (enumerableOnly) keys = keys.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); return keys; }

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
      if (className === '_GlobalConfig') {
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
        if (className === '_GlobalConfig') {
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

      if (mongoObject.hasOwnProperty('__type') && mongoObject.__type == 'Date' && mongoObject.iso instanceof Date) {
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
    return new mongodb.Binary(new Buffer(json.base64, 'base64'));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvVHJhbnNmb3JtLmpzIl0sIm5hbWVzIjpbIm1vbmdvZGIiLCJyZXF1aXJlIiwiUGFyc2UiLCJ0cmFuc2Zvcm1LZXkiLCJjbGFzc05hbWUiLCJmaWVsZE5hbWUiLCJzY2hlbWEiLCJmaWVsZHMiLCJfX3R5cGUiLCJ0eXBlIiwidHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUiLCJyZXN0S2V5IiwicmVzdFZhbHVlIiwicGFyc2VGb3JtYXRTY2hlbWEiLCJrZXkiLCJ0aW1lRmllbGQiLCJ2YWx1ZSIsInBhcnNlSW50IiwidHJhbnNmb3JtVG9wTGV2ZWxBdG9tIiwiQ2Fubm90VHJhbnNmb3JtIiwiRGF0ZSIsImluZGV4T2YiLCJBcnJheSIsIm1hcCIsInRyYW5zZm9ybUludGVyaW9yVmFsdWUiLCJ0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvciIsIm1hcFZhbHVlcyIsImlzUmVnZXgiLCJSZWdFeHAiLCJpc1N0YXJ0c1dpdGhSZWdleCIsIm1hdGNoZXMiLCJ0b1N0cmluZyIsIm1hdGNoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsInZhbHVlcyIsImlzQXJyYXkiLCJsZW5ndGgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJpIiwiaXNBbnlWYWx1ZVJlZ2V4Iiwic29tZSIsIk9iamVjdCIsImtleXMiLCJpbmNsdWRlcyIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwiZXhwZWN0ZWRUeXBlSXNBcnJheSIsImV4cGVjdGVkVHlwZUlzUG9pbnRlciIsImZpZWxkIiwidHJhbnNmb3JtZWRDb25zdHJhaW50IiwidHJhbnNmb3JtQ29uc3RyYWludCIsIiR0ZXh0IiwiJGVsZW1NYXRjaCIsIiRhbGwiLCJJTlZBTElEX0pTT04iLCJyZXN0V2hlcmUiLCJtb25nb1doZXJlIiwib3V0IiwicGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSIsInRyYW5zZm9ybWVkVmFsdWUiLCJjb2VyY2VkVG9EYXRlIiwiSU5WQUxJRF9LRVlfTkFNRSIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsInJlc3RDcmVhdGUiLCJhZGRMZWdhY3lBQ0wiLCJtb25nb0NyZWF0ZSIsInVuZGVmaW5lZCIsImNyZWF0ZWRBdCIsIl9jcmVhdGVkX2F0IiwiaXNvIiwidXBkYXRlZEF0IiwiX3VwZGF0ZWRfYXQiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJyZXN0VXBkYXRlIiwibW9uZ29VcGRhdGUiLCJhY2wiLCJfcnBlcm0iLCJfd3Blcm0iLCJfYWNsIiwiJHNldCIsIl9fb3AiLCJhcmciLCJyZXN0T2JqZWN0IiwicmVzdE9iamVjdENvcHkiLCJmb3JFYWNoIiwiZW50cnkiLCJ3IiwiciIsImF0b20iLCJvYmplY3RJZCIsIkRhdGVDb2RlciIsImlzVmFsaWRKU09OIiwiSlNPTlRvRGF0YWJhc2UiLCJCeXRlc0NvZGVyIiwiJHJlZ2V4IiwidGFyZ2V0Q2xhc3MiLCJHZW9Qb2ludENvZGVyIiwiUG9seWdvbkNvZGVyIiwiRmlsZUNvZGVyIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsInRvTG93ZXJDYXNlIiwicGFydHMiLCJzcGxpdCIsImZpbHRlciIsInBhcnQiLCJmdXR1cmUiLCJwYXN0Iiwic3RhdHVzIiwiaW5mbyIsInNsaWNlIiwicGFpcnMiLCJwdXNoIiwic2hpZnQiLCJzZWNvbmRzIiwibnVtIiwiaW50ZXJ2YWwiLCJ2YWwiLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJtaWxsaXNlY29uZHMiLCJyZXN1bHQiLCJ2YWx1ZU9mIiwiY29uc3RyYWludCIsImluQXJyYXkiLCJ0cmFuc2Zvcm1GdW5jdGlvbiIsInRyYW5zZm9ybWVyIiwiSlNPTiIsInN0cmluZ2lmeSIsInNvcnQiLCJyZXZlcnNlIiwiYW5zd2VyIiwiJHJlbGF0aXZlVGltZSIsInBhcnNlclJlc3VsdCIsImxvZyIsImFyciIsIl8iLCJmbGF0TWFwIiwicyIsIiRuaW4iLCJzZWFyY2giLCIkc2VhcmNoIiwiJHRlcm0iLCIkbGFuZ3VhZ2UiLCIkY2FzZVNlbnNpdGl2ZSIsIiRkaWFjcml0aWNTZW5zaXRpdmUiLCJwb2ludCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkbWF4RGlzdGFuY2UiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwiYm94IiwiJGJveCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJwb2ludHMiLCJjb29yZGluYXRlcyIsIkdlb1BvaW50IiwiX3ZhbGlkYXRlIiwiJHBvbHlnb24iLCJkaXN0YW5jZSIsImlzTmFOIiwiJGdlb21ldHJ5IiwiYW1vdW50Iiwib2JqZWN0cyIsImZsYXR0ZW4iLCJ0b0FkZCIsIm1vbmdvT3AiLCJBZGQiLCJBZGRVbmlxdWUiLCIkZWFjaCIsInRvUmVtb3ZlIiwib2JqZWN0IiwiaXRlcmF0b3IiLCJuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QiLCJtb25nb09iamVjdCIsIl9lbmNvZGUiLCJMb25nIiwidG9OdW1iZXIiLCJEb3VibGUiLCJpc1ZhbGlkRGF0YWJhc2VPYmplY3QiLCJkYXRhYmFzZVRvSlNPTiIsImhhc093blByb3BlcnR5IiwidG9KU09OIiwidHJhbnNmb3JtUG9pbnRlclN0cmluZyIsInBvaW50ZXJTdHJpbmciLCJvYmpEYXRhIiwibW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0IiwiX2hhc2hlZF9wYXNzd29yZCIsIm5ld0tleSIsInN1YnN0cmluZyIsInJlbGF0aW9uRmllbGROYW1lcyIsInJlbGF0aW9uRmllbGRzIiwicmVsYXRpb25GaWVsZE5hbWUiLCJqc29uIiwiYmFzZTY0UGF0dGVybiIsImlzQmFzZTY0VmFsdWUiLCJ0ZXN0IiwiYnVmZmVyIiwiYmFzZTY0IiwiQmluYXJ5IiwiQnVmZmVyIiwiY29vcmRzIiwiY29vcmQiLCJwYXJzZUZsb2F0IiwidW5pcXVlIiwiaXRlbSIsImluZGV4IiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJuYW1lIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7QUFDQTs7Ozs7Ozs7OztBQUNBLElBQUlBLE9BQU8sR0FBR0MsT0FBTyxDQUFDLFNBQUQsQ0FBckI7O0FBQ0EsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCQyxLQUFsQzs7QUFFQSxNQUFNQyxZQUFZLEdBQUcsQ0FBQ0MsU0FBRCxFQUFZQyxTQUFaLEVBQXVCQyxNQUF2QixLQUFrQztBQUNyRDtBQUNBLFVBQVFELFNBQVI7QUFDRSxTQUFLLFVBQUw7QUFDRSxhQUFPLEtBQVA7O0FBQ0YsU0FBSyxXQUFMO0FBQ0UsYUFBTyxhQUFQOztBQUNGLFNBQUssV0FBTDtBQUNFLGFBQU8sYUFBUDs7QUFDRixTQUFLLGNBQUw7QUFDRSxhQUFPLGdCQUFQOztBQUNGLFNBQUssVUFBTDtBQUNFLGFBQU8sWUFBUDs7QUFDRixTQUFLLFdBQUw7QUFDRSxhQUFPLFlBQVA7QUFaSjs7QUFlQSxNQUNFQyxNQUFNLENBQUNDLE1BQVAsQ0FBY0YsU0FBZCxLQUNBQyxNQUFNLENBQUNDLE1BQVAsQ0FBY0YsU0FBZCxFQUF5QkcsTUFBekIsSUFBbUMsU0FGckMsRUFHRTtBQUNBSCxJQUFBQSxTQUFTLEdBQUcsUUFBUUEsU0FBcEI7QUFDRCxHQUxELE1BS08sSUFDTEMsTUFBTSxDQUFDQyxNQUFQLENBQWNGLFNBQWQsS0FDQUMsTUFBTSxDQUFDQyxNQUFQLENBQWNGLFNBQWQsRUFBeUJJLElBQXpCLElBQWlDLFNBRjVCLEVBR0w7QUFDQUosSUFBQUEsU0FBUyxHQUFHLFFBQVFBLFNBQXBCO0FBQ0Q7O0FBRUQsU0FBT0EsU0FBUDtBQUNELENBOUJEOztBQWdDQSxNQUFNSywwQkFBMEIsR0FBRyxD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QUQ7QUFBaEMsS0FBUDtBQUNELEdBMURnQjs7QUE0RGpCbkgsRUFBQUEsV0FBVyxDQUFDbkYsS0FBRCxFQUFRO0FBQ2pCLFdBQ0UsT0FBT0EsS0FBUCxLQUFpQixRQUFqQixJQUE2QkEsS0FBSyxLQUFLLElBQXZDLElBQStDQSxLQUFLLENBQUNSLE1BQU4sS0FBaUIsU0FEbEU7QUFHRDs7QUFoRWdCLENBQW5CO0FBbUVBLElBQUlrRyxTQUFTLEdBQUc7QUFDZHVGLEVBQUFBLGNBQWMsQ0FBQ1QsTUFBRCxFQUFTO0FBQ3JCLFdBQU87QUFDTGhMLE1BQUFBLE1BQU0sRUFBRSxNQURIO0FBRUx1TixNQUFBQSxJQUFJLEVBQUV2QztBQUZELEtBQVA7QUFJRCxHQU5hOztBQVFkUSxFQUFBQSxxQkFBcUIsQ0FBQ1IsTUFBRCxFQUFTO0FBQzVCLFdBQU8sT0FBT0EsTUFBUCxLQUFrQixRQUF6QjtBQUNELEdBVmE7O0FBWWRwRixFQUFBQSxjQUFjLENBQUMwRyxJQUFELEVBQU87QUFDbkIsV0FBT0EsSUFBSSxDQUFDaUIsSUFBWjtBQUNELEdBZGE7O0FBZ0JkNUgsRUFBQUEsV0FBVyxDQUFDbkYsS0FBRCxFQUFRO0FBQ2pCLFdBQ0UsT0FBT0EsS0FBUCxLQUFpQixRQUFqQixJQUE2QkEsS0FBSyxLQUFLLElBQXZDLElBQStDQSxLQUFLLENBQUNSLE1BQU4sS0FBaUIsTUFEbEU7QUFHRDs7QUFwQmEsQ0FBaEI7QUF1QkF3TixNQUFNLENBQUNDLE9BQVAsR0FBaUI7QUFDZjlOLEVBQUFBLFlBRGU7QUFFZm1FLEVBQUFBLGlDQUZlO0FBR2ZVLEVBQUFBLGVBSGU7QUFJZjdCLEVBQUFBLGNBSmU7QUFLZm9KLEVBQUFBLHdCQUxlO0FBTWYzRixFQUFBQSxrQkFOZTtBQU9mbEQsRUFBQUEsbUJBUGU7QUFRZjBJLEVBQUFBO0FBUmUsQ0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nIGZyb20gJy4uLy4uLy4uL2xvZ2dlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xudmFyIG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5cbmNvbnN0IHRyYW5zZm9ybUtleSA9IChjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICAgIHJldHVybiAnX2lkJztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgcmV0dXJuICdfY3JlYXRlZF9hdCc7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIHJldHVybiAnX3VwZGF0ZWRfYXQnO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4gJ19zZXNzaW9uX3Rva2VuJztcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICByZXR1cm4gJ19sYXN0X3VzZWQnO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICByZXR1cm4gJ3RpbWVzX3VzZWQnO1xuICB9XG5cbiAgaWYgKFxuICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5fX3R5cGUgPT0gJ1BvaW50ZXInXG4gICkge1xuICAgIGZpZWxkTmFtZSA9ICdfcF8nICsgZmllbGROYW1lO1xuICB9IGVsc2UgaWYgKFxuICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09ICdQb2ludGVyJ1xuICApIHtcbiAgICBmaWVsZE5hbWUgPSAnX3BfJyArIGZpZWxkTmFtZTtcbiAgfVxuXG4gIHJldHVybiBmaWVsZE5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZSA9IChcbiAgY2xhc3NOYW1lLFxuICByZXN0S2V5LFxuICByZXN0VmFsdWUsXG4gIHBhcnNlRm9ybWF0U2NoZW1hXG4pID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIHZhciBrZXkgPSByZXN0S2V5O1xuICB2YXIgdGltZUZpZWxkID0gZmFsc2U7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgIGNhc2UgJ19pZCc6XG4gICAgICBpZiAoY2xhc3NOYW1lID09PSAnX0dsb2JhbENvbmZpZycpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgICB2YWx1ZTogcGFyc2VJbnQocmVzdFZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfaWQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICBjYXNlICdfY3JlYXRlZF9hdCc6XG4gICAgICBrZXkgPSAnX2NyZWF0ZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgY2FzZSAnX3VwZGF0ZWRfYXQnOlxuICAgICAga2V5ID0gJ191cGRhdGVkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgIGNhc2UgJ19zZXNzaW9uX3Rva2VuJzpcbiAgICAgIGtleSA9ICdfc2Vzc2lvbl90b2tlbic7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgIGNhc2UgJ19leHBpcmVzQXQnOlxuICAgICAga2V5ID0gJ2V4cGlyZXNBdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgIGtleSA9ICdfZmFpbGVkX2xvZ2luX2NvdW50JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgIGtleSA9ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgICAgcmV0dXJuIHsga2V5OiBrZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgY2FzZSAnX2xhc3RfdXNlZCc6XG4gICAgICBrZXkgPSAnX2xhc3RfdXNlZCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICBjYXNlICd0aW1lc191c2VkJzpcbiAgICAgIGtleSA9ICd0aW1lc191c2VkJztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgfVxuXG4gIGlmIChcbiAgICAocGFyc2VGb3JtYXRTY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgIHBhcnNlRm9ybWF0U2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAoIXBhcnNlRm9ybWF0U2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICByZXN0VmFsdWUgJiZcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInKVxuICApIHtcbiAgICBrZXkgPSAnX3BfJyArIGtleTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIGlmICh0aW1lRmllbGQgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgdmFsdWUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgfVxuICAgIGlmIChyZXN0S2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gIH1cblxuICAvLyBIYW5kbGUgdXBkYXRlIG9wZXJhdG9yc1xuICBpZiAodHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ19fb3AnIGluIHJlc3RWYWx1ZSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yKHJlc3RWYWx1ZSwgZmFsc2UpIH07XG4gIH1cblxuICAvLyBIYW5kbGUgbm9ybWFsIG9iamVjdHMgYnkgcmVjdXJzaW5nXG4gIHZhbHVlID0gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbn07XG5cbmNvbnN0IGlzUmVnZXggPSB2YWx1ZSA9PiB7XG4gIHJldHVybiB2YWx1ZSAmJiB2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cDtcbn07XG5cbmNvbnN0IGlzU3RhcnRzV2l0aFJlZ2V4ID0gdmFsdWUgPT4ge1xuICBpZiAoIWlzUmVnZXgodmFsdWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLnRvU3RyaW5nKCkubWF0Y2goL1xcL1xcXlxcXFxRLipcXFxcRVxcLy8pO1xuICByZXR1cm4gISFtYXRjaGVzO1xufTtcblxuY29uc3QgaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSA9IHZhbHVlcyA9PiB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdKTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmNvbnN0IGlzQW55VmFsdWVSZWdleCA9IHZhbHVlcyA9PiB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiBpc1JlZ2V4KHZhbHVlKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlID0gcmVzdFZhbHVlID0+IHtcbiAgaWYgKFxuICAgIHJlc3RWYWx1ZSAhPT0gbnVsbCAmJlxuICAgIHR5cGVvZiByZXN0VmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgT2JqZWN0LmtleXMocmVzdFZhbHVlKS5zb21lKGtleSA9PiBrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSlcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgKTtcbiAgfVxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICB2YXIgdmFsdWUgPSB0cmFuc2Zvcm1JbnRlcmlvckF0b20ocmVzdFZhbHVlKTtcbiAgaWYgKHZhbHVlICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiByZXN0VmFsdWUubWFwKHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICB9XG5cbiAgLy8gSGFuZGxlIHVwZGF0ZSBvcGVyYXRvcnNcbiAgaWYgKHR5cGVvZiByZXN0VmFsdWUgPT09ICdvYmplY3QnICYmICdfX29wJyBpbiByZXN0VmFsdWUpIHtcbiAgICByZXR1cm4gdHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IocmVzdFZhbHVlLCB0cnVlKTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBub3JtYWwgb2JqZWN0cyBieSByZWN1cnNpbmdcbiAgcmV0dXJuIG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xufTtcblxuY29uc3QgdmFsdWVBc0RhdGUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtUXVlcnlLZXlWYWx1ZShjbGFzc05hbWUsIGtleSwgdmFsdWUsIHNjaGVtYSwgY291bnQgPSBmYWxzZSkge1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19jcmVhdGVkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19jcmVhdGVkX2F0JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ191cGRhdGVkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ191cGRhdGVkX2F0JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ2V4cGlyZXNBdCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgICAgICAgICB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnb2JqZWN0SWQnOiB7XG4gICAgICBpZiAoY2xhc3NOYW1lID09PSAnX0dsb2JhbENvbmZpZycpIHtcbiAgICAgICAgdmFsdWUgPSBwYXJzZUludCh2YWx1ZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4geyBrZXk6ICdfaWQnLCB2YWx1ZSB9O1xuICAgIH1cbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICAgICAgICAgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4geyBrZXk6ICdfc2Vzc2lvbl90b2tlbicsIHZhbHVlIH07XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICAgICAgICAgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICAgIGNhc2UgJyRvcic6XG4gICAgY2FzZSAnJGFuZCc6XG4gICAgY2FzZSAnJG5vcic6XG4gICAgICByZXR1cm4ge1xuICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgdmFsdWU6IHZhbHVlLm1hcChzdWJRdWVyeSA9PlxuICAgICAgICAgIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgc3ViUXVlcnksIHNjaGVtYSwgY291bnQpXG4gICAgICAgICksXG4gICAgICB9O1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX2xhc3RfdXNlZCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfbGFzdF91c2VkJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICByZXR1cm4geyBrZXk6ICd0aW1lc191c2VkJywgdmFsdWU6IHZhbHVlIH07XG4gICAgZGVmYXVsdDoge1xuICAgICAgLy8gT3RoZXIgYXV0aCBkYXRhXG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0ga2V5Lm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgLy8gU3BlY2lhbC1jYXNlIGF1dGggZGF0YS5cbiAgICAgICAgcmV0dXJuIHsga2V5OiBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfS5pZGAsIHZhbHVlIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZXhwZWN0ZWRUeXBlSXNBcnJheSA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0FycmF5JztcblxuICBjb25zdCBleHBlY3RlZFR5cGVJc1BvaW50ZXIgPVxuICAgIHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2ludGVyJztcblxuICBjb25zdCBmaWVsZCA9IHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV07XG4gIGlmIChcbiAgICBleHBlY3RlZFR5cGVJc1BvaW50ZXIgfHxcbiAgICAoIXNjaGVtYSAmJiB2YWx1ZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJylcbiAgKSB7XG4gICAga2V5ID0gJ19wXycgKyBrZXk7XG4gIH1cblxuICAvLyBIYW5kbGUgcXVlcnkgY29uc3RyYWludHNcbiAgY29uc3QgdHJhbnNmb3JtZWRDb25zdHJhaW50ID0gdHJhbnNmb3JtQ29uc3RyYWludCh2YWx1ZSwgZmllbGQsIGNvdW50KTtcbiAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludCAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludC4kdGV4dCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJHRleHQnLCB2YWx1ZTogdHJhbnNmb3JtZWRDb25zdHJhaW50LiR0ZXh0IH07XG4gICAgfVxuICAgIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJGVsZW1NYXRjaCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJG5vcicsIHZhbHVlOiBbeyBba2V5XTogdHJhbnNmb3JtZWRDb25zdHJhaW50IH1dIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybWVkQ29uc3RyYWludCB9O1xuICB9XG5cbiAgaWYgKGV4cGVjdGVkVHlwZUlzQXJyYXkgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHsgJGFsbDogW3RyYW5zZm9ybUludGVyaW9yQXRvbSh2YWx1ZSldIH0gfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIGlmICh0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpIH07XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYFlvdSBjYW5ub3QgdXNlICR7dmFsdWV9IGFzIGEgcXVlcnkgcGFyYW1ldGVyLmBcbiAgICApO1xuICB9XG59XG5cbi8vIE1haW4gZXhwb3NlZCBtZXRob2QgdG8gaGVscCBydW4gcXVlcmllcy5cbi8vIHJlc3RXaGVyZSBpcyB0aGUgXCJ3aGVyZVwiIGNsYXVzZSBpbiBSRVNUIEFQSSBmb3JtLlxuLy8gUmV0dXJucyB0aGUgbW9uZ28gZm9ybSBvZiB0aGUgcXVlcnkuXG5mdW5jdGlvbiB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHJlc3RXaGVyZSwgc2NoZW1hLCBjb3VudCA9IGZhbHNlKSB7XG4gIGNvbnN0IG1vbmdvV2hlcmUgPSB7fTtcbiAgZm9yIChjb25zdCByZXN0S2V5IGluIHJlc3RXaGVyZSkge1xuICAgIGNvbnN0IG91dCA9IHRyYW5zZm9ybVF1ZXJ5S2V5VmFsdWUoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICByZXN0S2V5LFxuICAgICAgcmVzdFdoZXJlW3Jlc3RLZXldLFxuICAgICAgc2NoZW1hLFxuICAgICAgY291bnRcbiAgICApO1xuICAgIG1vbmdvV2hlcmVbb3V0LmtleV0gPSBvdXQudmFsdWU7XG4gIH1cbiAgcmV0dXJuIG1vbmdvV2hlcmU7XG59XG5cbmNvbnN0IHBhcnNlT2JqZWN0S2V5VmFsdWVUb01vbmdvT2JqZWN0S2V5VmFsdWUgPSAoXG4gIHJlc3RLZXksXG4gIHJlc3RWYWx1ZSxcbiAgc2NoZW1hXG4pID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIGxldCB0cmFuc2Zvcm1lZFZhbHVlO1xuICBsZXQgY29lcmNlZFRvRGF0ZTtcbiAgc3dpdGNoIChyZXN0S2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX2lkJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICAgICAgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKVxuICAgICAgICAgIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ2V4cGlyZXNBdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICAgICA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpXG4gICAgICAgICAgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgICAgID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSlcbiAgICAgICAgICA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgICAgID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSlcbiAgICAgICAgICA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnXG4gICAgICAgICAgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKVxuICAgICAgICAgIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgY2FzZSAnX2hhc2hlZF9wYXNzd29yZCc6XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19zZXNzaW9uX3Rva2VuJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBBdXRoIGRhdGEgc2hvdWxkIGhhdmUgYmVlbiB0cmFuc2Zvcm1lZCBhbHJlYWR5XG4gICAgICBpZiAocmVzdEtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgJ2NhbiBvbmx5IHF1ZXJ5IG9uICcgKyByZXN0S2V5XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBUcnVzdCB0aGF0IHRoZSBhdXRoIGRhdGEgaGFzIGJlZW4gdHJhbnNmb3JtZWQgYW5kIHNhdmUgaXQgZGlyZWN0bHlcbiAgICAgIGlmIChyZXN0S2V5Lm1hdGNoKC9eX2F1dGhfZGF0YV9bYS16QS1aMC05X10rJC8pKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgICAgfVxuICB9XG4gIC8vc2tpcCBzdHJhaWdodCB0byB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20gZm9yIEJ5dGVzLCB0aGV5IGRvbid0IHNob3cgdXAgaW4gdGhlIHNjaGVtYSBmb3Igc29tZSByZWFzb25cbiAgaWYgKHJlc3RWYWx1ZSAmJiByZXN0VmFsdWUuX190eXBlICE9PSAnQnl0ZXMnKSB7XG4gICAgLy9Ob3RlOiBXZSBtYXkgbm90IGtub3cgdGhlIHR5cGUgb2YgYSBmaWVsZCBoZXJlLCBhcyB0aGUgdXNlciBjb3VsZCBiZSBzYXZpbmcgKG51bGwpIHRvIGEgZmllbGRcbiAgICAvL1RoYXQgbmV2ZXIgZXhpc3RlZCBiZWZvcmUsIG1lYW5pbmcgd2UgY2FuJ3QgaW5mZXIgdGhlIHR5cGUuXG4gICAgaWYgKFxuICAgICAgKHNjaGVtYS5maWVsZHNbcmVzdEtleV0gJiYgc2NoZW1hLmZpZWxkc1tyZXN0S2V5XS50eXBlID09ICdQb2ludGVyJykgfHxcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInXG4gICAgKSB7XG4gICAgICByZXN0S2V5ID0gJ19wXycgKyByZXN0S2V5O1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHZhbHVlIH07XG4gIH1cblxuICAvLyBBQ0xzIGFyZSBoYW5kbGVkIGJlZm9yZSB0aGlzIG1ldGhvZCBpcyBjYWxsZWRcbiAgLy8gSWYgYW4gQUNMIGtleSBzdGlsbCBleGlzdHMgaGVyZSwgc29tZXRoaW5nIGlzIHdyb25nLlxuICBpZiAocmVzdEtleSA9PT0gJ0FDTCcpIHtcbiAgICB0aHJvdyAnVGhlcmUgd2FzIGEgcHJvYmxlbSB0cmFuc2Zvcm1pbmcgYW4gQUNMLic7XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICBpZiAoXG4gICAgT2JqZWN0LmtleXMocmVzdFZhbHVlKS5zb21lKGtleSA9PiBrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSlcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgKTtcbiAgfVxuICB2YWx1ZSA9IG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlIH07XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUgPSAoY2xhc3NOYW1lLCByZXN0Q3JlYXRlLCBzY2hlbWEpID0+IHtcbiAgcmVzdENyZWF0ZSA9IGFkZExlZ2FjeUFDTChyZXN0Q3JlYXRlKTtcbiAgY29uc3QgbW9uZ29DcmVhdGUgPSB7fTtcbiAgZm9yIChjb25zdCByZXN0S2V5IGluIHJlc3RDcmVhdGUpIHtcbiAgICBpZiAocmVzdENyZWF0ZVtyZXN0S2V5XSAmJiByZXN0Q3JlYXRlW3Jlc3RLZXldLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHsga2V5LCB2YWx1ZSB9ID0gcGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZShcbiAgICAgIHJlc3RLZXksXG4gICAgICByZXN0Q3JlYXRlW3Jlc3RLZXldLFxuICAgICAgc2NoZW1hXG4gICAgKTtcbiAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgbW9uZ29DcmVhdGVba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVzZSB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdCBmb3IgY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXRcbiAgaWYgKG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdCkge1xuICAgIG1vbmdvQ3JlYXRlLl9jcmVhdGVkX2F0ID0gbmV3IERhdGUoXG4gICAgICBtb25nb0NyZWF0ZS5jcmVhdGVkQXQuaXNvIHx8IG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdFxuICAgICk7XG4gICAgZGVsZXRlIG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdDtcbiAgfVxuICBpZiAobW9uZ29DcmVhdGUudXBkYXRlZEF0KSB7XG4gICAgbW9uZ29DcmVhdGUuX3VwZGF0ZWRfYXQgPSBuZXcgRGF0ZShcbiAgICAgIG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdC5pc28gfHwgbW9uZ29DcmVhdGUudXBkYXRlZEF0XG4gICAgKTtcbiAgICBkZWxldGUgbW9uZ29DcmVhdGUudXBkYXRlZEF0O1xuICB9XG5cbiAgcmV0dXJuIG1vbmdvQ3JlYXRlO1xufTtcblxuLy8gTWFpbiBleHBvc2VkIG1ldGhvZCB0byBoZWxwIHVwZGF0ZSBvbGQgb2JqZWN0cy5cbmNvbnN0IHRyYW5zZm9ybVVwZGF0ZSA9IChjbGFzc05hbWUsIHJlc3RVcGRhdGUsIHBhcnNlRm9ybWF0U2NoZW1hKSA9PiB7XG4gIGNvbnN0IG1vbmdvVXBkYXRlID0ge307XG4gIGNvbnN0IGFjbCA9IGFkZExlZ2FjeUFDTChyZXN0VXBkYXRlKTtcbiAgaWYgKGFjbC5fcnBlcm0gfHwgYWNsLl93cGVybSB8fCBhY2wuX2FjbCkge1xuICAgIG1vbmdvVXBkYXRlLiRzZXQgPSB7fTtcbiAgICBpZiAoYWNsLl9ycGVybSkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fcnBlcm0gPSBhY2wuX3JwZXJtO1xuICAgIH1cbiAgICBpZiAoYWNsLl93cGVybSkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fd3Blcm0gPSBhY2wuX3dwZXJtO1xuICAgIH1cbiAgICBpZiAoYWNsLl9hY2wpIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX2FjbCA9IGFjbC5fYWNsO1xuICAgIH1cbiAgfVxuICBmb3IgKHZhciByZXN0S2V5IGluIHJlc3RVcGRhdGUpIHtcbiAgICBpZiAocmVzdFVwZGF0ZVtyZXN0S2V5XSAmJiByZXN0VXBkYXRlW3Jlc3RLZXldLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHZhciBvdXQgPSB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZShcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RLZXksXG4gICAgICByZXN0VXBkYXRlW3Jlc3RLZXldLFxuICAgICAgcGFyc2VGb3JtYXRTY2hlbWFcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG91dHB1dCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbnkgJCBrZXlzLCBpdCdzIGFuXG4gICAgLy8gb3BlcmF0b3IgdGhhdCBuZWVkcyB0byBiZSBsaWZ0ZWQgb250byB0aGUgdG9wIGxldmVsIHVwZGF0ZVxuICAgIC8vIG9iamVjdC5cbiAgICBpZiAodHlwZW9mIG91dC52YWx1ZSA9PT0gJ29iamVjdCcgJiYgb3V0LnZhbHVlICE9PSBudWxsICYmIG91dC52YWx1ZS5fX29wKSB7XG4gICAgICBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF0gPSBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF0gfHwge307XG4gICAgICBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF1bb3V0LmtleV0gPSBvdXQudmFsdWUuYXJnO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb1VwZGF0ZVsnJHNldCddID0gbW9uZ29VcGRhdGVbJyRzZXQnXSB8fCB7fTtcbiAgICAgIG1vbmdvVXBkYXRlWyckc2V0J11bb3V0LmtleV0gPSBvdXQudmFsdWU7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1vbmdvVXBkYXRlO1xufTtcblxuLy8gQWRkIHRoZSBsZWdhY3kgX2FjbCBmb3JtYXQuXG5jb25zdCBhZGRMZWdhY3lBQ0wgPSByZXN0T2JqZWN0ID0+IHtcbiAgY29uc3QgcmVzdE9iamVjdENvcHkgPSB7IC4uLnJlc3RPYmplY3QgfTtcbiAgY29uc3QgX2FjbCA9IHt9O1xuXG4gIGlmIChyZXN0T2JqZWN0Ll93cGVybSkge1xuICAgIHJlc3RPYmplY3QuX3dwZXJtLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgX2FjbFtlbnRyeV0gPSB7IHc6IHRydWUgfTtcbiAgICB9KTtcbiAgICByZXN0T2JqZWN0Q29weS5fYWNsID0gX2FjbDtcbiAgfVxuXG4gIGlmIChyZXN0T2JqZWN0Ll9ycGVybSkge1xuICAgIHJlc3RPYmplY3QuX3JwZXJtLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCEoZW50cnkgaW4gX2FjbCkpIHtcbiAgICAgICAgX2FjbFtlbnRyeV0gPSB7IHI6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIF9hY2xbZW50cnldLnIgPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJlc3RPYmplY3RDb3B5Ll9hY2wgPSBfYWNsO1xuICB9XG5cbiAgcmV0dXJuIHJlc3RPYmplY3RDb3B5O1xufTtcblxuLy8gQSBzZW50aW5lbCB2YWx1ZSB0aGF0IGhlbHBlciB0cmFuc2Zvcm1hdGlvbnMgcmV0dXJuIHdoZW4gdGhleVxuLy8gY2Fubm90IHBlcmZvcm0gYSB0cmFuc2Zvcm1hdGlvblxuZnVuY3Rpb24gQ2Fubm90VHJhbnNmb3JtKCkge31cblxuY29uc3QgdHJhbnNmb3JtSW50ZXJpb3JBdG9tID0gYXRvbSA9PiB7XG4gIC8vIFRPRE86IGNoZWNrIHZhbGlkaXR5IGhhcmRlciBmb3IgdGhlIF9fdHlwZS1kZWZpbmVkIHR5cGVzXG4gIGlmIChcbiAgICB0eXBlb2YgYXRvbSA9PT0gJ29iamVjdCcgJiZcbiAgICBhdG9tICYmXG4gICAgIShhdG9tIGluc3RhbmNlb2YgRGF0ZSkgJiZcbiAgICBhdG9tLl9fdHlwZSA9PT0gJ1BvaW50ZXInXG4gICkge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogYXRvbS5jbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogYXRvbS5vYmplY3RJZCxcbiAgICB9O1xuICB9IGVsc2UgaWYgKHR5cGVvZiBhdG9tID09PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiBhdG9tID09PSAnc3ltYm9sJykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGBjYW5ub3QgdHJhbnNmb3JtIHZhbHVlOiAke2F0b219YFxuICAgICk7XG4gIH0gZWxzZSBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIERhdGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgfSBlbHNlIGlmIChCeXRlc0NvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIEJ5dGVzQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGF0b20gPT09ICdvYmplY3QnICYmIGF0b20gJiYgYXRvbS4kcmVnZXggIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBuZXcgUmVnRXhwKGF0b20uJHJlZ2V4KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYXRvbTtcbiAgfVxufTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIHRyYW5zZm9ybSBhbiBhdG9tIGZyb20gUkVTVCBmb3JtYXQgdG8gTW9uZ28gZm9ybWF0LlxuLy8gQW4gYXRvbSBpcyBhbnl0aGluZyB0aGF0IGNhbid0IGNvbnRhaW4gb3RoZXIgZXhwcmVzc2lvbnMuIFNvIGl0XG4vLyBpbmNsdWRlcyB0aGluZ3Mgd2hlcmUgb2JqZWN0cyBhcmUgdXNlZCB0byByZXByZXNlbnQgb3RoZXJcbi8vIGRhdGF0eXBlcywgbGlrZSBwb2ludGVycyBhbmQgZGF0ZXMsIGJ1dCBpdCBkb2VzIG5vdCBpbmNsdWRlIG9iamVjdHNcbi8vIG9yIGFycmF5cyB3aXRoIGdlbmVyaWMgc3R1ZmYgaW5zaWRlLlxuLy8gUmFpc2VzIGFuIGVycm9yIGlmIHRoaXMgY2Fubm90IHBvc3NpYmx5IGJlIHZhbGlkIFJFU1QgZm9ybWF0LlxuLy8gUmV0dXJucyBDYW5ub3RUcmFuc2Zvcm0gaWYgaXQncyBqdXN0IG5vdCBhbiBhdG9tXG5mdW5jdGlvbiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20oYXRvbSwgZmllbGQpIHtcbiAgc3dpdGNoICh0eXBlb2YgYXRvbSkge1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBhdG9tO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHtmaWVsZC50YXJnZXRDbGFzc30kJHthdG9tfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYXRvbTtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgY2Fubm90IHRyYW5zZm9ybSB2YWx1ZTogJHthdG9tfWBcbiAgICAgICk7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChhdG9tIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAvLyBUZWNobmljYWxseSBkYXRlcyBhcmUgbm90IHJlc3QgZm9ybWF0LCBidXQsIGl0IHNlZW1zIHByZXR0eVxuICAgICAgICAvLyBjbGVhciB3aGF0IHRoZXkgc2hvdWxkIGJlIHRyYW5zZm9ybWVkIHRvLCBzbyBsZXQncyBqdXN0IGRvIGl0LlxuICAgICAgICByZXR1cm4gYXRvbTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF0b20gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIGF0b207XG4gICAgICB9XG5cbiAgICAgIC8vIFRPRE86IGNoZWNrIHZhbGlkaXR5IGhhcmRlciBmb3IgdGhlIF9fdHlwZS1kZWZpbmVkIHR5cGVzXG4gICAgICBpZiAoYXRvbS5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHthdG9tLmNsYXNzTmFtZX0kJHthdG9tLm9iamVjdElkfWA7XG4gICAgICB9XG4gICAgICBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBEYXRlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBHZW9Qb2ludENvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKFBvbHlnb25Db2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gUG9seWdvbkNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEZpbGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gRmlsZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBJIGRvbid0IHRoaW5rIHR5cGVvZiBjYW4gZXZlciBsZXQgdXMgZ2V0IGhlcmVcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICBgcmVhbGx5IGRpZCBub3QgZXhwZWN0IHZhbHVlOiAke2F0b219YFxuICAgICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWxhdGl2ZVRpbWVUb0RhdGUodGV4dCwgbm93ID0gbmV3IERhdGUoKSkge1xuICB0ZXh0ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuXG4gIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoJyAnKTtcblxuICAvLyBGaWx0ZXIgb3V0IHdoaXRlc3BhY2VcbiAgcGFydHMgPSBwYXJ0cy5maWx0ZXIocGFydCA9PiBwYXJ0ICE9PSAnJyk7XG5cbiAgY29uc3QgZnV0dXJlID0gcGFydHNbMF0gPT09ICdpbic7XG4gIGNvbnN0IHBhc3QgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSA9PT0gJ2Fnbyc7XG5cbiAgaWYgKCFmdXR1cmUgJiYgIXBhc3QgJiYgdGV4dCAhPT0gJ25vdycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgaW5mbzogXCJUaW1lIHNob3VsZCBlaXRoZXIgc3RhcnQgd2l0aCAnaW4nIG9yIGVuZCB3aXRoICdhZ28nXCIsXG4gICAgfTtcbiAgfVxuXG4gIGlmIChmdXR1cmUgJiYgcGFzdCkge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICBpbmZvOiBcIlRpbWUgY2Fubm90IGhhdmUgYm90aCAnaW4nIGFuZCAnYWdvJ1wiLFxuICAgIH07XG4gIH1cblxuICAvLyBzdHJpcCB0aGUgJ2Fnbycgb3IgJ2luJ1xuICBpZiAoZnV0dXJlKSB7XG4gICAgcGFydHMgPSBwYXJ0cy5zbGljZSgxKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBwYXN0XG4gICAgcGFydHMgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIGlmIChwYXJ0cy5sZW5ndGggJSAyICE9PSAwICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgIGluZm86ICdJbnZhbGlkIHRpbWUgc3RyaW5nLiBEYW5nbGluZyB1bml0IG9yIG51bWJlci4nLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBwYWlycyA9IFtdO1xuICB3aGlsZSAocGFydHMubGVuZ3RoKSB7XG4gICAgcGFpcnMucHVzaChbcGFydHMuc2hpZnQoKSwgcGFydHMuc2hpZnQoKV0pO1xuICB9XG5cbiAgbGV0IHNlY29uZHMgPSAwO1xuICBmb3IgKGNvbnN0IFtudW0sIGludGVydmFsXSBvZiBwYWlycykge1xuICAgIGNvbnN0IHZhbCA9IE51bWJlcihudW0pO1xuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih2YWwpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86IGAnJHtudW19JyBpcyBub3QgYW4gaW50ZWdlci5gLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBzd2l0Y2ggKGludGVydmFsKSB7XG4gICAgICBjYXNlICd5cic6XG4gICAgICBjYXNlICd5cnMnOlxuICAgICAgY2FzZSAneWVhcic6XG4gICAgICBjYXNlICd5ZWFycyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsICogMzE1MzYwMDA7IC8vIDM2NSAqIDI0ICogNjAgKiA2MFxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnd2snOlxuICAgICAgY2FzZSAnd2tzJzpcbiAgICAgIGNhc2UgJ3dlZWsnOlxuICAgICAgY2FzZSAnd2Vla3MnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDYwNDgwMDsgLy8gNyAqIDI0ICogNjAgKiA2MFxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnZCc6XG4gICAgICBjYXNlICdkYXknOlxuICAgICAgY2FzZSAnZGF5cyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsICogODY0MDA7IC8vIDI0ICogNjAgKiA2MFxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnaHInOlxuICAgICAgY2FzZSAnaHJzJzpcbiAgICAgIGNhc2UgJ2hvdXInOlxuICAgICAgY2FzZSAnaG91cnMnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDM2MDA7IC8vIDYwICogNjBcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ21pbic6XG4gICAgICBjYXNlICdtaW5zJzpcbiAgICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgICBjYXNlICdtaW51dGVzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA2MDtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ3NlYyc6XG4gICAgICBjYXNlICdzZWNzJzpcbiAgICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgICBjYXNlICdzZWNvbmRzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWw7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgICBpbmZvOiBgSW52YWxpZCBpbnRlcnZhbDogJyR7aW50ZXJ2YWx9J2AsXG4gICAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgbWlsbGlzZWNvbmRzID0gc2Vjb25kcyAqIDEwMDA7XG4gIGlmIChmdXR1cmUpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICBpbmZvOiAnZnV0dXJlJyxcbiAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSArIG1pbGxpc2Vjb25kcyksXG4gICAgfTtcbiAgfSBlbHNlIGlmIChwYXN0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgaW5mbzogJ3Bhc3QnLFxuICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpIC0gbWlsbGlzZWNvbmRzKSxcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgIGluZm86ICdwcmVzZW50JyxcbiAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSksXG4gICAgfTtcbiAgfVxufVxuXG4vLyBUcmFuc2Zvcm1zIGEgcXVlcnkgY29uc3RyYWludCBmcm9tIFJFU1QgQVBJIGZvcm1hdCB0byBNb25nbyBmb3JtYXQuXG4vLyBBIGNvbnN0cmFpbnQgaXMgc29tZXRoaW5nIHdpdGggZmllbGRzIGxpa2UgJGx0LlxuLy8gSWYgaXQgaXMgbm90IGEgdmFsaWQgY29uc3RyYWludCBidXQgaXQgY291bGQgYmUgYSB2YWxpZCBzb21ldGhpbmdcbi8vIGVsc2UsIHJldHVybiBDYW5ub3RUcmFuc2Zvcm0uXG4vLyBpbkFycmF5IGlzIHdoZXRoZXIgdGhpcyBpcyBhbiBhcnJheSBmaWVsZC5cbmZ1bmN0aW9uIHRyYW5zZm9ybUNvbnN0cmFpbnQoY29uc3RyYWludCwgZmllbGQsIGNvdW50ID0gZmFsc2UpIHtcbiAgY29uc3QgaW5BcnJheSA9IGZpZWxkICYmIGZpZWxkLnR5cGUgJiYgZmllbGQudHlwZSA9PT0gJ0FycmF5JztcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50ICE9PSAnb2JqZWN0JyB8fCAhY29uc3RyYWludCkge1xuICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG4gIH1cbiAgY29uc3QgdHJhbnNmb3JtRnVuY3Rpb24gPSBpbkFycmF5XG4gICAgPyB0cmFuc2Zvcm1JbnRlcmlvckF0b21cbiAgICA6IHRyYW5zZm9ybVRvcExldmVsQXRvbTtcbiAgY29uc3QgdHJhbnNmb3JtZXIgPSBhdG9tID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB0cmFuc2Zvcm1GdW5jdGlvbihhdG9tLCBmaWVsZCk7XG4gICAgaWYgKHJlc3VsdCA9PT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYGJhZCBhdG9tOiAke0pTT04uc3RyaW5naWZ5KGF0b20pfWBcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG4gIC8vIGtleXMgaXMgdGhlIGNvbnN0cmFpbnRzIGluIHJldmVyc2UgYWxwaGFiZXRpY2FsIG9yZGVyLlxuICAvLyBUaGlzIGlzIGEgaGFjayBzbyB0aGF0OlxuICAvLyAgICRyZWdleCBpcyBoYW5kbGVkIGJlZm9yZSAkb3B0aW9uc1xuICAvLyAgICRuZWFyU3BoZXJlIGlzIGhhbmRsZWQgYmVmb3JlICRtYXhEaXN0YW5jZVxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGNvbnN0cmFpbnQpXG4gICAgLnNvcnQoKVxuICAgIC5yZXZlcnNlKCk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IG9mIGtleXMpIHtcbiAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgY2FzZSAnJGx0JzpcbiAgICAgIGNhc2UgJyRsdGUnOlxuICAgICAgY2FzZSAnJGd0JzpcbiAgICAgIGNhc2UgJyRndGUnOlxuICAgICAgY2FzZSAnJGV4aXN0cyc6XG4gICAgICBjYXNlICckbmUnOlxuICAgICAgY2FzZSAnJGVxJzoge1xuICAgICAgICBjb25zdCB2YWwgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh2YWwgJiYgdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgdmFsLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSAhPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIERhdGUgZmllbGQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICckZXhpc3RzJzpcbiAgICAgICAgICAgIGNhc2UgJyRuZSc6XG4gICAgICAgICAgICBjYXNlICckZXEnOlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZXJSZXN1bHQgPSByZWxhdGl2ZVRpbWVUb0RhdGUodmFsLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgIGlmIChwYXJzZXJSZXN1bHQuc3RhdHVzID09PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIGFuc3dlcltrZXldID0gcGFyc2VyUmVzdWx0LnJlc3VsdDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGxvZy5pbmZvKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtrZXl9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFuc3dlcltrZXldID0gdHJhbnNmb3JtZXIodmFsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGNhc2UgJyRpbic6XG4gICAgICBjYXNlICckbmluJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJyArIGtleSArICcgdmFsdWUnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IF8uZmxhdE1hcChhcnIsIHZhbHVlID0+IHtcbiAgICAgICAgICByZXR1cm4gKGF0b20gPT4ge1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXRvbSkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcCh0cmFuc2Zvcm1lcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gdHJhbnNmb3JtZXIoYXRvbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkodmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckYWxsJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJyArIGtleSArICcgdmFsdWUnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IGFyci5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcblxuICAgICAgICBjb25zdCB2YWx1ZXMgPSBhbnN3ZXJba2V5XTtcbiAgICAgICAgaWYgKGlzQW55VmFsdWVSZWdleCh2YWx1ZXMpICYmICFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKHZhbHVlcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgdmFsdWVzXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJHJlZ2V4JzpcbiAgICAgICAgdmFyIHMgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh0eXBlb2YgcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIHJlZ2V4OiAnICsgcyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBzO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJGNvbnRhaW5lZEJ5Jzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJGNvbnRhaW5lZEJ5OiBzaG91bGQgYmUgYW4gYXJyYXlgXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXIuJGVsZW1NYXRjaCA9IHtcbiAgICAgICAgICAkbmluOiBhcnIubWFwKHRyYW5zZm9ybWVyKSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckb3B0aW9ucyc6XG4gICAgICAgIGFuc3dlcltrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJHRleHQnOiB7XG4gICAgICAgIGNvbnN0IHNlYXJjaCA9IGNvbnN0cmFpbnRba2V5XS4kc2VhcmNoO1xuICAgICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2BcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJHNlYXJjaDogc2VhcmNoLiR0ZXJtLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJlxuICAgICAgICAgIHR5cGVvZiBzZWFyY2guJGNhc2VTZW5zaXRpdmUgIT09ICdib29sZWFuJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kY2FzZVNlbnNpdGl2ZSA9IHNlYXJjaC4kY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiZcbiAgICAgICAgICB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGRpYWNyaXRpY1NlbnNpdGl2ZSA9IHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG5lYXJTcGhlcmUnOiB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICBhbnN3ZXIuJGdlb1dpdGhpbiA9IHtcbiAgICAgICAgICAgICRjZW50ZXJTcGhlcmU6IFtcbiAgICAgICAgICAgICAgW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLFxuICAgICAgICAgICAgICBjb25zdHJhaW50LiRtYXhEaXN0YW5jZSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZSc6IHtcbiAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgLy8gVGhlIFNES3MgZG9uJ3Qgc2VlbSB0byB1c2UgdGhlc2UgYnV0IHRoZXkgYXJlIGRvY3VtZW50ZWQgaW4gdGhlXG4gICAgICAvLyBSRVNUIEFQSSBkb2NzLlxuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5SYWRpYW5zJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJbk1pbGVzJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XSAvIDM5NTk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XSAvIDYzNzE7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckc2VsZWN0JzpcbiAgICAgIGNhc2UgJyRkb250U2VsZWN0JzpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgJ3RoZSAnICsga2V5ICsgJyBjb25zdHJhaW50IGlzIG5vdCBzdXBwb3J0ZWQgeWV0J1xuICAgICAgICApO1xuXG4gICAgICBjYXNlICckd2l0aGluJzpcbiAgICAgICAgdmFyIGJveCA9IGNvbnN0cmFpbnRba2V5XVsnJGJveCddO1xuICAgICAgICBpZiAoIWJveCB8fCBib3gubGVuZ3RoICE9IDIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnbWFsZm9ybWF0dGVkICR3aXRoaW4gYXJnJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgJGJveDogW1xuICAgICAgICAgICAgW2JveFswXS5sb25naXR1ZGUsIGJveFswXS5sYXRpdHVkZV0sXG4gICAgICAgICAgICBbYm94WzFdLmxvbmdpdHVkZSwgYm94WzFdLmxhdGl0dWRlXSxcbiAgICAgICAgICBdLFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJGdlb1dpdGhpbic6IHtcbiAgICAgICAgY29uc3QgcG9seWdvbiA9IGNvbnN0cmFpbnRba2V5XVsnJHBvbHlnb24nXTtcbiAgICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gY29uc3RyYWludFtrZXldWyckY2VudGVyU3BoZXJlJ107XG4gICAgICAgIGlmIChwb2x5Z29uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsZXQgcG9pbnRzO1xuICAgICAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgICAgIH0gZWxzZSBpZiAocG9seWdvbiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwb2ludHMgPSBwb2ludHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHBvaW50O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZSdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV07XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgICAkcG9seWdvbjogcG9pbnRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSBpZiAoY2VudGVyU3BoZXJlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRjZW50ZXJTcGhlcmU6IFtbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sIGRpc3RhbmNlXSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb0ludGVyc2VjdHMnOiB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gY29uc3RyYWludFtrZXldWyckcG9pbnQnXTtcbiAgICAgICAgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAkZ2VvbWV0cnk6IHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludCcsXG4gICAgICAgICAgICBjb29yZGluYXRlczogW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGtleS5tYXRjaCgvXlxcJCsvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgY29uc3RyYWludDogJyArIGtleVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gVHJhbnNmb3JtcyBhbiB1cGRhdGUgb3BlcmF0b3IgZnJvbSBSRVNUIGZvcm1hdCB0byBtb25nbyBmb3JtYXQuXG4vLyBUbyBiZSB0cmFuc2Zvcm1lZCwgdGhlIGlucHV0IHNob3VsZCBoYXZlIGFuIF9fb3AgZmllbGQuXG4vLyBJZiBmbGF0dGVuIGlzIHRydWUsIHRoaXMgd2lsbCBmbGF0dGVuIG9wZXJhdG9ycyB0byB0aGVpciBzdGF0aWNcbi8vIGRhdGEgZm9ybWF0LiBGb3IgZXhhbXBsZSwgYW4gaW5jcmVtZW50IG9mIDIgd291bGQgc2ltcGx5IGJlY29tZSBhXG4vLyAyLlxuLy8gVGhlIG91dHB1dCBmb3IgYSBub24tZmxhdHRlbmVkIG9wZXJhdG9yIGlzIGEgaGFzaCB3aXRoIF9fb3AgYmVpbmdcbi8vIHRoZSBtb25nbyBvcCwgYW5kIGFyZyBiZWluZyB0aGUgYXJndW1lbnQuXG4vLyBUaGUgb3V0cHV0IGZvciBhIGZsYXR0ZW5lZCBvcGVyYXRvciBpcyBqdXN0IGEgdmFsdWUuXG4vLyBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGlzIHNob3VsZCBiZSBhIG5vLW9wLlxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcih7IF9fb3AsIGFtb3VudCwgb2JqZWN0cyB9LCBmbGF0dGVuKSB7XG4gIHN3aXRjaCAoX19vcCkge1xuICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyR1bnNldCcsIGFyZzogJycgfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICBpZiAodHlwZW9mIGFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnaW5jcmVtZW50aW5nIG11c3QgcHJvdmlkZSBhIG51bWJlcidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiBhbW91bnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJGluYycsIGFyZzogYW1vdW50IH07XG4gICAgICB9XG5cbiAgICBjYXNlICdBZGQnOlxuICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBpZiAoIShvYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB2YXIgdG9BZGQgPSBvYmplY3RzLm1hcCh0cmFuc2Zvcm1JbnRlcmlvckF0b20pO1xuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIHRvQWRkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIG1vbmdvT3AgPSB7XG4gICAgICAgICAgQWRkOiAnJHB1c2gnLFxuICAgICAgICAgIEFkZFVuaXF1ZTogJyRhZGRUb1NldCcsXG4gICAgICAgIH1bX19vcF07XG4gICAgICAgIHJldHVybiB7IF9fb3A6IG1vbmdvT3AsIGFyZzogeyAkZWFjaDogdG9BZGQgfSB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgIGlmICghKG9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnb2JqZWN0cyB0byByZW1vdmUgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHZhciB0b1JlbW92ZSA9IG9iamVjdHMubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJHB1bGxBbGwnLCBhcmc6IHRvUmVtb3ZlIH07XG4gICAgICB9XG5cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICBgVGhlICR7X19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgKTtcbiAgfVxufVxuZnVuY3Rpb24gbWFwVmFsdWVzKG9iamVjdCwgaXRlcmF0b3IpIHtcbiAgY29uc3QgcmVzdWx0ID0ge307XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgIHJlc3VsdFtrZXldID0gaXRlcmF0b3Iob2JqZWN0W2tleV0pO1xuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuY29uc3QgbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0ID0gbW9uZ29PYmplY3QgPT4ge1xuICBzd2l0Y2ggKHR5cGVvZiBtb25nb09iamVjdCkge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgJ2JhZCB2YWx1ZSBpbiBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QnO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAobW9uZ29PYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QubWFwKG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIFBhcnNlLl9lbmNvZGUobW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkxvbmcpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnRvTnVtYmVyKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuRG91YmxlKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KG1vbmdvT2JqZWN0KSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTihtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgbW9uZ29PYmplY3QuaGFzT3duUHJvcGVydHkoJ19fdHlwZScpICYmXG4gICAgICAgIG1vbmdvT2JqZWN0Ll9fdHlwZSA9PSAnRGF0ZScgJiZcbiAgICAgICAgbW9uZ29PYmplY3QuaXNvIGluc3RhbmNlb2YgRGF0ZVxuICAgICAgKSB7XG4gICAgICAgIG1vbmdvT2JqZWN0LmlzbyA9IG1vbmdvT2JqZWN0Lmlzby50b0pTT04oKTtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbWFwVmFsdWVzKG1vbmdvT2JqZWN0LCBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAndW5rbm93biBqcyB0eXBlJztcbiAgfVxufTtcblxuY29uc3QgdHJhbnNmb3JtUG9pbnRlclN0cmluZyA9IChzY2hlbWEsIGZpZWxkLCBwb2ludGVyU3RyaW5nKSA9PiB7XG4gIGNvbnN0IG9iakRhdGEgPSBwb2ludGVyU3RyaW5nLnNwbGl0KCckJyk7XG4gIGlmIChvYmpEYXRhWzBdICE9PSBzY2hlbWEuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcykge1xuICAgIHRocm93ICdwb2ludGVyIHRvIGluY29ycmVjdCBjbGFzc05hbWUnO1xuICB9XG4gIHJldHVybiB7XG4gICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgY2xhc3NOYW1lOiBvYmpEYXRhWzBdLFxuICAgIG9iamVjdElkOiBvYmpEYXRhWzFdLFxuICB9O1xufTtcblxuLy8gQ29udmVydHMgZnJvbSBhIG1vbmdvLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4vLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuY29uc3QgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0ID0gKGNsYXNzTmFtZSwgbW9uZ29PYmplY3QsIHNjaGVtYSkgPT4ge1xuICBzd2l0Y2ggKHR5cGVvZiBtb25nb09iamVjdCkge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgJ2JhZCB2YWx1ZSBpbiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QnO1xuICAgIGNhc2UgJ29iamVjdCc6IHtcbiAgICAgIGlmIChtb25nb09iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC5tYXAobmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICByZXR1cm4gUGFyc2UuX2VuY29kZShtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuTG9uZykge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudG9OdW1iZXIoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Eb3VibGUpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnZhbHVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QobW9uZ29PYmplY3QpKSB7XG4gICAgICAgIHJldHVybiBCeXRlc0NvZGVyLmRhdGFiYXNlVG9KU09OKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdE9iamVjdCA9IHt9O1xuICAgICAgaWYgKG1vbmdvT2JqZWN0Ll9ycGVybSB8fCBtb25nb09iamVjdC5fd3Blcm0pIHtcbiAgICAgICAgcmVzdE9iamVjdC5fcnBlcm0gPSBtb25nb09iamVjdC5fcnBlcm0gfHwgW107XG4gICAgICAgIHJlc3RPYmplY3QuX3dwZXJtID0gbW9uZ29PYmplY3QuX3dwZXJtIHx8IFtdO1xuICAgICAgICBkZWxldGUgbW9uZ29PYmplY3QuX3JwZXJtO1xuICAgICAgICBkZWxldGUgbW9uZ29PYmplY3QuX3dwZXJtO1xuICAgICAgfVxuXG4gICAgICBmb3IgKHZhciBrZXkgaW4gbW9uZ29PYmplY3QpIHtcbiAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICBjYXNlICdfaWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnb2JqZWN0SWQnXSA9ICcnICsgbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19oYXNoZWRfcGFzc3dvcmQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdC5faGFzaGVkX3Bhc3N3b3JkID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19hY2wnOlxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgICAgICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgICAgICBjYXNlICdfdG9tYnN0b25lJzpcbiAgICAgICAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgICAgICAgY2FzZSAnX3Bhc3N3b3JkX2hpc3RvcnknOlxuICAgICAgICAgICAgLy8gVGhvc2Uga2V5cyB3aWxsIGJlIGRlbGV0ZWQgaWYgbmVlZGVkIGluIHRoZSBEQiBDb250cm9sbGVyXG4gICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX3Nlc3Npb25fdG9rZW4nOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnc2Vzc2lvblRva2VuJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgICAgICBjYXNlICdfdXBkYXRlZF9hdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Wyd1cGRhdGVkQXQnXSA9IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgICAgICAgIG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pXG4gICAgICAgICAgICApLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgICAgICAgY2FzZSAnX2NyZWF0ZWRfYXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnY3JlYXRlZEF0J10gPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICAgICAgICBuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKVxuICAgICAgICAgICAgKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgICAgICAgIGNhc2UgJ19leHBpcmVzQXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnZXhwaXJlc0F0J10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICAgICAgICBjYXNlICdfbGFzdF91c2VkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2xhc3RVc2VkJ10gPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICAgICAgICBuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKVxuICAgICAgICAgICAgKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgICAgIGNhc2UgJ3RpbWVzX3VzZWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsndGltZXNVc2VkJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIC8vIENoZWNrIG90aGVyIGF1dGggZGF0YSBrZXlzXG4gICAgICAgICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGtleS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgICAgICAgcmVzdE9iamVjdFsnYXV0aERhdGEnXSA9IHJlc3RPYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChrZXkuaW5kZXhPZignX3BfJykgPT0gMCkge1xuICAgICAgICAgICAgICB2YXIgbmV3S2V5ID0ga2V5LnN1YnN0cmluZygzKTtcbiAgICAgICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW25ld0tleV0pIHtcbiAgICAgICAgICAgICAgICBsb2cuaW5mbyhcbiAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0uanMnLFxuICAgICAgICAgICAgICAgICAgJ0ZvdW5kIGEgcG9pbnRlciBjb2x1bW4gbm90IGluIHRoZSBzY2hlbWEsIGRyb3BwaW5nIGl0LicsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBuZXdLZXlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW25ld0tleV0udHlwZSAhPT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgICAgICAgbG9nLmluZm8oXG4gICAgICAgICAgICAgICAgICAndHJhbnNmb3JtLmpzJyxcbiAgICAgICAgICAgICAgICAgICdGb3VuZCBhIHBvaW50ZXIgaW4gYSBub24tcG9pbnRlciBjb2x1bW4sIGRyb3BwaW5nIGl0LicsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBrZXlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChtb25nb09iamVjdFtrZXldID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmVzdE9iamVjdFtuZXdLZXldID0gdHJhbnNmb3JtUG9pbnRlclN0cmluZyhcbiAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgbmV3S2V5LFxuICAgICAgICAgICAgICAgIG1vbmdvT2JqZWN0W2tleV1cbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGtleVswXSA9PSAnXycgJiYga2V5ICE9ICdfX3R5cGUnKSB7XG4gICAgICAgICAgICAgIHRocm93ICdiYWQga2V5IGluIHVudHJhbnNmb3JtOiAnICsga2V5O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmFyIHZhbHVlID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnRmlsZScgJiZcbiAgICAgICAgICAgICAgICBGaWxlQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBGaWxlQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50JyAmJlxuICAgICAgICAgICAgICAgIEdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBHZW9Qb2ludENvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2x5Z29uJyAmJlxuICAgICAgICAgICAgICAgIFBvbHlnb25Db2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IFBvbHlnb25Db2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICAgICAgICAgICAgQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QoXG4gICAgICAgICAgICAgIG1vbmdvT2JqZWN0W2tleV1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICk7XG4gICAgICBjb25zdCByZWxhdGlvbkZpZWxkcyA9IHt9O1xuICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLmZvckVhY2gocmVsYXRpb25GaWVsZE5hbWUgPT4ge1xuICAgICAgICByZWxhdGlvbkZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgLi4ucmVzdE9iamVjdCwgLi4ucmVsYXRpb25GaWVsZHMgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICd1bmtub3duIGpzIHR5cGUnO1xuICB9XG59O1xuXG52YXIgRGF0ZUNvZGVyID0ge1xuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKGpzb24uaXNvKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnXG4gICAgKTtcbiAgfSxcbn07XG5cbnZhciBCeXRlc0NvZGVyID0ge1xuICBiYXNlNjRQYXR0ZXJuOiBuZXcgUmVnRXhwKFxuICAgICdeKD86W0EtWmEtejAtOSsvXXs0fSkqKD86W0EtWmEtejAtOSsvXXsyfT09fFtBLVphLXowLTkrL117M309KT8kJ1xuICApLFxuICBpc0Jhc2U2NFZhbHVlKG9iamVjdCkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5iYXNlNjRQYXR0ZXJuLnRlc3Qob2JqZWN0KTtcbiAgfSxcblxuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICBsZXQgdmFsdWU7XG4gICAgaWYgKHRoaXMuaXNCYXNlNjRWYWx1ZShvYmplY3QpKSB7XG4gICAgICB2YWx1ZSA9IG9iamVjdDtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgPSBvYmplY3QuYnVmZmVyLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgIGJhc2U2NDogdmFsdWUsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuQmluYXJ5IHx8IHRoaXMuaXNCYXNlNjRWYWx1ZShvYmplY3QpO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4gbmV3IG1vbmdvZGIuQmluYXJ5KG5ldyBCdWZmZXIoanNvbi5iYXNlNjQsICdiYXNlNjQnKSk7XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdCeXRlcydcbiAgICApO1xuICB9LFxufTtcblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGRhdGFiYXNlVG9KU09OKG9iamVjdCkge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICBsYXRpdHVkZTogb2JqZWN0WzFdLFxuICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbMF0sXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIEFycmF5ICYmIG9iamVjdC5sZW5ndGggPT0gMjtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIFtqc29uLmxvbmdpdHVkZSwganNvbi5sYXRpdHVkZV07XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCdcbiAgICApO1xuICB9LFxufTtcblxudmFyIFBvbHlnb25Db2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgLy8gQ29udmVydCBsbmcvbGF0IC0+IGxhdC9sbmdcbiAgICBjb25zdCBjb29yZHMgPSBvYmplY3QuY29vcmRpbmF0ZXNbMF0ubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICBjb29yZGluYXRlczogY29vcmRzLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIGNvbnN0IGNvb3JkcyA9IG9iamVjdC5jb29yZGluYXRlc1swXTtcbiAgICBpZiAob2JqZWN0LnR5cGUgIT09ICdQb2x5Z29uJyB8fCAhKGNvb3JkcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcG9pbnQgPSBjb29yZHNbaV07XG4gICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHBvaW50KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocGFyc2VGbG9hdChwb2ludFsxXSksIHBhcnNlRmxvYXQocG9pbnRbMF0pKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIGxldCBjb29yZHMgPSBqc29uLmNvb3JkaW5hdGVzO1xuICAgIC8vIEFkZCBmaXJzdCBwb2ludCB0byB0aGUgZW5kIHRvIGNsb3NlIHBvbHlnb25cbiAgICBpZiAoXG4gICAgICBjb29yZHNbMF1bMF0gIT09IGNvb3Jkc1tjb29yZHMubGVuZ3RoIC0gMV1bMF0gfHxcbiAgICAgIGNvb3Jkc1swXVsxXSAhPT0gY29vcmRzW2Nvb3Jkcy5sZW5ndGggLSAxXVsxXVxuICAgICkge1xuICAgICAgY29vcmRzLnB1c2goY29vcmRzWzBdKTtcbiAgICB9XG4gICAgY29uc3QgdW5pcXVlID0gY29vcmRzLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgICBsZXQgZm91bmRJbmRleCA9IC0xO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgICBpZiAocHRbMF0gPT09IGl0ZW1bMF0gJiYgcHRbMV0gPT09IGl0ZW1bMV0pIHtcbiAgICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICAgIH0pO1xuICAgIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIENvbnZlcnQgbGF0L2xvbmcgLT4gbG9uZy9sYXRcbiAgICBjb29yZHMgPSBjb29yZHMubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4geyB0eXBlOiAnUG9seWdvbicsIGNvb3JkaW5hdGVzOiBbY29vcmRzXSB9O1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnUG9seWdvbidcbiAgICApO1xuICB9LFxufTtcblxudmFyIEZpbGVDb2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgbmFtZTogb2JqZWN0LFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiB0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJztcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIGpzb24ubmFtZTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnXG4gICAgKTtcbiAgfSxcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0cmFuc2Zvcm1LZXksXG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgdHJhbnNmb3JtVXBkYXRlLFxuICB0cmFuc2Zvcm1XaGVyZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICByZWxhdGl2ZVRpbWVUb0RhdGUsXG4gIHRyYW5zZm9ybUNvbnN0cmFpbnQsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59O1xuIl19