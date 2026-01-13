/**
 * World.js - v5.1
 */

const WORLD_CONFIG = {
    CHUNK_SIZE: 16,        
    TILE_SIZE: 100,        
    RENDER_DISTANCE: 2,    
    SEED: 12345,           
    SCALE_SOIL: 0.08, // Nieco większe plamy terenu      
    SCALE_MOISTURE: 0.06,  
    SCALE_DENSITY: 0.15     
};

const FLORA_META = {
    'pine': { type: 'tree', genType: 'pine', preferredSoil: ['sand', 'soil_dry'], minMoisture: 0.1, maxMoisture: 0.6 },
    'oak': { type: 'tree', genType: 'oak', preferredSoil: ['soil', 'soil_rich'], minMoisture: 0.4, maxMoisture: 0.9 },
    'birch': { type: 'tree', genType: 'birch', preferredSoil: ['soil', 'soil_rich'], minMoisture: 0.3, maxMoisture: 0.8 },
    'rock': { type: 'rock', preferredSoil: [], minMoisture: 0, maxMoisture: 1 }
};

class SimpleNoise {
    constructor(seed = Math.random()) {
        this.perm = new Uint8Array(512);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        let n = seed * 4294967296; 
        for (let i = 255; i > 0; i--) {
            n = (n * 1664525 + 1013904223) % 4294967296;
            const r = (n >>> 0) % (i + 1);
            [p[i], p[r]] = [p[r], p[i]];
        }
        for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }
    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = this.fade(x);
        const v = this.fade(y);
        const A = this.perm[X] + Y, AA = this.perm[A], AB = this.perm[A + 1];
        const B = this.perm[X + 1] + Y, BA = this.perm[B], BB = this.perm[B + 1];
        return this.lerp(v, this.lerp(u, this.grad(this.perm[AA], x, y), this.grad(this.perm[BA], x - 1, y)),
                       this.lerp(u, this.grad(this.perm[AB], x, y - 1), this.grad(this.perm[BB], x - 1, y - 1)));
    }
}

class TerrainLayer {
    constructor(type, variant = 0) {
        this.type = type;       
        this.variant = variant; 
    }
}

class WorldTile {
    constructor() {
        this.layers = [];
        this.moisture = 0;
        this.soilQuality = 0;
        this.grassData = null;
        this.baseColor = '#000';
    }

    addLayer(type) {
        this.layers.push(new TerrainLayer(type, Math.floor(Math.random() * 4)));
    }

    getTopLayer() {
        if (this.layers.length === 0) return null;
        return this.layers[this.layers.length - 1];
    }
}

class WorldObject {
    constructor(type, x, y, customData = {}) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.type = type; 
        this.subType = customData.subType || 'unknown';
        this.x = x;
        this.y = y;
        this.rotation = Math.random() * Math.PI * 2;
        // Kolizja to teraz fizyczny rozmiar pnia w metrach
        this.collisionRadius = customData.collisionRadius || 0.3; 
        this.renderData = customData.renderData || null; 
    }
}

class Chunk {
    constructor(cx, cy) {
        this.cx = cx;
        this.cy = cy;
        this.key = `${cx},${cy}`;
        this.tiles = []; 
        this.objects = [];
        this.isGenerated = false;
    }

    initGrid() {
        this.tiles = new Array(WORLD_CONFIG.CHUNK_SIZE);
        for(let x=0; x<WORLD_CONFIG.CHUNK_SIZE; x++) {
            this.tiles[x] = new Array(WORLD_CONFIG.CHUNK_SIZE);
            for(let y=0; y<WORLD_CONFIG.CHUNK_SIZE; y++) {
                this.tiles[x][y] = new WorldTile();
            }
        }
    }
}

