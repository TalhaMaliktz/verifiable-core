import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs/promises';

// 1. Interface for PDF parser typing
interface PDFResult {
    text: string;
    numPages?: number;
    info?: any;
}

interface PDFParserInstance {
    getText(): Promise<PDFResult>;
}

interface PDFLibrary {
    PDFParse: new (options: { data: Uint8Array }) => PDFParserInstance;
}

export interface IngestionJobResult {
    status: string;
    chunksGenerated?: number;
}

@Injectable()
export class IngestionService {
    private readonly logger = new Logger(IngestionService.name);

    constructor(
        @InjectQueue('ingestion') private readonly ingestionQueue: Queue,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Orchestrates database record creation and message queue dispatch.
     */
    async queueDocumentIngestion(file: Express.Multer.File) {
        // 1. Create a "PENDING" record in Postgres
        const document = await this.prisma.document.create({
            data: {
                title: file.originalname,
                fileSize: file.size,
            },
        });

        // 2. Add Job to Redis Queue via Claim Check Pattern (O(1) Memory)
        const job = await this.ingestionQueue.add('process-pdf', {
            storagePath: file.path,
            documentId: document.id,
        });

        // 3. Return lightweight references
        return {
            status: 'queued',
            jobId: job.id,
            documentId: document.id,
            message: 'File streamed to disk and job queued for processing.',
        };
    }

    /**
     * Retrieves the processing status and output of an active or completed job.
     */
    async getJobStatus(jobId: string) {
        const job = await this.ingestionQueue.getJob(jobId);

        if (!job) {
            throw new NotFoundException(`Job with ID ${jobId} not found`);
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

    /**
     * Reads a PDF file descriptor directly from disk and extracts raw text.
     */
    async extractTextFromPdf(filePath: string): Promise<string> {
        try {
            const fileBuffer = await fs.readFile(filePath);
            this.logger.log(`Read file from disk: ${filePath} (${fileBuffer.length} bytes)`);

            // Check magic bytes
            const header = fileBuffer.subarray(0, 5).toString('ascii');
            if (!header.startsWith('%PDF-')) {
                throw new Error(`CORRUPTED_FILE: Expected '%PDF-' but got '${header}'`);
            }

            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
            const pdfLibrary = require('pdf-parse') as PDFLibrary;
            const { PDFParse } = pdfLibrary;

            const dataArray = new Uint8Array(fileBuffer);
            const parser: PDFParserInstance = new PDFParse({ data: dataArray });

            const result: PDFResult = await parser.getText();

            if (!result.text) {
                throw new Error('PDF_TEXT_EMPTY');
            }

            this.logger.log(`Successfully parsed PDF. Extracted ${result.text.length} characters.`);
            return result.text;

        } catch (error) {
            this.logger.error(`PDF Extraction Failed for path ${filePath}`, error);
            throw error;
        }
    }
}