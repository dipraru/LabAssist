import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface StoredFile {
  url: string; // public URL path e.g. /uploads/submissions/abc.cpp
  filePath: string; // absolute disk path
  fileName: string; // original name
  size: number;
}

@Injectable()
export class StorageService {
  private readonly uploadRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadRoot = join(
      process.cwd(),
      config.get<string>('UPLOAD_DEST') ?? 'uploads',
    );
    this.ensureDir(this.uploadRoot);
    this.ensureDir(join(this.uploadRoot, 'profiles'));
    this.ensureDir(join(this.uploadRoot, 'submissions'));
    this.ensureDir(join(this.uploadRoot, 'assignments'));
    this.ensureDir(join(this.uploadRoot, 'problems'));
  }

  private ensureDir(path: string) {
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }

  /**
   * Save a multer buffer to a sub-folder and return url + disk path.
   * folder: 'profiles' | 'submissions' | 'assignments' | 'problems'
   */
  async saveBuffer(
    buffer: Buffer,
    originalName: string,
    folder: string,
    maxBytes: number,
  ): Promise<StoredFile> {
    if (buffer.length > maxBytes) {
      throw new Error(
        `File too large. Max allowed: ${Math.round(maxBytes / 1024)} KB`,
      );
    }
    const ext = extname(originalName);
    const uniqueName = `${uuidv4()}${ext}`;
    const dir = join(this.uploadRoot, folder);
    this.ensureDir(dir);
    const absolutePath = join(dir, uniqueName);
    const { writeFileSync } = await import('fs');
    writeFileSync(absolutePath, buffer);
    return {
      url: `/uploads/${folder}/${uniqueName}`,
      filePath: absolutePath,
      fileName: originalName,
      size: buffer.length,
    };
  }

  deleteFile(filePath: string) {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch {
      // ignore
    }
  }

  resolvePublicUrlToPath(fileUrl: string): string {
    const normalizedUrl = `${fileUrl ?? ''}`.trim();
    if (!normalizedUrl.startsWith('/uploads/')) {
      throw new Error('Unsupported file URL');
    }
    const relativePath = normalizedUrl.replace(/^\/uploads\//, '');
    return join(this.uploadRoot, relativePath);
  }

  readTextFileByUrl(fileUrl: string): string {
    const absolutePath = this.resolvePublicUrlToPath(fileUrl);
    return readFileSync(absolutePath, 'utf8');
  }
}
