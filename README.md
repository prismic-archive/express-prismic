## express-prismic

*Prismic.io support for ExpressJS*

[![npm version](https://badge.fury.io/js/express-prismic.svg)](http://badge.fury.io/js/express-prismic)

This is a set of helpers to use Prismic.io in an [Express](http://expressjs.com/)) application. If you're starting from scratch, our [NodeJS SDK](https://github.com/prismicio/nodejs-sdk) is a good base.

### Configuration

After including `express-prismic` in your `package.json`, simply import the prismic object:

```
var prismic = require('express-prismic').Prismic;
```

The Prismic object is extended from the [Javascript Kit](https://github.com/prismicio/javascript-kit), so any attribute of the official kit, for example `Predicates`, is also available in the object exposed by express-prismic.

It needs to be initialized with your configuration:

```
prismic.init({
  apiEndPoint: "https://your-repo-name.prismic.io", // Mandatory
  linkResolver: function(doc) { // Mandatory
    return false;
  },
  accessToken: "xxx" // Optional
});
```

### Usage

You can then create a Prismic context in your routes if you need to query your repository:

```
app.route('/').get(function(req, res) {
  var p = prismic.withContext(req,res); // This will retrieve the API object asynchronously (using a promise)
  p.getByUID('page', 'get-started', function (err, document) {
    res.render('index-prismic', {
      document: document
    });
  });
});
```

### Previews

You can preview any document including drafts in your production site, securely. All you have to do is:

* Include this route: `app.route('/preview').get(prismic.preview);`
* Configure the URL to that preview route in the settings of your repository
* Make sure that the [Prismic Toolbar](https://developers.prismic.io/documentation/developers-manual#prismic-toolbar) is included in your views



