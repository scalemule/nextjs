'use strict';

var money = require('@scalemule/money');
var headers = require('next/headers');
var server = require('next/server');
var ledvery = require('@scalemule/ledvery');
var crypto$1 = require('crypto');

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  __defProp(target, "default", { value: mod, enumerable: true }) ,
  mod
));

// node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "node_modules/semver/internal/constants.js"(exports$1, module) {
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/semver/internal/debug.js"(exports$1, module) {
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module.exports = debug;
  }
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/semver/internal/re.js"(exports$1, module) {
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports$1 = module.exports = {};
    var re = exports$1.re = [];
    var safeRe = exports$1.safeRe = [];
    var src = exports$1.src = [];
    var safeSrc = exports$1.safeSrc = [];
    var t = exports$1.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports$1.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports$1.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports$1.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/semver/internal/parse-options.js"(exports$1, module) {
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module.exports = parseOptions;
  }
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/semver/internal/identifiers.js"(exports$1, module) {
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/semver/classes/semver.js"(exports$1, module) {
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
                if (isNaN(this.prerelease[1])) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module.exports = SemVer;
  }
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/semver/functions/parse.js"(exports$1, module) {
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module.exports = parse;
  }
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/semver/functions/valid.js"(exports$1, module) {
    var parse = require_parse();
    var valid = (version, options) => {
      const v = parse(version, options);
      return v ? v.version : null;
    };
    module.exports = valid;
  }
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/semver/functions/clean.js"(exports$1, module) {
    var parse = require_parse();
    var clean = (version, options) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module.exports = clean;
  }
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/semver/functions/inc.js"(exports$1, module) {
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module.exports = inc;
  }
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/semver/functions/diff.js"(exports$1, module) {
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module.exports = diff;
  }
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/semver/functions/major.js"(exports$1, module) {
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module.exports = major;
  }
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/semver/functions/minor.js"(exports$1, module) {
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module.exports = minor;
  }
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/semver/functions/patch.js"(exports$1, module) {
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module.exports = patch;
  }
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/semver/functions/prerelease.js"(exports$1, module) {
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module.exports = prerelease;
  }
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/semver/functions/compare.js"(exports$1, module) {
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module.exports = compare;
  }
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/semver/functions/rcompare.js"(exports$1, module) {
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module.exports = rcompare;
  }
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/semver/functions/compare-loose.js"(exports$1, module) {
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module.exports = compareLoose;
  }
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/semver/functions/compare-build.js"(exports$1, module) {
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module.exports = compareBuild;
  }
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/semver/functions/sort.js"(exports$1, module) {
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module.exports = sort;
  }
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/semver/functions/rsort.js"(exports$1, module) {
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module.exports = rsort;
  }
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/semver/functions/gt.js"(exports$1, module) {
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module.exports = gt;
  }
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/semver/functions/lt.js"(exports$1, module) {
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module.exports = lt;
  }
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/semver/functions/eq.js"(exports$1, module) {
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module.exports = eq;
  }
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/semver/functions/neq.js"(exports$1, module) {
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module.exports = neq;
  }
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/semver/functions/gte.js"(exports$1, module) {
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module.exports = gte;
  }
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/semver/functions/lte.js"(exports$1, module) {
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module.exports = lte;
  }
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/semver/functions/cmp.js"(exports$1, module) {
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module.exports = cmp;
  }
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/semver/functions/coerce.js"(exports$1, module) {
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module.exports = coerce;
  }
});

// node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/semver/internal/lrucache.js"(exports$1, module) {
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module.exports = LRUCache;
  }
});

// node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/semver/classes/range.js"(exports$1, module) {
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result2 = [...rangeMap.values()];
        cache.set(memoKey, result2);
        return result2;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result2 = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result2 && remainingComparators.length) {
        result2 = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result2;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/semver/classes/comparator.js"(exports$1, module) {
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/semver/functions/satisfies.js"(exports$1, module) {
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module.exports = satisfies;
  }
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/semver/ranges/to-comparators.js"(exports$1, module) {
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module.exports = toComparators;
  }
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/semver/ranges/max-satisfying.js"(exports$1, module) {
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module.exports = maxSatisfying;
  }
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/semver/ranges/min-satisfying.js"(exports$1, module) {
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module.exports = minSatisfying;
  }
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/semver/ranges/min-version.js"(exports$1, module) {
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module.exports = minVersion;
  }
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/semver/ranges/valid.js"(exports$1, module) {
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module.exports = validRange;
  }
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/semver/ranges/outside.js"(exports$1, module) {
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module.exports = outside;
  }
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/semver/ranges/gtr.js"(exports$1, module) {
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module.exports = gtr;
  }
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/semver/ranges/ltr.js"(exports$1, module) {
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module.exports = ltr;
  }
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/semver/ranges/intersects.js"(exports$1, module) {
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module.exports = intersects;
  }
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/semver/ranges/simplify.js"(exports$1, module) {
    var satisfies = require_satisfies();
    var compare = require_compare();
    module.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/semver/ranges/subset.js"(exports$1, module) {
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !satisfies(gt.semver, String(c), options)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !satisfies(lt.semver, String(c), options)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module.exports = subset;
  }
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/semver/index.js"(exports$1, module) {
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// src/types/index.ts
var ScaleMuleApiError = class extends Error {
  constructor(error, status) {
    super(error.message);
    this.name = "ScaleMuleApiError";
    this.code = error.code;
    this.field = error.field;
    this.status = status;
  }
};

