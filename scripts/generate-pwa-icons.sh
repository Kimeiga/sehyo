#!/bin/bash

# Generate PWA icons from a base image
# This script creates the required PWA icon sizes

echo "🎨 Generating PWA Icons..."

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "❌ ImageMagick is not installed."
    echo "Please install it:"
    echo "  macOS: brew install imagemagick"
    echo "  Ubuntu: sudo apt-get install imagemagick"
    echo ""
    echo "Or manually create these files in the static/ directory:"
    echo "  - pwa-192x192.png (192x192 pixels)"
    echo "  - pwa-512x512.png (512x512 pixels)"
    echo "  - favicon.png (32x32 pixels)"
    exit 1
fi

# Use sprite 1 as the base (or you can replace with your own logo)
BASE_IMAGE="static/sprites/1.png"

if [ ! -f "$BASE_IMAGE" ]; then
    echo "❌ Base image not found: $BASE_IMAGE"
    exit 1
fi

# Create a blue background with the sprite
# 192x192 icon
convert -size 192x192 xc:"#1877f2" \
    \( "$BASE_IMAGE" -resize 128x128 -gravity center \) \
    -gravity center -composite \
    static/pwa-192x192.png

echo "✅ Created pwa-192x192.png"

# 512x512 icon
convert -size 512x512 xc:"#1877f2" \
    \( "$BASE_IMAGE" -resize 384x384 -gravity center \) \
    -gravity center -composite \
    static/pwa-512x512.png

echo "✅ Created pwa-512x512.png"

# 32x32 favicon
convert -size 32x32 xc:"#1877f2" \
    \( "$BASE_IMAGE" -resize 24x24 -gravity center \) \
    -gravity center -composite \
    static/favicon.png

echo "✅ Created favicon.png"

echo ""
echo "🎉 PWA icons generated successfully!"
echo "Icons created:"
echo "  - static/pwa-192x192.png"
echo "  - static/pwa-512x512.png"
echo "  - static/favicon.png"

