# Animal House Pet Store

## Overview
The Animal House Pet Store project is a mobile-friendly web application designed to enhance the store's online presence, service accessibility, and product sales. It supports pet browsing, grooming appointment booking, and pet supply purchasing, including exotic reptiles. The application aims to provide a comprehensive online platform that boosts sales, streamlines operations, and integrates inventory management, customer accounts, and administrative functionalities.

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
  - Currently 61+ products have complete extended information.

## System Architecture
The application is a full-stack web application featuring a React frontend (Vite, TypeScript, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript) connected to a PostgreSQL database via Drizzle ORM.

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
- **Advanced Management**: Pet Boarding/Babysitting, Database Sync Tools (staging import, supplies-only sync, full sync), Auto-Categorization System (brand/keyword analysis, Live Animal Detection, category cleanup), Smart Abbreviation Expansion, Brand Extraction & Assignment.
- **Admin Tools**: Product Image Management (dashboard, batch search/preview), Employee & Grooming Schedule Management.
- **AI & Integrations**: AI-Powered Order Photo Upload (GPT-5 Vision for item extraction, auto-categorization, custom pricing), Astro Loyalty Integration, POS Integration (real-time sync, webhooks).
- **UPC Matching System**: A strict system for matching UPCs to products with 90% coverage and 100% accuracy, employing abbreviation expansion, text normalization, and verified brand mappings. Strict validation rules apply to size, wattage, weight/volume, dimensions, cup/capacity, and length. Includes critical product type exclusions and a comprehensive brand prefix expansion dictionary.

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
- **AI Vision**: OpenAI (for GPT-5 Vision)
- **Frontend Framework**: React
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Component Library**: shadcn/ui
- **Server-Side Framework**: Express.js
- **Query Library**: TanStack Query
- **Client-Side Router**: Wouter

## UPC Matching System

### Overview
- **Target**: 90% coverage with 100% accuracy (zero errors tolerated)
- **Total supplies**: 7,225
- **Total UPCs available**: 7,300 (expanded from 3+ sources)
- **Current progress**: 82.2% matched (5,939 products) - after cleanup of 175 incorrect UPCs
- **Applied through queue**: 2,177 verified matches (after protein/product validation)
- **Rejected**: 56 matches (protein/size/color/brand mismatches)
- **Brand detection**: 4,089 with brands (80%), 994 unknown (20%)
- **Remaining unmatched**: 1,286 supplies (limited by available UPC data)
- **Philosophy**: Matches validated for protein/product type accuracy AND brand-UPC prefix validation

**Known Data Source Notes:**
- Science Diet: 202 UPCs in Google spreadsheet (all ingested), matches validated with protein checking

### Matching Pipeline (Stateful - Never Loses Progress)
1. **Discovery**: `batch-match-all.mjs` finds matches → saves to `all_pending_matches.json`
2. **Queue**: `merge-matches-to-queue.mjs` merges into `match_queue.json` (deduplicates)
3. **Review**: Accept matches manually or via `accept-all-high-score.mjs [minScore]`
4. **Apply**: `apply-accepted-matches.mjs` applies accepted matches to database

### Key Files
- `scripts/ALL_UPCS_EXPANDED.json` - Master UPC database with 5,083 UPCs, brand-detected
- `scripts/match_queue.json` - **STATEFUL** queue with status: pending/accepted/rejected/applied
- `scripts/match_decisions_log.json` - Append-only audit trail of all decisions
- `scripts/match_apply_log.json` - Log of all apply runs
- `scripts/upc-extraction-with-logging.mjs` - Extraction script with 160+ brand prefixes
- `scripts/batch-match-all.mjs` - Batch matching across all brands
- `scripts/smart-match-v2.mjs` - Single-brand matching with detailed output

