import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import _ from 'lodash';
import { ObjectRepository } from './repositories/object.repository';
import { GetObjectRequestHeadersDto } from './dto/get-object-request-headers.dto';
import { GetObjectRequestQueryDto } from './dto/get-object-request-query.dto';
import xml from 'xml';
import { ListObjectsV2RequestQueryDto } from './dto/list-objects-v2-request-query.dto';
import { Base64 } from 'js-base64';
import { ObjectEntity } from './entities/object.entity';
import { SelectQueryBuilder } from 'typeorm';
import { BucketRepository } from './repositories/bucket.repository';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CommonUtilsService } from './common-utils.service';
import prettyBytes from 'pretty-bytes';
import { ErrorsService } from '../errors/errors.service';
import { ListFilesResponseFormatter } from './response-formatters/list-and-head-api/ListFiles';
import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import { BucketEntity } from './entities/bucket.entity';
import { storageClassesToReadable } from './constants/storage-class-to-readable';

@Injectable()
export class ListAndHeadApiService {
  constructor(
    private readonly objectRepo: ObjectRepository,
    private readonly bucketRepo: BucketRepository,
    @InjectPinoLogger(ListAndHeadApiService.name)
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => CommonUtilsService))
    private readonly commonUtils: CommonUtilsService,
    @Inject(forwardRef(() => ErrorsService))
    private readonly errorsService: ErrorsService,
    private readonly listFilesResponseFormatter: ListFilesResponseFormatter,
  ) {}

  public async listObjectsV2(
    query: ListObjectsV2RequestQueryDto,
    params: { bucket: string; key: string },
  ): Promise<string> {
    const maxKeys = query['max-keys'] || 1000;
    const continuationTokenKey = query['continuation-token'] ? Base64.decode(query['continuation-token']) : null;

    const queryBuilder = this.objectRepo
      .createQueryBuilder('objects')
      .where('objects.bucket = :bucket', { bucket: params.bucket });

    if (continuationTokenKey) {
      queryBuilder.andWhere('objects.key > :key', { key: continuationTokenKey });
    }
    if (query['start-after']) {
      queryBuilder.andWhere('objects.key > :startAfter', { startAfter: query['start-after'] });
    }
    if (query.prefix) {
      queryBuilder.andWhere('objects.key LIKE :pattern', {
        pattern: `${this.objectRepo.escapeForPostgresLikeOperation(query.prefix)}%`,
      });
    }

    let isTruncated = false;
    let contents: ObjectEntity[] = [];
    const commonPrefixes: string[] = [];
    let nextContinuationToken: string = null;

    if (query.delimiter) {
      const keys: string[] = (await queryBuilder.select('objects.key').orderBy('objects.key', 'ASC').getMany()).map(
        (key) => key.key,
      );
      const keysWithInfo: { key: string; type: 'content' | 'common-prefix' }[] = [];

      const alreadyAddedCommonPrefixesWithLastKey = new Map<string, string>();
      if (query.prefix) {
        keys.forEach((key) => {
          if (key.includes(query.delimiter, query.prefix.length)) {
            const commonPrefix = key.substring(0, key.indexOf(query.delimiter, query.prefix.length) + 1);

            if (!alreadyAddedCommonPrefixesWithLastKey.has(commonPrefix)) {
              keysWithInfo.push({ key: commonPrefix, type: 'common-prefix' });
            }

            alreadyAddedCommonPrefixesWithLastKey.set(commonPrefix, key);
          } else {
            keysWithInfo.push({ key, type: 'content' });
          }
        });
      } else {
        keys.forEach((key) => {
          if (key.includes(query.delimiter)) {
            const commonPrefix = key.substring(0, key.indexOf(query.delimiter) + 1);

            if (!alreadyAddedCommonPrefixesWithLastKey.has(commonPrefix)) {
              keysWithInfo.push({ key: commonPrefix, type: 'common-prefix' });
            }

            alreadyAddedCommonPrefixesWithLastKey.set(commonPrefix, key);
          } else {
            keysWithInfo.push({ key, type: 'content' });
          }
        });
      }

      let keysInRangesOfMaxKeysParameter = keysWithInfo;

      if (keysWithInfo.length > maxKeys) {
        isTruncated = true;
        keysInRangesOfMaxKeysParameter = _.take(keysInRangesOfMaxKeysParameter, maxKeys);
        const lastKey = _.last(keysInRangesOfMaxKeysParameter);
        if (lastKey) {
          if (lastKey.type === 'common-prefix') {
            nextContinuationToken = Base64.encodeURI(alreadyAddedCommonPrefixesWithLastKey.get(lastKey.key));
          } else {
            nextContinuationToken = Base64.encodeURI(lastKey.key);
          }
        }
      }

      const contentKeys: string[] = [];

      keysInRangesOfMaxKeysParameter.forEach((key) => {
        if (key.type === 'content') {
          contentKeys.push(key.key);
        } else {
          commonPrefixes.push(key.key);
        }
      });

      contents = await this.objectRepo.getObjectsByKeysAndBucketOrderedByKeys(params.bucket, contentKeys);
    } else {
      queryBuilder.orderBy('key', 'ASC');

      queryBuilder.take(maxKeys + 1);
      contents = await queryBuilder.getMany();

      if (contents.length > maxKeys) {
        contents.pop();
        isTruncated = true;
        if (contents.length) {
          nextContinuationToken = Base64.encodeURI(_.last(contents).key);
        }
      }
    }

    const response = [
      {
        ListBucketResult: [
          { _attr: { xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/' } },
          { Name: params.bucket },

          query.prefix ? { Prefix: query.prefix } : { Prefix: {} },
          query['start-after'] ? { StartAfter: query['start-after'] } : {},

          { KeyCount: contents.length + commonPrefixes.length },
          { MaxKeys: maxKeys },
          query.delimiter ? { Delimiter: query.delimiter } : {},
          { IsTruncated: isTruncated },

          query['continuation-token'] ? { ContinuationToken: query['continuation-token'] } : {},

          nextContinuationToken ? { NextContinuationToken: nextContinuationToken } : {},

          ...contents.map((object) => ({
            Contents: [
              { Key: object.key },
              {
                LastModified: object.modifiedAt.toISOString(),
              },
              { ETag: object.etag },
              { Size: object.size },
              { StorageClass: object.storageClass },
            ],
          })),

          ...(commonPrefixes || []).map((commonPrefix) => ({
            CommonPrefixes: [
              {
                Prefix: commonPrefix,
              },
            ],
          })),
        ],
      },
    ];

    const xmlResult = xml(response, {
      declaration: true,
    });

    return xmlResult;
  }

  /**
   * TODO: check x-amz-expected-bucket-owner header
   * TODO: validate input
   */
  public async listObjects(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const bucket = await this.bucketRepo.findByNameOrFail(params.bucket);

    const query = {
      delimiter: request.query['delimiter'] as string,
      'encoding-type': request.query['encoding-type'],
      marker: request.query['marker'] as string,
      'max-keys': parseInt(request.query['max-keys'] as string) || 1000,
      prefix: request.query['prefix'] as string,
    };

    const queryBuilder = this.createQueryBuilderForObjectListing({
      bucket: params.bucket,
      afterKey: query.marker,
      prefix: query.prefix,
    });

    let isTruncated = false;
    let contents: ObjectEntity[] = [];
    const commonPrefixes: string[] = [];
    let nextMarker: string | null = null;

    if (query.delimiter) {
      const keys: string[] = (await queryBuilder.select('objects.key').orderBy('objects.key', 'ASC').getMany()).map(
        (key) => key.key,
      );
      const keysWithInfo: { key: string; type: 'content' | 'common-prefix' }[] = [];

      const alreadyAddedCommonPrefixesWithLastKey = new Map<string, string>();
      if (query.prefix) {
        keys.forEach((key) => {
          if (key.includes(query.delimiter, query.prefix.length)) {
            const commonPrefix = key.substring(0, key.indexOf(query.delimiter, query.prefix.length) + 1);

            if (!alreadyAddedCommonPrefixesWithLastKey.has(commonPrefix)) {
              keysWithInfo.push({ key: commonPrefix, type: 'common-prefix' });
            }

            alreadyAddedCommonPrefixesWithLastKey.set(commonPrefix, key);
          } else {
            keysWithInfo.push({ key, type: 'content' });
          }
        });
      } else {
        keys.forEach((key) => {
          if (key.includes(query.delimiter)) {
            const commonPrefix = key.substring(0, key.indexOf(query.delimiter) + 1);

            if (!alreadyAddedCommonPrefixesWithLastKey.has(commonPrefix)) {
              keysWithInfo.push({ key: commonPrefix, type: 'common-prefix' });
            }

            alreadyAddedCommonPrefixesWithLastKey.set(commonPrefix, key);
          } else {
            keysWithInfo.push({ key, type: 'content' });
          }
        });
      }

      let keysInRangesOfMaxKeysParameter = keysWithInfo;

      if (keysWithInfo.length > query['max-keys']) {
        isTruncated = true;
        keysInRangesOfMaxKeysParameter = _.take(keysInRangesOfMaxKeysParameter, query['max-keys']);
        const lastKey = _.last(keysInRangesOfMaxKeysParameter);
        if (lastKey) {
          if (lastKey.type === 'common-prefix') {
            nextMarker = alreadyAddedCommonPrefixesWithLastKey.get(lastKey.key);
          } else {
            nextMarker = lastKey.key;
          }
        }
      }

      const contentKeys: string[] = [];

      keysInRangesOfMaxKeysParameter.forEach((key) => {
        if (key.type === 'content') {
          contentKeys.push(key.key);
        } else {
          commonPrefixes.push(key.key);
        }
      });

      contents = await this.objectRepo.getObjectsByKeysAndBucketOrderedByKeys(params.bucket, contentKeys);
    } else {
      queryBuilder.orderBy('key', 'ASC');

      queryBuilder.take(query['max-keys'] + 1);
      contents = await queryBuilder.getMany();

      if (contents.length > query['max-keys']) {
        contents.pop();
        isTruncated = true;
      }
    }

    const xmlResult = xml(
      [
        {
          ListBucketResult: [
            { _attr: { xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/' } },

            { IsTruncated: isTruncated },
            query.marker ? { Marker: query.marker } : {},
            nextMarker ? { NextMarker: nextMarker } : {},

            ...contents.map((object) => ({
              Contents: [
                { ETag: object.etag },
                { Key: query['encoding-type'] === 'url' ? encodeURIComponent(object.key) : object.key },
                { LastModified: object.modifiedAt.toISOString() },
                { Owner: [{ DisplayName: bucket.ownerPublicKey }, { ID: bucket.ownerPublicKey }] },
                { Size: object.size },
                { StorageClass: object.storageClass },
              ],
            })),

            { Name: params.bucket },

            query.prefix ? { Prefix: query.prefix } : { Prefix: {} },

            query.delimiter ? { Delimiter: query.delimiter } : {},

            { MaxKeys: query['max-keys'] },

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

  private createQueryBuilderForObjectListing(params: {
    bucket: string;
    afterKey?: string;
    prefix?: string;
  }): SelectQueryBuilder<ObjectEntity> {
    const queryBuilder = this.objectRepo
      .createQueryBuilder('objects')
      .where('objects.bucket = :bucket', { bucket: params.bucket });

    if (params.afterKey) {
      queryBuilder.andWhere('objects.key > :afterKey', { afterKey: params.afterKey });
    }

    if (params.prefix) {
      queryBuilder.andWhere('objects.key LIKE :pattern', {
        pattern: `${this.objectRepo.escapeForPostgresLikeOperation(params.prefix)}%`,
      });
    }

    return queryBuilder;
  }

  public async listObjectsExtended(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const query: {
      prefix?: string;
      delimiter?: string;
      perPage?: number;
      page?: number;
    } = {
      ...request.query,
      perPage: request.query.perPage ? parseInt(request.query.perPage as string) : 1000,
      page: request.query.page ? Math.max(parseInt(request.query.page as string), 1) : 1,
    };

    const queryBuilder = this.objectRepo
      .createQueryBuilder('objects')
      .where('objects.bucket = :bucket', { bucket: params.bucket });

    if (query.prefix) {
      queryBuilder.andWhere('objects.key LIKE :pattern', {
        pattern: `${this.objectRepo.escapeForPostgresLikeOperation(query.prefix)}%`,
      });
    }

    let isTruncated = false;
    let availableKeyCount: number = null;
    let contents: ObjectEntity[] = [];
    const commonPrefixes: string[] = [];

    if (query.delimiter) {
      const keys: string[] = (await queryBuilder.select('objects.key').orderBy('objects.key', 'ASC').getMany()).map(
        (key) => key.key,
      );
      const keysWithInfo: { key: string; type: 'content' | 'common-prefix' }[] = [];

      const alreadyAddedCommonPrefixesWithLastKey = new Map<string, string>();
      if (query.prefix) {
        keys.forEach((key) => {
          if (key.includes(query.delimiter, query.prefix.length)) {
            const commonPrefix = key.substring(0, key.indexOf(query.delimiter, query.prefix.length) + 1);

            if (!alreadyAddedCommonPrefixesWithLastKey.has(commonPrefix)) {
              keysWithInfo.push({ key: commonPrefix, type: 'common-prefix' });
            }

            alreadyAddedCommonPrefixesWithLastKey.set(commonPrefix, key);
          } else {
            keysWithInfo.push({ key, type: 'content' });
          }
        });
      } else {
        keys.forEach((key) => {
          if (key.includes(query.delimiter)) {
            const commonPrefix = key.substring(0, key.indexOf(query.delimiter) + 1);

            if (!alreadyAddedCommonPrefixesWithLastKey.has(commonPrefix)) {
              keysWithInfo.push({ key: commonPrefix, type: 'common-prefix' });
            }

            alreadyAddedCommonPrefixesWithLastKey.set(commonPrefix, key);
          } else {
            keysWithInfo.push({ key, type: 'content' });
          }
        });
      }

      availableKeyCount = keysWithInfo.length;

      //  Папки должны быть вначале. (Хотя у оргинального ListObject/ListObjectsV2 они перемешаны с файлами и сортированы по алфавите)
      let keysInRangesOfMaxKeysParameter = [
        ...keysWithInfo.filter((k) => k.type === 'common-prefix'),
        ...keysWithInfo.filter((k) => k.type === 'content'),
      ];

      if (keysWithInfo.length > query.perPage) {
        isTruncated = true;

        keysInRangesOfMaxKeysParameter = keysInRangesOfMaxKeysParameter.slice(
          query.perPage * (query.page - 1),
          query.perPage * (query.page - 1) + query.perPage,
        );
      }

      const contentKeys: string[] = [];

      keysInRangesOfMaxKeysParameter.forEach((key) => {
        if (key.type === 'content') {
          contentKeys.push(key.key);
        } else {
          commonPrefixes.push(key.key);
        }
      });

      contents = await this.objectRepo.getObjectsByKeysAndBucketOrderedByKeys(params.bucket, contentKeys);
    } else {
      availableKeyCount = await queryBuilder.clone().getCount();

      queryBuilder.orderBy('key', 'ASC');

      queryBuilder.take(query.perPage + 1).skip((query.page - 1) * query.perPage);
      contents = await queryBuilder.getMany();

      if (contents.length > query.perPage) {
        contents.pop();
        isTruncated = true;
      }
    }

    let commonPrefixesInfo = {};

    try {
      commonPrefixesInfo = await this.objectRepo.getSizeAndLastModifiedForCommonPrefixes(params.bucket, commonPrefixes);
    } catch (err) {
      this.logger.error(err);
    }

    if (request.query.format === 'json') {
      const result = {
        ListExtendedObjects: {
          Name: params.bucket,
          PerPage: query.perPage,
          Page: query.page,
          PagesCount: Math.ceil(availableKeyCount / query.perPage),
          ...(query.prefix ? { Prefix: query.prefix } : {}),
          KeyCount: contents.length + commonPrefixes.length,
          AvailableKeyCount: availableKeyCount,
          ...(query.delimiter ? { Delimiter: query.delimiter } : {}),
          IsTruncated: isTruncated,
          Contents: contents.map((object) => ({
            Key: object.key,
            LastModified: object.modifiedAt.toISOString(),
            ETag: object.etag,
            Size: object.size,
            SizeReadable: prettyBytes(parseInt(object.size)),
            StorageClass: object.storageClass,
            StorageClassReadable: storageClassesToReadable[object.storageClass],
            ContentType: object.headers?.['Content-Type'] || object.contentType,
            ACL: object.acl,
            FileType: this.commonUtils.guessFileTypeByKey(object.key),
          })),
          CommonPrefixes: (commonPrefixes || []).map((commonPrefix) => ({
            Prefix: commonPrefix,
            Size: commonPrefixesInfo[commonPrefix]?.size || '0',
            SizeReadable: prettyBytes(parseInt(commonPrefixesInfo[commonPrefix]?.size || '0')),
            LastModified: commonPrefixesInfo[commonPrefix]?.modifiedAt?.toISOString() || null,
          })),
        },
      };

      response.status(200).send(result);
    } else {
      const xmlInput = [
        {
          ListExtendedObjects: [
            { Name: params.bucket },
            { PerPage: query.perPage },
            { Page: query.page },
            { PagesCount: Math.ceil(availableKeyCount / query.perPage) },
            query.prefix ? { Prefix: query.prefix } : { Prefix: {} },
            { KeyCount: contents.length + commonPrefixes.length },
            { AvailableKeyCount: availableKeyCount },
            query.delimiter ? { Delimiter: query.delimiter } : {},
            { IsTruncated: isTruncated },

            ...contents.map((object) => ({
              Contents: [
                { Key: object.key },
                { LastModified: object.modifiedAt.toISOString() },
                { ETag: object.etag },
                { Size: object.size },
                { SizeReadable: prettyBytes(parseInt(object.size)) },
                { StorageClass: object.storageClass },
                { StorageClassReadable: storageClassesToReadable[object.storageClass] },
                { ContentType: object.headers?.['Content-Type'] || object.contentType },
                { ACL: object.acl },
                { FileType: this.commonUtils.guessFileTypeByKey(object.key) },
              ],
            })),

            ...(commonPrefixes || []).map((commonPrefix) => ({
              CommonPrefixes: [
                { Prefix: commonPrefix },
                { Size: commonPrefixesInfo[commonPrefix]?.size || '0' },
                { SizeReadable: prettyBytes(parseInt(commonPrefixesInfo[commonPrefix]?.size || '0')) },
                { LastModified: commonPrefixesInfo[commonPrefix]?.modifiedAt?.toISOString() || null },
              ],
            })),
          ],
        },
      ];

      const xmlResult = xml(xmlInput, {
        declaration: true,
      });

      response.status(200).header('content-type', 'application/xml').header('Server', 'ColdStack').send(xmlResult);
    }
  }

  public async listFiles(
    request: Request,
    response: Response,
    params: { filename: string; perPage?: number; page?: number },
    user: UserFromAuthnode,
  ): Promise<void> {
    const perPage = parseInt(request.query.perPage as string) || 20;
    const page = parseInt(request.query.page as string) || 1;
    const outputFormat = <string>request.query.format || 'xml';

    const pattern = `%${this.objectRepo.escapeForPostgresLikeOperation(params.filename)}%`;

    const queryBuilder = this.objectRepo
      .createQueryBuilder('object')
      .leftJoinAndSelect(BucketEntity, 'bucket', 'bucket.name = object.bucket')
      .where('bucket.ownerPublicKey = :ownerPublicKey', { ownerPublicKey: user.user.publicKey })
      .andWhere('object.filename ILIKE :pattern', { pattern })
      .andWhere("object.type = 'file'")
      .take(perPage)
      .skip((page - 1) * perPage);

    const contents = (await queryBuilder.getMany()).map((object) => ({
      Key: object.key,
      FileType: this.commonUtils.guessFileTypeByKey(object.key),
      Bucket: object.bucket,
      FileName: object.filename,
    }));

    const result = this.listFilesResponseFormatter
      .withProps({
        SearchFilesResult: {
          Query: { perPage, page },
          Files: contents,
        },
      })
      .format(outputFormat);

    response
      .status(200)
      .header('content-type', `application/${outputFormat}`)
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send(result);
  }

  public async headObject(
    request: Request,
    response: Response,
    headers: GetObjectRequestHeadersDto,
    query: GetObjectRequestQueryDto,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const object = await this.objectRepo.findByKeyAndBucketAndJoinMetadatas(params.key, params.bucket);

    if (!object) {
      this.errorsService.sendError(response, {
        code: 'NoSuchKey',
        resource: `${params.bucket}/${params.key}`,
        requestId: request.id.toString(),
      });
      return;
    }

    response.header('Accept-Ranges', 'none');

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

    response.status(200).send();
  }

  public async getExtendedInfoOfObject(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const object = await this.objectRepo.findByKeyAndBucketAndJoinMetadatas(params.key, params.bucket);

    if (!object) {
      this.errorsService.sendError(response, {
        code: 'NoSuchKey',
        resource: `${params.bucket}/${params.key}`,
        requestId: request.id.toString(),
      });
      return;
    }

    if (!object.headers) {
      object.headers = {};
    }

    const bucket = await this.bucketRepo.findOne({ where: { name: object.bucket } });

    const metadatasToDisplay = object.storageForceChosen
      ? object.metadatas
      : object.metadatas.filter((metadata) => metadata.key !== 'storage' && metadata.key !== 'location');

    const Metadata = {};

    metadatasToDisplay.forEach((metadata) => {
      Metadata[metadata.key.toLowerCase()] = metadata.value;
    });

    if (request.query.format === 'json') {
      const result = {
        ObjectExtendedInfo: {
          CacheControl: object.headers['Cache-Control'],
          ContentDisposition: object.headers['Content-Disposition'],
          ContentEncoding: object.headers['Content-Encoding'],
          ContentLanguage: object.headers['Content-Language'],
          Expires: object.headers['Expires'],
          ContentType: object.headers['Content-Type'],
          FileType: this.commonUtils.guessFileTypeByKey(object.key),
          ETag: object.etag,
          Size: object.size,
          SizeReadable: prettyBytes(parseInt(object.size)),
          LastModified: object.modifiedAt.toISOString(),
          StorageClass: object.storageClass,
          StorageClassReadable: storageClassesToReadable[object.storageClass],
          Metadata,
          ACL: object.acl,
          Owner: {
            ID: bucket.ownerPublicKey,
            DisplayName: bucket.ownerPublicKey,
          },
        },
      };

      response
        .status(200)
        .header('x-amz-request-id', request.id.toString())
        .header('x-amz-id-2', request.id.toString())
        .header('Server', 'ColdStack')
        .send(result);
    } else {
      const xmlResult = xml(
        [
          {
            ObjectExtendedInfo: [
              object.headers['Cache-Control'] ? { CacheControl: object.headers['Cache-Control'] } : {},
              object.headers['Content-Disposition']
                ? { ContentDisposition: object.headers['Content-Disposition'] }
                : {},
              object.headers['Content-Encoding'] ? { ContentEncoding: object.headers['Content-Encoding'] } : {},
              object.headers['Content-Language'] ? { ContentLanguage: object.headers['Content-Language'] } : {},
              object.headers['Expires'] ? { Expires: object.headers['Expires'] } : {},
              object.headers['Content-Type'] ? { ContentType: object.headers['Content-Type'] } : {},
              { FileType: this.commonUtils.guessFileTypeByKey(object.key) },
              { ETag: object.etag },
              { Size: object.size },
              { SizeReadable: prettyBytes(parseInt(object.size)) },
              { LastModified: object.modifiedAt.toISOString() },
              { StorageClass: object.storageClass },
              { StorageClassReadable: storageClassesToReadable[object.storageClass] },
              { ACL: object.acl },
              {
                Metadata: metadatasToDisplay.map((metadata) => ({
                  Key: metadata.key,
                  Value: metadata.value,
                })),
              },
              {
                Owner: [{ ID: bucket.ownerPublicKey }, { DisplayName: bucket.ownerPublicKey }],
              },
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
  }
}
