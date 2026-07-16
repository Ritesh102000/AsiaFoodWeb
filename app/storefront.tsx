"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Bot, Check, ChevronRight, CircleHelp, Headphones,
  MapPin, Menu, Minus, PackageCheck, Plus, Search, Send,
  ShoppingBag, Sparkles, Store, Truck, X, type LucideIcon,
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

// Local development sets an explicit API origin. An empty production value
// keeps requests same-origin when frontend and API share a custom domain.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const HERO = "https://afcgrocery.com/storage/slider_images/Asian%20Food%20Centre/0wYsk9vYDanQxFgw0drEat8i2CsaaAFFL4wOuBb4.jpg";
const LOGO = "https://afcgrocery.com/themes/asianfood/images/asian-food-centre-logo.jpg";
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

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
  return { cart, add, update, clear: () => setCart([]), count: cart.reduce((sum, line) => sum + line.quantity, 0), subtotal: cart.reduce((sum, line) => sum + line.product.price_cad * line.quantity, 0) };
}

type IconName = "search" | "cart" | "spark" | "arrow" | "pin" | "close" | "send" | "menu";
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const icons: Record<IconName, LucideIcon> = { search: Search, cart: ShoppingBag, spark: Sparkles, arrow: ArrowRight, pin: MapPin, close: X, send: Send, menu: Menu };
  const Glyph = icons[name];
  return <Glyph aria-hidden="true" size={size} strokeWidth={2} />;
}

function Header({ count, onCart }: { count: number; onCart: () => void }) {
  const [mobile, setMobile] = useState(false);
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="announcement"><span><Truck size={13} /> Free delivery on orders over $99</span><span><Store size={13} /> 8 locations across the GTA</span><span><Headphones size={13} /> Local help: (416) 740-3262</span></div>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Asian Food Centre home"><img src={LOGO} alt="Asian Food Centre" /></a>
      <nav className={mobile ? "nav open" : "nav"} aria-label="Main navigation" onClick={() => setMobile(false)}>
        <a href="/shop">Shop all</a><a href="/shop?collection=new">New arrivals</a><a href="/shop?collection=best_seller">Best sellers</a><a href="/locations">Stores</a><a href="/policies">Help</a>
        <button className="nav-assistant" onClick={() => window.dispatchEvent(new Event("open-afc-chat"))}><Sparkles size={15} /> Ask AFC</button>
      </nav>
      <div className="header-actions">
        <a className="circle-button" href="/shop" aria-label="Search products"><Icon name="search" /></a>
        <button className="cart-button" onClick={onCart} aria-label={`Open cart with ${count} items`}><Icon name="cart" /><span>Basket</span><b>{count}</b></button>
        <button className="mobile-menu" onClick={() => setMobile(!mobile)} aria-label="Toggle menu" aria-expanded={mobile}><Icon name={mobile ? "close" : "menu"} /></button>
      </div>
    </header>
  </>;
}

function ProductCard({ product, add }: { product: Product; add: (product: Product) => void }) {
  const price = Number(product.special_price_cad) > 0 ? Number(product.special_price_cad) : Number(product.price_cad);
  const hasSale = Number(product.special_price_cad) > 0 && Number(product.special_price_cad) < Number(product.price_cad);
  return <article className="product-card">
    <a className="product-image-wrap" href={`/product/${product.id}`}>
      <img className="product-image" src={product.image_url} alt={product.name} loading="lazy" onError={event => { event.currentTarget.src = "https://afcgrocery.com/themes/asianfood/images/products/place_holder.png"; }} />
      {hasSale ? <span className="badge coral">Special</span> : product.collections.includes("new") && <span className="badge coral">New</span>}
      {!product.in_stock && <span className="badge dark">Out of stock</span>}
      <span className="product-view">View product <ChevronRight size={14} /></span>
    </a>
    <div className="product-copy"><p className="eyebrow">{product.unit || "Unit not listed"}</p><a href={`/product/${product.id}`}><h3>{product.name}</h3></a><div className="price-row"><div>{price > 0 ? <><strong>{money.format(price)}</strong>{hasSale && <del>{money.format(product.price_cad)}</del>}</> : <strong className="check-price">Check price</strong>}</div><button onClick={() => add(product)} disabled={!product.in_stock || price <= 0} aria-label={price > 0 ? `Add ${product.name} to cart` : `Price unavailable for ${product.name}`}><Plus size={17} /><span>{price > 0 ? "Add" : "N/A"}</span></button></div></div>
  </article>;
}

