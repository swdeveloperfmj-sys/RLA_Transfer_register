import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  FaArrowRight,
  FaBoxOpen,
  FaCheck,
  FaCloudArrowUp,
  FaFileInvoice,
  FaPlus,
  FaTrashCan,
  FaTruckFast,
} from "react-icons/fa6";
const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.message || "Request failed.");
  return data;
}
export default function TransportPage({ user, locations, incoming = false, invoiceRequests = false, highlightTransferId = "" }) {
  const [transfers, setTransfers] = useState([]),
    [destinationLocation, setDestination] = useState(""),
    [items, setItems] = useState([{ itemCode: "", quantity: 1 }]),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [workingTransferId, setWorkingTransferId] = useState("");
  const [holdRemarks, setHoldRemarks] = useState({});
  const [holdSelections, setHoldSelections] = useState({});
  const [requestMode, setRequestMode] = useState("manual");
  const [sheetRows, setSheetRows] = useState([]);
  const createInFlight = useRef(false);
  const downloadTemplate = () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Item code", "Quantity"],
      ["ITEM-001", 1],
      ["ITEM-002", 5],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Transfer items");
    XLSX.writeFile(workbook, "rla-transfer-items-template.xlsx");
  };
  const importSpreadsheet = async (file) => {
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please upload an XLSX (.xlsx) file.");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
      const normalize = (value) => String(value).trim().toLowerCase().replace(/[\s_-]/g, "");
      const headers = rows[0] || [];
      const itemCodeColumn = headers.findIndex((header) => normalize(header) === "itemcode");
      const quantityColumn = headers.findIndex((header) => ["quantity", "qty"].includes(normalize(header)));
      if (itemCodeColumn < 0 || quantityColumn < 0) {
        throw new Error("The XLSX sheet must contain Item code and Quantity columns.");
      }
      const preview = rows.slice(1).map((row, index) => {
        const itemCode = String(row[itemCodeColumn] ?? "").trim();
        const rawQuantity = row[quantityColumn];
        const quantity = Number(rawQuantity);
        const emptyQuantity = rawQuantity === "" || rawQuantity === null || rawQuantity === undefined;
        if (!itemCode && emptyQuantity) {
          return { rowNumber: index + 2, itemCode: "—", quantity: "—", status: "skipped", reason: "Blank row skipped" };
        }
        if (!itemCode || !Number.isFinite(quantity) || quantity < 1) {
          return { rowNumber: index + 2, itemCode: itemCode || "—", quantity: emptyQuantity ? "—" : rawQuantity, status: "rejected", reason: "Enter a valid item code and quantity" };
        }
        return { rowNumber: index + 2, itemCode, quantity, status: "accepted", reason: "Ready to send" };
      });
      if (!preview.length) throw new Error("The XLSX sheet has no item rows.");
      setSheetRows(preview);
      setItems(preview.filter((row) => row.status === "accepted").map((row) => ({ itemCode: row.itemCode, quantity: row.quantity })));
      setError("");
    } catch (e) {
      setSheetRows([]);
      setItems([]);
      setError(e.message || "Could not read the XLSX file.");
    }
  };
  const removeSheetRow = (rowNumber) => {
    setSheetRows((current) => {
      const remaining = current.filter((row) => row.rowNumber !== rowNumber);
      setItems(remaining.filter((row) => row.status === "accepted").map((row) => ({ itemCode: row.itemCode, quantity: row.quantity })));
      return remaining;
    });
  };
  const headOffice = user.location?.trim().toLowerCase() === "head office";
  const load = async () => {
    try {
      setTransfers(await api("/transfers"));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const create = async (event) => {
    event.preventDefault();
    if (createInFlight.current) return;
    if (requestMode === "excel" && !sheetRows.length) { setError("Upload an XLSX sheet first."); return; }
    const validItems = items
      .filter((item) => item.itemCode?.trim() && Number(item.quantity) >= 1)
      .map((item) => ({ ...item, itemCode: item.itemCode.trim() }));
    if (!validItems.length) { setError("Enter at least one item code and quantity."); return; }
    createInFlight.current = true;
    setCreating(true);
    try {
      await api("/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ destinationLocation, items: validItems }),
      });
      setDestination("");
      setItems([{ itemCode: "", quantity: 1 }]);
      setSheetRows([]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  };
  const action = async (id, type) => {
    if (workingTransferId) return;
    setWorkingTransferId(id);
    try {
      await api(`/transfers/${id}/${type}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorkingTransferId("");
    }
  };
  const uploadInvoice = async (id, file) => {
    if (!file || workingTransferId) return;
    setWorkingTransferId(id);
    const data = new FormData();
    data.append("invoice", file);
    try {
      await api(`/transfers/${id}/invoice`, { method: "POST", body: data });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorkingTransferId("");
    }
  };
  const holdItems = async (transferId) => {
    if (workingTransferId) return;
    const itemIndexes = holdSelections[transferId] || [];
    const holdRemark = holdRemarks[transferId] || "";
    if (!itemIndexes.length || !holdRemark.trim()) {
      setError("Select at least one item and add a hold remark.");
      return;
    }
    setWorkingTransferId(transferId);
    try {
      await api(`/transfers/${transferId}/items/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndexes, holdRemark }),
      });
      setHoldSelections((current) => ({ ...current, [transferId]: [] }));
      setHoldRemarks((current) => ({ ...current, [transferId]: "" }));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorkingTransferId("");
    }
  };
  const visible = incoming
    ? transfers.filter(
        (t) =>
          t.destinationLocation === user.location &&
          ["awaiting_destination", "completed"].includes(t.status),
      )
    : invoiceRequests
      ? transfers.filter((t) => ["awaiting_head_office", "invoice_uploaded"].includes(t.status))
      : transfers.filter((t) => t.sourceLocation === user.location);
  const statusLabels = {
    awaiting_head_office: "Waiting for invoice",
    invoice_uploaded: "Invoice ready",
    awaiting_destination: "In transit",
    completed: "Completed",
  };
  const statusSteps = {
    awaiting_head_office: 1,
    invoice_uploaded: 2,
    awaiting_destination: 3,
    completed: 4,
  };
  return (
    <section className="transport-page">
      {error && <div className="error">{error}</div>}
      {!incoming && !invoiceRequests && (
        <section className="panel transport-form">
          <div className="panel-heading">
            <span className="eyebrow">NEW TRANSFER</span>
            <h2>Create transport request</h2>
            <p>Choose a destination and list every item in this shipment.</p>
          </div>
          <form onSubmit={create}>
            <div className="request-mode-tabs"><button type="button" className={requestMode === "manual" ? "active" : ""} onClick={() => setRequestMode("manual")}>Manual entry</button><button type="button" className={requestMode === "excel" ? "active" : ""} onClick={() => setRequestMode("excel")}>Spreadsheet</button></div>
            <label>
              Destination location
              <select
                required
                value={destinationLocation}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">Select destination</option>
                {locations
                  .filter(
                    (l) => l.name !== user.location,
                  )
                  .map((l) => (
                    <option key={l._id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
            {requestMode === "excel" ? <>
              <div className="excel-actions">
                <label className="excel-file-picker"><FaCloudArrowUp /> Upload XLSX sheet
                  <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => importSpreadsheet(e.target.files?.[0])} />
                </label>
                <button type="button" className="template-download" onClick={downloadTemplate}><FaFileInvoice /> Download XLSX template</button>
              </div>
              <p className="spreadsheet-help">Use the template with <strong>Item code</strong> and <strong>Quantity</strong> columns. Only accepted rows will be sent.</p>
              {sheetRows.length > 0 && <div className="sheet-preview">
                <div className="sheet-preview-head"><span>Row</span><span>Item code</span><span>Quantity</span><span>Status</span><span>Action</span></div>
                {sheetRows.map((row) => <div className={`sheet-preview-row ${row.status}`} key={row.rowNumber}>
                  <span>{row.rowNumber}</span><span>{row.itemCode}</span><span>{row.quantity}</span><span><b>{row.status}</b><small>{row.reason}</small></span><button type="button" className="remove-sheet-row" onClick={() => removeSheetRow(row.rowNumber)} aria-label={`Remove row ${row.rowNumber}`} title="Remove row"><FaTrashCan /></button>
                </div>)}
              </div>}
            </> : <>
            <div className="items-form-head"><span>Item code</span><span>Quantity</span></div>
            {items.map((item, index) => (
              <div className={`item-row ${requestMode === "excel" ? "spreadsheet-row" : ""}`} key={index}>
                <input
                  placeholder="Enter item code"
                  value={item.itemCode}
                  onChange={(e) =>
                    setItems(
                      items.map((x, i) =>
                        i === index ? { ...x, itemCode: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    setItems(
                      items.map((x, i) =>
                        i === index ? { ...x, quantity: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
                {index > 0 && (
                  <button
                    type="button"
                    className="remove-item"
                    aria-label={`Remove item ${index + 1}`}
                    title="Remove item"
                    onClick={() =>
                      setItems(items.filter((_, i) => i !== index))
                    }
                  >
                    <FaTrashCan />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="add-item"
              onClick={() => setItems([...items, { itemCode: "", quantity: 1 }])}
            >
              <FaPlus /> Add another item
            </button>
            </>}
            <button type="submit" className="send-transfer" disabled={creating}>
              <FaTruckFast /> {creating ? "Sending request…" : "Send transport request"}
            </button>
          </form>
        </section>
      )}
      <section className="transfer-workspace">
        <div className="transfer-heading">
          <div>
            <span className="eyebrow">OPERATIONS</span>
            <h2>
              {incoming
                ? "Incoming transports"
                : invoiceRequests
                  ? "Invoice requests"
                  : "Transport tracker"}
            </h2>
            <p>
              {invoiceRequests
                ? "Review location requests and attach the correct invoice."
                : "Track each request from approval to delivery."}
            </p>
          </div>
          <div className="transfer-count">
            <FaTruckFast />
            <strong>{visible.length}</strong>
            <span>Requests</span>
          </div>
        </div>
        <div className="transfer-list">
          {visible.map((transfer) => (
            <article className={`transfer-card ${highlightTransferId === transfer._id ? "transfer-highlight" : ""}`} key={transfer._id}>
              <div className="transfer-card-top">
                <div className="route-icon">
                  <FaTruckFast />
                </div>
                <div className="route-copy">
                  <small>{transfer.referenceNumber || "TRANSFER ROUTE"}</small>
                  <strong>
                    {transfer.sourceLocation}
                    <FaArrowRight />
                    {transfer.destinationLocation}
                  </strong>
                  <span>
                    {new Date(transfer.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <em className={`transfer-status status-${transfer.status}`}>
                  {statusLabels[transfer.status]}
                </em>
              </div>
              <div className="transfer-items">
                <div className="items-title">
                  <FaBoxOpen /> Items in this request
                </div>
                {transfer.items.map((item, index) => (
                  <div className={`transfer-item ${item.reviewStatus === "held" ? "is-held" : ""}`} key={`${item.itemCode || item.name}-${index}`}>
                    {headOffice && invoiceRequests && transfer.status !== "invoice_uploaded" && <input className="hold-select" type="checkbox" checked={(holdSelections[transfer._id] || []).includes(index)} disabled={Boolean(workingTransferId) || transfer.items.some((entry) => entry.reviewStatus === "held")} onChange={(event) => setHoldSelections((current) => ({ ...current, [transfer._id]: event.target.checked ? [...(current[transfer._id] || []), index] : (current[transfer._id] || []).filter((selected) => selected !== index) }))} aria-label={`Select ${item.itemCode || item.name} to hold`} />}
                    <span>
                      {item.itemCode || item.name}
                      {item.reviewStatus === "held" && <small className="item-held">On hold: {item.holdRemark}</small>}
                      {item.reviewStatus === "approved" && <small className="item-approved">Approved</small>}
                    </span>
                    <strong>{item.quantity}</strong>
                  </div>
                ))}
                {headOffice && invoiceRequests && transfer.status !== "invoice_uploaded" && <div className="hold-batch-actions">
                  <input value={holdRemarks[transfer._id] || ""} onChange={(event) => setHoldRemarks((current) => ({ ...current, [transfer._id]: event.target.value }))} placeholder="Hold remark for selected items" disabled={Boolean(workingTransferId) || transfer.items.some((item) => item.reviewStatus === "held")} />
                  <button type="button" className="hold-item" disabled={Boolean(workingTransferId) || transfer.items.some((item) => item.reviewStatus === "held")} onClick={() => holdItems(transfer._id)}>Hold selected ({(holdSelections[transfer._id] || []).length})</button>
                </div>}
              </div>
              <div className="transfer-progress">
                <span
                  className={statusSteps[transfer.status] >= 1 ? "done" : ""}
                >
                  Requested
                </span>
                <i
                  className={statusSteps[transfer.status] >= 2 ? "done" : ""}
                ></i>
                <span
                  className={statusSteps[transfer.status] >= 2 ? "done" : ""}
                >
                  Invoice
                </span>
                <i
                  className={statusSteps[transfer.status] >= 3 ? "done" : ""}
                ></i>
                <span
                  className={statusSteps[transfer.status] >= 3 ? "done" : ""}
                >
                  In transit
                </span>
                <i
                  className={statusSteps[transfer.status] >= 4 ? "done" : ""}
                ></i>
                <span
                  className={statusSteps[transfer.status] >= 4 ? "done" : ""}
                >
                  Received
                </span>
              </div>
              <div className="transfer-actions">
                {transfer.invoiceFile ? (
                  <a
                    href={transfer.invoiceFile.startsWith("http") ? transfer.invoiceFile : `${API.replace("/api", "")}${transfer.invoiceFile}`}
                    target="_blank"
                    rel="noreferrer"
                    className="invoice-view"
                  >
                    <FaFileInvoice /> View invoice
                  </a>
                ) : (
                  <span className="invoice-pending">
                    <FaFileInvoice /> Invoice pending
                  </span>
                )}
                {headOffice && invoiceRequests &&
                  ["awaiting_head_office", "invoice_uploaded"].includes(
                    transfer.status,
                  ) && (
                    <label className={`invoice-upload ${workingTransferId === transfer._id ? "is-busy" : ""}`}>
                      <FaCloudArrowUp />
                      <span>
                        {transfer.invoiceFile
                          ? "Replace invoice"
                          : "Upload invoice"}
                      </span>
                      <small>PDF, JPG or PNG · Max 4MB</small>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        disabled={Boolean(workingTransferId)}
                        onChange={(e) =>
                          uploadInvoice(transfer._id, e.target.files?.[0])
                        }
                      />
                    </label>
                  )}
                {transfer.sourceLocation === user.location &&
                  transfer.status === "invoice_uploaded" && (
                  <button disabled={Boolean(workingTransferId)} onClick={() => action(transfer._id, "dispatch")}>
                    <FaTruckFast /> {workingTransferId === transfer._id ? "Working…" : "Confirm dispatch"}
                    </button>
                  )}
                {incoming && transfer.status === "awaiting_destination" && (
                  <button disabled={Boolean(workingTransferId)} onClick={() => action(transfer._id, "receive")}>
                    <FaCheck /> {workingTransferId === transfer._id ? "Working…" : "Accept received items"}
                  </button>
                )}
              </div>
            </article>
          ))}
          {!visible.length && (
            <div className="transfer-empty">
              <FaTruckFast />
              <h3>No transport records</h3>
              <p>New requests will appear here.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
