/**
 * TreeGenerator.js
 * Generuje dane dla drzew zoptymalizowanych pod kątem wydajności.
 * ZMIANY:
 * - Przywrócono oryginalną paletę kolorów (ładne zielenie) z przesłanego pliku.
 * - Usunięto kolory "zgniłe" i "brudne".
 * - Zachowano podział na Palety, aby jedno drzewo miało spójny odcień 
 * (nie mieszało jasnego oliwkowego z ciemną zielenią).
 */

class TreeGenerator {
    constructor() {
        this.configs = {
            'pine': {
                // Sosna: Ciemna kora, jasne/żółtawe drewno
                barkColor: '#3E2723',
                woodColor: '#D7CCC8',
                trunkMin: 15,
                trunkMax: 35,
                
                // Iglaste: Korona to stos trójkątów
                layerCountMin: 3,
                layerCountMax: 5,
                baseRadius: 180,
                topRadius: 40,
                layerHeight: 60,
                
                // PALETY OPARTE NA ORYGINALNYM PLIKU (Naturalne Zielenie)
                colorPalettes: [
                    // Paleta 1: Klasyczna sosnowa zieleń (Original Mix)
                    ['#2d6a4f', '#1b4332', '#40916c'],
                    // Paleta 2: Ciemniejszy bór (Deep Forest)
                    ['#1b4332', '#0f261c', '#20402e'],
                    // Paleta 3: Żywa zieleń iglasta
                    ['#2d6a4f', '#3c8c69', '#1f4a37']
                ]
            },
            'oak': {
                // Dąb: Brązowa kora, beżowe drewno
                barkColor: '#4E342E',
                woodColor: '#A1887F',
                trunkMin: 25,
                trunkMax: 50,
                
                // Liściaste: Zwarte "kleksy"
                blobCount: 6,
                crownRadiusMin: 200,
                crownRadiusMax: 350,
                
                // PALETY OPARTE NA ORYGINALNYM PLIKU (Liściaste Zielenie)
                colorPalettes: [
                    // Paleta 1: Głęboka zieleń (Hunter Green)
                    ['#3a5a40', '#2a402d', '#4a6b51'],
                    // Paleta 2: Zieleń szałwiowa (Sage Green)
                    ['#588157', '#4c704b', '#658f64'],
                    // Paleta 3: Oliwkowa (Olive Green) - oddzielona od ciemnej zieleni
                    ['#a3b18a', '#8a9a5b', '#7a8b6e']
                ]
            },
            'birch': {
                // Brzoza: Jasna/Szara kora, bardzo jasne drewno
                barkColor: '#CFD8DC',
                woodColor: '#F5F5F5',
                trunkMin: 15,
                trunkMax: 30,
                
                // Liściaste
                blobCount: 5,
                crownRadiusMin: 180,
                crownRadiusMax: 300,
                
                // PALETY OPARTE NA ORYGINALNYM PLIKU (Jasne Zielenie)
                colorPalettes: [
                    // Paleta 1: Bardzo jasna/blada (Pale)
                    ['#dad7cd', '#c4c1b4', '#b0ad9f'],
                    // Paleta 2: Mchowa zieleń (Moss)
                    ['#8f9e83', '#76856a', '#aebd9d'],
                    // Paleta 3: Oliwkowa jasna (Light Olive)
                    ['#a3b18a', '#8f9e83', '#b5c99a']
                ]
            }
        };
    }
    
    /**
     * Generuje dane pojedynczego drzewa na podstawie typu i nasiona (pozycji)
     */
    generate(type, seedX, seedY) {
        const config = this.configs[type] || this.configs['oak'];
        
        // Deterministyczny generator liczb losowych
        const rng = (offset) => {
            const val = Math.sin(seedX * 12.9898 + seedY * 78.233 + offset) * 43758.5453;
            return val - Math.floor(val);
        };
        
        // --- WYBÓR PALETY KOLORÓW DLA TEGO DRZEWA ---
        // Losujemy deterministycznie jedną paletę z dostępnych dla danego gatunku.
        // Dzięki temu całe drzewo będzie utrzymane w jednej tonacji.
        const palettes = config.colorPalettes;
        const paletteIndex = Math.floor(rng(999) * palettes.length);
        const chosenPalette = palettes[paletteIndex];
        
        // Obliczanie średnicy pnia
        const trunkDiff = config.trunkMax - config.trunkMin;
        const trunkRadius = config.trunkMin + rng(1) * trunkDiff;
        
        const treeData = {
            type: type,
            barkColor: config.barkColor,
            woodColor: config.woodColor,
            trunkRadius: trunkRadius,
            crownData: {}
        };
        
        if (type === 'pine') {
            // --- IGLASTE ---
            const layers = [];
            const count = Math.floor(config.layerCountMin + rng(2) * (config.layerCountMax - config.layerCountMin + 1));
            
            for (let i = 0; i < count; i++) {
                const progress = i / count;
                const r = config.baseRadius * (1 - progress * 0.8) + rng(i + 10) * 30;
                
                layers.push({
                    radius: r,
                    offsetY: -i * config.layerHeight,
                    points: 7 + Math.floor(rng(i) * 3),
                    // Używamy kolorów TYLKO z wybranej palety
                    color: chosenPalette[Math.floor(rng(i + 50) * chosenPalette.length)],
                    angleOffset: rng(i + 99) * Math.PI
                });
            }
            treeData.crownData.layers = layers;
            
        } else {
            // --- LIŚCIASTE ---
            const crownRadius = config.crownRadiusMin + rng(3) * (config.crownRadiusMax - config.crownRadiusMin);
            const blobs = [];
            
            // 1. Główny kleks centralny
            blobs.push({
                x: 0,
                y: 0,
                r: crownRadius * 0.75,
                // Używamy kolorów TYLKO z wybranej palety
                color: chosenPalette[Math.floor(rng(100) * chosenPalette.length)]
            });
            
            // 2. Wianuszek otaczający
            const surroundingCount = config.blobCount;
            for (let i = 0; i < surroundingCount; i++) {
                const baseAngle = (i / surroundingCount) * Math.PI * 2;
                const angleJitter = rng(i + 200) * 0.5;
                const finalAngle = baseAngle + angleJitter;
                const dist = crownRadius * 0.5;
                const r = crownRadius * (0.4 + rng(i + 300) * 0.2);
                
                blobs.push({
                    x: Math.cos(finalAngle) * dist,
                    y: Math.sin(finalAngle) * dist,
                    r: r,
                    // Używamy kolorów TYLKO z wybranej palety
                    color: chosenPalette[Math.floor(rng(i + 150) * chosenPalette.length)]
                });
            }
            
            treeData.crownData.radius = crownRadius;
            treeData.crownData.blobs = blobs;
        }
        
        return treeData;
    }
}