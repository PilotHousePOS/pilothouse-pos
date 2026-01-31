# Animal House Pet Store

## Overview
The Animal House Pet Store project is a mobile-first web application for online retail of exotic reptiles, pet supplies, and professional grooming services. It aims to provide an intuitive user experience, streamline product and service management, ensure secure transactions, and cultivate customer loyalty. The project's vision is to become a leader in the exotic pet retail and service industry through specialized inventory, robust e-commerce capabilities, and a seamless user experience.

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
- Product Recommendations ("You May Also Like"): Smart cross-category recommendations based on product type.
- Extended Product Information: Sourced from reliable retailers (Chewy, Amazon, manufacturer websites).
- Data Quality Validation Rules:
  - Wet vs Dry Food Ingredients: Wet food (cans, stews, broths, entrees) ingredients differ significantly from dry food (kibble, bags). Never copy dry food ingredients to wet food products.
  - Product Format Detection Rules:
    - Bone broth toppers (Come-Pooch-A): Must start with "[protein] bone broth" (e.g., "Turkey bone broth, liquid Lactobacillus...")
    - Canned wet food (13oz, 5.5oz cans): Must start with "[protein], [protein] broth" (e.g., "Chicken, chicken broth, chicken liver...")
    - Stews/Entrees: Must start with fresh meat + broth (e.g., "Beef, beef broth, beef liver, tapioca starch...")
    - Dry kibble (4lb, 26lb, 30lb bags): Can start with meat meals (e.g., "Chicken meal, whole grain sorghum...")
  - Protein Source Matching: Ingredients must match the product's advertised protein. Cross-check first 3-5 ingredients against product name.
  - Format-Specific Data: Each product variant (5.5oz can vs 4lb bag) needs format-specific ingredients from manufacturer website.
  - Red Flag Patterns (indicates wrong ingredients copied):
    - Wet food with "Chicken Meal" or "Beef Meal" in first 3 ingredients
    - Bone broth products with grains (brown rice, barley, oatmeal)
    - Canned food with moisture <70% in guaranteed analysis
  - Verification Process: Always search official manufacturer website for exact product page, confirm ingredients match product size and format before updating.
- MANDATORY Manufacturer Website Verification Process (NEVER skip this):
  - DO NOT assume existing data is correct - Always verify against actual manufacturer website
  - DO NOT copy ingredients from other products - Each product needs its own verified data
  - Step 1: Use `web_fetch` to load the actual manufacturer product page URL
  - Step 2: Copy ingredients EXACTLY as shown on manufacturer website (including order and spelling)
  - Step 3: Copy guaranteed analysis table with exact percentages from manufacturer
  - Step 4: Only then run UPDATE query with verified data
- Multi-Image Collection Strategy:
  - Pull ALL available product photos from Amazon, Chewy, or manufacturer websites
  - Image order matters: First image = main display, subsequent images append in carousel order
  - Photo types to collect for each product: Main product image, Brand marketing graphics, Quality/ingredients graphics, Size comparison photos, Feeding guidelines/charts, Guaranteed analysis images, Back of package.
- Image Validation Rules (CRITICAL - Product Type Matching):
  - **SIZE = FORMAT (MANDATORY):**
    - oz sizes (2.8oz, 2.9oz, 5.5oz, 5.8oz, 12.8oz, 13oz) = CAN/WET FOOD - Must show can image
    - lb sizes (3.5lb, 7lb, 15.5lb, 22lb, 30lb) = BAG/DRY FOOD - Must show bag image
    - NEVER show a bag image for an oz-sized product (e.g., 5.8oz is a CAN, not a bag!)
    - NEVER show a can image for a lb-sized product (e.g., 7lb is a BAG, not a can!)
  - **EXACT SIZE MATCHING:**
    - 5.8oz can ≠ 13oz can - Different can sizes have different images
    - Search for exact weight match on manufacturer website
    - Verify the weight shown on the can/bag image matches the product weight
  - **FLAVOR MATCHING:**
    - Chicken product = Chicken image (never Salmon, Beef, Tuna)
    - Salmon product = Salmon image (never Chicken, Turkey, Beef)
    - Tuna product = Tuna image (never Chicken, Salmon)
    - Check the flavor text on the can/bag matches the product name
  - **SINGLE vs VARIETY PACK:**
    - Single can/bag products MUST show single can/bag image
    - NEVER use variety pack images (showing "12 POUCHES", "VARIETY PACK") for individual items
    - Variety pack images show multiple flavors - these are WRONG for single products
  - Species Matching: Cat products MUST show cat food images, dog products MUST show dog food images. Never mix species.
  - Red Flag Image Patterns to AVOID:
    - Product is "5.8oz" but image shows a bag = WRONG
    - Product is "7lb" but image shows a can = WRONG
    - Product is "Beef" but image shows "Chicken" = WRONG
    - Product is single can but image shows "VARIETY PACK" or "12 POUCHES" = WRONG
    - Product is "13oz" but can label shows "5.8 oz" = WRONG
  - **DESCRIPTION FORMAT MUST MATCH SIZE (CRITICAL):**
    - oz sizes MUST have descriptions saying "wet", "canned", or "can" - NEVER "dry" or "kibble"
    - lb sizes MUST have descriptions saying "dry", "kibble", or "bag" - NEVER "wet" or "canned"
  - Fix Process:
    1. Extract EXACT weight from product name (5.8oz, 13oz, 7lb, etc.)
    2. Extract EXACT flavor from product name (Chicken, Beef, Salmon, etc.)
    3. Search manufacturer website for that EXACT size + flavor combination
    4. Verify image shows correct weight on label before using
    5. Verify image shows correct flavor on label before using
    6. Verify image is single product (not variety pack) before using
