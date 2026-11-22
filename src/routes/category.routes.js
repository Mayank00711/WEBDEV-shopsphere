const router = require('express').Router();
const c = require('../controllers/category.controller');
const v = require('../validators/category.validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', c.list);
router.get('/:id', validate(v.byId), c.getById);
router.post('/', authenticate, authorize('admin'), validate(v.create), c.create);
router.patch('/:id', authenticate, authorize('admin'), validate(v.update), c.update);
router.delete('/:id', authenticate, authorize('admin'), validate(v.byId), c.remove);

module.exports = router;
