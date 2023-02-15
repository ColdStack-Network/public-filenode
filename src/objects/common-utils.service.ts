import { forwardRef, Inject } from '@nestjs/common';
import { APP_CONFIGS_KEY, TAppConfigs } from '../config/app.config';
import { URL } from 'url';
import { IncomingHttpHeaders } from 'http';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { ErrorsService } from '../errors/errors.service';
import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import _ from 'lodash';
import { fileExtensions } from './file-extensions';
import { CLS_CONFIGS_KEY, TCLSConfigs } from '../config/cls.config';
import { storageClassesToCode } from './constants/storage-classes-to-code';
import { StorageClass } from './constants/storage-class.enum';
import { BillingApiService } from '../billing-api/billing-api.service';

export class CommonUtilsService {
  constructor(
    @Inject(APP_CONFIGS_KEY)
    private readonly appConfigs: TAppConfigs,
    private readonly authService: AuthService,
    private readonly errorsService: ErrorsService,
    @Inject(forwardRef(() => BillingApiService))
    private readonly billingApiService: BillingApiService,
    @Inject(forwardRef(() => CLS_CONFIGS_KEY))
    private readonly clsConfigs: TCLSConfigs,
  ) {}

  public generateUrlForObject(params: { bucket: string; key: string }): string {
    if (this.appConfigs.useBucketSubdomains) {
      const baseUrl = new URL(this.appConfigs.baseUrl);
      return baseUrl.protocol + '://' + params.bucket + '.' + baseUrl.hostname + '/' + params.key;
    }

    return this.appConfigs.baseUrl + '/' + params.bucket + '/' + params.key;
  }

  public parseAmzMetadataHeaders(headers: IncomingHttpHeaders): Record<string, string> {
    const metadatasDict = Object.fromEntries(
      Object.entries(headers)
        .filter(([headerName]) => headerName.toLowerCase().startsWith('x-amz-meta-'))
        .map(([headerName, headerValue]): [string, string] => [
          headerName.toLowerCase().replace(/^x-amz-meta-/, ''),
          typeof headerValue === 'string' ? headerValue : headerValue[0] || '',
        ]),
    );

    return metadatasDict;
  }

  public generateFileHash(params: {
    userEthAddress: string;
    bucketName: string;
    fileName: string;
    fileSize: string;
    fileContentSha256: string;
    uploadTimestamp: Date;
  }): string {
    return crypto
      .createHash('sha256')
      .update(
        params.userEthAddress +
          ' ' +
          params.bucketName +
          ' ' +
          params.fileName +
          ' ' +
          params.fileSize +
          ' ' +
          params.fileContentSha256 +
          ' ' +
          params.uploadTimestamp.valueOf(),
      )
      .digest('hex');
  }

  public async authenticateWithAuthnode(
    request: Request,
    response: Response,
  ): Promise<{ error: boolean; user?: UserFromAuthnode }> {
    const params = this.getBucketAndObjectKeyFromRequest(request);

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

  public getBucketAndObjectKeyFromRequest(request: Request): { bucket: string; key: string } {
    const baseUrl = new URL(this.appConfigs.baseUrl);

    const originalPath = request.originalUrl.includes('?')
      ? request.originalUrl.substring(0, request.originalUrl.indexOf('?'))
      : request.originalUrl;

    if (request.hostname.match(new RegExp(`^.+\.${baseUrl.hostname}$`))) {
      return {
        bucket: request.hostname.split('.')[0],
        key: decodeURIComponent(originalPath.replace(/^\//, '')),
      };
    }

    return {
      bucket: originalPath.split('/')[1],
      key: decodeURIComponent(_.slice(originalPath.split('/'), 2).join('/')),
    };
  }

  public getSearchParamsFromRequest(request: Request): { filename: string; perPage: number; page: number } {
    return {
      filename: <string>request.query.filename,
      perPage: parseInt(<string>request.query.perPage) || 10,
      page: parseInt(<string>request.query.page) || 1,
    };
  }

  public getOneHeader(request: Request, headerName: string): string | null {
    return request.headers[headerName]
      ? typeof request.headers[headerName] === 'string'
        ? (request.headers[headerName] as string)
        : request.headers[headerName][0]
      : null;
  }

  public escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  public guessFileTypeByKey(key: string): 'video' | 'image' | 'audio' | 'file' {
    for (const type in fileExtensions) {
      for (const extension of fileExtensions[type]) {
        if (key.endsWith('.' + extension)) {
          return type as any;
        }
      }
    }

    return 'file';
  }

  public getNameAndTypeFromKey(key: string): { filename: string; type: 'file' | 'folder' } {
    let filename: string;
    let type: 'file' | 'folder';
    const dashIndex = key.lastIndexOf('/');
    if (dashIndex === -1) {
      filename = key;
      type = 'file';
    } else if (dashIndex !== key.length - 1) {
      filename = key.substr(dashIndex + 1);
      type = 'file';
    } else if (dashIndex === key.length - 1) {
      const preLastDashIndex = key.substr(0, dashIndex).lastIndexOf('/');
      filename = key.substr(preLastDashIndex + 1);
      type = 'folder';
    }
    return {
      filename: filename,
      type,
    };
  }

  /**
   * Returns true if the blockchain is not available or the balance is more than 1 dollar.
   * That means that if blockchain goes down - we still let users upload files and do other actions.
   */
  async hasAtLeast1DollarOrCantConnectToBlockchain(publicKey: string): Promise<boolean> {
    let result = true;

    if (!this.appConfigs.disableMinimalBalance && !this.clsConfigs.disableBlockchainWriting) {
      if (!(await this.billingApiService.balanceHasAtLeast1Dollar(publicKey))) {
        result = false;
      }
    }

    return result;
  }

  /**
   * Returns true if the blockchain is not available or the balance is more than the predicted file price for upload.
   * That means that if blockchain goes down - we still let users upload files.
   */
  async hasAtLeastPredictedPriceOrCantConnectToBlockchain(params: {
    publicKey: string;
    gatewayType: number;
    storageClass: number;
    size: number;
  }): Promise<boolean> {
    let result = true;

    if (!this.appConfigs.disableMinimalBalance && !this.clsConfigs.disableBlockchainWriting) {
      if (!(await this.billingApiService.balanceHasAtLeastPredictedPrice(params))) {
        result = false;
      }
    }

    return result;
  }

  validateStorageClass(params: {
    response: Response;
    request: Request;
    /**
     * Needed to form the response in case of error.
     */
    params: { bucket: string; key: string };
  }): { storageClass: StorageClass; errored: boolean } {
    const specifiedStorageClass = params.request.headers['x-amz-storage-class'] as StorageClass;

    if (specifiedStorageClass && !this.isValidStorageClass(specifiedStorageClass)) {
      this.errorsService.sendError(params.response, {
        code: 'InvalidStorageClass',
        requestId: params.request.id.toString(),
        resource: `${params.params.bucket}/${params.params.key}`,
      });

      return { storageClass: null, errored: true };
    }

    return { storageClass: specifiedStorageClass || StorageClass.STANDARD, errored: false };
  }

  private isValidStorageClass(storageClass: string): boolean {
    const storageClassCode = storageClassesToCode[storageClass];
    return typeof storageClassCode === 'number';
  }
}
