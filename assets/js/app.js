/**
 * PROYECTO: MÉTRICAS AV 3.0 (UNIVERSIDAD ESAN)
 * COMPONENTE: apps.js (Controlador Frontend JavaScript)
 * CONTROL DE VERSIONES:
 * ---------------------------------------------------------------------------------
 * Versión | Fecha      | Autor    | Descripción
 * ---------------------------------------------------------------------------------
 * v1.0    | 10/01/2025 | ESAN/AV  | Consumo inicial de API y renderizado básico Chart.js.
 * v2.0    | 17/06/2026 | ESAN/AV  | Mapeo dinámico de filtros desplegables y KPIs.
 * v2.5    | 18/06/2026 | ESAN/AV  | Implementación de cálculo de costos acumulados y promedios.
 * v2.8    | 18/06/2026 | ESAN/AV  | Módulo de auditoría de registros excluidos y tolerancia a encabezados.
 * v3.0    | 21/09/2026 | ESAN/AV  | Comentarios exhaustivos línea por línea y optimización de búsquedas en tablas.
 * ---------------------------------------------------------------------------------
 */

// URL del punto de enlace de la API expuesta por el Web App en Google Apps Script
const API_URL = 'https://script.google.com/macros/s/AKfycbz4vWZTmXN8Y-XUcKxZANNkfGEnfE-LRbVLpsR_6es7RdkL8qVVYpuodIZpGj_TkOR1yA/exec';

// Estructura contenedora de los datos brutos recibidos del servidor
let rawData = { req2025: [], req2026: [], ser2025: [], ser2026: [], datos: [], ultimaActualizacion: "" };

// Contenedor global de los registros filtrados activos en pantalla
let filteredDataGlobal = { req: [], ser: [] };

// Referencia a la lista actual cargada en el modal de detalle
let modalCurrentRecords = [];

// Mapa clave-valor para la búsqueda rápida de precios de servicios por nombre
let serviceCostMap = {};

// Instancias activas de los gráficos para permitir su reinicialización al filtrar
let chartInstances = {};

// Registro en memoria de los logs de la aplicación
let connectionLogs = [];

// Lista estática con las abreviaturas de los 12 meses del año
const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

// Registra globalmente el plugin DataLabels en la librería Chart.js
Chart.register(ChartDataLabels);

// Paleta de colores accesible y con alto contraste (Colorblind-Safe)
const COLORS = {
  blue2025: '#0072B2',   // Azul Cobalto para 2025
  orange2026: '#E69F00', // Naranja para 2026
  teal2025: '#009E73',   // Verde Azulado para Servicios 2025
  purple2026: '#CC79A7'  // Púrpura Rosa para Servicios 2026
};

// Escuchador de evento que arranca la aplicación al terminar de cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  // Registra el evento inicial en el log
  logMessage('INFO', 'Aplicación cargada. Iniciando petición a Google Apps Script...');
  // Llama a la función de obtención de datos desde la API
  fetchDashboardData();
  // Configura los escuchadores para los componentes de filtro
  setupFilterListeners();
  // Asigna el evento para cerrar desplegables al hacer clic fuera
  setupDropdownDismiss();
});

/**
 * Agrega una nueva entrada de log a la consola interna
 * @param {string} type - Tipo de mensaje (INFO, WARN, ERROR)
 * @param {string} message - Descripción sintética
 * @param {string} detail - Detalle técnico adicional
 */
function logMessage(type, message, detail = null) {
  // Captura la hora local en formato amigablemente legible
  const timestamp = new Date().toLocaleTimeString();
  // Crea el objeto entrada del log
  const entry = { timestamp, type, message, detail };
  // Almacena la entrada en el arreglo global
  connectionLogs.push(entry);

  // Obtiene el elemento HTML de la consola del modal
  const consoleElem = document.getElementById('log-console');
  // Si la consola existe en la vista actual, genera el nodo HTML
  if (consoleElem) {
    // Crea un nuevo contenedor div
    const div = document.createElement('div');
    // Asigna el color dinámico según la gravedad del mensaje
    const colorClass = type === 'ERROR' ? 'text-rose-400' : type === 'WARN' ? 'text-amber-300' : 'text-emerald-400';
    div.className = colorClass;
    // Define el marcado interno con la marca de tiempo y texto
    div.innerHTML = `[${timestamp}] [${type}] ${message} ${detail ? '<br/><span class="text-slate-400 text-[11px] font-sans pl-4">➔ ' + detail + '</span>' : ''}`;
    // Agrega el elemento al árbol DOM de la consola
    consoleElem.appendChild(div);
    // Desplaza automáticamente el scroll hacia el final del texto
    consoleElem.scrollTop = consoleElem.scrollHeight;
  }
}

