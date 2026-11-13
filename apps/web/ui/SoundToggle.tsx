"use client";
import { useEffect, useState } from "react";
import { onSoundChange, setSound, soundOn } from "@/lib/sound";
import { Icon } from "./icons";

/** Mute toggle (sound is on by default, starts after the first interaction). */
export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => (setOn(soundOn), onSoundChange(setOn)), []);
  return (
    <button className={className ? `ui-btn ghost sound-toggle ${className}` : "ui-btn ghost sound-toggle"} title={on ? "Mute sound" : "Unmute sound"} aria-label={on ? "Mute sound" : "Unmute sound"} aria-pressed={on} onClick={() => setSound(!on)}>
      <Icon name={on ? "soundOn" : "soundOff"} size={16} />
    </button>
  );
}
