"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _RestQuery = _interopRequireDefault(require("./RestQuery"));

var _lodash = _interopRequireDefault(require("lodash"));

var _logger = _interopRequireDefault(require("./logger"));

var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));

var _SchemaController = require("./Controllers/SchemaController");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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

  if (this.config.requestKeywordDenylist) {
    // Scan request data for denied keywords
    for (const keyword of this.config.requestKeywordDenylist) {
      const match = Utils.objectContainsKeyValue(data, keyword.key, keyword.value);

      if (match) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
      }
    }
  } // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header


  this.response = null; // Processing this operation may mutate our data, so we operate on a
  // copy

  this.query = deepcopy(query);
  this.data = deepcopy(data); // We never change originalData, so we do not need a deep copy

  this.originalData = originalData; // The timestamp we'll use for this whole operation

  this.updatedAt = Parse._encode(new Date()).iso; // Shared SchemaController to be reused to reduce the number of loadSchema() calls per request
  // Once set the schemaData should be immutable

  this.validSchemaController = null;
  this.pendingOps = {};
} // A convenient method to perform all the steps of processing the
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
    return this.response;
  });
}; // Uses the Auth object to get the list of roles, adds the user id


RestWrite.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster) {
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
}; // Validates this operation against the allowClientClassCreation config.


RestWrite.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
}; // Validates this operation against the schema.


RestWrite.prototype.validateSchema = function () {
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions);
}; // Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.


RestWrite.prototype.runBeforeSaveTrigger = function () {
  if (this.response) {
    return;
  } // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.


  if (!triggers.triggerExists(this.className, triggers.Types.beforeSave, this.config.applicationId)) {
    return Promise.resolve();
  }

  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(updatedObject._getStateIdentifier());
  this.pendingOps = _objectSpread({}, pending);
  return Promise.resolve().then(() => {
    // Before calling the trigger, validate the permissions for the save operation
    let databasePromise = null;

    if (this.query) {
      // Validate for updating
      databasePromise = this.config.database.update(this.className, this.query, this.data, this.runOptions, true, true);
    } else {
      // Validate for creating
      databasePromise = this.config.database.create(this.className, this.data, this.runOptions, true);
    } // In the case that there is no permission for the operation, it throws an error


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
      this.data = response.object; // We should delete the objectId for an update write

      if (this.query && this.query.objectId) {
        delete this.data.objectId;
      }
    }
  });
};

RestWrite.prototype.runBeforeLoginTrigger = async function (userData) {
  // Avoid doing any setup for triggers if there is no 'beforeLogin' trigger
  if (!triggers.triggerExists(this.className, triggers.Types.beforeLogin, this.config.applicationId)) {
    return;
  } // Cloud code gets a bit of extra data for its objects


  const extraData = {
    className: this.className
  }; // Expand file objects

  this.config.filesController.expandFilesInObject(this.config, userData);
  const user = triggers.inflate(extraData, userData); // no need to return a response

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
      }; // Add default fields


      this.data.updatedAt = this.updatedAt;

      if (!this.query) {
        this.data.createdAt = this.updatedAt; // Only assign new objectId if we are creating new object

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
}; // Transforms auth data for a user object.
// Does nothing if this isn't a user object.
// Returns a promise for when we're done if it can't finish this tick.


