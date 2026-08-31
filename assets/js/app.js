/**
 * ============================================================================
 * CONTROLADOR FRONTEND - DASHBOARD DE MÉTRICAS AV CON FILTROS TIPO GOOGLE SHEETS
 * ============================================================================
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbz4vWZTmXN8Y-XUcKxZANNkfGEnfE-LRbVLpsR_6es7RdkL8qVVYpuodIZpGj_TkOR1yA/exec';

let rawData = { req2025: [], req2026: [], ser2025: [], ser2026: [], datos: [] };
let serviceCostMap = {};
let chartInstances = {};
let connectionLogs = [];

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

// Registrar plugin datalabels
Chart.register(ChartDataLabels);

// PALETA ACCESIBLE (COLORBLIND-SAFE)
const COLORS = {
  blue2025: '#0072B2',   // Azul Cobalto
  orange2026: '#E69F00', // Naranja
  teal2025: '#009E73',   // Verde Azulado
  purple2026: '#CC79A7'  // Púrpura Rosa
};

document.addEventListener('DOMContentLoaded', () => {
  logMessage('INFO', 'Aplicación cargada. Iniciando petición a Google Apps Script...');
  fetchDashboardData();
  setupFilterListeners();
  setupDropdownDismiss();
});

function logMessage(type, message, detail = null) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = { timestamp, type, message, detail };
  connectionLogs.push(entry);

  const consoleElem = document.getElementById('log-console');
  if (consoleElem) {
    const div = document.createElement('div');
    const colorClass = type === 'ERROR' ? 'text-rose-400' : type === 'WARN' ? 'text-amber-300' : 'text-emerald-400';
    div.className = colorClass;
    div.innerHTML = `[${timestamp}] [${type}] ${message} ${detail ? '<br/><span class="text-slate-400 text-[11px] font-sans pl-4">➔ ' + detail + '</span>' : ''}`;
    consoleElem.appendChild(div);
    consoleElem.scrollTop = consoleElem.scrollHeight;
  }
}

function clearConsoleLog() {
  connectionLogs = [];
  document.getElementById('log-console').innerHTML = '<div>[SISTEMA] Log limpiado.</div>';
}

function toggleLogModal() {
  const modal = document.getElementById('log-modal');
  modal.classList.toggle('hidden');
}

/**
 * LÓGICA DE INTERFAZ ESTILO GOOGLE SHEETS
 */
function toggleDropdown(id) {
  const target = document.getElementById(id);
  const isHidden = target.classList.contains('hidden');
  
  // Cerrar otros desplegables abiertos
  document.querySelectorAll('.dropdown-container div[id^="dropdown-"]').forEach(el => el.classList.add('hidden'));

  if (isHidden) {
    target.classList.remove('hidden');
    const input = target.querySelector('input[type="text"]');
    if (input) input.focus();
  }
}

function setupDropdownDismiss() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-container')) {
      document.querySelectorAll('.dropdown-container div[id^="dropdown-"]').forEach(el => el.classList.add('hidden'));
    }
  });
}

/**
 * Filtrar las opciones visibles según la búsqueda
 */
function filterDropdownOptions(dropdownId, searchText) {
  const dropdown = document.getElementById(dropdownId);
  const items = dropdown.querySelectorAll('.options-list .option-item');
  const query = searchText.toLowerCase().trim();

  items.forEach(item => {
    const labelText = item.querySelector('span').textContent.toLowerCase();
    if (labelText.includes(query)) {
      item.classList.remove('hidden');
    } else {
      item.classList.add('hidden');
    }
  });
}

/**
 * Botones: Seleccionar Todo / Borrar (Solo afecta las opciones visibles en la búsqueda)
 */
function selectAllInDropdown(dropdownId, checkStatus) {
  const dropdown = document.getElementById(dropdownId);
  const visibleItems = dropdown.querySelectorAll('.options-list .option-item:not(.hidden) input[type="checkbox"]');

  visibleItems.forEach(cb => {
    cb.checked = checkStatus;
  });

  updateFilterLabels();
  processAndRenderDashboard();
}

async function fetchDashboardData() {
  const badge = document.getElementById('status-badge');
  badge.textContent = 'Conectando...';
  badge.className = 'px-3 py-1 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30';
  
  logMessage('INFO', `Enviando solicitud GET a: ${API_URL}`);

  try {
    const startTime = performance.now();
    const response = await fetch(API_URL, { method: 'GET', redirect: 'follow' });
    const duration = (performance.now() - startTime).toFixed(0);

    logMessage('INFO', `Respuesta HTTP recibida. Código estado: ${response.status} (${duration}ms)`);

    if (!response.ok) {
      throw new Error(`Error HTTP Status: ${response.status} - ${response.statusText}`);
    }

    const result = await response.json();

    if (result.status === 'success') {
      logMessage('INFO', 'Datos cargados exitosamente desde Apps Script.');
      badge.textContent = 'En línea';
      badge.className = 'px-3 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      
      rawData = result.data;
      buildServiceCostMap();
      populateFilterOptions();
      processAndRenderDashboard();
    } else {
      throw new Error(result.message || 'Respuesta con error del backend en Google Apps Script');
    }

  } catch (error) {
    logMessage('ERROR', 'Fallo de conexión o lectura de la API de Google Apps Script', error.stack || error.message);
    badge.textContent = 'Error de conexión';
    badge.className = 'px-3 py-1 text-xs rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
  }
}

