import base64
import requests
import os
import time

# --- CONFIGURATION (DO NOT SHARE PUBLICLY) ---
# Find these in Firebase Console -> Project Settings -> General
API_KEY = "AIzaSyB-_Kj0HbPoby2eSORpOD13Fwwdv4dHRcA"
PROJECT_ID = "plant-monitor-c5109"
# DB_ID is usually "(default)" unless you created a named database
DB_ID = "(default)"
# SECRET must match the UPLOAD_SECRET in your Vercel/AI Studio settings
SECRET = "george"
IMAGE_DIR = os.path.expanduser("C:/Users/georg/PlantPhotos")
# ---------------------

def get_latest_image():
    files = [os.path.join(IMAGE_DIR, f) for f in os.listdir(IMAGE_DIR) if f.endswith('.jpg')]
    return max(files, key=os.path.getctime) if files else None

latest = get_latest_image()
if not latest:
    print("No photos found.")
    exit()

with open(latest, "rb") as img_file:
    b64_string = base64.b64encode(img_file.read()).decode('utf-8')

url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/{DB_ID}/documents/snapshots?key={API_KEY}"
payload = {
    "fields": {
        "image": {"stringValue": b64_string},
        "timestamp": {"integerValue": str(int(time.time() * 1000))},
        "secret": {"stringValue": SECRET}
    }
}

response = requests.post(url, json=payload)
if response.status_code == 200:
    print(f" Uploaded: {os.path.basename(latest)}")
else:
    print(f" Error {response.status_code}: {response.text}")
