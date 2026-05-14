export type CommandBinding = {
  id: string;
  method: string;
  path: string;
};

export const PHASE1_COMMAND_BINDINGS: CommandBinding[] = [
  { id: 'auth.signup', method: 'POST', path: '/v1/auth/signup' },
  { id: 'auth.password-login', method: 'POST', path: '/v1/auth/login' },
  { id: 'auth.mfa.status', method: 'GET', path: '/v1/auth/mfa/status' },
  { id: 'auth.mfa.setup', method: 'POST', path: '/v1/auth/mfa/setup' },
  { id: 'auth.mfa.enable', method: 'POST', path: '/v1/auth/mfa/enable' },
  { id: 'auth.mfa.disable', method: 'POST', path: '/v1/auth/mfa/disable' },
  { id: 'auth.mfa.verify', method: 'POST', path: '/v1/auth/mfa/verify' },
  {
    id: 'auth.mfa.backup-codes.regenerate',
    method: 'POST',
    path: '/v1/auth/mfa/backup-codes/regenerate',
  },
  { id: 'workflows.list', method: 'GET', path: '/v1/workflows' },
  { id: 'workflows.create', method: 'POST', path: '/v1/workflows' },
  { id: 'workflows.search', method: 'POST', path: '/v1/workflows/search' },
  { id: 'workflows.batch', method: 'POST', path: '/v1/workflows/batch' },
  {
    id: 'workflows.run.get',
    method: 'GET',
    path: '/v1/workflows/{workflow_id}/{run_id}',
  },
  {
    id: 'workflows.run.summary',
    method: 'GET',
    path: '/v1/workflows/{workflow_id}/{run_id}/summary',
  },
  {
    id: 'workflows.run.timeline',
    method: 'GET',
    path: '/v1/workflows/{workflow_id}/{run_id}/timeline',
  },
  { id: 'invocations.create', method: 'POST', path: '/v1/invocations' },
  { id: 'runs.list', method: 'GET', path: '/v1/runs' },
  { id: 'runs.create', method: 'POST', path: '/v1/runs' },
  { id: 'events.list', method: 'GET', path: '/v1/events' },
  { id: 'events.get', method: 'GET', path: '/v1/events/{id}' },
  { id: 'events.query', method: 'POST', path: '/v1/events/query' },
  { id: 'events.usage', method: 'POST', path: '/v1/events/usage' },
  { id: 'events.reprocess', method: 'POST', path: '/v1/events/reprocess' },
];
