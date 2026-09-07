/*
 * A slightly patched version of node's URL module, with support for `mongodb://` URIs.
 * See https://github.com/nodejs/node for licensing information.
 */

'use strict';

var _punycode = _interopRequireDefault(require("punycode/punycode.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;
exports.Url = Url;
function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
const protocolPattern = /^([a-z0-9.+-]+:)/i;
const portPattern = /:[0-9]*$/;

// Special case for a simple path URL
const simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;

// protocols that can allow "unsafe" and "unwise" chars.
const unsafeProtocol = {
  javascript: true,
  'javascript:': true
};
// protocols that never have a hostname.
const hostlessProtocol = {
  javascript: true,
  'javascript:': true
};
// protocols that always contain a // bit.
const slashedProtocol = {
  http: true,
  'http:': true,
  https: true,
  'https:': true,
  ftp: true,
  'ftp:': true,
  gopher: true,
  'gopher:': true,
  file: true,
  'file:': true
};
const querystring = require('querystring');

/* istanbul ignore next: improve coverage */
function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url instanceof Url) {
    return url;
  }
  var u = new Url();
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

/* istanbul ignore next: improve coverage */
Url.prototype.parse = function (url, parseQueryString, slashesDenoteHost) {
  if (typeof url !== 'string') {
    throw new TypeError('Parameter "url" must be a string, not ' + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var hasHash = false;
  var start = -1;
  var end = -1;
  var rest = '';
  var lastPos = 0;
  var i = 0;
  for (var inWs = false, split = false; i < url.length; ++i) {
    const code = url.charCodeAt(i);

    // Find first and last non-whitespace characters for trimming
    const isWs = code === 32 /* */ || code === 9 /*\t*/ || code === 13 /*\r*/ || code === 10 /*\n*/ || code === 12 /*\f*/ || code === 160 /*\u00A0*/ || code === 65279; /*\uFEFF*/
    if (start === -1) {
      if (isWs) {
        continue;
      }
      lastPos = start = i;
    } else {
      if (inWs) {
        if (!isWs) {
          end = -1;
          inWs = false;
        }
      } else if (isWs) {
        end = i;
        inWs = true;
      }
    }

    // Only convert backslashes while we haven't seen a split character
    if (!split) {
      switch (code) {
        case 35:
          // '#'
          hasHash = true;
        // Fall through
        case 63:
          // '?'
          split = true;
          break;
        case 92:
          // '\\'
          if (i - lastPos > 0) {
            rest += url.slice(lastPos, i);
          }
          rest += '/';
          lastPos = i + 1;
          break;
      }
    } else if (!hasHash && code === 35 /*#*/) {
      hasHash = true;
    }
  }

  // Check if string was non-empty (including strings with only whitespace)
  if (start !== -1) {
    if (lastPos === start) {
      // We didn't convert any backslashes

      if (end === -1) {
        if (start === 0) {
          rest = url;
        } else {
          rest = url.slice(start);
        }
      } else {
        rest = url.slice(start, end);
      }
    } else if (end === -1 && lastPos < url.length) {
      // We converted some backslashes and have only part of the entire string
      rest += url.slice(lastPos);
    } else if (end !== -1 && lastPos < end) {
      // We converted some backslashes and have only part of the entire string
      rest += url.slice(lastPos, end);
    }
  }
  if (!slashesDenoteHost && !hasHash) {
    // Try fast path regexp
    const simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.slice(1));
        } else {
          this.query = this.search.slice(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }
  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.slice(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || /^\/\/[^@\/]+@[^@\/]+/.test(rest)) {
    var slashes = rest.charCodeAt(0) === 47 /*/*/ && rest.charCodeAt(1) === 47; /*/*/
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.slice(2);
      this.slashes = true;
    }
  }
  if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:b path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    var hostEnd = -1;
    var atSign = -1;
    var nonHost = -1;
    for (i = 0; i < rest.length; ++i) {
      switch (rest.charCodeAt(i)) {
        case 9: // '\t'
        case 10: // '\n'
        case 13: // '\r'
        case 32: // ' '
        case 34: // '"'
        case 37: // '%'
        case 39: // '\''
        case 59: // ';'
        case 60: // '<'
        case 62: // '>'
        case 92: // '\\'
        case 94: // '^'
        case 96: // '`'
        case 123: // '{'
        case 124: // '|'
        case 125:
          // '}'
          // Characters that are never ever allowed in a hostname from RFC 2396
          if (nonHost === -1) {
            nonHost = i;
          }
          break;
        case 35: // '#'
        case 47: // '/'
        case 63:
          // '?'
          // Find the first instance of any host-ending characters
          if (nonHost === -1) {
            nonHost = i;
          }
          hostEnd = i;
          break;
        case 64:
          // '@'
          // At this point, either we have an explicit point where the
          // auth portion cannot go past, or the last @ char is the decider.
          atSign = i;
          nonHost = -1;
          break;
      }
      if (hostEnd !== -1) {
        break;
      }
    }
    start = 0;
    if (atSign !== -1) {
      this.auth = decodeURIComponent(rest.slice(0, atSign));
      start = atSign + 1;
    }
    if (nonHost === -1) {
      this.host = rest.slice(start);
      rest = '';
    } else {
      this.host = rest.slice(start, nonHost);
      rest = rest.slice(nonHost);
    }

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    if (typeof this.hostname !== 'string') {
      this.hostname = '';
    }
    var hostname = this.hostname;

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = hostname.charCodeAt(0) === 91 /*[*/ && hostname.charCodeAt(hostname.length - 1) === 93; /*]*/

    // validate a little.
    if (!ipv6Hostname) {
      const result = validateHostname(this, rest, hostname);
      if (result !== undefined) {
        rest = result;
      }
    }

    // hostnames are always lower case.
    this.hostname = this.hostname.toLowerCase();
    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = _punycode.default.toASCII(this.hostname);
    }
    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.slice(1, -1);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {
    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    const result = autoEscapeStr(rest);
    if (result !== undefined) {
      rest = result;
    }
  }
  var questionIdx = -1;
  var hashIdx = -1;
  for (i = 0; i < rest.length; ++i) {
    const code = rest.charCodeAt(i);
    if (code === 35 /*#*/) {
      this.hash = rest.slice(i);
      hashIdx = i;
      break;
    } else if (code === 63 /*?*/ && questionIdx === -1) {
      questionIdx = i;
    }
  }
  if (questionIdx !== -1) {
    if (hashIdx === -1) {
      this.search = rest.slice(questionIdx);
      this.query = rest.slice(questionIdx + 1);
    } else {
      this.search = rest.slice(questionIdx, hashIdx);
      this.query = rest.slice(questionIdx + 1, hashIdx);
    }
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  var firstIdx = questionIdx !== -1 && (hashIdx === -1 || questionIdx < hashIdx) ? questionIdx : hashIdx;
  if (firstIdx === -1) {
    if (rest.length > 0) {
      this.pathname = rest;
    }
  } else if (firstIdx > 0) {
    this.pathname = rest.slice(0, firstIdx);
  }
  if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  // to support http.request
  if (this.pathname || this.search) {
    const p = this.pathname || '';
    const s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

/* istanbul ignore next: improve coverage */
function validateHostname(self, rest, hostname) {
  for (var i = 0, lastPos; i <= hostname.length; ++i) {
    var code;
    if (i < hostname.length) {
      code = hostname.charCodeAt(i);
    }
    if (code === 46 /*.*/ || i === hostname.length) {
      if (i - lastPos > 0) {
        if (i - lastPos > 63) {
          self.hostname = hostname.slice(0, lastPos + 63);
          return '/' + hostname.slice(lastPos + 63) + rest;
        }
      }
      lastPos = i + 1;
      continue;
    } else if (code >= 48 /*0*/ && code <= 57 /*9*/ || code >= 97 /*a*/ && code <= 122 /*z*/ || code === 45 /*-*/ || code >= 65 /*A*/ && code <= 90 /*Z*/ || code === 43 /*+*/ || code === 95 /*_*/ || /* BEGIN MONGO URI PATCH */
    code === 44 /*,*/ || code === 58 /*:*/ || /* END MONGO URI PATCH */
    code > 127) {
      continue;
    }
    // Invalid host character
    self.hostname = hostname.slice(0, i);
    if (i < hostname.length) {
      return '/' + hostname.slice(i) + rest;
    }
    break;
  }
}

/* istanbul ignore next: improve coverage */
function autoEscapeStr(rest) {
  var newRest = '';
  var lastPos = 0;
  for (var i = 0; i < rest.length; ++i) {
    // Automatically escape all delimiters and unwise characters from RFC 2396
    // Also escape single quotes in case of an XSS attack
    switch (rest.charCodeAt(i)) {
      case 9:
        // '\t'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%09';
        lastPos = i + 1;
        break;
      case 10:
        // '\n'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%0A';
        lastPos = i + 1;
        break;
      case 13:
        // '\r'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%0D';
        lastPos = i + 1;
        break;
      case 32:
        // ' '
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%20';
        lastPos = i + 1;
        break;
      case 34:
        // '"'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%22';
        lastPos = i + 1;
        break;
      case 39:
        // '\''
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%27';
        lastPos = i + 1;
        break;
      case 60:
        // '<'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%3C';
        lastPos = i + 1;
        break;
      case 62:
        // '>'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%3E';
        lastPos = i + 1;
        break;
      case 92:
        // '\\'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%5C';
        lastPos = i + 1;
        break;
      case 94:
        // '^'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%5E';
        lastPos = i + 1;
        break;
      case 96:
        // '`'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%60';
        lastPos = i + 1;
        break;
      case 123:
        // '{'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%7B';
        lastPos = i + 1;
        break;
      case 124:
        // '|'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%7C';
        lastPos = i + 1;
        break;
      case 125:
        // '}'
        if (i - lastPos > 0) {
          newRest += rest.slice(lastPos, i);
        }
        newRest += '%7D';
        lastPos = i + 1;
        break;
    }
  }
  if (lastPos === 0) {
    return;
  }
  if (lastPos < rest.length) {
    return newRest + rest.slice(lastPos);
  } else {
    return newRest;
  }
}

// format a parsed object into a url string
/* istanbul ignore next: improve coverage */
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof obj === 'string') {
    obj = urlParse(obj);
  } else if (typeof obj !== 'object' || obj === null) {
    throw new TypeError('Parameter "urlObj" must be an object, not ' + (obj === null ? 'null' : typeof obj));
  } else if (!(obj instanceof Url)) {
    return Url.prototype.format.call(obj);
  }
  return obj.format();
}

/* istanbul ignore next: improve coverage */
Url.prototype.format = function () {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeAuth(auth);
    auth += '@';
  }
  var protocol = this.protocol || '';
  var pathname = this.pathname || '';
  var hash = this.hash || '';
  var host = false;
  var query = '';
  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ? this.hostname : '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }
  if (this.query !== null && typeof this.query === 'object') {
    query = querystring.stringify(this.query);
  }
  var search = this.search || query && '?' + query || '';
  if (protocol && protocol.charCodeAt(protocol.length - 1) !== 58 /*:*/) {
    protocol += ':';
  }
  var newPathname = '';
  var lastPos = 0;
  for (var i = 0; i < pathname.length; ++i) {
    switch (pathname.charCodeAt(i)) {
      case 35:
        // '#'
        if (i - lastPos > 0) {
          newPathname += pathname.slice(lastPos, i);
        }
        newPathname += '%23';
        lastPos = i + 1;
        break;
      case 63:
        // '?'
        if (i - lastPos > 0) {
          newPathname += pathname.slice(lastPos, i);
        }
        newPathname += '%3F';
        lastPos = i + 1;
        break;
    }
  }
  if (lastPos > 0) {
    if (lastPos !== pathname.length) {
      pathname = newPathname + pathname.slice(lastPos);
    } else {
      pathname = newPathname;
    }
  }

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes || (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charCodeAt(0) !== 47 /*/*/) {
      pathname = '/' + pathname;
    }
  } else if (!host) {
    host = '';
  }
  search = search.replace('#', '%23');
  if (hash && hash.charCodeAt(0) !== 35 /*#*/) {
    hash = '#' + hash;
  }
  if (search && search.charCodeAt(0) !== 63 /*?*/) {
    search = '?' + search;
  }
  return protocol + host + pathname + search + hash;
};

