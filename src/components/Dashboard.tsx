import { useMemo, useState } from 'react';
import { Order, Language, UserRole } from '../types';
import { translations } from '../locales';
import { DatabaseService } from '../dbMock';
import { generateExecutiveReportPDF } from '../utils/pdfGenerator';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import { 
  ShoppingCart, CheckCircle, Clock, Timer, XCircle, TrendingUp, DollarSign, Award, ThumbsUp, 
  FileText, ArrowDownToLine, BarChart3, List, Calendar, MapPin, Users, ShoppingBag, Crown, Sparkles, Star
} from 'lucide-react';

interface Props {
  lang: Language;
  role: UserRole;
  orders: Order[];
  onCardClick?: (status: string) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 dark:bg-slate-950/95 text-white p-3 border border-slate-700/50 rounded-xl shadow-xl backdrop-blur-md text-[11px] space-y-1 font-sans relative z-50 text-start min-w-[140px]">
        <p className="font-extrabold text-slate-300 border-b border-slate-800 pb-1 mb-1 tracking-wide">{label}</p>
        {payload.map((p: any, idx: number) => {
          const isCurrency = p.name.includes('الربح') || p.name.includes('مبيعات') || p.name.includes('Sales') || p.name.includes('Profits') || p.name.includes('revenue') || p.name.includes('Revenu') || p.name.includes('profit') || p.name.includes('Profit') || p.name.includes('الأرباح') || p.name.includes('المبيعات');
          return (
            <div key={idx} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: p.color || p.stroke }}></span>
                <span>{p.name}:</span>
              </span>
              <span className="font-extrabold text-slate-100 whitespace-nowrap">
                {p.value.toLocaleString()} {isCurrency ? 'MAD' : ''}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

export default function Dashboard({ lang, role, orders, onCardClick }: Props) {
  const t = translations[lang];

  // View state for mobile-friendly toggles
  const [viewOverTime, setViewOverTime] = useState<'chart' | 'list'>('chart');
  const [viewProduct, setViewProduct] = useState<'chart' | 'list'>('chart');
  const [viewSeller, setViewSeller] = useState<'chart' | 'list'>('chart');
  const [viewSupervisor, setViewSupervisor] = useState<'chart' | 'list'>('chart');
  const [viewCity, setViewCity] = useState<'chart' | 'list'>('chart');
  const [viewStatusChart, setViewStatusChart] = useState<'bar' | 'donut' | 'list'>('bar');

  // Dynamic date state filtering
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'this_month' | 'last_30_days'>('all');

  const filteredOrders = useMemo(() => {
    if (dateFilter === 'all') return orders;
    const today = new Date();
    // Use GMT/Local matching for dates
    const todayStr = today.toISOString().substring(0, 10);
    
    return orders.filter(o => {
      if (!o.orderDate) return false;
      const oDateStr = o.orderDate.substring(0, 10);
      
      if (dateFilter === 'today') {
        return oDateStr === todayStr;
      }
      if (dateFilter === 'this_month') {
        return oDateStr.substring(0, 7) === todayStr.substring(0, 7);
      }
      if (dateFilter === 'last_30_days') {
        const orderTime = new Date(o.orderDate).getTime();
        const thirtyDaysAgo = today.getTime() - (30 * 24 * 60 * 60 * 1000);
        return orderTime >= thirtyDaysAgo;
      }
      return true;
    });
  }, [orders, dateFilter]);

  // Calculate high-fidelity metrics
  const stats = useMemo(() => {
    const total = filteredOrders.length;
    const pending = filteredOrders.filter(o => o.orderStatus === 'PENDING').length;
    const delivered = filteredOrders.filter(o => o.orderStatus === 'DELIVERED');
    const delayed = filteredOrders.filter(o => o.orderStatus === 'DELAYED').length;
    const rejected = filteredOrders.filter(o => o.orderStatus === 'REJECTED').length;
    const deliveredCount = delivered.length;

    const totalSales = filteredOrders.reduce((acc, curr) => acc + curr.totalAmount, 0);
    const totalProfits = filteredOrders.reduce((acc, curr) => acc + curr.profit, 0);

    return {
      total,
      pending,
      delivered: deliveredCount,
      delayed,
      rejected,
      totalSales,
      totalProfits
    };
  }, [filteredOrders]);

  // Chart 1: Profits by Seller
  const profitBySellerData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => {
      map[o.sellerName] = (map[o.sellerName] || 0) + o.profit;
    });
    return Object.entries(map).map(([name, profit]) => ({ name, profit }));
  }, [filteredOrders]);

