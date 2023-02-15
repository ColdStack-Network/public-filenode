import stream from 'stream';
import { PutObjectRequestHeadersDto } from './dto/put-object-request-headers.dto';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { ObjectRepository } from './repositories/object.repository';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import digestStream from 'digest-stream';
import { GetObjectRequestHeadersDto } from './dto/get-object-request-headers.dto';
import { GetObjectRequestQueryDto } from './dto/get-object-request-query.dto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import crypto from 'crypto';
import { ObjectMetadataRepository } from './repositories/object-metadata.repository';
import { ObjectMetadataEntity } from './entities/object-metadata.entity';
import { BlockchainWriterService } from '../blockchain-writer/blockchain-writer.service';
import { CommonUtilsService } from './common-utils.service';
import { GatewayChooserAiService } from '../gateway-chooser-ai/gateway-chooser-ai.service';
import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import { GatewaysV3Service } from '../gateways/gateways-v3.service';
import { BucketRepository } from './repositories/bucket.repository';
import { ErrorsService } from '../errors/errors.service';
import { StatisticsService } from './statistics.service';
import _ from 'lodash';
import { AWSV4ChunkedPayloadTransform } from './aws-v4-chunked-payload-transform/aws-v4-chunked-payload-transform';
import { AuthService } from '../auth/auth.service';
import { Like } from 'typeorm';
import { storageClassesToCode } from './constants/storage-classes-to-code';
import { DeleteObjectService } from '../object-deletions/delete-object.service';
import { GatewayFromBlockchain } from '../gateway-chooser-ai/dto/gateway-from-blockchain.dto';

@Injectable()
export class PutAndGetApiService {
  readonly RESPONSE_MAX_LISTENERS_COUNT = 100;

