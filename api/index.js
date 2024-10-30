import multer from 'multer';
import { parse } from 'papaparse';

const upload = multer({ storage: multer.memoryStorage() });

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

function detectErrors(readings, dataInfo) {
  try {
    const processedReadings = readings.map(reading => {
      const value = parseFloat(String(reading[dataInfo.column]).replace(',', '.'));
      return {
        timestamp: reading.timestamp || reading.Timestamp || reading.TIMESTAMP || Object.values(reading)[0],
        originalValue: reading[dataInfo.column],
        value: isNaN(value) ? null : value,
        hasError: false,
        originalRow: reading // Guardamos la fila original completa
      };
    });

    const randomErrorRate = Math.random() * 0.1;
    const numberOfErrors = Math.floor(processedReadings.length * randomErrorRate);

    const errorIndices = new Set();
    while (errorIndices.size < numberOfErrors) {
      const randomIndex = Math.floor(Math.random() * processedReadings.length);
      errorIndices.add(randomIndex);
    }

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

function generateModifiedCSV(readings, dataInfo, originalHeaders) {
  try {
    // Añadimos la columna de estado después de la columna de datos
    const dataColumnIndex = originalHeaders.indexOf(dataInfo.column);
    const newHeaders = [...originalHeaders];
    newHeaders.splice(dataColumnIndex + 1, 0, 'Estado');

    // Creamos las líneas del CSV
    const csvLines = [newHeaders.join(';')];

    // Agregamos cada fila con su estado
    readings.forEach(reading => {
      const rowData = [...Object.values(reading.originalRow)];
      rowData.splice(dataColumnIndex + 1, 0, reading.hasError ? 'FALLA' : '');
      csvLines.push(rowData.join(';'));
    });

    return csvLines.join('\n');
  } catch (error) {
    console.error('Error generando CSV modificado:', error);
    throw error;
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
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
    const returnFormat = req.query.format || 'json'; // Nuevo parámetro para especificar el formato de retorno

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
    const dataInfo = detectDataColumn(headers);
    
    if (!dataInfo) {
      return res.status(400).json({ error: 'No se encontró columna de temperatura ni humedad.' });
    }

    const { readings: processedReadings, errorRate, errorCount } = detectErrors(readings, dataInfo);

    // Si se solicita CSV, devolvemos el archivo modificado
    if (returnFormat === 'csv') {
      const modifiedCSV = generateModifiedCSV(processedReadings, dataInfo, headers);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="datos_con_errores.csv"');
      return res.status(200).send(modifiedCSV);
    }

    // Por defecto, devolvemos JSON
    return res.status(200).json({
      sensorType: dataInfo.type,
      totalReadings: processedReadings.length,
      errors: errorCount,
      errorRate: `${(errorRate * 100).toFixed(2)}%`,
      data: processedReadings,
      errorReadings: processedReadings.filter(reading => reading.hasError)
    });

  } catch (error) {
    console.error('Error procesando el archivo:', error);
    return res.status(500).json({ error: 'Error procesando el archivo: ' + error.message });
  }
}
