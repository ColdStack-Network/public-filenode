import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import rawBody from 'raw-body';
import { Request, Response } from 'express';
import { xml2js, ElementCompact } from 'xml-js';
import _ from 'lodash';
import { ObjectForBulkDeletion } from './interfaces/object-for-bulk-deletion.interface';
import { ObjectsBulkDeletionError } from './interfaces/objects-bulk-deletion-error.interface';
import { defaultErrorDescriptions, ErrorsService } from '../errors/errors.service';
import { DeleteObjectService } from './delete-object.service';
import { ObjectRepository } from '../objects/repositories/object.repository';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { StatisticsService } from '../objects/statistics.service';
import { DeleteObjectResponseFormatter } from './delete-object-response-formatter.service';

@Injectable()
export class DeleteObjectsBulkService {
  constructor(
    private readonly objectRepo: ObjectRepository,
    @Inject(forwardRef(() => ErrorsService))
    private readonly errorsService: ErrorsService,
    @Inject(forwardRef(() => DeleteObjectService))
    private readonly deleteObjectService: DeleteObjectService,
    @InjectPinoLogger(DeleteObjectsBulkService.name)
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => StatisticsService))
    private readonly statisticsService: StatisticsService,
    private readonly responseFormatter: DeleteObjectResponseFormatter,
  ) {}

  async deleteObjectsBulk(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
    user: UserFromAuthnode,
  ): Promise<void> {
    const {
      fatalError: parsingFatalError,
      inputErrors,
      objectsForDeletion,
      quiet,
    } = await this.parseAndValidateDeleteObjectBulkInput(request);

    if (parsingFatalError) {
      this.errorsService.sendError(response, {
        code: 'MalformedXML',
        requestId: request.id.toString(),
        resource: params.bucket,
      });

      return;
    }

    const deleteErrors = [...inputErrors];

    const objects = await this.objectRepo.getObjectsByKeysAndBucketOrderedByKeys(
      params.bucket,
      objectsForDeletion.map((o) => o.Key),
    );

    const successfullyDeletedKeys: string[] = [];
    for (const object of objects) {
      try {
        await this.deleteObjectService.deleteObjectFromGatewayAndBlockchainAndDB(object, user);
        successfullyDeletedKeys.push(object.key);
      } catch (err) {
        this.logger.error({ msg: 'Error for a single object when doing bulk delete.', object, err });
        deleteErrors.push({
          Code: 'InternalError',
          Key: object.key,
          Message: defaultErrorDescriptions.InternalError,
        });
      }
    }

    await this.statisticsService.updateBucketStorageStatistics(params.bucket);

    const result = this.responseFormatter.formatResponseOfDeleteObjectsBulk({
      quiet,
      deleteErrors,
      successfullyDeletedKeys,
    });

    response
      .status(200)
      .header('content-type', 'application/xml')
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send(result);
  }

  private async parseAndValidateDeleteObjectBulkInput(
    request: Request,
  ): Promise<{
    fatalError?: any;
    quiet?: boolean;
    objectsForDeletion?: ObjectForBulkDeletion[];
    inputErrors?: ObjectsBulkDeletionError[];
  }> {
    // limit = 4MB, it should be more than enough
    const bulkDeletionInput = await rawBody(request, { encoding: 'utf-8', limit: '4mb' });

    const parsed = xml2js(bulkDeletionInput, { compact: true }) as ElementCompact;

    if (!parsed.Delete) {
      return { fatalError: new Error('Missing Delete element.') };
    }

    if (!parsed.Delete.Object) {
      return { fatalError: new Error('No Object was specified.') };
    }

    if (parsed.Quiet?.__text && parsed.Quiet._text !== 'true' && parsed.Quiet._text !== 'false') {
      return { fatalError: new Error('Invalid Quiet parameter.') };
    }

    const objectsArray = _.isArray(parsed.Delete.Object) ? parsed.Delete.Object : [parsed.Delete.Object];

    if (objectsArray.length > 1000) {
      return { fatalError: new Error('Specified more than 1000 keys.') };
    }

    const objects: ObjectForBulkDeletion[] = [];
    const errors: ObjectsBulkDeletionError[] = [];

    for (const objectInput of objectsArray) {
      if (!objectInput.Key._text) {
        errors.push({
          Code: 'NoSuchKey',
          Key: '',
          Message: 'The specified key does not exist',
          VersionId: objectInput.VersionId?._text,
        });
      } else {
        objects.push({
          Key: objectInput.Key._text,
          VersionId: objectInput.VersionId?._text,
        });
      }
    }

    return {
      objectsForDeletion: objects,
      inputErrors: errors,
      quiet: parsed.Delete.Quiet?._text === 'true' ? true : false,
    };
  }
}
