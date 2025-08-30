const axios = require('axios');
const Fuse = require('fuse.js');
const logger = require('./logger');
const database = require('./database');

class APIHandler {
    constructor() {
        this.fortniteApiBase = 'https://fortnite-api.com';
        this.fnbrApiBase = 'https://fnbr.co/api';
        
        this.fuseOptions = {
            keys: [
                { name: 'name', weight: 0.7 },
                { name: 'id', weight: 0.3 }
            ],
            threshold: 0.4, // Lower = more strict matching
            distance: 100,
            minMatchCharLength: 2
        };

        this.requestCounts = {
            fortniteApi: 0,
            fnbrApi: 0
        };

        // Initialize axios instances with proper headers
        this.fortniteApiClient = axios.create({
            baseURL: this.fortniteApiBase,
            timeout: 10000,
            headers: {
                'Authorization': process.env.FORTNITE_API_KEY || '',
                'User-Agent': 'FortniteGiveawayBot/1.0'
            }
        });

        this.fnbrApiClient = axios.create({
            baseURL: this.fnbrApiBase,
            timeout: 8000,
            headers: {
                'x-api-key': process.env.FNBR_API_KEY || '',
                'User-Agent': 'FortniteGiveawayBot/1.0'
            }
        });

        this.setupInterceptors();
    }

    setupInterceptors() {
        // Request interceptors for logging
        this.fortniteApiClient.interceptors.request.use(
            (config) => {
                logger.apiRequest('REQUEST', `fortnite-api.com${config.url}`, 'SENT');
                this.requestCounts.fortniteApi++;
                return config;
            },
            (error) => {
                logger.error('Fortnite API request error:', error.message);
                return Promise.reject(error);
            }
        );

        this.fnbrApiClient.interceptors.request.use(
            (config) => {
                logger.apiRequest('REQUEST', `fnbr.co/api${config.url}`, 'SENT');
                this.requestCounts.fnbrApi++;
                return config;
            },
            (error) => {
                logger.error('FNBR API request error:', error.message);
                return Promise.reject(error);
            }
        );

        // Response interceptors for logging and error handling
        this.fortniteApiClient.interceptors.response.use(
            (response) => {
                logger.apiRequest('RESPONSE', response.config.url, response.status);
                return response;
            },
            (error) => {
                const status = error.response?.status || 'ERROR';
                logger.apiRequest('RESPONSE', error.config?.url || 'unknown', status);
                return Promise.reject(error);
            }
        );

        this.fnbrApiClient.interceptors.response.use(
            (response) => {
                logger.apiRequest('RESPONSE', response.config.url, response.status);
                return response;
            },
            (error) => {
                const status = error.response?.status || 'ERROR';
                logger.apiRequest('RESPONSE', error.config?.url || 'unknown', status);
                
                // Handle FNBR API specific errors
                if (error.response?.status === 429) {
                    logger.warn('FNBR API rate limit exceeded');
                } else if (error.response?.status === 404) {
                    logger.debug('FNBR API item not found');
                }
                
                return Promise.reject(error);
            }
        );
    }

    // Health checks
    async checkFortniteApiHealth() {
        try {
            const response = await this.fortniteApiClient.get('/v1/status');
            const isHealthy = response.status === 200 && response.data?.status === 'UP';
            
            if (isHealthy) {
                logger.success('Fortnite API health check passed');
            } else {
                logger.warn('Fortnite API health check failed - API may be down');
            }
            
            return isHealthy;
        } catch (error) {
            logger.warn('Fortnite API health check failed:', error.message);
            return false;
        }
    }

    async checkFnbrHealth() {
        try {
            // FNBR doesn't have a dedicated health endpoint, so we'll try a simple stats call
            const response = await this.fnbrApiClient.get('/stats');
            const isHealthy = response.status === 200;
            
            if (isHealthy) {
                logger.success('FNBR API health check passed');
            } else {
                logger.warn('FNBR API health check failed');
            }
            
            return isHealthy;
        } catch (error) {
            logger.warn('FNBR API health check failed:', error.message);
            return false;
        }
    }

