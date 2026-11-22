const router = require('express').Router();
const c = require('../controllers/user.controller');
const v = require('../validators/user.validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/me', c.getMe);
router.patch('/me', validate(v.updateMe), c.updateMe);

// Administrative user management
router.use(authorize('admin'));
router.get('/', validate(v.list), c.list);
router.post('/', validate(v.create), c.create);
router.get('/:id', validate(v.byId), c.getById);
router.patch('/:id', validate(v.adminUpdate), c.update);
router.delete('/:id', validate(v.byId), c.remove);

module.exports = router;
