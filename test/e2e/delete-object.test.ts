import AWS from 'aws-sdk';
require('dotenv').config();
import { expect } from 'chai';
import { Time } from 'hl-digits';
import { doesObjectExists } from './helpers';

describe('DeleteObject', () => {
  let s3: AWS.S3 = null;

  const storageTypes: string[] = JSON.parse(process.env.TEST_STORAGE_TYPES);

  function tests(storageType: string) {
    it('deleted an object', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'small-file.txt',
          Body: 'content',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      await s3
        .deleteObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'small-file.txt',
        })
        .promise();

      await s3
        .getObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'small-file.txt',
        })
        .promise()
        .then(() => {
          throw new Error('Should have thrown an error');
        })
        .catch((err) => {
          if (err.message === 'Should have thrown an error') {
            throw err;
          }
        });
    }).timeout(Time.seconds(100));

    it('deletes multiple objects in bulk operation', async () => {
      const filenames = ['bulk-delete-1.txt', 'bulk-delete-2.txt', 'bulk-delete-3.txt'];

      for (const filename of filenames) {
        await s3
          .putObject({
            Bucket: process.env.COLDSTACK_BUCKET,
            Key: filename,
            Body: 'content',
            Metadata: storageType === 'default' ? {} : { storage: storageType },
          })
          .promise();
      }

      const result = await s3
        .deleteObjects({
          Bucket: process.env.COLDSTACK_BUCKET,
          Delete: {
            Objects: [{ Key: 'bulk-delete-1.txt' }, { Key: 'bulk-delete-2.txt' }, { Key: 'bulk-delete-3.txt' }],
          },
        })
        .promise();

      expect(result.Errors).to.deep.eq([]);

      for (const filename of filenames) {
        // Deleted files should be listed in the "Deleted" array
        expect(result.Deleted.find((d) => d.Key === filename)).to.be.an(
          'object',
          `File ${filename} did not return in Deleted`,
        );
        const exists = await doesObjectExists(s3, process.env.COLDSTACK_BUCKET, filename);
        expect(exists).to.be.eq(false, `File ${filename} was not deleted.`);
      }
    }).timeout(Time.seconds(200));

    it('deletes multiple objects in bulk operation set Quiet to true', async () => {
      const filenames = ['bulk-delete-1.txt', 'bulk-delete-2.txt', 'bulk-delete-3.txt'];

      for (const filename of filenames) {
        await s3
          .putObject({
            Bucket: process.env.COLDSTACK_BUCKET,
            Key: filename,
            Body: 'content',
            Metadata: storageType === 'default' ? {} : { storage: storageType },
          })
          .promise();
      }

      const result = await s3
        .deleteObjects({
          Bucket: process.env.COLDSTACK_BUCKET,
          Delete: {
            Objects: [{ Key: 'bulk-delete-1.txt' }, { Key: 'bulk-delete-2.txt' }, { Key: 'bulk-delete-3.txt' }],
            Quiet: true,
          },
        })
        .promise();

      expect(result.Deleted).to.be.deep.eq([]);

      for (const filename of filenames) {
        const exists = await doesObjectExists(s3, process.env.COLDSTACK_BUCKET, filename);
        expect(exists).to.be.eq(false, `File ${filename} was not deleted.`);
      }
    }).timeout(Time.seconds(200));

    it('deletes one object in bulk operation', async () => {
      await s3
        .putObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'bulk-delete.txt',
          Body: 'content',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      const result = await s3
        .deleteObjects({
          Bucket: process.env.COLDSTACK_BUCKET,
          Delete: {
            Objects: [{ Key: 'bulk-delete.txt' }],
          },
        })
        .promise();

      expect(result.Errors).to.deep.eq([]);

      expect(result.Deleted.find((d) => d.Key === 'bulk-delete.txt')).to.be.an(
        'object',
        `File 'bulk-delete.txt' did not return in Deleted`,
      );
      const exists = await doesObjectExists(s3, process.env.COLDSTACK_BUCKET, 'bulk-delete.txt');
      expect(exists).to.be.eq(false, `File 'bulk-delete.txt' was not deleted.`);
    }).timeout(Time.seconds(200));
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