class WorldManager {
    constructor() {
        this.chunks = new Map();
        this.soilNoise = new SimpleNoise(WORLD_CONFIG.SEED);
        this.moistureNoise = new SimpleNoise(WORLD_CONFIG.SEED + 123);
        this.forestNoise = new SimpleNoise(WORLD_CONFIG.SEED + 456);

        this.treeGen = new TreeGenerator();
        this.grassGen = new GrassGenerator();
    }

    getChunk(cx, cy) {
        const key = `${cx},${cy}`;
        if (!this.chunks.has(key)) {
            const newChunk = new Chunk(cx, cy);
            this.generateChunkProcedural(newChunk);
            this.chunks.set(key, newChunk);
        }
        return this.chunks.get(key);
    }

    generateChunkProcedural(chunk) {
        chunk.initGrid();
        
        const globalX = chunk.cx * WORLD_CONFIG.CHUNK_SIZE;
        const globalY = chunk.cy * WORLD_CONFIG.CHUNK_SIZE;

        for(let x=0; x<WORLD_CONFIG.CHUNK_SIZE; x++) {
            for(let y=0; y<WORLD_CONFIG.CHUNK_SIZE; y++) {
                const wx = globalX + x;
                const wy = globalY + y;

                const nSoil = (this.soilNoise.noise2D(wx * WORLD_CONFIG.SCALE_SOIL, wy * WORLD_CONFIG.SCALE_SOIL) + 1) / 2;
                const nMoist = (this.moistureNoise.noise2D(wx * WORLD_CONFIG.SCALE_MOISTURE, wy * WORLD_CONFIG.SCALE_MOISTURE) + 1) / 2;
                const nDetail = (this.soilNoise.noise2D(wx * 0.9, wy * 0.9) + 1) / 2; 

                const tile = chunk.tiles[x][y];
                tile.moisture = nMoist;
                tile.soilQuality = nSoil;

                tile.addLayer('bedrock');
                let surfaceType = 'soil';

                // Trawa
                const grassData = this.grassGen.generate(nSoil, nMoist, nDetail);
                
                if (grassData) {
                    tile.addLayer('grass');
                    surfaceType = 'grass';
                    tile.grassData = grassData;
                    tile.baseColor = grassData.color; // Używamy koloru z generatora
                } else {
                    if (nSoil < 0.35) {
                        tile.addLayer('sand');
                        surfaceType = 'sand';
                        const val = 200 + nDetail * 40;
                        tile.baseColor = `rgb(${val}, ${val-10}, ${val-60})`;
                    } else {
                        tile.addLayer('soil');
                        surfaceType = 'soil';
                        const val = 100 + nDetail * 30;
                        tile.baseColor = `rgb(${val}, ${val-20}, ${val-50})`;
                    }
                }
                
                // Las
                const nForest = (this.forestNoise.noise2D(wx * WORLD_CONFIG.SCALE_DENSITY, wy * WORLD_CONFIG.SCALE_DENSITY) + 1) / 2;
                if (nForest > 0.6 && Math.random() > 0.8) { 
                    this.tryPlantTree(chunk, x, y, surfaceType, nMoist, wx, wy);
                }
            }
        }

        // Kamienie
        const numRocks = Math.floor(Math.random() * 3);
        for(let i=0; i<numRocks; i++) {
             chunk.objects.push(new WorldObject(
                'rock', 
                Math.random() * WORLD_CONFIG.CHUNK_SIZE, 
                Math.random() * WORLD_CONFIG.CHUNK_SIZE,
                { collisionRadius: 0.2, renderData: { radius: 10 + Math.random()*15, color: '#777' } }
            ));
        }

        chunk.isGenerated = true;
    }

