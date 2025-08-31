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
        // Optimized settings inspired by wheelofnames.com
        this.defaultSettings = {
            canvasSize: 500,        // Increased for better quality
            wheelRadius: 230,       // Larger wheel like wheelofnames
            hubRadius: 35,          // Proportional hub size
            fps: 25,               // Smooth animation
            quality: 12,           // Better quality for final output
            frameDelay: 40,        // 40ms = 25fps
            
            // Physics-based animation phases (like wheelofnames.com)
            phases: {
                accelerateFrames: 25,   // 1 second acceleration
                spinFrames: 75,         // 3 seconds high-speed spin
                decelerateFrames: 50,   // 2 seconds deceleration
                stopFrames: 10,         // 0.4 seconds highlighting winner
                celebrateFrames: 40     // 1.6 seconds celebration
            },
            
            // Looping wheel settings
            loopingFrames: 80,
            loopRotationSpeed: 0.015
        };
        
        // Modern color palette inspired by wheelofnames.com
        this.wheelOfNamesColors = [
            '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
            '#1ABC9C', '#E67E22', '#34495E', '#F1C40F', '#E91E63',
            '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#00BCD4',
            '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFC107',
            '#FF9800', '#FF5722', '#795548', '#607D8B', '#FF4081'
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

    getOptimizedSettings(participantCount, userOptions = {}) {
        const settings = { ...this.defaultSettings };
        
        // Apply user options first
        Object.assign(settings, userOptions);
        
        // Scale settings based on participant count for performance
        if (participantCount > 15) {
            settings.quality = Math.min(18, settings.quality + 3);
            settings.frameDelay = Math.max(50, settings.frameDelay + 10);
            
            // Reduce frame counts for better performance
            settings.phases.accelerateFrames = Math.max(20, settings.phases.accelerateFrames - 5);
            settings.phases.spinFrames = Math.max(60, settings.phases.spinFrames - 15);
            settings.phases.decelerateFrames = Math.max(40, settings.phases.decelerateFrames - 10);
            settings.phases.celebrateFrames = Math.max(30, settings.phases.celebrateFrames - 10);
        }
        
        // Recalculate derived values
        settings.centerX = settings.canvasSize / 2;
        settings.centerY = settings.canvasSize / 2;
        settings.wheelRadius = Math.min(settings.wheelRadius, (settings.canvasSize * 0.46) - 10);
        settings.hubRadius = settings.wheelRadius * 0.15;
        
        logger.debug(`Optimized settings for ${participantCount} participants:`, {
            canvasSize: settings.canvasSize,
            quality: settings.quality,
            totalFrames: Object.values(settings.phases).reduce((sum, frames) => sum + frames, 0),
            estimatedSize: `~${this.estimateFileSize(settings, participantCount)}MB`
        });
        
        return settings;
    }
    
    estimateFileSize(settings, participantCount) {
        const totalFrames = Object.values(settings.phases).reduce((sum, frames) => sum + frames, 0);
        const pixelCount = settings.canvasSize * settings.canvasSize;
        const complexityFactor = Math.min(2, participantCount / 10);
        const qualityFactor = settings.quality / 15;
        
        const estimate = (totalFrames * pixelCount * complexityFactor * qualityFactor) / (1024 * 1024 * 120);
        return Math.max(0.1, estimate).toFixed(1);
    }

    drawWheelOfNamesWheelImproved(ctx, participantData, settings, rotation = 0, highlightWinner = null) {
    ctx.save();
    ctx.translate(settings.centerX, settings.centerY);
    ctx.rotate(rotation);
    
    // FIXED: Anti-aliasing and smooth rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw wheel shadow first (consistent, no flashing)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    
    participantData.forEach((participant, index) => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, settings.wheelRadius, participant.startAngle, participant.endAngle);
        ctx.closePath();
        
        // FIXED: Stable coloring - no flashing
        const isHighlighted = highlightWinner && participant.userId === highlightWinner.userId;
        
        // Use consistent colors (no animation-based color changes)
        ctx.fillStyle = participant.color;
        ctx.fill();
        
        // FIXED: Consistent borders (prevent flashing)
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw text with stable styling
        this.drawWheelOfNamesTextImproved(ctx, participant, settings, highlightWinner);
    });
    
    ctx.restore();
}

