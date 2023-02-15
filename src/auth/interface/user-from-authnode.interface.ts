export interface UserFromAuthnode {
  user: {
    id: string;
    createdAt: string;
    publicKey: string;
  };
  /**
   * Present only if V4 is used
   */
  authDetails: {
    dateTime: string;
    credentialsDate: string;
    credentialsRegion: string;
    signatureFromRequest: string;
  };
  accessKey: {
    id: string;
  };
}
