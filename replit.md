# Animal House Pet Store

## Overview
The Animal House Pet Store project is a mobile-friendly web application designed to enhance the store's online presence, service accessibility, and product sales. It supports pet browsing, grooming appointment booking, and pet supply purchasing, including exotic reptiles. The application aims to provide a comprehensive online platform that boosts sales, streamlines operations, and integrates inventory management, customer accounts, and administrative functionalities. The business vision is to provide a comprehensive online platform that boosts sales, streamlines operations, and integrates inventory management, customer accounts, and administrative functionalities.

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
- **UPC Matching System**: Strict system for matching UPCs to products with 90% coverage and 100% accuracy, employing abbreviation expansion, text normalization, and verified brand mappings. Strict validation rules apply to size, wattage, weight/volume, dimensions, cup/capacity, and length. Includes critical product type exclusions and a comprehensive brand prefix expansion dictionary.
    - **Validation Rules**: Size, Wattage, Weight/Volume, Dimension, Cup/Capacity, and Length must match exactly.
    - **Brand-UPC Prefix Validation**: UPC prefix must match product's brand using GS1 manufacturer prefixes.

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

## UPC/SKU Matching System

### ⚠️ CRITICAL: SKU = UPC
**In this system, the SKU field IS the UPC field. They are identical.**
- When inputting UPC codes, they go into the SKU field
- Always copy SKU to UPC where UPC is empty
- There is no separate UPC input field - SKU is the UPC
- **NEVER FORGET THIS** - this has been flagged multiple times as forgotten information

### Data Sources
- **Inventory Saves**: Excel/CSV inventory exports contain photos AND SKU/UPC data for products
- Photos and UPC data should be extracted from these inventory saves during import
- User's manual UPC assignments must be preserved and never overwritten
- **"Manual UPC assignments" = SKU values the user has entered in production** - these are in the SKU field of inventory exports and MUST be preserved during any sync or import operation

### Key Metrics
- **Current Coverage**: 84.8% (6,150 of 7,252 products have UPCs)
- **Photo Coverage**: 97.7% (7,088 products have proper photos)
- **Data Sync**: When exporting from production, all UPC/SKU corrections are preserved via ID-based updates

### Brand-UPC Prefix Validation
Prevents cross-brand UPC assignments using GS1 manufacturer prefixes. Implemented in `scripts/brand-upc-prefixes.mjs`.

**Known Prefixes (2024-12 update):**
- **Reptile**: Zoo Med=097612, Exo Terra=015561, Fluker's=091197, Zilla=096316
- **Aquatic**: Tetra=046798, Aqueon=015905, Hikari=042055, API=317163, Marineland=047431
- **Small Animal**: Kaytee=071859/045125, Oxbow=744845, Vitakraft=071354
- **Pet Food**: Orijen=064992, Blue Buffalo=859610/840243, Fromm=072705/727051, NutriSource=073893/738933/738938
- **Accessories**: Kong=035585/076484/611932, Coastal=018214, Nylabone=018214/018065, Greenies=642863
- **Grooming**: Bio Groom=021653, Earthbath=602644, FURminator=811794, Vet's Best=031658, Zymox=667334, TropiClean=645095, Skout's Honor=810053/856713/850004, NaturVet=797801, PetAg=071860, Dogswell=693804

### Abbreviation Patterns Learned
- Yng→Young, Gpig→Guinea Pig, Grden→Garden, Grdnsel→Garden Select
- Ham→Hamster, Snr→Senior, Chinch→Chinchilla, Clmbree→Calming Breeze
- Foritdiet→Forti-Diet, Turky→Turkey, Frg→Frog
- Color codes: Blu→Blue, Pnk→Pink, Prpl→Purple, Grn→Green, Blk→Black
- Biogroom→Bio-Groom, Exoterra→Exo Terra, Lilpals→Li'l Pals