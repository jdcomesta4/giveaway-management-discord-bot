const moment = require('moment');

class Giveaway {
    constructor(data = {}) {
        this.id = data.id || null;
        this.name = data.name || '';
        this.channel = data.channel || null;
        this.startDate = data.startDate ? new Date(data.startDate) : null;
        this.endDate = data.endDate ? new Date(data.endDate) : null;
        this.vbucksPerEntry = data.vbucksPerEntry || 100;
        this.active = data.active !== undefined ? data.active : true;
        this.participants = data.participants || {};
        this.totalEntries = data.totalEntries || 0;
        this.totalVBucks = data.totalVBucks || 0;
        this.winner = data.winner || null;
        this.winnerAnnounced = data.winnerAnnounced || false;
        this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
        this.createdBy = data.createdBy || null;
        this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
        this.updatedBy = data.updatedBy || null;
    }

    // Validation methods
    validate() {
        const errors = [];

        if (!this.name) {
            errors.push('Name is required');
        }

        if (this.name && this.name.length > 100) {
            errors.push('Name must be 100 characters or less');
        }

        if (!this.createdBy) {
            errors.push('Created by user is required');
        }

        if (this.startDate && this.endDate) {
            if (this.endDate <= this.startDate) {
                errors.push('End date must be after start date');
            }
        }

        if (this.vbucksPerEntry <= 0 || !Number.isInteger(this.vbucksPerEntry)) {
            errors.push('V-Bucks per entry must be a positive integer');
        }

        return errors;
    }

    isValid() {
        return this.validate().length === 0;
    }

    // Status methods
    getStatus() {
        const now = new Date();
        
        if (this.winner && this.winnerAnnounced) {
            return 'completed';
        }

        if (!this.active) {
            return 'inactive';
        }

        if (this.startDate && now < this.startDate) {
            return 'upcoming';
        }

        if (this.endDate && now > this.endDate) {
            return 'ended';
        }

        return 'active';
    }

    isActive() {
        return this.getStatus() === 'active';
    }

    isEnded() {
        const status = this.getStatus();
        return status === 'ended' || status === 'completed';
    }

    hasStarted() {
        const status = this.getStatus();
        return status !== 'upcoming';
    }

    // Time methods
    getTimeRemaining() {
        if (!this.endDate) return null;
        
        const now = new Date();
        const diff = this.endDate.getTime() - now.getTime();
        
        if (diff <= 0) return null;
        
        const duration = moment.duration(diff);
        return {
            days: Math.floor(duration.asDays()),
            hours: duration.hours(),
            minutes: duration.minutes(),
            seconds: duration.seconds(),
            total: diff
        };
    }

    getTimeUntilStart() {
        if (!this.startDate) return null;
        
        const now = new Date();
        const diff = this.startDate.getTime() - now.getTime();
        
        if (diff <= 0) return null;
        
        const duration = moment.duration(diff);
        return {
            days: Math.floor(duration.asDays()),
            hours: duration.hours(),
            minutes: duration.minutes(),
            seconds: duration.seconds(),
            total: diff
        };
    }

    // Participant methods
    addParticipant(userId, vbucksSpent, items = []) {
        const entries = Math.floor(vbucksSpent / this.vbucksPerEntry);
        
        if (!this.participants[userId]) {
            this.participants[userId] = {
                userId: userId,
                totalVBucks: 0,
                totalEntries: 0,
                purchases: [],
                firstPurchase: new Date(),
                lastPurchase: new Date()
            };
        }

        this.participants[userId].totalVBucks += vbucksSpent;
        this.participants[userId].totalEntries += entries;
        this.participants[userId].lastPurchase = new Date();
        this.participants[userId].purchases.push({
            vbucks: vbucksSpent,
            entries: entries,
            items: items,
            timestamp: new Date()
        });

        this.recalculateTotals();
        this.updatedAt = new Date();
        
        return entries;
    }

    removeParticipant(userId) {
        if (this.participants[userId]) {
            delete this.participants[userId];
            this.recalculateTotals();
            this.updatedAt = new Date();
            return true;
        }
        return false;
    }

