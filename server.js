const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('👤 Usuario conectado:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
    });

    socket.on('move', (data) => {
        socket.to(data.room).emit('user-moved', { id: socket.id, pos: data.pos });
    });

    socket.on('chat-message', (data) => {
        io.to(data.room).emit('new-message', { user: socket.id.substr(0, 5), text: data.text });
    });

    socket.on('disconnect', () => {
        io.emit('user-left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
