"use client";
import { useState, type ReactNode } from "react";

/** Hover/focus tooltip anchored to its child. `content` can be text or a <KV/> grid. */
export function Tooltip({ title, content, placement = "above", children, className }: {
  title?: ReactNode; content: ReactNode; placement?: "above" | "below"; children: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className={className ? `ui-tip-anchor ${className}` : "ui-tip-anchor"} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      {open && (
        <span role="tooltip" className={placement === "below" ? "ui-tooltip below" : "ui-tooltip"}>
          {title && <div className="tt-title">{title}</div>}
          {content}
        </span>
      )}
    </span>
  );
}

/** Elite-style key/value grid: <KV items={[["RISK", "34%"], ["TOLL", 0]]} />. */
export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="ui-kv">
      {items.map(([k, v], i) => (
        <span key={i} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></span>
      ))}
    </dl>
  );
}
