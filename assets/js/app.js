/**
 * ============================================================================
 * CONTROLADOR FRONTEND - DASHBOARD DE MÉTRICAS AV CON REGISTROS DETALLADOS
 * ============================================================================
 */

// ⚠️ REEMPLAZA ESTA URL POR LA NUEVA URL QUE COPIASTE EN APPS SCRIPT:
const API_URL = 'https://script.google.com/macros/s/AKfycbz4vWZTmXN8Y-XUcKxZANNkfGEnfE-LRbVLpsR_6es7RdkL8qVVYpuodIZpGj_TkOR1yA/exec';

let rawData = { req2025: [], req2026: [], ser2025: [], ser2026: [], datos: [], ultimaActualizacion: "" };
let filteredDataGlobal = { req: [], ser: [] };
let modalCurrentRecords = [];
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

      // ACTUALIZAR ETIQUETA DE ÚLTIMA ACTUALIZACIÓN
      if (rawData.ultimaActualizacion) {
        const updateContainer = document.getElementById('last-update-info');
        const updateText = document.getElementById('last-update-text');
        if (updateContainer && updateText) {
          updateText.textContent = rawData.ultimaActualizacion;
          updateContainer.classList.remove('hidden');
        }
      }

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
  
  updateFilterLabels();
}

function fillCheckboxDropdown(dropdownId, cbClass, optionsArray) {
  const dropdown = document.getElementById(dropdownId);
  const container = dropdown.querySelector('.options-list');
  container.innerHTML = '';

  optionsArray.forEach(opt => {
    if (!opt) return;
    const label = document.createElement('label');
    label.className = 'option-item flex items-center gap-2 p-1.5 hover:bg-slate-800 rounded cursor-pointer text-xs';
    label.innerHTML = `
      <input type="checkbox" value="${opt}" class="filter-cb ${cbClass} rounded border-slate-600 text-indigo-600 focus:ring-0" checked>
      <span class="truncate" title="${opt}">${opt}</span>
    `;
    container.appendChild(label);
  });
}

function setupFilterListeners() {
  document.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('filter-cb')) {
      updateFilterLabels();
      processAndRenderDashboard();
    }
  });

  const btnReset = document.getElementById('btn-reset-filters');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      document.querySelectorAll('.filter-cb').forEach(cb => cb.checked = true);
      updateFilterLabels();
      processAndRenderDashboard();
    });
  }
}

function updateFilterLabels() {
  updateSingleLabel('dropdown-anio', 'label-filter-anio', 'Años');
  updateSingleLabel('dropdown-estado', 'label-filter-estado', 'Estados');
  updateSingleLabel('dropdown-area', 'label-filter-area', 'Áreas');
  updateSingleLabel('dropdown-servicio', 'label-filter-servicio', 'Servicios');
}

function updateSingleLabel(dropdownId, labelId, entityName) {
  const dropdown = document.getElementById(dropdownId);
  const label = document.getElementById(labelId);
  const checkboxes = dropdown.querySelectorAll('.options-list input[type="checkbox"]');
  const checked = dropdown.querySelectorAll('.options-list input[type="checkbox"]:checked');

  if (checked.length === checkboxes.length) {
    label.textContent = 'Todos seleccionados';
  } else if (checked.length === 0) {
    label.textContent = 'Ninguno seleccionado';
  } else if (checked.length === 1) {
    label.textContent = checked[0].value;
  } else {
    label.textContent = `${checked.length} seleccionados`;
  }
}

function getSelectedFilterValues(cbClass) {
  const checkboxes = document.querySelectorAll(`.${cbClass}:checked`);
  return Array.from(checkboxes).map(cb => cb.value);
}

