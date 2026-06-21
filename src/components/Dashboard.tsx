import { useMemo } from 'react';
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
  Legend
} from 'recharts';
import { 
  ShoppingCart, CheckCircle, Clock, XCircle, TrendingUp, DollarSign, Award, ThumbsUp, 
  FileText, ArrowDownToLine 
} from 'lucide-react';

interface Props {
  lang: Language;
  role: UserRole;
  orders: Order[];
}

export default function Dashboard({ lang, role, orders }: Props) {
  const t = translations[lang];

  // Calculate high-fidelity metrics
  const stats = useMemo(() => {
    const total = orders.length;
    const delivered = orders.filter(o => o.orderStatus === 'DELIVERED');
    const delayed = orders.filter(o => o.orderStatus === 'DELAYED').length;
    const rejected = orders.filter(o => o.orderStatus === 'REJECTED').length;
    const deliveredCount = delivered.length;

    const totalSales = orders.reduce((acc, curr) => acc + curr.totalAmount, 0);
    const totalProfits = orders.reduce((acc, curr) => acc + curr.profit, 0);

    return {
      total,
      delivered: deliveredCount,
      delayed,
      rejected,
      totalSales,
      totalProfits
    };
  }, [orders]);

  // Chart 1: Profits by Seller
  const profitBySellerData = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => {
      map[o.sellerName] = (map[o.sellerName] || 0) + o.profit;
    });
    return Object.entries(map).map(([name, profit]) => ({ name, profit }));
  }, [orders]);

  // Chart 2: Sales by Product
  const salesByProductData = useMemo(() => {
    const map: Record<string, { qty: number; amount: number }> = {};
    orders.forEach(o => {
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
  }, [orders]);

  // Chart 3: Sales by City
  const salesByCityData = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => {
      const cityClean = o.city.split('(')[0].trim();
      map[cityClean] = (map[cityClean] || 0) + o.totalAmount;
    });
    return Object.entries(map).map(([city, revenue]) => ({ name: city, revenue }));
  }, [orders]);

  // Chart 4: Sales Progression over Time (Dates ordered)
  const salesOverTimeData = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number }> = {};
    orders.forEach(o => {
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
  }, [orders]);

  // Chart 5: Status Distribution Ratios
  const statusRatiosData = useMemo(() => {
    const counts = { PENDING: 0, DELIVERED: 0, DELAYED: 0, REJECTED: 0 };
    orders.forEach(o => {
      if (o.orderStatus in counts) {
        counts[o.orderStatus as keyof typeof counts]++;
      }
    });
    return [
      { name: t.PENDING, value: counts.PENDING, color: '#3b82f6' },
      { name: t.DELIVERED, value: counts.DELIVERED, color: '#10b981' },
      { name: t.DELAYED, value: counts.DELAYED, color: '#f59e0b' },
      { name: t.REJECTED, value: counts.REJECTED, color: '#ef4444' }
    ].filter(item => item.value > 0);
  }, [orders, t]);

  // Best/Top Sellers list
  const topSellersList = useMemo(() => {
    const list: Record<string, { ordersCount: number; revenue: number; profit: number }> = {};
    orders.forEach(o => {
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
  }, [orders]);

  // Best/Top Products list
  const topProductsList = useMemo(() => {
    const list: Record<string, { qty: number; revenue: number }> = {};
    orders.forEach(o => {
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
  }, [orders]);

  const isBoss = role === 'ADMIN' || role === 'DEPUTY';

  const handleDownloadPDF = () => {
    const products = DatabaseService.getProducts();
    generateExecutiveReportPDF({
      orders,
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
      </div>

      {/* 1. KEY STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5">
        
        {/* Total Orders Card */}
        <div id="stat-total-orders" className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-blue-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-slate-350 dark:hover:border-slate-700">
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-blue-600/95 dark:text-blue-450 uppercase tracking-wider block">{t.totalOrders}</span>
            <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 block">{stats.total}</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
            <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
 
        {/* Delivered Card */}
        <div id="stat-delivered" className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-emerald-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-slate-350 dark:hover:border-slate-700">
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-emerald-600/95 dark:text-emerald-450 uppercase tracking-wider block">{t.deliveredOrders}</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 block">{stats.delivered}</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-emerald-500/10 text-green-600 dark:text-green-400 rounded-xl">
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
 
        {/* Delayed Card */}
        <div id="stat-delayed" className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-amber-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-slate-350 dark:hover:border-slate-700">
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-amber-600/95 dark:text-amber-450 uppercase tracking-wider block">{t.delayedOrders}</span>
            <span className="text-xl sm:text-2xl font-black text-amber-500 block">{stats.delayed}</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-amber-500/10 text-amber-550 dark:text-amber-400 rounded-xl">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
 
        {/* Rejected Card */}
        <div id="stat-rejected" className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-rose-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-slate-350 dark:hover:border-slate-700">
          <div className="space-y-1">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-rose-600/95 dark:text-rose-450 uppercase tracking-wider block">{t.rejectedOrders}</span>
            <span className="text-xl sm:text-2xl font-black text-red-500 block">{stats.rejected}</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-red-500/10 text-red-500 dark:text-red-400 rounded-xl">
            <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
 
        {/* Total Sales Card */}
        <div id="stat-revenue" className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-violet-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-slate-350 dark:hover:border-slate-700 sm:col-span-2 xl:col-span-1">
          <div className="space-y-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-violet-600/95 dark:text-violet-450 uppercase tracking-wider block truncate">{t.totalSales}</span>
            <span className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 block truncate">{stats.totalSales.toLocaleString()} MAD</span>
          </div>
          <div className="p-2 sm:p-2.5 bg-violet-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
 
        {/* Total Profits Card */}
        <div id="stat-profits" className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 border-s-4 border-s-teal-500 rounded-2xl py-3.5 px-4 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-md hover:border-slate-350 dark:hover:border-slate-700 sm:col-span-2 xl:col-span-1">
          <div className="space-y-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-teal-600/95 dark:text-teal-450 uppercase tracking-wider block truncate">{t.totalProfits}</span>
            <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 block truncate">
              {role === 'PUBLIC' ? '[MASKED]' : `${stats.totalProfits.toLocaleString()} MAD`}
            </span>
          </div>
          <div className="p-2 sm:p-2.5 bg-teal-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* 2. RECHARTS GRID */}
      <div className="grid grid-cols-1 lga:grid-cols-2 gap-6">

        {/* Sales Expansion Progression over time */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-colors ring-[3px] ring-slate-100/50 dark:ring-slate-900/30">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            📈 {t.salesOverTime}
          </h3>
          <div className="h-64 sm:h-72">
            {salesOverTimeData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 italic text-xs">{t.noData}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesOverTimeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="revenue" name={t.totalSales} stroke="#3b82f6" strokeWidth={3} activeDot={{ r: 8 }} />
                  {role !== 'PUBLIC' && (
                    <Line type="monotone" dataKey="profit" name={t.totalProfits} stroke="#10b981" strokeWidth={2} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sales by Product representation */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-colors ring-[3px] ring-slate-100/50 dark:ring-slate-900/30">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            🛍️ {t.salesByProduct}
          </h3>
          <div className="h-64 sm:h-72">
            {salesByProductData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 italic text-xs">{t.noData}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByProductData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" name={t.revenue} fill="#818cf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="quantity" name={t.quantity} fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Profits by Seller Bar block (Hidden / Masked for Public) */}
        {role !== 'PUBLIC' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-colors ring-[3px] ring-slate-100/50 dark:ring-slate-900/30">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              💼 {t.profitsBySeller}
            </h3>
            <div className="h-64 sm:h-72">
              {profitBySellerData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 italic text-xs">{t.noData}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profitBySellerData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="profit" name={t.profit} fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* Sales by City Bar representation */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-colors ring-[3px] ring-slate-100/50 dark:ring-slate-900/30">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            📍 {t.salesByCity}
          </h3>
          <div className="h-64 sm:h-72">
            {salesByCityData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 italic text-xs">{t.noData}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByCityData} layout="vertical" margin={{ top: 5, right: 15, left: 15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="revenue" name={t.revenue} fill="#34d399" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Order status proportion donut chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-colors ring-[3px] ring-slate-100/50 dark:ring-slate-900/30">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            📊 {t.orderStatusRatios}
          </h3>
          <div className="h-64 sm:h-72 flex flex-col sm:flex-row items-center justify-center gap-6">
            {statusRatiosData.length === 0 ? (
              <div className="text-slate-400 italic text-xs">{t.noData}</div>
            ) : (
              <>
                <div className="w-1/2 h-48 sm:h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusRatiosData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {statusRatiosData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-xs">
                  {statusRatiosData.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{item.name}:</span>
                      <span className="text-slate-500 font-bold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. TOP SELLERS & TOP PRODUCTS BENTO LISTS */}
      <div className="grid grid-cols-1 lga:grid-cols-2 gap-6">
        
        {/* Top Sellers list */}
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl p-5 shadow-xs ring-[3px] ring-slate-100/50 dark:ring-slate-900/30">
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
        <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl p-5 shadow-xs ring-[3px] ring-slate-100/50 dark:ring-slate-900/30">
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
