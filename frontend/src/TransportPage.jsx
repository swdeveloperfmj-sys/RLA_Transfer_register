import React, { useEffect, useRef, useState } from "react";
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
export default function TransportPage({ user, locations, incoming = false, highlightTransferId = "" }) {
  const [transfers, setTransfers] = useState([]),
    [destinationLocation, setDestination] = useState(""),
    [items, setItems] = useState([{ name: "", quantity: 1 }]),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [workingTransferId, setWorkingTransferId] = useState("");
  const createInFlight = useRef(false);
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
    createInFlight.current = true;
    setCreating(true);
    try {
      await api("/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ destinationLocation, items }),
      });
      setDestination("");
      setItems([{ name: "", quantity: 1 }]);
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
  const visible = incoming
    ? transfers.filter(
        (t) =>
          t.destinationLocation === user.location &&
          ["awaiting_destination", "completed"].includes(t.status),
      )
    : transfers.filter((t) => t.sourceLocation === user.location || headOffice);
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
      {!incoming && !headOffice && (
        <section className="panel transport-form">
          <div className="panel-heading">
            <span className="eyebrow">NEW TRANSFER</span>
            <h2>Create transport request</h2>
            <p>Choose a destination and list every item in this shipment.</p>
          </div>
          <form onSubmit={create}>
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
                    (l) =>
                      l.name.trim().toLowerCase() !== "head office" &&
                      l.name !== user.location,
                  )
                  .map((l) => (
                    <option key={l._id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="items-form-head">
              <span>Item name</span>
              <span>Quantity</span>
            </div>
            {items.map((item, index) => (
              <div className="item-row" key={index}>
                <input
                  placeholder="Enter item name"
                  required
                  value={item.name}
                  onChange={(e) =>
                    setItems(
                      items.map((x, i) =>
                        i === index ? { ...x, name: e.target.value } : x,
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
                        i === index
                          ? { ...x, quantity: Number(e.target.value) }
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
              onClick={() => setItems([...items, { name: "", quantity: 1 }])}
            >
              <FaPlus /> Add another item
            </button>
            <button type="submit" className="send-transfer" disabled={creating}>
              <FaTruckFast /> {creating ? "Sending request…" : "Send request to Head Office"}
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
                : headOffice
                  ? "Invoice requests"
                  : "Transport tracker"}
            </h2>
            <p>
              {headOffice
                ? "Review requests and attach the correct invoice."
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
                  <small>TRANSFER ROUTE</small>
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
                  <div className="transfer-item" key={`${item.name}-${index}`}>
                    <span>{item.name}</span>
                    <strong>{item.quantity}</strong>
                  </div>
                ))}
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
                    href={`${API.replace("/api", "")}${transfer.invoiceFile}`}
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
                {headOffice &&
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
                      <small>PDF, JPG or PNG · Max 10MB</small>
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
