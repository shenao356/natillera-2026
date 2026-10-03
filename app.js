/**
 * Natillera 2026 - Main Application Logic
 * Comprehensive financial management, credits engine, live interest calculation,
 * and WhatsApp digital receipt generator.
 */

// Global State
let AppState = {
  data: null,
  currentView: 'dashboard',
  creditoFilter: 'ALL',
  ahorroSubTab: 'ahorradores',
  selectedQuincenaIndex: 0,
  charts: {
    ahorro: null,
    cartera: null
  }
};

// ==========================================
// INITIALIZATION & STORAGE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  applyDashboardViewsPreferences();
  updateLiveDate();
  populateDropdowns();
  setupNavigation();

  // If a default start view was customized, open it
  if (AppState.data && AppState.data.config && AppState.data.config.defaultView) {
    navigate(AppState.data.config.defaultView);
  } else {
    refreshAllViews();
  }
  lucide.createIcons();
});

function initStorage() {
  const saved = localStorage.getItem('natillera_2026_data');
  if (saved) {
    try {
      AppState.data = JSON.parse(saved);
    } catch (e) {
      console.error('Error parsing stored data, using initial data:', e);
      AppState.data = JSON.parse(JSON.stringify(window.INITIAL_NATILLERA_DATA));
    }
  } else if (window.INITIAL_NATILLERA_DATA) {
    AppState.data = JSON.parse(JSON.stringify(window.INITIAL_NATILLERA_DATA));
    saveState();
  } else {
    showToast('Error: No se encontraron datos iniciales', 'error');
  }
}

function saveState() {
  if (AppState.data) {
    localStorage.setItem('natillera_2026_data', JSON.stringify(AppState.data));
  }
}

function updateLiveDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
  const str = now.toLocaleDateString('es-CO', options);
  const el = document.getElementById('currentDateDisplay');
  if (el) el.textContent = str.charAt(0).toUpperCase() + str.slice(1);
}

// ==========================================
// CALCULATIONS & FINANCIAL LOGIC
// ==========================================

function formatCOP(num) {
  if (num === null || num === undefined || isNaN(num)) return '$0';
  return '$' + Math.round(num).toLocaleString('es-CO');
}

function getDaysDifference(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return 0;
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));
}

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[^0-9]/g, '');
  // If user entered 10 digits starting with 3 (standard Colombia: 3001234567), prepend 57
  if (p.length === 10 && p.startsWith('3')) {
    p = '57' + p;
  }
  return p;
}

/**
 * Calculates live financial metrics for a credit item.
 * Exactly matches the Excel formulas:
 * Días: if fechaPagoLiquidacion => (fechaPago - fechaCredito) else (TODAY - fechaCredito)
 * Intereses a Hoy: ROUND(Capital * (TasaMes / 30) * Días, 0)
 * Intereses a Fecha Pago: ROUND(Capital * (TasaMes / 30) * DíasPago, 0)
 * Total Abono Interés: SUMIF(Abonos.Interes)
 * Total Abono Capital: SUMIF(Abonos.Capital)
 */
function calculateCreditMetrics(credito) {
  const todayStr = getTodayStr();
  const fechaCredito = credito.fechaCredito || todayStr;
  const isLiquidated = Boolean(credito.fechaPagoLiquidacion);
  
  const dias = isLiquidated 
    ? getDaysDifference(fechaCredito, credito.fechaPagoLiquidacion)
    : getDaysDifference(fechaCredito, todayStr);

  const tasaMes = credito.tasaMes || 0.005;
  const capital = credito.valorCredito || 0;

  // Accrued interest
  const interesesCalculados = Math.round(capital * (tasaMes / 30) * dias);
  const interesesTotales = isLiquidated 
    ? (credito.interesesCongelados !== undefined && credito.interesesCongelados !== null ? credito.interesesCongelados : interesesCalculados)
    : interesesCalculados;

  // Filter Abonos for this specific credit
  const abonos = (AppState.data.abonos || []).filter(a => {
    return a.socio.toLowerCase() === credito.socio.toLowerCase() && 
           (a.numCredito == credito.numInterno || a.creditoId === credito.id);
  });

  const totalAbonoInteres = abonos.reduce((sum, a) => sum + (parseFloat(a.abonoInteres) || 0), 0);
  const totalAbonoCapital = abonos.reduce((sum, a) => sum + (parseFloat(a.abonoCapital) || 0), 0);
  const totalAbonado = totalAbonoInteres + totalAbonoCapital;

  const saldoInteres = Math.max(0, interesesTotales - totalAbonoInteres);
  const saldoCapital = Math.max(0, capital - totalAbonoCapital);
  const totalPagarHoy = saldoInteres + saldoCapital;

  let estado = 'VIGENTE';
  if (totalPagarHoy <= 0 || isLiquidated) {
    estado = 'PAGADO';
  } else if (dias > 30) {
    estado = 'PENDIENTE';
  }

  return {
    ...credito,
    dias,
    interesesTotales,
    totalAbonoInteres,
    totalAbonoCapital,
    totalAbonado,
    saldoInteres,
    saldoCapital,
    totalPagarHoy,
    estado,
    isLiquidated
  };
}

/**
 * Consolidates total savings per member from all quincenas
 */
function getConsolidatedAhorros() {
  const result = {};
  
  (AppState.data.ahorradores || []).forEach(a => {
    result[a.nombre] = {
      ...a,
      totalAhorrado: 0,
      quincenasPagadas: 0,
      adelantadas: 0
    };
  });

  (AppState.data.quincenas || []).forEach(q => {
    if (!q.pagos) return;
    Object.keys(q.pagos).forEach(mName => {
      const payment = q.pagos[mName];
      if (result[mName]) {
        const val = parseFloat(payment.valor) || 0;
        result[mName].totalAhorrado += val;
        if (val > 0) result[mName].quincenasPagadas++;
        if (payment.formaPago && payment.formaPago.toUpperCase().includes('ADELANT')) {
          result[mName].adelantadas++;
        }
      }
    });
  });

  return result;
}

// ==========================================
// VIEWS & NAVIGATION
// ==========================================

function setupNavigation() {
  const views = ['dashboard', 'ahorros', 'creditos', 'socios', 'comprobantes', 'config'];
  // Set default view
  navigate('dashboard');
}

