import type { ReactNode, TableHTMLAttributes } from "react";

/** EVE-overview table: hairline rows, 28px, tabular numbers right-aligned via `numeric` column keys.
 *  For custom markup just use <table className="ui-table"> and <td className="n"> for numbers. */
export interface Column<T> { key: string; label: ReactNode; numeric?: boolean; render?: (row: T) => ReactNode }
export function Table<T extends Record<string, any>>({ columns, rows, rowKey, rowClass, className, ...rest }: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T, i: number) => string; rowClass?: (row: T) => string | undefined;
} & TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={className ? `ui-table ${className}` : "ui-table"} {...rest}>
      <thead><tr>{columns.map((c) => <th key={c.key} className={c.numeric ? "n" : undefined}>{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={rowKey(r, i)} className={rowClass?.(r)}>
            {columns.map((c) => <td key={c.key} className={c.numeric ? "n" : undefined}>{c.render ? c.render(r) : r[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
