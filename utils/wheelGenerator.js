const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs-extra');
const logger = require('./logger');

// Try both GIF encoders for fallback support
let GifEncoder;
try {
    const GifEncoder2 = require('gif-encoder-2');
    GifEncoder = GifEncoder2.GifEncoder || GifEncoder2;
    logger.debug('Using gif-encoder-2 for wheel animations');
} catch (error) {
    try {
        GifEncoder = require('gifencoder');
        logger.debug('Using gifencoder for wheel animations');
    } catch (fallbackError) {
        logger.error('No GIF encoder available:', fallbackError);
        throw new Error('Neither gif-encoder-2 nor gifencoder could be loaded');
    }
}

class WheelGenerator {
    constructor() {
        // Default settings - optimized for smaller file sizes
        this.defaultSettings = {
            canvasSize: 400,        // Reduced from 800
            wheelRadius: 180,       // Reduced proportionally
            hubRadius: 25,          // Reduced proportionally
            fps: 20,               // Reduced from 30
            quality: 15,           // GIF quality (higher = worse quality = smaller file)
            frameDelay: 50,        // Milliseconds per frame (50ms = 20fps)
            
            // Reduced phase durations
            phases: {
                preSpinFrames: 20,      // 1 second
                spinFrames: 40,         // 2 seconds
                slowFrames: 30,         // 1.5 seconds
                stopFrames: 15,         // 0.75 seconds
                victoryFrames: 35       // 1.75 seconds
            },
            
            // Looping wheel settings
            loopingFrames: 60,      // Number of frames for looping wheel
            loopRotationSpeed: 0.02 // Slow rotation speed for looping
        };
        
        // Color palette for wheel sections
        this.colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8E8', '#FFB6C1', '#F0E68C', '#FF7F50',
            '#87CEEB', '#DEB887', '#CD853F', '#BC8F8F', '#4682B4',
            '#D2B48C', '#FF69B4', '#BA55D3', '#00CED1', '#FF4500'
        ];
        