  // Chart 1.5: Profits by Supervisor
  const profitBySupervisorData = useMemo(() => {
    const map: Record<string, number> = {};
    const sellers = DatabaseService.getSellers();
    
    const getSupervisorName = (o: Order): string => {
      if (o.assignedSupervisorId) {
        if (o.assignedSupervisorId === 'admin_1') {
          return lang === 'ar' ? 'عبد الله (المدير العام)' : 'Abdellah (Directeur)';
        }
        const s = sellers.find(sel => sel.id === o.assignedSupervisorId);
        if (s) return s.name;
      }
      
      const sellerObj = sellers.find(sel => sel.name === o.sellerName);
      if (!sellerObj) {
        return lang === 'ar' ? 'عبد الله (المدير العام)' : 'Abdellah (Directeur)';
      }
      
      if (sellerObj.role === 'SUPERVISOR' || sellerObj.role === 'ADMIN' || sellerObj.role === 'DEPUTY') {
        return sellerObj.name;
      }
      
      const parentId = sellerObj.parentId || (sellerObj.parentIds && sellerObj.parentIds[0]);
      if (parentId) {
        if (parentId === 'admin_1') {
          return lang === 'ar' ? 'عبد الله (المدير العام)' : 'Abdellah (Directeur)';
        }
        const s = sellers.find(sel => sel.id === parentId);
        if (s) return s.name;
      }
      
      return lang === 'ar' ? 'عبد الله (المدير العام)' : 'Abdellah (Directeur)';
    };

    filteredOrders.forEach(o => {
      const name = getSupervisorName(o);
      map[name] = (map[name] || 0) + o.profit;
    });

    return Object.entries(map).map(([name, profit]) => ({ name, profit }));
  }, [filteredOrders, lang]);

  // Chart 2: Sales by Product
  const salesByProductData = useMemo(() => {
    const map: Record<string, { qty: number; amount: number }> = {};
    filteredOrders.forEach(o => {
      if (!map[o.product]) {
        map[o.product] = { qty: 0, amount: 0 };
      }
      map[o.product].qty += o.quantity;
      map[o.product].amount += o.totalAmount;
    });
    return Object.entries(map).map(([name, stats]) => ({
      name: name.length > 20 ? name.substring(0, 18) + '..' : name,
      quantity: stats.qty,
      revenue: stats.amount
    }));
  }, [filteredOrders]);

