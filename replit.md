# Animal House Pet Store

## Overview
A mobile-friendly web application for "Animal House" pet store, focusing on pet browsing, grooming appointment booking, and pet supply purchasing. The application includes comprehensive inventory management, customer accounts, and administrative functionalities. It features a dark, bold design and specializes in grooming services (bath and full service), pet adoption, and exotic reptile specialties, explicitly excluding vet care or training services. The business vision is to provide a streamlined, branded online presence, enhancing service accessibility and product sales.

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
The application is a full-stack web application with a clear separation of concerns, built with React, Vite, TypeScript, Tailwind CSS, shadcn/ui for the frontend, and Express.js with TypeScript for the backend, utilizing PostgreSQL with Drizzle ORM.

**UI/UX Decisions:**
- Dark, bold design with strong contrast and mobile responsiveness.
- Full-screen modals for mobile forms.
- Amazon-style image enlargement with carousels and swipe gestures.
- Themed headers for Aquatics (blue) and Exotic Reptiles (green) pages.
- Prominent warning banners for breed restrictions.
- Toast notifications for user feedback.
- Universal back button at top-left corner on secondary pages, using `safeGoBack`.
- Force Refresh Button in admin dashboard header to clear cached data.

**Technical Implementations & Feature Specifications:**
- **Pet & Supply Management:** Multi-image support, extensive inventory (5,893+ supplies), automated brand extraction (840+ brands), specialized reptile supply filter (723+ products by brand/keyword), case-insensitive search for all products and pets (with whitespace normalization), search functionality integrated across all supply pages with pagination, and paginated supply loading (24 items per page) across all supply pages (main Supplies, Aquatics, and Exotic Reptiles) with touch gesture support to optimize performance and reduce customer lag.
- **Appointment System:** 15-minute intervals, admin approval workflow, email notifications, "My Appointments" page, Google Calendar sync (shows both confirmed and completed appointments), chronological ordering, service type detection, collapsible UI, pagination, customer arrival and payment tracking with clickable "Here" flag filter on dashboard, weekly appointment limits, special date configurations, groomer assignment, role-based access, visual indicators, automatic past appointment hiding (using parseLocalDate for timezone-safe date comparisons), booking restrictions (no same-day for customers), scheduled daily maintenance tasks, manual cleanup options, appointment editing, and comprehensive appointment history tracking integrated with contacts.
- **Order & Notification System:** Admin email/push notifications for new orders/appointments, customer email/SMS/web push for order status, and detailed order history.
- **Authentication & Authorization:** JWT tokens in secure cookies, password reset, user settings, admin user management, three-tier role system (Customer, Groomer, Admin).
- **Wishlist System:** Dedicated page with add/remove functionality and quick "Add to Cart."
- **Google Calendar & Contact Management:** Connected Google Calendar via Replit integration, unified calendar view, hybrid contact system (manual DB + Google Calendar), automatic phone number extraction, user-contact auto-linking, paginated contact management UI, and event creation from contacts.
- **Groomer Management System:** Dedicated admin tab for CRUD operations on groomers (name, email, phone, specialties, active status).
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtering content by species.
- **Admin Order Management:** Displays actual product/pet names and customer names in order details.
- **Orders & Appointments Search:** Unified search bar in admin panel to filter appointments and orders by customer name, phone number, or pet name, with visual highlighting for matches.
- **Database Sync Tools:** 
  - **Staging Import with Duplicate Prevention (Production-Safe):** Advanced Excel import system with smart duplicate detection before applying changes. Uses composite key matching (name+brand+size) with SHA-256 checksums to detect exact duplicates and data changes. Preserves all business-meaningful punctuation (+, #, &, /, etc.) in product names. Shows preview with new/update/duplicate counts before approval. All operations wrapped in transactions for atomicity. Perfect for safely importing large Excel files without creating duplicates.
  - **Supplies-Only Sync (Production-Safe):** Admin-only export/import of supplies inventory only. Safe for production use since it only touches the supplies table without affecting users, orders, or appointments. Validates file type and array structure before import. Returns detailed error reporting for failed imports. Perfect for syncing product name updates from development to production.
  - **Full Database Sync (Development-Only):** Admin-only export/import functionality to sync production data to development environment. Exports all 14 database tables (users, pets, supplies, appointments, orders, orderItems, groomers, contacts, customerPets, wishlistItems, groomerAvailability, weeklyAppointmentLimits, dailyAppointmentLimits, specialDateSettings, specialDateAllowedTimes) to JSON with dependency ordering. Import is development-only for safety, processes tables in correct order to preserve foreign key relationships.
- **Auto-Categorization System (Production-Safe):** 
  - **Specialty Section Categorization (filterType):** Intelligent product classification system that automatically assigns products to Aquatics or Exotic Reptiles sections based on name analysis and brand recognition. Scoring algorithm: Brand match (50 points - ZooMed→reptile, Tetra→aquatic), name keywords (30 points - "betta"→aquatic, "gecko"→reptile), description keywords (15 points), exclusion penalties (-40 points). Minimum confidence threshold of 25 points required for categorization. Products without clear indicators remain in general supplies. Processes 7,316+ products in chunked batches of 500 with transaction safety and detailed progress logging. Supports brand name normalization (handles "Zoo Med" vs "ZooMed" variants). One-click admin button triggers full inventory categorization with real-time stats (aquatic/reptile/general counts, processing duration). Stores results in `filter_type` column for permanent categorization while maintaining backward compatibility with dynamic filtering.
  - **Product Type Categorization (category):** Comprehensive brand/keyword-based system that automatically assigns products to Food, Toys, Beds, Leashes, Healthcare, and Accessories categories. Multi-signal scoring: Brand defaults (25 points - KONG→Toys, Blue Buffalo→Food, Coastal→Leashes), name keywords (15 points each, max 3), description keywords (10 points each, max 2), pattern matching (10 points for weight/volume like "5.5oz", "12lb"). Exclusion penalties (-30 points) prevent false positives. Minimum 25-point threshold required; ambiguous items remain unchanged. Research-backed brand categorizations (100+ brands across 6 categories) ensure accurate classification. Batched processing (500 items per transaction) with detailed stats (food/toys/beds/leashes/healthcare/accessories/unchanged counts, processing duration). Complementary to filterType system, enabling dual-axis product organization. Files: server/categoryConfig.ts (brand/keyword mappings), server/productCategory.ts (scoring logic), server/storage.ts (autoCategorizeProductCategories method), API endpoint: POST /api/admin/supplies/auto-categorize-categories.
- **Abbreviation Expansion System (Production-Safe):**
  - **Enterprise-Grade Three-Phase Pipeline:** Complete refactored system for expanding abbreviations, correcting spelling, and applying professional title case formatting to product names AND descriptions with all-or-nothing transaction protection, automatic backups, audit logging, and rollback capability.
  - **Shared Mappings Module (scripts/shared-mappings.ts):** Centralized abbreviation mappings with proper multi-word pattern prioritization, spelling corrections dictionary, uppercase brand allowlist (IAMS, PPP, RC, EB), and lowercase word list for title case (and, is, or, but, lb, oz).
  - **Apply Script v2 (scripts/apply-food-abbreviation-expansions-v2.ts):** Three-phase transformation system: (1) Expands abbreviations, (2) Corrects spelling (grasvel→gravel), (3) Applies title case while preserving uppercase brands and lowercase units. Processes BOTH name and description fields in single transaction. Creates backup before changes, logs planned changes, applies all updates atomically (all succeed or all roll back), updates audit log to "completed" status.
  - **Restore Script (scripts/restore-from-backup.ts):** Restores products from backup file with transaction protection. Requires --confirm flag for production safety, wraps all updates in single transaction for all-or-nothing guarantee.
  - **Validation Script v2 (scripts/validate-expansion-results-v2.ts):** Post-expansion validation using shared mappings to check for remaining abbreviations in both names AND descriptions. Reports issues by category with field-level granularity.
  - **Abbreviation Mappings:** Special multi-word (mig mig→mignon, BL BUF/bl buf→Blue Buffalo, tri bl→Tri Blend), Brands (sd→Science Diet, RC→Royal Canin, PPP→Purina Pro Plan, buf→Blue Buffalo), Colors (wh/whi→White, gre→Grey, grn→Green, bl→Black, burgund→Burgundy), Proteins (ck/chk→Chicken, lam→Lamb, salm→Salmon, ri→rice, bf→Beef, tk/trk/turk→Turkey, duc→Duck, shrim→Shrimp), Food terms (grav→Gravy, fil→Fillet), Sizes (sm/md/lg/xlg/mini/toy br→Small/Medium/Large/Extra Large/Mini/Toy Breed), Life stages (pup→Puppy, jr→Junior, sr/sen→Senior, ad/adt→Adult), Measurements (#→lb).
  - **Title Case Formatting:** First letter of every word capitalized including words after slashes (Pink/Green/Blue) and commas (Turkey,Chicken), with proper exceptions for articles (and, is, or, but), units (lb, oz), and uppercase brands (IAMS, PPP, RC, EB).
  - **Production History:** Successfully processed 2,121 total changes (1,873 comprehensive abbreviation/formatting updates + 90 Blue Buffalo duplicate fixes + 156 additional abbreviation expansions + 2 mig→Mignon fixes) across 951 food products with zero data loss, full validation passed, backup and rollback capability verified. All product names and descriptions now use professional title case formatting with proper abbreviation expansion and capitalization after slashes/commas.

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