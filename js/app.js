// ================================================
// CONFIGURACIÓN
// ================================================
const API_DOLARES = 'https://dolarapi.com/v1/dolares';

// Mapeo: casa de la API → orden de la tarjeta en el HTML
const CASAS = ['oficial', 'blue', 'bolsa', 'tarjeta'];

// Nombres legibles para el modal
const NOMBRES_CASAS = {
  oficial: 'Dólar Oficial',
  blue: 'Dólar Blue',
  bolsa: 'Dólar MEP',
  tarjeta: 'Dólar Tarjeta',
};


// ================================================
// SELECTORES DEL DOM
// ================================================
const tarjetas = document.querySelectorAll('.grid-cotizaciones article');
const inputPesos = document.getElementById('monto-pesos');
const divResultado = document.getElementById('resultado-conversion');
const valorReservas = document.getElementById('valor-reservas');
const valorIntervencion = document.getElementById('valor-intervencion');
const fechaReservas = document.getElementById('fecha-reservas');
const fechaIntervencion = document.getElementById('fecha-intervencion');
const btnToggleDesglose = document.getElementById('btn-toggle-desglose');

// Modal desglose
const modalDesglose = document.getElementById('modal-desglose');
const modalDesgloseOverlay = modalDesglose.querySelector('.modal-overlay');
const modalDesgloseCerrar = document.getElementById('modal-desglose-cerrar');
const desgloseItems = document.getElementById('desglose-items');
const desgloseFooter = document.getElementById('desglose-footer');

// Modal
const modal = document.getElementById('modal-grafico');
const modalOverlay = modal.querySelector('.modal-overlay');
const modalTitulo = document.getElementById('modal-titulo');
const modalCerrar = document.getElementById('modal-cerrar');
const btnsPeriodo = document.querySelectorAll('.btn-periodo');
const chkTendencia = document.getElementById('chk-tendencia');
const chkMaxMin = document.getElementById('chk-maxmin');

// Variable global: venta del Blue y datos de la API
let ventaBlue = null;
let datosAPI = [];
let chartActual = null;
let casaSeleccionada = null;

// Almacén para datos históricos macro (llenado por obtenerDatosMacro)
let historialMacro = {
  riesgo: [],
  inflacion: [],
};
let macroSeleccionado = null; // 'riesgo' o 'inflacion' cuando el modal muestra macro data

const NOMBRES_MACRO = {
  riesgo: 'Riesgo País',
  inflacion: 'Inflación Mensual',
};

// ================================================
// UTILIDADES
// ================================================

/**
 * Formatea un número al estilo argentino:
 * separador de miles con punto, decimales con coma.
 */
function formatearNumero(numero) {
  return numero.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatea una fecha ISO a formato legible argentino.
 * Ej: "2026-02-26T17:04:00.000Z" → "26 feb. 2026, 17:04"
 * Ej: "2026-02-24" → "24 feb. 2026"
 */
function formatearFecha(fechaISO) {
  if (!fechaISO) return '';

  const fecha = new Date(fechaISO);
  if (isNaN(fecha.getTime())) return fechaISO;

  const opciones = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  };

  // Si tiene hora (no es solo fecha), agregarla
  if (fechaISO.includes('T')) {
    opciones.hour = '2-digit';
    opciones.minute = '2-digit';
    opciones.hour12 = false;
  }

  return fecha.toLocaleDateString('es-AR', opciones);
}

// ================================================
// GENERADOR DE HISTORIAL MOCK
// ================================================

/**
 * Genera un array de precios ficticios hacia atrás en el tiempo.
 * Usa random walk con tendencia, basándose en el precio actual.
 *
 * @param {number} dias — Cantidad de días a generar
 * @param {number} precioActual — Precio de venta actual (punto final)
 * @returns {{ labels: string[], precios: number[] }}
 */
