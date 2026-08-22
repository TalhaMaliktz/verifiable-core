import {
    Controller,
    Post,
    Get,
    Param,
    UseInterceptors,
    UploadedFile,
    ParseFilePipe,
    MaxFileSizeValidator,
    Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestionService } from './ingestion.service';
import { multerDiskConfig } from './config/multer.config';

@Controller('ingestion')
export class IngestionController {
    constructor(private readonly ingestionService: IngestionService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file', multerDiskConfig))
    async uploadDocument(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB limit
                ],
            }),
        )
        file: Express.Multer.File,
        @Body('model') model?: string,
    ) {
        return this.ingestionService.queueDocumentIngestion(file, model);
    }

    @Get('status/:id')
    async getJobStatus(@Param('id') id: string) {
        return this.ingestionService.getJobStatus(id);
    }
}