    // Fortnite API - Cosmetics fetching
    async fetchAndCacheCosmetics() {
        try {
            logger.info('🎨 Fetching all Fortnite cosmetics from API...');
            
            const startTime = Date.now();
            const response = await this.fortniteApiClient.get('/v2/cosmetics/br');
            
            if (!response.data || response.data.status !== 200) {
                throw new Error('Invalid response from Fortnite API');
            }

            const cosmetics = response.data.data || [];
            
            // Transform and normalize cosmetics data
            const normalizedCosmetics = cosmetics.map(item => ({
                id: item.id,
                name: item.name,
                description: item.description || '',
                type: item.type?.displayValue || item.type?.value || 'unknown',
                rarity: item.rarity?.displayValue || item.rarity?.value || 'common',
                series: item.series?.value || null,
                price: null, // Will be filled by FNBR API when needed
                images: {
                    icon: item.images?.icon || null,
                    featured: item.images?.featured || null,
                    smallIcon: item.images?.smallIcon || null
                },
                gameplayTags: item.gameplayTags || [],
                searchTerms: [
                    item.name.toLowerCase(),
                    item.id.toLowerCase(),
                    ...(item.gameplayTags || []).map(tag => tag.toLowerCase())
                ],
                lastUpdated: new Date().toISOString()
            }));

            // Cache to database
            await database.updateCosmetics(normalizedCosmetics);
            
            const duration = Date.now() - startTime;
            logger.performance('Cosmetics fetch and cache', duration);
            logger.success(`Cached ${normalizedCosmetics.length} cosmetics`);
            
            return normalizedCosmetics.length;
        } catch (error) {
            logger.error('Failed to fetch cosmetics from Fortnite API:', error);
            
            // Try to use existing cache if available
            const cached = await database.cache.cosmetics;
            if (cached && cached.items && cached.items.length > 0) {
                logger.warn(`Using existing cached cosmetics (${cached.items.length} items)`);
                return cached.items.length;
            }
            
            throw new Error('No cosmetics data available and API fetch failed');
        }
    }

    // Creator code endpoint
    async getCreatorCode(code) {
        try {
            logger.debug(`Fetching creator code info: ${code}`);
            
            const response = await this.fortniteApiClient.get(`/v1/creatorcode/${code}`);
            
            if (response.data.status !== 200) {
                return null;
            }

            const data = response.data.data;
            return {
                code: data.code,
                account: {
                    id: data.account?.id,
                    name: data.account?.name
                },
                status: data.status,
                verified: data.verified || false
            };
        } catch (error) {
            if (error.response?.status === 404) {
                logger.debug(`Creator code not found: ${code}`);
                return null;
            }
            
            logger.error('Failed to fetch creator code:', error);
            throw error;
        }
    }

    // Hybrid search system - local cosmetics with fuzzy search
    async searchCosmetics(query, filters = {}) {
        try {
            const startTime = Date.now();
            
            // Get cosmetics from cache
            const cosmetics = database.cache.cosmetics?.items || [];
            
            if (cosmetics.length === 0) {
                logger.warn('No cosmetics data available for search');
                return [];
            }

            let results = [...cosmetics];

            // Apply filters first to reduce search space
            if (filters.type) {
                results = results.filter(item => 
                    item.type.toLowerCase() === filters.type.toLowerCase()
                );
            }

            if (filters.rarity) {
                results = results.filter(item => 
                    item.rarity.toLowerCase() === filters.rarity.toLowerCase()
                );
            }

            if (filters.series) {
                results = results.filter(item => 
                    item.series && item.series.toLowerCase() === filters.series.toLowerCase()
                );
            }

            // Apply fuzzy search if query provided
            if (query && query.trim()) {
                const fuse = new Fuse(results, this.fuseOptions);
                const fuzzyResults = fuse.search(query.trim());
                results = fuzzyResults.map(result => result.item);
            }

            // Sort by relevance and limit results
            results = results
                .sort((a, b) => {
                    // Exact name matches first
                    const aExact = a.name.toLowerCase() === query?.toLowerCase();
                    const bExact = b.name.toLowerCase() === query?.toLowerCase();
                    if (aExact && !bExact) return -1;
                    if (!aExact && bExact) return 1;
                    
                    // Then by rarity (legendary > epic > rare > uncommon > common)
                    const rarityOrder = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
                    return (rarityOrder[b.rarity.toLowerCase()] || 0) - (rarityOrder[a.rarity.toLowerCase()] || 0);
                })
                .slice(0, 15); // Limit to 15 results

            const duration = Date.now() - startTime;
            logger.performance('Cosmetics search', duration);
            logger.debug(`Found ${results.length} cosmetics matching query: "${query}"`);
            
            return results;
        } catch (error) {
            logger.error('Cosmetics search failed:', error);
            return [];
        }
    }

