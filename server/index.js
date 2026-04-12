const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8,
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// Store slides as array of base64 strings + current index
let session = { slides: [], currentSlide: 0 };

app.get('/info', (req, res) => {
  res.json({ ip: getLocalIP(), port: 3001 });
});

// Serve student HTML
app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'student.html'));
});

// Serve individual slides via HTTP — no more pushing huge payloads through sockets
app.get('/slide/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const slide = session.slides[index];
  if (!slide) return res.status(404).send('Not found');

  // slide is a data URL like "data:image/png;base64,..."
  const base64Data = slide.replace(/^data:image\/\w+;base64,/, '');
  const imgBuffer = Buffer.from(base64Data, 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.send(imgBuffer);
});

// Serve slide count so student knows how many slides exist
app.get('/slides/count', (req, res) => {
  res.json({ count: session.slides.length, current: session.currentSlide });
});

io.on('connection', (socket) => {
  // Send current state (lightweight — just index + count, no image data)
  if (session.slides.length > 0) {
    socket.emit('session', {
      count: session.slides.length,
      currentSlide: session.currentSlide,
    });
  }

  socket.on('upload-slides', (slides) => {
    session.slides = slides;
    session.currentSlide = 0;
    io.emit('session', { count: slides.length, currentSlide: 0 });
  });

  socket.on('change-slide', (index) => {
    session.currentSlide = index;
    io.emit('slide-change', index);
  });
});

server.listen(3001, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n✅ Server ready`);
  console.log(`   Teacher app:  http://localhost:3001`);
  console.log(`   Student view: http://${ip}:3001/student`);
  console.log(`\n   👆 Use this URL in your QR code!\n`);
});