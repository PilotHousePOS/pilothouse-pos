# Animal House Pet Store

## Overview
The Animal House Pet Store is a mobile-first e-commerce platform specializing in exotic reptiles, pet supplies, and grooming services. Its core purpose is to establish itself as the premier online destination for exotic pet owners, driving market expansion, fostering customer loyalty, and enhancing the overall online shopping experience to ensure continuous business growth.

## Agent Rules (Non-Negotiable)
- **NEVER guess at a fix.** Before changing any code, read the actual logs, error output, or data that describes the problem. Every fix must be justified by evidence from the logs or code — not by assumption.
- **Debugging process:** Check logs first → identify the exact cause → make one targeted fix → verify with logs again. Do not chain multiple speculative changes.
- **Invoice scanner:** When scans return 0 items, ALWAYS fetch deployment logs and read the raw response content before touching any code. The model may refuse (returns `{"error":"..."}` instead of `{"items":[]}`), hit token limits (finish_reason: `length`), or have a prompt regression. Each has a different fix.

## User Preferences
- Dark, bold design aesthetic with strong contrast.
- No free services - but don't display prices in booking appointments.
- Remove vet care and training services completely - only grooming services offered.
- Add exotic reptiles as specialty instead of training.
- Customer login should redirect to full-access customer homepage, not welcome page.
- Authentication must work reliably without session persistence issues.
- Booking restrictions: No appointments on Sundays, no appointments after 1:30 PM.
- Grooming services: Only "Bath Only" and "Full Grooming" options.
- Mobile authentication consistency: Same account should show identical admin access across devices.
- Inventory Management: Full product names and descriptions preserved from Excel imports (no abbreviations).
- Search Functionality: All searches (supplies, pets) with intelligent typo tolerance and brand expansion.
- Supply Filtering: Centralized, research-based filtering system with proper brand/keyword separation (server/filterConfig.ts).
- Food vs Treat Categorization by Size: For freeze-dried products (Vital Essentials, etc.), products >3oz are categorized as food (dogFood/catFood), products ≤3oz as treats (dogTreats/catTreats). Patties, nibbles, and mini pate in larger sizes are food; bites and small portions are treats.
- Loyalty Multiplier: Only dogFood and catFood categories earn 25% loyalty — all other categories earn at the full rate.
- Charge Accounts: Users flagged `isChargeAccount=true` get no convenience fee, no loyalty rewards, no Astro integration. Orders placed as `paymentStatus='charge_account'` — no Stripe charge occurs. Admin can toggle charge account status in the Users section. Cart shows orange "Charge Account" notice instead of payment info.
- Product Recommendations ("You May Also Like"): Smart cross-category recommendations based on product type.
- Extended Product Information: Sourced from reliable retailers (Chewy, Amazon, manufacturer websites).
- Wet vs Dry Food Ingredients: Wet food (cans, stews, broths, entrees) ingredients differ significantly from dry food (kibble, bags). Never copy dry food ingredients to wet food products.
- Protein Source Matching: Ingredients must match the product's advertised protein. Cross-check first 3-5 ingredients against product name.
- Format-Specific Data: Each product variant (5.5oz can vs 4lb bag) needs format-specific ingredients from manufacturer website.
- ALWAYS use manufacturer websites FIRST for ALL product information including: Descriptions (copy EXACT text, never paraphrase), Ingredients (copy EXACTLY as shown, including order and spelling), Guaranteed analysis (exact percentages), Photos/images (all available product images), Sizing, features, benefits.
- Image Validation Rules (CRITICAL - Product Type Matching):
  - SIZE = FORMAT (MANDATORY): oz sizes (2.8oz, 2.9oz, 5.5oz, 5.8oz, 12.8oz, 13oz) = CAN/WET FOOD - Must show can image. lb sizes (3.5lb, 7lb, 15.5lb, 22lb, 30lb) = BAG/DRY FOOD - Must show bag image. NEVER show a bag image for an oz-sized product. NEVER show a can image for a lb-sized product.
  - EXACT SIZE MATCHING: 5.8oz can ≠ 13oz can - Different can sizes have different images.
  - FLAVOR MATCHING: Chicken product = Chicken image (never Salmon, Beef, Tuna). Salmon product = Salmon image (never Chicken, Turkey, Beef). Tuna product = Tuna image (never Chicken, Salmon).
  - SINGLE vs VARIETY PACK: Single can/bag products MUST show single can/bag image. NEVER use variety pack images for individual items.
  - Species Matching: Cat products MUST show cat food images, dog products MUST show dog food images. Never mix species.
