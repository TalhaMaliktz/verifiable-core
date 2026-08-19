import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs/promises';
import { extname } from 'path';
import * as mammoth from 'mammoth';

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

    async queueDocumentIngestion(file: Express.Multer.File) {
        const document = await this.prisma.document.create({
            data: {
                title: file.originalname,
                fileSize: file.size,
            },
        });

        const job = await this.ingestionQueue.add('process-document', {
            storagePath: file.path,
            documentId: document.id,
            originalName: file.originalname,
        });

        return {
            status: 'queued',
            jobId: job.id,
            documentId: document.id,
            message: 'File streamed to disk and job queued for processing.',
        };
    }

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
     * Top-level format router. Delegates to specialized extractors based on file extension.
     */
    async extractText(filePath: string): Promise<string> {
        const extension = extname(filePath).toLowerCase();
        this.logger.log(`Routing extraction for file: ${filePath} (extension: ${extension})`);

        switch (extension) {
            case '.pdf':
                return this.extractFromPdf(filePath);
            case '.docx':
                return this.extractFromDocx(filePath);
            case '.txt':
            case '.md':
                return this.extractFromPlainText(filePath);
            default:
                throw new BadRequestException(`Unsupported file extension for extraction: ${extension}`);
        }
    }

    private async extractFromPlainText(filePath: string): Promise<string> {
        const content = await fs.readFile(filePath, 'utf-8');
        const trimmed = content.trim();

        if (!trimmed) {
            throw new BadRequestException('The uploaded text file is empty.');
        }

        this.logger.log(`Successfully read plaintext/markdown. Extracted ${trimmed.length} characters.`);
        return trimmed;
    }

    private async extractFromDocx(filePath: string): Promise<string> {
        try {
            const result = await mammoth.extractRawText({ path: filePath });
            const extractedText = result.value.trim();

            if (!extractedText) {
                throw new BadRequestException('The uploaded DOCX file contains no readable text.');
            }

            this.logger.log(`Successfully parsed DOCX. Extracted ${extractedText.length} characters.`);
            return extractedText;
        } catch (error) {
            this.logger.error(`DOCX extraction failed for path ${filePath}`, error);
            throw error;
        }
    }

    private async extractFromPdf(filePath: string): Promise<string> {
        try {
            const fileBuffer = await fs.readFile(filePath);

            // Magic byte verification for PDF (%PDF-)
            const header = fileBuffer.subarray(0, 5).toString('ascii');
            if (!header.startsWith('%PDF-')) {
                throw new BadRequestException(`CORRUPTED_FILE: Expected '%PDF-' header but received '${header}'`);
            }

            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
            const pdfLibrary = require('pdf-parse') as PDFLibrary;
            const { PDFParse } = pdfLibrary;

            const dataArray = new Uint8Array(fileBuffer);
            const parser: PDFParserInstance = new PDFParse({ data: dataArray });
            const result: PDFResult = await parser.getText();

            if (!result.text || !result.text.trim()) {
                throw new BadRequestException('The uploaded PDF contains no extractable text.');
            }

            this.logger.log(`Successfully parsed PDF. Extracted ${result.text.length} characters.`);
            return result.text;
        } catch (error) {
            this.logger.error(`PDF extraction failed for path ${filePath}`, error);
            throw error;
        }
    }
}