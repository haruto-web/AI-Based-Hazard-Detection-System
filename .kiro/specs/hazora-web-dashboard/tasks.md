# Implementation Plan: HAZORA Web Dashboard (Phase 1)

## Overview

Phase 1 implements the core authentication and camera connection features of the HAZORA Web Dashboard. The implementation uses React 18 + Vite, Firebase Auth (email/password), Firestore for per-user camera IP persistence, and MJPEG stream display via an `<img>` tag. The project is created at `hazora-dashboard/` relative to the workspace root.

## Tasks

- [ ] 1. Create React + Vite project and install dependencies
  - [ ] 1.1 Scaffold Vite React project and install packages
    - Run `npm create vite@latest hazora-dashboard -- --template react` in the workspace root
    - Install production dependencies: `npm install react-router-dom firebase`
    - Install dev dependencies: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom fast-check`
    - Verify the project builds with `npm run build`
    - _Requirements: 7.5_

  - [ ] 1.2 Create project file structure and configuration files
    - Create directory structure: `src/context/`, `src/components/`, `src/pages/`, `src/styles/`
    - Create `.env.example` with all `VITE_FIREBASE_*` placeholder variables
    - Update `vite.config.js` with React plugin configuration
    - Add viewport meta tag (`width=device-width, initial-scale=1.0`) to `index.html`
    - _Requirements: 7.5_

- [ ] 2. Set up Firebase configuration and Auth Context
  - [ ] 2.1 Create Firebase initialization module
    - Create `src/firebase.js` that imports and initializes Firebase app, auth, and Firestore
    - Use `import.meta.env.VITE_FIREBASE_*` environment variables for all config values
    - Export `auth` and `db` instances
    - _Requirements: 1.2, 2.2, 4.2_

  - [ ] 2.2 Create AuthContext with onAuthStateChanged subscription
    - Create `src/context/AuthContext.jsx` with `AuthProvider` component and `useAuth` hook
    - Subscribe to `onAuthStateChanged(auth, callback)` in a `useEffect`
    - Expose `{ user, loading }` via context
    - While `loading === true`, render a loading spinner to prevent flash of login page
    - Unsubscribe from auth listener on unmount
    - _Requirements: 2.3, 3.3_

- [ ] 3. Implement authentication components and pages
  - [ ] 3.1 Create AuthForm reusable component
    - Create `src/components/AuthForm.jsx` accepting `mode` prop (`'login'` or `'register'`) and `onSuccess` callback
    - Render email and password input fields with associated `<label>` elements
    - On register mode: validate password ≥ 6 characters client-side before calling Firebase
    - On register: call `createUserWithEmailAndPassword`, then create Firestore User_Profile doc at `users/{uid}` with `{ cameraIP: null, createdAt: serverTimestamp() }`
    - On login: call `signInWithEmailAndPassword`
    - Map Firebase error codes to user-friendly messages (`auth/email-already-in-use` → "This email is already registered", `auth/wrong-password`/`auth/invalid-credential` → "Invalid email or password")
    - Render navigation link to alternate form (login ↔ register)
    - Disable form and show loading state during submission
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.4, 2.5_

  - [ ] 3.2 Create Login and Register pages
    - Create `src/pages/Login.jsx` that renders `AuthForm` with `mode="login"`
    - Create `src/pages/Register.jsx` that renders `AuthForm` with `mode="register"`
    - Both pages redirect to `/` if user is already authenticated
    - On success, navigate to `/` (Dashboard)
    - _Requirements: 1.1, 2.1, 2.5, 1.6_

  - [ ] 3.3 Create ProtectedRoute component
    - Create `src/components/ProtectedRoute.jsx`
    - If `loading` is true, render a loading spinner
    - If `user` is null, redirect to `/login` using `<Navigate>`
    - Otherwise render `children`
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 3.4 Write property test for password validation
    - **Property 2: Password Length Validation Correctness**
    - Generate strings with length 0-5 → assert validation rejects them
    - Generate strings with length 6-100 → assert validation passes the length check
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.5**

- [ ] 4. Implement camera configuration and stream components
  - [ ] 4.1 Create CameraConfig component
    - Create `src/components/CameraConfig.jsx` with IP input field, Connect button, and validation
    - Implement `validateIPv4()` function: four dot-separated integers 0-255, no leading zeros
    - On submit: validate IP, save to Firestore `users/{uid}` doc with `{ merge: true }`, call `onConnect` callback
    - Display inline validation error for invalid IPs (empty, wrong format, out of range)
    - Pre-fill input when `cameraIP` prop is provided
    - Implement localStorage fallback: if Firestore write fails, save to `localStorage['hazora_camera_ip']`
    - Keep input editable at all times for IP changes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 4.2 Write property test for IPv4 validation
    - **Property 1: IPv4 Validation Correctness**
    - Generate valid IPs: `fc.tuple(fc.integer({min:0, max:255}), ...)` joined with "." → assert `validateIPv4` returns true
    - Generate invalid inputs: empty strings, non-numeric, wrong octet count, out-of-range, leading zeros → assert returns false
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 4.5**

  - [ ] 4.3 Create StreamViewer component
    - Create `src/components/StreamViewer.jsx` with `cameraIP`, `isConnecting`, and `onStatusChange` props
    - When connecting: clear existing `img.src`, set `img.src = http://{cameraIP}:81/stream`, report `'loading'`
    - On `img.onload`: report `'connected'`, display stream image
    - On `img.onerror`: report `'disconnected'`, show offline placeholder message
    - Style img with `max-width: 100%`, `height: auto` to maintain aspect ratio
    - Show loading spinner while in loading state
    - If user reconnects while stream is active, clear src first then set new URL
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 4.4 Create ConnectionIndicator component
    - Create `src/components/ConnectionIndicator.jsx` accepting `status` prop
    - Render colored circle (min 12x12px): green for connected, red for disconnected, pulsing for loading
    - Display text label: "Connected", "Disconnected", or "Connecting..."
    - Add `aria-label` for screen reader accessibility
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 4.5 Write property test for Camera IP persistence round-trip
    - **Property 3: Camera IP Persistence Round-Trip**
    - Generate valid IPv4 strings, save to localStorage, read back → assert exact match
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 4.2, 4.3**

