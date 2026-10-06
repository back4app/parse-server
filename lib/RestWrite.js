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
  // Validate basic email address format
  if (!this.data.email.match(/^.+@.+$/)) {
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
      return this.config.database.update(this.className, this.query, this.data, this.runOptions, false, false, this.validSchemaController).catch(error => {
        this._throwIfAuthDataDuplicate(error);
        throw error;
      }).then(response => {
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
      this.pendingOps.operations = {};
      this.response.response = result;
    } else {
      this.response.response = this._updateResponseWithData((result || updatedObject).toJSON(), this.data);
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
  Object.keys(this.data).reduce(function (data, key) {
    if (key.indexOf('.') > 0) {
      if (typeof data[key].__op === 'string') {
        if (!readOnlyAttributes.includes(key)) {
          updatedObject.set(key, data[key]);
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
RestWrite.prototype._updateResponseWithData = function (response, data) {
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(this.pendingOps.identifier);
  for (const key in this.pendingOps.operations) {
    if (!pending[key]) {
      data[key] = this.originalData ? this.originalData[key] : {
        __op: 'Delete'
      };
      this.storage.fieldsChangedByTrigger.push(key);
    }
  }
  const skipKeys = [...(_SchemaController.requiredColumns.read[this.className] || [])];
  if (!this.query) {
    skipKeys.push('objectId', 'createdAt');
  } else {
    skipKeys.push('updatedAt');
    delete response.objectId;
  }
  for (const key in response) {
    if (skipKeys.includes(key)) {
      continue;
    }
    const value = response[key];
    if (value == null || value.__type && value.__type === 'Pointer' || util.isDeepStrictEqual(data[key], value) || util.isDeepStrictEqual((this.originalData || {})[key], value)) {
      delete response[key];
    }
  }
  if (_lodash.default.isEmpty(this.storage.fieldsChangedByTrigger)) {
    return response;
  }
  this.storage.fieldsChangedByTrigger.forEach(fieldName => {
    const dataValue = data[fieldName];
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
  return response;
};
var _default = exports.default = RestWrite;
module.exports = RestWrite;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUmVzdFF1ZXJ5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2xvZ2dlciIsIl9BdXRoRGF0YUxvY2siLCJfU2NoZW1hQ29udHJvbGxlciIsIl9FcnJvciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJBdXRoIiwiVXRpbHMiLCJjcnlwdG9VdGlscyIsInBhc3N3b3JkQ3J5cHRvIiwiUGFyc2UiLCJ0cmlnZ2VycyIsInV0aWwiLCJSZXN0V3JpdGUiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwicXVlcnkiLCJkYXRhIiwib3JpZ2luYWxEYXRhIiwiY29udGV4dCIsImFjdGlvbiIsImlzUmVhZE9ubHkiLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm9iamVjdElkIiwiTUlTU0lOR19PQkpFQ1RfSUQiLCJJTlZBTElEX0tFWV9OQU1FIiwiaWQiLCJyZXNwb25zZSIsInN0cnVjdHVyZWRDbG9uZSIsInVwZGF0ZWRBdCIsIl9lbmNvZGUiLCJEYXRlIiwiaXNvIiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwicGVuZGluZ09wcyIsIm9wZXJhdGlvbnMiLCJpZGVudGlmaWVyIiwiZXhlY3V0ZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImdldFVzZXJBbmRSb2xlQUNMIiwidmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uIiwiaGFuZGxlSW5zdGFsbGF0aW9uIiwiaGFuZGxlU2Vzc2lvbiIsImF1dGhvcml6ZVVzZXJVcGRhdGUiLCJ2YWxpZGF0ZUF1dGhEYXRhIiwiY2hlY2tSZXN0cmljdGVkRmllbGRzIiwicmVzb2x2ZUZpbGVVcmxzIiwicnVuQmVmb3JlU2F2ZVRyaWdnZXIiLCJlbnN1cmVVbmlxdWVBdXRoRGF0YUlkIiwiZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQiLCJ2YWxpZGF0ZVNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJzZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkIiwidHJhbnNmb3JtVXNlciIsImV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzIiwiZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyIsInJ1bkRhdGFiYXNlT3BlcmF0aW9uIiwiY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQiLCJoYW5kbGVGb2xsb3d1cCIsInJ1bkFmdGVyU2F2ZVRyaWdnZXIiLCJjbGVhblVzZXJBdXRoRGF0YSIsImF1dGhEYXRhUmVzcG9uc2UiLCJyZWplY3RTaWdudXAiLCJwcmV2ZW50U2lnbnVwV2l0aFVudmVyaWZpZWRFbWFpbCIsIkVNQUlMX05PVF9GT1VORCIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsImFjbCIsInVzZXIiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImNvbmNhdCIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJpbmRleE9mIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiaGFzQ2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsImZpbGVzIiwiY3JlYXRlIiwiY29sbGVjdCIsInZhbHVlIiwiX190eXBlIiwibmFtZSIsIklOQ09SUkVDVF9UWVBFIiwidXJsIiwidmFsdWVzIiwiZm9yRWFjaCIsImtleXMiLCJsZW5ndGgiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiZmlsZVVybHMiLCJhc3NpZ24iLCJjbG9uZVdpdGhGaWxlVXJscyIsIm9iamVjdCIsImFkZFVybHMiLCJmaWxlIiwibWFueSIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJhcHBsaWNhdGlvbklkIiwib3JpZ2luYWxPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwic3RhdGVDb250cm9sbGVyIiwiQ29yZU1hbmFnZXIiLCJnZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIiLCJwZW5kaW5nIiwiZ2V0UGVuZGluZ09wcyIsImRhdGFiYXNlUHJvbWlzZSIsInVwZGF0ZSIsInJlc3VsdCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJtYXliZVJ1blRyaWdnZXIiLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiXyIsInJlZHVjZSIsImtleSIsImlzRXF1YWwiLCJwdXNoIiwiY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMiLCJlcnJvciIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJleHRyYURhdGEiLCJpbmZsYXRlIiwiZ2V0QWxsQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJzY2hlbWEiLCJmaW5kIiwib25lQ2xhc3MiLCJzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQiLCJmaWVsZE5hbWUiLCJzZXREZWZhdWx0IiwidW5kZWZpbmVkIiwiX19vcCIsImZpZWxkcyIsImRlZmF1bHRWYWx1ZSIsInJlcXVpcmVkIiwiVkFMSURBVElPTl9FUlJPUiIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIkFDTCIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZWFkIiwid3JpdGUiLCJjdXJyZW50VXNlciIsImNyZWF0ZWRBdCIsIm5ld09iamVjdElkIiwib2JqZWN0SWRTaXplIiwiYXV0aERhdGEiLCJoYXNVc2VybmFtZUFuZFBhc3N3b3JkIiwidXNlcm5hbWUiLCJwYXNzd29yZCIsImhhc0F1dGhEYXRhIiwic29tZSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwicHJvdmlkZXJBdXRoRGF0YSIsImdldFVzZXJJZCIsImhhbmRsZUF1dGhEYXRhIiwiZmlsdGVyZWRPYmplY3RzQnlBQ0wiLCJvYmplY3RzIiwiZmlsdGVyIiwiX3Rocm93SWZBdXRoRGF0YUR1cGxpY2F0ZSIsImNvZGUiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJzdGFydHNXaXRoIiwiQUNDT1VOVF9BTFJFQURZX0xJTktFRCIsImhhc0F1dGhEYXRhSWQiLCJyIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwicmVzdWx0cyIsInVzZXJJZCIsInVzZXJSZXN1bHQiLCJmb3VuZFVzZXJJc05vdEN1cnJlbnRVc2VyIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwidmFsaWRhdGVkQXV0aERhdGEiLCJhdXRoUHJvdmlkZXIiLCJqb2luIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwibXV0YXRlZEF1dGhEYXRhIiwiaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyIiwiaXNMb2dpbiIsImxvY2F0aW9uIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJyZXMiLCJvcmlnaW5hbEF1dGhEYXRhIiwiZnJvbUVudHJpZXMiLCJlbnRyaWVzIiwibWFwIiwiayIsInYiLCJhcHBseUF1dGhEYXRhT3B0aW1pc3RpY0xvY2siLCJTQ1JJUFRfRkFJTEVEIiwidmFsaWRhdGVXcml0ZVBlcm1pc3Npb24iLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJpc1VuYXV0aGVudGljYXRlZCIsIlNFU1NJT05fTUlTU0lORyIsInByb21pc2UiLCJSZXN0UXVlcnkiLCJtZXRob2QiLCJNZXRob2QiLCJtYXN0ZXIiLCJydW5CZWZvcmVGaW5kIiwicmVzdFdoZXJlIiwic2Vzc2lvbiIsImNhY2hlQ29udHJvbGxlciIsImRlbCIsInNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwiaGFzaCIsImhhc2hlZFBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsIl92YWxpZGF0ZVVzZXJOYW1lIiwiX3ZhbGlkYXRlRW1haWwiLCJyYW5kb21TdHJpbmciLCJyZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSIsIiRuZSIsImxpbWl0IiwiY2FzZUluc2Vuc2l0aXZlIiwiVVNFUk5BTUVfVEFLRU4iLCJlbWFpbCIsIm1hdGNoIiwicmVqZWN0IiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwiRU1BSUxfVEFLRU4iLCJyZXF1ZXN0Iiwib3JpZ2luYWwiLCJpcCIsImluc3RhbGxhdGlvbklkIiwidXNlckNvbnRyb2xsZXIiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwicGFzc3dvcmRQb2xpY3kiLCJfdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyIsIl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSIsInBvbGljeUVycm9yIiwidmFsaWRhdGlvbkVycm9yIiwiY29udGFpbnNVc2VybmFtZUVycm9yIiwicGF0dGVyblZhbGlkYXRvciIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5IiwibWFpbnRlbmFuY2UiLCJvbGRQYXNzd29yZHMiLCJfcGFzc3dvcmRfaGlzdG9yeSIsInRha2UiLCJuZXdQYXNzd29yZCIsInByb21pc2VzIiwiY29tcGFyZSIsImFsbCIsImNhdGNoIiwiZXJyIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJjcmVhdGVTZXNzaW9uVG9rZW4iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsInRva2VuIiwibmV3VG9rZW4iLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwidmFsaWRhdGVkIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiYWN0dWFsVHlwZSIsIkFycmF5IiwiaXNBcnJheSIsInJlcGxhY2UiLCJjaGFyYWN0ZXIiLCJ0b1VwcGVyQ2FzZSIsImRldmljZVRva2VuIiwidG9Mb3dlckNhc2UiLCJkZXZpY2VUeXBlIiwiaWRNYXRjaCIsIm9iamVjdElkTWF0Y2giLCJpbnN0YWxsYXRpb25JZE1hdGNoIiwiZGV2aWNlVG9rZW5NYXRjaGVzIiwib3JRdWVyaWVzIiwiJG9yIiwiZGVsUXVlcnkiLCJhcHBJZGVudGlmaWVyIiwib2JqSWQiLCJyb2xlIiwiY2xlYXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiY2xlYXJDYWNoZWRSb2xlcyIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiSU5WQUxJRF9BQ0wiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJoYXNBZnRlclNhdmVIb29rIiwiYWZ0ZXJTYXZlIiwiaGFzTGl2ZVF1ZXJ5IiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJsb2dnZXIiLCJqc29uUmV0dXJuZWQiLCJfdG9GdWxsSlNPTiIsInRvSlNPTiIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsImZyb21KU09OIiwicmVhZE9ubHlBdHRyaWJ1dGVzIiwiY29uc3RydWN0b3IiLCJpc1JvbGVBZnRlclNhdmUiLCJpbmNsdWRlcyIsImF0dHJpYnV0ZSIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2FuaXRpemVkIiwic2tpcEtleXMiLCJyZXF1aXJlZENvbHVtbnMiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImRhdGFWYWx1ZSIsIl9kZWZhdWx0IiwiZXhwb3J0cyIsIm1vZHVsZSJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBSZXN0V3JpdGUgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcblxuXG5jb25zdCBBdXRoID0gcmVxdWlyZSgnLi9BdXRoJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4vVXRpbHMnKTtcbnZhciBjcnlwdG9VdGlscyA9IHJlcXVpcmUoJy4vY3J5cHRvVXRpbHMnKTtcbnZhciBwYXNzd29yZENyeXB0byA9IHJlcXVpcmUoJy4vcGFzc3dvcmQnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbnZhciB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCB7IGFwcGx5QXV0aERhdGFPcHRpbWlzdGljTG9jayB9IGZyb20gJy4vQXV0aERhdGFMb2NrJztcbmltcG9ydCB7IHJlcXVpcmVkQ29sdW1ucyB9IGZyb20gJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBjcmVhdGVTYW5pdGl6ZWRFcnJvciB9IGZyb20gJy4vRXJyb3InO1xuXG4vLyBxdWVyeSBhbmQgZGF0YSBhcmUgYm90aCBwcm92aWRlZCBpbiBSRVNUIEFQSSBmb3JtYXQuIFNvIGRhdGFcbi8vIHR5cGVzIGFyZSBlbmNvZGVkIGJ5IHBsYWluIG9sZCBvYmplY3RzLlxuLy8gSWYgcXVlcnkgaXMgbnVsbCwgdGhpcyBpcyBhIFwiY3JlYXRlXCIgYW5kIHRoZSBkYXRhIGluIGRhdGEgc2hvdWxkIGJlXG4vLyBjcmVhdGVkLlxuLy8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gXCJ1cGRhdGVcIiAtIHRoZSBvYmplY3QgbWF0Y2hpbmcgdGhlIHF1ZXJ5XG4vLyBzaG91bGQgZ2V0IHVwZGF0ZWQgd2l0aCBkYXRhLlxuLy8gUmVzdFdyaXRlIHdpbGwgaGFuZGxlIG9iamVjdElkLCBjcmVhdGVkQXQsIGFuZCB1cGRhdGVkQXQgZm9yXG4vLyBldmVyeXRoaW5nLiBJdCBhbHNvIGtub3dzIHRvIHVzZSB0cmlnZ2VycyBhbmQgc3BlY2lhbCBtb2RpZmljYXRpb25zXG4vLyBmb3IgdGhlIF9Vc2VyIGNsYXNzLlxuZnVuY3Rpb24gUmVzdFdyaXRlKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBxdWVyeSwgZGF0YSwgb3JpZ2luYWxEYXRhLCBjb250ZXh0LCBhY3Rpb24pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICdDYW5ub3QgcGVyZm9ybSBhIHdyaXRlIG9wZXJhdGlvbiB3aGVuIHVzaW5nIHJlYWRPbmx5TWFzdGVyS2V5JyxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gIH1cbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLnN0b3JhZ2UgPSB7fTtcbiAgdGhpcy5ydW5PcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG5cbiAgaWYgKGFjdGlvbikge1xuICAgIHRoaXMucnVuT3B0aW9ucy5hY3Rpb24gPSBhY3Rpb247XG4gIH1cblxuICBpZiAoIXF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgJ29iamVjdElkJykgJiYgIWRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk1JU1NJTkdfT0JKRUNUX0lELFxuICAgICAgICAgICdvYmplY3RJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCBvciB1bmRlZmluZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgICAgaWYgKGRhdGEuaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdpZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gV2hlbiB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlLCB0aGlzLnJlc3BvbnNlIG1heSBoYXZlIHNldmVyYWxcbiAgLy8gZmllbGRzLlxuICAvLyByZXNwb25zZTogdGhlIGFjdHVhbCBkYXRhIHRvIGJlIHJldHVybmVkXG4gIC8vIHN0YXR1czogdGhlIGh0dHAgc3RhdHVzIGNvZGUuIGlmIG5vdCBwcmVzZW50LCB0cmVhdGVkIGxpa2UgYSAyMDBcbiAgLy8gbG9jYXRpb246IHRoZSBsb2NhdGlvbiBoZWFkZXIuIGlmIG5vdCBwcmVzZW50LCBubyBsb2NhdGlvbiBoZWFkZXJcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG5cbiAgLy8gUHJvY2Vzc2luZyB0aGlzIG9wZXJhdGlvbiBtYXkgbXV0YXRlIG91ciBkYXRhLCBzbyB3ZSBvcGVyYXRlIG9uIGFcbiAgLy8gY29weVxuICB0aGlzLnF1ZXJ5ID0gc3RydWN0dXJlZENsb25lKHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gc3RydWN0dXJlZENsb25lKGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7XG4gICAgb3BlcmF0aW9uczogbnVsbCxcbiAgICBpZGVudGlmaWVyOiBudWxsLFxuICB9O1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5hdXRob3JpemVVc2VyVXBkYXRlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jaGVja1Jlc3RyaWN0ZWRGaWVsZHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc29sdmVGaWxlVXJscygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEFwcGVuZCB0aGUgYXV0aERhdGFSZXNwb25zZSBpZiBleGlzdHNcbiAgICAgIGlmICh0aGlzLmF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgICAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFSZXNwb25zZSA9IHRoaXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuc3RvcmFnZS5yZWplY3RTaWdudXAgJiYgdGhpcy5jb25maWcucHJldmVudFNpZ251cFdpdGhVbnZlcmlmaWVkRW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3Mgbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIHNjaGVtYS5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVTY2hlbWEgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS52YWxpZGF0ZU9iamVjdChcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLmRhdGEsXG4gICAgdGhpcy5xdWVyeSxcbiAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2VcbiAgKTtcbn07XG5cbi8vIFJlc29sdmVzIHRoZSBVUkxzIG9mIGZpbGUgcG9pbnRlcnMgaW4gdGhlIGRhdGEgdGhhdCBoYXZlIG5vIFVSTCwgc28gdGhhdCB0aGVcbi8vIFBhcnNlIG9iamVjdHMgYnVpbHQgZm9yIHRyaWdnZXJzIGFuZCBMaXZlUXVlcnkgY2FuIGJlIGVuY29kZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJlc29sdmVGaWxlVXJscyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZmlsZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICBjb25zdCBjb2xsZWN0ID0gdmFsdWUgPT4ge1xuICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUubmFtZSAhPT0gJ3N0cmluZycgfHwgdmFsdWUubmFtZSA9PT0gJycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCAnVGhpcyBpcyBub3QgYSB2YWxpZCBGaWxlJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXZhbHVlLnVybCkge1xuICAgICAgICBmaWxlc1t2YWx1ZS5uYW1lXSA9IHsgX190eXBlOiAnRmlsZScsIG5hbWU6IHZhbHVlLm5hbWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgT2JqZWN0LnZhbHVlcyh2YWx1ZSkuZm9yRWFjaChjb2xsZWN0KTtcbiAgfTtcbiAgY29sbGVjdCh0aGlzLmRhdGEpO1xuICBpZiAoT2JqZWN0LmtleXMoZmlsZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgZmlsZXMpO1xuICB0aGlzLmZpbGVVcmxzID0gT2JqZWN0LmFzc2lnbih0aGlzLmZpbGVVcmxzIHx8IE9iamVjdC5jcmVhdGUobnVsbCksIGZpbGVzKTtcbn07XG5cbi8vIFJldHVybnMgYSBjb3B5IG9mIHRoZSBkYXRhIHdpdGggdGhlIHJlc29sdmVkIFVSTHMgYWRkZWQgdG8gZmlsZSBwb2ludGVycy5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2xvbmVXaXRoRmlsZVVybHMgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gIGNvbnN0IGRhdGEgPSBzdHJ1Y3R1cmVkQ2xvbmUob2JqZWN0KTtcbiAgaWYgKCF0aGlzLmZpbGVVcmxzKSB7XG4gICAgcmV0dXJuIGRhdGE7XG4gIH1cbiAgY29uc3QgYWRkVXJscyA9IHZhbHVlID0+IHtcbiAgICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICBjb25zdCBmaWxlID0gdHlwZW9mIHZhbHVlLm5hbWUgPT09ICdzdHJpbmcnICYmIHRoaXMuZmlsZVVybHNbdmFsdWUubmFtZV07XG4gICAgICBpZiAoIXZhbHVlLnVybCAmJiBmaWxlKSB7XG4gICAgICAgIHZhbHVlLnVybCA9IGZpbGUudXJsO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBPYmplY3QudmFsdWVzKHZhbHVlKS5mb3JFYWNoKGFkZFVybHMpO1xuICB9O1xuICBhZGRVcmxzKGRhdGEpO1xuICByZXR1cm4gZGF0YTtcbn07XG5cbi8vIFJ1bnMgYW55IGJlZm9yZVNhdmUgdHJpZ2dlcnMgYWdhaW5zdCB0aGlzIG9wZXJhdGlvbi5cbi8vIEFueSBjaGFuZ2UgbGVhZHMgdG8gb3VyIGRhdGEgYmVpbmcgbXV0YXRlZC5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMucnVuT3B0aW9ucy5tYW55KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IGlkZW50aWZpZXIgPSB1cGRhdGVkT2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKGlkZW50aWZpZXIpO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7XG4gICAgb3BlcmF0aW9uczogeyAuLi5wZW5kaW5nIH0sXG4gICAgaWRlbnRpZmllcixcbiAgfTtcblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgY3JlYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuY3JlYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSW4gdGhlIGNhc2UgdGhhdCB0aGVyZSBpcyBubyBwZXJtaXNzaW9uIGZvciB0aGUgb3BlcmF0aW9uLCBpdCB0aHJvd3MgYW4gZXJyb3JcbiAgICAgIHJldHVybiBkYXRhYmFzZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgdGhpcy5hdXRoLFxuICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSBfLnJlZHVjZShcbiAgICAgICAgICByZXNwb25zZS5vYmplY3QsXG4gICAgICAgICAgKHJlc3VsdCwgdmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5kYXRhW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YSA9IHJlc3BvbnNlLm9iamVjdDtcbiAgICAgICAgLy8gV2Ugc2hvdWxkIGRlbGV0ZSB0aGUgb2JqZWN0SWQgZm9yIGFuIHVwZGF0ZSB3cml0ZVxuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHModGhpcy5jb25maWcsIHRoaXMuZGF0YSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgZXJyb3IpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICAvLyBUaGUgdHJpZ2dlciBtYXkgaGF2ZSBzZXQgZmlsZSBwb2ludGVycyB3aXRob3V0IFVSTFxuICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlRmlsZVVybHMoKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlTG9naW5UcmlnZ2VyID0gYXN5bmMgZnVuY3Rpb24gKHVzZXJEYXRhKSB7XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZUxvZ2luJyB0cmlnZ2VyXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcblxuICAvLyBFeHBhbmQgZmlsZSBvYmplY3RzXG4gIGF3YWl0IHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB1c2VyRGF0YSk7XG5cbiAgY29uc3QgdXNlciA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB1c2VyRGF0YSk7XG5cbiAgLy8gbm8gbmVlZCB0byByZXR1cm4gYSByZXNwb25zZVxuICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgdGhpcy5hdXRoLFxuICAgIHVzZXIsXG4gICAgbnVsbCxcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmNvbnRleHRcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuZGF0YSkge1xuICAgIHJldHVybiB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCkudGhlbihhbGxDbGFzc2VzID0+IHtcbiAgICAgIGNvbnN0IHNjaGVtYSA9IGFsbENsYXNzZXMuZmluZChvbmVDbGFzcyA9PiBvbmVDbGFzcy5jbGFzc05hbWUgPT09IHRoaXMuY2xhc3NOYW1lKTtcbiAgICAgIGNvbnN0IHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCA9IChmaWVsZE5hbWUsIHNldERlZmF1bHQpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gbnVsbCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnJyB8fFxuICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXREZWZhdWx0ICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IG51bGwgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgKHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fCBbXTtcbiAgICAgICAgICAgIGlmICh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0ucmVxdWlyZWQgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBgJHtmaWVsZE5hbWV9IGlzIHJlcXVpcmVkYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICAvLyBhZGQgZGVmYXVsdCBBQ0xcbiAgICAgIGlmIChcbiAgICAgICAgc2NoZW1hPy5jbGFzc0xldmVsUGVybWlzc2lvbnM/LkFDTCAmJlxuICAgICAgICAhdGhpcy5kYXRhLkFDTCAmJlxuICAgICAgICBKU09OLnN0cmluZ2lmeShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLkFDTCkgIT09XG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoeyAnKic6IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfSB9KVxuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGFjbCA9IHN0cnVjdHVyZWRDbG9uZShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLkFDTCk7XG4gICAgICAgIGlmIChhY2wuY3VycmVudFVzZXIpIHtcbiAgICAgICAgICBpZiAodGhpcy5hdXRoLnVzZXI/LmlkKSB7XG4gICAgICAgICAgICBhY2xbdGhpcy5hdXRoLnVzZXI/LmlkXSA9IHN0cnVjdHVyZWRDbG9uZShhY2wuY3VycmVudFVzZXIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBkZWxldGUgYWNsLmN1cnJlbnRVc2VyO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGF0YS5BQ0wgPSBhY2w7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHwgW107XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goJ0FDTCcpO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgZGVmYXVsdCBmaWVsZHNcbiAgICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgICAvLyBhbGxvdyBjdXN0b21pemluZyBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCB3aGVuIHVzaW5nIG1haW50ZW5hbmNlIGtleVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdC5fX3R5cGUgPT09ICdEYXRlJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdC5pc287XG5cbiAgICAgICAgICBpZiAodGhpcy5kYXRhLnVwZGF0ZWRBdCAmJiB0aGlzLmRhdGEudXBkYXRlZEF0Ll9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICBjb25zdCBjcmVhdGVkQXQgPSBuZXcgRGF0ZSh0aGlzLmRhdGEuY3JlYXRlZEF0KTtcbiAgICAgICAgICAgIGNvbnN0IHVwZGF0ZWRBdCA9IG5ldyBEYXRlKHRoaXMuZGF0YS51cGRhdGVkQXQuaXNvKTtcblxuICAgICAgICAgICAgaWYgKHVwZGF0ZWRBdCA8IGNyZWF0ZWRBdCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgICAndXBkYXRlZEF0IGNhbm5vdCBvY2N1ciBiZWZvcmUgY3JlYXRlZEF0J1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy5kYXRhLnVwZGF0ZWRBdC5pc287XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGlmIG5vIHVwZGF0ZWRBdCBpcyBwcm92aWRlZCwgc2V0IGl0IHRvIGNyZWF0ZWRBdCB0byBtYXRjaCBkZWZhdWx0IGJlaGF2aW9yXG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9ubHkgYXNzaWduIG5ldyBvYmplY3RJZCBpZiB3ZSBhcmUgY3JlYXRpbmcgbmV3IG9iamVjdFxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5vYmplY3RJZCkge1xuICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IGNyeXB0b1V0aWxzLm5ld09iamVjdElkKHRoaXMuY29uZmlnLm9iamVjdElkU2l6ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIHRydWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYSkge1xuICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG5cbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG4vLyBUcmFuc2Zvcm1zIGF1dGggZGF0YSBmb3IgYSB1c2VyIG9iamVjdC5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGEgdXNlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGF1dGhEYXRhID0gdGhpcy5kYXRhLmF1dGhEYXRhO1xuICBjb25zdCBoYXNVc2VybmFtZUFuZFBhc3N3b3JkID1cbiAgICB0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkID09PSAnc3RyaW5nJztcbiAgY29uc3QgaGFzQXV0aERhdGEgPVxuICAgIGF1dGhEYXRhICYmXG4gICAgT2JqZWN0LmtleXMoYXV0aERhdGEpLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgcmV0dXJuIHByb3ZpZGVyRGF0YSAmJiB0eXBlb2YgcHJvdmlkZXJEYXRhID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyhwcm92aWRlckRhdGEpLmxlbmd0aDtcbiAgICB9KTtcblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIWhhc0F1dGhEYXRhKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEudXNlcm5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ2JhZCBvciBtaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnBhc3N3b3JkKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJykpIHtcbiAgICAvLyBOb3RoaW5nIHRvIHZhbGlkYXRlIGhlcmVcbiAgICByZXR1cm47XG4gIH0gZWxzZSBpZiAoIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8gbnVsbFxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICk7XG4gIH1cblxuICB2YXIgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBpZiAoIXByb3ZpZGVycy5sZW5ndGgpIHtcbiAgICAvLyBFbXB0eSBhdXRoRGF0YSBvYmplY3QsIG5vdGhpbmcgdG8gdmFsaWRhdGVcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY2FuSGFuZGxlQXV0aERhdGEgPSBwcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgY29uc3QgcHJvdmlkZXJBdXRoRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXSB8fCB7fTtcbiAgICByZXR1cm4gISFPYmplY3Qua2V5cyhwcm92aWRlckF1dGhEYXRhKS5sZW5ndGg7XG4gIH0pO1xuICBpZiAoY2FuSGFuZGxlQXV0aERhdGEgfHwgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCB8fCB0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5nZXRVc2VySWQoKSkge1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhKGF1dGhEYXRhKTtcbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uIChvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlcklkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC51c2VyLmlkO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl90aHJvd0lmQXV0aERhdGFEdXBsaWNhdGUgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgaWYgKFxuICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgZXJyb3I/LmNvZGUgPT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSAmJlxuICAgIGVycm9yLnVzZXJJbmZvPy5kdXBsaWNhdGVkX2ZpZWxkPy5zdGFydHNXaXRoKCdfYXV0aF9kYXRhXycpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG59O1xuXG4vLyBEZXZlbG9wZXJzIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSBhdXRoRGF0YSB2aWEgYmVmb3JlIHNhdmUgdHJpZ2dlclxuLy8gd2UgbmVlZCBhZnRlciBiZWZvcmUgc2F2ZSB0byBlbnN1cmUgdGhhdCB0aGUgZGV2ZWxvcGVyXG4vLyBpcyBub3QgY3VycmVudGx5IGR1cGxpY2F0aW5nIGF1dGggZGF0YSBJRFxuUmVzdFdyaXRlLnByb3RvdHlwZS5lbnN1cmVVbmlxdWVBdXRoRGF0YUlkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGhhc0F1dGhEYXRhSWQgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLnNvbWUoXG4gICAga2V5ID0+IHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldICYmIHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldLmlkXG4gICk7XG5cbiAgaWYgKCFoYXNBdXRoRGF0YUlkKSB7IHJldHVybjsgfVxuXG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgdGhpcy5kYXRhLmF1dGhEYXRhKTtcbiAgY29uc3QgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuICAvLyB1c2UgZGF0YS5vYmplY3RJZCBpbiBjYXNlIG9mIGxvZ2luIHRpbWUgYW5kIGZvdW5kIHVzZXIgZHVyaW5nIGhhbmRsZSB2YWxpZGF0ZUF1dGhEYXRhXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCkgfHwgdGhpcy5kYXRhLm9iamVjdElkO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEgJiYgdXNlcklkICE9PSByZXN1bHRzWzBdLm9iamVjdElkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBhc3luYyBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgciA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHRoaXMuY29uZmlnLCBhdXRoRGF0YSwgdHJ1ZSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCk7XG4gIGNvbnN0IHVzZXJSZXN1bHQgPSByZXN1bHRzWzBdO1xuICBjb25zdCBmb3VuZFVzZXJJc05vdEN1cnJlbnRVc2VyID0gdXNlcklkICYmIHVzZXJSZXN1bHQgJiYgdXNlcklkICE9PSB1c2VyUmVzdWx0Lm9iamVjdElkO1xuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEgfHwgZm91bmRVc2VySXNOb3RDdXJyZW50VXNlcikge1xuICAgIC8vIFRvIGF2b2lkIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL3NlY3VyaXR5L2Fkdmlzb3JpZXMvR0hTQS04dzNqLWc5ODMtOGpoNVxuICAgIC8vIExldCdzIHJ1biBzb21lIHZhbGlkYXRpb24gYmVmb3JlIHRocm93aW5nXG4gICAgYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oYXV0aERhdGEsIHRoaXMsIHVzZXJSZXN1bHQpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG5cbiAgLy8gTm8gdXNlciBmb3VuZCB3aXRoIHByb3ZpZGVkIGF1dGhEYXRhIHdlIG5lZWQgdG8gdmFsaWRhdGVcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIGNvbnN0IHsgYXV0aERhdGE6IHZhbGlkYXRlZEF1dGhEYXRhLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgIGF1dGhEYXRhLFxuICAgICAgdGhpc1xuICAgICk7XG4gICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAvLyBSZXBsYWNlIGN1cnJlbnQgYXV0aERhdGEgYnkgdGhlIG5ldyB2YWxpZGF0ZWQgb25lXG4gICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVXNlciBmb3VuZCB3aXRoIHByb3ZpZGVkIGF1dGhEYXRhXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMSkge1xuICAgIHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgY29uc3QgeyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9ID0gQXV0aC5oYXNNdXRhdGVkQXV0aERhdGEoXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGFcbiAgICApO1xuXG4gICAgY29uc3QgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyID1cbiAgICAgICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHx8XG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXI7XG5cbiAgICBjb25zdCBpc0xvZ2luID0gIXVzZXJJZDtcblxuICAgIGlmIChpc0xvZ2luIHx8IGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3Rlcikge1xuICAgICAgLy8gbm8gdXNlciBtYWtpbmcgdGhlIGNhbGxcbiAgICAgIC8vIE9SIHRoZSB1c2VyIG1ha2luZyB0aGUgY2FsbCBpcyB0aGUgcmlnaHQgb25lXG4gICAgICAvLyBMb2dpbiB3aXRoIGF1dGggZGF0YVxuICAgICAgZGVsZXRlIHJlc3VsdHNbMF0ucGFzc3dvcmQ7XG5cbiAgICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBvYmplY3RJZCBmaXJzdCBvdGhlcndpc2UgbG9jYXRpb24gaGFzIHRyYWlsaW5nIHVuZGVmaW5lZFxuICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gdXNlclJlc3VsdC5vYmplY3RJZDtcblxuICAgICAgaWYgKCF0aGlzLnF1ZXJ5IHx8ICF0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgLy8gd2lsbCBiZSBpZ25vcmVkLlxuICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihzdHJ1Y3R1cmVkQ2xvbmUodXNlclJlc3VsdCkpO1xuXG4gICAgICAgIC8vIElmIHdlIGFyZSBpbiBsb2dpbiBvcGVyYXRpb24gdmlhIGF1dGhEYXRhXG4gICAgICAgIC8vIHdlIG5lZWQgdG8gYmUgc3VyZSB0aGF0IHRoZSB1c2VyIGhhcyBwcm92aWRlZFxuICAgICAgICAvLyByZXF1aXJlZCBhdXRoRGF0YVxuICAgICAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oXG4gICAgICAgICAgeyBjb25maWc6IHRoaXMuY29uZmlnLCBhdXRoOiB0aGlzLmF1dGggfSxcbiAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhLFxuICAgICAgICAgIHRoaXMuY29uZmlnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIFByZXZlbnQgdmFsaWRhdGluZyBpZiBubyBtdXRhdGVkIGRhdGEgZGV0ZWN0ZWQgb24gdXBkYXRlXG4gICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSAmJiBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBBbHdheXMgdmFsaWRhdGUgYWxsIHByb3ZpZGVkIGF1dGhEYXRhIG9uIGxvZ2luIHRvIHByZXZlbnQgYXV0aGVudGljYXRpb25cbiAgICAgIC8vIGJ5cGFzcyB2aWEgcGFydGlhbCBhdXRoRGF0YSAoZS5nLiBzZW5kaW5nIG9ubHkgdGhlIHByb3ZpZGVyIElEIHdpdGhvdXRcbiAgICAgIC8vIGFuIGFjY2VzcyB0b2tlbik7IG9uIHVwZGF0ZSBvbmx5IHZhbGlkYXRlIG11dGF0ZWQgb25lc1xuICAgICAgaWYgKGlzTG9naW4gfHwgaGFzTXV0YXRlZEF1dGhEYXRhIHx8ICF0aGlzLmNvbmZpZy5hbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgICAgIGlzTG9naW4gPyBhdXRoRGF0YSA6IG11dGF0ZWRBdXRoRGF0YSxcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgIHVzZXJSZXN1bHRcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgICAgICB0aGlzLmF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2FwdHVyZSBvcmlnaW5hbCBhdXRoRGF0YSBiZWZvcmUgbXV0YXRpbmcgdXNlclJlc3VsdCB2aWEgdGhlIHJlc3BvbnNlIHJlZmVyZW5jZVxuICAgICAgY29uc3Qgb3JpZ2luYWxBdXRoRGF0YSA9IHVzZXJSZXN1bHQ/LmF1dGhEYXRhXG4gICAgICAgID8gT2JqZWN0LmZyb21FbnRyaWVzKFxuICAgICAgICAgIE9iamVjdC5lbnRyaWVzKHVzZXJSZXN1bHQuYXV0aERhdGEpLm1hcCgoW2ssIHZdKSA9PlxuICAgICAgICAgICAgW2ssIHYgJiYgdHlwZW9mIHYgPT09ICdvYmplY3QnID8geyAuLi52IH0gOiB2XVxuICAgICAgICAgIClcbiAgICAgICAgKVxuICAgICAgICA6IHVuZGVmaW5lZDtcblxuICAgICAgLy8gSUYgd2UgYXJlIGluIGxvZ2luIHdlJ2xsIHNraXAgdGhlIGRhdGFiYXNlIG9wZXJhdGlvbiAvIGJlZm9yZVNhdmUgLyBhZnRlclNhdmUgZXRjLi4uXG4gICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgIC8vIFdlIGFyZSBzdXBwb3NlZCB0byBoYXZlIGEgcmVzcG9uc2Ugb25seSBvbiBMT0dJTiB3aXRoIGF1dGhEYXRhLCBzbyB3ZSBza2lwIHRob3NlXG4gICAgICAvLyBJZiB3ZSdyZSBub3QgbG9nZ2luZyBpbiwgYnV0IGp1c3QgdXBkYXRpbmcgdGhlIGN1cnJlbnQgdXNlciwgd2UgY2FuIHNhZmVseSBza2lwIHRoYXQgcGFydFxuICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgLy8gQXNzaWduIHRoZSBuZXcgYXV0aERhdGEgaW4gdGhlIHJlc3BvbnNlXG4gICAgICAgIE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPSBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3Rlcicgb25seSBpZiBhdXRoRGF0YSBjb250YWlucyBzb21lIGtleXNcbiAgICAgICAgLy8gYXV0aERhdGEgY291bGQgbm90IGNvbnRhaW5zIGtleXMgYWZ0ZXIgdmFsaWRhdGlvbiBpZiB0aGUgYXV0aEFkYXB0ZXJcbiAgICAgICAgLy8gdXNlcyB0aGUgYGRvTm90U2F2ZWAgb3B0aW9uLiBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0geyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH07XG4gICAgICAgICAgLy8gT3B0aW1pc3RpYyBsb2NraW5nOiBpbmNsdWRlIGVhY2ggY2hhbmdlZCBvcmlnaW5hbCBmaWVsZCBpbiB0aGUgV0hFUkUgY2xhdXNlXG4gICAgICAgICAgLy8gZm9yIHByb3ZpZGVycyB3aG9zZSBkYXRhIGlzIGJlaW5nIHVwZGF0ZWQuIFRoaXMgcHJldmVudHMgY29uY3VycmVudCByZXF1ZXN0c1xuICAgICAgICAgIC8vIGZyb20gYm90aCBzdWNjZWVkaW5nIHdoZW4gY29uc3VtaW5nIHNpbmdsZS11c2UgdG9rZW5zIChlLmcuIE1GQSByZWNvdmVyeSBjb2Rlc1xuICAgICAgICAgIC8vIGFzIGFycmF5cywgb3IgTUZBIFNNUyBPVFAgdG9rZW5zIGFzIHN0cmluZ3MpLlxuICAgICAgICAgIGFwcGx5QXV0aERhdGFPcHRpbWlzdGljTG9jayhxdWVyeSwgb3JpZ2luYWxBdXRoRGF0YSwgdGhpcy5kYXRhLmF1dGhEYXRhKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIHsgYXV0aERhdGE6IHRoaXMuZGF0YS5hdXRoRGF0YSB9LFxuICAgICAgICAgICAgICB7fVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsICdJbnZhbGlkIGF1dGggZGF0YScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fdGhyb3dJZkF1dGhEYXRhRHVwbGljYXRlKGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMuZGF0YS5hdXRoRGF0YSAmJiBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAvLyBVUERBVEUgcGF0aCAoZS5nLiBQVVQgL3VzZXJzLzppZCBkdXJpbmcgbGlua2VkLXByb3ZpZGVyIHJlLWF1dGgpOiBhcHBseVxuICAgICAgICAvLyB0aGUgc2FtZSBvcHRpbWlzdGljIGxvY2sgdG8gdGhlIHN1YnNlcXVlbnQgcnVuRGF0YWJhc2VPcGVyYXRpb24gdXBkYXRlIHNvXG4gICAgICAgIC8vIGNvbmN1cnJlbnQgc2luZ2xlLXVzZSB0b2tlbiBjb25zdW1lcnMgY2Fubm90IGJvdGggc3VjY2VlZC5cbiAgICAgICAgYXBwbHlBdXRoRGF0YU9wdGltaXN0aWNMb2NrKHRoaXMucXVlcnksIG9yaWdpbmFsQXV0aERhdGEsIHRoaXMuZGF0YS5hdXRoRGF0YSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNoZWNrUmVzdHJpY3RlZEZpZWxkcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGguaXNNYWludGVuYW5jZSAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICdlbWFpbFZlcmlmaWVkJyBpbiB0aGlzLmRhdGEpIHtcbiAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICBcIkNsaWVudHMgYXJlbid0IGFsbG93ZWQgdG8gbWFudWFsbHkgdXBkYXRlIGVtYWlsIHZlcmlmaWNhdGlvbi5cIixcbiAgICAgIHRoaXMuY29uZmlnXG4gICAgKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoZSBjcmVhdGUgb3IgdXBkYXRlIGNsYXNzLWxldmVsIHBlcm1pc3Npb24gYmVmb3JlIHNjaGVtYSB2YWxpZGF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlV3JpdGVQZXJtaXNzaW9uID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHNjaGVtYUNvbnRyb2xsZXIgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCk7XG4gIGF3YWl0IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgfHwgW10sXG4gICAgdGhpcy5xdWVyeSA/ICd1cGRhdGUnIDogJ2NyZWF0ZSdcbiAgKTtcbn07XG5cbi8vIEF1dGhvcml6ZSBhIF9Vc2VyIHVwZGF0ZSBiZWZvcmUgYW55IHN0ZXAgcmVhZHMgdGhlIHRhcmdldCBhY2NvdW50XG5SZXN0V3JpdGUucHJvdG90eXBlLmF1dGhvcml6ZVVzZXJVcGRhdGUgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCAhdGhpcy5xdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0aGlzLmF1dGguaXNVbmF1dGhlbnRpY2F0ZWQoKSkge1xuICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuU0VTU0lPTl9NSVNTSU5HLFxuICAgICAgYENhbm5vdCBtb2RpZnkgdXNlciAke3RoaXMucXVlcnkub2JqZWN0SWR9LmAsXG4gICAgICB0aGlzLmNvbmZpZ1xuICAgICk7XG4gIH1cbiAgLy8gQm9keSBvYmplY3RJZCBtdXN0IG5vdCByZXRhcmdldCB0aGUgdXBkYXRlXG4gIGlmICh0aGlzLmRhdGEub2JqZWN0SWQgIT09IHVuZGVmaW5lZCAmJiB0aGlzLmRhdGEub2JqZWN0SWQgIT09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gIH1cbiAgLy8gT3duZXIgdXBkYXRlIHJlYWRzIG9ubHkgb3duIGRhdGE7IHRoZSB3cml0ZSBzdGF5cyBBQ0wtY2hlY2tlZFxuICBpZiAodGhpcy5hdXRoLnVzZXIuaWQgPT09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gV3JpdGUgYWNjZXNzIGNoZWNrIHZpYSB0aGUgd3JpdGUtcGF0aCBBQ0wgZW5mb3JjZW1lbnRcbiAgYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHsgb2JqZWN0SWQ6IHRoaXMucXVlcnkub2JqZWN0SWQgfSxcbiAgICB7fSxcbiAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgZmFsc2UsXG4gICAgdHJ1ZVxuICApO1xufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19TZXNzaW9uJyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgcmVzdFdoZXJlOiB7XG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgcHJvbWlzZSA9IHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5yZXN1bHRzLmZvckVhY2goc2Vzc2lvbiA9PlxuICAgICAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIudXNlci5kZWwoc2Vzc2lvbi5zZXNzaW9uVG9rZW4pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBUcmFuc2Zvcm0gdGhlIHBhc3N3b3JkXG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gaWdub3JlIG9ubHkgaWYgdW5kZWZpbmVkLiBzaG91bGQgcHJvY2VlZCBpZiBlbXB0eSAoJycpXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gPSB0cnVlO1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIG5ldyBzZXNzaW9uIG9ubHkgaWYgdGhlIHVzZXIgcmVxdWVzdGVkXG4gICAgICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgICAgICAgIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5KCkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5oYXNoKHRoaXMuZGF0YS5wYXNzd29yZCkudGhlbihoYXNoZWRQYXNzd29yZCA9PiB7XG4gICAgICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgPSBoYXNoZWRQYXNzd29yZDtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlVXNlck5hbWUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZUVtYWlsKCk7XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVVzZXJOYW1lID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayBmb3IgdXNlcm5hbWUgdW5pcXVlbmVzc1xuICBpZiAoIXRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgdGhpcy5kYXRhLnVzZXJuYW1lID0gY3J5cHRvVXRpbHMucmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLypcbiAgICBVc2VybmFtZXMgc2hvdWxkIGJlIHVuaXF1ZSB3aGVuIGNvbXBhcmVkIGNhc2UgaW5zZW5zaXRpdmVseVxuXG4gICAgVXNlcnMgc2hvdWxkIGJlIGFibGUgdG8gbWFrZSBjYXNlIHNlbnNpdGl2ZSB1c2VybmFtZXMgYW5kXG4gICAgbG9naW4gdXNpbmcgdGhlIGNhc2UgdGhleSBlbnRlcmVkLiAgSS5lLiAnU25vb3B5JyBzaG91bGQgcHJlY2x1ZGVcbiAgICAnc25vb3B5JyBhcyBhIHZhbGlkIHVzZXJuYW1lLlxuICAqL1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9KTtcbn07XG5cbi8qXG4gIEFzIHdpdGggdXNlcm5hbWVzLCBQYXJzZSBzaG91bGQgbm90IGFsbG93IGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBvZiBlbWFpbC5cbiAgdW5saWtlIHdpdGggdXNlcm5hbWVzICh3aGljaCBjYW4gaGF2ZSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgaW4gdGhlIGNhc2Ugb2ZcbiAgYXV0aCBhZGFwdGVycyksIGVtYWlscyBzaG91bGQgbmV2ZXIgaGF2ZSBhIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9uLlxuXG4gIFRoaXMgYmVoYXZpb3IgY2FuIGJlIGVuZm9yY2VkIHRocm91Z2ggYSBwcm9wZXJseSBjb25maWd1cmVkIGluZGV4IHNlZTpcbiAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LWNhc2UtaW5zZW5zaXRpdmUvI2NyZWF0ZS1hLWNhc2UtaW5zZW5zaXRpdmUtaW5kZXhcbiAgd2hpY2ggY291bGQgYmUgaW1wbGVtZW50ZWQgaW5zdGVhZCBvZiB0aGlzIGNvZGUgYmFzZWQgdmFsaWRhdGlvbi5cblxuICBHaXZlbiB0aGF0IHRoaXMgbG9va3VwIHNob3VsZCBiZSBhIHJlbGF0aXZlbHkgbG93IHVzZSBjYXNlIGFuZCB0aGF0IHRoZSBjYXNlIHNlbnNpdGl2ZVxuICB1bmlxdWUgaW5kZXggd2lsbCBiZSB1c2VkIGJ5IHRoZSBkYiBmb3IgdGhlIHF1ZXJ5LCB0aGlzIGlzIGFuIGFkZXF1YXRlIHNvbHV0aW9uLlxuKi9cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlRW1haWwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsIHx8IHRoaXMuZGF0YS5lbWFpbC5fX29wID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBWYWxpZGF0ZSBiYXNpYyBlbWFpbCBhZGRyZXNzIGZvcm1hdFxuICBpZiAoIXRoaXMuZGF0YS5lbWFpbC5tYXRjaCgvXi4rQC4rJC8pKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUywgJ0VtYWlsIGFkZHJlc3MgZm9ybWF0IGlzIGludmFsaWQuJylcbiAgICApO1xuICB9XG4gIC8vIENhc2UgaW5zZW5zaXRpdmUgbWF0Y2gsIHNlZSBub3RlIGFib3ZlIGZ1bmN0aW9uLlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAhdGhpcy5kYXRhLmF1dGhEYXRhIHx8XG4gICAgICAgICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCB8fFxuICAgICAgICAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpWzBdID09PSAnYW5vbnltb3VzJylcbiAgICAgICkge1xuICAgICAgICAvLyBXZSB1cGRhdGVkIHRoZSBlbWFpbCwgc2VuZCBhIG5ldyB2YWxpZGF0aW9uXG4gICAgICAgIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgICAgICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxPYmplY3QsXG4gICAgICAgICAgb2JqZWN0OiB1cGRhdGVkT2JqZWN0LFxuICAgICAgICAgIG1hc3RlcjogdGhpcy5hdXRoLmlzTWFzdGVyLFxuICAgICAgICAgIGlwOiB0aGlzLmNvbmZpZy5pcCxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2V0RW1haWxWZXJpZnlUb2tlbih0aGlzLmRhdGEsIHJlcXVlc3QsIHRoaXMuc3RvcmFnZSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5KSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgcG9saWN5RXJyb3IpKTtcbiAgfVxuXG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgY29udGFpbiB1c2VybmFtZVxuICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lID09PSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgICAgLy8gdXNlcm5hbWUgaXMgbm90IHBhc3NlZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZih0aGlzLmRhdGEudXNlcm5hbWUpID49IDApXG4gICAgICB7IHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKSk7IH1cbiAgICB9IGVsc2UgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgIC8vIHJldHJpZXZlIHRoZSBVc2VyIG9iamVjdCB1c2luZyB0aGUgVVJMIG9iamVjdCBJRCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHRoaXMucXVlcnkub2JqZWN0SWQgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHJlc3VsdHNbMF0udXNlcm5hbWUpID49IDApXG4gICAgICAgIHsgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpXG4gICAgICAgICk7IH1cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5ID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGlzIHJlcGVhdGluZyBmcm9tIHNwZWNpZmllZCBoaXN0b3J5XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMucXVlcnkub2JqZWN0SWQgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9LFxuICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICB7IG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDFcbiAgICAgICAgKTsgfVxuICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgY29uc3QgbmV3UGFzc3dvcmQgPSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIC8vIGNvbXBhcmUgdGhlIG5ldyBwYXNzd29yZCBoYXNoIHdpdGggYWxsIG9sZCBwYXNzd29yZCBoYXNoZXNcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBvbGRQYXNzd29yZHMubWFwKGZ1bmN0aW9uIChoYXNoKSB7XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUobmV3UGFzc3dvcmQsIGhhc2gpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAvLyByZWplY3QgaWYgdGhlcmUgaXMgYSBtYXRjaFxuICAgICAgICAgICAgeyByZXR1cm4gUHJvbWlzZS5yZWplY3QoJ1JFUEVBVF9QQVNTV09SRCcpOyB9XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB3YWl0IGZvciBhbGwgY29tcGFyaXNvbnMgdG8gY29tcGxldGVcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyciA9PT0gJ1JFUEVBVF9QQVNTV09SRCcpXG4gICAgICAgICAgICAvLyBhIG1hdGNoIHdhcyBmb3VuZFxuICAgICAgICAgICAgeyByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgIGBOZXcgcGFzc3dvcmQgc2hvdWxkIG5vdCBiZSB0aGUgc2FtZSBhcyBsYXN0ICR7dGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5fSBwYXNzd29yZHMuYFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApOyB9XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIElmIHNpZ24tdXAgY2FsbFxuICBpZiAoIXRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIpIHtcbiAgICAvLyBDcmVhdGUgcmVxdWVzdCBvYmplY3QgZm9yIHZlcmlmaWNhdGlvbiBmdW5jdGlvbnNcbiAgICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbE9iamVjdCxcbiAgICAgIG9iamVjdDogdXBkYXRlZE9iamVjdCxcbiAgICAgIG1hc3RlcjogdGhpcy5hdXRoLmlzTWFzdGVyLFxuICAgICAgaXA6IHRoaXMuY29uZmlnLmlwLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgICB9O1xuICAgIC8vIEdldCB2ZXJpZmljYXRpb24gY29uZGl0aW9ucyB3aGljaCBjYW4gYmUgYm9vbGVhbnMgb3IgZnVuY3Rpb25zOyB0aGUgcHVycG9zZSBvZiB0aGlzIGFzeW5jL2F3YWl0XG4gICAgLy8gc3RydWN0dXJlIGlzIHRvIGF2b2lkIHVubmVjZXNzYXJpbHkgZXhlY3V0aW5nIHN1YnNlcXVlbnQgZnVuY3Rpb25zIGlmIHByZXZpb3VzIG9uZXMgZmFpbCBpbiB0aGVcbiAgICAvLyBjb25kaXRpb25hbCBzdGF0ZW1lbnQgYmVsb3csIGFzIGEgZGV2ZWxvcGVyIG1heSBkZWNpZGUgdG8gZXhlY3V0ZSBleHBlbnNpdmUgb3BlcmF0aW9ucyBpbiB0aGVtXG4gICAgY29uc3QgdmVyaWZ5VXNlckVtYWlscyA9IGFzeW5jICgpID0+IHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgPT09IHRydWUgfHwgKHR5cGVvZiB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgY29uc3QgcHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9IGFzeW5jICgpID0+IHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09IHRydWUgfHwgKHR5cGVvZiB0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgLy8gSWYgdmVyaWZpY2F0aW9uIGlzIHJlcXVpcmVkXG4gICAgaWYgKGF3YWl0IHZlcmlmeVVzZXJFbWFpbHMoKSAmJiBhd2FpdCBwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKCkpIHtcbiAgICAgIHRoaXMuc3RvcmFnZS5yZWplY3RTaWdudXAgPSB0cnVlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID09IG51bGwgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkuam9pbignLCcpO1xuICB9XG5cbiAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICB1c2VySWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgYWN0aW9uOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID8gJ2xvZ2luJyA6ICdzaWdudXAnLFxuICAgICAgYXV0aFByb3ZpZGVyOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyIHx8ICdwYXNzd29yZCcsXG4gICAgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICB9KTtcblxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG4gIH1cblxuICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpO1xufTtcblxuUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIEF1dGgubWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIG51bGwsIHNlc3Npb25EYXRhKS5leGVjdXRlKCksXG4gIH07XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5xdWVyeSA9PT0gbnVsbCkge1xuICAgIC8vIG51bGwgcXVlcnkgbWVhbnMgY3JlYXRlXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCdwYXNzd29yZCcgaW4gdGhpcy5kYXRhIHx8ICdlbWFpbCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgYWRkT3BzID0ge1xuICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICB9O1xuICAgIHRoaXMuZGF0YSA9IE9iamVjdC5hc3NpZ24odGhpcy5kYXRhLCBhZGRPcHMpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIE9ubHkgZm9yIF9TZXNzaW9uLCBhbmQgYXQgY3JlYXRpb24gdGltZVxuICBpZiAodGhpcy5jbGFzc05hbWUgIT0gJ19TZXNzaW9uJyB8fCB0aGlzLnF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERlc3Ryb3kgdGhlIHNlc3Npb25zIGluICdCYWNrZ3JvdW5kJ1xuICBjb25zdCB7IHVzZXIsIGluc3RhbGxhdGlvbklkLCBzZXNzaW9uVG9rZW4gfSA9IHRoaXMuZGF0YTtcbiAgaWYgKCF1c2VyIHx8ICFpbnN0YWxsYXRpb25JZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXVzZXIub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveShcbiAgICAnX1Nlc3Npb24nLFxuICAgIHtcbiAgICAgIHVzZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHNlc3Npb25Ub2tlbjogeyAkbmU6IHNlc3Npb25Ub2tlbiB9LFxuICAgIH0sXG4gICAge30sXG4gICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgKTtcbn07XG5cbi8vIEhhbmRsZXMgYW55IGZvbGxvd3VwIGxvZ2ljXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUZvbGxvd3VwID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddICYmIHRoaXMuY29uZmlnLnJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQpIHtcbiAgICB2YXIgc2Vzc2lvblF1ZXJ5ID0ge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXTtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5kZXN0cm95KCdfU2Vzc2lvbicsIHNlc3Npb25RdWVyeSlcbiAgICAgIC50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKS50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXTtcbiAgICAvLyBGaXJlIGFuZCBmb3JnZXQhXG4gICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHRoaXMuZGF0YSwgeyBhdXRoOiB0aGlzLmF1dGggfSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX1Nlc3Npb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBfU2Vzc2lvbiBvYmplY3QuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZVNlc3Npb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGgudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLicpO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmIHRoaXMuZGF0YS51c2VyLm9iamVjdElkICE9IHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICgnaW5zdGFsbGF0aW9uSWQnIGluIHRoaXMuZGF0YSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAoJ3Nlc3Npb25Ub2tlbicgaW4gdGhpcy5kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICgnZXhwaXJlc0F0JyBpbiB0aGlzLmRhdGEgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKCdjcmVhdGVkV2l0aCcgaW4gdGhpcy5kYXRhICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0ge1xuICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgY29uc3QgYWRkaXRpb25hbFNlc3Npb25EYXRhID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMuZGF0YSkge1xuICAgICAgaWYgKGtleSA9PT0gJ29iamVjdElkJyB8fCBrZXkgPT09ICd1c2VyJyB8fCBrZXkgPT09ICdzZXNzaW9uVG9rZW4nIHx8IGtleSA9PT0gJ2V4cGlyZXNBdCcgfHwga2V5ID09PSAnY3JlYXRlZFdpdGgnKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgLy8gRW5mb3JjZSB0aGUgY2FsbGVyJ3MgY2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgYW5kIHNjaGVtYSBiZWZvcmUgdGhlIG1hc3RlciB3cml0ZVxuICAgIGNvbnN0IHZhbGlkYXRlZCA9IHRoaXMudmFsaWRhdGVXcml0ZVBlcm1pc3Npb24oKS50aGVuKCgpID0+IHRoaXMudmFsaWRhdGVTY2hlbWEoKSk7XG4gICAgcmV0dXJuIHZhbGlkYXRlZC50aGVuKCgpID0+IGNyZWF0ZVNlc3Npb24oKSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5yZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRXJyb3IgY3JlYXRpbmcgc2Vzc2lvbi4nKTtcbiAgICAgIH1cbiAgICAgIHNlc3Npb25EYXRhWydvYmplY3RJZCddID0gcmVzdWx0cy5yZXNwb25zZVsnb2JqZWN0SWQnXTtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICBsb2NhdGlvbjogcmVzdWx0cy5sb2NhdGlvbixcbiAgICAgICAgcmVzcG9uc2U6IHNlc3Npb25EYXRhLFxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX0luc3RhbGxhdGlvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIGluc3RhbGxhdGlvbiBvYmplY3QuXG4vLyBJZiBhbiBpbnN0YWxsYXRpb24gaXMgZm91bmQsIHRoaXMgY2FuIG11dGF0ZSB0aGlzLnF1ZXJ5IGFuZCB0dXJuIGEgY3JlYXRlXG4vLyBpbnRvIGFuIHVwZGF0ZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlSW5zdGFsbGF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19JbnN0YWxsYXRpb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGRlZHVwbGljYXRpb24gYmVsb3cgZW1iZWRzIHRoZXNlIGNsaWVudC1zdXBwbGllZCB2YWx1ZXMgZGlyZWN0bHkgaW50byBkYXRhYmFzZVxuICAvLyBxdWVyaWVzIHRoYXQgZGVsZXRlIG9yIHVwZGF0ZSByb3dzIHdpdGggbWFzdGVyIHByaXZpbGVnZXMsIGFuZCBpdCBydW5zIGJlZm9yZVxuICAvLyBgdmFsaWRhdGVTY2hlbWFgLCBzbyB0aGVpciB0eXBlcyBtdXN0IGJlIGVuZm9yY2VkIGhlcmU6IGEgbm9uLXN0cmluZyB2YWx1ZSB3b3VsZFxuICAvLyBvdGhlcndpc2UgcmVhY2ggdGhlIGRhdGFiYXNlIGFzIGEgcXVlcnkgY29uc3RyYWludCAoc3VjaCBhcyBhbiBvcGVyYXRvciBvYmplY3RcbiAgLy8gYHtcIiRuZVwiOiBudWxsfWApIG1hdGNoaW5nIHJvd3MgdGhlIGNsaWVudCBuZXZlciBpZGVudGlmaWVkLCBpbnN0ZWFkIG9mIGFzIGEgbGl0ZXJhbFxuICAvLyB2YWx1ZSB0byBtYXRjaCBhZ2FpbnN0LiBUaGUgc2NoZW1hIGRlY2xhcmVzIGFsbCB0aHJlZSBhcyBgU3RyaW5nYCwgYnV0IHRoYXQgY2hlY2tcbiAgLy8gY2Fubm90IGJlIHJldXNlZCBoZXJlOyBpdCBydW5zIGxhdGVyIGluIHRoZSB3cml0ZSBwaXBlbGluZSBhbmQgbW92aW5nIGl0IGVhcmxpZXJcbiAgLy8gd291bGQgbXV0YXRlIHRoZSBzY2hlbWEgYmVmb3JlIHRoZSBwZXJtaXNzaW9uIGNoZWNrLiBUaGUgZmllbGQgbGlzdCBpcyBhIHByb3BlcnR5IG9mXG4gIC8vIHRoaXMgZnVuY3Rpb24gcmF0aGVyIHRoYW4gb2YgdGhlIHNjaGVtYTogaXQgaXMgdGhlIHNldCBvZiB2YWx1ZXMgc3BsaWNlZCBpbnRvIHRoZVxuICAvLyBkZWR1cGxpY2F0aW9uIHF1ZXJpZXMgYmVsb3cuXG4gIGZvciAoY29uc3QgZmllbGROYW1lIG9mIFsnZGV2aWNlVG9rZW4nLCAnaW5zdGFsbGF0aW9uSWQnLCAnYXBwSWRlbnRpZmllciddKSB7XG4gICAgY29uc3QgdmFsdWUgPSB0aGlzLmRhdGFbZmllbGROYW1lXTtcbiAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGZpZWxkTmFtZSA9PT0gJ2FwcElkZW50aWZpZXInICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgYWN0dWFsVHlwZSA9IEFycmF5LmlzQXJyYXkodmFsdWUpXG4gICAgICA/ICdBcnJheSdcbiAgICAgIDogYCR7dHlwZW9mIHZhbHVlfWAucmVwbGFjZSgvXi4vLCBjaGFyYWN0ZXIgPT4gY2hhcmFjdGVyLnRvVXBwZXJDYXNlKCkpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgX0luc3RhbGxhdGlvbi4ke2ZpZWxkTmFtZX07IGV4cGVjdGVkIFN0cmluZyBidXQgZ290ICR7YWN0dWFsVHlwZX1gXG4gICAgKTtcbiAgfVxuXG4gIGlmIChcbiAgICAhdGhpcy5xdWVyeSAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgIXRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZFxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAxMzUsXG4gICAgICAnYXQgbGVhc3Qgb25lIElEIGZpZWxkIChkZXZpY2VUb2tlbiwgaW5zdGFsbGF0aW9uSWQpICcgKyAnbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIHRoZSBkZXZpY2UgdG9rZW4gaXMgNjQgY2hhcmFjdGVycyBsb25nLCB3ZSBhc3N1bWUgaXQgaXMgZm9yIGlPU1xuICAvLyBhbmQgbG93ZXJjYXNlIGl0LlxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIHRoaXMuZGF0YS5kZXZpY2VUb2tlbi5sZW5ndGggPT0gNjQpIHtcbiAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4udG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFdlIGxvd2VyY2FzZSB0aGUgaW5zdGFsbGF0aW9uSWQgaWYgcHJlc2VudFxuICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBsZXQgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQ7XG5cbiAgLy8gSWYgZGF0YS5pbnN0YWxsYXRpb25JZCBpcyBub3Qgc2V0IGFuZCB3ZSdyZSBub3QgbWFzdGVyLCB3ZSBjYW4gbG9va3VwIGluIGF1dGhcbiAgaWYgKCFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgcmVzdWx0Lm9iamVjdElkID09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNSwgJ2RldmljZVR5cGUgbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAvLyBBIGBEZWxldGVgIG9wZXJhdGlvbiBpcyBhcHBsaWVkIG9ubHkgYWZ0ZXIgdGhlIGRlZHVwbGljYXRpb24gcnVucywgYW5kIG5vXG4gICAgICAgICAgICAvLyBpbnN0YWxsYXRpb24gbWF0Y2hlZCBoZXJlIHRvIHRha2UgYSBzY29wZSBmcm9tLiBTa2lwIHRoZSBjbGVhbnVwIHJhdGhlciB0aGFuXG4gICAgICAgICAgICAvLyBydW4gaXQgdW5zY29wZWQgYWNyb3NzIGV2ZXJ5IGFwcGxpY2F0aW9uLCBvciBxdWVyeSBvbiB0aGUgb3BlcmF0aW9uIGl0c2VsZi5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLmFwcElkZW50aWZpZXIgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmICFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10pIHtcbiAgICAgICAgICAvLyBFeGFjdGx5IG9uZSBkZXZpY2UgdG9rZW4gbWF0Y2ggYW5kIGl0IGRvZXNuJ3QgaGF2ZSBhbiBpbnN0YWxsYXRpb25cbiAgICAgICAgICAvLyBJRC4gVGhpcyBpcyB0aGUgb25lIGNhc2Ugd2hlcmUgd2Ugd2FudCB0byBtZXJnZSB3aXRoIHRoZSBleGlzdGluZ1xuICAgICAgICAgIC8vIG9iamVjdC5cbiAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHsgb2JqZWN0SWQ6IGlkTWF0Y2gub2JqZWN0SWQgfTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAgIC5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWRcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiBpZE1hdGNoLmRldmljZVRva2VuICE9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgICAgLy8gV2UncmUgc2V0dGluZyB0aGUgZGV2aWNlIHRva2VuIG9uIGFuIGV4aXN0aW5nIGluc3RhbGxhdGlvbiwgc29cbiAgICAgICAgICAgIC8vIHdlIHNob3VsZCB0cnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2ggdGhpc1xuICAgICAgICAgICAgLy8gZGV2aWNlIHRva2VuLlxuICAgICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgLy8gV2UgaGF2ZSBhIHVuaXF1ZSBpbnN0YWxsIElkLCB1c2UgdGhhdCB0byBwcmVzZXJ2ZVxuICAgICAgICAgICAgLy8gdGhlIGludGVyZXN0aW5nIGluc3RhbGxhdGlvblxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnaW5zdGFsbGF0aW9uSWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgPT0gdGhpcy5kYXRhLm9iamVjdElkXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gd2UgcGFzc2VkIGFuIG9iamVjdElkLCBwcmVzZXJ2ZSB0aGF0IGluc3RhbGF0aW9uXG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydvYmplY3RJZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogaWRNYXRjaC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFdoYXQgdG8gZG8gaGVyZT8gY2FuJ3QgcmVhbGx5IGNsZWFuIHVwIGV2ZXJ5dGhpbmcuLi5cbiAgICAgICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgLy8gQSBgRGVsZXRlYCBvcGVyYXRpb24gaXMgYXBwbGllZCBvbmx5IGFmdGVyIHRoZSBkZWR1cGxpY2F0aW9uIHJ1bnMsIHNvIHNjb3BlXG4gICAgICAgICAgICAgIC8vIHRoZSBjbGVhbnVwIHRvIHRoZSB2YWx1ZSB0aGUgbWF0Y2hlZCBpbnN0YWxsYXRpb24gc3RpbGwgaG9sZHMuIERyb3BwaW5nIHRoZVxuICAgICAgICAgICAgICAvLyBjb25zdHJhaW50IHdvdWxkIGxldCB0aGUgY2xlYW51cCByZWFjaCBpbnN0YWxsYXRpb25zIG9mIG90aGVyIGFwcGxpY2F0aW9ucyxcbiAgICAgICAgICAgICAgLy8gYW5kIHRoZSBvcGVyYXRpb24gaXRzZWxmIGNhbm5vdCBtYXRjaCBhIFN0cmluZywgc28gc2tpcCB0aGUgY2xlYW51cCB3aGVuIG5vXG4gICAgICAgICAgICAgIC8vIHNjb3BlIGlzIGF2YWlsYWJsZS5cbiAgICAgICAgICAgICAgY29uc3QgYXBwSWRlbnRpZmllciA9XG4gICAgICAgICAgICAgICAgdHlwZW9mIHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyID09PSAnc3RyaW5nJ1xuICAgICAgICAgICAgICAgICAgPyB0aGlzLmRhdGEuYXBwSWRlbnRpZmllclxuICAgICAgICAgICAgICAgICAgOiBpZE1hdGNoLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgYXBwSWRlbnRpZmllciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdWl0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIHdoZXRoZXIgd2UgaGF2ZSBhIHNob3J0LWNpcmN1aXRlZCByZXNwb25zZSAtIG9ubHkgdGhlbiBydW4gZXhwYW5zaW9uLlxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgYXdhaXQgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkRhdGFiYXNlT3BlcmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJykge1xuICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci5yb2xlLmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIpIHtcbiAgICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuY2xlYXJDYWNoZWRSb2xlcyh0aGlzLmF1dGgudXNlcik7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMucXVlcnkgJiYgdGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKCkpIHtcbiAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORyxcbiAgICAgIGBDYW5ub3QgbW9kaWZ5IHVzZXIgJHt0aGlzLnF1ZXJ5Lm9iamVjdElkfS5gLFxuICAgICAgdGhpcy5jb25maWdcbiAgICApO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1Byb2R1Y3QnICYmIHRoaXMuZGF0YS5kb3dubG9hZCkge1xuICAgIHRoaXMuZGF0YS5kb3dubG9hZE5hbWUgPSB0aGlzLmRhdGEuZG93bmxvYWQubmFtZTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBiZXR0ZXIgZGV0ZWN0aW9uIGZvciBBQ0wsIGVuc3VyaW5nIGEgdXNlciBjYW4ndCBiZSBsb2NrZWQgZnJvbVxuICAvLyAgICAgICB0aGVpciBvd24gdXNlciByZWNvcmQuXG4gIGlmICh0aGlzLmRhdGEuQUNMICYmIHRoaXMuZGF0YS5BQ0xbJyp1bnJlc29sdmVkJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9BQ0wsICdJbnZhbGlkIEFDTC4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgLy8gRm9yY2UgdGhlIHVzZXIgdG8gbm90IGxvY2tvdXRcbiAgICAvLyBNYXRjaGVkIHdpdGggcGFyc2UuY29tXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5BQ0wgJiZcbiAgICAgIHRoaXMuYXV0aC5pc01hc3RlciAhPT0gdHJ1ZSAmJlxuICAgICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgIT09IHRydWVcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMucXVlcnkub2JqZWN0SWQgfSxcbiAgICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH0sXG4gICAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvL24tMSBwYXNzd29yZHMgZ28gaW50byBoaXN0b3J5IGluY2x1ZGluZyBsYXN0IHBhc3N3b3JkXG4gICAgICAgICAgd2hpbGUgKFxuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLmxlbmd0aCA+IE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIHRoaXMuX3Rocm93SWZBdXRoRGF0YUR1cGxpY2F0ZShlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICByZXNwb25zZS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3BvbnNlIH07XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFNldCB0aGUgZGVmYXVsdCBBQ0wgYW5kIHBhc3N3b3JkIHRpbWVzdGFtcCBmb3IgdGhlIG5ldyBfVXNlclxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgdmFyIEFDTCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAvLyBkZWZhdWx0IHB1YmxpYyByL3cgQUNMXG4gICAgICBpZiAoIUFDTCkge1xuICAgICAgICBBQ0wgPSB7fTtcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgQUNMWycqJ10gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBtYWtlIHN1cmUgdGhlIHVzZXIgaXMgbm90IGxvY2tlZCBkb3duXG4gICAgICBBQ0xbdGhpcy5kYXRhLm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIHRoaXMuZGF0YS5BQ0wgPSBBQ0w7XG4gICAgICAvLyBwYXNzd29yZCB0aW1lc3RhbXAgdG8gYmUgdXNlZCB3aGVuIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3kgaXMgZW5mb3JjZWRcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJ1biBhIGNyZWF0ZVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmNyZWF0ZSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5kYXRhLCB0aGlzLnJ1bk9wdGlvbnMsIGZhbHNlLCB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlcilcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3Rocm93SWZBdXRoRGF0YUR1cGxpY2F0ZShlcnJvcik7XG5cbiAgICAgICAgLy8gUXVpY2sgY2hlY2ssIGlmIHdlIHdlcmUgYWJsZSB0byBpbmZlciB0aGUgZHVwbGljYXRlZCBmaWVsZCBuYW1lXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAndXNlcm5hbWUnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAnZW1haWwnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhpcyB3YXMgYSBmYWlsZWQgdXNlciBjcmVhdGlvbiBkdWUgdG8gdXNlcm5hbWUgb3IgZW1haWwgYWxyZWFkeSB0YWtlbiwgd2UgbmVlZCB0b1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIGl0IHdhcyB1c2VybmFtZSBvciBlbWFpbCBhbmQgcmV0dXJuIHRoZSBhcHByb3ByaWF0ZSBlcnJvci5cbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gdGhlIG9yaWdpbmFsIG1ldGhvZFxuICAgICAgICAvLyBUT0RPOiBTZWUgaWYgd2UgY2FuIGxhdGVyIGRvIHRoaXMgd2l0aG91dCBhZGRpdGlvbmFsIHF1ZXJpZXMgYnkgdXNpbmcgbmFtZWQgaW5kZXhlcy5cbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgLmZpbmQoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCwgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSB9LFxuICAgICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLm9iamVjdElkID0gdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICByZXNwb25zZS5jcmVhdGVkQXQgPSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lKSB7XG4gICAgICAgICAgcmVzcG9uc2UudXNlcm5hbWUgPSB0aGlzLmRhdGEudXNlcm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgICByZXNwb25zZSxcbiAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgbm90aGluZyAtIGRvZXNuJ3Qgd2FpdCBmb3IgdGhlIHRyaWdnZXIuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkFmdGVyU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSB8fCAhdGhpcy5yZXNwb25zZS5yZXNwb25zZSB8fCB0aGlzLnJ1bk9wdGlvbnMubWFueSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJTYXZlSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgY29uc3QgaGFzTGl2ZVF1ZXJ5ID0gdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5oYXNMaXZlUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2sgJiYgIWhhc0xpdmVRdWVyeSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgdXBkYXRlZE9iamVjdC5faGFuZGxlU2F2ZVJlc3BvbnNlKFxuICAgIHRoaXMuY2xvbmVXaXRoRmlsZVVybHModGhpcy5yZXNwb25zZS5yZXNwb25zZSksXG4gICAgdGhpcy5yZXNwb25zZS5zdGF0dXMgfHwgMjAwXG4gICk7XG5cbiAgaWYgKGhhc0xpdmVRdWVyeSkge1xuICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgLy8gTm90aWZ5IExpdmVRdWVyeVNlcnZlciBpZiBwb3NzaWJsZVxuICAgICAgICBjb25zdCBwZXJtcyA9IHNjaGVtYUNvbnRyb2xsZXIuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lKTtcbiAgICAgICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5vbkFmdGVyU2F2ZShcbiAgICAgICAgICB1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICAgIHBlcm1zXG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignTGl2ZVF1ZXJ5IGFmdGVyU2F2ZSBub3RpZmljYXRpb24gZmFpbGVkJywgZXJyKTtcbiAgICAgIH0pO1xuICB9XG4gIGlmICghaGFzQWZ0ZXJTYXZlSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBSdW4gYWZ0ZXJTYXZlIHRyaWdnZXJcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBjb25zdCBqc29uUmV0dXJuZWQgPSByZXN1bHQgJiYgIXJlc3VsdC5fdG9GdWxsSlNPTjtcbiAgICAgIGlmIChqc29uUmV0dXJuZWQpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nT3BzLm9wZXJhdGlvbnMgPSB7fTtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHJlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKFxuICAgICAgICAgIChyZXN1bHQgfHwgdXBkYXRlZE9iamVjdCkudG9KU09OKCksXG4gICAgICAgICAgdGhpcy5kYXRhXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSlcbiAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgbG9nZ2VyLndhcm4oJ2FmdGVyU2F2ZSBjYXVnaHQgYW4gZXJyb3InLCBlcnIpO1xuICAgIH0pO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZmlndXJlIG91dCB3aGF0IGxvY2F0aW9uIHRoaXMgb3BlcmF0aW9uIGhhcHBlbnMgYXQuXG5SZXN0V3JpdGUucHJvdG90eXBlLmxvY2F0aW9uID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbWlkZGxlID0gdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgPyAnL3VzZXJzLycgOiAnL2NsYXNzZXMvJyArIHRoaXMuY2xhc3NOYW1lICsgJy8nO1xuICBjb25zdCBtb3VudCA9IHRoaXMuY29uZmlnLm1vdW50IHx8IHRoaXMuY29uZmlnLnNlcnZlclVSTDtcbiAgcmV0dXJuIG1vdW50ICsgbWlkZGxlICsgdGhpcy5kYXRhLm9iamVjdElkO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IHRoZSBvYmplY3QgaWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuLy8gQmVjYXVzZSBpdCBjb3VsZCBiZSBlaXRoZXIgb24gdGhlIHF1ZXJ5IG9yIG9uIHRoZSBkYXRhXG5SZXN0V3JpdGUucHJvdG90eXBlLm9iamVjdElkID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5kYXRhLm9iamVjdElkIHx8IHRoaXMucXVlcnkub2JqZWN0SWQ7XG59O1xuXG4vLyBSZXR1cm5zIGEgY29weSBvZiB0aGUgZGF0YSBhbmQgZGVsZXRlIGJhZCBrZXlzIChfYXV0aF9kYXRhLCBfaGFzaGVkX3Bhc3N3b3JkLi4uKVxuUmVzdFdyaXRlLnByb3RvdHlwZS5zYW5pdGl6ZWREYXRhID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBkYXRhID0gT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoKGRhdGEsIGtleSkgPT4ge1xuICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICBpZiAoIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgdGhpcy5jbG9uZVdpdGhGaWxlVXJscyh0aGlzLmRhdGEpKTtcbiAgcmV0dXJuIFBhcnNlLl9kZWNvZGUodW5kZWZpbmVkLCBkYXRhKTtcbn07XG5cbi8vIFJldHVybnMgYW4gdXBkYXRlZCBjb3B5IG9mIHRoZSBvYmplY3RcblJlc3RXcml0ZS5wcm90b3R5cGUuYnVpbGRQYXJzZU9iamVjdHMgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSwgb2JqZWN0SWQ6IHRoaXMucXVlcnk/Lm9iamVjdElkIH07XG4gIGxldCBvcmlnaW5hbE9iamVjdDtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yaWdpbmFsT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgfVxuXG4gIGNvbnN0IGNsYXNzTmFtZSA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihleHRyYURhdGEpO1xuICBjb25zdCByZWFkT25seUF0dHJpYnV0ZXMgPSBjbGFzc05hbWUuY29uc3RydWN0b3IucmVhZE9ubHlBdHRyaWJ1dGVzXG4gICAgPyBjbGFzc05hbWUuY29uc3RydWN0b3IucmVhZE9ubHlBdHRyaWJ1dGVzKClcbiAgICA6IFtdO1xuXG4gIC8vIEZvciBfUm9sZSBjbGFzcywgJ25hbWUnIGNhbm5vdCBiZSBzZXQgYWZ0ZXIgdGhlIHJvbGUgaGFzIGFuIG9iamVjdElkLlxuICAvLyBJbiBhZnRlclNhdmUgY29udGV4dCwgX2hhbmRsZVNhdmVSZXNwb25zZSBoYXMgYWxyZWFkeSBzZXQgdGhlIG9iamVjdElkLFxuICAvLyBzbyB3ZSB0cmVhdCAnbmFtZScgYXMgcmVhZC1vbmx5IHRvIGF2b2lkIFBhcnNlIFNESyB2YWxpZGF0aW9uIGVycm9ycy5cbiAgY29uc3QgaXNSb2xlQWZ0ZXJTYXZlID0gdGhpcy5jbGFzc05hbWUgPT09ICdfUm9sZScgJiYgdGhpcy5yZXNwb25zZSAmJiAhdGhpcy5xdWVyeTtcbiAgaWYgKGlzUm9sZUFmdGVyU2F2ZSAmJiB0aGlzLmRhdGEubmFtZSAmJiAhcmVhZE9ubHlBdHRyaWJ1dGVzLmluY2x1ZGVzKCduYW1lJykpIHtcbiAgICByZWFkT25seUF0dHJpYnV0ZXMucHVzaCgnbmFtZScpO1xuICB9XG4gIGlmICghdGhpcy5vcmlnaW5hbERhdGEpIHtcbiAgICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICAgIGV4dHJhRGF0YVthdHRyaWJ1dGVdID0gdGhpcy5kYXRhW2F0dHJpYnV0ZV07XG4gICAgfVxuICB9XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbiAoZGF0YSwga2V5KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGFba2V5XS5fX29wID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXJlYWRPbmx5QXR0cmlidXRlcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWJkb2N1bWVudCBrZXkgd2l0aCBkb3Qgbm90YXRpb24geyAneC55JzogdiB9ID0+IHsgJ3gnOiB7ICd5JyA6IHYgfSB9KVxuICAgICAgICBjb25zdCBzcGxpdHRlZEtleSA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJlbnRWYWwgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICAgIH1cbiAgICAgICAgcGFyZW50VmFsW3NwbGl0dGVkS2V5WzFdXSA9IGRhdGFba2V5XTtcbiAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCB0aGlzLmNsb25lV2l0aEZpbGVVcmxzKHRoaXMuZGF0YSkpO1xuXG4gIGNvbnN0IHNhbml0aXplZCA9IHRoaXMuc2FuaXRpemVkRGF0YSgpO1xuICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICBkZWxldGUgc2FuaXRpemVkW2F0dHJpYnV0ZV07XG4gIH1cbiAgdXBkYXRlZE9iamVjdC5zZXQoc2FuaXRpemVkKTtcbiAgcmV0dXJuIHsgdXBkYXRlZE9iamVjdCwgb3JpZ2luYWxPYmplY3QgfTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2xlYW5Vc2VyQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB1c2VyID0gdGhpcy5yZXNwb25zZS5yZXNwb25zZTtcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhID0gZnVuY3Rpb24gKHJlc3BvbnNlLCBkYXRhKSB7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyh0aGlzLnBlbmRpbmdPcHMuaWRlbnRpZmllcik7XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucGVuZGluZ09wcy5vcGVyYXRpb25zKSB7XG4gICAgaWYgKCFwZW5kaW5nW2tleV0pIHtcbiAgICAgIGRhdGFba2V5XSA9IHRoaXMub3JpZ2luYWxEYXRhID8gdGhpcy5vcmlnaW5hbERhdGFba2V5XSA6IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2tpcEtleXMgPSBbLi4uKHJlcXVpcmVkQ29sdW1ucy5yZWFkW3RoaXMuY2xhc3NOYW1lXSB8fCBbXSldO1xuICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICBza2lwS2V5cy5wdXNoKCdvYmplY3RJZCcsICdjcmVhdGVkQXQnKTtcbiAgfSBlbHNlIHtcbiAgICBza2lwS2V5cy5wdXNoKCd1cGRhdGVkQXQnKTtcbiAgICBkZWxldGUgcmVzcG9uc2Uub2JqZWN0SWQ7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gcmVzcG9uc2UpIHtcbiAgICBpZiAoc2tpcEtleXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gcmVzcG9uc2Vba2V5XTtcbiAgICBpZiAoXG4gICAgICB2YWx1ZSA9PSBudWxsIHx8XG4gICAgICAodmFsdWUuX190eXBlICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICAgdXRpbC5pc0RlZXBTdHJpY3RFcXVhbChkYXRhW2tleV0sIHZhbHVlKSB8fFxuICAgICAgdXRpbC5pc0RlZXBTdHJpY3RFcXVhbCgodGhpcy5vcmlnaW5hbERhdGEgfHwge30pW2tleV0sIHZhbHVlKVxuICAgICkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2tleV07XG4gICAgfVxuICB9XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2VbZmllbGROYW1lXSAmJiByZXNwb25zZVtmaWVsZE5hbWVdLl9fb3ApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtmaWVsZE5hbWVdO1xuICAgICAgaWYgKGRhdGFWYWx1ZS5fX29wID09ICdEZWxldGUnKSB7XG4gICAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgUmVzdFdyaXRlO1xubW9kdWxlLmV4cG9ydHMgPSBSZXN0V3JpdGU7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQWNBLElBQUFBLFVBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLE9BQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFHLGFBQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLGlCQUFBLEdBQUFKLE9BQUE7QUFDQSxJQUFBSyxNQUFBLEdBQUFMLE9BQUE7QUFBK0MsU0FBQUQsdUJBQUFPLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFuQi9DO0FBQ0E7QUFDQTs7QUFFQSxJQUFJRyxnQkFBZ0IsR0FBR1QsT0FBTyxDQUFDLGdDQUFnQyxDQUFDO0FBR2hFLE1BQU1VLElBQUksR0FBR1YsT0FBTyxDQUFDLFFBQVEs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