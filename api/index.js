import multer from 'multer';
import { parse } from 'papaparse';

// Configurar multer para memoria
const upload = multer({ storage: multer.memoryStorage() });

// Convertir middleware de multer a una promesa
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Verificar método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  try {
    // Ejecutar el middleware de multer
    await runMiddleware(req, res, upload.single('csvFile'));

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ningún archivo.' });
    }

    const csvContent = req.file.buffer.toString('utf-8');

    // Convertir parse a promesa
    const parseCSV = (content) => {
      return new Promise((resolve, reject) => {
        parse(content, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => resolve(results),
          error: (error) => reject(error),
        });
      });
    };

    const results = await parseCSV(csvContent);
    const readings = results.data;

    if (readings.length === 0) {
      return res.status(400).json({ error: 'No se encontraron datos válidos en el archivo.' });
    }

    const headers = Object.keys(readings[0]);
    console.log("Encabezados detectados:", headers);

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
      return res.status(400).json({ error: 'No se encontró columna de temperatura ni humedad.' });
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

    return res.status(200).json({
      sensorType: dataInfo.type,
      totalReadings: processedReadings.length,
      errors: errors.length,
      errorRate: ((errors.length / processedReadings.length) * 100).toFixed(2) + '%',
      data: processedReadings,
    });

  } catch (error) {
    console.error('Error procesando el archivo:', error);
    return res.status(500).json({ error: 'Error procesando el archivo: ' + error.message });
  }
}
