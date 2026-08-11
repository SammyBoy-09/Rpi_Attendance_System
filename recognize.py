import time
import cv2
import numpy as np
import face_recognition
from picamera2 import Picamera2
import database

def recognize_faces():
    # 1. Load registered users from the database
    conn = database.init_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM employees WHERE active = 1")
    rows = cursor.fetchall()
    
    if not rows:
        print("No employees found in the database. Please run register.py first.")
        return

    known_names = []
    known_encodings = []
    
    for row in rows:
        employee = database.row_to_employee(row)
        if not employee or employee["face_descriptor"] is None:
            continue
        known_names.append(employee["full_name"])
        known_encodings.append(np.array(employee["face_descriptor"], dtype=float))
        
    print(f"Loaded {len(known_names)} employees from the database.")

    # 2. Initialize Camera
    print("Initializing camera...")
    picam2 = Picamera2()
    config = picam2.create_video_configuration(main={"size": (640, 480), "format": "RGB888"})
    picam2.configure(config)
    picam2.start()
    
    print("\nStarting live recognition... (Press Ctrl+C to stop)")
    time.sleep(2) # Give the sensor time to adjust exposure

    try:
        # 3. Continuous capture loop
        while True:
            frame = picam2.capture_array()
            
            # Downscale frame for fast detection
            small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
            face_locations_small = face_recognition.face_locations(small_frame)
            
            scaled_locations = [
                (int(top / 0.25), int(right / 0.25), int(bottom / 0.25), int(left / 0.25))
                for top, right, bottom, left in face_locations_small
            ]
            face_encodings = face_recognition.face_encodings(frame, scaled_locations)
            
            if len(scaled_locations) == 0:
                print("Scanning...")
            
            # Loop through each face found in the frame
            for face_encoding in face_encodings:
                # Default to Unknown
                name = "Unknown"
                
                # Compare the live face against all database faces
                # tolerance=0.5 is strict. (0.6 is default, lower is stricter)
                matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=0.5)
                face_distances = face_recognition.face_distance(known_encodings, face_encoding)
                
                if len(face_distances) > 0:
                    # Find the one with the smallest distance (best mathematical match)
                    best_match_index = np.argmin(face_distances)
                    if matches[best_match_index]:
                        name = known_names[best_match_index]
                
                print(f"Detected: {name}")
            
            # Pause slightly to keep CPU usage manageable on the Pi
            time.sleep(1.5)
            
    except KeyboardInterrupt:
        print("\nStopping recognition...")
    finally:
        picam2.stop()
        conn.close()

if __name__ == '__main__':
    recognize_faces()