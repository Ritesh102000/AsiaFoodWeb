# AFC Grocery prototype dataset

This directory contains a public-data snapshot from [afcgrocery.com](https://afcgrocery.com) for a chatbot demo and prototype website.

## Files

- `brand.json` — brand positioning, contact details, and homepage service promises
- `categories.json` — full nested category taxonomy from the site's public category endpoint
- `products.json` — featured, new, and bestselling homepage products with prices, stock flags, URLs, and image URLs
- `locations.json` — the eight locations displayed on the website
- `knowledge_base.json` — concise customer-service answers and bot guardrails
- `site_pages.json` — important customer-facing routes and what each page is for
- `manifest.json` — extraction timestamp, scope, and record counts

Prices, stock, promotions, and operational details can change. They should be presented as prototype data unless verified against the live site at the time of use.

## Refresh

From the project root, run:

```bash
python3 scripts/scrape_afc.py
```

The collector reads only public pages and endpoints. It does not log in, place orders, or collect customer data.
