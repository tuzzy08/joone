import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Tauri runtime bridge", () => {
  it("moves startup status, config, session actions, and event subscription onto real Tauri commands", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/bridge/tauriBridge.ts"),
      "utf8",
    );

    expect(source).toContain('invoke<DesktopBridgeStatus>("runtime_status")');
    expect(source).toContain('invoke<DesktopConfig>("runtime_load_config")');
    expect(source).toContain('invoke("runtime_save_config"');
    expect(source).toContain('invoke("runtime_answer_hitl"');
    expect(source).toContain(
      'invoke<DesktopSessionSnapshot[]>("runtime_list_sessions")',
    );
    expect(source).toContain(
      'invoke<DesktopSessionSnapshot>("runtime_start_session")',
    );
    expect(source).toContain(
      'invoke<DesktopSessionSnapshot>("runtime_resume_session"',
    );
    expect(source).toContain(
      'invoke<DesktopSessionSnapshot>("runtime_submit_message"',
    );
    expect(source).toContain('invoke("runtime_close_session"');
    expect(source).toContain('listen(`runtime-event:${sessionId}`');
    expect(source).toContain('invoke("runtime_subscribe_session"');
    expect(source).toContain('invoke("runtime_unsubscribe_session"');
    expect(source).not.toContain("return (await getBridge()).loadConfig()");
    expect(source).not.toContain("return (await getBridge()).listSessions()");
    expect(source).not.toContain("return (await getBridge()).startSession()");
    expect(source).not.toContain("return (await getBridge()).resumeSession(sessionId)");
    expect(source).not.toContain("return (await getBridge()).submitMessage(sessionId, text)");
    expect(source).not.toContain("await (await getBridge()).closeSession(sessionId)");
    expect(source).not.toContain("await (await getBridge()).saveConfig(config)");
    expect(source).not.toContain("activeUnsubscribe = bridge.subscribe(sessionId, listener)");
  });

  it("registers startup, session-list, active session, and event bridge commands in the Tauri shell", () => {
    const source = fs.readFileSync(
      path.resolve("src-tauri/src/main.rs"),
      "utf8",
    );

    expect(source).toContain("runtime_base_url");
    expect(source).toContain("runtime_status");
    expect(source).toContain("runtime_load_config");
    expect(source).toContain("runtime_save_config");
    expect(source).toContain("runtime_answer_hitl");
    expect(source).toContain("runtime_list_sessions");
    expect(source).toContain("runtime_start_session");
    expect(source).toContain("runtime_resume_session");
    expect(source).toContain("runtime_submit_message");
    expect(source).toContain("runtime_close_session");
    expect(source).toContain("runtime_subscribe_session");
    expect(source).toContain("runtime_unsubscribe_session");
    expect(source).toContain("runtime-event:");
    expect(source).toContain("generate_handler");
    expect(source).toContain("JOONE_DESKTOP_RUNTIME_URL");
  });
});
