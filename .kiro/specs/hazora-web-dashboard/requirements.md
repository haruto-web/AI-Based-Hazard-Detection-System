# Requirements Document

## Introduction

This document defines the requirements for the HAZORA Web Dashboard — a React-based responsive web application for monitoring the ESP32-CAM Hazard Detection System deployed on ArchEn Inc. construction sites. The Dashboard uses Firebase for user authentication, data persistence, and real-time updates. It connects to the ESP32-CAM over the local network to display the live camera stream, capture frames, and manage device configuration.

The architecture follows: **ESP32-CAM → React Dashboard → Firebase**

The ESP32-CAM firmware is already complete, serving endpoints on the local network:
- `/stream` (port 81) — MJPEG live video stream
- `/capture` — Single JPEG frame capture
- `/status` — Device status JSON
- `/reset` — Wi-Fi credential reset (POST)

The requirements are organized into phases reflecting development priority. Phase 1 (Authentication + Connection) is the immediate deliverable. Subsequent phases build incrementally on the working foundation.

**Technology stack**: React (with Vite build tooling), Firebase Authentication, Firebase Firestore, responsive CSS (CSS Modules or Tailwind CSS). No server-side rendering required.

## Glossary

- **Dashboard**: The React-based responsive web application defined in this document, built with Vite and deployed as a single-page application
- **ESP32-CAM**: The ESP32-CAM microcontroller running the HAZORA firmware, serving camera streams and status endpoints on the Local_Network
- **Firebase_Auth**: The Firebase Authentication service used for user login, registration, and session management
- **Firestore**: The Firebase Cloud Firestore database used to store per-user camera configuration, alerts, and history
- **Stream_Viewer**: The React component that displays the live MJPEG video feed from the ESP32-CAM
- **Auth_Module**: The set of React components and Firebase logic responsible for user registration, login, logout, and session persistence
- **Status_Panel**: The React component that displays real-time device information retrieved from the ESP32-CAM /status endpoint
- **Camera_IP**: The local network IP address of the ESP32-CAM device, stored per user in Firestore
- **MJPEG_Stream**: The multipart JPEG video stream served by the ESP32-CAM on port 81 at the /stream endpoint
- **Local_Network**: The Wi-Fi network that both the user's browser device and the ESP32-CAM are connected to
- **Alert_Store**: The Firestore collection that stores detection alerts and event history per user
- **User_Profile**: The Firestore document containing a user's camera configuration and preferences

---

## Requirements

---

### Phase 1: Authentication + Connection (Core)

---

### Requirement 1: User Registration

**User Story:** As a site engineer, I want to create an account on the HAZORA Dashboard, so that my camera configuration and alert history are saved securely to my profile.

#### Acceptance Criteria

1. WHEN an unauthenticated user navigates to the Dashboard, THE Auth_Module SHALL display a registration form with fields for email address and password
2. WHEN the user submits valid registration credentials, THE Auth_Module SHALL create a new user account via Firebase_Auth and automatically log the user in upon successful creation
3. WHEN registration succeeds, THE Auth_Module SHALL create a User_Profile document in Firestore with the user's UID as the document ID, containing empty default values for Camera_IP and preferences
4. IF the user submits an email address already associated with an existing account, THEN THE Auth_Module SHALL display an error message indicating the email is already registered
5. IF the user submits a password shorter than 6 characters, THEN THE Auth_Module SHALL display a validation error message before sending the request to Firebase_Auth
6. THE Auth_Module SHALL provide a navigation link from the registration form to the login form for users who already have an account

### Requirement 2: User Login

**User Story:** As a site engineer, I want to log in to the HAZORA Dashboard, so that I can access my saved camera configuration and monitoring history.

#### Acceptance Criteria

1. WHEN an unauthenticated user navigates to the Dashboard, THE Auth_Module SHALL display a login form with fields for email address and password
2. WHEN the user submits valid login credentials, THE Auth_Module SHALL authenticate the user via Firebase_Auth and redirect to the main Dashboard view
3. WHILE a user is authenticated, THE Auth_Module SHALL persist the session using Firebase_Auth session persistence so the user remains logged in across browser tabs and page reloads
4. IF the user submits incorrect credentials, THEN THE Auth_Module SHALL display an error message indicating invalid email or password without specifying which field is incorrect
5. THE Auth_Module SHALL provide a navigation link from the login form to the registration form for new users
6. THE Auth_Module SHALL provide a logout button visible on the main Dashboard view that signs the user out via Firebase_Auth and redirects to the login form

