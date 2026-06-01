# Requirements Document

## Introduction

The Hazora dashboard currently connects all 5 StreamBox components to a single shared camera IP address. This feature modifies the dashboard so each StreamBox has its own independent IP address, enabling simultaneous connections to multiple different ESP32-CAM devices. Each StreamBox receives an inline IP input field for per-box configuration, all 5 IPs persist independently to Firestore and localStorage, and the header ConnectionIndicator displays an aggregate status (e.g., "3/5 connected").

## Glossary

- **StreamBox**: An individual stream viewer component that displays a live MJPEG feed from one ESP32-CAM device and now includes its own inline IP input field.
- **StreamGrid**: The parent component that renders 5 StreamBox components in a responsive CSS grid layout.
- **Dashboard**: The main authenticated page that orchestrates navigation, header, and content views.
- **ConnectionIndicator**: The header-level component that displays aggregate camera connection status.
- **CameraConfig**: The existing camera configuration form and setup guide panel, retained as a general reference.
- **Firestore**: The Firebase Cloud Firestore database used to persist user-specific camera IP addresses.
- **localStorage**: Browser-local storage used as a fast cache for camera IP addresses.
- **InlineIPInput**: The small IP address input field rendered directly inside each StreamBox tile for per-box configuration.
- **CameraIPs**: An array of 5 IP address strings (one per StreamBox), stored as the authoritative multi-camera configuration.

## Requirements

### Requirement 1: Per-StreamBox IP Configuration

**User Story:** As a dashboard user, I want each StreamBox to have its own IP input field, so that I can connect each stream tile to a different ESP32-CAM device independently.

#### Acceptance Criteria

1. THE StreamBox SHALL render an InlineIPInput field within the stream tile when the StreamBox has no active connection.
2. WHEN a user enters an IP address into the InlineIPInput and submits, THE StreamBox SHALL initiate a connection to `http://{entered_IP}:81/stream` for that specific StreamBox only.
3. WHEN a user submits an IP address via the InlineIPInput, THE StreamBox SHALL validate the input as a valid IPv4 address before initiating the connection.
4. IF the user submits an invalid IPv4 address in the InlineIPInput, THEN THE StreamBox SHALL display an inline error message below the input field without affecting other StreamBox components.
5. WHILE a StreamBox is actively streaming, THE StreamBox SHALL display the connected IP address as a label overlay on the stream tile.
6. WHEN a StreamBox is actively streaming, THE StreamBox SHALL provide a disconnect or edit control that allows the user to change the IP address for that specific box.

### Requirement 2: Independent StreamBox State

**User Story:** As a dashboard user, I want each StreamBox to operate independently, so that connecting or disconnecting one camera does not affect the other four streams.

#### Acceptance Criteria

1. THE StreamGrid SHALL pass each StreamBox its own independent IP address from the CameraIPs array.
2. WHEN one StreamBox fails to connect, THE StreamGrid SHALL maintain the connection state of all other StreamBox components unchanged.
3. WHEN a user changes the IP address of one StreamBox, THE Dashboard SHALL update only that specific entry in the CameraIPs array without modifying other entries.
4. THE StreamBox SHALL manage its own connection lifecycle (idle, loading, connected, failed) independently of other StreamBox instances.
5. WHILE multiple StreamBox components are in different connection states simultaneously, THE StreamGrid SHALL render each StreamBox with its correct individual state.

### Requirement 3: IP Persistence to Firestore

**User Story:** As a dashboard user, I want all 5 camera IPs to be saved to Firestore, so that my multi-camera configuration persists across devices and sessions.

#### Acceptance Criteria

