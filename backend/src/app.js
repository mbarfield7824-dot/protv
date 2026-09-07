const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const userRoutes = require('./routes/users');

const app = express();
const apiPrefix = process.env.VERCEL ? '/api' : '';

app.use(cors());
app.use(express.json());

app.get(`${apiPrefix}/health`, (req, res) => {
  res.json({ status: 'Backend is running!' });
});

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/videos`, videoRoutes);
app.use(`${apiPrefix}/users`, userRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = app;
