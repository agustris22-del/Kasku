const STORAGE_KEY = 'kasku_finance_v2';

const CATEGORIES = {
  masuk: ['Gaji', 'Bisnis', 'Bonus / Lainnya'],
  keluar: ['Makan', 'Jajan', 'Ongkos', 'Laundry', 'Sekolah Anak', 'Kos / Tagihan', 'Belanja Harian', 'Bayar Hutang', 'Lainnya']
};

const CAT_ICONS = {
  'Gaji': '💵', 'Bisnis': '💼', 'Bonus / Lainnya': '✨',
  'Makan': '🍽️', 'Jajan': '🧋', 'Ongkos': '🚌', 'Laundry': '🧺',
  'Sekolah Anak': '🎒', 'Kos / Tagihan': '🏠', 'Belanja Harian': '🛒',
  'Bayar Hutang': '📋', 'Lainnya': '📌'
};

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const DEFAULT_STATE = {
  transactions: [],
  debts: [],
  settings: {
    userName: 'Catatan Keuangan Pribadi',
    targetDaily: 100000,
    targetWeekly: 700000,
    monthBudget: 3500000,
    defaultSalary: 5000000
  }
};

let state = loadState();
let currentTxType = 'keluar';
let currentHistoryFilter = 'semua';
let editingDebtId = null;
let chart7DaysInstance = null;
let chartCatInstance = null;
let deferredInstallPrompt = null;
let confirmCallback = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    const p = JSON.parse(raw);
    return {
      transactions: p.transactions || [],
      debts: p.debts || [],
      settings: { ...DEFAULT_STATE.settings, ...(p.settings || {}) }
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function getLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getMonthStr(d = new Date()) { return getLocalDateStr(d).slice(0, 7); }

function formatMonthLabel(ym) {
  const [y, m] = (ym || getMonthStr()).split('-');
  return `${BULAN_ID[Number(m) - 1] || ''} ${y}`;
}

function formatRp(num) {
  const n = Number(num) || 0;
  return (n < 0 ? '-Rp ' : 'Rp ') + new Intl.NumberFormat('id-ID').format(Math.abs(n));
}

function parseRpInput(val) {
  return Number(String(val || '').replace(/\D/g, '')) || 0;
}

function formatRpInput(val) {
  const digits = String(val || '').replace(/\D/g, '');
  if (!digits) return '';
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(digits));
}

function bindRpInputs() {
  ['txAmount', 'debtAmount', 'setTargetDaily', 'setTargetWeekly', 'setMonthBudget', 'setDefaultSalary'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.type = 'text';
    el.inputMode = 'numeric';
    el.placeholder = 'Rp 0';
    el.addEventListener('input', () => {
      el.value = formatRpInput(el.value);
    });
  });
}

function initCustomUI() {
  // 1. Ubah teks Backup & Pulihkan Data (JSON) -> Keuanganmu
  const profilPage = document.getElementById('page-profil');
  if (profilPage) {
    profilPage.querySelectorAll('button, label').forEach(el => {
      if (el.textContent.includes('Backup Data')) {
        el.textContent = '💾 Backup Data Keuanganmu';
      } else if (el.textContent.includes('Pulihkan Data')) {
        const input = el.querySelector('input');
        el.textContent = '📂 Pulihkan Data Keuanganmu';
        if (input) el.appendChild(input);
      }
    });
  }

  // 2. Ganti pemilih bulan bawaan browser dengan tombol geser bulan yang rapi
  const monthInp = document.getElementById('analyticsMonth');
  if (monthInp && !document.getElementById('customMonthPicker')) {
    monthInp.style.display = 'none';
    const picker = document.createElement('div');
    picker.id = 'customMonthPicker';
    picker.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:6px 10px;margin-top:6px;';
    picker.innerHTML = `
      <button type="button" onclick="shiftAnalyticsMonth(-1)" style="border:none;background:#FFFFFF;border-radius:8px;width:36px;height:36px;font-size:20px;font-weight:700;color:#059669;box-shadow:0 1px 3px rgba(0,0,0,0.08);cursor:pointer;">‹</button>
      <span id="customMonthLabel" style="font-weight:700;font-size:14px;color:#0F172A;">${formatMonthLabel(monthInp.value)}</span>
      <button type="button" onclick="shiftAnalyticsMonth(1)" style="border:none;background:#FFFFFF;border-radius:8px;width:36px;height:36px;font-size:20px;font-weight:700;color:#059669;box-shadow:0 1px 3px rgba(0,0,0,0.08);cursor:pointer;">›</button>
    `;
    monthInp.parentNode.insertBefore(picker, monthInp.nextSibling);
  }

  // 3. Tambahkan Copyright Agus Trisna di bagian paling bawah setiap halaman
  document.querySelectorAll('.page').forEach(page => {
    if (page.querySelector('.kasku-copyright')) return;
    const footer = document.createElement('div');
    footer.className = 'kasku-copyright';
    footer.style.cssText = 'text-align:center;font-size:12px;color:#94A3B8;padding:18px 0 8px;';
    footer.textContent = '© 2026 Agus Trisna';
    page.appendChild(footer);
  });
}

