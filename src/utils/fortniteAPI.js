const axios = require('axios');
const Fuse = require('fuse.js');
const { db } = require('./database');

const FORTNITE_API_BASE = 'https://fortnite-api.com/v2';

class FortniteAPI {
    constructor() {
        this.apiKey = process.env.FORTNITE_API_KEY;
        this.cosmetics = new Map();
        this.fuseSearch = null;
        this.lastUpdate = null;
    }

    async fetchAllCosmetics() {
        try {
            console.log('🎮 Fetching Fortnite cosmetics from API...');
            
            const response = await axios.get(`${FORTNITE_API_BASE}/cosmetics/br`, {
                headers: {
                    'Authorization': this.apiKey
                },
                timeout: 30000
            });

            if (response.data.status === 200 && response.data.data) {
                const cosmetics = response.data.data;
                console.log(`📥 Fetched ${cosmetics.length} cosmetic items`);

                // Process and index cosmetics
                const cosmeticsMap = new Map();
                const searchData = [];

                for (const cosmetic of cosmetics) {
                    if (cosmetic.id && cosmetic.name) {
                        const processedCosmetic = {
                            id: cosmetic.id,
                            name: cosmetic.name,
                            description: cosmetic.description || '',
                            type: cosmetic.type?.value || 'unknown',
                            rarity: cosmetic.rarity?.value || 'common',
                            series: cosmetic.series?.value || null,
                            price: cosmetic.shopHistory?.[0]?.cost || 0,
                            image: cosmetic.images?.smallIcon || cosmetic.images?.icon || null,
                            added: cosmetic.added || new Date().toISOString()
                        };

                        cosmeticsMap.set(cosmetic.id, processedCosmetic);
                        searchData.push({
                            ...processedCosmetic,
                            searchText: `${cosmetic.name} ${cosmetic.description || ''} ${cosmetic.type?.value || ''} ${cosmetic.rarity?.value || ''}`.toLowerCase()
                        });
                    }
                }

                // Initialize fuzzy search
                this.fuseSearch = new Fuse(searchData, {
                    keys: [
                        { name: 'name', weight: 0.6 },
                        { name: 'description', weight: 0.3 },
                        { name: 'searchText', weight: 0.1 }
                    ],
                    threshold: 0.3,
                    includeScore: true,
                    minMatchCharLength: 2
                });

                this.cosmetics = cosmeticsMap;
                this.lastUpdate = new Date().toISOString();

                // Save to local cache
                await this.saveToCache({
                    lastUpdate: this.lastUpdate,
                    cosmetics: Object.fromEntries(cosmeticsMap)
                });

                console.log(`✅ Successfully loaded ${cosmeticsMap.size} cosmetic items`);
                return cosmeticsMap;

            } else {
                throw new Error(`API returned status: ${response.data.status}`);
            }

        } catch (error) {
            console.error('❌ Failed to fetch cosmetics from API:', error.message);
            
            // Try to load from cache
            const cachedData = await this.loadFromCache();
            if (cachedData && Object.keys(cachedData).length > 0) {
                console.log('📂 Loading cosmetics from cache...');
                return new Map(Object.entries(cachedData.cosmetics || {}));
            }

            throw new Error('No cosmetics data available from API or cache');
        }
    }

    async loadFromCache() {
        try {
            return await db.loadCosmetics();
        } catch (error) {
            console.warn('⚠️ Failed to load cosmetics from cache:', error.message);
            return null;
        }
    }

    async saveToCache(data) {
        try {
            await db.saveCosmetics(data);
        } catch (error) {
            console.warn('⚠️ Failed to save cosmetics to cache:', error.message);
        }
    }

    searchCosmetics(query, filters = {}) {
        if (!this.fuseSearch) {
            return [];
        }

        let results = this.fuseSearch.search(query);
        
        // Apply filters
        if (filters.type) {
            results = results.filter(result => 
                result.item.type.toLowerCase() === filters.type.toLowerCase()
            );
        }

        if (filters.rarity) {
            results = results.filter(result => 
                result.item.rarity.toLowerCase() === filters.rarity.toLowerCase()
            );
        }

        if (filters.series) {
            results = results.filter(result => 
                result.item.series && result.item.series.toLowerCase() === filters.series.toLowerCase()
            );
        }

        // Return top 10 results with scores
        return results.slice(0, 10).map(result => ({
            ...result.item,
            score: result.score,
            confidence: Math.round((1 - result.score) * 100)
        }));
    }

    getCosmeticById(id) {
        return this.cosmetics.get(id);
    }

    getCosmeticsByType(type) {
        return Array.from(this.cosmetics.values()).filter(
            cosmetic => cosmetic.type.toLowerCase() === type.toLowerCase()
        );
    }

    getCosmeticsByRarity(rarity) {
        return Array.from(this.cosmetics.values()).filter(
            cosmetic => cosmetic.rarity.toLowerCase() === rarity.toLowerCase()
        );
    }

    getCosmeticsBySeries(series) {
        return Array.from(this.cosmetics.values()).filter(
            cosmetic => cosmetic.series && cosmetic.series.toLowerCase() === series.toLowerCase()
        );
    }

    getRandomCosmetic() {
        const cosmetics = Array.from(this.cosmetics.values());
        return cosmetics[Math.floor(Math.random() * cosmetics.length)];
    }

    // Utility methods for price estimation
    estimateVBucksByName(itemName, filters = {}) {
        const results = this.searchCosmetics(itemName, filters);
        
        if (results.length === 0) {
            return null;
        }

        const bestMatch = results[0];
        if (bestMatch.confidence < 70) {
            return null; // Low confidence match
        }

        // Return price or estimate based on rarity if price is not available
        if (bestMatch.price > 0) {
            return {
                cosmetic: bestMatch,
                vbucks: bestMatch.price,
                source: 'shop_history'
            };
        }

        // Estimate based on rarity if no shop history
        const rarityPrices = {
            'common': 500,
            'uncommon': 800,
            'rare': 1200,
            'epic': 1500,
            'legendary': 2000,
            'mythic': 2500
        };

        const estimatedPrice = rarityPrices[bestMatch.rarity.toLowerCase()] || 800;

        return {
            cosmetic: bestMatch,
            vbucks: estimatedPrice,
            source: 'rarity_estimate'
        };
    }

    getStats() {
        const stats = {
            total: this.cosmetics.size,
            lastUpdate: this.lastUpdate,
            byType: {},
            byRarity: {},
            bySeries: {}
        };

        for (const cosmetic of this.cosmetics.values()) {
            // Count by type
            stats.byType[cosmetic.type] = (stats.byType[cosmetic.type] || 0) + 1;
            
            // Count by rarity
            stats.byRarity[cosmetic.rarity] = (stats.byRarity[cosmetic.rarity] || 0) + 1;
            
            // Count by series
            if (cosmetic.series) {
                stats.bySeries[cosmetic.series] = (stats.bySeries[cosmetic.series] || 0) + 1;
            }
        }

        return stats;
    }
}

const fortniteAPI = new FortniteAPI();

// Export functions
async function loadFortniteCosmetics() {
    return await fortniteAPI.fetchAllCosmetics();
}

function searchFortniteCosmetics(query, filters = {}) {
    return fortniteAPI.searchCosmetics(query, filters);
}

function estimateItemPrice(itemName, filters = {}) {
    return fortniteAPI.estimateVBucksByName(itemName, filters);
}

function getFortniteStats() {
    return fortniteAPI.getStats();
}

module.exports = {
    fortniteAPI,
    loadFortniteCosmetics,
    searchFortniteCosmetics,
    estimateItemPrice,
    getFortniteStats
};