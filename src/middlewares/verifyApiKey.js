const authenticateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ error: 'Unauthorized: Missing API key' });
    }

    const clientKey = Buffer.from(apiKey);
    const serverKey = Buffer.from(process.env.STATUS_API_KEY);

    if (clientKey.length !== serverKey.length) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    let mismatch = 0;
    for (let i = 0; i < clientKey.length; i++) {
        mismatch |= clientKey[i] ^ serverKey[i];
    }

    if (mismatch) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    next();
};

module.exports = authenticateApiKey;