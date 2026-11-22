const router = require('express').Router();
const c = require('../controllers/notification.controller');
const validate = require('../middleware/validate');
const { idParam } = require('../validators/common');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', c.list);
router.patch('/read-all', c.markAllRead);
router.patch('/:id/read', validate({ params: idParam }), c.markRead);

module.exports = router;
