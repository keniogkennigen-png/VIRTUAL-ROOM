const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const { PeerServer } = require('peer');
const path = require('path');

// HTTPS configuration (optional - for production)
// Only load if certificates exist
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
// Use HTTP server by default, HTTPS if certificates are available
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

// PeerJS server for WebRTC signaling (optional - can use built-in Socket.IO)
// const peerServer = PeerServer({ port: 9000, path: '/' });

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
        users: [],
        dashboard: { mode: 'none', data: null }
      };
    }

    const user = {
      id: socket.id,
      socketId: socket.id,
      username: username || 'Guest',
      avatarColor: avatarColor || '#00f3ff',
      chairIndex: null,
      isSpeaking: false
    };

    rooms[roomId].users.push(user);

    // Send current room state to new user
    socket.emit('room-state', rooms[roomId]);

    // Notify others
    socket.to(roomId).emit('user-joined', user);
    io.to(roomId).emit('room-users', rooms[roomId].users);

    console.log(`${user.username} joined room: ${roomId}`);
  });

  // Sit in chair
  socket.on('sit-chair', ({ roomId, chairIndex }) => {
    if (rooms[roomId]) {
      const user = rooms[roomId].users.find(u => u.id === socket.id);
      if (user && !rooms[roomId].users.some(u => u.chairIndex === chairIndex)) {
        user.chairIndex = chairIndex;
        io.to(roomId).emit('room-users', rooms[roomId].users);
      }
    }
  });

  // Start speaking (PTT)
  socket.on('start-speaking', ({ roomId }) => {
    if (rooms[roomId]) {
      const user = rooms[roomId].users.find(u => u.id === socket.id);
      if (user) {
        user.isSpeaking = true;
        io.to(roomId).emit('room-users', rooms[roomId].users);
      }
    }
  });

  // Stop speaking
  socket.on('stop-speaking', ({ roomId }) => {
    if (rooms[roomId]) {
      const user = rooms[roomId].users.find(u => u.id === socket.id);
      if (user) {
        user.isSpeaking = false;
        io.to(roomId).emit('room-users', rooms[roomId].users);
      }
    }
  });

  // Chat message
  socket.on('chat-message', ({ roomId, message }) => {
    const user = rooms[roomId]?.users.find(u => u.id === socket.id);
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
      text: `📄 ${rooms[roomId].users.find(u => u.id === socket.id)?.username} shared a PDF`
    });
  });

  // Share Video URL
  socket.on('share-video', ({ roomId, videoUrl, title }) => {
    rooms[roomId].dashboard = { type: 'video', data: videoUrl, title };
    io.to(roomId).emit('content-update', rooms[roomId].dashboard);
    io.to(roomId).emit('new-message', {
      user: 'System',
      text: `🎬 ${rooms[roomId].users.find(u => u.id === socket.id)?.username} shared a video`
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
      const userIndex = rooms[roomId].users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        const user = rooms[roomId].users[userIndex];
        rooms[roomId].users.splice(userIndex, 1);
        io.to(roomId).emit('user-left', user);
        io.to(roomId).emit('room-users', rooms[roomId].users);

        if (rooms[roomId].users.length === 0) {
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
});
