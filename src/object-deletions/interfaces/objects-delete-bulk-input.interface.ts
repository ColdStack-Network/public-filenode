import { ObjectForBulkDeletion } from './object-for-bulk-deletion.interface';

export interface ObjectsDeleteBulkInput {
  Quiet: boolean;
  Object: ObjectForBulkDeletion[];
}
