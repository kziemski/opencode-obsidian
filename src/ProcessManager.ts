import { spawn, ChildProcess } from "child_process";
import { Notice } from "obsidian";
import { OpenCodeSettings } from "./types";

export type ProcessState = "stopped" | "starting" | "running" | "error";

export class ProcessManager {
  private process: ChildProcess | null = null;
  private state: ProcessState = "stopped";
  private settings: OpenCodeSettings;
  private workingDirectory: string;
  private projectDirectory: string;
  private onStateChange: (state: ProcessState) => void;
  private startupTimeout: NodeJS.Timeout | null = null;

  constructor(
    settings: OpenCodeSettings,
    workingDirectory: string,
    projectDirectory: string,
    onStateChange: (state: ProcessState) => void
  ) {
    this.settings = settings;
    this.workingDirectory = workingDirectory;
    this.projectDirectory = projectDirectory;
    this.onStateChange = onStateChange;
  }

  updateSettings(settings: OpenCodeSettings): void {
    this.settings = settings;
  }

  updateProjectDirectory(directory: string): void {
    this.projectDirectory = directory;
  }

  getState(): ProcessState {
    return this.state;
  }

  getUrl(): string {
    const baseUrl = `http://${this.settings.hostname}:${this.settings.port}`;
    // Encode the project directory path as base64 for the URL
    const encodedPath = btoa(this.projectDirectory);
    return `${baseUrl}/${encodedPath}`;
  }

  async start(): Promise<boolean> {
    if (this.state === "running" || this.state === "starting") {
      return true;
    }

    this.setState("starting");

    try {
      // Validate vault/project directory is set
      if (!this.projectDirectory) {
        const error = "Project directory (vault) not configured";
        console.error("[OpenCode Error]", error);
        new Notice(`Failed to start OpenCode: ${error}`);
        this.setState("error");
        return false;
      }

      // Check if server is already running on this port
      const alreadyRunning = await this.checkServerHealth();
      if (alreadyRunning) {
        console.log("OpenCode server already running on port", this.settings.port);
        this.setState("running");
        return true;
      }

      // Start the opencode serve process (headless server, no browser)
      // OpenCode is initialized with the vault directory as the project
      console.log("[OpenCode] Starting server with vault:", {
        vaultDirectory: this.projectDirectory,
        workingDirectory: this.workingDirectory,
        opencodePath: this.settings.opencodePath,
        port: this.settings.port,
        hostname: this.settings.hostname,
      });

      this.process = spawn(
        this.settings.opencodePath,
        [
          "serve",
          this.projectDirectory,
          "--port",
          this.settings.port.toString(),
          "--hostname",
          this.settings.hostname,
          "--cors",
          "app://obsidian.md",
        ],
        {
          cwd: this.workingDirectory,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
          detached: false,
        }
      );

      console.log("[OpenCode] Process spawned with PID:", this.process.pid);

      // Handle process output
      this.process.stdout?.on("data", (data) => {
        console.log("[OpenCode]", data.toString().trim());
      });

      this.process.stderr?.on("data", (data) => {
        console.error("[OpenCode Error]", data.toString().trim());
      });

      // Handle process exit
      this.process.on("exit", (code, signal) => {
        console.log(`OpenCode process exited with code ${code}, signal ${signal}`);
        this.process = null;
        // Only set stopped if we're in running state (not during startup)
        if (this.state === "running") {
          this.setState("stopped");
        }
      });

      this.process.on("error", (err) => {
        console.error("Failed to start OpenCode process:", err);
        new Notice(`Failed to start OpenCode: ${err.message}`);
        this.process = null;
        this.setState("error");
      });

      // Wait for server to be ready, detecting early process exit
      const ready = await this.waitForServerOrExit(15000);
      if (ready) {
        this.setState("running");
        return true;
      } else {
        this.stop();
        this.setState("error");
        new Notice("OpenCode server failed to start within timeout");
        return false;
      }
    } catch (error) {
      console.error("Error starting OpenCode:", error);
      this.setState("error");
      return false;
    }
  }

  stop(): void {
    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }

    if (this.process) {
      try {
        // Try graceful shutdown first
        this.process.kill("SIGTERM");
        
        // Force kill after 2 seconds if still running
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill("SIGKILL");
          }
        }, 2000);
      } catch (error) {
        console.error("Error stopping OpenCode process:", error);
      }
      this.process = null;
    }

    this.setState("stopped");
  }

  private setState(state: ProcessState): void {
    this.state = state;
    this.onStateChange(state);
  }

  private async checkServerHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getUrl()}/global/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async waitForServerOrExit(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeoutMs) {
      // If process exited early, fail fast
      if (!this.process) {
        console.log("OpenCode process exited before server became ready");
        return false;
      }
      
      if (await this.checkServerHealth()) {
        return true;
      }
      await this.sleep(pollInterval);
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
