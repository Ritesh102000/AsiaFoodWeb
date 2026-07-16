"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, CircleHelp,
  Headphones, House, Mail, MapPin, Minus, PackageCheck, Phone, Plus, Search,
  Send, ShoppingBag, ShoppingBasket, Sparkles, Store, Truck, X,
} from "lucide-react";
import productsData from "@/backend/data/afc/products.json";
import categoriesData from "@/backend/data/afc/categories.json";
import locationsData from "@/backend/data/afc/locations.json";
import knowledgeData from "@/backend/data/afc/knowledge_base.json";

type Product = (typeof productsData)[number];
type CartLine = { product: Product; quantity: number };
type ChatResult = {
  answer: string;
  sources: Array<{ id: string; source_type: string; title: string; snippet: string; url?: string }>;
  product_cards: Product[];
  confidence: string;
};
type ChatMessage = { role: "user"; text: string } | { role: "assistant"; result: ChatResult };

// Local development sets an explicit API origin. An empty production value
// keeps requests same-origin when frontend and API share a custom domain.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Assets reused verbatim from the existing afcgrocery.com website.
const LOGO = "https://afcgrocery.com/themes/asianfood/images/asian-food-centre-logo.jpg";
const HERO_PHOTO = "https://afcgrocery.com/storage/slider_images/Asian%20Food%20Centre/0wYsk9vYDanQxFgw0drEat8i2CsaaAFFL4wOuBb4.jpg";
const PLACEHOLDER = "https://afcgrocery.com/themes/asianfood/images/products/place_holder.png";
const EMPTY_BASKET = "https://afcgrocery.com/themes/asianfood/images/basket-empty.png";
const PAY_VISA = "https://afcgrocery.com/themes/asianfood/images/footer/visa.png";
const PAY_MASTER = "https://afcgrocery.com/themes/asianfood/images/footer/master.png";
const APP_STORE = "https://afcgrocery.com/themes/asianfood/images/app-store.png";
const PLAY_STORE = "https://afcgrocery.com/themes/asianfood/images/play-store.png";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const usableProducts = productsData.filter(product => Number(product.price_cad) > 0 && !product.image_url.includes("place_holder"));
const marqueeProducts = usableProducts.slice(0, 16);
const heroTiles = [27803, 34126].map(id => usableProducts.find(product => product.id === id)).filter(Boolean) as Product[];

function searchProducts(needle: string, source: Product[] = productsData): Product[] {
  const words = needle.toLowerCase().split(/[^a-z0-9.]+/).filter(word => word.length > 2);
  if (!words.length) return source;
  return source
    .map(product => {
      const hay = `${product.name} ${product.unit} ${product.collections.join(" ")}`.toLowerCase();
      const score = words.reduce((sum, word) => sum + (hay.includes(word) || hay.includes(word.replace(/s$/, "")) ? 1 : 0), 0);
      return { product, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.product);
}

function useCart() {
  const [cart, setCart] = useState<CartLine[]>([]);
  useEffect(() => {
    try { setCart(JSON.parse(localStorage.getItem("afc-demo-cart") || "[]")); } catch { setCart([]); }
  }, []);
  useEffect(() => { localStorage.setItem("afc-demo-cart", JSON.stringify(cart)); }, [cart]);
  const add = (product: Product) => {
    setCart(current => {
      const existing = current.find(line => line.product.id === product.id);
      return existing
        ? current.map(line => line.product.id === product.id ? { ...line, quantity: Math.min(line.quantity + 1, product.order_limit || 20) } : line)
        : [...current, { product, quantity: 1 }];
    });
    window.dispatchEvent(new CustomEvent("afc-cart-added", { detail: product.name }));
  };
  const update = (id: number, quantity: number) => setCart(current => current.flatMap(line => line.product.id === id ? (quantity > 0 ? [{ ...line, quantity: Math.min(quantity, line.product.order_limit || 20) }] : []) : [line]));
  const qty = (id: number) => cart.find(line => line.product.id === id)?.quantity || 0;
  return { cart, add, update, qty, clear: () => setCart([]), count: cart.reduce((sum, line) => sum + line.quantity, 0), subtotal: cart.reduce((sum, line) => sum + line.product.price_cad * line.quantity, 0) };
}

function useReveal(route: string) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("revealed"); observer.unobserve(entry.target); }
    }), { threshold: 0.08, rootMargin: "0px 0px -5% 0px" });
    document.querySelectorAll("[data-reveal]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [route]);
}

const openChat = (question?: string) => window.dispatchEvent(new CustomEvent("open-afc-chat", { detail: question }));

/* ---------- small presentational pieces ---------------------------------- */

function Underline() {
  return <svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true"><path d="M3 8.5 Q 32 2.5 62 7.5 T 117 6" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" /></svg>;
}

function Fringe({ tone = "" }: { tone?: string }) {
  return <div className={`fringe ${tone}`} aria-hidden="true" />;
}

function Ticker() {
  const items = [
    "Free delivery on orders over $99",
    "8 stores across the GTA",
    "Fresh produce · halal meat · sweets & takeaway",
    "Weekly in-store specials",
    "Call us: (416) 740-3262",
  ];
  return (
    <div className="ticker" role="marquee" aria-label="Store announcements">
      <div className="ticker-track">
        {[...items, ...items].map((item, index) => <span key={index} aria-hidden={index >= items.length || undefined}>{item}</span>)}
      </div>
    </div>
  );
}

/* ---------- header / navigation ------------------------------------------- */

function SearchField({ mobile = false, autoQuery = "" }: { mobile?: boolean; autoQuery?: string }) {
  const [term, setTerm] = useState(autoQuery);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    location.href = term.trim() ? `/shop?q=${encodeURIComponent(term.trim())}` : "/shop";
  };
  return (
    <form className={mobile ? "header-search mobile-search" : "header-search"} onSubmit={submit} role="search">
      <Search size={17} aria-hidden="true" />
      <input value={term} onChange={event => setTerm(event.target.value)} placeholder="Search atta, masala, pickles…" aria-label="Search products" />
      <button type="submit" aria-label="Search"><ArrowRight size={16} /></button>
    </form>
  );
}

function Header({ count, onCart }: { count: number; onCart: () => void }) {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Ticker />
      <div className="site-top">
        <header className="site-header">
          <a className="brand" href="/" aria-label="Asian Food Centre home"><img src={LOGO} alt="Asian Food Centre" /></a>
          <SearchField />
          <div className="header-actions">
            <button className="ask-pill" onClick={() => openChat()}><Sparkles size={16} /><span>Ask AFC</span></button>
            <button className="basket-btn" onClick={onCart} aria-label={`Open basket with ${count} items`}>
              <ShoppingBag size={17} /><span className="label">Basket</span><b key={count}>{count}</b>
            </button>
          </div>
        </header>
        <div className="mobile-search-bar"><SearchField mobile /></div>
        <nav className="subnav" aria-label="Main navigation">
          <a href="/shop">Shop all</a>
          <a href="/shop?collection=new">New arrivals</a>
          <a href="/shop?collection=best_seller">Best sellers</a>
          <a className="hot" href="/shop?collection=featured">Weekly picks</a>
          <a href="/locations">Our 8 stores</a>
          <a href="/policies">Help & policies</a>
        </nav>
        <Fringe />
      </div>
    </>
  );
}

