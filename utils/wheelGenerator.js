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

// Enhanced WheelGenerator with Fixed Color Palette System
class WheelGeneratorFixedPalette {
    constructor() {
        this.defaultSettings = {
            canvasSize: 500,
            wheelRadius: 230,
            hubRadius: 35,
            fps: 25,
            quality: 12,
            frameDelay: 40,
            
            phases: {
                accelerateFrames: 25,
                spinFrames: 75,
                decelerateFrames: 50,
                stopFrames: 10,
                celebrateFrames: 40
            },
            
            loopingFrames: 80,
            loopRotationSpeed: 0.015
        };
        
        // FIXED COLOR PALETTE - All colors that will ever appear in the GIF
        this.fixedPalette = {
            // Background colors
            backgrounds: [
                '#F8F9FA', // Main background
                '#E9ECEF'  // Gradient background
            ],
            
            // Wheel segment colors - exactly 25 colors, no variations
            segments: [
                '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
                '#1ABC9C', '#E67E22', '#34495E', '#F1C40F', '#E91E63',
                '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#00BCD4',
                '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFC107',
                '#FF9800', '#FF5722', '#795548', '#607D8B', '#FF4081'
            ],
            
            // UI element colors - no variations allowed
            ui: {
                white: '#FFFFFF',
                black: '#000000',
                pointer: '#DC3545',        // Always this red
                pointerBorder: '#FFFFFF',
                hubFill: '#FFFFFF',
                hubBorder: '#E0E0E0',
                textMain: '#FFFFFF',       // Always white text
                textHub: '#333333',
                bannerGreen: '#28A745',
                bannerTeal: '#20C997',
                particleGold: '#FFD700',
                particleOrange: '#FF6B35',
                particleGreen: '#28A745'
            },
            
            // Shadow colors - pre-defined, no dynamic generation
            shadows: {
                light: 'rgba(0, 0, 0, 0.1)',
                medium: 'rgba(0, 0, 0, 0.2)',
                dark: 'rgba(0, 0, 0, 0.3)',
                transparent: 'rgba(0, 0, 0, 0)'
            }
        };
        
        this.initializeFont();
    }

    initializeFont() {
        try {
            const fontPath = path.join(__dirname, '../assets/fonts/Poppins-Bold.ttf');
            if (fs.existsSync(fontPath)) {
                registerFont(fontPath, { family: 'Poppins' });
                this.fontFamily = 'Poppins';
            } else {
                this.fontFamily = 'Arial, sans-serif';
            }
        } catch (error) {
            this.fontFamily = 'Arial, sans-serif';
        }
    }

    // Generate palette-optimized GIF encoder
    createOptimizedEncoder(settings) {
        const encoder = new GifEncoder(settings.canvasSize, settings.canvasSize);
        
        // Configure for fixed palette
        if (encoder.setQuality) encoder.setQuality(Math.max(1, Math.min(30, settings.quality)));
        if (encoder.setRepeat) encoder.setRepeat(0);
        if (encoder.setDelay) encoder.setDelay(settings.frameDelay);
        
        // Critical: Set disposal method to prevent color bleeding
        if (encoder.setDispose) encoder.setDispose(2); // Restore to background
        
        // Set transparent color (helps with palette consistency)
        if (encoder.setTransparent) encoder.setTransparent(0x000000);
        
        return encoder;
    }

    // Prepare participant data with FIXED colors only
    prepareParticipantDataFixed(participants) {
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
                // FIXED: Use exact palette color, no variations
                color: this.fixedPalette.segments[index % this.fixedPalette.segments.length],
                displayName: participant.displayName || participant.username || `User ${participant.userId.slice(-4)}`
            };
            
