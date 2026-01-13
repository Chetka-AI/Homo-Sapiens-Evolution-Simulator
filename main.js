import { InputController, PhysicsController } from './NewMechanics.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new InputController(this.canvas);
        this.physics = new PhysicsController();

        this.player = {
            x: 0,
            y: 0,
            rotation: 0,
            radius: 15
        };

        this.camera = { x: 0, y: 0, zoom: 1.0 };
        this.lastTime = performance.now();

        // Prosta mapa kolizji (ściany na obrzeżach)
        this.worldBounds = { minX: -500, maxX: 500, minY: -500, maxY: 500 };

        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    checkCollision(x, y) {
        // Kolizja z granicami świata
        if (x < this.worldBounds.minX || x > this.worldBounds.maxX ||
            y < this.worldBounds.minY || y > this.worldBounds.maxY) {
            return true;
        }
        // Przykładowa przeszkoda na środku
        if (x > 100 && x < 200 && y > 100 && y < 200) return true;
        return false;
    }

    update(dt) {
        // Wejście
        const inputState = this.input.update();

        // Fizyka
        this.physics.update(
            this.player,
            inputState,
            0, // Kamera jest statyczna rotacyjnie w tym demo
            dt,
            (x, y) => this.checkCollision(x, y)
        );

        // Kamera śledzi gracza
        this.camera.x += (this.player.x - this.camera.x) * 0.1;
        this.camera.y += (this.player.y - this.camera.y) * 0.1;
    }

    draw() {
        // Wyczyść
        this.ctx.fillStyle = '#121212';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();

        // Kamera
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // Rysuj Świat (Granice)
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 5;
        this.ctx.strokeRect(
            this.worldBounds.minX,
            this.worldBounds.minY,
            this.worldBounds.maxX - this.worldBounds.minX,
            this.worldBounds.maxY - this.worldBounds.minY
        );

        // Rysuj przeszkodę
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(100, 100, 100, 100);

        // Siatka
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for(let i = this.worldBounds.minX; i <= this.worldBounds.maxX; i+=100) {
            this.ctx.moveTo(i, this.worldBounds.minY);
            this.ctx.lineTo(i, this.worldBounds.maxY);
        }
        for(let i = this.worldBounds.minY; i <= this.worldBounds.maxY; i+=100) {
            this.ctx.moveTo(this.worldBounds.minX, i);
            this.ctx.lineTo(this.worldBounds.maxX, i);
        }
        this.ctx.stroke();

        // Rysuj Gracza
        this.ctx.save();
        this.ctx.translate(this.player.x, this.player.y);
        this.ctx.rotate(this.player.rotation);

        this.ctx.fillStyle = '#ff4757';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.player.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Kierunek
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(20, 0); // 0 stopni to prawo w canvasie
        this.ctx.stroke();

        this.ctx.restore();

        this.ctx.restore();

        // UI Debug
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`Pos: ${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}`, 10, 20);
        this.ctx.fillText(`WASD / Strzałki do ruchu. Shift - sprint.`, 10, 40);
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

// Start gry po załadowaniu
window.addEventListener('load', () => {
    new Game();
});
