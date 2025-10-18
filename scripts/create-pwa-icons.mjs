#!/usr/bin/env node

/**
 * Create simple PWA icons using Canvas
 * This creates placeholder icons with the app's theme color
 */

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { join } from 'path';

const THEME_COLOR = '#1877f2'; // Facebook blue
const TEXT_COLOR = '#ffffff';

function createIcon(size, filename) {
	const canvas = createCanvas(size, size);
	const ctx = canvas.getContext('2d');

	// Background
	ctx.fillStyle = THEME_COLOR;
	ctx.fillRect(0, 0, size, size);

	// Add "PF" text (Portfolio Facebook)
	ctx.fillStyle = TEXT_COLOR;
	ctx.font = `bold ${size * 0.4}px Arial`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('PF', size / 2, size / 2);

	// Save to file
	const buffer = canvas.toBuffer('image/png');
	writeFileSync(join('static', filename), buffer);
	console.log(`✅ Created ${filename} (${size}x${size})`);
}

console.log('🎨 Generating PWA Icons...\n');

try {
	createIcon(192, 'pwa-192x192.png');
	createIcon(512, 'pwa-512x512.png');
	createIcon(32, 'favicon.png');
	
	console.log('\n🎉 PWA icons generated successfully!');
	console.log('Icons created:');
	console.log('  - static/pwa-192x192.png');
	console.log('  - static/pwa-512x512.png');
	console.log('  - static/favicon.png');
} catch (error) {
	console.error('❌ Error:', error.message);
	console.log('\nCanvas package not installed. Installing...');
	console.log('Run: npm install canvas');
	console.log('\nOr manually create these files in the static/ directory:');
	console.log('  - pwa-192x192.png (192x192 pixels)');
	console.log('  - pwa-512x512.png (512x512 pixels)');
	console.log('  - favicon.png (32x32 pixels)');
	process.exit(1);
}

