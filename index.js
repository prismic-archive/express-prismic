var Prismic = require('prismic.io');
var Cookies = require('cookies');

var configuration = {};

Prismic.ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND'
};

Prismic.createError = function(status, message) {
  var err = new Error(message);
  err.status = status;
  return err;
};

Prismic.init = function(config) {
  configuration = config;
};

Prismic.getApiHome = function(accessToken) {
  if (!configuration.apiEndpoint) {
    return Promise.reject(new Error("Missing apiEndpoint in configuration: make sure to call init() at the beginning of your script"));
  }
  return Prismic.Api(configuration.apiEndpoint, accessToken).catch(function(err) {
    switch (err.status) {
    case 404:
      throw new Error("Invalid apiEndPoint configuration: " + configuration.apiEndpoint);
    default:
      throw err;
    }
  });
};

function prismicWithCTX(ctxPromise, req, res) {
  var self = {

    // Return the document corresponding to the requested UID (User-readable ID)
    'getByUID' : function(type, uid, callback) {
      return self.queryFirst(['at','my.'+type+'.uid',uid], callback);
    },
    // Return a bookmark from its identifier (string)
    'getBookmark' : function(bookmark, callback) {
      return ctxPromise.then(function(ctx){
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
      return self.query(['any', 'document.id', ids], null, callback);
    },
    // Return the document corresponding to the requested id
    'getByID' : function(id, callback) {
      return self.queryFirst(['at', 'document.id', id], callback);
    },
    // Return the first document matching the query
    'queryFirst' : function(q, callback) {
      return self.query(q, null, function(err, response) {
        if(err) {
          callback(err, null);
        } else if(response && response.results && response.results[0]) {
          callback(null, response.results[0]);
        } else {
          callback(Prismic.createError(404, "No document matching query"), null);
        }
      });
    },
    // Return the documents matching the query. The following options are available:
    // page: number, the page to retrieve, starting at 1, default to 1
    // pageSize: number, size of a page, default to 20
    // fetch: restrict the results to some fields, separated by commas
    // fetchLinks: include additional fields to links, separated by commas
    'query' : function(q, options, callback) {
      return ctxPromise.then(function(ctx) {
        res.locals.ctx = ctx;
        var opts = options || {};
        if (!opts.ref) {
          opts.ref = ctx.ref;
        }
        return ctx.api.query(q, opts, callback);
      }).catch(function(err) {
        callback(err);
      });
    }
  };
  return self;
}

Prismic.withContext = function(req, res, callback) {
  var accessToken = (req.session && req.session['ACCESS_TOKEN']) || configuration.accessToken;
  var ctxPromise = Prismic.getApiHome(accessToken).then(function (api) {
    if (!configuration.linkResolver) {
      return Promise.reject(new Error("Missing linkResolver in configuration: make sure to call init() at the beginning of your script"));
    }
    var cookies = new Cookies(req, res);
    var ctx = {
      endpoint: configuration.apiEndpoint,
      api: api,
      ref: cookies.get(Prismic.experimentCookie) || cookies.get(Prismic.previewCookie) || api.master(),
      linkResolver: function(doc) {
        return configuration.linkResolver(doc, ctx);
      }
    };
    return ctx;
  });
  if (callback) {
    return ctxPromise.then(function(ctx){
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

Prismic.preview = function(req, res) {
  Prismic.withContext(req, res, function then(err, ctx) {
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
        if (err) {
          res.status(500).send("Error 500 in preview: " + err.message);
        } else {
          var cookies = new Cookies(req, res);
          cookies.set(Prismic.previewCookie, token, { maxAge: 30 * 60 * 1000, path: '/', httpOnly: false });
          res.redirect(301, url);
        }
      });
    } else {
      res.send(400, "Missing token from querystring");
    }
  });
};

Prismic.Prismic = Prismic; // Backward compatibility

module.exports = Prismic;