function CartDrawer({ open, close, cart, update, subtotal }: { open: boolean; close: () => void; cart: CartLine[]; update: (id: number, quantity: number) => void; subtotal: number }) {
  const deliveryRemaining = Math.max(0, 99 - subtotal);
  return <div className={open ? "drawer-layer visible" : "drawer-layer"} aria-hidden={!open}>
    <button className="drawer-scrim" onClick={close} aria-label="Close cart" />
    <aside className="cart-drawer" aria-label="Shopping cart" role="dialog" aria-modal="true">
      <div className="drawer-head"><div><p className="eyebrow">Your basket</p><h2>{cart.length ? `${cart.length} fresh picks` : "Your cart is empty"}</h2></div><button className="circle-button" onClick={close} aria-label="Close cart"><Icon name="close" /></button></div>
      {!!cart.length && <div className="delivery-meter"><div><Truck size={16} /><span>{deliveryRemaining ? `${money.format(deliveryRemaining)} away from free delivery` : "You unlocked free delivery"}</span></div><i><b style={{ width: `${Math.min(100, subtotal / 99 * 100)}%` }} /></i></div>}
      <div className="cart-lines">{cart.map(line => <div className="cart-line" key={line.product.id}><img src={line.product.image_url} alt="" /><div><h3>{line.product.name}</h3><p>{line.product.unit} · {money.format(line.product.price_cad)}</p><div className="stepper"><button onClick={() => update(line.product.id, line.quantity - 1)} aria-label={`Decrease ${line.product.name}`}><Minus size={13} /></button><span>{line.quantity}</span><button onClick={() => update(line.product.id, line.quantity + 1)} aria-label={`Increase ${line.product.name}`}><Plus size={13} /></button></div></div><strong>{money.format(line.product.price_cad * line.quantity)}</strong></div>)}</div>
      <div className="drawer-foot"><div><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div><p>Demo only — no real order or payment will be created.</p><a className={cart.length ? "primary-button" : "primary-button disabled"} href={cart.length ? "/cart" : "/shop"}>{cart.length ? "Review cart" : "Start shopping"}<Icon name="arrow" /></a></div>
    </aside>
  </div>;
}

