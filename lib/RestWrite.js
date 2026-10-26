"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _lodash = _interopRequireDefault(require("lodash"));
var _logger = _interopRequireDefault(require("./logger"));
var _AuthDataLock = require("./AuthDataLock");
var _SchemaController = require("./Controllers/SchemaController");
var _Error = require("./Error");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".

var SchemaController = require('./Controllers/SchemaController');
const Auth = require('./Auth');
const Utils = require('./Utils');
var cryptoUtils = require('./cryptoUtils');
var passwordCrypto = require('./password');
var Parse = require('parse/node');
var triggers = require('./triggers');
const util = require('util');
// Operations whose result the database computes from the stored value
const computedOperations = ['Increment', 'Add', 'AddUnique', 'Remove'];

// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.
function RestWrite(config, auth, className, query, data, originalData, context, action) {
  if (auth.isReadOnly) {
    throw (0, _Error.createSanitizedError)(Parse.Error.OPERATION_FORBIDDEN, 'Cannot perform a write operation when using readOnlyMasterKey', config);
  }
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.storage = {};
  this.runOptions = {};
  this.context = context || {};
  if (action) {
    this.runOptions.action = action;
  }
  if (!query) {
    if (this.config.allowCustomObjectId) {
      if (Object.prototype.hasOwnProperty.call(data, 'objectId') && !data.objectId) {
        throw new Parse.Error(Parse.Error.MISSING_OBJECT_ID, 'objectId must not be empty, null or undefined');
      }
    } else {
      if (data.objectId) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId is an invalid field name.');
      }
      if (data.id) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'id is an invalid field name.');
      }
    }
  }

  // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header
  this.response = null;

  // Processing this operation may mutate our data, so we operate on a
  // copy
  this.query = structuredClone(query);
  this.data = structuredClone(data);
  // The client's dot notation keys and computed operations, before triggers change the data
  this.requestOperations = Object.keys(this.data).filter(key => key.includes('.') || computedOperations.includes(this.data[key]?.__op)).map(key => [key, this.data[key]]);
  // We never change originalData, so we do not need a deep copy
  this.originalData = originalData;

  // The timestamp we'll use for this whole operation
  this.updatedAt = Parse._encode(new Date()).iso;

  // Shared SchemaController to be reused to reduce the number of loadSchema() calls per request
  // Once set the schemaData should be immutable
  this.validSchemaController = null;
  this.pendingOps = {
    operations: null,
    identifier: null
  };
}

// A convenient method to perform all the steps of processing the
// write, in order.
// Returns a promise for a {response, status, location} object.
// status and location are optional.
RestWrite.prototype.execute = function () {
  return Promise.resolve().then(() => {
    return this.checkInternalFields();
  }).then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.handleInstallation();
  }).then(() => {
    return this.handleSession();
  }).then(() => {
    return this.authorizeUserUpdate();
  }).then(() => {
    return this.validateAuthData();
  }).then(() => {
    return this.checkRestrictedFields();
  }).then(() => {
    return this.resolveFileUrls();
  }).then(() => {
    return this.validateDotNotationKeys();
  }).then(() => {
    return this.runBeforeSaveTrigger();
  }).then(() => {
    return this.ensureUniqueAuthDataId();
  }).then(() => {
    return this.deleteEmailResetTokenIfNeeded();
  }).then(() => {
    return this.validateSchema();
  }).then(schemaController => {
    this.validSchemaController = schemaController;
    return this.setRequiredFieldsIfNeeded();
  }).then(() => {
    return this.transformUser();
  }).then(() => {
    return this.expandFilesForExistingObjects();
  }).then(() => {
    return this.destroyDuplicatedSessions();
  }).then(() => {
    return this.runDatabaseOperation();
  }).then(() => {
    return this.createSessionTokenIfNeeded();
  }).then(() => {
    return this.handleFollowup();
  }).then(() => {
    return this.runAfterSaveTrigger();
  }).then(() => {
    return this.cleanUserAuthData();
  }).then(() => {
    return this.filterUnreadableFieldsInResponse();
  }).then(() => {
    // Append the authDataResponse if exists
    if (this.authDataResponse) {
      if (this.response && this.response.response) {
        this.response.response.authDataResponse = this.authDataResponse;
      }
    }
    if (this.storage.rejectSignup && this.config.preventSignupWithUnverifiedEmail) {
      throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
    }
    return this.response;
  });
};

// Uses the Auth object to get the list of roles, adds the user id
RestWrite.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return Promise.resolve();
  }
  this.runOptions.acl = ['*'];
  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.runOptions.acl = this.runOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the allowClientClassCreation config.
RestWrite.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && !this.auth.isMaintenance && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw (0, _Error.createSanitizedError)(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access non-existent class: ' + this.className, this.config);
      }
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the schema.
RestWrite.prototype.validateSchema = function () {
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions, this.auth.isMaintenance);
};

// Resolves the URLs of file pointers in the data that have no URL, so that the
// Parse objects built for triggers and LiveQuery can be encoded.
RestWrite.prototype.resolveFileUrls = async function () {
  const files = Object.create(null);
  const collect = value => {
    if (!value || typeof value !== 'object') {
      return;
    }
    if (value.__type === 'File') {
      if (typeof value.name !== 'string' || value.name === '') {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, 'This is not a valid File');
      }
      if (!value.url) {
        files[value.name] = {
          __type: 'File',
          name: value.name
        };
      }
      return;
    }
    Object.values(value).forEach(collect);
  };
  collect(this.data);
  if (Object.keys(files).length === 0) {
    return;
  }
  await this.config.filesController.expandFilesInObject(this.config, files);
  this.fileUrls = Object.assign(this.fileUrls || Object.create(null), files);
};

// Returns a copy of the data with the resolved URLs added to file pointers.
RestWrite.prototype.cloneWithFileUrls = function (object) {
  const data = structuredClone(object);
  if (!this.fileUrls) {
    return data;
  }
  const addUrls = value => {
    if (!value || typeof value !== 'object') {
      return;
    }
    if (value.__type === 'File') {
      const file = typeof value.name === 'string' && this.fileUrls[value.name];
      if (!value.url && file) {
        value.url = file.url;
      }
      return;
    }
    Object.values(value).forEach(addUrls);
  };
  addUrls(data);
  return data;
};

// Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.
RestWrite.prototype.runBeforeSaveTrigger = function () {
  if (this.response || this.runOptions.many) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.
  if (!triggers.triggerExists(this.className, triggers.Types.beforeSave, this.config.applicationId)) {
    return Promise.resolve();
  }
  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  const identifier = updatedObject._getStateIdentifier();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(identifier);
  this.pendingOps = {
    operations: {
      ...pending
    },
    identifier
  };
  return Promise.resolve().then(() => {
    // Before calling the trigger, validate the permissions for the save operation
    let databasePromise = null;
    if (this.query) {
      // Validate for updating
      databasePromise = this.config.database.update(this.className, this.query, this.data, this.runOptions, true, true);
    } else {
      // Validate for creating
      databasePromise = this.config.database.create(this.className, this.data, this.runOptions, true);
    }
    // In the case that there is no permission for the operation, it throws an error
    return databasePromise.then(result => {
      if (!result || result.length <= 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
    });
  }).then(() => {
    return triggers.maybeRunTrigger(triggers.Types.beforeSave, this.auth, updatedObject, originalObject, this.config, this.context);
  }).then(response => {
    if (response && response.object) {
      this.storage.fieldsChangedByTrigger = _lodash.default.reduce(response.object, (result, value, key) => {
        if (!_lodash.default.isEqual(this.data[key], value)) {
          result.push(key);
        }
        return result;
      }, []);
      this.data = response.object;
      // We should delete the objectId for an update write
      if (this.query && this.query.objectId) {
        delete this.data.objectId;
      }
    }
    try {
      Utils.checkProhibitedKeywords(this.config, this.data);
    } catch (error) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, error);
    }
    this.validateDotNotationKeys();
    if (response && response.object) {
      // The trigger may have set file pointers without URL
      return this.resolveFileUrls();
    }
  });
};
RestWrite.prototype.runBeforeLoginTrigger = async function (userData) {
  // Avoid doing any setup for triggers if there is no 'beforeLogin' trigger
  if (!triggers.triggerExists(this.className, triggers.Types.beforeLogin, this.config.applicationId)) {
    return;
  }

  // Cloud code gets a bit of extra data for its objects
  const extraData = {
    className: this.className
  };

  // Expand file objects
  await this.config.filesController.expandFilesInObject(this.config, userData);
  const user = triggers.inflate(extraData, userData);

  // no need to return a response
  await triggers.maybeRunTrigger(triggers.Types.beforeLogin, this.auth, user, null, this.config, this.context);
};
RestWrite.prototype.setRequiredFieldsIfNeeded = function () {
  if (this.data) {
    return this.validSchemaController.getAllClasses().then(allClasses => {
      const schema = allClasses.find(oneClass => oneClass.className === this.className);
      const setRequiredFieldIfNeeded = (fieldName, setDefault) => {
        if (this.data[fieldName] === undefined || this.data[fieldName] === null || this.data[fieldName] === '' || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete') {
          if (setDefault && schema.fields[fieldName] && schema.fields[fieldName].defaultValue !== null && schema.fields[fieldName].defaultValue !== undefined && (this.data[fieldName] === undefined || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete')) {
            this.data[fieldName] = schema.fields[fieldName].defaultValue;
            this.storage.fieldsChangedByTrigger = this.storage.fieldsChangedByTrigger || [];
            if (this.storage.fieldsChangedByTrigger.indexOf(fieldName) < 0) {
              this.storage.fieldsChangedByTrigger.push(fieldName);
            }
          } else if (schema.fields[fieldName] && schema.fields[fieldName].required === true) {
            throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} is required`);
          }
        }
      };

      // add default ACL
      if (schema?.classLevelPermissions?.ACL && !this.data.ACL && JSON.stringify(schema.classLevelPermissions.ACL) !== JSON.stringify({
        '*': {
          read: true,
          write: true
        }
      })) {
        const acl = structuredClone(schema.classLevelPermissions.ACL);
        if (acl.currentUser) {
          if (this.auth.user?.id) {
            acl[this.auth.user?.id] = structuredClone(acl.currentUser);
          }
          delete acl.currentUser;
        }
        this.data.ACL = acl;
        this.storage.fieldsChangedByTrigger = this.storage.fieldsChangedByTrigger || [];
        this.storage.fieldsChangedByTrigger.push('ACL');
      }

      // Add default fields
      if (!this.query) {
        // allow customizing createdAt and updatedAt when using maintenance key
        if (this.auth.isMaintenance && this.data.createdAt && this.data.createdAt.__type === 'Date') {
          this.data.createdAt = this.data.createdAt.iso;
          if (this.data.updatedAt && this.data.updatedAt.__type === 'Date') {
            const createdAt = new Date(this.data.createdAt);
            const updatedAt = new Date(this.data.updatedAt.iso);
            if (updatedAt < createdAt) {
              throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'updatedAt cannot occur before createdAt');
            }
            this.data.updatedAt = this.data.updatedAt.iso;
          }
          // if no updatedAt is provided, set it to createdAt to match default behavior
          else {
            this.data.updatedAt = this.data.createdAt;
          }
        } else {
          this.data.updatedAt = this.updatedAt;
          this.data.createdAt = this.updatedAt;
        }

        // Only assign new objectId if we are creating new object
        if (!this.data.objectId) {
          this.data.objectId = cryptoUtils.newObjectId(this.config.objectIdSize);
        }
        if (schema) {
          Object.keys(schema.fields).forEach(fieldName => {
            setRequiredFieldIfNeeded(fieldName, true);
          });
        }
      } else if (schema) {
        this.data.updatedAt = this.updatedAt;
        Object.keys(this.data).forEach(fieldName => {
          setRequiredFieldIfNeeded(fieldName, false);
        });
      }
    });
  }
  return Promise.resolve();
};

// Transforms auth data for a user object.
// Does nothing if this isn't a user object.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.validateAuthData = function () {
  if (this.className !== '_User') {
    return;
  }
  const authData = this.data.authData;
  const hasUsernameAndPassword = typeof this.data.username === 'string' && typeof this.data.password === 'string';
  const hasAuthData = authData && Object.keys(authData).some(provider => {
    const providerData = authData[provider];
    return providerData && typeof providerData === 'object' && Object.keys(providerData).length;
  });
  if (!this.query && !hasAuthData) {
    if (typeof this.data.username !== 'string' || _lodash.default.isEmpty(this.data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }
    if (typeof this.data.password !== 'string' || _lodash.default.isEmpty(this.data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }
  if (!Object.prototype.hasOwnProperty.call(this.data, 'authData')) {
    // Nothing to validate here
    return;
  } else if (!this.data.authData) {
    // Handle saving authData to null
    throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
  }
  var providers = Object.keys(authData);
  if (!providers.length) {
    // Empty authData object, nothing to validate
    return;
  }
  const canHandleAuthData = providers.some(provider => {
    const providerAuthData = authData[provider] || {};
    return !!Object.keys(providerAuthData).length;
  });
  if (canHandleAuthData || hasUsernameAndPassword || this.auth.isMaster || this.getUserId()) {
    return this.handleAuthData(authData);
  }
  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
};
RestWrite.prototype.filteredObjectsByACL = function (objects) {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return objects;
  }
  return objects.filter(object => {
    if (!object.ACL) {
      return true; // legacy users that have no ACL field on them
    }
    // Regular users that have been locked out.
    return object.ACL && Object.keys(object.ACL).length > 0;
  });
};
RestWrite.prototype.getUserId = function () {
  if (this.query && this.query.objectId && this.className === '_User') {
    return this.query.objectId;
  } else if (this.auth && this.auth.user && this.auth.user.id) {
    return this.auth.user.id;
  }
};
RestWrite.prototype._throwIfAuthDataDuplicate = function (error) {
  if (this.className === '_User' && error?.code === Parse.Error.DUPLICATE_VALUE && error.userInfo?.duplicated_field?.startsWith('_auth_data_')) {
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }
};

// Developers are allowed to change authData via before save trigger
// we need after before save to ensure that the developer
// is not currently duplicating auth data ID
RestWrite.prototype.ensureUniqueAuthDataId = async function () {
  if (this.className !== '_User' || !this.data.authData) {
    return;
  }
  const hasAuthDataId = Object.keys(this.data.authData).some(key => this.data.authData[key] && this.data.authData[key].id);
  if (!hasAuthDataId) {
    return;
  }
  const r = await Auth.findUsersWithAuthData(this.config, this.data.authData);
  const results = this.filteredObjectsByACL(r);
  if (results.length > 1) {
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }
  // use data.objectId in case of login time and found user during handle validateAuthData
  const userId = this.getUserId() || this.data.objectId;
  if (results.length === 1 && userId !== results[0].objectId) {
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }
};
RestWrite.prototype.handleAuthData = async function (authData) {
  const r = await Auth.findUsersWithAuthData(this.config, authData, true);
  const results = this.filteredObjectsByACL(r);
  const userId = this.getUserId();
  const userResult = results[0];
  const foundUserIsNotCurrentUser = userId && userResult && userId !== userResult.objectId;
  if (results.length > 1 || foundUserIsNotCurrentUser) {
    // To avoid https://github.com/parse-community/parse-server/security/advisories/GHSA-8w3j-g983-8jh5
    // Let's run some validation before throwing
    await Auth.handleAuthDataValidation(authData, this, userResult);
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }

  // No user found with provided authData we need to validate
  if (!results.length) {
    const {
      authData: validatedAuthData,
      authDataResponse
    } = await Auth.handleAuthDataValidation(authData, this);
    this.authDataResponse = authDataResponse;
    // Replace current authData by the new validated one
    this.data.authData = validatedAuthData;
    return;
  }

  // User found with provided authData
  if (results.length === 1) {
    this.storage.authProvider = Object.keys(authData).join(',');
    const {
      hasMutatedAuthData,
      mutatedAuthData
    } = Auth.hasMutatedAuthData(authData, userResult.authData);
    const isCurrentUserLoggedOrMaster = this.auth && this.auth.user && this.auth.user.id === userResult.objectId || this.auth.isMaster;
    const isLogin = !userId;
    if (isLogin || isCurrentUserLoggedOrMaster) {
      // no user making the call
      // OR the user making the call is the right one
      // Login with auth data
      delete results[0].password;

      // need to set the objectId first otherwise location has trailing undefined
      this.data.objectId = userResult.objectId;
      if (!this.query || !this.query.objectId) {
        this.response = {
          response: userResult,
          location: this.location()
        };
        // Run beforeLogin hook before storing any updates
        // to authData on the db; changes to userResult
        // will be ignored.
        await this.runBeforeLoginTrigger(structuredClone(userResult));

        // If we are in login operation via authData
        // we need to be sure that the user has provided
        // required authData
        Auth.checkIfUserHasProvidedConfiguredProvidersForLogin({
          config: this.config,
          auth: this.auth
        }, authData, userResult.authData, this.config);
      }

      // Prevent validating if no mutated data detected on update
      if (!hasMutatedAuthData && isCurrentUserLoggedOrMaster) {
        return;
      }

      // Always validate all provided authData on login to prevent authentication
      // bypass via partial authData (e.g. sending only the provider ID without
      // an access token); on update only validate mutated ones
      if (isLogin || hasMutatedAuthData || !this.config.allowExpiredAuthDataToken) {
        const res = await Auth.handleAuthDataValidation(isLogin ? authData : mutatedAuthData, this, userResult);
        this.data.authData = res.authData;
        this.authDataResponse = res.authDataResponse;
      }

      // Capture original authData before mutating userResult via the response reference
      const originalAuthData = userResult?.authData ? Object.fromEntries(Object.entries(userResult.authData).map(([k, v]) => [k, v && typeof v === 'object' ? {
        ...v
      } : v])) : undefined;

      // IF we are in login we'll skip the database operation / beforeSave / afterSave etc...
      // we need to set it up there.
      // We are supposed to have a response only on LOGIN with authData, so we skip those
      // If we're not logging in, but just updating the current user, we can safely skip that part
      if (this.response) {
        // Assign the new authData in the response
        Object.keys(mutatedAuthData).forEach(provider => {
          this.response.response.authData[provider] = mutatedAuthData[provider];
        });

        // Run the DB update directly, as 'master' only if authData contains some keys
        // authData could not contains keys after validation if the authAdapter
        // uses the `doNotSave` option. Just update the authData part
        // Then we're good for the user, early exit of sorts
        if (Object.keys(this.data.authData).length) {
          const query = {
            objectId: this.data.objectId
          };
          // Optimistic locking: include each changed original field in the WHERE clause
          // for providers whose data is being updated. This prevents concurrent requests
          // from both succeeding when consuming single-use tokens (e.g. MFA recovery codes
          // as arrays, or MFA SMS OTP tokens as strings).
          (0, _AuthDataLock.applyAuthDataOptimisticLock)(query, originalAuthData, this.data.authData);
          try {
            await this.config.database.update(this.className, query, {
              authData: this.data.authData
            }, {});
          } catch (error) {
            if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
              throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid auth data');
            }
            this._throwIfAuthDataDuplicate(error);
            throw error;
          }
        }
      } else if (this.query && this.data.authData && Object.keys(this.data.authData).length) {
        // UPDATE path (e.g. PUT /users/:id during linked-provider re-auth): apply
        // the same optimistic lock to the subsequent runDatabaseOperation update so
        // concurrent single-use token consumers cannot both succeed.
        (0, _AuthDataLock.applyAuthDataOptimisticLock)(this.query, originalAuthData, this.data.authData);
      }
    }
  }
};

// Rejects internal fields in client-supplied data
RestWrite.prototype.checkInternalFields = function () {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return;
  }
  for (const fieldName in this.data) {
    if (fieldName.charAt(0) === '_') {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    }
  }
};
RestWrite.prototype.checkRestrictedFields = async function () {
  if (this.className !== '_User') {
    return;
  }
  if (!this.auth.isMaintenance && !this.auth.isMaster && 'emailVerified' in this.data) {
    throw (0, _Error.createSanitizedError)(Parse.Error.OPERATION_FORBIDDEN, "Clients aren't allowed to manually update email verification.", this.config);
  }
};

// Validates the create or update class-level permission before schema validation
RestWrite.prototype.validateWritePermission = async function () {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return;
  }
  const schemaController = await this.config.database.loadSchema();
  await schemaController.validatePermission(this.className, this.runOptions.acl || [], this.query ? 'update' : 'create');
};

// Authorize a _User update before any step reads the target account
RestWrite.prototype.authorizeUserUpdate = async function () {
  if (this.className !== '_User' || !this.query) {
    return;
  }
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return;
  }
  if (this.auth.isUnauthenticated()) {
    throw (0, _Error.createSanitizedError)(Parse.Error.SESSION_MISSING, `Cannot modify user ${this.query.objectId}.`, this.config);
  }
  // Body objectId must not retarget the update
  if (this.data.objectId !== undefined && this.data.objectId !== this.query.objectId) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
  }
  // Owner update reads only own data; the write stays ACL-checked
  if (this.auth.user.id === this.query.objectId) {
    return;
  }
  // Write access check via the write-path ACL enforcement
  await this.config.database.update(this.className, {
    objectId: this.query.objectId
  }, {}, this.runOptions, false, true);
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = async function () {
  var promise = Promise.resolve();
  if (this.className !== '_User') {
    return promise;
  }

  // Do not cleanup session if objectId is not set
  if (this.query && this.objectId()) {
    // If we're updating a _User object, we need to clear out the cache for that user. Find all their
    // session tokens, and remove them from the cache.
    const query = await (0, _RestQuery.default)({
      method: _RestQuery.default.Method.find,
      config: this.config,
      auth: Auth.master(this.config),
      className: '_Session',
      runBeforeFind: false,
      restWhere: {
        user: {
          __type: 'Pointer',
          className: '_User',
          objectId: this.objectId()
        }
      }
    });
    promise = query.execute().then(results => {
      results.results.forEach(session => this.config.cacheController.user.del(session.sessionToken));
    });
  }
  return promise.then(() => {
    // Transform the password
    if (this.data.password === undefined) {
      // ignore only if undefined. should proceed if empty ('')
      return Promise.resolve();
    }
    if (this.query) {
      this.storage['clearSessions'] = true;
      // Generate a new session only if the user requested
      if (!this.auth.isMaster && !this.auth.isMaintenance) {
        this.storage['generateNewSession'] = true;
      }
    }
    return this._validatePasswordPolicy().then(() => {
      return passwordCrypto.hash(this.data.password).then(hashedPassword => {
        this.data._hashed_password = hashedPassword;
        delete this.data.password;
      });
    });
  }).then(() => {
    return this._validateUserName();
  }).then(() => {
    return this._validateEmail();
  });
};
RestWrite.prototype._validateUserName = function () {
  // Check for username uniqueness
  if (!this.data.username) {
    if (!this.query) {
      this.data.username = cryptoUtils.randomString(25);
      this.responseShouldHaveUsername = true;
    }
    return Promise.resolve();
  }
  /*
    Usernames should be unique when compared case insensitively
     Users should be able to make case sensitive usernames and
    login using the case they entered.  I.e. 'Snoopy' should preclude
    'snoopy' as a valid username.
  */
  return this.config.database.find(this.className, {
    username: this.data.username,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
    }
    return;
  });
};

/*
  As with usernames, Parse should not allow case insensitive collisions of email.
  unlike with usernames (which can have case insensitive collisions in the case of
  auth adapters), emails should never have a case insensitive collision.

  This behavior can be enforced through a properly configured index see:
  https://docs.mongodb.com/manual/core/index-case-insensitive/#create-a-case-insensitive-index
  which could be implemented instead of this code based validation.

  Given that this lookup should be a relatively low use case and that the case sensitive
  unique index will be used by the db for the query, this is an adequate solution.
*/
RestWrite.prototype._validateEmail = function () {
  if (!this.data.email || this.data.email.__op === 'Delete') {
    return Promise.resolve();
  }
  // Validate basic email address format in linear time
  if (!this.data.email.match(/^.[^@\n\r\u2028\u2029]*@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  }
  // Case insensitive match, see note above function.
  return this.config.database.find(this.className, {
    email: this.data.email,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
    }
    if (!this.data.authData || !Object.keys(this.data.authData).length || Object.keys(this.data.authData).length === 1 && Object.keys(this.data.authData)[0] === 'anonymous') {
      // We updated the email, send a new validation
      const {
        originalObject,
        updatedObject
      } = this.buildParseObjects();
      const request = {
        original: originalObject,
        object: updatedObject,
        master: this.auth.isMaster,
        ip: this.config.ip,
        installationId: this.auth.installationId
      };
      return this.config.userController.setEmailVerifyToken(this.data, request, this.storage);
    }
  });
};
RestWrite.prototype._validatePasswordPolicy = function () {
  if (!this.config.passwordPolicy) {
    return Promise.resolve();
  }
  return this._validatePasswordRequirements().then(() => {
    return this._validatePasswordHistory();
  });
};
RestWrite.prototype._validatePasswordRequirements = function () {
  // check if the password conforms to the defined password policy if configured
  // If we specified a custom error in our configuration use it.
  // Example: "Passwords must include a Capital Letter, Lowercase Letter, and a number."
  //
  // This is especially useful on the generic "password reset" page,
  // as it allows the programmer to communicate specific requirements instead of:
  // a. making the user guess whats wrong
  // b. making a custom password reset page that shows the requirements
  const policyError = this.config.passwordPolicy.validationError ? this.config.passwordPolicy.validationError : 'Password does not meet the Password Policy requirements.';
  const containsUsernameError = 'Password cannot contain your username.';

  // check whether the password meets the password strength requirements
  if (this.config.passwordPolicy.patternValidator && !this.config.passwordPolicy.patternValidator(this.data.password) || this.config.passwordPolicy.validatorCallback && !this.config.passwordPolicy.validatorCallback(this.data.password)) {
    return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
  }

  // check whether password contain username
  if (this.config.passwordPolicy.doNotAllowUsername === true) {
    if (this.data.username) {
      // username is not passed during password reset
      if (this.data.password.indexOf(this.data.username) >= 0) {
        return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
      }
    } else if (this.query) {
      // retrieve the User object using the URL object ID during password reset
      return this.config.database.find('_User', {
        objectId: this.query.objectId
      }).then(results => {
        if (results.length != 1) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }
        if (this.data.password.indexOf(results[0].username) >= 0) {
          return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
        }
        return Promise.resolve();
      });
    }
  }
  return Promise.resolve();
};
RestWrite.prototype._validatePasswordHistory = function () {
  // check whether password is repeating from specified history
  if (this.query && this.config.passwordPolicy.maxPasswordHistory) {
    return this.config.database.find('_User', {
      objectId: this.query.objectId
    }, {
      keys: ['_password_history', '_hashed_password']
    }, Auth.maintenance(this.config)).then(results => {
      if (results.length != 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
      const user = results[0];
      let oldPasswords = [];
      if (user._password_history) {
        oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory - 1);
      }
      oldPasswords.push(user.password);
      const newPassword = this.data.password;
      // compare the new password hash with all old password hashes
      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result)
            // reject if there is a match
            {
              return Promise.reject('REPEAT_PASSWORD');
            }
          return Promise.resolve();
        });
      });
      // wait for all comparisons to complete
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD')
          // a match was found
          {
            return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, `New password should not be the same as last ${this.config.passwordPolicy.maxPasswordHistory} passwords.`));
          }
        throw err;
      });
    });
  }
  return Promise.resolve();
};
RestWrite.prototype.createSessionTokenIfNeeded = async function () {
  if (this.className !== '_User') {
    return;
  }
  // Don't generate session for updating user (this.query is set) unless authData exists
  if (this.query && !this.data.authData) {
    return;
  }
  // Don't generate new sessionToken if linking via sessionToken
  if (this.auth.user && this.data.authData) {
    return;
  }
  // If sign-up call
  if (!this.storage.authProvider) {
    // Create request object for verification functions
    const {
      originalObject,
      updatedObject
    } = this.buildParseObjects();
    const request = {
      original: originalObject,
      object: updatedObject,
      master: this.auth.isMaster,
      ip: this.config.ip,
      installationId: this.auth.installationId
    };
    // Get verification conditions which can be booleans or functions; the purpose of this async/await
    // structure is to avoid unnecessarily executing subsequent functions if previous ones fail in the
    // conditional statement below, as a developer may decide to execute expensive operations in them
    const verifyUserEmails = async () => this.config.verifyUserEmails === true || typeof this.config.verifyUserEmails === 'function' && (await Promise.resolve(this.config.verifyUserEmails(request))) === true;
    const preventLoginWithUnverifiedEmail = async () => this.config.preventLoginWithUnverifiedEmail === true || typeof this.config.preventLoginWithUnverifiedEmail === 'function' && (await Promise.resolve(this.config.preventLoginWithUnverifiedEmail(request))) === true;
    // If verification is required
    if ((await verifyUserEmails()) && (await preventLoginWithUnverifiedEmail())) {
      this.storage.rejectSignup = true;
      return;
    }
  }
  return this.createSessionToken();
};
RestWrite.prototype.createSessionToken = async function () {
  // cloud installationId from Cloud Code,
  // never create session tokens from there.
  if (this.auth.installationId && this.auth.installationId === 'cloud') {
    return;
  }
  if (this.storage.authProvider == null && this.data.authData) {
    this.storage.authProvider = Object.keys(this.data.authData).join(',');
  }
  const {
    sessionData,
    createSession
  } = RestWrite.createSession(this.config, {
    userId: this.objectId(),
    createdWith: {
      action: this.storage.authProvider ? 'login' : 'signup',
      authProvider: this.storage.authProvider || 'password'
    },
    installationId: this.auth.installationId
  });
  if (this.response && this.response.response) {
    this.response.response.sessionToken = sessionData.sessionToken;
    this.storage.issuedSessionToken = sessionData.sessionToken;
  }
  return createSession();
};
RestWrite.createSession = function (config, {
  userId,
  createdWith,
  installationId,
  additionalSessionData
}) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: userId
    },
    createdWith,
    expiresAt: Parse._encode(expiresAt)
  };
  if (installationId) {
    sessionData.installationId = installationId;
  }
  Object.assign(sessionData, additionalSessionData);
  return {
    sessionData,
    createSession: () => new RestWrite(config, Auth.master(config), '_Session', null, sessionData).execute()
  };
};

// Delete email reset tokens if user is changing password or email.
RestWrite.prototype.deleteEmailResetTokenIfNeeded = function () {
  if (this.className !== '_User' || this.query === null) {
    // null query means create
    return;
  }
  if ('password' in this.data || 'email' in this.data) {
    const addOps = {
      _perishable_token: {
        __op: 'Delete'
      },
      _perishable_token_expires_at: {
        __op: 'Delete'
      }
    };
    this.data = Object.assign(this.data, addOps);
  }
};
RestWrite.prototype.destroyDuplicatedSessions = function () {
  // Only for _Session, and at creation time
  if (this.className != '_Session' || this.query) {
    return;
  }
  // Destroy the sessions in 'Background'
  const {
    user,
    installationId,
    sessionToken
  } = this.data;
  if (!user || !installationId) {
    return;
  }
  if (!user.objectId) {
    return;
  }
  this.config.database.destroy('_Session', {
    user,
    installationId,
    sessionToken: {
      $ne: sessionToken
    }
  }, {}, this.validSchemaController);
};

// Handles any followup logic
RestWrite.prototype.handleFollowup = function () {
  if (this.storage && this.storage['clearSessions'] && this.config.revokeSessionOnPasswordReset) {
    var sessionQuery = {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    };
    delete this.storage['clearSessions'];
    return this.config.database.destroy('_Session', sessionQuery).then(this.handleFollowup.bind(this));
  }
  if (this.storage && this.storage['generateNewSession']) {
    delete this.storage['generateNewSession'];
    return this.createSessionToken().then(this.handleFollowup.bind(this));
  }
  if (this.storage && this.storage['sendVerificationEmail']) {
    delete this.storage['sendVerificationEmail'];
    // Fire and forget!
    this.config.userController.sendVerificationEmail(this.data, {
      auth: this.auth
    });
    return this.handleFollowup.bind(this);
  }
};

// Handles the _Session class specialness.
// Does nothing if this isn't an _Session object.
RestWrite.prototype.handleSession = function () {
  if (this.response || this.className !== '_Session') {
    return;
  }
  if (!this.auth.user && !this.auth.isMaster && !this.auth.isMaintenance) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  }

  // TODO: Verify proper error to throw
  if (this.data.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ' + 'ACL on a Session.');
  }
  if (this.query) {
    if (this.data.user && !this.auth.isMaster && this.data.user.objectId != this.auth.user.id) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if ('installationId' in this.data) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if ('sessionToken' in this.data) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if ('expiresAt' in this.data && !this.auth.isMaster && !this.auth.isMaintenance) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if ('createdWith' in this.data && !this.auth.isMaster && !this.auth.isMaintenance) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    }
    if (!this.auth.isMaster) {
      this.query = {
        $and: [this.query, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
    }
  }
  if (!this.query && !this.auth.isMaster && !this.auth.isMaintenance) {
    const additionalSessionData = {};
    for (var key in this.data) {
      if (key === 'objectId' || key === 'user' || key === 'sessionToken' || key === 'expiresAt' || key === 'createdWith') {
        continue;
      }
      additionalSessionData[key] = this.data[key];
    }
    const {
      sessionData,
      createSession
    } = RestWrite.createSession(this.config, {
      userId: this.auth.user.id,
      createdWith: {
        action: 'create'
      },
      additionalSessionData
    });

    // Enforce the caller's class-level permissions and schema before the master write
    const validated = this.validateWritePermission().then(() => this.validateSchema());
    return validated.then(() => createSession()).then(results => {
      if (!results.response) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
      }
      sessionData['objectId'] = results.response['objectId'];
      this.response = {
        status: 201,
        location: results.location,
        response: sessionData
      };
    });
  }
};

// Handles the _Installation class specialness.
// Does nothing if this isn't an installation object.
// If an installation is found, this can mutate this.query and turn a create
// into an update.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.handleInstallation = function () {
  if (this.response || this.className !== '_Installation') {
    return;
  }

  // The deduplication below embeds these client-supplied values directly into database
  // queries that delete or update rows with master privileges, and it runs before
  // `validateSchema`, so their types must be enforced here: a non-string value would
  // otherwise reach the database as a query constraint (such as an operator object
  // `{"$ne": null}`) matching rows the client never identified, instead of as a literal
  // value to match against. The schema declares all three as `String`, but that check
  // cannot be reused here; it runs later in the write pipeline and moving it earlier
  // would mutate the schema before the permission check. The field list is a property of
  // this function rather than of the schema: it is the set of values spliced into the
  // deduplication queries below.
  for (const fieldName of ['deviceToken', 'installationId', 'appIdentifier']) {
    const value = this.data[fieldName];
    if (value === undefined || value === null || typeof value === 'string') {
      continue;
    }
    if (fieldName === 'appIdentifier' && value.__op === 'Delete') {
      continue;
    }
    const actualType = Array.isArray(value) ? 'Array' : `${typeof value}`.replace(/^./, character => character.toUpperCase());
    throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for _Installation.${fieldName}; expected String but got ${actualType}`);
  }
  if (!this.query && !this.data.deviceToken && !this.data.installationId && !this.auth.installationId) {
    throw new Parse.Error(135, 'at least one ID field (deviceToken, installationId) ' + 'must be specified in this operation');
  }

  // If the device token is 64 characters long, we assume it is for iOS
  // and lowercase it.
  if (this.data.deviceToken && this.data.deviceToken.length == 64) {
    this.data.deviceToken = this.data.deviceToken.toLowerCase();
  }

  // We lowercase the installationId if present
  if (this.data.installationId) {
    this.data.installationId = this.data.installationId.toLowerCase();
  }
  let installationId = this.data.installationId;

  // If data.installationId is not set and we're not master, we can lookup in auth
  if (!installationId && !this.auth.isMaster && !this.auth.isMaintenance) {
    installationId = this.auth.installationId;
  }
  if (installationId) {
    installationId = installationId.toLowerCase();
  }

  // Updating _Installation but not updating anything critical
  if (this.query && !this.data.deviceToken && !installationId && !this.data.deviceType) {
    return;
  }
  var promise = Promise.resolve();
  var idMatch; // Will be a match on either objectId or installationId
  var objectIdMatch;
  var installationIdMatch;
  var deviceTokenMatches = [];

  // Instead of issuing 3 reads, let's do it with one OR.
  const orQueries = [];
  if (this.query && this.query.objectId) {
    orQueries.push({
      objectId: this.query.objectId
    });
  }
  if (installationId) {
    orQueries.push({
      installationId: installationId
    });
  }
  if (this.data.deviceToken) {
    orQueries.push({
      deviceToken: this.data.deviceToken
    });
  }
  if (orQueries.length == 0) {
    return;
  }
  promise = promise.then(() => {
    return this.config.database.find('_Installation', {
      $or: orQueries
    }, {});
  }).then(results => {
    results.forEach(result => {
      if (this.query && this.query.objectId && result.objectId == this.query.objectId) {
        objectIdMatch = result;
      }
      if (result.installationId == installationId) {
        installationIdMatch = result;
      }
      if (result.deviceToken == this.data.deviceToken) {
        deviceTokenMatches.push(result);
      }
    });

    // Sanity checks when running a query
    if (this.query && this.query.objectId) {
      if (!objectIdMatch) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
      }
      if (this.data.installationId && objectIdMatch.installationId && this.data.installationId !== objectIdMatch.installationId) {
        throw new Parse.Error(136, 'installationId may not be changed in this ' + 'operation');
      }
      if (this.data.deviceToken && objectIdMatch.deviceToken && this.data.deviceToken !== objectIdMatch.deviceToken && !this.data.installationId && !objectIdMatch.installationId) {
        throw new Parse.Error(136, 'deviceToken may not be changed in this ' + 'operation');
      }
      if (this.data.deviceType && this.data.deviceType && this.data.deviceType !== objectIdMatch.deviceType) {
        throw new Parse.Error(136, 'deviceType may not be changed in this ' + 'operation');
      }
    }
    if (this.query && this.query.objectId && objectIdMatch) {
      idMatch = objectIdMatch;
    }
    if (installationId && installationIdMatch) {
      idMatch = installationIdMatch;
    }
    // need to specify deviceType only if it's new
    if (!this.query && !this.data.deviceType && !idMatch) {
      throw new Parse.Error(135, 'deviceType must be specified in this operation');
    }
  }).then(() => {
    if (!idMatch) {
      if (!deviceTokenMatches.length) {
        return;
      } else if (deviceTokenMatches.length == 1 && (!deviceTokenMatches[0]['installationId'] || !installationId)) {
        // Single match on device token but none on installationId, and either
        // the passed object or the match is missing an installationId, so we
        // can just return the match.
        return deviceTokenMatches[0]['objectId'];
      } else if (!this.data.installationId) {
        throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
      } else {
        // Multiple device token matches and we specified an installation ID,
        // or a single match where both the passed and matching objects have
        // an installation ID. Try cleaning out old installations that match
        // the deviceToken, and return nil to signal that a new object should
        // be created.
        var delQuery = {
          deviceToken: this.data.deviceToken,
          installationId: {
            $ne: installationId
          }
        };
        if (this.data.appIdentifier) {
          // A `Delete` operation is applied only after the deduplication runs, and no
          // installation matched here to take a scope from. Skip the cleanup rather than
          // run it unscoped across every application, or query on the operation itself.
          if (typeof this.data.appIdentifier !== 'string') {
            return;
          }
          delQuery['appIdentifier'] = this.data.appIdentifier;
        }
        this.config.database.destroy('_Installation', delQuery).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored.
            return;
          }
          // rethrow the error
          throw err;
        });
        return;
      }
    } else {
      if (deviceTokenMatches.length == 1 && !deviceTokenMatches[0]['installationId']) {
        // Exactly one device token match and it doesn't have an installation
        // ID. This is the one case where we want to merge with the existing
        // object.
        const delQuery = {
          objectId: idMatch.objectId
        };
        return this.config.database.destroy('_Installation', delQuery).then(() => {
          return deviceTokenMatches[0]['objectId'];
        }).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored
            return;
          }
          // rethrow the error
          throw err;
        });
      } else {
        if (this.data.deviceToken && idMatch.deviceToken != this.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          const delQuery = {
            deviceToken: this.data.deviceToken
          };
          // We have a unique install Id, use that to preserve
          // the interesting installation
          if (this.data.installationId) {
            delQuery['installationId'] = {
              $ne: this.data.installationId
            };
          } else if (idMatch.objectId && this.data.objectId && idMatch.objectId == this.data.objectId) {
            // we passed an objectId, preserve that instalation
            delQuery['objectId'] = {
              $ne: idMatch.objectId
            };
          } else {
            // What to do here? can't really clean up everything...
            return idMatch.objectId;
          }
          if (this.data.appIdentifier) {
            // A `Delete` operation is applied only after the deduplication runs, so scope
            // the cleanup to the value the matched installation still holds. Dropping the
            // constraint would let the cleanup reach installations of other applications,
            // and the operation itself cannot match a String, so skip the cleanup when no
            // scope is available.
            const appIdentifier = typeof this.data.appIdentifier === 'string' ? this.data.appIdentifier : idMatch.appIdentifier;
            if (typeof appIdentifier !== 'string') {
              return idMatch.objectId;
            }
            delQuery['appIdentifier'] = appIdentifier;
          }
          this.config.database.destroy('_Installation', delQuery).catch(err => {
            if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
              // no deletions were made. Can be ignored.
              return;
            }
            // rethrow the error
            throw err;
          });
        }
        // In non-merge scenarios, just return the installation match id
        return idMatch.objectId;
      }
    }
  }).then(objId => {
    if (objId) {
      this.query = {
        objectId: objId
      };
      delete this.data.objectId;
      delete this.data.createdAt;
    }
    // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
  });
  return promise;
};