/**
 * Limpia todo el historial de mensajes de la consola de diagnóstico
 */
function clearConsoleLog() {
  // Reinicia la variable de almacenamiento
  connectionLogs = [];
  // Restablece el texto básico por defecto en la interfaz
  document.getElementById('log-console').innerHTML = '<div>[SISTEMA] Log limpiado.</div>';
}

/**
 * Alterna la visibilidad del modal de logs
 */
function toggleLogModal() {
  // Captura el elemento modal por su identificador
  const modal = document.getElementById('log-modal');
  // Conmuta la clase 'hidden' para mostrar u ocultar el panel
  modal.classList.toggle('hidden');
}

/**
 * Muestra u oculta los menús desplegables de filtro
 * @param {string} id - Identificador del desplegable destino
 */
function toggleDropdown(id) {
  // Obtiene el contenedor desplegable correspondiente
  const target = document.getElementById(id);
  // Revisa si actualmente se encuentra oculto
  const isHidden = target.classList.contains('hidden');
  
  // Oculta previamente cualquier otro desplegable que estuviera abierto
  document.querySelectorAll('.dropdown-container div[id^="dropdown-"]').forEach(el => el.classList.add('hidden'));

  // Si estaba oculto, remueve la clase para visibilizarlo y enfoca su caja de texto
  if (isHidden) {
    target.classList.remove('hidden');
    const input = target.querySelector('input[type="text"]');
    if (input) input.focus();
  }
}

/**
 * Oculta los selectores al hacer clic en cualquier área fuera de ellos
 */
function setupDropdownDismiss() {
  // Escucha clics globales en todo el documento HTML
  document.addEventListener('click', (e) => {
    // Si el objetivo del clic no pertenece a un contenedor de dropdown, cierra todos
    if (!e.target.closest('.dropdown-container')) {
      document.querySelectorAll('.dropdown-container div[id^="dropdown-"]').forEach(el => el.classList.add('hidden'));
    }
  });
}

/**
 * Filtra dinámicamente las opciones de un menú desplegable según el texto escrito
 * @param {string} dropdownId - ID del desplegable
 * @param {string} searchText - Texto ingresado por el usuario
 */
