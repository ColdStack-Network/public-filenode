import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { BucketsService } from '../objects/buckets.service';
import { APP_CONFIGS_KEY, TAppConfigs } from '../config/app.config';
import axios from 'axios';
import { AxiosInstance } from 'axios';
import { UserFromAuthnode } from './interface/user-from-authnode.interface';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class AuthService {
  private readonly axios: AxiosInstance;

  constructor(
    @Inject(APP_CONFIGS_KEY)
    appConfigs: TAppConfigs,
    @Inject(forwardRef(() => BucketsService))
    private readonly bucketsService: BucketsService,
    @InjectPinoLogger(AuthService.name)
    private readonly logger: PinoLogger,
  ) {
    this.axios = axios.create({
      baseURL: appConfigs.authnodeUrl,
    });
  }

  public async authWithAuthnode(
    request: Request,
    params: { bucket: string; key: string },
  ): Promise<{ error: boolean; user?: UserFromAuthnode }> {
    try {
      const originalPath = request.originalUrl.includes('?')
        ? request.originalUrl.substring(0, request.originalUrl.indexOf('?'))
        : request.originalUrl;

      const response = await this.axios.post<UserFromAuthnode>('aws-sig/check', {
        headers: request.headers,
        method: request.method,
        url: request.url,
        path: originalPath,
        hostname: request.hostname,
        query: request.query,
      });

      const buckets = await this.bucketsService.findBucketsByOwnerPublicKey(response.data.user.publicKey);

      /**
       * Denay access if request is attempting to access a specific bucket
       * but does not own it. An exception is when request is attempting to create the bucket.
       */
      if (
        params.bucket &&
        !buckets.some((bucket) => bucket.name === params.bucket) &&
        // If request method is PUT and there is no param but the bucket is specified
        // that means the request is attempting to create a bucket
        !(request.method === 'PUT' && !params.key)
      ) {
        this.logger.info(`Auth error: Bucket does not exist: tried to access: ${params.bucket}`);

        return { error: true };
      }

      return { error: false, user: response.data };
    } catch (err) {
      this.logger.info(err);
      return { error: true };
    }
  }

  public async authenticateV4Chunk(params: {
    accessKeyId: string;
    dateTime: string;
    previousSignature: string;
    currentChunkDataSha256: string;
    credentialsDate: string;
    credentialsRegion: string;
    signature: string;
  }): Promise<void> {
    await this.axios.post('aws-sig/check-v4-chunk', params);
  }
}
