/**
 * GrassGenerator.js
 * Określa parametry kafelka trawy.
 */

class GrassGenerator {
    generate(soilQuality, moisture, noiseVal) {
        let hasGrass = false;
        if (soilQuality > 0.35 && moisture > 0.25) {
            hasGrass = true;
        }
        
        if (!hasGrass) return null;
        
        // Odcień trawy (H) - od żółtawej (wyschniętej) do soczystej
        // Saturation (S) - zależna od wilgotności
        // Lightness (L) - wariacja szumu
        
        const hue = 80 + moisture * 40 + noiseVal * 10; // 80 (żółtawy) - 130 (zielony)
        const sat = 30 + moisture * 40;
        const light = 60 - moisture * 20 - noiseVal * 10;
        
        return {
            color: `hsl(${hue}, ${sat}%, ${light}%)`,
            noiseIntensity: 0.1 + noiseVal * 0.2 // Jak mocno nakładać wzór szumu
        };
    }
}