function filterDropdownOptions(dropdownId, searchText) {
  // Obtiene la instancia del desplegable objetivo
  const dropdown = document.getElementById(dropdownId);
  // Captura la lista de elementos de opción
  const items = dropdown.querySelectorAll('.options-list .option-item');
  // Convierte el texto de búsqueda a minúsculas sin espacios extremos
  const query = searchText.toLowerCase().trim();

  // Oculta o muestra cada checkbox individualmente
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
 * Selecciona o deselecciona de forma masiva los elementos de un filtro
 * @param {string} dropdownId - ID del desplegable
 * @param {boolean} checkStatus - Estado booleano objetivo (true: marcar todos, false: desmarcar)
 */
function selectAllInDropdown(dropdownId, checkStatus) {
  // Captura el contenedor del desplegable
  const dropdown = document.getElementById(dropdownId);
  // Selecciona sólo las opciones actualmente visibles para no afectar opciones ocultas por el buscador
  const visibleItems = dropdown.querySelectorAll('.options-list .option-item:not(.hidden) input[type="checkbox"]');

  // Actualiza la propiedad checked de cada selector
  visibleItems.forEach(cb => {
    cb.checked = checkStatus;
  });

  // Actualiza las etiquetas informativas de los botones
  updateFilterLabels();
  // Recalcula y renderiza nuevamente las métricas del dashboard
  processAndRenderDashboard();
}

/**
 * Realiza la petición asíncrona GET a la API en Google Apps Script
 */
async function fetchDashboardData() {
  // Obtiene la insignia de estado
  const badge = document.getElementById('status-badge');
  // Cambia el texto a modo conexión
  badge.textContent = 'Conectando...';
  // Aplica estilos en color ámbar de progreso
  badge.className = 'px-3 py-1 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30';
  
  // Asigna un mensaje de evento en consola
  logMessage('INFO', `Enviando solicitud GET a: ${API_URL}`);

  try {
    // Marca el inicio del tiempo de respuesta
    const startTime = performance.now();
    // Ejecuta la llamada fetch a la API con redirección automática
    const response = await fetch(API_URL, { method: 'GET', redirect: 'follow' });
    // Calcula la latencia transcurrida en milisegundos
    const duration = (performance.now() - startTime).toFixed(0);

    // Registra la recepción exitosa de la respuesta HTTP
    logMessage('INFO', `Respuesta HTTP recibida. Código estado: ${response.status} (${duration}ms)`);

    // Valida que el código de estado HTTP sea de éxito (200-299)
    if (!response.ok) {
      throw new Error(`Error HTTP Status: ${response.status} - ${response.statusText}`);
    }

    // Parsea la respuesta en formato de objeto JSON
    const result = await response.json();

    // Revisa que la propiedad de estado devuelta por el Apps Script sea 'success'
    if (result.status === 'success') {
      logMessage('INFO', 'Datos cargados exitosamente desde Apps Script.');
      // Actualiza la insignia de la interfaz a modo 'En línea'
      badge.textContent = 'En línea';
      badge.className = 'px-3 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      
      // Asigna los datos crudos a la variable estructurada global
      rawData = result.data;

      // Actualiza la etiqueta informativa de hora de actualización
      if (rawData.ultimaActualizacion) {
        const updateContainer = document.getElementById('last-update-info');
        const updateText = document.getElementById('last-update-text');
        if (updateContainer && updateText) {
          updateText.textContent = rawData.ultimaActualizacion;
          updateContainer.classList.remove('hidden');
        }
      }

      // Procesa el maestro de tarifas de servicios
      buildServiceCostMap();
      // Llena los selectores desplegables con valores únicos
      populateFilterOptions();
      // Procesa y dibuja las métricas principales
      processAndRenderDashboard();
    } else {
      throw new Error(result.message || 'Respuesta con error del backend en Google Apps Script');
    }

  } catch (error) {
    // Registra el evento de falla en la consola
    logMessage('ERROR', 'Fallo de conexión o lectura de la API de Google Apps Script', error.stack || error.message);
    // Cambia la insignia a color rojo indicando el error de comunicación
    badge.textContent = 'Error de conexión';
    badge.className = 'px-3 py-1 text-xs rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
  }
}

/**
 * Construye el índice hash map de costos por nombre de servicio a partir de la pestaña DATOS
 */
function buildServiceCostMap() {
  // Inicializa el mapa vacío
  serviceCostMap = {};
  // Verifica si existen datos en el arreglo
  if (rawData.datos && Array.isArray(rawData.datos)) {
    rawData.datos.forEach(row => {
      if (row.nomServicio) {
        // Normaliza el nombre del servicio convirtiéndolo a minúsculas
        const nameKey = row.nomServicio.toString().trim().toLowerCase();
        // Lee el valor bruto del costo de servicio
        const rawCostStr = row.costoServicio !== undefined ? row.costoServicio.toString().trim() : '0';
        
        let parsedCost = 0;
        // Si no es un guión ni una cadena vacía, convierte la coma decimal a punto
        if (rawCostStr !== '-' && rawCostStr !== '') {
          const num = parseFloat(rawCostStr.replace(',', '.'));
          parsedCost = isNaN(num) ? 0 : num;
        }

        // Lee la agrupación macro de servicio
        const macroGroup = row.MacroServicio ? row.MacroServicio.toString().trim() : 'OTRO';
        
        // Almacena el costo parsed y macroservicio indexados por el nombre
        serviceCostMap[nameKey] = { 
          costo: parsedCost, 
          macroServicio: macroGroup 
        };
      }
    });
  }
}

/**
 * Extrae valores únicos y pobla los dropdowns de filtrado
 */
function populateFilterOptions() {
  // Estructuras Set para almacenar nombres únicos sin duplicados
  const estados = new Set();
  const areas = new Set();
  const servicios = new Set();

  // Consolida todos los registros
  const allReq = [...rawData.req2025, ...rawData.req2026];
  const allSer = [...rawData.ser2025, ...rawData.ser2026];

  // Extrae de requerimientos
  allReq.forEach(item => {
    if (item.estadoTicket) estados.add(item.estadoTicket);
    if (item.areaSolicitante) areas.add(item.areaSolicitante);
  });

  // Extrae de servicios
  allSer.forEach(item => {
    const sName = item.Servicio || item.nomServicio;
    if (sName) servicios.add(sName);
    if (item.areaSolicitante) areas.add(item.areaSolicitante);
  });

  // Renderiza dinámicamente las opciones con checkboxes
  fillCheckboxDropdown('dropdown-estado', 'filter-estado-cb', Array.from(estados).sort());
  fillCheckboxDropdown('dropdown-area', 'filter-area-cb', Array.from(areas).sort());
  fillCheckboxDropdown('dropdown-servicio', 'filter-servicio-cb', Array.from(servicios).sort());
  
  // Actualiza los textos de las etiquetas
  updateFilterLabels();
}

/**
 * Genera el HTML dinámico con checkboxes para un selector
 * @param {string} dropdownId - ID del elemento contenedor
 * @param {string} cbClass - Clase CSS asignada a los checkboxes
 * @param {Array<string>} optionsArray - Lista de valores únicos a mostrar
 */
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

/**
 * Asigna los eventos de escucha a los cambios de estado de los filtros
 */
function setupFilterListeners() {
  // Detecta el cambio en cualquier checkbox de filtrado
  document.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('filter-cb')) {
      updateFilterLabels();
      processAndRenderDashboard();
    }
  });

  // Configura la acción del botón de reiniciar filtros
  const btnReset = document.getElementById('btn-reset-filters');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      document.querySelectorAll('.filter-cb').forEach(cb => cb.checked = true);
      updateFilterLabels();
      processAndRenderDashboard();
    });
  }
}

