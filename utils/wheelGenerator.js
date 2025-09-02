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
class WheelGeneratorFixed {
    constructor() {
        this.defaultSettings = {
            canvasSize: 500,
            wheelRadius: 230,
            hubRadius: 35,
            fps: 25,
            quality: 15,      // Better quality for fixed palette
            frameDelay: 40,
            
            phases: {
                accelerateFrames: 25,
                spinFrames: 75,
                decelerateFrames: 50,
                stopFrames: 10,
                celebrateFrames: 40
            }
        };
        
        // FIXED COLOR PALETTE - Pre-defined colors that will NEVER change
        this.globalColorPalette = {
            // Background colors (exactly as they will appear)
            background: '#F8F9FA',
            backgroundGradient: '#E9ECEF',
            
            // Wheel segment colors - EXACTLY 25 predefined colors
            segments: [
                '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
                '#1ABC9C', '#E67E22', '#34495E', '#F1C40F', '#E91E63',
                '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#00BCD4',
                '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFC107',
                '#FF9800', '#FF5722', '#795548', '#607D8B', '#FF4081'
            ],
            
            // UI colors - Fixed, no variations
            pointer: '#DC3545',
            pointerBorder: '#FFFFFF',
            hubFill: '#FFFFFF',
            hubBorder: '#E0E0E0',
            textWhite: '#FFFFFF',
            textDark: '#333333',
            shadowDark: 'rgba(0, 0, 0, 0.3)',
            shadowLight: 'rgba(0, 0, 0, 0.1)',
            transparent: 'rgba(0, 0, 0, 0)'
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

    // Create GIF encoder with FIXED GLOBAL PALETTE optimization
    createFixedPaletteEncoder(settings) {
        const encoder = new GifEncoder(settings.canvasSize, settings.canvasSize);
        
        // CRITICAL: Configure for global palette consistency
        if (encoder.setQuality) encoder.setQuality(settings.quality);
        if (encoder.setRepeat) encoder.setRepeat(0); // Loop forever
        if (encoder.setDelay) encoder.setDelay(settings.frameDelay);
        
        // FIXED PALETTE SETTINGS
        if (encoder.setDispose) encoder.setDispose(2); // Restore to background color
        if (encoder.setTransparent) encoder.setTransparent(0x000000);
        
        // Enable global color table (prevents per-frame palette changes)
        if (encoder.setGlobalPalette) encoder.setGlobalPalette(true);
        
        return encoder;
    }

    // Prepare participant data with CONSISTENT color assignment
    prepareFixedParticipants(participants) {
        const participantArray = Object.values(participants);
        if (participantArray.length === 0) return [];
        
        const totalEntries = participantArray.reduce((sum, p) => sum + (p.entries || 0), 0);
        if (totalEntries === 0) return [];
        
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
                // FIXED: Always use exact same color from global palette
                color: this.globalColorPalette.segments[index % this.globalColorPalette.segments.length],
                displayName: participant.displayName || participant.username || `User ${participant.userId.slice(-4)}`
            };
            
            currentAngle += sectionAngle;
            return data;
        });
    }

    // Render frame with STRICT global palette adherence
    renderFixedFrame(ctx, participants, giveawayName, settings, rotation, highlightWinner = null) {
        // ALWAYS use exact same background
        ctx.fillStyle = this.globalColorPalette.background;
        ctx.fillRect(0, 0, settings.canvasSize, settings.canvasSize);
        
        // Draw wheel components with fixed colors only
        this.drawFixedWheel(ctx, participants, settings, rotation, highlightWinner);
        this.drawFixedPointer(ctx, settings);
        this.drawFixedHub(ctx, giveawayName, settings);
    }

    drawFixedWheel(ctx, participants, settings, rotation = 0, highlightWinner = null) {
        ctx.save();
        ctx.translate(settings.centerX, settings.centerY);
        ctx.rotate(rotation);
        
        // FIXED shadow - never changes
        ctx.shadowColor = this.globalColorPalette.shadowLight;
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        
        // Draw segments with EXACT colors from global palette
        participants.forEach((participant) => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, settings.wheelRadius, participant.startAngle, participant.endAngle);
            ctx.closePath();
            
            // NEVER vary from global palette color
            ctx.fillStyle = participant.color;
            ctx.fill();
            
            // CONSISTENT stroke for all segments
            ctx.lineWidth = 2;
            ctx.strokeStyle = this.globalColorPalette.pointerBorder; // Always white
            ctx.stroke();
        });
        
        // Clear shadow before text to prevent color variations
        ctx.shadowColor = this.globalColorPalette.transparent;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw text with fixed colors
        participants.forEach((participant) => {
            this.drawFixedText(ctx, participant, settings);
        });
        
        ctx.restore();
    }

    drawFixedText(ctx, participant, settings) {
        const midAngle = (participant.startAngle + participant.endAngle) / 2;
        const textRadius = settings.wheelRadius * 0.72;
        
        ctx.save();
        ctx.rotate(midAngle);
        
        // Fixed font sizing
        let fontSize = Math.max(10, settings.canvasSize / 28);
        const displayName = participant.displayName;
        const maxWidth = Math.max(60, participant.sectionAngle * settings.wheelRadius * 0.8);
        
        // Scale font but keep size consistent
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        let textWidth = ctx.measureText(displayName).width;
        if (textWidth > maxWidth) {
            fontSize = Math.max(8, fontSize * (maxWidth / textWidth));
            ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        }
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // ALWAYS white text - no color variations
        ctx.fillStyle = this.globalColorPalette.textWhite;
        
        // FIXED shadow for text
        ctx.shadowColor = this.globalColorPalette.shadowDark;
        ctx.shadowBlur = 2;
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

    drawFixedPointer(ctx, settings) {
        ctx.save();
        
        const pointerX = settings.centerX;
        const pointerY = settings.centerY - settings.wheelRadius - 8;
        const pointerSize = Math.max(12, settings.canvasSize / 35);
        
        // Fixed shadow
        ctx.shadowColor = this.globalColorPalette.shadowDark;
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        
        ctx.beginPath();
        ctx.moveTo(pointerX, pointerY);
        ctx.lineTo(pointerX - pointerSize, pointerY - pointerSize * 1.5);
        ctx.lineTo(pointerX + pointerSize, pointerY - pointerSize * 1.5);
        ctx.closePath();
        
        // Always same pointer color
        ctx.fillStyle = this.globalColorPalette.pointer;
        ctx.fill();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.globalColorPalette.pointerBorder;
        ctx.stroke();
        
        ctx.restore();
    }

    drawFixedHub(ctx, giveawayName, settings) {
        ctx.save();
        
        const hubRadius = settings.hubRadius;
        
        // Fixed shadow
        ctx.shadowColor = this.globalColorPalette.shadowLight;
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        
        ctx.beginPath();
        ctx.arc(settings.centerX, settings.centerY, hubRadius, 0, 2 * Math.PI);
        
        // Always same hub colors
        ctx.fillStyle = this.globalColorPalette.hubFill;
        ctx.fill();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.globalColorPalette.hubBorder;
        ctx.stroke();
        
        // Clear shadow for text
        ctx.shadowColor = this.globalColorPalette.transparent;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        // Hub text with fixed color
        const fontSize = Math.max(10, settings.canvasSize / 30);
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.globalColorPalette.textDark;
        
        // Simple text wrapping
        const maxWidth = hubRadius * 1.6;
        const lines = this.wrapText(giveawayName, maxWidth, ctx);
        
        const lineHeight = fontSize + 2;
        const totalHeight = lines.length * lineHeight;
        const startY = settings.centerY - totalHeight / 2 + lineHeight / 2;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, settings.centerX, startY + index * lineHeight);
        });
        
        ctx.restore();
    }

    // Generate spinning wheel with GLOBAL FIXED PALETTE
    async generateFixedPaletteSpinningWheel(participants, winner, giveawayName = 'Giveaway', userOptions = {}) {
        try {
            const participantCount = Object.keys(participants).length;
            const settings = this.getOptimizedSettings(participantCount, userOptions);
            const participantData = this.prepareFixedParticipants(participants);
            
            if (participantData.length === 0) {
                throw new Error('Cannot spin wheel with no participants');
            }
            
            // Find winner data
            const winnerData = participantData.find(p => p.userId === winner);
            if (!winnerData) {
                throw new Error(`Winner ${winner} not found in participants`);
            }
            
            // Create encoder with FIXED PALETTE
            const encoder = this.createFixedPaletteEncoder(settings);
            encoder.start();
            
            // Calculate winning position
            const targetRotation = this.calculateWinnerRotation(participantData, winnerData);
            
            // Generate all frames with CONSISTENT colors
            const totalFrames = Object.values(settings.phases).reduce((sum, frames) => sum + frames, 0);
            const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
            const ctx = canvas.getContext('2d');
            
            for (let frame = 0; frame < totalFrames; frame++) {
                try {
                    const rotation = this.calculateRotationForFrame(frame, settings, targetRotation);
                    this.renderFixedFrame(ctx, participantData, giveawayName, settings, rotation);
                    encoder.addFrame(ctx);
                } catch (frameError) {
                    logger.warn(`Error in frame ${frame}:`, frameError);
                }
            }
            
            encoder.finish();
            const buffer = encoder.out.getData();
            
            if (!buffer || buffer.length === 0) {
                throw new Error('Generated buffer is empty');
            }
            
            const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
            if (buffer.length > 10 * 1024 * 1024) {
                throw new Error(`Generated wheel (${fileSizeMB}MB) exceeds Discord's 10MB limit`);
            }
            
            logger.success(`Fixed palette wheel generated: ${fileSizeMB}MB, no color flashing`);
            return buffer;
            
        } catch (error) {
            logger.error('Failed to generate fixed palette wheel:', error);
            throw error;
        }
    }

    // Generate looping wheel with FIXED PALETTE
    async generateFixedPaletteLoopingWheel(participants, giveawayName = 'Giveaway', userOptions = {}) {
        try {
            const participantCount = Object.keys(participants).length;
            const settings = this.getOptimizedSettings(participantCount, userOptions);
            const participantData = this.prepareFixedParticipants(participants);
            
            if (participantData.length === 0) {
                return this.generateEmptyWheelGif(giveawayName, settings);
            }
            
            // Create encoder with FIXED PALETTE
            const encoder = this.createFixedPaletteEncoder(settings);
            encoder.start();
            
            // Generate smooth looping animation
            const totalFrames = Math.min(60, Math.max(40, participantCount * 1.5));
            const rotationPerFrame = (2 * Math.PI) / totalFrames;
            
            const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
            const ctx = canvas.getContext('2d');
            
            for (let frame = 0; frame < totalFrames; frame++) {
                const rotation = frame * rotationPerFrame;
                this.renderFixedFrame(ctx, participantData, giveawayName, settings, rotation);
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
            logger.error('Failed to generate fixed palette looping wheel:', error);
            throw error;
        }
    }

    // Utility methods (same as before but optimized)
    getOptimizedSettings(participantCount, userOptions = {}) {
        const settings = { ...this.defaultSettings };
        Object.assign(settings, userOptions);
        
        // Optimize for fixed palette
        if (participantCount > 15) {
            settings.quality = Math.max(12, settings.quality - 3); // Better quality for more participants
            settings.frameDelay = Math.max(50, settings.frameDelay + 10);
        }
        
        if (participantCount > 30) {
            settings.canvasSize = Math.min(settings.canvasSize, 450);
            settings.frameDelay = Math.max(60, settings.frameDelay + 20);
        }
        
        settings.centerX = settings.canvasSize / 2;
        settings.centerY = settings.canvasSize / 2;
        settings.wheelRadius = Math.min(settings.wheelRadius, (settings.canvasSize * 0.46) - 10);
        settings.hubRadius = Math.max(25, Math.min(settings.wheelRadius * 0.15, 50));
        
        return settings;
    }

    calculateWinnerRotation(participants, winner) {
        const winnerMidAngle = (winner.startAngle + winner.endAngle) / 2;
        const targetAngle = (Math.PI * 3/2) - winnerMidAngle;
        const fullRotations = 6 + Math.random() * 4;
        return targetAngle + (fullRotations * 2 * Math.PI);
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
        
        // Final phases
        return targetRotation;
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

    wrapText(text, maxWidth, ctx) {
        const words = text.split(' ');
        const lines = [];
        
        if (words.length === 1) {
            if (ctx.measureText(text).width <= maxWidth) {
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
        const encoder = this.createFixedPaletteEncoder(settings);
        encoder.start();
        
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < 40; frame++) {
            ctx.fillStyle = this.globalColorPalette.background;
            ctx.fillRect(0, 0, settings.canvasSize, settings.canvasSize);
            
            ctx.beginPath();
            ctx.arc(settings.centerX, settings.centerY, settings.wheelRadius, 0, 2 * Math.PI);
            ctx.fillStyle = this.globalColorPalette.background;
            ctx.fill();
            ctx.strokeStyle = this.globalColorPalette.hubBorder;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            const fontSize = Math.max(18, settings.canvasSize / 20);
            ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = this.globalColorPalette.textDark;
            ctx.fillText('No Participants', settings.centerX, settings.centerY - 15);
            
            ctx.font = `${fontSize - 4}px ${this.fontFamily}`;
            ctx.fillText('Add purchases to populate wheel', settings.centerX, settings.centerY + 15);
            
            this.drawFixedHub(ctx, giveawayName, settings);
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
    }
}

module.exports = new WheelGeneratorFixed();