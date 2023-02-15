import AWS from 'aws-sdk';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import { expect } from 'chai';
import { Time } from 'hl-digits';

describe('Metadatas', () => {
  let s3: AWS.S3 = null;

  const storageTypes: string[] = JSON.parse(process.env.TEST_STORAGE_TYPES);

  function tests(storageType: string): void {
    it('Sets metadatas', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'metadata/set-metadata',
          Metadata: {
            'key-1': 'value-1',
            'key-2': 'value-2',
            ...(storageType === 'default' ? {} : { storage: storageType }),
          },
        })
        .promise();

      const head = await s3
        .headObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'metadata/set-metadata',
        })
        .promise();

      expect(head.Metadata['key-1']).to.be.eq('value-1');
      expect(head.Metadata['key-2']).to.be.eq('value-2');
    }).timeout(Time.seconds(30));

    it('Has file-hash metadata', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'metadata/has-file-hash-metadata',
          Metadata: {
            ...(storageType === 'default' ? {} : { storage: storageType }),
          },
        })
        .promise();

      const head = await s3
        .headObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'metadata/has-file-hash-metadata',
        })
        .promise();

      expect(head.Metadata['file-hash']).to.match(/^[A-Fa-f0-9]{64}$/);
    }).timeout(Time.seconds(30));

    it('Can edit metadata', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'metadata/can-edit-metadata',
          Metadata: {
            'key-1': 'value-1',
            'key-2': 'value-2',
            'key-3': 'value-3',
            ...(storageType === 'default' ? {} : { storage: storageType }),
          },
        })
        .promise();

      await s3
        .copyObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'metadata/can-edit-metadata',
          CopySource: `/${process.env.COLDSTACK_BUCKET}/metadata/can-edit-metadata`,
          Metadata: {
            'key-1': 'other-value-1',
            'key-3': 'value-3',
            'key-4': 'value-4',
          },
        })
        .promise();

      const head = await s3
        .headObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'metadata/can-edit-metadata',
        })
        .promise();

      expect(head.Metadata['key-1']).to.be.eq('other-value-1');
      expect(head.Metadata['key-3']).to.be.eq('value-3');
      expect(head.Metadata['key-4']).to.be.eq('value-4');
      expect(head.Metadata).to.not.have.property('key-2');
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
