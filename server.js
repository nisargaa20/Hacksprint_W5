const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const mariadb = require('mariadb');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = 8080;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    },
});

const upload = multer({ storage: storage });

const pool = mariadb.createPool({
    host: 'localhost',
    port: 3305,
    user: 'root',
    password: 'nisarga',
    database: 'upload',
    connectionLimit: 5,
});

pool.getConnection()
    .then(connection => {
        console.log('Connected to the database');
        connection.release();
    })
    .catch(error => {
        console.error('Error connecting to the database:', error);
    });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('chat message', (msg) => {
        console.log(`Message received from ${socket.id}: ${msg.message}`);
        io.emit('chat message', { username: msg.username, message: msg.message, file: msg.file });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const fileName = req.file.originalname;
    const filePath = req.file.path;

    const connection = await pool.getConnection();

    try {
        const insertQuery = 'INSERT INTO files (filename, filepath) VALUES (?, ?)';
        await connection.query(insertQuery, [fileName, filePath]);
        res.json({ message: 'File uploaded successfully', fileName: fileName });
    } catch (insertError) {
        console.error('Error inserting file into database:', insertError);
        res.status(500).json({ error: 'Error uploading file.' });
    } finally {
        connection.release();
    }
});

app.get('/files', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const selectQuery = 'SELECT id, filename, filepath, description, uploaded_at FROM files';
        const results = await connection.query(selectQuery);
        res.json(results);
    } catch (selectError) {
        console.error('Error retrieving files from database:', selectError);
        res.status(500).json({ error: 'Error retrieving files.' });
    } finally {
        connection.release();
    }
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});