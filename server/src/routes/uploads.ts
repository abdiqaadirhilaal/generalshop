import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { asyncHandler, sendSuccess, ApiError } from '../utils/http.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { env } from '../config/env.js';

const router = Router();

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED.has(file.mimetype)) {
      callback(new Error('Only JPG, PNG, WEBP, AVIF or GIF images are allowed'));
      return;
    }
    callback(null, true);
  },
});

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
};

router.post(
  '/image',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No image uploaded');

    if (env.cloudinaryEnabled) {
      const { v2: cloudinary } = await import('cloudinary');
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: true,
      });

      const result = await new Promise<{ secure_url: string; public_id: string }>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'hilaal/products',
              resource_type: 'image',
              transformation: [{ width: 1400, height: 1400, crop: 'limit', quality: 'auto' }],
            },
            (error, uploaded) => {
              if (error || !uploaded) reject(error ?? new Error('Upload failed'));
              else resolve(uploaded as { secure_url: string; public_id: string });
            }
          );
          stream.end(req.file!.buffer);
        }
      );

      sendSuccess(res, { url: result.secure_url, publicId: result.public_id }, 201);
      return;
    }

    if (env.isProd) {
      throw ApiError.badRequest(
        'Image hosting is not configured. Add Cloudinary credentials to enable uploads in production.'
      );
    }

    const extension = EXTENSIONS[req.file.mimetype] ?? '.jpg';
    const filename = `${randomUUID()}${extension}`;
    const directory = path.resolve(process.cwd(), 'uploads');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), req.file.buffer);

    sendSuccess(res, { url: `/uploads/${filename}`, publicId: filename }, 201);
  })
);

export default router;
