"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _RestQuery = _interopRequireDefault(require("./RestQuery"));

var _lodash = _interopRequireDefault(require("lodash"));

var _logger = _interopRequireDefault(require("./logger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".
var SchemaController = require('./Controllers/SchemaController');

var deepcopy = require('deepcopy');

const Auth = require('./Auth');

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
function RestWrite(config, auth, className, query, data, originalData, clientSDK, options) {
  if (auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Cannot perform a write operation when using readOnlyMasterKey');
  }

  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
  this.storage = {};
  this.runOptions = {};
  this.context = {};
  const allowObjectId = options && options.allowObjectId === true;

  if (!query && data.objectId && !allowObjectId) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId is an invalid field name.');
  }

  if (!query && data.id) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'id is an invalid field name.');
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
  } // Cloud code gets a bit of extra data for its objects


  var extraData = {
    className: this.className
  };

  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  }

  let originalObject = null;
  const updatedObject = this.buildUpdatedObject(extraData);

  if (this.query && this.query.objectId) {
    // This is an update for existing object.
    originalObject = triggers.inflate(extraData, this.originalData);
  }

  return Promise.resolve().then(() => {
    // Before calling the trigger, validate the permissions for the save operation
    let databasePromise = null;

    if (this.query) {
      // Validate for updating
      databasePromise = this.config.database.update(this.className, this.query, this.data, this.runOptions, false, true);
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
  };
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

  if (!this.data.authData || !Object.keys(this.data.authData).length) {
    return;
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

    if (!validateAuthData) {
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
  } // We need to a find to check for duplicate username in case they are missing the unique index on usernames
  // TODO: Check if there is a unique index, and if so, skip this query.


  return this.config.database.find(this.className, {
    username: this.data.username,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
    }

    return;
  });
};

RestWrite.prototype._validateEmail = function () {
  if (!this.data.email || this.data.email.__op === 'Delete') {
    return Promise.resolve();
  } // Validate basic email address format


  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  } // Same problem for email as above for username


  return this.config.database.find(this.className, {
    email: this.data.email,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1
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

RestWrite.prototype.createSessionToken = function () {
  // cloud installationId from Cloud Code,
  // never create session tokens from there.
  if (this.auth.installationId && this.auth.installationId === 'cloud') {
    return;
  }

  const {
    sessionData,
    createSession
  } = Auth.createSession(this.config, {
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
    } = Auth.createSession(this.config, {
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
}; // If we short-circuted the object response - then we need to make sure we expand all the files,
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
        ACL['*'] = {
          read: true,
          write: false
        };
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

  var extraData = {
    className: this.className
  };

  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  } // Build the original object, we only do this for a update write.


  let originalObject;

  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  } // Build the inflated object, different from beforeSave, originalData is not empty
  // since developers can change data in the beforeSave.


  const updatedObject = this.buildUpdatedObject(extraData);

  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);

  this.config.database.loadSchema().then(schemaController => {
    // Notifiy LiveQueryServer if possible
    const perms = schemaController.getClassLevelPermissions(updatedObject.className);
    this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
  }); // Run afterSave trigger

  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    if (result && typeof result === 'object') {
      this.response.response = result;
    }
  }).catch(function (err) {
    _logger.default.warn('afterSave caught an error', err);
  });
}; // A helper to figure out what location this operation happens at.


RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  return this.config.mount + middle + this.data.objectId;
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


