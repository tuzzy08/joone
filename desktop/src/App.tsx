import React from "react";

const sampleMessages = [
  { role: "system", content: "Desktop runtime bridge connected." },
  { role: "agent", content: "Ask me to inspect, edit, or run your project." },
];

export function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <section className="panel">
          <h2>Workspace</h2>
          <p>Current project</p>
          <strong>joone</strong>
        </section>
        <section className="panel">
          <h2>Metrics</h2>
          <p>Tokens: 0</p>
          <p>Tools: 0</p>
          <p>Status: Idle</p>
        </section>
        <section className="panel">
          <h2>Activity</h2>
          <p>No tool activity yet.</p>
        </section>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <h1>Joone Desktop</h1>
            <p>Tauri desktop MVP scaffold sharing the Node runtime.</p>
          </div>
          <button className="button">Start Session</button>
        </header>

        <section className="conversation">
          {sampleMessages.map((message, index) => (
            <article key={index} className={`bubble bubble-${message.role}`}>
              {message.content}
            </article>
          ))}
        </section>

        <footer className="composer">
          <input
            className="input"
            placeholder="What should we build today?"
            readOnly
          />
          <button className="button">Send</button>
        </footer>
      </main>
    </div>
  );
}
