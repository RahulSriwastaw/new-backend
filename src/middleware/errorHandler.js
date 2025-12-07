export const errorHandler = (err, req, res, next) => {
  try {
    const status = err.statusCode || err.status || 500;
    const body = { error: String(err.message || 'Internal Server Error') };
    if (process.env.NODE_ENV !== 'production') {
      body.stack = String(err.stack || '').split('\n').slice(0, 5);
      body.path = req.path;
      body.method = req.method;
    }
    res.status(status).json(body);
  } catch (internalErr) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
