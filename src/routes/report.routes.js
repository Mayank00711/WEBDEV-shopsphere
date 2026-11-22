const router = require('express').Router();
const c = require('../controllers/report.controller');
const v = require('../validators/report.validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

// Sellers get reports scoped to their own products; admins see the whole platform.
router.use(authenticate, authorize('seller', 'admin'));
router.get('/sales', validate(v.sales), c.sales);
router.get('/top-products', validate(v.topProducts), c.topProducts);
router.get('/category-sales', validate(v.categorySales), c.categorySales);
router.get('/inventory', validate(v.inventory), c.inventory);
router.get('/low-stock', validate(v.lowStock), c.lowStock);

module.exports = router;
