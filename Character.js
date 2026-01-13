/**
 * Character.js
 * Moduł odpowiedzialny za statystyki, stan fizjologiczny i animację postaci.
 * ZMIANY:
 * - Wzmocniona logika dodawania do ekwipunku.
 */

class Character {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.rotation = 0;
        this.age = 0;
        
        this.PIXELS_PER_METER = 100;
        this.STRIDE_LENGTH = 1.4 * this.PIXELS_PER_METER;
        
        this.attributes = {
            strength: 10, // Udźwig: base + strength * 2
            endurance: 10,
            agility: 10
        };
        
        this.vitals = {
            health: 100,
            maxHealth: 100,
            stamina: 100,
            maxStamina: 100,
            hunger: 100,
            thirst: 100,
        };
        
        this.stats = {
            baseSpeed: 1.4,
            runMultiplier: 3.0,
            baseStaminaDrain: 0.003,
            staminaRegen: 0.05,
            baseMetabolism: 0.002
        };
        
        // Ekwipunek
        this.inventory = [];
        this.currentLoad = 0; // Aktualna waga w kg
        this.maxLoad = 20 + this.attributes.strength * 2;
        
        this.anim = {
            walkCycle: 0,
            rightLegOffset: 0,
            leftLegOffset: 0,
            rightArmOffset: 0,
            leftArmOffset: 0,
            bobbing: 0
        };
    }
    
    // Funkcja interakcji z obiektem/światem
    interact(world, actionType) {
        // Sprawdzamy co jest pod nogami
        const obj = world.getObjectAtWorldPos(this.x, this.y);
        
        if (actionType === 'pickup') {
            if (obj && obj.collectible) {
                // Sprawdź udźwig
                const itemWeight = Number(obj.weight) || 0.5; // Zabezpieczenie
                
                if (this.currentLoad + itemWeight > this.maxLoad) {
                    console.log("Za ciężkie!");
                    return "too_heavy";
                }
                
                // Dodaj do ekwipunku
                this.inventory.push({
                    type: obj.subType || obj.type,
                    weight: itemWeight
                });
                this.currentLoad += itemWeight;
                
                // Usuń ze świata
                const removed = world.removeObject(obj);
                if (removed) {
                    console.log(`Podniesiono: ${obj.subType || obj.type}`);
                    return "picked_up";
                } else {
                    console.error("Błąd usuwania obiektu ze świata!");
                    return "error";
                }
            } else if (obj && !obj.collectible) {
                console.log("Tego nie można podnieść.");
                return "not_collectible";
            } else {
                console.log("Brak przedmiotu do podniesienia lub brak naczynia na wodę/piasek.");
                return "nothing_to_pickup";
            }
        }
        
        if (actionType === 'drink') {
            if (this.vitals.thirst < 100) {
                this.vitals.thirst = Math.min(100, this.vitals.thirst + 50);
                console.log("Napito się.");
                return "drank";
            } else {
                console.log("Nie chce mi się pić.");
                return "full";
            }
        }
        
        return "none";
    }
    
    update(dt, isMoving, isRunning, actualDistanceMoved) {
        const enduranceFactor = Math.max(0.5, 1.0 - (this.attributes.endurance * 0.01));
        
        let metabolicRate = this.stats.baseMetabolism;
        if (isMoving) metabolicRate *= 1.5;
        if (isRunning) metabolicRate *= 3.0;
        
        // Kara za ciężar
        let loadPenalty = this.currentLoad / this.maxLoad;
        metabolicRate *= (1 + loadPenalty);
        metabolicRate *= enduranceFactor;
        
        this.vitals.hunger = Math.max(0, this.vitals.hunger - metabolicRate);
        this.vitals.thirst = Math.max(0, this.vitals.thirst - (metabolicRate * 1.5));
        
        if (this.vitals.hunger <= 0 || this.vitals.thirst <= 0) {
            this.vitals.health = Math.max(0, this.vitals.health - 0.05);
        } else {
            if (this.vitals.health < this.vitals.maxHealth && this.vitals.hunger > 50 && this.vitals.thirst > 50) {
                this.vitals.health += 0.02;
            }
        }
        
        // Stamina
        if (isRunning && isMoving) {
            let currentDrain = this.stats.baseStaminaDrain * enduranceFactor;
            currentDrain *= (1 + loadPenalty * 2);
            this.vitals.stamina = Math.max(0, this.vitals.stamina - currentDrain);
        } else {
            let regen = this.stats.staminaRegen;
            if (isMoving) regen *= 0.5;
            regen *= (1 + this.attributes.endurance * 0.005);
            regen *= Math.max(0.1, 1.0 - loadPenalty);
            
            this.vitals.stamina = Math.min(this.vitals.maxStamina, this.vitals.stamina + regen);
        }
        
        // Animacja
        if (isMoving && actualDistanceMoved > 0.01) {
            const strideFraction = actualDistanceMoved / this.STRIDE_LENGTH;
            this.anim.walkCycle += strideFraction * (Math.PI * 2);
            
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