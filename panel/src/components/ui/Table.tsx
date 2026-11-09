'use client';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
}

interface TableProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
  loading?: boolean;
}

export function Table({ columns, data, onRowClick, emptyMessage = 'Nenhum registro encontrado', loading = false }: TableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="p-12 text-center text-sm text-[#94A3B8]">
          <div className="animate-spin w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full mx-auto mb-3" />
          Carregando...
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="p-12 text-center">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm text-[#64748B]">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={row.id || i}
                onClick={() => onRowClick?.(row)}
                className={`
                  border-b border-[#E2E8F0] last:border-0
                  ${onRowClick ? 'cursor-pointer hover:bg-[#F8FAFC]' : ''}
                  transition-colors
                `}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-sm text-[#0F172A]">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}