const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');

class DatabaseManager {
    constructor() {
        this.dataPath = process.env.DATA_PATH || './src/data';
        this.backupPath = process.env.BACKUP_PATH || './src/data/backups';
        this.files = {
            giveaways: path.join(this.dataPath, 'giveaways.json'),
            purchases: path.join(this.dataPath, 'purchases.json'),
            participants: path.join(this.dataPath, 'participants.json'),
            cosmetics: path.join(this.dataPath, 'fortnite-cosmetics.json')
        };
        this.locks = new Set();
    }

    async acquireLock(filePath) {
        while (this.locks.has(filePath)) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.locks.add(filePath);
    }

    releaseLock(filePath) {
        this.locks.delete(filePath);
    }

    async readFile(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }

    async writeFile(filePath, data) {
        await this.acquireLock(filePath);
        try {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        } finally {
            this.releaseLock(filePath);
        }
    }

    async loadGiveaways() {
        return await this.readFile(this.files.giveaways);
    }

    async saveGiveaways(giveaways) {
        await this.writeFile(this.files.giveaways, giveaways);
    }

    async loadPurchases() {
        return await this.readFile(this.files.purchases);
    }

    async savePurchases(purchases) {
        await this.writeFile(this.files.purchases, purchases);
    }

    async loadParticipants() {
        return await this.readFile(this.files.participants);
    }

    async saveParticipants(participants) {
        await this.writeFile(this.files.participants, participants);
    }

    async loadCosmetics() {
        return await this.readFile(this.files.cosmetics);
    }

    async saveCosmetics(cosmetics) {
        await this.writeFile(this.files.cosmetics, cosmetics);
    }

    // Generate unique IDs
    generateGiveawayId(existingGiveaways) {
        const ids = Object.keys(existingGiveaways).map(id => {
            const match = id.match(/GAW(\d+)/);
            return match ? parseInt(match[1]) : 0;
        });
        const nextId = Math.max(0, ...ids) + 1;
        return `GAW${nextId.toString().padStart(3, '0')}`;
    }

    generatePurchaseId(existingPurchases) {
        const ids = Object.keys(existingPurchases).map(id => {
            const match = id.match(/PURCH(\d+)/);
            return match ? parseInt(match[1]) : 0;
        });
        const nextId = Math.max(0, ...ids) + 1;
        return `PURCH${nextId.toString().padStart(3, '0')}`;
    }

    // Validation methods
    validateGiveaway(giveaway) {
        const required = ['id', 'name', 'createdAt', 'createdBy'];
        for (const field of required) {
            if (!giveaway[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        if (giveaway.startDate && giveaway.endDate) {
            if (new Date(giveaway.endDate) <= new Date(giveaway.startDate)) {
                throw new Error('End date must be after start date');
            }
        }

        if (giveaway.vbucksPerEntry && (giveaway.vbucksPerEntry <= 0 || !Number.isInteger(giveaway.vbucksPerEntry))) {
            throw new Error('V-Bucks per entry must be a positive integer');
        }

        return true;
    }

    validatePurchase(purchase) {
        const required = ['purchaseId', 'giveawayId', 'userId', 'vbucksSpent', 'timestamp', 'addedBy'];
        for (const field of required) {
            if (!purchase[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        if (purchase.vbucksSpent <= 0) {
            throw new Error('V-Bucks spent must be positive');
        }

        return true;
    }
}

const db = new DatabaseManager();

// Backup functions
async function createBackup(type = 'manual') {
    const timestamp = moment().format(type === 'daily' ? 'YYYY-MM-DD' : 'YYYY-MM-DD-HH');
    const backupDir = path.join(db.backupPath, type);
    const backupFile = path.join(backupDir, `${timestamp}.json`);

    try {
        // Create backup directory if it doesn't exist
        await fs.mkdir(backupDir, { recursive: true });

        // Load all current data
        const backupData = {
            timestamp: new Date().toISOString(),
            type: type,
            data: {
                giveaways: await db.loadGiveaways(),
                purchases: await db.loadPurchases(),
                participants: await db.loadParticipants()
            }
        };

        // Save backup
        await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));

        // Clean old backups
        await cleanOldBackups(type);

        console.log(`✅ ${type} backup created: ${backupFile}`);
        return backupFile;
    } catch (error) {
        console.error(`❌ Failed to create ${type} backup:`, error);
        throw error;
    }
}

async function cleanOldBackups(type) {
    const backupDir = path.join(db.backupPath, type);
    const retentionCount = type === 'daily' ? 7 : 24;

    try {
        const files = await fs.readdir(backupDir);
        const backupFiles = files
            .filter(file => file.endsWith('.json'))
            .map(file => ({
                name: file,
                path: path.join(backupDir, file),
                time: file.replace('.json', '')
            }))
            .sort((a, b) => b.time.localeCompare(a.time));

        // Keep only the most recent backups
        const filesToDelete = backupFiles.slice(retentionCount);
        
        for (const file of filesToDelete) {
            await fs.unlink(file.path);
            console.log(`🗑️ Deleted old backup: ${file.name}`);
        }
    } catch (error) {
        console.error(`⚠️ Failed to clean old ${type} backups:`, error);
    }
}

async function restoreFromBackup(backupPath) {
    try {
        const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
        
        if (!backupData.data) {
            throw new Error('Invalid backup format');
        }

        // Restore data files
        await db.saveGiveaways(backupData.data.giveaways || {});
        await db.savePurchases(backupData.data.purchases || {});
        await db.saveParticipants(backupData.data.participants || {});

        console.log(`✅ Successfully restored from backup: ${backupPath}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to restore from backup:`, error);
        throw error;
    }
}

async function listBackups() {
    const backups = {
        daily: [],
        hourly: []
    };

    for (const type of ['daily', 'hourly']) {
        const backupDir = path.join(db.backupPath, type);
        try {
            const files = await fs.readdir(backupDir);
            backups[type] = files
                .filter(file => file.endsWith('.json'))
                .sort()
                .reverse();
        } catch (error) {
            // Directory doesn't exist or is empty
            backups[type] = [];
        }
    }

    return backups;
}

// Initialize database
async function initializeDatabase() {
    try {
        // Create data directory if it doesn't exist
        await fs.mkdir(db.dataPath, { recursive: true });

        // Initialize empty files if they don't exist
        const defaultData = {
            giveaways: {},
            purchases: {},
            participants: {},
            cosmetics: {}
        };

        for (const [key, filePath] of Object.entries(db.files)) {
            try {
                await fs.access(filePath);
            } catch {
                await fs.writeFile(filePath, JSON.stringify(defaultData[key.replace(/s$/, '') + 's'] || {}, null, 2));
                console.log(`📝 Created ${key}.json`);
            }
        }

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    }
}

module.exports = {
    db,
    createBackup,
    cleanOldBackups,
    restoreFromBackup,
    listBackups,
    initializeDatabase
};