function processAndRenderDashboard() {
  const selectedAnios = getSelectedFilterValues('filter-anio-cb');
  const selectedEstados = getSelectedFilterValues('filter-estado-cb');
  const selectedAreas = getSelectedFilterValues('filter-area-cb');
  const selectedServicios = getSelectedFilterValues('filter-servicio-cb');

  // Filtrado REQ
  let filteredReq = [];
  let excludedReq2025 = 0, excludedReq2026 = 0;

  if (selectedAnios.includes('2025')) {
    rawData.req2025.forEach(item => {
      if (!item.fechaInicio || item.fechaInicio === '') { excludedReq2025++; return; }
      if (selectedEstados.length && !selectedEstados.includes(item.estadoTicket)) return;
      if (selectedAreas.length && !selectedAreas.includes(item.areaSolicitante)) return;
      filteredReq.push({ ...item, anio: '2025' });
    });
  }

  if (selectedAnios.includes('2026')) {
    rawData.req2026.forEach(item => {
      if (!item.fechaInicio || item.fechaInicio === '') { excludedReq2026++; return; }
      if (selectedEstados.length && !selectedEstados.includes(item.estadoTicket)) return;
      if (selectedAreas.length && !selectedAreas.includes(item.areaSolicitante)) return;
      filteredReq.push({ ...item, anio: '2026' });
    });
  }

  // Filtrado SER
  let filteredSer = [];
  let excludedSer2025 = 0, excludedSer2026 = 0;

  if (selectedAnios.includes('2025')) {
    rawData.ser2025.forEach(item => {
      if (!item.fechaInicio || item.fechaInicio === '') { excludedSer2025++; return; }
      const sName = item.Servicio || item.nomServicio;
      if (selectedServicios.length && !selectedServicios.includes(sName)) return;
      if (selectedAreas.length && !selectedAreas.includes(item.areaSolicitante)) return;
      filteredSer.push({ ...item, anio: '2025', sName: sName });
    });
  }

  if (selectedAnios.includes('2026')) {
    rawData.ser2026.forEach(item => {
      if (!item.fechaInicio || item.fechaInicio === '') { excludedSer2026++; return; }
      const sName = item.Servicio || item.nomServicio;
      if (selectedServicios.length && !selectedServicios.includes(sName)) return;
      if (selectedAreas.length && !selectedAreas.includes(item.areaSolicitante)) return;
      filteredSer.push({ ...item, anio: '2026', sName: sName });
    });
  }

  filteredDataGlobal.req = filteredReq;
  filteredDataGlobal.ser = filteredSer;

  // Actualizar indicadores de Auditoría
  document.getElementById('audit-req2025').textContent = excludedReq2025;
  document.getElementById('audit-req2026').textContent = excludedReq2026;
  document.getElementById('audit-ser2025').textContent = excludedSer2025;
  document.getElementById('audit-ser2026').textContent = excludedSer2026;
  document.getElementById('audit-total-excluded').textContent = `${excludedReq2025 + excludedReq2026 + excludedSer2025 + excludedSer2026} Excluidos`;

  renderKPIs(filteredReq, filteredSer);
  renderCharts(filteredReq, filteredSer);
}

