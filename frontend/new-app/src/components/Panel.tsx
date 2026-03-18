import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, subtitle, action, children }: PanelProps) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <span className="eyebrow">Control Surface</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {action ? <div className="panel__action">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
