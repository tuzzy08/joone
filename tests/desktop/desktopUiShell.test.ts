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
    const source = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");
    const styles = fs.readFileSync(path.resolve("desktop/src/styles.css"), "utf8");
    const catalog = fs.readFileSync(
      path.resolve("src/desktop/providerCatalog.ts"),
      "utf8",
    );

    expect(source).toContain("draftConfig");
    expect(source).toContain("Save Settings");
    expect(source).toContain("bridge.saveConfig");
    expect(source).toContain("<select");
    expect(source).toContain("providerOptions.map");
    expect(source).toContain("availableModels.map");
    expect(source).toContain("syncDraftProvider");
    expect(source).not.toContain('<input\n                  className="input"\n                  value={draftConfig.provider}');
    expect(source).not.toContain('<input\n                  className="input"\n                  value={draftConfig.model}');
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
    expect(styles).toContain(".hitl-queue");
  });

  it("shows saved-time metadata and clearer resume state in the sessions panel", () => {
    const source = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");
    const styles = fs.readFileSync(path.resolve("desktop/src/styles.css"), "utf8");
    const types = fs.readFileSync(
      path.resolve("desktop/src/bridge/types.ts"),
      "utf8",
    );

    expect(types).toContain("lastSavedAt?: number");
    expect(source).toContain("resumingSessionId");
    expect(source).toContain("formatSessionTimestamp");
    expect(source).toContain("Last saved");
    expect(source).toContain("Current session");
    expect(source).toContain("Resuming...");
    expect(styles).toContain(".session-details");
    expect(styles).toContain(".session-time");
    expect(styles).toContain(".session-badge");
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
});
