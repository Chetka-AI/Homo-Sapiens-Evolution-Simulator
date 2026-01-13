/**
 * Engine.js
 * Główny silnik renderujący i logiczny.
 * ZMIANY:
 * - Dodano funkcję `ensureUI()`, która automatycznie tworzy brakujące elementy HTML (menu, lista).
 * - Naprawia to problem, gdy w index.html brakuje odpowiednich tagów.
 */

class Pathfinder {
    constructor(world) {
        this.world = world;
        this.gridSize = 50; 
    }

    findPath(startX, startY, endX, endY) {
        const startNode = { x: Math.floor(startX / this.gridSize), y: Math.floor(startY / this.gridSize) };
        const endNode = { x: Math.floor(endX / this.gridSize), y: Math.floor(endY / this.gridSize) };

        if (!this.isWalkable(endNode.x, endNode.y)) {
            let found = false;
            for(let dx = -1; dx <= 1; dx++) {
                for(let dy = -1; dy <= 1; dy++) {
                    if (this.isWalkable(endNode.x + dx, endNode.y + dy)) {
                        endNode.x += dx; endNode.y += dy;
                        found = true; break;
                    }
                }
                if(found) break;
            }
            if(!found) return null; 
        }

        const openSet = [];
        const closedSet = new Set();
        
        openSet.push({ 
            x: startNode.x, 
            y: startNode.y, 
            g: 0, 
            h: this.heuristic(startNode, endNode), 
            parent: null 
        });

        let iterations = 0;
        const maxIterations = 2000; 

        while (openSet.length > 0) {
            iterations++;
            if (iterations > maxIterations) break; 

            openSet.sort((a, b) => (a.g + a.h) - (b.g + b.h));
            const current = openSet.shift();

            if (Math.abs(current.x - endNode.x) <= 1 && Math.abs(current.y - endNode.y) <= 1) {
                return this.reconstructPath(current);
            }

            const key = `${current.x},${current.y}`;
            closedSet.add(key);

            const neighbors = [
                {x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0},
                {x:-1, y:-1}, {x:1, y:-1}, {x:-1, y:1}, {x:1, y:1} 
            ];

            for (let n of neighbors) {
                const nx = current.x + n.x;
                const ny = current.y + n.y;
                const nKey = `${nx},${ny}`;

                if (closedSet.has(nKey)) continue;

                const moveInfo = this.getTileCost(nx, ny);
                if (!moveInfo.walkable) continue;

                const distCost = (n.x !== 0 && n.y !== 0) ? 1.4 : 1.0;
                const newG = current.g + distCost * moveInfo.cost;

                const existing = openSet.find(node => node.x === nx && node.y === ny);
                if (existing) {
                    if (newG < existing.g) {
                        existing.g = newG;
                        existing.parent = current;
                    }
                } else {
                    openSet.push({
                        x: nx,
                        y: ny,
                        g: newG,
                        h: this.heuristic({x: nx, y: ny}, endNode),
                        parent: current
                    });
                }
            }
        }
        
        return null;
    }

    reconstructPath(node) {
        const path = [];
        let curr = node;
        while (curr.parent) {
            path.push({ 
                x: curr.x * this.gridSize + this.gridSize/2, 
                y: curr.y * this.gridSize + this.gridSize/2 
            });
            curr = curr.parent;
        }
        return path.reverse(); 
    }

