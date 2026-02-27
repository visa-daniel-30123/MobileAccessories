import { useState, useEffect } from 'react';
import { transfersApi, branchesApi, productsApi, salesApi } from '../api';
import { useAuth } from '../context/AuthContext';

const STATUS_LABELS = {
  sent: 'În așteptare',
  accepted: 'În livrare',
  rejected: 'Refuzat',
};

export default function Transfers() {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ from_branch_id: '', to_branch_id: '', product_id: '', quantity: '', notes: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [salesStats, setSalesStats] = useState(null);

  const isAdmin = user?.role === 'admin';
  const myBranchId = user?.branch_id;

  useEffect(() => {
    transfersApi.list().then(setTransfers).catch(console.error);
    branchesApi.list().then(setBranches).catch(console.error);
    productsApi.list().then(setProducts).catch(console.error);
    transfersApi.suggestions().then(setSuggestions).catch(console.error);
    salesApi
      .report()
      .then((res) => {
        const stats = {};
        const add = (arr, key) => {
          (arr || []).forEach((r) => {
            const mapKey = `${r.branch_id}_${r.product_id}`;
            stats[mapKey] = { ...(stats[mapKey] || {}), [key]: r.total_sold };
          });
        };
        add(res.last_30_days, 'd30');
        add(res.last_60_days, 'd60');
        add(res.last_90_days, 'd90');
        setSalesStats(stats);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      transfersApi.list().then(setTransfers);
    }, 500);
    return () => clearTimeout(t);
  }, [sending]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await transfersApi.create({
        from_branch_id: parseInt(form.from_branch_id, 10),
        to_branch_id: parseInt(form.to_branch_id, 10),
        product_id: parseInt(form.product_id, 10),
        quantity: parseInt(form.quantity, 10),
        notes: form.notes || undefined,
      });
      setForm({ from_branch_id: '', to_branch_id: '', product_id: '', quantity: '', notes: '' });
      setTransfers(await transfersApi.list());
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await transfersApi.updateStatus(id, status);
      setTransfers(await transfersApi.list());
    } catch (err) {
      setError(err.message);
    }
  };

  const branchOptions = isAdmin ? branches : branches.filter((b) => b.id === myBranchId);

  const incomingPending = transfers.filter((t) => t.to_branch_id === myBranchId && t.status === 'sent');

  // poate aproba doar magazinul destinație (to_branch) sau admin
  const canApprove = (t) => isAdmin || t.to_branch_id === myBranchId;

  return (
    <>
      <h1>Transferuri de stoc</h1>
      {error && <div className="card" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>{error}</div>}

      {incomingPending.length > 0 && (
        <section className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #e94560' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Cereri primite (în așteptare)</h2>
          <p style={{ color: '#94a3b8', marginBottom: '0.75rem' }}>
            Aceste cereri au fost create către magazinul dumneavoastră. Starea lor va fi actualizată când magazinul sursă
            acceptă sau respinge cererea.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>De la</th>
                  <th>Produs</th>
                  <th>Cantitate</th>
                  <th>Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {incomingPending.map((t) => (
                  <tr key={t.id}>
                    <td>{t.from_branch_name}</td>
                    <td>{t.product_name}</td>
                    <td>{t.quantity}</td>
                    <td>
                      {canApprove(t) && (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ marginRight: '0.25rem' }}
                            onClick={() => updateStatus(t.id, 'accepted')}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => updateStatus(t.id, 'rejected')}
                          >
                            Refuz
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Sugestii: stoc mort → magazine unde se vinde (ultimele 30 zile)</h2>
        {(!isAdmin && !myBranchId
          ? []
          : (isAdmin ? suggestions : suggestions.filter((s) => s.from_branch_id === myBranchId))
        ).length === 0 ? (
          <p style={{ color: '#94a3b8' }}>Niciun stoc mort de redistribuit.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Din sucursală</th>
                  <th>Produs</th>
                  <th>Disponibil</th>
                  <th>Zile fără vânzare</th>
                  <th>Destinații 30 zile</th>
                  <th>Destinații 60 zile</th>
                  <th>Destinații 90 zile</th>
                </tr>
              </thead>
              <tbody>
                {(isAdmin ? suggestions : suggestions.filter((s) => s.from_branch_id === myBranchId)).map((s, i) => {
                  const topDests = s.suggested_destinations.slice(0, 2);
                  const renderCol = (key) => (
                    <td key={key}>
                      {topDests.length === 0
                        ? '–'
                        : topDests.map((d) => {
                            const destBranch = branches.find((b) => b.id === d.branch_id);
                            const statKey = `${d.branch_id}_${s.product_id}`;
                            const st = salesStats?.[statKey] || {};
                            const val =
                              key === 'd30' ? st.d30 ?? 0 : key === 'd60' ? st.d60 ?? 0 : st.d90 ?? 0;
                            return (
                              <span key={d.branch_id} style={{ display: 'inline-block', marginRight: '0.75rem' }}>
                                {destBranch ? destBranch.name : `#${d.branch_id}`} ({val})
                              </span>
                            );
                          })}
                    </td>
                  );

                  return (
                    <tr key={i}>
                      <td>{s.from_branch_name}</td>
                      <td>{s.product_name} ({s.sku})</td>
                      <td>{s.available}</td>
                      <td>{s.days_no_sale}</td>
                      {renderCol('d30')}
                      {renderCol('d60')}
                      {renderCol('d90')}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Creare transfer</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <label>
            Din sucursală
            <select
              value={form.from_branch_id}
              onChange={(e) => setForm((f) => ({ ...f, from_branch_id: e.target.value }))}
              required
            >
              <option value="">Selectează</option>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label>
            În sucursală
            <select
              value={form.to_branch_id}
              onChange={(e) => setForm((f) => ({ ...f, to_branch_id: e.target.value }))}
              required
            >
              <option value="">Selectează</option>
              {branches.filter((b) => b.id !== parseInt(form.from_branch_id, 10)).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label>
            Produs
            <select
              value={form.product_id}
              onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
              required
            >
              <option value="">Selectează</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </label>
          <label>
            Cantitate
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              required
            />
          </label>
          <label>
            Note
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Opțional"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? 'Se trimite...' : 'Creează transfer'}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Lista transferuri</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Din</th>
                <th>În</th>
                <th>Produs</th>
                <th>Cantitate</th>
                <th>Cost est.</th>
                <th>Status</th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td>{t.from_branch_name}</td>
                  <td>{t.to_branch_name}</td>
                  <td>{t.product_name}</td>
                  <td>{t.quantity}</td>
                  <td>{t.cost_estimate != null ? `${t.cost_estimate} RON` : '–'}</td>
                  <td><span className="badge">{STATUS_LABELS[t.status] || t.status}</span></td>
                  <td>
                    {t.status === 'sent' && canApprove(t) && (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ marginRight: '0.25rem' }}
                          onClick={() => updateStatus(t.id, 'accepted')}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => updateStatus(t.id, 'rejected')}
                        >
                          Refuz
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transfers.length === 0 && <p style={{ padding: '1rem' }}>Niciun transfer.</p>}
        </div>
      </section>
    </>
  );
}