    tryPlantTree(chunk, x, y, soilType, moisture, wx, wy) {
        let effectiveSoil = soilType;
        if (soilType === 'grass' || soilType === 'grass_rich') effectiveSoil = 'soil';

        const candidates = [];
        for (const [key, meta] of Object.entries(FLORA_META)) {
            if (meta.type !== 'tree') continue;
            const soilMatch = meta.preferredSoil.includes(effectiveSoil) || 
                              (effectiveSoil === 'soil' && meta.preferredSoil.includes('soil_rich')) ||
                              (effectiveSoil === 'soil_dry' && meta.preferredSoil.includes('sand')); 

            const moistureMatch = moisture >= meta.minMoisture && moisture <= meta.maxMoisture;

            if (soilMatch && moistureMatch) candidates.push(meta);
        }

        if (candidates.length > 0) {
            const chosen = candidates[Math.floor(Math.random() * candidates.length)];
            // Przesunięcie wewnątrz kafelka
            const ox = x + Math.random() * 0.8 + 0.1;
            const oy = y + Math.random() * 0.8 + 0.1;

            const treeRenderData = this.treeGen.generate(chosen.genType, wx + ox, wy + oy);
            
            // Kolizja to tylko promień pnia (skalowany z px na metry, np. 40px -> 0.4m)
            const collisionR = (treeRenderData.trunkRadius / 100); 

            chunk.objects.push(new WorldObject('tree', ox, oy, {
                subType: chosen.genType,
                collisionRadius: collisionR, 
                renderData: treeRenderData
            }));
        }
    }

    checkCollision(wx, wy) {
        const obj = this.getObjectAtWorldPos(wx, wy, true); // true = tylko kolizyjne
        if (obj) {
            const cx = Math.floor(wx / 100 / WORLD_CONFIG.CHUNK_SIZE);
            const cy = Math.floor(wy / 100 / WORLD_CONFIG.CHUNK_SIZE);
            const lx = (wx / 100) - (cx * WORLD_CONFIG.CHUNK_SIZE);
            const ly = (wy / 100) - (cy * WORLD_CONFIG.CHUNK_SIZE);
            const dist = Math.hypot(obj.x - lx, obj.y - ly);
            if (dist < obj.collisionRadius) return true; 
        }
        return false;
    }

    getObjectAtWorldPos(wx, wy, collisionOnly = false) {
        const cx = Math.floor(wx / 100 / WORLD_CONFIG.CHUNK_SIZE);
        const cy = Math.floor(wy / 100 / WORLD_CONFIG.CHUNK_SIZE);
        const chunk = this.getChunk(cx, cy);
        const lx = (wx / 100) - (cx * WORLD_CONFIG.CHUNK_SIZE);
        const ly = (wy / 100) - (cy * WORLD_CONFIG.CHUNK_SIZE);
        
        for(let obj of chunk.objects) {
            const radius = collisionOnly ? obj.collisionRadius : 0.8; // Większy zasięg dla interakcji
            const dist = Math.hypot(obj.x - lx, obj.y - ly);
            if (dist < radius) return obj;
        }
        return null;
    }

    removeObject(objId) {
        // Musimy przeszukać chunki, ale optymalniej byłoby wiedzieć gdzie jest
        // Na razie brute-force po załadowanych chunkach, albo zakładamy że interakcja jest blisko gracza
        for (const chunk of this.chunks.values()) {
            const idx = chunk.objects.findIndex(o => o.id === objId);
            if (idx !== -1) {
                chunk.objects.splice(idx, 1);
                return true;
            }
        }
        return false;
    }

    spawnLoot(type, wx, wy) {
        const cx = Math.floor(wx / 100 / WORLD_CONFIG.CHUNK_SIZE);
        const cy = Math.floor(wy / 100 / WORLD_CONFIG.CHUNK_SIZE);
        const chunk = this.getChunk(cx, cy);

        const lx = (wx / 100) - (cx * WORLD_CONFIG.CHUNK_SIZE);
        const ly = (wy / 100) - (cy * WORLD_CONFIG.CHUNK_SIZE);

        const loot = new WorldObject('loot', lx, ly, {
            subType: type,
            collisionRadius: 0, // Loot nie blokuje ruchu
            renderData: { type: 'loot', itemType: type, radius: 15, color: '#ffd700' }
        });
        chunk.objects.push(loot);
    }
}