  // Chart 3: Sales by City
  const salesByCityData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const cityClean = o.city.split('(')[0].trim();
      map[cityClean] = (map[cityClean] || 0) + o.totalAmount;
    });
    return Object.entries(map).map(([city, revenue]) => ({ name: city, revenue }));
  }, [filteredOrders]);

  // Chart 4: Sales Progression over Time (Dates ordered)
  const salesOverTimeData = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number }> = {};
    filteredOrders.forEach(o => {
      map[o.orderDate] = map[o.orderDate] || { revenue: 0, profit: 0 };
      map[o.orderDate].revenue += o.totalAmount;
      map[o.orderDate].profit += o.profit;
    });
    return Object.entries(map)
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        profit: data.profit
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10); // Show last 10 dates for high visual density
  }, [filteredOrders]);

  // Chart 5: Status Distribution Ratios
  const statusRatiosData = useMemo(() => {
    const counts = { PENDING: 0, DELIVERED: 0, DELAYED: 0, REJECTED: 0 };
    filteredOrders.forEach(o => {
      if (o.orderStatus in counts) {
        counts[o.orderStatus as keyof typeof counts]++;
      }
    });
    return [
      { name: t.PENDING, value: counts.PENDING, color: '#3b82f6' },
      { name: t.DELIVERED, value: counts.DELIVERED, color: '#10b981' },
      { name: t.DELAYED, value: counts.DELAYED, color: '#f59e0b' },
      { name: t.REJECTED, value: counts.REJECTED, color: '#ef4444' }
    ];
  }, [filteredOrders, t]);

  // Best/Top Sellers list
  const topSellersList = useMemo(() => {
    const list: Record<string, { ordersCount: number; revenue: number; profit: number }> = {};
    filteredOrders.forEach(o => {
      if (!list[o.sellerName]) {
        list[o.sellerName] = { ordersCount: 0, revenue: 0, profit: 0 };
      }
      list[o.sellerName].ordersCount++;
      list[o.sellerName].revenue += o.totalAmount;
      list[o.sellerName].profit += o.profit;
    });

    return Object.entries(list)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5); // top 5
  }, [filteredOrders]);

  // Best/Top Products list
  const topProductsList = useMemo(() => {
    const list: Record<string, { qty: number; revenue: number }> = {};
    filteredOrders.forEach(o => {
      if (!list[o.product]) {
        list[o.product] = { qty: 0, revenue: 0 };
      }
      list[o.product].qty += o.quantity;
      list[o.product].revenue += o.totalAmount;
    });

    return Object.entries(list)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5); // top 5
  }, [filteredOrders]);

  const isBoss = role === 'ADMIN' || role === 'DEPUTY';

  const handleDownloadPDF = () => {
    const products = DatabaseService.getProducts();
    generateExecutiveReportPDF({
      orders: filteredOrders,
      products,
      lang,
      role
    });
  };

  return (
    <div id="dashboard-tab-content" className="space-y-8">
      
      {/* Executive Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-transparent md:bg-slate-50 dark:md:bg-slate-950/40 border-0 md:border border-slate-200/60 dark:border-slate-800/60 p-0 md:p-5 rounded-2xl">
        <div>
          <h2 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>📊</span>
            {lang === 'ar' ? 'التحليلات والمؤشرات الشاملة' : lang === 'en' ? 'Executive Dashboard Analytics' : 'Analyses et Indicateurs Généraux'}
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {lang === 'ar' 
              ? 'مراقبة فورية للمبيعات، الأرباح، ومؤشر الحركة المالية.' 
              : 'Suivi dynamique de la rentabilité, des ventes et de l’indicateur de croissance.'}
          </p>
        </div>

        {/* Dynamic segmented time filter controller */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-905 border border-slate-200/50 dark:border-slate-800/80 rounded-xl max-w-full overflow-x-auto self-start md:self-auto shrink-0">
          {(['all', 'today', 'this_month', 'last_30_days'] as const).map(f => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                dateFilter === f
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs border border-slate-200/50 dark:border-slate-700/60'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {f === 'all' 
                ? (lang === 'ar' ? 'الكل' : lang === 'en' ? 'All' : 'Tout')
                : f === 'today'
                ? (lang === 'ar' ? 'اليوم' : lang === 'en' ? 'Today' : "Aujourd'hui")
                : f === 'this_month'
                ? (lang === 'ar' ? 'هذا الشهر' : lang === 'en' ? 'This Month' : 'Ce mois')
                : (lang === 'ar' ? 'الـ 30 يوماً الأخيرة' : lang === 'en' ? 'Last 30 Days' : '30 Derniers Jours')
              }
            </button>
          ))}
        </div>
      </div>



      {/* 1. KEY STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-5">
        
        {/* Total Orders Card */}
        <button 
          onClick={() => onCardClick?.('')}
          id="stat-total-orders" 
          className="w-full text-start bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-blue-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 hover:scale-[1.03] active:scale-95 cursor-pointer focus:outline-hidden"
        >
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-blue-600/95 dark:text-blue-450 uppercase tracking-wider block">{t.totalOrders}</span>
            <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 block">{stats.total}</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
            <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </button>

        {/* Pending Card */}
        <button 
          onClick={() => onCardClick?.('PENDING')}
          id="stat-pending" 
          className="w-full text-start bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-indigo-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-500 hover:scale-[1.03] active:scale-95 cursor-pointer focus:outline-hidden"
        >
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-indigo-600/95 dark:text-indigo-450 uppercase tracking-wider block">{t.PENDING}</span>
            <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 block">{stats.pending}</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Timer className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </button>
 
        {/* Delivered Card */}
        <button 
          onClick={() => onCardClick?.('DELIVERED')}
          id="stat-delivered" 
          className="w-full text-start bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-emerald-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-500 hover:scale-[1.03] active:scale-95 cursor-pointer focus:outline-hidden"
        >
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-emerald-600/95 dark:text-emerald-450 uppercase tracking-wider block">{t.deliveredOrders}</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 block">{stats.delivered}</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-emerald-500/10 text-green-600 dark:text-green-400 rounded-xl">
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </button>
 
        {/* Delayed Card */}
        <button 
          onClick={() => onCardClick?.('DELAYED')}
          id="stat-delayed" 
          className="w-full text-start bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-amber-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-amber-400 dark:hover:border-amber-500 hover:scale-[1.03] active:scale-95 cursor-pointer focus:outline-hidden"
        >
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-amber-600/95 dark:text-amber-450 uppercase tracking-wider block">{t.delayedOrders}</span>
            <span className="text-xl sm:text-2xl font-black text-amber-500 block">{stats.delayed}</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-amber-500/10 text-amber-550 dark:text-amber-400 rounded-xl">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </button>
 
        {/* Rejected Card */}
        <button 
          onClick={() => onCardClick?.('REJECTED')}
          id="stat-rejected" 
          className="w-full text-start bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-rose-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-rose-400 dark:hover:border-rose-500 hover:scale-[1.03] active:scale-95 cursor-pointer focus:outline-hidden"
        >
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-rose-600/95 dark:text-rose-450 uppercase tracking-wider block">{t.rejectedOrders}</span>
            <span className="text-xl sm:text-2xl font-black text-red-500 block">{stats.rejected}</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-red-500/10 text-red-500 dark:text-red-400 rounded-xl">
            <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </button>
 
        {/* Total Sales Card */}
        <button 
          onClick={() => onCardClick?.('')}
          id="stat-revenue" 
          className="w-full text-start bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-violet-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-violet-400 dark:hover:border-violet-500 hover:scale-[1.03] active:scale-95 cursor-pointer focus:outline-hidden sm:col-span-2 xl:col-span-1"
        >
          <div className="space-y-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-violet-600/95 dark:text-violet-450 uppercase tracking-wider block truncate">{t.totalSales}</span>
            <span className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 block truncate">{stats.totalSales.toLocaleString()} MAD</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-violet-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </button>
 
        {/* Total Profits Card */}
        <button 
          onClick={() => onCardClick?.('DELIVERED')}
          id="stat-profits" 
          className="w-full text-start bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-teal-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-teal-400 dark:hover:border-teal-500 hover:scale-[1.03] active:scale-95 cursor-pointer focus:outline-hidden sm:col-span-2 xl:col-span-1"
        >
          <div className="space-y-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-teal-600/95 dark:text-teal-450 uppercase tracking-wider block truncate">{t.totalProfits}</span>
            <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 block truncate">
              {role === 'PUBLIC' ? '[MASKED]' : `${stats.totalProfits.toLocaleString()} MAD`}
            </span>
          </div>
          <div className="p-2 sm:p-2.5 bg-teal-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </button>
      </div>

      {/* 2. RECHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Sales Expansion Progression over time */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs transition-all hover:shadow-md duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <span>📈 {t.salesOverTime}</span>
            </h3>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewOverTime('chart')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  viewOverTime === 'chart'
                    ? 'bg-white dark:bg-slate-800 shadow-xs text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewOverTime('list')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  viewOverTime === 'list'
                    ? 'bg-white dark:bg-slate-800 shadow-xs text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-64 sm:min-h-72">
            {salesOverTimeData.length === 0 ? (
              <div className="h-64 sm:h-72 flex items-center justify-center text-slate-400 italic text-xs">{t.noData}</div>
            ) : viewOverTime === 'chart' ? (
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesOverTimeData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01}/>
                      </linearGradient>
                      <linearGradient id="colorProfitLine" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} dy={4} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10, pt: 10 }} verticalAlign="top" height={36} />
                    <Area type="monotone" dataKey="revenue" name={t.totalSales} stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" activeDot={{ r: 6 }} />
                    {role !== 'PUBLIC' && (
                      <Area type="monotone" dataKey="profit" name={t.totalProfits} stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorProfitLine)" activeDot={{ r: 5 }} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-64 sm:max-h-72 space-y-3.5 pr-1 text-slate-800 dark:text-slate-200">
                {[...salesOverTimeData].reverse().map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between border-b last:border-0 border-slate-50 dark:border-slate-800/50 pb-3 last:pb-0">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-blue-50 dark:bg-slate-950 text-blue-600 dark:text-blue-400 shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div className="text-start">
                        <p className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100">{item.date}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{lang === 'ar' ? 'مبيعات وتطور التاريخ' : 'Ventes du jour'}</p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="font-black text-xs sm:text-sm text-blue-650 dark:text-blue-400">{item.revenue.toLocaleString()} MAD</p>
                      {role !== 'PUBLIC' && (
                        <p className="text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-450">+{item.profit.toLocaleString()} MAD {lang === 'ar' ? 'ربح' : 'profit'}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sales by Product representation */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs transition-all hover:shadow-md duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <span>🛍️ {t.salesByProduct}</span>
            </h3>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewProduct('chart')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  viewProduct === 'chart'
                    ? 'bg-white dark:bg-slate-800 shadow-xs text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewProduct('list')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  viewProduct === 'list'
                    ? 'bg-white dark:bg-slate-800 shadow-xs text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-64 sm:min-h-72">
            {salesByProductData.length === 0 ? (
              <div className="h-64 sm:h-72 flex items-center justify-center text-slate-400 italic text-xs">{t.noData}</div>
            ) : viewProduct === 'chart' ? (
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByProductData} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
                    <defs>
                      <linearGradient id="colorProdRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.95}/>
                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0.35}/>
                      </linearGradient>
                      <linearGradient id="colorProdQty" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.95}/>
                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.35}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} angle={-15} textAnchor="end" height={45} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" height={36} />
                    <Bar dataKey="revenue" name={t.revenue} fill="url(#colorProdRevenue)" radius={[5, 5, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="quantity" name={t.quantity} fill="url(#colorProdQty)" radius={[5, 5, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-64 sm:max-h-72 space-y-4 pr-1 text-slate-800 dark:text-slate-200">
                {[...salesByProductData].sort((a, b) => b.revenue - a.revenue).map((item, idx) => {
                  const maxRevenue = Math.max(...salesByProductData.map(p => p.revenue), 1);
                  const percent = Math.min(Math.round((item.revenue / maxRevenue) * 100), 100);
                  return (
                    <div key={idx} className="space-y-1.5 text-start">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-extrabold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5 min-w-0">
                          <span className="flex items-center justify-center w-5 h-5 text-[10px] font-black rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-450 shrink-0">
                            {idx + 1}
                          </span>
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="font-black text-slate-900 dark:text-slate-100 shrink-0">
                          {item.revenue.toLocaleString()} MAD <span className="text-[10px] text-slate-400 font-bold">({item.quantity} {lang === 'ar' ? 'قطعة' : 'pcs'})</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-950 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full h-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Profits by Seller Bar block (Hidden / Masked for Public) */}
        {role !== 'PUBLIC' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs transition-all hover:shadow-md duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <span>💼 {t.profitsBySeller}</span>
              </h3>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setViewSeller('chart')}
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    viewSeller === 'chart'
                      ? 'bg-white dark:bg-slate-800 shadow-xs text-emerald-600 dark:text-emerald-450'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewSeller('list')}
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    viewSeller === 'list'
                      ? 'bg-white dark:bg-slate-800 shadow-xs text-emerald-600 dark:text-emerald-450'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="min-h-64 sm:min-h-72">
              {profitBySellerData.length === 0 ? (
                <div className="h-64 sm:h-72 flex items-center justify-center text-slate-400 italic text-xs">{t.noData}</div>
              ) : viewSeller === 'chart' ? (
                <div className="h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitBySellerData} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
                      <defs>
                        <linearGradient id="colorSellerProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.95}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.35}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} angle={-15} textAnchor="end" height={45} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="profit" name={t.profit} fill="url(#colorSellerProfit)" radius={[5, 5, 0, 0]} maxBarSize={35} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-64 sm:max-h-72 space-y-4 pr-1 text-slate-800 dark:text-slate-200">
                  {[...profitBySellerData].sort((a, b) => b.profit - a.profit).map((item, idx) => {
                    const maxProfit = Math.max(...profitBySellerData.map(s => s.profit), 1);
                    const percent = Math.min(Math.round((item.profit / maxProfit) * 100), 100);
                    const sellerInitials = item.name ? item.name.substring(0, 2) : 'S';
                    return (
                      <div key={idx} className="space-y-1.5 text-start">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-extrabold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2 min-w-0">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] text-white shrink-0 ${
                              idx === 0 ? 'bg-amber-500 shadow-sm' : 'bg-emerald-600 dark:bg-emerald-700'
                            }`}>
                              {idx === 0 ? <Crown className="w-3.5 h-3.5 text-white" /> : sellerInitials}
                            </div>
                            <span className="truncate">{item.name}</span>
                          </span>
                          <span className="font-black text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1">
                            <span>+{item.profit.toLocaleString()} MAD</span>
                            {idx === 0 && <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-300 shrink-0" />}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-950 h-2.5 rounded-full overflow-hidden">
                          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full h-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Profits by Supervisor Block (Visible to Admin, Deputy, Supervisor & Seller roles) */}
        {role !== 'PUBLIC' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs transition-all hover:shadow-md duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <span>🛡️ {lang === 'ar' ? 'الربح حسب المشرف' : 'Profits par Superviseur'}</span>
              </h3>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setViewSupervisor('chart')}
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    viewSupervisor === 'chart'
                      ? 'bg-white dark:bg-slate-800 shadow-xs text-blue-600 dark:text-blue-450'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewSupervisor('list')}
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    viewSupervisor === 'list'
                      ? 'bg-white dark:bg-slate-800 shadow-xs text-blue-600 dark:text-blue-450'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="min-h-64 sm:min-h-72">
              {profitBySupervisorData.length === 0 ? (
                <div className="h-64 sm:h-72 flex items-center justify-center text-slate-400 italic text-xs">{t.noData}</div>
              ) : viewSupervisor === 'chart' ? (
                <div className="h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitBySupervisorData} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
                      <defs>
                        <linearGradient id="colorSupervisorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.95}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.35}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} angle={-15} textAnchor="end" height={45} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="profit" name={t.profit} fill="url(#colorSupervisorProfit)" radius={[5, 5, 0, 0]} maxBarSize={35} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-64 sm:max-h-72 space-y-4 pr-1 text-slate-800 dark:text-slate-200">
                  {[...profitBySupervisorData].sort((a, b) => b.profit - a.profit).map((item, idx) => {
                    const maxProfit = Math.max(...profitBySupervisorData.map(s => s.profit), 1);
                    const percent = Math.min(Math.round((item.profit / maxProfit) * 100), 100);
                    const initials = item.name ? item.name.substring(0, 2) : 'M';
                    return (
                      <div key={idx} className="space-y-1.5 text-start">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-extrabold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2 min-w-0">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] text-white shrink-0 bg-blue-600 dark:bg-blue-700`}>
                              {initials}
                            </div>
                            <span className="truncate">{item.name}</span>
                          </span>
                          <span className="font-black text-blue-600 dark:text-blue-400 shrink-0">
                            +{item.profit.toLocaleString()} MAD
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-950 h-2.5 rounded-full overflow-hidden">
                          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full h-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sales by City Bar representation */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs transition-all hover:shadow-md duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <span>📍 {t.salesByCity}</span>
            </h3>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewCity('chart')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  viewCity === 'chart'
                    ? 'bg-white dark:bg-slate-800 shadow-xs text-teal-600 dark:text-teal-450'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewCity('list')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  viewCity === 'list'
                    ? 'bg-white dark:bg-slate-800 shadow-xs text-teal-600 dark:text-teal-450'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-64 sm:min-h-72">
            {salesByCityData.length === 0 ? (
              <div className="h-64 sm:h-72 flex items-center justify-center text-slate-400 italic text-xs">{t.noData}</div>
            ) : viewCity === 'chart' ? (
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByCityData} layout="vertical" margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorCitySales" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.95}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0.4}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.12} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} width={65} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name={t.revenue} fill="url(#colorCitySales)" radius={[0, 5, 5, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-64 sm:max-h-72 space-y-4 pr-1 text-slate-800 dark:text-slate-200">
                {[...salesByCityData].sort((a, b) => b.revenue - a.revenue).map((item, idx) => {
                  const maxRevenue = Math.max(...salesByCityData.map(c => c.revenue), 1);
                  const percent = Math.min(Math.round((item.revenue / maxRevenue) * 100), 100);
                  return (
                    <div key={idx} className="space-y-1.5 text-start">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-extrabold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5 min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="font-black text-slate-900 dark:text-slate-100 shrink-0">
                          {item.revenue.toLocaleString()} MAD
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-950 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-teal-400 to-emerald-500 rounded-full h-full transition-all duration-400" style={{ width: `${percent}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Order status proportion donut & bar chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <span>📊 {t.orderStatusRatios}</span>
            </h3>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewStatusChart('bar')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  viewStatusChart === 'bar'
                    ? 'bg-white dark:bg-slate-800 shadow-xs text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
                title="Bar Chart"
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewStatusChart('donut')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  viewStatusChart === 'donut'
                    ? 'bg-white dark:bg-slate-800 shadow-xs text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
                title="Donut Chart"
              >
                <span className="text-[10px] leading-none shrink-0">🍩</span>
              </button>
              <button
                type="button"
                onClick={() => setViewStatusChart('list')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  viewStatusChart === 'list'
                    ? 'bg-white dark:bg-slate-800 shadow-xs text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-64 sm:min-h-72 flex items-center justify-center">
            {filteredOrders.length === 0 ? (
              <div className="text-slate-400 italic text-xs">{t.noData}</div>
            ) : viewStatusChart === 'bar' ? (
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusRatiosData} margin={{ top: 15, right: 10, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="value" 
                      name={lang === 'ar' ? 'عدد الطلبيات' : lang === 'fr' ? 'Commandes' : 'Orders'} 
                      radius={[6, 6, 0, 0]} 
                      maxBarSize={35}
                    >
                      {statusRatiosData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : viewStatusChart === 'donut' ? (
              <div className="h-64 sm:h-72 flex flex-col sm:flex-row items-center justify-center gap-6 w-full">
                <div className="w-1/2 h-40 sm:h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusRatiosData.filter(item => item.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {statusRatiosData.filter(item => item.value > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 text-xs text-start">
                  {statusRatiosData.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: item.color }}></span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{item.name}:</span>
                      <span className="text-slate-500 font-extrabold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-64 sm:max-h-72 space-y-4 pr-1 text-slate-800 dark:text-slate-200 w-full">
                {statusRatiosData.map((item, idx) => {
                  const total = Math.max(filteredOrders.length, 1);
                  const percent = Math.min(Math.round((item.value / total) * 100), 100);
                  return (
                    <div key={idx} className="space-y-1.5 text-start">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: item.color }}></span>
                          <span>{item.name}</span>
                        </span>
                        <span className="font-black text-slate-950 dark:text-slate-100">
                          {item.value} <span className="text-[10px] text-slate-400 font-bold">({percent}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-950 h-2.5 rounded-full overflow-hidden">
                        <div className="rounded-full h-full transition-all duration-400" style={{ width: `${percent}%`, backgroundColor: item.color }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. TOP SELLERS & TOP PRODUCTS BENTO LISTS */}
      <div className="grid grid-cols-1 lga:grid-cols-2 gap-6">
        
        {/* Top Sellers list */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="text-amber-500 w-4.5 h-4.5" />
              {t.topSellers}
            </h3>
            <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-black uppercase">Top Sellers</span>
          </div>

          <div className="space-y-3.5">
            {topSellersList.map((seller, idx) => (
              <div key={seller.name} className="flex justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center ${
                    idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-slate-100 text-slate-800' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {idx + 1}
                  </span>
                  <div>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">{seller.name}</span>
                    <span className="text-[10px] text-slate-400 block">{seller.ordersCount} {lang === 'ar' ? 'مبيعات مسجلة' : 'ventes'}</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">{seller.revenue.toLocaleString()} MAD</span>
                  {role !== 'PUBLIC' && (
                    <span className="text-[10px] font-bold text-emerald-600 block">+{seller.profit.toLocaleString()} MAD</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products representation */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <ThumbsUp className="text-blue-500 w-4.5 h-4.5" />
              {t.topProducts}
            </h3>
            <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-black uppercase">Best Products</span>
          </div>

          <div className="space-y-3.5">
            {topProductsList.map((product, idx) => (
              <div key={product.name} className="flex justify-between items-center gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center shrink-0 ${
                    idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-slate-100 text-slate-800' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate" title={product.name}>
                      {product.name}
                    </span>
                    <span className="text-[10px] text-slate-400 block">{product.qty} {lang === 'ar' ? 'وحدة مباعة' : 'unités vendues'}</span>
                  </div>
                </div>
                
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">{product.revenue.toLocaleString()} MAD</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. EXECUTIVE REPORT EXPORT SECTION */}
      {isBoss && (
        <div id="pdf-report-export-container" className="pt-4 flex justify-center">
          <button
            id="download-dashboard-pdf-btn"
            onClick={handleDownloadPDF}
            className="w-full sm:w-auto cursor-pointer bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2.5 transition duration-200 shadow-sm hover:shadow-md hover:scale-[1.01]"
          >
            <ArrowDownToLine className="w-4 h-4 shrink-0" />
            <span>{lang === 'ar' ? 'تحميل التقرير التنفيذي الكلي (PDF) 📃' : 'Télécharger le PDF du Rapport Exécutif 📃'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