- Item-Specific Descriptions (NOT Generic):
  - Descriptions must be product-specific, pulled directly from Chewy/Amazon product pages
  - NOT generic catch-all descriptions that apply to multiple products
  - Include key features, benefits, and specifications unique to that exact item.
- ExaTouch POS Fields to Populate:
  - MfgPart: Manufacturer part number
  - Color: Product color variant (based on packaging band color)
  - Size: Product size
  - Style: Product style/variant
- **POS Color Assignment Rules by Brand:**
  - **Science Diet Color Rules (based on packaging band):**
    - Puppy & Kitten = Green band
    - Small & Mini / Little Bites = Pink band
    - Specialty (Hairball, Sensitive, Urinary, Vitality, Perfect Digestion) = Silver band
    - Light products = Red band (NOT specialty)
    - Regular Adult & Senior (7+, 11+) = Red band
    - Treats = Red band (EXCEPT Flexi-Stix, Soft-Baked, Grain Free Crunchy)
    - Flexi-Stix = Burgundy/Purple band
    - Soft-Baked treats (Soft Chicken, Soft Beef, Soft Duck) = Green/Lime band
    - Grain Free Crunchy Naturals = Green/Lime band
  - **NutriSource Color Rules (use AI Vision for packaging detection):**
    - Chicken & Rice (dry bags) = Blue
    - Beef products = Burgundy
    - Lamb products = Tan (orange-brown)
    - Senior products = Brown
    - Weight Management = Green
    - Seafood/Salmon = Red
    - Classic Catch / Country Select = Teal
    - Elements dry food bags = Black
    - Elements Crispy Crispers (treats only) = Purple
    - Chompy Chompers = Purple
    - Grillin' Grillers = Purple
    - Little Bites (most) = Purple
    - Chicken Lamb & Fish 13oz can = Burgundy (red can)
    - Large Breed Puppy = Purple
- **CRITICAL DATA SOURCING RULES - NEVER GUESS:**
  - **ALWAYS use manufacturer websites FIRST** for ALL product information including:
    - Descriptions (copy EXACT text, never paraphrase)
    - Ingredients (copy EXACTLY as shown, including order and spelling)
    - Guaranteed analysis (exact percentages)
    - Photos/images (all available product images)
    - Sizing, features, benefits
  - **EXHAUST ALL RESOURCES before stopping:**
    1. Official manufacturer website (MANDATORY first stop)
    2. Chewy.com product pages
    3. Amazon product listings
    4. Other verified retailer sites
  - **IF information is too complex to port over:** Summarize key points but note the source
  - **ONLY stop trying and ask user for help** when all resources are exhausted
  - **IF UNSURE about anything - ASK FIRST, never guess**
  - **NEVER create, paraphrase, or assume product information**
  - Use `web_fetch` tool to load actual manufacturer product pages
  - Copy text EXACTLY as displayed - do not reword or interpret
- Data Sources Priority:
  1. Official manufacturer websites (MANDATORY - most accurate)
  2. Chewy.com product pages (detailed, verified)
  3. Amazon product listings (comprehensive)
  4. Product packaging (for ingredients/analysis)
- SKU = UPC: The SKU field is used for UPC codes. All UPC data is stored in the SKU field. Manual UPC assignments (SKU values in production) must be preserved during sync/import. UPCs must be validated for leading zeros and standard 12-digit length. UPC prefix must match brand's known prefix. Attribute-based matching (size, wattage, weight, dimension, count) is critical for exact product identification.
- PROTECTED FIELDS (NEVER modify via scripts):
  - `sku` (UPC codes) - Manually curated, must always persist
  - `name` (Product titles) - Manually curated, must always persist
  - All scrapers/automation must explicitly exclude these fields from updates
