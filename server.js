var http = require('http')
//    , fs = require('fs')
    , jsdom = require('jsdom')
    , xml2js = require('xml2js')
    , $ = require('jquery')
    , mustache = require('mustache');

// this keeps a queue of opened file descriptors, and will make
// fs operations wait until some have closed before trying to open more.

var fs = require("fs")

// there is such a thing as TOO graceful.
if (fs.open === gracefulOpen) return

var FastList = require("fast-list")
  , queue = new FastList()
  , curOpen = 0
  , constants = require("constants")


exports = module.exports = fs


fs.MIN_MAX_OPEN = 64
fs.MAX_OPEN = 1024

var originalOpen = fs.open
  , originalOpenSync = fs.openSync
  , originalClose = fs.close
  , originalCloseSync = fs.closeSync


// prevent EMFILE errors
function OpenReq (path, flags, mode, cb) {
  this.path = path
  this.flags = flags
  this.mode = mode
  this.cb = cb
}

function noop () {}

fs.open = gracefulOpen

function gracefulOpen (path, flags, mode, cb) {
  if (typeof mode === "function") cb = mode, mode = null
  if (typeof cb !== "function") cb = noop

  if (curOpen >= fs.MAX_OPEN) {
    queue.push(new OpenReq(path, flags, mode, cb))
    setTimeout(flush)
    return
  }
  open(path, flags, mode, function (er, fd) {
    if (er && er.code === "EMFILE" && curOpen > fs.MIN_MAX_OPEN) {
      // that was too many.  reduce max, get back in queue.
      // this should only happen once in a great while, and only
      // if the ulimit -n is set lower than 1024.
      fs.MAX_OPEN = curOpen - 1
      return fs.open(path, flags, mode, cb)
    }
    cb(er, fd)
  })
}

function open (path, flags, mode, cb) {
  cb = cb || noop
  curOpen ++
  originalOpen.call(fs, path, flags, mode, function (er, fd) {
    if (er) {
      onclose()
    }

    cb(er, fd)
  })
}

fs.openSync = function (path, flags, mode) {
  curOpen ++
  return originalOpenSync.call(fs, path, flags, mode)
}

function onclose () {
  curOpen --
  flush()
}

function flush () {
  while (curOpen < fs.MAX_OPEN) {
    var req = queue.shift()
    if (!req) break
    open(req.path, req.flags || "r", req.mode || 0777, req.cb)
  }
  if (queue.length === 0) return
}

fs.close = function (fd, cb) {
  cb = cb || noop
  originalClose.call(fs, fd, function (er) {
    onclose()
    cb(er)
  })
}

fs.closeSync = function (fd) {
  onclose()
  return originalCloseSync.call(fs, fd)
}


// (re-)implement some things that are known busted or missing.

var constants = require("constants")

// lchmod, broken prior to 0.6.2
// back-port the fix here.
if (constants.hasOwnProperty('O_SYMLINK') &&
    process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
  fs.lchmod = function (path, mode, callback) {
    callback = callback || noop
    fs.open( path
           , constants.O_WRONLY | constants.O_SYMLINK
           , mode
           , function (err, fd) {
      if (err) {
        callback(err)
        return
      }
      // prefer to return the chmod error, if one occurs,
      // but still try to close, and report closing errors if they occur.
      fs.fchmod(fd, mode, function (err) {
        fs.close(fd, function(err2) {
          callback(err || err2)
        })
      })
    })
  }

  fs.lchmodSync = function (path, mode) {
    var fd = fs.openSync(path, constants.O_WRONLY | constants.O_SYMLINK, mode)

    // prefer to return the chmod error, if one occurs,
    // but still try to close, and report closing errors if they occur.
    var err, err2
    try {
      var ret = fs.fchmodSync(fd, mode)
    } catch (er) {
      err = er
    }
    try {
      fs.closeSync(fd)
    } catch (er) {
      err2 = er
    }
    if (err || err2) throw (err || err2)
    return ret
  }
}


// lstat on windows, missing from early 0.5 versions
// replacing with stat isn't quite perfect, but good enough to get by.
if (process.platform === "win32" && !process.binding("fs").lstat) {
  fs.lstat = fs.stat
  fs.lstatSync = fs.statSync
}


// lutimes implementation, or no-op
if (!fs.lutimes) {
  if (constants.hasOwnProperty("O_SYMLINK")) {
    fs.lutimes = function (path, at, mt, cb) {
      fs.open(path, constants.O_SYMLINK, function (er, fd) {
        cb = cb || noop
        if (er) return cb(er)
        fs.futimes(fd, at, mt, function (er) {
          fs.close(fd, function (er2) {
            return cb(er || er2)
          })
        })
      })
    }

    fs.lutimesSync = function (path, at, mt) {
      var fd = fs.openSync(path, constants.O_SYMLINK)
        , err
        , err2
        , ret

      try {
        var ret = fs.futimesSync(fd, at, mt)
      } catch (er) {
        err = er
      }
      try {
        fs.closeSync(fd)
      } catch (er) {
        err2 = er
      }
      if (err || err2) throw (err || err2)
      return ret
    }

  } else if (fs.utimensat && constants.hasOwnProperty("AT_SYMLINK_NOFOLLOW")) {
    // maybe utimensat will be bound soonish?
    fs.lutimes = function (path, at, mt, cb) {
      fs.utimensat(path, at, mt, constants.AT_SYMLINK_NOFOLLOW, cb)
    }

    fs.lutimesSync = function (path, at, mt) {
      return fs.utimensatSync(path, at, mt, constants.AT_SYMLINK_NOFOLLOW)
    }

  } else {
    fs.lutimes = function (_a, _b, _c, cb) { process.nextTick(cb) }
    fs.lutimesSync = function () {}
  }
}


