const fs = require('fs-extra');
const path = require('path');
const lockfile = require('proper-lockfile');
const logger = require('./logger');

class Database {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.backupDir = path.join(this.dataDir, 'backups');
        
        this.files = {
            giveaways: path.join(this.dataDir, 'giveaways.json'),
            purchases: path.join(this.dataDir, 'purchases.json'),
            cosmetics: path.join(this.dataDir, 'fortnite-cosmetics.json'),
            stats: path.join(this.dataDir, 'stats.json')
        };

        // In-memory cache for frequently accessed data
        this.cache = {
            giveaways: null,
            purchases: null,
            cosmetics: null,
            stats: null
        };

        // Schema validation templates
        this.schemas = {
            giveaway: {
                id: 'string',
                name: 'string',
                channel: 'string',
                startDate: 'string',
                startTime: 'string',
                endDate: 'string',
                endTime: 'string',
                vbucksPerEntry: 'number',
                active: 'boolean',
                participants: 'object',
                totalEntries: 'number',
                createdAt: 'string',
                createdBy: 'string',
                winner: 'string'
            },
            purchase: {
                purchaseId: 'string',
                giveawayId: 'string',
                userId: 'string',
                vbucksSpent: 'number',
                entriesEarned: 'number',
                items: 'array',
                timestamp: 'string',
                addedBy: 'string'
            },
            cosmetic: {
                id: 'string',
                name: 'string',
                type: 'string',
                rarity: 'string',
                series: 'string',
                price: 'number',
                images: 'object'
            }
        };
    }

    async initialize() {
        try {
            logger.info('💾 Initializing database system...');

            // Create data directories
            await fs.ensureDir(this.dataDir);
            await fs.ensureDir(this.backupDir);

            // Initialize data files
            for (const [name, filepath] of Object.entries(this.files)) {
                await this.initializeFile(name, filepath);
            }

            // Load data into cache
            await this.loadAllToCache();

            logger.success('Database system initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize database:', error);
            throw error;
        }
    }

    async initializeFile(name, filepath) {
        if (!await fs.pathExists(filepath)) {
            const defaultData = this.getDefaultData(name);
            await fs.writeJson(filepath, defaultData, { spaces: 2 });
            logger.debug(`Created ${name}.json with default data`);
        } else {
            // Validate existing file
            try {
                await fs.readJson(filepath);
                logger.debug(`Validated existing ${name}.json`);
            } catch (error) {
                logger.warn(`Corrupted ${name}.json detected, restoring from backup...`);
                await this.restoreFromBackup(name);
            }
        }
    }

    getDefaultData(name) {
        switch (name) {
            case 'giveaways':
                return [];
            case 'purchases':
                return [];
            case 'cosmetics':
                return { items: [], lastUpdated: null, version: '1.0' };
            case 'stats':
                return {
                    totalGiveaways: 0,
                    totalPurchases: 0,
                    totalVbucksTracked: 0,
                    totalEntries: 0,
                    totalParticipants: 0,
                    mostActiveUsers: [],
                    averageEntriesPerUser: 0,
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };
            default:
                return {};
        }
    }

    async loadAllToCache() {
        logger.debug('Loading all data to cache...');
        
        for (const [name, filepath] of Object.entries(this.files)) {
            try {
                this.cache[name] = await fs.readJson(filepath);
                logger.debug(`Cached ${name} data`);
            } catch (error) {
                logger.warn(`Failed to cache ${name}:`, error);
                this.cache[name] = this.getDefaultData(name);
            }
        }
    }

    async saveToFile(name, data) {
        const filepath = this.files[name];
        if (!filepath) {
            throw new Error(`Unknown database file: ${name}`);
        }

        // Acquire lock for atomic writes
        let release;
        try {
            release = await lockfile.lock(filepath, {
                retries: {
                    retries: 5,
                    factor: 2,
                    minTimeout: 100,
                    maxTimeout: 1000
                }
            });

            // Write data
            await fs.writeJson(filepath, data, { spaces: 2 });
            
            // Update cache
            this.cache[name] = data;
            
            logger.database('WRITE', name, `${Array.isArray(data) ? data.length : 'object'} records`);
            
        } catch (error) {
            logger.error(`Failed to save ${name}:`, error);
            throw error;
        } finally {
            if (release) {
                await release();
            }
        }
    }

    // Giveaway operations
    async createGiveaway(giveawayData) {
        try {
            // Generate unique ID
            giveawayData.id = this.generateId('GAW');
            giveawayData.createdAt = new Date().toISOString();
            
            // Validate schema
            this.validateSchema(giveawayData, 'giveaway');

            const giveaways = this.cache.giveaways || [];
            giveaways.push(giveawayData);
            
            await this.saveToFile('giveaways', giveaways);
            
            logger.giveaway('CREATED', giveawayData.id, giveawayData.name);
            return giveawayData;
        } catch (error) {
            logger.error('Failed to create giveaway:', error);
            throw error;
        }
    }

    async updateGiveaway(giveawayId, updates) {
        try {
            const giveaways = [...(this.cache.giveaways || [])];
            const index = giveaways.findIndex(g => g.id === giveawayId || g.name === giveawayId);
            
            if (index === -1) {
                throw new Error(`Giveaway not found: ${giveawayId}`);
            }

            // Merge updates
            giveaways[index] = { ...giveaways[index], ...updates };
            giveaways[index].updatedAt = new Date().toISOString();
            
            await this.saveToFile('giveaways', giveaways);
            
            logger.giveaway('UPDATED', giveawayId, Object.keys(updates).join(', '));
            return giveaways[index];
        } catch (error) {
            logger.error('Failed to update giveaway:', error);
            throw error;
        }
    }

    async deleteGiveaway(giveawayId) {
        try {
            const giveaways = [...(this.cache.giveaways || [])];
            const index = giveaways.findIndex(g => g.id === giveawayId || g.name === giveawayId);
            
            if (index === -1) {
                throw new Error(`Giveaway not found: ${giveawayId}`);
            }

            const deleted = giveaways.splice(index, 1)[0];
            await this.saveToFile('giveaways', giveaways);
            
            logger.giveaway('DELETED', giveawayId, deleted.name);
            return deleted;
        } catch (error) {
            logger.error('Failed to delete giveaway:', error);
            throw error;
        }
    }

    async getGiveaway(giveawayId) {
        const giveaways = this.cache.giveaways || [];
        return giveaways.find(g => g.id === giveawayId || g.name === giveawayId);
    }

    async getAllGiveaways() {
        return [...(this.cache.giveaways || [])];
    }

    async getActiveGiveaways() {
        const giveaways = this.cache.giveaways || [];
        return giveaways.filter(g => g.active);
    }

    // Purchase operations
    async createPurchase(purchaseData) {
        try {
            purchaseData.purchaseId = this.generateId('PUR');
            purchaseData.timestamp = new Date().toISOString();
            
            this.validateSchema(purchaseData, 'purchase');

            const purchases = [...(this.cache.purchases || [])];
            purchases.push(purchaseData);
            
            await this.saveToFile('purchases', purchases);
            
            // Update giveaway participant data
            await this.updateGiveawayParticipant(
                purchaseData.giveawayId,
                purchaseData.userId,
                purchaseData.entriesEarned
            );
            
            logger.purchase('CREATED', purchaseData.purchaseId, 
                `${purchaseData.vbucksSpent} V-Bucks, ${purchaseData.entriesEarned} entries`);
            
            return purchaseData;
        } catch (error) {
            logger.error('Failed to create purchase:', error);
            throw error;
        }
    }

    async updatePurchase(purchaseId, updates) {
        try {
            const purchases = [...(this.cache.purchases || [])];
            const index = purchases.findIndex(p => p.purchaseId === purchaseId);
            
            if (index === -1) {
                throw new Error(`Purchase not found: ${purchaseId}`);
            }

            const oldPurchase = purchases[index];
            purchases[index] = { ...oldPurchase, ...updates };
            purchases[index].updatedAt = new Date().toISOString();
            
            await this.saveToFile('purchases', purchases);
            
            // Recalculate giveaway entries if V-Bucks changed
            if (updates.vbucksSpent !== undefined || updates.entriesEarned !== undefined) {
                await this.recalculateGiveawayEntries(oldPurchase.giveawayId);
            }
            
            logger.purchase('UPDATED', purchaseId, Object.keys(updates).join(', '));
            return purchases[index];
        } catch (error) {
            logger.error('Failed to update purchase:', error);
            throw error;
        }
    }

    async deletePurchase(purchaseId) {
        try {
            const purchases = [...(this.cache.purchases || [])];
            const index = purchases.findIndex(p => p.purchaseId === purchaseId);
            
            if (index === -1) {
                throw new Error(`Purchase not found: ${purchaseId}`);
            }

            const deleted = purchases.splice(index, 1)[0];
            await this.saveToFile('purchases', purchases);
            
            // Recalculate giveaway entries
            await this.recalculateGiveawayEntries(deleted.giveawayId);
            
            logger.purchase('DELETED', purchaseId, `${deleted.vbucksSpent} V-Bucks refunded`);
            return deleted;
        } catch (error) {
            logger.error('Failed to delete purchase:', error);
            throw error;
        }
    }

    async getPurchase(purchaseId) {
        const purchases = this.cache.purchases || [];
        return purchases.find(p => p.purchaseId === purchaseId);
    }

    async getPurchasesByGiveaway(giveawayId) {
        const purchases = this.cache.purchases || [];
        return purchases.filter(p => p.giveawayId === giveawayId);
    }

    async getPurchasesByUser(userId) {
        const purchases = this.cache.purchases || [];
        return purchases.filter(p => p.userId === userId);
    }

    // Cosmetics operations
    async updateCosmetics(cosmeticsData) {
        try {
            const data = {
                items: cosmeticsData,
                lastUpdated: new Date().toISOString(),
                version: '1.0',
                count: cosmeticsData.length
            };

            await this.saveToFile('cosmetics', data);
            logger.info(`Updated cosmetics database with ${cosmeticsData.length} items`);
            
            return data;
        } catch (error) {
            logger.error('Failed to update cosmetics:', error);
            throw error;
        }
    }

    async searchCosmetics(query, filters = {}) {
        const cosmetics = this.cache.cosmetics?.items || [];
        
        let results = cosmetics;

        // Apply text search
        if (query) {
            const searchTerm = query.toLowerCase();
            results = results.filter(item => 
                item.name.toLowerCase().includes(searchTerm) ||
                item.id.toLowerCase().includes(searchTerm)
            );
        }

        // Apply filters
        if (filters.type) {
            results = results.filter(item => 
                item.type.toLowerCase() === filters.type.toLowerCase());
        }

        if (filters.rarity) {
            results = results.filter(item => 
                item.rarity.toLowerCase() === filters.rarity.toLowerCase());
        }

        if (filters.series) {
            results = results.filter(item => 
                item.series && item.series.toLowerCase() === filters.series.toLowerCase());
        }

        return results;
    }

    async getCosmeticById(id) {
        const cosmetics = this.cache.cosmetics?.items || [];
        return cosmetics.find(item => item.id === id);
    }

    async updateCosmeticPrice(itemId, price) {
        try {
            const cosmetics = { ...(this.cache.cosmetics || {}) };
            const items = [...(cosmetics.items || [])];
            
            const index = items.findIndex(item => item.id === itemId);
            if (index !== -1) {
                items[index] = { ...items[index], price };
                cosmetics.items = items;
                cosmetics.lastUpdated = new Date().toISOString();
                
                await this.saveToFile('cosmetics', cosmetics);
                logger.debug(`Updated price for ${itemId}: ${price} V-Bucks`);
                
                return items[index];
            }
            
            return null;
        } catch (error) {
            logger.error('Failed to update cosmetic price:', error);
            throw error;
        }
    }

    // Helper functions
    async updateGiveawayParticipant(giveawayId, userId, additionalEntries) {
        try {
            const giveaway = await this.getGiveaway(giveawayId);
            if (!giveaway) {
                throw new Error(`Giveaway not found: ${giveawayId}`);
            }

            if (!giveaway.participants) {
                giveaway.participants = {};
            }

            if (!giveaway.participants[userId]) {
                giveaway.participants[userId] = {
                    userId,
                    entries: 0,
                    vbucksSpent: 0,
                    purchases: []
                };
            }

            giveaway.participants[userId].entries += additionalEntries;
            giveaway.totalEntries = (giveaway.totalEntries || 0) + additionalEntries;

            await this.updateGiveaway(giveawayId, {
                participants: giveaway.participants,
                totalEntries: giveaway.totalEntries
            });

        } catch (error) {
            logger.error('Failed to update giveaway participant:', error);
            throw error;
        }
    }

    async updateGiveawayParticipantWithUserInfo(giveawayId, userId, additionalEntries, vbucksSpent, userInfo) {
    try {
        const giveaway = await this.getGiveaway(giveawayId);
        if (!giveaway) {
            throw new Error(`Giveaway not found: ${giveawayId}`);
        }

        if (!giveaway.participants) {
            giveaway.participants = {};
        }

        if (!giveaway.participants[userId]) {
            giveaway.participants[userId] = {
                userId,
                entries: 0,
                vbucksSpent: 0,
                purchases: [],
                // Store user display information for wheel display
                username: userInfo.username,
                displayName: userInfo.displayName || userInfo.username,
                discriminator: userInfo.discriminator
            };
        } else {
            // Update existing participant with latest user info (in case username changed)
            giveaway.participants[userId].username = userInfo.username;
            giveaway.participants[userId].displayName = userInfo.displayName || userInfo.username;
            giveaway.participants[userId].discriminator = userInfo.discriminator;
        }

        giveaway.participants[userId].entries += additionalEntries;
        giveaway.participants[userId].vbucksSpent += vbucksSpent;
        giveaway.totalEntries = (giveaway.totalEntries || 0) + additionalEntries;

        await this.updateGiveaway(giveawayId, {
            participants: giveaway.participants,
            totalEntries: giveaway.totalEntries
        });

        logger.debug(`Updated participant ${userId} in giveaway ${giveawayId} with user info`);

    } catch (error) {
        logger.error('Failed to update giveaway participant with user info:', error);
        throw error;
    }
}

    async recalculateGiveawayEntries(giveawayId) {
        try {
            const giveaway = await this.getGiveaway(giveawayId);
            const purchases = await this.getPurchasesByGiveaway(giveawayId);

            if (!giveaway) return;

            const participants = {};
            let totalEntries = 0;

            purchases.forEach(purchase => {
                if (!participants[purchase.userId]) {
                    participants[purchase.userId] = {
                        userId: purchase.userId,
                        entries: 0,
                        vbucksSpent: 0,
                        purchases: []
                    };
                }

                participants[purchase.userId].entries += purchase.entriesEarned;
                participants[purchase.userId].vbucksSpent += purchase.vbucksSpent;
                participants[purchase.userId].purchases.push(purchase.purchaseId);
                totalEntries += purchase.entriesEarned;
            });

            await this.updateGiveaway(giveawayId, {
                participants,
                totalEntries
            });

            logger.debug(`Recalculated entries for giveaway ${giveawayId}: ${totalEntries} total`);
        } catch (error) {
            logger.error('Failed to recalculate giveaway entries:', error);
            throw error;
        }
    }

    generateId(prefix = '') {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = prefix;
        
        for (let i = 0; i < (prefix ? 5 : 8); i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        // Ensure uniqueness based on prefix
        const existing = this.getExistingIds(prefix);
        if (existing.includes(result)) {
            return this.generateId(prefix); // Retry if collision
        }
        
        return result;
    }

    getExistingIds(prefix) {
        const ids = [];
        
        if (prefix === 'GAW') {
            const giveaways = this.cache.giveaways || [];
            ids.push(...giveaways.map(g => g.id));
        } else if (prefix === 'PUR') {
            const purchases = this.cache.purchases || [];
            ids.push(...purchases.map(p => p.purchaseId));
        }
        
        return ids;
    }

    validateSchema(data, schemaName) {
        const schema = this.schemas[schemaName];
        if (!schema) return true;

        for (const [field, expectedType] of Object.entries(schema)) {
            if (data[field] === undefined || data[field] === null) {
                if (['id', 'purchaseId', 'name'].includes(field)) {
                    throw new Error(`Required field missing: ${field}`);
                }
                continue;
            }

            const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
            if (actualType !== expectedType) {
                throw new Error(`Invalid type for ${field}: expected ${expectedType}, got ${actualType}`);
            }
        }

        return true;
    }

    // Statistics and analytics
    async updateStats() {
        try {
            const giveaways = this.cache.giveaways || [];
            const purchases = this.cache.purchases || [];

            const stats = {
                totalGiveaways: giveaways.length,
                activeGiveaways: giveaways.filter(g => g.active).length,
                totalPurchases: purchases.length,
                totalVbucksTracked: purchases.reduce((sum, p) => sum + (p.vbucksSpent || 0), 0),
                totalEntries: purchases.reduce((sum, p) => sum + (p.entriesEarned || 0), 0),
                uniqueParticipants: new Set(purchases.map(p => p.userId)).size,
                averageVbucksPerPurchase: purchases.length > 0 ? 
                    Math.round(purchases.reduce((sum, p) => sum + p.vbucksSpent, 0) / purchases.length) : 0,
                averageEntriesPerUser: 0,
                mostActiveUsers: this.getMostActiveUsers(purchases),
                lastUpdated: new Date().toISOString()
            };

            if (stats.uniqueParticipants > 0) {
                stats.averageEntriesPerUser = Math.round(stats.totalEntries / stats.uniqueParticipants);
            }

            await this.saveToFile('stats', stats);
            return stats;
        } catch (error) {
            logger.error('Failed to update stats:', error);
            throw error;
        }
    }

    getMostActiveUsers(purchases, limit = 10) {
        const userStats = {};

        purchases.forEach(purchase => {
            if (!userStats[purchase.userId]) {
                userStats[purchase.userId] = {
                    userId: purchase.userId,
                    totalPurchases: 0,
                    totalVbucks: 0,
                    totalEntries: 0
                };
            }

            userStats[purchase.userId].totalPurchases++;
            userStats[purchase.userId].totalVbucks += purchase.vbucksSpent;
            userStats[purchase.userId].totalEntries += purchase.entriesEarned;
        });

        return Object.values(userStats)
            .sort((a, b) => b.totalVbucks - a.totalVbucks)
            .slice(0, limit);
    }

    async getStats() {
        return this.cache.stats || await this.updateStats();
    }

    // Backup and restore
    async restoreFromBackup(fileName) {
        try {
            const backupFiles = await fs.readdir(this.backupDir);
            const latestBackup = backupFiles
                .filter(f => f.includes(fileName))
                .sort()
                .pop();

            if (!latestBackup) {
                logger.warn(`No backup found for ${fileName}`);
                return false;
            }

            const backupPath = path.join(this.backupDir, latestBackup);
            const data = await fs.readJson(backupPath);
            
            await this.saveToFile(fileName, data);
            logger.info(`Restored ${fileName} from backup: ${latestBackup}`);
            
            return true;
        } catch (error) {
            logger.error(`Failed to restore ${fileName} from backup:`, error);
            return false;
        }
    }

    // Cleanup and maintenance
    async compact() {
        try {
            logger.info('Starting database compaction...');
            
            // Remove any null/undefined entries
            for (const [name, filepath] of Object.entries(this.files)) {
                const data = this.cache[name];
                if (Array.isArray(data)) {
                    const cleaned = data.filter(item => item != null);
                    if (cleaned.length !== data.length) {
                        await this.saveToFile(name, cleaned);
                        logger.info(`Compacted ${name}: removed ${data.length - cleaned.length} null entries`);
                    }
                }
            }

            logger.success('Database compaction completed');
        } catch (error) {
            logger.error('Database compaction failed:', error);
            throw error;
        }
    }

    // Health check
    async healthCheck() {
        const health = {
            status: 'healthy',
            files: {},
            cache: {},
            issues: []
        };

        try {
            // Check file accessibility
            for (const [name, filepath] of Object.entries(this.files)) {
                try {
                    await fs.access(filepath);
                    const stats = await fs.stat(filepath);
                    health.files[name] = {
                        exists: true,
                        size: stats.size,
                        modified: stats.mtime
                    };
                } catch (error) {
                    health.files[name] = { exists: false, error: error.message };
                    health.issues.push(`File not accessible: ${name}`);
                }
            }

            // Check cache status
            for (const [name, data] of Object.entries(this.cache)) {
                health.cache[name] = {
                    loaded: data !== null,
                    type: Array.isArray(data) ? 'array' : typeof data,
                    size: Array.isArray(data) ? data.length : Object.keys(data || {}).length
                };
            }

            if (health.issues.length > 0) {
                health.status = 'degraded';
            }

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }
}

module.exports = new Database();