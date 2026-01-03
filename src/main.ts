import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { OpenCodeSettings, DEFAULT_SETTINGS, OPENCODE_VIEW_TYPE } from "./types";
import { OpenCodeView } from "./OpenCodeView";
import { OpenCodeSettingTab } from "./SettingsTab";
import { ProcessManager, ProcessState } from "./ProcessManager";

export default class OpenCodePlugin extends Plugin {
  settings: OpenCodeSettings = DEFAULT_SETTINGS;
  private processManager: ProcessManager | null = null;
  private stateChangeCallbacks: Array<(state: ProcessState) => void> = [];

  async onload(): Promise<void> {
    console.log("Loading OpenCode plugin");

    await this.loadSettings();

    // Get the vault directory path to pass to OpenCode
    const vaultPath = this.getVaultPath();
    const projectDirectory = this.getProjectDirectory();

    // Initialize process manager with vault as the working directory
    // and either the configured project directory or vault as the project
    this.processManager = new ProcessManager(
      this.settings,
      vaultPath,
      projectDirectory,
      (state) => this.notifyStateChange(state)
    );

    console.log("[OpenCode] Configured with project directory:", projectDirectory);

    // Register the OpenCode view
    this.registerView(OPENCODE_VIEW_TYPE, (leaf) => new OpenCodeView(leaf, this));

    // Add ribbon icon
    this.addRibbonIcon("terminal", "OpenCode", () => {
      this.activateView();
    });

    // Add command to toggle view
    this.addCommand({
      id: "toggle-opencode-view",
      name: "Toggle OpenCode panel",
      callback: () => {
        this.toggleView();
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "o",
        },
      ],
    });

    // Add command to start server
    this.addCommand({
      id: "start-opencode-server",
      name: "Start OpenCode server",
      callback: () => {
        this.startServer();
      },
    });

    // Add command to stop server
    this.addCommand({
      id: "stop-opencode-server",
      name: "Stop OpenCode server",
      callback: () => {
        this.stopServer();
      },
    });

    // Register settings tab
    this.addSettingTab(new OpenCodeSettingTab(this.app, this));

    // Auto-start if enabled
    if (this.settings.autoStart) {
      this.app.workspace.onLayoutReady(async () => {
        await this.startServer();
      });
    }

    console.log("OpenCode plugin loaded");
  }

  async onunload(): Promise<void> {
    console.log("Unloading OpenCode plugin");

    // Stop the server
    this.stopServer();

    // Detach all views
    this.app.workspace.detachLeavesOfType(OPENCODE_VIEW_TYPE);

    console.log("OpenCode plugin unloaded");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Update process manager with new settings
    if (this.processManager) {
      this.processManager.updateSettings(this.settings);
    }
  }

  // Update project directory and restart server if running
  async updateProjectDirectory(directory: string): Promise<void> {
    this.settings.projectDirectory = directory;
    await this.saveData(this.settings);

    if (this.processManager) {
      this.processManager.updateProjectDirectory(this.getProjectDirectory());

      // Restart server if it's currently running
      if (this.getProcessState() === "running") {
        this.stopServer();
        await this.startServer();
      }
    }
  }

  // Get existing view leaf if any
  private getExistingLeaf(): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType(OPENCODE_VIEW_TYPE);
    return leaves.length > 0 ? leaves[0] : null;
  }

  // Activate or create the view
  async activateView(): Promise<void> {
    const existingLeaf = this.getExistingLeaf();

    if (existingLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
      return;
    }

    // Create new leaf in right sidebar
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: OPENCODE_VIEW_TYPE,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  // Toggle view visibility
  async toggleView(): Promise<void> {
    const existingLeaf = this.getExistingLeaf();

    if (existingLeaf) {
      // Check if visible
      const rightSplit = this.app.workspace.rightSplit;
      if (rightSplit && !rightSplit.collapsed) {
        existingLeaf.detach();
      } else {
        this.app.workspace.revealLeaf(existingLeaf);
      }
    } else {
      await this.activateView();
    }
  }

  // Start the OpenCode server
  async startServer(): Promise<boolean> {
    if (!this.processManager) {
      new Notice("OpenCode: Process manager not initialized");
      return false;
    }

    const success = await this.processManager.start();
    if (success) {
      new Notice("OpenCode server started");
    }
    return success;
  }

  // Stop the OpenCode server
  stopServer(): void {
    if (this.processManager) {
      this.processManager.stop();
      new Notice("OpenCode server stopped");
    }
  }

  // Get the current process state
  getProcessState(): ProcessState {
    return this.processManager?.getState() ?? "stopped";
  }

  // Get the server URL
  getServerUrl(): string {
    return this.processManager?.getUrl() ?? `http://127.0.0.1:${this.settings.port}`;
  }

  // Subscribe to process state changes
  onProcessStateChange(callback: (state: ProcessState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  // Notify all subscribers of state change
  private notifyStateChange(state: ProcessState): void {
    for (const callback of this.stateChangeCallbacks) {
      callback(state);
    }
  }

  // Get the vault path - this is the root directory of the Obsidian vault
  private getVaultPath(): string {
    const adapter = this.app.vault.adapter as any;
    const vaultPath = adapter.basePath || "";
    if (!vaultPath) {
      console.warn("[OpenCode] Warning: Could not determine vault path");
    }
    return vaultPath;
  }

  // Get the project directory - uses the configured setting if set, otherwise vault path
  getProjectDirectory(): string {
    if (this.settings.projectDirectory) {
      return this.settings.projectDirectory;
    }
    return this.getVaultPath();
  }
}
