# Animal House Pet Store

## Overview
The Animal House Pet Store project is a mobile-friendly web application designed to expand the store's online presence, enhance service accessibility, and boost product sales. It enables customers to browse pets, book grooming appointments, and purchase pet supplies, including exotic reptiles. The platform integrates inventory, customer accounts, and administration to streamline operations, broaden market reach, and improve efficiency. The project aims to become a leading online destination for pet owners, offering a seamless and comprehensive service experience.

## User Preferences
- Dark, bold design aesthetic with strong contrast
- No free services - but don't display prices in booking appointments
- Remove vet care and training services completely - only grooming services offered
- Add exotic reptiles as specialty instead of training
- Customer login should redirect to full-access customer homepage, not welcome page
- Authentication must work reliably without session persistence issues
- Booking restrictions: No appointments on Sundays, no appointments after 1:30 PM
- Grooming services: Only "Bath Only" and "Full Grooming" options
- Mobile authentication consistency: Same account should show identical admin access across devices
- Inventory Management: Full product names and descriptions preserved from Excel imports (no abbreviations)
- Search Functionality: All searches (supplies, pets) with intelligent typo tolerance and brand expansion
  - Fuzzy Search: Auto-corrects typos and finds closest matches (70% similarity threshold), searches across name, brand, and description fields, results sorted by relevance. Works across all supply pages, combines with category and filterType filters (AND logic), whitespace-only searches treated as empty searches, and search bars integrated into specialty pages with pagination support.
  - Animal Search on Specialty Pages: Independent search bars for animals on Aquatics and Exotic Reptiles pages with debounced input (500ms delay). Searches fish/reptiles by name, breed, or description.
  - Brand Name Expansion: Automatically maps abbreviated brand names to full names for better search results (server/brandNameExpansion.ts).
