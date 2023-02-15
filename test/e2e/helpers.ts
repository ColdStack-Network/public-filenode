import AWS, { AWSError } from 'aws-sdk';

// Это то же самое что и headBucket, только удобнее. Не нужно самому писать try catch.
// Если бакет существует и есть к нему доступ то ответ будет null, иначе ошибка о том что бакета нету, либо доступов нету, либо еще что.
export async function getErrorIfAnyWhenAccessingBucket(s3: AWS.S3, bucketName: string): Promise<AWSError | null> {
  try {
    await s3
      .headBucket({
        Bucket: bucketName,
      })
      .promise();
    return null;
  } catch (err) {
    return err;
  }
}

export async function doesObjectExists(s3: AWS.S3, bucketName: string, key: string): Promise<boolean> {
  try {
    await s3
      .headObject({
        Bucket: bucketName,
        Key: key,
      })
      .promise();
    return true;
  } catch (err) {
    return false;
  }
}
