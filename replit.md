# Animal House Pet Store

## Overview
The Animal House Pet Store project is a mobile-friendly web application designed to enhance the store's online presence, service accessibility, and product sales. It supports pet browsing, grooming appointment booking, and pet supply purchasing, including exotic reptiles. The application aims to provide a comprehensive online platform that boosts sales and streamlines operations, integrating inventory management, customer accounts, and administrative functionalities.

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

## System Architecture
The application is a full-stack web application featuring a React frontend (Vite, TypeScript, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript) connected to a PostgreSQL database via Drizzle ORM.

**UI/UX Decisions:**
- Dark, bold design with strong contrast and mobile responsiveness.
- Themed headers for Aquatics (blue) and Exotic Reptiles (green) pages.
- Amazon-style image enlargement with carousels and swipe gestures.
- Full-screen modals for mobile forms and prominent warning banners for breed restrictions.
- Universal back button and force refresh button in admin dashboard.

**Technical Implementations & Feature Specifications:**
- **Pet & Supply Management:** Multi-image support, extensive inventory, automated brand extraction, specialized reptile supply filtering, case-insensitive search with pagination and touch gestures.
- **Appointment System:** 15-minute intervals, admin approval, email notifications, Google Calendar sync, customer tracking, weekly limits, special date configurations, groomer assignment, role-based access, multi-pet booking, and comprehensive history with timezone-aware date comparison.
- **Order & Notification System:** Admin notifications for new orders/appointments, customer notifications for status updates, and detailed order history.
- **Authentication & Authorization:** JWT tokens in secure cookies, password reset, user settings, admin user management, and a three-tier role system (Customer, Groomer, Admin).
- **Wishlist System:** Dedicated page with add/remove and quick "Add to Cart."
- **Google Calendar & Contact Management:** Integrated Google Calendar, unified calendar view, hybrid contact system with multi-pet support, and event creation from contacts.
- **Groomer Management System:** Admin CRUD operations for groomers.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtered by species. Aquatics page includes subcategory filters (Fish Food, Medicine, Supplies) with evidence-based categorization.
- **Admin Order Management:** Displays actual product/pet and customer names in order details.
- **Orders & Appointments Search:** Unified search in admin panel by customer name, phone, or pet name.
- **Pet Boarding/Babysitting System:** Complete boarding management with intelligent cost calculation, flexible date management, status tracking, and admin-only access.
- **Database Sync Tools:** Staging import with duplicate prevention, supplies-only sync, and full database sync.
- **Auto-Categorization System:** Single-button operation for specialty section and product type classification based on brand and keyword analysis, including Live Animal Detection and record creation. Includes Category Cleanup step that normalizes category names (kennel→dogCages, smallAnimalSupplies→smallanimal, "cat toy"→toys), splits food→dogFood/catFood, fixes clothing items to accessories, syncs filter_type with category, and corrects misplaced products (beefhide→dogTreats).
- **Smart Abbreviation Expansion System:** Comprehensive, research-based abbreviation expansion for major pet food and treat brands (server/abbreviationExpansion.ts) with critical verification against official sources. Includes context-aware expansions.
- **Brand Extraction & Assignment System:** Comprehensive brand database (80+ brands) with automated brand detection via `extractBrand()` function and category-specific brand handling. Includes abbreviation normalization and a brand backfill migration script for automated assignment.
- **Product Image Management System:** Statistics dashboard, manual and automated batch image search with preview and approval, and admin-only access.
- **Employee & Grooming Schedule Management Systems:** Sectioned schedule views, editable grids, employee/groomer management, flexible time slots, batch save, and admin-only access.
- **AI-Powered Order Photo Upload System:** Upload supplier order photos to extract items automatically using GPT-5 vision, with adjustable price multipliers, editable extracted items, bulk add to inventory with automatic categorization, and photo management. Includes a production-ready Live Animal Detection System with species categorization rules and custom pricing.
- **Astro Loyalty Integration:** Customer loyalty program integration including automatic account linking, purchase sync, and frequent buyer program monitoring.
- **POS Integration System:** Real-time price and inventory synchronization with external Point of Sale systems, priority-based override logic, tracking fields, webhook-based sync, and an admin dashboard.

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