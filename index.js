import { parse } from 'papaparse';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Método no permitido. Usa POST.');
  }

  try {
    // Lee el archivo CSV directamente del body de la solicitud
    const content = req.body;

    // Verificar si el contenido existe
    if (!content) {
      return res.status(400).send('No se ha proporcionado ningún contenido.');
    }

    // Parsear el archivo CSV
    parse(content, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const readings = results.data;
        const headers = Object.keys(readings[0]);

        // Buscar columna de temperatura o humedad
        const temperatureColumn = headers.find(
          (key) =>
            key.includes('Temperatura') ||
            key.includes('Temperature') ||
            key === 'Temperatura_C' // Aquí añadimos tu columna específica
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
        res.status(500).send('Error parseando el archivo: ' + error.message);
      },
    });
  } catch (error) {
    res.status(500).send('Error al procesar la solicitud: ' + error.message);
  }
}
