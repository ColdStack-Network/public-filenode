import AWS, { AWSError } from 'aws-sdk';
require('dotenv').config();
import { expect } from 'chai';
import { Time } from 'hl-digits';

describe('Tagging', () => {
  let s3: AWS.S3 = null;

  const storageTypes: string[] = JSON.parse(process.env.TEST_STORAGE_TYPES);

  function tests(storageType: string) {
    it('returns 404 error on GetObjectTagging', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'tagging/get-object-tagging-test',
          Body: 'content',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      try {
        await s3
          .getObjectTagging({
            Bucket: process.env.COLDSTACK_BUCKET,
            Key: 'tagging/get-object-tagging-test',
          })
          .promise();

        throw new Error('Did not get any error');
      } catch (err) {
        expect((err as AWSError).code).to.be.eq('NoSuchTagSetError');
      }
    }).timeout(Time.seconds(100));

    it('returns 404 error on GetBucketTagging', async () => {
      try {
        await s3
          .getBucketTagging({
            Bucket: process.env.COLDSTACK_BUCKET,
          })
          .promise();

        throw new Error('Did not get any error');
      } catch (err) {
        expect((err as AWSError).code).to.be.eq('NoSuchTagSetError');
      }
    }).timeout(Time.seconds(100));
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

  afterEach(async function () {
    this.timeout(Time.seconds(30));

    await s3
      .deleteObject({
        Bucket: process.env.COLDSTACK_BUCKET,
        Key: 'tagging/get-object-tagging-test',
      })
      .promise();
  });
});
