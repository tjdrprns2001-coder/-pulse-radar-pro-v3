import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  ["Desk", "/"],
  ["Daily Plan", "/daily-plan"],
  ["Workspace", "/workspace"],
  ["Scanner", "/scanner"],
  ["Playbook", "/playbook"],
  ["Manage", "/manage"],
  ["Performance", "/performance"],
  ["Risk Tools", "/book-tools"],
  ["Book Ref", "/book"],
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
          <div className="status"><span className="dot" />Plan · Desk · MTF · Scanner · Playbook · Manage · Journal · Analytics</div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