    heuristic(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    isWalkable(gridX, gridY) {
        const worldX = gridX * this.gridSize + this.gridSize/2;
        const worldY = gridY * this.gridSize + this.gridSize/2;
        const info = this.world.getMovementInfo(worldX, worldY);
        return info.allowed;
    }

    getTileCost(gridX, gridY) {
        const worldX = gridX * this.gridSize + this.gridSize/2;
        const worldY = gridY * this.gridSize + this.gridSize/2;
        const info = this.world.getMovementInfo(worldX, worldY);
        
        if (!info.allowed) return { walkable: false, cost: 999 };
        
        const terrainCost = (info.speedFactor < 1.0) ? 5.0 : 1.0;
        return { walkable: true, cost: terrainCost };
    }
}

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false }); 
        
        this.helperCanvas = document.createElement('canvas');
        this.helperCanvas.width = 1000;
        this.helperCanvas.height = 1000;
        this.helperCtx = this.helperCanvas.getContext('2d');

        this.world = new WorldManager();
        this.pathfinder = new Pathfinder(this.world); 
        
        this.grassPattern = this.createNoisePattern();

        this.state = {
            player: new Character(),
            navigation: { 
                target: null, 
                type: null,
                path: [] 
            },
            input: { x: 0, y: 0, active: false },
            ui: { inventoryOpen: false, contextMenuOpen: false, interactTarget: null }
        };

        this.camera = { x: 0, y: 0, zoom: 1.0, rotation: 0 };
        this.lastTime = Date.now();
        
        this.init();
    }

    createNoisePattern() {
        const size = 256; 
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = size;
        tempCanvas.height = size;
        const tCtx = tempCanvas.getContext('2d');
        
        tCtx.clearRect(0, 0, size, size);
        
        tCtx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        for(let i=0; i<600; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const w = 2 + Math.random() * 2;
            const h = 2;
            tCtx.fillRect(x, y, w, h);
        }

        for(let i=0; i<15; i++) {
             tCtx.fillStyle = `rgba(0, 30, 0, ${0.02 + Math.random()*0.03})`;
             tCtx.beginPath();
             tCtx.arc(Math.random()*size, Math.random()*size, 10 + Math.random()*30, 0, Math.PI*2);
             tCtx.fill();
        }

        return this.ctx.createPattern(tempCanvas, 'repeat');
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // --- AUTONAPRAWA UI ---
        // Jeśli brakuje elementów HTML (menu, listy), tworzymy je dynamicznie
        this.ensureUI();

        if (typeof InputHandler !== 'undefined') {
            this.inputHandler = new InputHandler(this);
        }

        const safePos = this.world.findSafeSpawnPosition();
        this.state.player.x = safePos.x;
        this.state.player.y = safePos.y;

        this.camera.x = safePos.x;
        this.camera.y = safePos.y;
        
        const menu = document.getElementById('context-menu');
        if (menu) {
            menu.addEventListener('click', (e) => {
                const text = e.target.innerText;
                
                let result = "none";
                if (text.includes("Zbadaj")) {
                    console.log("Badanie...");
                } else if (text.includes("Podnieś")) {
                    result = this.state.player.interact(this.world, 'pickup');
                } else if (text.includes("Pij")) {
                    result = this.state.player.interact(this.world, 'drink');
                }
                
                // Jeśli przedmiot podniesiono, natychmiast odśwież UI
                if (result === "picked_up") {
                    this.toggleInventory(true); 
                }
                
                this.hideContextMenu();
            });
        }

        this.updateUI(); 
        this.gameLoop();
    }

    ensureUI() {
        // Sprawdź czy istnieje side-menu
        let sideMenu = document.getElementById('side-menu');
        if (!sideMenu) {
            sideMenu = document.createElement('div');
            sideMenu.id = 'side-menu';
            sideMenu.className = 'hidden'; // Domyślnie ukryte, CSS obsłuży styl
            // Podstawowe style inline na wypadek braku CSS
            sideMenu.style.position = 'absolute';
            sideMenu.style.top = '10px';
            sideMenu.style.right = '10px';
            sideMenu.style.width = '250px';
            sideMenu.style.backgroundColor = 'rgba(0,0,0,0.8)';
            sideMenu.style.color = '#fff';
            sideMenu.style.padding = '15px';
            sideMenu.style.borderRadius = '8px';
            sideMenu.style.zIndex = '100';
            
            sideMenu.innerHTML = `
                <h3 style="margin-top:0; border-bottom:1px solid #555; padding-bottom:5px;">Ekwipunek</h3>
                <ul id="inventory-list" style="list-style:none; padding:0; margin:0;"></ul>
            `;
            document.body.appendChild(sideMenu);
        } else {
            // Upewnij się że lista istnieje wewnątrz
            if (!document.getElementById('inventory-list')) {
                const ul = document.createElement('ul');
                ul.id = 'inventory-list';
                sideMenu.appendChild(ul);
            }
        }
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // --- UI ---
    
    toggleInventory(forceState=null) {
         const el = document.getElementById('side-menu');
         if (!el) return;
         
         const newState = forceState !== null ? forceState : !this.state.ui.inventoryOpen;
         this.state.ui.inventoryOpen = newState;
         
         if (newState) {
             el.classList.remove('hidden');
             el.style.display = 'block'; // Force display override
             
             const list = document.getElementById('inventory-list'); 
             if (list) {
                 const inv = this.state.player.inventory;
                 if (inv.length === 0) {
                     list.innerHTML = '<li style="color:#aaa; font-style:italic;">Pusto...</li>';
                 } else {
                     list.innerHTML = inv.map(i => `<li style="padding:4px 0; border-bottom:1px solid #444;">${i.type} <span style="float:right; color:#ccc;">${i.weight}kg</span></li>`).join('');
                 }
                 list.innerHTML += `<li style="margin-top:10px; border-top:1px solid #ccc; padding-top:5px;"><strong>Waga: ${this.state.player.currentLoad.toFixed(1)} / ${this.state.player.maxLoad} kg</strong></li>`;
             }
             this.hideContextMenu();
         } else {
             el.classList.add('hidden');
             el.style.display = 'none';
         }
    }

    showContextMenu(sx, sy) {
        const menu = document.getElementById('context-menu');
        if (!menu) return;
        
        const worldPos = this.screenToWorld(sx, sy);
        const obj = this.world.getObjectAtWorldPos(worldPos.x, worldPos.y);
        const items = menu.querySelectorAll('.context-item');
        
        items.forEach(i => i.style.display = 'none');
        
        items[0].style.display = 'block';
        items[0].innerText = obj ? `👁️ Zbadaj: ${obj.type}` : "👁️ Zbadaj teren";

        const actionItem = items[1];
        
        if (obj) {
            if (obj.collectible) {
                actionItem.style.display = 'block';
                actionItem.innerText = "✋ Podnieś";
                this.state.ui.interactTarget = obj;
            }
        } else {
            const moveInfo = this.world.getMovementInfo(worldPos.x, worldPos.y);
             actionItem.style.display = 'block';
             actionItem.innerText = "💧 Pij / Nabierz";
        }

        let px = sx + 10, py = sy + 10;
        if (px + 150 > this.canvas.width) px = sx - 160;
        if (py + 120 > this.canvas.height) py = sy - 130;
        
        menu.style.left = `${px}px`; 
        menu.style.top = `${py}px`;
        menu.classList.remove('hidden');
        this.state.ui.contextMenuOpen = true;
        this.state.navigation.target = null;
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.classList.add('hidden');
        this.state.ui.contextMenuOpen = false;
        this.state.ui.interactTarget = null;
    }

    setNavigation(sx, sy, type) {
        if (this.state.ui.contextMenuOpen) return;
        
        const targetPos = this.screenToWorld(sx, sy);
        const p = this.state.player;

        const path = this.pathfinder.findPath(p.x, p.y, targetPos.x, targetPos.y);

        this.state.navigation.target = targetPos;
        this.state.navigation.type = type;
        
        this.state.navigation.path = path || [];
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

    // --- Logic ---

    update() {
        const now = Date.now();
        const dt = now - this.lastTime; 
        this.lastTime = now;

        const p = this.state.player;
        const nav = this.state.navigation;
        let mx = 0, my = 0, isMoving = false, isRunning = false;

        if (!this.state.ui.inventoryOpen) {
            if (this.state.input.active) {
                nav.target = null; 
                nav.path = [];
                
                const cos = Math.cos(this.camera.rotation), sin = Math.sin(this.camera.rotation);
                mx = this.state.input.x * cos - (-this.state.input.y) * sin;
                my = this.state.input.x * sin + (-this.state.input.y) * cos;
                
                if (Math.hypot(mx, my) > 0.01) {
                    p.rotation = Math.atan2(my, mx);
                    isMoving = true;
                    if (Math.hypot(this.state.input.x, this.state.input.y) > 0.8) isRunning = true;
                }
            } 
            else if (nav.target) {
                let targetX, targetY;

                if (nav.path.length > 0) {
                    targetX = nav.path[0].x;
                    targetY = nav.path[0].y;
                    
                    if (Math.hypot(targetX - p.x, targetY - p.y) < 20) {
                        nav.path.shift();
                        if (nav.path.length === 0) {
                            targetX = nav.target.x;
                            targetY = nav.target.y;
                        }
                    }
                } else {
                    targetX = nav.target.x;
                    targetY = nav.target.y;
                }

                const dx = targetX - p.x, dy = targetY - p.y;
                const dist = Math.hypot(dx, dy);
                
                if (dist > 10) { 
                    p.rotation = Math.atan2(dy, dx);
                    mx = Math.cos(p.rotation); 
                    my = Math.sin(p.rotation);
                    isMoving = true;
                    if (nav.type === 'run') isRunning = true;
                } else {
                    if (nav.path.length === 0) {
                        nav.target = null;
                    }
                }
            }
        }

        let currentSpeed = p.stats.baseSpeed;
        if (p.vitals.stamina <= 0) isRunning = false;
        if (isRunning) currentSpeed *= p.stats.runMultiplier;
        
        const loadRatio = p.currentLoad / p.maxLoad;
        if (loadRatio > 1.0) currentSpeed = 0; 
        else currentSpeed *= (1.0 - loadRatio * 0.8); 

        if (!isMoving) currentSpeed = 0;

        const terrainInfo = this.world.getMovementInfo(p.x, p.y);
        currentSpeed *= terrainInfo.speedFactor; 

        let actualDistanceMoved = 0;
        if (isMoving && currentSpeed > 0) {
            const nextX = p.x + mx * currentSpeed;
            const nextY = p.y + my * currentSpeed;
            
            if (!this.world.checkCollision(nextX, nextY)) {
                p.x = nextX;
                p.y = nextY;
                actualDistanceMoved = Math.hypot(mx * currentSpeed, my * currentSpeed);
            } else {
                if (!this.world.checkCollision(nextX, p.y)) {
                    p.x = nextX;
                    actualDistanceMoved = Math.abs(mx * currentSpeed);
                } else if (!this.world.checkCollision(p.x, nextY)) {
                    p.y = nextY;
                    actualDistanceMoved = Math.abs(my * currentSpeed);
                }
            }
        }

        p.update(dt, isMoving, isRunning, actualDistanceMoved);
        
        this.camera.x += (p.x - this.camera.x) * 0.1;
        this.camera.y += (p.y - this.camera.y) * 0.1;

        if (now % 10 < 1) this.updateUI();
    }

    updateUI() {
        const p = this.state.player, v = p.vitals;
        const posInfo = document.getElementById('pos-info');
        if (posInfo) posInfo.innerText = `${(p.x/100).toFixed(1)}m, ${(p.y/100).toFixed(1)}m | Waga: ${p.currentLoad.toFixed(1)}kg`;
        
        const setWidth = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.style.width = `${Math.max(0, Math.min(100, val))}%`;
        };
        
        setWidth('bar-health', v.health);
        setWidth('bar-stamina', v.stamina);
        setWidth('bar-hunger', v.hunger);
        setWidth('bar-thirst', v.thirst);
    }

    // --- RENDERER ---

    draw() {
        const { ctx, canvas, camera, state, world } = this;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        
        const camX = Math.floor(camera.x);
        const camY = Math.floor(camera.y);
        const halfW = Math.floor(canvas.width / 2);
        const halfH = Math.floor(canvas.height / 2);

        ctx.translate(halfW, halfH);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.rotate(-camera.rotation);
        ctx.translate(-camX, -camY);

        const chunkSizePx = 1600;
        const camChunkX = Math.floor(camX / chunkSizePx);
        const camChunkY = Math.floor(camY / chunkSizePx);
        const range = 1; 
        const visibleChunks = [];
        
        for(let cx = camChunkX - range; cx <= camChunkX + range; cx++) {
            for(let cy = camChunkY - range; cy <= camChunkY + range; cy++) {
                visibleChunks.push(world.getChunk(cx, cy));
            }
        }

        // 1. Terrain
        for (const chunk of visibleChunks) this.drawChunkTerrain(ctx, chunk);
        
        // 2. Target Marker
        this.drawTargetMarker(ctx);

        // 3. Prepare Render Lists
        const groundList = [];
        const renderList = [];
        const tileSize = world.tileSize;
        const chunkSize = world.chunkSize;

        for (const chunk of visibleChunks) {
             const chunkPxX = chunk.cx * chunkSize * tileSize;
             const chunkPxY = chunk.cy * chunkSize * tileSize;

             for(let obj of chunk.objects) {
                 const px = chunkPxX + obj.x * tileSize;
                 const py = chunkPxY + obj.y * tileSize;

                 // Separate ground objects (decorations, non-solid rocks) from solid objects (trees, big rocks)
                 if (!obj.isSolid) {
                     groundList.push({ obj: obj, px: px, py: py });
                 } else {
                     renderList.push({ type: 'object', y: py, obj: obj, px: px, py: py });
                 }
             }
        }

        renderList.push({ type: 'player', y: state.player.y, player: state.player });

        // Sort renderList by Y
        renderList.sort((a, b) => a.y - b.y);

        // Draw Ground Objects (always below player/solids)
        for (const item of groundList) {
            this.drawObjectBase(ctx, item.obj, item.px, item.py);
        }

        // Draw Sorted Objects & Player
        for (const item of renderList) {
            if (item.type === 'object') {
                this.drawObjectBase(ctx, item.obj, item.px, item.py);
            } else if (item.type === 'player') {
                this.drawCharacter(ctx, item.player);
            }
        }

        // 4. Object Tops
        for (const chunk of visibleChunks) this.drawChunkObjectsTop(ctx, chunk);

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

                ctx.fillStyle = tile.baseColor;
                ctx.fillRect(px, py, tileSize+1, tileSize+1); 

                if (tile.colorVar) {
                    if (tile.colorVar > 0) {
                        ctx.fillStyle = `rgba(255, 255, 255, ${tile.colorVar * 0.15})`;
                    } else {
                        ctx.fillStyle = `rgba(0, 0, 0, ${Math.abs(tile.colorVar) * 0.15})`;
                    }
                    ctx.fillRect(px, py, tileSize+1, tileSize+1);
                }

                if (tile.grassData) {
                    ctx.save();
                    ctx.translate(px, py);
                    ctx.fillStyle = this.grassPattern;
                    ctx.globalAlpha = 0.4;
                    ctx.fillRect(0, 0, tileSize, tileSize);
                    ctx.restore();
                }
            }
        }
    }

    drawChunkObjectsBottom(ctx, chunk) {
        const tileSize = 100;
        const chunkPxX = chunk.cx * 16 * tileSize;
        const chunkPxY = chunk.cy * 16 * tileSize;
        
        for(let obj of chunk.objects) {
            const px = chunkPxX + obj.x * tileSize;
            const py = chunkPxY + obj.y * tileSize;
            this.drawObjectBase(ctx, obj, px, py);
        }
    }

    drawChunkObjectsTop(ctx, chunk) {
        const tileSize = 100;
        const chunkPxX = chunk.cx * 16 * tileSize;
        const chunkPxY = chunk.cy * 16 * tileSize;

        for(let obj of chunk.objects) {
            if (obj.type === 'tree') {
                const px = chunkPxX + obj.x * tileSize;
                const py = chunkPxY + obj.y * tileSize;
                this.drawObjectTop(ctx, obj, px, py);
            }
        }
    }

    drawObjectBase(ctx, obj, x, y) {
        if (obj.type === 'tree' && obj.renderData) {
            const rd = obj.renderData;
            ctx.save();
            ctx.translate(x, y);

            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.ellipse(0, 0, rd.trunkRadius + 5, (rd.trunkRadius + 5)*0.5, 0, 0, Math.PI*2);
            ctx.fill();

            ctx.fillStyle = rd.barkColor || '#3E2723'; 
            ctx.beginPath();
            ctx.arc(0, 0, rd.trunkRadius, 0, Math.PI*2);
            ctx.fill();
            
            ctx.fillStyle = rd.woodColor || '#D7CCC8';
            ctx.beginPath();
            ctx.arc(0, 0, rd.trunkRadius * 0.8, 0, Math.PI*2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();

        } else if (obj.type === 'rock') {
            this.drawRock(ctx, obj, x, y);
        } else if (obj.type === 'decoration') {
            this.drawDecoration(ctx, obj, x, y);
        }
    }

    drawRock(ctx, obj, x, y) {
        const rd = obj.renderData;
        ctx.save();
        ctx.translate(x, y);

        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(5, 5, rd.radius, rd.radius * 0.7, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = rd.color;
        ctx.beginPath();
        if (rd.points && rd.points.length > 0) {
            ctx.moveTo(rd.points[0].x, rd.points[0].y);
            for(let i=1; i<rd.points.length; i++) {
                ctx.lineTo(rd.points[i].x, rd.points[i].y);
            }
        } else {
            ctx.arc(0, 0, rd.radius, 0, Math.PI*2);
        }
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (rd.cracks) {
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1;
            for(let crack of rd.cracks) {
                ctx.beginPath();
                ctx.moveTo(crack.ax, crack.ay);
                ctx.lineTo(crack.bx, crack.by);
                ctx.stroke();
            }
        }

        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.arc(-rd.radius*0.3, -rd.radius*0.2, rd.radius*0.15, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.arc(rd.radius*0.3, -rd.radius*0.3, rd.radius*0.1, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
    }

    drawDecoration(ctx, obj, x, y) {
        const rd = obj.renderData;
        ctx.save();
        ctx.translate(x, y);

        if (obj.subType === 'flower') {
            ctx.strokeStyle = '#2d5a27';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 10); ctx.stroke();
            
            ctx.fillStyle = rd.color;
            for(let i=0; i<rd.petalCount; i++) {
                const angle = (i/rd.petalCount) * Math.PI*2;
                const px = Math.cos(angle) * 5;
                const py = Math.sin(angle) * 5;
                ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2); ctx.fill();
            }
            ctx.fillStyle = '#fffa65';
            ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI*2); ctx.fill();

        } else if (obj.subType === 'pebble') {
            ctx.fillStyle = rd.color;
            ctx.beginPath();
            ctx.arc(0, 0, rd.r, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth=1; ctx.stroke();

        } else if (obj.subType === 'bush') {
            ctx.fillStyle = rd.color;
            ctx.beginPath(); ctx.arc(0, 0, rd.size * 0.6, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(-5, 5, rd.size * 0.4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(5, 5, rd.size * 0.4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, -5, rd.size * 0.5, 0, Math.PI*2); ctx.fill();

        } else if (obj.subType === 'weed') {
            ctx.strokeStyle = '#4a6b51';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0,0); ctx.quadraticCurveTo(5, -10, 8, -5);
            ctx.moveTo(0,0); ctx.quadraticCurveTo(-5, -8, -6, -2);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawObjectTop(ctx, obj, x, y) {
        if (!obj.renderData) return;
        const rd = obj.renderData;
        const cd = rd.crownData;
        
        const p = this.state.player;
        const dist = Math.hypot(x - p.x, y - p.y);
        const fadeDistance = 500;
        
        let alpha = 1.0;
        
        if (dist < fadeDistance) {
            alpha = 0.2 + (dist / fadeDistance) * 0.8;
        }

        let targetCtx = ctx;
        let useHelper = (alpha < 0.98);

        if (useHelper) {
            const hCtx = this.helperCtx;
            const size = this.helperCanvas.width;
            const half = size / 2;
            
            hCtx.clearRect(0, 0, size, size);
            hCtx.save();
            hCtx.translate(half, half);
            
            targetCtx = hCtx; 
            targetCtx.globalAlpha = 1.0; 
        } else {
            ctx.save();
            ctx.translate(x, y);
            targetCtx.globalAlpha = alpha;
        }

        if (rd.type === 'pine') {
            if (cd.layers) {
                for (let layer of cd.layers) {
                    targetCtx.fillStyle = layer.color;
                    targetCtx.beginPath();
                    
                    const step = (Math.PI * 2) / layer.points;
                    for (let i = 0; i < layer.points; i++) {
                        const ang = i * step + layer.angleOffset;
                        const rx = Math.cos(ang) * layer.radius;
                        const ry = Math.sin(ang) * layer.radius;
                        targetCtx.lineTo(rx, ry);
                        
                        const angIn = ang + step * 0.5;
                        const rxIn = Math.cos(angIn) * (layer.radius * 0.4); 
                        const ryIn = Math.sin(angIn) * (layer.radius * 0.4);
                        targetCtx.lineTo(rxIn, ryIn);
                    }
                    targetCtx.closePath();
                    targetCtx.fill();
                    
                    targetCtx.strokeStyle = 'rgba(0,0,0,0.1)';
                    targetCtx.lineWidth = 1;
                    targetCtx.stroke();
                }
            }
        } else {
            if (cd.blobs) {
                for(let blob of cd.blobs) {
                    targetCtx.fillStyle = blob.color;
                    targetCtx.beginPath();
                    targetCtx.arc(blob.x, blob.y, blob.r, 0, Math.PI*2);
                    targetCtx.fill();
                }
            }
        }

        if (useHelper) {
            this.helperCtx.restore(); 
            ctx.save();
            ctx.globalAlpha = alpha;
            const half = this.helperCanvas.width / 2;
            ctx.drawImage(this.helperCanvas, x - half, y - half);
            ctx.restore();
        } else {
            ctx.restore();
        }
    }

    drawTargetMarker(ctx) {
        if (!this.state.navigation.target) return;
        const t = this.state.navigation.target;
        
        ctx.save();
        ctx.translate(t.x, t.y);
        
        ctx.fillStyle = this.state.navigation.type === 'run' ? '#ff4757' : '#ffa502';
        ctx.globalAlpha = 0.6;
        
        const scale = 1 + Math.sin(Date.now() * 0.01) * 0.2;
        ctx.scale(scale, scale);
        
        ctx.beginPath(); 
        ctx.arc(0, 0, 5, 0, Math.PI*2); 
        ctx.fill();
        
        ctx.restore();
    }

    drawCharacter(ctx, p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation + Math.PI / 2); 
        
        const baseScale = 1.3; 
        const breathScale = (1.0 + Math.sin(Date.now() * 0.003) * 0.02) * baseScale;
        ctx.scale(breathScale, breathScale);
        
        const { rightLegOffset, leftLegOffset, rightArmOffset, leftArmOffset } = p.anim;
        
        ctx.lineWidth = 2; 
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; 
        
        const skinColor = '#d4a373';
        const hairColor = '#3e2723';

        // Ręce
        ctx.fillStyle = skinColor;
        this.drawLimb(ctx, -18, -2 + leftArmOffset, 6);
        this.drawLimb(ctx, 18, -2 + rightArmOffset, 6);
        
        // Nogi
        this.drawLimb(ctx, -10, 6 + leftLegOffset, 7);
        this.drawLimb(ctx, 10, 6 + rightLegOffset, 7);
        
        // Tułów
        ctx.fillStyle = '#8d5524'; 
        ctx.beginPath(); 
        ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI*2); 
        ctx.fill(); 
        ctx.stroke();
        
        // Głowa
        ctx.fillStyle = skinColor;
        ctx.beginPath(); 
        ctx.arc(0, 0, 10, 0, Math.PI*2); 
        ctx.fill(); 
        ctx.stroke();
        
        // Włosy
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