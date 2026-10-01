import React, { useEffect, useState } from "react";
import { FaDownload, FaFilter, FaPauseCircle } from "react-icons/fa";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const monthRange = (value) => {
  const [year, monthNumber] = value.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${value}-01`, to: `${value}-${String(lastDay).padStart(2, "0")}` };
};

const pdfEscape = (value) => String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "?");
const groupRows = (rows) => Object.values(rows.reduce((groups, row) => {
  const key = String(row.transferId);
  if (!groups[key]) groups[key] = { ...row, items: [] };
  groups[key].items.push(row);
  return groups;
}, {}));
const downloadPdf = (rows, label, location = "") => {
  const jobs = groupRows(rows), pages = [];
  for (let index = 0; index < jobs.length; index += 6) pages.push(jobs.slice(index, index + 6));
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`];
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2, contentId = pageId + 1;
    const text = (font, size, x, y, value) => `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`;
    const commands = ["0.06 0.34 0.29 rg 0 790 595 52 re f", "1 1 1 rg", text("F2", 20, 40, 810, "RLA OPERATIONS"), text("F1", 10, 40, 795, "Held Transport Items Report"), "0.15 0.18 0.24 rg", text("F1", 9, 40, 768, `Report period: ${label}`), text("F1", 9, 40, 753, `Sent location: ${location || "All locations"}`), text("F1", 9, 430, 768, `Generated: ${new Date().toLocaleDateString()}`), "0.06 0.34 0.29 rg 40 730 515 22 re f", "1 1 1 rg", text("F2", 8, 48, 738, "JOB / ROUTE"), text("F2", 8, 200, 738, "HELD ITEMS"), text("F2", 8, 355, 738, "HELD BY"), text("F2", 8, 465, 738, "DATE")];
    let y = 730;
    page.forEach((job, rowIndex) => {
      const rowHeight = 72, items = job.items.map((item) => `${item.itemCode} x ${item.quantity}`).join(", ");
      y -= rowHeight;
      commands.push(rowIndex % 2 ? "0.96 0.98 0.97 rg" : "1 1 1 rg", `40 ${y} 515 ${rowHeight} re f`, "0.78 0.83 0.82 RG 0.5 w", `40 ${y} 515 ${rowHeight} re S`);
      commands.push("0.15 0.18 0.24 rg", text("F2", 8, 48, y + 53, `${job.sourceLocation} -> ${job.destinationLocation}`), text("F1", 8, 48, y + 40, `Requested: ${job.requestedBy?.name || "Unknown"}`), text("F1", 8, 200, y + 53, items.slice(0, 38)), text("F1", 8, 355, y + 53, (job.heldBy?.name || "Unknown").slice(0, 17)), text("F1", 8, 465, y + 53, new Date(job.heldAt).toLocaleDateString()), text("F2", 8, 200, y + 32, "Remark:"), text("F1", 8, 245, y + 32, job.holdRemark.slice(0, 48)));
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
  const link = document.createElement("a"); link.href = url; link.download = `held-items-${label.replace(/[^a-z0-9]/gi, "-")}.pdf`; link.click(); URL.revokeObjectURL(url);
};

export default function HoldReportPage({ locations = [] }) {
  const [mode, setMode] = useState("daily"), [date, setDate] = useState(today), [selectedMonth, setSelectedMonth] = useState(month), [fromDate, setFromDate] = useState(today), [toDate, setToDate] = useState(today), [location, setLocation] = useState(""), [rows, setRows] = useState([]), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const range = () => mode === "daily" ? { from: date, to: date, label: date } : mode === "monthly" ? { ...monthRange(selectedMonth), label: selectedMonth } : { from: fromDate, to: toDate, label: `${fromDate}-to-${toDate}` };
  const load = async () => {
    setLoading(true); setError("");
    try {
      const { from, to } = range(), token = localStorage.getItem("token");
      const params = new URLSearchParams({ from, to });
      if (location) params.set("location", location);
      const response = await fetch(`${API}/transfers/reports/held-items?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not load the report."); setRows(data);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [mode, date, selectedMonth, fromDate, toDate, location]);
  return <section className="hold-report">
    <div className="panel-heading"><span className="eyebrow">SUPER ADMIN REPORT</span><h2>Held transport items</h2><p>Review held items, who placed them on hold, and the stated reason.</p></div>
    <div className="report-controls"><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="range">Date range</option></select><select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Filter by sent location"><option value="">All sent locations</option>{locations.map((item) => <option key={item._id} value={item.name}>{item.name}{item.code ? ` (${item.code})` : ""}</option>)}</select>{mode === "daily" ? <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /> : mode === "monthly" ? <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} /> : <><input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} /><span>to</span><input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} /></>}<button onClick={load}><FaFilter /> {loading ? "Loading…" : "Apply filter"}</button><button className="pdf-download" disabled={!rows.length} onClick={() => downloadPdf(rows, range().label, location)}><FaDownload /> Download PDF</button></div>
    {error && <div className="error">{error}</div>}
    <div className="held-report-list">{groupRows(rows).map((job) => <article key={job.transferId}><div><FaPauseCircle /><strong>{job.sourceLocation} → {job.destinationLocation}</strong><span>Requested by: {job.requestedBy?.name || "Unknown"}</span></div><div className="held-job-items">{job.items.map((item) => <span key={`${item.itemCode}-${item.quantity}`}>{item.itemCode} <b>× {item.quantity}</b></span>)}</div><p><b>Held by:</b> {job.heldBy?.name || "Unknown"}<br /><b>Held at:</b> {new Date(job.heldAt).toLocaleString()}<br /><b>Remark:</b> {job.holdRemark}</p></article>)}{!loading && !rows.length && <p className="transfer-empty">No held items for this period.</p>}</div>
  </section>;
}
