var auth = require('../src/Auth');
var Config = require('../src/Config');
var rest = require('../src/rest');
var AudiencesRouter = require('../src/Routers/AudiencesRouter').AudiencesRouter;

describe('AudiencesRouter', () => {
  it('uses find condition from request.body', (done) => {
    var config = new Config('test');
    var androidAudienceRequest = {
      'name': 'Android Users',
      'query': '{ "test": "android" }'
    };
    var iosAudienceRequest = {
      'name': 'Iphone Users',
      'query': '{ "test": "ios" }'
    };
    var request = {
      config: config,
      auth: auth.master(config),
      body: {
        where: {
          query: '{ "test": "android" }'
        }
      },
      query: {},
      info: {}
    };

    var router = new AudiencesRouter();
    rest.create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
    .then(() => {
      return rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest);
    }).then(() => {
      return router.handleFind(request);
    }).then((res) => {
      var results = res.response.results;
      expect(results.length).toEqual(1);
      done();
    }).catch((err) => {
      fail(JSON.stringify(err));
      done();
    });
  });

  it('uses find condition from request.query', (done) => {
    var config = new Config('test');
    var androidAudienceRequest = {
      'name': 'Android Users',
      'query': '{ "test": "android" }'
    };
    var iosAudienceRequest = {
      'name': 'Iphone Users',
      'query': '{ "test": "ios" }'
    };
    var request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        where: {
          'query': '{ "test": "android" }'
        }
      },
      info: {}
    };

    var router = new AudiencesRouter();
    rest.create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
    .then(() => {
      return rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest);
    }).then(() => {
      return router.handleFind(request);
    }).then((res) => {
      var results = res.response.results;
      expect(results.length).toEqual(1);
      done();
    }).catch((err) => {
      fail(err);
      done();
    });
  });

  it('query installations with limit = 0', (done) => {
    var config = new Config('test');
    var androidAudienceRequest = {
      'name': 'Android Users',
      'query': '{ "test": "android" }'
    };
    var iosAudienceRequest = {
      'name': 'Iphone Users',
      'query': '{ "test": "ios" }'
    };
    var request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        limit: 0
      },
      info: {}
    };

    new Config('test');
    var router = new AudiencesRouter();
    rest.create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
    .then(() => {
      return rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest);
    }).then(() => {
      return router.handleFind(request);
    }).then((res) => {
      var response = res.response;
      expect(response.results.length).toEqual(0);
      done();
    }).catch((err) => {
      fail(JSON.stringify(err));
      done();
    });
  });

  it('query installations with count = 1', done => {
    var config = new Config('test');
    var androidAudienceRequest = {
      'name': 'Android Users',
      'query': '{ "test": "android" }'
    };
    var iosAudienceRequest = {
      'name': 'Iphone Users',
      'query': '{ "test": "ios" }'
    };
    var request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        count: 1
      },
      info: {}
    };

    var router = new AudiencesRouter();
    rest.create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
    .then(() => rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest))
    .then(() => router.handleFind(request))
    .then((res) => {
      var response = res.response;
      expect(response.results.length).toEqual(2);
      expect(response.count).toEqual(2);
      done();
    })
    .catch(error => {
      fail(JSON.stringify(error));
      done();
    })
  });

  it('query installations with limit = 0 and count = 1', (done) => {
    var config = new Config('test');
    var androidAudienceRequest = {
      'name': 'Android Users',
      'query': '{ "test": "android" }'
    };
    var iosAudienceRequest = {
      'name': 'Iphone Users',
      'query': '{ "test": "ios" }'
    };
    var request = {
      config: config,
      auth: auth.master(config),
      body: {},
      query: {
        limit: 0,
        count: 1
      },
      info: {}
    };

    var router = new AudiencesRouter();
    rest.create(config, auth.nobody(config), '_Audience', androidAudienceRequest)
    .then(() => {
      return rest.create(config, auth.nobody(config), '_Audience', iosAudienceRequest);
    }).then(() => {
      return router.handleFind(request);
    }).then((res) => {
      var response = res.response;
      expect(response.results.length).toEqual(0);
      expect(response.count).toEqual(2);
      done();
    }).catch((err) => {
      fail(JSON.stringify(err));
      done();
    });
  });
});
