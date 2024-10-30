import getRawBody from 'raw-body';
import { parse } from 'papaparse';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Método no permitido. Usa POST.');
  }

  try {
    // Obtener el contenido del archivo CSV del cuerpo de la solicitud
    const content = await getRawBody(req, {
      encoding: 'utf-8',
    });

    console.log("Contenido recibido:", content); // Para depurar: verificar el contenido recibido

    // Parsear el archivo CSV
    parse(content, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const readings = results.data;

        if (readings.length === 0) {
          return res.status(400).send('No se encontraron datos válidos en el archivo.');
        }

        const headers = Object.keys(readings[0]);
        console.log("Encabezados detectados:", headers); // Para depurar: ver qué encabezados detecta

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

        console.log("Columna de datos detectada:", dataInfo); // Para depurar: ver qué columna detectó

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
  } catch (error) {
    console.error('Error al procesar la solicitud:', error.message);
    res.status(500).send('Error al procesar la solicitud: ' + error.message);
  }
}
