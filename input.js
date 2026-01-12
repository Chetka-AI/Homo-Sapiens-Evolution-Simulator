/**
 * Input.js - v9.0
 * - Dodano obsługę "Long Press" (Długie przytrzymanie) dla menu kontekstowego.
 * - Long Press blokuje joystick, jeśli zostanie wykryty.
 * - Próg Long Press: 600ms przy minimalnym ruchu.
 */

class InputHandler {
    constructor(engine) {
        this.engine = engine;
        this.overlay = document.getElementById('touch-overlay');
        
        this.config = {
            TAP_MAX_DURATION: 250,  
            TAP_MAX_DIST: 10,       
            DOUBLE_TAP_TIME: 350,
            
            // Joystick
            JOYSTICK_MIN_DIST: 20,
            JOYSTICK_MIN_TIME: 100,
            
            // Long Press (Interakcja)
            LONG_PRESS_TIME: 600, // Czas w ms do aktywacji menu
            LONG_PRESS_MAX_MOVE: 10 // Max przesunięcie palca, żeby zaliczyć long press
        };

        this.touch = {
            startTime: 0,
            startPos: { x: 0, y: 0 },
            currentPos: { x: 0, y: 0 },
            
            lastTapTime: 0,
            tapTimeout: null,
            longPressTimeout: null, // Timer do długiego przytrzymania
            
            isMultitouch: false,
            isJoystickActive: false,
            isLongPressTriggered: false, // Flaga czy menu się otworzyło
            
            activeElement: null,
            manager: null
        };

        this.init();
    }

    init() {
        // NippleJS
        this.touch.manager = nipplejs.create({
            zone: this.overlay,
            mode: 'dynamic',
            color: 'white',
            size: 100,
            threshold: 0.1, 
            multitouch: false 
        });

        this.setupListeners();
        this.setupJoystickEvents();
        this.setupUIListeners();
    }

    setupUIListeners() {
        // Obsługa przycisków UI (Plecak)
        document.getElementById('btn-inventory').addEventListener('click', (e) => {
            e.stopPropagation();
            this.engine.toggleInventory();
        });

        document.getElementById('btn-close-menu').addEventListener('click', (e) => {
            e.stopPropagation();
            this.engine.toggleInventory(false);
        });

        // Kliknięcie w tło zamyka kontekst
        this.overlay.addEventListener('click', () => {
             this.engine.hideContextMenu();
        });
    }

    setupListeners() {
        this.overlay.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
        this.overlay.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
        this.overlay.addEventListener('touchend', (e) => this.handleEnd(e), { passive: false });
        // Mouse events for testing on desktop
        this.overlay.addEventListener('mousedown', (e) => this.handleStart(e));
        this.overlay.addEventListener('mousemove', (e) => this.handleMove(e));
        this.overlay.addEventListener('mouseup', (e) => this.handleEnd(e));
    }

    setupJoystickEvents() {
        this.touch.manager.on('start', (evt, data) => {
            if (this.touch.isLongPressTriggered) return; // Zablokuj jeśli już wykryto long press

            this.touch.activeElement = data.el; 
            
            // Ukryj joystick na start
            if (this.touch.activeElement) {
                this.touch.activeElement.style.display = 'none';
                this.touch.activeElement.style.opacity = '0';
                this.touch.activeElement.style.transition = 'opacity 0.2s ease-out';
            }

            if (this.touch.isMultitouch) {
                this.forceHideJoystick();
                return;
            }

            this.touch.isJoystickActive = false;
        });

        this.touch.manager.on('move', (evt, data) => {
            if (this.touch.isMultitouch || this.touch.isLongPressTriggered) {
                this.forceHideJoystick();
                return;
            }

            // Jeśli przesunięto za mocno, anuluj timer long press
            if (data.distance > this.config.LONG_PRESS_MAX_MOVE) {
                clearTimeout(this.touch.longPressTimeout);
            }

            if (!this.touch.isJoystickActive) {
                const duration = Date.now() - this.touch.startTime;
                
                // Joystick aktywuje się szybciej (100ms) niż Long Press (600ms)
                // Ale wymaga ruchu (>20px). Long press wymaga braku ruchu.
                if (data.distance > this.config.JOYSTICK_MIN_DIST && duration > this.config.JOYSTICK_MIN_TIME) {
                    this.touch.isJoystickActive = true;
                    // Anuluj long press bo użytkownik ruszył joystickiem
                    clearTimeout(this.touch.longPressTimeout); 

                    if (this.touch.activeElement) {
                        this.touch.activeElement.style.display = 'block';
                        void this.touch.activeElement.offsetWidth;
                        this.touch.activeElement.style.opacity = '1';
                    }
                }
            }
            
            if (this.touch.isJoystickActive && data.vector) {
                this.engine.state.input.x = data.vector.x;
                this.engine.state.input.y = data.vector.y;
                this.engine.state.input.active = true;
                
                if (data.distance > 5) {
                    this.engine.state.navigation.target = null;
                }
            }
        });

        this.touch.manager.on('end', (evt, data) => {
            // Reset
            this.engine.state.input.active = false;
            this.engine.state.input.x = 0;
            this.engine.state.input.y = 0;
            this.touch.isJoystickActive = false;
            this.touch.activeElement = null;
        });
    }

