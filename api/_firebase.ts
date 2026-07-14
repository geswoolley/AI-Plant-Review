import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let firebaseConfig: any = {};
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    console.warn('Could not parse firebase-applet-config.json');
  }
}

if (!admin.apps.length) {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  console.log('[_firebase] FIREBASE_SERVICE_ACCOUNT_KEY present:', !!serviceAccountKey, 'length:', serviceAccountKey?.length ?? 0);

  let credential;
  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(serviceAccountKey);
      console.log('[_firebase] Parsed service account project_id:', parsed.project_id, 'client_email:', parsed.client_email);
      credential = admin.credential.cert(parsed);
    } catch (e: any) {
      console.error('[_firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY as JSON:', e.message);
      throw e;
    }
  } else {
    console.warn('[_firebase] No FIREBASE_SERVICE_ACCOUNT_KEY set, falling back to applicationDefault()');
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  });
}

export const db = getFirestore(process.env.FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)');
export const snapshotsCol = db.collection('snapshots');
