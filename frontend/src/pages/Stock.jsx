import { useState, useEffect } from 'react';
import { stockApi, branchesApi, salesApi, transfersApi } from '../api';
import { useAuth } from '../context/AuthContext';
import './Stock.css';

export default function Stock() {
  const { user } = useAuth();
  const [stock, setStock] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [deadOnly, setDeadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [modalQty, setModalQty] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [transferSuggestions, setTransferSuggestions] = useState([]);
  const [modalDest, setModalDest] = useState('');
  const [modalMax, setModalMax] = useState(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(console.error);
    transfersApi.suggestions().then(setTransferSuggestions).catch(console.error);
  }, []);

  const loadStock = () => {
    const params = {};
    if (branchFilter) params.branch_id = branchFilter;
    if (deadOnly) params.dead_only = 'true';
    return stockApi.list(params).then(setStock);
  };

  useEffect(() => {
    setLoading(true);
    loadStock()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [branchFilter, deadOnly]);

  const openModal = (type, row) => {
    setError('');
    setModal({ type, row });
    setModalQty('');

    if (type === 'transfer') {
      const sug = transferSuggestions.find(
        (s) => s.from_branch_id === row.branch_id && s.product_id === row.product_id
      );
      const first = sug?.suggested_destinations?.[0];
      setModalDest(first ? String(first.branch_id) : '');
      const maxVal = first ? Number(first.total_sold) || 0 : 0;
      setModalMax(maxVal > 0 ? maxVal : null);
    } else {
      setModalDest('');
      setModalMax(null);
    }
  };

  const closeModal = () => {
    setModal(null);
    setModalQty('');
    setModalDest('');
    setModalMax(null);
    setModalSubmitting(false);
  };

  const handleModalConfirm = async () => {
    const qty = parseInt(modalQty, 10);
    if (!qty || qty < 1) {
      setError('Introduceți o cantitate validă (min. 1).');
      return;
    }
    if (modal.type === 'transfer' && modalMax != null && modalMax > 0 && qty > modalMax) {
      setError(`Nu puteți propune mai mult de ${modalMax} bucăți (media vânzărilor din ultima lună în magazinul destinație).`);
      return;
    }
    setModalSubmitting(true);
    setError('');
    try {
      if (modal.type === 'sale') {
        await salesApi.create({
          branch_id: modal.row.branch_id,
          product_id: modal.row.product_id,
          quantity: qty,
        });
      } else if (modal.type === 'receive') {
        await stockApi.receive({
          branch_id: modal.row.branch_id,
          product_id: modal.row.product_id,
          quantity: qty,
        });
      } else if (modal.type === 'transfer') {
        const fromBranchId = modal.row.branch_id;
        const sug = transferSuggestions.find(
          (s) => s.from_branch_id === fromBranchId && s.product_id === modal.row.product_id
        );
        let destId = modalDest;
        if (!destId && sug?.suggested_destinations?.length) {
          const first = sug.suggested_destinations[0];
          destId = String(first.branch_id);
          const maxVal = Number(first.total_sold) || 0;
          setModalMax(maxVal > 0 ? maxVal : null);
        }
        if (!destId) {
          throw new Error('Nu există magazine cu vânzări pentru acest produs în ultimele 30 de zile.');
        }
        await transfersApi.create({
          from_branch_id: fromBranchId,
          to_branch_id: parseInt(destId, 10),
          product_id: modal.row.product_id,
          quantity: qty,
          notes: 'Cerere generată din stoc mort',
        });
      }
      await loadStock();
      closeModal();
    } catch (e) {
      setError(e.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  return (
    <>
      <h1>Stoc actual</h1>
      {error && <div className="card" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>{error}</div>}
      <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {isAdmin && (
          <label>
            Sucursală
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              <option value="">Toate</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} – {b.city}</option>
              ))}
            </select>
          </label>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={deadOnly}
            onChange={(e) => setDeadOnly(e.target.checked)}
          />
          Doar stoc mort (≥100 zile fără vânzare)
        </label>
      </div>
      <div className="card">
        {loading ? (
          <p>Se încarcă...</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {isAdmin && <th>Sucursală</th>}
                  <th>Produs (SKU)</th>
                  <th>Categorie</th>
                  <th>Cantitate</th>
                  <th>Zile fără vânzare</th>
                  <th>Stoc mort</th>
                  <th>Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={`${s.branch_id}-${s.product_id}`}>
                    {isAdmin && <td>{s.branch_name} – {s.city}</td>}
                    <td>{s.product_name} ({s.sku})</td>
                    <td>{s.category || '–'}</td>
                    <td>{s.quantity}</td>
                    <td>{s.days_since_last_sale != null ? s.days_since_last_sale : '–'}</td>
                    <td>
                      {s.is_dead_stock ? (
                        <span className="badge badge-dead">Da</span>
                      ) : (
                        <span className="badge badge-ok">Nu</span>
                      )}
                    </td>
                    <td className="stock-actions-cell">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openModal('sale', s)}
                        title="Înregistrare vânzare"
                      >
                        Vânzare
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => openModal('receive', s)}
                        title="Primire stoc"
                      >
                        Primire
                      </button>
                      {s.is_dead_stock && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => openModal('transfer', s)}
                          title="Creează cerere de transfer din stoc mort"
                        >
                          Propune transfer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stock.length === 0 && <p style={{ padding: '1rem' }}>Niciun rezultat.</p>}
          </div>
        )}
      </div>

      {modal && (
        <div className="stock-modal-overlay" onClick={closeModal}>
          <div className="stock-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {modal.type === 'sale'
                ? 'Vânzare'
                : modal.type === 'receive'
                ? 'Primire'
                : 'Propunere transfer din stoc mort'}{' '}
              – {modal.row.product_name} ({modal.row.sku})
            </h3>
            <p className="sub">
              {modal.type === 'sale'
                ? 'Introduceți numărul de produse vândute. Stocul va fi micșorat.'
                : modal.type === 'receive'
                ? 'Introduceți numărul de produse primite. Stocul va fi mărit (max 200 produse per magazin).'
                : 'Alegeți magazinul destinație și cantitatea pentru cererea de transfer.'}
            </p>
            {modal.type === 'transfer' && (
              <>
                <label>Magazin destinație</label>
                <select
                  value={modalDest}
                  onChange={(e) => setModalDest(e.target.value)}
                  style={{ marginBottom: '1rem', width: '100%' }}
                >
                  <option value="">Selectează...</option>
                  {transferSuggestions
                    .filter(
                      (s) =>
                        s.from_branch_id === modal.row.branch_id &&
                        s.product_id === modal.row.product_id &&
                        (s.suggested_destinations?.length || 0) > 0
                    )
                    .flatMap((s) => s.suggested_destinations)
                    .map((d) => {
                      const b = branches.find((br) => br.id === d.branch_id);
                      // Nu permitem propunere de transfer către același magazin de origine
                      if (!b || b.id === modal.row.branch_id) return null;
                      return (
                        <option key={d.branch_id} value={d.branch_id}>
                          {b.name} – vândut ultima lună: {d.total_sold}
                        </option>
                      );
                    })}
                </select>
              </>
            )}
            <label>Cantitate</label>
            <input
              type="number"
              min="1"
              value={modalQty}
              onChange={(e) => setModalQty(e.target.value)}
              placeholder="Ex: 5"
              autoFocus
            />
            {modal.type === 'transfer' && modalMax != null && modalMax > 0 && (
              <p className="sub" style={{ marginTop: '-0.25rem' }}>
                Puteți propune maxim <strong>{modalMax}</strong> bucăți (media vânzărilor în ultima lună în magazinul selectat).
              </p>
            )}
            <div className="stock-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={modalSubmitting}>
                Anulare
              </button>
              <button type="button" className="btn btn-primary" onClick={handleModalConfirm} disabled={modalSubmitting}>
                {modalSubmitting ? 'Se procesează...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
