/**
 * World.js
 * Zarządzanie generowaniem świata, kolizjami i obiektami.
 * ZMIANY:
 * - Naprawiono wywołanie `createTree` (dodano brakujące cx, cy).
 * - Upewniono się, że każdy obiekt ma poprawnie obliczone `worldX` i `worldY`.
 * - Metoda `removeObject` jest odporna na błędy referencji.
 */

class SimpleNoise {
    constructor(seed = Math.random()) {
        this.perm = new Uint8Array(512);
        this.grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
                      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
                      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
        this.seed(seed);
    }

    seed(seed) {
        const random = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 0; i < 256; i++) {
            const r = Math.floor(random() * 256);
            const temp = p[i]; p[i] = p[r]; p[r] = temp;
        }
        for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    dot(g, x, y) { return g[0]*x + g[1]*y; }
    mix(a, b, t) { return (1-t)*a + t*b; }
    fade(t) { return t*t*t*(t*(t*6-15)+10); }

    get(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = this.fade(x);
        const v = this.fade(y);
        const A = this.perm[X]+Y, AA = this.perm[A], AB = this.perm[A+1],
              B = this.perm[X+1]+Y, BA = this.perm[B], BB = this.perm[B+1];

        return this.mix(
            this.mix(this.dot(this.grad3[AA % 12], x, y), this.dot(this.grad3[BA % 12], x-1, y), u),
            this.mix(this.dot(this.grad3[AB % 12], x, y-1), this.dot(this.grad3[BB % 12], x-1, y-1), u),
            v
        );
    }
}

class WorldManager {
    constructor() {
        this.chunks = {}; 
        this.chunkSize = 16; 
        this.tileSize = 100; 
        
        if (typeof TreeGenerator !== 'undefined') {
            this.treeGen = new TreeGenerator();
        }
        
        const masterSeed = Math.random() * 10000;
        
        this.elevationNoise = new SimpleNoise(masterSeed);
        this.moistureNoise = new SimpleNoise(masterSeed + 123);
        this.riverNoise = new SimpleNoise(masterSeed + 456);
        this.detailNoise = new SimpleNoise(masterSeed + 789);
        this.warpNoise = new SimpleNoise(masterSeed + 999);
        this.textureNoise = new SimpleNoise(masterSeed + 555);
    }

    getChunk(cx, cy) {
        const key = `${cx},${cy}`;
        if (this.chunks[key]) return this.chunks[key];
        const chunk = this.generateChunk(cx, cy);
        this.chunks[key] = chunk;
        return chunk;
    }

