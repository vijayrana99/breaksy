# Icon Placeholders for Breaksy

This directory contains placeholder instructions for extension icons.

## Required Icon Sizes
- icon16.png (16x16)
- icon48.png (48x48)
- icon128.png (128x128)

## Creating Icons
You can create simple icons using:

```bash
# Using ImageMagick (if available)
convert -size 128x128 xc:'#2563eb' -fill white -gravity center -pointsize 48 -annotate 0 '👀' icon128.png
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 16x16 icon16.png
```

## Simple SVG-based Icon
Create an SVG file and convert:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="16" fill="#2563eb"/>
  <circle cx="64" cy="64" r="40" fill="white" opacity="0.9"/>
  <circle cx="52" cy="56" r="8" fill="#2563eb"/>
  <circle cx="76" cy="56" r="8" fill="#2563eb"/>
  <path d="M44 80 Q64 96 84 80" stroke="#2563eb" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>
```

## For Development
For now, the build will work with simple colored PNG files. Create any 16x16, 48x48, and 128x128 PNG files and place them here.
