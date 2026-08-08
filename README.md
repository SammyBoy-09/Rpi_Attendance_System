# Attendance System

This workspace is split into two local sections:

- Backend: the Raspberry Pi Flask API, camera stream, face recognition, and SQLite database live in the workspace root.
- Frontend: the UI lives in [frontend/](frontend/).

## Backend

Run the Pi backend from the workspace root:

```sh
python app.py
```

The backend serves:

- `GET /api/health`
- `GET /api/employees`
- `POST /api/employees`
- `DELETE /api/employees/<id>`
- `GET /api/attendance?date=YYYY-MM-DD`
- `POST /api/attendance/scan`
- `GET /api/camera/stream`

## Frontend

Run the UI from [frontend/](frontend/):

```sh
cd frontend
VITE_API_BASE_URL=http://localhost:5000 bun run dev
```

If Bun is not available, use the package manager already installed on the Pi.

## Notes

- Supabase has been removed from the active frontend code path.
- The frontend now talks to the local Flask backend over HTTP.
- The Pi camera is controlled by the backend, so the browser no longer needs webcam permissions.