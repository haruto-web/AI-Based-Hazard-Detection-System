# HAZORA Dashboard — Deploy & Run Scripts

This folder holds the scripts and config for running the HAZORA dashboard in its
two modes: the live cloud site (AWS) and the local demo (real ESP32 cameras).

## Why two modes?

Browsers block a **public** website from reaching a **local** device. Your ESP32
cameras live on a private Wi-Fi IP (e.g. `192.168.55.103`), so:

- The **cloud site** on AWS is great for reports, analytics, gallery, and mobile
  accounts — everything backed by Firebase, which works from anywhere.
- **Live camera streams + AI detection** must run from **localhost** on the same
  Wi-Fi as the cameras. That's what the local script is for.

Both modes use the **same Firebase project**, so incidents captured during a local
demo also appear in the cloud site's reports and gallery.

---

## Files

| File            | What it does                                                        |
|-----------------|---------------------------------------------------------------------|
| `deploy.bat`    | Builds the site and deploys it to the AWS server (cloud showcase).  |
| `run-local.bat` | Runs the site locally for live camera + AI detection demos.         |
| `hazora.conf`   | The nginx web-server config used on the AWS server.                 |

---

## `deploy.bat` — publish to the cloud site

Double-click it (or run it from a terminal). It will:

1. Build the dashboard (`npm run build`).
2. Upload the built files to the AWS server.
3. Refresh the nginx config and reload the server.

**Live at:** http://54.254.183.46/

Settings are at the top of the file if anything changes:

```
set "PEM=D:\Downloads\Hazora.pem"     REM path to the AWS SSH key
set "EC2_USER=ec2-user"
set "EC2_HOST=54.254.183.46"          REM the server's Elastic IP
```

> Note: `54.254.183.46` is an **Elastic IP**, so it stays the same even if the
> server is stopped and restarted. If you ever move to a new server, update
> `EC2_HOST` here.

---

## `run-local.bat` — demo with real cameras

Use this on demo day, on a PC connected to the **same Wi-Fi as the ESP32 camera**.

1. Double-click `run-local.bat` (installs dependencies on the first run).
2. When it's ready, open **http://localhost:5173/**.
3. Go to **Live Streams**, type the camera IP (e.g. `192.168.55.103`), and click
   the arrow to connect.
4. Start AI Detection.
5. Press **Ctrl+C** in the window to stop the server when done.

The script also prints a **Network** URL (e.g. `http://192.168.55.102:5173/`).
A phone or tablet on the same Wi-Fi can open that URL and also see the cameras.

### Demo-day checklist

- [ ] PC and ESP32 camera are on the **same Wi-Fi**.
- [ ] Confirm the camera's current IP (its own page shows it — the IP can change
      when it reconnects). Enter the current IP in the stream box.
- [ ] Use `http://localhost:5173/`, **not** the AWS URL, for live camera work.

---

## Quick reference

| I want to…                                   | Run this        | Open this                     |
|----------------------------------------------|-----------------|-------------------------------|
| Show the deployed website (reports/analytics)| nothing         | http://54.254.183.46/         |
| Push code changes to the deployed website    | `deploy.bat`    | http://54.254.183.46/         |
| Demo live cameras + AI detection             | `run-local.bat` | http://localhost:5173/        |
