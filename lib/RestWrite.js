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
    } else {
      // retrieve the User object using objectId during password reset
      return this.config.database.find('_User', {
        objectId: this.objectId()
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
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
      objectId: this.objectId()
    }, {
      keys: ['_password_history', '_hashed_password']
    }, Auth.maintenance(this.config)).then(results => {
      if (results.length != 1) {
        throw undefined;
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
    return createSession().then(results => {
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
        objectId: this.objectId()
      }, {
        keys: ['_password_history', '_hashed_password']
      }, Auth.maintenance(this.config)).then(results => {
        if (results.length != 1) {
          throw undefined;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUmVzdFF1ZXJ5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2xvZ2dlciIsIl9BdXRoRGF0YUxvY2siLCJfU2NoZW1hQ29udHJvbGxlciIsIl9FcnJvciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJBdXRoIiwiVXRpbHMiLCJjcnlwdG9VdGlscyIsInBhc3N3b3JkQ3J5cHRvIiwiUGFyc2UiLCJ0cmlnZ2VycyIsInV0aWwiLCJSZXN0V3JpdGUiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwicXVlcnkiLCJkYXRhIiwib3JpZ2luYWxEYXRhIiwiY29udGV4dCIsImFjdGlvbiIsImlzUmVhZE9ubHkiLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm9iamVjdElkIiwiTUlTU0lOR19PQkpFQ1RfSUQiLCJJTlZBTElEX0tFWV9OQU1FIiwiaWQiLCJyZXNwb25zZSIsInN0cnVjdHVyZWRDbG9uZSIsInVwZGF0ZWRBdCIsIl9lbmNvZGUiLCJEYXRlIiwiaXNvIiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwicGVuZGluZ09wcyIsIm9wZXJhdGlvbnMiLCJpZGVudGlmaWVyIiwiZXhlY3V0ZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImdldFVzZXJBbmRSb2xlQUNMIiwidmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uIiwiaGFuZGxlSW5zdGFsbGF0aW9uIiwiaGFuZGxlU2Vzc2lvbiIsInZhbGlkYXRlQXV0aERhdGEiLCJjaGVja1Jlc3RyaWN0ZWRGaWVsZHMiLCJyZXNvbHZlRmlsZVVybHMiLCJydW5CZWZvcmVTYXZlVHJpZ2dlciIsImVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQiLCJkZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCIsInZhbGlkYXRlU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsInNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQiLCJ0cmFuc2Zvcm1Vc2VyIiwiZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMiLCJkZXN0cm95RHVwbGljYXRlZFNlc3Npb25zIiwicnVuRGF0YWJhc2VPcGVyYXRpb24iLCJjcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCIsImhhbmRsZUZvbGxvd3VwIiwicnVuQWZ0ZXJTYXZlVHJpZ2dlciIsImNsZWFuVXNlckF1dGhEYXRhIiwiYXV0aERhdGFSZXNwb25zZSIsInJlamVjdFNpZ251cCIsInByZXZlbnRTaWdudXBXaXRoVW52ZXJpZmllZEVtYWlsIiwiRU1BSUxfTk9UX0ZPVU5EIiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwiZmlsZXMiLCJjcmVhdGUiLCJjb2xsZWN0IiwidmFsdWUiLCJfX3R5cGUiLCJuYW1lIiwiSU5DT1JSRUNUX1RZUEUiLCJ1cmwiLCJ2YWx1ZXMiLCJmb3JFYWNoIiwia2V5cyIsImxlbmd0aCIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJmaWxlVXJscyIsImFzc2lnbiIsImNsb25lV2l0aEZpbGVVcmxzIiwib2JqZWN0IiwiYWRkVXJscyIsImZpbGUiLCJtYW55IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwicmVzdWx0IiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwia2V5IiwiaXNFcXVhbCIsInB1c2giLCJjaGVja1Byb2hpYml0ZWRLZXl3b3JkcyIsImVycm9yIiwicnVuQmVmb3JlTG9naW5UcmlnZ2VyIiwidXNlckRhdGEiLCJiZWZvcmVMb2dpbiIsImV4dHJhRGF0YSIsImluZmxhdGUiLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQUNMIiwiSlNPTiIsInN0cmluZ2lmeSIsInJlYWQiLCJ3cml0ZSIsImN1cnJlbnRVc2VyIiwiY3JlYXRlZEF0IiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJhdXRoRGF0YSIsImhhc1VzZXJuYW1lQW5kUGFzc3dvcmQiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiaGFzQXV0aERhdGEiLCJzb21lIiwicHJvdmlkZXIiLCJwcm92aWRlckRhdGEiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwicHJvdmlkZXJzIiwiY2FuSGFuZGxlQXV0aERhdGEiLCJwcm92aWRlckF1dGhEYXRhIiwiZ2V0VXNlcklkIiwiaGFuZGxlQXV0aERhdGEiLCJmaWx0ZXJlZE9iamVjdHNCeUFDTCIsIm9iamVjdHMiLCJmaWx0ZXIiLCJfdGhyb3dJZkF1dGhEYXRhRHVwbGljYXRlIiwiY29kZSIsIkRVUExJQ0FURV9WQUxVRSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsInN0YXJ0c1dpdGgiLCJBQ0NPVU5UX0FMUkVBRFlfTElOS0VEIiwiaGFzQXV0aERhdGFJZCIsInIiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJyZXN1bHRzIiwidXNlcklkIiwidXNlclJlc3VsdCIsImZvdW5kVXNlcklzTm90Q3VycmVudFVzZXIiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsImF1dGhQcm92aWRlciIsImpvaW4iLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIiLCJpc0xvZ2luIiwibG9jYXRpb24iLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwiYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInJlcyIsIm9yaWdpbmFsQXV0aERhdGEiLCJmcm9tRW50cmllcyIsImVudHJpZXMiLCJtYXAiLCJrIiwidiIsImFwcGx5QXV0aERhdGFPcHRpbWlzdGljTG9jayIsIlNDUklQVF9GQUlMRUQiLCJwcm9taXNlIiwiUmVzdFF1ZXJ5IiwibWV0aG9kIiwiTWV0aG9kIiwibWFzdGVyIiwicnVuQmVmb3JlRmluZCIsInJlc3RXaGVyZSIsInNlc3Npb24iLCJjYWNoZUNvbnRyb2xsZXIiLCJkZWwiLCJzZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVQYXNzd29yZFBvbGljeSIsImhhc2giLCJoYXNoZWRQYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfdmFsaWRhdGVVc2VyTmFtZSIsIl92YWxpZGF0ZUVtYWlsIiwicmFuZG9tU3RyaW5nIiwicmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUiLCIkbmUiLCJsaW1pdCIsImNhc2VJbnNlbnNpdGl2ZSIsIlVTRVJOQU1FX1RBS0VOIiwiZW1haWwiLCJtYXRjaCIsInJlamVjdCIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsIkVNQUlMX1RBS0VOIiwicmVxdWVzdCIsIm9yaWdpbmFsIiwiaXAiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm1haW50ZW5hbmNlIiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsImNvbXBhcmUiLCJhbGwiLCJjYXRjaCIsImVyciIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiY3JlYXRlZFdpdGgiLCJhZGRpdGlvbmFsU2Vzc2lvbkRhdGEiLCJ0b2tlbiIsIm5ld1Rva2VuIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYWRkT3BzIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiZGVzdHJveSIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJzZXNzaW9uUXVlcnkiLCJiaW5kIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiJGFuZCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInN0YXR1cyIsImFjdHVhbFR5cGUiLCJBcnJheSIsImlzQXJyYXkiLCJyZXBsYWNlIiwiY2hhcmFjdGVyIiwidG9VcHBlckNhc2UiLCJkZXZpY2VUb2tlbiIsInRvTG93ZXJDYXNlIiwiZGV2aWNlVHlwZSIsImlkTWF0Y2giLCJvYmplY3RJZE1hdGNoIiwiaW5zdGFsbGF0aW9uSWRNYXRjaCIsImRldmljZVRva2VuTWF0Y2hlcyIsIm9yUXVlcmllcyIsIiRvciIsImRlbFF1ZXJ5IiwiYXBwSWRlbnRpZmllciIsIm9iaklkIiwicm9sZSIsImNsZWFyIiwibGl2ZVF1ZXJ5Q29udHJvbGxlciIsImNsZWFyQ2FjaGVkUm9sZXMiLCJpc1VuYXV0aGVudGljYXRlZCIsIlNFU1NJT05fTUlTU0lORyIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiSU5WQUxJRF9BQ0wiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJoYXNBZnRlclNhdmVIb29rIiwiYWZ0ZXJTYXZlIiwiaGFzTGl2ZVF1ZXJ5IiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJsb2dnZXIiLCJqc29uUmV0dXJuZWQiLCJfdG9GdWxsSlNPTiIsInRvSlNPTiIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsImZyb21KU09OIiwicmVhZE9ubHlBdHRyaWJ1dGVzIiwiY29uc3RydWN0b3IiLCJpc1JvbGVBZnRlclNhdmUiLCJpbmNsdWRlcyIsImF0dHJpYnV0ZSIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2FuaXRpemVkIiwic2tpcEtleXMiLCJyZXF1aXJlZENvbHVtbnMiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImRhdGFWYWx1ZSIsIl9kZWZhdWx0IiwiZXhwb3J0cyIsIm1vZHVsZSJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBSZXN0V3JpdGUgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcblxuXG5jb25zdCBBdXRoID0gcmVxdWlyZSgnLi9BdXRoJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4vVXRpbHMnKTtcbnZhciBjcnlwdG9VdGlscyA9IHJlcXVpcmUoJy4vY3J5cHRvVXRpbHMnKTtcbnZhciBwYXNzd29yZENyeXB0byA9IHJlcXVpcmUoJy4vcGFzc3dvcmQnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbnZhciB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCB7IGFwcGx5QXV0aERhdGFPcHRpbWlzdGljTG9jayB9IGZyb20gJy4vQXV0aERhdGFMb2NrJztcbmltcG9ydCB7IHJlcXVpcmVkQ29sdW1ucyB9IGZyb20gJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBjcmVhdGVTYW5pdGl6ZWRFcnJvciB9IGZyb20gJy4vRXJyb3InO1xuXG4vLyBxdWVyeSBhbmQgZGF0YSBhcmUgYm90aCBwcm92aWRlZCBpbiBSRVNUIEFQSSBmb3JtYXQuIFNvIGRhdGFcbi8vIHR5cGVzIGFyZSBlbmNvZGVkIGJ5IHBsYWluIG9sZCBvYmplY3RzLlxuLy8gSWYgcXVlcnkgaXMgbnVsbCwgdGhpcyBpcyBhIFwiY3JlYXRlXCIgYW5kIHRoZSBkYXRhIGluIGRhdGEgc2hvdWxkIGJlXG4vLyBjcmVhdGVkLlxuLy8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gXCJ1cGRhdGVcIiAtIHRoZSBvYmplY3QgbWF0Y2hpbmcgdGhlIHF1ZXJ5XG4vLyBzaG91bGQgZ2V0IHVwZGF0ZWQgd2l0aCBkYXRhLlxuLy8gUmVzdFdyaXRlIHdpbGwgaGFuZGxlIG9iamVjdElkLCBjcmVhdGVkQXQsIGFuZCB1cGRhdGVkQXQgZm9yXG4vLyBldmVyeXRoaW5nLiBJdCBhbHNvIGtub3dzIHRvIHVzZSB0cmlnZ2VycyBhbmQgc3BlY2lhbCBtb2RpZmljYXRpb25zXG4vLyBmb3IgdGhlIF9Vc2VyIGNsYXNzLlxuZnVuY3Rpb24gUmVzdFdyaXRlKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBxdWVyeSwgZGF0YSwgb3JpZ2luYWxEYXRhLCBjb250ZXh0LCBhY3Rpb24pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICdDYW5ub3QgcGVyZm9ybSBhIHdyaXRlIG9wZXJhdGlvbiB3aGVuIHVzaW5nIHJlYWRPbmx5TWFzdGVyS2V5JyxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gIH1cbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLnN0b3JhZ2UgPSB7fTtcbiAgdGhpcy5ydW5PcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG5cbiAgaWYgKGFjdGlvbikge1xuICAgIHRoaXMucnVuT3B0aW9ucy5hY3Rpb24gPSBhY3Rpb247XG4gIH1cblxuICBpZiAoIXF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgJ29iamVjdElkJykgJiYgIWRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk1JU1NJTkdfT0JKRUNUX0lELFxuICAgICAgICAgICdvYmplY3RJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCBvciB1bmRlZmluZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgICAgaWYgKGRhdGEuaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdpZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gV2hlbiB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlLCB0aGlzLnJlc3BvbnNlIG1heSBoYXZlIHNldmVyYWxcbiAgLy8gZmllbGRzLlxuICAvLyByZXNwb25zZTogdGhlIGFjdHVhbCBkYXRhIHRvIGJlIHJldHVybmVkXG4gIC8vIHN0YXR1czogdGhlIGh0dHAgc3RhdHVzIGNvZGUuIGlmIG5vdCBwcmVzZW50LCB0cmVhdGVkIGxpa2UgYSAyMDBcbiAgLy8gbG9jYXRpb246IHRoZSBsb2NhdGlvbiBoZWFkZXIuIGlmIG5vdCBwcmVzZW50LCBubyBsb2NhdGlvbiBoZWFkZXJcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG5cbiAgLy8gUHJvY2Vzc2luZyB0aGlzIG9wZXJhdGlvbiBtYXkgbXV0YXRlIG91ciBkYXRhLCBzbyB3ZSBvcGVyYXRlIG9uIGFcbiAgLy8gY29weVxuICB0aGlzLnF1ZXJ5ID0gc3RydWN0dXJlZENsb25lKHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gc3RydWN0dXJlZENsb25lKGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7XG4gICAgb3BlcmF0aW9uczogbnVsbCxcbiAgICBpZGVudGlmaWVyOiBudWxsLFxuICB9O1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jaGVja1Jlc3RyaWN0ZWRGaWVsZHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc29sdmVGaWxlVXJscygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEFwcGVuZCB0aGUgYXV0aERhdGFSZXNwb25zZSBpZiBleGlzdHNcbiAgICAgIGlmICh0aGlzLmF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgICAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFSZXNwb25zZSA9IHRoaXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuc3RvcmFnZS5yZWplY3RTaWdudXAgJiYgdGhpcy5jb25maWcucHJldmVudFNpZ251cFdpdGhVbnZlcmlmaWVkRW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgY3JlYXRlU2FuaXRpemVkRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3Mgbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIHNjaGVtYS5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVTY2hlbWEgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS52YWxpZGF0ZU9iamVjdChcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLmRhdGEsXG4gICAgdGhpcy5xdWVyeSxcbiAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2VcbiAgKTtcbn07XG5cbi8vIFJlc29sdmVzIHRoZSBVUkxzIG9mIGZpbGUgcG9pbnRlcnMgaW4gdGhlIGRhdGEgdGhhdCBoYXZlIG5vIFVSTCwgc28gdGhhdCB0aGVcbi8vIFBhcnNlIG9iamVjdHMgYnVpbHQgZm9yIHRyaWdnZXJzIGFuZCBMaXZlUXVlcnkgY2FuIGJlIGVuY29kZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJlc29sdmVGaWxlVXJscyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZmlsZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICBjb25zdCBjb2xsZWN0ID0gdmFsdWUgPT4ge1xuICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUubmFtZSAhPT0gJ3N0cmluZycgfHwgdmFsdWUubmFtZSA9PT0gJycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCAnVGhpcyBpcyBub3QgYSB2YWxpZCBGaWxlJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXZhbHVlLnVybCkge1xuICAgICAgICBmaWxlc1t2YWx1ZS5uYW1lXSA9IHsgX190eXBlOiAnRmlsZScsIG5hbWU6IHZhbHVlLm5hbWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgT2JqZWN0LnZhbHVlcyh2YWx1ZSkuZm9yRWFjaChjb2xsZWN0KTtcbiAgfTtcbiAgY29sbGVjdCh0aGlzLmRhdGEpO1xuICBpZiAoT2JqZWN0LmtleXMoZmlsZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgZmlsZXMpO1xuICB0aGlzLmZpbGVVcmxzID0gT2JqZWN0LmFzc2lnbih0aGlzLmZpbGVVcmxzIHx8IE9iamVjdC5jcmVhdGUobnVsbCksIGZpbGVzKTtcbn07XG5cbi8vIFJldHVybnMgYSBjb3B5IG9mIHRoZSBkYXRhIHdpdGggdGhlIHJlc29sdmVkIFVSTHMgYWRkZWQgdG8gZmlsZSBwb2ludGVycy5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2xvbmVXaXRoRmlsZVVybHMgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gIGNvbnN0IGRhdGEgPSBzdHJ1Y3R1cmVkQ2xvbmUob2JqZWN0KTtcbiAgaWYgKCF0aGlzLmZpbGVVcmxzKSB7XG4gICAgcmV0dXJuIGRhdGE7XG4gIH1cbiAgY29uc3QgYWRkVXJscyA9IHZhbHVlID0+IHtcbiAgICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICBjb25zdCBmaWxlID0gdHlwZW9mIHZhbHVlLm5hbWUgPT09ICdzdHJpbmcnICYmIHRoaXMuZmlsZVVybHNbdmFsdWUubmFtZV07XG4gICAgICBpZiAoIXZhbHVlLnVybCAmJiBmaWxlKSB7XG4gICAgICAgIHZhbHVlLnVybCA9IGZpbGUudXJsO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBPYmplY3QudmFsdWVzKHZhbHVlKS5mb3JFYWNoKGFkZFVybHMpO1xuICB9O1xuICBhZGRVcmxzKGRhdGEpO1xuICByZXR1cm4gZGF0YTtcbn07XG5cbi8vIFJ1bnMgYW55IGJlZm9yZVNhdmUgdHJpZ2dlcnMgYWdhaW5zdCB0aGlzIG9wZXJhdGlvbi5cbi8vIEFueSBjaGFuZ2UgbGVhZHMgdG8gb3VyIGRhdGEgYmVpbmcgbXV0YXRlZC5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMucnVuT3B0aW9ucy5tYW55KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IGlkZW50aWZpZXIgPSB1cGRhdGVkT2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKGlkZW50aWZpZXIpO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7XG4gICAgb3BlcmF0aW9uczogeyAuLi5wZW5kaW5nIH0sXG4gICAgaWRlbnRpZmllcixcbiAgfTtcblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgY3JlYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuY3JlYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSW4gdGhlIGNhc2UgdGhhdCB0aGVyZSBpcyBubyBwZXJtaXNzaW9uIGZvciB0aGUgb3BlcmF0aW9uLCBpdCB0aHJvd3MgYW4gZXJyb3JcbiAgICAgIHJldHVybiBkYXRhYmFzZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgdGhpcy5hdXRoLFxuICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSBfLnJlZHVjZShcbiAgICAgICAgICByZXNwb25zZS5vYmplY3QsXG4gICAgICAgICAgKHJlc3VsdCwgdmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5kYXRhW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YSA9IHJlc3BvbnNlLm9iamVjdDtcbiAgICAgICAgLy8gV2Ugc2hvdWxkIGRlbGV0ZSB0aGUgb2JqZWN0SWQgZm9yIGFuIHVwZGF0ZSB3cml0ZVxuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHModGhpcy5jb25maWcsIHRoaXMuZGF0YSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgZXJyb3IpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICAvLyBUaGUgdHJpZ2dlciBtYXkgaGF2ZSBzZXQgZmlsZSBwb2ludGVycyB3aXRob3V0IFVSTFxuICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlRmlsZVVybHMoKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlTG9naW5UcmlnZ2VyID0gYXN5bmMgZnVuY3Rpb24gKHVzZXJEYXRhKSB7XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZUxvZ2luJyB0cmlnZ2VyXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcblxuICAvLyBFeHBhbmQgZmlsZSBvYmplY3RzXG4gIGF3YWl0IHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB1c2VyRGF0YSk7XG5cbiAgY29uc3QgdXNlciA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB1c2VyRGF0YSk7XG5cbiAgLy8gbm8gbmVlZCB0byByZXR1cm4gYSByZXNwb25zZVxuICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgdGhpcy5hdXRoLFxuICAgIHVzZXIsXG4gICAgbnVsbCxcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmNvbnRleHRcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuZGF0YSkge1xuICAgIHJldHVybiB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCkudGhlbihhbGxDbGFzc2VzID0+IHtcbiAgICAgIGNvbnN0IHNjaGVtYSA9IGFsbENsYXNzZXMuZmluZChvbmVDbGFzcyA9PiBvbmVDbGFzcy5jbGFzc05hbWUgPT09IHRoaXMuY2xhc3NOYW1lKTtcbiAgICAgIGNvbnN0IHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCA9IChmaWVsZE5hbWUsIHNldERlZmF1bHQpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gbnVsbCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnJyB8fFxuICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXREZWZhdWx0ICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IG51bGwgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgKHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fCBbXTtcbiAgICAgICAgICAgIGlmICh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0ucmVxdWlyZWQgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBgJHtmaWVsZE5hbWV9IGlzIHJlcXVpcmVkYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICAvLyBhZGQgZGVmYXVsdCBBQ0xcbiAgICAgIGlmIChcbiAgICAgICAgc2NoZW1hPy5jbGFzc0xldmVsUGVybWlzc2lvbnM/LkFDTCAmJlxuICAgICAgICAhdGhpcy5kYXRhLkFDTCAmJlxuICAgICAgICBKU09OLnN0cmluZ2lmeShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLkFDTCkgIT09XG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoeyAnKic6IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfSB9KVxuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGFjbCA9IHN0cnVjdHVyZWRDbG9uZShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLkFDTCk7XG4gICAgICAgIGlmIChhY2wuY3VycmVudFVzZXIpIHtcbiAgICAgICAgICBpZiAodGhpcy5hdXRoLnVzZXI/LmlkKSB7XG4gICAgICAgICAgICBhY2xbdGhpcy5hdXRoLnVzZXI/LmlkXSA9IHN0cnVjdHVyZWRDbG9uZShhY2wuY3VycmVudFVzZXIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBkZWxldGUgYWNsLmN1cnJlbnRVc2VyO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGF0YS5BQ0wgPSBhY2w7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHwgW107XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goJ0FDTCcpO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgZGVmYXVsdCBmaWVsZHNcbiAgICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgICAvLyBhbGxvdyBjdXN0b21pemluZyBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCB3aGVuIHVzaW5nIG1haW50ZW5hbmNlIGtleVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdC5fX3R5cGUgPT09ICdEYXRlJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdC5pc287XG5cbiAgICAgICAgICBpZiAodGhpcy5kYXRhLnVwZGF0ZWRBdCAmJiB0aGlzLmRhdGEudXBkYXRlZEF0Ll9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICBjb25zdCBjcmVhdGVkQXQgPSBuZXcgRGF0ZSh0aGlzLmRhdGEuY3JlYXRlZEF0KTtcbiAgICAgICAgICAgIGNvbnN0IHVwZGF0ZWRBdCA9IG5ldyBEYXRlKHRoaXMuZGF0YS51cGRhdGVkQXQuaXNvKTtcblxuICAgICAgICAgICAgaWYgKHVwZGF0ZWRBdCA8IGNyZWF0ZWRBdCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgICAndXBkYXRlZEF0IGNhbm5vdCBvY2N1ciBiZWZvcmUgY3JlYXRlZEF0J1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy5kYXRhLnVwZGF0ZWRBdC5pc287XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGlmIG5vIHVwZGF0ZWRBdCBpcyBwcm92aWRlZCwgc2V0IGl0IHRvIGNyZWF0ZWRBdCB0byBtYXRjaCBkZWZhdWx0IGJlaGF2aW9yXG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9ubHkgYXNzaWduIG5ldyBvYmplY3RJZCBpZiB3ZSBhcmUgY3JlYXRpbmcgbmV3IG9iamVjdFxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5vYmplY3RJZCkge1xuICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IGNyeXB0b1V0aWxzLm5ld09iamVjdElkKHRoaXMuY29uZmlnLm9iamVjdElkU2l6ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIHRydWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYSkge1xuICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG5cbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG4vLyBUcmFuc2Zvcm1zIGF1dGggZGF0YSBmb3IgYSB1c2VyIG9iamVjdC5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGEgdXNlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGF1dGhEYXRhID0gdGhpcy5kYXRhLmF1dGhEYXRhO1xuICBjb25zdCBoYXNVc2VybmFtZUFuZFBhc3N3b3JkID1cbiAgICB0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkID09PSAnc3RyaW5nJztcbiAgY29uc3QgaGFzQXV0aERhdGEgPVxuICAgIGF1dGhEYXRhICYmXG4gICAgT2JqZWN0LmtleXMoYXV0aERhdGEpLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgcmV0dXJuIHByb3ZpZGVyRGF0YSAmJiB0eXBlb2YgcHJvdmlkZXJEYXRhID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyhwcm92aWRlckRhdGEpLmxlbmd0aDtcbiAgICB9KTtcblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIWhhc0F1dGhEYXRhKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEudXNlcm5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ2JhZCBvciBtaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnBhc3N3b3JkKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJykpIHtcbiAgICAvLyBOb3RoaW5nIHRvIHZhbGlkYXRlIGhlcmVcbiAgICByZXR1cm47XG4gIH0gZWxzZSBpZiAoIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8gbnVsbFxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICk7XG4gIH1cblxuICB2YXIgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBpZiAoIXByb3ZpZGVycy5sZW5ndGgpIHtcbiAgICAvLyBFbXB0eSBhdXRoRGF0YSBvYmplY3QsIG5vdGhpbmcgdG8gdmFsaWRhdGVcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY2FuSGFuZGxlQXV0aERhdGEgPSBwcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgY29uc3QgcHJvdmlkZXJBdXRoRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXSB8fCB7fTtcbiAgICByZXR1cm4gISFPYmplY3Qua2V5cyhwcm92aWRlckF1dGhEYXRhKS5sZW5ndGg7XG4gIH0pO1xuICBpZiAoY2FuSGFuZGxlQXV0aERhdGEgfHwgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCB8fCB0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5nZXRVc2VySWQoKSkge1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhKGF1dGhEYXRhKTtcbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uIChvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlcklkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC51c2VyLmlkO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl90aHJvd0lmQXV0aERhdGFEdXBsaWNhdGUgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgaWYgKFxuICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgZXJyb3I/LmNvZGUgPT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSAmJlxuICAgIGVycm9yLnVzZXJJbmZvPy5kdXBsaWNhdGVkX2ZpZWxkPy5zdGFydHNXaXRoKCdfYXV0aF9kYXRhXycpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG59O1xuXG4vLyBEZXZlbG9wZXJzIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSBhdXRoRGF0YSB2aWEgYmVmb3JlIHNhdmUgdHJpZ2dlclxuLy8gd2UgbmVlZCBhZnRlciBiZWZvcmUgc2F2ZSB0byBlbnN1cmUgdGhhdCB0aGUgZGV2ZWxvcGVyXG4vLyBpcyBub3QgY3VycmVudGx5IGR1cGxpY2F0aW5nIGF1dGggZGF0YSBJRFxuUmVzdFdyaXRlLnByb3RvdHlwZS5lbnN1cmVVbmlxdWVBdXRoRGF0YUlkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGhhc0F1dGhEYXRhSWQgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLnNvbWUoXG4gICAga2V5ID0+IHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldICYmIHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldLmlkXG4gICk7XG5cbiAgaWYgKCFoYXNBdXRoRGF0YUlkKSB7IHJldHVybjsgfVxuXG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgdGhpcy5kYXRhLmF1dGhEYXRhKTtcbiAgY29uc3QgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuICAvLyB1c2UgZGF0YS5vYmplY3RJZCBpbiBjYXNlIG9mIGxvZ2luIHRpbWUgYW5kIGZvdW5kIHVzZXIgZHVyaW5nIGhhbmRsZSB2YWxpZGF0ZUF1dGhEYXRhXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCkgfHwgdGhpcy5kYXRhLm9iamVjdElkO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEgJiYgdXNlcklkICE9PSByZXN1bHRzWzBdLm9iamVjdElkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBhc3luYyBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgciA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHRoaXMuY29uZmlnLCBhdXRoRGF0YSwgdHJ1ZSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCk7XG4gIGNvbnN0IHVzZXJSZXN1bHQgPSByZXN1bHRzWzBdO1xuICBjb25zdCBmb3VuZFVzZXJJc05vdEN1cnJlbnRVc2VyID0gdXNlcklkICYmIHVzZXJSZXN1bHQgJiYgdXNlcklkICE9PSB1c2VyUmVzdWx0Lm9iamVjdElkO1xuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEgfHwgZm91bmRVc2VySXNOb3RDdXJyZW50VXNlcikge1xuICAgIC8vIFRvIGF2b2lkIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL3NlY3VyaXR5L2Fkdmlzb3JpZXMvR0hTQS04dzNqLWc5ODMtOGpoNVxuICAgIC8vIExldCdzIHJ1biBzb21lIHZhbGlkYXRpb24gYmVmb3JlIHRocm93aW5nXG4gICAgYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oYXV0aERhdGEsIHRoaXMsIHVzZXJSZXN1bHQpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG5cbiAgLy8gTm8gdXNlciBmb3VuZCB3aXRoIHByb3ZpZGVkIGF1dGhEYXRhIHdlIG5lZWQgdG8gdmFsaWRhdGVcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIGNvbnN0IHsgYXV0aERhdGE6IHZhbGlkYXRlZEF1dGhEYXRhLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgIGF1dGhEYXRhLFxuICAgICAgdGhpc1xuICAgICk7XG4gICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAvLyBSZXBsYWNlIGN1cnJlbnQgYXV0aERhdGEgYnkgdGhlIG5ldyB2YWxpZGF0ZWQgb25lXG4gICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVXNlciBmb3VuZCB3aXRoIHByb3ZpZGVkIGF1dGhEYXRhXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMSkge1xuICAgIHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgY29uc3QgeyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9ID0gQXV0aC5oYXNNdXRhdGVkQXV0aERhdGEoXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGFcbiAgICApO1xuXG4gICAgY29uc3QgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyID1cbiAgICAgICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHx8XG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXI7XG5cbiAgICBjb25zdCBpc0xvZ2luID0gIXVzZXJJZDtcblxuICAgIGlmIChpc0xvZ2luIHx8IGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3Rlcikge1xuICAgICAgLy8gbm8gdXNlciBtYWtpbmcgdGhlIGNhbGxcbiAgICAgIC8vIE9SIHRoZSB1c2VyIG1ha2luZyB0aGUgY2FsbCBpcyB0aGUgcmlnaHQgb25lXG4gICAgICAvLyBMb2dpbiB3aXRoIGF1dGggZGF0YVxuICAgICAgZGVsZXRlIHJlc3VsdHNbMF0ucGFzc3dvcmQ7XG5cbiAgICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBvYmplY3RJZCBmaXJzdCBvdGhlcndpc2UgbG9jYXRpb24gaGFzIHRyYWlsaW5nIHVuZGVmaW5lZFxuICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gdXNlclJlc3VsdC5vYmplY3RJZDtcblxuICAgICAgaWYgKCF0aGlzLnF1ZXJ5IHx8ICF0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgLy8gd2lsbCBiZSBpZ25vcmVkLlxuICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihzdHJ1Y3R1cmVkQ2xvbmUodXNlclJlc3VsdCkpO1xuXG4gICAgICAgIC8vIElmIHdlIGFyZSBpbiBsb2dpbiBvcGVyYXRpb24gdmlhIGF1dGhEYXRhXG4gICAgICAgIC8vIHdlIG5lZWQgdG8gYmUgc3VyZSB0aGF0IHRoZSB1c2VyIGhhcyBwcm92aWRlZFxuICAgICAgICAvLyByZXF1aXJlZCBhdXRoRGF0YVxuICAgICAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oXG4gICAgICAgICAgeyBjb25maWc6IHRoaXMuY29uZmlnLCBhdXRoOiB0aGlzLmF1dGggfSxcbiAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhLFxuICAgICAgICAgIHRoaXMuY29uZmlnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIFByZXZlbnQgdmFsaWRhdGluZyBpZiBubyBtdXRhdGVkIGRhdGEgZGV0ZWN0ZWQgb24gdXBkYXRlXG4gICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSAmJiBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBBbHdheXMgdmFsaWRhdGUgYWxsIHByb3ZpZGVkIGF1dGhEYXRhIG9uIGxvZ2luIHRvIHByZXZlbnQgYXV0aGVudGljYXRpb25cbiAgICAgIC8vIGJ5cGFzcyB2aWEgcGFydGlhbCBhdXRoRGF0YSAoZS5nLiBzZW5kaW5nIG9ubHkgdGhlIHByb3ZpZGVyIElEIHdpdGhvdXRcbiAgICAgIC8vIGFuIGFjY2VzcyB0b2tlbik7IG9uIHVwZGF0ZSBvbmx5IHZhbGlkYXRlIG11dGF0ZWQgb25lc1xuICAgICAgaWYgKGlzTG9naW4gfHwgaGFzTXV0YXRlZEF1dGhEYXRhIHx8ICF0aGlzLmNvbmZpZy5hbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgICAgIGlzTG9naW4gPyBhdXRoRGF0YSA6IG11dGF0ZWRBdXRoRGF0YSxcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgIHVzZXJSZXN1bHRcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgICAgICB0aGlzLmF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2FwdHVyZSBvcmlnaW5hbCBhdXRoRGF0YSBiZWZvcmUgbXV0YXRpbmcgdXNlclJlc3VsdCB2aWEgdGhlIHJlc3BvbnNlIHJlZmVyZW5jZVxuICAgICAgY29uc3Qgb3JpZ2luYWxBdXRoRGF0YSA9IHVzZXJSZXN1bHQ/LmF1dGhEYXRhXG4gICAgICAgID8gT2JqZWN0LmZyb21FbnRyaWVzKFxuICAgICAgICAgIE9iamVjdC5lbnRyaWVzKHVzZXJSZXN1bHQuYXV0aERhdGEpLm1hcCgoW2ssIHZdKSA9PlxuICAgICAgICAgICAgW2ssIHYgJiYgdHlwZW9mIHYgPT09ICdvYmplY3QnID8geyAuLi52IH0gOiB2XVxuICAgICAgICAgIClcbiAgICAgICAgKVxuICAgICAgICA6IHVuZGVmaW5lZDtcblxuICAgICAgLy8gSUYgd2UgYXJlIGluIGxvZ2luIHdlJ2xsIHNraXAgdGhlIGRhdGFiYXNlIG9wZXJhdGlvbiAvIGJlZm9yZVNhdmUgLyBhZnRlclNhdmUgZXRjLi4uXG4gICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgIC8vIFdlIGFyZSBzdXBwb3NlZCB0byBoYXZlIGEgcmVzcG9uc2Ugb25seSBvbiBMT0dJTiB3aXRoIGF1dGhEYXRhLCBzbyB3ZSBza2lwIHRob3NlXG4gICAgICAvLyBJZiB3ZSdyZSBub3QgbG9nZ2luZyBpbiwgYnV0IGp1c3QgdXBkYXRpbmcgdGhlIGN1cnJlbnQgdXNlciwgd2UgY2FuIHNhZmVseSBza2lwIHRoYXQgcGFydFxuICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgLy8gQXNzaWduIHRoZSBuZXcgYXV0aERhdGEgaW4gdGhlIHJlc3BvbnNlXG4gICAgICAgIE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPSBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3Rlcicgb25seSBpZiBhdXRoRGF0YSBjb250YWlucyBzb21lIGtleXNcbiAgICAgICAgLy8gYXV0aERhdGEgY291bGQgbm90IGNvbnRhaW5zIGtleXMgYWZ0ZXIgdmFsaWRhdGlvbiBpZiB0aGUgYXV0aEFkYXB0ZXJcbiAgICAgICAgLy8gdXNlcyB0aGUgYGRvTm90U2F2ZWAgb3B0aW9uLiBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0geyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH07XG4gICAgICAgICAgLy8gT3B0aW1pc3RpYyBsb2NraW5nOiBpbmNsdWRlIGVhY2ggY2hhbmdlZCBvcmlnaW5hbCBmaWVsZCBpbiB0aGUgV0hFUkUgY2xhdXNlXG4gICAgICAgICAgLy8gZm9yIHByb3ZpZGVycyB3aG9zZSBkYXRhIGlzIGJlaW5nIHVwZGF0ZWQuIFRoaXMgcHJldmVudHMgY29uY3VycmVudCByZXF1ZXN0c1xuICAgICAgICAgIC8vIGZyb20gYm90aCBzdWNjZWVkaW5nIHdoZW4gY29uc3VtaW5nIHNpbmdsZS11c2UgdG9rZW5zIChlLmcuIE1GQSByZWNvdmVyeSBjb2Rlc1xuICAgICAgICAgIC8vIGFzIGFycmF5cywgb3IgTUZBIFNNUyBPVFAgdG9rZW5zIGFzIHN0cmluZ3MpLlxuICAgICAgICAgIGFwcGx5QXV0aERhdGFPcHRpbWlzdGljTG9jayhxdWVyeSwgb3JpZ2luYWxBdXRoRGF0YSwgdGhpcy5kYXRhLmF1dGhEYXRhKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIHsgYXV0aERhdGE6IHRoaXMuZGF0YS5hdXRoRGF0YSB9LFxuICAgICAgICAgICAgICB7fVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsICdJbnZhbGlkIGF1dGggZGF0YScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fdGhyb3dJZkF1dGhEYXRhRHVwbGljYXRlKGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMuZGF0YS5hdXRoRGF0YSAmJiBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAvLyBVUERBVEUgcGF0aCAoZS5nLiBQVVQgL3VzZXJzLzppZCBkdXJpbmcgbGlua2VkLXByb3ZpZGVyIHJlLWF1dGgpOiBhcHBseVxuICAgICAgICAvLyB0aGUgc2FtZSBvcHRpbWlzdGljIGxvY2sgdG8gdGhlIHN1YnNlcXVlbnQgcnVuRGF0YWJhc2VPcGVyYXRpb24gdXBkYXRlIHNvXG4gICAgICAgIC8vIGNvbmN1cnJlbnQgc2luZ2xlLXVzZSB0b2tlbiBjb25zdW1lcnMgY2Fubm90IGJvdGggc3VjY2VlZC5cbiAgICAgICAgYXBwbHlBdXRoRGF0YU9wdGltaXN0aWNMb2NrKHRoaXMucXVlcnksIG9yaWdpbmFsQXV0aERhdGEsIHRoaXMuZGF0YS5hdXRoRGF0YSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNoZWNrUmVzdHJpY3RlZEZpZWxkcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGguaXNNYWludGVuYW5jZSAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICdlbWFpbFZlcmlmaWVkJyBpbiB0aGlzLmRhdGEpIHtcbiAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICBcIkNsaWVudHMgYXJlbid0IGFsbG93ZWQgdG8gbWFudWFsbHkgdXBkYXRlIGVtYWlsIHZlcmlmaWNhdGlvbi5cIixcbiAgICAgIHRoaXMuY29uZmlnXG4gICAgKTtcbiAgfVxufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19TZXNzaW9uJyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgcmVzdFdoZXJlOiB7XG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgcHJvbWlzZSA9IHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5yZXN1bHRzLmZvckVhY2goc2Vzc2lvbiA9PlxuICAgICAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIudXNlci5kZWwoc2Vzc2lvbi5zZXNzaW9uVG9rZW4pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBUcmFuc2Zvcm0gdGhlIHBhc3N3b3JkXG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gaWdub3JlIG9ubHkgaWYgdW5kZWZpbmVkLiBzaG91bGQgcHJvY2VlZCBpZiBlbXB0eSAoJycpXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gPSB0cnVlO1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIG5ldyBzZXNzaW9uIG9ubHkgaWYgdGhlIHVzZXIgcmVxdWVzdGVkXG4gICAgICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgICAgICAgIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5KCkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5oYXNoKHRoaXMuZGF0YS5wYXNzd29yZCkudGhlbihoYXNoZWRQYXNzd29yZCA9PiB7XG4gICAgICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgPSBoYXNoZWRQYXNzd29yZDtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlVXNlck5hbWUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZUVtYWlsKCk7XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVVzZXJOYW1lID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayBmb3IgdXNlcm5hbWUgdW5pcXVlbmVzc1xuICBpZiAoIXRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgdGhpcy5kYXRhLnVzZXJuYW1lID0gY3J5cHRvVXRpbHMucmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLypcbiAgICBVc2VybmFtZXMgc2hvdWxkIGJlIHVuaXF1ZSB3aGVuIGNvbXBhcmVkIGNhc2UgaW5zZW5zaXRpdmVseVxuXG4gICAgVXNlcnMgc2hvdWxkIGJlIGFibGUgdG8gbWFrZSBjYXNlIHNlbnNpdGl2ZSB1c2VybmFtZXMgYW5kXG4gICAgbG9naW4gdXNpbmcgdGhlIGNhc2UgdGhleSBlbnRlcmVkLiAgSS5lLiAnU25vb3B5JyBzaG91bGQgcHJlY2x1ZGVcbiAgICAnc25vb3B5JyBhcyBhIHZhbGlkIHVzZXJuYW1lLlxuICAqL1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9KTtcbn07XG5cbi8qXG4gIEFzIHdpdGggdXNlcm5hbWVzLCBQYXJzZSBzaG91bGQgbm90IGFsbG93IGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBvZiBlbWFpbC5cbiAgdW5saWtlIHdpdGggdXNlcm5hbWVzICh3aGljaCBjYW4gaGF2ZSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgaW4gdGhlIGNhc2Ugb2ZcbiAgYXV0aCBhZGFwdGVycyksIGVtYWlscyBzaG91bGQgbmV2ZXIgaGF2ZSBhIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9uLlxuXG4gIFRoaXMgYmVoYXZpb3IgY2FuIGJlIGVuZm9yY2VkIHRocm91Z2ggYSBwcm9wZXJseSBjb25maWd1cmVkIGluZGV4IHNlZTpcbiAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LWNhc2UtaW5zZW5zaXRpdmUvI2NyZWF0ZS1hLWNhc2UtaW5zZW5zaXRpdmUtaW5kZXhcbiAgd2hpY2ggY291bGQgYmUgaW1wbGVtZW50ZWQgaW5zdGVhZCBvZiB0aGlzIGNvZGUgYmFzZWQgdmFsaWRhdGlvbi5cblxuICBHaXZlbiB0aGF0IHRoaXMgbG9va3VwIHNob3VsZCBiZSBhIHJlbGF0aXZlbHkgbG93IHVzZSBjYXNlIGFuZCB0aGF0IHRoZSBjYXNlIHNlbnNpdGl2ZVxuICB1bmlxdWUgaW5kZXggd2lsbCBiZSB1c2VkIGJ5IHRoZSBkYiBmb3IgdGhlIHF1ZXJ5LCB0aGlzIGlzIGFuIGFkZXF1YXRlIHNvbHV0aW9uLlxuKi9cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlRW1haWwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsIHx8IHRoaXMuZGF0YS5lbWFpbC5fX29wID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBWYWxpZGF0ZSBiYXNpYyBlbWFpbCBhZGRyZXNzIGZvcm1hdFxuICBpZiAoIXRoaXMuZGF0YS5lbWFpbC5tYXRjaCgvXi4rQC4rJC8pKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUywgJ0VtYWlsIGFkZHJlc3MgZm9ybWF0IGlzIGludmFsaWQuJylcbiAgICApO1xuICB9XG4gIC8vIENhc2UgaW5zZW5zaXRpdmUgbWF0Y2gsIHNlZSBub3RlIGFib3ZlIGZ1bmN0aW9uLlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAhdGhpcy5kYXRhLmF1dGhEYXRhIHx8XG4gICAgICAgICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCB8fFxuICAgICAgICAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpWzBdID09PSAnYW5vbnltb3VzJylcbiAgICAgICkge1xuICAgICAgICAvLyBXZSB1cGRhdGVkIHRoZSBlbWFpbCwgc2VuZCBhIG5ldyB2YWxpZGF0aW9uXG4gICAgICAgIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgICAgICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxPYmplY3QsXG4gICAgICAgICAgb2JqZWN0OiB1cGRhdGVkT2JqZWN0LFxuICAgICAgICAgIG1hc3RlcjogdGhpcy5hdXRoLmlzTWFzdGVyLFxuICAgICAgICAgIGlwOiB0aGlzLmNvbmZpZy5pcCxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2V0RW1haWxWZXJpZnlUb2tlbih0aGlzLmRhdGEsIHJlcXVlc3QsIHRoaXMuc3RvcmFnZSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5KSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgcG9saWN5RXJyb3IpKTtcbiAgfVxuXG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgY29udGFpbiB1c2VybmFtZVxuICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lID09PSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgICAgLy8gdXNlcm5hbWUgaXMgbm90IHBhc3NlZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZih0aGlzLmRhdGEudXNlcm5hbWUpID49IDApXG4gICAgICB7IHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKSk7IH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmV0cmlldmUgdGhlIFVzZXIgb2JqZWN0IHVzaW5nIG9iamVjdElkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZihyZXN1bHRzWzBdLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICB7IHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKVxuICAgICAgICApOyB9XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9LFxuICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICB7IG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDFcbiAgICAgICAgKTsgfVxuICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgY29uc3QgbmV3UGFzc3dvcmQgPSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIC8vIGNvbXBhcmUgdGhlIG5ldyBwYXNzd29yZCBoYXNoIHdpdGggYWxsIG9sZCBwYXNzd29yZCBoYXNoZXNcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBvbGRQYXNzd29yZHMubWFwKGZ1bmN0aW9uIChoYXNoKSB7XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUobmV3UGFzc3dvcmQsIGhhc2gpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAvLyByZWplY3QgaWYgdGhlcmUgaXMgYSBtYXRjaFxuICAgICAgICAgICAgeyByZXR1cm4gUHJvbWlzZS5yZWplY3QoJ1JFUEVBVF9QQVNTV09SRCcpOyB9XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB3YWl0IGZvciBhbGwgY29tcGFyaXNvbnMgdG8gY29tcGxldGVcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyciA9PT0gJ1JFUEVBVF9QQVNTV09SRCcpXG4gICAgICAgICAgICAvLyBhIG1hdGNoIHdhcyBmb3VuZFxuICAgICAgICAgICAgeyByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgIGBOZXcgcGFzc3dvcmQgc2hvdWxkIG5vdCBiZSB0aGUgc2FtZSBhcyBsYXN0ICR7dGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5fSBwYXNzd29yZHMuYFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApOyB9XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIElmIHNpZ24tdXAgY2FsbFxuICBpZiAoIXRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIpIHtcbiAgICAvLyBDcmVhdGUgcmVxdWVzdCBvYmplY3QgZm9yIHZlcmlmaWNhdGlvbiBmdW5jdGlvbnNcbiAgICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbE9iamVjdCxcbiAgICAgIG9iamVjdDogdXBkYXRlZE9iamVjdCxcbiAgICAgIG1hc3RlcjogdGhpcy5hdXRoLmlzTWFzdGVyLFxuICAgICAgaXA6IHRoaXMuY29uZmlnLmlwLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgICB9O1xuICAgIC8vIEdldCB2ZXJpZmljYXRpb24gY29uZGl0aW9ucyB3aGljaCBjYW4gYmUgYm9vbGVhbnMgb3IgZnVuY3Rpb25zOyB0aGUgcHVycG9zZSBvZiB0aGlzIGFzeW5jL2F3YWl0XG4gICAgLy8gc3RydWN0dXJlIGlzIHRvIGF2b2lkIHVubmVjZXNzYXJpbHkgZXhlY3V0aW5nIHN1YnNlcXVlbnQgZnVuY3Rpb25zIGlmIHByZXZpb3VzIG9uZXMgZmFpbCBpbiB0aGVcbiAgICAvLyBjb25kaXRpb25hbCBzdGF0ZW1lbnQgYmVsb3csIGFzIGEgZGV2ZWxvcGVyIG1heSBkZWNpZGUgdG8gZXhlY3V0ZSBleHBlbnNpdmUgb3BlcmF0aW9ucyBpbiB0aGVtXG4gICAgY29uc3QgdmVyaWZ5VXNlckVtYWlscyA9IGFzeW5jICgpID0+IHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgPT09IHRydWUgfHwgKHR5cGVvZiB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgY29uc3QgcHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9IGFzeW5jICgpID0+IHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09IHRydWUgfHwgKHR5cGVvZiB0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgLy8gSWYgdmVyaWZpY2F0aW9uIGlzIHJlcXVpcmVkXG4gICAgaWYgKGF3YWl0IHZlcmlmeVVzZXJFbWFpbHMoKSAmJiBhd2FpdCBwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKCkpIHtcbiAgICAgIHRoaXMuc3RvcmFnZS5yZWplY3RTaWdudXAgPSB0cnVlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID09IG51bGwgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkuam9pbignLCcpO1xuICB9XG5cbiAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICB1c2VySWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgYWN0aW9uOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID8gJ2xvZ2luJyA6ICdzaWdudXAnLFxuICAgICAgYXV0aFByb3ZpZGVyOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyIHx8ICdwYXNzd29yZCcsXG4gICAgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICB9KTtcblxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG4gIH1cblxuICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpO1xufTtcblxuUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIEF1dGgubWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIG51bGwsIHNlc3Npb25EYXRhKS5leGVjdXRlKCksXG4gIH07XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5xdWVyeSA9PT0gbnVsbCkge1xuICAgIC8vIG51bGwgcXVlcnkgbWVhbnMgY3JlYXRlXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCdwYXNzd29yZCcgaW4gdGhpcy5kYXRhIHx8ICdlbWFpbCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgYWRkT3BzID0ge1xuICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICB9O1xuICAgIHRoaXMuZGF0YSA9IE9iamVjdC5hc3NpZ24odGhpcy5kYXRhLCBhZGRPcHMpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIE9ubHkgZm9yIF9TZXNzaW9uLCBhbmQgYXQgY3JlYXRpb24gdGltZVxuICBpZiAodGhpcy5jbGFzc05hbWUgIT0gJ19TZXNzaW9uJyB8fCB0aGlzLnF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERlc3Ryb3kgdGhlIHNlc3Npb25zIGluICdCYWNrZ3JvdW5kJ1xuICBjb25zdCB7IHVzZXIsIGluc3RhbGxhdGlvbklkLCBzZXNzaW9uVG9rZW4gfSA9IHRoaXMuZGF0YTtcbiAgaWYgKCF1c2VyIHx8ICFpbnN0YWxsYXRpb25JZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXVzZXIub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveShcbiAgICAnX1Nlc3Npb24nLFxuICAgIHtcbiAgICAgIHVzZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHNlc3Npb25Ub2tlbjogeyAkbmU6IHNlc3Npb25Ub2tlbiB9LFxuICAgIH0sXG4gICAge30sXG4gICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgKTtcbn07XG5cbi8vIEhhbmRsZXMgYW55IGZvbGxvd3VwIGxvZ2ljXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUZvbGxvd3VwID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddICYmIHRoaXMuY29uZmlnLnJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQpIHtcbiAgICB2YXIgc2Vzc2lvblF1ZXJ5ID0ge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXTtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5kZXN0cm95KCdfU2Vzc2lvbicsIHNlc3Npb25RdWVyeSlcbiAgICAgIC50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKS50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXTtcbiAgICAvLyBGaXJlIGFuZCBmb3JnZXQhXG4gICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHRoaXMuZGF0YSwgeyBhdXRoOiB0aGlzLmF1dGggfSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX1Nlc3Npb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBfU2Vzc2lvbiBvYmplY3QuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZVNlc3Npb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGgudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLicpO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmIHRoaXMuZGF0YS51c2VyLm9iamVjdElkICE9IHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICgnaW5zdGFsbGF0aW9uSWQnIGluIHRoaXMuZGF0YSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAoJ3Nlc3Npb25Ub2tlbicgaW4gdGhpcy5kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICgnZXhwaXJlc0F0JyBpbiB0aGlzLmRhdGEgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKCdjcmVhdGVkV2l0aCcgaW4gdGhpcy5kYXRhICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0ge1xuICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgY29uc3QgYWRkaXRpb25hbFNlc3Npb25EYXRhID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMuZGF0YSkge1xuICAgICAgaWYgKGtleSA9PT0gJ29iamVjdElkJyB8fCBrZXkgPT09ICd1c2VyJyB8fCBrZXkgPT09ICdzZXNzaW9uVG9rZW4nIHx8IGtleSA9PT0gJ2V4cGlyZXNBdCcgfHwga2V5ID09PSAnY3JlYXRlZFdpdGgnKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLnJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLicpO1xuICAgICAgfVxuICAgICAgc2Vzc2lvbkRhdGFbJ29iamVjdElkJ10gPSByZXN1bHRzLnJlc3BvbnNlWydvYmplY3RJZCddO1xuICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgIGxvY2F0aW9uOiByZXN1bHRzLmxvY2F0aW9uLFxuICAgICAgICByZXNwb25zZTogc2Vzc2lvbkRhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfSW5zdGFsbGF0aW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gaW5zdGFsbGF0aW9uIG9iamVjdC5cbi8vIElmIGFuIGluc3RhbGxhdGlvbiBpcyBmb3VuZCwgdGhpcyBjYW4gbXV0YXRlIHRoaXMucXVlcnkgYW5kIHR1cm4gYSBjcmVhdGVcbi8vIGludG8gYW4gdXBkYXRlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVJbnN0YWxsYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgZGVkdXBsaWNhdGlvbiBiZWxvdyBlbWJlZHMgdGhlc2UgY2xpZW50LXN1cHBsaWVkIHZhbHVlcyBkaXJlY3RseSBpbnRvIGRhdGFiYXNlXG4gIC8vIHF1ZXJpZXMgdGhhdCBkZWxldGUgb3IgdXBkYXRlIHJvd3Mgd2l0aCBtYXN0ZXIgcHJpdmlsZWdlcywgYW5kIGl0IHJ1bnMgYmVmb3JlXG4gIC8vIGB2YWxpZGF0ZVNjaGVtYWAsIHNvIHRoZWlyIHR5cGVzIG11c3QgYmUgZW5mb3JjZWQgaGVyZTogYSBub24tc3RyaW5nIHZhbHVlIHdvdWxkXG4gIC8vIG90aGVyd2lzZSByZWFjaCB0aGUgZGF0YWJhc2UgYXMgYSBxdWVyeSBjb25zdHJhaW50IChzdWNoIGFzIGFuIG9wZXJhdG9yIG9iamVjdFxuICAvLyBge1wiJG5lXCI6IG51bGx9YCkgbWF0Y2hpbmcgcm93cyB0aGUgY2xpZW50IG5ldmVyIGlkZW50aWZpZWQsIGluc3RlYWQgb2YgYXMgYSBsaXRlcmFsXG4gIC8vIHZhbHVlIHRvIG1hdGNoIGFnYWluc3QuIFRoZSBzY2hlbWEgZGVjbGFyZXMgYWxsIHRocmVlIGFzIGBTdHJpbmdgLCBidXQgdGhhdCBjaGVja1xuICAvLyBjYW5ub3QgYmUgcmV1c2VkIGhlcmU7IGl0IHJ1bnMgbGF0ZXIgaW4gdGhlIHdyaXRlIHBpcGVsaW5lIGFuZCBtb3ZpbmcgaXQgZWFybGllclxuICAvLyB3b3VsZCBtdXRhdGUgdGhlIHNjaGVtYSBiZWZvcmUgdGhlIHBlcm1pc3Npb24gY2hlY2suIFRoZSBmaWVsZCBsaXN0IGlzIGEgcHJvcGVydHkgb2ZcbiAgLy8gdGhpcyBmdW5jdGlvbiByYXRoZXIgdGhhbiBvZiB0aGUgc2NoZW1hOiBpdCBpcyB0aGUgc2V0IG9mIHZhbHVlcyBzcGxpY2VkIGludG8gdGhlXG4gIC8vIGRlZHVwbGljYXRpb24gcXVlcmllcyBiZWxvdy5cbiAgZm9yIChjb25zdCBmaWVsZE5hbWUgb2YgWydkZXZpY2VUb2tlbicsICdpbnN0YWxsYXRpb25JZCcsICdhcHBJZGVudGlmaWVyJ10pIHtcbiAgICBjb25zdCB2YWx1ZSA9IHRoaXMuZGF0YVtmaWVsZE5hbWVdO1xuICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoZmllbGROYW1lID09PSAnYXBwSWRlbnRpZmllcicgJiYgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBhY3R1YWxUeXBlID0gQXJyYXkuaXNBcnJheSh2YWx1ZSlcbiAgICAgID8gJ0FycmF5J1xuICAgICAgOiBgJHt0eXBlb2YgdmFsdWV9YC5yZXBsYWNlKC9eLi8sIGNoYXJhY3RlciA9PiBjaGFyYWN0ZXIudG9VcHBlckNhc2UoKSk7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciBfSW5zdGFsbGF0aW9uLiR7ZmllbGROYW1lfTsgZXhwZWN0ZWQgU3RyaW5nIGJ1dCBnb3QgJHthY3R1YWxUeXBlfWBcbiAgICApO1xuICB9XG5cbiAgaWYgKFxuICAgICF0aGlzLnF1ZXJ5ICYmXG4gICAgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAhdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIDEzNSxcbiAgICAgICdhdCBsZWFzdCBvbmUgSUQgZmllbGQgKGRldmljZVRva2VuLCBpbnN0YWxsYXRpb25JZCkgJyArICdtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbidcbiAgICApO1xuICB9XG5cbiAgLy8gSWYgdGhlIGRldmljZSB0b2tlbiBpcyA2NCBjaGFyYWN0ZXJzIGxvbmcsIHdlIGFzc3VtZSBpdCBpcyBmb3IgaU9TXG4gIC8vIGFuZCBsb3dlcmNhc2UgaXQuXG4gIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgdGhpcy5kYXRhLmRldmljZVRva2VuLmxlbmd0aCA9PSA2NCkge1xuICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiA9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbi50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gV2UgbG93ZXJjYXNlIHRoZSBpbnN0YWxsYXRpb25JZCBpZiBwcmVzZW50XG4gIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIGxldCBpbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZDtcblxuICAvLyBJZiBkYXRhLmluc3RhbGxhdGlvbklkIGlzIG5vdCBzZXQgYW5kIHdlJ3JlIG5vdCBtYXN0ZXIsIHdlIGNhbiBsb29rdXAgaW4gYXV0aFxuICBpZiAoIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBVcGRhdGluZyBfSW5zdGFsbGF0aW9uIGJ1dCBub3QgdXBkYXRpbmcgYW55dGhpbmcgY3JpdGljYWxcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiAhaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuZGF0YS5kZXZpY2VUeXBlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICB2YXIgaWRNYXRjaDsgLy8gV2lsbCBiZSBhIG1hdGNoIG9uIGVpdGhlciBvYmplY3RJZCBvciBpbnN0YWxsYXRpb25JZFxuICB2YXIgb2JqZWN0SWRNYXRjaDtcbiAgdmFyIGluc3RhbGxhdGlvbklkTWF0Y2g7XG4gIHZhciBkZXZpY2VUb2tlbk1hdGNoZXMgPSBbXTtcblxuICAvLyBJbnN0ZWFkIG9mIGlzc3VpbmcgMyByZWFkcywgbGV0J3MgZG8gaXQgd2l0aCBvbmUgT1IuXG4gIGNvbnN0IG9yUXVlcmllcyA9IFtdO1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goe1xuICAgICAgb2JqZWN0SWQ6IHRoaXMucXVlcnkub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goe1xuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuICB9XG4gIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7IGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gfSk7XG4gIH1cblxuICBpZiAob3JRdWVyaWVzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJvbWlzZSA9IHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgJ19JbnN0YWxsYXRpb24nLFxuICAgICAgICB7XG4gICAgICAgICAgJG9yOiBvclF1ZXJpZXMsXG4gICAgICAgIH0sXG4gICAgICAgIHt9XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiByZXN1bHQub2JqZWN0SWQgPT0gdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIG9iamVjdElkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5pbnN0YWxsYXRpb25JZCA9PSBpbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIGluc3RhbGxhdGlvbklkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5kZXZpY2VUb2tlbiA9PSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gU2FuaXR5IGNoZWNrcyB3aGVuIHJ1bm5pbmcgYSBxdWVyeVxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAoIW9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQgZm9yIHVwZGF0ZS4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAhPT0gb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnaW5zdGFsbGF0aW9uSWQgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICAhb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnZGV2aWNlVG9rZW4gbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVR5cGVcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVR5cGUgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIG9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IG9iamVjdElkTWF0Y2g7XG4gICAgICB9XG5cbiAgICAgIGlmIChpbnN0YWxsYXRpb25JZCAmJiBpbnN0YWxsYXRpb25JZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gbmVlZCB0byBzcGVjaWZ5IGRldmljZVR5cGUgb25seSBpZiBpdCdzIG5ld1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJiAhaWRNYXRjaCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM1LCAnZGV2aWNlVHlwZSBtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbicpO1xuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKCFpZE1hdGNoKSB7XG4gICAgICAgIGlmICghZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiZcbiAgICAgICAgICAoIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSB8fCAhaW5zdGFsbGF0aW9uSWQpXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIFNpbmdsZSBtYXRjaCBvbiBkZXZpY2UgdG9rZW4gYnV0IG5vbmUgb24gaW5zdGFsbGF0aW9uSWQsIGFuZCBlaXRoZXJcbiAgICAgICAgICAvLyB0aGUgcGFzc2VkIG9iamVjdCBvciB0aGUgbWF0Y2ggaXMgbWlzc2luZyBhbiBpbnN0YWxsYXRpb25JZCwgc28gd2VcbiAgICAgICAgICAvLyBjYW4ganVzdCByZXR1cm4gdGhlIG1hdGNoLlxuICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIDEzMixcbiAgICAgICAgICAgICdNdXN0IHNwZWNpZnkgaW5zdGFsbGF0aW9uSWQgd2hlbiBkZXZpY2VUb2tlbiAnICtcbiAgICAgICAgICAgICAgJ21hdGNoZXMgbXVsdGlwbGUgSW5zdGFsbGF0aW9uIG9iamVjdHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBNdWx0aXBsZSBkZXZpY2UgdG9rZW4gbWF0Y2hlcyBhbmQgd2Ugc3BlY2lmaWVkIGFuIGluc3RhbGxhdGlvbiBJRCxcbiAgICAgICAgICAvLyBvciBhIHNpbmdsZSBtYXRjaCB3aGVyZSBib3RoIHRoZSBwYXNzZWQgYW5kIG1hdGNoaW5nIG9iamVjdHMgaGF2ZVxuICAgICAgICAgIC8vIGFuIGluc3RhbGxhdGlvbiBJRC4gVHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoXG4gICAgICAgICAgLy8gdGhlIGRldmljZVRva2VuLCBhbmQgcmV0dXJuIG5pbCB0byBzaWduYWwgdGhhdCBhIG5ldyBvYmplY3Qgc2hvdWxkXG4gICAgICAgICAgLy8gYmUgY3JlYXRlZC5cbiAgICAgICAgICB2YXIgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHtcbiAgICAgICAgICAgICAgJG5lOiBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgIC8vIEEgYERlbGV0ZWAgb3BlcmF0aW9uIGlzIGFwcGxpZWQgb25seSBhZnRlciB0aGUgZGVkdXBsaWNhdGlvbiBydW5zLCBhbmQgbm9cbiAgICAgICAgICAgIC8vIGluc3RhbGxhdGlvbiBtYXRjaGVkIGhlcmUgdG8gdGFrZSBhIHNjb3BlIGZyb20uIFNraXAgdGhlIGNsZWFudXAgcmF0aGVyIHRoYW5cbiAgICAgICAgICAgIC8vIHJ1biBpdCB1bnNjb3BlZCBhY3Jvc3MgZXZlcnkgYXBwbGljYXRpb24sIG9yIHF1ZXJ5IG9uIHRoZSBvcGVyYXRpb24gaXRzZWxmLlxuICAgICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEuYXBwSWRlbnRpZmllciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiYgIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSkge1xuICAgICAgICAgIC8vIEV4YWN0bHkgb25lIGRldmljZSB0b2tlbiBtYXRjaCBhbmQgaXQgZG9lc24ndCBoYXZlIGFuIGluc3RhbGxhdGlvblxuICAgICAgICAgIC8vIElELiBUaGlzIGlzIHRoZSBvbmUgY2FzZSB3aGVyZSB3ZSB3YW50IHRvIG1lcmdlIHdpdGggdGhlIGV4aXN0aW5nXG4gICAgICAgICAgLy8gb2JqZWN0LlxuICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0geyBvYmplY3RJZDogaWRNYXRjaC5vYmplY3RJZCB9O1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgICAgLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZFxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIGlkTWF0Y2guZGV2aWNlVG9rZW4gIT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgICAvLyBXZSdyZSBzZXR0aW5nIHRoZSBkZXZpY2UgdG9rZW4gb24gYW4gZXhpc3RpbmcgaW5zdGFsbGF0aW9uLCBzb1xuICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIHRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaCB0aGlzXG4gICAgICAgICAgICAvLyBkZXZpY2UgdG9rZW4uXG4gICAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyBXZSBoYXZlIGEgdW5pcXVlIGluc3RhbGwgSWQsIHVzZSB0aGF0IHRvIHByZXNlcnZlXG4gICAgICAgICAgICAvLyB0aGUgaW50ZXJlc3RpbmcgaW5zdGFsbGF0aW9uXG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydpbnN0YWxsYXRpb25JZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCA9PSB0aGlzLmRhdGEub2JqZWN0SWRcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyB3ZSBwYXNzZWQgYW4gb2JqZWN0SWQsIHByZXNlcnZlIHRoYXQgaW5zdGFsYXRpb25cbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ29iamVjdElkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiBpZE1hdGNoLm9iamVjdElkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gV2hhdCB0byBkbyBoZXJlPyBjYW4ndCByZWFsbHkgY2xlYW4gdXAgZXZlcnl0aGluZy4uLlxuICAgICAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAvLyBBIGBEZWxldGVgIG9wZXJhdGlvbiBpcyBhcHBsaWVkIG9ubHkgYWZ0ZXIgdGhlIGRlZHVwbGljYXRpb24gcnVucywgc28gc2NvcGVcbiAgICAgICAgICAgICAgLy8gdGhlIGNsZWFudXAgdG8gdGhlIHZhbHVlIHRoZSBtYXRjaGVkIGluc3RhbGxhdGlvbiBzdGlsbCBob2xkcy4gRHJvcHBpbmcgdGhlXG4gICAgICAgICAgICAgIC8vIGNvbnN0cmFpbnQgd291bGQgbGV0IHRoZSBjbGVhbnVwIHJlYWNoIGluc3RhbGxhdGlvbnMgb2Ygb3RoZXIgYXBwbGljYXRpb25zLFxuICAgICAgICAgICAgICAvLyBhbmQgdGhlIG9wZXJhdGlvbiBpdHNlbGYgY2Fubm90IG1hdGNoIGEgU3RyaW5nLCBzbyBza2lwIHRoZSBjbGVhbnVwIHdoZW4gbm9cbiAgICAgICAgICAgICAgLy8gc2NvcGUgaXMgYXZhaWxhYmxlLlxuICAgICAgICAgICAgICBjb25zdCBhcHBJZGVudGlmaWVyID1cbiAgICAgICAgICAgICAgICB0eXBlb2YgdGhpcy5kYXRhLmFwcElkZW50aWZpZXIgPT09ICdzdHJpbmcnXG4gICAgICAgICAgICAgICAgICA/IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyXG4gICAgICAgICAgICAgICAgICA6IGlkTWF0Y2guYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiBhcHBJZGVudGlmaWVyICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSBhcHBJZGVudGlmaWVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSW4gbm9uLW1lcmdlIHNjZW5hcmlvcywganVzdCByZXR1cm4gdGhlIGluc3RhbGxhdGlvbiBtYXRjaCBpZFxuICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbihvYmpJZCA9PiB7XG4gICAgICBpZiAob2JqSWQpIHtcbiAgICAgICAgdGhpcy5xdWVyeSA9IHsgb2JqZWN0SWQ6IG9iaklkIH07XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuICAgICAgfVxuICAgICAgLy8gVE9ETzogVmFsaWRhdGUgb3BzIChhZGQvcmVtb3ZlIG9uIGNoYW5uZWxzLCAkaW5jIG9uIGJhZGdlLCBldGMuKVxuICAgIH0pO1xuICByZXR1cm4gcHJvbWlzZTtcbn07XG5cbi8vIElmIHdlIHNob3J0LWNpcmN1aXRlZCB0aGUgb2JqZWN0IHJlc3BvbnNlIC0gdGhlbiB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB3ZSBleHBhbmQgYWxsIHRoZSBmaWxlcyxcbi8vIHNpbmNlIHRoaXMgbWlnaHQgbm90IGhhdmUgYSBxdWVyeSwgbWVhbmluZyBpdCB3b24ndCByZXR1cm4gdGhlIGZ1bGwgcmVzdWx0IGJhY2suXG4vLyBUT0RPOiAobmx1dHNlbmtvKSBUaGlzIHNob3VsZCBkaWUgd2hlbiB3ZSBtb3ZlIHRvIHBlci1jbGFzcyBiYXNlZCBjb250cm9sbGVycyBvbiBfU2Vzc2lvbi9fVXNlclxuUmVzdFdyaXRlLnByb3RvdHlwZS5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgd2hldGhlciB3ZSBoYXZlIGEgc2hvcnQtY2lyY3VpdGVkIHJlc3BvbnNlIC0gb25seSB0aGVuIHJ1biBleHBhbnNpb24uXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICBhd2FpdCB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdGhpcy5yZXNwb25zZS5yZXNwb25zZSk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuRGF0YWJhc2VPcGVyYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1JvbGUnKSB7XG4gICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnJvbGUuY2xlYXIoKTtcbiAgICBpZiAodGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlcikge1xuICAgICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5jbGVhckNhY2hlZFJvbGVzKHRoaXMuYXV0aC51c2VyKTtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgdGhpcy5xdWVyeSAmJiB0aGlzLmF1dGguaXNVbmF1dGhlbnRpY2F0ZWQoKSkge1xuICAgIHRocm93IGNyZWF0ZVNhbml0aXplZEVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuU0VTU0lPTl9NSVNTSU5HLFxuICAgICAgYENhbm5vdCBtb2RpZnkgdXNlciAke3RoaXMucXVlcnkub2JqZWN0SWR9LmAsXG4gICAgICB0aGlzLmNvbmZpZ1xuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUHJvZHVjdCcgJiYgdGhpcy5kYXRhLmRvd25sb2FkKSB7XG4gICAgdGhpcy5kYXRhLmRvd25sb2FkTmFtZSA9IHRoaXMuZGF0YS5kb3dubG9hZC5uYW1lO1xuICB9XG5cbiAgLy8gVE9ETzogQWRkIGJldHRlciBkZXRlY3Rpb24gZm9yIEFDTCwgZW5zdXJpbmcgYSB1c2VyIGNhbid0IGJlIGxvY2tlZCBmcm9tXG4gIC8vICAgICAgIHRoZWlyIG93biB1c2VyIHJlY29yZC5cbiAgaWYgKHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5kYXRhLkFDTFsnKnVucmVzb2x2ZWQnXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0FDTCwgJ0ludmFsaWQgQUNMLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAvLyBGb3JjZSB0aGUgdXNlciB0byBub3QgbG9ja291dFxuICAgIC8vIE1hdGNoZWQgd2l0aCBwYXJzZS5jb21cbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLkFDTCAmJlxuICAgICAgdGhpcy5hdXRoLmlzTWFzdGVyICE9PSB0cnVlICYmXG4gICAgICB0aGlzLmF1dGguaXNNYWludGVuYW5jZSAhPT0gdHJ1ZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLkFDTFt0aGlzLnF1ZXJ5Lm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICB9XG4gICAgLy8gdXBkYXRlIHBhc3N3b3JkIHRpbWVzdGFtcCBpZiB1c2VyIHBhc3N3b3JkIGlzIGJlaW5nIGNoYW5nZWRcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICB9XG4gICAgLy8gSWdub3JlIGNyZWF0ZWRBdCB3aGVuIHVwZGF0ZVxuICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgbGV0IGRlZmVyID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgLy8gaWYgcGFzc3dvcmQgaGlzdG9yeSBpcyBlbmFibGVkIHRoZW4gc2F2ZSB0aGUgY3VycmVudCBwYXNzd29yZCB0byBoaXN0b3J5XG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgKSB7XG4gICAgICBkZWZlciA9IHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9LFxuICAgICAgICAgIEF1dGgubWFpbnRlbmFuY2UodGhpcy5jb25maWcpXG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy9uLTEgcGFzc3dvcmRzIGdvIGludG8gaGlzdG9yeSBpbmNsdWRpbmcgbGFzdCBwYXNzd29yZFxuICAgICAgICAgIHdoaWxlIChcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5sZW5ndGggPiBNYXRoLm1heCgwLCB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAyKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLnNoaWZ0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfaGlzdG9yeSA9IG9sZFBhc3N3b3JkcztcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZmVyLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gUnVuIGFuIHVwZGF0ZVxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgICAgIClcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICB0aGlzLl90aHJvd0lmQXV0aERhdGFEdXBsaWNhdGUoZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0geyByZXNwb25zZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTZXQgdGhlIGRlZmF1bHQgQUNMIGFuZCBwYXNzd29yZCB0aW1lc3RhbXAgZm9yIHRoZSBuZXcgX1VzZXJcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIHZhciBBQ0wgPSB0aGlzLmRhdGEuQUNMO1xuICAgICAgLy8gZGVmYXVsdCBwdWJsaWMgci93IEFDTFxuICAgICAgaWYgKCFBQ0wpIHtcbiAgICAgICAgQUNMID0ge307XG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgICAgICAgIEFDTFsnKiddID0geyByZWFkOiB0cnVlLCB3cml0ZTogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gbWFrZSBzdXJlIHRoZSB1c2VyIGlzIG5vdCBsb2NrZWQgZG93blxuICAgICAgQUNMW3RoaXMuZGF0YS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgICB0aGlzLmRhdGEuQUNMID0gQUNMO1xuICAgICAgLy8gcGFzc3dvcmQgdGltZXN0YW1wIHRvIGJlIHVzZWQgd2hlbiBwYXNzd29yZCBleHBpcnkgcG9saWN5IGlzIGVuZm9yY2VkXG4gICAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSdW4gYSBjcmVhdGVcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5jcmVhdGUodGhpcy5jbGFzc05hbWUsIHRoaXMuZGF0YSwgdGhpcy5ydW5PcHRpb25zLCBmYWxzZSwgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl90aHJvd0lmQXV0aERhdGFEdXBsaWNhdGUoZXJyb3IpO1xuXG4gICAgICAgIC8vIFF1aWNrIGNoZWNrLCBpZiB3ZSB3ZXJlIGFibGUgdG8gaW5mZXIgdGhlIGR1cGxpY2F0ZWQgZmllbGQgbmFtZVxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ2VtYWlsJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UgfHwgIXRoaXMucmVzcG9uc2UucmVzcG9uc2UgfHwgdGhpcy5ydW5PcHRpb25zLm1hbnkpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlclNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyU2F2ZUhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGNvbnN0IGhhc0xpdmVRdWVyeSA9IHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZShcbiAgICB0aGlzLmNsb25lV2l0aEZpbGVVcmxzKHRoaXMucmVzcG9uc2UucmVzcG9uc2UpLFxuICAgIHRoaXMucmVzcG9uc2Uuc3RhdHVzIHx8IDIwMFxuICApO1xuXG4gIGlmIChoYXNMaXZlUXVlcnkpIHtcbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIC8vIE5vdGlmeSBMaXZlUXVlcnlTZXJ2ZXIgaWYgcG9zc2libGVcbiAgICAgICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSk7XG4gICAgICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIub25BZnRlclNhdmUoXG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgICBwZXJtc1xuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0xpdmVRdWVyeSBhZnRlclNhdmUgbm90aWZpY2F0aW9uIGZhaWxlZCcsIGVycik7XG4gICAgICB9KTtcbiAgfVxuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2spIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUnVuIGFmdGVyU2F2ZSB0cmlnZ2VyXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1blRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgY29uc3QganNvblJldHVybmVkID0gcmVzdWx0ICYmICFyZXN1bHQuX3RvRnVsbEpTT047XG4gICAgICBpZiAoanNvblJldHVybmVkKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ09wcy5vcGVyYXRpb25zID0ge307XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSByZXN1bHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShcbiAgICAgICAgICAocmVzdWx0IHx8IHVwZGF0ZWRPYmplY3QpLnRvSlNPTigpLFxuICAgICAgICAgIHRoaXMuZGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1pZGRsZSA9IHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgY29uc3QgbW91bnQgPSB0aGlzLmNvbmZpZy5tb3VudCB8fCB0aGlzLmNvbmZpZy5zZXJ2ZXJVUkw7XG4gIHJldHVybiBtb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGF0YS5vYmplY3RJZCB8fCB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xufTtcblxuLy8gUmV0dXJucyBhIGNvcHkgb2YgdGhlIGRhdGEgYW5kIGRlbGV0ZSBiYWQga2V5cyAoX2F1dGhfZGF0YSwgX2hhc2hlZF9wYXNzd29yZC4uLilcblJlc3RXcml0ZS5wcm90b3R5cGUuc2FuaXRpemVkRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIHRoaXMuY2xvbmVXaXRoRmlsZVVybHModGhpcy5kYXRhKSk7XG4gIHJldHVybiBQYXJzZS5fZGVjb2RlKHVuZGVmaW5lZCwgZGF0YSk7XG59O1xuXG4vLyBSZXR1cm5zIGFuIHVwZGF0ZWQgY29weSBvZiB0aGUgb2JqZWN0XG5SZXN0V3JpdGUucHJvdG90eXBlLmJ1aWxkUGFyc2VPYmplY3RzID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUsIG9iamVjdElkOiB0aGlzLnF1ZXJ5Py5vYmplY3RJZCB9O1xuICBsZXQgb3JpZ2luYWxPYmplY3Q7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICBjb25zdCBjbGFzc05hbWUgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04oZXh0cmFEYXRhKTtcbiAgY29uc3QgcmVhZE9ubHlBdHRyaWJ1dGVzID0gY2xhc3NOYW1lLmNvbnN0cnVjdG9yLnJlYWRPbmx5QXR0cmlidXRlc1xuICAgID8gY2xhc3NOYW1lLmNvbnN0cnVjdG9yLnJlYWRPbmx5QXR0cmlidXRlcygpXG4gICAgOiBbXTtcblxuICAvLyBGb3IgX1JvbGUgY2xhc3MsICduYW1lJyBjYW5ub3QgYmUgc2V0IGFmdGVyIHRoZSByb2xlIGhhcyBhbiBvYmplY3RJZC5cbiAgLy8gSW4gYWZ0ZXJTYXZlIGNvbnRleHQsIF9oYW5kbGVTYXZlUmVzcG9uc2UgaGFzIGFscmVhZHkgc2V0IHRoZSBvYmplY3RJZCxcbiAgLy8gc28gd2UgdHJlYXQgJ25hbWUnIGFzIHJlYWQtb25seSB0byBhdm9pZCBQYXJzZSBTREsgdmFsaWRhdGlvbiBlcnJvcnMuXG4gIGNvbnN0IGlzUm9sZUFmdGVyU2F2ZSA9IHRoaXMuY2xhc3NOYW1lID09PSAnX1JvbGUnICYmIHRoaXMucmVzcG9uc2UgJiYgIXRoaXMucXVlcnk7XG4gIGlmIChpc1JvbGVBZnRlclNhdmUgJiYgdGhpcy5kYXRhLm5hbWUgJiYgIXJlYWRPbmx5QXR0cmlidXRlcy5pbmNsdWRlcygnbmFtZScpKSB7XG4gICAgcmVhZE9ubHlBdHRyaWJ1dGVzLnB1c2goJ25hbWUnKTtcbiAgfVxuICBpZiAoIXRoaXMub3JpZ2luYWxEYXRhKSB7XG4gICAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgICBleHRyYURhdGFbYXR0cmlidXRlXSA9IHRoaXMuZGF0YVthdHRyaWJ1dGVdO1xuICAgIH1cbiAgfVxuICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoZnVuY3Rpb24gKGRhdGEsIGtleSkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgaWYgKHR5cGVvZiBkYXRhW2tleV0uX19vcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFyZWFkT25seUF0dHJpYnV0ZXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KGtleSwgZGF0YVtrZXldKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gc3ViZG9jdW1lbnQga2V5IHdpdGggZG90IG5vdGF0aW9uIHsgJ3gueSc6IHYgfSA9PiB7ICd4JzogeyAneScgOiB2IH0gfSlcbiAgICAgICAgY29uc3Qgc3BsaXR0ZWRLZXkgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgcGFyZW50UHJvcCA9IHNwbGl0dGVkS2V5WzBdO1xuICAgICAgICBsZXQgcGFyZW50VmFsID0gdXBkYXRlZE9iamVjdC5nZXQocGFyZW50UHJvcCk7XG4gICAgICAgIGlmICh0eXBlb2YgcGFyZW50VmFsICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhcmVudFZhbCA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIHBhcmVudFZhbFtzcGxpdHRlZEtleVsxXV0gPSBkYXRhW2tleV07XG4gICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KHBhcmVudFByb3AsIHBhcmVudFZhbCk7XG4gICAgICB9XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgdGhpcy5jbG9uZVdpdGhGaWxlVXJscyh0aGlzLmRhdGEpKTtcblxuICBjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplZERhdGEoKTtcbiAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgZGVsZXRlIHNhbml0aXplZFthdHRyaWJ1dGVdO1xuICB9XG4gIHVwZGF0ZWRPYmplY3Quc2V0KHNhbml0aXplZCk7XG4gIHJldHVybiB7IHVwZGF0ZWRPYmplY3QsIG9yaWdpbmFsT2JqZWN0IH07XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uIChyZXNwb25zZSwgZGF0YSkge1xuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHModGhpcy5wZW5kaW5nT3BzLmlkZW50aWZpZXIpO1xuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnBlbmRpbmdPcHMub3BlcmF0aW9ucykge1xuICAgIGlmICghcGVuZGluZ1trZXldKSB7XG4gICAgICBkYXRhW2tleV0gPSB0aGlzLm9yaWdpbmFsRGF0YSA/IHRoaXMub3JpZ2luYWxEYXRhW2tleV0gOiB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHNraXBLZXlzID0gWy4uLihyZXF1aXJlZENvbHVtbnMucmVhZFt0aGlzLmNsYXNzTmFtZV0gfHwgW10pXTtcbiAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgc2tpcEtleXMucHVzaCgnb2JqZWN0SWQnLCAnY3JlYXRlZEF0Jyk7XG4gIH0gZWxzZSB7XG4gICAgc2tpcEtleXMucHVzaCgndXBkYXRlZEF0Jyk7XG4gICAgZGVsZXRlIHJlc3BvbnNlLm9iamVjdElkO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHJlc3BvbnNlKSB7XG4gICAgaWYgKHNraXBLZXlzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCB2YWx1ZSA9IHJlc3BvbnNlW2tleV07XG4gICAgaWYgKFxuICAgICAgdmFsdWUgPT0gbnVsbCB8fFxuICAgICAgKHZhbHVlLl9fdHlwZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwoZGF0YVtrZXldLCB2YWx1ZSkgfHxcbiAgICAgIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwoKHRoaXMub3JpZ2luYWxEYXRhIHx8IHt9KVtrZXldLCB2YWx1ZSlcbiAgICApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtrZXldO1xuICAgIH1cbiAgfVxuICBpZiAoXy5pc0VtcHR5KHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyKSkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZGF0YVZhbHVlID0gZGF0YVtmaWVsZE5hbWVdO1xuXG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzcG9uc2UsIGZpZWxkTmFtZSkpIHtcbiAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgfVxuXG4gICAgaWYgKHJlc3BvbnNlW2ZpZWxkTmFtZV0gJiYgcmVzcG9uc2VbZmllbGROYW1lXS5fX29wKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2VbZmllbGROYW1lXTtcbiAgICAgIGlmIChkYXRhVmFsdWUuX19vcCA9PSAnRGVsZXRlJykge1xuICAgICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFJlc3RXcml0ZTtcbm1vZHVsZS5leHBvcnRzID0gUmVzdFdyaXRlO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFjQSxJQUFBQSxVQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxPQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxhQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxpQkFBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssTUFBQSxHQUFBTCxPQUFBO0FBQStDLFNBQUFELHVCQUFBTyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBbkIvQztBQUNBO0FBQ0E7O0FBRUEsSUFBSUcsZ0JBQWdCLEdBQUdULE9BQU8sQ0FBQyxnQ0FBZ0MsQ0FBQztBQUdoRSxNQUFNVSxJQUFJLEdBQUdWLE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDOUIsTUFBTVcsS0FBSyxHQUFHWCxPQUFPLENBQUMsU0FBUyxDQUFDO0FBQ2hDLElBQUlZLFdBQVcsR0FBR1osT0FBTyxDQUFDLGVBQWUsQ0FBQztBQUMxQyxJQUFJYSxjQUFjLEdBQUdiLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFDMUMsSUFBSWMsS0FBSyxHQUFHZCxPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ2pDLElBQUllLFFBQVEsR0FBR2YsT0FBTyxDQUFDLFlBQVksQ0FBQztBQUNwQyxNQUFNZ0IsSUFBSSxHQUFHaEIsT0FBTyxDQUFD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