/* istanbul ignore next: improve coverage */
function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

/* istanbul ignore next: improve coverage */
Url.prototype.resolve = function (relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

/* istanbul ignore next: improve coverage */
function urlResolveObject(source, relative) {
  if (!source) {
    return relative;
  }
  return urlParse(source, false, true).resolveObject(relative);
}

/* istanbul ignore next: improve coverage */
Url.prototype.resolveObject = function (relative) {
  if (typeof relative === 'string') {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }
  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol') {
        result[rkey] = relative[rkey];
      }
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] && result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }
    result.href = result.format();
    return result;
  }
  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }
    result.protocol = relative.protocol;
    if (!relative.host && !/^file:?$/.test(relative.protocol) && !hostlessProtocol[relative.protocol]) {
      const relPath = (relative.pathname || '').split('/');
      while (relPath.length) {
        const shifted = relPath.shift();
        if (shifted) {
          relative.host = shifted;
          break;
        }
      }
      if (!relative.host) {
        relative.host = '';
      }
      if (!relative.hostname) {
        relative.hostname = '';
      }
      if (relPath[0] !== '') {
        relPath.unshift('');
      }
      if (relPath.length < 2) {
        relPath.unshift('');
      }
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }
  var isSourceAbs = result.pathname && result.pathname.charAt(0) === '/';
  var isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === '/';
  var mustEndAbs = isRelAbs || isSourceAbs || result.host && relative.pathname;
  var removeAllDots = mustEndAbs;
  var srcPath = result.pathname && result.pathname.split('/') || [];
  var relPath = relative.pathname && relative.pathname.split('/') || [];
  var psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') {
        srcPath[0] = result.host;
      } else {
        srcPath.unshift(result.host);
      }
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') {
          relPath[0] = relative.host;
        } else {
          relPath.unshift(relative.host);
        }
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }
  if (isRelAbs) {
    // it's absolute.
    result.host = relative.host || relative.host === '' ? relative.host : result.host;
    result.hostname = relative.hostname || relative.hostname === '' ? relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) {
      srcPath = [];
    }
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (relative.search !== null && relative.search !== undefined) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occasionally the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (result.pathname !== null || result.search !== null) {
      result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }
  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === '.' || last === '..') || last === '';

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      spliceOne(srcPath, i);
    } else if (last === '..') {
      spliceOne(srcPath, i);
      up++;
    } else if (up) {
      spliceOne(srcPath, i);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }
  if (mustEndAbs && srcPath[0] !== '' && (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }
  if (hasTrailingSlash && srcPath.join('/').substr(-1) !== '/') {
    srcPath.push('');
  }
  var isAbsolute = srcPath[0] === '' || srcPath[0] && srcPath[0].charAt(0) === '/';

  // put the host back
  if (psychotic) {
    if (isAbsolute) {
      result.hostname = result.host = '';
    } else {
      result.hostname = result.host = srcPath.length ? srcPath.shift() : '';
    }
    //occasionally the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }
  mustEndAbs = mustEndAbs || result.host && srcPath.length;
  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }
  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (result.pathname !== null || result.search !== null) {
    result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

/* istanbul ignore next: improve coverage */
Url.prototype.parseHost = function () {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.slice(1);
    }
    host = host.slice(0, host.length - port.length);
  }
  if (host) {
    this.hostname = host;
  }
};

