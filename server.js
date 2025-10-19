const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let players = {};

io.on('connection', (socket) => {
    console.log('Bir oyuncu bağlandı:', socket.id);

    players[socket.id] = { id: socket.id };
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('throwBall', (ballData) => {
        // Atış verisini gönderen hariç herkese yayınla
        socket.broadcast.emit('playerThrewBall', { playerId: socket.id, data: ballData });
    });

    socket.on('resetPins', () => {
        // Bu isteği tüm istemcilere (gönderen dahil) yayınla
        io.emit('resetPinsBroadcast');
    });

    socket.on('disconnect', () => {
        console.log('Bir oyuncu ayrıldı:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});