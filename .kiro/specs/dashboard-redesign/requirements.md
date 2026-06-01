# Requirements Document

## Introduction

This document defines the requirements for the Hazora web dashboard redesign. The redesign replaces the current single-stream layout with a multi-stream monitoring interface featuring a 5-stream grid view, sidebar navigation for view switching, a collapsible Camera Setup Guide, and a placeholder Report/Analytics section. All existing functionality (Firebase authentication, Firestore IP persistence, AI detection, dark theme) is preserved.

## Glossary

- **Dashboard**: The main authenticated page of the Hazora web application that displays camera streams and controls
- **StreamGrid**: A CSS Grid component that renders exactly 5 StreamBox components in a responsive layout
- **StreamBox**: An individual stream viewer component that displays a live MJPEG feed from the camera
- **Sidebar**: A vertical navigation panel that allows switching between the Streams view and Reports view
- **CollapsibleGuide**: A UI component that wraps the Camera Setup Guide content in an expandable/collapsible container
- **ReportsPlaceholder**: A static placeholder view indicating that Report & Analytics features are under development
- **ActiveView**: The current navigation state determining which content view is rendered (streams or reports)
- **CameraIP**: The IPv4 address of the ESP32-CAM device used to connect all stream boxes
- **STREAM_COUNT**: A fixed constant of 5 representing the number of stream boxes in the grid

## Requirements

### Requirement 1: Multi-Stream Grid Display

**User Story:** As a security operator, I want to see multiple camera streams simultaneously in a grid layout, so that I can monitor different angles or areas from the same camera at once.

#### Acceptance Criteria

1. WHEN the Streams view is active, THE StreamGrid SHALL render exactly 5 StreamBox components
2. THE StreamGrid SHALL arrange StreamBox components in a responsive CSS Grid layout with 3 columns when the viewport width is 769px or greater and 1 column when the viewport width is 768px or less
3. WHEN a valid CameraIP (IPv4 format: four octets 0-255 separated by dots) is provided, THE StreamGrid SHALL pass the same CameraIP to all 5 StreamBox components
4. WHEN the CameraIP changes, THE StreamGrid SHALL update all 5 StreamBox components with the new CameraIP within the same render cycle such that no StreamBox displays a stale IP
5. THE StreamBox SHALL display a sequential label matching the pattern "Stream {id}" where id ranges from 1 to 5
6. IF no CameraIP is provided or the CameraIP is empty, THEN each StreamBox SHALL display a placeholder state indicating that no camera is connected

### Requirement 2: Sidebar Navigation

**User Story:** As a dashboard user, I want a sidebar navigation panel, so that I can switch between the Streams view and the Reports view without leaving the dashboard.

#### Acceptance Criteria

1. THE Sidebar SHALL display exactly 2 navigation items: "Live Streams" and "Reports"
2. WHEN a user clicks a navigation item, THE Sidebar SHALL update the ActiveView state to the selected view's corresponding value ("streams" or "reports")
3. WHILE a view is active, THE Sidebar SHALL apply a visually distinct style to exactly one navigation item corresponding to the active view, differentiating it from the inactive item
4. THE Sidebar SHALL display an "ON GOING" badge next to the Reports navigation item
5. IF an ActiveView value is set to anything other than "streams" or "reports", THEN THE Dashboard SHALL default the ActiveView to "streams"
6. WHEN the Dashboard first loads, THE Sidebar SHALL set the ActiveView to "streams"

### Requirement 3: Exclusive View Rendering

**User Story:** As a dashboard user, I want only one content view displayed at a time, so that the interface remains clear and uncluttered.

#### Acceptance Criteria

1. WHEN ActiveView is set to "streams", THE Dashboard SHALL render the StreamsView component and remove the ReportsPlaceholder component from the DOM
2. WHEN ActiveView is set to "reports", THE Dashboard SHALL render the ReportsPlaceholder component and remove the StreamsView component from the DOM
3. THE Dashboard SHALL render exactly one content view at any given time with no intermediate state where both views or neither view is present in the DOM
4. WHEN the user switches ActiveView, THE Dashboard SHALL replace the current view with the selected view within a single render cycle such that no empty content area is displayed

### Requirement 4: Collapsible Camera Setup Guide

**User Story:** As a dashboard user, I want the Camera Setup Guide to be collapsible, so that I can hide it once I am familiar with the setup process and reclaim screen space.

#### Acceptance Criteria

1. WHEN the user activates the CollapsibleGuide header (via click, Enter key, or Space key), THE CollapsibleGuide SHALL toggle between expanded and collapsed states, where expanded means the guide content is visible and collapsed means the guide content is hidden
2. THE CollapsibleGuide SHALL start in the collapsed state by default
3. WHILE the CollapsibleGuide is expanded, THE CollapsibleGuide SHALL set the aria-expanded attribute to "true" on the header element and make the content region visible to assistive technologies
4. WHILE the CollapsibleGuide is collapsed, THE CollapsibleGuide SHALL set the aria-expanded attribute to "false" on the header element and hide the content region from assistive technologies
5. WHEN the CollapsibleGuide transitions between states, THE CollapsibleGuide SHALL animate the content height using a CSS transition with a duration between 200ms and 400ms
6. THE CollapsibleGuide header SHALL be rendered as a button element and SHALL display a chevron indicator that points downward when expanded and points to the right when collapsed
7. WHILE the CollapsibleGuide is expanded, THE CollapsibleGuide SHALL display the Camera Setup Guide content including the ordered list of setup steps

