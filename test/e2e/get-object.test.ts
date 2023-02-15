import AWS from 'aws-sdk';
require('dotenv').config();
import { expect } from 'chai';
import { Time } from 'hl-digits';

describe('GetObject', () => {
  let s3: AWS.S3 = null;

  const storageTypes: string[] = JSON.parse(process.env.TEST_STORAGE_TYPES);

  function tests(storageType: string) {
    it('returns 404 if file doesnt exist', async () => {
      try {
        await s3
          .getObject({
            Bucket: process.env.COLDSTACK_BUCKET,
            Key: 'not-existing-file.txt',
          })
          .promise();
        throw new Error('Not throwing an error');
      } catch (err) {
        expect(err.statusCode).to.be.eq(404);
        expect(err.code).to.be.eq('NotFound');
      }
    }).timeout(Time.seconds(10));

    it('returns the file', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'test-file-1.txt',
          Body: 'content',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      const result = await s3
        .getObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'test-file-1.txt',
        })
        .promise();

      expect(result.Body.toString('utf-8')).to.be.eq('content');
    }).timeout(Time.minutes(1));
  }

  for (const storageType of storageTypes) {
    describe(`Testing for storage type ${storageType}`, () => {
      describe('Signature Version 2', () => {
        before(() => {
          AWS.config.update({
            region: 'us-east-1',
            accessKeyId: process.env.COLDSTACK_TOKEN_ID,
            secretAccessKey: process.env.COLDSTACK_SECRET_KEY,
            signatureVersion: 'v2',
          });

          s3 = new AWS.S3({
            endpoint: new AWS.Endpoint(process.env.COLDSTACK_ENDPOINT),
            s3ForcePathStyle: true,
            signatureVersion: 'v2',
          });
        });

        tests(storageType);
      });

      describe('Signature Version 4', () => {
        before(() => {
          AWS.config.update({
            region: 'us-east-1',
            accessKeyId: process.env.COLDSTACK_TOKEN_ID,
            secretAccessKey: process.env.COLDSTACK_SECRET_KEY,
            signatureVersion: 'v4',
          });

          s3 = new AWS.S3({
            endpoint: new AWS.Endpoint(process.env.COLDSTACK_ENDPOINT),
            s3ForcePathStyle: true,
            signatureVersion: 'v4',
          });
        });

        tests(storageType);
      });
    });
  }
});
