(function () {
  'use strict';

  const CATEGORY_EMOJI = {
    makanan: '🍽️', jajan: '🍟', kopi: '☕', transportasi: '🚗', bensin: '⛽',
    belanja: '🛍️', groceries: '🛒', tagihan: '🧾', listrik: '💡', air: '🚰',
    internet: '📶', pulsa: '📱', hiburan: '🎬', langganan: '🔁', kesehatan: '💊',
    olahraga: '🏋️', pendidikan: '📚', hadiah: '🎁', donasi: '🤲', investasi: '📈',
    tabungan: '🏦', gaji: '💼', bonus: '🎉', freelance: '💻', keluarga: '👨‍👩‍👧',
    anak: '🧒', kecantikan: '💄', rumah: '🏠', liburan: '🧳', asuransi: '🛡️',
    utang: '📉', piutang: '📗', pajak: '🏛️', hewan: '🐾', rokok: '🚬', lainnya: '📦',
  };

  const PALETTE = ['#2dd4bf', '#818cf8', '#fb7185', '#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'];

  function formatRupiah(n) {
    const v = Math.round(Number(n) || 0);
    const sign = v < 0 ? '-' : '';
    return sign + 'Rp' + Math.abs(v).toLocaleString('id-ID');
  }

  function getToken() {
    const pathMatch = window.location.pathname.match(/^\/d\/(.+)$/);
    if (pathMatch) return pathMatch[1];
    return new URLSearchParams(window.location.search).get('token');
  }

  const token = getToken();
  if (!token) {
    document.getElementById('gate').classList.remove('hidden');
    return;
  }

  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  function api(path) {
    const sep = path.includes('?') ? '&' : '?';
    return fetch(`/api/${path}${sep}token=${encodeURIComponent(token)}`).then((r) => {
      if (!r.ok) throw new Error('API_ERROR_' + r.status);
      return r.json();
    });
  }

  function renderWallets(balances) {
    const el = document.getElementById('walletsList');
    el.innerHTML = '';
    if (!balances.length) {
      el.innerHTML = '<div class="wallet-row"><span class="name">Belum ada data</span></div>';
      return;
    }
    for (const b of balances) {
      const row = document.createElement('div');
      row.className = 'wallet-row';
      row.innerHTML = `<span class="name">👛 ${b.wallet}</span><span class="amount">${formatRupiah(b.balance)}</span>`;
      el.appendChild(row);
    }
  }

  function renderBudgets(budgets) {
    const el = document.getElementById('budgetsList');
    el.innerHTML = '';
    if (!budgets.length) {
      el.innerHTML = '<div class="budget-row"><span class="budget-cat">Belum ada budget diatur</span></div>';
      return;
    }
    for (const b of budgets.sort((x, y) => y.percent - x.percent)) {
      const cls = b.percent >= 100 ? 'danger' : b.percent >= 85 ? 'warn' : '';
      const row = document.createElement('div');
      row.className = 'budget-row';
      row.innerHTML = `
        <div class="budget-top">
          <span class="budget-cat">${CATEGORY_EMOJI[b.category] || '📦'} ${b.label}</span>
          <span class="budget-pct">${b.percent}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.min(100, b.percent)}%"></div></div>
        <div class="budget-pct">${formatRupiah(b.used)} / ${formatRupiah(b.limit)}</div>
      `;
      el.appendChild(row);
    }
  }

  function renderDonut(transactions) {
    const byCategory = new Map();
    for (const t of transactions) {
      if (t.type !== 'pengeluaran') continue;
      byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
    }
    const entries = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

    const svg = document.getElementById('donutChart');
    svg.innerHTML = '';
    const cx = 110, cy = 110, r = 80, thickness = 26;
    let angleStart = -90;

    entries.forEach(([cat, val], i) => {
      const angle = (val / total) * 360;
      const path = describeArc(cx, cy, r, angleStart, angleStart + angle, thickness);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', path);
      el.setAttribute('fill', PALETTE[i % PALETTE.length]);
      svg.appendChild(el);
      angleStart += angle;
    });

    const legend = document.getElementById('donutLegend');
    legend.innerHTML = entries
      .map(
        ([cat, val], i) =>
          `<span class="legend-item"><span class="legend-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>${CATEGORY_EMOJI[cat] || ''} ${cat} (${Math.round((val / total) * 100)}%)</span>`
      )
      .join('') || '<span class="legend-item">Belum ada data pengeluaran</span>';
  }

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx, cy, r, startAngle, endAngle, thickness) {
    const outerStart = polarToCartesian(cx, cy, r, endAngle + 90);
    const outerEnd = polarToCartesian(cx, cy, r, startAngle + 90);
    const innerStart = polarToCartesian(cx, cy, r - thickness, endAngle + 90);
    const innerEnd = polarToCartesian(cx, cy, r - thickness, startAngle + 90);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
      'M', outerStart.x, outerStart.y,
      'A', r, r, 0, largeArc, 0, outerEnd.x, outerEnd.y,
      'L', innerEnd.x, innerEnd.y,
      'A', r - thickness, r - thickness, 0, largeArc, 1, innerStart.x, innerStart.y,
      'Z',
    ].join(' ');
  }

  function renderTransactions(transactions) {
    const el = document.getElementById('txList');
    el.innerHTML = '';
    if (!transactions.length) {
      el.innerHTML = '<div class="tx-row"><span></span><span class="tx-note">Belum ada transaksi.</span><span></span></div>';
      return;
    }
    for (const t of transactions.slice(0, 60)) {
      const d = new Date(t.date);
      const tanggal = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = document.createElement('div');
      row.className = 'tx-row';
      row.innerHTML = `
        <span class="tx-emoji">${CATEGORY_EMOJI[t.category] || '📦'}</span>
        <span>
          <div class="tx-note">${t.note || t.category}</div>
          <div class="tx-date">${tanggal} · ${t.wallet}</div>
        </span>
        <span class="tx-amount ${t.type === 'pemasukan' ? 'in' : 'out'}">${t.type === 'pemasukan' ? '+' : '-'}${formatRupiah(t.amount)}</span>
      `;
      el.appendChild(row);
    }
  }

  async function loadTransactionsForPeriod(periodLabel) {
    const now = new Date();
    let from, to;
    if (periodLabel === 'bulan ini') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (periodLabel === 'bulan lalu') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else {
      from = new Date(2000, 0, 1);
      to = now;
    }
    const data = await api(`transactions?from=${from.toISOString()}&to=${to.toISOString()}`);
    renderTransactions(data.transactions);
    renderDonut(data.transactions);
  }

  function riskLabel(level) {
    if (level === 'tinggi') return '🔴 RISIKO TINGGI — beberapa budget terlewati';
    if (level === 'waspada') return '🟠 WASPADA — mendekati batas budget';
    return '🟢 AMAN — pengeluaran terkendali';
  }

  async function init() {
    try {
      const summary = await api('summary');
      document.getElementById('ownerLabel').textContent = 'Ringkasan pribadi';
      document.getElementById('scoreValue').textContent = summary.score;
      document.getElementById('riskEyebrow').textContent = riskLabel(summary.radar.riskLevel);
      document.getElementById('netFigure').textContent = formatRupiah(summary.stats.net);
      document.getElementById('focusCaption').textContent = summary.radar.focus;
      document.getElementById('incomeValue').textContent = formatRupiah(summary.stats.income);
      document.getElementById('expenseValue').textContent = formatRupiah(summary.stats.expense);

      renderWallets(summary.balances);
      renderBudgets(summary.budgets);

      await loadTransactionsForPeriod('bulan ini');
    } catch (err) {
      document.getElementById('focusCaption').textContent = 'Gagal memuat data: tautan mungkin kedaluwarsa.';
    }
  }

  document.getElementById('periodTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    loadTransactionsForPeriod(btn.dataset.period);
  });

  init();
})();