- Testing Credentials:
  - Email: theanimalhouse@comcast.net
  - Password: password
  - Role: Admin
  - Login Flow: Navigate to main page (/), click "Start Now", enter credentials. Do NOT bypass the main page.
- MANDATORY Product Data Checklist (CRITICAL - Never Skip)
### Required Fields for ALL Products:
1. **image_urls** (array) - Minimum 6 carousel images from manufacturer website
2. **guaranteed_analysis** - Protein %, Fat %, Fiber %, Moisture % (exact from manufacturer)
3. **ingredients** - Complete ingredient list (100+ characters, copied EXACTLY from manufacturer)
4. **instructions** - Feeding guidelines with calorie info
5. **instruction_label** - Label for instructions (e.g., "Feeding Guidelines")
6. **size** - Product size (e.g., "12.5oz", "4lb", "30lb")
7. **color** - POS color based on brand rules (see Color Assignment Rules above)
8. **style** - Product line and format (e.g., "Frommbalaya - Can", "Four-Star - Dry")
9. **description** - Product-specific description from manufacturer (NOT generic)
### Common Mistakes to NEVER Make Again:
1. **Adding products without carousel images** - ALWAYS fetch 6+ images from manufacturer page
2. **Missing guaranteed analysis** - ALWAYS copy protein/fat/fiber/moisture percentages
3. **Short/missing ingredients** - ALWAYS copy FULL ingredient list (100+ chars minimum)
4. **Missing feeding instructions** - ALWAYS include daily feeding amounts and calorie info
5. **Missing size/color/style** - ALWAYS populate POS fields for inventory management
6. **Using INSERT without complete data** - NEVER insert a product row without ALL fields
### Mandatory Workflow for Adding Products:
```
Step 1: web_fetch manufacturer product page
Step 2: Extract ALL data fields (images, analysis, ingredients, feeding, etc.)
Step 3: Prepare UPDATE/INSERT with ALL required fields populated
Step 4: Run verification query after update to confirm data saved
Step 5: NEVER mark task complete until verification passes
```
### Brand-Specific Manufacturer URLs:
- **Fromm**: https://frommfamily.com/products/dog/ or /cat/
- **NutriSource**: https://nutrisourcepetfoods.com/products/
- **Science Diet**: https://hillspet.com/dog-food or /cat-food
- **Blue Buffalo**: https://bluebuffalo.com/
- **Pro Plan**: https://purina.com/pro-plan/

## System Architecture
The Animal House Pet Store application is a full-stack, mobile-first web solution designed for robust e-commerce and service management.

**UI/UX Decisions:**
- Employs a dark, bold, and high-contrast aesthetic.
- Features Amazon-style image carousels for product displays.
- Utilizes full-screen modal forms and prominent warning banners for optimal mobile interaction.
- Implements a consistent universal admin dashboard for unified navigation and management.

**Technical Implementations & Feature Specifications:**
- **Core Management**: Includes comprehensive inventory tracking, multi-image upload capabilities, and advanced appointment scheduling with 15-minute intervals, admin approval, notifications, and Google Calendar synchronization. Custom pricing and AI-powered photo uploads for order processing are also integrated.
- **Authentication & Authorization**: Built with JWT tokens for secure authentication, supporting password resets and user settings. Features a three-tier role-based access control system (Customer, Groomer, Admin).
- **Specialized Systems**: Incorporates customer wishlists, deep Google Calendar integration, a CMS for animal categories and subcategory filtering, extensive admin order management, and sophisticated search functionalities.
- **Advanced Management**: Features database synchronization, automated product categorization, live animal detection, category cleanup, smart abbreviation expansion, and automated brand extraction.
- **Admin Tools**: A dedicated dashboard is provided for managing product images, employee schedules, and grooming appointments.
- **AI & Integrations**: Leverages OpenAI's GPT-5 Vision for AI-powered processing of order photos, item extraction, and categorization.
- **UPC Matching System**: A robust system handles UPC matching, including abbreviation expansion, text normalization, brand mappings, validation, and brand prefix expansion.

**System Design Choices:**
- **Frontend**: Utilizes React, Vite, TypeScript, Tailwind CSS, and shadcn/ui.
- **Backend**: Developed with Express.js and TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: JWT tokens stored in cookies.
- **State Management**: TanStack Query.
- **Routing**: Wouter.
- **Development Practices**: Strict TypeScript, proper HTTP status codes, environment-aware configurations.

## External Dependencies
- PostgreSQL
- Drizzle ORM
- SendGrid
- Twilio
- Google Calendar
- Astro Loyalty
- OpenAI (AI Vision)