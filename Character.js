/**
 * Character.js - v1.0
 * Moduł odpowiedzialny za statystyki, stan fizjologiczny i animację postaci.
 */

class Character {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.rotation = 0;
        this.age = 0;
        
        // Stałe świata
        this.PIXELS_PER_METER = 100; // 100px = 1m
        this.STRIDE_LENGTH = 1.4 * this.PIXELS_PER_METER;
        
        // Parametry życiowe
        this.vitals = {
            health: 100,
            maxHealth: 100,
            stamina: 100,
            maxStamina: 100,
            hunger: 100,
            thirst: 100,
        };
        
        // Statystyki fizyczne
        this.stats = {
            baseSpeed: 1.4,
            runMultiplier: 3.0,
            // 0.008 na klatkę przy 60fps ~ 0.5 punktu na sekundę.
            // 100 punktów = 200 sekund biegu = 3.3 minuty.
            // Prędkość biegu to ok. 4.2px/f * 60 = 252px/s = 2.5m/s
            // 200s * 2.5m/s = 500m dystansu. (Wartość bezpieczna)
            staminaDrain: 0.008,
            staminaRegen: 0.05, // Regeneracja też wolniejsza, ale stała
            metabolism: 0.002
        };
        
        // Stan animacji
        this.anim = {
            walkCycle: 0,
            rightLegOffset: 0,
            leftLegOffset: 0,
            rightArmOffset: 0,
            leftArmOffset: 0,
            bobbing: 0
        };
    }
    
    update(dt, isMoving, isRunning, actualDistanceMoved) {
        // 1. Vitals
        let metabolicRate = this.stats.metabolism;
        if (isMoving) metabolicRate *= 1.5;
        if (isRunning) metabolicRate *= 3.0;
        
        this.vitals.hunger = Math.max(0, this.vitals.hunger - metabolicRate);
        this.vitals.thirst = Math.max(0, this.vitals.thirst - (metabolicRate * 1.5));
        
        if (this.vitals.hunger <= 0 || this.vitals.thirst <= 0) {
            this.vitals.health = Math.max(0, this.vitals.health - 0.05);
        } else {
            if (this.vitals.health < this.vitals.maxHealth && this.vitals.hunger > 50 && this.vitals.thirst > 50) {
                this.vitals.health += 0.02;
            }
        }
        
        // 2. Stamina (Zaktualizowana logika)
        if (isRunning && isMoving) {
            this.vitals.stamina = Math.max(0, this.vitals.stamina - this.stats.staminaDrain);
        } else {
            // Regeneracja działa zawsze gdy nie biegniemy, nawet jak idziemy (ale wolniej)
            let regen = this.stats.staminaRegen;
            if (isMoving) regen *= 0.5; // Regeneracja podczas chodu jest wolniejsza
            this.vitals.stamina = Math.min(this.vitals.maxStamina, this.vitals.stamina + regen);
        }
        
        // 3. Synchronizacja Animacji
        if (isMoving && actualDistanceMoved > 0.01) {
            const strideFraction = actualDistanceMoved / this.STRIDE_LENGTH;
            this.anim.walkCycle += strideFraction * (Math.PI * 2);
            
            // Zwiększony zakres wymachu dla większej postaci
            const limbRange = 10.0;
            
            this.anim.rightLegOffset = Math.sin(this.anim.walkCycle) * limbRange;
            this.anim.leftLegOffset = Math.sin(this.anim.walkCycle + Math.PI) * limbRange;
            
            this.anim.rightArmOffset = Math.sin(this.anim.walkCycle + Math.PI) * limbRange;
            this.anim.leftArmOffset = Math.sin(this.anim.walkCycle) * limbRange;
            
            this.anim.bobbing = Math.abs(Math.sin(this.anim.walkCycle * 2)) * 1.5;
        } else {
            const damp = 0.8;
            if (Math.abs(this.anim.rightLegOffset) < 0.1) this.anim.walkCycle = 0;
            
            this.anim.rightLegOffset *= damp;
            this.anim.leftLegOffset *= damp;
            this.anim.rightArmOffset *= damp;
            this.anim.leftArmOffset *= damp;
            this.anim.bobbing *= damp;
        }
        
        this.age += dt * 0.001;
    }
}