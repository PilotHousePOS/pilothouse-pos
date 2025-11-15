# Animal House Pet Store

## Overview
A mobile-friendly web application for "Animal House" pet store, designed to streamline pet browsing, grooming appointment booking, and pet supply purchasing. The application includes robust inventory management, customer accounts, and administrative functionalities. It features a dark, bold design and specializes in grooming services (bath and full service), pet adoption, and exotic reptile specialties, explicitly excluding vet care or training services. The business vision is to provide a comprehensive, branded online presence, enhancing service accessibility and product sales.

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
- Search Functionality: All searches (supplies, pets) must be case-insensitive
  - Search works across all supply pages (main Supplies, Aquatics, Exotic Reptiles)
  - Search combines with category and filterType filters (AND logic)
  - Whitespace-only searches treated as empty searches
  - Search bars integrated into specialty pages (Aquatics, Reptiles) with pagination support
- Supply Filtering: Centralized, research-based filtering system with proper brand/keyword separation (server/filterConfig.ts):
  - Reptile supplies (681 items): ZooMed, Exo Terra, Zilla, Fluker's, ReptiCare brands + reptile keywords
  - Aquatic supplies (189 items): Hikari, Tetra, Aqueon, Marineland, API, Fluval, SeaChem, GloFish brands + aquatic keywords
  - Brand categorizations based on web research of company specializations
  - Category constraints always apply to prevent cross-contamination between departments
  - filterType and category filters work together (not mutually exclusive)

## System Architecture
The application is a full-stack web application built with React, Vite, TypeScript, Tailwind CSS, shadcn/ui for the frontend, and Express.js with TypeScript for the backend, utilizing PostgreSQL with Drizzle ORM.

**UI/UX Decisions:**
- Dark, bold design with strong contrast and mobile responsiveness.
- Themed headers for Aquatics (blue) and Exotic Reptiles (green) pages.
- Amazon-style image enlargement with carousels and swipe gestures.
- Full-screen modals for mobile forms and prominent warning banners for breed restrictions.
- Universal back button and force refresh button in admin dashboard.

**Technical Implementations & Feature Specifications:**
- **Pet & Supply Management:** Multi-image support, extensive inventory, automated brand extraction, specialized reptile supply filtering, case-insensitive search with pagination and touch gesture support.
- **Appointment System:** 15-minute intervals, admin approval, email notifications, Google Calendar sync, chronological ordering, customer arrival/payment tracking, weekly limits (HARD LIMITS: counts total dogs/pets, not appointments - applies to everyone including admins), special date configurations, groomer assignment, role-based access, multi-pet booking support, and comprehensive history. Paid appointments always remain visible in the approved appointments list regardless of "Customers Here" filter status.
- **Order & Notification System:** Admin email/push notifications for new orders/appointments, customer email/SMS/web push for status, and detailed order history.
- **Authentication & Authorization:** JWT tokens in secure cookies, password reset, user settings, admin user management, three-tier role system (Customer, Groomer, Admin).
- **Wishlist System:** Dedicated page with add/remove and quick "Add to Cart."
- **Google Calendar & Contact Management:** Connected Google Calendar, unified calendar view, hybrid contact system, automatic phone number extraction, and event creation from contacts.
- **Groomer Management System:** Admin CRUD operations for groomers.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtered by species.
- **Admin Order Management:** Displays actual product/pet and customer names in order details.
- **Orders & Appointments Search:** Unified search in admin panel by customer name, phone, or pet name.
- **Database Sync Tools:**
    - **Staging Import with Duplicate Prevention:** Excel import system with smart duplicate detection, SHA-256 checksums, and transactional safety for production.
    - **Supplies-Only Sync:** Admin-only export/import of supplies inventory for production.
    - **Full Database Sync:** Development-only export/import of all database tables for environment syncing.
- **Auto-Categorization System:**
    - **Combined Auto-Categorization:** Single-button operation that performs both specialty section (filterType) and product type (category) categorization in one process.
    - **Step 1 - Specialty Sections (filterType):** Classifies products as Aquatic or Reptile based on brand and keyword analysis for specialty pages.
      - **Special Rule - Bridges:** Products with "bridge" in the name automatically categorize as Aquatic UNLESS "lizard" appears within 20 characters of "bridge" (e.g., "lizard bridge" stays in reptile category).
    - **Step 2 - Product Categories (category):** Assigns products to 11 categories (Food, Toys, Beds, Leashes, Healthcare, Accessories, Aquatics, Reptiles, Bird Supplies, Dog Cages/Houses, Small Animal Supplies) using multi-signal scoring with brand defaults, name keywords, description keywords, and exclusion penalties.
      - **Brand Override Rules:** Specific brands always categorize to their primary category regardless of conflicting keywords:
        - ProPlan/Purina Pro Plan → Food (even if "toy" appears, which refers to toy breed size)
        - KONG → Toys, Blue Buffalo → Food, Chuckit → Toys, FURminator → Healthcare, Ruffwear → Leashes
