import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { CommonUtilsService } from './common-utils.service';
import { Request, Response } from 'express';
import { UserFromAuthnode } from '../auth/interface/user-from-authnode.interface';
import { defaultErrorDescriptions } from '../errors/errors.service';

/**
 * Отвечает за возвомжности юзера в зависимости от его ресурсов.
 * Например отвечает фронту "хватает ли баланса чтобы аплодить\даунлодить файлы"
 */
@Injectable()
export class UsersAbilitiesService {
  constructor(
    @Inject(forwardRef(() => CommonUtilsService))
    private readonly commonUtilsService: CommonUtilsService,
  ) {}

  async canUserUpload(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    const canUpload = await this.commonUtilsService.hasAtLeast1DollarOrCantConnectToBlockchain(user.user.publicKey);

    response
      .status(200)
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send({ CanUpload: canUpload, Message: canUpload ? null : defaultErrorDescriptions.NotEnoughBalance });
  }

  async canUserDownload(request: Request, response: Response, user: UserFromAuthnode): Promise<void> {
    const canDownload = await this.commonUtilsService.hasAtLeast1DollarOrCantConnectToBlockchain(user.user.publicKey);

    response
      .status(200)
      .header('x-amz-request-id', request.id.toString())
      .header('x-amz-id-2', request.id.toString())
      .header('Server', 'ColdStack')
      .send({ CanDownload: canDownload, Message: canDownload ? null : defaultErrorDescriptions.NotEnoughBalance });
  }
}
