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
- Touch-friendly image carousels with swipe gesture support for mobile devices (minimum 50px swipe distance to navigate).
- Themed headers for dedicated Aquatics (blue) and Exotic Reptiles (green) pages.
- Prominent warning banners for breed restrictions in appointment booking.
- Use of toast notifications for enhanced user feedback (e.g., login errors).

**Technical Implementations & Feature Specifications:**
- **Pet & Supply Management:** 
    - Multi-image support for products and pets, allowing unlimited photo uploads via an admin panel component.
    - Amazon-style double-click image enlargement with carousel navigation (arrows, dots, counter) for multiple images.
    - Mobile-friendly swipe gestures for image navigation (swipe left for next, swipe right for previous) in addition to click/tap controls.
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
- **Google Calendar Integration & Contact Management:**
    - Connected Google Calendar via Replit integration for event and contact management.
    - Unified calendar view displaying both database appointments and Google Calendar events side-by-side.
    - Color-coded events: Blue for grooming appointments, purple for Google Calendar events.
    - Date-specific event fetching to show all events for a selected day.
    - Admin panel displays upcoming Google Calendar events with attendees and event details.
    - **Hybrid Contact System:**
        - Manual contact database with full CRUD operations for contacts with phone numbers
        - Database schema includes: name (required), email (required), phoneNumber (optional), notes (optional), timestamps, source (manual/google_calendar), linkedUserId (nullable)
        - Multi-layer email validation: Client-side and server-side validation with trimming and @ symbol check to ensure data integrity
        - Defensive filtering in calendar event creation to prevent invalid emails from breaking Google Calendar API calls
        - Google Calendar contacts extracted from event attendees (email and name only)
        - **Automatic Phone Number Extraction & Syncing:**
            - Phone numbers automatically extracted from Google Calendar event descriptions using regex patterns
            - "Sync Contacts from Calendar" button in admin panel to manually trigger contact sync
            - Prevents duplicate contacts using normalized phone number comparison (digits-only)
            - Contact source tracking: "manual" for user-created, "google_calendar" for auto-synced
        - **User-Contact Auto-Linking System:**
            - When users sign up with a phone number, system automatically searches for matching unlinked contacts
            - Phone number normalization ensures reliable matching regardless of format differences (e.g., "(555) 123-4567" vs "555-123-4567")
            - Two-way relationship: contacts.linkedUserId points to users.id, users.phoneNumber enables matching
            - Unlinked contacts can be linked to user accounts through normalized phone number comparison
        - Unified contact list merging both manual and Google Calendar contacts
        - Contact cards display name, email, phone number (manual contacts only), notes, and linked user status
        - Visual badges distinguish between "Manual" (green) and "Google" (purple) contacts
        - Edit/delete functionality available only for manual contacts
        - Search functionality across all contact fields including phone numbers
    - **Contact Management UI:**
        - Add Contact button opens dialog for creating new contacts with phone number field
        - Edit Contact dialog pre-fills data for updating manual contacts
        - Delete Contact with confirmation dialog for removing manual contacts
        - Real-time search filtering by name, email, or phone number:
            - Name: contains matching (case-insensitive) - finds "oreo" in "Cookie Oreo" or "Oreo Smith"
            - Email: contains matching (case-insensitive)
            - Phone: exact match only - must type complete phone number digits (e.g., "3182675975")
            - Results alphabetically sorted by name
        - Contact cards show all available information with proper formatting
        - **Pagination System:**
            - 4 contacts per page in 2x2 grid (desktop) or vertical stack (mobile)
            - Fixed circular navigation arrows positioned at screen edges (left-4/right-4)
            - Swipe gesture support for mobile (50px minimum swipe distance)
            - Page indicators with dots and "Page X of Y" counter
            - Auto-reset to page 1 when searching
        - **Smart Phone Number Display:**
            - Responsive formatting: inline (555) 123-4567 on larger screens (sm breakpoint and up)
            - Vertical stacking on mobile: (555) on top, 123 in middle, 4567 on bottom
            - Automatic digit extraction handles various input formats
            - Fallback display for non-standard phone numbers
    - **Event Creation Integration:**
        - Create calendar events directly from contacts interface with multi-contact selection
        - Searchable dropdown combines both manual and Google Calendar contacts
        - Event creation form with title, description, date, start/end time, and attendee management
        - Selected contacts displayed with badges and removal buttons
    - **API Endpoints:**
        - GET /api/contacts - Fetch all manual contacts (admin only)
        - POST /api/contacts - Create new manual contact (admin only)
        - PUT /api/contacts/:id - Update manual contact (admin only)
        - DELETE /api/contacts/:id - Delete manual contact (admin only)
        - GET /api/admin/calendar/events - Fetch Google Calendar events
        - GET /api/admin/calendar/contacts - Extract contacts from calendar event attendees
        - POST /api/admin/calendar/events - Create new calendar events
        - POST /api/admin/calendar/sync-contacts - Sync contacts from calendar events with phone number extraction
    - Error handling for cases when Google Calendar is not connected.
    - **Note:** Full Google Contacts integration via People API is not available due to OAuth scope limitations in the Replit Google Calendar connector. Manual contact database serves as workaround for phone number storage.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtering content by species.
- **Admin Order Management:**
    - Order details display showing actual product/pet names instead of IDs.
    - Customer names displayed in order item details for admin reference.
- **Navigation:** 
    - Enhanced bottom navigation with scroll-to-top behavior.
    - Quick action cards on profile page for Order History, My Appointments, Wishlist, and Settings.
    - Universal back button positioned at the fixed top-left corner (top-4 left-4) on all secondary pages (Order History, My Appointments, Wishlist, Settings, Aquatics, Reptiles, Admin, Booking) with white circular styling, shadow-lg, and z-index 50 for clear visibility.
    - Smart navigation using the `safeGoBack` utility that prevents users from going back to authentication pages (login/sign-in), redirecting to home instead.

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
-   **Calendar Integration**: Google Calendar (for event and contact management in admin panel)
-   **Frontend Framework**: React
-   **Build Tool**: Vite
-   **Styling**: Tailwind CSS
-   **UI Component Library**: shadcn/ui
-   **Server-Side Framework**: Express.js
-   **Query Library**: TanStack Query
-   **Client-Side Router**: Wouter