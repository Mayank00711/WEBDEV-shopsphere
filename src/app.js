const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/env');
const routes = require('./routes');
const { requestId, httpLogger } = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Middleware chain: security headers -> CORS -> request id -> logging -> body parsing
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin }));
app.use(requestId);
app.use(httpLogger);
app.use(express.json({ limit: '100kb' }));

app.use('/api', routes);
app.use('/api', notFound);

// Demo web UI (optional; the backend is fully usable through Postman alone).
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
