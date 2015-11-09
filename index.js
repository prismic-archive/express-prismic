var Prismic = require('prismic.io').Prismic,
    Promise = require('promise'),
    http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring');

var configuration = {};

exports.Prismic = Prismic;

exports.Prismic.ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND'
};

exports.Prismic.createError = function(status, message) {
  var err = new Error(message);
  err.status = status;
  return err;
};

exports.Prismic.init = function(config) {
  configuration = config;
};

exports.Prismic.getApiHome = function(accessToken, callback) {
  if (!configuration.apiEndpoint) {
    callback(new Error("Missing apiEndpoint in configuration: make sure to call init() at the beginning of your script"));
  }
  Prismic.Api(configuration.apiEndpoint, function(err, res, xhr) {
    if (err && err.status == "404") {
      callback(new Error("Invalid apiEndPoint configuration: " + configuration.apiEndpoint));
    } else {
      callback(err, res, xhr);
    }
  }, accessToken);
};

function prismicWithCTX(ctxPromise, req, res) {
  var self = {

    // Return the document corresponding to the requested UID (User-readable ID)
    'getByUID' : function(type, uid, callback) {
      self.queryFirst(['at','my.'+type+'.uid',uid],callback);
    },
    // Return a bookmark from its identifier (string)
    'getBookmark' : function(bookmark, callback) {
      ctxPromise.then(function(ctx){
        res.locals.ctx = ctx;
        var id = ctx.api.bookmarks[bookmark];
        if (id) {
          self.getByID(id, callback);
        } else {
          callback(new Error("Error retrieving boomarked id"));
        }
      });
    },
    // Return a set of document from their ids
    'getByIDs' : function(ids, callback) {
      self.query(['any', 'document.id', ids], null, callback);
    },
    // Return the document corresponding to the requested id
    'getByID' : function(id, callback) {
      self.queryFirst(['at', 'document.id', id], callback);
    },
    // Return the first document matching the query
    'queryFirst' : function(q, callback) {
      self.query(q, null, function(err, response) {
        if(err){
          callback(err, null);
        } else if(response && response.results && response.results[0]) {
          callback(null, response.results[0]);
        } else {
          callback(new Error("empty response"), null);
        }
      });
    },
    // Return the documents matching the query. The following options are available:
    // page: number, the page to retrieve, starting at 1, default to 1
    // pageSize: number, size of a page, default to 20
    // fetch: restrict the results to some fields, separated by commas
    // fetchLinks: include additional fields to links, separated by commas
    'query' : function(q, options, callback) {
      q = (q && q.length > 0) ? (Array.isArray(q[0]) ? q : [q]) : [];
      ctxPromise.then(function(ctx) {
        res.locals.ctx = ctx;
        var opts = options || {};
        var form = ctx.api.forms('everything').ref(ctx.ref);
        form.query.apply(form, q);
        for (var key in opts) {
          form.set(key, opts[key]);
        }
        form.submit(function(err, response) {
          callback(err, response);
        });
      }).catch(function(err) {
        callback(err);
      });
    }
  };
  return self;
}

exports.Prismic.withContext = function(req, res, callback) {
  var accessToken = (req.session && req.session['ACCESS_TOKEN']) || configuration.accessToken;
  var ctxPromise = new Promise(function (fulfill, reject) {
    try {
      exports.Prismic.getApiHome(accessToken, function(err, Api) {
        if (!configuration.linkResolver) {
          reject(new Error("Missing linkResolver in configuration: make sure to call init() at the beginning of your script"));
        }
        if (err) {
          reject(err);
        }
        var ctx = {
          endpoint: configuration.apiEndpoint,
          api: Api,
          ref: req.cookies[Prismic.experimentCookie] || req.cookies[Prismic.previewCookie] || Api.master(),
          linkResolver: function(doc) {
            return configuration.linkResolver(doc, ctx);
          }
        };
        fulfill(ctx);
      });
    } catch (ex) {
      return reject(ex);
    }
  });
  if(callback){
    ctxPromise.then(function(ctx){
      res.locals.ctx = ctx;
      callback(null, ctx);
    }).catch(function(err){
      console.log(err) ;
      callback(err, null);
    });
  } else {
    return prismicWithCTX(ctxPromise, req, res);
  }
};

exports.Prismic.preview = function(req, res) {
  Prismic.withContext(req,res, function then(err, ctx) {
    if(err) {
        if (err.status == 404) {
            res.status(404).send("404 not found");
        } else {
            res.status(500).send("Error 500: " + err.message);
        }
    }
    var token = req.query['token'];
    if (token) {
      ctx.api.previewSession(token, ctx.linkResolver, '/', function(err, url) {
        res.cookie(Prismic.previewCookie, token, { maxAge: 30 * 60 * 1000, path: '/', httpOnly: false });
        res.redirect(301, url);
      });
    } else {
      res.send(400, "Missing token from querystring");
    }
  });
};
