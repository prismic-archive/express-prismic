var Prismic = require('prismic.io').Prismic,
    Promise = require('promise'),
    http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring');

exports.previewCookie = Prismic.previewCookie;

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
    'getByUID' : function(type, uid, onThen , onNotFound) {
      self.query(['at','my.'+type+'.uid',uid],function(err, response) {
        var document = response.results[0];
        if(err) {
          configuration.onPrismicError && configuration.onPrismicError(err, req, response);
        } else {
          if(document) {
            onThen && onThen(document);
          } else {
            if(onNotFound){
              onNotFound();
            } else {
              res.send(404, 'Missing document ' + uid);
            }
          }
        }
      });
    },
    'getBookmark' : function(bookmark, callback) {
      ctxPromise.then(function(ctx){
        res.locals.ctx = ctx;
        var id = ctx.api.bookmarks[bookmark];
        if(id) {
          self.getDocument(ctx, id, undefined, callback);
        } else {
          callback();
        }
      });
    },
    'getByIDs' : function(ids, callback) {
      ctxPromise.then(function(ctx){
        res.locals.ctx = ctx;
        if(ids && ids.length) {
          ctx.api.forms('everything').ref(ctx.ref).query('[[:d = any(document.id, [' + ids.map(function(id) { return '"' + id + '"';}).join(',') + '])]]').submit(function(err, response) {
            callback(err, response.results);
          });
        } else {
          callback(null, []);
        }
      });
    },
    'getByID' : function(id, slug, onThen, onNewSlug, onNotFound) {
      ctxPromise.then(function(ctx){
        res.locals.ctx = ctx;
        ctx.api.forms('everything').ref(ctx.ref).query('[[:d = at(document.id, "' + id + '")]]').submit(function(err, response) {
          var results = response.results;
          var doc = results && results.length ? results[0] : undefined;
          if (err) onThen(err);
          else if(doc && (!slug || doc.slug == slug)) onDone(null, doc);
          else if(doc && doc.slugs.indexOf(slug) > -1 && onNewSlug) onNewSlug(doc);
          else if(onNotFound) onNotFound();
          else onThen();
        });
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
  if (!configuration.apiEndpoint) {
    throw new Error("Missing apiEndpoint in configuration: make sure to call init() at the beginning of your script");
  }
  if (!configuration.linkResolver) {
    throw new Error("Missing linkResolver in configuration: make sure to call init() at the beginning of your script");
  }
  var accessToken = (req.session && req.session['ACCESS_TOKEN']) || configuration.accessToken;
  var ctxPromise = new Promise(function (fulfill) {

    exports.getApiHome(accessToken, function(err, Api) {
      if (err) {
        configuration.onPrismicError && configuration.onPrismicError(err, req, Api);
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