// If we short-circuited the object response - then we need to make sure we expand all the files,
// since this might not have a query, meaning it won't return the full result back.
// TODO: (nlutsenko) This should die when we move to per-class based controllers on _Session/_User
RestWrite.prototype.expandFilesForExistingObjects = async function () {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    await this.config.filesController.expandFilesInObject(this.config, this.response.response);
  }
};
RestWrite.prototype.runDatabaseOperation = function () {
  if (this.response) {
    return;
  }
  if (this.className === '_Role') {
    this.config.cacheController.role.clear();
    if (this.config.liveQueryController) {
      this.config.liveQueryController.clearCachedRoles(this.auth.user);
    }
  }
  if (this.className === '_User' && this.query && this.auth.isUnauthenticated()) {
    throw (0, _Error.createSanitizedError)(Parse.Error.SESSION_MISSING, `Cannot modify user ${this.query.objectId}.`, this.config);
  }
  if (this.className === '_Product' && this.data.download) {
    this.data.downloadName = this.data.download.name;
  }

  // TODO: Add better detection for ACL, ensuring a user can't be locked from
  //       their own user record.
  if (this.data.ACL && this.data.ACL['*unresolved']) {
    throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
  }
  if (this.query) {
    // Force the user to not lockout
    // Matched with parse.com
    if (this.className === '_User' && this.data.ACL && this.auth.isMaster !== true && this.auth.isMaintenance !== true) {
      this.data.ACL[this.query.objectId] = {
        read: true,
        write: true
      };
    }
    // update password timestamp if user password is being changed
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
      this.data._password_changed_at = Parse._encode(new Date());
    }
    // Ignore createdAt when update
    delete this.data.createdAt;
    let defer = Promise.resolve();
    // if password history is enabled then save the current password to history
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordHistory) {
      defer = this.config.database.find('_User', {
        objectId: this.query.objectId
      }, {
        keys: ['_password_history', '_hashed_password']
      }, Auth.maintenance(this.config)).then(results => {
        if (results.length != 1) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }
        const user = results[0];
        let oldPasswords = [];
        if (user._password_history) {
          oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory);
        }
        //n-1 passwords go into history including last password
        while (oldPasswords.length > Math.max(0, this.config.passwordPolicy.maxPasswordHistory - 2)) {
          oldPasswords.shift();
        }
        oldPasswords.push(user.password);
        this.data._password_history = oldPasswords;
      });
    }
    return defer.then(() => {
      // Run an update
      // The unsanitized result of a client update carries the read access of the object
      const raw = !this.runOptions.many && !this.auth.isMaster && !this.auth.isMaintenance;
      return this.config.database.update(this.className, this.query, this.data, this.runOptions, raw, false, this.validSchemaController).catch(error => {
        this._throwIfAuthDataDuplicate(error);
        throw error;
      }).then(async result => {
        let response = result;
        if (raw) {
          this.writtenReadAccess = result._rperm;
          this.writtenObject = result;
          response = await this.config.database._sanitizeDatabaseResult(this.data, result);
        }
        response.updatedAt = this.updatedAt;
        this._updateResponseWithData(response, this.data);
        this.response = {
          response
        };
      });
    });
  } else {
    // Set the default ACL and password timestamp for the new _User
    if (this.className === '_User') {
      var ACL = this.data.ACL;
      // default public r/w ACL
      if (!ACL) {
        ACL = {};
        if (!this.config.enforcePrivateUsers) {
          ACL['*'] = {
            read: true,
            write: false
          };
        }
      }
      // make sure the user is not locked down
      ACL[this.data.objectId] = {
        read: true,
        write: true
      };
      this.data.ACL = ACL;
      // password timestamp to be used when password expiry policy is enforced
      if (this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
        this.data._password_changed_at = Parse._encode(new Date());
      }
    }

    // Run a create
    return this.config.database.create(this.className, this.data, this.runOptions, false, this.validSchemaController).catch(error => {
      if (this.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      }
      this._throwIfAuthDataDuplicate(error);

      // Quick check, if we were able to infer the duplicated field name
      if (error && error.userInfo && error.userInfo.duplicated_field === 'username') {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
      }
      if (error && error.userInfo && error.userInfo.duplicated_field === 'email') {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
      }

      // If this was a failed user creation due to username or email already taken, we need to
      // check whether it was username or email and return the appropriate error.
      // Fallback to the original method
      // TODO: See if we can later do this without additional queries by using named indexes.
      return this.config.database.find(this.className, {
        username: this.data.username,
        objectId: {
          $ne: this.objectId()
        }
      }, {
        limit: 1
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
        }
        return this.config.database.find(this.className, {
          email: this.data.email,
          objectId: {
            $ne: this.objectId()
          }
        }, {
          limit: 1
        });
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
        }
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      });
    }).then(response => {
      response.objectId = this.data.objectId;
      response.createdAt = this.data.createdAt;
      if (this.responseShouldHaveUsername) {
        response.username = this.data.username;
      }
      this._updateResponseWithData(response, this.data);
      // Read access as stored
      const acl = this.data.ACL;
      this.writtenReadAccess = acl ? Object.keys(acl).filter(key => acl[key].read) : null;
      this.writtenObject = this.data;
      this.response = {
        status: 201,
        response,
        location: this.location()
      };
    });
  }
};

// Returns nothing - doesn't wait for the trigger.
RestWrite.prototype.runAfterSaveTrigger = function () {
  if (!this.response || !this.response.response || this.runOptions.many) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.
  const hasAfterSaveHook = triggers.triggerExists(this.className, triggers.Types.afterSave, this.config.applicationId);
  const hasLiveQuery = this.config.liveQueryController.hasLiveQuery(this.className);
  if (!hasAfterSaveHook && !hasLiveQuery) {
    return Promise.resolve();
  }
  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  updatedObject._handleSaveResponse(this.cloneWithFileUrls(this.response.response), this.response.status || 200);
  if (hasLiveQuery) {
    this.config.database.loadSchema().then(schemaController => {
      // Notify LiveQueryServer if possible
      const perms = schemaController.getClassLevelPermissions(updatedObject.className);
      this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
    }).catch(err => {
      _logger.default.error('LiveQuery afterSave notification failed', err);
    });
  }
  if (!hasAfterSaveHook) {
    return Promise.resolve();
  }
  // Run afterSave trigger
  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    const jsonReturned = result && !result._toFullJSON;
    if (jsonReturned) {
      // The returned object is the response as is
      this.storage.responseFromTrigger = true;
      this.pendingOps.operations = {};
      this.response.response = result;
    } else {
      this.response.response = this._updateResponseWithData((result || updatedObject).toJSON(), this.data, true);
    }
  }).catch(function (err) {
    _logger.default.warn('afterSave caught an error', err);
  });
};

// A helper to figure out what location this operation happens at.
RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  const mount = this.config.mount || this.config.serverURL;
  return mount + middle + this.data.objectId;
};

// A helper to get the object id for this operation.
// Because it could be either on the query or on the data
RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
};

// Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)
RestWrite.prototype.sanitizedData = function () {
  const data = Object.keys(this.data).reduce((data, key) => {
    // Regexp comes from Parse.Object.prototype.validate
    if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
      delete data[key];
    }
    return data;
  }, this.cloneWithFileUrls(this.data));
  return Parse._decode(undefined, data);
};

