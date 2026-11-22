const router = require('express').Router();
const c = require('../controllers/cart.controller');
const v = require('../validators/cart.validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

// The cart is always the caller's own (resolved from the JWT), so one customer
// can never read or modify another customer's cart.
router.use(authenticate, authorize('customer'));
router.get('/', c.get);
router.post('/items', validate(v.addItem), c.addItem);
router.patch('/items/:productId', validate(v.updateItem), c.updateItem);
router.delete('/items/:productId', validate(v.removeItem), c.removeItem);
router.delete('/', c.clear);

module.exports = router;
