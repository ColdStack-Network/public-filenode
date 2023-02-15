import prettyBytes from 'pretty-bytes';

interface IArguments {
  allPoints: Record<string, any>;
  valuePoints: Array<any>;
}

type JsonResponse = {
  StorageUsageAnalytics: {
    Records: Array<{
      Timestamp: string;
      UsedStorage: string;
      UsedStorageReadable: string;
    }>;
  };
};

type XmlResponse = string;

export class StorageAnalyticsResponseFormatter {
  private allPoints;
  private valuePoints;

  withProps({ allPoints, valuePoints }: IArguments): StorageAnalyticsResponseFormatter {
    this.allPoints = allPoints;
    this.valuePoints = valuePoints;

    return this;
  }

  format(outputFormat: string): XmlResponse | JsonResponse {
    const results = this.allPoints;
    const analytics = this.valuePoints;

    if (outputFormat === 'json') {
      const resp = Object.keys(results).map((key) => {
        const rec = results[key];

        return {
          Timestamp: rec.Timestamp,
          UsedStorage: rec.UsedStorage.toString(),
          UsedStorageReadable: prettyBytes(parseInt(rec.UsedStorageReadable)),
        };
      });

      return {
        StorageUsageAnalytics: {
          Records: resp,
        },
      };
    } else {
      let result = `<?xml version="1.0" encoding="UTF-8"?><StorageUsageAnalytics>`;

      analytics.forEach((row) => {
        result +=
          `<Records><Timestamp>` +
          row.createdAt +
          `</Timestamp><UsedStorage>` +
          row.sizeSum +
          `</UsedStorage><UsedStorageReadable>` +
          prettyBytes(parseInt(row.sizeSum)) +
          `</UsedStorageReadable></Records>`;
      });

      result += `</StorageUsageAnalytics>`;

      return result;
    }
  }
}
