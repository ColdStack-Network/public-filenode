import {
  All,
  Controller,
  Delete,
  forwardRef,
  Get,
  Head,
  Inject,
  Post,
  Put,
  Req,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import { PutObjectRequestHeadersDto } from './dto/put-object-request-headers.dto';
import { Request, Response } from 'express';
import { ListAndHeadApiService } from './list-and-head-api.service';
import { GetObjectRequestHeadersDto } from './dto/get-object-request-headers.dto';
import { GetObjectRequestQueryDto } from './dto/get-object-request-query.dto';
import { ListObjectsV2RequestQueryDto } from './dto/list-objects-v2-request-query.dto';
import { ClassConstructor } from 'class-transformer';
import { CreateMultipartUploadRequestHeadersDto } from './dto/multipart-upload/create-multipart-upload-request-headers.dto';
import { UploadPartRequestHeadersDto } from './dto/multipart-upload/upload-part-request-headers.dto';
import { UploadPartRequestQueryDto } from './dto/multipart-upload/upload-part-request-query.dto';
import { CompleteMultipartUploadRequestQueryDto } from './dto/multipart-upload/complete-multipart-upload-request-query.dto';
import { AuthService } from '../auth/auth.service';
import { ErrorsService } from '../errors/errors.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PutAndGetApiService } from './put-and-get-api.service';
import { MultipartApiService } from './multipart-api.service';
import { BucketsService } from './buckets.service';
import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import { ACLService } from './acl.service';
import { CommonUtilsService } from './common-utils.service';
import { StatisticsService } from './statistics.service';
import { UsersAbilitiesService } from './users-abilities.service';
import { DeleteObjectService } from '../object-deletions/delete-object.service';
import { DeleteObjectsBulkService } from '../object-deletions/delete-objects-bulk.service';
import { TaggingService } from '../tagging/tagging.service';

@Controller()
export class ObjectsController {
  constructor(
    @Inject(forwardRef(() => PutAndGetApiService))
    private readonly putAndGetApiService: PutAndGetApiService,
    @Inject(forwardRef(() => MultipartApiService))
    private readonly multipartApiService: MultipartApiService,
    @Inject(forwardRef(() => ListAndHeadApiService))
    private readonly listAndHeadApiService: ListAndHeadApiService,
    @Inject(forwardRef(() => BucketsService))
    private readonly bucketsService: BucketsService,
    @Inject(forwardRef(() => ACLService))
    private readonly aclService: ACLService,
    @Inject(forwardRef(() => StatisticsService))
    private readonly statisticsService: StatisticsService,
    @Inject(forwardRef(() => DeleteObjectService))
    private readonly deleteObjectService: DeleteObjectService,
    @Inject(forwardRef(() => DeleteObjectsBulkService))
    private readonly deleteObjectsBulkService: DeleteObjectsBulkService,
    @Inject(forwardRef(() => UsersAbilitiesService))
    private readonly usersAbilitiesService: UsersAbilitiesService,
    @Inject(forwardRef(() => TaggingService))
    private readonly taggingService: TaggingService,
    @Inject(forwardRef(() => CommonUtilsService))
    private readonly commonUtils: CommonUtilsService,
    private readonly authService: AuthService,
    private readonly errorsService: ErrorsService,
    @InjectPinoLogger(ObjectsController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Head('*')
  async headHandler(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

      const authResult = await this.authenticateWithAuthnode(request, response);

      if (authResult.error) {
        return;
      }

      if (!params.key) {
        this.bucketsService.headBucket(response);
      } else {
        await this.headObject(request, response);
      }
    } catch (err) {
      this.logger.error(err);
      // TODO: send error in XML
      response.status(500).send();
    }
  }

  @Get('*')
  async getHandler(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

      if (
        params.bucket &&
        params.key &&
        !('extendedInfo' in request.query) &&
        !('acl' in request.query) &&
        !('tagging' in request.query)
      ) {
        await this.getObject(request, response);
      } else {
        const authResult = await this.authenticateWithAuthnode(request, response);

        if (authResult.error) {
          return;
        }

        if (!params.bucket && !params.key && 'canUpload' in request.query) {
          await this.usersAbilitiesService.canUserUpload(request, response, authResult.user);
        } else if (!params.bucket && !params.key && 'canDownload' in request.query) {
          await this.usersAbilitiesService.canUserDownload(request, response, authResult.user);
        } else if (!params.bucket && !params.key && 'searchFiles' in request.query) {
          const searchParams = this.commonUtils.getSearchParamsFromRequest(request);

          await this.listAndHeadApiService.listFiles(request, response, searchParams, authResult.user);
        } else if (!params.bucket && !params.key && 'statistics' in request.query) {
          await this.statisticsService.getStatistics(request, response, authResult.user);
        } else if (!params.bucket && !params.key && 'bandwidthAnalytics' in request.query) {
          await this.statisticsService.getBandwidthAnalytics(request, response, authResult.user);
        } else if (!params.bucket && !params.key && 'storageAnalytics' in request.query) {
          await this.statisticsService.getStorageAnalytics(request, response, authResult.user);
        } else if (!params.bucket && !params.key && 'extendedBuckets' in request.query) {
          await this.bucketsService.listExtendedBuckets(request, response, authResult.user);
        } else if (params.bucket && !params.key && 'extendedObjects' in request.query) {
          await this.listAndHeadApiService.listObjectsExtended(request, response, params);
        } else if (params.bucket && params.key && 'extendedInfo' in request.query) {
          await this.listAndHeadApiService.getExtendedInfoOfObject(request, response, params);
        } else if (params.bucket && params.key && 'tagging' in request.query) {
          await this.taggingService.getObjectTagging(request, response, params);
        } else if (params.bucket && params.key && 'acl' in request.query) {
          await this.aclService.getObjectAcl(request, response, params);
        } else if (params.bucket && !params.key && 'acl' in request.query) {
          await this.aclService.getBucketAcl(request, response, params);
        } else if (params.bucket && !params.key && 'requestPayment' in request.query) {
          await this.bucketsService.getBucketRequestPayment(request, response);
        } else if (params.bucket && !params.key && 'replication' in request.query) {
          await this.bucketsService.getBucketReplication(request, response, params, authResult.user);
        } else if (params.bucket && !params.key && 'logging' in request.query) {
          await this.bucketsService.getBucketLogging(request, response);
        } else if (params.bucket && !params.key && 'tagging' in request.query) {
          await this.taggingService.getBucketTagging(request, response, params);
        } else if (params.bucket && 'location' in request.query) {
          await this.bucketsService.getBucketLocation(request, response);
        } else if (params.bucket && 'versioning' in request.query) {
          await this.bucketsService.getBucketVersioning(request, response);
        } else if (params.bucket && 'object-lock' in request.query) {
          await this.bucketsService.getObjectLockConfiguration(request, response, params);
        } else if (params.bucket && !params.key && 'uploads' in request.query) {
          await this.multipartApiService.listMultipartUploads(request, response, params);
        } else if (!params.bucket && !params.key) {
          await this.bucketsService.listBuckets(request, response, authResult.user);
        } else if (!params.key && request.query['list-type'] === '2') {
          await this.listObjectsV2(request, response);
        } else if (!params.key) {
          await this.listAndHeadApiService.listObjects(request, response, params);
        } else {
          this.errorsService.sendError(response, {
            code: 'NotImplemented',
            requestId: request.id.toString(),
          });
        }
      }
    } catch (err) {
      this.logger.error(err);
      // TODO: send error in XML
      response.status(500).send();
    }
  }

  @Put('*')
  async putHandler(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      this.logger.time('auth');
      const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);
      const authResult = await this.authenticateWithAuthnode(request, response);
      this.logger.timeEnd('auth');

      if (authResult.error) {
        return;
      }

      if (params.bucket && params.key && request.query.uploadId) {
        this.logger.time('upload part');
        await this.uploadPart(request, response);
        this.logger.timeEnd('upload part');
      } else if (params.bucket && params.key && 'acl' in request.query) {
        await this.aclService.putObjectAcl(request, response, params);
      } else if (params.bucket && !params.key && 'acl' in request.query) {
        await this.aclService.putBucketAcl(request, response);
      } else if (params.bucket && params.key && request.headers['x-amz-copy-source']) {
        await this.putAndGetApiService.copyObject(request, response, params);
      } else if (params.key) {
        this.logger.time('put object');
        await this.putObject(request, response, authResult.user);
        this.logger.timeEnd('put object');
      } else if (!params.key) {
        await this.bucketsService.createBucket(request, response, authResult.user, params);
      } else {
        this.errorsService.sendError(response, {
          code: 'NotImplemented',
          requestId: request.id.toString(),
        });
      }
    } catch (err) {
      this.logger.error(err);
      // TODO: send error in XML
      response.status(500).send();
    }
  }

  @Post('*')
  async postHandler(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      this.logger.time('auth');
      const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);
      const authResult = await this.authenticateWithAuthnode(request, response);

      this.logger.timeEnd('auth');

      if (authResult.error) {
        return;
      }

      if ('uploads' in request.query) {
        this.logger.time('create multipart upload');
        await this.createMultipartUpload(request, response, authResult.user);
        this.logger.timeEnd('create multipart upload');
      } else if (request.query.uploadId) {
        this.logger.time('complete multipart upload');
        await this.completeMultipartUpload(request, response, authResult.user);
        this.logger.timeEnd('complete multipart upload');
      } else if ('delete' in request.query) {
        this.logger.time('delete objects bulk');
        await this.deleteObjectsBulkService.deleteObjectsBulk(request, response, params, authResult.user);
        this.logger.timeEnd('delete objects bulk');
      } else {
        this.errorsService.sendError(response, {
          code: 'NotImplemented',
          requestId: request.id.toString(),
        });
      }
    } catch (err) {
      this.logger.error(err);
      // TODO: send error in XML
      response.status(500).send();
    }
  }

  @Delete('*')
  async deleteHandler(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      this.logger.time('auth');
      const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

      const authResult = await this.authenticateWithAuthnode(request, response);

      this.logger.timeEnd('auth');

      if (authResult.error) {
        return;
      }

      if (params.bucket && params.key && 'uploadId' in request.query) {
        await this.multipartApiService.abortMultipartUpload(request, response, params);
      } else if (params.bucket && params.key) {
        this.logger.time('deleteObjectService.deleteObject');
        await this.deleteObjectService.deleteObject(request, response, params, authResult.user);
        this.logger.time('deleteObjectService.deleteObject');
      } else if (params.bucket && !params.key) {
        await this.bucketsService.deleteBucket(request, response, params);
      } else {
        this.errorsService.sendError(response, {
          code: 'NotImplemented',
          requestId: request.id.toString(),
        });
      }
    } catch (err) {
      this.logger.error(err);
      // TODO: send error in XML
      response.status(500).send();
    }
  }

  @All('*')
  async allHandler(@Req() request: Request, @Res() response: Response): Promise<void> {
    try {
      const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

      const authResult = await this.authenticateWithAuthnode(request, response);

      if (authResult.error) {
        return;
      }

      if (request.method === 'MOVE' && params.bucket && params.key) {
        await this.putAndGetApiService.editObjectKey(request, response, authResult.user, params);
      } else if (request.method === 'MOVE' && params.bucket) {
        await this.bucketsService.renameBucket(request, response, authResult.user, params);
      } else {
        this.errorsService.sendError(response, {
          code: 'NotImplemented',
          requestId: request.id.toString(),
        });
      }
    } catch (err) {
      this.logger.error(err);
      // TODO: send error in XML
      response.status(500).send();
    }
  }

  async listObjectsV2(request: Request, response: Response): Promise<void> {
    const query = await this.validateQuery(request, ListObjectsV2RequestQueryDto);
    const bucketAndKey = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

    const result = await this.listAndHeadApiService.listObjectsV2(query, bucketAndKey);

    response.header('content-type', 'application/xml');

    response.status(200).send(result);
  }

  async getObject(request: Request, response: Response): Promise<void> {
    const headers = await this.validateHeaders(request, GetObjectRequestHeadersDto);
    const query = await this.validateQuery(request, GetObjectRequestQueryDto);

    const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

    await this.putAndGetApiService.getObject(request, response, headers, query, params);
  }

  async putObject(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    try {
      const headers = await this.validateHeaders(request, PutObjectRequestHeadersDto);
      const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

      await this.putAndGetApiService.putObject(request, response, headers, params, user);
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }

  async createMultipartUpload(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    const headers = await this.validateHeaders(request, CreateMultipartUploadRequestHeadersDto);
    const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

    await this.multipartApiService.createMultipartUpload(request, response, headers, params, user);
  }

  async uploadPart(request: Request, response: Response): Promise<void> {
    const headers = await this.validateHeaders(request, UploadPartRequestHeadersDto);
    const query = await this.validateQuery(request, UploadPartRequestQueryDto);
    const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

    await this.multipartApiService.uploadPart(request, response, headers, query, params);
  }

  async completeMultipartUpload(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    const query = await this.validateQuery(request, CompleteMultipartUploadRequestQueryDto);
    const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

    await this.multipartApiService.completeMultipartUpload(request, response, query, params, user);
  }

  async headObject(request: Request, response: Response): Promise<void> {
    const headers = await this.validateHeaders(request, GetObjectRequestHeadersDto);
    const query = await this.validateQuery(request, GetObjectRequestQueryDto);
    const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

    await this.listAndHeadApiService.headObject(request, response, headers, query, params);
  }

  private async validateQuery<T extends ClassConstructor<any>>(
    request: Request,
    validationDto: T,
  ): Promise<InstanceType<T>> {
    const validationPipe = new ValidationPipe({
      expectedType: validationDto,
      transform: true,
      whitelist: true,
    });

    const validatedData = await validationPipe.transform(request.query, {
      type: 'query',
    });

    return validatedData;
  }

  private async validateHeaders<T extends ClassConstructor<any>>(
    request: Request,
    validationDto: T,
  ): Promise<InstanceType<T>> {
    const validationPipe = new ValidationPipe({
      expectedType: validationDto,
      transform: true,
      whitelist: true,
      validateCustomDecorators: true,
    });

    const validatedData = await validationPipe.transform(request.headers, {
      type: 'custom',
    });

    return validatedData;
  }

  private async authenticateWithAuthnode(
    request: Request,
    response: Response,
  ): Promise<{
    /**
     * If error === true, that means that an error accurred during authoriztion,
     * and a response containing the error already has been sent, so no further
     * data should be sent to the client. Just close the connection (e.g as it is in the objects.controller.ts)
     */
    error: boolean;
    /**
     * If error === false, then here will be the user's data.
     */
    user?: UserFromAuthnode;
  }> {
    const params = this.commonUtils.getBucketAndObjectKeyFromRequest(request);

    const authResult = await this.authService.authWithAuthnode(request, params);

    if (!authResult.error) {
      return { error: false, user: authResult.user };
    }

    response
      .header('Content-Type', 'application/xml')
      .status(403)
      .send(this.errorsService.createAccessDeniedError(request.path));

    return { error: true };
  }
}
