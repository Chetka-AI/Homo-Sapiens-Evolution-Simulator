/**
 * TreeGenerator.js
 * Generuje dane dla WIELKICH drzew z koroną (Overhead) i pniem (Ground).
 * - Dęby: 2-8m korona, pnie 20-100cm. Chmury liści.
 * - Sosny: Warstwowe trójkąty.
 */

class TreeGenerator {
    constructor() {
        this.configs = {
            'pine': {
                trunkColor: '#3e2723',
                // Iglaste: Korona to stos trójkątów
                layerCountMin: 4,
                layerCountMax: 7,
                baseRadius: 200, // 2m szerokości u podstawy korony
                topRadius: 50,
                layerHeight: 60, // Odstęp między piętrami
                colors: ['#2d6a4f', '#1b4332', '#40916c'] // Różne odcienie zieleni
            },
            'oak': {
                trunkColor: '#4e342e',
                // Liściaste: Korona to wielkie bloby
                blobCount: 15,
                crownRadiusMin: 200, // min 2m
                crownRadiusMax: 600, // max 6m (do 8m z losowością)
                branchCount: 8,
                colors: ['#588157', '#3a5a40', '#a3b18a'] // Odcienie dębu
            },
            'birch': {
                trunkColor: '#d7ccc8',
                blobCount: 12,
                crownRadiusMin: 180,
                crownRadiusMax: 400,
                branchCount: 6,
                colors: ['#a3b18a', '#dad7cd', '#8f9e83']
            }
        };
    }
    
    generate(type, seedX, seedY) {
        const config = this.configs[type] || this.configs['oak'];
        const rng = (offset) => Math.abs(Math.sin(seedX * 12.9898 + seedY * 78.233 + offset) * 43758.5453) % 1;
        
        // Średnica pnia (20cm - 80cm) -> 20px - 80px
        const trunkRadius = 15 + rng(1) * 25;
        
        const treeData = {
            type: type, // 'pine' lub 'oak'/'birch'
            trunkColor: config.trunkColor,
            trunkRadius: trunkRadius,
            crownData: {}
        };
        
        if (type === 'pine') {
            // Generowanie Iglastego (Warstwy trójkątów)
            const layers = [];
            const count = Math.floor(config.layerCountMin + rng(2) * (config.layerCountMax - config.layerCountMin));
            
            for (let i = 0; i < count; i++) {
                const progress = i / count; // 0 (dół) do 1 (góra)
                // Promień maleje ku górze
                const r = config.baseRadius * (1 - progress * 0.8) + rng(i + 10) * 40;
                
                layers.push({
                    radius: r,
                    offsetY: -i * config.layerHeight, // Wyższe piętra są przesunięte w renderze (choć to top-down)
                    points: 12 + Math.floor(rng(i) * 5), // Ilość wierzchołków gwiazdy
                    color: config.colors[Math.floor(rng(i + 50) * config.colors.length)],
                    angleOffset: rng(i + 99) // Obrót warstwy
                });
            }
            treeData.crownData.layers = layers;
            
        } else {
            // Generowanie Liściastego (Bloby i Gałęzie)
            const crownRadius = config.crownRadiusMin + rng(3) * (config.crownRadiusMax - config.crownRadiusMin);
            
            // Gałęzie (Promienie)
            const branches = [];
            for (let i = 0; i < config.branchCount; i++) {
                const angle = (i / config.branchCount) * Math.PI * 2 + (rng(i) * 0.5);
                const len = crownRadius * 0.6 + rng(i + 10) * (crownRadius * 0.4);
                branches.push({
                    angle: angle,
                    length: len,
                    width: trunkRadius * 0.5 * (1 - len / crownRadius) // Zwężają się
                });
            }
            
            // Bloby (Plamy liści)
            const blobs = [];
            for (let i = 0; i < config.blobCount; i++) {
                const angle = rng(i + 50) * Math.PI * 2;
                const dist = rng(i + 100) * crownRadius * 0.8; // Rozrzut wewnątrz korony
                const r = 60 + rng(i + 200) * 100; // Wielkie plamy (60px - 160px)
                
                blobs.push({
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist,
                    r: r,
                    color: config.colors[Math.floor(rng(i + 90) * config.colors.length)]
                });
            }
            
            treeData.crownData.radius = crownRadius;
            treeData.crownData.branches = branches;
            treeData.crownData.blobs = blobs;
        }
        
        return treeData;
    }
}