/* ===================================================
   BORTONY PRE & PRIMARY SCHOOL - SALES SYSTEM
   app.js - logic yote ya mfumo
=================================================== */

// ---------- WATERMARK LOGO (inapakiwa tu wakati wa kutengeneza PDF) ----------
// Tunachukua logo-badge.png (faili tofauti) na kuibadilisha kuwa base64
// tu pale mtu anapobonyeza "Download PDF" - hii inaepusha app.js
// kuwa kubwa mno wakati wa kufungua page.
let pdfWatermarkDataUrl = null;
async function getPdfWatermarkDataUrl() {
  if (pdfWatermarkDataUrl) return pdfWatermarkDataUrl;
  const response = await fetch('logo-badge.png');
  const blob = await response.blob();
  pdfWatermarkDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return pdfWatermarkDataUrl;
}

// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
  apiKey: "AIzaSyAArC3bJ6EwmF-QGRHdmr92x77QTTbTFxM",
  authDomain: "bortony-school-sales.firebaseapp.com",
  databaseURL: "https://bortony-school-sales-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bortony-school-sales",
  storageBucket: "bortony-school-sales.firebasestorage.app",
  messagingSenderId: "350559384624",
  appId: "1:350559384624:web:022ef92e3ebbdd960ea9f5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---------- STATE ----------
let currentUser = null;       // { username, role }
let allProducts = [];         // cache ya products zote (live)
let allSales = [];            // cache ya sales zote (live)

// ---------- HELPERS ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setFeedback(elId, message, isError) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.classList.remove('success', 'error');
  el.classList.add(isError ? 'error' : 'success');
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function formatDate(timestamp) {
  if (!timestamp || !timestamp.toDate) return '-';
  const d = timestamp.toDate();
  return d.toLocaleDateString('sw-TZ') + ' ' + d.toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });
}

// ===================================================
// LOGIN / LOGOUT
// ===================================================
document.getElementById('loginBtn').addEventListener('click', async () => {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  if (!username || !password) {
    errorEl.textContent = 'Tafadhali jaza username na password.';
    return;
  }

  try {
    const snap = await db.collection('users')
      .where('username', '==', username)
      .where('password', '==', password)
      .limit(1)
      .get();

    if (snap.empty) {
      errorEl.textContent = 'Username au password si sahihi.';
      return;
    }

    const userDocSnap = snap.docs[0];
    const userDoc = userDocSnap.data();
    currentUser = { username: userDoc.username, role: userDoc.role, docId: userDocSnap.id };

    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';

    if (currentUser.role === 'manager') {
      showScreen('managerScreen');
    } else if (currentUser.role === 'sales_teacher') {
      showScreen('salesScreen');
      renderMySalesTable();
    } else {
      errorEl.textContent = 'Role ya mtumiaji huyu haitambuliki.';
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Hitilafu imetokea, jaribu tena.';
  }
});

document.getElementById('managerLogout').addEventListener('click', () => {
  currentUser = null;
  showScreen('loginScreen');
});
document.getElementById('salesLogout').addEventListener('click', () => {
  currentUser = null;
  showScreen('loginScreen');
});

// ===================================================
// BADILISHA PASSWORD (bila email - old + new + confirm)
// ===================================================
function openChangePassModal() {
  document.getElementById('oldPasswordInput').value = '';
  document.getElementById('newPasswordInput').value = '';
  document.getElementById('confirmPasswordInput').value = '';
  document.getElementById('changePassMsg').textContent = '';
  document.getElementById('changePassModal').classList.remove('hidden');
}
function closeChangePassModal() {
  document.getElementById('changePassModal').classList.add('hidden');
}

document.getElementById('managerChangePassBtn').addEventListener('click', openChangePassModal);
document.getElementById('salesChangePassBtn').addEventListener('click', openChangePassModal);
document.getElementById('cancelChangePassBtn').addEventListener('click', closeChangePassModal);

document.getElementById('submitChangePassBtn').addEventListener('click', async () => {
  const oldPass = document.getElementById('oldPasswordInput').value.trim();
  const newPass = document.getElementById('newPasswordInput').value.trim();
  const confirmPass = document.getElementById('confirmPasswordInput').value.trim();

  if (!oldPass || !newPass || !confirmPass) {
    return setFeedback('changePassMsg', 'Jaza sehemu zote.', true);
  }
  if (newPass.length < 4) {
    return setFeedback('changePassMsg', 'Password mpya iwe angalau herufi/namba 4.', true);
  }
  if (newPass !== confirmPass) {
    return setFeedback('changePassMsg', 'Password mpya na uthibitisho hazifanani.', true);
  }

  try {
    const userRef = db.collection('users').doc(currentUser.docId);
    const userSnap = await userRef.get();

    if (!userSnap.exists || userSnap.data().password !== oldPass) {
      return setFeedback('changePassMsg', 'Password ya zamani si sahihi.', true);
    }

    await userRef.update({ password: newPass });
    setFeedback('changePassMsg', 'Password imebadilishwa kikamilifu.', false);
    setTimeout(closeChangePassModal, 1200);
  } catch (err) {
    console.error(err);
    setFeedback('changePassMsg', 'Hitilafu, jaribu tena.', true);
  }
});

// ===================================================
// TABS (Manager)
// ===================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ===================================================
// LIVE LISTENERS: PRODUCTS
// ===================================================
db.collection('products').orderBy('jina').onSnapshot(snapshot => {
  allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderAllProductsTable();
  renderStockInDropdown();
  renderCategoryDropdown('uniform', 'uniformProductSelect', 'uniformStockHint');
  renderCategoryDropdown('stationery', 'stationeryProductSelect', 'stationeryStockHint');
});

function renderAllProductsTable() {
  const tbody = document.querySelector('#allProductsTable tbody');
  tbody.innerHTML = '';
  allProducts.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.jina}</td>
      <td>${p.aina === 'uniform' ? 'Uniform' : 'Stationery'}</td>
      <td>${p.kiasiKilichopo}</td>
      <td>
        <button class="action-btn edit-action-btn" data-id="${p.id}">Hariri</button>
        <button class="action-btn delete-action-btn" data-id="${p.id}">Futa</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.edit-action-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditProductModal(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-action-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteProduct(btn.dataset.id));
  });
}

