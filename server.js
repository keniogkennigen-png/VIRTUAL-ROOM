const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const { PeerServer } = require('peer');
const path = require('path');

// HTTPS configuration (optional - for production)
let httpsOptions = null;
const certPath = path.join(__dirname, 'cert');
if (fs.existsSync(path.join(certPath, 'server.key')) &&
    fs.existsSync(path.join(certPath, 'server.crt'))) {
    httpsOptions = {
        key: fs.readFileSync(path.join(certPath, 'server.key')),
        cert: fs.readFileSync(path.join(certPath, 'server.crt'))
    };
}

const app = express();
const server = httpsOptions
    ? https.createServer(httpsOptions, app)
    : http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// Security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
});

// Rooms store (in-memory)
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join room
  socket.on('join-room', ({ roomId, username, avatarColor }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        admin: null,  // First user becomes admin
        locked: false,
        presenter: null,
        users: {},
        dashboard: { mode: 'none', data: null }
      };
    }

    // Check if room is locked (only admin can enter)
    if (rooms[roomId].locked && rooms[roomId].admin !== socket.id) {
      socket.emit('room-locked');
      return;
    }

    // First user becomes admin automatically
    if (!rooms[roomId].admin) {
      rooms[roomId].admin = socket.id;
      rooms[roomId].presenter = socket.id;
    }

    const userId = socket.id;
    rooms[roomId].users[userId] = {
      id: userId,
      socketId: socket.id,
      username: username || 'Guest',
      avatarColor: avatarColor || '#00f3ff',
      chairIndex: null,
      isSpeaking: false
    };

    // Send admin info to the user
    socket.emit('admin-info', {
      isAdmin: userId === rooms[roomId].admin,
      presenter: rooms[roomId].presenter
    });

    // Broadcast user list
    io.to(roomId).emit('user-list', Object.keys(rooms[roomId].users));

    // Send current room state to new user
    socket.emit('room-state', rooms[roomId]);

    // Notify others
    socket.to(roomId).emit('user-joined', rooms[roomId].users[userId]);
    io.to(roomId).emit('room-users', Object.values(rooms[roomId].users));

    console.log(`${username || 'Guest'} joined room: ${roomId}`);
  });

  // 🔇 MUTE USER (Admin only)
  socket.on('mute-user', ({ roomId, targetId }) => {
    if (!rooms[roomId]) return;
    if (rooms[roomId].admin !== socket.id) return; // Only admin can mute

    const targetSocketId = rooms[roomId].users[targetId]?.socketId;
    if (targetSocketId) {
      io.to(targetSocketId).emit('force-mute');
    }
  });

  // 👢 KICK USER (Admin only)
  socket.on('kick-user', ({ roomId, targetId }) => {
    if (!rooms[roomId]) return;
    if (rooms[roomId].admin !== socket.id) return; // Only admin can kick

    const targetSocketId = rooms[roomId].users[targetId]?.socketId;
    if (targetSocketId) {
      io.to(targetSocketId).emit('force-kick');
    }
  });

  // 🔒 LOCK ROOM (Admin only)
  socket.on('lock-room', ({ roomId }) => {
    if (!rooms[roomId]) return;
    if (rooms[roomId].admin !== socket.id) return; // Only admin can lock

    rooms[roomId].locked = true;
    io.to(roomId).emit('room-locked');
  });

  // 🎤 SET PRESENTER (Admin only)
  socket.on('set-presenter', ({ roomId, targetId }) => {
    if (!rooms[roomId]) return;
    if (rooms[roomId].admin !== socket.id) return; // Only admin can set presenter

    rooms[roomId].presenter = targetId;
    io.to(roomId).emit('presenter-changed', targetId);
  });

  // Sit in chair
  socket.on('sit-chair', ({ roomId, chairIndex }) => {
    if (rooms[roomId]) {
      const user = rooms[roomId].users[socket.id];
      if (user && !Object.values(rooms[roomId].users).some(u => u.chairIndex === chairIndex)) {
        user.chairIndex = chairIndex;
        io.to(roomId).emit('room-users', Object.values(rooms[roomId].users));
      }
    }
  });

  // Start speaking (PTT)
  socket.on('start-speaking', ({ roomId }) => {
    if (rooms[roomId]) {
      const user = rooms[roomId].users[socket.id];
      if (user) {
        user.isSpeaking = true;
        io.to(roomId).emit('room-users', Object.values(rooms[roomId].users));
      }
    }
  });

  // Stop speaking
  socket.on('stop-speaking', ({ roomId }) => {
    if (rooms[roomId]) {
      const user = rooms[roomId].users[socket.id];
      if (user) {
        user.isSpeaking = false;
        io.to(roomId).emit('room-users', Object.values(rooms[roomId].users));
      }
    }
  });

  // Chat message
  socket.on('chat-message', ({ roomId, message }) => {
    const user = rooms[roomId]?.users[socket.id];
    io.to(roomId).emit('new-message', {
      user: user?.username || 'Guest',
      text: message,
      time: new Date().toISOString()
    });
  });

  // Share PDF
  socket.on('share-pdf', ({ roomId, pdfData, filename }) => {
    rooms[roomId].dashboard = { type: 'pdf', data: pdfData, filename };
    io.to(roomId).emit('content-update', rooms[roomId].dashboard);
    io.to(roomId).emit('new-message', {
      user: 'System',
      text: `📄 ${rooms[roomId].users[socket.id]?.username} shared a PDF`
    });
  });

  // Share Video URL
  socket.on('share-video', ({ roomId, videoUrl, title }) => {
    rooms[roomId].dashboard = { type: 'video', data: videoUrl, title };
    io.to(roomId).emit('content-update', rooms[roomId].dashboard);
    io.to(roomId).emit('new-message', {
      user: 'System',
      text: `🎬 ${rooms[roomId].users[socket.id]?.username} shared a video`
    });
  });

  // Clear content
  socket.on('clear-content', ({ roomId }) => {
    rooms[roomId].dashboard = { type: 'none', data: null };
    io.to(roomId).emit('content-update', rooms[roomId].dashboard);
  });

  // WebRTC Signaling handlers
  socket.on('offer', ({ targetId, offer }) => {
    console.log('Sending offer to:', targetId);
    socket.to(targetId).emit('offer', {
      offer: offer,
      fromId: socket.id
    });
  });

  socket.on('answer', ({ targetId, answer }) => {
    console.log('Sending answer to:', targetId);
    socket.to(targetId).emit('answer', {
      answer: answer,
      fromId: socket.id
    });
  });

  socket.on('ice-candidate', ({ targetId, candidate }) => {
    console.log('Sending ICE candidate to:', targetId);
    socket.to(targetId).emit('ice-candidate', {
      candidate: candidate,
      fromId: socket.id
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      if (rooms[roomId].users[socket.id]) {
        const user = rooms[roomId].users[socket.id];
        delete rooms[roomId].users[socket.id];

        io.to(roomId).emit('user-left', user);
        io.to(roomId).emit('user-list', Object.keys(rooms[roomId].users));
        io.to(roomId).emit('room-users', Object.values(rooms[roomId].users));

        // If admin disconnects, assign new admin
        if (rooms[roomId].admin === socket.id) {
          const remainingUsers = Object.keys(rooms[roomId].users);
          if (remainingUsers.length > 0) {
            const newAdmin = remainingUsers[0];
            rooms[roomId].admin = newAdmin;
            rooms[roomId].presenter = newAdmin;

            // Notify new admin
            io.to(newAdmin).emit('admin-info', {
              isAdmin: true,
              presenter: newAdmin
            });
          }
        }

        if (Object.keys(rooms[roomId].users).length === 0) {
          delete rooms[roomId];
        }
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Access: http://localhost:${PORT}?room=ROOMNAME&username=YOURNAME`);
  console.log(`🎛️ HoloMeet VR Admin system ready`);
});
