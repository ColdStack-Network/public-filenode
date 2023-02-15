import { Injectable } from '@nestjs/common';
import { ObjectsBulkDeletionError } from './interfaces/objects-bulk-deletion-error.interface';
import xml from 'xml';

@Injectable()
export class DeleteObjectResponseFormatter {
  formatResponseOfDeleteObjectsBulk(params: {
    quiet: boolean;
    successfullyDeletedKeys: string[];
    deleteErrors: ObjectsBulkDeletionError[];
  }): string {
    const xmlResult = xml(
      [
        {
          DeleteResult: [
            { _attr: { xmlns: 'http://s3.amazonaws.com/doc/2006-03-01/' } },

            ...(!params.quiet
              ? params.successfullyDeletedKeys.map((deletedKey) => ({
                  Deleted: [{ Key: deletedKey }],
                }))
              : []),

            ...params.deleteErrors.map((deleteError) => ({
              Error: [
                { Key: deleteError.Key },
                { Code: deleteError.Code },
                { Message: deleteError.Message },
                // VersionId will always be undefined or null until Versioned Buckets are implemented
                deleteError.VersionId ? { VersionId: deleteError.VersionId } : {},
              ],
            })),
          ],
        },
      ],
      {
        declaration: true,
      },
    );

    return xmlResult;
  }
}
