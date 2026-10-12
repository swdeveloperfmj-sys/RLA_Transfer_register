import React, { useEffect, useState } from "react";
import { FaDownload, FaExternalLinkAlt, FaFileInvoice, FaFilter } from "react-icons/fa";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const monthRange = (value) => {
  const [year, monthNumber] = value.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${value}-01`, to: `${value}-${String(lastDay).padStart(2, "0")}` };
};
const statusLabel = (status) => status === "invoice_uploaded" ? "TOG uploaded" : status === "closed" ? "Not Transferable" : status.replaceAll("_", " ");
const documentUrl = (file) => file?.startsWith("http") ? file : `${API.replace("/api", "")}${file}`;
const itemList = (items, includeRemark = false) => items.length
  ? items.map((item) => <span key={`${item.itemCode}-${item.quantity}`} className={includeRemark ? "held-item" : "report-item"}>{item.itemCode} × {item.quantity}{includeRemark && item.remark ? ` — ${item.remark}` : ""}</span>)
  : <span className="no-items">—</span>;
const pdfEscape = (value) => String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "?");
const downloadPdf = (rows, { label, location }) => {
  const pages = [];
  for (let index = 0; index < rows.length; index += 3) pages.push(rows.slice(index, index + 3));
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`];
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2, contentId = pageId + 1;
    const text = (font, size, x, y, value) => `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`;
    const commands = ["0.05 0.28 0.25 rg 0 790 595 52 re f", "1 1 1 rg", text("F2", 20, 40, 810, "RLA OPERATIONS"), text("F1", 10, 40, 795, "Transaction Report"), "0.14 0.18 0.24 rg", text("F1", 9, 40, 768, `Report period: ${label}`), text("F2", 9, 40, 753, `Sent location: ${location || "All locations"}`), text("F1", 9, 420, 768, `Generated: ${new Date().toLocaleDateString()}`)];
    let y = 726;
    page.forEach((row) => {
      const sent = row.sentItems.map((item) => `${item.itemCode} - ${item.itemName || "Unknown product"} x ${item.quantity}`).join(", ");
      const held = row.heldItems.map((item) => `${item.itemCode} - ${item.itemName || "Unknown product"} x ${item.quantity}${item.remark ? ` (${item.remark})` : ""}`).join(", ") || "None";
      commands.push("0.96 0.98 0.98 rg", `40 ${y - 150} 515 144 re f`, "0.78 0.84 0.83 RG 0.5 w", `40 ${y - 150} 515 144 re S`, "0.05 0.28 0.25 rg", text("F2", 10, 52, y - 18, row.referenceNumber), text("F1", 9, 185, y - 18, `${row.sourceLocation}  ->  ${row.destinationLocation}`), text("F2", 8, 52, y - 42, "SENT ITEMS:"), text("F1", 8, 115, y - 42, sent.slice(0, 78)), text("F2", 8, 52, y - 70, "HELD ITEMS:"), text("F1", 8, 115, y - 70, held.slice(0, 78)), text("F2", 8, 52, y - 104, "STATUS:"), text("F1", 8, 115, y - 104, statusLabel(row.status).toUpperCase()), text("F1", 8, 390, y - 104, new Date(row.createdAt).toLocaleDateString()));
      y -= 176;
    });
    commands.push("0.35 0.4 0.46 rg", text("F1", 8, 40, 28, "RLA Operations - Confidential internal report"), text("F1", 8, 510, 28, `Page ${index + 1} of ${pages.length}`));
    const content = commands.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let pdf = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a"); link.href = url; link.download = `transactions-${location || "all-locations"}-${label}.pdf`; link.click(); URL.revokeObjectURL(url);
};

