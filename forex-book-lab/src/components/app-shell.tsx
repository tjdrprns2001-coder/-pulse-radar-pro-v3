import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  ["Desk", "/"],
  ["Scanner", "/scanner"],
  ["Risk Tools", "/book-tools"],
  ["Book Ref", "/book"],
  ["Chart", "/chart-lab"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">FOREX <span>EXECUTION</span> DESK</div>
        <nav className="nav" aria-label="Primary navigation">
          {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <strong>Live Market Workflow</strong>
          <div className="status"><span className="dot" />Chart · Risk · Scanner · Journal</div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
