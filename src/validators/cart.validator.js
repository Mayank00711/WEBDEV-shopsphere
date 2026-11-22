const { Joi, objectId } = require('./common');

module.exports = {
  addItem: {
    body: Joi.object({
      productId: objectId.required(),
      quantity: Joi.number().integer().min(1).max(100).default(1),
    }),
  },
  updateItem: {
    params: Joi.object({ productId: objectId.required() }),
    body: Joi.object({ quantity: Joi.number().integer().min(1).max(100).required() }),
  },
  removeItem: { params: Joi.object({ productId: objectId.required() }) },
};