// src/server/context.ts
function validateIP(ip) {
  if (!ip) return void 0;
  const trimmed = ip.trim();
  if (!trimmed) return void 0;
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){0,6}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$/;
  const ipv4MappedRegex = /^::ffff:(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/i;
  if (ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed) || ipv4MappedRegex.test(trimmed)) {
    return trimmed;
  }
  return void 0;
}
function extractClientContext(request) {
  const headers2 = request.headers;
  let ip;
  const cfConnectingIp = headers2.get("cf-connecting-ip");
  if (cfConnectingIp) {
    ip = validateIP(cfConnectingIp);
  }
  if (!ip) {
    const doConnectingIp = headers2.get("do-connecting-ip");
    if (doConnectingIp) {
      ip = validateIP(doConnectingIp);
    }
  }
  if (!ip) {
    const realIp = headers2.get("x-real-ip");
    if (realIp) {
      ip = validateIP(realIp);
    }
  }
  if (!ip) {
    const forwardedFor = headers2.get("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const vercelForwarded = headers2.get("x-vercel-forwarded-for");
    if (vercelForwarded) {
      const firstIp = vercelForwarded.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const trueClientIp = headers2.get("true-client-ip");
    if (trueClientIp) {
      ip = validateIP(trueClientIp);
    }
  }
  if (!ip && request.ip) {
    ip = validateIP(request.ip);
  }
  const userAgent = headers2.get("user-agent") || void 0;
  const deviceFingerprint = headers2.get("x-device-fingerprint") || void 0;
  const referrer = headers2.get("referer") || void 0;
  return {
    ip,
    userAgent,
    deviceFingerprint,
    referrer
  };
}
function extractClientContextFromReq(req) {
  const headers2 = req.headers;
  const getHeader = (name) => {
    const value = headers2[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  };
  let ip;
  const cfConnectingIp = getHeader("cf-connecting-ip");
  if (cfConnectingIp) {
    ip = validateIP(cfConnectingIp);
  }
  if (!ip) {
    const doConnectingIp = getHeader("do-connecting-ip");
    if (doConnectingIp) {
      ip = validateIP(doConnectingIp);
    }
  }
  if (!ip) {
    const realIp = getHeader("x-real-ip");
    if (realIp) {
      ip = validateIP(realIp);
    }
  }
  if (!ip) {
    const forwardedFor = getHeader("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const vercelForwarded = getHeader("x-vercel-forwarded-for");
    if (vercelForwarded) {
      const firstIp = vercelForwarded.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const trueClientIp = getHeader("true-client-ip");
    if (trueClientIp) {
      ip = validateIP(trueClientIp);
    }
  }
  if (!ip && req.socket?.remoteAddress) {
    ip = validateIP(req.socket.remoteAddress);
  }
  const userAgent = getHeader("user-agent");
  const deviceFingerprint = getHeader("x-device-fingerprint");
  const referrer = getHeader("referer");
  return {
    ip,
    userAgent,
    deviceFingerprint,
    referrer
  };
}
function buildClientContextHeaders(context) {
  const headers2 = {};
  if (!context) {
    return headers2;
  }
  if (context.ip) {
    headers2["x-sm-forwarded-client-ip"] = context.ip;
    headers2["X-Client-IP"] = context.ip;
  }
  if (context.userAgent) {
    headers2["X-Client-User-Agent"] = context.userAgent;
  }
  if (context.deviceFingerprint) {
    headers2["X-Client-Device-Fingerprint"] = context.deviceFingerprint;
  }
  if (context.referrer) {
    headers2["X-Client-Referrer"] = context.referrer;
  }
  return headers2;
}
function buildFlagContext(clientContext, extraContext = {}) {
  const context = { ...extraContext };
  if (clientContext?.ip && context.ip_address === void 0) {
    context.ip_address = clientContext.ip;
  }
  return context;
}

// src/server/client.ts
var GATEWAY_URLS = {
  dev: "https://api-dev.scalemule.com",
  prod: "https://api.scalemule.com"
};
function resolveGatewayUrl(config) {
  if (config.gatewayUrl) return config.gatewayUrl;
  if (process.env.SCALEMULE_API_URL) return process.env.SCALEMULE_API_URL;
  return GATEWAY_URLS[config.environment || "prod"];
}
var ScaleMuleServer = class {
  constructor(config) {
    // ==========================================================================
    // Auth Methods
    // ==========================================================================
    this.auth = {
      /**
       * Register a new user
       */
      register: async (data, options) => {
        return this.request("POST", "/v1/auth/register", { body: data, clientContext: options?.clientContext });
      },
      /**
       * Login user - returns session token (store in HTTP-only cookie)
       */
      login: async (data, options) => {
        return this.request("POST", "/v1/auth/login", { body: data, clientContext: options?.clientContext });
      },
      /**
       * Logout user
       */
      logout: async (sessionToken) => {
        return this.request("POST", "/v1/auth/logout", {
          body: { session_token: sessionToken }
        });
      },
      /**
       * Get current user from session token
       */
      me: async (sessionToken, options) => {
        return this.request("GET", "/v1/auth/me", {
          sessionToken,
          onTokenRotated: options?.onTokenRotated
        });
      },
      /**
       * Refresh session token
       */
      refresh: async (sessionToken, options) => {
        return this.request("POST", "/v1/auth/refresh", {
          sessionToken,
          clientContext: options?.clientContext,
          isAutoRefresh: options?.isAutoRefresh
        });
      },
      /**
       * Request password reset email
       */
      forgotPassword: async (email, options) => {
        return this.request("POST", "/v1/auth/forgot-password", { body: { email }, clientContext: options?.clientContext });
      },
      /**
       * Reset password with token
       */
      resetPassword: async (token, newPassword, options) => {
        return this.request("POST", "/v1/auth/reset-password", {
          body: { token, new_password: newPassword },
          clientContext: options?.clientContext
        });
      },
      /**
       * Verify email with token
       */
      verifyEmail: async (token) => {
        return this.request("POST", "/v1/auth/verify-email", { body: { token } });
      },
      /**
       * Resend verification email.
       * Can be called with a session token (authenticated) or email (unauthenticated).
       */
      resendVerification: async (sessionTokenOrEmail, options) => {
        if (options?.email) {
          return this.request("POST", "/v1/auth/resend-verification", {
            sessionToken: sessionTokenOrEmail,
            body: { email: options.email }
          });
        }
        if (sessionTokenOrEmail.includes("@")) {
          return this.request("POST", "/v1/auth/resend-verification", {
            body: { email: sessionTokenOrEmail }
          });
        }
        return this.request("POST", "/v1/auth/resend-verification", {
          sessionToken: sessionTokenOrEmail
        });
      }
    };
    // ==========================================================================
    // User/Profile Methods
    // ==========================================================================
    this.user = {
      /**
       * Update user profile
       */
      update: async (sessionToken, data) => {
        return this.request("PATCH", "/v1/auth/profile", {
          sessionToken,
          body: data
        });
      },
      /**
       * Change password
       */
      changePassword: async (sessionToken, currentPassword, newPassword) => {
        return this.request("POST", "/v1/auth/change-password", {
          sessionToken,
          body: { current_password: currentPassword, new_password: newPassword }
        });
      },
      /**
       * Change email
       */
      changeEmail: async (sessionToken, newEmail, password) => {
        return this.request("POST", "/v1/auth/change-email", {
          sessionToken,
          body: { new_email: newEmail, password }
        });
      },
      /**
       * Delete account
       */
      deleteAccount: async (sessionToken, password) => {
        return this.request("DELETE", "/v1/auth/me", {
          sessionToken,
          body: { password }
        });
      }
    };
    // ==========================================================================
    // Storage/Content Methods
    // ==========================================================================
    // ==========================================================================
    // Secrets Methods (Tenant Vault)
    // ==========================================================================
    this.secrets = {
      /**
       * Get a secret from the tenant vault
       *
       * @example
       * ```typescript
       * const result = await scalemule.secrets.get('ANONYMOUS_USER_SALT')
       * if (result.success) {
       *   console.log('Salt:', result.data.value)
       * }
       * ```
       */
      get: async (key) => {
        return this.request("GET", `/v1/vault/secrets/${encodeURIComponent(key)}`);
      },
      /**
       * Set a secret in the tenant vault
       *
       * @example
       * ```typescript
       * await scalemule.secrets.set('ANONYMOUS_USER_SALT', 'my-secret-salt')
       * ```
       */
      set: async (key, value) => {
        return this.request("PUT", `/v1/vault/secrets/${encodeURIComponent(key)}`, {
          body: { value }
        });
      },
      /**
       * Delete a secret from the tenant vault
       */
      delete: async (key) => {
        return this.request("DELETE", `/v1/vault/secrets/${encodeURIComponent(key)}`);
      },
      /**
       * List all secrets in the tenant vault
       */
      list: async () => {
        return this.request("GET", "/v1/vault/secrets");
      },
      /**
       * Get secret version history
       */
      versions: async (key) => {
        return this.request(
          "GET",
          `/v1/vault/versions/${encodeURIComponent(key)}`
        );
      },
      /**
       * Rollback to a specific version
       */
      rollback: async (key, version) => {
        return this.request(
          "POST",
          `/v1/vault/actions/rollback/${encodeURIComponent(key)}`,
          { body: { version } }
        );
      },
      /**
       * Rotate a secret (copy current version as new version)
       */
      rotate: async (key, newValue) => {
        return this.request(
          "POST",
          `/v1/vault/actions/rotate/${encodeURIComponent(key)}`,
          { body: { value: newValue } }
        );
      }
    };
    // ==========================================================================
    // Bundle Methods (Structured Secrets with Inheritance)
    // ==========================================================================
    this.bundles = {
      /**
       * Get a bundle (structured secret like database credentials)
       *
       * @param key - Bundle key (e.g., 'database/prod')
       * @param resolve - Whether to resolve inheritance (default: true)
       *
       * @example
       * ```typescript
       * const result = await scalemule.bundles.get('database/prod')
       * if (result.success) {
       *   console.log('DB Host:', result.data.data.host)
       * }
       * ```
       */
      get: async (key, resolve = true) => {
        const params = new URLSearchParams({ resolve: resolve.toString() });
        return this.request(
          "GET",
          `/v1/vault/bundles/${encodeURIComponent(key)}?${params}`
        );
      },
      /**
       * Set a bundle (structured secret)
       *
       * @param key - Bundle key
       * @param type - Bundle type: 'mysql', 'postgres', 'redis', 's3', 'oauth', 'smtp', 'generic'
       * @param data - Bundle data (structure depends on type)
       * @param inheritsFrom - Optional parent bundle key for inheritance
       *
       * @example
       * ```typescript
       * // Create a MySQL bundle
       * await scalemule.bundles.set('database/prod', 'mysql', {
       *   host: 'db.example.com',
       *   port: 3306,
       *   username: 'app',
       *   password: 'secret',
       *   database: 'myapp'
       * })
       *
       * // Create a bundle that inherits from another
       * await scalemule.bundles.set('database/staging', 'mysql', {
       *   host: 'staging-db.example.com', // Override just the host
       * }, 'database/prod')
       * ```
       */
      set: async (key, type, data, inheritsFrom) => {
        return this.request(
          "PUT",
          `/v1/vault/bundles/${encodeURIComponent(key)}`,
          {
            body: {
              type,
              value: data,
              inherits_from: inheritsFrom
            }
          }
        );
      },
      /**
       * Delete a bundle
       */
      delete: async (key) => {
        return this.request("DELETE", `/v1/vault/bundles/${encodeURIComponent(key)}`);
      },
      /**
       * List all bundles
       */
      list: async () => {
        return this.request(
          "GET",
          "/v1/vault/bundles"
        );
      },
      /**
       * Get connection URL for a database bundle
       *
       * @example
       * ```typescript
       * const result = await scalemule.bundles.connectionUrl('database/prod')
       * if (result.success) {
       *   const client = mysql.createConnection(result.data.url)
       * }
       * ```
       */
      connectionUrl: async (key) => {
        return this.request(
          "GET",
          `/v1/vault/bundles/${encodeURIComponent(key)}?connection_url=true`
        );
      }
    };
    // ==========================================================================
    // Vault Audit Methods
    // ==========================================================================
    this.vaultAudit = {
      /**
       * Query audit logs for your tenant's vault operations
       *
       * @example
       * ```typescript
       * const result = await scalemule.vaultAudit.query({
       *   action: 'read',
       *   path: 'database/*',
       *   since: '2026-01-01'
       * })
       * ```
       */
      query: async (options) => {
        const params = new URLSearchParams();
        if (options?.action) params.set("action", options.action);
        if (options?.path) params.set("path", options.path);
        if (options?.since) params.set("since", options.since);
        if (options?.until) params.set("until", options.until);
        if (options?.limit) params.set("limit", options.limit.toString());
        const queryStr = params.toString();
        return this.request("GET", `/v1/vault/audit${queryStr ? `?${queryStr}` : ""}`);
      }
    };
    this.storage = {
      /**
       * List user's files
       */
      list: async (userId, params) => {
        const query = new URLSearchParams();
        if (params?.content_type) query.set("content_type", params.content_type);
        if (params?.search) query.set("search", params.search);
        if (params?.limit) query.set("limit", params.limit.toString());
        if (params?.offset) query.set("offset", params.offset.toString());
        const queryStr = query.toString();
        const path = `/v1/storage/my-files${queryStr ? `?${queryStr}` : ""}`;
        return this.request("GET", path, { userId });
      },
      /**
       * Get file info
       */
      get: async (fileId) => {
        return this.request("GET", `/v1/storage/files/${fileId}/info`);
      },
      /**
       * Delete file
       */
      delete: async (userId, fileId) => {
        return this.request("DELETE", `/v1/storage/files/${fileId}`, { userId });
      },
      /**
       * Upload file (from server - use FormData)
       *
       * @param userId - The user ID who owns this file
       * @param file - File data to upload
       * @param options - Upload options
       * @param options.clientContext - End user context to forward (IP, user agent, etc.)
       *
       * @example
       * ```typescript
       * // Forward end user context for proper attribution
       * const result = await scalemule.storage.upload(
       *   userId,
       *   { buffer, filename, contentType },
       *   { clientContext: extractClientContext(request) }
       * )
       * ```
       */
      upload: async (userId, file, options) => {
        const formData = new FormData();
        const blob = new Blob([file.buffer], { type: file.contentType });
        formData.append("file", blob, file.filename);
        formData.append("sm_user_id", userId);
        const url = `${this.gatewayUrl}/v1/storage/upload`;
        const headers2 = {
          "x-api-key": this.apiKey,
          "x-user-id": userId,
          ...buildClientContextHeaders(options?.clientContext)
        };
        if (this.debug && options?.clientContext) {
          console.log(`[ScaleMule Server] Upload with client context: IP=${options.clientContext.ip}`);
        }
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: headers2,
            body: formData
          });
          const text = await response.text();
          let responseData = null;
          try {
            responseData = text ? JSON.parse(text) : null;
          } catch {
          }
          if (!response.ok) {
            throw new ScaleMuleApiError(
              responseData?.error || { code: "UPLOAD_FAILED", message: text || "Upload failed" }
            );
          }
          const data = responseData?.data !== void 0 ? responseData.data : responseData;
          return data;
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            throw err;
          }
          throw new ScaleMuleApiError({
            code: "UPLOAD_ERROR",
            message: err instanceof Error ? err.message : "Upload failed"
          });
        }
      }
    };
    // ==========================================================================
    // Analytics Methods
    // ==========================================================================
    // ==========================================================================
    // Webhooks Methods
    // ==========================================================================
    this.webhooks = {
      /**
       * Create a new webhook subscription
       *
       * @example
       * ```typescript
       * const result = await scalemule.webhooks.create({
       *   webhook_name: 'Video Status Webhook',
       *   url: 'https://myapp.com/api/webhooks/scalemule',
       *   events: ['video.ready', 'video.failed']
       * })
       *
       * // Store the secret for signature verification
       * console.log('Webhook secret:', result.secret)
       * ```
       */
      create: async (data) => {
        return this.request(
          "POST",
          "/v1/webhooks",
          { body: data }
        );
      },
      /**
       * List all webhook subscriptions
       */
      list: async () => {
        return this.request("GET", "/v1/webhooks");
      },
      /**
       * Delete a webhook subscription
       */
      delete: async (id) => {
        return this.request("DELETE", `/v1/webhooks/${id}`);
      },
      /**
       * Update a webhook subscription
       */
      update: async (id, data) => {
        return this.request(
          "PATCH",
          `/v1/webhooks/${id}`,
          { body: data }
        );
      },
      /**
       * Get available webhook event types
       */
      eventTypes: async () => {
        return this.request("GET", "/v1/webhooks/events");
      }
    };
    // ==========================================================================
    // Analytics Methods
    // ==========================================================================
    this.analytics = {
      /**
       * Track an analytics event
       *
       * IMPORTANT: When calling from server-side code (API routes), always pass
       * clientContext to ensure the real end user's IP is recorded, not the server's IP.
       *
       * @example
       * ```typescript
       * // In an API route
       * import { extractClientContext, createServerClient } from '@scalemule/nextjs/server'
       *
       * export async function POST(request: NextRequest) {
       *   const clientContext = extractClientContext(request)
       *   const scalemule = createServerClient()
       *
       *   await scalemule.analytics.trackEvent({
       *     event_name: 'button_clicked',
       *     properties: { button_id: 'signup' }
       *   }, { clientContext })
       * }
       * ```
       */
      trackEvent: async (event, options) => {
        return this.request("POST", "/v1/analytics/v2/events", {
          body: event,
          clientContext: options?.clientContext
        });
      },
      /**
       * Track a page view
       *
       * @example
       * ```typescript
       * await scalemule.analytics.trackPageView({
       *   page_url: 'https://example.com/products',
       *   page_title: 'Products',
       *   referrer: 'https://google.com'
       * }, { clientContext })
       * ```
       */
      trackPageView: async (data, options) => {
        return this.request("POST", "/v1/analytics/v2/events", {
          body: {
            event_name: "page_viewed",
            event_category: "navigation",
            page_url: data.page_url,
            properties: {
              page_title: data.page_title,
              referrer: data.referrer
            },
            session_id: data.session_id,
            user_id: data.user_id
          },
          clientContext: options?.clientContext
        });
      },
      /**
       * Track multiple events in a batch (max 100)
       *
       * @example
       * ```typescript
       * await scalemule.analytics.trackBatch([
       *   { event_name: 'item_viewed', properties: { item_id: '123' } },
       *   { event_name: 'item_added_to_cart', properties: { item_id: '123' } }
       * ], { clientContext })
       * ```
       */
      trackBatch: async (events, options) => {
        return this.request("POST", "/v1/analytics/v2/events/batch", {
          body: { events },
          clientContext: options?.clientContext
        });
      }
    };
    this.flags = {
      evaluate: async (flagKey, context = {}, environment = "prod", options) => {
        return this.request("POST", "/v1/flags/evaluate", {
          body: {
            flag_key: flagKey,
            environment,
            context
          },
          clientContext: options?.clientContext
        });
      },
      evaluateBatch: async (flagKeys, context = {}, environment = "prod", options) => {
        return this.request("POST", "/v1/flags/evaluate/batch", {
          body: {
            flag_keys: flagKeys,
            environment,
            context
          },
          clientContext: options?.clientContext
        });
      },
      evaluateAll: async (context = {}, environment = "prod", options) => {
        return this.request("POST", "/v1/flags/evaluate/all", {
          body: {
            environment,
            context
          },
          clientContext: options?.clientContext
        });
      }
    };
    this.apiKey = config.apiKey;
    this.gatewayUrl = resolveGatewayUrl(config);
    this.debug = config.debug || false;
    this.onRefreshStart = config.onRefreshStart;
    this.onRefreshEnd = config.onRefreshEnd;
    this.onAutoRefreshFailed = config.onAutoRefreshFailed;
    this.money = money.createMoneyClient({
      apiKey: this.apiKey,
      gatewayUrl: this.gatewayUrl,
      fetch: globalThis.fetch.bind(globalThis)
    });
  }
  moneyWithSession(sessionToken) {
    return this.money.withAccessToken(sessionToken);
  }
  /**
   * Make a request to the ScaleMule API
   *
   * @param method - HTTP method
   * @param path - API path (e.g., /v1/auth/login)
   * @param options - Request options
   * @param options.body - Request body (will be JSON stringified)
   * @param options.userId - User ID (passed through for storage operations)
   * @param options.sessionToken - Session token sent as Authorization: Bearer header
   * @param options.clientContext - End user context to forward (IP, user agent, etc.)
   */
  async request(method, path, options = {}) {
    const url = `${this.gatewayUrl}${path}`;
    const headers2 = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      // Forward client context headers if provided
      ...buildClientContextHeaders(options.clientContext)
    };
    if (options.sessionToken) {
      headers2["Authorization"] = `Bearer ${options.sessionToken}`;
    }
    if (this.debug) {
      console.log(`[ScaleMule Server] ${method} ${path}`);
      if (options.clientContext) {
        console.log(`[ScaleMule Server] Client context: IP=${options.clientContext.ip}, UA=${options.clientContext.userAgent?.substring(0, 50)}...`);
      }
    }
    try {
      const response = await fetch(url, {
        method,
        headers: headers2,
        body: options.body ? JSON.stringify(options.body) : void 0
      });
      const rotated = response.headers.get("x-rotated-session-token");
      if (rotated && options.onTokenRotated) {
        options.onTokenRotated(rotated);
      }
      const text = await response.text();
      let responseData = null;
      try {
        responseData = text ? JSON.parse(text) : null;
      } catch {
      }
      if (!response.ok) {
        const error = responseData?.error || {
          code: `HTTP_${response.status}`,
          message: responseData?.message || text || response.statusText
        };
        if (response.status === 401 && options.sessionToken && !options.isAutoRefresh) {
          if (this.debug) console.log("[ScaleMule Server] 401 received, attempting auto-refresh...");
          try {
            this.onRefreshStart?.();
            const refreshData = await this.auth.refresh(options.sessionToken, {
              clientContext: options.clientContext,
              isAutoRefresh: true
              // Prevent infinite loops
            });
            const newToken = refreshData.session_token;
            if (this.debug) console.log("[ScaleMule Server] Auto-refresh succeeded, retrying original request...");
            options.onTokenRotated?.(newToken);
            return this.request(method, path, {
              ...options,
              sessionToken: newToken,
              isAutoRefresh: true
              // Don't refresh again on this retry
            });
          } catch (refreshErr) {
            if (this.debug) console.error("[ScaleMule Server] Auto-refresh failed:", refreshErr);
            const refreshApiError = refreshErr instanceof ScaleMuleApiError ? { code: refreshErr.code, message: refreshErr.message } : { code: "REFRESH_FAILED", message: "Auto-refresh failed" };
            this.onAutoRefreshFailed?.(refreshApiError);
            throw new ScaleMuleApiError(error);
          } finally {
            this.onRefreshEnd?.();
          }
        }
        throw new ScaleMuleApiError(error);
      }
      const data = responseData?.data !== void 0 ? responseData.data : responseData;
      return data;
    } catch (err) {
      if (err instanceof ScaleMuleApiError) {
        throw err;
      }
      throw new ScaleMuleApiError({
        code: "SERVER_ERROR",
        message: err instanceof Error ? err.message : "Request failed"
      });
    }
  }
};
function createServerClient(config) {
  const apiKey = config?.apiKey || process.env.SCALEMULE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ScaleMule API key is required. Set SCALEMULE_API_KEY environment variable or pass apiKey in config."
    );
  }
  const environment = config?.environment || process.env.SCALEMULE_ENV || "prod";
  return new ScaleMuleServer({
    apiKey,
    environment,
    gatewayUrl: config?.gatewayUrl,
    debug: config?.debug || process.env.SCALEMULE_DEBUG === "true"
  });
}
var SESSION_COOKIE_NAME = "sm_session";
var USER_ID_COOKIE_NAME = "sm_user_id";
var KNOWN_ACCOUNTS_COOKIE_NAME = "sm_known_accounts";
({
  secure: process.env.NODE_ENV === "production"});
