import { MAX_XLSX_UNCOMPRESSED_BYTES } from "../engines/duckdb/csv";

const MAX_XLSX_ENTRIES = 4096;

/** Revisa el directorio central ZIP antes de que el parser descomprima el archivo. */
export function assertSafeXlsxArchive(buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  const firstEocd = Math.max(0, buffer.byteLength - 22 - 0xffff);
  let eocd = -1;

  // fflate busca la primera firma desde el final sin validar el comentario.
  // Validar una firma anterior permitiría que fflate use otro directorio ZIP.
  for (let offset = buffer.byteLength - 22; offset >= firstEocd; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("El archivo no contiene un ZIP XLSX válido.");
  const commentLength = view.getUint16(eocd + 20, true);
  if (eocd + 22 + commentLength !== buffer.byteLength) {
    throw new Error("El XLSX contiene un directorio ZIP ambiguo o malformado.");
  }
  for (let offset = eocd - 1; offset >= firstEocd; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50 &&
        offset + 22 + view.getUint16(offset + 20, true) === buffer.byteLength) {
      throw new Error("El XLSX contiene más de un directorio ZIP válido.");
    }
  }

  // fflate también reconoce un localizador ZIP64 aunque el EOCD ordinario
  // no tenga campos centinela; en ese caso leería otro directorio.
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50) {
    throw new Error("No se admiten archivos XLSX ZIP64.");
  }

  const diskNumber = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);

  if (diskNumber !== 0 || directoryDisk !== 0 || diskEntries !== entryCount) {
    throw new Error("No se admiten archivos XLSX ZIP divididos en varios volúmenes.");
  }
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error("No se admiten archivos XLSX ZIP64.");
  }
  if (entryCount === 0) throw new Error("El XLSX no contiene archivos.");
  if (entryCount > MAX_XLSX_ENTRIES) {
    throw new Error(`El XLSX contiene más de ${MAX_XLSX_ENTRIES} entradas ZIP.`);
  }

  const directoryEnd = directoryOffset + directorySize;
  if (directoryEnd > eocd || directoryEnd > buffer.byteLength) {
    throw new Error("El directorio del XLSX está malformado.");
  }

  let offset = directoryOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("El directorio del XLSX está malformado.");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryDisk = view.getUint16(offset + 34, true);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;

    if (entryEnd > directoryEnd) throw new Error("El directorio del XLSX está malformado.");
    if (entryDisk !== 0) {
      throw new Error("No se admiten archivos XLSX ZIP divididos en varios volúmenes.");
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error("No se admiten archivos XLSX ZIP64.");
    }
    // Para entradas sin compresión fflate copia compressedSize bytes, no
    // uncompressedSize. Ambos tamaños deben coincidir según el formato ZIP.
    if (method === 0 && compressedSize !== uncompressedSize) {
      throw new Error("El XLSX contiene una entrada ZIP con tamaños inconsistentes.");
    }

    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new Error("El XLSX supera el límite de expansión de 64 MiB.");
    }
    offset = entryEnd;
  }
  if (offset !== directoryEnd) throw new Error("El directorio del XLSX está malformado.");
}
