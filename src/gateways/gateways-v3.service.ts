import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ClientRequest } from 'http';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Readable } from 'stream';

@Injectable()
export class GatewaysV3Service {
  constructor(
    @InjectPinoLogger(GatewaysV3Service.name)
    private readonly logger: PinoLogger,
  ) {}

  async upload(params: {
    gatewayAddress: string;
    idempotency_id: string;
    contentLength: number;
    readableStream: Readable;
    storageForceChosen?: boolean;
    /**
     * Content-MD5 header that user sent for Message Integrity Check.
     * Optional
     */
    contentMd5?: string;
  }): Promise<any> {
    return axios.put(params.gatewayAddress + '/upload', params.readableStream, {
      headers: {
        'content-length': params.contentLength,
        ...(params.contentMd5 ? { 'content-md5': params.contentMd5 } : {}),
      },
      params: {
        idempotency_id: params.idempotency_id,
        storageForceChosen: params.storageForceChosen,
      },
      maxContentLength: Infinity,
      maxBodyLength: params.contentLength,
    });
  }

  async setFileHash(params: { gatewayAddress: string; idempotency_id: string; file_hash: string }): Promise<void> {
    await axios.post(params.gatewayAddress + '/set-file-hash', undefined, {
      params: {
        idempotency_id: params.idempotency_id,
        file_hash: params.file_hash,
      },
    });
  }

  async getUploadStatusOfFile(params: {
    gatewayAddress: string;
    file_hash: string;
  }): Promise<{ status: 'pending' | 'completed' }> {
    const resp = await axios.get(params.gatewayAddress + '/get-upload-status-of-file', {
      params: {
        file_hash: params.file_hash,
      },
    });

    return {
      status: resp.data.status,
    };
  }

  async getUploadStatuses(params: {
    gatewayAddress: string;
    file_hashes: string[];
  }): Promise<Record<string, { status: 'pending' | 'completed'; location?: string | null }>> {
    const resp = await axios.post(params.gatewayAddress + '/get-upload-statuses', {
      file_hashes: params.file_hashes,
    });

    return resp.data;
  }

  async startMultipartUpload(params: {
    gatewayAddress: string;
    idempotency_id: string;
    storageForceChosen?: boolean;
  }): Promise<void> {
    await axios.post(params.gatewayAddress + '/start-multipart-upload', undefined, {
      params: {
        idempotency_id: params.idempotency_id,
        storageForceChosen: params.storageForceChosen,
      },
    });
  }

  async uploadPart(params: {
    gatewayAddress: string;
    idempotency_id: string;
    part_number: number;
    readableStream: Readable;
    contentLength: number;
    /**
     * Content-MD5 header that user sent for Message Integrity Check.
     * Optional
     */
    contentMd5?: string;
  }): Promise<any> {
    return axios
      .post(params.gatewayAddress + '/upload-part', params.readableStream, {
        params: {
          idempotency_id: params.idempotency_id,
          part_number: params.part_number,
        },
        headers: {
          'content-length': params.contentLength,
        },
        maxContentLength: params.contentLength,
        maxBodyLength: params.contentLength,
      })
      .then((result) => {
        const request = result.request as ClientRequest;
        this.logger.info({ headers: request.getHeaders() }, 'Part successfully transfered.');
      });
  }

  async finishMultipartUpload(params: {
    gatewayAddress: string;
    idempotency_id: string;
    file_hash: string;
  }): Promise<void> {
    await axios.post(params.gatewayAddress + '/finish-multipart-upload', undefined, {
      params: {
        idempotency_id: params.idempotency_id,
        file_hash: params.file_hash,
      },
    });
  }

  async abortMultipartUpload(params: { gatewayAddress: string; idempotency_id: string }): Promise<void> {
    await axios.post(params.gatewayAddress + '/abort-multipart-upload', undefined, {
      params: {
        idempotency_id: params.idempotency_id,
      },
    });
  }

  async deleteFile(params: { gatewayAddress: string; file_hash: string }): Promise<void> {
    await axios.post(params.gatewayAddress + '/delete-file', undefined, {
      params: {
        file_hash: params.file_hash,
      },
    });
  }

  async getDeletionStatusOfFile(params: {
    gatewayAddress: string;
    file_hash: string;
  }): Promise<{ status: 'pending' | 'completed' }> {
    const resp = await axios.get(params.gatewayAddress + '/get-deletion-status-of-file', {
      params: {
        file_hash: params.file_hash,
      },
    });

    return {
      status: resp.data.status,
    };
  }

  async downloadFile(params: { gatewayAddress: string; file_hash: string }): Promise<any> {
    const resp = await axios.get(params.gatewayAddress + '/download-file', {
      params: {
        file_hash: params.file_hash,
      },
      responseType: 'stream',
    });

    return resp;
  }
}
