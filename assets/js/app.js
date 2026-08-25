/**
 * ============================================================================
 * CONTROLADOR FRONTEND - KPIS, FILTROS Y GRÁFICOS DINÁMICOS
 * ============================================================================
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbz4vWZTmXN8Y-XUcKxZANNkfGEnfE-LRbVLpsR_6es7RdkL8qVVYpuodIZpGj_TkOR1yA/exec'; // Reemplaza con la URL de tu Web App

let rawData = { req2025: [], req2026: [], ser2025: [], ser2026: [] };
let chartInstances = {};

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

document.addEventListener('DOMContentLoaded', () => {
  fetchDashboardData();
  setupFilterListeners();
});

/**
 * Petición principal a la API de Apps Script
 */
async function fetchDashboardData() {
  const badge = document.getElementById('status-badge');
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Error al conectar con la API');

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
    console.error('Fetch error:', error);
    badge.textContent = 'Error de conexión';
    badge.className = 'px-3 py-1 text-xs rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
  }
}

/**
 * Llena las opciones de los selectores de filtro basándose en los datos únicos recibidos
 */
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

/**
 * Aplica los filtros combinados excluyendo registros sin fecha válida
 */
function processAndRenderDashboard() {
  const fAnio = document.getElementById('filter-anio').value;
  const fEstado = document.getElementById('filter-estado').value;
  const fArea = document.getElementById('filter-area').value;
  const fServicio = document.getElementById('filter-servicio').value;

  // REQUERIMIENTOS: Filtra y elimina sin fecha de creación (fCreacion)
  const filterReqList = (list, yearStr) => {
    if (fAnio !== 'TODOS' && fAnio !== yearStr) return [];
    return list.filter(item => {
      if (!item.fCreacion || item.fCreacion.toString().trim() === '' || item.fCreacion === 'NaN') return false;
      if (fEstado !== 'TODOS' && item.estadoTicket !== fEstado) return false;
      if (fArea !== 'TODOS' && item.areaSolicitante !== fArea) return false;
      return true;
    });
  };

  // SERVICIOS: Filtra y elimina sin fecha de cobertura (fCobertura)
  const filterSerList = (list, yearStr) => {
    if (fAnio !== 'TODOS' && fAnio !== yearStr) return [];
    return list.filter(item => {
      if (!item.fCobertura || item.fCobertura.toString().trim() === '' || item.fCobertura === 'NaN') return false;
      if (fEstado !== 'TODOS' && item.estadoTicket !== fEstado) return false;
      if (fArea !== 'TODOS' && item.areaSolicitante !== fArea) return false;
      if (fServicio !== 'TODOS' && item.Servicio !== fServicio) return false;
      return true;
    });
  };

  const cleanReq2025 = filterReqList(rawData.req2025, '2025');
  const cleanReq2026 = filterReqList(rawData.req2026, '2026');
  const cleanSer2025 = filterSerList(rawData.ser2025, '2025');
  const cleanSer2026 = filterSerList(rawData.ser2026, '2026');

  // Cálculos Mensuales (1-12)
  const reqMonthly2025 = getMonthlyCounts(cleanReq2025, 'fCreacion');
  const reqMonthly2026 = getMonthlyCounts(cleanReq2026, 'fCreacion');
  const serMonthly2025 = getMonthlyCounts(cleanSer2025, 'fCobertura');
  const serMonthly2026 = getMonthlyCounts(cleanSer2026, 'fCobertura');

  // Actualizar Tarjetas KPI
  const totalReq = cleanReq2025.length + cleanReq2026.length;
  const totalSer = cleanSer2025.length + cleanSer2026.length;
  document.getElementById('kpi-req-total').textContent = totalReq;
  document.getElementById('kpi-ser-total').textContent = totalSer;

  const activeReqMonths = [...reqMonthly2025, ...reqMonthly2026].filter(v => v > 0).length || 1;
  const activeSerMonths = [...serMonthly2025, ...serMonthly2026].filter(v => v > 0).length || 1;
  document.getElementById('kpi-req-prom').textContent = (totalReq / activeReqMonths).toFixed(1);
  document.getElementById('kpi-ser-prom').textContent = (totalSer / activeSerMonths).toFixed(1);

  // Renderizar Gráficos
  renderCharts({
    req2025: reqMonthly2025, req2026: reqMonthly2026,
    ser2025: serMonthly2025, ser2026: serMonthly2026,
    fAnio
  });
}

function getMonthlyCounts(items, dateFieldName) {
  const counts = Array(12).fill(0);
  items.forEach(item => {
    const rawDate = item[dateFieldName];
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const month = d.getMonth(); // 0 a 11
      counts[month]++;
    }
  });
  return counts;
}

/**
 * Construcción y refresco de Gráficos con Chart.js
 */
function renderCharts({ req2025, req2026, ser2025, ser2026, fAnio }) {
  // Destruir instancias previas
  Object.values(chartInstances).forEach(chart => chart.destroy());

  // 1. Chart REQ por Mes
  chartInstances.req = new Chart(document.getElementById('chartReq'), {
    type: 'bar',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(fAnio === 'TODOS' || fAnio === '2025' ? [{ label: 'REQ 2025', data: req2025, backgroundColor: '#10b981' }] : []),
        ...(fAnio === 'TODOS' || fAnio === '2026' ? [{ label: 'REQ 2026', data: req2026, backgroundColor: '#059669' }] : [])
      ]
    },
    options: getChartCommonOptions()
  });

  // 2. Chart SER por Mes
  chartInstances.ser = new Chart(document.getElementById('chartSer'), {
    type: 'bar',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(fAnio === 'TODOS' || fAnio === '2025' ? [{ label: 'SER 2025', data: ser2025, backgroundColor: '#6366f1' }] : []),
        ...(fAnio === 'TODOS' || fAnio === '2026' ? [{ label: 'SER 2026', data: ser2026, backgroundColor: '#4f46e5' }] : [])
      ]
    },
    options: getChartCommonOptions()
  });

  // 3. Comparativo REQ 2025 vs 2026 (Líneas)
  chartInstances.compReq = new Chart(document.getElementById('chartCompReq'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        { label: 'REQ 2025', data: req2025, borderColor: '#10b981', tension: 0.3, fill: false },
        { label: 'REQ 2026', data: req2026, borderColor: '#f59e0b', tension: 0.3, fill: false }
      ]
    },
    options: getChartCommonOptions()
  });

  // 4. Comparativo SER 2025 vs 2026 (Líneas)
  chartInstances.compSer = new Chart(document.getElementById('chartCompSer'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        { label: 'SER 2025', data: ser2025, borderColor: '#6366f1', tension: 0.3, fill: false },
        { label: 'SER 2026', data: ser2026, borderColor: '#06b6d4', tension: 0.3, fill: false }
      ]
    },
    options: getChartCommonOptions()
  });
}

function getChartCommonOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#cbd5e1', font: { size: 11 } } },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' }, beginAtZero: true }
    }
  };
}

/**
 * Redimensión Temporal de Contenedor de Gráficos (Sin persistencia tras recargar)
 */
function toggleChartExpand(containerId) {
  const container = document.getElementById(containerId);
  container.classList.toggle('lg:col-span-2');
  container.classList.toggle('h-[500px]');
  
  // Forzar a Chart.js a adaptarse al nuevo tamaño
  setTimeout(() => {
    Object.values(chartInstances).forEach(chart => chart.resize());
  }, 200);
}