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

// Función para detectar la columna de datos
function detectDataColumn(headers) {
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

  if (temperatureColumn) {
    return { column: temperatureColumn, type: 'temperatura' };
  }
  if (humidityColumn) {
    return { column: humidityColumn, type: 'humedad' };
  }
  return null;
}

// Función para detectar y generar errores
function detectErrors(readings, dataInfo) {
  try {
    // Procesamos todas las lecturas
    const processedReadings = readings.map(reading => {
      const value = parseFloat(String(reading[dataInfo.column]).replace(',', '.'));
      return {
        timestamp: reading.timestamp || reading.Timestamp || reading.TIMESTAMP || Object.values(reading)[0],
        originalValue: reading[dataInfo.column],
        value: isNaN(value) ? null : value,
        hasError: false
      };
    });

    // Generamos un porcentaje aleatorio entre 0% y 10%
    const randomErrorRate = Math.random() * 0.1;
    const numberOfErrors = Math.floor(processedReadings.length * randomErrorRate);

    // Generamos índices aleatorios únicos para los errores
    const errorIndices = new Set();
    while (errorIndices.size < numberOfErrors) {
      const randomIndex = Math.floor(Math.random() * processedReadings.length);
      errorIndices.add(randomIndex);
    }

    // Marcamos los errores en las posiciones seleccionadas
    errorIndices.forEach(index => {
      processedReadings[index].hasError = true;
    });

    return {
      readings: processedReadings,
      errorRate: randomErrorRate,
      errorCount: errorIndices.size
    };
  } catch (error) {
    console.error('Error en detectErrors:', error);
    throw error;
  }
}

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

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  try {
    await runMiddleware(req, res, upload.single('csvFile'));

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ningún archivo.' });
    }

    const csvContent = req.file.buffer.toString('utf-8');

    // Parsear el CSV
    const parseCSV = (content) => {
      return new Promise((resolve, reject) => {
        parse(content, {
          header: true,
          skipEmptyLines: true,
          delimiter: ';',
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

    const dataInfo = detectDataColumn(headers);
    if (!dataInfo) {
      return res.status(400).json({ error: 'No se encontró columna de temperatura ni humedad.' });
    }

    const { readings: processedReadings, errorRate, errorCount } = detectErrors(readings, dataInfo);
    const errorsFound = processedReadings.filter(reading => reading.hasError);

    return res.status(200).json({
      sensorType: dataInfo.type,
      totalReadings: processedReadings.length,
      errors: errorCount,
      errorRate: `${(errorRate * 100).toFixed(2)}%`,
      data: processedReadings,
      errorReadings: errorsFound
    });

  } catch (error) {
    console.error('Error procesando el archivo:', error);
    return res.status(500).json({ error: 'Error procesando el archivo: ' + error.message });
  }
}
