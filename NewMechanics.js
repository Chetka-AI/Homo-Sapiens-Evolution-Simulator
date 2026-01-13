/**
 * NewMechanics.js
 *
 * InputController:
 * - Integrates NippleJS for joystick.
 * - Handles Native Touch (Tap, Long Press, Pinch, Rotate).
 * - Handles Keyboard (WASD/Arrows).
 *
 * PhysicsController:
 * - Handles movement physics.
 *
 * Pathfinder:
 * - A* algorithm for obstacle avoidance.
 */

export class InputController {
    constructor(overlayElement) {
        this.overlay = overlayElement || document.body;

        this.config = {
            TAP_MAX_DURATION: 50,
            DOUBLE_TAP_TIME: 350,
            JOYSTICK_MIN_DIST: 15,
            JOYSTICK_MIN_TIME: 50,
            LONG_PRESS_TIME: 600,
            LONG_PRESS_MAX_MOVE: 10
        };

        this.state = {
            x: 0,
            y: 0,
            active: false,
            sprint: false,

            // Touch Events
            tap: null, // { x, y, type: 'walk'|'run' }
            longPress: null, // { x, y }
            zoomDelta: 0, // change in zoom
            rotationDelta: 0, // change in rotation (radians)

            // Internal flags
            isJoystickActive: false,
            isLongPressTriggered: false,
            isMultitouch: false
        };

        this.touch = {
            startTime: 0,
            startPos: { x: 0, y: 0 },
            lastTapTime: 0,
            tapTimeout: null,
            longPressTimeout: null,
            manager: null,
            activeElement: null,
            startPinchDist: 0,
            lastAngle: 0
        };

        this.keys = {
            w: false, a: false, s: false, d: false,
            arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
            shift: false
        };

        this.init();
    }

    init() {
        this.initKeys();
        this.initNipple();
        this.initTouchListeners();
    }

