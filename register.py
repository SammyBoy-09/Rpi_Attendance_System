import time
import cv2
import numpy as np
import face_recognition
from picamera2 import Picamera2
import database

def register_user():
    full_name = input("Enter the full name of the user to register: ").strip()
    employee_code = input("Enter the employee code: ").strip().upper()

    if not full_name or not employee_code:
        print("Error: full name and employee code are required.")
        return
    
    # 1. Initialize DB and check for duplicates
    conn = database.init_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT employee_code FROM employees WHERE employee_code=?", (employee_code,))
    if cursor.fetchone():
        print(f"Error: Employee code '{employee_code}' is already registered.")
        return

    # 2. Initialize Camera
    print("Initializing camera...")
    picam2 = Picamera2()
    # face_recognition expects RGB, so your existing config is perfect
    config = picam2.create_video_configuration(main={"size": (640, 480), "format": "RGB888"})
    picam2.configure(config)
    picam2.start()

    encodings = []
    target_captures = 5
    
    print(f"\nLook at the camera. Capturing {target_captures} baseline frames...")
    time.sleep(2) # Give the sensor time to adjust exposure

    # 3. Capture Loop
    while len(encodings) < target_captures:
        frame = picam2.capture_array()
        
        # Detect all faces in the current frame using downscaled image
        small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
        face_locations_small = face_recognition.face_locations(small_frame)
        
        scaled_locations = [
            (int(top / 0.25), int(right / 0.25), int(bottom / 0.25), int(left / 0.25))
            for top, right, bottom, left in face_locations_small
        ]
        
        if len(scaled_locations) == 0:
            print("No face detected. Keep looking at the camera...")
        elif len(scaled_locations) > 1:
            print("Multiple faces detected! Please ensure only one person is in frame.")
        else:
            # Exactly one face found - extract the 128-d encoding
            print(f"Face acquired! Capturing {len(encodings) + 1}/{target_captures}...")
            face_encoding = face_recognition.face_encodings(frame, scaled_locations)[0]
            encodings.append(face_encoding)
            
        time.sleep(0.3) # Pause slightly between captures to get minor variations in angle

    picam2.stop()
    
    # 4. Average and Save
    print("\nAveraging embeddings to create master profile...")
    master_encoding = np.mean(encodings, axis=0)
    
    cursor.execute(
        """
        INSERT INTO employees (
            id, employee_code, full_name, face_descriptor, active
        ) VALUES (?, ?, ?, ?, 1)
        """,
        (
            f"cli-{employee_code}",
            employee_code,
            full_name,
            database.serialize_face_descriptor(master_encoding),
        ),
    )
    conn.commit()
    conn.close()
    
    print(f"Success! {full_name} has been registered to the database.")

if __name__ == '__main__':
    register_user()