function Home({ add }: { add: (product: Product) => void }) {
  const usable = (product: Product) => Number(product.price_cad) > 0 && !product.image_url.includes("place_holder");
  const featured = productsData.filter(product => product.collections.includes("featured") && usable(product)).slice(0, 8);
  const best = productsData.filter(product => product.collections.includes("best_seller") && usable(product)).slice(0, 8);
  const heroProducts = [27803, 27580, 34126].map(id => productsData.find(product => product.id === id)).filter(Boolean) as Product[];
  return <main>
    <section className="hero">
      <div className="hero-glow" /><div className="hero-pattern" />
      <div className="hero-grid">
        <div className="hero-content"><p className="kicker"><Sparkles size={16} /> Your neighbourhood Desi market</p><h1>Home tastes<br /><em>better here.</em></h1><p>Fresh produce, pantry favourites, halal meats and the brands your family knows—together in one joyful place.</p><div className="hero-actions"><a className="primary-button light" href="/shop">Explore groceries <ArrowRight size={18} /></a><button className="text-button" onClick={() => window.dispatchEvent(new Event("open-afc-chat"))}><Bot size={18} /> Ask the AFC Assistant</button></div><div className="popular-searches"><span>Popular:</span><a href="/shop?q=tea">Tea</a><a href="/shop?q=rice">Rice</a><a href="/shop?q=pickle">Pickles</a><a href="/shop?q=juice">Juice</a></div><div className="hero-proof"><span><b>508</b> categories</span><span><b>100</b> curated products</span><span><b>8</b> GTA stores</span></div></div>
        <div className="hero-stage" aria-label="Featured AFC products">
          <div className="hero-photo" style={{ backgroundImage: `url("${HERO}")` }} />
          <div className="stage-caption"><span>Fresh this week</span><strong>Flavours worth sharing</strong></div>
          {heroProducts.map((product, index) => <a href={`/product/${product.id}`} className={`floating-product floating-product-${index + 1}`} key={product.id}><span><img src={product.image_url} alt={product.name} /></span><small>{product.name}</small><b>{money.format(product.price_cad)}</b></a>)}
          <button className="assistant-orb" onClick={() => window.dispatchEvent(new Event("open-afc-chat"))} aria-label="Open AFC Assistant"><span><Bot size={22} /></span><b>Need a hand?</b><small>Ask about products + policies</small></button>
        </div>
      </div>
    </section>
    <section className="category-strip section-pad"><div className="section-heading"><div><p className="eyebrow">Shop your way</p><h2>From pantry to plate</h2><p>Explore the aisles your family comes back to.</p></div><a href="/shop">Browse all departments <ArrowRight size={17} /></a></div><div className="category-grid">{categoriesData.slice(0, 8).map((category, index) => <a href={`/shop?category=${category.slug}`} className="category-card" style={{ animationDelay: `${index * 55}ms` }} key={category.id}>{category.image_url ? <img src={category.image_url} alt="" /> : <span>{category.name.charAt(0)}</span>}<strong>{category.name}</strong><small>{category.children.length ? `${category.children.length} collections` : "Explore aisle"}</small><i><ChevronRight size={14} /></i></a>)}</div></section>
    <section className="service-band"><div><span><Truck /></span><h3>Free delivery over $99</h3><p>More groceries, no delivery fee</p></div><div><span><PackageCheck /></span><h3>Easy store pickup</h3><p>Choose your closest AFC location</p></div><div><span><Headphones /></span><h3>People nearby to help</h3><p>Eight local stores across the GTA</p></div></section>
    <ProductSection title="Fresh arrivals" eyebrow="New & noteworthy" products={featured} add={add} />
    <section className="ai-showcase section-pad">
      <div className="ai-showcase-copy"><p className="kicker"><Bot size={17} /> Meet your new shopping sidekick</p><h2>One question.<br />Two trusted sources.</h2><p>The AFC Assistant understands compound questions, checks live catalog facts in PostgreSQL, and combines them with policy answers from the knowledge base.</p><div className="source-truths"><div><span><PackageCheck size={19} /></span><p><b>Product database</b><small>Prices, stock, sizes and collections</small></p></div><div><span><CircleHelp size={19} /></span><p><b>AFC knowledge base</b><small>Policies, delivery, pickup and locations</small></p></div></div><button className="primary-button light" onClick={() => window.dispatchEvent(new Event("open-afc-chat"))}>Try the assistant <Sparkles size={17} /></button></div>
      <div className="ai-demo"><div className="ai-demo-head"><span><Bot size={19} /></span><div><b>AFC Assistant</b><small><i /> Connected to verified sources</small></div><em>AI</em></div><div className="user-bubble">Which drinks are under $5, and can sale items be returned?</div><div className="answer-bubble"><span className="answer-spark"><Sparkles size={16} /></span><div><p>I found drinks under $5 in the current catalog. For returns, AFC’s published policy should be confirmed with the store for sale-item exceptions.</p><div className="answer-products"><span><img src={productsData.find(product => product.id === 27580)?.image_url} alt="Limca Indian" /><b>Limca Indian</b><small>$1.99</small></span><span><img src={productsData.find(product => product.id === 26644)?.image_url || productsData[3].image_url} alt="Suggested drink" /><b>More matches</b><small>View products →</small></span></div><div className="answer-sources"><span><Check size={13} /> Catalog</span><span><Check size={13} /> Returns policy</span></div></div></div></div>
    </section>
    <section className="story section-pad"><div className="story-card"><p className="kicker">The AFC promise</p><h2>A bigger table starts with better choices.</h2><p>Asian Food Centre brings produce, groceries, meat, sweets and takeaway favourites together under one roof—extensive variety, fair prices and the flavours that feel like home.</p><a className="text-link" href="/locations">Find your nearest store <Icon name="arrow" /></a></div><div className="story-numbers"><div><b>6</b><span>Brampton stores</span></div><div><b>1</b><span>Etobicoke store</span></div><div><b>1</b><span>Mississauga store</span></div></div></section>
    <ProductSection title="Everyday favourites" eyebrow="What shoppers love" products={best} add={add} tone="soft" />
  </main>;
}

