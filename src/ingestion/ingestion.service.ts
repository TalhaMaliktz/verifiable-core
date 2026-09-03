import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

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

    private async computeFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hasher = createHash('sha256');

            const stream = createReadStream(filePath);

            stream.on('data', (chunk: Buffer) => {
                hasher.update(chunk);
            });

            stream.on('end', () => {
                resolve(hasher.digest('hex'));
            });

            stream.on('error', (error) => {
                reject(error);
            });
        });
    }

    async queueDocumentIngestion(file: Express.Multer.File, preferredModel?: string) {
        let fileHash: string;
        try {
            fileHash = await this.computeFileHash(file.path);
        } catch (error) {
            await fs.unlink(file.path).catch(() => null);
            this.logger.error(`Hashing failed for ephemeral file: ${file.path}`, error);
            throw new BadRequestException('Failed to process file stream for verification.');
        }

        const existingDocument = await this.prisma.document.findUnique({
            where: { fileHash },
        });

        if (existingDocument) {
            await fs.unlink(file.path).catch(() => null);

            throw new ConflictException(
                `Duplicate file detected. This document matches existing document ID: ${existingDocument.id}`,
            );
        }

        try {
            const document = await this.prisma.document.create({
                data: {
                    title: file.originalname,
                    fileSize: file.size,
                    fileHash: fileHash,
                },
            });

            const job = await this.ingestionQueue.add('process-document', {
                storagePath: file.path,
                documentId: document.id,
                originalName: file.originalname,
                preferredModel: preferredModel,
            });

            return {
                status: 'queued',
                jobId: job.id,
                documentId: document.id,
                fileHash: fileHash,
                message: 'File streamed to disk, verified, and job queued for processing.',
            };
        } catch (error: any) {
            await fs.unlink(file.path).catch(() => null);

            if (error?.code === 'P2002') {
                throw new ConflictException(
                    'Concurrent upload conflict: identical document was just registered by another request.',
                );
            }

            throw error;
        }
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
        const sanitized = content.replace(/\0/g, '').trim();

        if (!sanitized) {
            throw new BadRequestException('The uploaded text file is empty.');
        }

        this.logger.log(`Successfully read plaintext/markdown. Extracted ${sanitized.length} characters.`);
        return sanitized;
    }

    private async extractFromDocx(filePath: string): Promise<string> {
        try {
            const result = await mammoth.extractRawText({ path: filePath });
            const extractedText = result.value.replace(/\0/g, '').trim();

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

            const dataArray = new Uint8Array(fileBuffer);
            const parser = new PDFParse({ data: dataArray });
            const result = await parser.getText();

            // Strip null bytes (\0) to safeguard PostgreSQL UTF-8 ingestion
            const sanitized = (result.text || '').replace(/\0/g, '').trim();

            if (!sanitized) {
                throw new BadRequestException('The uploaded PDF contains no extractable text.');
            }

            this.logger.log(`Successfully parsed PDF. Extracted ${sanitized.length} characters.`);
            return sanitized;
        } catch (error) {
            this.logger.error(`PDF extraction failed for path ${filePath}`, error);
            throw error;
        }
    }
}