const router = require('express').Router();
const mongoose = require('mongoose');
const { onlineCount } = require('../sockets');

router.get('/health', (_req, res) =>
  res.json({
    success: true,
    message: 'OK',
    data: {
      uptime: Math.round(process.uptime()),
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      onlineUsers: onlineCount(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  }));

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/categories', require('./category.routes'));
router.use('/products', require('./product.routes'));
router.use('/cart', require('./cart.routes'));
router.use('/orders', require('./order.routes'));
router.use('/coupons', require('./coupon.routes'));
router.use('/reports', require('./report.routes'));
router.use('/notifications', require('./notification.routes'));

module.exports = router;
