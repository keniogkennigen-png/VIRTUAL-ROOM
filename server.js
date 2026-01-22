const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Store room state
const rooms = {};

io.on('connection', (socket) => {
    console.log('👤 Usuario conectado:', socket.id);

    // Join room
    socket.on('join-room', ({ roomId, username }) => {
        socket.join(roomId);

        // Initialize room if doesn't exist
        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: [],
                content: { type: 'none', data: null }
            };
        }

        // Add user to room
        const user = { id: socket.id, username: username || 'Guest' };
        rooms[roomId].users.push(user);

        // Send current room state to new user
        socket.emit('room-state', rooms[roomId]);

        // Notify others
        socket.to(roomId).emit('user-joined', user);
        io.to(roomId).emit('room-users', rooms[roomId].users);

        console.log(`${user.username} joined room: ${roomId}`);
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

    // Share PDF (one user uploads, all see)
    socket.on('share-pdf', ({ roomId, pdfData, filename }) => {
        rooms[roomId].content = { type: 'pdf', data: pdfData, filename };
        io.to(roomId).emit('content-update', rooms[roomId].content);
        io.to(roomId).emit('new-message', {
            user: 'System',
            text: `📄 ${rooms[roomId].users.find(u => u.id === socket.id)?.username} shared a PDF: ${filename}`
        });
    });

    // Share Video URL (one user enters URL, all see)
    socket.on('share-video', ({ roomId, videoUrl, title }) => {
        rooms[roomId].content = { type: 'video', data: videoUrl, title };
        io.to(roomId).emit('content-update', rooms[roomId].content);
        io.to(roomId).emit('new-message', {
            user: 'System',
            text: `🎬 ${rooms[roomId].users.find(u => u.id === socket.id)?.username} shared a video: ${title || videoUrl}`
        });
    });

    // Clear content
    socket.on('clear-content', ({ roomId }) => {
        rooms[roomId].content = { type: 'none', data: null };
        io.to(roomId).emit('content-update', rooms[roomId].content);
    });

    // Disconnect
    socket.on('disconnect', () => {
        // Remove user from all rooms
        for (const roomId in rooms) {
            const userIndex = rooms[roomId].users.findIndex(u => u.id === socket.id);
            if (userIndex !== -1) {
                const user = rooms[roomId].users[userIndex];
                rooms[roomId].users.splice(userIndex, 1);

                io.to(roomId).emit('user-left', user);
                io.to(roomId).emit('room-users', rooms[roomId].users);

                // Clean up empty rooms
                if (rooms[roomId].users.length === 0) {
                    delete rooms[roomId];
                }
            }
        }
        console.log('👤 Usuario desconectado:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 Servidor Virtual Room en http://localhost:${PORT}`);
    console.log(`📝 Para acceder: http://localhost:${PORT}?room=NOMBRE_SALA&username=TU_NOMBRE`);
});
