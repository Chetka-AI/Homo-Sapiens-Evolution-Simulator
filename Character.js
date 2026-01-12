/**
 * Character.js - Moduł Postaci v3.0
 * Fizjologia, Animacja, Skalowanie (1m=128px)
 */

export class Character {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.rotation = 0;
        this.radius = 20; // ~32cm promień

        this.stats = {
            // Energia (Dobowa)
            energy: 10000,
            maxEnergy: 10000,
            // Stamina (Chwilowa)
            stamina: 1000,
            maxStamina: 1000,
            // Ciało
            muscleMass: 35,
            fatMass: 15,
            get totalWeight() { return this.muscleMass + this.fatMass + 10; }, // +10 kości
            // Atrybuty
            strength: 10,
            endurance: 10,
            inventoryWeight: 0,
            // Ruch
            baseSpeed: 1.4 * 128 / 60, // ~3 px/frame
            runMult: 2.5
        };

        this.state = {
            isMoving: false,
            isRunning: false,
            isTired: false,
            animStep: 0
        };
    }

    getMaxCarryWeight() {
        return this.stats.strength * 4.0; 
    }

    getCurrentSpeed() {
        const totalLoad = this.stats.inventoryWeight;
        const maxLoad = this.getMaxCarryWeight();
        let loadPenalty = 0;
        
        if (totalLoad > maxLoad * 0.5) {
            loadPenalty = Math.pow((totalLoad / maxLoad) - 0.5, 2) * this.stats.baseSpeed;
        }

        let speed = Math.max(0.5, this.stats.baseSpeed - loadPenalty);

        if (this.state.isRunning && !this.state.isTired) {
            speed *= (this.stats.runMult + (this.stats.endurance * 0.02));
        }
        
        if (this.state.isTired) speed *= 0.4;

        return speed;
    }

    update(inputVector, navigationTarget) {
        this.updatePhysiology();

        let mx = 0, my = 0;
        
        if (inputVector.active) {
            this.state.isRunning = false;
            mx = inputVector.dx;
            my = inputVector.dy;
            if (Math.abs(mx) > 0.01 || Math.abs(my) > 0.01) {
                this.rotation = Math.atan2(my, mx);
            }
        } else if (navigationTarget) {
            const dx = navigationTarget.x - this.x;
            const dy = navigationTarget.y - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 5) {
                this.rotation = Math.atan2(dy, dx);
                mx = Math.cos(this.rotation);
                my = Math.sin(this.rotation);
                this.state.isRunning = (navigationTarget.type === 'run');
            } else {
                return 'arrived'; 
            }
        }

        this.state.isMoving = (mx !== 0 || my !== 0);
        
        if (this.state.isMoving) {
            const speed = this.getCurrentSpeed();
            this.x += mx * speed;
            this.y += my * speed;
            this.state.animStep += (speed / 128) * 8; // Animacja zależna od dystansu
        } else {
            this.state.animStep = 0;
        }

        return null;
    }

    updatePhysiology() {
        if (this.state.isRunning && this.state.isMoving) {
            const speed = this.getCurrentSpeed();
            const drain = (speed / 128) * (1.5 - (this.stats.endurance * 0.01));
            this.stats.stamina = Math.max(0, this.stats.stamina - drain);
            
            if (this.stats.stamina <= 0) {
                this.state.isTired = true;
                this.state.isRunning = false;
            }
        } else {
            const regenBase = 0.5 + (this.stats.endurance * 0.05);
            this.stats.stamina = Math.min(this.stats.maxStamina, this.stats.stamina + regenBase);
            
            if (this.state.isTired && this.stats.stamina > (this.stats.maxStamina * 0.2)) {
                this.state.isTired = false;
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        const muscleBulk = Math.max(0, this.stats.muscleMass - 30) / 5;
        const fatBulk = Math.max(0, this.stats.fatMass - 15) / 3;
        const scale = 1.0 + (this.stats.totalWeight - 60) * 0.005;
        ctx.scale(scale, scale);

        // Cień
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 18, 0, 0, Math.PI * 2); ctx.fill();

        ctx.rotate(this.rotation);

        const swing = Math.sin(this.state.animStep); 
        const legOffset = 8 * swing;
        const armOffset = 6 * swing;

        // Nogi
        ctx.fillStyle = '#d3a681'; 
        ctx.beginPath(); ctx.arc(legOffset, -8 - fatBulk/2, 6 + muscleBulk/2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-legOffset, 8 + fatBulk/2, 6 + muscleBulk/2, 0, Math.PI*2); ctx.fill();

        // Ramiona
        ctx.fillStyle = '#c59570';
        ctx.beginPath(); ctx.arc(-armOffset + 5, -16 - fatBulk, 5 + muscleBulk/3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(armOffset + 5, 16 + fatBulk, 5 + muscleBulk/3, 0, Math.PI*2); ctx.fill();

        // Tułów
        ctx.fillStyle = '#5d4037';
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 12 + fatBulk, 0, 0, Math.PI*2); ctx.fill();

        // Głowa
        ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(-2, 0, 11, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#d3a681'; ctx.beginPath(); ctx.arc(2, 0, 9, 0, Math.PI*2); ctx.fill();
        
        // Twarz (X+)
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(6, -3, 2.5, 0, Math.PI*2); ctx.fill(); 
        ctx.beginPath(); ctx.arc(6, 3, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.arc(7, -3, 1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(7, 3, 1, 0, Math.PI*2); ctx.fill();

        ctx.restore();
    }
}