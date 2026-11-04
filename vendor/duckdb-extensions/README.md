# Extensiones locales de DuckDB-Wasm

Estas extensiones oficiales de DuckDB v1.5.4 para `wasm_eh` corresponden al motor incluido en `@duckdb/duckdb-wasm` 1.33.1-dev57.0. Se conservan aquí para que la importación JSON y Parquet funcione sin descargar código en tiempo de ejecución. Al actualizar el motor, actualizar y verificar ambas extensiones y volver a ejecutar las pruebas de importación.

- Fuente: https://extensions.duckdb.org/v1.5.4/wasm_eh/json.duckdb_extension.wasm — SHA-256 `993b19f7929cc305b2529c548f2842e8e7a5b112d1c88f31c84798b51901ca16`
- Fuente: https://extensions.duckdb.org/v1.5.4/wasm_eh/parquet.duckdb_extension.wasm — SHA-256 `4845705bbd69fc9ad52878d96a505c73cae4a6c509822079cc2413e5eb437f95`
- Código y licencia de DuckDB: https://github.com/duckdb/duckdb/tree/v1.5.4

`npm run vendor:assets` copia los binarios a `public/vendor`; el build estático los publica en el mismo origen que la aplicación.
