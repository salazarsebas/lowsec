import type { HTMLAttributes, ReactNode } from "react";

/** Notched glass panel. `title` renders an <h3> whose text is exactly the title (recorder
 *  selectors match h3 text, e.g. /^Haul$/), so put extra info in `sub`/`right`, not in title. */
export function Panel({ title, sub, right, icon, variant = "glass", tone, className, children, ...rest }: {
  title?: ReactNode; sub?: ReactNode; right?: ReactNode; icon?: ReactNode;
  variant?: "glass" | "solid"; tone?: "alert" | "active"; className?: string; children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "title">) {
  const cls = ["panel", "ui-panel", variant === "solid" && "solid", tone, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {(title || sub || right) && (
        <div className="ui-panel-header">
          {icon}
          {title && <h3>{title}</h3>}
          {sub && <span className="sub">{sub}</span>}
          {right && <span className="right">{right}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
