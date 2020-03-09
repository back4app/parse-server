import { ParseMessageQueue } from '../ParseMessageQueue';
import rest from '../rest';
import { applyDeviceTokenExists } from './utils';
import Parse from 'parse/node';
import log from '../logger';

const PUSH_CHANNEL = 'parse-server-push';
const DEFAULT_BATCH_SIZE = 100;

export class PushQueue {
  parsePublisher: Object;
  channel: String;
  batchSize: Number;

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config: any = {}) {
    this.channel = config.channel || PushQueue.defaultPushChannel();
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.parsePublisher = ParseMessageQueue.createPublisher(config);
  }

  static defaultPushChannel() {
    return `${Parse.applicationId}-${PUSH_CHANNEL}`;
  }

  enqueue(body, where, config, auth, pushStatus) {
    const limit = this.batchSize;

    where = applyDeviceTokenExists(where);

    // Order by objectId so no impact on the DB
    // const order = 'objectId';
    return Promise.resolve()
      .then(() => {
        return rest.find(config, auth, '_Installation', where, {
          limit: 0,
          count: true,
        });
      })
      .then(({ results, count }) => {
        if (!results || count == 0) {
          return pushStatus.complete();
        }
        const maxPages = Math.ceil(count / limit);
        pushStatus.setRunning(maxPages);
        // while (page < maxPages) {
        // changes request/limit/orderBy by id range intervals for better performance
        // https://docs.mongodb.com/manual/reference/method/cursor.skip/
        // Range queries can use indexes to avoid scanning unwanted documents,
        // typically yielding better performance as the offset grows compared
        // to using cursor.skip() for pagination.
        const query = { where };

        const pushWorkItem = {
          body,
          query,
          maxPages,
          pushStatus: { objectId: pushStatus.objectId },
          applicationId: config.applicationId,
        };
        const publishResult = Promise.resolve(
          this.parsePublisher.publish(
            this.channel,
            JSON.stringify(pushWorkItem)
          )
        );
        return publishResult.then(reponse => {
          const result = (reponse && reponse.data) || reponse;
          log.info(
            `All ${maxPages} packages were enqueued for PushStatus ${pushStatus.objectId}`,
            result
          );
          return result;
        });
      })
      .catch(err => {
        log.info(
          `Can't count installations for PushStatus ${pushStatus.objectId}: ${err.message}`
        );
        throw err;
      });
  }
}