    forceHideJoystick() {
        this.touch.isJoystickActive = false;
        if (this.touch.activeElement) {
            this.touch.activeElement.style.display = 'none';
            this.touch.activeElement.style.opacity = '0';
        }
        this.engine.state.input.active = false;
        this.engine.state.input.x = 0;
        this.engine.state.input.y = 0;
    }

    // --- Obsługa zdarzeń natywnych (dla Long Press) ---

    handleStart(e) {
        // Zamknij kontekst jeśli klikamy gdzie indziej
        this.engine.hideContextMenu();

        let clientX, clientY;
        if (e.touches) {
            if (e.touches.length > 1) {
                this.touch.isMultitouch = true;
                this.forceHideJoystick();
                clearTimeout(this.touch.longPressTimeout);
                this.initPinch(e);
                return;
            }
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            // Myszka
            clientX = e.clientX;
            clientY = e.clientY;
        }

        this.touch.isMultitouch = false;
        this.touch.isLongPressTriggered = false;
        this.touch.startTime = Date.now();
        this.touch.startPos = { x: clientX, y: clientY };
        this.touch.currentPos = { x: clientX, y: clientY };

        // Start Timera Long Press
        this.touch.longPressTimeout = setTimeout(() => {
            this.triggerLongPress();
        }, this.config.LONG_PRESS_TIME);
    }

    handleMove(e) {
        let clientX, clientY;
        if (e.touches) {
            if (e.touches.length > 1) {
                this.touch.isMultitouch = true;
                this.forceHideJoystick();
                clearTimeout(this.touch.longPressTimeout);
                e.preventDefault();
                this.handlePinch(e);
                return;
            }
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        if (this.touch.isMultitouch) {
            e.preventDefault();
            return;
        }

        // Oblicz dystans od startu
        const dx = clientX - this.touch.startPos.x;
        const dy = clientY - this.touch.startPos.y;
        const dist = Math.hypot(dx, dy);

        // Jeśli ruszyliśmy za bardzo, anuluj long press
        if (dist > this.config.LONG_PRESS_MAX_MOVE) {
            clearTimeout(this.touch.longPressTimeout);
        }
    }

    handleEnd(e) {
        clearTimeout(this.touch.longPressTimeout);

        if (e.touches && e.touches.length === 0) {
            this.touch.isMultitouch = false;
        }

        const duration = Date.now() - this.touch.startTime;

        // Logika Tapnięcia (tylko jeśli nie było joysticka, multitoucha, ani long pressa)
        if (!this.touch.isMultitouch && !this.touch.isJoystickActive && !this.touch.isLongPressTriggered) {
            if (duration < this.config.TAP_MAX_DURATION) {
                this.processTap(this.touch.startPos.x, this.touch.startPos.y);
            }
        }
    }

    triggerLongPress() {
        // Funkcja wywoływana po 600ms bezruchu
        this.touch.isLongPressTriggered = true;
        this.forceHideJoystick(); // Upewnij się, że joystick znika
        
        // Wywołaj menu w Engine
        this.engine.showContextMenu(this.touch.startPos.x, this.touch.startPos.y);
        
        // Wibracja (jeśli urządzenie wspiera)
        if (navigator.vibrate) navigator.vibrate(50);
    }

    processTap(x, y) {
        const now = Date.now();
        if (now - this.touch.lastTapTime < this.config.DOUBLE_TAP_TIME) {
            clearTimeout(this.touch.tapTimeout);
            this.engine.setNavigation(x, y, 'run');
            this.touch.lastTapTime = 0;
        } else {
            this.touch.tapTimeout = setTimeout(() => {
                this.engine.setNavigation(x, y, 'walk');
            }, 250);
            this.touch.lastTapTime = now;
        }
    }

    initPinch(e) {
        const t1 = e.touches[0], t2 = e.touches[1];
        if(!t1 || !t2) return;
        const cam = this.engine.camera;
        cam.startDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        cam.startAng = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
        cam.startZoom = cam.zoom;
        cam.startRot = cam.rotation;
    }

    handlePinch(e) {
        const t1 = e.touches[0], t2 = e.touches[1];
        if(!t1 || !t2) return;
        const cam = this.engine.camera;
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        
        cam.zoom = Math.min(Math.max(cam.startZoom * (dist / cam.startDist), 0.05), 5.0);
        
        const ang = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
        cam.rotation = cam.startRot - (ang - cam.startAng);
    }
}