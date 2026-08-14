import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';

const UPLOAD_DIR = './ephemeral-uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const multerDiskConfig = {
    storage: diskStorage({
        destination: (req, file, callback) => {
            callback(null, UPLOAD_DIR);
        },
        filename: (req, file, callback) => {
            const fileExt = extname(file.originalname);
            const uniqueName = `${randomUUID()}${fileExt}`;
            callback(null, uniqueName);
        },
    }),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req: any, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => {
        if (file.mimetype !== 'application/pdf') {
            return callback(
                new BadRequestException('Invalid file type. Only PDF files are allowed.'),
                false,
            );
        }
        callback(null, true);
    },
};