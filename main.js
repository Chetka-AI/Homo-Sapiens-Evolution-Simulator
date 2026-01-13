import { InputController, PhysicsController } from './NewMechanics.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.overlay = document.getElementById('touch-overlay');

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new InputController(this.overlay);
        this.physics = new PhysicsController();

        this.player = {
            x: 0,
            y: 0,
            rotation: 0,
            radius: 15
        };

        this.camera = { x: 0, y: 0, zoom: 1.0, rotation: 0 };
        this.lastTime = performance.now();

        this.worldBounds = { minX: -500, maxX: 500, minY: -500, maxY: 500 };

        // Navigation Target (Tap to move)
        this.target = null; // {x, y}

        // Visual debug for events
        this.lastEvent = "";

        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    checkCollision(x, y) {
        if (x < this.worldBounds.minX || x > this.worldBounds.maxX ||
            y < this.worldBounds.minY || y > this.worldBounds.maxY) {
            return true;
        }
        if (x > 100 && x < 200 && y > 100 && y < 200) return true;
        return false;
    }

    screenToWorld(sx, sy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        // Invert transforms: Translate(cx, cy) -> Scale -> Translate(-cam)
        // World = (Screen - Center) / Zoom + Cam
        // Note: Rotation is 0 for now.
        const dx = (sx - cx) / this.camera.zoom;
        const dy = (sy - cy) / this.camera.zoom;
        return {
            x: dx + this.camera.x,
            y: dy + this.camera.y
        };
    }

    update(dt) {
        const inputState = this.input.update();

        // Handle Zoom
        if (inputState.zoomDelta !== 0) {
            this.camera.zoom = Math.max(0.1, Math.min(5.0, this.camera.zoom + inputState.zoomDelta));
            this.lastEvent = `Zoom: ${this.camera.zoom.toFixed(2)}`;
        }

        // Handle Tap -> Set Target
        if (inputState.tap) {
            const worldPos = this.screenToWorld(inputState.tap.x, inputState.tap.y);
            this.target = worldPos;
            this.lastEvent = `Tap: ${Math.floor(worldPos.x)}, ${Math.floor(worldPos.y)}`;
        }

        // Handle Long Press
        if (inputState.longPress) {
            this.lastEvent = "Long Press Detected!";
            this.target = null; // Stop moving
        }

        // Determine Physics Input (Joystick overrides Target)
        let physInput = { x: 0, y: 0, active: false, sprint: inputState.sprint };

        if (inputState.active) {
            // Joystick / Keyboard active
            physInput.x = inputState.x;
            physInput.y = inputState.y;
            physInput.active = true;
            this.target = null; // Cancel target on manual input
        } else if (this.target) {
            // Move towards target
            const dx = this.target.x - this.player.x;
            const dy = this.target.y - this.player.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 5) { // Threshold
                // Physics expects Input Y where Up=+1.
                // World dy: Up is Negative.
                // So Input Y = -dy.
                physInput.x = dx / dist;
                physInput.y = -(dy / dist);
                physInput.active = true;
                if (inputState.tap && inputState.tap.type === 'run') physInput.sprint = true;
            } else {
                this.target = null; // Arrived
            }
        }

        // Apply Physics
        this.physics.update(
            this.player,
            physInput,
            this.camera.rotation,
            dt,
            (x, y) => this.checkCollision(x, y)
        );

        // Camera follow
        this.camera.x += (this.player.x - this.camera.x) * 0.1;
        this.camera.y += (this.player.y - this.camera.y) * 0.1;
    }

    draw() {
        this.ctx.fillStyle = '#121212';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // World Bounds
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 5;
        this.ctx.strokeRect(this.worldBounds.minX, this.worldBounds.minY, 1000, 1000);

        // Obstacle
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(100, 100, 100, 100);

        // Grid
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for(let i = this.worldBounds.minX; i <= this.worldBounds.maxX; i+=100) {
            this.ctx.moveTo(i, this.worldBounds.minY); this.ctx.lineTo(i, this.worldBounds.maxY);
        }
        for(let i = this.worldBounds.minY; i <= this.worldBounds.maxY; i+=100) {
            this.ctx.moveTo(this.worldBounds.minX, i); this.ctx.lineTo(this.worldBounds.maxX, i);
        }
        this.ctx.stroke();

        // Target Marker
        if (this.target) {
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(this.target.x, this.target.y, 10, 0, Math.PI*2);
            this.ctx.fill();
        }

        // Player
        this.ctx.save();
        this.ctx.translate(this.player.x, this.player.y);
        this.ctx.rotate(this.player.rotation);
        this.ctx.fillStyle = '#ff4757';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.player.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(20, 0);
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.restore();

        // Debug UI
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`Pos: ${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}`, 10, 20);
        this.ctx.fillText(`Event: ${this.lastEvent}`, 10, 40);
        this.ctx.fillText(`Controls: WASD/Arrow/Touch Joystick. Shift/DoubleTap: Sprint.`, 10, 60);
    }

    loop() {
        const now = performance.now();
        const dt = now - this.lastTime;
        this.lastTime = now;

        this.update(dt);
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

window.addEventListener('load', () => {
    new Game();
});