function ProductSection({ title, eyebrow, products, add, tone = "white" }: { title: string; eyebrow: string; products: Product[]; add: (product: Product) => void; tone?: string }) {
  return <section className={`product-section section-pad ${tone}`}><div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>Handpicked from the current AFC catalog.</p></div><a href="/shop">View all products <ArrowRight size={17} /></a></div><div className="products-grid">{products.map(product => <ProductCard product={product} add={add} key={product.id} />)}</div></section>;
}

function Shop({ add }: { add: (product: Product) => void }) {
  const [query, setQuery] = useState(""); const [collection, setCollection] = useState(""); const [stock, setStock] = useState(false); const [sort, setSort] = useState("featured");
  useEffect(() => { const params = new URLSearchParams(location.search); setQuery(params.get("q") || params.get("category")?.replaceAll("-", " ") || ""); setCollection(params.get("collection") || ""); }, []);
  const list = useMemo(() => {
    let result = productsData.filter(product => !query || `${product.name} ${product.unit} ${product.collections.join(" ")}`.toLowerCase().includes(query.toLowerCase())).filter(product => !collection || product.collections.includes(collection)).filter(product => !stock || product.in_stock);
    if (sort === "low") result = [...result].sort((a, b) => (a.price_cad || Number.MAX_VALUE) - (b.price_cad || Number.MAX_VALUE));
    if (sort === "high") result = [...result].sort((a, b) => b.price_cad - a.price_cad);
    if (sort === "name") result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [query, collection, stock, sort]);
  return <main className="page-shell"><section className="page-hero"><p className="kicker">100 products · live prototype</p><h1>Find your favourites</h1><p>Search AFC’s featured, new and bestselling grocery collection.</p></section><section className="catalog-layout section-pad"><aside className="filters"><p className="eyebrow">Browse</p><h2>Departments</h2>{categoriesData.slice(0, 14).map(category => <button key={category.id} onClick={() => { setQuery(category.name); setCollection(""); }}>{category.name}<span>→</span></button>)}</aside><div className="catalog"><div className="catalog-tools"><label className="search-field"><Icon name="search" /><input value={query} onChange={event => { setQuery(event.target.value); setCollection(""); }} placeholder="Search rice, tea, pickles…" /></label><label className="check"><input type="checkbox" checked={stock} onChange={event => setStock(event.target.checked)} /> In stock</label><select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="name">Name</option></select></div><div className="result-count"><strong>{list.length}</strong> matches {collection && <button onClick={() => setCollection("")}>Clear “{collection.replaceAll("_", " ")}” ×</button>}{query && <button onClick={() => setQuery("")}>Clear “{query}” ×</button>}</div><div className="products-grid">{list.map(product => <ProductCard key={product.id} product={product} add={add} />)}</div>{!list.length && <div className="empty-state"><Search size={54} /><h2>No exact match</h2><p>Try a broader product name or ask the AFC Assistant.</p></div>}</div></section></main>;
}

function ProductPage({ id, add }: { id: number; add: (product: Product) => void }) {
  const product = productsData.find(item => item.id === id);
  if (!product) return <NotFound />;
  const purchasable = product.in_stock && Number(product.price_cad) > 0;
  const related = productsData.filter(item => item.id !== id && item.price_cad > 0 && item.collections.some(collection => product.collections.includes(collection))).slice(0, 4);
  return <main className="page-shell"><section className="product-detail section-pad"><div className="product-detail-image"><img src={product.image_url} alt={product.name} /><span className="badge coral">{product.collections[0] || "Catalog"}</span></div><div className="product-detail-copy"><p className="breadcrumbs"><a href="/">Home</a> / <a href="/shop">Shop</a> / {product.name}</p><p className="eyebrow">{product.unit || "Unit not listed"}</p><h1>{product.name}</h1><div className="detail-price">{product.price_cad > 0 ? <>{money.format(product.price_cad)} <span>CAD</span></> : <>Check current price</>}</div><p className={product.in_stock ? "stock yes" : "stock no"}>{product.in_stock ? "● In stock in the catalog snapshot" : "Out of stock"}</p><p className="detail-description">AFC Grocery catalog item. Price and availability are a dated prototype snapshot; confirm against the live store before checkout.</p><button className="primary-button wide" onClick={() => add(product)} disabled={!purchasable}>{purchasable ? <>Add to demo cart <Plus size={17} /></> : "Price unavailable for demo cart"}</button><div className="detail-notes"><div><b>Order limit</b><span>Up to {product.order_limit || 5} per order</span></div><div><b>Store source</b><a href={product.product_url} target="_blank" rel="noreferrer">View original listing ↗</a></div></div></div></section><ProductSection title="You may also like" eyebrow="Keep exploring" products={related} add={add} tone="soft" /></main>;
}

function LocationsPage() {
  return <main className="page-shell"><section className="page-hero"><p className="kicker">Closer than you think</p><h1>Eight stores. One AFC family.</h1><p>Find Asian Food Centre across Brampton, Etobicoke and Mississauga.</p></section><section className="locations-grid section-pad">{locationsData.map((location, index) => <article className="location-card" key={location.address}><div className="location-index">0{index + 1}</div><p className="eyebrow">{location.city}</p><h2>{location.address}</h2><p><Icon name="pin" /> Local AFC grocery store</p><a href={`tel:${location.phone}`}>{location.phone}</a><a className="text-link" href={`https://maps.google.com/?q=${encodeURIComponent(location.address)}`} target="_blank" rel="noreferrer">Open directions <Icon name="arrow" /></a></article>)}</section></main>;
}

function PoliciesPage() {
  const featured = knowledgeData.facts.filter(fact => ["delivery", "pickup", "returns", "contact", "product_availability", "careers"].includes(fact.topic));
  return <main className="page-shell"><section className="page-hero"><p className="kicker">Straight answers</p><h1>Shopping help & policies</h1><p>Clear guidance, sourced from AFC’s public website.</p></section><section className="faq-list section-pad">{featured.map((fact, index) => <details open={index === 0} key={fact.topic}><summary><span>0{index + 1}</span><h2>{fact.topic.replaceAll("_", " ")}</h2><b>+</b></summary><div><p>{fact.answer}</p><a href={fact.source_urls[0]} target="_blank" rel="noreferrer">View source ↗</a></div></details>)}</section></main>;
}

function CartPage({ cart, update, subtotal }: { cart: CartLine[]; update: (id: number, quantity: number) => void; subtotal: number }) {
  return <main className="page-shell"><section className="page-hero compact"><p className="kicker">Demo basket</p><h1>Review your picks</h1></section><section className="cart-page section-pad"><div className="cart-table">{cart.length ? cart.map(line => <div className="cart-row" key={line.product.id}><img src={line.product.image_url} alt="" /><div><p className="eyebrow">{line.product.unit}</p><h2>{line.product.name}</h2><button onClick={() => update(line.product.id, 0)}>Remove</button></div><div className="stepper"><button onClick={() => update(line.product.id, line.quantity - 1)}>−</button><span>{line.quantity}</span><button onClick={() => update(line.product.id, line.quantity + 1)}>+</button></div><strong>{money.format(line.product.price_cad * line.quantity)}</strong></div>) : <div className="empty-state"><h2>Your demo cart is empty</h2><a className="primary-button" href="/shop">Browse products</a></div>}</div><aside className="summary-card"><p className="eyebrow">Order summary</p><div><span>Subtotal</span><strong>{money.format(subtotal)}</strong></div><div><span>Estimated delivery</span><strong>{subtotal >= 99 ? "Free" : money.format(9.99)}</strong></div><hr /><div className="total"><span>Demo total</span><strong>{money.format(subtotal + (subtotal && subtotal < 99 ? 9.99 : 0))}</strong></div><p>No payment will be processed. Delivery eligibility must be confirmed with AFC.</p><a className={cart.length ? "primary-button wide" : "primary-button wide disabled"} href={cart.length ? "/checkout" : "/shop"}>{cart.length ? "Continue to checkout" : "Start shopping"}<Icon name="arrow" /></a></aside></section></main>;
}

function CheckoutPage({ cart, subtotal, clear }: { cart: CartLine[]; subtotal: number; clear: () => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); clear(); location.href = `/confirmation?ref=AFC-${Math.floor(1000 + Math.random() * 9000)}`; };
  if (!cart.length) return <main className="page-shell"><div className="empty-state standalone"><h1>No items to check out</h1><a className="primary-button" href="/shop">Return to shop</a></div></main>;
  return <main className="page-shell"><section className="page-hero compact"><p className="kicker">Simulation only</p><h1>Demo checkout</h1><p>Nothing entered here is saved or submitted to AFC.</p></section><form className="checkout section-pad" onSubmit={submit}><div className="checkout-form"><div className="demo-warning"><Icon name="spark" /><div><b>Prototype checkout</b><p>Use sample information only. No payment or order will be created.</p></div></div><p className="eyebrow">Contact</p><div className="form-grid"><label>First name<input required placeholder="Sample" /></label><label>Last name<input required placeholder="Customer" /></label><label className="full">Email<input required type="email" placeholder="sample@example.com" /></label></div><p className="eyebrow">Pickup or delivery</p><div className="choice-grid"><label><input type="radio" name="method" defaultChecked /> <span><b>Store pickup</b><small>Confirm timing with your AFC location</small></span></label><label><input type="radio" name="method" /> <span><b>Delivery</b><small>Free over $99; coverage not guaranteed</small></span></label></div><p className="eyebrow">Demo address</p><div className="form-grid"><label className="full">Street address<input required placeholder="123 Demo Street" /></label><label>City<input required placeholder="Brampton" /></label><label>Postal code<input required placeholder="L6X 0A1" /></label></div></div><aside className="summary-card"><p className="eyebrow">{cart.length} items</p>{cart.map(line => <div className="checkout-line" key={line.product.id}><img src={line.product.image_url} alt="" /><span>{line.quantity} × {line.product.name}</span><strong>{money.format(line.quantity * line.product.price_cad)}</strong></div>)}<hr /><div className="total"><span>Demo total</span><strong>{money.format(subtotal)}</strong></div><button className="primary-button wide" type="submit">Complete simulation <Icon name="arrow" /></button></aside></form></main>;
}

