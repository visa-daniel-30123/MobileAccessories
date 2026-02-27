import { useState, useEffect } from 'react';
import { salesApi } from '../api';
import { useAuth } from '../context/AuthContext';

export default function SalesReport() {
  const { user } = useAuth();
  const [data, setData] = useState({ last_30_days: [], last_60_days: [], last_90_days: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(30);

  useEffect(() => {
    setLoading(true);
    salesApi
      .report()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const rows = data[`last_${activeTab}_days`] || [];

  return (
    <>
      <h1>Raport vânzări 30 / 60 / 90 zile</h1>
      <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>
        Unde s-a vândut fiecare produs – pentru a decide unde se trimite stocul din sucursalele cu exces.
      </p>
      <div className="card" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[30, 60, 90].map((d) => (
          <button
            key={d}
            type="button"
            className={`btn ${activeTab === d ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(d)}
          >
            Ultimele {d} zile
          </button>
        ))}
      </div>
      <div className="card">
        {loading ? (
          <p>Se încarcă...</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sucursală</th>
                  <th>Oraș</th>
                  <th>Produs (SKU)</th>
                  <th>Total vândut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.branch_id}-${r.product_id}-${i}`}>
                    <td>{r.branch_name}</td>
                    <td>{r.city}</td>
                    <td>{r.product_name} ({r.sku})</td>
                    <td>{r.total_sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p style={{ padding: '1rem' }}>Nicio vânzare în perioada selectată.</p>}
          </div>
        )}
      </div>
    </>
  );
}
