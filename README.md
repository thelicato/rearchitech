# Rearchitech

A lightweight, browser-based diagram editor for architecture sketches, flowcharts, and system maps. Build diagrams on an interactive canvas, shape the details, and export them for sharing or further editing.

## Features

- Create box, decision, group, and text nodes, then connect them with padded, horizontal, or routed edges
- Edit node content, colors, images, group labels, and edge styles from the canvas controls
- Arrange, select, copy, paste, and undo diagram changes
- Save diagrams in your browser, with optional auto-save
- Import and export Rearchitech JSON and draw.io files
- Export portable SVG diagrams
- Use a responsive dark canvas with zoom and pan controls

## Getting started

Requires Node.js and npm.

```sh
git clone https://github.com/thelicato/rearchitech.git
cd rearchitech
npm install
npm run dev
```

Open the local URL printed by Vite. Rearchitech runs in your browser and stores local saves in that browser's local storage. Export a JSON file to keep a portable backup or move a diagram to another browser.

## Working with diagrams

Choose a node from the Add panel, then drag it into place. Connect nodes by dragging between their connection points. Select a node or edge to edit its settings. Use the Files panel to save or load a local diagram, import or export a file, export SVG or draw.io, and enable auto-save.

Keyboard shortcuts: `Ctrl/Cmd+C` copies the selection, `Ctrl/Cmd+V` pastes it, and `Ctrl/Cmd+Z` undoes the last change.

## Development

```sh
npm run dev      # Start the development server
npm run build    # Create a production build in dist/
npm run preview  # Preview the production build
npm run lint     # Check source files with ESLint
```

## Built with

React, TypeScript, Vite, and [React Flow](https://reactflow.dev/).
