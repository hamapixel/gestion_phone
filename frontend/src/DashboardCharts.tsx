import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const currency = (number: number) => new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
}).format(number) + ' FCFA';

type ChartTheme = { dark: boolean };
function ink(dark: boolean) { return dark ? '#b9c9e4' : '#65738b'; }
function grid(dark: boolean) { return dark ? 'rgba(167,188,224,.13)' : 'rgba(65,86,132,.10)'; }

export function PaymentDoughnut({ settled, outstanding, dark }: {
  settled: number; outstanding: number;
} & ChartTheme) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || settled + outstanding <= 0) return;
    const chart = new Chart(ref.current, {
      type: 'doughnut',
      data: {
        labels: ['Déjà réglé sur les ventes sélectionnées', 'Reste à recevoir sur ces ventes'],
        datasets: [{
          data: [settled, outstanding],
          backgroundColor: ['#4f8df7', '#f0b35b'],
          hoverBackgroundColor: ['#2c68e5', '#e09c3c'],
          borderWidth: 0,
          borderRadius: 8,
          spacing: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '76%',
        animation: { duration: 380 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (context) =>
            (context.label || '') + ' : ' + currency(Number(context.parsed)) } },
        },
      },
    });
    return () => chart.destroy();
  }, [settled, outstanding, dark]);

  return <canvas ref={ref} role="img" aria-label={
    'Diagramme en anneau : déjà réglé ' + currency(settled) + ', reste à recevoir ' + currency(outstanding)
  }/>;
}

export function SalesLineChart({ daily, dark }: {
  daily: { date: string; revenue: string; gross_profit: string }[];
} & ChartTheme) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || daily.length === 0) return;
    const chart = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: daily.map((day) => new Date(day.date + 'T12:00:00').toLocaleDateString('fr-FR', {
          day: '2-digit', month: 'short',
        })),
        datasets: [
          {
            label: 'Ventes',
            data: daily.map((day) => Number(day.revenue)),
            borderColor: '#5892f5',
            backgroundColor: dark ? 'rgba(88,146,245,.12)' : 'rgba(88,146,245,.10)',
            fill: true, tension: .36, pointRadius: 3, pointHoverRadius: 6,
          },
          {
            label: 'Marge brute',
            data: daily.map((day) => Number(day.gross_profit)),
            borderColor: '#20b797', backgroundColor: 'transparent',
            fill: false, tension: .36, pointRadius: 2, pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { position: 'bottom', labels: { color: ink(dark), usePointStyle: true, boxWidth: 9 } },
          tooltip: { callbacks: { label: (context) =>
            (context.dataset.label || '') + ' : ' + currency(Number(context.parsed.y ?? 0)) } },
        },
        scales: {
          x: { ticks: { color: ink(dark), maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
            grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: ink(dark),
            callback: (value) => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(Number(value)) },
            grid: { color: grid(dark) } },
        },
      },
    });
    return () => chart.destroy();
  }, [daily, dark]);
  return <canvas ref={ref} role="img" aria-label="Évolution réelle des ventes et de la marge brute par date"/>;
}

export function ProductsBarChart({ products, dark }: {
  products: { product_id: string; product_name: string; revenue: string }[];
} & ChartTheme) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || products.length === 0) return;
    const top = products.slice(0, 5);
    const chart = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels: top.map((item) => item.product_name.length > 22
          ? item.product_name.slice(0, 21) + '…' : item.product_name),
        datasets: [{
          label: 'Montants vendus',
          data: top.map((item) => Number(item.revenue)),
          backgroundColor: ['#508cf2','#24b99f','#9d82eb','#f0b35b','#549fbb'],
          borderRadius: 7, borderSkipped: false, maxBarThickness: 26,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (context) => currency(Number(context.parsed.x ?? 0)) } },
        },
        scales: {
          x: { beginAtZero: true,
            ticks: { color: ink(dark), callback: (value) =>
              new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(Number(value)) },
            grid: { color: grid(dark) } },
          y: { ticks: { color: ink(dark) }, grid: { display: false } },
        },
      },
    });
    return () => chart.destroy();
  }, [products, dark]);

  return <canvas ref={ref} role="img" aria-label="Classement des cinq marchandises les plus vendues par montant"/>;
}
