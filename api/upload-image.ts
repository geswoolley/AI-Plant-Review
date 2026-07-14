import { snapshotsCol } from './_firebase';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ready', method: 'Use POST to upload' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, secret, score, analysis } = req.body;

  const expectedSecret = process.env.UPLOAD_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    console.log('[POST] /api/upload-image: Unauthorized access attempt');
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing secret' });
  }

  if (!image) {
    return res.status(400).json({ error: 'No image data provided' });
  }

  const timestamp = Date.now();

  try {
    await snapshotsCol.add({
      image,
      timestamp,
      score: score ?? null,
      analysis: analysis ?? null,
    });

    console.log('[POST] /api/upload-image: Received and saved new snapshot');
    return res.status(200).json({ status: 'ok', timestamp });
  } catch (err: any) {
    console.error('Error saving snapshot to Firestore:', err);
    return res.status(500).json({ error: 'Failed to persist snapshot' });
  }
}
