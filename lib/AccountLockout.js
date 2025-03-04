"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AccountLockout = void 0;
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// This class handles the Account Lockout Policy settings.

class AccountLockout {
  constructor(user, config) {
    this._user = user;
    this._config = config;
  }

  /**
   * set _failed_login_count to value
   */
  _setFailedLoginCount(value) {
    const query = {
      username: this._user.username
    };
    const updateFields = {
      _failed_login_count: value
    };
    return this._config.database.update('_User', query, updateFields);
  }

  /**
   * check if the _failed_login_count field has been set
   */
  _isFailedLoginCountSet() {
    const query = {
      username: this._user.username,
      _failed_login_count: {
        $exists: true
      }
    };
    return this._config.database.find('_User', query).then(users => {
      if (Array.isArray(users) && users.length > 0) {
        return true;
      } else {
        return false;
      }
    });
  }

  /**
   * if _failed_login_count is NOT set then set it to 0
   * else do nothing
   */
  _initFailedLoginCount() {
    return this._isFailedLoginCountSet().then(failedLoginCountIsSet => {
      if (!failedLoginCountIsSet) {
        return this._setFailedLoginCount(0);
      }
    });
  }

  /**
   * increment _failed_login_count by 1
   */
  _incrementFailedLoginCount() {
    const query = {
      username: this._user.username
    };
    const updateFields = {
      _failed_login_count: {
        __op: 'Increment',
        amount: 1
      }
    };
    return this._config.database.update('_User', query, updateFields);
  }

  /**
   * if the failed login count is greater than the threshold
   * then sets lockout expiration to 'currenttime + accountPolicy.duration', i.e., account is locked out for the next 'accountPolicy.duration' minutes
   * else do nothing
   */
  _setLockoutExpiration() {
    const query = {
      username: this._user.username,
      _failed_login_count: {
        $gte: this._config.accountLockout.threshold
      }
    };
    const now = new Date();
    const updateFields = {
      _account_lockout_expires_at: _node.default._encode(new Date(now.getTime() + this._config.accountLockout.duration * 60 * 1000))
    };
    return this._config.database.update('_User', query, updateFields).catch(err => {
      if (err && err.code && err.message && err.code === _node.default.Error.OBJECT_NOT_FOUND && err.message === 'Object not found.') {
        return; // nothing to update so we are good
      } else {
        throw err; // unknown error
      }
    });
  }

  /**
   * if _account_lockout_expires_at > current_time and _failed_login_count > threshold
   *   reject with account locked error
   * else
   *   resolve
   */
  _notLocked() {
    const query = {
      username: this._user.username,
      _account_lockout_expires_at: {
        $gt: _node.default._encode(new Date())
      },
      _failed_login_count: {
        $gte: this._config.accountLockout.threshold
      }
    };
    return this._config.database.find('_User', query).then(users => {
      if (Array.isArray(users) && users.length > 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your account is locked due to multiple failed login attempts. Please try again after ' + this._config.accountLockout.duration + ' minute(s)');
      }
    });
  }

  /**
   * set and/or increment _failed_login_count
   * if _failed_login_count > threshold
   *   set the _account_lockout_expires_at to current_time + accountPolicy.duration
   * else
   *   do nothing
   */
  _handleFailedLoginAttempt() {
    return this._initFailedLoginCount().then(() => {
      return this._incrementFailedLoginCount();
    }).then(() => {
      return this._setLockoutExpiration();
    });
  }

  /**
   * handle login attempt if the Account Lockout Policy is enabled
   */
  handleLoginAttempt(loginSuccessful) {
    if (!this._config.accountLockout) {
      return Promise.resolve();
    }
    return this._notLocked().then(() => {
      if (loginSuccessful) {
        return this._setFailedLoginCount(0);
      } else {
        return this._handleFailedLoginAttempt();
      }
    });
  }

