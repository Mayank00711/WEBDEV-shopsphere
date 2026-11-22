const router = require('express').Router();
const c = require('../controllers/coupon.controller');
const v = require('../validators/coupon.validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.post('/apply', authorize('customer'), validate(v.validateCode), c.apply);
router.use(authorize('admin'));
router.get('/', c.list);
router.post('/', validate(v.create), c.create);
router.patch('/:id', validate(v.update), c.update);
router.delete('/:id', validate(v.byId), c.remove);

module.exports = router;
