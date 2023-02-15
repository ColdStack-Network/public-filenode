import AWS from 'aws-sdk';
import { Time } from 'hl-digits';
require('dotenv').config();

describe('List objects V1/V2', () => {
  let s3: AWS.S3 = null;

  const storageTypes: string[] = JSON.parse(process.env.TEST_STORAGE_TYPES);

  function tests(storageType: string) {
    it('performs ListObjects without errors', async () => {
      await s3
        .listObjects({
          Bucket: process.env.COLDSTACK_BUCKET,
          Delimiter: '/',
          MaxKeys: 1000,
          Prefix: '',
        })
        .promise();
    }).timeout(Time.seconds(30));

    it('performs ListObjectsV2 without errors', async () => {
      await s3
        .listObjectsV2({
          Bucket: process.env.COLDSTACK_BUCKET,
          Delimiter: '/',
          MaxKeys: 1000,
          Prefix: '',
        })
        .promise();
    }).timeout(Time.seconds(30));
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
