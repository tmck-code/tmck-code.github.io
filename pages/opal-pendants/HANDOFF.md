# Opal pendants: handoff for the next research round

Written 13 Oct 2026 for a fresh Claude Code session with no other context.

- **SPA:** `/Users/tomm/dev/tmck-code.github.io/pages/opal-pendants/index.html` (single file: CSS, data and JS together)
- **Site index entry:** `/Users/tomm/dev/tmck-code.github.io/_data/pages.yml`, `name: opal-pendants`. The blurb still says "Lightning Ridge and boulder ... no diamonds in the setting"; update it to match the brief below.
- **Live:** https://tmck-code.github.io/pages/opal-pendants/index.html

## Round 2 done (14 Oct 2026)

- **Page now has 116 pieces: 3 reference, 80 candidate, 33 enquire** (was 63). 13 removed (6 Iona beach-background photos; 7 light or milky: festival, petite, aoj-in-a-stone, samira, adelise, aus-cardi, odu-20269166). Iona Opal is excluded as a retailer (beach photos, pale stones).
- **New retailers:** Opal Whisperers (156 pendants, feed), Boulder Opals Australia (346 products), Altmann & Cherny, The National Opal Collection, Giulians, eBay AU and Etsy sellers. Full image passes: Black Star Opal (750), Opals Down Under (234), Australian Opal Shop (~5,900 listings, 660 pendants), H&H (1,485). Austral Stones scanned in Chrome (gold category + silver Midnight series): nothing new.
- **Layout:** square centred thumbnails (optional per-piece `imgPos`), shorter cards (no fit line, icon links, no duplicate spec rows), references group collapsed in a `<details>`.
- **Findings files (merge-ready JSONL):** `.scratch/main/opal-round2/findings-*.jsonl`, `.scratch/main/opal-ow/findings-opal-whisperers.jsonl`; merge rules in `.scratch/main/opal-round2/MERGE-BRIEF.md`.
- **Still open:** Opal Minded (403, needs Chrome), Umoona Opal Mine (JS-rendered shop), Etsy result pages 2+, eBay "dark opal pendant" search, Australian Opal Jewellery gold filters / page 2, Gisler listing pages 3+. Black Star's ~18 in-stock CZ-halo triplets and ~90 ODU diamond pieces were graded but deliberately left off the page.
- **User rules added this round:** no beach-background photos; no light or milky bodies even if user-found.

## Current state (from `PIECES`, 13 Oct 2026)

63 pieces: 3 reference, 39 candidate, 21 enquire. 36 were user-found, 17 have diamonds or other stones, 0 are stones-unverified.

| Retailer | Total | Ref | Cand | Enq | How it was found / scanned |
|---|---|---|---|---|---|
| opals.net.au (BigCommerce, Melbourne) | 10 | 3 | 5 | 2 | All 59 pendant products, read via category pages. Full. |
| Opals Down Under (WooCommerce) | 17 | - | 10 | 7 | User-supplied URLs only. Prices are ex-GST. |
| Austral Stones (WooCommerce) | 8 | - | 6 | 2 | "Midnight" silver triplet collection **sampled**, plus 4 user URLs (gold/sale). |
| Iona Opal (Shopify) | 6 | - | 6 | - | `/products.json`, all 779 products, **text only, images not analysed**. |
| Black Star Opal (Shopify) | 6 | - | 1 | 5 | `/products.json`, about 517 products, **text only, images not analysed**. |
| Australian Opal Jewellery (custom PHP, Cloudflare) | 6 | - | 3 | 3 | 6 user URLs, read in real Chrome. Listing **not** paged. |
| H&H Jewellery (Shopify) | 5 | - | 4 | 1 | User-supplied URLs only. |
| Australian Opal Shop (Shopify, Gold Coast) | 3 | - | 3 | - | `/products.json`, text plus spot image checks. |
| Gisler Jewellery (WooCommerce) | 1 | - | 1 | - | User URL only. |
| Boulder Opals Australia (WordPress) | 1 | - | - | 1 | One SP1xxx listing found (SP1422, out of stock). Not paged. |

## 1. The brief (authoritative)