function generarHistorialMock(dias, precioActual) {
  const labels = [];
  const precios = [];
  const hoy = new Date();

  // Generar precios desde el pasado hacia hoy
  // Empezamos con un precio levemente diferente al actual
  let precio = precioActual * (1 - (Math.random() * 0.08 - 0.02)); // entre -2% y +6% atrás

  for (let i = dias; i >= 0; i--) {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - i);

    const dia = fecha.getDate().toString().padStart(2, '0');
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    labels.push(`${dia}/${mes}`);

    if (i === 0) {
      // El último punto es el precio real actual
      precios.push(precioActual);
    } else {
      precios.push(parseFloat(precio.toFixed(2)));
      // Variación aleatoria: entre -1.5% y +1.8% diario
      const variacion = (Math.random() * 0.033 - 0.015);
      precio *= (1 + variacion);
    }
  }

  return { labels, precios };
}

// ================================================
// OBTENER COTIZACIONES DESDE LA API
// ================================================

async function obtenerCotizaciones() {
  try {
    const response = await fetch(API_DOLARES);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    datosAPI = await response.json();

    tarjetas.forEach((tarjeta, index) => {
      const casaBuscada = CASAS[index];
      if (!casaBuscada) return;

      const cotizacion = datosAPI.find((d) => d.casa === casaBuscada);
      if (!cotizacion) return;

      // Actualizar compra y venta
      const valores = tarjeta.querySelectorAll('dd');
      if (valores[0]) valores[0].textContent = `$${formatearNumero(cotizacion.compra)}`;
      if (valores[1]) valores[1].textContent = `$${formatearNumero(cotizacion.venta)}`;

      // Calcular variación diaria simulada
      calcularVariacion(tarjeta, cotizacion.venta);

      // Mostrar fecha de actualización
      const spanFecha = tarjeta.querySelector('.actualizacion');
      if (spanFecha && cotizacion.fechaActualizacion) {
        spanFecha.textContent = `Actualizado: ${formatearFecha(cotizacion.fechaActualizacion)}`;
      }
    });

    // Guardar venta del Blue para la calculadora
    const blue = datosAPI.find((d) => d.casa === 'blue');
    if (blue) ventaBlue = blue.venta;

  } catch (error) {
    console.error('Error al obtener cotizaciones del dólar:', error);
  }
}

// ================================================
// VARIACIÓN DIARIA SIMULADA
// ================================================

/**
 * Simula una variación diaria comparando el precio de venta actual
 * con un precio "anterior" generado del historial mock.
 */
function calcularVariacion(tarjeta, precioActual) {
  const pVariacion = tarjeta.querySelector('.variacion');
  if (!pVariacion) return;

  // Generar un precio del "día anterior" para calcular variación
  const historial = generarHistorialMock(1, precioActual);
  const precioAyer = historial.precios[0];
  const variacion = ((precioActual - precioAyer) / precioAyer) * 100;

  // Limpiar clases
  pVariacion.classList.remove('positiva', 'negativa');

  if (variacion >= 0) {
    pVariacion.textContent = `▲ +${formatearNumero(variacion)}%`;
    pVariacion.classList.add('positiva');
  } else {
    pVariacion.textContent = `▼ ${formatearNumero(variacion)}%`;
    pVariacion.classList.add('negativa');
  }
}

// ================================================
// MODAL — ABRIR / CERRAR
// ================================================

function abrirModal(casa) {
  casaSeleccionada = casa;
  macroSeleccionado = null; // Asegurar que no estamos en modo macro
  modalTitulo.textContent = `Historial — ${NOMBRES_CASAS[casa] || casa}`;

  // Restaurar botones de período originales
  actualizarBotonesPeriodo(PERIODOS_ORIGINALES);

  // Resetear período a 7 días
  btnsPeriodo.forEach((btn) => btn.classList.remove('activo'));
  btnsPeriodo[0].classList.add('activo');

  // Resetear checkboxes
  chkTendencia.checked = false;
  chkMaxMin.checked = false;

  modal.classList.add('activo');
  modal.setAttribute('aria-hidden', 'false');

  renderizarGrafico(7);
}

function cerrarModal() {
  modal.classList.remove('activo');
  modal.setAttribute('aria-hidden', 'true');

  if (chartActual) {
    chartActual.destroy();
    chartActual = null;
  }
}

// ================================================
// CHART.JS — RENDERIZAR GRÁFICO
// ================================================

