import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = './ephemeral-uploads';

// Ensure the directory exists before streaming writes begin
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
        fileSize: 10 * 1024 * 1024, // 10MB physical stream cutoff
    },
};