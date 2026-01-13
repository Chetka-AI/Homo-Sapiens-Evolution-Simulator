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
 */

export class InputController {
    constructor(overlayElement) {
        this.overlay = overlayElement || document.body;

        this.config = {
            TAP_MAX_DURATION: 250,
            DOUBLE_TAP_TIME: 350,
            JOYSTICK_MIN_DIST: 15, // Threshold 15px
            JOYSTICK_MIN_TIME: 100,
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
            if (this.state.isLongPressTriggered || this.state.isMultitouch) return;

            this.touch.activeElement = data.el;
            if (this.touch.activeElement) {
                // Hide initially, show only if confirmed as joystick
                this.touch.activeElement.style.opacity = '0';
                this.touch.activeElement.style.transition = 'opacity 0.2s ease-out';
            }

            this.state.isJoystickActive = false;
        });

        this.touch.manager.on('move', (evt, data) => {
            // Strict single touch check: evt.target.touches length must be 1 (if available)
            // But NippleJS event doesn't give 'touches' list directly in 'evt'.
            // We rely on our global 'isMultitouch' flag and checks.

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
                // STRICT condition: Only activate if one finger, distance > 15px
                // Note: isMultitouch is updated by native touchstart listeners.
                if (data.distance > this.config.JOYSTICK_MIN_DIST && duration > this.config.JOYSTICK_MIN_TIME && !this.state.isMultitouch) {
                    this.state.isJoystickActive = true;
                    clearTimeout(this.touch.longPressTimeout); // User intends to move

                    if (this.touch.activeElement) {
                        this.touch.activeElement.style.opacity = '1';
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
            this.touch.activeElement.style.opacity = '0';
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
            this.state.zoomDelta = (scale - 1.0) * 0.1;
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
        // So moveY should be negative when Input is Positive.
        // Formula: moveY = -input.y

        const moveX = input.x * cos - (-input.y) * sin;
        const moveY = input.x * sin + (-input.y) * cos;

        if (Math.hypot(moveX, moveY) > 0.01) {
            entity.rotation = Math.atan2(moveY, moveX);
        }

        let speed = this.config.baseSpeed;
        if (input.sprint) speed *= this.config.runMultiplier;

        // Input magnitude for analog control
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
