"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { sfx, type SfxName } from "@/lib/sound";
import { Icon, type IconName } from "./icons";
import { Kbd } from "./Kbd";

/** Square, notched button. variant: primary (orange, ONE per screen) | secondary | danger (lowsec hatch) | ghost.
 *  Plays the "click" cue (or `sound`) on click; pass sound={false} to silence. */
export function Button({ variant = "secondary", size = "md", icon, kbd, sound = "click", className, children, onClick, onMouseEnter, ...rest }: {
  variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md" | "lg"; icon?: IconName; kbd?: string;
  sound?: SfxName | false; children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ["ui-btn", variant !== "secondary" && variant, size !== "md" && size, className].filter(Boolean).join(" ");
  return (
    <button
      className={cls}
      onClick={(e) => (sound && sfx(sound), onClick?.(e))}
      onMouseEnter={(e) => (!rest.disabled && sfx("hover"), onMouseEnter?.(e))}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 12 : 14} />}
      {children}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}
