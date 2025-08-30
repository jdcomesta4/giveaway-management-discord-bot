class Purchase {
    constructor(data = {}) {
        this.purchaseId = data.purchaseId || null;
        this.giveawayId = data.giveawayId || null;
        this.userId = data.userId || null;
        this.vbucksSpent = data.vbucksSpent || 0;
        this.entriesEarned = data.entriesEarned || 0;
        this.items = data.items || [];
        this.itemDetails = data.itemDetails || [];
        this.source = data.source || 'manual'; // 'manual', 'item_search', 'direct_vbucks'
        this.confidence = data.confidence || null; // For item search results
        this.timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
        this.addedBy = data.addedBy || null;
        this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
        this.updatedBy = data.updatedBy || null;
        this.notes = data.notes || '';
    }

    // Validation methods
    validate() {
        const errors = [];

        if (!this.giveawayId) {
            errors.push('Giveaway ID is required');
        }

        if (!this.userId) {
            errors.push('User ID is required');
        }

        if (!this.addedBy) {
            errors.push('Added by user is required');
        }

        if (this.vbucksSpent <= 0) {
            errors.push('V-Bucks spent must be positive');
        }

        if (!Number.isInteger(this.vbucksSpent)) {
            errors.push('V-Bucks spent must be a whole number');
        }

        if (this.entriesEarned < 0) {
            errors.push('Entries earned cannot be negative');
        }

        if (!Array.isArray(this.items)) {
            errors.push('Items must be an array');
        }

        if (!Array.isArray(this.itemDetails)) {
            errors.push('Item details must be an array');
        }

        return errors;
    }

    isValid() {
        return this.validate().length === 0;
    }

    // Calculation methods
    calculateEntries(vbucksPerEntry) {
        if (!vbucksPerEntry || vbucksPerEntry <= 0) {
            throw new Error('Invalid V-Bucks per entry value');
        }
        
        this.entriesEarned = Math.floor(this.vbucksSpent / vbucksPerEntry);
        this.updatedAt = new Date();
        return this.entriesEarned;
    }

    // Item management
    addItem(itemName, itemDetails = null) {
        if (!this.items.includes(itemName)) {
            this.items.push(itemName);
            
            if (itemDetails) {
                this.itemDetails.push({
                    name: itemName,
                    ...itemDetails
                });
            }
            
            this.updatedAt = new Date();
        }
    }

    removeItem(itemName) {
        const index = this.items.indexOf(itemName);
        if (index > -1) {
            this.items.splice(index, 1);
            
            // Remove from itemDetails as well
            this.itemDetails = this.itemDetails.filter(detail => detail.name !== itemName);
            this.updatedAt = new Date();
            return true;
        }
        return false;
    }

    updateVBucks(newAmount) {
        if (newAmount <= 0 || !Number.isInteger(newAmount)) {
            throw new Error('V-Bucks amount must be a positive integer');
        }
        
        this.vbucksSpent = newAmount;
        this.updatedAt = new Date();
    }

    // Display methods
    getDisplayItems() {
        if (this.items.length === 0) {
            return 'No specific items';
        }
        
        return this.items.join(', ');
    }

    getFormattedTimestamp() {
        return this.timestamp.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }

    // Statistics
    getStats() {
        return {
            vbucksSpent: this.vbucksSpent,
            entriesEarned: this.entriesEarned,
            itemCount: this.items.length,
            entryValue: this.entriesEarned > 0 ? this.vbucksSpent / this.entriesEarned : 0,
            source: this.source,
            confidence: this.confidence,
            hasItems: this.items.length > 0
        };
    }

    // Update methods
    update(updates, updatedBy) {
        const allowedUpdates = ['vbucksSpent', 'items', 'itemDetails', 'notes'];
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedUpdates.includes(key)) {
                this[key] = value;
            }
        }
        
        this.updatedBy = updatedBy;
        this.updatedAt = new Date();
    }

    // Serialization
    toJSON() {
        return {
            purchaseId: this.purchaseId,
            giveawayId: this.giveawayId,
            userId: this.userId,
            vbucksSpent: this.vbucksSpent,
            entriesEarned: this.entriesEarned,
            items: this.items,
            itemDetails: this.itemDetails,
            source: this.source,
            confidence: this.confidence,
            timestamp: this.timestamp.toISOString(),
            addedBy: this.addedBy,
            updatedAt: this.updatedAt.toISOString(),
            updatedBy: this.updatedBy,
            notes: this.notes
        };
    }

    static fromJSON(data) {
        return new Purchase(data);
    }

    // Helper methods for different purchase types
    static createFromVBucks(giveawayId, userId, vbucksAmount, addedBy) {
        return new Purchase({
            giveawayId,
            userId,
            vbucksSpent: vbucksAmount,
            source: 'direct_vbucks',
            addedBy
        });
    }

    static createFromItemSearch(giveawayId, userId, searchResult, addedBy) {
        const purchase = new Purchase({
            giveawayId,
            userId,
            vbucksSpent: searchResult.vbucks,
            items: [searchResult.cosmetic.name],
            itemDetails: [searchResult.cosmetic],
            source: 'item_search',
            confidence: searchResult.cosmetic.confidence,
            addedBy
        });

        return purchase;
    }

    static createManual(giveawayId, userId, vbucksSpent, items, addedBy) {
        return new Purchase({
            giveawayId,
            userId,
            vbucksSpent,
            items: Array.isArray(items) ? items : [items],
            source: 'manual',
            addedBy
        });
    }

    // Comparison methods
    equals(otherPurchase) {
        if (!(otherPurchase instanceof Purchase)) return false;
        
        return this.purchaseId === otherPurchase.purchaseId;
    }

    // Display formatting
    getDisplayString() {
        const itemsDisplay = this.items.length > 0 ? 
            ` (${this.items.slice(0, 3).join(', ')}${this.items.length > 3 ? '...' : ''})` : '';
        
        return `${this.vbucksSpent} V-Bucks → ${this.entriesEarned} entries${itemsDisplay}`;
    }

    getDetailedDisplayString() {
        let display = `**Purchase ID:** ${this.purchaseId}\n`;
        display += `**V-Bucks:** ${this.vbucksSpent.toLocaleString()}\n`;
        display += `**Entries:** ${this.entriesEarned}\n`;
        
        if (this.items.length > 0) {
            display += `**Items:** ${this.items.join(', ')}\n`;
        }
        
        display += `**Added:** ${this.getFormattedTimestamp()}\n`;
        
        if (this.confidence) {
            display += `**Confidence:** ${this.confidence}%\n`;
        }
        
        if (this.notes) {
            display += `**Notes:** ${this.notes}\n`;
        }
        
        return display.trim();
    }
}

module.exports = Purchase;