// A raw view of the object's fields (stored values overlaid with whole-field
// writes in this request) used to resolve whether a dot notation key targets a
// pointer's object ID.
RestWrite.prototype._dotNotationFieldRoot = function () {
  const root = Object.assign({}, this.originalData);
  if (this.data) {
    for (const key of Object.keys(this.data)) {
      if (key.indexOf('.') < 0) {
        root[key] = this.data[key];
      }
    }
  }
  return root;
};
const prohibitedDotNotationKey = key => new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Prohibited dot notation key in request data: ${JSON.stringify(key)}.`);

// Values the SDK decodes to an instance rather than a plain object: an operation or a
// typed value
const decodesToInstance = value => {
  if (typeof value.__op === 'string') {
    return true;
  }
  switch (value.__type) {
    case 'Pointer':
    case 'Object':
      return !!value.className;
    case 'Relation':
    case 'Date':
    case 'File':
    case 'GeoPoint':
    case 'Polygon':
      return true;
    default:
      return false;
  }
};

// Whether the SDK would resolve a non-leaf segment of the key, from the given depth
// on, through the prototype chain of the container instead of an own key, writing
// the final segment onto a shared built-in.
const descendsIntoPrototype = (container, segments, depth = 0) => {
  for (let i = depth; i < segments.length - 1; i++) {
    if (container === null || typeof container !== 'object') {
      return false;
    }
    // A further segment walks the prototype of the decoded instance
    if (decodesToInstance(container)) {
      return true;
    }
    const segment = segments[i];
    if (!hasOwn(container, segment)) {
      // An inherited member of a nested value resolves to a shared built-in; the root
      // has no prototype in the SDK, and a missing key is created fresh
      return i > 0 && segment in container;
    }
    container = container[segment];
  }
  return false;
};

// The container a written value provides for keys below it: the value itself, or
// the elements an array operation adds
const writtenContainer = value => {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  if (typeof value.__op === 'string') {
    return Array.isArray(value.objects) ? value.objects : undefined;
  }
  return value;
};

// Rejects a dot notation key that the SDK would apply through a prototype member of
// the stored object (the trigger object is built from it before the other fields of
// this request are applied), of the object as written by this request, or of a value
// another key of this request writes above it.
RestWrite.prototype.validateDotNotationKeys = function () {
  const keys = Object.keys(this.data);
  const keySet = new Set(keys);
  const roots = [this._dotNotationFieldRoot()];
  if (this.originalData) {
    roots.push(this.originalData);
  }
  // Only a key that is a prefix of this key, ending on a segment boundary, writes above it
  const writtenAbove = segments => {
    let prefix = segments[0];
    for (let depth = 1; depth < segments.length - 1; depth++) {
      if (keySet.has(prefix)) {
        const container = writtenContainer(this.data[prefix]);
        if (container !== undefined && descendsIntoPrototype(container, segments, depth)) {
          return true;
        }
      }
      prefix += `.${segments[depth]}`;
    }
    return false;
  };
  for (const key of keys) {
    if (key.indexOf('.') < 0) {
      continue;
    }
    const segments = key.split('.');
    if (roots.some(root => descendsIntoPrototype(root, segments)) || writtenAbove(segments)) {
      throw prohibitedDotNotationKey(key);
    }
  }
};

// Returns an updated copy of the object
RestWrite.prototype.buildParseObjects = function () {
  const extraData = {
    className: this.className,
    objectId: this.query?.objectId
  };
  let originalObject;
  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }
  const className = Parse.Object.fromJSON(extraData);
  const readOnlyAttributes = className.constructor.readOnlyAttributes ? className.constructor.readOnlyAttributes() : [];

  // For _Role class, 'name' cannot be set after the role has an objectId.
  // In afterSave context, _handleSaveResponse has already set the objectId,
  // so we treat 'name' as read-only to avoid Parse SDK validation errors.
  const isRoleAfterSave = this.className === '_Role' && this.response && !this.query;
  if (isRoleAfterSave && this.data.name && !readOnlyAttributes.includes('name')) {
    readOnlyAttributes.push('name');
  }
  if (!this.originalData) {
    for (const attribute of readOnlyAttributes) {
      extraData[attribute] = this.data[attribute];
    }
  }
  const updatedObject = triggers.inflate(extraData, this.originalData);
  const pointerRoot = this._dotNotationFieldRoot();
  Object.keys(this.data).reduce(function (data, key) {
    if (key.indexOf('.') > 0) {
      // Null and undefined are set at their own dot notation path, like an operation
      if (data[key] == null || typeof data[key].__op === 'string') {
        // A dot notation key that removes a pointer's object ID would leave the
        // pointer unserializable and break the trigger object, so skip it.
        if (!readOnlyAttributes.includes(key) && !targetsPointerId(pointerRoot, key)) {
          // The SDK key name rules apply to top-level fields only
          updatedObject.set(key, data[key], {
            ignoreValidation: true
          });
        }
      } else {
        // subdocument key with dot notation { 'x.y': v } => { 'x': { 'y' : v } })
        const splittedKey = key.split('.');
        const parentProp = splittedKey[0];
        let parentVal = updatedObject.get(parentProp);
        if (typeof parentVal !== 'object') {
          parentVal = {};
        }
        parentVal[splittedKey[1]] = data[key];
        updatedObject.set(parentProp, parentVal);
      }
      delete data[key];
    }
    return data;
  }, this.cloneWithFileUrls(this.data));
  const sanitized = this.sanitizedData();
  for (const attribute of readOnlyAttributes) {
    delete sanitized[attribute];
  }
  updatedObject.set(sanitized);
  return {
    updatedObject,
    originalObject
  };
};
RestWrite.prototype.cleanUserAuthData = function () {
  if (this.response && this.response.response && this.className === '_User') {
    const user = this.response.response;
    if (user.authData) {
      Object.keys(user.authData).forEach(provider => {
        if (user.authData[provider] === null) {
          delete user.authData[provider];
        }
      });
      if (Object.keys(user.authData).length == 0) {
        delete user.authData;
      }
    }
  }
};
const hasOwn = (object, key) => object !== null && object !== undefined && Object.prototype.hasOwnProperty.call(object, key);

// Whether a dot notation path can descend into the value
const isContainer = value => value !== null && typeof value === 'object' && !value.__type && !value.__op;

// Reads a dot notation path through own properties of containers only
const getOwnPath = (object, path) => {
  let value = object;
  for (const key of path) {
    if (!isContainer(value) || !hasOwn(value, key)) {
      return undefined;
    }
    value = value[key];
  }
  return value;
};

// Whether a dot notation key targets a pointer's object ID (`id`/`objectId`).
// Removing it leaves the pointer unserializable (`toPointer` throws), which
// corrupts the trigger object; other sub-keys below a pointer are left to the
// existing handling.
const targetsPointerId = (root, key) => {
  const segments = key.split('.');
  for (let depth = 1; depth < segments.length; depth++) {
    const parent = getOwnPath(root, segments.slice(0, depth));
    if (parent !== null && typeof parent === 'object' && parent.__type === 'Pointer') {
      const next = segments[depth];
      return next === 'id' || next === 'objectId';
    }
  }
  return false;
};

// Restores a reverted dot notation key in the response
RestWrite.prototype._restoreRevertedPath = function (response, writeData, written, key, finalObject) {
  // A write at or beneath the key governs
  if (written.some(k => k === key || k.startsWith(`${key}.`))) {
    return;
  }
  const path = key.split('.');
  // A returned object without the field leaves the stored value
  const fromFinal = !!finalObject && hasOwn(finalObject, path[0]);
  let value = fromFinal ? finalObject : this.originalData || {};
  let depth = 0;
  let authoritative = fromFinal;
  if (!fromFinal) {
    // A written ancestor governs; computed operations are returned expanded
    const ancestor = written.filter(k => key.startsWith(`${k}.`)).sort((a, b) => b.length - a.length)[0];
    if (ancestor) {
      const ancestorPath = ancestor.split('.');
      let returned = getOwnPath(response, ancestorPath);
      // An unchanged computed result is no longer in the response
      const op = writeData[ancestor]?.__op;
      if (returned === undefined && op && op !== 'Delete') {
        returned = getOwnPath(this.originalData, ancestorPath);
      }
      value = returned !== undefined ? returned : writeData[ancestor];
      if (!isContainer(value)) {
        return;
      }
      depth = ancestorPath.length;
      authoritative = true;
    }
  }
  while (depth < path.length && isContainer(value) && hasOwn(value, path[depth])) {
    value = value[path[depth++]];
  }
  // A missing array index returns the whole array, so the client keeps no hole
  const missingIndex = depth < path.length && Array.isArray(value) && /^\d+$/.test(path[depth]);
  if (depth < path.length && !missingIndex) {
    if (isContainer(value)) {
      // Delete at the first missing key
      depth++;
      value = undefined;
    } else if (value?.__op) {
      return;
    } else {
      const unchanged = util.isDeepStrictEqual(value, getOwnPath(this.originalData, path.slice(0, depth)));
      if (!fromFinal || unchanged) {
        // Clears the client operation beneath an unchanged typed value
        if (value?.__type && unchanged) {
          response[key] = {
            __op: 'Delete'
          };
        }
        return;
      }
    }
  }
  const target = path.slice(0, depth).join('.');
  const keys = [...written, ...Object.keys(response)];
  const overlaps = prefix => keys.some(k => k === prefix || k.startsWith(`${prefix}.`) || prefix.startsWith(`${k}.`));
  if (!authoritative && (value === undefined || missingIndex) && overlaps(target)) {
    // Another write creates the path; clear the shallowest untouched reverted part
    if (value === undefined) {
      for (let length = depth + 1; length <= path.length; length++) {
        const prefix = path.slice(0, length).join('.');
        if (!overlaps(prefix)) {
          response[prefix] = {
            __op: 'Delete'
          };
          break;
        }
      }
    }
    return;
  }
  for (const responseKey of Object.keys(response)) {
    if (responseKey.startsWith(`${target}.`)) {
      delete response[responseKey];
    }
  }
  response[target] = value === undefined ? {
    __op: 'Delete'
  } : value;
};

// The value of an operation applied to an empty value
const appliedToEmpty = value => {
  switch (value?.__op) {
    case 'Increment':
      return value.amount;
    case 'Add':
      return value.objects;
    case 'AddUnique':
      return _lodash.default.uniqWith(value.objects, util.isDeepStrictEqual);
    case 'Remove':
      return [];
    default:
      return value;
  }
};

// Sets the dot notation keys of the request in the response, applied to an empty value
RestWrite.prototype._setRequestPaths = function (response) {
  // Fields the response keeps, such as objectId
  const kept = Object.keys(response);
  const arrays = new Set();
  for (const [key, value] of this.requestOperations) {
    const segments = key.split('.');
    if (segments.length < 2 || kept.includes(segments[0])) {
      continue;
    }
    // The SDK cannot apply a dot notation path to ACL
    if (segments[0] === 'ACL') {
      continue;
    }
    const op = value?.__op;
    // Another operation, such as a relation operation, has no value
    if (op && op !== 'Delete' && !computedOperations.includes(op)) {
      continue;
    }
    // An index below an Array field
    if (this.validSchemaController.getExpectedType(this.className, segments[0])?.type === 'Array' && /^\d+$/.test(segments[1])) {
      arrays.add(segments[0]);
    }
    let container = response;
    for (const segment of segments.slice(0, -1)) {
      if (!hasOwn(container, segment) || !isContainer(container[segment])) {
        container[segment] = {};
      }
      container = container[segment];
    }
    // An unset leaves only the parents
    if (op !== 'Delete') {
      container[segments[segments.length - 1]] = appliedToEmpty(value);
    }
  }
  // Only the elements of the request, in index order
  for (const field of arrays) {
    response[field] = Object.values(response[field]);
  }
};

// Whether the caller can read the object as written; changes after the write are not considered
RestWrite.prototype._canReadWrittenObject = function (aclGroup) {
  const readers = this.writtenReadAccess;
  // A write result without valid read access fails closed
  if (readers !== null && !Array.isArray(readers)) {
    return false;
  }
  // The object ACL
  if (readers && !readers.some(reader => aclGroup.includes(reader))) {
    return false;
  }
  // A client reads a session with a find constrained to the session user
  const operation = this.className === '_Session' ? 'find' : 'get';
  const permissions = this.validSchemaController.getClassLevelPermissions(this.className);
  if (SchemaController.SchemaController.permissionDenial(permissions, this.className, aclGroup, operation)) {
    return false;
  }
  // The pointer permissions of the written object
  const users = aclGroup.filter(entry => entry !== '*' && !entry.startsWith('role:'));
  return SchemaController.SchemaController.testPointerPermissions(permissions, aclGroup, operation, users.length === 1 ? users[0] : undefined, field => {
    let value = this.writtenObject?.[field];
    // A create stores an operation applied to an empty value
    if (!this.query) {
      value = appliedToEmpty(value);
    }
    // An update result of the Postgres adapter has the objectId of a pointer
    const expected = this.validSchemaController.getExpectedType(this.className, field);
    return typeof value === 'string' && expected?.type === 'Pointer' ? {
      __type: 'Pointer',
      className: expected.targetClass,
      objectId: value
    } : value;
  });
};

// Returns stored values in a save response only if the caller can read the object as written
RestWrite.prototype.filterUnreadableFieldsInResponse = function () {
  const response = this.response?.response;
  if (!response || this.storage.responseFromTrigger) {
    return;
  }
  // Login and session requests build their own response
  if (!this.query && this.writtenReadAccess === undefined) {
    return;
  }
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return;
  }
  // A session token issued by this request is not a stored value
  const issued = this.storage.issuedSessionToken;
  // Nor is a required column that echoes the caller's unchanged input
  const echoed = key => (_SchemaController.requiredColumns.read[this.className] || []).includes(key) && !(this.storage.fieldsChangedByTrigger || []).includes(key) && !(key === 'username' && this.responseShouldHaveUsername) && util.isDeepStrictEqual(response[key], this.data[key]);
  const fields = Object.keys(response).filter(key => !['objectId', 'createdAt', 'updatedAt'].includes(key) && !(key === 'sessionToken' && issued && response[key] === issued) && !echoed(key));
  if (!fields.length) {
    return;
  }
  // A sign-up response is for the new user if it issues the new user a session
  const signUp = !this.query && this.className === '_User' && !!issued;
  const aclGroup = signUp ? ['*', this.data.objectId] : this.runOptions.acl || [];
  if (!this._canReadWrittenObject(aclGroup)) {
    // No stored values for a caller who cannot read the object
    for (const key of fields) {
      delete response[key];
    }
    this._setRequestPaths(response);
  }
};
RestWrite.prototype._updateResponseWithData = function (response, data, isFinalObject = false) {
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(this.pendingOps.identifier);
  let revertedData;
  const revertedPaths = [];
  for (const key in this.pendingOps.operations) {
    if (pending[key]) {
      continue;
    }
    // The SDK cannot apply an operation or a dot notation path to ACL
    if (key.startsWith('ACL.') || key === 'ACL' && !hasOwn(this.originalData, 'ACL')) {
      continue;
    }
    if (key.includes('.')) {
      revertedPaths.push(key);
      continue;
    }
    // Response only; the write data builds the afterSave and LiveQuery objects
    revertedData ||= {
      ...data
    };
    revertedData[key] = hasOwn(this.originalData, key) ? this.originalData[key] : {
      __op: 'Delete'
    };
    this.storage.fieldsChangedByTrigger ||= [];
    // Once only, so an afterSave unset is not undone by a second entry
    if (this.storage.fieldsChangedByTrigger.indexOf(key) < 0) {
      this.storage.fieldsChangedByTrigger.push(key);
    }
  }
  const responseData = revertedData || data;
  // The final object, before unchanged fields are removed from the response
  const finalObject = isFinalObject && revertedPaths.length ? {
    ...response
  } : undefined;
  const skipKeys = [...(_SchemaController.requiredColumns.read[this.className] || [])];
  if (!this.query) {
    skipKeys.push('objectId', 'createdAt');
  } else {
    skipKeys.push('updatedAt');
    delete response.objectId;
  }
  // The client's operation results and dot notation parents, also if unchanged
  const requested = this.requestOperations.filter(([key]) => key.includes('.') ? hasOwn(data, key) : computedOperations.includes(data[key]?.__op)).map(([key]) => key.split('.')[0]);
  for (const key in response) {
    if (skipKeys.includes(key)) {
      continue;
    }
    const value = response[key];
    if (value == null || value.__type && value.__type === 'Pointer' || util.isDeepStrictEqual(responseData[key], value) || !requested.includes(key) && util.isDeepStrictEqual((this.originalData || {})[key], value)) {
      delete response[key];
    }
  }
  (this.storage.fieldsChangedByTrigger || []).forEach(fieldName => {
    const dataValue = responseData[fieldName];
    if (!Object.prototype.hasOwnProperty.call(response, fieldName)) {
      response[fieldName] = dataValue;
    }
    if (response[fieldName] && response[fieldName].__op) {
      delete response[fieldName];
      if (dataValue.__op == 'Delete') {
        response[fieldName] = dataValue;
      }
    }
  });
  if (revertedPaths.length) {
    const written = Object.keys(data);
    for (const key of revertedPaths) {
      this._restoreRevertedPath(response, data, written, key, finalObject);
    }
  }
  return response;
};
var _default = exports.default = RestWrite;
module.exports = RestWrite;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUmVzdFF1ZXJ5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2xvZ2dlciIsIl9BdXRoRGF0YUxvY2siLCJfU2NoZW1hQ29udHJvbGxlciIsIl9FcnJvciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJBdXRoIiwiVXRpbHMiLCJjcnlwdG9VdGlscyIsInBhc3N3b3JkQ3J5cHRvIiwiUGFyc2UiLCJ0cmlnZ2VycyIsInV0aWwiLCJjb21wdXRlZE9wZXJhdGlvbnMiLCJSZXN0V3JpdGUiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwicXVlcnkiLCJkYXRhIiwib3JpZ2luYWxEYXRhIiwiY29udGV4dCIsImFjdGlvbiIsImlzUmVhZE9ubHkiLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm9iamVjdElkIiwiTUlTU0lOR19PQkpFQ1RfSUQiLCJJTlZBTElEX0tFWV9OQU1FIiwiaWQiLCJyZXNwb25zZSIsInN0cnVjdHVyZWRDbG9uZSIsInJlcXVlc3RPcGVyYXRpb25zIiwia2V5cyIsImZpbHRlciIsImtleSIsImluY2x1ZGVzIiwiX19vcCIsIm1hcCIsInVwZGF0ZWRBdCIsIl9lbmNvZGUiLCJEYXRlIiwiaXNvIiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwicGVuZGluZ09wcyIsIm9wZXJhdGlvbnMiLCJpZGVudGlmaWVyIiwiZXhlY3V0ZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImNoZWNrSW50ZXJuYWxGaWVsZHMiLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsImhhbmRsZUluc3RhbGxhdGlvbiIsImhhbmRsZVNlc3Npb24iLCJhdXRob3JpemVVc2VyVXBkYXRlIiwidmFsaWRhdGVBdXRoRGF0YSIsImNoZWNrUmVzdHJpY3RlZEZpZWxkcyIsInJlc29sdmVGaWxlVXJscyIsInZhbGlkYXRlRG90Tm90YXRpb25LZXlzIiwicnVuQmVmb3JlU2F2ZVRyaWdnZXIiLCJlbnN1cmVVbmlxdWVBdXRoRGF0YUlkIiwiZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQiLCJ2YWxpZGF0ZVNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJzZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkIiwidHJhbnNmb3JtVXNlciIsImV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzIiwiZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyIsInJ1bkRhdGFiYXNlT3BlcmF0aW9uIiwiY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQiLCJoYW5kbGVGb2xsb3d1cCIsInJ1bkFmdGVyU2F2ZVRyaWdnZXIiLCJjbGVhblVzZXJBdXRoRGF0YSIsImZpbHRlclVucmVhZGFibGVGaWVsZHNJblJlc3BvbnNlIiwiYXV0aERhdGFSZXNwb25zZSIsInJlamVjdFNpZ251cCIsInByZXZlbnRTaWdudXBXaXRoVW52ZXJpZmllZEVtYWlsIiwiRU1BSUxfTk9UX0ZPVU5EIiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwiZmlsZXMiLCJjcmVhdGUiLCJjb2xsZWN0IiwidmFsdWUiLCJfX3R5cGUiLCJuYW1lIiwiSU5DT1JSRUNUX1RZUEUiLCJ1cmwiLCJ2YWx1ZXMiLCJmb3JFYWNoIiwibGVuZ3RoIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsImZpbGVVcmxzIiwiYXNzaWduIiwiY2xvbmVXaXRoRmlsZVVybHMiLCJvYmplY3QiLCJhZGRVcmxzIiwiZmlsZSIsIm1hbnkiLCJ0cmlnZ2VyRXhpc3RzIiwiVHlwZXMiLCJiZWZvcmVTYXZlIiwiYXBwbGljYXRpb25JZCIsIm9yaWdpbmFsT2JqZWN0IiwidXBkYXRlZE9iamVjdCIsImJ1aWxkUGFyc2VPYmplY3RzIiwiX2dldFN0YXRlSWRlbnRpZmllciIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJkYXRhYmFzZVByb21pc2UiLCJ1cGRhdGUiLCJyZXN1bHQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwibWF5YmVSdW5UcmlnZ2VyIiwiZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciIsIl8iLCJyZWR1Y2UiLCJpc0VxdWFsIiwicHVzaCIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiZXJyb3IiLCJydW5CZWZvcmVMb2dpblRyaWdnZXIiLCJ1c2VyRGF0YSIsImJlZm9yZUxvZ2luIiwiZXh0cmFEYXRhIiwiaW5mbGF0ZSIsImdldEFsbENsYXNzZXMiLCJhbGxDbGFzc2VzIiwic2NoZW1hIiwiZmluZCIsIm9uZUNsYXNzIiwic2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkIiwiZmllbGROYW1lIiwic2V0RGVmYXVsdCIsInVuZGVmaW5lZCIsImZpZWxkcyIsImRlZmF1bHRWYWx1ZSIsInJlcXVpcmVkIiwiVkFMSURBVElPTl9FUlJPUiIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIkFDTCIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZWFkIiwid3JpdGUiLCJjdXJyZW50VXNlciIsImNyZWF0ZWRBdCIsIm5ld09iamVjdElkIiwib2JqZWN0SWRTaXplIiwiYXV0aERhdGEiLCJoYXNVc2VybmFtZUFuZFBhc3N3b3JkIiwidXNlcm5hbWUiLCJwYXNzd29yZCIsImhhc0F1dGhEYXRhIiwic29tZSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwicHJvdmlkZXJBdXRoRGF0YSIsImdldFVzZXJJZCIsImhhbmRsZUF1dGhEYXRhIiwiZmlsdGVyZWRPYmplY3RzQnlBQ0wiLCJvYmplY3RzIiwiX3Rocm93SWZBdXRoRGF0YUR1cGxpY2F0ZSIsImNvZGUiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJzdGFydHNXaXRoIiwiQUNDT1VOVF9BTFJFQURZX0xJTktFRCIsImhhc0F1dGhEYXRhSWQiLCJyIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwicmVzdWx0cyIsInVzZXJJZCIsInVzZXJSZXN1bHQiLCJmb3VuZFVzZXJJc05vdEN1cnJlbnRVc2VyIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwidmFsaWRhdGVkQXV0aERhdGEiLCJhdXRoUHJvdmlkZXIiLCJqb2luIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwibXV0YXRlZEF1dGhEYXRhIiwiaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyIiwiaXNMb2dpbiIsImxvY2F0aW9uIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJyZXMiLCJvcmlnaW5hbEF1dGhEYXRhIiwiZnJvbUVudHJpZXMiLCJlbnRyaWVzIiwiayIsInYiLCJhcHBseUF1dGhEYXRhT3B0aW1pc3RpY0xvY2siLCJTQ1JJUFRfRkFJTEVEIiwiY2hhckF0IiwidmFsaWRhdGVXcml0ZVBlcm1pc3Npb24iLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJpc1VuYXV0aGVudGljYXRlZCIsIlNFU1NJT05fTUlTU0lORyIsInByb21pc2UiLCJSZXN0UXVlcnkiLCJtZXRob2QiLCJNZXRob2QiLCJtYXN0ZXIiLCJydW5CZWZvcmVGaW5kIiwicmVzdFdoZXJlIiwic2Vzc2lvbiIsImNhY2hlQ29udHJvbGxlciIsImRlbCIsInNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwiaGFzaCIsImhhc2hlZFBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsIl92YWxpZGF0ZVVzZXJOYW1lIiwiX3ZhbGlkYXRlRW1haWwiLCJyYW5kb21TdHJpbmciLCJyZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSIsIiRuZSIsImxpbWl0IiwiY2FzZUluc2Vuc2l0aXZlIiwiVVNFUk5BTUVfVEFLRU4iLCJlbWFpbCIsIm1hdGNoIiwicmVqZWN0IiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwiRU1BSUxfVEFLRU4iLCJyZXF1ZXN0Iiwib3JpZ2luYWwiLCJpcCIsImluc3RhbGxhdGlvbklkIiwidXNlckNvbnRyb2xsZXIiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwicGFzc3dvcmRQb2xpY3kiLCJfdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyIsIl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSIsInBvbGljeUVycm9yIiwidmFsaWRhdGlvbkVycm9yIiwiY29udGFpbnNVc2VybmFtZUVycm9yIiwicGF0dGVyblZhbGlkYXRvciIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5IiwibWFpbnRlbmFuY2UiLCJvbGRQYXNzd29yZHMiLCJfcGFzc3dvcmRfaGlzdG9yeSIsInRha2UiLCJuZXdQYXNzd29yZCIsInByb21pc2VzIiwiY29tcGFyZSIsImFsbCIsImNhdGNoIiwiZXJyIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJjcmVhdGVTZXNzaW9uVG9rZW4iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImlzc3VlZFNlc3Npb25Ub2tlbiIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsInRva2VuIiwibmV3VG9rZW4iLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwidmFsaWRhdGVkIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiYWN0dWFsVHlwZSIsIkFycmF5IiwiaXNBcnJheSIsInJlcGxhY2UiLCJjaGFyYWN0ZXIiLCJ0b1VwcGVyQ2FzZSIsImRldmljZVRva2VuIiwidG9Mb3dlckNhc2UiLCJkZXZpY2VUeXBlIiwiaWRNYXRjaCIsIm9iamVjdElkTWF0Y2giLCJpbnN0YWxsYXRpb25JZE1hdGNoIiwiZGV2aWNlVG9rZW5NYXRjaGVzIiwib3JRdWVyaWVzIiwiJG9yIiwiZGVsUXVlcnkiLCJhcHBJZGVudGlmaWVyIiwib2JqSWQiLCJyb2xlIiwiY2xlYXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiY2xlYXJDYWNoZWRSb2xlcyIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiSU5WQUxJRF9BQ0wiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJyYXciLCJ3cml0dGVuUmVhZEFjY2VzcyIsIl9ycGVybSIsIndyaXR0ZW5PYmplY3QiLCJfc2FuaXRpemVEYXRhYmFzZVJlc3VsdCIsIl91cGRhdGVSZXNwb25zZVdpdGhEYXRhIiwiZW5mb3JjZVByaXZhdGVVc2VycyIsImhhc0FmdGVyU2F2ZUhvb2siLCJhZnRlclNhdmUiLCJoYXNMaXZlUXVlcnkiLCJfaGFuZGxlU2F2ZVJlc3BvbnNlIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJvbkFmdGVyU2F2ZSIsImxvZ2dlciIsImpzb25SZXR1cm5lZCIsIl90b0Z1bGxKU09OIiwicmVzcG9uc2VGcm9tVHJpZ2dlciIsInRvSlNPTiIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsIl9kb3ROb3RhdGlvbkZpZWxkUm9vdCIsInJvb3QiLCJwcm9oaWJpdGVkRG90Tm90YXRpb25LZXkiLCJkZWNvZGVzVG9JbnN0YW5jZSIsImRlc2NlbmRzSW50b1Byb3RvdHlwZSIsImNvbnRhaW5lciIsInNlZ21lbnRzIiwiZGVwdGgiLCJpIiwic2VnbWVudCIsImhhc093biIsIndyaXR0ZW5Db250YWluZXIiLCJrZXlTZXQiLCJTZXQiLCJyb290cyIsIndyaXR0ZW5BYm92ZSIsInByZWZpeCIsImhhcyIsInNwbGl0IiwiZnJvbUpTT04iLCJyZWFkT25seUF0dHJpYnV0ZXMiLCJjb25zdHJ1Y3RvciIsImlzUm9sZUFmdGVyU2F2ZSIsImF0dHJpYnV0ZSIsInBvaW50ZXJSb290IiwidGFyZ2V0c1BvaW50ZXJJZCIsInNldCIsImlnbm9yZVZhbGlkYXRpb24iLCJzcGxpdHRlZEtleSIsInBhcmVudFByb3AiLCJwYXJlbnRWYWwiLCJnZXQiLCJzYW5pdGl6ZWQiLCJpc0NvbnRhaW5lciIsImdldE93blBhdGgiLCJwYXRoIiwicGFyZW50Iiwic2xpY2UiLCJuZXh0IiwiX3Jlc3RvcmVSZXZlcnRlZFBhdGgiLCJ3cml0ZURhdGEiLCJ3cml0dGVuIiwiZmluYWxPYmplY3QiLCJmcm9tRmluYWwiLCJhdXRob3JpdGF0aXZlIiwiYW5jZXN0b3IiLCJzb3J0IiwiYSIsImIiLCJhbmNlc3RvclBhdGgiLCJyZXR1cm5lZCIsIm9wIiwibWlzc2luZ0luZGV4IiwidW5jaGFuZ2VkIiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJ0YXJnZXQiLCJvdmVybGFwcyIsInJlc3BvbnNlS2V5IiwiYXBwbGllZFRvRW1wdHkiLCJhbW91bnQiLCJ1bmlxV2l0aCIsIl9zZXRSZXF1ZXN0UGF0aHMiLCJrZXB0IiwiYXJyYXlzIiwiZ2V0RXhwZWN0ZWRUeXBlIiwidHlwZSIsImFkZCIsImZpZWxkIiwiX2NhblJlYWRXcml0dGVuT2JqZWN0IiwiYWNsR3JvdXAiLCJyZWFkZXJzIiwicmVhZGVyIiwib3BlcmF0aW9uIiwicGVybWlzc2lvbnMiLCJwZXJtaXNzaW9uRGVuaWFsIiwidXNlcnMiLCJlbnRyeSIsInRlc3RQb2ludGVyUGVybWlzc2lvbnMiLCJleHBlY3RlZCIsInRhcmdldENsYXNzIiwiaXNzdWVkIiwiZWNob2VkIiwicmVxdWlyZWRDb2x1bW5zIiwic2lnblVwIiwiaXNGaW5hbE9iamVjdCIsInJldmVydGVkRGF0YSIsInJldmVydGVkUGF0aHMiLCJyZXNwb25zZURhdGEiLCJza2lwS2V5cyIsInJlcXVlc3RlZCIsImRhdGFWYWx1ZSIsIl9kZWZhdWx0IiwiZXhwb3J0cyIsIm1vZHVsZSJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBSZXN0V3JpdGUgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcblxuXG5jb25zdCBBdXRoID0gcmVxdWlyZSgnLi9BdXRoJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4vVXRpbHMnKTtcbnZhciBjcnlwdG9VdGlscyA9IHJlcXVpcmUoJy4vY3J5cHRvVXRpbHMnKTtcbnZhciBwYXNzd29yZENyeXB0byA9IHJlcXVpcmUoJy4vcGFzc3dvcmQnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbnZhciB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCB7IGFwcGx5QXV0aERhdGFPcHRpbWlzdGljTG9jayB9IGZyb20gJy4vQXV0aERhdGFMb2NrJztcbmltcG9ydCB7IHJlcXVpcmVkQ29sdW1ucyB9IGZyb20gJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBjcmVhdGVTYW5pdGl6ZWRFcnJvciB9IGZyb20gJy4vRXJyb3InO1xuXG4vLyBPcGVyYXRpb25zIHdob3NlIHJlc3VsdCB0aGUgZGF0YWJhc2UgY29tcHV0ZXMgZnJvbSB0aGUgc3RvcmVkIHZhbHVlXG5jb25zdCBjb21wdXRlZE9wZXJhdGlvbnMgPSBbJ0luY3JlbWVudCcsICdBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZSddO1xuXG4vLyBxdWVyeSBhbmQgZGF0YSBhcmUgYm90aCBwcm92aWRlZCBpbiBSRVNUIEFQSSBmb3JtYXQuIFNvIGRhdGFcbi8vIHR5cGVzIGFyZSBlbmNvZGVkIGJ5IHBsYWluIG9sZCBvYmplY3RzLlxuLy8gSWYgcXVlcnkgaXMgbnVsbCwgdGhpcyBpcyBhIFwiY3JlYXRlXCIgYW5kIHRoZSBkYXRhIGluIGRhdGEgc2hvdWxkIGJlXG4vLyBjcmVhdGVkLlxuLy8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gXCJ1cGRhdGVcIiAtIHRoZSBvYmplY3QgbWF0Y2hpbmcgdGhlIHF1ZXJ5XG4vLyBzaG91bGQgZ2V0IHVwZGF0ZWQgd2l0aCBkYXRhLlxuLy8gUmVzdFdyaXRlIHdpbGwgaGFuZGxlIG9iamVjdElkLCBjcmVhdGVkQXQsIGFuZCB1cGRhdGVkQXQgZm9yXG4vLyBldmVyeXRoaW5nLiBJdCBhbHNvIGtub3dzIHRvIHVzZSB0cmlnZ2VycyBhbmQgc3BlY2lhbCBtb2RpZmljYXRpb25zXG4vLyBmb3IgdGhlIF9Vc2VyIGNsYXNzLlxuZnVuY3Rpb24gUmVzdFdyaXRlKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBxdWVyeSwgZGF0YSwgb3JpZ2luYWxEYXRhLCBjb250ZXh0LCBhY3Rpb24pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICdDYW5ub3QgcGVyZm9ybSBhIHdyaXRlIG9wZXJhdGlvbiB3aGVuIHVzaW5nIHJlYWRPbmx5TWFzdGVyS2V5JyxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gIH1cbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLnN0b3JhZ2UgPSB7fTtcbiAgdGhpcy5ydW5PcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG5cbiAgaWYgKGFjdGlvbikge1xuICAgIHRoaXMucnVuT3B0aW9ucy5hY3Rpb24gPSBhY3Rpb247XG4gIH1cblxuICBpZiAoIXF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgJ29iamVjdElkJykgJiYgIWRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk1JU1NJTkdfT0JKRUNUX0lELFxuICAgICAgICAgICdvYmplY3RJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCBvciB1bmRlZmluZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgICAgaWYgKGRhdGEuaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdpZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gV2hlbiB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlLCB0aGlzLnJlc3BvbnNlIG1heSBoYXZlIHNldmVyYWxcbiAgLy8gZmllbGRzLlxuICAvLyByZXNwb25zZTogdGhlIGFjdHVhbCBkYXRhIHRvIGJlIHJldHVybmVkXG4gIC8vIHN0YXR1czogdGhlIGh0dHAgc3RhdHVzIGNvZGUuIGlmIG5vdCBwcmVzZW50LCB0cmVhdGVkIGxpa2UgYSAyMDBcbiAgLy8gbG9jYXRpb246IHRoZSBsb2NhdGlvbiBoZWFkZXIuIGlmIG5vdCBwcmVzZW50LCBubyBsb2NhdGlvbiBoZWFkZXJcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG5cbiAgLy8gUHJvY2Vzc2luZyB0aGlzIG9wZXJhdGlvbiBtYXkgbXV0YXRlIG91ciBkYXRhLCBzbyB3ZSBvcGVyYXRlIG9uIGFcbiAgLy8gY29weVxuICB0aGlzLnF1ZXJ5ID0gc3RydWN0dXJlZENsb25lKHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gc3RydWN0dXJlZENsb25lKGRhdGEpO1xuICAvLyBUaGUgY2xpZW50J3MgZG90IG5vdGF0aW9uIGtleXMgYW5kIGNvbXB1dGVkIG9wZXJhdGlvbnMsIGJlZm9yZSB0cmlnZ2VycyBjaGFuZ2UgdGhlIGRhdGFcbiAgdGhpcy5yZXF1ZXN0T3BlcmF0aW9ucyA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSlcbiAgICAuZmlsdGVyKGtleSA9PiBrZXkuaW5jbHVkZXMoJy4nKSB8fCBjb21wdXRlZE9wZXJhdGlvbnMuaW5jbHVkZXModGhpcy5kYXRhW2tleV0/Ll9fb3ApKVxuICAgIC5tYXAoa2V5ID0+IFtrZXksIHRoaXMuZGF0YVtrZXldXSk7XG4gIC8vIFdlIG5ldmVyIGNoYW5nZSBvcmlnaW5hbERhdGEsIHNvIHdlIGRvIG5vdCBuZWVkIGEgZGVlcCBjb3B5XG4gIHRoaXMub3JpZ2luYWxEYXRhID0gb3JpZ2luYWxEYXRhO1xuXG4gIC8vIFRoZSB0aW1lc3RhbXAgd2UnbGwgdXNlIGZvciB0aGlzIHdob2xlIG9wZXJhdGlvblxuICB0aGlzLnVwZGF0ZWRBdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkuaXNvO1xuXG4gIC8vIFNoYXJlZCBTY2hlbWFDb250cm9sbGVyIHRvIGJlIHJldXNlZCB0byByZWR1Y2UgdGhlIG51bWJlciBvZiBsb2FkU2NoZW1hKCkgY2FsbHMgcGVyIHJlcXVlc3RcbiAgLy8gT25jZSBzZXQgdGhlIHNjaGVtYURhdGEgc2hvdWxkIGJlIGltbXV0YWJsZVxuICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IG51bGw7XG4gIHRoaXMucGVuZGluZ09wcyA9IHtcbiAgICBvcGVyYXRpb25zOiBudWxsLFxuICAgIGlkZW50aWZpZXI6IG51bGwsXG4gIH07XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgdGhlXG4vLyB3cml0ZSwgaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSB7cmVzcG9uc2UsIHN0YXR1cywgbG9jYXRpb259IG9iamVjdC5cbi8vIHN0YXR1cyBhbmQgbG9jYXRpb24gYXJlIG9wdGlvbmFsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jaGVja0ludGVybmFsRmllbGRzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbnN0YWxsYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVNlc3Npb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmF1dGhvcml6ZVVzZXJVcGRhdGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNoZWNrUmVzdHJpY3RlZEZpZWxkcygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUZpbGVVcmxzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZURvdE5vdGF0aW9uS2V5cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmZpbHRlclVucmVhZGFibGVGaWVsZHNJblJlc3BvbnNlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBBcHBlbmQgdGhlIGF1dGhEYXRhUmVzcG9uc2UgaWYgZXhpc3RzXG4gICAgICBpZiAodGhpcy5hdXRoRGF0YVJlc3BvbnNlKSB7XG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLmF1dGhEYXRhUmVzcG9uc2UgPSB0aGlzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLnN0b3JhZ2UucmVqZWN0U2lnbnVwICYmIHRoaXMuY29uZmlnLnByZXZlbnRTaWdudXBXaXRoVW52ZXJpZmllZEVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gdGhpcy5ydW5PcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzIG5vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBzY2hlbWEuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlU2NoZW1hID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudmFsaWRhdGVPYmplY3QoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdGhpcy5kYXRhLFxuICAgIHRoaXMucXVlcnksXG4gICAgdGhpcy5ydW5PcHRpb25zLFxuICAgIHRoaXMuYXV0aC5pc01haW50ZW5hbmNlXG4gICk7XG59O1xuXG4vLyBSZXNvbHZlcyB0aGUgVVJMcyBvZiBmaWxlIHBvaW50ZXJzIGluIHRoZSBkYXRhIHRoYXQgaGF2ZSBubyBVUkwsIHNvIHRoYXQgdGhlXG4vLyBQYXJzZSBvYmplY3RzIGJ1aWx0IGZvciB0cmlnZ2VycyBhbmQgTGl2ZVF1ZXJ5IGNhbiBiZSBlbmNvZGVkLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5yZXNvbHZlRmlsZVVybHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGZpbGVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgY29uc3QgY29sbGVjdCA9IHZhbHVlID0+IHtcbiAgICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICBpZiAodHlwZW9mIHZhbHVlLm5hbWUgIT09ICdzdHJpbmcnIHx8IHZhbHVlLm5hbWUgPT09ICcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgJ1RoaXMgaXMgbm90IGEgdmFsaWQgRmlsZScpO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWx1ZS51cmwpIHtcbiAgICAgICAgZmlsZXNbdmFsdWUubmFtZV0gPSB7IF9fdHlwZTogJ0ZpbGUnLCBuYW1lOiB2YWx1ZS5uYW1lIH07XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIE9iamVjdC52YWx1ZXModmFsdWUpLmZvckVhY2goY29sbGVjdCk7XG4gIH07XG4gIGNvbGxlY3QodGhpcy5kYXRhKTtcbiAgaWYgKE9iamVjdC5rZXlzKGZpbGVzKS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIGZpbGVzKTtcbiAgdGhpcy5maWxlVXJscyA9IE9iamVjdC5hc3NpZ24odGhpcy5maWxlVXJscyB8fCBPYmplY3QuY3JlYXRlKG51bGwpLCBmaWxlcyk7XG59O1xuXG4vLyBSZXR1cm5zIGEgY29weSBvZiB0aGUgZGF0YSB3aXRoIHRoZSByZXNvbHZlZCBVUkxzIGFkZGVkIHRvIGZpbGUgcG9pbnRlcnMuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsb25lV2l0aEZpbGVVcmxzID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICBjb25zdCBkYXRhID0gc3RydWN0dXJlZENsb25lKG9iamVjdCk7XG4gIGlmICghdGhpcy5maWxlVXJscykge1xuICAgIHJldHVybiBkYXRhO1xuICB9XG4gIGNvbnN0IGFkZFVybHMgPSB2YWx1ZSA9PiB7XG4gICAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgY29uc3QgZmlsZSA9IHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJiB0aGlzLmZpbGVVcmxzW3ZhbHVlLm5hbWVdO1xuICAgICAgaWYgKCF2YWx1ZS51cmwgJiYgZmlsZSkge1xuICAgICAgICB2YWx1ZS51cmwgPSBmaWxlLnVybDtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgT2JqZWN0LnZhbHVlcyh2YWx1ZSkuZm9yRWFjaChhZGRVcmxzKTtcbiAgfTtcbiAgYWRkVXJscyhkYXRhKTtcbiAgcmV0dXJuIGRhdGE7XG59O1xuXG4vLyBSdW5zIGFueSBiZWZvcmVTYXZlIHRyaWdnZXJzIGFnYWluc3QgdGhpcyBvcGVyYXRpb24uXG4vLyBBbnkgY2hhbmdlIGxlYWRzIHRvIG91ciBkYXRhIGJlaW5nIG11dGF0ZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLnJ1bk9wdGlvbnMubWFueSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZVNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCBpZGVudGlmaWVyID0gdXBkYXRlZE9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyhpZGVudGlmaWVyKTtcbiAgdGhpcy5wZW5kaW5nT3BzID0ge1xuICAgIG9wZXJhdGlvbnM6IHsgLi4ucGVuZGluZyB9LFxuICAgIGlkZW50aWZpZXIsXG4gIH07XG5cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQmVmb3JlIGNhbGxpbmcgdGhlIHRyaWdnZXIsIHZhbGlkYXRlIHRoZSBwZXJtaXNzaW9ucyBmb3IgdGhlIHNhdmUgb3BlcmF0aW9uXG4gICAgICBsZXQgZGF0YWJhc2VQcm9taXNlID0gbnVsbDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciB1cGRhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIGNyZWF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLmNyZWF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEluIHRoZSBjYXNlIHRoYXQgdGhlcmUgaXMgbm8gcGVybWlzc2lvbiBmb3IgdGhlIG9wZXJhdGlvbiwgaXQgdGhyb3dzIGFuIGVycm9yXG4gICAgICByZXR1cm4gZGF0YWJhc2VQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0Lmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIHRoaXMuYXV0aCxcbiAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gXy5yZWR1Y2UoXG4gICAgICAgICAgcmVzcG9uc2Uub2JqZWN0LFxuICAgICAgICAgIChyZXN1bHQsIHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZGF0YVtrZXldLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRhdGEgPSByZXNwb25zZS5vYmplY3Q7XG4gICAgICAgIC8vIFdlIHNob3VsZCBkZWxldGUgdGhlIG9iamVjdElkIGZvciBhbiB1cGRhdGUgd3JpdGVcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKHRoaXMuY29uZmlnLCB0aGlzLmRhdGEpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKTtcbiAgICAgIH1cbiAgICAgIHRoaXMudmFsaWRhdGVEb3ROb3RhdGlvbktleXMoKTtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgLy8gVGhlIHRyaWdnZXIgbWF5IGhhdmUgc2V0IGZpbGUgcG9pbnRlcnMgd2l0aG91dCBVUkxcbiAgICAgICAgcmV0dXJuIHRoaXMucmVzb2x2ZUZpbGVVcmxzKCk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlciA9IGFzeW5jIGZ1bmN0aW9uICh1c2VyRGF0YSkge1xuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVMb2dpbicgdHJpZ2dlclxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG5cbiAgLy8gRXhwYW5kIGZpbGUgb2JqZWN0c1xuICBhd2FpdCB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdXNlckRhdGEpO1xuXG4gIGNvbnN0IHVzZXIgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdXNlckRhdGEpO1xuXG4gIC8vIG5vIG5lZWQgdG8gcmV0dXJuIGEgcmVzcG9uc2VcbiAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLFxuICAgIHRoaXMuYXV0aCxcbiAgICB1c2VyLFxuICAgIG51bGwsXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5jb250ZXh0XG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmRhdGEpIHtcbiAgICByZXR1cm4gdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsQ2xhc3NlcyA9PiB7XG4gICAgICBjb25zdCBzY2hlbWEgPSBhbGxDbGFzc2VzLmZpbmQob25lQ2xhc3MgPT4gb25lQ2xhc3MuY2xhc3NOYW1lID09PSB0aGlzLmNsYXNzTmFtZSk7XG4gICAgICBjb25zdCBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQgPSAoZmllbGROYW1lLCBzZXREZWZhdWx0KSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IG51bGwgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJycgfHxcbiAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgc2V0RGVmYXVsdCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSBudWxsICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgICh0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHwgW107XG4gICAgICAgICAgICBpZiAodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnJlcXVpcmVkID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgYCR7ZmllbGROYW1lfSBpcyByZXF1aXJlZGApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gYWRkIGRlZmF1bHQgQUNMXG4gICAgICBpZiAoXG4gICAgICAgIHNjaGVtYT8uY2xhc3NMZXZlbFBlcm1pc3Npb25zPy5BQ0wgJiZcbiAgICAgICAgIXRoaXMuZGF0YS5BQ0wgJiZcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5BQ0wpICE9PVxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHsgJyonOiB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH0gfSlcbiAgICAgICkge1xuICAgICAgICBjb25zdCBhY2wgPSBzdHJ1Y3R1cmVkQ2xvbmUoc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5BQ0wpO1xuICAgICAgICBpZiAoYWNsLmN1cnJlbnRVc2VyKSB7XG4gICAgICAgICAgaWYgKHRoaXMuYXV0aC51c2VyPy5pZCkge1xuICAgICAgICAgICAgYWNsW3RoaXMuYXV0aC51c2VyPy5pZF0gPSBzdHJ1Y3R1cmVkQ2xvbmUoYWNsLmN1cnJlbnRVc2VyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZGVsZXRlIGFjbC5jdXJyZW50VXNlcjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmRhdGEuQUNMID0gYWNsO1xuICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdO1xuICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKCdBQ0wnKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIGRlZmF1bHQgZmllbGRzXG4gICAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gYWxsb3cgY3VzdG9taXppbmcgY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQgd2hlbiB1c2luZyBtYWludGVuYW5jZSBrZXlcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuYXV0aC5pc01haW50ZW5hbmNlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdCAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQuX190eXBlID09PSAnRGF0ZSdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdCA9IHRoaXMuZGF0YS5jcmVhdGVkQXQuaXNvO1xuXG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS51cGRhdGVkQXQgJiYgdGhpcy5kYXRhLnVwZGF0ZWRBdC5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICAgICAgY29uc3QgY3JlYXRlZEF0ID0gbmV3IERhdGUodGhpcy5kYXRhLmNyZWF0ZWRBdCk7XG4gICAgICAgICAgICBjb25zdCB1cGRhdGVkQXQgPSBuZXcgRGF0ZSh0aGlzLmRhdGEudXBkYXRlZEF0Lmlzbyk7XG5cbiAgICAgICAgICAgIGlmICh1cGRhdGVkQXQgPCBjcmVhdGVkQXQpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgJ3VwZGF0ZWRBdCBjYW5ub3Qgb2NjdXIgYmVmb3JlIGNyZWF0ZWRBdCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMuZGF0YS51cGRhdGVkQXQuaXNvO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBpZiBubyB1cGRhdGVkQXQgaXMgcHJvdmlkZWQsIHNldCBpdCB0byBjcmVhdGVkQXQgdG8gbWF0Y2ggZGVmYXVsdCBiZWhhdmlvclxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuZGF0YS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBPbmx5IGFzc2lnbiBuZXcgb2JqZWN0SWQgaWYgd2UgYXJlIGNyZWF0aW5nIG5ldyBvYmplY3RcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSBjcnlwdG9VdGlscy5uZXdPYmplY3RJZCh0aGlzLmNvbmZpZy5vYmplY3RJZFNpemUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCB0cnVlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzY2hlbWEpIHtcbiAgICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuXG4gICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuLy8gVHJhbnNmb3JtcyBhdXRoIGRhdGEgZm9yIGEgdXNlciBvYmplY3QuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhIHVzZXIgb2JqZWN0LlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhdXRoRGF0YSA9IHRoaXMuZGF0YS5hdXRoRGF0YTtcbiAgY29uc3QgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCA9XG4gICAgdHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gJ3N0cmluZyc7XG4gIGNvbnN0IGhhc0F1dGhEYXRhID1cbiAgICBhdXRoRGF0YSAmJlxuICAgIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5zb21lKHByb3ZpZGVyID0+IHtcbiAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIHJldHVybiBwcm92aWRlckRhdGEgJiYgdHlwZW9mIHByb3ZpZGVyRGF0YSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXMocHJvdmlkZXJEYXRhKS5sZW5ndGg7XG4gICAgfSk7XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICFoYXNBdXRoRGF0YSkge1xuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnVzZXJuYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICdiYWQgb3IgbWlzc2luZyB1c2VybmFtZScpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS5wYXNzd29yZCkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpKSB7XG4gICAgLy8gTm90aGluZyB0byB2YWxpZGF0ZSBoZXJlXG4gICAgcmV0dXJuO1xuICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICAvLyBIYW5kbGUgc2F2aW5nIGF1dGhEYXRhIHRvIG51bGxcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICApO1xuICB9XG5cbiAgdmFyIHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgaWYgKCFwcm92aWRlcnMubGVuZ3RoKSB7XG4gICAgLy8gRW1wdHkgYXV0aERhdGEgb2JqZWN0LCBub3RoaW5nIHRvIHZhbGlkYXRlXG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGNvbnN0IHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl0gfHwge307XG4gICAgcmV0dXJuICEhT2JqZWN0LmtleXMocHJvdmlkZXJBdXRoRGF0YSkubGVuZ3RoO1xuICB9KTtcbiAgaWYgKGNhbkhhbmRsZUF1dGhEYXRhIHx8IGhhc1VzZXJuYW1lQW5kUGFzc3dvcmQgfHwgdGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuZ2V0VXNlcklkKCkpIHtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YShhdXRoRGF0YSk7XG4gIH1cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmlsdGVyZWRPYmplY3RzQnlBQ0wgPSBmdW5jdGlvbiAob2JqZWN0cykge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIG9iamVjdHM7XG4gIH1cbiAgcmV0dXJuIG9iamVjdHMuZmlsdGVyKG9iamVjdCA9PiB7XG4gICAgaWYgKCFvYmplY3QuQUNMKSB7XG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gbGVnYWN5IHVzZXJzIHRoYXQgaGF2ZSBubyBBQ0wgZmllbGQgb24gdGhlbVxuICAgIH1cbiAgICAvLyBSZWd1bGFyIHVzZXJzIHRoYXQgaGF2ZSBiZWVuIGxvY2tlZCBvdXQuXG4gICAgcmV0dXJuIG9iamVjdC5BQ0wgJiYgT2JqZWN0LmtleXMob2JqZWN0LkFDTCkubGVuZ3RoID4gMDtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJJZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHJldHVybiB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9IGVsc2UgaWYgKHRoaXMuYXV0aCAmJiB0aGlzLmF1dGgudXNlciAmJiB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgIHJldHVybiB0aGlzLmF1dGgudXNlci5pZDtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdGhyb3dJZkF1dGhEYXRhRHVwbGljYXRlID0gZnVuY3Rpb24gKGVycm9yKSB7XG4gIGlmIChcbiAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgIGVycm9yPy5jb2RlID09PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUgJiZcbiAgICBlcnJvci51c2VySW5mbz8uZHVwbGljYXRlZF9maWVsZD8uc3RhcnRzV2l0aCgnX2F1dGhfZGF0YV8nKVxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxufTtcblxuLy8gRGV2ZWxvcGVycyBhcmUgYWxsb3dlZCB0byBjaGFuZ2UgYXV0aERhdGEgdmlhIGJlZm9yZSBzYXZlIHRyaWdnZXJcbi8vIHdlIG5lZWQgYWZ0ZXIgYmVmb3JlIHNhdmUgdG8gZW5zdXJlIHRoYXQgdGhlIGRldmVsb3BlclxuLy8gaXMgbm90IGN1cnJlbnRseSBkdXBsaWNhdGluZyBhdXRoIGRhdGEgSURcblJlc3RXcml0ZS5wcm90b3R5cGUuZW5zdXJlVW5pcXVlQXV0aERhdGFJZCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8ICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBoYXNBdXRoRGF0YUlkID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5zb21lKFxuICAgIGtleSA9PiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XSAmJiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XS5pZFxuICApO1xuXG4gIGlmICghaGFzQXV0aERhdGFJZCkgeyByZXR1cm47IH1cblxuICBjb25zdCByID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEodGhpcy5jb25maWcsIHRoaXMuZGF0YS5hdXRoRGF0YSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbiAgLy8gdXNlIGRhdGEub2JqZWN0SWQgaW4gY2FzZSBvZiBsb2dpbiB0aW1lIGFuZCBmb3VuZCB1c2VyIGR1cmluZyBoYW5kbGUgdmFsaWRhdGVBdXRoRGF0YVxuICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpIHx8IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxICYmIHVzZXJJZCAhPT0gcmVzdWx0c1swXS5vYmplY3RJZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUF1dGhEYXRhID0gYXN5bmMgZnVuY3Rpb24gKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgYXV0aERhdGEsIHRydWUpO1xuICBjb25zdCByZXN1bHRzID0gdGhpcy5maWx0ZXJlZE9iamVjdHNCeUFDTChyKTtcblxuICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpO1xuICBjb25zdCB1c2VyUmVzdWx0ID0gcmVzdWx0c1swXTtcbiAgY29uc3QgZm91bmRVc2VySXNOb3RDdXJyZW50VXNlciA9IHVzZXJJZCAmJiB1c2VyUmVzdWx0ICYmIHVzZXJJZCAhPT0gdXNlclJlc3VsdC5vYmplY3RJZDtcblxuICBpZiAocmVzdWx0cy5sZW5ndGggPiAxIHx8IGZvdW5kVXNlcklzTm90Q3VycmVudFVzZXIpIHtcbiAgICAvLyBUbyBhdm9pZCBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9zZWN1cml0eS9hZHZpc29yaWVzL0dIU0EtOHczai1nOTgzLThqaDVcbiAgICAvLyBMZXQncyBydW4gc29tZSB2YWxpZGF0aW9uIGJlZm9yZSB0aHJvd2luZ1xuICAgIGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhLCB0aGlzLCB1c2VyUmVzdWx0KTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuXG4gIC8vIE5vIHVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YSB3ZSBuZWVkIHRvIHZhbGlkYXRlXG4gIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICBjb25zdCB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHRoaXNcbiAgICApO1xuICAgIHRoaXMuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgLy8gUmVwbGFjZSBjdXJyZW50IGF1dGhEYXRhIGJ5IHRoZSBuZXcgdmFsaWRhdGVkIG9uZVxuICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YVxuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEpIHtcbiAgICB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmpvaW4oJywnKTtcblxuICAgIGNvbnN0IHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfSA9IEF1dGguaGFzTXV0YXRlZEF1dGhEYXRhKFxuICAgICAgYXV0aERhdGEsXG4gICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhXG4gICAgKTtcblxuICAgIGNvbnN0IGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciA9XG4gICAgICAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkID09PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB8fFxuICAgICAgdGhpcy5hdXRoLmlzTWFzdGVyO1xuXG4gICAgY29uc3QgaXNMb2dpbiA9ICF1c2VySWQ7XG5cbiAgICBpZiAoaXNMb2dpbiB8fCBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIpIHtcbiAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAvLyBPUiB0aGUgdXNlciBtYWtpbmcgdGhlIGNhbGwgaXMgdGhlIHJpZ2h0IG9uZVxuICAgICAgLy8gTG9naW4gd2l0aCBhdXRoIGRhdGFcbiAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAvLyBuZWVkIHRvIHNldCB0aGUgb2JqZWN0SWQgZmlyc3Qgb3RoZXJ3aXNlIGxvY2F0aW9uIGhhcyB0cmFpbGluZyB1bmRlZmluZWRcbiAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgICAgIGlmICghdGhpcy5xdWVyeSB8fCAhdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgIHJlc3BvbnNlOiB1c2VyUmVzdWx0LFxuICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgIH07XG4gICAgICAgIC8vIFJ1biBiZWZvcmVMb2dpbiBob29rIGJlZm9yZSBzdG9yaW5nIGFueSB1cGRhdGVzXG4gICAgICAgIC8vIHRvIGF1dGhEYXRhIG9uIHRoZSBkYjsgY2hhbmdlcyB0byB1c2VyUmVzdWx0XG4gICAgICAgIC8vIHdpbGwgYmUgaWdub3JlZC5cbiAgICAgICAgYXdhaXQgdGhpcy5ydW5CZWZvcmVMb2dpblRyaWdnZXIoc3RydWN0dXJlZENsb25lKHVzZXJSZXN1bHQpKTtcblxuICAgICAgICAvLyBJZiB3ZSBhcmUgaW4gbG9naW4gb3BlcmF0aW9uIHZpYSBhdXRoRGF0YVxuICAgICAgICAvLyB3ZSBuZWVkIHRvIGJlIHN1cmUgdGhhdCB0aGUgdXNlciBoYXMgcHJvdmlkZWRcbiAgICAgICAgLy8gcmVxdWlyZWQgYXV0aERhdGFcbiAgICAgICAgQXV0aC5jaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luKFxuICAgICAgICAgIHsgY29uZmlnOiB0aGlzLmNvbmZpZywgYXV0aDogdGhpcy5hdXRoIH0sXG4gICAgICAgICAgYXV0aERhdGEsXG4gICAgICAgICAgdXNlclJlc3VsdC5hdXRoRGF0YSxcbiAgICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICAvLyBQcmV2ZW50IHZhbGlkYXRpbmcgaWYgbm8gbXV0YXRlZCBkYXRhIGRldGVjdGVkIG9uIHVwZGF0ZVxuICAgICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEgJiYgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gQWx3YXlzIHZhbGlkYXRlIGFsbCBwcm92aWRlZCBhdXRoRGF0YSBvbiBsb2dpbiB0byBwcmV2ZW50IGF1dGhlbnRpY2F0aW9uXG4gICAgICAvLyBieXBhc3MgdmlhIHBhcnRpYWwgYXV0aERhdGEgKGUuZy4gc2VuZGluZyBvbmx5IHRoZSBwcm92aWRlciBJRCB3aXRob3V0XG4gICAgICAvLyBhbiBhY2Nlc3MgdG9rZW4pOyBvbiB1cGRhdGUgb25seSB2YWxpZGF0ZSBtdXRhdGVkIG9uZXNcbiAgICAgIGlmIChpc0xvZ2luIHx8IGhhc011dGF0ZWRBdXRoRGF0YSB8fCAhdGhpcy5jb25maWcuYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbikge1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgICBpc0xvZ2luID8gYXV0aERhdGEgOiBtdXRhdGVkQXV0aERhdGEsXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICB1c2VyUmVzdWx0XG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICAgICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIENhcHR1cmUgb3JpZ2luYWwgYXV0aERhdGEgYmVmb3JlIG11dGF0aW5nIHVzZXJSZXN1bHQgdmlhIHRoZSByZXNwb25zZSByZWZlcmVuY2VcbiAgICAgIGNvbnN0IG9yaWdpbmFsQXV0aERhdGEgPSB1c2VyUmVzdWx0Py5hdXRoRGF0YVxuICAgICAgICA/IE9iamVjdC5mcm9tRW50cmllcyhcbiAgICAgICAgICBPYmplY3QuZW50cmllcyh1c2VyUmVzdWx0LmF1dGhEYXRhKS5tYXAoKFtrLCB2XSkgPT5cbiAgICAgICAgICAgIFtrLCB2ICYmIHR5cGVvZiB2ID09PSAnb2JqZWN0JyA/IHsgLi4udiB9IDogdl1cbiAgICAgICAgICApXG4gICAgICAgIClcbiAgICAgICAgOiB1bmRlZmluZWQ7XG5cbiAgICAgIC8vIElGIHdlIGFyZSBpbiBsb2dpbiB3ZSdsbCBza2lwIHRoZSBkYXRhYmFzZSBvcGVyYXRpb24gLyBiZWZvcmVTYXZlIC8gYWZ0ZXJTYXZlIGV0Yy4uLlxuICAgICAgLy8gd2UgbmVlZCB0byBzZXQgaXQgdXAgdGhlcmUuXG4gICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgLy8gSWYgd2UncmUgbm90IGxvZ2dpbmcgaW4sIGJ1dCBqdXN0IHVwZGF0aW5nIHRoZSBjdXJyZW50IHVzZXIsIHdlIGNhbiBzYWZlbHkgc2tpcCB0aGF0IHBhcnRcbiAgICAgIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgICAgIC8vIEFzc2lnbiB0aGUgbmV3IGF1dGhEYXRhIGluIHRoZSByZXNwb25zZVxuICAgICAgICBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFbcHJvdmlkZXJdID0gbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gUnVuIHRoZSBEQiB1cGRhdGUgZGlyZWN0bHksIGFzICdtYXN0ZXInIG9ubHkgaWYgYXV0aERhdGEgY29udGFpbnMgc29tZSBrZXlzXG4gICAgICAgIC8vIGF1dGhEYXRhIGNvdWxkIG5vdCBjb250YWlucyBrZXlzIGFmdGVyIHZhbGlkYXRpb24gaWYgdGhlIGF1dGhBZGFwdGVyXG4gICAgICAgIC8vIHVzZXMgdGhlIGBkb05vdFNhdmVgIG9wdGlvbi4gSnVzdCB1cGRhdGUgdGhlIGF1dGhEYXRhIHBhcnRcbiAgICAgICAgLy8gVGhlbiB3ZSdyZSBnb29kIGZvciB0aGUgdXNlciwgZWFybHkgZXhpdCBvZiBzb3J0c1xuICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBxdWVyeSA9IHsgb2JqZWN0SWQ6IHRoaXMuZGF0YS5vYmplY3RJZCB9O1xuICAgICAgICAgIC8vIE9wdGltaXN0aWMgbG9ja2luZzogaW5jbHVkZSBlYWNoIGNoYW5nZWQgb3JpZ2luYWwgZmllbGQgaW4gdGhlIFdIRVJFIGNsYXVzZVxuICAgICAgICAgIC8vIGZvciBwcm92aWRlcnMgd2hvc2UgZGF0YSBpcyBiZWluZyB1cGRhdGVkLiBUaGlzIHByZXZlbnRzIGNvbmN1cnJlbnQgcmVxdWVzdHNcbiAgICAgICAgICAvLyBmcm9tIGJvdGggc3VjY2VlZGluZyB3aGVuIGNvbnN1bWluZyBzaW5nbGUtdXNlIHRva2VucyAoZS5nLiBNRkEgcmVjb3ZlcnkgY29kZXNcbiAgICAgICAgICAvLyBhcyBhcnJheXMsIG9yIE1GQSBTTVMgT1RQIHRva2VucyBhcyBzdHJpbmdzKS5cbiAgICAgICAgICBhcHBseUF1dGhEYXRhT3B0aW1pc3RpY0xvY2socXVlcnksIG9yaWdpbmFsQXV0aERhdGEsIHRoaXMuZGF0YS5hdXRoRGF0YSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB7IGF1dGhEYXRhOiB0aGlzLmRhdGEuYXV0aERhdGEgfSxcbiAgICAgICAgICAgICAge31cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELCAnSW52YWxpZCBhdXRoIGRhdGEnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX3Rocm93SWZBdXRoRGF0YUR1cGxpY2F0ZShlcnJvcik7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmRhdGEuYXV0aERhdGEgJiYgT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgICAgLy8gVVBEQVRFIHBhdGggKGUuZy4gUFVUIC91c2Vycy86aWQgZHVyaW5nIGxpbmtlZC1wcm92aWRlciByZS1hdXRoKTogYXBwbHlcbiAgICAgICAgLy8gdGhlIHNhbWUgb3B0aW1pc3RpYyBsb2NrIHRvIHRoZSBzdWJzZXF1ZW50IHJ1bkRhdGFiYXNlT3BlcmF0aW9uIHVwZGF0ZSBzb1xuICAgICAgICAvLyBjb25jdXJyZW50IHNpbmdsZS11c2UgdG9rZW4gY29uc3VtZXJzIGNhbm5vdCBib3RoIHN1Y2NlZWQuXG4gICAgICAgIGFwcGx5QXV0aERhdGFPcHRpbWlzdGljTG9jayh0aGlzLnF1ZXJ5LCBvcmlnaW5hbEF1dGhEYXRhLCB0aGlzLmRhdGEuYXV0aERhdGEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gUmVqZWN0cyBpbnRlcm5hbCBmaWVsZHMgaW4gY2xpZW50LXN1cHBsaWVkIGRhdGFcblJlc3RXcml0ZS5wcm90b3R5cGUuY2hlY2tJbnRlcm5hbEZpZWxkcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB0aGlzLmRhdGEpIHtcbiAgICBpZiAoZmllbGROYW1lLmNoYXJBdCgwKSA9PT0gJ18nKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmApO1xuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jaGVja1Jlc3RyaWN0ZWRGaWVsZHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAnZW1haWxWZXJpZmllZCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgXCJDbGllbnRzIGFyZW4ndCBhbGxvd2VkIHRvIG1hbnVhbGx5IHVwZGF0ZSBlbWFpbCB2ZXJpZmljYXRpb24uXCIsXG4gICAgICB0aGlzLmNvbmZpZ1xuICAgICk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGUgY3JlYXRlIG9yIHVwZGF0ZSBjbGFzcy1sZXZlbCBwZXJtaXNzaW9uIGJlZm9yZSBzY2hlbWEgdmFsaWRhdGlvblxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZVdyaXRlUGVybWlzc2lvbiA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzY2hlbWFDb250cm9sbGVyID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSgpO1xuICBhd2FpdCBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLnJ1bk9wdGlvbnMuYWNsIHx8IFtdLFxuICAgIHRoaXMucXVlcnkgPyAndXBkYXRlJyA6ICdjcmVhdGUnXG4gICk7XG59O1xuXG4vLyBBdXRob3JpemUgYSBfVXNlciB1cGRhdGUgYmVmb3JlIGFueSBzdGVwIHJlYWRzIHRoZSB0YXJnZXQgYWNjb3VudFxuUmVzdFdyaXRlLnByb3RvdHlwZS5hdXRob3JpemVVc2VyVXBkYXRlID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgIXRoaXMucXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKCkpIHtcbiAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORyxcbiAgICAgIGBDYW5ub3QgbW9kaWZ5IHVzZXIgJHt0aGlzLnF1ZXJ5Lm9iamVjdElkfS5gLFxuICAgICAgdGhpcy5jb25maWdcbiAgICApO1xuICB9XG4gIC8vIEJvZHkgb2JqZWN0SWQgbXVzdCBub3QgcmV0YXJnZXQgdGhlIHVwZGF0ZVxuICBpZiAodGhpcy5kYXRhLm9iamVjdElkICE9PSB1bmRlZmluZWQgJiYgdGhpcy5kYXRhLm9iamVjdElkICE9PSB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICB9XG4gIC8vIE93bmVyIHVwZGF0ZSByZWFkcyBvbmx5IG93biBkYXRhOyB0aGUgd3JpdGUgc3RheXMgQUNMLWNoZWNrZWRcbiAgaWYgKHRoaXMuYXV0aC51c2VyLmlkID09PSB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIFdyaXRlIGFjY2VzcyBjaGVjayB2aWEgdGhlIHdyaXRlLXBhdGggQUNMIGVuZm9yY2VtZW50XG4gIGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB7IG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkIH0sXG4gICAge30sXG4gICAgdGhpcy5ydW5PcHRpb25zLFxuICAgIGZhbHNlLFxuICAgIHRydWVcbiAgKTtcbn07XG5cbi8vIFRoZSBub24tdGhpcmQtcGFydHkgcGFydHMgb2YgVXNlciB0cmFuc2Zvcm1hdGlvblxuUmVzdFdyaXRlLnByb3RvdHlwZS50cmFuc2Zvcm1Vc2VyID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIERvIG5vdCBjbGVhbnVwIHNlc3Npb24gaWYgb2JqZWN0SWQgaXMgbm90IHNldFxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLm9iamVjdElkKCkpIHtcbiAgICAvLyBJZiB3ZSdyZSB1cGRhdGluZyBhIF9Vc2VyIG9iamVjdCwgd2UgbmVlZCB0byBjbGVhciBvdXQgdGhlIGNhY2hlIGZvciB0aGF0IHVzZXIuIEZpbmQgYWxsIHRoZWlyXG4gICAgLy8gc2Vzc2lvbiB0b2tlbnMsIGFuZCByZW1vdmUgdGhlbSBmcm9tIHRoZSBjYWNoZS5cbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBhdXRoOiBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIHJlc3RXaGVyZToge1xuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHByb21pc2UgPSBxdWVyeS5leGVjdXRlKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMucmVzdWx0cy5mb3JFYWNoKHNlc3Npb24gPT5cbiAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gVHJhbnNmb3JtIHRoZSBwYXNzd29yZFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIGlnbm9yZSBvbmx5IGlmIHVuZGVmaW5lZC4gc2hvdWxkIHByb2NlZWQgaWYgZW1wdHkgKCcnKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddID0gdHJ1ZTtcbiAgICAgICAgLy8gR2VuZXJhdGUgYSBuZXcgc2Vzc2lvbiBvbmx5IGlmIHRoZSB1c2VyIHJlcXVlc3RlZFxuICAgICAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICAgICAgICB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uaGFzaCh0aGlzLmRhdGEucGFzc3dvcmQpLnRoZW4oaGFzaGVkUGFzc3dvcmQgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkID0gaGFzaGVkUGFzc3dvcmQ7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVVzZXJOYW1lKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVFbWFpbCgpO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVVc2VyTmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgZm9yIHVzZXJuYW1lIHVuaXF1ZW5lc3NcbiAgaWYgKCF0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgIHRoaXMuZGF0YS51c2VybmFtZSA9IGNyeXB0b1V0aWxzLnJhbmRvbVN0cmluZygyNSk7XG4gICAgICB0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8qXG4gICAgVXNlcm5hbWVzIHNob3VsZCBiZSB1bmlxdWUgd2hlbiBjb21wYXJlZCBjYXNlIGluc2Vuc2l0aXZlbHlcblxuICAgIFVzZXJzIHNob3VsZCBiZSBhYmxlIHRvIG1ha2UgY2FzZSBzZW5zaXRpdmUgdXNlcm5hbWVzIGFuZFxuICAgIGxvZ2luIHVzaW5nIHRoZSBjYXNlIHRoZXkgZW50ZXJlZC4gIEkuZS4gJ1Nub29weScgc2hvdWxkIHByZWNsdWRlXG4gICAgJ3Nub29weScgYXMgYSB2YWxpZCB1c2VybmFtZS5cbiAgKi9cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfSk7XG59O1xuXG4vKlxuICBBcyB3aXRoIHVzZXJuYW1lcywgUGFyc2Ugc2hvdWxkIG5vdCBhbGxvdyBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgb2YgZW1haWwuXG4gIHVubGlrZSB3aXRoIHVzZXJuYW1lcyAod2hpY2ggY2FuIGhhdmUgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIGluIHRoZSBjYXNlIG9mXG4gIGF1dGggYWRhcHRlcnMpLCBlbWFpbHMgc2hvdWxkIG5ldmVyIGhhdmUgYSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbi5cblxuICBUaGlzIGJlaGF2aW9yIGNhbiBiZSBlbmZvcmNlZCB0aHJvdWdoIGEgcHJvcGVybHkgY29uZmlndXJlZCBpbmRleCBzZWU6XG4gIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9pbmRleC1jYXNlLWluc2Vuc2l0aXZlLyNjcmVhdGUtYS1jYXNlLWluc2Vuc2l0aXZlLWluZGV4XG4gIHdoaWNoIGNvdWxkIGJlIGltcGxlbWVudGVkIGluc3RlYWQgb2YgdGhpcyBjb2RlIGJhc2VkIHZhbGlkYXRpb24uXG5cbiAgR2l2ZW4gdGhhdCB0aGlzIGxvb2t1cCBzaG91bGQgYmUgYSByZWxhdGl2ZWx5IGxvdyB1c2UgY2FzZSBhbmQgdGhhdCB0aGUgY2FzZSBzZW5zaXRpdmVcbiAgdW5pcXVlIGluZGV4IHdpbGwgYmUgdXNlZCBieSB0aGUgZGIgZm9yIHRoZSBxdWVyeSwgdGhpcyBpcyBhbiBhZGVxdWF0ZSBzb2x1dGlvbi5cbiovXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZUVtYWlsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZGF0YS5lbWFpbCB8fCB0aGlzLmRhdGEuZW1haWwuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVmFsaWRhdGUgYmFzaWMgZW1haWwgYWRkcmVzcyBmb3JtYXQgaW4gbGluZWFyIHRpbWVcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwubWF0Y2goL14uW15AXFxuXFxyXFx1MjAyOFxcdTIwMjldKkAuKyQvKSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsICdFbWFpbCBhZGRyZXNzIGZvcm1hdCBpcyBpbnZhbGlkLicpXG4gICAgKTtcbiAgfVxuICAvLyBDYXNlIGluc2Vuc2l0aXZlIG1hdGNoLCBzZWUgbm90ZSBhYm92ZSBmdW5jdGlvbi5cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgIXRoaXMuZGF0YS5hdXRoRGF0YSB8fFxuICAgICAgICAhT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggfHxcbiAgICAgICAgKE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoID09PSAxICYmXG4gICAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKVswXSA9PT0gJ2Fub255bW91cycpXG4gICAgICApIHtcbiAgICAgICAgLy8gV2UgdXBkYXRlZCB0aGUgZW1haWwsIHNlbmQgYSBuZXcgdmFsaWRhdGlvblxuICAgICAgICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gICAgICAgIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICAgIG9iamVjdDogdXBkYXRlZE9iamVjdCxcbiAgICAgICAgICBtYXN0ZXI6IHRoaXMuYXV0aC5pc01hc3RlcixcbiAgICAgICAgICBpcDogdGhpcy5jb25maWcuaXAsXG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNldEVtYWlsVmVyaWZ5VG9rZW4odGhpcy5kYXRhLCByZXF1ZXN0LCB0aGlzLnN0b3JhZ2UpO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH1cbiAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMoKS50aGVuKCgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkoKTtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayBpZiB0aGUgcGFzc3dvcmQgY29uZm9ybXMgdG8gdGhlIGRlZmluZWQgcGFzc3dvcmQgcG9saWN5IGlmIGNvbmZpZ3VyZWRcbiAgLy8gSWYgd2Ugc3BlY2lmaWVkIGEgY3VzdG9tIGVycm9yIGluIG91ciBjb25maWd1cmF0aW9uIHVzZSBpdC5cbiAgLy8gRXhhbXBsZTogXCJQYXNzd29yZHMgbXVzdCBpbmNsdWRlIGEgQ2FwaXRhbCBMZXR0ZXIsIExvd2VyY2FzZSBMZXR0ZXIsIGFuZCBhIG51bWJlci5cIlxuICAvL1xuICAvLyBUaGlzIGlzIGVzcGVjaWFsbHkgdXNlZnVsIG9uIHRoZSBnZW5lcmljIFwicGFzc3dvcmQgcmVzZXRcIiBwYWdlLFxuICAvLyBhcyBpdCBhbGxvd3MgdGhlIHByb2dyYW1tZXIgdG8gY29tbXVuaWNhdGUgc3BlY2lmaWMgcmVxdWlyZW1lbnRzIGluc3RlYWQgb2Y6XG4gIC8vIGEuIG1ha2luZyB0aGUgdXNlciBndWVzcyB3aGF0cyB3cm9uZ1xuICAvLyBiLiBtYWtpbmcgYSBjdXN0b20gcGFzc3dvcmQgcmVzZXQgcGFnZSB0aGF0IHNob3dzIHRoZSByZXF1aXJlbWVudHNcbiAgY29uc3QgcG9saWN5RXJyb3IgPSB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA/IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgIDogJ1Bhc3N3b3JkIGRvZXMgbm90IG1lZXQgdGhlIFBhc3N3b3JkIFBvbGljeSByZXF1aXJlbWVudHMuJztcbiAgY29uc3QgY29udGFpbnNVc2VybmFtZUVycm9yID0gJ1Bhc3N3b3JkIGNhbm5vdCBjb250YWluIHlvdXIgdXNlcm5hbWUuJztcblxuICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBtZWV0cyB0aGUgcGFzc3dvcmQgc3RyZW5ndGggcmVxdWlyZW1lbnRzXG4gIGlmIChcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IodGhpcy5kYXRhLnBhc3N3b3JkKSkgfHxcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayh0aGlzLmRhdGEucGFzc3dvcmQpKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIHBvbGljeUVycm9yKSk7XG4gIH1cblxuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGNvbnRhaW4gdXNlcm5hbWVcbiAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSA9PT0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICAgIC8vIHVzZXJuYW1lIGlzIG5vdCBwYXNzZWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YodGhpcy5kYXRhLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgeyByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcikpOyB9XG4gICAgfSBlbHNlIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAvLyByZXRyaWV2ZSB0aGUgVXNlciBvYmplY3QgdXNpbmcgdGhlIFVSTCBvYmplY3QgSUQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZihyZXN1bHRzWzBdLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICB7IHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKVxuICAgICAgICApOyB9XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkIH0sXG4gICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSlcbiAgICAgICAgeyBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAxXG4gICAgICAgICk7IH1cbiAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgIGNvbnN0IG5ld1Bhc3N3b3JkID0gdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICAvLyBjb21wYXJlIHRoZSBuZXcgcGFzc3dvcmQgaGFzaCB3aXRoIGFsbCBvbGQgcGFzc3dvcmQgaGFzaGVzXG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gb2xkUGFzc3dvcmRzLm1hcChmdW5jdGlvbiAoaGFzaCkge1xuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKG5ld1Bhc3N3b3JkLCBoYXNoKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KVxuICAgICAgICAgICAgLy8gcmVqZWN0IGlmIHRoZXJlIGlzIGEgbWF0Y2hcbiAgICAgICAgICAgIHsgcmV0dXJuIFByb21pc2UucmVqZWN0KCdSRVBFQVRfUEFTU1dPUkQnKTsgfVxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gd2FpdCBmb3IgYWxsIGNvbXBhcmlzb25zIHRvIGNvbXBsZXRlXG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIgPT09ICdSRVBFQVRfUEFTU1dPUkQnKVxuICAgICAgICAgICAgLy8gYSBtYXRjaCB3YXMgZm91bmRcbiAgICAgICAgICAgIHsgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgICBgTmV3IHBhc3N3b3JkIHNob3VsZCBub3QgYmUgdGhlIHNhbWUgYXMgbGFzdCAke3RoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeX0gcGFzc3dvcmRzLmBcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTsgfVxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIHNlc3Npb24gZm9yIHVwZGF0aW5nIHVzZXIgKHRoaXMucXVlcnkgaXMgc2V0KSB1bmxlc3MgYXV0aERhdGEgZXhpc3RzXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgbmV3IHNlc3Npb25Ub2tlbiBpZiBsaW5raW5nIHZpYSBzZXNzaW9uVG9rZW5cbiAgaWYgKHRoaXMuYXV0aC51c2VyICYmIHRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBJZiBzaWduLXVwIGNhbGxcbiAgaWYgKCF0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyKSB7XG4gICAgLy8gQ3JlYXRlIHJlcXVlc3Qgb2JqZWN0IGZvciB2ZXJpZmljYXRpb24gZnVuY3Rpb25zXG4gICAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuICAgIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgICBvcmlnaW5hbDogb3JpZ2luYWxPYmplY3QsXG4gICAgICBvYmplY3Q6IHVwZGF0ZWRPYmplY3QsXG4gICAgICBtYXN0ZXI6IHRoaXMuYXV0aC5pc01hc3RlcixcbiAgICAgIGlwOiB0aGlzLmNvbmZpZy5pcCxcbiAgICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gICAgfTtcbiAgICAvLyBHZXQgdmVyaWZpY2F0aW9uIGNvbmRpdGlvbnMgd2hpY2ggY2FuIGJlIGJvb2xlYW5zIG9yIGZ1bmN0aW9uczsgdGhlIHB1cnBvc2Ugb2YgdGhpcyBhc3luYy9hd2FpdFxuICAgIC8vIHN0cnVjdHVyZSBpcyB0byBhdm9pZCB1bm5lY2Vzc2FyaWx5IGV4ZWN1dGluZyBzdWJzZXF1ZW50IGZ1bmN0aW9ucyBpZiBwcmV2aW91cyBvbmVzIGZhaWwgaW4gdGhlXG4gICAgLy8gY29uZGl0aW9uYWwgc3RhdGVtZW50IGJlbG93LCBhcyBhIGRldmVsb3BlciBtYXkgZGVjaWRlIHRvIGV4ZWN1dGUgZXhwZW5zaXZlIG9wZXJhdGlvbnMgaW4gdGhlbVxuICAgIGNvbnN0IHZlcmlmeVVzZXJFbWFpbHMgPSBhc3luYyAoKSA9PiB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzID09PSB0cnVlIHx8ICh0eXBlb2YgdGhpcy5jb25maWcudmVyaWZ5VXNlckVtYWlscyA9PT0gJ2Z1bmN0aW9uJyAmJiBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5jb25maWcudmVyaWZ5VXNlckVtYWlscyhyZXF1ZXN0KSkgPT09IHRydWUpO1xuICAgIGNvbnN0IHByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPSBhc3luYyAoKSA9PiB0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID09PSB0cnVlIHx8ICh0eXBlb2YgdGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9PT0gJ2Z1bmN0aW9uJyAmJiBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbChyZXF1ZXN0KSkgPT09IHRydWUpO1xuICAgIC8vIElmIHZlcmlmaWNhdGlvbiBpcyByZXF1aXJlZFxuICAgIGlmIChhd2FpdCB2ZXJpZnlVc2VyRW1haWxzKCkgJiYgYXdhaXQgcHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCgpKSB7XG4gICAgICB0aGlzLnN0b3JhZ2UucmVqZWN0U2lnbnVwID0gdHJ1ZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy8gY2xvdWQgaW5zdGFsbGF0aW9uSWQgZnJvbSBDbG91ZCBDb2RlLFxuICAvLyBuZXZlciBjcmVhdGUgc2Vzc2lvbiB0b2tlbnMgZnJvbSB0aGVyZS5cbiAgaWYgKHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCAmJiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgPT09ICdjbG91ZCcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9PSBudWxsICYmIHRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmpvaW4oJywnKTtcbiAgfVxuXG4gIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHRoaXMuY29uZmlnLCB7XG4gICAgdXNlcklkOiB0aGlzLm9iamVjdElkKCksXG4gICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgIGFjdGlvbjogdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA/ICdsb2dpbicgOiAnc2lnbnVwJyxcbiAgICAgIGF1dGhQcm92aWRlcjogdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciB8fCAncGFzc3dvcmQnLFxuICAgIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgfSk7XG5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2Uuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuICAgIHRoaXMuc3RvcmFnZS5pc3N1ZWRTZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG4gIH1cblxuICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpO1xufTtcblxuUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIEF1dGgubWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIG51bGwsIHNlc3Npb25EYXRhKS5leGVjdXRlKCksXG4gIH07XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5xdWVyeSA9PT0gbnVsbCkge1xuICAgIC8vIG51bGwgcXVlcnkgbWVhbnMgY3JlYXRlXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCdwYXNzd29yZCcgaW4gdGhpcy5kYXRhIHx8ICdlbWFpbCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgYWRkT3BzID0ge1xuICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICB9O1xuICAgIHRoaXMuZGF0YSA9IE9iamVjdC5hc3NpZ24odGhpcy5kYXRhLCBhZGRPcHMpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIE9ubHkgZm9yIF9TZXNzaW9uLCBhbmQgYXQgY3JlYXRpb24gdGltZVxuICBpZiAodGhpcy5jbGFzc05hbWUgIT0gJ19TZXNzaW9uJyB8fCB0aGlzLnF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERlc3Ryb3kgdGhlIHNlc3Npb25zIGluICdCYWNrZ3JvdW5kJ1xuICBjb25zdCB7IHVzZXIsIGluc3RhbGxhdGlvbklkLCBzZXNzaW9uVG9rZW4gfSA9IHRoaXMuZGF0YTtcbiAgaWYgKCF1c2VyIHx8ICFpbnN0YWxsYXRpb25JZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXVzZXIub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveShcbiAgICAnX1Nlc3Npb24nLFxuICAgIHtcbiAgICAgIHVzZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHNlc3Npb25Ub2tlbjogeyAkbmU6IHNlc3Npb25Ub2tlbiB9LFxuICAgIH0sXG4gICAge30sXG4gICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgKTtcbn07XG5cbi8vIEhhbmRsZXMgYW55IGZvbGxvd3VwIGxvZ2ljXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUZvbGxvd3VwID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddICYmIHRoaXMuY29uZmlnLnJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQpIHtcbiAgICB2YXIgc2Vzc2lvblF1ZXJ5ID0ge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXTtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5kZXN0cm95KCdfU2Vzc2lvbicsIHNlc3Npb25RdWVyeSlcbiAgICAgIC50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKS50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXTtcbiAgICAvLyBGaXJlIGFuZCBmb3JnZXQhXG4gICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHRoaXMuZGF0YSwgeyBhdXRoOiB0aGlzLmF1dGggfSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX1Nlc3Npb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBfU2Vzc2lvbiBvYmplY3QuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZVNlc3Npb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGgudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLicpO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmIHRoaXMuZGF0YS51c2VyLm9iamVjdElkICE9IHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICgnaW5zdGFsbGF0aW9uSWQnIGluIHRoaXMuZGF0YSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAoJ3Nlc3Npb25Ub2tlbicgaW4gdGhpcy5kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICgnZXhwaXJlc0F0JyBpbiB0aGlzLmRhdGEgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKCdjcmVhdGVkV2l0aCcgaW4gdGhpcy5kYXRhICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0ge1xuICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgY29uc3QgYWRkaXRpb25hbFNlc3Npb25EYXRhID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMuZGF0YSkge1xuICAgICAgaWYgKGtleSA9PT0gJ29iamVjdElkJyB8fCBrZXkgPT09ICd1c2VyJyB8fCBrZXkgPT09ICdzZXNzaW9uVG9rZW4nIHx8IGtleSA9PT0gJ2V4cGlyZXNBdCcgfHwga2V5ID09PSAnY3JlYXRlZFdpdGgnKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgLy8gRW5mb3JjZSB0aGUgY2FsbGVyJ3MgY2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgYW5kIHNjaGVtYSBiZWZvcmUgdGhlIG1hc3RlciB3cml0ZVxuICAgIGNvbnN0IHZhbGlkYXRlZCA9IHRoaXMudmFsaWRhdGVXcml0ZVBlcm1pc3Npb24oKS50aGVuKCgpID0+IHRoaXMudmFsaWRhdGVTY2hlbWEoKSk7XG4gICAgcmV0dXJuIHZhbGlkYXRlZC50aGVuKCgpID0+IGNyZWF0ZVNlc3Npb24oKSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5yZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRXJyb3IgY3JlYXRpbmcgc2Vzc2lvbi4nKTtcbiAgICAgIH1cbiAgICAgIHNlc3Npb25EYXRhWydvYmplY3RJZCddID0gcmVzdWx0cy5yZXNwb25zZVsnb2JqZWN0SWQnXTtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICBsb2NhdGlvbjogcmVzdWx0cy5sb2NhdGlvbixcbiAgICAgICAgcmVzcG9uc2U6IHNlc3Npb25EYXRhLFxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX0luc3RhbGxhdGlvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIGluc3RhbGxhdGlvbiBvYmplY3QuXG4vLyBJZiBhbiBpbnN0YWxsYXRpb24gaXMgZm91bmQsIHRoaXMgY2FuIG11dGF0ZSB0aGlzLnF1ZXJ5IGFuZCB0dXJuIGEgY3JlYXRlXG4vLyBpbnRvIGFuIHVwZGF0ZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlSW5zdGFsbGF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19JbnN0YWxsYXRpb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGRlZHVwbGljYXRpb24gYmVsb3cgZW1iZWRzIHRoZXNlIGNsaWVudC1zdXBwbGllZCB2YWx1ZXMgZGlyZWN0bHkgaW50byBkYXRhYmFzZVxuICAvLyBxdWVyaWVzIHRoYXQgZGVsZXRlIG9yIHVwZGF0ZSByb3dzIHdpdGggbWFzdGVyIHByaXZpbGVnZXMsIGFuZCBpdCBydW5zIGJlZm9yZVxuICAvLyBgdmFsaWRhdGVTY2hlbWFgLCBzbyB0aGVpciB0eXBlcyBtdXN0IGJlIGVuZm9yY2VkIGhlcmU6IGEgbm9uLXN0cmluZyB2YWx1ZSB3b3VsZFxuICAvLyBvdGhlcndpc2UgcmVhY2ggdGhlIGRhdGFiYXNlIGFzIGEgcXVlcnkgY29uc3RyYWludCAoc3VjaCBhcyBhbiBvcGVyYXRvciBvYmplY3RcbiAgLy8gYHtcIiRuZVwiOiBudWxsfWApIG1hdGNoaW5nIHJvd3MgdGhlIGNsaWVudCBuZXZlciBpZGVudGlmaWVkLCBpbnN0ZWFkIG9mIGFzIGEgbGl0ZXJhbFxuICAvLyB2YWx1ZSB0byBtYXRjaCBhZ2FpbnN0LiBUaGUgc2NoZW1hIGRlY2xhcmVzIGFsbCB0aHJlZSBhcyBgU3RyaW5nYCwgYnV0IHRoYXQgY2hlY2tcbiAgLy8gY2Fubm90IGJlIHJldXNlZCBoZXJlOyBpdCBydW5zIGxhdGVyIGluIHRoZSB3cml0ZSBwaXBlbGluZSBhbmQgbW92aW5nIGl0IGVhcmxpZXJcbiAgLy8gd291bGQgbXV0YXRlIHRoZSBzY2hlbWEgYmVmb3JlIHRoZSBwZXJtaXNzaW9uIGNoZWNrLiBUaGUgZmllbGQgbGlzdCBpcyBhIHByb3BlcnR5IG9mXG4gIC8vIHRoaXMgZnVuY3Rpb24gcmF0aGVyIHRoYW4gb2YgdGhlIHNjaGVtYTogaXQgaXMgdGhlIHNldCBvZiB2YWx1ZXMgc3BsaWNlZCBpbnRvIHRoZVxuICAvLyBkZWR1cGxpY2F0aW9uIHF1ZXJpZXMgYmVsb3cuXG4gIGZvciAoY29uc3QgZmllbGROYW1lIG9mIFsnZGV2aWNlVG9rZW4nLCAnaW5zdGFsbGF0aW9uSWQnLCAnYXBwSWRlbnRpZmllciddKSB7XG4gICAgY29uc3QgdmFsdWUgPSB0aGlzLmRhdGFbZmllbGROYW1lXTtcbiAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGZpZWxkTmFtZSA9PT0gJ2FwcElkZW50aWZpZXInICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgYWN0dWFsVHlwZSA9IEFycmF5LmlzQXJyYXkodmFsdWUpXG4gICAgICA/ICdBcnJheSdcbiAgICAgIDogYCR7dHlwZW9mIHZhbHVlfWAucmVwbGFjZSgvXi4vLCBjaGFyYWN0ZXIgPT4gY2hhcmFjdGVyLnRvVXBwZXJDYXNlKCkpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgX0luc3RhbGxhdGlvbi4ke2ZpZWxkTmFtZX07IGV4cGVjdGVkIFN0cmluZyBidXQgZ290ICR7YWN0dWFsVHlwZX1gXG4gICAgKTtcbiAgfVxuXG4gIGlmIChcbiAgICAhdGhpcy5xdWVyeSAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgIXRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZFxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAxMzUsXG4gICAgICAnYXQgbGVhc3Qgb25lIElEIGZpZWxkIChkZXZpY2VUb2tlbiwgaW5zdGFsbGF0aW9uSWQpICcgKyAnbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIHRoZSBkZXZpY2UgdG9rZW4gaXMgNjQgY2hhcmFjdGVycyBsb25nLCB3ZSBhc3N1bWUgaXQgaXMgZm9yIGlPU1xuICAvLyBhbmQgbG93ZXJjYXNlIGl0LlxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIHRoaXMuZGF0YS5kZXZpY2VUb2tlbi5sZW5ndGggPT0gNjQpIHtcbiAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4udG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFdlIGxvd2VyY2FzZSB0aGUgaW5zdGFsbGF0aW9uSWQgaWYgcHJlc2VudFxuICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBsZXQgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQ7XG5cbiAgLy8gSWYgZGF0YS5pbnN0YWxsYXRpb25JZCBpcyBub3Qgc2V0IGFuZCB3ZSdyZSBub3QgbWFzdGVyLCB3ZSBjYW4gbG9va3VwIGluIGF1dGhcbiAgaWYgKCFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgcmVzdWx0Lm9iamVjdElkID09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNSwgJ2RldmljZVR5cGUgbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAvLyBBIGBEZWxldGVgIG9wZXJhdGlvbiBpcyBhcHBsaWVkIG9ubHkgYWZ0ZXIgdGhlIGRlZHVwbGljYXRpb24gcnVucywgYW5kIG5vXG4gICAgICAgICAgICAvLyBpbnN0YWxsYXRpb24gbWF0Y2hlZCBoZXJlIHRvIHRha2UgYSBzY29wZSBmcm9tLiBTa2lwIHRoZSBjbGVhbnVwIHJhdGhlciB0aGFuXG4gICAgICAgICAgICAvLyBydW4gaXQgdW5zY29wZWQgYWNyb3NzIGV2ZXJ5IGFwcGxpY2F0aW9uLCBvciBxdWVyeSBvbiB0aGUgb3BlcmF0aW9uIGl0c2VsZi5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLmFwcElkZW50aWZpZXIgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmICFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10pIHtcbiAgICAgICAgICAvLyBFeGFjdGx5IG9uZSBkZXZpY2UgdG9rZW4gbWF0Y2ggYW5kIGl0IGRvZXNuJ3QgaGF2ZSBhbiBpbnN0YWxsYXRpb25cbiAgICAgICAgICAvLyBJRC4gVGhpcyBpcyB0aGUgb25lIGNhc2Ugd2hlcmUgd2Ugd2FudCB0byBtZXJnZSB3aXRoIHRoZSBleGlzdGluZ1xuICAgICAgICAgIC8vIG9iamVjdC5cbiAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHsgb2JqZWN0SWQ6IGlkTWF0Y2gub2JqZWN0SWQgfTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAgIC5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWRcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiBpZE1hdGNoLmRldmljZVRva2VuICE9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgICAgLy8gV2UncmUgc2V0dGluZyB0aGUgZGV2aWNlIHRva2VuIG9uIGFuIGV4aXN0aW5nIGluc3RhbGxhdGlvbiwgc29cbiAgICAgICAgICAgIC8vIHdlIHNob3VsZCB0cnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2ggdGhpc1xuICAgICAgICAgICAgLy8gZGV2aWNlIHRva2VuLlxuICAgICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgLy8gV2UgaGF2ZSBhIHVuaXF1ZSBpbnN0YWxsIElkLCB1c2UgdGhhdCB0byBwcmVzZXJ2ZVxuICAgICAgICAgICAgLy8gdGhlIGludGVyZXN0aW5nIGluc3RhbGxhdGlvblxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnaW5zdGFsbGF0aW9uSWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgPT0gdGhpcy5kYXRhLm9iamVjdElkXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gd2UgcGFzc2VkIGFuIG9iamVjdElkLCBwcmVzZXJ2ZSB0aGF0IGluc3RhbGF0aW9uXG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydvYmplY3RJZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogaWRNYXRjaC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFdoYXQgdG8gZG8gaGVyZT8gY2FuJ3QgcmVhbGx5IGNsZWFuIHVwIGV2ZXJ5dGhpbmcuLi5cbiAgICAgICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgLy8gQSBgRGVsZXRlYCBvcGVyYXRpb24gaXMgYXBwbGllZCBvbmx5IGFmdGVyIHRoZSBkZWR1cGxpY2F0aW9uIHJ1bnMsIHNvIHNjb3BlXG4gICAgICAgICAgICAgIC8vIHRoZSBjbGVhbnVwIHRvIHRoZSB2YWx1ZSB0aGUgbWF0Y2hlZCBpbnN0YWxsYXRpb24gc3RpbGwgaG9sZHMuIERyb3BwaW5nIHRoZVxuICAgICAgICAgICAgICAvLyBjb25zdHJhaW50IHdvdWxkIGxldCB0aGUgY2xlYW51cCByZWFjaCBpbnN0YWxsYXRpb25zIG9mIG90aGVyIGFwcGxpY2F0aW9ucyxcbiAgICAgICAgICAgICAgLy8gYW5kIHRoZSBvcGVyYXRpb24gaXRzZWxmIGNhbm5vdCBtYXRjaCBhIFN0cmluZywgc28gc2tpcCB0aGUgY2xlYW51cCB3aGVuIG5vXG4gICAgICAgICAgICAgIC8vIHNjb3BlIGlzIGF2YWlsYWJsZS5cbiAgICAgICAgICAgICAgY29uc3QgYXBwSWRlbnRpZmllciA9XG4gICAgICAgICAgICAgICAgdHlwZW9mIHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyID09PSAnc3RyaW5nJ1xuICAgICAgICAgICAgICAgICAgPyB0aGlzLmRhdGEuYXBwSWRlbnRpZmllclxuICAgICAgICAgICAgICAgICAgOiBpZE1hdGNoLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgYXBwSWRlbnRpZmllciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdWl0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIHdoZXRoZXIgd2UgaGF2ZSBhIHNob3J0LWNpcmN1aXRlZCByZXNwb25zZSAtIG9ubHkgdGhlbiBydW4gZXhwYW5zaW9uLlxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgYXdhaXQgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkRhdGFiYXNlT3BlcmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJykge1xuICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci5yb2xlLmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIpIHtcbiAgICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuY2xlYXJDYWNoZWRSb2xlcyh0aGlzLmF1dGgudXNlcik7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMucXVlcnkgJiYgdGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKCkpIHtcbiAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORyxcbiAgICAgIGBDYW5ub3QgbW9kaWZ5IHVzZXIgJHt0aGlzLnF1ZXJ5Lm9iamVjdElkfS5gLFxuICAgICAgdGhpcy5jb25maWdcbiAgICApO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1Byb2R1Y3QnICYmIHRoaXMuZGF0YS5kb3dubG9hZCkge1xuICAgIHRoaXMuZGF0YS5kb3dubG9hZE5hbWUgPSB0aGlzLmRhdGEuZG93bmxvYWQubmFtZTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBiZXR0ZXIgZGV0ZWN0aW9uIGZvciBBQ0wsIGVuc3VyaW5nIGEgdXNlciBjYW4ndCBiZSBsb2NrZWQgZnJvbVxuICAvLyAgICAgICB0aGVpciBvd24gdXNlciByZWNvcmQuXG4gIGlmICh0aGlzLmRhdGEuQUNMICYmIHRoaXMuZGF0YS5BQ0xbJyp1bnJlc29sdmVkJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9BQ0wsICdJbnZhbGlkIEFDTC4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgLy8gRm9yY2UgdGhlIHVzZXIgdG8gbm90IGxvY2tvdXRcbiAgICAvLyBNYXRjaGVkIHdpdGggcGFyc2UuY29tXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5BQ0wgJiZcbiAgICAgIHRoaXMuYXV0aC5pc01hc3RlciAhPT0gdHJ1ZSAmJlxuICAgICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgIT09IHRydWVcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMucXVlcnkub2JqZWN0SWQgfSxcbiAgICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH0sXG4gICAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvL24tMSBwYXNzd29yZHMgZ28gaW50byBoaXN0b3J5IGluY2x1ZGluZyBsYXN0IHBhc3N3b3JkXG4gICAgICAgICAgd2hpbGUgKFxuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLmxlbmd0aCA+IE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICAvLyBUaGUgdW5zYW5pdGl6ZWQgcmVzdWx0IG9mIGEgY2xpZW50IHVwZGF0ZSBjYXJyaWVzIHRoZSByZWFkIGFjY2VzcyBvZiB0aGUgb2JqZWN0XG4gICAgICBjb25zdCByYXcgPSAhdGhpcy5ydW5PcHRpb25zLm1hbnkgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2U7XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgcmF3LFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgICAgIClcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICB0aGlzLl90aHJvd0lmQXV0aERhdGFEdXBsaWNhdGUoZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihhc3luYyByZXN1bHQgPT4ge1xuICAgICAgICAgIGxldCByZXNwb25zZSA9IHJlc3VsdDtcbiAgICAgICAgICBpZiAocmF3KSB7XG4gICAgICAgICAgICB0aGlzLndyaXR0ZW5SZWFkQWNjZXNzID0gcmVzdWx0Ll9ycGVybTtcbiAgICAgICAgICAgIHRoaXMud3JpdHRlbk9iamVjdCA9IHJlc3VsdDtcbiAgICAgICAgICAgIHJlc3BvbnNlID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UuX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQodGhpcy5kYXRhLCByZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXNwb25zZS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3BvbnNlIH07XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFNldCB0aGUgZGVmYXVsdCBBQ0wgYW5kIHBhc3N3b3JkIHRpbWVzdGFtcCBmb3IgdGhlIG5ldyBfVXNlclxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgdmFyIEFDTCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAvLyBkZWZhdWx0IHB1YmxpYyByL3cgQUNMXG4gICAgICBpZiAoIUFDTCkge1xuICAgICAgICBBQ0wgPSB7fTtcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgQUNMWycqJ10gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBtYWtlIHN1cmUgdGhlIHVzZXIgaXMgbm90IGxvY2tlZCBkb3duXG4gICAgICBBQ0xbdGhpcy5kYXRhLm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIHRoaXMuZGF0YS5BQ0wgPSBBQ0w7XG4gICAgICAvLyBwYXNzd29yZCB0aW1lc3RhbXAgdG8gYmUgdXNlZCB3aGVuIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3kgaXMgZW5mb3JjZWRcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJ1biBhIGNyZWF0ZVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmNyZWF0ZSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5kYXRhLCB0aGlzLnJ1bk9wdGlvbnMsIGZhbHNlLCB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlcilcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3Rocm93SWZBdXRoRGF0YUR1cGxpY2F0ZShlcnJvcik7XG5cbiAgICAgICAgLy8gUXVpY2sgY2hlY2ssIGlmIHdlIHdlcmUgYWJsZSB0byBpbmZlciB0aGUgZHVwbGljYXRlZCBmaWVsZCBuYW1lXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAndXNlcm5hbWUnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAnZW1haWwnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhpcyB3YXMgYSBmYWlsZWQgdXNlciBjcmVhdGlvbiBkdWUgdG8gdXNlcm5hbWUgb3IgZW1haWwgYWxyZWFkeSB0YWtlbiwgd2UgbmVlZCB0b1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIGl0IHdhcyB1c2VybmFtZSBvciBlbWFpbCBhbmQgcmV0dXJuIHRoZSBhcHByb3ByaWF0ZSBlcnJvci5cbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gdGhlIG9yaWdpbmFsIG1ldGhvZFxuICAgICAgICAvLyBUT0RPOiBTZWUgaWYgd2UgY2FuIGxhdGVyIGRvIHRoaXMgd2l0aG91dCBhZGRpdGlvbmFsIHF1ZXJpZXMgYnkgdXNpbmcgbmFtZWQgaW5kZXhlcy5cbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgLmZpbmQoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCwgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSB9LFxuICAgICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLm9iamVjdElkID0gdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICByZXNwb25zZS5jcmVhdGVkQXQgPSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lKSB7XG4gICAgICAgICAgcmVzcG9uc2UudXNlcm5hbWUgPSB0aGlzLmRhdGEudXNlcm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgLy8gUmVhZCBhY2Nlc3MgYXMgc3RvcmVkXG4gICAgICAgIGNvbnN0IGFjbCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAgIHRoaXMud3JpdHRlblJlYWRBY2Nlc3MgPSBhY2wgPyBPYmplY3Qua2V5cyhhY2wpLmZpbHRlcihrZXkgPT4gYWNsW2tleV0ucmVhZCkgOiBudWxsO1xuICAgICAgICB0aGlzLndyaXR0ZW5PYmplY3QgPSB0aGlzLmRhdGE7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UgfHwgIXRoaXMucmVzcG9uc2UucmVzcG9uc2UgfHwgdGhpcy5ydW5PcHRpb25zLm1hbnkpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlclNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyU2F2ZUhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGNvbnN0IGhhc0xpdmVRdWVyeSA9IHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZShcbiAgICB0aGlzLmNsb25lV2l0aEZpbGVVcmxzKHRoaXMucmVzcG9uc2UucmVzcG9uc2UpLFxuICAgIHRoaXMucmVzcG9uc2Uuc3RhdHVzIHx8IDIwMFxuICApO1xuXG4gIGlmIChoYXNMaXZlUXVlcnkpIHtcbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIC8vIE5vdGlmeSBMaXZlUXVlcnlTZXJ2ZXIgaWYgcG9zc2libGVcbiAgICAgICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSk7XG4gICAgICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIub25BZnRlclNhdmUoXG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgICBwZXJtc1xuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0xpdmVRdWVyeSBhZnRlclNhdmUgbm90aWZpY2F0aW9uIGZhaWxlZCcsIGVycik7XG4gICAgICB9KTtcbiAgfVxuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2spIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUnVuIGFmdGVyU2F2ZSB0cmlnZ2VyXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1blRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgY29uc3QganNvblJldHVybmVkID0gcmVzdWx0ICYmICFyZXN1bHQuX3RvRnVsbEpTT047XG4gICAgICBpZiAoanNvblJldHVybmVkKSB7XG4gICAgICAgIC8vIFRoZSByZXR1cm5lZCBvYmplY3QgaXMgdGhlIHJlc3BvbnNlIGFzIGlzXG4gICAgICAgIHRoaXMuc3RvcmFnZS5yZXNwb25zZUZyb21UcmlnZ2VyID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5wZW5kaW5nT3BzLm9wZXJhdGlvbnMgPSB7fTtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHJlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKFxuICAgICAgICAgIChyZXN1bHQgfHwgdXBkYXRlZE9iamVjdCkudG9KU09OKCksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBsb2dnZXIud2FybignYWZ0ZXJTYXZlIGNhdWdodCBhbiBlcnJvcicsIGVycik7XG4gICAgfSk7XG59O1xuXG4vLyBBIGhlbHBlciB0byBmaWd1cmUgb3V0IHdoYXQgbG9jYXRpb24gdGhpcyBvcGVyYXRpb24gaGFwcGVucyBhdC5cblJlc3RXcml0ZS5wcm90b3R5cGUubG9jYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBtaWRkbGUgPSB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyA/ICcvdXNlcnMvJyA6ICcvY2xhc3Nlcy8nICsgdGhpcy5jbGFzc05hbWUgKyAnLyc7XG4gIGNvbnN0IG1vdW50ID0gdGhpcy5jb25maWcubW91bnQgfHwgdGhpcy5jb25maWcuc2VydmVyVVJMO1xuICByZXR1cm4gbW91bnQgKyBtaWRkbGUgKyB0aGlzLmRhdGEub2JqZWN0SWQ7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgdGhlIG9iamVjdCBpZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4vLyBCZWNhdXNlIGl0IGNvdWxkIGJlIGVpdGhlciBvbiB0aGUgcXVlcnkgb3Igb24gdGhlIGRhdGFcblJlc3RXcml0ZS5wcm90b3R5cGUub2JqZWN0SWQgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmRhdGEub2JqZWN0SWQgfHwgdGhpcy5xdWVyeS5vYmplY3RJZDtcbn07XG5cbi8vIFJldHVybnMgYSBjb3B5IG9mIHRoZSBkYXRhIGFuZCBkZWxldGUgYmFkIGtleXMgKF9hdXRoX2RhdGEsIF9oYXNoZWRfcGFzc3dvcmQuLi4pXG5SZXN0V3JpdGUucHJvdG90eXBlLnNhbml0aXplZERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGRhdGEgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZSgoZGF0YSwga2V5KSA9PiB7XG4gICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgIGlmICghL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCB0aGlzLmNsb25lV2l0aEZpbGVVcmxzKHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gQSByYXcgdmlldyBvZiB0aGUgb2JqZWN0J3MgZmllbGRzIChzdG9yZWQgdmFsdWVzIG92ZXJsYWlkIHdpdGggd2hvbGUtZmllbGRcbi8vIHdyaXRlcyBpbiB0aGlzIHJlcXVlc3QpIHVzZWQgdG8gcmVzb2x2ZSB3aGV0aGVyIGEgZG90IG5vdGF0aW9uIGtleSB0YXJnZXRzIGFcbi8vIHBvaW50ZXIncyBvYmplY3QgSUQuXG5SZXN0V3JpdGUucHJvdG90eXBlLl9kb3ROb3RhdGlvbkZpZWxkUm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3Qgcm9vdCA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgaWYgKHRoaXMuZGF0YSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkpIHtcbiAgICAgIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgICAgICByb290W2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJvb3Q7XG59O1xuXG5jb25zdCBwcm9oaWJpdGVkRG90Tm90YXRpb25LZXkgPSBrZXkgPT5cbiAgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgYFByb2hpYml0ZWQgZG90IG5vdGF0aW9uIGtleSBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5KX0uYFxuICApO1xuXG4vLyBWYWx1ZXMgdGhlIFNESyBkZWNvZGVzIHRvIGFuIGluc3RhbmNlIHJhdGhlciB0aGFuIGEgcGxhaW4gb2JqZWN0OiBhbiBvcGVyYXRpb24gb3IgYVxuLy8gdHlwZWQgdmFsdWVcbmNvbnN0IGRlY29kZXNUb0luc3RhbmNlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlLl9fb3AgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgc3dpdGNoICh2YWx1ZS5fX3R5cGUpIHtcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICEhdmFsdWUuY2xhc3NOYW1lO1xuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICBjYXNlICdEYXRlJzpcbiAgICBjYXNlICdGaWxlJzpcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG59O1xuXG4vLyBXaGV0aGVyIHRoZSBTREsgd291bGQgcmVzb2x2ZSBhIG5vbi1sZWFmIHNlZ21lbnQgb2YgdGhlIGtleSwgZnJvbSB0aGUgZ2l2ZW4gZGVwdGhcbi8vIG9uLCB0aHJvdWdoIHRoZSBwcm90b3R5cGUgY2hhaW4gb2YgdGhlIGNvbnRhaW5lciBpbnN0ZWFkIG9mIGFuIG93biBrZXksIHdyaXRpbmdcbi8vIHRoZSBmaW5hbCBzZWdtZW50IG9udG8gYSBzaGFyZWQgYnVpbHQtaW4uXG5jb25zdCBkZXNjZW5kc0ludG9Qcm90b3R5cGUgPSAoY29udGFpbmVyLCBzZWdtZW50cywgZGVwdGggPSAwKSA9PiB7XG4gIGZvciAobGV0IGkgPSBkZXB0aDsgaSA8IHNlZ21lbnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGlmIChjb250YWluZXIgPT09IG51bGwgfHwgdHlwZW9mIGNvbnRhaW5lciAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gQSBmdXJ0aGVyIHNlZ21lbnQgd2Fsa3MgdGhlIHByb3RvdHlwZSBvZiB0aGUgZGVjb2RlZCBpbnN0YW5jZVxuICAgIGlmIChkZWNvZGVzVG9JbnN0YW5jZShjb250YWluZXIpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3Qgc2VnbWVudCA9IHNlZ21lbnRzW2ldO1xuICAgIGlmICghaGFzT3duKGNvbnRhaW5lciwgc2VnbWVudCkpIHtcbiAgICAgIC8vIEFuIGluaGVyaXRlZCBtZW1iZXIgb2YgYSBuZXN0ZWQgdmFsdWUgcmVzb2x2ZXMgdG8gYSBzaGFyZWQgYnVpbHQtaW47IHRoZSByb290XG4gICAgICAvLyBoYXMgbm8gcHJvdG90eXBlIGluIHRoZSBTREssIGFuZCBhIG1pc3Npbmcga2V5IGlzIGNyZWF0ZWQgZnJlc2hcbiAgICAgIHJldHVybiBpID4gMCAmJiBzZWdtZW50IGluIGNvbnRhaW5lcjtcbiAgICB9XG4gICAgY29udGFpbmVyID0gY29udGFpbmVyW3NlZ21lbnRdO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbi8vIFRoZSBjb250YWluZXIgYSB3cml0dGVuIHZhbHVlIHByb3ZpZGVzIGZvciBrZXlzIGJlbG93IGl0OiB0aGUgdmFsdWUgaXRzZWxmLCBvclxuLy8gdGhlIGVsZW1lbnRzIGFuIGFycmF5IG9wZXJhdGlvbiBhZGRzXG5jb25zdCB3cml0dGVuQ29udGFpbmVyID0gdmFsdWUgPT4ge1xuICBpZiAodmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgaWYgKHR5cGVvZiB2YWx1ZS5fX29wID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlLm9iamVjdHMpID8gdmFsdWUub2JqZWN0cyA6IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG4vLyBSZWplY3RzIGEgZG90IG5vdGF0aW9uIGtleSB0aGF0IHRoZSBTREsgd291bGQgYXBwbHkgdGhyb3VnaCBhIHByb3RvdHlwZSBtZW1iZXIgb2Zcbi8vIHRoZSBzdG9yZWQgb2JqZWN0ICh0aGUgdHJpZ2dlciBvYmplY3QgaXMgYnVpbHQgZnJvbSBpdCBiZWZvcmUgdGhlIG90aGVyIGZpZWxkcyBvZlxuLy8gdGhpcyByZXF1ZXN0IGFyZSBhcHBsaWVkKSwgb2YgdGhlIG9iamVjdCBhcyB3cml0dGVuIGJ5IHRoaXMgcmVxdWVzdCwgb3Igb2YgYSB2YWx1ZVxuLy8gYW5vdGhlciBrZXkgb2YgdGhpcyByZXF1ZXN0IHdyaXRlcyBhYm92ZSBpdC5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVEb3ROb3RhdGlvbktleXMgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEpO1xuICBjb25zdCBrZXlTZXQgPSBuZXcgU2V0KGtleXMpO1xuICBjb25zdCByb290cyA9IFt0aGlzLl9kb3ROb3RhdGlvbkZpZWxkUm9vdCgpXTtcbiAgaWYgKHRoaXMub3JpZ2luYWxEYXRhKSB7XG4gICAgcm9vdHMucHVzaCh0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cbiAgLy8gT25seSBhIGtleSB0aGF0IGlzIGEgcHJlZml4IG9mIHRoaXMga2V5LCBlbmRpbmcgb24gYSBzZWdtZW50IGJvdW5kYXJ5LCB3cml0ZXMgYWJvdmUgaXRcbiAgY29uc3Qgd3JpdHRlbkFib3ZlID0gc2VnbWVudHMgPT4ge1xuICAgIGxldCBwcmVmaXggPSBzZWdtZW50c1swXTtcbiAgICBmb3IgKGxldCBkZXB0aCA9IDE7IGRlcHRoIDwgc2VnbWVudHMubGVuZ3RoIC0gMTsgZGVwdGgrKykge1xuICAgICAgaWYgKGtleVNldC5oYXMocHJlZml4KSkge1xuICAgICAgICBjb25zdCBjb250YWluZXIgPSB3cml0dGVuQ29udGFpbmVyKHRoaXMuZGF0YVtwcmVmaXhdKTtcbiAgICAgICAgaWYgKGNvbnRhaW5lciAhPT0gdW5kZWZpbmVkICYmIGRlc2NlbmRzSW50b1Byb3RvdHlwZShjb250YWluZXIsIHNlZ21lbnRzLCBkZXB0aCkpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcHJlZml4ICs9IGAuJHtzZWdtZW50c1tkZXB0aF19YDtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPCAwKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3Qgc2VnbWVudHMgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICBpZiAocm9vdHMuc29tZShyb290ID0+IGRlc2NlbmRzSW50b1Byb3RvdHlwZShyb290LCBzZWdtZW50cykpIHx8IHdyaXR0ZW5BYm92ZShzZWdtZW50cykpIHtcbiAgICAgIHRocm93IHByb2hpYml0ZWREb3ROb3RhdGlvbktleShrZXkpO1xuICAgIH1cbiAgfVxufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFBhcnNlT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lLCBvYmplY3RJZDogdGhpcy5xdWVyeT8ub2JqZWN0SWQgfTtcbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgY29uc3QgY2xhc3NOYW1lID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKGV4dHJhRGF0YSk7XG4gIGNvbnN0IHJlYWRPbmx5QXR0cmlidXRlcyA9IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXNcbiAgICA/IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXMoKVxuICAgIDogW107XG5cbiAgLy8gRm9yIF9Sb2xlIGNsYXNzLCAnbmFtZScgY2Fubm90IGJlIHNldCBhZnRlciB0aGUgcm9sZSBoYXMgYW4gb2JqZWN0SWQuXG4gIC8vIEluIGFmdGVyU2F2ZSBjb250ZXh0LCBfaGFuZGxlU2F2ZVJlc3BvbnNlIGhhcyBhbHJlYWR5IHNldCB0aGUgb2JqZWN0SWQsXG4gIC8vIHNvIHdlIHRyZWF0ICduYW1lJyBhcyByZWFkLW9ubHkgdG8gYXZvaWQgUGFyc2UgU0RLIHZhbGlkYXRpb24gZXJyb3JzLlxuICBjb25zdCBpc1JvbGVBZnRlclNhdmUgPSB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJyAmJiB0aGlzLnJlc3BvbnNlICYmICF0aGlzLnF1ZXJ5O1xuICBpZiAoaXNSb2xlQWZ0ZXJTYXZlICYmIHRoaXMuZGF0YS5uYW1lICYmICFyZWFkT25seUF0dHJpYnV0ZXMuaW5jbHVkZXMoJ25hbWUnKSkge1xuICAgIHJlYWRPbmx5QXR0cmlidXRlcy5wdXNoKCduYW1lJyk7XG4gIH1cbiAgaWYgKCF0aGlzLm9yaWdpbmFsRGF0YSkge1xuICAgIGZvciAoY29uc3QgYXR0cmlidXRlIG9mIHJlYWRPbmx5QXR0cmlidXRlcykge1xuICAgICAgZXh0cmFEYXRhW2F0dHJpYnV0ZV0gPSB0aGlzLmRhdGFbYXR0cmlidXRlXTtcbiAgICB9XG4gIH1cbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIGNvbnN0IHBvaW50ZXJSb290ID0gdGhpcy5fZG90Tm90YXRpb25GaWVsZFJvb3QoKTtcbiAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoZnVuY3Rpb24gKGRhdGEsIGtleSkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgLy8gTnVsbCBhbmQgdW5kZWZpbmVkIGFyZSBzZXQgYXQgdGhlaXIgb3duIGRvdCBub3RhdGlvbiBwYXRoLCBsaWtlIGFuIG9wZXJhdGlvblxuICAgICAgaWYgKGRhdGFba2V5XSA9PSBudWxsIHx8IHR5cGVvZiBkYXRhW2tleV0uX19vcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gQSBkb3Qgbm90YXRpb24ga2V5IHRoYXQgcmVtb3ZlcyBhIHBvaW50ZXIncyBvYmplY3QgSUQgd291bGQgbGVhdmUgdGhlXG4gICAgICAgIC8vIHBvaW50ZXIgdW5zZXJpYWxpemFibGUgYW5kIGJyZWFrIHRoZSB0cmlnZ2VyIG9iamVjdCwgc28gc2tpcCBpdC5cbiAgICAgICAgaWYgKCFyZWFkT25seUF0dHJpYnV0ZXMuaW5jbHVkZXMoa2V5KSAmJiAhdGFyZ2V0c1BvaW50ZXJJZChwb2ludGVyUm9vdCwga2V5KSkge1xuICAgICAgICAgIC8vIFRoZSBTREsga2V5IG5hbWUgcnVsZXMgYXBwbHkgdG8gdG9wLWxldmVsIGZpZWxkcyBvbmx5XG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0sIHsgaWdub3JlVmFsaWRhdGlvbjogdHJ1ZSB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gc3ViZG9jdW1lbnQga2V5IHdpdGggZG90IG5vdGF0aW9uIHsgJ3gueSc6IHYgfSA9PiB7ICd4JzogeyAneScgOiB2IH0gfSlcbiAgICAgICAgY29uc3Qgc3BsaXR0ZWRLZXkgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgcGFyZW50UHJvcCA9IHNwbGl0dGVkS2V5WzBdO1xuICAgICAgICBsZXQgcGFyZW50VmFsID0gdXBkYXRlZE9iamVjdC5nZXQocGFyZW50UHJvcCk7XG4gICAgICAgIGlmICh0eXBlb2YgcGFyZW50VmFsICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhcmVudFZhbCA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIHBhcmVudFZhbFtzcGxpdHRlZEtleVsxXV0gPSBkYXRhW2tleV07XG4gICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KHBhcmVudFByb3AsIHBhcmVudFZhbCk7XG4gICAgICB9XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgdGhpcy5jbG9uZVdpdGhGaWxlVXJscyh0aGlzLmRhdGEpKTtcblxuICBjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplZERhdGEoKTtcbiAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgZGVsZXRlIHNhbml0aXplZFthdHRyaWJ1dGVdO1xuICB9XG4gIHVwZGF0ZWRPYmplY3Quc2V0KHNhbml0aXplZCk7XG4gIHJldHVybiB7IHVwZGF0ZWRPYmplY3QsIG9yaWdpbmFsT2JqZWN0IH07XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuY29uc3QgaGFzT3duID0gKG9iamVjdCwga2V5KSA9PlxuICBvYmplY3QgIT09IG51bGwgJiYgb2JqZWN0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwga2V5KTtcblxuLy8gV2hldGhlciBhIGRvdCBub3RhdGlvbiBwYXRoIGNhbiBkZXNjZW5kIGludG8gdGhlIHZhbHVlXG5jb25zdCBpc0NvbnRhaW5lciA9IHZhbHVlID0+XG4gIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIXZhbHVlLl9fdHlwZSAmJiAhdmFsdWUuX19vcDtcblxuLy8gUmVhZHMgYSBkb3Qgbm90YXRpb24gcGF0aCB0aHJvdWdoIG93biBwcm9wZXJ0aWVzIG9mIGNvbnRhaW5lcnMgb25seVxuY29uc3QgZ2V0T3duUGF0aCA9IChvYmplY3QsIHBhdGgpID0+IHtcbiAgbGV0IHZhbHVlID0gb2JqZWN0O1xuICBmb3IgKGNvbnN0IGtleSBvZiBwYXRoKSB7XG4gICAgaWYgKCFpc0NvbnRhaW5lcih2YWx1ZSkgfHwgIWhhc093bih2YWx1ZSwga2V5KSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFsdWUgPSB2YWx1ZVtrZXldO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbi8vIFdoZXRoZXIgYSBkb3Qgbm90YXRpb24ga2V5IHRhcmdldHMgYSBwb2ludGVyJ3Mgb2JqZWN0IElEIChgaWRgL2BvYmplY3RJZGApLlxuLy8gUmVtb3ZpbmcgaXQgbGVhdmVzIHRoZSBwb2ludGVyIHVuc2VyaWFsaXphYmxlIChgdG9Qb2ludGVyYCB0aHJvd3MpLCB3aGljaFxuLy8gY29ycnVwdHMgdGhlIHRyaWdnZXIgb2JqZWN0OyBvdGhlciBzdWIta2V5cyBiZWxvdyBhIHBvaW50ZXIgYXJlIGxlZnQgdG8gdGhlXG4vLyBleGlzdGluZyBoYW5kbGluZy5cbmNvbnN0IHRhcmdldHNQb2ludGVySWQgPSAocm9vdCwga2V5KSA9PiB7XG4gIGNvbnN0IHNlZ21lbnRzID0ga2V5LnNwbGl0KCcuJyk7XG4gIGZvciAobGV0IGRlcHRoID0gMTsgZGVwdGggPCBzZWdtZW50cy5sZW5ndGg7IGRlcHRoKyspIHtcbiAgICBjb25zdCBwYXJlbnQgPSBnZXRPd25QYXRoKHJvb3QsIHNlZ21lbnRzLnNsaWNlKDAsIGRlcHRoKSk7XG4gICAgaWYgKHBhcmVudCAhPT0gbnVsbCAmJiB0eXBlb2YgcGFyZW50ID09PSAnb2JqZWN0JyAmJiBwYXJlbnQuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIGNvbnN0IG5leHQgPSBzZWdtZW50c1tkZXB0aF07XG4gICAgICByZXR1cm4gbmV4dCA9PT0gJ2lkJyB8fCBuZXh0ID09PSAnb2JqZWN0SWQnO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG4vLyBSZXN0b3JlcyBhIHJldmVydGVkIGRvdCBub3RhdGlvbiBrZXkgaW4gdGhlIHJlc3BvbnNlXG5SZXN0V3JpdGUucHJvdG90eXBlLl9yZXN0b3JlUmV2ZXJ0ZWRQYXRoID0gZnVuY3Rpb24gKHJlc3BvbnNlLCB3cml0ZURhdGEsIHdyaXR0ZW4sIGtleSwgZmluYWxPYmplY3QpIHtcbiAgLy8gQSB3cml0ZSBhdCBvciBiZW5lYXRoIHRoZSBrZXkgZ292ZXJuc1xuICBpZiAod3JpdHRlbi5zb21lKGsgPT4gayA9PT0ga2V5IHx8IGsuc3RhcnRzV2l0aChgJHtrZXl9LmApKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gIC8vIEEgcmV0dXJuZWQgb2JqZWN0IHdpdGhvdXQgdGhlIGZpZWxkIGxlYXZlcyB0aGUgc3RvcmVkIHZhbHVlXG4gIGNvbnN0IGZyb21GaW5hbCA9ICEhZmluYWxPYmplY3QgJiYgaGFzT3duKGZpbmFsT2JqZWN0LCBwYXRoWzBdKTtcbiAgbGV0IHZhbHVlID0gZnJvbUZpbmFsID8gZmluYWxPYmplY3QgOiB0aGlzLm9yaWdpbmFsRGF0YSB8fCB7fTtcbiAgbGV0IGRlcHRoID0gMDtcbiAgbGV0IGF1dGhvcml0YXRpdmUgPSBmcm9tRmluYWw7XG4gIGlmICghZnJvbUZpbmFsKSB7XG4gICAgLy8gQSB3cml0dGVuIGFuY2VzdG9yIGdvdmVybnM7IGNvbXB1dGVkIG9wZXJhdGlvbnMgYXJlIHJldHVybmVkIGV4cGFuZGVkXG4gICAgY29uc3QgYW5jZXN0b3IgPSB3cml0dGVuXG4gICAgICAuZmlsdGVyKGsgPT4ga2V5LnN0YXJ0c1dpdGgoYCR7a30uYCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aClbMF07XG4gICAgaWYgKGFuY2VzdG9yKSB7XG4gICAgICBjb25zdCBhbmNlc3RvclBhdGggPSBhbmNlc3Rvci5zcGxpdCgnLicpO1xuICAgICAgbGV0IHJldHVybmVkID0gZ2V0T3duUGF0aChyZXNwb25zZSwgYW5jZXN0b3JQYXRoKTtcbiAgICAgIC8vIEFuIHVuY2hhbmdlZCBjb21wdXRlZCByZXN1bHQgaXMgbm8gbG9uZ2VyIGluIHRoZSByZXNwb25zZVxuICAgICAgY29uc3Qgb3AgPSB3cml0ZURhdGFbYW5jZXN0b3JdPy5fX29wO1xuICAgICAgaWYgKHJldHVybmVkID09PSB1bmRlZmluZWQgJiYgb3AgJiYgb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHJldHVybmVkID0gZ2V0T3duUGF0aCh0aGlzLm9yaWdpbmFsRGF0YSwgYW5jZXN0b3JQYXRoKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlID0gcmV0dXJuZWQgIT09IHVuZGVmaW5lZCA/IHJldHVybmVkIDogd3JpdGVEYXRhW2FuY2VzdG9yXTtcbiAgICAgIGlmICghaXNDb250YWluZXIodmFsdWUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGRlcHRoID0gYW5jZXN0b3JQYXRoLmxlbmd0aDtcbiAgICAgIGF1dGhvcml0YXRpdmUgPSB0cnVlO1xuICAgIH1cbiAgfVxuICB3aGlsZSAoZGVwdGggPCBwYXRoLmxlbmd0aCAmJiBpc0NvbnRhaW5lcih2YWx1ZSkgJiYgaGFzT3duKHZhbHVlLCBwYXRoW2RlcHRoXSkpIHtcbiAgICB2YWx1ZSA9IHZhbHVlW3BhdGhbZGVwdGgrK11dO1xuICB9XG4gIC8vIEEgbWlzc2luZyBhcnJheSBpbmRleCByZXR1cm5zIHRoZSB3aG9sZSBhcnJheSwgc28gdGhlIGNsaWVudCBrZWVwcyBubyBob2xlXG4gIGNvbnN0IG1pc3NpbmdJbmRleCA9IGRlcHRoIDwgcGF0aC5sZW5ndGggJiYgQXJyYXkuaXNBcnJheSh2YWx1ZSkgJiYgL15cXGQrJC8udGVzdChwYXRoW2RlcHRoXSk7XG4gIGlmIChkZXB0aCA8IHBhdGgubGVuZ3RoICYmICFtaXNzaW5nSW5kZXgpIHtcbiAgICBpZiAoaXNDb250YWluZXIodmFsdWUpKSB7XG4gICAgICAvLyBEZWxldGUgYXQgdGhlIGZpcnN0IG1pc3Npbmcga2V5XG4gICAgICBkZXB0aCsrO1xuICAgICAgdmFsdWUgPSB1bmRlZmluZWQ7XG4gICAgfSBlbHNlIGlmICh2YWx1ZT8uX19vcCkge1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB1bmNoYW5nZWQgPSB1dGlsLmlzRGVlcFN0cmljdEVxdWFsKFxuICAgICAgICB2YWx1ZSxcbiAgICAgICAgZ2V0T3duUGF0aCh0aGlzLm9yaWdpbmFsRGF0YSwgcGF0aC5zbGljZSgwLCBkZXB0aCkpXG4gICAgICApO1xuICAgICAgaWYgKCFmcm9tRmluYWwgfHwgdW5jaGFuZ2VkKSB7XG4gICAgICAgIC8vIENsZWFycyB0aGUgY2xpZW50IG9wZXJhdGlvbiBiZW5lYXRoIGFuIHVuY2hhbmdlZCB0eXBlZCB2YWx1ZVxuICAgICAgICBpZiAodmFsdWU/Ll9fdHlwZSAmJiB1bmNoYW5nZWQpIHtcbiAgICAgICAgICByZXNwb25zZVtrZXldID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgdGFyZ2V0ID0gcGF0aC5zbGljZSgwLCBkZXB0aCkuam9pbignLicpO1xuICBjb25zdCBrZXlzID0gWy4uLndyaXR0ZW4sIC4uLk9iamVjdC5rZXlzKHJlc3BvbnNlKV07XG4gIGNvbnN0IG92ZXJsYXBzID0gcHJlZml4ID0+XG4gICAga2V5cy5zb21lKGsgPT4gayA9PT0gcHJlZml4IHx8IGsuc3RhcnRzV2l0aChgJHtwcmVmaXh9LmApIHx8IHByZWZpeC5zdGFydHNXaXRoKGAke2t9LmApKTtcbiAgaWYgKCFhdXRob3JpdGF0aXZlICYmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IG1pc3NpbmdJbmRleCkgJiYgb3ZlcmxhcHModGFyZ2V0KSkge1xuICAgIC8vIEFub3RoZXIgd3JpdGUgY3JlYXRlcyB0aGUgcGF0aDsgY2xlYXIgdGhlIHNoYWxsb3dlc3QgdW50b3VjaGVkIHJldmVydGVkIHBhcnRcbiAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZm9yIChsZXQgbGVuZ3RoID0gZGVwdGggKyAxOyBsZW5ndGggPD0gcGF0aC5sZW5ndGg7IGxlbmd0aCsrKSB7XG4gICAgICAgIGNvbnN0IHByZWZpeCA9IHBhdGguc2xpY2UoMCwgbGVuZ3RoKS5qb2luKCcuJyk7XG4gICAgICAgIGlmICghb3ZlcmxhcHMocHJlZml4KSkge1xuICAgICAgICAgIHJlc3BvbnNlW3ByZWZpeF0gPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3QgcmVzcG9uc2VLZXkgb2YgT2JqZWN0LmtleXMocmVzcG9uc2UpKSB7XG4gICAgaWYgKHJlc3BvbnNlS2V5LnN0YXJ0c1dpdGgoYCR7dGFyZ2V0fS5gKSkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW3Jlc3BvbnNlS2V5XTtcbiAgICB9XG4gIH1cbiAgcmVzcG9uc2VbdGFyZ2V0XSA9IHZhbHVlID09PSB1bmRlZmluZWQgPyB7IF9fb3A6ICdEZWxldGUnIH0gOiB2YWx1ZTtcbn07XG5cbi8vIFRoZSB2YWx1ZSBvZiBhbiBvcGVyYXRpb24gYXBwbGllZCB0byBhbiBlbXB0eSB2YWx1ZVxuY29uc3QgYXBwbGllZFRvRW1wdHkgPSB2YWx1ZSA9PiB7XG4gIHN3aXRjaCAodmFsdWU/Ll9fb3ApIHtcbiAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgcmV0dXJuIHZhbHVlLmFtb3VudDtcbiAgICBjYXNlICdBZGQnOlxuICAgICAgcmV0dXJuIHZhbHVlLm9iamVjdHM7XG4gICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIHJldHVybiBfLnVuaXFXaXRoKHZhbHVlLm9iamVjdHMsIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwpO1xuICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICByZXR1cm4gW107XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgfVxufTtcblxuLy8gU2V0cyB0aGUgZG90IG5vdGF0aW9uIGtleXMgb2YgdGhlIHJlcXVlc3QgaW4gdGhlIHJlc3BvbnNlLCBhcHBsaWVkIHRvIGFuIGVtcHR5IHZhbHVlXG5SZXN0V3JpdGUucHJvdG90eXBlLl9zZXRSZXF1ZXN0UGF0aHMgPSBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgLy8gRmllbGRzIHRoZSByZXNwb25zZSBrZWVwcywgc3VjaCBhcyBvYmplY3RJZFxuICBjb25zdCBrZXB0ID0gT2JqZWN0LmtleXMocmVzcG9uc2UpO1xuICBjb25zdCBhcnJheXMgPSBuZXcgU2V0KCk7XG4gIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMucmVxdWVzdE9wZXJhdGlvbnMpIHtcbiAgICBjb25zdCBzZWdtZW50cyA9IGtleS5zcGxpdCgnLicpO1xuICAgIGlmIChzZWdtZW50cy5sZW5ndGggPCAyIHx8IGtlcHQuaW5jbHVkZXMoc2VnbWVudHNbMF0pKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gVGhlIFNESyBjYW5ub3QgYXBwbHkgYSBkb3Qgbm90YXRpb24gcGF0aCB0byBBQ0xcbiAgICBpZiAoc2VnbWVudHNbMF0gPT09ICdBQ0wnKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3Qgb3AgPSB2YWx1ZT8uX19vcDtcbiAgICAvLyBBbm90aGVyIG9wZXJhdGlvbiwgc3VjaCBhcyBhIHJlbGF0aW9uIG9wZXJhdGlvbiwgaGFzIG5vIHZhbHVlXG4gICAgaWYgKG9wICYmIG9wICE9PSAnRGVsZXRlJyAmJiAhY29tcHV0ZWRPcGVyYXRpb25zLmluY2x1ZGVzKG9wKSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIEFuIGluZGV4IGJlbG93IGFuIEFycmF5IGZpZWxkXG4gICAgaWYgKFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIuZ2V0RXhwZWN0ZWRUeXBlKHRoaXMuY2xhc3NOYW1lLCBzZWdtZW50c1swXSk/LnR5cGUgPT09ICdBcnJheScgJiZcbiAgICAgIC9eXFxkKyQvLnRlc3Qoc2VnbWVudHNbMV0pXG4gICAgKSB7XG4gICAgICBhcnJheXMuYWRkKHNlZ21lbnRzWzBdKTtcbiAgICB9XG4gICAgbGV0IGNvbnRhaW5lciA9IHJlc3BvbnNlO1xuICAgIGZvciAoY29uc3Qgc2VnbWVudCBvZiBzZWdtZW50cy5zbGljZSgwLCAtMSkpIHtcbiAgICAgIGlmICghaGFzT3duKGNvbnRhaW5lciwgc2VnbWVudCkgfHwgIWlzQ29udGFpbmVyKGNvbnRhaW5lcltzZWdtZW50XSkpIHtcbiAgICAgICAgY29udGFpbmVyW3NlZ21lbnRdID0ge307XG4gICAgICB9XG4gICAgICBjb250YWluZXIgPSBjb250YWluZXJbc2VnbWVudF07XG4gICAgfVxuICAgIC8vIEFuIHVuc2V0IGxlYXZlcyBvbmx5IHRoZSBwYXJlbnRzXG4gICAgaWYgKG9wICE9PSAnRGVsZXRlJykge1xuICAgICAgY29udGFpbmVyW3NlZ21lbnRzW3NlZ21lbnRzLmxlbmd0aCAtIDFdXSA9IGFwcGxpZWRUb0VtcHR5KHZhbHVlKTtcbiAgICB9XG4gIH1cbiAgLy8gT25seSB0aGUgZWxlbWVudHMgb2YgdGhlIHJlcXVlc3QsIGluIGluZGV4IG9yZGVyXG4gIGZvciAoY29uc3QgZmllbGQgb2YgYXJyYXlzKSB7XG4gICAgcmVzcG9uc2VbZmllbGRdID0gT2JqZWN0LnZhbHVlcyhyZXNwb25zZVtmaWVsZF0pO1xuICB9XG59O1xuXG4vLyBXaGV0aGVyIHRoZSBjYWxsZXIgY2FuIHJlYWQgdGhlIG9iamVjdCBhcyB3cml0dGVuOyBjaGFuZ2VzIGFmdGVyIHRoZSB3cml0ZSBhcmUgbm90IGNvbnNpZGVyZWRcblJlc3RXcml0ZS5wcm90b3R5cGUuX2NhblJlYWRXcml0dGVuT2JqZWN0ID0gZnVuY3Rpb24gKGFjbEdyb3VwKSB7XG4gIGNvbnN0IHJlYWRlcnMgPSB0aGlzLndyaXR0ZW5SZWFkQWNjZXNzO1xuICAvLyBBIHdyaXRlIHJlc3VsdCB3aXRob3V0IHZhbGlkIHJlYWQgYWNjZXNzIGZhaWxzIGNsb3NlZFxuICBpZiAocmVhZGVycyAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShyZWFkZXJzKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBUaGUgb2JqZWN0IEFDTFxuICBpZiAocmVhZGVycyAmJiAhcmVhZGVycy5zb21lKHJlYWRlciA9PiBhY2xHcm91cC5pbmNsdWRlcyhyZWFkZXIpKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBBIGNsaWVudCByZWFkcyBhIHNlc3Npb24gd2l0aCBhIGZpbmQgY29uc3RyYWluZWQgdG8gdGhlIHNlc3Npb24gdXNlclxuICBjb25zdCBvcGVyYXRpb24gPSB0aGlzLmNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyA/ICdmaW5kJyA6ICdnZXQnO1xuICBjb25zdCBwZXJtaXNzaW9ucyA9IHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh0aGlzLmNsYXNzTmFtZSk7XG4gIGlmIChcbiAgICBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIucGVybWlzc2lvbkRlbmlhbChcbiAgICAgIHBlcm1pc3Npb25zLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvblxuICAgIClcbiAgKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIFRoZSBwb2ludGVyIHBlcm1pc3Npb25zIG9mIHRoZSB3cml0dGVuIG9iamVjdFxuICBjb25zdCB1c2VycyA9IGFjbEdyb3VwLmZpbHRlcihlbnRyeSA9PiBlbnRyeSAhPT0gJyonICYmICFlbnRyeS5zdGFydHNXaXRoKCdyb2xlOicpKTtcbiAgcmV0dXJuIFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlci50ZXN0UG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHBlcm1pc3Npb25zLFxuICAgIGFjbEdyb3VwLFxuICAgIG9wZXJhdGlvbixcbiAgICB1c2Vycy5sZW5ndGggPT09IDEgPyB1c2Vyc1swXSA6IHVuZGVmaW5lZCxcbiAgICBmaWVsZCA9PiB7XG4gICAgICBsZXQgdmFsdWUgPSB0aGlzLndyaXR0ZW5PYmplY3Q/LltmaWVsZF07XG4gICAgICAvLyBBIGNyZWF0ZSBzdG9yZXMgYW4gb3BlcmF0aW9uIGFwcGxpZWQgdG8gYW4gZW1wdHkgdmFsdWVcbiAgICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgICB2YWx1ZSA9IGFwcGxpZWRUb0VtcHR5KHZhbHVlKTtcbiAgICAgIH1cbiAgICAgIC8vIEFuIHVwZGF0ZSByZXN1bHQgb2YgdGhlIFBvc3RncmVzIGFkYXB0ZXIgaGFzIHRoZSBvYmplY3RJZCBvZiBhIHBvaW50ZXJcbiAgICAgIGNvbnN0IGV4cGVjdGVkID0gdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIuZ2V0RXhwZWN0ZWRUeXBlKHRoaXMuY2xhc3NOYW1lLCBmaWVsZCk7XG4gICAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiBleHBlY3RlZD8udHlwZSA9PT0gJ1BvaW50ZXInXG4gICAgICAgID8geyBfX3R5cGU6ICdQb2ludGVyJywgY2xhc3NOYW1lOiBleHBlY3RlZC50YXJnZXRDbGFzcywgb2JqZWN0SWQ6IHZhbHVlIH1cbiAgICAgICAgOiB2YWx1ZTtcbiAgICB9XG4gICk7XG59O1xuXG4vLyBSZXR1cm5zIHN0b3JlZCB2YWx1ZXMgaW4gYSBzYXZlIHJlc3BvbnNlIG9ubHkgaWYgdGhlIGNhbGxlciBjYW4gcmVhZCB0aGUgb2JqZWN0IGFzIHdyaXR0ZW5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmlsdGVyVW5yZWFkYWJsZUZpZWxkc0luUmVzcG9uc2UgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IHJlc3BvbnNlID0gdGhpcy5yZXNwb25zZT8ucmVzcG9uc2U7XG4gIGlmICghcmVzcG9uc2UgfHwgdGhpcy5zdG9yYWdlLnJlc3BvbnNlRnJvbVRyaWdnZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gTG9naW4gYW5kIHNlc3Npb24gcmVxdWVzdHMgYnVpbGQgdGhlaXIgb3duIHJlc3BvbnNlXG4gIGlmICghdGhpcy5xdWVyeSAmJiB0aGlzLndyaXR0ZW5SZWFkQWNjZXNzID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBIHNlc3Npb24gdG9rZW4gaXNzdWVkIGJ5IHRoaXMgcmVxdWVzdCBpcyBub3QgYSBzdG9yZWQgdmFsdWVcbiAgY29uc3QgaXNzdWVkID0gdGhpcy5zdG9yYWdlLmlzc3VlZFNlc3Npb25Ub2tlbjtcbiAgLy8gTm9yIGlzIGEgcmVxdWlyZWQgY29sdW1uIHRoYXQgZWNob2VzIHRoZSBjYWxsZXIncyB1bmNoYW5nZWQgaW5wdXRcbiAgY29uc3QgZWNob2VkID0ga2V5ID0+XG4gICAgKHJlcXVpcmVkQ29sdW1ucy5yZWFkW3RoaXMuY2xhc3NOYW1lXSB8fCBbXSkuaW5jbHVkZXMoa2V5KSAmJlxuICAgICEodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHwgW10pLmluY2x1ZGVzKGtleSkgJiZcbiAgICAhKGtleSA9PT0gJ3VzZXJuYW1lJyAmJiB0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lKSAmJlxuICAgIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwocmVzcG9uc2Vba2V5XSwgdGhpcy5kYXRhW2tleV0pO1xuICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhyZXNwb25zZSkuZmlsdGVyKFxuICAgIGtleSA9PlxuICAgICAgIVsnb2JqZWN0SWQnLCAnY3JlYXRlZEF0JywgJ3VwZGF0ZWRBdCddLmluY2x1ZGVzKGtleSkgJiZcbiAgICAgICEoa2V5ID09PSAnc2Vzc2lvblRva2VuJyAmJiBpc3N1ZWQgJiYgcmVzcG9uc2Vba2V5XSA9PT0gaXNzdWVkKSAmJlxuICAgICAgIWVjaG9lZChrZXkpXG4gICk7XG4gIGlmICghZmllbGRzLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBIHNpZ24tdXAgcmVzcG9uc2UgaXMgZm9yIHRoZSBuZXcgdXNlciBpZiBpdCBpc3N1ZXMgdGhlIG5ldyB1c2VyIGEgc2Vzc2lvblxuICBjb25zdCBzaWduVXAgPSAhdGhpcy5xdWVyeSAmJiB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiAhIWlzc3VlZDtcbiAgY29uc3QgYWNsR3JvdXAgPSBzaWduVXAgPyBbJyonLCB0aGlzLmRhdGEub2JqZWN0SWRdIDogdGhpcy5ydW5PcHRpb25zLmFjbCB8fCBbXTtcbiAgaWYgKCF0aGlzLl9jYW5SZWFkV3JpdHRlbk9iamVjdChhY2xHcm91cCkpIHtcbiAgICAvLyBObyBzdG9yZWQgdmFsdWVzIGZvciBhIGNhbGxlciB3aG8gY2Fubm90IHJlYWQgdGhlIG9iamVjdFxuICAgIGZvciAoY29uc3Qga2V5IG9mIGZpZWxkcykge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2tleV07XG4gICAgfVxuICAgIHRoaXMuX3NldFJlcXVlc3RQYXRocyhyZXNwb25zZSk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEgPSBmdW5jdGlvbiAocmVzcG9uc2UsIGRhdGEsIGlzRmluYWxPYmplY3QgPSBmYWxzZSkge1xuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHModGhpcy5wZW5kaW5nT3BzLmlkZW50aWZpZXIpO1xuICBsZXQgcmV2ZXJ0ZWREYXRhO1xuICBjb25zdCByZXZlcnRlZFBhdGhzID0gW107XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucGVuZGluZ09wcy5vcGVyYXRpb25zKSB7XG4gICAgaWYgKHBlbmRpbmdba2V5XSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIFRoZSBTREsgY2Fubm90IGFwcGx5IGFuIG9wZXJhdGlvbiBvciBhIGRvdCBub3RhdGlvbiBwYXRoIHRvIEFDTFxuICAgIGlmIChrZXkuc3RhcnRzV2l0aCgnQUNMLicpIHx8IChrZXkgPT09ICdBQ0wnICYmICFoYXNPd24odGhpcy5vcmlnaW5hbERhdGEsICdBQ0wnKSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoa2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgIHJldmVydGVkUGF0aHMucHVzaChrZXkpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIFJlc3BvbnNlIG9ubHk7IHRoZSB3cml0ZSBkYXRhIGJ1aWxkcyB0aGUgYWZ0ZXJTYXZlIGFuZCBMaXZlUXVlcnkgb2JqZWN0c1xuICAgIHJldmVydGVkRGF0YSB8fD0geyAuLi5kYXRhIH07XG4gICAgcmV2ZXJ0ZWREYXRhW2tleV0gPSBoYXNPd24odGhpcy5vcmlnaW5hbERhdGEsIGtleSlcbiAgICAgID8gdGhpcy5vcmlnaW5hbERhdGFba2V5XVxuICAgICAgOiB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHw9IFtdO1xuICAgIC8vIE9uY2Ugb25seSwgc28gYW4gYWZ0ZXJTYXZlIHVuc2V0IGlzIG5vdCB1bmRvbmUgYnkgYSBzZWNvbmQgZW50cnlcbiAgICBpZiAodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuaW5kZXhPZihrZXkpIDwgMCkge1xuICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChrZXkpO1xuICAgIH1cbiAgfVxuICBjb25zdCByZXNwb25zZURhdGEgPSByZXZlcnRlZERhdGEgfHwgZGF0YTtcbiAgLy8gVGhlIGZpbmFsIG9iamVjdCwgYmVmb3JlIHVuY2hhbmdlZCBmaWVsZHMgYXJlIHJlbW92ZWQgZnJvbSB0aGUgcmVzcG9uc2VcbiAgY29uc3QgZmluYWxPYmplY3QgPSBpc0ZpbmFsT2JqZWN0ICYmIHJldmVydGVkUGF0aHMubGVuZ3RoID8geyAuLi5yZXNwb25zZSB9IDogdW5kZWZpbmVkO1xuICBjb25zdCBza2lwS2V5cyA9IFsuLi4ocmVxdWlyZWRDb2x1bW5zLnJlYWRbdGhpcy5jbGFzc05hbWVdIHx8IFtdKV07XG4gIGlmICghdGhpcy5xdWVyeSkge1xuICAgIHNraXBLZXlzLnB1c2goJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcpO1xuICB9IGVsc2Uge1xuICAgIHNraXBLZXlzLnB1c2goJ3VwZGF0ZWRBdCcpO1xuICAgIGRlbGV0ZSByZXNwb25zZS5vYmplY3RJZDtcbiAgfVxuICAvLyBUaGUgY2xpZW50J3Mgb3BlcmF0aW9uIHJlc3VsdHMgYW5kIGRvdCBub3RhdGlvbiBwYXJlbnRzLCBhbHNvIGlmIHVuY2hhbmdlZFxuICBjb25zdCByZXF1ZXN0ZWQgPSB0aGlzLnJlcXVlc3RPcGVyYXRpb25zXG4gICAgLmZpbHRlcigoW2tleV0pID0+XG4gICAgICBrZXkuaW5jbHVkZXMoJy4nKSA/IGhhc093bihkYXRhLCBrZXkpIDogY29tcHV0ZWRPcGVyYXRpb25zLmluY2x1ZGVzKGRhdGFba2V5XT8uX19vcClcbiAgICApXG4gICAgLm1hcCgoW2tleV0pID0+IGtleS5zcGxpdCgnLicpWzBdKTtcbiAgZm9yIChjb25zdCBrZXkgaW4gcmVzcG9uc2UpIHtcbiAgICBpZiAoc2tpcEtleXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gcmVzcG9uc2Vba2V5XTtcbiAgICBpZiAoXG4gICAgICB2YWx1ZSA9PSBudWxsIHx8XG4gICAgICAodmFsdWUuX190eXBlICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICAgdXRpbC5pc0RlZXBTdHJpY3RFcXVhbChyZXNwb25zZURhdGFba2V5XSwgdmFsdWUpIHx8XG4gICAgICAoIXJlcXVlc3RlZC5pbmNsdWRlcyhrZXkpICYmIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwoKHRoaXMub3JpZ2luYWxEYXRhIHx8IHt9KVtrZXldLCB2YWx1ZSkpXG4gICAgKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2Vba2V5XTtcbiAgICB9XG4gIH1cbiAgKHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZGF0YVZhbHVlID0gcmVzcG9uc2VEYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2VbZmllbGROYW1lXSAmJiByZXNwb25zZVtmaWVsZE5hbWVdLl9fb3ApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtmaWVsZE5hbWVdO1xuICAgICAgaWYgKGRhdGFWYWx1ZS5fX29wID09ICdEZWxldGUnKSB7XG4gICAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKHJldmVydGVkUGF0aHMubGVuZ3RoKSB7XG4gICAgY29uc3Qgd3JpdHRlbiA9IE9iamVjdC5rZXlzKGRhdGEpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHJldmVydGVkUGF0aHMpIHtcbiAgICAgIHRoaXMuX3Jlc3RvcmVSZXZlcnRlZFBhdGgocmVzcG9uc2UsIGRhdGEsIHdyaXR0ZW4sIGtleSwgZmluYWxPYmplY3QpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBY0EsSUFBQUEsVUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsT0FBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUcsYUFBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksaUJBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLE1BQUEsR0FBQUwsT0FBQTtBQUErQyxTQUFBRCx1QkFBQU8sQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQW5CL0M7QUFDQTtBQUNBOztBQUVBLElBQUlHLGdCQUFnQixHQUFHVCxPQUFPLENBQUMsZ0NBQWdDLENBQUM7QUFHaEUsTUFBTVUsSUFBSSxHQUFHVixPQUFPLENBQUMsUUFBUSxDQUFDO0FBQzlCLE1BQU1XLEtBQUssR0FBR1gsT0FBTyxDQUFDLFNBQVMsQ0FBQztBQUNoQyxJQUFJWSxXQUFXLEdBQUdaLE9BQU8sQ0FBQyxlQUFlLENBQUM7QUFDMUMsSUFBSWEsY0FBYyxHQUFHYixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQzFDLElBQUljLEtBQUssR0FBR2QsT0FBTyxDQUFDLFlBQVksQ0FBQztBQUNqQyxJQUFJZSxRQUFRLEdBQUdmLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFDcEMsTUFBTWdC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