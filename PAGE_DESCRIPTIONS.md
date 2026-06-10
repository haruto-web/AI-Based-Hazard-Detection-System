# HAZORA Dashboard - Page Descriptions

## Technology Stack
- **Frontend Framework:** React 19.2.6 with Vite
- **Routing:** React Router DOM 7.15.1
- **Database:** Firebase Firestore (NoSQL Cloud Database)
- **Authentication:** Firebase Authentication
- **AI/ML Models:** TensorFlow.js with COCO-SSD and BlazeFace
- **Styling:** Custom CSS

---

## 1. Login Page (`/login`)
**File:** `src/pages/Login.jsx`

### Description
User authentication page for existing users to access the HAZORA dashboard.

### Features
- **Email & Password Login:** Input fields for user credentials
- **Password Visibility Toggle:** Show/hide password functionality
- **Firebase Authentication:** Secure login using Firebase Auth
- **Navigation Link:** Redirect to registration page for new users
- **Form Validation:** Real-time validation of email and password
- **Session Management:** Maintains user login state across sessions

### Components Used
- `AuthForm.jsx` - Reusable authentication form component

---

## 2. Registration Page (`/register`)
**File:** `src/pages/Register.jsx`

### Description
New user account creation page with role-based access control.

### Features
- **Full Name Input:** User's complete name
- **Phone Number Field:** Contact information validation
- **Role Selection:** Dropdown to choose user role (HSE Head, Head Office, Engineer, etc.)
- **Email Registration:** Unique email validation
- **Password Creation:** Minimum 6 characters with show/hide toggle
- **Firebase Integration:** Creates user account in Firebase Auth and Firestore
- **Auto-login:** Redirects to dashboard after successful registration
- **Navigation Link:** Link to login page for existing users

### Components Used
- `AuthForm.jsx` - Reusable authentication form component

---

## 3. Dashboard Page (`/dashboard`)
**File:** `src/pages/Dashboard.jsx`

### Description
Main analytics and monitoring hub displaying safety metrics and performance data.

### Features
- **Site Selector:** Dropdown to switch between different construction sites
- **Time Period Filters:** Last 24 Hours, Last 7 Days, Last 30 Days
- **Key Metrics Cards:**
  - Total Detected Workers
  - Hard Hat Compliance Rate (%)
  - No Hard Hat Violations Count
  - Gas/Smoke Alerts Count
  - Most Common Hazard Type
- **Safety Performance Chart:** Visual graph showing incidents over time
- **Export Report Button:** Generate and download safety reports
- **Real-time Updates:** Live data from Firebase Firestore
- **Connection Indicator:** Shows backend connectivity status

### Components Used
- `AnalyticsDashboard.jsx` - Main analytics component
- `SiteSelector.jsx` - Site selection dropdown
- `ConnectionIndicator.jsx` - Connection status indicator
- `Sidebar.jsx` - Navigation sidebar
- `TopNavBar.jsx` - Top navigation with user info and notifications

---

## 4. Live Streams Page (`/live-streams`)
**File:** Component in `Dashboard.jsx` (route-based rendering)

### Description
Real-time video monitoring page displaying camera feeds from construction sites with AI-powered hazard detection.

### Features
- **Multi-Stream Grid:** Display up to 3 camera streams simultaneously
- **Stream Configuration:**
  - Camera IP address input
  - Stream URL configuration
  - Connect/Disconnect controls
- **AI Detection Overlay:** Real-time hazard annotations on video feeds
- **Stream Status Indicators:** Shows connection state for each camera
- **Camera Setup Guide:** Collapsible instructions panel for camera configuration
- **Site Selection:** Filter streams by construction site
- **Full-screen Mode:** Option to expand individual stream views

### Components Used
- `StreamGrid.jsx` - Grid layout for multiple streams
- `StreamBox.jsx` - Individual stream container
- `StreamViewer.jsx` - Video player with AI overlay
- `CameraConfig.jsx` - Camera configuration interface
- `CollapsibleGuide.jsx` - Setup instructions panel
- `DetectionViewer.jsx` - AI detection visualization

### AI Detection Features
- Hard hat compliance detection
- Person detection and tracking
- Hazardous area monitoring
- Gas/smoke detection alerts

---

## 5. Reports Page (`/reports`)
**File:** Component reference in routing

### Description
Historical report generation and management page for safety compliance documentation.

