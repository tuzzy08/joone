import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { DesktopErrorBoundary } from "./DesktopErrorBoundary";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DesktopErrorBoundary>
      <App />
    </DesktopErrorBoundary>
  </React.StrictMode>,
);
