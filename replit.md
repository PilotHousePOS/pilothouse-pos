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
- Supply Filtering: Centralized, research-based filtering system with proper brand/keyword separation (server/filterConfig.ts):
  - Reptile supplies (681 items): ZooMed, Exo Terra, Zilla, Fluker's, ReptiCare brands + reptile keywords
  - Aquatic supplies (189 items): Hikari, Tetra, Aqueon, Marineland, API, Fluval, SeaChem, GloFish brands + aquatic keywords
  - Brand categorizations based on web research of company specializations
  - Mutual exclusions with NULL-safe logic ensure no cross-contamination between categories

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
- **Pet & Supply Management:** Multi-image support, extensive inventory (5,893+ supplies), automated brand extraction (840+ brands), specialized reptile supply filter (723+ products by brand/keyword), case-insensitive search for all products and pets, and paginated supply loading (24 items per page) across all supply pages (main Supplies, Aquatics, and Exotic Reptiles) with touch gesture support to optimize performance and reduce customer lag.
- **Appointment System:** 15-minute intervals, admin approval workflow, email notifications, "My Appointments" page, Google Calendar sync, chronological ordering, service type detection, collapsible UI, pagination, customer arrival and payment tracking, weekly appointment limits, special date configurations, groomer assignment, role-based access, visual indicators, automatic past appointment hiding, booking restrictions (no same-day for customers), scheduled daily maintenance tasks, manual cleanup options, appointment editing, and comprehensive appointment history tracking integrated with contacts.
- **Order & Notification System:** Admin email/push notifications for new orders/appointments, customer email/SMS/web push for order status, and detailed order history.
- **Authentication & Authorization:** JWT tokens in secure cookies, password reset, user settings, admin user management, three-tier role system (Customer, Groomer, Admin).
- **Wishlist System:** Dedicated page with add/remove functionality and quick "Add to Cart."
- **Google Calendar & Contact Management:** Connected Google Calendar via Replit integration, unified calendar view, hybrid contact system (manual DB + Google Calendar), automatic phone number extraction, user-contact auto-linking, paginated contact management UI, and event creation from contacts.
- **Groomer Management System:** Dedicated admin tab for CRUD operations on groomers (name, email, phone, specialties, active status).
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtering content by species.
- **Admin Order Management:** Displays actual product/pet names and customer names in order details.
- **Orders & Appointments Search:** Unified search bar in admin panel to filter appointments and orders by customer name, phone number, or pet name, with visual highlighting for matches.

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