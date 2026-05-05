# 🌿 AI Plant Review

A real-time plant monitoring dashboard powered by Gemini AI and Raspberry Pi. This project uses a Raspberry Pi to capture photos of your plants, uploads them to Firebase, and uses Gemini AI to analyze plant health, pests, and growth.

## 🚀 Getting Started

Follow these steps to set up your own plant monitoring station.

### 1. Fork the Repository
- Click the **Fork** button at the top right of this page to create your own copy of the project.
- Clone your forked repository to your local machine.

### 2. Set Up Firebase
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. **Firestore Database**: Create a database in "Production Mode" and choose a location.
3. **Security Rules**: 
   - Copy the content of `firestore.rules` from this repo and paste it into the "Rules" tab of your Firestore database in the Firebase console.
   - **CRITICAL**: In the rules you just pasted, find the line `allow create: if request.resource.data.secret == "<YOUR_UPLOAD_SECRET>"` and replace `"<YOUR_UPLOAD_SECRET>"` with your actual secret password. This MUST match the `UPLOAD_SECRET` you use later.
4. **Project Settings**:
   - Go to Project Settings (gear icon).
   - Under "General", scroll down to "Your apps" and click the `</>` icon to add a Web App.
   - Register the app (you don't need Firebase Hosting for now).
   - Copy the `firebaseConfig` object values. You will need these for Vercel.

### 3. Get a Gemini API Key
- Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and generate a free API Key.

### 4. Publishing to Vercel
To publish your dashboard to a custom URL:
1. Go to [Vercel](https://vercel.com/) and sign in with your GitHub account.
2. Click **Add New** -> **Project**.
3. Import your forked repository.
4. **Environment Variables**: Add the following variables in the "Environment Variables" section:
   - `GEMINI_API_KEY`: Your Gemini API Key.
   - `UPLOAD_SECRET`: A custom password (e.g., `MySecret123`) for your Raspberry Pi to verify uploads.
   - `VITE_FIREBASE_API_KEY`: From your Firebase config.
   - `VITE_FIREBASE_PROJECT_ID`: From your Firebase config.
   - `VITE_FIREBASE_APP_ID`: From your Firebase config.
   - `VITE_FIREBASE_DATABASE_ID`: (Optional) Your Firestore Database ID (usually `(default)`).
   - `VITE_FIREBASE_AUTH_DOMAIN`: From your Firebase config.
   - `VITE_FIREBASE_STORAGE_BUCKET`: From your Firebase config.
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`: From your Firebase config.
5. Click **Deploy**. Vercel will build and host your application.

### 5. Custom Domain (Optional)
1. In your Vercel project dashboard, go to **Settings** -> **Domains**.
2. Enter your domain name and click **Add**.
3. Follow the DNS instructions provided by Vercel to link your domain.

---

## 🛠 Raspberry Pi Setup

### 1. Required Packages
Ensure your Raspberry Pi is up to date and has the necessary tools installed. We use `rpicam` for official Pi Cameras or `fswebcam` for USB webcams.

```bash
sudo apt update
sudo apt install curl coreutils fswebcam python3
```

### 2. Hardware Test (Optional but Recommended)
If you are using an official Raspberry Pi Camera module, run this to verify it is connected correctly:
```bash
rpicam-hello --list-cameras
```
To see a live image in your window (useful for focusing and positioning):
```bash
rpicam-hello -t 0
```
*Tip: On the Pi Zero, ensuring the silver contacts on the ribbon cable face the PCB is the most common fix for connection issues.*

### 3. Directory Structure
Ensure the storage directory exists where photos will be saved:
```bash
mkdir -p ~/PlantPhotos
```

---

## 📸 Camera Script Setup (`takephoto.py`)

This project includes a robust `takephoto.py` script that automatically detects your hardware (e.g., Pi Zero vs. Pi 4) and supports both USB webcams and official Pi Cameras. Set USE_PI_CAMERA = True for Pi Camera and False for USB Webcam.

1. Create the file on your Pi:
   ```bash
   nano ~/PlantPhotos/takephoto.py
   ```
2. Paste the following code:
   ```python
   import subprocess
   import os
   import datetime
   import shutil

   # --- CONFIGURATION ---
   USE_PI_CAMERA = False # Set to False for USB webcam, True for Pi Camera module
   IMAGE_DIR = os.path.expanduser("~/PlantPhotos")
   RESOLUTION_W = "800"
   RESOLUTION_H = "800"

   def get_camera_command():
       """Detects whether to use rpicam-still or libcamera-still."""
       if shutil.which("rpicam-still"):
           return "rpicam-still"
       elif shutil.which("libcamera-still"):
           return "libcamera-still"
       return None

   def is_camera_connected():
       """Checks if the system actually sees a camera module."""
       try:
           cmd = "rpicam-hello" if shutil.which("rpicam-hello") else "libcamera-hello"
           result = subprocess.run([cmd, "--list-cameras"], capture_output=True, text=True)
           return "Available cameras" in result.stdout and "- " in result.stdout
       except:
           return False

   def ensure_directory():
       if not os.path.exists(IMAGE_DIR):
           os.makedirs(IMAGE_DIR)

   def capture_image():
       timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M")
       filename = f"{timestamp}.jpg"
       filepath = os.path.join(IMAGE_DIR, filename)

       if USE_PI_CAMERA:
           if not is_camera_connected():
               print("--- HARDWARE ERROR ---")
               print("No camera detected. Please check your ribbon cable orientation.")
               return None

           cmd = get_camera_command()
           try:
               # -t 2000 allows for better auto-exposure stabilization
               subprocess.run([
                   cmd, "--nopreview", "-t", "2000",
                   "--width", RESOLUTION_W, "--height", RESOLUTION_H,
                   "-o", filepath
               ], check=True)
               return filepath
           except subprocess.CalledProcessError:
               return None
       else:
           # USB Webcam logic
           if not shutil.which("fswebcam"):
               print("Error: fswebcam not found.")
               return None
           try:
               subprocess.run(["fswebcam", "-r", f"{RESOLUTION_W}x{RESOLUTION_H}", "-S", "20", "--no-banner", filepath], check=True)
               return filepath
           except subprocess.CalledProcessError:
               return None

   if __name__ == "__main__":
       ensure_directory()
       capture_image()
   ```

---

## 📋 Crontab Configuration

To install these tasks, run `crontab -e` on your Raspberry Pi and paste the following lines at the bottom of the file.

### 1. Automated Photo Capture
Takes a photo every 30 minutes from 7 am to 7 pm daily.
```bash
*/30 7-18 * * * /usr/bin/python3 ~/PlantPhotos/takephoto.py
```

### 2. Automatic AI Upload (Firebase Direct)
Sends the most recent photo directly to your Firestore database.

1. Create `upload.py`:
   ```bash
   nano ~/PlantPhotos/upload.py
   ```
2. Paste the script below (Replace the placeholders with values from your Firebase Project Settings):
   ```python
   import base64
   import requests
   import os
   import time

   # --- CONFIGURATION (DO NOT SHARE PUBLICLY) ---
   # Find these in Firebase Console -> Project Settings -> General
   API_KEY = "<YOUR_WEB_API_KEY>"
   PROJECT_ID = "<YOUR_PROJECT_ID>" 
   # DB_ID is usually "(default)" unless you created a named database
   DB_ID = "(default)"
   # SECRET must match the UPLOAD_SECRET in your Vercel/AI Studio settings
   SECRET = "<YOUR_UPLOAD_SECRET>"
   IMAGE_DIR = os.path.expanduser("~/PlantPhotos")
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
   ```

3. Add to Crontab:
```bash
# From 7 am to 7 pm daily, upload every 2 hours at 7:02 am, 9:02 am, etc until 19:02. This allows for the most recent photo to be uploaded 2 minutes after it is taken.
2 7,9,11,13,15,17,19 * * * /usr/bin/python3 ~/PlantPhotos/upload.py
```

### 3. Storage Maintenance (Cleanup)
Automatically deletes photos older than 2 days.
```bash
0 0 * * * find ~/PlantPhotos/ -name "*.jpg" -type f -mtime +2 -delete
```

---

## 📚 A Woman’s Guide to Winning in Tech

If you enjoyed this repo, check out my book, **A Woman’s Guide to Winning in Tech.** This book blends sharp humor with practical career strategies to help women navigate tech on their own terms—without changing who they are. Available on Amazon, Bookshop.org, Barnes & Noble, and IngramSpark.

- [Book Website](https://winningintech.com/) 
- [Amazon](https://amzn.to/3YxHVO7)
- [Instagram](https://www.instagram.com/winning.tech)
- [Facebook](https://www.facebook.com/winningintech)
