# Arhitectura conceptuală – Mall Accesorii Telefon

## 1. Problema de rezolvat

- **Stoc mort**: produse care nu se vând ≥ 100 zile într-o sucursală = lipsă de interes local.
- **Obiectiv**: a vedea unde s-au făcut vânzări în ultimele 30 / 60 / 90 zile și a **transfera** stocul din sucursalele cu exces către sucursalele unde produsul se vinde.
- **Costuri**: manipulare, stocare, transport – trebuie luate în calcul la decizii de transfer.
- **Diferențe între sucursale**: putere de cumpărare diferită (ex. București vs Focșani) – influențează unde „se vinde” și unde rămâne stoc.

## 2. Variante de bază de date

| Variantă | Descriere | Avantaje | Dezavantaje |
|----------|-----------|----------|-------------|
| **A. Bază unică** | O singură PostgreSQL cu `branch_id` peste tot | Rapoarte 30/60/90 și logică transfer simplă, un singur backend | Toate sucursalele depind de același server |
| **B. Bază per sucursală** | Fiecare sucursală are propria bază | Izolare, poate rula local | Agregare vânzări 30/60/90 și logică transfer mult mai complexă (sync, API-uri între baze) |

**Recomandare**: **Bază unică** (variantă A) pentru 5 sucursale – simplifică raportarea și motorul de transfer. Dacă mai târziu una dintre sucursale are nevoie de bază separată (ex. offline), se poate adăuga un strat de sincronizare.

## 3. Concepte principale

### 3.1 Entități

- **Sucursale** (Branches): București, Focșani, etc. – fiecare cu id, nume, oraș, costuri (transport către alte sucursale, stocare).
- **Produse** (Products): catalog comun (SKU, denumire, categorie).
- **Stoc** (Stock): per sucursală și per produs – cantitate, ultima vânzare (sau derivat din Sales).
- **Vânzări** (Sales): tranzacții cu sucursală, produs, cantitate, dată – pentru raportare 30/60/90 zile.
- **Transferuri** (Transfers): cereri/comenzi de transfer între sucursale (de la cine, către cine, produs, cantitate, status, cost estimat).

### 3.2 Reguli de business

1. **Stoc „mort”**: pentru fiecare (sucursală, produs) se calculează „zile fără vânzare”. Dacă ≥ 100 zile și există cantitate în stoc → candidat pentru transfer.
2. **Unde se vinde**: din Sales se agregă per (sucursală, produs) pentru ferestrele 30 / 60 / 90 zile – aceste sucursale sunt prioritare pentru primire.
3. **Alocare**: stocul mort se „oferă” către sucursalele cu vânzări (ex. 30 zile mai întâi), ținând cont de:
   - cost transport între sucursale,
   - cost manipulare/stocare (opțional pe sucursală).
4. **Autentificare**: obligatorie; utilizatori legați de rol (admin / manager sucursală) și de sucursală – pentru a restricționa ce pot vedea și ce transferuri pot crea/aproba.

## 4. Fluxuri principale

### 4.1 Vizualizare stoc actual

- Listare stoc per sucursală (și filtrare per sucursală pentru manager).
- Indicatori: cantitate, „zile fără vânzare”, stoc mort (da/nu).
- Posibilitate export (CSV/Excel) pentru rapoarte.

### 4.2 Raport vânzări 30 / 60 / 90 zile

- Agregare Sales pe (sucursală, produs) pentru:
  - ultimele 30 zile,
  - ultimele 60 zile,
  - ultimele 90 zile.
- Afișare: unde s-a vândut fiecare produs și în ce cantități – pentru a decide unde se trimite stocul.

### 4.3 Transferuri de stoc

- **Creare transfer**: din sucursală sursă → sucursală destinație, produs, cantitate.
- **Cost estimat**: transport (și eventual manipulare) pe baza unor reguli (ex. cost per km sau cost fix per rută).
- **Workflow**: draft → trimis → acceptat/refuzat → în curs → finalizat.
- **Surse de date**: stoc curent + raportul 30/60/90 pentru a sugera destinații și cantități.

## 5. Autentificare și autorizare

- **Auth**: JWT (access + refresh) sau sesiuni; utilizatori cu parolă (hash bcrypt).
- **Roluri**: de ex. `admin` (vede toate sucursalele, toate transferurile), `manager` (vede doar sucursala asignată, poate crea/vedea transferuri care îi țin de sucursală).
- **Scopuri**: 
  - Admin: rapoarte globale, aprobare/gestiune transferuri.
  - Manager: stoc sucursală, raport vânzări sucursală, creare cereri de transfer (primire/expediere).

## 6. Stack tehnic

| Componentă | Tehnologie |
|------------|------------|
| Backend | Node.js (Express sau Fastify) |
| Frontend | React (Vite) |
| Bază de date | **SQLite** (sau PostgreSQL) |
| Auth | JWT, bcrypt, middleware pe rute |
| API | REST; eventual WebSocket pentru notificări transferuri |

## 7. Structură logică baza de date (esențial)

- **users** – id, email, parolă (hash), rol, branch_id (nullable pentru admin).
- **branches** – id, nume, oras, cost_transport_per_unitate (sau per rută), etc.
- **products** – id, sku, nume, categorie.
- **stock** – branch_id, product_id, quantity, updated_at (sau last_sale_at derivat).
- **sales** – id, branch_id, product_id, quantity, sold_at.
- **transfers** – id, from_branch_id, to_branch_id, product_id, quantity, status, cost_estimate, created_at, etc.
- **branch_costs** (opțional) – per pereche (from_branch, to_branch) cost transport/manipulare.

Această structură suportă: stoc actual, raport 30/60/90 din `sales`, identificare stoc mort (comparând cu `sales`), și transferuri cu cost estimat.

---

Documentul acesta servește ca bază pentru implementarea backend Node.js, frontend React și a bazei de date PostgreSQL.
