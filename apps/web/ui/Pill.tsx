import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export type PillTone = "neutral" | "tee" | "mock" | "gw" | "bad" | "rule" | "signal" | "profit" | "loss" | "gold" | "high" | "low" | "null";
/** 18px status pill: 1px border in the tone colour + 12% fill. For AI honesty labels prefer
 *  components/Badge.tsx (AttestationBadge), which owns the verification rules. */
export function Pill({ tone = "neutral", icon, title, href, className, children }: {
  tone?: PillTone; icon?: IconName; title?: string; href?: string; className?: string; children: ReactNode;
}) {
  const cls = ["ui-pill", tone !== "neutral" && tone, className].filter(Boolean).join(" ");
  const inner = <>{icon && <Icon name={icon} size={11} strokeWidth={2} />}{children}</>;
  return href ? <a className={cls} title={title} href={href} target="_blank" rel="noreferrer">{inner}</a> : <span className={cls} title={title}>{inner}</span>;
}
