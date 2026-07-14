import { snapshotsCol } from './_firebase.js';

export default async function handler(req: any, res: any) {
  try {
    const snapshot = await snapshotsCol.orderBy('timestamp', 'desc').limit(1).get();
    if (snapshot.empty) {
      return res.status(404).json({ error: 'No image available' });
    }

    const docSnap = snapshot.docs[0];
    const doc = docSnap.data();
    return res.status(200).json({
      id: docSnap.id,
      image: doc.image,
      timestamp: doc.timestamp,
    });
  } catch (err: any) {
    console.error('Error fetching latest image:', err);
    return res.status(500).json({ error: 'Failed to fetch latest image' });
  }
}
