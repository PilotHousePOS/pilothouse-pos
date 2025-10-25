# Animal House Pet Store

## Overview
A mobile-friendly web application for "Animal House" pet store, specializing in pet browsing, grooming appointment booking, and pet supply purchasing. The application includes inventory management and customer accounts with administrative functionalities. It features a dark, bold design focused on grooming services (bath and full service), pet adoption, and exotic reptile specialties, explicitly excluding vet care or training services. The business vision is to provide a streamlined, branded online presence for pet owners, enhancing service accessibility and product sales for "Animal House."

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

## System Architecture
The application is built as a full-stack web application with a clear separation of concerns.

**UI/UX Decisions:**
- Dark, bold design with strong contrast, consistent with "Animal House" branding.
- Mobile-friendly and responsive design, utilizing full-screen modals for mobile forms.
- Amazon-style image enlargement functionality for product and pet cards, including clickable detail modals with smooth animations.
- Themed headers for dedicated Aquatics (blue) and Exotic Reptiles (green) pages.
- Prominent warning banners for breed restrictions in appointment booking.
- Use of toast notifications for enhanced user feedback (e.g., login errors).

**Technical Implementations & Feature Specifications:**
- **Pet & Supply Management:** 
    - Multi-image support for products and pets, allowing unlimited photo uploads via an admin panel component.
    - Amazon-style double-click image enlargement with carousel navigation (arrows, dots, counter) for multiple images.
- **Appointment System:**
    - 15-minute appointment intervals.
    - Admin approval workflow for grooming appointments with pending approval section and approve/reject functionality.
    - Automated email notifications for appointment rejections with professional templates.
    - Storage of owner contact information with appointments.
    - Dedicated My Appointments page with upcoming/past appointment sections and status badges.
- **Order & Notification System:**
    - Admin notification system for new orders and appointments via email and push notifications (console logging).
    - Customer notification system via email, SMS (Twilio), and web push for order status updates.
    - Order History page with order details modal showing items, shipping address, and status tracking.
- **Authentication & Authorization:**
    - JWT tokens with secure cookie storage for authentication.
    - Comprehensive password reset system with email workflow (SendGrid integration), token expiration, and single-use tokens.
    - User settings page for name, email, and password changes with validation and token rotation.
    - Admin user management system with `isAdmin` field, secure API endpoints, and toggle switches for privilege management.
    - Robust error handling for authentication processes.
- **Wishlist System:**
    - Dedicated Wishlist page for saving items to purchase later.
    - Add/remove functionality with secure ownership verification.
    - Quick "Add to Cart" button from wishlist items.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtering content by species.
- **Navigation:** 
    - Enhanced bottom navigation with scroll-to-top behavior.
    - Quick action cards on profile page for Order History, My Appointments, Wishlist, and Settings.
    - Universal back button on all secondary pages (Order History, My Appointments, Wishlist, Settings, Aquatics, Reptiles, Admin, Booking) that navigates to the previous page in browser history.

**System Design Choices:**
- **Frontend**: React with Vite, TypeScript, Tailwind CSS, shadcn/ui components.
- **Backend**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: JWT tokens stored in cookies, chosen for consistency and security over session-based methods.
- **State Management**: TanStack Query for server state management.
- **Routing**: Wouter for client-side routing.
- **Development Practices**: Strict TypeScript usage for type safety, proper HTTP status codes for API responses, environment-aware configurations.

## External Dependencies
-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Email Service**: SendGrid (for password reset and appointment rejection emails)
-   **SMS Service**: Twilio (for customer order status updates)
-   **Frontend Framework**: React
-   **Build Tool**: Vite
-   **Styling**: Tailwind CSS
-   **UI Component Library**: shadcn/ui
-   **Server-Side Framework**: Express.js
-   **Query Library**: TanStack Query
-   **Client-Side Router**: Wouter