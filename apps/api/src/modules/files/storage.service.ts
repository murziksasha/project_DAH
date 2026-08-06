import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';

import { assertAllowedUpload } from '../../common/utils/file-magic';
import { buildFileDownloadPath } from '../../common/utils/file-download-token';

export type StorageObject = {
  body: Readable;
  contentType?: string;
  contentLength?: number;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private client!: S3Client;
  private bucket!: string;
  private downloadSecret!: string;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
    this.bucket = this.config.get<string>('S3_BUCKET', 'dah-files');
    this.downloadSecret =
      this.config.get<string>('FILE_DOWNLOAD_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      'dev-only-insecure-file-secret';

    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', 'dah_minio'),
        secretAccessKey: this.config.get<string>(
          'S3_SECRET_KEY',
          'dah_minio_secret_change_me',
        ),
      },
      forcePathStyle: true,
    });
  }

  buildKey(folder: string, originalName: string) {
    const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${folder}/${randomUUID()}/${safe}`;
  }

  async upload(folder: string, file: Express.Multer.File) {
    const { mime } = assertAllowedUpload(file.buffer, file.mimetype);
    const key = this.buildKey(folder, file.originalname);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: mime,
      }),
    );

    return { key, bucket: this.bucket, contentType: mime };
  }

  /**
   * Same-origin signed URL for browser (nginx → API stream).
   * Does not expose MinIO host / :9000 to clients.
   */
  async getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    return buildFileDownloadPath(key, this.downloadSecret, expiresIn);
  }

  async getObject(key: string): Promise<StorageObject> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!res.Body) {
      throw new Error('Empty object body');
    }
    return {
      body: res.Body as Readable,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
    };
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
