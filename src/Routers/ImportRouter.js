import PromiseRouter   from '../PromiseRouter';
import * as middleware from '../middlewares';
import rest            from '../rest';

export class ImportRouter extends PromiseRouter {
  handleImport(req) {
    var promises = [];
    var restObjects = [];
    if (Array.isArray(req.body)) {
      restObjects = req.body;
    } else if (Array.isArray(req.body.results)) {
      restObjects = req.body.results;
    }
    restObjects.forEach((restObject) => {
      promises.push(rest.create(req.config, req.auth, req.params.className, restObject, req.info.clientSDK));
    });
    return Promise.all(promises).then((results) => {
      return {response: results};
    });
  }

  mountRoutes() {
    this.route(
      'POST',
      '/import/:className',
      middleware.promiseEnforceMasterKeyAccess,
      (req) => { return this.handleImport(req); }
    );
  }
}

export default ImportRouter;
