import { Injectable, Logger } from '@nestjs/common';

// 1. Define the shape of the library (since v2.4.5 doesn't have @types yet)
interface PDFResult {
    text: string;
    numPages?: number;
    info?: any;
}

interface PDFParserInstance {
    getText(): Promise<PDFResult>;
}

// The library exports an object containing the PDFParse constructor
interface PDFLibrary {
    PDFParse: new (options: { data: Uint8Array }) => PDFParserInstance;
}

@Injectable()
export class IngestionService {
    private readonly logger = new Logger(IngestionService.name);

    async extractTextFromPdf(buffer: Buffer): Promise<string> {
        try {
            this.logger.log(`Received buffer size: ${buffer.length} bytes`);

            // 1. DATA GUARD
            const header = buffer.subarray(0, 5).toString('ascii');
            if (!header.startsWith('%PDF-')) {
                throw new Error(`CORRUPTED_FILE: Expected '%PDF-' but got '${header}'`);
            }

            // 2. Import & Cast (The only "unsafe" line, strictly controlled)
            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
            const pdfLibrary = require('pdf-parse') as PDFLibrary;

            const { PDFParse } = pdfLibrary;

            // 3. Strongly Typed Implementation
            const dataArray = new Uint8Array(buffer);
            const parser: PDFParserInstance = new PDFParse({ data: dataArray });

            // The result is now known to be PDFResult, not 'any'
            const result: PDFResult = await parser.getText();

            if (!result.text) {
                throw new Error('PDF_TEXT_EMPTY');
            }

            this.logger.log(`Successfully parsed PDF. Length: ${result.text.length}`);

            // Safe access because 'text' is defined in the interface
            return result.text;

        } catch (error) {
            this.logger.error('PDF Extraction Failed', error);
            throw error;
        }
    }
}