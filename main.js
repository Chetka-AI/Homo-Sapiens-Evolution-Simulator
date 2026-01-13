import { InputController, PhysicsController, Pathfinder } from './NewMechanics.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.overlay = document.getElementById('touch-overlay');

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new InputController(this.overlay);
        this.physics = new PhysicsController();

        // Initialize Pathfinder with bound collision check
        this.pathfinder = new Pathfinder((x, y) => this.checkCollision(x, y));

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
        this.path = []; // Array of points {x, y}
        this.isPathSprinting = false;

        // Joystick Toggle
        this.isRunToggleOn = false;
        const btnToggle = document.getElementById('btn-toggle-speed');
        if (btnToggle) {
            const toggleHandler = (e) => {
                e.preventDefault(); // Prevent default touch behavior
                e.stopPropagation(); // prevent game click
                this.isRunToggleOn = !this.isRunToggleOn;
                btnToggle.innerText = this.isRunToggleOn ? '🏃' : '🚶';
            };
            // Listen to both click and touchstart for better responsiveness
            btnToggle.addEventListener('click', toggleHandler);
            btnToggle.addEventListener('touchstart', toggleHandler, { passive: false });
        }

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

        let dx = (sx - cx) / this.camera.zoom;
        let dy = (sy - cy) / this.camera.zoom;

        const r = this.camera.rotation;
        const cos = Math.cos(r);
        const sin = Math.sin(r);

        const rdx = dx * cos - dy * sin;
        const rdy = dx * sin + dy * cos;

        return {
            x: rdx + this.camera.x,
            y: rdy + this.camera.y
        };
    }

    update(dt) {
        const inputState = this.input.update();

        // Handle Zoom (Limit max zoom out to 3.0 as requested)
        if (inputState.zoomDelta !== 0) {
            this.camera.zoom = Math.max(0.1, Math.min(3.0, this.camera.zoom + inputState.zoomDelta));
            this.lastEvent = `Zoom: ${this.camera.zoom.toFixed(2)}`;
        }

        // Handle Rotation
        if (inputState.rotationDelta !== 0) {
            this.camera.rotation += inputState.rotationDelta;
            this.lastEvent = `Rot: ${this.camera.rotation.toFixed(2)}`;
        }

        // Handle Tap -> Calculate Path
        if (inputState.tap) {
            const worldPos = this.screenToWorld(inputState.tap.x, inputState.tap.y);
            const path = this.pathfinder.findPath(this.player, worldPos);

            if (path) {
                this.path = path;
                this.path.push(worldPos);
                // Set sprint state based on Double Tap
                this.isPathSprinting = (inputState.tap.type === 'run');

                this.lastEvent = `Tap: Path (${this.path.length}) ${this.isPathSprinting ? 'Run' : 'Walk'}`;
            } else {
                this.lastEvent = "Tap: No path!";
                this.path = [];
            }
        }

        // Handle Long Press
        if (inputState.longPress) {
            this.lastEvent = "Long Press Detected!";
            this.path = []; // Stop moving
        }

        // Determine Physics Input (Joystick overrides Path)
        let physInput = { x: 0, y: 0, active: false, sprint: false };

        if (inputState.active) {
            // Joystick / Keyboard active
            physInput.x = inputState.x;
            physInput.y = inputState.y;
            physInput.active = true;
            // Joystick toggle logic:
            // Default Walk. If Toggle ON -> Sprint.
            // (Unless Keyboard Shift is pressed, which InputController handles via inputState.sprint)
            physInput.sprint = this.isRunToggleOn || inputState.sprint;

            this.path = []; // Cancel path on manual input
        } else if (this.path.length > 0) {
            // Move towards next point in path
            const target = this.path[0];
            const dx = target.x - this.player.x;
            const dy = target.y - this.player.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 15) { // Reach radius
                let wx = dx / dist;
                let wy = dy / dist;

                // Rotate input relative to camera
                const r = -this.camera.rotation;
                const cos = Math.cos(r);
                const sin = Math.sin(r);

                const ix = wx * cos - wy * sin;
                const iy = wx * sin + wy * cos;

                physInput.x = ix;
                physInput.y = -iy;

                physInput.active = true;
                physInput.sprint = this.isPathSprinting;
            } else {
                // Reached point, go to next
                this.path.shift();
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

        // Camera locked to player (Direct assignment, no Lerp)
        this.camera.x = this.player.x;
        this.camera.y = this.player.y;
    }

    draw() {
        this.ctx.fillStyle = '#121212';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();

        // Camera Transform
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.rotate(-this.camera.rotation);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // World Bounds
        this.ctx.strokeStyle = '#444'; // Brighter grid border
        this.ctx.lineWidth = 5;
        this.ctx.strokeRect(this.worldBounds.minX, this.worldBounds.minY, 1000, 1000);

        // Obstacle
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(100, 100, 100, 100);

        // Grid - Brighter for visibility
        this.ctx.strokeStyle = '#333'; // Brighter grid lines (was #222)
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for(let i = this.worldBounds.minX; i <= this.worldBounds.maxX; i+=100) {
            this.ctx.moveTo(i, this.worldBounds.minY); this.ctx.lineTo(i, this.worldBounds.maxY);
        }
        for(let i = this.worldBounds.minY; i <= this.worldBounds.maxY; i+=100) {
            this.ctx.moveTo(this.worldBounds.minX, i); this.ctx.lineTo(this.worldBounds.maxX, i);
        }
        this.ctx.stroke();

        // Path Debug
        if (this.path.length > 0) {
            this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(this.player.x, this.player.y);
            for(let p of this.path) {
                this.ctx.lineTo(p.x, p.y);
            }
            this.ctx.stroke();

            // Draw points
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            for(let p of this.path) {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
                this.ctx.fill();
            }
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
        this.ctx.fillText(`Toggle: ${this.isRunToggleOn ? 'Run' : 'Walk'}. Tap (Smart Move).`, 10, 60);
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
