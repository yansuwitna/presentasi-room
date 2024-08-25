const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

//FILE
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'pdf');

//variabel
const slide = {};
const nama = {};
const clientCount = {};
const jml_slide = {};

//CSS
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/pdf/'); // Folder penyimpanan file
    },
    filename: (req, file, cb) => {
        const room = req.body.room; // Ambil nilai room dari body request
        const ext = path.extname(file.originalname); // Ekstensi file
        const filename = `${room}${ext}`; // Nama file sesuai room 
        cb(null, filename);
    }
});
const upload = multer({ storage: storage });


// Set view engine ke EJS
app.set('view engine', 'ejs');

// Routing untuk file statis
app.use(express.static(path.join(__dirname, 'public')));

// Halaman utama untuk guru
app.get('/guru', (req, res) => {
    const room = req.query.room;
    if (room == null) {
        res.render('home');
    } else {
        //Jumlah Slide
        if (!jml_slide[room]) {
            let file = path.join(UPLOADS_DIR, `${room}.pdf`);
            try {
                fs.readFileSync(file);
            } catch (error) {
                file = path.join(UPLOADS_DIR, `kosong.pdf`);
            }
            getPageCount(file, req.query.room);
        }
        res.render('teacher', { room: req.query.room });
    }
});


// Route untuk menyajikan halaman upload
app.get('/upload/:room', (req, res) => {
    const room = req.params.room || 'kosong';
    res.render('upload', { room });
});

// Halaman utama untuk siswa
app.get('/siswa', (req, res) => {
    const room = req.query.room || 'kosong';
    if (room == 'kosong') {
        res.render('index');
    } else {
        res.render('student', { room: req.query.room });
    }
});

// Halaman utama untuk siswa
app.get('/', (req, res) => {
    res.render('index');
});

// Route untuk mengunggah file PDF
app.post('/upload', upload.single('pdf'), (req, res) => {
    const filePath = path.join(UPLOADS_DIR, `${req.body.room}.pdf`);
    console.log(filePath);
    getPageCount(filePath, req.body.room);
    slide[req.body.room] = 0;

    res.redirect(`/guru/?room=${req.body.room}`);
});

async function getPageCount(filePath, room) {
    try {
        // Baca file PDF sebagai buffer
        const existingPdfBytes = fs.readFileSync(filePath);

        // Muat dokumen PDF
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // Dapatkan jumlah halaman
        const pageCount = pdfDoc.getPageCount();

        jml_slide[room] = pageCount;

        console.log(`${room} : Number of pages: ${pageCount}`);
    } catch (error) {
        jml_slide[room] = 0;
    }


}

// Route untuk menyajikan file PDF
app.get('/presentation/:room', (req, res) => {
    const room = req.params.room || 'kosong';
    let file = path.join(UPLOADS_DIR, `${room}.pdf`);

    try {
        const data = fs.readFileSync(file);
        console.log(file)
        res.sendFile(file);
    } catch (err) {
        let file = path.join(UPLOADS_DIR, 'kosong.pdf');

        console.log(file)
        res.sendFile(file);
    }
});

// Socket.io untuk sinkronisasi antara guru dan siswa
io.on('connection', (socket) => {
    socket.on('joinRoom', (room) => {
        socket.join(room);
        // console.log('MASUK KELAS : ' + room);

        //Jumlah Client
        nama[room] = io.sockets.adapter.rooms.get(room);
        // console.log(nama[room].size);
        clientCount[room] = nama[room].size;
        io.to(room).emit('siswa', clientCount[room]);
        console.log('JML SISWA : ' + clientCount[room]);

        //Posisi Slide
        if (!slide[room]) {
            slide[room] = 0;
        }

        socket.on('next', ({ room }) => {
            slide[room]++;
            io.to(room).emit('slide', slide[room]);
        });

        socket.on('prev', ({ room }) => {
            slide[room]--;
            io.to(room).emit('slide', slide[room]);
        });

        socket.emit('slide', slide[room]);
        socket.emit('jml_slide', jml_slide[room]);

        socket.on('disconnect', () => {
            console.log("========= Keluar : " + clientCount[room]);
            clientCount[room]--;
            io.to(room).emit('siswa', clientCount[room]);
        });
    });

});

// Mulai server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
