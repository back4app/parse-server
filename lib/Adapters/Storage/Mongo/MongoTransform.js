"use strict";

var _logger = _interopRequireDefault(require("../../../logger"));
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
var mongodb = require('mongodb');
var Parse = require('parse/node').Parse;
const Utils = require('../../../Utils');
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
  }

  // Handle atomic values
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
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key,
      value
    };
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return {
      key,
      value: transformUpdateOperator(restValue, false)
    };
  }

  // Handle normal objects by recursing
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
  }
  // Handle atomic values
  var value = transformInteriorAtom(restValue);
  if (value !== CannotTransform) {
    if (value && typeof value === 'object') {
      if (value instanceof Date) {
        return value;
      }
      if (value instanceof Array) {
        value = value.map(transformInteriorValue);
      } else {
        value = mapValues(value, transformInteriorValue);
      }
    }
    return value;
  }

  // Handle arrays
  if (restValue instanceof Array) {
    return restValue.map(transformInteriorValue);
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return transformUpdateOperator(restValue, true);
  }

  // Handle normal objects by recursing
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
        const authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)(\.(.+))?$/);
        if (authDataMatch && className === '_User') {
          const provider = authDataMatch[1];
          const subField = authDataMatch[3];
          return {
            key: `_auth_data_${provider}${subField ? `.${subField}` : ''}`,
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
  }

  // Handle query constraints
  const transformedConstraint = transformConstraint(value, field, key, count);
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
  }

  // Handle atomic values
  const transformRes = key.includes('.') ? transformInteriorAtom(value) : transformTopLevelAtom(value);
  if (transformRes !== CannotTransform) {
    return {
      key,
      value: transformRes
    };
  } else {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `You cannot use ${value} as a query parameter.`);
  }
}

// Main exposed method to help run queries.
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
      }
      // Trust that the auth data has been transformed and save it directly
      if (restKey.match(/^_auth_data_[a-zA-Z0-9_]+$/)) {
        return {
          key: restKey,
          value: restValue
        };
      }
  }
  //skip straight to transformTopLevelAtom for Bytes, they don't show up in the schema for some reason
  if (restValue && restValue.__type !== 'Bytes') {
    //Note: We may not know the type of a field here, as the user could be saving (null) to a field
    //That never existed before, meaning we can't infer the type.
    if (schema.fields[restKey] && schema.fields[restKey].type == 'Pointer' || restValue.__type == 'Pointer') {
      restKey = '_p_' + restKey;
    }
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    return {
      key: restKey,
      value: value
    };
  }

  // ACLs are handled before this method is called
  // If an ACL key still exists here, something is wrong.
  if (restKey === 'ACL') {
    throw 'There was a problem transforming an ACL.';
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key: restKey,
      value: value
    };
  }

  // Handle normal objects by recursing
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
  }

  // Use the legacy mongo format for createdAt and updatedAt
  if (mongoCreate.createdAt) {
    mongoCreate._created_at = new Date(mongoCreate.createdAt.iso || mongoCreate.createdAt);
    delete mongoCreate.createdAt;
  }
  if (mongoCreate.updatedAt) {
    mongoCreate._updated_at = new Date(mongoCreate.updatedAt.iso || mongoCreate.updatedAt);
    delete mongoCreate.updatedAt;
  }
  return mongoCreate;
};

// Main exposed method to help update old objects.
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
    var out = transformKeyValueForUpdate(className, restKey, restUpdate[restKey], parseFormatSchema);

    // If the output value is an object with any $ keys, it's an
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
};

// Add the legacy _acl format.
const addLegacyACL = restObject => {
  const restObjectCopy = {
    ...restObject
  };
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
      // Own-property check so an inherited member name is never read as the container
      if (!Object.hasOwn(_acl, entry)) {
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
};

// A sentinel value that helper transformations return when they
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
};

// Helper function to transform an atom from REST format to Mongo format.
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
      }

      // TODO: check validity harder for the __type-defined types
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

// Transforms a query constraint from REST API format to Mongo format.
// A constraint is something with fields like $lt.
// If it is not a valid constraint but it could be a valid something
// else, return CannotTransform.
// inArray is whether this is an array field.
function transformConstraint(constraint, field, queryKey, count = false) {
  const inArray = field && field.type && field.type === 'Array';
  // Check wether the given key has `.`
  const isNestedKey = queryKey.indexOf('.') > -1;
  if (typeof constraint !== 'object' || !constraint) {
    return CannotTransform;
  }
  // For inArray or nested key, we need to transform the interior atom
  const transformFunction = inArray || isNestedKey ? transformInteriorAtom : transformTopLevelAtom;
  const transformer = atom => {
    const result = transformFunction(atom, field);
    if (result === CannotTransform) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `bad atom: ${JSON.stringify(atom)}`);
    }
    return result;
  };
  // keys is the constraints in reverse alphabetical order.
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
            const parserResult = Utils.relativeTimeToDate(val.$relativeTime);
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
            }
            // Get point, convert to geo point if necessary and validate
            let point = centerSphere[0];
            if (point instanceof Array && point.length === 2) {
              point = new Parse.GeoPoint(point[1], point[0]);
            } else if (!GeoPointCoder.isValidJSON(point)) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
            }
            Parse.GeoPoint._validate(point.latitude, point.longitude);
            // Get distance and validate
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
}

