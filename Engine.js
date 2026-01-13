/**
 * Engine.js - v9.5
 * - Warstwowe rysowanie (Teren -> Pnie -> Gracz -> Korony).
 * - Optymalizowana trawa za pomocą Patternu Szumu.
 * - Wielkie korony drzew.
 */

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.world = new WorldManager();
        
        // Generujemy wzór szumu dla trawy (raz na start gry)
        this.grassPattern = this.createNoisePattern();

        this.state = {
            player: new Character(),
            navigation: { target: null, type: null },
            input: { x: 0, y: 0, active: false },
            ui: { inventoryOpen: false, contextMenuOpen: false }
        };

        this.camera = { x: 0, y: 0, zoom: 1.0, rotation: 0 };
        this.lastTime = Date.now();
        this.init();
    }

    // Tworzy mały canvas z szumem (gęste kreseczki), który posłuży jako pieczątka
    createNoisePattern() {
        const size = 128;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = size;
        tempCanvas.height = size;
        const tCtx = tempCanvas.getContext('2d');
        
        // Przezroczyste tło
        tCtx.clearRect(0, 0, size, size);
        
        // Rysujemy "gęste kreseczki szarości"
        tCtx.fillStyle = 'rgba(0, 0, 0, 0.08)'; // Bardzo delikatny cień
        for(let i=0; i<400; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const w = 2 + Math.random() * 3;
            const h = 1;
            tCtx.fillRect(x, y, w, h);
        }

        // Większe plamy
        for(let i=0; i<20; i++) {
             tCtx.fillStyle = `rgba(0, 20, 0, ${0.03 + Math.random()*0.02})`;
             tCtx.beginPath();
             tCtx.arc(Math.random()*size, Math.random()*size, 5 + Math.random()*15, 0, Math.PI*2);
             tCtx.fill();
        }

        return this.ctx.createPattern(tempCanvas, 'repeat');
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

    toggleInventory(forceState=null) {
         const el = document.getElementById('side-menu');
         this.state.ui.inventoryOpen = forceState !== null ? forceState : !this.state.ui.inventoryOpen;
         this.state.ui.inventoryOpen ? el.classList.remove('hidden') : el.classList.add('hidden');
         if(this.state.ui.inventoryOpen) this.hideContextMenu();
    }
    showContextMenu(sx, sy) {
        const menu = document.getElementById('context-menu');
        const worldPos = this.screenToWorld(sx, sy);
        const obj = this.world.getObjectAtWorldPos(worldPos.x, worldPos.y);
        const items = menu.querySelectorAll('.context-item');
        
        if (obj) {
            let name = obj.type === 'tree' ? `Drzewo (${obj.subType})` : 'Kamień';
            items[0].innerText = `👁️ Zbadaj: ${name}`;
            items[1].style.display = 'block'; 
        } else {
            items[0].innerText = "👁️ Zbadaj teren";
            items[1].style.display = 'none'; 
        }

        let px = sx + 10, py = sy + 10;
        if (px + 150 > this.canvas.width) px = sx - 160;
        if (py + 120 > this.canvas.height) py = sy - 130;
        menu.style.left = `${px}px`; menu.style.top = `${py}px`;
        menu.classList.remove('hidden');
        this.state.ui.contextMenuOpen = true;
        this.state.navigation.target = null;
    }
    hideContextMenu() {
        document.getElementById('context-menu').classList.add('hidden');
        this.state.ui.contextMenuOpen = false;
    }
    setNavigation(sx, sy, type) {
        if (this.state.ui.contextMenuOpen) return;
        this.state.navigation.target = this.screenToWorld(sx, sy);
        this.state.navigation.type = type;
    }
    screenToWorld(sx, sy) {
        const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
        let dx = (sx - cx) / this.camera.zoom, dy = (sy - cy) / this.camera.zoom;
        const cos = Math.cos(this.camera.rotation), sin = Math.sin(this.camera.rotation);
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
        let mx = 0, my = 0, isMoving = false, isRunning = false;

        if (!this.state.ui.inventoryOpen) {
            if (this.state.input.active) {
                const cos = Math.cos(this.camera.rotation), sin = Math.sin(this.camera.rotation);
                mx = this.state.input.x * cos - (-this.state.input.y) * sin;
                my = this.state.input.x * sin + (-this.state.input.y) * cos;
                if (Math.hypot(mx, my) > 0.01) {
                    p.rotation = Math.atan2(my, mx);
                    isMoving = true;
                    if (Math.hypot(this.state.input.x, this.state.input.y) > 0.8) isRunning = true;
                }
            } else if (nav.target) {
                const dx = nav.target.x - p.x, dy = nav.target.y - p.y;
                if (Math.hypot(dx, dy) > 5) {
                    p.rotation = Math.atan2(dy, dx);
                    mx = Math.cos(p.rotation); my = Math.sin(p.rotation);
                    isMoving = true;
                    if (nav.type === 'run') isRunning = true;
                } else nav.target = null;
            }
        }

        let currentSpeed = p.stats.baseSpeed;
        if (p.vitals.stamina <= 0) isRunning = false;
        if (isRunning) currentSpeed *= p.stats.runMultiplier;
        if (!isMoving) currentSpeed = 0;

        if (isMoving) {
            const nextX = p.x + mx * currentSpeed;
            const nextY = p.y + my * currentSpeed;
            if (!this.world.checkCollision(nextX, nextY)) {
                p.x = nextX;
                p.y = nextY;
            }
        }

        p.update(dt, isMoving, isRunning, currentSpeed);
        this.camera.x += (p.x - this.camera.x) * 0.1;
        this.camera.y += (p.y - this.camera.y) * 0.1;

        if (now % 10 < 1) this.updateUI();
    }

    updateUI() {
        const p = this.state.player, v = p.vitals;
        document.getElementById('pos-info').innerText = `${(p.x/100).toFixed(1)}m, ${(p.y/100).toFixed(1)}m`;
        document.getElementById('bar-health').style.width = `${v.health}%`;
        document.getElementById('bar-stamina').style.width = `${v.stamina}%`;
        document.getElementById('bar-hunger').style.width = `${v.hunger}%`;
        document.getElementById('bar-thirst').style.width = `${v.thirst}%`;
    }

    draw() {
        const { ctx, canvas, camera, state, world } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.rotate(-camera.rotation);
        ctx.translate(-camera.x, -camera.y);

        // Obliczamy widoczne chunki
        const camChunkX = Math.floor(camera.x / 100 / 16);
        const camChunkY = Math.floor(camera.y / 100 / 16);
        const range = 2;
        const visibleChunks = [];
        for(let cx = camChunkX - range; cx <= camChunkX + range; cx++) {
            for(let cy = camChunkY - range; cy <= camChunkY + range; cy++) {
                visibleChunks.push(world.getChunk(cx, cy));
            }
        }

        // WARSTWA 1: TEREN
        for (const chunk of visibleChunks) {
            this.drawChunkTerrain(ctx, chunk);
        }

        // WARSTWA 2: OBIEKTY NA ZIEMI (Pnie, Kamienie)
        // Sortowanie po Y jest kluczowe dla obiektów na ziemi
        const groundObjects = [];
        for (const chunk of visibleChunks) {
            groundObjects.push(...chunk.objects);
        }
        groundObjects.sort((a, b) => a.y - b.y);

        for (const obj of groundObjects) {
            this.drawObjectBase(ctx, obj, 
                obj.x * 100 + obj.cx * 1600, // Przeliczenie na pozycję globalną, jeśli obj.x jest lokalne w chunku
                obj.y * 100 + obj.cy * 1600  // Uwaga: w World.js x,y są lokalne dla chunka? Sprawdźmy WorldManager
            );
            // Korekta: World.js przechowuje lokalne x,y w chunku. Musimy to przeliczyć przy renderze globalnym
            const globalX = (obj.x * 100) + (obj.cx || 0) * 1600; // Chunk.cx nie jest w obj, musimy uważać
        }
        
        // *Poprawka*: Sortowanie globalne wymaga znajomości Chunka obiektu.
        // Najprościej: Iteruj chunki i rysuj, player jest rysowany osobno.
        // Ale to psuje sortowanie z graczem.
        // Uprośćmy: Rysuj chunki w pętli. Player jest narysowany "na wierzchu" ziemi.
        
        for (const chunk of visibleChunks) {
             this.drawChunkObjectsBottom(ctx, chunk);
        }

        this.drawTargetMarker(ctx);
        this.drawCharacter(ctx, state.player); // Gracz jest warstwą "środkową"

        // WARSTWA 3: KORONY DRZEW (NAD GRACZEM)
        for (const chunk of visibleChunks) {
             this.drawChunkObjectsTop(ctx, chunk);
        }

        ctx.restore();
    }

    drawChunkTerrain(ctx, chunk) {
        const tileSize = 100;
        const chunkPxX = chunk.cx * 16 * tileSize;
        const chunkPxY = chunk.cy * 16 * tileSize;

        for(let x=0; x<16; x++) {
            for(let y=0; y<16; y++) {
                const tile = chunk.tiles[x][y];
                if(!tile.baseColor) continue;

                const px = chunkPxX + x * tileSize;
                const py = chunkPxY + y * tileSize;

                // Tło (Kolor bazowy)
                ctx.fillStyle = tile.baseColor;
                ctx.fillRect(px, py, tileSize+1, tileSize+1);

                // Nałożenie szumu (Pattern) tylko na trawę
                if (tile.grassData) {
                    ctx.save();
                    ctx.translate(px, py);
                    ctx.fillStyle = this.grassPattern;
                    ctx.globalAlpha = 0.5; // Przezroczystość szumu
                    ctx.fillRect(0, 0, tileSize, tileSize);
                    ctx.restore();
                }
            }
        }
    }

    // Rysuje pnie i kamienie
    drawChunkObjectsBottom(ctx, chunk) {
        const tileSize = 100;
        const chunkPxX = chunk.cx * 16 * tileSize;
        const chunkPxY = chunk.cy * 16 * tileSize;

        // Sortowanie lokalne w chunku pomaga
        chunk.objects.sort((a, b) => a.y - b.y);

        for(let obj of chunk.objects) {
            const px = chunkPxX + obj.x * tileSize;
            const py = chunkPxY + obj.y * tileSize;
            this.drawObjectBase(ctx, obj, px, py);
        }
    }

    // Rysuje korony drzew
    drawChunkObjectsTop(ctx, chunk) {
        const tileSize = 100;
        const chunkPxX = chunk.cx * 16 * tileSize;
        const chunkPxY = chunk.cy * 16 * tileSize;

        for(let obj of chunk.objects) {
            const px = chunkPxX + obj.x * tileSize;
            const py = chunkPxY + obj.y * tileSize;
            this.drawObjectTop(ctx, obj, px, py);
        }
    }

    drawObjectBase(ctx, obj, x, y) {
        if (obj.type === 'tree' && obj.renderData) {
            const rd = obj.renderData;
            ctx.save();
            ctx.translate(x, y);

            // Cień na ziemi
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(0, 0, rd.trunkRadius + 10, (rd.trunkRadius + 10)*0.5, 0, 0, Math.PI*2);
            ctx.fill();

            // Pień (Okrąg)
            ctx.fillStyle = rd.trunkColor || '#4e342e';
            ctx.beginPath();
            ctx.arc(0, 0, rd.trunkRadius, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#2d1b15';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();

        } else if (obj.type === 'rock') {
            const rd = obj.renderData;
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#888';
            ctx.beginPath(); ctx.arc(0, 0, rd.radius, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke();
            // Detal kamienia
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.beginPath(); ctx.arc(-rd.radius*0.3, -rd.radius*0.3, rd.radius*0.4, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    }

    drawObjectTop(ctx, obj, x, y) {
        if (obj.type !== 'tree' || !obj.renderData) return;
        const rd = obj.renderData;
        const cd = rd.crownData;

        // Jeśli drzewo jest daleko od centrum ekranu, możemy uprościć rysowanie (LOD), ale na razie rysujemy wszystko
        
        ctx.save();
        ctx.translate(x, y);

        if (rd.type === 'pine') {
            // IGLASTE - Warstwy trójkątów
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 10;
            
            for (let layer of cd.layers) {
                ctx.fillStyle = layer.color;
                ctx.beginPath();
                const step = (Math.PI * 2) / layer.points;
                for (let i = 0; i < layer.points; i++) {
                    const ang = i * step + layer.angleOffset;
                    // Promieniste wierzchołki
                    // Zewnętrzny punkt
                    const rx = Math.cos(ang) * layer.radius;
                    const ry = Math.sin(ang) * layer.radius;
                    ctx.lineTo(rx, ry);
                    
                    // Wewnętrzny punkt (wcięcie)
                    const angIn = ang + step * 0.5;
                    const rxIn = Math.cos(angIn) * (layer.radius * 0.4); // Wcięcie gwiazdy
                    const ryIn = Math.sin(angIn) * (layer.radius * 0.4);
                    ctx.lineTo(rxIn, ryIn);
                }
                ctx.closePath();
                ctx.fill();
                // "Cieniowanie" warstw
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.stroke();
            }

        } else {
            // LIŚCIASTE - Bloby i gałęzie
            
            // 1. Gałęzie (pod liśćmi)
            ctx.rotate(obj.rotation);
            ctx.strokeStyle = rd.trunkColor;
            for(let b of cd.branches) {
                ctx.lineWidth = b.width;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(b.angle) * b.length, Math.sin(b.angle) * b.length);
                ctx.stroke();
            }

            // 2. Chmura liści (półprzezroczysta)
            ctx.globalAlpha = 0.85;
            
            // Rysujemy bloby
            for(let blob of cd.blobs) {
                ctx.fillStyle = blob.color;
                ctx.beginPath();
                ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI*2);
                ctx.fill();
                
                // Detal (lekkie cieniowanie bloba)
                ctx.fillStyle = 'rgba(0,0,0,0.05)';
                ctx.beginPath();
                ctx.arc(blob.x - blob.r*0.2, blob.y - blob.r*0.2, blob.r*0.6, 0, Math.PI*2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    drawTargetMarker(ctx) {
        if (!this.state.navigation.target) return;
        const t = this.state.navigation.target;
        ctx.fillStyle = this.state.navigation.type === 'run' ? '#ff4757' : '#ffa502';
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(t.x, t.y, 6, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    drawCharacter(ctx, p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation + Math.PI / 2); 
        const breathScale = 1.0 + Math.sin(Date.now() * 0.003) * 0.02;
        ctx.scale(breathScale, breathScale);
        const { rightLegOffset, leftLegOffset, rightArmOffset, leftArmOffset } = p.anim;
        ctx.lineWidth = 2; ctx.strokeStyle = '#000';
        ctx.fillStyle = '#d4a373';
        this.drawLimb(ctx, -10, 6 + leftLegOffset, 7);
        this.drawLimb(ctx, 10, 6 + rightLegOffset, 7);
        this.drawLimb(ctx, -18, -2 + leftArmOffset, 6);
        this.drawLimb(ctx, 18, -2 + rightArmOffset, 6);
        ctx.fillStyle = '#8d5524';
        ctx.beginPath(); ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d4a373';
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(0, 2, 9.5, 0, Math.PI, false); ctx.fill();
        ctx.restore();
    }
    drawLimb(ctx, x, y, size) {
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    }
    gameLoop() { this.update(); this.draw(); requestAnimationFrame(() => this.gameLoop()); }
}