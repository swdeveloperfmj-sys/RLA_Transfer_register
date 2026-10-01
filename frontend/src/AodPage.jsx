import React, { useState } from "react";
import fmjHoldingsLogo from "../assets/FMJ Holdings Logo_.jpg";
import rlLogo from "../assets/rllogo.png";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const blankItem = { code: "", description: "", packaging: "Nos", quantity: 1 };

export default function AodPage({ user, locations }) {
  const [form, setForm] = useState({
    number: "",
    customerName: "",
    customerAddress: "",
    from: user.location || "",
    to: "",
    dispatchedBy: user.name,
    items: [{ ...blankItem }],
  });
  const [generated, setGenerated] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setField = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));
  const setItem = (index, field, value) =>
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  const removeItem = (index) =>
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  const generate = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${API}/aods${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Could not generate AOD.");
      setGenerated(data);
      setEditingId(null);
    } catch (generateError) {
      setError(generateError.message);
    } finally {
      setBusy(false);
    }
  };

  if (generated)
    return (
      <section className="aod-result-page">
        <div className="aod-result-actions">
          <button
            onClick={() => {
              setForm({
                number: generated.number,
                customerName: generated.customerName,
                customerAddress: generated.customerAddress || "",
                from: generated.from,
                to: generated.to,
                dispatchedBy: generated.dispatchedBy,
                items: generated.items.map((item) => ({
                  code: item.code || "",
                  description: item.description || "",
                  packaging: item.packaging || "",
                  quantity: item.quantity,
                })),
              });
              setEditingId(generated._id);
              setGenerated(null);
            }}
          >
            Edit details
          </button>
          <button onClick={() => window.print()}>Print AOD</button>
        </div>
        <article className="aod-sheet">
          <div className="aod-sheet-top">
            <section className="aod-company-block">
              <h2>FMJ Plastics (Pvt) Ltd.</h2>
              <p>
                289 Galle Road, Henamulla,
                <br />
                Panadura, 12550, Sri Lanka.
              </p>
              <dl>
                <dt>Tel</dt>
                <dd>
                  038-2232976, 038-2238217
                  <br />
                  038-7211928
                </dd>
                <dt>Fax</dt>
                <dd>038-2298200</dd>
                <dt>E-mail</dt>
                <dd>fmjholdings@fmjgp.lk</dd>
                <dt>Web</dt>
                <dd>www.fmjgp.lk</dd>
              </dl>
            </section>
            <section className="aod-customer-block">
              <div className="aod-doc-number">
                <b>AOD No.</b>
                <strong>{generated.number}</strong>
              </div>
              <div className="aod-destination">
                <b>Customer / Destination Name & Address</b>
                <strong>{generated.customerName}</strong>
                <span>{generated.customerAddress || "—"}</span>
              </div>
            </section>
            <section className="aod-brand-block">
              <h1>ADVICE OF DESPATCH</h1>
              <i>Please receive the following from</i>
              <img className="aod-rl-logo" src={rlLogo} alt="R L Plastics" />
              <small>A Member of</small>
              <img
                className="aod-fmj-logo"
                src={fmjHoldingsLogo}
                alt="FMJ Holdings"
              />
              <div className="aod-date">
                <b>AOD Date</b>
                <span>
                  {new Date(generated.createdAt).toLocaleDateString()}
                </span>
              </div>
            </section>
          </div>
          <div className="aod-details-row">
            <div>
              <b>From</b>
              <span>{generated.from}</span>
            </div>
            <div>
              <b>To</b>
              <span>{generated.to}</span>
            </div>
            <div>
              <b>Despatched by</b>
              <span>{generated.dispatchedBy}</span>
            </div>
          </div>
          <table className="aod-goods">
            <thead>
              <tr>
                <th>CODE NO.</th>
                <th>DESCRIPTION OF GOODS / SERVICES</th>
                <th>PACKAGING</th>
                <th>QUANTITY</th>
              </tr>
            </thead>
            <tbody>
              {generated.items.map((item, index) => (
                <tr key={index}>
                  <td>{item.code || "—"}</td>
                  <td>{item.description || "—"}</td>
                  <td>{item.packaging || "—"}</td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="aod-sign-row">
            <span>Approved by (Name & Signature)</span>
            <span>Collected by (Name & Signature)</span>
          </div>
          <footer>
            Location: 62 Galle Road, Henamulla, Panadura, 12550, Sri Lanka
          </footer>
          <footer>
            Location: 62 Galle Road, Henamulla, Panadura, 12550, Sri Lanka
          </footer>
        </article>
      </section>
    );

  return (
    <section className="aod-form-page">
      <div className="panel-heading aod-form-heading">
        <div>
          <span className="eyebrow">ADVICE OF DESPATCH</span>
          <h2>Raise AOD</h2>
          <p>Create a complete dispatch note, ready to review and print.</p>
        </div>
        <span className="aod-form-status">Draft</span>
      </div>
      <form className="aod-normal-form" onSubmit={generate}>
        <section className="aod-form-section aod-document-details">
          <div className="aod-section-title">
            <span>01</span>
            <div>
              <h3>Document details</h3>
              <p>Identify this advice of despatch.</p>
            </div>
          </div>
          <div className="aod-section-fields">
            <label>
              AOD No.
              <input
                value={form.number}
                placeholder="Auto-generate if blank"
                onChange={(event) => setField("number", event.target.value)}
              />
            </label>
            <label>
              Despatched by
              <input
                required
                value={form.dispatchedBy}
                onChange={(event) =>
                  setField("dispatchedBy", event.target.value)
                }
              />
            </label>
          </div>
        </section>
        <section className="aod-form-section aod-customer-details">
          <div className="aod-section-title">
            <span>02</span>
            <div>
              <h3>Customer / destination</h3>
              <p>Enter the receiving location details.</p>
            </div>
          </div>
          <div className="aod-section-fields">
            <label>
              Customer / Destination name
              <input
                required
                value={form.customerName}
                onChange={(event) =>
                  setField("customerName", event.target.value)
                }
              />
            </label>
            <label className="aod-wide-field">
              Customer / Destination address
              <textarea
                required
                value={form.customerAddress}
                onChange={(event) =>
                  setField("customerAddress", event.target.value)
                }
              />
            </label>
          </div>
        </section>
        <section className="aod-form-section aod-route-details">
          <div className="aod-section-title">
            <span>03</span>
            <div>
              <h3>Dispatch route</h3>
              <p>Confirm where the goods are moving from and to.</p>
            </div>
          </div>
          <div className="aod-section-fields">
            <label>
              From
              <input
                required
                value={form.from}
                onChange={(event) => setField("from", event.target.value)}
              />
            </label>
            <label>
              To
              <select
                required
                value={form.to}
                onChange={(event) => setField("to", event.target.value)}
              >
                <option value="">Select destination</option>
                {locations.map((location) => (
                  <option key={location._id} value={location.name}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <div className="aod-form-items">
          <div className="aod-form-items-title">
            <div>
              <span className="aod-item-step">04</span>
              <h3>Goods / Services</h3>
              <p>Add every item included in this despatch.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setField("items", [...form.items, { ...blankItem }])
              }
            >
              + Add item
            </button>
          </div>
          <div className="aod-item-columns">
            <span>Code no.</span>
            <span>Description of goods / services</span>
            <span>Packaging</span>
            <span>Quantity</span>
          </div>
          {form.items.map((item, index) => (
            <div className="aod-form-item" key={index}>
              <input
                aria-label="Code number"
                placeholder="e.g. FMJ-001"
                required
                value={item.code}
                onChange={(event) => setItem(index, "code", event.target.value)}
              />
              <input
                aria-label="Description"
                placeholder="Item description"
                required
                value={item.description}
                onChange={(event) =>
                  setItem(index, "description", event.target.value)
                }
              />
              <input
                aria-label="Packaging"
                placeholder="Nos"
                required
                value={item.packaging}
                onChange={(event) =>
                  setItem(index, "packaging", event.target.value)
                }
              />
              <input
                aria-label="Quantity"
                type="number"
                min="1"
                required
                value={item.quantity}
                onChange={(event) =>
                  setItem(index, "quantity", Number(event.target.value))
                }
              />
              {form.items.length > 1 && (
                <button
                  type="button"
                  className="aod-remove-item"
                  onClick={() => removeItem(index)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {error && <div className="error aod-form-error">{error}</div>}
        <div className="aod-form-footer">
          <span>All fields marked by the form are required.</span>
          <button className="aod-generate" disabled={busy}>
            {busy
              ? "Saving..."
              : editingId
                ? "Save AOD changes"
                : "Generate AOD document"}
          </button>
        </div>
      </form>
    </section>
  );
}