### Requirement 3: Authentication Route Protection

**User Story:** As a system administrator, I want unauthenticated users to be blocked from accessing the Dashboard, so that only authorized personnel can monitor construction site cameras.

#### Acceptance Criteria

1. WHILE no user is authenticated, THE Dashboard SHALL redirect all navigation attempts to the login form and SHALL NOT render the main Dashboard view
2. WHEN a user's authentication session expires or is revoked, THE Dashboard SHALL redirect the user to the login form within 5 seconds of detecting the session change
3. THE Dashboard SHALL subscribe to Firebase_Auth authentication state changes and update the UI accordingly without requiring a page reload

### Requirement 4: Camera IP Configuration with Firestore Persistence

**User Story:** As a site engineer, I want to enter the ESP32-CAM's IP address and have it saved to my account, so that I can access my camera from any device I log in from.

#### Acceptance Criteria

1. WHEN an authenticated user has no Camera_IP stored in their User_Profile, THE Dashboard SHALL display an IP address input field prompting the user to enter the Camera_IP
2. WHEN the user submits a Camera_IP, THE Dashboard SHALL store the Camera_IP in the authenticated user's User_Profile document in Firestore
3. WHEN an authenticated user's User_Profile contains a stored Camera_IP, THE Dashboard SHALL pre-fill the IP input field with the stored address and automatically attempt to connect
4. THE Dashboard SHALL keep the IP input field editable at all times, allowing the user to change the Camera_IP and resubmit, updating the Firestore User_Profile document
5. IF the user submits an empty IP address field or a value that does not match the IPv4 format (four dot-separated numbers 0-255), THEN THE Dashboard SHALL display a validation error message without attempting connection or writing to Firestore
6. IF Firestore is temporarily unavailable, THEN THE Dashboard SHALL fall back to browser localStorage for Camera_IP persistence and sync to Firestore when connectivity is restored

### Requirement 5: Live Camera Stream Display

**User Story:** As a site engineer, I want to view the live camera feed from the ESP32-CAM in the Dashboard, so that I can monitor the construction site in real time.

#### Acceptance Criteria

1. WHEN a valid Camera_IP is configured and the user activates the connect button, THE Stream_Viewer SHALL display a loading indicator while the MJPEG_Stream img element source is set to http://{Camera_IP}:81/stream and the image has not yet fired a load or error event
2. WHEN the MJPEG_Stream img element fires a load event, THE Stream_Viewer SHALL remove the loading indicator and display the live video feed
3. THE Stream_Viewer SHALL scale the video feed to a maximum width of 100% of its parent container without horizontal scrolling, and SHALL NOT exceed the viewport width
4. THE Stream_Viewer SHALL maintain the native aspect ratio of the camera feed during scaling by not applying fixed height values to the img element
5. WHEN the MJPEG_Stream img element triggers an error event, THE Stream_Viewer SHALL hide the video feed, display an offline placeholder message indicating the stream is unavailable, and enable the connect button so the user can retry the connection
6. IF the user activates the connect button while a stream is already displayed, THEN THE Stream_Viewer SHALL stop the current stream by clearing the img element source before initiating the new connection

### Requirement 6: Connection Status Indicator

**User Story:** As a site engineer, I want a clear visual indicator showing whether the Dashboard is connected to the ESP32-CAM, so that I can quickly assess system health.

#### Acceptance Criteria

1. THE Dashboard SHALL display a connection status indicator with a minimum size of 12x12 pixels, visible on all viewports from 320px to 1920px width
2. WHEN the Dashboard is first loaded after login and no connection has been attempted, THE Dashboard SHALL display the connection indicator in a "disconnected" state using a red visual cue
3. WHEN the MJPEG_Stream img element begins loading successfully (no error event fired), THE Dashboard SHALL transition the connection indicator to a "connected" state using a green visual cue
4. WHEN the MJPEG_Stream img element fires an error event or no Camera_IP is configured, THE Dashboard SHALL transition the connection indicator to a "disconnected" state using a red visual cue