function createCookieHeader(name, value, options = {}) {
  const maxAge = options.maxAge ?? 7 * 24 * 60 * 60;
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const sameSite = options.sameSite ?? "lax";
  const path = options.path ?? "/";
  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}`;
  if (secure) {
    cookie += "; Secure";
  }
  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }
  return cookie;
}
function createClearCookieHeader(name, options = {}) {
  const path = options.path ?? "/";
  let cookie = `${name}=; Path=${path}; Max-Age=0; HttpOnly`;
  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }
  return cookie;
}
function withSession(loginResponse, responseBody, options = {}) {
  const headers2 = new Headers();
  headers2.set("Content-Type", "application/json");
  headers2.append(
    "Set-Cookie",
    createCookieHeader(SESSION_COOKIE_NAME, loginResponse.session_token, options)
  );
  headers2.append(
    "Set-Cookie",
    createCookieHeader(USER_ID_COOKIE_NAME, loginResponse.user.id, options)
  );
  return new Response(JSON.stringify({ success: true, data: responseBody }), {
    status: 200,
    headers: headers2
  });
}
function withRefreshedSession(sessionToken, userId, responseBody, options = {}) {
  const headers2 = new Headers();
  headers2.set("Content-Type", "application/json");
  headers2.append(
    "Set-Cookie",
    createCookieHeader(SESSION_COOKIE_NAME, sessionToken, options)
  );
  headers2.append(
    "Set-Cookie",
    createCookieHeader(USER_ID_COOKIE_NAME, userId, options)
  );
  return new Response(JSON.stringify({ success: true, data: responseBody }), {
    status: 200,
    headers: headers2
  });
}
function clearSession(responseBody, options = {}, status = 200) {
  const headers2 = new Headers();
  headers2.set("Content-Type", "application/json");
  headers2.append("Set-Cookie", createClearCookieHeader(SESSION_COOKIE_NAME, options));
  headers2.append("Set-Cookie", createClearCookieHeader(USER_ID_COOKIE_NAME, options));
  return new Response(JSON.stringify({ success: status < 300, data: responseBody }), {
    status,
    headers: headers2
  });
}
async function getSession() {
  const cookieStore = await headers.cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  const userIdCookie = cookieStore.get(USER_ID_COOKIE_NAME);
  if (!sessionCookie?.value || !userIdCookie?.value) {
    return null;
  }
  return {
    sessionToken: sessionCookie.value,
    userId: userIdCookie.value,
    expiresAt: /* @__PURE__ */ new Date()
    // Note: actual expiry is managed by ScaleMule backend
  };
}
function getSessionFromRequest(request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies4 = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
  const sessionToken = cookies4[SESSION_COOKIE_NAME];
  const userId = cookies4[USER_ID_COOKIE_NAME];
  if (!sessionToken || !userId) {
    return null;
  }
  return {
    sessionToken,
    userId,
    expiresAt: /* @__PURE__ */ new Date()
  };
}
var MAX_KNOWN_ACCOUNTS = 10;
function maskEmail(email) {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***.***";
  const tldDot = domain.lastIndexOf(".");
  const tld = tldDot > 0 ? domain.slice(tldDot) : "";
  const domainBase = tldDot > 0 ? domain.slice(0, tldDot) : domain;
  return `${local[0] || "*"}***@${domainBase[0] || "*"}***${tld}`;
}
function stableColorIndex(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i) | 0;
  }
  return Math.abs(hash) % 8;
}
function applyPrivacyToEntry(entry, privacy) {
  switch (privacy) {
    case "full":
      return entry;
    case "masked":
      return {
        userId: entry.userId,
        email: entry.email ? maskEmail(entry.email) : void 0,
        fullName: entry.fullName ? `${entry.fullName[0].toUpperCase()}.` : void 0,
        provider: entry.provider,
        lastActiveAt: entry.lastActiveAt,
        colorIndex: stableColorIndex(entry.userId)
      };
    case "minimal":
      return {
        userId: entry.userId,
        provider: entry.provider,
        lastActiveAt: entry.lastActiveAt,
        displayLabel: "Account",
        colorIndex: stableColorIndex(entry.userId)
      };
  }
}
function appendKnownAccountCookie(headers2, account, existingCookie, options = {}, privacy) {
  let accounts = {};
  if (existingCookie) {
    try {
      accounts = JSON.parse(decodeURIComponent(existingCookie));
    } catch {
    }
  }
  const effectivePrivacy = privacy || "full";
  for (const [userId, entry] of Object.entries(accounts)) {
    accounts[userId] = applyPrivacyToEntry(entry, effectivePrivacy);
  }
  accounts[account.userId] = applyPrivacyToEntry(account, effectivePrivacy);
  const entries = Object.entries(accounts);
  if (entries.length > MAX_KNOWN_ACCOUNTS) {
    entries.sort((a, b) => new Date(b[1].lastActiveAt).getTime() - new Date(a[1].lastActiveAt).getTime());
    accounts = Object.fromEntries(entries.slice(0, MAX_KNOWN_ACCOUNTS));
  }
  const maxAge = 365 * 24 * 60 * 60;
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const sameSite = options.sameSite ?? "lax";
  const path = options.path ?? "/";
  let cookie = `${KNOWN_ACCOUNTS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(accounts))}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`;
  if (secure) {
    cookie += "; Secure";
  }
  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }
  headers2.append("Set-Cookie", cookie);
}
function removeKnownAccountFromCookie(headers2, userId, existingCookie, options = {}) {
  let accounts = {};
  if (existingCookie) {
    try {
      accounts = JSON.parse(decodeURIComponent(existingCookie));
    } catch {
    }
  }
  delete accounts[userId];
  const maxAge = 365 * 24 * 60 * 60;
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const sameSite = options.sameSite ?? "lax";
  const path = options.path ?? "/";
  let cookie = `${KNOWN_ACCOUNTS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(accounts))}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`;
  if (secure) {
    cookie += "; Secure";
  }
  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }
  headers2.append("Set-Cookie", cookie);
}
function clearKnownAccountsCookie(headers2, options = {}) {
  const path = options.path ?? "/";
  let cookie = `${KNOWN_ACCOUNTS_COOKIE_NAME}=; Path=${path}; Max-Age=0`;
  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }
  headers2.append("Set-Cookie", cookie);
}
function getKnownAccountsFromRequest(request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return [];
  const cookies4 = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
  const raw = cookies4[KNOWN_ACCOUNTS_COOKIE_NAME];
  if (!raw) return [];
  try {
    const accounts = JSON.parse(raw);
    return Object.values(accounts);
  } catch {
    return [];
  }
}
function getKnownAccountsCookieRaw(request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies4 = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
  return cookies4[KNOWN_ACCOUNTS_COOKIE_NAME] || null;
}
function normalizeKnownAccountsCookie(request, privacy, options = {}) {
  if (!privacy || privacy === "full") return null;
  const raw = getKnownAccountsCookieRaw(request);
  if (!raw) return null;
  let accounts = {};
  try {
    accounts = JSON.parse(raw);
  } catch {
    return null;
  }
  let changed = false;
  for (const [userId, entry] of Object.entries(accounts)) {
    const normalized = applyPrivacyToEntry(entry, privacy);
    if (JSON.stringify(normalized) !== JSON.stringify(entry)) {
      accounts[userId] = normalized;
      changed = true;
    }
  }
  if (!changed) return null;
  const maxAge = 365 * 24 * 60 * 60;
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const sameSite = options.sameSite ?? "lax";
  const path = options.path ?? "/";
  let cookie = `${KNOWN_ACCOUNTS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(accounts))}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`;
  if (secure) cookie += "; Secure";
  if (options.domain) cookie += `; Domain=${options.domain}`;
  return cookie;
}
async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" }
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  return session;
}

// src/server/timing.ts
function constantTimeEqual(a, b) {
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < maxLength; i++) {
    const aCode = i < a.length ? a.charCodeAt(i) : 0;
    const bCode = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= aCode ^ bCode;
  }
  return mismatch === 0;
}

// src/server/csrf.ts
var CSRF_COOKIE_NAME = "sm_csrf";
var CSRF_HEADER_NAME = "x-csrf-token";
function generateCSRFToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function withCSRFToken(response, token) {
  const csrfToken = token || generateCSRFToken();
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    // Must be readable by JavaScript to include in requests
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24
    // 24 hours
  });
  return response;
}
function validateCSRFToken(request) {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!cookieToken) {
    return "Missing CSRF cookie";
  }
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (!headerToken) {
    return "Missing CSRF token header";
  }
  if (!constantTimeEqual(cookieToken, headerToken)) {
    return "CSRF token mismatch";
  }
  return void 0;
}
async function validateCSRFTokenAsync(request, body) {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!cookieToken) {
    return "Missing CSRF cookie";
  }
  let requestToken = request.headers.get(CSRF_HEADER_NAME);
  if (!requestToken && body) {
    requestToken = body.csrf_token ?? body._csrf ?? null;
  }
  if (!requestToken) {
    return "Missing CSRF token";
  }
  if (!constantTimeEqual(cookieToken, requestToken)) {
    return "CSRF token mismatch";
  }
  return void 0;
}
function withCSRFProtection(handler) {
  return async (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const error = validateCSRFToken(request);
      if (error) {
        return server.NextResponse.json(
          { error: "CSRF validation failed", message: error },
          { status: 403 }
        );
      }
    }
    return handler(request);
  };
}
async function getCSRFToken() {
  const cookieStore = await headers.cookies();
  let token = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  if (!token) {
    token = generateCSRFToken();
  }
  return token;
}

// src/server/routes.ts
function errorResponse(code, message, status) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
function successResponse(data, status = 200) {
  return new Response(
    JSON.stringify({ success: true, data }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
function createAuthRoutes(config = {}) {
  const sm = createServerClient(config.client);
  const cookieOptions = config.cookies || {};
  const POST = async (request, context) => {
    if (config.csrf) {
      const csrfError = validateCSRFToken(request);
      if (csrfError) {
        return errorResponse("CSRF_ERROR", "CSRF validation failed", 403);
      }
    }
    const params = await context?.params;
    const path = params?.scalemule?.join("/") || "";
    try {
      const body = await request.json().catch(() => ({}));
      const clientContext = extractClientContext(request);
      switch (path) {
        // ==================== Register ====================
        case "register": {
          const { email, password, full_name, username, phone } = body;
          if (!email || !password) {
            return errorResponse("VALIDATION_ERROR", "Email and password required", 400);
          }
          let registeredUser;
          try {
            registeredUser = await sm.auth.register({ email, password, full_name, username, phone }, { clientContext });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "REGISTER_FAILED",
              apiErr?.message || "Registration failed",
              400
            );
          }
          if (config.onRegister) {
            await config.onRegister({ id: registeredUser.id, email: registeredUser.email });
          }
          let loginData;
          try {
            loginData = await sm.auth.login({ email, password }, { clientContext });
          } catch {
            return successResponse({ user: registeredUser, message: "Registration successful" }, 201);
          }
          const registerResponse = withSession(loginData, { user: registeredUser, sessionToken: loginData.session_token, userId: registeredUser.id }, cookieOptions);
          if (config.enableAccountSwitcher) {
            const existingKnown = getKnownAccountsCookieRaw(request);
            appendKnownAccountCookie(
              registerResponse.headers,
              {
                userId: registeredUser.id,
                email: registeredUser.email,
                fullName: registeredUser.full_name ?? void 0,
                avatarUrl: registeredUser.avatar_url ?? void 0,
                provider: "email",
                lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
              },
              existingKnown,
              cookieOptions,
              config.accountSwitcherPrivacy
            );
          }
          return registerResponse;
        }
        // ==================== Login ====================
        case "login": {
          const { email, password, remember_me } = body;
          if (!email || !password) {
            return errorResponse("VALIDATION_ERROR", "Email and password required", 400);
          }
          let loginData;
          try {
            loginData = await sm.auth.login({ email, password, remember_me }, { clientContext });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            const errorCode = apiErr?.code || "LOGIN_FAILED";
            let status = 400;
            if (errorCode === "INVALID_CREDENTIALS" || errorCode === "UNAUTHORIZED") status = 401;
            if (["EMAIL_NOT_VERIFIED", "PHONE_NOT_VERIFIED", "ACCOUNT_LOCKED", "ACCOUNT_DISABLED", "MFA_REQUIRED"].includes(errorCode)) {
              status = 403;
            }
            return errorResponse(
              errorCode,
              apiErr?.message || "Login failed",
              status
            );
          }
          if (config.onLogin) {
            await config.onLogin({
              id: loginData.user.id,
              email: loginData.user.email
            });
          }
          const loginResponse = withSession(loginData, { user: loginData.user, sessionToken: loginData.session_token, userId: loginData.user.id }, cookieOptions);
          if (config.enableAccountSwitcher) {
            const existingKnown = getKnownAccountsCookieRaw(request);
            appendKnownAccountCookie(
              loginResponse.headers,
              {
                userId: loginData.user.id,
                email: loginData.user.email,
                fullName: loginData.user.full_name ?? void 0,
                avatarUrl: loginData.user.avatar_url ?? void 0,
                provider: "email",
                lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
              },
              existingKnown,
              cookieOptions,
              config.accountSwitcherPrivacy
            );
          }
          return loginResponse;
        }
        // ==================== Logout ====================
        case "logout": {
          const session = await getSession();
          if (session) {
            await sm.auth.logout(session.sessionToken);
          }
          if (config.onLogout) {
            await config.onLogout();
          }
          return clearSession({ message: "Logged out successfully" }, cookieOptions);
        }
        // ==================== Forgot Password ====================
        case "forgot-password": {
          const { email } = body;
          if (!email) {
            return errorResponse("VALIDATION_ERROR", "Email required", 400);
          }
          const result2 = await sm.auth.forgotPassword(email, { clientContext });
          return successResponse({ message: "If an account exists, a reset email has been sent" });
        }
        // ==================== Reset Password ====================
        case "reset-password": {
          const { token, new_password } = body;
          if (!token || !new_password) {
            return errorResponse("VALIDATION_ERROR", "Token and new password required", 400);
          }
          try {
            await sm.auth.resetPassword(token, new_password, { clientContext });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "RESET_FAILED",
              apiErr?.message || "Password reset failed",
              400
            );
          }
          return successResponse({ message: "Password reset successful" });
        }
        // ==================== Verify Email ====================
        case "verify-email": {
          const { token } = body;
          if (!token) {
            return errorResponse("VALIDATION_ERROR", "Token required", 400);
          }
          let verifyData;
          try {
            verifyData = await sm.auth.verifyEmail(token);
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "VERIFY_FAILED",
              apiErr?.message || "Email verification failed",
              400
            );
          }
          if (verifyData?.session_token && verifyData?.user) {
            return withSession(
              { session_token: verifyData.session_token, user: verifyData.user },
              { message: "Email verified successfully", verified: true, user: verifyData.user, sessionToken: verifyData.session_token, userId: verifyData.user.id },
              cookieOptions
            );
          }
          return successResponse({ message: "Email verified successfully" });
        }
        // ==================== Resend Verification ====================
        // Supports both authenticated (session-based) and unauthenticated (email-based) resend
        case "resend-verification": {
          const { email } = body;
          const session = await getSession();
          if (email) {
            try {
              await sm.auth.resendVerification(email);
            } catch (err) {
              const apiErr = err instanceof ScaleMuleApiError ? err : null;
              return errorResponse(
                apiErr?.code || "RESEND_FAILED",
                apiErr?.message || "Failed to resend verification",
                apiErr?.code === "RATE_LIMITED" ? 429 : 400
              );
            }
            return successResponse({ message: "Verification email sent" });
          }
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Email or session required", 401);
          }
          try {
            await sm.auth.resendVerification(session.sessionToken);
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "RESEND_FAILED",
              apiErr?.message || "Failed to resend verification",
              400
            );
          }
          return successResponse({ message: "Verification email sent" });
        }
        // ==================== Refresh Session ====================
        case "refresh": {
          const session = await getSession();
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Authentication required", 401);
          }
          let refreshData;
          try {
            refreshData = await sm.auth.refresh(session.sessionToken);
          } catch {
            return clearSession(
              { message: "Session expired" },
              cookieOptions
            );
          }
          return withRefreshedSession(
            refreshData.session_token,
            session.userId,
            { message: "Session refreshed" },
            cookieOptions
          );
        }
        // ==================== Change Password ====================
        case "change-password": {
          const session = await getSession();
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Authentication required", 401);
          }
          const { current_password, new_password } = body;
          if (!current_password || !new_password) {
            return errorResponse("VALIDATION_ERROR", "Current and new password required", 400);
          }
          try {
            await sm.user.changePassword(
              session.sessionToken,
              current_password,
              new_password
            );
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "CHANGE_FAILED",
              apiErr?.message || "Failed to change password",
              400
            );
          }
          return successResponse({ message: "Password changed successfully" });
        }
        // ==================== Switch Account ====================
        // Clears the active session so the user can re-authenticate as a different account.
        // The known accounts cookie is preserved — only the session cookie is cleared.
        case "switch-account": {
          if (!config.enableAccountSwitcher) {
            return errorResponse("NOT_FOUND", "Account switcher not enabled", 404);
          }
          const session = await getSession();
          if (session) {
            try {
              await sm.auth.logout(session.sessionToken);
            } catch {
            }
          }
          const switchResponse = clearSession({ message: "Session cleared for account switch" }, cookieOptions);
          const knownAccounts = getKnownAccountsFromRequest(request);
          return new Response(
            JSON.stringify({ success: true, data: { message: "Session cleared for account switch", knownAccounts } }),
            { status: 200, headers: switchResponse.headers }
          );
        }
        // ==================== Forget Account ====================
        // Remove a specific account from the known accounts cookie.
        case "forget-account": {
          if (!config.enableAccountSwitcher) {
            return errorResponse("NOT_FOUND", "Account switcher not enabled", 404);
          }
          const { user_id } = body;
          if (!user_id) {
            return errorResponse("VALIDATION_ERROR", "user_id required", 400);
          }
          const headers2 = new Headers();
          headers2.set("Content-Type", "application/json");
          const existingKnown = getKnownAccountsCookieRaw(request);
          removeKnownAccountFromCookie(headers2, user_id, existingKnown, cookieOptions);
          return new Response(
            JSON.stringify({ success: true, data: { message: "Account forgotten" } }),
            { status: 200, headers: headers2 }
          );
        }
        // ==================== Forget All Accounts ====================
        case "forget-all-accounts": {
          if (!config.enableAccountSwitcher) {
            return errorResponse("NOT_FOUND", "Account switcher not enabled", 404);
          }
          const headers2 = new Headers();
          headers2.set("Content-Type", "application/json");
          clearKnownAccountsCookie(headers2, cookieOptions);
          return new Response(
            JSON.stringify({ success: true, data: { message: "All accounts forgotten" } }),
            { status: 200, headers: headers2 }
          );
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Auth] Error:", err);
      return errorResponse("SERVER_ERROR", "Internal server error", 500);
    }
  };
  const GET = async (request, context) => {
    const params = await context?.params;
    const path = params?.scalemule?.join("/") || "";
    try {
      switch (path) {
        // ==================== Get Current User ====================
        case "me": {
          const normCookie = config.enableAccountSwitcher ? normalizeKnownAccountsCookie(request, config.accountSwitcherPrivacy, cookieOptions) : null;
          const withNorm = (resp) => {
            if (normCookie) resp.headers.append("Set-Cookie", normCookie);
            return resp;
          };
          const session = await getSession();
          if (!session) {
            return withNorm(errorResponse("UNAUTHORIZED", "Authentication required", 401));
          }
          let userData;
          let rotated = null;
          try {
            userData = await sm.auth.me(session.sessionToken, {
              onTokenRotated: (newToken) => {
                rotated = newToken;
              }
            });
          } catch {
            return withNorm(clearSession(
              { error: { code: "SESSION_EXPIRED", message: "Session expired" } },
              cookieOptions
            ));
          }
          if (rotated) {
            return withNorm(withRefreshedSession(
              rotated,
              session.userId,
              { user: userData, sessionToken: rotated, userId: session.userId },
              cookieOptions
            ));
          }
          return withNorm(successResponse({ user: userData, sessionToken: session.sessionToken, userId: session.userId }));
        }
        // ==================== Get Session Status ====================
        case "session": {
          const session = await getSession();
          return successResponse({
            authenticated: !!session,
            userId: session?.userId || null
          });
        }
        // ==================== Get Known Accounts ====================
        case "known-accounts": {
          if (!config.enableAccountSwitcher) {
            return errorResponse("NOT_FOUND", "Account switcher not enabled", 404);
          }
          const knownAccounts = getKnownAccountsFromRequest(request);
          return successResponse({ knownAccounts });
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Auth] Error:", err);
      return errorResponse("SERVER_ERROR", "Internal server error", 500);
    }
  };
  const DELETE = async (request, context) => {
    const params = await context?.params;
    const path = params?.scalemule?.join("/") || "";
    try {
      switch (path) {
        // ==================== Delete Account ====================
        case "me":
        case "account": {
          const session = await getSession();
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Authentication required", 401);
          }
          const body = await request.json().catch(() => ({}));
          const { password } = body;
          if (!password) {
            return errorResponse("VALIDATION_ERROR", "Password required", 400);
          }
          try {
            await sm.user.deleteAccount(session.sessionToken, password);
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "DELETE_FAILED",
              apiErr?.message || "Failed to delete account",
              400
            );
          }
          return clearSession({ message: "Account deleted successfully" }, cookieOptions);
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Auth] Error:", err);
      return errorResponse("SERVER_ERROR", "Internal server error", 500);
    }
  };
  const PATCH = async (request, context) => {
    const params = await context?.params;
    const path = params?.scalemule?.join("/") || "";
    try {
      switch (path) {
        // ==================== Update Profile ====================
        case "me":
        case "profile": {
          const session = await getSession();
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Authentication required", 401);
          }
          const body = await request.json().catch(() => ({}));
          const { full_name, avatar_url } = body;
          let updatedUser;
          try {
            updatedUser = await sm.user.update(session.sessionToken, { full_name, avatar_url });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "UPDATE_FAILED",
              apiErr?.message || "Failed to update profile",
              400
            );
          }
          return successResponse({ user: updatedUser });
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Auth] Error:", err);
      return errorResponse("SERVER_ERROR", "Internal server error", 500);
    }
  };
  return { GET, POST, DELETE, PATCH };
}
function getPrimaryTrackingContextSource(body) {
  if (Array.isArray(body.events)) {
    const firstEvent = body.events.find((event) => event && typeof event === "object" && !Array.isArray(event));
    if (firstEvent && typeof firstEvent === "object" && !Array.isArray(firstEvent)) {
      return firstEvent;
    }
  }
  return body;
}
function buildDefaultTrackingGateContext(args) {
  const source = getPrimaryTrackingContextSource(args.body);
  const extraContext = {};
  for (const key of ["user_id", "anonymous_id", "session_id", "event_name", "page_url"]) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      extraContext[key] = value;
    }
  }
  return buildFlagContext(args.clientContext, extraContext);
}
function createAnalyticsRoutes(config = {}) {
  const sm = createServerClient(config.client);
  const shouldSuppressTracking = async (body, clientContext, request) => {
    const gate = config.trackingGate;
    if (!gate) {
      return false;
    }
    try {
      const contextBuilder = gate.buildContext || ((args) => buildDefaultTrackingGateContext(args));
      const evaluation = await sm.flags.evaluate(
        gate.flagKey,
        contextBuilder({ body, clientContext, request }) || {},
        gate.environment || "prod",
        { clientContext }
      );
      return evaluation?.value === false;
    } catch (err) {
      if (gate.failOpen === false) {
        console.warn(`[ScaleMule Analytics] Tracking gate blocked "${gate.flagKey}" after evaluation failure`, err);
        return true;
      }
      return false;
    }
  };
  const handleTrackEvent = async (body, clientContext) => {
    const {
      event_name,
      event_category,
      properties,
      user_id,
      session_id,
      anonymous_id,
      session_duration_seconds,
      page_url,
      page_title,
      referrer,
      landing_page,
      device_type,
      device_brand,
      device_model,
      browser,
      browser_version,
      os,
      os_version,
      screen_resolution,
      viewport_size,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      client_timestamp,
      timestamp
      // Legacy field
    } = body;
    if (!event_name) {
      return errorResponse("VALIDATION_ERROR", "event_name is required", 400);
    }
    let trackResult;
    try {
      trackResult = await sm.analytics.trackEvent(
        {
          event_name,
          event_category,
          properties,
          user_id,
          session_id,
          anonymous_id,
          session_duration_seconds,
          page_url,
          page_title,
          referrer,
          landing_page,
          device_type,
          device_brand,
          device_model,
          browser,
          browser_version,
          os,
          os_version,
          screen_resolution,
          viewport_size,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content,
          client_timestamp: client_timestamp || timestamp
        },
        { clientContext }
      );
    } catch (err) {
      const apiErr = err instanceof ScaleMuleApiError ? err : null;
      return errorResponse(
        apiErr?.code || "TRACK_FAILED",
        apiErr?.message || "Failed to track event",
        400
      );
    }
    if (config.onEvent) {
      await config.onEvent({ event_name, session_id: trackResult?.session_id });
    }
    return successResponse({ tracked: trackResult?.tracked || 1, session_id: trackResult?.session_id });
  };
  const POST = async (request, context) => {
    try {
      const rawBody = await request.json().catch(() => ({}));
      const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {};
      const clientContext = extractClientContext(request);
      if (await shouldSuppressTracking(body, clientContext, request)) {
        return successResponse({ tracked: 0, suppressed: true }, 202);
      }
      if (config.simpleProxy) {
        return handleTrackEvent(body, clientContext);
      }
      const params = await context?.params;
      const path = params?.scalemule?.join("/") || "";
      switch (path) {
        // ==================== Track Single Event ====================
        case "event":
        case "events":
        case "": {
          return handleTrackEvent(body, clientContext);
        }
        // ==================== Track Batch Events ====================
        case "batch": {
          const { events } = body;
          if (!Array.isArray(events) || events.length === 0) {
            return errorResponse("VALIDATION_ERROR", "events array is required", 400);
          }
          if (events.length > 100) {
            return errorResponse("VALIDATION_ERROR", "Maximum 100 events per batch", 400);
          }
          let batchResult;
          try {
            batchResult = await sm.analytics.trackBatch(events, { clientContext });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "BATCH_FAILED",
              apiErr?.message || "Failed to track events",
              400
            );
          }
          return successResponse({ tracked: batchResult?.tracked || events.length });
        }
        // ==================== Track Page View ====================
        case "page-view":
        case "pageview": {
          const { page_url, page_title, referrer, session_id, user_id } = body;
          if (!page_url) {
            return errorResponse("VALIDATION_ERROR", "page_url is required", 400);
          }
          let pageViewResult;
          try {
            pageViewResult = await sm.analytics.trackPageView(
              {
                page_url,
                page_title,
                referrer,
                session_id,
                user_id
              },
              { clientContext }
            );
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "TRACK_FAILED",
              apiErr?.message || "Failed to track page view",
              400
            );
          }
          if (config.onEvent) {
            await config.onEvent({ event_name: "page_viewed", session_id: pageViewResult?.session_id });
          }
          return successResponse({ tracked: pageViewResult?.tracked || 1, session_id: pageViewResult?.session_id });
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Analytics] Error:", err);
      return successResponse({ tracked: 0 });
    }
  };
  return { POST };
}

// src/server/ledvery-cookies.ts
var SM_LEDVERY_STATE_COOKIE = "sm_ledvery_state";
var SM_LEDVERY_PKCE_VERIFIER_COOKIE = "sm_ledvery_pkce_verifier";
var SM_LEDVERY_NONCE_COOKIE = "sm_ledvery_nonce";
var SM_LEDVERY_ID_TOKEN_COOKIE = "sm_ledvery_id_token";
var SM_LEDVERY_ACCESS_TOKEN_COOKIE = "sm_ledvery_access_token";
var FLOW_COOKIE_MAX_AGE = 60 * 10;
var SESSION_COOKIE_MAX_AGE = 60 * 60;
function flowCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: FLOW_COOKIE_MAX_AGE
  };
}
function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAge ? Math.min(maxAge, SESSION_COOKIE_MAX_AGE) : SESSION_COOKIE_MAX_AGE
  };
}
function setLedveryFlowCookies(response, params) {
  const opts = flowCookieOptions();
  setCookie(response, SM_LEDVERY_STATE_COOKIE, params.state, opts);
  setCookie(response, SM_LEDVERY_PKCE_VERIFIER_COOKIE, params.codeVerifier, opts);
  setCookie(response, SM_LEDVERY_NONCE_COOKIE, params.nonce, opts);
}
function validateAndConsumeLedveryFlowCookies(request, callbackState) {
  const cookieState = getCookie(request, SM_LEDVERY_STATE_COOKIE);
  const codeVerifier = getCookie(request, SM_LEDVERY_PKCE_VERIFIER_COOKIE);
  const nonce = getCookie(request, SM_LEDVERY_NONCE_COOKIE);
  if (!cookieState) return "Missing Ledvery state cookie - session may have expired";
  if (!callbackState) return "Missing state parameter in callback";
  if (!constantTimeEqual(cookieState, callbackState)) return "Ledvery state mismatch - possible CSRF attack";
  if (!codeVerifier) return "Missing PKCE verifier cookie";
  if (!nonce) return "Missing nonce cookie";
  return { codeVerifier, nonce };
}
function setLedverySession(response, session, opts) {
  const cookieOpts = sessionCookieOptions(opts?.cookies?.maxAge);
  if (opts?.cookies?.domain) cookieOpts.domain = opts.cookies.domain;
  if (opts?.cookies?.path) cookieOpts.path = opts.cookies.path;
  if (opts?.cookies?.sameSite) cookieOpts.sameSite = opts.cookies.sameSite;
  if (opts?.cookies?.secure !== void 0) cookieOpts.secure = opts.cookies.secure;
  const sessionPayload = JSON.stringify({
    idToken: session.idToken,
    claims: session.claims,
    expiresAt: session.expiresAt
  });
  setCookie(response, SM_LEDVERY_ID_TOKEN_COOKIE, sessionPayload, cookieOpts);
  if (opts?.storeAccessToken && session.accessToken) {
    setCookie(response, SM_LEDVERY_ACCESS_TOKEN_COOKIE, session.accessToken, cookieOpts);
  }
}
function getLedverySession(request) {
  const raw = getCookie(request, SM_LEDVERY_ID_TOKEN_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      idToken: parsed.idToken || "",
      claims: parsed.claims,
      expiresAt: parsed.expiresAt
    };
  } catch {
    return null;
  }
}
function clearLedverySession(response) {
  deleteCookie(response, SM_LEDVERY_ID_TOKEN_COOKIE);
  deleteCookie(response, SM_LEDVERY_ACCESS_TOKEN_COOKIE);
}
function clearLedveryFlowCookies(response) {
  deleteCookie(response, SM_LEDVERY_STATE_COOKIE);
  deleteCookie(response, SM_LEDVERY_PKCE_VERIFIER_COOKIE);
  deleteCookie(response, SM_LEDVERY_NONCE_COOKIE);
}
function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : void 0;
}
function setCookie(response, name, value, opts) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=${opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1)}`
  ];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  response.headers.append("Set-Cookie", parts.join("; "));
}
function deleteCookie(response, name) {
  response.headers.append("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

// src/server/redirect.ts
function normalizeOrigin(origin) {
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}
function isSafeSchemeRelative(input) {
  return !(input.startsWith("//") || input.startsWith("\\"));
}
function validateSafeRedirect(input, opts = {}) {
  const defaultPath = opts.defaultPath ?? "/";
  if (!input || typeof input !== "string") return defaultPath;
  const trimmed = input.trim();
  if (!trimmed) return defaultPath;
  if (!isSafeSchemeRelative(trimmed)) return defaultPath;
  const colon = trimmed.indexOf(":");
  if (colon > 0 && colon < 15) {
    const scheme = trimmed.slice(0, colon).toLowerCase();
    if (/^[a-z][a-z0-9+.-]*$/.test(scheme) && scheme !== "http" && scheme !== "https") {
      return defaultPath;
    }
  }
  if (trimmed.startsWith("/")) {
    if (trimmed.length > 1 && trimmed[1] === "\\") return defaultPath;
    return trimmed;
  }
  const allowed = (opts.allowedOrigins ?? []).map(normalizeOrigin).filter((o) => o !== null);
  try {
    const parsed = new URL(trimmed);
    const origin = `${parsed.protocol}//${parsed.host}`.toLowerCase();
    if (!allowed.includes(origin)) return defaultPath;
    if (opts.stripSameOriginHost !== false) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
    }
    return trimmed;
  } catch {
    return defaultPath;
  }
}
function isSafeRedirect(input, opts = {}) {
  if (!input || typeof input !== "string") return false;
  const defaultPath = `__unsafe_sentinel_${Math.random()}`;
  const resolved = validateSafeRedirect(input, { ...opts, defaultPath });
  return resolved !== defaultPath;
}

// src/server/ledvery.ts
function createLedveryRoutes(config) {
  const client = new ledvery.LedveryClient({
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    fetch: config.fetch
  });
  const postLoginRedirect = config.postLoginRedirect || "/";
  const postLogoutRedirect = config.postLogoutRedirect || "/";
  const defaultScope = config.defaultScope || "openid email profile";
  async function handleLogin(request) {
    const url = new URL(request.url);
    const returnTo = url.searchParams.get("returnTo");
    const validatedReturnTo = validateSafeRedirect(returnTo, { defaultPath: postLoginRedirect });
    const authResult = await client.createAuthorizationUrl({
      scope: defaultScope
    });
    const response = new Response(null, {
      status: 302,
      headers: { Location: authResult.url }
    });
    setLedveryFlowCookies(response, {
      state: authResult.state,
      codeVerifier: authResult.codeVerifier,
      nonce: authResult.nonce
    });
    if (validatedReturnTo !== postLoginRedirect) {
      response.headers.append(
        "Set-Cookie",
        `sm_ledvery_return_to=${encodeURIComponent(validatedReturnTo)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
      );
    }
    return response;
  }
  async function handleCallback(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const callbackState = url.searchParams.get("state");
    if (!code) {
      const error = url.searchParams.get("error");
      const errorDesc = url.searchParams.get("error_description");
      return new Response(
        JSON.stringify({ error: error || "missing_code", message: errorDesc || "No authorization code in callback" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    const flowResult = validateAndConsumeLedveryFlowCookies(request, callbackState);
    if (typeof flowResult === "string") {
      return new Response(
        JSON.stringify({ error: "state_mismatch", message: flowResult }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    let session;
    try {
      session = await client.exchangeCode({
        code,
        codeVerifier: flowResult.codeVerifier,
        receivedState: callbackState,
        expectedState: getCookieValue(request, "sm_ledvery_state"),
        expectedNonce: flowResult.nonce
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "code_exchange_failed", message: err instanceof Error ? err.message : "Code exchange failed" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    const returnTo = getCookieValue(request, "sm_ledvery_return_to");
    const redirectTo = validateSafeRedirect(returnTo, { defaultPath: postLoginRedirect });
    const response = new Response(null, {
      status: 302,
      headers: { Location: redirectTo }
    });
    setLedverySession(response, {
      idToken: session.idToken,
      accessToken: session.accessToken,
      claims: session.claims,
      expiresAt: session.expiresAt.toISOString()
    }, {
      storeAccessToken: config.storeAccessToken,
      cookies: config.cookies
    });
    clearLedveryFlowCookies(response);
    response.headers.append("Set-Cookie", "sm_ledvery_return_to=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return response;
  }
  function handleSession(request) {
    const session = getLedverySession(request);
    if (!session) {
      return new Response(JSON.stringify({ session: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    const expiresAt = new Date(session.expiresAt);
    if (expiresAt <= /* @__PURE__ */ new Date()) {
      return new Response(JSON.stringify({ session: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(
      JSON.stringify({
        session: {
          sub: session.claims.sub,
          email: session.claims.email,
          email_verified: session.claims.email_verified,
          name: session.claims.name,
          idp: session.claims.idp,
          expiresAt: session.expiresAt
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  function handleLogout(request) {
    const session = getLedverySession(request);
    const idToken = session?.idToken;
    if (config.gatewayUrl) {
      let rpLogoutUrl = `${config.gatewayUrl}/v1/auth/oauth/ledvery/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirect)}`;
      if (idToken) {
        rpLogoutUrl += `&id_token_hint=${encodeURIComponent(idToken)}`;
      }
      const response2 = new Response(null, {
        status: 302,
        headers: { Location: rpLogoutUrl }
      });
      clearLedverySession(response2);
      return response2;
    }
    const response = new Response(null, {
      status: 302,
      headers: { Location: postLogoutRedirect }
    });
    clearLedverySession(response);
    return response;
  }
  async function handler(request, context) {
    const params = await context.params;
    const action = params.action?.[0] || "";
    switch (action) {
      case "login":
        return handleLogin(request);
      case "callback":
        return handleCallback(request);
      case "session":
        return handleSession(request);
      case "logout":
        return handleLogout(request);
      default:
        return new Response(
          JSON.stringify({ error: "not_found", message: `Unknown Ledvery route: ${action}` }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
    }
  }
  return {
    GET: handler,
    POST: handler
  };
}
function getCookieValue(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : void 0;
}

// src/server/push.ts
function errorResponse2(code, message, status) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
function successResponse2(data, status = 200) {
  return new Response(
    JSON.stringify({ success: true, data }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
function createPushRoutes(config) {
  const { apiKey, gatewayUrl, csrf = true } = config;
  async function proxyToGateway(request, method, subPath) {
    const targetUrl = `${gatewayUrl}/v1/communication/push/${subPath}`;
    const headers2 = {
      "x-api-key": apiKey
    };
    const session = getSessionFromRequest(request);
    if (session?.sessionToken) {
      headers2["Authorization"] = `Bearer ${session.sessionToken}`;
    }
    const clientContext = extractClientContext(
      request
    );
    const contextHeaders = buildClientContextHeaders(clientContext);
    Object.assign(headers2, contextHeaders);
    const workspaceId = request.headers.get("x-sm-workspace-id");
    if (workspaceId) {
      headers2["x-sm-workspace-id"] = workspaceId;
    }
    const fetchOptions = {
      method,
      headers: headers2
    };
    if (method !== "GET" && method !== "DELETE") {
      try {
        const body = await request.text();
        if (body) {
          headers2["Content-Type"] = "application/json";
          fetchOptions.body = body;
        }
      } catch {
      }
    }
    const response = await fetch(targetUrl, fetchOptions);
    if (response.status === 204) {
      return successResponse2(null);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await response.json();
      if (response.ok) {
        return new Response(JSON.stringify(json), {
          status: response.status,
          headers: { "Content-Type": "application/json" }
        });
      } else {
        const errMsg = json?.error?.message || json?.message || "Request failed";
        const errCode = json?.error?.code || json?.code || "PUSH_ERROR";
        return errorResponse2(errCode, errMsg, response.status);
      }
    }
    const text = await response.text();
    if (response.ok) {
      return successResponse2(text);
    }
    return errorResponse2("PUSH_ERROR", text || "Request failed", response.status);
  }
  function extractSubPath(params) {
    return (params.action || []).join("/");
  }
  const GET = async (request, context) => {
    try {
      const params = await context?.params;
      const subPath = extractSubPath(params || {});
      return proxyToGateway(request, "GET", subPath);
    } catch (e) {
      return errorResponse2("INTERNAL_ERROR", String(e), 500);
    }
  };
  const POST = async (request, context) => {
    if (csrf) {
      const csrfError = validateCSRFToken(request);
      if (csrfError) {
        return errorResponse2("CSRF_ERROR", "CSRF validation failed", 403);
      }
    }
    try {
      const params = await context?.params;
      const subPath = extractSubPath(params || {});
      return proxyToGateway(request, "POST", subPath);
    } catch (e) {
      return errorResponse2("INTERNAL_ERROR", String(e), 500);
    }
  };
  const PUT = async (request, context) => {
    if (csrf) {
      const csrfError = validateCSRFToken(request);
      if (csrfError) {
        return errorResponse2("CSRF_ERROR", "CSRF validation failed", 403);
      }
    }
    try {
      const params = await context?.params;
      const subPath = extractSubPath(params || {});
      return proxyToGateway(request, "PUT", subPath);
    } catch (e) {
      return errorResponse2("INTERNAL_ERROR", String(e), 500);
    }
  };
  const DELETE = async (request, context) => {
    if (csrf) {
      const csrfError = validateCSRFToken(request);
      if (csrfError) {
        return errorResponse2("CSRF_ERROR", "CSRF validation failed", 403);
      }
    }
    try {
      const params = await context?.params;
      const subPath = extractSubPath(params || {});
      return proxyToGateway(request, "DELETE", subPath);
    } catch (e) {
      return errorResponse2("INTERNAL_ERROR", String(e), 500);
    }
  };
  return { GET, POST, PUT, DELETE };
}

// src/server/notifications.ts
function createNotificationRoutes(config) {
  const { apiKey, gatewayUrl } = config;
  async function proxyToGateway(request, method, subPath) {
    const targetUrl = `${gatewayUrl}/v1/notifications/${subPath}`;
    const headers2 = {
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    };
    const session = getSessionFromRequest(request);
    if (session?.sessionToken) {
      headers2["Authorization"] = `Bearer ${session.sessionToken}`;
    }
    const clientContext = extractClientContext(
      request
    );
    const contextHeaders = buildClientContextHeaders(clientContext);
    Object.assign(headers2, contextHeaders);
    const workspaceId = request.headers.get("x-sm-workspace-id");
    if (workspaceId) {
      headers2["x-sm-workspace-id"] = workspaceId;
    }
    const fetchOptions = {
      method,
      headers: headers2
    };
    if (method === "PATCH") {
      try {
        const body = await request.text();
        if (body) {
          fetchOptions.body = body;
        }
      } catch {
      }
    }
    let targetUrlWithQuery = targetUrl;
    if (method === "GET") {
      const url = new URL(request.url);
      if (url.search) {
        targetUrlWithQuery = `${targetUrl}${url.search}`;
      }
    }
    const response = await fetch(targetUrlWithQuery, fetchOptions);
    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: { "Content-Type": "application/json" }
    });
  }
  const GET = async (request, context) => {
    const params = await context.params;
    const subPath = params.action?.join("/") || "";
    return proxyToGateway(request, "GET", subPath);
  };
  const PATCH = async (request, context) => {
    const params = await context.params;
    const subPath = params.action?.join("/") || "";
    return proxyToGateway(request, "PATCH", subPath);
  };
  const DELETE = async (request, context) => {
    const params = await context.params;
    const subPath = params.action?.join("/") || "";
    return proxyToGateway(request, "DELETE", subPath);
  };
  return { GET, PATCH, DELETE };
}

// src/server/errors.ts
var ScaleMuleError = class extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = "ScaleMuleError";
  }
};
var CODE_TO_STATUS = {
  // Auth (401)
  unauthorized: 401,
  invalid_credentials: 401,
  session_expired: 401,
  token_expired: 401,
  token_invalid: 401,
  // Forbidden (403)
  forbidden: 403,
  email_not_verified: 403,
  phone_not_verified: 403,
  account_locked: 403,
  account_disabled: 403,
  mfa_required: 403,
  csrf_error: 403,
  origin_not_allowed: 403,
  // Not found (404)
  not_found: 404,
  // Conflict (409)
  conflict: 409,
  email_taken: 409,
  // Rate limiting (429)
  rate_limited: 429,
  quota_exceeded: 429,
  // Validation (400)
  validation_error: 400,
  weak_password: 400,
  invalid_email: 400,
  invalid_otp: 400,
  otp_expired: 400,
  // Server (500)
  internal_error: 500,
  // Network — SDK-generated (502/504)
  network_error: 502,
  timeout: 504
};
function errorCodeToStatus(code) {
  return CODE_TO_STATUS[code.toLowerCase()] || 400;
}
function unwrap(result2) {
  if (result2 !== null && result2 !== void 0 && typeof result2 === "object" && ("success" in result2 || "error" in result2) && "data" in result2) {
    const envelope = result2;
    if (envelope.error || envelope.success === false) {
      const err = envelope.error;
      const code = err?.code || "UNKNOWN_ERROR";
      const status = err?.status || errorCodeToStatus(code);
      throw new ScaleMuleError(
        code,
        err?.message || "An error occurred",
        status,
        err?.details
      );
    }
    return envelope.data;
  }
  return result2;
}

// src/server/handler.ts
function apiHandler(handler, options) {
  return async (request, routeContext) => {
    try {
      if (options?.csrf) {
        const csrfError = validateCSRFToken(request);
        if (csrfError) {
          throw new ScaleMuleError("CSRF_ERROR", csrfError, 403);
        }
      }
      let session;
      if (options?.auth) {
        session = await requireSession();
      }
      const rawParams = routeContext?.params ? await routeContext.params : {};
      const params = {};
      for (const [key, val] of Object.entries(rawParams)) {
        params[key] = Array.isArray(val) ? val.join("/") : val;
      }
      const context = {
        params,
        searchParams: request.nextUrl.searchParams,
        session
      };
      const result2 = await handler(request, context);
      if (result2 instanceof Response) return result2;
      if (result2 !== void 0) {
        return Response.json({ success: true, data: result2 }, { status: 200 });
      }
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof ScaleMuleError) {
        if (options?.onError) {
          const custom = options.onError(error);
          if (custom) return custom;
        }
        const safeMessage = error.status >= 500 ? "An unexpected error occurred" : error.message;
        if (error.status >= 500) {
          console.error("Internal API error:", error.message);
        }
        return Response.json(
          { success: false, error: { code: error.code, message: safeMessage } },
          { status: error.status }
        );
      }
      if (error instanceof Response) return error;
      console.error("Unhandled API error:", error);
      return Response.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
        { status: 500 }
      );
    }
  };
}
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature.startsWith("sha256=")) {
    return false;
  }
  const providedSig = signature.slice(7);
  const expectedSig = crypto$1.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto$1.timingSafeEqual(
      Buffer.from(providedSig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    return false;
  }
}
function parseWebhookEvent(payload) {
  return JSON.parse(payload);
}
async function registerVideoWebhook(url, options) {
  const sm = createServerClient(options?.clientConfig);
  const result2 = await sm.webhooks.create({
    webhook_name: options?.name || "Video Status Webhook",
    url,
    events: options?.events || ["video.ready", "video.failed"]
  });
  return {
    id: result2.id,
    secret: result2.secret
  };
}
function createWebhookRoutes(config = {}) {
  const POST = async (request) => {
    const signature = request.headers.get("x-webhook-signature");
    const body = await request.text();
    if (config.secret) {
      if (!signature || !verifyWebhookSignature(body, signature, config.secret)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    try {
      const event = parseWebhookEvent(body);
      switch (event.event) {
        case "video.ready":
          if (config.onVideoReady) {
            await config.onVideoReady(event.data);
          }
          break;
        case "video.failed":
          if (config.onVideoFailed) {
            await config.onVideoFailed(event.data);
          }
          break;
        case "video.uploaded":
          if (config.onVideoUploaded) {
            await config.onVideoUploaded(event.data);
          }
          break;
        case "video.transcoded":
          if (config.onVideoTranscoded) {
            await config.onVideoTranscoded(event.data);
          }
          break;
      }
      if (config.onEvent) {
        await config.onEvent(event);
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("Webhook handler error:", error);
      return new Response(JSON.stringify({ error: "Handler failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  };
  return { POST };
}

// src/server/webhook-handler.ts
function createWebhookHandler(config = {}) {
  return async (request) => {
    const signature = request.headers.get("x-webhook-signature");
    const body = await request.text();
    if (config.secret) {
      if (!signature || !verifyWebhookSignature(body, signature, config.secret)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    try {
      const event = parseWebhookEvent(body);
      if (config.onEvent && event.event && config.onEvent[event.event]) {
        await config.onEvent[event.event](event);
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  };
}

// node_modules/@scalemule/sdk/dist/flags/server.mjs
var import_semver = __toESM(require_semver2());
function hashToBucket(flagKey, identifier, salt) {
  const hash = crypto$1.createHash("sha256").update(`${salt}.${flagKey}.${identifier}`).digest();
  return hash.readUInt32BE(0) % 1e4;
}
function allConditionsMatch(conditions, context) {
  return conditions.every((c) => conditionMatches(c, context));
}
function conditionMatches(condition, context) {
  const attributeValue = getAttribute(context, condition.attribute);
  const op = condition.operator;
  if (op === "exists") return attributeValue !== void 0 && attributeValue !== null;
  if (op === "not_exists") return attributeValue === void 0 || attributeValue === null;
  if (attributeValue === void 0 || attributeValue === null) return false;
  switch (op) {
    case "eq":
      return compareValues(attributeValue, condition.value) === 0;
    case "neq":
      return compareValues(attributeValue, condition.value) !== 0;
    case "in":
      return candidateValues(condition).some((v) => compareValues(attributeValue, v) === 0);
    case "not_in":
      return !candidateValues(condition).some((v) => compareValues(attributeValue, v) === 0);
    case "contains":
      return containsValue(attributeValue, condition.value);
    case "starts_with":
      return typeof attributeValue === "string" && typeof condition.value === "string" ? attributeValue.startsWith(condition.value) : false;
    case "ends_with":
      return typeof attributeValue === "string" && typeof condition.value === "string" ? attributeValue.endsWith(condition.value) : false;
    case "gt":
      return compareValues(attributeValue, condition.value) === 1;
    case "gte": {
      const cmp = compareValues(attributeValue, condition.value);
      return cmp === 1 || cmp === 0;
    }
    case "lt":
      return compareValues(attributeValue, condition.value) === -1;
    case "lte": {
      const cmp = compareValues(attributeValue, condition.value);
      return cmp === -1 || cmp === 0;
    }
    case "regex": {
      if (typeof attributeValue !== "string" || typeof condition.value !== "string") return false;
      try {
        return new RegExp(condition.value).test(attributeValue);
      } catch {
        return false;
      }
    }
    case "semver_eq":
      return semverCmp(attributeValue, condition.value) === 0;
    case "semver_neq":
      return semverCmp(attributeValue, condition.value) !== 0;
    case "semver_gt":
      return semverCmp(attributeValue, condition.value) === 1;
    case "semver_gte": {
      const cmp = semverCmp(attributeValue, condition.value);
      return cmp === 1 || cmp === 0;
    }
    case "semver_lt":
      return semverCmp(attributeValue, condition.value) === -1;
    case "semver_lte": {
      const cmp = semverCmp(attributeValue, condition.value);
      return cmp === -1 || cmp === 0;
    }
    default:
      return false;
  }
}
function getAttribute(context, key) {
  switch (key) {
    case "user_id":
      return context.user_id;
    case "email":
      return context.email;
    case "session_id":
      return context.session_id;
    case "ip_address":
      return context.ip_address;
    case "user_agent":
      return context.user_agent;
    case "timestamp":
      return context.timestamp ?? (/* @__PURE__ */ new Date()).toISOString();
    default:
      return context[key];
  }
}
function candidateValues(condition) {
  if (condition.values && condition.values.length > 0) return condition.values;
  if (condition.value === void 0 || condition.value === null) return [];
  if (Array.isArray(condition.value)) return condition.value;
  return [condition.value];
}
function compareValues(actual, expected) {
  if (expected === void 0 || expected === null) return null;
  const numA = toNumber(actual);
  const numB = toNumber(expected);
  if (numA !== null && numB !== null) {
    if (numA < numB) return -1;
    if (numA > numB) return 1;
    return 0;
  }
  if (typeof actual === "boolean" && typeof expected === "boolean") {
    if (actual === expected) return 0;
    return actual ? 1 : -1;
  }
  const strA = toString(actual);
  const strB = toString(expected);
  if (strA !== null && strB !== null) {
    if (strA < strB) return -1;
    if (strA > strB) return 1;
    return 0;
  }
  return null;
}
function containsValue(actual, expected) {
  if (expected === void 0 || expected === null) return false;
  if (Array.isArray(actual)) {
    return actual.some((item) => compareValues(item, expected) === 0);
  }
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }
  return false;
}
function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  return null;
}
function toString(value) {
  if (typeof value === "string") return value;
  return null;
}
function semverCmp(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return null;
  try {
    const a = (0, import_semver.parse)(actual);
    const b = (0, import_semver.parse)(expected);
    if (!a || !b) return null;
    return (0, import_semver.compare)(a, b);
  } catch {
    return null;
  }
}
function evaluateFlag(flag, config, context, segmentIndex) {
  const effectiveDefault = flag.environment_default_value ?? flag.default_value;
  if (flag.status !== "active") {
    return result(flag, config.environment, effectiveDefault, "disabled");
  }
  if (!flag.environment_enabled) {
    return result(flag, config.environment, effectiveDefault, "disabled");
  }
  const bucketIdentifier = getBucketIdentifier(context);
  for (const rule of flag.rules) {
    if (!rule.enabled) continue;
    if (rule.segment_ids.length > 0) {
      const segmentMatched = rule.segment_ids.some((segId) => {
        const segment = segmentIndex ? segmentIndex.get(segId) : config.segments.find((s) => s.id === segId);
        if (!segment) return false;
        return userMatchesSegment(segment, context);
      });
      if (!segmentMatched) continue;
    }
    if (!allConditionsMatch(rule.conditions, context)) continue;
    if (rule.rollout_percentage !== null && rule.rollout_percentage !== void 0) {
      const bucket = hashToBucket(flag.flag_key, bucketIdentifier, config.rollout_salt);
      if (bucket >= rule.rollout_percentage) continue;
      return {
        flag_id: flag.flag_id,
        flag_key: flag.flag_key,
        environment: config.environment,
        value: rule.serve_value,
        reason: "rule_match",
        matched_rule_id: rule.id,
        variant_key: null,
        bucket
      };
    }
    return {
      flag_id: flag.flag_id,
      flag_key: flag.flag_key,
      environment: config.environment,
      value: rule.serve_value,
      reason: "rule_match",
      matched_rule_id: rule.id,
      variant_key: null,
      bucket: null
    };
  }
  if (flag.variants.length > 0) {
    const totalWeight = flag.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight > 0) {
      const bucket = hashToBucket(flag.flag_key, bucketIdentifier, config.rollout_salt);
      const scaled = Math.floor(bucket * totalWeight / 1e4);
      let cursor = 0;
      for (const variant of flag.variants) {
        cursor += variant.weight;
        if (scaled < cursor) {
          return {
            flag_id: flag.flag_id,
            flag_key: flag.flag_key,
            environment: config.environment,
            value: variant.value,
            reason: "variant",
            matched_rule_id: null,
            variant_key: variant.variant_key,
            bucket
          };
        }
      }
    }
  }
  return result(flag, config.environment, effectiveDefault, "default");
}
function getBucketIdentifier(context) {
  return context.user_id ?? context.session_id ?? context.email ?? context.ip_address ?? "anonymous";
}
function userMatchesSegment(segment, context) {
  const identifiers = [context.user_id, context.email, context.session_id].filter(
    (v) => v !== void 0 && v !== null
  );
  if (identifiers.some((id) => segment.excluded_users.includes(id))) {
    return false;
  }
  if (identifiers.some((id) => segment.included_users.includes(id))) {
    return true;
  }
  return allConditionsMatch(segment.conditions, context);
}
function result(flag, environment, value, reason) {
  return {
    flag_id: flag.flag_id,
    flag_key: flag.flag_key,
    environment,
    value,
    reason,
    matched_rule_id: null,
    variant_key: null,
    bucket: null
  };
}
var FlagClient = class {
  constructor(options) {
    this.config = null;
    this.flagIndex = /* @__PURE__ */ new Map();
    this.segmentIndex = /* @__PURE__ */ new Map();
    this.lastETag = "";
    this.streamState = "idle";
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.telemetryTimer = null;
    this.abortController = null;
    this.initPromise = null;
    this.telemetryCounters = /* @__PURE__ */ new Map();
    this.isShuttingDown = false;
    this.streamConnectInFlight = false;
    this.apiKey = options.apiKey;
    this.environment = options.environment;
    this.gatewayUrl = options.gatewayUrl;
  }
  async init() {
    this.isShuttingDown = false;
    if (this.config) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }
  async doInit() {
    const resp = await fetch(`${this.gatewayUrl}/v1/flags/config?environment=${encodeURIComponent(this.environment)}`, {
      headers: { "x-api-key": this.apiKey }
    });
    if (resp.status === 403) throw new Error("Secret API key required for /config");
    if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`);
    const json = await resp.json();
    this.config = json.data;
    this.buildIndexes();
    this.lastETag = resp.headers.get("etag") || "";
    this.connectStream();
    this.startTelemetryFlush();
  }
  buildIndexes() {
    this.flagIndex.clear();
    this.segmentIndex.clear();
    if (!this.config) return;
    for (const flag of this.config.flags) {
      this.flagIndex.set(flag.flag_key, flag);
    }
    for (const segment of this.config.segments) {
      this.segmentIndex.set(segment.id, segment);
    }
  }
  evaluate(flagKey, context) {
    if (!this.config) throw new Error("FlagClient not initialized \u2014 call init() first");
    const flagConfig = this.flagIndex.get(flagKey);
    if (!flagConfig) {
      return {
        flag_id: "",
        flag_key: flagKey,
        environment: this.environment,
        value: null,
        reason: "not_found",
        matched_rule_id: null,
        variant_key: null,
        bucket: null
      };
    }
    const result2 = evaluateFlag(flagConfig, this.config, context, this.segmentIndex);
    this.recordTelemetry(result2);
    return result2;
  }
  evaluateBatch(flagKeys, context) {
    if (!this.config) throw new Error("FlagClient not initialized \u2014 call init() first");
    const results = {};
    for (const key of flagKeys) {
      const flagConfig = this.flagIndex.get(key);
      if (flagConfig) {
        const result2 = evaluateFlag(flagConfig, this.config, context, this.segmentIndex);
        this.recordTelemetry(result2);
        results[key] = result2;
      }
    }
    return results;
  }
  async shutdown() {
    this.isShuttingDown = true;
    this.streamState = "idle";
    this.abortController?.abort();
    this.abortController = null;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    await this.flushTelemetry();
  }
  // ======== SSE Streaming ========
  async connectStream() {
    if (this.isShuttingDown || this.streamState === "streaming" || this.streamConnectInFlight) return;
    this.streamConnectInFlight = true;
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    const shouldResumePolling = this.streamState !== "polling";
    let startPolling = shouldResumePolling;
    try {
      const resp = await fetch(
        `${this.gatewayUrl}/v1/flags/stream?environment=${encodeURIComponent(this.environment)}`,
        {
          headers: {
            "x-api-key": this.apiKey,
            "Last-Event-ID": String(this.config?.version ?? 0)
          },
          signal: abortController.signal
        }
      );
      if (resp.ok && resp.body) {
        this.streamState = "streaming";
        this.stopPolling();
        startPolling = false;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            this.handleSseFrame(frame);
          }
        }
        if (this.streamState === "streaming") {
          this.streamState = "idle";
          startPolling = true;
        }
      }
    } catch {
      startPolling = !abortController.signal.aborted && shouldResumePolling;
    } finally {
      this.streamConnectInFlight = false;
    }
    if (!this.isShuttingDown && startPolling) {
      this.startPolling();
    }
  }
  handleSseFrame(frame) {
    let eventType = "";
    let data = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (eventType === "config" && data) {
      try {
        const parsed = JSON.parse(data);
        const newConfig = parsed.data;
        if (newConfig && newConfig.version !== void 0) {
          this.config = newConfig;
          this.buildIndexes();
        }
      } catch {
      }
    }
  }
  // ======== Polling Fallback ========
  startPolling() {
    if (this.streamState === "polling") return;
    this.streamState = "polling";
    this.pollTimer = setInterval(() => void this.pollConfig(), 6e4);
    this.reconnectTimer = setInterval(() => void this.connectStream(), 3e5);
  }
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  async pollConfig() {
    try {
      const headers2 = { "x-api-key": this.apiKey };
      if (this.lastETag) headers2["if-none-match"] = this.lastETag;
      const resp = await fetch(
        `${this.gatewayUrl}/v1/flags/config?environment=${encodeURIComponent(this.environment)}`,
        { headers: headers2 }
      );
      if (resp.status === 304) return;
      if (!resp.ok) return;
      const json = await resp.json();
      this.config = json.data;
      this.buildIndexes();
      this.lastETag = resp.headers.get("etag") || "";
    } catch {
    }
  }
  // ======== Telemetry ========
  recordTelemetry(evaluation) {
    const key = `${evaluation.flag_key}:${evaluation.reason}:${String(evaluation.value)}`;
    const existing = this.telemetryCounters.get(key);
    if (existing) {
      existing.count++;
      if (evaluation.value === true) existing.true_count++;
      else if (evaluation.value === false) existing.false_count++;
    } else {
      this.telemetryCounters.set(key, {
        flag_key: evaluation.flag_key,
        flag_id: evaluation.flag_id,
        reason: evaluation.reason,
        count: 1,
        true_count: evaluation.value === true ? 1 : 0,
        false_count: evaluation.value === false ? 1 : 0
      });
    }
  }
  startTelemetryFlush() {
    this.telemetryTimer = setInterval(() => void this.flushTelemetry(), 6e4);
  }
  async flushTelemetry() {
    if (this.telemetryCounters.size === 0) return;
    const evaluations = Array.from(this.telemetryCounters.values());
    this.telemetryCounters.clear();
    try {
      await fetch(`${this.gatewayUrl}/v1/flags/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey
        },
        body: JSON.stringify({
          environment: this.environment,
          evaluations
        })
      });
    } catch {
      for (const counter of evaluations) {
        const key = `${counter.flag_key}:${counter.reason}:${counter.count}`;
        const existing = this.telemetryCounters.get(key);
        if (existing) {
          existing.count += counter.count;
          existing.true_count += counter.true_count;
          existing.false_count += counter.false_count;
        } else {
          this.telemetryCounters.set(key, counter);
        }
      }
    }
  }
};

// src/server/bootstrap-flags.ts
var _clients = /* @__PURE__ */ new Map();
var _initPromises = /* @__PURE__ */ new Map();
var _serverClient = null;
function getServerClient() {
  if (!_serverClient) {
    _serverClient = createServerClient();
  }
  return _serverClient;
}
var GATEWAY_URLS2 = {
  dev: "https://api-dev.scalemule.com",
  prod: "https://api.scalemule.com"
};
function resolveGatewayUrl2() {
  if (process.env.SCALEMULE_API_URL) return process.env.SCALEMULE_API_URL;
  const env = process.env.SCALEMULE_ENV || "prod";
  return GATEWAY_URLS2[env] || GATEWAY_URLS2.prod;
}
async function getFlagClient(environment) {
  const apiKey = process.env.SCALEMULE_API_KEY;
  const gatewayUrl = resolveGatewayUrl2();
  const key = `${environment}:${gatewayUrl}`;
  const existing = _clients.get(key);
  if (existing) return existing;
  const pending = _initPromises.get(key);
  if (pending) return pending;
  const promise = (async () => {
    const client = new FlagClient({ apiKey, environment, gatewayUrl });
    await Promise.race([
      client.init(),
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error("FlagClient init timeout")), 3e3)
      )
    ]);
    _clients.set(key, client);
    return client;
  })();
  _initPromises.set(key, promise);
  try {
    return await promise;
  } catch (e) {
    _initPromises.delete(key);
    throw e;
  }
}
var _shutdownRegistered = false;
function ensureShutdownHook() {
  if (_shutdownRegistered) return;
  _shutdownRegistered = true;
  if (typeof process !== "undefined" && typeof process.once === "function") {
    process.once("SIGTERM", async () => {
      const shutdowns = Array.from(_clients.values()).map((c) => c.shutdown());
      await Promise.allSettled(shutdowns);
    });
  }
}
function extractClientIp(hdrs) {
  const realIp = hdrs.get("x-real-ip") || hdrs.get("x-real-client-ip");
  const forwardedFor = hdrs.get("x-forwarded-for");
  return realIp || (forwardedFor ? forwardedFor.split(",")[0].trim() : void 0);
}
async function getBootstrapFlags(flagKeys, environment = "prod", extraContext = {}, cacheTtlMs = 0) {
  try {
    const client = await getFlagClient(environment);
    ensureShutdownHook();
    const hdrs = await headers.headers();
    const clientIp = extractClientIp(hdrs);
    const context = { ...extraContext };
    if (clientIp) context.ip_address = clientIp;
    return client.evaluateBatch(flagKeys, context);
  } catch {
    try {
      const hdrs = await headers.headers();
      const clientIp = extractClientIp(hdrs);
      const context = { ...extraContext };
      if (clientIp) context.ip_address = clientIp;
      const result2 = await getServerClient().flags.evaluateBatch(flagKeys, context, environment);
      return result2 || {};
    } catch {
      return {};
    }
  }
}
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
function matchesPattern(pathname, patterns) {
  return patterns.some((pattern) => {
    if (pattern === pathname) return true;
    if (pattern.includes("*") || pattern.includes("?")) {
      return globToRegex(pattern).test(pathname);
    }
    if (pathname.startsWith(pattern + "/")) return true;
    return false;
  });
}
function createAuthMiddleware(config = {}) {
  const {
    protectedRoutes = [],
    publicRoutes = [],
    authOnlyPublic = [],
    redirectTo = "/login",
    redirectAuthenticated,
    skipValidation = false,
    onUnauthorized
  } = config;
  return async function middleware(request) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/api/auth")) {
      return server.NextResponse.next();
    }
    if (publicRoutes.length > 0 && matchesPattern(pathname, publicRoutes)) {
      if (redirectAuthenticated && authOnlyPublic.length > 0 && matchesPattern(pathname, authOnlyPublic)) {
        const session2 = getSessionFromRequest(request);
        if (session2) {
          return server.NextResponse.redirect(new URL(redirectAuthenticated, request.url));
        }
      }
      return server.NextResponse.next();
    }
    const requiresAuth = protectedRoutes.length === 0 || matchesPattern(pathname, protectedRoutes);
    if (!requiresAuth) {
      return server.NextResponse.next();
    }
    const session = getSessionFromRequest(request);
    if (!session) {
      if (onUnauthorized) {
        return onUnauthorized(request);
      }
      const redirectUrl = new URL(redirectTo, request.url);
      redirectUrl.searchParams.set("callbackUrl", pathname);
      return server.NextResponse.redirect(redirectUrl);
    }
    if (!skipValidation) {
      try {
        const sm = createServerClient();
        await sm.auth.me(session.sessionToken);
      } catch (error) {
        console.error("[ScaleMule Middleware] Session validation failed, blocking request:", error);
        const response = server.NextResponse.redirect(new URL(redirectTo, request.url));
        response.cookies.delete(SESSION_COOKIE_NAME);
        response.cookies.delete(USER_ID_COOKIE_NAME);
        return response;
      }
    }
    return server.NextResponse.next();
  };
}
function withAuth(config = {}) {
  const { redirectTo = "/login", onUnauthorized } = config;
  return function middleware(request) {
    const session = getSessionFromRequest(request);
    if (!session) {
      if (onUnauthorized) {
        return onUnauthorized(request);
      }
      const redirectUrl = new URL(redirectTo, request.url);
      redirectUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
      return server.NextResponse.redirect(redirectUrl);
    }
    return server.NextResponse.next();
  };
}
var OAUTH_STATE_COOKIE_NAME = "sm_oauth_state";
function setOAuthState(response, state) {
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Lax allows the cookie to be sent on OAuth redirects
    path: "/",
    maxAge: 60 * 10
    // 10 minutes - OAuth flows should complete quickly
  });
  return response;
}
function validateOAuthState(request, callbackState) {
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;
  if (!cookieState) {
    return "Missing OAuth state cookie - session may have expired";
  }
  if (!callbackState) {
    return "Missing OAuth state in callback";
  }
  if (!constantTimeEqual(cookieState, callbackState)) {
    return "OAuth state mismatch - possible CSRF attack";
  }
  return void 0;
}
async function validateOAuthStateAsync(callbackState) {
  const cookieStore = await headers.cookies();
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value;
  if (!cookieState) {
    return "Missing OAuth state cookie - session may have expired";
  }
  if (!callbackState) {
    return "Missing OAuth state in callback";
  }
  if (!constantTimeEqual(cookieState, callbackState)) {
    return "OAuth state mismatch - possible CSRF attack";
  }
  return void 0;
}
function clearOAuthState(response) {
  response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
  return response;
}

// src/server/secrets.ts
var DEFAULT_CACHE_TTL_MS = 5 * 60 * 1e3;
var secretsCache = {};
var globalConfig = {};
function configureSecrets(config) {
  globalConfig = { ...globalConfig, ...config };
}
async function getAppSecret(key) {
  const cacheTtl = globalConfig.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const noCache = globalConfig.noCache ?? false;
  if (!noCache) {
    const cached = secretsCache[key];
    if (cached && Date.now() - cached.cachedAt < cacheTtl) {
      return cached.value;
    }
  }
  try {
    const client = createServerClient();
    const result2 = await client.secrets.get(key);
    if (!noCache && result2) {
      secretsCache[key] = {
        value: result2.value,
        version: result2.version,
        cachedAt: Date.now()
      };
    }
    return result2?.value;
  } catch (error) {
    if (error instanceof ScaleMuleApiError && error.code === "SECRET_NOT_FOUND") {
      return void 0;
    }
    console.error(`[ScaleMule Secrets] Error fetching ${key}:`, error);
    return void 0;
  }
}
async function requireAppSecret(key) {
  const value = await getAppSecret(key);
  if (value === void 0) {
    throw new Error(
      `Required secret '${key}' not found in ScaleMule vault. Configure it in the ScaleMule dashboard or use the SDK: scalemule.secrets.set('${key}', value)`
    );
  }
  return value;
}
async function getAppSecretOrDefault(key, fallback) {
  const value = await getAppSecret(key);
  return value ?? fallback;
}
function invalidateSecretCache(key) {
  if (key) {
    delete secretsCache[key];
  } else {
    Object.keys(secretsCache).forEach((k) => delete secretsCache[k]);
  }
}
async function prefetchSecrets(keys) {
  await Promise.all(keys.map((key) => getAppSecret(key)));
}

// src/server/bundles.ts
var DEFAULT_CACHE_TTL_MS2 = 5 * 60 * 1e3;
var bundlesCache = {};
var globalConfig2 = {};
function configureBundles(config) {
  globalConfig2 = { ...globalConfig2, ...config };
}
async function getBundle(key, resolve = true) {
  const cacheTtl = globalConfig2.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS2;
  const noCache = globalConfig2.noCache ?? false;
  if (!noCache) {
    const cached = bundlesCache[key];
    if (cached && Date.now() - cached.cachedAt < cacheTtl) {
      return cached.data;
    }
  }
  try {
    const client = createServerClient();
    const result2 = await client.bundles.get(key, resolve);
    if (!noCache && result2) {
      bundlesCache[key] = {
        type: result2.type,
        data: result2.data,
        version: result2.version,
        inheritsFrom: result2.inherits_from,
        cachedAt: Date.now()
      };
    }
    return result2?.data;
  } catch (error) {
    if (error instanceof ScaleMuleApiError && error.code === "BUNDLE_NOT_FOUND") {
      return void 0;
    }
    console.error(`[ScaleMule Bundles] Error fetching ${key}:`, error);
    return void 0;
  }
}
async function requireBundle(key, resolve = true) {
  const value = await getBundle(key, resolve);
  if (value === void 0) {
    throw new Error(
      `Required bundle '${key}' not found in ScaleMule vault. Configure it in the ScaleMule dashboard`
    );
  }
  return value;
}
async function getMySqlBundle(key) {
  const bundle = await getBundle(key);
  if (!bundle) return void 0;
  const { host, port, username, password, database, ssl_mode } = bundle;
  const encodedPassword = encodeURIComponent(password);
  let connectionUrl = `mysql://${username}:${encodedPassword}@${host}:${port}/${database}`;
  if (ssl_mode) {
    connectionUrl += `?ssl_mode=${ssl_mode}`;
  }
  return { ...bundle, connectionUrl };
}
async function getPostgresBundle(key) {
  const bundle = await getBundle(key);
  if (!bundle) return void 0;
  const { host, port, username, password, database, ssl_mode } = bundle;
  const encodedPassword = encodeURIComponent(password);
  let connectionUrl = `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`;
  if (ssl_mode) {
    connectionUrl += `?sslmode=${ssl_mode}`;
  }
  return { ...bundle, connectionUrl };
}
async function getRedisBundle(key) {
  const bundle = await getBundle(key);
  if (!bundle) return void 0;
  const { host, port, password, database, ssl } = bundle;
  let connectionUrl = ssl ? "rediss://" : "redis://";
  if (password) {
    connectionUrl += `:${encodeURIComponent(password)}@`;
  }
  connectionUrl += `${host}:${port}`;
  if (database !== void 0) {
    connectionUrl += `/${database}`;
  }
  return { ...bundle, connectionUrl };
}
async function getS3Bundle(key) {
  return getBundle(key);
}
async function getOAuthBundle(key) {
  return getBundle(key);
}
async function getSmtpBundle(key) {
  return getBundle(key);
}
function invalidateBundleCache(key) {
  if (key) {
    delete bundlesCache[key];
  } else {
    Object.keys(bundlesCache).forEach((k) => delete bundlesCache[k]);
  }
}
async function prefetchBundles(keys) {
  await Promise.all(keys.map((key) => getBundle(key)));
}

// src/server/security-headers.ts
var DEFAULT_PERMISSIONS_POLICY = {
  // Conference track features — allow self-origin only.
  camera: "self",
  microphone: "self",
  "display-capture": "self",
  // Deny-by-default for features the SDK never uses.
  geolocation: "()",
  payment: "()",
  "publickey-credentials-get": "self",
  usb: "()",
  serial: "()",
  bluetooth: "()"
};
function formatPermissionsDirective(feature, value) {
  if (value === "*") return `${feature}=*`;
  if (value === "()" || Array.isArray(value) && value.length === 0) {
    return `${feature}=()`;
  }
  if (value === "self") return `${feature}=(self)`;
  const origins = value;
  const parts = origins.map((o) => o === "self" ? "self" : `"${o}"`);
  return `${feature}=(${parts.join(" ")})`;
}
function buildSecurityHeaders(opts = {}) {
  const headers2 = [];
  const includeHsts = opts.includeHsts ?? true;
  const hstsMaxAge = opts.hstsMaxAgeSeconds ?? 31536e3;
  if (includeHsts && hstsMaxAge > 0) {
    const parts = [`max-age=${hstsMaxAge}`];
    if (opts.hstsIncludeSubDomains ?? true) parts.push("includeSubDomains");
    if (opts.hstsPreload ?? false) parts.push("preload");
    headers2.push({
      key: "Strict-Transport-Security",
      value: parts.join("; ")
    });
  }
  const frameOptions = opts.frameOptions === void 0 ? "DENY" : opts.frameOptions;
  if (frameOptions !== null) {
    headers2.push({ key: "X-Frame-Options", value: frameOptions });
  }
  const contentTypeOptions = opts.contentTypeOptions === void 0 ? "nosniff" : opts.contentTypeOptions;
  if (contentTypeOptions !== null) {
    headers2.push({ key: "X-Content-Type-Options", value: contentTypeOptions });
  }
  headers2.push({
    key: "Referrer-Policy",
    value: opts.referrerPolicy ?? "strict-origin-when-cross-origin"
  });
  const xss = opts.xssProtection === void 0 ? "0" : opts.xssProtection;
  if (xss !== null) {
    headers2.push({ key: "X-XSS-Protection", value: xss });
  }
  const permissions = opts.permissionsPolicy === void 0 ? DEFAULT_PERMISSIONS_POLICY : opts.permissionsPolicy;
  if (permissions !== null) {
    const directives = Object.entries(permissions).map(([feature, value]) => formatPermissionsDirective(feature, value)).join(", ");
    headers2.push({ key: "Permissions-Policy", value: directives });
  }
  if (opts.extraHeaders?.length) {
    const byKey = new Map(headers2.map((h) => [h.key.toLowerCase(), h]));
    for (const extra of opts.extraHeaders) {
      byKey.set(extra.key.toLowerCase(), extra);
    }
    return Array.from(byKey.values());
  }
  return headers2;
}

exports.CSRF_COOKIE_NAME = CSRF_COOKIE_NAME;
exports.CSRF_HEADER_NAME = CSRF_HEADER_NAME;
exports.DEFAULT_PERMISSIONS_POLICY = DEFAULT_PERMISSIONS_POLICY;
exports.KNOWN_ACCOUNTS_COOKIE_NAME = KNOWN_ACCOUNTS_COOKIE_NAME;
exports.OAUTH_STATE_COOKIE_NAME = OAUTH_STATE_COOKIE_NAME;
exports.SESSION_COOKIE_NAME = SESSION_COOKIE_NAME;
exports.SM_LEDVERY_ACCESS_TOKEN_COOKIE = SM_LEDVERY_ACCESS_TOKEN_COOKIE;
exports.SM_LEDVERY_ID_TOKEN_COOKIE = SM_LEDVERY_ID_TOKEN_COOKIE;
exports.SM_LEDVERY_NONCE_COOKIE = SM_LEDVERY_NONCE_COOKIE;
exports.SM_LEDVERY_PKCE_VERIFIER_COOKIE = SM_LEDVERY_PKCE_VERIFIER_COOKIE;
exports.SM_LEDVERY_STATE_COOKIE = SM_LEDVERY_STATE_COOKIE;
exports.ScaleMuleError = ScaleMuleError;
exports.ScaleMuleServer = ScaleMuleServer;
exports.USER_ID_COOKIE_NAME = USER_ID_COOKIE_NAME;
exports.apiHandler = apiHandler;
exports.appendKnownAccountCookie = appendKnownAccountCookie;
exports.buildClientContextHeaders = buildClientContextHeaders;
exports.buildFlagContext = buildFlagContext;
exports.buildSecurityHeaders = buildSecurityHeaders;
exports.clearKnownAccountsCookie = clearKnownAccountsCookie;
exports.clearOAuthState = clearOAuthState;
exports.clearSession = clearSession;
exports.configureBundles = configureBundles;
exports.configureSecrets = configureSecrets;
exports.createAnalyticsRoutes = createAnalyticsRoutes;
exports.createAuthMiddleware = createAuthMiddleware;
exports.createAuthRoutes = createAuthRoutes;
exports.createLedveryRoutes = createLedveryRoutes;
exports.createNotificationRoutes = createNotificationRoutes;
exports.createPushRoutes = createPushRoutes;
exports.createServerClient = createServerClient;
exports.createWebhookHandler = createWebhookHandler;
exports.createWebhookRoutes = createWebhookRoutes;
exports.errorCodeToStatus = errorCodeToStatus;
exports.extractClientContext = extractClientContext;
exports.extractClientContextFromReq = extractClientContextFromReq;
exports.generateCSRFToken = generateCSRFToken;
exports.getAppSecret = getAppSecret;
exports.getAppSecretOrDefault = getAppSecretOrDefault;
exports.getBootstrapFlags = getBootstrapFlags;
exports.getBundle = getBundle;
exports.getCSRFToken = getCSRFToken;
exports.getKnownAccountsCookieRaw = getKnownAccountsCookieRaw;
exports.getKnownAccountsFromRequest = getKnownAccountsFromRequest;
exports.getLedverySession = getLedverySession;
exports.getMySqlBundle = getMySqlBundle;
exports.getOAuthBundle = getOAuthBundle;
exports.getPostgresBundle = getPostgresBundle;
exports.getRedisBundle = getRedisBundle;
exports.getS3Bundle = getS3Bundle;
exports.getSession = getSession;
exports.getSessionFromRequest = getSessionFromRequest;
exports.getSmtpBundle = getSmtpBundle;
exports.invalidateBundleCache = invalidateBundleCache;
exports.invalidateSecretCache = invalidateSecretCache;
exports.isSafeRedirect = isSafeRedirect;
exports.normalizeKnownAccountsCookie = normalizeKnownAccountsCookie;
exports.parseWebhookEvent = parseWebhookEvent;
exports.prefetchBundles = prefetchBundles;
exports.prefetchSecrets = prefetchSecrets;
exports.registerVideoWebhook = registerVideoWebhook;
exports.removeKnownAccountFromCookie = removeKnownAccountFromCookie;
exports.requireAppSecret = requireAppSecret;
exports.requireBundle = requireBundle;
exports.requireSession = requireSession;
exports.resolveGatewayUrl = resolveGatewayUrl;
exports.setOAuthState = setOAuthState;
exports.unwrap = unwrap;
exports.validateCSRFToken = validateCSRFToken;
exports.validateCSRFTokenAsync = validateCSRFTokenAsync;
exports.validateOAuthState = validateOAuthState;
exports.validateOAuthStateAsync = validateOAuthStateAsync;
exports.validateSafeRedirect = validateSafeRedirect;
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.withAuth = withAuth;
exports.withCSRFProtection = withCSRFProtection;
exports.withCSRFToken = withCSRFToken;
exports.withSession = withSession;
