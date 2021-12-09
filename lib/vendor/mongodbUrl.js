// A slightly patched version of node's url module, with support for mongodb://
// uris.
//
// See https://github.com/nodejs/node/blob/master/LICENSE for licensing
// information
'use strict';

const punycode = require('punycode');

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
} // Reference: RFC 3986, RFC 1808, RFC 2396
// define these here so at least they only have to be
// compiled once on the first module load.


const protocolPattern = /^([a-z0-9.+-]+:)/i;
const portPattern = /:[0-9]*$/; // Special case for a simple path URL

const simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/; // protocols that can allow "unsafe" and "unwise" chars.

const unsafeProtocol = {
  javascript: true,
  'javascript:': true
}; // protocols that never have a hostname.

const hostlessProtocol = {
  javascript: true,
  'javascript:': true
}; // protocols that always contain a // bit.

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
  if (url instanceof Url) return url;
  var u = new Url();
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}
/* istanbul ignore next: improve coverage */


Url.prototype.parse = function (url, parseQueryString, slashesDenoteHost) {
  if (typeof url !== 'string') {
    throw new TypeError('Parameter "url" must be a string, not ' + typeof url);
  } // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916


  var hasHash = false;
  var start = -1;
  var end = -1;
  var rest = '';
  var lastPos = 0;
  var i = 0;

  for (var inWs = false, split = false; i < url.length; ++i) {
    const code = url.charCodeAt(i); // Find first and last non-whitespace characters for trimming

    const isWs = code === 32
    /* */
    || code === 9
    /*\t*/
    || code === 13
    /*\r*/
    || code === 10
    /*\n*/
    || code === 12
    /*\f*/
    || code === 160
    /*\u00A0*/
    || code === 65279;
    /*\uFEFF*/

    if (start === -1) {
      if (isWs) continue;
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
    } // Only convert backslashes while we haven't seen a split character


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
          if (i - lastPos > 0) rest += url.slice(lastPos, i);
          rest += '/';
          lastPos = i + 1;
          break;
      }
    } else if (!hasHash && code === 35
    /*#*/
    ) {
      hasHash = true;
    }
  } // Check if string was non-empty (including strings with only whitespace)


  if (start !== -1) {
    if (lastPos === start) {
      // We didn't convert any backslashes
      if (end === -1) {
        if (start === 0) rest = url;else rest = url.slice(start);
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
  } // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.


  if (slashesDenoteHost || proto || /^\/\/[^@\/]+@[^@\/]+/.test(rest)) {
    var slashes = rest.charCodeAt(0) === 47
    /*/*/
    && rest.charCodeAt(1) === 47;
    /*/*/

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
          if (nonHost === -1) nonHost = i;
          break;

        case 35: // '#'

        case 47: // '/'

        case 63:
          // '?'
          // Find the first instance of any host-ending characters
          if (nonHost === -1) nonHost = i;
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

      if (hostEnd !== -1) break;
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
    } // pull out port.


    this.parseHost(); // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.

    if (typeof this.hostname !== 'string') this.hostname = '';
    var hostname = this.hostname; // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.

    var ipv6Hostname = hostname.charCodeAt(0) === 91
    /*[*/
    && hostname.charCodeAt(hostname.length - 1) === 93;
    /*]*/
    // validate a little.

    if (!ipv6Hostname) {
      const result = validateHostname(this, rest, hostname);
      if (result !== undefined) rest = result;
    } // hostnames are always lower case.


    this.hostname = this.hostname.toLowerCase();

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p; // strip [ and ] from the hostname
    // the host field still retains them, though

    if (ipv6Hostname) {
      this.hostname = this.hostname.slice(1, -1);

      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  } // now rest is set to the post-host stuff.
  // chop off any delim chars.


  if (!unsafeProtocol[lowerProto]) {
    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    const result = autoEscapeStr(rest);
    if (result !== undefined) rest = result;
  }

  var questionIdx = -1;
  var hashIdx = -1;

  for (i = 0; i < rest.length; ++i) {
    const code = rest.charCodeAt(i);

    if (code === 35
    /*#*/
    ) {
      this.hash = rest.slice(i);
      hashIdx = i;
      break;
    } else if (code === 63
    /*?*/
    && questionIdx === -1) {
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
    if (rest.length > 0) this.pathname = rest;
  } else if (firstIdx > 0) {
    this.pathname = rest.slice(0, firstIdx);
  }

  if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
    this.pathname = '/';
  } // to support http.request


  if (this.pathname || this.search) {
    const p = this.pathname || '';
    const s = this.search || '';
    this.path = p + s;
  } // finally, reconstruct the href based on what has been validated.


  this.href = this.format();
  return this;
};
/* istanbul ignore next: improve coverage */


function validateHostname(self, rest, hostname) {
  for (var i = 0, lastPos; i <= hostname.length; ++i) {
    var code;
    if (i < hostname.length) code = hostname.charCodeAt(i);

    if (code === 46
    /*.*/
    || i === hostname.length) {
      if (i - lastPos > 0) {
        if (i - lastPos > 63) {
          self.hostname = hostname.slice(0, lastPos + 63);
          return '/' + hostname.slice(lastPos + 63) + rest;
        }
      }

      lastPos = i + 1;
      continue;
    } else if (code >= 48
    /*0*/
    && code <= 57
    /*9*/
    || code >= 97
    /*a*/
    && code <= 122
    /*z*/
    || code === 45
    /*-*/
    || code >= 65
    /*A*/
    && code <= 90
    /*Z*/
    || code === 43
    /*+*/
    || code === 95
    /*_*/
    ||
    /* BEGIN MONGO URI PATCH */
    code === 44
    /*,*/
    || code === 58
    /*:*/
    ||
    /* END MONGO URI PATCH */
    code > 127) {
      continue;
    } // Invalid host character


    self.hostname = hostname.slice(0, i);
    if (i < hostname.length) return '/' + hostname.slice(i) + rest;
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
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%09';
        lastPos = i + 1;
        break;

      case 10:
        // '\n'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%0A';
        lastPos = i + 1;
        break;

      case 13:
        // '\r'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%0D';
        lastPos = i + 1;
        break;

      case 32:
        // ' '
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%20';
        lastPos = i + 1;
        break;

      case 34:
        // '"'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%22';
        lastPos = i + 1;
        break;

      case 39:
        // '\''
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%27';
        lastPos = i + 1;
        break;

      case 60:
        // '<'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%3C';
        lastPos = i + 1;
        break;

      case 62:
        // '>'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%3E';
        lastPos = i + 1;
        break;

      case 92:
        // '\\'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%5C';
        lastPos = i + 1;
        break;

      case 94:
        // '^'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%5E';
        lastPos = i + 1;
        break;

      case 96:
        // '`'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%60';
        lastPos = i + 1;
        break;

      case 123:
        // '{'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7B';
        lastPos = i + 1;
        break;

      case 124:
        // '|'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7C';
        lastPos = i + 1;
        break;

      case 125:
        // '}'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7D';
        lastPos = i + 1;
        break;
    }
  }

  if (lastPos === 0) return;
  if (lastPos < rest.length) return newRest + rest.slice(lastPos);else return newRest;
} // format a parsed object into a url string

/* istanbul ignore next: improve coverage */


function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof obj === 'string') obj = urlParse(obj);else if (typeof obj !== 'object' || obj === null) throw new TypeError('Parameter "urlObj" must be an object, not ' + obj === null ? 'null' : typeof obj);else if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
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

  if (this.query !== null && typeof this.query === 'object') query = querystring.stringify(this.query);
  var search = this.search || query && '?' + query || '';
  if (protocol && protocol.charCodeAt(protocol.length - 1) !== 58
  /*:*/
  ) protocol += ':';
  var newPathname = '';
  var lastPos = 0;

  for (var i = 0; i < pathname.length; ++i) {
    switch (pathname.charCodeAt(i)) {
      case 35:
        // '#'
        if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
        newPathname += '%23';
        lastPos = i + 1;
        break;

      case 63:
        // '?'
        if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
        newPathname += '%3F';
        lastPos = i + 1;
        break;
    }
  }

  if (lastPos > 0) {
    if (lastPos !== pathname.length) pathname = newPathname + pathname.slice(lastPos);else pathname = newPathname;
  } // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.


  if (this.slashes || (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charCodeAt(0) !== 47
    /*/*/
    ) pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  search = search.replace('#', '%23');
  if (hash && hash.charCodeAt(0) !== 35
  /*#*/
  ) hash = '#' + hash;
  if (search && search.charCodeAt(0) !== 63
  /*?*/
  ) search = '?' + search;
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
  if (!source) return relative;
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
  } // hash is always overridden, no matter what.
  // even href="" will remove it.


  result.hash = relative.hash; // if the relative url is empty, then there's nothing left to do here.

  if (relative.href === '') {
    result.href = result.format();
    return result;
  } // hrefs like //foo/bar always cut to the protocol.


  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);

    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol') result[rkey] = relative[rkey];
    } //urlParse appends trailing / to urls like http://www.example.com


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

      while (relPath.length && !(relative.host = relPath.shift()));

      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }

    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port; // to support http.request

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
  var psychotic = result.protocol && !slashedProtocol[result.protocol]; // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.

  if (psychotic) {
    result.hostname = '';
    result.port = null;

    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;else srcPath.unshift(result.host);
    }

    result.host = '';

    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;

      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;else relPath.unshift(relative.host);
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
    srcPath = relPath; // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (relative.search !== null && relative.search !== undefined) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift(); //occasionally the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')

      const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;

      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }

    result.search = relative.search;
    result.query = relative.query; //to support http.request

    if (result.pathname !== null || result.search !== null) {
      result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
    }

    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null; //to support http.request

    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }

    result.href = result.format();
    return result;
  } // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.


  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === '.' || last === '..') || last === ''; // strip single dots, resolve double dots to parent dir
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
  } // if the path is allowed to go above the root, restore leading ..s


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

  var isAbsolute = srcPath[0] === '' || srcPath[0] && srcPath[0].charAt(0) === '/'; // put the host back

  if (psychotic) {
    if (isAbsolute) {
      result.hostname = result.host = '';
    } else {
      result.hostname = result.host = srcPath.length ? srcPath.shift() : '';
    } //occasionally the auth can get stuck only in host
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
  } //to support request.http


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

  if (host) this.hostname = host;
}; // About 1.5x faster than the two-arg version of Array#splice().