function buildServiceCostMap() {
  serviceCostMap = {};
  if (rawData.datos && Array.isArray(rawData.datos)) {
    rawData.datos.forEach(row => {
      if (row.nomServicio) {
        const nameKey = row.nomServicio.toString().trim().toLowerCase();
        const rawCostStr = row.costoServicio !== undefined ? row.costoServicio.toString().trim() : '0';
        
        let parsedCost = 0;
        if (rawCostStr !== '-' && rawCostStr !== '') {
          const num = parseFloat(rawCostStr.replace(',', '.'));
          parsedCost = isNaN(num) ? 0 : num;
        }

        const macroGroup = row.MacroServicio ? row.MacroServicio.toString().trim() : 'OTRO';
        
        serviceCostMap[nameKey] = { 
          costo: parsedCost, 
          macroServicio: macroGroup 
        };
      }
    });
  }
}

function populateFilterOptions() {
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
    const sName = item.Servicio || item.nomServicio;
    if (sName) servicios.add(sName);
    if (item.areaSolicitante) areas.add(item.areaSolicitante);
  });

  fillCheckboxDropdown('dropdown-estado', 'filter-estado-cb', Array.from(estados).sort());
  fillCheckboxDropdown('dropdown-area', 'filter-area-cb', Array.from(areas).sort());
  fillCheckboxDropdown('dropdown-servicio', 'filter-servicio-cb', Array.from(servicios).sort());
}

function fillCheckboxDropdown(dropdownId, className, options) {
  const dropdown = document.getElementById(dropdownId);
  const optionsList = dropdown.querySelector('.options-list');
  optionsList.innerHTML = '';

  options.forEach(opt => {
    const label = document.createElement('label');
    label.className = 'option-item flex items-center gap-2 p-1.5 hover:bg-slate-800 rounded cursor-pointer text-xs';
    label.innerHTML = `
      <input type="checkbox" value="${opt}" class="filter-cb ${className} rounded border-slate-600 text-indigo-600 focus:ring-0" checked>
      <span class="truncate">${opt}</span>
    `;
    optionsList.appendChild(label);
  });
}

function setupFilterListeners() {
  // Cambio en los checkboxes
  document.addEventListener('change', (e) => {
    if (e.target.matches('.filter-cb')) {
      updateFilterLabels();
      processAndRenderDashboard();
    }
  });

  // Limpiar todos los filtros a su estado por defecto
  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    document.querySelectorAll('.filter-cb').forEach(cb => { cb.checked = true; });
    document.querySelectorAll('.dropdown-container input[type="text"]').forEach(input => {
      input.value = '';
      filterDropdownOptions(input.closest('div[id^="dropdown-"]').id, '');
    });
    updateFilterLabels();
    processAndRenderDashboard();
  });
}

function getSelectedValues(className) {
  return Array.from(document.querySelectorAll(`.${className}:checked`)).map(cb => cb.value);
}

function updateFilterLabels() {
  const updateLabel = (className, labelId, defaultText) => {
    const all = document.querySelectorAll(`.${className}`);
    const selected = document.querySelectorAll(`.${className}:checked`);
    const labelElem = document.getElementById(labelId);

    if (selected.length === 0) {
      labelElem.textContent = 'Ninguno';
      labelElem.className = 'truncate text-rose-400 font-semibold';
    } else if (selected.length === all.length) {
      labelElem.textContent = defaultText;
      labelElem.className = 'truncate text-slate-200';
    } else if (selected.length === 1) {
      labelElem.textContent = selected[0].value;
      labelElem.className = 'truncate text-indigo-300';
    } else {
      labelElem.textContent = `${selected.length} seleccionados`;
      labelElem.className = 'truncate text-indigo-300';
    }
  };

  updateLabel('filter-anio-cb', 'label-filter-anio', 'Todos seleccionados');
  updateLabel('filter-estado-cb', 'label-filter-estado', 'Todos seleccionados');
  updateLabel('filter-area-cb', 'label-filter-area', 'Todas seleccionadas');
  updateLabel('filter-servicio-cb', 'label-filter-servicio', 'Todos seleccionados');
}

