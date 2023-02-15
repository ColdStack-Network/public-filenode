import { EntityRepository, Repository } from 'typeorm';
import { DeletedObjectEntity } from '../entities/deleted-objects.entity';

@EntityRepository(DeletedObjectEntity)
export class DeletedObjectRepository extends Repository<DeletedObjectEntity> {}
