'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Users, X } from 'lucide-react';
import { DataShell, useData } from '@/components/data/data-shell';
import { Modal } from '@/components/ui/Modal';

interface Rule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

function rulesKey(table: string) {
  return `livre_privacy:${table}`;
}

function PrivacyInner() {
  const { tables, selected, setSelected } = useData();
  const [bannerOpen, setBannerOpen] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [field, setField] = useState('');
  const [operator, setOperator] = useState('is');
  const [value, setValue] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(rulesKey(selected));
      setRules(stored ? JSON.parse(stored) : []);
    } catch {
      setRules([]);
    }
  }, [selected]);

  const persist = (next: Rule[]) => {
    setRules(next);
    try {
      localStorage.setItem(rulesKey(selected), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="shrink-0 bg-white px-4 py-2">
        {bannerOpen && (
          <div className="mb-2 flex items-center gap-3 rounded border border-blue-200 bg-blue-50 px-3 py-2">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <p className="flex-1 text-[12px] text-blue-800">
              <span className="font-semibold">Ensure your data is private.</span> Enhance your security by
              scanning for potential issues.
            </p>
            <button className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700">
              Check my app
            </button>
            <button onClick={() => setBannerOpen(false)} className="text-blue-500 hover:text-blue-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <h1 className="text-[13px] font-semibold text-slate-800">Privacy</h1>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white py-2">
          {tables.map((t) => {
            let count = 0;
            try {
              const stored = localStorage.getItem(rulesKey(t.name));
              count = stored ? JSON.parse(stored).length : 0;
            } catch {
              count = 0;
            }
            const active = t.name === selected;
            return (
              <button
                key={t.name}
                onClick={() => setSelected(t.name)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-[12px] ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="truncate">{t.name}</span>
                <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                  {count > 0 ? `${count} rule(s)` : 'Publicly visible'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-[13px] font-semibold text-slate-800">
              {selected || 'Este tipo'} is publicly visible
            </p>
            <p className="mt-1 text-[12px] text-slate-500">
              This type is visible by everyone. Create a rule if you want to restrict access.
            </p>

            {rules.length > 0 && (
              <div className="mt-4 w-full space-y-1 rounded border border-slate-200 bg-white p-2 text-left">
                {rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>
                      {r.field} {r.operator} {r.value}
                    </span>
                    <button
                      onClick={() => persist(rules.filter((x) => x.id !== r.id))}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                setField('');
                setValue('');
                setAddOpen(true);
              }}
              className="mt-4 rounded border border-blue-400 bg-white px-3 py-1.5 text-[12px] font-medium text-blue-700 hover:bg-blue-50"
            >
              Add a rule
            </button>
          </div>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add privacy rule" size="sm">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Field</label>
            <input
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="ex: user_id"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-700">Operator</label>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="is">is</option>
                <option value="is not">is not</option>
                <option value="contains">contains</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-700">Value</label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Current User"
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setAddOpen(false)}
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (!field.trim()) return;
                persist([...rules, { id: String(Date.now()), field: field.trim(), operator, value: value.trim() }]);
                setAddOpen(false);
              }}
              disabled={!field.trim()}
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add rule
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <DataShell showSidebar={false}>
      <PrivacyInner />
    </DataShell>
  );
}
