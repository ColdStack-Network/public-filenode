import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import _accounts from './accounts';
import { v4 as uuid } from 'uuid';
import { expect } from 'chai';
import { randomStream } from 'iso-random-stream';
import { finished as _finished } from 'stream';
import { promisify } from 'util';
import { ByteUnit, Time } from 'hl-digits';

dotenv.config();

const finished = promisify(_finished);

describe('Highload', () => {
  let accounts: (typeof _accounts[0] & { s3: AWS.S3 })[] = [];

  before(() => {
    accounts = _accounts.map((account) => {
      const result: any = { ...account };

      result.s3 = new AWS.S3({
        endpoint: new AWS.Endpoint(process.env.HIGHLOAD_TESTS_FILENODE_URL),
        accessKeyId: account.accessKeyId,
        secretAccessKey: account.secretAccessKey,
        signatureVersion: 'v4',
      });

      return result;
    });
  });

  it('Upload 10 small files in parallel and download', async () => {
    await Promise.all(
      accounts.map(async (account) => {
        const key = `${uuid()}.content`;

        try {
          await account.s3
            .putObject({
              Key: key,
              Bucket: account.bucket,
              Body: 'content',
            })
            .promise();

          const result = await account.s3
            .getObject({
              Key: key,
              Bucket: account.bucket,
            })
            .promise();

          expect(result.Body.toString('utf-8')).to.be.eq('content');
        } catch (err) {
          console.error({ bucket: account.bucket, key: key }, err);
          throw err;
        }
      }),
    );
  }).timeout(Time.minutes(2));

  const bucketTo1GBObject: Record<string, string> = {};

  it('Upload 10 files of 1GB and try to get metadatas', async () => {
    await Promise.all(
      accounts.map(async (account) => {
        const key = `${uuid()}.1gb`;

        bucketTo1GBObject[account.bucket] = key;

        const timeLabel = `Upload performance for 1GB file. bucket: ${account.bucket}; wallet: ${account.address}`;
        console.time(timeLabel);

        try {
          await account.s3
            .upload({
              Key: key,
              Bucket: account.bucket,
              Body: randomStream(ByteUnit.gb(1)),
              ContentLength: ByteUnit.gb(1),
            })
            .promise();

          console.timeEnd(timeLabel);

          const result = await account.s3
            .headObject({
              Key: key,
              Bucket: account.bucket,
            })
            .promise();

          expect(result.ContentLength).to.be.eq(ByteUnit.gb(1));
        } catch (err) {
          console.error({ bucket: account.bucket, key: key }, err);
          throw err;
        }
      }),
    );
  }).timeout(0);

  it('Download 10 1GB files', async () => {
    await Promise.all(
      accounts.map(async (account) => {
        const key = bucketTo1GBObject[account.bucket];

        if (!key) {
          console.log('Download for ' + account.bucket + ' skipped.');
          return;
        }

        const timeLabel = `Download performance for 1GB file. bucket: ${account.bucket}; wallet: ${account.address}`;
        console.time(timeLabel);

        try {
          const readableStream = account.s3
            .getObject({
              Key: key,
              Bucket: account.bucket,
            })
            .createReadStream();

          let size = 0;

          readableStream.on('data', (chunk) => {
            size += chunk.length;
          });

          await finished(readableStream);

          console.timeEnd(timeLabel);

          expect(size).to.be.eq(ByteUnit.gb(1));
        } catch (err) {
          console.error({ bucket: account.bucket, key: key }, err);
          throw err;
        }
      }),
    );
  }).timeout(Time.hours(1));
});