### Validation Rules (STRICT - All Must Pass)
1. **Size Matching**: xxsmall, xsmall, small, mini, medium, large, xlarge, xxlarge, jumbo, giant
2. **Wattage Matching**: Must match exactly (25W ≠ 50W)
3. **Weight/Volume Matching**: Value AND unit must match exactly
4. **Dimension Matching**: Normalized (5" = 5in = 5inch), must match exactly
5. **Cup/Capacity Matching**: 1 cup ≠ 7 cup
6. **Length Matching**: Foot measurements must match (15' ≠ 10')
7. **Brand-UPC Prefix Validation**: UPC prefix must match product's brand (see below)

### Brand-UPC Prefix Validation (CRITICAL)
Prevents cross-brand UPC assignments using GS1 manufacturer prefixes. Implemented in `scripts/brand-upc-prefixes.mjs`.

**Known Brand Prefixes:**
- **Reptile**: Zoo Med=097612, Exo Terra/Hagen=015561, Fluker's=091197, Zilla=096316
- **Aquatic**: Tetra=046798, Aqueon=015905, Hikari=042055, API=317163, Marineland=047431, Penn-Plax=030172
- **Small Animal**: Kaytee=071859, Oxbow=034846, Vitakraft=071354
- **Pet Food**: Orijen/Acana=064992, Hill's=052742, Blue Buffalo=859610, Fromm=072705, Royal Canin=030111
- **Accessories**: Kong=076484, Coastal=018214, Nylabone=018065, Greenies=642863, RedBarn=785184

**How it works:**
1. When applying a UPC match, the system checks if the UPC prefix matches the product's brand
2. If mismatch detected, the match is automatically rejected with reason
3. Audit script `scripts/audit-upc-brand-prefixes.mjs` finds existing mismatches in database

### Brand Prefix Expansion (80+ verified mappings)
Never auto-promote unverified prefixes - all mappings must be user-confirmed!
- **Aquarium**: AQE/AQA→Aqueon, TET→Tetra, HIK/HKR→Hikari, ATP→Aquatop, WWI→World Wide Imports, SLI/SCM→SeaChem, FLV→Fluval, API→API, GLF→GloFish, PENN→Penn-Plax
- **Reptile**: ZMD/ZM/ZML→Zoo Med, EXO→Exo Terra, ZIL→Zilla, FLK/FSK/FLU→Flukers, KMD/KOM→Komodo, PGE→Pangea
- **Dog/Cat**: KON/KNG→Kong, CST/COA→Coastal, NYL→Nylabone, BEN→Benebone, SMB/SMBN→SmartBones, RDB/RED→RedBarn, GRN→Greenies, WHI→Whimzees, CHT→Chuckit, ETH→Ethical Pet, SPT→Spot, JWP/JW→JW Pet, SAF→Safari, TRC/TRP/TRO→TropiClean, FRP/FOU→Four Paws, NVT→NaturVet, FAS→Fashion Pet, PTS/DOS→Petmate, MPS/MRP/MUL→Multipet, MAM→Mammoth, TUF/VIP→Tuffy, CATIT→Catit, PETAG→PetAg
- **Small Animal/Bird**: KAY/KMP→Kaytee, OXB→Oxbow, VTK→Vitakraft, LAF→Lafebers, AEC→A&E Cage
- **Food**: SD/HSD→Science Diet, BB/BLU/BLUE→Blue Buffalo, RC→Royal Canin, NUT/NBS/SOU→Nutrisource, FRM/FROMM→Fromm, DIA/DIAM→Diamond, TOW/TAS→Taste of the Wild, PRIM→Primal, INS→Instinct, PP/PRO→Pro Plan, VIT→Vital Essentials

**Distributor codes (NOT brands)**: GAR=Garmon Corp distributes NaturVet - use context detection instead

### Progress Notes
- 2024-12: Created comprehensive logging system that tracks unknown abbreviations and brand prefixes
- 2024-12: Added verified brand prefixes: MUL→Multipet, KOM→Komodo, FOU→Four Paws, DOS→Petmate, VIP→Tuffy, PETAG→PetAg, RED→RedBarn, PRIM→Primal
- 2024-12: Added context-based detection for GAR (Garmon Corp distributor) → NaturVet products via keywords
- 2024-12: Established verification workflow: Never auto-promote prefixes - all mappings must be user-confirmed
- 2024-12: Created stateful matching pipeline with match_queue.json tracking all matches
- 2024-12: Ingested 3,150 maybe inventory UPCs - 2,206 already applied, 403 new direct matches in queue
- 2024-12: Added 50+ new brand prefixes: ExoTerra, LILPALS, CIRCLE, MARINA, VICT, ZUP, LOV, ELA, FAR, BL, etc.
- Remaining gap: 994 UPCs still have unknown brands - check abbreviation_learning_log.json for candidates