1. WHEN a user submits an IP address for any StreamBox, THE Dashboard SHALL save the complete CameraIPs array to the Firestore document at `users/{uid}` under a `cameraIPs` field.
2. WHEN the Dashboard loads, THE Dashboard SHALL read the `cameraIPs` array from the Firestore document at `users/{uid}` and populate each StreamBox with its corresponding IP address.
3. IF Firestore is unreachable or times out within 5 seconds, THEN THE Dashboard SHALL fall back to the localStorage-cached CameraIPs array and log a warning.
4. THE Dashboard SHALL store the CameraIPs array as an ordered list of 5 elements in Firestore, where each index corresponds to a StreamBox position (0 through 4).
5. WHEN a user clears the IP for a StreamBox, THE Dashboard SHALL save an empty string for that position in the CameraIPs array in Firestore.

### Requirement 4: IP Persistence to localStorage

**User Story:** As a dashboard user, I want all 5 camera IPs cached locally, so that my configuration loads instantly on return visits without waiting for Firestore.

#### Acceptance Criteria

1. WHEN a user submits an IP address for any StreamBox, THE Dashboard SHALL immediately save the complete CameraIPs array to localStorage under the key `hazora_camera_ips`.
2. WHEN the Dashboard loads, THE Dashboard SHALL read the CameraIPs array from localStorage as the initial configuration before attempting Firestore retrieval.
3. THE Dashboard SHALL store the CameraIPs array as a JSON-serialized array of 5 strings in localStorage.
4. IF localStorage is unavailable, THEN THE Dashboard SHALL continue operation without caching and rely solely on Firestore for persistence.
5. WHEN Firestore returns a CameraIPs array that differs from the localStorage cache, THE Dashboard SHALL update localStorage to match the Firestore value.

### Requirement 5: Aggregate Connection Indicator

**User Story:** As a dashboard user, I want the header to show how many cameras are connected out of 5, so that I get a quick overview of my multi-camera system status.

#### Acceptance Criteria

1. THE ConnectionIndicator SHALL display the count of connected StreamBox components out of the total 5 in the format "{connected}/5 connected".
2. WHEN a StreamBox transitions from any state to the connected state, THE ConnectionIndicator SHALL increment the connected count within 1 second.
3. WHEN a StreamBox transitions from the connected state to any other state, THE ConnectionIndicator SHALL decrement the connected count within 1 second.
4. WHILE zero StreamBox components are connected, THE ConnectionIndicator SHALL display "0/5 connected" with a disconnected visual style.
5. WHILE all 5 StreamBox components are connected, THE ConnectionIndicator SHALL display "5/5 connected" with a fully-connected visual style.
6. THE ConnectionIndicator SHALL use the existing #00d4aa accent color for the connected state indicator dot.

### Requirement 6: Existing CameraConfig Panel Retention

**User Story:** As a dashboard user, I want the existing CameraConfig form and setup guide to remain available, so that I can reference the camera setup instructions even though per-box inputs handle actual configuration.

#### Acceptance Criteria

1. THE Dashboard SHALL continue to render the CameraConfig component in the controls section of the streams view.
2. THE CameraConfig component SHALL remain functional as a general reference form without overriding individual StreamBox IP configurations.
3. THE CollapsibleGuide component containing the Camera Setup Guide SHALL remain in the controls section below the CameraConfig form.

### Requirement 7: Migration from Single-IP to Multi-IP

**User Story:** As an existing dashboard user, I want my previously saved single camera IP to be migrated into the new multi-IP system, so that I do not lose my configuration on upgrade.

#### Acceptance Criteria

1. WHEN the Dashboard loads and finds a legacy `cameraIP` string field in Firestore but no `cameraIPs` array, THE Dashboard SHALL create a CameraIPs array with the legacy IP in position 0 and empty strings in positions 1 through 4.
2. WHEN the Dashboard loads and finds a legacy `hazora_camera_ip` string in localStorage but no `hazora_camera_ips` key, THE Dashboard SHALL create a CameraIPs array with the legacy IP in position 0 and empty strings in positions 1 through 4.
3. WHEN migration from single-IP to multi-IP completes, THE Dashboard SHALL save the migrated CameraIPs array to both Firestore and localStorage.
4. WHEN migration completes successfully, THE Dashboard SHALL connect StreamBox at position 0 to the migrated IP address automatically.
