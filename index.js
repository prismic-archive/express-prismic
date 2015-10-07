var Prismic = require('prismic.io').Prismic,
    Promise = require('promise'),
    http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring');

var configuration = {};

exports.init = function(config) {
  configuration = config;
};

exports.getApiHome = function(accessToken, callback) {
  if (!configuration.apiEndpoint) {
    throw new Error("Missing apiEndpoint in configuration: make sure to call init() at the beginning of your script");
  }
  Prismic.Api(configuration.apiEndpoint, callback, accessToken);
};

exports.previewCookie = Prismic.previewCookie;

function prismicWithCTX(ctxPromise, req, res) {
  var self = {

    'getApiHome' : function(accessToken, callback) {
      if (!configuration.apiEndpoint) {
        throw new Error("Missing apiEndpoint in configuration: make sure to call init() at the beginning of your script");
      }
      ctxPromise.then(function(ctx){
        res.locals.ctx = ctx;
        Prismic.Api(configuration.apiEndpoint, callback, accessToken);
      });
    },
    'getByUID' : function(type, uid, callback) {
      self.queryFirst(['at','my.'+type+'.uid',uid],callback);
    },
    'getBookmark' : function(bookmark, callback) {
      ctxPromise.then(function(ctx){
        res.locals.ctx = ctx;
        var id = ctx.api.bookmarks[bookmark];
        if(id) {
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
      });
    }
  };
  return self;
}

exports.withContext = function(req, res, callback) {
  var accessToken = (req.session && req.session['ACCESS_TOKEN']) || configuration.accessToken;
  var ctxPromise = new Promise(function (fulfill) {

    exports.getApiHome(accessToken, function(err, Api) {
      if (!configuration.linkResolver) {
        throw new Error("Missing linkResolver in configuration: make sure to call init() at the beginning of your script");
      }
      if (err) {
          exports.onPrismicError(err, req, res);
          return;
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

  });
  if(callback){
    res.locals.ctx = ctx;
    ctxPromise.then(callback);
  } else {
    return prismicWithCTX(ctxPromise, req, res);
  }
};

