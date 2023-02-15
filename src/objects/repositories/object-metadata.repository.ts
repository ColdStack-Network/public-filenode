import _ from 'lodash';
import { EntityRepository, In, Not, Repository } from 'typeorm';
import { ObjectMetadataEntity } from '../entities/object-metadata.entity';

@EntityRepository(ObjectMetadataEntity)
export class ObjectMetadataRepository extends Repository<ObjectMetadataEntity> {
  public getMetadatasOfObject(objectId: string): Promise<ObjectMetadataEntity[]> {
    return this.find({ where: { objectId } });
  }

  public async deleteAllMetadatasOfObject(objectId: string, exceptKeys?: string[]): Promise<void> {
    await this.delete({
      objectId,
      ...(exceptKeys ? { key: Not(In(exceptKeys)) } : {}),
    });
  }

  public async updateMetadatasOfObject(objectId: string, metadatasDict: Record<string, string>): Promise<void> {
    await Promise.all(
      _.entries(metadatasDict).map(async ([key, value]) => {
        await this.delete({
          objectId,
          key,
        });

        await this.save(
          new ObjectMetadataEntity({
            createdAt: new Date(),
            key,
            value,
            objectId,
          }),
        );
      }),
    );
  }
}
