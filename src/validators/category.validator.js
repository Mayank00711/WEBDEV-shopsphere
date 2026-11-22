const { Joi, idParam } = require('./common');

module.exports = {
  create: {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(60).required(),
      description: Joi.string().trim().max(300).allow(''),
      isActive: Joi.boolean(),
    }),
  },
  update: {
    params: idParam,
    body: Joi.object({
      name: Joi.string().trim().min(2).max(60),
      description: Joi.string().trim().max(300).allow(''),
      isActive: Joi.boolean(),
    }).min(1),
  },
  byId: { params: idParam },
};
