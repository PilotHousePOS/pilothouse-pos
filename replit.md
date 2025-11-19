# Animal House Pet Store

## Overview
A mobile-friendly web application for "Animal House" pet store, focusing on pet browsing, grooming appointment booking, and pet supply purchasing. The application includes inventory management, customer accounts, and administrative functionalities. It features a dark, bold design and specializes in grooming services (bath and full service), pet adoption, and exotic reptile specialties, explicitly excluding vet care or training services. The business vision is to provide a comprehensive, branded online presence, enhancing service accessibility and product sales.

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
- Search Functionality: All searches (supplies, pets) with intelligent typo tolerance
  - **Fuzzy Search (NEW):** Auto-corrects typos and finds closest matches (70% similarity threshold)
    - Example: "thermoneter" finds "thermometer" products
    - Example: "chamelion" finds "chameleon" products
    - Searches across name, brand, and description fields
    - Results sorted by relevance (exact matches first, then close matches)
  - Search works across all supply pages (main Supplies, Aquatics, Exotic Reptiles)
  - Search combines with category and filterType filters (AND logic)
  - Whitespace-only searches treated as empty searches
  - Search bars integrated into specialty pages (Aquatics, Reptiles) with pagination support
- Supply Filtering: Centralized, research-based filtering system with proper brand/keyword separation (server/filterConfig.ts):
  - Reptile supplies: ZooMed, Exo Terra, Zilla, Fluker's, ReptiCare brands + reptile keywords
  - Aquatic supplies: Hikari, Tetra, Aqueon, Marineland, API, Fluval, SeaChem, GloFish brands + aquatic keywords
  - **Cross-category brands (ZooMed)**: Make both aquatic AND reptile products - not excluded from either category, keywords determine final categorization
  - **Keyword priority system**: Species-specific keywords (60pts) override brand scoring (40pts) for accurate categorization
  - **Exclusion logic**: Brand exclusions prevent brand scoring only; keyword exclusions prevent keyword scoring only
  - Toy brands (Kong, Nylabone, Chuckit!, etc.) hard-excluded from both categories via brand AND keyword exclusions
  - Example: "ZooMed Pleco" → pleco keyword (60pts aquatic) beats ZooMed brand (40pts reptile) → categorized as Aquatic

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
- **Appointment System:** 15-minute intervals, admin approval, email notifications, Google Calendar sync, chronological ordering, customer arrival/payment tracking, weekly limits, special date configurations, groomer assignment, role-based access, multi-pet booking, and comprehensive history.
- **Order & Notification System:** Admin email/push notifications for new orders/appointments, customer email/SMS/web push for status, and detailed order history.
- **Authentication & Authorization:** JWT tokens in secure cookies, password reset, user settings, admin user management, three-tier role system (Customer, Groomer, Admin).
- **Wishlist System:** Dedicated page with add/remove and quick "Add to Cart."
- **Google Calendar & Contact Management:** Connected Google Calendar, unified calendar view, hybrid contact system with multi-pet support, automatic phone number extraction, event creation from contacts, and seamless multi-pet booking integration.
- **Groomer Management System:** Admin CRUD operations for groomers.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtered by species.
- **Admin Order Management:** Displays actual product/pet and customer names in order details.
- **Orders & Appointments Search:** Unified search in admin panel by customer name, phone, or pet name.
- **Pet Boarding/Babysitting System:** Complete boarding management with intelligent cost calculation, flexible date management, status tracking (Scheduled, In Boarding, Completed), quick actions, and admin-only access.
- **Database Sync Tools:** Staging import with duplicate prevention (Excel), supplies-only sync (admin-only), and full database sync (development-only).
- **Auto-Categorization System:** Single-button operation for both specialty section (filterType) and product type (category) classification based on brand and keyword analysis. Includes brand-based exclusion logic to prevent toy brands from being miscategorized as reptile/aquatic supplies (e.g., Kong toys with animal names stay in toys category).
- **Smart Abbreviation Expansion System:** Context-aware expansion of abbreviations in product names/descriptions with intelligent detection:
  - **Water Chemistry pH:** "Api Ph Test Kit" → "Api pH Test Kit" (detects test/kit/down/up keywords + aquatic brands)
  - **Brand Name:** "Ph Cozy Corner Lg" → "Prevue Hendrix Cozy Corner Large"
  - **Aquarium Gallon:** "10 Ga Tank" → "10 Gallon Tank" (detects tank/aquarium/filter keywords + numbers + aquatic brands)
  - **Phosphate:** "Aqueon Phos Remove" → "Aqueon Phosphate Remove"
  - **Food/Flavors:** Red B → RedBarn, White Gr → With Grain, Blubrede → Blueberry, Waf → Waffer, Froz → Frozen, Blo → Blood, Cmbs → Crumbs
  - **Sizes:** Lg/Med/Sm/Xs/Xl/Xxl → Large/Medium/Small/Extra Small/Extra Large/Extra Extra Large
  - **Colors:** Bk → Black, Dk → Dark, Lt → Light
  - **Quality:** Hvy Dty → Heavy Duty
  - **Animals:** Eleph → Elephant
  - **Misc:** Cmfrt → Comfort, Asst → Assorted, Jr/Sr → Junior/Senior, Kng → Kong, Nat/Natu → Natural, Pk/Dbl/Sngl → Pack/Double/Single, Thermoneter → Thermometer
  - Single-button admin operation with smart context detection
  - Auto-applied when editing supplies in admin panel
- **Brand Extraction System:** Comprehensive brand database for automated brand assignment to products.
- **Product Image Management System:** Statistics dashboard, manual image search, automated batch search with preview and approval, cost management, and admin-only access.
- **Employee Schedule Management System:** Sectioned schedule view with sequential weekly dates (Section A = previous week, B = current week, C = next week), weekly editable grid with date display (e.g., "Mon 11/17"), employee management, flexible time slots, batch save, data persistence, empty state handling, and admin-only access.

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