"use strict";

var _logger = _interopRequireDefault(require("../../../logger"));

var _lodash = _interopRequireDefault(require("lodash"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

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

  if (parseFormatSchema.fields[key] && parseFormatSchema.fields[key].type === 'Pointer' || !key.includes('.') && !parseFormatSchema.fields[key] && restValue && restValue.__type == 'Pointer' // Do not use the _p_ prefix for pointers inside nested documents
  ) {
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

  if (expectedTypeIsPointer || !schema && !key.includes('.') && value && value.__type === 'Pointer') {
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


  const transformRes = key.includes('.') ? transformInteriorAtom(value) : transformTopLevelAtom(value);

  if (transformRes !== CannotTransform) {
    return {
      key,
      value: transformRes
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

            case 'authData':
              if (className === '_User') {
                _logger.default.warn('ignoring authData in _User as this key is reserved to be synthesized of `_auth_data_*` keys');
              } else {
                restObject['authData'] = mongoObject[key];
              }

              break;

            default:
              // Check other auth data keys
              var authDataMatch = key.match(/^_auth_data_([a-zA-Z0-9_]+)$/);

              if (authDataMatch && className === '_User') {
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
        return _objectSpread(_objectSpread({}, restObject), relationFields);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvVHJhbnNmb3JtLmpzIl0sIm5hbWVzIjpbIm1vbmdvZGIiLCJyZXF1aXJlIiwiUGFyc2UiLCJ0cmFuc2Zvcm1LZXkiLCJjbGFzc05hbWUiLCJmaWVsZE5hbWUiLCJzY2hlbWEiLCJmaWVsZHMiLCJfX3R5cGUiLCJ0eXBlIiwidHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUiLCJyZXN0S2V5IiwicmVzdFZhbHVlIiwicGFyc2VGb3JtYXRTY2hlbWEiLCJrZXkiLCJ0aW1lRmllbGQiLCJpbmNsdWRlcyIsInZhbHVlIiwicGFyc2VJbnQiLCJ0cmFuc2Zvcm1Ub3BMZXZlbEF0b20iLCJDYW5ub3RUcmFuc2Zvcm0iLCJEYXRlIiwiaW5kZXhPZiIsIkFycmF5IiwibWFwIiwidHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSIsInRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yIiwibWFwVmFsdWVzIiwiaXNSZWdleCIsIlJlZ0V4cCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwibWF0Y2hlcyIsInRvU3RyaW5nIiwibWF0Y2giLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwidmFsdWVzIiwiaXNBcnJheSIsImxlbmd0aCIsImZpcnN0VmFsdWVzSXNSZWdleCIsImkiLCJpc0FueVZhbHVlUmVnZXgiLCJzb21lIiwiT2JqZWN0Iiwia2V5cyIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwiZXhwZWN0ZWRUeXBlSXNBcnJheSIsImV4cGVjdGVkVHlwZUlzUG9pbnRlciIsImZpZWxkIiwidHJhbnNmb3JtZWRDb25zdHJhaW50IiwidHJhbnNmb3JtQ29uc3RyYWludCIsIiR0ZXh0IiwiJGVsZW1NYXRjaCIsIiRhbGwiLCJ0cmFuc2Zvcm1SZXMiLCJJTlZBTElEX0pTT04iLCJyZXN0V2hlcmUiLCJtb25nb1doZXJlIiwib3V0IiwicGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSIsInRyYW5zZm9ybWVkVmFsdWUiLCJjb2VyY2VkVG9EYXRlIiwiSU5WQUxJRF9LRVlfTkFNRSIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsInJlc3RDcmVhdGUiLCJhZGRMZWdhY3lBQ0wiLCJtb25nb0NyZWF0ZSIsInVuZGVmaW5lZCIsImNyZWF0ZWRBdCIsIl9jcmVhdGVkX2F0IiwiaXNvIiwidXBkYXRlZEF0IiwiX3VwZGF0ZWRfYXQiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJyZXN0VXBkYXRlIiwibW9uZ29VcGRhdGUiLCJhY2wiLCJfcnBlcm0iLCJfd3Blcm0iLCJfYWNsIiwiJHNldCIsIl9fb3AiLCJhcmciLCJyZXN0T2JqZWN0IiwicmVzdE9iamVjdENvcHkiLCJmb3JFYWNoIiwiZW50cnkiLCJ3IiwiciIsImF0b20iLCJvYmplY3RJZCIsIkRhdGVDb2RlciIsImlzVmFsaWRKU09OIiwiSlNPTlRvRGF0YWJhc2UiLCJCeXRlc0NvZGVyIiwiJHJlZ2V4IiwidGFyZ2V0Q2xhc3MiLCJHZW9Qb2ludENvZGVyIiwiUG9seWdvbkNvZGVyIiwiRmlsZUNvZGVyIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwicmVsYXRpdmVUaW1lVG9EYXRlIiwidGV4dCIsIm5vdyIsInRvTG93ZXJDYXNlIiwicGFydHMiLCJzcGxpdCIsImZpbHRlciIsInBhcnQiLCJmdXR1cmUiLCJwYXN0Iiwic3RhdHVzIiwiaW5mbyIsInNsaWNlIiwicGFpcnMiLCJwdXNoIiwic2hpZnQiLCJzZWNvbmRzIiwibnVtIiwiaW50ZXJ2YWwiLCJ2YWwiLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJtaWxsaXNlY29uZHMiLCJyZXN1bHQiLCJ2YWx1ZU9mIiwiY29uc3RyYWludCIsImluQXJyYXkiLCJ0cmFuc2Zvcm1GdW5jdGlvbiIsInRyYW5zZm9ybWVyIiwiSlNPTiIsInN0cmluZ2lmeSIsInNvcnQiLCJyZXZlcnNlIiwiYW5zd2VyIiwiJHJlbGF0aXZlVGltZSIsInBhcnNlclJlc3VsdCIsImxvZyIsImFyciIsIl8iLCJmbGF0TWFwIiwicyIsIiRuaW4iLCJzZWFyY2giLCIkc2VhcmNoIiwiJHRlcm0iLCIkbGFuZ3VhZ2UiLCIkY2FzZVNlbnNpdGl2ZSIsIiRkaWFjcml0aWNTZW5zaXRpdmUiLCJwb2ludCIsIiRnZW9XaXRoaW4iLCIkY2VudGVyU3BoZXJlIiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkbWF4RGlzdGFuY2UiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwiYm94IiwiJGJveCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJwb2ludHMiLCJjb29yZGluYXRlcyIsIkdlb1BvaW50IiwiX3ZhbGlkYXRlIiwiJHBvbHlnb24iLCJkaXN0YW5jZSIsImlzTmFOIiwiJGdlb21ldHJ5IiwiYW1vdW50Iiwib2JqZWN0cyIsImZsYXR0ZW4iLCJ0b0FkZCIsIm1vbmdvT3AiLCJBZGQiLCJBZGRVbmlxdWUiLCIkZWFjaCIsInRvUmVtb3ZlIiwib2JqZWN0IiwiaXRlcmF0b3IiLCJuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QiLCJtb25nb09iamVjdCIsIl9lbmNvZGUiLCJMb25nIiwidG9OdW1iZXIiLCJEb3VibGUiLCJpc1ZhbGlkRGF0YWJhc2VPYmplY3QiLCJkYXRhYmFzZVRvSlNPTiIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInRvSlNPTiIsInRyYW5zZm9ybVBvaW50ZXJTdHJpbmciLCJwb2ludGVyU3RyaW5nIiwib2JqRGF0YSIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJ3YXJuIiwibmV3S2V5Iiwic3Vic3RyaW5nIiwicmVsYXRpb25GaWVsZE5hbWVzIiwicmVsYXRpb25GaWVsZHMiLCJyZWxhdGlvbkZpZWxkTmFtZSIsImpzb24iLCJiYXNlNjRQYXR0ZXJuIiwiaXNCYXNlNjRWYWx1ZSIsInRlc3QiLCJidWZmZXIiLCJiYXNlNjQiLCJCaW5hcnkiLCJCdWZmZXIiLCJmcm9tIiwiY29vcmRzIiwiY29vcmQiLCJwYXJzZUZsb2F0IiwidW5pcXVlIiwiaXRlbSIsImluZGV4IiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJuYW1lIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7QUFDQTs7Ozs7Ozs7OztBQUNBLElBQUlBLE9BQU8sR0FBR0MsT0FBTyxDQUFDLFNBQUQsQ0FBckI7O0FBQ0EsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCQyxLQUFsQzs7QUFFQSxNQUFNQyxZQUFZLEdBQUcsQ0FBQ0MsU0FBRCxFQUFZQyxTQUFaLEVBQXVCQyxNQUF2QixLQUFrQztBQUNyRDtBQUNBLFVBQVFELFNBQVI7QUFDRSxTQUFLLFVBQUw7QUFDRSxhQUFPLEtBQVA7O0FBQ0YsU0FBSyxXQUFMO0FBQ0UsYUFBTyxhQUFQOztBQUNGLFNBQUssV0FBTDtBQUNFLGFBQU8sYUFBUDs7QUFDRixTQUFLLGNBQUw7QUFDRSxhQUFPLGdCQUFQOztBQUNGLFNBQUssVUFBTDtBQUNFLGFBQU8sWUFBUDs7QUFDRixTQUFLLFdBQUw7QUFDRSxhQUFPLFlBQVA7QUFaSjs7QUFlQSxNQUFJQyxNQUFNLENBQUNDLE1BQVAsQ0FBY0YsU0FBZCxLQUE0QkMsTUFBTSxDQUFDQyxNQUFQLENBQWNGLFNBQWQsRUFBeUJHLE1BQXpCLElBQW1DLFNBQW5FLEVBQThFO0FBQzVFSCxJQUFBQSxTQUFTLEdBQUcsUUFBUUEsU0FBcEI7QUFDRCxHQUZELE1BRU8sSUFBSUMsTUFBTSxDQUFDQyxNQUFQLENBQWNGLFNBQWQsS0FBNEJDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjRixTQUFkLEVBQXlCSSxJQUF6QixJQUFpQyxTQUFqRSxFQUE0RTtBQUNqRkosSUFBQUEsU0FBUyxHQUFHLFFBQVFBLFNBQXBCO0FBQ0Q7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LEVBQUUsTUFESDtBQUVMNE4sTUFBQUEsSUFBSSxFQUFFM0M7QUFGRCxLQUFQO0FBSUQsR0FOYTs7QUFRZFEsRUFBQUEscUJBQXFCLENBQUNSLE1BQUQsRUFBUztBQUM1QixXQUFPLE9BQU9BLE1BQVAsS0FBa0IsUUFBekI7QUFDRCxHQVZhOztBQVlkcEYsRUFBQUEsY0FBYyxDQUFDNkcsSUFBRCxFQUFPO0FBQ25CLFdBQU9BLElBQUksQ0FBQ2tCLElBQVo7QUFDRCxHQWRhOztBQWdCZGhJLEVBQUFBLFdBQVcsQ0FBQ25GLEtBQUQsRUFBUTtBQUNqQixXQUFPLE9BQU9BLEtBQVAsS0FBaUIsUUFBakIsSUFBNkJBLEtBQUssS0FBSyxJQUF2QyxJQUErQ0EsS0FBSyxDQUFDVCxNQUFOLEtBQWlCLE1BQXZFO0FBQ0Q7O0FBbEJhLENBQWhCO0FBcUJBNk4sTUFBTSxDQUFDQyxPQUFQLEdBQWlCO0FBQ2ZuTyxFQUFBQSxZQURlO0FBRWZvRSxFQUFBQSxpQ0FGZTtBQUdmVSxFQUFBQSxlQUhlO0FBSWY5QixFQUFBQSxjQUplO0FBS2Z1SixFQUFBQSx3QkFMZTtBQU1mN0YsRUFBQUEsa0JBTmU7QUFPZm5ELEVBQUFBLG1CQVBlO0FBUWY2SSxFQUFBQTtBQVJlLENBQWpCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGxvZyBmcm9tICcuLi8uLi8uLi9sb2dnZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbnZhciBtb25nb2RiID0gcmVxdWlyZSgnbW9uZ29kYicpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuXG5jb25zdCB0cmFuc2Zvcm1LZXkgPSAoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSkgPT4ge1xuICAvLyBDaGVjayBpZiB0aGUgc2NoZW1hIGlzIGtub3duIHNpbmNlIGl0J3MgYSBidWlsdC1pbiBmaWVsZC5cbiAgc3dpdGNoIChmaWVsZE5hbWUpIHtcbiAgICBjYXNlICdvYmplY3RJZCc6XG4gICAgICByZXR1cm4gJ19pZCc7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgIHJldHVybiAnX2NyZWF0ZWRfYXQnO1xuICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgICByZXR1cm4gJ191cGRhdGVkX2F0JztcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgICAgcmV0dXJuICdfc2Vzc2lvbl90b2tlbic7XG4gICAgY2FzZSAnbGFzdFVzZWQnOlxuICAgICAgcmV0dXJuICdfbGFzdF91c2VkJztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgcmV0dXJuICd0aW1lc191c2VkJztcbiAgfVxuXG4gIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLl9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICBmaWVsZE5hbWUgPSAnX3BfJyArIGZpZWxkTmFtZTtcbiAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgZmllbGROYW1lID0gJ19wXycgKyBmaWVsZE5hbWU7XG4gIH1cblxuICByZXR1cm4gZmllbGROYW1lO1xufTtcblxuY29uc3QgdHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUgPSAoY2xhc3NOYW1lLCByZXN0S2V5LCByZXN0VmFsdWUsIHBhcnNlRm9ybWF0U2NoZW1hKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICB2YXIga2V5ID0gcmVzdEtleTtcbiAgdmFyIHRpbWVGaWVsZCA9IGZhbHNlO1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICBjYXNlICdfaWQnOlxuICAgICAgaWYgKFsnX0dsb2JhbENvbmZpZycsICdfR3JhcGhRTENvbmZpZyddLmluY2x1ZGVzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgICB2YWx1ZTogcGFyc2VJbnQocmVzdFZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfaWQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICBjYXNlICdfY3JlYXRlZF9hdCc6XG4gICAgICBrZXkgPSAnX2NyZWF0ZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgY2FzZSAnX3VwZGF0ZWRfYXQnOlxuICAgICAga2V5ID0gJ191cGRhdGVkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgIGNhc2UgJ19zZXNzaW9uX3Rva2VuJzpcbiAgICAgIGtleSA9ICdfc2Vzc2lvbl90b2tlbic7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgIGNhc2UgJ19leHBpcmVzQXQnOlxuICAgICAga2V5ID0gJ2V4cGlyZXNBdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgIGtleSA9ICdfZmFpbGVkX2xvZ2luX2NvdW50JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgIGtleSA9ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgICAgcmV0dXJuIHsga2V5OiBrZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgY2FzZSAnX2xhc3RfdXNlZCc6XG4gICAgICBrZXkgPSAnX2xhc3RfdXNlZCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICBjYXNlICd0aW1lc191c2VkJzpcbiAgICAgIGtleSA9ICd0aW1lc191c2VkJztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgfVxuXG4gIGlmIChcbiAgICAocGFyc2VGb3JtYXRTY2hlbWEuZmllbGRzW2tleV0gJiYgcGFyc2VGb3JtYXRTY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICgha2V5LmluY2x1ZGVzKCcuJykgJiZcbiAgICAgICFwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgcmVzdFZhbHVlICYmXG4gICAgICByZXN0VmFsdWUuX190eXBlID09ICdQb2ludGVyJykgLy8gRG8gbm90IHVzZSB0aGUgX3BfIHByZWZpeCBmb3IgcG9pbnRlcnMgaW5zaWRlIG5lc3RlZCBkb2N1bWVudHNcbiAgKSB7XG4gICAga2V5ID0gJ19wXycgKyBrZXk7XG4gIH1cblxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICB2YXIgdmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgaWYgKHZhbHVlICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICBpZiAodGltZUZpZWxkICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHZhbHVlID0gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cbiAgICBpZiAocmVzdEtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICByZXR1cm4geyBrZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIGFycmF5c1xuICBpZiAocmVzdFZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB2YWx1ZSA9IHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIHVwZGF0ZSBvcGVyYXRvcnNcbiAgaWYgKHR5cGVvZiByZXN0VmFsdWUgPT09ICdvYmplY3QnICYmICdfX29wJyBpbiByZXN0VmFsdWUpIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcihyZXN0VmFsdWUsIGZhbHNlKSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICB2YWx1ZSA9IG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICByZXR1cm4geyBrZXksIHZhbHVlIH07XG59O1xuXG5jb25zdCBpc1JlZ2V4ID0gdmFsdWUgPT4ge1xuICByZXR1cm4gdmFsdWUgJiYgdmFsdWUgaW5zdGFuY2VvZiBSZWdFeHA7XG59O1xuXG5jb25zdCBpc1N0YXJ0c1dpdGhSZWdleCA9IHZhbHVlID0+IHtcbiAgaWYgKCFpc1JlZ2V4KHZhbHVlKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS50b1N0cmluZygpLm1hdGNoKC9cXC9cXF5cXFxcUS4qXFxcXEVcXC8vKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn07XG5cbmNvbnN0IGlzQWxsVmFsdWVzUmVnZXhPck5vbmUgPSB2YWx1ZXMgPT4ge1xuICBpZiAoIXZhbHVlcyB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZXMpIHx8IHZhbHVlcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGNvbnN0IGZpcnN0VmFsdWVzSXNSZWdleCA9IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1swXSk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0pKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5jb25zdCBpc0FueVZhbHVlUmVnZXggPSB2YWx1ZXMgPT4ge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzUmVnZXgodmFsdWUpO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUludGVyaW9yVmFsdWUgPSByZXN0VmFsdWUgPT4ge1xuICBpZiAoXG4gICAgcmVzdFZhbHVlICE9PSBudWxsICYmXG4gICAgdHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICBPYmplY3Qua2V5cyhyZXN0VmFsdWUpLnNvbWUoa2V5ID0+IGtleS5pbmNsdWRlcygnJCcpIHx8IGtleS5pbmNsdWRlcygnLicpKVxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICApO1xuICB9XG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybUludGVyaW9yQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhcnJheXNcbiAgaWYgKHJlc3RWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIH1cblxuICAvLyBIYW5kbGUgdXBkYXRlIG9wZXJhdG9yc1xuICBpZiAodHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ19fb3AnIGluIHJlc3RWYWx1ZSkge1xuICAgIHJldHVybiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcihyZXN0VmFsdWUsIHRydWUpO1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICByZXR1cm4gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG59O1xuXG5jb25zdCB2YWx1ZUFzRGF0ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1RdWVyeUtleVZhbHVlKGNsYXNzTmFtZSwga2V5LCB2YWx1ZSwgc2NoZW1hLCBjb3VudCA9IGZhbHNlKSB7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX2NyZWF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2NyZWF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX3VwZGF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnZXhwaXJlc0F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvYmplY3RJZCc6IHtcbiAgICAgIGlmIChbJ19HbG9iYWxDb25maWcnLCAnX0dyYXBoUUxDb25maWcnXS5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsga2V5OiAnX2lkJywgdmFsdWUgfTtcbiAgICB9XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX3Nlc3Npb25fdG9rZW4nLCB2YWx1ZSB9O1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuJzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICckb3InOlxuICAgIGNhc2UgJyRhbmQnOlxuICAgIGNhc2UgJyRub3InOlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIHZhbHVlOiB2YWx1ZS5tYXAoc3ViUXVlcnkgPT4gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBzdWJRdWVyeSwgc2NoZW1hLCBjb3VudCkpLFxuICAgICAgfTtcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19sYXN0X3VzZWQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2xhc3RfdXNlZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgcmV0dXJuIHsga2V5OiAndGltZXNfdXNlZCcsIHZhbHVlOiB2YWx1ZSB9O1xuICAgIGRlZmF1bHQ6IHtcbiAgICAgIC8vIE90aGVyIGF1dGggZGF0YVxuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICBjb25zdCBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIC8vIFNwZWNpYWwtY2FzZSBhdXRoIGRhdGEuXG4gICAgICAgIHJldHVybiB7IGtleTogYF9hdXRoX2RhdGFfJHtwcm92aWRlcn0uaWRgLCB2YWx1ZSB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGV4cGVjdGVkVHlwZUlzQXJyYXkgPSBzY2hlbWEgJiYgc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnQXJyYXknO1xuXG4gIGNvbnN0IGV4cGVjdGVkVHlwZUlzUG9pbnRlciA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuXG4gIGNvbnN0IGZpZWxkID0gc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XTtcbiAgaWYgKFxuICAgIGV4cGVjdGVkVHlwZUlzUG9pbnRlciB8fFxuICAgICghc2NoZW1hICYmICFrZXkuaW5jbHVkZXMoJy4nKSAmJiB2YWx1ZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJylcbiAgKSB7XG4gICAga2V5ID0gJ19wXycgKyBrZXk7XG4gIH1cblxuICAvLyBIYW5kbGUgcXVlcnkgY29uc3RyYWludHNcbiAgY29uc3QgdHJhbnNmb3JtZWRDb25zdHJhaW50ID0gdHJhbnNmb3JtQ29uc3RyYWludCh2YWx1ZSwgZmllbGQsIGNvdW50KTtcbiAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludCAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludC4kdGV4dCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJHRleHQnLCB2YWx1ZTogdHJhbnNmb3JtZWRDb25zdHJhaW50LiR0ZXh0IH07XG4gICAgfVxuICAgIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJGVsZW1NYXRjaCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJG5vcicsIHZhbHVlOiBbeyBba2V5XTogdHJhbnNmb3JtZWRDb25zdHJhaW50IH1dIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybWVkQ29uc3RyYWludCB9O1xuICB9XG5cbiAgaWYgKGV4cGVjdGVkVHlwZUlzQXJyYXkgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHsgJGFsbDogW3RyYW5zZm9ybUludGVyaW9yQXRvbSh2YWx1ZSldIH0gfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIGNvbnN0IHRyYW5zZm9ybVJlcyA9IGtleS5pbmNsdWRlcygnLicpXG4gICAgPyB0cmFuc2Zvcm1JbnRlcmlvckF0b20odmFsdWUpXG4gICAgOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpO1xuICBpZiAodHJhbnNmb3JtUmVzICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1SZXMgfTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgWW91IGNhbm5vdCB1c2UgJHt2YWx1ZX0gYXMgYSBxdWVyeSBwYXJhbWV0ZXIuYFxuICAgICk7XG4gIH1cbn1cblxuLy8gTWFpbiBleHBvc2VkIG1ldGhvZCB0byBoZWxwIHJ1biBxdWVyaWVzLlxuLy8gcmVzdFdoZXJlIGlzIHRoZSBcIndoZXJlXCIgY2xhdXNlIGluIFJFU1QgQVBJIGZvcm0uXG4vLyBSZXR1cm5zIHRoZSBtb25nbyBmb3JtIG9mIHRoZSBxdWVyeS5cbmZ1bmN0aW9uIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcmVzdFdoZXJlLCBzY2hlbWEsIGNvdW50ID0gZmFsc2UpIHtcbiAgY29uc3QgbW9uZ29XaGVyZSA9IHt9O1xuICBmb3IgKGNvbnN0IHJlc3RLZXkgaW4gcmVzdFdoZXJlKSB7XG4gICAgY29uc3Qgb3V0ID0gdHJhbnNmb3JtUXVlcnlLZXlWYWx1ZShjbGFzc05hbWUsIHJlc3RLZXksIHJlc3RXaGVyZVtyZXN0S2V5XSwgc2NoZW1hLCBjb3VudCk7XG4gICAgbW9uZ29XaGVyZVtvdXQua2V5XSA9IG91dC52YWx1ZTtcbiAgfVxuICByZXR1cm4gbW9uZ29XaGVyZTtcbn1cblxuY29uc3QgcGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSA9IChyZXN0S2V5LCByZXN0VmFsdWUsIHNjaGVtYSkgPT4ge1xuICAvLyBDaGVjayBpZiB0aGUgc2NoZW1hIGlzIGtub3duIHNpbmNlIGl0J3MgYSBidWlsdC1pbiBmaWVsZC5cbiAgbGV0IHRyYW5zZm9ybWVkVmFsdWU7XG4gIGxldCBjb2VyY2VkVG9EYXRlO1xuICBzd2l0Y2ggKHJlc3RLZXkpIHtcbiAgICBjYXNlICdvYmplY3RJZCc6XG4gICAgICByZXR1cm4geyBrZXk6ICdfaWQnLCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdleHBpcmVzQXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgY2FzZSAnX2hhc2hlZF9wYXNzd29yZCc6XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19zZXNzaW9uX3Rva2VuJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBBdXRoIGRhdGEgc2hvdWxkIGhhdmUgYmVlbiB0cmFuc2Zvcm1lZCBhbHJlYWR5XG4gICAgICBpZiAocmVzdEtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdjYW4gb25seSBxdWVyeSBvbiAnICsgcmVzdEtleSk7XG4gICAgICB9XG4gICAgICAvLyBUcnVzdCB0aGF0IHRoZSBhdXRoIGRhdGEgaGFzIGJlZW4gdHJhbnNmb3JtZWQgYW5kIHNhdmUgaXQgZGlyZWN0bHlcbiAgICAgIGlmIChyZXN0S2V5Lm1hdGNoKC9eX2F1dGhfZGF0YV9bYS16QS1aMC05X10rJC8pKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgICAgfVxuICB9XG4gIC8vc2tpcCBzdHJhaWdodCB0byB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20gZm9yIEJ5dGVzLCB0aGV5IGRvbid0IHNob3cgdXAgaW4gdGhlIHNjaGVtYSBmb3Igc29tZSByZWFzb25cbiAgaWYgKHJlc3RWYWx1ZSAmJiByZXN0VmFsdWUuX190eXBlICE9PSAnQnl0ZXMnKSB7XG4gICAgLy9Ob3RlOiBXZSBtYXkgbm90IGtub3cgdGhlIHR5cGUgb2YgYSBmaWVsZCBoZXJlLCBhcyB0aGUgdXNlciBjb3VsZCBiZSBzYXZpbmcgKG51bGwpIHRvIGEgZmllbGRcbiAgICAvL1RoYXQgbmV2ZXIgZXhpc3RlZCBiZWZvcmUsIG1lYW5pbmcgd2UgY2FuJ3QgaW5mZXIgdGhlIHR5cGUuXG4gICAgaWYgKFxuICAgICAgKHNjaGVtYS5maWVsZHNbcmVzdEtleV0gJiYgc2NoZW1hLmZpZWxkc1tyZXN0S2V5XS50eXBlID09ICdQb2ludGVyJykgfHxcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInXG4gICAgKSB7XG4gICAgICByZXN0S2V5ID0gJ19wXycgKyByZXN0S2V5O1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHZhbHVlIH07XG4gIH1cblxuICAvLyBBQ0xzIGFyZSBoYW5kbGVkIGJlZm9yZSB0aGlzIG1ldGhvZCBpcyBjYWxsZWRcbiAgLy8gSWYgYW4gQUNMIGtleSBzdGlsbCBleGlzdHMgaGVyZSwgc29tZXRoaW5nIGlzIHdyb25nLlxuICBpZiAocmVzdEtleSA9PT0gJ0FDTCcpIHtcbiAgICB0aHJvdyAnVGhlcmUgd2FzIGEgcHJvYmxlbSB0cmFuc2Zvcm1pbmcgYW4gQUNMLic7XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICBpZiAoT2JqZWN0LmtleXMocmVzdFZhbHVlKS5zb21lKGtleSA9PiBrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICApO1xuICB9XG4gIHZhbHVlID0gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWUgfTtcbn07XG5cbmNvbnN0IHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSA9IChjbGFzc05hbWUsIHJlc3RDcmVhdGUsIHNjaGVtYSkgPT4ge1xuICByZXN0Q3JlYXRlID0gYWRkTGVnYWN5QUNMKHJlc3RDcmVhdGUpO1xuICBjb25zdCBtb25nb0NyZWF0ZSA9IHt9O1xuICBmb3IgKGNvbnN0IHJlc3RLZXkgaW4gcmVzdENyZWF0ZSkge1xuICAgIGlmIChyZXN0Q3JlYXRlW3Jlc3RLZXldICYmIHJlc3RDcmVhdGVbcmVzdEtleV0uX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgeyBrZXksIHZhbHVlIH0gPSBwYXJzZU9iamVjdEtleVZhbHVlVG9Nb25nb09iamVjdEtleVZhbHVlKFxuICAgICAgcmVzdEtleSxcbiAgICAgIHJlc3RDcmVhdGVbcmVzdEtleV0sXG4gICAgICBzY2hlbWFcbiAgICApO1xuICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBtb25nb0NyZWF0ZVtrZXldID0gdmFsdWU7XG4gICAgfVxuICB9XG5cbiAgLy8gVXNlIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0IGZvciBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdFxuICBpZiAobW9uZ29DcmVhdGUuY3JlYXRlZEF0KSB7XG4gICAgbW9uZ29DcmVhdGUuX2NyZWF0ZWRfYXQgPSBuZXcgRGF0ZShtb25nb0NyZWF0ZS5jcmVhdGVkQXQuaXNvIHx8IG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdCk7XG4gICAgZGVsZXRlIG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdDtcbiAgfVxuICBpZiAobW9uZ29DcmVhdGUudXBkYXRlZEF0KSB7XG4gICAgbW9uZ29DcmVhdGUuX3VwZGF0ZWRfYXQgPSBuZXcgRGF0ZShtb25nb0NyZWF0ZS51cGRhdGVkQXQuaXNvIHx8IG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdCk7XG4gICAgZGVsZXRlIG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdDtcbiAgfVxuXG4gIHJldHVybiBtb25nb0NyZWF0ZTtcbn07XG5cbi8vIE1haW4gZXhwb3NlZCBtZXRob2QgdG8gaGVscCB1cGRhdGUgb2xkIG9iamVjdHMuXG5jb25zdCB0cmFuc2Zvcm1VcGRhdGUgPSAoY2xhc3NOYW1lLCByZXN0VXBkYXRlLCBwYXJzZUZvcm1hdFNjaGVtYSkgPT4ge1xuICBjb25zdCBtb25nb1VwZGF0ZSA9IHt9O1xuICBjb25zdCBhY2wgPSBhZGRMZWdhY3lBQ0wocmVzdFVwZGF0ZSk7XG4gIGlmIChhY2wuX3JwZXJtIHx8IGFjbC5fd3Blcm0gfHwgYWNsLl9hY2wpIHtcbiAgICBtb25nb1VwZGF0ZS4kc2V0ID0ge307XG4gICAgaWYgKGFjbC5fcnBlcm0pIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX3JwZXJtID0gYWNsLl9ycGVybTtcbiAgICB9XG4gICAgaWYgKGFjbC5fd3Blcm0pIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX3dwZXJtID0gYWNsLl93cGVybTtcbiAgICB9XG4gICAgaWYgKGFjbC5fYWNsKSB7XG4gICAgICBtb25nb1VwZGF0ZS4kc2V0Ll9hY2wgPSBhY2wuX2FjbDtcbiAgICB9XG4gIH1cbiAgZm9yICh2YXIgcmVzdEtleSBpbiByZXN0VXBkYXRlKSB7XG4gICAgaWYgKHJlc3RVcGRhdGVbcmVzdEtleV0gJiYgcmVzdFVwZGF0ZVtyZXN0S2V5XS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB2YXIgb3V0ID0gdHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICByZXN0S2V5LFxuICAgICAgcmVzdFVwZGF0ZVtyZXN0S2V5XSxcbiAgICAgIHBhcnNlRm9ybWF0U2NoZW1hXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvdXRwdXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW55ICQga2V5cywgaXQncyBhblxuICAgIC8vIG9wZXJhdG9yIHRoYXQgbmVlZHMgdG8gYmUgbGlmdGVkIG9udG8gdGhlIHRvcCBsZXZlbCB1cGRhdGVcbiAgICAvLyBvYmplY3QuXG4gICAgaWYgKHR5cGVvZiBvdXQudmFsdWUgPT09ICdvYmplY3QnICYmIG91dC52YWx1ZSAhPT0gbnVsbCAmJiBvdXQudmFsdWUuX19vcCkge1xuICAgICAgbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdID0gbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdIHx8IHt9O1xuICAgICAgbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdW291dC5rZXldID0gb3V0LnZhbHVlLmFyZztcbiAgICB9IGVsc2Uge1xuICAgICAgbW9uZ29VcGRhdGVbJyRzZXQnXSA9IG1vbmdvVXBkYXRlWyckc2V0J10gfHwge307XG4gICAgICBtb25nb1VwZGF0ZVsnJHNldCddW291dC5rZXldID0gb3V0LnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtb25nb1VwZGF0ZTtcbn07XG5cbi8vIEFkZCB0aGUgbGVnYWN5IF9hY2wgZm9ybWF0LlxuY29uc3QgYWRkTGVnYWN5QUNMID0gcmVzdE9iamVjdCA9PiB7XG4gIGNvbnN0IHJlc3RPYmplY3RDb3B5ID0geyAuLi5yZXN0T2JqZWN0IH07XG4gIGNvbnN0IF9hY2wgPSB7fTtcblxuICBpZiAocmVzdE9iamVjdC5fd3Blcm0pIHtcbiAgICByZXN0T2JqZWN0Ll93cGVybS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIF9hY2xbZW50cnldID0geyB3OiB0cnVlIH07XG4gICAgfSk7XG4gICAgcmVzdE9iamVjdENvcHkuX2FjbCA9IF9hY2w7XG4gIH1cblxuICBpZiAocmVzdE9iamVjdC5fcnBlcm0pIHtcbiAgICByZXN0T2JqZWN0Ll9ycGVybS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghKGVudHJ5IGluIF9hY2wpKSB7XG4gICAgICAgIF9hY2xbZW50cnldID0geyByOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfYWNsW2VudHJ5XS5yID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXN0T2JqZWN0Q29weS5fYWNsID0gX2FjbDtcbiAgfVxuXG4gIHJldHVybiByZXN0T2JqZWN0Q29weTtcbn07XG5cbi8vIEEgc2VudGluZWwgdmFsdWUgdGhhdCBoZWxwZXIgdHJhbnNmb3JtYXRpb25zIHJldHVybiB3aGVuIHRoZXlcbi8vIGNhbm5vdCBwZXJmb3JtIGEgdHJhbnNmb3JtYXRpb25cbmZ1bmN0aW9uIENhbm5vdFRyYW5zZm9ybSgpIHt9XG5cbmNvbnN0IHRyYW5zZm9ybUludGVyaW9yQXRvbSA9IGF0b20gPT4ge1xuICAvLyBUT0RPOiBjaGVjayB2YWxpZGl0eSBoYXJkZXIgZm9yIHRoZSBfX3R5cGUtZGVmaW5lZCB0eXBlc1xuICBpZiAodHlwZW9mIGF0b20gPT09ICdvYmplY3QnICYmIGF0b20gJiYgIShhdG9tIGluc3RhbmNlb2YgRGF0ZSkgJiYgYXRvbS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogYXRvbS5jbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogYXRvbS5vYmplY3RJZCxcbiAgICB9O1xuICB9IGVsc2UgaWYgKHR5cGVvZiBhdG9tID09PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiBhdG9tID09PSAnc3ltYm9sJykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBjYW5ub3QgdHJhbnNmb3JtIHZhbHVlOiAke2F0b219YCk7XG4gIH0gZWxzZSBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIERhdGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgfSBlbHNlIGlmIChCeXRlc0NvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIEJ5dGVzQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGF0b20gPT09ICdvYmplY3QnICYmIGF0b20gJiYgYXRvbS4kcmVnZXggIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBuZXcgUmVnRXhwKGF0b20uJHJlZ2V4KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYXRvbTtcbiAgfVxufTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIHRyYW5zZm9ybSBhbiBhdG9tIGZyb20gUkVTVCBmb3JtYXQgdG8gTW9uZ28gZm9ybWF0LlxuLy8gQW4gYXRvbSBpcyBhbnl0aGluZyB0aGF0IGNhbid0IGNvbnRhaW4gb3RoZXIgZXhwcmVzc2lvbnMuIFNvIGl0XG4vLyBpbmNsdWRlcyB0aGluZ3Mgd2hlcmUgb2JqZWN0cyBhcmUgdXNlZCB0byByZXByZXNlbnQgb3RoZXJcbi8vIGRhdGF0eXBlcywgbGlrZSBwb2ludGVycyBhbmQgZGF0ZXMsIGJ1dCBpdCBkb2VzIG5vdCBpbmNsdWRlIG9iamVjdHNcbi8vIG9yIGFycmF5cyB3aXRoIGdlbmVyaWMgc3R1ZmYgaW5zaWRlLlxuLy8gUmFpc2VzIGFuIGVycm9yIGlmIHRoaXMgY2Fubm90IHBvc3NpYmx5IGJlIHZhbGlkIFJFU1QgZm9ybWF0LlxuLy8gUmV0dXJucyBDYW5ub3RUcmFuc2Zvcm0gaWYgaXQncyBqdXN0IG5vdCBhbiBhdG9tXG5mdW5jdGlvbiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20oYXRvbSwgZmllbGQpIHtcbiAgc3dpdGNoICh0eXBlb2YgYXRvbSkge1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBhdG9tO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHtmaWVsZC50YXJnZXRDbGFzc30kJHthdG9tfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYXRvbTtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBjYW5ub3QgdHJhbnNmb3JtIHZhbHVlOiAke2F0b219YCk7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChhdG9tIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAvLyBUZWNobmljYWxseSBkYXRlcyBhcmUgbm90IHJlc3QgZm9ybWF0LCBidXQsIGl0IHNlZW1zIHByZXR0eVxuICAgICAgICAvLyBjbGVhciB3aGF0IHRoZXkgc2hvdWxkIGJlIHRyYW5zZm9ybWVkIHRvLCBzbyBsZXQncyBqdXN0IGRvIGl0LlxuICAgICAgICByZXR1cm4gYXRvbTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF0b20gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIGF0b207XG4gICAgICB9XG5cbiAgICAgIC8vIFRPRE86IGNoZWNrIHZhbGlkaXR5IGhhcmRlciBmb3IgdGhlIF9fdHlwZS1kZWZpbmVkIHR5cGVzXG4gICAgICBpZiAoYXRvbS5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHthdG9tLmNsYXNzTmFtZX0kJHthdG9tLm9iamVjdElkfWA7XG4gICAgICB9XG4gICAgICBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBEYXRlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBHZW9Qb2ludENvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKFBvbHlnb25Db2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gUG9seWdvbkNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEZpbGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gRmlsZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBJIGRvbid0IHRoaW5rIHR5cGVvZiBjYW4gZXZlciBsZXQgdXMgZ2V0IGhlcmVcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICBgcmVhbGx5IGRpZCBub3QgZXhwZWN0IHZhbHVlOiAke2F0b219YFxuICAgICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWxhdGl2ZVRpbWVUb0RhdGUodGV4dCwgbm93ID0gbmV3IERhdGUoKSkge1xuICB0ZXh0ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuXG4gIGxldCBwYXJ0cyA9IHRleHQuc3BsaXQoJyAnKTtcblxuICAvLyBGaWx0ZXIgb3V0IHdoaXRlc3BhY2VcbiAgcGFydHMgPSBwYXJ0cy5maWx0ZXIocGFydCA9PiBwYXJ0ICE9PSAnJyk7XG5cbiAgY29uc3QgZnV0dXJlID0gcGFydHNbMF0gPT09ICdpbic7XG4gIGNvbnN0IHBhc3QgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSA9PT0gJ2Fnbyc7XG5cbiAgaWYgKCFmdXR1cmUgJiYgIXBhc3QgJiYgdGV4dCAhPT0gJ25vdycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnZXJyb3InLFxuICAgICAgaW5mbzogXCJUaW1lIHNob3VsZCBlaXRoZXIgc3RhcnQgd2l0aCAnaW4nIG9yIGVuZCB3aXRoICdhZ28nXCIsXG4gICAgfTtcbiAgfVxuXG4gIGlmIChmdXR1cmUgJiYgcGFzdCkge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICBpbmZvOiBcIlRpbWUgY2Fubm90IGhhdmUgYm90aCAnaW4nIGFuZCAnYWdvJ1wiLFxuICAgIH07XG4gIH1cblxuICAvLyBzdHJpcCB0aGUgJ2Fnbycgb3IgJ2luJ1xuICBpZiAoZnV0dXJlKSB7XG4gICAgcGFydHMgPSBwYXJ0cy5zbGljZSgxKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBwYXN0XG4gICAgcGFydHMgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIGlmIChwYXJ0cy5sZW5ndGggJSAyICE9PSAwICYmIHRleHQgIT09ICdub3cnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgIGluZm86ICdJbnZhbGlkIHRpbWUgc3RyaW5nLiBEYW5nbGluZyB1bml0IG9yIG51bWJlci4nLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBwYWlycyA9IFtdO1xuICB3aGlsZSAocGFydHMubGVuZ3RoKSB7XG4gICAgcGFpcnMucHVzaChbcGFydHMuc2hpZnQoKSwgcGFydHMuc2hpZnQoKV0pO1xuICB9XG5cbiAgbGV0IHNlY29uZHMgPSAwO1xuICBmb3IgKGNvbnN0IFtudW0sIGludGVydmFsXSBvZiBwYWlycykge1xuICAgIGNvbnN0IHZhbCA9IE51bWJlcihudW0pO1xuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih2YWwpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGluZm86IGAnJHtudW19JyBpcyBub3QgYW4gaW50ZWdlci5gLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBzd2l0Y2ggKGludGVydmFsKSB7XG4gICAgICBjYXNlICd5cic6XG4gICAgICBjYXNlICd5cnMnOlxuICAgICAgY2FzZSAneWVhcic6XG4gICAgICBjYXNlICd5ZWFycyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsICogMzE1MzYwMDA7IC8vIDM2NSAqIDI0ICogNjAgKiA2MFxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnd2snOlxuICAgICAgY2FzZSAnd2tzJzpcbiAgICAgIGNhc2UgJ3dlZWsnOlxuICAgICAgY2FzZSAnd2Vla3MnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDYwNDgwMDsgLy8gNyAqIDI0ICogNjAgKiA2MFxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnZCc6XG4gICAgICBjYXNlICdkYXknOlxuICAgICAgY2FzZSAnZGF5cyc6XG4gICAgICAgIHNlY29uZHMgKz0gdmFsICogODY0MDA7IC8vIDI0ICogNjAgKiA2MFxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnaHInOlxuICAgICAgY2FzZSAnaHJzJzpcbiAgICAgIGNhc2UgJ2hvdXInOlxuICAgICAgY2FzZSAnaG91cnMnOlxuICAgICAgICBzZWNvbmRzICs9IHZhbCAqIDM2MDA7IC8vIDYwICogNjBcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ21pbic6XG4gICAgICBjYXNlICdtaW5zJzpcbiAgICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgICBjYXNlICdtaW51dGVzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWwgKiA2MDtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ3NlYyc6XG4gICAgICBjYXNlICdzZWNzJzpcbiAgICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgICBjYXNlICdzZWNvbmRzJzpcbiAgICAgICAgc2Vjb25kcyArPSB2YWw7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1czogJ2Vycm9yJyxcbiAgICAgICAgICBpbmZvOiBgSW52YWxpZCBpbnRlcnZhbDogJyR7aW50ZXJ2YWx9J2AsXG4gICAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgbWlsbGlzZWNvbmRzID0gc2Vjb25kcyAqIDEwMDA7XG4gIGlmIChmdXR1cmUpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICBpbmZvOiAnZnV0dXJlJyxcbiAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSArIG1pbGxpc2Vjb25kcyksXG4gICAgfTtcbiAgfSBlbHNlIGlmIChwYXN0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgaW5mbzogJ3Bhc3QnLFxuICAgICAgcmVzdWx0OiBuZXcgRGF0ZShub3cudmFsdWVPZigpIC0gbWlsbGlzZWNvbmRzKSxcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgIGluZm86ICdwcmVzZW50JyxcbiAgICAgIHJlc3VsdDogbmV3IERhdGUobm93LnZhbHVlT2YoKSksXG4gICAgfTtcbiAgfVxufVxuXG4vLyBUcmFuc2Zvcm1zIGEgcXVlcnkgY29uc3RyYWludCBmcm9tIFJFU1QgQVBJIGZvcm1hdCB0byBNb25nbyBmb3JtYXQuXG4vLyBBIGNvbnN0cmFpbnQgaXMgc29tZXRoaW5nIHdpdGggZmllbGRzIGxpa2UgJGx0LlxuLy8gSWYgaXQgaXMgbm90IGEgdmFsaWQgY29uc3RyYWludCBidXQgaXQgY291bGQgYmUgYSB2YWxpZCBzb21ldGhpbmdcbi8vIGVsc2UsIHJldHVybiBDYW5ub3RUcmFuc2Zvcm0uXG4vLyBpbkFycmF5IGlzIHdoZXRoZXIgdGhpcyBpcyBhbiBhcnJheSBmaWVsZC5cbmZ1bmN0aW9uIHRyYW5zZm9ybUNvbnN0cmFpbnQoY29uc3RyYWludCwgZmllbGQsIGNvdW50ID0gZmFsc2UpIHtcbiAgY29uc3QgaW5BcnJheSA9IGZpZWxkICYmIGZpZWxkLnR5cGUgJiYgZmllbGQudHlwZSA9PT0gJ0FycmF5JztcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50ICE9PSAnb2JqZWN0JyB8fCAhY29uc3RyYWludCkge1xuICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG4gIH1cbiAgY29uc3QgdHJhbnNmb3JtRnVuY3Rpb24gPSBpbkFycmF5ID8gdHJhbnNmb3JtSW50ZXJpb3JBdG9tIDogdHJhbnNmb3JtVG9wTGV2ZWxBdG9tO1xuICBjb25zdCB0cmFuc2Zvcm1lciA9IGF0b20gPT4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zZm9ybUZ1bmN0aW9uKGF0b20sIGZpZWxkKTtcbiAgICBpZiAocmVzdWx0ID09PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgYXRvbTogJHtKU09OLnN0cmluZ2lmeShhdG9tKX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcbiAgLy8ga2V5cyBpcyB0aGUgY29uc3RyYWludHMgaW4gcmV2ZXJzZSBhbHBoYWJldGljYWwgb3JkZXIuXG4gIC8vIFRoaXMgaXMgYSBoYWNrIHNvIHRoYXQ6XG4gIC8vICAgJHJlZ2V4IGlzIGhhbmRsZWQgYmVmb3JlICRvcHRpb25zXG4gIC8vICAgJG5lYXJTcGhlcmUgaXMgaGFuZGxlZCBiZWZvcmUgJG1heERpc3RhbmNlXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoY29uc3RyYWludCkuc29ydCgpLnJldmVyc2UoKTtcbiAgdmFyIGFuc3dlciA9IHt9O1xuICBmb3IgKHZhciBrZXkgb2Yga2V5cykge1xuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICBjYXNlICckbHQnOlxuICAgICAgY2FzZSAnJGx0ZSc6XG4gICAgICBjYXNlICckZ3QnOlxuICAgICAgY2FzZSAnJGd0ZSc6XG4gICAgICBjYXNlICckZXhpc3RzJzpcbiAgICAgIGNhc2UgJyRuZSc6XG4gICAgICBjYXNlICckZXEnOiB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKHZhbCAmJiB0eXBlb2YgdmFsID09PSAnb2JqZWN0JyAmJiB2YWwuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgIGlmIChmaWVsZCAmJiBmaWVsZC50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICAgIGNhc2UgJyRleGlzdHMnOlxuICAgICAgICAgICAgY2FzZSAnJG5lJzpcbiAgICAgICAgICAgIGNhc2UgJyRlcSc6XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IHJlbGF0aXZlVGltZVRvRGF0ZSh2YWwuJHJlbGF0aXZlVGltZSk7XG4gICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgYW5zd2VyW2tleV0gPSBwYXJzZXJSZXN1bHQucmVzdWx0O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbG9nLmluZm8oJ0Vycm9yIHdoaWxlIHBhcnNpbmcgcmVsYXRpdmUgZGF0ZScsIHBhcnNlclJlc3VsdCk7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkcmVsYXRpdmVUaW1lICgke2tleX0pIHZhbHVlLiAke3BhcnNlclJlc3VsdC5pbmZvfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgYW5zd2VyW2tleV0gPSB0cmFuc2Zvcm1lcih2YWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2FzZSAnJGluJzpcbiAgICAgIGNhc2UgJyRuaW4nOiB7XG4gICAgICAgIGNvbnN0IGFyciA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAnICsga2V5ICsgJyB2YWx1ZScpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gXy5mbGF0TWFwKGFyciwgdmFsdWUgPT4ge1xuICAgICAgICAgIHJldHVybiAoYXRvbSA9PiB7XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShhdG9tKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUubWFwKHRyYW5zZm9ybWVyKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cmFuc2Zvcm1lcihhdG9tKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSh2YWx1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRhbGwnOiB7XG4gICAgICAgIGNvbnN0IGFyciA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAnICsga2V5ICsgJyB2YWx1ZScpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gYXJyLm1hcCh0cmFuc2Zvcm1JbnRlcmlvckF0b20pO1xuXG4gICAgICAgIGNvbnN0IHZhbHVlcyA9IGFuc3dlcltrZXldO1xuICAgICAgICBpZiAoaXNBbnlWYWx1ZVJlZ2V4KHZhbHVlcykgJiYgIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyB2YWx1ZXNcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckcmVnZXgnOlxuICAgICAgICB2YXIgcyA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKHR5cGVvZiBzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgcmVnZXg6ICcgKyBzKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IHM7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckY29udGFpbmVkQnknOiB7XG4gICAgICAgIGNvbnN0IGFyciA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKCEoYXJyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWApO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlci4kZWxlbU1hdGNoID0ge1xuICAgICAgICAgICRuaW46IGFyci5tYXAodHJhbnNmb3JtZXIpLFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRvcHRpb25zJzpcbiAgICAgICAgYW5zd2VyW2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckdGV4dCc6IHtcbiAgICAgICAgY29uc3Qgc2VhcmNoID0gY29uc3RyYWludFtrZXldLiRzZWFyY2g7XG4gICAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgICAkc2VhcmNoOiBzZWFyY2guJHRlcm0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VhcmNoLiRsYW5ndWFnZSAmJiB0eXBlb2Ygc2VhcmNoLiRsYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkbGFuZ3VhZ2UsIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGNhc2VTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRjYXNlU2Vuc2l0aXZlID0gc2VhcmNoLiRjYXNlU2Vuc2l0aXZlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kZGlhY3JpdGljU2Vuc2l0aXZlID0gc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmU7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckbmVhclNwaGVyZSc6IHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgIGFuc3dlci4kZ2VvV2l0aGluID0ge1xuICAgICAgICAgICAgJGNlbnRlclNwaGVyZTogW1twb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXSwgY29uc3RyYWludC4kbWF4RGlzdGFuY2VdLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2UnOiB7XG4gICAgICAgIGlmIChjb3VudCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIC8vIFRoZSBTREtzIGRvbid0IHNlZW0gdG8gdXNlIHRoZXNlIGJ1dCB0aGV5IGFyZSBkb2N1bWVudGVkIGluIHRoZVxuICAgICAgLy8gUkVTVCBBUEkgZG9jcy5cbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZUluUmFkaWFucyc6XG4gICAgICAgIGFuc3dlclsnJG1heERpc3RhbmNlJ10gPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5NaWxlcyc6XG4gICAgICAgIGFuc3dlclsnJG1heERpc3RhbmNlJ10gPSBjb25zdHJhaW50W2tleV0gLyAzOTU5O1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZUluS2lsb21ldGVycyc6XG4gICAgICAgIGFuc3dlclsnJG1heERpc3RhbmNlJ10gPSBjb25zdHJhaW50W2tleV0gLyA2MzcxO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJHNlbGVjdCc6XG4gICAgICBjYXNlICckZG9udFNlbGVjdCc6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICAgICd0aGUgJyArIGtleSArICcgY29uc3RyYWludCBpcyBub3Qgc3VwcG9ydGVkIHlldCdcbiAgICAgICAgKTtcblxuICAgICAgY2FzZSAnJHdpdGhpbic6XG4gICAgICAgIHZhciBib3ggPSBjb25zdHJhaW50W2tleV1bJyRib3gnXTtcbiAgICAgICAgaWYgKCFib3ggfHwgYm94Lmxlbmd0aCAhPSAyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ21hbGZvcm1hdHRlZCAkd2l0aGluIGFyZycpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICRib3g6IFtcbiAgICAgICAgICAgIFtib3hbMF0ubG9uZ2l0dWRlLCBib3hbMF0ubGF0aXR1ZGVdLFxuICAgICAgICAgICAgW2JveFsxXS5sb25naXR1ZGUsIGJveFsxXS5sYXRpdHVkZV0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyRnZW9XaXRoaW4nOiB7XG4gICAgICAgIGNvbnN0IHBvbHlnb24gPSBjb25zdHJhaW50W2tleV1bJyRwb2x5Z29uJ107XG4gICAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGNvbnN0cmFpbnRba2V5XVsnJGNlbnRlclNwaGVyZSddO1xuICAgICAgICBpZiAocG9seWdvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGV0IHBvaW50cztcbiAgICAgICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgICAgIGlmICghcG9seWdvbi5jb29yZGluYXRlcyB8fCBwb2x5Z29uLmNvb3JkaW5hdGVzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7IFBvbHlnb24uY29vcmRpbmF0ZXMgc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBsb24vbGF0IHBhaXJzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcG9pbnRzID0gcG9seWdvbi5jb29yZGluYXRlcztcbiAgICAgICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgXCJiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGJlIFBvbHlnb24gb2JqZWN0IG9yIEFycmF5IG9mIFBhcnNlLkdlb1BvaW50J3NcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcG9pbnRzID0gcG9pbnRzLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgICAgIHJldHVybiBwb2ludDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJHBvbHlnb246IHBvaW50cyxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2UgaWYgKGNlbnRlclNwaGVyZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgIC8vIEdldCBkaXN0YW5jZSBhbmQgdmFsaWRhdGVcbiAgICAgICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgICAkY2VudGVyU3BoZXJlOiBbW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLCBkaXN0YW5jZV0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRnZW9JbnRlcnNlY3RzJzoge1xuICAgICAgICBjb25zdCBwb2ludCA9IGNvbnN0cmFpbnRba2V5XVsnJHBvaW50J107XG4gICAgICAgIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgJGdlb21ldHJ5OiB7XG4gICAgICAgICAgICB0eXBlOiAnUG9pbnQnLFxuICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChrZXkubWF0Y2goL15cXCQrLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIGNvbnN0cmFpbnQ6ICcgKyBrZXkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIFRyYW5zZm9ybXMgYW4gdXBkYXRlIG9wZXJhdG9yIGZyb20gUkVTVCBmb3JtYXQgdG8gbW9uZ28gZm9ybWF0LlxuLy8gVG8gYmUgdHJhbnNmb3JtZWQsIHRoZSBpbnB1dCBzaG91bGQgaGF2ZSBhbiBfX29wIGZpZWxkLlxuLy8gSWYgZmxhdHRlbiBpcyB0cnVlLCB0aGlzIHdpbGwgZmxhdHRlbiBvcGVyYXRvcnMgdG8gdGhlaXIgc3RhdGljXG4vLyBkYXRhIGZvcm1hdC4gRm9yIGV4YW1wbGUsIGFuIGluY3JlbWVudCBvZiAyIHdvdWxkIHNpbXBseSBiZWNvbWUgYVxuLy8gMi5cbi8vIFRoZSBvdXRwdXQgZm9yIGEgbm9uLWZsYXR0ZW5lZCBvcGVyYXRvciBpcyBhIGhhc2ggd2l0aCBfX29wIGJlaW5nXG4vLyB0aGUgbW9uZ28gb3AsIGFuZCBhcmcgYmVpbmcgdGhlIGFyZ3VtZW50LlxuLy8gVGhlIG91dHB1dCBmb3IgYSBmbGF0dGVuZWQgb3BlcmF0b3IgaXMganVzdCBhIHZhbHVlLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgaWYgdGhpcyBzaG91bGQgYmUgYSBuby1vcC5cblxuZnVuY3Rpb24gdHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IoeyBfX29wLCBhbW91bnQsIG9iamVjdHMgfSwgZmxhdHRlbikge1xuICBzd2l0Y2ggKF9fb3ApIHtcbiAgICBjYXNlICdEZWxldGUnOlxuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IF9fb3A6ICckdW5zZXQnLCBhcmc6ICcnIH07XG4gICAgICB9XG5cbiAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgaWYgKHR5cGVvZiBhbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdpbmNyZW1lbnRpbmcgbXVzdCBwcm92aWRlIGEgbnVtYmVyJyk7XG4gICAgICB9XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gYW1vdW50O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyRpbmMnLCBhcmc6IGFtb3VudCB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnQWRkJzpcbiAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgaWYgKCEob2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgfVxuICAgICAgdmFyIHRvQWRkID0gb2JqZWN0cy5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiB0b0FkZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBtb25nb09wID0ge1xuICAgICAgICAgIEFkZDogJyRwdXNoJyxcbiAgICAgICAgICBBZGRVbmlxdWU6ICckYWRkVG9TZXQnLFxuICAgICAgICB9W19fb3BdO1xuICAgICAgICByZXR1cm4geyBfX29wOiBtb25nb09wLCBhcmc6IHsgJGVhY2g6IHRvQWRkIH0gfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICBpZiAoIShvYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIHJlbW92ZSBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICB9XG4gICAgICB2YXIgdG9SZW1vdmUgPSBvYmplY3RzLm1hcCh0cmFuc2Zvcm1JbnRlcmlvckF0b20pO1xuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyRwdWxsQWxsJywgYXJnOiB0b1JlbW92ZSB9O1xuICAgICAgfVxuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgYFRoZSAke19fb3B9IG9wZXJhdG9yIGlzIG5vdCBzdXBwb3J0ZWQgeWV0LmBcbiAgICAgICk7XG4gIH1cbn1cbmZ1bmN0aW9uIG1hcFZhbHVlcyhvYmplY3QsIGl0ZXJhdG9yKSB7XG4gIGNvbnN0IHJlc3VsdCA9IHt9O1xuICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICByZXN1bHRba2V5XSA9IGl0ZXJhdG9yKG9iamVjdFtrZXldKTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmNvbnN0IG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCA9IG1vbmdvT2JqZWN0ID0+IHtcbiAgc3dpdGNoICh0eXBlb2YgbW9uZ29PYmplY3QpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBtb25nb09iamVjdDtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93ICdiYWQgdmFsdWUgaW4gbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0JztcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKG1vbmdvT2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0Lm1hcChuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHJldHVybiBQYXJzZS5fZW5jb2RlKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Mb25nKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC50b051bWJlcigpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkRvdWJsZSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudmFsdWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChCeXRlc0NvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdChtb25nb09iamVjdCkpIHtcbiAgICAgICAgcmV0dXJuIEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04obW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChtb25nb09iamVjdCwgJ19fdHlwZScpICYmXG4gICAgICAgIG1vbmdvT2JqZWN0Ll9fdHlwZSA9PSAnRGF0ZScgJiZcbiAgICAgICAgbW9uZ29PYmplY3QuaXNvIGluc3RhbmNlb2YgRGF0ZVxuICAgICAgKSB7XG4gICAgICAgIG1vbmdvT2JqZWN0LmlzbyA9IG1vbmdvT2JqZWN0Lmlzby50b0pTT04oKTtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbWFwVmFsdWVzKG1vbmdvT2JqZWN0LCBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAndW5rbm93biBqcyB0eXBlJztcbiAgfVxufTtcblxuY29uc3QgdHJhbnNmb3JtUG9pbnRlclN0cmluZyA9IChzY2hlbWEsIGZpZWxkLCBwb2ludGVyU3RyaW5nKSA9PiB7XG4gIGNvbnN0IG9iakRhdGEgPSBwb2ludGVyU3RyaW5nLnNwbGl0KCckJyk7XG4gIGlmIChvYmpEYXRhWzBdICE9PSBzY2hlbWEuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcykge1xuICAgIHRocm93ICdwb2ludGVyIHRvIGluY29ycmVjdCBjbGFzc05hbWUnO1xuICB9XG4gIHJldHVybiB7XG4gICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgY2xhc3NOYW1lOiBvYmpEYXRhWzBdLFxuICAgIG9iamVjdElkOiBvYmpEYXRhWzFdLFxuICB9O1xufTtcblxuLy8gQ29udmVydHMgZnJvbSBhIG1vbmdvLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4vLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuY29uc3QgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0ID0gKGNsYXNzTmFtZSwgbW9uZ29PYmplY3QsIHNjaGVtYSkgPT4ge1xuICBzd2l0Y2ggKHR5cGVvZiBtb25nb09iamVjdCkge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgJ2JhZCB2YWx1ZSBpbiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QnO1xuICAgIGNhc2UgJ29iamVjdCc6IHtcbiAgICAgIGlmIChtb25nb09iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC5tYXAobmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICByZXR1cm4gUGFyc2UuX2VuY29kZShtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuTG9uZykge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudG9OdW1iZXIoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Eb3VibGUpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnZhbHVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QobW9uZ29PYmplY3QpKSB7XG4gICAgICAgIHJldHVybiBCeXRlc0NvZGVyLmRhdGFiYXNlVG9KU09OKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdE9iamVjdCA9IHt9O1xuICAgICAgaWYgKG1vbmdvT2JqZWN0Ll9ycGVybSB8fCBtb25nb09iamVjdC5fd3Blcm0pIHtcbiAgICAgICAgcmVzdE9iamVjdC5fcnBlcm0gPSBtb25nb09iamVjdC5fcnBlcm0gfHwgW107XG4gICAgICAgIHJlc3RPYmplY3QuX3dwZXJtID0gbW9uZ29PYmplY3QuX3dwZXJtIHx8IFtdO1xuICAgICAgICBkZWxldGUgbW9uZ29PYmplY3QuX3JwZXJtO1xuICAgICAgICBkZWxldGUgbW9uZ29PYmplY3QuX3dwZXJtO1xuICAgICAgfVxuXG4gICAgICBmb3IgKHZhciBrZXkgaW4gbW9uZ29PYmplY3QpIHtcbiAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICBjYXNlICdfaWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnb2JqZWN0SWQnXSA9ICcnICsgbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19oYXNoZWRfcGFzc3dvcmQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdC5faGFzaGVkX3Bhc3N3b3JkID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19hY2wnOlxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgICAgICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgICAgICBjYXNlICdfdG9tYnN0b25lJzpcbiAgICAgICAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgICAgICAgY2FzZSAnX3Bhc3N3b3JkX2hpc3RvcnknOlxuICAgICAgICAgICAgLy8gVGhvc2Uga2V5cyB3aWxsIGJlIGRlbGV0ZWQgaWYgbmVlZGVkIGluIHRoZSBEQiBDb250cm9sbGVyXG4gICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX3Nlc3Npb25fdG9rZW4nOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnc2Vzc2lvblRva2VuJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgICAgICBjYXNlICdfdXBkYXRlZF9hdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Wyd1cGRhdGVkQXQnXSA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSkpLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgICAgICAgY2FzZSAnX2NyZWF0ZWRfYXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnY3JlYXRlZEF0J10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgICAgICAgIGNhc2UgJ19leHBpcmVzQXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnZXhwaXJlc0F0J10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICAgICAgICBjYXNlICdfbGFzdF91c2VkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2xhc3RVc2VkJ10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgICAgIGNhc2UgJ3RpbWVzX3VzZWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsndGltZXNVc2VkJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnYXV0aERhdGEnOlxuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgICAgICBsb2cud2FybihcbiAgICAgICAgICAgICAgICAnaWdub3JpbmcgYXV0aERhdGEgaW4gX1VzZXIgYXMgdGhpcyBrZXkgaXMgcmVzZXJ2ZWQgdG8gYmUgc3ludGhlc2l6ZWQgb2YgYF9hdXRoX2RhdGFfKmAga2V5cydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbJ2F1dGhEYXRhJ10gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIC8vIENoZWNrIG90aGVyIGF1dGggZGF0YSBrZXlzXG4gICAgICAgICAgICB2YXIgYXV0aERhdGFNYXRjaCA9IGtleS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgICAgICAgaWYgKGF1dGhEYXRhTWF0Y2ggJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbJ2F1dGhEYXRhJ10gPSByZXN0T2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoa2V5LmluZGV4T2YoJ19wXycpID09IDApIHtcbiAgICAgICAgICAgICAgdmFyIG5ld0tleSA9IGtleS5zdWJzdHJpbmcoMyk7XG4gICAgICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tuZXdLZXldKSB7XG4gICAgICAgICAgICAgICAgbG9nLmluZm8oXG4gICAgICAgICAgICAgICAgICAndHJhbnNmb3JtLmpzJyxcbiAgICAgICAgICAgICAgICAgICdGb3VuZCBhIHBvaW50ZXIgY29sdW1uIG5vdCBpbiB0aGUgc2NoZW1hLCBkcm9wcGluZyBpdC4nLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgbmV3S2V5XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tuZXdLZXldLnR5cGUgIT09ICdQb2ludGVyJykge1xuICAgICAgICAgICAgICAgIGxvZy5pbmZvKFxuICAgICAgICAgICAgICAgICAgJ3RyYW5zZm9ybS5qcycsXG4gICAgICAgICAgICAgICAgICAnRm91bmQgYSBwb2ludGVyIGluIGEgbm9uLXBvaW50ZXIgY29sdW1uLCBkcm9wcGluZyBpdC4nLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAga2V5XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobW9uZ29PYmplY3Rba2V5XSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbbmV3S2V5XSA9IHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBuZXdLZXksIG1vbmdvT2JqZWN0W2tleV0pO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5WzBdID09ICdfJyAmJiBrZXkgIT0gJ19fdHlwZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgJ2JhZCBrZXkgaW4gdW50cmFuc2Zvcm06ICcgKyBrZXk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdGaWxlJyAmJlxuICAgICAgICAgICAgICAgIEZpbGVDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEZpbGVDb2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnICYmXG4gICAgICAgICAgICAgICAgR2VvUG9pbnRDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEdlb1BvaW50Q29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ1BvbHlnb24nICYmXG4gICAgICAgICAgICAgICAgUG9seWdvbkNvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gUG9seWdvbkNvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdCeXRlcycgJiZcbiAgICAgICAgICAgICAgICBCeXRlc0NvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdChtb25nb09iamVjdFtrZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCByZWxhdGlvbkZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5maWx0ZXIoXG4gICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGRzID0ge307XG4gICAgICByZWxhdGlvbkZpZWxkTmFtZXMuZm9yRWFjaChyZWxhdGlvbkZpZWxkTmFtZSA9PiB7XG4gICAgICAgIHJlbGF0aW9uRmllbGRzW3JlbGF0aW9uRmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW3JlbGF0aW9uRmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4geyAuLi5yZXN0T2JqZWN0LCAuLi5yZWxhdGlvbkZpZWxkcyB9O1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ3Vua25vd24ganMgdHlwZSc7XG4gIH1cbn07XG5cbnZhciBEYXRlQ29kZXIgPSB7XG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4gbmV3IERhdGUoanNvbi5pc28pO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnRGF0ZSc7XG4gIH0sXG59O1xuXG52YXIgQnl0ZXNDb2RlciA9IHtcbiAgYmFzZTY0UGF0dGVybjogbmV3IFJlZ0V4cCgnXig/OltBLVphLXowLTkrL117NH0pKig/OltBLVphLXowLTkrL117Mn09PXxbQS1aYS16MC05Ky9dezN9PSk/JCcpLFxuICBpc0Jhc2U2NFZhbHVlKG9iamVjdCkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5iYXNlNjRQYXR0ZXJuLnRlc3Qob2JqZWN0KTtcbiAgfSxcblxuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICBsZXQgdmFsdWU7XG4gICAgaWYgKHRoaXMuaXNCYXNlNjRWYWx1ZShvYmplY3QpKSB7XG4gICAgICB2YWx1ZSA9IG9iamVjdDtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgPSBvYmplY3QuYnVmZmVyLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgIGJhc2U2NDogdmFsdWUsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuQmluYXJ5IHx8IHRoaXMuaXNCYXNlNjRWYWx1ZShvYmplY3QpO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4gbmV3IG1vbmdvZGIuQmluYXJ5KEJ1ZmZlci5mcm9tKGpzb24uYmFzZTY0LCAnYmFzZTY0JykpO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnO1xuICB9LFxufTtcblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGRhdGFiYXNlVG9KU09OKG9iamVjdCkge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICBsYXRpdHVkZTogb2JqZWN0WzFdLFxuICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbMF0sXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIEFycmF5ICYmIG9iamVjdC5sZW5ndGggPT0gMjtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIFtqc29uLmxvbmdpdHVkZSwganNvbi5sYXRpdHVkZV07XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCc7XG4gIH0sXG59O1xuXG52YXIgUG9seWdvbkNvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICAvLyBDb252ZXJ0IGxuZy9sYXQgLT4gbGF0L2xuZ1xuICAgIGNvbnN0IGNvb3JkcyA9IG9iamVjdC5jb29yZGluYXRlc1swXS5tYXAoY29vcmQgPT4ge1xuICAgICAgcmV0dXJuIFtjb29yZFsxXSwgY29vcmRbMF1dO1xuICAgIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICAgIGNvb3JkaW5hdGVzOiBjb29yZHMsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgY29uc3QgY29vcmRzID0gb2JqZWN0LmNvb3JkaW5hdGVzWzBdO1xuICAgIGlmIChvYmplY3QudHlwZSAhPT0gJ1BvbHlnb24nIHx8ICEoY29vcmRzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29vcmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGNvb3Jkc1tpXTtcbiAgICAgIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QocG9pbnQpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgbGV0IGNvb3JkcyA9IGpzb24uY29vcmRpbmF0ZXM7XG4gICAgLy8gQWRkIGZpcnN0IHBvaW50IHRvIHRoZSBlbmQgdG8gY2xvc2UgcG9seWdvblxuICAgIGlmIChcbiAgICAgIGNvb3Jkc1swXVswXSAhPT0gY29vcmRzW2Nvb3Jkcy5sZW5ndGggLSAxXVswXSB8fFxuICAgICAgY29vcmRzWzBdWzFdICE9PSBjb29yZHNbY29vcmRzLmxlbmd0aCAtIDFdWzFdXG4gICAgKSB7XG4gICAgICBjb29yZHMucHVzaChjb29yZHNbMF0pO1xuICAgIH1cbiAgICBjb25zdCB1bmlxdWUgPSBjb29yZHMuZmlsdGVyKChpdGVtLCBpbmRleCwgYXIpID0+IHtcbiAgICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgIGNvbnN0IHB0ID0gYXJbaV07XG4gICAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gZm91bmRJbmRleCA9PT0gaW5kZXg7XG4gICAgfSk7XG4gICAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICAgKTtcbiAgICB9XG4gICAgLy8gQ29udmVydCBsYXQvbG9uZyAtPiBsb25nL2xhdFxuICAgIGNvb3JkcyA9IGNvb3Jkcy5tYXAoY29vcmQgPT4ge1xuICAgICAgcmV0dXJuIFtjb29yZFsxXSwgY29vcmRbMF1dO1xuICAgIH0pO1xuICAgIHJldHVybiB7IHR5cGU6ICdQb2x5Z29uJywgY29vcmRpbmF0ZXM6IFtjb29yZHNdIH07XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJztcbiAgfSxcbn07XG5cbnZhciBGaWxlQ29kZXIgPSB7XG4gIGRhdGFiYXNlVG9KU09OKG9iamVjdCkge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgIG5hbWU6IG9iamVjdCxcbiAgICB9O1xuICB9LFxuXG4gIGlzVmFsaWREYXRhYmFzZU9iamVjdChvYmplY3QpIHtcbiAgICByZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gJ3N0cmluZyc7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBqc29uLm5hbWU7XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJztcbiAgfSxcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0cmFuc2Zvcm1LZXksXG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgdHJhbnNmb3JtVXBkYXRlLFxuICB0cmFuc2Zvcm1XaGVyZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICByZWxhdGl2ZVRpbWVUb0RhdGUsXG4gIHRyYW5zZm9ybUNvbnN0cmFpbnQsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59O1xuIl19