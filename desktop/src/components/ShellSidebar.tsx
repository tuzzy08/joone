import React from "react";
import type { DesktopSessionSnapshot } from "../bridge/types";

interface ShellSidebarProps {
  expanded: boolean;
  sessions: DesktopSessionSnapshot[];
  activeSessionId?: string | null;
  resumingSessionId?: string | null;
  showAllSessions: boolean;
  attentionBySession: Record<string, string>;
  onToggleSidebar: () => void;
  onStartSession: () => void;
  onResumeSession: (sessionId: string) => void;
  onToggleShowAll: () => void;
  onOpenSettings: () => void;
  updateAvailable: boolean;
}

export function ShellSidebar({
  expanded,
  sessions,
  activeSessionId,
  resumingSessionId,
  showAllSessions,
  attentionBySession,
  onToggleSidebar,
  onStartSession,
  onResumeSession,
  onToggleShowAll,
  onOpenSettings,
  updateAvailable,
}: ShellSidebarProps) {
  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, 3);

  return (
    <aside className={`sidebar ${expanded ? "" : "sidebar--collapsed"}`}>
      <div className="sidebar-top">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          <span />
          <span />
          <span />
        </button>
        {expanded ? (
          <div className="sidebar-brand">
            <p className="sidebar-kicker">Joone Desktop</p>
            <strong>Operator Console</strong>
          </div>
        ) : null}
      </div>

      <div className="sidebar-scroll">
        <button
          type="button"
          className={`primary-launch ${expanded ? "" : "primary-launch--icon"}`}
          onClick={onStartSession}
        >
          <span className="primary-launch__icon">+</span>
          {expanded ? <span>New session</span> : null}
        </button>

        {expanded ? (
          <section className="sidebar-section">
            <div className="sidebar-section__header">
              <span className="sidebar-section__label">Sessions</span>
              {sessions.length > 3 ? (
                <button
                  type="button"
                  className="ghost-link"
                  onClick={onToggleShowAll}
                >
                  {showAllSessions ? "Show fewer" : "View more"}
                </button>
              ) : null}
            </div>

            <div className="session-stack">
              {visibleSessions.length > 0 ? (
                visibleSessions.map((session) => {
                  const needsAttention = attentionBySession[session.sessionId];
                  const active = session.sessionId === activeSessionId;

                  return (
                    <article
                      key={session.sessionId}
                      className={`session-card ${active ? "session-card--active" : ""}`}
                    >
                      <div className="session-card__top">
                        <strong title={describeSession(session)}>
                          {describeSession(session)}
                        </strong>
                        {needsAttention ? (
                          <span className="session-attention" title={needsAttention}>
                            ! {needsAttention}
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="session-resume"
                        onClick={() => onResumeSession(session.sessionId)}
                        disabled={resumingSessionId === session.sessionId}
                      >
                        {resumingSessionId === session.sessionId
                          ? "Resuming..."
                          : "Resume session"}
                      </button>
                    </article>
                  );
                })
              ) : (
                <div className="session-empty">
                  <p>No saved sessions yet.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`settings-launch ${expanded ? "" : "settings-launch--icon"}`}
          onClick={onOpenSettings}
        >
          <span className="settings-launch__icon">+</span>
          {expanded ? <span>Settings</span> : null}
          {updateAvailable ? <em className="update-pill">Update</em> : null}
        </button>
      </div>
    </aside>
  );
}

function describeSession(session: DesktopSessionSnapshot): string {
  const label = session.description?.trim();
  if (label) {
    return label.length > 48 ? `${label.slice(0, 48)}...` : label;
  }

  return session.sessionId;
}