drawWheelOfNamesTextImproved(ctx, participant, settings, highlightWinner = null) {
    const midAngle = (participant.startAngle + participant.endAngle) / 2;
    const textRadius = settings.wheelRadius * 0.72;
    
    ctx.save();
    ctx.rotate(midAngle);
    
    // Reset shadow for text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    
    const isHighlighted = highlightWinner && participant.userId === highlightWinner.userId;
    let fontSize = Math.max(10, settings.canvasSize / 28);
    
    // Adjust font size based on section size and text length
    const displayName = participant.displayName || participant.username || `User ${participant.userId.slice(-4)}`;
    const maxWidth = Math.max(60, participant.sectionAngle * settings.wheelRadius * 0.8);
    
    // Scale font to fit section
    ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
    let textWidth = ctx.measureText(displayName).width;
    if (textWidth > maxWidth) {
        fontSize = Math.max(8, fontSize * (maxWidth / textWidth));
    }
    
    if (isHighlighted) {
        fontSize = Math.min(fontSize + 3, settings.canvasSize / 20);
    }
    
    ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // FIXED: Stable text rendering
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    
    // Only draw text if section is large enough
    if (participant.sectionAngle > 0.15) {
        ctx.fillText(displayName, textRadius, -2);
        
        // Show entry count for larger sections
        if (participant.sectionAngle > 0.25) {
            ctx.font = `${Math.max(8, fontSize - 3)}px ${this.fontFamily}`;
            ctx.fillText(`${participant.entries} entries`, textRadius, fontSize - 2);
        }
    }
    
    ctx.restore();
}

drawWheelOfNamesPointerImproved(ctx, settings, glow = false) {
    ctx.save();
    
    const pointerX = settings.centerX;
    const pointerY = settings.centerY - settings.wheelRadius - 8;
    const pointerSize = Math.max(12, settings.canvasSize / 35);
    
    // FIXED: Stable shadow/glow (prevent flashing)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    
    // Draw pointer triangle
    ctx.beginPath();
    ctx.moveTo(pointerX, pointerY);
    ctx.lineTo(pointerX - pointerSize, pointerY - pointerSize * 1.5);
    ctx.lineTo(pointerX + pointerSize, pointerY - pointerSize * 1.5);
    ctx.closePath();
    
    ctx.fillStyle = '#DC3545';
    ctx.fill();
    
    // Border for pointer
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.restore();
}

drawWheelOfNamesHubImproved(ctx, giveawayName, settings) {
    ctx.save();
    
    // FIXED: Dynamic hub size based on giveaway name length
    const nameLength = giveawayName.length;
    let hubRadius = settings.hubRadius;
    
    // Increase hub size for longer names
    if (nameLength > 15) {
        hubRadius = Math.min(settings.hubRadius * 1.4, settings.wheelRadius * 0.25);
    } else if (nameLength > 10) {
        hubRadius = Math.min(settings.hubRadius * 1.2, settings.wheelRadius * 0.22);
    }
    
    // Hub shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    
    ctx.beginPath();
    ctx.arc(settings.centerX, settings.centerY, hubRadius, 0, 2 * Math.PI);
    
    // Clean white hub
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    
    ctx.strokeStyle = '#DEE2E6';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Reset shadow for text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    
    // FIXED: Dynamic font size based on hub size
    const fontSize = Math.max(8, Math.min(16, hubRadius / 3));
    ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#495057';
    
    // FIXED: Better text wrapping for longer names
    const maxWidth = hubRadius * 1.8;
    const lines = this.wrapTextImproved(giveawayName, maxWidth, ctx, fontSize);
    
    const lineHeight = fontSize + 2;
    const totalHeight = lines.length * lineHeight;
    const startY = settings.centerY - totalHeight / 2 + lineHeight / 2;
    
    lines.forEach((line, index) => {
        ctx.fillText(line, settings.centerX, startY + index * lineHeight);
    });
    
    ctx.restore();
}