    // FNBR API - Get item pricing
    async getItemPricing(itemName, itemType = null, limit = 1) {
        try {
            logger.debug(`Fetching pricing for: ${itemName}`);
            
            const params = {
                search: itemName,
                limit: Math.max(1, Math.min(limit, 15))
            };

            if (itemType) {
                params.type = itemType;
            }

            const response = await this.fnbrApiClient.get('/images', { params });
            
            if (response.data.status !== 200 || !response.data.data) {
                logger.debug(`No pricing data found for: ${itemName}`);
                return null;
            }

            const items = response.data.data;
            if (items.length === 0) {
                return null;
            }

            // Return the first (best) match with pricing info
            const item = items[0];
            const priceText = item.price;
            
            if (!priceText || priceText === 'N/A') {
                logger.debug(`No price available for: ${itemName}`);
                return null;
            }

            // Parse price (remove commas and extract number)
            const priceMatch = priceText.replace(/,/g, '').match(/(\d+)/);
            const vbucksPrice = priceMatch ? parseInt(priceMatch[1]) : null;

            if (!vbucksPrice) {
                logger.debug(`Could not parse price for: ${itemName} (${priceText})`);
                return null;
            }

            const pricingData = {
                id: item.id,
                name: item.name,
                price: vbucksPrice,
                priceText: priceText,
                type: item.type,
                rarity: item.rarity,
                images: item.images || {}
            };

            logger.debug(`Found pricing: ${itemName} = ${vbucksPrice} V-Bucks`);
            return pricingData;
        } catch (error) {
            if (error.response?.status === 404) {
                logger.debug(`Item not found in FNBR API: ${itemName}`);
                return null;
            } else if (error.response?.status === 429) {
                logger.warn('FNBR API rate limit exceeded');
                throw new Error('Rate limit exceeded - please try again later');
            }
            
            logger.error('Failed to fetch pricing from FNBR API:', error);
            return null;
        }
    }

    // Hybrid pricing system - check cache first, then API
    async getItemWithPricing(query, filters = {}) {
        try {
            logger.debug(`Getting item with pricing: ${query}`);
            
            // First, search local cosmetics
            const searchResults = await this.searchCosmetics(query, filters);
            
            if (searchResults.length === 0) {
                logger.debug(`No cosmetics found for: ${query}`);
                return null;
            }

            // Take the best match
            const item = searchResults[0];
            
            // Check if we already have pricing cached
            if (item.price && item.price > 0) {
                logger.debug(`Using cached pricing for ${item.name}: ${item.price} V-Bucks`);
                return {
                    ...item,
                    pricingSource: 'cache'
                };
            }

            // Fetch pricing from FNBR API
            logger.debug(`Fetching pricing from FNBR API for: ${item.name}`);
            const pricingData = await this.getItemPricing(item.name, item.type);
            
            if (pricingData && pricingData.price) {
                // Update the cached item with pricing
                await database.updateCosmeticPrice(item.id, pricingData.price);
                
                return {
                    ...item,
                    price: pricingData.price,
                    priceText: pricingData.priceText,
                    pricingSource: 'fnbr-api'
                };
            } else {
                logger.debug(`No pricing available for: ${item.name}`);
                return {
                    ...item,
                    pricingSource: 'not-available'
                };
            }
        } catch (error) {
            logger.error('Failed to get item with pricing:', error);
            throw error;
        }
    }

