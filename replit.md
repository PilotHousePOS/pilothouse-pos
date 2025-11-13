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
- **Appointment System:** 15-minute intervals, admin approval, email notifications, Google Calendar sync, chronological ordering, customer arrival/payment tracking, weekly limits, special date configurations, groomer assignment, role-based access, and comprehensive history. Paid appointments always remain visible in the approved appointments list regardless of "Customers Here" filter status.
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
    - **Shared Mappings Module:** Centralized abbreviation mappings, spelling corrections, and title case rules.
- **Product Image Management System:**
    - **Statistics Dashboard:** Real-time tracking of total products, products with/without images, breakdown by brand and category.
    - **Manual Image Search:** Individual product image URL input with preview and validation.
    - **Batch Search Tools:** Filter by brand or category for targeted image updates.
    - **Cost Management:** Warning system for web search credit usage, selective search capabilities to manage costs.
    - **Admin-Only Access:** Secure endpoints with admin authentication for all image management operations.
    - **Brand Standardization:** Automatic "Zoo Medium" → "ZooMed" standardization for consistency.
    - **API Endpoints:** /api/admin/supplies/image-stats, /api/admin/supplies/without-images, /api/admin/supplies/batch-filter, /api/admin/supplies/:id/image

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