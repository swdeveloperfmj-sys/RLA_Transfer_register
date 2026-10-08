import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";

const normalizeHeader = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeCode = (value) => String(value ?? "").trim().toUpperCase();

export default function MasterProductsPage({ request }) {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [stagedProducts, setStagedProducts] = useState([]);
  const [fileSummary, setFileSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    request(`/master-products?page=${page}&limit=50&search=${encodeURIComponent(appliedSearch)}`)
      .then((data) => {
        setProducts(data.products);
        setTotal(data.total);
        setPages(data.pages);
      })
      .catch((loadError) => setError(loadError.message));
  }, [page, appliedSearch, request]);

  const readWorkbook = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setMessage("");
    setStagedProducts([]);
    setFileSummary(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const unique = new Map();
      let validRows = 0;
      let invalidRows = 0;
      let duplicateRows = 0;
      let matchedSheets = 0;

      workbook.SheetNames.forEach((sheetName) => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
        let headerIndex = -1;
        let codeIndex = -1;
        let nameIndex = -1;
        for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
          const headers = rows[index].map(normalizeHeader);
          const foundCode = headers.indexOf("productcode");
          const foundName = headers.indexOf("productname");
          if (foundCode >= 0 && foundName >= 0) {
            headerIndex = index;
            codeIndex = foundCode;
            nameIndex = foundName;
            break;
          }
        }
        if (headerIndex < 0) return;
        matchedSheets += 1;
        rows.slice(headerIndex + 1).forEach((row) => {
          const productCode = String(row[codeIndex] ?? "").trim();
          const productName = String(row[nameIndex] ?? "").trim();
          if (!productCode && !productName) return;
          if (!productCode || !productName) { invalidRows += 1; return; }
          validRows += 1;
          const key = normalizeCode(productCode);
          if (unique.has(key)) { duplicateRows += 1; return; }
          unique.set(key, { productCode, productName });
        });
      });

      if (!matchedSheets) throw new Error("The workbook does not contain ProductCode and ProductName columns.");
      const nextProducts = [...unique.values()];
      if (!nextProducts.length) throw new Error("No valid product rows were found in the workbook.");
      setStagedProducts(nextProducts);
      setFileSummary({ fileName: file.name, sheets: matchedSheets, validRows, uniqueRows: nextProducts.length, duplicateRows, invalidRows });
    } catch (readError) {
      setError(readError.message || "Could not read this Excel file.");
      event.target.value = "";
    }
  };

  const importProducts = async () => {
    if (!stagedProducts.length) return;
    setBusy(true);
    setProgress(0);
    setError("");
    setMessage("");
    const totals = { added: 0, updated: 0, existing: 0 };
    try {
      const batchSize = 500;
      for (let start = 0; start < stagedProducts.length; start += batchSize) {
        const batch = stagedProducts.slice(start, start + batchSize);
        const result = await request("/master-products/import", { method: "POST", body: JSON.stringify({ products: batch }) });
        totals.added += result.added;
        totals.updated += result.updated;
        totals.existing += result.existing;
        setProgress(Math.min(100, Math.round(((start + batch.length) / stagedProducts.length) * 100)));
      }
      setMessage(`${totals.added.toLocaleString()} products added, ${totals.updated.toLocaleString()} updated, and ${totals.existing.toLocaleString()} already unchanged.`);
      setStagedProducts([]);
      setFileSummary(null);
      setPage(1);
      const data = await request(`/master-products?page=1&limit=50&search=${encodeURIComponent(appliedSearch)}`);
      setProducts(data.products);
      setTotal(data.total);
      setPages(data.pages);
    } catch (importError) {
      setError(importError.message || "Could not import the products.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="master-products-page">
    <section className="panel master-product-import">
      <div className="panel-heading"><span className="eyebrow">PRODUCT MASTER</span><h2>Import master products</h2><p>Upload an XLSX file containing ProductCode and ProductName columns. Duplicate product codes are imported once.</p></div>
      <div className="master-upload-area">
        <label className="master-file-picker"><input type="file" accept=".xlsx,.xls" onChange={readWorkbook} disabled={busy} /><span>Select Excel file</span><small>Supported formats: .xlsx and .xls</small></label>
        {fileSummary && <div className="master-file-summary"><div><small>File</small><strong>{fileSummary.fileName}</strong></div><div><small>Valid rows</small><strong>{fileSummary.validRows.toLocaleString()}</strong></div><div><small>Unique products</small><strong>{fileSummary.uniqueRows.toLocaleString()}</strong></div><div><small>Duplicates skipped</small><strong>{fileSummary.duplicateRows.toLocaleString()}</strong></div><div><small>Invalid rows</small><strong>{fileSummary.invalidRows.toLocaleString()}</strong></div></div>}
        {fileSummary && <div className="master-import-actions"><div><span>Only ProductCode and ProductName will be saved.</span>{busy && <progress max="100" value={progress}>{progress}%</progress>}</div><button type="button" disabled={busy} onClick={importProducts}>{busy ? `Importing ${progress}%` : `Import ${fileSummary.uniqueRows.toLocaleString()} products`}</button></div>}
        {error && <div className="error">{error}</div>}
        {message && <div className="master-import-success">{message}</div>}
      </div>
    </section>

    <section className="panel master-product-list">
      <div className="master-list-heading"><div><h2>Master products</h2><p>{total.toLocaleString()} unique products saved</p></div><form onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()); }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code or product name" /><button>Search</button></form></div>
      <div className="master-product-table-wrap"><table><thead><tr><th>Product code</th><th>Product name</th></tr></thead><tbody>{products.map((product) => <tr key={product._id}><td><strong>{product.productCode}</strong></td><td>{product.productName}</td></tr>)}</tbody></table>{!products.length && <p className="master-products-empty">No master products found.</p>}</div>
      <div className="master-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button></div>
    </section>
  </section>;
}
