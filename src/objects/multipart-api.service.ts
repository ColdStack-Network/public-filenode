import { PassThrough, finished } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { ObjectRepository } from './repositories/object.repository';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import digestStream from 'digest-stream';
import xml from 'xml';
import { CreateMultipartUploadRequestHeadersDto } from './dto/multipart-upload/create-multipart-upload-request-headers.dto';
import { MultipartUploadRepository } from './repositories/multipart-upload.repository';
import { MultipartUploadPartRepository } from './repositories/multipart-upload-part.repository';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UploadPartRequestHeadersDto } from './dto/multipart-upload/upload-part-request-headers.dto';
import { UploadPartRequestQueryDto } from './dto/multipart-upload/upload-part-request-query.dto';
import { CompleteMultipartUploadRequestQueryDto } from './dto/multipart-upload/complete-multipart-upload-request-query.dto';
import { MultipartUploadPartEntity } from './entities/multipart-upload-part.entity';
import crypto from 'crypto';
import { ObjectMetadataRepository } from './repositories/object-metadata.repository';
import { ObjectMetadataEntity } from './entities/object-metadata.entity';
import { BlockchainWriterService } from '../blockchain-writer/blockchain-writer.service';
import { CommonUtilsService } from './common-utils.service';
import { GatewayChooserAiService } from '../gateway-chooser-ai/gateway-chooser-ai.service';
import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import { GatewaysV3Service } from '../gateways/gateways-v3.service';
import { StatisticsService } from './statistics.service';
import { BucketRepository } from './repositories/bucket.repository';
import { MultipartUploadEntity } from './entities/multipart-upload.entity';
import _ from 'lodash';
import { ErrorsService } from '../errors/errors.service';
import axios from 'axios';
import { storageClassesToCode } from './constants/storage-classes-to-code';
import { DeleteObjectService } from '../object-deletions/delete-object.service';