// Transforms an update operator from REST format to mongo format.
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
    case 'SetOnInsert':
      if (flatten) {
        return amount;
      } else {
        return {
          __op: '$setOnInsert',
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
};

// Converts from a mongo-format object to a REST-format object.
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
                // Unrecognized reserved key: drop it instead of failing the read
                _logger.default.warn('transform.js', 'Found an unexpected reserved key, dropping it.', className, key);
                break;
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
        return {
          ...restObject,
          ...relationFields
        };
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
    let coords = json.coordinates;
    // Add first point to the end to close polygon
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
    }
    // Convert lat/long -> long/lat
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
  transformConstraint,
  transformPointerString
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwibW9uZ29kYiIsIlBhcnNlIiwiVXRpbHMiLCJ0cmFuc2Zvcm1LZXkiLCJjbGFzc05hbWUiLCJmaWVsZE5hbWUiLCJzY2hlbWEiLCJmaWVsZHMiLCJfX3R5cGUiLCJ0eXBlIiwidHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUiLCJyZXN0S2V5IiwicmVzdFZhbHVlIiwicGFyc2VGb3JtYXRTY2hlbWEiLCJrZXkiLCJ0aW1lRmllbGQiLCJpbmNsdWRlcyIsInZhbHVlIiwicGFyc2VJbnQiLCJ0cmFuc2Zvcm1Ub3BMZXZlbEF0b20iLCJDYW5ub3RUcmFuc2Zvcm0iLCJEYXRlIiwiaW5kZXhPZiIsIkFycmF5IiwibWFwIiwidHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSIsInRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yIiwibWFwVmFsdWVzIiwiaXNSZWdleCIsIlJlZ0V4cCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwibWF0Y2hlcyIsInRvU3RyaW5nIiwibWF0Y2giLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwidmFsdWVzIiwiaXNBcnJheSIsImxlbmd0aCIsImZpcnN0VmFsdWVzSXNSZWdleCIsImkiLCJpc0FueVZhbHVlUmVnZXgiLCJzb21lIiwiT2JqZWN0Iiwia2V5cyIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwic3ViRmllbGQiLCJleHBlY3RlZFR5cGVJc0FycmF5IiwiZXhwZWN0ZWRUeXBlSXNQb2ludGVyIiwiZmllbGQiLCJ0cmFuc2Zvcm1lZENvbnN0cmFpbnQiLCJ0cmFuc2Zvcm1Db25zdHJhaW50IiwiJHRleHQiLCIkZWxlbU1hdGNoIiwiJGFsbCIsInRyYW5zZm9ybVJlcyIsIklOVkFMSURfSlNPTiIsInJlc3RXaGVyZSIsIm1vbmdvV2hlcmUiLCJvdXQiLCJwYXJzZU9iamVjdEtleVZhbHVlVG9Nb25nb09iamVjdEtleVZhbHVlIiwidHJhbnNmb3JtZWRWYWx1ZSIsImNvZXJjZWRUb0RhdGUiLCJJTlZBTElEX0tFWV9OQU1FIiwicGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlIiwicmVzdENyZWF0ZSIsImFkZExlZ2FjeUFDTCIsIm1vbmdvQ3JlYXRlIiwidW5kZWZpbmVkIiwiY3JlYXRlZEF0IiwiX2NyZWF0ZWRfYXQiLCJpc28iLCJ1cGRhdGVkQXQiLCJfdXBkYXRlZF9hdCIsInRyYW5zZm9ybVVwZGF0ZSIsInJlc3RVcGRhdGUiLCJtb25nb1VwZGF0ZSIsImFjbCIsIl9ycGVybSIsIl93cGVybSIsIl9hY2wiLCIkc2V0IiwiX19vcCIsImFyZyIsInJlc3RPYmplY3QiLCJyZXN0T2JqZWN0Q29weSIsImZvckVhY2giLCJlbnRyeSIsInciLCJoYXNPd24iLCJyIiwiYXRvbSIsIm9iamVjdElkIiwiRGF0ZUNvZGVyIiwiaXNWYWxpZEpTT04iLCJKU09OVG9EYXRhYmFzZSIsIkJ5dGVzQ29kZXIiLCIkcmVnZXgiLCJ0YXJnZXRDbGFzcyIsIkdlb1BvaW50Q29kZXIiLCJQb2x5Z29uQ29kZXIiLCJGaWxlQ29kZXIiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJjb25zdHJhaW50IiwicXVlcnlLZXkiLCJpbkFycmF5IiwiaXNOZXN0ZWRLZXkiLCJ0cmFuc2Zvcm1GdW5jdGlvbiIsInRyYW5zZm9ybWVyIiwicmVzdWx0IiwiSlNPTiIsInN0cmluZ2lmeSIsInNvcnQiLCJyZXZlcnNlIiwiYW5zd2VyIiwidmFsIiwiJHJlbGF0aXZlVGltZSIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsImxvZyIsImluZm8iLCJhcnIiLCJfIiwiZmxhdE1hcCIsInMiLCIkbmluIiwic2VhcmNoIiwiJHNlYXJjaCIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwicG9pbnQiLCIkZ2VvV2l0aGluIiwiJGNlbnRlclNwaGVyZSIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJG1heERpc3RhbmNlIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsImJveCIsIiRib3giLCJwb2x5Z29uIiwiY2VudGVyU3BoZXJlIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCJHZW9Qb2ludCIsIl92YWxpZGF0ZSIsIiRwb2x5Z29uIiwiZGlzdGFuY2UiLCJpc05hTiIsIiRnZW9tZXRyeSIsImFtb3VudCIsIm9iamVjdHMiLCJmbGF0dGVuIiwidG9BZGQiLCJtb25nb09wIiwiQWRkIiwiQWRkVW5pcXVlIiwiJGVhY2giLCJ0b1JlbW92ZSIsIm9iamVjdCIsIml0ZXJhdG9yIiwibmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0IiwibW9uZ29PYmplY3QiLCJfZW5jb2RlIiwiTG9uZyIsInRvTnVtYmVyIiwiRG91YmxlIiwiaXNWYWxpZERhdGFiYXNlT2JqZWN0IiwiZGF0YWJhc2VUb0pTT04iLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0b0pTT04iLCJ0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nIiwicG9pbnRlclN0cmluZyIsIm9iakRhdGEiLCJzcGxpdCIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJ3YXJuIiwibmV3S2V5Iiwic3Vic3RyaW5nIiwicmVsYXRpb25GaWVsZE5hbWVzIiwiZmlsdGVyIiwicmVsYXRpb25GaWVsZHMiLCJyZWxhdGlvbkZpZWxkTmFtZSIsImpzb24iLCJiYXNlNjRQYXR0ZXJuIiwiaXNCYXNlNjRWYWx1ZSIsInRlc3QiLCJidWZmZXIiLCJiYXNlNjQiLCJCaW5hcnkiLCJCdWZmZXIiLCJmcm9tIiwiY29vcmRzIiwiY29vcmQiLCJwYXJzZUZsb2F0IiwicHVzaCIsInVuaXF1ZSIsIml0ZW0iLCJpbmRleCIsImFyIiwiZm91bmRJbmRleCIsInB0IiwibmFtZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1RyYW5zZm9ybS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nIGZyb20gJy4uLy4uLy4uL2xvZ2dlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xudmFyIG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uLy4uLy4uL1V0aWxzJyk7XG5cbmNvbnN0IHRyYW5zZm9ybUtleSA9IChjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICAgIHJldHVybiAnX2lkJztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgcmV0dXJuICdfY3JlYXRlZF9hdCc7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIHJldHVybiAnX3VwZGF0ZWRfYXQnO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4gJ19zZXNzaW9uX3Rva2VuJztcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICByZXR1cm4gJ19sYXN0X3VzZWQnO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICByZXR1cm4gJ3RpbWVzX3VzZWQnO1xuICB9XG5cbiAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uX190eXBlID09ICdQb2ludGVyJykge1xuICAgIGZpZWxkTmFtZSA9ICdfcF8nICsgZmllbGROYW1lO1xuICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICBmaWVsZE5hbWUgPSAnX3BfJyArIGZpZWxkTmFtZTtcbiAgfVxuXG4gIHJldHVybiBmaWVsZE5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZSA9IChjbGFzc05hbWUsIHJlc3RLZXksIHJlc3RWYWx1ZSwgcGFyc2VGb3JtYXRTY2hlbWEpID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIHZhciBrZXkgPSByZXN0S2V5O1xuICB2YXIgdGltZUZpZWxkID0gZmFsc2U7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgIGNhc2UgJ19pZCc6XG4gICAgICBpZiAoWydfR2xvYmFsQ29uZmlnJywgJ19HcmFwaFFMQ29uZmlnJ10uaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleToga2V5LFxuICAgICAgICAgIHZhbHVlOiBwYXJzZUludChyZXN0VmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19pZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgIGNhc2UgJ19jcmVhdGVkX2F0JzpcbiAgICAgIGtleSA9ICdfY3JlYXRlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICBjYXNlICdfdXBkYXRlZF9hdCc6XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgY2FzZSAnX3Nlc3Npb25fdG9rZW4nOlxuICAgICAga2V5ID0gJ19zZXNzaW9uX3Rva2VuJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgY2FzZSAnX2V4cGlyZXNBdCc6XG4gICAgICBrZXkgPSAnZXhwaXJlc0F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAga2V5ID0gJ19mYWlsZWRfbG9naW5fY291bnQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAga2V5ID0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgICByZXR1cm4geyBrZXk6IGtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICBjYXNlICdfbGFzdF91c2VkJzpcbiAgICAgIGtleSA9ICdfbGFzdF91c2VkJztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgIGNhc2UgJ3RpbWVzX3VzZWQnOlxuICAgICAga2V5ID0gJ3RpbWVzX3VzZWQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKFxuICAgIChwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XSAmJiBwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgKCFrZXkuaW5jbHVkZXMoJy4nKSAmJlxuICAgICAgIXBhcnNlRm9ybWF0U2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICByZXN0VmFsdWUgJiZcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInKSAvLyBEbyBub3QgdXNlIHRoZSBfcF8gcHJlZml4IGZvciBwb2ludGVycyBpbnNpZGUgbmVzdGVkIGRvY3VtZW50c1xuICApIHtcbiAgICBrZXkgPSAnX3BfJyArIGtleTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIGlmICh0aW1lRmllbGQgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgdmFsdWUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgfVxuICAgIGlmIChyZXN0S2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gIH1cblxuICAvLyBIYW5kbGUgdXBkYXRlIG9wZXJhdG9yc1xuICBpZiAodHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ19fb3AnIGluIHJlc3RWYWx1ZSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yKHJlc3RWYWx1ZSwgZmFsc2UpIH07XG4gIH1cblxuICAvLyBIYW5kbGUgbm9ybWFsIG9iamVjdHMgYnkgcmVjdXJzaW5nXG4gIHZhbHVlID0gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbn07XG5cbmNvbnN0IGlzUmVnZXggPSB2YWx1ZSA9PiB7XG4gIHJldHVybiB2YWx1ZSAmJiB2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cDtcbn07XG5cbmNvbnN0IGlzU3RhcnRzV2l0aFJlZ2V4ID0gdmFsdWUgPT4ge1xuICBpZiAoIWlzUmVnZXgodmFsdWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLnRvU3RyaW5nKCkubWF0Y2goL1xcL1xcXlxcXFxRLipcXFxcRVxcLy8pO1xuICByZXR1cm4gISFtYXRjaGVzO1xufTtcblxuY29uc3QgaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSA9IHZhbHVlcyA9PiB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdKTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmNvbnN0IGlzQW55VmFsdWVSZWdleCA9IHZhbHVlcyA9PiB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNSZWdleCh2YWx1ZSk7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSA9IHJlc3RWYWx1ZSA9PiB7XG4gIGlmIChcbiAgICByZXN0VmFsdWUgIT09IG51bGwgJiZcbiAgICB0eXBlb2YgcmVzdFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgIE9iamVjdC5rZXlzKHJlc3RWYWx1ZSkuc29tZShrZXkgPT4ga2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICk7XG4gIH1cbiAgLy8gSGFuZGxlIGF0b21pYyB2YWx1ZXNcbiAgdmFyIHZhbHVlID0gdHJhbnNmb3JtSW50ZXJpb3JBdG9tKHJlc3RWYWx1ZSk7XG4gIGlmICh2YWx1ZSAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfVxuICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZSA9IG1hcFZhbHVlcyh2YWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhcnJheXNcbiAgaWYgKHJlc3RWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIH1cblxuICAvLyBIYW5kbGUgdXBkYXRlIG9wZXJhdG9yc1xuICBpZiAodHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ19fb3AnIGluIHJlc3RWYWx1ZSkge1xuICAgIHJldHVybiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcihyZXN0VmFsdWUsIHRydWUpO1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICByZXR1cm4gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG59O1xuXG5jb25zdCB2YWx1ZUFzRGF0ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1RdWVyeUtleVZhbHVlKGNsYXNzTmFtZSwga2V5LCB2YWx1ZSwgc2NoZW1hLCBjb3VudCA9IGZhbHNlKSB7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX2NyZWF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2NyZWF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX3VwZGF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnZXhwaXJlc0F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvYmplY3RJZCc6IHtcbiAgICAgIGlmIChbJ19HbG9iYWxDb25maWcnLCAnX0dyYXBoUUxDb25maWcnXS5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsga2V5OiAnX2lkJywgdmFsdWUgfTtcbiAgICB9XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX3Nlc3Npb25fdG9rZW4nLCB2YWx1ZSB9O1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuJzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICckb3InOlxuICAgIGNhc2UgJyRhbmQnOlxuICAgIGNhc2UgJyRub3InOlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIHZhbHVlOiB2YWx1ZS5tYXAoc3ViUXVlcnkgPT4gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBzdWJRdWVyeSwgc2NoZW1hLCBjb3VudCkpLFxuICAgICAgfTtcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19sYXN0X3VzZWQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2xhc3RfdXNlZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgcmV0dXJuIHsga2V5OiAndGltZXNfdXNlZCcsIHZhbHVlOiB2YWx1ZSB9O1xuICAgIGRlZmF1bHQ6IHtcbiAgICAgIC8vIE90aGVyIGF1dGggZGF0YVxuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspKFxcLiguKykpPyQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICBjb25zdCBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIGNvbnN0IHN1YkZpZWxkID0gYXV0aERhdGFNYXRjaFszXTtcbiAgICAgICAgcmV0dXJuIHsga2V5OiBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfSR7c3ViRmllbGQgPyBgLiR7c3ViRmllbGR9YCA6ICcnfWAsIHZhbHVlIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZXhwZWN0ZWRUeXBlSXNBcnJheSA9IHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdBcnJheSc7XG5cbiAgY29uc3QgZXhwZWN0ZWRUeXBlSXNQb2ludGVyID1cbiAgICBzY2hlbWEgJiYgc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9pbnRlcic7XG5cbiAgY29uc3QgZmllbGQgPSBzY2hlbWEgJiYgc2NoZW1hLmZpZWxkc1trZXldO1xuICBpZiAoXG4gICAgZXhwZWN0ZWRUeXBlSXNQb2ludGVyIHx8XG4gICAgKCFzY2hlbWEgJiYgIWtleS5pbmNsdWRlcygnLicpICYmIHZhbHVlICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKVxuICApIHtcbiAgICBrZXkgPSAnX3BfJyArIGtleTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBxdWVyeSBjb25zdHJhaW50c1xuICBjb25zdCB0cmFuc2Zvcm1lZENvbnN0cmFpbnQgPSB0cmFuc2Zvcm1Db25zdHJhaW50KHZhbHVlLCBmaWVsZCwga2V5LCBjb3VudCk7XG4gIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJHRleHQpIHtcbiAgICAgIHJldHVybiB7IGtleTogJyR0ZXh0JywgdmFsdWU6IHRyYW5zZm9ybWVkQ29uc3RyYWludC4kdGV4dCB9O1xuICAgIH1cbiAgICBpZiAodHJhbnNmb3JtZWRDb25zdHJhaW50LiRlbGVtTWF0Y2gpIHtcbiAgICAgIHJldHVybiB7IGtleTogJyRub3InLCB2YWx1ZTogW3sgW2tleV06IHRyYW5zZm9ybWVkQ29uc3RyYWludCB9XSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1lZENvbnN0cmFpbnQgfTtcbiAgfVxuXG4gIGlmIChleHBlY3RlZFR5cGVJc0FycmF5ICYmICEodmFsdWUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB7ICRhbGw6IFt0cmFuc2Zvcm1JbnRlcmlvckF0b20odmFsdWUpXSB9IH07XG4gIH1cblxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICBjb25zdCB0cmFuc2Zvcm1SZXMgPSBrZXkuaW5jbHVkZXMoJy4nKVxuICAgID8gdHJhbnNmb3JtSW50ZXJpb3JBdG9tKHZhbHVlKVxuICAgIDogdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHZhbHVlKTtcbiAgaWYgKHRyYW5zZm9ybVJlcyAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogdHJhbnNmb3JtUmVzIH07XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYFlvdSBjYW5ub3QgdXNlICR7dmFsdWV9IGFzIGEgcXVlcnkgcGFyYW1ldGVyLmBcbiAgICApO1xuICB9XG59XG5cbi8vIE1haW4gZXhwb3NlZCBtZXRob2QgdG8gaGVscCBydW4gcXVlcmllcy5cbi8vIHJlc3RXaGVyZSBpcyB0aGUgXCJ3aGVyZVwiIGNsYXVzZSBpbiBSRVNUIEFQSSBmb3JtLlxuLy8gUmV0dXJucyB0aGUgbW9uZ28gZm9ybSBvZiB0aGUgcXVlcnkuXG5mdW5jdGlvbiB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHJlc3RXaGVyZSwgc2NoZW1hLCBjb3VudCA9IGZhbHNlKSB7XG4gIGNvbnN0IG1vbmdvV2hlcmUgPSB7fTtcbiAgZm9yIChjb25zdCByZXN0S2V5IGluIHJlc3RXaGVyZSkge1xuICAgIGNvbnN0IG91dCA9IHRyYW5zZm9ybVF1ZXJ5S2V5VmFsdWUoY2xhc3NOYW1lLCByZXN0S2V5LCByZXN0V2hlcmVbcmVzdEtleV0sIHNjaGVtYSwgY291bnQpO1xuICAgIG1vbmdvV2hlcmVbb3V0LmtleV0gPSBvdXQudmFsdWU7XG4gIH1cbiAgcmV0dXJuIG1vbmdvV2hlcmU7XG59XG5cbmNvbnN0IHBhcnNlT2JqZWN0S2V5VmFsdWVUb01vbmdvT2JqZWN0S2V5VmFsdWUgPSAocmVzdEtleSwgcmVzdFZhbHVlLCBzY2hlbWEpID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIGxldCB0cmFuc2Zvcm1lZFZhbHVlO1xuICBsZXQgY29lcmNlZFRvRGF0ZTtcbiAgc3dpdGNoIChyZXN0S2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX2lkJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnZXhwaXJlc0F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW4nOlxuICAgIGNhc2UgJ19oYXNoZWRfcGFzc3dvcmQnOlxuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4geyBrZXk6ICdfc2Vzc2lvbl90b2tlbicsIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICBkZWZhdWx0OlxuICAgICAgLy8gQXV0aCBkYXRhIHNob3VsZCBoYXZlIGJlZW4gdHJhbnNmb3JtZWQgYWxyZWFkeVxuICAgICAgaWYgKHJlc3RLZXkubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnY2FuIG9ubHkgcXVlcnkgb24gJyArIHJlc3RLZXkpO1xuICAgICAgfVxuICAgICAgLy8gVHJ1c3QgdGhhdCB0aGUgYXV0aCBkYXRhIGhhcyBiZWVuIHRyYW5zZm9ybWVkIGFuZCBzYXZlIGl0IGRpcmVjdGx5XG4gICAgICBpZiAocmVzdEtleS5tYXRjaCgvXl9hdXRoX2RhdGFfW2EtekEtWjAtOV9dKyQvKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICAgIH1cbiAgfVxuICAvL3NraXAgc3RyYWlnaHQgdG8gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tIGZvciBCeXRlcywgdGhleSBkb24ndCBzaG93IHVwIGluIHRoZSBzY2hlbWEgZm9yIHNvbWUgcmVhc29uXG4gIGlmIChyZXN0VmFsdWUgJiYgcmVzdFZhbHVlLl9fdHlwZSAhPT0gJ0J5dGVzJykge1xuICAgIC8vTm90ZTogV2UgbWF5IG5vdCBrbm93IHRoZSB0eXBlIG9mIGEgZmllbGQgaGVyZSwgYXMgdGhlIHVzZXIgY291bGQgYmUgc2F2aW5nIChudWxsKSB0byBhIGZpZWxkXG4gICAgLy9UaGF0IG5ldmVyIGV4aXN0ZWQgYmVmb3JlLCBtZWFuaW5nIHdlIGNhbid0IGluZmVyIHRoZSB0eXBlLlxuICAgIGlmIChcbiAgICAgIChzY2hlbWEuZmllbGRzW3Jlc3RLZXldICYmIHNjaGVtYS5maWVsZHNbcmVzdEtleV0udHlwZSA9PSAnUG9pbnRlcicpIHx8XG4gICAgICByZXN0VmFsdWUuX190eXBlID09ICdQb2ludGVyJ1xuICAgICkge1xuICAgICAgcmVzdEtleSA9ICdfcF8nICsgcmVzdEtleTtcbiAgICB9XG4gIH1cblxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICB2YXIgdmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgaWYgKHZhbHVlICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gQUNMcyBhcmUgaGFuZGxlZCBiZWZvcmUgdGhpcyBtZXRob2QgaXMgY2FsbGVkXG4gIC8vIElmIGFuIEFDTCBrZXkgc3RpbGwgZXhpc3RzIGhlcmUsIHNvbWV0aGluZyBpcyB3cm9uZy5cbiAgaWYgKHJlc3RLZXkgPT09ICdBQ0wnKSB7XG4gICAgdGhyb3cgJ1RoZXJlIHdhcyBhIHByb2JsZW0gdHJhbnNmb3JtaW5nIGFuIEFDTC4nO1xuICB9XG5cbiAgLy8gSGFuZGxlIGFycmF5c1xuICBpZiAocmVzdFZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB2YWx1ZSA9IHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBub3JtYWwgb2JqZWN0cyBieSByZWN1cnNpbmdcbiAgaWYgKE9iamVjdC5rZXlzKHJlc3RWYWx1ZSkuc29tZShrZXkgPT4ga2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgKTtcbiAgfVxuICB2YWx1ZSA9IG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuXG4gIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWUgfTtcbn07XG5cbmNvbnN0IHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSA9IChjbGFzc05hbWUsIHJlc3RDcmVhdGUsIHNjaGVtYSkgPT4ge1xuICByZXN0Q3JlYXRlID0gYWRkTGVnYWN5QUNMKHJlc3RDcmVhdGUpO1xuICBjb25zdCBtb25nb0NyZWF0ZSA9IHt9O1xuICBmb3IgKGNvbnN0IHJlc3RLZXkgaW4gcmVzdENyZWF0ZSkge1xuICAgIGlmIChyZXN0Q3JlYXRlW3Jlc3RLZXldICYmIHJlc3RDcmVhdGVbcmVzdEtleV0uX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgeyBrZXksIHZhbHVlIH0gPSBwYXJzZU9iamVjdEtleVZhbHVlVG9Nb25nb09iamVjdEtleVZhbHVlKFxuICAgICAgcmVzdEtleSxcbiAgICAgIHJlc3RDcmVhdGVbcmVzdEtleV0sXG4gICAgICBzY2hlbWFcbiAgICApO1xuICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBtb25nb0NyZWF0ZVtrZXldID0gdmFsdWU7XG4gICAgfVxuICB9XG5cbiAgLy8gVXNlIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0IGZvciBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdFxuICBpZiAobW9uZ29DcmVhdGUuY3JlYXRlZEF0KSB7XG4gICAgbW9uZ29DcmVhdGUuX2NyZWF0ZWRfYXQgPSBuZXcgRGF0ZShtb25nb0NyZWF0ZS5jcmVhdGVkQXQuaXNvIHx8IG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdCk7XG4gICAgZGVsZXRlIG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdDtcbiAgfVxuICBpZiAobW9uZ29DcmVhdGUudXBkYXRlZEF0KSB7XG4gICAgbW9uZ29DcmVhdGUuX3VwZGF0ZWRfYXQgPSBuZXcgRGF0ZShtb25nb0NyZWF0ZS51cGRhdGVkQXQuaXNvIHx8IG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdCk7XG4gICAgZGVsZXRlIG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdDtcbiAgfVxuXG4gIHJldHVybiBtb25nb0NyZWF0ZTtcbn07XG5cbi8vIE1haW4gZXhwb3NlZCBtZXRob2QgdG8gaGVscCB1cGRhdGUgb2xkIG9iamVjdHMuXG5jb25zdCB0cmFuc2Zvcm1VcGRhdGUgPSAoY2xhc3NOYW1lLCByZXN0VXBkYXRlLCBwYXJzZUZvcm1hdFNjaGVtYSkgPT4ge1xuICBjb25zdCBtb25nb1VwZGF0ZSA9IHt9O1xuICBjb25zdCBhY2wgPSBhZGRMZWdhY3lBQ0wocmVzdFVwZGF0ZSk7XG4gIGlmIChhY2wuX3JwZXJtIHx8IGFjbC5fd3Blcm0gfHwgYWNsLl9hY2wpIHtcbiAgICBtb25nb1VwZGF0ZS4kc2V0ID0ge307XG4gICAgaWYgKGFjbC5fcnBlcm0pIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX3JwZXJtID0gYWNsLl9ycGVybTtcbiAgICB9XG4gICAgaWYgKGFjbC5fd3Blcm0pIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX3dwZXJtID0gYWNsLl93cGVybTtcbiAgICB9XG4gICAgaWYgKGFjbC5fYWNsKSB7XG4gICAgICBtb25nb1VwZGF0ZS4kc2V0Ll9hY2wgPSBhY2wuX2FjbDtcbiAgICB9XG4gIH1cbiAgZm9yICh2YXIgcmVzdEtleSBpbiByZXN0VXBkYXRlKSB7XG4gICAgaWYgKHJlc3RVcGRhdGVbcmVzdEtleV0gJiYgcmVzdFVwZGF0ZVtyZXN0S2V5XS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB2YXIgb3V0ID0gdHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUoXG4gICAgICBjbGFzc05hbWUsXG4gICAgICByZXN0S2V5LFxuICAgICAgcmVzdFVwZGF0ZVtyZXN0S2V5XSxcbiAgICAgIHBhcnNlRm9ybWF0U2NoZW1hXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvdXRwdXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW55ICQga2V5cywgaXQncyBhblxuICAgIC8vIG9wZXJhdG9yIHRoYXQgbmVlZHMgdG8gYmUgbGlmdGVkIG9udG8gdGhlIHRvcCBsZXZlbCB1cGRhdGVcbiAgICAvLyBvYmplY3QuXG4gICAgaWYgKHR5cGVvZiBvdXQudmFsdWUgPT09ICdvYmplY3QnICYmIG91dC52YWx1ZSAhPT0gbnVsbCAmJiBvdXQudmFsdWUuX19vcCkge1xuICAgICAgbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdID0gbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdIHx8IHt9O1xuICAgICAgbW9uZ29VcGRhdGVbb3V0LnZhbHVlLl9fb3BdW291dC5rZXldID0gb3V0LnZhbHVlLmFyZztcbiAgICB9IGVsc2Uge1xuICAgICAgbW9uZ29VcGRhdGVbJyRzZXQnXSA9IG1vbmdvVXBkYXRlWyckc2V0J10gfHwge307XG4gICAgICBtb25nb1VwZGF0ZVsnJHNldCddW291dC5rZXldID0gb3V0LnZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtb25nb1VwZGF0ZTtcbn07XG5cbi8vIEFkZCB0aGUgbGVnYWN5IF9hY2wgZm9ybWF0LlxuY29uc3QgYWRkTGVnYWN5QUNMID0gcmVzdE9iamVjdCA9PiB7XG4gIGNvbnN0IHJlc3RPYmplY3RDb3B5ID0geyAuLi5yZXN0T2JqZWN0IH07XG4gIGNvbnN0IF9hY2wgPSB7fTtcblxuICBpZiAocmVzdE9iamVjdC5fd3Blcm0pIHtcbiAgICByZXN0T2JqZWN0Ll93cGVybS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIF9hY2xbZW50cnldID0geyB3OiB0cnVlIH07XG4gICAgfSk7XG4gICAgcmVzdE9iamVjdENvcHkuX2FjbCA9IF9hY2w7XG4gIH1cblxuICBpZiAocmVzdE9iamVjdC5fcnBlcm0pIHtcbiAgICByZXN0T2JqZWN0Ll9ycGVybS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIC8vIE93bi1wcm9wZXJ0eSBjaGVjayBzbyBhbiBpbmhlcml0ZWQgbWVtYmVyIG5hbWUgaXMgbmV2ZXIgcmVhZCBhcyB0aGUgY29udGFpbmVyXG4gICAgICBpZiAoIU9iamVjdC5oYXNPd24oX2FjbCwgZW50cnkpKSB7XG4gICAgICAgIF9hY2xbZW50cnldID0geyByOiB0cnVlIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfYWNsW2VudHJ5XS5yID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXN0T2JqZWN0Q29weS5fYWNsID0gX2FjbDtcbiAgfVxuXG4gIHJldHVybiByZXN0T2JqZWN0Q29weTtcbn07XG5cbi8vIEEgc2VudGluZWwgdmFsdWUgdGhhdCBoZWxwZXIgdHJhbnNmb3JtYXRpb25zIHJldHVybiB3aGVuIHRoZXlcbi8vIGNhbm5vdCBwZXJmb3JtIGEgdHJhbnNmb3JtYXRpb25cbmZ1bmN0aW9uIENhbm5vdFRyYW5zZm9ybSgpIHt9XG5cbmNvbnN0IHRyYW5zZm9ybUludGVyaW9yQXRvbSA9IGF0b20gPT4ge1xuICAvLyBUT0RPOiBjaGVjayB2YWxpZGl0eSBoYXJkZXIgZm9yIHRoZSBfX3R5cGUtZGVmaW5lZCB0eXBlc1xuICBpZiAodHlwZW9mIGF0b20gPT09ICdvYmplY3QnICYmIGF0b20gJiYgIShhdG9tIGluc3RhbmNlb2YgRGF0ZSkgJiYgYXRvbS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogYXRvbS5jbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogYXRvbS5vYmplY3RJZCxcbiAgICB9O1xuICB9IGVsc2UgaWYgKHR5cGVvZiBhdG9tID09PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiBhdG9tID09PSAnc3ltYm9sJykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBjYW5ub3QgdHJhbnNmb3JtIHZhbHVlOiAke2F0b219YCk7XG4gIH0gZWxzZSBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIERhdGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgfSBlbHNlIGlmIChCeXRlc0NvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgcmV0dXJuIEJ5dGVzQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGF0b20gPT09ICdvYmplY3QnICYmIGF0b20gJiYgYXRvbS4kcmVnZXggIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBuZXcgUmVnRXhwKGF0b20uJHJlZ2V4KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYXRvbTtcbiAgfVxufTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIHRyYW5zZm9ybSBhbiBhdG9tIGZyb20gUkVTVCBmb3JtYXQgdG8gTW9uZ28gZm9ybWF0LlxuLy8gQW4gYXRvbSBpcyBhbnl0aGluZyB0aGF0IGNhbid0IGNvbnRhaW4gb3RoZXIgZXhwcmVzc2lvbnMuIFNvIGl0XG4vLyBpbmNsdWRlcyB0aGluZ3Mgd2hlcmUgb2JqZWN0cyBhcmUgdXNlZCB0byByZXByZXNlbnQgb3RoZXJcbi8vIGRhdGF0eXBlcywgbGlrZSBwb2ludGVycyBhbmQgZGF0ZXMsIGJ1dCBpdCBkb2VzIG5vdCBpbmNsdWRlIG9iamVjdHNcbi8vIG9yIGFycmF5cyB3aXRoIGdlbmVyaWMgc3R1ZmYgaW5zaWRlLlxuLy8gUmFpc2VzIGFuIGVycm9yIGlmIHRoaXMgY2Fubm90IHBvc3NpYmx5IGJlIHZhbGlkIFJFU1QgZm9ybWF0LlxuLy8gUmV0dXJucyBDYW5ub3RUcmFuc2Zvcm0gaWYgaXQncyBqdXN0IG5vdCBhbiBhdG9tXG5mdW5jdGlvbiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20oYXRvbSwgZmllbGQpIHtcbiAgc3dpdGNoICh0eXBlb2YgYXRvbSkge1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBhdG9tO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHtmaWVsZC50YXJnZXRDbGFzc30kJHthdG9tfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYXRvbTtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBjYW5ub3QgdHJhbnNmb3JtIHZhbHVlOiAke2F0b219YCk7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChhdG9tIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAvLyBUZWNobmljYWxseSBkYXRlcyBhcmUgbm90IHJlc3QgZm9ybWF0LCBidXQsIGl0IHNlZW1zIHByZXR0eVxuICAgICAgICAvLyBjbGVhciB3aGF0IHRoZXkgc2hvdWxkIGJlIHRyYW5zZm9ybWVkIHRvLCBzbyBsZXQncyBqdXN0IGRvIGl0LlxuICAgICAgICByZXR1cm4gYXRvbTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF0b20gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIGF0b207XG4gICAgICB9XG5cbiAgICAgIC8vIFRPRE86IGNoZWNrIHZhbGlkaXR5IGhhcmRlciBmb3IgdGhlIF9fdHlwZS1kZWZpbmVkIHR5cGVzXG4gICAgICBpZiAoYXRvbS5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJHthdG9tLmNsYXNzTmFtZX0kJHthdG9tLm9iamVjdElkfWA7XG4gICAgICB9XG4gICAgICBpZiAoRGF0ZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBEYXRlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBHZW9Qb2ludENvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKFBvbHlnb25Db2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gUG9seWdvbkNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEZpbGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gRmlsZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBJIGRvbid0IHRoaW5rIHR5cGVvZiBjYW4gZXZlciBsZXQgdXMgZ2V0IGhlcmVcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICBgcmVhbGx5IGRpZCBub3QgZXhwZWN0IHZhbHVlOiAke2F0b219YFxuICAgICAgKTtcbiAgfVxufVxuXG4vLyBUcmFuc2Zvcm1zIGEgcXVlcnkgY29uc3RyYWludCBmcm9tIFJFU1QgQVBJIGZvcm1hdCB0byBNb25nbyBmb3JtYXQuXG4vLyBBIGNvbnN0cmFpbnQgaXMgc29tZXRoaW5nIHdpdGggZmllbGRzIGxpa2UgJGx0LlxuLy8gSWYgaXQgaXMgbm90IGEgdmFsaWQgY29uc3RyYWludCBidXQgaXQgY291bGQgYmUgYSB2YWxpZCBzb21ldGhpbmdcbi8vIGVsc2UsIHJldHVybiBDYW5ub3RUcmFuc2Zvcm0uXG4vLyBpbkFycmF5IGlzIHdoZXRoZXIgdGhpcyBpcyBhbiBhcnJheSBmaWVsZC5cbmZ1bmN0aW9uIHRyYW5zZm9ybUNvbnN0cmFpbnQoY29uc3RyYWludCwgZmllbGQsIHF1ZXJ5S2V5LCBjb3VudCA9IGZhbHNlKSB7XG4gIGNvbnN0IGluQXJyYXkgPSBmaWVsZCAmJiBmaWVsZC50eXBlICYmIGZpZWxkLnR5cGUgPT09ICdBcnJheSc7XG4gIC8vIENoZWNrIHdldGhlciB0aGUgZ2l2ZW4ga2V5IGhhcyBgLmBcbiAgY29uc3QgaXNOZXN0ZWRLZXkgPSBxdWVyeUtleS5pbmRleE9mKCcuJykgPiAtMTtcbiAgaWYgKHR5cGVvZiBjb25zdHJhaW50ICE9PSAnb2JqZWN0JyB8fCAhY29uc3RyYWludCkge1xuICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG4gIH1cbiAgLy8gRm9yIGluQXJyYXkgb3IgbmVzdGVkIGtleSwgd2UgbmVlZCB0byB0cmFuc2Zvcm0gdGhlIGludGVyaW9yIGF0b21cbiAgY29uc3QgdHJhbnNmb3JtRnVuY3Rpb24gPSAoaW5BcnJheSB8fCBpc05lc3RlZEtleSkgPyB0cmFuc2Zvcm1JbnRlcmlvckF0b20gOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b207XG4gIGNvbnN0IHRyYW5zZm9ybWVyID0gYXRvbSA9PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNmb3JtRnVuY3Rpb24oYXRvbSwgZmllbGQpO1xuICAgIGlmIChyZXN1bHQgPT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCBhdG9tOiAke0pTT04uc3RyaW5naWZ5KGF0b20pfWApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuICAvLyBrZXlzIGlzIHRoZSBjb25zdHJhaW50cyBpbiByZXZlcnNlIGFscGhhYmV0aWNhbCBvcmRlci5cbiAgLy8gVGhpcyBpcyBhIGhhY2sgc28gdGhhdDpcbiAgLy8gICAkcmVnZXggaXMgaGFuZGxlZCBiZWZvcmUgJG9wdGlvbnNcbiAgLy8gICAkbmVhclNwaGVyZSBpcyBoYW5kbGVkIGJlZm9yZSAkbWF4RGlzdGFuY2VcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhjb25zdHJhaW50KS5zb3J0KCkucmV2ZXJzZSgpO1xuICB2YXIgYW5zd2VyID0ge307XG4gIGZvciAodmFyIGtleSBvZiBrZXlzKSB7XG4gICAgc3dpdGNoIChrZXkpIHtcbiAgICAgIGNhc2UgJyRsdCc6XG4gICAgICBjYXNlICckbHRlJzpcbiAgICAgIGNhc2UgJyRndCc6XG4gICAgICBjYXNlICckZ3RlJzpcbiAgICAgIGNhc2UgJyRleGlzdHMnOlxuICAgICAgY2FzZSAnJG5lJzpcbiAgICAgIGNhc2UgJyRlcSc6IHtcbiAgICAgICAgY29uc3QgdmFsID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAodmFsICYmIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmIHZhbC4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgIT09ICdEYXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBEYXRlIGZpZWxkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgICAgY2FzZSAnJGV4aXN0cyc6XG4gICAgICAgICAgICBjYXNlICckbmUnOlxuICAgICAgICAgICAgY2FzZSAnJGVxJzpcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcGFyc2VyUmVzdWx0ID0gVXRpbHMucmVsYXRpdmVUaW1lVG9EYXRlKHZhbC4kcmVsYXRpdmVUaW1lKTtcbiAgICAgICAgICBpZiAocGFyc2VyUmVzdWx0LnN0YXR1cyA9PT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICBhbnN3ZXJba2V5XSA9IHBhcnNlclJlc3VsdC5yZXN1bHQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsb2cuaW5mbygnRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7a2V5fSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBhbnN3ZXJba2V5XSA9IHRyYW5zZm9ybWVyKHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlICckaW4nOlxuICAgICAgY2FzZSAnJG5pbic6IHtcbiAgICAgICAgY29uc3QgYXJyID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICcgKyBrZXkgKyAnIHZhbHVlJyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBfLmZsYXRNYXAoYXJyLCB2YWx1ZSA9PiB7XG4gICAgICAgICAgcmV0dXJuIChhdG9tID0+IHtcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGF0b20pKSB7XG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAodHJhbnNmb3JtZXIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVyKGF0b20pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pKHZhbHVlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGFsbCc6IHtcbiAgICAgICAgY29uc3QgYXJyID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICcgKyBrZXkgKyAnIHZhbHVlJyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBhcnIubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG5cbiAgICAgICAgY29uc3QgdmFsdWVzID0gYW5zd2VyW2tleV07XG4gICAgICAgIGlmIChpc0FueVZhbHVlUmVnZXgodmFsdWVzKSAmJiAhaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ0FsbCAkYWxsIHZhbHVlcyBtdXN0IGJlIG9mIHJlZ2V4IHR5cGUgb3Igbm9uZTogJyArIHZhbHVlc1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRyZWdleCc6XG4gICAgICAgIHZhciBzID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAodHlwZW9mIHMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCByZWdleDogJyArIHMpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gcztcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyRjb250YWluZWRCeSc6IHtcbiAgICAgICAgY29uc3QgYXJyID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YCk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyLiRlbGVtTWF0Y2ggPSB7XG4gICAgICAgICAgJG5pbjogYXJyLm1hcCh0cmFuc2Zvcm1lciksXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG9wdGlvbnMnOlxuICAgICAgICBhbnN3ZXJba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyR0ZXh0Jzoge1xuICAgICAgICBjb25zdCBzZWFyY2ggPSBjb25zdHJhaW50W2tleV0uJHNlYXJjaDtcbiAgICAgICAgaWYgKHR5cGVvZiBzZWFyY2ggIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHNlYXJjaCwgc2hvdWxkIGJlIG9iamVjdGApO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VhcmNoLiR0ZXJtIHx8IHR5cGVvZiBzZWFyY2guJHRlcm0gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHRlcm0sIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRzZWFyY2g6IHNlYXJjaC4kdGVybSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guJGxhbmd1YWdlICYmIHR5cGVvZiBzZWFyY2guJGxhbmd1YWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kbGFuZ3VhZ2UgPSBzZWFyY2guJGxhbmd1YWdlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGNhc2VTZW5zaXRpdmUgPSBzZWFyY2guJGNhc2VTZW5zaXRpdmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRkaWFjcml0aWNTZW5zaXRpdmUgPSBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRuZWFyU3BoZXJlJzoge1xuICAgICAgICBjb25zdCBwb2ludCA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgYW5zd2VyLiRnZW9XaXRoaW4gPSB7XG4gICAgICAgICAgICAkY2VudGVyU3BoZXJlOiBbW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLCBjb25zdHJhaW50LiRtYXhEaXN0YW5jZV0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZSc6IHtcbiAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgLy8gVGhlIFNES3MgZG9uJ3Qgc2VlbSB0byB1c2UgdGhlc2UgYnV0IHRoZXkgYXJlIGRvY3VtZW50ZWQgaW4gdGhlXG4gICAgICAvLyBSRVNUIEFQSSBkb2NzLlxuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5SYWRpYW5zJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJbk1pbGVzJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XSAvIDM5NTk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XSAvIDYzNzE7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckc2VsZWN0JzpcbiAgICAgIGNhc2UgJyRkb250U2VsZWN0JzpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgJ3RoZSAnICsga2V5ICsgJyBjb25zdHJhaW50IGlzIG5vdCBzdXBwb3J0ZWQgeWV0J1xuICAgICAgICApO1xuXG4gICAgICBjYXNlICckd2l0aGluJzpcbiAgICAgICAgdmFyIGJveCA9IGNvbnN0cmFpbnRba2V5XVsnJGJveCddO1xuICAgICAgICBpZiAoIWJveCB8fCBib3gubGVuZ3RoICE9IDIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnbWFsZm9ybWF0dGVkICR3aXRoaW4gYXJnJyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgJGJveDogW1xuICAgICAgICAgICAgW2JveFswXS5sb25naXR1ZGUsIGJveFswXS5sYXRpdHVkZV0sXG4gICAgICAgICAgICBbYm94WzFdLmxvbmdpdHVkZSwgYm94WzFdLmxhdGl0dWRlXSxcbiAgICAgICAgICBdLFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJGdlb1dpdGhpbic6IHtcbiAgICAgICAgY29uc3QgcG9seWdvbiA9IGNvbnN0cmFpbnRba2V5XVsnJHBvbHlnb24nXTtcbiAgICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gY29uc3RyYWludFtrZXldWyckY2VudGVyU3BoZXJlJ107XG4gICAgICAgIGlmIChwb2x5Z29uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsZXQgcG9pbnRzO1xuICAgICAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgICAgIH0gZWxzZSBpZiAocG9seWdvbiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwb2ludHMgPSBwb2ludHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHBvaW50O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRnZW9XaXRoaW4gdmFsdWUnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV07XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgICAkcG9seWdvbjogcG9pbnRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSBpZiAoY2VudGVyU3BoZXJlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRjZW50ZXJTcGhlcmU6IFtbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sIGRpc3RhbmNlXSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb0ludGVyc2VjdHMnOiB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gY29uc3RyYWludFtrZXldWyckcG9pbnQnXTtcbiAgICAgICAgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAkZ2VvbWV0cnk6IHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludCcsXG4gICAgICAgICAgICBjb29yZGluYXRlczogW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGtleS5tYXRjaCgvXlxcJCsvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgY29uc3RyYWludDogJyArIGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gVHJhbnNmb3JtcyBhbiB1cGRhdGUgb3BlcmF0b3IgZnJvbSBSRVNUIGZvcm1hdCB0byBtb25nbyBmb3JtYXQuXG4vLyBUbyBiZSB0cmFuc2Zvcm1lZCwgdGhlIGlucHV0IHNob3VsZCBoYXZlIGFuIF9fb3AgZmllbGQuXG4vLyBJZiBmbGF0dGVuIGlzIHRydWUsIHRoaXMgd2lsbCBmbGF0dGVuIG9wZXJhdG9ycyB0byB0aGVpciBzdGF0aWNcbi8vIGRhdGEgZm9ybWF0LiBGb3IgZXhhbXBsZSwgYW4gaW5jcmVtZW50IG9mIDIgd291bGQgc2ltcGx5IGJlY29tZSBhXG4vLyAyLlxuLy8gVGhlIG91dHB1dCBmb3IgYSBub24tZmxhdHRlbmVkIG9wZXJhdG9yIGlzIGEgaGFzaCB3aXRoIF9fb3AgYmVpbmdcbi8vIHRoZSBtb25nbyBvcCwgYW5kIGFyZyBiZWluZyB0aGUgYXJndW1lbnQuXG4vLyBUaGUgb3V0cHV0IGZvciBhIGZsYXR0ZW5lZCBvcGVyYXRvciBpcyBqdXN0IGEgdmFsdWUuXG4vLyBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGlzIHNob3VsZCBiZSBhIG5vLW9wLlxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcih7IF9fb3AsIGFtb3VudCwgb2JqZWN0cyB9LCBmbGF0dGVuKSB7XG4gIHN3aXRjaCAoX19vcCkge1xuICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyR1bnNldCcsIGFyZzogJycgfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICBpZiAodHlwZW9mIGFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2luY3JlbWVudGluZyBtdXN0IHByb3ZpZGUgYSBudW1iZXInKTtcbiAgICAgIH1cbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiBhbW91bnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJGluYycsIGFyZzogYW1vdW50IH07XG4gICAgICB9XG5cbiAgICBjYXNlICdTZXRPbkluc2VydCc6XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gYW1vdW50O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyRzZXRPbkluc2VydCcsIGFyZzogYW1vdW50IH07XG4gICAgICB9XG5cbiAgICBjYXNlICdBZGQnOlxuICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBpZiAoIShvYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICB9XG4gICAgICB2YXIgdG9BZGQgPSBvYmplY3RzLm1hcCh0cmFuc2Zvcm1JbnRlcmlvckF0b20pO1xuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIHRvQWRkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIG1vbmdvT3AgPSB7XG4gICAgICAgICAgQWRkOiAnJHB1c2gnLFxuICAgICAgICAgIEFkZFVuaXF1ZTogJyRhZGRUb1NldCcsXG4gICAgICAgIH1bX19vcF07XG4gICAgICAgIHJldHVybiB7IF9fb3A6IG1vbmdvT3AsIGFyZzogeyAkZWFjaDogdG9BZGQgfSB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgIGlmICghKG9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gcmVtb3ZlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgIH1cbiAgICAgIHZhciB0b1JlbW92ZSA9IG9iamVjdHMubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJHB1bGxBbGwnLCBhcmc6IHRvUmVtb3ZlIH07XG4gICAgICB9XG5cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICBgVGhlICR7X19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgKTtcbiAgfVxufVxuZnVuY3Rpb24gbWFwVmFsdWVzKG9iamVjdCwgaXRlcmF0b3IpIHtcbiAgY29uc3QgcmVzdWx0ID0ge307XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgIHJlc3VsdFtrZXldID0gaXRlcmF0b3Iob2JqZWN0W2tleV0pO1xuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuY29uc3QgbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0ID0gbW9uZ29PYmplY3QgPT4ge1xuICBzd2l0Y2ggKHR5cGVvZiBtb25nb09iamVjdCkge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgJ2JhZCB2YWx1ZSBpbiBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QnO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAobW9uZ29PYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QubWFwKG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIFBhcnNlLl9lbmNvZGUobW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkxvbmcpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnRvTnVtYmVyKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuRG91YmxlKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KG1vbmdvT2JqZWN0KSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTihtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG1vbmdvT2JqZWN0LCAnX190eXBlJykgJiZcbiAgICAgICAgbW9uZ29PYmplY3QuX190eXBlID09ICdEYXRlJyAmJlxuICAgICAgICBtb25nb09iamVjdC5pc28gaW5zdGFuY2VvZiBEYXRlXG4gICAgICApIHtcbiAgICAgICAgbW9uZ29PYmplY3QuaXNvID0gbW9uZ29PYmplY3QuaXNvLnRvSlNPTigpO1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3Q7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBtYXBWYWx1ZXMobW9uZ29PYmplY3QsIG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICd1bmtub3duIGpzIHR5cGUnO1xuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nID0gKHNjaGVtYSwgZmllbGQsIHBvaW50ZXJTdHJpbmcpID0+IHtcbiAgY29uc3Qgb2JqRGF0YSA9IHBvaW50ZXJTdHJpbmcuc3BsaXQoJyQnKTtcbiAgaWYgKG9iakRhdGFbMF0gIT09IHNjaGVtYS5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzKSB7XG4gICAgdGhyb3cgJ3BvaW50ZXIgdG8gaW5jb3JyZWN0IGNsYXNzTmFtZSc7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICBjbGFzc05hbWU6IG9iakRhdGFbMF0sXG4gICAgb2JqZWN0SWQ6IG9iakRhdGFbMV0sXG4gIH07XG59O1xuXG4vLyBDb252ZXJ0cyBmcm9tIGEgbW9uZ28tZm9ybWF0IG9iamVjdCB0byBhIFJFU1QtZm9ybWF0IG9iamVjdC5cbi8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG5jb25zdCBtb25nb09iamVjdFRvUGFyc2VPYmplY3QgPSAoY2xhc3NOYW1lLCBtb25nb09iamVjdCwgc2NoZW1hKSA9PiB7XG4gIHN3aXRjaCAodHlwZW9mIG1vbmdvT2JqZWN0KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gbW9uZ29PYmplY3Q7XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICB0aHJvdyAnYmFkIHZhbHVlIGluIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCc7XG4gICAgY2FzZSAnb2JqZWN0Jzoge1xuICAgICAgaWYgKG1vbmdvT2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0Lm1hcChuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHJldHVybiBQYXJzZS5fZW5jb2RlKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Mb25nKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC50b051bWJlcigpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkRvdWJsZSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudmFsdWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChCeXRlc0NvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdChtb25nb09iamVjdCkpIHtcbiAgICAgICAgcmV0dXJuIEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04obW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN0T2JqZWN0ID0ge307XG4gICAgICBpZiAobW9uZ29PYmplY3QuX3JwZXJtIHx8IG1vbmdvT2JqZWN0Ll93cGVybSkge1xuICAgICAgICByZXN0T2JqZWN0Ll9ycGVybSA9IG1vbmdvT2JqZWN0Ll9ycGVybSB8fCBbXTtcbiAgICAgICAgcmVzdE9iamVjdC5fd3Blcm0gPSBtb25nb09iamVjdC5fd3Blcm0gfHwgW107XG4gICAgICAgIGRlbGV0ZSBtb25nb09iamVjdC5fcnBlcm07XG4gICAgICAgIGRlbGV0ZSBtb25nb09iamVjdC5fd3Blcm07XG4gICAgICB9XG5cbiAgICAgIGZvciAodmFyIGtleSBpbiBtb25nb09iamVjdCkge1xuICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgIGNhc2UgJ19pZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydvYmplY3RJZCddID0gJycgKyBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2hhc2hlZF9wYXNzd29yZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQgPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2FjbCc6XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuJzpcbiAgICAgICAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbic6XG4gICAgICAgICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgICAgIGNhc2UgJ190b21ic3RvbmUnOlxuICAgICAgICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgICAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgICAgICBjYXNlICdfcGFzc3dvcmRfaGlzdG9yeSc6XG4gICAgICAgICAgICAvLyBUaG9zZSBrZXlzIHdpbGwgYmUgZGVsZXRlZCBpZiBuZWVkZWQgaW4gdGhlIERCIENvbnRyb2xsZXJcbiAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfc2Vzc2lvbl90b2tlbic6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydzZXNzaW9uVG9rZW4nXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICd1cGRhdGVkQXQnOlxuICAgICAgICAgIGNhc2UgJ191cGRhdGVkX2F0JzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ3VwZGF0ZWRBdCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSkuaXNvO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgICAgICBjYXNlICdfY3JlYXRlZF9hdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydjcmVhdGVkQXQnXSA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSkpLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICAgICAgY2FzZSAnX2V4cGlyZXNBdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydleHBpcmVzQXQnXSA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnbGFzdFVzZWQnOlxuICAgICAgICAgIGNhc2UgJ19sYXN0X3VzZWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnbGFzdFVzZWQnXSA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSkpLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICAgICAgY2FzZSAndGltZXNfdXNlZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Wyd0aW1lc1VzZWQnXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdhdXRoRGF0YSc6XG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgICAgIGxvZy53YXJuKFxuICAgICAgICAgICAgICAgICdpZ25vcmluZyBhdXRoRGF0YSBpbiBfVXNlciBhcyB0aGlzIGtleSBpcyByZXNlcnZlZCB0byBiZSBzeW50aGVzaXplZCBvZiBgX2F1dGhfZGF0YV8qYCBrZXlzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmVzdE9iamVjdFsnYXV0aERhdGEnXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gQ2hlY2sgb3RoZXIgYXV0aCBkYXRhIGtleXNcbiAgICAgICAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0ga2V5Lm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICAgICAgICBpZiAoYXV0aERhdGFNYXRjaCAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgICAgICAgcmVzdE9iamVjdFsnYXV0aERhdGEnXSA9IHJlc3RPYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChrZXkuaW5kZXhPZignX3BfJykgPT0gMCkge1xuICAgICAgICAgICAgICB2YXIgbmV3S2V5ID0ga2V5LnN1YnN0cmluZygzKTtcbiAgICAgICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW25ld0tleV0pIHtcbiAgICAgICAgICAgICAgICBsb2cuaW5mbyhcbiAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0uanMnLFxuICAgICAgICAgICAgICAgICAgJ0ZvdW5kIGEgcG9pbnRlciBjb2x1bW4gbm90IGluIHRoZSBzY2hlbWEsIGRyb3BwaW5nIGl0LicsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBuZXdLZXlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW25ld0tleV0udHlwZSAhPT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgICAgICAgbG9nLmluZm8oXG4gICAgICAgICAgICAgICAgICAndHJhbnNmb3JtLmpzJyxcbiAgICAgICAgICAgICAgICAgICdGb3VuZCBhIHBvaW50ZXIgaW4gYSBub24tcG9pbnRlciBjb2x1bW4sIGRyb3BwaW5nIGl0LicsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBrZXlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChtb25nb09iamVjdFtrZXldID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmVzdE9iamVjdFtuZXdLZXldID0gdHJhbnNmb3JtUG9pbnRlclN0cmluZyhzY2hlbWEsIG5ld0tleSwgbW9uZ29PYmplY3Rba2V5XSk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlbMF0gPT0gJ18nICYmIGtleSAhPSAnX190eXBlJykge1xuICAgICAgICAgICAgICAvLyBVbnJlY29nbml6ZWQgcmVzZXJ2ZWQga2V5OiBkcm9wIGl0IGluc3RlYWQgb2YgZmFpbGluZyB0aGUgcmVhZFxuICAgICAgICAgICAgICBsb2cud2FybigndHJhbnNmb3JtLmpzJywgJ0ZvdW5kIGFuIHVuZXhwZWN0ZWQgcmVzZXJ2ZWQga2V5LCBkcm9wcGluZyBpdC4nLCBjbGFzc05hbWUsIGtleSk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmFyIHZhbHVlID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnRmlsZScgJiZcbiAgICAgICAgICAgICAgICBGaWxlQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBGaWxlQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50JyAmJlxuICAgICAgICAgICAgICAgIEdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBHZW9Qb2ludENvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2x5Z29uJyAmJlxuICAgICAgICAgICAgICAgIFBvbHlnb25Db2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IFBvbHlnb25Db2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICAgICAgICAgICAgQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QobW9uZ29PYmplY3Rba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICk7XG4gICAgICBjb25zdCByZWxhdGlvbkZpZWxkcyA9IHt9O1xuICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLmZvckVhY2gocmVsYXRpb25GaWVsZE5hbWUgPT4ge1xuICAgICAgICByZWxhdGlvbkZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgLi4ucmVzdE9iamVjdCwgLi4ucmVsYXRpb25GaWVsZHMgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICd1bmtub3duIGpzIHR5cGUnO1xuICB9XG59O1xuXG52YXIgRGF0ZUNvZGVyID0ge1xuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKGpzb24uaXNvKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnO1xuICB9LFxufTtcblxudmFyIEJ5dGVzQ29kZXIgPSB7XG4gIGJhc2U2NFBhdHRlcm46IG5ldyBSZWdFeHAoJ14oPzpbQS1aYS16MC05Ky9dezR9KSooPzpbQS1aYS16MC05Ky9dezJ9PT18W0EtWmEtejAtOSsvXXszfT0pPyQnKSxcbiAgaXNCYXNlNjRWYWx1ZShvYmplY3QpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYmFzZTY0UGF0dGVybi50ZXN0KG9iamVjdCk7XG4gIH0sXG5cbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgbGV0IHZhbHVlO1xuICAgIGlmICh0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KSkge1xuICAgICAgdmFsdWUgPSBvYmplY3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlID0gb2JqZWN0LmJ1ZmZlci50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkJpbmFyeSB8fCB0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KTtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBtb25nb2RiLkJpbmFyeShCdWZmZXIuZnJvbShqc29uLmJhc2U2NCwgJ2Jhc2U2NCcpKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJztcbiAgfSxcbn07XG5cbnZhciBHZW9Qb2ludENvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgbGF0aXR1ZGU6IG9iamVjdFsxXSxcbiAgICAgIGxvbmdpdHVkZTogb2JqZWN0WzBdLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBBcnJheSAmJiBvYmplY3QubGVuZ3RoID09IDI7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBbanNvbi5sb25naXR1ZGUsIGpzb24ubGF0aXR1ZGVdO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxudmFyIFBvbHlnb25Db2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgLy8gQ29udmVydCBsbmcvbGF0IC0+IGxhdC9sbmdcbiAgICBjb25zdCBjb29yZHMgPSBvYmplY3QuY29vcmRpbmF0ZXNbMF0ubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICBjb29yZGluYXRlczogY29vcmRzLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIGNvbnN0IGNvb3JkcyA9IG9iamVjdC5jb29yZGluYXRlc1swXTtcbiAgICBpZiAob2JqZWN0LnR5cGUgIT09ICdQb2x5Z29uJyB8fCAhKGNvb3JkcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcG9pbnQgPSBjb29yZHNbaV07XG4gICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHBvaW50KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocGFyc2VGbG9hdChwb2ludFsxXSksIHBhcnNlRmxvYXQocG9pbnRbMF0pKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIGxldCBjb29yZHMgPSBqc29uLmNvb3JkaW5hdGVzO1xuICAgIC8vIEFkZCBmaXJzdCBwb2ludCB0byB0aGUgZW5kIHRvIGNsb3NlIHBvbHlnb25cbiAgICBpZiAoXG4gICAgICBjb29yZHNbMF1bMF0gIT09IGNvb3Jkc1tjb29yZHMubGVuZ3RoIC0gMV1bMF0gfHxcbiAgICAgIGNvb3Jkc1swXVsxXSAhPT0gY29vcmRzW2Nvb3Jkcy5sZW5ndGggLSAxXVsxXVxuICAgICkge1xuICAgICAgY29vcmRzLnB1c2goY29vcmRzWzBdKTtcbiAgICB9XG4gICAgY29uc3QgdW5pcXVlID0gY29vcmRzLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgICBsZXQgZm91bmRJbmRleCA9IC0xO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgICBpZiAocHRbMF0gPT09IGl0ZW1bMF0gJiYgcHRbMV0gPT09IGl0ZW1bMV0pIHtcbiAgICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICAgIH0pO1xuICAgIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIENvbnZlcnQgbGF0L2xvbmcgLT4gbG9uZy9sYXRcbiAgICBjb29yZHMgPSBjb29yZHMubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4geyB0eXBlOiAnUG9seWdvbicsIGNvb3JkaW5hdGVzOiBbY29vcmRzXSB9O1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnUG9seWdvbic7XG4gIH0sXG59O1xuXG52YXIgRmlsZUNvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiBvYmplY3QsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdzdHJpbmcnO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4ganNvbi5uYW1lO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnRmlsZSc7XG4gIH0sXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdHJhbnNmb3JtS2V5LFxuICBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUsXG4gIHRyYW5zZm9ybVVwZGF0ZSxcbiAgdHJhbnNmb3JtV2hlcmUsXG4gIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCxcbiAgdHJhbnNmb3JtQ29uc3RyYWludCxcbiAgdHJhbnNmb3JtUG9pbnRlclN0cmluZyxcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBQUEsT0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQXVCLFNBQUFELHVCQUFBRyxDQUFBLFdBQUFBLENBQUEsSUFBQUEs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