function TabBar({ page, count, onCart }: { page: string; count: number; onCart: () => void }) {
  return (
    <nav className="tabbar" aria-label="Quick navigation">
      <a href="/" className={page === "home" ? "on" : ""}><House size={20} />Home</a>
      <a href="/shop" className={page === "shop" || page === "product" ? "on" : ""}><ShoppingBasket size={20} />Shop</a>
      <button className="tab-ask" onClick={() => openChat()} aria-label="Ask the AFC Assistant"><span><Sparkles size={21} /></span>Ask AFC</button>
      <a href="/locations" className={page === "locations" ? "on" : ""}><MapPin size={20} />Stores</a>
      <button onClick={onCart} className={page === "cart" ? "on" : ""} aria-label={`Open basket with ${count} items`}>
        {count > 0 && <span className="tab-badge">{count}</span>}
        <ShoppingBag size={20} />Basket
      </button>
    </nav>
  );
}

/* ---------- product building blocks ---------------------------------------- */

function ProductCard({ product, add, update, qty }: { product: Product; add: (product: Product) => void; update: (id: number, quantity: number) => void; qty: number }) {
  const price = Number(product.special_price_cad) > 0 ? Number(product.special_price_cad) : Number(product.price_cad);
  const hasSale = Number(product.special_price_cad) > 0 && Number(product.special_price_cad) < Number(product.price_cad);
  const purchasable = product.in_stock && price > 0;
  return (
    <article className="product-card">
      <a className="product-media" href={`/product/${product.id}`}>
        <img src={product.image_url} alt={product.name} loading="lazy" onError={event => { event.currentTarget.src = PLACEHOLDER; }} />
        {hasSale ? <span className="badge red">Special</span> : product.collections.includes("new") ? <span className="badge gold">New</span> : product.collections.includes("best_seller") && <span className="badge red">Loved</span>}
        {!product.in_stock && <span className="badge dark">Out of stock</span>}
        <span className="product-view">View <ChevronRight size={13} /></span>
      </a>
      <div className="product-body">
        <p className="unit">{product.unit || "Unit not listed"}</p>
        <a href={`/product/${product.id}`}><h3>{product.name}</h3></a>
        <div className="price-row">
          <div className="price">
            {price > 0
              ? <><strong>{money.format(price)}</strong>{hasSale && <del>{money.format(product.price_cad)}</del>}</>
              : <span className="check-price">Check price in store</span>}
          </div>
          {qty > 0
            ? <div className="stepper" aria-label={`${product.name} quantity`}>
                <button onClick={() => update(product.id, qty - 1)} aria-label={`Decrease ${product.name}`}><Minus size={14} /></button>
                <span>{qty}</span>
                <button onClick={() => update(product.id, qty + 1)} aria-label={`Increase ${product.name}`}><Plus size={14} /></button>
              </div>
            : <button className="add-btn" onClick={() => add(product)} disabled={!purchasable} aria-label={purchasable ? `Add ${product.name} to basket` : `${product.name} unavailable`}>
                <Plus size={16} /><span className="add-label">Add</span>
              </button>}
        </div>
      </div>
    </article>
  );
}

type CartOps = { add: (product: Product) => void; update: (id: number, quantity: number) => void; qty: (id: number) => number };

function ProductSection({ title, eyebrow, sub, products, ops }: { title: string; eyebrow: string; sub: string; products: Product[]; ops: CartOps }) {
  return (
    <section className="section tight">
      <div className="section-inner">
        <div className="section-head" data-reveal>
          <div><p className="kicker">{eyebrow}</p><h2>{title}</h2><p className="sub">{sub}</p></div>
          <a className="text-link" href="/shop">View all products <ArrowRight size={16} /></a>
        </div>
        <div className="products-grid" data-reveal>
          {products.map(product => <ProductCard key={product.id} product={product} add={ops.add} update={ops.update} qty={ops.qty(product.id)} />)}
        </div>
      </div>
    </section>
  );
}