// About 1.5x faster than the two-arg version of Array#splice().
/* istanbul ignore next: improve coverage */
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1) {
    list[i] = list[k];
  }
  list.pop();
}
var hexTable = new Array(256);
for (var i = 0; i < 256; ++i) {
  hexTable[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase();
}
/* istanbul ignore next: improve coverage */
function encodeAuth(str) {
  // faster encodeURIComponent alternative for encoding auth uri components
  var out = '';
  var lastPos = 0;
  for (var i = 0; i < str.length; ++i) {
    var c = str.charCodeAt(i);

    // These characters do not need escaping:
    // ! - . _ ~
    // ' ( ) * :
    // digits
    // alpha (uppercase)
    // alpha (lowercase)
    if (c === 0x21 || c === 0x2d || c === 0x2e || c === 0x5f || c === 0x7e || c >= 0x27 && c <= 0x2a || c >= 0x30 && c <= 0x3a || c >= 0x41 && c <= 0x5a || c >= 0x61 && c <= 0x7a) {
      continue;
    }
    if (i - lastPos > 0) {
      out += str.slice(lastPos, i);
    }
    lastPos = i + 1;

    // Other ASCII characters
    if (c < 0x80) {
      out += hexTable[c];
      continue;
    }

    // Multi-byte characters ...
    if (c < 0x800) {
      out += hexTable[0xc0 | c >> 6] + hexTable[0x80 | c & 0x3f];
      continue;
    }
    if (c < 0xd800 || c >= 0xe000) {
      out += hexTable[0xe0 | c >> 12] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
      continue;
    }
    // Surrogate pair
    ++i;
    var c2;
    if (i < str.length) {
      c2 = str.charCodeAt(i) & 0x3ff;
    } else {
      c2 = 0;
    }
    c = 0x10000 + ((c & 0x3ff) << 10 | c2);
    out += hexTable[0xf0 | c >> 18] + hexTable[0x80 | c >> 12 & 0x3f] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
  }
  if (lastPos === 0) {
    return str;
  }
  if (lastPos < str.length) {
    return out + str.slice(lastPos);
  }
  return out;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcHVueWNvZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImV4cG9ydHMiLCJwYXJzZSIsInVybFBhcnNlIiwicmVzb2x2ZSIsInVybFJlc29sdmUiLCJyZXNvbHZlT2JqZWN0IiwidXJsUmVzb2x2ZU9iamVjdCIsImZvcm1hdCIsInVybEZvcm1hdCIsIlVybCIsInByb3RvY29sIiwic2xhc2hlcyIsImF1dGgiLCJob3N0IiwicG9ydCIsImhvc3RuYW1lIiwiaGFzaCIsInNlYXJjaCIsInF1ZXJ5IiwicGF0aG5hbWUiLCJwYXRoIiwiaHJlZiIsInByb3RvY29sUGF0dGVybiIsInBvcnRQYXR0ZXJuIiwic2ltcGxlUGF0aFBhdHRlcm4iLCJ1bnNhZmVQcm90b2NvbCIsImphdmFzY3JpcHQiLCJob3N0bGVzc1Byb3RvY29sIiwic2xhc2hlZFByb3RvY29sIiwiaHR0cCIsImh0dHBzIiwiZnRwIiwiZ29waGVyIiwiZmlsZSIsInF1ZXJ5c3RyaW5nIiwidXJsIiwicGFyc2VRdWVyeVN0cmluZyIsInNsYXNoZXNEZW5vdGVIb3N0IiwidSIsInByb3RvdHlwZSIsIlR5cGVFcnJvciIsImhhc0hhc2giLCJzdGFydCIsImVuZCIsInJlc3QiLCJsYXN0UG9zIiwiaSIsImluV3MiLCJzcGxpdCIsImxlbmd0aCIsImNvZGUiLCJjaGFyQ29kZUF0IiwiaXNXcyIsInNsaWNlIiwic2ltcGxlUGF0aCIsImV4ZWMiLCJwcm90byIsImxvd2VyUHJvdG8iLCJ0b0xvd2VyQ2FzZSIsInRlc3QiLCJob3N0RW5kIiwiYXRTaWduIiwibm9uSG9zdCIsImRlY29kZVVSSUNvbXBvbmVudCIsInBhcnNlSG9zdCIsImlwdjZIb3N0bmFtZSIsInJlc3VsdCIsInZhbGlkYXRlSG9zdG5hbWUiLCJ1bmRlZmluZWQiLCJwdW55Y29kZSIsInRvQVNDSUkiLCJwIiwiaCIsImF1dG9Fc2NhcGVTdHIiLCJxdWVzdGlvbklkeCIsImhhc2hJZHgiLCJmaXJzdElkeCIsInMiLCJzZWxmIiwibmV3UmVzdCIsIm9iaiIsImNhbGwiLCJlbmNvZGVBdXRoIiwiaW5kZXhPZiIsInN0cmluZ2lmeSIsIm5ld1BhdGhuYW1lIiwicmVwbGFjZSIsInNvdXJjZSIsInJlbGF0aXZlIiwicmVsIiwidGtleXMiLCJPYmplY3QiLCJrZXlzIiwidGsiLCJ0a2V5IiwicmtleXMiLCJyayIsInJrZXkiLCJ2IiwiayIsInJlbFBhdGgiLCJzaGlmdGVkIiwic2hpZnQiLCJ1bnNoaWZ0Iiwiam9pbiIsImlzU291cmNlQWJzIiwiY2hhckF0IiwiaXNSZWxBYnMiLCJtdXN0RW5kQWJzIiwicmVtb3ZlQWxsRG90cyIsInNyY1BhdGgiLCJwc3ljaG90aWMiLCJwb3AiLCJjb25jYXQiLCJhdXRoSW5Ib3N0IiwibGFzdCIsImhhc1RyYWlsaW5nU2xhc2giLCJ1cCIsInNwbGljZU9uZSIsInN1YnN0ciIsInB1c2giLCJpc0Fic29sdXRlIiwibGlzdCIsImluZGV4IiwibiIsImhleFRhYmxlIiwiQXJyYXkiLCJ0b1N0cmluZyIsInRvVXBwZXJDYXNlIiwic3RyIiwib3V0IiwiYyIsImMyIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ZlbmRvci9tb25nb2RiVXJsLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBBIHNsaWdodGx5IHBhdGNoZWQgdmVyc2lvbiBvZiBub2RlJ3MgVVJMIG1vZHVsZSwgd2l0aCBzdXBwb3J0IGZvciBgbW9uZ29kYjovL2AgVVJJcy5cbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUgZm9yIGxpY2Vuc2luZyBpbmZvcm1hdGlvbi5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCBwdW55Y29kZSBmcm9tICdwdW55Y29kZS9wdW55Y29kZS5qcyc7XG5cbmV4cG9ydHMucGFyc2UgPSB1cmxQYXJzZTtcbmV4cG9ydHMucmVzb2x2ZSA9IHVybFJlc29sdmU7XG5leHBvcnRzLnJlc29sdmVPYmplY3QgPSB1cmxSZXNvbHZlT2JqZWN0O1xuZXhwb3J0cy5mb3JtYXQgPSB1cmxGb3JtYXQ7XG5cbmV4cG9ydHMuVXJsID0gVXJsO1xuXG5mdW5jdGlvbiBVcmwoKSB7XG4gIHRoaXMucHJvdG9jb2wgPSBudWxsO1xuICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICB0aGlzLmF1dGggPSBudWxsO1xuICB0aGlzLmhvc3QgPSBudWxsO1xuICB0aGlzLnBvcnQgPSBudWxsO1xuICB0aGlzLmhvc3RuYW1lID0gbnVsbDtcbiAgdGhpcy5oYXNoID0gbnVsbDtcbiAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICB0aGlzLnF1ZXJ5ID0gbnVsbDtcbiAgdGhpcy5wYXRobmFtZSA9IG51bGw7XG4gIHRoaXMucGF0aCA9IG51bGw7XG4gIHRoaXMuaHJlZiA9IG51bGw7XG59XG5cbi8vIFJlZmVyZW5jZTogUkZDIDM5ODYsIFJGQyAxODA4LCBSRkMgMjM5NlxuXG4vLyBkZWZpbmUgdGhlc2UgaGVyZSBzbyBhdCBsZWFzdCB0aGV5IG9ubHkgaGF2ZSB0byBiZVxuLy8gY29tcGlsZWQgb25jZSBvbiB0aGUgZmlyc3QgbW9kdWxlIGxvYWQuXG5jb25zdCBwcm90b2NvbFBhdHRlcm4gPSAvXihbYS16MC05ListXSs6KS9pO1xuY29uc3QgcG9ydFBhdHRlcm4gPSAvOlswLTldKiQvO1xuXG4vLyBTcGVjaWFsIGNhc2UgZm9yIGEgc2ltcGxlIHBhdGggVVJMXG5jb25zdCBzaW1wbGVQYXRoUGF0dGVybiA9IC9eKFxcL1xcLz8oPyFcXC8pW15cXD9cXHNdKikoXFw/W15cXHNdKik/JC87XG5cbi8vIHByb3RvY29scyB0aGF0IGNhbiBhbGxvdyBcInVuc2FmZVwiIGFuZCBcInVud2lzZVwiIGNoYXJzLlxuY29uc3QgdW5zYWZlUHJvdG9jb2wgPSB7XG4gIGphdmFzY3JpcHQ6IHRydWUsXG4gICdqYXZhc2NyaXB0Oic6IHRydWUsXG59O1xuLy8gcHJvdG9jb2xzIHRoYXQgbmV2ZXIgaGF2ZSBhIGhvc3RuYW1lLlxuY29uc3QgaG9zdGxlc3NQcm90b2NvbCA9IHtcbiAgamF2YXNjcmlwdDogdHJ1ZSxcbiAgJ2phdmFzY3JpcHQ6JzogdHJ1ZSxcbn07XG4vLyBwcm90b2NvbHMgdGhhdCBhbHdheXMgY29udGFpbiBhIC8vIGJpdC5cbmNvbnN0IHNsYXNoZWRQcm90b2NvbCA9IHtcbiAgaHR0cDogdHJ1ZSxcbiAgJ2h0dHA6JzogdHJ1ZSxcbiAgaHR0cHM6IHRydWUsXG4gICdodHRwczonOiB0cnVlLFxuICBmdHA6IHRydWUsXG4gICdmdHA6JzogdHJ1ZSxcbiAgZ29waGVyOiB0cnVlLFxuICAnZ29waGVyOic6IHRydWUsXG4gIGZpbGU6IHRydWUsXG4gICdmaWxlOic6IHRydWUsXG59O1xuY29uc3QgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpO1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICBpZiAodXJsIGluc3RhbmNlb2YgVXJsKSB7IHJldHVybiB1cmw7IH1cblxuICB2YXIgdSA9IG5ldyBVcmwoKTtcbiAgdS5wYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KTtcbiAgcmV0dXJuIHU7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24gKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignUGFyYW1ldGVyIFwidXJsXCIgbXVzdCBiZSBhIHN0cmluZywgbm90ICcgKyB0eXBlb2YgdXJsKTtcbiAgfVxuXG4gIC8vIENvcHkgY2hyb21lLCBJRSwgb3BlcmEgYmFja3NsYXNoLWhhbmRsaW5nIGJlaGF2aW9yLlxuICAvLyBCYWNrIHNsYXNoZXMgYmVmb3JlIHRoZSBxdWVyeSBzdHJpbmcgZ2V0IGNvbnZlcnRlZCB0byBmb3J3YXJkIHNsYXNoZXNcbiAgLy8gU2VlOiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MjU5MTZcbiAgdmFyIGhhc0hhc2ggPSBmYWxzZTtcbiAgdmFyIHN0YXJ0ID0gLTE7XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIHJlc3QgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICB2YXIgaSA9IDA7XG4gIGZvciAodmFyIGluV3MgPSBmYWxzZSwgc3BsaXQgPSBmYWxzZTsgaSA8IHVybC5sZW5ndGg7ICsraSkge1xuICAgIGNvbnN0IGNvZGUgPSB1cmwuY2hhckNvZGVBdChpKTtcblxuICAgIC8vIEZpbmQgZmlyc3QgYW5kIGxhc3Qgbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVycyBmb3IgdHJpbW1pbmdcbiAgICBjb25zdCBpc1dzID1cbiAgICAgIGNvZGUgPT09IDMyIC8qICovIHx8XG4gICAgICBjb2RlID09PSA5IC8qXFx0Ki8gfHxcbiAgICAgIGNvZGUgPT09IDEzIC8qXFxyKi8gfHxcbiAgICAgIGNvZGUgPT09IDEwIC8qXFxuKi8gfHxcbiAgICAgIGNvZGUgPT09IDEyIC8qXFxmKi8gfHxcbiAgICAgIGNvZGUgPT09IDE2MCAvKlxcdTAwQTAqLyB8fFxuICAgICAgY29kZSA9PT0gNjUyNzk7IC8qXFx1RkVGRiovXG4gICAgaWYgKHN0YXJ0ID09PSAtMSkge1xuICAgICAgaWYgKGlzV3MpIHsgY29udGludWU7IH1cbiAgICAgIGxhc3RQb3MgPSBzdGFydCA9IGk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChpbldzKSB7XG4gICAgICAgIGlmICghaXNXcykge1xuICAgICAgICAgIGVuZCA9IC0xO1xuICAgICAgICAgIGluV3MgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc1dzKSB7XG4gICAgICAgIGVuZCA9IGk7XG4gICAgICAgIGluV3MgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE9ubHkgY29udmVydCBiYWNrc2xhc2hlcyB3aGlsZSB3ZSBoYXZlbid0IHNlZW4gYSBzcGxpdCBjaGFyYWN0ZXJcbiAgICBpZiAoIXNwbGl0KSB7XG4gICAgICBzd2l0Y2ggKGNvZGUpIHtcbiAgICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgICAgIC8vIEZhbGwgdGhyb3VnaFxuICAgICAgICBjYXNlIDYzOiAvLyAnPydcbiAgICAgICAgICBzcGxpdCA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgOTI6IC8vICdcXFxcJ1xuICAgICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgICByZXN0ICs9ICcvJztcbiAgICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghaGFzSGFzaCAmJiBjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgaWYgc3RyaW5nIHdhcyBub24tZW1wdHkgKGluY2x1ZGluZyBzdHJpbmdzIHdpdGggb25seSB3aGl0ZXNwYWNlKVxuICBpZiAoc3RhcnQgIT09IC0xKSB7XG4gICAgaWYgKGxhc3RQb3MgPT09IHN0YXJ0KSB7XG4gICAgICAvLyBXZSBkaWRuJ3QgY29udmVydCBhbnkgYmFja3NsYXNoZXNcblxuICAgICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgICAgaWYgKHN0YXJ0ID09PSAwKSB7IHJlc3QgPSB1cmw7IH1cbiAgICAgICAgZWxzZSB7IHJlc3QgPSB1cmwuc2xpY2Uoc3RhcnQpOyB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN0ID0gdXJsLnNsaWNlKHN0YXJ0LCBlbmQpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZW5kID09PSAtMSAmJiBsYXN0UG9zIDwgdXJsLmxlbmd0aCkge1xuICAgICAgLy8gV2UgY29udmVydGVkIHNvbWUgYmFja3NsYXNoZXMgYW5kIGhhdmUgb25seSBwYXJ0IG9mIHRoZSBlbnRpcmUgc3RyaW5nXG4gICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zKTtcbiAgICB9IGVsc2UgaWYgKGVuZCAhPT0gLTEgJiYgbGFzdFBvcyA8IGVuZCkge1xuICAgICAgLy8gV2UgY29udmVydGVkIHNvbWUgYmFja3NsYXNoZXMgYW5kIGhhdmUgb25seSBwYXJ0IG9mIHRoZSBlbnRpcmUgc3RyaW5nXG4gICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zLCBlbmQpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghc2xhc2hlc0Rlbm90ZUhvc3QgJiYgIWhhc0hhc2gpIHtcbiAgICAvLyBUcnkgZmFzdCBwYXRoIHJlZ2V4cFxuICAgIGNvbnN0IHNpbXBsZVBhdGggPSBzaW1wbGVQYXRoUGF0dGVybi5leGVjKHJlc3QpO1xuICAgIGlmIChzaW1wbGVQYXRoKSB7XG4gICAgICB0aGlzLnBhdGggPSByZXN0O1xuICAgICAgdGhpcy5ocmVmID0gcmVzdDtcbiAgICAgIHRoaXMucGF0aG5hbWUgPSBzaW1wbGVQYXRoWzFdO1xuICAgICAgaWYgKHNpbXBsZVBhdGhbMl0pIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBzaW1wbGVQYXRoWzJdO1xuICAgICAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnNlYXJjaC5zbGljZSgxKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5xdWVyeSA9IHRoaXMuc2VhcmNoLnNsaWNlKDEpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSAnJztcbiAgICAgICAgdGhpcy5xdWVyeSA9IHt9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICB9XG5cbiAgdmFyIHByb3RvID0gcHJvdG9jb2xQYXR0ZXJuLmV4ZWMocmVzdCk7XG4gIGlmIChwcm90bykge1xuICAgIHByb3RvID0gcHJvdG9bMF07XG4gICAgdmFyIGxvd2VyUHJvdG8gPSBwcm90by50b0xvd2VyQ2FzZSgpO1xuICAgIHRoaXMucHJvdG9jb2wgPSBsb3dlclByb3RvO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKHByb3RvLmxlbmd0aCk7XG4gIH1cblxuICAvLyBmaWd1cmUgb3V0IGlmIGl0J3MgZ290IGEgaG9zdFxuICAvLyB1c2VyQHNlcnZlciBpcyAqYWx3YXlzKiBpbnRlcnByZXRlZCBhcyBhIGhvc3RuYW1lLCBhbmQgdXJsXG4gIC8vIHJlc29sdXRpb24gd2lsbCB0cmVhdCAvL2Zvby9iYXIgYXMgaG9zdD1mb28scGF0aD1iYXIgYmVjYXVzZSB0aGF0J3NcbiAgLy8gaG93IHRoZSBicm93c2VyIHJlc29sdmVzIHJlbGF0aXZlIFVSTHMuXG4gIGlmIChzbGFzaGVzRGVub3RlSG9zdCB8fCBwcm90byB8fCAvXlxcL1xcL1teQFxcL10rQFteQFxcL10rLy50ZXN0KHJlc3QpKSB7XG4gICAgdmFyIHNsYXNoZXMgPSByZXN0LmNoYXJDb2RlQXQoMCkgPT09IDQ3IC8qLyovICYmIHJlc3QuY2hhckNvZGVBdCgxKSA9PT0gNDc7IC8qLyovXG4gICAgaWYgKHNsYXNoZXMgJiYgIShwcm90byAmJiBob3N0bGVzc1Byb3RvY29sW3Byb3RvXSkpIHtcbiAgICAgIHJlc3QgPSByZXN0LnNsaWNlKDIpO1xuICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dICYmIChzbGFzaGVzIHx8IChwcm90byAmJiAhc2xhc2hlZFByb3RvY29sW3Byb3RvXSkpKSB7XG4gICAgLy8gdGhlcmUncyBhIGhvc3RuYW1lLlxuICAgIC8vIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiAvLCA/LCA7LCBvciAjIGVuZHMgdGhlIGhvc3QuXG4gICAgLy9cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBAIGluIHRoZSBob3N0bmFtZSwgdGhlbiBub24taG9zdCBjaGFycyAqYXJlKiBhbGxvd2VkXG4gICAgLy8gdG8gdGhlIGxlZnQgb2YgdGhlIGxhc3QgQCBzaWduLCB1bmxlc3Mgc29tZSBob3N0LWVuZGluZyBjaGFyYWN0ZXJcbiAgICAvLyBjb21lcyAqYmVmb3JlKiB0aGUgQC1zaWduLlxuICAgIC8vIFVSTHMgYXJlIG9ibm94aW91cy5cbiAgICAvL1xuICAgIC8vIGV4OlxuICAgIC8vIGh0dHA6Ly9hQGJAYy8gPT4gdXNlcjphQGIgaG9zdDpjXG4gICAgLy8gaHR0cDovL2FAYj9AYyA9PiB1c2VyOmEgaG9zdDpiIHBhdGg6Lz9AY1xuXG4gICAgLy8gdjAuMTIgVE9ETyhpc2FhY3MpOiBUaGlzIGlzIG5vdCBxdWl0ZSBob3cgQ2hyb21lIGRvZXMgdGhpbmdzLlxuICAgIC8vIFJldmlldyBvdXIgdGVzdCBjYXNlIGFnYWluc3QgYnJvd3NlcnMgbW9yZSBjb21wcmVoZW5zaXZlbHkuXG5cbiAgICB2YXIgaG9zdEVuZCA9IC0xO1xuICAgIHZhciBhdFNpZ24gPSAtMTtcbiAgICB2YXIgbm9uSG9zdCA9IC0xO1xuICAgIGZvciAoaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgICBjYXNlIDk6IC8vICdcXHQnXG4gICAgICAgIGNhc2UgMTA6IC8vICdcXG4nXG4gICAgICAgIGNhc2UgMTM6IC8vICdcXHInXG4gICAgICAgIGNhc2UgMzI6IC8vICcgJ1xuICAgICAgICBjYXNlIDM0OiAvLyAnXCInXG4gICAgICAgIGNhc2UgMzc6IC8vICclJ1xuICAgICAgICBjYXNlIDM5OiAvLyAnXFwnJ1xuICAgICAgICBjYXNlIDU5OiAvLyAnOydcbiAgICAgICAgY2FzZSA2MDogLy8gJzwnXG4gICAgICAgIGNhc2UgNjI6IC8vICc+J1xuICAgICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgY2FzZSA5NDogLy8gJ14nXG4gICAgICAgIGNhc2UgOTY6IC8vICdgJ1xuICAgICAgICBjYXNlIDEyMzogLy8gJ3snXG4gICAgICAgIGNhc2UgMTI0OiAvLyAnfCdcbiAgICAgICAgY2FzZSAxMjU6IC8vICd9J1xuICAgICAgICAgIC8vIENoYXJhY3RlcnMgdGhhdCBhcmUgbmV2ZXIgZXZlciBhbGxvd2VkIGluIGEgaG9zdG5hbWUgZnJvbSBSRkMgMjM5NlxuICAgICAgICAgIGlmIChub25Ib3N0ID09PSAtMSkgeyBub25Ib3N0ID0gaTsgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDM1OiAvLyAnIydcbiAgICAgICAgY2FzZSA0NzogLy8gJy8nXG4gICAgICAgIGNhc2UgNjM6IC8vICc/J1xuICAgICAgICAgIC8vIEZpbmQgdGhlIGZpcnN0IGluc3RhbmNlIG9mIGFueSBob3N0LWVuZGluZyBjaGFyYWN0ZXJzXG4gICAgICAgICAgaWYgKG5vbkhvc3QgPT09IC0xKSB7IG5vbkhvc3QgPSBpOyB9XG4gICAgICAgICAgaG9zdEVuZCA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgNjQ6IC8vICdAJ1xuICAgICAgICAgIC8vIEF0IHRoaXMgcG9pbnQsIGVpdGhlciB3ZSBoYXZlIGFuIGV4cGxpY2l0IHBvaW50IHdoZXJlIHRoZVxuICAgICAgICAgIC8vIGF1dGggcG9ydGlvbiBjYW5ub3QgZ28gcGFzdCwgb3IgdGhlIGxhc3QgQCBjaGFyIGlzIHRoZSBkZWNpZGVyLlxuICAgICAgICAgIGF0U2lnbiA9IGk7XG4gICAgICAgICAgbm9uSG9zdCA9IC0xO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKGhvc3RFbmQgIT09IC0xKSB7IGJyZWFrOyB9XG4gICAgfVxuICAgIHN0YXJ0ID0gMDtcbiAgICBpZiAoYXRTaWduICE9PSAtMSkge1xuICAgICAgdGhpcy5hdXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHJlc3Quc2xpY2UoMCwgYXRTaWduKSk7XG4gICAgICBzdGFydCA9IGF0U2lnbiArIDE7XG4gICAgfVxuICAgIGlmIChub25Ib3N0ID09PSAtMSkge1xuICAgICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZShzdGFydCk7XG4gICAgICByZXN0ID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuaG9zdCA9IHJlc3Quc2xpY2Uoc3RhcnQsIG5vbkhvc3QpO1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2Uobm9uSG9zdCk7XG4gICAgfVxuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB0aGlzLnBhcnNlSG9zdCgpO1xuXG4gICAgLy8gd2UndmUgaW5kaWNhdGVkIHRoYXQgdGhlcmUgaXMgYSBob3N0bmFtZSxcbiAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgIGlmICh0eXBlb2YgdGhpcy5ob3N0bmFtZSAhPT0gJ3N0cmluZycpIHsgdGhpcy5ob3N0bmFtZSA9ICcnOyB9XG5cbiAgICB2YXIgaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lO1xuXG4gICAgLy8gaWYgaG9zdG5hbWUgYmVnaW5zIHdpdGggWyBhbmQgZW5kcyB3aXRoIF1cbiAgICAvLyBhc3N1bWUgdGhhdCBpdCdzIGFuIElQdjYgYWRkcmVzcy5cbiAgICB2YXIgaXB2Nkhvc3RuYW1lID1cbiAgICAgIGhvc3RuYW1lLmNoYXJDb2RlQXQoMCkgPT09IDkxIC8qWyovICYmIGhvc3RuYW1lLmNoYXJDb2RlQXQoaG9zdG5hbWUubGVuZ3RoIC0gMSkgPT09IDkzOyAvKl0qL1xuXG4gICAgLy8gdmFsaWRhdGUgYSBsaXR0bGUuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlSG9zdG5hbWUodGhpcywgcmVzdCwgaG9zdG5hbWUpO1xuICAgICAgaWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSB7IHJlc3QgPSByZXN1bHQ7IH1cbiAgICB9XG5cbiAgICAvLyBob3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueWNvZGVkIHJlcHJlc2VudGF0aW9uIG9mIFwiZG9tYWluXCIuXG4gICAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgICAvLyBoYXZlIG5vbi1BU0NJSSBjaGFyYWN0ZXJzLCBpLmUuIGl0IGRvZXNuJ3QgbWF0dGVyIGlmXG4gICAgICAvLyB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQgYWxyZWFkeSBpcyBBU0NJSS1vbmx5LlxuICAgICAgdGhpcy5ob3N0bmFtZSA9IHB1bnljb2RlLnRvQVNDSUkodGhpcy5ob3N0bmFtZSk7XG4gICAgfVxuXG4gICAgdmFyIHAgPSB0aGlzLnBvcnQgPyAnOicgKyB0aGlzLnBvcnQgOiAnJztcbiAgICB2YXIgaCA9IHRoaXMuaG9zdG5hbWUgfHwgJyc7XG4gICAgdGhpcy5ob3N0ID0gaCArIHA7XG5cbiAgICAvLyBzdHJpcCBbIGFuZCBdIGZyb20gdGhlIGhvc3RuYW1lXG4gICAgLy8gdGhlIGhvc3QgZmllbGQgc3RpbGwgcmV0YWlucyB0aGVtLCB0aG91Z2hcbiAgICBpZiAoaXB2Nkhvc3RuYW1lKSB7XG4gICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS5zbGljZSgxLCAtMSk7XG4gICAgICBpZiAocmVzdFswXSAhPT0gJy8nKSB7XG4gICAgICAgIHJlc3QgPSAnLycgKyByZXN0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG5vdyByZXN0IGlzIHNldCB0byB0aGUgcG9zdC1ob3N0IHN0dWZmLlxuICAvLyBjaG9wIG9mZiBhbnkgZGVsaW0gY2hhcnMuXG4gIGlmICghdW5zYWZlUHJvdG9jb2xbbG93ZXJQcm90b10pIHtcbiAgICAvLyBGaXJzdCwgbWFrZSAxMDAlIHN1cmUgdGhhdCBhbnkgXCJhdXRvRXNjYXBlXCIgY2hhcnMgZ2V0XG4gICAgLy8gZXNjYXBlZCwgZXZlbiBpZiBlbmNvZGVVUklDb21wb25lbnQgZG9lc24ndCB0aGluayB0aGV5XG4gICAgLy8gbmVlZCB0byBiZS5cbiAgICBjb25zdCByZXN1bHQgPSBhdXRvRXNjYXBlU3RyKHJlc3QpO1xuICAgIGlmIChyZXN1bHQgIT09IHVuZGVmaW5lZCkgeyByZXN0ID0gcmVzdWx0OyB9XG4gIH1cblxuICB2YXIgcXVlc3Rpb25JZHggPSAtMTtcbiAgdmFyIGhhc2hJZHggPSAtMTtcbiAgZm9yIChpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICBjb25zdCBjb2RlID0gcmVzdC5jaGFyQ29kZUF0KGkpO1xuICAgIGlmIChjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgdGhpcy5oYXNoID0gcmVzdC5zbGljZShpKTtcbiAgICAgIGhhc2hJZHggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfSBlbHNlIGlmIChjb2RlID09PSA2MyAvKj8qLyAmJiBxdWVzdGlvbklkeCA9PT0gLTEpIHtcbiAgICAgIHF1ZXN0aW9uSWR4ID0gaTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlc3Rpb25JZHggIT09IC0xKSB7XG4gICAgaWYgKGhhc2hJZHggPT09IC0xKSB7XG4gICAgICB0aGlzLnNlYXJjaCA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHgpO1xuICAgICAgdGhpcy5xdWVyeSA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZWFyY2ggPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4LCBoYXNoSWR4KTtcbiAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSwgaGFzaElkeCk7XG4gICAgfVxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5xdWVyeSk7XG4gICAgfVxuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgdGhpcy5xdWVyeSA9IHt9O1xuICB9XG5cbiAgdmFyIGZpcnN0SWR4ID1cbiAgICBxdWVzdGlvbklkeCAhPT0gLTEgJiYgKGhhc2hJZHggPT09IC0xIHx8IHF1ZXN0aW9uSWR4IDwgaGFzaElkeCkgPyBxdWVzdGlvbklkeCA6IGhhc2hJZHg7XG4gIGlmIChmaXJzdElkeCA9PT0gLTEpIHtcbiAgICBpZiAocmVzdC5sZW5ndGggPiAwKSB7IHRoaXMucGF0aG5hbWUgPSByZXN0OyB9XG4gIH0gZWxzZSBpZiAoZmlyc3RJZHggPiAwKSB7XG4gICAgdGhpcy5wYXRobmFtZSA9IHJlc3Quc2xpY2UoMCwgZmlyc3RJZHgpO1xuICB9XG4gIGlmIChzbGFzaGVkUHJvdG9jb2xbbG93ZXJQcm90b10gJiYgdGhpcy5ob3N0bmFtZSAmJiAhdGhpcy5wYXRobmFtZSkge1xuICAgIHRoaXMucGF0aG5hbWUgPSAnLyc7XG4gIH1cblxuICAvLyB0byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICBpZiAodGhpcy5wYXRobmFtZSB8fCB0aGlzLnNlYXJjaCkge1xuICAgIGNvbnN0IHAgPSB0aGlzLnBhdGhuYW1lIHx8ICcnO1xuICAgIGNvbnN0IHMgPSB0aGlzLnNlYXJjaCB8fCAnJztcbiAgICB0aGlzLnBhdGggPSBwICsgcztcbiAgfVxuXG4gIC8vIGZpbmFsbHksIHJlY29uc3RydWN0IHRoZSBocmVmIGJhc2VkIG9uIHdoYXQgaGFzIGJlZW4gdmFsaWRhdGVkLlxuICB0aGlzLmhyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB2YWxpZGF0ZUhvc3RuYW1lKHNlbGYsIHJlc3QsIGhvc3RuYW1lKSB7XG4gIGZvciAodmFyIGkgPSAwLCBsYXN0UG9zOyBpIDw9IGhvc3RuYW1lLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGNvZGU7XG4gICAgaWYgKGkgPCBob3N0bmFtZS5sZW5ndGgpIHsgY29kZSA9IGhvc3RuYW1lLmNoYXJDb2RlQXQoaSk7IH1cbiAgICBpZiAoY29kZSA9PT0gNDYgLyouKi8gfHwgaSA9PT0gaG9zdG5hbWUubGVuZ3RoKSB7XG4gICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7XG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDYzKSB7XG4gICAgICAgICAgc2VsZi5ob3N0bmFtZSA9IGhvc3RuYW1lLnNsaWNlKDAsIGxhc3RQb3MgKyA2Myk7XG4gICAgICAgICAgcmV0dXJuICcvJyArIGhvc3RuYW1lLnNsaWNlKGxhc3RQb3MgKyA2MykgKyByZXN0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgKGNvZGUgPj0gNDggLyowKi8gJiYgY29kZSA8PSA1NykgLyo5Ki8gfHxcbiAgICAgIChjb2RlID49IDk3IC8qYSovICYmIGNvZGUgPD0gMTIyKSAvKnoqLyB8fFxuICAgICAgY29kZSA9PT0gNDUgLyotKi8gfHxcbiAgICAgIChjb2RlID49IDY1IC8qQSovICYmIGNvZGUgPD0gOTApIC8qWiovIHx8XG4gICAgICBjb2RlID09PSA0MyAvKisqLyB8fFxuICAgICAgY29kZSA9PT0gOTUgLypfKi8gfHxcbiAgICAgIC8qIEJFR0lOIE1PTkdPIFVSSSBQQVRDSCAqL1xuICAgICAgY29kZSA9PT0gNDQgLyosKi8gfHxcbiAgICAgIGNvZGUgPT09IDU4IC8qOiovIHx8XG4gICAgICAvKiBFTkQgTU9OR08gVVJJIFBBVENIICovXG4gICAgICBjb2RlID4gMTI3XG4gICAgKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gSW52YWxpZCBob3N0IGNoYXJhY3RlclxuICAgIHNlbGYuaG9zdG5hbWUgPSBob3N0bmFtZS5zbGljZSgwLCBpKTtcbiAgICBpZiAoaSA8IGhvc3RuYW1lLmxlbmd0aCkgeyByZXR1cm4gJy8nICsgaG9zdG5hbWUuc2xpY2UoaSkgKyByZXN0OyB9XG4gICAgYnJlYWs7XG4gIH1cbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIGF1dG9Fc2NhcGVTdHIocmVzdCkge1xuICB2YXIgbmV3UmVzdCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgIC8vIEF1dG9tYXRpY2FsbHkgZXNjYXBlIGFsbCBkZWxpbWl0ZXJzIGFuZCB1bndpc2UgY2hhcmFjdGVycyBmcm9tIFJGQyAyMzk2XG4gICAgLy8gQWxzbyBlc2NhcGUgc2luZ2xlIHF1b3RlcyBpbiBjYXNlIG9mIGFuIFhTUyBhdHRhY2tcbiAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgY2FzZSA5OiAvLyAnXFx0J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclMDknO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMDogLy8gJ1xcbidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTBBJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTM6IC8vICdcXHInXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpOyB9XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwRCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDMyOiAvLyAnICdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTIwJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzQ6IC8vICdcIidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTIyJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzk6IC8vICdcXCcnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpOyB9XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyNyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYwOiAvLyAnPCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTNDJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjI6IC8vICc+J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclM0UnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5MjogLy8gJ1xcXFwnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpOyB9XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU1Qyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDk0OiAvLyAnXidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTVFJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgOTY6IC8vICdgJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclNjAnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjM6IC8vICd7J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclN0InO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjQ6IC8vICd8J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclN0MnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjU6IC8vICd9J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclN0QnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAobGFzdFBvcyA9PT0gMCkgeyByZXR1cm47IH1cbiAgaWYgKGxhc3RQb3MgPCByZXN0Lmxlbmd0aCkgeyByZXR1cm4gbmV3UmVzdCArIHJlc3Quc2xpY2UobGFzdFBvcyk7IH1cbiAgZWxzZSB7IHJldHVybiBuZXdSZXN0OyB9XG59XG5cbi8vIGZvcm1hdCBhIHBhcnNlZCBvYmplY3QgaW50byBhIHVybCBzdHJpbmdcbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxGb3JtYXQob2JqKSB7XG4gIC8vIGVuc3VyZSBpdCdzIGFuIG9iamVjdCwgYW5kIG5vdCBhIHN0cmluZyB1cmwuXG4gIC8vIElmIGl0J3MgYW4gb2JqLCB0aGlzIGlzIGEgbm8tb3AuXG4gIC8vIHRoaXMgd2F5LCB5b3UgY2FuIGNhbGwgdXJsX2Zvcm1hdCgpIG9uIHN0cmluZ3NcbiAgLy8gdG8gY2xlYW4gdXAgcG90ZW50aWFsbHkgd29ua3kgdXJscy5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdzdHJpbmcnKSB7IG9iaiA9IHVybFBhcnNlKG9iaik7IH1cbiAgZWxzZSBpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgfHwgb2JqID09PSBudWxsKVxuICB7IHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgJ1BhcmFtZXRlciBcInVybE9ialwiIG11c3QgYmUgYW4gb2JqZWN0LCBub3QgJyArIChvYmogPT09IG51bGwgPyAnbnVsbCcgOiB0eXBlb2Ygb2JqKVxuICApOyB9XG4gIGVsc2UgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkgeyByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopOyB9XG5cbiAgcmV0dXJuIG9iai5mb3JtYXQoKTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUuZm9ybWF0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXV0aCA9IHRoaXMuYXV0aCB8fCAnJztcbiAgaWYgKGF1dGgpIHtcbiAgICBhdXRoID0gZW5jb2RlQXV0aChhdXRoKTtcbiAgICBhdXRoICs9ICdAJztcbiAgfVxuXG4gIHZhciBwcm90b2NvbCA9IHRoaXMucHJvdG9jb2wgfHwgJyc7XG4gIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgJyc7XG4gIHZhciBoYXNoID0gdGhpcy5oYXNoIHx8ICcnO1xuICB2YXIgaG9zdCA9IGZhbHNlO1xuICB2YXIgcXVlcnkgPSAnJztcblxuICBpZiAodGhpcy5ob3N0KSB7XG4gICAgaG9zdCA9IGF1dGggKyB0aGlzLmhvc3Q7XG4gIH0gZWxzZSBpZiAodGhpcy5ob3N0bmFtZSkge1xuICAgIGhvc3QgPSBhdXRoICsgKHRoaXMuaG9zdG5hbWUuaW5kZXhPZignOicpID09PSAtMSA/IHRoaXMuaG9zdG5hbWUgOiAnWycgKyB0aGlzLmhvc3RuYW1lICsgJ10nKTtcbiAgICBpZiAodGhpcy5wb3J0KSB7XG4gICAgICBob3N0ICs9ICc6JyArIHRoaXMucG9ydDtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSAhPT0gbnVsbCAmJiB0eXBlb2YgdGhpcy5xdWVyeSA9PT0gJ29iamVjdCcpXG4gIHsgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkodGhpcy5xdWVyeSk7IH1cblxuICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgKHF1ZXJ5ICYmICc/JyArIHF1ZXJ5KSB8fCAnJztcblxuICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wuY2hhckNvZGVBdChwcm90b2NvbC5sZW5ndGggLSAxKSAhPT0gNTggLyo6Ki8pIHsgcHJvdG9jb2wgKz0gJzonOyB9XG5cbiAgdmFyIG5ld1BhdGhuYW1lID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXRobmFtZS5sZW5ndGg7ICsraSkge1xuICAgIHN3aXRjaCAocGF0aG5hbWUuY2hhckNvZGVBdChpKSkge1xuICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgbmV3UGF0aG5hbWUgKz0gcGF0aG5hbWUuc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UGF0aG5hbWUgKz0gJyUyMyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYzOiAvLyAnPydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdQYXRobmFtZSArPSBwYXRobmFtZS5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdQYXRobmFtZSArPSAnJTNGJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKGxhc3RQb3MgPiAwKSB7XG4gICAgaWYgKGxhc3RQb3MgIT09IHBhdGhuYW1lLmxlbmd0aCkgeyBwYXRobmFtZSA9IG5ld1BhdGhuYW1lICsgcGF0aG5hbWUuc2xpY2UobGFzdFBvcyk7IH1cbiAgICBlbHNlIHsgcGF0aG5hbWUgPSBuZXdQYXRobmFtZTsgfVxuICB9XG5cbiAgLy8gb25seSB0aGUgc2xhc2hlZFByb3RvY29scyBnZXQgdGhlIC8vLiAgTm90IG1haWx0bzosIHhtcHA6LCBldGMuXG4gIC8vIHVubGVzcyB0aGV5IGhhZCB0aGVtIHRvIGJlZ2luIHdpdGguXG4gIGlmICh0aGlzLnNsYXNoZXMgfHwgKCghcHJvdG9jb2wgfHwgc2xhc2hlZFByb3RvY29sW3Byb3RvY29sXSkgJiYgaG9zdCAhPT0gZmFsc2UpKSB7XG4gICAgaG9zdCA9ICcvLycgKyAoaG9zdCB8fCAnJyk7XG4gICAgaWYgKHBhdGhuYW1lICYmIHBhdGhuYW1lLmNoYXJDb2RlQXQoMCkgIT09IDQ3IC8qLyovKSB7IHBhdGhuYW1lID0gJy8nICsgcGF0aG5hbWU7IH1cbiAgfSBlbHNlIGlmICghaG9zdCkge1xuICAgIGhvc3QgPSAnJztcbiAgfVxuXG4gIHNlYXJjaCA9IHNlYXJjaC5yZXBsYWNlKCcjJywgJyUyMycpO1xuXG4gIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMzUgLyojKi8pIHsgaGFzaCA9ICcjJyArIGhhc2g7IH1cbiAgaWYgKHNlYXJjaCAmJiBzZWFyY2guY2hhckNvZGVBdCgwKSAhPT0gNjMgLyo/Ki8pIHsgc2VhcmNoID0gJz8nICsgc2VhcmNoOyB9XG5cbiAgcmV0dXJuIHByb3RvY29sICsgaG9zdCArIHBhdGhuYW1lICsgc2VhcmNoICsgaGFzaDtcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxSZXNvbHZlKHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgcmV0dXJuIHVybFBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmUocmVsYXRpdmUpO1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5yZXNvbHZlID0gZnVuY3Rpb24gKHJlbGF0aXZlKSB7XG4gIHJldHVybiB0aGlzLnJlc29sdmVPYmplY3QodXJsUGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUmVzb2x2ZU9iamVjdChzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIGlmICghc291cmNlKSB7IHJldHVybiByZWxhdGl2ZTsgfVxuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnJlc29sdmVPYmplY3QgPSBmdW5jdGlvbiAocmVsYXRpdmUpIHtcbiAgaWYgKHR5cGVvZiByZWxhdGl2ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YXIgcmVsID0gbmV3IFVybCgpO1xuICAgIHJlbC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuICAgIHJlbGF0aXZlID0gcmVsO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IG5ldyBVcmwoKTtcbiAgdmFyIHRrZXlzID0gT2JqZWN0LmtleXModGhpcyk7XG4gIGZvciAodmFyIHRrID0gMDsgdGsgPCB0a2V5cy5sZW5ndGg7IHRrKyspIHtcbiAgICB2YXIgdGtleSA9IHRrZXlzW3RrXTtcbiAgICByZXN1bHRbdGtleV0gPSB0aGlzW3RrZXldO1xuICB9XG5cbiAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gIC8vIGV2ZW4gaHJlZj1cIlwiIHdpbGwgcmVtb3ZlIGl0LlxuICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZSdzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICBpZiAocmVsYXRpdmUuaHJlZiA9PT0gJycpIHtcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaHJlZnMgbGlrZSAvL2Zvby9iYXIgYWx3YXlzIGN1dCB0byB0aGUgcHJvdG9jb2wuXG4gIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgIC8vIHRha2UgZXZlcnl0aGluZyBleGNlcHQgdGhlIHByb3RvY29sIGZyb20gcmVsYXRpdmVcbiAgICB2YXIgcmtleXMgPSBPYmplY3Qua2V5cyhyZWxhdGl2ZSk7XG4gICAgZm9yICh2YXIgcmsgPSAwOyByayA8IHJrZXlzLmxlbmd0aDsgcmsrKykge1xuICAgICAgdmFyIHJrZXkgPSBya2V5c1tya107XG4gICAgICBpZiAocmtleSAhPT0gJ3Byb3RvY29sJykgeyByZXN1bHRbcmtleV0gPSByZWxhdGl2ZVtya2V5XTsgfVxuICAgIH1cblxuICAgIC8vdXJsUGFyc2UgYXBwZW5kcyB0cmFpbGluZyAvIHRvIHVybHMgbGlrZSBodHRwOi8vd3d3LmV4YW1wbGUuY29tXG4gICAgaWYgKHNsYXNoZWRQcm90b2NvbFtyZXN1bHQucHJvdG9jb2xdICYmIHJlc3VsdC5ob3N0bmFtZSAmJiAhcmVzdWx0LnBhdGhuYW1lKSB7XG4gICAgICByZXN1bHQucGF0aCA9IHJlc3VsdC5wYXRobmFtZSA9ICcvJztcbiAgICB9XG5cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKHJlbGF0aXZlLnByb3RvY29sICYmIHJlbGF0aXZlLnByb3RvY29sICE9PSByZXN1bHQucHJvdG9jb2wpIHtcbiAgICAvLyBpZiBpdCdzIGEga25vd24gdXJsIHByb3RvY29sLCB0aGVuIGNoYW5naW5nXG4gICAgLy8gdGhlIHByb3RvY29sIGRvZXMgd2VpcmQgdGhpbmdzXG4gICAgLy8gZmlyc3QsIGlmIGl0J3Mgbm90IGZpbGU6LCB0aGVuIHdlIE1VU1QgaGF2ZSBhIGhvc3QsXG4gICAgLy8gYW5kIGlmIHRoZXJlIHdhcyBhIHBhdGhcbiAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgLy8gaWYgaXQgaXMgZmlsZTosIHRoZW4gdGhlIGhvc3QgaXMgZHJvcHBlZCxcbiAgICAvLyBiZWNhdXNlIHRoYXQncyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAvLyBhbnl0aGluZyBlbHNlIGlzIGFzc3VtZWQgdG8gYmUgYWJzb2x1dGUuXG4gICAgaWYgKCFzbGFzaGVkUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdKSB7XG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJlbGF0aXZlKTtcbiAgICAgIGZvciAodmFyIHYgPSAwOyB2IDwga2V5cy5sZW5ndGg7IHYrKykge1xuICAgICAgICB2YXIgayA9IGtleXNbdl07XG4gICAgICAgIHJlc3VsdFtrXSA9IHJlbGF0aXZlW2tdO1xuICAgICAgfVxuICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHJlc3VsdC5wcm90b2NvbCA9IHJlbGF0aXZlLnByb3RvY29sO1xuICAgIGlmIChcbiAgICAgICFyZWxhdGl2ZS5ob3N0ICYmXG4gICAgICAhL15maWxlOj8kLy50ZXN0KHJlbGF0aXZlLnByb3RvY29sKSAmJlxuICAgICAgIWhvc3RsZXNzUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdXG4gICAgKSB7XG4gICAgICBjb25zdCByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8ICcnKS5zcGxpdCgnLycpO1xuICAgICAgd2hpbGUgKHJlbFBhdGgubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IHNoaWZ0ZWQgPSByZWxQYXRoLnNoaWZ0KCk7XG4gICAgICAgIGlmIChzaGlmdGVkKSB7XG4gICAgICAgICAgcmVsYXRpdmUuaG9zdCA9IHNoaWZ0ZWQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgeyByZWxhdGl2ZS5ob3N0ID0gJyc7IH1cbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdG5hbWUpIHsgcmVsYXRpdmUuaG9zdG5hbWUgPSAnJzsgfVxuICAgICAgaWYgKHJlbFBhdGhbMF0gIT09ICcnKSB7IHJlbFBhdGgudW5zaGlmdCgnJyk7IH1cbiAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHsgcmVsUGF0aC51bnNoaWZ0KCcnKTsgfVxuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKCcvJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCAnJztcbiAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICByZXN1bHQucG9ydCA9IHJlbGF0aXZlLnBvcnQ7XG4gICAgLy8gdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnBhdGhuYW1lIHx8IHJlc3VsdC5zZWFyY2gpIHtcbiAgICAgIHZhciBwID0gcmVzdWx0LnBhdGhuYW1lIHx8ICcnO1xuICAgICAgdmFyIHMgPSByZXN1bHQuc2VhcmNoIHx8ICcnO1xuICAgICAgcmVzdWx0LnBhdGggPSBwICsgcztcbiAgICB9XG4gICAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICB2YXIgaXNTb3VyY2VBYnMgPSByZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB2YXIgaXNSZWxBYnMgPSByZWxhdGl2ZS5ob3N0IHx8IChyZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJyk7XG4gIHZhciBtdXN0RW5kQWJzID0gaXNSZWxBYnMgfHwgaXNTb3VyY2VBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKTtcbiAgdmFyIHJlbW92ZUFsbERvdHMgPSBtdXN0RW5kQWJzO1xuICB2YXIgc3JjUGF0aCA9IChyZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLnNwbGl0KCcvJykpIHx8IFtdO1xuICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdCgnLycpKSB8fCBbXTtcbiAgdmFyIHBzeWNob3RpYyA9IHJlc3VsdC5wcm90b2NvbCAmJiAhc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF07XG5cbiAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAvLyBsaW5rcyBsaWtlIC4uLy4uIHNob3VsZCBiZSBhYmxlXG4gIC8vIHRvIGNyYXdsIHVwIHRvIHRoZSBob3N0bmFtZSwgYXMgd2VsbC4gIFRoaXMgaXMgc3RyYW5nZS5cbiAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgLy8gTGF0ZXIgb24sIHB1dCB0aGUgZmlyc3QgcGF0aCBwYXJ0IGludG8gdGhlIGhvc3QgZmllbGQuXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSAnJztcbiAgICByZXN1bHQucG9ydCA9IG51bGw7XG4gICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICBpZiAoc3JjUGF0aFswXSA9PT0gJycpIHsgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0OyB9XG4gICAgICBlbHNlIHsgc3JjUGF0aC51bnNoaWZ0KHJlc3VsdC5ob3N0KTsgfVxuICAgIH1cbiAgICByZXN1bHQuaG9zdCA9ICcnO1xuICAgIGlmIChyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBudWxsO1xuICAgICAgcmVsYXRpdmUucG9ydCA9IG51bGw7XG4gICAgICBpZiAocmVsYXRpdmUuaG9zdCkge1xuICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gJycpIHsgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7IH1cbiAgICAgICAgZWxzZSB7IHJlbFBhdGgudW5zaGlmdChyZWxhdGl2ZS5ob3N0KTsgfVxuICAgICAgfVxuICAgICAgcmVsYXRpdmUuaG9zdCA9IG51bGw7XG4gICAgfVxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzICYmIChyZWxQYXRoWzBdID09PSAnJyB8fCBzcmNQYXRoWzBdID09PSAnJyk7XG4gIH1cblxuICBpZiAoaXNSZWxBYnMpIHtcbiAgICAvLyBpdCdzIGFic29sdXRlLlxuICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCByZWxhdGl2ZS5ob3N0ID09PSAnJyA/IHJlbGF0aXZlLmhvc3QgOiByZXN1bHQuaG9zdDtcbiAgICByZXN1bHQuaG9zdG5hbWUgPVxuICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdG5hbWUgPT09ICcnID8gcmVsYXRpdmUuaG9zdG5hbWUgOiByZXN1bHQuaG9zdG5hbWU7XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAvLyBmYWxsIHRocm91Z2ggdG8gdGhlIGRvdC1oYW5kbGluZyBiZWxvdy5cbiAgfSBlbHNlIGlmIChyZWxQYXRoLmxlbmd0aCkge1xuICAgIC8vIGl0J3MgcmVsYXRpdmVcbiAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICBpZiAoIXNyY1BhdGgpIHsgc3JjUGF0aCA9IFtdOyB9XG4gICAgc3JjUGF0aC5wb3AoKTtcbiAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgfSBlbHNlIGlmIChyZWxhdGl2ZS5zZWFyY2ggIT09IG51bGwgJiYgcmVsYXRpdmUuc2VhcmNoICE9PSB1bmRlZmluZWQpIHtcbiAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgLy8gbGlrZSBocmVmPSc/Zm9vJy5cbiAgICAvLyBQdXQgdGhpcyBhZnRlciB0aGUgb3RoZXIgdHdvIGNhc2VzIGJlY2F1c2UgaXQgc2ltcGxpZmllcyB0aGUgYm9vbGVhbnNcbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGguc2hpZnQoKTtcbiAgICAgIC8vb2NjYXNpb25hbGx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgICAvL3RoaXMgZXNwZWNpYWxseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICBjb25zdCBhdXRoSW5Ib3N0ID1cbiAgICAgICAgcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZignQCcpID4gMCA/IHJlc3VsdC5ob3N0LnNwbGl0KCdAJykgOiBmYWxzZTtcbiAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICAvL3RvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5wYXRobmFtZSAhPT0gbnVsbCB8fCByZXN1bHQuc2VhcmNoICE9PSBudWxsKSB7XG4gICAgICByZXN1bHQucGF0aCA9IChyZXN1bHQucGF0aG5hbWUgPyByZXN1bHQucGF0aG5hbWUgOiAnJykgKyAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiAnJyk7XG4gICAgfVxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgLy8gbm8gcGF0aCBhdCBhbGwuICBlYXN5LlxuICAgIC8vIHdlJ3ZlIGFscmVhZHkgaGFuZGxlZCB0aGUgb3RoZXIgc3R1ZmYgYWJvdmUuXG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAvL3RvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5zZWFyY2gpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gJy8nICsgcmVzdWx0LnNlYXJjaDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnBhdGggPSBudWxsO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaWYgYSB1cmwgRU5EcyBpbiAuIG9yIC4uLCB0aGVuIGl0IG11c3QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIC8vIGhvd2V2ZXIsIGlmIGl0IGVuZHMgaW4gYW55dGhpbmcgZWxzZSBub24tc2xhc2h5LFxuICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICB2YXIgbGFzdCA9IHNyY1BhdGguc2xpY2UoLTEpWzBdO1xuICB2YXIgaGFzVHJhaWxpbmdTbGFzaCA9XG4gICAgKChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0IHx8IHNyY1BhdGgubGVuZ3RoID4gMSkgJiYgKGxhc3QgPT09ICcuJyB8fCBsYXN0ID09PSAnLi4nKSkgfHxcbiAgICBsYXN0ID09PSAnJztcblxuICAvLyBzdHJpcCBzaW5nbGUgZG90cywgcmVzb2x2ZSBkb3VibGUgZG90cyB0byBwYXJlbnQgZGlyXG4gIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gIHZhciB1cCA9IDA7XG4gIGZvciAodmFyIGkgPSBzcmNQYXRoLmxlbmd0aDsgaSA+PSAwOyBpLS0pIHtcbiAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBzcGxpY2VPbmUoc3JjUGF0aCwgaSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBzcGxpY2VPbmUoc3JjUGF0aCwgaSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHNwbGljZU9uZShzcmNQYXRoLCBpKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoIW11c3RFbmRBYnMgJiYgIXJlbW92ZUFsbERvdHMpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHNyY1BhdGgudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSAnJyAmJiAoIXNyY1BhdGhbMF0gfHwgc3JjUGF0aFswXS5jaGFyQXQoMCkgIT09ICcvJykpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKGhhc1RyYWlsaW5nU2xhc2ggJiYgc3JjUGF0aC5qb2luKCcvJykuc3Vic3RyKC0xKSAhPT0gJy8nKSB7XG4gICAgc3JjUGF0aC5wdXNoKCcnKTtcbiAgfVxuXG4gIHZhciBpc0Fic29sdXRlID0gc3JjUGF0aFswXSA9PT0gJycgfHwgKHNyY1BhdGhbMF0gJiYgc3JjUGF0aFswXS5jaGFyQXQoMCkgPT09ICcvJyk7XG5cbiAgLy8gcHV0IHRoZSBob3N0IGJhY2tcbiAgaWYgKHBzeWNob3RpYykge1xuICAgIGlmIChpc0Fic29sdXRlKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9ICcnO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogJyc7XG4gICAgfVxuICAgIC8vb2NjYXNpb25hbGx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgLy90aGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgLy91cmwucmVzb2x2ZU9iamVjdCgnbWFpbHRvOmxvY2FsMUBkb21haW4xJywgJ2xvY2FsMkBkb21haW4yJylcbiAgICBjb25zdCBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZignQCcpID4gMCA/IHJlc3VsdC5ob3N0LnNwbGl0KCdAJykgOiBmYWxzZTtcbiAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICB9XG4gIH1cblxuICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyB8fCAocmVzdWx0Lmhvc3QgJiYgc3JjUGF0aC5sZW5ndGgpO1xuXG4gIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgfSBlbHNlIHtcbiAgICByZXN1bHQucGF0aG5hbWUgPSBzcmNQYXRoLmpvaW4oJy8nKTtcbiAgfVxuXG4gIC8vdG8gc3VwcG9ydCByZXF1ZXN0Lmh0dHBcbiAgaWYgKHJlc3VsdC5wYXRobmFtZSAhPT0gbnVsbCB8fCByZXN1bHQuc2VhcmNoICE9PSBudWxsKSB7XG4gICAgcmVzdWx0LnBhdGggPSAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICsgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICB9XG4gIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnBhcnNlSG9zdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGhvc3QgPSB0aGlzLmhvc3Q7XG4gIHZhciBwb3J0ID0gcG9ydFBhdHRlcm4uZXhlYyhob3N0KTtcbiAgaWYgKHBvcnQpIHtcbiAgICBwb3J0ID0gcG9ydFswXTtcbiAgICBpZiAocG9ydCAhPT0gJzonKSB7XG4gICAgICB0aGlzLnBvcnQgPSBwb3J0LnNsaWNlKDEpO1xuICAgIH1cbiAgICBob3N0ID0gaG9zdC5zbGljZSgwLCBob3N0Lmxlbmd0aCAtIHBvcnQubGVuZ3RoKTtcbiAgfVxuICBpZiAoaG9zdCkgeyB0aGlzLmhvc3RuYW1lID0gaG9zdDsgfVxufTtcblxuLy8gQWJvdXQgMS41eCBmYXN0ZXIgdGhhbiB0aGUgdHdvLWFyZyB2ZXJzaW9uIG9mIEFycmF5I3NwbGljZSgpLlxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHNwbGljZU9uZShsaXN0LCBpbmRleCkge1xuICBmb3IgKHZhciBpID0gaW5kZXgsIGsgPSBpICsgMSwgbiA9IGxpc3QubGVuZ3RoOyBrIDwgbjsgaSArPSAxLCBrICs9IDEpIHsgbGlzdFtpXSA9IGxpc3Rba107IH1cbiAgbGlzdC5wb3AoKTtcbn1cblxudmFyIGhleFRhYmxlID0gbmV3IEFycmF5KDI1Nik7XG5mb3IgKHZhciBpID0gMDsgaSA8IDI1NjsgKytpKVxueyBoZXhUYWJsZVtpXSA9ICclJyArICgoaSA8IDE2ID8gJzAnIDogJycpICsgaS50b1N0cmluZygxNikpLnRvVXBwZXJDYXNlKCk7IH1cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBlbmNvZGVBdXRoKHN0cikge1xuICAvLyBmYXN0ZXIgZW5jb2RlVVJJQ29tcG9uZW50IGFsdGVybmF0aXZlIGZvciBlbmNvZGluZyBhdXRoIHVyaSBjb21wb25lbnRzXG4gIHZhciBvdXQgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7ICsraSkge1xuICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAvLyBUaGVzZSBjaGFyYWN0ZXJzIGRvIG5vdCBuZWVkIGVzY2FwaW5nOlxuICAgIC8vICEgLSAuIF8gflxuICAgIC8vICcgKCApICogOlxuICAgIC8vIGRpZ2l0c1xuICAgIC8vIGFscGhhICh1cHBlcmNhc2UpXG4gICAgLy8gYWxwaGEgKGxvd2VyY2FzZSlcbiAgICBpZiAoXG4gICAgICBjID09PSAweDIxIHx8XG4gICAgICBjID09PSAweDJkIHx8XG4gICAgICBjID09PSAweDJlIHx8XG4gICAgICBjID09PSAweDVmIHx8XG4gICAgICBjID09PSAweDdlIHx8XG4gICAgICAoYyA+PSAweDI3ICYmIGMgPD0gMHgyYSkgfHxcbiAgICAgIChjID49IDB4MzAgJiYgYyA8PSAweDNhKSB8fFxuICAgICAgKGMgPj0gMHg0MSAmJiBjIDw9IDB4NWEpIHx8XG4gICAgICAoYyA+PSAweDYxICYmIGMgPD0gMHg3YSlcbiAgICApIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgb3V0ICs9IHN0ci5zbGljZShsYXN0UG9zLCBpKTsgfVxuXG4gICAgbGFzdFBvcyA9IGkgKyAxO1xuXG4gICAgLy8gT3RoZXIgQVNDSUkgY2hhcmFjdGVyc1xuICAgIGlmIChjIDwgMHg4MCkge1xuICAgICAgb3V0ICs9IGhleFRhYmxlW2NdO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gTXVsdGktYnl0ZSBjaGFyYWN0ZXJzIC4uLlxuICAgIGlmIChjIDwgMHg4MDApIHtcbiAgICAgIG91dCArPSBoZXhUYWJsZVsweGMwIHwgKGMgPj4gNildICsgaGV4VGFibGVbMHg4MCB8IChjICYgMHgzZildO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChjIDwgMHhkODAwIHx8IGMgPj0gMHhlMDAwKSB7XG4gICAgICBvdXQgKz1cbiAgICAgICAgaGV4VGFibGVbMHhlMCB8IChjID4+IDEyKV0gK1xuICAgICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDYpICYgMHgzZildICtcbiAgICAgICAgaGV4VGFibGVbMHg4MCB8IChjICYgMHgzZildO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIFN1cnJvZ2F0ZSBwYWlyXG4gICAgKytpO1xuICAgIHZhciBjMjtcbiAgICBpZiAoaSA8IHN0ci5sZW5ndGgpIHsgYzIgPSBzdHIuY2hhckNvZGVBdChpKSAmIDB4M2ZmOyB9XG4gICAgZWxzZSB7IGMyID0gMDsgfVxuICAgIGMgPSAweDEwMDAwICsgKCgoYyAmIDB4M2ZmKSA8PCAxMCkgfCBjMik7XG4gICAgb3V0ICs9XG4gICAgICBoZXhUYWJsZVsweGYwIHwgKGMgPj4gMTgpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDEyKSAmIDB4M2YpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDYpICYgMHgzZildICtcbiAgICAgIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgfVxuICBpZiAobGFzdFBvcyA9PT0gMCkgeyByZXR1cm4gc3RyOyB9XG4gIGlmIChsYXN0UG9zIDwgc3RyLmxlbmd0aCkgeyByZXR1cm4gb3V0ICsgc3RyLnNsaWNlKGxhc3RQb3MpOyB9XG4gIHJldHVybiBvdXQ7XG59XG4iXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLFlBQVk7O0FBRVosSUFBQUEsU0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQTRDLFNBQUFELHVCQUFBRSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBRTVDRyxPQUFPLENBQUNDLEtBQUssR0FBR0MsUUFBUTtBQUN4QkYsT0FBTyxDQUFDRyxPQUFPLEdBQUdDLFVBQVU7QUFDNUJKLE9BQU8sQ0FBQ0ssYUFBYSxHQUFHQyxnQkFBZ0I7QUFDeENOLE9BQU8sQ0FBQ08sTUFBTSxHQUFHQyxTQUFTO0FBRTFCUixPQUFPLENBQUNTLEdBQUcsR0FBR0EsR0FBRztBQUVqQixTQUFTQSxHQUFHQSxDQUFBLEVBQUc7RUFDYixJQUFJLENBQUNDLFFBQVEsR0FBRyxJQUFJO0VBQ3BCLElBQUksQ0FBQ0MsT0FBTyxHQUFHLElBQUk7RUFDbkIsSUFBSSxDQUFDQyxJQUFJLEdBQUcsSUFBSTtFQUNoQixJQUFJLENBQUNDLElBQUksR0FBRyxJQUFJO0VBQ2hCLElBQUksQ0FBQ0MsSUFBSSxHQUFHLElBQUk7RUFDaEIsSUFBSSxDQUFDQyxRQUFRLEdBQUcsSUFBSTtFQUNwQixJQUFJLENBQUNDLElBQUksR0FBRyxJQUFJO0VBQ2hCLElBQUksQ0FBQ0MsTUFBTSxHQUFHLElBQUk7RUFDbEIsSUFBSSxDQUFDQyxLQUFLLEdBQUcsSUFBSTtFQUNqQixJQUFJLENBQUNDLFFBQVEsR0FBRyxJQUFJO0VBQ3BCLElBQUksQ0FBQ0MsSUFBSSxHQUFHLElBQUk7RUFDaEIsSUFBSSxDQUFDQyxJQUFJLEdBQUcsSUFBSTtBQUNsQjs7QUFFQTs7QUFFQTtBQUNBO0FBQ0EsTUFBTUMsZUFBZSxHQUFHLG1CQUFtQjtBQUMzQyxNQUFNQyxXQUFXLEdBQUcsVUFBVTs7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