/**
 * REGLA DE NEGOCIO: Excluye registros incompletos
 */
function isValidRecord(item, isService = false) {
  if (!item.fCreacion || item.fCreacion.toString().trim() === '' || item.fCreacion === 'NaN') {
    return false;
  }
  const dCreate = new Date(item.fCreacion);
  if (isNaN(dCreate.getTime())) return false;

  if (isService) {
    const sName = item.Servicio || item.nomServicio;
    if (!sName || sName.toString().trim() === '') return false;
  }

  return true;
}

function processAndRenderDashboard() {
  const selAnios = getSelectedValues('filter-anio-cb');
  const selEstados = getSelectedValues('filter-estado-cb');
  const selAreas = getSelectedValues('filter-area-cb');
  const selServicios = getSelectedValues('filter-servicio-cb');

  let exReq2025 = 0, exReq2026 = 0, exSer2025 = 0, exSer2026 = 0;

  const filterList = (list, yearStr, checkServicio = false, onExcluded) => {
    if (!selAnios.includes(yearStr)) return [];
    
    return list.filter(item => {
      const valid = isValidRecord(item, checkServicio);
      if (!valid) {
        onExcluded();
        return false;
      }

      if (selEstados.length > 0 && item.estadoTicket && !selEstados.includes(item.estadoTicket)) {
        return false;
      }
      if (selAreas.length > 0 && item.areaSolicitante && !selAreas.includes(item.areaSolicitante)) {
        return false;
      }
      
      if (checkServicio && selServicios.length > 0) {
        const sName = item.Servicio || item.nomServicio;
        if (sName && !selServicios.includes(sName)) return false;
      }

      return true;
    });
  };

  const cleanReq2025 = filterList(rawData.req2025, '2025', false, () => exReq2025++);
  const cleanReq2026 = filterList(rawData.req2026, '2026', false, () => exReq2026++);
  const cleanSer2025 = filterList(rawData.ser2025, '2025', true, () => exSer2025++);
  const cleanSer2026 = filterList(rawData.ser2026, '2026', true, () => exSer2026++);

  // Auditoría
  document.getElementById('audit-req2025').textContent = exReq2025;
  document.getElementById('audit-req2026').textContent = exReq2026;
  document.getElementById('audit-ser2025').textContent = exSer2025;
  document.getElementById('audit-ser2026').textContent = exSer2026;
  const totalExcluded = exReq2025 + exReq2026 + exSer2025 + exSer2026;
  document.getElementById('audit-total-excluded').textContent = `${totalExcluded} Excluidos`;

  // Conteo mensual
  const reqMonthly2025 = getMonthlyCounts(cleanReq2025);
  const reqMonthly2026 = getMonthlyCounts(cleanReq2026);
  const serMonthly2025 = getMonthlyCounts(cleanSer2025);
  const serMonthly2026 = getMonthlyCounts(cleanSer2026);

  // Tiempos promedio
  const reqTime2025 = getMonthlyAvgVidaTicket(cleanReq2025);
  const reqTime2026 = getMonthlyAvgVidaTicket(cleanReq2026);
  const serTime2025 = getMonthlyAvgVidaTicketSER(cleanSer2025);
  const serTime2026 = getMonthlyAvgVidaTicketSER(cleanSer2026);

  // Costos acumulados
  const { monthlyCosts2025, monthlyCosts2026, grandTotalCost } = calculateMonthlyServiceCosts(cleanSer2025, cleanSer2026);

  // KPIs
  const totalReq = cleanReq2025.length + cleanReq2026.length;
  const totalSer = cleanSer2025.length + cleanSer2026.length;
  document.getElementById('kpi-req-total').textContent = totalReq;
  document.getElementById('kpi-ser-total').textContent = totalSer;

  const activeReqMonths = [...reqMonthly2025, ...reqMonthly2026].filter(v => v > 0).length || 1;
  const activeSerMonths = [...serMonthly2025, ...serMonthly2026].filter(v => v > 0).length || 1;
  document.getElementById('kpi-req-prom').textContent = (totalReq / activeReqMonths).toFixed(1);
  document.getElementById('kpi-ser-prom').textContent = (totalSer / activeSerMonths).toFixed(1);
  document.getElementById('kpi-costo-total').textContent = `S/ ${grandTotalCost.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  renderCharts({
    req2025: reqMonthly2025, req2026: reqMonthly2026,
    ser2025: serMonthly2025, ser2026: serMonthly2026,
    reqTime2025, reqTime2026, serTime2025, serTime2026,
    monthlyCosts2025, monthlyCosts2026,
    selAnios
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

function calculateMonthlyServiceCosts(ser2025, ser2026) {
  const monthlyCosts2025 = Array(12).fill(0);
  const monthlyCosts2026 = Array(12).fill(0);
  let grandTotalCost = 0;

  const processList = (items, targetArray) => {
    items.forEach(item => {
      const rawServiceName = item.Servicio || item.nomServicio;
      if (item.fCreacion && rawServiceName) {
        const d = new Date(item.fCreacion);
        if (!isNaN(d.getTime())) {
          const nameKey = rawServiceName.toString().trim().toLowerCase();
          const info = serviceCostMap[nameKey];
          
          const unitCost = info ? info.costo : 0;
          const monthIndex = d.getMonth();

          targetArray[monthIndex] += unitCost;
          grandTotalCost += unitCost;
        }
      }
    });
  };

  processList(ser2025, monthlyCosts2025);
  processList(ser2026, monthlyCosts2026);

  return { monthlyCosts2025, monthlyCosts2026, grandTotalCost };
}

function getMonthlyAvgVidaTicket(items) {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);

  items.forEach(item => {
    if (item.vidaTicket !== null && item.vidaTicket !== undefined && item.vidaTicket !== '') {
      const vida = parseFloat(item.vidaTicket);
      const d = new Date(item.fCreacion);
      if (!isNaN(d.getTime()) && !isNaN(vida) && vida >= 0) {
        const month = d.getMonth();
        sums[month] += vida;
        counts[month]++;
      }
    }
  });

  return sums.map((sum, i) => (counts[i] > 0 ? parseFloat((sum / counts[i]).toFixed(1)) : 0));
}

function getMonthlyAvgVidaTicketSER(items) {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);

  items.forEach(item => {
    if (item.fCobertura && item.fCobertura.toString().trim() !== '') {
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
    }
  });

  return sums.map((sum, i) => (counts[i] > 0 ? parseFloat((sum / counts[i]).toFixed(1)) : 0));
}

function renderCharts({ req2025, req2026, ser2025, ser2026, reqTime2025, reqTime2026, serTime2025, serTime2026, monthlyCosts2025, monthlyCosts2026, selAnios }) {
  Object.values(chartInstances).forEach(chart => chart.destroy());

  const show2025 = selAnios.includes('2025');
  const show2026 = selAnios.includes('2026');

  // 1. REQ por Mes
  chartInstances.req = new Chart(document.getElementById('chartReq'), {
    type: 'bar',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(show2025 ? [{ label: 'REQ 2025', data: req2025, backgroundColor: COLORS.blue2025 }] : []),
        ...(show2026 ? [{ label: 'REQ 2026', data: req2026, backgroundColor: COLORS.orange2026 }] : [])
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
        ...(show2025 ? [{ label: 'SER 2025', data: ser2025, backgroundColor: COLORS.teal2025 }] : []),
        ...(show2026 ? [{ label: 'SER 2026', data: ser2026, backgroundColor: COLORS.purple2026 }] : [])
      ]
    },
    options: getChartCommonOptions()
  });

  // 3. Costo Acumulado
  chartInstances.cost = new Chart(document.getElementById('chartCost'), {
    type: 'bar',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(show2025 ? [{ label: 'Costo 2025 (S/)', data: monthlyCosts2025, backgroundColor: COLORS.teal2025 }] : []),
        ...(show2026 ? [{ label: 'Costo 2026 (S/)', data: monthlyCosts2026, backgroundColor: COLORS.purple2026 }] : [])
      ]
    },
    options: {
      ...getChartCommonOptions(''),
      plugins: {
        legend: { labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } } },
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#f8fafc',
          font: { weight: 'bold', size: 9 },
          formatter: (value) => (value > 0 ? `S/ ${value.toLocaleString('es-PE')}` : ''),
          offset: 4,
          clip: false
        }
      }
    }
  });

  // 4. Tiempo Promedio REQ
  chartInstances.timeReq = new Chart(document.getElementById('chartTimeReq'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(show2025 ? [{ label: 'Días Prom. 2025', data: reqTime2025, borderColor: COLORS.blue2025, backgroundColor: COLORS.blue2025, tension: 0.2 }] : []),
        ...(show2026 ? [{ label: 'Días Prom. 2026', data: reqTime2026, borderColor: COLORS.orange2026, backgroundColor: COLORS.orange2026, tension: 0.2 }] : [])
      ]
    },
    options: getChartCommonOptions(' d')
  });

  // 5. Tiempo Promedio SER
  chartInstances.timeSer = new Chart(document.getElementById('chartTimeSer'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        ...(show2025 ? [{ label: 'Días Prom. 2025', data: serTime2025, borderColor: COLORS.teal2025, backgroundColor: COLORS.teal2025, tension: 0.2 }] : []),
        ...(show2026 ? [{ label: 'Días Prom. 2026', data: serTime2026, borderColor: COLORS.purple2026, backgroundColor: COLORS.purple2026, tension: 0.2 }] : [])
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