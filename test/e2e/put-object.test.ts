/* eslint-disable @typescript-eslint/no-var-requires */
import AWS from 'aws-sdk';
require('dotenv').config();
import { expect } from 'chai';
import crypto from 'crypto';
import { Time } from 'hl-digits';

describe('PutObject', () => {
  let s3: AWS.S3 = null;

  const storageTypes: string[] = JSON.parse(process.env.TEST_STORAGE_TYPES);

  function tests(storageType: string): void {
    it('puts a small file', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'small-file.txt',
          Body: 'content',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();
    }).timeout(Time.seconds(100));

    it('puts an empty file', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'empty-file.txt',
          Body: '',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();
    }).timeout(Time.seconds(100));

    it('returns etag as md5 of file contents', async () => {
      const result = await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'test-file-2.txt',
          Body: 'content',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      expect(result.ETag).to.be.eq('"' + crypto.createHash('md5').update('content').digest('hex') + '"');
    }).timeout(Time.seconds(100));

    it('uploads file with specified storage class', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'test-file-3.txt',
          Body: 'content',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
          StorageClass: 'STANDARD_IA',
        })
        .promise();

      const headResult = await s3
        .headObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'test-file-3.txt',
        })
        .promise();

      expect(headResult.StorageClass).to.be.eq('STANDARD_IA');
    }).timeout(Time.seconds(100));

    it('uploads file with correct Content-MD5', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'test-file-3.txt',
          Body: 'content',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
          ContentMD5: crypto.createHash('md5').update('content').digest('base64'),
        })
        .promise();
    }).timeout(Time.seconds(100));

    it('fails when Content-MD5 is incorrect', async () => {
      try {
        await s3
          .putObject({
            Bucket: process.env.COLDSTACK_BUCKET,
            Key: 'test-file-3.txt',
            Body: 'content',
            Metadata: storageType === 'default' ? {} : { storage: storageType },
            ContentMD5: crypto.createHash('md5').update('not the original content').digest('base64'),
          })
          .promise();
        throw new Error('No error were thrown');
      } catch (err) {
        expect(err.code).to.be.eq('BadDigest');
      }
    }).timeout(Time.seconds(100));

    it('uploads file with correct Content-MD5 for large file', async () => {
      const body = Buffer.alloc(150000).fill('a');
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'correct-content-md5-large-file.txt',
          Body: body,
          Metadata: storageType === 'default' ? {} : { storage: storageType },
          ContentMD5: crypto.createHash('md5').update(body).digest('base64'),
        })
        .promise();
    }).timeout(Time.seconds(100));

    it('fails when Content-MD5 is incorrect for large file', async () => {
      try {
        await s3
          .putObject({
            Bucket: process.env.COLDSTACK_BUCKET,
            Key: 'incorrect-content-md5-large-file.txt',
            Body: Buffer.alloc(150000).fill('a'),
            Metadata: storageType === 'default' ? {} : { storage: storageType },
            ContentMD5: crypto.createHash('md5').update('not the original content').digest('base64'),
          })
          .promise();
        throw new Error('No error were thrown');
      } catch (err) {
        expect(err.code).to.be.eq('BadDigest');
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
});
