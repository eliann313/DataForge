import { Table as ArrowTable, tableToIPC, type AsyncRecordBatchStreamReader } from "apache-arrow";

type Runtime = typeof import("parquet-wasm/esm");

/**
 * Convierte batches Arrow a Parquet sin construir una tabla Arrow completa.
 * parquet-wasm solo acepta sus propios RecordBatch; por eso se cruza IPC por
 * batch y se libera la tabla WASM temporal antes de pedir el siguiente batch.
 */
export async function arrowReaderToParquetStream(
  reader: AsyncRecordBatchStreamReader,
  runtime: Runtime,
): Promise<ReadableStream<Uint8Array>> {
  const iterator = reader[Symbol.asyncIterator]();
  const input = new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        const oneBatch = new ArrowTable(next.value);
        const ipc = tableToIPC(oneBatch, "stream");
        const temporary = runtime.Table.fromIPCStream(ipc);
        try {
          const batches = temporary.recordBatches();
          if (batches.length === 0) throw new Error("DuckDB devolvió un batch Arrow vacío.");
          for (const batch of batches) controller.enqueue(batch);
        } finally {
          temporary.free();
        }
      } catch (cause) {
        controller.error(cause);
      }
    },
    async cancel() {
      await iterator.return?.();
      await reader.cancel().catch(() => undefined);
    },
  });

  const writer = new runtime.WriterPropertiesBuilder()
    .setCompression(runtime.Compression.ZSTD)
    .build();
  return runtime.transformParquetStream(input, writer);
}

/** Consume el stream con límite duro y conserva los chunks en un Blob sin concatenarlos en otro buffer. */
export async function readBoundedStreamToBlob(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<{ blob: Blob; byteLength: number }> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("El límite de exportación no es válido.");
  const reader = stream.getReader();
  const chunks: BlobPart[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`El Parquet supera el límite de ${formatMiB(maxBytes)} MiB por dataset.`);
      }
      chunks.push(value as unknown as BlobPart);
    }
  } finally {
    reader.releaseLock();
  }
  return { blob: new Blob(chunks, { type: "application/vnd.apache.parquet" }), byteLength: total };
}

function formatMiB(bytes: number): number { return Math.ceil(bytes / (1024 * 1024)); }
