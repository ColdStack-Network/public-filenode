import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { ObjectRepository } from './repositories/object.repository';
import rawBody from 'raw-body';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CommonUtilsService } from './common-utils.service';
import { ErrorsService } from '../errors/errors.service';
import { BucketRepository } from './repositories/bucket.repository';

@Injectable()
export class ACLService {
  constructor(
    private readonly objectRepo: ObjectRepository,
    @InjectPinoLogger(ACLService.name)
    private readonly logger: PinoLogger,
    private readonly commonUtils: CommonUtilsService,
    private readonly errorsService: ErrorsService,
    private readonly bucketRepo: BucketRepository,
  ) {}

  async putObjectAcl(request: Request, response: Response, params: { bucket: string; key: string }): Promise<void> {
    const body = await rawBody(request, { encoding: 'utf-8' });

    this.logger.info(`putObjectAcl: ${body}`);

    const acl =
      typeof request.headers['x-amz-acl'] === 'string' &&
      request.headers['x-amz-acl'].toLocaleLowerCase() === 'public-read'
        ? 'public-read'
        : 'private';

    const object = await this.objectRepo.findByKeyAndBucket(params.key, params.bucket);

    object.acl = acl;

    await this.objectRepo.save(object);

    response.status(200).send();
  }

  async getObjectAcl(request: Request, response: Response, params: { bucket: string; key: string }): Promise<void> {
    const object = await this.objectRepo.findByKeyAndBucket(params.key, params.bucket);

    if (!object) {
      this.errorsService.sendError(response, {
        code: 'NoSuchKey',
        resource: `${params.bucket}/${params.key}`,
        requestId: request.id.toString(),
      });

      return;
    }

    const bucket = await this.bucketRepo.findByNameOrFail(object.bucket);

    let result = '';

    if (object.acl === 'public-read') {
      result =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<AccessControlPolicy xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
        `<Owner><ID>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</ID>` +
        `<DisplayName>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</DisplayName></Owner>` +
        `<AccessControlList>` +
        `<Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser">` +
        `<ID>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</ID>` +
        `<DisplayName>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</DisplayName></Grantee>` +
        `<Permission>FULL_CONTROL</Permission></Grant>` +
        `<Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="Group">` +
        `<URI>http://acs.amazonaws.com/groups/global/AllUsers</URI></Grantee>` +
        `<Permission>READ</Permission></Grant>` +
        `</AccessControlList></AccessControlPolicy>`;
    } else {
      result =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<AccessControlPolicy xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
        `<Owner><ID>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</ID>` +
        `<DisplayName>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</DisplayName></Owner>` +
        `<AccessControlList><Grant>` +
        `<Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser">` +
        `<ID>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</ID>` +
        `<DisplayName>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</DisplayName></Grantee>` +
        `<Permission>FULL_CONTROL</Permission>` +
        `</Grant></AccessControlList></AccessControlPolicy>`;
    }

    response
      .status(200)
      .header('content-type', 'application/xml')
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send(result);
  }

  async getBucketAcl(request: Request, response: Response, params: { bucket: string; key: string }): Promise<void> {
    const bucket = await this.bucketRepo.findByNameOrFail(params.bucket);

    const result =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<AccessControlPolicy xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
      `<Owner><ID>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</ID>` +
      `<DisplayName>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</DisplayName></Owner>` +
      `<AccessControlList><Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser">` +
      `<ID>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</ID>` +
      `<DisplayName>${this.commonUtils.escapeXML(bucket.ownerPublicKey)}</DisplayName></Grantee>` +
      `<Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`;

    response
      .status(200)
      .header('content-type', 'application/xml')
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send(result);
  }

  async putBucketAcl(request: Request, response: Response): Promise<void> {
    const body = await rawBody(request, { encoding: 'utf-8' });

    this.logger.info(`putBucketAcl: ${body}`);

    response
      .status(200)
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send();
  }
}
