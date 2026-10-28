// A tribe's name as its banner: the tribe's logo where it has one, otherwise
// its name in a styled title.
import { TRIBES } from "@outofbook/legions/tribes";

const LOGOS = import.meta.glob<string>("../assets/logos/*.webp", { eager: true, query: "?url", import: "default" });

export function TribeBanner({ tribe, on }: { tribe: string; on?: boolean }) {
  const logo = LOGOS[`../assets/logos/${tribe}.webp`];
  const name = TRIBES[tribe]?.name ?? tribe;
  return <div className={`tribe-banner${on ? " on" : ""}`}>{logo ? <img src={logo} alt={name} /> : <span className={`tribe-title t-${tribe}`}>{name.replace(/^The /, "")}</span>}</div>;
}
