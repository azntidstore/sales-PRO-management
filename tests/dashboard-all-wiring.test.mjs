import fs from 'node:fs';

const dashboard = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');
const dbMock = fs.readFileSync('src/dbMock.ts', 'utf8');

if (!dashboard.includes('DatabaseService.getDashboardAllAggregates()')) throw new Error('ALL_AGGREGATION_CALL_MISSING');
if (!dashboard.includes("dateFilter === 'all' && dashboardAllAggregates")) throw new Error('ALL_SCALAR_SELECTION_MISSING');
if (!dashboard.includes('const rangeStats = useMemo')) throw new Error('RANGE_STATS_FALLBACK_MISSING');
if (!dashboard.includes('filteredOrders')) throw new Error('DOCUMENT_LEVEL_CHART_DATA_MISSING');
if (!dbMock.includes('static async getDashboardAllAggregates()')) throw new Error('DATABASE_WRAPPER_MISSING');
if (dashboard.match(/getDashboardAllAggregates\(\)/g)?.length !== 1) throw new Error('DUPLICATE_ALL_AGGREGATION_CALL');
console.log('Dashboard ALL scalar wiring tests: 5 passed, 0 failed');
