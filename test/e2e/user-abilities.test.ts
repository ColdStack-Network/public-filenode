import AWS from 'aws-sdk';
require('dotenv').config();
import axios from 'axios';
import { AxiosInstance } from 'axios';
import { aws4Interceptor } from 'aws4-axios';
import { expect } from 'chai';
import { Time } from 'hl-digits';

describe('UserAbilities', () => {
  let s3: AWS.S3 = null;

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

    it('returns canUpload result', async () => {
      const response = await s3Api.request({
        url: '?canUpload',
        method: 'GET',
      });

      expect(response.data).to.have.property('CanUpload').that.is.a('boolean');
      expect(
        response.data.Message === null || typeof response.data.Message === 'string',
        'Message is not string or null.',
      ).to.be.eq(true);
    }).timeout(Time.seconds(100));

    it('returns canDownload result', async () => {
      const response = await s3Api.request({
        url: '?canDownload',
        method: 'GET',
      });

      expect(response.data).to.have.property('CanDownload').that.is.a('boolean');
      expect(
        response.data.Message === null || typeof response.data.Message === 'string',
        'Message is not string or null.',
      ).to.be.eq(true);
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
