declare module 'pdf-parse' {
    export interface PDFResult {
        text: string;
        numPages?: number;
        info?: any;
    }

    export interface PDFParserInstance {
        getText(): Promise<PDFResult>;
    }

    export class PDFParse {
        constructor(options: { data: Uint8Array | Buffer });
        getText(): Promise<PDFResult>;
    }
}