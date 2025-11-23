# Animal House Pet Store

## Overview
A mobile-friendly web application for the "Animal House" pet store, designed to enhance online presence, service accessibility, and product sales. It facilitates pet browsing, grooming appointment booking, and pet supply purchasing, including exotic reptiles. The application integrates inventory management, customer accounts, and administrative functionalities, specifically excluding vet care and training services.

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
  - Fuzzy Search: Auto-corrects typos and finds closest matches (70% similarity threshold)
  - Searches across name, brand, and description fields
  - Results sorted by relevance (exact matches first, then close matches)
  - Search works across all supply pages (main Supplies, Aquatics, Exotic Reptiles)
  - Search combines with category and filterType filters (AND logic)
  - Whitespace-only searches treated as empty searches
  - Search bars integrated into specialty pages (Aquatics, Reptiles) with pagination support
- Supply Filtering: Centralized, research-based filtering system with proper brand/keyword separation (server/filterConfig.ts):
  - Reptile supplies: ZooMed, Exo Terra, Zilla, Fluker's, ReptiCare brands + reptile keywords
  - Aquatic supplies: Hikari, Tetra, Aqueon, Marineland, API, Fluval, SeaChem, GloFish brands + aquatic keywords
  - Cross-category brands (ZooMed): Make both aquatic AND reptile products - not excluded from either category, keywords determine final categorization
  - Keyword priority system: Species-specific keywords (60pts) override brand scoring (40pts) for accurate categorization
  - Exclusion logic: Brand exclusions prevent brand scoring only; keyword exclusions prevent keyword scoring only
  - Toy brands (Kong, Nylabone, Chuckit!, etc.) hard-excluded from both categories via brand AND keyword exclusions
  - Example: "ZooMed Pleco" → pleco keyword (60pts aquatic) beats ZooMed brand (40pts reptile) → categorized as Aquatic

## System Architecture
The application is a full-stack web application. The frontend uses React, Vite, TypeScript, Tailwind CSS, and shadcn/ui. The backend uses Express.js with TypeScript, connected to a PostgreSQL database via Drizzle ORM.

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
- **Google Calendar & Contact Management:** Connected Google Calendar, unified calendar view, hybrid contact system with multi-pet support, automatic phone number extraction, event creation from contacts, seamless multi-pet booking integration, auto-capitalization, and automatic capacity validation.
- **Groomer Management System:** Admin CRUD operations for groomers.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtered by species.
- **Admin Order Management:** Displays actual product/pet and customer names in order details.
- **Orders & Appointments Search:** Unified search in admin panel by customer name, phone, or pet name.
- **Pet Boarding/Babysitting System:** Complete boarding management with intelligent cost calculation, flexible date management, status tracking, quick actions, and admin-only access.
- **Database Sync Tools:** Staging import with duplicate prevention, supplies-only sync (admin-only), and full database sync (development-only).
- **Auto-Categorization System:** Single-button operation for specialty section and product type classification based on brand and keyword analysis, including brand-based exclusion logic. Includes a Live Animal Detection (Step 0) system that scans supplies for live animals, creates pet records, and handles foreign key constraints.
- **Smart Abbreviation Expansion System:** Context-aware expansion of abbreviations in product names/descriptions with intelligent detection for various categories (e.g., Water Chemistry pH, Brand Names, Aquarium Gallons, Food/Flavors, Sizes, Colors, Quality, Animals). Single-button admin operation and auto-applied when editing supplies.
- **Brand Extraction System:** Comprehensive brand database for automated brand assignment.
- **Product Image Management System:** Statistics dashboard, manual image search, automated batch search with preview and approval, cost management, and admin-only access.
- **Employee Schedule Management System:** Sectioned schedule view (previous, current, next week), editable grid, employee management, flexible time slots, batch save, data persistence, empty state handling, and admin-only access.
- **Grooming Schedule Management System:** Simplified weekly schedule for groomers showing current week, editable groomer names and time slots, add/remove groomers, batch save, data persistence, and admin-only access.
- **AI-Powered Order Photo Upload System:** Upload supplier order photos to extract items automatically with GPT-5 vision, adjustable price multiplier, editable extracted items, bulk add to inventory with automatic categorization, and photo management with history. Features a production-ready Live Animal Detection System with a three-set taxonomy (Live Indicators, Base Species Nouns, Multi-Word Patterns), species categorization rules, supply exclusion keywords, word-boundary matching, remaining-word validation, and custom .99 pricing for live animals.
- **Astro Loyalty Integration:** Customer loyalty program integration including automatic account linking, purchase sync, frequent buyer program monitoring, and admin dashboard.
- **POS Integration System:** Real-time price and inventory synchronization with external Point of Sale systems with a priority-based override logic (Manual Admin Edits > POS Data > AI Order Photo Extraction > Excel Imports/Default Data). Includes tracking fields, real-time sync via webhook, manual override capabilities, bulk operations, POS-agnostic design, and an admin dashboard for sync status.

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