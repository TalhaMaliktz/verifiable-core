import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';

const UPLOAD_DIR = './ephemeral-uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.docx']);

export const multerDiskConfig = {
    storage: diskStorage({
        destination: (req, file, callback) => {
            callback(null, UPLOAD_DIR);
        },
        filename: (req, file, callback) => {
            const fileExt = extname(file.originalname).toLowerCase();
            const uniqueName = `${randomUUID()}${fileExt}`;
            callback(null, uniqueName);
        },
    }),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (
        req: any,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void,
    ) => {
        const fileExt = extname(file.originalname).toLowerCase();
        const isValidExtension = ALLOWED_EXTENSIONS.has(fileExt);
        const isValidMimeType = ALLOWED_MIME_TYPES.has(file.mimetype);

        if (!isValidExtension || !isValidMimeType) {
            return callback(
                new BadRequestException(
                    `Unsupported file type. Allowed extensions: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`,
                ),
                false,
            );
        }

        callback(null, true);
    },
};