    removeObject(obj) {
        // Obliczamy w którym chunku powinien być obiekt
        const cx = Math.floor(obj.worldX / (this.chunkSize * this.tileSize));
        const cy = Math.floor(obj.worldY / (this.chunkSize * this.tileSize));
        
        const chunk = this.getChunk(cx, cy);
        if (chunk) {
            // Próba 1: Szukanie po referencji
            let index = chunk.objects.indexOf(obj);
            
            // Próba 2: Szukanie po koordynatach (fallback)
            if (index === -1) {
                index = chunk.objects.findIndex(o => 
                    Math.abs(o.worldX - obj.worldX) < 1 && 
                    Math.abs(o.worldY - obj.worldY) < 1 &&
                    o.type === obj.type
                );
            }

            if (index > -1) {
                chunk.objects.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    findSafeSpawnPosition() {
        let radius = 0;
        let angle = 0;
        for(let i=0; i<10000; i++) {
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            const cx = Math.floor(x / (this.chunkSize * this.tileSize));
            const cy = Math.floor(y / (this.chunkSize * this.tileSize));
            const chunk = this.getChunk(cx, cy);
            
            if (chunk) {
                let lx = Math.floor((x - cx * this.chunkSize * this.tileSize) / this.tileSize);
                let ly = Math.floor((y - cy * this.chunkSize * this.tileSize) / this.tileSize);
                
                if (lx >= 0 && lx < 16 && ly >= 0 && ly < 16) {
                    const tile = chunk.tiles[lx][ly];
                    // Odrzucamy każdą wodę
                    if (!tile.type.includes('water') && tile.type !== 'river') {
                        if (!this.checkCollision(x, y, true)) { 
                            return { x, y };
                        }
                    }
                }
            }
            angle += 0.5;
            radius += 10; 
        }
        return { x: 0, y: 0 }; 
    }

    generateChunk(cx, cy) {
        const chunk = {
            cx: cx,
            cy: cy,
            tiles: [],
            objects: []
        };

        const scale = 0.012;  
        const riverScale = 0.008; 

        for (let x = 0; x < this.chunkSize; x++) {
            chunk.tiles[x] = [];
            for (let y = 0; y < this.chunkSize; y++) {
                const globalX = cx * this.chunkSize + x;
                const globalY = cy * this.chunkSize + y;

                const warpScale = 0.02;
                const warpStrength = 15.0; 
                const wx = this.warpNoise.get(globalX * warpScale, globalY * warpScale) * warpStrength;
                const wy = this.warpNoise.get((globalX + 1000) * warpScale, (globalY + 1000) * warpScale) * warpStrength;

                const elevation = this.elevationNoise.get((globalX + wx) * scale, (globalY + wy) * scale);
                const moisture = this.moistureNoise.get((globalX - wy) * scale, (globalY + wx) * scale);
                const riverVal = this.riverNoise.get(globalX * riverScale, globalY * riverScale);
                const detail = this.detailNoise.get(globalX * 0.05, globalY * 0.05);

                const texVar = this.textureNoise.get(globalX * 0.15, globalY * 0.15);
                const dither = (Math.random() - 0.5) * 0.15; 

                let tileType = 'grass';
                let baseColor = '#567d46';
                let hasGrass = false;
                let allowObjects = true;
                let isRockyTerrain = false;

                if (elevation < -0.4 + dither * 0.5) {
                    tileType = 'deep_water';
                    baseColor = '#1e3b70';
                    allowObjects = false;
                } else if (elevation < -0.1 + dither) {
                    tileType = 'water';
                    baseColor = '#4169e1';
                    allowObjects = false;
                } else if (elevation < -0.05 + dither) {
                    tileType = 'shallow_water';
                    baseColor = '#87cefa';
                    allowObjects = true; 
                } else {
                    if (Math.abs(riverVal) < 0.022 + (dither * 0.01)) {
                         tileType = 'river';
                         baseColor = '#5DADE2';
                         allowObjects = false;
                    } 
                    else if (elevation < 0.08 + dither) {
                        tileType = 'sand';
                        baseColor = '#e6c288';
                        allowObjects = false;
                    } 
                    else {
                        if (moisture < -0.5 + dither) {
                            tileType = 'desert';
                            baseColor = '#edc9af';
                            hasGrass = false;
                        } else if (moisture < 0.2 + dither) {
                            tileType = 'plains';
                            baseColor = '#779e5a'; 
                            hasGrass = true;
                        } else {
                            tileType = 'forest';
                            baseColor = '#2d5a27'; 
                            hasGrass = true;
                        }

                        if (elevation > 0.6 || (detail > 0.5 && moisture < 0)) {
                            isRockyTerrain = true;
                            if (Math.random() < 0.3) baseColor = '#6d7568';
                        }
                    }
                }

                chunk.tiles[x][y] = {
                    type: tileType,
                    baseColor: baseColor,
                    colorVar: texVar,
                    grassData: hasGrass ? true : null
                };

                if (allowObjects) {
                    const rnd = Math.random();

                    // DRZEWA
                    if (hasGrass && tileType !== 'shallow_water') {
                        let treeChance = tileType === 'forest' ? 0.35 : 0.05;
                        if (isRockyTerrain) treeChance *= 0.2; 
                        
                        if (detail > 0.1 && rnd < treeChance) {
                            let treeType = 'oak';
                            if (tileType === 'forest') treeType = Math.random() < 0.6 ? 'pine' : 'oak';
                            if (tileType === 'plains') treeType = Math.random() < 0.5 ? 'birch' : 'oak';
                            
                            // NAPRAWIONO: Dodano przekazywanie cx, cy
                            chunk.objects.push(this.createTree(x, y, treeType, globalX, globalY, cx, cy));
                        }
                    }

                    // SKAŁY
                    if (isRockyTerrain && rnd < 0.08) {
                         chunk.objects.push(this.createRock(x, y, true, cx, cy)); 
                    }
                    else if (tileType !== 'river' && rnd < 0.01) {
                         chunk.objects.push(this.createRock(x, y, false, cx, cy)); 
                    }

                    // DEKORACJE
                    let pebbleChance = 0.05;
                    if (tileType === 'desert' || isRockyTerrain) pebbleChance = 0.3;
                    if (tileType === 'shallow_water') pebbleChance = 0.2;

                    if (Math.random() < pebbleChance) {
                        chunk.objects.push(this.createDecoration(x, y, 'pebble', tileType, cx, cy));
                    }

                    if (hasGrass && tileType !== 'shallow_water') {
                        if (tileType === 'plains' && Math.random() < 0.15) {
                            chunk.objects.push(this.createDecoration(x, y, 'flower', tileType, cx, cy));
                        }
                        if (Math.random() < 0.08) {
                            chunk.objects.push(this.createDecoration(x, y, 'bush', tileType, cx, cy));
                        }
                        if (Math.random() < 0.2) {
                             chunk.objects.push(this.createDecoration(x, y, 'weed', tileType, cx, cy));
                        }
                    }
                }
            }
        }

        chunk.objects.sort((a, b) => a.y - b.y);
        return chunk;
    }

    calcWorldPos(lx, ly, cx, cy) {
        return {
            worldX: (cx * 16 + lx) * 100,
            worldY: (cy * 16 + ly) * 100
        };
    }

    createTree(lx, ly, type, seedX, seedY, cx, cy) {
        const offsetX = (Math.random() - 0.5) * 60; 
        const offsetY = (Math.random() - 0.5) * 60;
        const treeData = this.treeGen ? this.treeGen.generate(type, seedX, seedY) : null;
        const pos = this.calcWorldPos(lx, ly, cx, cy);

        return {
            type: 'tree',
            isSolid: true,
            collectible: false,
            subType: type,
            x: lx + 0.5 + offsetX/100,
            y: ly + 0.5 + offsetY/100,
            worldX: pos.worldX + (0.5 + offsetX/100) * 100,
            worldY: pos.worldY + (0.5 + offsetY/100) * 100,
            radius: 20, 
            renderData: treeData
        };
    }

    createRock(lx, ly, isBig, cx, cy) {
        const offsetX = (Math.random() - 0.5) * 60;
        const offsetY = (Math.random() - 0.5) * 60;
        let radius = isBig ? (40 + Math.random() * 30) : (15 + Math.random() * 15);
        const pos = this.calcWorldPos(lx, ly, cx, cy);

        const points = [];
        const segments = 7 + Math.floor(Math.random() * 5); 
        for(let i=0; i<segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const rVar = radius * (0.8 + Math.random() * 0.4);
            points.push({ x: Math.cos(angle) * rVar, y: Math.sin(angle) * rVar });
        }

        const cracks = [];
        const crackCount = Math.floor(Math.random() * 3);
        for(let i=0; i<crackCount; i++) {
             const angle = Math.random() * Math.PI * 2;
             const len = radius * (0.3 + Math.random() * 0.6);
             cracks.push({
                 ax: Math.cos(angle) * radius * 0.9,
                 ay: Math.sin(angle) * radius * 0.9,
                 bx: Math.cos(angle + Math.PI) * len * 0.2,
                 by: Math.sin(angle + Math.PI) * len * 0.2
             });
        }

        const rockPalettes = [
            ['#7f8c8d', '#95a5a6', '#bdc3c7', '#636e72'],
            ['#2d3436', '#4b4b4b', '#596275', '#303952'],
            ['#a0937d', '#b08d74', '#cdbba7', '#8e7c68', '#d6a889'],
            ['#bcaaa4', '#a1887f', '#d7ccc8', '#8d6e63'],
            ['#7e8a76', '#6b7d6a', '#556b2f', '#778a68']
        ];
        const chosenPalette = rockPalettes[Math.floor(Math.random() * rockPalettes.length)];
        const color = chosenPalette[Math.floor(Math.random() * chosenPalette.length)];

        return {
            type: 'rock',
            isSolid: isBig, 
            collectible: !isBig, 
            weight: isBig ? 100 : 5,
            isBig: isBig,
            x: lx + 0.5 + offsetX/100,
            y: ly + 0.5 + offsetY/100,
            worldX: pos.worldX + (0.5 + offsetX/100) * 100,
            worldY: pos.worldY + (0.5 + offsetY/100) * 100,
            radius: radius, 
            renderData: { points, cracks, color, radius }
        };
    }

    createDecoration(lx, ly, subType, biome, cx, cy) {
        const offsetX = (Math.random() - 0.5) * 80;
        const offsetY = (Math.random() - 0.5) * 80;
        let renderData = {};
        const pos = this.calcWorldPos(lx, ly, cx, cy);
        
        let weight = 0.1;
        let collectible = true;

        if (subType === 'flower') {
            const flowerColors = ['#ff4757', '#ffa502', '#3742fa', '#e84393', '#f1c40f', '#ffffff'];
            renderData.color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
            renderData.petalCount = 4 + Math.floor(Math.random() * 3);
            weight = 0.1;
        } else if (subType === 'pebble') {
            renderData.r = 3 + Math.random() * 4;
            const pebbleColors = ['#7f8c8d', '#95a5a6', '#a0937d', '#556b2f'];
            renderData.color = pebbleColors[Math.floor(Math.random() * pebbleColors.length)];
            weight = 2.0;
        } else if (subType === 'bush') {
            renderData.size = 15 + Math.random() * 10;
            renderData.color = Math.random() > 0.5 ? '#2d6a4f' : '#1b4332';
            weight = 1.0;
        } else if (subType === 'weed') {
            collectible = true;
            weight = 0.2;
        }

        return {
            type: 'decoration',
            subType: subType,
            isSolid: false,
            collectible: collectible,
            weight: weight,
            x: lx + 0.5 + offsetX/100,
            y: ly + 0.5 + offsetY/100,
            worldX: pos.worldX + (0.5 + offsetX/100) * 100,
            worldY: pos.worldY + (0.5 + offsetY/100) * 100,
            renderData: renderData
        };
    }

    getMovementInfo(worldX, worldY) {
        const cx = Math.floor(worldX / (this.chunkSize * this.tileSize));
        const cy = Math.floor(worldY / (this.chunkSize * this.tileSize));
        
        const chunk = this.getChunk(cx, cy);
        if (!chunk) return { allowed: false, speedFactor: 0 };

        let localX = Math.floor((worldX - cx * this.chunkSize * this.tileSize) / this.tileSize);
        let localY = Math.floor((worldY - cy * this.chunkSize * this.tileSize) / this.tileSize);

        if (localX < 0) localX = 0; if (localX >= 16) localX = 15;
        if (localY < 0) localY = 0; if (localY >= 16) localY = 15;

        const tile = chunk.tiles[localX][localY];
        
        if (tile.type === 'deep_water' || tile.type === 'water' || tile.type === 'river') {
            return { allowed: false, speedFactor: 0 };
        }

        let speedFactor = 1.0;
        if (tile.type === 'shallow_water') {
            speedFactor = 0.4; 
        }

        const tileW = this.tileSize;
        const chunkPX = cx * this.chunkSize * tileW;
        const chunkPY = cy * this.chunkSize * tileW;
        const playerRadius = 15; 

        for (let obj of chunk.objects) {
            if (!obj.isSolid) continue;

            const objX = chunkPX + obj.x * tileW;
            const objY = chunkPY + obj.y * tileW;
            const dist = Math.hypot(worldX - objX, worldY - objY);
            
            let collisionRadius = 0;
            if (obj.type === 'rock') collisionRadius = obj.renderData.radius; 
            else if (obj.type === 'tree') collisionRadius = obj.renderData ? obj.renderData.trunkRadius : 25;

            if (dist < (collisionRadius + playerRadius)) {
                return { allowed: false, speedFactor: 0 };
            }
        }

        return { allowed: true, speedFactor: speedFactor };
    }

    checkCollision(worldX, worldY, strict = false) {
        const info = this.getMovementInfo(worldX, worldY);
        return !info.allowed; 
    }

    getObjectAtWorldPos(wx, wy) {
        const cx = Math.floor(wx / (this.chunkSize * this.tileSize));
        const cy = Math.floor(wy / (this.chunkSize * this.tileSize));
        const chunk = this.getChunk(cx, cy);
        
        const tileW = this.tileSize;
        const chunkPX = cx * this.chunkSize * tileW;
        const chunkPY = cy * this.chunkSize * tileW;

        for (let obj of chunk.objects) {
            const ox = chunkPX + obj.x * tileW;
            const oy = chunkPY + obj.y * tileW;
            const dist = Math.hypot(wx - ox, wy - oy);
            
            if (obj.type === 'tree' && dist < 60) return obj;
            if (obj.type === 'rock' && dist < obj.renderData.radius + 10) return obj;
            if (obj.type === 'decoration' && dist < 15) return obj; 
        }
        return null;
    }
}