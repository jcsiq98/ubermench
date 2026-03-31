const notFound = (req, res) => {
  res.status(404).json({ error: 'Route not found' });
};

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { notFound, errorHandler };


