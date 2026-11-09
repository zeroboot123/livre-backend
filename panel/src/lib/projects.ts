export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  schema_name?: string | null;
  public_key?: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const PROJECT_STORAGE_KEY = 'livre_project_id';
export const PROJECT_NAME_STORAGE_KEY = 'livre_project_name';

function notifyProjectChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('livre:project-changed'));
}

export function getActiveProjectId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PROJECT_STORAGE_KEY);
}

export function setActiveProjectId(id: string | null) {
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem(PROJECT_STORAGE_KEY, id);
  else localStorage.removeItem(PROJECT_STORAGE_KEY);
  notifyProjectChange();
}

export function getActiveProjectName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PROJECT_NAME_STORAGE_KEY);
}

export function setActiveProjectName(name: string | null) {
  if (typeof window === 'undefined') return;
  if (name) localStorage.setItem(PROJECT_NAME_STORAGE_KEY, name);
  else localStorage.removeItem(PROJECT_NAME_STORAGE_KEY);
  notifyProjectChange();
}
