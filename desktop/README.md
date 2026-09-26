# SmorX DMS desktop client

Customer EXE for Document Management System. UI runs locally; API points at your AWS (or local) backend.

## Build

```powershell
cd desktop
.\build-exe.ps1 -ApiUrl "https://your-dms-api-host/api"
```

Local test default:

```powershell
.\build-exe.ps1 -ApiUrl "http://localhost:3001/api"
```

Outputs:
- `dist-exe/SmorX-DMS-Setup.exe` — installer
- `dist-exe/SmorX-DMS-Portable.exe` — portable

## Customer flow

1. Customer opens EXE → Activate tab shows Device ID + Host name
2. Super Admin (web) creates customer with those values
3. Customer Activates with license + install password + email + temp password
4. Sign in on that PC only when require-device is on

## Config

`config.json` (bundled as extraResources) sets `apiUrl`. Rebuild after changing the production URL.
