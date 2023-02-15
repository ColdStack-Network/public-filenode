import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { errorDescriptions, ErrorsService } from '../errors/errors.service';

@Injectable()
export class TaggingService {
  constructor(private readonly errorsService: ErrorsService) {}

  public async getBucketTagging(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    this.errorsService.sendError(response, {
      code: 'NoSuchTagSetError',
      message: errorDescriptions.NoSuchTagSetError_bucket,
      requestId: request.id.toString(),
      resource: params.bucket,
    });
  }

  public async getObjectTagging(
    request: Request,
    response: Response,
    params: { bucket: string; key: string },
  ): Promise<void> {
    this.errorsService.sendError(response, {
      code: 'NoSuchTagSetError',
      message: errorDescriptions.NoSuchTagSetError_object,
      requestId: request.id.toString(),
      resource: `${params.bucket}/${params.key}`,
    });
  }
}
