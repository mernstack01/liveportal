import { Global, Module } from '@nestjs/common';
import { FileLinksService } from './file-links.service.js';
import { FilesController } from './files.controller.js';

@Global()
@Module({ controllers: [FilesController], providers: [FileLinksService], exports: [FileLinksService] })
export class FilesModule {}
