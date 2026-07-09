export interface TranslationSet {
  appTitle: string;
  appSubtitle: string;
  version: string;
  newPlanBtn: string;
  editMapBtn: string;
  printBtn: string;
  crsConfigTitle: string;
  crsActiveLabel: string;
  crsActiveHelp: string;
  importPanelTitle: string;
  importHelpLine1: string;
  importHelpLine2: string;
  importSuccess: string;
  importFile: string;
  importType: string;
  importSourceCrs: string;
  importAdoptName: string;
  importChooseColumn: string;
  parcelDetailsTitle: string;
  parcelNameLabel: string;
  contenanceLabel: string;
  perimetreLabel: string;
  adoptNameFromTableBtn: string;
  verticesTableTitle: string;
  thVertexName: string;
  thVoisin: string;
  thAngle: string;
  thLongueur: string;
  thActions: string;
  addVertexTitle: string;
  addVertexX: string;
  addVertexY: string;
  addVertexBtn: string;
  alignmentsTableTitle: string;
  thSegment: string;
  thDistance: string;
  helpTitle: string;
  helpBody: string;
  placeholderVoisin: string;
}

export const translations: Record<"ar" | "fr", TranslationSet> = {
  ar: {
    appTitle: "مخطط تصميم القطع الأرضية",
    appSubtitle: "Éditeur de levé Topographique",
    version: "مطور 1.1",
    newPlanBtn: "مخطط جديد",
    editMapBtn: "محرر الخريطة",
    printBtn: "الملف التقني (طباعة)",
    crsConfigTitle: "إعدادات الملف / نظام الإحداثيات (CRS)",
    crsActiveLabel: "نظام الإحداثيات النشط (الوجهة)",
    crsActiveHelp: "سيتم تحويل جميع القطع والصادرات تلقائياً إلى هذا النظام المحلي الرسمي.",
    importPanelTitle: "استيراد البيانات (CADGIS, TAB, MAP, DAT, MBX, MIF, DXF, CSV)",
    importHelpLine1: "اسحب وأسقط ملفات الرفع هنا (حدد ملفات MAP و TAB و DAT و MBX معاً أو ملف ZIP)",
    importHelpLine2: "استيراد الرفوعات الطبوغرافية متعددة الصيغ :",
    importSuccess: "تم استيراد الملف بنجاح !",
    importFile: "الملف :",
    importType: "النوع :",
    importSourceCrs: "تحديد نظام الإحداثيات الأصلي للملف (Source CRS) :",
    importAdoptName: "اعتماد اسم القطعة من الجدول الوصفي (كامل الملف) :",
    importChooseColumn: "-- اختر عمود الإسم --",
    parcelDetailsTitle: "معلومات القطعة الأرضية",
    parcelNameLabel: "اسم القطعة الأرضية",
    contenanceLabel: "المساحة الإجمالية",
    perimetreLabel: "محيط القطعة",
    adoptNameFromTableBtn: "اعتماد اسم القطعة من الجدول الوصفي (العمود)",
    verticesTableTitle: "جدول إحداثيات النقط (القمم)",
    thVertexName: "النقطة",
    thVoisin: "خطوط الطول / الإتجاهات",
    thAngle: "الزاوية (°)",
    thLongueur: "الطول (م)",
    thActions: "إجراءات",
    addVertexTitle: "إضافة نقطة جديدة للمضلع",
    addVertexX: "إحداثي X (الشرق)",
    addVertexY: "إحداثي Y (الشمال)",
    addVertexBtn: "إضافة نقطة",
    alignmentsTableTitle: "جدول الأضلاع والمجاورين",
    thSegment: "الضلع",
    thDistance: "الطول (م)",
    helpTitle: "مساعدة و توجيه تفاعلي",
    helpBody: "تتيح لك هذه المنصة التفاعلية سحب وإزاحة نقاط الحدود وتعديل أطوال الأضلاع مباشرة على الخريطة وسيتغير جدول الإحداثيات والبيانات تلقائياً بشكل متزامن قبل طباعة وثيقة الملف التقني النهائية.",
    placeholderVoisin: "اكتب اسم المجاور (مثال: طريق، رسم...)"
  },
  fr: {
    appTitle: "PARCEL LAYOUT DESIGNER",
    appSubtitle: "Éditeur de levé Topographique",
    version: "V1.1 PRO",
    newPlanBtn: "Nouveau Plan",
    editMapBtn: "Éditeur de Carte",
    printBtn: "Fiche Technique (Impression)",
    crsConfigTitle: "Configuration du Fichier / Système CRS (Projection)",
    crsActiveLabel: "Système de Coordonnées Actif (Projection)",
    crsActiveHelp: "Toutes les parcelles et exports seront convertis automatiquement dans cette projection locale officielle.",
    importPanelTitle: "Importation (CADGIS, TAB, MAP, DAT, MBX, MIF, DXF, CSV, ZIP)",
    importHelpLine1: "Glissez-déposez vos fichiers CAO/SIG (MAP+TAB+DAT+MBX ensemble ou archives ZIP)",
    importHelpLine2: "Importation de levés topographiques multi-formats :",
    importSuccess: "Succès de l'importation !",
    importFile: "Fichier :",
    importType: "Format :",
    importSourceCrs: "Définir le CRS d'origine du fichier (Source CRS) :",
    importAdoptName: "Adopter le nom de la parcelle depuis la table d'attributs :",
    importChooseColumn: "-- Choisir la colonne d'nom --",
    parcelDetailsTitle: "Identification de la Parcelle & Infos",
    parcelNameLabel: "Nom de la parcelle",
    contenanceLabel: "Contenance",
    perimetreLabel: "Périmètre",
    adoptNameFromTableBtn: "Adopter le nom de la parcelle (Colonne)",
    verticesTableTitle: "Liste des Sommets / Coordonnées (X,Y)",
    thVertexName: "Sommet",
    thVoisin: "Voisinage",
    thAngle: "Angle (°)",
    thLongueur: "Distance (m)",
    thActions: "Actions",
    addVertexTitle: "Ajouter un point au polygone",
    addVertexX: "Coordonnée X (Est)",
    addVertexY: "Coordonnée Y (Nord)",
    addVertexBtn: "Ajouter Sommet",
    alignmentsTableTitle: "Tableau des Alignements",
    thSegment: "Segment",
    thDistance: "Longueur",
    helpTitle: "Présentation & Aide Tactile",
    helpBody: "Cette plateforme interactive vous permet de glisser et déplacer les bornes et d'éditer les longueurs directement sur la carte. Le tableau des coordonnées et les données se synchronisent automatiquement avant l'impression finale.",
    placeholderVoisin: "écrire le voisin (ex: Route, Titre...)"
  }
};
