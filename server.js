const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

/* ==========================
   CONFIG SILLAS (GLB REAL)
========================== */

const CHAIR_PREFIX = 'weaving3DAlanaOfficeChairFabricMesh001_chair_0.';
const TOTAL_CHAIRS = 7;

/* ==========================
   ROOMS
========================== */

const rooms = {};

/* ==========================
   SOCKET.IO
========================== */

io.on('connection', socket => {
  console.log('🟢 conectado:', socket.id);

  /* ===== JOIN ROOM ===== */
  socket.on('join-room', roomId => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: {},
        chairs: {}
      };

      // inicializar las 7 sillas
      for (let i = 1; i <= TOTAL_CHAIRS; i++) {
        const chairName = `${CHAIR_PREFIX}${String(i).padStart(3, '0')}`;
        rooms[roomId].chairs[chairName] = null;
      }
    }

    rooms[roomId].users[socket.id] = {
      chairName: null
    };

    // enviar estado actual de sillas
    socket.emit('chairs-state', rooms[roomId].chairs);

    console.log(`👤 ${socket.id} entró a room ${roomId}`);
  });

  /* ===== OCUPAR SILLA ===== */
  socket.on('chair-occupied', ({ roomId, chairName }) => {
    const room = rooms[roomId];
    if (!room) return;

    // validar silla
    if (!(chairName in room.chairs)) {
      socket.emit('chair-denied', 'invalid-chair');
      return;
    }

    // validar ocupación
    if (room.chairs[chairName]) {
      socket.emit('chair-denied', 'occupied');
      return;
    }

    const user = room.users[socket.id];

    // liberar silla previa
    if (user?.chairName) {
      room.chairs[user.chairName] = null;
      io.to(roomId).emit('chair-freed', {
        chairName: user.chairName
      });
    }

    // ocupar nueva silla
    room.chairs[chairName] = socket.id;
    user.chairName = chairName;

    io.to(roomId).emit('chair-occupied', {
      chairName,
      by: socket.id
    });

    console.log(`🪑 ${socket.id} ocupó ${chairName}`);
  });

  /* ===== LIBERAR SILLA MANUAL ===== */
  socket.on('chair-freed', ({ roomId, chairName }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.chairs[chairName] === socket.id) {
      room.chairs[chairName] = null;

      const user = room.users[socket.id];
      if (user) user.chairName = null;

      io.to(roomId).emit('chair-freed', { chairName });

      console.log(`🪑 ${socket.id} liberó ${chairName}`);
    }
  });

  /* ===== DISCONNECT ===== */
  socket.on('disconnect', () => {
    console.log('🔴 desconectado:', socket.id);

    for (const roomId in rooms) {
      const room = rooms[roomId];
      const user = room.users[socket.id];

      if (user?.chairName && room.chairs[user.chairName] === socket.id) {
        room.chairs[user.chairName] = null;

        io.to(roomId).emit('chair-freed', {
          chairName: user.chairName
        });
      }

      delete room.users[socket.id];
    }
  });
});

/* ==========================
   START SERVER
========================== */

server.listen(PORT, () => {
  console.log(`🚀 servidor activo en http://localhost:${PORT}`);
});