    // Batch pricing updates (for maintenance)
    async updatePricingForItems(items, delayMs = 1000) {
        try {
            logger.info(`🔄 Starting batch pricing update for ${items.length} items...`);
            
            let updated = 0;
            let failed = 0;
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                
                try {
                    // Skip items that already have pricing
                    if (item.price && item.price > 0) {
                        continue;
                    }

                    logger.debug(`[${i + 1}/${items.length}] Fetching pricing for: ${item.name}`);
                    
                    const pricingData = await this.getItemPricing(item.name, item.type);
                    
                    if (pricingData && pricingData.price) {
                        await database.updateCosmeticPrice(item.id, pricingData.price);
                        updated++;
                        logger.debug(`✅ Updated pricing: ${item.name} = ${pricingData.price} V-Bucks`);
                    } else {
                        failed++;
                        logger.debug(`❌ No pricing found: ${item.name}`);
                    }
                    
                    // Rate limiting delay
                    if (i < items.length - 1 && delayMs > 0) {
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                    
                } catch (error) {
                    failed++;
                    logger.warn(`Failed to update pricing for ${item.name}:`, error.message);
                    
                    // If we hit rate limits, increase delay
                    if (error.message.includes('Rate limit')) {
                        delayMs = Math.min(delayMs * 2, 5000);
                        logger.warn(`Increased delay to ${delayMs}ms due to rate limiting`);
                    }
                }
            }
            
            logger.info(`✅ Batch pricing update complete: ${updated} updated, ${failed} failed`);
            return { updated, failed };
        } catch (error) {
            logger.error('Batch pricing update failed:', error);
            throw error;
        }
    }