function navigate(viewName) {
  AppState.currentView = viewName;
  const views = ['dashboard', 'ahorros', 'creditos', 'socios', 'comprobantes', 'config'];

  views.forEach(v => {
    const sec = document.getElementById(`view-${v}`);
    const navBtn = document.getElementById(`nav-${v}`);
    const mobBtn = document.getElementById(`mobnav-${v}`);

    if (sec) {
      if (v === viewName) {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    }

    if (navBtn) {
      if (v === viewName) {
        navBtn.classList.add('active', 'bg-surface-card', 'text-white');
        navBtn.classList.remove('text-slate-300');
      } else {
        navBtn.classList.remove('active', 'bg-surface-card', 'text-white');
        navBtn.classList.add('text-slate-300');
      }
    }

    if (mobBtn) {
      if (v === viewName) {
        mobBtn.classList.add('text-indigo-400');
        mobBtn.classList.remove('text-slate-400');
      } else {
        mobBtn.classList.remove('text-indigo-400');
        mobBtn.classList.add('text-slate-400');
      }
    }
  });

  refreshAllViews();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function refreshAllViews() {
  renderDashboard();
  renderAhorrosView();
  renderCreditosList();
  renderSociosView();
  renderReceiptPreview();
  renderConfigView();
  lucide.createIcons();
}

// ==========================================
// VIEW 1: DASHBOARD
// ==========================================

function renderDashboard() {
  const ahorrosConsolidados = getConsolidatedAhorros();
  const totalAhorrado = Object.values(ahorrosConsolidados).reduce((sum, a) => sum + a.totalAhorrado, 0);
  const metaGlobal = 12480000;
  const pctAhorro = Math.min(100, (totalAhorrado / metaGlobal) * 100);

  // Credits metrics
  const calculatedCredits = (AppState.data.creditos || []).map(calculateCreditMetrics);
  const totalPrestado = calculatedCredits.reduce((sum, c) => sum + c.valorCredito, 0);
  const capitalEnCalle = calculatedCredits.filter(c => c.estado !== 'PAGADO').reduce((sum, c) => sum + c.saldoCapital, 0);
  const creditosActivosCount = calculatedCredits.filter(c => c.estado !== 'PAGADO').length;

  const interesesLiquidados = calculatedCredits.filter(c => c.isLiquidated).reduce((sum, c) => sum + c.interesesTotales, 0);
  const interesesPorCobrar = calculatedCredits.filter(c => !c.isLiquidated).reduce((sum, c) => sum + c.saldoInteres, 0);
  const interesesTotales = interesesLiquidados + interesesPorCobrar;

  const totalAbonos = (AppState.data.abonos || []).reduce((sum, a) => sum + (parseFloat(a.totalAbonado) || 0), 0);
  const totalPorCobrarHoy = capitalEnCalle + interesesPorCobrar;

  // DOM Updates
  document.getElementById('kpiTotalAhorrado').textContent = formatCOP(totalAhorrado);
  document.getElementById('kpiAvanceAhorro').textContent = `${pctAhorro.toFixed(1)}%`;
  document.getElementById('kpiAhorroBar').style.width = `${pctAhorro}%`;

  document.getElementById('sidebarAhorradoTotal').textContent = formatCOP(totalAhorrado);
  document.getElementById('sidebarMetaPercent').textContent = `${pctAhorro.toFixed(1)}%`;
  document.getElementById('sidebarMetaBar').style.width = `${pctAhorro}%`;

  document.getElementById('kpiCapitalEnCalle').textContent = formatCOP(capitalEnCalle);
  document.getElementById('kpiTotalPrestado').textContent = formatCOP(totalPrestado);
  document.getElementById('kpiCreditosActivosCount').textContent = `${creditosActivosCount} activos`;
  const pctCapital = totalPrestado > 0 ? (capitalEnCalle / totalPrestado) * 100 : 0;
  document.getElementById('kpiCapitalBar').style.width = `${pctCapital}%`;

  document.getElementById('kpiInteresesTotales').textContent = formatCOP(interesesTotales);
  document.getElementById('kpiInteresesLiquidados').textContent = formatCOP(interesesLiquidados);
  document.getElementById('kpiInteresesPorCobrar').textContent = formatCOP(interesesPorCobrar);

  document.getElementById('kpiTotalAbonos').textContent = formatCOP(totalAbonos);
  document.getElementById('kpiTotalPorCobrarHoy').textContent = formatCOP(totalPorCobrarHoy);

  // Render Charts
  renderDashboardCharts(totalAhorrado, capitalEnCalle, totalAbonos, interesesTotales);

  // Render Recent Abonos List
  renderRecentAbonos();
}

function renderDashboardCharts(totalAhorrado, capitalEnCalle, totalAbonos, interesesTotales) {
  // Chart 1: Quincenas Progress
  const ctxAhorro = document.getElementById('chartAhorroQuincenal');
  if (ctxAhorro) {
    const quincenas = AppState.data.quincenas || [];
    const labels = quincenas.map(q => q.quincena);
    const dataValues = quincenas.map(q => {
      let sum = 0;
      if (q.pagos) {
        Object.values(q.pagos).forEach(p => sum += (parseFloat(p.valor) || 0));
      }
      return sum;
    });

    if (AppState.charts.ahorro) {
      AppState.charts.ahorro.destroy();
    }

    AppState.charts.ahorro = new Chart(ctxAhorro, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ahorro Recaudado ($)',
          data: dataValues,
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          hoverBackgroundColor: 'rgba(52, 211, 153, 0.95)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` Recaudado: ${formatCOP(context.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94a3b8',
              font: { size: 10 },
              callback: (value) => '$' + (value / 1000).toFixed(0) + 'k'
            }
          }
        }
      }
    });
  }

  // Chart 2: Credits Cartera Doughnut
  const ctxCartera = document.getElementById('chartCreditosCartera');
  if (ctxCartera) {
    if (AppState.charts.cartera) {
      AppState.charts.cartera.destroy();
    }

    AppState.charts.cartera = new Chart(ctxCartera, {
      type: 'doughnut',
      data: {
        labels: ['Capital en la Calle', 'Abonos Recaudados', 'Intereses Ganados'],
        datasets: [{
          data: [capitalEnCalle, totalAbonos, interesesTotales],
          backgroundColor: [
            'rgba(245, 158, 11, 0.85)',
            'rgba(6, 182, 212, 0.85)',
            'rgba(168, 85, 247, 0.85)'
          ],
          borderWidth: 2,
          borderColor: '#151e3f'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#cbd5e1', font: { size: 11 }, boxWidth: 12 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatCOP(ctx.raw)}`
            }
          }
        },
        cutout: '70%'
      }
    });
  }
}

