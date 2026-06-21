import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order, Product, Language } from '../types';

interface PDFGenProps {
  orders: Order[];
  products: Product[];
  lang: Language;
  role: string;
}

/**
 * Advanced character & word mapping transliteration utility for Moroccan / Arab names and items.
 * Extracts English/Latin text from parentheses when available or converts Arabic to readable Latin context.
 * This guarantees the PDF will never contain gibberish symbols due to jsPDF's lack of built-in RTL Arabic support.
 */
function cleanArabicText(text: string): string {
  if (!text) return '';
  
  // 1. Try to extract English/Latin inside parentheses, e.g. "أحمد الإدريسي (Ahmed)" -> "Ahmed"
  // or "Casablanca (الدار البيضاء)" -> "Casablanca"
  const parenMatch = text.match(/\(([^)]*[a-zA-Z0-9\s‌\-‌\_]+[^)]*)\)/);
  if (parenMatch && parenMatch[1]) {
    const candidate = parenMatch[1].trim();
    if (/[a-zA-Z0-9]/.test(candidate)) {
      return candidate;
    }
  }

  // 2. If no valid Latin in parentheses, check if there are Latin characters elsewhere in the text
  const latinPart = text.match(/[a-zA-Z0-9\s\-_\.\']{2,}/g);
  if (latinPart && latinPart.length > 0) {
    const joined = latinPart.join(' ').replace(/\s+/g, ' ').trim();
    if (joined.length >= 2) {
      return joined;
    }
  }

  // 3. Simple character-by-character mapping for typical letters
  const charMap: Record<string, string> = {
    'أ': 'A', 'ا': 'A', 'إ': 'I', 'آ': 'A',
    'ب': 'B', 'ت': 'T', 'ث': 'Th', 'ج': 'J',
    'ح': 'H', 'خ': 'Kh', 'د': 'D', 'ذ': 'Dh',
    'ر': 'R', 'ز': 'Z', 'س': 'S', 'ش': 'Sh',
    'ص': 'S', 'ض': 'D', 'ط': 'T', 'ظ': 'Z',
    'ع': 'A', 'غ': 'Gh', 'ف': 'F', 'ق': 'Q',
    'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N',
    'ه': 'H', 'و': 'W', 'ي': 'Y', 'ى': 'A',
    'ة': 'e', 'ئ': 'Y', 'ؤ': 'O', 'ء': "'",
    'لا': 'La', 'لآ': 'La', 'لأ': 'La', 'لإ': 'La',
    ' ': ' '
  };

  const words = text.split(/\s+/);
  const mappedWords = words.map(w => {
    const trimW = w.trim();
    if (!trimW) return '';

    // Direct translation dictionary of common Arabic names and cities in Morocco
    if (trimW === 'محمد') return 'Mohamed';
    if (trimW === 'أحمد') return 'Ahmed';
    if (trimW === 'سعيد') return 'Said';
    if (trimW === 'أمينة') return 'Amina';
    if (trimW === 'خالد') return 'Khalid';
    if (trimW === 'فاطمة') return 'Fatima';
    if (trimW === 'الزهراء') return 'Zahra';
    if (trimW === 'ياسين') return 'Yassine';
    if (trimW === 'العلمي') return 'Alami';
    if (trimW === 'الإدريسي') return 'Idrissi';
    if (trimW === 'بناني') return 'Bennani';
    if (trimW === 'التازي') return 'Tazi';
    if (trimW === 'بنجلون') return 'Benjelloun';
    if (trimW === 'مرزوق') return 'Marzouk';
    if (trimW === 'الفاسي') return 'Fassi';
    if (trimW === 'الرباط') return 'Rabat';
    if (trimW === 'طنجة') return 'Tangier';
    if (trimW === 'مراكش') return 'Marrakech';
    if (trimW === 'فاس') return 'Fes';
    if (trimW === 'أكادير') return 'Agadir';
    if (trimW === 'وجدة') return 'Oujda';
    if (trimW === 'العيون') return 'Laayoune';
    if (trimW === 'مكناس') return 'Meknes';
    if (trimW === 'سلا') return 'Sale';
    if (trimW === 'القنيطرة') return 'Kenitra';
    if (trimW === 'الدار') return 'Casablanca';
    if (trimW === 'البيضاء') return '';

    let convertedW = '';
    for (const char of trimW) {
      convertedW += charMap[char] || '';
    }
    return convertedW;
  }).filter(Boolean);

  let translited = mappedWords.join(' ').replace(/\s+/g, ' ').trim();
  
  // Safe ASCII filter
  translited = translited.replace(/[^\x20-\x7E]/g, '');
  return translited || 'Record';
}

export function generateExecutiveReportPDF({ orders, products, lang, role }: PDFGenProps) {
  // Create jsPDF instance
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const isAr = lang === 'ar';
  
  // High-end executive doc title in clean Latin characters for universal rendering without errors
  const docTitle = isAr ? 'CRM Sales & Profits Executive Report' : lang === 'en' ? 'CRM Sales & Profits Executive Report' : 'Rapport General des Ventes et Benefices';
  const subtitle = `Date: ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')} | Access Level: ${role} | Multi-Language Edition`;

  // 1. PAGE DESIGN: Top Blue Banner Header
  doc.rect(0, 0, 210, 42, 'F');
  doc.setFillColor(30, 58, 138); // Navy blue background

  // Header Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(docTitle, 15, 18);

  // Subtitle
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(subtitle, 15, 25);

  // Decorative Accent bar (Emerald line)
  doc.setDrawColor(16, 185, 129); // emerald
  doc.setLineWidth(1.5);
  doc.line(0, 42, 210, 42);

  // Reset drawing configurations
  doc.setDrawColor(226, 232, 240);
  doc.setTextColor(51, 65, 85);
  
  // Calculate analytics metrics
  const totalOrders = orders.length;
  const delivered = orders.filter(o => o.orderStatus === 'DELIVERED');
  const deliveredCount = delivered.length;

  const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalProfit = orders.reduce((sum, o) => sum + o.profit, 0);
  const deliveryRate = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0;

  // 2. METRICS SCORECARD GRID
  const startY = 48;
  const boxWidth = 58;
  const boxHeight = 22;
  const gap = 12;

  // Render Box Helper
  const drawMetricBox = (x: number, y: number, title: string, value: string, colorHex: string, subText?: string) => {
    // Left outline accent line
    doc.setDrawColor(colorHex === 'blue' ? 59 : colorHex === 'green' ? 16 : 239, colorHex === 'blue' ? 130 : colorHex === 'green' ? 185 : 68, colorHex === 'blue' ? 246 : colorHex === 'green' ? 129 : 68);
    doc.setLineWidth(1);
    doc.line(x, y, x, y + boxHeight);

    // Light background filling
    doc.setFillColor(248, 250, 252);
    doc.rect(x + 0.5, y, boxWidth - 0.5, boxHeight, 'F');

    // Title label
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(title.toUpperCase(), x + 4, y + 6);

    // Big bold value
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(value, x + 4, y + 13);

    // Minor status / subtitle
    if (subText) {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(subText, x + 4, y + 19);
    }
  };

  const tRevenue = isAr ? 'TOTAL REVENUE (CA)' : 'TOTAL REVENUE (CA)';
  const tProfit = isAr ? 'TOTAL PROFIT (NET)' : 'TOTAL PROFIT (NET)';
  const tDelRate = isAr ? 'DELIVERY SUCCESS RATE' : 'DELIVERY SUCCESS RATE';

  drawMetricBox(15, startY, tRevenue, `${totalSales.toLocaleString()} MAD`, 'blue', `${totalOrders} Orders Evaluated`);
  drawMetricBox(15 + boxWidth + gap, startY, tProfit, `${totalProfit.toLocaleString()} MAD`, 'green', `${deliveryRate}% Success factor`);
  drawMetricBox(15 + (boxWidth + gap) * 2, startY, tDelRate, `${deliveryRate}%`, 'green', `${deliveredCount} Completed Deliveries`);

  // 3. SECTIONS & TABULAR AUDITS
  let currentY = startY + boxHeight + 10;

  // Section Header: Top Sellers Analysis
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const secSellersTitle = '1. Top Active Sales Agents Classification';
  doc.text(secSellersTitle, 15, currentY);
  
  // Custom Line separator
  doc.setDrawColor(241, 245, 249);
  doc.setLineWidth(0.5);
  doc.line(15, currentY + 2, 195, currentY + 2);
  currentY += 5;

  // Process Sellers
  const sellersMap: Record<string, { oCount: number; sales: number; profit: number }> = {};
  orders.forEach(o => {
    const sName = cleanArabicText(o.sellerName);
    if (!sellersMap[sName]) {
      sellersMap[sName] = { oCount: 0, sales: 0, profit: 0 };
    }
    sellersMap[sName].oCount++;
    sellersMap[sName].sales += o.totalAmount;
    sellersMap[sName].profit += o.profit;
  });

  const sortedSellers = Object.entries(sellersMap)
    .map(([name, val]) => ({ name, ...val }))
    .sort((a, b) => b.sales - a.sales);

  const sellersRows = sortedSellers.map((s, index) => [
    `#${index + 1}`,
    s.name,
    s.oCount.toString(),
    `${s.sales.toLocaleString()} MAD`,
    `${s.profit.toLocaleString()} MAD`
  ]);

  // Render Sellers Table
  autoTable(doc, {
    startY: currentY,
    margin: { left: 15, right: 15 },
    head: [[
      'Rank', 
      'Agent Name', 
      'Total Orders', 
      'Chiffre d\'Affaires (Ventes)', 
      'Benefice Net Restitue'
    ]],
    body: sellersRows,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    styles: {
      font: 'Helvetica'
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // Section Header: Top Products Analysis
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const secProductsTitle = '2. Catalog Products Performance';
  doc.text(secProductsTitle, 15, currentY);
  
  // Custom Line separator
  doc.line(15, currentY + 2, 195, currentY + 2);
  currentY += 5;

  // Process Products
  const productsMap: Record<string, { qty: number; sales: number }> = {};
  orders.forEach(o => {
    const prodName = cleanArabicText(o.product || 'Standard product');
    if (!productsMap[prodName]) {
      productsMap[prodName] = { qty: 0, sales: 0 };
    }
    productsMap[prodName].qty += o.quantity;
    productsMap[prodName].sales += o.totalAmount;
  });

  const sortedProducts = Object.entries(productsMap)
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => b.sales - a.sales);

  const productsRows = sortedProducts.map((p, index) => [
    `#${index + 1}`,
    p.name,
    p.qty.toString(),
    `${p.sales.toLocaleString()} MAD`
  ]);

  // Render Products Table
  autoTable(doc, {
    startY: currentY,
    margin: { left: 15, right: 15 },
    head: [[
      'Rank', 
      'Product / Catalog Model', 
      'Units Sold', 
      'Volume d\'Affaires (MAD)'
    ]],
    body: productsRows,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 118, 110], // Teal for catalog highlight
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    styles: {
      font: 'Helvetica'
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // Section Header: City Sales Breakdown
  if (currentY > 210) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const secDistributionTitle = '3. Regional Sales Distribution (Cities)';
  doc.text(secDistributionTitle, 15, currentY);
  doc.line(15, currentY + 2, 195, currentY + 2);
  currentY += 5;

  // Process regional cities
  const citiesMap: Record<string, { oCount: number; sales: number }> = {};
  orders.forEach(o => {
    const cityClean = cleanArabicText(o.city || 'Morocco');
    if (!citiesMap[cityClean]) {
      citiesMap[cityClean] = { oCount: 0, sales: 0 };
    }
    citiesMap[cityClean].oCount++;
    citiesMap[cityClean].sales += o.totalAmount;
  });

  const sortedCities = Object.entries(citiesMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 10);

  const citiesRows = sortedCities.map((c, index) => [
    `#${index + 1}`,
    c.name,
    c.oCount.toString(),
    `${c.sales.toLocaleString()} MAD`
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: 15, right: 15 },
    head: [[
      'Rank', 
      'City Name', 
      'Orders Dispatched', 
      'Total Dispatched Revenue'
    ]],
    body: citiesRows,
    theme: 'striped',
    headStyles: {
      fillColor: [71, 85, 105], // Slate
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    styles: {
      font: 'Helvetica'
    }
  });

  const finalPageY = (doc as any).lastAutoTable.finalY + 15;

  // 4. FOOTER NOTE & CONFIDENTIAL NOTICE
  const isPageOver = finalPageY > 265;
  const footerY = 285;
  
  if (isPageOver) {
    doc.addPage();
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(15, footerY - 14, 195, footerY - 14);

  // Disclaimer text
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  const footerDisclaimer = 'CONFIDENTIAL EXECUTIVE AUDIT - Exclusively prepared for Chief Executives (Admin & Deputy). Generated automatically from local CRM cloud logs.';
  doc.text(footerDisclaimer, 15, footerY - 8);

  const paginatedText = 'Certified CRM Intelligence Ledger | End of Report Dossier';
  doc.text(paginatedText, 15, footerY - 4);

  // Trigger Save/Download
  const filename = `Executive_Sales_Report_${Date.now()}.pdf`;
  doc.save(filename);
}
