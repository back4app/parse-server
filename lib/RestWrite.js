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
    // Add default fields
    this.data.updatedAt = this.updatedAt;

    if (!this.query) {
      this.data.createdAt = this.updatedAt; // Only assign new objectId if we are creating new object

      if (!this.data.objectId) {
        this.data.objectId = cryptoUtils.newObjectId(this.config.objectIdSize);
      }
    }
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

  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).catch(function (err) {
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

    if (!response.hasOwnProperty(fieldName)) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJjcnlwdG9VdGlscyIsInBhc3N3b3JkQ3J5cHRvIiwiUGFyc2UiLCJ0cmlnZ2VycyIsIkNsaWVudFNESyIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJvcHRpb25zIiwiaXNSZWFkT25seSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiY29udGV4dCIsImFsbG93T2JqZWN0SWQiLCJvYmplY3RJZCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlc3BvbnNlIiwidXBkYXRlZEF0IiwiX2VuY29kZSIsIkRhdGUiLCJpc28iLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJwcm90b3R5cGUiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQiLCJ2YWxpZGF0ZVNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJzZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkIiwidHJhbnNmb3JtVXNlciIsImV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzIiwiZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyIsInJ1bkRhdGFiYXNlT3BlcmF0aW9uIiwiY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQiLCJoYW5kbGVGb2xsb3d1cCIsInJ1bkFmdGVyU2F2ZVRyaWdnZXIiLCJjbGVhblVzZXJBdXRoRGF0YSIsImlzTWFzdGVyIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJleHRyYURhdGEiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFVwZGF0ZWRPYmplY3QiLCJpbmZsYXRlIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwibGVuZ3RoIiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwidmFsdWUiLCJrZXkiLCJpc0VxdWFsIiwicHVzaCIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJjcmVhdGVkQXQiLCJuZXdPYmplY3RJZCIsIm9iamVjdElkU2l6ZSIsImF1dGhEYXRhIiwidXNlcm5hbWUiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsInBhc3N3b3JkIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9iamVjdCIsImtleXMiLCJwcm92aWRlcnMiLCJjYW5IYW5kbGVBdXRoRGF0YSIsImNhbkhhbmRsZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiaGFuZGxlQXV0aERhdGEiLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwidmFsaWRhdGlvbnMiLCJtYXAiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsImFsbCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsIm1lbW8iLCJxdWVyeUtleSIsImZpbHRlciIsInEiLCJmaW5kUHJvbWlzZSIsImZpbmQiLCIkb3IiLCJmaWx0ZXJlZE9iamVjdHNCeUFDTCIsIm9iamVjdHMiLCJBQ0wiLCJyZXN1bHRzIiwiciIsImpvaW4iLCJ1c2VyUmVzdWx0IiwibXV0YXRlZEF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyRGF0YSIsInVzZXJBdXRoRGF0YSIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJJZCIsImxvY2F0aW9uIiwiQUNDT1VOVF9BTFJFQURZX0xJTktFRCIsInByb21pc2UiLCJlcnJvciIsIlJlc3RRdWVyeSIsIm1hc3RlciIsIl9fdHlwZSIsInNlc3Npb24iLCJjYWNoZUNvbnRyb2xsZXIiLCJkZWwiLCJzZXNzaW9uVG9rZW4iLCJ1bmRlZmluZWQiLCJfdmFsaWRhdGVQYXNzd29yZFBvbGljeSIsImhhc2giLCJoYXNoZWRQYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfdmFsaWRhdGVVc2VyTmFtZSIsIl92YWxpZGF0ZUVtYWlsIiwicmFuZG9tU3RyaW5nIiwicmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUiLCIkbmUiLCJsaW1pdCIsIlVTRVJOQU1FX1RBS0VOIiwiZW1haWwiLCJfX29wIiwibWF0Y2giLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsIlZBTElEQVRJT05fRVJST1IiLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJvbGRQYXNzd29yZHMiLCJfcGFzc3dvcmRfaGlzdG9yeSIsInRha2UiLCJuZXdQYXNzd29yZCIsInByb21pc2VzIiwiY29tcGFyZSIsImNhdGNoIiwiZXJyIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsInZlcmlmeVVzZXJFbWFpbHMiLCJjcmVhdGVTZXNzaW9uVG9rZW4iLCJpbnN0YWxsYXRpb25JZCIsInNlc3Npb25EYXRhIiwiY3JlYXRlU2Vzc2lvbiIsImNyZWF0ZWRXaXRoIiwiYWN0aW9uIiwiYXV0aFByb3ZpZGVyIiwiYWRkT3BzIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiYXNzaWduIiwiZGVzdHJveSIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJzZXNzaW9uUXVlcnkiLCJiaW5kIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiYWRkaXRpb25hbFNlc3Npb25EYXRhIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiZGV2aWNlVG9rZW4iLCJ0b0xvd2VyQ2FzZSIsImRldmljZVR5cGUiLCJpZE1hdGNoIiwib2JqZWN0SWRNYXRjaCIsImluc3RhbGxhdGlvbklkTWF0Y2giLCJkZXZpY2VUb2tlbk1hdGNoZXMiLCJvclF1ZXJpZXMiLCJkZWxRdWVyeSIsImFwcElkZW50aWZpZXIiLCJjb2RlIiwib2JqSWQiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0Iiwicm9sZSIsImNsZWFyIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJTRVNTSU9OX01JU1NJTkciLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsIm5hbWUiLCJJTlZBTElEX0FDTCIsInJlYWQiLCJ3cml0ZSIsIm1heFBhc3N3b3JkQWdlIiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJkZWZlciIsIk1hdGgiLCJtYXgiLCJzaGlmdCIsIl91cGRhdGVSZXNwb25zZVdpdGhEYXRhIiwiRFVQTElDQVRFX1ZBTFVFIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiaGFzQWZ0ZXJTYXZlSG9vayIsImFmdGVyU2F2ZSIsImhhc0xpdmVRdWVyeSIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJfaGFuZGxlU2F2ZVJlc3BvbnNlIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJvbkFmdGVyU2F2ZSIsImxvZ2dlciIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2V0IiwiY2xpZW50U3VwcG9ydHNEZWxldGUiLCJzdXBwb3J0c0ZvcndhcmREZWxldGUiLCJmaWVsZE5hbWUiLCJkYXRhVmFsdWUiLCJoYXNPd25Qcm9wZXJ0eSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFhQTs7QUFDQTs7QUFDQTs7OztBQWZBO0FBQ0E7QUFDQTtBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQUQsQ0FBOUI7O0FBQ0EsSUFBSUMsUUFBUSxHQUFHRCxPQUFPLENBQUMsVUFBRCxDQUF0Qjs7QUFFQSxNQUFNRSxJQUFJLEdBQUdGLE9BQU8sQ0FBQyxRQUFELENBQXBCOztBQUNBLElBQUlHLFdBQVcsR0FBR0gsT0FBTyxDQUFDLGVBQUQsQ0FBekI7O0FBQ0EsSUFBSUksY0FBYyxHQUFHSixPQUFPLENBQUMsWUFBRCxDQUE1Qjs7QUFDQSxJQUFJSyxLQUFLLEdBQUdMLE9BQU8sQ0FBQyxZQUFELENBQW5COztBQUNBLElBQUlNLFFBQVEsR0FBR04sT0FBTyxDQUFDLFlBQUQsQ0FBdEI7O0FBQ0EsSUFBSU8sU0FBUyxHQUFHUCxPQUFPLENBQUMsYUFBRCxDQUF2Qjs7QUFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTUSxTQUFULENBQ0VDLE1BREYsRUFFRUMs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ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBkZWVwY29weSA9IHJlcXVpcmUoJ2RlZXBjb3B5Jyk7XG5cbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbnZhciBjcnlwdG9VdGlscyA9IHJlcXVpcmUoJy4vY3J5cHRvVXRpbHMnKTtcbnZhciBwYXNzd29yZENyeXB0byA9IHJlcXVpcmUoJy4vcGFzc3dvcmQnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbnZhciB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbnZhciBDbGllbnRTREsgPSByZXF1aXJlKCcuL0NsaWVudFNESycpO1xuaW1wb3J0IFJlc3RRdWVyeSBmcm9tICcuL1Jlc3RRdWVyeSc7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5cbi8vIHF1ZXJ5IGFuZCBkYXRhIGFyZSBib3RoIHByb3ZpZGVkIGluIFJFU1QgQVBJIGZvcm1hdC4gU28gZGF0YVxuLy8gdHlwZXMgYXJlIGVuY29kZWQgYnkgcGxhaW4gb2xkIG9iamVjdHMuXG4vLyBJZiBxdWVyeSBpcyBudWxsLCB0aGlzIGlzIGEgXCJjcmVhdGVcIiBhbmQgdGhlIGRhdGEgaW4gZGF0YSBzaG91bGQgYmVcbi8vIGNyZWF0ZWQuXG4vLyBPdGhlcndpc2UgdGhpcyBpcyBhbiBcInVwZGF0ZVwiIC0gdGhlIG9iamVjdCBtYXRjaGluZyB0aGUgcXVlcnlcbi8vIHNob3VsZCBnZXQgdXBkYXRlZCB3aXRoIGRhdGEuXG4vLyBSZXN0V3JpdGUgd2lsbCBoYW5kbGUgb2JqZWN0SWQsIGNyZWF0ZWRBdCwgYW5kIHVwZGF0ZWRBdCBmb3Jcbi8vIGV2ZXJ5dGhpbmcuIEl0IGFsc28ga25vd3MgdG8gdXNlIHRyaWdnZXJzIGFuZCBzcGVjaWFsIG1vZGlmaWNhdGlvbnNcbi8vIGZvciB0aGUgX1VzZXIgY2xhc3MuXG5mdW5jdGlvbiBSZXN0V3JpdGUoXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICBxdWVyeSxcbiAgZGF0YSxcbiAgb3JpZ2luYWxEYXRhLFxuICBjbGllbnRTREssXG4gIG9wdGlvbnNcbikge1xuICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICdDYW5ub3QgcGVyZm9ybSBhIHdyaXRlIG9wZXJhdGlvbiB3aGVuIHVzaW5nIHJlYWRPbmx5TWFzdGVyS2V5J1xuICAgICk7XG4gIH1cbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLmNsaWVudFNESyA9IGNsaWVudFNESztcbiAgdGhpcy5zdG9yYWdlID0ge307XG4gIHRoaXMucnVuT3B0aW9ucyA9IHt9O1xuICB0aGlzLmNvbnRleHQgPSB7fTtcblxuICBjb25zdCBhbGxvd09iamVjdElkID0gb3B0aW9ucyAmJiBvcHRpb25zLmFsbG93T2JqZWN0SWQgPT09IHRydWU7XG4gIGlmICghcXVlcnkgJiYgZGF0YS5vYmplY3RJZCAmJiAhYWxsb3dPYmplY3RJZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLidcbiAgICApO1xuICB9XG4gIGlmICghcXVlcnkgJiYgZGF0YS5pZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAnaWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLidcbiAgICApO1xuICB9XG5cbiAgLy8gV2hlbiB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlLCB0aGlzLnJlc3BvbnNlIG1heSBoYXZlIHNldmVyYWxcbiAgLy8gZmllbGRzLlxuICAvLyByZXNwb25zZTogdGhlIGFjdHVhbCBkYXRhIHRvIGJlIHJldHVybmVkXG4gIC8vIHN0YXR1czogdGhlIGh0dHAgc3RhdHVzIGNvZGUuIGlmIG5vdCBwcmVzZW50LCB0cmVhdGVkIGxpa2UgYSAyMDBcbiAgLy8gbG9jYXRpb246IHRoZSBsb2NhdGlvbiBoZWFkZXIuIGlmIG5vdCBwcmVzZW50LCBubyBsb2NhdGlvbiBoZWFkZXJcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG5cbiAgLy8gUHJvY2Vzc2luZyB0aGlzIG9wZXJhdGlvbiBtYXkgbXV0YXRlIG91ciBkYXRhLCBzbyB3ZSBvcGVyYXRlIG9uIGFcbiAgLy8gY29weVxuICB0aGlzLnF1ZXJ5ID0gZGVlcGNvcHkocXVlcnkpO1xuICB0aGlzLmRhdGEgPSBkZWVwY29weShkYXRhKTtcbiAgLy8gV2UgbmV2ZXIgY2hhbmdlIG9yaWdpbmFsRGF0YSwgc28gd2UgZG8gbm90IG5lZWQgYSBkZWVwIGNvcHlcbiAgdGhpcy5vcmlnaW5hbERhdGEgPSBvcmlnaW5hbERhdGE7XG5cbiAgLy8gVGhlIHRpbWVzdGFtcCB3ZSdsbCB1c2UgZm9yIHRoaXMgd2hvbGUgb3BlcmF0aW9uXG4gIHRoaXMudXBkYXRlZEF0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKS5pc287XG5cbiAgLy8gU2hhcmVkIFNjaGVtYUNvbnRyb2xsZXIgdG8gYmUgcmV1c2VkIHRvIHJlZHVjZSB0aGUgbnVtYmVyIG9mIGxvYWRTY2hlbWEoKSBjYWxscyBwZXIgcmVxdWVzdFxuICAvLyBPbmNlIHNldCB0aGUgc2NoZW1hRGF0YSBzaG91bGQgYmUgaW1tdXRhYmxlXG4gIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gbnVsbDtcbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyB0aGVcbi8vIHdyaXRlLCBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHtyZXNwb25zZSwgc3RhdHVzLCBsb2NhdGlvbn0gb2JqZWN0LlxuLy8gc3RhdHVzIGFuZCBsb2NhdGlvbiBhcmUgb3B0aW9uYWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5CZWZvcmVTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hKCk7XG4gICAgfSlcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB0aGlzLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybVVzZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5EYXRhYmFzZU9wZXJhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlclNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jbGVhblVzZXJBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHRoaXMucnVuT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IHRoaXMucnVuT3B0aW9ucy5hY2wuY29uY2F0KHJvbGVzLCBbXG4gICAgICAgIHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24oKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArXG4gICAgICAgICAgICAgICdub24tZXhpc3RlbnQgY2xhc3M6ICcgK1xuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIHNjaGVtYS5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVTY2hlbWEgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnZhbGlkYXRlT2JqZWN0KFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRoaXMuZGF0YSxcbiAgICB0aGlzLnF1ZXJ5LFxuICAgIHRoaXMucnVuT3B0aW9uc1xuICApO1xufTtcblxuLy8gUnVucyBhbnkgYmVmb3JlU2F2ZSB0cmlnZ2VycyBhZ2FpbnN0IHRoaXMgb3BlcmF0aW9uLlxuLy8gQW55IGNoYW5nZSBsZWFkcyB0byBvdXIgZGF0YSBiZWluZyBtdXRhdGVkLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVTYXZlVHJpZ2dlciA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZVNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgICApXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICB2YXIgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBleHRyYURhdGEub2JqZWN0SWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9XG5cbiAgbGV0IG9yaWdpbmFsT2JqZWN0ID0gbnVsbDtcbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRoaXMuYnVpbGRVcGRhdGVkT2JqZWN0KGV4dHJhRGF0YSk7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAvLyBUaGlzIGlzIGFuIHVwZGF0ZSBmb3IgZXhpc3Rpbmcgb2JqZWN0LlxuICAgIG9yaWdpbmFsT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgfVxuXG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEJlZm9yZSBjYWxsaW5nIHRoZSB0cmlnZ2VyLCB2YWxpZGF0ZSB0aGUgcGVybWlzc2lvbnMgZm9yIHRoZSBzYXZlIG9wZXJhdGlvblxuICAgICAgbGV0IGRhdGFiYXNlUHJvbWlzZSA9IG51bGw7XG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgdXBkYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgY3JlYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuY3JlYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSW4gdGhlIGNhc2UgdGhhdCB0aGVyZSBpcyBubyBwZXJtaXNzaW9uIGZvciB0aGUgb3BlcmF0aW9uLCBpdCB0aHJvd3MgYW4gZXJyb3JcbiAgICAgIHJldHVybiBkYXRhYmFzZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgdGhpcy5hdXRoLFxuICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSBfLnJlZHVjZShcbiAgICAgICAgICByZXNwb25zZS5vYmplY3QsXG4gICAgICAgICAgKHJlc3VsdCwgdmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5kYXRhW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YSA9IHJlc3BvbnNlLm9iamVjdDtcbiAgICAgICAgLy8gV2Ugc2hvdWxkIGRlbGV0ZSB0aGUgb2JqZWN0SWQgZm9yIGFuIHVwZGF0ZSB3cml0ZVxuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVMb2dpblRyaWdnZXIgPSBhc3luYyBmdW5jdGlvbih1c2VyRGF0YSkge1xuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVMb2dpbicgdHJpZ2dlclxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLFxuICAgICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICAgIClcbiAgKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2xvdWQgY29kZSBnZXRzIGEgYml0IG9mIGV4dHJhIGRhdGEgZm9yIGl0cyBvYmplY3RzXG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuICBjb25zdCB1c2VyID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHVzZXJEYXRhKTtcblxuICAvLyBubyBuZWVkIHRvIHJldHVybiBhIHJlc3BvbnNlXG4gIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbixcbiAgICB0aGlzLmF1dGgsXG4gICAgdXNlcixcbiAgICBudWxsLFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuY29udGV4dFxuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmRhdGEpIHtcbiAgICAvLyBBZGQgZGVmYXVsdCBmaWVsZHNcbiAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG5cbiAgICAgIC8vIE9ubHkgYXNzaWduIG5ldyBvYmplY3RJZCBpZiB3ZSBhcmUgY3JlYXRpbmcgbmV3IG9iamVjdFxuICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gY3J5cHRvVXRpbHMubmV3T2JqZWN0SWQodGhpcy5jb25maWcub2JqZWN0SWRTaXplKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuLy8gVHJhbnNmb3JtcyBhdXRoIGRhdGEgZm9yIGEgdXNlciBvYmplY3QuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhIHVzZXIgb2JqZWN0LlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUF1dGhEYXRhID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSAhPT0gJ3N0cmluZycgfHxcbiAgICAgIF8uaXNFbXB0eSh0aGlzLmRhdGEudXNlcm5hbWUpXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsXG4gICAgICAgICdiYWQgb3IgbWlzc2luZyB1c2VybmFtZSdcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChcbiAgICAgIHR5cGVvZiB0aGlzLmRhdGEucGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8XG4gICAgICBfLmlzRW1wdHkodGhpcy5kYXRhLnBhc3N3b3JkKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLFxuICAgICAgICAncGFzc3dvcmQgaXMgcmVxdWlyZWQnXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGlmICghdGhpcy5kYXRhLmF1dGhEYXRhIHx8ICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBhdXRoRGF0YSA9IHRoaXMuZGF0YS5hdXRoRGF0YTtcbiAgdmFyIHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgaWYgKHByb3ZpZGVycy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgY2FuSGFuZGxlQXV0aERhdGEgPSBwcm92aWRlcnMucmVkdWNlKChjYW5IYW5kbGUsIHByb3ZpZGVyKSA9PiB7XG4gICAgICB2YXIgcHJvdmlkZXJBdXRoRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIHZhciBoYXNUb2tlbiA9IHByb3ZpZGVyQXV0aERhdGEgJiYgcHJvdmlkZXJBdXRoRGF0YS5pZDtcbiAgICAgIHJldHVybiBjYW5IYW5kbGUgJiYgKGhhc1Rva2VuIHx8IHByb3ZpZGVyQXV0aERhdGEgPT0gbnVsbCk7XG4gICAgfSwgdHJ1ZSk7XG4gICAgaWYgKGNhbkhhbmRsZUF1dGhEYXRhKSB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YShhdXRoRGF0YSk7XG4gICAgfVxuICB9XG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGZ1bmN0aW9uKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHZhbGlkYXRpb25zID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLm1hcChwcm92aWRlciA9PiB7XG4gICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCB2YWxpZGF0ZUF1dGhEYXRhID0gdGhpcy5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKFxuICAgICAgcHJvdmlkZXJcbiAgICApO1xuICAgIGlmICghdmFsaWRhdGVBdXRoRGF0YSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbGlkYXRlQXV0aERhdGEoYXV0aERhdGFbcHJvdmlkZXJdKTtcbiAgfSk7XG4gIHJldHVybiBQcm9taXNlLmFsbCh2YWxpZGF0aW9ucyk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IGZ1bmN0aW9uKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0pIHtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9XG4gICAgICBjb25zdCBxdWVyeUtleSA9IGBhdXRoRGF0YS4ke3Byb3ZpZGVyfS5pZGA7XG4gICAgICBjb25zdCBxdWVyeSA9IHt9O1xuICAgICAgcXVlcnlbcXVlcnlLZXldID0gYXV0aERhdGFbcHJvdmlkZXJdLmlkO1xuICAgICAgbWVtby5wdXNoKHF1ZXJ5KTtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH0sIFtdKVxuICAgIC5maWx0ZXIocSA9PiB7XG4gICAgICByZXR1cm4gdHlwZW9mIHEgIT09ICd1bmRlZmluZWQnO1xuICAgIH0pO1xuXG4gIGxldCBmaW5kUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShbXSk7XG4gIGlmIChxdWVyeS5sZW5ndGggPiAwKSB7XG4gICAgZmluZFByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB7ICRvcjogcXVlcnkgfSwge30pO1xuICB9XG5cbiAgcmV0dXJuIGZpbmRQcm9taXNlO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uKG9iamVjdHMpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3RzO1xuICB9XG4gIHJldHVybiBvYmplY3RzLmZpbHRlcihvYmplY3QgPT4ge1xuICAgIGlmICghb2JqZWN0LkFDTCkge1xuICAgICAgcmV0dXJuIHRydWU7IC8vIGxlZ2FjeSB1c2VycyB0aGF0IGhhdmUgbm8gQUNMIGZpZWxkIG9uIHRoZW1cbiAgICB9XG4gICAgLy8gUmVndWxhciB1c2VycyB0aGF0IGhhdmUgYmVlbiBsb2NrZWQgb3V0LlxuICAgIHJldHVybiBvYmplY3QuQUNMICYmIE9iamVjdC5rZXlzKG9iamVjdC5BQ0wpLmxlbmd0aCA+IDA7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YSA9IGZ1bmN0aW9uKGF1dGhEYXRhKSB7XG4gIGxldCByZXN1bHRzO1xuICByZXR1cm4gdGhpcy5maW5kVXNlcnNXaXRoQXV0aERhdGEoYXV0aERhdGEpLnRoZW4oYXN5bmMgciA9PiB7XG4gICAgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG5cbiAgICBpZiAocmVzdWx0cy5sZW5ndGggPT0gMSkge1xuICAgICAgdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5qb2luKCcsJyk7XG5cbiAgICAgIGNvbnN0IHVzZXJSZXN1bHQgPSByZXN1bHRzWzBdO1xuICAgICAgY29uc3QgbXV0YXRlZEF1dGhEYXRhID0ge307XG4gICAgICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29uc3QgdXNlckF1dGhEYXRhID0gdXNlclJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGlmICghXy5pc0VxdWFsKHByb3ZpZGVyRGF0YSwgdXNlckF1dGhEYXRhKSkge1xuICAgICAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gICAgICBsZXQgdXNlcklkO1xuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICB1c2VySWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICAgICAgdXNlcklkID0gdGhpcy5hdXRoLnVzZXIuaWQ7XG4gICAgICB9XG4gICAgICBpZiAoIXVzZXJJZCB8fCB1c2VySWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHtcbiAgICAgICAgLy8gbm8gdXNlciBtYWtpbmcgdGhlIGNhbGxcbiAgICAgICAgLy8gT1IgdGhlIHVzZXIgbWFraW5nIHRoZSBjYWxsIGlzIHRoZSByaWdodCBvbmVcbiAgICAgICAgLy8gTG9naW4gd2l0aCBhdXRoIGRhdGFcbiAgICAgICAgZGVsZXRlIHJlc3VsdHNbMF0ucGFzc3dvcmQ7XG5cbiAgICAgICAgLy8gbmVlZCB0byBzZXQgdGhlIG9iamVjdElkIGZpcnN0IG90aGVyd2lzZSBsb2NhdGlvbiBoYXMgdHJhaWxpbmcgdW5kZWZpbmVkXG4gICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgICAgICAgaWYgKCF0aGlzLnF1ZXJ5IHx8ICF0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgLy8gdGhpcyBhIGxvZ2luIGNhbGwsIG5vIHVzZXJJZCBwYXNzZWRcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICAgIH07XG4gICAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgICAvLyB0byBhdXRoRGF0YSBvbiB0aGUgZGI7IGNoYW5nZXMgdG8gdXNlclJlc3VsdFxuICAgICAgICAgIC8vIHdpbGwgYmUgaWdub3JlZC5cbiAgICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihkZWVwY29weSh1c2VyUmVzdWx0KSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSBkaWRuJ3QgY2hhbmdlIHRoZSBhdXRoIGRhdGEsIGp1c3Qga2VlcCBnb2luZ1xuICAgICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBoYXZlIGF1dGhEYXRhIHRoYXQgaXMgdXBkYXRlZCBvbiBsb2dpblxuICAgICAgICAvLyB0aGF0IGNhbiBoYXBwZW4gd2hlbiB0b2tlbiBhcmUgcmVmcmVzaGVkLFxuICAgICAgICAvLyBXZSBzaG91bGQgdXBkYXRlIHRoZSB0b2tlbiBhbmQgbGV0IHRoZSB1c2VyIGluXG4gICAgICAgIC8vIFdlIHNob3VsZCBvbmx5IGNoZWNrIHRoZSBtdXRhdGVkIGtleXNcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKG11dGF0ZWRBdXRoRGF0YSkudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgLy8gSUYgd2UgaGF2ZSBhIHJlc3BvbnNlLCB3ZSdsbCBza2lwIHRoZSBkYXRhYmFzZSBvcGVyYXRpb24gLyBiZWZvcmVTYXZlIC8gYWZ0ZXJTYXZlIGV0Yy4uLlxuICAgICAgICAgIC8vIHdlIG5lZWQgdG8gc2V0IGl0IHVwIHRoZXJlLlxuICAgICAgICAgIC8vIFdlIGFyZSBzdXBwb3NlZCB0byBoYXZlIGEgcmVzcG9uc2Ugb25seSBvbiBMT0dJTiB3aXRoIGF1dGhEYXRhLCBzbyB3ZSBza2lwIHRob3NlXG4gICAgICAgICAgLy8gSWYgd2UncmUgbm90IGxvZ2dpbmcgaW4sIGJ1dCBqdXN0IHVwZGF0aW5nIHRoZSBjdXJyZW50IHVzZXIsIHdlIGNhbiBzYWZlbHkgc2tpcCB0aGF0IHBhcnRcbiAgICAgICAgICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgICAgICAgICAgLy8gQXNzaWduIHRoZSBuZXcgYXV0aERhdGEgaW4gdGhlIHJlc3BvbnNlXG4gICAgICAgICAgICBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLmF1dGhEYXRhW3Byb3ZpZGVyXSA9XG4gICAgICAgICAgICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3RlcidcbiAgICAgICAgICAgIC8vIEp1c3QgdXBkYXRlIHRoZSBhdXRoRGF0YSBwYXJ0XG4gICAgICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH0sXG4gICAgICAgICAgICAgIHsgYXV0aERhdGE6IG11dGF0ZWRBdXRoRGF0YSB9LFxuICAgICAgICAgICAgICB7fVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmICh1c2VySWQpIHtcbiAgICAgICAgLy8gVHJ5aW5nIHRvIHVwZGF0ZSBhdXRoIGRhdGEgYnV0IHVzZXJzXG4gICAgICAgIC8vIGFyZSBkaWZmZXJlbnRcbiAgICAgICAgaWYgKHVzZXJSZXN1bHQub2JqZWN0SWQgIT09IHVzZXJJZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsXG4gICAgICAgICAgICAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vIGF1dGggZGF0YSB3YXMgbXV0YXRlZCwganVzdCBrZWVwIGdvaW5nXG4gICAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihhdXRoRGF0YSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIC8vIE1vcmUgdGhhbiAxIHVzZXIgd2l0aCB0aGUgcGFzc2VkIGlkJ3NcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsXG4gICAgICAgICAgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyICYmICdlbWFpbFZlcmlmaWVkJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBlcnJvciA9IGBDbGllbnRzIGFyZW4ndCBhbGxvd2VkIHRvIG1hbnVhbGx5IHVwZGF0ZSBlbWFpbCB2ZXJpZmljYXRpb24uYDtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgZXJyb3IpO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIHByb21pc2UgPSBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICAgIC5leGVjdXRlKClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLnJlc3VsdHMuZm9yRWFjaChzZXNzaW9uID0+XG4gICAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gIH1cblxuICByZXR1cm4gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIFRyYW5zZm9ybSB0aGUgcGFzc3dvcmRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBpZ25vcmUgb25seSBpZiB1bmRlZmluZWQuIHNob3VsZCBwcm9jZWVkIGlmIGVtcHR5ICgnJylcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSA9IHRydWU7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbmV3IHNlc3Npb24gb25seSBpZiB0aGUgdXNlciByZXF1ZXN0ZWRcbiAgICAgICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uaGFzaCh0aGlzLmRhdGEucGFzc3dvcmQpLnRoZW4oaGFzaGVkUGFzc3dvcmQgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkID0gaGFzaGVkUGFzc3dvcmQ7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVVzZXJOYW1lKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVFbWFpbCgpO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVVc2VyTmFtZSA9IGZ1bmN0aW9uKCkge1xuICAvLyBDaGVjayBmb3IgdXNlcm5hbWUgdW5pcXVlbmVzc1xuICBpZiAoIXRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgdGhpcy5kYXRhLnVzZXJuYW1lID0gY3J5cHRvVXRpbHMucmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gV2UgbmVlZCB0byBhIGZpbmQgdG8gY2hlY2sgZm9yIGR1cGxpY2F0ZSB1c2VybmFtZSBpbiBjYXNlIHRoZXkgYXJlIG1pc3NpbmcgdGhlIHVuaXF1ZSBpbmRleCBvbiB1c2VybmFtZXNcbiAgLy8gVE9ETzogQ2hlY2sgaWYgdGhlcmUgaXMgYSB1bmlxdWUgaW5kZXgsIGFuZCBpZiBzbywgc2tpcCB0aGlzIHF1ZXJ5LlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgeyB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLCBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9IH0sXG4gICAgICB7IGxpbWl0OiAxIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVFbWFpbCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMuZGF0YS5lbWFpbCB8fCB0aGlzLmRhdGEuZW1haWwuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVmFsaWRhdGUgYmFzaWMgZW1haWwgYWRkcmVzcyBmb3JtYXRcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwubWF0Y2goL14uK0AuKyQvKSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAnRW1haWwgYWRkcmVzcyBmb3JtYXQgaXMgaW52YWxpZC4nXG4gICAgICApXG4gICAgKTtcbiAgfVxuICAvLyBTYW1lIHByb2JsZW0gZm9yIGVtYWlsIGFzIGFib3ZlIGZvciB1c2VybmFtZVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgeyBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLCBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9IH0sXG4gICAgICB7IGxpbWl0OiAxIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLmRhdGEuYXV0aERhdGEgfHxcbiAgICAgICAgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoIHx8XG4gICAgICAgIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCA9PT0gMSAmJlxuICAgICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSlbMF0gPT09ICdhbm9ueW1vdXMnKVxuICAgICAgKSB7XG4gICAgICAgIC8vIFdlIHVwZGF0ZWQgdGhlIGVtYWlsLCBzZW5kIGEgbmV3IHZhbGlkYXRpb25cbiAgICAgICAgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSA9IHRydWU7XG4gICAgICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNldEVtYWlsVmVyaWZ5VG9rZW4odGhpcy5kYXRhKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbigpIHtcbiAgLy8gY2hlY2sgaWYgdGhlIHBhc3N3b3JkIGNvbmZvcm1zIHRvIHRoZSBkZWZpbmVkIHBhc3N3b3JkIHBvbGljeSBpZiBjb25maWd1cmVkXG4gIC8vIElmIHdlIHNwZWNpZmllZCBhIGN1c3RvbSBlcnJvciBpbiBvdXIgY29uZmlndXJhdGlvbiB1c2UgaXQuXG4gIC8vIEV4YW1wbGU6IFwiUGFzc3dvcmRzIG11c3QgaW5jbHVkZSBhIENhcGl0YWwgTGV0dGVyLCBMb3dlcmNhc2UgTGV0dGVyLCBhbmQgYSBudW1iZXIuXCJcbiAgLy9cbiAgLy8gVGhpcyBpcyBlc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgZ2VuZXJpYyBcInBhc3N3b3JkIHJlc2V0XCIgcGFnZSxcbiAgLy8gYXMgaXQgYWxsb3dzIHRoZSBwcm9ncmFtbWVyIHRvIGNvbW11bmljYXRlIHNwZWNpZmljIHJlcXVpcmVtZW50cyBpbnN0ZWFkIG9mOlxuICAvLyBhLiBtYWtpbmcgdGhlIHVzZXIgZ3Vlc3Mgd2hhdHMgd3JvbmdcbiAgLy8gYi4gbWFraW5nIGEgY3VzdG9tIHBhc3N3b3JkIHJlc2V0IHBhZ2UgdGhhdCBzaG93cyB0aGUgcmVxdWlyZW1lbnRzXG4gIGNvbnN0IHBvbGljeUVycm9yID0gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgPyB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA6ICdQYXNzd29yZCBkb2VzIG5vdCBtZWV0IHRoZSBQYXNzd29yZCBQb2xpY3kgcmVxdWlyZW1lbnRzLic7XG4gIGNvbnN0IGNvbnRhaW5zVXNlcm5hbWVFcnJvciA9ICdQYXNzd29yZCBjYW5ub3QgY29udGFpbiB5b3VyIHVzZXJuYW1lLic7XG5cbiAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgbWVldHMgdGhlIHBhc3N3b3JkIHN0cmVuZ3RoIHJlcXVpcmVtZW50c1xuICBpZiAoXG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yKHRoaXMuZGF0YS5wYXNzd29yZCkpIHx8XG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sodGhpcy5kYXRhLnBhc3N3b3JkKSlcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIHBvbGljeUVycm9yKVxuICAgICk7XG4gIH1cblxuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGNvbnRhaW4gdXNlcm5hbWVcbiAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSA9PT0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICAgIC8vIHVzZXJuYW1lIGlzIG5vdCBwYXNzZWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YodGhpcy5kYXRhLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcilcbiAgICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmV0cmlldmUgdGhlIFVzZXIgb2JqZWN0IHVzaW5nIG9iamVjdElkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9KVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YocmVzdWx0c1swXS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgY29udGFpbnNVc2VybmFtZUVycm9yXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkgPSBmdW5jdGlvbigpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpXG4gICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDFcbiAgICAgICAgICApO1xuICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgY29uc3QgbmV3UGFzc3dvcmQgPSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIC8vIGNvbXBhcmUgdGhlIG5ldyBwYXNzd29yZCBoYXNoIHdpdGggYWxsIG9sZCBwYXNzd29yZCBoYXNoZXNcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBvbGRQYXNzd29yZHMubWFwKGZ1bmN0aW9uKGhhc2gpIHtcbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShuZXdQYXNzd29yZCwgaGFzaCkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdClcbiAgICAgICAgICAgICAgLy8gcmVqZWN0IGlmIHRoZXJlIGlzIGEgbWF0Y2hcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KCdSRVBFQVRfUEFTU1dPUkQnKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHdhaXQgZm9yIGFsbCBjb21wYXJpc29ucyB0byBjb21wbGV0ZVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyID09PSAnUkVQRUFUX1BBU1NXT1JEJylcbiAgICAgICAgICAgICAgLy8gYSBtYXRjaCB3YXMgZm91bmRcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgICBgTmV3IHBhc3N3b3JkIHNob3VsZCBub3QgYmUgdGhlIHNhbWUgYXMgbGFzdCAke3RoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeX0gcGFzc3dvcmRzLmBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBzZXNzaW9uIGZvciB1cGRhdGluZyB1c2VyICh0aGlzLnF1ZXJ5IGlzIHNldCkgdW5sZXNzIGF1dGhEYXRhIGV4aXN0c1xuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChcbiAgICAhdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSAmJiAvLyBzaWdudXAgY2FsbCwgd2l0aFxuICAgIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiYgLy8gbm8gbG9naW4gd2l0aG91dCB2ZXJpZmljYXRpb25cbiAgICB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzXG4gICkge1xuICAgIC8vIHZlcmlmaWNhdGlvbiBpcyBvblxuICAgIHJldHVybjsgLy8gZG8gbm90IGNyZWF0ZSB0aGUgc2Vzc2lvbiB0b2tlbiBpbiB0aGF0IGNhc2UhXG4gIH1cbiAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbiA9IGZ1bmN0aW9uKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IEF1dGguY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgIHVzZXJJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICBhY3Rpb246IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPyAnbG9naW4nIDogJ3NpZ251cCcsXG4gICAgICBhdXRoUHJvdmlkZXI6IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gfHwgJ3Bhc3N3b3JkJyxcbiAgICB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gIH0pO1xuXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVTZXNzaW9uKCk7XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLnF1ZXJ5ID09PSBudWxsKSB7XG4gICAgLy8gbnVsbCBxdWVyeSBtZWFucyBjcmVhdGVcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoJ3Bhc3N3b3JkJyBpbiB0aGlzLmRhdGEgfHwgJ2VtYWlsJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBhZGRPcHMgPSB7XG4gICAgICBfcGVyaXNoYWJsZV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG4gICAgdGhpcy5kYXRhID0gT2JqZWN0LmFzc2lnbih0aGlzLmRhdGEsIGFkZE9wcyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyA9IGZ1bmN0aW9uKCkge1xuICAvLyBPbmx5IGZvciBfU2Vzc2lvbiwgYW5kIGF0IGNyZWF0aW9uIHRpbWVcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9ICdfU2Vzc2lvbicgfHwgdGhpcy5xdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEZXN0cm95IHRoZSBzZXNzaW9ucyBpbiAnQmFja2dyb3VuZCdcbiAgY29uc3QgeyB1c2VyLCBpbnN0YWxsYXRpb25JZCwgc2Vzc2lvblRva2VuIH0gPSB0aGlzLmRhdGE7XG4gIGlmICghdXNlciB8fCAhaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF1c2VyLm9iamVjdElkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koXG4gICAgJ19TZXNzaW9uJyxcbiAgICB7XG4gICAgICB1c2VyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBzZXNzaW9uVG9rZW46IHsgJG5lOiBzZXNzaW9uVG9rZW4gfSxcbiAgICB9LFxuICAgIHt9LFxuICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICk7XG59O1xuXG4vLyBIYW5kbGVzIGFueSBmb2xsb3d1cCBsb2dpY1xuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVGb2xsb3d1cCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoXG4gICAgdGhpcy5zdG9yYWdlICYmXG4gICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gJiZcbiAgICB0aGlzLmNvbmZpZy5yZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0XG4gICkge1xuICAgIHZhciBzZXNzaW9uUXVlcnkgPSB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH07XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmRlc3Ryb3koJ19TZXNzaW9uJywgc2Vzc2lvblF1ZXJ5KVxuICAgICAgLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddO1xuICAgIC8vIEZpcmUgYW5kIGZvcmdldCFcbiAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodGhpcy5kYXRhKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfU2Vzc2lvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIF9TZXNzaW9uIG9iamVjdC5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlU2Vzc2lvbiA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLidcbiAgICApO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJ1xuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmIChcbiAgICAgIHRoaXMuZGF0YS51c2VyICYmXG4gICAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgICB0aGlzLmRhdGEudXNlci5vYmplY3RJZCAhPSB0aGlzLmF1dGgudXNlci5pZFxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kYXRhKSB7XG4gICAgICBpZiAoa2V5ID09PSAnb2JqZWN0SWQnIHx8IGtleSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBBdXRoLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdjcmVhdGUnLFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSxcbiAgICB9KTtcblxuICAgIHJldHVybiBjcmVhdGVTZXNzaW9uKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5yZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHNlc3Npb25EYXRhWydvYmplY3RJZCddID0gcmVzdWx0cy5yZXNwb25zZVsnb2JqZWN0SWQnXTtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICBsb2NhdGlvbjogcmVzdWx0cy5sb2NhdGlvbixcbiAgICAgICAgcmVzcG9uc2U6IHNlc3Npb25EYXRhLFxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX0luc3RhbGxhdGlvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIGluc3RhbGxhdGlvbiBvYmplY3QuXG4vLyBJZiBhbiBpbnN0YWxsYXRpb24gaXMgZm91bmQsIHRoaXMgY2FuIG11dGF0ZSB0aGlzLnF1ZXJ5IGFuZCB0dXJuIGEgY3JlYXRlXG4vLyBpbnRvIGFuIHVwZGF0ZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlSW5zdGFsbGF0aW9uID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICtcbiAgICAgICAgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmIChcbiAgICB0aGlzLnF1ZXJ5ICYmXG4gICAgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICFpbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVHlwZVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIHZhciBpZE1hdGNoOyAvLyBXaWxsIGJlIGEgbWF0Y2ggb24gZWl0aGVyIG9iamVjdElkIG9yIGluc3RhbGxhdGlvbklkXG4gIHZhciBvYmplY3RJZE1hdGNoO1xuICB2YXIgaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgdmFyIGRldmljZVRva2VuTWF0Y2hlcyA9IFtdO1xuXG4gIC8vIEluc3RlYWQgb2YgaXNzdWluZyAzIHJlYWRzLCBsZXQncyBkbyBpdCB3aXRoIG9uZSBPUi5cbiAgY29uc3Qgb3JRdWVyaWVzID0gW107XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBvYmplY3RJZDogdGhpcy5xdWVyeS5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgIG9yUXVlcmllcy5wdXNoKHsgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbiB9KTtcbiAgfVxuXG4gIGlmIChvclF1ZXJpZXMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlID0gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAnX0luc3RhbGxhdGlvbicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IG9yUXVlcmllcyxcbiAgICAgICAgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5xdWVyeSAmJlxuICAgICAgICAgIHRoaXMucXVlcnkub2JqZWN0SWQgJiZcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPT0gdGhpcy5xdWVyeS5vYmplY3RJZFxuICAgICAgICApIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTM2LFxuICAgICAgICAgICAgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTM2LFxuICAgICAgICAgICAgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIDEzNixcbiAgICAgICAgICAgICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIDEzNSxcbiAgICAgICAgICAnZGV2aWNlVHlwZSBtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJlxuICAgICAgICAgICFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ11cbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgICAgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW5cbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAgIC5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpXG4gICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJbiBub24tbWVyZ2Ugc2NlbmFyaW9zLCBqdXN0IHJldHVybiB0aGUgaW5zdGFsbGF0aW9uIG1hdGNoIGlkXG4gICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKG9iaklkID0+IHtcbiAgICAgIGlmIChvYmpJZCkge1xuICAgICAgICB0aGlzLnF1ZXJ5ID0geyBvYmplY3RJZDogb2JqSWQgfTtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICB9XG4gICAgICAvLyBUT0RPOiBWYWxpZGF0ZSBvcHMgKGFkZC9yZW1vdmUgb24gY2hhbm5lbHMsICRpbmMgb24gYmFkZ2UsIGV0Yy4pXG4gICAgfSk7XG4gIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8gSWYgd2Ugc2hvcnQtY2lyY3V0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBmdW5jdGlvbigpIHtcbiAgLy8gQ2hlY2sgd2hldGhlciB3ZSBoYXZlIGEgc2hvcnQtY2lyY3VpdGVkIHJlc3BvbnNlIC0gb25seSB0aGVuIHJ1biBleHBhbnNpb24uXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZVxuICAgICk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuRGF0YWJhc2VPcGVyYXRpb24gPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUm9sZScpIHtcbiAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIucm9sZS5jbGVhcigpO1xuICB9XG5cbiAgaWYgKFxuICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgdGhpcy5xdWVyeSAmJlxuICAgIHRoaXMuYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORyxcbiAgICAgIGBDYW5ub3QgbW9kaWZ5IHVzZXIgJHt0aGlzLnF1ZXJ5Lm9iamVjdElkfS5gXG4gICAgKTtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Qcm9kdWN0JyAmJiB0aGlzLmRhdGEuZG93bmxvYWQpIHtcbiAgICB0aGlzLmRhdGEuZG93bmxvYWROYW1lID0gdGhpcy5kYXRhLmRvd25sb2FkLm5hbWU7XG4gIH1cblxuICAvLyBUT0RPOiBBZGQgYmV0dGVyIGRldGVjdGlvbiBmb3IgQUNMLCBlbnN1cmluZyBhIHVzZXIgY2FuJ3QgYmUgbG9ja2VkIGZyb21cbiAgLy8gICAgICAgdGhlaXIgb3duIHVzZXIgcmVjb3JkLlxuICBpZiAodGhpcy5kYXRhLkFDTCAmJiB0aGlzLmRhdGEuQUNMWycqdW5yZXNvbHZlZCddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQUNMLCAnSW52YWxpZCBBQ0wuJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIC8vIEZvcmNlIHRoZSB1c2VyIHRvIG5vdCBsb2Nrb3V0XG4gICAgLy8gTWF0Y2hlZCB3aXRoIHBhcnNlLmNvbVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuQUNMICYmXG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXIgIT09IHRydWVcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vbi0xIHBhc3N3b3JkcyBnbyBpbnRvIGhpc3RvcnkgaW5jbHVkaW5nIGxhc3QgcGFzc3dvcmRcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBvbGRQYXNzd29yZHMubGVuZ3RoID5cbiAgICAgICAgICAgIE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0geyByZXNwb25zZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTZXQgdGhlIGRlZmF1bHQgQUNMIGFuZCBwYXNzd29yZCB0aW1lc3RhbXAgZm9yIHRoZSBuZXcgX1VzZXJcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIHZhciBBQ0wgPSB0aGlzLmRhdGEuQUNMO1xuICAgICAgLy8gZGVmYXVsdCBwdWJsaWMgci93IEFDTFxuICAgICAgaWYgKCFBQ0wpIHtcbiAgICAgICAgQUNMID0ge307XG4gICAgICAgIEFDTFsnKiddID0geyByZWFkOiB0cnVlLCB3cml0ZTogZmFsc2UgfTtcbiAgICAgIH1cbiAgICAgIC8vIG1ha2Ugc3VyZSB0aGUgdXNlciBpcyBub3QgbG9ja2VkIGRvd25cbiAgICAgIEFDTFt0aGlzLmRhdGEub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgICAgdGhpcy5kYXRhLkFDTCA9IEFDTDtcbiAgICAgIC8vIHBhc3N3b3JkIHRpbWVzdGFtcCB0byBiZSB1c2VkIHdoZW4gcGFzc3dvcmQgZXhwaXJ5IHBvbGljeSBpcyBlbmZvcmNlZFxuICAgICAgaWYgKFxuICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgKSB7XG4gICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUnVuIGEgY3JlYXRlXG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuY3JlYXRlKFxuICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgIGZhbHNlLFxuICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUXVpY2sgY2hlY2ssIGlmIHdlIHdlcmUgYWJsZSB0byBpbmZlciB0aGUgZHVwbGljYXRlZCBmaWVsZCBuYW1lXG4gICAgICAgIGlmIChcbiAgICAgICAgICBlcnJvciAmJlxuICAgICAgICAgIGVycm9yLnVzZXJJbmZvICYmXG4gICAgICAgICAgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yICYmXG4gICAgICAgICAgZXJyb3IudXNlckluZm8gJiZcbiAgICAgICAgICBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAnZW1haWwnXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSB8fCAhdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJTYXZlSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgY29uc3QgaGFzTGl2ZVF1ZXJ5ID0gdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5oYXNMaXZlUXVlcnkoXG4gICAgdGhpcy5jbGFzc05hbWVcbiAgKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB2YXIgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBleHRyYURhdGEub2JqZWN0SWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIG9yaWdpbmFsIG9iamVjdCwgd2Ugb25seSBkbyB0aGlzIGZvciBhIHVwZGF0ZSB3cml0ZS5cbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIGluZmxhdGVkIG9iamVjdCwgZGlmZmVyZW50IGZyb20gYmVmb3JlU2F2ZSwgb3JpZ2luYWxEYXRhIGlzIG5vdCBlbXB0eVxuICAvLyBzaW5jZSBkZXZlbG9wZXJzIGNhbiBjaGFuZ2UgZGF0YSBpbiB0aGUgYmVmb3JlU2F2ZS5cbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRoaXMuYnVpbGRVcGRhdGVkT2JqZWN0KGV4dHJhRGF0YSk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZShcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLFxuICAgIHRoaXMucmVzcG9uc2Uuc3RhdHVzIHx8IDIwMFxuICApO1xuXG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgIC8vIE5vdGlmaXkgTGl2ZVF1ZXJ5U2VydmVyIGlmIHBvc3NpYmxlXG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhcbiAgICAgIHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lXG4gICAgKTtcbiAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLm9uQWZ0ZXJTYXZlKFxuICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWUsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICBwZXJtc1xuICAgICk7XG4gIH0pO1xuXG4gIC8vIFJ1biBhZnRlclNhdmUgdHJpZ2dlclxuICByZXR1cm4gdHJpZ2dlcnNcbiAgICAubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICB0aGlzLmNvbnRleHRcbiAgICApXG4gICAgLmNhdGNoKGZ1bmN0aW9uKGVycikge1xuICAgICAgbG9nZ2VyLndhcm4oJ2FmdGVyU2F2ZSBjYXVnaHQgYW4gZXJyb3InLCBlcnIpO1xuICAgIH0pO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZmlndXJlIG91dCB3aGF0IGxvY2F0aW9uIHRoaXMgb3BlcmF0aW9uIGhhcHBlbnMgYXQuXG5SZXN0V3JpdGUucHJvdG90eXBlLmxvY2F0aW9uID0gZnVuY3Rpb24oKSB7XG4gIHZhciBtaWRkbGUgPVxuICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgcmV0dXJuIHRoaXMuY29uZmlnLm1vdW50ICsgbWlkZGxlICsgdGhpcy5kYXRhLm9iamVjdElkO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IHRoZSBvYmplY3QgaWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuLy8gQmVjYXVzZSBpdCBjb3VsZCBiZSBlaXRoZXIgb24gdGhlIHF1ZXJ5IG9yIG9uIHRoZSBkYXRhXG5SZXN0V3JpdGUucHJvdG90eXBlLm9iamVjdElkID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmRhdGEub2JqZWN0SWQgfHwgdGhpcy5xdWVyeS5vYmplY3RJZDtcbn07XG5cbi8vIFJldHVybnMgYSBjb3B5IG9mIHRoZSBkYXRhIGFuZCBkZWxldGUgYmFkIGtleXMgKF9hdXRoX2RhdGEsIF9oYXNoZWRfcGFzc3dvcmQuLi4pXG5SZXN0V3JpdGUucHJvdG90eXBlLnNhbml0aXplZERhdGEgPSBmdW5jdGlvbigpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFVwZGF0ZWRPYmplY3QgPSBmdW5jdGlvbihleHRyYURhdGEpIHtcbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKGZ1bmN0aW9uKGRhdGEsIGtleSkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgLy8gc3ViZG9jdW1lbnQga2V5IHdpdGggZG90IG5vdGF0aW9uICgneC55Jzp2ID0+ICd4Jzp7J3knOnZ9KVxuICAgICAgY29uc3Qgc3BsaXR0ZWRLZXkgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBzcGxpdHRlZEtleVswXTtcbiAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgIGlmICh0eXBlb2YgcGFyZW50VmFsICE9PSAnb2JqZWN0Jykge1xuICAgICAgICBwYXJlbnRWYWwgPSB7fTtcbiAgICAgIH1cbiAgICAgIHBhcmVudFZhbFtzcGxpdHRlZEtleVsxXV0gPSBkYXRhW2tleV07XG4gICAgICB1cGRhdGVkT2JqZWN0LnNldChwYXJlbnRQcm9wLCBwYXJlbnRWYWwpO1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuXG4gIHVwZGF0ZWRPYmplY3Quc2V0KHRoaXMuc2FuaXRpemVkRGF0YSgpKTtcbiAgcmV0dXJuIHVwZGF0ZWRPYmplY3Q7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB1c2VyID0gdGhpcy5yZXNwb25zZS5yZXNwb25zZTtcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhID0gZnVuY3Rpb24ocmVzcG9uc2UsIGRhdGEpIHtcbiAgaWYgKF8uaXNFbXB0eSh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlcikpIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgY2xpZW50U3VwcG9ydHNEZWxldGUgPSBDbGllbnRTREsuc3VwcG9ydHNGb3J3YXJkRGVsZXRlKHRoaXMuY2xpZW50U0RLKTtcbiAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGNvbnN0IGRhdGFWYWx1ZSA9IGRhdGFbZmllbGROYW1lXTtcblxuICAgIGlmICghcmVzcG9uc2UuaGFzT3duUHJvcGVydHkoZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdfQ==