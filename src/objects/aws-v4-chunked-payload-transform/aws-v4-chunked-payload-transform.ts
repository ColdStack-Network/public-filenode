import { Transform } from 'stream';
import async from 'async';
import { AuthService } from '../../auth/auth.service';
import crypto from 'crypto';
import { PinoLogger } from 'nestjs-pino';

const errors = {
  InvalidArgument(): Error {
    return new Error('InvalidArgument');
  },
};

interface Params {
  /**
   * User's access key id
   */
  accessKeyId: string;

  /**
   * Signature sent in `Authorization` header
   */
  signatureFromRequest: string;

  scope: {
    credentialsDate: string;
    credentialsRegion: string;
    dateTime: string;
  };
}

export class AWSV4ChunkedPayloadTransform extends Transform {
  private lastSignature: string;
  private currentSignature: string | void = undefined;
  private haveMetadata = false;

  private seekingDataSize = -1;
  private currentData: Buffer = undefined;
  private dataCursor = 0;
  private currentMetadata: Buffer[] = [];
  private lastPieceDone = false;
  private lastChunk = false;
  private clientError = false;

  constructor(
    private params: Params,
    private authService: AuthService,
    private logger: PinoLogger,
    private errorCallback: (err: any) => any,
  ) {
    super({});

    this.lastSignature = params.signatureFromRequest;
  }

  private _parseMetadata(
    remainingChunk: Buffer,
  ):
    | { err: Error; completeMetadata?: void; unparsedChunk?: void }
    | {
        err?: void;
        completeMetadata?: boolean;
        unparsedChunk?: Buffer;
      } {
    let remainingPlusStoredMetadata = remainingChunk;

    if (this.currentMetadata.length > 0) {
      this.currentMetadata.push(remainingChunk);
      remainingPlusStoredMetadata = Buffer.concat(this.currentMetadata);

      this.currentMetadata.length = 0;
    }
    let lineBreakIndex = remainingPlusStoredMetadata.indexOf('\r\n');
    if (lineBreakIndex < 0) {
      this.currentMetadata.push(remainingPlusStoredMetadata);
      return { completeMetadata: false };
    }
    let fullMetadata = remainingPlusStoredMetadata.slice(0, lineBreakIndex);

    if (fullMetadata.length === 0) {
      const chunkWithoutLeadingLineBreak = remainingPlusStoredMetadata.slice(2);

      lineBreakIndex = chunkWithoutLeadingLineBreak.indexOf('\r\n');
      if (lineBreakIndex < 0) {
        this.currentMetadata.push(chunkWithoutLeadingLineBreak);
        return { completeMetadata: false };
      }
      fullMetadata = chunkWithoutLeadingLineBreak.slice(0, lineBreakIndex);
    }

    const splitMeta = fullMetadata.toString().split(';');
    this.logger.trace('parsed full metadata for chunk', { splitMeta });
    if (splitMeta.length !== 2) {
      this.logger.trace('chunk body did not contain correct ' + 'metadata format');
      return { err: errors.InvalidArgument() };
    }
    let dataSize: string | number = splitMeta[0];

    dataSize = Number.parseInt(dataSize, 16);
    if (Number.isNaN(dataSize)) {
      this.logger.trace('chunk body did not contain valid size');
      return { err: errors.InvalidArgument() };
    }
    let chunkSig = splitMeta[1];
    if (!chunkSig || chunkSig.indexOf('chunk-signature=') < 0) {
      this.logger.trace('chunk body did not contain correct sig format');
      return { err: errors.InvalidArgument() };
    }
    chunkSig = chunkSig.replace('chunk-signature=', '');
    this.currentSignature = chunkSig;
    this.haveMetadata = true;
    if (dataSize === 0) {
      this.lastChunk = true;
      return {
        completeMetadata: true,
      };
    }

    this.seekingDataSize = dataSize + 2;
    this.currentData = Buffer.alloc(dataSize);

    return {
      completeMetadata: true,

      unparsedChunk: remainingPlusStoredMetadata.slice(lineBreakIndex + 2),
    };
  }

  private _authenticate(dataToSend: Buffer | null, done: (err?: any) => void): void {
    this.authService
      .authenticateV4Chunk({
        accessKeyId: this.params.accessKeyId,
        credentialsDate: this.params.scope.credentialsDate,
        credentialsRegion: this.params.scope.credentialsRegion,
        dateTime: this.params.scope.dateTime,
        currentChunkDataSha256: crypto
          .createHash('sha256')
          .update(dataToSend || '')
          .digest('hex'),
        previousSignature: this.lastSignature,
        signature: this.currentSignature as string,
      })
      .then(() => {
        done();
      })
      .catch((err) => {
        done(err);
      });

    return;
  }

  _transform(chunk: Buffer, encoding, callback): void {
    if (this.clientError) {
      return callback();
    }
    if (this.lastPieceDone) {
      const slice = chunk.slice(0, 10);
      this.logger.trace('received chunk after end.' + 'See first 10 bytes of chunk', { chunk: slice.toString() });
      return callback();
    }
    let unparsedChunk = chunk;
    let chunkLeftToEvaluate = true;
    return async.whilst(
      () => chunkLeftToEvaluate,

      (done) => {
        if (!this.haveMetadata) {
          this.logger.trace('do not have metadata so calling ' + '_parseMetadata');

          const parsedMetadataResults = this._parseMetadata(unparsedChunk);
          if (parsedMetadataResults.err) {
            return done(parsedMetadataResults.err);
          }

          if (!parsedMetadataResults.completeMetadata) {
            chunkLeftToEvaluate = false;
            return done();
          }

          unparsedChunk = parsedMetadataResults.unparsedChunk;
        }
        if (this.lastChunk) {
          this.logger.trace('authenticating final chunk with no data');
          return this._authenticate(null, (err) => {
            if (err) {
              return done(err);
            }
            chunkLeftToEvaluate = false;
            this.lastPieceDone = true;
            return done();
          });
        }
        if (unparsedChunk.length < this.seekingDataSize) {
          unparsedChunk.copy(this.currentData, this.dataCursor);
          this.dataCursor += unparsedChunk.length;
          this.seekingDataSize -= unparsedChunk.length;
          chunkLeftToEvaluate = false;
          return done();
        }

        const nextDataPiece = unparsedChunk.slice(0, this.seekingDataSize - 2);

        nextDataPiece.copy(this.currentData, this.dataCursor);
        return this._authenticate(this.currentData, (err) => {
          if (err) {
            return done(err);
          }
          unparsedChunk = unparsedChunk.slice(this.seekingDataSize);
          this.push(this.currentData);
          this.haveMetadata = false;
          this.seekingDataSize = -1;
          this.currentData = undefined;
          this.dataCursor = 0;
          chunkLeftToEvaluate = unparsedChunk.length > 0;
          return done();
        });
      },

      (err) => {
        if (err) {
          this.clientError = true;

          this.emit('clientError');
          this.errorCallback(err);
        }

        return callback();
      },
    );
  }
}
