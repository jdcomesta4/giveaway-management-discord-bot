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

// TRUE FIXED WheelGenerator - Solves color quantization flashing
class WheelGeneratorFixed {
    constructor() {
        this.defaultSettings = {
            canvasSize: 500,
            wheelRadius: 230,
            hubRadius: 35,
            fps: 25,
            quality: 1,       // CRITICAL: Quality 1 prevents auto-quantization flashing
            frameDelay: 40,
            
            phases: {
                accelerateFrames: 25,
                spinFrames: 75,
                decelerateFrames: 50,
                stopFrames: 10,
                celebrateFrames: 40
            }
        };
        
        // WEB-SAFE COLOR PALETTE - Fixed 216-color palette that prevents quantization
        this.webSafeColors = this.generateWebSafePalette();
        
        // FIXED COLOR PALETTE - Pre-defined colors mapped to web-safe equivalents
        this.globalColorPalette = {
            background: this.toWebSafe('#F8F9FA'),
            backgroundGradient: this.toWebSafe('#E9ECEF'),
            
            // Wheel segment colors - Mapped to web-safe equivalents
            segments: [
                this.toWebSafe('#E74C3C'), this.toWebSafe('#3498DB'), this.toWebSafe('#2ECC71'), 
                this.toWebSafe('#F39C12'), this.toWebSafe('#9B59B6'), this.toWebSafe('#1ABC9C'), 
                this.toWebSafe('#E67E22'), this.toWebSafe('#34495E'), this.toWebSafe('#F1C40F'), 
                this.toWebSafe('#E91E63'), this.toWebSafe('#9C27B0'), this.toWebSafe('#673AB7'), 
                this.toWebSafe('#3F51B5'), this.toWebSafe('#2196F3'), this.toWebSafe('#00BCD4'),
                this.toWebSafe('#009688'), this.toWebSafe('#4CAF50'), this.toWebSafe('#8BC34A'), 
                this.toWebSafe('#CDDC39'), this.toWebSafe('#FFC107'), this.toWebSafe('#FF9800'), 
                this.toWebSafe('#FF5722'), this.toWebSafe('#795548'), this.toWebSafe('#607D8B'), 
                this.toWebSafe('#FF4081')
            ],
            
            // UI colors - All web-safe
            pointer: this.toWebSafe('#DC3545'),
            pointerBorder: '#FFFFFF',  // Already web-safe
            hubFill: '#FFFFFF',        // Already web-safe
            hubBorder: this.toWebSafe('#E0E0E0'),
            textWhite: '#FFFFFF',      // Already web-safe
            textDark: this.toWebSafe('#333333')
        };
        
        this.initializeFont();
    }

    // Generate 216-color web-safe palette (prevents auto-quantization)
    generateWebSafePalette() {
        const colors = [];
        const values = [0x00, 0x33, 0x66, 0x99, 0xCC, 0xFF];
        
        for (let r of values) {
            for (let g of values) {
                for (let b of values) {
                    colors.push({
                        r, g, b,
                        hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
                    });
                }
            }
        }
        
        return colors;
    }

    // Convert any color to nearest web-safe equivalent
    toWebSafe(hex) {
        const rgb = this.hexToRgb(hex);
        if (!rgb) return hex;
        
        const webSafeValues = [0x00, 0x33, 0x66, 0x99, 0xCC, 0xFF];
        
        const toWebSafeValue = (value) => {
            let closest = webSafeValues[0];
            let minDiff = Math.abs(value - closest);
            
            for (let webValue of webSafeValues) {
                const diff = Math.abs(value - webValue);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = webValue;
                }
            }
            return closest;
        };
        
        const webSafeR = toWebSafeValue(rgb.r);
        const webSafeG = toWebSafeValue(rgb.g);
        const webSafeB = toWebSafeValue(rgb.b);
        
        return `#${webSafeR.toString(16).padStart(2, '0')}${webSafeG.toString(16).padStart(2, '0')}${webSafeB.toString(16).padStart(2, '0')}`;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
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

    // REAL FIX: Create encoder that prevents automatic quantization
    createFixedPaletteEncoder(settings) {
        // CRITICAL: Use gif-encoder-2 with 'octree' algorithm and quality 1
        const encoder = new GifEncoder(
            settings.canvasSize, 
            settings.canvasSize,
            'octree',    // Use octree algorithm for better color consistency
            false,       // Disable optimizer to prevent palette changes
            Math.ceil(Object.values(settings.phases).reduce((a, b) => a + b, 0)) // Total frames
        );
        
        // CRITICAL SETTINGS to prevent quantization flashing:
        encoder.setQuality(1);           // Highest quality = least quantization artifacts
        encoder.setRepeat(0);            // Loop forever
        encoder.setDelay(settings.frameDelay);
        encoder.setDispose(2);           // Restore to background color
        
        return encoder;
    }

