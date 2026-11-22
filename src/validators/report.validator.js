const { Joi, objectId } = require('./common');

const range = { from: Joi.date().iso(), to: Joi.date().iso().min(Joi.ref('from')) };

module.exports = {
  sales: {
    query: Joi.object({ ...range, groupBy: Joi.string().valid('day', 'month').default('day'), seller: objectId }),
  },
  topProducts: {
    query: Joi.object({ ...range, limit: Joi.number().integer().min(1).max(50).default(5), seller: objectId }),
  },
  categorySales: { query: Joi.object({ ...range, seller: objectId }) },
  inventory: { query: Joi.object({ seller: objectId }) },
  lowStock: { query: Joi.object({ seller: objectId, limit: Joi.number().integer().min(1).max(100).default(20) }) },
};
