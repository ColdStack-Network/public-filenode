import AWS from 'aws-sdk';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import { expect } from 'chai';
import crypto from 'crypto';

describe('Multipart upload', () => {
  let s3: AWS.S3 = null;

  const storageTypes: string[] = JSON.parse(process.env.TEST_STORAGE_TYPES);

  function tests(storageType: string): void {
    it('creates multipart upload and returns id', async () => {
      const result = await s3
        .createMultipartUpload({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-1.txt',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      expect(result.UploadId).to.be.a.string;
    }).timeout(0);

    it('uploads a part and returns etag', async () => {
      const { UploadId } = await s3
        .createMultipartUpload({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-2.txt',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      const result = await s3
        .uploadPart({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-2.txt',
          PartNumber: 1,
          UploadId,
          ContentLength: 5242880,
          Body: Buffer.alloc(5242880).fill('a'), // ~ 5MB
        })
        .promise();

      expect(result.ETag).to.be.a.string;
    }).timeout(0);

    it('completes multipart upload', async () => {
      const { UploadId } = await s3
        .createMultipartUpload({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-3.txt',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      const firstPartBuffer = Buffer.alloc(5242880).fill('a');
      const result1 = await s3
        .uploadPart({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-3.txt',
          PartNumber: 1,
          UploadId,
          ContentLength: firstPartBuffer.length,
          Body: firstPartBuffer, // ~ 5MB
        })
        .promise();

      const secondPartBuffer = Buffer.alloc(1000000).fill('a');
      const result2 = await s3
        .uploadPart({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-3.txt',
          PartNumber: 2,
          UploadId,
          ContentLength: secondPartBuffer.length,
          Body: secondPartBuffer, // ~ 6MB
        })
        .promise();

      const result = await s3
        .completeMultipartUpload({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-3.txt',
          UploadId,
          MultipartUpload: {
            Parts: [
              {
                PartNumber: 1,
                ETag: result1.ETag,
              },
              {
                PartNumber: 2,
                ETag: result2.ETag,
              },
            ],
          },
        })
        .promise();

      // expect(result.Location).to.be.eq(process.env.BASE_URL + '/' + process.env.COLDSTACK_BUCKET + '/multipart-3.txt');

      const expectedEtag =
        '"' +
        crypto
          .createHash('md5')
          .update(crypto.createHash('md5').update(firstPartBuffer).digest())
          .update(crypto.createHash('md5').update(secondPartBuffer).digest())
          .digest('hex') +
        '-2"';

      expect(result.ETag).to.be.eq(expectedEtag);
    }).timeout(0);

    it('completes multipart upload and downloads', async () => {
      const { UploadId } = await s3
        .createMultipartUpload({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-3.txt',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      const firstPartBuffer = Buffer.alloc(5242880).fill('a');
      const result1 = await s3
        .uploadPart({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-3.txt',
          PartNumber: 1,
          UploadId,
          ContentLength: firstPartBuffer.length,
          Body: firstPartBuffer, // ~ 5MB
        })
        .promise();

      const secondPartBuffer = Buffer.alloc(1000000).fill('b');
      const result2 = await s3
        .uploadPart({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-3.txt',
          PartNumber: 2,
          UploadId,
          ContentLength: secondPartBuffer.length,
          Body: secondPartBuffer, // ~ 6MB
        })
        .promise();

      const result = await s3
        .completeMultipartUpload({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-3.txt',
          UploadId,
          MultipartUpload: {
            Parts: [
              {
                PartNumber: 1,
                ETag: result1.ETag,
              },
              {
                PartNumber: 2,
                ETag: result2.ETag,
              },
            ],
          },
        })
        .promise();

      const expectedEtag =
        '"' +
        crypto
          .createHash('md5')
          .update(crypto.createHash('md5').update(firstPartBuffer).digest())
          .update(crypto.createHash('md5').update(secondPartBuffer).digest())
          .digest('hex') +
        '-2"';

      const object = await s3
        .getObject({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-3.txt',
        })
        .promise();

      expect(
        (object.Body as Buffer).toString('utf-8') ===
          firstPartBuffer.toString('utf-8') + secondPartBuffer.toString('utf-8'),
      ).to.be.true;

      expect(result.ETag).to.be.eq(expectedEtag);
    }).timeout(0);

    it('uploads part with correct Content-MD5', async () => {
      const { UploadId } = await s3
        .createMultipartUpload({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-2.txt',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      const body = Buffer.alloc(5242880).fill('a'); // ~ 5MB

      const result = await s3
        .uploadPart({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-2.txt',
          PartNumber: 1,
          UploadId,
          ContentLength: 5242880,
          Body: body,
          ContentMD5: crypto.createHash('md5').update(body).digest('base64'),
        })
        .promise();

      expect(result.ETag).to.be.a.string;
    }).timeout(0);

    it('fails when Content-MD5 is incorrect', async () => {
      const { UploadId } = await s3
        .createMultipartUpload({
          Bucket: process.env.COLDSTACK_BUCKET,
          Key: 'multipart-2.txt',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise();

      const body = Buffer.alloc(5242880).fill('a'); // ~ 5MB
      try {
        await s3
          .uploadPart({
            Bucket: process.env.COLDSTACK_BUCKET,
            Key: 'multipart-2.txt',
            PartNumber: 1,
            UploadId,
            ContentLength: 5242880,
            Body: body,
            ContentMD5: crypto.createHash('md5').update('not original content').digest('base64'),
          })
          .promise();
        throw new Error('No error were thrown');
      } catch (err) {
        expect(err.code).to.be.eq('BadDigest');
      }
    }).timeout(0);
  }

  for (const storageType of storageTypes) {
    if (storageType === 'arweave') {
      continue;
    }
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
