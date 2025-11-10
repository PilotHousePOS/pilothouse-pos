# Animal House Pet Store

## Overview
A mobile-friendly web application for "Animal House" pet store, focusing on pet browsing, grooming appointment booking, and pet supply purchasing. The application includes inventory management, customer accounts, and administrative functionalities. It features a dark, bold design and specializes in grooming services (bath and full service), pet adoption, and exotic reptile specialties, explicitly excluding vet care or training services. The business vision is to provide a streamlined, branded online presence, enhancing service accessibility and product sales for "Animal House."

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
The application is a full-stack web application with a clear separation of concerns, built with React, Vite, TypeScript, Tailwind CSS, shadcn/ui for the frontend, and Express.js with TypeScript for the backend, utilizing PostgreSQL with Drizzle ORM.

**UI/UX Decisions:**
- Dark, bold design with strong contrast and mobile responsiveness.
- Full-screen modals for mobile forms.
- Amazon-style image enlargement with carousels and swipe gestures.
- Themed headers for Aquatics (blue) and Exotic Reptiles (green) pages.
- Prominent warning banners for breed restrictions.
- Toast notifications for user feedback.
- Universal back button at top-left corner on secondary pages, using `safeGoBack` to prevent navigation to auth pages.
- **Force Refresh Button**: Manual refresh control in admin dashboard header to clear all cached data and force refetch from server, addressing stale data issues on tablets and mobile devices.

**Technical Implementations & Feature Specifications:**
- **Pet & Supply Management:** Multi-image support with Amazon-style enlargement and mobile swipe gestures.
- **Appointment System:** 
    - 15-minute intervals with admin approval workflow and automated email notifications
    - "My Appointments" page for customers
    - Google Calendar appointment sync with incremental imports (no duplicates) and intelligent parsing
    - **Chronological Ordering**: All appointments are ordered by date in ascending order (oldest/soonest dates first) to prioritize upcoming appointments
    - **Google Calendar Integration**: Calendar events sync to appointments (phone numbers optional, syncs from today at midnight onwards). Newly synced events appear in pending appointments requiring admin approval. Appointments remain visible all day regardless of whether their time has passed - only appointments from past DATES are hidden/deleted.
    - **Service Type Detection**: Events with "bath" in title marked as "Bath Only", all others as "Full Grooming"
    - **Collapsible UI**: Approved appointments display at the top with inline status controls; Pending Approval section follows; Pending appointments (from Google Calendar sync) come next; Denied appointments behind expandable button. All appointment sections appear before any order sections
    - **Pagination System**: Approved and Denied appointments display 4 items per page with mobile swipe gestures and arrow navigation. Sliding window shows max 5 page indicators to prevent overflow. Automatic page clamping prevents blank sections when lists shrink after status changes
    - **Customer Arrival Tracking**: "Here" checkbox on approved appointments allows admins and groomers to mark when customers arrive. Updates instantly with toast notifications. "Reset All Here" button on dashboard card allows admins to clear all isHere flags across all appointments for stale data cleanup.
    - **Weekly Appointment Limits**: Admins can set separate limits for bath and grooming appointments by day of the week (Monday through Saturday) via Grooming Settings tab. Limits are remembered and editable. System enforces limits during booking with clear error messages based on the appointment's day of week.
    - **Special Date Settings**: Admins can configure specific dates (e.g., holidays) with custom booking time slots via Grooming Settings tab. Special dates override normal operating hours and weekly limits. Normalized database schema with separate tables for special dates and their allowed times. Backend validation ensures only configured times can be booked on special dates. Booking page automatically displays only allowed times when a special date is selected, with a visual indicator notifying users of limited availability.
    - **Groomer Assignment**: Admin and groomer users can assign groomers to appointments during booking or via appointment editing. Groomer names display on appointment cards alongside service type and other details.
    - Role-based access: Groomers can edit already-approved appointments (details and status changes) and contacts, but cannot approve/reject pending appointments. Admins have full modification access including deletion and appointment approval.
    - Visual indicators: Google Calendar appointments display "Synced" badge throughout workflow
    - **Automatic Filtering**: Approved and denied appointments from dates before today are automatically hidden from the UI (only today and future appointments display). Past appointments remain in database until manually deleted via "Clear Past" button or scheduled cleanup
    - **Booking Restrictions**: Customers can only book appointments starting from tomorrow (same-day booking prevention) with frontend and backend validation, while admins and groomers retain flexibility to book same-day appointments. Booking page uses loading state to ensure user role is loaded before rendering the form, preventing security bypass
    - **Scheduled Tasks**: Automated daily maintenance tasks using node-cron
      - Clear past approved appointments (confirmed/completed) and reset ALL isHere flags across all appointments daily at 12:00 AM (EST)
      - Auto-sync Google Calendar appointments and contacts daily at 7:30 AM (EST)
    - **Manual Cleanup**: Section-specific "Clear Past" buttons available for admins in Approved, Pending, and Denied appointment sections. Each button only deletes past appointments from its respective section (Approved: confirmed/completed, Pending: scheduled, Denied: rejected/cancelled)
    - **Appointment Editing**: Admins and groomers can edit all appointment details including date, time, groomer assignment, and service type via the edit dialog. Date formatting uses local timezone to prevent date shift issues when saving changes
- **Order & Notification System:** Admin email/push notifications for new orders/appointments. Customer email/SMS/web push for order status. Order History page with detailed modals.
- **Authentication & Authorization:** 
    - JWT tokens in secure cookies with comprehensive password reset
    - User settings and admin user management
    - Three-tier role system: Customer (default), Groomer (`isGroomer`), Admin (`isAdmin`)
    - Groomer role: Read-only access to admin panel with full view permissions, can sync Google Calendar appointments directly from Orders tab
    - Admin role: Full access to all appointments, user management, and modification capabilities
    - Both groomers and admins can trigger Google Calendar sync from the Pending Appointments section
- **Wishlist System:** Dedicated page for saving items, add/remove functionality, and quick "Add to Cart."
- **Google Calendar & Contact Management:**
    - Connected Google Calendar via Replit integration for workspace-level event and contact management.
    - Unified calendar view displaying database appointments and Google Calendar events side-by-side with color coding.
    - Hybrid contact system: manual database (CRUD, phone numbers, email validation) merged with Google Calendar contacts (extracted from event attendees).
    - Automatic phone number extraction from Google Calendar event descriptions and syncing with duplicate prevention.
    - User-contact auto-linking system based on normalized phone numbers.
    - Contact management UI with add/edit/delete, real-time search (name, email, phone), and smart phone number display.
    - **Pagination System**: Contacts display 4 items per page with inline pagination controls (ChevronLeft/ChevronRight arrows, page indicators). Sliding window shows max 5 page indicators to prevent overflow. Automatic page clamping prevents blank sections when filtered list shrinks. Mobile swipe gesture support included.
    - Event creation from contacts interface with multi-contact selection.
- **Groomer Management System:** Dedicated admin tab for CRUD operations on groomers (name, email, phone, specialties, active status). Includes active/inactive toggle, search, and real-time updates.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtering content by species.
- **Admin Order Management:** Displays actual product/pet names and customer names in order details.
- **Orders & Appointments Search:** Unified search bar at top of Orders & Appointments tab filters both database appointments (all statuses) and orders (all statuses) by customer name, phone number, or pet name. Matching cards are visually highlighted with amber border (border-2 border-amber-400) and amber background (bg-amber-50) for easy identification. Note: Google Calendar events displayed in the Calendar tab are separate and not included in this search.

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