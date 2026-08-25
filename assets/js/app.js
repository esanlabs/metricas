/**
 * ============================================================================
 * CONTROLADOR FRONTEND - CONSUMO DE API Y RENDERIZADO
 * ============================================================================
 */

// 1. Configuración de endpoint
const API_URL = 'https://script.google.com/macros/s/AKfycbz4vWZTmXN8Y-XUcKxZANNkfGEnfE-LRbVLpsR_6es7RdkL8qVVYpuodIZpGj_TkOR1yA/exec';

/**
 * Inicialización principal al cargar la página
 */
document.addEventListener('DOMContentLoaded', () => {
  fetchDashboardData();
});

/**
 * Realiza la petición HTTP GET a la API en Apps Script
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
      
      // Renderizar métricas y tablas con los datos devueltos
      renderMetrics(result.data);
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
 * Procesa y renderiza los datos en la interfaz
 * @param {Object} data - Objeto con las colecciones de datos devueltas por Apps Script
 */
function renderMetrics(data) {
  // 1. KPI Cards
  document.getElementById('kpi-servicios').textContent = data.datos ? data.datos.length : 0;
  document.getElementById('kpi-requerimientos').textContent = data.req ? data.req.length : 0;
  document.getElementById('kpi-terceros').textContent = data.terceros ? data.terceros.length : 0;

  // 2. Renderizar Tabla de Datos / Servicios
  const tbody = document.getElementById('table-datos-body');
  tbody.innerHTML = ''; // Limpiar loader

  if (data.datos && data.datos.length > 0) {
    data.datos.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-750 transition-colors';
      tr.innerHTML = `
        <td class="px-6 py-4 font-medium text-slate-100">${row.MacroServicio || '-'}</td>
        <td class="px-6 py-4">${row.nomServicio || '-'}</td>
        <td class="px-6 py-4 font-semibold text-emerald-400">${typeof row.costoServicio === 'number' ? '$' + row.costoServicio : row.costoServicio}</td>
        <td class="px-6 py-4">${row.CantPersonas || '-'}</td>
        <td class="px-6 py-4">${row.factorMedicion || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-slate-500">No hay registros disponibles.</td></tr>`;
  }
}