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
    throw new TypeError('Parameter "urlObj" must be an object, not ' + obj === null ? 'null' : typeof obj);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcHVueWNvZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImV4cG9ydHMiLCJwYXJzZSIsInVybFBhcnNlIiwicmVzb2x2ZSIsInVybFJlc29sdmUiLCJyZXNvbHZlT2JqZWN0IiwidXJsUmVzb2x2ZU9iamVjdCIsImZvcm1hdCIsInVybEZvcm1hdCIsIlVybCIsInByb3RvY29sIiwic2xhc2hlcyIsImF1dGgiLCJob3N0IiwicG9ydCIsImhvc3RuYW1lIiwiaGFzaCIsInNlYXJjaCIsInF1ZXJ5IiwicGF0aG5hbWUiLCJwYXRoIiwiaHJlZiIsInByb3RvY29sUGF0dGVybiIsInBvcnRQYXR0ZXJuIiwic2ltcGxlUGF0aFBhdHRlcm4iLCJ1bnNhZmVQcm90b2NvbCIsImphdmFzY3JpcHQiLCJob3N0bGVzc1Byb3RvY29sIiwic2xhc2hlZFByb3RvY29sIiwiaHR0cCIsImh0dHBzIiwiZnRwIiwiZ29waGVyIiwiZmlsZSIsInF1ZXJ5c3RyaW5nIiwidXJsIiwicGFyc2VRdWVyeVN0cmluZyIsInNsYXNoZXNEZW5vdGVIb3N0IiwidSIsInByb3RvdHlwZSIsIlR5cGVFcnJvciIsImhhc0hhc2giLCJzdGFydCIsImVuZCIsInJlc3QiLCJsYXN0UG9zIiwiaSIsImluV3MiLCJzcGxpdCIsImxlbmd0aCIsImNvZGUiLCJjaGFyQ29kZUF0IiwiaXNXcyIsInNsaWNlIiwic2ltcGxlUGF0aCIsImV4ZWMiLCJwcm90byIsImxvd2VyUHJvdG8iLCJ0b0xvd2VyQ2FzZSIsInRlc3QiLCJob3N0RW5kIiwiYXRTaWduIiwibm9uSG9zdCIsImRlY29kZVVSSUNvbXBvbmVudCIsInBhcnNlSG9zdCIsImlwdjZIb3N0bmFtZSIsInJlc3VsdCIsInZhbGlkYXRlSG9zdG5hbWUiLCJ1bmRlZmluZWQiLCJwdW55Y29kZSIsInRvQVNDSUkiLCJwIiwiaCIsImF1dG9Fc2NhcGVTdHIiLCJxdWVzdGlvbklkeCIsImhhc2hJZHgiLCJmaXJzdElkeCIsInMiLCJzZWxmIiwibmV3UmVzdCIsIm9iaiIsImNhbGwiLCJlbmNvZGVBdXRoIiwiaW5kZXhPZiIsInN0cmluZ2lmeSIsIm5ld1BhdGhuYW1lIiwicmVwbGFjZSIsInNvdXJjZSIsInJlbGF0aXZlIiwicmVsIiwidGtleXMiLCJPYmplY3QiLCJrZXlzIiwidGsiLCJ0a2V5IiwicmtleXMiLCJyayIsInJrZXkiLCJ2IiwiayIsInJlbFBhdGgiLCJzaGlmdGVkIiwic2hpZnQiLCJ1bnNoaWZ0Iiwiam9pbiIsImlzU291cmNlQWJzIiwiY2hhckF0IiwiaXNSZWxBYnMiLCJtdXN0RW5kQWJzIiwicmVtb3ZlQWxsRG90cyIsInNyY1BhdGgiLCJwc3ljaG90aWMiLCJwb3AiLCJjb25jYXQiLCJhdXRoSW5Ib3N0IiwibGFzdCIsImhhc1RyYWlsaW5nU2xhc2giLCJ1cCIsInNwbGljZU9uZSIsInN1YnN0ciIsInB1c2giLCJpc0Fic29sdXRlIiwibGlzdCIsImluZGV4IiwibiIsImhleFRhYmxlIiwiQXJyYXkiLCJ0b1N0cmluZyIsInRvVXBwZXJDYXNlIiwic3RyIiwib3V0IiwiYyIsImMyIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL3ZlbmRvci9tb25nb2RiVXJsLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBBIHNsaWdodGx5IHBhdGNoZWQgdmVyc2lvbiBvZiBub2RlJ3MgVVJMIG1vZHVsZSwgd2l0aCBzdXBwb3J0IGZvciBgbW9uZ29kYjovL2AgVVJJcy5cbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUgZm9yIGxpY2Vuc2luZyBpbmZvcm1hdGlvbi5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCBwdW55Y29kZSBmcm9tICdwdW55Y29kZS9wdW55Y29kZS5qcyc7XG5cbmV4cG9ydHMucGFyc2UgPSB1cmxQYXJzZTtcbmV4cG9ydHMucmVzb2x2ZSA9IHVybFJlc29sdmU7XG5leHBvcnRzLnJlc29sdmVPYmplY3QgPSB1cmxSZXNvbHZlT2JqZWN0O1xuZXhwb3J0cy5mb3JtYXQgPSB1cmxGb3JtYXQ7XG5cbmV4cG9ydHMuVXJsID0gVXJsO1xuXG5mdW5jdGlvbiBVcmwoKSB7XG4gIHRoaXMucHJvdG9jb2wgPSBudWxsO1xuICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICB0aGlzLmF1dGggPSBudWxsO1xuICB0aGlzLmhvc3QgPSBudWxsO1xuICB0aGlzLnBvcnQgPSBudWxsO1xuICB0aGlzLmhvc3RuYW1lID0gbnVsbDtcbiAgdGhpcy5oYXNoID0gbnVsbDtcbiAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICB0aGlzLnF1ZXJ5ID0gbnVsbDtcbiAgdGhpcy5wYXRobmFtZSA9IG51bGw7XG4gIHRoaXMucGF0aCA9IG51bGw7XG4gIHRoaXMuaHJlZiA9IG51bGw7XG59XG5cbi8vIFJlZmVyZW5jZTogUkZDIDM5ODYsIFJGQyAxODA4LCBSRkMgMjM5NlxuXG4vLyBkZWZpbmUgdGhlc2UgaGVyZSBzbyBhdCBsZWFzdCB0aGV5IG9ubHkgaGF2ZSB0byBiZVxuLy8gY29tcGlsZWQgb25jZSBvbiB0aGUgZmlyc3QgbW9kdWxlIGxvYWQuXG5jb25zdCBwcm90b2NvbFBhdHRlcm4gPSAvXihbYS16MC05ListXSs6KS9pO1xuY29uc3QgcG9ydFBhdHRlcm4gPSAvOlswLTldKiQvO1xuXG4vLyBTcGVjaWFsIGNhc2UgZm9yIGEgc2ltcGxlIHBhdGggVVJMXG5jb25zdCBzaW1wbGVQYXRoUGF0dGVybiA9IC9eKFxcL1xcLz8oPyFcXC8pW15cXD9cXHNdKikoXFw/W15cXHNdKik/JC87XG5cbi8vIHByb3RvY29scyB0aGF0IGNhbiBhbGxvdyBcInVuc2FmZVwiIGFuZCBcInVud2lzZVwiIGNoYXJzLlxuY29uc3QgdW5zYWZlUHJvdG9jb2wgPSB7XG4gIGphdmFzY3JpcHQ6IHRydWUsXG4gICdqYXZhc2NyaXB0Oic6IHRydWUsXG59O1xuLy8gcHJvdG9jb2xzIHRoYXQgbmV2ZXIgaGF2ZSBhIGhvc3RuYW1lLlxuY29uc3QgaG9zdGxlc3NQcm90b2NvbCA9IHtcbiAgamF2YXNjcmlwdDogdHJ1ZSxcbiAgJ2phdmFzY3JpcHQ6JzogdHJ1ZSxcbn07XG4vLyBwcm90b2NvbHMgdGhhdCBhbHdheXMgY29udGFpbiBhIC8vIGJpdC5cbmNvbnN0IHNsYXNoZWRQcm90b2NvbCA9IHtcbiAgaHR0cDogdHJ1ZSxcbiAgJ2h0dHA6JzogdHJ1ZSxcbiAgaHR0cHM6IHRydWUsXG4gICdodHRwczonOiB0cnVlLFxuICBmdHA6IHRydWUsXG4gICdmdHA6JzogdHJ1ZSxcbiAgZ29waGVyOiB0cnVlLFxuICAnZ29waGVyOic6IHRydWUsXG4gIGZpbGU6IHRydWUsXG4gICdmaWxlOic6IHRydWUsXG59O1xuY29uc3QgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpO1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICBpZiAodXJsIGluc3RhbmNlb2YgVXJsKSB7IHJldHVybiB1cmw7IH1cblxuICB2YXIgdSA9IG5ldyBVcmwoKTtcbiAgdS5wYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KTtcbiAgcmV0dXJuIHU7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24gKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignUGFyYW1ldGVyIFwidXJsXCIgbXVzdCBiZSBhIHN0cmluZywgbm90ICcgKyB0eXBlb2YgdXJsKTtcbiAgfVxuXG4gIC8vIENvcHkgY2hyb21lLCBJRSwgb3BlcmEgYmFja3NsYXNoLWhhbmRsaW5nIGJlaGF2aW9yLlxuICAvLyBCYWNrIHNsYXNoZXMgYmVmb3JlIHRoZSBxdWVyeSBzdHJpbmcgZ2V0IGNvbnZlcnRlZCB0byBmb3J3YXJkIHNsYXNoZXNcbiAgLy8gU2VlOiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MjU5MTZcbiAgdmFyIGhhc0hhc2ggPSBmYWxzZTtcbiAgdmFyIHN0YXJ0ID0gLTE7XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIHJlc3QgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICB2YXIgaSA9IDA7XG4gIGZvciAodmFyIGluV3MgPSBmYWxzZSwgc3BsaXQgPSBmYWxzZTsgaSA8IHVybC5sZW5ndGg7ICsraSkge1xuICAgIGNvbnN0IGNvZGUgPSB1cmwuY2hhckNvZGVBdChpKTtcblxuICAgIC8vIEZpbmQgZmlyc3QgYW5kIGxhc3Qgbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVycyBmb3IgdHJpbW1pbmdcbiAgICBjb25zdCBpc1dzID1cbiAgICAgIGNvZGUgPT09IDMyIC8qICovIHx8XG4gICAgICBjb2RlID09PSA5IC8qXFx0Ki8gfHxcbiAgICAgIGNvZGUgPT09IDEzIC8qXFxyKi8gfHxcbiAgICAgIGNvZGUgPT09IDEwIC8qXFxuKi8gfHxcbiAgICAgIGNvZGUgPT09IDEyIC8qXFxmKi8gfHxcbiAgICAgIGNvZGUgPT09IDE2MCAvKlxcdTAwQTAqLyB8fFxuICAgICAgY29kZSA9PT0gNjUyNzk7IC8qXFx1RkVGRiovXG4gICAgaWYgKHN0YXJ0ID09PSAtMSkge1xuICAgICAgaWYgKGlzV3MpIHsgY29udGludWU7IH1cbiAgICAgIGxhc3RQb3MgPSBzdGFydCA9IGk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChpbldzKSB7XG4gICAgICAgIGlmICghaXNXcykge1xuICAgICAgICAgIGVuZCA9IC0xO1xuICAgICAgICAgIGluV3MgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc1dzKSB7XG4gICAgICAgIGVuZCA9IGk7XG4gICAgICAgIGluV3MgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE9ubHkgY29udmVydCBiYWNrc2xhc2hlcyB3aGlsZSB3ZSBoYXZlbid0IHNlZW4gYSBzcGxpdCBjaGFyYWN0ZXJcbiAgICBpZiAoIXNwbGl0KSB7XG4gICAgICBzd2l0Y2ggKGNvZGUpIHtcbiAgICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgICAgIC8vIEZhbGwgdGhyb3VnaFxuICAgICAgICBjYXNlIDYzOiAvLyAnPydcbiAgICAgICAgICBzcGxpdCA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgOTI6IC8vICdcXFxcJ1xuICAgICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgICByZXN0ICs9ICcvJztcbiAgICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghaGFzSGFzaCAmJiBjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgaWYgc3RyaW5nIHdhcyBub24tZW1wdHkgKGluY2x1ZGluZyBzdHJpbmdzIHdpdGggb25seSB3aGl0ZXNwYWNlKVxuICBpZiAoc3RhcnQgIT09IC0xKSB7XG4gICAgaWYgKGxhc3RQb3MgPT09IHN0YXJ0KSB7XG4gICAgICAvLyBXZSBkaWRuJ3QgY29udmVydCBhbnkgYmFja3NsYXNoZXNcblxuICAgICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgICAgaWYgKHN0YXJ0ID09PSAwKSB7IHJlc3QgPSB1cmw7IH1cbiAgICAgICAgZWxzZSB7IHJlc3QgPSB1cmwuc2xpY2Uoc3RhcnQpOyB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN0ID0gdXJsLnNsaWNlKHN0YXJ0LCBlbmQpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZW5kID09PSAtMSAmJiBsYXN0UG9zIDwgdXJsLmxlbmd0aCkge1xuICAgICAgLy8gV2UgY29udmVydGVkIHNvbWUgYmFja3NsYXNoZXMgYW5kIGhhdmUgb25seSBwYXJ0IG9mIHRoZSBlbnRpcmUgc3RyaW5nXG4gICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zKTtcbiAgICB9IGVsc2UgaWYgKGVuZCAhPT0gLTEgJiYgbGFzdFBvcyA8IGVuZCkge1xuICAgICAgLy8gV2UgY29udmVydGVkIHNvbWUgYmFja3NsYXNoZXMgYW5kIGhhdmUgb25seSBwYXJ0IG9mIHRoZSBlbnRpcmUgc3RyaW5nXG4gICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zLCBlbmQpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghc2xhc2hlc0Rlbm90ZUhvc3QgJiYgIWhhc0hhc2gpIHtcbiAgICAvLyBUcnkgZmFzdCBwYXRoIHJlZ2V4cFxuICAgIGNvbnN0IHNpbXBsZVBhdGggPSBzaW1wbGVQYXRoUGF0dGVybi5leGVjKHJlc3QpO1xuICAgIGlmIChzaW1wbGVQYXRoKSB7XG4gICAgICB0aGlzLnBhdGggPSByZXN0O1xuICAgICAgdGhpcy5ocmVmID0gcmVzdDtcbiAgICAgIHRoaXMucGF0aG5hbWUgPSBzaW1wbGVQYXRoWzFdO1xuICAgICAgaWYgKHNpbXBsZVBhdGhbMl0pIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBzaW1wbGVQYXRoWzJdO1xuICAgICAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnNlYXJjaC5zbGljZSgxKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5xdWVyeSA9IHRoaXMuc2VhcmNoLnNsaWNlKDEpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSAnJztcbiAgICAgICAgdGhpcy5xdWVyeSA9IHt9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICB9XG5cbiAgdmFyIHByb3RvID0gcHJvdG9jb2xQYXR0ZXJuLmV4ZWMocmVzdCk7XG4gIGlmIChwcm90bykge1xuICAgIHByb3RvID0gcHJvdG9bMF07XG4gICAgdmFyIGxvd2VyUHJvdG8gPSBwcm90by50b0xvd2VyQ2FzZSgpO1xuICAgIHRoaXMucHJvdG9jb2wgPSBsb3dlclByb3RvO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKHByb3RvLmxlbmd0aCk7XG4gIH1cblxuICAvLyBmaWd1cmUgb3V0IGlmIGl0J3MgZ290IGEgaG9zdFxuICAvLyB1c2VyQHNlcnZlciBpcyAqYWx3YXlzKiBpbnRlcnByZXRlZCBhcyBhIGhvc3RuYW1lLCBhbmQgdXJsXG4gIC8vIHJlc29sdXRpb24gd2lsbCB0cmVhdCAvL2Zvby9iYXIgYXMgaG9zdD1mb28scGF0aD1iYXIgYmVjYXVzZSB0aGF0J3NcbiAgLy8gaG93IHRoZSBicm93c2VyIHJlc29sdmVzIHJlbGF0aXZlIFVSTHMuXG4gIGlmIChzbGFzaGVzRGVub3RlSG9zdCB8fCBwcm90byB8fCAvXlxcL1xcL1teQFxcL10rQFteQFxcL10rLy50ZXN0KHJlc3QpKSB7XG4gICAgdmFyIHNsYXNoZXMgPSByZXN0LmNoYXJDb2RlQXQoMCkgPT09IDQ3IC8qLyovICYmIHJlc3QuY2hhckNvZGVBdCgxKSA9PT0gNDc7IC8qLyovXG4gICAgaWYgKHNsYXNoZXMgJiYgIShwcm90byAmJiBob3N0bGVzc1Byb3RvY29sW3Byb3RvXSkpIHtcbiAgICAgIHJlc3QgPSByZXN0LnNsaWNlKDIpO1xuICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dICYmIChzbGFzaGVzIHx8IChwcm90byAmJiAhc2xhc2hlZFByb3RvY29sW3Byb3RvXSkpKSB7XG4gICAgLy8gdGhlcmUncyBhIGhvc3RuYW1lLlxuICAgIC8vIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiAvLCA/LCA7LCBvciAjIGVuZHMgdGhlIGhvc3QuXG4gICAgLy9cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBAIGluIHRoZSBob3N0bmFtZSwgdGhlbiBub24taG9zdCBjaGFycyAqYXJlKiBhbGxvd2VkXG4gICAgLy8gdG8gdGhlIGxlZnQgb2YgdGhlIGxhc3QgQCBzaWduLCB1bmxlc3Mgc29tZSBob3N0LWVuZGluZyBjaGFyYWN0ZXJcbiAgICAvLyBjb21lcyAqYmVmb3JlKiB0aGUgQC1zaWduLlxuICAgIC8vIFVSTHMgYXJlIG9ibm94aW91cy5cbiAgICAvL1xuICAgIC8vIGV4OlxuICAgIC8vIGh0dHA6Ly9hQGJAYy8gPT4gdXNlcjphQGIgaG9zdDpjXG4gICAgLy8gaHR0cDovL2FAYj9AYyA9PiB1c2VyOmEgaG9zdDpiIHBhdGg6Lz9AY1xuXG4gICAgLy8gdjAuMTIgVE9ETyhpc2FhY3MpOiBUaGlzIGlzIG5vdCBxdWl0ZSBob3cgQ2hyb21lIGRvZXMgdGhpbmdzLlxuICAgIC8vIFJldmlldyBvdXIgdGVzdCBjYXNlIGFnYWluc3QgYnJvd3NlcnMgbW9yZSBjb21wcmVoZW5zaXZlbHkuXG5cbiAgICB2YXIgaG9zdEVuZCA9IC0xO1xuICAgIHZhciBhdFNpZ24gPSAtMTtcbiAgICB2YXIgbm9uSG9zdCA9IC0xO1xuICAgIGZvciAoaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgICBjYXNlIDk6IC8vICdcXHQnXG4gICAgICAgIGNhc2UgMTA6IC8vICdcXG4nXG4gICAgICAgIGNhc2UgMTM6IC8vICdcXHInXG4gICAgICAgIGNhc2UgMzI6IC8vICcgJ1xuICAgICAgICBjYXNlIDM0OiAvLyAnXCInXG4gICAgICAgIGNhc2UgMzc6IC8vICclJ1xuICAgICAgICBjYXNlIDM5OiAvLyAnXFwnJ1xuICAgICAgICBjYXNlIDU5OiAvLyAnOydcbiAgICAgICAgY2FzZSA2MDogLy8gJzwnXG4gICAgICAgIGNhc2UgNjI6IC8vICc+J1xuICAgICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgY2FzZSA5NDogLy8gJ14nXG4gICAgICAgIGNhc2UgOTY6IC8vICdgJ1xuICAgICAgICBjYXNlIDEyMzogLy8gJ3snXG4gICAgICAgIGNhc2UgMTI0OiAvLyAnfCdcbiAgICAgICAgY2FzZSAxMjU6IC8vICd9J1xuICAgICAgICAgIC8vIENoYXJhY3RlcnMgdGhhdCBhcmUgbmV2ZXIgZXZlciBhbGxvd2VkIGluIGEgaG9zdG5hbWUgZnJvbSBSRkMgMjM5NlxuICAgICAgICAgIGlmIChub25Ib3N0ID09PSAtMSkgeyBub25Ib3N0ID0gaTsgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDM1OiAvLyAnIydcbiAgICAgICAgY2FzZSA0NzogLy8gJy8nXG4gICAgICAgIGNhc2UgNjM6IC8vICc/J1xuICAgICAgICAgIC8vIEZpbmQgdGhlIGZpcnN0IGluc3RhbmNlIG9mIGFueSBob3N0LWVuZGluZyBjaGFyYWN0ZXJzXG4gICAgICAgICAgaWYgKG5vbkhvc3QgPT09IC0xKSB7IG5vbkhvc3QgPSBpOyB9XG4gICAgICAgICAgaG9zdEVuZCA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgNjQ6IC8vICdAJ1xuICAgICAgICAgIC8vIEF0IHRoaXMgcG9pbnQsIGVpdGhlciB3ZSBoYXZlIGFuIGV4cGxpY2l0IHBvaW50IHdoZXJlIHRoZVxuICAgICAgICAgIC8vIGF1dGggcG9ydGlvbiBjYW5ub3QgZ28gcGFzdCwgb3IgdGhlIGxhc3QgQCBjaGFyIGlzIHRoZSBkZWNpZGVyLlxuICAgICAgICAgIGF0U2lnbiA9IGk7XG4gICAgICAgICAgbm9uSG9zdCA9IC0xO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKGhvc3RFbmQgIT09IC0xKSB7IGJyZWFrOyB9XG4gICAgfVxuICAgIHN0YXJ0ID0gMDtcbiAgICBpZiAoYXRTaWduICE9PSAtMSkge1xuICAgICAgdGhpcy5hdXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHJlc3Quc2xpY2UoMCwgYXRTaWduKSk7XG4gICAgICBzdGFydCA9IGF0U2lnbiArIDE7XG4gICAgfVxuICAgIGlmIChub25Ib3N0ID09PSAtMSkge1xuICAgICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZShzdGFydCk7XG4gICAgICByZXN0ID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuaG9zdCA9IHJlc3Quc2xpY2Uoc3RhcnQsIG5vbkhvc3QpO1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2Uobm9uSG9zdCk7XG4gICAgfVxuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB0aGlzLnBhcnNlSG9zdCgpO1xuXG4gICAgLy8gd2UndmUgaW5kaWNhdGVkIHRoYXQgdGhlcmUgaXMgYSBob3N0bmFtZSxcbiAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgIGlmICh0eXBlb2YgdGhpcy5ob3N0bmFtZSAhPT0gJ3N0cmluZycpIHsgdGhpcy5ob3N0bmFtZSA9ICcnOyB9XG5cbiAgICB2YXIgaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lO1xuXG4gICAgLy8gaWYgaG9zdG5hbWUgYmVnaW5zIHdpdGggWyBhbmQgZW5kcyB3aXRoIF1cbiAgICAvLyBhc3N1bWUgdGhhdCBpdCdzIGFuIElQdjYgYWRkcmVzcy5cbiAgICB2YXIgaXB2Nkhvc3RuYW1lID1cbiAgICAgIGhvc3RuYW1lLmNoYXJDb2RlQXQoMCkgPT09IDkxIC8qWyovICYmIGhvc3RuYW1lLmNoYXJDb2RlQXQoaG9zdG5hbWUubGVuZ3RoIC0gMSkgPT09IDkzOyAvKl0qL1xuXG4gICAgLy8gdmFsaWRhdGUgYSBsaXR0bGUuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlSG9zdG5hbWUodGhpcywgcmVzdCwgaG9zdG5hbWUpO1xuICAgICAgaWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSB7IHJlc3QgPSByZXN1bHQ7IH1cbiAgICB9XG5cbiAgICAvLyBob3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueWNvZGVkIHJlcHJlc2VudGF0aW9uIG9mIFwiZG9tYWluXCIuXG4gICAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgICAvLyBoYXZlIG5vbi1BU0NJSSBjaGFyYWN0ZXJzLCBpLmUuIGl0IGRvZXNuJ3QgbWF0dGVyIGlmXG4gICAgICAvLyB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQgYWxyZWFkeSBpcyBBU0NJSS1vbmx5LlxuICAgICAgdGhpcy5ob3N0bmFtZSA9IHB1bnljb2RlLnRvQVNDSUkodGhpcy5ob3N0bmFtZSk7XG4gICAgfVxuXG4gICAgdmFyIHAgPSB0aGlzLnBvcnQgPyAnOicgKyB0aGlzLnBvcnQgOiAnJztcbiAgICB2YXIgaCA9IHRoaXMuaG9zdG5hbWUgfHwgJyc7XG4gICAgdGhpcy5ob3N0ID0gaCArIHA7XG5cbiAgICAvLyBzdHJpcCBbIGFuZCBdIGZyb20gdGhlIGhvc3RuYW1lXG4gICAgLy8gdGhlIGhvc3QgZmllbGQgc3RpbGwgcmV0YWlucyB0aGVtLCB0aG91Z2hcbiAgICBpZiAoaXB2Nkhvc3RuYW1lKSB7XG4gICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS5zbGljZSgxLCAtMSk7XG4gICAgICBpZiAocmVzdFswXSAhPT0gJy8nKSB7XG4gICAgICAgIHJlc3QgPSAnLycgKyByZXN0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG5vdyByZXN0IGlzIHNldCB0byB0aGUgcG9zdC1ob3N0IHN0dWZmLlxuICAvLyBjaG9wIG9mZiBhbnkgZGVsaW0gY2hhcnMuXG4gIGlmICghdW5zYWZlUHJvdG9jb2xbbG93ZXJQcm90b10pIHtcbiAgICAvLyBGaXJzdCwgbWFrZSAxMDAlIHN1cmUgdGhhdCBhbnkgXCJhdXRvRXNjYXBlXCIgY2hhcnMgZ2V0XG4gICAgLy8gZXNjYXBlZCwgZXZlbiBpZiBlbmNvZGVVUklDb21wb25lbnQgZG9lc24ndCB0aGluayB0aGV5XG4gICAgLy8gbmVlZCB0byBiZS5cbiAgICBjb25zdCByZXN1bHQgPSBhdXRvRXNjYXBlU3RyKHJlc3QpO1xuICAgIGlmIChyZXN1bHQgIT09IHVuZGVmaW5lZCkgeyByZXN0ID0gcmVzdWx0OyB9XG4gIH1cblxuICB2YXIgcXVlc3Rpb25JZHggPSAtMTtcbiAgdmFyIGhhc2hJZHggPSAtMTtcbiAgZm9yIChpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICBjb25zdCBjb2RlID0gcmVzdC5jaGFyQ29kZUF0KGkpO1xuICAgIGlmIChjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgdGhpcy5oYXNoID0gcmVzdC5zbGljZShpKTtcbiAgICAgIGhhc2hJZHggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfSBlbHNlIGlmIChjb2RlID09PSA2MyAvKj8qLyAmJiBxdWVzdGlvbklkeCA9PT0gLTEpIHtcbiAgICAgIHF1ZXN0aW9uSWR4ID0gaTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlc3Rpb25JZHggIT09IC0xKSB7XG4gICAgaWYgKGhhc2hJZHggPT09IC0xKSB7XG4gICAgICB0aGlzLnNlYXJjaCA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHgpO1xuICAgICAgdGhpcy5xdWVyeSA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZWFyY2ggPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4LCBoYXNoSWR4KTtcbiAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSwgaGFzaElkeCk7XG4gICAgfVxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5xdWVyeSk7XG4gICAgfVxuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgdGhpcy5xdWVyeSA9IHt9O1xuICB9XG5cbiAgdmFyIGZpcnN0SWR4ID1cbiAgICBxdWVzdGlvbklkeCAhPT0gLTEgJiYgKGhhc2hJZHggPT09IC0xIHx8IHF1ZXN0aW9uSWR4IDwgaGFzaElkeCkgPyBxdWVzdGlvbklkeCA6IGhhc2hJZHg7XG4gIGlmIChmaXJzdElkeCA9PT0gLTEpIHtcbiAgICBpZiAocmVzdC5sZW5ndGggPiAwKSB7IHRoaXMucGF0aG5hbWUgPSByZXN0OyB9XG4gIH0gZWxzZSBpZiAoZmlyc3RJZHggPiAwKSB7XG4gICAgdGhpcy5wYXRobmFtZSA9IHJlc3Quc2xpY2UoMCwgZmlyc3RJZHgpO1xuICB9XG4gIGlmIChzbGFzaGVkUHJvdG9jb2xbbG93ZXJQcm90b10gJiYgdGhpcy5ob3N0bmFtZSAmJiAhdGhpcy5wYXRobmFtZSkge1xuICAgIHRoaXMucGF0aG5hbWUgPSAnLyc7XG4gIH1cblxuICAvLyB0byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICBpZiAodGhpcy5wYXRobmFtZSB8fCB0aGlzLnNlYXJjaCkge1xuICAgIGNvbnN0IHAgPSB0aGlzLnBhdGhuYW1lIHx8ICcnO1xuICAgIGNvbnN0IHMgPSB0aGlzLnNlYXJjaCB8fCAnJztcbiAgICB0aGlzLnBhdGggPSBwICsgcztcbiAgfVxuXG4gIC8vIGZpbmFsbHksIHJlY29uc3RydWN0IHRoZSBocmVmIGJhc2VkIG9uIHdoYXQgaGFzIGJlZW4gdmFsaWRhdGVkLlxuICB0aGlzLmhyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB2YWxpZGF0ZUhvc3RuYW1lKHNlbGYsIHJlc3QsIGhvc3RuYW1lKSB7XG4gIGZvciAodmFyIGkgPSAwLCBsYXN0UG9zOyBpIDw9IGhvc3RuYW1lLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGNvZGU7XG4gICAgaWYgKGkgPCBob3N0bmFtZS5sZW5ndGgpIHsgY29kZSA9IGhvc3RuYW1lLmNoYXJDb2RlQXQoaSk7IH1cbiAgICBpZiAoY29kZSA9PT0gNDYgLyouKi8gfHwgaSA9PT0gaG9zdG5hbWUubGVuZ3RoKSB7XG4gICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7XG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDYzKSB7XG4gICAgICAgICAgc2VsZi5ob3N0bmFtZSA9IGhvc3RuYW1lLnNsaWNlKDAsIGxhc3RQb3MgKyA2Myk7XG4gICAgICAgICAgcmV0dXJuICcvJyArIGhvc3RuYW1lLnNsaWNlKGxhc3RQb3MgKyA2MykgKyByZXN0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgKGNvZGUgPj0gNDggLyowKi8gJiYgY29kZSA8PSA1NykgLyo5Ki8gfHxcbiAgICAgIChjb2RlID49IDk3IC8qYSovICYmIGNvZGUgPD0gMTIyKSAvKnoqLyB8fFxuICAgICAgY29kZSA9PT0gNDUgLyotKi8gfHxcbiAgICAgIChjb2RlID49IDY1IC8qQSovICYmIGNvZGUgPD0gOTApIC8qWiovIHx8XG4gICAgICBjb2RlID09PSA0MyAvKisqLyB8fFxuICAgICAgY29kZSA9PT0gOTUgLypfKi8gfHxcbiAgICAgIC8qIEJFR0lOIE1PTkdPIFVSSSBQQVRDSCAqL1xuICAgICAgY29kZSA9PT0gNDQgLyosKi8gfHxcbiAgICAgIGNvZGUgPT09IDU4IC8qOiovIHx8XG4gICAgICAvKiBFTkQgTU9OR08gVVJJIFBBVENIICovXG4gICAgICBjb2RlID4gMTI3XG4gICAgKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gSW52YWxpZCBob3N0IGNoYXJhY3RlclxuICAgIHNlbGYuaG9zdG5hbWUgPSBob3N0bmFtZS5zbGljZSgwLCBpKTtcbiAgICBpZiAoaSA8IGhvc3RuYW1lLmxlbmd0aCkgeyByZXR1cm4gJy8nICsgaG9zdG5hbWUuc2xpY2UoaSkgKyByZXN0OyB9XG4gICAgYnJlYWs7XG4gIH1cbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIGF1dG9Fc2NhcGVTdHIocmVzdCkge1xuICB2YXIgbmV3UmVzdCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgIC8vIEF1dG9tYXRpY2FsbHkgZXNjYXBlIGFsbCBkZWxpbWl0ZXJzIGFuZCB1bndpc2UgY2hhcmFjdGVycyBmcm9tIFJGQyAyMzk2XG4gICAgLy8gQWxzbyBlc2NhcGUgc2luZ2xlIHF1b3RlcyBpbiBjYXNlIG9mIGFuIFhTUyBhdHRhY2tcbiAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgY2FzZSA5OiAvLyAnXFx0J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclMDknO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMDogLy8gJ1xcbidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTBBJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTM6IC8vICdcXHInXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpOyB9XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwRCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDMyOiAvLyAnICdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTIwJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzQ6IC8vICdcIidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTIyJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzk6IC8vICdcXCcnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpOyB9XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyNyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYwOiAvLyAnPCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTNDJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjI6IC8vICc+J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclM0UnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5MjogLy8gJ1xcXFwnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpOyB9XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU1Qyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDk0OiAvLyAnXidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgeyBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UmVzdCArPSAnJTVFJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgOTY6IC8vICdgJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclNjAnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjM6IC8vICd7J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclN0InO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjQ6IC8vICd8J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclN0MnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjU6IC8vICd9J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTsgfVxuICAgICAgICBuZXdSZXN0ICs9ICclN0QnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAobGFzdFBvcyA9PT0gMCkgeyByZXR1cm47IH1cbiAgaWYgKGxhc3RQb3MgPCByZXN0Lmxlbmd0aCkgeyByZXR1cm4gbmV3UmVzdCArIHJlc3Quc2xpY2UobGFzdFBvcyk7IH1cbiAgZWxzZSB7IHJldHVybiBuZXdSZXN0OyB9XG59XG5cbi8vIGZvcm1hdCBhIHBhcnNlZCBvYmplY3QgaW50byBhIHVybCBzdHJpbmdcbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxGb3JtYXQob2JqKSB7XG4gIC8vIGVuc3VyZSBpdCdzIGFuIG9iamVjdCwgYW5kIG5vdCBhIHN0cmluZyB1cmwuXG4gIC8vIElmIGl0J3MgYW4gb2JqLCB0aGlzIGlzIGEgbm8tb3AuXG4gIC8vIHRoaXMgd2F5LCB5b3UgY2FuIGNhbGwgdXJsX2Zvcm1hdCgpIG9uIHN0cmluZ3NcbiAgLy8gdG8gY2xlYW4gdXAgcG90ZW50aWFsbHkgd29ua3kgdXJscy5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdzdHJpbmcnKSB7IG9iaiA9IHVybFBhcnNlKG9iaik7IH1cbiAgZWxzZSBpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgfHwgb2JqID09PSBudWxsKVxuICB7IHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgJ1BhcmFtZXRlciBcInVybE9ialwiIG11c3QgYmUgYW4gb2JqZWN0LCBub3QgJyArIG9iaiA9PT0gbnVsbCA/ICdudWxsJyA6IHR5cGVvZiBvYmpcbiAgKTsgfVxuICBlbHNlIGlmICghKG9iaiBpbnN0YW5jZW9mIFVybCkpIHsgcmV0dXJuIFVybC5wcm90b3R5cGUuZm9ybWF0LmNhbGwob2JqKTsgfVxuXG4gIHJldHVybiBvYmouZm9ybWF0KCk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGF1dGggPSB0aGlzLmF1dGggfHwgJyc7XG4gIGlmIChhdXRoKSB7XG4gICAgYXV0aCA9IGVuY29kZUF1dGgoYXV0aCk7XG4gICAgYXV0aCArPSAnQCc7XG4gIH1cblxuICB2YXIgcHJvdG9jb2wgPSB0aGlzLnByb3RvY29sIHx8ICcnO1xuICB2YXIgcGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lIHx8ICcnO1xuICB2YXIgaGFzaCA9IHRoaXMuaGFzaCB8fCAnJztcbiAgdmFyIGhvc3QgPSBmYWxzZTtcbiAgdmFyIHF1ZXJ5ID0gJyc7XG5cbiAgaWYgKHRoaXMuaG9zdCkge1xuICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICB9IGVsc2UgaWYgKHRoaXMuaG9zdG5hbWUpIHtcbiAgICBob3N0ID0gYXV0aCArICh0aGlzLmhvc3RuYW1lLmluZGV4T2YoJzonKSA9PT0gLTEgPyB0aGlzLmhvc3RuYW1lIDogJ1snICsgdGhpcy5ob3N0bmFtZSArICddJyk7XG4gICAgaWYgKHRoaXMucG9ydCkge1xuICAgICAgaG9zdCArPSAnOicgKyB0aGlzLnBvcnQ7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkgIT09IG51bGwgJiYgdHlwZW9mIHRoaXMucXVlcnkgPT09ICdvYmplY3QnKVxuICB7IHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHRoaXMucXVlcnkpOyB9XG5cbiAgdmFyIHNlYXJjaCA9IHRoaXMuc2VhcmNoIHx8IChxdWVyeSAmJiAnPycgKyBxdWVyeSkgfHwgJyc7XG5cbiAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLmNoYXJDb2RlQXQocHJvdG9jb2wubGVuZ3RoIC0gMSkgIT09IDU4IC8qOiovKSB7IHByb3RvY29sICs9ICc6JzsgfVxuXG4gIHZhciBuZXdQYXRobmFtZSA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGF0aG5hbWUubGVuZ3RoOyArK2kpIHtcbiAgICBzd2l0Y2ggKHBhdGhuYW1lLmNoYXJDb2RlQXQoaSkpIHtcbiAgICAgIGNhc2UgMzU6IC8vICcjJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG5ld1BhdGhuYW1lICs9IHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MsIGkpOyB9XG4gICAgICAgIG5ld1BhdGhuYW1lICs9ICclMjMnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA2MzogLy8gJz8nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHsgbmV3UGF0aG5hbWUgKz0gcGF0aG5hbWUuc2xpY2UobGFzdFBvcywgaSk7IH1cbiAgICAgICAgbmV3UGF0aG5hbWUgKz0gJyUzRic7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmIChsYXN0UG9zID4gMCkge1xuICAgIGlmIChsYXN0UG9zICE9PSBwYXRobmFtZS5sZW5ndGgpIHsgcGF0aG5hbWUgPSBuZXdQYXRobmFtZSArIHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MpOyB9XG4gICAgZWxzZSB7IHBhdGhuYW1lID0gbmV3UGF0aG5hbWU7IH1cbiAgfVxuXG4gIC8vIG9ubHkgdGhlIHNsYXNoZWRQcm90b2NvbHMgZ2V0IHRoZSAvLy4gIE5vdCBtYWlsdG86LCB4bXBwOiwgZXRjLlxuICAvLyB1bmxlc3MgdGhleSBoYWQgdGhlbSB0byBiZWdpbiB3aXRoLlxuICBpZiAodGhpcy5zbGFzaGVzIHx8ICgoIXByb3RvY29sIHx8IHNsYXNoZWRQcm90b2NvbFtwcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKSkge1xuICAgIGhvc3QgPSAnLy8nICsgKGhvc3QgfHwgJycpO1xuICAgIGlmIChwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSA0NyAvKi8qLykgeyBwYXRobmFtZSA9ICcvJyArIHBhdGhuYW1lOyB9XG4gIH0gZWxzZSBpZiAoIWhvc3QpIHtcbiAgICBob3N0ID0gJyc7XG4gIH1cblxuICBzZWFyY2ggPSBzZWFyY2gucmVwbGFjZSgnIycsICclMjMnKTtcblxuICBpZiAoaGFzaCAmJiBoYXNoLmNoYXJDb2RlQXQoMCkgIT09IDM1IC8qIyovKSB7IGhhc2ggPSAnIycgKyBoYXNoOyB9XG4gIGlmIChzZWFyY2ggJiYgc2VhcmNoLmNoYXJDb2RlQXQoMCkgIT09IDYzIC8qPyovKSB7IHNlYXJjaCA9ICc/JyArIHNlYXJjaDsgfVxuXG4gIHJldHVybiBwcm90b2NvbCArIGhvc3QgKyBwYXRobmFtZSArIHNlYXJjaCArIGhhc2g7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIHJldHVybiB1cmxQYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIChyZWxhdGl2ZSkge1xuICByZXR1cm4gdGhpcy5yZXNvbHZlT2JqZWN0KHVybFBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSkpLmZvcm1hdCgpO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICBpZiAoIXNvdXJjZSkgeyByZXR1cm4gcmVsYXRpdmU7IH1cbiAgcmV0dXJuIHVybFBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmVPYmplY3QocmVsYXRpdmUpO1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gKHJlbGF0aXZlKSB7XG4gIGlmICh0eXBlb2YgcmVsYXRpdmUgPT09ICdzdHJpbmcnKSB7XG4gICAgdmFyIHJlbCA9IG5ldyBVcmwoKTtcbiAgICByZWwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKTtcbiAgICByZWxhdGl2ZSA9IHJlbDtcbiAgfVxuXG4gIHZhciByZXN1bHQgPSBuZXcgVXJsKCk7XG4gIHZhciB0a2V5cyA9IE9iamVjdC5rZXlzKHRoaXMpO1xuICBmb3IgKHZhciB0ayA9IDA7IHRrIDwgdGtleXMubGVuZ3RoOyB0aysrKSB7XG4gICAgdmFyIHRrZXkgPSB0a2V5c1t0a107XG4gICAgcmVzdWx0W3RrZXldID0gdGhpc1t0a2V5XTtcbiAgfVxuXG4gIC8vIGhhc2ggaXMgYWx3YXlzIG92ZXJyaWRkZW4sIG5vIG1hdHRlciB3aGF0LlxuICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgcmVzdWx0Lmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gIC8vIGlmIHRoZSByZWxhdGl2ZSB1cmwgaXMgZW1wdHksIHRoZW4gdGhlcmUncyBub3RoaW5nIGxlZnQgdG8gZG8gaGVyZS5cbiAgaWYgKHJlbGF0aXZlLmhyZWYgPT09ICcnKSB7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAvLyB0YWtlIGV2ZXJ5dGhpbmcgZXhjZXB0IHRoZSBwcm90b2NvbCBmcm9tIHJlbGF0aXZlXG4gICAgdmFyIHJrZXlzID0gT2JqZWN0LmtleXMocmVsYXRpdmUpO1xuICAgIGZvciAodmFyIHJrID0gMDsgcmsgPCBya2V5cy5sZW5ndGg7IHJrKyspIHtcbiAgICAgIHZhciBya2V5ID0gcmtleXNbcmtdO1xuICAgICAgaWYgKHJrZXkgIT09ICdwcm90b2NvbCcpIHsgcmVzdWx0W3JrZXldID0gcmVsYXRpdmVbcmtleV07IH1cbiAgICB9XG5cbiAgICAvL3VybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXSAmJiByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgcmVzdWx0LnBhdGggPSByZXN1bHQucGF0aG5hbWUgPSAnLyc7XG4gICAgfVxuXG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmIChyZWxhdGl2ZS5wcm90b2NvbCAmJiByZWxhdGl2ZS5wcm90b2NvbCAhPT0gcmVzdWx0LnByb3RvY29sKSB7XG4gICAgLy8gaWYgaXQncyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgIC8vIHRoZSBwcm90b2NvbCBkb2VzIHdlaXJkIHRoaW5nc1xuICAgIC8vIGZpcnN0LCBpZiBpdCdzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgIC8vIGFuZCBpZiB0aGVyZSB3YXMgYSBwYXRoXG4gICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgLy8gYmVjYXVzZSB0aGF0J3Mga25vd24gdG8gYmUgaG9zdGxlc3MuXG4gICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgIGlmICghc2xhc2hlZFByb3RvY29sW3JlbGF0aXZlLnByb3RvY29sXSkge1xuICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhyZWxhdGl2ZSk7XG4gICAgICBmb3IgKHZhciB2ID0gMDsgdiA8IGtleXMubGVuZ3RoOyB2KyspIHtcbiAgICAgICAgdmFyIGsgPSBrZXlzW3ZdO1xuICAgICAgICByZXN1bHRba10gPSByZWxhdGl2ZVtrXTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICByZXN1bHQucHJvdG9jb2wgPSByZWxhdGl2ZS5wcm90b2NvbDtcbiAgICBpZiAoXG4gICAgICAhcmVsYXRpdmUuaG9zdCAmJlxuICAgICAgIS9eZmlsZTo/JC8udGVzdChyZWxhdGl2ZS5wcm90b2NvbCkgJiZcbiAgICAgICFob3N0bGVzc1Byb3RvY29sW3JlbGF0aXZlLnByb3RvY29sXVxuICAgICkge1xuICAgICAgY29uc3QgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCAnJykuc3BsaXQoJy8nKTtcbiAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBzaGlmdGVkID0gcmVsUGF0aC5zaGlmdCgpO1xuICAgICAgICBpZiAoc2hpZnRlZCkge1xuICAgICAgICAgIHJlbGF0aXZlLmhvc3QgPSBzaGlmdGVkO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3QpIHsgcmVsYXRpdmUuaG9zdCA9ICcnOyB9XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSB7IHJlbGF0aXZlLmhvc3RuYW1lID0gJyc7IH1cbiAgICAgIGlmIChyZWxQYXRoWzBdICE9PSAnJykgeyByZWxQYXRoLnVuc2hpZnQoJycpOyB9XG4gICAgICBpZiAocmVsUGF0aC5sZW5ndGggPCAyKSB7IHJlbFBhdGgudW5zaGlmdCgnJyk7IH1cbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbignLycpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICB9XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgJyc7XG4gICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoO1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgcmVzdWx0LnBvcnQgPSByZWxhdGl2ZS5wb3J0O1xuICAgIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5wYXRobmFtZSB8fCByZXN1bHQuc2VhcmNoKSB7XG4gICAgICB2YXIgcCA9IHJlc3VsdC5wYXRobmFtZSB8fCAnJztcbiAgICAgIHZhciBzID0gcmVzdWx0LnNlYXJjaCB8fCAnJztcbiAgICAgIHJlc3VsdC5wYXRoID0gcCArIHM7XG4gICAgfVxuICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgdmFyIGlzU291cmNlQWJzID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJztcbiAgdmFyIGlzUmVsQWJzID0gcmVsYXRpdmUuaG9zdCB8fCAocmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuY2hhckF0KDApID09PSAnLycpO1xuICB2YXIgbXVzdEVuZEFicyA9IGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8IChyZXN1bHQuaG9zdCAmJiByZWxhdGl2ZS5wYXRobmFtZSk7XG4gIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcbiAgdmFyIHNyY1BhdGggPSAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdCgnLycpKSB8fCBbXTtcbiAgdmFyIHJlbFBhdGggPSAocmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoJy8nKSkgfHwgW107XG4gIHZhciBwc3ljaG90aWMgPSByZXN1bHQucHJvdG9jb2wgJiYgIXNsYXNoZWRQcm90b2NvbFtyZXN1bHQucHJvdG9jb2xdO1xuXG4gIC8vIGlmIHRoZSB1cmwgaXMgYSBub24tc2xhc2hlZCB1cmwsIHRoZW4gcmVsYXRpdmVcbiAgLy8gbGlua3MgbGlrZSAuLi8uLiBzaG91bGQgYmUgYWJsZVxuICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gIC8vIHJlc3VsdC5wcm90b2NvbCBoYXMgYWxyZWFkeSBiZWVuIHNldCBieSBub3cuXG4gIC8vIExhdGVyIG9uLCBwdXQgdGhlIGZpcnN0IHBhdGggcGFydCBpbnRvIHRoZSBob3N0IGZpZWxkLlxuICBpZiAocHN5Y2hvdGljKSB7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gJyc7XG4gICAgcmVzdWx0LnBvcnQgPSBudWxsO1xuICAgIGlmIChyZXN1bHQuaG9zdCkge1xuICAgICAgaWYgKHNyY1BhdGhbMF0gPT09ICcnKSB7IHNyY1BhdGhbMF0gPSByZXN1bHQuaG9zdDsgfVxuICAgICAgZWxzZSB7IHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7IH1cbiAgICB9XG4gICAgcmVzdWx0Lmhvc3QgPSAnJztcbiAgICBpZiAocmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAgIHJlbGF0aXZlLmhvc3RuYW1lID0gbnVsbDtcbiAgICAgIHJlbGF0aXZlLnBvcnQgPSBudWxsO1xuICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09ICcnKSB7IHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0OyB9XG4gICAgICAgIGVsc2UgeyByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7IH1cbiAgICAgIH1cbiAgICAgIHJlbGF0aXZlLmhvc3QgPSBudWxsO1xuICAgIH1cbiAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gJycgfHwgc3JjUGF0aFswXSA9PT0gJycpO1xuICB9XG5cbiAgaWYgKGlzUmVsQWJzKSB7XG4gICAgLy8gaXQncyBhYnNvbHV0ZS5cbiAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgcmVsYXRpdmUuaG9zdCA9PT0gJycgPyByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID1cbiAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3RuYW1lID09PSAnJyA/IHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBpdCdzIHJlbGF0aXZlXG4gICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgaWYgKCFzcmNQYXRoKSB7IHNyY1BhdGggPSBbXTsgfVxuICAgIHNyY1BhdGgucG9wKCk7XG4gICAgc3JjUGF0aCA9IHNyY1BhdGguY29uY2F0KHJlbFBhdGgpO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gIH0gZWxzZSBpZiAocmVsYXRpdmUuc2VhcmNoICE9PSBudWxsICYmIHJlbGF0aXZlLnNlYXJjaCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgLy8ganVzdCBwdWxsIG91dCB0aGUgc2VhcmNoLlxuICAgIC8vIGxpa2UgaHJlZj0nP2ZvbycuXG4gICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLnNoaWZ0KCk7XG4gICAgICAvL29jY2FzaW9uYWxseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgICAgY29uc3QgYXV0aEluSG9zdCA9XG4gICAgICAgIHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgPyByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgICAgcmVzdWx0LnBhdGggPSAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICsgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAvLyB3ZSd2ZSBhbHJlYWR5IGhhbmRsZWQgdGhlIG90aGVyIHN0dWZmIGFib3ZlLlxuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQuc2VhcmNoKSB7XG4gICAgICByZXN1bHQucGF0aCA9ICcvJyArIHJlc3VsdC5zZWFyY2g7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGlmIGEgdXJsIEVORHMgaW4gLiBvciAuLiwgdGhlbiBpdCBtdXN0IGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgdmFyIGxhc3QgPSBzcmNQYXRoLnNsaWNlKC0xKVswXTtcbiAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPVxuICAgICgocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCB8fCBzcmNQYXRoLmxlbmd0aCA+IDEpICYmIChsYXN0ID09PSAnLicgfHwgbGFzdCA9PT0gJy4uJykpIHx8XG4gICAgbGFzdCA9PT0gJyc7XG5cbiAgLy8gc3RyaXAgc2luZ2xlIGRvdHMsIHJlc29sdmUgZG91YmxlIGRvdHMgdG8gcGFyZW50IGRpclxuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gc3JjUGF0aC5sZW5ndGg7IGkgPj0gMDsgaS0tKSB7XG4gICAgbGFzdCA9IHNyY1BhdGhbaV07XG4gICAgaWYgKGxhc3QgPT09ICcuJykge1xuICAgICAgc3BsaWNlT25lKHNyY1BhdGgsIGkpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgc3BsaWNlT25lKHNyY1BhdGgsIGkpO1xuICAgICAgdXArKztcbiAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICBzcGxpY2VPbmUoc3JjUGF0aCwgaSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBzcmNQYXRoLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgc3JjUGF0aFswXSAhPT0gJycgJiYgKCFzcmNQYXRoWzBdIHx8IHNyY1BhdGhbMF0uY2hhckF0KDApICE9PSAnLycpKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIHNyY1BhdGguam9pbignLycpLnN1YnN0cigtMSkgIT09ICcvJykge1xuICAgIHNyY1BhdGgucHVzaCgnJyk7XG4gIH1cblxuICB2YXIgaXNBYnNvbHV0ZSA9IHNyY1BhdGhbMF0gPT09ICcnIHx8IChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckF0KDApID09PSAnLycpO1xuXG4gIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICBpZiAoaXNBYnNvbHV0ZSkge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSAnJztcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLmxlbmd0aCA/IHNyY1BhdGguc2hpZnQoKSA6ICcnO1xuICAgIH1cbiAgICAvL29jY2FzaW9uYWxseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgIC8vdGhpcyBlc3BlY2lhbGx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgY29uc3QgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgPyByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgfVxuICB9XG5cbiAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5qb2luKCcvJyk7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgcmVxdWVzdC5odHRwXG4gIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArIChyZXN1bHQuc2VhcmNoID8gcmVzdWx0LnNlYXJjaCA6ICcnKTtcbiAgfVxuICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGggfHwgcmVzdWx0LmF1dGg7XG4gIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5wYXJzZUhvc3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBob3N0ID0gdGhpcy5ob3N0O1xuICB2YXIgcG9ydCA9IHBvcnRQYXR0ZXJuLmV4ZWMoaG9zdCk7XG4gIGlmIChwb3J0KSB7XG4gICAgcG9ydCA9IHBvcnRbMF07XG4gICAgaWYgKHBvcnQgIT09ICc6Jykge1xuICAgICAgdGhpcy5wb3J0ID0gcG9ydC5zbGljZSgxKTtcbiAgICB9XG4gICAgaG9zdCA9IGhvc3Quc2xpY2UoMCwgaG9zdC5sZW5ndGggLSBwb3J0Lmxlbmd0aCk7XG4gIH1cbiAgaWYgKGhvc3QpIHsgdGhpcy5ob3N0bmFtZSA9IGhvc3Q7IH1cbn07XG5cbi8vIEFib3V0IDEuNXggZmFzdGVyIHRoYW4gdGhlIHR3by1hcmcgdmVyc2lvbiBvZiBBcnJheSNzcGxpY2UoKS5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBzcGxpY2VPbmUobGlzdCwgaW5kZXgpIHtcbiAgZm9yICh2YXIgaSA9IGluZGV4LCBrID0gaSArIDEsIG4gPSBsaXN0Lmxlbmd0aDsgayA8IG47IGkgKz0gMSwgayArPSAxKSB7IGxpc3RbaV0gPSBsaXN0W2tdOyB9XG4gIGxpc3QucG9wKCk7XG59XG5cbnZhciBoZXhUYWJsZSA9IG5ldyBBcnJheSgyNTYpO1xuZm9yICh2YXIgaSA9IDA7IGkgPCAyNTY7ICsraSlcbnsgaGV4VGFibGVbaV0gPSAnJScgKyAoKGkgPCAxNiA/ICcwJyA6ICcnKSArIGkudG9TdHJpbmcoMTYpKS50b1VwcGVyQ2FzZSgpOyB9XG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gZW5jb2RlQXV0aChzdHIpIHtcbiAgLy8gZmFzdGVyIGVuY29kZVVSSUNvbXBvbmVudCBhbHRlcm5hdGl2ZSBmb3IgZW5jb2RpbmcgYXV0aCB1cmkgY29tcG9uZW50c1xuICB2YXIgb3V0ID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgYyA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgLy8gVGhlc2UgY2hhcmFjdGVycyBkbyBub3QgbmVlZCBlc2NhcGluZzpcbiAgICAvLyAhIC0gLiBfIH5cbiAgICAvLyAnICggKSAqIDpcbiAgICAvLyBkaWdpdHNcbiAgICAvLyBhbHBoYSAodXBwZXJjYXNlKVxuICAgIC8vIGFscGhhIChsb3dlcmNhc2UpXG4gICAgaWYgKFxuICAgICAgYyA9PT0gMHgyMSB8fFxuICAgICAgYyA9PT0gMHgyZCB8fFxuICAgICAgYyA9PT0gMHgyZSB8fFxuICAgICAgYyA9PT0gMHg1ZiB8fFxuICAgICAgYyA9PT0gMHg3ZSB8fFxuICAgICAgKGMgPj0gMHgyNyAmJiBjIDw9IDB4MmEpIHx8XG4gICAgICAoYyA+PSAweDMwICYmIGMgPD0gMHgzYSkgfHxcbiAgICAgIChjID49IDB4NDEgJiYgYyA8PSAweDVhKSB8fFxuICAgICAgKGMgPj0gMHg2MSAmJiBjIDw9IDB4N2EpXG4gICAgKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7IG91dCArPSBzdHIuc2xpY2UobGFzdFBvcywgaSk7IH1cblxuICAgIGxhc3RQb3MgPSBpICsgMTtcblxuICAgIC8vIE90aGVyIEFTQ0lJIGNoYXJhY3RlcnNcbiAgICBpZiAoYyA8IDB4ODApIHtcbiAgICAgIG91dCArPSBoZXhUYWJsZVtjXTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIE11bHRpLWJ5dGUgY2hhcmFjdGVycyAuLi5cbiAgICBpZiAoYyA8IDB4ODAwKSB7XG4gICAgICBvdXQgKz0gaGV4VGFibGVbMHhjMCB8IChjID4+IDYpXSArIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoYyA8IDB4ZDgwMCB8fCBjID49IDB4ZTAwMCkge1xuICAgICAgb3V0ICs9XG4gICAgICAgIGhleFRhYmxlWzB4ZTAgfCAoYyA+PiAxMildICtcbiAgICAgICAgaGV4VGFibGVbMHg4MCB8ICgoYyA+PiA2KSAmIDB4M2YpXSArXG4gICAgICAgIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICAvLyBTdXJyb2dhdGUgcGFpclxuICAgICsraTtcbiAgICB2YXIgYzI7XG4gICAgaWYgKGkgPCBzdHIubGVuZ3RoKSB7IGMyID0gc3RyLmNoYXJDb2RlQXQoaSkgJiAweDNmZjsgfVxuICAgIGVsc2UgeyBjMiA9IDA7IH1cbiAgICBjID0gMHgxMDAwMCArICgoKGMgJiAweDNmZikgPDwgMTApIHwgYzIpO1xuICAgIG91dCArPVxuICAgICAgaGV4VGFibGVbMHhmMCB8IChjID4+IDE4KV0gK1xuICAgICAgaGV4VGFibGVbMHg4MCB8ICgoYyA+PiAxMikgJiAweDNmKV0gK1xuICAgICAgaGV4VGFibGVbMHg4MCB8ICgoYyA+PiA2KSAmIDB4M2YpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKGMgJiAweDNmKV07XG4gIH1cbiAgaWYgKGxhc3RQb3MgPT09IDApIHsgcmV0dXJuIHN0cjsgfVxuICBpZiAobGFzdFBvcyA8IHN0ci5sZW5ndGgpIHsgcmV0dXJuIG91dCArIHN0ci5zbGljZShsYXN0UG9zKTsgfVxuICByZXR1cm4gb3V0O1xufVxuIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxZQUFZOztBQUVaLElBQUFBLFNBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUE0QyxTQUFBRCx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUU1Q0csT0FBTyxDQUFDQyxLQUFLLEdBQUdDLFFBQVE7QUFDeEJGLE9BQU8sQ0FBQ0csT0FBTyxHQUFHQyxVQUFVO0FBQzVCSixPQUFPLENBQUNLLGFBQWEsR0FBR0MsZ0JBQWdCO0FBQ3hDTixPQUFPLENBQUNPLE1BQU0sR0FBR0MsU0FBUztBQUUxQlIsT0FBTyxDQUFDUyxHQUFHLEdBQUdBLEdBQUc7QUFFakIsU0FBU0EsR0FBR0EsQ0FBQSxFQUFHO0VBQ2IsSUFBSSxDQUFDQyxRQUFRLEdBQUcsSUFBSTtFQUNwQixJQUFJLENBQUNDLE9BQU8sR0FBRyxJQUFJO0VBQ25CLElBQUksQ0FBQ0MsSUFBSSxHQUFHLElBQUk7RUFDaEIsSUFBSSxDQUFDQyxJQUFJLEdBQUcsSUFBSTtFQUNoQixJQUFJLENBQUNDLElBQUksR0FBRyxJQUFJO0VBQ2hCLElBQUksQ0FBQ0MsUUFBUSxHQUFHLElBQUk7RUFDcEIsSUFBSSxDQUFDQyxJQUFJLEdBQUcsSUFBSTtFQUNoQixJQUFJLENBQUNDLE1BQU0sR0FBRyxJQUFJO0VBQ2xCLElBQUksQ0FBQ0MsS0FBSyxHQUFHLElBQUk7RUFDakIsSUFBSSxDQUFDQyxRQUFRLEdBQUcsSUFBSTtFQUNwQixJQUFJLENBQUNDLElBQUksR0FBRyxJQUFJO0VBQ2hCLElBQUksQ0FBQ0MsSUFBSSxHQUFHLElBQUk7QUFDbEI7O0FBRUE7O0FBRUE7QUFDQTtBQUNBLE1BQU1DLGVBQWUsR0FBRyxtQkFBbUI7QUFDM0MsTUFBTUMsV0FBVyxHQUFHLFVBQVU7O0FB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