        this.initializeFont();
    }

    initializeFont() {
        try {
            const fontPath = path.join(__dirname, '../assets/Poppins-Bold.ttf');
            if (fs.existsSync(fontPath)) {
                registerFont(fontPath, { family: 'Poppins' });
                this.fontFamily = 'Poppins';
                logger.debug('Loaded Poppins font for wheel generator');
            } else {
                this.fontFamily = 'Arial, sans-serif';
                logger.debug('Using fallback font for wheel generator');
            }
        } catch (error) {
            this.fontFamily = 'Arial, sans-serif';
            logger.warn('Failed to load custom font, using fallback');
        }
    }

    // Get optimized settings based on participant count and options
    getOptimizedSettings(participantCount, userOptions = {}) {
        const settings = { ...this.defaultSettings };
        
        // Apply user options first
        Object.assign(settings, userOptions);
        
        // Auto-optimize based on participant count
        if (participantCount > 15) {
            settings.quality = Math.min(25, settings.quality + 5);
            settings.frameDelay = Math.max(60, settings.frameDelay + 10);
            settings.canvasSize = Math.min(350, settings.canvasSize - 25);
            
            // Reduce frame counts for many participants
            settings.phases.preSpinFrames = Math.max(15, settings.phases.preSpinFrames - 5);
            settings.phases.spinFrames = Math.max(30, settings.phases.spinFrames - 10);
            settings.phases.slowFrames = Math.max(20, settings.phases.slowFrames - 5);
            settings.phases.victoryFrames = Math.max(25, settings.phases.victoryFrames - 10);
            settings.loopingFrames = Math.max(40, settings.loopingFrames - 10);
        }
        
        if (participantCount > 25) {
            settings.quality = Math.min(30, settings.quality + 5);
            settings.frameDelay = Math.max(80, settings.frameDelay + 20);
            settings.canvasSize = Math.min(300, settings.canvasSize - 25);
            
            // Further reduce for very large giveaways
            settings.phases.preSpinFrames = Math.max(10, settings.phases.preSpinFrames - 5);
            settings.phases.spinFrames = Math.max(20, settings.phases.spinFrames - 10);
            settings.phases.slowFrames = Math.max(15, settings.phases.slowFrames - 5);
            settings.phases.victoryFrames = Math.max(15, settings.phases.victoryFrames - 10);
            settings.loopingFrames = Math.max(30, settings.loopingFrames - 10);
        }
        
        // Recalculate derived values
        settings.centerX = settings.canvasSize / 2;
        settings.centerY = settings.canvasSize / 2;
        settings.wheelRadius = (settings.canvasSize * 0.45) - 10; // Leave margin
        settings.hubRadius = settings.wheelRadius * 0.14;
        
        logger.debug(`Optimized settings for ${participantCount} participants:`, {
            canvasSize: settings.canvasSize,
            quality: settings.quality,
            totalFrames: Object.values(settings.phases).reduce((sum, frames) => sum + frames, 0),
            estimatedSize: `~${this.estimateFileSize(settings, participantCount)}MB`
        });
        
        return settings;
    }
    
    estimateFileSize(settings, participantCount) {
        // Rough estimation formula
        const totalFrames = Object.values(settings.phases).reduce((sum, frames) => sum + frames, 0);
        const pixelCount = settings.canvasSize * settings.canvasSize;
        const complexityFactor = Math.min(2, participantCount / 10);
        const qualityFactor = settings.quality / 10;
        
        // Very rough estimate in MB
        const estimate = (totalFrames * pixelCount * complexityFactor * qualityFactor) / (1024 * 1024 * 100);
        return Math.max(0.1, estimate).toFixed(1);
    }

    // NEW: Generate looping wheel GIF for showcurrentwheelstate
    async generateLoopingWheel(participants, giveawayName = 'Giveaway', userOptions = {}) {
        try {
            const participantCount = Object.keys(participants).length;
            logger.wheel(`Generating looping wheel GIF for ${participantCount} participants`);
            
            const settings = this.getOptimizedSettings(participantCount, userOptions);
            const participantData = this.prepareParticipantData(participants);
            
            if (participantData.length === 0) {
                return this.generateEmptyWheelGif(giveawayName, settings);
            }
            
            // Initialize GIF encoder
            const encoder = new GifEncoder(settings.canvasSize, settings.canvasSize);
            
            // Configure encoder for smaller file size
            if (encoder.setQuality) encoder.setQuality(settings.quality);
            if (encoder.setRepeat) encoder.setRepeat(0); // Loop forever
            if (encoder.setDelay) encoder.setDelay(settings.frameDelay);
            
            encoder.start();
            
            // Generate looping frames
            await this.generateLoopingFrames(encoder, participantData, giveawayName, settings);
            
            encoder.finish();
            
            const buffer = encoder.out.getData();
            const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
            
            logger.wheel(`Generated looping wheel: ${buffer.length} bytes (${fileSizeMB}MB)`);
            
            // Check if file is too large
            if (buffer.length > 10 * 1024 * 1024) { // 10MB limit
                logger.warn(`Generated wheel is ${fileSizeMB}MB, exceeding Discord's 10MB limit`);
                throw new Error(`Generated wheel (${fileSizeMB}MB) exceeds Discord's 10MB file size limit`);
            }
            
            return buffer;
            
        } catch (error) {
            logger.error('Failed to generate looping wheel:', error);
            throw error;
        }
    }

    async generateLoopingFrames(encoder, participantData, giveawayName, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < settings.loopingFrames; frame++) {
            const rotation = frame * settings.loopRotationSpeed;
            
            this.drawBackground(ctx, settings);
            this.drawWheelSections(ctx, participantData, settings, rotation);
            this.drawPointer(ctx, settings);
            this.drawHub(ctx, giveawayName, settings);
            this.addTimestamp(ctx, settings);
            
            encoder.addFrame(ctx);
        }
    }

    async generateEmptyWheelGif(giveawayName, settings) {
        const encoder = new GifEncoder(settings.canvasSize, settings.canvasSize);
        
        if (encoder.setQuality) encoder.setQuality(settings.quality);
        if (encoder.setRepeat) encoder.setRepeat(0);
        if (encoder.setDelay) encoder.setDelay(settings.frameDelay);
        
        encoder.start();
        
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        // Generate a few frames of empty wheel
        for (let frame = 0; frame < 30; frame++) {
            this.drawBackground(ctx, settings);
            
            ctx.beginPath();
            ctx.arc(settings.centerX, settings.centerY, settings.wheelRadius, 0, 2 * Math.PI);
            ctx.fillStyle = '#444444';
            ctx.fill();
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            const fontSize = Math.max(16, settings.canvasSize / 25);
            ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#CCCCCC';
            ctx.fillText('No Participants', settings.centerX, settings.centerY - 10);
            
            ctx.font = `${fontSize - 4}px ${this.fontFamily}`;
            ctx.fillText('Add purchases to see wheel', settings.centerX, settings.centerY + 10);
            
            this.drawHub(ctx, giveawayName, settings);
            this.addTimestamp(ctx, settings);
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
    }

    // Generate static wheel showing current participants
    async generateStaticWheel(participants, giveawayName = 'Giveaway') {
        try {
            const settings = this.getOptimizedSettings(Object.keys(participants).length);
            const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
            const ctx = canvas.getContext('2d');
            
            const participantData = this.prepareParticipantData(participants);
            
            if (participantData.length === 0) {
                return this.generateEmptyWheel(canvas, ctx, giveawayName, settings);
            }
            
            this.drawBackground(ctx, settings);
            this.drawWheelSections(ctx, participantData, settings);
            this.drawPointer(ctx, settings);
            this.drawHub(ctx, giveawayName, settings);
            this.addTimestamp(ctx, settings);
            
            return canvas.toBuffer('image/png');
            
        } catch (error) {
            logger.error('Failed to generate static wheel:', error);
            throw error;
        }
    }

    // Generate animated spinning wheel with winner selection
    async generateSpinningWheel(participants, winner, giveawayName = 'Giveaway', userOptions = {}) {
        try {
            const participantCount = Object.keys(participants).length;
            logger.wheel(`Generating animated wheel for ${participantCount} participants`);
            
            const settings = this.getOptimizedSettings(participantCount, userOptions);
            const participantData = this.prepareParticipantData(participants);
            
            if (participantData.length === 0) {
                throw new Error('Cannot spin wheel with no participants');
            }
            
            // Find winner data
            const winnerData = participantData.find(p => p.userId === winner);
            if (!winnerData) {
                throw new Error(`Winner ${winner} not found in participants`);
            }
            
            // Calculate total frames
            const totalFrames = Object.values(settings.phases).reduce((sum, frames) => sum + frames, 0);
            logger.debug(`Generating ${totalFrames} frames at ${settings.canvasSize}x${settings.canvasSize}`);
            
            // Initialize GIF encoder with optimized settings
            const encoder = new GifEncoder(settings.canvasSize, settings.canvasSize);
            
            // Configure encoder for smaller file size
            if (encoder.setQuality) encoder.setQuality(settings.quality);
            if (encoder.setRepeat) encoder.setRepeat(0); // Loop forever
            if (encoder.setDelay) encoder.setDelay(settings.frameDelay);
            
            encoder.start();
            
            let targetRotation = this.calculateWinnerRotation(participantData, winnerData);
            
            // Generate frames for each phase
            await this.generatePreSpinFrames(encoder, participantData, giveawayName, settings);
            await this.generateSpinFrames(encoder, participantData, giveawayName, settings);
            await this.generateSlowFrames(encoder, participantData, giveawayName, targetRotation, settings);
            await this.generateStopFrames(encoder, participantData, winnerData, giveawayName, targetRotation, settings);
            await this.generateVictoryFrames(encoder, participantData, winnerData, giveawayName, targetRotation, settings);
            
            encoder.finish();
            
            const buffer = encoder.out.getData();
            const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
            
            logger.wheel(`Generated animated wheel: ${buffer.length} bytes (${fileSizeMB}MB)`);
            
            // Check if file is too large
            if (buffer.length > 10 * 1024 * 1024) { // 10MB limit
                logger.warn(`Generated wheel is ${fileSizeMB}MB, exceeding Discord's 10MB limit`);
                throw new Error(`Generated wheel (${fileSizeMB}MB) exceeds Discord's 10MB file size limit`);
            }
            
            return buffer;
            
        } catch (error) {
            logger.error('Failed to generate spinning wheel:', error);
            throw error;
        }
    }

    prepareParticipantData(participants) {
        const participantArray = Object.values(participants);
        
        if (participantArray.length === 0) {
            return [];
        }
        
        const totalEntries = participantArray.reduce((sum, p) => sum + (p.entries || 0), 0);
        
        if (totalEntries === 0) {
            return [];
        }
        
        let currentAngle = 0;
        
        return participantArray.map((participant, index) => {
            const entries = participant.entries || 0;
            const percentage = entries / totalEntries;
            const sectionAngle = percentage * 2 * Math.PI;
            
            const data = {
                ...participant,
                startAngle: currentAngle,
                endAngle: currentAngle + sectionAngle,
                sectionAngle: sectionAngle,
                percentage: percentage,
                color: this.colors[index % this.colors.length],
                textColor: this.getContrastColor(this.colors[index % this.colors.length]),
                // FIXED: Store display name properly for showing in wheel
                displayName: participant.displayName || participant.username || `User ${participant.userId.slice(-4)}`
            };
            
            currentAngle += sectionAngle;
            return data;
        });
    }

    drawBackground(ctx, settings) {
        const gradient = ctx.createRadialGradient(
            settings.centerX, settings.centerY, 0,
            settings.centerX, settings.centerY, settings.canvasSize / 2
        );
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(1, '#2d2d2d');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, settings.canvasSize, settings.canvasSize);
    }

    drawWheelSections(ctx, participantData, settings, rotation = 0, highlightWinner = null) {
        ctx.save();
        ctx.translate(settings.centerX, settings.centerY);
        ctx.rotate(rotation);
        
        participantData.forEach(participant => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, settings.wheelRadius, participant.startAngle, participant.endAngle);
            ctx.closePath();
            
            if (highlightWinner && participant.userId === highlightWinner.userId) {
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 10; // Reduced blur for performance
            } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }
            
            ctx.fillStyle = participant.color;
            ctx.fill();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1; // Reduced line width
            ctx.stroke();
            
            this.drawSectionText(ctx, participant, settings, highlightWinner);
        });
        
        ctx.restore();
    }

    drawSectionText(ctx, participant, settings, highlightWinner = null) {
        const midAngle = (participant.startAngle + participant.endAngle) / 2;
        const textRadius = settings.wheelRadius * 0.7;
        
        ctx.save();
        ctx.rotate(midAngle);
        
        const isHighlighted = highlightWinner && participant.userId === highlightWinner.userId;
        const baseFontSize = Math.max(8, settings.canvasSize / 30); // Scale with canvas
        const fontSize = isHighlighted ? baseFontSize + 2 : Math.max(baseFontSize - 2, Math.min(baseFontSize, participant.sectionAngle * 50));
        
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // FIXED: Use the proper display name instead of generic "User..."
        const displayName = participant.displayName || participant.username || `User ${participant.userId.slice(-4)}`;
        const entriesText = `${participant.entries} entries`;
        
        // Simplified text drawing (no stroke for performance)
        ctx.fillStyle = isHighlighted ? '#FFD700' : participant.textColor;
        
        // Only draw text if section is large enough
        if (participant.sectionAngle > 0.2) {
            ctx.fillText(displayName, textRadius, -4);
            
            ctx.font = `${fontSize - 2}px ${this.fontFamily}`;
            ctx.fillText(entriesText, textRadius, 6);
        }
        
        ctx.restore();
    }

    drawPointer(ctx, settings, glow = false) {
        ctx.save();
        
        const pointerX = settings.centerX;
        const pointerY = settings.centerY - settings.wheelRadius - 10; // Adjusted for smaller wheel
        const pointerSize = settings.canvasSize / 40; // Scale with canvas
        
        if (glow) {
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 8;
        }
        
        ctx.beginPath();
        ctx.moveTo(pointerX, pointerY);
        ctx.lineTo(pointerX - pointerSize, pointerY - pointerSize * 2);
        ctx.lineTo(pointerX + pointerSize, pointerY - pointerSize * 2);
        ctx.closePath();
        
        ctx.fillStyle = '#FFD700';
        ctx.fill();
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.restore();
    }

    drawHub(ctx, giveawayName, settings) {
        ctx.beginPath();
        ctx.arc(settings.centerX, settings.centerY, settings.hubRadius, 0, 2 * Math.PI);
        
        const hubGradient = ctx.createRadialGradient(
            settings.centerX, settings.centerY, 0,
            settings.centerX, settings.centerY, settings.hubRadius
        );
        hubGradient.addColorStop(0, '#4A4A4A');
        hubGradient.addColorStop(1, '#2A2A2A');
        
        ctx.fillStyle = hubGradient;
        ctx.fill();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Scale font with canvas size
        const fontSize = Math.max(8, settings.canvasSize / 40);
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        
        const maxWidth = settings.hubRadius * 1.5;
        const lines = this.wrapText(giveawayName, maxWidth, ctx);
        
        const lineHeight = fontSize + 2;
        const totalHeight = lines.length * lineHeight;
        const startY = settings.centerY - totalHeight / 2 + lineHeight / 2;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, settings.centerX, startY + index * lineHeight);
        });
    }

    addTimestamp(ctx, settings, zones = ['UTC+1']) {
        // Simplified timestamp (only one timezone for smaller file)
        const now = new Date();
        const utc1 = new Date(now.getTime() + (60 * 60 * 1000));
        
        ctx.save();
        ctx.font = `${Math.max(8, settings.canvasSize / 50)}px ${this.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#CCCCCC';
        
        ctx.fillText(`UTC+1: ${utc1.toLocaleString('en-US', { hour12: true })}`, 5, 15);
        
        ctx.restore();
    }

    generateEmptyWheel(canvas, ctx, giveawayName, settings) {
        this.drawBackground(ctx, settings);
        
        ctx.beginPath();
        ctx.arc(settings.centerX, settings.centerY, settings.wheelRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#444444';
        ctx.fill();
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        const fontSize = Math.max(16, settings.canvasSize / 25);
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#CCCCCC';
        ctx.fillText('No Participants', settings.centerX, settings.centerY - 10);
        
        ctx.font = `${fontSize - 4}px ${this.fontFamily}`;
        ctx.fillText('Add purchases to see wheel', settings.centerX, settings.centerY + 10);
        
        this.drawHub(ctx, giveawayName, settings);
        this.addTimestamp(ctx, settings);
        
        return canvas.toBuffer('image/png');
    }

    calculateWinnerRotation(participantData, winner) {
        const winnerMidAngle = (winner.startAngle + winner.endAngle) / 2;
        const targetAngle = (Math.PI * 3/2) - winnerMidAngle;
        
        // Fewer rotations for smaller file size
        const extraRotations = 4 + Math.random() * 2; // 4-6 rotations instead of 8-12
        return targetAngle + (extraRotations * 2 * Math.PI);
    }

    async generatePreSpinFrames(encoder, participantData, giveawayName, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < settings.phases.preSpinFrames; frame++) {
            this.drawBackground(ctx, settings);
            this.drawWheelSections(ctx, participantData, settings);
            this.drawPointer(ctx, settings);
            this.drawHub(ctx, giveawayName, settings);
            this.addTimestamp(ctx, settings);
            
            encoder.addFrame(ctx);
        }
    }

    async generateSpinFrames(encoder, participantData, giveawayName, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < settings.phases.spinFrames; frame++) {
            const progress = frame / settings.phases.spinFrames;
            const rotationSpeed = 0.6 - (progress * 0.1); // Gentler spin
            const rotation = frame * rotationSpeed;
            
            this.drawBackground(ctx, settings);
            this.drawWheelSections(ctx, participantData, settings, rotation);
            this.drawPointer(ctx, settings, frame % 4 === 0); // Intermittent glow
            this.drawHub(ctx, giveawayName, settings);
            this.addTimestamp(ctx, settings);
            
            encoder.addFrame(ctx);
        }
    }

    async generateSlowFrames(encoder, participantData, giveawayName, targetRotation, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        const initialRotation = settings.phases.spinFrames * 0.5;
        
        for (let frame = 0; frame < settings.phases.slowFrames; frame++) {
            const progress = frame / settings.phases.slowFrames;
            const easedProgress = this.easeOutCubic(progress);
            
            const rotation = initialRotation + (targetRotation - initialRotation) * easedProgress;
            
            this.drawBackground(ctx, settings);
            this.drawWheelSections(ctx, participantData, settings, rotation);
            this.drawPointer(ctx, settings);
            this.drawHub(ctx, giveawayName, settings);
            this.addTimestamp(ctx, settings);
            
            encoder.addFrame(ctx);
        }
    }

    async generateStopFrames(encoder, participantData, winner, giveawayName, finalRotation, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < settings.phases.stopFrames; frame++) {
            this.drawBackground(ctx, settings);
            this.drawWheelSections(ctx, participantData, settings, finalRotation, winner);
            this.drawPointer(ctx, settings, true);
            this.drawHub(ctx, giveawayName, settings);
            this.addTimestamp(ctx, settings);
            this.drawWinnerText(ctx, winner, frame, settings);
            
            encoder.addFrame(ctx);
        }
    }

    async generateVictoryFrames(encoder, participantData, winner, giveawayName, finalRotation, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < settings.phases.victoryFrames; frame++) {
            this.drawBackground(ctx, settings);
            
            const victoryRotation = finalRotation + (frame * 0.01); // Gentle rotation
            
            this.drawWheelSections(ctx, participantData, settings, victoryRotation, winner);
            this.drawPointer(ctx, settings, true);
            this.drawHub(ctx, giveawayName, settings);
            this.addTimestamp(ctx, settings);
            this.drawWinnerText(ctx, winner, frame, settings);
            
            // Simplified particles
            if (frame % 3 === 0) {
                this.drawCelebrationParticles(ctx, frame, settings);
            }
            
            encoder.addFrame(ctx);
        }
    }

    drawWinnerText(ctx, winner, frame, settings) {
        // FIXED: Use proper display name instead of generic "User..."
        const displayName = winner.displayName || winner.username || `User ${winner.userId.slice(-4)}`;
        
        ctx.save();
        
        const scale = 1 + Math.sin(frame * 0.2) * 0.05; // Gentler pulsing
        ctx.translate(settings.centerX, settings.canvasSize - 40);
        ctx.scale(scale, scale);
        
        // Simplified winner text box
        const boxWidth = Math.min(200, settings.canvasSize * 0.8);
        const boxHeight = 30;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(-boxWidth/2, -boxHeight/2, boxWidth, boxHeight);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 1;
        ctx.strokeRect(-boxWidth/2, -boxHeight/2, boxWidth, boxHeight);
        
        const fontSize = Math.max(12, settings.canvasSize / 30);
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('WINNER!', 0, -6);
        
        ctx.font = `${fontSize - 2}px ${this.fontFamily}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(displayName, 0, 8);
        
        ctx.restore();
    }

    drawCelebrationParticles(ctx, frame, settings) {
        const particleCount = 8; // Reduced particle count
        
        ctx.save();
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * 2 * Math.PI;
            const distance = 30 + (frame * 1);
            const x = settings.centerX + Math.cos(angle + frame * 0.1) * distance;
            const y = settings.centerY + Math.sin(angle + frame * 0.1) * distance;
            
            const size = 2 + Math.sin(frame * 0.3 + i) * 1;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, 2 * Math.PI);
            ctx.fillStyle = i % 2 === 0 ? '#FFD700' : '#FF6B6B';
            ctx.fill();
        }
        
        ctx.restore();
    }

    // Utility functions
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    getContrastColor(hexColor) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }

    wrapText(text, maxWidth, ctx) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];
        
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + ' ' + word).width;
            
            if (width < maxWidth) {
                currentLine += ' ' + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        
        lines.push(currentLine);
        return lines;
    }

    selectRandomWinner(participants) {
        const participantArray = Object.values(participants);
        
        if (participantArray.length === 0) {
            return null;
        }
        
        const totalEntries = participantArray.reduce((sum, p) => sum + (p.entries || 0), 0);
        
        if (totalEntries === 0) {
            return participantArray[Math.floor(Math.random() * participantArray.length)];
        }
        
        let random = Math.random() * totalEntries;
        
        for (const participant of participantArray) {
            random -= (participant.entries || 0);
            if (random <= 0) {
                return participant;
            }
        }
        
        return participantArray[participantArray.length - 1];
    }

    validateWheelData(participants, giveawayName) {
        if (!participants || typeof participants !== 'object') {
            throw new Error('Invalid participants data');
        }
        
        if (!giveawayName || typeof giveawayName !== 'string') {
            throw new Error('Invalid giveaway name');
        }
        
        const participantCount = Object.keys(participants).length;
        if (participantCount > 50) {
            logger.warn(`Large number of participants (${participantCount}) will generate a heavily optimized wheel to stay under file size limits`);
        }
        
        return true;
    }
}

module.exports = new WheelGenerator();