import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop UI shell", () => {
  it("replaces the placeholder chat with a bridge-driven app shell", () => {
    const source = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");

    expect(source).toContain("getDesktopBridge");
    expect(source).toContain("useEffect");
    expect(source).not.toContain("const sampleMessages");
  });

  it("provides a browser bridge for local web development", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/bridge/browserBridge.ts"),
      "utf8",
    );

    expect(source).toContain("createBrowserDesktopBridge");
    expect(source).toContain("startSession");
    expect(source).toContain("submitMessage");
    expect(source).toContain("listSessions");
  });

  it("provides a Tauri bridge adapter for desktop runtime calls", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/bridge/tauriBridge.ts"),
      "utf8",
    );

    expect(source).toContain("createTauriDesktopBridge");
    expect(source).toContain("invoke");
    expect(source).toContain("listen");
  });

  it("adds a desktop settings editor wired to config save", () => {
    const appSource = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");
    const settingsSource = fs.readFileSync(
      path.resolve("desktop/src/components/SettingsModal.tsx"),
      "utf8",
    );
    const providerModalSource = fs.readFileSync(
      path.resolve("desktop/src/components/ProviderConnectionModal.tsx"),
      "utf8",
    );
    const styles = fs.readFileSync(path.resolve("desktop/src/styles.css"), "utf8");
    const catalog = fs.readFileSync(
      path.resolve("src/desktop/providerCatalog.ts"),
      "utf8",
    );

    expect(appSource).toContain("draftConfig");
    expect(appSource).toContain("bridge.saveConfig");
    expect(appSource).toContain("syncDraftProvider");
    expect(settingsSource).toContain("Save Settings");
    expect(settingsSource).toContain("<select");
    expect(settingsSource).toContain("providerOptions.map");
    expect(settingsSource).toContain("availableModels");
    expect(settingsSource).toContain("Connect provider");
    expect(settingsSource).toContain("Test connection");
    expect(settingsSource).toContain("Check for updates");
    expect(providerModalSource).toContain("API key");
    expect(providerModalSource).toContain("Base URL");
    expect(styles).toContain(".settings-form");
    expect(styles).toContain(".settings-row");
    expect(styles).toContain(".toggle-row");
    expect(catalog).toContain("SUPPORTED_PROVIDERS");
    expect(catalog).toContain("PROVIDER_MODELS");
  });

  it("queues HITL prompts in the desktop shell and answers them through the bridge", () => {
    const source = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");
    const styles = fs.readFileSync(path.resolve("desktop/src/styles.css"), "utf8");

    expect(source).toContain("pendingHitlPrompts");
    expect(source).toContain("bridge.answerHitl");
    expect(source).toContain('event.type === "hitl:question"');
    expect(source).toContain('event.type === "hitl:permission"');
    expect(source).toContain("Pending prompts:");
    expect(source).toContain("Submit Answer");
    expect(styles).toContain(".hitl-card");
  });

  it("shows compact session cards with attention and resume state in the sidebar", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/components/ShellSidebar.tsx"),
      "utf8",
    );
    const styles = fs.readFileSync(path.resolve("desktop/src/styles.css"), "utf8");

    expect(source).toContain("resumingSessionId");
    expect(source).toContain("attentionBySession");
    expect(source).toContain("session-attention");
    expect(source).toContain("describeSession(session)");
    expect(source).toContain("Resuming...");
    expect(source).toContain("Resume session");
    expect(source).not.toContain("Last saved");
    expect(styles).toContain(".session-card");
    expect(styles).toContain(".session-card--active");
    expect(styles).toContain(".session-attention");
  });

  it("restores focus and scroll position after resuming a session", () => {
    const source = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");

    expect(source).toContain("conversationRef");
    expect(source).toContain("composerInputRef");
    expect(source).toContain("scrollToConversationEnd");
    expect(source).toContain("focusComposer");
    expect(source).toContain('behavior: "smooth"');
    expect(source).toContain("requestAnimationFrame(() =>");
    expect(source).toContain("composerInputRef.current?.focus()");
  });

  it("shows explicit restore and empty-session states in the conversation pane", () => {
    const source = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");
    const styles = fs.readFileSync(path.resolve("desktop/src/styles.css"), "utf8");

    expect(source).toContain("isRestoringSession");
    expect(source).toContain("conversation-state");
    expect(source).toContain("Restoring session conversation...");
    expect(source).toContain("Pick up where you left off");
    expect(source).toContain("This session is ready for the next message.");
    expect(styles).toContain(".conversation-state");
    expect(styles).toContain(".conversation-state--loading");
  });

  it("moves desktop controls into a toggleable shell with a settings modal and composer footer metadata", () => {
    const source = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");
    const sidebar = fs.readFileSync(
      path.resolve("desktop/src/components/ShellSidebar.tsx"),
      "utf8",
    );
    const settings = fs.readFileSync(
      path.resolve("desktop/src/components/SettingsModal.tsx"),
      "utf8",
    );
    const footer = fs.readFileSync(
      path.resolve("desktop/src/components/ComposerFooter.tsx"),
      "utf8",
    );
    const styles = fs.readFileSync(path.resolve("desktop/src/styles.css"), "utf8");

    expect(source).toContain("sidebarExpanded");
    expect(source).toContain("showSettingsModal");
    expect(source).toContain("activeSettingsSection");
    expect(settings).toContain("General");
    expect(settings).toContain("Providers");
    expect(settings).toContain("Connect provider");
    expect(settings).toContain("Test connection");
    expect(settings).toContain("Check for updates");
    expect(footer).toContain("composer-footer");
    expect(source).toContain("permissionModeLabel");
    expect(source).toContain("workspaceContext");
    expect(sidebar).toContain("Resume session");
    expect(sidebar).toContain("settings-launch__icon");
    expect(source).not.toContain("<h2>Workspace</h2>");
    expect(source).not.toContain("Start Session");

    expect(styles).toContain(".app-shell");
    expect(styles).toContain(".sidebar-toggle");
    expect(styles).toContain(".sidebar--collapsed");
    expect(styles).toContain(".settings-modal");
    expect(styles).toContain(".settings-nav");
    expect(styles).toContain(".composer-footer");
    expect(styles).toContain("--surface");
    expect(styles).toContain('[data-theme="dark"]');
  });
});
