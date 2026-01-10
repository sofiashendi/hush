import path from 'path';
import fs from 'fs';
import { app, safeStorage } from 'electron';

// Config Storage Logic
const getConfigPath = () => {
    return path.join(app.getPath('userData'), 'config.json');
};

export const loadConfig = () => {
    try {
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

            // Decryption / Migration
            if (config.apiKey) {
                if (config.isEncrypted) {
                    // Try to decrypt
                    if (safeStorage.isEncryptionAvailable()) {
                        try {
                            const encryptedBuffer = Buffer.from(config.apiKey, 'hex');
                            config.apiKey = safeStorage.decryptString(encryptedBuffer);
                        } catch (e) {
                            console.error('Failed to decrypt API key:', e);
                            config.apiKey = ''; // Reset if decryption fails
                        }
                    } else {
                        console.warn('safeStorage not available, cannot decrypt key');
                    }
                } else {
                    // AUTO-MIGRATE: Detected plain text key.
                    console.log('Migrating plain-text key to encrypted storage...');
                    // Re-save immediately. saveConfig() will handle the encryption.
                    saveConfig(config);
                }
            }
            return config;
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
    return {};
};

export const saveConfig = (newConfig: any) => {
    try {
        const configPath = getConfigPath();

        // Clone to avoid mutating the in-memory object with the encrypted string
        const storageConfig = { ...newConfig };

        if (storageConfig.apiKey && safeStorage.isEncryptionAvailable()) {
            const buffer = safeStorage.encryptString(storageConfig.apiKey);
            storageConfig.apiKey = buffer.toString('hex');
            storageConfig.isEncrypted = true;
        }

        fs.writeFileSync(configPath, JSON.stringify(storageConfig, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
};