### Features
- **Site Filter:** Dropdown to select specific construction site
- **Report Table Columns:**
  - Report Date
  - Time Period covered
  - Total Incidents count
  - Download button
- **Generate New Report Button:** Create custom reports
- **Empty State Message:** "No reports available for this site" when no data exists
- **Note:** "Full report generation (using Azure Blob/email integration) is not yet integrated"
- **Export Functionality:** Download reports in PDF/CSV format (future implementation)

### Components Used
- `ReportsPage.jsx` - Main reports interface
- `ReportsPlaceholder.jsx` - Empty state component

### Planned Features
- Azure Blob Storage integration
- Automated email reports
- Custom date range selection
- Advanced filtering and search

---

## 6. About Page (`/about`)
**File:** Component reference in routing

### Description
Project information page explaining the HAZORA system, its features, and technical implementation.

### Features
- **Project Overview:** Introduction to HAZORA's IoT-based hazard detection system
- **Technology Stack Display:**
  - ESP32-CAM devices
  - MQ-135 gas sensors
  - Artificial Intelligence integration
  - Computer Vision technologies
- **System Flow Diagram:** Visual representation of data flow from sensors to dashboard
- **Feature Highlights:**
  - Real-time hazard detection
  - Safety notifications
  - Data recording and analytics
- **Developer Information:** Credits to Archis Inc.
- **Mission Statement:** Workplace safety improvement goals

### Components Used
- `AboutPage.jsx` - Main about page component

---

## 7. Profile Page (`/profile`)
**File:** Component reference in routing

### Description
User account management page for viewing and editing personal information.

### Features
- **User Avatar Display:** Circular initial badge with user's first letter
- **Read-only Information Display:**
  - Full Name
  - Email Address (with change email option)
  - Phone Number
  - Role/Position
- **Edit Profile Button:** Opens profile editing interface
- **Account Settings:** Future implementation for preferences
- **Password Management:** Change password functionality (Firebase Auth)
- **Logout Option:** Sign out from current session

### Components Used
- `ProfilePage.jsx` - Main profile interface

### Data Source
- User data fetched from Firebase Firestore `users` collection
- Authentication state from Firebase Auth

---

## Shared Components

### Navigation Components
- **`Sidebar.jsx`** - Left navigation menu with active route highlighting
- **`TopNavBar.jsx`** - Top bar with search, theme toggle, notifications, user menu, logout
- **`Footer.jsx`** - Bottom footer with contact information and copyright

### Utility Components
- **`ProtectedRoute.jsx`** - Route guard for authenticated pages
- **`ConnectionIndicator.jsx`** - WebSocket/backend connection status
- **`NotificationSystem.jsx`** - Real-time alert notifications
- **`OnboardingTour.jsx`** - First-time user guidance

### Context Providers
- **`AuthContext.jsx`** - Global authentication state management
- **`SiteContext.jsx`** - Multi-site data management
- **`ThemeContext.jsx`** - Dark/light theme switching
- **`NotificationContext.jsx`** - Alert notification management

---

## Database Schema (Firebase Firestore)

### Collections
1. **`users`** - User profile information
   - name, email, phone, role, createdAt

2. **`sites`** - Construction site information
   - name, location, cameras, active status

3. **`detections`** - AI detection records
   - siteId, cameraId, timestamp, hazardType, severity

4. **`incidents`** - Safety incident logs
   - siteId, description, timestamp, resolvedStatus

5. **`reports`** - Generated safety reports
   - siteId, dateRange, metrics, generatedAt

---

## Authentication Flow
1. User enters credentials on Login/Register page
2. Firebase Authentication validates credentials
3. User data stored/retrieved from Firestore `users` collection
4. Auth token stored in browser (session/local storage)
5. Protected routes check auth state via `AuthContext`
6. User redirected to dashboard upon successful authentication

---

## Key Features Summary
✅ Multi-site monitoring dashboard  
✅ Real-time video streaming with AI detection  
✅ Firebase Authentication & Firestore database  
✅ Role-based access control  
✅ Safety analytics and reporting  
✅ TensorFlow.js AI models integration  
✅ Responsive design with theme support  
✅ Real-time notifications system  

---

**Last Updated:** June 10, 2026  
**Project:** HAZORA - AI-Based Hazard Detection System  
**Developer:** Archis Inc.
