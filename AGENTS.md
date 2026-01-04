<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# AGENTS.md - Obsidian OpenCode Plugin

Guidelines for AI coding agents working on the obsidian-opencode plugin.

## Project Overview

Obsidian plugin that embeds the OpenCode AI assistant via an iframe. Spawns a local server process and displays its web UI in the Obsidian sidebar.

**Tech Stack:** TypeScript, Obsidian Plugin API, esbuild, Node.js child processes

## Build Commands

```bash
bun install          # Install dependencies
bun run dev          # Development (watch mode)
bun run build        # Production (type-check + bundle)
```

Output: `main.js` (CommonJS bundle)

## Testing & Linting

**Not configured.** If adding:
- Tests: Vitest, files in `src/__tests__/` or `*.test.ts`
- Linting: ESLint + `@typescript-eslint/parser`
- Scripts: `"test": "vitest run"`, `"lint": "eslint src"`

## Project Structure

```
src/
├── main.ts           # Plugin entry, extends Plugin
├── types.ts          # Types and constants
├── OpenCodeView.ts   # Sidebar view (ItemView) with iframe
├── ProcessManager.ts # Server process lifecycle
└── SettingsTab.ts    # Settings UI (PluginSettingTab)
```

## Code Style

### Imports
- ES modules with named imports
- Order: Obsidian API, Node.js builtins, local modules
- Use `type` for type-only imports
- Relative paths with `./` prefix

```typescript
import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { spawn, ChildProcess } from "child_process";
import type OpenCodePlugin from "./main";
import { OpenCodeSettings, DEFAULT_SETTINGS } from "./types";
```

### Exports
- `export default class` for main plugin
- Named exports for other classes/types/constants
- One class per file, filename matches class (PascalCase)

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `OpenCodePlugin`, `ProcessManager` |
| Interfaces/Types | PascalCase | `OpenCodeSettings`, `ProcessState` |
| Constants | UPPER_CASE or camelCase | `DEFAULT_SETTINGS`, `OPENCODE_VIEW_TYPE` |
| Variables/functions | camelCase | `getVaultPath`, `startServer` |
| Private members | camelCase (no prefix) | `private processManager` |
| Files | PascalCase (classes), lowercase (entry) | `ProcessManager.ts`, `main.ts` |

### TypeScript Patterns
- `strictNullChecks` enabled - handle null/undefined
- Union types for state: `"stopped" | "starting" | "running" | "error"`
- `async/await` over Promises
- Explicit return types on public methods

```typescript
getProcessState(): ProcessState {
  return this.processManager?.getState() ?? "stopped";
}
```

### Error Handling
- try/catch for async operations
- `console.error()` for debugging
- `new Notice()` for user-facing errors
- Boolean returns for success/failure
- Silent catch for non-critical ops (health checks)

```typescript
try {
  await this.processManager.start();
} catch (error) {
  console.error("Failed to start:", error);
  new Notice(`Failed to start OpenCode: ${error.message}`);
  return false;
}
```

### Obsidian API Patterns
- Extend `Plugin` with `onload()`/`onunload()` lifecycle
- Extend `ItemView` for views: `getViewType()`, `onOpen()`, `onClose()`
- Extend `PluginSettingTab` for settings: `display()`
- DOM helpers: `createEl()`, `createDiv()`, `setIcon()`
- Register in `onload()`, clean up in `onunload()`

```typescript
this.registerView(OPENCODE_VIEW_TYPE, (leaf) => new OpenCodeView(leaf, this));
this.addCommand({ id: "toggle-view", name: "Toggle panel", callback: () => this.toggleView() });
```

### DOM Creation
```typescript
const container = this.contentEl.createDiv({ cls: "opencode-container" });
container.createEl("h3", { text: "Title" });
container.createEl("button", { text: "Click", cls: "mod-cta" });
```

### State Management
- Callback-based subscriptions
- Centralized state in manager classes
- Immediate notification on state change

## Config Summary

**tsconfig.json:** ES6 target, ESNext modules, strictNullChecks, noImplicitAny

**esbuild:** CJS format, es2018 target, node platform. Externals: obsidian, electron, CodeMirror, Node builtins

## Desktop-Only

Uses Node.js APIs unavailable on mobile:
- `child_process.spawn()` for server process
- File system via vault adapter

Check for desktop environment before adding mobile-incompatible features.