            currentAngle += sectionAngle;
            return data;
        });
    }

    // Draw frame with STRICT color palette adherence
    renderFixedPaletteFrame(ctx, participantData, giveawayName, settings, rotation, highlightWinner = null) {
        // Always clear with EXACT same background
        ctx.fillStyle = this.fixedPalette.backgrounds[0]; // #F8F9FA
        ctx.fillRect(0, 0, settings.canvasSize, settings.canvasSize);
        
        // Draw all components with fixed colors
        this.drawFixedPaletteWheel(ctx, participantData, settings, rotation, highlightWinner);
        this.drawFixedPalettePointer(ctx, settings);
        this.drawFixedPaletteHub(ctx, giveawayName, settings);
    }

    drawFixedPaletteWheel(ctx, participantData, settings, rotation = 0, highlightWinner = null) {
        ctx.save();
        ctx.translate(settings.centerX, settings.centerY);
        ctx.rotate(rotation);
        
        // FIXED: Set shadow properties ONCE and never change them
        ctx.shadowColor = this.fixedPalette.shadows.light;
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        
        // Draw all segments with EXACT same styling
        participantData.forEach((participant) => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, settings.wheelRadius, participant.startAngle, participant.endAngle);
            ctx.closePath();
            
            // FIXED: Use exact color from palette, NO variations
            ctx.fillStyle = participant.color;
            ctx.fill();
            
            // FIXED: Consistent stroke for all segments
            ctx.lineWidth = 2;
            ctx.strokeStyle = this.fixedPalette.ui.white;
            ctx.stroke();
        });
        
        // COMPLETELY reset shadow before text
        ctx.shadowColor = this.fixedPalette.shadows.transparent;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw text with FIXED colors only
        participantData.forEach((participant) => {
            this.drawFixedPaletteText(ctx, participant, settings, highlightWinner);
        });
        
        ctx.restore();
    }

    drawFixedPaletteText(ctx, participant, settings, highlightWinner = null) {
        const midAngle = (participant.startAngle + participant.endAngle) / 2;
        const textRadius = settings.wheelRadius * 0.72;
        
        ctx.save();
        ctx.rotate(midAngle);
        
        // Calculate font size
        let fontSize = Math.max(10, settings.canvasSize / 28);
        const displayName = participant.displayName || participant.username || `User ${participant.userId.slice(-4)}`;
        const maxWidth = Math.max(60, participant.sectionAngle * settings.wheelRadius * 0.8);
        
        // Scale font to fit
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        let textWidth = ctx.measureText(displayName).width;
        if (textWidth > maxWidth) {
            fontSize = Math.max(8, fontSize * (maxWidth / textWidth));
        }
        
        // FIXED: NO dynamic font sizing for highlighting - prevents color palette changes
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // FIXED: ALWAYS use white text - NO color variations whatsoever
        ctx.fillStyle = this.fixedPalette.ui.textMain; // Always #FFFFFF
        
        // FIXED: Minimal, consistent shadow for ALL text
        ctx.shadowColor = this.fixedPalette.shadows.medium;
        ctx.shadowBlur = 1;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
        
        // Only draw if section is large enough
        if (participant.sectionAngle > 0.15) {
            ctx.fillText(displayName, textRadius, -2);
            
            if (participant.sectionAngle > 0.25) {
                ctx.font = `${Math.max(8, fontSize - 3)}px ${this.fontFamily}`;
                ctx.fillText(`${participant.entries} entries`, textRadius, fontSize - 2);
            }
        }
        
        ctx.restore();
    }

    drawFixedPalettePointer(ctx, settings) {
        ctx.save();
        
        const pointerX = settings.centerX;
        const pointerY = settings.centerY - settings.wheelRadius - 8;
        const pointerSize = Math.max(12, settings.canvasSize / 35);
        
        // FIXED: Always same shadow - no glow variations
        ctx.shadowColor = this.fixedPalette.shadows.medium;
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 2;
        
        ctx.beginPath();
        ctx.moveTo(pointerX, pointerY);
        ctx.lineTo(pointerX - pointerSize, pointerY - pointerSize * 1.5);
        ctx.lineTo(pointerX + pointerSize, pointerY - pointerSize * 1.5);
        ctx.closePath();
        
        // FIXED: Always exact same color
        ctx.fillStyle = this.fixedPalette.ui.pointer; // #DC3545
        ctx.fill();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.fixedPalette.ui.pointerBorder;
        ctx.stroke();
        
        ctx.restore();
    }

    drawFixedPaletteHub(ctx, giveawayName, settings) {
        ctx.save();
        
        const hubRadius = settings.hubRadius;
        
        // FIXED: Consistent shadow
        ctx.shadowColor = this.fixedPalette.shadows.light;
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        
        ctx.beginPath();
        ctx.arc(settings.centerX, settings.centerY, hubRadius, 0, 2 * Math.PI);
        
        // FIXED: Always exact same hub colors
        ctx.fillStyle = this.fixedPalette.ui.hubFill;
        ctx.fill();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.fixedPalette.ui.hubBorder;
        ctx.stroke();
        
        // Reset shadow for text
        ctx.shadowColor = this.fixedPalette.shadows.transparent;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        // Hub text with FIXED colors
        const fontSize = Math.max(10, settings.canvasSize / 30);
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.fixedPalette.ui.textHub; // #333333
        
        // Simple text wrapping
        const maxWidth = hubRadius * 1.6;
        const lines = this.wrapTextImproved(giveawayName, maxWidth, ctx, fontSize);
        
        const lineHeight = fontSize + 2;
        const totalHeight = lines.length * lineHeight;
        const startY = settings.centerY - totalHeight / 2 + lineHeight / 2;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, settings.centerX, startY + index * lineHeight);
        });
        
        ctx.restore();
    }

    // Generate looping wheel with fixed palette
    async generateFixedPaletteLoopingWheel(participants, giveawayName = 'Giveaway', userOptions = {}) {
        try {
            const participantCount = Object.keys(participants).length;
            const settings = this.getOptimizedSettings(participantCount, userOptions);
            const participantData = this.prepareParticipantDataFixed(participants);
            
            if (participantData.length === 0) {
                return this.generateEmptyWheelGif(giveawayName, settings);
            }
            
            // FIXED: Fewer frames for stable palette
            const totalFrames = Math.min(60, Math.max(40, participantCount * 1.5));
            const rotationPerFrame = (2 * Math.PI) / totalFrames;
            
            // Create encoder with fixed palette optimization
            const encoder = this.createOptimizedEncoder(settings);
            encoder.start();
            
            const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
            const ctx = canvas.getContext('2d');
            
            // Generate all frames with EXACT same color usage
            for (let frame = 0; frame < totalFrames; frame++) {
                const rotation = frame * rotationPerFrame;
                this.renderFixedPaletteFrame(ctx, participantData, giveawayName, settings, rotation);
                encoder.addFrame(ctx);
            }
            
            encoder.finish();
            
            const buffer = encoder.out.getData();
            const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
            
            if (buffer.length > 10 * 1024 * 1024) {
                throw new Error(`Generated wheel (${fileSizeMB}MB) exceeds Discord's 10MB limit`);
            }
            
            return buffer;
            
        } catch (error) {
            logger.error('Failed to generate fixed palette wheel:', error);
            throw error;
        }
    }

    // Generate spinning wheel with fixed palette
    async generateFixedPaletteSpinningWheel(participants, winner, giveawayName = 'Giveaway', userOptions = {}) {
        try {
            const participantCount = Object.keys(participants).length;
            const settings = this.getOptimizedSettings(participantCount, userOptions);
            const participantData = this.prepareParticipantDataFixed(participants);
            
            if (participantData.length === 0) {
                throw new Error('Cannot spin wheel with no participants');
            }
            
            // Find winner data
            const winnerData = participantData.find(p => p.userId === winner);
            if (!winnerData) {
                throw new Error(`Winner ${winner} not found in participants`);
            }
            
            const totalFrames = Object.values(settings.phases).reduce((sum, frames) => sum + frames, 0);
            
            // Create encoder with fixed palette
            const encoder = this.createOptimizedEncoder(settings);
            encoder.start();
            
            // Calculate winner position
            const targetRotation = this.calculateWinnerRotation(participantData, winnerData);
            
            // Generate frames with FIXED palette
            await this.generateFixedPaletteSpinFrames(encoder, participantData, giveawayName, targetRotation, settings);
            
            encoder.finish();
            
            const buffer = encoder.out.getData();
            if (!buffer || buffer.length === 0) {
                throw new Error('Generated buffer is empty');
            }
            
            const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
            
            if (buffer.length > 10 * 1024 * 1024) {
                throw new Error(`Generated wheel (${fileSizeMB}MB) exceeds Discord's 10MB file size limit`);
            }
            
            return buffer;
            
        } catch (error) {
            logger.error('Failed to generate fixed palette spinning wheel:', error);
            throw error;
        }
    }

    async generateFixedPaletteSpinFrames(encoder, participantData, giveawayName, targetRotation, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        let currentRotation = 0;
        const totalFrames = Object.values(settings.phases).reduce((sum, frames) => sum + frames, 0);
        
        // Generate all phases with consistent rotation progression
        for (let frame = 0; frame < totalFrames; frame++) {
            try {
                // Calculate rotation based on frame and phase
                const progress = frame / totalFrames;
                const rotation = this.calculateRotationForFrame(frame, settings, targetRotation);
                
                // Render frame with FIXED palette only
                this.renderFixedPaletteFrame(ctx, participantData, giveawayName, settings, rotation);
                encoder.addFrame(ctx);
                
            } catch (frameError) {
                logger.warn(`Error in fixed palette frame ${frame}:`, frameError);
            }
        }
    }

    calculateRotationForFrame(frame, settings, targetRotation) {
        const phases = settings.phases;
        let currentFrame = frame;
        
        // Accelerate phase
        if (currentFrame < phases.accelerateFrames) {
            const progress = currentFrame / phases.accelerateFrames;
            const easeProgress = this.easeInCubic(progress);
            return (currentFrame * (0.05 + easeProgress * 0.4)) % (2 * Math.PI);
        }
        currentFrame -= phases.accelerateFrames;
        
        // High speed spin phase
        if (currentFrame < phases.spinFrames) {
            const baseRotation = phases.accelerateFrames * 0.225;
            return (baseRotation + currentFrame * 0.45) % (2 * Math.PI);
        }
        currentFrame -= phases.spinFrames;
        
        // Decelerate phase
        if (currentFrame < phases.decelerateFrames) {
            const progress = currentFrame / phases.decelerateFrames;
            const easeProgress = this.easeOutCubic(progress);
            const initialRotation = phases.accelerateFrames * 0.225 + phases.spinFrames * 0.45;
            return initialRotation + (targetRotation - initialRotation) * easeProgress;
        }
        
        // Final phases - stay at target rotation
        return targetRotation;
    }

    // Utility methods (unchanged)
    getOptimizedSettings(participantCount, userOptions = {}) {
        const settings = { ...this.defaultSettings };
        Object.assign(settings, userOptions);
        
        if (participantCount > 15) {
            settings.quality = Math.min(18, settings.quality + 3);
            settings.frameDelay = Math.max(50, settings.frameDelay + 10);
        }
        
        if (participantCount > 30) {
            settings.canvasSize = Math.min(settings.canvasSize, 450);
            settings.quality = Math.min(20, settings.quality + 5);
            settings.frameDelay = Math.max(60, settings.frameDelay + 20);
        }
        
        settings.centerX = settings.canvasSize / 2;
        settings.centerY = settings.canvasSize / 2;
        settings.wheelRadius = Math.min(settings.wheelRadius, (settings.canvasSize * 0.46) - 10);
        settings.hubRadius = Math.max(25, Math.min(settings.wheelRadius * 0.15, 50));
        
        return settings;
    }

    calculateWinnerRotation(participantData, winner) {
        const winnerMidAngle = (winner.startAngle + winner.endAngle) / 2;
        const targetAngle = (Math.PI * 3/2) - winnerMidAngle;
        const fullRotations = 6 + Math.random() * 4;
        return targetAngle + (fullRotations * 2 * Math.PI);
    }

    easeInCubic(t) { return t * t * t; }
    easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    selectRandomWinner(participants) {
        const participantArray = Object.values(participants);
        if (participantArray.length === 0) return null;
        
        const totalEntries = participantArray.reduce((sum, p) => sum + (p.entries || 0), 0);
        if (totalEntries === 0) {
            return participantArray[Math.floor(Math.random() * participantArray.length)];
        }
        
        let random = Math.random() * totalEntries;
        for (const participant of participantArray) {
            random -= (participant.entries || 0);
            if (random <= 0) return participant;
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
        return true;
    }

    wrapTextImproved(text, maxWidth, ctx, fontSize) {
        const words = text.split(' ');
        const lines = [];
        
        if (words.length === 1) {
            const textWidth = ctx.measureText(text).width;
            if (textWidth <= maxWidth) {
                lines.push(text);
            } else {
                let truncated = text;
                while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 1) {
                    truncated = truncated.slice(0, -1);
                }
                lines.push(truncated + (truncated.length < text.length ? '...' : ''));
            }
            return lines;
        }
        
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
        
        if (lines.length > 3) {
            lines.splice(2);
            lines[1] = lines[1] + '...';
        }
        
        return lines;
    }

    async generateEmptyWheelGif(giveawayName, settings) {
        const encoder = this.createOptimizedEncoder(settings);
        encoder.start();
        
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < 40; frame++) {
            try {
                ctx.fillStyle = this.fixedPalette.backgrounds[0];
                ctx.fillRect(0, 0, settings.canvasSize, settings.canvasSize);
                
                ctx.beginPath();
                ctx.arc(settings.centerX, settings.centerY, settings.wheelRadius, 0, 2 * Math.PI);
                ctx.fillStyle = this.fixedPalette.backgrounds[0];
                ctx.fill();
                ctx.strokeStyle = this.fixedPalette.ui.hubBorder;
                ctx.lineWidth = 3;
                ctx.stroke();
                
                const fontSize = Math.max(18, settings.canvasSize / 20);
                ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = this.fixedPalette.shadows.dark;
                ctx.fillText('No Participants', settings.centerX, settings.centerY - 15);
                
                ctx.font = `${fontSize - 4}px ${this.fontFamily}`;
                ctx.fillStyle = this.fixedPalette.shadows.medium;
                ctx.fillText('Add purchases to populate wheel', settings.centerX, settings.centerY + 15);
                
                this.drawFixedPaletteHub(ctx, giveawayName, settings);
                
                encoder.addFrame(ctx);
            } catch (frameError) {
                logger.warn(`Error in empty wheel frame ${frame}:`, frameError);
            }
        }
        
        encoder.finish();
        return encoder.out.getData();
    }
}

module.exports = new WheelGeneratorFixedPalette();