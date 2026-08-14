import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';

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

@Injectable()
export class IngestionService {
    private readonly logger = new Logger(IngestionService.name);

    async extractTextFromPdf(filePath: string): Promise<string> {
        try {
            // 1. Read file from disk into typed array for the parser
            const fileBuffer = await fs.readFile(filePath);
            this.logger.log(`Read file from disk: ${filePath} (${fileBuffer.length} bytes)`);

            // 2. DATA GUARD: Check magic bytes
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