/**
 * Storage classes marked as null are not supported.
 */
export const storageClassesToReadable: Record<string, string> = {
  STANDARD: 'Standard',
  REDUCED_REDUNDANCY: 'Reduced Redundancy',
  STANDARD_IA: 'Standard-IA',
  ONEZONE_IA: 'One Zone-IA',
  INTELLIGENT_TIERING: 'Intelligent-Tiering',
  GLACIER: 'Glacier Flexible Retrieval',
  DEEP_ARCHIVE: 'Glacier Deep Archive',
  OUTPOSTS: 'Outposts',
  GLACIER_IR: 'Glacier Instant Retrieval',
};
