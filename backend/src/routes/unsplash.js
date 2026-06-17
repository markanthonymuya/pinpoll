const router = require('express').Router();
const https = require('https');

router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) return res.status(400).json({ error: 'q param required' });

    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) return res.json({ url: null });

    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(q)}&orientation=squarish&client_id=${key}`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'Accept-Version': 'v1' } }, (r) => {
        let body = '';
        r.on('data', (chunk) => (body += chunk));
        r.on('end', () => {
          if (r.statusCode !== 200) return resolve(null);
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }).on('error', reject);
    });

    const imageUrl = data?.urls?.regular || null;
    res.json({ url: imageUrl });
  } catch (err) { next(err); }
});

module.exports = router;