wrapTextImproved(text, maxWidth, ctx, fontSize) {
    const words = text.split(' ');
    const lines = [];
    
    if (words.length === 1) {
        // Single word - check if it fits, otherwise truncate with ellipsis
        const textWidth = ctx.measureText(text).width;
        if (textWidth <= maxWidth) {
            lines.push(text);
        } else {
            // Truncate long single words
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
    
    // Limit to maximum 3 lines for hub
    if (lines.length > 3) {
        lines.splice(2);
        lines[1] = lines[1] + '...';
    }
    
    return lines;
}

    // Generate looping wheel GIF for showcurrentwheelstate (wheelofnames style)
    async generateLoopingWheel(participants, giveawayName = 'Giveaway', userOptions = {}) {
    try {
        const participantCount = Object.keys(participants).length;
        logger.wheel(`Generating looping wheel GIF for ${participantCount} participants`);
        
        const settings = this.getOptimizedSettings(participantCount, userOptions);
        const participantData = this.prepareParticipantData(participants);
        
        if (participantData.length === 0) {
            return this.generateEmptyWheelGif(giveawayName, settings);
        }
        
        // FIXED: Full 360° rotation for current wheel state
        const totalFrames = Math.max(80, Math.min(120, participantCount * 2)); // Adaptive frame count
        const rotationPerFrame = (2 * Math.PI) / totalFrames; // Complete 360° rotation
        
        // Initialize GIF encoder
        const encoder = new GifEncoder(settings.canvasSize, settings.canvasSize);
        
        if (encoder.setQuality) encoder.setQuality(settings.quality);
        if (encoder.setRepeat) encoder.setRepeat(0);
        if (encoder.setDelay) encoder.setDelay(settings.frameDelay);
        
        encoder.start();
        
        // Generate smooth 360° rotation frames
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < totalFrames; frame++) {
            const rotation = frame * rotationPerFrame;
            
            this.drawWheelOfNamesBackground(ctx, settings);
            this.drawWheelOfNamesWheelImproved(ctx, participantData, settings, rotation);
            this.drawWheelOfNamesPointerImproved(ctx, settings);
            this.drawWheelOfNamesHubImproved(ctx, giveawayName, settings);
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        
        const buffer = encoder.out.getData();
        const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
        
        logger.wheel(`Generated 360° looping wheel: ${buffer.length} bytes (${fileSizeMB}MB)`);
        
        if (buffer.length > 10 * 1024 * 1024) {
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
            
            // Clean background for each frame
            this.drawWheelOfNamesBackground(ctx, settings);
            this.drawWheelOfNamesWheel(ctx, participantData, settings, rotation);
            this.drawWheelOfNamesPointer(ctx, settings);
            this.drawWheelOfNamesHub(ctx, giveawayName, settings);
            
            encoder.addFrame(ctx);
        }
    }

    // Generate animated spinning wheel with winner selection (wheelofnames style)
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
            
            const totalFrames = Object.values(settings.phases).reduce((sum, frames) => sum + frames, 0);
            logger.debug(`Generating ${totalFrames} frames at ${settings.canvasSize}x${settings.canvasSize}`);
            
            // Initialize GIF encoder
            const encoder = new GifEncoder(settings.canvasSize, settings.canvasSize);
            
            if (encoder.setQuality) encoder.setQuality(settings.quality);
            if (encoder.setRepeat) encoder.setRepeat(0);
            if (encoder.setDelay) encoder.setDelay(settings.frameDelay);
            
            encoder.start();
            
            // Calculate winner position for physics-based animation
            const targetRotation = this.calculateWinnerRotation(participantData, winnerData);
            
            // Generate frames for each phase (wheelofnames physics simulation)
            await this.generateAccelerateFrames(encoder, participantData, giveawayName, settings);
            await this.generateHighSpeedSpinFrames(encoder, participantData, giveawayName, settings);
            await this.generateDecelerateFrames(encoder, participantData, giveawayName, targetRotation, settings);
            await this.generateWinnerHighlightFrames(encoder, participantData, winnerData, giveawayName, targetRotation, settings);
            await this.generateCelebrationFrames(encoder, participantData, winnerData, giveawayName, targetRotation, settings);
            
            encoder.finish();
            
            const buffer = encoder.out.getData();
            const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
            
            logger.wheel(`Generated animated wheel: ${buffer.length} bytes (${fileSizeMB}MB)`);
            
            if (buffer.length > 10 * 1024 * 1024) {
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
                color: this.wheelOfNamesColors[index % this.wheelOfNamesColors.length],
                textColor: this.getContrastColor(this.wheelOfNamesColors[index % this.wheelOfNamesColors.length]),
                displayName: participant.displayName || participant.username || `User ${participant.userId.slice(-4)}`
            };
            
            currentAngle += sectionAngle;
            return data;
        });
    }

    // WheelOfNames-style background with subtle gradient
    drawWheelOfNamesBackground(ctx, settings) {
        // Clean white/light background like wheelofnames.com
        const gradient = ctx.createRadialGradient(
            settings.centerX, settings.centerY, 0,
            settings.centerX, settings.centerY, settings.canvasSize / 2
        );
        gradient.addColorStop(0, '#F8F9FA');
        gradient.addColorStop(1, '#E9ECEF');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, settings.canvasSize, settings.canvasSize);
    }

    // WheelOfNames-style wheel with clean design
    drawWheelOfNamesWheel(ctx, participantData, settings, rotation = 0, highlightWinner = null) {
        ctx.save();
        ctx.translate(settings.centerX, settings.centerY);
        ctx.rotate(rotation);
        
        // Draw wheel shadow first
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        
        participantData.forEach(participant => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, settings.wheelRadius, participant.startAngle, participant.endAngle);
            ctx.closePath();
            
            // Highlight winner with glow effect
            if (highlightWinner && participant.userId === highlightWinner.userId) {
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 15;
            } else {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
                ctx.shadowBlur = 8;
            }
            
            ctx.fillStyle = participant.color;
            ctx.fill();
            
            // Clean white borders between sections
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            this.drawWheelOfNamesText(ctx, participant, settings, highlightWinner);
        });
        
        ctx.restore();
    }

    drawWheelOfNamesText(ctx, participant, settings, highlightWinner = null) {
        const midAngle = (participant.startAngle + participant.endAngle) / 2;
        const textRadius = settings.wheelRadius * 0.72;
        
        ctx.save();
        ctx.rotate(midAngle);
        
        // Reset shadow for text
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        const isHighlighted = highlightWinner && participant.userId === highlightWinner.userId;
        let fontSize = Math.max(10, settings.canvasSize / 28);
        
        // Adjust font size based on section size and text length
        const displayName = participant.displayName || participant.username || `User ${participant.userId.slice(-4)}`;
        const maxWidth = Math.max(60, participant.sectionAngle * settings.wheelRadius * 0.8);
        
        // Scale font to fit section
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        let textWidth = ctx.measureText(displayName).width;
        if (textWidth > maxWidth) {
            fontSize = Math.max(8, fontSize * (maxWidth / textWidth));
        }
        
        if (isHighlighted) {
            fontSize = Math.min(fontSize + 3, settings.canvasSize / 20);
        }
        
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // White text with subtle shadow for readability
        ctx.fillStyle = '#FFFFFF';
        if (!isHighlighted) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetY = 1;
        } else {
            // Golden text for winner
            ctx.fillStyle = '#FFD700';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 2;
        }
        
        // Only draw text if section is large enough
        if (participant.sectionAngle > 0.15) {
            ctx.fillText(displayName, textRadius, -2);
            
            // Show entry count for larger sections
            if (participant.sectionAngle > 0.25) {
                ctx.font = `${Math.max(8, fontSize - 3)}px ${this.fontFamily}`;
                ctx.fillText(`${participant.entries} entries`, textRadius, fontSize - 2);
            }
        }
        
        ctx.restore();
    }

    // WheelOfNames-style pointer (more prominent)
    drawWheelOfNamesPointer(ctx, settings, glow = false) {
        ctx.save();
        
        const pointerX = settings.centerX;
        const pointerY = settings.centerY - settings.wheelRadius - 8;
        const pointerSize = Math.max(12, settings.canvasSize / 35);
        
        if (glow) {
            ctx.shadowColor = '#FF6B35';
            ctx.shadowBlur = 10;
        } else {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
        }
        
        // Draw pointer triangle
        ctx.beginPath();
        ctx.moveTo(pointerX, pointerY);
        ctx.lineTo(pointerX - pointerSize, pointerY - pointerSize * 1.5);
        ctx.lineTo(pointerX + pointerSize, pointerY - pointerSize * 1.5);
        ctx.closePath();
        
        ctx.fillStyle = glow ? '#FF6B35' : '#DC3545';
        ctx.fill();
        
        // Border for pointer
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }

    // WheelOfNames-style hub (center circle)
    drawWheelOfNamesHub(ctx, giveawayName, settings) {
        ctx.save();
        
        // Hub shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        
        ctx.beginPath();
        ctx.arc(settings.centerX, settings.centerY, settings.hubRadius, 0, 2 * Math.PI);
        
        // Clean white hub like wheelofnames.com
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        
        ctx.strokeStyle = '#DEE2E6';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Reset shadow for text
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        // Hub text
        const fontSize = Math.max(10, settings.canvasSize / 35);
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#495057';
        
        const maxWidth = settings.hubRadius * 1.6;
        const lines = this.wrapText(giveawayName, maxWidth, ctx);
        
        const lineHeight = fontSize + 1;
        const totalHeight = lines.length * lineHeight;
        const startY = settings.centerY - totalHeight / 2 + lineHeight / 2;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, settings.centerX, startY + index * lineHeight);
        });
        
        ctx.restore();
    }

    // Physics-based animation phases (like wheelofnames.com)
    async generateAccelerateFrames(encoder, participantData, giveawayName, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < settings.phases.accelerateFrames; frame++) {
            const progress = frame / settings.phases.accelerateFrames;
            const easeProgress = this.easeInCubic(progress);
            const rotationSpeed = 0.05 + (easeProgress * 0.4); // Accelerate to high speed
            const rotation = (frame * rotationSpeed) % (2 * Math.PI);
            
            this.drawWheelOfNamesBackground(ctx, settings);
            this.drawWheelOfNamesWheel(ctx, participantData, settings, rotation);
            this.drawWheelOfNamesPointer(ctx, settings);
            this.drawWheelOfNamesHub(ctx, giveawayName, settings);
            
            encoder.addFrame(ctx);
        }
    }

    async generateHighSpeedSpinFrames(encoder, participantData, giveawayName, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        const baseRotationSpeed = 0.45;
        let totalRotation = settings.phases.accelerateFrames * 0.225; // Carry over from acceleration
        
        for (let frame = 0; frame < settings.phases.spinFrames; frame++) {
            const rotationSpeed = baseRotationSpeed + (Math.sin(frame * 0.1) * 0.05); // Slight variation
            totalRotation += rotationSpeed;
            const rotation = totalRotation % (2 * Math.PI);
            
            this.drawWheelOfNamesBackground(ctx, settings);
            this.drawWheelOfNamesWheel(ctx, participantData, settings, rotation);
            this.drawWheelOfNamesPointer(ctx, settings);
            this.drawWheelOfNamesHub(ctx, giveawayName, settings);
            
            encoder.addFrame(ctx);
        }
    }

    async generateDecelerateFrames(encoder, participantData, giveawayName, targetRotation, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        // Calculate starting rotation from previous phase
        const initialRotation = (settings.phases.accelerateFrames * 0.225) + 
                               (settings.phases.spinFrames * 0.45);
        
        for (let frame = 0; frame < settings.phases.decelerateFrames; frame++) {
            const progress = frame / settings.phases.decelerateFrames;
            const easeProgress = this.easeOutCubic(progress);
            
            const rotation = initialRotation + (targetRotation - initialRotation) * easeProgress;
            
            this.drawWheelOfNamesBackground(ctx, settings);
            this.drawWheelOfNamesWheel(ctx, participantData, settings, rotation);
            this.drawWheelOfNamesPointer(ctx, settings);
            this.drawWheelOfNamesHub(ctx, giveawayName, settings);
            
            encoder.addFrame(ctx);
        }
    }

    async generateWinnerHighlightFrames(encoder, participantData, winner, giveawayName, finalRotation, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < settings.phases.stopFrames; frame++) {
            this.drawWheelOfNamesBackground(ctx, settings);
            this.drawWheelOfNamesWheel(ctx, participantData, settings, finalRotation, winner);
            this.drawWheelOfNamesPointer(ctx, settings, true); // Glowing pointer
            this.drawWheelOfNamesHub(ctx, giveawayName, settings);
            this.drawWinnerBanner(ctx, winner, settings);
            
            encoder.addFrame(ctx);
        }
    }

    async generateCelebrationFrames(encoder, participantData, winner, giveawayName, finalRotation, settings) {
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < settings.phases.celebrateFrames; frame++) {
            // Gentle rotation during celebration
            const celebrationRotation = finalRotation + (frame * 0.005);
            
            this.drawWheelOfNamesBackground(ctx, settings);
            this.drawWheelOfNamesWheel(ctx, participantData, settings, celebrationRotation, winner);
            this.drawWheelOfNamesPointer(ctx, settings, true);
            this.drawWheelOfNamesHub(ctx, giveawayName, settings);
            this.drawWinnerBanner(ctx, winner, settings);
            
            // Add celebration particles
            if (frame % 4 === 0) {
                this.drawCelebrationParticles(ctx, frame, settings);
            }
            
            encoder.addFrame(ctx);
        }
    }

    drawWinnerBanner(ctx, winner, settings) {
        const displayName = winner.displayName || winner.username || `User ${winner.userId.slice(-4)}`;
        
        ctx.save();
        
        // Banner at bottom
        const bannerY = settings.canvasSize - 50;
        const bannerHeight = 40;
        const bannerWidth = Math.min(300, settings.canvasSize * 0.9);
        const bannerX = (settings.canvasSize - bannerWidth) / 2;
        
        // Banner background with gradient
        const gradient = ctx.createLinearGradient(bannerX, bannerY, bannerX, bannerY + bannerHeight);
        gradient.addColorStop(0, '#28A745');
        gradient.addColorStop(1, '#20C997');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(bannerX, bannerY, bannerWidth, bannerHeight);
        
        // Banner border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(bannerX, bannerY, bannerWidth, bannerHeight);
        
        // Winner text
        const fontSize = Math.max(14, settings.canvasSize / 25);
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 2;
        
        ctx.fillText('🎉 WINNER! 🎉', settings.centerX, bannerY + 12);
        
        ctx.font = `${fontSize - 2}px ${this.fontFamily}`;
        ctx.fillText(displayName, settings.centerX, bannerY + 28);
        
        ctx.restore();
    }

    drawCelebrationParticles(ctx, frame, settings) {
        const particleCount = 12;
        
        ctx.save();
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * 2 * Math.PI;
            const distance = 40 + (frame * 1.5);
            const x = settings.centerX + Math.cos(angle + frame * 0.08) * distance;
            const y = settings.centerY + Math.sin(angle + frame * 0.08) * distance;
            
            const size = 3 + Math.sin(frame * 0.2 + i) * 1.5;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, 2 * Math.PI);
            ctx.fillStyle = i % 3 === 0 ? '#FFD700' : i % 3 === 1 ? '#FF6B35' : '#28A745';
            ctx.fill();
        }
        
        ctx.restore();
    }

    // Utility methods
    calculateWinnerRotation(participantData, winner) {
        const winnerMidAngle = (winner.startAngle + winner.endAngle) / 2;
        const targetAngle = (Math.PI * 3/2) - winnerMidAngle; // Point to top (12 o'clock)
        
        // Multiple full rotations before landing on winner
        const fullRotations = 6 + Math.random() * 4; // 6-10 full rotations
        return targetAngle + (fullRotations * 2 * Math.PI);
    }

    // Easing functions for physics simulation
    easeInCubic(t) {
        return t * t * t;
    }

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

    async generateEmptyWheelGif(giveawayName, settings) {
        const encoder = new GifEncoder(settings.canvasSize, settings.canvasSize);
        
        if (encoder.setQuality) encoder.setQuality(settings.quality);
        if (encoder.setRepeat) encoder.setRepeat(0);
        if (encoder.setDelay) encoder.setDelay(settings.frameDelay);
        
        encoder.start();
        
        const canvas = createCanvas(settings.canvasSize, settings.canvasSize);
        const ctx = canvas.getContext('2d');
        
        // Generate frames of empty wheel
        for (let frame = 0; frame < 40; frame++) {
            this.drawWheelOfNamesBackground(ctx, settings);
            
            // Empty wheel circle
            ctx.beginPath();
            ctx.arc(settings.centerX, settings.centerY, settings.wheelRadius, 0, 2 * Math.PI);
            ctx.fillStyle = '#F8F9FA';
            ctx.fill();
            ctx.strokeStyle = '#DEE2E6';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // "No Participants" text
            const fontSize = Math.max(18, settings.canvasSize / 20);
            ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#6C757D';
            ctx.fillText('No Participants', settings.centerX, settings.centerY - 15);
            
            ctx.font = `${fontSize - 4}px ${this.fontFamily}`;
            ctx.fillStyle = '#ADB5BD';
            ctx.fillText('Add purchases to populate wheel', settings.centerX, settings.centerY + 15);
            
            this.drawWheelOfNamesHub(ctx, giveawayName, settings);
            
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
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
            logger.warn(`Large number of participants (${participantCount}) will generate optimized wheel for file size limits`);
        }
        
        return true;
    }
}

module.exports = new WheelGenerator();