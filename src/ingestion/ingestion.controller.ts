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
    FileTypeValidator
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';

// Define the shape of the file manually to satisfy the compiler
interface PdfFile {
    originalname: string;
    buffer: Buffer;
    mimetype: string;
    size: number;
}

// Define what the worker's success result looks like
interface IngestionJobResult {
    status: string;
    processedAt: string;
}

@Controller('ingestion')
export class IngestionController {

    constructor(
        @InjectQueue('ingestion') private readonly ingestionQueue: Queue,
        private readonly prisma: PrismaService
    ) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadDocument(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
                    new FileTypeValidator({ fileType: /pdf/ }),
                ],
            }),
        ) file: PdfFile,
    ) {
        // 1. Create a "PENDING" record in Postgres FIRST
        const document = await this.prisma.document.create({
            data: {
                title: file.originalname,
                fileSize: file.size,
            },
        });

        // 2. Add Job to Queue (Attach the Database ID!)
        const job = await this.ingestionQueue.add('process-pdf', {
            file: file.buffer,
            documentId: document.id, // <--- Tell the worker WHICH document to update
        });

        // 3. Return both the Redis Job ID and Postgres Document ID
        return {
            status: 'queued',
            jobId: job.id,           // The ID in Redis
            documentId: document.id, // The ID in Postgres
            message: 'File accepted for processing. Check status later.'
        };
    }

    @Get('status/:id')
    async getJobStatus(@Param('id') id: string) {
        // 1. Look up the job in Redis by its ID
        const job = await this.ingestionQueue.getJob(id);

        // 2. If the job doesn't exist (e.g., wrong ID or deleted), throw a 404
        if (!job) {
            throw new NotFoundException(`Job with ID ${id} not found`);
        }

        // 3. Get the current state (waiting, active, completed, failed)
        const state = await job.getState();

        // 4. Get the result (what the worker returned) if it's finished
        const result = job.returnvalue as IngestionJobResult | null;

        return {
            jobId: job.id,
            state: state, // e.g., "completed" or "active"
            progress: job.progress,
            result: result,
        };
    }
}