RestWrite.prototype.validateAuthData = function () {
  if (this.className !== '_User') {
    return;
  }

  if (!this.query && !this.data.authData) {
    if (typeof this.data.username !== 'string' || _lodash.default.isEmpty(this.data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }

    if (typeof this.data.password !== 'string' || _lodash.default.isEmpty(this.data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }

  if (this.data.authData && !Object.keys(this.data.authData).length || !Object.prototype.hasOwnProperty.call(this.data, 'authData')) {
    // Handle saving authData to {} or if authData doesn't exist
    return;
  } else if (Object.prototype.hasOwnProperty.call(this.data, 'authData') && !this.data.authData) {
    // Handle saving authData to null
    throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
  }

  var authData = this.data.authData;
  var providers = Object.keys(authData);

  if (providers.length > 0) {
    const canHandleAuthData = providers.reduce((canHandle, provider) => {
      var providerAuthData = authData[provider];
      var hasToken = providerAuthData && providerAuthData.id;
      return canHandle && (hasToken || providerAuthData == null);
    }, true);

    if (canHandleAuthData) {
      return this.handleAuthData(authData);
    }
  }

  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
};

RestWrite.prototype.handleAuthDataValidation = function (authData) {
  const validations = Object.keys(authData).map(provider => {
    if (authData[provider] === null) {
      return Promise.resolve();
    }

    const validateAuthData = this.config.authDataManager.getValidatorForProvider(provider);
    const authProvider = (this.config.auth || {})[provider] || {};

    if (authProvider.enabled == null) {
      _Deprecator.default.logRuntimeDeprecation({
        usage: `auth.${provider}`,
        solution: `auth.${provider}.enabled: true`
      });
    }

    if (!validateAuthData || authProvider.enabled === false) {
      throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
    }

    return validateAuthData(authData[provider]);
  });
  return Promise.all(validations);
};

RestWrite.prototype.findUsersWithAuthData = function (authData) {
  const providers = Object.keys(authData);
  const query = providers.reduce((memo, provider) => {
    if (!authData[provider]) {
      return memo;
    }

    const queryKey = `authData.${provider}.id`;
    const query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter(q => {
    return typeof q !== 'undefined';
  });
  let findPromise = Promise.resolve([]);

  if (query.length > 0) {
    findPromise = this.config.database.find(this.className, {
      $or: query
    }, {});
  }

  return findPromise;
};

RestWrite.prototype.filteredObjectsByACL = function (objects) {
  if (this.auth.isMaster) {
    return objects;
  }

  return objects.filter(object => {
    if (!object.ACL) {
      return true; // legacy users that have no ACL field on them
    } // Regular users that have been locked out.


    return object.ACL && Object.keys(object.ACL).length > 0;
  });
};

RestWrite.prototype.handleAuthData = function (authData) {
  let results;
  return this.findUsersWithAuthData(authData).then(async r => {
    results = this.filteredObjectsByACL(r);

    if (results.length == 1) {
      this.storage['authProvider'] = Object.keys(authData).join(',');
      const userResult = results[0];
      const mutatedAuthData = {};
      Object.keys(authData).forEach(provider => {
        const providerData = authData[provider];
        const userAuthData = userResult.authData[provider];

        if (!_lodash.default.isEqual(providerData, userAuthData)) {
          mutatedAuthData[provider] = providerData;
        }
      });
      const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
      let userId;

      if (this.query && this.query.objectId) {
        userId = this.query.objectId;
      } else if (this.auth && this.auth.user && this.auth.user.id) {
        userId = this.auth.user.id;
      }

      if (!userId || userId === userResult.objectId) {
        // no user making the call
        // OR the user making the call is the right one
        // Login with auth data
        delete results[0].password; // need to set the objectId first otherwise location has trailing undefined

        this.data.objectId = userResult.objectId;

        if (!this.query || !this.query.objectId) {
          // this a login call, no userId passed
          this.response = {
            response: userResult,
            location: this.location()
          }; // Run beforeLogin hook before storing any updates
          // to authData on the db; changes to userResult
          // will be ignored.

          await this.runBeforeLoginTrigger(deepcopy(userResult));
        } // If we didn't change the auth data, just keep going


        if (!hasMutatedAuthData) {
          return;
        } // We have authData that is updated on login
        // that can happen when token are refreshed,
        // We should update the token and let the user in
        // We should only check the mutated keys


        return this.handleAuthDataValidation(mutatedAuthData).then(async () => {
          // IF we have a response, we'll skip the database operation / beforeSave / afterSave etc...
          // we need to set it up there.
          // We are supposed to have a response only on LOGIN with authData, so we skip those
          // If we're not logging in, but just updating the current user, we can safely skip that part
          if (this.response) {
            // Assign the new authData in the response
            Object.keys(mutatedAuthData).forEach(provider => {
              this.response.response.authData[provider] = mutatedAuthData[provider];
            }); // Run the DB update directly, as 'master'
            // Just update the authData part
            // Then we're good for the user, early exit of sorts

            return this.config.database.update(this.className, {
              objectId: this.data.objectId
            }, {
              authData: mutatedAuthData
            }, {});
          }
        });
      } else if (userId) {
        // Trying to update auth data but users
        // are different
        if (userResult.objectId !== userId) {
          throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
        } // No auth data was mutated, just keep going


        if (!hasMutatedAuthData) {
          return;
        }
      }
    }

    return this.handleAuthDataValidation(authData).then(() => {
      if (results.length > 1) {
        // More than 1 user with the passed id's
        throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
      }
    });
  });
}; // The non-third-party parts of User transformation


RestWrite.prototype.transformUser = function () {
  var promise = Promise.resolve();

  if (this.className !== '_User') {
    return promise;
  }

  if (!this.auth.isMaster && 'emailVerified' in this.data) {
    const error = `Clients aren't allowed to manually update email verification.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  } // Do not cleanup session if objectId is not set


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
      this.storage['clearSessions'] = true; // Generate a new session only if the user requested

      if (!this.auth.isMaster) {
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
  } // Validate basic email address format


  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  } // Case insensitive match, see note above function.


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
  const containsUsernameError = 'Password cannot contain your username.'; // check whether the password meets the password strength requirements

  if (this.config.passwordPolicy.patternValidator && !this.config.passwordPolicy.patternValidator(this.data.password) || this.config.passwordPolicy.validatorCallback && !this.config.passwordPolicy.validatorCallback(this.data.password)) {
    return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
  } // check whether password contain username


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
    }).then(results => {
      if (results.length != 1) {
        throw undefined;
      }

      const user = results[0];
      let oldPasswords = [];
      if (user._password_history) oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory - 1);
      oldPasswords.push(user.password);
      const newPassword = this.data.password; // compare the new password hash with all old password hashes

      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result) // reject if there is a match
            return Promise.reject('REPEAT_PASSWORD');
          return Promise.resolve();
        });
      }); // wait for all comparisons to complete

      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD') // a match was found
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
  } // Don't generate session for updating user (this.query is set) unless authData exists


  if (this.query && !this.data.authData) {
    return;
  } // Don't generate new sessionToken if linking via sessionToken


  if (this.auth.user && this.data.authData) {
    return;
  }

  if (!this.storage['authProvider'] && // signup call, with
  this.config.preventLoginWithUnverifiedEmail && // no login without verification
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

  if (this.storage['authProvider'] == null && this.data.authData) {
    this.storage['authProvider'] = Object.keys(this.data.authData).join(',');
  }

  const {
    sessionData,
    createSession
  } = RestWrite.createSession(this.config, {
    userId: this.objectId(),
    createdWith: {
      action: this.storage['authProvider'] ? 'login' : 'signup',
      authProvider: this.storage['authProvider'] || 'password'
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
}; // Delete email reset tokens if user is changing password or email.


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
  } // Destroy the sessions in 'Background'


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
}; // Handles any followup logic


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
    delete this.storage['sendVerificationEmail']; // Fire and forget!

    this.config.userController.sendVerificationEmail(this.data);
    return this.handleFollowup.bind(this);
  }
}; // Handles the _Session class specialness.
// Does nothing if this isn't an _Session object.


RestWrite.prototype.handleSession = function () {
  if (this.response || this.className !== '_Session') {
    return;
  }

  if (!this.auth.user && !this.auth.isMaster) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  } // TODO: Verify proper error to throw


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
  }

  if (!this.query && !this.auth.isMaster) {
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
}; // Handles the _Installation class specialness.
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
  } // If the device token is 64 characters long, we assume it is for iOS
  // and lowercase it.


  if (this.data.deviceToken && this.data.deviceToken.length == 64) {
    this.data.deviceToken = this.data.deviceToken.toLowerCase();
  } // We lowercase the installationId if present


  if (this.data.installationId) {
    this.data.installationId = this.data.installationId.toLowerCase();
  }

  let installationId = this.data.installationId; // If data.installationId is not set and we're not master, we can lookup in auth

  if (!installationId && !this.auth.isMaster) {
    installationId = this.auth.installationId;
  }

  if (installationId) {
    installationId = installationId.toLowerCase();
  } // Updating _Installation but not updating anything critical


  if (this.query && !this.data.deviceToken && !installationId && !this.data.deviceType) {
    return;
  }

  var promise = Promise.resolve();
  var idMatch; // Will be a match on either objectId or installationId

  var objectIdMatch;
  var installationIdMatch;
  var deviceTokenMatches = []; // Instead of issuing 3 reads, let's do it with one OR.

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
    }); // Sanity checks when running a query

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
    } // need to specify deviceType only if it's new


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
          } // rethrow the error


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
          } // rethrow the error


          throw err;
        });
      } else {
        if (this.data.deviceToken && idMatch.deviceToken != this.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          const delQuery = {
            deviceToken: this.data.deviceToken
          }; // We have a unique install Id, use that to preserve
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
            } // rethrow the error


            throw err;
          });
        } // In non-merge scenarios, just return the installation match id


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
    } // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)

  });
  return promise;
}; // If we short-circuited the object response - then we need to make sure we expand all the files,
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
  } // TODO: Add better detection for ACL, ensuring a user can't be locked from
  //       their own user record.


  if (this.data.ACL && this.data.ACL['*unresolved']) {
    throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
  }

  if (this.query) {
    // Force the user to not lockout
    // Matched with parse.com
    if (this.className === '_User' && this.data.ACL && this.auth.isMaster !== true) {
      this.data.ACL[this.query.objectId] = {
        read: true,
        write: true
      };
    } // update password timestamp if user password is being changed


    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
      this.data._password_changed_at = Parse._encode(new Date());
    } // Ignore createdAt when update


    delete this.data.createdAt;
    let defer = Promise.resolve(); // if password history is enabled then save the current password to history

    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordHistory) {
      defer = this.config.database.find('_User', {
        objectId: this.objectId()
      }, {
        keys: ['_password_history', '_hashed_password']
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }

        const user = results[0];
        let oldPasswords = [];

        if (user._password_history) {
          oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory);
        } //n-1 passwords go into history including last password


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
      var ACL = this.data.ACL; // default public r/w ACL

      if (!ACL) {
        ACL = {};

        if (!this.config.enforcePrivateUsers) {
          ACL['*'] = {
            read: true,
            write: false
          };
        }
      } // make sure the user is not locked down


      ACL[this.data.objectId] = {
        read: true,
        write: true
      };
      this.data.ACL = ACL; // password timestamp to be used when password expiry policy is enforced

      if (this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
        this.data._password_changed_at = Parse._encode(new Date());
      }
    } // Run a create


    return this.config.database.create(this.className, this.data, this.runOptions, false, this.validSchemaController).catch(error => {
      if (this.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      } // Quick check, if we were able to infer the duplicated field name


      if (error && error.userInfo && error.userInfo.duplicated_field === 'username') {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
      }

      if (error && error.userInfo && error.userInfo.duplicated_field === 'email') {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
      } // If this was a failed user creation due to username or email already taken, we need to
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
}; // Returns nothing - doesn't wait for the trigger.


RestWrite.prototype.runAfterSaveTrigger = function () {
  if (!this.response || !this.response.response) {
    return;
  } // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.


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
  }); // Run afterSave trigger

  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    const jsonReturned = result && !result._toFullJSON;

    if (jsonReturned) {
      this.pendingOps = {};
      this.response.response = result;
    } else {
      this.response.response = this._updateResponseWithData((result || updatedObject).toJSON(), this.data);
    }
  }).catch(function (err) {
    _logger.default.warn('afterSave caught an error', err);
  });
}; // A helper to figure out what location this operation happens at.


RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  const mount = this.config.mount || this.config.serverURL;
  return mount + middle + this.data.objectId;
}; // A helper to get the object id for this operation.
// Because it could be either on the query or on the data


RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
}; // Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)


RestWrite.prototype.sanitizedData = function () {
  const data = Object.keys(this.data).reduce((data, key) => {
    // Regexp comes from Parse.Object.prototype.validate
    if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
      delete data[key];
    }

    return data;
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
}; // Returns an updated copy of the object


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
  const {
    updatedObject
  } = this.buildParseObjects();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(updatedObject._getStateIdentifier());

  for (const key in this.pendingOps) {
    if (!pending[key]) {
      data[key] = this.originalData ? this.originalData[key] : {
        __op: 'Delete'
      };
      this.storage.fieldsChangedByTrigger.push(key);
    }
  }

  const skipKeys = ['objectId', 'createdAt', 'updatedAt', ...(_SchemaController.requiredColumns.read[this.className] || [])];

  for (const key in response) {
    if (skipKeys.includes(key)) {
      continue;
    }

    const value = response[key];

    if (value == null || value.__type && value.__type === 'Pointer' || data[key] === value) {
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
    } // Strips operations from responses


    if (response[fieldName] && response[fieldName].__op) {
      delete response[fieldName];

      if (clientSupportsDelete && dataValue.__op == 'Delete') {
        response[fieldName] = dataValue;
      }
    }
  });
  return response;
};

var _default = RestWrite;
exports.default = _default;
module.exports = RestWrite;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsImRlZXBjb3B5IiwiQXV0aCIsIlV0aWxzIiwiY3J5cHRvVXRpbHMiLCJwYXNzd29yZENyeXB0byIsIlBhcnNlIiwidHJpZ2dlcnMiLCJDbGllbnRTREsiLCJSZXN0V3JpdGUiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwicXVlcnkiLCJkYXRhIiwib3JpZ2luYWxEYXRhIiwiY2xpZW50U0RLIiwiY29udGV4dCIsImFjdGlvbiIsImlzUmVhZE9ubHkiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJzdG9yYWdlIiwicnVuT3B0aW9ucyIsImFsbG93Q3VzdG9tT2JqZWN0SWQiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJvYmplY3RJZCIsIk1JU1NJTkdfT0JKRUNUX0lEIiwiSU5WQUxJRF9LRVlfTkFNRSIsImlkIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJtYXRjaCIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJrZXkiLCJ2YWx1ZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXNwb25zZSIsInVwZGF0ZWRBdCIsIl9lbmNvZGUiLCJEYXRlIiwiaXNvIiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwicGVuZGluZ09wcyIsImV4ZWN1dGUiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsImhhbmRsZUluc3RhbGxhdGlvbiIsImhhbmRsZVNlc3Npb24iLCJ2YWxpZGF0ZUF1dGhEYXRhIiwicnVuQmVmb3JlU2F2ZVRyaWdnZXIiLCJkZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCIsInZhbGlkYXRlU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsInNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQiLCJ0cmFuc2Zvcm1Vc2VyIiwiZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMiLCJkZXN0cm95RHVwbGljYXRlZFNlc3Npb25zIiwicnVuRGF0YWJhc2VPcGVyYXRpb24iLCJjcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCIsImhhbmRsZUZvbGxvd3VwIiwicnVuQWZ0ZXJTYXZlVHJpZ2dlciIsImNsZWFuVXNlckF1dGhEYXRhIiwiaXNNYXN0ZXIiLCJhY2wiLCJ1c2VyIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJjb25jYXQiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwiaW5kZXhPZiIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImhhc0NsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJ0cmlnZ2VyRXhpc3RzIiwiVHlwZXMiLCJiZWZvcmVTYXZlIiwiYXBwbGljYXRpb25JZCIsIm9yaWdpbmFsT2JqZWN0IiwidXBkYXRlZE9iamVjdCIsImJ1aWxkUGFyc2VPYmplY3RzIiwic3RhdGVDb250cm9sbGVyIiwiQ29yZU1hbmFnZXIiLCJnZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIiLCJwZW5kaW5nIiwiZ2V0UGVuZGluZ09wcyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJkYXRhYmFzZVByb21pc2UiLCJ1cGRhdGUiLCJjcmVhdGUiLCJyZXN1bHQiLCJsZW5ndGgiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwibWF5YmVSdW5UcmlnZ2VyIiwib2JqZWN0IiwiZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciIsIl8iLCJyZWR1Y2UiLCJpc0VxdWFsIiwicHVzaCIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJleHRyYURhdGEiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiaW5mbGF0ZSIsImdldEFsbENsYXNzZXMiLCJhbGxDbGFzc2VzIiwic2NoZW1hIiwiZmluZCIsIm9uZUNsYXNzIiwic2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkIiwiZmllbGROYW1lIiwic2V0RGVmYXVsdCIsInVuZGVmaW5lZCIsIl9fb3AiLCJmaWVsZHMiLCJkZWZhdWx0VmFsdWUiLCJyZXF1aXJlZCIsIlZBTElEQVRJT05fRVJST1IiLCJjcmVhdGVkQXQiLCJuZXdPYmplY3RJZCIsIm9iamVjdElkU2l6ZSIsImtleXMiLCJmb3JFYWNoIiwiYXV0aERhdGEiLCJ1c2VybmFtZSIsImlzRW1wdHkiLCJVU0VSTkFNRV9NSVNTSU5HIiwicGFzc3dvcmQiLCJQQVNTV09SRF9NSVNTSU5HIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwiY2FuSGFuZGxlIiwicHJvdmlkZXIiLCJwcm92aWRlckF1dGhEYXRhIiwiaGFzVG9rZW4iLCJoYW5kbGVBdXRoRGF0YSIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInZhbGlkYXRpb25zIiwibWFwIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJhdXRoUHJvdmlkZXIiLCJlbmFibGVkIiwiRGVwcmVjYXRvciIsImxvZ1J1bnRpbWVEZXByZWNhdGlvbiIsInVzYWdlIiwic29sdXRpb24iLCJhbGwiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJtZW1vIiwicXVlcnlLZXkiLCJmaWx0ZXIiLCJxIiwiZmluZFByb21pc2UiLCIkb3IiLCJmaWx0ZXJlZE9iamVjdHNCeUFDTCIsIm9iamVjdHMiLCJBQ0wiLCJyZXN1bHRzIiwiciIsImpvaW4iLCJ1c2VyUmVzdWx0IiwibXV0YXRlZEF1dGhEYXRhIiwicHJvdmlkZXJEYXRhIiwidXNlckF1dGhEYXRhIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwidXNlcklkIiwibG9jYXRpb24iLCJBQ0NPVU5UX0FMUkVBRFlfTElOS0VEIiwicHJvbWlzZSIsImVycm9yIiwiUmVzdFF1ZXJ5IiwibWFzdGVyIiwiX190eXBlIiwic2Vzc2lvbiIsImNhY2hlQ29udHJvbGxlciIsImRlbCIsInNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwiaGFzaCIsImhhc2hlZFBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsIl92YWxpZGF0ZVVzZXJOYW1lIiwiX3ZhbGlkYXRlRW1haWwiLCJyYW5kb21TdHJpbmciLCJyZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSIsIiRuZSIsImxpbWl0IiwiY2FzZUluc2Vuc2l0aXZlIiwiVVNFUk5BTUVfVEFLRU4iLCJlbWFpbCIsInJlamVjdCIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsIkVNQUlMX1RBS0VOIiwidXNlckNvbnRyb2xsZXIiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwicGFzc3dvcmRQb2xpY3kiLCJfdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyIsIl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSIsInBvbGljeUVycm9yIiwidmFsaWRhdGlvbkVycm9yIiwiY29udGFpbnNVc2VybmFtZUVycm9yIiwicGF0dGVyblZhbGlkYXRvciIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5Iiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsImNvbXBhcmUiLCJjYXRjaCIsImVyciIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsInRva2VuIiwibmV3VG9rZW4iLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJhc3NpZ24iLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJzdGF0dXMiLCJkZXZpY2VUb2tlbiIsInRvTG93ZXJDYXNlIiwiZGV2aWNlVHlwZSIsImlkTWF0Y2giLCJvYmplY3RJZE1hdGNoIiwiaW5zdGFsbGF0aW9uSWRNYXRjaCIsImRldmljZVRva2VuTWF0Y2hlcyIsIm9yUXVlcmllcyIsImRlbFF1ZXJ5IiwiYXBwSWRlbnRpZmllciIsImNvZGUiLCJvYmpJZCIsInJvbGUiLCJjbGVhciIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJjbGVhckNhY2hlZFJvbGVzIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJTRVNTSU9OX01JU1NJTkciLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsIm5hbWUiLCJJTlZBTElEX0FDTCIsInJlYWQiLCJ3cml0ZSIsIm1heFBhc3N3b3JkQWdlIiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJkZWZlciIsIk1hdGgiLCJtYXgiLCJzaGlmdCIsIl91cGRhdGVSZXNwb25zZVdpdGhEYXRhIiwiZW5mb3JjZVByaXZhdGVVc2VycyIsIkRVUExJQ0FURV9WQUxVRSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImhhc0FmdGVyU2F2ZUhvb2siLCJhZnRlclNhdmUiLCJoYXNMaXZlUXVlcnkiLCJfaGFuZGxlU2F2ZVJlc3BvbnNlIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJvbkFmdGVyU2F2ZSIsImpzb25SZXR1cm5lZCIsIl90b0Z1bGxKU09OIiwidG9KU09OIiwibG9nZ2VyIiwid2FybiIsIm1pZGRsZSIsIm1vdW50Iiwic2VydmVyVVJMIiwic2FuaXRpemVkRGF0YSIsInRlc3QiLCJfZGVjb2RlIiwiZnJvbUpTT04iLCJyZWFkT25seUF0dHJpYnV0ZXMiLCJjb25zdHJ1Y3RvciIsImF0dHJpYnV0ZSIsImluY2x1ZGVzIiwic2V0Iiwic3BsaXR0ZWRLZXkiLCJzcGxpdCIsInBhcmVudFByb3AiLCJwYXJlbnRWYWwiLCJnZXQiLCJzYW5pdGl6ZWQiLCJza2lwS2V5cyIsInJlcXVpcmVkQ29sdW1ucyIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBSZXN0V3JpdGUgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBkZWVwY29weSA9IHJlcXVpcmUoJ2RlZXBjb3B5Jyk7XG5cbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi9VdGlscycpO1xudmFyIGNyeXB0b1V0aWxzID0gcmVxdWlyZSgnLi9jcnlwdG9VdGlscycpO1xudmFyIHBhc3N3b3JkQ3J5cHRvID0gcmVxdWlyZSgnLi9wYXNzd29yZCcpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xudmFyIHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xudmFyIENsaWVudFNESyA9IHJlcXVpcmUoJy4vQ2xpZW50U0RLJyk7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcbmltcG9ydCB7IHJlcXVpcmVkQ29sdW1ucyB9IGZyb20gJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5cbi8vIHF1ZXJ5IGFuZCBkYXRhIGFyZSBib3RoIHByb3ZpZGVkIGluIFJFU1QgQVBJIGZvcm1hdC4gU28gZGF0YVxuLy8gdHlwZXMgYXJlIGVuY29kZWQgYnkgcGxhaW4gb2xkIG9iamVjdHMuXG4vLyBJZiBxdWVyeSBpcyBudWxsLCB0aGlzIGlzIGEgXCJjcmVhdGVcIiBhbmQgdGhlIGRhdGEgaW4gZGF0YSBzaG91bGQgYmVcbi8vIGNyZWF0ZWQuXG4vLyBPdGhlcndpc2UgdGhpcyBpcyBhbiBcInVwZGF0ZVwiIC0gdGhlIG9iamVjdCBtYXRjaGluZyB0aGUgcXVlcnlcbi8vIHNob3VsZCBnZXQgdXBkYXRlZCB3aXRoIGRhdGEuXG4vLyBSZXN0V3JpdGUgd2lsbCBoYW5kbGUgb2JqZWN0SWQsIGNyZWF0ZWRBdCwgYW5kIHVwZGF0ZWRBdCBmb3Jcbi8vIGV2ZXJ5dGhpbmcuIEl0IGFsc28ga25vd3MgdG8gdXNlIHRyaWdnZXJzIGFuZCBzcGVjaWFsIG1vZGlmaWNhdGlvbnNcbi8vIGZvciB0aGUgX1VzZXIgY2xhc3MuXG5mdW5jdGlvbiBSZXN0V3JpdGUoY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHF1ZXJ5LCBkYXRhLCBvcmlnaW5hbERhdGEsIGNsaWVudFNESywgY29udGV4dCwgYWN0aW9uKSB7XG4gIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgJ0Nhbm5vdCBwZXJmb3JtIGEgd3JpdGUgb3BlcmF0aW9uIHdoZW4gdXNpbmcgcmVhZE9ubHlNYXN0ZXJLZXknXG4gICAgKTtcbiAgfVxuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnN0b3JhZ2UgPSB7fTtcbiAgdGhpcy5ydW5PcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG5cbiAgaWYgKGFjdGlvbikge1xuICAgIHRoaXMucnVuT3B0aW9ucy5hY3Rpb24gPSBhY3Rpb247XG4gIH1cblxuICBpZiAoIXF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgJ29iamVjdElkJykgJiYgIWRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk1JU1NJTkdfT0JKRUNUX0lELFxuICAgICAgICAgICdvYmplY3RJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCBvciB1bmRlZmluZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgICAgaWYgKGRhdGEuaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdpZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHRoaXMuY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZShkYXRhLCBrZXl3b3JkLmtleSwga2V5d29yZC52YWx1ZSk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHRoZSBvcGVyYXRpb24gaXMgY29tcGxldGUsIHRoaXMucmVzcG9uc2UgbWF5IGhhdmUgc2V2ZXJhbFxuICAvLyBmaWVsZHMuXG4gIC8vIHJlc3BvbnNlOiB0aGUgYWN0dWFsIGRhdGEgdG8gYmUgcmV0dXJuZWRcbiAgLy8gc3RhdHVzOiB0aGUgaHR0cCBzdGF0dXMgY29kZS4gaWYgbm90IHByZXNlbnQsIHRyZWF0ZWQgbGlrZSBhIDIwMFxuICAvLyBsb2NhdGlvbjogdGhlIGxvY2F0aW9uIGhlYWRlci4gaWYgbm90IHByZXNlbnQsIG5vIGxvY2F0aW9uIGhlYWRlclxuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcblxuICAvLyBQcm9jZXNzaW5nIHRoaXMgb3BlcmF0aW9uIG1heSBtdXRhdGUgb3VyIGRhdGEsIHNvIHdlIG9wZXJhdGUgb24gYVxuICAvLyBjb3B5XG4gIHRoaXMucXVlcnkgPSBkZWVwY29weShxdWVyeSk7XG4gIHRoaXMuZGF0YSA9IGRlZXBjb3B5KGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7fTtcbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyB0aGVcbi8vIHdyaXRlLCBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHtyZXNwb25zZSwgc3RhdHVzLCBsb2NhdGlvbn0gb2JqZWN0LlxuLy8gc3RhdHVzIGFuZCBsb2NhdGlvbiBhcmUgb3B0aW9uYWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldFVzZXJBbmRSb2xlQUNMKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluc3RhbGxhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlU2Vzc2lvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gdGhpcy5ydW5PcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgc2NoZW1hLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZVNjaGVtYSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnZhbGlkYXRlT2JqZWN0KFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRoaXMuZGF0YSxcbiAgICB0aGlzLnF1ZXJ5LFxuICAgIHRoaXMucnVuT3B0aW9uc1xuICApO1xufTtcblxuLy8gUnVucyBhbnkgYmVmb3JlU2F2ZSB0cmlnZ2VycyBhZ2FpbnN0IHRoaXMgb3BlcmF0aW9uLlxuLy8gQW55IGNoYW5nZSBsZWFkcyB0byBvdXIgZGF0YSBiZWluZyBtdXRhdGVkLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVTYXZlVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcblxuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHModXBkYXRlZE9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7IC4uLnBlbmRpbmcgfTtcblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgY3JlYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuY3JlYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSW4gdGhlIGNhc2UgdGhhdCB0aGVyZSBpcyBubyBwZXJtaXNzaW9uIGZvciB0aGUgb3BlcmF0aW9uLCBpdCB0aHJvd3MgYW4gZXJyb3JcbiAgICAgIHJldHVybiBkYXRhYmFzZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgdGhpcy5hdXRoLFxuICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSBfLnJlZHVjZShcbiAgICAgICAgICByZXNwb25zZS5vYmplY3QsXG4gICAgICAgICAgKHJlc3VsdCwgdmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5kYXRhW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YSA9IHJlc3BvbnNlLm9iamVjdDtcbiAgICAgICAgLy8gV2Ugc2hvdWxkIGRlbGV0ZSB0aGUgb2JqZWN0SWQgZm9yIGFuIHVwZGF0ZSB3cml0ZVxuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVMb2dpblRyaWdnZXIgPSBhc3luYyBmdW5jdGlvbiAodXNlckRhdGEpIHtcbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlTG9naW4nIHRyaWdnZXJcbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbiwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2xvdWQgY29kZSBnZXRzIGEgYml0IG9mIGV4dHJhIGRhdGEgZm9yIGl0cyBvYmplY3RzXG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuXG4gIC8vIEV4cGFuZCBmaWxlIG9iamVjdHNcbiAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHVzZXJEYXRhKTtcblxuICBjb25zdCB1c2VyID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHVzZXJEYXRhKTtcblxuICAvLyBubyBuZWVkIHRvIHJldHVybiBhIHJlc3BvbnNlXG4gIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbixcbiAgICB0aGlzLmF1dGgsXG4gICAgdXNlcixcbiAgICBudWxsLFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuY29udGV4dFxuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5kYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKS50aGVuKGFsbENsYXNzZXMgPT4ge1xuICAgICAgY29uc3Qgc2NoZW1hID0gYWxsQ2xhc3Nlcy5maW5kKG9uZUNsYXNzID0+IG9uZUNsYXNzLmNsYXNzTmFtZSA9PT0gdGhpcy5jbGFzc05hbWUpO1xuICAgICAgY29uc3Qgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkID0gKGZpZWxkTmFtZSwgc2V0RGVmYXVsdCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSBudWxsIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICcnIHx8XG4gICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHNldERlZmF1bHQgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgICAodGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5yZXF1aXJlZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGAke2ZpZWxkTmFtZX0gaXMgcmVxdWlyZWRgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBkZWZhdWx0IGZpZWxkc1xuICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcblxuICAgICAgICAvLyBPbmx5IGFzc2lnbiBuZXcgb2JqZWN0SWQgaWYgd2UgYXJlIGNyZWF0aW5nIG5ldyBvYmplY3RcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSBjcnlwdG9VdGlscy5uZXdPYmplY3RJZCh0aGlzLmNvbmZpZy5vYmplY3RJZFNpemUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCB0cnVlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzY2hlbWEpIHtcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG4vLyBUcmFuc2Zvcm1zIGF1dGggZGF0YSBmb3IgYSB1c2VyIG9iamVjdC5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGEgdXNlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEudXNlcm5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ2JhZCBvciBtaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnBhc3N3b3JkKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAodGhpcy5kYXRhLmF1dGhEYXRhICYmICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkgfHxcbiAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJylcbiAgKSB7XG4gICAgLy8gSGFuZGxlIHNhdmluZyBhdXRoRGF0YSB0byB7fSBvciBpZiBhdXRoRGF0YSBkb2Vzbid0IGV4aXN0XG4gICAgcmV0dXJuO1xuICB9IGVsc2UgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICAvLyBIYW5kbGUgc2F2aW5nIGF1dGhEYXRhIHRvIG51bGxcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICApO1xuICB9XG5cbiAgdmFyIGF1dGhEYXRhID0gdGhpcy5kYXRhLmF1dGhEYXRhO1xuICB2YXIgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBpZiAocHJvdmlkZXJzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBjYW5IYW5kbGVBdXRoRGF0YSA9IHByb3ZpZGVycy5yZWR1Y2UoKGNhbkhhbmRsZSwgcHJvdmlkZXIpID0+IHtcbiAgICAgIHZhciBwcm92aWRlckF1dGhEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgdmFyIGhhc1Rva2VuID0gcHJvdmlkZXJBdXRoRGF0YSAmJiBwcm92aWRlckF1dGhEYXRhLmlkO1xuICAgICAgcmV0dXJuIGNhbkhhbmRsZSAmJiAoaGFzVG9rZW4gfHwgcHJvdmlkZXJBdXRoRGF0YSA9PSBudWxsKTtcbiAgICB9LCB0cnVlKTtcbiAgICBpZiAoY2FuSGFuZGxlQXV0aERhdGEpIHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhKGF1dGhEYXRhKTtcbiAgICB9XG4gIH1cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gZnVuY3Rpb24gKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHZhbGlkYXRpb25zID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLm1hcChwcm92aWRlciA9PiB7XG4gICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCB2YWxpZGF0ZUF1dGhEYXRhID0gdGhpcy5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICBjb25zdCBhdXRoUHJvdmlkZXIgPSAodGhpcy5jb25maWcuYXV0aCB8fCB7fSlbcHJvdmlkZXJdIHx8IHt9O1xuICAgIGlmIChhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PSBudWxsKSB7XG4gICAgICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgICAgIHVzYWdlOiBgYXV0aC4ke3Byb3ZpZGVyfWAsXG4gICAgICAgIHNvbHV0aW9uOiBgYXV0aC4ke3Byb3ZpZGVyfS5lbmFibGVkOiB0cnVlYCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAoIXZhbGlkYXRlQXV0aERhdGEgfHwgYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT09IGZhbHNlKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdmFsaWRhdGVBdXRoRGF0YShhdXRoRGF0YVtwcm92aWRlcl0pO1xuICB9KTtcbiAgcmV0dXJuIFByb21pc2UuYWxsKHZhbGlkYXRpb25zKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmluZFVzZXJzV2l0aEF1dGhEYXRhID0gZnVuY3Rpb24gKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0pIHtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9XG4gICAgICBjb25zdCBxdWVyeUtleSA9IGBhdXRoRGF0YS4ke3Byb3ZpZGVyfS5pZGA7XG4gICAgICBjb25zdCBxdWVyeSA9IHt9O1xuICAgICAgcXVlcnlbcXVlcnlLZXldID0gYXV0aERhdGFbcHJvdmlkZXJdLmlkO1xuICAgICAgbWVtby5wdXNoKHF1ZXJ5KTtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH0sIFtdKVxuICAgIC5maWx0ZXIocSA9PiB7XG4gICAgICByZXR1cm4gdHlwZW9mIHEgIT09ICd1bmRlZmluZWQnO1xuICAgIH0pO1xuXG4gIGxldCBmaW5kUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShbXSk7XG4gIGlmIChxdWVyeS5sZW5ndGggPiAwKSB7XG4gICAgZmluZFByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB7ICRvcjogcXVlcnkgfSwge30pO1xuICB9XG5cbiAgcmV0dXJuIGZpbmRQcm9taXNlO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uIChvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgbGV0IHJlc3VsdHM7XG4gIHJldHVybiB0aGlzLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShhdXRoRGF0YSkudGhlbihhc3luYyByID0+IHtcbiAgICByZXN1bHRzID0gdGhpcy5maWx0ZXJlZE9iamVjdHNCeUFDTChyKTtcblxuICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmpvaW4oJywnKTtcblxuICAgICAgY29uc3QgdXNlclJlc3VsdCA9IHJlc3VsdHNbMF07XG4gICAgICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgICAgIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb25zdCB1c2VyQXV0aERhdGEgPSB1c2VyUmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgaWYgKCFfLmlzRXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyQXV0aERhdGEpKSB7XG4gICAgICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXSA9IHByb3ZpZGVyRGF0YTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBjb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmxlbmd0aCAhPT0gMDtcbiAgICAgIGxldCB1c2VySWQ7XG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIHVzZXJJZCA9IHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuYXV0aCAmJiB0aGlzLmF1dGgudXNlciAmJiB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgICAgICB1c2VySWQgPSB0aGlzLmF1dGgudXNlci5pZDtcbiAgICAgIH1cbiAgICAgIGlmICghdXNlcklkIHx8IHVzZXJJZCA9PT0gdXNlclJlc3VsdC5vYmplY3RJZCkge1xuICAgICAgICAvLyBubyB1c2VyIG1ha2luZyB0aGUgY2FsbFxuICAgICAgICAvLyBPUiB0aGUgdXNlciBtYWtpbmcgdGhlIGNhbGwgaXMgdGhlIHJpZ2h0IG9uZVxuICAgICAgICAvLyBMb2dpbiB3aXRoIGF1dGggZGF0YVxuICAgICAgICBkZWxldGUgcmVzdWx0c1swXS5wYXNzd29yZDtcblxuICAgICAgICAvLyBuZWVkIHRvIHNldCB0aGUgb2JqZWN0SWQgZmlyc3Qgb3RoZXJ3aXNlIGxvY2F0aW9uIGhhcyB0cmFpbGluZyB1bmRlZmluZWRcbiAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gdXNlclJlc3VsdC5vYmplY3RJZDtcblxuICAgICAgICBpZiAoIXRoaXMucXVlcnkgfHwgIXRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICAvLyB0aGlzIGEgbG9naW4gY2FsbCwgbm8gdXNlcklkIHBhc3NlZFxuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgICByZXNwb25zZTogdXNlclJlc3VsdCxcbiAgICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgICAgfTtcbiAgICAgICAgICAvLyBSdW4gYmVmb3JlTG9naW4gaG9vayBiZWZvcmUgc3RvcmluZyBhbnkgdXBkYXRlc1xuICAgICAgICAgIC8vIHRvIGF1dGhEYXRhIG9uIHRoZSBkYjsgY2hhbmdlcyB0byB1c2VyUmVzdWx0XG4gICAgICAgICAgLy8gd2lsbCBiZSBpZ25vcmVkLlxuICAgICAgICAgIGF3YWl0IHRoaXMucnVuQmVmb3JlTG9naW5UcmlnZ2VyKGRlZXBjb3B5KHVzZXJSZXN1bHQpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHdlIGRpZG4ndCBjaGFuZ2UgdGhlIGF1dGggZGF0YSwganVzdCBrZWVwIGdvaW5nXG4gICAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIFdlIGhhdmUgYXV0aERhdGEgdGhhdCBpcyB1cGRhdGVkIG9uIGxvZ2luXG4gICAgICAgIC8vIHRoYXQgY2FuIGhhcHBlbiB3aGVuIHRva2VuIGFyZSByZWZyZXNoZWQsXG4gICAgICAgIC8vIFdlIHNob3VsZCB1cGRhdGUgdGhlIHRva2VuIGFuZCBsZXQgdGhlIHVzZXIgaW5cbiAgICAgICAgLy8gV2Ugc2hvdWxkIG9ubHkgY2hlY2sgdGhlIG11dGF0ZWQga2V5c1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24obXV0YXRlZEF1dGhEYXRhKS50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAvLyBJRiB3ZSBoYXZlIGEgcmVzcG9uc2UsIHdlJ2xsIHNraXAgdGhlIGRhdGFiYXNlIG9wZXJhdGlvbiAvIGJlZm9yZVNhdmUgLyBhZnRlclNhdmUgZXRjLi4uXG4gICAgICAgICAgLy8gd2UgbmVlZCB0byBzZXQgaXQgdXAgdGhlcmUuXG4gICAgICAgICAgLy8gV2UgYXJlIHN1cHBvc2VkIHRvIGhhdmUgYSByZXNwb25zZSBvbmx5IG9uIExPR0lOIHdpdGggYXV0aERhdGEsIHNvIHdlIHNraXAgdGhvc2VcbiAgICAgICAgICAvLyBJZiB3ZSdyZSBub3QgbG9nZ2luZyBpbiwgYnV0IGp1c3QgdXBkYXRpbmcgdGhlIGN1cnJlbnQgdXNlciwgd2UgY2FuIHNhZmVseSBza2lwIHRoYXQgcGFydFxuICAgICAgICAgIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgICAgICAgICAvLyBBc3NpZ24gdGhlIG5ldyBhdXRoRGF0YSBpbiB0aGUgcmVzcG9uc2VcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFbcHJvdmlkZXJdID0gbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3RlcidcbiAgICAgICAgICAgIC8vIEp1c3QgdXBkYXRlIHRoZSBhdXRoRGF0YSBwYXJ0XG4gICAgICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH0sXG4gICAgICAgICAgICAgIHsgYXV0aERhdGE6IG11dGF0ZWRBdXRoRGF0YSB9LFxuICAgICAgICAgICAgICB7fVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmICh1c2VySWQpIHtcbiAgICAgICAgLy8gVHJ5aW5nIHRvIHVwZGF0ZSBhdXRoIGRhdGEgYnV0IHVzZXJzXG4gICAgICAgIC8vIGFyZSBkaWZmZXJlbnRcbiAgICAgICAgaWYgKHVzZXJSZXN1bHQub2JqZWN0SWQgIT09IHVzZXJJZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vIGF1dGggZGF0YSB3YXMgbXV0YXRlZCwganVzdCBrZWVwIGdvaW5nXG4gICAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihhdXRoRGF0YSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIC8vIE1vcmUgdGhhbiAxIHVzZXIgd2l0aCB0aGUgcGFzc2VkIGlkJ3NcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC5pc01hc3RlciAmJiAnZW1haWxWZXJpZmllZCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgZXJyb3IgPSBgQ2xpZW50cyBhcmVuJ3QgYWxsb3dlZCB0byBtYW51YWxseSB1cGRhdGUgZW1haWwgdmVyaWZpY2F0aW9uLmA7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sIGVycm9yKTtcbiAgfVxuXG4gIC8vIERvIG5vdCBjbGVhbnVwIHNlc3Npb24gaWYgb2JqZWN0SWQgaXMgbm90IHNldFxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLm9iamVjdElkKCkpIHtcbiAgICAvLyBJZiB3ZSdyZSB1cGRhdGluZyBhIF9Vc2VyIG9iamVjdCwgd2UgbmVlZCB0byBjbGVhciBvdXQgdGhlIGNhY2hlIGZvciB0aGF0IHVzZXIuIEZpbmQgYWxsIHRoZWlyXG4gICAgLy8gc2Vzc2lvbiB0b2tlbnMsIGFuZCByZW1vdmUgdGhlbSBmcm9tIHRoZSBjYWNoZS5cbiAgICBwcm9taXNlID0gbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH0pXG4gICAgICAuZXhlY3V0ZSgpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgcmVzdWx0cy5yZXN1bHRzLmZvckVhY2goc2Vzc2lvbiA9PlxuICAgICAgICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uLnNlc3Npb25Ub2tlbilcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBUcmFuc2Zvcm0gdGhlIHBhc3N3b3JkXG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gaWdub3JlIG9ubHkgaWYgdW5kZWZpbmVkLiBzaG91bGQgcHJvY2VlZCBpZiBlbXB0eSAoJycpXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gPSB0cnVlO1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIG5ldyBzZXNzaW9uIG9ubHkgaWYgdGhlIHVzZXIgcmVxdWVzdGVkXG4gICAgICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3koKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmhhc2godGhpcy5kYXRhLnBhc3N3b3JkKS50aGVuKGhhc2hlZFBhc3N3b3JkID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCA9IGhhc2hlZFBhc3N3b3JkO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVVc2VyTmFtZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlRW1haWwoKTtcbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlVXNlck5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIGZvciB1c2VybmFtZSB1bmlxdWVuZXNzXG4gIGlmICghdGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICB0aGlzLmRhdGEudXNlcm5hbWUgPSBjcnlwdG9VdGlscy5yYW5kb21TdHJpbmcoMjUpO1xuICAgICAgdGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvKlxuICAgIFVzZXJuYW1lcyBzaG91bGQgYmUgdW5pcXVlIHdoZW4gY29tcGFyZWQgY2FzZSBpbnNlbnNpdGl2ZWx5XG5cbiAgICBVc2VycyBzaG91bGQgYmUgYWJsZSB0byBtYWtlIGNhc2Ugc2Vuc2l0aXZlIHVzZXJuYW1lcyBhbmRcbiAgICBsb2dpbiB1c2luZyB0aGUgY2FzZSB0aGV5IGVudGVyZWQuICBJLmUuICdTbm9vcHknIHNob3VsZCBwcmVjbHVkZVxuICAgICdzbm9vcHknIGFzIGEgdmFsaWQgdXNlcm5hbWUuXG4gICovXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH0pO1xufTtcblxuLypcbiAgQXMgd2l0aCB1c2VybmFtZXMsIFBhcnNlIHNob3VsZCBub3QgYWxsb3cgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIG9mIGVtYWlsLlxuICB1bmxpa2Ugd2l0aCB1c2VybmFtZXMgKHdoaWNoIGNhbiBoYXZlIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBpbiB0aGUgY2FzZSBvZlxuICBhdXRoIGFkYXB0ZXJzKSwgZW1haWxzIHNob3VsZCBuZXZlciBoYXZlIGEgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb24uXG5cbiAgVGhpcyBiZWhhdmlvciBjYW4gYmUgZW5mb3JjZWQgdGhyb3VnaCBhIHByb3Blcmx5IGNvbmZpZ3VyZWQgaW5kZXggc2VlOlxuICBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtY2FzZS1pbnNlbnNpdGl2ZS8jY3JlYXRlLWEtY2FzZS1pbnNlbnNpdGl2ZS1pbmRleFxuICB3aGljaCBjb3VsZCBiZSBpbXBsZW1lbnRlZCBpbnN0ZWFkIG9mIHRoaXMgY29kZSBiYXNlZCB2YWxpZGF0aW9uLlxuXG4gIEdpdmVuIHRoYXQgdGhpcyBsb29rdXAgc2hvdWxkIGJlIGEgcmVsYXRpdmVseSBsb3cgdXNlIGNhc2UgYW5kIHRoYXQgdGhlIGNhc2Ugc2Vuc2l0aXZlXG4gIHVuaXF1ZSBpbmRleCB3aWxsIGJlIHVzZWQgYnkgdGhlIGRiIGZvciB0aGUgcXVlcnksIHRoaXMgaXMgYW4gYWRlcXVhdGUgc29sdXRpb24uXG4qL1xuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVFbWFpbCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwgfHwgdGhpcy5kYXRhLmVtYWlsLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFZhbGlkYXRlIGJhc2ljIGVtYWlsIGFkZHJlc3MgZm9ybWF0XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsLm1hdGNoKC9eLitALiskLykpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLCAnRW1haWwgYWRkcmVzcyBmb3JtYXQgaXMgaW52YWxpZC4nKVxuICAgICk7XG4gIH1cbiAgLy8gQ2FzZSBpbnNlbnNpdGl2ZSBtYXRjaCwgc2VlIG5vdGUgYWJvdmUgZnVuY3Rpb24uXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLmRhdGEuYXV0aERhdGEgfHxcbiAgICAgICAgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoIHx8XG4gICAgICAgIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCA9PT0gMSAmJlxuICAgICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSlbMF0gPT09ICdhbm9ueW1vdXMnKVxuICAgICAgKSB7XG4gICAgICAgIC8vIFdlIHVwZGF0ZWQgdGhlIGVtYWlsLCBzZW5kIGEgbmV3IHZhbGlkYXRpb25cbiAgICAgICAgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSA9IHRydWU7XG4gICAgICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNldEVtYWlsVmVyaWZ5VG9rZW4odGhpcy5kYXRhKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kpIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMoKS50aGVuKCgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkoKTtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayBpZiB0aGUgcGFzc3dvcmQgY29uZm9ybXMgdG8gdGhlIGRlZmluZWQgcGFzc3dvcmQgcG9saWN5IGlmIGNvbmZpZ3VyZWRcbiAgLy8gSWYgd2Ugc3BlY2lmaWVkIGEgY3VzdG9tIGVycm9yIGluIG91ciBjb25maWd1cmF0aW9uIHVzZSBpdC5cbiAgLy8gRXhhbXBsZTogXCJQYXNzd29yZHMgbXVzdCBpbmNsdWRlIGEgQ2FwaXRhbCBMZXR0ZXIsIExvd2VyY2FzZSBMZXR0ZXIsIGFuZCBhIG51bWJlci5cIlxuICAvL1xuICAvLyBUaGlzIGlzIGVzcGVjaWFsbHkgdXNlZnVsIG9uIHRoZSBnZW5lcmljIFwicGFzc3dvcmQgcmVzZXRcIiBwYWdlLFxuICAvLyBhcyBpdCBhbGxvd3MgdGhlIHByb2dyYW1tZXIgdG8gY29tbXVuaWNhdGUgc3BlY2lmaWMgcmVxdWlyZW1lbnRzIGluc3RlYWQgb2Y6XG4gIC8vIGEuIG1ha2luZyB0aGUgdXNlciBndWVzcyB3aGF0cyB3cm9uZ1xuICAvLyBiLiBtYWtpbmcgYSBjdXN0b20gcGFzc3dvcmQgcmVzZXQgcGFnZSB0aGF0IHNob3dzIHRoZSByZXF1aXJlbWVudHNcbiAgY29uc3QgcG9saWN5RXJyb3IgPSB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA/IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgIDogJ1Bhc3N3b3JkIGRvZXMgbm90IG1lZXQgdGhlIFBhc3N3b3JkIFBvbGljeSByZXF1aXJlbWVudHMuJztcbiAgY29uc3QgY29udGFpbnNVc2VybmFtZUVycm9yID0gJ1Bhc3N3b3JkIGNhbm5vdCBjb250YWluIHlvdXIgdXNlcm5hbWUuJztcblxuICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBtZWV0cyB0aGUgcGFzc3dvcmQgc3RyZW5ndGggcmVxdWlyZW1lbnRzXG4gIGlmIChcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IodGhpcy5kYXRhLnBhc3N3b3JkKSkgfHxcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayh0aGlzLmRhdGEucGFzc3dvcmQpKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIHBvbGljeUVycm9yKSk7XG4gIH1cblxuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGNvbnRhaW4gdXNlcm5hbWVcbiAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSA9PT0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICAgIC8vIHVzZXJuYW1lIGlzIG5vdCBwYXNzZWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YodGhpcy5kYXRhLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcikpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyByZXRyaWV2ZSB0aGUgVXNlciBvYmplY3QgdXNpbmcgb2JqZWN0SWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHJlc3VsdHNbMF0udXNlcm5hbWUpID49IDApXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcilcbiAgICAgICAgICApO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgaXMgcmVwZWF0aW5nIGZyb20gc3BlY2lmaWVkIGhpc3RvcnlcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAxXG4gICAgICAgICAgKTtcbiAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgIGNvbnN0IG5ld1Bhc3N3b3JkID0gdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICAvLyBjb21wYXJlIHRoZSBuZXcgcGFzc3dvcmQgaGFzaCB3aXRoIGFsbCBvbGQgcGFzc3dvcmQgaGFzaGVzXG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gb2xkUGFzc3dvcmRzLm1hcChmdW5jdGlvbiAoaGFzaCkge1xuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKG5ld1Bhc3N3b3JkLCBoYXNoKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KVxuICAgICAgICAgICAgICAvLyByZWplY3QgaWYgdGhlcmUgaXMgYSBtYXRjaFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoJ1JFUEVBVF9QQVNTV09SRCcpO1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gd2FpdCBmb3IgYWxsIGNvbXBhcmlzb25zIHRvIGNvbXBsZXRlXG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIgPT09ICdSRVBFQVRfUEFTU1dPUkQnKVxuICAgICAgICAgICAgICAvLyBhIG1hdGNoIHdhcyBmb3VuZFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgICAgIGBOZXcgcGFzc3dvcmQgc2hvdWxkIG5vdCBiZSB0aGUgc2FtZSBhcyBsYXN0ICR7dGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5fSBwYXNzd29yZHMuYFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBzZXNzaW9uIGZvciB1cGRhdGluZyB1c2VyICh0aGlzLnF1ZXJ5IGlzIHNldCkgdW5sZXNzIGF1dGhEYXRhIGV4aXN0c1xuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIG5ldyBzZXNzaW9uVG9rZW4gaWYgbGlua2luZyB2aWEgc2Vzc2lvblRva2VuXG4gIGlmICh0aGlzLmF1dGgudXNlciAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKFxuICAgICF0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddICYmIC8vIHNpZ251cCBjYWxsLCB3aXRoXG4gICAgdGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJiAvLyBubyBsb2dpbiB3aXRob3V0IHZlcmlmaWNhdGlvblxuICAgIHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHNcbiAgKSB7XG4gICAgLy8gdmVyaWZpY2F0aW9uIGlzIG9uXG4gICAgcmV0dXJuOyAvLyBkbyBub3QgY3JlYXRlIHRoZSBzZXNzaW9uIHRva2VuIGluIHRoYXQgY2FzZSFcbiAgfVxuICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddID09IG51bGwgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkuam9pbignLCcpO1xuICB9XG5cbiAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICB1c2VySWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgYWN0aW9uOiB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddID8gJ2xvZ2luJyA6ICdzaWdudXAnLFxuICAgICAgYXV0aFByb3ZpZGVyOiB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddIHx8ICdwYXNzd29yZCcsXG4gICAgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICB9KTtcblxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG4gIH1cblxuICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpO1xufTtcblxuUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIEF1dGgubWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIG51bGwsIHNlc3Npb25EYXRhKS5leGVjdXRlKCksXG4gIH07XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5xdWVyeSA9PT0gbnVsbCkge1xuICAgIC8vIG51bGwgcXVlcnkgbWVhbnMgY3JlYXRlXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCdwYXNzd29yZCcgaW4gdGhpcy5kYXRhIHx8ICdlbWFpbCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgYWRkT3BzID0ge1xuICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICB9O1xuICAgIHRoaXMuZGF0YSA9IE9iamVjdC5hc3NpZ24odGhpcy5kYXRhLCBhZGRPcHMpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIE9ubHkgZm9yIF9TZXNzaW9uLCBhbmQgYXQgY3JlYXRpb24gdGltZVxuICBpZiAodGhpcy5jbGFzc05hbWUgIT0gJ19TZXNzaW9uJyB8fCB0aGlzLnF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERlc3Ryb3kgdGhlIHNlc3Npb25zIGluICdCYWNrZ3JvdW5kJ1xuICBjb25zdCB7IHVzZXIsIGluc3RhbGxhdGlvbklkLCBzZXNzaW9uVG9rZW4gfSA9IHRoaXMuZGF0YTtcbiAgaWYgKCF1c2VyIHx8ICFpbnN0YWxsYXRpb25JZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXVzZXIub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveShcbiAgICAnX1Nlc3Npb24nLFxuICAgIHtcbiAgICAgIHVzZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHNlc3Npb25Ub2tlbjogeyAkbmU6IHNlc3Npb25Ub2tlbiB9LFxuICAgIH0sXG4gICAge30sXG4gICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgKTtcbn07XG5cbi8vIEhhbmRsZXMgYW55IGZvbGxvd3VwIGxvZ2ljXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUZvbGxvd3VwID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddICYmIHRoaXMuY29uZmlnLnJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQpIHtcbiAgICB2YXIgc2Vzc2lvblF1ZXJ5ID0ge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXTtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5kZXN0cm95KCdfU2Vzc2lvbicsIHNlc3Npb25RdWVyeSlcbiAgICAgIC50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKS50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXTtcbiAgICAvLyBGaXJlIGFuZCBmb3JnZXQhXG4gICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHRoaXMuZGF0YSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX1Nlc3Npb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBfU2Vzc2lvbiBvYmplY3QuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZVNlc3Npb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGgudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gcmVxdWlyZWQuJyk7XG4gIH1cblxuICAvLyBUT0RPOiBWZXJpZnkgcHJvcGVyIGVycm9yIHRvIHRocm93XG4gIGlmICh0aGlzLmRhdGEuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdDYW5ub3Qgc2V0ICcgKyAnQUNMIG9uIGEgU2Vzc2lvbi4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgdGhpcy5kYXRhLnVzZXIub2JqZWN0SWQgIT0gdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgY29uc3QgYWRkaXRpb25hbFNlc3Npb25EYXRhID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMuZGF0YSkge1xuICAgICAgaWYgKGtleSA9PT0gJ29iamVjdElkJyB8fCBrZXkgPT09ICd1c2VyJykge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YVtrZXldID0gdGhpcy5kYXRhW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdjcmVhdGUnLFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSxcbiAgICB9KTtcblxuICAgIHJldHVybiBjcmVhdGVTZXNzaW9uKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5yZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRXJyb3IgY3JlYXRpbmcgc2Vzc2lvbi4nKTtcbiAgICAgIH1cbiAgICAgIHNlc3Npb25EYXRhWydvYmplY3RJZCddID0gcmVzdWx0cy5yZXNwb25zZVsnb2JqZWN0SWQnXTtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICBsb2NhdGlvbjogcmVzdWx0cy5sb2NhdGlvbixcbiAgICAgICAgcmVzcG9uc2U6IHNlc3Npb25EYXRhLFxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX0luc3RhbGxhdGlvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIGluc3RhbGxhdGlvbiBvYmplY3QuXG4vLyBJZiBhbiBpbnN0YWxsYXRpb24gaXMgZm91bmQsIHRoaXMgY2FuIG11dGF0ZSB0aGlzLnF1ZXJ5IGFuZCB0dXJuIGEgY3JlYXRlXG4vLyBpbnRvIGFuIHVwZGF0ZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlSW5zdGFsbGF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19JbnN0YWxsYXRpb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKFxuICAgICF0aGlzLnF1ZXJ5ICYmXG4gICAgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAhdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIDEzNSxcbiAgICAgICdhdCBsZWFzdCBvbmUgSUQgZmllbGQgKGRldmljZVRva2VuLCBpbnN0YWxsYXRpb25JZCkgJyArICdtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbidcbiAgICApO1xuICB9XG5cbiAgLy8gSWYgdGhlIGRldmljZSB0b2tlbiBpcyA2NCBjaGFyYWN0ZXJzIGxvbmcsIHdlIGFzc3VtZSBpdCBpcyBmb3IgaU9TXG4gIC8vIGFuZCBsb3dlcmNhc2UgaXQuXG4gIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgdGhpcy5kYXRhLmRldmljZVRva2VuLmxlbmd0aCA9PSA2NCkge1xuICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiA9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbi50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gV2UgbG93ZXJjYXNlIHRoZSBpbnN0YWxsYXRpb25JZCBpZiBwcmVzZW50XG4gIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIGxldCBpbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZDtcblxuICAvLyBJZiBkYXRhLmluc3RhbGxhdGlvbklkIGlzIG5vdCBzZXQgYW5kIHdlJ3JlIG5vdCBtYXN0ZXIsIHdlIGNhbiBsb29rdXAgaW4gYXV0aFxuICBpZiAoIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIGluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFVwZGF0aW5nIF9JbnN0YWxsYXRpb24gYnV0IG5vdCB1cGRhdGluZyBhbnl0aGluZyBjcml0aWNhbFxuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmICFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIHZhciBpZE1hdGNoOyAvLyBXaWxsIGJlIGEgbWF0Y2ggb24gZWl0aGVyIG9iamVjdElkIG9yIGluc3RhbGxhdGlvbklkXG4gIHZhciBvYmplY3RJZE1hdGNoO1xuICB2YXIgaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgdmFyIGRldmljZVRva2VuTWF0Y2hlcyA9IFtdO1xuXG4gIC8vIEluc3RlYWQgb2YgaXNzdWluZyAzIHJlYWRzLCBsZXQncyBkbyBpdCB3aXRoIG9uZSBPUi5cbiAgY29uc3Qgb3JRdWVyaWVzID0gW107XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBvYmplY3RJZDogdGhpcy5xdWVyeS5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgIG9yUXVlcmllcy5wdXNoKHsgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbiB9KTtcbiAgfVxuXG4gIGlmIChvclF1ZXJpZXMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlID0gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAnX0luc3RhbGxhdGlvbicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IG9yUXVlcmllcyxcbiAgICAgICAgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHJlc3VsdC5vYmplY3RJZCA9PSB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgb2JqZWN0SWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0Lmluc3RhbGxhdGlvbklkID09IGluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0LmRldmljZVRva2VuID09IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBTYW5pdHkgY2hlY2tzIHdoZW4gcnVubmluZyBhIHF1ZXJ5XG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmICghb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZCBmb3IgdXBkYXRlLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICE9PSBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdpbnN0YWxsYXRpb25JZCBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgICFvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUb2tlbiBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVHlwZVxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnZGV2aWNlVHlwZSBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gb2JqZWN0SWRNYXRjaDtcbiAgICAgIH1cblxuICAgICAgaWYgKGluc3RhbGxhdGlvbklkICYmIGluc3RhbGxhdGlvbklkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IGluc3RhbGxhdGlvbklkTWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBuZWVkIHRvIHNwZWNpZnkgZGV2aWNlVHlwZSBvbmx5IGlmIGl0J3MgbmV3XG4gICAgICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5kZXZpY2VUeXBlICYmICFpZE1hdGNoKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzUsICdkZXZpY2VUeXBlIG11c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJyk7XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAoIWlkTWF0Y2gpIHtcbiAgICAgICAgaWYgKCFkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJlxuICAgICAgICAgICghZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddIHx8ICFpbnN0YWxsYXRpb25JZClcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gU2luZ2xlIG1hdGNoIG9uIGRldmljZSB0b2tlbiBidXQgbm9uZSBvbiBpbnN0YWxsYXRpb25JZCwgYW5kIGVpdGhlclxuICAgICAgICAgIC8vIHRoZSBwYXNzZWQgb2JqZWN0IG9yIHRoZSBtYXRjaCBpcyBtaXNzaW5nIGFuIGluc3RhbGxhdGlvbklkLCBzbyB3ZVxuICAgICAgICAgIC8vIGNhbiBqdXN0IHJldHVybiB0aGUgbWF0Y2guXG4gICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgfSBlbHNlIGlmICghdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTMyLFxuICAgICAgICAgICAgJ011c3Qgc3BlY2lmeSBpbnN0YWxsYXRpb25JZCB3aGVuIGRldmljZVRva2VuICcgK1xuICAgICAgICAgICAgICAnbWF0Y2hlcyBtdWx0aXBsZSBJbnN0YWxsYXRpb24gb2JqZWN0cydcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE11bHRpcGxlIGRldmljZSB0b2tlbiBtYXRjaGVzIGFuZCB3ZSBzcGVjaWZpZWQgYW4gaW5zdGFsbGF0aW9uIElELFxuICAgICAgICAgIC8vIG9yIGEgc2luZ2xlIG1hdGNoIHdoZXJlIGJvdGggdGhlIHBhc3NlZCBhbmQgbWF0Y2hpbmcgb2JqZWN0cyBoYXZlXG4gICAgICAgICAgLy8gYW4gaW5zdGFsbGF0aW9uIElELiBUcnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2hcbiAgICAgICAgICAvLyB0aGUgZGV2aWNlVG9rZW4sIGFuZCByZXR1cm4gbmlsIHRvIHNpZ25hbCB0aGF0IGEgbmV3IG9iamVjdCBzaG91bGRcbiAgICAgICAgICAvLyBiZSBjcmVhdGVkLlxuICAgICAgICAgIHZhciBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICBpbnN0YWxsYXRpb25JZDoge1xuICAgICAgICAgICAgICAkbmU6IGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiYgIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSkge1xuICAgICAgICAgIC8vIEV4YWN0bHkgb25lIGRldmljZSB0b2tlbiBtYXRjaCBhbmQgaXQgZG9lc24ndCBoYXZlIGFuIGluc3RhbGxhdGlvblxuICAgICAgICAgIC8vIElELiBUaGlzIGlzIHRoZSBvbmUgY2FzZSB3aGVyZSB3ZSB3YW50IHRvIG1lcmdlIHdpdGggdGhlIGV4aXN0aW5nXG4gICAgICAgICAgLy8gb2JqZWN0LlxuICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0geyBvYmplY3RJZDogaWRNYXRjaC5vYmplY3RJZCB9O1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgICAgLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZFxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIGlkTWF0Y2guZGV2aWNlVG9rZW4gIT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgICAvLyBXZSdyZSBzZXR0aW5nIHRoZSBkZXZpY2UgdG9rZW4gb24gYW4gZXhpc3RpbmcgaW5zdGFsbGF0aW9uLCBzb1xuICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIHRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaCB0aGlzXG4gICAgICAgICAgICAvLyBkZXZpY2UgdG9rZW4uXG4gICAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyBXZSBoYXZlIGEgdW5pcXVlIGluc3RhbGwgSWQsIHVzZSB0aGF0IHRvIHByZXNlcnZlXG4gICAgICAgICAgICAvLyB0aGUgaW50ZXJlc3RpbmcgaW5zdGFsbGF0aW9uXG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydpbnN0YWxsYXRpb25JZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCA9PSB0aGlzLmRhdGEub2JqZWN0SWRcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyB3ZSBwYXNzZWQgYW4gb2JqZWN0SWQsIHByZXNlcnZlIHRoYXQgaW5zdGFsYXRpb25cbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ29iamVjdElkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiBpZE1hdGNoLm9iamVjdElkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gV2hhdCB0byBkbyBoZXJlPyBjYW4ndCByZWFsbHkgY2xlYW4gdXAgZXZlcnl0aGluZy4uLlxuICAgICAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJbiBub24tbWVyZ2Ugc2NlbmFyaW9zLCBqdXN0IHJldHVybiB0aGUgaW5zdGFsbGF0aW9uIG1hdGNoIGlkXG4gICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKG9iaklkID0+IHtcbiAgICAgIGlmIChvYmpJZCkge1xuICAgICAgICB0aGlzLnF1ZXJ5ID0geyBvYmplY3RJZDogb2JqSWQgfTtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICB9XG4gICAgICAvLyBUT0RPOiBWYWxpZGF0ZSBvcHMgKGFkZC9yZW1vdmUgb24gY2hhbm5lbHMsICRpbmMgb24gYmFkZ2UsIGV0Yy4pXG4gICAgfSk7XG4gIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8gSWYgd2Ugc2hvcnQtY2lyY3VpdGVkIHRoZSBvYmplY3QgcmVzcG9uc2UgLSB0aGVuIHdlIG5lZWQgdG8gbWFrZSBzdXJlIHdlIGV4cGFuZCBhbGwgdGhlIGZpbGVzLFxuLy8gc2luY2UgdGhpcyBtaWdodCBub3QgaGF2ZSBhIHF1ZXJ5LCBtZWFuaW5nIGl0IHdvbid0IHJldHVybiB0aGUgZnVsbCByZXN1bHQgYmFjay5cbi8vIFRPRE86IChubHV0c2Vua28pIFRoaXMgc2hvdWxkIGRpZSB3aGVuIHdlIG1vdmUgdG8gcGVyLWNsYXNzIGJhc2VkIGNvbnRyb2xsZXJzIG9uIF9TZXNzaW9uL19Vc2VyXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayB3aGV0aGVyIHdlIGhhdmUgYSBzaG9ydC1jaXJjdWl0ZWQgcmVzcG9uc2UgLSBvbmx5IHRoZW4gcnVuIGV4cGFuc2lvbi5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5EYXRhYmFzZU9wZXJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUm9sZScpIHtcbiAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIucm9sZS5jbGVhcigpO1xuICAgIGlmICh0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyKSB7XG4gICAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLmNsZWFyQ2FjaGVkUm9sZXModGhpcy5hdXRoLnVzZXIpO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiB0aGlzLnF1ZXJ5ICYmIHRoaXMuYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuU0VTU0lPTl9NSVNTSU5HLFxuICAgICAgYENhbm5vdCBtb2RpZnkgdXNlciAke3RoaXMucXVlcnkub2JqZWN0SWR9LmBcbiAgICApO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1Byb2R1Y3QnICYmIHRoaXMuZGF0YS5kb3dubG9hZCkge1xuICAgIHRoaXMuZGF0YS5kb3dubG9hZE5hbWUgPSB0aGlzLmRhdGEuZG93bmxvYWQubmFtZTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBiZXR0ZXIgZGV0ZWN0aW9uIGZvciBBQ0wsIGVuc3VyaW5nIGEgdXNlciBjYW4ndCBiZSBsb2NrZWQgZnJvbVxuICAvLyAgICAgICB0aGVpciBvd24gdXNlciByZWNvcmQuXG4gIGlmICh0aGlzLmRhdGEuQUNMICYmIHRoaXMuZGF0YS5BQ0xbJyp1bnJlc29sdmVkJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9BQ0wsICdJbnZhbGlkIEFDTC4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgLy8gRm9yY2UgdGhlIHVzZXIgdG8gbm90IGxvY2tvdXRcbiAgICAvLyBNYXRjaGVkIHdpdGggcGFyc2UuY29tXG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5hdXRoLmlzTWFzdGVyICE9PSB0cnVlKSB7XG4gICAgICB0aGlzLmRhdGEuQUNMW3RoaXMucXVlcnkub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgIH1cbiAgICAvLyB1cGRhdGUgcGFzc3dvcmQgdGltZXN0YW1wIGlmIHVzZXIgcGFzc3dvcmQgaXMgYmVpbmcgY2hhbmdlZFxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgKSB7XG4gICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgIH1cbiAgICAvLyBJZ25vcmUgY3JlYXRlZEF0IHdoZW4gdXBkYXRlXG4gICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG5cbiAgICBsZXQgZGVmZXIgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAvLyBpZiBwYXNzd29yZCBoaXN0b3J5IGlzIGVuYWJsZWQgdGhlbiBzYXZlIHRoZSBjdXJyZW50IHBhc3N3b3JkIHRvIGhpc3RvcnlcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICApIHtcbiAgICAgIGRlZmVyID0gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH1cbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvL24tMSBwYXNzd29yZHMgZ28gaW50byBoaXN0b3J5IGluY2x1ZGluZyBsYXN0IHBhc3N3b3JkXG4gICAgICAgICAgd2hpbGUgKFxuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLmxlbmd0aCA+IE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0geyByZXNwb25zZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTZXQgdGhlIGRlZmF1bHQgQUNMIGFuZCBwYXNzd29yZCB0aW1lc3RhbXAgZm9yIHRoZSBuZXcgX1VzZXJcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIHZhciBBQ0wgPSB0aGlzLmRhdGEuQUNMO1xuICAgICAgLy8gZGVmYXVsdCBwdWJsaWMgci93IEFDTFxuICAgICAgaWYgKCFBQ0wpIHtcbiAgICAgICAgQUNMID0ge307XG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgICAgICAgIEFDTFsnKiddID0geyByZWFkOiB0cnVlLCB3cml0ZTogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gbWFrZSBzdXJlIHRoZSB1c2VyIGlzIG5vdCBsb2NrZWQgZG93blxuICAgICAgQUNMW3RoaXMuZGF0YS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgICB0aGlzLmRhdGEuQUNMID0gQUNMO1xuICAgICAgLy8gcGFzc3dvcmQgdGltZXN0YW1wIHRvIGJlIHVzZWQgd2hlbiBwYXNzd29yZCBleHBpcnkgcG9saWN5IGlzIGVuZm9yY2VkXG4gICAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSdW4gYSBjcmVhdGVcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5jcmVhdGUodGhpcy5jbGFzc05hbWUsIHRoaXMuZGF0YSwgdGhpcy5ydW5PcHRpb25zLCBmYWxzZSwgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBRdWljayBjaGVjaywgaWYgd2Ugd2VyZSBhYmxlIHRvIGluZmVyIHRoZSBkdXBsaWNhdGVkIGZpZWxkIG5hbWVcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnVzZXJJbmZvICYmIGVycm9yLnVzZXJJbmZvLmR1cGxpY2F0ZWRfZmllbGQgPT09ICd1c2VybmFtZScpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnVzZXJJbmZvICYmIGVycm9yLnVzZXJJbmZvLmR1cGxpY2F0ZWRfZmllbGQgPT09ICdlbWFpbCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGlzIHdhcyBhIGZhaWxlZCB1c2VyIGNyZWF0aW9uIGR1ZSB0byB1c2VybmFtZSBvciBlbWFpbCBhbHJlYWR5IHRha2VuLCB3ZSBuZWVkIHRvXG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgaXQgd2FzIHVzZXJuYW1lIG9yIGVtYWlsIGFuZCByZXR1cm4gdGhlIGFwcHJvcHJpYXRlIGVycm9yLlxuICAgICAgICAvLyBGYWxsYmFjayB0byB0aGUgb3JpZ2luYWwgbWV0aG9kXG4gICAgICAgIC8vIFRPRE86IFNlZSBpZiB3ZSBjYW4gbGF0ZXIgZG8gdGhpcyB3aXRob3V0IGFkZGl0aW9uYWwgcXVlcmllcyBieSB1c2luZyBuYW1lZCBpbmRleGVzLlxuICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAuZmluZChcbiAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgICAgIClcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLCBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9IH0sXG4gICAgICAgICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2Uub2JqZWN0SWQgPSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIHJlc3BvbnNlLmNyZWF0ZWRBdCA9IHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG5cbiAgICAgICAgaWYgKHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUpIHtcbiAgICAgICAgICByZXNwb25zZS51c2VybmFtZSA9IHRoaXMuZGF0YS51c2VybmFtZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICAgIHJlc3BvbnNlLFxuICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBub3RoaW5nIC0gZG9lc24ndCB3YWl0IGZvciB0aGUgdHJpZ2dlci5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQWZ0ZXJTYXZlVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlc3BvbnNlIHx8ICF0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYWZ0ZXJTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBjb25zdCBoYXNBZnRlclNhdmVIb29rID0gdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICApO1xuICBjb25zdCBoYXNMaXZlUXVlcnkgPSB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLmhhc0xpdmVRdWVyeSh0aGlzLmNsYXNzTmFtZSk7XG4gIGlmICghaGFzQWZ0ZXJTYXZlSG9vayAmJiAhaGFzTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuICB1cGRhdGVkT2JqZWN0Ll9oYW5kbGVTYXZlUmVzcG9uc2UodGhpcy5yZXNwb25zZS5yZXNwb25zZSwgdGhpcy5yZXNwb25zZS5zdGF0dXMgfHwgMjAwKTtcblxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAvLyBOb3RpZml5IExpdmVRdWVyeVNlcnZlciBpZiBwb3NzaWJsZVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hQ29udHJvbGxlci5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnModXBkYXRlZE9iamVjdC5jbGFzc05hbWUpO1xuICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIub25BZnRlclNhdmUoXG4gICAgICB1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHBlcm1zXG4gICAgKTtcbiAgfSk7XG5cbiAgLy8gUnVuIGFmdGVyU2F2ZSB0cmlnZ2VyXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1blRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgY29uc3QganNvblJldHVybmVkID0gcmVzdWx0ICYmICFyZXN1bHQuX3RvRnVsbEpTT047XG4gICAgICBpZiAoanNvblJldHVybmVkKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ09wcyA9IHt9O1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gcmVzdWx0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEoXG4gICAgICAgICAgKHJlc3VsdCB8fCB1cGRhdGVkT2JqZWN0KS50b0pTT04oKSxcbiAgICAgICAgICB0aGlzLmRhdGFcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBsb2dnZXIud2FybignYWZ0ZXJTYXZlIGNhdWdodCBhbiBlcnJvcicsIGVycik7XG4gICAgfSk7XG59O1xuXG4vLyBBIGhlbHBlciB0byBmaWd1cmUgb3V0IHdoYXQgbG9jYXRpb24gdGhpcyBvcGVyYXRpb24gaGFwcGVucyBhdC5cblJlc3RXcml0ZS5wcm90b3R5cGUubG9jYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBtaWRkbGUgPSB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyA/ICcvdXNlcnMvJyA6ICcvY2xhc3Nlcy8nICsgdGhpcy5jbGFzc05hbWUgKyAnLyc7XG4gIGNvbnN0IG1vdW50ID0gdGhpcy5jb25maWcubW91bnQgfHwgdGhpcy5jb25maWcuc2VydmVyVVJMO1xuICByZXR1cm4gbW91bnQgKyBtaWRkbGUgKyB0aGlzLmRhdGEub2JqZWN0SWQ7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgdGhlIG9iamVjdCBpZCBmb3IgdGhpcyBvcGVyYXRpb24uXG4vLyBCZWNhdXNlIGl0IGNvdWxkIGJlIGVpdGhlciBvbiB0aGUgcXVlcnkgb3Igb24gdGhlIGRhdGFcblJlc3RXcml0ZS5wcm90b3R5cGUub2JqZWN0SWQgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmRhdGEub2JqZWN0SWQgfHwgdGhpcy5xdWVyeS5vYmplY3RJZDtcbn07XG5cbi8vIFJldHVybnMgYSBjb3B5IG9mIHRoZSBkYXRhIGFuZCBkZWxldGUgYmFkIGtleXMgKF9hdXRoX2RhdGEsIF9oYXNoZWRfcGFzc3dvcmQuLi4pXG5SZXN0V3JpdGUucHJvdG90eXBlLnNhbml0aXplZERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGRhdGEgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZSgoZGF0YSwga2V5KSA9PiB7XG4gICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgIGlmICghL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcbiAgcmV0dXJuIFBhcnNlLl9kZWNvZGUodW5kZWZpbmVkLCBkYXRhKTtcbn07XG5cbi8vIFJldHVybnMgYW4gdXBkYXRlZCBjb3B5IG9mIHRoZSBvYmplY3RcblJlc3RXcml0ZS5wcm90b3R5cGUuYnVpbGRQYXJzZU9iamVjdHMgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSwgb2JqZWN0SWQ6IHRoaXMucXVlcnk/Lm9iamVjdElkIH07XG4gIGxldCBvcmlnaW5hbE9iamVjdDtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yaWdpbmFsT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgfVxuXG4gIGNvbnN0IGNsYXNzTmFtZSA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihleHRyYURhdGEpO1xuICBjb25zdCByZWFkT25seUF0dHJpYnV0ZXMgPSBjbGFzc05hbWUuY29uc3RydWN0b3IucmVhZE9ubHlBdHRyaWJ1dGVzXG4gICAgPyBjbGFzc05hbWUuY29uc3RydWN0b3IucmVhZE9ubHlBdHRyaWJ1dGVzKClcbiAgICA6IFtdO1xuICBpZiAoIXRoaXMub3JpZ2luYWxEYXRhKSB7XG4gICAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgICBleHRyYURhdGFbYXR0cmlidXRlXSA9IHRoaXMuZGF0YVthdHRyaWJ1dGVdO1xuICAgIH1cbiAgfVxuICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoZnVuY3Rpb24gKGRhdGEsIGtleSkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgaWYgKHR5cGVvZiBkYXRhW2tleV0uX19vcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFyZWFkT25seUF0dHJpYnV0ZXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KGtleSwgZGF0YVtrZXldKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gc3ViZG9jdW1lbnQga2V5IHdpdGggZG90IG5vdGF0aW9uIHsgJ3gueSc6IHYgfSA9PiB7ICd4JzogeyAneScgOiB2IH0gfSlcbiAgICAgICAgY29uc3Qgc3BsaXR0ZWRLZXkgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgcGFyZW50UHJvcCA9IHNwbGl0dGVkS2V5WzBdO1xuICAgICAgICBsZXQgcGFyZW50VmFsID0gdXBkYXRlZE9iamVjdC5nZXQocGFyZW50UHJvcCk7XG4gICAgICAgIGlmICh0eXBlb2YgcGFyZW50VmFsICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhcmVudFZhbCA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIHBhcmVudFZhbFtzcGxpdHRlZEtleVsxXV0gPSBkYXRhW2tleV07XG4gICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KHBhcmVudFByb3AsIHBhcmVudFZhbCk7XG4gICAgICB9XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgZGVlcGNvcHkodGhpcy5kYXRhKSk7XG5cbiAgY29uc3Qgc2FuaXRpemVkID0gdGhpcy5zYW5pdGl6ZWREYXRhKCk7XG4gIGZvciAoY29uc3QgYXR0cmlidXRlIG9mIHJlYWRPbmx5QXR0cmlidXRlcykge1xuICAgIGRlbGV0ZSBzYW5pdGl6ZWRbYXR0cmlidXRlXTtcbiAgfVxuICB1cGRhdGVkT2JqZWN0LnNldChzYW5pdGl6ZWQpO1xuICByZXR1cm4geyB1cGRhdGVkT2JqZWN0LCBvcmlnaW5hbE9iamVjdCB9O1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jbGVhblVzZXJBdXRoRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSAmJiB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IHVzZXIgPSB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlO1xuICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEgPSBmdW5jdGlvbiAocmVzcG9uc2UsIGRhdGEpIHtcbiAgY29uc3QgeyB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyh1cGRhdGVkT2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKSk7XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucGVuZGluZ09wcykge1xuICAgIGlmICghcGVuZGluZ1trZXldKSB7XG4gICAgICBkYXRhW2tleV0gPSB0aGlzLm9yaWdpbmFsRGF0YSA/IHRoaXMub3JpZ2luYWxEYXRhW2tleV0gOiB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHNraXBLZXlzID0gW1xuICAgICdvYmplY3RJZCcsXG4gICAgJ2NyZWF0ZWRBdCcsXG4gICAgJ3VwZGF0ZWRBdCcsXG4gICAgLi4uKHJlcXVpcmVkQ29sdW1ucy5yZWFkW3RoaXMuY2xhc3NOYW1lXSB8fCBbXSksXG4gIF07XG4gIGZvciAoY29uc3Qga2V5IGluIHJlc3BvbnNlKSB7XG4gICAgaWYgKHNraXBLZXlzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCB2YWx1ZSA9IHJlc3BvbnNlW2tleV07XG4gICAgaWYgKHZhbHVlID09IG51bGwgfHwgKHZhbHVlLl9fdHlwZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykgfHwgZGF0YVtrZXldID09PSB2YWx1ZSkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2tleV07XG4gICAgfVxuICB9XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IGNsaWVudFN1cHBvcnRzRGVsZXRlID0gQ2xpZW50U0RLLnN1cHBvcnRzRm9yd2FyZERlbGV0ZSh0aGlzLmNsaWVudFNESyk7XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQWNBOztB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