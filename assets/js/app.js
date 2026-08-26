/**
 * ============================================================================
 * CONTROLADOR FRONTEND - DASHBOARD DE MÉTRICAS AV
 * ============================================================================
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbz4vWZTmXN8Y-XUcKxZANNkfGEnfE-LRbVLpsR_6es7RdkL8qVVYpuodIZpGj_TkOR1yA/exec';

let rawData = { req2025: [], req2026: [], ser2025: [], ser2026: [] };
let chartInstances = {};

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

// Registrar el plugin de DataLabels para Chart.js
Chart.register(ChartDataLabels);

// PALETA DE COLORES ACCESIBLE (COLORBLIND-SAFE: Okabe-Ito / Contraste Marcado)
const COLORS = {
  blue2025: '#0072B2',   // Azul Cobalto
  orange2026: '#E69F00', // Naranja Vibrante
  teal2025: '#009E73',   // Verde Azulado (Teal)
  purple2026: '#CC79A7'  // Púrpura Rosa
};

document.addEventListener('DOMContentLoaded', () => {
  fetchDashboardData();
  setupFilterListeners();
});

async function fetchDashboardData() {
  const badge = document.getElementById('status-badge');
  try {
    const response = await fetch(API_URL, { method: 'GET', redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const result = await response.json();
    if (result.status === 'success') {
      badge.textContent = 'En línea';
      badge.className = 'px-3 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      
      rawData = result.data;
      populateFilterSelects();
      processAndRenderDashboard();
    } else {
      throw new Error(result.message || 'Error en la respuesta de la API');
    }
  } catch (error) {
    console.error('Detalle del error:', error);
    badge.textContent = 'Error de conexión';
    badge.className = 'px-3 py-1 text-xs rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
  }
}

function populateFilterSelects() {
  const estados = new Set();
  const areas = new Set();
  const servicios = new Set();

  const allReq = [...rawData.req2025, ...rawData.req2026];
  const allSer = [...rawData.ser2025, ...rawData.ser2026];

  allReq.forEach(item => {
    if (item.estadoTicket) estados.add(item.estadoTicket);
    if (item.areaSolicitante) areas.add(item.areaSolicitante);
  });

  allSer.forEach(item => {
    if (item.Servicio) servicios.add(item.Servicio);
    if (item.areaSolicitante) areas.add(item.areaSolicitante);
  });

  fillSelect('filter-estado', Array.from(estados).sort());
  fillSelect('filter-area', Array.from(areas).sort());
  fillSelect('filter-servicio', Array.from(servicios).sort());
}

function fillSelect(elementId, options) {
  const select = document.getElementById(elementId);
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  });
}

function setupFilterListeners() {
  ['filter-anio', 'filter-estado', 'filter-area', 'filter-servicio'].forEach(id => {
    document.getElementById(id).addEventListener('change', processAndRenderDashboard);
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    document.getElementById('filter-anio').value = 'TODOS';
    document.getElementById('filter-estado').value = 'TODOS';
    document.getElementById('filter-area').value = 'TODOS';
    document.getElementById('filter-servicio').value = 'TODOS';
    processAndRenderDashboard();
  });
}

function processAndRenderDashboard() {
  const fAnio = document.getElementById('filter-anio').value;
  const fEstado = document.getElementById('filter-estado').value;
  const fArea = document.getElementById('filter-area').value;
  const fServicio = document.getElementById('filter-servicio').value;

  // Filtrado estricto con base en fCreacion
  const filterList = (list, yearStr, checkServicio = false) => {
    if (fAnio !== 'TODOS' && fAnio !== yearStr) return [];
    return list.filter(item => {
      if (!item.fCreacion || item.fCreacion.toString().trim() === '' || item.fCreacion === 'NaN') return false;
      if (fEstado !== 'TODOS' && item.estadoTicket !== fEstado) return false;
      if (fArea !== 'TODOS' && item.areaSolicitante !== fArea) return false;
      if (checkServicio && fServicio !== 'TODOS' && item.Servicio !== fServicio) return false;
      return true;
    });
  };

  const cleanReq2025 = filterList(rawData.req2025, '2025');
  const cleanReq2026 = filterList(rawData.req2026, '2026');
  const cleanSer2025 = filterList(rawData.ser2025, '2025', true);
  const cleanSer2026 = filterList(rawData.ser2026, '2026', true);

  // Conteo mensual por fCreacion
  const reqMonthly2025 = getMonthlyCounts(cleanReq2025);
  const reqMonthly2026 = getMonthlyCounts(cleanReq2026);
  const serMonthly2025 = getMonthlyCounts(cleanSer2025);
  const serMonthly2026 = getMonthlyCounts(cleanSer2026);

  // Tiempos promedio de atención (Días / vidaTicket)
  const reqTime2025 = getMonthlyAvgVidaTicket(cleanReq2025);
  const reqTime2026 = getMonthlyAvgVidaTicket(cleanReq2026);
  const serTime2025 = getMonthlyAvgVidaTicketSER(cleanSer2025);
  const serTime2026 = getMonthlyAvgVidaTicketSER(cleanSer2026);

  // Actualización de KPIs
  const totalReq = cleanReq2025.length + cleanReq2026.length;
  const totalSer = cleanSer2025.length + cleanSer2026.length;
  document.getElementById('kpi-req-total').textContent = totalReq;
  document.getElementById('kpi-ser-total').textContent = totalSer;

  const activeReqMonths = [...reqMonthly2025, ...reqMonthly2026].filter(v => v > 0).length || 1;
  const activeSerMonths = [...serMonthly2025, ...serMonthly2026].filter(v => v > 0).length || 1;
  document.getElementById('kpi-req-prom').textContent = (totalReq / activeReqMonths).toFixed(1);
  document.getElementById('kpi-ser-prom').textContent = (totalSer / activeSerMonths).toFixed(1);

  renderCharts({
    req2025: reqMonthly2025, req2026: reqMonthly2026,
    ser2025: serMonthly2025, ser2026: serMonthly2026,
    reqTime2025, reqTime2026, serTime2025, serTime2026,
    fAnio
  });
}

function getMonthlyCounts(items) {
  const counts = Array(12).fill(0);
  items.forEach(item => {
    const d = new Date(item.fCreacion);
    if (!isNaN(d.getTime())) {
      counts[d.getMonth()]++;
    }
  });
  return counts;
}

// Promedio mensual para REQ usando la columna vidaTicket
function getMonthlyAvgVidaTicket(items) {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);

  items.forEach(item => {
    const d = new Date(item.fCreacion);
    const vida = parseFloat(item.vidaTicket);
    if (!isNaN(d.getTime()) && !isNaN(vida) && vida >= 0) {
      const month = d.getMonth();
      sums[month] += vida;
      counts[month]++;
    }
  });

  return sums.map((sum, i) => (counts[i] > 0 ? parseFloat((sum / counts[i]).toFixed(1)) : 0));
}

// Promedio mensual para SER (diferencia fCobertura - fCreacion en Días)
function getMonthlyAvgVidaTicketSER(items) {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);

  items.forEach(item => {
    const dCreate = new Date(item.fCreacion);
    const dCover = new Date(item.fCobertura);

    if (!isNaN(dCreate.getTime()) && !isNaN(dCover.getTime())) {
      const diffDays = (dCover - dCreate) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0) {
        const month = dCreate.getMonth();
        sums[month] += diffDays;
        counts[month]++;
      }
    }
  });

  return sums.map((sum, i) => (counts[i] > 0 ? parseFloat((sum / counts[i]).toFixed(1)) : 0));
}

function renderCharts({ req2025, req2026, ser2025, ser2026, reqTime2025, reqTime2026, serTime2025, serTime2026, fAnio }) {
  Object.values(chartInstances).forEach(chart => chart.destroy());

  // 1. REQ por Mes (Barras)
  chartInstances.req = new Chart(document.getElementById('chartReq'), {
    type: 'bar',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(fAnio === 'TODOS' || fAnio === '2025' ? [{ label: 'REQ 2025', data: req2025, backgroundColor: COLORS.blue2025 }] : []),
        ...(fAnio === 'TODOS' || fAnio === '2026' ? [{ label: 'REQ 2026', data: req2026, backgroundColor: COLORS.orange2026 }] : [])
      ]
    },
    options: getChartCommonOptions()
  });

  // 2. SER por Mes (Barras)
  chartInstances.ser = new Chart(document.getElementById('chartSer'), {
    type: 'bar',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(fAnio === 'TODOS' || fAnio === '2025' ? [{ label: 'SER 2025', data: ser2025, backgroundColor: COLORS.teal2025 }] : []),
        ...(fAnio === 'TODOS' || fAnio === '2026' ? [{ label: 'SER 2026', data: ser2026, backgroundColor: COLORS.purple2026 }] : [])
      ]
    },
    options: getChartCommonOptions()
  });

  // 3. Tiempo Promedio REQ (Líneas)
  chartInstances.timeReq = new Chart(document.getElementById('chartTimeReq'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(fAnio === 'TODOS' || fAnio === '2025' ? [{ label: 'Días Prom. 2025', data: reqTime2025, borderColor: COLORS.blue2025, backgroundColor: COLORS.blue2025, tension: 0.2 }] : []),
        ...(fAnio === 'TODOS' || fAnio === '2026' ? [{ label: 'Días Prom. 2026', data: reqTime2026, borderColor: COLORS.orange2026, backgroundColor: COLORS.orange2026, tension: 0.2 }] : [])
      ]
    },
    options: getChartCommonOptions(' d')
  });

  // 4. Tiempo Promedio SER (Líneas)
  chartInstances.timeSer = new Chart(document.getElementById('chartTimeSer'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(fAnio === 'TODOS' || fAnio === '2025' ? [{ label: 'Días Prom. 2025', data: serTime2025, borderColor: COLORS.teal2025, backgroundColor: COLORS.teal2025, tension: 0.2 }] : []),
        ...(fAnio === 'TODOS' || fAnio === '2026' ? [{ label: 'Días Prom. 2026', data: serTime2026, borderColor: COLORS.purple2026, backgroundColor: COLORS.purple2026, tension: 0.2 }] : [])
      ]
    },
    options: getChartCommonOptions(' d')
  });
}

function getChartCommonOptions(suffix = '') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } } },
      datalabels: {
        anchor: 'end',
        align: 'top',
        color: '#f8fafc',
        font: { weight: 'bold', size: 10 },
        formatter: (value) => (value > 0 ? `${value}${suffix}` : ''),
        offset: 4,
        clip: false
      }
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' }, beginAtZero: true, grace: '15%' }
    }
  };
}

function toggleChartExpand(containerId) {
  const container = document.getElementById(containerId);
  container.classList.toggle('lg:col-span-2');
  container.classList.toggle('h-[500px]');
  
  setTimeout(() => {
    Object.values(chartInstances).forEach(chart => chart.resize());
  }, 200);
}