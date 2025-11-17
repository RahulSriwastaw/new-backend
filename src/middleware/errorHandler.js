export const errorHandler = (err, req, res, next) => {
  console.error('========== GLOBAL ERROR HANDLER ==========');
  console.error('Error Type:', err.constructor.name);
  console.error('Error Name:', err.name);
  console.error('Error Message:', err.message);
  console.error('Request Path:', req.path);
  console.error('Request Method:', req.method);
  
  if (err.code) {
    console.error('Error Code:', err.code);
  }
  if (err.stack) {
    console.error('Error Stack:', err.stack);
  }
  console.error('===========================================');
  
  if (res.headersSent) {
    return next(err);
  }
  
  const statusCode = err.statusCode || 500;
  const errorMessage = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    error: errorMessage,
    ...(process.env.NODE_ENV === 'development' && {
      details: {
        name: err.name,
        stack: err.stack,
        code: err.code
      }
    })
  });
};

