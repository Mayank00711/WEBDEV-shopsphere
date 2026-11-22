const { Joi, idParam } = require('./common');

const fields = {
  code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{3,20}$/),
  type: Joi.string().valid('percent', 'flat'),
  value: Joi.number().min(0),
  maxDiscount: Joi.number().min(0),
  minOrderValue: Joi.number().min(0),
  expiresAt: Joi.date().iso(),
  usageLimit: Joi.number().integer().min(1),
  isActive: Joi.boolean(),
};

module.exports = {
  create: {
    body: Joi.object({
      ...fields,
      code: fields.code.required(),
      type: fields.type.required(),
      value: Joi.when('type', { is: 'percent', then: Joi.number().min(1).max(100), otherwise: Joi.number().min(1) }).required(),
      expiresAt: fields.expiresAt.greater('now').required(),
    }),
  },
  update: { params: idParam, body: Joi.object(fields).min(1) },
  byId: { params: idParam },
  validateCode: { body: Joi.object({ code: fields.code.required() }) },
};
