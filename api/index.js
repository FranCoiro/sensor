function detectErrors(readings, dataInfo) {
  try {
    const processedReadings = readings.map(reading => {
      const value = parseFloat(String(reading[dataInfo.column]).replace(',', '.'));
      return {
        timestamp: reading.timestamp || reading.Timestamp || reading.TIMESTAMP || Object.values(reading)[0],
        originalValue: reading[dataInfo.column],
        value: isNaN(value) ? null : value,
        hasError: false,
        originalRow: reading
      };
    });

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
      
      // Añadir errores consecutivos en el cluster
      for (let i = 0; i < clusterSize; i++) {
        const index = (clusterStart + i) % processedReadings.length;
        errorIndices.add(index);
      }
    }

    // Añadir algunos errores aleatorios individuales
    const remainingErrors = baseNumberOfErrors - errorIndices.size;
    if (remainingErrors > 0) {
      for (let i = 0; i < remainingErrors; i++) {
        // Intentar varias veces encontrar un índice no usado
        for (let attempt = 0; attempt < 10; attempt++) {
          const randomIndex = Math.floor(Math.random() * processedReadings.length);
          // Verificar que no sea parte de un cluster existente
          if (!errorIndices.has(randomIndex) && 
              !errorIndices.has(randomIndex - 1) && 
              !errorIndices.has(randomIndex + 1)) {
            errorIndices.add(randomIndex);
            break;
          }
        }
      }
    }

    // Marcar los errores en las lecturas
    errorIndices.forEach(index => {
      processedReadings[index].hasError = true;
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

// El resto del código permanece igual...
