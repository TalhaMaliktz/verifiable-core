import {
    Controller,
    Post,
    Get,
    Param,
    NotFoundException,
    UseInterceptors,
    UploadedFile,
    ParseFilePipe,
    MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { multerDiskConfig } from './config/multer.config';

interface IngestionJobResult {
    status: string;
    processedAt: string;
}

@Controller('ingestion')
export class IngestionController {

    constructor(
        @InjectQueue('ingestion') private readonly ingestionQueue: Queue,
        private readonly prisma: PrismaService,
    ) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file', multerDiskConfig))
    async uploadDocument(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
                ],
            }),
        ) file: Express.Multer.File,
    ) {
        // 1. Create PENDING record in Postgres
        const document = await this.prisma.document.create({
            data: {
                title: file.originalname,
                fileSize: file.size,
            },
        });

        // 2. Add Job to Queue via Claim Check Pattern (O(1) Memory)
        const job = await this.ingestionQueue.add('process-pdf', {
            storagePath: file.path,
            documentId: document.id,
        });

        // 3. Return IDs
        return {
            status: 'queued',
            jobId: job.id,
            documentId: document.id,
            message: 'File streamed to disk and job queued for processing.',
        };
    }

    @Get('status/:id')
    async getJobStatus(@Param('id') id: string) {
        const job = await this.ingestionQueue.getJob(id);

        if (!job) {
            throw new NotFoundException(`Job with ID ${id} not found`);
        }

        const state = await job.getState();
        const result = job.returnvalue as IngestionJobResult | null;

        return {
            jobId: job.id,
            state: state,
            progress: job.progress,
            result: result,
        };
    }
}