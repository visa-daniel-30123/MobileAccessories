# Accesorii Mall – Stoc și transferuri între sucursale

Aplicație pentru gestionarea stocului la magazine de accesorii telefon: vizualizare stoc actual, raport vânzări 30/60/90 zile, transferuri între 5 sucursale. Stocul care nu se vinde ≥100 zile este considerat „mort” și poate fi redistribuit către sucursalele unde produsul se vinde.

## Arhitectură

- **Backend**: Node.js (Express), autentificare JWT, API REST.
- **Frontend**: React (Vite).
- **Bază de date**: **SQLite** (un singur fișier, fără server separat).

Detalii conceptuale: [ARHITECTURA.md](./ARHITECTURA.md).

## Cerințe

- Node.js 18+

## Setup

### 1. Backend (cu SQLite)

Nu ai nevoie de PostgreSQL sau Docker. Baza de date este un fișier SQLite creat automat.

```powershell
cd backend
copy .env.example .env
npm install
npm run db:init
npm run db:seed
npm run dev
```

Fișierul bazei de date: `backend/data/db.sqlite` (se creează la `db:init`).

Opțional în `.env` poți seta altă cale:

```
SQLITE_PATH=./data/db.sqlite
```

sau o cale absolută. Lăsat necompletat, se folosește `backend/data/db.sqlite`.

Server: http://localhost:4000

**Conturi demo (după seed):**

- Admin: `admin@accesorii.ro` / `admin123`
- Manager: `manager@accesorii.ro` / `manager123`

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Aplicația: http://localhost:5173

## API (toate rutele necesită `Authorization: Bearer <token>` în afară de login/register)

| Metodă | Rută | Descriere |
|--------|------|-----------|
| POST | `/api/auth/register` | Înregistrare (email, parolă, rol, branch_id) |
| POST | `/api/auth/login` | Login → token + user |
| GET | `/api/auth/me` | Utilizator curent |
| GET | `/api/branches` | Lista sucursale |
| GET | `/api/products` | Lista produse |
| GET | `/api/stock?branch_id=&dead_only=` | Stoc (view cu zile fără vânzare) |
| PUT | `/api/stock` | Actualizare cantitate stoc |
| GET | `/api/sales/report?days=30\|60\|90` | Raport vânzări 30/60/90 zile |
| POST | `/api/sales` | Înregistrare vânzare |
| GET | `/api/transfers` | Lista transferuri |
| POST | `/api/transfers` | Creare transfer |
| PATCH | `/api/transfers/:id/status` | Actualizare status (sent, accepted, completed, etc.) |
| GET | `/api/transfers/suggestions` | Sugestii: stoc mort → magazine cu vânzări în 30 zile |

## Roluri

- **admin**: vede toate sucursalele, toate transferurile, poate crea sucursale/produse.
- **manager**: vede doar sucursala asignată (`branch_id`), poate crea transferuri care îl privesc.

## Costuri transfer

Tabelul `transfer_costs` stochează cost per unitate per pereche (from_branch, to_branch). La crearea transferului se calculează `cost_estimate = quantity * cost_per_unit`. Poți popula costurile din admin (de ex. prin script sau interfață ulterioară).

## Licență

Proiect intern.