function shiftAnalyticsMonth(delta) {
  const inp = document.getElementById('analyticsMonth');
  const [y, m] = (inp.value || getMonthStr()).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  inp.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const lbl = document.getElementById('customMonthLabel');
  if (lbl) lbl.textContent = formatMonthLabel(inp.value);
  renderAnalytics();
}

function initCustomConfirm() {
  if (document.getElementById('customConfirmModal')) return;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.id = 'customConfirmModal';
  wrap.style.alignItems = 'center';
  wrap.style.padding = '20px';
  wrap.onclick = (e) => { if (e.target.id === 'customConfirmModal') closeModal('customConfirmModal'); };
  wrap.innerHTML = `
    <div class="modal-sheet" style="border-radius:18px; padding:20px; max-width:360px;">
      <div class="modal-header" style="margin-bottom:10px;">
        <span class="modal-title" id="confirmModalTitle">Konfirmasi</span>
        <button class="modal-close" onclick="closeModal('customConfirmModal')">×</button>
      </div>
      <p id="confirmModalMsg" style="font-size:14px; color:#475569; line-height:1.5; margin-bottom:18px;"></p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <button class="btn btn-outline" onclick="closeModal('customConfirmModal')">Batal</button>
        <button class="btn btn-primary" id="confirmModalOkBtn">Ya</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  document.getElementById('confirmModalOkBtn').onclick = () => {
    closeModal('customConfirmModal');
    if (typeof confirmCallback === 'function') confirmCallback();
  };
}

function showConfirm(title, message, onOk, okText = 'Ya', isDanger = false) {
  initCustomConfirm();
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalMsg').textContent = message;
  const okBtn = document.getElementById('confirmModalOkBtn');
  okBtn.textContent = okText;
  okBtn.className = isDanger ? 'btn btn-danger-outline' : 'btn btn-primary';
  confirmCallback = onOk;
  document.getElementById('customConfirmModal').classList.add('open');
}

function formatShortDate(str) {
  const [y, m, d] = str.split('-');
  const bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(d)} ${bln[Number(m) - 1]} ${y}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const titles = { beranda: 'Beranda', riwayat: 'Riwayat', analisa: 'Analisa', profil: 'Profil' };
  document.getElementById('pageTitle').textContent = titles[tab];
  if (tab === 'beranda') renderHome();
  if (tab === 'riwayat') { renderHistory(); renderDebts(); }
  if (tab === 'analisa') renderAnalytics();
  if (tab === 'profil') renderProfileForm();
}

function switchHistorySubtab(sub) {
  const isTx = sub === 'tx';
  document.getElementById('subtab-tx-btn').classList.toggle('active', isTx);
  document.getElementById('subtab-debt-btn').classList.toggle('active', !isTx);
  document.getElementById('history-tx-view').style.display = isTx ? 'block' : 'none';
  document.getElementById('history-debt-view').style.display = isTx ? 'none' : 'block';
  if (isTx) renderHistory(); else renderDebts();
}

function goToDebtSection() { switchTab('riwayat'); switchHistorySubtab('debt'); }

function openTxModal(type = 'keluar', presetCat = '') {
  setTxType(type);
  document.getElementById('txDate').value = getLocalDateStr();
  document.getElementById('txAmount').value = '';
  document.getElementById('txNote').value = '';
  if (presetCat) document.getElementById('txCategory').value = presetCat;
  document.getElementById('txModal').classList.add('open');
  setTimeout(() => document.getElementById('txAmount').focus(), 120);
}

function setTxType(type) {
  currentTxType = type;
  document.getElementById('typeBtnMasuk').classList.toggle('active', type === 'masuk');
  document.getElementById('typeBtnKeluar').classList.toggle('active', type === 'keluar');
  document.getElementById('txModalTitle').textContent = type === 'masuk' ? 'Catat Pemasukan (Gaji/Bisnis)' : 'Catat Pengeluaran';
  document.getElementById('salaryQuickFill').style.display = type === 'masuk' ? 'block' : 'none';
  document.getElementById('txCategory').innerHTML = CATEGORIES[type]
    .map(c => `<option value="${c}">${CAT_ICONS[c] || ''} ${c}</option>`).join('');
}

function fillDefaultSalary() {
  document.getElementById('txAmount').value = formatRpInput(state.settings.defaultSalary || 0);
  document.getElementById('txCategory').value = 'Gaji';
  document.getElementById('txNote').value = 'Gaji Bulanan';
}

function submitTransaction() {
  const amount = parseRpInput(document.getElementById('txAmount').value);
  const category = document.getElementById('txCategory').value;
  const date = document.getElementById('txDate').value || getLocalDateStr();
  const note = document.getElementById('txNote').value.trim() || category;
  if (!amount || amount <= 0) return showToast('Masukkan nominal yang valid');

  state.transactions.unshift({ id: 'tx_' + Date.now(), type: currentTxType, amount, category, date, note });
  saveState();
  closeModal('txModal');
  showToast(currentTxType === 'masuk' ? 'Pemasukan tersimpan' : 'Pengeluaran tersimpan');
  renderAllActive();
}

function deleteTransaction(id) {
  showConfirm('Hapus Transaksi', 'Yakin ingin menghapus transaksi ini?', () => {
    state.transactions = state.transactions.filter(t => t.id !== id);
    saveState();
    showToast('Transaksi dihapus');
    renderAllActive();
  }, 'Hapus', true);
}

function openDebtModal(id = null) {
  editingDebtId = id;
  const titleEl = document.querySelector('#debtModal .modal-title');
  if (id) {
    const d = state.debts.find(x => x.id === id);
    if (!d) return;
    titleEl.textContent = 'Ubah Catatan Hutang';
    document.getElementById('debtName').value = d.name;
    document.getElementById('debtAmount').value = formatRpInput(d.amount);
    document.getElementById('debtDue').value = d.dueDate || getLocalDateStr();
    document.getElementById('debtNote').value = d.note || '';
  } else {
    titleEl.textContent = 'Catat Hutang Baru';
    document.getElementById('debtName').value = '';
    document.getElementById('debtAmount').value = '';
    document.getElementById('debtDue').value = getLocalDateStr();
    document.getElementById('debtNote').value = '';
  }
  document.getElementById('debtModal').classList.add('open');
}

function submitDebt() {
  const name = document.getElementById('debtName').value.trim();
  const amount = parseRpInput(document.getElementById('debtAmount').value);
  const dueDate = document.getElementById('debtDue').value || getLocalDateStr();
  const note = document.getElementById('debtNote').value.trim();
  if (!name || !amount || amount <= 0) return showToast('Lengkapi nama & nominal hutang');

  if (editingDebtId) {
    const idx = state.debts.findIndex(x => x.id === editingDebtId);
    if (idx !== -1) state.debts[idx] = { ...state.debts[idx], name, amount, dueDate, note };
    editingDebtId = null;
    showToast('Catatan hutang diperbarui');
  } else {
    state.debts.unshift({ id: 'db_' + Date.now(), name, amount, dueDate, note, status: 'belum' });
    showToast('Hutang ditambahkan');
  }

  saveState();
  closeModal('debtModal');
  renderAllActive();
}

function markDebtPaid(id) {
  const d = state.debts.find(x => x.id === id);
  if (!d) return;
  showConfirm(
    'Lunasi Hutang',
    `Tandai hutang "${d.name}" (${formatRp(d.amount)}) LUNAS dan catat sebagai pengeluaran hari ini?`,
    () => {
      d.status = 'lunas';
      d.paidDate = getLocalDateStr();
      state.transactions.unshift({
        id: 'tx_' + Date.now(), type: 'keluar', amount: d.amount,
        category: 'Bayar Hutang', date: getLocalDateStr(), note: 'Pelunasan: ' + d.name
      });
      saveState();
      showToast('Hutang ditandai lunas');
      renderAllActive();
    },
    'Ya, Lunasi',
    false
  );
}

function deleteDebt(id) {
  showConfirm('Hapus Hutang', 'Yakin ingin menghapus catatan hutang ini?', () => {
    state.debts = state.debts.filter(d => d.id !== id);
    saveState();
    showToast('Hutang dihapus');
    renderAllActive();
  }, 'Hapus', true);
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeModalOnBg(e, id) { if (e.target.id === id) closeModal(id); }

function renderHome() {
  const today = getLocalDateStr();
  const curMonth = getMonthStr();
  let inToday = 0, outToday = 0, outMonth = 0, net7Days = 0;

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    last7.push(getLocalDateStr(d));
  }
  const set7 = new Set(last7);

  state.transactions.forEach(t => {
    if (t.date === today) { if (t.type === 'masuk') inToday += t.amount; else outToday += t.amount; }
    if (set7.has(t.date)) net7Days += (t.type === 'masuk' ? t.amount : -t.amount);
    if (t.type === 'keluar' && t.date.startsWith(curMonth)) outMonth += t.amount;
  });

  const netToday = inToday - outToday;
  document.getElementById('homeNetToday').textContent = formatRp(netToday);
  document.getElementById('homeInToday').textContent = formatRp(inToday);
  document.getElementById('homeOutToday').textContent = formatRp(outToday);

  const openDebts = state.debts.filter(d => d.status !== 'lunas');
  document.getElementById('homeTotalDebt').textContent = formatRp(openDebts.reduce((s, d) => s + d.amount, 0));
  document.getElementById('homeDebtCount').textContent = `${openDebts.length} belum lunas`;

  document.getElementById('homeOutMonth').textContent = formatRp(outMonth);
  document.getElementById('homeMonthBudget').textContent = `Anggaran: ${formatRp(state.settings.monthBudget)}`;

  updateProgress('targetDailyText', 'targetDailyBar', netToday, state.settings.targetDaily);
  updateProgress('targetWeeklyText', 'targetWeeklyBar', net7Days, state.settings.targetWeekly);
  renderChart7Days(last7);

  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  document.getElementById('homeRecentList').innerHTML = recent.length
    ? recent.map(txItemHTML).join('')
    : '<div class="empty-state">Belum ada transaksi.<br><button class="btn btn-outline btn-sm" style="margin-top:10px" onclick="loadSampleData()">✨ Coba Data Contoh</button></div>';
}

function updateProgress(textId, barId, actual, target) {
  const safe = Math.max(1, Number(target) || 1);
  const pct = Math.max(0, Math.round((actual / safe) * 100));
  document.getElementById(textId).textContent = `${formatRp(actual)} / ${formatRp(target)} (${pct}%)`;
  const bar = document.getElementById(barId);
  bar.style.width = Math.min(100, pct) + '%';
  bar.className = 'progress-fill' + (actual < 0 ? ' danger' : pct < 50 ? ' warn' : '');
}

function renderChart7Days(dates) {
  if (typeof Chart === 'undefined') return;
  const inData = dates.map(d => state.transactions.filter(t => t.date === d && t.type === 'masuk').reduce((s, t) => s + t.amount, 0));
  const outData = dates.map(d => state.transactions.filter(t => t.date === d && t.type === 'keluar').reduce((s, t) => s + t.amount, 0));
  const ctx = document.getElementById('chart7Days').getContext('2d');
  if (chart7DaysInstance) chart7DaysInstance.destroy();
  chart7DaysInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)),
      datasets: [
        { label: 'Masuk', data: inData, backgroundColor: '#10B981', borderRadius: 6 },
        { label: 'Keluar', data: outData, backgroundColor: '#F87171', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: v => v >= 1e6 ? (v / 1e6) + 'jt' : v >= 1e3 ? (v / 1e3) + 'rb' : v } },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

function txItemHTML(t) {
  const isIn = t.type === 'masuk';
  const badgeClass = isIn ? 'bg-in' : (t.category === 'Sekolah Anak' ? 'bg-debt' : (t.category === 'Makan' || t.category === 'Jajan' ? 'bg-food' : 'bg-out'));
  return `<div class="tx-item">
    <div class="tx-left">
      <div class="tx-badge ${badgeClass}">${CAT_ICONS[t.category] || '📌'}</div>
      <div class="tx-info">
        <div class="tx-title">${escapeHtml(t.note)}</div>
        <div class="tx-meta">${escapeHtml(t.category)} • ${formatShortDate(t.date)}</div>
      </div>
    </div>
    <div class="tx-right">
      <span class="tx-amount ${isIn ? 'amt-in' : 'amt-out'}">${isIn ? '+' : '-'}${formatRp(t.amount)}</span>
      <button class="btn-icon-del" onclick="deleteTransaction('${t.id}')">✕</button>
    </div>
  </div>`;
}

function setHistoryFilter(filter, btn) {
  currentHistoryFilter = filter;
  document.querySelectorAll('#filterChips .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

function renderHistory() {
  const q = (document.getElementById('searchTx').value || '').toLowerCase();
  const list = state.transactions.filter(t => {
    if (currentHistoryFilter === 'masuk' && t.type !== 'masuk') return false;
    if (currentHistoryFilter === 'keluar' && t.type !== 'keluar') return false;
    if (!['semua', 'masuk', 'keluar'].includes(currentHistoryFilter) && t.category !== currentHistoryFilter) return false;
    if (q && !t.note.toLowerCase().includes(q) && !t.category.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById('historyTxList').innerHTML = list.length
    ? list.map(txItemHTML).join('') : '<div class="empty-state">Tidak ada transaksi ditemukan.</div>';
}

function renderDebts() {
  const el = document.getElementById('debtListContainer');
  if (!state.debts.length) { el.innerHTML = '<div class="card"><div class="empty-state">Belum ada catatan hutang.</div></div>'; return; }
  el.innerHTML = state.debts.map(d => {
    const paid = d.status === 'lunas';
    return `<div class="debt-item">
      <div class="debt-top">
        <div>
          <div class="debt-name">${escapeHtml(d.name)}</div>
          <div class="tx-meta">Jatuh tempo: ${formatShortDate(d.dueDate)}${d.note ? ' • ' + escapeHtml(d.note) : ''}</div>
        </div>
        <div class="debt-amt ${paid ? 'lunas' : ''}">${formatRp(d.amount)}</div>
      </div>
      <div class="debt-footer">
        <span class="status-pill ${paid ? 'pill-paid' : 'pill-open'}">${paid ? 'Lunas' : 'Belum Lunas'}</span>
        <div style="display:flex;gap:6px">
          ${!paid ? `<button class="btn btn-primary btn-sm" onclick="markDebtPaid('${d.id}')">✓ Lunasi</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="openDebtModal('${d.id}')">Ubah</button>
          <button class="btn btn-outline btn-sm" onclick="deleteDebt('${d.id}')">Hapus</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderAnalytics() {
  const inp = document.getElementById('analyticsMonth');
  if (!inp.value) inp.value = getMonthStr();
  const m = inp.value;
  const lbl = document.getElementById('customMonthLabel');
  if (lbl) lbl.textContent = formatMonthLabel(m);

  const txs = state.transactions.filter(t => t.date.startsWith(m));
  const totalIn = txs.filter(t => t.type === 'masuk').reduce((s, t) => s + t.amount, 0);
  const totalOut = txs.filter(t => t.type === 'keluar').reduce((s, t) => s + t.amount, 0);
  const totalSchool = txs.filter(t => t.type === 'keluar' && t.category === 'Sekolah Anak').reduce((s, t) => s + t.amount, 0);
  const net = totalIn - totalOut;
  const ratio = totalIn > 0 ? Math.round((net / totalIn) * 100) : 0;

  document.getElementById('anTotalIn').textContent = formatRp(totalIn);
  document.getElementById('anTotalOut').textContent = formatRp(totalOut);
  document.getElementById('anTotalNet').textContent = formatRp(net);
  document.getElementById('anTotalNet').style.color = net >= 0 ? 'var(--primary)' : 'var(--danger)';
  document.getElementById('anTotalSchool').textContent = formatRp(totalSchool);
  document.getElementById('analyticsSavingsRate').textContent = `Rasio Bersih: ${ratio}%`;

  const map = {};
  txs.filter(t => t.type === 'keluar').forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);

  if (typeof Chart !== 'undefined') {
    const ctx = document.getElementById('chartCategory').getContext('2d');
    if (chartCatInstance) chartCatInstance.destroy();
    const colors = ['#059669', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#64748B', '#0EA5E9'];
    chartCatInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: entries.length ? entries.map(e => e[0]) : ['Belum ada data'],
        datasets: [{ data: entries.length ? entries.map(e => e[1]) : [1], backgroundColor: entries.length ? colors : ['#E2E8F0'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } } }
    });
  }

  document.getElementById('categoryBreakdownList').innerHTML = entries.length
    ? entries.map(([cat, amt]) => `<div class="tx-item">
        <div class="tx-left">
          <div class="tx-badge bg-out">${CAT_ICONS[cat] || '📌'}</div>
          <div><div class="tx-title">${escapeHtml(cat)}</div><div class="tx-meta">${totalOut ? Math.round((amt / totalOut) * 100) : 0}% dari pengeluaran</div></div>
        </div>
        <div class="tx-amount amt-out">${formatRp(amt)}</div>
      </div>`).join('')
    : '<div class="empty-state" style="padding:10px">Belum ada pengeluaran di bulan ini.</div>';
}

function exportMonthlyPDF() {
  const m = document.getElementById('analyticsMonth').value || getMonthStr();
  const txs = state.transactions.filter(t => t.date.startsWith(m)).sort((a, b) => a.date.localeCompare(b.date));
  if (!window.jspdf) return window.print();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const totalIn = txs.filter(t => t.type === 'masuk').reduce((s, t) => s + t.amount, 0);
  const totalOut = txs.filter(t => t.type === 'keluar').reduce((s, t) => s + t.amount, 0);
  const totalSchool = txs.filter(t => t.type === 'keluar' && t.category === 'Sekolah Anak').reduce((s, t) => s + t.amount, 0);
  const activeDebt = state.debts.filter(d => d.status !== 'lunas').reduce((s, d) => s + d.amount, 0);

  doc.setFontSize(16); doc.text(`Laporan Keuangan Bulanan (${formatMonthLabel(m)})`, 14, 18);
  doc.setFontSize(10); doc.setTextColor(100);
  doc.text(`Akun: ${state.settings.userName} | Dicetak: ${formatShortDate(getLocalDateStr())}`, 14, 25);

  doc.autoTable({
    startY: 31, head: [['Ringkasan', 'Nominal']],
    body: [
      ['Total Pemasukan (Gaji & Bisnis)', formatRp(totalIn)],
      ['Total Pengeluaran', formatRp(totalOut)],
      ['Saldo Bersih Bulan Ini', formatRp(totalIn - totalOut)],
      ['Total Pengeluaran Sekolah Anak', formatRp(totalSchool)],
      ['Total Hutang Belum Lunas', formatRp(activeDebt)]
    ],
    theme: 'grid', headStyles: { fillColor: [5, 150, 105] }
  });

  const rows = txs.map(t => [formatShortDate(t.date), t.type === 'masuk' ? 'Masuk' : 'Keluar', t.category, t.note, (t.type === 'masuk' ? '+' : '-') + formatRp(t.amount)]);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Tanggal', 'Jenis', 'Kategori', 'Catatan', 'Nominal']],
    body: rows.length ? rows : [['-', '-', '-', 'Tidak ada transaksi', '-']],
    theme: 'striped', headStyles: { fillColor: [15, 23, 42] }, styles: { fontSize: 9 }
  });

  doc.save(`Laporan_Keuangan_${m}.pdf`);
  showToast('PDF bulanan berhasil diunduh');
}

function renderProfileForm() {
  const s = state.settings;
  document.getElementById('setUserName').value = s.userName;
  document.getElementById('setTargetDaily').value = formatRpInput(s.targetDaily);
  document.getElementById('setTargetWeekly').value = formatRpInput(s.targetWeekly);
  document.getElementById('setMonthBudget').value = formatRpInput(s.monthBudget);
  document.getElementById('setDefaultSalary').value = formatRpInput(s.defaultSalary);
}

function saveSettings() {
  state.settings = {
    userName: document.getElementById('setUserName').value.trim() || 'Catatan Keuangan Pribadi',
    targetDaily: parseRpInput(document.getElementById('setTargetDaily').value),
    targetWeekly: parseRpInput(document.getElementById('setTargetWeekly').value),
    monthBudget: parseRpInput(document.getElementById('setMonthBudget').value),
    defaultSalary: parseRpInput(document.getElementById('setDefaultSalary').value)
  };
  saveState();
  showToast('Pengaturan disimpan');
}

function loadSampleData() {
  const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return getLocalDateStr(d); };
  state.transactions = [
    { id: 's1', type: 'masuk', amount: 5000000, category: 'Gaji', date: ago(5), note: 'Gaji Bulanan' },
    { id: 's2', type: 'keluar', amount: 750000, category: 'Sekolah Anak', date: ago(4), note: 'SPP & uang buku sekolah' },
    { id: 's3', type: 'keluar', amount: 35000, category: 'Laundry', date: ago(3), note: 'Laundry kiloan mingguan' },
    { id: 's4', type: 'masuk', amount: 450000, category: 'Bisnis', date: ago(2), note: 'Hasil jualan / sampingan' },
    { id: 's5', type: 'keluar', amount: 30000, category: 'Ongkos', date: ago(1), note: 'Ongkos PP kerja' },
    { id: 's6', type: 'keluar', amount: 45000, category: 'Makan', date: ago(0), note: 'Makan siang & malam' },
    { id: 's7', type: 'keluar', amount: 20000, category: 'Jajan', date: ago(0), note: 'Jajan & minuman' }
  ];
  state.debts = [
    { id: 'd1', name: 'Cicilan Bulanan', amount: 500000, dueDate: ago(-7), note: 'Jatuh tempo akhir bulan', status: 'belum' }
  ];
  saveState();
  showToast('Data contoh dimuat');
  renderAllActive();
}

function exportBackupJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup_keuanganmu_${getLocalDateStr()}.json`;
  a.click();
  showToast('Backup data keuanganmu diunduh');
}

function importBackupJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const p = JSON.parse(ev.target.result);
      if (!Array.isArray(p.transactions)) throw 0;
      state = { transactions: p.transactions, debts: p.debts || [], settings: { ...DEFAULT_STATE.settings, ...(p.settings || {}) } };
      saveState(); showToast('Data keuanganmu dipulihkan'); renderAllActive();
    } catch { showToast('File backup tidak valid'); }
  };
  r.readAsText(file);
}