function renderizarGrafico(dias) {
  // Obtener precio actual de la casa seleccionada
  const cotizacion = datosAPI.find((d) => d.casa === casaSeleccionada);
  if (!cotizacion) return;

  const precioActual = cotizacion.venta;
  const { labels, precios } = generarHistorialMock(dias, precioActual);

  // Destruir chart anterior si existe
  if (chartActual) {
    chartActual.destroy();
    chartActual = null;
  }

  const ctx = document.getElementById('historialChart').getContext('2d');

  // Datasets base
  const datasets = [
    {
      label: `${NOMBRES_CASAS[casaSeleccionada]} — Venta`,
      data: precios,
      borderColor: '#34d399',
      backgroundColor: 'rgba(52, 211, 153, 0.1)',
      borderWidth: 2,
      pointRadius: dias <= 30 ? 3 : 0,
      pointHoverRadius: 5,
      fill: true,
      tension: 0.3,
    },
  ];

  // Dataset de Tendencia (línea recta desde primer al último punto)
  if (chkTendencia.checked) {
    const inicio = precios[0];
    const fin = precios[precios.length - 1];
    const tendencia = precios.map((_, i) => {
      return parseFloat((inicio + (fin - inicio) * (i / (precios.length - 1))).toFixed(2));
    });

    datasets.push({
      label: 'Tendencia',
      data: tendencia,
      borderColor: '#60a5fa',
      borderWidth: 2,
      borderDash: [8, 4],
      pointRadius: 0,
      fill: false,
      tension: 0,
    });
  }

  // Anotaciones Máx/Mín
  const maxVal = Math.max(...precios);
  const minVal = Math.min(...precios);

  if (chkMaxMin.checked) {
    const datosMax = precios.map((p) => (p === maxVal ? p : null));
    const datosMin = precios.map((p) => (p === minVal ? p : null));

    datasets.push({
      label: `Máx: $${formatearNumero(maxVal)}`,
      data: datosMax,
      borderColor: '#f87171',
      backgroundColor: '#f87171',
      pointRadius: 8,
      pointStyle: 'triangle',
      showLine: false,
    });

    datasets.push({
      label: `Mín: $${formatearNumero(minVal)}`,
      data: datosMin,
      borderColor: '#fbbf24',
      backgroundColor: '#fbbf24',
      pointRadius: 8,
      pointStyle: 'triangle',
      pointRotation: 180,
      showLine: false,
    });
  }

  chartActual = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: '#9ca3b4',
            font: { size: 12 },
          },
        },
        tooltip: {
          backgroundColor: '#1a1d27',
          titleColor: '#e8eaf0',
          bodyColor: '#e8eaf0',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            label: function (context) {
              return `${context.dataset.label}: $${formatearNumero(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#6b7280', maxRotation: 45 },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          ticks: {
            color: '#6b7280',
            callback: (v) => `$${v.toLocaleString('es-AR')}`,
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
      },
    },
  });
}

// ================================================
// CALCULADORA DE CONVERSIÓN (ARS → USD Blue)
// ================================================

function calcularConversion() {
  const montoPesos = parseFloat(inputPesos.value);

  if (ventaBlue === null) {
    divResultado.innerHTML = '<p>Cargando cotización del Dólar Blue…</p>';
    return;
  }

  if (!montoPesos || montoPesos <= 0 || isNaN(montoPesos)) {
    divResultado.innerHTML = '<p>Ingresá un monto válido para ver la conversión.</p>';
    return;
  }

  const resultadoUSD = montoPesos / ventaBlue;

  divResultado.innerHTML = `
    <p>
      <strong>$${formatearNumero(montoPesos)}</strong> ARS equivalen a
      <strong>US$ ${formatearNumero(resultadoUSD)}</strong>
      <br>
      <small>Cotización Dólar Blue Venta: $${formatearNumero(ventaBlue)}</small>
    </p>
  `;
}

// ================================================
// OBTENER DATOS DEL BCRA (desde archivo local)
// ================================================

/**
 * Lee bcra_data.json generado por fetch_bcra.py
 * y renderiza Reservas e Intervención en el DOM.
 */
async function obtenerDatosBCRA() {
  try {
    const response = await fetch('bcra_data.json');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const datos = await response.json();

    // --- Reservas Internacionales ---
    if (valorReservas) {
      const reservas = datos.reservas.valor;
      const reservasFormateadas = reservas.toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      valorReservas.textContent = `U$D ${reservasFormateadas} Millones`;
    }

    // Fecha de reservas
    if (fechaReservas && datos.reservas.fecha) {
      fechaReservas.textContent = `Dato del ${formatearFecha(datos.reservas.fecha)}`;
    }

    // --- Intervención Diaria (MULC) ---
    if (valorIntervencion) {
      const monto = datos.intervencion.valor;
      const montoFormateado = Math.abs(monto).toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });

      // Limpiar clases previas
      valorIntervencion.classList.remove('positivo', 'negativo');

      if (monto > 0) {
        valorIntervencion.textContent = `+ U$D ${montoFormateado} Millones`;
        valorIntervencion.classList.add('positivo');
      } else if (monto < 0) {
        valorIntervencion.textContent = `− U$D ${montoFormateado} Millones`;
        valorIntervencion.classList.add('negativo');
      } else {
        valorIntervencion.textContent = `U$D 0 Millones`;
      }
    }

    // Fecha de intervención
    if (fechaIntervencion && datos.intervencion.fecha) {
      fechaIntervencion.textContent = `MULC — Dato del ${formatearFecha(datos.intervencion.fecha)}`;
    }

    // --- Desglose de variación de reservas ---
    renderizarDesglose(datos.desglose_variacion || []);

  } catch (error) {
    console.error('Error al obtener datos del BCRA:', error);

    if (valorReservas) {
      valorReservas.textContent = 'Datos no disponibles';
    }
    if (valorIntervencion) {
      valorIntervencion.textContent = 'Datos no disponibles';
      valorIntervencion.classList.remove('positivo', 'negativo');
    }
  }
}

// ================================================
// RENDERIZAR DESGLOSE DE RESERVAS (en modal)
// ================================================

// Almacén temporal del desglose y su fecha
let datosDesglose = [];
let fechasDesglose = '';

/**
 * Prepara los datos del desglose para mostrar en el modal.
 * Se llama desde obtenerDatosBCRA.
 */
function renderizarDesglose(desglose) {
  datosDesglose = desglose;
  // Usar la fecha del primer item como referencia
  if (desglose.length > 0 && desglose[0].fecha) {
    fechasDesglose = desglose[0].fecha;
  }
}

/**
 * Abre el modal de desglose y genera las filas dinámicamente.
 */
function abrirModalDesglose() {
  if (!desgloseItems || datosDesglose.length === 0) return;

  desgloseItems.innerHTML = '';

  datosDesglose.forEach((item) => {
    const valor = item.valor;
    const signo = valor >= 0 ? '+' : '−';
    const valorFormateado = Math.abs(valor).toLocaleString('es-AR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const claseColor = valor >= 0 ? 'positivo' : 'negativo';

    const fila = document.createElement('div');
    fila.className = 'desglose-item';
    fila.innerHTML = `
      <span class="desglose-nombre">${item.nombre}</span>
      <span class="desglose-valor ${claseColor}">${signo} U$D ${valorFormateado} M</span>
    `;
    desgloseItems.appendChild(fila);
  });

  // Footer con fecha de actualización
  if (desgloseFooter) {
    desgloseFooter.textContent = fechasDesglose
      ? `Última actualización: ${formatearFecha(fechasDesglose)}`
      : '';
  }

  modalDesglose.classList.add('activo');
  modalDesglose.setAttribute('aria-hidden', 'false');
}

function cerrarModalDesglose() {
  modalDesglose.classList.remove('activo');
  modalDesglose.setAttribute('aria-hidden', 'true');
}

// Event listeners del modal desglose
if (btnToggleDesglose) {
  btnToggleDesglose.addEventListener('click', abrirModalDesglose);
}
modalDesgloseCerrar.addEventListener('click', cerrarModalDesglose);
modalDesgloseOverlay.addEventListener('click', cerrarModalDesglose);

// ================================================
// EVENT LISTENERS
// ================================================

// Calculadora
inputPesos.addEventListener('input', calcularConversion);

// Click en tarjetas → abrir modal
tarjetas.forEach((tarjeta) => {
  tarjeta.addEventListener('click', () => {
    const casa = tarjeta.getAttribute('data-casa');
    if (casa) abrirModal(casa);
  });
});

// Cerrar modal
modalCerrar.addEventListener('click', cerrarModal);
modalOverlay.addEventListener('click', cerrarModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    cerrarModal();
    cerrarModalDesglose();
  }
});

// Cambio de período (routing dual: dólar o macro)
btnsPeriodo.forEach((btn) => {
  btn.addEventListener('click', () => {
    btnsPeriodo.forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');

    const dias = parseInt(btn.getAttribute('data-dias'), 10);
    if (macroSeleccionado) {
      renderizarGraficoMacro(dias);
    } else {
      renderizarGrafico(dias);
    }
  });
});

// Checkboxes → re-renderizar gráfico (routing dual)
function reRenderChart() {
  const diasActivos = parseInt(
    document.querySelector('.btn-periodo.activo').getAttribute('data-dias'), 10
  );
  if (macroSeleccionado) {
    renderizarGraficoMacro(diasActivos);
  } else {
    renderizarGrafico(diasActivos);
  }
}

chkTendencia.addEventListener('change', reRenderChart);
chkMaxMin.addEventListener('change', reRenderChart);

// ================================================
// OBTENER DATOS MACROECONÓMICOS
// ================================================

async function obtenerDatosMacro() {

  // --- Riesgo País ---
  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    historialMacro.riesgo = data; // guardar historial completo
    const ultimo = data[data.length - 1];

    const elValor = document.getElementById('valor-riesgo');
    const elFecha = document.getElementById('fecha-riesgo');

    if (elValor) {
      elValor.textContent = `${ultimo.valor.toLocaleString('es-AR')} puntos`;
    }
    if (elFecha && ultimo.fecha) {
      elFecha.textContent = `Actualizado: ${formatearFecha(ultimo.fecha)}`;
    }
  } catch (err) {
    console.error('Error Riesgo País:', err);
    const el = document.getElementById('valor-riesgo');
    if (el) el.textContent = 'No disponible';
  }

  // --- Inflación Mensual ---
  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    historialMacro.inflacion = data; // guardar historial completo
    const ultimo = data[data.length - 1];

    const elValor = document.getElementById('valor-inflacion');
    const elFecha = document.getElementById('fecha-inflacion');

    if (elValor) {
      elValor.textContent = `${ultimo.valor.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }
    if (elFecha && ultimo.fecha) {
      elFecha.textContent = `Dato de ${formatearFecha(ultimo.fecha)}`;
    }
  } catch (err) {
    console.error('Error Inflación:', err);
    const el = document.getElementById('valor-inflacion');
    if (el) el.textContent = 'No disponible';
  }

  // --- Valor UVA ---
  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/uva');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ultimo = data[data.length - 1];

    const elValor = document.getElementById('valor-uva');
    const elFecha = document.getElementById('fecha-uva');

    if (elValor) {
      elValor.textContent = `$ ${ultimo.valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (elFecha && ultimo.fecha) {
      elFecha.textContent = `Actualizado: ${formatearFecha(ultimo.fecha)}`;
    }
  } catch (err) {
    console.error('Error UVA:', err);
    const el = document.getElementById('valor-uva');
    if (el) el.textContent = 'No disponible';
  }

  // --- Tasa Plazo Fijo (mejor TNA) ---
  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Filtrar los que tienen tnaClientes válido y encontrar la mejor tasa
    const tasasValidas = data.filter((b) => b.tnaClientes !== null && b.tnaClientes > 0);
    const mejor = tasasValidas.reduce((max, b) => (b.tnaClientes > max.tnaClientes ? b : max), tasasValidas[0]);

    const elValor = document.getElementById('valor-plazofijo');
    const elFecha = document.getElementById('fecha-plazofijo');

    if (elValor && mejor) {
      const tnaPorcentaje = (mejor.tnaClientes * 100).toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });
      elValor.textContent = `${tnaPorcentaje}% TNA`;
    }
    if (elFecha && mejor) {
      elFecha.textContent = `Mejor tasa: ${mejor.entidad}`;
    }
  } catch (err) {
    console.error('Error Plazo Fijo:', err);
    const el = document.getElementById('valor-plazofijo');
    if (el) el.textContent = 'No disponible';
  }
}

// ================================================
// GRÁFICOS MACRO — ABRIR MODAL CON DATOS REALES
// ================================================

const MACRO_CONFIG = {
  riesgo: {
    color: '#f59e0b',
    labelSufijo: 'puntos',
    formatY: (v) => v.toLocaleString('es-AR'),
    tooltipPrefix: '',
    tooltipSuffix: ' pts',
    periodos: [
      { label: '7 Días', valor: 7 },
      { label: '1 Mes', valor: 30 },
      { label: '6 Meses', valor: 180 },
    ],
  },
  inflacion: {
    color: '#ec4899',
    labelSufijo: '%',
    formatY: (v) => `${v}%`,
    tooltipPrefix: '',
    tooltipSuffix: '%',
    periodos: [
      { label: '3 Meses', valor: 3 },
      { label: '6 Meses', valor: 6 },
      { label: '1 Año', valor: 12 },
    ],
  },
};

// Configuración original de los botones de período (para restaurar al abrir dólar)
const PERIODOS_ORIGINALES = [
  { label: '7 Días', valor: 7 },
  { label: '1 Mes', valor: 30 },
  { label: '6 Meses', valor: 180 },
];

/**
 * Actualiza los botones de período según la config.
 */
function actualizarBotonesPeriodo(periodos) {
  btnsPeriodo.forEach((btn, i) => {
    if (periodos[i]) {
      btn.textContent = periodos[i].label;
      btn.setAttribute('data-dias', periodos[i].valor);
    }
  });
}

/**
 * Abre el modal de gráfico para un indicador macro.
 */
function abrirModalMacro(tipo) {
  macroSeleccionado = tipo;
  casaSeleccionada = null;
  modalTitulo.textContent = `Historial — ${NOMBRES_MACRO[tipo]}`;

  // Cambiar botones de período según el tipo macro
  actualizarBotonesPeriodo(MACRO_CONFIG[tipo].periodos);

  // Resetear período al primer botón
  btnsPeriodo.forEach((btn) => btn.classList.remove('activo'));
  btnsPeriodo[0].classList.add('activo');

  chkTendencia.checked = false;
  chkMaxMin.checked = false;

  modal.classList.add('activo');
  modal.setAttribute('aria-hidden', 'false');

  const dias = parseInt(btnsPeriodo[0].getAttribute('data-dias'), 10);
  renderizarGraficoMacro(dias);
}

/**
 * Renderiza un gráfico de líneas con datos reales del historial macro.
 */
function renderizarGraficoMacro(cantDias) {
  const datos = historialMacro[macroSeleccionado];
  if (!datos || datos.length === 0) return;

  // Tomar los últimos N datos
  const recorte = datos.slice(-cantDias);

  const labels = recorte.map((d) => {
    const f = new Date(d.fecha);
    return f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  });
  const valores = recorte.map((d) => d.valor);

  if (chartActual) {
    chartActual.destroy();
    chartActual = null;
  }

  const config = MACRO_CONFIG[macroSeleccionado];
  const ctx = document.getElementById('historialChart').getContext('2d');

  const datasets = [
    {
      label: `${NOMBRES_MACRO[macroSeleccionado]} — ${config.labelSufijo}`,
      data: valores,
      borderColor: config.color,
      backgroundColor: `${config.color}1A`,
      borderWidth: 2,
      pointRadius: cantDias <= 30 ? 3 : 0,
      pointHoverRadius: 5,
      fill: true,
      tension: 0.3,
    },
  ];

  // Tendencia
  if (chkTendencia.checked && valores.length > 1) {
    const inicio = valores[0];
    const fin = valores[valores.length - 1];
    const tendencia = valores.map((_, i) =>
      parseFloat((inicio + (fin - inicio) * (i / (valores.length - 1))).toFixed(2))
    );
    datasets.push({
      label: 'Tendencia',
      data: tendencia,
      borderColor: '#60a5fa',
      borderWidth: 2,
      borderDash: [8, 4],
      pointRadius: 0,
      fill: false,
      tension: 0,
    });
  }

  // Máx / Mín
  const maxVal = Math.max(...valores);
  const minVal = Math.min(...valores);

  if (chkMaxMin.checked) {
    datasets.push({
      label: `Máx: ${config.formatY(maxVal)}`,
      data: valores.map((v) => (v === maxVal ? v : null)),
      borderColor: '#f87171',
      backgroundColor: '#f87171',
      pointRadius: 8,
      pointStyle: 'triangle',
      showLine: false,
    });
    datasets.push({
      label: `Mín: ${config.formatY(minVal)}`,
      data: valores.map((v) => (v === minVal ? v : null)),
      borderColor: '#fbbf24',
      backgroundColor: '#fbbf24',
      pointRadius: 8,
      pointStyle: 'triangle',
      pointRotation: 180,
      showLine: false,
    });
  }

  chartActual = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#9ca3b4', font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: '#1a1d27',
          titleColor: '#e8eaf0',
          bodyColor: '#e8eaf0',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            label: (context) =>
              `${context.dataset.label}: ${config.tooltipPrefix}${context.parsed.y.toLocaleString('es-AR')}${config.tooltipSuffix}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#6b7280', maxRotation: 45 },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          ticks: {
            color: '#6b7280',
            callback: (v) => config.formatY(v),
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
      },
    },
  });
}