function renderRecentAbonos() {
  const container = document.getElementById('recentAbonosList');
  if (!container) return;

  const abonos = (AppState.data.abonos || []).slice(-5).reverse();
  if (abonos.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">No hay abonos registrados aún.</p>';
    return;
  }

  container.innerHTML = abonos.map(a => `
    <div class="flex items-center justify-between p-3 rounded-xl bg-surface-card/60 border border-slate-700/60 hover:border-brand-500/40 transition">
      <div class="flex items-center space-x-3">
        <div class="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
          <i data-lucide="arrow-down-left" class="w-4 h-4"></i>
        </div>
        <div>
          <h5 class="text-xs font-bold text-white">${escapeHtml(a.socio)}</h5>
          <p class="text-[11px] text-slate-400">
            Crédito N°${a.numCredito || 1} • <span class="text-purple-300">Int: ${formatCOP(a.abonoInteres)}</span> | <span class="text-emerald-300">Cap: ${formatCOP(a.abonoCapital)}</span>
          </p>
        </div>
      </div>
      <div class="text-right">
        <strong class="text-xs font-black text-cyan-300 block">${formatCOP(a.totalAbonado)}</strong>
        <span class="text-[10px] text-slate-400 font-mono">${a.fechaPago || ''}</span>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

// ==========================================
// VIEW 2: AHORROS
// ==========================================

function switchAhorroTab(tab) {
  AppState.ahorroSubTab = tab;
  const btnAhorradores = document.getElementById('tabBtnAhorradores');
  const btnMatriz = document.getElementById('tabBtnMatriz');
  const subviewAhorradores = document.getElementById('subviewAhorradores');
  const subviewMatriz = document.getElementById('subviewMatriz');

  if (tab === 'ahorradores') {
    btnAhorradores.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition bg-emerald-600 text-white';
    btnMatriz.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white';
    subviewAhorradores.classList.remove('hidden');
    subviewMatriz.classList.add('hidden');
    renderAhorradoresCards();
  } else {
    btnMatriz.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition bg-emerald-600 text-white';
    btnAhorradores.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white';
    subviewMatriz.classList.remove('hidden');
    subviewAhorradores.classList.add('hidden');
    renderMatrizTable();
  }
}

function renderAhorrosView() {
  if (AppState.ahorroSubTab === 'ahorradores') {
    renderAhorradoresCards();
  } else {
    renderMatrizTable();
  }
}

function renderAhorradoresCards() {
  const container = document.getElementById('ahorradoresGrid');
  if (!container) return;

  const consolidados = getConsolidatedAhorros();
  const list = Object.values(consolidados);
  const search = (document.getElementById('searchAhorrador')?.value || '').toLowerCase();

  const filtered = list.filter(a => a.nombre.toLowerCase().includes(search));

  container.innerHTML = filtered.map(a => {
    const meta = a.metaAnual || 960000;
    const pct = Math.min(200, (a.totalAhorrado / meta) * 100);
    const initials = a.nombre.split(' ').map(n => n[0]).slice(0, 2).join('');
    const isCompleted = a.totalAhorrado >= meta;
    const cleanTel = cleanPhoneNumber(a.telefono || '');

    return `
      <div class="glass-card p-5 rounded-2xl flex flex-col justify-between space-y-4">
        <div>
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-md">
                ${initials}
              </div>
              <div class="min-w-0">
                <h4 class="text-sm font-bold text-white truncate">${escapeHtml(a.nombre)}</h4>
                <p class="text-[11px] text-slate-400">${escapeHtml(a.modalidad)}</p>
              </div>
            </div>
            ${isCompleted 
              ? `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">META SUPERADA</span>`
              : `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">${pct.toFixed(0)}%</span>`
            }
          </div>

          <!-- WhatsApp Badge & Quick Edit -->
          <div class="mt-3 p-2 rounded-xl bg-surface-dark/70 border border-slate-700/60 flex items-center justify-between text-[11px]">
            <div class="flex items-center space-x-1.5 truncate">
              <i data-lucide="phone" class="w-3.5 h-3.5 text-emerald-400 shrink-0"></i>
              <span class="font-mono text-slate-300 font-semibold truncate">
                ${cleanTel ? `+${cleanTel}` : '<span class="text-slate-500 italic font-sans font-normal">Sin WhatsApp</span>'}
              </span>
            </div>
            <div class="flex items-center space-x-1.5">
              ${cleanTel ? `
                <a href="https://api.whatsapp.com/send?phone=${cleanTel}" target="_blank" title="Abrir chat de WhatsApp" class="p-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition">
                  <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                </a>
              ` : ''}
              <button onclick="openModalEditarAhorrador(${a.id})" class="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold transition flex items-center space-x-1 text-[10px]">
                <i data-lucide="edit-2" class="w-2.5 h-2.5"></i>
                <span>Editar</span>
              </button>
            </div>
          </div>

          <div class="mt-3 pt-3 border-t border-slate-700/60 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-slate-400 text-[10px]">Total Ahorrado</span>
              <strong class="text-emerald-400 block text-base font-black">${formatCOP(a.totalAhorrado)}</strong>
            </div>
            <div>
              <span class="text-slate-400 text-[10px]">Cuota Base</span>
              <strong class="text-slate-200 block text-sm font-bold">${formatCOP(a.cuotaBase)}</strong>
            </div>
          </div>

          <div class="mt-3">
            <div class="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Progreso Meta (${formatCOP(meta)})</span>
              <span class="font-bold text-slate-300">${pct.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div class="h-2 rounded-full ${isCompleted ? 'gradient-emerald' : 'gradient-indigo'}" style="width: ${Math.min(100, pct)}%"></div>
            </div>
          </div>
        </div>

        <div class="pt-2 flex items-center gap-2">
          <button onclick="quickPayAhorro('${escapeHtml(a.nombre)}', ${a.cuotaBase})" class="flex-1 py-2 rounded-xl bg-surface-card hover:bg-slate-700 text-xs font-bold text-emerald-300 flex items-center justify-center space-x-1.5 transition border border-slate-700">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>Abonar Cuota</span>
          </button>
          
          <button onclick="openVoucherForAhorro('${escapeHtml(a.nombre)}', ${a.cuotaBase}, ${a.totalAhorrado})" title="Generar Comprobante WhatsApp" class="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 transition">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function filterAhorradores() {
  renderAhorradoresCards();
}

function renderMatrizTable() {
  const select = document.getElementById('selectQuincenaMatriz');
  const tbody = document.getElementById('matrizTableBody');
  const totalDisplay = document.getElementById('matrizFechaTotal');
  if (!select || !tbody) return;

  const quincenas = AppState.data.quincenas || [];
  if (select.children.length === 0) {
    select.innerHTML = quincenas.map((q, idx) => `
      <option value="${idx}">${q.quincena} - ${q.fecha || 'Fecha'}</option>
    `).join('');
  }

  const selectedIdx = parseInt(select.value || 0);
  const qObj = quincenas[selectedIdx];
  if (!qObj) return;

  const ahorradores = AppState.data.ahorradores || [];
  let totalFecha = 0;

  tbody.innerHTML = ahorradores.map((a, idx) => {
    const pago = (qObj.pagos && qObj.pagos[a.nombre]) || { valor: 0, formaPago: '' };
    const valor = parseFloat(pago.valor) || 0;
    totalFecha += valor;
    const forma = pago.formaPago || '';
    
    let badgeEstado = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">PENDIENTE</span>';
    if (valor > 0) {
      badgeEstado = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">PAGADO</span>';
    } else if (forma.toUpperCase().includes('ADELANT')) {
      badgeEstado = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">ADELANTADA</span>';
    }

    return `
      <tr class="hover:bg-surface-card/40 transition">
        <td class="p-3.5 text-slate-400 font-mono">${idx + 1}</td>
        <td class="p-3.5 font-bold text-white">${escapeHtml(a.nombre)}</td>
        <td class="p-3.5 text-slate-400">${escapeHtml(a.modalidad)}</td>
        <td class="p-3.5 text-slate-300 font-mono">${formatCOP(a.cuotaBase)}</td>
        <td class="p-3.5 font-bold ${valor > 0 ? 'text-emerald-400 font-mono' : 'text-slate-500'}">${formatCOP(valor)}</td>
        <td class="p-3.5 text-slate-300">
          <span class="inline-block px-2 py-0.5 rounded bg-slate-800 text-[11px] font-medium">${forma || '-'}</span>
        </td>
        <td class="p-3.5">${badgeEstado}</td>
        <td class="p-3.5 text-right">
          <button onclick="editMatrizCell('${escapeHtml(qObj.quincena)}', '${escapeHtml(a.nombre)}', ${valor}, '${escapeHtml(forma)}')" class="p-1.5 rounded-lg bg-surface-card hover:bg-slate-700 text-slate-300 hover:text-white transition">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  totalDisplay.textContent = formatCOP(totalFecha);
  lucide.createIcons();
}

// ==========================================
// VIEW 3: CREDITOS Y ABONOS
// ==========================================

function setCreditoFilter(filter) {
  AppState.creditoFilter = filter;
  ['filterCredAll', 'filterCredVigente', 'filterCredPagado'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition bg-surface-card text-slate-300 hover:text-white';
  });

  const activeId = filter === 'ALL' ? 'filterCredAll' : (filter === 'DEUDA' ? 'filterCredVigente' : 'filterCredPagado');
  const activeEl = document.getElementById(activeId);
  if (activeEl) {
    activeEl.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition bg-brand-600 text-white';
  }

  renderCreditosList();
}

function renderCreditosList() {
  const container = document.getElementById('creditosContainer');
  if (!container) return;

  const rawCredits = AppState.data.creditos || [];
  const calculated = rawCredits.map(calculateCreditMetrics);

  // Update credit summary stats in header
  const totalColocado = calculated.reduce((sum, c) => sum + c.valorCredito, 0);
  const capitalEnCalle = calculated.filter(c => c.estado !== 'PAGADO').reduce((sum, c) => sum + c.saldoCapital, 0);
  const interesesLiquidados = calculated.filter(c => c.isLiquidated).reduce((sum, c) => sum + c.interesesTotales, 0);
  const totalPorCobrar = calculated.filter(c => c.estado !== 'PAGADO').reduce((sum, c) => sum + c.totalPagarHoy, 0);

  document.getElementById('credTotalColocado').textContent = formatCOP(totalColocado);
  document.getElementById('credCapitalEnCalle').textContent = formatCOP(capitalEnCalle);
  document.getElementById('credInteresesLiquidados').textContent = formatCOP(interesesLiquidados);
  document.getElementById('credTotalPorCobrar').textContent = formatCOP(totalPorCobrar);

  // Filters
  const search = (document.getElementById('searchCredito')?.value || '').toLowerCase();
  const filter = AppState.creditoFilter;

  const filtered = calculated.filter(c => {
    const matchesSearch = c.socio.toLowerCase().includes(search);
    if (!matchesSearch) return false;
    if (filter === 'DEUDA') return c.estado !== 'PAGADO';
    if (filter === 'PAGADO') return c.estado === 'PAGADO';
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass-panel p-8 rounded-2xl border border-surface-border text-center text-slate-400">
        <i data-lucide="check-circle" class="w-8 h-8 mx-auto text-emerald-400 mb-2"></i>
        <p class="text-sm">No se encontraron créditos con el filtro seleccionado.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(c => {
    let statusBadge = '';
    if (c.estado === 'PAGADO') {
      statusBadge = '<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">PAGADO (PAZ Y SALVO)</span>';
    } else if (c.estado === 'PENDIENTE') {
      statusBadge = '<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">EN MORA (>30 DÍAS)</span>';
    } else {
      statusBadge = '<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">VIGENTE</span>';
    }

    return `
      <div class="glass-card p-5 rounded-2xl border border-surface-border space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
              #${c.numInterno || 1}
            </div>
            <div>
              <h4 class="text-base font-bold text-white">${escapeHtml(c.socio)}</h4>
              <p class="text-xs text-slate-400">
                Crédito otorgado: <strong class="text-slate-300 font-mono">${c.fechaCredito || 'N/A'}</strong> 
                ${c.isLiquidated ? `• Liquidado el: <strong class="text-emerald-400 font-mono">${c.fechaPagoLiquidacion}</strong>` : `• <span class="text-amber-400">${c.dias} días transcurridos</span>`}
              </p>
            </div>
          </div>
          <div>
            ${statusBadge}
          </div>
        </div>

        <!-- Values Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl bg-surface-card/60 text-xs">
          <div>
            <span class="text-slate-400 text-[10px] block">Capital Prestado</span>
            <strong class="text-white text-sm font-bold">${formatCOP(c.valorCredito)}</strong>
            <span class="text-[10px] text-slate-500">Tasa: ${(c.tasaMes * 100).toFixed(1)}%/mes</span>
          </div>

          <div>
            <span class="text-slate-400 text-[10px] block">Intereses Calculados</span>
            <strong class="text-purple-300 text-sm font-bold">${formatCOP(c.interesesTotales)}</strong>
            <span class="text-[10px] text-slate-500">${c.isLiquidated ? 'Congelados' : 'En vivo'}</span>
          </div>

          <div>
            <span class="text-slate-400 text-[10px] block">Abonos Recibidos</span>
            <strong class="text-cyan-300 text-sm font-bold">${formatCOP(c.totalAbonado)}</strong>
            <span class="text-[10px] text-slate-500">Cap: ${formatCOP(c.totalAbonoCapital)}</span>
          </div>

          <div>
            <span class="text-slate-400 text-[10px] block">Saldo Capital</span>
            <strong class="${c.saldoCapital > 0 ? 'text-amber-400' : 'text-slate-400'} text-sm font-bold">${formatCOP(c.saldoCapital)}</strong>
            <span class="text-[10px] text-purple-400">Int: ${formatCOP(c.saldoInteres)}</span>
          </div>

          <div class="col-span-2 sm:col-span-1">
            <span class="text-slate-400 text-[10px] block">Total para Cancelar Hoy</span>
            <strong class="${c.totalPagarHoy > 0 ? 'text-rose-400' : 'text-emerald-400'} text-base font-black">${formatCOP(c.totalPagarHoy)}</strong>
          </div>
        </div>

        <!-- Actions line -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700/60">
          <div class="flex items-center space-x-2">
            ${c.estado !== 'PAGADO' ? `
              <button onclick="openAbonoForCredito('${c.id}', '${escapeHtml(c.socio)}', ${c.saldoCapital}, ${c.saldoInteres}, ${c.numInterno || 1})" class="px-3.5 py-1.5 rounded-xl gradient-amber text-white text-xs font-bold flex items-center space-x-1.5 shadow-md">
                <i data-lucide="coins" class="w-3.5 h-3.5"></i>
                <span>Abonar a este Crédito</span>
              </button>
              
              <button onclick="openModalLiquidar('${c.id}')" class="px-3 py-1.5 rounded-xl bg-surface-card hover:bg-slate-700 text-rose-300 text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700">
                <i data-lucide="lock" class="w-3.5 h-3.5"></i>
                <span>Liquidar / Congelar</span>
              </button>
            ` : `
              <span class="text-xs text-emerald-400 font-bold flex items-center space-x-1">
                <i data-lucide="check-check" class="w-4 h-4"></i>
                <span>Crédito totalmente cancelado</span>
              </span>
            `}
          </div>

          <div class="flex items-center space-x-2">
            <button onclick="openVoucherForCredito('${escapeHtml(c.socio)}', ${c.numInterno || 1}, ${c.valorCredito}, ${c.totalPagarHoy})" class="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center space-x-1 transition">
              <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
              <span>Comprobante WhatsApp</span>
            </button>

            <button onclick="deleteCredito('${c.id}')" title="Eliminar crédito" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// ==========================================
// VIEW 4: SOCIOS
// ==========================================

function renderSociosView() {
  const container = document.getElementById('sociosContainer');
  if (!container) return;

  const ahorradoresMap = getConsolidatedAhorros();
  const sociosSet = new Set();

  (AppState.data.ahorradores || []).forEach(a => sociosSet.add(a.nombre));
  (AppState.data.creditos || []).forEach(c => sociosSet.add(c.socio));

  const sociosList = Array.from(sociosSet).sort();

  container.innerHTML = sociosList.map(nombre => {
    const ahorroObj = ahorradoresMap[nombre];
    const userCredits = (AppState.data.creditos || []).filter(c => c.socio.toLowerCase() === nombre.toLowerCase()).map(calculateCreditMetrics);
    
    const saldoAhorro = ahorroObj ? ahorroObj.totalAhorrado : 0;
    const saldoDeuda = userCredits.filter(c => c.estado !== 'PAGADO').reduce((sum, c) => sum + c.totalPagarHoy, 0);
    const telefono = ahorroObj ? (ahorroObj.telefono || '') : '';

    const initials = nombre.split(' ').map(n => n[0]).slice(0, 2).join('');

    return `
      <div class="glass-card p-5 rounded-2xl border border-surface-border flex flex-col justify-between space-y-4">
        <div>
          <div class="flex items-center space-x-3">
            <div class="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm shadow-md">
              ${initials}
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="text-sm font-bold text-white truncate">${escapeHtml(nombre)}</h4>
              <p class="text-[11px] text-slate-400 flex items-center space-x-1">
                <i data-lucide="phone" class="w-3 h-3 text-emerald-400"></i>
                <span>${telefono ? telefono : '<span class="text-slate-500 italic">Sin WhatsApp registrado</span>'}</span>
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-700/60 text-xs">
            <div class="p-2.5 rounded-xl bg-surface-card/60">
              <span class="text-slate-400 text-[10px] block">Ahorro Acumulado</span>
              <strong class="text-emerald-400 font-bold">${formatCOP(saldoAhorro)}</strong>
            </div>
            <div class="p-2.5 rounded-xl bg-surface-card/60">
              <span class="text-slate-400 text-[10px] block">Deuda Créditos</span>
              <strong class="${saldoDeuda > 0 ? 'text-amber-400' : 'text-slate-400'} font-bold">${formatCOP(saldoDeuda)}</strong>
            </div>
          </div>
        </div>

        <div class="pt-2 flex items-center space-x-2">
          <button onclick="editSocioPhone('${escapeHtml(nombre)}', '${escapeHtml(telefono)}')" class="flex-1 py-2 rounded-xl bg-surface-card hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1 transition border border-slate-700">
            <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            <span>Editar Teléfono</span>
          </button>
          
          <button onclick="sendSocioSummaryWhatsApp('${escapeHtml(nombre)}', ${saldoAhorro}, ${saldoDeuda}, '${telefono}')" title="Enviar Estado de Cuenta por WhatsApp" class="p-2 rounded-xl gradient-emerald text-white shadow-md hover:opacity-95 transition">
            <i data-lucide="send" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function editSocioPhone(nombre, currentPhone) {
  const newPhone = prompt(`Ingresa el número de WhatsApp para ${nombre} (Ejemplo: 573001234567):`, currentPhone || '');
  if (newPhone !== null) {
    let ahorrador = (AppState.data.ahorradores || []).find(a => a.nombre.toLowerCase() === nombre.toLowerCase());
    if (ahorrador) {
      ahorrador.telefono = newPhone.trim();
    } else {
      AppState.data.ahorradores.push({
        id: (AppState.data.ahorradores.length + 1),
        nombre: nombre,
        modalidad: 'Quincenal',
        cuotaBase: 40000,
        metaAnual: 960000,
        telefono: newPhone.trim()
      });
    }
    saveState();
    refreshAllViews();
    showToast(`Teléfono guardado para ${nombre}`, 'success');
  }
}

// ==========================================
// VIEW 5: CENTRO DE COMPROBANTES WHATSAPP
// ==========================================

function populateDropdowns() {
  const socioSelect = document.getElementById('receiptSocioSelect');
  const aporteSocioSelect = document.getElementById('aporteSocioSelect');
  const nuevoCreditoSocioSelect = document.getElementById('nuevoCreditoSocioSelect');
  const abonoSocioSelect = document.getElementById('abonoSocioSelect');

  const sociosSet = new Set();
  (AppState.data.ahorradores || []).forEach(a => sociosSet.add(a.nombre));
  (AppState.data.creditos || []).forEach(c => sociosSet.add(c.socio));
  const list = Array.from(sociosSet).sort();

  const optionsHtml = list.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

  if (socioSelect) socioSelect.innerHTML = optionsHtml;
  if (aporteSocioSelect) aporteSocioSelect.innerHTML = optionsHtml;
  if (nuevoCreditoSocioSelect) nuevoCreditoSocioSelect.innerHTML = optionsHtml;
  if (abonoSocioSelect) abonoSocioSelect.innerHTML = optionsHtml;

  // Quincenas dropdowns
  const receiptQuincenaSelect = document.getElementById('receiptQuincenaSelect');
  const aporteQuincenaSelect = document.getElementById('aporteQuincenaSelect');
  const qOptionsHtml = (AppState.data.quincenas || []).map(q => `
    <option value="${escapeHtml(q.quincena)}">${escapeHtml(q.quincena)} - ${escapeHtml(q.fecha || '')}</option>
  `).join('');

  if (receiptQuincenaSelect) receiptQuincenaSelect.innerHTML = qOptionsHtml;
  if (aporteQuincenaSelect) aporteQuincenaSelect.innerHTML = qOptionsHtml;

  // Set default dates to today
  const todayStr = getTodayStr();
  ['receiptFechaInput', 'aporteValorInput', 'nuevoCreditoFechaInput', 'abonoFechaInput', 'liquidarFechaInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.type === 'date') el.value = todayStr;
  });

  // Default values
  const receiptMonto = document.getElementById('receiptMontoInput');
  if (receiptMonto && !receiptMonto.value) receiptMonto.value = '40000';
}

function updateReceiptGeneratorFields() {
  const type = document.getElementById('receiptTypeSelect').value;
  const grpQuincena = document.getElementById('receiptGroupQuincena');
  const grpCredito = document.getElementById('receiptGroupCredito');

  if (type === 'ahorro') {
    grpQuincena.classList.remove('hidden');
    grpCredito.classList.add('hidden');
    document.getElementById('previewReceiptTitleBadge').textContent = 'APORTE DE AHORRO';
    document.getElementById('previewReceiptTitleBadge').className = 'inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide bg-emerald-100 text-emerald-800';
    document.getElementById('previewRowAhorroAcum').classList.remove('hidden');
    document.getElementById('previewRowSaldoCredito').classList.add('hidden');
  } else if (type === 'abono') {
    grpQuincena.classList.add('hidden');
    grpCredito.classList.remove('hidden');
    document.getElementById('previewReceiptTitleBadge').textContent = 'ABONO A CRÉDITO';
    document.getElementById('previewReceiptTitleBadge').className = 'inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide bg-amber-100 text-amber-800';
    document.getElementById('previewRowAhorroAcum').classList.add('hidden');
    document.getElementById('previewRowSaldoCredito').classList.remove('hidden');
    updateCreditosDropdownForReceipt();
  } else if (type === 'desembolso') {
    grpQuincena.classList.add('hidden');
    grpCredito.classList.remove('hidden');
    document.getElementById('previewReceiptTitleBadge').textContent = 'DESEMBOLSO DE CRÉDITO';
    document.getElementById('previewReceiptTitleBadge').className = 'inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide bg-indigo-100 text-indigo-800';
    document.getElementById('previewRowAhorroAcum').classList.add('hidden');
    document.getElementById('previewRowSaldoCredito').classList.remove('hidden');
    updateCreditosDropdownForReceipt();
  } else {
    // Paz y salvo
    grpQuincena.classList.add('hidden');
    grpCredito.classList.remove('hidden');
    document.getElementById('previewReceiptTitleBadge').textContent = 'PAZ Y SALVO TOTAL';
    document.getElementById('previewReceiptTitleBadge').className = 'inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide bg-cyan-100 text-cyan-800';
    document.getElementById('previewRowAhorroAcum').classList.add('hidden');
    document.getElementById('previewRowSaldoCredito').classList.remove('hidden');
    updateCreditosDropdownForReceipt();
  }

  renderReceiptPreview();
}

function onReceiptSocioChange() {
  const socio = document.getElementById('receiptSocioSelect').value;
  const user = (AppState.data.ahorradores || []).find(a => a.nombre.toLowerCase() === socio.toLowerCase());
  const phoneInput = document.getElementById('receiptTelefonoInput');
  const userPhone = user && user.telefono ? user.telefono : '';

  if (phoneInput) {
    phoneInput.value = userPhone;
  }
  updateWhatsAppStatusBadge(userPhone);
  updateCreditosDropdownForReceipt();
  renderReceiptPreview();
}

function onReceiptPhoneInput() {
  const phone = document.getElementById('receiptTelefonoInput')?.value || '';
  updateWhatsAppStatusBadge(phone);
}

function updateWhatsAppStatusBadge(phone) {
  const clean = cleanPhoneNumber(phone);
  const badge = document.getElementById('receiptWhatsAppStatusBadge');
  const text = document.getElementById('receiptWhatsAppStatusText');
  const socio = document.getElementById('receiptSocioSelect')?.value || 'Socio';

  if (!badge || !text) return;

  if (clean) {
    badge.className = 'mt-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center justify-between';
    text.innerHTML = `🟢 Listo para chat directo con <strong>${escapeHtml(socio)}</strong> (+${clean})`;
  } else {
    badge.className = 'mt-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center justify-between';
    text.innerHTML = `⚠️ Sin teléfono guardado. Escríbelo y dale clic a 'Guardar en su perfil'`;
  }
}

function quickEditCurrentSocioPhone() {
  const socio = document.getElementById('receiptSocioSelect')?.value;
  const rawTel = document.getElementById('receiptTelefonoInput')?.value.trim();
  const cleanTel = cleanPhoneNumber(rawTel);

  if (!cleanTel) {
    alert('Ingresa primero un número de teléfono válido.');
    return;
  }

  let user = (AppState.data.ahorradores || []).find(a => a.nombre.toLowerCase() === socio.toLowerCase());
  if (user) {
    user.telefono = cleanTel;
  } else {
    AppState.data.ahorradores.push({
      id: (AppState.data.ahorradores.length + 1),
      nombre: socio,
      modalidad: 'Quincenal',
      cuotaBase: 40000,
      metaAnual: 960000,
      telefono: cleanTel
    });
  }

  saveState();
  updateWhatsAppStatusBadge(cleanTel);
  refreshAllViews();
  showToast(`WhatsApp +${cleanTel} guardado para ${socio}`, 'success');
}

function updateCreditosDropdownForReceipt() {
  const socio = document.getElementById('receiptSocioSelect').value;
  const select = document.getElementById('receiptCreditoSelect');
  if (!select) return;

  const userCredits = (AppState.data.creditos || []).filter(c => c.socio.toLowerCase() === socio.toLowerCase());
  if (userCredits.length === 0) {
    select.innerHTML = '<option value="">(Sin créditos registrados)</option>';
  } else {
    select.innerHTML = userCredits.map(c => `
      <option value="${c.id}">Crédito #${c.numInterno || 1} - ${formatCOP(c.valorCredito)} (${c.fechaCredito || ''})</option>
    `).join('');
  }
}

function onReceiptCreditoChange() {
  renderReceiptPreview();
}

/**
 * Builds the Digital Voucher & WhatsApp formatted text
 */
function renderReceiptPreview() {
  const type = document.getElementById('receiptTypeSelect')?.value || 'ahorro';
  const socio = document.getElementById('receiptSocioSelect')?.value || 'Socio';
  const monto = parseFloat(document.getElementById('receiptMontoInput')?.value) || 0;
  const fecha = document.getElementById('receiptFechaInput')?.value || getTodayStr();
  const medio = document.getElementById('receiptMedioSelect')?.value || 'Transferencia';
  const nota = document.getElementById('receiptNotaInput')?.value || '';

  // Get Consolidated Data for this socio
  const consolidados = getConsolidatedAhorros();
  const userAhorro = consolidados[socio] ? consolidados[socio].totalAhorrado : 0;

  // Header Elements
  document.getElementById('previewReceiptMonto').textContent = formatCOP(monto);
  document.getElementById('previewReceiptSocio').textContent = socio;
  document.getElementById('previewReceiptMedio').textContent = medio;
  document.getElementById('previewReceiptFechaHora').textContent = fecha;
  document.getElementById('previewReceiptFolio').textContent = '#REC-' + Math.floor(1000 + Math.random() * 9000);

  let concepto = '';
  let whatsappMsg = '';

  if (type === 'ahorro') {
    const qCode = document.getElementById('receiptQuincenaSelect')?.value || 'Q01';
    const qObj = (AppState.data.quincenas || []).find(q => q.quincena === qCode);
    concepto = `Cuota Quincenal ${qCode} ${qObj && qObj.fecha ? `(${qObj.fecha})` : ''}`;
    
    document.getElementById('previewReceiptConcepto').textContent = concepto;
    document.getElementById('previewReceiptSaldoAhorro').textContent = formatCOP(userAhorro);
    document.getElementById('previewReceiptNota').textContent = nota || '¡Agradecemos tu compromiso y puntualidad en el ahorro!';

    whatsappMsg = `🌟 *NATILLERA 2026 - COMPROBANTE DE AHORRO* 🌟
----------------------------------------
👤 *Ahorrador:* ${socio}
📅 *Fecha:* ${fecha}
📌 *Concepto:* ${concepto}
💳 *Forma de Pago:* ${medio}
💰 *Valor Aportado:* ${formatCOP(monto)}
----------------------------------------
📈 *Total Ahorrado a la Fecha:* ${formatCOP(userAhorro)}
🎯 *Meta Anual:* $960.000
----------------------------------------
${nota ? `📝 *Nota:* ${nota}\n----------------------------------------\n` : ''}✅ *Administrador:* Santiago Henao
¡Gracias por tu puntualidad y esfuerzo! 🌟`;

  } else if (type === 'abono') {
    const credId = document.getElementById('receiptCreditoSelect')?.value;
    const credObj = (AppState.data.creditos || []).find(c => c.id === credId);
    const metrics = credObj ? calculateCreditMetrics(credObj) : null;
    const saldoRestante = metrics ? metrics.totalPagarHoy : 0;

    concepto = `Abono a Crédito #${credObj ? (credObj.numInterno || 1) : 1}`;
    document.getElementById('previewReceiptConcepto').textContent = concepto;
    document.getElementById('previewReceiptSaldoCredito').textContent = formatCOP(saldoRestante);
    document.getElementById('previewReceiptNota').textContent = nota || 'Pago registrado exitosamente en el sistema.';

    whatsappMsg = `💳 *NATILLERA 2026 - COMPROBANTE DE ABONO* 💳
----------------------------------------
👤 *Socio:* ${socio}
📅 *Fecha Pago:* ${fecha}
📌 *Concepto:* ${concepto}
💵 *Valor Abonado:* ${formatCOP(monto)}
🏦 *Medio:* ${medio}
----------------------------------------
📊 *Saldo Restante del Crédito:* ${formatCOP(saldoRestante)}
----------------------------------------
${nota ? `📝 *Nota:* ${nota}\n----------------------------------------\n` : ''}✅ *Administrador:* Santiago Henao
¡Agradecemos tu oportuno abono! 🙌`;

  } else if (type === 'desembolso') {
    concepto = 'Desembolso de Nuevo Crédito';
    document.getElementById('previewReceiptConcepto').textContent = concepto;
    document.getElementById('previewReceiptSaldoCredito').textContent = formatCOP(monto);
    document.getElementById('previewReceiptNota').textContent = nota || 'Dinero entregado a satisfacción.';

    whatsappMsg = `🤝 *NATILLERA 2026 - CONSTANCIA DE PRÉSTAMO* 🤝
----------------------------------------
👤 *Socio / Deudor:* ${socio}
📅 *Fecha Desembolso:* ${fecha}
💰 *Capital Entregado:* ${formatCOP(monto)}
📈 *Tasa Mensual:* 0.5% (Interés congelado a fecha de pago)
----------------------------------------
✅ *Administrador:* Santiago Henao`;

  } else {
    // Paz y salvo
    concepto = 'Cancelación Total / Paz y Salvo de Crédito';
    document.getElementById('previewReceiptConcepto').textContent = concepto;
    document.getElementById('previewReceiptSaldoCredito').textContent = '$0 (CANCELADO)';
    document.getElementById('previewReceiptNota').textContent = nota || '¡Felicidades! Crédito totalmente pagado.';

    whatsappMsg = `🎉 *NATILLERA 2026 - CERTIFICADO DE PAZ Y SALVO* 🎉
----------------------------------------
👤 *Socio:* ${socio}
📅 *Fecha:* ${fecha}
✨ *ESTADO:* PAZ Y SALVO TOTAL
----------------------------------------
Se certifica que el crédito ha sido cancelado en su totalidad en capital e intereses.
✅ *Administrador:* Santiago Henao
¡Felicitaciones y muchas gracias! 🌟`;
  }

  // Update text preview box
  document.getElementById('previewWhatsAppText').textContent = whatsappMsg;
}

/**
 * Downloads receipt card as HD PNG image
 */
function downloadReceiptImage() {
  const card = document.getElementById('receiptCaptureCard');
  if (!card) return;

  showToast('Generando imagen de alta resolución...', 'info');

  html2canvas(card, {
    scale: 2,
    backgroundColor: '#0b132b',
    logging: false,
    useCORS: true
  }).then(canvas => {
    const link = document.createElement('a');
    const socio = document.getElementById('receiptSocioSelect')?.value || 'Socio';
    link.download = `Comprobante_Natillera_${socio.replace(/\s+/g, '_')}_${getTodayStr()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('¡Comprobante descargado en imagen PNG!', 'success');
  }).catch(err => {
    console.error('Error generating image:', err);
    showToast('Error al generar la imagen', 'error');
  });
}

/**
 * Launches WhatsApp Web / Mobile with the pre-formatted text
 */
function sendReceiptToWhatsApp() {
  const text = document.getElementById('previewWhatsAppText')?.textContent || '';
  const rawPhone = document.getElementById('receiptTelefonoInput')?.value || '';
  const clean = cleanPhoneNumber(rawPhone);
  const socio = document.getElementById('receiptSocioSelect')?.value || 'Socio';

  let url = '';
  if (clean) {
    url = `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    showToast(`Abriendo chat directo con ${socio} (+${clean})...`, 'success');
  } else {
    url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    showToast('Abriendo WhatsApp para elegir contacto...', 'info');
  }
}

function copyReceiptText() {
  const text = document.getElementById('previewWhatsAppText')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    showToast('¡Mensaje copiado al portapapeles!', 'success');
  });
}

function launchQuickReceipt(type) {
  navigate('comprobantes');
  document.getElementById('receiptTypeSelect').value = type;
  updateReceiptGeneratorFields();
}

function openVoucherForAhorro(socio, cuota, totalAhorrado) {
  navigate('comprobantes');
  document.getElementById('receiptTypeSelect').value = 'ahorro';
  updateReceiptGeneratorFields();
  document.getElementById('receiptSocioSelect').value = socio;
  document.getElementById('receiptMontoInput').value = cuota;
  onReceiptSocioChange();
}

function openVoucherForCredito(socio, numCred, valor, totalPagar) {
  navigate('comprobantes');
  document.getElementById('receiptTypeSelect').value = totalPagar <= 0 ? 'pazysalvo' : 'abono';
  updateReceiptGeneratorFields();
  document.getElementById('receiptSocioSelect').value = socio;
  onReceiptSocioChange();
  document.getElementById('receiptMontoInput').value = totalPagar > 0 ? totalPagar : valor;
  renderReceiptPreview();
}

function sendSocioSummaryWhatsApp(nombre, saldoAhorro, saldoDeuda, phone) {
  const adminName = (AppState.data && AppState.data.config && AppState.data.config.administrador) || 'Santiago Henao';
  const natilleraName = (AppState.data && AppState.data.config && AppState.data.config.nombre) || 'NATILLERA 2026';

  const msg = `📊 *${natilleraName} - ESTADO DE CUENTA INDIVIDUAL* 📊
----------------------------------------
👤 *Socio:* ${nombre}
📅 *Fecha de Corte:* ${getTodayStr()}
----------------------------------------
💰 *Total Ahorrado:* ${formatCOP(saldoAhorro)}
💳 *Saldo Créditos:* ${formatCOP(saldoDeuda)}
----------------------------------------
✅ *Administrador:* ${adminName}
Cualquier duda o aclaración con gusto te atenderemos. ¡Muchas gracias! 🌟`;

  let cleanPhone = cleanPhoneNumber(phone);
  let url = cleanPhone 
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

  window.open(url, '_blank');
  showToast(cleanPhone ? `Abriendo chat de WhatsApp con ${nombre} (+${cleanPhone})...` : 'Abriendo WhatsApp...', 'success');
}

// ==========================================
// MODAL ACTIONS & FORMS
// ==========================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

// Form: Aporte Ahorro
function handleSaveAporteAhorro(e) {
  e.preventDefault();
  const socio = document.getElementById('aporteSocioSelect').value;
  const quincena = document.getElementById('aporteQuincenaSelect').value;
  const valor = parseFloat(document.getElementById('aporteValorInput').value) || 0;
  const forma = document.getElementById('aporteFormaPagoSelect').value;
  const openWp = document.getElementById('aporteCheckWhatsApp').checked;

  let qObj = (AppState.data.quincenas || []).find(q => q.quincena === quincena);
  if (qObj) {
    if (!qObj.pagos) qObj.pagos = {};
    qObj.pagos[socio] = {
      valor: valor,
      formaPago: forma
    };
  }

  saveState();
  closeModal('modalAporteAhorro');
  refreshAllViews();
  showToast(`Aporte registrado para ${socio} en ${quincena}`, 'success');

  if (openWp) {
    openVoucherForAhorro(socio, valor, 0);
  }
}

function quickPayAhorro(nombre, cuotaBase) {
  openModal('modalAporteAhorro');
  document.getElementById('aporteSocioSelect').value = nombre;
  document.getElementById('aporteValorInput').value = cuotaBase;
}

function editMatrizCell(quincena, socio, valorActual, formaActual) {
  openModal('modalAporteAhorro');
  document.getElementById('aporteQuincenaSelect').value = quincena;
  document.getElementById('aporteSocioSelect').value = socio;
  document.getElementById('aporteValorInput').value = valorActual;
  document.getElementById('aporteFormaPagoSelect').value = formaActual || 'TRANSFERENCIA';
}

// Form: Nuevo Crédito
function handleSaveNuevoCredito(e) {
  e.preventDefault();
  const socio = document.getElementById('nuevoCreditoSocioSelect').value;
  const valor = parseFloat(document.getElementById('nuevoCreditoMontoInput').value) || 0;
  const fecha = document.getElementById('nuevoCreditoFechaInput').value || getTodayStr();
  const tasa = parseFloat(document.getElementById('nuevoCreditoTasaInput').value) || 0.005;
  const numInt = parseInt(document.getElementById('nuevoCreditoNumInternoInput').value) || 1;
  const openWp = document.getElementById('nuevoCreditoCheckWhatsApp').checked;

  const newId = `CR-${String((AppState.data.creditos || []).length + 1).padStart(3, '0')}`;
  const newCredit = {
    id: newId,
    numInterno: numInt,
    socio: socio,
    fechaCredito: fecha,
    fechaPagoLiquidacion: null,
    valorCredito: valor,
    tasaMes: tasa,
    interesesCongelados: null,
    estado: 'VIGENTE'
  };

  AppState.data.creditos.push(newCredit);
  saveState();
  closeModal('modalNuevoCredito');
  refreshAllViews();
  showToast(`Nuevo crédito creado para ${socio} por ${formatCOP(valor)}`, 'success');

  if (openWp) {
    openVoucherForCredito(socio, numInt, valor, valor);
  }
}

// Form: Abono a Crédito
function openAbonoForCredito(credId, socio, saldoCap, saldoInt, numInterno) {
  openModal('modalAbonoRapido');
  document.getElementById('abonoSocioSelect').value = socio;
  onAbonoSocioChange();
  document.getElementById('abonoCreditoSelect').value = credId;
  onAbonoCreditoSelectChange();
}

function onAbonoSocioChange() {
  const socio = document.getElementById('abonoSocioSelect').value;
  const select = document.getElementById('abonoCreditoSelect');
  const userCredits = (AppState.data.creditos || []).filter(c => c.socio.toLowerCase() === socio.toLowerCase());

  if (userCredits.length === 0) {
    select.innerHTML = '<option value="">(Sin créditos activos)</option>';
  } else {
    select.innerHTML = userCredits.map(c => `
      <option value="${c.id}">Crédito #${c.numInterno || 1} - ${formatCOP(c.valorCredito)} (${c.fechaCredito || ''})</option>
    `).join('');
  }
  onAbonoCreditoSelectChange();
}

function onAbonoCreditoSelectChange() {
  const credId = document.getElementById('abonoCreditoSelect').value;
  const credObj = (AppState.data.creditos || []).find(c => c.id === credId);

  if (credObj) {
    const metrics = calculateCreditMetrics(credObj);
    document.getElementById('abonoInfoSaldoCapital').textContent = formatCOP(metrics.saldoCapital);
    document.getElementById('abonoInfoSaldoInteres').textContent = formatCOP(metrics.saldoInteres);
    document.getElementById('abonoInfoTotalHoy').textContent = formatCOP(metrics.totalPagarHoy);
    
    // Suggest payment
    if (!document.getElementById('abonoTotalInput').value) {
      document.getElementById('abonoTotalInput').value = metrics.totalPagarHoy > 0 ? metrics.totalPagarHoy : '';
      autoDistributeAbono();
    }
  }
}

function autoDistributeAbono() {
  const total = parseFloat(document.getElementById('abonoTotalInput').value) || 0;
  const credId = document.getElementById('abonoCreditoSelect').value;
  const credObj = (AppState.data.creditos || []).find(c => c.id === credId);

  if (!credObj) return;
  const metrics = calculateCreditMetrics(credObj);

  // Interest is paid first, remaining amortizes capital
  const payInterest = Math.min(total, metrics.saldoInteres);
  const payCapital = Math.max(0, total - payInterest);

  document.getElementById('abonoInteresInput').value = Math.round(payInterest);
  document.getElementById('abonoCapitalInput').value = Math.round(payCapital);
}

function handleSaveAbonoCredito(e) {
  e.preventDefault();
  const socio = document.getElementById('abonoSocioSelect').value;
  const credId = document.getElementById('abonoCreditoSelect').value;
  const total = parseFloat(document.getElementById('abonoTotalInput').value) || 0;
  const fecha = document.getElementById('abonoFechaInput').value || getTodayStr();
  const abInteres = parseFloat(document.getElementById('abonoInteresInput').value) || 0;
  const abCapital = parseFloat(document.getElementById('abonoCapitalInput').value) || 0;
  const medio = document.getElementById('abonoMedioInput').value || 'Transferencia';
  const openWp = document.getElementById('abonoCheckWhatsApp').checked;

  const credObj = (AppState.data.creditos || []).find(c => c.id === credId);
  const numInt = credObj ? (credObj.numInterno || 1) : 1;

  const newAbonoId = `AB-${String((AppState.data.abonos || []).length + 1).padStart(4, '0')}`;
  const newAbono = {
    id: newAbonoId,
    creditoId: credId,
    socio: socio,
    fechaPago: fecha,
    numCredito: numInt,
    abonoInteres: abInteres,
    abonoCapital: abCapital,
    totalAbonado: total,
    medio: medio,
    comprobante: ''
  };

  AppState.data.abonos.push(newAbono);

  // If debt is fully cleared, prompt or auto-liquidate
  if (credObj) {
    const metrics = calculateCreditMetrics(credObj);
    if (metrics.totalPagarHoy - total <= 0) {
      credObj.fechaPagoLiquidacion = fecha;
      credObj.estado = 'PAGADO';
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
    }
  }

  saveState();
  closeModal('modalAbonoRapido');
  refreshAllViews();
  showToast(`Abono por ${formatCOP(total)} registrado para ${socio}`, 'success');

  if (openWp) {
    openVoucherForCredito(socio, numInt, credObj ? credObj.valorCredito : total, 0);
  }
}

// Modal Liquidar / Congelar
function openModalLiquidar(credId) {
  document.getElementById('liquidarCreditoIdInput').value = credId;
  document.getElementById('liquidarFechaInput').value = getTodayStr();
  openModal('modalLiquidarCredito');
}

function confirmLiquidarCredito() {
  const credId = document.getElementById('liquidarCreditoIdInput').value;
  const fecha = document.getElementById('liquidarFechaInput').value || getTodayStr();
  const credObj = (AppState.data.creditos || []).find(c => c.id === credId);

  if (credObj) {
    credObj.fechaPagoLiquidacion = fecha;
    const metrics = calculateCreditMetrics(credObj);
    credObj.interesesCongelados = metrics.interesesTotales;
    credObj.estado = 'PAGADO';
    saveState();
    closeModal('modalLiquidarCredito');
    refreshAllViews();
    showToast(`Crédito de ${credObj.socio} liquidado y congelado al ${fecha}`, 'success');
  }
}

function deleteCredito(credId) {
  if (confirm('¿Estás seguro de que deseas eliminar este crédito? Esta acción no se puede deshacer.')) {
    AppState.data.creditos = (AppState.data.creditos || []).filter(c => c.id !== credId);
    saveState();
    refreshAllViews();
    showToast('Crédito eliminado', 'info');
  }
}

// Modal Nuevo Socio
function handleSaveNuevoSocio(e) {
  e.preventDefault();
  const nombre = document.getElementById('nuevoSocioNombreInput').value.trim().toUpperCase();
  const tel = document.getElementById('nuevoSocioTelefonoInput').value.trim();
  const modalidad = document.getElementById('nuevoSocioModalidadSelect').value;
  const cuota = parseFloat(document.getElementById('nuevoSocioCuotaInput').value) || 40000;

  const exists = (AppState.data.ahorradores || []).some(a => a.nombre.toLowerCase() === nombre.toLowerCase());
  if (exists) {
    alert('Ya existe un socio con este nombre.');
    return;
  }

  const newSocio = {
    id: (AppState.data.ahorradores || []).length + 1,
    nombre: nombre,
    modalidad: modalidad,
    cuotaBase: cuota,
    metaAnual: cuota * (modalidad.includes('Mensual') ? 12 : 24),
    telefono: tel
  };

  AppState.data.ahorradores.push(newSocio);
  saveState();
  closeModal('modalNuevoSocio');
  populateDropdowns();
  refreshAllViews();
  showToast(`Socio ${nombre} registrado con éxito`, 'success');
}

// ==========================================
// VIEW 6: CONFIGURACIÓN, EXCEL Y RESPALDO
// ==========================================

// Modal 6: Editar Ahorrador / Socio
function openModalEditarAhorrador(id) {
  const ahorrador = (AppState.data.ahorradores || []).find(a => a.id === id);
  if (!ahorrador) return;

  document.getElementById('editAhorradorId').value = ahorrador.id;
  document.getElementById('editAhorradorOldName').value = ahorrador.nombre;
  document.getElementById('editAhorradorNombre').value = ahorrador.nombre;
  document.getElementById('editAhorradorTelefono').value = ahorrador.telefono || '';
  document.getElementById('editAhorradorModalidad').value = ahorrador.modalidad || 'Quincenal';
  document.getElementById('editAhorradorCuota').value = ahorrador.cuotaBase || 40000;
  document.getElementById('editAhorradorMeta').value = ahorrador.metaAnual || 960000;

  openModal('modalEditarAhorrador');
}

function handleSaveEditarAhorrador(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('editAhorradorId').value);
  const oldName = document.getElementById('editAhorradorOldName').value.trim();
  const newName = document.getElementById('editAhorradorNombre').value.trim().toUpperCase();
  const rawTel = document.getElementById('editAhorradorTelefono').value.trim();
  const tel = cleanPhoneNumber(rawTel);
  const modalidad = document.getElementById('editAhorradorModalidad').value;
  const cuota = parseFloat(document.getElementById('editAhorradorCuota').value) || 40000;
  const meta = parseFloat(document.getElementById('editAhorradorMeta').value) || 960000;

  let ahorrador = (AppState.data.ahorradores || []).find(a => a.id === id);
  if (!ahorrador) return;

  // Check if name changed and update references in quincenas / creditos / abonos
  if (oldName && newName && oldName !== newName) {
    (AppState.data.quincenas || []).forEach(q => {
      if (q.pagos && q.pagos[oldName]) {
        q.pagos[newName] = q.pagos[oldName];
        delete q.pagos[oldName];
      }
    });
    (AppState.data.creditos || []).forEach(c => {
      if (c.socio.toLowerCase() === oldName.toLowerCase()) {
        c.socio = newName;
      }
    });
    (AppState.data.abonos || []).forEach(ab => {
      if (ab.socio.toLowerCase() === oldName.toLowerCase()) {
        ab.socio = newName;
      }
    });
  }

  ahorrador.nombre = newName;
  ahorrador.telefono = tel;
  ahorrador.modalidad = modalidad;
  ahorrador.cuotaBase = cuota;
  ahorrador.metaAnual = meta;

  saveState();
  closeModal('modalEditarAhorrador');
  populateDropdowns();
  refreshAllViews();
  showToast(`Datos actualizados para ${newName} (WhatsApp: ${tel ? '+' + tel : 'Sin registrar'})`, 'success');
}

function deleteCurrentAhorrador() {
  const id = parseInt(document.getElementById('editAhorradorId').value);
  const oldName = document.getElementById('editAhorradorOldName').value.trim();
  if (confirm(`¿Estás seguro de que deseas eliminar a ${oldName} del listado de ahorradores?`)) {
    AppState.data.ahorradores = (AppState.data.ahorradores || []).filter(a => a.id !== id);
    saveState();
    closeModal('modalEditarAhorrador');
    populateDropdowns();
    refreshAllViews();
    showToast(`${oldName} ha sido eliminado`, 'info');
  }
}

function testChatFromEditModal() {
  const rawTel = document.getElementById('editAhorradorTelefono').value.trim();
  const clean = cleanPhoneNumber(rawTel);
  if (!clean) {
    alert('Ingresa primero un número de teléfono válido.');
    return;
  }
  const msg = '¡Hola! Te saludo desde la administración de la Natillera 2026.';
  window.open(`https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`, '_blank');
}

// ==========================================
// VIEW 6: CONFIGURACIÓN, EXCEL Y RESPALDO
// ==========================================

function renderConfigView() {
  const cfg = AppState.data.config || {};
  const nameEl = document.getElementById('configNombreInput');
  const titleEl = document.getElementById('configTituloTableroInput');
  const subEl = document.getElementById('configSubtituloInput');
  const adminEl = document.getElementById('configAdminInput');
  const phoneEl = document.getElementById('configAdminPhoneInput');
  const metaEl = document.getElementById('configMetaGlobalInput');
  const tasaEl = document.getElementById('configTasaInput');
  const headerAdmin = document.getElementById('headerAdminName');

  if (nameEl) nameEl.value = cfg.nombre || 'NATILLERA 2026';
  if (titleEl) titleEl.value = cfg.tituloTablero || 'Tablero General Natillera 2026';
  if (subEl) subEl.value = cfg.subtitulo || 'Control consolidado de ahorros quincenales, préstamos con intereses congelados a la fecha de pago y generación de comprobantes para WhatsApp.';
  if (adminEl) adminEl.value = cfg.administrador || 'Santiago Henao';
  if (phoneEl) phoneEl.value = cfg.telefonoAdmin || '';
  if (metaEl) metaEl.value = cfg.metaGlobal || 12480000;
  if (tasaEl) tasaEl.value = cfg.tasaMesDefault || 0.005;
  if (headerAdmin) headerAdmin.textContent = cfg.administrador || 'Santiago Henao';

  applyDashboardViewsPreferences();
}

function saveGeneralConfig() {
  if (!AppState.data.config) AppState.data.config = {};
  AppState.data.config.nombre = document.getElementById('configNombreInput').value.trim();
  AppState.data.config.tituloTablero = document.getElementById('configTituloTableroInput').value.trim();
  AppState.data.config.subtitulo = document.getElementById('configSubtituloInput').value.trim();
  AppState.data.config.administrador = document.getElementById('configAdminInput').value.trim();
  AppState.data.config.telefonoAdmin = cleanPhoneNumber(document.getElementById('configAdminPhoneInput').value.trim());
  AppState.data.config.metaGlobal = parseFloat(document.getElementById('configMetaGlobalInput').value) || 12480000;
  AppState.data.config.tasaMesDefault = parseFloat(document.getElementById('configTasaInput').value) || 0.005;

  saveState();
  applyDashboardViewsPreferences();
  refreshAllViews();
  showToast('Nombres, textos y parámetros guardados correctamente', 'success');
}

function toggleDashboardViewElement(elementId, isVisible) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.toggle('hidden', !isVisible);
  }
  if (!AppState.data.config) AppState.data.config = {};
  if (!AppState.data.config.views) AppState.data.config.views = {};
  AppState.data.config.views[elementId] = isVisible;
  saveState();
}

function applyDashboardViewsPreferences() {
  const cfg = AppState.data.config || {};
  const views = cfg.views || {};

  const mapping = [
    { id: 'dashBanner', checkId: 'cfgShowBanner' },
    { id: 'dashCardAhorro', checkId: 'cfgShowAhorroCard' },
    { id: 'dashCardCapital', checkId: 'cfgShowCapitalCard' },
    { id: 'dashCardIntereses', checkId: 'cfgShowInteresesCard' },
    { id: 'dashCardAbonos', checkId: 'cfgShowAbonosCard' },
    { id: 'dashChartAhorroBox', checkId: 'cfgShowChartAhorro' },
    { id: 'dashChartCarteraBox', checkId: 'cfgShowChartCartera' },
    { id: 'dashRecentAbonosBox', checkId: 'cfgShowRecentAbonos' },
    { id: 'dashVoucherBox', checkId: 'cfgShowVoucherBox' }
  ];

  mapping.forEach(item => {
    const isVisible = views[item.id] !== undefined ? views[item.id] : true;
    const el = document.getElementById(item.id);
    const chk = document.getElementById(item.checkId);
    if (el) el.classList.toggle('hidden', !isVisible);
    if (chk) chk.checked = isVisible;
  });

  // Apply titles
  if (cfg.nombre) {
    const logoBrand = document.querySelector('header .bg-clip-text');
    if (logoBrand) logoBrand.textContent = cfg.nombre;
  }
  if (cfg.tituloTablero) {
    const mainTitle = document.getElementById('dashMainTitle');
    if (mainTitle) mainTitle.textContent = cfg.tituloTablero;
  }
  if (cfg.subtitulo) {
    const mainSub = document.getElementById('dashMainSubtitle');
    if (mainSub) mainSub.textContent = cfg.subtitulo;
  }
  if (cfg.theme) {
    changeColorTheme(cfg.theme, false);
    const themeSel = document.getElementById('configThemeSelect');
    if (themeSel) themeSel.value = cfg.theme;
  }
  if (cfg.defaultView) {
    const defViewSel = document.getElementById('configDefaultViewSelect');
    if (defViewSel) defViewSel.value = cfg.defaultView;
  }
}

function changeColorTheme(themeName, doSave = true) {
  if (doSave) {
    if (!AppState.data.config) AppState.data.config = {};
    AppState.data.config.theme = themeName;
    saveState();
  }
  document.body.classList.remove('theme-emerald', 'theme-indigo', 'theme-amber', 'theme-cyan');
  document.body.classList.add(`theme-${themeName}`);
  if (doSave) showToast(`Tema cambiado a ${themeName}`, 'info');
}

function saveDashboardPreferences() {
  if (!AppState.data.config) AppState.data.config = {};
  AppState.data.config.defaultView = document.getElementById('configDefaultViewSelect').value;
  saveState();
  showToast('Preferencia de inicio guardada', 'success');
}

function downloadJsonBackup() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(AppState.data, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `Natillera_2026_Backup_${getTodayStr()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Copia de seguridad descargada', 'success');
}

function importJsonBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.ahorradores && parsed.creditos) {
        AppState.data = parsed;
        saveState();
        populateDropdowns();
        refreshAllViews();
        showToast('¡Datos restaurados exitosamente desde la copia!', 'success');
      } else {
        alert('El archivo no parece ser un respaldo válido de Natillera.');
      }
    } catch (err) {
      alert('Error al leer el archivo JSON.');
    }
  };
  reader.readAsText(file);
}

function confirmResetFactory() {
  if (confirm('¿Restablecer datos originales del Excel? Se perderán los cambios locales no respaldados.')) {
    localStorage.removeItem('natillera_2026_data');
    AppState.data = JSON.parse(JSON.stringify(window.INITIAL_NATILLERA_DATA));
    saveState();
    populateDropdowns();
    refreshAllViews();
    showToast('Datos restablecidos a los valores originales de tus Excels', 'info');
  }
}

/**
 * Exports complete database to a multi-sheet Excel file (.xlsx)
 */
function exportFullExcel() {
  showToast('Generando libro de Excel...', 'info');

  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumen Ahorros
  const consolidados = getConsolidatedAhorros();
  const rowsAhorros = Object.values(consolidados).map((a, i) => ({
    'N°': i + 1,
    'Socio': a.nombre,
    'Modalidad': a.modalidad,
    'Cuota Base': a.cuotaBase,
    'Meta Estimada': a.metaAnual,
    'Total Ahorrado': a.totalAhorrado,
    '% Cumplimiento': (a.totalAhorrado / a.metaAnual),
    'WhatsApp': a.telefono || ''
  }));
  const wsAhorros = XLSX.utils.json_to_sheet(rowsAhorros);
  XLSX.utils.book_append_sheet(wb, wsAhorros, 'Resumen Ahorros');

  // Sheet 2: Control Créditos
  const calculatedCredits = (AppState.data.creditos || []).map(calculateCreditMetrics);
  const rowsCreditos = calculatedCredits.map(c => ({
    'ID': c.id,
    'N° Crédito': c.numInterno || 1,
    'Socio': c.socio,
    'Fecha Crédito': c.fechaCredito,
    'Fecha Liquidación': c.fechaPagoLiquidacion || 'Vigente',
    'Días': c.dias,
    'Capital': c.valorCredito,
    'Tasa Mensual': c.tasaMes,
    'Intereses Totales': c.interesesTotales,
    'Abono Intereses': c.totalAbonoInteres,
    'Saldo Intereses': c.saldoInteres,
    'Abono Capital': c.totalAbonoCapital,
    'Saldo Capital': c.saldoCapital,
    'Total a Pagar Hoy': c.totalPagarHoy,
    'Estado': c.estado
  }));
  const wsCreditos = XLSX.utils.json_to_sheet(rowsCreditos);
  XLSX.utils.book_append_sheet(wb, wsCreditos, 'Control Créditos');

  // Sheet 3: Registro de Abonos
  const rowsAbonos = (AppState.data.abonos || []).map(a => ({
    'ID Abono': a.id,
    'Socio': a.socio,
    'N° Crédito': a.numCredito,
    'Fecha Pago': a.fechaPago,
    'Abono a Intereses': a.abonoInteres,
    'Abono a Capital': a.abonoCapital,
    'Total Abonado': a.totalAbonado,
    'Medio / Comprobante': a.medio
  }));
  const wsAbonos = XLSX.utils.json_to_sheet(rowsAbonos);
  XLSX.utils.book_append_sheet(wb, wsAbonos, 'Registro Abonos');

  XLSX.writeFile(wb, `Natillera_2026_Actualizada_${getTodayStr()}.xlsx`);
  showToast('¡Excel generado y descargado!', 'success');
}

// ==========================================
// UTILITIES & TOASTS
// ==========================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center space-x-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-bold transition-all transform duration-300 translate-y-4 opacity-0 border ${
    type === 'success' ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50' :
    type === 'error' ? 'bg-rose-950/90 text-rose-200 border-rose-500/50' :
    'bg-slate-900/90 text-slate-200 border-indigo-500/50'
  }`;

  const iconName = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-triangle' : 'info');
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Animation in
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  // Auto remove after 3.5s
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
