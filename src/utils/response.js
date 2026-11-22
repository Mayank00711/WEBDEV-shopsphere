// Every successful response has the same shape: { success, message, data, meta? }
function send(res, statusCode, data, message = 'OK', meta) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

module.exports = {
  ok: (res, data, message, meta) => send(res, 200, data, message, meta),
  created: (res, data, message = 'Created') => send(res, 201, data, message),
};