/**
 * Actualiza los textos resumen de los botones desencadenantes de cada filtro
 */
function updateFilterLabels() {
  updateSingleLabel('dropdown-anio', 'label-filter-anio', 'Años');
  updateSingleLabel('dropdown-estado', 'label-filter-estado', 'Estados');
  updateSingleLabel('dropdown-area', 'label-filter-area', 'Áreas');
  updateSingleLabel('dropdown-servicio', 'label-filter-servicio', 'Servicios');
}

/**
 * Actualiza la etiqueta de un filtro específico en función del recuento de elementos marcados
 */
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

/**
 * Obtiene un arreglo con los valores seleccionados de un grupo de checkboxes por su clase
 */
function getSelectedFilterValues(cbClass) {
  const checkboxes = document.querySelectorAll(`.${cbClass}:checked`);
  return Array.from(checkboxes).map(cb => cb.value);
}

/**
 * Función central de procesamiento: Filtra arreglos, calcula exclusiones y manda a renderizar gráficos
 */
function processAndRenderDashboard() {
  // Captura selecciones activas
  const selectedAnios = getSelectedFilterValues('filter-anio-cb');
  const selectedEstados = getSelectedFilterValues('filter-estado-cb');
  const selectedAreas = getSelectedFilterValues('filter-area-cb');
  const selectedServicios = getSelectedFilterValues('filter-servicio-cb');

  // Process REQ
  let filteredReq = [];
  let excludedReq2025 = 0, excludedReq2026 = 0;

  if (selectedAnios.includes('2025')) {
    rawData.req2025.forEach(item => {
      // Intenta extraer la fecha desde varios campos posibles por flexibilidad
      const fecha = item.fCreacion || item.fCobertura || item.fechaInicio;
      if (!fecha || fecha === '') { excludedReq2025++; return; }
      if (selectedEstados.length && !selectedEstados.includes(item.estadoTicket)) return;
      if (selectedAreas.length && !selectedAreas.includes(item.areaSolicitante)) return;
      filteredReq.push({ ...item, anio: '2025', fechaInicio: fecha });
    });
  }

  if (selectedAnios.includes('2026')) {
    rawData.req2026.forEach(item => {
      const fecha = item.fCreacion || item.fCobertura || item.fechaInicio;
      if (!fecha || fecha === '') { excludedReq2026++; return; }
      if (selectedEstados.length && !selectedEstados.includes(item.estadoTicket)) return;
      if (selectedAreas.length && !selectedAreas.includes(item.areaSolicitante)) return;
      filteredReq.push({ ...item, anio: '2026', fechaInicio: fecha });
    });
  }

  // Process SER
  let filteredSer = [];
  let excludedSer2025 = 0, excludedSer2026 = 0;

  if (selectedAnios.includes('2025')) {
    rawData.ser2025.forEach(item => {
      const fecha = item.fCobertura || item.fCreacion || item.fechaInicio;
      if (!fecha || fecha === '') { excludedSer2025++; return; }
      const sName = item.Servicio || item.nomServicio;
      if (selectedServicios.length && !selectedServicios.includes(sName)) return;
      if (selectedAreas.length && !selectedAreas.includes(item.areaSolicitante)) return;
      filteredSer.push({ ...item, anio: '2025', sName: sName, fechaInicio: fecha });
    });
  }

  if (selectedAnios.includes('2026')) {
    rawData.ser2026.forEach(item => {
      const fecha = item.fCobertura || item.fCreacion || item.fechaInicio;
      if (!fecha || fecha === '') { excludedSer2026++; return; }
      const sName = item.Servicio || item.nomServicio;
      if (selectedServicios.length && !selectedServicios.includes(sName)) return;
      if (selectedAreas.length && !selectedAreas.includes(item.areaSolicitante)) return;
      filteredSer.push({ ...item, anio: '2026', sName: sName, fechaInicio: fecha });
    });
  }

  // Almacena las listas filtradas en el scope global
  filteredDataGlobal.req = filteredReq;
  filteredDataGlobal.ser = filteredSer;

  // Actualiza los contadores de la sección de auditoría
  document.getElementById('audit-req2025').textContent = excludedReq2025;
  document.getElementById('audit-req2026').textContent = excludedReq2026;
  document.getElementById('audit-ser2025').textContent = excludedSer2025;
  document.getElementById('audit-ser2026').textContent = excludedSer2026;
  document.getElementById('audit-total-excluded').textContent = `${excludedReq2025 + excludedReq2026 + excludedSer2025 + excludedSer2026} Excluidos`;

  // Invoca el renderizado de tarjetas e indicadores
  renderKPIs(filteredReq, filteredSer);
  // Invoca la construcción/actualización de los gráficos
  renderCharts(filteredReq, filteredSer);
}

