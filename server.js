// Gerekli modülleri içeri aktar
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

// Sunucu kurulumu
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 'public' klasöründeki statik dosyaları (html, css, js) sun
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let waitingPlayer = null;
let gameRooms = {};

// Bir istemci sunucuya bağlandığında bu fonksiyon çalışır
io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    if (waitingPlayer) {
        // Eğer bekleyen bir oyuncu varsa, yeni bir oyun odası oluştur
        const roomName = `room_${socket.id}_${waitingPlayer.id}`;
        
        socket.join(roomName);
        waitingPlayer.join(roomName);

        gameRooms[socket.id] = roomName;
        gameRooms[waitingPlayer.id] = roomName;
        
        // Her iki oyuncuya da oyunun başladığını haber ver
        io.to(roomName).emit('gameStart', { 
            message: 'Oyun Başladı!',
            startingPlayer: waitingPlayer.id // İlk oyuncu başlasın
        });
        
        console.log(`Oda kuruldu: ${roomName}. Oyuncular: ${waitingPlayer.id}, ${socket.id}`);
        waitingPlayer = null; // Bekleyen oyuncu kalmadı
    } else {
        // Eğer bekleyen oyuncu yoksa, bu oyuncuyu beklemeye al
        waitingPlayer = socket;
        socket.emit('waiting', { message: 'Rakip bekleniyor...' });
    }

    // Bir oyuncu hamle yaptığında bu olay tetiklenir
    socket.on('playerMove', (data) => {
        const roomName = gameRooms[socket.id];
        if (roomName) {
            socket.broadcast.to(roomName).emit('opponentMove', data);
        }
    });

    // Sıra değişimi olayı
    socket.on('turnChange', (data) => {
        const roomName = gameRooms[socket.id];
        if (roomName) {
            io.to(roomName).emit('newTurn', data);
        }
    });

    // Bağlantı kesildiğinde
    socket.on('disconnect', () => {
        console.log('Bir kullanıcı ayrıldı:', socket.id);
        const roomName = gameRooms[socket.id];
        if(roomName) {
            io.to(roomName).emit('opponentDisconnect', {message: "Rakibiniz oyundan ayrıldı."});
            delete gameRooms[socket.id];
        }
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
    });
});

// Sunucuyu dinlemeye başla
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});