### Requirement 7: Responsive Dashboard Layout

**User Story:** As a site engineer, I want the Dashboard to work well on my phone, tablet, and desktop, so that I can monitor the site from any device.

#### Acceptance Criteria

1. THE Dashboard SHALL render without horizontal scrolling on viewports from 320px width to 1920px width
2. WHEN the viewport width is less than 768px, THE Dashboard SHALL display a single-column stacked layout with the Stream_Viewer above the controls and status panels
3. WHEN the viewport width is 768px or greater, THE Dashboard SHALL display a multi-column layout with the Stream_Viewer and controls visible simultaneously without requiring scrolling between them
4. WHILE the viewport width is less than 768px, THE Dashboard SHALL render all interactive elements (buttons, input fields, links) with a minimum tap target size of 44x44 CSS pixels
5. THE Dashboard SHALL include a viewport meta tag in the HTML entry point that sets width to device-width and initial-scale to 1.0 to ensure proper rendering on mobile devices

---

### Phase 2: Device Status + Monitoring

---

### Requirement 8: Device Status Display

**User Story:** As a site engineer, I want to see the ESP32-CAM's device information, so that I can verify the camera is operating correctly.

#### Acceptance Criteria

1. WHEN the Dashboard is connected to the ESP32-CAM, THE Status_Panel SHALL display the device IP address, Wi-Fi signal strength in dBm (RSSI), device uptime in hours, minutes, and seconds, and stream resolution
2. WHILE the Dashboard is connected, THE Status_Panel SHALL refresh the device status by polling the ESP32-CAM /status endpoint every 5 seconds with a request timeout of 3 seconds
3. IF the /status endpoint request fails due to a network error or timeout, THEN THE Status_Panel SHALL display a "Device Offline" indicator and continue polling at the 5-second interval
4. WHEN the /status endpoint returns a successful response after one or more failed requests, THE Status_Panel SHALL remove the "Device Offline" indicator and resume displaying live device information
5. WHILE the Status_Panel is waiting for the first successful /status response after connection, THE Status_Panel SHALL display a loading skeleton state for each status field

---

### Phase 3: Capture + History

---

### Requirement 9: Single Frame Capture

**User Story:** As a site engineer, I want to capture a single still image from the camera feed, so that I can save evidence of site conditions.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a capture button with a minimum tap target of 44x44 pixels, accessible on viewports from 320px to 1920px width
2. WHEN the user activates the capture button, THE Dashboard SHALL disable the capture button and send a request to the ESP32-CAM /capture endpoint at http://{Camera_IP}/capture with a timeout of 10 seconds
3. WHILE the capture request is in progress, THE Dashboard SHALL display a visual loading indicator on or near the capture button
4. WHEN the JPEG frame is received, THE Dashboard SHALL display the captured image and provide a download option with a filename in the format "hazora-capture-{YYYY-MM-DD_HH-MM-SS}.jpg" based on the local device time
5. WHEN the captured image is displayed or the capture request fails, THE Dashboard SHALL re-enable the capture button
6. IF the capture request fails or the 10-second timeout elapses, THEN THE Dashboard SHALL display an error message indicating the capture was unsuccessful and remove any loading indicator

### Requirement 10: Alerts and History Storage

**User Story:** As a site engineer, I want my capture events and device alerts to be stored in my account history, so that I can review past incidents from any device.

#### Acceptance Criteria

1. WHEN a frame capture succeeds, THE Dashboard SHALL write an alert record to the authenticated user's Alert_Store collection in Firestore containing the timestamp, event type "capture", and Camera_IP
2. WHEN the ESP32-CAM connection transitions from connected to disconnected, THE Dashboard SHALL write an alert record to the Alert_Store with the timestamp, event type "disconnect", and Camera_IP
3. WHEN the ESP32-CAM connection transitions from disconnected to connected, THE Dashboard SHALL write an alert record to the Alert_Store with the timestamp, event type "connect", and Camera_IP
4. THE Dashboard SHALL display the 20 most recent alert records from the Alert_Store in reverse chronological order in a history panel
5. WHILE the history panel is loading data from Firestore, THE Dashboard SHALL display a loading skeleton state
6. IF writing to the Alert_Store fails due to a Firestore error, THEN THE Dashboard SHALL display a non-blocking notification indicating the alert was not saved and SHALL NOT interrupt the user's current workflow