function renderKPIs(reqList, serList) {
  document.getElementById('kpi-req-total').textContent = reqList.length.toLocaleString('es-PE');
  document.getElementById('kpi-ser-total').textContent = serList.length.toLocaleString('es-PE');

  // Promedios por meses activos
  const reqMonths = new Set(reqList.map(r => r.fechaInicio.substring(0, 7))).size || 1;
  const serMonths = new Set(serList.map(s => s.fechaInicio.substring(0, 7))).size || 1;

  document.getElementById('kpi-req-prom').textContent = (reqList.length / reqMonths).toFixed(1);
  document.getElementById('kpi-ser-prom').textContent = (serList.length / serMonths).toFixed(1);

  // Cálculo de Costo Total Ejecutado
  let totalCost = 0;
  serList.forEach(s => {
    const sName = (s.sName || '').toLowerCase().trim();
    if (serviceCostMap[sName]) {
      totalCost += serviceCostMap[sName].costo;
    }
  });

  document.getElementById('kpi-costo-total').textContent = `S/ ${totalCost.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderCharts(reqList, serList) {
  // 1. REQ Mensual
  const req2025ByMonth = new Array(12).fill(0);
  const req2026ByMonth = new Array(12).fill(0);

  reqList.forEach(r => {
    const m = parseInt(r.fechaInicio.substring(5, 7), 10) - 1;
    if (r.anio === '2025') req2025ByMonth[m]++;
    if (r.anio === '2026') req2026ByMonth[m]++;
  });

  createOrUpdateChart('chartReq', 'bar', MONTH_NAMES, [
    { label: '2025', data: req2025ByMonth, backgroundColor: COLORS.blue2025 },
    { label: '2026', data: req2026ByMonth, backgroundColor: COLORS.orange2026 }
  ]);

  // 2. SER Mensual
  const ser2025ByMonth = new Array(12).fill(0);
  const ser2026ByMonth = new Array(12).fill(0);

  serList.forEach(s => {
    const m = parseInt(s.fechaInicio.substring(5, 7), 10) - 1;
    if (s.anio === '2025') ser2025ByMonth[m]++;
    if (s.anio === '2026') ser2026ByMonth[m]++;
  });

  createOrUpdateChart('chartSer', 'bar', MONTH_NAMES, [
    { label: '2025', data: ser2025ByMonth, backgroundColor: COLORS.teal2025 },
    { label: '2026', data: ser2026ByMonth, backgroundColor: COLORS.purple2026 }
  ]);

  // 3. Costo Acumulado
  const cost2025ByMonth = new Array(12).fill(0);
  const cost2026ByMonth = new Array(12).fill(0);

  serList.forEach(s => {
    const m = parseInt(s.fechaInicio.substring(5, 7), 10) - 1;
    const sName = (s.sName || '').toLowerCase().trim();
    const cost = serviceCostMap[sName] ? serviceCostMap[sName].costo : 0;

    if (s.anio === '2025') cost2025ByMonth[m] += cost;
    if (s.anio === '2026') cost2026ByMonth[m] += cost;
  });

  createOrUpdateChart('chartCost', 'line', MONTH_NAMES, [
    { label: '2025 (S/)', data: cost2025ByMonth, borderColor: COLORS.teal2025, backgroundColor: COLORS.teal2025, fill: false, tension: 0.3 },
    { label: '2026 (S/)', data: cost2026ByMonth, borderColor: COLORS.purple2026, backgroundColor: COLORS.purple2026, fill: false, tension: 0.3 }
  ], true);

  // 4. Tiempos Promedio de Atención (Vida del Ticket - REQ & SER)
  renderTimeCharts(reqList, serList);
}

function renderTimeCharts(reqList, serList) {
  // Tiempos REQ
  const timeReq2025 = calculateAverageTimeByMonth(reqList.filter(r => r.anio === '2025'));
  const timeReq2026 = calculateAverageTimeByMonth(reqList.filter(r => r.anio === '2026'));

  createOrUpdateChart('chartTimeReq', 'bar', MONTH_NAMES, [
    { label: '2025 (Días)', data: timeReq2025, backgroundColor: COLORS.blue2025 },
    { label: '2026 (Días)', data: timeReq2026, backgroundColor: COLORS.orange2026 }
  ]);

  // Tiempos SER
  const timeSer2025 = calculateAverageTimeByMonth(serList.filter(s => s.anio === '2025'));
  const timeSer2026 = calculateAverageTimeByMonth(serList.filter(s => s.anio === '2026'));

  createOrUpdateChart('chartTimeSer', 'bar', MONTH_NAMES, [
    { label: '2025 (Días)', data: timeSer2025, backgroundColor: COLORS.teal2025 },
    { label: '2026 (Días)', data: timeSer2026, backgroundColor: COLORS.purple2026 }
  ]);
}

function calculateAverageTimeByMonth(list) {
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);

  list.forEach(item => {
    if (item.fechaInicio && item.fechaFin) {
      const start = new Date(item.fechaInicio);
      const end = new Date(item.fechaFin);
      const diffDays = Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
      const m = parseInt(item.fechaInicio.substring(5, 7), 10) - 1;

      if (!isNaN(diffDays)) {
        sums[m] += diffDays;
        counts[m]++;
      }
    }
  });

  return sums.map((sum, idx) => counts[idx] > 0 ? parseFloat((sum / counts[idx]).toFixed(1)) : 0);
}

function createOrUpdateChart(canvasId, type, labels, datasets, isCurrency = false) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  chartInstances[canvasId] = new Chart(ctx, {
    type: type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
        datalabels: {
          color: '#f8fafc',
          anchor: 'end',
          align: 'end',
          font: { size: 9, weight: 'bold' },
          formatter: (val) => {
            if (!val || val === 0) return '';
            return isCurrency ? `S/ ${val.toLocaleString('es-PE')}` : val;
          }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } }
      }
    }
  });
}

/**
 * MÓDULO MODAL DE REGISTROS
 */
function openRecordsModal(type) {
  const modal = document.getElementById('records-modal');
  const title = document.getElementById('records-modal-title');
  const searchInput = document.getElementById('records-search-input');
  
  modalCurrentRecords = type === 'req' ? filteredDataGlobal.req : filteredDataGlobal.ser;
  
  title.textContent = type === 'req' ? '📋 Registros Filtrados - Requerimientos (REQ)' : '📋 Registros Filtrados - Servicios (SER)';
  searchInput.value = '';
  
  renderModalTable(modalCurrentRecords);
  modal.classList.remove('hidden');
}

function closeRecordsModal() {
  document.getElementById('records-modal').classList.add('hidden');
}

function filterModalTable(query) {
  const q = query.toLowerCase().trim();
  const filtered = modalCurrentRecords.filter(r => {
    const ticket = (r.numTicket || r.Ticket || '').toString().toLowerCase();
    const service = (r.sName || r.nomServicio || r.Servicio || r.resumen || '').toString().toLowerCase();
    const date = (r.fechaInicio || '').toLowerCase();
    const reqBy = (r.areaSolicitante || r.solicitante || '').toString().toLowerCase();

    return ticket.includes(q) || service.includes(q) || date.includes(q) || reqBy.includes(q);
  });

  renderModalTable(filtered);
}

function renderModalTable(records) {
  const tbody = document.getElementById('records-table-body');
  const badge = document.getElementById('records-count-badge');
  tbody.innerHTML = '';

  badge.textContent = `${records.length} Registros`;

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-500">No se encontraron registros que coincidan.</td></tr>`;
    return;
  }

  records.slice(0, 100).forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/50 transition-colors';
    
    const ticket = r.numTicket || r.Ticket || '-';
    const service = r.sName || r.nomServicio || r.Servicio || r.resumen || '-';
    const date = r.fechaInicio || '-';
    const reqBy = r.areaSolicitante || r.solicitante || '-';

    tr.innerHTML = `
      <td class="py-2.5 px-3 font-mono text-indigo-400 font-semibold">${ticket}</td>
      <td class="py-2.5 px-3 truncate max-w-xs" title="${service}">${service}</td>
      <td class="py-2.5 px-3 text-slate-400">${date}</td>
      <td class="py-2.5 px-3 text-slate-400 truncate max-w-xs" title="${reqBy}">${reqBy}</td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleChartExpand(cardId) {
  const card = document.getElementById(cardId);
  card.classList.toggle('lg:col-span-2');
  window.dispatchEvent(new Event('resize'));
}