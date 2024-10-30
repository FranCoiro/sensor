// Importamos las dependencias necesarias
const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

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
      delimiter: ';',
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          try {
            const processedData = detectErrors(results.data);
            res.json({
              data: processedData,
              message: `${processedData.length} registros encontrados.`,
            });
          } catch (error) {
            res.status(500).json({ error: 'Error procesando datos: ' + error.message });
          }
        } else {
          res.status(400).json({ error: 'No se encontraron datos válidos en el archivo' });
        }
      },
      error: (error) => {
        res.status(500).json({ error: 'Error parseando archivo: ' + error.message });
      },
    });

    // Eliminamos el archivo después de procesarlo
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error eliminando el archivo:', err);
      }
    });
  });
});

// Función para detectar errores en los datos del CSV
const detectErrors = (readings) => {
  const headers = Object.keys(readings[0]);
  console.log('Headers encontrados:', headers);

  const dataInfo = detectDataColumn(headers);
  if (!dataInfo) {
    throw new Error('No se encontró columna de temperatura ni humedad');
  }

  const validReadings = readings.filter((r) => {
    const value = parseFloat(String(r[dataInfo.column]).replace(',', '.'));
    return !isNaN(value);
  });

  console.log('Lecturas válidas:', validReadings.length);

  const processedReadings = validReadings.map((reading) => ({
    timestamp:
      reading.timestamp ||
      reading.Timestamp ||
      reading.TIMESTAMP ||
      Object.values(reading)[0],
    originalValue: reading[dataInfo.column],
    value: parseFloat(String(reading[dataInfo.column]).replace(',', '.')),
    hasError: false,
  }));

  const randomErrorRate = Math.random() * 0.1;
  const numberOfErrors = Math.floor(processedReadings.length * randomErrorRate);

  const errorIndices = new Set();
  while (errorIndices.size < numberOfErrors) {
    const randomIndex = Math.floor(Math.random() * processedReadings.length);
    errorIndices.add(randomIndex);
  }

  errorIndices.forEach((index) => {
    processedReadings[index].hasError = true;
  });

  console.log(
    `Lecturas procesadas: ${processedReadings.length}, Errores generados: ${errorIndices.size}`
  );
  return processedReadings;
};

// Función para detectar la columna de datos (temperatura o humedad)
const detectDataColumn = (headers) => {
  const temperatureColumn = headers.find(
    (key) =>
      key.includes('Temperatura') ||
      key.includes('Temperature') ||
      key === 'Temperatura_C'
  );

  const humidityColumn = headers.find(
    (key) => key.includes('Humedad') || key.includes('Humidity') || key === 'Humedad_%'
  );

  if (temperatureColumn) {
    return { column: temperatureColumn, type: 'temperatura' };
  }
  if (humidityColumn) {
    return { column: humidityColumn, type: 'humedad' };
  }
  return null;
};

// Iniciamos el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
