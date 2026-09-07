const app = require('../backend/src/app');

module.exports = (req, res) => {
  const path = req.query && req.query.path;
  if (typeof path === 'string') {
    req.url = `/api/${path}`;
  }
  return app(req, res);
};
