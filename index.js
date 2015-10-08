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

    'getApiHome' : function(accessToken, callback) {
      if (!configuration.apiEndpoint) {
        throw new Error("Missing apiEndpoint in configuration: make sure to call init() at the beginning of your script");
      }
      ctxPromise.then(function(ctx){
        res.locals.ctx = ctx;
        Prismic.Api(configuration.apiEndpoint, callback, accessToken);
      }).catch(function(err){
        callback(err);
      });
    },
    'getByUID' : function(type, uid, callback) {
      self.queryFirst(['at','my.'+type+'.uid',uid],callback);
    },
    'getBookmark' : function(bookmark, callback) {
      ctxPromise.then(function(ctx){
        res.locals.ctx = ctx;
        var id = ctx.api.bookmarks[bookmark];
        if (id) {
          self.getByID(ctx, id, callback);
        } else {
          callback(new Error("Error retrieving boomarked id"));
        }
      });
    },
    'getByIDs' : function(ids, callback) {
      self.query(['any', 'document.id', ids], callback);
    },
    'getByID' : function(id, callback) {
      self.queryFirst(['at', 'document.id', id], callback);
    },
    'queryFirst' : function(q, callback) {
      self.query(q, function(err, response) {
        if(err){
          callback(err, null);
        } else if(response && response.results && response.results[0]) {
          callback(null, response.results[0]);
        } else {
          callback(new Error("empty response"), null);
        }
      });
    },
    'query' : function(q, callback){
      ctxPromise.then(function(ctx){
        res.locals.ctx = ctx;
        ctx.api.forms('everything').ref(ctx.ref).query(q).submit(function(err, response) {
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
      exports.getApiHome(accessToken, function(err, Api) {
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
            return configuration.linkResolver(doc);
          }
        };
        fulfill(ctx);
      });
    } catch (ex) {
      return reject(ex);
    }
  });
  if(callback){
    res.locals.ctx = ctx;
    ctxPromise.then(callback);
  } else {
    return prismicWithCTX(ctxPromise, req, res);
  }
};

exports.Prismic.preview = function(req, res) {
  prismic.withContext(req,res, function then(ctx) {
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