### Requirement 5: Reports Placeholder

**User Story:** As a dashboard user, I want to see a placeholder for the Reports section, so that I know analytics features are planned and under development.

#### Acceptance Criteria

1. THE ReportsPlaceholder SHALL display the heading "Report & Analytics" using an h2 element
2. THE ReportsPlaceholder SHALL display an "ON GOING" badge adjacent to the heading, visually distinguishable as a status indicator
3. THE ReportsPlaceholder SHALL display a text message that explicitly states analytics and reporting features are under development
4. THE ReportsPlaceholder SHALL use the dashboard dark theme panel styling: background color #1a2332, border color #2d3a4a, and text colors consistent with the existing dashboard palette (#e8eaed for primary text, #8b95a5 for secondary text, #00d4aa for accent elements)
5. WHEN the ReportsPlaceholder is rendered, THE ReportsPlaceholder SHALL be contained within a single panel element with a minimum height of 200px to provide a visible content area

### Requirement 6: Camera IP Persistence and Loading

**User Story:** As a returning user, I want my camera IP address to be remembered, so that I do not have to re-enter it every time I open the dashboard.

#### Acceptance Criteria

1. WHEN the Dashboard loads for an authenticated user, THE Dashboard SHALL read the CameraIP from localStorage and, if a valid IPv4 value exists, pre-fill the IP input field and initiate a connection attempt without waiting for Firestore
2. WHEN the Dashboard loads for an authenticated user, THE Dashboard SHALL request the CameraIP from the user's Firestore User_Profile document and, if the returned value differs from the localStorage value, update localStorage and the IP input field with the Firestore value
3. WHEN a user submits a new CameraIP via the IP input field, THE Dashboard SHALL persist the CameraIP to localStorage immediately and to the user's Firestore User_Profile document with a write timeout of 5 seconds
4. IF the Firestore read or write fails or does not respond within 5 seconds, THEN THE Dashboard SHALL use the localStorage cached CameraIP for display and connection, and SHALL log a warning to the browser console without displaying an error to the user
5. THE Dashboard SHALL validate that the CameraIP is a valid IPv4 address (four dot-separated decimal numbers each between 0 and 255) before initiating a connection or writing to any storage
6. IF the CameraIP validation fails, THEN THE Dashboard SHALL display a validation error message adjacent to the IP input field and SHALL NOT initiate a connection or persist the value
7. IF neither localStorage nor Firestore contains a CameraIP for the authenticated user, THEN THE Dashboard SHALL display the empty IP input field with placeholder text and SHALL NOT initiate any connection attempt

### Requirement 7: Stream Connection Error Handling

**User Story:** As a dashboard user, I want clear feedback when a camera stream fails to connect, so that I can troubleshoot the issue.

#### Acceptance Criteria

1. IF a StreamBox does not receive stream data within 10 seconds of initiating a connection, THEN THE StreamBox SHALL display a placeholder with a "Connection failed" message
2. IF a StreamBox receives a network error or the stream endpoint is unreachable, THEN THE StreamBox SHALL display a placeholder with a "Connection failed" message
3. WHEN the user re-enters a CameraIP and clicks Connect, THE StreamGrid SHALL retry the connection for all 5 StreamBox components simultaneously
4. WHILE the connection is loading, THE ConnectionIndicator SHALL display the "Connecting..." label and the loading status style
5. IF a StreamBox connection fails, THEN THE ConnectionIndicator SHALL transition to the "Disconnected" status
6. WHILE a StreamBox displays the "Connection failed" placeholder, THE StreamBox SHALL continue displaying that placeholder until the user initiates a new connection attempt via the Connect button

### Requirement 8: Preserved Authentication and Theme

**User Story:** As an existing user, I want the redesigned dashboard to maintain the current authentication flow and dark theme, so that my experience remains consistent.

#### Acceptance Criteria

1. IF a user is not authenticated, THEN THE Dashboard SHALL redirect the user to the login page via the ProtectedRoute component instead of rendering dashboard content
2. THE Dashboard SHALL use the existing dark theme color scheme with background color #0f1923, panel color #1a2332, and teal accent #00d4aa
3. WHEN the user clicks Logout, THE Dashboard SHALL sign out via Firebase and navigate to the login page within 3 seconds
4. THE Dashboard SHALL display the authenticated user email in the header-right section of the dashboard header
5. WHILE the authentication state is being resolved, THE Dashboard SHALL display a loading indicator and SHALL NOT render dashboard content or redirect the user
