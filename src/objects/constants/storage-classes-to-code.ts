/**
 * Storage classes marked as null are not supported.
 */
export const storageClassesToCode = {
  STANDARD: 0,
  REDUCED_REDUNDANCY: null,
  STANDARD_IA: 2,
  ONEZONE_IA: null,
  INTELLIGENT_TIERING: 1,
  GLACIER: 4,
  DEEP_ARCHIVE: 5,
  OUTPOSTS: null,
  GLACIER_IR: 3,
};