// Click en tarjetas macro
document.querySelectorAll('.card-clickable[data-macro]').forEach((card) => {
  card.addEventListener('click', () => {
    const tipo = card.getAttribute('data-macro');
    if (tipo && historialMacro[tipo] && historialMacro[tipo].length > 0) {
      abrirModalMacro(tipo);
    }
  });
});

// ================================================
// OBTENER DATOS DEL MERCADO FINANCIERO
// ================================================
// ================================================
// OBTENER DATOS DEL MERCADO FINANCIERO (TICKER)
// ================================================

async function obtenerDatosMercado() {
  const tickerWrap = document.querySelector('.ticker-wrap');
  const tickerMove = document.getElementById('market-ticker');
  const btnPrev = document.querySelector('.ticker-btn.prev');
  const btnNext = document.querySelector('.ticker-btn.next');

  if (!tickerMove) return;

  try {
    const res = await fetch('mercado_data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const datos = await res.json();

    // Aplanar los datos separados por categorías
    const activosPlanos = [];
    if (datos.activos) {
      Object.keys(datos.activos).forEach(categoria => {
        const activos = datos.activos[categoria];
        for (const [ticker, data] of Object.entries(activos)) {
          activosPlanos.push({ ticker, ...data });
        }
      });
    }

    if (activosPlanos.length === 0) throw new Error('No hay activos');

    // Limpiar ticker
    tickerMove.innerHTML = '';

    // Generar HTML para cada activo
    const generarHTMLActivo = (activo) => {
      const v = activo.variacion_pct;
      const claseColor = v >= 0 ? 'up' : 'down';
      const signo = v >= 0 ? '▲ +' : '▼ ';
      const precioFmt = activo.precio.toLocaleString('es-AR', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });

      return `
        <div class="ticker-item">
          <span class="ticker-symbol">${activo.ticker}</span>
          <span class="ticker-price">U$D ${precioFmt}</span>
          <span class="ticker-change ${claseColor}">${signo}${Math.abs(v).toFixed(2)}%</span>
        </div>
      `;
    };

    // 1. Inyectar originales
    let htmlContent = activosPlanos.map(generarHTMLActivo).join('');
    // Loop para asegurar suficiente ancho inicial (al menos 3 iteraciones)
    tickerMove.innerHTML = htmlContent + htmlContent + htmlContent;

    // 2. Navegación manual
    if (btnPrev && btnNext) {
      const scrollStep = 200; // píxeles a mover por click

      btnPrev.addEventListener('click', () => {
        tickerWrap.scrollBy({ left: -scrollStep, behavior: 'smooth' });
      });

      btnNext.addEventListener('click', () => {
        tickerWrap.scrollBy({ left: scrollStep, behavior: 'smooth' });
      });
    }

  } catch (err) {
    console.error('Error datos mercado:', err);
    tickerMove.innerHTML = '<div class="ticker-item"><span class="ticker-symbol">MERCADO</span><span class="ticker-price">Cerrado o sin datos</span></div>';
  }
}

// ================================================
// INICIALIZACIÓN
// ================================================
obtenerCotizaciones();
obtenerDatosBCRA();
obtenerDatosMacro();
obtenerDatosMercado();