/**
 * Calcula y muestra los datos consolidados en los KPIs
 */
function renderKPIs(reqList, serList) {
  // Muestra totales absolutos
  document.getElementById('kpi-req-total').textContent = reqList.length.toLocaleString('es-PE');
  document.getElementById('kpi-ser-total').textContent = serList.length.toLocaleString('es-PE');

  // Promedios por meses activos
  const reqMonths = new Set(reqList.map(r => r.fechaInicio.substring(0, 7))).size || 1;
  const serMonths = new Set(serList.map(s => s.fechaInicio.substring(0, 7))).size || 1;

  document.getElementById('kpi-req-prom').textContent = (reqList.length / reqMonths).toFixed(1);
  document.getElementById('kpi-ser-prom').textContent = (serList.length / serMonths).toFixed(1);

  // Cálculo de Costo Total Ejecutado acumulando precios desde serviceCostMap
  let totalCost = 0;
  serList.forEach(s => {
    const sName = (s.sName || '').toLowerCase().trim();
    if (serviceCostMap[sName]) {
      totalCost += serviceCostMap[sName].costo;
    }
  });

  // Imprime el costo formateado con el símbolo de la moneda local (Soles)
  document.getElementById('kpi-costo-total').textContent = `S/ ${totalCost.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Genera todos los componentes visuales de Chart.js
 */
function renderCharts(reqList, serList) {
  // 1. Requerimientos por Mes
  const req2025ByMonth = new Array(12).fill(0);
  const req2026ByMonth = new Array(12).fill(0);

  reqList.forEach(r => {
    const m = parseInt(r.fechaInicio.substring(5, 7), 10) - 1;
    if (m >= 0 && m < 12) {
      if (r.anio === '2025') req2025ByMonth[m]++;
      if (r.anio === '2026') req2026ByMonth[m]++;
    }
  });

  createOrUpdateChart('chartReq', 'bar', MONTH_NAMES, [
    { label: '2025', data: req2025ByMonth, backgroundColor: COLORS.blue2025 },
    { label: '2026', data: req2026ByMonth, backgroundColor: COLORS.orange2026 }
  ]);

  // 2. Servicios por Mes
  const ser2025ByMonth = new Array(12).fill(0);
  const ser2026ByMonth = new Array(12).fill(0);

  serList.forEach(s => {
    const m = parseInt(s.fechaInicio.substring(5, 7), 10) - 1;
    if (m >= 0 && m < 12) {
      if (s.anio === '2025') ser2025ByMonth[m]++;
      if (s.anio === '2026') ser2026ByMonth[m]++;
    }
  });

  createOrUpdateChart('chartSer', 'bar', MONTH_NAMES, [
    { label: '2025', data: ser2025ByMonth, backgroundColor: COLORS.teal2025 },
    { label: '2026', data: ser2026ByMonth, backgroundColor: COLORS.purple2026 }
  ]);

  // 3. Costo Acumulado por Mes
  const cost2025ByMonth = new Array(12).fill(0);
  const cost2026ByMonth = new Array(12).fill(0);

  serList.forEach(s => {
    const m = parseInt(s.fechaInicio.substring(5, 7), 10) - 1;
    const sName = (s.sName || '').toLowerCase().trim();
    const cost = serviceCostMap[sName] ? serviceCostMap[sName].costo : 0;

    if (m >= 0 && m < 12) {
      if (s.anio === '2025') cost2025ByMonth[m] += cost;
      if (s.anio === '2026') cost2026ByMonth[m] += cost;
    }
  });

  createOrUpdateChart('chartCost', 'line', MONTH_NAMES, [
    { label: '2025 (S/)', data: cost2025ByMonth, borderColor: COLORS.teal2025, backgroundColor: COLORS.teal2025, fill: false, tension: 0.3 },
    { label: '2026 (S/)', data: cost2026ByMonth, borderColor: COLORS.purple2026, backgroundColor: COLORS.purple2026, fill: false, tension: 0.3 }
  ], true);

  // 4. Tiempos Promedio de Atención (Vida del Ticket)
  renderTimeCharts(reqList, serList);
}

/**
 * Prepara los datos y renderiza los dos gráficos de tiempos promedio en días
 */
function renderTimeCharts(reqList, serList) {
  const timeReq2025 = calculateAverageTimeByMonth(reqList.filter(r => r.anio === '2025'));
  const timeReq2026 = calculateAverageTimeByMonth(reqList.filter(r => r.anio === '2026'));

  createOrUpdateChart('chartTimeReq', 'bar', MONTH_NAMES, [
    { label: '2025 (Días)', data: timeReq2025, backgroundColor: COLORS.blue2025 },
    { label: '2026 (Días)', data: timeReq2026, backgroundColor: COLORS.orange2026 }
  ]);

  const timeSer2025 = calculateAverageTimeByMonth(serList.filter(s => s.anio === '2025'));
  const timeSer2026 = calculateAverageTimeByMonth(serList.filter(s => s.anio === '2026'));

  createOrUpdateChart('chartTimeSer', 'bar', MONTH_NAMES, [
    { label: '2025 (Días)', data: timeSer2025, backgroundColor: COLORS.teal2025 },
    { label: '2026 (Días)', data: timeSer2026, backgroundColor: COLORS.purple2026 }
  ]);
}

/**
 * Calcula los días promedio transcurridos por cada mes a partir de un arreglo
 */
function calculateAverageTimeByMonth(list) {
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);

  list.forEach(item => {
    // Lee la propiedad precalculada o realiza el cálculo por diferencia de marcas temporales
    let diffDays = parseFloat(item.diasResuelto || item.vidaTicket);
    
    if (isNaN(diffDays) && item.fCreacion && item.fResuelto) {
      const start = new Date(item.fCreacion);
      const end = new Date(item.fResuelto);
      diffDays = Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
    }

    if (!isNaN(diffDays) && item.fechaInicio) {
      const m = parseInt(item.fechaInicio.substring(5, 7), 10) - 1;
      if (m >= 0 && m < 12) {
        sums[m] += diffDays;
        counts[m]++;
      }
    }
  });

  return sums.map((sum, idx) => counts[idx] > 0 ? parseFloat((sum / counts[idx]).toFixed(1)) : 0);
}

/**
 * Crea o actualiza una instancia de Chart.js
 */
function createOrUpdateChart(canvasId, type, labels, datasets, isCurrency = false) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  // Si el gráfico existía previamente, destruye la instancia vieja para evitar solapamientos
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  // Crea la nueva instancia del lienzo de dibujo
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
 * Abre el modal con la tabla detallada de registros filtrados
 * @param {string} type - Tipo de vista ('req' o 'ser')
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

/**
 * Cierra el modal de consulta de registros
 */
function closeRecordsModal() {
  document.getElementById('records-modal').classList.add('hidden');
}

/**
 * Filtra la vista tabular interna del modal según la búsqueda ingresada
 */
function filterModalTable(query) {
  const q = query.toLowerCase().trim();
  const filtered = modalCurrentRecords.filter(r => {
    const ticket = (r.idTicket || r.numTicket || r.Ticket || '').toString().toLowerCase();
    const service = (r.sName || r.Servicio || r.nomServicio || r.Titulo || r.resumen || '').toString().toLowerCase();
    const date = (r.fechaInicio || r.fCreacion || r.fCobertura || '').toLowerCase();
    const reqBy = (r.areaSolicitante || r.Solicitante || r.solicitante || '').toString().toLowerCase();

    return ticket.includes(q) || service.includes(q) || date.includes(q) || reqBy.includes(q);
  });

  renderModalTable(filtered);
}

/**
 * Genera el cuerpo dinámico de la tabla HTML del modal
 */
function renderModalTable(records) {
  const tbody = document.getElementById('records-table-body');
  const badge = document.getElementById('records-count-badge');
  tbody.innerHTML = '';

  badge.textContent = `${records.length} Registros`;

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-500">No se encontraron registros que coincidan.</td></tr>`;
    return;
  }

  // Limita la vista a los primeros 100 elementos por rendimiento de renderizado
  records.slice(0, 100).forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/50 transition-colors';
    
    const ticket = r.idTicket || r.numTicket || r.Ticket || '-';
    const service = r.sName || r.Servicio || r.nomServicio || r.Titulo || r.resumen || '-';
    const date = r.fechaInicio || r.fCreacion || r.fCobertura || '-';
    const reqBy = r.areaSolicitante || r.Solicitante || r.solicitante || '-';

    tr.innerHTML = `
      <td class="py-2.5 px-3 font-mono text-indigo-400 font-semibold">${ticket}</td>
      <td class="py-2.5 px-3 truncate max-w-xs" title="${service}">${service}</td>
      <td class="py-2.5 px-3 text-slate-400">${date}</td>
      <td class="py-2.5 px-3 text-slate-400 truncate max-w-xs" title="${reqBy}">${reqBy}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Permite expandir horizontalmente una tarjeta contenedora de gráfico
 */
function toggleChartExpand(cardId) {
  const card = document.getElementById(cardId);
  card.classList.toggle('lg:col-span-2');
  // Emite un evento resize para reajustar las dimensiones del canvas
  window.dispatchEvent(new Event('resize'));
}