    updateParticipantPurchase(userId, purchaseIndex, vbucksSpent, items = []) {
        if (!this.participants[userId] || !this.participants[userId].purchases[purchaseIndex]) {
            return false;
        }

        const oldVBucks = this.participants[userId].purchases[purchaseIndex].vbucks;
        const entries = Math.floor(vbucksSpent / this.vbucksPerEntry);
        const oldEntries = this.participants[userId].purchases[purchaseIndex].entries;

        this.participants[userId].purchases[purchaseIndex] = {
            vbucks: vbucksSpent,
            entries: entries,
            items: items,
            timestamp: this.participants[userId].purchases[purchaseIndex].timestamp
        };

        // Update totals for this participant
        this.participants[userId].totalVBucks = this.participants[userId].totalVBucks - oldVBucks + vbucksSpent;
        this.participants[userId].totalEntries = this.participants[userId].totalEntries - oldEntries + entries;

        this.recalculateTotals();
        this.updatedAt = new Date();
        
        return true;
    }

    recalculateTotals() {
        this.totalEntries = 0;
        this.totalVBucks = 0;

        for (const participant of Object.values(this.participants)) {
            this.totalEntries += participant.totalEntries;
            this.totalVBucks += participant.totalVBucks;
        }
    }

    // Winner selection
    selectRandomWinner() {
        const participants = Object.values(this.participants).filter(p => p.totalEntries > 0);
        
        if (participants.length === 0) {
            return null;
        }

        // Create weighted array based on entries
        const weightedArray = [];
        for (const participant of participants) {
            for (let i = 0; i < participant.totalEntries; i++) {
                weightedArray.push(participant.userId);
            }
        }

        // Select random winner
        const randomIndex = Math.floor(Math.random() * weightedArray.length);
        const winnerId = weightedArray[randomIndex];
        
        this.winner = winnerId;
        this.updatedAt = new Date();
        
        return winnerId;
    }

    // Statistics
    getStats() {
        const participantCount = Object.keys(this.participants).length;
        const avgEntriesPerParticipant = participantCount > 0 ? this.totalEntries / participantCount : 0;
        const avgVBucksPerParticipant = participantCount > 0 ? this.totalVBucks / participantCount : 0;

        // Find top participants
        const topParticipants = Object.values(this.participants)
            .sort((a, b) => b.totalEntries - a.totalEntries)
            .slice(0, 5);

        return {
            participantCount,
            totalEntries: this.totalEntries,
            totalVBucks: this.totalVBucks,
            avgEntriesPerParticipant: Math.round(avgEntriesPerParticipant * 100) / 100,
            avgVBucksPerParticipant: Math.round(avgVBucksPerParticipant),
            topParticipants,
            status: this.getStatus(),
            timeRemaining: this.getTimeRemaining(),
            duration: this.startDate && this.endDate ? 
                moment(this.endDate).diff(moment(this.startDate), 'days', true) : null
        };
    }

    // Serialization
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            channel: this.channel,
            startDate: this.startDate?.toISOString() || null,
            endDate: this.endDate?.toISOString() || null,
            vbucksPerEntry: this.vbucksPerEntry,
            active: this.active,
            participants: this.participants,
            totalEntries: this.totalEntries,
            totalVBucks: this.totalVBucks,
            winner: this.winner,
            winnerAnnounced: this.winnerAnnounced,
            createdAt: this.createdAt.toISOString(),
            createdBy: this.createdBy,
            updatedAt: this.updatedAt.toISOString(),
            updatedBy: this.updatedBy
        };
    }

    static fromJSON(data) {
        return new Giveaway(data);
    }

    // Display formatting
    getDisplayName() {
        return this.name;
    }

    getDisplayStatus() {
        const status = this.getStatus();
        const emojis = {
            active: '🟢',
            upcoming: '🟡',
            ended: '🔴',
            completed: '✅',
            inactive: '⚪'
        };
        
        return `${emojis[status]} ${status.toUpperCase()}`;
    }

    formatTimeRemaining() {
        const time = this.getTimeRemaining();
        if (!time) return 'Ended';
        
        if (time.days > 0) {
            return `${time.days}d ${time.hours}h ${time.minutes}m`;
        } else if (time.hours > 0) {
            return `${time.hours}h ${time.minutes}m`;
        } else {
            return `${time.minutes}m ${time.seconds}s`;
        }
    }
}

module.exports = Giveaway;