@Injectable()
export class MultipartApiService {
  constructor(
    private readonly objectRepo: ObjectRepository,
    private readonly bucketRepo: BucketRepository,
    private readonly multipartUploadRepo: MultipartUploadRepository,
    private readonly multipartUploadPartRepo: MultipartUploadPartRepository,
    private readonly objectMetadataRepo: ObjectMetadataRepository,
    private readonly blockchainWriterService: BlockchainWriterService,
    @Inject(forwardRef(() => StatisticsService))
    private readonly statisticsService: StatisticsService,
    @Inject(forwardRef(() => DeleteObjectService))
    private readonly deleteObjectService: DeleteObjectService,
    @Inject(forwardRef(() => CommonUtilsService))
    private readonly commonUtilsService: CommonUtilsService,
    @InjectPinoLogger(MultipartApiService.name)
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => GatewayChooserAiService))
    private readonly gatewayChooserAiService: GatewayChooserAiService,
    @Inject(forwardRef(() => GatewaysV3Service))
    private readonly gatewaysV3Service: GatewaysV3Service,
    @Inject(forwardRef(() => ErrorsService))
    private readonly errorsService: ErrorsService,
  ) {}

  public async createMultipartUpload(
    request: Request,
    response: Response,
    headers: CreateMultipartUploadRequestHeadersDto,
    params: { bucket: string; key: string },
    user: UserFromAuthnode,
  ): Promise<void> {
    this.logger.time('check balance');
    if (!(await this.commonUtilsService.hasAtLeast1DollarOrCantConnectToBlockchain(user.user.publicKey))) {
      this.errorsService.sendError(response, {
        code: 'NotEnoughBalance',
        requestId: request.id.toString(),
        resource: `${params.bucket}/${params.key}`,
      });

      return;
    }

    this.logger.timeEnd('check balance');

    const { storageClass, errored: storageClassValidationErrored } = this.commonUtilsService.validateStorageClass({
      response,
      request,
      params,
    });

    if (storageClassValidationErrored) {
      return;
    }

    this.logger.info('Start multipart');
    const metadatasDict: Record<string, string> = this.commonUtilsService.parseAmzMetadataHeaders(request.headers);
    this.logger.time('choose gateway');
    const { forceChoosenGatewayType, gateways } = await this.gatewayChooserAiService.chooseGatewayFromBlockchain({
      isMultipartUpload: true,
      contentLength: null,
      forceChosenGatewayType: metadatasDict.storage,
      userKey: user.user.publicKey,
    });
    this.logger.timeEnd('choose gateway');

    const { nodeAddress: gatewayNodeAddress, storageText: gatewayType, url: gatewayAddress } = gateways[0];
    // const { gatewayType, isStorageForceChosen } = this.commonUtilsService.chooseStorage(metadatasDict);

    const UploadId = uuidv4();

    this.logger.time('start multipart');
    await this.gatewaysV3Service.startMultipartUpload({
      gatewayAddress,
      idempotency_id: UploadId,
      storageForceChosen: !!forceChoosenGatewayType,
    });
    this.logger.timeEnd('start multipart');

    this.logger.time('save multipart to db');
    const multipartUpload = await this.multipartUploadRepo.save({
      id: uuidv4(),
      bucket: params.bucket,
      key: params.key,
      contentDisposition: headers['content-disposition'],
      contentEncoding: headers['content-encoding'],
      contentLanguage: headers['content-language'],
      contentType: headers['content-type'],
      headers: {
        'Cache-Control': this.commonUtilsService.getOneHeader(request, 'cache-control'),
        'Content-Disposition': this.commonUtilsService.getOneHeader(request, 'content-disposition'),
        'Content-Encoding': this.commonUtilsService.getOneHeader(request, 'content-encoding'),
        'Content-Language': this.commonUtilsService.getOneHeader(request, 'content-language'),
        'Content-Type': this.commonUtilsService.getOneHeader(request, 'content-type'),
        Expires: this.commonUtilsService.getOneHeader(request, 'expires'),
      },
      createdAt: new Date(),
      gatewayType: gatewayType,
      status: 'IN_PROGRESS',
      storageForceChosen: !!forceChoosenGatewayType,
      gatewayAddress,
      gatewayEthAddress: gatewayNodeAddress,
      gatewayMultipartUploadId: UploadId,
      objectMetadata: metadatasDict,
      storageClass,
      acl:
        typeof request.headers['x-amz-acl'] === 'string' &&
        request.headers['x-amz-acl'].toLocaleLowerCase() === 'public-read'
          ? 'public-read'
          : 'private',
    });
    this.logger.timeEnd('save multipart to db');
    const result = xml(
      [
        {
          InitiateMultipartUploadResult: [
            { Bucket: params.bucket },
            { Key: params.key },
            { UploadId: multipartUpload.id },
          ],
        },
      ],
      {
        declaration: true,
      },
    );

    response.status(200).send(result);
  }

  /**
   * @TODO check md5 and content-length
   */
  public async uploadPart(
    request: Request,
    response: Response,
    headers: UploadPartRequestHeadersDto,
    query: UploadPartRequestQueryDto,
    params: { bucket: string; key: string },
  ): Promise<void> {
    this.logger.time('find multipart from db');
    const multipartUpload = await this.multipartUploadRepo.findByKeyAndBucketAndId({
      id: query.uploadId,
      bucket: params.bucket,
      key: params.key,
    });
    this.logger.timeEnd('find multipart from db');

    if (!multipartUpload || multipartUpload.status !== 'IN_PROGRESS') {
      this.errorsService.sendError(response, {
        code: 'NoSuchUpload',
        requestId: request.id.toString(),
        resource: `${params.bucket}/${params.key}`,
      });

      return;
    }

    let contentMd5: string;
    let contentSize: number;

    const passthrough = new PassThrough({});

    request
      .pipe(
        digestStream('md5', 'hex', (resultDigest, _contentSize) => {
          contentMd5 = resultDigest;
          contentSize = _contentSize;
        }),
      )
      .pipe(passthrough);

    let bandwidthUsed = 0;
    request.on('data', (chunk) => {
      bandwidthUsed += chunk.length;
    });
    finished(request, (err) => {
      this.statisticsService
        .reportBandwidthUsage({
          bucketName: params.bucket,
          size: bandwidthUsed.toString(),
          type: 'upload',
          info: {
            bucket: params.bucket,
            key: params.key,
            partNumber: query.partNumber,
            gatewayAddress: multipartUpload.gatewayAddress,
            err: err ? `${err}` : null,
          },
        })
        .catch((err) => {
          this.logger.error('Error reporting bandwidth usage: %s', err);
        });
    });

    this.logger.time('upload part to gateway');
    await this.gatewaysV3Service
      .uploadPart({
        gatewayAddress: multipartUpload.gatewayAddress,
        idempotency_id: multipartUpload.gatewayMultipartUploadId,
        part_number: query.partNumber,
        readableStream: passthrough,
        contentLength: +request.headers['content-length'],
        contentMd5: typeof request.headers['content-md5'] === 'string' ? request.headers['content-md5'] : undefined,
      })
      .catch((err) => {
        if (err?.response?.data?.code === 'BadDigest') {
          this.logger.error(
            { response: { data: err?.response?.data, headers: err?.response?.headers, status: err?.response?.status } },
            'Bad digest',
          );
          this.errorsService.sendError(response, {
            code: 'BadDigest',
            requestId: request.id.toString(),
          });
        } else {
          this.logger.error(
            { response: { data: err?.response?.data, headers: err?.response?.headers, status: err?.response?.status } },
            'Error while trying to transfer part',
          );
          if (axios.isAxiosError(err)) {
            delete err.config.data;
            delete err.request;
          }

          throw err;
        }
      });

    this.logger.timeEnd('upload part to gateway');

    this.logger.time('find existing part from db');
    let uploadPart = await this.multipartUploadPartRepo.findByMultipartUploadIdAndPartNumber(
      multipartUpload.id,
      query.partNumber,
    );

    this.logger.time('find part from db');

    this.logger.time('save part to db');
    if (uploadPart) {
      uploadPart.size = contentSize;
      uploadPart.md5Sum = contentMd5;
      await this.multipartUploadPartRepo.save(uploadPart);
    } else {
      uploadPart = await this.multipartUploadPartRepo.save({
        id: uuidv4(),
        bucket: multipartUpload.bucket,
        createdAt: new Date(),
        md5Sum: contentMd5,
        multipartUploadId: multipartUpload.id,
        partNumber: query.partNumber,
        size: contentSize,
      });
    }

    this.logger.timeEnd('save part to db');

    response.header('ETag', `"${contentMd5}"`);
    response.status(200).send();
  }

  /**
   * @TODO verify the request body. There is the list of parts, it should be verified
   */
  public async completeMultipartUpload(
    request: Request,
    response: Response,
    query: CompleteMultipartUploadRequestQueryDto,
    params: { bucket: string; key: string },
    user: UserFromAuthnode,
  ): Promise<void> {
    this.logger.time('find multipart from db');
    const multipartUpload = await this.multipartUploadRepo.findByKeyAndBucketAndId({
      id: query.uploadId,
      key: params.key,
      bucket: params.bucket,
    });

    if (!multipartUpload || multipartUpload.status !== 'IN_PROGRESS') {
      this.errorsService.sendError(response, {
        code: 'NoSuchUpload',
        requestId: request.id.toString(),
        resource: `${params.bucket}/${params.key}`,
      });

      return;
    }

    const locationInStorage = '';

    const parts = await this.multipartUploadPartRepo.findByMultipartUploadIdSortByPartNumber(query.uploadId);

    this.logger.timeEnd('find multipart from db');
    const overallSizeOfObject = this.sumPartsSizes(parts);

    const etag = this.generateETagForMultipartObject(parts);

    const uploadTimestamp = new Date();

    const overallHashOfObject = crypto.createHash('sha256').update(etag).digest('hex');
    const file_hash = crypto
      .createHash('sha256')
      .update(
        user.user.publicKey + ' ' + overallSizeOfObject + ' ' + overallHashOfObject + ' ' + uploadTimestamp.valueOf(),
      )
      .digest('hex');

    this.logger.time('finish multipart upload in gateway');
    await this.gatewaysV3Service.finishMultipartUpload({
      gatewayAddress: multipartUpload.gatewayAddress,
      idempotency_id: multipartUpload.gatewayMultipartUploadId,
      file_hash: file_hash,
    });
    this.logger.timeEnd('finish multipart upload in gateway');

    this.logger.time('set file hash');
    await this.gatewaysV3Service.setFileHash({
      idempotency_id: multipartUpload.gatewayMultipartUploadId,
      file_hash: file_hash,
      gatewayAddress: multipartUpload.gatewayAddress,
    });
    this.logger.timeEnd('set file hash');

    const blockchainTxParams = {
      bucket_name_hash: crypto.createHash('sha256').update(params.bucket).digest('hex'),
      file_contents_hash: overallHashOfObject,
      file_name_hash: file_hash,
      file_size_bytes: overallSizeOfObject,
      gateway_eth_address: multipartUpload.gatewayEthAddress,
    };

    {
      this.logger.time('delete existing object');
      const existingObject = await this.objectRepo.findByKeyAndBucket(params.key, params.bucket);

      if (existingObject) {
        await this.deleteObjectService.deleteObjectFromGatewayAndBlockchainAndDB(existingObject, user);
      }
      this.logger.timeEnd('delete existing object');
    }

    const { filename, type } = this.commonUtilsService.getNameAndTypeFromKey(params.key);

    this.logger.time('save object to db');
    const object = await this.objectRepo.save({
      id: uuidv4(),
      bucket: params.bucket,
      contentMd5: null,
      size: overallSizeOfObject.toString(),
      contentType: multipartUpload.contentType || 'application/octet-stream',
      modifiedAt: new Date(),
      key: params.key,
      etag: etag,
      gatewayType: multipartUpload.gatewayType,
      gatewayHash: multipartUpload.gatewayMultipartUploadId,
      gatewayAddress: multipartUpload.gatewayAddress,
      fileContentsSha256: blockchainTxParams.file_contents_hash,
      fileNameSha256: blockchainTxParams.file_name_hash,
      gatewayEthAddress: blockchainTxParams.gateway_eth_address,
      storageForceChosen: multipartUpload.storageForceChosen,
      acl: multipartUpload.acl || 'private',
      headers: multipartUpload.headers,
      storageClass: multipartUpload.storageClass,
      filename,
      type,
    });

    if (multipartUpload.objectMetadata) {
      const objectMetadatas = Object.entries(multipartUpload.objectMetadata)
        .concat([
          ['location', locationInStorage],
          ['file-hash', object.fileNameSha256],
        ])
        .map(
          ([key, value]) =>
            new ObjectMetadataEntity({
              createdAt: new Date(),
              objectId: object.id,
              key,
              value,
            }),
        );

      await this.objectMetadataRepo.save(objectMetadatas);
    }

    await this.blockchainWriterService.upload({
      user_eth_address: user.user.publicKey,
      file_size_bytes: blockchainTxParams.file_size_bytes.toString(),
      gateway_eth_address: blockchainTxParams.gateway_eth_address,
      file_contents_hash: '0x' + blockchainTxParams.file_contents_hash,
      file_name_hash: '0x' + blockchainTxParams.file_name_hash,
      file_storage_class: storageClassesToCode[object.storageClass].toString(),
      is_forced: multipartUpload.storageForceChosen ? '1' : '0',
    });

    multipartUpload.status = 'COMPLETED';
    await this.multipartUploadRepo.save(multipartUpload);

    this.logger.timeEnd('save object to db');

    this.logger.time('update stats');
    await this.statisticsService.updateBucketStorageStatistics(params.bucket);

    this.logger.timeEnd('update stats');
    const result = xml(
      [
        {
          CompleteMultipartUploadResult: [
            { Location: this.commonUtilsService.generateUrlForObject(params) },
            { Bucket: params.bucket },
            { Key: params.key },
            { ETag: object.etag },
          ],
        },
      ],
      { declaration: true },
    );

    response.status(200).send(result);
  }

  public async listMultipartUploads(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const bucket = await this.bucketRepo.findByNameOrFail(params.bucket);

    const query = {
      delimiter: request.query['delimiter'] as string,
      'encoding-type': request.query['encoding-type'],
      'key-marker': request.query['key-marker'] as string,
      'max-uploads': parseInt(request.query['max-uploads'] as string) || 1000,
      prefix: request.query['prefix'] as string,
      'upload-id-marker': request.query['upload-id-marker'] as string,
    };

    const queryBuilder = this.multipartUploadRepo
      .createQueryBuilder('multipart_uploads')
      .where(`multipart_uploads.status = 'IN_PROGRESS'`)
      .where('multipart_uploads.bucket = :bucket', { bucket: params.bucket });

    if (query['key-marker']) {
      if (query['upload-id-marker']) {
        queryBuilder
          .andWhere('multipart_uploads.key >= :keyMarker', { keyMarker: query['key-marker'] })
          .andWhere('multipart_uploads.id > :uploadIdMarker', { uploadIdMarker: query['upload-id-marker'] });
      } else {
        queryBuilder.andWhere('multipart_uploads.key > :keyMarker', { keyMarker: query['key-marker'] });
      }
    }

    if (query.prefix) {
      queryBuilder.andWhere('multipart_uploads.key LIKE :pattern', {
        pattern: `${this.objectRepo.escapeForPostgresLikeOperation(query.prefix)}%`,
      });
    }

    let isTruncated = false;
    let contents: MultipartUploadEntity[] = [];
    const commonPrefixes: string[] = [];
    let nextKeyMarker: string | null = null;
    let nextUploadIdMarker: string | null = null;

    if (query.delimiter) {
      const keysAndIds: { key: string; id: string }[] = await queryBuilder
        .select('multipart_uploads.key, multipart_uploads.id')
        .orderBy('multipart_uploads.key', 'ASC')
        .addOrderBy('multipart_uploads.id', 'ASC')
        .getRawMany();

      const keysWithInfo: { key: string; id?: string; type: 'content' | 'common-prefix' }[] = [];

      const alreadyAddedCommonPrefixesWithLastKey = new Map<string, string>();
      if (query.prefix) {
        keysAndIds.forEach((keyAndId) => {
          if (keyAndId.key.includes(query.delimiter, query.prefix.length)) {
            const commonPrefix = keyAndId.key.substring(
              0,
              keyAndId.key.indexOf(query.delimiter, query.prefix.length) + 1,
            );

            if (!alreadyAddedCommonPrefixesWithLastKey.has(commonPrefix)) {
              keysWithInfo.push({ key: commonPrefix, type: 'common-prefix' });
            }

            alreadyAddedCommonPrefixesWithLastKey.set(commonPrefix, keyAndId.key);
          } else {
            keysWithInfo.push({ key: keyAndId.key, id: keyAndId.id, type: 'content' });
          }
        });
      } else {
        keysAndIds.forEach((keyAndId) => {
          if (keyAndId.key.includes(query.delimiter)) {
            const commonPrefix = keyAndId.key.substring(0, keyAndId.key.indexOf(query.delimiter) + 1);

            if (!alreadyAddedCommonPrefixesWithLastKey.has(commonPrefix)) {
              keysWithInfo.push({ key: commonPrefix, type: 'common-prefix' });
            }

            alreadyAddedCommonPrefixesWithLastKey.set(commonPrefix, keyAndId.key);
          } else {
            keysWithInfo.push({ key: keyAndId.key, id: keyAndId.id, type: 'content' });
          }
        });
      }

      let keysInRangesOfMaxKeysParameter = keysWithInfo;

      if (keysWithInfo.length > query['max-uploads']) {
        isTruncated = true;
        keysInRangesOfMaxKeysParameter = _.take(keysInRangesOfMaxKeysParameter, query['max-uploads']);
        const lastKeyAndId = _.last(keysInRangesOfMaxKeysParameter);
        if (lastKeyAndId) {
          if (lastKeyAndId.type === 'common-prefix') {
            nextKeyMarker = alreadyAddedCommonPrefixesWithLastKey.get(lastKeyAndId.key);
          } else {
            nextKeyMarker = lastKeyAndId.key;
            nextUploadIdMarker = lastKeyAndId.id;
          }
        }
      }

      const contentKeysAndIds: { key: string; id: string }[] = [];

      keysInRangesOfMaxKeysParameter.forEach((key) => {
        if (key.type === 'content') {
          contentKeysAndIds.push({ key: key.key, id: key.id });
        } else {
          commonPrefixes.push(key.key);
        }
      });

      contents = await this.multipartUploadRepo.getMultipartUploadsByKeysAndIdsAndBucketOrderedByKeys(
        params.bucket,
        contentKeysAndIds,
      );
    } else {
      queryBuilder.orderBy('key', 'ASC').orderBy('id', 'ASC');

      queryBuilder.take(query['max-uploads'] + 1);
      contents = await queryBuilder.getMany();

      if (contents.length > query['max-uploads']) {
        contents.pop();
        isTruncated = true;
        nextKeyMarker = _.last(contents).key;
        nextUploadIdMarker = _.last(contents).id;
      }
    }

    const xmlResult = xml(
      [
        {
          ListMultipartUploadsResult: [
            { _attr: { xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/' } },

            { Bucket: params.bucket },

            query['key-marker'] ? { KeyMarker: query['key-marker'] } : {},
            query['upload-id-marker'] ? { UploadIdMarker: query['upload-id-marker'] } : {},
            nextKeyMarker ? { NextKeyMarker: nextKeyMarker } : {},

            query.prefix ? { Prefix: query.prefix } : {},

            query.delimiter ? { Delimiter: query.delimiter } : {},

            nextUploadIdMarker ? { NextUploadIdMarker: query['key-marker'] } : {},
            query['max-uploads'] ? { MaxUploads: query['max-uploads'] } : {},

            { IsTruncated: isTruncated },

            ...contents.map((multipartUpload) => ({
              Upload: [
                { Initiated: multipartUpload.createdAt.toISOString() },
                { Initiator: [{ DisplayName: bucket.ownerPublicKey }, { ID: bucket.ownerPublicKey }] },
                {
                  Key: query['encoding-type'] === 'url' ? encodeURIComponent(multipartUpload.key) : multipartUpload.key,
                },
                { Owner: [{ DisplayName: bucket.ownerPublicKey }, { ID: bucket.ownerPublicKey }] },
                { StorageClass: 'STANDARD' },
                { UploadId: multipartUpload.id },
              ],
            })),

            ...(commonPrefixes || []).map((commonPrefix) => ({
              CommonPrefixes: [
                {
                  Prefix: commonPrefix,
                },
              ],
            })),

            query['encoding-type'] ? { EncodingType: 'url' } : {},
          ],
        },
      ],
      {
        declaration: true,
      },
    );

    response
      .status(200)
      .header('content-type', 'application/xml')
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send(xmlResult);
  }

  public async abortMultipartUpload(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const multipartUpload = await this.multipartUploadRepo.findByKeyAndBucketAndId({
      id: request.query.uploadId as string,
      bucket: params.bucket,
      key: params.key,
    });

    if (!multipartUpload) {
      this.errorsService.sendError(response, {
        code: 'NoSuchUpload',
        requestId: request.id.toString(),
        resource: `${params.bucket}/${params.key}`,
      });

      return;
    }

    const gatewayInfo = await this.gatewayChooserAiService.getGatewayByEthereumAddress(
      multipartUpload.gatewayEthAddress,
    );

    await this.gatewaysV3Service
      .abortMultipartUpload({
        gatewayAddress: gatewayInfo.url,
        idempotency_id: multipartUpload.gatewayMultipartUploadId,
      })
      .catch((err) => {
        this.logger.error(
          'abortMultipartUpload: error from gateway: gatewayAddress: %s, idempotency_id: %s, error: %o',
          gatewayInfo.url,
          multipartUpload.gatewayMultipartUploadId,
          err,
        );
      });

    multipartUpload.status = 'ABORTED';

    await this.multipartUploadRepo.save(multipartUpload);

    response
      .status(204)
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send();
  }

  private generateETagForMultipartObject(parts: MultipartUploadPartEntity[]): string {
    const partsHash = crypto.createHash('md5');

    parts.forEach((part) => {
      partsHash.update(Buffer.from(part.md5Sum, 'hex'));
    });

    return `"${partsHash.digest('hex')}-${parts.length}"`;
  }

  private sumPartsSizes(parts: MultipartUploadPartEntity[]): bigint {
    let sum = 0n;

    parts.forEach((part) => {
      sum += BigInt(part.size);
    });

    return sum;
  }
}
