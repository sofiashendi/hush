import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import https from 'https';
import { createLogger } from './logger';

const log = createLogger('Models');

export type ModelType = 'base' | 'small' | 'large-v3-turbo';

// Multilingual Quantized Models (q5_1 for best size/quality balance)
const MODELS: Record<ModelType, { filename: string; url: string; size: number }> = {
  base: {
    filename: 'ggml-base-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    size: 62606336, // ~60MB (Multilingual, Quantized q5_1)
  },
  small: {
    filename: 'ggml-small-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    size: 199238656, // ~190MB (Multilingual, Quantized q5_1)
  },
  'large-v3-turbo': {
    filename: 'ggml-large-v3-turbo-q5_0.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    size: 574443520, // ~550MB (Multilingual, Quantized q5_0)
  },
};

export class ModelManager {
  private userDataPath: string;
  private resourcesPath: string;

  constructor() {
    this.userDataPath = path.join(app.getPath('userData'), 'models');
    // internal resource path (bundled)
    this.resourcesPath = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, '../resources');

    if (!fs.existsSync(this.userDataPath)) {
      fs.mkdirSync(this.userDataPath, { recursive: true });
    }
  }

  getModelPath(type: ModelType): string | null {
    const config = MODELS[type];

    // 1. Check bundled resources first (only for base usually, but generic here)
    const bundledPath = path.join(this.resourcesPath, config.filename);
    if (fs.existsSync(bundledPath)) {
      log.info('Found bundled model', { path: bundledPath });
      return bundledPath;
    }

    // 2. Check userData download cache
    const cachedPath = path.join(this.userDataPath, config.filename);
    if (fs.existsSync(cachedPath)) {
      log.info('Found cached model', { path: cachedPath });
      return cachedPath;
    }

    return null;
  }

  async downloadModel(type: ModelType, onProgress?: (percent: number) => void): Promise<string> {
    const config = MODELS[type];
    const destPath = path.join(this.userDataPath, config.filename);

    // Helper for async cleanup without blocking
    const cleanupDestFile = () => {
      fs.promises.rm(destPath, { force: true }).catch((err) => {
        log.warn('Cleanup warning', { message: err.message });
      });
    };

    const downloadWithRedirects = (url: string, redirectCount = 0): Promise<string> => {
      const MAX_REDIRECTS = 10;
      if (redirectCount >= MAX_REDIRECTS) {
        return Promise.reject(new Error('Exceeded maximum number of redirects'));
      }

      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);

        https
          .get(url, (response) => {
            // Handle redirects (301, 302, 303, 307, 308)
            if (
              response.statusCode &&
              response.statusCode >= 300 &&
              response.statusCode < 400 &&
              response.headers.location
            ) {
              file.destroy();
              // Don't cleanup - the recursive call will create a new file
              log.info('Following redirect', { location: response.headers.location });
              return resolve(downloadWithRedirects(response.headers.location, redirectCount + 1));
            }

            if (response.statusCode !== 200) {
              file.destroy();
              cleanupDestFile();
              return reject(new Error(`Failed to download: ${response.statusCode}`));
            }

            const len = parseInt(response.headers['content-length'] || '0', 10);
            let cur = 0;
            const total = len > 0 ? len : config.size;

            response.on('data', (chunk) => {
              file.write(chunk);
              cur += chunk.length;
              if (onProgress) {
                onProgress(Math.round((cur / total) * 100));
              }
            });

            response.on('end', () => {
              file.end();
            });

            file.on('finish', () => {
              // Verify the file actually exists
              if (fs.existsSync(destPath)) {
                const stats = fs.statSync(destPath);
                log.info('Download complete', { path: destPath, bytes: stats.size });
                resolve(destPath);
              } else {
                log.error('CRITICAL: File not found after download', { path: destPath });
                reject(new Error('File not found after download'));
              }
            });

            file.on('error', (err) => {
              log.error('File stream error', { message: err.message });
              cleanupDestFile();
              reject(err);
            });

            response.on('error', (err) => {
              file.destroy();
              cleanupDestFile();
              reject(err);
            });
          })
          .on('error', (err) => {
            file.destroy();
            cleanupDestFile();
            reject(err);
          });
      });
    };

    return downloadWithRedirects(config.url);
  }

  isModelAvailable(type: ModelType): boolean {
    return this.getModelPath(type) !== null;
  }
}

export const modelManager = new ModelManager();
