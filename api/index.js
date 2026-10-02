const app = require('../backend/src/app');

module.exports = (req, res) => {
  const path = req.query && req.query.path;
  if (typeof path === 'string') {
    if (path === 'v1/catalog' || path.startsWith('v1/catalog/')
      || path === 'admin/reports' || path.startsWith('admin/reports/')) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (key === 'path') continue;
        if (Array.isArray(value)) {
          for (const item of value) query.append(key, item);
        } else if (typeof value === 'string') {
          query.append(key, value);
        }
      }
      req.url = `/api/${path}${query.size ? `?${query}` : ''}`;
    } else {
      req.url = `/api/${path}`;
    }
  }
  return app(req, res);
};