function renderStockInDropdown() {
  const select = document.getElementById('stockInProductSelect');
  const prevValue = select.value;
  select.innerHTML = '';
  allProducts.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.jina} (${p.aina === 'uniform' ? 'Uniform' : 'Stationery'}) - Stock: ${p.kiasiKilichopo}`;
    select.appendChild(opt);
  });
  if (prevValue) select.value = prevValue;
}

function renderCategoryDropdown(category, selectId, hintId) {
  const select = document.getElementById(selectId);
  const prevValue = select.value;
  select.innerHTML = '';
  const filtered = allProducts.filter(p => p.aina === category);

  if (filtered.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Hakuna bidhaa - muulize Manager aongeze';
    select.appendChild(opt);
  } else {
    filtered.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.jina;
      select.appendChild(opt);
    });
  }

  if (prevValue) select.value = prevValue;
  updateStockHint(selectId, hintId);
}

function updateStockHint(selectId, hintId) {
  const select = document.getElementById(selectId);
  const hint = document.getElementById(hintId);
  const product = allProducts.find(p => p.id === select.value);
  hint.textContent = product ? `Stock iliyopo: ${product.kiasiKilichopo}` : '';
}

document.getElementById('uniformProductSelect').addEventListener('change', () => updateStockHint('uniformProductSelect', 'uniformStockHint'));
document.getElementById('stationeryProductSelect').addEventListener('change', () => updateStockHint('stationeryProductSelect', 'stationeryStockHint'));

// ===================================================
// GENERIC CONFIRM-DELETE MODAL
// ===================================================
let pendingDeleteAction = null;

function openConfirmDelete(message, onConfirm) {
  document.getElementById('confirmDeleteMsg').textContent = message;
  pendingDeleteAction = onConfirm;
  document.getElementById('confirmDeleteModal').classList.remove('hidden');
}
function closeConfirmDelete() {
  document.getElementById('confirmDeleteModal').classList.add('hidden');
  pendingDeleteAction = null;
}
document.getElementById('cancelDeleteBtn').addEventListener('click', closeConfirmDelete);
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (pendingDeleteAction) {
    await pendingDeleteAction();
  }
  closeConfirmDelete();
});

// ===================================================
// MANAGER: HARIRI / FUTA BIDHAA
// ===================================================
function openEditProductModal(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  document.getElementById('editProductModal').dataset.productId = productId;
  document.getElementById('editProductName').value = product.jina;
  document.getElementById('editProductCategory').value = product.aina;
  document.getElementById('editProductStock').value = product.kiasiKilichopo;
  document.getElementById('editProductMsg').textContent = '';
  document.getElementById('editProductModal').classList.remove('hidden');
}
document.getElementById('cancelEditProductBtn').addEventListener('click', () => {
  document.getElementById('editProductModal').classList.add('hidden');
});
document.getElementById('submitEditProductBtn').addEventListener('click', async () => {
  const productId = document.getElementById('editProductModal').dataset.productId;
  const jina = document.getElementById('editProductName').value.trim();
  const aina = document.getElementById('editProductCategory').value;
  const kiasi = Number(document.getElementById('editProductStock').value);

  if (!jina) return setFeedback('editProductMsg', 'Weka jina la bidhaa.', true);
  if (kiasi < 0 || isNaN(kiasi)) return setFeedback('editProductMsg', 'Weka kiasi sahihi.', true);

  try {
    await db.collection('products').doc(productId).update({
      jina, aina, kiasiKilichopo: kiasi
    });
    setFeedback('editProductMsg', 'Bidhaa imesahihishwa.', false);
    setTimeout(() => document.getElementById('editProductModal').classList.add('hidden'), 800);
  } catch (err) {
    console.error(err);
    setFeedback('editProductMsg', 'Hitilafu, jaribu tena.', true);
  }
});

function confirmDeleteProduct(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;
  openConfirmDelete(`Utafuta bidhaa "${product.jina}" kabisa. Vitendo hiki hakiwezi kurudishwa.`, async () => {
    try {
      await db.collection('products').doc(productId).delete();
    } catch (err) {
      console.error(err);
      alert('Hitilafu wakati wa kufuta bidhaa.');
    }
  });
}

// ===================================================
// LIVE LISTENER: SALES
// Kumbuka: tunachukua tu mauzo 300 ya karibuni kwa ajili ya
// majedwali ya Ripoti/Mauzo Yangu (kwa kasi). Mapato ya JUMLA
// yanahesabiwa kwa usahihi kutoka kwenye 'products' (angalia chini),
// na PDF ya mwezi inasoma moja kwa moja Firestore (siyo cache hii).
// ===================================================
db.collection('sales').orderBy('tarehe', 'desc').limit(300).onSnapshot(snapshot => {
  allSales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderStockOutTable();
  renderMapatoTable();
  renderMySalesTable();
});

function renderMySalesTable() {
  const tbody = document.querySelector('#mySalesTable tbody');
  if (!tbody || !currentUser) return;

  const mySales = allSales.filter(s => s.aliyeuza === currentUser.username);
  tbody.innerHTML = '';

  mySales.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(s.tarehe)}</td>
      <td>${s.jinaLaBidhaa}</td>
      <td>${s.aina === 'uniform' ? 'Uniform' : 'Stationery'}</td>
      <td>${s.kiasiKilichouzwa}</td>
      <td>${formatMoney(s.beiKwaKimoja)}</td>
      <td>${formatMoney(s.jumla)}</td>
      <td>
        <button class="action-btn edit-action-btn" data-id="${s.id}">Hariri</button>
        <button class="action-btn delete-action-btn" data-id="${s.id}">Futa</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.edit-action-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditSaleModal(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-action-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteSale(btn.dataset.id));
  });
}

function renderStockOutTable() {
  const tbody = document.querySelector('#stockOutTable tbody');
  tbody.innerHTML = '';
  allSales.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(s.tarehe)}</td>
      <td>${s.jinaLaBidhaa}</td>
      <td>${s.aina === 'uniform' ? 'Uniform' : 'Stationery'}</td>
      <td>${s.kiasiKilichouzwa}</td>
      <td>${formatMoney(s.beiKwaKimoja)}</td>
      <td>${formatMoney(s.jumla)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderMapatoTable() {
  // Tunachukua kutoka 'products' moja kwa moja - jumla za kudumu
  // (jumlaKiasiKimeuzwa / jumlaMapato) zinazohifadhiwa kwenye kila
  // bidhaa wakati wa kuuza/kuhariri/kufuta - hii ni sahihi milele
  // hata kama sales collection ikiwa kubwa sana, kwa sababu hatuhitaji
  // kusoma mauzo yote kuhesabu jumla.
  const rows = allProducts
    .filter(p => (p.jumlaMapato || 0) > 0)
    .map(p => ({
      jina: p.jina,
      aina: p.aina,
      idadi: p.jumlaKiasiKimeuzwa || 0,
      jumla: p.jumlaMapato || 0
    }))
    .sort((a, b) => b.jumla - a.jumla);

  const tbody = document.querySelector('#mapatoTable tbody');
  tbody.innerHTML = '';
  let grandTotal = 0;

  rows.forEach(r => {
    grandTotal += r.jumla;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.jina}</td>
      <td>${r.aina === 'uniform' ? 'Uniform' : 'Stationery'}</td>
      <td>${r.idadi}</td>
      <td>${formatMoney(r.jumla)}</td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('grandTotal').textContent = rows.length
    ? `JUMLA KUU: TSh ${formatMoney(grandTotal)}`
    : '';
}

// ===================================================
// STOCK IN: mode toggle
// ===================================================
document.getElementById('modeExisting').addEventListener('click', () => {
  document.getElementById('modeExisting').classList.add('active');
  document.getElementById('modeNew').classList.remove('active');
  document.getElementById('existingProductForm').classList.remove('hidden');
  document.getElementById('newProductForm').classList.add('hidden');
});
document.getElementById('modeNew').addEventListener('click', () => {
  document.getElementById('modeNew').classList.add('active');
  document.getElementById('modeExisting').classList.remove('active');
  document.getElementById('newProductForm').classList.remove('hidden');
  document.getElementById('existingProductForm').classList.add('hidden');
});

// ---------- STOCK IN: ongeza kwenye bidhaa iliyopo ----------
document.getElementById('stockInExistingBtn').addEventListener('click', async () => {
  const productId = document.getElementById('stockInProductSelect').value;
  const qty = Number(document.getElementById('stockInQty').value);

  if (!productId) return setFeedback('stockInMsg', 'Chagua bidhaa kwanza.', true);
  if (!qty || qty <= 0) return setFeedback('stockInMsg', 'Weka kiasi sahihi.', true);

  try {
    await db.collection('products').doc(productId).update({
      kiasiKilichopo: firebase.firestore.FieldValue.increment(qty)
    });
    setFeedback('stockInMsg', 'Stock imeongezwa kikamilifu.', false);
    document.getElementById('stockInQty').value = '';
  } catch (err) {
    console.error(err);
    setFeedback('stockInMsg', 'Hitilafu, jaribu tena.', true);
  }
});

// ---------- STOCK IN: sajili bidhaa mpya ----------
document.getElementById('addNewProductBtn').addEventListener('click', async () => {
  const jina = document.getElementById('newProductName').value.trim();
  const aina = document.getElementById('newProductCategory').value;
  const qty = Number(document.getElementById('newProductQty').value);

  if (!jina) return setFeedback('stockInMsg', 'Weka jina la bidhaa.', true);
  if (!qty || qty <= 0) return setFeedback('stockInMsg', 'Weka kiasi cha awali sahihi.', true);

  const exists = allProducts.some(p => p.jina.toLowerCase() === jina.toLowerCase());
  if (exists) {
    return setFeedback('stockInMsg', 'Bidhaa hii ipo tayari - tumia "Bidhaa Iliyopo" kuongeza stock.', true);
  }

  try {
    await db.collection('products').add({
      jina,
      aina,
      kiasiKilichopo: qty,
      jumlaKiasiKimeuzwa: 0,
      jumlaMapato: 0,
      tarehe: firebase.firestore.FieldValue.serverTimestamp()
    });
    setFeedback('stockInMsg', 'Bidhaa mpya imesajiliwa kikamilifu.', false);
    document.getElementById('newProductName').value = '';
    document.getElementById('newProductQty').value = '';
  } catch (err) {
    console.error(err);
    setFeedback('stockInMsg', 'Hitilafu, jaribu tena.', true);
  }
});

// ===================================================
// SALES TEACHER: kuuza bidhaa (transaction - stock inapungua)
// ===================================================
async function sellProduct(selectId, priceId, qtyId, msgId, hintId) {
  const productId = document.getElementById(selectId).value;
  const price = Number(document.getElementById(priceId).value);
  const qty = Number(document.getElementById(qtyId).value);

  if (!productId) return setFeedback(msgId, 'Chagua bidhaa kwanza.', true);
  if (!price || price <= 0) return setFeedback(msgId, 'Weka bei sahihi.', true);
  if (!qty || qty <= 0) return setFeedback(msgId, 'Weka kiasi sahihi.', true);

  const productRef = db.collection('products').doc(productId);

  try {
    await db.runTransaction(async (transaction) => {
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists) throw new Error('Bidhaa haipo tena.');

      const product = productSnap.data();
      if (product.kiasiKilichopo < qty) {
        throw new Error(`Stock haitoshi. Iliyopo ni ${product.kiasiKilichopo} tu.`);
      }

      transaction.update(productRef, {
        kiasiKilichopo: product.kiasiKilichopo - qty,
        jumlaKiasiKimeuzwa: (product.jumlaKiasiKimeuzwa || 0) + qty,
        jumlaMapato: (product.jumlaMapato || 0) + (price * qty)
      });

      const saleRef = db.collection('sales').doc();
      transaction.set(saleRef, {
        productId,
        jinaLaBidhaa: product.jina,
        aina: product.aina,
        kiasiKilichouzwa: qty,
        beiKwaKimoja: price,
        jumla: price * qty,
        aliyeuza: currentUser.username,
        tarehe: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    setFeedback(msgId, 'Mauzo yamesajiliwa kikamilifu.', false);
    document.getElementById(priceId).value = '';
    document.getElementById(qtyId).value = '';
    updateStockHint(selectId, hintId);
  } catch (err) {
    console.error(err);
    setFeedback(msgId, err.message || 'Hitilafu, jaribu tena.', true);
  }
}

document.getElementById('uniformSellBtn').addEventListener('click', () => {
  sellProduct('uniformProductSelect', 'uniformPrice', 'uniformQty', 'uniformMsg', 'uniformStockHint');
});
document.getElementById('stationerySellBtn').addEventListener('click', () => {
  sellProduct('stationeryProductSelect', 'stationeryPrice', 'stationeryQty', 'stationeryMsg', 'stationeryStockHint');
});

// ===================================================
// SALES TEACHER: HARIRI / FUTA MAUZO (stock inasahihishwa)
// ===================================================
function openEditSaleModal(saleId) {
  const sale = allSales.find(s => s.id === saleId);
  if (!sale) return;

  document.getElementById('editSaleModal').dataset.saleId = saleId;
  document.getElementById('editSaleProductLabel').textContent =
    `Bidhaa: ${sale.jinaLaBidhaa} (${sale.aina === 'uniform' ? 'Uniform' : 'Stationery'})`;
  document.getElementById('editSalePrice').value = sale.beiKwaKimoja;
  document.getElementById('editSaleQty').value = sale.kiasiKilichouzwa;
  document.getElementById('editSaleMsg').textContent = '';
  document.getElementById('editSaleModal').classList.remove('hidden');
}
document.getElementById('cancelEditSaleBtn').addEventListener('click', () => {
  document.getElementById('editSaleModal').classList.add('hidden');
});

document.getElementById('submitEditSaleBtn').addEventListener('click', async () => {
  const saleId = document.getElementById('editSaleModal').dataset.saleId;
  const newPrice = Number(document.getElementById('editSalePrice').value);
  const newQty = Number(document.getElementById('editSaleQty').value);

  if (!newPrice || newPrice <= 0) return setFeedback('editSaleMsg', 'Weka bei sahihi.', true);
  if (!newQty || newQty <= 0) return setFeedback('editSaleMsg', 'Weka kiasi sahihi.', true);

  const saleRef = db.collection('sales').doc(saleId);

  try {
    await db.runTransaction(async (transaction) => {
      const saleSnap = await transaction.get(saleRef);
      if (!saleSnap.exists) throw new Error('Mauzo haya hayapo tena.');
      const sale = saleSnap.data();

      const productRef = db.collection('products').doc(sale.productId);
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists) throw new Error('Bidhaa husika haipo tena.');
      const product = productSnap.data();

      // Rejesha kiasi cha zamani kwenye stock, kisha toa kiasi kipya
      const stockBaada = product.kiasiKilichopo + sale.kiasiKilichouzwa - newQty;
      if (stockBaada < 0) {
        throw new Error(`Stock haitoshi kwa mabadiliko hayo. Iliyopo ni ${product.kiasiKilichopo + sale.kiasiKilichouzwa} tu.`);
      }

      // Sahihisha jumla za kudumu: toa mauzo ya zamani, weka mapya
      const idadiMpya = (product.jumlaKiasiKimeuzwa || 0) - sale.kiasiKilichouzwa + newQty;
      const mapatoMpya = (product.jumlaMapato || 0) - sale.jumla + (newPrice * newQty);

      transaction.update(productRef, {
        kiasiKilichopo: stockBaada,
        jumlaKiasiKimeuzwa: idadiMpya,
        jumlaMapato: mapatoMpya
      });
      transaction.update(saleRef, {
        beiKwaKimoja: newPrice,
        kiasiKilichouzwa: newQty,
        jumla: newPrice * newQty
      });
    });

    setFeedback('editSaleMsg', 'Mauzo yamesahihishwa.', false);
    setTimeout(() => document.getElementById('editSaleModal').classList.add('hidden'), 800);
  } catch (err) {
    console.error(err);
    setFeedback('editSaleMsg', err.message || 'Hitilafu, jaribu tena.', true);
  }
});

function confirmDeleteSale(saleId) {
  const sale = allSales.find(s => s.id === saleId);
  if (!sale) return;

  openConfirmDelete(`Utafuta mauzo ya "${sale.jinaLaBidhaa}" (kiasi ${sale.kiasiKilichouzwa}). Stock itarejeshwa.`, async () => {
    const saleRef = db.collection('sales').doc(saleId);
    try {
      await db.runTransaction(async (transaction) => {
        const saleSnap = await transaction.get(saleRef);
        if (!saleSnap.exists) return;
        const saleData = saleSnap.data();

        const productRef = db.collection('products').doc(saleData.productId);
        const productSnap = await transaction.get(productRef);

        if (productSnap.exists) {
          const product = productSnap.data();
          transaction.update(productRef, {
            kiasiKilichopo: product.kiasiKilichopo + saleData.kiasiKilichouzwa,
            jumlaKiasiKimeuzwa: (product.jumlaKiasiKimeuzwa || 0) - saleData.kiasiKilichouzwa,
            jumlaMapato: (product.jumlaMapato || 0) - saleData.jumla
          });
        }
        transaction.delete(saleRef);
      });
    } catch (err) {
      console.error(err);
      alert('Hitilafu wakati wa kufuta mauzo.');
    }
  });
}

// ---------- LAZY LOADER: jsPDF (inapakiwa tu pale inapohitajika) ----------
let pdfLibsLoaded = false;
function loadPdfLibs() {
  return new Promise((resolve, reject) => {
    if (pdfLibsLoaded) return resolve();
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s2.onload = () => { pdfLibsLoaded = true; resolve(); };
      s2.onerror = reject;
      document.body.appendChild(s2);
    };
    s1.onerror = reject;
    document.body.appendChild(s1);
  });
}

// ===================================================
// DOWNLOAD SUMMARY YA MWEZI (PDF)
// ===================================================
document.getElementById('downloadSummaryBtn').addEventListener('click', async () => {
  const monthValue = document.getElementById('summaryMonthInput').value; // "YYYY-MM"
  if (!monthValue) {
    return setFeedback('summaryMsg', 'Chagua mwezi kwanza.', true);
  }

  const [year, month] = monthValue.split('-').map(Number);

  setFeedback('summaryMsg', 'Inasoma mauzo ya mwezi huo, subiri kidogo...', false);

  // Tunasoma moja kwa moja kutoka Firestore (siyo kwenye cache ya 300
  // ya karibuni) - hii inahakikisha miezi ya nyuma bado ni sahihi
  // kabisa hata baada ya sales collection kuwa kubwa sana.
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  let salesOfMonth;
  try {
    const snap = await db.collection('sales')
      .where('tarehe', '>=', firebase.firestore.Timestamp.fromDate(startDate))
      .where('tarehe', '<', firebase.firestore.Timestamp.fromDate(endDate))
      .orderBy('tarehe', 'asc')
      .get();
    salesOfMonth = snap.docs.map(doc => doc.data());
  } catch (err) {
    console.error(err);
    return setFeedback('summaryMsg', 'Imeshindwa kusoma mauzo. Jaribu tena.', true);
  }

  if (salesOfMonth.length === 0) {
    return setFeedback('summaryMsg', 'Hakuna mauzo kwa mwezi huu.', true);
  }

  setFeedback('summaryMsg', 'Inatengeneza PDF, subiri kidogo...', false);

  try {
    await loadPdfLibs();
  } catch (err) {
    console.error(err);
    return setFeedback('summaryMsg', 'Imeshindwa kupakia maktaba ya PDF. Hakiki mtandao wako.', true);
  }

  // Chukua logo ya watermark (kama itashindikana, PDF itaendelea bila watermark)
  let watermarkDataUrl = null;
  try {
    watermarkDataUrl = await getPdfWatermarkDataUrl();
  } catch (err) {
    console.error('Watermark logo haikupatikana:', err);
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('Bortony Pre & Primary School', 14, 18);
  doc.setFontSize(12);
  doc.text(`Summary ya Mauzo - ${monthValue}`, 14, 26);

  const tableRows = salesOfMonth.map(s => [
    s.tarehe.toDate().toLocaleDateString('sw-TZ'),
    s.jinaLaBidhaa,
    s.aina === 'uniform' ? 'Uniform' : 'Stationery',
    s.kiasiKilichouzwa,
    formatMoney(s.beiKwaKimoja),
    formatMoney(s.jumla)
  ]);

  const grandTotal = salesOfMonth.reduce((sum, s) => sum + Number(s.jumla || 0), 0);

  doc.autoTable({
    startY: 34,
    head: [['Tarehe', 'Bidhaa', 'Aina', 'Kiasi', 'Bei/Kimoja', 'Jumla']],
    body: tableRows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [13, 34, 64] },
    didDrawPage: function () {
      // Watermark ya logo - inaonekana kwa uwazi mwepesi katikati ya kila ukurasa
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      if (watermarkDataUrl) {
        const imgWidth = 110;
        const imgHeight = imgWidth * (197 / 250); // uwiano wa asili wa badge (250x197)
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.addImage(
          watermarkDataUrl, 'PNG',
          (pageWidth - imgWidth) / 2,
          (pageHeight - imgHeight) / 2,
          imgWidth, imgHeight
        );
        doc.restoreGraphicsState();
      }

      // Footer - kila ukurasa
      const footerY = pageHeight - 20;
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('© 2026 JohnsonDev85. All rights reserved!', pageWidth / 2, footerY, { align: 'center' });
      doc.text('Built by Johnson Yona', pageWidth / 2, footerY + 4, { align: 'center' });
      doc.text('Contacts: 0774 633 472 / 0624 399 338', pageWidth / 2, footerY + 8, { align: 'center' });
      doc.text('Email: jyona0607@gmail.com', pageWidth / 2, footerY + 12, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
  });

  const finalY = doc.lastAutoTable.finalY || 40;
  doc.setFontSize(12);
  doc.text(`JUMLA KUU: TSh ${formatMoney(grandTotal)}`, 14, finalY + 12);

  doc.save(`Bortony-Sales-Summary-${monthValue}.pdf`);
  setFeedback('summaryMsg', 'PDF imepakuliwa kikamilifu.', false);
});
