/** Har yangi loyihaga beriladigan standart statuslar (docs/07, 4-savol). */
export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELED';

export interface WorkflowStatusTemplate {
  name: string;
  category: StatusCategory;
  color: string;
}

export const DEFAULT_WORKFLOW: readonly WorkflowStatusTemplate[] = [
  { name: 'Backlog', category: 'TODO', color: '#94a3b8' },
  { name: 'To do', category: 'TODO', color: '#64748b' },
  { name: 'In progress', category: 'IN_PROGRESS', color: '#3b82f6' },
  { name: 'Review', category: 'REVIEW', color: '#f59e0b' },
  { name: 'Done', category: 'DONE', color: '#22c55e' },
];
