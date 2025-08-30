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
        this.canvasSize = 800;
        this.centerX = this.canvasSize / 2;
        this.centerY = this.canvasSize / 2;
        this.wheelRadius = 350;
        this.hubRadius = 40;
        
        // Animation settings
        this.fps = 30;
        this.frameDelay = 1000 / this.fps; // milliseconds per frame
        
        // Phase durations (in frames)
        this.phases = {
            preSpinFrames: 60,    // 2 seconds at 30fps
            spinFrames: 120,      // 4 seconds of fast spinning
            slowFrames: 60,       // 2 seconds of slowing down
            stopFrames: 30,       // 1 second highlighting winner
            victoryFrames: 90     // 3 seconds of victory animation
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
            // Try to register a font file if available
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

    // Generate static wheel showing current participants
    async generateStaticWheel(participants, giveawayName = 'Giveaway') {
        try {
            const canvas = createCanvas(this.canvasSize, this.canvasSize);
            const ctx = canvas.getContext('2d');
            
            // Prepare participant data
            const participantData = this.prepareParticipantData(participants);
            
            if (participantData.length === 0) {
                return this.generateEmptyWheel(canvas, ctx, giveawayName);
            }
            
            // Draw background
            this.drawBackground(ctx);
            
            // Draw wheel sections
            this.drawWheelSections(ctx, participantData);
            
            // Draw pointer
            this.drawPointer(ctx);
            
            // Draw center hub
            this.drawHub(ctx, giveawayName);
            
            // Add timestamp
            this.addTimestamp(ctx);
            
            return canvas.toBuffer('image/png');
            
        } catch (error) {
            logger.error('Failed to generate static wheel:', error);
            throw error;
        }
    }

    // Generate animated spinning wheel with winner selection
    async generateSpinningWheel(participants, winner, giveawayName = 'Giveaway') {
        try {
            logger.wheel(`Generating animated wheel for ${Object.keys(participants).length} participants`);
            
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
            const totalFrames = Object.values(this.phases).reduce((sum, frames) => sum + frames, 0);
            
            // Initialize GIF encoder
            const encoder = new GifEncoder(this.canvasSize, this.canvasSize);
            
            // Configure encoder
            if (encoder.setQuality) encoder.setQuality(10);
            if (encoder.setRepeat) encoder.setRepeat(0); // 0 = loop forever
            if (encoder.setDelay) encoder.setDelay(this.frameDelay);
            
            encoder.start();
            
            let currentFrame = 0;
            let currentRotation = 0;
            let targetRotation = this.calculateWinnerRotation(participantData, winnerData);
            
            // Generate frames for each phase
            await this.generatePreSpinFrames(encoder, participantData, giveawayName);
            currentFrame += this.phases.preSpinFrames;
            
            await this.generateSpinFrames(encoder, participantData, giveawayName, currentFrame);
            currentFrame += this.phases.spinFrames;
            
            await this.generateSlowFrames(encoder, participantData, giveawayName, targetRotation, currentFrame);
            currentFrame += this.phases.slowFrames;
            
            await this.generateStopFrames(encoder, participantData, winnerData, giveawayName, targetRotation);
            currentFrame += this.phases.stopFrames;
            
            await this.generateVictoryFrames(encoder, participantData, winnerData, giveawayName, targetRotation);
            
            encoder.finish();
            
            const buffer = encoder.out.getData();
            logger.wheel(`Generated animated wheel: ${buffer.length} bytes`);
            
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
                textColor: this.getContrastColor(this.colors[index % this.colors.length])
            };
            
            currentAngle += sectionAngle;
            return data;
        });
    }

    drawBackground(ctx) {
        // Dark gradient background
        const gradient = ctx.createRadialGradient(
            this.centerX, this.centerY, 0,
            this.centerX, this.centerY, this.canvasSize / 2
        );
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(1, '#2d2d2d');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.canvasSize, this.canvasSize);
    }

    drawWheelSections(ctx, participantData, rotation = 0, highlightWinner = null) {
        ctx.save();
        ctx.translate(this.centerX, this.centerY);
        ctx.rotate(rotation);
        
        // Draw each section
        participantData.forEach(participant => {
            // Draw section background
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, this.wheelRadius, participant.startAngle, participant.endAngle);
            ctx.closePath();
            
            // Apply glow effect for winner
            if (highlightWinner && participant.userId === highlightWinner.userId) {
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 20;
            } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }
            
            ctx.fillStyle = participant.color;
            ctx.fill();
            
            // Draw section border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw text
            this.drawSectionText(ctx, participant, highlightWinner);
        });
        
        ctx.restore();
    }

    drawSectionText(ctx, participant, highlightWinner = null) {
        const midAngle = (participant.startAngle + participant.endAngle) / 2;
        const textRadius = this.wheelRadius * 0.7;
        
        ctx.save();
        ctx.rotate(midAngle);
        
        // Set font
        const isHighlighted = highlightWinner && participant.userId === highlightWinner.userId;
        const fontSize = isHighlighted ? 18 : Math.max(12, Math.min(16, participant.sectionAngle * 100));
        ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Text content
        const displayName = participant.displayName || `User ${participant.userId.slice(0, 4)}`;
        const entriesText = `${participant.entries} entries`;
        
        // Draw text with outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.fillStyle = isHighlighted ? '#FFD700' : participant.textColor;
        
        // Draw name
        ctx.strokeText(displayName, textRadius, -8);
        ctx.fillText(displayName, textRadius, -8);
        
        // Draw entries (smaller font)
        ctx.font = `${fontSize - 4}px ${this.fontFamily}`;
        ctx.strokeText(entriesText, textRadius, 8);
        ctx.fillText(entriesText, textRadius, 8);
        
        ctx.restore();
    }

    drawPointer(ctx, glow = false) {
        ctx.save();
        
        // Pointer position (top of wheel)
        const pointerX = this.centerX;
        const pointerY = this.centerY - this.wheelRadius - 20;
        
        if (glow) {
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 15;
        }
        
        // Draw pointer triangle
        ctx.beginPath();
        ctx.moveTo(pointerX, pointerY);
        ctx.lineTo(pointerX - 15, pointerY - 30);
        ctx.lineTo(pointerX + 15, pointerY - 30);
        ctx.closePath();
        
        ctx.fillStyle = '#FFD700';
        ctx.fill();
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }

    drawHub(ctx, giveawayName) {
        // Draw center hub circle
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.hubRadius, 0, 2 * Math.PI);
        
        // Hub gradient
        const hubGradient = ctx.createRadialGradient(
            this.centerX, this.centerY, 0,
            this.centerX, this.centerY, this.hubRadius
        );
        hubGradient.addColorStop(0, '#4A4A4A');
        hubGradient.addColorStop(1, '#2A2A2A');
        
        ctx.fillStyle = hubGradient;
        ctx.fill();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw giveaway name in center
        ctx.font = `bold 12px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        
        const maxWidth = this.hubRadius * 1.5;
        const lines = this.wrapText(giveawayName, maxWidth, ctx);
        
        const lineHeight = 14;
        const totalHeight = lines.length * lineHeight;
        const startY = this.centerY - totalHeight / 2 + lineHeight / 2;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, this.centerX, startY + index * lineHeight);
        });
    }

    addTimestamp(ctx, zones = ['UTC+1', 'ET', 'PT']) {
        const now = new Date();
        
        // UTC+1 (approximate)
        const utc1 = new Date(now.getTime() + (60 * 60 * 1000));
        // ET (approximate - doesn't account for DST)
        const et = new Date(now.getTime() - (5 * 60 * 60 * 1000));
        // PT (approximate - doesn't account for DST)  
        const pt = new Date(now.getTime() - (8 * 60 * 60 * 1000));
        
        const times = {
            'UTC+1': utc1.toLocaleString('en-US', { hour12: true }),
            'ET': et.toLocaleString('en-US', { hour12: true }),
            'PT': pt.toLocaleString('en-US', { hour12: true })
        };
        
        ctx.save();
        ctx.font = `10px ${this.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#CCCCCC';
        
        let y = 20;
        zones.forEach(zone => {
            if (times[zone]) {
                ctx.fillText(`${zone}: ${times[zone]}`, 10, y);
                y += 15;
            }
        });
        
        ctx.restore();
    }

    generateEmptyWheel(canvas, ctx, giveawayName) {
        // Draw background
        this.drawBackground(ctx);
        
        // Draw empty wheel
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.wheelRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#444444';
        ctx.fill();
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw "No Participants" text
        ctx.font = `bold 24px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#CCCCCC';
        ctx.fillText('No Participants', this.centerX, this.centerY - 20);
        
        ctx.font = `16px ${this.fontFamily}`;
        ctx.fillText('Add purchases to see wheel', this.centerX, this.centerY + 20);
        
        // Draw hub
        this.drawHub(ctx, giveawayName);
        
        // Add timestamp
        this.addTimestamp(ctx);
        
        return canvas.toBuffer('image/png');
    }

    calculateWinnerRotation(participantData, winner) {
        // Calculate rotation needed to land on winner
        const winnerMidAngle = (winner.startAngle + winner.endAngle) / 2;
        
        // We want the winner section to be at the top (where pointer is)
        // Top is at -π/2 (or 3π/2)
        const targetAngle = (Math.PI * 3/2) - winnerMidAngle;
        
        // Add multiple full rotations for dramatic effect
        const extraRotations = 8 + Math.random() * 4; // 8-12 full rotations
        return targetAngle + (extraRotations * 2 * Math.PI);
    }

    async generatePreSpinFrames(encoder, participantData, giveawayName) {
        const canvas = createCanvas(this.canvasSize, this.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < this.phases.preSpinFrames; frame++) {
            // Clear canvas
            this.drawBackground(ctx);
            
            // Draw static wheel
            this.drawWheelSections(ctx, participantData);
            
            // Draw pointer
            this.drawPointer(ctx);
            
            // Draw hub
            this.drawHub(ctx, giveawayName);
            
            // Add timestamp
            this.addTimestamp(ctx);
            
            // Add frame to GIF
            encoder.addFrame(ctx);
        }
    }

    async generateSpinFrames(encoder, participantData, giveawayName, startFrame) {
        const canvas = createCanvas(this.canvasSize, this.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < this.phases.spinFrames; frame++) {
            // Calculate rotation speed (starts fast, stays fast)
            const progress = frame / this.phases.spinFrames;
            const rotationSpeed = 0.8 - (progress * 0.2); // Slight slowdown
            const rotation = frame * rotationSpeed;
            
            // Clear canvas
            this.drawBackground(ctx);
            
            // Draw spinning wheel
            this.drawWheelSections(ctx, participantData, rotation);
            
            // Draw pointer with slight glow during fast spin
            this.drawPointer(ctx, true);
            
            // Draw hub
            this.drawHub(ctx, giveawayName);
            
            // Add timestamp
            this.addTimestamp(ctx);
            
            // Add motion blur effect during fast spinning
            if (frame % 3 === 0) {
                ctx.save();
                ctx.globalAlpha = 0.1;
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, this.canvasSize, this.canvasSize);
                ctx.restore();
            }
            
            encoder.addFrame(ctx);
        }
    }

    async generateSlowFrames(encoder, participantData, giveawayName, targetRotation, startFrame) {
        const canvas = createCanvas(this.canvasSize, this.canvasSize);
        const ctx = canvas.getContext('2d');
        
        const initialRotation = this.phases.spinFrames * 0.6; // From last spin frame
        
        for (let frame = 0; frame < this.phases.slowFrames; frame++) {
            // Easing function for smooth deceleration
            const progress = frame / this.phases.slowFrames;
            const easedProgress = this.easeOutCubic(progress);
            
            const rotation = initialRotation + (targetRotation - initialRotation) * easedProgress;
            
            // Clear canvas
            this.drawBackground(ctx);
            
            // Draw slowing wheel
            this.drawWheelSections(ctx, participantData, rotation);
            
            // Draw pointer
            this.drawPointer(ctx);
            
            // Draw hub
            this.drawHub(ctx, giveawayName);
            
            // Add timestamp
            this.addTimestamp(ctx);
            
            encoder.addFrame(ctx);
        }
    }

    async generateStopFrames(encoder, participantData, winner, giveawayName, finalRotation) {
        const canvas = createCanvas(this.canvasSize, this.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < this.phases.stopFrames; frame++) {
            // Clear canvas
            this.drawBackground(ctx);
            
            // Draw wheel with winner highlighted
            this.drawWheelSections(ctx, participantData, finalRotation, winner);
            
            // Draw glowing pointer
            this.drawPointer(ctx, true);
            
            // Draw hub
            this.drawHub(ctx, giveawayName);
            
            // Add timestamp
            this.addTimestamp(ctx);
            
            // Add winner text
            this.drawWinnerText(ctx, winner, frame);
            
            encoder.addFrame(ctx);
        }
    }

    async generateVictoryFrames(encoder, participantData, winner, giveawayName, finalRotation) {
        const canvas = createCanvas(this.canvasSize, this.canvasSize);
        const ctx = canvas.getContext('2d');
        
        for (let frame = 0; frame < this.phases.victoryFrames; frame++) {
            // Clear canvas
            this.drawBackground(ctx);
            
            // Gentle rotation for victory animation
            const victoryRotation = finalRotation + (frame * 0.02);
            
            // Draw wheel with winner highlighted
            this.drawWheelSections(ctx, participantData, victoryRotation, winner);
            
            // Draw glowing pointer
            this.drawPointer(ctx, true);
            
            // Draw hub
            this.drawHub(ctx, giveawayName);
            
            // Add timestamp
            this.addTimestamp(ctx);
            
            // Animated winner text
            this.drawWinnerText(ctx, winner, frame);
            
            // Add celebration particles
            this.drawCelebrationParticles(ctx, frame);
            
            encoder.addFrame(ctx);
        }
    }

    drawWinnerText(ctx, winner, frame) {
        const displayName = winner.displayName || `User ${winner.userId.slice(0, 8)}`;
        
        ctx.save();
        
        // Pulsing effect
        const scale = 1 + Math.sin(frame * 0.2) * 0.1;
        ctx.translate(this.centerX, this.canvasSize - 80);
        ctx.scale(scale, scale);
        
        // Background box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(-150, -25, 300, 50);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.strokeRect(-150, -25, 300, 50);
        
        // Winner text
        ctx.font = `bold 24px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('🎉 WINNER! 🎉', 0, -8);
        
        ctx.font = `18px ${this.fontFamily}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(displayName, 0, 12);
        
        ctx.restore();
    }

    drawCelebrationParticles(ctx, frame) {
        const particleCount = 20;
        
        ctx.save();
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * 2 * Math.PI;
            const distance = 50 + (frame * 2);
            const x = this.centerX + Math.cos(angle + frame * 0.1) * distance;
            const y = this.centerY + Math.sin(angle + frame * 0.1) * distance;
            
            // Particle size varies with frame
            const size = 3 + Math.sin(frame * 0.3 + i) * 2;
            
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
        // Convert hex to RGB
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        
        // Calculate luminance
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

    // Public helper method to select random winner based on entries
    selectRandomWinner(participants) {
        const participantArray = Object.values(participants);
        
        if (participantArray.length === 0) {
            return null;
        }
        
        const totalEntries = participantArray.reduce((sum, p) => sum + (p.entries || 0), 0);
        
        if (totalEntries === 0) {
            // If no entries, pick randomly
            return participantArray[Math.floor(Math.random() * participantArray.length)];
        }
        
        // Weighted random selection
        let random = Math.random() * totalEntries;
        
        for (const participant of participantArray) {
            random -= (participant.entries || 0);
            if (random <= 0) {
                return participant;
            }
        }
        
        // Fallback (shouldn't happen)
        return participantArray[participantArray.length - 1];
    }

    // Validate wheel generation requirements
    validateWheelData(participants, giveawayName) {
        if (!participants || typeof participants !== 'object') {
            throw new Error('Invalid participants data');
        }
        
        if (!giveawayName || typeof giveawayName !== 'string') {
            throw new Error('Invalid giveaway name');
        }
        
        const participantCount = Object.keys(participants).length;
        if (participantCount > 50) {
            logger.warn(`Large number of participants (${participantCount}) may slow down wheel generation`);
        }
        
        return true;
    }
}

module.exports = new WheelGenerator();