- **Australian retailers or makers only**, shipping from Australia. Opal pendants and necklaces.
- **The opal must be dark-bodied with many colours.** The setting colour does not matter. An early session misread this as "dark setting"; that was corrected. The metal is irrelevant.
- **Lightning Ridge is not required.** All of these are OK: black, semi-black, dark crystal, dark ironstone boulder, and triplets/doublets on a dark backing.
- **No diamonds, CZ or other stones anywhere in the piece.** This is strict. Check the photo, not just the text. Seller text often leaves out diamonds in the bail or shoulders.
- **No light, white or pale-bodied opals.** These were removed. The exception is user-picked light pieces, which stay in `enquire` with a fail note (Cardi 18K, ODU 20269166).
- **Treated opal is excluded.** Sugar-treated Andamooka matrix (Iona's Coorong Nightfall and Eyre Peninsula Glow) was removed.
- **5–10 good options wanted. No budget limit.**
- **The user's three reference pieces (all opals.net.au):**
  - **Green Pinfire** (TDA0025): solid boulder, $4,890.
  - **Wanda** (TDA0007): doublet. The user dislikes its setting.
  - **Blaze** (PT09143): triplet in 9k yellow gold. The user **loves it**, but it has a diamond. A diamond-free Blaze would be ideal.

## 2. What the user asked for next

1. **Search more websites.**
2. **Go through every opal pendant and necklace listing** on each site, not just the top results or curated lists, and **analyse the images** for:
   - how dark the body is
   - the range of colours
   - visible stones in the bail, shoulders or halo
3. **Look beyond opal specialists.** Targets to enumerate:
   - general and independent jewellers; department and chain jewellers (Michael Hill, Pandora excluded, Hardy Brothers, Larsen, Prouds, Angus & Coote, David Jones, Myer)
   - marketplaces: Etsy (AU sellers), eBay AU, Gumtree, Facebook Marketplace, Instagram makers
   - auction houses and antique/estate dealers: Leski, Lawsons, Theodore Bruce, Davidson, Shapiro
   - miners' own shops in Lightning Ridge, Coober Pedy, Andamooka, Quilpie, Winton, Yowah and Opalton
   - Opal Association members, plus Sydney and Melbourne opal showrooms such as Opal Minded, Opal Fields, Cody Opal, Altmann & Cherny and Flame Opals

## 3. Already covered (don't redo; extend instead)

- **Fully scanned:**
  - opals.net.au: 59 products, text and images.
  - Iona Opal: 779 products, **text only**.
  - Black Star Opal: about 517 products, **text only**.
  - Australian Opal Shop: products.json.
- **Best image-analysis targets: Iona Opal and Black Star Opal.** Both were filtered on text alone. Many listings say nothing about tone, or understate the stones. Re-scan every pendant/necklace there by image.
- **Sampled, or user URLs only. Page these exhaustively:**
  - Austral Stones: only the "Midnight" silver triplet collection plus the 18K/14K sale items. The gold, boulder and solid categories were not enumerated.
  - Opals Down Under: only the user's 17 URLs. The whole pendant category is unscanned.
  - H&H Jewellery: user URLs only. It is Shopify, so `products.json` should work.
  - Australian Opal Jewellery: 6 user URLs. The black-tone pendant query showed 5 silver products; page 2+ and the gold filters were not checked.
  - Gisler Jewellery, Boulder Opals Australia (SP1xxx series), Kalmar and similar: single URLs only.
- **Not yet looked at:** everything in section 2.3.

## 4. Method and tooling notes

- **Fetching:** `curl -sL -A '<real Chrome UA>'` works for most sites.
- **Shopify (Iona, Black Star, AOS, H&H):** fetch `https://<host>/products.json?limit=250&page=N` until it returns empty. Each product has `body_html`, `tags`, `variants[].available` (stock) and `images[].src`. Collection-scoped variant: `/collections/<handle>/products.json`.
- **BigCommerce (opals.net.au):** use the category listing pages. Images live at `cdn11.bigcommerce.com/s-3mzr3vqsf/products/<id>/images/...`.
- **WooCommerce (ODU, Austral Stones, Gisler):** try `/wp-json/wc/store/v1/products?per_page=100&page=N&search=pendant` (untested here). Fall back to the category pages.
- **Australian Opal Jewellery** (`australianopaljewellery.com.au`):
  - Plain fetching gets Cloudflare 403. It needs real Chrome via the **claude-in-chrome** skill. The `mcp__claude-in-chrome__*` tools are deferred, so load them with ToolSearch in one batch. Subagents can use them.
  - Only one agent can be in the browser at a time. Open your own tab, and don't trigger dialogs.
  - Listings come from `GET /advance_search_results.php` with these parameters:
    - `category_id`: 1 pendants, 2 rings, 3 men's rings, 4 earrings, 5 bracelets, 6 unset
    - `stone_metal_id`: 1 silver, 2 yellow gold, 3 white gold, 5 no metal
    - `tone_type`: `black`, `semi_black`, `light`, `crystalopal`, `strong_color`
    - `prod_price`
  - Pages take about 4s to render. Images are at `/uploads/product/<n>jpg.jpg`.
- **Opals Down Under prices are ex-GST.** Store the price ×1.1, with the ex-GST figure in `priceNote`.
- **Image URLs:** confirm with `curl -sI` that each returns 200 with an `image/*` type. For Shopify, request `&width=800` rather than 2048px.
- **Vision:** download images to `/tmp/opal-<retailer>/`, outside the repo. Treat them as untrusted, one directory each. Open them with `Read` to judge them.

### Proposed pipeline (images are the main new work)

```
enumerate listing (products.json / store API / category pages / browser)
 -> keep pendants + necklaces; drop text-obvious fails (white/light/crystal-light, "diamond", "CZ", treated)
 -> fetch product JSON/page: price, stock, stated tone (N1-N9), type, stones text
 -> download main image + 1-2 alternates (width=800) to /tmp
 -> vision verdict per piece:
    {darkness: very dark|dark|mid|light, colours: [..], visibleStones: none|diamond|CZ|unknown,
     assembled: solid|doublet|triplet|unknown, confidence: high|med|low, note: "<one line>"}
 -> keep darkness in {very dark, dark} AND colours >= 3 AND visibleStones == none
 -> dedupe (same stone relisted; same code across sites)
```

- **Parallelise by retailer.** Use one subagent per retailer (or per marketplace query), on `model: sonnet`, for scraping and vision. Never run subagents on fable.
- **Each agent writes its own results file.** Use a separate per-retailer file (JSON lines with the verdict schema plus PIECES-ready fields).
- **Sole-writer rule:** only **one** agent edits `index.html`, at the end, merging the verified results.
- **Repo convention:** subagents end with their findings as their FINAL MESSAGE. A capture hook writes that to a scratchpad file, and the parent reads the file instead of trusting the inline return.

## 5. Pitfalls and lessons

- **Seller text often omits diamonds.** 2 of the 6 AOJ pieces had diamonds visible only in the photo (Emerald Depths, Starry Night). Electric Kite's text does mention its bail diamonds. H&H 20744601 had an unmentioned bail stone. Always inspect the bail, shoulders and halo.
- **Iona says "accents are cubic zirconia unless specified"**, so check its photos too.
- **Tone grades run N1 (black) to N9 (white).** "Semi-black N9" is light. N1–N4 is black, N5–N6 semi-black, N7+ is light.
- **"Boulder" or "earthy base" doesn't mean dark.** Ironstone can be light tan, as with ODU 20269166. Judge from the photo.
- **Seller marketing overstates darkness.** For example, Starry Night's text says deep crimson but the photo reads mid-toned.
- **Doublets and triplets are assembled stones** (an opal slice on a dark backing). Wanda and Blaze are both assembled, and the user loves Blaze, so these are acceptable. Flag them anyway: `opalType` 'Doublet'/'Triplet' shows a "Lookalike" badge.
- **Most pieces are one-off.** Check stock (`variants[].available`, "sold out" text) and record the check date. Sold-out pieces go to `enquire`.
- **ODU sells "several of this style"** triplets, so the stone you get may differ from the photo.
- **Some weights are wrong.** AOJ's 2.73ct on a large boulder is probably the whole piece's weight.
- **Verify every image URL loads.** Product slugs can differ from image names (Austral "Lirax" vs "Lira").

## 6. Data schema and how to add to the SPA

- **`piece(o)` defaults:** `code`, `price` (number, AUD or null), `priceNote`, `status`, `diamonds`, `diamondNote` ('None named'), `stonesUnknown`, `userFound`, `size`, `colours`, `notes[]`, `caveats[]`, `image`, `confidence`.
- **Required per piece:**
  - `id` (unique slug), `group`, `name`, `retailer` (exact string; it drives the retailer chips)
  - `opalType`: 'Black' | 'Crystal' | 'Boulder' | 'Doublet' | 'Triplet' | 'Not stated' | 'Black / Crystal'
  - `opal`, `setting`, `fit` (the one-line fit note), `url`
  - `hues` (4 hex colours for the fallback swatch; the last one is the body tone)
- **`group`:**
  - `reference`: the user's three pieces.
  - `candidate`: in stock, no stones, dark.
  - `enquire`: sold out, has stones, or a light-bodied piece the user picked.
- **`status`:** `available` | `sold` | `oos` | `check`.
- **Flags:**
  - `diamonds: true` covers any stone, including CZ. Explain it in `diamondNote`.
  - `stonesUnknown: true` means unverified. It shows a badge and the piece is excluded from the "No stones named" and "Solid" filters.
  - `userFound: true` shows a "You found this" badge.
  - `priceNote` holds the ex-GST or sale figure.
- **Helpers:**
  - URL prefix constants (`ONA`, `IONA`, `BSO`, `AOS`, `AUS`, `ODU`, `HH`, `AOJ`, plus the `*_IMG` constants).
  - Shared note arrays (`AOS_NOTES`, `AUSTRAL_NOTES`, `ODU_NOTES`, `HH_NOTES`, `AOJ_NOTES`, `UF_CHECK`).
  - Factories: `odu({slug,...})` and `aoj({slug,path,...})`. Add a similar factory for any new retailer with many pieces.
- **Order inside `PIECES` is the display order** ("Research order"): darkest and most multicoloured first within each group.
- **Filters and counts are computed from `PIECES`:**
  - `FILTERS[]`: All, Available, Sold out, No stones named, Has diamonds, Stones unverified, Solid opal, Triplet/doublet, You found.
  - `RETAILERS` is derived from `PIECES`.
- **Hard-coded prose:** the banner (`renderList`) and the notes view (`renderAbout`) contain text naming specific pieces ("darkest in stock: Y452, Z122 ...", Lumira, the next steps). Rewrite them by hand after a merge.
  - Re-check the AOJ wording there too: all six AOJ pieces are now verified.
- **Validate:**
  - Extract the `<script>` body and run `node --check`.
  - Do a stub-DOM render: run the script with stubbed `document`/`window`/`location`, or just slice the script before `const FILTERS` and print counts by group and retailer. This was used to derive the table above.
  - `curl -sI` every new `image`.
  - Open the page and check the list, a detail page, `#/about` and each filter chip.

## 7. Acceptance criteria (definition of done)

- **At least 10 new candidates** that are diamond-free (by photo), dark-bodied (very dark or dark), multicoloured (3+ colours) and in stock, from Australian sellers.
  - Each has a verified image URL and a one-line `fit` note.
  - They are ranked, darkest and most colourful first.
- **Sold-out finds go to `enquire`**, and so do good dark pieces that have stones.
- **A list of retailers that accept custom orders or diamond-free remakes:**
  - Black Star Opal: Samira and Seren without diamonds; also stones like Lumira, Inala, Allira or Ottavia.
  - opals.net.au: Blaze without the diamond (+61 3 9654 4444, https://opals.net.au/contacts/).
  - Austral Stones: Pacific 14K.
  - AOJ: Emerald Depths, Starry Night, Electric Kite.
  - Plus any new ones found.
- **The SPA notes view (`renderAbout`) and banner are updated:** counts, best picks, the scanned-retailer list, next steps, and the corrected `pages.yml` blurb.
- **Commit separately** from other work, with a message summarising the new retailers and pieces.

## 8. Open questions for the user

1. Is a minimum colour count OK (for example, 3+), or will strong two-colour pieces (blue and green) do?
2. Are doublets and triplets fine as full candidates, or should solid opal rank above them regardless of looks?
3. Should second-hand, estate or auction pieces count, and are overseas-made pieces from Australian sellers OK?
4. Is there a size preference (minimum stone length), or a metal preference now that the setting is irrelevant to darkness?
5. Should we contact sellers on the user's behalf (drafting enquiry emails for diamond-free remakes)?