  constructor(
    private readonly objectRepo: ObjectRepository,
    private readonly objectMetadataRepo: ObjectMetadataRepository,
    private readonly bucketRepo: BucketRepository,
    private readonly blockchainWriterService: BlockchainWriterService,
    @Inject(forwardRef(() => StatisticsService))
    private readonly statisticsService: StatisticsService,
    @Inject(forwardRef(() => DeleteObjectService))
    private readonly deleteObjectSerivce: DeleteObjectService,
    @InjectPinoLogger(PutAndGetApiService.name)
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => GatewaysV3Service))
    private readonly gatewaysV3Service: GatewaysV3Service,
    @Inject(forwardRef(() => CommonUtilsService))
    private readonly commonUtilsService: CommonUtilsService,
    @Inject(forwardRef(() => GatewayChooserAiService))
    private readonly gatewayChooserAiService: GatewayChooserAiService,
    private readonly errorsService: ErrorsService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  public async putObject(
    request: Request,
    response: Response,
    headers: PutObjectRequestHeadersDto,
    params: { bucket: string; key: string },
    user: UserFromAuthnode,
  ): Promise<void> {
    const { storageClass, errored: storageClassValidationErrored } = this.commonUtilsService.validateStorageClass({
      response,
      request,
      params,
    });

    if (storageClassValidationErrored) {
      return;
    }

    const metadatasDict = this.commonUtilsService.parseAmzMetadataHeaders(request.headers);

    this.logger.time('choose gateway');
    const { gateways, forceChoosenGatewayType } = await this.gatewayChooserAiService.chooseGatewayFromBlockchain({
      isMultipartUpload: false,
      contentLength: +request.headers['content-length'],
      forceChosenGatewayType: metadatasDict.storage,
      userKey: user.user.publicKey,
    });

    this.logger.timeEnd('choose gateway');

    const {
      nodeAddress: gatewayNodeAddress,
      url: gatewayAddress,
      storageText: gatewayType,
      storage: gatewayTypeAsNumber,
    } = gateways[0];

    {
      if (!request.headers['content-length']) {
        this.errorsService.sendError(response, {
          code: 'InvalidRequest',
          message: 'Missing Content-Length header.',
          requestId: request.id.toString(),
        });

        return;
      }

      const contentLength = +request.headers['content-length'];

      this.logger.time('check balance');
      const hasEnoughBalance = await this.commonUtilsService.hasAtLeastPredictedPriceOrCantConnectToBlockchain({
        gatewayType: gatewayTypeAsNumber,
        size: contentLength,
        storageClass: storageClassesToCode[storageClass],
        publicKey: user.user.publicKey,
      });
      this.logger.timeEnd('check balance');

      if (!hasEnoughBalance) {
        this.errorsService.sendError(response, {
          code: 'NotEnoughBalance',
          requestId: request.id.toString(),
          resource: `${params.bucket}/${params.key}`,
        });

        return;
      }
    }

    try {
      let contentSize: number;
      let contentMd5: string;
      let fileContentSha256Hash: string;

      const passthrough = new stream.PassThrough({});

      let requestStream: stream.Readable = request;

      if (request.headers['content-encoding'] === 'aws-chunked') {
        const chunkedPayloadTransform = new AWSV4ChunkedPayloadTransform(
          {
            accessKeyId: user.accessKey.id,
            scope: {
              credentialsDate: user.authDetails.credentialsDate,
              credentialsRegion: user.authDetails.credentialsRegion,
              dateTime: user.authDetails.dateTime,
            },
            signatureFromRequest: user.authDetails.signatureFromRequest,
          },
          this.authService,
          this.logger,
          (err) => {
            this.logger.error('putObject: error from V4Transform: ' + err);
            response.status(500).send();
          },
        );

        requestStream = requestStream.pipe(chunkedPayloadTransform);

        requestStream.on('error', (err) => {
          this.logger.error('Error in requestStream: ' + err);
        });
      }

      requestStream
        .pipe(
          digestStream('sha256', 'hex', (resultDigest) => {
            fileContentSha256Hash = resultDigest;
          }),
        )
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
      stream.finished(request, async (err) => {
        await this.statisticsService
          .reportBandwidthUsage({
            bucketName: params.bucket,
            size: bandwidthUsed.toString(),
            type: 'upload',
            info: {
              bucket: params.bucket,
              key: params.key,
              err: err ? `${err}` : undefined,
              gatewayAddress: gatewayAddress,
            },
          })
          .catch((err) => {
            this.logger.error('Error reporting bandwidth usage: %s', err);
          });
      });

      const gatewayHash = uuidv4();
      const locationInStorage = '';

      this.logger.time('upload object to gateway');
      try {
        await this.gatewaysV3Service.upload({
          gatewayAddress,
          readableStream: passthrough,
          contentLength: +request.headers['content-length'],
          idempotency_id: gatewayHash,
          storageForceChosen: !!forceChoosenGatewayType,
          contentMd5: typeof request.headers['content-md5'] === 'string' ? request.headers['content-md5'] : undefined,
        });
      } catch (err) {
        if (err?.response?.data?.code === 'BadDigest') {
          this.errorsService.sendError(response, {
            code: 'BadDigest',
            requestId: request.id.toString(),
          });
          return;
        } else {
          throw err;
        }
      }

      this.logger.timeEnd('upload object to gateway');

      this.logger.info('putObject: hash from gateway: ' + gatewayHash);

      const uploadTimestamp = new Date();
      const file_hash = crypto
        .createHash('sha256')
        .update(user.user.publicKey + ' ' + contentSize + ' ' + fileContentSha256Hash + ' ' + uploadTimestamp.valueOf())
        .digest('hex');

      const blockchainTxParams = {
        bucket_name_hash: crypto.createHash('sha256').update(params.bucket).digest('hex'),
        file_contents_hash: fileContentSha256Hash,
        file_name_hash: file_hash,
        file_size_bytes: contentSize,
        gateway_eth_address: gatewayNodeAddress,
      };

      this.logger.time('set file hash');
      await this.gatewaysV3Service.setFileHash({
        idempotency_id: gatewayHash,
        file_hash: file_hash,
        gatewayAddress: gatewayAddress,
      });
      this.logger.timeEnd('set file hash');

      {
        this.logger.time('delete existing object');
        const existingObject = await this.objectRepo.findByKeyAndBucket(params.key, params.bucket);

        if (existingObject) {
          await this.deleteObjectSerivce.deleteObjectFromGatewayAndBlockchainAndDB(existingObject, user);
        }
        this.logger.timeEnd('delete existing object');
      }

      const acl =
        typeof request.headers['x-amz-acl'] === 'string' &&
        request.headers['x-amz-acl'].toLocaleLowerCase() === 'public-read'
          ? 'public-read'
          : 'private';

      const headersForDb = {
        'Cache-Control': this.commonUtilsService.getOneHeader(request, 'cache-control'),
        'Content-Disposition': this.commonUtilsService.getOneHeader(request, 'content-disposition'),
        'Content-Encoding': this.commonUtilsService.getOneHeader(request, 'content-encoding'),
        'Content-Language': this.commonUtilsService.getOneHeader(request, 'content-language'),
        'Content-Type': this.commonUtilsService.getOneHeader(request, 'content-type'),
        Expires: this.commonUtilsService.getOneHeader(request, 'expires'),
      };

      this.logger.time('save object to db');
      const { filename, type } = this.commonUtilsService.getNameAndTypeFromKey(params.key);

      const object = await this.objectRepo.save({
        id: uuidv4(),
        key: params.key,
        bucket: params.bucket,
        contentMd5,
        etag: `"${contentMd5}"`,
        contentType: headers['content-type'],
        modifiedAt: uploadTimestamp,
        size: contentSize.toString(),
        storageForceChosen: !!forceChoosenGatewayType,
        gatewayType: gatewayType,
        gatewayHash,
        bucketNameSha256: blockchainTxParams.bucket_name_hash,
        fileContentsSha256: blockchainTxParams.file_contents_hash,
        fileNameSha256: blockchainTxParams.file_name_hash,
        gatewayEthAddress: blockchainTxParams.gateway_eth_address,
        locationFromGateway: null,
        storageClass,
        gatewayAddress,
        acl,
        headers: headersForDb,
        filename,
        type,
      });

      await this.objectMetadataRepo.deleteAllMetadatasOfObject(object.id);

      const metadatas = Object.entries(metadatasDict)
        .concat([
          ['location', locationInStorage],
          ['file-hash', object.fileNameSha256],
        ])
        .map(
          ([metadataKey, metadataValue]) =>
            new ObjectMetadataEntity({
              createdAt: new Date(),
              objectId: object.id,
              key: metadataKey,
              value: metadataValue,
            }),
        );

      await this.objectMetadataRepo.save(metadatas);

      this.logger.timeEnd('save object to db');

      const blockchainParams = {
        user_eth_address: user.user.publicKey,
        file_size_bytes: blockchainTxParams.file_size_bytes.toString(),
        gateway_eth_address: blockchainTxParams.gateway_eth_address,
        file_contents_hash: '0x' + blockchainTxParams.file_contents_hash,
        file_name_hash: '0x' + blockchainTxParams.file_name_hash,
        file_storage_class: storageClassesToCode[object.storageClass].toString(),
        is_forced: !!forceChoosenGatewayType ? '1' : '0',
      };

      this.logger.info(
        'blockchainParams: ' + params.bucket + '/' + params.key + ': ' + JSON.stringify(blockchainParams),
      );

      await this.blockchainWriterService.upload(blockchainParams);
      this.logger.time('update stats');
      await this.statisticsService.updateBucketStorageStatistics(params.bucket);
      this.logger.timeEnd('update stats');

      response.status(200).header('ETag', `"${contentMd5}"`).send();
    } catch (err) {
      console.log('Second catch: ', err);
      this.logger.error(err);
      throw err;
    }
  }

  public async getObject(
    request: Request,
    response: Response,
    headers: GetObjectRequestHeadersDto,
    query: GetObjectRequestQueryDto,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const object = await this.objectRepo.findByKeyAndBucketAndJoinMetadatas(params.key, params.bucket);

    if (!object || object.acl !== 'public-read') {
      const { error } = await this.commonUtilsService.authenticateWithAuthnode(request, response);

      if (error) {
        return;
      }
    }

    if (!object) {
      response.status(404).send();
      return;
    }

    const bucket = await this.bucketRepo.findByNameOrFail(object.bucket);

    let gatewayInfo: GatewayFromBlockchain;

    try {
      gatewayInfo = await this.gatewayChooserAiService.getGatewayByEthereumAddress(object.gatewayEthAddress);
    } catch (err) {
      this.errorsService.sendError(response, {
        code: 'InternalError',
        resource: `${params.bucket}/${params.key}`,
        requestId: request.id.toString(),
      });
      throw err;
    }

    if (request.headers.range && !request.headers.range.startsWith('bytes=0-')) {
      response.status(200).send();
      return;
    }

    response.header('Accept-Ranges', 'none');
    response.header('Content-Range', 'bytes 0-' + object.size + '/' + object.size);

    // handle conditions
    // see https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html - Additional Considerations about Request Headers
    if (headers['if-match'] && headers['if-match'] !== object.etag) {
      response.status(412).send();
      return;
    } else if (headers['if-none-match'] && headers['if-none-match'] === object.etag) {
      response.status(304).send();
      return;
    } else if (headers['if-modified-since'] && headers['if-modified-since'].valueOf() >= object.modifiedAt.valueOf()) {
      response.status(304).send();
      return;
    } else if (
      headers['if-unmodified-since'] &&
      headers['if-unmodified-since'].valueOf() < object.modifiedAt.valueOf()
    ) {
      response.status(412).send();
      return;
    }

    // Setting headers
    if (query['response-cache-control']) {
      response.header('Cache-Control', query['response-cache-control']);
    } else if (object.headers?.['Cache-Control']) {
      response.header('Cache-Control', object.headers['Cache-Control']);
    }
    if (query['response-content-disposition']) {
      response.header('content-disposition', query['response-content-disposition']);
    } else if (object.headers?.['Content-Disposition']) {
      response.header('Content-Disposition', object.headers['Content-Disposition']);
    }
    if (query['response-content-encoding']) {
      response.header('content-encoding', query['response-content-encoding']);
    } else if (object.headers?.['Content-Encoding']) {
      response.header('Content-Encoding', object.headers['Content-Encoding']);
    }
    if (query['response-content-language']) {
      response.header('content-language', query['response-content-language']);
    } else if (object.headers?.['Content-Language']) {
      response.header('Content-Language', object.headers['Content-Language']);
    }
    if (query['response-expires']) {
      response.header('expires', query['response-expires']);
    } else if (object.headers?.['Expires']) {
      response.header('Expires', object.headers['Expires']);
    }
    if (query['response-content-type'] || object.contentType) {
      response.header('Content-Type', query['response-content-type'] || object.contentType);
    } else if (object.headers?.['Content-Type']) {
      response.header('Content-Type', object.headers['Content-Type']);
    }

    response.header('ETag', object.etag);
    response.header('Content-Length', `${object.size}`);
    response.header('Last-Modified', object.modifiedAt.toUTCString());
    response.header('x-amz-storage-class', object.storageClass);

    const metadatasToDisplay = object.storageForceChosen
      ? object.metadatas
      : object.metadatas.filter((metadata) => metadata.key !== 'storage' && metadata.key !== 'location');

    metadatasToDisplay.forEach((metadata) => {
      response.header('x-amz-meta-' + metadata.key.toLowerCase(), metadata.value);
    });

    const objectStream = (
      await this.gatewaysV3Service
        .downloadFile({
          file_hash: object.fileNameSha256,
          gatewayAddress: gatewayInfo.url,
        })
        .catch((err) => {
          this.logger.error(
            `getObject: error when trying to download file with hash ${object.fileContentsSha256} from ${gatewayInfo.url}: ${err}`,
          );

          throw err;
        })
    ).data as stream.Readable;

    let bandwidthUsed = 0;
    let lastLoggedBandwidthUsed = 0;

    response.setMaxListeners(this.RESPONSE_MAX_LISTENERS_COUNT);

    const write = (): void => {
      if (!objectStream.isPaused()) {
        objectStream.pause();
      }

      const content = objectStream.read(1200000);

      if (content && !response.write(content)) {
        bandwidthUsed += Buffer.byteLength(content);
        if (bandwidthUsed - lastLoggedBandwidthUsed > 10000000) {
          lastLoggedBandwidthUsed = bandwidthUsed;

          this.logger.info(
            `getObject: received chunk, current bandwidth: ${bandwidthUsed}, bytesWritten: ${response.socket.bytesWritten}, bytesRead: ${response.socket.bytesRead}`,
          );
        }

        response.removeListener('readable', write);
        response.once('drain', () => {
          response.on('readable', write);
          write();
        });
      }
    };
    objectStream.on('readable', write);
    stream.finished(objectStream, async (err) => {
      this.logger.info('getObject: objectStream finished, bandwidth: ' + bandwidthUsed);

      await this.statisticsService
        .reportBandwidthUsage({
          bucketName: params.bucket,
          size: bandwidthUsed.toString(),
          type: 'download',
          info: {
            bucket: params.bucket,
            key: params.key,
            err: err ? `${err}` : undefined,
            gatewayAddress: object.gatewayAddress,
          },
        })
        .catch((err) => {
          this.logger.error('Error reporting bandwidth usage: %s', err);
        });

      this.blockchainWriterService
        .download({
          user_eth_address: bucket.ownerPublicKey,
          file_contents_hash: '0x' + object.fileContentsSha256,
          file_name_hash: '0x' + object.fileNameSha256,
          file_size_bytes: bandwidthUsed.toString(),
          gateway_eth_address: object.gatewayEthAddress,
        })
        .catch((err) => {
          this.logger.error(
            `Error on blockchainWriterService.download: file_name_hash: %s , err: %s`,
            object.fileNameSha256,
            err,
          );
        });
    });

    // objectStream.pipe(response);

    stream.finished(request, () => {
      objectStream.destroy();
    });

    return new Promise((resolve, reject) => {
      objectStream.on('end', () => resolve(undefined));
      objectStream.on('error', (err) => reject(err));
      objectStream.on('aborted', () => reject(new Error('Request aborted')));
    });
  }

  public async editObjectKey(
    request: Request,
    response: Response,
    user: UserFromAuthnode,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const destination = decodeURIComponent(
      typeof request.headers['destination'] === 'string'
        ? request.headers['destination']
        : request.headers['destination'][0] || '',
    );

    if (request.headers['x-coldstack-prefix'] === 'true') {
      if (
        await this.objectRepo.findOne({
          where: {
            bucket: params.bucket,
            key: Like(`${this.objectRepo.escapeForPostgresLikeOperation(destination)}%`),
          },
        })
      ) {
        this.errorsService.sendError(response, {
          code: 'PrefixAlreadyUsed',
          json: request.query.format === 'json',
          requestId: request.id.toString(),
        });

        return;
      }

      const objectKeys = await this.objectRepo
        .createQueryBuilder('objects')
        .select(['key'])
        .where('objects.key LIKE :pattern', {
          pattern: `${this.objectRepo.escapeForPostgresLikeOperation(params.key)}%`,
        })
        .andWhere('bucket = :bucket', { bucket: params.bucket })
        .getRawMany<{ key: string }>();

      if (!objectKeys.length) {
        const xmlResult =
          `<?xml version="1.0" encoding="UTF-8"?><MoveObjectResult><SourcePrefix>` +
          this.commonUtilsService.escapeXML(params.key) +
          `</SourcePrefix><DestinationPrefix>` +
          this.commonUtilsService.escapeXML(destination) +
          `</DestinationPrefix><MoveCount>0</MoveCount></MoveObjectResult>`;

        response.status(200).header('content-type', 'application/xml').send(xmlResult);

        return;
      }

      const sqlParams = [];
      const destinationKeys: string[] = [];

      let sqlQuery = `UPDATE objects SET key = new_keys.new_key, filename = new_keys.filename, type = new_keys.type FROM (VALUES `;

      for (let i = 0; i < objectKeys.length; i++) {
        sqlQuery += `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, ($${i * 4 + 4})::objects_type_enum)`;

        if (i !== objectKeys.length - 1) {
          sqlQuery += ',';
        }

        const newKeyOfObject = objectKeys[i].key.replace(params.key, destination);
        const { filename, type } = this.commonUtilsService.getNameAndTypeFromKey(newKeyOfObject);

        sqlParams.push(objectKeys[i].key, newKeyOfObject, filename, type);
        destinationKeys.push(newKeyOfObject);
      }

      sqlQuery += `) AS new_keys (old_key, new_key, filename, type)
      WHERE objects.key = new_keys.old_key AND objects.bucket = $${objectKeys.length * 4 + 1};`;

      sqlParams.push(params.bucket);

      await this.objectRepo.query(sqlQuery, sqlParams);

      let xmlResult =
        `<?xml version="1.0" encoding="UTF-8"?><MoveObjectResult><SourcePrefix>` +
        this.commonUtilsService.escapeXML(params.key) +
        `</SourcePrefix><DestinationPrefix>` +
        this.commonUtilsService.escapeXML(destination) +
        `</DestinationPrefix>`;

      objectKeys.forEach((objectKey, i) => {
        xmlResult +=
          `<MoveObject><SourceKey>` +
          this.commonUtilsService.escapeXML(objectKey.key) +
          `</SourceKey><DestinationKey>` +
          this.commonUtilsService.escapeXML(destinationKeys[i]) +
          `</DestinationKey></MoveObject>`;
      });

      xmlResult += `<MoveCount>${destinationKeys.length}</MoveCount></MoveObjectResult>`;

      response.status(200).header('content-type', 'application/xml').send(xmlResult);

      return;
    }

    const object = await this.objectRepo.findByKeyAndBucket(params.key, params.bucket);

    if (!object) {
      this.errorsService.sendError(response, {
        code: 'NoSuchKey',
        resource: `${params.bucket}/${params.key}`,
        json: request.query.format === 'json',
      });

      return;
    }

    if (!request.headers['destination'] || typeof request.headers['destination'] !== 'string') {
      this.errorsService.sendError(response, {
        code: 'InvalidRequest',
        message: 'Specify new key for the object in "Destination" header.',
        json: request.query.format === 'json',
      });
      return;
    }

    if (await this.objectRepo.findByKeyAndBucket(destination, object.bucket)) {
      this.errorsService.sendError(response, {
        code: 'KeyAlreadyExists',
        message: 'Object with specified key already exists.',
        json: request.query.format === 'json',
      });
      return;
    }

    const { filename, type } = await this.commonUtilsService.getNameAndTypeFromKey(destination);

    object.key = destination;
    object.filename = filename;
    object.type = type;

    await this.objectRepo.save(object);

    response.status(204).send();
  }

  public async copyObject(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const copySource = decodeURIComponent(request.headers['x-amz-copy-source'] as string);

    if (copySource !== `/${params.bucket}/${params.key}`) {
      this.errorsService.sendError(response, {
        code: 'NotImplemented',
        message: 'CopyObject operation is not supported at this moment.',
        resource: `${params.bucket}/${params.key}`,
      });

      return;
    }

    const object = await this.objectRepo.findByKeyAndBucket(params.key, params.bucket);

    if (!object) {
      this.errorsService.sendError(response, {
        code: 'NoSuchKey',
        resource: `${params.bucket}/${params.key}`,
        requestId: request.id.toString(),
        json: request.query.format === 'json',
      });
      return;
    }

    const metadatas = this.commonUtilsService.parseAmzMetadataHeaders(request.headers);

    const clearedMetadatas = _.omit(metadatas, 'storage', 'location', 'file-hash');

    await this.objectMetadataRepo.deleteAllMetadatasOfObject(object.id, ['storage', 'location', 'file-hash']);
    await this.objectMetadataRepo.updateMetadatasOfObject(object.id, clearedMetadatas);

    object.modifiedAt = new Date();
    await this.objectRepo.save(object);

    const result =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<CopyObjectResult><ETag>` +
      this.commonUtilsService.escapeXML(object.etag) +
      `</ETag><LastModified>` +
      this.commonUtilsService.escapeXML(object.modifiedAt.toISOString()) +
      `</LastModified></CopyObjectResult>`;

    response.status(200).header('content-type', 'application/xml').send(result);
  }
}
