import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class StorageService implements OnModuleInit {
  private client!: S3Client;
  private bucket!: string;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
    this.bucket = this.config.get<string>('S3_BUCKET', 'dah-files');

    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', 'dah_minio'),
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY', 'dah_minio_secret_change_me'),
      },
      forcePathStyle: true,
    });
  }

  assertAllowedMime(mime: string) {
    if (!ALLOWED_MIME.has(mime)) {
      throw new Error('Дозволені формати: PDF, JPEG, PNG, WebP');
    }
  }

  buildKey(folder: string, originalName: string) {
    const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${folder}/${randomUUID()}/${safe}`;
  }

  async upload(folder: string, file: Express.Multer.File) {
    this.assertAllowedMime(file.mimetype);
    const key = this.buildKey(folder, file.originalname);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return { key, bucket: this.bucket };
  }

  async getDownloadUrl(key: string, expiresIn = 3600) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}