    // Prepare participant data with WEB-SAFE color assignment
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
                // CRITICAL: Use web-safe colors to prevent quantization
                color: this.globalColorPalette.segments[index % this.globalColorPalette.segments.length],
                displayName: participant.displayName || participant.username || `User ${participant.userId.slice(-4)}`
            };
            
            currentAngle += sectionAngle;
            return data;
        });
    }

    // CRITICAL: Completely reset canvas state between frames
    resetCanvasState(ctx, settings) {
        // Clear everything
        ctx.clearRect(0, 0, settings.canvasSize, settings.canvasSize);
        
        // Reset ALL canvas properties to defaults
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 10;
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        
        // Fill with consistent web-safe background
        ctx.fillStyle = this.globalColorPalette.background;
        ctx.fillRect(0, 0, settings.canvasSize, settings.canvasSize);
    }

    // Render frame with COMPLETE state reset and web-safe colors
    renderFixedFrame(ctx, participants, giveawayName, settings, rotation, highlightWinner = null) {
        // CRITICAL: Reset canvas state completely
        this.resetCanvasState(ctx, settings);
        
        // Draw wheel components with web-safe colors only
        this.drawFixedWheel(ctx, participants, settings, rotation, highlightWinner);
        this.drawFixedPointer(ctx, settings);
        this.drawFixedHub(ctx, giveawayName, settings);
    }

    drawFixedWheel(ctx, participants, settings, rotation = 0, highlightWinner = null) {
        ctx.save();
        ctx.translate(settings.centerX, settings.centerY);
        ctx.rotate(rotation);
        
        // Draw segments with web-safe colors ONLY
        participants.forEach((participant) => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, settings.wheelRadius, participant.startAngle, participant.endAngle);
            ctx.closePath();
            
            // Use only web-safe color
            ctx.fillStyle = participant.color;
            ctx.fill();
            
            // Web-safe stroke
            ctx.lineWidth = 2;
            ctx.strokeStyle = this.globalColorPalette.pointerBorder;
            ctx.stroke();
        });
        
        // Draw text without shadows (shadows cause quantization issues)
        participants.forEach((participant) => {
            this.drawFixedTextNoShadow(ctx, participant, settings);
        });
        
        ctx.restore();
    }

    // Draw text without shadows to prevent quantization artifacts
    drawFixedTextNoShadow(ctx, participant, settings) {
        const midAngle = (participant.startAngle + participant.endAngle) / 2;
        const textRadius = settings.wheelRadius * 0.72;
        
        ctx.save();
        ctx.rotate(midAngle);
        
        // Fixed font sizing
        let fontSize = Math.max(10, settings.canvasSize / 28);
        const displayName = participant.displayName;
        const maxWidth = Math.max(60, participant.sectionAngle * settings.wheelRadius * 0.8);
        
        // Scale font
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        let textWidth = ctx.measureText(displayName).width;
        if (textWidth > maxWidth) {
            fontSize = Math.max(8, fontSize * (maxWidth / textWidth));
            ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        }
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // NO SHADOWS - use only web-safe white text
        ctx.fillStyle = this.globalColorPalette.textWhite;
        
        // Only draw if section is large enough
        if (participant.sectionAngle > 0.15) {
            // Draw text with black outline for visibility (web-safe colors only)
            ctx.strokeStyle = '#000000';  // Web-safe black
            ctx.lineWidth = 2;
            ctx.strokeText(displayName, textRadius, -2);
            ctx.fillText(displayName, textRadius, -2);
            
            if (participant.sectionAngle > 0.25) {
                ctx.font = `${Math.max(8, fontSize - 3)}px ${this.fontFamily}`;
                ctx.strokeText(`${participant.entries} entries`, textRadius, fontSize - 2);
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
        
        // NO shadows - just solid web-safe colors
        ctx.beginPath();
        ctx.moveTo(pointerX, pointerY);
        ctx.lineTo(pointerX - pointerSize, pointerY - pointerSize * 1.5);
        ctx.lineTo(pointerX + pointerSize, pointerY - pointerSize * 1.5);
        ctx.closePath();
        
        // Web-safe pointer color
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
        
        // NO shadows - solid web-safe colors only
        ctx.beginPath();
        ctx.arc(settings.centerX, settings.centerY, hubRadius, 0, 2 * Math.PI);
        
        // Web-safe hub colors
        ctx.fillStyle = this.globalColorPalette.hubFill;
        ctx.fill();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.globalColorPalette.hubBorder;
        ctx.stroke();
        
        // Hub text with web-safe color - NO shadows
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

    // Generate spinning wheel with HIGHEST QUALITY settings to prevent quantization
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
            
            // CRITICAL: Create encoder with highest quality settings
            const encoder = this.createFixedPaletteEncoder(settings);
            encoder.start();
            
            // Calculate winning position
            const targetRotation = this.calculateWinnerRotation(participantData, winnerData);
            
            // Generate all frames with web-safe colors and complete state resets
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
            
            logger.success(`Anti-flashing wheel generated: ${fileSizeMB}MB, quality=1, web-safe colors`);
            return buffer;
            
        } catch (error) {
            logger.error('Failed to generate anti-flashing wheel:', error);
            throw error;
        }
    }

    // Generate looping wheel with anti-flashing measures
    async generateFixedPaletteLoopingWheel(participants, giveawayName = 'Giveaway', userOptions = {}) {
        try {
            const participantCount = Object.keys(participants).length;
            const settings = this.getOptimizedSettings(participantCount, userOptions);
            const participantData = this.prepareFixedParticipants(participants);
            
            if (participantData.length === 0) {
                return this.generateEmptyWheelGif(giveawayName, settings);
            }
            
            // Create encoder with anti-flashing settings
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
            logger.error('Failed to generate anti-flashing looping wheel:', error);
            throw error;
        }
    }

    // Optimized settings that prioritize color consistency over file size
    getOptimizedSettings(participantCount, userOptions = {}) {
        const settings = { ...this.defaultSettings };
        Object.assign(settings, userOptions);
        
        // CRITICAL: Always use quality 1 for consistency
        settings.quality = 1;
        
        // Adjust frame rate based on participant count
        if (participantCount > 15) {
            settings.frameDelay = Math.max(50, settings.frameDelay + 10); // Slower = more stable
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
            this.resetCanvasState(ctx, settings);
            
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
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
    }
}

module.exports = new WheelGeneratorFixed();