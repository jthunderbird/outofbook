// The player's credits, small, for the corner of every screen's top bar.
import { Coins } from "lucide-react";
import { CURRENCY } from "../economy";
import { useProfile } from "../profile";

export function Wallet() {
  const p = useProfile();
  return (
    <span className="wallet" title={CURRENCY.many} data-testid="wallet">
      <Coins size={14} /> {p.credits.toLocaleString("en-US")}
    </span>
  );
}
