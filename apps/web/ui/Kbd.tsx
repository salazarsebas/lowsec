import type { ReactNode } from "react";
/** Keybind chip, e.g. <Kbd>E</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}