function resetAllData() {
  showConfirm('Hapus Semua Data', 'Yakin ingin menghapus semua transaksi dan hutang? Data yang dihapus tidak bisa dikembalikan.', () => {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    saveState(); showToast('Semua data direset'); renderAllActive();
  }, 'Hapus Semua', true);
}

function renderAllActive() {
  renderHome(); renderHistory(); renderDebts(); renderAnalytics(); renderProfileForm();
}

(function init() {
  bindRpInputs();
  initCustomConfirm();
  document.getElementById('todayDateBadge').textContent = formatShortDate(getLocalDateStr());
  document.getElementById('analyticsMonth').value = getMonthStr();
  initCustomUI();
  renderHome();
})();

/* PWA & OFFLINE */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstallPrompt = e;
  document.getElementById('installPwaBtn').style.display = 'inline-block';
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.getElementById('installPwaBtn').style.display = 'none';
  showToast('KasKu terpasang di layar utama');
});
async function triggerInstallPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const c = await deferredInstallPrompt.userChoice;
  if (c.outcome === 'accepted') document.getElementById('installPwaBtn').style.display = 'none';
  deferredInstallPrompt = null;
}
function updateOnlineStatus() {
  const b = document.getElementById('offlineBadge');
  if (b) b.style.display = navigator.onLine ? 'none' : 'inline-block';
}
window.addEventListener('online', () => { updateOnlineStatus(); showToast('Kembali online'); });
window.addEventListener('offline', () => { updateOnlineStatus(); showToast('Mode offline aktif'); });
updateOnlineStatus();
