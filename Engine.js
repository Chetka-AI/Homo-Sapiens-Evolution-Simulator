/**
 * Engine.js - v5.0
 * - Rebalans Staminy: Drastyczne zmniejszenie zużycia (0.008), co pozwala na ok. 900m biegu.
 * - System Interakcji: Obsługa menu kontekstowego i ekwipunku.
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

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.state = {
            player: new Character(),
            navigation: { target: null, type: null },
            input: { x: 0, y: 0, active: false },
            ui: {
                inventoryOpen: false,
                contextMenuOpen: false
            }
        };

        this.camera = { x: 0, y: 0, zoom: 1.0, rotation: 0 };
        this.lastTime = Date.now();
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.inputHandler = new InputHandler(this);
        this.updateUI(); 
        this.gameLoop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    // --- LOGIKA INTERFEJSU ---

    toggleInventory(forceState = null) {
        const el = document.getElementById('side-menu');
        if (forceState !== null) {
            this.state.ui.inventoryOpen = forceState;
        } else {
            this.state.ui.inventoryOpen = !this.state.ui.inventoryOpen;
        }

        if (this.state.ui.inventoryOpen) {
            el.classList.remove('hidden');
            // Zamykamy kontekst jeśli otwieramy plecak
            this.hideContextMenu();
        } else {
            el.classList.add('hidden');
        }
    }

    showContextMenu(screenX, screenY) {
        const menu = document.getElementById('context-menu');
        
        // Oblicz pozycję w świecie gry (na przyszłość do wykrywania obiektu)
        const worldPos = this.screenToWorld(screenX, screenY);
        // console.log("Interaction at:", worldPos); 

        // Pozycjonowanie menu obok palca
        // Upewnij się, że nie wychodzi poza ekran
        let posX = screenX + 10;
        let posY = screenY + 10;

        if (posX + 150 > this.canvas.width) posX = screenX - 160;
        if (posY + 120 > this.canvas.height) posY = screenY - 130;

        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;
        
        menu.classList.remove('hidden');
        this.state.ui.contextMenuOpen = true;

        // Reset nawigacji żeby postać nie szła tam gdzie klikamy "trzymając"
        this.state.navigation.target = null;
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        menu.classList.add('hidden');
        this.state.ui.contextMenuOpen = false;
    }

    // --- LOGIKA GRY ---

    setNavigation(sx, sy, type) {
        // Nie nawiguj jeśli menu kontekstowe jest otwarte
        if (this.state.ui.contextMenuOpen) return;

        this.state.navigation.target = this.screenToWorld(sx, sy);
        this.state.navigation.type = type;
    }

    screenToWorld(sx, sy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        let dx = (sx - cx) / this.camera.zoom;
        let dy = (sy - cy) / this.camera.zoom;
        const cos = Math.cos(this.camera.rotation);
        const sin = Math.sin(this.camera.rotation);
        return {
            x: (dx * cos - dy * sin) + this.state.player.x,
            y: (dx * sin + dy * cos) + this.state.player.y
        };
    }

    update() {
        const now = Date.now();
        const dt = now - this.lastTime; 
        this.lastTime = now;

        const p = this.state.player;
        const nav = this.state.navigation;
        let mx = 0, my = 0;
        let isMoving = false;
        let isRunning = false;

        // Jeśli menu otwarte, blokujemy sterowanie (opcjonalne, ale pomocne)
        if (!this.state.ui.inventoryOpen) {
            if (this.state.input.active) {
                const cos = Math.cos(this.camera.rotation);
                const sin = Math.sin(this.camera.rotation);
                const ix = this.state.input.x;
                const iy = -this.state.input.y; 

                mx = ix * cos - iy * sin;
                my = ix * sin + iy * cos;

                if (Math.abs(mx) > 0.01 || Math.abs(my) > 0.01) {
                    p.rotation = Math.atan2(my, mx);
                    isMoving = true;
                    const intensity = Math.hypot(this.state.input.x, this.state.input.y);
                    if (intensity > 0.8) isRunning = true;
                }
            } else if (nav.target) {
                const dx = nav.target.x - p.x;
                const dy = nav.target.y - p.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 5) {
                    p.rotation = Math.atan2(dy, dx);
                    mx = Math.cos(p.rotation);
                    my = Math.sin(p.rotation);
                    isMoving = true;
                    if (nav.type === 'run') isRunning = true;
                } else {
                    nav.target = null;
                }
            }
        }

        let currentSpeed = p.stats.baseSpeed;
        if (p.vitals.stamina <= 0) isRunning = false;
        if (isRunning) currentSpeed *= p.stats.runMultiplier;
        if (!isMoving) currentSpeed = 0;

        if (isMoving) {
            p.x += mx * currentSpeed;
            p.y += my * currentSpeed;
        }

        p.update(dt, isMoving, isRunning, currentSpeed);

        this.camera.x += (p.x - this.camera.x) * 0.1;
        this.camera.y += (p.y - this.camera.y) * 0.1;

        if (now % 10 < 1) this.updateUI();
    }

    updateUI() {
        const p = this.state.player;
        const v = p.vitals;
        const metersX = (p.x / 100).toFixed(1);
        const metersY = (p.y / 100).toFixed(1);
        document.getElementById('pos-info').innerText = `${metersX}m, ${metersY}m`;
        
        document.getElementById('bar-health').style.width = `${v.health}%`;
        document.getElementById('bar-stamina').style.width = `${v.stamina}%`;
        document.getElementById('bar-hunger').style.width = `${v.hunger}%`;
        document.getElementById('bar-thirst').style.width = `${v.thirst}%`;
    }

    draw() {
        const { ctx, canvas, camera, state } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.rotate(-camera.rotation);
        ctx.translate(-camera.x, -camera.y);

        this.drawGrid(ctx);

        if (state.navigation.target) {
            const t = state.navigation.target;
            ctx.fillStyle = state.navigation.type === 'run' ? '#ff4757' : '#ffa502';
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(t.x, t.y, 6, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, Math.PI*2); ctx.stroke();
        }

        this.drawCharacter(ctx, state.player);

        ctx.restore();
    }

    drawGrid(ctx) {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        const cx = this.state.player.x;
        const cy = this.state.player.y;
        const range = 1500; 
        const step = 100; // 100px = 1 metr

        const startX = Math.floor((cx - range) / step) * step;
        const startY = Math.floor((cy - range) / step) * step;
        const endX = startX + range * 2;
        const endY = startY + range * 2;

        ctx.beginPath();
        for(let x = startX; x <= endX; x += step) {
            ctx.moveTo(x, startY); ctx.lineTo(x, endY);
        }
        for(let y = startY; y <= endY; y += step) {
            ctx.moveTo(startX, y); ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }

    drawCharacter(ctx, p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation + Math.PI / 2); 

        const breathScale = 1.0 + Math.sin(Date.now() * 0.003) * 0.02;
        ctx.scale(breathScale, breathScale);

        const { rightLegOffset, leftLegOffset, rightArmOffset, leftArmOffset } = p.anim;
        
        const skinColor = '#d4a373';
        const clothesColor = '#8d5524';
        const hairColor = '#333';
        const outlineColor = '#000';

        ctx.lineWidth = 2; 
        ctx.strokeStyle = outlineColor;

        // 1. NOGI
        ctx.fillStyle = skinColor;
        this.drawLimb(ctx, -10, 6 + leftLegOffset, 7);
        this.drawLimb(ctx, 10, 6 + rightLegOffset, 7);

        // 2. RĘCE
        this.drawLimb(ctx, -18, -2 + leftArmOffset, 6);
        this.drawLimb(ctx, 18, -2 + rightArmOffset, 6);

        // 3. TUŁÓW
        ctx.fillStyle = clothesColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();

        // 4. GŁOWA
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();

        // Fryzura
        ctx.fillStyle = hairColor;
        ctx.beginPath();
        ctx.arc(0, 2, 9.5, 0, Math.PI, false); 
        ctx.fill();

        ctx.restore();
    }

    drawLimb(ctx, x, y, size) {
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
    }

    gameLoop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }
}