    initKeys() {
        window.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(k)) this.keys[k] = true;
            if (k === 'shift') this.state.sprint = true;
        });
        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(k)) this.keys[k] = false;
            if (k === 'shift') this.state.sprint = false;
        });
    }

    initNipple() {
        if (typeof nipplejs === 'undefined') {
            console.error("NippleJS not found!");
            return;
        }

        this.touch.manager = nipplejs.create({
            zone: this.overlay,
            mode: 'dynamic',
            color: 'white',
            size: 100,
            threshold: 0.1,
            multitouch: false
        });

        this.touch.manager.on('start', (evt, data) => {
            // Nipple created, but hidden by CSS .nipple { display: none }
            this.touch.activeElement = data.el;
            this.state.isJoystickActive = false;
        });

        this.touch.manager.on('move', (evt, data) => {
            if (this.state.isMultitouch || this.state.isLongPressTriggered) {
                this.forceHideJoystick();
                return;
            }

            // If moved too far, cancel long press
            if (data.distance > this.config.LONG_PRESS_MAX_MOVE) {
                clearTimeout(this.touch.longPressTimeout);
            }

            // Check Joystick Thresholds
            if (!this.state.isJoystickActive) {
                const duration = Date.now() - this.touch.startTime;

                // STRICT condition:
                // 1. Distance > 15px
                // 2. Duration > 50ms
                // 3. No multitouch
                if (data.distance > this.config.JOYSTICK_MIN_DIST && duration > this.config.JOYSTICK_MIN_TIME && !this.state.isMultitouch) {
                    this.state.isJoystickActive = true;
                    clearTimeout(this.touch.longPressTimeout);

                    if (this.touch.activeElement) {
                        this.touch.activeElement.classList.add('active-joystick');
                    }
                }
            }

            if (this.state.isJoystickActive && data.vector) {
                // NippleJS Vector: y is UP (+1).
                this.state.x = data.vector.x;
                this.state.y = data.vector.y;
                this.state.active = true;
            }
        });

        this.touch.manager.on('end', () => {
            this.resetJoystick();
        });
    }

    resetJoystick() {
        this.state.active = false;
        this.state.x = 0;
        this.state.y = 0;
        this.state.isJoystickActive = false;
        this.touch.activeElement = null;
    }

    forceHideJoystick() {
        this.state.isJoystickActive = false;
        this.state.active = false;
        this.state.x = 0;
        this.state.y = 0;
        if (this.touch.activeElement) {
            this.touch.activeElement.classList.remove('active-joystick');
        }
    }

    initTouchListeners() {
        // Native listeners for Pinch, Tap, Long Press
        this.overlay.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
        this.overlay.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
        this.overlay.addEventListener('touchend', (e) => this.handleEnd(e), { passive: false });

        // Mouse for testing
        this.overlay.addEventListener('mousedown', (e) => this.handleStart(e));
        this.overlay.addEventListener('mousemove', (e) => this.handleMove(e));
        this.overlay.addEventListener('mouseup', (e) => this.handleEnd(e));
    }

    handleStart(e) {
        // Reset events
        this.state.tap = null;
        this.state.longPress = null;
        this.state.zoomDelta = 0;
        this.state.rotationDelta = 0;

        let clientX, clientY;
        if (e.touches) {
            if (e.touches.length > 1) {
                this.state.isMultitouch = true;
                this.forceHideJoystick();
                clearTimeout(this.touch.longPressTimeout);
                this.initMultitouch(e);
                return;
            }
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        this.state.isMultitouch = false;
        this.state.isLongPressTriggered = false;
        this.touch.startTime = Date.now();
        this.touch.startPos = { x: clientX, y: clientY };

        // Start Long Press Timer
        this.touch.longPressTimeout = setTimeout(() => {
            this.triggerLongPress(clientX, clientY);
        }, this.config.LONG_PRESS_TIME);
    }

    handleMove(e) {
        let clientX, clientY;
        if (e.touches) {
            if (e.touches.length > 1) {
                this.state.isMultitouch = true;
                this.forceHideJoystick();
                clearTimeout(this.touch.longPressTimeout);
                e.preventDefault();
                this.handleMultitouch(e);
                return;
            }
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        if (this.state.isMultitouch) {
            e.preventDefault();
            return;
        }

        const dx = clientX - this.touch.startPos.x;
        const dy = clientY - this.touch.startPos.y;
        const dist = Math.hypot(dx, dy);

        // If moved too much, cancel long press
        if (dist > this.config.LONG_PRESS_MAX_MOVE) {
            clearTimeout(this.touch.longPressTimeout);
        }
    }

    handleEnd(e) {
        clearTimeout(this.touch.longPressTimeout);

        if (e.touches && e.touches.length === 0) {
            this.state.isMultitouch = false;
        }

        const duration = Date.now() - this.touch.startTime;

        // Process Tap only if NO joystick, NO multitouch, NO long press
        if (!this.state.isMultitouch && !this.state.isJoystickActive && !this.state.isLongPressTriggered) {
            if (duration < this.config.TAP_MAX_DURATION) {
                this.processTap(this.touch.startPos.x, this.touch.startPos.y);
            }
        }
    }

    triggerLongPress(x, y) {
        this.state.isLongPressTriggered = true;
        this.forceHideJoystick();
        // Emit Long Press
        this.state.longPress = { x, y };
        // Vibrate
        if (navigator.vibrate) navigator.vibrate(50);
    }

    processTap(x, y) {
        const now = Date.now();
        if (now - this.touch.lastTapTime < this.config.DOUBLE_TAP_TIME) {
            clearTimeout(this.touch.tapTimeout);
            this.state.tap = { x, y, type: 'run' }; // Double tap
            this.touch.lastTapTime = 0;
        } else {
            this.touch.tapTimeout = setTimeout(() => {
                this.state.tap = { x, y, type: 'walk' }; // Single tap
            }, 250);
            this.touch.lastTapTime = now;
        }
    }

    initMultitouch(e) {
        const t1 = e.touches[0], t2 = e.touches[1];
        if(!t1 || !t2) return;

        // Distance for Pinch
        this.touch.startPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

        // Angle for Rotation
        this.touch.lastAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
    }

    handleMultitouch(e) {
        const t1 = e.touches[0], t2 = e.touches[1];
        if(!t1 || !t2) return;

        // 1. Zoom (Pinch)
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (this.touch.startPinchDist > 0) {
            const scale = dist / this.touch.startPinchDist;
            this.state.zoomDelta = (scale - 1.0) * 0.02; // Reduced sensitivity (was 0.1)
        }

        // 2. Rotation
        const currentAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
        let rotationDelta = currentAngle - this.touch.lastAngle;

        // Normalize wrap-around (-PI to PI)
        if (rotationDelta > Math.PI) rotationDelta -= 2 * Math.PI;
        else if (rotationDelta < -Math.PI) rotationDelta += 2 * Math.PI;

        this.state.rotationDelta = rotationDelta;
        this.touch.lastAngle = currentAngle;
    }

    update() {
        // Integrate Keyboard if Joystick is inactive
        if (!this.state.active) {
            let kx = 0, ky = 0;
            if (this.keys.w || this.keys.arrowup) ky += 1;
            if (this.keys.s || this.keys.arrowdown) ky -= 1;
            if (this.keys.a || this.keys.arrowleft) kx -= 1;
            if (this.keys.d || this.keys.arrowright) kx += 1;

            if (kx !== 0 || ky !== 0) {
                const len = Math.hypot(kx, ky);
                this.state.x = kx / len;
                this.state.y = ky / len;
                this.state.active = true;
            } else {
                this.state.active = false;
                this.state.x = 0;
                this.state.y = 0;
            }
        }

        const currentState = { ...this.state };

        // Reset transient events
        this.state.tap = null;
        this.state.longPress = null;
        this.state.zoomDelta = 0;
        this.state.rotationDelta = 0;

        return currentState;
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

    update(entity, input, cameraRotation, dt, checkCollision) {
        if (!input.active) return false;

        const cos = Math.cos(cameraRotation);
        const sin = Math.sin(cameraRotation);

        // Input X/Y is normalized. Up is +1.
        // Physics logic:
        // Screen Y is Down (+).
        // Move Up -> -Y.
        // Formula: moveY = -input.y

        const moveX = input.x * cos - (-input.y) * sin;
        const moveY = input.x * sin + (-input.y) * cos;

        if (Math.hypot(moveX, moveY) > 0.01) {
            entity.rotation = Math.atan2(moveY, moveX);
        }

        let speed = this.config.baseSpeed;
        if (input.sprint) speed *= this.config.runMultiplier;

        const inputMagnitude = Math.hypot(input.x, input.y);
        speed *= Math.min(1.0, inputMagnitude);

        const dist = speed * (dt / 16.0) * 5;

        const nextX = entity.x + moveX * dist;
        const nextY = entity.y + moveY * dist;

        let moved = false;

        if (!checkCollision(nextX, nextY)) {
            entity.x = nextX;
            entity.y = nextY;
            moved = true;
        } else {
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

export class Pathfinder {
    constructor(collisionCheck, gridSize = 40) {
        this.checkCollision = collisionCheck;
        this.gridSize = gridSize;
    }

    findPath(start, end) {
        // Convert world to grid
        const startNode = this.worldToGrid(start.x, start.y);
        const endNode = this.worldToGrid(end.x, end.y);

        const openSet = [];
        const closedSet = new Set();
        const cameFrom = new Map();

        const gScore = new Map();
        const fScore = new Map();

        const key = (n) => `${n.x},${n.y}`;

        openSet.push(startNode);
        gScore.set(key(startNode), 0);
        fScore.set(key(startNode), this.heuristic(startNode, endNode));

        let iterations = 0;
        const maxIterations = 2000; // Safety break

        while (openSet.length > 0) {
            if (iterations++ > maxIterations) break;

            // Get node with lowest fScore
            openSet.sort((a, b) => (fScore.get(key(a)) || Infinity) - (fScore.get(key(b)) || Infinity));
            const current = openSet.shift();

            if (current.x === endNode.x && current.y === endNode.y) {
                return this.reconstructPath(cameFrom, current);
            }

            closedSet.add(key(current));

            const neighbors = this.getNeighbors(current);
            for (let neighbor of neighbors) {
                const neighborKey = key(neighbor);
                if (closedSet.has(neighborKey)) continue;

                // Check collision at world coordinates
                const worldPos = this.gridToWorld(neighbor.x, neighbor.y);
                if (this.checkCollision(worldPos.x, worldPos.y)) continue;

                const dist = (neighbor.x !== current.x && neighbor.y !== current.y) ? 1.414 : 1;
                const tentativeG = (gScore.get(key(current)) || Infinity) + dist;

                if (tentativeG < (gScore.get(neighborKey) || Infinity)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    fScore.set(neighborKey, tentativeG + this.heuristic(neighbor, endNode));

                    if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        // Fallback: direct line if no path found (or return null)
        console.log("Path not found");
        return null;
    }

    getNeighbors(node) {
        const dirs = [
            {x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0},
            {x:-1, y:-1}, {x:1, y:-1}, {x:-1, y:1}, {x:1, y:1}
        ];
        return dirs.map(d => ({x: node.x + d.x, y: node.y + d.y}));
    }

    heuristic(a, b) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }

    worldToGrid(x, y) {
        return {
            x: Math.round(x / this.gridSize),
            y: Math.round(y / this.gridSize)
        };
    }

    gridToWorld(gx, gy) {
        return {
            x: gx * this.gridSize,
            y: gy * this.gridSize
        };
    }

    reconstructPath(cameFrom, current) {
        const totalPath = [this.gridToWorld(current.x, current.y)];
        const key = (n) => `${n.x},${n.y}`;

        while (cameFrom.has(key(current))) {
            current = cameFrom.get(key(current));
            totalPath.unshift(this.gridToWorld(current.x, current.y));
        }
        return totalPath;
    }
}
