import json
import threading
import time
import uuid
from datetime import date

import cv2
import face_recognition
import numpy as np
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from picamera2 import Picamera2

import database

app = Flask(__name__)
CORS(app)

camera_lock = threading.Lock()
picam2 = Picamera2()
config = picam2.create_video_configuration(main={"size": (640, 480), "format": "RGB888"})
picam2.configure(config)
picam2.start()
time.sleep(2)

# In-memory cache for active employees (for fast face matching)
employees_cache = None
employees_cache_lock = threading.Lock()


def today_key() -> str:
    return date.today().isoformat()


def invalidate_employees_cache():
    """Invalidate the employees cache when data changes."""
    global employees_cache
    with employees_cache_lock:
        employees_cache = None


def get_active_employees_cached():
    """Get active employees with caching. Cache is invalidated on employee create/delete."""
    global employees_cache
    with employees_cache_lock:
        if employees_cache is not None:
            return employees_cache
        
        conn = database.init_db()
        try:
            employees = database.load_employees(conn, active_only=True)
        finally:
            conn.close()
        
        employees_cache = employees
        return employees


def capture_frame() -> np.ndarray:
    with camera_lock:
        return picam2.capture_array()


def jpeg_stream():
    while True:
        frame = capture_frame()
        ret, buffer = cv2.imencode(".jpg", frame)
        if not ret:
            continue
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
        )


def load_active_employees():
    conn = database.init_db()
    try:
        return database.load_employees(conn, active_only=True)
    finally:
        conn.close()


def load_all_employees():
    conn = database.init_db()
    try:
        return database.load_employees(conn, active_only=False)
    finally:
        conn.close()


def load_attendance_for_date(work_date: str):
    conn = database.init_db()
    try:
        return database.load_attendance(conn, work_date=work_date)
    finally:
        conn.close()


def employee_from_row(row):
    employee = database.row_to_employee(row)
    if employee is None:
        return None
    return employee


def detect_single_face(frame: np.ndarray):
    face_locations = face_recognition.face_locations(frame)
    if len(face_locations) != 1:
        return None, face_locations, None

    face_encoding = face_recognition.face_encodings(frame, face_locations)[0]
    top, right, bottom, left = face_locations[0]
    return face_encoding, face_locations, {
        "x": left,
        "y": top,
        "width": right - left,
        "height": bottom - top,
    }


def capture_face_payload():
    frame = capture_frame()
    face_encoding, face_locations, box = detect_single_face(frame)
    if face_encoding is None:
        return None, face_locations

    thumbnail = capture_thumbnail(frame, box)
    return {
        "descriptor": face_encoding.tolist(),
        "photo": thumbnail,
        "box": box,
    }, face_locations


def capture_face_multiple(num_captures: int = 5):
    """Capture multiple face frames, average encodings for better accuracy."""
    encodings = []
    last_frame = None
    last_box = None
    
    for i in range(num_captures):
        frame = capture_frame()
        face_encoding, face_locations, box = detect_single_face(frame)
        
        if face_encoding is None:
            # Face not detected, return error with count
            return {
                "error": f"Face not detected in capture {i + 1}/{num_captures}",
                "progress": i,
                "total": num_captures,
                "faces_detected": len(face_locations),
            }, None
        
        encodings.append(face_encoding)
        last_frame = frame
        last_box = box
        
        # Small delay between captures to get variation in angle
        if i < num_captures - 1:
            time.sleep(0.5)
    
    # Average all encodings
    master_encoding = np.mean(encodings, axis=0)
    thumbnail = capture_thumbnail(last_frame, last_box) if last_frame is not None else ""
    
    return {
        "descriptor": master_encoding.tolist(),
        "photo": thumbnail,
        "box": last_box,
        "frames_captured": num_captures,
    }, None


def capture_thumbnail(frame: np.ndarray, box: dict, size: int = 256) -> str:
    if not box:
        return ""
    pad = box["width"] * 0.35
    side = max(box["width"], box["height"]) + pad * 2
    cx = box["x"] + box["width"] / 2
    cy = box["y"] + box["height"] / 2
    sx = max(0, int(cx - side / 2))
    sy = max(0, int(cy - side / 2))
    sw = min(int(side), frame.shape[1] - sx)
    sh = min(int(side), frame.shape[0] - sy)
    if sw <= 0 or sh <= 0:
        return ""

    crop = frame[sy : sy + sh, sx : sx + sw]
    if crop.size == 0:
        return ""

    resized = cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA)
    ret, buffer = cv2.imencode(".jpg", resized)
    if not ret:
        return ""
    encoded = base64_encode(buffer.tobytes())
    return f"data:image/jpeg;base64,{encoded}"


def base64_encode(data: bytes) -> str:
    import base64

    return base64.b64encode(data).decode("ascii")


def face_distance_match(probe: np.ndarray, candidates: list[dict]):
    """Find best match using vectorized distance computation."""
    if not candidates:
        return None
    
    best = None
    best_distance = float('inf')
    
    for employee in candidates:
        descriptor = employee.get("face_descriptor")
        if not descriptor:
            continue
        
        candidate = np.array(descriptor, dtype=np.float32)
        if candidate.shape != probe.shape:
            continue
        
        # Vectorized L2 distance calculation
        distance = float(np.linalg.norm(probe - candidate))
        
        if distance < best_distance:
            best_distance = distance
            best = {"employee": employee, "distance": distance}
    
    return best


