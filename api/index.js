import express from 'express';
import multer from 'multer';
import { parse } from 'papaparse';

const app = express();
const upload = multer(); // Utilizamos multer sin especificar carpeta para mantener el archivo en memoria

// Ruta principal que acepta el archivo CSV
app.post('/', upload.single('csvFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No se ha proporcionado ningún archivo.');
  }

  const csvContent = req.file.buffer.toString('utf-8');

  // Parsear el contenido del archivo CSV
  parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      const readings = results.data;

      if (readings.length === 0) {
        return res.status(400).send('No se encontraron datos válidos en el archivo.');
      }

      const headers = Object.keys(readings[0]);
      console.log("Encabezados detectados:", headers);

      // Buscar columna de temperatura o humedad
      const temperatureColumn = headers.find(
        (key) =>
          key.includes('Temperatura') ||
          key.includes('Temperature') ||
          key === 'Temperatura_C'
      );

      const humidityColumn = headers.find(
        (key) =>
          key.includes('Humedad') ||
          key.includes('Humidity') ||
          key === 'Humedad_%'
      );

      if (!temperatureColumn && !humidityColumn) {
        return res.status(400).send('No se encontró columna de temperatura ni humedad.');
      }

      const dataInfo = temperatureColumn
        ? { column: temperatureColumn, type: 'temperatura' }
        : { column: humidityColumn, type: 'humedad' };

      const processedReadings = readings.map((reading) => {
        const value = parseFloat(String(reading[dataInfo.column]).replace(',', '.'));
        return {
          timestamp: reading.timestamp || reading.Timestamp || reading.TIMESTAMP || Object.values(reading)[0],
          originalValue: reading[dataInfo.column],
          value: isNaN(value) ? null : value,
          hasError: isNaN(value),
        };
      });

      const errors = processedReadings.filter((reading) => reading.hasError);

      res.json({
        sensorType: dataInfo.type,
        totalReadings: processedReadings.length,
        errors: errors.length,
        errorRate: ((errors.length / processedReadings.length) * 100).toFixed(2) + '%',
        data: processedReadings,
      });
    },
    error: (error) => {
      console.error('Error parseando el archivo:', error.message);
      res.status(500).send('Error parseando el archivo: ' + error.message);
    },
  });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
