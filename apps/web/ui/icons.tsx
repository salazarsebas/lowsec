/** Icon set: lucide-react line icons (ISC license), 1.5px stroke, currentColor. Replaces all emoji.
 *  Lucide components render <svg>, so they also work INSIDE an SVG scene: pass x/y/width/height. */
import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Activity, AlertTriangle, ArrowRight, Bot, Check, ChevronRight, CircleDollarSign, Coins, Cog, Cpu, Crosshair, ExternalLink, Flame, Fuel,
  Gauge, Info, Landmark, Package, Pickaxe, Radar, Rocket, Route, ScrollText, Shield, ShieldCheck, Skull, Star, Swords, Trophy, Users, Volume2,
  VolumeX, X, Zap,
} from "lucide-react";

export type { LucideIcon, LucideProps };
export {
  Activity, AlertTriangle, ArrowRight, Bot, Check, ChevronRight, CircleDollarSign, Coins, Cog, Cpu, Crosshair, ExternalLink, Flame, Fuel,
  Gauge, Info, Landmark, Package, Pickaxe, Radar, Rocket, Route, ScrollText, Shield, ShieldCheck, Skull, Star, Swords, Trophy, Users, Volume2,
  VolumeX, X, Zap,
};

/** Semantic map: use these names in game UI so the whole app stays consistent. */
export const ICONS = {
  ore: Pickaxe, parts: Cog, fuel: Fuel, gold: Coins,
  ambush: Skull, burn: Flame, raid: Crosshair, raider: Swords, safe: Shield, lowsec: AlertTriangle, route: Route, radar: Radar,
  contract: ScrollText, leaderboard: Trophy, star: Star, done: Check, tx: ExternalLink, launch: Rocket, cargo: Package,
  tee: ShieldCheck, ai: Cpu, rule: Bot, council: Landmark, gauge: Gauge, feed: Activity, pilots: Users, info: Info, close: X, next: ChevronRight,
  soundOn: Volume2, soundOff: VolumeX, profit: CircleDollarSign, energy: Zap, arrow: ArrowRight,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;

/** <Icon name="ore" size={14} /> — any semantic icon, defaults 16px, stroke 1.5. */
export function Icon({ name, size = 16, strokeWidth = 1.5, className, ...rest }: { name: IconName } & Omit<LucideProps, "name">) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={strokeWidth} className={className ? `ui-icon ${className}` : "ui-icon"} aria-hidden {...rest} />;
}

/** Good glyph by good id ("ore" | "parts" | "fuel" | "gold"). Unknown ids render nothing. */
export function GoodIcon({ good, size = 14, ...rest }: { good: string } & Omit<LucideProps, "name">) {
  if (!(good in ICONS)) return null;
  return <Icon name={good as IconName} size={size} {...rest} />;
}
