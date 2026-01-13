/**
 * NewMechanics.js
 * Wyodrębniona mechanika sterowania i fizyki poruszania się.
 *
 * Zawiera:
 * 1. InputController - Obsługa wejścia (Klawiatura + Mysz/Dotyk).
 * 2. PhysicsController - Logika poruszania postacią.
 */

export class InputController {
    constructor(element) {
        this.element = element || window;

        // Stan wejścia
        this.state = {
            x: 0,
            y: 0,
            active: false,
            sprint: false
        };

        // Klawisze
        this.keys = {
            w: false, a: false, s: false, d: false,
            arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
            shift: false
        };

        // Mysz / Dotyk (Wirtualny Joystick - logika uproszczona)
        this.pointer = {
            active: false,
            startX: 0, startY: 0,
            currentX: 0, currentY: 0
        };

        this.initListeners();
    }

    initListeners() {
        // Klawiatura
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));

        // Mysz / Dotyk (prosta implementacja joysticka jeśli element podano)
        if (this.element !== window) {
            this.element.addEventListener('mousedown', (e) => this.handlePointerStart(e.clientX, e.clientY));
            this.element.addEventListener('mousemove', (e) => this.handlePointerMove(e.clientX, e.clientY));
            window.addEventListener('mouseup', () => this.handlePointerEnd());

            this.element.addEventListener('touchstart', (e) => {
                if(e.touches.length > 0) this.handlePointerStart(e.touches[0].clientX, e.touches[0].clientY);
            }, {passive: false});
            this.element.addEventListener('touchmove', (e) => {
                if(e.touches.length > 0) {
                    e.preventDefault();
                    this.handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, {passive: false});
            window.addEventListener('touchend', () => this.handlePointerEnd());
        }
    }

    handleKey(e, isDown) {
        const key = e.key.toLowerCase();
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = isDown;
        }
    }

    handlePointerStart(x, y) {
        this.pointer.active = true;
        this.pointer.startX = x;
        this.pointer.startY = y;
        this.pointer.currentX = x;
        this.pointer.currentY = y;
    }

    handlePointerMove(x, y) {
        if (!this.pointer.active) return;
        this.pointer.currentX = x;
        this.pointer.currentY = y;
    }

    handlePointerEnd() {
        this.pointer.active = false;
        this.pointer.startX = 0;
        this.pointer.startY = 0;
        this.pointer.currentX = 0;
        this.pointer.currentY = 0;
    }

    /**
     * Oblicza i zwraca znormalizowany wektor wejścia.
     */
    update() {
        // Reset
        let x = 0;
        let y = 0;

        // Klawiatura
        if (this.keys.w || this.keys.arrowup) y -= 1;
        if (this.keys.s || this.keys.arrowdown) y += 1;
        if (this.keys.a || this.keys.arrowleft) x -= 1;
        if (this.keys.d || this.keys.arrowright) x += 1;

        // Pointer (Joystick Logic)
        if (this.pointer.active) {
            const dx = this.pointer.currentX - this.pointer.startX;
            const dy = this.pointer.currentY - this.pointer.startY;
            const dist = Math.hypot(dx, dy);
            const maxDist = 50; // Max wychylenie joysticka

            if (dist > 5) {
                x = dx / maxDist;
                y = dy / maxDist;
                // Clamp do 1.0
                const len = Math.hypot(x, y);
                if (len > 1) {
                    x /= len;
                    y /= len;
                }
            }
        }

        // Normalizacja (dla klawiatury)
        if (!this.pointer.active) {
            const len = Math.hypot(x, y);
            if (len > 0) {
                x /= len;
                y /= len;
            }
        }

        this.state.x = x;
        this.state.y = y;
        this.state.active = (Math.abs(x) > 0.01 || Math.abs(y) > 0.01);
        this.state.sprint = this.keys.shift; // Prosty sprint shiftem

        return this.state;
    }
}

export class PhysicsController {
    constructor() {
        this.config = {
            baseSpeed: 1.4,
            runMultiplier: 2.0,
            rotationSpeed: 0.2
        };
    }

    /**
     * Aktualizuje pozycję obiektu na podstawie wejścia.
     * @param {Object} entity - Obiekt z {x, y, rotation}
     * @param {Object} input - Obiekt z {x, y, active}
     * @param {number} cameraRotation - Aktualny obrót kamery (radiany)
     * @param {number} dt - Delta time (ms)
     * @param {Function} checkCollision - (x, y) => boolean
     */
    update(entity, input, cameraRotation, dt, checkCollision) {
        if (!input.active) return;

        // 1. Przeliczenie wejścia względem kamery
        const cos = Math.cos(cameraRotation);
        const sin = Math.sin(cameraRotation);

        // input.x/y to wektor lokalny (ekranowy). Musimy go obrócić o kamerę.
        // W oryginale: mx = input.x * cos - (-input.y) * sin;
        // Uwaga: W oryginale Y joysticka jest często odwrócony (góra to ujemne Y).
        // Tutaj zakładamy standard: Y-down (ekran).

        const moveX = input.x * cos - (-input.y) * sin;
        const moveY = input.x * sin + (-input.y) * cos;

        // 2. Obliczenie rotacji postaci
        if (Math.hypot(moveX, moveY) > 0.01) {
            entity.rotation = Math.atan2(moveY, moveX);
        }

        // 3. Obliczenie prędkości
        let speed = this.config.baseSpeed;
        if (input.sprint) speed *= this.config.runMultiplier;

        // Skalowanie prędkości przez wejście analogowe (joystick)
        const inputMagnitude = Math.hypot(input.x, input.y);
        speed *= Math.min(1.0, inputMagnitude);

        // Delta distance
        // Zakładamy dt w ms. 16ms ~= 1 frame.
        // W oryginale 1.4 to pixele na tick? Sprawdźmy Character.js:
        // STRIDE_LENGTH = 1.4 * 100 (140px).
        // W update: dist = speed * dt/16 (przybliżenie).
        const dist = speed * (dt / 16.0) * 5; // *5 to arbitralny mnożnik, żeby dopasować do skali

        // 4. Kolizje i Aplikacja ruchu
        const nextX = entity.x + moveX * dist;
        const nextY = entity.y + moveY * dist;

        let moved = false;

        if (!checkCollision(nextX, nextY)) {
            entity.x = nextX;
            entity.y = nextY;
            moved = true;
        } else {
            // Sliding (ślizganie po ścianach)
            if (!checkCollision(nextX, entity.y)) {
                entity.x = nextX;
                moved = true;
            } else if (!checkCollision(entity.x, nextY)) {
                entity.y = nextY;
                moved = true;
            }
        }

        return moved;
    }
}
