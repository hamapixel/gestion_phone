export type Period = 'today' | 'week' | 'month' | 'year' | 'custom';
export type PeriodRange = { period: Period; start: string; end: string };

export const localDay = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};
export function periodQuery(range: PeriodRange) {
  const params = new URLSearchParams({ period: range.period });
  if (range.period === 'custom') {
    params.set('start', range.start);
    params.set('end', range.end);
  }
  return params.toString();
}

export default function PeriodFilter({ value, onChange }: {
  value: PeriodRange; onChange: (next: PeriodRange) => void;
}) {
  const options: { key: Period; label: string }[] = [
    { key: 'today', label: 'Aujourd’hui' },
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
    { key: 'year', label: 'Année' },
    { key: 'custom', label: 'Période' },
  ];
  return (
    <div className="phase7-period">
      <div className="phase7-period-buttons" role="group" aria-label="Période">
        {options.map(({ key, label }) => (
          <button type="button" key={key} aria-pressed={value.period === key}
            className={value.period === key ? 'selected' : ''}
            onClick={() => onChange({ ...value, period: key })}>{label}</button>
        ))}
      </div>
      {value.period === 'custom' && (
        <div className="phase7-custom-dates">
          <label>Du
            <input aria-label="Du" type="date" max={value.end || undefined} value={value.start}
              onChange={(event) => onChange({ ...value, start: event.target.value })}/>
          </label>
          <label>Au
            <input aria-label="Au" type="date" min={value.start || undefined} value={value.end}
              onChange={(event) => onChange({ ...value, end: event.target.value })}/>
          </label>
        </div>
      )}
    </div>
  );
}