  /**
   * Removes the account lockout.
   */
  unlockAccount() {
    if (!this._config.accountLockout || !this._config.accountLockout.unlockOnPasswordReset) {
      return Promise.resolve();
    }
    return this._config.database.update('_User', {
      username: this._user.username
    }, {
      _failed_login_count: {
        __op: 'Delete'
      },
      _account_lockout_expires_at: {
        __op: 'Delete'
      }
    });
  }
}
exports.AccountLockout = AccountLockout;
var _default = exports.default = AccountLockout;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiQWNjb3VudExvY2tvdXQiLCJjb25zdHJ1Y3RvciIsInVzZXIiLCJjb25maWciLCJfdXNlciIsIl9jb25maWciLCJfc2V0RmFpbGVkTG9naW5Db3VudCIsInZhbHVlIiwicXVlcnkiLCJ1c2VybmFtZSIsInVwZGF0ZUZpZWxkcyIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJkYXRhYmFzZSIsInVwZGF0ZSIsIl9pc0ZhaWxlZExvZ2luQ291bnRTZXQiLCIkZXhpc3RzIiwiZmluZCIsInRoZW4iLCJ1c2VycyIsIkFycmF5IiwiaXNBcnJheSIsImxlbmd0aCIsIl9pbml0RmFpbGVkTG9naW5Db3VudCIsImZhaWxlZExvZ2luQ291bnRJc1NldCIsIl9pbmNyZW1lbnRGYWlsZWRMb2dpbkNvdW50IiwiX19vcCIsImFtb3VudCIsIl9zZXRMb2Nrb3V0RXhwaXJhdGlvbiIsIiRndGUiLCJhY2NvdW50TG9ja291dCIsInRocmVzaG9sZCIsIm5vdyIsIkRhdGUiLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJQYXJzZSIsIl9lbmNvZGUiLCJnZXRUaW1lIiwiZHVyYXRpb24iLCJjYXRjaCIsImVyciIsImNvZGUiLCJtZXNzYWdlIiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiX25vdExvY2tlZCIsIiRndCIsIl9oYW5kbGVGYWlsZWRMb2dpbkF0dGVtcHQiLCJoYW5kbGVMb2dpbkF0dGVtcHQiLCJsb2dpblN1Y2Nlc3NmdWwiLCJQcm9taXNlIiwicmVzb2x2ZSIsInVubG9ja0FjY291bnQiLCJ1bmxvY2tPblBhc3N3b3JkUmVzZXQiLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi9zcmMvQWNjb3VudExvY2tvdXQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhpcyBjbGFzcyBoYW5kbGVzIHRoZSBBY2NvdW50IExvY2tvdXQgUG9saWN5IHNldHRpbmdzLlxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5leHBvcnQgY2xhc3MgQWNjb3VudExvY2tvdXQge1xuICBjb25zdHJ1Y3Rvcih1c2VyLCBjb25maWcpIHtcbiAgICB0aGlzLl91c2VyID0gdXNlcjtcbiAgICB0aGlzLl9jb25maWcgPSBjb25maWc7XG4gIH1cblxuICAvKipcbiAgICogc2V0IF9mYWlsZWRfbG9naW5fY291bnQgdG8gdmFsdWVcbiAgICovXG4gIF9zZXRGYWlsZWRMb2dpbkNvdW50KHZhbHVlKSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICB1c2VybmFtZTogdGhpcy5fdXNlci51c2VybmFtZSxcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlRmllbGRzID0ge1xuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogdmFsdWUsXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIGNoZWNrIGlmIHRoZSBfZmFpbGVkX2xvZ2luX2NvdW50IGZpZWxkIGhhcyBiZWVuIHNldFxuICAgKi9cbiAgX2lzRmFpbGVkTG9naW5Db3VudFNldCgpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZXhpc3RzOiB0cnVlIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCBxdWVyeSkudGhlbih1c2VycyA9PiB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh1c2VycykgJiYgdXNlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpZiBfZmFpbGVkX2xvZ2luX2NvdW50IGlzIE5PVCBzZXQgdGhlbiBzZXQgaXQgdG8gMFxuICAgKiBlbHNlIGRvIG5vdGhpbmdcbiAgICovXG4gIF9pbml0RmFpbGVkTG9naW5Db3VudCgpIHtcbiAgICByZXR1cm4gdGhpcy5faXNGYWlsZWRMb2dpbkNvdW50U2V0KCkudGhlbihmYWlsZWRMb2dpbkNvdW50SXNTZXQgPT4ge1xuICAgICAgaWYgKCFmYWlsZWRMb2dpbkNvdW50SXNTZXQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldEZhaWxlZExvZ2luQ291bnQoMCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogaW5jcmVtZW50IF9mYWlsZWRfbG9naW5fY291bnQgYnkgMVxuICAgKi9cbiAgX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQoKSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICB1c2VybmFtZTogdGhpcy5fdXNlci51c2VybmFtZSxcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlRmllbGRzID0ge1xuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyBfX29wOiAnSW5jcmVtZW50JywgYW1vdW50OiAxIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIGlmIHRoZSBmYWlsZWQgbG9naW4gY291bnQgaXMgZ3JlYXRlciB0aGFuIHRoZSB0aHJlc2hvbGRcbiAgICogdGhlbiBzZXRzIGxvY2tvdXQgZXhwaXJhdGlvbiB0byAnY3VycmVudHRpbWUgKyBhY2NvdW50UG9saWN5LmR1cmF0aW9uJywgaS5lLiwgYWNjb3VudCBpcyBsb2NrZWQgb3V0IGZvciB0aGUgbmV4dCAnYWNjb3VudFBvbGljeS5kdXJhdGlvbicgbWludXRlc1xuICAgKiBlbHNlIGRvIG5vdGhpbmdcbiAgICovXG4gIF9zZXRMb2Nrb3V0RXhwaXJhdGlvbigpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZ3RlOiB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQudGhyZXNob2xkIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG5cbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQ6IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQuZHVyYXRpb24gKiA2MCAqIDEwMDApXG4gICAgICApLFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCBxdWVyeSwgdXBkYXRlRmllbGRzKS5jYXRjaChlcnIgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnIgJiZcbiAgICAgICAgZXJyLmNvZGUgJiZcbiAgICAgICAgZXJyLm1lc3NhZ2UgJiZcbiAgICAgICAgZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQgJiZcbiAgICAgICAgZXJyLm1lc3NhZ2UgPT09ICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICkge1xuICAgICAgICByZXR1cm47IC8vIG5vdGhpbmcgdG8gdXBkYXRlIHNvIHdlIGFyZSBnb29kXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnI7IC8vIHVua25vd24gZXJyb3JcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBpZiBfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPiBjdXJyZW50X3RpbWUgYW5kIF9mYWlsZWRfbG9naW5fY291bnQgPiB0aHJlc2hvbGRcbiAgICogICByZWplY3Qgd2l0aCBhY2NvdW50IGxvY2tlZCBlcnJvclxuICAgKiBlbHNlXG4gICAqICAgcmVzb2x2ZVxuICAgKi9cbiAgX25vdExvY2tlZCgpIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lLFxuICAgICAgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0OiB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9LFxuICAgICAgX2ZhaWxlZF9sb2dpbl9jb3VudDogeyAkZ3RlOiB0aGlzLl9jb25maWcuYWNjb3VudExvY2tvdXQudGhyZXNob2xkIH0sXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCBxdWVyeSkudGhlbih1c2VycyA9PiB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh1c2VycykgJiYgdXNlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnWW91ciBhY2NvdW50IGlzIGxvY2tlZCBkdWUgdG8gbXVsdGlwbGUgZmFpbGVkIGxvZ2luIGF0dGVtcHRzLiBQbGVhc2UgdHJ5IGFnYWluIGFmdGVyICcgK1xuICAgICAgICAgICAgdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0LmR1cmF0aW9uICtcbiAgICAgICAgICAgICcgbWludXRlKHMpJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIHNldCBhbmQvb3IgaW5jcmVtZW50IF9mYWlsZWRfbG9naW5fY291bnRcbiAgICogaWYgX2ZhaWxlZF9sb2dpbl9jb3VudCA+IHRocmVzaG9sZFxuICAgKiAgIHNldCB0aGUgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0IHRvIGN1cnJlbnRfdGltZSArIGFjY291bnRQb2xpY3kuZHVyYXRpb25cbiAgICogZWxzZVxuICAgKiAgIGRvIG5vdGhpbmdcbiAgICovXG4gIF9oYW5kbGVGYWlsZWRMb2dpbkF0dGVtcHQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2luaXRGYWlsZWRMb2dpbkNvdW50KClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2luY3JlbWVudEZhaWxlZExvZ2luQ291bnQoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZXRMb2Nrb3V0RXhwaXJhdGlvbigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogaGFuZGxlIGxvZ2luIGF0dGVtcHQgaWYgdGhlIEFjY291bnQgTG9ja291dCBQb2xpY3kgaXMgZW5hYmxlZFxuICAgKi9cbiAgaGFuZGxlTG9naW5BdHRlbXB0KGxvZ2luU3VjY2Vzc2Z1bCkge1xuICAgIGlmICghdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9ub3RMb2NrZWQoKS50aGVuKCgpID0+IHtcbiAgICAgIGlmIChsb2dpblN1Y2Nlc3NmdWwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldEZhaWxlZExvZ2luQ291bnQoMCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5faGFuZGxlRmFpbGVkTG9naW5BdHRlbXB0KCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyB0aGUgYWNjb3VudCBsb2Nrb3V0LlxuICAgKi9cbiAgdW5sb2NrQWNjb3VudCgpIHtcbiAgICBpZiAoIXRoaXMuX2NvbmZpZy5hY2NvdW50TG9ja291dCB8fCAhdGhpcy5fY29uZmlnLmFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICdfVXNlcicsXG4gICAgICB7IHVzZXJuYW1lOiB0aGlzLl91c2VyLnVzZXJuYW1lIH0sXG4gICAgICB7XG4gICAgICAgIF9mYWlsZWRfbG9naW5fY291bnQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgICAgX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0OiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBY2NvdW50TG9ja291dDtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQStCLFNBQUFELHVCQUFBRSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBRC9COztBQUdPLE1BQU1HLGNBQWMsQ0FBQztFQUMxQkMsV0FBV0EsQ0FBQ0MsSUFBSSxFQUFFQyxNQUFNLEVBQUU7SUFDeEIsSUFBSSxDQUFDQyxLQUFLLEdBQUdGLElBQUk7SUFDakIsSUFBSSxDQUFDRyxPQUFPLEdBQUdGLE1BQU07RUFDdkI7O0VBRUE7QUFDRjtBQUNBO0VBQ0VHLG9CQUFvQkEsQ0FBQ0MsS0FBSyxFQUFFO0lBQzFCLE1BQU1DLEtBQUssR0FBRztNQUNaQyxRQUFRLEVBQUUsSUFBSSxDQUFDTCxLQUFLLENBQUNLO0lBQ3ZCLENBQUM7SUFFRCxNQUFNQyxZQUFZLEdBQUc7TUFDbkJDLG1CQUFtQixFQUFFSjtJQUN2QixDQUFDO0lBRUQsT0FBTyxJQUFJLENBQUNGLE9BQU8sQ0FBQ08sUUFBUSxDQUFDQyxNQUFNLENBQUMsT0FBTyxFQUFFTCxLQUFLLEVBQUVFLFlBQVksQ0FBQztFQUNuRTs7RUFFQTtBQUNGO0FBQ0E7RUFDRUksc0JBQXNCQSxDQUFBLEVBQUc7SUFDdkIsTUFBTU4sS0FBSyxHQUFHO01BQ1pDLFFBQVEsRUFB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