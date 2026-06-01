# Implementation Plan: Dashboard Redesign

## Overview

Redesign the Hazora web dashboard from a single-stream layout to a multi-stream monitoring interface with sidebar navigation, collapsible Camera Setup Guide, and a Reports placeholder section. The implementation uses React (JSX), CSS Grid, and preserves existing Firebase auth, Firestore IP persistence, and AI detection functionality.

## Tasks

- [x] 1. Create new component files and update project structure
  - [x] 1.1 Create the Sidebar component
    - Create `src/components/Sidebar.jsx` with navigation items ("Live Streams" and "Reports")
    - Accept `activeView` and `onViewChange` props
    - Highlight the active navigation item with a distinct style
    - Display an "ON GOING" badge next to the Reports item
    - Default to "streams" if an invalid activeView value is provided
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.2 Create the Sidebar CSS styles
    - Create `src/styles/Sidebar.css` with dark theme styling (#1a2332 background, #00d4aa accent for active item)
    - Style the "ON GOING" badge as a small status indicator
    - Ensure the sidebar is a fixed-width vertical panel
    - _Requirements: 2.3, 2.4, 8.2_

  - [x] 1.3 Create the StreamBox component
    - Create `src/components/StreamBox.jsx` that renders an individual MJPEG stream
    - Accept `cameraIP`, `isConnecting`, `label`, and `onStatusChange` props
    - Display the stream label overlay ("Stream 1" through "Stream 5")
    - Show a placeholder with "Connection failed" message on timeout (10s) or network error
    - Show a placeholder state when no CameraIP is provided
    - _Requirements: 1.5, 1.6, 7.1, 7.2, 7.6_

  - [x] 1.4 Create the StreamBox CSS styles
    - Create `src/styles/StreamBox.css` with dark theme panel styling
    - Style the stream label overlay, placeholder state, and connection failed state
    - _Requirements: 1.5, 1.6, 7.1_

- [x] 2. Create StreamGrid and CollapsibleGuide components
  - [x] 2.1 Create the StreamGrid component
    - Create `src/components/StreamGrid.jsx` that renders exactly 5 StreamBox components
    - Use CSS Grid layout with 3 columns on desktop (≥769px) and 1 column on mobile (≤768px)
    - Pass the same `cameraIP` to all 5 StreamBox components
    - Generate sequential labels "Stream 1" through "Stream 5"
    - Accept `cameraIP`, `isConnecting`, and `onStatusChange` props
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Create the StreamGrid CSS styles
    - Create `src/styles/StreamGrid.css` with responsive CSS Grid layout
    - 3-column layout for viewport ≥769px, 1-column for ≤768px
    - _Requirements: 1.2_

  - [x] 2.3 Create the CollapsibleGuide component
    - Create `src/components/CollapsibleGuide.jsx` with toggle expand/collapse behavior
    - Accept `title`, `defaultOpen` (default false), and `children` props
    - Render header as a `<button>` element with `aria-expanded` attribute
    - Support click, Enter key, and Space key activation
    - Display a chevron indicator (right when collapsed, down when expanded)
    - Start in collapsed state by default
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

  - [x] 2.4 Create the CollapsibleGuide CSS styles
    - Create `src/styles/CollapsibleGuide.css` with CSS transition for content height (200-400ms duration)
    - Style the chevron rotation animation
    - Use dark theme styling consistent with dashboard
    - _Requirements: 4.5, 4.6_

  - [x] 2.5 Write property test for StreamGrid fixed count and labels
    - **Property 3: Fixed Stream Count and Deterministic Labels**
    - Verify that StreamGrid always renders exactly 5 StreamBox components with labels "Stream 1" through "Stream 5" regardless of cameraIP value
    - **Validates: Requirements 1.1, 1.5**

  - [x] 2.6 Write property test for Uniform Camera IP
    - **Property 2: Uniform Camera IP**
    - Verify that all 5 StreamBox components receive the same cameraIP prop for any valid IPv4 input
    - **Validates: Requirements 1.3, 1.4**

  - [x] 2.7 Write property test for CollapsibleGuide toggle inversion
    - **Property 4: Toggle Inversion with Accessibility State Consistency**
    - Verify that toggling twice returns to original state, and aria-expanded always matches isOpen
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.6**

- [x] 3. Create ReportsPlaceholder and wire view switching
  - [x] 3.1 Create the ReportsPlaceholder component
    - Create `src/components/ReportsPlaceholder.jsx` with "Report & Analytics" h2 heading
    - Display "ON GOING" badge adjacent to the heading
    - Display message stating analytics features are under development
    - Use dark theme panel styling (#1a2332 background, #2d3a4a border, #e8eaed primary text, #8b95a5 secondary text, #00d4aa accent)
    - Set minimum height of 200px on the container panel
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 3.2 Create the ReportsPlaceholder CSS styles
    - Create `src/styles/ReportsPlaceholder.css` with dark theme panel styling
    - Style the "ON GOING" badge, heading, and placeholder content
    - _Requirements: 5.4, 5.5_

  - [x] 3.3 Refactor Dashboard.jsx with sidebar navigation and view switching
    - Add `activeView` state (default: "streams")
    - Import and render Sidebar component with activeView and onViewChange handler
    - Implement exclusive view rendering: show StreamsView when activeView is "streams", show ReportsPlaceholder when activeView is "reports"
    - Ensure only one view is rendered at a time (no intermediate empty state)
    - Restructure layout to include dashboard-body wrapper with sidebar and main content area
    - _Requirements: 2.2, 2.6, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.4 Write property test for Exclusive View Rendering
    - **Property 1: Exclusive View Rendering**
    - Verify that for any ActiveView state in {streams, reports}, exactly one content view is rendered
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 3.5 Write property test for Invalid View Fallback
    - **Property 5: Invalid View Fallback**
    - Verify that any string value not "streams" or "reports" defaults ActiveView to "streams"
    - **Validates: Requirements 2.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrate StreamGrid into Dashboard and update stream logic
  - [x] 5.1 Replace StreamViewer with StreamGrid in the Streams view
    - Remove the single StreamViewer usage from Dashboard
    - Render StreamGrid component in the streams-view section
    - Pass cameraIP, isConnecting, and onStatusChange to StreamGrid
    - Ensure all 5 StreamBox components retry connection simultaneously when user clicks Connect
    - _Requirements: 1.1, 1.3, 7.3_

  - [x] 5.2 Integrate CollapsibleGuide wrapping the Camera Setup Guide
    - Replace the static `.setup-guide` div with CollapsibleGuide component
    - Pass "Camera Setup Guide" as title and the ordered list as children
    - Set defaultOpen to false (collapsed by default)
    - _Requirements: 4.1, 4.2, 4.7_

  - [x] 5.3 Update ConnectionIndicator for multi-stream status
    - Ensure ConnectionIndicator displays "Connecting..." during loading state
    - Transition to "Disconnected" if stream connection fails
    - _Requirements: 7.4, 7.5_

  - [x] 5.4 Write property test for Sidebar Active Highlight Consistency
    - **Property 8: Sidebar Active Highlight Consistency**
    - Verify that for any ActiveView state, exactly the corresponding navigation item is highlighted
    - **Validates: Requirements 2.2, 2.3**

- [x] 6. Update Dashboard CSS for new layout structure
  - [x] 6.1 Update Dashboard.css for sidebar + content layout
    - Modify `src/styles/Dashboard.css` to support the new dashboard-body layout (sidebar + main content)
    - Add styles for streams-view (grid + controls panel side by side)
    - Ensure responsive behavior on smaller viewports
    - Preserve dark theme colors (#0f1923 background, #1a2332 panels, #00d4aa accents)
    - _Requirements: 8.2, 1.2_

  - [x] 6.2 Write property test for IPv4 Validation
    - **Property 6: IPv4 Validation**
    - Verify that validateIPv4 correctly classifies any string as valid/invalid IPv4 (four octets 0-255 separated by dots)
    - **Validates: Requirements 6.5**

  - [x] 6.3 Write property test for Camera IP Persistence Round-Trip
    - **Property 7: Camera IP Persistence Round-Trip**
    - Verify that persisting a valid CameraIP to localStorage and reading it back produces the same value
    - **Validates: Requirements 6.3**

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The project uses React 19, Vite 8, and no new dependencies are required
- All components use the existing dark theme palette and CSS-only animations
- The existing `StreamViewer.jsx` can be used as reference for the new `StreamBox.jsx` component
- Property tests should use `fast-check` library (install as dev dependency if not present)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.5", "2.6", "2.7", "3.3"] },
    { "id": 3, "tasks": ["3.4", "3.5", "5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["5.4", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3"] }
  ]
}
```
