const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const expect = require('expect').expect || require('expect');
const { setup, teardown, api, createUser, auth } = require('./helpers');

beforeAll(setup);
afterAll(teardown);

describe('Authentication', () => {
  const body = { name: 'Neha Gupta', email: 'neha@test.dev', password: 'Secret123' };

  test('register succeeds, hashes password and returns tokens', async () => {
    const res = await api().post('/api/auth/register').send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    const User = require('../src/models/User');
    const stored = await User.findOne({ email: body.email }).select('+password');
    expect(stored.password).toMatch(/^\$2[aby]\$/);
  });

  test('duplicate email is rejected with 409', async () => {
    const res = await api().post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
  });

  test('validation failure lists each invalid field', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  test('public registration cannot create an admin', async () => {
    const res = await api().post('/api/auth/register').send({ ...body, email: 'x@test.dev', role: 'admin' });
    expect(res.status).toBe(400);
  });

  test('seller registration requires a store name', async () => {
    const res = await api().post('/api/auth/register').send({ ...body, email: 's@test.dev', role: 'seller' });
    expect(res.status).toBe(400);
  });

  test('wrong password returns 401 with a generic message', async () => {
    const res = await api().post('/api/auth/login').send({ email: body.email, password: 'Wrong1234' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  test('protected route without token returns 401', async () => {
    const res = await api().get('/api/users/me');
    expect(res.status).toBe(401);
  });

  test('tampered token returns 401', async () => {
    const res = await api().get('/api/users/me').set(auth('abc.def.ghi'));
    expect(res.status).toBe(401);
  });

  test('refresh rotates tokens and detects reuse of an old refresh token', async () => {
    const { refreshToken } = await createUser('customer');
    const first = await api().post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.data.refreshToken).not.toBe(refreshToken);

    // Re-using the consumed token revokes all sessions
    const reuse = await api().post('/api/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
    const afterRevoke = await api().post('/api/auth/refresh').send({ refreshToken: first.body.data.refreshToken });
    expect(afterRevoke.status).toBe(401);
  });

  test('logout invalidates the refresh token', async () => {
    const { token, refreshToken } = await createUser('customer');
    const out = await api().post('/api/auth/logout').set(auth(token)).send({ refreshToken });
    expect(out.status).toBe(200);
    const res = await api().post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });

  test('logout from all devices also invalidates the access token', async () => {
    const { token, refreshToken } = await createUser('customer');
    await api().post('/api/auth/logout').set(auth(token)).send({ refreshToken, allDevices: true });
    const res = await api().get('/api/users/me').set(auth(token));
    expect(res.status).toBe(401);
  });
});

describe('Users and RBAC', () => {
  test('a user cannot escalate their own role via PATCH /me', async () => {
    const { token } = await createUser('customer');
    const res = await api().patch('/api/users/me').set(auth(token)).send({ name: 'New Name', role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
    expect(res.body.data.role).toBe('customer');
  });

  test('customer cannot list users (403)', async () => {
    const { token } = await createUser('customer');
    const res = await api().get('/api/users').set(auth(token));
    expect(res.status).toBe(403);
  });

  test('admin can list users with pagination and role filter', async () => {
    const { token } = await createUser('admin');
    const res = await api().get('/api/users?role=customer&limit=2&page=1').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.meta.total).toBeGreaterThan(0);
    expect(res.body.data.every((u) => u.role === 'customer')).toBe(true);
  });

  test('deactivating a user blocks their existing token', async () => {
    const admin = await createUser('admin');
    const victim = await createUser('customer');
    await api().patch(`/api/users/${victim.user._id}`).set(auth(admin.token)).send({ isActive: false }).expect(200);
    const res = await api().get('/api/users/me').set(auth(victim.token));
    expect(res.status).toBe(401);
  });

  test('unknown user id returns 404, malformed id returns 400', async () => {
    const { token } = await createUser('admin');
    expect((await api().get('/api/users/64b7f0000000000000000000').set(auth(token))).status).toBe(404);
    expect((await api().get('/api/users/not-an-id').set(auth(token))).status).toBe(400);
  });
});
