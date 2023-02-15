import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import { BucketRepository } from './repositories/bucket.repository';
import { ObjectRepository } from './repositories/object.repository';
import { Request, Response } from 'express';
import { Injectable } from '@nestjs/common';
import prettyBytes from 'pretty-bytes';
import { BandwidthUsageRepository } from './repositories/bandwidth-usage.repository';
import moment from 'moment';
import { StorageUsageRepository } from './repositories/storage-usage.repository';
import { v4 as uuidv4 } from 'uuid';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { StorageAnalyticsResponseFormatter } from './response-formatters/statistics/StorageAnalytics';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly bucketRepo: BucketRepository,
    private readonly objectRepo: ObjectRepository,
    private readonly bandwidthUsageRepo: BandwidthUsageRepository,
    private readonly storageUsageRepo: StorageUsageRepository,
    @InjectPinoLogger(StatisticsService.name)
    private readonly logger: PinoLogger,
    private readonly storageAnalyticsResponseFormatter: StorageAnalyticsResponseFormatter,
  ) {}

  /**
   * TODO: calculate Arrow
   */
  async getStatistics(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    const buckets = await this.bucketRepo.getByOwnerPublicKey(user.user.publicKey);

    const bucketsNames = buckets.map((b) => b.name);

    const objectsCount = await this.objectRepo.getOverallObjectsCountInBuckets(bucketsNames, true);

    const objectsSizeSum = await this.objectRepo.getObjectsSizeSumInObjects(bucketsNames);

    const bandwidthUsage = await this.bandwidthUsageRepo.getBandwidthUsageOfUser(user.user.publicKey);

    const prettyStorageUsage = this.prettyBytes(objectsSizeSum);

    const prettyBandwidthUsage = this.prettyBytes(bandwidthUsage);

    if (request.query.format === 'json') {
      const result = {
        Statistics: {
          Buckets: {
            Count: buckets.length,
            Arrow: 'up',
          },
          Objects: {
            Count: objectsCount,
            Arrow: 'up',
          },
          UsedStorage: {
            UsedStorageBytes: objectsSizeSum,
            UsedStorageReadableQuantity: prettyStorageUsage.quantity,
            UsedStorageReadableUnit: prettyStorageUsage.unit,
            Arrow: 'up',
          },
          Bandwidth: {
            BandwidthBytes: bandwidthUsage,
            BandwidthReadableQuantity: prettyBandwidthUsage.quantity,
            BandwidthReadableUnit: prettyBandwidthUsage.unit,
            Arrow: 'up',
          },
        },
      };

      response.status(200).send(result);
    } else {
      const result =
        `<?xml version="1.0" encoding="UTF-8"?><Statistics><Buckets><Count>` +
        buckets.length +
        `</Count><Arrow>up</Arrow></Buckets></BucketsCount><Objects><Count>` +
        objectsCount +
        '</Count><Arrow>up</Arrow></Objects><UsedStorage><UsedStorageBytes>' +
        objectsSizeSum +
        `</UsedStorageBytes><UsedStorageReadableQuantity>` +
        prettyStorageUsage.quantity +
        `</UsedStorageReadableQuantity><UsedStorageReadableUnit>` +
        prettyStorageUsage.unit +
        `</UsedStorageReadableUnit><Arrow>up</Arrow></UsedStorage><Bandwidth><BandwidthBytes>` +
        bandwidthUsage +
        `</BandwidthBytes><BandwidthReadableQuantity>` +
        prettyBandwidthUsage.quantity +
        `</BandwidthReadableQuantity><BandwidthReadableUnit>` +
        prettyBandwidthUsage.unit +
        `</BandwidthReadableUnit><Arrow>up</Arrow></Bandwidth></Statistics>`;

      response.status(200).header('content-type', 'application/xml').send(result);
    }
  }

  async getBandwidthAnalytics(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    const availableBandwidthRecords = await this.bandwidthUsageRepo.aggregateByDays({
      userPublicKey: user.user.publicKey,
      fromDate: request.query.fromDate ? new Date(request.query.fromDate as any) : null,
      toDate: request.query.toDate ? new Date(request.query.toDate as any) : null,
    });

    const analytics = this.addDaysWithZeroBandwidth(availableBandwidthRecords, {
      fromDate: request.query.fromDate,
      toDate: request.query.toDate,
      userCreationDate: new Date(user.user.createdAt),
    });

    if (request.query.format === 'json') {
      const result = {
        BandwidthAnalytics: {
          Records: analytics.map((row) => ({
            Date: row.date,
            DownloadBandwidth: row.download,
            DownloadBandwidthReadable: prettyBytes(parseInt(row.download)),
            UploadBandwidth: row.upload,
            UploadBandwidthReadable: prettyBytes(parseInt(row.upload)),
          })),
        },
      };

      response.status(200).send(result);
    } else {
      let result = `<?xml version="1.0" encoding="UTF-8"?><BandwidthAnalytics>`;

      analytics.forEach((row) => {
        result +=
          `<Records><Date>` +
          row.date +
          `</Date><DownloadBandwidth>` +
          row.download +
          `</DownloadBandwidth><DownloadBandwidthReadable>` +
          prettyBytes(parseInt(row.download)) +
          `</DownloadBandwidthReadable><UploadBandwidth>` +
          row.upload +
          `</UploadBandwidth><DownloadBandwidthReadable>` +
          prettyBytes(parseInt(row.download)) +
          `</DownloadBandwidthReadable></Records>`;
      });

      result += `</BandwidthAnalytics>`;

      response.status(200).header('content-type', 'application/xml').send(result);
    }
  }

  addDaysWithZeroBandwidth(
    availableBandwidthRecords: { date: string; upload: string; download: string }[],
    params: { fromDate?: any; toDate?: any; userCreationDate: Date },
  ): { date: string; upload: string; download: string }[] {
    const fromDate =
      params.fromDate && moment(params.fromDate).isValid() ? moment(params.fromDate) : moment(params.userCreationDate);
    const toDate =
      params.toDate && moment(params.toDate).isValid()
        ? moment(params.toDate)
        : availableBandwidthRecords.length
        ? moment(availableBandwidthRecords[availableBandwidthRecords.length - 1].date)
        : fromDate;

    const dateToBandwidthRecord: Record<string, { date: string; download: string; upload: string }> | null = {};
    let currentDate = fromDate.clone();
    while (currentDate <= toDate) {
      dateToBandwidthRecord[currentDate.format('YYYY-MM-DD')] = null;
      currentDate = currentDate.add(1, 'day');
    }

    availableBandwidthRecords.forEach((record) => {
      dateToBandwidthRecord[record.date] = record;
    });

    const bandwidthRecordsWithZeroDates: { date: string; download: string; upload: string }[] = [];

    Object.keys(dateToBandwidthRecord)
      .map((date) => new Date(date))
      .sort((a, b) => a.valueOf() - b.valueOf())
      .forEach((date) => {
        const dateFormated = moment(date).format('YYYY-MM-DD');
        const existingRecord = dateToBandwidthRecord[dateFormated];

        bandwidthRecordsWithZeroDates.push(existingRecord || { date: dateFormated, upload: '0', download: '0' });
      });

    return bandwidthRecordsWithZeroDates;
  }

  async getStorageAnalytics(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    const results = {};
    const analytics = await this.storageUsageRepo.aggregateStorageUsageAnalyticsForUser({
      userPublicKey: user.user.publicKey,
      fromDate: request.query.fromDate ? new Date(request.query.fromDate as any) : null,
      toDate: request.query.toDate ? new Date(request.query.toDate as any) : null,
    });

    const fromDate = request.query.fromDate
      ? new Date(request.query.fromDate as any)
      : new Date(analytics[0] ? analytics[0].createdAt : Date.now() - 86400000);
    const toDate = request.query.toDate
      ? new Date(request.query.toDate as any)
      : new Date(analytics[analytics.length - 1] ? analytics[analytics.length - 1].createdAt : Date.now());

    while (fromDate <= toDate) {
      results[fromDate.getFullYear() + '-' + fromDate.getMonth() + '-' + fromDate.getDate()] = {
        Timestamp: fromDate.toISOString(),
        UsedStorage: '0',
        UsedStorageReadable: prettyBytes(0),
      };
      fromDate.setDate(fromDate.getDate() + 1);
    }

    analytics.forEach((record) => {
      const newDate = new Date(record.createdAt);
      const key = newDate.getFullYear() + '-' + newDate.getMonth() + '-' + newDate.getDate();
      if (results[key]) {
        if (results[key].UsedStorage !== '0' || results[key].UsedStorageReadable !== '0') {
          results[key].UsedStorage = parseInt(results[key].UsedStorage) + parseInt(record.sizeSum);
          results[key].UsedStorageReadable = parseInt(record.sizeSum) + parseInt(results[key].UsedStorageReadable);
        } else {
          results[key] = {
            Timestamp: newDate.toISOString(),
            UsedStorage: record.sizeSum,
            UsedStorageReadable: parseInt(record.sizeSum),
          };
        }
      }
    });

    const keys = Object.keys(results);

    Object.keys(results).forEach((key: string, i: number) => {
      const rec = results[key];

      if (i && !parseInt(rec.UsedStorage) && parseInt(results[keys[i - 1]].UsedStorage)) {
        rec.UsedStorage = results[keys[i - 1]].UsedStorage;
        rec.UsedStorageReadable = results[keys[i - 1]].UsedStorageReadable;
      }
    });

    const outputFormat = <string>request.query.format || 'xml';

    const resp = this.storageAnalyticsResponseFormatter
      .withProps({
        allPoints: results,
        valuePoints: analytics,
      })
      .format(outputFormat);

    if (outputFormat === 'json') {
      response
        .status(200)
        .header('x-amz-request-id', request.id.toString())
        .header('x-amz-id-2', request.id.toString())
        .header('Server', 'ColdStack')
        .send(resp);
    } else {
      response
        .status(200)
        .header('x-amz-request-id', request.id.toString())
        .header('x-amz-id-2', request.id.toString())
        .header('Server', 'ColdStack')
        .header('content-type', 'application/xml')
        .send(resp);
    }
  }

  private prettyBytes(bytes: string | number): { quantity: string; unit: string } {
    const readableStorageUsage = prettyBytes(parseInt(bytes ? (bytes as string) : '0'));

    return {
      quantity: readableStorageUsage.split(' ')[0],
      unit: readableStorageUsage.split(' ')[1],
    };
  }

  public async updateBucketStorageStatistics(bucketName: string): Promise<void> {
    try {
      const bucket = await this.bucketRepo.findByNameOrFail(bucketName);
      const bucketSize = await this.objectRepo.getBucketSize(bucketName);

      const date = moment();

      const startOfHour = date.minutes(0).seconds(0).milliseconds(0);

      const existingRecord = await this.storageUsageRepo.findOne({
        where: { bucketId: bucket.id, createdAt: startOfHour },
      });

      this.logger.info(
        `updateBucketStorageStatistics: existingRecord: %o, startOfHour: %s`,
        existingRecord,
        startOfHour.toISOString(),
      );

      if (existingRecord) {
        existingRecord.size = bucketSize;
        await this.storageUsageRepo.save(existingRecord);
      } else {
        await this.storageUsageRepo.save({
          id: uuidv4(),
          createdAt: startOfHour,
          bucketId: bucket.id,
          userPublicKey: bucket.ownerPublicKey.toLowerCase(),
          size: bucketSize,
        });
      }
    } catch (err) {
      this.logger.error({ err, function: 'updateBucketStorageStatistics' });
    }
  }

  public async reportBandwidthUsage(params: {
    bucketName: string;
    size: string;
    type: 'download' | 'upload';
    info: Record<string, any>;
  }): Promise<void> {
    const bucket = await this.bucketRepo.findByNameOrFail(params.bucketName);

    await this.bandwidthUsageRepo.save({
      id: uuidv4(),
      createdAt: new Date(),
      bucketId: bucket.id,
      userPublicKey: bucket.ownerPublicKey.toLowerCase(),
      size: params.size.toString(),
      type: 'download',
      info: params.info,
    });
  }
}
