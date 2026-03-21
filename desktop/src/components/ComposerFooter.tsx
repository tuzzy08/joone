import React from "react";

interface ComposerFooterProps {
  modelLabel: string;
  permissionLabel: string;
  gitBranchLabel: string;
  runtimeLabel: string;
  onOpenProviders: () => void;
  onOpenGeneral: () => void;
}

export function ComposerFooter({
  modelLabel,
  permissionLabel,
  gitBranchLabel,
  runtimeLabel,
  onOpenProviders,
  onOpenGeneral,
}: ComposerFooterProps) {
  return (
    <div className="composer-footer">
      <button type="button" className="footer-pill" onClick={onOpenProviders}>
        <span className="footer-pill__icon">{`</>`}</span>
        <span>{modelLabel}</span>
        <span className="footer-pill__chevron">v</span>
      </button>
      <button type="button" className="footer-pill" onClick={onOpenGeneral}>
        <span className="footer-pill__icon">!</span>
        <span>{permissionLabel}</span>
        <span className="footer-pill__chevron">v</span>
      </button>
      <div className="footer-pill footer-pill--static">
        <span className="footer-pill__icon">#</span>
        <span>{gitBranchLabel}</span>
      </div>
      <div className="footer-pill footer-pill--static">
        <span className="footer-pill__icon">o</span>
        <span>{runtimeLabel}</span>
      </div>
    </div>
  );
}