function ConfirmationPage() {
  const [ref, setRef] = useState("AFC-DEMO"); useEffect(() => setRef(new URLSearchParams(location.search).get("ref") || "AFC-DEMO"), []);
  return <main className="confirmation"><div className="confirmation-mark">✓</div><p className="kicker">Simulation complete</p><h1>Your demo order looks great.</h1><p>Reference <b>{ref}</b> is for this prototype only. No order was sent, no payment was taken, and no personal details were stored.</p><div><a className="primary-button" href="/shop">Keep exploring <Icon name="arrow" /></a><button className="text-button dark" onClick={() => window.dispatchEvent(new Event("open-afc-chat"))}>Ask AFC Assistant</button></div></main>;
}

function AdminPage() {
  const faqTypes = ["brand","assortment","promotions","delivery","pickup","returns","locations","product_availability","accounts","careers","legal","service_status","contact","other"];
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
  if (!loggedIn) return <main className="admin-login"><div><p className="kicker">AFC knowledge studio</p><h1>Admin access</h1><p>Edit customer answers and refresh the product catalog.</p><form onSubmit={login}><label>Username<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoFocus /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label><button className="primary-button wide">Sign in</button>{message && <p className="form-message">{message}</p>}</form></div></main>;
  return <main className="page-shell"><section className="admin-head section-pad"><div><p className="kicker">AFC knowledge studio</p><h1>FAQ knowledge base</h1><p>{faqs.length} answers available to the Qdrant + BM25 retrieval branch.</p></div><button className="primary-button" onClick={sync}>Sync both sources <Icon name="arrow" /></button></section><section className="admin-table section-pad"><div className="admin-toolbar"><input placeholder="Search FAQs" value={search} onChange={event => setSearch(event.target.value)} /><select value={type} onChange={event => setType(event.target.value)}><option value="">All FAQ types</option>{faqTypes.map(value => <option key={value}>{value}</option>)}</select><button onClick={() => setEditing({ ...blank })}>+ New FAQ</button></div>{message && <p className="sync-message">{message}</p>} {editing && <form className="faq-editor" onSubmit={save}><div className="editor-head"><div><p className="eyebrow">{editing.id ? "Edit answer" : "New knowledge"}</p><h2>{editing.id ? editing.question : "Add an FAQ"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div><label>Question<input required minLength={3} value={editing.question} onChange={event => setEditing({ ...editing, question: event.target.value })} /></label><label>Answer<textarea required minLength={3} rows={6} value={editing.answer} onChange={event => setEditing({ ...editing, answer: event.target.value })} /></label><div className="editor-grid"><label>FAQ type<select value={editing.faq_type} onChange={event => setEditing({ ...editing, faq_type: event.target.value })}>{faqTypes.map(value => <option key={value}>{value}</option>)}</select></label><label>Status<select value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value })}><option>published</option><option>draft</option><option>archived</option></select></label><label>Tags<input value={(editing.tags || []).join(", ")} onChange={event => setEditing({ ...editing, tags: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label><label>City<input value={editing.city || ""} onChange={event => setEditing({ ...editing, city: event.target.value || null })} /></label></div><div className="editor-actions">{editing.id && <button className="archive-button" type="button" onClick={() => archive(editing.id)}>Archive</button>}<button className="primary-button" type="submit">Save & re-index</button></div></form>}<div className="faq-rows">{visible.map(faq => <article key={faq.id}><span className="type-pill">{faq.faq_type}</span><div><h3>{faq.question}</h3><p>{faq.answer}</p></div><span className={`status ${faq.status}`}>{faq.status}</span><button onClick={() => setEditing(faq)} aria-label={`Edit ${faq.question}`}>Edit</button></article>)}</div></section></main>;
}

function NotFound() { return <main className="confirmation"><div className="confirmation-mark">?</div><p className="kicker">Not on this shelf</p><h1>We couldn’t find that page.</h1><a className="primary-button" href="/">Back home</a></main>; }

function ChatWidget() {
  const [open, setOpen] = useState(false); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false); const [result, setResult] = useState<ChatResult | null>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const handler = () => setOpen(true); window.addEventListener("open-afc-chat", handler); return () => window.removeEventListener("open-afc-chat", handler); }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 120); }, [open]);
  const localAnswer = (query: string): ChatResult => {
    const lower = query.toLowerCase(); const max = lower.match(/(?:under|below)\s*\$?(\d+(?:\.\d+)?)/)?.[1];
    const matchedProducts = productsData.filter(product => (!max || product.price_cad <= Number(max)) && (!lower.includes("stock") || product.in_stock) && lower.split(/\s+/).some(word => word.length > 3 && product.name.toLowerCase().includes(word))).slice(0, 5);
    const matchedFacts = knowledgeData.facts.filter(fact => lower.split(/\s+/).some(word => word.length > 4 && `${fact.topic} ${fact.answer}`.toLowerCase().includes(word))).slice(0, 3);
    const lines = [...matchedProducts.map(product => `${product.name} is ${money.format(product.price_cad)} for ${product.unit || "the listed unit"} [product:${product.id}].`), ...matchedFacts.map(fact => `${fact.answer} [faq:${fact.topic}]`)];
    return { answer: lines.join("\n\n") || "I couldn't find an exact answer in the current AFC snapshot. Please try asking about a product, return policy, delivery, pickup, or store location.", confidence: lines.length ? "medium" : "low", product_cards: matchedProducts, sources: [...matchedProducts.map(product => ({ id: `product:${product.id}`, source_type: "product", title: product.name, snippet: `${product.unit} · ${money.format(product.price_cad)}`, url: product.product_url })), ...matchedFacts.map(fact => ({ id: `faq:${fact.topic}`, source_type: "faq", title: fact.topic.replaceAll("_", " "), snippet: fact.answer, url: fact.source_urls[0] }))] };
  };
  const ask = async (event: FormEvent) => {
    event.preventDefault(); if (!message.trim()) return; setLoading(true); setResult(null);
    try {
      const sessionId = localStorage.getItem("afc-chat-session") || crypto.randomUUID(); localStorage.setItem("afc-chat-session", sessionId);
      const response = await fetch(`${API_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, session_id: sessionId, history: [] }) });
      if (!response.ok || !response.body) throw new Error("API unavailable");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split("\n\n"); buffer = events.pop() || ""; for (const eventText of events) { const eventName = eventText.match(/^event: (.+)$/m)?.[1]; const data = eventText.match(/^data: (.+)$/m)?.[1]; if (eventName === "result" && data) setResult(JSON.parse(data)); } }
    } catch { setResult(localAnswer(message)); }
    finally { setLoading(false); }
  };
  return <><button className={open ? "chat-launch hidden" : "chat-launch"} onClick={() => setOpen(true)}><Icon name="spark" /><span><b>Ask AFC</b><small>Products, policies & stores</small></span></button><aside className={open ? "chat-panel open" : "chat-panel"} aria-label="AFC Assistant"><header><div className="assistant-avatar"><Icon name="spark" /></div><div><p>AFC Assistant</p><span><i /> Grounded in store data</span></div><button onClick={() => setOpen(false)} aria-label="Close assistant"><Icon name="close" /></button></header><div className="chat-body"><div className="assistant-message"><p>Hi! I can compare products, check snapshot prices and stock, explain policies, or combine answers from multiple AFC sources.</p><div className="suggestions"><button onClick={() => setMessage("Which products are under $5 and can sale items be returned?")}>Products under $5 + returns</button><button onClick={() => setMessage("Where are the Brampton stores?")}>Brampton stores</button><button onClick={() => setMessage("Is delivery free and what pickup options are available?")}>Delivery + pickup</button></div></div>{loading && <div className="thinking"><span /><span /><span /> Searching products and FAQs</div>}{result && <div className="assistant-message result"><p className="confidence">{result.confidence} confidence · sourced answer</p>{result.answer.split("\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}{!!result.product_cards.length && <div className="chat-products">{result.product_cards.slice(0, 3).map(product => <a href={`/product/${product.id}`} key={product.id}><img src={product.image_url} alt="" /><span><b>{product.name}</b><small>{money.format(product.price_cad)}</small></span></a>)}</div>} {!!result.sources.length && <details className="source-list"><summary>{result.sources.length} sources</summary>{result.sources.slice(0, 8).map(source => <a key={source.id} href={source.url || "#"} target={source.url ? "_blank" : undefined} rel="noreferrer"><span>{source.source_type}</span><b>{source.title}</b></a>)}</details>}</div>}</div><form className="chat-form" onSubmit={ask}><input ref={input} value={message} onChange={event => setMessage(event.target.value)} placeholder="Ask about two things at once…" /><button disabled={loading || !message.trim()} aria-label="Send question"><Icon name="send" /></button><small>Answers use AFC prototype data. Confirm changing details with the store.</small></form></aside></>;
}

function Footer() { return <footer><div className="footer-brand"><img src={LOGO} alt="Asian Food Centre" /><p>Your one-stop shop for South Asian grocery, produce, meat, sweets and takeaway favourites.</p></div><div><p className="eyebrow">Shop</p><a href="/shop">All products</a><a href="/shop?collection=new">New arrivals</a><a href="/shop?collection=best_seller">Best sellers</a></div><div><p className="eyebrow">Visit</p><a href="/locations">Store locations</a><a href="/policies">Policies & help</a><a href="/admin">Knowledge admin</a></div><div><p className="eyebrow">Contact</p><a href="tel:+14167403262">(416) 740-3262</a><a href="mailto:info@afcgrocery.com">info@afcgrocery.com</a><span>10 Westmore Dr, Etobicoke</span></div><p className="footer-note">Prototype for Asian Food Centre · No real orders are created</p></footer>; }

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
  return <div className={item ? "cart-toast visible" : "cart-toast"} role="status" aria-live="polite"><span><Check size={16} /></span><div><b>Added to your basket</b><small>{item}</small></div></div>;
}

export default function Storefront({ route }: { route: string[] }) {
  const cartState = useCart(); const [drawer, setDrawer] = useState(false); const page = route[0] || "home";
  let content: React.ReactNode;
  if (page === "home") content = <Home add={cartState.add} />;
  else if (page === "shop") content = <Shop add={cartState.add} />;
  else if (page === "product") content = <ProductPage id={Number(route[1])} add={cartState.add} />;
  else if (page === "locations") content = <LocationsPage />;
  else if (page === "policies") content = <PoliciesPage />;
  else if (page === "cart") content = <CartPage cart={cartState.cart} update={cartState.update} subtotal={cartState.subtotal} />;
  else if (page === "checkout") content = <CheckoutPage cart={cartState.cart} subtotal={cartState.subtotal} clear={cartState.clear} />;
  else if (page === "confirmation") content = <ConfirmationPage />;
  else if (page === "admin") content = <AdminPage />;
  else content = <NotFound />;
  const minimal = ["admin", "confirmation"].includes(page);
  return <><Header count={cartState.count} onCart={() => setDrawer(true)} /><div id="main-content">{content}</div>{!minimal && <Footer />}<CartDrawer open={drawer} close={() => setDrawer(false)} cart={cartState.cart} update={cartState.update} subtotal={cartState.subtotal} /><CartToast /><ChatWidget /></>;
}
