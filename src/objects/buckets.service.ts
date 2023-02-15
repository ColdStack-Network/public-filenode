import { Injectable } from '@nestjs/common';
import { BucketRepository } from './repositories/bucket.repository';
import { v4 as uuidv4 } from 'uuid';
import { BucketEntity } from './entities/bucket.entity';
import { Request, Response } from 'express';
import { ErrorsService } from '../errors/errors.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import { ObjectRepository } from './repositories/object.repository';

@Injectable()
export class BucketsService {
  constructor(
    private readonly bucketRepo: BucketRepository,
    private readonly errorsService: ErrorsService,
    @InjectPinoLogger(BucketsService.name)
    private readonly logger: PinoLogger,
    private readonly objectRepo: ObjectRepository,
  ) {}

  /**
   * TODO: implement
   */
  async getBucketLocation(request: Request, response: Response): Promise<void> {
    response
      .status(200)
      .header('content-type', 'application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<LocationConstraint><LocationConstraint>eu-central-1</LocationConstraint></LocationConstraint>`,
      );
  }

  async getBucketVersioning(request: Request, response: Response): Promise<void> {
    response
      .status(200)
      .header('content-type', 'application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration>` +
          `<Status>Suspended</Status>` +
          `<MfaDelete>Disabled</MfaDelete></VersioningConfiguration>`,
      );
  }

  async getObjectLockConfiguration(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    this.errorsService.sendError(response, {
      code: 'ObjectLockConfigurationNotFoundError',
      resource: `/${params.bucket}`,
    });
  }

  async createBucketEntity(params: {
    accessKeyId: string;
    name: string;
    ownerPublicKey: string;
  }): Promise<BucketEntity> {
    const bucket = await this.bucketRepo.save({
      id: uuidv4(),
      accessKeyId: params.accessKeyId,
      ownerPublicKey: params.ownerPublicKey.toLowerCase(),
      name: params.name,
      createdAt: new Date(),
    });

    return bucket;
  }

  async createBucket(
    request: Request,
    response: Response,
    user: UserFromAuthnode,
    params: { bucket: string; key: string },
  ): Promise<void> {
    if (!this.isBucketNameValid(params.bucket)) {
      this.errorsService.sendError(response, {
        code: 'InvalidBucketName',
        resource: `/${params.bucket}`,
      });
      return;
    } else if (await this.bucketRepo.bucketExists(params.bucket)) {
      this.errorsService.sendError(response, {
        code: 'BucketAlreadyExists',
        resource: `/${params.bucket}`,
      });
      return;
    } else if ((await this.bucketRepo.getBucketsCountForUser(user.user.publicKey)) >= 100) {
      this.errorsService.sendError(response, {
        code: 'InvalidRequest',
        message: 'You can not have more than 100 buckets',
        resource: `/${params.bucket}`,
      });
      return;
    }

    await this.createBucketEntity({
      accessKeyId: user.accessKey.id,
      name: params.bucket,
      ownerPublicKey: user.user.publicKey,
    });

    response.status(200).header('Location', `/${params.bucket}`).send();

    return;
  }

  async findBucketsByOwnerPublicKey(ownerPublicKey: string): Promise<BucketEntity[]> {
    return this.bucketRepo.find({
      where: {
        ownerPublicKey,
      },
    });
  }

  async renameBucket(
    request: Request,
    response: Response,
    user: UserFromAuthnode,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const bucket = await this.bucketRepo.findByNameOrFail(params.bucket);

    const newBucketName = request.headers.destination;

    if (newBucketName === bucket.name) {
      response.status(200).send();
      return;
    }

    if (typeof newBucketName !== 'string' || !this.isBucketNameValid(newBucketName)) {
      this.errorsService.sendError(response, {
        code: 'InvalidBucketName',
        resource: `/${newBucketName}`,
        json: request.query.format === 'json',
      });
      return;
    } else if (await this.bucketRepo.bucketExists(newBucketName)) {
      this.errorsService.sendError(response, {
        code: 'BucketAlreadyExists',
        resource: `/${newBucketName}`,
        json: request.query.format === 'json',
      });
      return;
    }

    const oldBucketName = bucket.name;

    bucket.name = request.headers.destination as string;

    await this.bucketRepo.save(bucket);
    await this.objectRepo.updateBucketName(oldBucketName, bucket.name);

    response.status(204).send();
  }

  public async listBuckets(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    const buckets = await this.bucketRepo.getByOwnerPublicKey(user.user.publicKey);

    let result =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
      `<Owner><ID>${user.user.publicKey}</ID><DisplayName>${user.user.publicKey}</DisplayName></Owner>` +
      `<Buckets>`;

    buckets.forEach((bucket) => {
      result += `<Bucket><Name>${
        bucket.name
      }</Name><CreationDate>${bucket.createdAt.toISOString()}</CreationDate></Bucket>`;
    });

    result += `</Buckets></ListAllMyBucketsResult>`;

    this.logger.info(result);

    response
      .status(200)
      .header('content-type', 'application/xml')
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send(result);
  }

