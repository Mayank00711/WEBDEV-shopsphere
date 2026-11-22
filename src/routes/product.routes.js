const router = require('express').Router();
const c = require('../controllers/product.controller');
const v = require('../validators/product.validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

const manage = [authenticate, authorize('seller', 'admin')];

router.get('/', validate(v.list), c.list);
router.get('/mine', ...manage, validate(v.list), c.listMine);
router.get('/:id', validate(v.byId), c.getById);
router.post('/', ...manage, validate(v.create), c.create);
router.patch('/:id', ...manage, validate(v.update), c.update);
router.delete('/:id', ...manage, validate(v.byId), c.remove);
router.patch('/:id/stock', ...manage, validate(v.adjustStock), c.adjustStock);
router.get('/:id/stock-history', ...manage, validate(v.byId), c.stockHistory);

module.exports = router;
