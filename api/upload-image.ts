import { snapshotsCol } from './_firebase.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ready', method: 'Use POST to upload' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, secret, score, analysis, id } = req.body;

  const expectedSecret = process.env.UPLOAD_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    console.log('[POST] /api/upload-image: Unauthorized access attempt');
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing secret' });
  }

  try {
    if (id) {
      // Attach AI analysis results to the existing snapshot instead of creating a duplicate
      await snapshotsCol.doc(id).update({
        score: score ?? null,
        analysis: analysis ?? null,
      });
      console.log(`[POST] /api/upload-image: Updated snapshot ${id} with analysis`);
      return res.status(200).json({ status: 'ok', id });
    }

    if (!image) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    const timestamp = Date.now();
    const docRef = await snapshotsCol.add({
      image,
      timestamp,
      score: score ?? null,
      analysis: analysis ?? null,
    });

    console.log('[POST] /api/upload-image: Received and saved new snapshot');
    return res.status(200).json({ status: 'ok', timestamp, id: docRef.id });
  } catch (err: any) {
    console.error('Error saving snapshot to Firestore:', err);
    return res.status(500).json({ error: 'Failed to persist snapshot' });
  }
}