---

### Phase 4: Wi-Fi Reset + Device Management

---

### Requirement 11: Wi-Fi Credential Reset

**User Story:** As a site engineer, I want to remotely reset the ESP32-CAM's Wi-Fi credentials from the Dashboard, so that I can reconfigure the camera without physical access.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a Wi-Fi reset button styled with a red or warning color to visually indicate a destructive action, with a minimum tap target of 44x44 pixels
2. WHEN the user activates the Wi-Fi reset button, THE Dashboard SHALL display a confirmation dialog with the message "This will erase saved Wi-Fi credentials. The camera will restart in setup mode. Continue?" before proceeding
3. WHEN the user confirms the reset, THE Dashboard SHALL send a POST request to http://{Camera_IP}/reset with a timeout of 5 seconds
4. WHEN the reset request completes with any HTTP status or a network error (expected since the device restarts), THE Dashboard SHALL display a message "Wi-Fi credentials cleared. Connect to HAZORA_CAM_SETUP to reconfigure." and transition the connection indicator to the disconnected state
5. THE Dashboard SHALL disable the Wi-Fi reset button when the connection indicator is in the disconnected state
6. WHEN a Wi-Fi reset is triggered, THE Dashboard SHALL write an alert record to the Alert_Store with the timestamp, event type "wifi_reset", and Camera_IP

---

### Phase 5: AI Integration Readiness

---

### Requirement 12: Teachable Machine Integration Readiness

**User Story:** As a developer, I want the Dashboard architecture to support future Teachable Machine AI integration, so that the camera feed can be analyzed for hard hats and safety hazards.

#### Acceptance Criteria

1. THE Stream_Viewer component SHALL include a hidden canvas element in the DOM sized to match the stream img element dimensions, and SHALL expose a function that draws the current img frame onto the canvas and returns the canvas element for external consumption
2. THE Dashboard SHALL render a container element below the Stream_Viewer with a minimum height of 120px for displaying AI detection results and alerts, showing a placeholder message indicating AI detection is not yet active
3. THE Dashboard SHALL structure the React codebase so that stream display logic, status polling logic, and the AI-integration hook function each reside in separate React components or custom hooks, enabling a Teachable Machine classification module to consume the frame-capture function without modifying existing component internals
4. WHEN the stream img element is resized due to viewport changes, THE Dashboard SHALL update the hidden canvas element dimensions to match the new img element dimensions

---

### Phase 6: User Account Management

---

### Requirement 13: User Profile Management

**User Story:** As a site engineer, I want to manage my account settings, so that I can update my credentials and view my account information.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a user profile section accessible from the main navigation that displays the authenticated user's email address
2. WHEN the user activates the password change option, THE Auth_Module SHALL send a password reset email via Firebase_Auth to the user's registered email address
3. WHEN the password reset email is sent successfully, THE Dashboard SHALL display a confirmation message indicating the email was sent
4. IF the password reset request fails, THEN THE Dashboard SHALL display an error message describing the failure reason
5. THE Dashboard SHALL provide a "Delete Account" option that requires the user to re-authenticate before proceeding with account deletion via Firebase_Auth

### Requirement 14: Multi-Device Camera Configuration

**User Story:** As a site engineer managing multiple cameras, I want to quickly switch between saved camera IPs, so that I can monitor different zones on the construction site.

#### Acceptance Criteria

1. THE Dashboard SHALL allow the user to save up to 5 Camera_IP entries in their User_Profile, each with an optional label (maximum 30 characters)
2. WHEN the user has more than one saved Camera_IP, THE Dashboard SHALL display a device selector allowing the user to switch between saved cameras without re-entering the IP address
3. WHEN the user selects a different camera from the device selector, THE Dashboard SHALL disconnect from the current stream and connect to the newly selected Camera_IP
4. THE Dashboard SHALL indicate which Camera_IP is currently active in the device selector using a visual highlight
5. WHEN the user removes a saved Camera_IP entry, THE Dashboard SHALL delete the entry from the User_Profile in Firestore and update the device selector immediately