def get_or_create_attendance(conn, employee_id: str, work_date: str, confidence: float | None):
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT * FROM attendance_records WHERE employee_id = ? AND work_date = ?",
        (employee_id, work_date),
    ).fetchone()

    if row is None:
        new_id = str(uuid.uuid4())
        late = time.localtime().tm_hour * 60 + time.localtime().tm_min > 9 * 60 + 15
        status = "late" if late else "present"
        cursor.execute(
            """
            INSERT INTO attendance_records (
                id, employee_id, work_date, status, method, confidence
            ) VALUES (?, ?, ?, ?, 'face', ?)
            """,
            (new_id, employee_id, work_date, status, confidence),
        )
        conn.commit()
        row = cursor.execute(
            "SELECT * FROM attendance_records WHERE id = ?",
            (new_id,),
        ).fetchone()
        kind = "in"
    elif row["check_out"] is None:
        cursor.execute(
            "UPDATE attendance_records SET check_out = CURRENT_TIMESTAMP WHERE id = ?",
            (row["id"],),
        )
        conn.commit()
        row = cursor.execute(
            "SELECT * FROM attendance_records WHERE id = ?",
            (row["id"],),
        ).fetchone()
        kind = "out"
    else:
        kind = "done"

    return kind, row


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "camera": True, "database": True})


@app.get("/api/camera/stream")
def camera_stream():
    return Response(jpeg_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.get("/video_feed")
def legacy_video_feed():
    return camera_stream()


@app.get("/api/employees")
def get_employees():
    return jsonify(load_all_employees())


@app.post("/api/employees")
def create_employee():
    payload = request.get_json(silent=True) or {}
    full_name = str(payload.get("full_name", "")).strip()
    employee_code = str(payload.get("employee_code", "")).strip().upper()
    if not full_name or not employee_code:
        return jsonify({"error": "full_name and employee_code are required"}), 400

    conn = database.init_db()
    cursor = conn.cursor()
    existing = cursor.execute(
        "SELECT id FROM employees WHERE employee_code = ?",
        (employee_code,),
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "employee_code already exists"}), 409

    employee_id = str(uuid.uuid4())
    cursor.execute(
        """
        INSERT INTO employees (
            id, employee_code, full_name, email, phone, department,
            job_title, photo_url, face_descriptor, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            employee_id,
            employee_code,
            full_name,
            payload.get("email") or None,
            payload.get("phone") or None,
            payload.get("department") or "General",
            payload.get("job_title") or None,
            payload.get("photo_url") or None,
            database.serialize_face_descriptor(payload.get("face_descriptor")),
            1 if payload.get("active", True) else 0,
        ),
    )
    conn.commit()
    row = cursor.execute("SELECT * FROM employees WHERE id = ?", (employee_id,)).fetchone()
    conn.close()
    invalidate_employees_cache()  # Refresh cache after adding employee
    return jsonify(employee_from_row(row)), 201


@app.delete("/api/employees/<employee_id>")
def delete_employee(employee_id: str):
    conn = database.init_db()
    cursor = conn.cursor()
    row = cursor.execute("SELECT * FROM employees WHERE id = ?", (employee_id,)).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "employee not found"}), 404
    cursor.execute("DELETE FROM employees WHERE id = ?", (employee_id,))
    conn.commit()
    conn.close()
    invalidate_employees_cache()  # Refresh cache after deleting employee
    return jsonify({"ok": True})


@app.get("/api/employees/capture-face")
def capture_face_endpoint():
    payload, face_locations = capture_face_payload()
    if payload is None:
        return jsonify({"error": "exactly one face is required", "faces_detected": len(face_locations)}), 400
    return jsonify(payload)


@app.get("/api/employees/capture-face-5")
def capture_face_five_endpoint():
    """Capture 5 frames and average encodings for better accuracy."""
    payload, error = capture_face_multiple(num_captures=5)
    if error is not None or "error" in payload:
        return jsonify(payload), 400
    return jsonify(payload)


@app.get("/api/attendance")
def get_attendance():
    work_date = request.args.get("date") or today_key()
    return jsonify(load_attendance_for_date(work_date))


@app.post("/api/attendance/scan")
def scan_attendance():
    frame = capture_frame()
    face_encoding, face_locations, _ = detect_single_face(frame)
    if face_encoding is None:
        return jsonify({"kind": "unknown", "faces_detected": len(face_locations)}), 200

    # Use cached employees for fast matching
    employees = get_active_employees_cached()
    candidates = []
    for employee in employees:
        descriptor = employee.get("face_descriptor")
        if not descriptor:
            continue
        candidates.append(employee)

    best = face_distance_match(face_encoding, candidates)
    if best is None:
        return jsonify({"kind": "unknown", "faces_detected": len(face_locations)}), 200

    tolerance = 0.5
    if best["distance"] > tolerance:
        return jsonify({"kind": "unknown", "distance": best["distance"]}), 200

    conn = database.init_db()
    kind, attendance_row = get_or_create_attendance(
        conn,
        best["employee"]["id"],
        today_key(),
        confidence=round(max(0.0, 1.0 - best["distance"]), 3),
    )
    attendance = database.row_to_attendance(attendance_row)
    attendance["employees"] = {
        "full_name": best["employee"]["full_name"],
        "employee_code": best["employee"]["employee_code"],
        "department": best["employee"]["department"],
        "job_title": best["employee"]["job_title"],
        "photo_url": best["employee"]["photo_url"],
    }
    conn.close()

    return jsonify(
        {
            "kind": kind,
            "employee": best["employee"],
            "record": attendance,
            "distance": best["distance"],
        }
    )


@app.get("/")
def index():
    return jsonify(
        {
            "name": "Attendance backend",
            "endpoints": {
                "health": "/api/health",
                "employees": "/api/employees",
                "attendance": "/api/attendance",
                "camera_stream": "/api/camera/stream",
                "capture_face": "/api/employees/capture-face",
                "scan": "/api/attendance/scan",
            },
        }
    )


if __name__ == "__main__":
    print("Starting local attendance API on port 5000...")
    app.run(host="0.0.0.0", port=5000, threaded=True)