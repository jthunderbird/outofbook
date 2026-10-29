// The Store: everything that can be bought with credits, laid out like a shop
// (a card for each product under its section, with its price). Products and
// prices are in economy.ts. Items already owned stay on the shelf, marked.
import { useState } from "react";
import { shelfArt } from "@outofbook/legions/collection";
import type { Screen } from "../App";
import { PRODUCTS, money, price, type Product } from "../economy";
import { buy, owns, useProfile } from "../profile";
import { Wallet } from "../components/Wallet";
import { ArrowLeft, Check, Coins, Lightbulb, RotateCcw, ShoppingCart, Undo2 } from "lucide-react";

const SECTIONS = ["Skins", "Finishes", "Colors", "Charges"] as const;
const PERK_ICON = { hint: Lightbulb, takeback: Undo2, retry: RotateCcw };

export function Store({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  const [ask, setAsk] = useState<Product | null>(null);
  const [bought, setBought] = useState<Product | null>(null);
  const have = (x: Product) => !!x.item && owns(p, x.item);

  const confirm = () => {
    if (ask && buy(ask)) setBought(ask);
    setAsk(null);
  };

  return (
    <div className="screen store" data-testid="store">
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "home" })} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2>
          <ShoppingCart size={22} style={{ verticalAlign: -3 }} /> Store
        </h2>
        <div className="spacer" />
        <Wallet />
      </div>

      {SECTIONS.map((section) => (
        <section key={section} className="store-section">
          <h3>{section}</h3>
          <div className="store-grid">
            {PRODUCTS.filter((x) => x.section === section).map((x) => {
              const art = x.item ? shelfArt(x.item.startsWith("mode:") ? `court:${x.item.slice(5)}` : x.item) : undefined;
              const Perk = x.perk ? PERK_ICON[x.perk.id] : null;
              const owned = have(x);
              const afford = p.credits >= price(x);
              return (
                <button key={x.id} className={`product${owned ? " owned" : ""}`} disabled={owned} onClick={() => setAsk(x)} data-testid={`product-${x.id}`}>
                  <span className="product-art">
                    {art ? <img src={art} alt="" /> : Perk ? <Perk size={44} /> : null}
                    {x.perk && <span className="badge">{p.perks[x.perk.id]}</span>}
                  </span>
                  <span className="product-name">{x.name}</span>
                  <span className="product-blurb">{x.blurb}</span>
                  <span className={`product-price${owned ? " got" : afford ? "" : " short"}`}>
                    {owned ? (
                      <>
                        <Check size={14} /> Owned
                      </>
                    ) : (
                      <>
                        <Coins size={14} /> {price(x).toLocaleString("en-US")}
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {ask && (
        <div className="overlay" onClick={() => setAsk(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2>{ask.name}</h2>
            <p className="muted">{ask.blurb}</p>
            {p.credits >= price(ask) ? (
              <p>
                Buy for <b style={{ color: "var(--gold)" }}>{money(price(ask))}</b>? You will have {money(p.credits - price(ask))} left.
              </p>
            ) : (
              <p>
                You need <b style={{ color: "var(--bad)" }}>{money(price(ask) - p.credits)}</b> more. Win games and pass puzzles to earn them.
              </p>
            )}
            <div className="row-btns">
              <button className="btn dark small" onClick={() => setAsk(null)}>
                {p.credits >= price(ask) ? "Not now" : "Close"}
              </button>
              {p.credits >= price(ask) && (
                <button className="btn gold small" onClick={confirm} data-testid="confirm-buy">
                  Buy
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {bought && (
        <div className="overlay" onClick={() => setBought(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2>Bought!</h2>
            <p>{bought.item ? `${bought.name} is in your Collection.` : `${bought.name} added.`}</p>
            <div className="row-btns">
              {bought.item && (
                <button className="btn green small" onClick={() => go({ name: "collection" })}>
                  Collection
                </button>
              )}
              <button className="btn gold small" onClick={() => setBought(null)}>
                Keep shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
