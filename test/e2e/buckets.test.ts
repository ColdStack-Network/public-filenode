import AWS from 'aws-sdk';
require('dotenv').config();
import axios from 'axios';
import { AxiosInstance } from 'axios';
import { aws4Interceptor } from 'aws4-axios';
import { getErrorIfAnyWhenAccessingBucket } from './helpers';
import { expect } from 'chai';
import { Time } from 'hl-digits';

describe('Buckets', () => {
  let s3: AWS.S3 = null;

  function testsWithSignatureVersions() {
    it('creates and then deletes a bucket', async () => {
      await s3
        .createBucket({
          Bucket: 'bucket-for-e2e-tests',
        })
        .promise()
        .catch((err) => {
          console.error('Error when creating a bucket', err);
          throw err;
        });

      await s3
        .deleteBucket({
          Bucket: 'bucket-for-e2e-tests',
        })
        .promise()
        .catch((err) => {
          console.error('Error when deleting the bucket', err);
          throw err;
        });
    }).timeout(Time.seconds(100));

    it('returns error when the name is already used', async () => {
      await s3
        .createBucket({
          Bucket: 'bucket-for-e2e-tests',
        })
        .promise()
        .catch((err) => {
          console.error('Error when creating a bucket', err);
          throw err;
        });

      try {
        await s3
          .createBucket({
            Bucket: 'bucket-for-e2e-tests',
          })
          .promise();

        throw new Error('No error has been thrown when.');
      } catch (err) {
        expect((err as AWS.AWSError).code).is.eq('BucketAlreadyExists');
      }
    });

    it('returns error when bucket name is invalid', async () => {
      const invalidNames = ['a'.repeat(64), 'aa', 'AAA', '-aaa', 'aaa-', '192.168.5.4'];

      for (const name of invalidNames) {
        try {
          await s3
            .createBucket({
              Bucket: name,
            })
            .promise();

          throw new Error('No error has been thrown for name: ' + name);
        } catch (err) {
          expect((err as AWS.AWSError).code).is.eq('InvalidBucketName');
        }
      }
    }).timeout(Time.seconds(10));

    it('says that request payer is the owner', async () => {
      const result = await s3
        .getBucketRequestPayment({
          Bucket: process.env.COLDSTACK_BUCKET,
        })
        .promise();

      expect(result.Payer).to.be.eq('BucketOwner');
    }).timeout(Time.seconds(10));

    it('returns empty logging configs', async () => {
      const result = await s3
        .getBucketLogging({
          Bucket: process.env.COLDSTACK_BUCKET,
        })
        .promise();

      expect(result).to.be.an('object');
    }).timeout(Time.seconds(10));

    it('return bucket replication settings', async () => {
      const result = await s3
        .getBucketReplication({
          Bucket: process.env.COLDSTACK_BUCKET,
        })
        .promise();

      expect(result.ReplicationConfiguration.Rules).to.be.an('array').with.lengthOf(0);
    }).timeout(Time.seconds(10));
  }

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

    testsWithSignatureVersions();
  });

  describe('Signature Version 4', () => {
    // It's for testing the extended api, which is not supported by the official AWS SDK
    let s3Api: AxiosInstance = null;

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

      s3Api = axios.create({
        baseURL: process.env.COLDSTACK_ENDPOINT,
      });

      // No need to specify Sig v4 or v2, cuz aws4Interceptor supports only Sig v4 and uses it.
      s3Api.interceptors.request.use(
        aws4Interceptor(
          {
            region: 'us-east-1',
            service: 's3',
          },
          {
            accessKeyId: process.env.COLDSTACK_TOKEN_ID,
            secretAccessKey: process.env.COLDSTACK_SECRET_KEY,
          },
        ),
      );
    });

    testsWithSignatureVersions();

    it('creates and renames the bucket', async () => {
      await s3
        .createBucket({
          Bucket: 'bucket-for-e2e-tests',
        })
        .promise()
        .catch((err) => {
          console.error('Error when creating a bucket', err);
          throw err;
        });

      await s3Api.request({
        url: 'bucket-for-e2e-tests',
        method: 'move' as any,
        headers: {
          Destination: 'bucket-for-e2e-tests-renamed',
        },
      });

      const errorForRenamedBucket = await getErrorIfAnyWhenAccessingBucket(s3, 'bucket-for-e2e-tests-renamed');

      if (errorForRenamedBucket) {
        throw new Error('The bucket is not accessable with new name: ' + errorForRenamedBucket);
      }

      const errorForOldName = await getErrorIfAnyWhenAccessingBucket(s3, 'bucket-for-e2e-tests');

      if (!errorForOldName) {
        throw new Error('The bucket is still accessable with the old name.');
      }
    }).timeout(Time.seconds(100));
  });

  afterEach(async () => {
    await s3
      .deleteBucket({
        Bucket: 'bucket-for-e2e-tests',
      })
      .promise()
      .catch((err) => {});

    await s3
      .deleteBucket({
        Bucket: 'bucket-for-e2e-tests-renamed',
      })
      .promise()
      .catch((err) => {});
  });
});