RestWrite.prototype.buildUpdatedObject = function (extraData) {
  const updatedObject = triggers.inflate(extraData, this.originalData);
  Object.keys(this.data).reduce(function (data, key) {
    if (key.indexOf('.') > 0) {
      // subdocument key with dot notation ('x.y':v => 'x':{'y':v})
      const splittedKey = key.split('.');
      const parentProp = splittedKey[0];
      let parentVal = updatedObject.get(parentProp);

      if (typeof parentVal !== 'object') {
        parentVal = {};
      }

      parentVal[splittedKey[1]] = data[key];
      updatedObject.set(parentProp, parentVal);
      delete data[key];
    }

    return data;
  }, deepcopy(this.data));
  updatedObject.set(this.sanitizedData());
  return updatedObject;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJjcnlwdG9VdGlscyIsInBhc3N3b3JkQ3J5cHRvIiwiUGFyc2UiLCJ0cmlnZ2VycyIsIkNsaWVudFNESyIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJvcHRpb25zIiwiaXNSZWFkT25seSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiY29udGV4dCIsImFsbG93T2JqZWN0SWQiLCJvYmplY3RJZCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlc3BvbnNlIiwidXBkYXRlZEF0IiwiX2VuY29kZSIsIkRhdGUiLCJpc28iLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJwcm90b3R5cGUiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQiLCJ2YWxpZGF0ZVNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJzZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkIiwidHJhbnNmb3JtVXNlciIsImV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzIiwiZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyIsInJ1bkRhdGFiYXNlT3BlcmF0aW9uIiwiY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQiLCJoYW5kbGVGb2xsb3d1cCIsInJ1bkFmdGVyU2F2ZVRyaWdnZXIiLCJjbGVhblVzZXJBdXRoRGF0YSIsImlzTWFzdGVyIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJleHRyYURhdGEiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFVwZGF0ZWRPYmplY3QiLCJpbmZsYXRlIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwibGVuZ3RoIiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwidmFsdWUiLCJrZXkiLCJpc0VxdWFsIiwicHVzaCIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY3JlYXRlZEF0IiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImF1dGhEYXRhIiwidXNlcm5hbWUiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsInBhc3N3b3JkIiwiUEFTU1dPUkRfTUlTU0lORyIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwiY2FuSGFuZGxlIiwicHJvdmlkZXIiLCJwcm92aWRlckF1dGhEYXRhIiwiaGFzVG9rZW4iLCJoYW5kbGVBdXRoRGF0YSIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJ2YWxpZGF0aW9ucyIsIm1hcCIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiYWxsIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwibWVtbyIsInF1ZXJ5S2V5IiwiZmlsdGVyIiwicSIsImZpbmRQcm9taXNlIiwiJG9yIiwiZmlsdGVyZWRPYmplY3RzQnlBQ0wiLCJvYmplY3RzIiwiQUNMIiwicmVzdWx0cyIsInIiLCJqb2luIiwidXNlclJlc3VsdCIsIm11dGF0ZWRBdXRoRGF0YSIsInByb3ZpZGVyRGF0YSIsInVzZXJBdXRoRGF0YSIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJJZCIsImxvY2F0aW9uIiwiQUNDT1VOVF9BTFJFQURZX0xJTktFRCIsInByb21pc2UiLCJlcnJvciIsIlJlc3RRdWVyeSIsIm1hc3RlciIsIl9fdHlwZSIsInNlc3Npb24iLCJjYWNoZUNvbnRyb2xsZXIiLCJkZWwiLCJzZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVQYXNzd29yZFBvbGljeSIsImhhc2giLCJoYXNoZWRQYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfdmFsaWRhdGVVc2VyTmFtZSIsIl92YWxpZGF0ZUVtYWlsIiwicmFuZG9tU3RyaW5nIiwicmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUiLCIkbmUiLCJsaW1pdCIsIlVTRVJOQU1FX1RBS0VOIiwiZW1haWwiLCJtYXRjaCIsInJlamVjdCIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsIkVNQUlMX1RBS0VOIiwidXNlckNvbnRyb2xsZXIiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwicGFzc3dvcmRQb2xpY3kiLCJfdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyIsIl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSIsInBvbGljeUVycm9yIiwidmFsaWRhdGlvbkVycm9yIiwiY29udGFpbnNVc2VybmFtZUVycm9yIiwicGF0dGVyblZhbGlkYXRvciIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5Iiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsImNvbXBhcmUiLCJjYXRjaCIsImVyciIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImFkZE9wcyIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsImFzc2lnbiIsImRlc3Ryb3kiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0Iiwic2Vzc2lvblF1ZXJ5IiwiYmluZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInN0YXR1cyIsImRldmljZVRva2VuIiwidG9Mb3dlckNhc2UiLCJkZXZpY2VUeXBlIiwiaWRNYXRjaCIsIm9iamVjdElkTWF0Y2giLCJpbnN0YWxsYXRpb25JZE1hdGNoIiwiZGV2aWNlVG9rZW5NYXRjaGVzIiwib3JRdWVyaWVzIiwiZGVsUXVlcnkiLCJhcHBJZGVudGlmaWVyIiwiY29kZSIsIm9iaklkIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsInJvbGUiLCJjbGVhciIsImlzVW5hdXRoZW50aWNhdGVkIiwiU0VTU0lPTl9NSVNTSU5HIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJuYW1lIiwiSU5WQUxJRF9BQ0wiLCJyZWFkIiwid3JpdGUiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsIkRVUExJQ0FURV9WQUxVRSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImhhc0FmdGVyU2F2ZUhvb2siLCJhZnRlclNhdmUiLCJoYXNMaXZlUXVlcnkiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJsb2dnZXIiLCJ3YXJuIiwibWlkZGxlIiwibW91bnQiLCJzYW5pdGl6ZWREYXRhIiwidGVzdCIsIl9kZWNvZGUiLCJzcGxpdHRlZEtleSIsInNwbGl0IiwicGFyZW50UHJvcCIsInBhcmVudFZhbCIsImdldCIsInNldCIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQWFBOztBQUNBOztBQUNBOzs7O0FBZkE7QUFDQTtBQUNBO0FBRUEsSUFBSUEsZ0JBQWdCLEdBQUdDLE9BQU8sQ0FBQyxnQ0FBRCxDQUE5Qjs7QUFDQSxJQUFJQyxRQUFRLEdBQUdELE9BQU8sQ0FBQyxVQUFELENBQXRCOztBQUVBLE1BQU1FLElBQUksR0FBR0YsT0FBTyxDQUFDLFFBQUQsQ0FBcEI7O0FBQ0EsSUFBSUcsV0FBVyxHQUFHSCxPQUFPLENBQUMsZUFBRCxDQUF6Qjs7QUFDQSxJQUFJSSxjQUFjLEdBQUdKLE9BQU8sQ0FBQyxZQUFELENBQTVCOztBQUNBLElBQUlLLEtBQUssR0FBR0wsT0FBTyxDQUFDLFlBQUQsQ0FBbkI7O0FBQ0EsSUFBSU0sUUFBUSxHQUFHTixPQUFPLENBQUMsWUFB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OUUsUUFBUSxDQUFDMkUsU0FBRCxDQUFmOztBQUNBLFVBQUlpTCxvQkFBb0IsSUFBSUUsU0FBUyxDQUFDaEwsSUFBVixJQUFrQixRQUE5QyxFQUF3RDtBQUN0RDlFLFFBQUFBLFFBQVEsQ0FBQzJFLFNBQUQsQ0FBUixHQUFzQm1MLFNBQXRCO0FBQ0Q7QUFDRjtBQUNGLEdBZEQ7QUFlQSxTQUFPOVAsUUFBUDtBQUNELENBckJEOztlQXVCZW5CLFM7O0FBQ2ZvUixNQUFNLENBQUNDLE9BQVAsR0FBaUJyUixTQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEEgUmVzdFdyaXRlIGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGFuIG9wZXJhdGlvblxuLy8gdGhhdCB3cml0ZXMgdG8gdGhlIGRhdGFiYXNlLlxuLy8gVGhpcyBjb3VsZCBiZSBlaXRoZXIgYSBcImNyZWF0ZVwiIG9yIGFuIFwidXBkYXRlXCIuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgZGVlcGNvcHkgPSByZXF1aXJlKCdkZWVwY29weScpO1xuXG5jb25zdCBBdXRoID0gcmVxdWlyZSgnLi9BdXRoJyk7XG52YXIgY3J5cHRvVXRpbHMgPSByZXF1aXJlKCcuL2NyeXB0b1V0aWxzJyk7XG52YXIgcGFzc3dvcmRDcnlwdG8gPSByZXF1aXJlKCcuL3Bhc3N3b3JkJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG52YXIgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG52YXIgQ2xpZW50U0RLID0gcmVxdWlyZSgnLi9DbGllbnRTREsnKTtcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi9sb2dnZXInO1xuXG4vLyBxdWVyeSBhbmQgZGF0YSBhcmUgYm90aCBwcm92aWRlZCBpbiBSRVNUIEFQSSBmb3JtYXQuIFNvIGRhdGFcbi8vIHR5cGVzIGFyZSBlbmNvZGVkIGJ5IHBsYWluIG9sZCBvYmplY3RzLlxuLy8gSWYgcXVlcnkgaXMgbnVsbCwgdGhpcyBpcyBhIFwiY3JlYXRlXCIgYW5kIHRoZSBkYXRhIGluIGRhdGEgc2hvdWxkIGJlXG4vLyBjcmVhdGVkLlxuLy8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gXCJ1cGRhdGVcIiAtIHRoZSBvYmplY3QgbWF0Y2hpbmcgdGhlIHF1ZXJ5XG4vLyBzaG91bGQgZ2V0IHVwZGF0ZWQgd2l0aCBkYXRhLlxuLy8gUmVzdFdyaXRlIHdpbGwgaGFuZGxlIG9iamVjdElkLCBjcmVhdGVkQXQsIGFuZCB1cGRhdGVkQXQgZm9yXG4vLyBldmVyeXRoaW5nLiBJdCBhbHNvIGtub3dzIHRvIHVzZSB0cmlnZ2VycyBhbmQgc3BlY2lhbCBtb2RpZmljYXRpb25zXG4vLyBmb3IgdGhlIF9Vc2VyIGNsYXNzLlxuZnVuY3Rpb24gUmVzdFdyaXRlKFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgcXVlcnksXG4gIGRhdGEsXG4gIG9yaWdpbmFsRGF0YSxcbiAgY2xpZW50U0RLLFxuICBvcHRpb25zXG4pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAnQ2Fubm90IHBlcmZvcm0gYSB3cml0ZSBvcGVyYXRpb24gd2hlbiB1c2luZyByZWFkT25seU1hc3RlcktleSdcbiAgICApO1xuICB9XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMuc3RvcmFnZSA9IHt9O1xuICB0aGlzLnJ1bk9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0ge307XG5cbiAgY29uc3QgYWxsb3dPYmplY3RJZCA9IG9wdGlvbnMgJiYgb3B0aW9ucy5hbGxvd09iamVjdElkID09PSB0cnVlO1xuICBpZiAoIXF1ZXJ5ICYmIGRhdGEub2JqZWN0SWQgJiYgIWFsbG93T2JqZWN0SWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgJ29iamVjdElkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nXG4gICAgKTtcbiAgfVxuICBpZiAoIXF1ZXJ5ICYmIGRhdGEuaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgJ2lkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nXG4gICAgKTtcbiAgfVxuXG4gIC8vIFdoZW4gdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZSwgdGhpcy5yZXNwb25zZSBtYXkgaGF2ZSBzZXZlcmFsXG4gIC8vIGZpZWxkcy5cbiAgLy8gcmVzcG9uc2U6IHRoZSBhY3R1YWwgZGF0YSB0byBiZSByZXR1cm5lZFxuICAvLyBzdGF0dXM6IHRoZSBodHRwIHN0YXR1cyBjb2RlLiBpZiBub3QgcHJlc2VudCwgdHJlYXRlZCBsaWtlIGEgMjAwXG4gIC8vIGxvY2F0aW9uOiB0aGUgbG9jYXRpb24gaGVhZGVyLiBpZiBub3QgcHJlc2VudCwgbm8gbG9jYXRpb24gaGVhZGVyXG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuXG4gIC8vIFByb2Nlc3NpbmcgdGhpcyBvcGVyYXRpb24gbWF5IG11dGF0ZSBvdXIgZGF0YSwgc28gd2Ugb3BlcmF0ZSBvbiBhXG4gIC8vIGNvcHlcbiAgdGhpcy5xdWVyeSA9IGRlZXBjb3B5KHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gZGVlcGNvcHkoZGF0YSk7XG4gIC8vIFdlIG5ldmVyIGNoYW5nZSBvcmlnaW5hbERhdGEsIHNvIHdlIGRvIG5vdCBuZWVkIGEgZGVlcCBjb3B5XG4gIHRoaXMub3JpZ2luYWxEYXRhID0gb3JpZ2luYWxEYXRhO1xuXG4gIC8vIFRoZSB0aW1lc3RhbXAgd2UnbGwgdXNlIGZvciB0aGlzIHdob2xlIG9wZXJhdGlvblxuICB0aGlzLnVwZGF0ZWRBdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkuaXNvO1xuXG4gIC8vIFNoYXJlZCBTY2hlbWFDb250cm9sbGVyIHRvIGJlIHJldXNlZCB0byByZWR1Y2UgdGhlIG51bWJlciBvZiBsb2FkU2NoZW1hKCkgY2FsbHMgcGVyIHJlcXVlc3RcbiAgLy8gT25jZSBzZXQgdGhlIHNjaGVtYURhdGEgc2hvdWxkIGJlIGltbXV0YWJsZVxuICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IG51bGw7XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgdGhlXG4vLyB3cml0ZSwgaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSB7cmVzcG9uc2UsIHN0YXR1cywgbG9jYXRpb259IG9iamVjdC5cbi8vIHN0YXR1cyBhbmQgbG9jYXRpb24gYXJlIG9wdGlvbmFsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldFVzZXJBbmRSb2xlQUNMKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluc3RhbGxhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlU2Vzc2lvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW1xuICAgICAgICB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgK1xuICAgICAgICAgICAgICAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICtcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBzY2hlbWEuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlU2NoZW1hID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS52YWxpZGF0ZU9iamVjdChcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLmRhdGEsXG4gICAgdGhpcy5xdWVyeSxcbiAgICB0aGlzLnJ1bk9wdGlvbnNcbiAgKTtcbn07XG5cbi8vIFJ1bnMgYW55IGJlZm9yZVNhdmUgdHJpZ2dlcnMgYWdhaW5zdCB0aGlzIG9wZXJhdGlvbi5cbi8vIEFueSBjaGFuZ2UgbGVhZHMgdG8gb3VyIGRhdGEgYmVpbmcgbXV0YXRlZC5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICAgKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgdmFyIGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgZXh0cmFEYXRhLm9iamVjdElkID0gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgfVxuXG4gIGxldCBvcmlnaW5hbE9iamVjdCA9IG51bGw7XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0aGlzLmJ1aWxkVXBkYXRlZE9iamVjdChleHRyYURhdGEpO1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgLy8gVGhpcyBpcyBhbiB1cGRhdGUgZm9yIGV4aXN0aW5nIG9iamVjdC5cbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIGNyZWF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLmNyZWF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEluIHRoZSBjYXNlIHRoYXQgdGhlcmUgaXMgbm8gcGVybWlzc2lvbiBmb3IgdGhlIG9wZXJhdGlvbiwgaXQgdGhyb3dzIGFuIGVycm9yXG4gICAgICByZXR1cm4gZGF0YWJhc2VQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0Lmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIHRoaXMuYXV0aCxcbiAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gXy5yZWR1Y2UoXG4gICAgICAgICAgcmVzcG9uc2Uub2JqZWN0LFxuICAgICAgICAgIChyZXN1bHQsIHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZGF0YVtrZXldLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRhdGEgPSByZXNwb25zZS5vYmplY3Q7XG4gICAgICAgIC8vIFdlIHNob3VsZCBkZWxldGUgdGhlIG9iamVjdElkIGZvciBhbiB1cGRhdGUgd3JpdGVcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlTG9naW5UcmlnZ2VyID0gYXN5bmMgZnVuY3Rpb24odXNlckRhdGEpIHtcbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlTG9naW4nIHRyaWdnZXJcbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgICApXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcbiAgY29uc3QgdXNlciA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB1c2VyRGF0YSk7XG5cbiAgLy8gbm8gbmVlZCB0byByZXR1cm4gYSByZXNwb25zZVxuICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgdGhpcy5hdXRoLFxuICAgIHVzZXIsXG4gICAgbnVsbCxcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmNvbnRleHRcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5kYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKS50aGVuKGFsbENsYXNzZXMgPT4ge1xuICAgICAgY29uc3Qgc2NoZW1hID0gYWxsQ2xhc3Nlcy5maW5kKFxuICAgICAgICBvbmVDbGFzcyA9PiBvbmVDbGFzcy5jbGFzc05hbWUgPT09IHRoaXMuY2xhc3NOYW1lXG4gICAgICApO1xuICAgICAgY29uc3Qgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkID0gKGZpZWxkTmFtZSwgc2V0RGVmYXVsdCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSBudWxsIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICcnIHx8XG4gICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXREZWZhdWx0ICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IG51bGwgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgKHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9XG4gICAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5yZXF1aXJlZCA9PT0gdHJ1ZVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICBgJHtmaWVsZE5hbWV9IGlzIHJlcXVpcmVkYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBkZWZhdWx0IGZpZWxkc1xuICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcblxuICAgICAgICAvLyBPbmx5IGFzc2lnbiBuZXcgb2JqZWN0SWQgaWYgd2UgYXJlIGNyZWF0aW5nIG5ldyBvYmplY3RcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSBjcnlwdG9VdGlscy5uZXdPYmplY3RJZChcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLm9iamVjdElkU2l6ZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIHRydWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYSkge1xuICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCBmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cbi8vIFRyYW5zZm9ybXMgYXV0aCBkYXRhIGZvciBhIHVzZXIgb2JqZWN0LlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYSB1c2VyIG9iamVjdC5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVBdXRoRGF0YSA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8XG4gICAgICBfLmlzRW1wdHkodGhpcy5kYXRhLnVzZXJuYW1lKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLFxuICAgICAgICAnYmFkIG9yIG1pc3NpbmcgdXNlcm5hbWUnXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICB0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgXy5pc0VtcHR5KHRoaXMuZGF0YS5wYXNzd29yZClcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORyxcbiAgICAgICAgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXRoaXMuZGF0YS5hdXRoRGF0YSB8fCAhT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgYXV0aERhdGEgPSB0aGlzLmRhdGEuYXV0aERhdGE7XG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnJlZHVjZSgoY2FuSGFuZGxlLCBwcm92aWRlcikgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gY2FuSGFuZGxlICYmIChoYXNUb2tlbiB8fCBwcm92aWRlckF1dGhEYXRhID09IG51bGwpO1xuICAgIH0sIHRydWUpO1xuICAgIGlmIChjYW5IYW5kbGVBdXRoRGF0YSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24gPSBmdW5jdGlvbihhdXRoRGF0YSkge1xuICBjb25zdCB2YWxpZGF0aW9ucyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5tYXAocHJvdmlkZXIgPT4ge1xuICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgdmFsaWRhdGVBdXRoRGF0YSA9IHRoaXMuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihcbiAgICAgIHByb3ZpZGVyXG4gICAgKTtcbiAgICBpZiAoIXZhbGlkYXRlQXV0aERhdGEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB2YWxpZGF0ZUF1dGhEYXRhKGF1dGhEYXRhW3Byb3ZpZGVyXSk7XG4gIH0pO1xuICByZXR1cm4gUHJvbWlzZS5hbGwodmFsaWRhdGlvbnMpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maW5kVXNlcnNXaXRoQXV0aERhdGEgPSBmdW5jdGlvbihhdXRoRGF0YSkge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICBsZXQgZmluZFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoW10pO1xuICBpZiAocXVlcnkubGVuZ3RoID4gMCkge1xuICAgIGZpbmRQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCh0aGlzLmNsYXNzTmFtZSwgeyAkb3I6IHF1ZXJ5IH0sIHt9KTtcbiAgfVxuXG4gIHJldHVybiBmaW5kUHJvbWlzZTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmlsdGVyZWRPYmplY3RzQnlBQ0wgPSBmdW5jdGlvbihvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBmdW5jdGlvbihhdXRoRGF0YSkge1xuICBsZXQgcmVzdWx0cztcbiAgcmV0dXJuIHRoaXMuZmluZFVzZXJzV2l0aEF1dGhEYXRhKGF1dGhEYXRhKS50aGVuKGFzeW5jIHIgPT4ge1xuICAgIHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoID09IDEpIHtcbiAgICAgIHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgICBjb25zdCB1c2VyUmVzdWx0ID0gcmVzdWx0c1swXTtcbiAgICAgIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICAgICAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnN0IHVzZXJBdXRoRGF0YSA9IHVzZXJSZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBpZiAoIV8uaXNFcXVhbChwcm92aWRlckRhdGEsIHVzZXJBdXRoRGF0YSkpIHtcbiAgICAgICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICAgICAgbGV0IHVzZXJJZDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgdXNlcklkID0gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICAgIHVzZXJJZCA9IHRoaXMuYXV0aC51c2VyLmlkO1xuICAgICAgfVxuICAgICAgaWYgKCF1c2VySWQgfHwgdXNlcklkID09PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB7XG4gICAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAgIC8vIE9SIHRoZSB1c2VyIG1ha2luZyB0aGUgY2FsbCBpcyB0aGUgcmlnaHQgb25lXG4gICAgICAgIC8vIExvZ2luIHdpdGggYXV0aCBkYXRhXG4gICAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBvYmplY3RJZCBmaXJzdCBvdGhlcndpc2UgbG9jYXRpb24gaGFzIHRyYWlsaW5nIHVuZGVmaW5lZFxuICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSB1c2VyUmVzdWx0Lm9iamVjdElkO1xuXG4gICAgICAgIGlmICghdGhpcy5xdWVyeSB8fCAhdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIC8vIHRoaXMgYSBsb2dpbiBjYWxsLCBubyB1c2VySWQgcGFzc2VkXG4gICAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB1c2VyUmVzdWx0LFxuICAgICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIC8vIFJ1biBiZWZvcmVMb2dpbiBob29rIGJlZm9yZSBzdG9yaW5nIGFueSB1cGRhdGVzXG4gICAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgICAvLyB3aWxsIGJlIGlnbm9yZWQuXG4gICAgICAgICAgYXdhaXQgdGhpcy5ydW5CZWZvcmVMb2dpblRyaWdnZXIoZGVlcGNvcHkodXNlclJlc3VsdCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UgZGlkbid0IGNoYW5nZSB0aGUgYXV0aCBkYXRhLCBqdXN0IGtlZXAgZ29pbmdcbiAgICAgICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gV2UgaGF2ZSBhdXRoRGF0YSB0aGF0IGlzIHVwZGF0ZWQgb24gbG9naW5cbiAgICAgICAgLy8gdGhhdCBjYW4gaGFwcGVuIHdoZW4gdG9rZW4gYXJlIHJlZnJlc2hlZCxcbiAgICAgICAgLy8gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgdG9rZW4gYW5kIGxldCB0aGUgdXNlciBpblxuICAgICAgICAvLyBXZSBzaG91bGQgb25seSBjaGVjayB0aGUgbXV0YXRlZCBrZXlzXG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihtdXRhdGVkQXV0aERhdGEpLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIC8vIElGIHdlIGhhdmUgYSByZXNwb25zZSwgd2UnbGwgc2tpcCB0aGUgZGF0YWJhc2Ugb3BlcmF0aW9uIC8gYmVmb3JlU2F2ZSAvIGFmdGVyU2F2ZSBldGMuLi5cbiAgICAgICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgICAgIC8vIElmIHdlJ3JlIG5vdCBsb2dnaW5nIGluLCBidXQganVzdCB1cGRhdGluZyB0aGUgY3VycmVudCB1c2VyLCB3ZSBjYW4gc2FmZWx5IHNraXAgdGhhdCBwYXJ0XG4gICAgICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIC8vIEFzc2lnbiB0aGUgbmV3IGF1dGhEYXRhIGluIHRoZSByZXNwb25zZVxuICAgICAgICAgICAgT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPVxuICAgICAgICAgICAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gUnVuIHRoZSBEQiB1cGRhdGUgZGlyZWN0bHksIGFzICdtYXN0ZXInXG4gICAgICAgICAgICAvLyBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAgICAgLy8gVGhlbiB3ZSdyZSBnb29kIGZvciB0aGUgdXNlciwgZWFybHkgZXhpdCBvZiBzb3J0c1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMuZGF0YS5vYmplY3RJZCB9LFxuICAgICAgICAgICAgICB7IGF1dGhEYXRhOiBtdXRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAgICAgICAge31cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAodXNlcklkKSB7XG4gICAgICAgIC8vIFRyeWluZyB0byB1cGRhdGUgYXV0aCBkYXRhIGJ1dCB1c2Vyc1xuICAgICAgICAvLyBhcmUgZGlmZmVyZW50XG4gICAgICAgIGlmICh1c2VyUmVzdWx0Lm9iamVjdElkICE9PSB1c2VySWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELFxuICAgICAgICAgICAgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBObyBhdXRoIGRhdGEgd2FzIG11dGF0ZWQsIGp1c3Qga2VlcCBnb2luZ1xuICAgICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oYXV0aERhdGEpLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAvLyBNb3JlIHRoYW4gMSB1c2VyIHdpdGggdGhlIHBhc3NlZCBpZCdzXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELFxuICAgICAgICAgICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFRoZSBub24tdGhpcmQtcGFydHkgcGFydHMgb2YgVXNlciB0cmFuc2Zvcm1hdGlvblxuUmVzdFdyaXRlLnByb3RvdHlwZS50cmFuc2Zvcm1Vc2VyID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC5pc01hc3RlciAmJiAnZW1haWxWZXJpZmllZCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgZXJyb3IgPSBgQ2xpZW50cyBhcmVuJ3QgYWxsb3dlZCB0byBtYW51YWxseSB1cGRhdGUgZW1haWwgdmVyaWZpY2F0aW9uLmA7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sIGVycm9yKTtcbiAgfVxuXG4gIC8vIERvIG5vdCBjbGVhbnVwIHNlc3Npb24gaWYgb2JqZWN0SWQgaXMgbm90IHNldFxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLm9iamVjdElkKCkpIHtcbiAgICAvLyBJZiB3ZSdyZSB1cGRhdGluZyBhIF9Vc2VyIG9iamVjdCwgd2UgbmVlZCB0byBjbGVhciBvdXQgdGhlIGNhY2hlIGZvciB0aGF0IHVzZXIuIEZpbmQgYWxsIHRoZWlyXG4gICAgLy8gc2Vzc2lvbiB0b2tlbnMsIGFuZCByZW1vdmUgdGhlbSBmcm9tIHRoZSBjYWNoZS5cbiAgICBwcm9taXNlID0gbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH0pXG4gICAgICAuZXhlY3V0ZSgpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgcmVzdWx0cy5yZXN1bHRzLmZvckVhY2goc2Vzc2lvbiA9PlxuICAgICAgICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uLnNlc3Npb25Ub2tlbilcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBUcmFuc2Zvcm0gdGhlIHBhc3N3b3JkXG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gaWdub3JlIG9ubHkgaWYgdW5kZWZpbmVkLiBzaG91bGQgcHJvY2VlZCBpZiBlbXB0eSAoJycpXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gPSB0cnVlO1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIG5ldyBzZXNzaW9uIG9ubHkgaWYgdGhlIHVzZXIgcmVxdWVzdGVkXG4gICAgICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3koKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmhhc2godGhpcy5kYXRhLnBhc3N3b3JkKS50aGVuKGhhc2hlZFBhc3N3b3JkID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCA9IGhhc2hlZFBhc3N3b3JkO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVVc2VyTmFtZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlRW1haWwoKTtcbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlVXNlck5hbWUgPSBmdW5jdGlvbigpIHtcbiAgLy8gQ2hlY2sgZm9yIHVzZXJuYW1lIHVuaXF1ZW5lc3NcbiAgaWYgKCF0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgIHRoaXMuZGF0YS51c2VybmFtZSA9IGNyeXB0b1V0aWxzLnJhbmRvbVN0cmluZygyNSk7XG4gICAgICB0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFdlIG5lZWQgdG8gYSBmaW5kIHRvIGNoZWNrIGZvciBkdXBsaWNhdGUgdXNlcm5hbWUgaW4gY2FzZSB0aGV5IGFyZSBtaXNzaW5nIHRoZSB1bmlxdWUgaW5kZXggb24gdXNlcm5hbWVzXG4gIC8vIFRPRE86IENoZWNrIGlmIHRoZXJlIGlzIGEgdW5pcXVlIGluZGV4LCBhbmQgaWYgc28sIHNraXAgdGhpcyBxdWVyeS5cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHsgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSwgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSB9LFxuICAgICAgeyBsaW1pdDogMSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlRW1haWwgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwgfHwgdGhpcy5kYXRhLmVtYWlsLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFZhbGlkYXRlIGJhc2ljIGVtYWlsIGFkZHJlc3MgZm9ybWF0XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsLm1hdGNoKC9eLitALiskLykpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ0VtYWlsIGFkZHJlc3MgZm9ybWF0IGlzIGludmFsaWQuJ1xuICAgICAgKVxuICAgICk7XG4gIH1cbiAgLy8gU2FtZSBwcm9ibGVtIGZvciBlbWFpbCBhcyBhYm92ZSBmb3IgdXNlcm5hbWVcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHsgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCwgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSB9LFxuICAgICAgeyBsaW1pdDogMSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAhdGhpcy5kYXRhLmF1dGhEYXRhIHx8XG4gICAgICAgICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCB8fFxuICAgICAgICAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpWzBdID09PSAnYW5vbnltb3VzJylcbiAgICAgICkge1xuICAgICAgICAvLyBXZSB1cGRhdGVkIHRoZSBlbWFpbCwgc2VuZCBhIG5ldyB2YWxpZGF0aW9uXG4gICAgICAgIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10gPSB0cnVlO1xuICAgICAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZXRFbWFpbFZlcmlmeVRva2VuKHRoaXMuZGF0YSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kpIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMoKS50aGVuKCgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkoKTtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzID0gZnVuY3Rpb24oKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBwb2xpY3lFcnJvcilcbiAgICApO1xuICB9XG5cbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBjb250YWluIHVzZXJuYW1lXG4gIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgPT09IHRydWUpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgICAvLyB1c2VybmFtZSBpcyBub3QgcGFzc2VkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHRoaXMuZGF0YS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpXG4gICAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHJldHJpZXZlIHRoZSBVc2VyIG9iamVjdCB1c2luZyBvYmplY3RJZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHJlc3VsdHNbMF0udXNlcm5hbWUpID49IDApXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgIGNvbnRhaW5zVXNlcm5hbWVFcnJvclxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5ID0gZnVuY3Rpb24oKSB7XG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgaXMgcmVwZWF0aW5nIGZyb20gc3BlY2lmaWVkIGhpc3RvcnlcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAxXG4gICAgICAgICAgKTtcbiAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgIGNvbnN0IG5ld1Bhc3N3b3JkID0gdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICAvLyBjb21wYXJlIHRoZSBuZXcgcGFzc3dvcmQgaGFzaCB3aXRoIGFsbCBvbGQgcGFzc3dvcmQgaGFzaGVzXG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gb2xkUGFzc3dvcmRzLm1hcChmdW5jdGlvbihoYXNoKSB7XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUobmV3UGFzc3dvcmQsIGhhc2gpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAgIC8vIHJlamVjdCBpZiB0aGVyZSBpcyBhIG1hdGNoXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCgnUkVQRUFUX1BBU1NXT1JEJyk7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB3YWl0IGZvciBhbGwgY29tcGFyaXNvbnMgdG8gY29tcGxldGVcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyciA9PT0gJ1JFUEVBVF9QQVNTV09SRCcpXG4gICAgICAgICAgICAgIC8vIGEgbWF0Y2ggd2FzIGZvdW5kXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgYE5ldyBwYXNzd29yZCBzaG91bGQgbm90IGJlIHRoZSBzYW1lIGFzIGxhc3QgJHt0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3Rvcnl9IHBhc3N3b3Jkcy5gXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChcbiAgICAhdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSAmJiAvLyBzaWdudXAgY2FsbCwgd2l0aFxuICAgIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiYgLy8gbm8gbG9naW4gd2l0aG91dCB2ZXJpZmljYXRpb25cbiAgICB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzXG4gICkge1xuICAgIC8vIHZlcmlmaWNhdGlvbiBpcyBvblxuICAgIHJldHVybjsgLy8gZG8gbm90IGNyZWF0ZSB0aGUgc2Vzc2lvbiB0b2tlbiBpbiB0aGF0IGNhc2UhXG4gIH1cbiAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbiA9IGZ1bmN0aW9uKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IEF1dGguY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgIHVzZXJJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICBhY3Rpb246IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPyAnbG9naW4nIDogJ3NpZ251cCcsXG4gICAgICBhdXRoUHJvdmlkZXI6IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gfHwgJ3Bhc3N3b3JkJyxcbiAgICB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gIH0pO1xuXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVTZXNzaW9uKCk7XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLnF1ZXJ5ID09PSBudWxsKSB7XG4gICAgLy8gbnVsbCBxdWVyeSBtZWFucyBjcmVhdGVcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoJ3Bhc3N3b3JkJyBpbiB0aGlzLmRhdGEgfHwgJ2VtYWlsJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBhZGRPcHMgPSB7XG4gICAgICBfcGVyaXNoYWJsZV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG4gICAgdGhpcy5kYXRhID0gT2JqZWN0LmFzc2lnbih0aGlzLmRhdGEsIGFkZE9wcyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyA9IGZ1bmN0aW9uKCkge1xuICAvLyBPbmx5IGZvciBfU2Vzc2lvbiwgYW5kIGF0IGNyZWF0aW9uIHRpbWVcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9ICdfU2Vzc2lvbicgfHwgdGhpcy5xdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEZXN0cm95IHRoZSBzZXNzaW9ucyBpbiAnQmFja2dyb3VuZCdcbiAgY29uc3QgeyB1c2VyLCBpbnN0YWxsYXRpb25JZCwgc2Vzc2lvblRva2VuIH0gPSB0aGlzLmRhdGE7XG4gIGlmICghdXNlciB8fCAhaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF1c2VyLm9iamVjdElkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koXG4gICAgJ19TZXNzaW9uJyxcbiAgICB7XG4gICAgICB1c2VyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBzZXNzaW9uVG9rZW46IHsgJG5lOiBzZXNzaW9uVG9rZW4gfSxcbiAgICB9LFxuICAgIHt9LFxuICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICk7XG59O1xuXG4vLyBIYW5kbGVzIGFueSBmb2xsb3d1cCBsb2dpY1xuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVGb2xsb3d1cCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoXG4gICAgdGhpcy5zdG9yYWdlICYmXG4gICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gJiZcbiAgICB0aGlzLmNvbmZpZy5yZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0XG4gICkge1xuICAgIHZhciBzZXNzaW9uUXVlcnkgPSB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH07XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmRlc3Ryb3koJ19TZXNzaW9uJywgc2Vzc2lvblF1ZXJ5KVxuICAgICAgLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddO1xuICAgIC8vIEZpcmUgYW5kIGZvcmdldCFcbiAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodGhpcy5kYXRhKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfU2Vzc2lvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIF9TZXNzaW9uIG9iamVjdC5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlU2Vzc2lvbiA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLidcbiAgICApO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJ1xuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmIChcbiAgICAgIHRoaXMuZGF0YS51c2VyICYmXG4gICAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgICB0aGlzLmRhdGEudXNlci5vYmplY3RJZCAhPSB0aGlzLmF1dGgudXNlci5pZFxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kYXRhKSB7XG4gICAgICBpZiAoa2V5ID09PSAnb2JqZWN0SWQnIHx8IGtleSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBBdXRoLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdjcmVhdGUnLFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSxcbiAgICB9KTtcblxuICAgIHJldHVybiBjcmVhdGVTZXNzaW9uKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5yZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHNlc3Npb25EYXRhWydvYmplY3RJZCddID0gcmVzdWx0cy5yZXNwb25zZVsnb2JqZWN0SWQnXTtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICBsb2NhdGlvbjogcmVzdWx0cy5sb2NhdGlvbixcbiAgICAgICAgcmVzcG9uc2U6IHNlc3Npb25EYXRhLFxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX0luc3RhbGxhdGlvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIGluc3RhbGxhdGlvbiBvYmplY3QuXG4vLyBJZiBhbiBpbnN0YWxsYXRpb24gaXMgZm91bmQsIHRoaXMgY2FuIG11dGF0ZSB0aGlzLnF1ZXJ5IGFuZCB0dXJuIGEgY3JlYXRlXG4vLyBpbnRvIGFuIHVwZGF0ZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlSW5zdGFsbGF0aW9uID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICtcbiAgICAgICAgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmIChcbiAgICB0aGlzLnF1ZXJ5ICYmXG4gICAgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICFpbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVHlwZVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIHZhciBpZE1hdGNoOyAvLyBXaWxsIGJlIGEgbWF0Y2ggb24gZWl0aGVyIG9iamVjdElkIG9yIGluc3RhbGxhdGlvbklkXG4gIHZhciBvYmplY3RJZE1hdGNoO1xuICB2YXIgaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgdmFyIGRldmljZVRva2VuTWF0Y2hlcyA9IFtdO1xuXG4gIC8vIEluc3RlYWQgb2YgaXNzdWluZyAzIHJlYWRzLCBsZXQncyBkbyBpdCB3aXRoIG9uZSBPUi5cbiAgY29uc3Qgb3JRdWVyaWVzID0gW107XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBvYmplY3RJZDogdGhpcy5xdWVyeS5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgIG9yUXVlcmllcy5wdXNoKHsgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbiB9KTtcbiAgfVxuXG4gIGlmIChvclF1ZXJpZXMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlID0gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAnX0luc3RhbGxhdGlvbicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IG9yUXVlcmllcyxcbiAgICAgICAgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5xdWVyeSAmJlxuICAgICAgICAgIHRoaXMucXVlcnkub2JqZWN0SWQgJiZcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPT0gdGhpcy5xdWVyeS5vYmplY3RJZFxuICAgICAgICApIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTM2LFxuICAgICAgICAgICAgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTM2LFxuICAgICAgICAgICAgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIDEzNixcbiAgICAgICAgICAgICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIDEzNSxcbiAgICAgICAgICAnZGV2aWNlVHlwZSBtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJlxuICAgICAgICAgICFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ11cbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgICAgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW5cbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAgIC5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpXG4gICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJbiBub24tbWVyZ2Ugc2NlbmFyaW9zLCBqdXN0IHJldHVybiB0aGUgaW5zdGFsbGF0aW9uIG1hdGNoIGlkXG4gICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKG9iaklkID0+IHtcbiAgICAgIGlmIChvYmpJZCkge1xuICAgICAgICB0aGlzLnF1ZXJ5ID0geyBvYmplY3RJZDogb2JqSWQgfTtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICB9XG4gICAgICAvLyBUT0RPOiBWYWxpZGF0ZSBvcHMgKGFkZC9yZW1vdmUgb24gY2hhbm5lbHMsICRpbmMgb24gYmFkZ2UsIGV0Yy4pXG4gICAgfSk7XG4gIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8gSWYgd2Ugc2hvcnQtY2lyY3V0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBmdW5jdGlvbigpIHtcbiAgLy8gQ2hlY2sgd2hldGhlciB3ZSBoYXZlIGEgc2hvcnQtY2lyY3VpdGVkIHJlc3BvbnNlIC0gb25seSB0aGVuIHJ1biBleHBhbnNpb24uXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZVxuICAgICk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuRGF0YWJhc2VPcGVyYXRpb24gPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUm9sZScpIHtcbiAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIucm9sZS5jbGVhcigpO1xuICB9XG5cbiAgaWYgKFxuICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgdGhpcy5xdWVyeSAmJlxuICAgIHRoaXMuYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORyxcbiAgICAgIGBDYW5ub3QgbW9kaWZ5IHVzZXIgJHt0aGlzLnF1ZXJ5Lm9iamVjdElkfS5gXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Qcm9kdWN0JyAmJiB0aGlzLmRhdGEuZG93bmxvYWQpIHtcbiAgICB0aGlzLmRhdGEuZG93bmxvYWROYW1lID0gdGhpcy5kYXRhLmRvd25sb2FkLm5hbWU7XG4gIH1cblxuICAvLyBUT0RPOiBBZGQgYmV0dGVyIGRldGVjdGlvbiBmb3IgQUNMLCBlbnN1cmluZyBhIHVzZXIgY2FuJ3QgYmUgbG9ja2VkIGZyb21cbiAgLy8gICAgICAgdGhlaXIgb3duIHVzZXIgcmVjb3JkLlxuICBpZiAodGhpcy5kYXRhLkFDTCAmJiB0aGlzLmRhdGEuQUNMWycqdW5yZXNvbHZlZCddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQUNMLCAnSW52YWxpZCBBQ0wuJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIC8vIEZvcmNlIHRoZSB1c2VyIHRvIG5vdCBsb2Nrb3V0XG4gICAgLy8gTWF0Y2hlZCB3aXRoIHBhcnNlLmNvbVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuQUNMICYmXG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXIgIT09IHRydWVcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vbi0xIHBhc3N3b3JkcyBnbyBpbnRvIGhpc3RvcnkgaW5jbHVkaW5nIGxhc3QgcGFzc3dvcmRcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBvbGRQYXNzd29yZHMubGVuZ3RoID5cbiAgICAgICAgICAgIE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0geyByZXNwb25zZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTZXQgdGhlIGRlZmF1bHQgQUNMIGFuZCBwYXNzd29yZCB0aW1lc3RhbXAgZm9yIHRoZSBuZXcgX1VzZXJcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIHZhciBBQ0wgPSB0aGlzLmRhdGEuQUNMO1xuICAgICAgLy8gZGVmYXVsdCBwdWJsaWMgci93IEFDTFxuICAgICAgaWYgKCFBQ0wpIHtcbiAgICAgICAgQUNMID0ge307XG4gICAgICAgIEFDTFsnKiddID0geyByZWFkOiB0cnVlLCB3cml0ZTogZmFsc2UgfTtcbiAgICAgIH1cbiAgICAgIC8vIG1ha2Ugc3VyZSB0aGUgdXNlciBpcyBub3QgbG9ja2VkIGRvd25cbiAgICAgIEFDTFt0aGlzLmRhdGEub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgICAgdGhpcy5kYXRhLkFDTCA9IEFDTDtcbiAgICAgIC8vIHBhc3N3b3JkIHRpbWVzdGFtcCB0byBiZSB1c2VkIHdoZW4gcGFzc3dvcmQgZXhwaXJ5IHBvbGljeSBpcyBlbmZvcmNlZFxuICAgICAgaWYgKFxuICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgKSB7XG4gICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUnVuIGEgY3JlYXRlXG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuY3JlYXRlKFxuICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgIGZhbHNlLFxuICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUXVpY2sgY2hlY2ssIGlmIHdlIHdlcmUgYWJsZSB0byBpbmZlciB0aGUgZHVwbGljYXRlZCBmaWVsZCBuYW1lXG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnJvciAmJlxuICAgICAgICAgIGVycm9yLnVzZXJJbmZvICYmXG4gICAgICAgICAgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yICYmXG4gICAgICAgICAgZXJyb3IudXNlckluZm8gJiZcbiAgICAgICAgICBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAnZW1haWwnXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSB8fCAhdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJTYXZlSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgY29uc3QgaGFzTGl2ZVF1ZXJ5ID0gdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5oYXNMaXZlUXVlcnkoXG4gICAgdGhpcy5jbGFzc05hbWVcbiAgKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB2YXIgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBleHRyYURhdGEub2JqZWN0SWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIG9yaWdpbmFsIG9iamVjdCwgd2Ugb25seSBkbyB0aGlzIGZvciBhIHVwZGF0ZSB3cml0ZS5cbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIGluZmxhdGVkIG9iamVjdCwgZGlmZmVyZW50IGZyb20gYmVmb3JlU2F2ZSwgb3JpZ2luYWxEYXRhIGlzIG5vdCBlbXB0eVxuICAvLyBzaW5jZSBkZXZlbG9wZXJzIGNhbiBjaGFuZ2UgZGF0YSBpbiB0aGUgYmVmb3JlU2F2ZS5cbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRoaXMuYnVpbGRVcGRhdGVkT2JqZWN0KGV4dHJhRGF0YSk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZShcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLFxuICAgIHRoaXMucmVzcG9uc2Uuc3RhdHVzIHx8IDIwMFxuICApO1xuXG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgIC8vIE5vdGlmaXkgTGl2ZVF1ZXJ5U2VydmVyIGlmIHBvc3NpYmxlXG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhcbiAgICAgIHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lXG4gICAgKTtcbiAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLm9uQWZ0ZXJTYXZlKFxuICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWUsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICBwZXJtc1xuICAgICk7XG4gIH0pO1xuXG4gIC8vIFJ1biBhZnRlclNhdmUgdHJpZ2dlclxuICByZXR1cm4gdHJpZ2dlcnNcbiAgICAubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICB0aGlzLmNvbnRleHRcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgIGlmIChyZXN1bHQgJiYgdHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHJlc3VsdDtcbiAgICAgIH1cbiAgICB9KVxuICAgIC5jYXRjaChmdW5jdGlvbihlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgbWlkZGxlID1cbiAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyA/ICcvdXNlcnMvJyA6ICcvY2xhc3Nlcy8nICsgdGhpcy5jbGFzc05hbWUgKyAnLyc7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5tb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5kYXRhLm9iamVjdElkIHx8IHRoaXMucXVlcnkub2JqZWN0SWQ7XG59O1xuXG4vLyBSZXR1cm5zIGEgY29weSBvZiB0aGUgZGF0YSBhbmQgZGVsZXRlIGJhZCBrZXlzIChfYXV0aF9kYXRhLCBfaGFzaGVkX3Bhc3N3b3JkLi4uKVxuUmVzdFdyaXRlLnByb3RvdHlwZS5zYW5pdGl6ZWREYXRhID0gZnVuY3Rpb24oKSB7XG4gIGNvbnN0IGRhdGEgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZSgoZGF0YSwga2V5KSA9PiB7XG4gICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgIGlmICghL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcbiAgcmV0dXJuIFBhcnNlLl9kZWNvZGUodW5kZWZpbmVkLCBkYXRhKTtcbn07XG5cbi8vIFJldHVybnMgYW4gdXBkYXRlZCBjb3B5IG9mIHRoZSBvYmplY3RcblJlc3RXcml0ZS5wcm90b3R5cGUuYnVpbGRVcGRhdGVkT2JqZWN0ID0gZnVuY3Rpb24oZXh0cmFEYXRhKSB7XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbihkYXRhLCBrZXkpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIC8vIHN1YmRvY3VtZW50IGtleSB3aXRoIGRvdCBub3RhdGlvbiAoJ3gueSc6diA9PiAneCc6eyd5Jzp2fSlcbiAgICAgIGNvbnN0IHNwbGl0dGVkS2V5ID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICBsZXQgcGFyZW50VmFsID0gdXBkYXRlZE9iamVjdC5nZXQocGFyZW50UHJvcCk7XG4gICAgICBpZiAodHlwZW9mIHBhcmVudFZhbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICB9XG4gICAgICBwYXJlbnRWYWxbc3BsaXR0ZWRLZXlbMV1dID0gZGF0YVtrZXldO1xuICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcblxuICB1cGRhdGVkT2JqZWN0LnNldCh0aGlzLnNhbml0aXplZERhdGEoKSk7XG4gIHJldHVybiB1cGRhdGVkT2JqZWN0O1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jbGVhblVzZXJBdXRoRGF0YSA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uKHJlc3BvbnNlLCBkYXRhKSB7XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IGNsaWVudFN1cHBvcnRzRGVsZXRlID0gQ2xpZW50U0RLLnN1cHBvcnRzRm9yd2FyZERlbGV0ZSh0aGlzLmNsaWVudFNESyk7XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdfQ==