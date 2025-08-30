const { createCanvas, registerFont } = require('canvas');
const sharp = require('sharp');
const WebP = require('node-webpmux');

class WheelRenderer {
    constructor() {
        this.wheelColors = [
            '#FF0000', // Red
            '#0000FF', // Blue
            '#FFFF00', // Yellow
            '#00FF00', // Green
            '#FFA500', // Orange
            '#800080', // Purple
            '#FFC0CB', // Pink
            '#00FFFF', // Cyan
            '#00FF80', // Lime
            '#FF00FF', // Magenta
            '#FF7F50', // Coral
            '#008080', // Teal
            '#4169E1', // Royal Blue
            '#FF1493', // Deep Pink
            '#32CD32', // Lime Green
            '#FF4500'  // Orange Red
        ];
        
        this.wheelSize = 600;
        this.centerX = this.wheelSize / 2;
        this.centerY = this.wheelSize / 2;
        this.radius = 250;
        
        // Load font if available
        try {
            registerFont('./assets/fonts/wheel-font.ttf', { family: 'WheelFont' });
            this.fontFamily = 'WheelFont';
        } catch {
            this.fontFamily = 'Arial';
        }
    }

    // Create wheel segments based on participant entries
    createSegments(participants) {
        const segments = [];
        let startAngle = 0;
        const totalEntries = Object.values(participants).reduce((sum, p) => sum + p.totalEntries, 0);

        if (totalEntries === 0) {
            throw new Error('No entries found for participants');
        }

        let colorIndex = 0;
        for (const [userId, participant] of Object.entries(participants)) {
            if (participant.totalEntries > 0) {
                const angleSize = (participant.totalEntries / totalEntries) * 2 * Math.PI;
                
                segments.push({
                    userId,
                    displayName: participant.displayName || `User ${userId.slice(-4)}`,
                    entries: participant.totalEntries,
                    startAngle,
                    endAngle: startAngle + angleSize,
                    color: this.wheelColors[colorIndex % this.wheelColors.length],
                    textColor: this.getContrastColor(this.wheelColors[colorIndex % this.wheelColors.length])
                });

                startAngle += angleSize;
                colorIndex++;
            }
        }

        return segments;
    }

    // Get contrasting text color
    getContrastColor(hexColor) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }

    // Draw a single frame of the wheel
    drawWheelFrame(segments, rotation = 0, winnerSegment = null, celebration = false) {
        const canvas = createCanvas(this.wheelSize, this.wheelSize);
        const ctx = canvas.getContext('2d');

        // Clear canvas with transparent background
        ctx.clearRect(0, 0, this.wheelSize, this.wheelSize);

        // Draw wheel shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;

        // Draw segments
        for (const segment of segments) {
            ctx.beginPath();
            ctx.moveTo(this.centerX, this.centerY);
            
            const startAngle = segment.startAngle + rotation;
            const endAngle = segment.endAngle + rotation;
            
            ctx.arc(this.centerX, this.centerY, this.radius, startAngle, endAngle);
            ctx.closePath();

            // Highlight winner segment
            if (celebration && winnerSegment && segment.userId === winnerSegment.userId) {
                const pulseIntensity = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
                ctx.fillStyle = this.lightenColor(segment.color, pulseIntensity);
            } else {
                ctx.fillStyle = segment.color;
            }
            
            ctx.fill();
            
            // Draw segment border
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();

        // Draw text labels
        ctx.fillStyle = '#000000';
        ctx.font = '14px ' + this.fontFamily;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const segment of segments) {
            const midAngle = (segment.startAngle + segment.endAngle) / 2 + rotation;
            const textRadius = this.radius * 0.7;
            const textX = this.centerX + Math.cos(midAngle) * textRadius;
            const textY = this.centerY + Math.sin(midAngle) * textRadius;

            ctx.save();
            ctx.translate(textX, textY);
            ctx.rotate(midAngle > Math.PI / 2 && midAngle < 3 * Math.PI / 2 ? midAngle + Math.PI : midAngle);
            
            ctx.fillStyle = segment.textColor;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 2;
            
            // Truncate long names
            let displayName = segment.displayName;
            if (displayName.length > 12) {
                displayName = displayName.substring(0, 10) + '..';
            }
            
            ctx.fillText(displayName, 0, -5);
            ctx.font = '10px ' + this.fontFamily;
            ctx.fillText(`${segment.entries} entries`, 0, 8);
            
            ctx.restore();
        }

        // Draw center circle
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, 30, 0, 2 * Math.PI);
        ctx.fillStyle = '#333333';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw pointer
        this.drawPointer(ctx);

        // Add celebration effects
        if (celebration) {
            this.drawCelebrationEffects(ctx, winnerSegment);
        }

        return canvas;
    }

    // Draw the pointer
    drawPointer(ctx) {
        const pointerSize = 40;
        const pointerX = this.centerX + this.radius + 10;
        const pointerY = this.centerY;

        ctx.beginPath();
        ctx.moveTo(pointerX, pointerY);
        ctx.lineTo(pointerX - pointerSize, pointerY - pointerSize / 2);
        ctx.lineTo(pointerX - pointerSize, pointerY + pointerSize / 2);
        ctx.closePath();

        ctx.fillStyle = '#FFD700';
        ctx.fill();
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Add pointer shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
    }

    // Draw celebration effects
    drawCelebrationEffects(ctx, winnerSegment) {
        const time = Date.now() * 0.01;
        
        // Draw sparkles around the wheel
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * 2 * Math.PI + time;
            const sparkleRadius = this.radius + 50 + Math.sin(time * 2 + i) * 20;
            const x = this.centerX + Math.cos(angle) * sparkleRadius;
            const y = this.centerY + Math.sin(angle) * sparkleRadius;
            
            ctx.beginPath();
            ctx.arc(x, y, 3 + Math.sin(time * 3 + i) * 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#FFD700';
            ctx.fill();
        }

        // Draw winner highlight ring
        if (winnerSegment) {
            const pulseRadius = this.radius + 10 + Math.sin(time * 4) * 15;
            ctx.beginPath();
            ctx.arc(this.centerX, this.centerY, pulseRadius, 0, 2 * Math.PI);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 5;
            ctx.setLineDash([10, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Lighten a color for winner highlighting
    lightenColor(color, factor = 1.2) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        
        const newR = Math.min(255, Math.floor(r * factor));
        const newG = Math.min(255, Math.floor(g * factor));
        const newB = Math.min(255, Math.floor(b * factor));
        
        return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }

    // Generate spinning animation frames
    generateSpinFrames(segments, winnerSegment, totalSpins = 8) {
        const frames = [];
        const totalFrames = 120; // 4 seconds at 30fps
        
        for (let frame = 0; frame < totalFrames; frame++) {
            const progress = frame / totalFrames;
            
            // Easing function for realistic deceleration
            const easeOut = 1 - Math.pow(1 - progress, 3);
            
            // Calculate target angle (where winner segment should stop at pointer)
            const winnerMidAngle = (winnerSegment.startAngle + winnerSegment.endAngle) / 2;
            const targetRotation = (2 * Math.PI) - winnerMidAngle + (totalSpins * 2 * Math.PI);
            
            const currentRotation = easeOut * targetRotation;
            
            const canvas = this.drawWheelFrame(segments, currentRotation);
            frames.push(canvas.toBuffer('image/png'));
        }
        
        return frames;
    }

    // Generate celebration animation frames
    generateCelebrationFrames(segments, winnerSegment) {
        const frames = [];
        const totalFrames = 60; // 2 seconds at 30fps for one loop
        
        for (let frame = 0; frame < totalFrames; frame++) {
            const canvas = this.drawWheelFrame(segments, 0, winnerSegment, true);
            frames.push(canvas.toBuffer('image/png'));
        }
        
        return frames;
    }

    // Create WebP animation
    async createWheelAnimation(participants, winnerId) {
        try {
            const segments = this.createSegments(participants);
            const winnerSegment = segments.find(s => s.userId === winnerId);
            
            if (!winnerSegment) {
                throw new Error('Winner not found in segments');
            }

            console.log('🎡 Generating wheel spin frames...');
            const spinFrames = this.generateSpinFrames(segments, winnerSegment);
            
            console.log('🎉 Generating celebration frames...');
            const celebrationFrames = this.generateCelebrationFrames(segments, winnerSegment);
            
            console.log('📹 Creating WebP animation...');
            
            // Create WebP animation
            const webp = new WebP.Image();
            
            // Add spin frames (play once)
            for (let i = 0; i < spinFrames.length; i++) {
                const frame = await sharp(spinFrames[i])
                    .resize(this.wheelSize, this.wheelSize)
                    .webp()
                    .toBuffer();
                
                webp.addFrame(frame, { duration: 33 }); // ~30fps
            }
            
            // Add celebration frames (loop infinitely)
            for (let i = 0; i < celebrationFrames.length; i++) {
                const frame = await sharp(celebrationFrames[i])
                    .resize(this.wheelSize, this.wheelSize)
                    .webp()
                    .toBuffer();
                
                webp.addFrame(frame, { duration: 33 });
            }
            
            // Set loop count (0 = infinite loop)
            webp.loopCount = 0;
            
            const animationBuffer = await webp.save();
            
            console.log('✅ Wheel animation created successfully');
            
            return {
                buffer: animationBuffer,
                winner: {
                    userId: winnerId,
                    displayName: winnerSegment.displayName,
                    entries: winnerSegment.entries,
                    color: winnerSegment.color
                },
                stats: {
                    totalParticipants: segments.length,
                    totalEntries: Object.values(participants).reduce((sum, p) => sum + p.totalEntries, 0),
                    spinFrames: spinFrames.length,
                    celebrationFrames: celebrationFrames.length
                }
            };
            
        } catch (error) {
            console.error('❌ Failed to create wheel animation:', error);
            throw error;
        }
    }

    // Create static wheel image (for testing or fallback)
    async createStaticWheel(participants, winnerId = null) {
        const segments = this.createSegments(participants);
        const winnerSegment = winnerId ? segments.find(s => s.userId === winnerId) : null;
        
        const canvas = this.drawWheelFrame(segments, 0, winnerSegment, !!winnerSegment);
        
        return {
            buffer: canvas.toBuffer('image/png'),
            segments,
            winner: winnerSegment
        };
    }

    // Utility method to test wheel rendering
    async testWheel() {
        const testParticipants = {
            'user1': { displayName: 'Alice', totalEntries: 10 },
            'user2': { displayName: 'Bob', totalEntries: 5 },
            'user3': { displayName: 'Charlie', totalEntries: 15 },
            'user4': { displayName: 'Diana', totalEntries: 8 }
        };

        return await this.createStaticWheel(testParticipants, 'user3');
    }
}

module.exports = new WheelRenderer();