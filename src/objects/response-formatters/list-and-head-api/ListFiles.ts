import xml, { XmlObject } from 'xml';

type Arguments = {
  SearchFilesResult: {
    Query: {
      perPage: number;
      page: number;
    };
    Files: Array<{
      Key: string;
      FileType: string;
      Bucket: string;
      FileName: string;
    }>;
  };
};

type JsonResponse = Arguments;

type XmlResponse = XmlObject;

export class ListFilesResponseFormatter {
  private data;

  withProps(data: Arguments): ListFilesResponseFormatter {
    this.data = data;

    return this;
  }

  format(outputFormat: string): XmlResponse | JsonResponse {
    if (outputFormat !== 'json') {
      return xml(this.data, { declaration: true });
    }

    return this.data;
  }
}
