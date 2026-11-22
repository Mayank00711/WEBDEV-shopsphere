const { Server } = require('socket.io');
const User = require('../models/User');
const { verifyAccessToken } = require('../utils/tokens');
const config = require('../config/env');

let io = null;
const online = new Map(); // userId -> number of open sockets

// Rooms:  user:<id>  (personal)   role:<role>   product:<id> (live stock watchers)
function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.corsOrigin } });

  // Only authenticated users may connect. Token comes from handshake auth or query.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('UNAUTHORIZED: token missing'));
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select('+tokenVersion');
      if (!user || !user.isActive || user.tokenVersion !== payload.tv) return next(new Error('UNAUTHORIZED: invalid token'));
      socket.user = { id: user._id.toString(), role: user.role, name: user.name };
      next();
    } catch {
      next(new Error('UNAUTHORIZED: invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.user;
    socket.join(`user:${id}`);
    socket.join(`role:${role}`);
    online.set(id, (online.get(id) || 0) + 1);
    socket.emit('connected', { userId: id, role });

    socket.on('product:watch', (productId, ack) => {
      if (typeof productId !== 'string' || !/^[a-f0-9]{24}$/.test(productId)) return ack?.({ ok: false, error: 'invalid productId' });
      socket.join(`product:${productId}`);
      ack?.({ ok: true });
    });
    socket.on('product:unwatch', (productId) => socket.leave(`product:${productId}`));

    socket.on('disconnect', () => {
      const n = (online.get(id) || 1) - 1;
      if (n <= 0) online.delete(id); else online.set(id, n);
    });
  });

  return io;
}

const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
const emitToRole = (role, event, payload) => io?.to(`role:${role}`).emit(event, payload);
const emitToRoom = (room, event, payload) => io?.to(room).emit(event, payload);
const onlineCount = () => online.size;
const closeSocket = () => io?.close();

module.exports = { initSocket, emitToUser, emitToRole, emitToRoom, onlineCount, closeSocket };
