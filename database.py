import io
import json
import sqlite3
from pathlib import Path

import numpy as np

DB_PATH = Path(__file__).with_name("attendance.db")


def adapt_array(arr):
    out = io.BytesIO()
    np.save(out, arr)
    out.seek(0)
    return sqlite3.Binary(out.read())


def convert_array(text):
    out = io.BytesIO(text)
    out.seek(0)
    return np.load(out)


sqlite3.register_adapter(np.ndarray, adapt_array)
sqlite3.register_converter("array", convert_array)


def _connect():
    conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    return conn


def _create_tables(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            employee_code TEXT NOT NULL UNIQUE,
            full_name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            department TEXT NOT NULL DEFAULT 'General',
            job_title TEXT,
            photo_url TEXT,
            face_descriptor TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS attendance_records (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            work_date TEXT NOT NULL,
            check_in TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            check_out TEXT,
            status TEXT NOT NULL DEFAULT 'present',
            method TEXT NOT NULL DEFAULT 'face',
            confidence REAL,
            note TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (employee_id, work_date),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            encoding array NOT NULL
        )
        """
    )


def _migrate_legacy_users(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS count FROM employees")
    if cursor.fetchone()["count"]:
        return

    legacy_rows = cursor.execute("SELECT name, encoding FROM users").fetchall()
    if not legacy_rows:
        return

    for index, row in enumerate(legacy_rows, start=1):
        encoding = row["encoding"]
        descriptor = json.dumps(encoding.tolist() if hasattr(encoding, "tolist") else encoding)
        employee_id = f"legacy-{index}"
        employee_code = f"EMP-{index:04d}"
        cursor.execute(
            """
            INSERT OR IGNORE INTO employees (
                id, employee_code, full_name, department, face_descriptor, active
            ) VALUES (?, ?, ?, 'General', ?, 1)
            """,
            (employee_id, employee_code, row["name"], descriptor),
        )


def init_db():
    conn = _connect()
    cursor = conn.cursor()
    _create_tables(cursor)
    conn.commit()
    _migrate_legacy_users(conn)
    conn.commit()
    return conn


def row_to_employee(row):
    if row is None:
        return None

    face_descriptor = row["face_descriptor"]
    if isinstance(face_descriptor, str):
        try:
            face_descriptor = json.loads(face_descriptor)
        except json.JSONDecodeError:
            face_descriptor = None

    return {
        "id": row["id"],
        "employee_code": row["employee_code"],
        "full_name": row["full_name"],
        "email": row["email"],
        "phone": row["phone"],
        "department": row["department"],
        "job_title": row["job_title"],
        "photo_url": row["photo_url"],
        "face_descriptor": face_descriptor,
        "active": bool(row["active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def row_to_attendance(row):
    if row is None:
        return None

    return {
        "id": row["id"],
        "employee_id": row["employee_id"],
        "work_date": row["work_date"],
        "check_in": row["check_in"],
        "check_out": row["check_out"],
        "status": row["status"],
        "method": row["method"],
        "confidence": row["confidence"],
        "note": row["note"],
        "created_at": row["created_at"],
    }


def serialize_face_descriptor(descriptor):
    if descriptor is None:
        return None
    if hasattr(descriptor, "tolist"):
        descriptor = descriptor.tolist()
    return json.dumps(descriptor)


def load_employees(conn=None, active_only=False):
    owns_connection = conn is None
    if conn is None:
        conn = init_db()

    cursor = conn.cursor()
    query = "SELECT * FROM employees"
    if active_only:
        query += " WHERE active = 1"
    query += " ORDER BY created_at DESC"
    rows = cursor.execute(query).fetchall()
    employees = [row_to_employee(row) for row in rows]

    if owns_connection:
        conn.close()
    return employees


def load_attendance(conn=None, work_date=None):
    owns_connection = conn is None
    if conn is None:
        conn = init_db()

    cursor = conn.cursor()
    query = """
        SELECT
            a.*,
            e.full_name,
            e.employee_code,
            e.department,
            e.job_title,
            e.photo_url
        FROM attendance_records a
        JOIN employees e ON e.id = a.employee_id
    """
    params = []
    if work_date:
        query += " WHERE a.work_date = ?"
        params.append(work_date)
    query += " ORDER BY a.check_in DESC"

    rows = cursor.execute(query, params).fetchall()
    records = []
    for row in rows:
        record = row_to_attendance(row)
        record["employees"] = {
            "full_name": row["full_name"],
            "employee_code": row["employee_code"],
            "department": row["department"],
            "job_title": row["job_title"],
            "photo_url": row["photo_url"],
        }
        records.append(record)

    if owns_connection:
        conn.close()
    return records