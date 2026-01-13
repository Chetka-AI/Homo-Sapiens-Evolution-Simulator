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

        let dx = (sx - cx) / this.camera.zoom;
        let dy = (sy - cy) / this.camera.zoom;

        // Rotate vector relative to camera rotation
        // If camera is rotated R, world vector V appears as V' = Rotate(-R) * V.
        // We have screen vector V'. We want World vector V.
        // V = Rotate(+R) * V'.

        const r = this.camera.rotation;
        const cos = Math.cos(r);
        const sin = Math.sin(r);

        // Rotate
        const rdx = dx * cos - dy * sin;
        const rdy = dx * sin + dy * cos;

        return {
            x: rdx + this.camera.x,
            y: rdy + this.camera.y
        };
    }

    update(dt) {
        const inputState = this.input.update();

        // Handle Zoom
        if (inputState.zoomDelta !== 0) {
            this.camera.zoom = Math.max(0.1, Math.min(5.0, this.camera.zoom + inputState.zoomDelta));
            this.lastEvent = `Zoom: ${this.camera.zoom.toFixed(2)}`;
        }

        // Handle Rotation
        if (inputState.rotationDelta !== 0) {
            this.camera.rotation += inputState.rotationDelta;
            this.lastEvent = `Rot: ${this.camera.rotation.toFixed(2)}`;
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
                // Calculate direction in World Space
                let wx = dx / dist;
                let wy = dy / dist;

                // Physics expects "Input Vector" relative to Camera View.
                // If Camera is rotated R, a world vector W needs to be rotated by -R to become Input I.
                // I = Rotate(-R) * W.

                const r = -this.camera.rotation;
                const cos = Math.cos(r);
                const sin = Math.sin(r);

                const ix = wx * cos - wy * sin;
                const iy = wx * sin + wy * cos;

                // Physics expects Input Y where Up=+1.
                // Canvas Y is Down. World dy is Down=+1.
                // If we want to move "Up" (World -Y), wy is negative.
                // Rotated iy will handle direction relative to camera.
                // But Physics negates Input Y: moveY = -input.y.
                // So we need to feed it `input.y` such that `-input.y` = intended movement Y (relative to camera).
                // Let's verify standard Joystick: Joystick Up -> Input Y=+1 -> Move Y=-1 (Screen Up/Camera Forward).

                // If we want to move Camera Forward:
                // ix=0, iy=-1 (Screen Up).
                // Physics: moveY = -(-1) = +1 ? No.
                // Physics: moveY = -input.y. If input.y=1 (Joy Up), moveY=-1 (Screen Up). Correct.

                // So if our target vector (relative to camera) is (ix, iy),
                // and iy is pointing "Up" (negative value),
                // we need input.y to be Positive.
                // So `physInput.y = -iy`.

                physInput.x = ix;
                physInput.y = -iy;

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

        // Transform Camera
        // 1. Center Screen
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        // 2. Rotate Camera
        this.ctx.rotate(-this.camera.rotation);
        // 3. Zoom
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        // 4. Translate to Camera Position
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
        this.ctx.fillText(`Controls: WASD/Arrow/Touch Joystick. Shift/DoubleTap: Sprint. Pinch/Rotate.`, 10, 60);
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
