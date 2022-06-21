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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJVdGlscyIsImNyeXB0b1V0aWxzIiwicGFzc3dvcmRDcnlwdG8iLCJQYXJzZSIsInRyaWdnZXJzIiwiQ2xpZW50U0RLIiwiUmVzdFdyaXRlIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInF1ZXJ5IiwiZGF0YSIsIm9yaWdpbmFsRGF0YSIsImNsaWVudFNESyIsImNvbnRleHQiLCJhY3Rpb24iLCJpc1JlYWRPbmx5IiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic3RvcmFnZSIsInJ1bk9wdGlvbnMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwibWF0Y2giLCJvYmplY3RDb250YWluc0tleVZhbHVlIiwia2V5IiwidmFsdWUiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2UiLCJ1cGRhdGVkQXQiLCJfZW5jb2RlIiwiRGF0ZSIsImlzbyIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsInBlbmRpbmdPcHMiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQiLCJ2YWxpZGF0ZVNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJzZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkIiwidHJhbnNmb3JtVXNlciIsImV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzIiwiZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyIsInJ1bkRhdGFiYXNlT3BlcmF0aW9uIiwiY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQiLCJoYW5kbGVGb2xsb3d1cCIsInJ1bkFmdGVyU2F2ZVRyaWdnZXIiLCJjbGVhblVzZXJBdXRoRGF0YSIsImlzTWFzdGVyIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwibGVuZ3RoIiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwiaXNFcXVhbCIsInB1c2giLCJydW5CZWZvcmVMb2dpblRyaWdnZXIiLCJ1c2VyRGF0YSIsImJlZm9yZUxvZ2luIiwiZXh0cmFEYXRhIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsImluZmxhdGUiLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY3JlYXRlZEF0IiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJrZXlzIiwiZm9yRWFjaCIsImF1dGhEYXRhIiwidXNlcm5hbWUiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsInBhc3N3b3JkIiwiUEFTU1dPUkRfTUlTU0lORyIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJwcm92aWRlcnMiLCJjYW5IYW5kbGVBdXRoRGF0YSIsImNhbkhhbmRsZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiaGFuZGxlQXV0aERhdGEiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJ2YWxpZGF0aW9ucyIsIm1hcCIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiYXV0aFByb3ZpZGVyIiwiZW5hYmxlZCIsIkRlcHJlY2F0b3IiLCJsb2dSdW50aW1lRGVwcmVjYXRpb24iLCJ1c2FnZSIsInNvbHV0aW9uIiwiYWxsIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwibWVtbyIsInF1ZXJ5S2V5IiwiZmlsdGVyIiwicSIsImZpbmRQcm9taXNlIiwiJG9yIiwiZmlsdGVyZWRPYmplY3RzQnlBQ0wiLCJvYmplY3RzIiwiQUNMIiwicmVzdWx0cyIsInIiLCJqb2luIiwidXNlclJlc3VsdCIsIm11dGF0ZWRBdXRoRGF0YSIsInByb3ZpZGVyRGF0YSIsInVzZXJBdXRoRGF0YSIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJJZCIsImxvY2F0aW9uIiwiQUNDT1VOVF9BTFJFQURZX0xJTktFRCIsInByb21pc2UiLCJlcnJvciIsIlJlc3RRdWVyeSIsIm1hc3RlciIsIl9fdHlwZSIsInNlc3Npb24iLCJjYWNoZUNvbnRyb2xsZXIiLCJkZWwiLCJzZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVQYXNzd29yZFBvbGljeSIsImhhc2giLCJoYXNoZWRQYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfdmFsaWRhdGVVc2VyTmFtZSIsIl92YWxpZGF0ZUVtYWlsIiwicmFuZG9tU3RyaW5nIiwicmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUiLCIkbmUiLCJsaW1pdCIsImNhc2VJbnNlbnNpdGl2ZSIsIlVTRVJOQU1FX1RBS0VOIiwiZW1haWwiLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm9sZFBhc3N3b3JkcyIsIl9wYXNzd29yZF9oaXN0b3J5IiwidGFrZSIsIm5ld1Bhc3N3b3JkIiwicHJvbWlzZXMiLCJjb21wYXJlIiwiY2F0Y2giLCJlcnIiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwidmVyaWZ5VXNlckVtYWlscyIsImNyZWF0ZVNlc3Npb25Ub2tlbiIsImluc3RhbGxhdGlvbklkIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiY3JlYXRlZFdpdGgiLCJhZGRpdGlvbmFsU2Vzc2lvbkRhdGEiLCJ0b2tlbiIsIm5ld1Rva2VuIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYXNzaWduIiwiYWRkT3BzIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiZGVzdHJveSIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJzZXNzaW9uUXVlcnkiLCJiaW5kIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiZGV2aWNlVG9rZW4iLCJ0b0xvd2VyQ2FzZSIsImRldmljZVR5cGUiLCJpZE1hdGNoIiwib2JqZWN0SWRNYXRjaCIsImluc3RhbGxhdGlvbklkTWF0Y2giLCJkZXZpY2VUb2tlbk1hdGNoZXMiLCJvclF1ZXJpZXMiLCJkZWxRdWVyeSIsImFwcElkZW50aWZpZXIiLCJjb2RlIiwib2JqSWQiLCJyb2xlIiwiY2xlYXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiY2xlYXJDYWNoZWRSb2xlcyIsImlzVW5hdXRoZW50aWNhdGVkIiwiU0VTU0lPTl9NSVNTSU5HIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJuYW1lIiwiSU5WQUxJRF9BQ0wiLCJyZWFkIiwid3JpdGUiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJoYXNBZnRlclNhdmVIb29rIiwiYWZ0ZXJTYXZlIiwiaGFzTGl2ZVF1ZXJ5IiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJqc29uUmV0dXJuZWQiLCJfdG9GdWxsSlNPTiIsInRvSlNPTiIsImxvZ2dlciIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsImZyb21KU09OIiwicmVhZE9ubHlBdHRyaWJ1dGVzIiwiY29uc3RydWN0b3IiLCJhdHRyaWJ1dGUiLCJpbmNsdWRlcyIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2FuaXRpemVkIiwic2tpcEtleXMiLCJyZXF1aXJlZENvbHVtbnMiLCJjbGllbnRTdXBwb3J0c0RlbGV0ZSIsInN1cHBvcnRzRm9yd2FyZERlbGV0ZSIsImRhdGFWYWx1ZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFjQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQWxCQTtBQUNBO0FBQ0E7QUFFQSxJQUFJQSxnQkFBZ0IsR0FBR0MsT0FBTyxDQUFDLGdDQUFELENBQTlCOztBQUNBLElBQUlDLFFBQVEsR0FBR0QsT0FBTyxDQUFDLFVBQUQsQ0FBdEI7O0FBRUEsTUFBTUUsSUFBSSxHQUFHRixPQUFPLENBQUMsUUFBRCxDQUFwQjs7QUFDQSxNQUFNRyxLQUFLLEdBQUdILE9BQU8sQ0FBQyxTQUFELENBQXJCOztBQUNBLElBQUlJLFdBQVcsR0FBR0osT0FBTyxDQUFDLGVBQUQsQ0FBekI7O0FBQ0EsSUFBSUssY0FBYyxHQUFHTCxPQUFPLENBQUMsWUFBRCxDQUE1Qjs7QUFDQSxJQUFJTSxLQUFLLEdBQUdOLE9BQU8sQ0FBQyxZQUFELENBQW5COztBQUNBLElBQUlPLFFBQVEsR0FBR1AsT0FBTyxDQUFDLFlBQUQsQ0FBdEI7O0FBQ0EsSUFBSVEsU0FBUyxHQUFHUixPQUFPLENBQUMsYUFBRCxDQUF2Qjs7QUFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTUyxTQUFULENBQW1CQyxNQUFuQixFQUEyQkMsSUFBM0IsRUFBaUNDLFNBQWpDLEVBQTRDQyxLQUE1QyxFQUFtREMsSUFBbkQsRUFBeURDLFlBQXpELEVBQXVFQyxTQUF2RSxFQUFrRkMsT0FBbEYsRUFBMkZDLE1BQTNGLEVBQW1HO0FBQ2pHLE1BQUlQLElBQUksQ0FBQ1EsVUFBVCxFQUFxQjtB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c0JzTSxTQUF0QjtBQUNEO0FBQ0Y7QUFDRixHQWREO0FBZUEsU0FBT3ZSLFFBQVA7QUFDRCxDQTdDRDs7ZUErQ2VoQyxTOztBQUNmd1QsTUFBTSxDQUFDQyxPQUFQLEdBQWlCelQsU0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIFJlc3RXcml0ZSBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhbiBvcGVyYXRpb25cbi8vIHRoYXQgd3JpdGVzIHRvIHRoZSBkYXRhYmFzZS5cbi8vIFRoaXMgY291bGQgYmUgZWl0aGVyIGEgXCJjcmVhdGVcIiBvciBhbiBcInVwZGF0ZVwiLlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIGRlZXBjb3B5ID0gcmVxdWlyZSgnZGVlcGNvcHknKTtcblxuY29uc3QgQXV0aCA9IHJlcXVpcmUoJy4vQXV0aCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuL1V0aWxzJyk7XG52YXIgY3J5cHRvVXRpbHMgPSByZXF1aXJlKCcuL2NyeXB0b1V0aWxzJyk7XG52YXIgcGFzc3dvcmRDcnlwdG8gPSByZXF1aXJlKCcuL3Bhc3N3b3JkJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG52YXIgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG52YXIgQ2xpZW50U0RLID0gcmVxdWlyZSgnLi9DbGllbnRTREsnKTtcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgcmVxdWlyZWRDb2x1bW5zIH0gZnJvbSAnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcblxuLy8gcXVlcnkgYW5kIGRhdGEgYXJlIGJvdGggcHJvdmlkZWQgaW4gUkVTVCBBUEkgZm9ybWF0LiBTbyBkYXRhXG4vLyB0eXBlcyBhcmUgZW5jb2RlZCBieSBwbGFpbiBvbGQgb2JqZWN0cy5cbi8vIElmIHF1ZXJ5IGlzIG51bGwsIHRoaXMgaXMgYSBcImNyZWF0ZVwiIGFuZCB0aGUgZGF0YSBpbiBkYXRhIHNob3VsZCBiZVxuLy8gY3JlYXRlZC5cbi8vIE90aGVyd2lzZSB0aGlzIGlzIGFuIFwidXBkYXRlXCIgLSB0aGUgb2JqZWN0IG1hdGNoaW5nIHRoZSBxdWVyeVxuLy8gc2hvdWxkIGdldCB1cGRhdGVkIHdpdGggZGF0YS5cbi8vIFJlc3RXcml0ZSB3aWxsIGhhbmRsZSBvYmplY3RJZCwgY3JlYXRlZEF0LCBhbmQgdXBkYXRlZEF0IGZvclxuLy8gZXZlcnl0aGluZy4gSXQgYWxzbyBrbm93cyB0byB1c2UgdHJpZ2dlcnMgYW5kIHNwZWNpYWwgbW9kaWZpY2F0aW9uc1xuLy8gZm9yIHRoZSBfVXNlciBjbGFzcy5cbmZ1bmN0aW9uIFJlc3RXcml0ZShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcXVlcnksIGRhdGEsIG9yaWdpbmFsRGF0YSwgY2xpZW50U0RLLCBjb250ZXh0LCBhY3Rpb24pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAnQ2Fubm90IHBlcmZvcm0gYSB3cml0ZSBvcGVyYXRpb24gd2hlbiB1c2luZyByZWFkT25seU1hc3RlcktleSdcbiAgICApO1xuICB9XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMuc3RvcmFnZSA9IHt9O1xuICB0aGlzLnJ1bk9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcblxuICBpZiAoYWN0aW9uKSB7XG4gICAgdGhpcy5ydW5PcHRpb25zLmFjdGlvbiA9IGFjdGlvbjtcbiAgfVxuXG4gIGlmICghcXVlcnkpIHtcbiAgICBpZiAodGhpcy5jb25maWcuYWxsb3dDdXN0b21PYmplY3RJZCkge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChkYXRhLCAnb2JqZWN0SWQnKSAmJiAhZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuTUlTU0lOR19PQkpFQ1RfSUQsXG4gICAgICAgICAgJ29iamVjdElkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsIG9yIHVuZGVmaW5lZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdvYmplY3RJZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgICBpZiAoZGF0YS5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ2lkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5jb25maWcucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgdGhpcy5jb25maWcucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgY29uc3QgbWF0Y2ggPSBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKGRhdGEsIGtleXdvcmQua2V5LCBrZXl3b3JkLnZhbHVlKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICBgUHJvaGliaXRlZCBrZXl3b3JkIGluIHJlcXVlc3QgZGF0YTogJHtKU09OLnN0cmluZ2lmeShrZXl3b3JkKX0uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFdoZW4gdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZSwgdGhpcy5yZXNwb25zZSBtYXkgaGF2ZSBzZXZlcmFsXG4gIC8vIGZpZWxkcy5cbiAgLy8gcmVzcG9uc2U6IHRoZSBhY3R1YWwgZGF0YSB0byBiZSByZXR1cm5lZFxuICAvLyBzdGF0dXM6IHRoZSBodHRwIHN0YXR1cyBjb2RlLiBpZiBub3QgcHJlc2VudCwgdHJlYXRlZCBsaWtlIGEgMjAwXG4gIC8vIGxvY2F0aW9uOiB0aGUgbG9jYXRpb24gaGVhZGVyLiBpZiBub3QgcHJlc2VudCwgbm8gbG9jYXRpb24gaGVhZGVyXG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuXG4gIC8vIFByb2Nlc3NpbmcgdGhpcyBvcGVyYXRpb24gbWF5IG11dGF0ZSBvdXIgZGF0YSwgc28gd2Ugb3BlcmF0ZSBvbiBhXG4gIC8vIGNvcHlcbiAgdGhpcy5xdWVyeSA9IGRlZXBjb3B5KHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gZGVlcGNvcHkoZGF0YSk7XG4gIC8vIFdlIG5ldmVyIGNoYW5nZSBvcmlnaW5hbERhdGEsIHNvIHdlIGRvIG5vdCBuZWVkIGEgZGVlcCBjb3B5XG4gIHRoaXMub3JpZ2luYWxEYXRhID0gb3JpZ2luYWxEYXRhO1xuXG4gIC8vIFRoZSB0aW1lc3RhbXAgd2UnbGwgdXNlIGZvciB0aGlzIHdob2xlIG9wZXJhdGlvblxuICB0aGlzLnVwZGF0ZWRBdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkuaXNvO1xuXG4gIC8vIFNoYXJlZCBTY2hlbWFDb250cm9sbGVyIHRvIGJlIHJldXNlZCB0byByZWR1Y2UgdGhlIG51bWJlciBvZiBsb2FkU2NoZW1hKCkgY2FsbHMgcGVyIHJlcXVlc3RcbiAgLy8gT25jZSBzZXQgdGhlIHNjaGVtYURhdGEgc2hvdWxkIGJlIGltbXV0YWJsZVxuICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IG51bGw7XG4gIHRoaXMucGVuZGluZ09wcyA9IHt9O1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5CZWZvcmVTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hKCk7XG4gICAgfSlcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB0aGlzLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybVVzZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5EYXRhYmFzZU9wZXJhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlclNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jbGVhblVzZXJBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgKyAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBzY2hlbWEuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlU2NoZW1hID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudmFsaWRhdGVPYmplY3QoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdGhpcy5kYXRhLFxuICAgIHRoaXMucXVlcnksXG4gICAgdGhpcy5ydW5PcHRpb25zXG4gICk7XG59O1xuXG4vLyBSdW5zIGFueSBiZWZvcmVTYXZlIHRyaWdnZXJzIGFnYWluc3QgdGhpcyBvcGVyYXRpb24uXG4vLyBBbnkgY2hhbmdlIGxlYWRzIHRvIG91ciBkYXRhIGJlaW5nIG11dGF0ZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZVNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuXG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyh1cGRhdGVkT2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKSk7XG4gIHRoaXMucGVuZGluZ09wcyA9IHsgLi4ucGVuZGluZyB9O1xuXG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEJlZm9yZSBjYWxsaW5nIHRoZSB0cmlnZ2VyLCB2YWxpZGF0ZSB0aGUgcGVybWlzc2lvbnMgZm9yIHRoZSBzYXZlIG9wZXJhdGlvblxuICAgICAgbGV0IGRhdGFiYXNlUHJvbWlzZSA9IG51bGw7XG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgdXBkYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciBjcmVhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5jcmVhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJbiB0aGUgY2FzZSB0aGF0IHRoZXJlIGlzIG5vIHBlcm1pc3Npb24gZm9yIHRoZSBvcGVyYXRpb24sIGl0IHRocm93cyBhbiBlcnJvclxuICAgICAgcmV0dXJuIGRhdGFiYXNlUHJvbWlzZS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgICAgICB0aGlzLmF1dGgsXG4gICAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICB0aGlzLmNvbmZpZyxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IF8ucmVkdWNlKFxuICAgICAgICAgIHJlc3BvbnNlLm9iamVjdCxcbiAgICAgICAgICAocmVzdWx0LCB2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmRhdGFba2V5XSwgdmFsdWUpKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0sXG4gICAgICAgICAgW11cbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhID0gcmVzcG9uc2Uub2JqZWN0O1xuICAgICAgICAvLyBXZSBzaG91bGQgZGVsZXRlIHRoZSBvYmplY3RJZCBmb3IgYW4gdXBkYXRlIHdyaXRlXG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlciA9IGFzeW5jIGZ1bmN0aW9uICh1c2VyRGF0YSkge1xuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVMb2dpbicgdHJpZ2dlclxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG5cbiAgLy8gRXhwYW5kIGZpbGUgb2JqZWN0c1xuICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdXNlckRhdGEpO1xuXG4gIGNvbnN0IHVzZXIgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdXNlckRhdGEpO1xuXG4gIC8vIG5vIG5lZWQgdG8gcmV0dXJuIGEgcmVzcG9uc2VcbiAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLFxuICAgIHRoaXMuYXV0aCxcbiAgICB1c2VyLFxuICAgIG51bGwsXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5jb250ZXh0XG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmRhdGEpIHtcbiAgICByZXR1cm4gdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsQ2xhc3NlcyA9PiB7XG4gICAgICBjb25zdCBzY2hlbWEgPSBhbGxDbGFzc2VzLmZpbmQob25lQ2xhc3MgPT4gb25lQ2xhc3MuY2xhc3NOYW1lID09PSB0aGlzLmNsYXNzTmFtZSk7XG4gICAgICBjb25zdCBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQgPSAoZmllbGROYW1lLCBzZXREZWZhdWx0KSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IG51bGwgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJycgfHxcbiAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgc2V0RGVmYXVsdCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSBudWxsICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgICh0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHwgW107XG4gICAgICAgICAgICBpZiAodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnJlcXVpcmVkID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgYCR7ZmllbGROYW1lfSBpcyByZXF1aXJlZGApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIGRlZmF1bHQgZmllbGRzXG4gICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuXG4gICAgICAgIC8vIE9ubHkgYXNzaWduIG5ldyBvYmplY3RJZCBpZiB3ZSBhcmUgY3JlYXRpbmcgbmV3IG9iamVjdFxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5vYmplY3RJZCkge1xuICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IGNyeXB0b1V0aWxzLm5ld09iamVjdElkKHRoaXMuY29uZmlnLm9iamVjdElkU2l6ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIHRydWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYSkge1xuICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCBmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cbi8vIFRyYW5zZm9ybXMgYXV0aCBkYXRhIGZvciBhIHVzZXIgb2JqZWN0LlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYSB1c2VyIG9iamVjdC5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVBdXRoRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS51c2VybmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAnYmFkIG9yIG1pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEucGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEucGFzc3dvcmQpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKFxuICAgICh0aGlzLmRhdGEuYXV0aERhdGEgJiYgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoKSB8fFxuICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKVxuICApIHtcbiAgICAvLyBIYW5kbGUgc2F2aW5nIGF1dGhEYXRhIHRvIHt9IG9yIGlmIGF1dGhEYXRhIGRvZXNuJ3QgZXhpc3RcbiAgICByZXR1cm47XG4gIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJykgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8gbnVsbFxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICk7XG4gIH1cblxuICB2YXIgYXV0aERhdGEgPSB0aGlzLmRhdGEuYXV0aERhdGE7XG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnJlZHVjZSgoY2FuSGFuZGxlLCBwcm92aWRlcikgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gY2FuSGFuZGxlICYmIChoYXNUb2tlbiB8fCBwcm92aWRlckF1dGhEYXRhID09IG51bGwpO1xuICAgIH0sIHRydWUpO1xuICAgIGlmIChjYW5IYW5kbGVBdXRoRGF0YSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24gPSBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgdmFsaWRhdGlvbnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkubWFwKHByb3ZpZGVyID0+IHtcbiAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IHZhbGlkYXRlQXV0aERhdGEgPSB0aGlzLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgIGNvbnN0IGF1dGhQcm92aWRlciA9ICh0aGlzLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgaWYgKGF1dGhQcm92aWRlci5lbmFibGVkID09IG51bGwpIHtcbiAgICAgIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICAgICAgdXNhZ2U6IGBhdXRoLiR7cHJvdmlkZXJ9YCxcbiAgICAgICAgc29sdXRpb246IGBhdXRoLiR7cHJvdmlkZXJ9LmVuYWJsZWQ6IHRydWVgLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGlmICghdmFsaWRhdGVBdXRoRGF0YSB8fCBhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PT0gZmFsc2UpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB2YWxpZGF0ZUF1dGhEYXRhKGF1dGhEYXRhW3Byb3ZpZGVyXSk7XG4gIH0pO1xuICByZXR1cm4gUHJvbWlzZS5hbGwodmFsaWRhdGlvbnMpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maW5kVXNlcnNXaXRoQXV0aERhdGEgPSBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBjb25zdCBxdWVyeSA9IHByb3ZpZGVyc1xuICAgIC5yZWR1Y2UoKG1lbW8sIHByb3ZpZGVyKSA9PiB7XG4gICAgICBpZiAoIWF1dGhEYXRhW3Byb3ZpZGVyXSkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHF1ZXJ5S2V5ID0gYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYDtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge307XG4gICAgICBxdWVyeVtxdWVyeUtleV0gPSBhdXRoRGF0YVtwcm92aWRlcl0uaWQ7XG4gICAgICBtZW1vLnB1c2gocXVlcnkpO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgW10pXG4gICAgLmZpbHRlcihxID0+IHtcbiAgICAgIHJldHVybiB0eXBlb2YgcSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgfSk7XG5cbiAgbGV0IGZpbmRQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKFtdKTtcbiAgaWYgKHF1ZXJ5Lmxlbmd0aCA+IDApIHtcbiAgICBmaW5kUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQodGhpcy5jbGFzc05hbWUsIHsgJG9yOiBxdWVyeSB9LCB7fSk7XG4gIH1cblxuICByZXR1cm4gZmluZFByb21pc2U7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmZpbHRlcmVkT2JqZWN0c0J5QUNMID0gZnVuY3Rpb24gKG9iamVjdHMpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3RzO1xuICB9XG4gIHJldHVybiBvYmplY3RzLmZpbHRlcihvYmplY3QgPT4ge1xuICAgIGlmICghb2JqZWN0LkFDTCkge1xuICAgICAgcmV0dXJuIHRydWU7IC8vIGxlZ2FjeSB1c2VycyB0aGF0IGhhdmUgbm8gQUNMIGZpZWxkIG9uIHRoZW1cbiAgICB9XG4gICAgLy8gUmVndWxhciB1c2VycyB0aGF0IGhhdmUgYmVlbiBsb2NrZWQgb3V0LlxuICAgIHJldHVybiBvYmplY3QuQUNMICYmIE9iamVjdC5rZXlzKG9iamVjdC5BQ0wpLmxlbmd0aCA+IDA7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YSA9IGZ1bmN0aW9uIChhdXRoRGF0YSkge1xuICBsZXQgcmVzdWx0cztcbiAgcmV0dXJuIHRoaXMuZmluZFVzZXJzV2l0aEF1dGhEYXRhKGF1dGhEYXRhKS50aGVuKGFzeW5jIHIgPT4ge1xuICAgIHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoID09IDEpIHtcbiAgICAgIHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgICBjb25zdCB1c2VyUmVzdWx0ID0gcmVzdWx0c1swXTtcbiAgICAgIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICAgICAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnN0IHVzZXJBdXRoRGF0YSA9IHVzZXJSZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBpZiAoIV8uaXNFcXVhbChwcm92aWRlckRhdGEsIHVzZXJBdXRoRGF0YSkpIHtcbiAgICAgICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICAgICAgbGV0IHVzZXJJZDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgdXNlcklkID0gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICAgIHVzZXJJZCA9IHRoaXMuYXV0aC51c2VyLmlkO1xuICAgICAgfVxuICAgICAgaWYgKCF1c2VySWQgfHwgdXNlcklkID09PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB7XG4gICAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAgIC8vIE9SIHRoZSB1c2VyIG1ha2luZyB0aGUgY2FsbCBpcyB0aGUgcmlnaHQgb25lXG4gICAgICAgIC8vIExvZ2luIHdpdGggYXV0aCBkYXRhXG4gICAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBvYmplY3RJZCBmaXJzdCBvdGhlcndpc2UgbG9jYXRpb24gaGFzIHRyYWlsaW5nIHVuZGVmaW5lZFxuICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSB1c2VyUmVzdWx0Lm9iamVjdElkO1xuXG4gICAgICAgIGlmICghdGhpcy5xdWVyeSB8fCAhdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIC8vIHRoaXMgYSBsb2dpbiBjYWxsLCBubyB1c2VySWQgcGFzc2VkXG4gICAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB1c2VyUmVzdWx0LFxuICAgICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIC8vIFJ1biBiZWZvcmVMb2dpbiBob29rIGJlZm9yZSBzdG9yaW5nIGFueSB1cGRhdGVzXG4gICAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgICAvLyB3aWxsIGJlIGlnbm9yZWQuXG4gICAgICAgICAgYXdhaXQgdGhpcy5ydW5CZWZvcmVMb2dpblRyaWdnZXIoZGVlcGNvcHkodXNlclJlc3VsdCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UgZGlkbid0IGNoYW5nZSB0aGUgYXV0aCBkYXRhLCBqdXN0IGtlZXAgZ29pbmdcbiAgICAgICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gV2UgaGF2ZSBhdXRoRGF0YSB0aGF0IGlzIHVwZGF0ZWQgb24gbG9naW5cbiAgICAgICAgLy8gdGhhdCBjYW4gaGFwcGVuIHdoZW4gdG9rZW4gYXJlIHJlZnJlc2hlZCxcbiAgICAgICAgLy8gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgdG9rZW4gYW5kIGxldCB0aGUgdXNlciBpblxuICAgICAgICAvLyBXZSBzaG91bGQgb25seSBjaGVjayB0aGUgbXV0YXRlZCBrZXlzXG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihtdXRhdGVkQXV0aERhdGEpLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIC8vIElGIHdlIGhhdmUgYSByZXNwb25zZSwgd2UnbGwgc2tpcCB0aGUgZGF0YWJhc2Ugb3BlcmF0aW9uIC8gYmVmb3JlU2F2ZSAvIGFmdGVyU2F2ZSBldGMuLi5cbiAgICAgICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgICAgIC8vIElmIHdlJ3JlIG5vdCBsb2dnaW5nIGluLCBidXQganVzdCB1cGRhdGluZyB0aGUgY3VycmVudCB1c2VyLCB3ZSBjYW4gc2FmZWx5IHNraXAgdGhhdCBwYXJ0XG4gICAgICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIC8vIEFzc2lnbiB0aGUgbmV3IGF1dGhEYXRhIGluIHRoZSByZXNwb25zZVxuICAgICAgICAgICAgT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPSBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFJ1biB0aGUgREIgdXBkYXRlIGRpcmVjdGx5LCBhcyAnbWFzdGVyJ1xuICAgICAgICAgICAgLy8gSnVzdCB1cGRhdGUgdGhlIGF1dGhEYXRhIHBhcnRcbiAgICAgICAgICAgIC8vIFRoZW4gd2UncmUgZ29vZCBmb3IgdGhlIHVzZXIsIGVhcmx5IGV4aXQgb2Ygc29ydHNcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLmRhdGEub2JqZWN0SWQgfSxcbiAgICAgICAgICAgICAgeyBhdXRoRGF0YTogbXV0YXRlZEF1dGhEYXRhIH0sXG4gICAgICAgICAgICAgIHt9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKHVzZXJJZCkge1xuICAgICAgICAvLyBUcnlpbmcgdG8gdXBkYXRlIGF1dGggZGF0YSBidXQgdXNlcnNcbiAgICAgICAgLy8gYXJlIGRpZmZlcmVudFxuICAgICAgICBpZiAodXNlclJlc3VsdC5vYmplY3RJZCAhPT0gdXNlcklkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTm8gYXV0aCBkYXRhIHdhcyBtdXRhdGVkLCBqdXN0IGtlZXAgZ29pbmdcbiAgICAgICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhKS50aGVuKCgpID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgLy8gTW9yZSB0aGFuIDEgdXNlciB3aXRoIHRoZSBwYXNzZWQgaWQnc1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBUaGUgbm9uLXRoaXJkLXBhcnR5IHBhcnRzIG9mIFVzZXIgdHJhbnNmb3JtYXRpb25cblJlc3RXcml0ZS5wcm90b3R5cGUudHJhbnNmb3JtVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyICYmICdlbWFpbFZlcmlmaWVkJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBlcnJvciA9IGBDbGllbnRzIGFyZW4ndCBhbGxvd2VkIHRvIG1hbnVhbGx5IHVwZGF0ZSBlbWFpbCB2ZXJpZmljYXRpb24uYDtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgZXJyb3IpO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIHByb21pc2UgPSBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICAgIC5leGVjdXRlKClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLnJlc3VsdHMuZm9yRWFjaChzZXNzaW9uID0+XG4gICAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gIH1cblxuICByZXR1cm4gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIFRyYW5zZm9ybSB0aGUgcGFzc3dvcmRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBpZ25vcmUgb25seSBpZiB1bmRlZmluZWQuIHNob3VsZCBwcm9jZWVkIGlmIGVtcHR5ICgnJylcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSA9IHRydWU7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbmV3IHNlc3Npb24gb25seSBpZiB0aGUgdXNlciByZXF1ZXN0ZWRcbiAgICAgICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uaGFzaCh0aGlzLmRhdGEucGFzc3dvcmQpLnRoZW4oaGFzaGVkUGFzc3dvcmQgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkID0gaGFzaGVkUGFzc3dvcmQ7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVVzZXJOYW1lKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVFbWFpbCgpO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVVc2VyTmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgZm9yIHVzZXJuYW1lIHVuaXF1ZW5lc3NcbiAgaWYgKCF0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgIHRoaXMuZGF0YS51c2VybmFtZSA9IGNyeXB0b1V0aWxzLnJhbmRvbVN0cmluZygyNSk7XG4gICAgICB0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8qXG4gICAgVXNlcm5hbWVzIHNob3VsZCBiZSB1bmlxdWUgd2hlbiBjb21wYXJlZCBjYXNlIGluc2Vuc2l0aXZlbHlcblxuICAgIFVzZXJzIHNob3VsZCBiZSBhYmxlIHRvIG1ha2UgY2FzZSBzZW5zaXRpdmUgdXNlcm5hbWVzIGFuZFxuICAgIGxvZ2luIHVzaW5nIHRoZSBjYXNlIHRoZXkgZW50ZXJlZC4gIEkuZS4gJ1Nub29weScgc2hvdWxkIHByZWNsdWRlXG4gICAgJ3Nub29weScgYXMgYSB2YWxpZCB1c2VybmFtZS5cbiAgKi9cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfSk7XG59O1xuXG4vKlxuICBBcyB3aXRoIHVzZXJuYW1lcywgUGFyc2Ugc2hvdWxkIG5vdCBhbGxvdyBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgb2YgZW1haWwuXG4gIHVubGlrZSB3aXRoIHVzZXJuYW1lcyAod2hpY2ggY2FuIGhhdmUgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIGluIHRoZSBjYXNlIG9mXG4gIGF1dGggYWRhcHRlcnMpLCBlbWFpbHMgc2hvdWxkIG5ldmVyIGhhdmUgYSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbi5cblxuICBUaGlzIGJlaGF2aW9yIGNhbiBiZSBlbmZvcmNlZCB0aHJvdWdoIGEgcHJvcGVybHkgY29uZmlndXJlZCBpbmRleCBzZWU6XG4gIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9pbmRleC1jYXNlLWluc2Vuc2l0aXZlLyNjcmVhdGUtYS1jYXNlLWluc2Vuc2l0aXZlLWluZGV4XG4gIHdoaWNoIGNvdWxkIGJlIGltcGxlbWVudGVkIGluc3RlYWQgb2YgdGhpcyBjb2RlIGJhc2VkIHZhbGlkYXRpb24uXG5cbiAgR2l2ZW4gdGhhdCB0aGlzIGxvb2t1cCBzaG91bGQgYmUgYSByZWxhdGl2ZWx5IGxvdyB1c2UgY2FzZSBhbmQgdGhhdCB0aGUgY2FzZSBzZW5zaXRpdmVcbiAgdW5pcXVlIGluZGV4IHdpbGwgYmUgdXNlZCBieSB0aGUgZGIgZm9yIHRoZSBxdWVyeSwgdGhpcyBpcyBhbiBhZGVxdWF0ZSBzb2x1dGlvbi5cbiovXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZUVtYWlsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZGF0YS5lbWFpbCB8fCB0aGlzLmRhdGEuZW1haWwuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVmFsaWRhdGUgYmFzaWMgZW1haWwgYWRkcmVzcyBmb3JtYXRcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwubWF0Y2goL14uK0AuKyQvKSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsICdFbWFpbCBhZGRyZXNzIGZvcm1hdCBpcyBpbnZhbGlkLicpXG4gICAgKTtcbiAgfVxuICAvLyBDYXNlIGluc2Vuc2l0aXZlIG1hdGNoLCBzZWUgbm90ZSBhYm92ZSBmdW5jdGlvbi5cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgIXRoaXMuZGF0YS5hdXRoRGF0YSB8fFxuICAgICAgICAhT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggfHxcbiAgICAgICAgKE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoID09PSAxICYmXG4gICAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKVswXSA9PT0gJ2Fub255bW91cycpXG4gICAgICApIHtcbiAgICAgICAgLy8gV2UgdXBkYXRlZCB0aGUgZW1haWwsIHNlbmQgYSBuZXcgdmFsaWRhdGlvblxuICAgICAgICB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2V0RW1haWxWZXJpZnlUb2tlbih0aGlzLmRhdGEpO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgcG9saWN5RXJyb3IpKTtcbiAgfVxuXG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgY29udGFpbiB1c2VybmFtZVxuICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lID09PSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgICAgLy8gdXNlcm5hbWUgaXMgbm90IHBhc3NlZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZih0aGlzLmRhdGEudXNlcm5hbWUpID49IDApXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHJldHJpZXZlIHRoZSBVc2VyIG9iamVjdCB1c2luZyBvYmplY3RJZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YocmVzdWx0c1swXS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKVxuICAgICAgICAgICk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpXG4gICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDFcbiAgICAgICAgICApO1xuICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgY29uc3QgbmV3UGFzc3dvcmQgPSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIC8vIGNvbXBhcmUgdGhlIG5ldyBwYXNzd29yZCBoYXNoIHdpdGggYWxsIG9sZCBwYXNzd29yZCBoYXNoZXNcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBvbGRQYXNzd29yZHMubWFwKGZ1bmN0aW9uIChoYXNoKSB7XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUobmV3UGFzc3dvcmQsIGhhc2gpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAgIC8vIHJlamVjdCBpZiB0aGVyZSBpcyBhIG1hdGNoXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCgnUkVQRUFUX1BBU1NXT1JEJyk7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB3YWl0IGZvciBhbGwgY29tcGFyaXNvbnMgdG8gY29tcGxldGVcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyciA9PT0gJ1JFUEVBVF9QQVNTV09SRCcpXG4gICAgICAgICAgICAgIC8vIGEgbWF0Y2ggd2FzIGZvdW5kXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgYE5ldyBwYXNzd29yZCBzaG91bGQgbm90IGJlIHRoZSBzYW1lIGFzIGxhc3QgJHt0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3Rvcnl9IHBhc3N3b3Jkcy5gXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIHNlc3Npb24gZm9yIHVwZGF0aW5nIHVzZXIgKHRoaXMucXVlcnkgaXMgc2V0KSB1bmxlc3MgYXV0aERhdGEgZXhpc3RzXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgbmV3IHNlc3Npb25Ub2tlbiBpZiBsaW5raW5nIHZpYSBzZXNzaW9uVG9rZW5cbiAgaWYgKHRoaXMuYXV0aC51c2VyICYmIHRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoXG4gICAgIXRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gJiYgLy8gc2lnbnVwIGNhbGwsIHdpdGhcbiAgICB0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmIC8vIG5vIGxvZ2luIHdpdGhvdXQgdmVyaWZpY2F0aW9uXG4gICAgdGhpcy5jb25maWcudmVyaWZ5VXNlckVtYWlsc1xuICApIHtcbiAgICAvLyB2ZXJpZmljYXRpb24gaXMgb25cbiAgICByZXR1cm47IC8vIGRvIG5vdCBjcmVhdGUgdGhlIHNlc3Npb24gdG9rZW4gaW4gdGhhdCBjYXNlIVxuICB9XG4gIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vIGNsb3VkIGluc3RhbGxhdGlvbklkIGZyb20gQ2xvdWQgQ29kZSxcbiAgLy8gbmV2ZXIgY3JlYXRlIHNlc3Npb24gdG9rZW5zIGZyb20gdGhlcmUuXG4gIGlmICh0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgJiYgdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkID09PSAnY2xvdWQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPT0gbnVsbCAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5qb2luKCcsJyk7XG4gIH1cblxuICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgIHVzZXJJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICBhY3Rpb246IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPyAnbG9naW4nIDogJ3NpZ251cCcsXG4gICAgICBhdXRoUHJvdmlkZXI6IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gfHwgJ3Bhc3N3b3JkJyxcbiAgICB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gIH0pO1xuXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVTZXNzaW9uKCk7XG59O1xuXG5SZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbiA9IGZ1bmN0aW9uIChcbiAgY29uZmlnLFxuICB7IHVzZXJJZCwgY3JlYXRlZFdpdGgsIGluc3RhbGxhdGlvbklkLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgfVxuKSB7XG4gIGNvbnN0IHRva2VuID0gJ3I6JyArIGNyeXB0b1V0aWxzLm5ld1Rva2VuKCk7XG4gIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgY29uc3Qgc2Vzc2lvbkRhdGEgPSB7XG4gICAgc2Vzc2lvblRva2VuOiB0b2tlbixcbiAgICB1c2VyOiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgfSxcbiAgICBjcmVhdGVkV2l0aCxcbiAgICBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSxcbiAgfTtcblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBzZXNzaW9uRGF0YS5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgT2JqZWN0LmFzc2lnbihzZXNzaW9uRGF0YSwgYWRkaXRpb25hbFNlc3Npb25EYXRhKTtcblxuICByZXR1cm4ge1xuICAgIHNlc3Npb25EYXRhLFxuICAgIGNyZWF0ZVNlc3Npb246ICgpID0+XG4gICAgICBuZXcgUmVzdFdyaXRlKGNvbmZpZywgQXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgbnVsbCwgc2Vzc2lvbkRhdGEpLmV4ZWN1dGUoKSxcbiAgfTtcbn07XG5cbi8vIERlbGV0ZSBlbWFpbCByZXNldCB0b2tlbnMgaWYgdXNlciBpcyBjaGFuZ2luZyBwYXNzd29yZCBvciBlbWFpbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLnF1ZXJ5ID09PSBudWxsKSB7XG4gICAgLy8gbnVsbCBxdWVyeSBtZWFucyBjcmVhdGVcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoJ3Bhc3N3b3JkJyBpbiB0aGlzLmRhdGEgfHwgJ2VtYWlsJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBhZGRPcHMgPSB7XG4gICAgICBfcGVyaXNoYWJsZV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG4gICAgdGhpcy5kYXRhID0gT2JqZWN0LmFzc2lnbih0aGlzLmRhdGEsIGFkZE9wcyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gT25seSBmb3IgX1Nlc3Npb24sIGFuZCBhdCBjcmVhdGlvbiB0aW1lXG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPSAnX1Nlc3Npb24nIHx8IHRoaXMucXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRGVzdHJveSB0aGUgc2Vzc2lvbnMgaW4gJ0JhY2tncm91bmQnXG4gIGNvbnN0IHsgdXNlciwgaW5zdGFsbGF0aW9uSWQsIHNlc3Npb25Ub2tlbiB9ID0gdGhpcy5kYXRhO1xuICBpZiAoIXVzZXIgfHwgIWluc3RhbGxhdGlvbklkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdXNlci5vYmplY3RJZCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KFxuICAgICdfU2Vzc2lvbicsXG4gICAge1xuICAgICAgdXNlcixcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgc2Vzc2lvblRva2VuOiB7ICRuZTogc2Vzc2lvblRva2VuIH0sXG4gICAgfSxcbiAgICB7fSxcbiAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICApO1xufTtcblxuLy8gSGFuZGxlcyBhbnkgZm9sbG93dXAgbG9naWNcblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlRm9sbG93dXAgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gJiYgdGhpcy5jb25maWcucmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCkge1xuICAgIHZhciBzZXNzaW9uUXVlcnkgPSB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH07XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmRlc3Ryb3koJ19TZXNzaW9uJywgc2Vzc2lvblF1ZXJ5KVxuICAgICAgLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddO1xuICAgIC8vIEZpcmUgYW5kIGZvcmdldCFcbiAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodGhpcy5kYXRhKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfU2Vzc2lvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIF9TZXNzaW9uIG9iamVjdC5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlU2Vzc2lvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiByZXF1aXJlZC4nKTtcbiAgfVxuXG4gIC8vIFRPRE86IFZlcmlmeSBwcm9wZXIgZXJyb3IgdG8gdGhyb3dcbiAgaWYgKHRoaXMuZGF0YS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ0Nhbm5vdCBzZXQgJyArICdBQ0wgb24gYSBTZXNzaW9uLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiB0aGlzLmRhdGEudXNlci5vYmplY3RJZCAhPSB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kYXRhKSB7XG4gICAgICBpZiAoa2V5ID09PSAnb2JqZWN0SWQnIHx8IGtleSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLnJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLicpO1xuICAgICAgfVxuICAgICAgc2Vzc2lvbkRhdGFbJ29iamVjdElkJ10gPSByZXN1bHRzLnJlc3BvbnNlWydvYmplY3RJZCddO1xuICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgIGxvY2F0aW9uOiByZXN1bHRzLmxvY2F0aW9uLFxuICAgICAgICByZXNwb25zZTogc2Vzc2lvbkRhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfSW5zdGFsbGF0aW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gaW5zdGFsbGF0aW9uIG9iamVjdC5cbi8vIElmIGFuIGluc3RhbGxhdGlvbiBpcyBmb3VuZCwgdGhpcyBjYW4gbXV0YXRlIHRoaXMucXVlcnkgYW5kIHR1cm4gYSBjcmVhdGVcbi8vIGludG8gYW4gdXBkYXRlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVJbnN0YWxsYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICsgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgcmVzdWx0Lm9iamVjdElkID09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNSwgJ2RldmljZVR5cGUgbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJiAhZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdWl0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIHdoZXRoZXIgd2UgaGF2ZSBhIHNob3J0LWNpcmN1aXRlZCByZXNwb25zZSAtIG9ubHkgdGhlbiBydW4gZXhwYW5zaW9uLlxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkRhdGFiYXNlT3BlcmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJykge1xuICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci5yb2xlLmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIpIHtcbiAgICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuY2xlYXJDYWNoZWRSb2xlcyh0aGlzLmF1dGgudXNlcik7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMucXVlcnkgJiYgdGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKCkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5TRVNTSU9OX01JU1NJTkcsXG4gICAgICBgQ2Fubm90IG1vZGlmeSB1c2VyICR7dGhpcy5xdWVyeS5vYmplY3RJZH0uYFxuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUHJvZHVjdCcgJiYgdGhpcy5kYXRhLmRvd25sb2FkKSB7XG4gICAgdGhpcy5kYXRhLmRvd25sb2FkTmFtZSA9IHRoaXMuZGF0YS5kb3dubG9hZC5uYW1lO1xuICB9XG5cbiAgLy8gVE9ETzogQWRkIGJldHRlciBkZXRlY3Rpb24gZm9yIEFDTCwgZW5zdXJpbmcgYSB1c2VyIGNhbid0IGJlIGxvY2tlZCBmcm9tXG4gIC8vICAgICAgIHRoZWlyIG93biB1c2VyIHJlY29yZC5cbiAgaWYgKHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5kYXRhLkFDTFsnKnVucmVzb2x2ZWQnXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0FDTCwgJ0ludmFsaWQgQUNMLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAvLyBGb3JjZSB0aGUgdXNlciB0byBub3QgbG9ja291dFxuICAgIC8vIE1hdGNoZWQgd2l0aCBwYXJzZS5jb21cbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgdGhpcy5kYXRhLkFDTCAmJiB0aGlzLmF1dGguaXNNYXN0ZXIgIT09IHRydWUpIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vbi0xIHBhc3N3b3JkcyBnbyBpbnRvIGhpc3RvcnkgaW5jbHVkaW5nIGxhc3QgcGFzc3dvcmRcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBvbGRQYXNzd29yZHMubGVuZ3RoID4gTWF0aC5tYXgoMCwgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMilcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5zaGlmdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2hpc3RvcnkgPSBvbGRQYXNzd29yZHM7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBkZWZlci50aGVuKCgpID0+IHtcbiAgICAgIC8vIFJ1biBhbiB1cGRhdGVcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICByZXNwb25zZS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3BvbnNlIH07XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFNldCB0aGUgZGVmYXVsdCBBQ0wgYW5kIHBhc3N3b3JkIHRpbWVzdGFtcCBmb3IgdGhlIG5ldyBfVXNlclxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgdmFyIEFDTCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAvLyBkZWZhdWx0IHB1YmxpYyByL3cgQUNMXG4gICAgICBpZiAoIUFDTCkge1xuICAgICAgICBBQ0wgPSB7fTtcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgQUNMWycqJ10gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBtYWtlIHN1cmUgdGhlIHVzZXIgaXMgbm90IGxvY2tlZCBkb3duXG4gICAgICBBQ0xbdGhpcy5kYXRhLm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIHRoaXMuZGF0YS5BQ0wgPSBBQ0w7XG4gICAgICAvLyBwYXNzd29yZCB0aW1lc3RhbXAgdG8gYmUgdXNlZCB3aGVuIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3kgaXMgZW5mb3JjZWRcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJ1biBhIGNyZWF0ZVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmNyZWF0ZSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5kYXRhLCB0aGlzLnJ1bk9wdGlvbnMsIGZhbHNlLCB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlcilcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFF1aWNrIGNoZWNrLCBpZiB3ZSB3ZXJlIGFibGUgdG8gaW5mZXIgdGhlIGR1cGxpY2F0ZWQgZmllbGQgbmFtZVxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ2VtYWlsJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UgfHwgIXRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlclNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyU2F2ZUhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGNvbnN0IGhhc0xpdmVRdWVyeSA9IHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZSh0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLCB0aGlzLnJlc3BvbnNlLnN0YXR1cyB8fCAyMDApO1xuXG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgIC8vIE5vdGlmaXkgTGl2ZVF1ZXJ5U2VydmVyIGlmIHBvc3NpYmxlXG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSk7XG4gICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5vbkFmdGVyU2F2ZShcbiAgICAgIHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgcGVybXNcbiAgICApO1xuICB9KTtcblxuICAvLyBSdW4gYWZ0ZXJTYXZlIHRyaWdnZXJcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBjb25zdCBqc29uUmV0dXJuZWQgPSByZXN1bHQgJiYgIXJlc3VsdC5fdG9GdWxsSlNPTjtcbiAgICAgIGlmIChqc29uUmV0dXJuZWQpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nT3BzID0ge307XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSByZXN1bHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShcbiAgICAgICAgICAocmVzdWx0IHx8IHVwZGF0ZWRPYmplY3QpLnRvSlNPTigpLFxuICAgICAgICAgIHRoaXMuZGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1pZGRsZSA9IHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgY29uc3QgbW91bnQgPSB0aGlzLmNvbmZpZy5tb3VudCB8fCB0aGlzLmNvbmZpZy5zZXJ2ZXJVUkw7XG4gIHJldHVybiBtb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGF0YS5vYmplY3RJZCB8fCB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xufTtcblxuLy8gUmV0dXJucyBhIGNvcHkgb2YgdGhlIGRhdGEgYW5kIGRlbGV0ZSBiYWQga2V5cyAoX2F1dGhfZGF0YSwgX2hhc2hlZF9wYXNzd29yZC4uLilcblJlc3RXcml0ZS5wcm90b3R5cGUuc2FuaXRpemVkRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFBhcnNlT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lLCBvYmplY3RJZDogdGhpcy5xdWVyeT8ub2JqZWN0SWQgfTtcbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgY29uc3QgY2xhc3NOYW1lID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKGV4dHJhRGF0YSk7XG4gIGNvbnN0IHJlYWRPbmx5QXR0cmlidXRlcyA9IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXNcbiAgICA/IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXMoKVxuICAgIDogW107XG4gIGlmICghdGhpcy5vcmlnaW5hbERhdGEpIHtcbiAgICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICAgIGV4dHJhRGF0YVthdHRyaWJ1dGVdID0gdGhpcy5kYXRhW2F0dHJpYnV0ZV07XG4gICAgfVxuICB9XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbiAoZGF0YSwga2V5KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGFba2V5XS5fX29wID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXJlYWRPbmx5QXR0cmlidXRlcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWJkb2N1bWVudCBrZXkgd2l0aCBkb3Qgbm90YXRpb24geyAneC55JzogdiB9ID0+IHsgJ3gnOiB7ICd5JyA6IHYgfSB9KVxuICAgICAgICBjb25zdCBzcGxpdHRlZEtleSA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJlbnRWYWwgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICAgIH1cbiAgICAgICAgcGFyZW50VmFsW3NwbGl0dGVkS2V5WzFdXSA9IGRhdGFba2V5XTtcbiAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcblxuICBjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplZERhdGEoKTtcbiAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgZGVsZXRlIHNhbml0aXplZFthdHRyaWJ1dGVdO1xuICB9XG4gIHVwZGF0ZWRPYmplY3Quc2V0KHNhbml0aXplZCk7XG4gIHJldHVybiB7IHVwZGF0ZWRPYmplY3QsIG9yaWdpbmFsT2JqZWN0IH07XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uIChyZXNwb25zZSwgZGF0YSkge1xuICBjb25zdCB7IHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKHVwZGF0ZWRPYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpKTtcbiAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5wZW5kaW5nT3BzKSB7XG4gICAgaWYgKCFwZW5kaW5nW2tleV0pIHtcbiAgICAgIGRhdGFba2V5XSA9IHRoaXMub3JpZ2luYWxEYXRhID8gdGhpcy5vcmlnaW5hbERhdGFba2V5XSA6IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2tpcEtleXMgPSBbXG4gICAgJ29iamVjdElkJyxcbiAgICAnY3JlYXRlZEF0JyxcbiAgICAndXBkYXRlZEF0JyxcbiAgICAuLi4ocmVxdWlyZWRDb2x1bW5zLnJlYWRbdGhpcy5jbGFzc05hbWVdIHx8IFtdKSxcbiAgXTtcbiAgZm9yIChjb25zdCBrZXkgaW4gcmVzcG9uc2UpIHtcbiAgICBpZiAoc2tpcEtleXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gcmVzcG9uc2Vba2V5XTtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCB8fCAodmFsdWUuX190eXBlICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB8fCBkYXRhW2tleV0gPT09IHZhbHVlKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2Vba2V5XTtcbiAgICB9XG4gIH1cbiAgaWYgKF8uaXNFbXB0eSh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlcikpIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgY2xpZW50U3VwcG9ydHNEZWxldGUgPSBDbGllbnRTREsuc3VwcG9ydHNGb3J3YXJkRGVsZXRlKHRoaXMuY2xpZW50U0RLKTtcbiAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGNvbnN0IGRhdGFWYWx1ZSA9IGRhdGFbZmllbGROYW1lXTtcblxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3BvbnNlLCBmaWVsZE5hbWUpKSB7XG4gICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgIH1cblxuICAgIC8vIFN0cmlwcyBvcGVyYXRpb25zIGZyb20gcmVzcG9uc2VzXG4gICAgaWYgKHJlc3BvbnNlW2ZpZWxkTmFtZV0gJiYgcmVzcG9uc2VbZmllbGROYW1lXS5fX29wKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2VbZmllbGROYW1lXTtcbiAgICAgIGlmIChjbGllbnRTdXBwb3J0c0RlbGV0ZSAmJiBkYXRhVmFsdWUuX19vcCA9PSAnRGVsZXRlJykge1xuICAgICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFJlc3RXcml0ZTtcbm1vZHVsZS5leHBvcnRzID0gUmVzdFdyaXRlO1xuIl19