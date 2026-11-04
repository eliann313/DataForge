import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertSafeXlsxArchive } from "./xlsx-archive";

const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

function fixture(): Buffer {
  return readFileSync("public/demo-data/sonda.xlsx");
}

function asArrayBuffer(bytes: Buffer): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

/** Agrega un directorio alternativo y un EOCD falso dentro del comentario. */
function withAlternativeDirectory(validFakeEocd: boolean): Buffer {
  const original = fixture();
  const eocd = original.lastIndexOf(eocdSignature);
  const directoryOffset = original.readUInt32LE(eocd + 16);
  const directorySize = original.readUInt32LE(eocd + 12);
  const alternativeDirectory = Buffer.from(original.subarray(directoryOffset, directoryOffset + directorySize));
  const alternativeEocd = Buffer.from(original.subarray(eocd, eocd + 22));
  alternativeEocd.writeUInt32LE(original.length, 16);
  // Con 1 byte declarado pero ausente, fflate selecciona este EOCD aun si es inválido.
  alternativeEocd.writeUInt16LE(validFakeEocd ? 0 : 1, 20);
  original.writeUInt16LE(alternativeDirectory.length + alternativeEocd.length, eocd + 20);
  return Buffer.concat([original, alternativeDirectory, alternativeEocd]);
}

describe("validación del archivo XLSX antes de descomprimir", () => {
  it("acepta un XLSX normal y un comentario ZIP ordinario", () => {
    const bytes = fixture();
    expect(() => assertSafeXlsxArchive(asArrayBuffer(bytes))).not.toThrow();
    const eocd = bytes.lastIndexOf(eocdSignature);
    const comment = Buffer.from("comentario válido");
    bytes.writeUInt16LE(comment.length, eocd + 20);
    expect(() => assertSafeXlsxArchive(asArrayBuffer(Buffer.concat([bytes, comment])))).not.toThrow();
  });

  it("rechaza el EOCD falso que el parser seleccionaría dentro del comentario", () => {
    expect(() => assertSafeXlsxArchive(asArrayBuffer(withAlternativeDirectory(false)))).toThrow(/ambiguo|malformado/);
  });

  it("rechaza dos EOCD válidos y directorios alternativos", () => {
    expect(() => assertSafeXlsxArchive(asArrayBuffer(withAlternativeDirectory(true)))).toThrow(/más de un directorio/);
  });

  it("rechaza un localizador ZIP64 incluso sin campos centinela en el EOCD", () => {
    const bytes = fixture();
    const eocd = bytes.lastIndexOf(eocdSignature);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    const zip64 = Buffer.concat([bytes.subarray(0, eocd), locator, bytes.subarray(eocd)]);
    expect(() => assertSafeXlsxArchive(asArrayBuffer(zip64))).toThrow(/ZIP64/);
  });

  it("rechaza tamaños inconsistentes en entradas sin compresión", () => {
    const bytes = fixture();
    const eocd = bytes.lastIndexOf(eocdSignature);
    const directory = bytes.readUInt32LE(eocd + 16);
    bytes.writeUInt16LE(0, directory + 10);
    bytes.writeUInt32LE(1, directory + 24);
    expect(() => assertSafeXlsxArchive(asArrayBuffer(bytes))).toThrow(/tamaños inconsistentes/);
  });

  it("rechaza expansión superior al límite y archivos truncados", () => {
    const bytes = fixture();
    const eocd = bytes.lastIndexOf(eocdSignature);
    const directory = bytes.readUInt32LE(eocd + 16);
    bytes.writeUInt16LE(0, directory + 10);
    bytes.writeUInt32LE(64 * 1024 * 1024 + 1, directory + 20);
    bytes.writeUInt32LE(64 * 1024 * 1024 + 1, directory + 24);
    expect(() => assertSafeXlsxArchive(asArrayBuffer(bytes))).toThrow(/64 MiB/);
    expect(() => assertSafeXlsxArchive(asArrayBuffer(bytes.subarray(0, 20)))).toThrow(/ZIP XLSX válido/);
  });
});
