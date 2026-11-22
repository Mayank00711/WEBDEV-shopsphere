// Reads ?page=&limit= safely and builds the `meta` block for list responses.
function getPagination(query, defaultLimit = 10, maxLimit = 100) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

function buildMeta(total, page, limit) {
  return { total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

module.exports = { getPagination, buildMeta };
