const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const logger = require('./logger');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class BackupManager {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.backupDir = path.join(this.dataDir, 'backups');
        this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 7;
        this.compressionEnabled = true;
        
        this.backupFiles = [
            'giveaways.json',
            'purchases.json', 
            'fortnite-cosmetics.json',
            'stats.json'
        ];
    }

    async initialize() {
        try {
            await fs.ensureDir(this.backupDir);
            logger.debug('Backup directory initialized');
        } catch (error) {
            logger.error('Failed to initialize backup directory:', error);
            throw error;
        }
    }

    generateBackupName(type = '') {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const timestamp = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
        const prefix = type ? `${type}-` : '';
        const extension = this.compressionEnabled ? '.gz' : '.json';
        
        return `backup-${prefix}${timestamp}${extension}`;
    }

    async createBackup(type = 'scheduled') {
        try {
            logger.backup(`Starting ${type} backup...`);
            
            const backupName = this.generateBackupName(type);
            const backupPath = path.join(this.backupDir, backupName);
            
            // Collect all data
            const backupData = {
                metadata: {
                    timestamp: new Date().toISOString(),
                    type: type,
                    version: '1.0',
                    files: this.backupFiles
                },
                data: {}
            };

            // Read all data files
            for (const filename of this.backupFiles) {
                const filepath = path.join(this.dataDir, filename);
                
                try {
                    if (await fs.pathExists(filepath)) {
                        backupData.data[filename] = await fs.readJson(filepath);
                        logger.debug(`Backed up: ${filename}`);
                    } else {
                        logger.warn(`File not found for backup: ${filename}`);
                        backupData.data[filename] = null;
                    }
                } catch (error) {
                    logger.warn(`Failed to backup ${filename}:`, error.message);
                    backupData.data[filename] = null;
                }
            }

            // Write backup file
            const jsonData = JSON.stringify(backupData, null, 2);
            
            if (this.compressionEnabled) {
                const compressed = await gzip(Buffer.from(jsonData, 'utf8'));
                await fs.writeFile(backupPath, compressed);
                logger.debug('Backup compressed and saved');
            } else {
                await fs.writeFile(backupPath, jsonData, 'utf8');
                logger.debug('Backup saved without compression');
            }

            const stats = await fs.stat(backupPath);
            const sizeKB = Math.round(stats.size / 1024);
            
            logger.backup(`Backup created: ${backupName} (${sizeKB} KB)`);
            
            return {
                name: backupName,
                path: backupPath,
                size: stats.size,
                type: type,
                timestamp: backupData.metadata.timestamp
            };
            
        } catch (error) {
            logger.error('Failed to create backup:', error);
            throw error;
        }
    }

    async restoreFromBackup(backupName) {
        try {
            logger.backup(`Restoring from backup: ${backupName}`);
            
            const backupPath = path.join(this.backupDir, backupName);
            
            if (!await fs.pathExists(backupPath)) {
                throw new Error(`Backup file not found: ${backupName}`);
            }

            // Read backup file
            let backupData;
            const fileBuffer = await fs.readFile(backupPath);
            
            if (backupName.endsWith('.gz')) {
                const decompressed = await gunzip(fileBuffer);
                backupData = JSON.parse(decompressed.toString('utf8'));
            } else {
                backupData = JSON.parse(fileBuffer.toString('utf8'));
            }

            // Validate backup structure
            if (!backupData.metadata || !backupData.data) {
                throw new Error('Invalid backup file structure');
            }

            logger.info(`Backup metadata: ${backupData.metadata.type} from ${backupData.metadata.timestamp}`);

            // Create backup of current data before restore
            await this.createBackup('pre-restore');
            
            // Restore each file
            const restored = [];
            const failed = [];

            for (const [filename, data] of Object.entries(backupData.data)) {
                if (data === null) {
                    logger.warn(`Skipping null data for: ${filename}`);
                    continue;
                }

                const filepath = path.join(this.dataDir, filename);
                
                try {
                    await fs.writeJson(filepath, data, { spaces: 2 });
                    restored.push(filename);
                    logger.debug(`Restored: ${filename}`);
                } catch (error) {
                    failed.push({ filename, error: error.message });
                    logger.error(`Failed to restore ${filename}:`, error);
                }
            }

            logger.backup(`Restore completed: ${restored.length} files restored, ${failed.length} failed`);
            
            return {
                restored,
                failed,
                metadata: backupData.metadata
            };
            
        } catch (error) {
            logger.error('Failed to restore from backup:', error);
            throw error;
        }
    }

    async listBackups() {
        try {
            if (!await fs.pathExists(this.backupDir)) {
                return [];
            }

            const files = await fs.readdir(this.backupDir);
            const backupFiles = files.filter(file => file.startsWith('backup-'));
            
            const backups = [];
            
            for (const filename of backupFiles) {
                const filepath = path.join(this.backupDir, filename);
                
                try {
                    const stats = await fs.stat(filepath);
                    const sizeKB = Math.round(stats.size / 1024);
                    
                    // Extract type from filename
                    const typeMatch = filename.match(/backup-([^-]+)-/);
                    const type = typeMatch ? typeMatch[1] : 'unknown';
                    
                    backups.push({
                        name: filename,
                        path: filepath,
                        size: stats.size,
                        sizeKB: sizeKB,
                        type: type,
                        created: stats.birthtime,
                        modified: stats.mtime,
                        compressed: filename.endsWith('.gz')
                    });
                } catch (error) {
                    logger.warn(`Failed to get stats for backup ${filename}:`, error);
                }
            }
            
            // Sort by creation date (newest first)
            backups.sort((a, b) => b.created - a.created);
            
            return backups;
            
        } catch (error) {
            logger.error('Failed to list backups:', error);
            return [];
        }
    }

    async cleanupOldBackups() {
        try {
            const backups = await this.listBackups();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
            
            const toDelete = backups.filter(backup => backup.created < cutoffDate);
            
            if (toDelete.length === 0) {
                logger.debug('No old backups to clean up');
                return 0;
            }

            let deleted = 0;
            
            for (const backup of toDelete) {
                try {
                    await fs.unlink(backup.path);
                    deleted++;
                    logger.debug(`Deleted old backup: ${backup.name}`);
                } catch (error) {
                    logger.warn(`Failed to delete backup ${backup.name}:`, error);
                }
            }
            
            logger.backup(`Cleaned up ${deleted} old backups (older than ${this.retentionDays} days)`);
            return deleted;
            
        } catch (error) {
            logger.error('Failed to cleanup old backups:', error);
            return 0;
        }
    }

    async getBackupInfo(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            
            if (!await fs.pathExists(backupPath)) {
                return null;
            }

            const stats = await fs.stat(backupPath);
            
            // Try to read metadata without loading full backup
            let metadata = null;
            try {
                const fileBuffer = await fs.readFile(backupPath);
                let backupData;
                
                if (backupName.endsWith('.gz')) {
                    const decompressed = await gunzip(fileBuffer);
                    backupData = JSON.parse(decompressed.toString('utf8'));
                } else {
                    backupData = JSON.parse(fileBuffer.toString('utf8'));
                }
                
                metadata = backupData.metadata;
            } catch (error) {
                logger.debug(`Could not read metadata from ${backupName}:`, error.message);
            }

            return {
                name: backupName,
                path: backupPath,
                size: stats.size,
                sizeKB: Math.round(stats.size / 1024),
                created: stats.birthtime,
                modified: stats.mtime,
                compressed: backupName.endsWith('.gz'),
                metadata
            };
            
        } catch (error) {
            logger.error(`Failed to get backup info for ${backupName}:`, error);
            return null;
        }
    }

    async verifyBackup(backupName) {
        try {
            logger.debug(`Verifying backup: ${backupName}`);
            
            const backupPath = path.join(this.backupDir, backupName);
            
            if (!await fs.pathExists(backupPath)) {
                return { valid: false, error: 'Backup file not found' };
            }

            // Try to read and parse the backup
            const fileBuffer = await fs.readFile(backupPath);
            let backupData;
            
            if (backupName.endsWith('.gz')) {
                const decompressed = await gunzip(fileBuffer);
                backupData = JSON.parse(decompressed.toString('utf8'));
            } else {
                backupData = JSON.parse(fileBuffer.toString('utf8'));
            }

            // Validate structure
            if (!backupData.metadata || !backupData.data) {
                return { valid: false, error: 'Invalid backup structure' };
            }

            // Check if all expected files are present
            const missingFiles = this.backupFiles.filter(
                filename => !backupData.data.hasOwnProperty(filename)
            );

            // Count non-null data files
            const dataFiles = Object.entries(backupData.data)
                .filter(([_, data]) => data !== null);

            return {
                valid: true,
                metadata: backupData.metadata,
                filesCount: dataFiles.length,
                missingFiles,
                size: fileBuffer.length,
                compressed: backupName.endsWith('.gz')
            };
            
        } catch (error) {
            return { 
                valid: false, 
                error: `Verification failed: ${error.message}` 
            };
        }
    }

    async getBackupStats() {
        try {
            const backups = await this.listBackups();
            
            if (backups.length === 0) {
                return {
                    totalBackups: 0,
                    totalSize: 0,
                    oldestBackup: null,
                    newestBackup: null,
                    averageSize: 0,
                    byType: {}
                };
            }

            const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
            const averageSize = Math.round(totalSize / backups.length);
            
            // Group by type
            const byType = {};
            backups.forEach(backup => {
                if (!byType[backup.type]) {
                    byType[backup.type] = { count: 0, size: 0 };
                }
                byType[backup.type].count++;
                byType[backup.type].size += backup.size;
            });

            return {
                totalBackups: backups.length,
                totalSize,
                totalSizeKB: Math.round(totalSize / 1024),
                oldestBackup: backups[backups.length - 1],
                newestBackup: backups[0],
                averageSize,
                averageSizeKB: Math.round(averageSize / 1024),
                byType,
                retentionDays: this.retentionDays,
                compressionEnabled: this.compressionEnabled
            };
            
        } catch (error) {
            logger.error('Failed to get backup stats:', error);
            return null;
        }
    }

    // Export backup to external location
    async exportBackup(backupName, destinationPath) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            
            if (!await fs.pathExists(backupPath)) {
                throw new Error(`Backup not found: ${backupName}`);
            }

            await fs.copy(backupPath, destinationPath);
            logger.backup(`Exported backup ${backupName} to ${destinationPath}`);
            
            return destinationPath;
            
        } catch (error) {
            logger.error('Failed to export backup:', error);
            throw error;
        }
    }

    // Import backup from external location
    async importBackup(sourcePath, newName = null) {
        try {
            if (!await fs.pathExists(sourcePath)) {
                throw new Error(`Source file not found: ${sourcePath}`);
            }

            const filename = newName || path.basename(sourcePath);
            const destinationPath = path.join(this.backupDir, filename);
            
            // Verify it's a valid backup before importing
            const verification = await this.verifyBackupFile(sourcePath);
            if (!verification.valid) {
                throw new Error(`Invalid backup file: ${verification.error}`);
            }

            await fs.copy(sourcePath, destinationPath);
            logger.backup(`Imported backup from ${sourcePath} as ${filename}`);
            
            return filename;
            
        } catch (error) {
            logger.error('Failed to import backup:', error);
            throw error;
        }
    }

    async verifyBackupFile(filepath) {
        try {
            const fileBuffer = await fs.readFile(filepath);
            const filename = path.basename(filepath);
            let backupData;
            
            if (filename.endsWith('.gz')) {
                const decompressed = await gunzip(fileBuffer);
                backupData = JSON.parse(decompressed.toString('utf8'));
            } else {
                backupData = JSON.parse(fileBuffer.toString('utf8'));
            }

            if (!backupData.metadata || !backupData.data) {
                return { valid: false, error: 'Invalid backup structure' };
            }

            return { valid: true, metadata: backupData.metadata };
            
        } catch (error) {
            return { 
                valid: false, 
                error: `File verification failed: ${error.message}` 
            };
        }
    }
}

module.exports = new BackupManager();