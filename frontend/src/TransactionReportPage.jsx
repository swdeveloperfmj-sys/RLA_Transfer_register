import React, { useEffect, useState } from "react";
import { FaDownload, FaFilter } from "react-icons/fa";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const itemList = (items, includeRemark = false) => items.length
  ? items.map((item) => <span key={`${item.itemCode}-${item.quantity}`} className={includeRemark ? "held-item" : "report-item"}>{item.itemCode} × {item.quantity}{includeRemark && item.remark ? ` — ${item.remark}` : ""}</span>)
  : <span className="no-items">—</span>;
const pdfEscape = (value) => String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "?");
const downloadPdf = (rows, { label, location }) => {
  const pages = [];
  for (let index = 0; index < rows.length; index += 4) pages.push(rows.slice(index, index + 4));
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`];
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2, contentId = pageId + 1;
    const text = (font, size, x, y, value) => `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`;
    const commands = ["0.05 0.28 0.25 rg 0 790 595 52 re f", "1 1 1 rg", text("F2", 20, 40, 810, "RLA OPERATIONS"), text("F1", 10, 40, 795, "Transaction Report"), "0.14 0.18 0.24 rg", text("F1", 9, 40, 768, `Report period: ${label}`), text("F2", 9, 40, 753, `Sent location: ${location || "All locations"}`), text("F1", 9, 420, 768, `Generated: ${new Date().toLocaleDateString()}`)];
    let y = 726;
    page.forEach((row) => {
      const sent = row.sentItems.map((item) => `${item.itemCode} x ${item.quantity}`).join(", ");
      const held = row.heldItems.map((item) => `${item.itemCode} x ${item.quantity}${item.remark ? ` (${item.remark})` : ""}`).join(", ") || "None";
      commands.push("0.96 0.98 0.98 rg", `40 ${y - 102} 515 96 re f`, "0.78 0.84 0.83 RG 0.5 w", `40 ${y - 102} 515 96 re S`, "0.05 0.28 0.25 rg", text("F2", 10, 52, y - 18, row.referenceNumber), text("F1", 9, 185, y - 18, `${row.sourceLocation}  ->  ${row.destinationLocation}`), text("F2", 8, 52, y - 38, "SENT ITEMS:"), text("F1", 8, 115, y - 38, sent.slice(0, 84)), text("F2", 8, 52, y - 56, "HELD ITEMS:"), text("F1", 8, 115, y - 56, held.slice(0, 84)), text("F2", 8, 52, y - 78, "STATUS:"), text("F1", 8, 115, y - 78, row.status.replaceAll("_", " ").toUpperCase()), text("F1", 8, 390, y - 78, new Date(row.createdAt).toLocaleDateString()));
      y -= 112;
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
  const [mode, setMode] = useState("daily"), [date, setDate] = useState(today), [selectedMonth, setSelectedMonth] = useState(month), [fromDate, setFromDate] = useState(today), [toDate, setToDate] = useState(today), [location, setLocation] = useState(""), [rows, setRows] = useState([]), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const range = () => mode === "daily" ? { from: date, to: date } : mode === "monthly" ? { from: `${selectedMonth}-01`, to: new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).toISOString().slice(0, 10) } : { from: fromDate, to: toDate };
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
    <div className="panel-heading"><span className="eyebrow">SUPER ADMIN REPORT</span><h2>Transaction report</h2><p>Review each transport request, its sent items, held items, and current status.</p></div>
    <div className="report-controls"><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="range">Date range</option></select><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="">All sent locations</option>{locations.map((item) => <option key={item._id} value={item.name}>{item.name}{item.code ? ` (${item.code})` : ""}</option>)}</select>{mode === "daily" ? <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /> : mode === "monthly" ? <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /> : <><input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} /><span>to</span><input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} /></>}<button onClick={load}><FaFilter /> {loading ? "Loading..." : "Apply filter"}</button><button className="pdf-download" disabled={!rows.length} onClick={() => downloadPdf(rows, { label: `${range().from}-to-${range().to}`, location })}><FaDownload /> Download PDF</button></div>
    {error && <div className="error">{error}</div>}
    <div className="transaction-table-wrap"><table className="transaction-table"><thead><tr><th>Transaction no.</th><th>Sent location</th><th>Received location</th><th>Sent items</th><th>Held items</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.referenceNumber}</strong><small>{new Date(row.createdAt).toLocaleDateString()}</small></td><td>{row.sourceLocation}</td><td>{row.destinationLocation}</td><td>{itemList(row.sentItems)}</td><td>{itemList(row.heldItems, true)}</td><td><span className={`transaction-status status-${row.status}`}>{row.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table>{!loading && !rows.length && <p className="transfer-empty">No transactions found for this filter.</p>}</div>
  </section>;
}
