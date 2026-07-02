import { useState, useEffect } from 'react';
import { Order, Language, UserRole, Seller } from '../types';
import { DatabaseService } from '../dbMock';
import { translations } from '../locales';
import { Edit2, Trash2, Search, Filter, Calendar, Download, Eye, ArrowUpDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, CheckCircle2, Clock, Ban, AlertCircle, X } from 'lucide-react';

interface Props {
  lang: Language;
  role: UserRole;
  currentUser: string;
  onEditInit: (order: Order) => void;
  onDataChange: () => void;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
  triggerFormOpen: () => void;
  initialStatusFilter?: string | null;
  onClearInitialStatusFilter?: () => void;
  dataTrigger?: number;
}

export default function OrdersTable({
  lang,
  role,
  currentUser,
  onEditInit,
  onDataChange,
  toast,
  triggerFormOpen,
  initialStatusFilter,
  onClearInitialStatusFilter,
  dataTrigger
}: Props) {
  const t = translations[lang];

  // Raw list
  const [orders, setOrders] = useState<Order[]>([]);

  // Search & Filter controls
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeller, setFilterSeller] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterSupervisor, setFilterSupervisor] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (initialStatusFilter !== undefined && initialStatusFilter !== null) {
      setFilterStatus(initialStatusFilter);
      if (initialStatusFilter !== '') {
        setShowFilters(false);
      }
      onClearInitialStatusFilter?.();
    }
  }, [initialStatusFilter, onClearInitialStatusFilter]);

  // Dropdown lists
  const [uniqueSellers, setUniqueSellers] = useState<string[]>([]);
  const [uniqueProducts, setUniqueProducts] = useState<string[]>([]);
  const [uniqueCities, setUniqueCities] = useState<string[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Sorting
  const [sortField, setSortField] = useState<keyof Order>('orderDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination page size
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const getFilteredRoleOrders = (): Order[] => {
    let rawOrders = DatabaseService.getOrders();
    if (role === 'SELLER') {
      return rawOrders.filter(o => o.sellerName === currentUser);
    } else if (role === 'SUPERVISOR') {
      const rawSellers = DatabaseService.getSellers();
      const currentSellerProfile = rawSellers.find(s => s.name === currentUser);
      if (!currentSellerProfile) {
        return rawOrders.filter(o => o.sellerName === currentUser);
      }
      
      const childSellers = rawSellers.filter(s => 
        s.parentId === currentSellerProfile.id || 
        (s.parentIds && s.parentIds.includes(currentSellerProfile.id))
      );
      const childSellerNames = childSellers.map(s => s.name);

      const isProductMatching = (orderProductStr: string, assigned: string[] | undefined) => {
        if (!assigned || assigned.length === 0) return true;
        if (assigned.includes(orderProductStr)) return true;
        const matchedProd = DatabaseService.getProducts().find(p => p.id === orderProductStr || p.productName === orderProductStr);
        if (matchedProd) {
          return assigned.includes(matchedProd.id) || assigned.includes(matchedProd.productName);
        }
        return false;
      };

      return rawOrders.filter(o => {
        if (o.sellerName === currentUser) return true;
        if (childSellerNames.includes(o.sellerName)) {
          if (o.assignedSupervisorId) {
            if (o.assignedSupervisorId !== currentSellerProfile.id) {
              return false;
            }
          }
          return isProductMatching(o.product, currentSellerProfile.assignedProducts);
        }
        return false;
      });
    }
    return rawOrders;
  };

  const getAllSupervisors = (): Seller[] => {
    const sellers = DatabaseService.getSellers();
    const sups = sellers.filter(s => s.role === 'SUPERVISOR' || s.role === 'ADMIN' || s.role === 'DEPUTY');
    if (!sups.some(s => s.id === 'admin_1')) {
      sups.push({
        id: 'admin_1',
        name: lang === 'ar' ? 'عبد الله (المدير العام)' : 'Abdellah (Directeur)',
        role: 'ADMIN',
        phone: '',
        active: true,
        createdAt: ''
      });
    }
    return sups;
  };

  const getFilterSupervisors = (): Seller[] => {
    const sellers = DatabaseService.getSellers();
    const currentSellerProfile = sellers.find(s => s.name === currentUser);

    // 1. Regular Seller (SELLER)
    if (role === 'SELLER') {
      if (!currentSellerProfile) return [];
      const parentIds = new Set<string>();
      if (currentSellerProfile.parentId) parentIds.add(currentSellerProfile.parentId);
      if (currentSellerProfile.parentIds) {
        currentSellerProfile.parentIds.forEach(id => parentIds.add(id));
      }
      return sellers.filter(s => parentIds.has(s.id));
    }

    // 2. Supervisor (SUPERVISOR)
    if (role === 'SUPERVISOR') {
      if (!currentSellerProfile) {
        return sellers.filter(s => s.role === 'DEPUTY');
      }
      const parentIds = new Set<string>();
      if (currentSellerProfile.parentId) parentIds.add(currentSellerProfile.parentId);
      if (currentSellerProfile.parentIds) {
        currentSellerProfile.parentIds.forEach(id => parentIds.add(id));
      }
      const results = sellers.filter(s => parentIds.has(s.id) && s.role === 'DEPUTY');
      if (results.length === 0) {
        return sellers.filter(s => s.role === 'DEPUTY');
      }
      return results;
    }

    // 3. Deputy Director (DEPUTY)
    if (role === 'DEPUTY') {
      const admins = sellers.filter(s => s.role === 'ADMIN');
      if (!admins.some(s => s.id === 'admin_1')) {
        admins.push({
          id: 'admin_1',
          name: lang === 'ar' ? 'عبد الله (المدير العام)' : 'Abdellah (Directeur)',
          role: 'ADMIN',
          phone: '',
          active: true,
          createdAt: ''
        });
      }
      
      if (!currentSellerProfile) return admins;
      const parentIds = new Set<string>();
      if (currentSellerProfile.parentId) parentIds.add(currentSellerProfile.parentId);
      if (currentSellerProfile.parentIds) {
        currentSellerProfile.parentIds.forEach(id => parentIds.add(id));
      }
      const matchedAdmins = admins.filter(s => parentIds.has(s.id));
      if (matchedAdmins.length > 0) return matchedAdmins;
      return admins;
    }

    // 4. Director (ADMIN)
    if (role === 'ADMIN') {
      const admins = sellers.filter(s => s.role === 'ADMIN');
      const adminGeneral = admins.find(s => s.id === 'admin_1') || {
        id: 'admin_1',
        name: lang === 'ar' ? 'عبد الله (المدير العام)' : 'Abdellah (Directeur)',
        role: 'ADMIN',
        phone: '',
        active: true,
        createdAt: ''
      };
      
      if (currentUser.includes('عبد الله') || currentUser.includes('Abdellah') || currentSellerProfile?.id === 'admin_1') {
        return getAllSupervisors();
      } else {
        return [adminGeneral];
      }
    }

    return getAllSupervisors();
  };

  const matchesSupervisor = (order: Order, supId: string): boolean => {
    if (!supId) return true;
    if (order.assignedSupervisorId) {
      return order.assignedSupervisorId === supId;
    }
    const sellers = DatabaseService.getSellers();
    const sellerObj = sellers.find(s => s.name === order.sellerName);
    if (!sellerObj) {
      return supId === 'admin_1';
    }
    if (sellerObj.role === 'SUPERVISOR' || sellerObj.role === 'ADMIN' || sellerObj.role === 'DEPUTY') {
      return sellerObj.id === supId;
    }
    if (sellerObj.parentId) {
      return sellerObj.parentId === supId;
    }
    if (sellerObj.parentIds && sellerObj.parentIds.includes(supId)) {
      return true;
    }
    return supId === 'admin_1';
  };

  useEffect(() => {
    const filtered = getFilteredRoleOrders();
    setOrders(filtered);

    // Extract options
    const slrs = Array.from(new Set(filtered.map(o => o.sellerName))).filter(Boolean);
    const prds = Array.from(new Set(filtered.map(o => o.product))).filter(Boolean);
    const cts = Array.from(new Set(filtered.map(o => o.city))).filter(Boolean);

    setUniqueSellers(slrs);
    setUniqueProducts(prds);
    setUniqueCities(cts);
  }, [role, currentUser, dataTrigger]);

  // Soft refresh
  const triggerRefresh = () => {
    setOrders(getFilteredRoleOrders());
  };


  const handleDeleteOrder = (id: string, sellerName: string) => {
    if (role === 'PUBLIC') {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    if (role === 'SELLER') {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    if (deleteConfirmId === id) {
      const original = DatabaseService.getOrders();
      const deletedOrder = original.find(o => o.id === id);
      const updated = original.filter(o => o.id !== id);
      DatabaseService.saveOrders(updated);
      if (deletedOrder) {
        DatabaseService.triggerNotification('order_deleted', currentUser, {
          titleAr: 'حذف طلبية',
          titleFr: 'Commande supprimée',
          titleEn: 'Order Deleted',
          ar: `قام المستخدم "${currentUser}" بحذف الطلبية الخاصة بالزبون "${deletedOrder.customerName}".`,
          fr: `L'utilisateur "${currentUser}" a supprimé la commande du client "${deletedOrder.customerName}".`,
          en: `User "${currentUser}" deleted the order of client "${deletedOrder.customerName}".`
        });
      }
      setOrders(updated);
      toast(t.orderDeletedSuccess, 'success');
      onDataChange();
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => {
        setDeleteConfirmId(current => current === id ? null : current);
      }, 3000);
    }
  };

  const handleInlineStatusChange = (orderId: string, newStatus: string) => {
    if (role !== 'ADMIN' && role !== 'DEPUTY' && role !== 'SUPERVISOR') {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    const rawOrders = DatabaseService.getOrders();
    const orderIndex = rawOrders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;

    const orderObj = rawOrders[orderIndex];
    
    // Recalculate profit based on product
    const allProducts = DatabaseService.getProducts();
    const selectedProd = allProducts.find(p => p.productName === orderObj.product);
    
    let calculatedProfit = 0;
    if (selectedProd) {
      if (newStatus === 'DELIVERED') {
        const wholesalePrice = selectedProd.wholesalePrice;
        calculatedProfit = orderObj.totalAmount - (wholesalePrice * orderObj.quantity) - orderObj.deliveryCost;
      } else {
        calculatedProfit = 0;
      }
    } else {
      if (newStatus === 'DELIVERED') {
        calculatedProfit = orderObj.profit || 0;
      } else {
        calculatedProfit = 0;
      }
    }

    const updatedOrder = {
      ...orderObj,
      orderStatus: newStatus as any,
      profit: calculatedProfit,
      updatedAt: new Date().toISOString()
    };

    rawOrders[orderIndex] = updatedOrder;
    DatabaseService.saveOrders(rawOrders);

    DatabaseService.triggerNotification('order_updated', currentUser, {
      titleAr: 'تحديث حالة طلبية',
      titleFr: 'Statut de commande mis à jour',
      titleEn: 'Order Status Updated',
      ar: `قام المستخدم "${currentUser}" بتحديث حالة الطلبية للزبون "${orderObj.customerName}" إلى: ${newStatus}.`,
      fr: `L'utilisateur "${currentUser}" a mis à jour le statut de la commande de "${orderObj.customerName}" à : ${newStatus}.`,
      en: `User "${currentUser}" updated the order status of "${orderObj.customerName}" to: ${newStatus}.`
    });
    
    // Trigger synchronous or background push sync to Google Sheets
    try {
      DatabaseService.syncOrderToSheets(updatedOrder, false);
    } catch (syncErr) {
      console.error('[SyncError] Failed inline sheet sync:', syncErr);
    }

    setOrders(rawOrders);

    toast(lang === 'ar' ? 'تم تحديث حالة الطلبية والربح ومزامنتها بنجاح' : 'Statut mis à jour, profit recalculé et synchronisé', 'success');
    onDataChange();
  };

  // Filtering Logic
  const filteredOrders = orders.filter(order => {
    // Search
    const searchLower = searchText.toLowerCase();
    const customerMatch = order.customerName.toLowerCase().includes(searchLower);
    const phoneMatch = order.phone.includes(searchLower);
    const notesMatch = (order.notes || '').toLowerCase().includes(searchLower);
    const idMatch = order.id.toLowerCase().includes(searchLower);

    // Dynamic supervisor name lookup for search matching
    const sups = getAllSupervisors();
    const sellers = DatabaseService.getSellers();
    const sellerObj = sellers.find(s => s.name === order.sellerName);
    let supervisorName = '';
    if (order.assignedSupervisorId) {
      const supObj = sups.find(s => s.id === order.assignedSupervisorId);
      if (supObj) supervisorName = supObj.name;
    } else if (sellerObj) {
      const parentId = sellerObj.parentId || (sellerObj.parentIds && sellerObj.parentIds[0]);
      if (parentId) {
        const supObj = sups.find(s => s.id === parentId);
        if (supObj) supervisorName = supObj.name;
      }
    }
    const supervisorNameMatch = supervisorName.toLowerCase().includes(searchLower);
    const textMatch = customerMatch || phoneMatch || notesMatch || idMatch || supervisorNameMatch;

    // Filters
    const statusMatch = !filterStatus || order.orderStatus === filterStatus;
    const sellerMatch = !filterSeller || order.sellerName === filterSeller;
    const productMatch = !filterProduct || order.product === filterProduct;
    const cityMatch = !filterCity || order.city === filterCity;
    const supervisorMatch = matchesSupervisor(order, filterSupervisor);

    // Date range
    let dateMatch = true;
    if (startDate) {
      dateMatch = dateMatch && order.orderDate >= startDate;
    }
    if (endDate) {
      dateMatch = dateMatch && order.orderDate <= endDate;
    }

    return textMatch && statusMatch && sellerMatch && productMatch && cityMatch && supervisorMatch && dateMatch;
  });

  // Sorting Logic
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let fieldA = a[sortField];
    let fieldB = b[sortField];

    if (typeof fieldA === 'string') {
      fieldA = (fieldA as string).toLowerCase();
      fieldB = (fieldB as string).toLowerCase();
    }

    if (fieldA < fieldB) return sortDirection === 'asc' ? -1 : 1;
    if (fieldA > fieldB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination Logic
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = sortedOrders.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(sortedOrders.length / rowsPerPage) || 1;

  // Sync back to first page if filters changes page count
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [searchText, filterStatus, filterSeller, filterProduct, filterCity, startDate, endDate, totalPages]);

  const handleSort = (field: keyof Order) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // EXPORT CLIENT-SIDE EXCEL / CSV with UTF-8 BOM
  const exportToCSV = () => {
    try {
      // Build headers
      const headers = [
        t.orderDate,
        t.sellerName,
        role === 'PUBLIC' ? '' : t.customerName,
        role === 'PUBLIC' ? '' : t.phone,
        t.city,
        role === 'PUBLIC' ? '' : t.address,
        t.product,
        t.quantity,
        t.deliveryCost,
        t.totalAmount,
        t.status,
        role === 'PUBLIC' ? '' : t.profit,
        t.createdBy
      ].filter(Boolean);

      const rows = sortedOrders.map(o => {
        const item = [
          o.orderDate,
          o.sellerName,
          role === 'PUBLIC' ? '[MASKED]' : o.customerName,
          role === 'PUBLIC' ? '[MASKED]' : o.phone,
          o.city,
          role === 'PUBLIC' ? '[MASKED]' : o.address,
          o.product,
          o.quantity,
          o.deliveryCost,
          o.totalAmount,
          t[o.orderStatus] || o.orderStatus,
          role === 'PUBLIC' ? '0' : o.profit,
          o.createdBy
        ];
        return item.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `sales_orders_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast(lang === 'ar' ? 'تم تصدير ملف الـ Excel/CSV بنجاح!' : 'Export CSV réussi !', 'success');
    } catch (e) {
      toast('Export Failed', 'error');
    }
  };

  // PRINT / PDF REPORT GENERATOR
  const exportToPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast(lang === 'ar' ? 'يرجى السماح بالنوافذ المنبثقة للتصدير' : 'Veuillez autoriser les Popups pour imprimer.', 'error');
      return;
    }

    const direction = lang === 'ar' ? 'rtl' : 'ltr';
    const reportTitle = `${t.appName} - ${t.orders}`;
    const dateStr = new Date().toLocaleString(lang);

    const tblRows = sortedOrders.map((o, idx) => `
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 8px; text-align: start;">${idx + 1}</td>
        <td style="padding: 8px; text-align: start;">${o.orderDate}</td>
        <td style="padding: 8px; text-align: start;">${o.sellerName}</td>
        ${role !== 'PUBLIC' ? `<td style="padding: 8px; text-align: start;">${o.customerName}</td>` : ''}
        <td style="padding: 8px; text-align: start;">${o.city}</td>
        <td style="padding: 8px; text-align: start;">${o.product}</td>
        <td style="padding: 8px; text-align: center;">${o.quantity}</td>
        <td style="padding: 8px; text-align: end;">${o.totalAmount} MAD</td>
        <td style="padding: 8px; text-align: center; font-weight: bold;">${t[o.orderStatus]}</td>
        ${role !== 'PUBLIC' ? `<td style="padding: 8px; text-align: end; color: #16a34a;">${o.profit} MAD</td>` : ''}
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${reportTitle}</title>
          <style>
            body { font-family: 'Inter', sans-serif; margin: 30px; direction: ${direction}; color: #333; }
            h1 { font-size: 20px; color: #1e293b; margin-bottom: 5px; }
            p { font-size: 11px; color: #64748b; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
            th { background: #f1f5f9; padding: 10px; font-weight: bold; text-align: start; border-bottom: 2px solid #cbd5e1; }
            td { padding: 10px; }
            .total-footer { margin-top: 30px; font-size: 12px; font-weight: bold; text-align: end; }
          </style>
        </head>
        <body>
          <h1>${reportTitle}</h1>
          <p>${lang === 'ar' ? 'تاريخ التقرير' : 'Date du Rapport'}: ${dateStr} | ${lang === 'ar' ? 'إجمالي العناصر المفلترة' : 'Total des lignes filtrées'}: ${sortedOrders.length}</p>
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">#</th>
                <th>${t.orderDate}</th>
                <th>${t.sellerName}</th>
                ${role !== 'PUBLIC' ? `<th>${t.customerName}</th>` : ''}
                <th>${t.city}</th>
                <th>${t.product}</th>
                <th style="text-align: center;">${t.quantity}</th>
                <th style="text-align: end;">${t.totalAmount}</th>
                <th style="text-align: center;">${t.status}</th>
                ${role !== 'PUBLIC' ? `<th style="text-align: end;">${t.profit}</th>` : ''}
              </tr>
            </thead>
            <tbody>
              ${tblRows}
            </tbody>
          </table>
          <div class="total-footer">
            ${role !== 'PUBLIC' ? `${t.totalProfits}: ${sortedOrders.reduce((acc, curr) => acc + curr.profit, 0).toLocaleString()} MAD | ` : ''}
            ${t.totalSales}: ${sortedOrders.reduce((acc, curr) => acc + curr.totalAmount, 0).toLocaleString()} MAD
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const clearAllFilters = () => {
    setSearchText('');
    setFilterStatus('');
    setFilterSeller('');
    setFilterProduct('');
    setFilterCity('');
    setFilterSupervisor('');
    setStartDate('');
    setEndDate('');
    toast(lang === 'ar' ? 'تم مسح الفلاتر بنجاح' : 'Filtres effacés', 'info');
  };

  const hasActiveFilters = !!(searchText || filterStatus || filterSeller || filterProduct || filterCity || filterSupervisor || startDate || endDate);

  return (
    <div id="orders-table-wrapper" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs transition-colors p-6">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>{t.orders}</span>
            <span className="text-xs font-normal text-slate-500 bg-slate-55 dark:bg-slate-950 px-2.5 py-1 rounded-full border border-slate-200/50 dark:border-slate-850">
              {filteredOrders.length} {lang === 'ar' ? 'طلبية مستوفية' : 'commandes correspondantes'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">{lang === 'ar' ? 'الجدول تفاعلي بالكامل مع خيارات البحث والفرز' : 'Tableau dynamique de suivi complet'}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <button
            id="toggle-filters-btn"
            onClick={() => setShowFilters(!showFilters)}
            className={`cursor-pointer border rounded-lg px-3.5 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 select-none ${
              showFilters
                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/40 shadow-xs'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="relative">
              <Filter className="w-4 h-4" />
              {!!(searchText || filterStatus || filterSeller || filterProduct || filterCity || filterSupervisor || startDate || endDate) && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-bounce"></span>
              )}
            </div>
            <span>
              {lang === 'ar' 
                ? (showFilters ? 'إخفاء التصفية والبحث' : 'تصفية وبحث الطلبيات') 
                : (showFilters ? 'Masquer la recherche' : 'Recherche & Filtrage')}
            </span>
          </button>

          {role === 'ADMIN' && (
            <>
              <button
                id="export-excel-btn"
                onClick={exportToCSV}
                className="cursor-pointer bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded-lg px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {t.exportExcel}
              </button>
              <button
                id="export-pdf-btn"
                onClick={exportToPDF}
                className="cursor-pointer bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <FileText className="w-4 h-4" />
                {t.exportPDF}
              </button>
            </>
          )}
          
          {role !== 'PUBLIC' && (
            <button
              id="add-order-table-btn"
              onClick={triggerFormOpen}
              className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-xs font-bold flex items-center gap-1.5 transition sm:ml-auto"
            >
              <span>+ {t.addOrder}</span>
            </button>
          )}
        </div>
      </div>

      {role === 'PUBLIC' && (
        <div className="mb-5 text-xs text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-250 dark:border-amber-800/40">
          {t.publicNotice}
        </div>
      )}

      {/* COMPACT ACTIVE FILTERS ROW (SHRINK/MINIMIZE VIEW) */}
      {!showFilters && hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800/60 rounded-xl text-xs animate-in fade-in duration-200">
          <span className="text-slate-500 dark:text-slate-400 font-bold">
            {lang === 'ar' ? 'الفلاتر النشطة:' : 'Filtres actifs:'}
          </span>
          
          {filterStatus && (
            <span className="inline-flex items-center gap-1.5 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold border border-blue-200/50 dark:border-blue-800/40">
              <span>{t.status}: {t[filterStatus] || filterStatus}</span>
              <button onClick={() => setFilterStatus('')} className="hover:text-red-500 cursor-pointer p-0.5"><X className="w-3.5 h-3.5" /></button>
            </span>
          )}

          {searchText && (
            <span className="inline-flex items-center gap-1.5 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold border border-blue-200/50 dark:border-blue-800/40">
              <span>{lang === 'ar' ? 'البحث' : 'Recherche'}: "{searchText}"</span>
              <button onClick={() => setSearchText('')} className="hover:text-red-500 cursor-pointer p-0.5"><X className="w-3.5 h-3.5" /></button>
            </span>
          )}

          {filterSeller && (
            <span className="inline-flex items-center gap-1.5 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold border border-blue-200/50 dark:border-blue-800/40">
              <span>{t.sellerName}: {filterSeller}</span>
              <button onClick={() => setFilterSeller('')} className="hover:text-red-500 cursor-pointer p-0.5"><X className="w-3.5 h-3.5" /></button>
            </span>
          )}

          {filterProduct && (
            <span className="inline-flex items-center gap-1.5 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold border border-blue-200/50 dark:border-blue-800/40">
              <span>{t.product}: {filterProduct}</span>
              <button onClick={() => setFilterProduct('')} className="hover:text-red-500 cursor-pointer p-0.5"><X className="w-3.5 h-3.5" /></button>
            </span>
          )}

          {filterCity && (
            <span className="inline-flex items-center gap-1.5 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold border border-blue-200/50 dark:border-blue-800/40">
              <span>{t.city}: {filterCity}</span>
              <button onClick={() => setFilterCity('')} className="hover:text-red-500 cursor-pointer p-0.5"><X className="w-3.5 h-3.5" /></button>
            </span>
          )}

          {filterSupervisor && (
            <span className="inline-flex items-center gap-1.5 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold border border-blue-200/50 dark:border-blue-800/40">
              <span>{lang === 'ar' ? 'المشرف' : 'Superviseur'}: {getAllSupervisors().find(s => s.id === filterSupervisor)?.name || filterSupervisor}</span>
              <button onClick={() => setFilterSupervisor('')} className="hover:text-red-500 cursor-pointer p-0.5"><X className="w-3.5 h-3.5" /></button>
            </span>
          )}

          {(startDate || endDate) && (
            <span className="inline-flex items-center gap-1.5 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold border border-blue-200/50 dark:border-blue-800/40">
              <span>{lang === 'ar' ? 'التاريخ' : 'Date'}: {startDate || '*'} ➔ {endDate || '*'}</span>
              <button onClick={() => { setStartDate(''); setEndDate(''); }} className="hover:text-red-500 cursor-pointer p-0.5"><X className="w-3.5 h-3.5" /></button>
            </span>
          )}

          <button
            onClick={clearAllFilters}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-350 underline underline-offset-2 font-bold ml-auto rtl:mr-auto rtl:ml-0 text-[11px] px-2 cursor-pointer"
          >
            {lang === 'ar' ? 'إعادة تعيين الكل' : 'Tout réinitialiser'}
          </button>
        </div>
      )}

      {/* FILTER CONTROLS BAR */}
      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lga:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-950 p-5 rounded-xl border border-slate-100 dark:border-slate-805 mb-6 animate-in fade-in slide-in-from-top-2 duration-200">
        
        {/* Search */}
        <div className="relative">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{lang === 'ar' ? 'بحث' : 'Recherche'}</label>
          <div className="relative">
            <Search className="absolute start-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              id="search-order-input"
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={t.search}
              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 ps-9 pe-3 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t.status}</label>
          <select
            id="filter-status-select"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">{t.filterByStatus}</option>
            <option value="PENDING">🕒 {t.PENDING}</option>
            <option value="DELIVERED">✅ {t.DELIVERED}</option>
            <option value="DELAYED">⏳ {t.DELAYED}</option>
            <option value="REJECTED">❌ {t.REJECTED}</option>
          </select>
        </div>

        {/* Sellers filter */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t.sellers}</label>
          <select
            id="filter-seller-select"
            value={filterSeller}
            onChange={e => setFilterSeller(e.target.value)}
            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">{t.filterBySeller}</option>
            {uniqueSellers.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Products filter */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t.products}</label>
          <select
            id="filter-product-select"
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">{t.filterByProduct}</option>
            {uniqueProducts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Cities filter */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t.city}</label>
          <select
            id="filter-city-select"
            value={filterCity}
            onChange={e => setFilterCity(e.target.value)}
            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">{t.filterByCity}</option>
            {uniqueCities.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Supervisor filter */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{lang === 'ar' ? 'المشرف المسؤول' : 'Superviseur'}</label>
          <select
            id="filter-supervisor-select"
            value={filterSupervisor}
            onChange={e => setFilterSupervisor(e.target.value)}
            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">{lang === 'ar' ? '-- اختر المشرف --' : '-- Choisir le superviseur --'}</option>
            {getFilterSupervisors().map(sup => (
              <option key={sup.id} value={sup.id}>{sup.name}</option>
            ))}
          </select>
        </div>

        {/* Date Ranges */}
        <div className="sm:col-span-2 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{lang === 'ar' ? 'من تاريخ' : 'Du'}</label>
            <input
              id="start-date-filter"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{lang === 'ar' ? 'إلى تاريخ' : 'Au'}</label>
            <input
              id="end-date-filter"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-end justify-start sm:justify-end gap-2 md:col-span-3 lga:col-span-1">
          {(searchText || filterStatus || filterSeller || filterProduct || filterCity || startDate || endDate) && (
            <button
              id="clear-filters-btn"
              onClick={clearAllFilters}
              className="cursor-pointer bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg px-4 py-2 text-xs font-bold transition hover:bg-slate-300 dark:hover:bg-slate-700"
            >
              {lang === 'ar' ? 'مسح الفلترة' : 'Vider les filtres'}
            </button>
          )}
        </div>
      </div>
      )}

      {/* ORDERS DATA TABLE */}
      <div className="overflow-x-auto rounded-xl border border-slate-150 dark:border-slate-800">
        <table className="w-full text-start text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-150 dark:border-slate-800">
              <th onClick={() => handleSort('orderDate')} className="py-4 px-4 text-start cursor-pointer group select-none">
                <div className="flex items-center gap-1.5">
                  {t.orderDate}
                  <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
                </div>
              </th>
              
              <th onClick={() => handleSort('sellerName')} className="py-4 px-4 text-start cursor-pointer group select-none">
                <div className="flex items-center gap-1.5">
                  {t.sellerName}
                  <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
                </div>
              </th>
              
              {role !== 'PUBLIC' && (
                <th onClick={() => handleSort('customerName')} className="py-4 px-4 text-start cursor-pointer group select-none">
                  <div className="flex items-center gap-1.5">
                    {t.customerName}
                    <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
                  </div>
                </th>
              )}

              {role !== 'PUBLIC' && <th className="py-4 px-4 text-start">{t.phone}</th>}
              
              <th onClick={() => handleSort('city')} className="py-4 px-4 text-start cursor-pointer group select-none">
                <div className="flex items-center gap-1.5">
                  {t.city}
                  <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
                </div>
              </th>
              
              <th className="py-4 px-4 text-start">{t.product}</th>
              <th className="py-4 px-4 text-center">{t.quantity}</th>
              
              <th onClick={() => handleSort('deliveryCost')} className="py-4 px-4 text-end cursor-pointer group select-none">
                <div className="flex items-center justify-end gap-1.5">
                  {t.deliveryCost}
                  <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
                </div>
              </th>
              
              <th onClick={() => handleSort('totalAmount')} className="py-4 px-4 text-end cursor-pointer group select-none">
                <div className="flex items-center justify-end gap-1.5">
                  {t.totalAmount}
                  <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
                </div>
              </th>
              
              <th onClick={() => handleSort('orderStatus')} className="py-4 px-4 text-center cursor-pointer group select-none">
                <div className="flex items-center justify-center gap-1.5">
                  {t.status}
                  <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
                </div>
              </th>
              
              {role !== 'PUBLIC' && (
                <th onClick={() => handleSort('profit')} className="py-4 px-4 text-end cursor-pointer group select-none">
                  <div className="flex items-center justify-end gap-1.5">
                    {t.profit}
                    <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
                  </div>
                </th>
              )}
              
              {role !== 'PUBLIC' && <th className="py-4 px-4 text-center">{t.actions}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60">
            {currentRows.length === 0 ? (
              <tr>
                <td colSpan={role === 'PUBLIC' ? 8 : 12} className="py-12 text-center text-slate-400 italic">
                  {t.noData}
                </td>
              </tr>
            ) : (
              currentRows.map(order => {
                // Role-based limits helper
                const canAction = role === 'ADMIN' || role === 'DEPUTY' || role === 'SUPERVISOR';

                return (
                  <tr key={order.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 text-slate-700 dark:text-slate-300 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                      {new Date(order.orderDate).toLocaleDateString(lang)}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-200">
                      {order.sellerName}
                    </td>
                    
                    {role !== 'PUBLIC' && (
                      <td className="py-3 px-4 truncate max-w-[150px]" title={order.customerName}>
                        {order.customerName}
                      </td>
                    )}

                    {role !== 'PUBLIC' && (
                      <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                        {order.phone}
                      </td>
                    )}

                    <td className="py-3 px-4">
                      {order.city}
                    </td>
                    <td className="py-3 px-4 font-medium font-sans truncate max-w-[180px]" title={order.product}>
                      {order.product}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-xs">
                      {order.quantity}
                    </td>
                    <td className="py-3 px-4 text-end font-mono text-xs text-slate-500 dark:text-slate-400">
                      {order.deliveryCost.toLocaleString()} MAD
                    </td>
                    <td className="py-3 px-4 text-end font-mono text-xs font-extrabold text-slate-850 dark:text-slate-150">
                      {order.totalAmount.toLocaleString()} MAD
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-center">
                        {(role === 'ADMIN' || role === 'DEPUTY' || role === 'SUPERVISOR') ? (
                          <select
                            id={`inline-status-select-${order.id}`}
                            value={order.orderStatus}
                            onChange={e => handleInlineStatusChange(order.id, e.target.value)}
                            className={`cursor-pointer inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border focus:outline-hidden transition-all text-center ${
                              order.orderStatus === 'DELIVERED'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200'
                                : order.orderStatus === 'PENDING'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200'
                                : order.orderStatus === 'DELAYED'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200'
                                : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200'
                            }`}
                          >
                            <option value="PENDING">🕒 {t.PENDING}</option>
                            <option value="DELIVERED">✅ {t.DELIVERED}</option>
                            <option value="DELAYED">⏳ {t.DELAYED}</option>
                            <option value="REJECTED">❌ {t.REJECTED}</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                            order.orderStatus === 'DELIVERED'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200'
                              : order.orderStatus === 'PENDING'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200'
                              : order.orderStatus === 'DELAYED'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200'
                              : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200'
                          }`}>
                            {order.orderStatus === 'DELIVERED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {order.orderStatus === 'PENDING' && <Clock className="w-3.5 h-3.5 animate-pulse" />}
                            {order.orderStatus === 'DELAYED' && <AlertCircle className="w-3.5 h-3.5" />}
                            {order.orderStatus === 'REJECTED' && <Ban className="w-3.5 h-3.5" />}
                            
                            {t[order.orderStatus]}
                          </span>
                        )}
                      </div>
                    </td>
                    
                    {role !== 'PUBLIC' && (
                      <td className="py-3 px-4 text-end font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {order.profit > 0 ? `+${order.profit.toLocaleString()} MAD` : '0 MAD'}
                      </td>
                    )}

                    {role !== 'PUBLIC' && (
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {canAction ? (
                            <button
                              id={`edit-order-${order.id}`}
                              onClick={() => onEditInit(order)}
                              className="cursor-pointer p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition"
                              title={t.editOrder}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="p-1.5 text-slate-300" title={t.permissionDeniedError}>
                              <Eye className="w-3.5 h-3.5" />
                            </span>
                          )}

                          {(role === 'ADMIN' || role === 'DEPUTY' || role === 'SUPERVISOR') && (
                            <button
                              id={`delete-order-${order.id}`}
                              onClick={() => handleDeleteOrder(order.id, order.sellerName)}
                              className={`cursor-pointer p-1.5 rounded transition flex items-center justify-center gap-1 text-[10px] font-bold ${
                                deleteConfirmId === order.id
                                  ? 'bg-rose-500 text-white hover:bg-rose-600 px-2'
                                  : 'text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {deleteConfirmId === order.id ? (
                                <>
                                  <X className="w-3 h-3 animate-pulse shrink-0" />
                                  <span>{lang === 'ar' ? 'تأكيد؟' : 'Confirmer?'}</span>
                                </>
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION CONTROLS */}
      {sortedOrders.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-450">
            <span>{t.rowsPerPage}</span>
            <select
              id="rows-per-page-select"
              value={rowsPerPage}
              onChange={e => {
                setRowsPerPage(parseInt(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 py-1 px-1.5 rounded-md focus:outline-hidden text-xs cursor-pointer"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-450">
            <span>{indexOfFirstRow + 1}</span> - <span>{Math.min(indexOfLastRow, sortedOrders.length)}</span> {t.of} <span>{sortedOrders.length}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              id="prev-page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="p-1.5 border border-slate-205 dark:border-slate-800 rounded bg-white dark:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
            </button>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 px-2.5">
              {currentPage} / {totalPages}
            </span>
            <button
              id="next-page-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className="p-1.5 border border-slate-205 dark:border-slate-800 rounded bg-white dark:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