/* istanbul ignore next: improve coverage */


function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1) list[i] = list[k];

  list.pop();
}

var hexTable = new Array(256);

for (var i = 0; i < 256; ++i) hexTable[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase();
/* istanbul ignore next: improve coverage */


function encodeAuth(str) {
  // faster encodeURIComponent alternative for encoding auth uri components
  var out = '';
  var lastPos = 0;

  for (var i = 0; i < str.length; ++i) {
    var c = str.charCodeAt(i); // These characters do not need escaping:
    // ! - . _ ~
    // ' ( ) * :
    // digits
    // alpha (uppercase)
    // alpha (lowercase)

    if (c === 0x21 || c === 0x2d || c === 0x2e || c === 0x5f || c === 0x7e || c >= 0x27 && c <= 0x2a || c >= 0x30 && c <= 0x3a || c >= 0x41 && c <= 0x5a || c >= 0x61 && c <= 0x7a) {
      continue;
    }

    if (i - lastPos > 0) out += str.slice(lastPos, i);
    lastPos = i + 1; // Other ASCII characters

    if (c < 0x80) {
      out += hexTable[c];
      continue;
    } // Multi-byte characters ...


    if (c < 0x800) {
      out += hexTable[0xc0 | c >> 6] + hexTable[0x80 | c & 0x3f];
      continue;
    }

    if (c < 0xd800 || c >= 0xe000) {
      out += hexTable[0xe0 | c >> 12] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
      continue;
    } // Surrogate pair


    ++i;
    var c2;
    if (i < str.length) c2 = str.charCodeAt(i) & 0x3ff;else c2 = 0;
    c = 0x10000 + ((c & 0x3ff) << 10 | c2);
    out += hexTable[0xf0 | c >> 18] + hexTable[0x80 | c >> 12 & 0x3f] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
  }

  if (lastPos === 0) return str;
  if (lastPos < str.length) return out + str.slice(lastPos);
  return out;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92ZW5kb3IvbW9uZ29kYlVybC5qcyJdLCJuYW1lcyI6WyJwdW55Y29kZSIsInJlcXVpcmUiLCJleHBvcnRzIiwicGFyc2UiLCJ1cmxQYXJzZSIsInJlc29sdmUiLCJ1cmxSZXNvbHZlIiwicmVzb2x2ZU9iamVjdCIsInVybFJlc29sdmVPYmplY3QiLCJmb3JtYXQiLCJ1cmxGb3JtYXQiLCJVcmwiLCJwcm90b2NvbCIsInNsYXNoZXMiLCJhdXRoIiwiaG9zdCIsInBvcnQiLCJob3N0bmFtZSIsImhhc2giLCJzZWFyY2giLCJxdWVyeSIsInBhdGhuYW1lIiwicGF0aCIsImhyZWYiLCJwcm90b2NvbFBhdHRlcm4iLCJwb3J0UGF0dGVybiIsInNpbXBsZVBhdGhQYXR0ZXJuIiwidW5zYWZlUHJvdG9jb2wiLCJqYXZhc2NyaXB0IiwiaG9zdGxlc3NQcm90b2NvbCIsInNsYXNoZWRQcm90b2NvbCIsImh0dHAiLCJodHRwcyIsImZ0cCIsImdvcGhlciIsImZpbGUiLCJxdWVyeXN0cmluZyIsInVybCIsInBhcnNlUXVlcnlTdHJpbmciLCJzbGFzaGVzRGVub3RlSG9zdCIsInUiLCJwcm90b3R5cGUiLCJUeXBlRXJyb3IiLCJoYXNIYXNoIiwic3RhcnQiLCJlbmQiLCJyZXN0IiwibGFzdFBvcyIsImkiLCJpbldzIiwic3BsaXQiLCJsZW5ndGgiLCJjb2RlIiwiY2hhckNvZGVBdCIsImlzV3MiLCJzbGljZSIsInNpbXBsZVBhdGgiLCJleGVjIiwicHJvdG8iLCJsb3dlclByb3RvIiwidG9Mb3dlckNhc2UiLCJ0ZXN0IiwiaG9zdEVuZCIsImF0U2lnbiIsIm5vbkhvc3QiLCJkZWNvZGVVUklDb21wb25lbnQiLCJwYXJzZUhvc3QiLCJpcHY2SG9zdG5hbWUiLCJyZXN1bHQiLCJ2YWxpZGF0ZUhvc3RuYW1lIiwidW5kZWZpbmVkIiwidG9BU0NJSSIsInAiLCJoIiwiYXV0b0VzY2FwZVN0ciIsInF1ZXN0aW9uSWR4IiwiaGFzaElkeCIsImZpcnN0SWR4IiwicyIsInNlbGYiLCJuZXdSZXN0Iiwib2JqIiwiY2FsbCIsImVuY29kZUF1dGgiLCJpbmRleE9mIiwic3RyaW5naWZ5IiwibmV3UGF0aG5hbWUiLCJyZXBsYWNlIiwic291cmNlIiwicmVsYXRpdmUiLCJyZWwiLCJ0a2V5cyIsIk9iamVjdCIsImtleXMiLCJ0ayIsInRrZXkiLCJya2V5cyIsInJrIiwicmtleSIsInYiLCJrIiwicmVsUGF0aCIsInNoaWZ0IiwidW5zaGlmdCIsImpvaW4iLCJpc1NvdXJjZUFicyIsImNoYXJBdCIsImlzUmVsQWJzIiwibXVzdEVuZEFicyIsInJlbW92ZUFsbERvdHMiLCJzcmNQYXRoIiwicHN5Y2hvdGljIiwicG9wIiwiY29uY2F0IiwiYXV0aEluSG9zdCIsImxhc3QiLCJoYXNUcmFpbGluZ1NsYXNoIiwidXAiLCJzcGxpY2VPbmUiLCJzdWJzdHIiLCJwdXNoIiwiaXNBYnNvbHV0ZSIsImxpc3QiLCJpbmRleCIsIm4iLCJoZXhUYWJsZSIsIkFycmF5IiwidG9TdHJpbmciLCJ0b1VwcGVyQ2FzZSIsInN0ciIsIm91dCIsImMiLCJjMiJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBOztBQUVBLE1BQU1BLFFBQVEsR0FBR0MsT0FBTyxDQUFDLFVBQUQsQ0FBeEI7O0FBRUFDLE9BQU8sQ0FBQ0MsS0FBUixHQUFnQkMsUUFBaEI7QUFDQUYsT0FBTyxDQUFDRyxPQUFSLEdBQWtCQyxVQUFsQjtBQUNBSixPQUFPLENBQUNLLGFBQVIsR0FBd0JDLGdCQUF4QjtBQUNBTixPQUFPLENBQUNPLE1BQVIsR0FBaUJDLFNBQWpCO0FBRUFSLE9BQU8sQ0FBQ1MsR0FBUixHQUFjQSxHQUFkOztBQUVBLFNBQVNBLEdBQVQsR0FBZTtBQUNiLE9BQUtDLFFBQUwsR0FBZ0IsSUFBaEI7QUFDQSxPQUFLQyxPQUFMLEdBQWUsSUFBZjtBQUNBLE9BQUtDLElBQUwsR0FBWSxJQUFaO0FBQ0EsT0FBS0MsSUFBTCxHQUFZLElBQVo7QUFDQSxPQUFLQyxJQUFMLEdBQVksSUFB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QSxDQUFDLEdBQUcsS0FBTCxLQUFlLEVBQWhCLEdBQXNCQyxFQUFqQyxDQUFKO0FBQ0FGLElBQUFBLEdBQUcsSUFDREwsUUFBUSxDQUFDLE9BQVFNLENBQUMsSUFBSSxFQUFkLENBQVIsR0FDQU4sUUFBUSxDQUFDLE9BQVNNLENBQUMsSUFBSSxFQUFOLEdBQVksSUFBckIsQ0FEUixHQUVBTixRQUFRLENBQUMsT0FBU00sQ0FBQyxJQUFJLENBQU4sR0FBVyxJQUFwQixDQUZSLEdBR0FOLFFBQVEsQ0FBQyxPQUFRTSxDQUFDLEdBQUcsSUFBYixDQUpWO0FBS0Q7O0FBQ0QsTUFBSXBGLE9BQU8sS0FBSyxDQUFoQixFQUFtQixPQUFPa0YsR0FBUDtBQUNuQixNQUFJbEYsT0FBTyxHQUFHa0YsR0FBRyxDQUFDOUUsTUFBbEIsRUFBMEIsT0FBTytFLEdBQUcsR0FBR0QsR0FBRyxDQUFDMUUsS0FBSixDQUFVUixPQUFWLENBQWI7QUFDMUIsU0FBT21GLEdBQVA7QUFDRCIsInNvdXJjZXNDb250ZW50IjpbIi8vIEEgc2xpZ2h0bHkgcGF0Y2hlZCB2ZXJzaW9uIG9mIG5vZGUncyB1cmwgbW9kdWxlLCB3aXRoIHN1cHBvcnQgZm9yIG1vbmdvZGI6Ly9cbi8vIHVyaXMuXG4vL1xuLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9ibG9iL21hc3Rlci9MSUNFTlNFIGZvciBsaWNlbnNpbmdcbi8vIGluZm9ybWF0aW9uXG5cbid1c2Ugc3RyaWN0JztcblxuY29uc3QgcHVueWNvZGUgPSByZXF1aXJlKCdwdW55Y29kZScpO1xuXG5leHBvcnRzLnBhcnNlID0gdXJsUGFyc2U7XG5leHBvcnRzLnJlc29sdmUgPSB1cmxSZXNvbHZlO1xuZXhwb3J0cy5yZXNvbHZlT2JqZWN0ID0gdXJsUmVzb2x2ZU9iamVjdDtcbmV4cG9ydHMuZm9ybWF0ID0gdXJsRm9ybWF0O1xuXG5leHBvcnRzLlVybCA9IFVybDtcblxuZnVuY3Rpb24gVXJsKCkge1xuICB0aGlzLnByb3RvY29sID0gbnVsbDtcbiAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgdGhpcy5hdXRoID0gbnVsbDtcbiAgdGhpcy5ob3N0ID0gbnVsbDtcbiAgdGhpcy5wb3J0ID0gbnVsbDtcbiAgdGhpcy5ob3N0bmFtZSA9IG51bGw7XG4gIHRoaXMuaGFzaCA9IG51bGw7XG4gIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgdGhpcy5xdWVyeSA9IG51bGw7XG4gIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuICB0aGlzLnBhdGggPSBudWxsO1xuICB0aGlzLmhyZWYgPSBudWxsO1xufVxuXG4vLyBSZWZlcmVuY2U6IFJGQyAzOTg2LCBSRkMgMTgwOCwgUkZDIDIzOTZcblxuLy8gZGVmaW5lIHRoZXNlIGhlcmUgc28gYXQgbGVhc3QgdGhleSBvbmx5IGhhdmUgdG8gYmVcbi8vIGNvbXBpbGVkIG9uY2Ugb24gdGhlIGZpcnN0IG1vZHVsZSBsb2FkLlxuY29uc3QgcHJvdG9jb2xQYXR0ZXJuID0gL14oW2EtejAtOS4rLV0rOikvaTtcbmNvbnN0IHBvcnRQYXR0ZXJuID0gLzpbMC05XSokLztcblxuLy8gU3BlY2lhbCBjYXNlIGZvciBhIHNpbXBsZSBwYXRoIFVSTFxuY29uc3Qgc2ltcGxlUGF0aFBhdHRlcm4gPSAvXihcXC9cXC8/KD8hXFwvKVteXFw/XFxzXSopKFxcP1teXFxzXSopPyQvO1xuXG4vLyBwcm90b2NvbHMgdGhhdCBjYW4gYWxsb3cgXCJ1bnNhZmVcIiBhbmQgXCJ1bndpc2VcIiBjaGFycy5cbmNvbnN0IHVuc2FmZVByb3RvY29sID0ge1xuICBqYXZhc2NyaXB0OiB0cnVlLFxuICAnamF2YXNjcmlwdDonOiB0cnVlLFxufTtcbi8vIHByb3RvY29scyB0aGF0IG5ldmVyIGhhdmUgYSBob3N0bmFtZS5cbmNvbnN0IGhvc3RsZXNzUHJvdG9jb2wgPSB7XG4gIGphdmFzY3JpcHQ6IHRydWUsXG4gICdqYXZhc2NyaXB0Oic6IHRydWUsXG59O1xuLy8gcHJvdG9jb2xzIHRoYXQgYWx3YXlzIGNvbnRhaW4gYSAvLyBiaXQuXG5jb25zdCBzbGFzaGVkUHJvdG9jb2wgPSB7XG4gIGh0dHA6IHRydWUsXG4gICdodHRwOic6IHRydWUsXG4gIGh0dHBzOiB0cnVlLFxuICAnaHR0cHM6JzogdHJ1ZSxcbiAgZnRwOiB0cnVlLFxuICAnZnRwOic6IHRydWUsXG4gIGdvcGhlcjogdHJ1ZSxcbiAgJ2dvcGhlcjonOiB0cnVlLFxuICBmaWxlOiB0cnVlLFxuICAnZmlsZTonOiB0cnVlLFxufTtcbmNvbnN0IHF1ZXJ5c3RyaW5nID0gcmVxdWlyZSgncXVlcnlzdHJpbmcnKTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFBhcnNlKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKHVybCBpbnN0YW5jZW9mIFVybCkgcmV0dXJuIHVybDtcblxuICB2YXIgdSA9IG5ldyBVcmwoKTtcbiAgdS5wYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KTtcbiAgcmV0dXJuIHU7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24gKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignUGFyYW1ldGVyIFwidXJsXCIgbXVzdCBiZSBhIHN0cmluZywgbm90ICcgKyB0eXBlb2YgdXJsKTtcbiAgfVxuXG4gIC8vIENvcHkgY2hyb21lLCBJRSwgb3BlcmEgYmFja3NsYXNoLWhhbmRsaW5nIGJlaGF2aW9yLlxuICAvLyBCYWNrIHNsYXNoZXMgYmVmb3JlIHRoZSBxdWVyeSBzdHJpbmcgZ2V0IGNvbnZlcnRlZCB0byBmb3J3YXJkIHNsYXNoZXNcbiAgLy8gU2VlOiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MjU5MTZcbiAgdmFyIGhhc0hhc2ggPSBmYWxzZTtcbiAgdmFyIHN0YXJ0ID0gLTE7XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIHJlc3QgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICB2YXIgaSA9IDA7XG4gIGZvciAodmFyIGluV3MgPSBmYWxzZSwgc3BsaXQgPSBmYWxzZTsgaSA8IHVybC5sZW5ndGg7ICsraSkge1xuICAgIGNvbnN0IGNvZGUgPSB1cmwuY2hhckNvZGVBdChpKTtcblxuICAgIC8vIEZpbmQgZmlyc3QgYW5kIGxhc3Qgbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVycyBmb3IgdHJpbW1pbmdcbiAgICBjb25zdCBpc1dzID1cbiAgICAgIGNvZGUgPT09IDMyIC8qICovIHx8XG4gICAgICBjb2RlID09PSA5IC8qXFx0Ki8gfHxcbiAgICAgIGNvZGUgPT09IDEzIC8qXFxyKi8gfHxcbiAgICAgIGNvZGUgPT09IDEwIC8qXFxuKi8gfHxcbiAgICAgIGNvZGUgPT09IDEyIC8qXFxmKi8gfHxcbiAgICAgIGNvZGUgPT09IDE2MCAvKlxcdTAwQTAqLyB8fFxuICAgICAgY29kZSA9PT0gNjUyNzk7IC8qXFx1RkVGRiovXG4gICAgaWYgKHN0YXJ0ID09PSAtMSkge1xuICAgICAgaWYgKGlzV3MpIGNvbnRpbnVlO1xuICAgICAgbGFzdFBvcyA9IHN0YXJ0ID0gaTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGluV3MpIHtcbiAgICAgICAgaWYgKCFpc1dzKSB7XG4gICAgICAgICAgZW5kID0gLTE7XG4gICAgICAgICAgaW5XcyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzV3MpIHtcbiAgICAgICAgZW5kID0gaTtcbiAgICAgICAgaW5XcyA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gT25seSBjb252ZXJ0IGJhY2tzbGFzaGVzIHdoaWxlIHdlIGhhdmVuJ3Qgc2VlbiBhIHNwbGl0IGNoYXJhY3RlclxuICAgIGlmICghc3BsaXQpIHtcbiAgICAgIHN3aXRjaCAoY29kZSkge1xuICAgICAgICBjYXNlIDM1OiAvLyAnIydcbiAgICAgICAgICBoYXNIYXNoID0gdHJ1ZTtcbiAgICAgICAgLy8gRmFsbCB0aHJvdWdoXG4gICAgICAgIGNhc2UgNjM6IC8vICc/J1xuICAgICAgICAgIHNwbGl0ID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA5MjogLy8gJ1xcXFwnXG4gICAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgICAgcmVzdCArPSAnLyc7XG4gICAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoIWhhc0hhc2ggJiYgY29kZSA9PT0gMzUgLyojKi8pIHtcbiAgICAgIGhhc0hhc2ggPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGlmIHN0cmluZyB3YXMgbm9uLWVtcHR5IChpbmNsdWRpbmcgc3RyaW5ncyB3aXRoIG9ubHkgd2hpdGVzcGFjZSlcbiAgaWYgKHN0YXJ0ICE9PSAtMSkge1xuICAgIGlmIChsYXN0UG9zID09PSBzdGFydCkge1xuICAgICAgLy8gV2UgZGlkbid0IGNvbnZlcnQgYW55IGJhY2tzbGFzaGVzXG5cbiAgICAgIGlmIChlbmQgPT09IC0xKSB7XG4gICAgICAgIGlmIChzdGFydCA9PT0gMCkgcmVzdCA9IHVybDtcbiAgICAgICAgZWxzZSByZXN0ID0gdXJsLnNsaWNlKHN0YXJ0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3QgPSB1cmwuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChlbmQgPT09IC0xICYmIGxhc3RQb3MgPCB1cmwubGVuZ3RoKSB7XG4gICAgICAvLyBXZSBjb252ZXJ0ZWQgc29tZSBiYWNrc2xhc2hlcyBhbmQgaGF2ZSBvbmx5IHBhcnQgb2YgdGhlIGVudGlyZSBzdHJpbmdcbiAgICAgIHJlc3QgKz0gdXJsLnNsaWNlKGxhc3RQb3MpO1xuICAgIH0gZWxzZSBpZiAoZW5kICE9PSAtMSAmJiBsYXN0UG9zIDwgZW5kKSB7XG4gICAgICAvLyBXZSBjb252ZXJ0ZWQgc29tZSBiYWNrc2xhc2hlcyBhbmQgaGF2ZSBvbmx5IHBhcnQgb2YgdGhlIGVudGlyZSBzdHJpbmdcbiAgICAgIHJlc3QgKz0gdXJsLnNsaWNlKGxhc3RQb3MsIGVuZCk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFzbGFzaGVzRGVub3RlSG9zdCAmJiAhaGFzSGFzaCkge1xuICAgIC8vIFRyeSBmYXN0IHBhdGggcmVnZXhwXG4gICAgY29uc3Qgc2ltcGxlUGF0aCA9IHNpbXBsZVBhdGhQYXR0ZXJuLmV4ZWMocmVzdCk7XG4gICAgaWYgKHNpbXBsZVBhdGgpIHtcbiAgICAgIHRoaXMucGF0aCA9IHJlc3Q7XG4gICAgICB0aGlzLmhyZWYgPSByZXN0O1xuICAgICAgdGhpcy5wYXRobmFtZSA9IHNpbXBsZVBhdGhbMV07XG4gICAgICBpZiAoc2ltcGxlUGF0aFsyXSkge1xuICAgICAgICB0aGlzLnNlYXJjaCA9IHNpbXBsZVBhdGhbMl07XG4gICAgICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHRoaXMuc2VhcmNoLnNsaWNlKDEpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnF1ZXJ5ID0gdGhpcy5zZWFyY2guc2xpY2UoMSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICB0aGlzLnNlYXJjaCA9ICcnO1xuICAgICAgICB0aGlzLnF1ZXJ5ID0ge307XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gIH1cblxuICB2YXIgcHJvdG8gPSBwcm90b2NvbFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgaWYgKHByb3RvKSB7XG4gICAgcHJvdG8gPSBwcm90b1swXTtcbiAgICB2YXIgbG93ZXJQcm90byA9IHByb3RvLnRvTG93ZXJDYXNlKCk7XG4gICAgdGhpcy5wcm90b2NvbCA9IGxvd2VyUHJvdG87XG4gICAgcmVzdCA9IHJlc3Quc2xpY2UocHJvdG8ubGVuZ3RoKTtcbiAgfVxuXG4gIC8vIGZpZ3VyZSBvdXQgaWYgaXQncyBnb3QgYSBob3N0XG4gIC8vIHVzZXJAc2VydmVyIGlzICphbHdheXMqIGludGVycHJldGVkIGFzIGEgaG9zdG5hbWUsIGFuZCB1cmxcbiAgLy8gcmVzb2x1dGlvbiB3aWxsIHRyZWF0IC8vZm9vL2JhciBhcyBob3N0PWZvbyxwYXRoPWJhciBiZWNhdXNlIHRoYXQnc1xuICAvLyBob3cgdGhlIGJyb3dzZXIgcmVzb2x2ZXMgcmVsYXRpdmUgVVJMcy5cbiAgaWYgKHNsYXNoZXNEZW5vdGVIb3N0IHx8IHByb3RvIHx8IC9eXFwvXFwvW15AXFwvXStAW15AXFwvXSsvLnRlc3QocmVzdCkpIHtcbiAgICB2YXIgc2xhc2hlcyA9IHJlc3QuY2hhckNvZGVBdCgwKSA9PT0gNDcgLyovKi8gJiYgcmVzdC5jaGFyQ29kZUF0KDEpID09PSA0NzsgLyovKi9cbiAgICBpZiAoc2xhc2hlcyAmJiAhKHByb3RvICYmIGhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dKSkge1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2UoMik7XG4gICAgICB0aGlzLnNsYXNoZXMgPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaG9zdGxlc3NQcm90b2NvbFtwcm90b10gJiYgKHNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaGVkUHJvdG9jb2xbcHJvdG9dKSkpIHtcbiAgICAvLyB0aGVyZSdzIGEgaG9zdG5hbWUuXG4gICAgLy8gdGhlIGZpcnN0IGluc3RhbmNlIG9mIC8sID8sIDssIG9yICMgZW5kcyB0aGUgaG9zdC5cbiAgICAvL1xuICAgIC8vIElmIHRoZXJlIGlzIGFuIEAgaW4gdGhlIGhvc3RuYW1lLCB0aGVuIG5vbi1ob3N0IGNoYXJzICphcmUqIGFsbG93ZWRcbiAgICAvLyB0byB0aGUgbGVmdCBvZiB0aGUgbGFzdCBAIHNpZ24sIHVubGVzcyBzb21lIGhvc3QtZW5kaW5nIGNoYXJhY3RlclxuICAgIC8vIGNvbWVzICpiZWZvcmUqIHRoZSBALXNpZ24uXG4gICAgLy8gVVJMcyBhcmUgb2Jub3hpb3VzLlxuICAgIC8vXG4gICAgLy8gZXg6XG4gICAgLy8gaHR0cDovL2FAYkBjLyA9PiB1c2VyOmFAYiBob3N0OmNcbiAgICAvLyBodHRwOi8vYUBiP0BjID0+IHVzZXI6YSBob3N0OmIgcGF0aDovP0BjXG5cbiAgICAvLyB2MC4xMiBUT0RPKGlzYWFjcyk6IFRoaXMgaXMgbm90IHF1aXRlIGhvdyBDaHJvbWUgZG9lcyB0aGluZ3MuXG4gICAgLy8gUmV2aWV3IG91ciB0ZXN0IGNhc2UgYWdhaW5zdCBicm93c2VycyBtb3JlIGNvbXByZWhlbnNpdmVseS5cblxuICAgIHZhciBob3N0RW5kID0gLTE7XG4gICAgdmFyIGF0U2lnbiA9IC0xO1xuICAgIHZhciBub25Ib3N0ID0gLTE7XG4gICAgZm9yIChpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIHN3aXRjaCAocmVzdC5jaGFyQ29kZUF0KGkpKSB7XG4gICAgICAgIGNhc2UgOTogLy8gJ1xcdCdcbiAgICAgICAgY2FzZSAxMDogLy8gJ1xcbidcbiAgICAgICAgY2FzZSAxMzogLy8gJ1xccidcbiAgICAgICAgY2FzZSAzMjogLy8gJyAnXG4gICAgICAgIGNhc2UgMzQ6IC8vICdcIidcbiAgICAgICAgY2FzZSAzNzogLy8gJyUnXG4gICAgICAgIGNhc2UgMzk6IC8vICdcXCcnXG4gICAgICAgIGNhc2UgNTk6IC8vICc7J1xuICAgICAgICBjYXNlIDYwOiAvLyAnPCdcbiAgICAgICAgY2FzZSA2MjogLy8gJz4nXG4gICAgICAgIGNhc2UgOTI6IC8vICdcXFxcJ1xuICAgICAgICBjYXNlIDk0OiAvLyAnXidcbiAgICAgICAgY2FzZSA5NjogLy8gJ2AnXG4gICAgICAgIGNhc2UgMTIzOiAvLyAneydcbiAgICAgICAgY2FzZSAxMjQ6IC8vICd8J1xuICAgICAgICBjYXNlIDEyNTogLy8gJ30nXG4gICAgICAgICAgLy8gQ2hhcmFjdGVycyB0aGF0IGFyZSBuZXZlciBldmVyIGFsbG93ZWQgaW4gYSBob3N0bmFtZSBmcm9tIFJGQyAyMzk2XG4gICAgICAgICAgaWYgKG5vbkhvc3QgPT09IC0xKSBub25Ib3N0ID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgIGNhc2UgNDc6IC8vICcvJ1xuICAgICAgICBjYXNlIDYzOiAvLyAnPydcbiAgICAgICAgICAvLyBGaW5kIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiBhbnkgaG9zdC1lbmRpbmcgY2hhcmFjdGVyc1xuICAgICAgICAgIGlmIChub25Ib3N0ID09PSAtMSkgbm9uSG9zdCA9IGk7XG4gICAgICAgICAgaG9zdEVuZCA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgNjQ6IC8vICdAJ1xuICAgICAgICAgIC8vIEF0IHRoaXMgcG9pbnQsIGVpdGhlciB3ZSBoYXZlIGFuIGV4cGxpY2l0IHBvaW50IHdoZXJlIHRoZVxuICAgICAgICAgIC8vIGF1dGggcG9ydGlvbiBjYW5ub3QgZ28gcGFzdCwgb3IgdGhlIGxhc3QgQCBjaGFyIGlzIHRoZSBkZWNpZGVyLlxuICAgICAgICAgIGF0U2lnbiA9IGk7XG4gICAgICAgICAgbm9uSG9zdCA9IC0xO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKGhvc3RFbmQgIT09IC0xKSBicmVhaztcbiAgICB9XG4gICAgc3RhcnQgPSAwO1xuICAgIGlmIChhdFNpZ24gIT09IC0xKSB7XG4gICAgICB0aGlzLmF1dGggPSBkZWNvZGVVUklDb21wb25lbnQocmVzdC5zbGljZSgwLCBhdFNpZ24pKTtcbiAgICAgIHN0YXJ0ID0gYXRTaWduICsgMTtcbiAgICB9XG4gICAgaWYgKG5vbkhvc3QgPT09IC0xKSB7XG4gICAgICB0aGlzLmhvc3QgPSByZXN0LnNsaWNlKHN0YXJ0KTtcbiAgICAgIHJlc3QgPSAnJztcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZShzdGFydCwgbm9uSG9zdCk7XG4gICAgICByZXN0ID0gcmVzdC5zbGljZShub25Ib3N0KTtcbiAgICB9XG5cbiAgICAvLyBwdWxsIG91dCBwb3J0LlxuICAgIHRoaXMucGFyc2VIb3N0KCk7XG5cbiAgICAvLyB3ZSd2ZSBpbmRpY2F0ZWQgdGhhdCB0aGVyZSBpcyBhIGhvc3RuYW1lLFxuICAgIC8vIHNvIGV2ZW4gaWYgaXQncyBlbXB0eSwgaXQgaGFzIHRvIGJlIHByZXNlbnQuXG4gICAgaWYgKHR5cGVvZiB0aGlzLmhvc3RuYW1lICE9PSAnc3RyaW5nJykgdGhpcy5ob3N0bmFtZSA9ICcnO1xuXG4gICAgdmFyIGhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcblxuICAgIC8vIGlmIGhvc3RuYW1lIGJlZ2lucyB3aXRoIFsgYW5kIGVuZHMgd2l0aCBdXG4gICAgLy8gYXNzdW1lIHRoYXQgaXQncyBhbiBJUHY2IGFkZHJlc3MuXG4gICAgdmFyIGlwdjZIb3N0bmFtZSA9XG4gICAgICBob3N0bmFtZS5jaGFyQ29kZUF0KDApID09PSA5MSAvKlsqLyAmJiBob3N0bmFtZS5jaGFyQ29kZUF0KGhvc3RuYW1lLmxlbmd0aCAtIDEpID09PSA5MzsgLypdKi9cblxuICAgIC8vIHZhbGlkYXRlIGEgbGl0dGxlLlxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB2YWxpZGF0ZUhvc3RuYW1lKHRoaXMsIHJlc3QsIGhvc3RuYW1lKTtcbiAgICAgIGlmIChyZXN1bHQgIT09IHVuZGVmaW5lZCkgcmVzdCA9IHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBob3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueWNvZGVkIHJlcHJlc2VudGF0aW9uIG9mIFwiZG9tYWluXCIuXG4gICAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgICAvLyBoYXZlIG5vbi1BU0NJSSBjaGFyYWN0ZXJzLCBpLmUuIGl0IGRvZXNuJ3QgbWF0dGVyIGlmXG4gICAgICAvLyB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQgYWxyZWFkeSBpcyBBU0NJSS1vbmx5LlxuICAgICAgdGhpcy5ob3N0bmFtZSA9IHB1bnljb2RlLnRvQVNDSUkodGhpcy5ob3N0bmFtZSk7XG4gICAgfVxuXG4gICAgdmFyIHAgPSB0aGlzLnBvcnQgPyAnOicgKyB0aGlzLnBvcnQgOiAnJztcbiAgICB2YXIgaCA9IHRoaXMuaG9zdG5hbWUgfHwgJyc7XG4gICAgdGhpcy5ob3N0ID0gaCArIHA7XG5cbiAgICAvLyBzdHJpcCBbIGFuZCBdIGZyb20gdGhlIGhvc3RuYW1lXG4gICAgLy8gdGhlIGhvc3QgZmllbGQgc3RpbGwgcmV0YWlucyB0aGVtLCB0aG91Z2hcbiAgICBpZiAoaXB2Nkhvc3RuYW1lKSB7XG4gICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS5zbGljZSgxLCAtMSk7XG4gICAgICBpZiAocmVzdFswXSAhPT0gJy8nKSB7XG4gICAgICAgIHJlc3QgPSAnLycgKyByZXN0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG5vdyByZXN0IGlzIHNldCB0byB0aGUgcG9zdC1ob3N0IHN0dWZmLlxuICAvLyBjaG9wIG9mZiBhbnkgZGVsaW0gY2hhcnMuXG4gIGlmICghdW5zYWZlUHJvdG9jb2xbbG93ZXJQcm90b10pIHtcbiAgICAvLyBGaXJzdCwgbWFrZSAxMDAlIHN1cmUgdGhhdCBhbnkgXCJhdXRvRXNjYXBlXCIgY2hhcnMgZ2V0XG4gICAgLy8gZXNjYXBlZCwgZXZlbiBpZiBlbmNvZGVVUklDb21wb25lbnQgZG9lc24ndCB0aGluayB0aGV5XG4gICAgLy8gbmVlZCB0byBiZS5cbiAgICBjb25zdCByZXN1bHQgPSBhdXRvRXNjYXBlU3RyKHJlc3QpO1xuICAgIGlmIChyZXN1bHQgIT09IHVuZGVmaW5lZCkgcmVzdCA9IHJlc3VsdDtcbiAgfVxuXG4gIHZhciBxdWVzdGlvbklkeCA9IC0xO1xuICB2YXIgaGFzaElkeCA9IC0xO1xuICBmb3IgKGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgIGNvbnN0IGNvZGUgPSByZXN0LmNoYXJDb2RlQXQoaSk7XG4gICAgaWYgKGNvZGUgPT09IDM1IC8qIyovKSB7XG4gICAgICB0aGlzLmhhc2ggPSByZXN0LnNsaWNlKGkpO1xuICAgICAgaGFzaElkeCA9IGk7XG4gICAgICBicmVhaztcbiAgICB9IGVsc2UgaWYgKGNvZGUgPT09IDYzIC8qPyovICYmIHF1ZXN0aW9uSWR4ID09PSAtMSkge1xuICAgICAgcXVlc3Rpb25JZHggPSBpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVzdGlvbklkeCAhPT0gLTEpIHtcbiAgICBpZiAoaGFzaElkeCA9PT0gLTEpIHtcbiAgICAgIHRoaXMuc2VhcmNoID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCk7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnNlYXJjaCA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHgsIGhhc2hJZHgpO1xuICAgICAgdGhpcy5xdWVyeSA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHggKyAxLCBoYXNoSWR4KTtcbiAgICB9XG4gICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnF1ZXJ5KTtcbiAgICB9XG4gIH0gZWxzZSBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgIC8vIG5vIHF1ZXJ5IHN0cmluZywgYnV0IHBhcnNlUXVlcnlTdHJpbmcgc3RpbGwgcmVxdWVzdGVkXG4gICAgdGhpcy5zZWFyY2ggPSAnJztcbiAgICB0aGlzLnF1ZXJ5ID0ge307XG4gIH1cblxuICB2YXIgZmlyc3RJZHggPVxuICAgIHF1ZXN0aW9uSWR4ICE9PSAtMSAmJiAoaGFzaElkeCA9PT0gLTEgfHwgcXVlc3Rpb25JZHggPCBoYXNoSWR4KSA/IHF1ZXN0aW9uSWR4IDogaGFzaElkeDtcbiAgaWYgKGZpcnN0SWR4ID09PSAtMSkge1xuICAgIGlmIChyZXN0Lmxlbmd0aCA+IDApIHRoaXMucGF0aG5hbWUgPSByZXN0O1xuICB9IGVsc2UgaWYgKGZpcnN0SWR4ID4gMCkge1xuICAgIHRoaXMucGF0aG5hbWUgPSByZXN0LnNsaWNlKDAsIGZpcnN0SWR4KTtcbiAgfVxuICBpZiAoc2xhc2hlZFByb3RvY29sW2xvd2VyUHJvdG9dICYmIHRoaXMuaG9zdG5hbWUgJiYgIXRoaXMucGF0aG5hbWUpIHtcbiAgICB0aGlzLnBhdGhuYW1lID0gJy8nO1xuICB9XG5cbiAgLy8gdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgaWYgKHRoaXMucGF0aG5hbWUgfHwgdGhpcy5zZWFyY2gpIHtcbiAgICBjb25zdCBwID0gdGhpcy5wYXRobmFtZSB8fCAnJztcbiAgICBjb25zdCBzID0gdGhpcy5zZWFyY2ggfHwgJyc7XG4gICAgdGhpcy5wYXRoID0gcCArIHM7XG4gIH1cblxuICAvLyBmaW5hbGx5LCByZWNvbnN0cnVjdCB0aGUgaHJlZiBiYXNlZCBvbiB3aGF0IGhhcyBiZWVuIHZhbGlkYXRlZC5cbiAgdGhpcy5ocmVmID0gdGhpcy5mb3JtYXQoKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdmFsaWRhdGVIb3N0bmFtZShzZWxmLCByZXN0LCBob3N0bmFtZSkge1xuICBmb3IgKHZhciBpID0gMCwgbGFzdFBvczsgaSA8PSBob3N0bmFtZS5sZW5ndGg7ICsraSkge1xuICAgIHZhciBjb2RlO1xuICAgIGlmIChpIDwgaG9zdG5hbWUubGVuZ3RoKSBjb2RlID0gaG9zdG5hbWUuY2hhckNvZGVBdChpKTtcbiAgICBpZiAoY29kZSA9PT0gNDYgLyouKi8gfHwgaSA9PT0gaG9zdG5hbWUubGVuZ3RoKSB7XG4gICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7XG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDYzKSB7XG4gICAgICAgICAgc2VsZi5ob3N0bmFtZSA9IGhvc3RuYW1lLnNsaWNlKDAsIGxhc3RQb3MgKyA2Myk7XG4gICAgICAgICAgcmV0dXJuICcvJyArIGhvc3RuYW1lLnNsaWNlKGxhc3RQb3MgKyA2MykgKyByZXN0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgKGNvZGUgPj0gNDggLyowKi8gJiYgY29kZSA8PSA1NykgLyo5Ki8gfHxcbiAgICAgIChjb2RlID49IDk3IC8qYSovICYmIGNvZGUgPD0gMTIyKSAvKnoqLyB8fFxuICAgICAgY29kZSA9PT0gNDUgLyotKi8gfHxcbiAgICAgIChjb2RlID49IDY1IC8qQSovICYmIGNvZGUgPD0gOTApIC8qWiovIHx8XG4gICAgICBjb2RlID09PSA0MyAvKisqLyB8fFxuICAgICAgY29kZSA9PT0gOTUgLypfKi8gfHxcbiAgICAgIC8qIEJFR0lOIE1PTkdPIFVSSSBQQVRDSCAqL1xuICAgICAgY29kZSA9PT0gNDQgLyosKi8gfHxcbiAgICAgIGNvZGUgPT09IDU4IC8qOiovIHx8XG4gICAgICAvKiBFTkQgTU9OR08gVVJJIFBBVENIICovXG4gICAgICBjb2RlID4gMTI3XG4gICAgKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gSW52YWxpZCBob3N0IGNoYXJhY3RlclxuICAgIHNlbGYuaG9zdG5hbWUgPSBob3N0bmFtZS5zbGljZSgwLCBpKTtcbiAgICBpZiAoaSA8IGhvc3RuYW1lLmxlbmd0aCkgcmV0dXJuICcvJyArIGhvc3RuYW1lLnNsaWNlKGkpICsgcmVzdDtcbiAgICBicmVhaztcbiAgfVxufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gYXV0b0VzY2FwZVN0cihyZXN0KSB7XG4gIHZhciBuZXdSZXN0ID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgLy8gQXV0b21hdGljYWxseSBlc2NhcGUgYWxsIGRlbGltaXRlcnMgYW5kIHVud2lzZSBjaGFyYWN0ZXJzIGZyb20gUkZDIDIzOTZcbiAgICAvLyBBbHNvIGVzY2FwZSBzaW5nbGUgcXVvdGVzIGluIGNhc2Ugb2YgYW4gWFNTIGF0dGFja1xuICAgIHN3aXRjaCAocmVzdC5jaGFyQ29kZUF0KGkpKSB7XG4gICAgICBjYXNlIDk6IC8vICdcXHQnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTA5JztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTA6IC8vICdcXG4nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTBBJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTM6IC8vICdcXHInXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTBEJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzI6IC8vICcgJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyMCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM0OiAvLyAnXCInXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTIyJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzk6IC8vICdcXCcnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTI3JztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjA6IC8vICc8J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUzQyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYyOiAvLyAnPidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclM0UnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5MjogLy8gJ1xcXFwnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTVDJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgOTQ6IC8vICdeJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU1RSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDk2OiAvLyAnYCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclNjAnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjM6IC8vICd7J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU3Qic7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEyNDogLy8gJ3wnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTdDJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTI1OiAvLyAnfSdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclN0QnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAobGFzdFBvcyA9PT0gMCkgcmV0dXJuO1xuICBpZiAobGFzdFBvcyA8IHJlc3QubGVuZ3RoKSByZXR1cm4gbmV3UmVzdCArIHJlc3Quc2xpY2UobGFzdFBvcyk7XG4gIGVsc2UgcmV0dXJuIG5ld1Jlc3Q7XG59XG5cbi8vIGZvcm1hdCBhIHBhcnNlZCBvYmplY3QgaW50byBhIHVybCBzdHJpbmdcbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxGb3JtYXQob2JqKSB7XG4gIC8vIGVuc3VyZSBpdCdzIGFuIG9iamVjdCwgYW5kIG5vdCBhIHN0cmluZyB1cmwuXG4gIC8vIElmIGl0J3MgYW4gb2JqLCB0aGlzIGlzIGEgbm8tb3AuXG4gIC8vIHRoaXMgd2F5LCB5b3UgY2FuIGNhbGwgdXJsX2Zvcm1hdCgpIG9uIHN0cmluZ3NcbiAgLy8gdG8gY2xlYW4gdXAgcG90ZW50aWFsbHkgd29ua3kgdXJscy5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdzdHJpbmcnKSBvYmogPSB1cmxQYXJzZShvYmopO1xuICBlbHNlIGlmICh0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JyB8fCBvYmogPT09IG51bGwpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICdQYXJhbWV0ZXIgXCJ1cmxPYmpcIiBtdXN0IGJlIGFuIG9iamVjdCwgbm90ICcgKyBvYmogPT09IG51bGwgPyAnbnVsbCcgOiB0eXBlb2Ygb2JqXG4gICAgKTtcbiAgZWxzZSBpZiAoIShvYmogaW5zdGFuY2VvZiBVcmwpKSByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuXG4gIHJldHVybiBvYmouZm9ybWF0KCk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGF1dGggPSB0aGlzLmF1dGggfHwgJyc7XG4gIGlmIChhdXRoKSB7XG4gICAgYXV0aCA9IGVuY29kZUF1dGgoYXV0aCk7XG4gICAgYXV0aCArPSAnQCc7XG4gIH1cblxuICB2YXIgcHJvdG9jb2wgPSB0aGlzLnByb3RvY29sIHx8ICcnO1xuICB2YXIgcGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lIHx8ICcnO1xuICB2YXIgaGFzaCA9IHRoaXMuaGFzaCB8fCAnJztcbiAgdmFyIGhvc3QgPSBmYWxzZTtcbiAgdmFyIHF1ZXJ5ID0gJyc7XG5cbiAgaWYgKHRoaXMuaG9zdCkge1xuICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICB9IGVsc2UgaWYgKHRoaXMuaG9zdG5hbWUpIHtcbiAgICBob3N0ID0gYXV0aCArICh0aGlzLmhvc3RuYW1lLmluZGV4T2YoJzonKSA9PT0gLTEgPyB0aGlzLmhvc3RuYW1lIDogJ1snICsgdGhpcy5ob3N0bmFtZSArICddJyk7XG4gICAgaWYgKHRoaXMucG9ydCkge1xuICAgICAgaG9zdCArPSAnOicgKyB0aGlzLnBvcnQ7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkgIT09IG51bGwgJiYgdHlwZW9mIHRoaXMucXVlcnkgPT09ICdvYmplY3QnKVxuICAgIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHRoaXMucXVlcnkpO1xuXG4gIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCAocXVlcnkgJiYgJz8nICsgcXVlcnkpIHx8ICcnO1xuXG4gIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5jaGFyQ29kZUF0KHByb3RvY29sLmxlbmd0aCAtIDEpICE9PSA1OCAvKjoqLykgcHJvdG9jb2wgKz0gJzonO1xuXG4gIHZhciBuZXdQYXRobmFtZSA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGF0aG5hbWUubGVuZ3RoOyArK2kpIHtcbiAgICBzd2l0Y2ggKHBhdGhuYW1lLmNoYXJDb2RlQXQoaSkpIHtcbiAgICAgIGNhc2UgMzU6IC8vICcjJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdQYXRobmFtZSArPSBwYXRobmFtZS5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UGF0aG5hbWUgKz0gJyUyMyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYzOiAvLyAnPydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UGF0aG5hbWUgKz0gcGF0aG5hbWUuc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1BhdGhuYW1lICs9ICclM0YnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAobGFzdFBvcyA+IDApIHtcbiAgICBpZiAobGFzdFBvcyAhPT0gcGF0aG5hbWUubGVuZ3RoKSBwYXRobmFtZSA9IG5ld1BhdGhuYW1lICsgcGF0aG5hbWUuc2xpY2UobGFzdFBvcyk7XG4gICAgZWxzZSBwYXRobmFtZSA9IG5ld1BhdGhuYW1lO1xuICB9XG5cbiAgLy8gb25seSB0aGUgc2xhc2hlZFByb3RvY29scyBnZXQgdGhlIC8vLiAgTm90IG1haWx0bzosIHhtcHA6LCBldGMuXG4gIC8vIHVubGVzcyB0aGV5IGhhZCB0aGVtIHRvIGJlZ2luIHdpdGguXG4gIGlmICh0aGlzLnNsYXNoZXMgfHwgKCghcHJvdG9jb2wgfHwgc2xhc2hlZFByb3RvY29sW3Byb3RvY29sXSkgJiYgaG9zdCAhPT0gZmFsc2UpKSB7XG4gICAgaG9zdCA9ICcvLycgKyAoaG9zdCB8fCAnJyk7XG4gICAgaWYgKHBhdGhuYW1lICYmIHBhdGhuYW1lLmNoYXJDb2RlQXQoMCkgIT09IDQ3IC8qLyovKSBwYXRobmFtZSA9ICcvJyArIHBhdGhuYW1lO1xuICB9IGVsc2UgaWYgKCFob3N0KSB7XG4gICAgaG9zdCA9ICcnO1xuICB9XG5cbiAgc2VhcmNoID0gc2VhcmNoLnJlcGxhY2UoJyMnLCAnJTIzJyk7XG5cbiAgaWYgKGhhc2ggJiYgaGFzaC5jaGFyQ29kZUF0KDApICE9PSAzNSAvKiMqLykgaGFzaCA9ICcjJyArIGhhc2g7XG4gIGlmIChzZWFyY2ggJiYgc2VhcmNoLmNoYXJDb2RlQXQoMCkgIT09IDYzIC8qPyovKSBzZWFyY2ggPSAnPycgKyBzZWFyY2g7XG5cbiAgcmV0dXJuIHByb3RvY29sICsgaG9zdCArIHBhdGhuYW1lICsgc2VhcmNoICsgaGFzaDtcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxSZXNvbHZlKHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgcmV0dXJuIHVybFBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmUocmVsYXRpdmUpO1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5yZXNvbHZlID0gZnVuY3Rpb24gKHJlbGF0aXZlKSB7XG4gIHJldHVybiB0aGlzLnJlc29sdmVPYmplY3QodXJsUGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUmVzb2x2ZU9iamVjdChzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIGlmICghc291cmNlKSByZXR1cm4gcmVsYXRpdmU7XG4gIHJldHVybiB1cmxQYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlT2JqZWN0KHJlbGF0aXZlKTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uIChyZWxhdGl2ZSkge1xuICBpZiAodHlwZW9mIHJlbGF0aXZlID09PSAnc3RyaW5nJykge1xuICAgIHZhciByZWwgPSBuZXcgVXJsKCk7XG4gICAgcmVsLnBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSk7XG4gICAgcmVsYXRpdmUgPSByZWw7XG4gIH1cblxuICB2YXIgcmVzdWx0ID0gbmV3IFVybCgpO1xuICB2YXIgdGtleXMgPSBPYmplY3Qua2V5cyh0aGlzKTtcbiAgZm9yICh2YXIgdGsgPSAwOyB0ayA8IHRrZXlzLmxlbmd0aDsgdGsrKykge1xuICAgIHZhciB0a2V5ID0gdGtleXNbdGtdO1xuICAgIHJlc3VsdFt0a2V5XSA9IHRoaXNbdGtleV07XG4gIH1cblxuICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgLy8gZXZlbiBocmVmPVwiXCIgd2lsbCByZW1vdmUgaXQuXG4gIHJlc3VsdC5oYXNoID0gcmVsYXRpdmUuaGFzaDtcblxuICAvLyBpZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlJ3Mgbm90aGluZyBsZWZ0IHRvIGRvIGhlcmUuXG4gIGlmIChyZWxhdGl2ZS5ocmVmID09PSAnJykge1xuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBocmVmcyBsaWtlIC8vZm9vL2JhciBhbHdheXMgY3V0IHRvIHRoZSBwcm90b2NvbC5cbiAgaWYgKHJlbGF0aXZlLnNsYXNoZXMgJiYgIXJlbGF0aXZlLnByb3RvY29sKSB7XG4gICAgLy8gdGFrZSBldmVyeXRoaW5nIGV4Y2VwdCB0aGUgcHJvdG9jb2wgZnJvbSByZWxhdGl2ZVxuICAgIHZhciBya2V5cyA9IE9iamVjdC5rZXlzKHJlbGF0aXZlKTtcbiAgICBmb3IgKHZhciByayA9IDA7IHJrIDwgcmtleXMubGVuZ3RoOyByaysrKSB7XG4gICAgICB2YXIgcmtleSA9IHJrZXlzW3JrXTtcbiAgICAgIGlmIChya2V5ICE9PSAncHJvdG9jb2wnKSByZXN1bHRbcmtleV0gPSByZWxhdGl2ZVtya2V5XTtcbiAgICB9XG5cbiAgICAvL3VybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXSAmJiByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgcmVzdWx0LnBhdGggPSByZXN1bHQucGF0aG5hbWUgPSAnLyc7XG4gICAgfVxuXG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmIChyZWxhdGl2ZS5wcm90b2NvbCAmJiByZWxhdGl2ZS5wcm90b2NvbCAhPT0gcmVzdWx0LnByb3RvY29sKSB7XG4gICAgLy8gaWYgaXQncyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgIC8vIHRoZSBwcm90b2NvbCBkb2VzIHdlaXJkIHRoaW5nc1xuICAgIC8vIGZpcnN0LCBpZiBpdCdzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgIC8vIGFuZCBpZiB0aGVyZSB3YXMgYSBwYXRoXG4gICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgLy8gYmVjYXVzZSB0aGF0J3Mga25vd24gdG8gYmUgaG9zdGxlc3MuXG4gICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgIGlmICghc2xhc2hlZFByb3RvY29sW3JlbGF0aXZlLnByb3RvY29sXSkge1xuICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhyZWxhdGl2ZSk7XG4gICAgICBmb3IgKHZhciB2ID0gMDsgdiA8IGtleXMubGVuZ3RoOyB2KyspIHtcbiAgICAgICAgdmFyIGsgPSBrZXlzW3ZdO1xuICAgICAgICByZXN1bHRba10gPSByZWxhdGl2ZVtrXTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICByZXN1bHQucHJvdG9jb2wgPSByZWxhdGl2ZS5wcm90b2NvbDtcbiAgICBpZiAoXG4gICAgICAhcmVsYXRpdmUuaG9zdCAmJlxuICAgICAgIS9eZmlsZTo/JC8udGVzdChyZWxhdGl2ZS5wcm90b2NvbCkgJiZcbiAgICAgICFob3N0bGVzc1Byb3RvY29sW3JlbGF0aXZlLnByb3RvY29sXVxuICAgICkge1xuICAgICAgY29uc3QgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCAnJykuc3BsaXQoJy8nKTtcbiAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9ICcnO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0bmFtZSkgcmVsYXRpdmUuaG9zdG5hbWUgPSAnJztcbiAgICAgIGlmIChyZWxQYXRoWzBdICE9PSAnJykgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdCgnJyk7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxQYXRoLmpvaW4oJy8nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsYXRpdmUucGF0aG5hbWU7XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8ICcnO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSByZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0O1xuICAgIHJlc3VsdC5wb3J0ID0gcmVsYXRpdmUucG9ydDtcbiAgICAvLyB0byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQucGF0aG5hbWUgfHwgcmVzdWx0LnNlYXJjaCkge1xuICAgICAgdmFyIHAgPSByZXN1bHQucGF0aG5hbWUgfHwgJyc7XG4gICAgICB2YXIgcyA9IHJlc3VsdC5zZWFyY2ggfHwgJyc7XG4gICAgICByZXN1bHQucGF0aCA9IHAgKyBzO1xuICAgIH1cbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHZhciBpc1NvdXJjZUFicyA9IHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuY2hhckF0KDApID09PSAnLyc7XG4gIHZhciBpc1JlbEFicyA9IHJlbGF0aXZlLmhvc3QgfHwgKHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nKTtcbiAgdmFyIG11c3RFbmRBYnMgPSBpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fCAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpO1xuICB2YXIgcmVtb3ZlQWxsRG90cyA9IG11c3RFbmRBYnM7XG4gIHZhciBzcmNQYXRoID0gKHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuc3BsaXQoJy8nKSkgfHwgW107XG4gIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLnNwbGl0KCcvJykpIHx8IFtdO1xuICB2YXIgcHN5Y2hvdGljID0gcmVzdWx0LnByb3RvY29sICYmICFzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXTtcblxuICAvLyBpZiB0aGUgdXJsIGlzIGEgbm9uLXNsYXNoZWQgdXJsLCB0aGVuIHJlbGF0aXZlXG4gIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgLy8gdG8gY3Jhd2wgdXAgdG8gdGhlIGhvc3RuYW1lLCBhcyB3ZWxsLiAgVGhpcyBpcyBzdHJhbmdlLlxuICAvLyByZXN1bHQucHJvdG9jb2wgaGFzIGFscmVhZHkgYmVlbiBzZXQgYnkgbm93LlxuICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgaWYgKHBzeWNob3RpYykge1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9ICcnO1xuICAgIHJlc3VsdC5wb3J0ID0gbnVsbDtcbiAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgIGlmIChzcmNQYXRoWzBdID09PSAnJykgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0O1xuICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQocmVzdWx0Lmhvc3QpO1xuICAgIH1cbiAgICByZXN1bHQuaG9zdCA9ICcnO1xuICAgIGlmIChyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBudWxsO1xuICAgICAgcmVsYXRpdmUucG9ydCA9IG51bGw7XG4gICAgICBpZiAocmVsYXRpdmUuaG9zdCkge1xuICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gJycpIHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICBlbHNlIHJlbFBhdGgudW5zaGlmdChyZWxhdGl2ZS5ob3N0KTtcbiAgICAgIH1cbiAgICAgIHJlbGF0aXZlLmhvc3QgPSBudWxsO1xuICAgIH1cbiAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gJycgfHwgc3JjUGF0aFswXSA9PT0gJycpO1xuICB9XG5cbiAgaWYgKGlzUmVsQWJzKSB7XG4gICAgLy8gaXQncyBhYnNvbHV0ZS5cbiAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgcmVsYXRpdmUuaG9zdCA9PT0gJycgPyByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID1cbiAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3RuYW1lID09PSAnJyA/IHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBpdCdzIHJlbGF0aXZlXG4gICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgc3JjUGF0aC5wb3AoKTtcbiAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgfSBlbHNlIGlmIChyZWxhdGl2ZS5zZWFyY2ggIT09IG51bGwgJiYgcmVsYXRpdmUuc2VhcmNoICE9PSB1bmRlZmluZWQpIHtcbiAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgLy8gbGlrZSBocmVmPSc/Zm9vJy5cbiAgICAvLyBQdXQgdGhpcyBhZnRlciB0aGUgb3RoZXIgdHdvIGNhc2VzIGJlY2F1c2UgaXQgc2ltcGxpZmllcyB0aGUgYm9vbGVhbnNcbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGguc2hpZnQoKTtcbiAgICAgIC8vb2NjYXNpb25hbGx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgICAvL3RoaXMgZXNwZWNpYWxseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICBjb25zdCBhdXRoSW5Ib3N0ID1cbiAgICAgICAgcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZignQCcpID4gMCA/IHJlc3VsdC5ob3N0LnNwbGl0KCdAJykgOiBmYWxzZTtcbiAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICAvL3RvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5wYXRobmFtZSAhPT0gbnVsbCB8fCByZXN1bHQuc2VhcmNoICE9PSBudWxsKSB7XG4gICAgICByZXN1bHQucGF0aCA9IChyZXN1bHQucGF0aG5hbWUgPyByZXN1bHQucGF0aG5hbWUgOiAnJykgKyAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiAnJyk7XG4gICAgfVxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgLy8gbm8gcGF0aCBhdCBhbGwuICBlYXN5LlxuICAgIC8vIHdlJ3ZlIGFscmVhZHkgaGFuZGxlZCB0aGUgb3RoZXIgc3R1ZmYgYWJvdmUuXG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAvL3RvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5zZWFyY2gpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gJy8nICsgcmVzdWx0LnNlYXJjaDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnBhdGggPSBudWxsO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaWYgYSB1cmwgRU5EcyBpbiAuIG9yIC4uLCB0aGVuIGl0IG11c3QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIC8vIGhvd2V2ZXIsIGlmIGl0IGVuZHMgaW4gYW55dGhpbmcgZWxzZSBub24tc2xhc2h5LFxuICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICB2YXIgbGFzdCA9IHNyY1BhdGguc2xpY2UoLTEpWzBdO1xuICB2YXIgaGFzVHJhaWxpbmdTbGFzaCA9XG4gICAgKChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0IHx8IHNyY1BhdGgubGVuZ3RoID4gMSkgJiYgKGxhc3QgPT09ICcuJyB8fCBsYXN0ID09PSAnLi4nKSkgfHxcbiAgICBsYXN0ID09PSAnJztcblxuICAvLyBzdHJpcCBzaW5nbGUgZG90cywgcmVzb2x2ZSBkb3VibGUgZG90cyB0byBwYXJlbnQgZGlyXG4gIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gIHZhciB1cCA9IDA7XG4gIGZvciAodmFyIGkgPSBzcmNQYXRoLmxlbmd0aDsgaSA+PSAwOyBpLS0pIHtcbiAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBzcGxpY2VPbmUoc3JjUGF0aCwgaSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBzcGxpY2VPbmUoc3JjUGF0aCwgaSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHNwbGljZU9uZShzcmNQYXRoLCBpKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoIW11c3RFbmRBYnMgJiYgIXJlbW92ZUFsbERvdHMpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHNyY1BhdGgudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSAnJyAmJiAoIXNyY1BhdGhbMF0gfHwgc3JjUGF0aFswXS5jaGFyQXQoMCkgIT09ICcvJykpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKGhhc1RyYWlsaW5nU2xhc2ggJiYgc3JjUGF0aC5qb2luKCcvJykuc3Vic3RyKC0xKSAhPT0gJy8nKSB7XG4gICAgc3JjUGF0aC5wdXNoKCcnKTtcbiAgfVxuXG4gIHZhciBpc0Fic29sdXRlID0gc3JjUGF0aFswXSA9PT0gJycgfHwgKHNyY1BhdGhbMF0gJiYgc3JjUGF0aFswXS5jaGFyQXQoMCkgPT09ICcvJyk7XG5cbiAgLy8gcHV0IHRoZSBob3N0IGJhY2tcbiAgaWYgKHBzeWNob3RpYykge1xuICAgIGlmIChpc0Fic29sdXRlKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9ICcnO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogJyc7XG4gICAgfVxuICAgIC8vb2NjYXNpb25hbGx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgLy90aGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgLy91cmwucmVzb2x2ZU9iamVjdCgnbWFpbHRvOmxvY2FsMUBkb21haW4xJywgJ2xvY2FsMkBkb21haW4yJylcbiAgICBjb25zdCBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZignQCcpID4gMCA/IHJlc3VsdC5ob3N0LnNwbGl0KCdAJykgOiBmYWxzZTtcbiAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICB9XG4gIH1cblxuICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyB8fCAocmVzdWx0Lmhvc3QgJiYgc3JjUGF0aC5sZW5ndGgpO1xuXG4gIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgfSBlbHNlIHtcbiAgICByZXN1bHQucGF0aG5hbWUgPSBzcmNQYXRoLmpvaW4oJy8nKTtcbiAgfVxuXG4gIC8vdG8gc3VwcG9ydCByZXF1ZXN0Lmh0dHBcbiAgaWYgKHJlc3VsdC5wYXRobmFtZSAhPT0gbnVsbCB8fCByZXN1bHQuc2VhcmNoICE9PSBudWxsKSB7XG4gICAgcmVzdWx0LnBhdGggPSAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICsgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICB9XG4gIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnBhcnNlSG9zdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGhvc3QgPSB0aGlzLmhvc3Q7XG4gIHZhciBwb3J0ID0gcG9ydFBhdHRlcm4uZXhlYyhob3N0KTtcbiAgaWYgKHBvcnQpIHtcbiAgICBwb3J0ID0gcG9ydFswXTtcbiAgICBpZiAocG9ydCAhPT0gJzonKSB7XG4gICAgICB0aGlzLnBvcnQgPSBwb3J0LnNsaWNlKDEpO1xuICAgIH1cbiAgICBob3N0ID0gaG9zdC5zbGljZSgwLCBob3N0Lmxlbmd0aCAtIHBvcnQubGVuZ3RoKTtcbiAgfVxuICBpZiAoaG9zdCkgdGhpcy5ob3N0bmFtZSA9IGhvc3Q7XG59O1xuXG4vLyBBYm91dCAxLjV4IGZhc3RlciB0aGFuIHRoZSB0d28tYXJnIHZlcnNpb24gb2YgQXJyYXkjc3BsaWNlKCkuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gc3BsaWNlT25lKGxpc3QsIGluZGV4KSB7XG4gIGZvciAodmFyIGkgPSBpbmRleCwgayA9IGkgKyAxLCBuID0gbGlzdC5sZW5ndGg7IGsgPCBuOyBpICs9IDEsIGsgKz0gMSkgbGlzdFtpXSA9IGxpc3Rba107XG4gIGxpc3QucG9wKCk7XG59XG5cbnZhciBoZXhUYWJsZSA9IG5ldyBBcnJheSgyNTYpO1xuZm9yICh2YXIgaSA9IDA7IGkgPCAyNTY7ICsraSlcbiAgaGV4VGFibGVbaV0gPSAnJScgKyAoKGkgPCAxNiA/ICcwJyA6ICcnKSArIGkudG9TdHJpbmcoMTYpKS50b1VwcGVyQ2FzZSgpO1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIGVuY29kZUF1dGgoc3RyKSB7XG4gIC8vIGZhc3RlciBlbmNvZGVVUklDb21wb25lbnQgYWx0ZXJuYXRpdmUgZm9yIGVuY29kaW5nIGF1dGggdXJpIGNvbXBvbmVudHNcbiAgdmFyIG91dCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGMgPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgIC8vIFRoZXNlIGNoYXJhY3RlcnMgZG8gbm90IG5lZWQgZXNjYXBpbmc6XG4gICAgLy8gISAtIC4gXyB+XG4gICAgLy8gJyAoICkgKiA6XG4gICAgLy8gZGlnaXRzXG4gICAgLy8gYWxwaGEgKHVwcGVyY2FzZSlcbiAgICAvLyBhbHBoYSAobG93ZXJjYXNlKVxuICAgIGlmIChcbiAgICAgIGMgPT09IDB4MjEgfHxcbiAgICAgIGMgPT09IDB4MmQgfHxcbiAgICAgIGMgPT09IDB4MmUgfHxcbiAgICAgIGMgPT09IDB4NWYgfHxcbiAgICAgIGMgPT09IDB4N2UgfHxcbiAgICAgIChjID49IDB4MjcgJiYgYyA8PSAweDJhKSB8fFxuICAgICAgKGMgPj0gMHgzMCAmJiBjIDw9IDB4M2EpIHx8XG4gICAgICAoYyA+PSAweDQxICYmIGMgPD0gMHg1YSkgfHxcbiAgICAgIChjID49IDB4NjEgJiYgYyA8PSAweDdhKVxuICAgICkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgb3V0ICs9IHN0ci5zbGljZShsYXN0UG9zLCBpKTtcblxuICAgIGxhc3RQb3MgPSBpICsgMTtcblxuICAgIC8vIE90aGVyIEFTQ0lJIGNoYXJhY3RlcnNcbiAgICBpZiAoYyA8IDB4ODApIHtcbiAgICAgIG91dCArPSBoZXhUYWJsZVtjXTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIE11bHRpLWJ5dGUgY2hhcmFjdGVycyAuLi5cbiAgICBpZiAoYyA8IDB4ODAwKSB7XG4gICAgICBvdXQgKz0gaGV4VGFibGVbMHhjMCB8IChjID4+IDYpXSArIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoYyA8IDB4ZDgwMCB8fCBjID49IDB4ZTAwMCkge1xuICAgICAgb3V0ICs9XG4gICAgICAgIGhleFRhYmxlWzB4ZTAgfCAoYyA+PiAxMildICtcbiAgICAgICAgaGV4VGFibGVbMHg4MCB8ICgoYyA+PiA2KSAmIDB4M2YpXSArXG4gICAgICAgIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICAvLyBTdXJyb2dhdGUgcGFpclxuICAgICsraTtcbiAgICB2YXIgYzI7XG4gICAgaWYgKGkgPCBzdHIubGVuZ3RoKSBjMiA9IHN0ci5jaGFyQ29kZUF0KGkpICYgMHgzZmY7XG4gICAgZWxzZSBjMiA9IDA7XG4gICAgYyA9IDB4MTAwMDAgKyAoKChjICYgMHgzZmYpIDw8IDEwKSB8IGMyKTtcbiAgICBvdXQgKz1cbiAgICAgIGhleFRhYmxlWzB4ZjAgfCAoYyA+PiAxOCldICtcbiAgICAgIGhleFRhYmxlWzB4ODAgfCAoKGMgPj4gMTIpICYgMHgzZildICtcbiAgICAgIGhleFRhYmxlWzB4ODAgfCAoKGMgPj4gNikgJiAweDNmKV0gK1xuICAgICAgaGV4VGFibGVbMHg4MCB8IChjICYgMHgzZildO1xuICB9XG4gIGlmIChsYXN0UG9zID09PSAwKSByZXR1cm4gc3RyO1xuICBpZiAobGFzdFBvcyA8IHN0ci5sZW5ndGgpIHJldHVybiBvdXQgKyBzdHIuc2xpY2UobGFzdFBvcyk7XG4gIHJldHVybiBvdXQ7XG59XG4iXX0=