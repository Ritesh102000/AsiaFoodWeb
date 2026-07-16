#!/usr/bin/env python3
"""Create a prototype-safe snapshot of public data from afcgrocery.com."""

from __future__ import annotations

import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


BASE_URL = "https://afcgrocery.com"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "backend" / "data" / "afc"
USER_AGENT = "AsianFoodBot prototype data collector/1.0"


def fetch(path: str) -> str:
    request = Request(f"{BASE_URL}{path}", headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(html.unescape(value).split())


def first(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
    return clean_text(match.group(1)) if match else None


def parse_product_blocks(page: str, collection: str) -> list[dict]:
    parsed = []
    blocks = re.findall(r'<div class="product_box">(.*?</btn-cart>)', page, re.DOTALL)
    for block in blocks:
        product_id = first(r'product_id="([0-9]+)"', block)
        if not product_id:
            continue
        parsed.append(
            {
                "id": int(product_id),
                "name": first(r'<h4><a[^>]*>(.*?)</a>', block),
                "unit": first(r'<p class="unit_type">(.*?)</p>', block) or None,
                "price_cad": float(first(r'\bprice="\$?([0-9.]+)"', block) or 0),
                "special_price_cad": float(
                    first(r"special_price\s*=\s*['\"]\$?([0-9.]+)", block) or 0
                ),
                "in_stock": first(r"is_stock=['\"]([01])", block) == "1",
                "order_limit": int(first(r"order_limit=['\"]([0-9]+)", block) or 0),
                "product_url": first(r'<h4><a href="([^"]+)"', block),
                "image_url": first(r"(?:src|:src)=['\"]`?([^'\"`]+)", block),
                "collections": [collection],
            }
        )
    return parsed


def merge_products(*groups: list[dict], limit: int = 100) -> list[dict]:
    merged: dict[int, dict] = {}
    for group in groups:
        for product in group:
            if product["id"] in merged:
                for collection in product["collections"]:
                    if collection not in merged[product["id"]]["collections"]:
                        merged[product["id"]]["collections"].append(collection)
            elif len(merged) < limit:
                merged[product["id"]] = product
    return list(merged.values())


def parse_home_products(page: str) -> list[dict]:
    headings = list(re.finditer(r'<h2 class="sec_title">(.*?)</h2>', page, re.DOTALL))
    wanted = {
        "Featured Products": "featured",
        "New Products": "new",
        "Best Sellers": "best_seller",
    }
    products: dict[str, dict] = {}

    for index, heading in enumerate(headings):
        title = clean_text(heading.group(1))
        if title not in wanted:
            continue
        end = headings[index + 1].start() if index + 1 < len(headings) else len(page)
        section = page[heading.end():end]
        for product in parse_product_blocks(section, wanted[title]):
            existing = products.setdefault(product["id"], product)
            if wanted[title] not in existing["collections"]:
                existing["collections"].append(wanted[title])

    return list(products.values())


def normalize_categories(payload: dict) -> list[dict]:
    def normalize(category: dict) -> dict:
        icon = category.get("category_icon_path")
        return {
            "id": category["id"],
            "name": category["name"],
            "slug": category["slug"],
            "url": f"{BASE_URL}/{category['slug']}",
            "image_url": f"{BASE_URL}/storage/{icon}" if icon else None,
            "children": [normalize(child) for child in category.get("children", [])],
        }

    return [normalize(category) for category in payload["categories"]]


def write_json(name: str, value: object) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / name).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    fetched_at = datetime.now(timezone.utc).isoformat()
    home = fetch("/")
    catalog = fetch("/categorysearch?term=&category=&limit=100")
    categories = normalize_categories(json.loads(fetch("/all_categories?page=1&limit=100")))
    products = merge_products(
        parse_home_products(home), parse_product_blocks(catalog, "catalog"), limit=100
    )

    brand = {
        "brand_name": "Asian Food Centre",
        "website": BASE_URL,
        "tagline": "A one-stop shop for South Asian grocery, meat, sweets, and takeaway needs.",
        "positioning": [
            "South Asian and Desi grocery selection",
            "Fresh produce plus fresh and marinated meat",
            "Extensive variety at competitively low prices",
            "Weekly in-store specials",
        ],
        "mission": "Provide a one-stop shop covering Desi needs with premium grocery service, fresh ingredients, quality food, and reasonable low prices.",
        "goal": "Provide quality, extensive variety, and a clean, spacious one-stop shopping experience for South Asian needs at competitively low prices.",
        "contact": {
            "phone": "+1 416-740-3262",
            "email": "info@afcgrocery.com",
            "head_office": "10 Westmore Dr, Etobicoke, ON M9V 3Z7",
        },
        "service_promises_shown_on_homepage": [
            "Free delivery on orders over CAD 99",
            "Eight locations",
            "Online order pickup",
        ],
        "logo_url": f"{BASE_URL}/themes/asianfood/images/asian-food-centre-logo.jpg",
        "source_url": BASE_URL,
        "fetched_at": fetched_at,
    }

    locations = [
        {"city": "Etobicoke", "address": "10 Westmore Drive, Etobicoke, ON", "phone": "416-740-3262", "fax": ["416-745-8288", "416-642-0874"]},
        {"city": "Brampton", "address": "80 Pertosa Drive, Unit 21-22, Brampton, ON", "phone": "905-460-0009", "fax": ["905-790-0030"]},
        {"city": "Brampton", "address": "10 Pannahill Drive, Brampton, ON", "phone": "905-913-8018", "fax": ["905-913-8016"]},
        {"city": "Brampton", "address": "2120 North Park Drive, Unit 6, Brampton, ON", "phone": "905-793-1338", "fax": ["905-793-1517"]},
        {"city": "Brampton", "address": "40 Lacoste Blvd, Unit 23-24, Brampton, ON", "phone": "905-794-8109", "fax": ["905-794-4927"]},
        {"city": "Brampton", "address": "10510 Torbram Road, Brampton, ON", "phone": "905-790-0030", "fax": ["905-790-0031"]},
        {"city": "Brampton", "address": "621 Wanless Drive, Unit 1-2, Brampton, ON", "phone": "905-495-3336", "fax": ["905-495-7770"]},
        {"city": "Mississauga", "address": "1075 Ceremonial Dr, Mississauga, ON L5R 2Z4", "phone": "905-502-1600", "fax": ["905-502-1600"]},
    ]
    for location in locations:
        location["source_url"] = f"{BASE_URL}/locations"

    knowledge_base = {
        "facts": [
            {"topic": "about", "answer": "Asian Food Centre describes itself as a one-stop shop for grocery, meat, sweets, and takeaway needs, with fresh produce, fresh and marinated meat, and groceries from many brands.", "source_urls": [f"{BASE_URL}/about-us"]},
            {"topic": "assortment", "answer": "The site highlights fruits, vegetables, dairy, rice, flour, daal, spices, pickles, frozen food, housewares, herbal products, meat, sweets, and takeaway food.", "source_urls": [f"{BASE_URL}/about-us"]},
            {"topic": "specials", "answer": "The brand invites customers to check weekly in-store specials; the website also has New Products, On Sale, Best Sellers, and Monthly Flyer links.", "source_urls": [BASE_URL, f"{BASE_URL}/about-us", f"{BASE_URL}/monthlyflyer"]},
            {"topic": "delivery", "answer": "The homepage advertises free delivery for orders over CAD 99. The dedicated delivery page currently says 'Coming Soon', so delivery area, timing, and eligibility should be confirmed with the store.", "source_urls": [BASE_URL, f"{BASE_URL}/delivery"]},
            {"topic": "pickup", "answer": "The homepage advertises online-order pickup. The dedicated curbside-pickup page currently says 'Coming Soon', so pickup instructions should be confirmed with the selected store.", "source_urls": [BASE_URL, f"{BASE_URL}/curbside-pickup"]},
            {"topic": "locations", "answer": "The website lists eight stores: one in Etobicoke, six in Brampton, and one in Mississauga.", "source_urls": [f"{BASE_URL}/locations"]},
            {"topic": "returns", "answer": "Sale and gift/voucher-card purchases are final sale. Opened or tampered items cannot be returned. Perishable goods, produce, and hot foods cannot be returned; customers should ask store management about specific cases.", "source_urls": [f"{BASE_URL}/return-policy"]},
            {"topic": "product_availability", "answer": "Catalog availability and prices can change. Confirm against the live store before checkout.", "source_urls": [BASE_URL, f"{BASE_URL}/disclaimers"]},
            {"topic": "contact", "answer": "Call +1 416-740-3262 or email info@afcgrocery.com.", "source_urls": [BASE_URL]},
            {"topic": "customer_accounts", "answer": "The site supports customer registration and login, favourites/wishlist, profile access, and order history.", "source_urls": [BASE_URL, f"{BASE_URL}/customer/login", f"{BASE_URL}/customer/register"]},
            {"topic": "book_a_time", "answer": "The site displays a Book A Time feature, but opening it while signed out redirects to customer login.", "source_urls": [f"{BASE_URL}/book-a-time"]},
            {"topic": "careers", "answer": "The site accepts online applications for Cashier, General Labour, Restaurant, Meat Shop, Customer Service, and Other positions. Applicants provide availability and upload a PDF or DOC resume up to 300 KB.", "source_urls": [f"{BASE_URL}/career"]},
            {"topic": "mobile_apps", "answer": "App Store and Play Store badges appear on the site, but their links are placeholders rather than active store destinations.", "source_urls": [BASE_URL]},
            {"topic": "social_media", "answer": "Facebook and Twitter icons appear on the site, but their links are placeholders rather than active profile destinations.", "source_urls": [BASE_URL]},
            {"topic": "covid_pages", "answer": "The COVID-19 Response and COVID-19 Delivery pages currently say 'Coming Soon' and should not be treated as current operational guidance.", "source_urls": [f"{BASE_URL}/covid-19-response", f"{BASE_URL}/covid-19-delivery"]},
            {"topic": "terms", "answer": "Using Asian Food Centre services indicates acceptance of its terms, and the site states that terms may change without notice.", "source_urls": [f"{BASE_URL}/terms-of-use", f"{BASE_URL}/terms-conditions"]},
            {"topic": "service_disclaimer", "answer": "The site says information is believed accurate when posted but is not guaranteed at all times; services are provided as-is and third-party links are used at the visitor's own risk.", "source_urls": [f"{BASE_URL}/disclaimers"]},
            {"topic": "termination", "answer": "The terms state that Asian Food Centre may terminate or limit access to services, including for terms or intellectual-property violations.", "source_urls": [f"{BASE_URL}/termination"]},
            {"topic": "legal_liability", "answer": "The site includes indemnity and limitation-of-liability terms covering use of its services, third-party links, errors, delays, and circumstances outside its control.", "source_urls": [f"{BASE_URL}/indemnity", f"{BASE_URL}/limitation-on-liability"]},
        ],
        "bot_guardrails": [
            "Treat prices and stock as a snapshot, not a guarantee.",
            "Do not promise delivery coverage or timing when the site does not specify it.",
            "For returns involving perishables, opened products, or unusual circumstances, refer the customer to store management.",
            "When a location-specific answer is needed, ask which store the customer means.",
            "Do not present placeholder app-store or social links as working destinations.",
            "Do not treat the site's COVID pages as current guidance because their content is only 'Coming Soon'.",
        ],
        "fetched_at": fetched_at,
    }

    site_pages = [
        {"label": "Home", "url": BASE_URL, "purpose": "Brand overview, categories, featured/new/bestselling products"},
        {"label": "Locations", "url": f"{BASE_URL}/locations", "purpose": "Store addresses, phone numbers, and fax numbers"},
        {"label": "About Us", "url": f"{BASE_URL}/about-us", "purpose": "Assortment, mission, and goal"},
        {"label": "New Products", "url": f"{BASE_URL}/categorysearch?new=1&title=new", "purpose": "New-product catalog"},
        {"label": "On Sale", "url": f"{BASE_URL}/categorysearch?onsale=1&title=on_sale", "purpose": "Sale catalog"},
        {"label": "Best Sellers", "url": f"{BASE_URL}/categorysearch?term=&category=&best_seller=1&limit=30&title=best_seller", "purpose": "Best-seller catalog"},
        {"label": "Monthly Flyer", "url": f"{BASE_URL}/monthlyflyer", "purpose": "One-page flyer PDF"},
        {"label": "Return Policy", "url": f"{BASE_URL}/return-policy", "purpose": "Return exclusions and final-sale rules"},
        {"label": "Delivery", "url": f"{BASE_URL}/delivery", "purpose": "Currently marked Coming Soon"},
        {"label": "Curbside Pickup", "url": f"{BASE_URL}/curbside-pickup", "purpose": "Currently marked Coming Soon"},
        {"label": "How It Works", "url": f"{BASE_URL}/how-it-works", "purpose": "Currently marked Coming Soon"},
        {"label": "Careers", "url": f"{BASE_URL}/career", "purpose": "Online employment application"},
        {"label": "Login", "url": f"{BASE_URL}/customer/login", "purpose": "Customer account login"},
        {"label": "Registration", "url": f"{BASE_URL}/customer/register", "purpose": "New customer account"},
    ]

    manifest = {
        "source": BASE_URL,
        "fetched_at": fetched_at,
        "scope": "Public website content only; no account, checkout, or customer data.",
        "counts": {
            "top_level_categories": len(categories),
            "category_nodes": sum_category_nodes(categories),
            "products": len(products),
            "locations": len(locations),
        },
        "files": ["brand.json", "categories.json", "products.json", "locations.json", "knowledge_base.json", "site_pages.json"],
    }

    write_json("brand.json", brand)
    write_json("categories.json", categories)
    write_json("products.json", products)
    write_json("locations.json", locations)
    write_json("knowledge_base.json", knowledge_base)
    write_json("site_pages.json", site_pages)
    write_json("manifest.json", manifest)
    print(json.dumps(manifest, indent=2))


def sum_category_nodes(categories: list[dict]) -> int:
    return sum(1 + sum_category_nodes(category["children"]) for category in categories)


if __name__ == "__main__":
    main()