export default function TransactionReportPage({ locations = [] }) {
  const [mode, setMode] = useState("daily"), [date, setDate] = useState(today), [selectedMonth, setSelectedMonth] = useState(month), [fromDate, setFromDate] = useState(today), [toDate, setToDate] = useState(today), [location, setLocation] = useState(""), [rows, setRows] = useState([]), [error, setError] = useState(""), [loading, setLoading] = useState(false), [expandedId, setExpandedId] = useState("");
  const range = () => mode === "daily" ? { from: date, to: date } : mode === "monthly" ? monthRange(selectedMonth) : { from: fromDate, to: toDate };
  const load = async () => {
    setLoading(true); setError("");
    try {
      const { from, to } = range(), params = new URLSearchParams({ from, to }), token = localStorage.getItem("token");
      if (location) params.set("location", location);
      const response = await fetch(`${API}/transfers/reports/transactions?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load the transaction report.");
      setRows(data);
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [mode, date, selectedMonth, fromDate, toDate, location]);
  return <section className="transaction-report">
    <div className="panel-heading"><span className="eyebrow">OPERATIONS REPORT</span><h2>Transaction report</h2><p>Review each transfer request, its sent items, held items, and current status.</p></div>
    <div className="report-controls"><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="range">Date range</option></select><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="">All sent locations</option>{locations.map((item) => <option key={item._id} value={item.name}>{item.name}{item.code ? ` (${item.code})` : ""}</option>)}</select>{mode === "daily" ? <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /> : mode === "monthly" ? <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /> : <><input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} /><span>to</span><input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} /></>}<button onClick={load}><FaFilter /> {loading ? "Loading..." : "Apply filter"}</button><button className="pdf-download" disabled={!rows.length} onClick={() => downloadPdf(rows, { label: `${range().from}-to-${range().to}`, location })}><FaDownload /> Download PDF</button></div>
    {error && <div className="error">{error}</div>}
    <div className="report-summary-wrap">
      <div className="report-table-scroll">
      <table className="report-summary-table">
        <thead><tr><th>Transaction no.</th><th>Route</th><th>Items</th><th>Held</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>{rows.map((row) => <React.Fragment key={row.id}>
          <tr className="report-summary-row" onDoubleClick={() => setExpandedId(expandedId === row.id ? "" : row.id)} title="Double-click to view full details">
            <td><strong>{row.referenceNumber}</strong></td><td>{row.sourceLocation} → {row.destinationLocation}</td><td>{row.sentItems.length}</td><td>{row.heldItems.length}</td><td><span className={`transaction-status status-${row.status}`}>{statusLabel(row.status)}</span></td><td>{new Date(row.createdAt).toLocaleDateString()}</td>
          </tr>
          {expandedId === row.id && <tr className="report-detail-row"><td colSpan="6"><div className="report-detail report-detail-wide">
            <div className="report-item-details"><b>Item details</b><div className="report-item-detail-table"><table><thead><tr><th>Item code</th><th>Item name</th><th>Qty.</th><th>Review</th></tr></thead><tbody>{row.sentItems.map((item, index) => <tr key={`${item.itemCode}-${index}`}><td>{item.itemCode}</td><td>{item.itemName || "Not found in Product Master"}</td><td>{item.quantity}</td><td>{item.remark ? <span className="held-item">On hold — {item.remark}</span> : "Sent"}</td></tr>)}</tbody></table></div></div>
            <div><b>Created</b><span>{new Date(row.createdAt).toLocaleString()}</span></div><div><b>TOG document</b>{row.togFile ? <a className="report-tog-view" href={documentUrl(row.togFile)} target="_blank" rel="noreferrer"><FaFileInvoice /> View TOG{row.togOriginalName ? `: ${row.togOriginalName}` : ""} <FaExternalLinkAlt /></a> : <span className="no-items">No TOG uploaded</span>}</div>
          </div></td></tr>}
        </React.Fragment>)}</tbody>
      </table>
      </div>
      {!loading && !rows.length && <p className="transfer-empty">No transactions found for this filter.</p>}
      <p className="report-expand-hint">Double-click a row to show or hide its full details.</p>
      <details className="status-help"><summary aria-label="Transaction status help" title="Status help">?</summary><div className="status-help-card"><strong>Transaction status guide</strong><dl><div><dt>Awaiting head office</dt><dd>Waiting for Head Office review.</dd></div><div><dt>TOG uploaded</dt><dd>The TOG document has been attached.</dd></div><div><dt>Awaiting destination</dt><dd>Dispatched and waiting for destination receipt.</dd></div><div><dt>Completed</dt><dd>Received by the destination.</dd></div><div><dt>Not Transferable</dt><dd>The transfer cannot proceed.</dd></div></dl></div></details>
    </div>
  </section>;
}