// https://github.com/isaacs/node-graceful-fs/issues/4
// Chown should not fail on einval or eperm if non-root.

fs.chown = chownFix(fs.chown)
fs.fchown = chownFix(fs.fchown)
fs.lchown = chownFix(fs.lchown)

fs.chownSync = chownFixSync(fs.chownSync)
fs.fchownSync = chownFixSync(fs.fchownSync)
fs.lchownSync = chownFixSync(fs.lchownSync)

function chownFix (orig) {
  if (!orig) return orig
  return function (target, uid, gid, cb) {
    return orig.call(fs, target, uid, gid, function (er, res) {
      if (chownErOk(er)) er = null
      cb(er, res)
    })
  }
}

function chownFixSync (orig) {
  if (!orig) return orig
  return function (target, uid, gid) {
    try {
      return orig.call(fs, target, uid, gid)
    } catch (er) {
      if (!chownErOk(er)) throw er
    }
  }
}

function chownErOk (er) {
  // if there's no getuid, or if getuid() is something other than 0,
  // and the error is EINVAL or EPERM, then just ignore it.
  // This specific case is a silent failure in cp, install, tar,
  // and most other unix tools that manage permissions.
  // When running as root, or if other types of errors are encountered,
  // then it's strict.
  if (!er || (!process.getuid || process.getuid() !== 0)
      && (er.code === "EINVAL" || er.code === "EPERM")) return true
}


http.createServer(
    function (req, res) {
        var thisVal = '<div style="border:1px dashed #ff0"></div>'
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('code generator - generating static html templates \n');

        if (!String.prototype.supplant) {
            String.prototype.supplant = function (o) {
                return this.replace(/{([^{}]*)}/g,
                    function (a, b) {
                        var r = o[b];
                        return typeof r === 'string' || typeof r === 'number' ? r : a;
                    }
                );
            };
        }

        var parser = new xml2js.Parser()
        fs.readFile(__dirname + '/profiles.xml', function(err, data) {
            parser.parseString(data, function(err, result) {
                var jsonData = JSON.stringify(result)

                parseSupplant(jsonData)
            })
        })

        function parseSupplant(jsonData) {

            var toJSON = JSON.parse(jsonData)

            $(toJSON.profile).each(function() {
                console.log(this.id)
                console.log(this.name)
                var userId = this.id,
                    userName = this.name

// todo: fill in actual template markup
                var template = '<div id="overlay">' +
                    '<div id="our-leaders-overlay">' +
                    '<div id="left">{firstname}' +
                    '<img src=/images/global/' + this.smallImg + '>' +
                    '<ul class="info-list">' +
                    '<li><h4>NEWS &amp; COMMENTARY</h4></li>' +
                    '<li><a href="#" class="bio-info-link">Latest speeches</a></li>' +
                    '<li><a href="#" class="bio-info-link">Wall Street Journal profile(requires login)</a></li>' +
                    '<li><a href="#" class="bio-info-link">Harvard U.S. competitiveness panel address</a></li>' +
                    '<li><a href="#" class="bio-info-link">Davos interview</a></li>' +
                    '<li><a href="#" class="bio-info-link">On Citi\'s strategy for the future</a></li>' +
                    '</ul>' +
                    '</div>' +
                    '<div id=right>' +
                    '<div id=header>' +
                    '<h2>{name}</h2>' +
                    '<div id=wrap>' +
                    '<p>{title1}</p>' +
                    '<p>{title2}</p>' +
                    '</div>' +
                    '<ul class=small-list>' +
                    '<li class="follow">Follow</li>' +
                    '<li><a class="icosm facebook" href="#"><span>Facebook</span></a></li>' +
                    '<li><a class="icosm twitter" href="#"><span>Twitter</span></a></li>' +
                    '<li><a class="icosm linkedin" href="#"><span>Linked-In</span></a></li>' +
                    '</ul>' +
                    '<div id=links>' +
                    '<a href="#" class="bio-info-link">Section 16 Reports</a><br />' +
                    '<a href="#" class="bio-info-link">Download Photo</a>' +
                    '</div>' +
                    '<div id=scroller-wrapper>' +
                    '<div id=content>' +
                    '<div id=content-overflow>' +
                    '<div id=content-inner>{bio}' +
                    '</div>' +
                    '</div>' +
                    '<div id=scrolltrack>' +
                    '<div id=relative>' +
                    '<a href=# class=scrubber></a>' +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '</div>'

                var profileDetails = template.supplant(this)

// todo: generate name with url
                for (var i=0;i<toJSON.profile.length;i++){
                    var fixLastName = this.lastname.split(',')[0].split(' ')[0].toLowerCase() + '_' + this.id
                    fs.mkdir("output/" + fixLastName)
                    fs.writeFile("output/" + fixLastName + "/index.html", profileDetails, function(err) {
                        if (err) {
                            console.log('error')
                            console.log(err);
                        } else {
                            console.log("The file was saved!");
                        }
                        console.log('end');
                    });
                }




            })
        }
    }).listen(1337, "127.0.0.1");
console.log('Server running at http://127.0.0.1:1337/');