- Supply Filtering: Centralized, research-based filtering system with proper brand/keyword separation (server/filterConfig.ts).
  - Reptile supplies: ZooMed, Exo Terra, Zilla, Fluker's, ReptiCare brands + reptile keywords.
  - Aquatic supplies: Hikari, Tetra, Aqueon, Marineland, API, Fluval, SeaChem, GloFish, Omega One, Ocean Nutrition brands + aquatic keywords.
  - Cross-category brands (ZooMed): Make both aquatic AND reptile products - not excluded from either category, keywords determine final categorization. Zoo Med aquatic products (Aqualog, Aqua Thermometer) properly categorized via aquatic keywords.
  - Keyword priority system: Species-specific keywords (60pts) override brand scoring (40pts) for accurate categorization.
  - Exclusion logic: Brand exclusions prevent brand scoring only; keyword exclusions prevent keyword scoring only.
  - Pattern name exclusions: "snake print", "lizard print", "turtle print", "frog print" excluded from reptile category (these are dog/cat accessory patterns, not reptile products).
  - Dog/cat accessory brands (Coastal, Li'l Pals, Comfort Soft) excluded from reptile category.
  - Toy brands hard-excluded from both categories via brand AND keyword exclusions.
  - Aquatic Subcategorization (server/aquaticCategoryEvidence.ts): Evidence-based system with verified product terminology from official product lines. Priority system: Decoration exclusion → Brand-based categorization → Keyword scoring → Default to accessories.
  - Cat/dog food exclusion: Products containing cat/dog keywords excluded from aquatic filterType.
  - Shampoo categorization: Medicated/therapeutic shampoos (Zymox, Adams, Advantage, flea/tick) go to healthcare; grooming shampoos (Furminator, Freshnclean, carpet shampoo) go to accessories per Excel file.
- Food vs Treat Categorization by Size: For freeze-dried products (Vital Essentials, etc.), products >3oz are categorized as food (dogFood/catFood), products ≤3oz are categorized as treats (dogTreats/catTreats). Patties, nibbles, and mini pate in larger sizes are food; bites and small portions are treats.
- Product Recommendations ("You May Also Like"): Smart cross-category recommendations based on product type.
  - Food products: Recommend complementary accessories, NOT more food. For aquatic food (frog, turtle, fish), recommend docks, decorations, calcium, water conditioners. For reptile food, recommend hides, bedding, calcium, heating.
  - Strong penalty for filter/pump equipment when recommending for food products (-10 score).
  - Bonus for relevant accessories like docks, islands, basking platforms, calcium, reptisafe (+3 score).
  - smartPairings triggers: 'frog food', 'frog & tadpole', 'tadpole', 'turtle food', 'aquatic turtle', 'fish food', 'betta', 'goldfish', 'bearded dragon', 'gecko food', 'crested gecko', 'snake food', 'cricket', 'mealworm'.
- Extended Product Information: Sourced from reliable retailers (Chewy, Amazon, manufacturer websites).
  - Ingredients: Full ingredient list from product packaging.
  - Guaranteed Analysis: Stored as pipe-separated values for table display (e.g., "Crude Protein (min)|12%|Crude Fat (min)|5%").
  - Feeding Instructions: Usage directions from product labels.
  - Features: JSON with highlights array for bullet point display.
  - Currently 6,177 products with ingredients, 5,475 with detailed descriptions.
- Data Quality Validation Rules:
  - Wet vs Dry Food Ingredients: Wet food (cans, stews, broths, entrees) ingredients differ significantly from dry food (kibble, bags). Never copy dry food ingredients to wet food products.
    - Wet food indicators: Starts with meat broth/water, named fresh meats (chicken, beef, turkey), high moisture (70-96%), sizes like oz cans/pouches
    - Dry food indicators: Starts with meat meals (chicken meal, beef meal), grains (brown rice, barley), low moisture (10%), sizes like lb bags
    - Common mistake pattern: "Chicken, Chicken Meal, Brown Rice, Barley" is DRY kibble formula - NEVER use for canned/wet products
  - Product Format Detection Rules:
    - Bone broth toppers (Come-Pooch-A): Must start with "[protein] bone broth" (e.g., "Turkey bone broth, liquid Lactobacillus...")
    - Canned wet food (13oz, 5.5oz cans): Must start with "[protein], [protein] broth" (e.g., "Chicken, chicken broth, chicken liver...")
    - Stews/Entrees: Must start with fresh meat + broth (e.g., "Beef, beef broth, beef liver, tapioca starch...")
    - Dry kibble (4lb, 26lb, 30lb bags): Can start with meat meals (e.g., "Chicken meal, whole grain sorghum...")
  - Protein Source Matching: Ingredients must match the product's advertised protein. Cross-check first 3-5 ingredients against product name.
    - "Classic Catch" (fish) → Must have fish ingredients (haddock, trout, cod)
    - "Turkey Bone Broth" → Must start with "Turkey bone broth"
    - "Beef Stew" → Must start with "Beef, beef broth"
  - Format-Specific Data: Each product variant (5.5oz can vs 4lb bag) needs format-specific ingredients from manufacturer website.
  - Red Flag Patterns (indicates wrong ingredients copied):
    - Wet food with "Chicken Meal" or "Beef Meal" in first 3 ingredients
    - Bone broth products with grains (brown rice, barley, oatmeal)
    - Canned food with moisture <70% in guaranteed analysis
  - Verification Process: Always search official manufacturer website for exact product page, confirm ingredients match product size and format before updating.
- Brand Ingredient Audit Process (use for Science Diet, Royal Canin, etc.):
  1. Query all brand products with wrong patterns: `SELECT id, name, ingredients FROM supplies WHERE name ILIKE '%brand%' AND ingredients LIKE '%Meal%'`
  2. Identify wet foods with dry ingredients: Check for "Chicken Meal", "Beef Meal", "Brown Rice, Barley" in products with oz sizes
  3. Search manufacturer website for each product: Use format-specific URLs (e.g., `/wet-dog-food/`, `/canned-cat-food/`)
  4. Update with correct ingredients: Include guaranteed analysis with proper moisture (78%+ for wet)
  5. Verify protein matching: First ingredients must match product name protein
  6. SQL audit queries to run:
     - `WHERE ingredients LIKE 'Chicken, Chicken Meal%'` - dry kibble pattern in wrong products
     - `WHERE (name LIKE '%oz%' OR name LIKE '%Broth%') AND ingredients LIKE '%Meal%'` - wet foods with dry ingredients
     - `WHERE name LIKE '%fish%' AND ingredients NOT ILIKE '%fish%'` - protein mismatch
- MANDATORY Manufacturer Website Verification Process (NEVER skip this):
  - DO NOT assume existing data is correct - Always verify against actual manufacturer website
  - DO NOT copy ingredients from other products - Each product needs its own verified data
  - Step 1: Use `web_fetch` to load the actual manufacturer product page URL
  - Step 2: Copy ingredients EXACTLY as shown on manufacturer website (including order and spelling)
  - Step 3: Copy guaranteed analysis table with exact percentages from manufacturer
  - Step 4: Only then run UPDATE query with verified data
  - NutriSource URLs: `https://discovernutrisource.com/products/[product-slug]/`
    - Example: `discovernutrisource.com/products/chicken-bone-broth-recipe-come-pooch-a`
    - Alternative info site: `nutrisourcepetfoods.com/our-food/[product-slug]/` (has ingredient details)
  - Science Diet URLs: `https://www.hillspet.com/dog-food/` or `/cat-food/`
  - Royal Canin URLs: `https://www.royalcanin.com/us/dogs/products/` or `/cats/products/`
  - Verification Example:
    ```
    1. web_fetch("https://nutrisourcepetfoods.com/our-food/lamb/")
    2. Find "Ingredients" section on page
    3. Copy: "Lamb, turkey, lamb broth, lamb liver, chickpeas..."
    4. Find "Guaranteed Analysis" table
    5. Copy: "Crude Protein (Min.) 9.0%, Crude Fat (Min.) 8.5%..."
    6. UPDATE supplies SET ingredients = '[verified]', guaranteed_analysis = '[verified]' WHERE id = X;
    ```
- Multi-Image Collection Strategy:
  - Pull ALL available product photos from Amazon, Chewy, or manufacturer websites
  - Image order matters: First image = main display, subsequent images append in carousel order
  - Photo types to collect for each product: Main product image, Brand marketing graphics, Quality/ingredients graphics, Size comparison photos, Feeding guidelines/charts, Guaranteed analysis images, Back of package.
- Item-Specific Descriptions (NOT Generic):
  - Descriptions must be product-specific, pulled directly from Chewy/Amazon product pages
  - NOT generic catch-all descriptions that apply to multiple products
  - Include key features, benefits, and specifications unique to that exact item
- ExaTouch POS Fields to Populate:
  - MfgPart: Manufacturer part number
  - Color: Product color variant
  - Size: Product size
  - Style: Product style/variant
- Data Sources Priority:
  1. Official manufacturer websites (most accurate)
  2. Chewy.com product pages (detailed, verified)
  3. Amazon product listings (comprehesive)
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

## System Architecture
The application is a full-stack web application with a React frontend, an Express.js backend, and a PostgreSQL database utilizing Drizzle ORM.

**UI/UX Decisions:**
- Dark, bold design with strong contrast and mobile responsiveness.
- Themed headers for Aquatics (blue) and Exotic Reptiles (green) pages.
- Amazon-style image enlargement with carousels and swipe gestures.
- Full-screen modals for mobile forms and prominent warning banners for breed restrictions.
- Universal back button and force refresh button in admin dashboard.

**Technical Implementations & Feature Specifications:**
- **Core Management**: Pet & Supply Management (multi-image, extensive inventory, automated brand extraction), Appointment System (15-min intervals, admin approval, email notifications, Google Calendar sync), Order & Notification System.
- **Authentication & Authorization**: JWT tokens, password reset, user settings, admin user management, three-tier role system (Customer, Groomer, Admin).
- **Specialized Systems**: Wishlist, Google Calendar & Contact Management, Groomer Management, Content Management (Aquatics/Exotic Reptiles pages with subcategory filters), Admin Order Management, Orders & Appointments Search.
- **Advanced Management**: Pet Boarding/Babysitting, Database Sync Tools, Auto-Categorization System (brand/keyword analysis, Live Animal Detection, category cleanup), Smart Abbreviation Expansion, Brand Extraction & Assignment.
- **Admin Tools**: Product Image Management (dashboard, batch search/preview), Employee & Grooming Schedule Management.
- **AI & Integrations**: AI-Powered Order Photo Upload (GPT-5 Vision for item extraction, auto-categorization, custom pricing), Astro Loyalty Integration, POS Integration (real-time sync, webhooks).
- **UPC Matching System**: Strict system for matching UPCs to products with 90% coverage and 100% accuracy, employing abbreviation expansion, text normalization, and verified brand mappings. Strict validation rules apply to size, wattage, weight/volume, dimension, cup/capacity, and length. Includes critical product type exclusions and a comprehensive brand prefix expansion dictionary.

**System Design Choices:**
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, shadcn/ui.
- **Backend**: Express.js, TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: JWT tokens stored in secure cookies.
- **State Management**: TanStack Query.
- **Routing**: Wouter.
- **Development Practices**: Strict TypeScript, proper HTTP status codes, environment-aware configurations.

## External Dependencies
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Email Service**: SendGrid
- **SMS Service**: Twilio
- **Calendar Integration**: Google Calendar
- **Loyalty Program**: Astro Loyalty
- **AI Vision**: OpenAI
- **Frontend Framework**: React
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Component Library**: shadcn/ui
- **Server-Side Framework**: Express.js
- **Query Library**: TanStack Query
- **Client-Side Router**: Wouter