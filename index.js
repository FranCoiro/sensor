// Importamos las dependencias necesarias
const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Usamos CORS para permitir solicitudes desde cualquier origen
app.use(cors());

// Configuración de multer para la carga de archivos
const upload = multer({ dest: 'uploads/' });

// Ruta para subir el archivo CSV
app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  // Leemos el contenido del archivo CSV
  const filePath = path.join(__dirname, file.path);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer el archivo' });
    }

    // Procesamos el archivo CSV usando PapaParse
    Papa.parse(data, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          res.json({
            data: results.data,
            message: `${results.data.length} registros encontrados.`,
          });
        } else {
          res.status(400).json({ error: 'No se encontraron datos válidos en el archivo' });
        }
      },
    });
  });
});

// Ruta para manejar la raíz
app.get('/', (req, res) => {
  res.send('Bienvenido a la API de análisis de sensores');
});

// Iniciamos el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
