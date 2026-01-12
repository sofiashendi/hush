import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { ModelType } from './models';

// Type-safe configuration interface
export interface AppConfig {
  model?: ModelType;
  autoPaste?: boolean;
}

// Config Storage Logic
const getConfigPath = () => {
  return path.join(app.getPath('userData'), 'config.json');
};

export const loadConfig = (): AppConfig => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      // Migration: Remove obsolete cloud transcription properties
      if ('apiKey' in config || 'isEncrypted' in config) {
        delete config.apiKey;
        delete config.isEncrypted;
        saveConfig(config);
      }

      return config as AppConfig;
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return {};
};

export const saveConfig = (newConfig: AppConfig): boolean => {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
};