- **Abbreviation Expansion System:**
    - **Enterprise-Grade Three-Phase Pipeline:** Expands abbreviations, corrects spelling, and applies professional title case to product names and descriptions with transactional protection, backups, and rollback.
    - **Shared Mappings Module:** Centralized abbreviation mappings, spelling corrections, and title case rules in scripts/expand-abbreviations.ts.
    - **Comprehensive Abbreviation Coverage:** 80+ mappings including:
      - Brand abbreviations: Wholseso/Wholso→Wholesome, Vict→Victor, Euk→Eukanuba, Nutri Sour/Sou→Nutrisource, Blue B→Blue Buffalo, Red B→RedBarn, Zign→Zignature, Tow/Toe→Taste of the Wild, Nb→Natural Balance, Zig→Zignature, Nyla→Nylabone, Diam→Diamond, Orij→Orijen, Cand→Canidae
      - Multi-word phrases: Fromm Gold Weight→Fromm Gold Weight Management, Perf Weight→Perfect Weight, Gr Fr→Grain Free, Conure&tiel/Conure&lovebird→Conure & Cockatiel/Lovebird, Rat&mouse→Rat & Mouse, Chkn&dck→Chicken & Duck, Chkn&lvr→Chicken & Liver, Tuk,Sard→Turkey, Sardine, Roc Moun→Rocky Mountain, Anc Mount/Stream/Prairie/Wetland→Ancient Mountain/Stream/Prairie/Wetland, Pacif Stre→Pacific Stream, Can Riv→Canyon River, Worldsbestcatlitter→World's Best Cat Litter, Swtpot→Sweet Potato, Beggarbns→Beggin', Frndsfrm→Friends From The Farm
      - Protein abbreviations: Chkn→Chicken, Bef→Beef, Lam→Lamb, Rab→Rabbit, Ven→Venison, Tuk→Turkey, Sard→Sardine, Lvr→Liver, Dck→Duck
      - Single words: Sportmix→Sportsmix, Orig→Original, Cast→Cat, Per→Perfect, Ind→Indoor, Shred→Shredded, Seaf→Seafood, Unsc.→Unscented, Kanga→Kangaroo, Zssen→Zssential, Yurkey→Turkey, Blk→Black, Yng→Young, Gpig→Guineapig, Spe/Spec→Special, Sal→Salmon, Proc→Process, Nat→Natural, Fd→Freeze Dried, Als→All Life Stages, Anc→Ancient, Roc→Rocky, Moun→Mountain, Riv→River, Stre→Stream, Pacif→Pacific, Fro/Frzn→Frozen, Nug→Nuggets, Pron/Pront→Pronto, Gitd→Glow in the Dark
      - Spelling corrections: Vegtable→Vegetable, Thermoter→Thermometer, Watm→Watermelon, Sunburts→Sunburst, Cockateil→Cockatiel, Prarie→Prairie
    - **Latest Run Results:** 572 total products updated across multiple runs (185 initial + 172 brand abbreviations + 47 spelling + 168 comprehensive expansion)
- **Brand Extraction System:**
    - **Comprehensive Brand Database:** scripts/extract-brands.ts with 80+ brand patterns across all pet categories
    - **Coverage:** 63.7% of inventory (4,659 of 7,316 products) have assigned brands
    - **Top Brands:** Coastal Pet Products (896), KONG (318), ZooMed (272), Exo Terra (213), Science Diet (200), Lil Pals (164), Fluval (155), Kaytee (136), Fromm (135), Zilla (118), Tetra (103), Blue Buffalo (101), Aqueon (95), Nutrisource (92), RedBarn (89), Oxbow (89)
    - **Small Animal Brands:** Oxbow (89), Kaytee (136), Marshall (11), Higgins (13), Ferret Nation (4), A&E Cage Company (13), Birdlife (74), Quiko (2)
    - **Food Brands:** Fromm, Diamond, Natural Balance, Pure Vita, Canidae, Sportsmix, Freshpet, Taste of the Wild, and all major dog/cat food brands
    - **Aquatic Brands:** Marina (66), Aquatop (59), Cascade (24), Activ (4), Acurel (2), plus all major aquatic brands
    - **Treats & Accessories:** Greenies (49), SmartBones (20), Nylabone (56), SodaPup (15), Jolly Pets (7), Meowijuana (9), Fresh Kisses (14)
    - **Latest Run Results:** 1,842 brands extracted in latest run, increasing coverage from 38.5% to 63.7%
- **Product Image Management System:**
    - **Statistics Dashboard:** Real-time tracking of total products, products with/without images, breakdown by brand and category.
    - **Manual Image Search:** Individual product image URL input with preview and validation.
    - **Automated Batch Search:** Select brand or category, configure batch size (max 50), generate search queries for each product, preview & approve images before saving.
      - **Progress Tracking:** Real-time progress bar showing products processed.
      - **Preview & Approval Interface:** Review all found images, manually paste image URLs, approve/reject each result.
      - **Batch Update:** Save all approved images in one operation.
    - **Cost Management:** Warning system for web search credit usage, selective search capabilities to manage costs, configurable batch size.
    - **Admin-Only Access:** Secure endpoints with admin authentication for all image management operations.
    - **Brand Standardization:** Automatic "Zoo Medium" → "ZooMed" standardization for consistency.
    - **API Endpoints:** /api/admin/supplies/image-stats, /api/admin/supplies/without-images, /api/admin/supplies/batch-filter, /api/admin/supplies/batch-image-search, /api/admin/supplies/:id/image

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
- **Frontend Framework**: React
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Component Library**: shadcn/ui
- **Server-Side Framework**: Express.js
- **Query Library**: TanStack Query
- **Client-Side Router**: Wouter