- [ ] 5. Checkpoint - Verify components build correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Create Dashboard page and wire routing
  - [ ] 6.1 Create Dashboard page component
    - Create `src/pages/Dashboard.jsx` that orchestrates CameraConfig, StreamViewer, and ConnectionIndicator
    - On mount: fetch Camera_IP from Firestore `users/{uid}` document
    - If Camera_IP exists: pre-fill CameraConfig input and auto-connect stream
    - Manage `connectionStatus` state (`'disconnected'` | `'loading'` | `'connected'`)
    - Render logout button that calls `signOut(auth)` and navigates to `/login`
    - Pass state and callbacks to child components
    - _Requirements: 2.6, 4.1, 4.3, 5.1, 6.2_

  - [ ] 6.2 Set up App.jsx with routing
    - Create `src/App.jsx` wrapping everything in `AuthProvider` and `BrowserRouter`
    - Define routes: `/login` → Login, `/register` → Register, `/` → ProtectedRoute wrapping Dashboard
    - Add catch-all route `*` redirecting to `/`
    - Create `src/main.jsx` entry point rendering `<App />` into root
    - _Requirements: 3.1, 3.3_

- [ ] 7. Add responsive CSS styles
  - [ ] 7.1 Create all CSS stylesheets
    - Create `src/styles/App.css` with global resets, font, and base styles
    - Create `src/styles/AuthForm.css` with form layout, input styling, error messages, and link styles
    - Create `src/styles/Dashboard.css` with responsive grid: single-column below 768px, multi-column at 768px+
    - Create `src/styles/StreamViewer.css` with stream container, loading spinner, and offline placeholder
    - Create `src/styles/ConnectionIndicator.css` with status dot (12px min), colors, and pulse animation
    - Ensure all interactive elements have minimum 44x44px tap targets on mobile
    - Ensure no horizontal scrolling from 320px to 1920px viewport width
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 8. Final integration and wiring
  - [ ] 8.1 Wire all components together and verify end-to-end flow
    - Import all CSS files in their respective components
    - Verify auth flow: register → auto-login → Dashboard → logout → login
    - Verify camera flow: enter IP → validate → save to Firestore → connect stream → show status
    - Verify responsive layout at 320px, 768px, and 1920px viewports
    - Ensure `npm run build` completes without errors
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 4.1, 4.2, 5.1, 6.1, 7.1_

  - [ ]* 8.2 Write unit tests for core components
    - Test AuthForm renders email + password fields in both modes
    - Test ProtectedRoute redirects when no user, renders children when user exists
    - Test CameraConfig shows validation error for invalid IP
    - Test StreamViewer sets img.src on connect
    - Test ConnectionIndicator renders correct color and label for each status
    - _Requirements: 1.1, 2.1, 3.1, 4.5, 5.1, 6.2_

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses JavaScript (JSX) — not TypeScript — matching the design document
- Firebase config requires a `.env` file with real values (use `.env.example` as template)
- The ESP32-CAM must be on the same local network as the browser for stream to work

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["3.1", "3.3"] },
    { "id": 4, "tasks": ["3.2", "3.4", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 6, "tasks": ["4.5", "6.1"] },
    { "id": 7, "tasks": ["6.2", "7.1"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["8.2"] }
  ]
}
```
