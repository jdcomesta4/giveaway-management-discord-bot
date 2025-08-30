class Participant {
    constructor(data = {}) {
        this.userId = data.userId || null;
        this.username = data.username || null;
        this.discriminator = data.discriminator || null;
        this.displayName = data.displayName || null;
        this.totalVBucks = data.totalVBucks || 0;
        this.totalEntries = data.totalEntries || 0;
        this.purchaseCount = data.purchaseCount || 0;
        this.purchases = data.purchases || [];
        this.giveaways = data.giveaways || [];
        this.wins = data.wins || [];
        this.firstPurchase = data.firstPurchase ? new Date(data.firstPurchase) : null;
        this.lastPurchase = data.lastPurchase ? new Date(data.lastPurchase) : null;
        this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
        this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
    }

    // Validation methods
    validate() {
        const errors = [];

        if (!this.userId) {
            errors.push('User ID is required');
        }

        if (this.totalVBucks < 0) {
            errors.push('Total V-Bucks cannot be negative');
        }

        if (this.totalEntries < 0) {
            errors.push('Total entries cannot be negative');
        }

        if (this.purchaseCount < 0) {
            errors.push('Purchase count cannot be negative');
        }

        if (!Array.isArray(this.purchases)) {
            errors.push('Purchases must be an array');
        }

        if (!Array.isArray(this.giveaways)) {
            errors.push('Giveaways must be an array');
        }

        if (!Array.isArray(this.wins)) {
            errors.push('Wins must be an array');
        }

        return errors;
    }

    isValid() {
        return this.validate().length === 0;
    }

    // Purchase management
    addPurchase(purchaseData) {
        // Add to purchases array if not already present
        const existingIndex = this.purchases.findIndex(p => p.purchaseId === purchaseData.purchaseId);
        
        if (existingIndex === -1) {
            this.purchases.push({
                purchaseId: purchaseData.purchaseId,
                giveawayId: purchaseData.giveawayId,
                vbucks: purchaseData.vbucksSpent,
                entries: purchaseData.entriesEarned,
                items: purchaseData.items || [],
                timestamp: new Date(purchaseData.timestamp)
            });
            
            this.purchaseCount++;
        } else {
            // Update existing purchase
            this.purchases[existingIndex] = {
                ...this.purchases[existingIndex],
                vbucks: purchaseData.vbucksSpent,
                entries: purchaseData.entriesEarned,
                items: purchaseData.items || []
            };
        }

        this.recalculateTotals();
        
        // Update giveaway participation
        if (!this.giveaways.includes(purchaseData.giveawayId)) {
            this.giveaways.push(purchaseData.giveawayId);
        }

        this.updatedAt = new Date();
    }

    removePurchase(purchaseId) {
        const index = this.purchases.findIndex(p => p.purchaseId === purchaseId);
        
        if (index > -1) {
            this.purchases.splice(index, 1);
            this.purchaseCount--;
            this.recalculateTotals();
            this.updatedAt = new Date();
            return true;
        }
        
        return false;
    }

    recalculateTotals() {
        this.totalVBucks = this.purchases.reduce((sum, purchase) => sum + purchase.vbucks, 0);
        this.totalEntries = this.purchases.reduce((sum, purchase) => sum + purchase.entries, 0);
        
        // Update first and last purchase dates
        if (this.purchases.length > 0) {
            const timestamps = this.purchases.map(p => new Date(p.timestamp));
            this.firstPurchase = new Date(Math.min(...timestamps));
            this.lastPurchase = new Date(Math.max(...timestamps));
        } else {
            this.firstPurchase = null;
            this.lastPurchase = null;
        }
    }

    // Giveaway management
    addGiveawayParticipation(giveawayId) {
        if (!this.giveaways.includes(giveawayId)) {
            this.giveaways.push(giveawayId);
            this.updatedAt = new Date();
        }
    }

    removeGiveawayParticipation(giveawayId) {
        const index = this.giveaways.indexOf(giveawayId);
        if (index > -1) {
            this.giveaways.splice(index, 1);
            
            // Remove all purchases for this giveaway
            this.purchases = this.purchases.filter(p => p.giveawayId !== giveawayId);
            this.recalculateTotals();
            this.updatedAt = new Date();
            return true;
        }
        return false;
    }

    // Win management
    addWin(giveawayId, prize, timestamp = new Date()) {
        const existingWin = this.wins.find(w => w.giveawayId === giveawayId);
        
        if (!existingWin) {
            this.wins.push({
                giveawayId,
                prize,
                timestamp: new Date(timestamp),
                claimed: false
            });
            this.updatedAt = new Date();
        }
    }

    markWinClaimed(giveawayId) {
        const win = this.wins.find(w => w.giveawayId === giveawayId);
        if (win) {
            win.claimed = true;
            this.updatedAt = new Date();
            return true;
        }
        return false;
    }

    // Statistics
    getStats() {
        const avgVBucksPerPurchase = this.purchaseCount > 0 ? this.totalVBucks / this.purchaseCount : 0;
        const avgEntriesPerPurchase = this.purchaseCount > 0 ? this.totalEntries / this.purchaseCount : 0;
        
        // Activity analysis
        const daysSinceFirstPurchase = this.firstPurchase ? 
            Math.ceil((new Date() - this.firstPurchase) / (1000 * 60 * 60 * 24)) : 0;
        
        const daysSinceLastPurchase = this.lastPurchase ? 
            Math.ceil((new Date() - this.lastPurchase) / (1000 * 60 * 60 * 24)) : 0;

        // Purchase frequency
        const avgDaysBetweenPurchases = this.purchaseCount > 1 && this.firstPurchase && this.lastPurchase ?
            (this.lastPurchase - this.firstPurchase) / (1000 * 60 * 60 * 24) / (this.purchaseCount - 1) : 0;

        // Giveaway analysis
        const activeGiveaways = this.giveaways.length;
        const winRate = activeGiveaways > 0 ? (this.wins.length / activeGiveaways) * 100 : 0;

        return {
            totalVBucks: this.totalVBucks,
            totalEntries: this.totalEntries,
            purchaseCount: this.purchaseCount,
            avgVBucksPerPurchase: Math.round(avgVBucksPerPurchase),
            avgEntriesPerPurchase: Math.round(avgEntriesPerPurchase * 100) / 100,
            giveawaysParticipated: this.giveaways.length,
            totalWins: this.wins.length,
            winRate: Math.round(winRate * 100) / 100,
            daysSinceFirstPurchase,
            daysSinceLastPurchase,
            avgDaysBetweenPurchases: Math.round(avgDaysBetweenPurchases * 100) / 100,
            isActive: daysSinceLastPurchase <= 7
        };
    }

    getGiveawayStats(giveawayId) {
        const giveawayPurchases = this.purchases.filter(p => p.giveawayId === giveawayId);
        const vbucksInGiveaway = giveawayPurchases.reduce((sum, p) => sum + p.vbucks, 0);
        const entriesInGiveaway = giveawayPurchases.reduce((sum, p) => sum + p.entries, 0);
        const hasWon = this.wins.some(w => w.giveawayId === giveawayId);

        return {
            giveawayId,
            purchases: giveawayPurchases.length,
            vbucks: vbucksInGiveaway,
            entries: entriesInGiveaway,
            hasWon,
            winDetails: hasWon ? this.wins.find(w => w.giveawayId === giveawayId) : null
        };
    }

    // User info management
    updateUserInfo(user) {
        this.username = user.username;
        this.discriminator = user.discriminator;
        this.displayName = user.displayName || user.globalName || user.username;
        this.updatedAt = new Date();
    }

    // Display methods
    getDisplayName() {
        if (this.displayName) {
            return this.displayName;
        }
        
        if (this.username) {
            return this.discriminator && this.discriminator !== '0' ? 
                `${this.username}#${this.discriminator}` : 
                this.username;
        }
        
        return `User ${this.userId}`;
    }

    getActivityStatus() {
        if (!this.lastPurchase) return 'inactive';
        
        const daysSince = Math.ceil((new Date() - this.lastPurchase) / (1000 * 60 * 60 * 24));
        
        if (daysSince <= 3) return 'very_active';
        if (daysSince <= 7) return 'active';
        if (daysSince <= 30) return 'somewhat_active';
        return 'inactive';
    }

    getActivityEmoji() {
        const status = this.getActivityStatus();
        const emojis = {
            very_active: '🔥',
            active: '✅',
            somewhat_active: '🟡',
            inactive: '⚪'
        };
        return emojis[status] || '⚪';
    }

    // Ranking methods
    getParticipantRank(allParticipants, sortBy = 'totalEntries') {
        const sorted = allParticipants
            .sort((a, b) => b[sortBy] - a[sortBy]);
        
        const rank = sorted.findIndex(p => p.userId === this.userId) + 1;
        return {
            rank,
            total: sorted.length,
            percentile: Math.round((1 - (rank - 1) / sorted.length) * 100)
        };
    }

    // Serialization
    toJSON() {
        return {
            userId: this.userId,
            username: this.username,
            discriminator: this.discriminator,
            displayName: this.displayName,
            totalVBucks: this.totalVBucks,
            totalEntries: this.totalEntries,
            purchaseCount: this.purchaseCount,
            purchases: this.purchases,
            giveaways: this.giveaways,
            wins: this.wins,
            firstPurchase: this.firstPurchase?.toISOString() || null,
            lastPurchase: this.lastPurchase?.toISOString() || null,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString()
        };
    }

    static fromJSON(data) {
        return new Participant(data);
    }

    // Comparison methods
    equals(otherParticipant) {
        if (!(otherParticipant instanceof Participant)) return false;
        return this.userId === otherParticipant.userId;
    }

    // Search and filter helpers
    matchesSearch(searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
            this.username?.toLowerCase().includes(term) ||
            this.displayName?.toLowerCase().includes(term) ||
            this.userId.includes(term)
        );
    }
}

module.exports = Participant;