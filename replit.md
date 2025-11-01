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

**Technical Implementations & Feature Specifications:**
- **Pet & Supply Management:** Multi-image support with Amazon-style enlargement and mobile swipe gestures.
- **Appointment System:** 
    - 15-minute intervals with admin approval workflow and automated email notifications
    - "My Appointments" page for customers
    - Google Calendar appointment sync with incremental imports (no duplicates) and intelligent parsing
    - **Google Calendar Integration**: ALL calendar events sync to appointments (phone numbers optional, syncs from today onwards). Newly synced events appear in pending appointments requiring admin approval
    - **Service Type Detection**: Events with "bath" in title marked as "Bath Only", all others as "Full Grooming"
    - **Collapsible UI**: Pending appointments visible by default; Approved and Denied appointments behind expandable buttons
    - **Pagination System**: Approved and Denied appointments display 4 items per page with mobile swipe gestures and arrow navigation. Automatic page clamping prevents blank sections when lists shrink after status changes
    - Role-based access: Groomers can view all appointments including pending, approved, and completed (read-only status updates), admins have full modification access
    - Visual indicators: Google Calendar appointments display "Synced" badge throughout workflow
    - **Automatic Cleanup**: Approved, completed, cancelled, and rejected appointments older than 30 days are automatically filtered from the appointments list to maintain database efficiency
    - **Booking Restrictions**: Customers can only book appointments starting from tomorrow (same-day booking prevention) with frontend and backend validation, while admins and groomers retain flexibility to book same-day appointments
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
    - **Pagination System**: Contacts display 4 items per page with inline pagination controls (ChevronLeft/ChevronRight arrows, page indicators). Automatic page clamping prevents blank sections when filtered list shrinks. Mobile swipe gesture support included.
    - Event creation from contacts interface with multi-contact selection.
- **Groomer Management System:** Dedicated admin tab for CRUD operations on groomers (name, email, phone, specialties, active status). Includes active/inactive toggle, search, and real-time updates.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtering content by species.
- **Admin Order Management:** Displays actual product/pet names and customer names in order details.

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