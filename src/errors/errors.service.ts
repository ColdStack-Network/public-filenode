import { Injectable } from '@nestjs/common';
import xml from 'xml';
import { v4 } from 'uuid';
import { Response } from 'express';

const errorToStatusCode = {
  InvalidRequest: 400,
  InvalidBucketName: 400,
  BucketAlreadyExists: 409,
  NoSuchKey: 404,
  KeyAlreadyExists: 409,
  PrefixAlreadyUsed: 409,
  BucketNotEmpty: 409,
  ObjectLockConfigurationNotFoundError: 404,
  NotImplemented: 501,
  InternalError: 500,
  NoSuchUpload: 404,
  NotEnoughBalance: 402,
  InvalidStorageClass: 400,
  MalformedXML: 400,
  NoSuchTagSetError: 404,
  BadDigest: 400,
};

export const defaultErrorDescriptions = {
  InvalidBucketName: 'The specified bucket is not valid.',
  BucketAlreadyExists:
    'The requested bucket name is not available. The bucket namespace is shared by all users of the system. Select a different name and try again.',
  NoSuchKey: 'The specified key does not exist.',
  BucketNotEmpty: 'The bucket you tried to delete is not empty.',
  ObjectLockConfigurationNotFoundError: 'Object Lock configuration does not exist for this bucket',
  NotImplemented: 'A header you provided implies functionality that is not implemented.',
  InternalError: 'We encountered an internal error. Please try again.',
  NoSuchUpload:
    'The specified multipart upload does not exist. The upload ID might be invalid, or the multipart upload might have been aborted or completed.',
  PrefixAlreadyUsed: 'Folder name is already used.',
  NotEnoughBalance:
    'To upload or download files or create folders you have to maintain balance in CLS worth of at least 1 dollar.',
  InvalidStorageClass: 'The storage class you specified is not valid.',
  MalformedXML: 'The XML you provided was not well-formed or did not validate against our published schema',
  BadDigest: 'The Content-MD5 you specified did not match what we received.',
};

export const errorDescriptions = {
  NoSuchTagSetError_bucket: 'There is no tag set associated with the bucket.',
  NoSuchTagSetError_object: 'There is no tag set associated with the object.',
};

export type ErrorCode = keyof typeof errorToStatusCode;

@Injectable()
export class ErrorsService {
  createAccessDeniedError(resource: string): string {
    const res = xml(
      [
        {
          Error: [{ Code: 'AccessDenied' }, { Message: 'Access Denied' }, { Resource: resource }, { RequestId: v4() }],
        },
      ],
      { declaration: true },
    );

    return res;
  }

  createErrorXML(params: { code: ErrorCode; resource?: string; message?: string; requestId?: string }): string {
    const res = xml(
      [
        {
          Error: [
            { Code: params.code },
            params.message
              ? { Message: params.message }
              : defaultErrorDescriptions[params.code] && params.message !== null
              ? { Message: defaultErrorDescriptions[params.code] }
              : {},
            params.resource ? { Resource: params.resource } : {},
            { RequestId: params.requestId || v4() },
          ],
        },
      ],
      { declaration: true },
    );

    return res;
  }

  createErrorJSON(params: { code: ErrorCode; resource?: string; message?: string; requestId?: string }): any {
    const res = {
      Error: {
        Code: params.code,
        ...(params.message
          ? { Message: params.message }
          : defaultErrorDescriptions[params.code] && params.message !== null
          ? { Message: defaultErrorDescriptions[params.code] }
          : {}),
        ...(params.resource ? { Resource: params.resource } : {}),
        RequestId: params.requestId || v4(),
      },
    };

    return res;
  }

  sendError(
    response: Response,
    params: { code: ErrorCode; resource?: string; message?: string; requestId?: string; json?: boolean },
  ): void {
    if (params.json) {
      const errorJSON = this.createErrorJSON(params);

      response.status(errorToStatusCode[params.code]).send(errorJSON);

      return;
    }

    const errorXML = this.createErrorXML(params);

    response.status(errorToStatusCode[params.code]).header('content-type', 'application/xml').send(errorXML);
  }
}
