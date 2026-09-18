# Form / Signal

A browser-based 3D visual playground with ASCII, pixel and blob-tracking effects, colored Perlin noise, editable typography and a node-style workspace.

## Run locally

Requires Node.js, npm and Python 3.

```sh
npm install
npm run build
npm run dev
```

Open http://localhost:5173. Rebuild after changing `src/app.js`.

## Files

- `src/app.js`: rendering, controls, model import and exports.
- `dist/`: ready-to-serve static website and bundled JavaScript.
- `package.json` / `package-lock.json`: dependencies and build commands.

Serve `dist/` from your web host's root. This repository does not automatically deploy a website.

## Features

- Local GLB, self-contained GLTF, OBJ and STL import.
- ASCII, pixel and blob tracking styles, CMYK-style and custom gradient palettes.
- Warped, animated Perlin overlays with editable colors.
- Editable text, Google Sans and slab-serif fonts, outlines and inner shadows.
- Transparent PNG and text-only exports.
- 1080 × 1080 PNG and looping video exports (supported format depends on browser).

Models stay in your browser. Google Fonts are loaded from Google's font service.
