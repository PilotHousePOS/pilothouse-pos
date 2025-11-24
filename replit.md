# Animal House Pet Store

## Overview
A mobile-friendly web application for the "Animal House" pet store, aimed at enhancing its online presence, service accessibility, and product sales. The application facilitates pet browsing, grooming appointment booking, and pet supply purchasing (including exotic reptiles). It integrates inventory management, customer accounts, and administrative functionalities, specifically excluding vet care and training services. The business vision is to provide a comprehensive online platform that boosts sales and streamlines operations for a modern pet store.

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
  - Fuzzy Search: Auto-corrects typos and finds closest matches (70% similarity threshold)
  - Searches across name, brand, and description fields
  - Results sorted by relevance (exact matches first, then close matches)
  - Search works across all supply pages (main Supplies, Aquatics, Exotic Reptiles)
  - Search combines with category and filterType filters (AND logic)
  - Whitespace-only searches treated as empty searches
  - Search bars integrated into specialty pages (Aquatics, Reptiles) with pagination support
  - Brand Name Expansion: Automatically maps abbreviated brand names to full names for better search results (server/brandNameExpansion.ts)
    - Example: "Diamond" → finds products with "Diam" in name
    - Example: "Blue Buffalo" → finds products with "Blue B"
    - Example: "Primal" → finds products with "Prim", "Prim Fd", "Prim Kitr"
    - Bidirectional mapping: Search works both ways (abbreviation → full name, full name → abbreviation)
    - Always returns trimmed values to prevent whitespace regression bugs
    - Integrated into both supply fuzzy search and pet search endpoints
- Supply Filtering: Centralized, research-based filtering system with proper brand/keyword separation (server/filterConfig.ts):
  - Reptile supplies: ZooMed, Exo Terra, Zilla, Fluker's, ReptiCare brands + reptile keywords
  - Aquatic supplies: Hikari, Tetra, Aqueon, Marineland, API, Fluval, SeaChem, GloFish brands + aquatic keywords
  - Cross-category brands (ZooMed): Make both aquatic AND reptile products - not excluded from either category, keywords determine final categorization
  - Keyword priority system: Species-specific keywords (60pts) override brand scoring (40pts) for accurate categorization
  - Exclusion logic: Brand exclusions prevent brand scoring only; keyword exclusions prevent keyword scoring only
  - Toy brands (Kong, Nylabone, Chuckit!, etc.) hard-excluded from both categories via brand AND keyword exclusions
  - Example: "ZooMed Pleco" → pleco keyword (60pts aquatic) beats ZooMed brand (40pts reptile) → categorized as Aquatic

## System Architecture
The application is a full-stack web application with a React frontend (Vite, TypeScript, Tailwind CSS, shadcn/ui) and an Express.js backend (TypeScript) connected to a PostgreSQL database via Drizzle ORM.

**UI/UX Decisions:**
- Dark, bold design with strong contrast and mobile responsiveness.
- Themed headers for Aquatics (blue) and Exotic Reptiles (green) pages.
- Amazon-style image enlargement with carousels and swipe gestures.
- Full-screen modals for mobile forms and prominent warning banners for breed restrictions.
- Universal back button and force refresh button in admin dashboard.

**Technical Implementations & Feature Specifications:**
- **Pet & Supply Management:** Multi-image support, extensive inventory, automated brand extraction, specialized reptile supply filtering, case-insensitive search with pagination and touch gestures.
- **Appointment System:** 15-minute intervals, admin approval, email notifications, Google Calendar sync, customer tracking, weekly limits, special date configurations, groomer assignment, role-based access, multi-pet booking, and comprehensive history.
- **Order & Notification System:** Admin notifications for new orders/appointments, customer notifications for status updates, and detailed order history.
- **Authentication & Authorization:** JWT tokens in secure cookies, password reset, user settings, admin user management, and a three-tier role system (Customer, Groomer, Admin).
- **Wishlist System:** Dedicated page with add/remove and quick "Add to Cart."
- **Google Calendar & Contact Management:** Integrated Google Calendar, unified calendar view, hybrid contact system with multi-pet support, and event creation from contacts.
- **Groomer Management System:** Admin CRUD operations for groomers.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtered by species.
- **Admin Order Management:** Displays actual product/pet and customer names in order details.
- **Orders & Appointments Search:** Unified search in admin panel by customer name, phone, or pet name.
- **Pet Boarding/Babysitting System:** Complete boarding management with intelligent cost calculation, flexible date management, status tracking, and admin-only access.
- **Database Sync Tools:** Staging import with duplicate prevention, supplies-only sync (admin-only), and full database sync (development-only).
- **Auto-Categorization System:** Single-button operation for specialty section and product type classification based on brand and keyword analysis, including Live Animal Detection and record creation.
- **Smart Abbreviation Expansion System:** Comprehensive, research-based abbreviation expansion for major pet food brands (server/abbreviationExpansion.ts):
  - Blue Buffalo: "Blue B" → "Blue Buffalo" (30+ products)
  - Diamond: "Diam" → "Diamond" (30+ products) with context-aware measurement detection
  - Primal: "Prim Fd" → "Primal Freeze Dried", "Prim Kitr" → "Primal Kibble in the Raw" (13 products)
  - Nutrisource: Complete product line expansions (Crispy Crispers, Grillin' Grillers, PureVita, Select Series, etc.)
  - Fromm: Complete product line expansions (PurrSnickety, Four-Star, À La Veg recipes, etc.)
  - All patterns verified with official website documentation and database evidence
  - Start-of-string anchoring prevents corruption of non-brand text
  - Context-aware "Diam" expansion: Distinguishes "Diameter" (measurements like "12 inch Diam tube") from "Diamond" (brand names)
  - Ensures full product name clarity across all display and processing contexts
- **Brand Extraction System:** Comprehensive brand database for automated brand assignment.
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