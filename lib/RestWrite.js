"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _lodash = _interopRequireDefault(require("lodash"));
var _logger = _interopRequireDefault(require("./logger"));
var _SchemaController = require("./Controllers/SchemaController");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".

var SchemaController = require('./Controllers/SchemaController');
var deepcopy = require('deepcopy');
const Auth = require('./Auth');
const Utils = require('./Utils');
var cryptoUtils = require('./cryptoUtils');
var passwordCrypto = require('./password');
var Parse = require('parse/node');
var triggers = require('./triggers');
var ClientSDK = require('./ClientSDK');
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
function RestWrite(config, auth, className, query, data, originalData, clientSDK, context, action) {
  if (auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Cannot perform a write operation when using readOnlyMasterKey');
  }
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
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
  this.checkProhibitedKeywords(data);

  // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header
  this.response = null;

  // Processing this operation may mutate our data, so we operate on a
  // copy
  this.query = deepcopy(query);
  this.data = deepcopy(data);
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
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
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
    operations: _objectSpread({}, pending),
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
    this.checkProhibitedKeywords(this.data);
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
  this.config.filesController.expandFilesInObject(this.config, userData);
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

      // Add default fields
      this.data.updatedAt = this.updatedAt;
      if (!this.query) {
        this.data.createdAt = this.updatedAt;

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
  if (!this.query && !authData) {
    if (typeof this.data.username !== 'string' || _lodash.default.isEmpty(this.data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }
    if (typeof this.data.password !== 'string' || _lodash.default.isEmpty(this.data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }
  if (authData && !Object.keys(authData).length || !Object.prototype.hasOwnProperty.call(this.data, 'authData')) {
    // Nothing to validate here
    return;
  } else if (Object.prototype.hasOwnProperty.call(this.data, 'authData') && !this.data.authData) {
    // Handle saving authData to null
    throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
  }
  var providers = Object.keys(authData);
  if (providers.length > 0) {
    const canHandleAuthData = providers.some(provider => {
      var providerAuthData = authData[provider];
      var hasToken = providerAuthData && providerAuthData.id;
      return hasToken || providerAuthData === null;
    });
    if (canHandleAuthData || hasUsernameAndPassword || this.auth.isMaster || this.getUserId()) {
      return this.handleAuthData(authData);
    }
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

// Developers are allowed to change authData via before save trigger
// we need after before save to ensure that the developer
// is not currently duplicating auth data ID
RestWrite.prototype.ensureUniqueAuthDataId = async function () {
  if (this.className !== '_User' || !this.data.authData) {
    return;
  }
  const hasAuthDataId = Object.keys(this.data.authData).some(key => this.data.authData[key] && this.data.authData[key].id);
  if (!hasAuthDataId) return;
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
  const r = await Auth.findUsersWithAuthData(this.config, authData);
  const results = this.filteredObjectsByACL(r);
  if (results.length > 1) {
    // To avoid https://github.com/parse-community/parse-server/security/advisories/GHSA-8w3j-g983-8jh5
    // Let's run some validation before throwing
    await Auth.handleAuthDataValidation(authData, this, results[0]);
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
    const userId = this.getUserId();
    const userResult = results[0];
    // Prevent duplicate authData id
    if (userId && userId !== userResult.objectId) {
      throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
    }
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
        await this.runBeforeLoginTrigger(deepcopy(userResult));

        // If we are in login operation via authData
        // we need to be sure that the user has provided
        // required authData
        Auth.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, userResult.authData, this.config);
      }

      // Prevent validating if no mutated data detected on update
      if (!hasMutatedAuthData && isCurrentUserLoggedOrMaster) {
        return;
      }

      // Force to validate all provided authData on login
      // on update only validate mutated ones
      if (hasMutatedAuthData || !this.config.allowExpiredAuthDataToken) {
        const res = await Auth.handleAuthDataValidation(isLogin ? authData : mutatedAuthData, this, userResult);
        this.data.authData = res.authData;
        this.authDataResponse = res.authDataResponse;
      }

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
          await this.config.database.update(this.className, {
            objectId: this.data.objectId
          }, {
            authData: this.data.authData
          }, {});
        }
      }
    }
  }
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = function () {
  var promise = Promise.resolve();
  if (this.className !== '_User') {
    return promise;
  }
  if (!this.auth.isMaintenance && !this.auth.isMaster && 'emailVerified' in this.data) {
    const error = `Clients aren't allowed to manually update email verification.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }

  // Do not cleanup session if objectId is not set
  if (this.query && this.objectId()) {
    // If we're updating a _User object, we need to clear out the cache for that user. Find all their
    // session tokens, and remove them from the cache.
    promise = new _RestQuery.default(this.config, Auth.master(this.config), '_Session', {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    }).execute().then(results => {
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
      this.storage['sendVerificationEmail'] = true;
      this.config.userController.setEmailVerifyToken(this.data);
    }
  });
};
RestWrite.prototype._validatePasswordPolicy = function () {
  if (!this.config.passwordPolicy) return Promise.resolve();
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
      if (this.data.password.indexOf(this.data.username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
    } else {
      // retrieve the User object using objectId during password reset
      return this.config.database.find('_User', {
        objectId: this.objectId()
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }
        if (this.data.password.indexOf(results[0].username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
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
      if (user._password_history) oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory - 1);
      oldPasswords.push(user.password);
      const newPassword = this.data.password;
      // compare the new password hash with all old password hashes
      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result)
            // reject if there is a match
            return Promise.reject('REPEAT_PASSWORD');
          return Promise.resolve();
        });
      });
      // wait for all comparisons to complete
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD')
          // a match was found
          return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, `New password should not be the same as last ${this.config.passwordPolicy.maxPasswordHistory} passwords.`));
        throw err;
      });
    });
  }
  return Promise.resolve();
};
RestWrite.prototype.createSessionTokenIfNeeded = function () {
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
  if (!this.storage.authProvider &&
  // signup call, with
  this.config.preventLoginWithUnverifiedEmail &&
  // no login without verification
  this.config.verifyUserEmails) {
    // verification is on
    return; // do not create the session token in that case!
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
    this.config.userController.sendVerificationEmail(this.data);
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
    } else if (this.data.installationId) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.sessionToken) {
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
      if (key === 'objectId' || key === 'user') {
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
RestWrite.prototype.expandFilesForExistingObjects = function () {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    this.config.filesController.expandFilesInObject(this.config, this.response.response);
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
    throw new Parse.Error(Parse.Error.SESSION_MISSING, `Cannot modify user ${this.query.objectId}.`);
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
      return this.config.database.update(this.className, this.query, this.data, this.runOptions, false, false, this.validSchemaController).then(response => {
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
  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);
  this.config.database.loadSchema().then(schemaController => {
    // Notifiy LiveQueryServer if possible
    const perms = schemaController.getClassLevelPermissions(updatedObject.className);
    this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
  });

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
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
};

// Returns an updated copy of the object
RestWrite.prototype.buildParseObjects = function () {
  var _this$query;
  const extraData = {
    className: this.className,
    objectId: (_this$query = this.query) === null || _this$query === void 0 ? void 0 : _this$query.objectId
  };
  let originalObject;
  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }
  const className = Parse.Object.fromJSON(extraData);
  const readOnlyAttributes = className.constructor.readOnlyAttributes ? className.constructor.readOnlyAttributes() : [];
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
  }, deepcopy(this.data));
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
  const clientSupportsDelete = ClientSDK.supportsForwardDelete(this.clientSDK);
  this.storage.fieldsChangedByTrigger.forEach(fieldName => {
    const dataValue = data[fieldName];
    if (!Object.prototype.hasOwnProperty.call(response, fieldName)) {
      response[fieldName] = dataValue;
    }

    // Strips operations from responses
    if (response[fieldName] && response[fieldName].__op) {
      delete response[fieldName];
      if (clientSupportsDelete && dataValue.__op == 'Delete') {
        response[fieldName] = dataValue;
      }
    }
  });
  return response;
};
RestWrite.prototype.checkProhibitedKeywords = function (data) {
  if (this.config.requestKeywordDenylist) {
    // Scan request data for denied keywords
    for (const keyword of this.config.requestKeywordDenylist) {
      const match = Utils.objectContainsKeyValue(data, keyword.key, keyword.value);
      if (match) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
      }
    }
  }
};
var _default = RestWrite;
exports.default = _default;
module.exports = RestWrite;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUmVzdFF1ZXJ5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2xvZ2dlciIsIl9TY2hlbWFDb250cm9sbGVyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIlNjaGVtYUNvbnRyb2xsZXIiLCJkZWVwY29weSIsIkF1dGgiLCJVdGlscyIsImNyeXB0b1V0aWxzIiwicGFzc3dvcmRDcnlwdG8iLCJQYXJzZSIsInRyaWdnZXJzIiwiQ2xpZW50U0RLIiwidXRpbCIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJjb250ZXh0IiwiYWN0aW9uIiwiaXNSZWFkT25seSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5Iiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwicmVzcG9uc2UiLCJ1cGRhdGVkQXQiLCJfZW5jb2RlIiwiRGF0ZSIsImlzbyIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsInBlbmRpbmdPcHMiLCJvcGVyYXRpb25zIiwiaWRlbnRpZmllciIsImV4ZWN1dGUiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsImhhbmRsZUluc3RhbGxhdGlvbiIsImhhbmRsZVNlc3Npb24iLCJ2YWxpZGF0ZUF1dGhEYXRhIiwicnVuQmVmb3JlU2F2ZVRyaWdnZXIiLCJlbnN1cmVVbmlxdWVBdXRoRGF0YUlkIiwiZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQiLCJ2YWxpZGF0ZVNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJzZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkIiwidHJhbnNmb3JtVXNlciIsImV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzIiwiZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyIsInJ1bkRhdGFiYXNlT3BlcmF0aW9uIiwiY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQiLCJoYW5kbGVGb2xsb3d1cCIsInJ1bkFmdGVyU2F2ZVRyaWdnZXIiLCJjbGVhblVzZXJBdXRoRGF0YSIsImF1dGhEYXRhUmVzcG9uc2UiLCJpc01hc3RlciIsImlzTWFpbnRlbmFuY2UiLCJhY2wiLCJ1c2VyIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJjb25jYXQiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwiaW5kZXhPZiIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImhhc0NsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJtYW55IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwiaXNFcXVhbCIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJleHRyYURhdGEiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiaW5mbGF0ZSIsImdldEFsbENsYXNzZXMiLCJhbGxDbGFzc2VzIiwic2NoZW1hIiwiZmluZCIsIm9uZUNsYXNzIiwic2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkIiwiZmllbGROYW1lIiwic2V0RGVmYXVsdCIsIl9fb3AiLCJmaWVsZHMiLCJkZWZhdWx0VmFsdWUiLCJyZXF1aXJlZCIsIlZBTElEQVRJT05fRVJST1IiLCJjcmVhdGVkQXQiLCJuZXdPYmplY3RJZCIsIm9iamVjdElkU2l6ZSIsImF1dGhEYXRhIiwiaGFzVXNlcm5hbWVBbmRQYXNzd29yZCIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwicHJvdmlkZXJzIiwiY2FuSGFuZGxlQXV0aERhdGEiLCJzb21lIiwicHJvdmlkZXIiLCJwcm92aWRlckF1dGhEYXRhIiwiaGFzVG9rZW4iLCJnZXRVc2VySWQiLCJoYW5kbGVBdXRoRGF0YSIsImZpbHRlcmVkT2JqZWN0c0J5QUNMIiwib2JqZWN0cyIsIkFDTCIsImhhc0F1dGhEYXRhSWQiLCJyIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwicmVzdWx0cyIsIkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQiLCJ1c2VySWQiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsInVzZXJSZXN1bHQiLCJhdXRoUHJvdmlkZXIiLCJqb2luIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwibXV0YXRlZEF1dGhEYXRhIiwiaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyIiwiaXNMb2dpbiIsImxvY2F0aW9uIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJwcm9taXNlIiwiZXJyb3IiLCJSZXN0UXVlcnkiLCJtYXN0ZXIiLCJfX3R5cGUiLCJzZXNzaW9uIiwiY2FjaGVDb250cm9sbGVyIiwiZGVsIiwic2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJoYXNoIiwiaGFzaGVkUGFzc3dvcmQiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3ZhbGlkYXRlVXNlck5hbWUiLCJfdmFsaWRhdGVFbWFpbCIsInJhbmRvbVN0cmluZyIsInJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lIiwiJG5lIiwibGltaXQiLCJjYXNlSW5zZW5zaXRpdmUiLCJVU0VSTkFNRV9UQUtFTiIsImVtYWlsIiwibWF0Y2giLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm1haW50ZW5hbmNlIiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsIm1hcCIsImNvbXBhcmUiLCJhbGwiLCJjYXRjaCIsImVyciIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsInRva2VuIiwibmV3VG9rZW4iLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJhc3NpZ24iLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiZGV2aWNlVG9rZW4iLCJ0b0xvd2VyQ2FzZSIsImRldmljZVR5cGUiLCJpZE1hdGNoIiwib2JqZWN0SWRNYXRjaCIsImluc3RhbGxhdGlvbklkTWF0Y2giLCJkZXZpY2VUb2tlbk1hdGNoZXMiLCJvclF1ZXJpZXMiLCIkb3IiLCJkZWxRdWVyeSIsImFwcElkZW50aWZpZXIiLCJjb2RlIiwib2JqSWQiLCJyb2xlIiwiY2xlYXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiY2xlYXJDYWNoZWRSb2xlcyIsImlzVW5hdXRoZW50aWNhdGVkIiwiU0VTU0lPTl9NSVNTSU5HIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJuYW1lIiwiSU5WQUxJRF9BQ0wiLCJyZWFkIiwid3JpdGUiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJoYXNBZnRlclNhdmVIb29rIiwiYWZ0ZXJTYXZlIiwiaGFzTGl2ZVF1ZXJ5IiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJqc29uUmV0dXJuZWQiLCJfdG9GdWxsSlNPTiIsInRvSlNPTiIsImxvZ2dlciIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsIl90aGlzJHF1ZXJ5IiwiZnJvbUpTT04iLCJyZWFkT25seUF0dHJpYnV0ZXMiLCJjb25zdHJ1Y3RvciIsImF0dHJpYnV0ZSIsImluY2x1ZGVzIiwic2V0Iiwic3BsaXR0ZWRLZXkiLCJzcGxpdCIsInBhcmVudFByb3AiLCJwYXJlbnRWYWwiLCJnZXQiLCJzYW5pdGl6ZWQiLCJza2lwS2V5cyIsInJlcXVpcmVkQ29sdW1ucyIsImlzRGVlcFN0cmljdEVxdWFsIiwiY2xpZW50U3VwcG9ydHNEZWxldGUiLCJzdXBwb3J0c0ZvcndhcmREZWxldGUiLCJkYXRhVmFsdWUiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0Iiwia2V5d29yZCIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJKU09OIiwic3RyaW5naWZ5IiwiX2RlZmF1bHQiLCJleHBvcnRzIiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vc3JjL1Jlc3RXcml0ZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIFJlc3RXcml0ZSBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhbiBvcGVyYXRpb25cbi8vIHRoYXQgd3JpdGVzIHRvIHRoZSBkYXRhYmFzZS5cbi8vIFRoaXMgY291bGQgYmUgZWl0aGVyIGEgXCJjcmVhdGVcIiBvciBhbiBcInVwZGF0ZVwiLlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIGRlZXBjb3B5ID0gcmVxdWlyZSgnZGVlcGNvcHknKTtcblxuY29uc3QgQXV0aCA9IHJlcXVpcmUoJy4vQXV0aCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuL1V0aWxzJyk7XG52YXIgY3J5cHRvVXRpbHMgPSByZXF1aXJlKCcuL2NyeXB0b1V0aWxzJyk7XG52YXIgcGFzc3dvcmRDcnlwdG8gPSByZXF1aXJlKCcuL3Bhc3N3b3JkJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG52YXIgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG52YXIgQ2xpZW50U0RLID0gcmVxdWlyZSgnLi9DbGllbnRTREsnKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCB7IHJlcXVpcmVkQ29sdW1ucyB9IGZyb20gJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5cbi8vIHF1ZXJ5IGFuZCBkYXRhIGFyZSBib3RoIHByb3ZpZGVkIGluIFJFU1QgQVBJIGZvcm1hdC4gU28gZGF0YVxuLy8gdHlwZXMgYXJlIGVuY29kZWQgYnkgcGxhaW4gb2xkIG9iamVjdHMuXG4vLyBJZiBxdWVyeSBpcyBudWxsLCB0aGlzIGlzIGEgXCJjcmVhdGVcIiBhbmQgdGhlIGRhdGEgaW4gZGF0YSBzaG91bGQgYmVcbi8vIGNyZWF0ZWQuXG4vLyBPdGhlcndpc2UgdGhpcyBpcyBhbiBcInVwZGF0ZVwiIC0gdGhlIG9iamVjdCBtYXRjaGluZyB0aGUgcXVlcnlcbi8vIHNob3VsZCBnZXQgdXBkYXRlZCB3aXRoIGRhdGEuXG4vLyBSZXN0V3JpdGUgd2lsbCBoYW5kbGUgb2JqZWN0SWQsIGNyZWF0ZWRBdCwgYW5kIHVwZGF0ZWRBdCBmb3Jcbi8vIGV2ZXJ5dGhpbmcuIEl0IGFsc28ga25vd3MgdG8gdXNlIHRyaWdnZXJzIGFuZCBzcGVjaWFsIG1vZGlmaWNhdGlvbnNcbi8vIGZvciB0aGUgX1VzZXIgY2xhc3MuXG5mdW5jdGlvbiBSZXN0V3JpdGUoY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHF1ZXJ5LCBkYXRhLCBvcmlnaW5hbERhdGEsIGNsaWVudFNESywgY29udGV4dCwgYWN0aW9uKSB7XG4gIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgJ0Nhbm5vdCBwZXJmb3JtIGEgd3JpdGUgb3BlcmF0aW9uIHdoZW4gdXNpbmcgcmVhZE9ubHlNYXN0ZXJLZXknXG4gICAgKTtcbiAgfVxuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnN0b3JhZ2UgPSB7fTtcbiAgdGhpcy5ydW5PcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG5cbiAgaWYgKGFjdGlvbikge1xuICAgIHRoaXMucnVuT3B0aW9ucy5hY3Rpb24gPSBhY3Rpb247XG4gIH1cblxuICBpZiAoIXF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgJ29iamVjdElkJykgJiYgIWRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk1JU1NJTkdfT0JKRUNUX0lELFxuICAgICAgICAgICdvYmplY3RJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCBvciB1bmRlZmluZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgICAgaWYgKGRhdGEuaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdpZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdGhpcy5jaGVja1Byb2hpYml0ZWRLZXl3b3JkcyhkYXRhKTtcblxuICAvLyBXaGVuIHRoZSBvcGVyYXRpb24gaXMgY29tcGxldGUsIHRoaXMucmVzcG9uc2UgbWF5IGhhdmUgc2V2ZXJhbFxuICAvLyBmaWVsZHMuXG4gIC8vIHJlc3BvbnNlOiB0aGUgYWN0dWFsIGRhdGEgdG8gYmUgcmV0dXJuZWRcbiAgLy8gc3RhdHVzOiB0aGUgaHR0cCBzdGF0dXMgY29kZS4gaWYgbm90IHByZXNlbnQsIHRyZWF0ZWQgbGlrZSBhIDIwMFxuICAvLyBsb2NhdGlvbjogdGhlIGxvY2F0aW9uIGhlYWRlci4gaWYgbm90IHByZXNlbnQsIG5vIGxvY2F0aW9uIGhlYWRlclxuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcblxuICAvLyBQcm9jZXNzaW5nIHRoaXMgb3BlcmF0aW9uIG1heSBtdXRhdGUgb3VyIGRhdGEsIHNvIHdlIG9wZXJhdGUgb24gYVxuICAvLyBjb3B5XG4gIHRoaXMucXVlcnkgPSBkZWVwY29weShxdWVyeSk7XG4gIHRoaXMuZGF0YSA9IGRlZXBjb3B5KGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7XG4gICAgb3BlcmF0aW9uczogbnVsbCxcbiAgICBpZGVudGlmaWVyOiBudWxsLFxuICB9O1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5CZWZvcmVTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZW5zdXJlVW5pcXVlQXV0aERhdGFJZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hKCk7XG4gICAgfSlcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB0aGlzLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybVVzZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5EYXRhYmFzZU9wZXJhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlclNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jbGVhblVzZXJBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQXBwZW5kIHRoZSBhdXRoRGF0YVJlc3BvbnNlIGlmIGV4aXN0c1xuICAgICAgaWYgKHRoaXMuYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVJlc3BvbnNlID0gdGhpcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cbi8vIFVzZXMgdGhlIEF1dGggb2JqZWN0IHRvIGdldCB0aGUgbGlzdCBvZiByb2xlcywgYWRkcyB0aGUgdXNlciBpZFxuUmVzdFdyaXRlLnByb3RvdHlwZS5nZXRVc2VyQW5kUm9sZUFDTCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHRoaXMucnVuT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IHRoaXMucnVuT3B0aW9ucy5hY2wuY29uY2F0KHJvbGVzLCBbdGhpcy5hdXRoLnVzZXIuaWRdKTtcbiAgICAgIHJldHVybjtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIHNjaGVtYS5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVTY2hlbWEgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS52YWxpZGF0ZU9iamVjdChcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLmRhdGEsXG4gICAgdGhpcy5xdWVyeSxcbiAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2VcbiAgKTtcbn07XG5cbi8vIFJ1bnMgYW55IGJlZm9yZVNhdmUgdHJpZ2dlcnMgYWdhaW5zdCB0aGlzIG9wZXJhdGlvbi5cbi8vIEFueSBjaGFuZ2UgbGVhZHMgdG8gb3VyIGRhdGEgYmVpbmcgbXV0YXRlZC5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMucnVuT3B0aW9ucy5tYW55KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IGlkZW50aWZpZXIgPSB1cGRhdGVkT2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKGlkZW50aWZpZXIpO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7XG4gICAgb3BlcmF0aW9uczogeyAuLi5wZW5kaW5nIH0sXG4gICAgaWRlbnRpZmllcixcbiAgfTtcblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgY3JlYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuY3JlYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSW4gdGhlIGNhc2UgdGhhdCB0aGVyZSBpcyBubyBwZXJtaXNzaW9uIGZvciB0aGUgb3BlcmF0aW9uLCBpdCB0aHJvd3MgYW4gZXJyb3JcbiAgICAgIHJldHVybiBkYXRhYmFzZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgdGhpcy5hdXRoLFxuICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSBfLnJlZHVjZShcbiAgICAgICAgICByZXNwb25zZS5vYmplY3QsXG4gICAgICAgICAgKHJlc3VsdCwgdmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5kYXRhW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YSA9IHJlc3BvbnNlLm9iamVjdDtcbiAgICAgICAgLy8gV2Ugc2hvdWxkIGRlbGV0ZSB0aGUgb2JqZWN0SWQgZm9yIGFuIHVwZGF0ZSB3cml0ZVxuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyh0aGlzLmRhdGEpO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVMb2dpblRyaWdnZXIgPSBhc3luYyBmdW5jdGlvbiAodXNlckRhdGEpIHtcbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlTG9naW4nIHRyaWdnZXJcbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbiwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2xvdWQgY29kZSBnZXRzIGEgYml0IG9mIGV4dHJhIGRhdGEgZm9yIGl0cyBvYmplY3RzXG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuXG4gIC8vIEV4cGFuZCBmaWxlIG9iamVjdHNcbiAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHVzZXJEYXRhKTtcblxuICBjb25zdCB1c2VyID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHVzZXJEYXRhKTtcblxuICAvLyBubyBuZWVkIHRvIHJldHVybiBhIHJlc3BvbnNlXG4gIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbixcbiAgICB0aGlzLmF1dGgsXG4gICAgdXNlcixcbiAgICBudWxsLFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuY29udGV4dFxuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5kYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKS50aGVuKGFsbENsYXNzZXMgPT4ge1xuICAgICAgY29uc3Qgc2NoZW1hID0gYWxsQ2xhc3Nlcy5maW5kKG9uZUNsYXNzID0+IG9uZUNsYXNzLmNsYXNzTmFtZSA9PT0gdGhpcy5jbGFzc05hbWUpO1xuICAgICAgY29uc3Qgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkID0gKGZpZWxkTmFtZSwgc2V0RGVmYXVsdCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSBudWxsIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICcnIHx8XG4gICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHNldERlZmF1bHQgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgICAodGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5yZXF1aXJlZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGAke2ZpZWxkTmFtZX0gaXMgcmVxdWlyZWRgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBkZWZhdWx0IGZpZWxkc1xuICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcblxuICAgICAgICAvLyBPbmx5IGFzc2lnbiBuZXcgb2JqZWN0SWQgaWYgd2UgYXJlIGNyZWF0aW5nIG5ldyBvYmplY3RcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSBjcnlwdG9VdGlscy5uZXdPYmplY3RJZCh0aGlzLmNvbmZpZy5vYmplY3RJZFNpemUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCB0cnVlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzY2hlbWEpIHtcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG4vLyBUcmFuc2Zvcm1zIGF1dGggZGF0YSBmb3IgYSB1c2VyIG9iamVjdC5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGEgdXNlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGF1dGhEYXRhID0gdGhpcy5kYXRhLmF1dGhEYXRhO1xuICBjb25zdCBoYXNVc2VybmFtZUFuZFBhc3N3b3JkID1cbiAgICB0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkID09PSAnc3RyaW5nJztcblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIWF1dGhEYXRhKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEudXNlcm5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ2JhZCBvciBtaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnBhc3N3b3JkKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAoYXV0aERhdGEgJiYgIU9iamVjdC5rZXlzKGF1dGhEYXRhKS5sZW5ndGgpIHx8XG4gICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpXG4gICkge1xuICAgIC8vIE5vdGhpbmcgdG8gdmFsaWRhdGUgaGVyZVxuICAgIHJldHVybjtcbiAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgLy8gSGFuZGxlIHNhdmluZyBhdXRoRGF0YSB0byBudWxsXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgKTtcbiAgfVxuXG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gaGFzVG9rZW4gfHwgcHJvdmlkZXJBdXRoRGF0YSA9PT0gbnVsbDtcbiAgICB9KTtcbiAgICBpZiAoY2FuSGFuZGxlQXV0aERhdGEgfHwgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCB8fCB0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5nZXRVc2VySWQoKSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uIChvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlcklkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC51c2VyLmlkO1xuICB9XG59O1xuXG4vLyBEZXZlbG9wZXJzIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSBhdXRoRGF0YSB2aWEgYmVmb3JlIHNhdmUgdHJpZ2dlclxuLy8gd2UgbmVlZCBhZnRlciBiZWZvcmUgc2F2ZSB0byBlbnN1cmUgdGhhdCB0aGUgZGV2ZWxvcGVyXG4vLyBpcyBub3QgY3VycmVudGx5IGR1cGxpY2F0aW5nIGF1dGggZGF0YSBJRFxuUmVzdFdyaXRlLnByb3RvdHlwZS5lbnN1cmVVbmlxdWVBdXRoRGF0YUlkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGhhc0F1dGhEYXRhSWQgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLnNvbWUoXG4gICAga2V5ID0+IHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldICYmIHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldLmlkXG4gICk7XG5cbiAgaWYgKCFoYXNBdXRoRGF0YUlkKSByZXR1cm47XG5cbiAgY29uc3QgciA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHRoaXMuY29uZmlnLCB0aGlzLmRhdGEuYXV0aERhdGEpO1xuICBjb25zdCByZXN1bHRzID0gdGhpcy5maWx0ZXJlZE9iamVjdHNCeUFDTChyKTtcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG4gIC8vIHVzZSBkYXRhLm9iamVjdElkIGluIGNhc2Ugb2YgbG9naW4gdGltZSBhbmQgZm91bmQgdXNlciBkdXJpbmcgaGFuZGxlIHZhbGlkYXRlQXV0aERhdGFcbiAgY29uc3QgdXNlcklkID0gdGhpcy5nZXRVc2VySWQoKSB8fCB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMSAmJiB1c2VySWQgIT09IHJlc3VsdHNbMF0ub2JqZWN0SWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YSA9IGFzeW5jIGZ1bmN0aW9uIChhdXRoRGF0YSkge1xuICBjb25zdCByID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEodGhpcy5jb25maWcsIGF1dGhEYXRhKTtcbiAgY29uc3QgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgIC8vIFRvIGF2b2lkIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL3NlY3VyaXR5L2Fkdmlzb3JpZXMvR0hTQS04dzNqLWc5ODMtOGpoNVxuICAgIC8vIExldCdzIHJ1biBzb21lIHZhbGlkYXRpb24gYmVmb3JlIHRocm93aW5nXG4gICAgYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oYXV0aERhdGEsIHRoaXMsIHJlc3VsdHNbMF0pO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG5cbiAgLy8gTm8gdXNlciBmb3VuZCB3aXRoIHByb3ZpZGVkIGF1dGhEYXRhIHdlIG5lZWQgdG8gdmFsaWRhdGVcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIGNvbnN0IHsgYXV0aERhdGE6IHZhbGlkYXRlZEF1dGhEYXRhLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgIGF1dGhEYXRhLFxuICAgICAgdGhpc1xuICAgICk7XG4gICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICAvLyBSZXBsYWNlIGN1cnJlbnQgYXV0aERhdGEgYnkgdGhlIG5ldyB2YWxpZGF0ZWQgb25lXG4gICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVXNlciBmb3VuZCB3aXRoIHByb3ZpZGVkIGF1dGhEYXRhXG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IHVzZXJJZCA9IHRoaXMuZ2V0VXNlcklkKCk7XG4gICAgY29uc3QgdXNlclJlc3VsdCA9IHJlc3VsdHNbMF07XG4gICAgLy8gUHJldmVudCBkdXBsaWNhdGUgYXV0aERhdGEgaWRcbiAgICBpZiAodXNlcklkICYmIHVzZXJJZCAhPT0gdXNlclJlc3VsdC5vYmplY3RJZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gICAgfVxuXG4gICAgdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5qb2luKCcsJyk7XG5cbiAgICBjb25zdCB7IGhhc011dGF0ZWRBdXRoRGF0YSwgbXV0YXRlZEF1dGhEYXRhIH0gPSBBdXRoLmhhc011dGF0ZWRBdXRoRGF0YShcbiAgICAgIGF1dGhEYXRhLFxuICAgICAgdXNlclJlc3VsdC5hdXRoRGF0YVxuICAgICk7XG5cbiAgICBjb25zdCBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIgPVxuICAgICAgKHRoaXMuYXV0aCAmJiB0aGlzLmF1dGgudXNlciAmJiB0aGlzLmF1dGgudXNlci5pZCA9PT0gdXNlclJlc3VsdC5vYmplY3RJZCkgfHxcbiAgICAgIHRoaXMuYXV0aC5pc01hc3RlcjtcblxuICAgIGNvbnN0IGlzTG9naW4gPSAhdXNlcklkO1xuXG4gICAgaWYgKGlzTG9naW4gfHwgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyKSB7XG4gICAgICAvLyBubyB1c2VyIG1ha2luZyB0aGUgY2FsbFxuICAgICAgLy8gT1IgdGhlIHVzZXIgbWFraW5nIHRoZSBjYWxsIGlzIHRoZSByaWdodCBvbmVcbiAgICAgIC8vIExvZ2luIHdpdGggYXV0aCBkYXRhXG4gICAgICBkZWxldGUgcmVzdWx0c1swXS5wYXNzd29yZDtcblxuICAgICAgLy8gbmVlZCB0byBzZXQgdGhlIG9iamVjdElkIGZpcnN0IG90aGVyd2lzZSBsb2NhdGlvbiBoYXMgdHJhaWxpbmcgdW5kZWZpbmVkXG4gICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSB1c2VyUmVzdWx0Lm9iamVjdElkO1xuXG4gICAgICBpZiAoIXRoaXMucXVlcnkgfHwgIXRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICByZXNwb25zZTogdXNlclJlc3VsdCxcbiAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBSdW4gYmVmb3JlTG9naW4gaG9vayBiZWZvcmUgc3RvcmluZyBhbnkgdXBkYXRlc1xuICAgICAgICAvLyB0byBhdXRoRGF0YSBvbiB0aGUgZGI7IGNoYW5nZXMgdG8gdXNlclJlc3VsdFxuICAgICAgICAvLyB3aWxsIGJlIGlnbm9yZWQuXG4gICAgICAgIGF3YWl0IHRoaXMucnVuQmVmb3JlTG9naW5UcmlnZ2VyKGRlZXBjb3B5KHVzZXJSZXN1bHQpKTtcblxuICAgICAgICAvLyBJZiB3ZSBhcmUgaW4gbG9naW4gb3BlcmF0aW9uIHZpYSBhdXRoRGF0YVxuICAgICAgICAvLyB3ZSBuZWVkIHRvIGJlIHN1cmUgdGhhdCB0aGUgdXNlciBoYXMgcHJvdmlkZWRcbiAgICAgICAgLy8gcmVxdWlyZWQgYXV0aERhdGFcbiAgICAgICAgQXV0aC5jaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luKFxuICAgICAgICAgIGF1dGhEYXRhLFxuICAgICAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGEsXG4gICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gUHJldmVudCB2YWxpZGF0aW5nIGlmIG5vIG11dGF0ZWQgZGF0YSBkZXRlY3RlZCBvbiB1cGRhdGVcbiAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhICYmIGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3Rlcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIEZvcmNlIHRvIHZhbGlkYXRlIGFsbCBwcm92aWRlZCBhdXRoRGF0YSBvbiBsb2dpblxuICAgICAgLy8gb24gdXBkYXRlIG9ubHkgdmFsaWRhdGUgbXV0YXRlZCBvbmVzXG4gICAgICBpZiAoaGFzTXV0YXRlZEF1dGhEYXRhIHx8ICF0aGlzLmNvbmZpZy5hbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgICAgIGlzTG9naW4gPyBhdXRoRGF0YSA6IG11dGF0ZWRBdXRoRGF0YSxcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgIHVzZXJSZXN1bHRcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgICAgICB0aGlzLmF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIH1cblxuICAgICAgLy8gSUYgd2UgYXJlIGluIGxvZ2luIHdlJ2xsIHNraXAgdGhlIGRhdGFiYXNlIG9wZXJhdGlvbiAvIGJlZm9yZVNhdmUgLyBhZnRlclNhdmUgZXRjLi4uXG4gICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgIC8vIFdlIGFyZSBzdXBwb3NlZCB0byBoYXZlIGEgcmVzcG9uc2Ugb25seSBvbiBMT0dJTiB3aXRoIGF1dGhEYXRhLCBzbyB3ZSBza2lwIHRob3NlXG4gICAgICAvLyBJZiB3ZSdyZSBub3QgbG9nZ2luZyBpbiwgYnV0IGp1c3QgdXBkYXRpbmcgdGhlIGN1cnJlbnQgdXNlciwgd2UgY2FuIHNhZmVseSBza2lwIHRoYXQgcGFydFxuICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgLy8gQXNzaWduIHRoZSBuZXcgYXV0aERhdGEgaW4gdGhlIHJlc3BvbnNlXG4gICAgICAgIE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPSBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3Rlcicgb25seSBpZiBhdXRoRGF0YSBjb250YWlucyBzb21lIGtleXNcbiAgICAgICAgLy8gYXV0aERhdGEgY291bGQgbm90IGNvbnRhaW5zIGtleXMgYWZ0ZXIgdmFsaWRhdGlvbiBpZiB0aGUgYXV0aEFkYXB0ZXJcbiAgICAgICAgLy8gdXNlcyB0aGUgYGRvTm90U2F2ZWAgb3B0aW9uLiBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH0sXG4gICAgICAgICAgICB7IGF1dGhEYXRhOiB0aGlzLmRhdGEuYXV0aERhdGEgfSxcbiAgICAgICAgICAgIHt9XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGguaXNNYWludGVuYW5jZSAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICdlbWFpbFZlcmlmaWVkJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBlcnJvciA9IGBDbGllbnRzIGFyZW4ndCBhbGxvd2VkIHRvIG1hbnVhbGx5IHVwZGF0ZSBlbWFpbCB2ZXJpZmljYXRpb24uYDtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgZXJyb3IpO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIHByb21pc2UgPSBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICAgIC5leGVjdXRlKClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLnJlc3VsdHMuZm9yRWFjaChzZXNzaW9uID0+XG4gICAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gIH1cblxuICByZXR1cm4gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIFRyYW5zZm9ybSB0aGUgcGFzc3dvcmRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBpZ25vcmUgb25seSBpZiB1bmRlZmluZWQuIHNob3VsZCBwcm9jZWVkIGlmIGVtcHR5ICgnJylcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSA9IHRydWU7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbmV3IHNlc3Npb24gb25seSBpZiB0aGUgdXNlciByZXF1ZXN0ZWRcbiAgICAgICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgICAgICAgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3koKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmhhc2godGhpcy5kYXRhLnBhc3N3b3JkKS50aGVuKGhhc2hlZFBhc3N3b3JkID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCA9IGhhc2hlZFBhc3N3b3JkO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVVc2VyTmFtZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlRW1haWwoKTtcbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlVXNlck5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIGZvciB1c2VybmFtZSB1bmlxdWVuZXNzXG4gIGlmICghdGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICB0aGlzLmRhdGEudXNlcm5hbWUgPSBjcnlwdG9VdGlscy5yYW5kb21TdHJpbmcoMjUpO1xuICAgICAgdGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvKlxuICAgIFVzZXJuYW1lcyBzaG91bGQgYmUgdW5pcXVlIHdoZW4gY29tcGFyZWQgY2FzZSBpbnNlbnNpdGl2ZWx5XG5cbiAgICBVc2VycyBzaG91bGQgYmUgYWJsZSB0byBtYWtlIGNhc2Ugc2Vuc2l0aXZlIHVzZXJuYW1lcyBhbmRcbiAgICBsb2dpbiB1c2luZyB0aGUgY2FzZSB0aGV5IGVudGVyZWQuICBJLmUuICdTbm9vcHknIHNob3VsZCBwcmVjbHVkZVxuICAgICdzbm9vcHknIGFzIGEgdmFsaWQgdXNlcm5hbWUuXG4gICovXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH0pO1xufTtcblxuLypcbiAgQXMgd2l0aCB1c2VybmFtZXMsIFBhcnNlIHNob3VsZCBub3QgYWxsb3cgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIG9mIGVtYWlsLlxuICB1bmxpa2Ugd2l0aCB1c2VybmFtZXMgKHdoaWNoIGNhbiBoYXZlIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBpbiB0aGUgY2FzZSBvZlxuICBhdXRoIGFkYXB0ZXJzKSwgZW1haWxzIHNob3VsZCBuZXZlciBoYXZlIGEgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb24uXG5cbiAgVGhpcyBiZWhhdmlvciBjYW4gYmUgZW5mb3JjZWQgdGhyb3VnaCBhIHByb3Blcmx5IGNvbmZpZ3VyZWQgaW5kZXggc2VlOlxuICBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtY2FzZS1pbnNlbnNpdGl2ZS8jY3JlYXRlLWEtY2FzZS1pbnNlbnNpdGl2ZS1pbmRleFxuICB3aGljaCBjb3VsZCBiZSBpbXBsZW1lbnRlZCBpbnN0ZWFkIG9mIHRoaXMgY29kZSBiYXNlZCB2YWxpZGF0aW9uLlxuXG4gIEdpdmVuIHRoYXQgdGhpcyBsb29rdXAgc2hvdWxkIGJlIGEgcmVsYXRpdmVseSBsb3cgdXNlIGNhc2UgYW5kIHRoYXQgdGhlIGNhc2Ugc2Vuc2l0aXZlXG4gIHVuaXF1ZSBpbmRleCB3aWxsIGJlIHVzZWQgYnkgdGhlIGRiIGZvciB0aGUgcXVlcnksIHRoaXMgaXMgYW4gYWRlcXVhdGUgc29sdXRpb24uXG4qL1xuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVFbWFpbCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwgfHwgdGhpcy5kYXRhLmVtYWlsLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFZhbGlkYXRlIGJhc2ljIGVtYWlsIGFkZHJlc3MgZm9ybWF0XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsLm1hdGNoKC9eLitALiskLykpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLCAnRW1haWwgYWRkcmVzcyBmb3JtYXQgaXMgaW52YWxpZC4nKVxuICAgICk7XG4gIH1cbiAgLy8gQ2FzZSBpbnNlbnNpdGl2ZSBtYXRjaCwgc2VlIG5vdGUgYWJvdmUgZnVuY3Rpb24uXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLmRhdGEuYXV0aERhdGEgfHxcbiAgICAgICAgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoIHx8XG4gICAgICAgIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCA9PT0gMSAmJlxuICAgICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSlbMF0gPT09ICdhbm9ueW1vdXMnKVxuICAgICAgKSB7XG4gICAgICAgIC8vIFdlIHVwZGF0ZWQgdGhlIGVtYWlsLCBzZW5kIGEgbmV3IHZhbGlkYXRpb25cbiAgICAgICAgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSA9IHRydWU7XG4gICAgICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNldEVtYWlsVmVyaWZ5VG9rZW4odGhpcy5kYXRhKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kpIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMoKS50aGVuKCgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkoKTtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayBpZiB0aGUgcGFzc3dvcmQgY29uZm9ybXMgdG8gdGhlIGRlZmluZWQgcGFzc3dvcmQgcG9saWN5IGlmIGNvbmZpZ3VyZWRcbiAgLy8gSWYgd2Ugc3BlY2lmaWVkIGEgY3VzdG9tIGVycm9yIGluIG91ciBjb25maWd1cmF0aW9uIHVzZSBpdC5cbiAgLy8gRXhhbXBsZTogXCJQYXNzd29yZHMgbXVzdCBpbmNsdWRlIGEgQ2FwaXRhbCBMZXR0ZXIsIExvd2VyY2FzZSBMZXR0ZXIsIGFuZCBhIG51bWJlci5cIlxuICAvL1xuICAvLyBUaGlzIGlzIGVzcGVjaWFsbHkgdXNlZnVsIG9uIHRoZSBnZW5lcmljIFwicGFzc3dvcmQgcmVzZXRcIiBwYWdlLFxuICAvLyBhcyBpdCBhbGxvd3MgdGhlIHByb2dyYW1tZXIgdG8gY29tbXVuaWNhdGUgc3BlY2lmaWMgcmVxdWlyZW1lbnRzIGluc3RlYWQgb2Y6XG4gIC8vIGEuIG1ha2luZyB0aGUgdXNlciBndWVzcyB3aGF0cyB3cm9uZ1xuICAvLyBiLiBtYWtpbmcgYSBjdXN0b20gcGFzc3dvcmQgcmVzZXQgcGFnZSB0aGF0IHNob3dzIHRoZSByZXF1aXJlbWVudHNcbiAgY29uc3QgcG9saWN5RXJyb3IgPSB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA/IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgIDogJ1Bhc3N3b3JkIGRvZXMgbm90IG1lZXQgdGhlIFBhc3N3b3JkIFBvbGljeSByZXF1aXJlbWVudHMuJztcbiAgY29uc3QgY29udGFpbnNVc2VybmFtZUVycm9yID0gJ1Bhc3N3b3JkIGNhbm5vdCBjb250YWluIHlvdXIgdXNlcm5hbWUuJztcblxuICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBtZWV0cyB0aGUgcGFzc3dvcmQgc3RyZW5ndGggcmVxdWlyZW1lbnRzXG4gIGlmIChcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IodGhpcy5kYXRhLnBhc3N3b3JkKSkgfHxcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayh0aGlzLmRhdGEucGFzc3dvcmQpKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIHBvbGljeUVycm9yKSk7XG4gIH1cblxuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGNvbnRhaW4gdXNlcm5hbWVcbiAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSA9PT0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICAgIC8vIHVzZXJuYW1lIGlzIG5vdCBwYXNzZWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YodGhpcy5kYXRhLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcikpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyByZXRyaWV2ZSB0aGUgVXNlciBvYmplY3QgdXNpbmcgb2JqZWN0SWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHJlc3VsdHNbMF0udXNlcm5hbWUpID49IDApXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcilcbiAgICAgICAgICApO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgaXMgcmVwZWF0aW5nIGZyb20gc3BlY2lmaWVkIGhpc3RvcnlcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSlcbiAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMVxuICAgICAgICAgICk7XG4gICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICBjb25zdCBuZXdQYXNzd29yZCA9IHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgLy8gY29tcGFyZSB0aGUgbmV3IHBhc3N3b3JkIGhhc2ggd2l0aCBhbGwgb2xkIHBhc3N3b3JkIGhhc2hlc1xuICAgICAgICBjb25zdCBwcm9taXNlcyA9IG9sZFBhc3N3b3Jkcy5tYXAoZnVuY3Rpb24gKGhhc2gpIHtcbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShuZXdQYXNzd29yZCwgaGFzaCkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdClcbiAgICAgICAgICAgICAgLy8gcmVqZWN0IGlmIHRoZXJlIGlzIGEgbWF0Y2hcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KCdSRVBFQVRfUEFTU1dPUkQnKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHdhaXQgZm9yIGFsbCBjb21wYXJpc29ucyB0byBjb21wbGV0ZVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyID09PSAnUkVQRUFUX1BBU1NXT1JEJylcbiAgICAgICAgICAgICAgLy8gYSBtYXRjaCB3YXMgZm91bmRcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgICBgTmV3IHBhc3N3b3JkIHNob3VsZCBub3QgYmUgdGhlIHNhbWUgYXMgbGFzdCAke3RoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeX0gcGFzc3dvcmRzLmBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChcbiAgICAhdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciAmJiAvLyBzaWdudXAgY2FsbCwgd2l0aFxuICAgIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiYgLy8gbm8gbG9naW4gd2l0aG91dCB2ZXJpZmljYXRpb25cbiAgICB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzXG4gICkge1xuICAgIC8vIHZlcmlmaWNhdGlvbiBpcyBvblxuICAgIHJldHVybjsgLy8gZG8gbm90IGNyZWF0ZSB0aGUgc2Vzc2lvbiB0b2tlbiBpbiB0aGF0IGNhc2UhXG4gIH1cbiAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy8gY2xvdWQgaW5zdGFsbGF0aW9uSWQgZnJvbSBDbG91ZCBDb2RlLFxuICAvLyBuZXZlciBjcmVhdGUgc2Vzc2lvbiB0b2tlbnMgZnJvbSB0aGVyZS5cbiAgaWYgKHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCAmJiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgPT09ICdjbG91ZCcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9PSBudWxsICYmIHRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmpvaW4oJywnKTtcbiAgfVxuXG4gIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHRoaXMuY29uZmlnLCB7XG4gICAgdXNlcklkOiB0aGlzLm9iamVjdElkKCksXG4gICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgIGFjdGlvbjogdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA/ICdsb2dpbicgOiAnc2lnbnVwJyxcbiAgICAgIGF1dGhQcm92aWRlcjogdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciB8fCAncGFzc3dvcmQnLFxuICAgIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgfSk7XG5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2Uuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKTtcbn07XG5cblJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uID0gZnVuY3Rpb24gKFxuICBjb25maWcsXG4gIHsgdXNlcklkLCBjcmVhdGVkV2l0aCwgaW5zdGFsbGF0aW9uSWQsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSB9XG4pIHtcbiAgY29uc3QgdG9rZW4gPSAncjonICsgY3J5cHRvVXRpbHMubmV3VG9rZW4oKTtcbiAgY29uc3QgZXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCgpO1xuICBjb25zdCBzZXNzaW9uRGF0YSA9IHtcbiAgICBzZXNzaW9uVG9rZW46IHRva2VuLFxuICAgIHVzZXI6IHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICB9LFxuICAgIGNyZWF0ZWRXaXRoLFxuICAgIGV4cGlyZXNBdDogUGFyc2UuX2VuY29kZShleHBpcmVzQXQpLFxuICB9O1xuXG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIHNlc3Npb25EYXRhLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIH1cblxuICBPYmplY3QuYXNzaWduKHNlc3Npb25EYXRhLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEpO1xuXG4gIHJldHVybiB7XG4gICAgc2Vzc2lvbkRhdGEsXG4gICAgY3JlYXRlU2Vzc2lvbjogKCkgPT5cbiAgICAgIG5ldyBSZXN0V3JpdGUoY29uZmlnLCBBdXRoLm1hc3Rlcihjb25maWcpLCAnX1Nlc3Npb24nLCBudWxsLCBzZXNzaW9uRGF0YSkuZXhlY3V0ZSgpLFxuICB9O1xufTtcblxuLy8gRGVsZXRlIGVtYWlsIHJlc2V0IHRva2VucyBpZiB1c2VyIGlzIGNoYW5naW5nIHBhc3N3b3JkIG9yIGVtYWlsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5kZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IHRoaXMucXVlcnkgPT09IG51bGwpIHtcbiAgICAvLyBudWxsIHF1ZXJ5IG1lYW5zIGNyZWF0ZVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICgncGFzc3dvcmQnIGluIHRoaXMuZGF0YSB8fCAnZW1haWwnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGFkZE9wcyA9IHtcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgICBfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0OiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcbiAgICB0aGlzLmRhdGEgPSBPYmplY3QuYXNzaWduKHRoaXMuZGF0YSwgYWRkT3BzKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zID0gZnVuY3Rpb24gKCkge1xuICAvLyBPbmx5IGZvciBfU2Vzc2lvbiwgYW5kIGF0IGNyZWF0aW9uIHRpbWVcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9ICdfU2Vzc2lvbicgfHwgdGhpcy5xdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEZXN0cm95IHRoZSBzZXNzaW9ucyBpbiAnQmFja2dyb3VuZCdcbiAgY29uc3QgeyB1c2VyLCBpbnN0YWxsYXRpb25JZCwgc2Vzc2lvblRva2VuIH0gPSB0aGlzLmRhdGE7XG4gIGlmICghdXNlciB8fCAhaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF1c2VyLm9iamVjdElkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koXG4gICAgJ19TZXNzaW9uJyxcbiAgICB7XG4gICAgICB1c2VyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBzZXNzaW9uVG9rZW46IHsgJG5lOiBzZXNzaW9uVG9rZW4gfSxcbiAgICB9LFxuICAgIHt9LFxuICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICk7XG59O1xuXG4vLyBIYW5kbGVzIGFueSBmb2xsb3d1cCBsb2dpY1xuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVGb2xsb3d1cCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSAmJiB0aGlzLmNvbmZpZy5yZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0KSB7XG4gICAgdmFyIHNlc3Npb25RdWVyeSA9IHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ107XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZGVzdHJveSgnX1Nlc3Npb24nLCBzZXNzaW9uUXVlcnkpXG4gICAgICAudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ107XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCkudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ107XG4gICAgLy8gRmlyZSBhbmQgZm9yZ2V0IVxuICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh0aGlzLmRhdGEpO1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcyk7XG4gIH1cbn07XG5cbi8vIEhhbmRsZXMgdGhlIF9TZXNzaW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gX1Nlc3Npb24gb2JqZWN0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVTZXNzaW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiByZXF1aXJlZC4nKTtcbiAgfVxuXG4gIC8vIFRPRE86IFZlcmlmeSBwcm9wZXIgZXJyb3IgdG8gdGhyb3dcbiAgaWYgKHRoaXMuZGF0YS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ0Nhbm5vdCBzZXQgJyArICdBQ0wgb24gYSBTZXNzaW9uLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiB0aGlzLmRhdGEudXNlci5vYmplY3RJZCAhPSB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0ge1xuICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgY29uc3QgYWRkaXRpb25hbFNlc3Npb25EYXRhID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMuZGF0YSkge1xuICAgICAgaWYgKGtleSA9PT0gJ29iamVjdElkJyB8fCBrZXkgPT09ICd1c2VyJykge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YVtrZXldID0gdGhpcy5kYXRhW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdjcmVhdGUnLFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSxcbiAgICB9KTtcblxuICAgIHJldHVybiBjcmVhdGVTZXNzaW9uKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5yZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRXJyb3IgY3JlYXRpbmcgc2Vzc2lvbi4nKTtcbiAgICAgIH1cbiAgICAgIHNlc3Npb25EYXRhWydvYmplY3RJZCddID0gcmVzdWx0cy5yZXNwb25zZVsnb2JqZWN0SWQnXTtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICBsb2NhdGlvbjogcmVzdWx0cy5sb2NhdGlvbixcbiAgICAgICAgcmVzcG9uc2U6IHNlc3Npb25EYXRhLFxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX0luc3RhbGxhdGlvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIGluc3RhbGxhdGlvbiBvYmplY3QuXG4vLyBJZiBhbiBpbnN0YWxsYXRpb24gaXMgZm91bmQsIHRoaXMgY2FuIG11dGF0ZSB0aGlzLnF1ZXJ5IGFuZCB0dXJuIGEgY3JlYXRlXG4vLyBpbnRvIGFuIHVwZGF0ZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlSW5zdGFsbGF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19JbnN0YWxsYXRpb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKFxuICAgICF0aGlzLnF1ZXJ5ICYmXG4gICAgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAhdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIDEzNSxcbiAgICAgICdhdCBsZWFzdCBvbmUgSUQgZmllbGQgKGRldmljZVRva2VuLCBpbnN0YWxsYXRpb25JZCkgJyArICdtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbidcbiAgICApO1xuICB9XG5cbiAgLy8gSWYgdGhlIGRldmljZSB0b2tlbiBpcyA2NCBjaGFyYWN0ZXJzIGxvbmcsIHdlIGFzc3VtZSBpdCBpcyBmb3IgaU9TXG4gIC8vIGFuZCBsb3dlcmNhc2UgaXQuXG4gIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgdGhpcy5kYXRhLmRldmljZVRva2VuLmxlbmd0aCA9PSA2NCkge1xuICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiA9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbi50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gV2UgbG93ZXJjYXNlIHRoZSBpbnN0YWxsYXRpb25JZCBpZiBwcmVzZW50XG4gIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIGxldCBpbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZDtcblxuICAvLyBJZiBkYXRhLmluc3RhbGxhdGlvbklkIGlzIG5vdCBzZXQgYW5kIHdlJ3JlIG5vdCBtYXN0ZXIsIHdlIGNhbiBsb29rdXAgaW4gYXV0aFxuICBpZiAoIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBVcGRhdGluZyBfSW5zdGFsbGF0aW9uIGJ1dCBub3QgdXBkYXRpbmcgYW55dGhpbmcgY3JpdGljYWxcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiAhaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuZGF0YS5kZXZpY2VUeXBlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICB2YXIgaWRNYXRjaDsgLy8gV2lsbCBiZSBhIG1hdGNoIG9uIGVpdGhlciBvYmplY3RJZCBvciBpbnN0YWxsYXRpb25JZFxuICB2YXIgb2JqZWN0SWRNYXRjaDtcbiAgdmFyIGluc3RhbGxhdGlvbklkTWF0Y2g7XG4gIHZhciBkZXZpY2VUb2tlbk1hdGNoZXMgPSBbXTtcblxuICAvLyBJbnN0ZWFkIG9mIGlzc3VpbmcgMyByZWFkcywgbGV0J3MgZG8gaXQgd2l0aCBvbmUgT1IuXG4gIGNvbnN0IG9yUXVlcmllcyA9IFtdO1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goe1xuICAgICAgb2JqZWN0SWQ6IHRoaXMucXVlcnkub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goe1xuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuICB9XG4gIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7IGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gfSk7XG4gIH1cblxuICBpZiAob3JRdWVyaWVzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJvbWlzZSA9IHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgJ19JbnN0YWxsYXRpb24nLFxuICAgICAgICB7XG4gICAgICAgICAgJG9yOiBvclF1ZXJpZXMsXG4gICAgICAgIH0sXG4gICAgICAgIHt9XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiByZXN1bHQub2JqZWN0SWQgPT0gdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIG9iamVjdElkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5pbnN0YWxsYXRpb25JZCA9PSBpbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIGluc3RhbGxhdGlvbklkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5kZXZpY2VUb2tlbiA9PSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gU2FuaXR5IGNoZWNrcyB3aGVuIHJ1bm5pbmcgYSBxdWVyeVxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAoIW9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQgZm9yIHVwZGF0ZS4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAhPT0gb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnaW5zdGFsbGF0aW9uSWQgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICAhb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnZGV2aWNlVG9rZW4gbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVR5cGVcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVR5cGUgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIG9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IG9iamVjdElkTWF0Y2g7XG4gICAgICB9XG5cbiAgICAgIGlmIChpbnN0YWxsYXRpb25JZCAmJiBpbnN0YWxsYXRpb25JZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gbmVlZCB0byBzcGVjaWZ5IGRldmljZVR5cGUgb25seSBpZiBpdCdzIG5ld1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJiAhaWRNYXRjaCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM1LCAnZGV2aWNlVHlwZSBtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbicpO1xuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKCFpZE1hdGNoKSB7XG4gICAgICAgIGlmICghZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiZcbiAgICAgICAgICAoIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSB8fCAhaW5zdGFsbGF0aW9uSWQpXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIFNpbmdsZSBtYXRjaCBvbiBkZXZpY2UgdG9rZW4gYnV0IG5vbmUgb24gaW5zdGFsbGF0aW9uSWQsIGFuZCBlaXRoZXJcbiAgICAgICAgICAvLyB0aGUgcGFzc2VkIG9iamVjdCBvciB0aGUgbWF0Y2ggaXMgbWlzc2luZyBhbiBpbnN0YWxsYXRpb25JZCwgc28gd2VcbiAgICAgICAgICAvLyBjYW4ganVzdCByZXR1cm4gdGhlIG1hdGNoLlxuICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIDEzMixcbiAgICAgICAgICAgICdNdXN0IHNwZWNpZnkgaW5zdGFsbGF0aW9uSWQgd2hlbiBkZXZpY2VUb2tlbiAnICtcbiAgICAgICAgICAgICAgJ21hdGNoZXMgbXVsdGlwbGUgSW5zdGFsbGF0aW9uIG9iamVjdHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBNdWx0aXBsZSBkZXZpY2UgdG9rZW4gbWF0Y2hlcyBhbmQgd2Ugc3BlY2lmaWVkIGFuIGluc3RhbGxhdGlvbiBJRCxcbiAgICAgICAgICAvLyBvciBhIHNpbmdsZSBtYXRjaCB3aGVyZSBib3RoIHRoZSBwYXNzZWQgYW5kIG1hdGNoaW5nIG9iamVjdHMgaGF2ZVxuICAgICAgICAgIC8vIGFuIGluc3RhbGxhdGlvbiBJRC4gVHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoXG4gICAgICAgICAgLy8gdGhlIGRldmljZVRva2VuLCBhbmQgcmV0dXJuIG5pbCB0byBzaWduYWwgdGhhdCBhIG5ldyBvYmplY3Qgc2hvdWxkXG4gICAgICAgICAgLy8gYmUgY3JlYXRlZC5cbiAgICAgICAgICB2YXIgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHtcbiAgICAgICAgICAgICAgJG5lOiBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmICFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10pIHtcbiAgICAgICAgICAvLyBFeGFjdGx5IG9uZSBkZXZpY2UgdG9rZW4gbWF0Y2ggYW5kIGl0IGRvZXNuJ3QgaGF2ZSBhbiBpbnN0YWxsYXRpb25cbiAgICAgICAgICAvLyBJRC4gVGhpcyBpcyB0aGUgb25lIGNhc2Ugd2hlcmUgd2Ugd2FudCB0byBtZXJnZSB3aXRoIHRoZSBleGlzdGluZ1xuICAgICAgICAgIC8vIG9iamVjdC5cbiAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHsgb2JqZWN0SWQ6IGlkTWF0Y2gub2JqZWN0SWQgfTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAgIC5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWRcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiBpZE1hdGNoLmRldmljZVRva2VuICE9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgICAgLy8gV2UncmUgc2V0dGluZyB0aGUgZGV2aWNlIHRva2VuIG9uIGFuIGV4aXN0aW5nIGluc3RhbGxhdGlvbiwgc29cbiAgICAgICAgICAgIC8vIHdlIHNob3VsZCB0cnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2ggdGhpc1xuICAgICAgICAgICAgLy8gZGV2aWNlIHRva2VuLlxuICAgICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgLy8gV2UgaGF2ZSBhIHVuaXF1ZSBpbnN0YWxsIElkLCB1c2UgdGhhdCB0byBwcmVzZXJ2ZVxuICAgICAgICAgICAgLy8gdGhlIGludGVyZXN0aW5nIGluc3RhbGxhdGlvblxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnaW5zdGFsbGF0aW9uSWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgPT0gdGhpcy5kYXRhLm9iamVjdElkXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gd2UgcGFzc2VkIGFuIG9iamVjdElkLCBwcmVzZXJ2ZSB0aGF0IGluc3RhbGF0aW9uXG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydvYmplY3RJZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogaWRNYXRjaC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFdoYXQgdG8gZG8gaGVyZT8gY2FuJ3QgcmVhbGx5IGNsZWFuIHVwIGV2ZXJ5dGhpbmcuLi5cbiAgICAgICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSW4gbm9uLW1lcmdlIHNjZW5hcmlvcywganVzdCByZXR1cm4gdGhlIGluc3RhbGxhdGlvbiBtYXRjaCBpZFxuICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbihvYmpJZCA9PiB7XG4gICAgICBpZiAob2JqSWQpIHtcbiAgICAgICAgdGhpcy5xdWVyeSA9IHsgb2JqZWN0SWQ6IG9iaklkIH07XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuICAgICAgfVxuICAgICAgLy8gVE9ETzogVmFsaWRhdGUgb3BzIChhZGQvcmVtb3ZlIG9uIGNoYW5uZWxzLCAkaW5jIG9uIGJhZGdlLCBldGMuKVxuICAgIH0pO1xuICByZXR1cm4gcHJvbWlzZTtcbn07XG5cbi8vIElmIHdlIHNob3J0LWNpcmN1aXRlZCB0aGUgb2JqZWN0IHJlc3BvbnNlIC0gdGhlbiB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB3ZSBleHBhbmQgYWxsIHRoZSBmaWxlcyxcbi8vIHNpbmNlIHRoaXMgbWlnaHQgbm90IGhhdmUgYSBxdWVyeSwgbWVhbmluZyBpdCB3b24ndCByZXR1cm4gdGhlIGZ1bGwgcmVzdWx0IGJhY2suXG4vLyBUT0RPOiAobmx1dHNlbmtvKSBUaGlzIHNob3VsZCBkaWUgd2hlbiB3ZSBtb3ZlIHRvIHBlci1jbGFzcyBiYXNlZCBjb250cm9sbGVycyBvbiBfU2Vzc2lvbi9fVXNlclxuUmVzdFdyaXRlLnByb3RvdHlwZS5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgd2hldGhlciB3ZSBoYXZlIGEgc2hvcnQtY2lyY3VpdGVkIHJlc3BvbnNlIC0gb25seSB0aGVuIHJ1biBleHBhbnNpb24uXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdGhpcy5yZXNwb25zZS5yZXNwb25zZSk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuRGF0YWJhc2VPcGVyYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1JvbGUnKSB7XG4gICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnJvbGUuY2xlYXIoKTtcbiAgICBpZiAodGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlcikge1xuICAgICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5jbGVhckNhY2hlZFJvbGVzKHRoaXMuYXV0aC51c2VyKTtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgdGhpcy5xdWVyeSAmJiB0aGlzLmF1dGguaXNVbmF1dGhlbnRpY2F0ZWQoKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORyxcbiAgICAgIGBDYW5ub3QgbW9kaWZ5IHVzZXIgJHt0aGlzLnF1ZXJ5Lm9iamVjdElkfS5gXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Qcm9kdWN0JyAmJiB0aGlzLmRhdGEuZG93bmxvYWQpIHtcbiAgICB0aGlzLmRhdGEuZG93bmxvYWROYW1lID0gdGhpcy5kYXRhLmRvd25sb2FkLm5hbWU7XG4gIH1cblxuICAvLyBUT0RPOiBBZGQgYmV0dGVyIGRldGVjdGlvbiBmb3IgQUNMLCBlbnN1cmluZyBhIHVzZXIgY2FuJ3QgYmUgbG9ja2VkIGZyb21cbiAgLy8gICAgICAgdGhlaXIgb3duIHVzZXIgcmVjb3JkLlxuICBpZiAodGhpcy5kYXRhLkFDTCAmJiB0aGlzLmRhdGEuQUNMWycqdW5yZXNvbHZlZCddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQUNMLCAnSW52YWxpZCBBQ0wuJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIC8vIEZvcmNlIHRoZSB1c2VyIHRvIG5vdCBsb2Nrb3V0XG4gICAgLy8gTWF0Y2hlZCB3aXRoIHBhcnNlLmNvbVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuQUNMICYmXG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXIgIT09IHRydWUgJiZcbiAgICAgIHRoaXMuYXV0aC5pc01haW50ZW5hbmNlICE9PSB0cnVlXG4gICAgKSB7XG4gICAgICB0aGlzLmRhdGEuQUNMW3RoaXMucXVlcnkub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgIH1cbiAgICAvLyB1cGRhdGUgcGFzc3dvcmQgdGltZXN0YW1wIGlmIHVzZXIgcGFzc3dvcmQgaXMgYmVpbmcgY2hhbmdlZFxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgKSB7XG4gICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgIH1cbiAgICAvLyBJZ25vcmUgY3JlYXRlZEF0IHdoZW4gdXBkYXRlXG4gICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG5cbiAgICBsZXQgZGVmZXIgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAvLyBpZiBwYXNzd29yZCBoaXN0b3J5IGlzIGVuYWJsZWQgdGhlbiBzYXZlIHRoZSBjdXJyZW50IHBhc3N3b3JkIHRvIGhpc3RvcnlcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICApIHtcbiAgICAgIGRlZmVyID0gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH0sXG4gICAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvL24tMSBwYXNzd29yZHMgZ28gaW50byBoaXN0b3J5IGluY2x1ZGluZyBsYXN0IHBhc3N3b3JkXG4gICAgICAgICAgd2hpbGUgKFxuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLmxlbmd0aCA+IE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0geyByZXNwb25zZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTZXQgdGhlIGRlZmF1bHQgQUNMIGFuZCBwYXNzd29yZCB0aW1lc3RhbXAgZm9yIHRoZSBuZXcgX1VzZXJcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIHZhciBBQ0wgPSB0aGlzLmRhdGEuQUNMO1xuICAgICAgLy8gZGVmYXVsdCBwdWJsaWMgci93IEFDTFxuICAgICAgaWYgKCFBQ0wpIHtcbiAgICAgICAgQUNMID0ge307XG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgICAgICAgIEFDTFsnKiddID0geyByZWFkOiB0cnVlLCB3cml0ZTogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gbWFrZSBzdXJlIHRoZSB1c2VyIGlzIG5vdCBsb2NrZWQgZG93blxuICAgICAgQUNMW3RoaXMuZGF0YS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgICB0aGlzLmRhdGEuQUNMID0gQUNMO1xuICAgICAgLy8gcGFzc3dvcmQgdGltZXN0YW1wIHRvIGJlIHVzZWQgd2hlbiBwYXNzd29yZCBleHBpcnkgcG9saWN5IGlzIGVuZm9yY2VkXG4gICAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSdW4gYSBjcmVhdGVcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5jcmVhdGUodGhpcy5jbGFzc05hbWUsIHRoaXMuZGF0YSwgdGhpcy5ydW5PcHRpb25zLCBmYWxzZSwgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBRdWljayBjaGVjaywgaWYgd2Ugd2VyZSBhYmxlIHRvIGluZmVyIHRoZSBkdXBsaWNhdGVkIGZpZWxkIG5hbWVcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnVzZXJJbmZvICYmIGVycm9yLnVzZXJJbmZvLmR1cGxpY2F0ZWRfZmllbGQgPT09ICd1c2VybmFtZScpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnVzZXJJbmZvICYmIGVycm9yLnVzZXJJbmZvLmR1cGxpY2F0ZWRfZmllbGQgPT09ICdlbWFpbCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGlzIHdhcyBhIGZhaWxlZCB1c2VyIGNyZWF0aW9uIGR1ZSB0byB1c2VybmFtZSBvciBlbWFpbCBhbHJlYWR5IHRha2VuLCB3ZSBuZWVkIHRvXG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgaXQgd2FzIHVzZXJuYW1lIG9yIGVtYWlsIGFuZCByZXR1cm4gdGhlIGFwcHJvcHJpYXRlIGVycm9yLlxuICAgICAgICAvLyBGYWxsYmFjayB0byB0aGUgb3JpZ2luYWwgbWV0aG9kXG4gICAgICAgIC8vIFRPRE86IFNlZSBpZiB3ZSBjYW4gbGF0ZXIgZG8gdGhpcyB3aXRob3V0IGFkZGl0aW9uYWwgcXVlcmllcyBieSB1c2luZyBuYW1lZCBpbmRleGVzLlxuICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAuZmluZChcbiAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgICAgIClcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLCBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9IH0sXG4gICAgICAgICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2Uub2JqZWN0SWQgPSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIHJlc3BvbnNlLmNyZWF0ZWRBdCA9IHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG5cbiAgICAgICAgaWYgKHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUpIHtcbiAgICAgICAgICByZXNwb25zZS51c2VybmFtZSA9IHRoaXMuZGF0YS51c2VybmFtZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICAgIHJlc3BvbnNlLFxuICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBub3RoaW5nIC0gZG9lc24ndCB3YWl0IGZvciB0aGUgdHJpZ2dlci5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQWZ0ZXJTYXZlVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlc3BvbnNlIHx8ICF0aGlzLnJlc3BvbnNlLnJlc3BvbnNlIHx8IHRoaXMucnVuT3B0aW9ucy5tYW55KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYWZ0ZXJTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBjb25zdCBoYXNBZnRlclNhdmVIb29rID0gdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICApO1xuICBjb25zdCBoYXNMaXZlUXVlcnkgPSB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLmhhc0xpdmVRdWVyeSh0aGlzLmNsYXNzTmFtZSk7XG4gIGlmICghaGFzQWZ0ZXJTYXZlSG9vayAmJiAhaGFzTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuICB1cGRhdGVkT2JqZWN0Ll9oYW5kbGVTYXZlUmVzcG9uc2UodGhpcy5yZXNwb25zZS5yZXNwb25zZSwgdGhpcy5yZXNwb25zZS5zdGF0dXMgfHwgMjAwKTtcblxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAvLyBOb3RpZml5IExpdmVRdWVyeVNlcnZlciBpZiBwb3NzaWJsZVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hQ29udHJvbGxlci5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnModXBkYXRlZE9iamVjdC5jbGFzc05hbWUpO1xuICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIub25BZnRlclNhdmUoXG4gICAgICB1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHBlcm1zXG4gICAgKTtcbiAgfSk7XG5cbiAgLy8gUnVuIGFmdGVyU2F2ZSB0cmlnZ2VyXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1blRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgY29uc3QganNvblJldHVybmVkID0gcmVzdWx0ICYmICFyZXN1bHQuX3RvRnVsbEpTT047XG4gICAgICBpZiAoanNvblJldHVybmVkKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ09wcy5vcGVyYXRpb25zID0ge307XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSByZXN1bHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShcbiAgICAgICAgICAocmVzdWx0IHx8IHVwZGF0ZWRPYmplY3QpLnRvSlNPTigpLFxuICAgICAgICAgIHRoaXMuZGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1pZGRsZSA9IHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgY29uc3QgbW91bnQgPSB0aGlzLmNvbmZpZy5tb3VudCB8fCB0aGlzLmNvbmZpZy5zZXJ2ZXJVUkw7XG4gIHJldHVybiBtb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGF0YS5vYmplY3RJZCB8fCB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xufTtcblxuLy8gUmV0dXJucyBhIGNvcHkgb2YgdGhlIGRhdGEgYW5kIGRlbGV0ZSBiYWQga2V5cyAoX2F1dGhfZGF0YSwgX2hhc2hlZF9wYXNzd29yZC4uLilcblJlc3RXcml0ZS5wcm90b3R5cGUuc2FuaXRpemVkRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFBhcnNlT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lLCBvYmplY3RJZDogdGhpcy5xdWVyeT8ub2JqZWN0SWQgfTtcbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgY29uc3QgY2xhc3NOYW1lID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKGV4dHJhRGF0YSk7XG4gIGNvbnN0IHJlYWRPbmx5QXR0cmlidXRlcyA9IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXNcbiAgICA/IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXMoKVxuICAgIDogW107XG4gIGlmICghdGhpcy5vcmlnaW5hbERhdGEpIHtcbiAgICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICAgIGV4dHJhRGF0YVthdHRyaWJ1dGVdID0gdGhpcy5kYXRhW2F0dHJpYnV0ZV07XG4gICAgfVxuICB9XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbiAoZGF0YSwga2V5KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGFba2V5XS5fX29wID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXJlYWRPbmx5QXR0cmlidXRlcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWJkb2N1bWVudCBrZXkgd2l0aCBkb3Qgbm90YXRpb24geyAneC55JzogdiB9ID0+IHsgJ3gnOiB7ICd5JyA6IHYgfSB9KVxuICAgICAgICBjb25zdCBzcGxpdHRlZEtleSA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJlbnRWYWwgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICAgIH1cbiAgICAgICAgcGFyZW50VmFsW3NwbGl0dGVkS2V5WzFdXSA9IGRhdGFba2V5XTtcbiAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcblxuICBjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplZERhdGEoKTtcbiAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgZGVsZXRlIHNhbml0aXplZFthdHRyaWJ1dGVdO1xuICB9XG4gIHVwZGF0ZWRPYmplY3Quc2V0KHNhbml0aXplZCk7XG4gIHJldHVybiB7IHVwZGF0ZWRPYmplY3QsIG9yaWdpbmFsT2JqZWN0IH07XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uIChyZXNwb25zZSwgZGF0YSkge1xuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHModGhpcy5wZW5kaW5nT3BzLmlkZW50aWZpZXIpO1xuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnBlbmRpbmdPcHMub3BlcmF0aW9ucykge1xuICAgIGlmICghcGVuZGluZ1trZXldKSB7XG4gICAgICBkYXRhW2tleV0gPSB0aGlzLm9yaWdpbmFsRGF0YSA/IHRoaXMub3JpZ2luYWxEYXRhW2tleV0gOiB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHNraXBLZXlzID0gWy4uLihyZXF1aXJlZENvbHVtbnMucmVhZFt0aGlzLmNsYXNzTmFtZV0gfHwgW10pXTtcbiAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgc2tpcEtleXMucHVzaCgnb2JqZWN0SWQnLCAnY3JlYXRlZEF0Jyk7XG4gIH0gZWxzZSB7XG4gICAgc2tpcEtleXMucHVzaCgndXBkYXRlZEF0Jyk7XG4gICAgZGVsZXRlIHJlc3BvbnNlLm9iamVjdElkO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHJlc3BvbnNlKSB7XG4gICAgaWYgKHNraXBLZXlzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCB2YWx1ZSA9IHJlc3BvbnNlW2tleV07XG4gICAgaWYgKFxuICAgICAgdmFsdWUgPT0gbnVsbCB8fFxuICAgICAgKHZhbHVlLl9fdHlwZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwoZGF0YVtrZXldLCB2YWx1ZSkgfHxcbiAgICAgIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwoKHRoaXMub3JpZ2luYWxEYXRhIHx8IHt9KVtrZXldLCB2YWx1ZSlcbiAgICApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtrZXldO1xuICAgIH1cbiAgfVxuICBpZiAoXy5pc0VtcHR5KHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyKSkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBjbGllbnRTdXBwb3J0c0RlbGV0ZSA9IENsaWVudFNESy5zdXBwb3J0c0ZvcndhcmREZWxldGUodGhpcy5jbGllbnRTREspO1xuICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZGF0YVZhbHVlID0gZGF0YVtmaWVsZE5hbWVdO1xuXG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzcG9uc2UsIGZpZWxkTmFtZSkpIHtcbiAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgfVxuXG4gICAgLy8gU3RyaXBzIG9wZXJhdGlvbnMgZnJvbSByZXNwb25zZXNcbiAgICBpZiAocmVzcG9uc2VbZmllbGROYW1lXSAmJiByZXNwb25zZVtmaWVsZE5hbWVdLl9fb3ApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtmaWVsZE5hbWVdO1xuICAgICAgaWYgKGNsaWVudFN1cHBvcnRzRGVsZXRlICYmIGRhdGFWYWx1ZS5fX29wID09ICdEZWxldGUnKSB7XG4gICAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jaGVja1Byb2hpYml0ZWRLZXl3b3JkcyA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gIGlmICh0aGlzLmNvbmZpZy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLmNvbmZpZy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoZGF0YSwga2V5d29yZC5rZXksIGtleXdvcmQudmFsdWUpO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgIGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBZUEsSUFBQUEsVUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsT0FB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