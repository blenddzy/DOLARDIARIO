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
  modalTitulo.textContent = `Historial — ${NOMBRES_CASAS[casa] || casa}`;

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
  if (e.key === 'Escape') cerrarModal();
});

// Cambio de período
btnsPeriodo.forEach((btn) => {
  btn.addEventListener('click', () => {
    btnsPeriodo.forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');

    const dias = parseInt(btn.getAttribute('data-dias'), 10);
    renderizarGrafico(dias);
  });
});

// Checkboxes → re-renderizar gráfico
chkTendencia.addEventListener('change', () => {
  const diasActivos = parseInt(
    document.querySelector('.btn-periodo.activo').getAttribute('data-dias'), 10
  );
  renderizarGrafico(diasActivos);
});

chkMaxMin.addEventListener('change', () => {
  const diasActivos = parseInt(
    document.querySelector('.btn-periodo.activo').getAttribute('data-dias'), 10
  );
  renderizarGrafico(diasActivos);
});

// ================================================
// INICIALIZACIÓN
// ================================================
obtenerCotizaciones();
obtenerDatosBCRA();
