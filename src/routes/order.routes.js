const router = require('express').Router();
const c = require('../controllers/order.controller');
const v = require('../validators/order.validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.post('/', authorize('customer'), validate(v.checkout), c.checkout);
router.get('/', validate(v.list), c.list);
router.get('/:id', validate(v.byId), c.getById);
router.patch('/:id/status', validate(v.updateStatus), c.updateStatus);

module.exports = router;