  public async listExtendedBuckets(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    let params = undefined;
    let perPage = undefined;
    let page = undefined;

    if (request.query.page) {
      perPage = parseInt((request.query.perPage as string) || '10');
      page = Math.max(parseInt(request.query.page as string), 1);

      params = {
        take: perPage,
        skip: (page - 1) * perPage,
      };
    }

    const buckets = await this.bucketRepo.getByOwnerPublicKey(user.user.publicKey, params);
    let bucketsTotalCount = 0;

    if (request.query.page) {
      bucketsTotalCount = await this.bucketRepo.count({ where: { ownerPublicKey: user.user.publicKey } });
    } else {
      bucketsTotalCount = buckets.length;
    }

    const bucketNames = buckets.map((b) => b.name);
    const objectsCount = await this.objectRepo.countObjectsForBuckets(bucketNames);
    const objectsWithoutFoldersCount = await this.objectRepo.countObjectsWithoutFoldersForBuckets(bucketNames);

    if (request.query.format === 'json') {
      const result = {
        ListAllMyBucketsExtendedResult: {
          PerPage: perPage,
          Page: page,
          AvailableBucketsCount: bucketsTotalCount,
          PagesCount: perPage ? Math.ceil(bucketsTotalCount / perPage) : undefined,
          Owner: {
            ID: user.user.publicKey,
            DisplayName: user.user.publicKey,
          },
          Buckets: buckets.map((bucket) => ({
            Name: bucket.name,
            CreationDate: bucket.createdAt.toISOString(),
            ObjectsCount: (objectsCount[bucket.name] || 0).toString(),
            ObjectsWithoutFoldersCount: (objectsWithoutFoldersCount[bucket.name] || 0).toString(),
          })),
        },
      };

      response.status(200).send(result);
    } else {
      let result = `<?xml version="1.0" encoding="UTF-8"?>\n<ListAllMyBucketsExtendedResult>`;

      if (perPage) {
        result += `<PerPage>${perPage}</PerPage>`;
      }
      if (page) {
        result += `<Page>${page}</Page>`;
      }

      result += `<AvailableBucketsCount>${bucketsTotalCount}</AvailableBucketsCount>`;

      if (perPage) {
        result += `<PagesCount>${Math.ceil(bucketsTotalCount / perPage)}</PagesCount>`;
      }

      result += `<Owner><ID>${user.user.publicKey}</ID><DisplayName>${user.user.publicKey}</DisplayName></Owner><Buckets>`;

      buckets.forEach((bucket) => {
        result +=
          `<Bucket><Name>${bucket.name}</Name>` +
          `<CreationDate>${bucket.createdAt.toISOString()}</CreationDate>` +
          `<ObjectsCount>${objectsCount[bucket.name] || 0}</ObjectsCount>` +
          `<ObjectsWithoutFoldersCount>${
            objectsWithoutFoldersCount[bucket.name] || 0
          }</ObjectsWithoutFoldersCount></Bucket>`;
      });

      result += `</Buckets></ListAllMyBucketsExtendedResult>`;

      this.logger.info(result);

      response.status(200).header('content-type', 'application/xml').send(result);
    }
  }

  public headBucket(response: Response): void {
    response.header('x-amz-bucket-region', 'us-east-1');

    response.status(200).send();
  }

  public async deleteBucket(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    const object = await this.objectRepo.findOne({ bucket: params.bucket });

    if (object) {
      this.errorsService.sendError(response, { code: 'BucketNotEmpty', resource: '/' + params.bucket });
      return;
    }

    await this.bucketRepo.delete({ name: params.bucket });

    response.status(204).send();
  }

  public async getBucketRequestPayment(request: Request, response: Response): Promise<void> {
    response
      .status(200)
      .header('content-type', 'application/xml')
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><RequestPaymentConfiguration>' +
          '<Payer>BucketOwner</Payer></RequestPaymentConfiguration>',
      );
  }

  public async getBucketReplication(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
    user: UserFromAuthnode,
  ): Promise<void> {
    response
      .status(200)
      .header('content-type', 'application/xml')
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><ReplicationConfiguration>' +
          '<Role>arn:aws:iam::' +
          user.user.id +
          ':root</Role></ReplicationConfiguration>',
      );
  }

  public async getBucketLogging(request: Request, response: Response): Promise<void> {
    response
      .status(200)
      .header('content-type', 'application/xml')
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          '<BucketLoggingStatus xmlns="http://doc.s3.amazonaws.com/2006-03-01" />',
      );
  }

  /**
   * @see https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
   */
  private isBucketNameValid(bucketName: string): boolean {
    this.logger.info(`isBucketNameValid: validating bucket ${bucketName}`);
    return (
      bucketName.length >= 3 &&
      bucketName.length <= 63 &&
      //
      bucketName.match(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/) &&
      !bucketName.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)
    );
  }
}
