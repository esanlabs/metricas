/**
 * ============================================================================
 * CONTROLADOR FRONTEND - KPIS, ACCESIBILIDAD Y ETIQUETAS PERMANENTES
 * ============================================================================
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbz4vWZTmXN8Y-XUcKxZANNkfGEnfE-LRbVLpsR_6es7RdkL8qVVYpuodIZpGj_TkOR1yA/exec';

let rawData = { req2025: [], req2026: [], ser2025: [], ser2026: [] };
let chartInstances = {};

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

// Registrar el plugin de datalabels globalmente
Chart.register(ChartDataLabels);

// PALETA ACCESIBLE (COLORBLIND-SAFE)
const COLORS = {
  blue2025: '#0072B2',   // Azul intenso
  orange2026: '#E69F00', // Naranja vibrante
  teal2025: '#009E73',   // Verde Azulado (Teal)
  purple2026: '#CC79A7'  // Púrpura suave
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

  // REGLA DE NEGOCIO: Filtrar usando exclusivamente la columna "fCreacion"
  const filterList = (list, yearStr, checkServicio = false) => {
    if (fAnio !== 'TODOS' && fAnio !== yearStr) return [];
    return list.filter(item => {
      // Excluir registros sin fCreacion
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

  // Conteo mensual basado únicamente en fCreacion
  const reqMonthly2025 = getMonthlyCounts(cleanReq2025);
  const reqMonthly2026 = getMonthlyCounts(cleanReq2026);
  const serMonthly2025 = getMonthlyCounts(cleanSer2025);
  const serMonthly2026 = getMonthlyCounts(cleanSer2026);

  // KPIs
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
    fAnio
  });
}

function getMonthlyCounts(items) {
  const counts = Array(12).fill(0);
  items.forEach(item => {
    const rawDate = item.fCreacion; // Exclusivamente fCreacion
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      counts[d.getMonth()]++;
    }
  });
  return counts;
}

function renderCharts({ req2025, req2026, ser2025, ser2026, fAnio }) {
  Object.values(chartInstances).forEach(chart => chart.destroy());

  // 1. REQ por Mes
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

  // 2. SER por Mes
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

  // 3. Comparativo REQ 2025 vs 2026
  chartInstances.compReq = new Chart(document.getElementById('chartCompReq'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        { label: 'REQ 2025', data: req2025, borderColor: COLORS.blue2025, backgroundColor: COLORS.blue2025, tension: 0.2, fill: false },
        { label: 'REQ 2026', data: req2026, borderColor: COLORS.orange2026, backgroundColor: COLORS.orange2026, tension: 0.2, fill: false }
      ]
    },
    options: getChartCommonOptions()
  });

  // 4. Comparativo SER 2025 vs 2026
  chartInstances.compSer = new Chart(document.getElementById('chartCompSer'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        { label: 'SER 2025', data: ser2025, borderColor: COLORS.teal2025, backgroundColor: COLORS.teal2025, tension: 0.2, fill: false },
        { label: 'SER 2026', data: ser2026, borderColor: COLORS.purple2026, backgroundColor: COLORS.purple2026, tension: 0.2, fill: false }
      ]
    },
    options: getChartCommonOptions()
  });
}

/**
 * Opciones Globales con Etiquetas Visibles y Colores de Alto Contraste
 */
function getChartCommonOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } } },
      // CONFIGURACIÓN DE ETIQUETAS PERMANENTES
      datalabels: {
        anchor: 'end',
        align: 'top',
        color: '#f8fafc',
        font: { weight: 'bold', size: 10 },
        formatter: (value) => (value > 0 ? value : ''), // Oculta ceros para no saturar la vista
        offset: 2
      }
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' }, beginAtZero: true, grace: '10%' }
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