function ProductMarquee() {
  return (
    <div className="marquee" aria-label="Products rolling off our shelves">
      <div className="marquee-track">
        {[...marqueeProducts, ...marqueeProducts].map((product, index) => {
          const duplicate = index >= marqueeProducts.length;
          return (
            <a className="marquee-tile" href={`/product/${product.id}`} key={`${product.id}-${index}`} aria-hidden={duplicate || undefined} tabIndex={duplicate ? -1 : undefined}>
              <img src={product.image_url} alt="" loading="lazy" />
              <span>{product.name}</span>
              <b>{money.format(product.price_cad)}</b>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function CategoryRail() {
  const rail = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => rail.current?.scrollBy({ left: direction * Math.min(720, rail.current.clientWidth), behavior: "smooth" });
  return (
    <section className="section">
      <div className="section-inner">
        <div className="section-head" data-reveal>
          <div><p className="kicker">Shop the aisles</p><h2>From pantry to plate</h2><p className="sub">All 508 aisles of the AFC catalog, from atta and dals to sweets and pooja essentials.</p></div>
          <div className="rail-arrows">
            <button onClick={() => scroll(-1)} aria-label="Scroll categories left"><ChevronLeft size={19} /></button>
            <button onClick={() => scroll(1)} aria-label="Scroll categories right"><ChevronRight size={19} /></button>
          </div>
        </div>
        <div className="rail" ref={rail} data-reveal>
          {categoriesData.map(category => (
            <a className="cat-card" href={`/shop?category=${category.slug}`} key={category.id}>
              <span className="cat-icon">{category.image_url ? <img src={category.image_url} alt="" loading="lazy" /> : <span>{category.name.charAt(0)}</span>}</span>
              <strong>{category.name}</strong>
              <small>{category.children.length ? `${category.children.length} collections` : "Explore aisle"}</small>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function AwningBand() {
  return (
    <>
      <section className="awning-band">
        <div className="awning-inner">
          <div><span className="ico"><Truck size={23} /></span><h3>Free delivery over $99</h3><p>More groceries, zero delivery fee across the GTA</p></div>
          <div><span className="ico"><PackageCheck size={23} /></span><h3>Online order pickup</h3><p>Order ahead and collect from your closest AFC</p></div>
          <div><span className="ico"><Store size={23} /></span><h3>Eight local stores</h3><p>Brampton, Etobicoke and Mississauga neighbours</p></div>
        </div>
      </section>
      <Fringe />
    </>
  );
}

/* ---------- home page -------------------------------------------------------- */

function Hero() {
  return (
    <section className="hero">
      <div className="hero-grid">
        <div className="hero-copy">
          <span className="sticker"><Sparkles size={14} /> Your neighbourhood Desi market</span>
          <h1>One-stop for the <span className="hand">flavours of home<Underline /></span></h1>
          <p className="lede">Fresh produce, fresh &amp; marinated meat, pantry staples, sweets and takeaway favourites — extensive variety at competitively low prices, the way your family shops.</p>
          <div className="hero-ctas">
            <a className="btn" href="/shop">Shop the aisles <ArrowRight size={17} /></a>
            <button className="text-btn" onClick={() => openChat()}><Sparkles size={16} /> Ask the AFC Assistant</button>
          </div>
          <div className="popular">
            <span>Popular</span>
            <a href="/shop?q=tea">Tea</a><a href="/shop?q=rice">Rice</a><a href="/shop?q=pickle">Pickles</a><a href="/shop?q=atta">Atta</a><a href="/shop?q=juice">Juice</a>
          </div>
          <div className="hero-proof">
            <span><b>8</b> GTA stores</span>
            <span><b>508</b> catalog aisles</span>
            <span><b>100</b> products in this demo</span>
          </div>
        </div>
        <div className="hero-bento">
          <figure className="bento-photo" style={{ backgroundImage: `url("${HERO_PHOTO}")` }} role="img" aria-label="AFC groceries delivered to your door">
            <div className="round-sticker"><i /><span>Free delivery over $99</span></div>
            <figcaption><small>Groceries to your door</small><strong>Or pick up from your local AFC</strong></figcaption>
          </figure>
          {heroTiles.map(product => (
            <a className="bento-product" href={`/product/${product.id}`} key={product.id}>
              <small className="tag">{product.collections.includes("featured") ? "Weekly pick" : "In the basket"}</small>
              <img src={product.image_url} alt={product.name} />
              <strong>{product.name}</strong>
              <span className="price-tag"><b>{money.format(product.price_cad)}</b><i><Plus size={16} /></i></span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function AiShowcase() {
  const limca = productsData.find(product => product.id === 27580);
  const pickle = productsData.find(product => product.id === 34126);
  return (
    <section className="section">
      <div className="ai-panel" data-reveal>
        <div className="ai-copy">
          <p className="kicker"><Sparkles size={15} /> Meet the AFC Assistant</p>
          <h2>One question.<br /><em>Two trusted sources.</em></h2>
          <p>Ask compound questions in plain language. The assistant checks live catalog facts in PostgreSQL, blends them with policy answers from the AFC knowledge base, and cites where every claim came from.</p>
          <div className="truths">
            <div><span><PackageCheck size={20} /></span><p><b>Product database</b><small>Prices, stock, sizes and collections</small></p></div>
            <div><span><CircleHelp size={20} /></span><p><b>AFC knowledge base</b><small>Policies, delivery, pickup and stores</small></p></div>
          </div>
          <div className="ai-ctas">
            <button className="btn light" onClick={() => openChat()}>Try the assistant <Sparkles size={16} /></button>
            <button className="text-btn cream" onClick={() => openChat("Where are the Brampton stores?")}>Find my store</button>
          </div>
        </div>
        <div>
          <div className="chat-mock" aria-hidden="true">
            <div className="chat-mock-head">
              <span><Sparkles size={20} /></span>
              <div><b>AFC Assistant</b><small><i /> Grounded in verified store data</small></div>
              <em>AI</em>
            </div>
            <div className="mock-user">Which drinks are under $5 — and can sale items be returned?</div>
            <div className="mock-answer">
              <span><Sparkles size={15} /></span>
              <div>
                <p>Limca Indian is $1.99 in the current catalog. On returns: sale purchases are final sale, so check with store management for exceptions.</p>
                <div className="mock-products">
                  {limca && <a href={`/product/${limca.id}`}><img src={limca.image_url} alt="" /><b>{limca.name}</b><small>{money.format(limca.price_cad)}</small></a>}
                  {pickle && <a href={`/product/${pickle.id}`}><img src={pickle.image_url} alt="" /><b>{pickle.name}</b><small>{money.format(pickle.price_cad)}</small></a>}
                </div>
                <div className="mock-sources"><span><Check size={12} /> Catalog</span><span><Check size={12} /> Returns policy</span></div>
              </div>
            </div>
          </div>
          <div className="mock-try">
            <button onClick={() => openChat("Which products are under $5 and can sale items be returned?")}>Try: under $5 + returns</button>
            <button onClick={() => openChat("Is delivery free and what pickup options are available?")}>Try: delivery + pickup</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Story() {
  return (
    <section className="story section">
      <div className="story-inner" data-reveal>
        <span className="sticker green flat"><Store size={14} /> The AFC promise</span>
        <h2>A bigger table starts with <span className="hand">better choices<Underline /></span>.</h2>
        <p>Asian Food Centre brings produce, groceries, meat, sweets and takeaway favourites together under one roof — quality and extensive variety, in a clean and spacious one-stop shop, at competitively low prices.</p>
        <div className="story-stats">
          <div><b>6</b><span>Brampton stores</span></div>
          <div><b>1</b><span>Etobicoke store</span></div>
          <div><b>1</b><span>Mississauga store</span></div>
        </div>
        <a className="text-link" href="/locations">Find your nearest store <ArrowRight size={16} /></a>
      </div>
    </section>
  );
}

function StoresRail() {
  return (
    <section className="section tight" style={{ background: "var(--paper-2)", borderBlock: "1px solid var(--line)" }}>
      <div className="section-inner">
        <div className="section-head" data-reveal>
          <div><p className="kicker">Closer than you think</p><h2>Eight stores. One AFC family.</h2></div>
          <a className="text-link" href="/locations">All locations <ArrowRight size={16} /></a>
        </div>
        <div className="rail" data-reveal>
          {locationsData.map((store, index) => (
            <article className="store-card" key={store.address}>
              <span className="index">{String(index + 1).padStart(2, "0")}</span>
              <span className="city-chip">{store.city}</span>
              <h3>{store.address}</h3>
              <a className="phone" href={`tel:${store.phone}`}><Phone size={14} /> {store.phone}</a>
              <p className="fax">Local AFC grocery store</p>
              <a className="text-link" href={`https://maps.google.com/?q=${encodeURIComponent(store.address)}`} target="_blank" rel="noreferrer">Directions <ArrowUpRight size={15} /></a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqTeaser() {
  const topics = ["delivery", "pickup", "returns"];
  const facts = knowledgeData.facts.filter(fact => topics.includes(fact.topic));
  return (
    <section className="section">
      <div className="section-inner faq-split">
        <div className="section-head" data-reveal>
          <div>
            <p className="kicker">Straight answers</p>
            <h2>Good to know before you shop</h2>
            <p className="sub">Sourced from AFC’s public website — and always one question away in the assistant.</p>
          </div>
          <a className="text-link" href="/policies">All help &amp; policies <ArrowRight size={16} /></a>
        </div>
        <div data-reveal>
          {facts.map((fact, index) => (
            <details className="faq-item" open={index === 0} key={fact.topic}>
              <summary><span className="num">{String(index + 1).padStart(2, "0")}</span><h3>{fact.topic.replaceAll("_", " ")}</h3><span className="plus">+</span></summary>
              <div className="faq-body">{fact.answer}<br /><a href={fact.source_urls[0]} target="_blank" rel="noreferrer">View source <ArrowUpRight size={12} /></a></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Home({ ops }: { ops: CartOps }) {
  const fresh = usableProducts.filter(product => product.collections.includes("featured") || product.collections.includes("new")).slice(0, 8);
  const loved = usableProducts.filter(product => product.collections.includes("best_seller")).slice(0, 8);
  return (
    <main>
      <Hero />
      <ProductMarquee />
      <CategoryRail />
      <AwningBand />
      <ProductSection title="Fresh arrivals" eyebrow="New & noteworthy" sub="Hand-picked from this week’s AFC catalog snapshot." products={fresh} ops={ops} />
      <AiShowcase />
      <ProductSection title="Everyday favourites" eyebrow="What shoppers love" sub="The best sellers your neighbours keep coming back for." products={loved} ops={ops} />
      <Story />
      <StoresRail />
      <FaqTeaser />
    </main>
  );
}

/* ---------- shop --------------------------------------------------------------- */

function Shop({ ops }: { ops: CartOps }) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("");
  const [collection, setCollection] = useState("");
  const [stock, setStock] = useState(false);
  const [sort, setSort] = useState("featured");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuery(params.get("q") || "");
    setCollection(params.get("collection") || "");
    const slug = params.get("category");
    if (slug) setChip(categoriesData.find(category => category.slug === slug)?.name || slug.replaceAll("-", " "));
  }, []);
  const list = useMemo(() => {
    const needle = query.trim() || chip;
    let result = searchProducts(needle);
    if (collection) result = result.filter(product => product.collections.includes(collection));
    if (stock) result = result.filter(product => product.in_stock);
    if (sort === "low") result = [...result].sort((a, b) => (a.price_cad || Number.MAX_VALUE) - (b.price_cad || Number.MAX_VALUE));
    if (sort === "high") result = [...result].sort((a, b) => b.price_cad - a.price_cad);
    if (sort === "name") result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [query, chip, collection, stock, sort]);
  return (
    <main className="page-shell">
      <section className="page-hero compact">
        <div className="section-inner">
          <span className="sticker green flat">100 products · live prototype</span>
          <h1><span className="hand">Find your favourites<Underline /></span></h1>
        </div>
      </section>
      <div className="catalog-toolbar">
        <div className="toolbar-row">
          <label className="header-search" style={{ display: "flex", maxWidth: "none" }}>
            <Search size={17} aria-hidden="true" />
            <input value={query} onChange={event => { setQuery(event.target.value); setChip(""); }} placeholder="Search rice, tea, pickles…" aria-label="Search the catalog" />
            <button type="button" aria-hidden="true" tabIndex={-1}><ArrowRight size={16} /></button>
          </label>
          <label className="stock-toggle"><input type="checkbox" checked={stock} onChange={event => setStock(event.target.checked)} /> In stock only</label>
          <select className="sort-select" value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort products">
            <option value="featured">Featured</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        <div className="chip-rail" role="tablist" aria-label="Departments">
          <button className={!chip && !query ? "chip on" : "chip"} onClick={() => { setChip(""); setQuery(""); }}>All aisles</button>
          {categoriesData.map(category => (
            <button key={category.id} className={chip === category.name ? "chip on" : "chip"} onClick={() => { setChip(category.name); setQuery(""); }}>{category.name}</button>
          ))}
        </div>
      </div>
      <div className="catalog-body">
        <div className="result-count">
          <strong>{list.length}</strong> matches
          {collection && <button onClick={() => setCollection("")}>Clear “{collection.replaceAll("_", " ")}” ×</button>}
          {chip && <button onClick={() => setChip("")}>Clear “{chip}” ×</button>}
          {query && <button onClick={() => setQuery("")}>Clear “{query}” ×</button>}
        </div>
        <div className="section-inner">
          {list.length
            ? <div className="products-grid">{list.map(product => <ProductCard key={product.id} product={product} add={ops.add} update={ops.update} qty={ops.qty(product.id)} />)}</div>
            : <div className="empty-state">
                <img src={EMPTY_BASKET} alt="" />
                <h2>No exact match on this shelf</h2>
                <p>Try a broader product name — or ask the assistant, it knows the whole catalog.</p>
                <button className="btn deep" onClick={() => openChat(query ? `Do you have ${query}?` : undefined)}>Ask the AFC Assistant <Sparkles size={15} /></button>
              </div>}
        </div>
      </div>
    </main>
  );
}

/* ---------- product detail -------------------------------------------------------- */

function ProductPage({ id, ops }: { id: number; ops: CartOps }) {
  const product = productsData.find(item => item.id === id);
  if (!product) return <NotFound />;
  const purchasable = product.in_stock && Number(product.price_cad) > 0;
  const quantity = ops.qty(product.id);
  const returns = knowledgeData.facts.find(fact => fact.topic === "returns");
  const availability = knowledgeData.facts.find(fact => fact.topic === "product_availability");
  const related = productsData.filter(item => item.id !== id && item.price_cad > 0 && item.collections.some(collectionName => product.collections.includes(collectionName))).slice(0, 4);
  return (
    <main className="page-shell">
      <div className="detail-wrap">
        <p className="breadcrumbs"><a href="/">Home</a> / <a href="/shop">Shop</a> / {product.name}</p>
        <div className="detail-grid">
          <div className="detail-media">
            <span className={`badge ${product.collections.includes("new") ? "gold" : "red"}`}>{(product.collections[0] || "catalog").replaceAll("_", " ")}</span>
            <img src={product.image_url} alt={product.name} onError={event => { event.currentTarget.src = PLACEHOLDER; }} />
          </div>
          <div className="detail-copy">
            <p className="eyebrow">{product.unit || "Unit not listed"}</p>
            <h1>{product.name}</h1>
            <div className="detail-price">
              {product.price_cad > 0 ? <><strong>{money.format(product.price_cad)}</strong><span>CAD · {product.unit || "per unit"}</span></> : <strong>Check current price</strong>}
            </div>
            <p className={product.in_stock ? "stock-pill yes" : "stock-pill no"}><i />{product.in_stock ? "In stock in the catalog snapshot" : "Out of stock"}</p>
            <p className="detail-desc">AFC Grocery catalog item. Price and availability come from a dated prototype snapshot — confirm against the live store before you shop.</p>
            <div className="buy-row">
              {quantity > 0
                ? <><div className="stepper">
                      <button onClick={() => ops.update(product.id, quantity - 1)} aria-label="Decrease quantity"><Minus size={16} /></button>
                      <span>{quantity}</span>
                      <button onClick={() => ops.update(product.id, quantity + 1)} aria-label="Increase quantity"><Plus size={16} /></button>
                    </div>
                    <a className="btn" href="/cart">Review basket <ArrowRight size={16} /></a></>
                : <button className="btn wide" onClick={() => ops.add(product)} disabled={!purchasable}>{purchasable ? <>Add to basket <Plus size={17} /></> : "Unavailable for the demo basket"}</button>}
            </div>
            <div className="detail-notes">
              <div><b>Order limit</b><span>Up to {product.order_limit || 5} per order</span></div>
              <div><b>Store source</b><a href={product.product_url} target="_blank" rel="noreferrer">View original listing <ArrowUpRight size={12} /></a></div>
            </div>
            <div className="detail-facts">
              {availability && <details className="faq-item"><summary><h3>Availability &amp; pricing</h3><span className="plus">+</span></summary><div className="faq-body">{availability.answer}</div></details>}
              {returns && <details className="faq-item"><summary><h3>Return policy</h3><span className="plus">+</span></summary><div className="faq-body">{returns.answer}</div></details>}
            </div>
          </div>
        </div>
      </div>
      {purchasable && quantity === 0 && (
        <div className="buy-bar">
          <strong>{money.format(product.price_cad)}</strong>
          <button className="add-btn" onClick={() => ops.add(product)}><Plus size={16} /> Add to basket</button>
        </div>
      )}
      <ProductSection title="You may also like" eyebrow="Keep exploring" sub="More from the same aisles of the catalog." products={related} ops={ops} />
    </main>
  );
}

/* ---------- locations / policies ----------------------------------------------------- */

function LocationsPage() {
  const cities = Array.from(new Set(locationsData.map(store => store.city)));
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="section-inner">
          <span className="sticker flat"><MapPin size={13} /> Closer than you think</span>
          <h1>Eight stores. <span className="hand">One AFC family<Underline /></span>.</h1>
          <p>Find Asian Food Centre across Brampton, Etobicoke and Mississauga — same fresh aisles, same fair prices, same familiar welcome.</p>
        </div>
      </section>
      <section className="section tight">
        <div className="section-inner">
          {cities.map(city => {
            const stores = locationsData.filter(store => store.city === city);
            return (
              <div key={city}>
                <div className="city-head"><h2>{city}</h2><small>{stores.length} {stores.length > 1 ? "stores" : "store"}</small></div>
                <div className="locations-grid">
                  {stores.map((store, index) => (
                    <article className="store-card" key={store.address}>
                      <span className="index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="city-chip">{store.city}</span>
                      <h3>{store.address}</h3>
                      <a className="phone" href={`tel:${store.phone}`}><Phone size={14} /> {store.phone}</a>
                      {store.fax?.length > 0 && <p className="fax">Fax: {store.fax.join(" · ")}</p>}
                      <a className="text-link" href={`https://maps.google.com/?q=${encodeURIComponent(store.address)}`} target="_blank" rel="noreferrer">Open directions <ArrowUpRight size={15} /></a>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="cta-band" data-reveal>
            <div><p className="kicker">Questions about a store?</p><h2>People nearby, happy to help.</h2></div>
            <div>
              <a className="btn light" href="tel:+14167403262"><Headphones size={17} /> (416) 740-3262</a>
              <button className="btn deep" onClick={() => openChat("Where are the AFC stores?")}>Ask the assistant <Sparkles size={15} /></button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function PoliciesPage() {
  const order = ["delivery", "pickup", "returns", "contact", "product_availability", "careers"];
  const featured = order.map(topic => knowledgeData.facts.find(fact => fact.topic === topic)).filter(Boolean) as typeof knowledgeData.facts;
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="section-inner">
          <span className="sticker flat"><CircleHelp size={13} /> Straight answers</span>
          <h1>Shopping help &amp; <span className="hand">policies<Underline /></span></h1>
          <p>Clear guidance, sourced from AFC’s public website. When something is marked “coming soon”, we say so.</p>
        </div>
      </section>
      <section className="section tight">
        <div className="section-inner" style={{ maxWidth: 880 }}>
          {featured.map((fact, index) => (
            <details className="faq-item" open={index === 0} key={fact.topic}>
              <summary><span className="num">{String(index + 1).padStart(2, "0")}</span><h3>{fact.topic.replaceAll("_", " ")}</h3><span className="plus">+</span></summary>
              <div className="faq-body">{fact.answer}<br /><a href={fact.source_urls[0]} target="_blank" rel="noreferrer">View source <ArrowUpRight size={12} /></a></div>
            </details>
          ))}
          <div className="cta-band" data-reveal>
            <div><p className="kicker">Still stuck?</p><h2>Ask a person — or the assistant.</h2></div>
            <div>
              <button className="btn light" onClick={() => openChat()}>Ask the AFC Assistant <Sparkles size={15} /></button>
              <a className="btn deep" href="mailto:info@afcgrocery.com"><Mail size={16} /> info@afcgrocery.com</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ---------- cart / checkout / confirmation --------------------------------------------- */

function DeliveryMeter({ subtotal }: { subtotal: number }) {
  const remaining = Math.max(0, 99 - subtotal);
  return (
    <div className="delivery-meter">
      <div><Truck size={16} /><span>{remaining ? `${money.format(remaining)} away from free delivery` : "You unlocked free delivery"}</span></div>
      <i><b style={{ width: `${Math.min(100, (subtotal / 99) * 100)}%` }} /></i>
    </div>
  );
}

function CartPage({ cart, update, subtotal }: { cart: CartLine[]; update: (id: number, quantity: number) => void; subtotal: number }) {
  return (
    <main className="page-shell">
      <section className="page-hero compact">
        <div className="section-inner">
          <span className="sticker green flat">Demo basket</span>
          <h1>Review your picks</h1>
        </div>
      </section>
      <div className="cart-layout">
        <div className="cart-lines-page">
          {cart.length ? cart.map(line => (
            <div className="cart-row" key={line.product.id}>
              <a className="thumb" href={`/product/${line.product.id}`}><img src={line.product.image_url} alt="" /></a>
              <div>
                <h2>{line.product.name}</h2>
                <p className="unit">{line.product.unit || "Unit not listed"} · {money.format(line.product.price_cad)} each</p>
                <button className="remove" onClick={() => update(line.product.id, 0)}>Remove</button>
              </div>
              <div className="stepper">
                <button onClick={() => update(line.product.id, line.quantity - 1)} aria-label={`Decrease ${line.product.name}`}><Minus size={14} /></button>
                <span>{line.quantity}</span>
                <button onClick={() => update(line.product.id, line.quantity + 1)} aria-label={`Increase ${line.product.name}`}><Plus size={14} /></button>
              </div>
              <strong className="line-total">{money.format(line.product.price_cad * line.quantity)}</strong>
            </div>
          )) : (
            <div className="empty-state">
              <img src={EMPTY_BASKET} alt="" />
              <h2>Your demo basket is empty</h2>
              <p>Fill it with pantry staples, pickles and treats.</p>
              <a className="btn" href="/shop">Browse products <ArrowRight size={16} /></a>
            </div>
          )}
        </div>
        {cart.length > 0 && (
          <aside className="summary-card">
            <p className="eyebrow">Order summary</p>
            <DeliveryMeter subtotal={subtotal} />
            <div className="row"><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div>
            <div className="row"><span>Estimated delivery</span><strong>{subtotal >= 99 ? "Free" : money.format(9.99)}</strong></div>
            <hr />
            <div className="total"><span>Demo total</span><strong>{money.format(subtotal + (subtotal && subtotal < 99 ? 9.99 : 0))}</strong></div>
            <p className="note">No payment will be processed. Delivery eligibility must be confirmed with AFC.</p>
            <a className="btn wide" href="/checkout">Continue to checkout <ArrowRight size={16} /></a>
          </aside>
        )}
      </div>
    </main>
  );
}

function CheckoutPage({ cart, subtotal, clear }: { cart: CartLine[]; subtotal: number; clear: () => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clear();
    location.href = `/confirmation?ref=AFC-${Math.floor(1000 + Math.random() * 9000)}`;
  };
  if (!cart.length) return (
    <main className="page-shell">
      <div className="empty-state standalone">
        <img src={EMPTY_BASKET} alt="" />
        <h2>No items to check out</h2>
        <a className="btn" href="/shop">Return to shop</a>
      </div>
    </main>
  );
  return (
    <main className="page-shell">
      <section className="page-hero compact">
        <div className="section-inner">
          <span className="sticker flat">Simulation only</span>
          <h1>Demo checkout</h1>
        </div>
      </section>
      <div className="steps" aria-label="Checkout progress">
        <span className="done"><b><Check size={14} /></b> Basket</span><i />
        <span className="now"><b>2</b> Your details</span><i />
        <span><b>3</b> Confirmation</span>
      </div>
      <form className="checkout-layout" onSubmit={submit}>
        <div className="checkout-form">
          <div className="demo-warning">
            <Sparkles size={18} />
            <div><b>Prototype checkout</b><p>Use sample information only. Nothing entered here is saved or submitted to AFC — no payment or order will be created.</p></div>
          </div>
          <p className="eyebrow">Contact</p>
          <div className="form-grid">
            <label>First name<input required placeholder="Sample" /></label>
            <label>Last name<input required placeholder="Customer" /></label>
            <label className="full">Email<input required type="email" placeholder="sample@example.com" /></label>
          </div>
          <p className="eyebrow">Pickup or delivery</p>
          <div className="choice-grid">
            <label><input type="radio" name="method" defaultChecked /> <span><b>Store pickup</b><small>Choose your closest AFC and confirm timing with the store</small></span></label>
            <label><input type="radio" name="method" /> <span><b>Delivery</b><small>Free over $99; coverage and timing not guaranteed</small></span></label>
          </div>
          <p className="eyebrow">Demo address</p>
          <div className="form-grid">
            <label className="full">Street address<input required placeholder="123 Demo Street" /></label>
            <label>City<input required placeholder="Brampton" /></label>
            <label>Postal code<input required placeholder="L6X 0A1" /></label>
          </div>
        </div>
        <aside className="summary-card">
          <p className="eyebrow">{cart.length} items</p>
          {cart.map(line => (
            <div className="summary-line" key={line.product.id}>
              <img src={line.product.image_url} alt="" />
              <span>{line.quantity} × {line.product.name}</span>
              <strong>{money.format(line.quantity * line.product.price_cad)}</strong>
            </div>
          ))}
          <hr />
          <div className="total"><span>Demo total</span><strong>{money.format(subtotal)}</strong></div>
          <p className="note">No payment will be processed and no personal details are stored.</p>
          <button className="btn wide" type="submit">Complete simulation <ArrowRight size={16} /></button>
        </aside>
      </form>
    </main>
  );
}

function ConfirmationPage() {
  const [ref, setRef] = useState("AFC-DEMO");
  useEffect(() => setRef(new URLSearchParams(location.search).get("ref") || "AFC-DEMO"), []);
  const confetti = [
    { left: "38%", top: "20%", background: "var(--red)", animationDelay: "0s" },
    { left: "60%", top: "16%", background: "var(--marigold)", animationDelay: "0.8s" },
    { left: "30%", top: "42%", background: "var(--green)", animationDelay: "1.6s" },
    { left: "68%", top: "40%", background: "var(--lime)", animationDelay: "0.4s" },
    { left: "50%", top: "10%", background: "var(--green-deep)", animationDelay: "1.2s" },
  ];
  return (
    <main className="confirmation">
      {confetti.map((style, index) => <i className="confetti" style={style} key={index} aria-hidden="true" />)}
      <div className="stamp"><i /><Check size={40} /></div>
      <span className="sticker green flat">Simulation complete</span>
      <h1>Your demo order looks great.</h1>
      <p>Reference <b className="ref">{ref}</b> is for this prototype only. No order was sent, no payment was taken, and no personal details were stored.</p>
      <div className="actions">
        <a className="btn" href="/shop">Keep exploring <ArrowRight size={16} /></a>
        <button className="text-btn" onClick={() => openChat()}><Sparkles size={15} /> Ask AFC Assistant</button>
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <main className="confirmation">
      <img src={EMPTY_BASKET} alt="" style={{ width: 130, mixBlendMode: "multiply" }} />
      <span className="sticker flat">Not on this shelf</span>
      <h1>We couldn’t find that page.</h1>
      <div className="actions"><a className="btn" href="/">Back home <ArrowRight size={16} /></a></div>
    </main>
  );
}

/* ---------- admin ------------------------------------------------------------------------ */

function AdminPage() {
  const faqTypes = ["brand", "assortment", "promotions", "delivery", "pickup", "returns", "locations", "product_availability", "accounts", "careers", "legal", "service_status", "contact", "other"];
  const blank = { question: "", answer: "", faq_type: "other", tags: [], city: null, category_id: null, product_id: null, priority: 0, status: "published", valid_from: null, valid_to: null, source_urls: [], extra_metadata: {}, language: "en" };
  const [username, setUsername] = useState("admin"); const [password, setPassword] = useState(""); const [loggedIn, setLoggedIn] = useState(false); const [faqs, setFaqs] = useState<any[]>([]); const [message, setMessage] = useState("");
  const [search, setSearch] = useState(""); const [type, setType] = useState(""); const [editing, setEditing] = useState<any | null>(null);
  const load = async () => { const response = await fetch(`${API_URL}/api/admin/faqs`, { credentials: "include" }); if (response.ok) { setFaqs(await response.json()); setLoggedIn(true); } };
  useEffect(() => { load().catch(() => null); }, []);
  const login = async (event: FormEvent) => { event.preventDefault(); const response = await fetch(`${API_URL}/api/admin/login`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }); if (response.ok) load(); else setMessage("That username or password did not match."); };
  const sync = async () => { setMessage("Synchronizing PostgreSQL and the knowledge base…"); const response = await fetch(`${API_URL}/api/admin/sync`, { method: "POST", credentials: "include" }); setMessage(response.ok ? "Sync complete. Product facts are in PostgreSQL; general facts are in Qdrant/BM25." : "The sync failed, the API is unavailable, or your session expired."); };
  const save = async (event: FormEvent) => { event.preventDefault(); if (!editing) return; const exists = Boolean(editing.id); const response = await fetch(`${API_URL}/api/admin/faqs${exists ? `/${editing.id}` : ""}`, { method: exists ? "PUT" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...blank, ...editing, id: undefined, created_at: undefined, updated_at: undefined, content_hash: undefined }) }); if (response.ok) { setEditing(null); setMessage("FAQ saved and re-indexed for hybrid retrieval."); await load(); } else setMessage("FAQ could not be saved. Check the required fields and admin session."); };
  const archive = async (id: string) => { const response = await fetch(`${API_URL}/api/admin/faqs/${id}`, { method: "DELETE", credentials: "include" }); if (response.ok) { setEditing(null); setMessage("FAQ archived."); await load(); } };
  const visible = faqs.filter(faq => (!search || `${faq.question} ${faq.answer}`.toLowerCase().includes(search.toLowerCase())) && (!type || faq.faq_type === type));
  if (!loggedIn) return (
    <main className="admin-login">
      <div>
        <span className="sticker green flat"><Sparkles size={13} /> AFC knowledge studio</span>
        <h1>Admin access</h1>
        <p>Edit customer answers and refresh the product catalog.</p>
        <form onSubmit={login}>
          <label>Username<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoFocus /></label>
          <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>
          <button className="btn wide">Sign in</button>
          {message && <p className="form-message">{message}</p>}
        </form>
      </div>
    </main>
  );
  return (
    <main className="page-shell">
      <section className="admin-head">
        <div>
          <span className="sticker green flat">AFC knowledge studio</span>
          <h1>FAQ knowledge base</h1>
          <p>{faqs.length} answers available to the Qdrant + BM25 retrieval branch.</p>
        </div>
        <button className="btn" onClick={sync}>Sync both sources <ArrowRight size={16} /></button>
      </section>
      <section className="admin-table">
        <div className="admin-toolbar">
          <input placeholder="Search FAQs" value={search} onChange={event => setSearch(event.target.value)} />
          <select value={type} onChange={event => setType(event.target.value)}><option value="">All FAQ types</option>{faqTypes.map(value => <option key={value}>{value}</option>)}</select>
          <button onClick={() => setEditing({ ...blank })}>+ New FAQ</button>
        </div>
        {message && <p className="sync-message">{message}</p>}
        {editing && (
          <form className="faq-editor" onSubmit={save}>
            <div className="editor-head">
              <div><p className="eyebrow">{editing.id ? "Edit answer" : "New knowledge"}</p><h2>{editing.id ? editing.question : "Add an FAQ"}</h2></div>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close editor">×</button>
            </div>
            <label>Question<input required minLength={3} value={editing.question} onChange={event => setEditing({ ...editing, question: event.target.value })} /></label>
            <label>Answer<textarea required minLength={3} rows={6} value={editing.answer} onChange={event => setEditing({ ...editing, answer: event.target.value })} /></label>
            <div className="editor-grid">
              <label>FAQ type<select value={editing.faq_type} onChange={event => setEditing({ ...editing, faq_type: event.target.value })}>{faqTypes.map(value => <option key={value}>{value}</option>)}</select></label>
              <label>Status<select value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value })}><option>published</option><option>draft</option><option>archived</option></select></label>
              <label>Tags<input value={(editing.tags || []).join(", ")} onChange={event => setEditing({ ...editing, tags: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label>
              <label>City<input value={editing.city || ""} onChange={event => setEditing({ ...editing, city: event.target.value || null })} /></label>
            </div>
            <div className="editor-actions">
              {editing.id && <button className="archive-button" type="button" onClick={() => archive(editing.id)}>Archive</button>}
              <button className="btn" type="submit">Save &amp; re-index</button>
            </div>
          </form>
        )}
        <div className="faq-rows">
          {visible.map(faq => (
            <article key={faq.id}>
              <span className="type-pill">{faq.faq_type}</span>
              <div><h3>{faq.question}</h3><p>{faq.answer}</p></div>
              <span className={`status ${faq.status}`}>{faq.status}</span>
              <button onClick={() => setEditing(faq)} aria-label={`Edit ${faq.question}`}>Edit</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

/* ---------- cart drawer / toast -------------------------------------------------------- */

function CartDrawer({ open, close, cart, update, subtotal }: { open: boolean; close: () => void; cart: CartLine[]; update: (id: number, quantity: number) => void; subtotal: number }) {
  return (
    <div className={open ? "drawer-layer visible" : "drawer-layer"} aria-hidden={!open}>
      <button className="drawer-scrim" onClick={close} aria-label="Close basket" tabIndex={open ? 0 : -1} />
      <aside className="cart-drawer" aria-label="Shopping basket" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div><p className="eyebrow">Your basket</p><h2>{cart.length ? `${cart.length} fresh picks` : "Nothing here yet"}</h2></div>
          <button className="icon-btn" onClick={close} aria-label="Close basket"><X size={18} /></button>
        </div>
        {cart.length > 0 && <DeliveryMeter subtotal={subtotal} />}
        <div className="drawer-lines">
          {cart.length ? cart.map(line => (
            <div className="drawer-line" key={line.product.id}>
              <a className="thumb" href={`/product/${line.product.id}`}><img src={line.product.image_url} alt="" /></a>
              <div>
                <h3>{line.product.name}</h3>
                <p className="unit">{line.product.unit || "Unit not listed"} · {money.format(line.product.price_cad)}</p>
                <div className="stepper small">
                  <button onClick={() => update(line.product.id, line.quantity - 1)} aria-label={`Decrease ${line.product.name}`}><Minus size={12} /></button>
                  <span>{line.quantity}</span>
                  <button onClick={() => update(line.product.id, line.quantity + 1)} aria-label={`Increase ${line.product.name}`}><Plus size={12} /></button>
                </div>
              </div>
              <span className="line-price">{money.format(line.product.price_cad * line.quantity)}</span>
            </div>
          )) : (
            <div className="empty-state">
              <img src={EMPTY_BASKET} alt="" />
              <h2 style={{ fontSize: 26 }}>Your basket is empty</h2>
              <p>Pickles, chai, atta — it all fits.</p>
            </div>
          )}
        </div>
        <div className="drawer-foot">
          <div className="subtotal"><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div>
          <p className="note">Demo only — no real order or payment will be created.</p>
          <a className={cart.length ? "btn wide" : "btn wide disabled"} href={cart.length ? "/cart" : "/shop"}>{cart.length ? "Review basket" : "Start shopping"} <ArrowRight size={16} /></a>
          <button className="keep-shopping" onClick={close}>or keep shopping</button>
        </div>
      </aside>
    </div>
  );
}

function CartToast() {
  const [item, setItem] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (event: Event) => {
      setItem((event as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setItem(""), 2600);
    };
    window.addEventListener("afc-cart-added", handler);
    return () => { clearTimeout(timer); window.removeEventListener("afc-cart-added", handler); };
  }, []);
  return (
    <div className={item ? "cart-toast visible" : "cart-toast"} role="status" aria-live="polite">
      <span><Check size={17} /></span>
      <div><b>Added to your basket</b><small>{item}</small></div>
    </div>
  );
}

/* ---------- chat widget ------------------------------------------------------------------ */

function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      setOpen(true);
      const detail = (event as CustomEvent<string | undefined>).detail;
      if (typeof detail === "string" && detail) setMessage(detail);
    };
    window.addEventListener("open-afc-chat", handler);
    return () => window.removeEventListener("open-afc-chat", handler);
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 150); }, [open]);
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" }); }, [thread, loading, open]);

  const localAnswer = (query: string): ChatResult => {
    const lower = query.toLowerCase(); const max = lower.match(/(?:under|below)\s*\$?(\d+(?:\.\d+)?)/)?.[1];
    const matchedProducts = productsData.filter(product => (!max || product.price_cad <= Number(max)) && (!lower.includes("stock") || product.in_stock) && lower.split(/\s+/).some(word => word.length > 3 && product.name.toLowerCase().includes(word))).slice(0, 5);
    const matchedFacts = knowledgeData.facts.filter(fact => lower.split(/\s+/).some(word => word.length > 4 && `${fact.topic} ${fact.answer}`.toLowerCase().includes(word))).slice(0, 3);
    const lines = [...matchedProducts.map(product => `${product.name} is ${money.format(product.price_cad)} for ${product.unit || "the listed unit"}.`), ...matchedFacts.map(fact => fact.answer)];
    return {
      answer: lines.join("\n\n") || "I couldn’t find an exact answer in the current AFC snapshot. Try asking about a product, returns, delivery, pickup, or a store location.",
      confidence: lines.length ? "medium" : "low",
      product_cards: matchedProducts,
      sources: [
        ...matchedProducts.map(product => ({ id: `product:${product.id}`, source_type: "product", title: product.name, snippet: `${product.unit} · ${money.format(product.price_cad)}`, url: product.product_url })),
        ...matchedFacts.map(fact => ({ id: `faq:${fact.topic}`, source_type: "faq", title: fact.topic.replaceAll("_", " "), snippet: fact.answer, url: fact.source_urls[0] })),
      ],
    };
  };

  const send = async (raw?: string) => {
    const text = (raw ?? message).trim();
    if (!text || loading) return;
    setMessage("");
    setThread(current => [...current, { role: "user", text }]);
    setLoading(true);
    setStatus("");
    try {
      const sessionId = localStorage.getItem("afc-chat-session") || crypto.randomUUID();
      localStorage.setItem("afc-chat-session", sessionId);
      const response = await fetch(`${API_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, session_id: sessionId, history: [] }) });
      if (!response.ok || !response.body) throw new Error("API unavailable");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let final: ChatResult | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n"); buffer = events.pop() || "";
        for (const eventText of events) {
          const eventName = eventText.match(/^event: (.+)$/m)?.[1];
          const data = eventText.match(/^data: (.+)$/m)?.[1];
          if (!data) continue;
          if (eventName === "result") final = JSON.parse(data);
          else if (eventName === "status") {
            try { const parsed = JSON.parse(data); setStatus(parsed.message || parsed.status || ""); } catch { setStatus(data); }
          }
        }
      }
      if (!final) throw new Error("No result event");
      setThread(current => [...current, { role: "assistant", result: final }]);
    } catch {
      const fallback = localAnswer(text);
      setThread(current => [...current, { role: "assistant", result: fallback }]);
    } finally {
      setLoading(false);
      setStatus("");
    }
  };
  const ask = (event: FormEvent) => { event.preventDefault(); send(); };

  return (
    <>
      <button className={open ? "chat-launch hidden" : "chat-launch"} onClick={() => setOpen(true)}>
        <span><Sparkles size={19} /></span>
        <span><b>Ask AFC</b><small>Products, policies &amp; stores</small></span>
      </button>
      <aside className={open ? "chat-panel open" : "chat-panel"} aria-label="AFC Assistant" role="dialog" aria-modal="false">
        <header className="chat-head">
          <div className="avatar"><Sparkles size={20} /></div>
          <div><p>AFC Assistant</p><span className="status"><i /> Grounded in store data</span></div>
          <button onClick={() => setOpen(false)} aria-label="Close assistant"><X size={18} /></button>
        </header>
        <Fringe />
        <div className="chat-body" ref={body}>
          <div className="bubble-bot">
            <p>Namaste! I can compare products, check snapshot prices and stock, explain policies, or combine answers from multiple AFC sources.</p>
            <div className="suggestions">
              <button onClick={() => send("Which products are under $5 and can sale items be returned?")}>Under $5 + returns</button>
              <button onClick={() => send("Where are the Brampton stores?")}>Brampton stores</button>
              <button onClick={() => send("Is delivery free and what pickup options are available?")}>Delivery + pickup</button>
            </div>
          </div>
          {thread.map((entry, index) => entry.role === "user"
            ? <div className="bubble-user" key={index}>{entry.text}</div>
            : (
              <div className="bubble-bot" key={index}>
                <span className={`confidence-pill ${entry.result.confidence}`}>{entry.result.confidence} confidence · sourced</span>
                {entry.result.answer.split("\n").filter(Boolean).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
                {entry.result.product_cards.length > 0 && (
                  <div className="chat-products">
                    {entry.result.product_cards.slice(0, 3).map(product => (
                      <a href={`/product/${product.id}`} key={product.id}>
                        <img src={product.image_url} alt="" />
                        <b>{product.name}</b>
                        <small>{money.format(product.price_cad)}</small>
                      </a>
                    ))}
                  </div>
                )}
                {entry.result.sources.length > 0 && (
                  <details className="source-list">
                    <summary>{entry.result.sources.length} sources</summary>
                    {entry.result.sources.slice(0, 8).map(source => (
                      <a key={source.id} href={source.url || "#"} target={source.url ? "_blank" : undefined} rel="noreferrer">
                        <span>{source.source_type}</span><b>{source.title}</b>
                      </a>
                    ))}
                  </details>
                )}
              </div>
            ))}
          {loading && <div className="thinking"><span /><span /><span /> {status || "Searching products and FAQs"}</div>}
        </div>
        <form className="chat-form" onSubmit={ask}>
          <input ref={input} value={message} onChange={event => setMessage(event.target.value)} placeholder="Ask about two things at once…" />
          <button disabled={loading || !message.trim()} aria-label="Send question"><Send size={17} /></button>
          <small>Answers use AFC prototype data. Confirm changing details with the store.</small>
        </form>
      </aside>
    </>
  );
}

/* ---------- footer ------------------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <span className="logo-tile"><img src={LOGO} alt="Asian Food Centre" /></span>
          <p>A one-stop shop for South Asian grocery, meat, sweets, and takeaway needs — fresh ingredients, quality food, and reasonable low prices.</p>
        </div>
        <nav aria-label="Shop links">
          <p className="eyebrow">Shop</p>
          <a href="/shop">All products</a>
          <a href="/shop?collection=new">New arrivals</a>
          <a href="/shop?collection=best_seller">Best sellers</a>
          <a href="/shop?collection=featured">Weekly picks</a>
        </nav>
        <nav aria-label="Visit links">
          <p className="eyebrow">Visit</p>
          <a href="/locations">Store locations</a>
          <a href="/policies">Policies &amp; help</a>
          <a href="/admin">Knowledge admin</a>
        </nav>
        <div className="footer-contact">
          <p className="eyebrow">Contact</p>
          <a href="tel:+14167403262"><Phone size={14} /> (416) 740-3262</a>
          <a href="mailto:info@afcgrocery.com"><Mail size={14} /> info@afcgrocery.com</a>
          <span><MapPin size={14} /> 10 Westmore Dr, Etobicoke, ON</span>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="footer-pay">
          <span>We accept</span>
          <img src={PAY_VISA} alt="Visa" /><img src={PAY_MASTER} alt="Mastercard" />
        </div>
        <div className="footer-apps">
          <img src={APP_STORE} alt="App Store" /><img src={PLAY_STORE} alt="Google Play" /><span>Apps coming soon</span>
        </div>
        <p style={{ margin: 0 }}>Prototype for Asian Food Centre · No real orders are created</p>
      </div>
    </footer>
  );
}

/* ---------- root ---------------------------------------------------------------------------- */

export default function Storefront({ route }: { route: string[] }) {
  const cartState = useCart();
  const [drawer, setDrawer] = useState(false);
  const page = route[0] || "home";
  const ops: CartOps = { add: cartState.add, update: cartState.update, qty: cartState.qty };
  useReveal(page);
  let content: ReactNode;
  if (page === "home") content = <Home ops={ops} />;
  else if (page === "shop") content = <Shop ops={ops} />;
  else if (page === "product") content = <ProductPage id={Number(route[1])} ops={ops} />;
  else if (page === "locations") content = <LocationsPage />;
  else if (page === "policies") content = <PoliciesPage />;
  else if (page === "cart") content = <CartPage cart={cartState.cart} update={cartState.update} subtotal={cartState.subtotal} />;
  else if (page === "checkout") content = <CheckoutPage cart={cartState.cart} subtotal={cartState.subtotal} clear={cartState.clear} />;
  else if (page === "confirmation") content = <ConfirmationPage />;
  else if (page === "admin") content = <AdminPage />;
  else content = <NotFound />;
  const minimal = ["admin", "confirmation"].includes(page);
  return (
    <>
      <Header count={cartState.count} onCart={() => setDrawer(true)} />
      <div id="main-content">{content}</div>
      {!minimal && <Footer />}
      <TabBar page={page} count={cartState.count} onCart={() => setDrawer(true)} />
      <CartDrawer open={drawer} close={() => setDrawer(false)} cart={cartState.cart} update={cartState.update} subtotal={cartState.subtotal} />
      <CartToast />
      <ChatWidget />
    </>
  );
}