    // Advanced search with multiple strategies
    async advancedItemSearch(query, options = {}) {
        const {
            type,
            rarity,
            series,
            limit = 10,
            includeVariants = false,
            strictMatch = false
        } = options;

        try {
            logger.debug(`Advanced search: "${query}" with options:`, options);
            
            // Strategy 1: Direct ID lookup
            if (query.match(/^(CID|EID|PICKAXE|GLIDER)_/i)) {
                const cosmetics = database.cache.cosmetics?.items || [];
                const exactMatch = cosmetics.find(item => 
                    item.id.toLowerCase() === query.toLowerCase()
                );
                
                if (exactMatch) {
                    logger.debug('Found exact ID match');
                    return [exactMatch];
                }
            }

            // Strategy 2: Fuzzy search with filters
            const results = await this.searchCosmetics(query, { type, rarity, series });
            
            if (strictMatch) {
                // Only return exact name matches
                const exactMatches = results.filter(item => 
                    item.name.toLowerCase() === query.toLowerCase()
                );
                return exactMatches.slice(0, limit);
            }

            // Strategy 3: Enhanced relevance scoring
            const scoredResults = results.map(item => {
                let score = 0;
                
                // Exact name match gets highest score
                if (item.name.toLowerCase() === query.toLowerCase()) {
                    score += 100;
                }
                // Partial name match
                else if (item.name.toLowerCase().includes(query.toLowerCase())) {
                    score += 50;
                }
                
                // Popular items get bonus points
                const popularTypes = ['outfit', 'emote', 'pickaxe'];
                if (popularTypes.includes(item.type.toLowerCase())) {
                    score += 10;
                }
                
                // Rarity bonus (legendary > epic > rare > uncommon > common)
                const rarityBonus = {
                    legendary: 20,
                    epic: 15,
                    rare: 10,
                    uncommon: 5,
                    common: 0
                };
                score += rarityBonus[item.rarity.toLowerCase()] || 0;
                
                return { ...item, relevanceScore: score };
            });

            // Sort by relevance score and return top results
            return scoredResults
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, limit);
                
        } catch (error) {
            logger.error('Advanced item search failed:', error);
            return [];
        }
    }

    // Get comprehensive item details with all available data
    async getItemDetails(itemId) {
        try {
            const cosmetics = database.cache.cosmetics?.items || [];
            const item = cosmetics.find(c => c.id === itemId);
            
            if (!item) {
                return null;
            }

            // Get pricing if not cached
            let itemWithPricing = item;
            if (!item.price || item.price === 0) {
                const pricingResult = await this.getItemWithPricing(item.name, { type: item.type });
                if (pricingResult) {
                    itemWithPricing = pricingResult;
                }
            }

            // Add additional metadata
            return {
                ...itemWithPricing,
                details: {
                    hasPrice: !!(itemWithPricing.price && itemWithPricing.price > 0),
                    isPopular: this.isPopularItem(itemWithPricing),
                    estimatedValue: this.estimateItemValue(itemWithPricing),
                    searchableTerms: itemWithPricing.searchTerms || []
                }
            };
        } catch (error) {
            logger.error('Failed to get item details:', error);
            return null;
        }
    }

    // Helper methods
    isPopularItem(item) {
        const popularTypes = ['outfit', 'emote'];
        const popularRarities = ['legendary', 'epic'];
        
        return popularTypes.includes(item.type.toLowerCase()) &&
               popularRarities.includes(item.rarity.toLowerCase());
    }

    estimateItemValue(item) {
        if (item.price && item.price > 0) {
            return item.price;
        }

        // Estimate based on rarity and type
        const baseValues = {
            outfit: { legendary: 2000, epic: 1500, rare: 1200, uncommon: 800, common: 500 },
            emote: { legendary: 1500, epic: 800, rare: 500, uncommon: 300, common: 200 },
            pickaxe: { legendary: 1500, epic: 1200, rare: 800, uncommon: 500, common: 300 },
            glider: { legendary: 1500, epic: 1200, rare: 800, uncommon: 500, common: 300 },
            backpack: { legendary: 1500, epic: 1200, rare: 800, uncommon: 400, common: 200 }
        };

        const typeValues = baseValues[item.type.toLowerCase()] || baseValues.outfit;
        return typeValues[item.rarity.toLowerCase()] || 800;
    }

    // Analytics and monitoring
    getApiStats() {
        return {
            requestCounts: { ...this.requestCounts },
            lastUpdate: new Date().toISOString(),
            endpoints: {
                fortniteApi: {
                    baseUrl: this.fortniteApiBase,
                    authenticated: !!process.env.FORTNITE_API_KEY
                },
                fnbrApi: {
                    baseUrl: this.fnbrApiBase,
                    authenticated: !!process.env.FNBR_API_KEY
                }
            }
        };
    }

    async getApiHealth() {
        const health = {
            timestamp: new Date().toISOString(),
            overall: 'healthy',
            services: {}
        };

        try {
            // Check Fortnite API
            const fortniteHealthy = await this.checkFortniteApiHealth();
            health.services.fortniteApi = {
                status: fortniteHealthy ? 'healthy' : 'degraded',
                url: this.fortniteApiBase,
                requests: this.requestCounts.fortniteApi
            };

            // Check FNBR API
            const fnbrHealthy = await this.checkFnbrHealth();
            health.services.fnbrApi = {
                status: fnbrHealthy ? 'healthy' : 'degraded',
                url: this.fnbrApiBase,
                requests: this.requestCounts.fnbrApi
            };

            // Determine overall health
            if (!fortniteHealthy && !fnbrHealthy) {
                health.overall = 'unhealthy';
            } else if (!fortniteHealthy || !fnbrHealthy) {
                health.overall = 'degraded';
            }

        } catch (error) {
            health.overall = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }

    // Maintenance utilities
    async refreshCosmetics() {
        try {
            logger.info('🔄 Refreshing cosmetics data...');
            return await this.fetchAndCacheCosmetics();
        } catch (error) {
            logger.error('Failed to refresh cosmetics:', error);
            throw error;
        }
    }

    async clearCache() {
        try {
            logger.info('🗑️  Clearing API cache...');
            
            // Reset request counters
            this.requestCounts = {
                fortniteApi: 0,
                fnbrApi: 0
            };
            
            logger.success('API cache cleared');
        } catch (error) {
            logger.error('Failed to clear cache:', error);
            throw error;
        }
    }
}

module.exports = new APIHandler();