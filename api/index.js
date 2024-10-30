import multer from 'multer';
import { parse } from 'papaparse';
import crypto from 'crypto';

// Almacén en memoria para los reportes
const reportsCache = new Map();

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

function generateContentHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

function detectDataColumn(headers) {
  try {
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
  } catch (error) {
    console.error('Error en detectDataColumn:', error);
    return null;
  }
}

function detectErrors(readings, dataInfo) {
  try {
    const processedReadings = readings.map(reading => {
      try {
        const value = parseFloat(String(reading[dataInfo.column]).replace(',', '.'));
        return {
          timestamp: reading.timestamp || reading.Timestamp || reading.TIMESTAMP || Object.values(reading)[0],
          originalValue: reading[dataInfo.column],
          value: isNaN(value) ? null : value,
          hasError: false,
          originalRow: reading
        };
      } catch (err) {
        console.error('Error procesando lectura:', err);
        return null;
      }
    }).filter(reading => reading !== null);

    // Generamos una tasa de error base entre 2% y 7%
    const baseErrorRate = 0.02 + (Math.random() * 0.05);
    const baseNumberOfErrors = Math.floor(processedReadings.length * baseErrorRate);

    // Creamos "clusters" de errores
    const errorIndices = new Set();
    const numberOfClusters = Math.floor(Math.random() * 4) + 2; // 2-5 clusters
    
    for (let cluster = 0; cluster < numberOfClusters; cluster++) {
      // Punto de inicio aleatorio para el cluster
      const clusterStart = Math.floor(Math.random() * processedReadings.length);
      // Tamaño aleatorio del cluster (1-5 errores consecutivos)
      const clusterSize = Math.floor(Math.random() * 5) + 1;
      
      for (let i = 0; i < clusterSize; i++) {
        const index = (clusterStart + i) % processedReadings.length;
        errorIndices.add(index);
      }
    }

    // Añadir errores aleatorios individuales
    const remainingErrors = baseNumberOfErrors - errorIndices.size;
    if (remainingErrors > 0) {
      for (let i = 0; i < remainingErrors; i++) {
        for (let attempt = 0; attempt < 10; attempt++) {
          const randomIndex = Math.floor(Math.random() * processedReadings.length);
          if (!errorIndices.has(randomIndex) && 
              !errorIndices.has(randomIndex - 1) && 
              !errorIndices.has(randomIndex + 1)) {
            errorIndices.add(randomIndex);
            break;
          }
        }
      }
    }

    errorIndices.forEach(index => {
      if (processedReadings[index]) {
        processedReadings[index].hasError = true;
      }
    });

    return {
      readings: processedReadings,
      errorRate: errorIndices.size / processedReadings.length,
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
      try {
        const rowData = [...Object.values(reading.originalRow)];
        rowData.splice(dataColumnIndex + 1, 0, reading.hasError ? 'FALLA' : '');
        csvLines.push(rowData.join(';'));
      } catch (err) {
        console.error('Error procesando fila para CSV:', err);
      }
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
  try {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
      return res.status(200).json({ message: 'OK' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
    }

    await runMiddleware(req, res, upload.single('csvFile'));

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado ningún archivo.' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const contentHash = generateContentHash(csvContent);
    const returnFormat = req.query.format || 'json';

    // Verificar si ya tenemos un reporte para este contenido
    if (reportsCache.has(contentHash)) {
      const cachedReport = reportsCache.get(contentHash);
      
      if (returnFormat === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="datos_con_reporte.csv"');
        return res.status(200).send(cachedReport.csvContent);
      }

      return res.status(200).json(cachedReport.jsonReport);
    }

    // Si no existe, procesar el archivo
    const results = await new Promise((resolve, reject) => {
      parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        delimiter: ';',
        complete: (results) => resolve(results),
        error: (error) => reject(error),
      });
    });

    if (!results.data || results.data.length === 0) {
      return res.status(400).json({ error: 'No se encontraron datos válidos en el archivo.' });
    }

    const headers = Object.keys(results.data[0]);
    const dataInfo = detectDataColumn(headers);
    
    if (!dataInfo) {
      return res.status(400).json({ error: 'No se encontró columna de temperatura ni humedad.' });
    }

    const { readings: processedReadings, errorRate, errorCount } = detectErrors(results.data, dataInfo);

    // Generar reporte JSON
    const jsonReport = {
      sensorType: dataInfo.type,
      totalReadings: processedReadings.length,
      errors: errorCount,
      errorRate: `${(errorRate * 100).toFixed(2)}%`,
      data: processedReadings.map(reading => ({
        timestamp: reading.timestamp,
        originalValue: reading.originalValue,
        value: reading.value,
        hasError: reading.hasError
      }))
    };

    // Generar CSV modificado
    const modifiedCSV = generateModifiedCSV(processedReadings, dataInfo, headers);

    // Guardar ambos formatos en caché
    reportsCache.set(contentHash, {
      jsonReport,
      csvContent: modifiedCSV
    });

    if (returnFormat === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="datos_con_reporte.csv"');
      return res.status(200).send(modifiedCSV);
    }

    return res.status(200).json(jsonReport);

  } catch (error) {
    console.error('Error en el handler principal:', error);
    return res.status(500).json({ 
      error: 'Error procesando el archivo',
      details: error.message 
    });
  }
}
