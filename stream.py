from app import app


if __name__ == "__main__":
    print("Starting attendance API and camera stream on port 5000...")
    app.run(host="0.0.0.0", port=5000, threaded=True)