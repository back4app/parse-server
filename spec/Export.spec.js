const Parse = require('parse/node');
const request = require('../lib/request');
const AdmZip = require('adm-zip');

describe('Export router', () => {
  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': 'test',
    'X-Parse-Master-Key': 'test',
  };

  const createRecords = itemCount => {
    const ExportTest = Parse.Object.extend('ExportTest');

    const items = new Array(itemCount).fill().map((item, index) => {
      const exportTest = new ExportTest();

      exportTest.set('field1', `value1-${index}`);
      exportTest.set('field2', `value2-${index}`);

      return exportTest;
    });

    return Parse.Object.saveAll(items);
  };

  xit_exclude_dbs(['postgres'])('should create export progress', done => {
    reconfigureServer({
      emailAdapter: {
        sendMail: () => {
          done();
        },
      },
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => createRecords(3000))
      .then(() =>
        request({
          method: 'PUT',
          headers: headers,
          url: 'http://localhost:8378/1/export_data',
          body: {
            name: 'ExportTest',
            feedbackEmail: 'my@email.com',
          },
        })
      )
      .then(() =>
        request({
          headers: headers,
          url: 'http://localhost:8378/1/export_progress',
        })
      )
      .then(res => {
        const progress = JSON.parse(res.body);
        expect(progress instanceof Array).toBe(true);
        expect(progress.length).toBe(1);
        if (progress.length) {
          expect(progress[0].id).toBe('ExportTest');
        }
        done();
      })
      .catch(done);
  });

  it_exclude_dbs(['postgres'])('send success export mail', done => {
    let results = [];

    const emailAdapter = {
      sendMail: ({ link, to, subject }) => {
        expect(to).toEqual('my@email.com');
        expect(subject).toEqual('Export completed');

        request({ url: link, encoding: null })
          .then(res => {
            const zip = new AdmZip(res.body);
            const zipEntries = zip.getEntries();

            expect(zipEntries.length).toEqual(1);

            const entry = zipEntries.pop();
            const text = entry.getData().toString('utf8');
            const resultsToCompare = JSON.parse(text);

            expect(results.length).toEqual(resultsToCompare.length);

            done();
          })
          .catch(done);
      },
    };
    reconfigureServer({
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => createRecords(2176))
      .then(() =>
        request({
          headers: headers,
          url: 'http://localhost:8378/1/classes/ExportTest',
        })
      )
      .then(res => {
        results = JSON.parse(res.body);
        return request({
          method: 'PUT',
          headers: headers,
          url: 'http://localhost:8378/1/export_data',
          body: JSON.stringify({
            name: 'ExportTest',
            feedbackEmail: 'my@email.com',
          }),
        });
      })
      .then(res => {
        expect(JSON.parse(res.body)).toEqual(
          'We are exporting your data. You will be notified by e-mail once it is completed.'
        );
      })
      .catch(done);
  });
});