- DESCRIPTION FORMAT MUST MATCH SIZE (CRITICAL): oz sizes MUST have descriptions saying "wet", "canned", or "can" - NEVER "dry" or "kibble". lb sizes MUST have descriptions saying "dry", "kibble", or "bag" - NEVER "wet", "canned".
- Item-Specific Descriptions (NOT Generic): Descriptions must be product-specific, pulled directly from Chewy/Amazon product pages.
- ExaTouch POS Fields to Populate: MfgPart, Color, Size, Style.
- POS Color Assignment Rules by Brand:
  - Science Diet Color Rules (based on packaging band): Puppy & Kitten = Green band. Small & Mini / Little Bites = Pink band. Specialty (Hairball, Sensitive, Urinary, Vitality, Perfect Digestion) = Silver band. Light products = Red band. Regular Adult & Senior (7+, 11+) = Red band. Treats = Red band (EXCEPT Flexi-Stix, Soft-Baked, Grain Free Crunchy). Flexi-Stix = Burgundy/Purple band. Soft-Baked treats = Green/Lime band. Grain Free Crunchy Naturals = Green/Lime band.
  - NutriSource Color Rules (use AI Vision for packaging detection): Chicken & Rice (dry bags) = Blue. Beef products = Burgundy. Lamb products = Tan (orange-brown). Senior products = Brown. Weight Management = Green. Seafood/Salmon = Red. Classic Catch / Country Select = Teal. Elements dry food bags = Black. Elements Crispy Crispers, Chompy Chompers, Grillin' Grillers = Purple. Little Bites (most) = Purple. Chicken Lamb & Fish 13oz can = Burgundy (red can). Large Breed Puppy = Purple.
- SKU = UPC: The SKU field is for UPC codes. All UPC data is stored in the SKU field. Manual UPC assignments must be preserved. UPCs must be validated for leading zeros and standard 12-digit length. UPC prefix must match brand's known prefix.
- PROTECTED FIELDS (NEVER modify via scripts): `sku` (UPC codes), `name` (Product titles).
- MANDATORY Product Data Checklist (CRITICAL - Never Skip):
  1. `image_urls` (array) - Minimum 6 carousel images from manufacturer website
  2. `guaranteed_analysis` - Protein %, Fat %, Fiber %, Moisture % (exact from manufacturer)
  3. `ingredients` - Complete ingredient list (100+ characters, copied EXACTLY from manufacturer)
  4. `instructions` - Feeding guidelines with calorie info
  5. `instruction_label` - Label for instructions (e.g., "Feeding Guidelines")
  6. `size` - Product size (e.g., "12.5oz", "4lb", "30lb")
  7. `color` - POS color based on brand rules (see Color Assignment Rules above)
  8. `style` - Product line and format (e.g., "Frommbalaya - Can", "Four-Star - Dry")
  9. `description` - Product-specific description from manufacturer (NOT generic)
- Groomer Daily Limit: Each groomer can accept max 5 full grooming appointments per day. Bath-only appointments do NOT count toward this limit.
- Email Verification: New accounts must verify their email within 24 hours or the account is locked. Existing accounts are pre-verified. Resend option available.
- Push Notifications: Web Push via VAPID keys, PWA-compatible service worker with pushsubscriptionchange auto-rescribe.
- Marketing Email Opt-Out: Users can opt out of marketing emails in profile. Order emails and important updates bypass opt-out.
- Order Confirmation Email: Sent immediately to customer with full item breakdown and pricing. Bypasses marketing opt-out.
- Abandoned Cart Recovery: Scheduled every 6 hours, emails customers whose entire cart has been idle 24+ hours. Respects marketing opt-out. 3-day cooldown.
- Astro Deal Auto-Application: For linked Astro customers, cart automatically detects eligible manufacturer deals (via eligiblePurchaseItems + listOffers cross-reference). Only "Online & In-Store" offer-type programs are applied. Supports $X OFF (rebate), BOGO, and Buy X Get Y $OFF deal types. Deal discount applied pre-tax.

## System Architecture
- **UI/UX:** Features a dark, bold, high-contrast design complemented by Amazon-style image carousels.
- **Authentication:** Implements JWT-based authentication with a robust three-tier, role-based access control system.
- **Frontend:** Built with React, Vite, and TypeScript, utilizing Tailwind CSS for styling, shadcn/ui for components, Wouter for routing, and TanStack Query for data fetching.
- **Backend:** Developed using Express.js and TypeScript.
- **Database & ORM:** PostgreSQL is used as the database, managed through Drizzle ORM.
- **Key Features:** Includes automated product categorization, advanced live animal detection, intelligent category cleanup, smart abbreviation expansion, real-time Web Push Notifications, and online employment application system.
- **Job Applications:** Public `/apply` route serves a full Louisiana employment application form (no login required). Submissions stored in `job_applications` table and managed in the admin panel under the "Applications" tab with status tracking (pending/reviewed/interview/hired/rejected) and admin notes.

## External Dependencies
- PostgreSQL
- Drizzle ORM
- SendGrid (Email services)
- Twilio (SMS services)
- Google Calendar (Scheduling)
- Astro Loyalty (Loyalty program integration)
- OpenAI (AI Vision capabilities)
- Electronic Payments (Payment gateway services)