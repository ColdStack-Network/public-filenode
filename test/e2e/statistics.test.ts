import AWS from 'aws-sdk';
require('dotenv').config();
import { expect } from 'chai';
import axios from 'axios';
import { AxiosInstance } from 'axios';
import { aws4Interceptor } from 'aws4-axios';
import { v4 as uuidv4 } from 'uuid';
import { Time } from 'hl-digits';

type TestFiles = { Key: string };
type ArrowType = 'up';
type StasisticsResponse = {
  Statistics: {
    Buckets: {
      Count: number;
      Arrow: ArrowType;
    };
    Objects: {
      Count: number;
      Arrow: ArrowType;
    };
    UsedStorage: {
      UsedStorageBytes: string;
      UsedStorageReadableQuantity: string;
      UsedStorageReadableUnit: string;
      Arrow: ArrowType;
    };
    Bandwidth: {
      BandwidthBytes: string;
      BandwidthReadableQuantity: string;
      BandwidthReadableUnit: string;
      Arrow: ArrowType;
    };
  };
};

const TEST_STATISTICS_BUCKET_NAME = 'test-statistics-bucket';
const deleteFilesFromBucket = async (s3: AWS.S3, bucketName: string) => {
  try {
    const { Contents } = await s3.listObjectsV2({ Bucket: bucketName }).promise();
    const objectsID = Contents?.map((o) => ({ Key: o.Key }));

    if (objectsID.length) {
      return await s3.deleteObjects({ Bucket: bucketName, Delete: { Objects: objectsID } }).promise();
    }
  } catch (e) {
    console.log(e);
  }
};

const insertTestFiles = async (s3: AWS.S3, storageType: string): Promise<TestFiles[]> => {
  let testFiles = Array(5)
    .fill(1)
    .map(() => ({
      Key: `test_file_${uuidv4()}`,
    })) as TestFiles[];

  // adding 2 folders and file in nested folder
  const folder_key_level_1 = `folder_level-1_${uuidv4()}/`;
  const folder_key_level_2 = `${folder_key_level_1}/folder_level-2_${uuidv4()}/`;

  testFiles = [
    ...testFiles,
    { Key: folder_key_level_1 },
    { Key: folder_key_level_2 },
    { Key: `${folder_key_level_2}test_nested_file_${uuidv4()}` },
  ];

  await Promise.all(
    testFiles.map(({ Key }) =>
      s3
        .putObject({
          Bucket: TEST_STATISTICS_BUCKET_NAME,
          Key,
          Body: 'content',
          Metadata: storageType === 'default' ? {} : { storage: storageType },
        })
        .promise(),
    ),
  );
  return testFiles;
};

describe('test get statistics', () => {
  let s3: AWS.S3 = null;
  let s3Api: AxiosInstance = null;
  const storageTypes: string[] = JSON.parse(process.env.TEST_STORAGE_TYPES);
  let excludeFileCountFromTest = 0;

  async function beforeTests(signatureVersion: 'v2' | 'v4') {
    AWS.config.update({
      region: 'us-east-1',
      accessKeyId: process.env.COLDSTACK_TOKEN_ID,
      secretAccessKey: process.env.COLDSTACK_SECRET_KEY,
      signatureVersion,
    });

    s3 = new AWS.S3({
      endpoint: new AWS.Endpoint(process.env.COLDSTACK_ENDPOINT),
      s3ForcePathStyle: true,
      signatureVersion,
    });

    const { Buckets } = await s3.listBuckets().promise();
    const bucketNames = Buckets.map((b) => b.Name);
    await Promise.all(bucketNames.map((b) => deleteFilesFromBucket(s3, b)));
    const r = await Promise.all(bucketNames.map((b) => s3.listObjects({ Bucket: b }).promise()));
    excludeFileCountFromTest = 0;
    bucketNames.forEach((bucketName, idx) => {
      const bucketFiles = r[idx].Contents;
      if (bucketName === TEST_STATISTICS_BUCKET_NAME) return false;
      for (const file of bucketFiles) {
        excludeFileCountFromTest += 1;
      }
    });

    try {
      await s3.createBucket({ Bucket: TEST_STATISTICS_BUCKET_NAME }).promise();
    } catch (e) {
      console.log(`create bucket ${TEST_STATISTICS_BUCKET_NAME} already exist`);
    }

    s3Api = axios.create({
      baseURL: process.env.COLDSTACK_ENDPOINT,
    });

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
  }

  function tests(storageType: string) {
    it('expect to get file count without counting folders', async () => {
      await insertTestFiles(s3, storageType);
      const result = await s3Api.request<StasisticsResponse>({
        url: '?statistics&format=json',
        method: 'GET',
      });

      expect(result.data.Statistics.Objects.Count - excludeFileCountFromTest).to.be.eq(6);
    }).timeout(Time.minutes(1));
  }

  for (const storageType of storageTypes) {
    describe(`Testing for storage type ${storageType}`, () => {
      describe('Signature Version 2', () => {
        before(async function () {
          this.timeout(10000);
          await beforeTests('v2');
        });
        tests(storageType);
      });

      describe('Signature Version 4', () => {
        before(async function () {
          this.timeout(10000);
          await beforeTests('v4');
        });
        tests(storageType);
      });
    });
  }
});
