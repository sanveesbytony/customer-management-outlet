// Safe Storage helper (prevents iframe SecurityError crashes)
const SafeStorage = {
  getItem: function (k) {
    try { return sessionStorage.getItem(k); } catch (e) { return null; }
  },
  setItem: function (k, v) {
    try { sessionStorage.setItem(k, v); } catch (e) { }
  },
  removeItem: function (k) {
    try { sessionStorage.removeItem(k); } catch (e) { }
  },
  getLocal: function (k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  },
  setLocal: function (k, v) {
    try { localStorage.setItem(k, v); } catch (e) { }
  }
};
window.SafeStorage = SafeStorage;

// High-Capacity Persistent Local Cache (IndexedDB for instant 0ms app & admin load)
const Pos2inLocalCache = {
  dbPromise: null,
  getDB: function () {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') return resolve(null);
        try {
          const req = indexedDB.open('pos2in_local_store_v1', 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('cache')) {
              db.createObjectStore('cache');
            }
          };
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  },
  get: async function (key) {
    try {
      const db = await this.getDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction('cache', 'readonly');
        const store = tx.objectStore('cache');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  },
  set: async function (key, value) {
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      store.put(value, key);
    } catch (e) { }
  }
};
window.Pos2inLocalCache = Pos2inLocalCache;

const DEFAULT_SETTINGS = {
  branches: ['Main Branch', 'Dhanmondi Outlet', 'Gulshan Outlet', 'Uttara Outlet', 'Online Store'],
  branchPasswords: {
    'Main Branch': 'mainbranch19',
    'Dhanmondi Outlet': 'dhanmondioutlet24',
    'Gulshan Outlet': 'gulshanoutlet18',
    'Uttara Outlet': 'uttaraoutlet35',
    'Online Store': 'onlinestore99'
  },
  failedLogins: {},
  currencySymbol: '৳',
  vipThreshold: 15000,
  regularThreshold: 5000,
  inactiveDays: 60,
  adminConfig: {
    username: 'admin',
    password: 'pos2in@admin2026',
    updatedAt: new Date().toISOString()
  }
};

const AppState = {
  customers: {},
  transactionsSummary: {},
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  auth: {
    isLoggedIn: false,
    role: null, // 'admin' | 'branch'
    branch: null, // 'Gulshan Outlet' | 'ALL'
    username: null,
    token: null,
    loginTime: 0
  },
  branchSecurity: [], // populated for Admin
  filters: {
    // Dashboard filters
    datePreset: 'all',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    specificMonth: '',
    specificYear: '2025',
    branch: 'ALL',

    // Customer tab filters
    customerDatePreset: 'all',
    customerStartDate: null,
    customerEndDate: null,
    customerMonth: '',
    customerYear: '2025',
    customerBranch: 'ALL',
    tier: 'ALL',
    searchQuery: '',
    sortBy: 'spend_desc',
    viewMode: 'cards'
  },
  pagination: {
    page: 1,
    pageSize: 50,
    totalPages: 1
  },
  currentFilteredCustomers: [],
  parsedImportInvoices: [],
  selectedCustomer: null,
  charts: {
    salesTrend: null,
    branchPie: null,
    segmentPie: null
  }
};

// Embedded Google Firebase Cloud Firestore Configuration
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAp7UNUNbvHp6z07GYBRm9sFuzq729ja-A",
  authDomain: "pos2in-customer-data.firebaseapp.com",
  databaseURL: "https://pos2in-customer-data-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pos2in-customer-data",
  storageBucket: "pos2in-customer-data.firebasestorage.app",
  messagingSenderId: "1025310561476",
  appId: "1:1025310561476:web:39a7d841c531425a75e591",
  measurementId: "G-MW69104CDT"
};

window.AppState = AppState;
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

/**
 * ===============================================================
 * GOOGLE FIREBASE CLOUD REAL-TIME DATABASE & FIRESTORE MODULE
 * ===============================================================
 */
function sanitizeFirebaseKey(raw) {
  if (!raw) return 'CUST_' + Math.floor(Math.random() * 1000000);
  return String(raw).trim().replace(/[\.\$#\[\]\/\s]+/g, '_').replace(/_+/g, '_');
}

const FirebaseEngine = {
  app: null,
  rtdb: null,
  db: null,
  isConnected: false,
  unsubscribeCustomers: null,
  unsubscribeSettings: null,

  init: function () {
    try {
      const config = FIREBASE_CONFIG;
      if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK not loaded, falling back to REST');
        this.updateStatusUI('connected', 'Connected: pos2in-customer-data (REST Cloud)');
        this.fetchSettings();
        this.fetchInitialDataRest();
        return true;
      }

      if (!firebase.apps || !firebase.apps.length) {
        this.app = firebase.initializeApp(config);
      } else {
        this.app = firebase.app();
      }

      // 1. Initialize Realtime Database (Primary ultra-fast store)
      if (typeof firebase.database === 'function') {
        try {
          this.rtdb = firebase.database();
        } catch (e) {
          console.warn('RTDB init warning:', e);
        }
      }

      // 2. Initialize Firestore (Secondary / fallback)
      if (typeof firebase.firestore === 'function') {
        try {
          this.db = firebase.firestore();
        } catch (e) {
          console.warn('Firestore init warning:', e);
        }
      }

      this.isConnected = true;
      this.updateStatusUI('connected', 'Connected: pos2in-customer-data (Realtime Cloud)');
      setSyncStatus('ready', 'Connected (Firebase Cloud)');

      this.fetchSettings();
      this.startListeners();
      this.fetchInitialDataRest();
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      this.updateStatusUI('connected', 'Connected: pos2in-customer-data (REST Fallback)');
      this.fetchSettings();
      this.fetchInitialDataRest();
      return true;
    }
  },

  updateStatusUI: function (state, label) {
    const pill = document.getElementById('firebase-status-pill');
    const text = document.getElementById('firebase-status-text');
    if (!pill || !text) return;

    text.innerText = label;
    if (state === 'connected') {
      pill.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 shadow-sm';
    } else if (state === 'error') {
      pill.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300 shadow-sm';
    } else {
      pill.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 shadow-sm';
    }
  },

  fetchSettings: async function () {
    try {
      const dbUrl = (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) ? FIREBASE_CONFIG.databaseURL : 'https://pos2in-customer-data-default-rtdb.asia-southeast1.firebasedatabase.app';
      const resp = await fetch(`${dbUrl}/settings.json`, { cache: 'no-cache' });
      if (resp.ok) {
        const data = await resp.json();
        if (data && typeof data === 'object') {
          AppState.settings = Object.assign({}, DEFAULT_SETTINGS, data);
          Pos2inLocalCache.set('settings', AppState.settings);
          if (!AppState.settings.adminConfig) {
            AppState.settings.adminConfig = Object.assign({}, DEFAULT_SETTINGS.adminConfig);
            this.saveSettingsDoc(AppState.settings);
          }
          if (!AppState.settings.branchPasswords) {
            AppState.settings.branchPasswords = Object.assign({}, DEFAULT_SETTINGS.branchPasswords);
            this.saveSettingsDoc(AppState.settings);
          }
          populateBranchDropdowns();
          populateLoginBranchSelect();
          onLoginBranchChanged();
          syncSettingsToInputs();
          if (AppState.auth && AppState.auth.role === 'admin') {
            loadBranchSecurityData();
          }
          return;
        }
      }
      // Seed defaults to Firebase if no settings exist
      console.info('Initializing default settings in Firebase Cloud...');
      await this.saveSettingsDoc(AppState.settings);
      populateBranchDropdowns();
      populateLoginBranchSelect();
    } catch (e) {
      console.warn('Error fetching settings from Firebase:', e);
    }
  },

  fetchInitialDataRest: async function () {
    try {
      const dbUrl = (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) ? FIREBASE_CONFIG.databaseURL : 'https://pos2in-customer-data-default-rtdb.asia-southeast1.firebasedatabase.app';
      const resp = await fetch(`${dbUrl}/customers.json`, { cache: 'no-cache' });
      if (resp.ok) {
        const data = await resp.json();
        if (data && typeof data === 'object') {
          AppState.customers = data;
          Pos2inLocalCache.set('customers', data);
          recalculateAllCustomerMetrics(AppState.customers, AppState.settings);
          onDataLoaded();

          const docCountEl = document.getElementById('firestore-doc-count');
          if (docCountEl) {
            let invCount = 0;
            Object.values(data).forEach(c => invCount += (c.purchases || []).length);
            docCountEl.innerText = `${Object.keys(data).length} Profiles (${invCount} Invoices)`;
          }
        }
      }
    } catch (err) {
      console.warn('Initial REST sync error:', err);
    }
  },

  startListeners: function () {
    // 1. Live Realtime Database Listeners
    if (this.rtdb) {
      try {
        this.rtdb.ref('customers').on('value', snapshot => {
          const loaded = snapshot.val() || {};
          if (Object.keys(loaded).length > 0) {
            AppState.customers = loaded;
            Pos2inLocalCache.set('customers', loaded);
            recalculateAllCustomerMetrics(AppState.customers, AppState.settings);
            onDataLoaded();

            const docCountEl = document.getElementById('firestore-doc-count');
            if (docCountEl) {
              let invCount = 0;
              Object.values(loaded).forEach(c => invCount += (c.purchases || []).length);
              docCountEl.innerText = `${Object.keys(loaded).length} Profiles (${invCount} Invoices)`;
            }
          }
        }, error => {
          console.warn('RTDB customers listener warning:', error);
        });

        this.rtdb.ref('settings').on('value', snapshot => {
          const data = snapshot.val();
          if (data && typeof data === 'object') {
            AppState.settings = Object.assign({}, DEFAULT_SETTINGS, data);
            populateBranchDropdowns();
            populateLoginBranchSelect();
            onLoginBranchChanged();
            syncSettingsToInputs();
            if (AppState.auth && AppState.auth.role === 'admin') {
              loadBranchSecurityData();
            }
          }
        }, error => {
          console.warn('RTDB settings listener warning:', error);
        });
      } catch (e) {
        console.warn('RTDB listener setup warning:', e);
      }
    }

    // 2. Firestore Listeners (if enabled)
    if (this.db) {
      try {
        if (this.unsubscribeCustomers) this.unsubscribeCustomers();
        this.unsubscribeCustomers = this.db.collection('customers').onSnapshot(snapshot => {
          const loaded = {};
          let totalInvoicesCount = 0;
          snapshot.forEach(doc => {
            const data = doc.data();
            const key = doc.id;
            loaded[key] = data;
            if (data.purchases && Array.isArray(data.purchases)) {
              totalInvoicesCount += data.purchases.length;
            }
          });

          if (Object.keys(loaded).length > 0) {
            AppState.customers = loaded;
            recalculateAllCustomerMetrics(AppState.customers, AppState.settings);
            onDataLoaded();
          }
        }, err => { });

        if (this.unsubscribeSettings) this.unsubscribeSettings();
        this.unsubscribeSettings = this.db.collection('settings').doc('config').onSnapshot(doc => {
          if (doc.exists) {
            const data = doc.data();
            if (data && typeof data === 'object') {
              AppState.settings = Object.assign({}, DEFAULT_SETTINGS, data);
              populateBranchDropdowns();
              populateLoginBranchSelect();
              onLoginBranchChanged();
              syncSettingsToInputs();
              if (AppState.auth && AppState.auth.role === 'admin') {
                loadBranchSecurityData();
              }
            }
          }
        }, err => { });
      } catch (e) { }
    }
  },

  saveImportBatch: async function (targetBranch, rawRecords, onProgress) {
    const invoiceMap = {};
    rawRecords.forEach(rec => {
      const invNo = getRecordField(rec, 'invoiceNo', 'Invoice No', 'InvoiceNo', 'billNo', 'Bill No', 'BillNo', 'invoice', 'voucherNo', 'Voucher No');
      if (!invNo) return;

      const rawDate = getRecordField(rec, 'salesDate', 'Sales Date', 'Date', 'date', 'invoiceDate', 'Invoice Date', 'Bill Date');
      const formattedDate = normalizePos2inDate(rawDate);

      const rawCustomer = getRecordField(rec, 'customer', 'Customer', 'customerName', 'Customer Name', 'CustomerName', 'name', 'clientName');
      const customerName = formatCustomerName(rawCustomer);

      const rawPhone = getRecordField(rec, 'phone', 'Phone', 'mobile', 'Mobile', 'contact', 'Contact', 'phoneNumber', 'Phone Number', 'cell');
      const phone = normalizePos2inPhone(rawPhone);

      const rowBranch = getRecordField(rec, 'branch', 'Branch', 'salesPoint', 'Sales Point');
      const branch = (targetBranch && targetBranch !== 'AUTO') ? targetBranch : (rowBranch || 'Main Branch');
      const salesStaff = getRecordField(rec, 'salesStaff', 'Sales Staff', 'staff', 'Staff', 'servedBy');
      const subCategory = getRecordField(rec, 'subCategory', 'Sub Category', 'category', 'Category');
      const productModel = getRecordField(rec, 'productModel', 'Product Model/Name', 'Product Model', 'items', 'Items', 'itemName', 'Item Name') || 'Item';

      const qty = parseNumber(getRecordField(rec, 'quantity', 'Quantity', 'qty', 'Qty')) || 1;
      const subTotal = parseNumber(getRecordField(rec, 'subTotal', 'Sub Total', 'sellingPrice', 'Selling Price', 'grossAmount', 'Gross Amount', 'grossTotal'));
      const discount = parseNumber(getRecordField(rec, 'discount', 'Discount', 'Discount (Tk)', 'discountTk'));
      const netPayable = parseNumber(getRecordField(rec, 'netPayable', 'Net Payable', 'netAmount', 'Net Amount', 'paid', 'Paid', 'amount', 'totalAmount')) || subTotal;
      const itemDesc = `${productModel}${subCategory ? ' (' + subCategory + ')' : ''} [x${qty}]`;

      if (!invoiceMap[invNo]) {
        invoiceMap[invNo] = {
          invoiceNo: invNo,
          date: formattedDate,
          customerName: customerName,
          phone: phone,
          branch: branch,
          salesStaff: salesStaff,
          netAmount: netPayable > 0 ? netPayable : subTotal,
          discount: discount,
          itemsList: [itemDesc],
          itemCount: qty
        };
      } else {
        const inv = invoiceMap[invNo];
        inv.itemsList.push(itemDesc);
        inv.itemCount += qty;
        if (customerName !== 'Walk-in Customer' && inv.customerName === 'Walk-in Customer') inv.customerName = customerName;
        if (phone && !inv.phone) inv.phone = phone;
      }
    });

    const customers = Object.assign({}, AppState.customers);
    const touchedKeys = new Set();
    const rtdbUpdates = {};
    let importedInvoicesCount = 0;
    let totalImportAmount = 0;

    Object.keys(invoiceMap).forEach(invNo => {
      const inv = invoiceMap[invNo];
      const rawLookup = inv.phone || (inv.customerName !== 'Walk-in Customer' ? 'NAME_' + inv.customerName.toLowerCase().replace(/\s+/g, '_') : 'INV_' + invNo);
      const lookupKey = sanitizeFirebaseKey(rawLookup);
      touchedKeys.add(lookupKey);

      if (!customers[lookupKey]) {
        customers[lookupKey] = {
          id: inv.phone ? ('CUST-' + inv.phone.slice(-6)) : ('CUST-' + Math.floor(Math.random() * 90000 + 10000)),
          name: inv.customerName,
          phone: inv.phone,
          email: '',
          firstPurchaseDate: inv.date,
          lastPurchaseDate: inv.date,
          totalSpend: 0,
          totalVisits: 0,
          averageOrderValue: 0,
          primaryBranch: inv.branch,
          branchVisits: {},
          tier: 'New Customer',
          purchases: []
        };
      }

      const cust = customers[lookupKey];
      if (inv.customerName !== 'Walk-in Customer' && cust.name === 'Walk-in Customer') cust.name = inv.customerName;
      if (inv.phone && !cust.phone) cust.phone = inv.phone;

      const existingIdx = cust.purchases.findIndex(p => p.invoiceNo === invNo);
      const itemsSummary = inv.itemsList.join(' + ');
      const purchaseEntry = {
        invoiceNo: invNo,
        date: inv.date,
        branch: inv.branch,
        amount: inv.netAmount,
        discount: inv.discount,
        salesStaff: inv.salesStaff,
        items: itemsSummary
      };

      if (existingIdx >= 0) {
        cust.purchases[existingIdx] = purchaseEntry;
      } else {
        cust.purchases.push(purchaseEntry);
      }

      cust.branchVisits[inv.branch] = (cust.branchVisits[inv.branch] || 0) + 1;
      importedInvoicesCount++;
      totalImportAmount += inv.netAmount;
    });

    recalculateAllCustomerMetrics(customers, AppState.settings);

    // Prepare Realtime Database atomic update payload
    touchedKeys.forEach(k => {
      rtdbUpdates[k] = customers[k];
    });

    // 1. Commit to Firebase Realtime Database (Primary)
    const dbUrl = (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) ? FIREBASE_CONFIG.databaseURL : 'https://pos2in-customer-data-default-rtdb.asia-southeast1.firebasedatabase.app';
    let savedToCloud = false;

    if (this.rtdb) {
      try {
        await this.rtdb.ref('customers').update(rtdbUpdates);
        savedToCloud = true;
      } catch (e) {
        console.warn('RTDB SDK update failed, trying REST:', e);
      }
    }

    if (!savedToCloud) {
      try {
        const patchRes = await fetch(`${dbUrl}/customers.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rtdbUpdates)
        });
        if (patchRes.ok) savedToCloud = true;
      } catch (e) {
        console.warn('RTDB REST update error:', e);
      }
    }

    // 2. Sync to Firestore in background (non-blocking)
    if (this.db) {
      try {
        const touchedArray = Array.from(touchedKeys);
        const BATCH_SIZE = 300;
        for (let i = 0; i < touchedArray.length; i += BATCH_SIZE) {
          const slice = touchedArray.slice(i, i + BATCH_SIZE);
          const batch = this.db.batch();
          slice.forEach(k => {
            const docRef = this.db.collection('customers').doc(k);
            batch.set(docRef, customers[k], { merge: true });
          });
          batch.commit().catch(() => { });
        }
      } catch (e) { }
    }

    if (onProgress) onProgress(touchedKeys.size, touchedKeys.size);

    AppState.customers = customers;
    return {
      success: true,
      importedInvoices: importedInvoicesCount,
      totalAmount: totalImportAmount,
      totalCustomers: Object.keys(customers).length
    };
  },

  deleteRecords: async function (criteria) {
    const customers = Object.assign({}, AppState.customers);
    const modifiedKeys = [];
    const deletedKeys = [];
    let deletedInvoicesCount = 0;
    let deletedCustomersCount = 0;

    const branchFilter = criteria.branch || 'ALL';
    const startDate = criteria.startDate || null;
    const endDate = criteria.endDate || null;
    const customerKey = criteria.customerKey ? criteria.customerKey.trim().toLowerCase() : null;
    const invoiceNo = criteria.invoiceNo ? criteria.invoiceNo.trim().toLowerCase() : null;
    const isDeleteCustomerProfile = criteria.deleteCustomerProfile === true;

    Object.keys(customers).forEach(key => {
      const cust = customers[key];
      const matchCustomer = customerKey && (
        key.toLowerCase() === customerKey ||
        (cust.phone && cust.phone.toLowerCase().includes(customerKey)) ||
        (cust.name && cust.name.toLowerCase().includes(customerKey)) ||
        (cust.id && cust.id.toLowerCase() === customerKey)
      );

      if (isDeleteCustomerProfile && matchCustomer) {
        deletedInvoicesCount += (cust.purchases || []).length;
        deletedKeys.push(key);
        delete customers[key];
        deletedCustomersCount++;
        return;
      }

      const originalCount = (cust.purchases || []).length;
      cust.purchases = (cust.purchases || []).filter(p => {
        if (invoiceNo && (p.invoiceNo.toLowerCase() === invoiceNo || p.invoiceNo.toLowerCase().includes(invoiceNo))) return false;
        if (customerKey && !matchCustomer) return true;
        if (branchFilter !== 'ALL' && p.branch !== branchFilter) return true;
        if (startDate && p.date < startDate) return true;
        if (endDate && p.date > endDate) return true;
        return false;
      });

      const removedForThisCust = originalCount - cust.purchases.length;
      deletedInvoicesCount += removedForThisCust;

      if (cust.purchases.length === 0) {
        deletedKeys.push(key);
        delete customers[key];
        deletedCustomersCount++;
      } else if (removedForThisCust > 0) {
        cust.branchVisits = {};
        cust.purchases.forEach(p => {
          cust.branchVisits[p.branch] = (cust.branchVisits[p.branch] || 0) + 1;
        });
        modifiedKeys.push(key);
      }
    });

    recalculateAllCustomerMetrics(customers, AppState.settings);

    // Update Realtime Database
    const rtdbPayload = {};
    deletedKeys.forEach(k => rtdbPayload[k] = null);
    modifiedKeys.forEach(k => rtdbPayload[k] = customers[k]);

    const dbUrl = (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) ? FIREBASE_CONFIG.databaseURL : 'https://pos2in-customer-data-default-rtdb.asia-southeast1.firebasedatabase.app';
    if (this.rtdb) {
      try {
        await this.rtdb.ref('customers').update(rtdbPayload);
      } catch (e) {
        fetch(`${dbUrl}/customers.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rtdbPayload) }).catch(() => { });
      }
    } else {
      fetch(`${dbUrl}/customers.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rtdbPayload) }).catch(() => { });
    }

    // Firestore sync in background
    if (this.db) {
      try {
        const batch = this.db.batch();
        deletedKeys.forEach(k => batch.delete(this.db.collection('customers').doc(k)));
        modifiedKeys.forEach(k => batch.set(this.db.collection('customers').doc(k), customers[k]));
        batch.commit().catch(() => { });
      } catch (e) { }
    }

    AppState.customers = customers;
    return {
      success: true,
      deletedInvoices: deletedInvoicesCount,
      deletedCustomers: deletedCustomersCount,
      remainingCustomers: Object.keys(customers).length
    };
  },

  saveCustomer: async function (cust) {
    if (!cust) return;
    const rawKey = cust.phone || (cust.name ? 'NAME_' + cust.name : cust.id);
    const key = sanitizeFirebaseKey(rawKey);
    AppState.customers[key] = cust;

    const dbUrl = (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) ? FIREBASE_CONFIG.databaseURL : 'https://pos2in-customer-data-default-rtdb.asia-southeast1.firebasedatabase.app';
    if (this.rtdb) {
      try {
        await this.rtdb.ref(`customers/${key}`).set(cust);
      } catch (e) {
        fetch(`${dbUrl}/customers/${key}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cust) }).catch(() => { });
      }
    } else {
      fetch(`${dbUrl}/customers/${key}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cust) }).catch(() => { });
    }

    if (this.db) {
      try {
        this.db.collection('customers').doc(key).set(cust, { merge: true }).catch(() => { });
      } catch (e) { }
    }
  },

  saveSettingsDoc: async function (settingsObj) {
    const dbUrl = (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) ? FIREBASE_CONFIG.databaseURL : 'https://pos2in-customer-data-default-rtdb.asia-southeast1.firebasedatabase.app';
    if (this.rtdb) {
      try {
        await this.rtdb.ref('settings').set(settingsObj);
      } catch (e) {
        fetch(`${dbUrl}/settings.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settingsObj) }).catch(() => { });
      }
    } else {
      fetch(`${dbUrl}/settings.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settingsObj) }).catch(() => { });
    }

    if (this.db) {
      try {
        this.db.collection('settings').doc('config').set(settingsObj, { merge: true }).catch(() => { });
      } catch (e) { }
    }
  }
};

window.FirebaseEngine = FirebaseEngine;
window.AppState = AppState;

function getActiveBranches() {
  if (AppState.settings && Array.isArray(AppState.settings.branches) && AppState.settings.branches.length > 0) {
    const filtered = AppState.settings.branches.filter(b => typeof b === 'string' && b.trim().length > 0);
    if (filtered.length > 0) return filtered;
  }
  return ['Main Branch', 'Dhanmondi Outlet', 'Gulshan Outlet', 'Uttara Outlet', 'Online Store'];
}

/**
 * ===============================================================
 * STARTUP LIFECYCLE & AUTHENTICATION ENGINE
 * ===============================================================
 */
async function initApp() {
  initTheme();
  initDateInputs();

  // 1. Populate initial branch dropdowns right away
  populateBranchDropdowns();
  populateLoginBranchSelect();

  // 2. Initialize Authentication
  initAuth();

  // 3. Instant Cache Hydration (0ms local startup without waiting for network roundtrip)
  try {
    const cachedSettings = await Pos2inLocalCache.get('settings');
    if (cachedSettings && typeof cachedSettings === 'object') {
      AppState.settings = Object.assign({}, DEFAULT_SETTINGS, cachedSettings);
      populateBranchDropdowns();
      syncSettingsToInputs();
    }

    const cachedCustomers = await Pos2inLocalCache.get('customers');
    if (cachedCustomers && typeof cachedCustomers === 'object' && Object.keys(cachedCustomers).length > 0) {
      AppState.customers = cachedCustomers;
      recalculateAllCustomerMetrics(AppState.customers, AppState.settings);
      onDataLoaded();
    }
  } catch (e) { }

  // 4. Initialize Firebase Cloud Connection in non-blocking background
  try {
    FirebaseEngine.init();
  } catch (e) {
    console.warn('FirebaseEngine non-blocking init warning:', e);
  }

  // Initial render
  onDataLoaded();
}

function initAuth() {
  // Populate login branch dropdown
  populateLoginBranchSelect();

  // Check session storage safely
  try {
    const savedAuth = SafeStorage.getItem('pos2in_auth');
    if (savedAuth) {
      const parsed = JSON.parse(savedAuth);
      if (parsed && parsed.isLoggedIn && parsed.role) {
        AppState.auth = parsed;
        updateAuthUI();
        hideLoginScreen();
        if (AppState.auth.role === 'admin') {
          loadBranchSecurityData();
        }
        return;
      }
    }
  } catch (e) { }

  // If not logged in, show login overlay
  showLoginScreen();
}

function showLoginScreen() {
  const overlay = document.getElementById('login-screen') || document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
  }
  populateLoginBranchSelect();
  onLoginBranchChanged();
}

function hideLoginScreen() {
  const overlay = document.getElementById('login-screen') || document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
  }
}

function switchLoginMode(mode) {
  const tabBranch = document.getElementById('tab-login-branch');
  const tabAdmin = document.getElementById('tab-login-admin');
  const formBranch = document.getElementById('branch-login-form');
  const formAdmin = document.getElementById('admin-login-form');

  if (mode === 'branch') {
    if (tabBranch) {
      tabBranch.className = 'py-2.5 rounded-xl text-xs font-bold transition-all bg-brand-600 text-white shadow flex items-center justify-center gap-1.5 cursor-pointer';
    }
    if (tabAdmin) {
      tabAdmin.className = 'py-2.5 rounded-xl text-xs font-bold transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center justify-center gap-1.5 cursor-pointer';
    }
    if (formBranch) {
      formBranch.classList.remove('hidden');
      formBranch.style.display = 'block';
    }
    if (formAdmin) {
      formAdmin.classList.add('hidden');
      formAdmin.style.display = 'none';
    }
    populateLoginBranchSelect();
    onLoginBranchChanged();
  } else {
    if (tabAdmin) {
      tabAdmin.className = 'py-2.5 rounded-xl text-xs font-bold transition-all bg-brand-600 text-white shadow flex items-center justify-center gap-1.5 cursor-pointer';
    }
    if (tabBranch) {
      tabBranch.className = 'py-2.5 rounded-xl text-xs font-bold transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center justify-center gap-1.5 cursor-pointer';
    }
    if (formBranch) {
      formBranch.classList.add('hidden');
      formBranch.style.display = 'none';
    }
    if (formAdmin) {
      formAdmin.classList.remove('hidden');
      formAdmin.style.display = 'block';
    }
  }
}
window.switchLoginMode = switchLoginMode;

function populateLoginBranchSelect() {
  const sel = document.getElementById('login-branch-select');
  if (!sel) return;
  const branches = getActiveBranches();
  const currentVal = sel.value;
  sel.innerHTML = '';
  branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    opt.className = 'bg-slate-900 text-white dark:bg-slate-900 dark:text-white py-1';
    sel.appendChild(opt);
  });
  if (currentVal && branches.includes(currentVal)) {
    sel.value = currentVal;
  } else if (branches.length > 0) {
    sel.value = branches[0];
  }
}

function onLoginBranchChanged() {
  const sel = document.getElementById('login-branch-select');
  const blockedBanner = document.getElementById('login-branch-blocked-banner');
  const submitBtn = document.getElementById('btn-branch-login-submit');
  const attemptsRemaining = document.getElementById('login-attempts-remaining');

  if (!sel) return;
  const branchName = sel.value;
  const failedMap = AppState.settings.failedLogins || {};
  const branchLockInfo = failedMap[branchName];
  const failedAttempts = branchLockInfo ? (branchLockInfo.count || branchLockInfo.attempts || 0) : 0;
  const isBlocked = branchLockInfo && (branchLockInfo.blocked === true || failedAttempts >= 5);

  if (isBlocked) {
    if (blockedBanner) {
      blockedBanner.classList.remove('hidden');
      if (!document.getElementById('btn-emergency-admin-switch')) {
        const emergencyBtn = document.createElement('button');
        emergencyBtn.id = 'btn-emergency-admin-switch';
        emergencyBtn.type = 'button';
        emergencyBtn.className = 'mt-2 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5';
        emergencyBtn.innerHTML = '<svg class="svg-icon w-3 h-3" viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5 1 6.5L12 17l-5.5 3 1-6.5L3 9l6-1z"/></svg> Switch to Admin Login to Unlock';
        emergencyBtn.onclick = function () { switchLoginMode('admin'); };
        blockedBanner.appendChild(emergencyBtn);
      }
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    if (attemptsRemaining) attemptsRemaining.classList.add('hidden');
  } else {
    if (blockedBanner) {
      blockedBanner.classList.add('hidden');
      const eb = document.getElementById('btn-emergency-admin-switch');
      if (eb) eb.remove();
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    if (attemptsRemaining) {
      if (failedAttempts > 0) {
        attemptsRemaining.innerText = `${5 - failedAttempts} attempts remaining`;
        attemptsRemaining.classList.remove('hidden');
      } else {
        attemptsRemaining.classList.add('hidden');
      }
    }
  }
}

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.innerHTML = '<svg class="svg-icon w-4 h-4" viewBox="0 0 24 24"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
  } else {
    input.type = 'password';
    if (icon) icon.innerHTML = '<svg class="svg-icon w-4 h-4" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
}

async function handleBranchLoginSubmit() {
  const sel = document.getElementById('login-branch-select');
  const pwInput = document.getElementById('login-branch-password');
  const branchName = sel ? sel.value.trim() : '';
  const password = pwInput ? pwInput.value.trim() : '';

  if (!branchName) {
    showToast('Please select a branch', 'error');
    return;
  }
  if (!password) {
    showToast('Please enter your branch password', 'error');
    return;
  }

  if (!AppState.settings.failedLogins) AppState.settings.failedLogins = {};
  const currentLock = AppState.settings.failedLogins[branchName] || { count: 0, blocked: false };
  const currentAttempts = currentLock.count || currentLock.attempts || 0;

  if (currentLock.blocked || currentAttempts >= 5) {
    showToast('This branch is currently BLOCKED. Please contact Super Admin to unlock.', 'error');
    onLoginBranchChanged();
    return;
  }

  const expectedPw = (AppState.settings.branchPasswords || {})[branchName] || (branchName.toLowerCase().replace(/[^a-z0-9]/g, '') + '19');

  if (password === expectedPw) {
    // Success: clear failed attempts
    if (AppState.settings.failedLogins[branchName]) {
      delete AppState.settings.failedLogins[branchName];
      if (typeof FirebaseEngine !== 'undefined') {
        FirebaseEngine.saveSettingsDoc(AppState.settings);
      }
    }

    AppState.auth = {
      isLoggedIn: true,
      role: 'branch',
      branch: branchName,
      token: 'branch-token-' + Date.now(),
      loginTime: Date.now()
    };
    SafeStorage.setItem('pos2in_auth', JSON.stringify(AppState.auth));
    showToast(`Logged in successfully as ${branchName}!`, 'success');
    if (pwInput) pwInput.value = '';

    // Set branch filters
    AppState.filters.branch = branchName;
    AppState.filters.customerBranch = branchName;

    // 1. Hide login overlay first
    hideLoginScreen();

    // 2. Update navigation & dropdowns
    updateAuthUI();
    populateBranchDropdowns();

    // 3. Render immediately and repaint charts
    onDataLoaded();
    setTimeout(() => {
      onDataLoaded();
    }, 60);

    const impBranch = document.getElementById('import-branch-select');
    if (impBranch) impBranch.value = branchName;
  } else {
    // Failed attempt
    const newCount = currentAttempts + 1;
    const isBlocked = newCount >= 5;
    AppState.settings.failedLogins[branchName] = {
      count: newCount,
      attempts: newCount,
      blocked: isBlocked,
      lastAttempt: new Date().toISOString()
    };

    if (typeof FirebaseEngine !== 'undefined') {
      FirebaseEngine.saveSettingsDoc(AppState.settings);
    }

    onLoginBranchChanged();

    if (isBlocked) {
      showToast('This branch has now been BLOCKED due to 5 failed login attempts!', 'error');
    } else {
      showToast(`Incorrect branch password. ${5 - newCount} attempts remaining.`, 'error');
    }
  }
}

function handleAdminLoginSubmit() {
  const userEl = document.getElementById('login-admin-username');
  const pwInput = document.getElementById('login-admin-password');
  const enteredUsername = userEl ? userEl.value.trim().toLowerCase() : '';
  const enteredPassword = pwInput ? pwInput.value.trim() : '';

  if (!enteredUsername) {
    showToast('Please enter admin username or email', 'error');
    return;
  }
  if (!enteredPassword) {
    showToast('Please enter admin password', 'error');
    return;
  }

  const adminCfg = AppState.settings.adminConfig || DEFAULT_SETTINGS.adminConfig;
  const expectedUser = (adminCfg.username || 'admin').toLowerCase();
  const expectedPass = adminCfg.password || 'pos2in@admin2026';

  const isUsernameMatch = (enteredUsername === expectedUser) || (expectedUser === 'admin' && enteredUsername === 'admin@pos2in.com');
  const isPasswordMatch = (enteredPassword === expectedPass);

  if (isUsernameMatch && isPasswordMatch) {
    AppState.auth = {
      isLoggedIn: true,
      role: 'admin',
      username: adminCfg.username || 'admin',
      branch: 'ALL',
      token: 'admin-token-' + Date.now(),
      loginTime: Date.now()
    };
    SafeStorage.setItem('pos2in_auth', JSON.stringify(AppState.auth));
    showToast('Admin authenticated successfully! Full privileges granted.', 'success');
    if (pwInput) pwInput.value = '';

    // Reset admin filters to ALL
    AppState.filters.branch = 'ALL';
    AppState.filters.customerBranch = 'ALL';
    const dashBranch = document.getElementById('filter-dashboard-branch');
    if (dashBranch) dashBranch.value = 'ALL';
    const custBranch = document.getElementById('filter-customer-branch');
    if (custBranch) custBranch.value = 'ALL';

    // 1. Hide login overlay first so viewport layout dimensions are active
    hideLoginScreen();

    // 2. Update navigation, privileges & branch dropdowns
    updateAuthUI();
    populateBranchDropdowns();

    // 3. Render immediately and schedule chart repaint after layout transition
    onDataLoaded();
    setTimeout(() => {
      onDataLoaded();
    }, 60);

    // 4. If data is still loading from cloud, trigger immediate fetch
    if (!AppState.customers || Object.keys(AppState.customers).length === 0) {
      setSyncStatus('syncing', 'Synchronizing with Firebase Cloud...');
      FirebaseEngine.fetchInitialDataRest().then(() => {
        onDataLoaded();
      });
    }

    loadBranchSecurityData();
  } else {
    showToast('Invalid admin username or password', 'error');
  }
}

function handleLogout() {
  if (!confirm('Are you sure you want to log out?')) return;
  AppState.auth = {
    isLoggedIn: false,
    role: null,
    branch: null,
    username: null,
    token: null,
    loginTime: 0
  };
  SafeStorage.removeItem('pos2in_auth');
  updateAuthUI();
  showLoginScreen();
  showToast('You have been logged out.', 'info');
}

function updateAuthUI() {
  const badge = document.getElementById('header-auth-badge');
  const roleText = document.getElementById('header-auth-role');
  const branchText = document.getElementById('header-auth-branch');
  const logoutBtn = document.getElementById('header-logout-btn');
  const roleIcon = document.getElementById('header-auth-role-icon');
  const nameEl = document.getElementById('header-auth-name');

  const isAdmin = AppState.auth && AppState.auth.role === 'admin';

  if (!AppState.auth || !AppState.auth.isLoggedIn) {
    if (badge) badge.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    return;
  }

  if (badge) badge.classList.remove('hidden');
  if (logoutBtn) logoutBtn.classList.remove('hidden');

  // Admin tabs: Import, Branches, Delete, Settings
  const adminOnlyTabs = ['nav-import', 'nav-branches', 'nav-delete', 'nav-settings',
    'mob-nav-import', 'mob-nav-branches', 'mob-nav-delete', 'mob-nav-settings'];
  adminOnlyTabs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isAdmin) {
      el.classList.remove('hidden');
      el.style.display = '';
    } else {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  });

  if (isAdmin) {
    if (roleText) roleText.textContent = 'Administrator';
    if (branchText) branchText.textContent = 'All Branches (Super)';
    if (nameEl) nameEl.textContent = AppState.auth.username || 'Admin';
    if (roleIcon) roleIcon.innerHTML = '<svg class="svg-icon w-3.5 h-3.5 text-amber-500 inline" viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5 1 6.5L12 17l-5.5 3 1-6.5L3 9l6-1z"/></svg>';
    if (badge) {
      badge.className = 'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-500/15 border border-brand-500/30 text-brand-700 dark:text-brand-300 whitespace-nowrap flex-shrink-0';
    }
  } else {
    const branchName = AppState.auth.branch || 'Store';
    if (roleText) roleText.textContent = 'Branch Staff';
    if (branchText) branchText.textContent = branchName;
    if (nameEl) nameEl.textContent = branchName;
    if (roleIcon) roleIcon.innerHTML = '<svg class="svg-icon w-3.5 h-3.5 text-brand-500 inline" viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M19 21v-4"/><path d="M19 17a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4"/><path d="M9 10h1"/><path d="M14 10h1"/><path d="M9 14h1"/><path d="M14 14h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>';
    if (badge) {
      badge.className = 'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-500/15 border border-brand-500/30 text-brand-600 dark:text-brand-300 whitespace-nowrap flex-shrink-0';
    }

    populateBranchDropdowns();
  }
}

/**
 * ===============================================================
 * BRANCH SECURITY & PASSWORDS (ADMIN ONLY)
 * ===============================================================
 */
function loadBranchSecurityData() {
  if (!AppState.auth || AppState.auth.role !== 'admin') return;

  const branches = getActiveBranches();
  const list = branches.map(b => {
    const pass = (AppState.settings.branchPasswords || {})[b] || (b.toLowerCase().replace(/[^a-z0-9]/g, '') + '19');
    const lock = (AppState.settings.failedLogins || {})[b] || { count: 0, blocked: false };
    const failedCount = lock.count || lock.attempts || 0;
    return {
      name: b,
      password: pass,
      failedAttempts: failedCount,
      isBlocked: lock.blocked === true || failedCount >= 5
    };
  });
  AppState.branchSecurity = list;
  renderBranchSecurityStats();
  renderBranchManager();
}

function renderBranchSecurityStats() {
  const totalBranchesEl = document.getElementById('sec-stat-total-branches');
  const blockedCountEl = document.getElementById('sec-stat-blocked-count');
  const list = AppState.branchSecurity || [];
  if (totalBranchesEl) totalBranchesEl.textContent = list.length;
  if (blockedCountEl) {
    const blocked = list.filter(b => b.isBlocked);
    if (blocked.length > 0) {
      blockedCountEl.innerHTML = `<span class="text-rose-500 font-bold">${blocked.length} Outlets Blocked</span>`;
    } else {
      blockedCountEl.innerHTML = `<span class="text-emerald-500 font-bold">All Outlets Active</span>`;
    }
  }
}

function openEditBranchPasswordModal(branchName) {
  const modal = document.getElementById('edit-branch-password-modal');
  const nameEl = document.getElementById('edit-pw-branch-name');
  const targetInput = document.getElementById('edit-pw-branch-target');
  const valInput = document.getElementById('edit-branch-password-input');

  if (nameEl) nameEl.textContent = branchName;
  if (targetInput) targetInput.value = branchName;
  if (valInput) {
    const item = (AppState.branchSecurity || []).find(b => b.name === branchName);
    const existing = (AppState.settings.branchPasswords || {})[branchName];
    if (existing) {
      valInput.value = existing;
    } else if (item && item.password) {
      valInput.value = item.password;
    } else {
      const clean = branchName.toLowerCase().replace(/[^a-z0-9]/g, '');
      valInput.value = clean + Math.floor(10 + Math.random() * 90);
    }
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function autoGenerateInModal() {
  const targetInput = document.getElementById('edit-pw-branch-target');
  const valInput = document.getElementById('edit-branch-password-input');
  const branchName = targetInput ? targetInput.value : '';
  if (!branchName) {
    showToast('No branch selected', 'error');
    return;
  }
  const clean = branchName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rand2 = Math.floor(10 + Math.random() * 90);
  const newPw = clean + rand2;
  if (valInput) {
    valInput.value = newPw;
  }
  showToast(`Auto-generated: ${newPw}`, 'info');
}

function closeEditBranchPasswordModal() {
  const modal = document.getElementById('edit-branch-password-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function submitEditBranchPassword() {
  const targetInput = document.getElementById('edit-pw-branch-target');
  const valInput = document.getElementById('edit-branch-password-input');
  const branchName = targetInput ? targetInput.value : '';
  const newPassword = valInput ? valInput.value.trim() : '';

  if (!branchName || !newPassword) {
    showToast('Password cannot be empty', 'error');
    return;
  }

  if (!AppState.settings.branchPasswords) AppState.settings.branchPasswords = {};
  AppState.settings.branchPasswords[branchName] = newPassword;

  if (AppState.branchSecurity) {
    const item = AppState.branchSecurity.find(b => b.name === branchName);
    if (item) item.password = newPassword;
  }

  if (typeof FirebaseEngine !== 'undefined') {
    FirebaseEngine.saveSettingsDoc(AppState.settings);
  }

  showToast(`Password updated for "${branchName}"!`, 'success');
  closeEditBranchPasswordModal();
  loadBranchSecurityData();
}

function handleRegenerateBranchPassword(branchName) {
  if (!confirm(`Regenerate default password for "${branchName}" (e.g. name + 2 random digits)?`)) return;

  const clean = branchName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rand = Math.floor(10 + Math.random() * 90);
  const newPw = clean + rand;

  if (!AppState.settings.branchPasswords) AppState.settings.branchPasswords = {};
  AppState.settings.branchPasswords[branchName] = newPw;

  if (typeof FirebaseEngine !== 'undefined') {
    FirebaseEngine.saveSettingsDoc(AppState.settings);
  }

  showToast(`New password for ${branchName}: ${newPw}`, 'success');
  loadBranchSecurityData();
}

function handleUnlockBranch(branchName) {
  if (!AppState.settings.failedLogins) AppState.settings.failedLogins = {};
  delete AppState.settings.failedLogins[branchName];

  if (typeof FirebaseEngine !== 'undefined') {
    FirebaseEngine.saveSettingsDoc(AppState.settings);
  }

  showToast(`${branchName} has been unlocked!`, 'success');
  loadBranchSecurityData();
  onLoginBranchChanged();
}

function handleUnlockAllBranches() {
  if (!confirm('Clear ALL branch lockouts? This will re-enable login for every blocked branch.')) return;

  AppState.settings.failedLogins = {};

  if (typeof FirebaseEngine !== 'undefined') {
    FirebaseEngine.saveSettingsDoc(AppState.settings);
  }

  showToast('All branch lockouts cleared!', 'success');
  loadBranchSecurityData();
  onLoginBranchChanged();
}

function toggleBranchCardPw(domSafeName, pw) {
  const el = document.getElementById('pw-text-' + domSafeName);
  if (!el) return;
  if (el.textContent.trim() === '••••••••') {
    el.textContent = pw;
  } else {
    el.textContent = '••••••••';
  }
}

function copyToClipboard(text, msg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(msg || 'Copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy', 'error');
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(msg || 'Copied to clipboard!', 'success');
  }
}

/**
 * ===============================================================
 * THEME & NAVIGATION CONTROLLER
 * ===============================================================
 */
function applyThemeVisuals(isDark) {
  const favicon = document.getElementById('dynamic-favicon');
  const headerLogo = document.getElementById('header-primary-logo');
  const loginLogo = document.getElementById('login-modal-logo');
  const targetLogo = isDark ? 'favicon dark.png' : 'favicon white.png';

  if (favicon) favicon.href = targetLogo;
  if (headerLogo) headerLogo.src = targetLogo;
  if (loginLogo) loginLogo.src = targetLogo;

  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');
  if (sunIcon && moonIcon) {
    if (isDark) {
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
    } else {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    }
  }
}

function initTheme() {
  try {
    const saved = SafeStorage.getLocal('pos2in_theme');
    const isDark = (saved !== 'light');
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    applyThemeVisuals(isDark);
  } catch (e) {
    document.documentElement.classList.add('dark');
    applyThemeVisuals(true);
  }
}

function toggleTheme() {
  try {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    const nextIsDark = !isCurrentlyDark;
    if (nextIsDark) {
      document.documentElement.classList.add('dark');
      SafeStorage.setLocal('pos2in_theme', 'dark');
      showToast('Dark mode active', 'info');
    } else {
      document.documentElement.classList.remove('dark');
      SafeStorage.setLocal('pos2in_theme', 'light');
      showToast('Light mode active', 'info');
    }
    applyThemeVisuals(nextIsDark);
  } catch (e) { }
}

function switchTab(tabId) {
  const isAdmin = AppState.auth && AppState.auth.role === 'admin';

  // Branch-only users: only allow dashboard and customers
  if (!isAdmin && tabId !== 'dashboard' && tabId !== 'customers') {
    showToast('Access restricted. Contact administrator.', 'error');
    return;
  }

  const tabs = ['dashboard', 'customers', 'import', 'branches', 'delete', 'settings'];
  tabs.forEach(t => {
    const content = document.getElementById('tab-content-' + t);
    const navBtn = document.getElementById('nav-' + t);
    const mobBtn = document.getElementById('mob-nav-' + t);

    if (content) {
      if (t === tabId) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }

    const isActive = (t === tabId);
    if (navBtn) {
      if (isActive) {
        navBtn.className = 'nav-tab whitespace-nowrap flex-shrink-0 px-3 py-1.5 lg:px-3.5 lg:py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all bg-brand-600 text-white shadow-sm';
      } else {
        const isRed = t === 'delete';
        navBtn.className = `nav-tab whitespace-nowrap flex-shrink-0 px-3 py-1.5 lg:px-3.5 lg:py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${isRed ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10' : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'}`;
      }
    }

    if (mobBtn) {
      if (isActive) {
        mobBtn.className = 'mobile-nav-btn flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-bold transition-all text-brand-600 dark:text-brand-400 bg-brand-500/10 min-w-[56px] min-h-[44px]';
      } else {
        mobBtn.className = 'mobile-nav-btn flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-medium transition-all text-gray-500 dark:text-gray-400 min-w-[56px] min-h-[44px]';
      }
    }
  });

  if (tabId === 'dashboard') {
    applyDashboardFilters();
  } else if (tabId === 'customers') {
    renderCustomerList();
  } else if (tabId === 'settings') {
    syncSettingsToInputs();
    if (isAdmin) loadBranchSecurityData();
  } else if (tabId === 'branches') {
    if (isAdmin) renderBranchManager();
  }
}

function initDateInputs() {
  const now = new Date();
  const year = now.getFullYear();
  const startStr = `${year}-01-01`;
  const endStr = `${year}-12-31`;

  const dashStart = document.getElementById('filter-start-date');
  const dashEnd = document.getElementById('filter-end-date');
  const custStart = document.getElementById('filter-customer-start-date');
  const custEnd = document.getElementById('filter-customer-end-date');

  if (dashStart) dashStart.value = startStr;
  if (dashEnd) dashEnd.value = endStr;
  if (custStart) custStart.value = '';
  if (custEnd) custEnd.value = '';
}

/**
 * ===============================================================
 * DATA MANAGEMENT & RECALCULATION
 * ===============================================================
 */
function recalculateAllCustomerMetrics(customers, settings) {
  const vipThresh = settings ? (Number(settings.vipThreshold) || 15000) : 15000;
  const regThresh = settings ? (Number(settings.regularThreshold) || 5000) : 5000;
  const inactDays = settings ? (Number(settings.inactiveDays) || 60) : 60;
  const nowMs = Date.now();

  Object.values(customers).forEach(c => {
    if (!c.purchases) c.purchases = [];

    // Sort purchases chronologically ascending
    c.purchases.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let totalSpend = 0;
    let branchVisits = {};
    let firstDate = '';
    let lastDate = '';

    c.purchases.forEach(p => {
      const amt = parseNumber(p.amount);
      totalSpend += amt;
      const br = p.branch || 'Main Branch';
      branchVisits[br] = (branchVisits[br] || 0) + 1;

      if (!firstDate || (p.date && p.date < firstDate)) firstDate = p.date;
      if (!lastDate || (p.date && p.date > lastDate)) lastDate = p.date;
    });

    c.totalSpend = Math.round(totalSpend);
    c.totalVisits = c.purchases.length;
    c.averageOrderValue = c.totalVisits > 0 ? Math.round(totalSpend / c.totalVisits) : 0;
    c.firstPurchaseDate = firstDate;
    c.lastPurchaseDate = lastDate;
    c.branchVisits = branchVisits;

    // Determine primary branch
    let maxVisits = 0;
    let primary = 'Main Branch';
    Object.keys(branchVisits).forEach(br => {
      if (branchVisits[br] > maxVisits) {
        maxVisits = branchVisits[br];
        primary = br;
      }
    });
    c.primaryBranch = primary;

    // Calculate Loyalty Tier
    let daysSinceLast = 9999;
    if (lastDate) {
      const parsedLast = new Date(lastDate).getTime();
      if (!isNaN(parsedLast)) {
        daysSinceLast = Math.floor((nowMs - parsedLast) / (1000 * 60 * 60 * 24));
      }
    }

    if (totalSpend >= vipThresh) {
      c.tier = 'VIP Champion';
    } else if (totalSpend >= regThresh || c.totalVisits >= 3) {
      c.tier = 'Loyal Regular';
    } else if (c.totalVisits === 1 && daysSinceLast <= 30) {
      c.tier = 'New Customer';
    } else if (daysSinceLast > inactDays && c.totalVisits > 0) {
      c.tier = 'At-Risk / Inactive';
    } else {
      c.tier = 'Regular Customer';
    }
  });
}


function getScopedCustomerData(cust, targetBranch) {
  if (!cust) return null;
  if (!targetBranch || targetBranch === 'ALL') {
    return cust;
  }

  // Filter purchases strictly for targetBranch
  const branchPurchases = (cust.purchases || []).filter(p => p.branch === targetBranch);
  if (branchPurchases.length === 0) {
    return null; // Customer never transacted at this branch
  }

  let totalSpend = 0;
  let firstDate = '';
  let lastDate = '';

  branchPurchases.forEach(p => {
    const amt = parseNumber(p.amount);
    totalSpend += amt;
    if (!firstDate || (p.date && p.date < firstDate)) firstDate = p.date;
    if (!lastDate || (p.date && p.date > lastDate)) lastDate = p.date;
  });

  const totalVisits = branchPurchases.length;
  const aov = totalVisits > 0 ? Math.round(totalSpend / totalVisits) : 0;

  // Branch-specific loyalty tier
  const vipThresh = Number(AppState.settings.vipThreshold) || 15000;
  const regThresh = Number(AppState.settings.regularThreshold) || 5000;
  const inactDays = Number(AppState.settings.inactiveDays) || 60;
  let daysSinceLast = 9999;
  if (lastDate) {
    const parsedLast = new Date(lastDate).getTime();
    if (!isNaN(parsedLast)) {
      daysSinceLast = Math.floor((Date.now() - parsedLast) / (1000 * 60 * 60 * 24));
    }
  }

  let tier = 'Regular Customer';
  if (totalSpend >= vipThresh) {
    tier = 'VIP Champion';
  } else if (totalSpend >= regThresh || totalVisits >= 3) {
    tier = 'Loyal Regular';
  } else if (totalVisits === 1 && daysSinceLast <= 30) {
    tier = 'New Customer';
  } else if (daysSinceLast > inactDays && totalVisits > 0) {
    tier = 'At-Risk / Inactive';
  }

  return {
    ...cust,
    primaryBranch: targetBranch,
    totalSpend: Math.round(totalSpend),
    totalVisits: totalVisits,
    averageOrderValue: aov,
    firstPurchaseDate: firstDate,
    lastPurchaseDate: lastDate,
    tier: tier,
    purchases: branchPurchases,
    branchVisits: { [targetBranch]: totalVisits }
  };
}

function onDataLoaded() {
  populateBranchDropdowns();
  syncSettingsToInputs();
  applyDashboardFilters();
  renderCustomerList();
  setSyncStatus('ready', 'Connected (Firebase Cloud)');
}

function loadAllData(forceFresh) {
  setSyncStatus('syncing', 'Synchronizing with Firebase Cloud...');
  if (FirebaseEngine.isConnected) {
    setSyncStatus('ready', 'Connected (Firebase Cloud)');
  }
}

function populateBranchDropdowns() {
  const branches = getActiveBranches();
  const isAdmin = AppState.auth && AppState.auth.role === 'admin';
  const forcedBranch = (!isAdmin && AppState.auth) ? AppState.auth.branch : null;

  const dropdowns = [
    { id: 'filter-dashboard-branch', includeAll: true, includeAuto: false },
    { id: 'filter-customer-branch', includeAll: true, includeAuto: false },
    { id: 'customer-branch-filter', includeAll: true, includeAuto: false },
    { id: 'import-branch-select', includeAll: false, includeAuto: true },
    { id: 'delete-filter-branch', includeAll: true, includeAuto: false },
    { id: 'delete-branch-select', includeAll: true, includeAuto: false }
  ];

  dropdowns.forEach(cfg => {
    const el = document.getElementById(cfg.id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '';

    if (forcedBranch) {
      // Strictly force to assigned branch for branch users
      const opt = document.createElement('option');
      opt.value = forcedBranch;
      opt.textContent = `${forcedBranch} (Assigned)`;
      el.appendChild(opt);
      el.value = forcedBranch;
      el.disabled = true;
      el.classList.add('opacity-90', 'cursor-not-allowed');
    } else {
      el.disabled = false;
      el.classList.remove('opacity-90', 'cursor-not-allowed');

      if (cfg.includeAll && isAdmin) {
        const opt = document.createElement('option');
        opt.value = 'ALL';
        opt.textContent = 'All Branches';
        el.appendChild(opt);
      }

      if (cfg.includeAuto) {
        const opt = document.createElement('option');
        opt.value = 'AUTO';
        opt.textContent = 'Auto-Detect from CSV (Sales Point)';
        el.appendChild(opt);
      }

      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        el.appendChild(opt);
      });

      // Restore previous selection if still valid
      if (cur && [...el.options].some(o => o.value === cur)) {
        el.value = cur;
      }
    }
  });
}

function syncSettingsToInputs() {
  const s = AppState.settings;
  const curr = document.getElementById('setting-currency');
  const vip = document.getElementById('setting-vip');
  const reg = document.getElementById('setting-regular');
  const inact = document.getElementById('setting-inactive');
  const adminUser = document.getElementById('setting-admin-username');
  const adminDisplay = document.getElementById('current-admin-display-username');

  if (curr) curr.value = s.currencySymbol || '৳';
  if (vip) vip.value = s.vipThreshold || 15000;
  if (reg) reg.value = s.regularThreshold || 5000;
  if (inact) inact.value = s.inactiveDays || 60;

  const currentAdminUser = (s.adminConfig && s.adminConfig.username) ? s.adminConfig.username : 'admin';
  if (adminUser) adminUser.value = currentAdminUser;
  if (adminDisplay) adminDisplay.textContent = currentAdminUser;

  renderBranchManager();
}

function updateAdminCredentials() {
  const userEl = document.getElementById('setting-admin-username');
  const newPwEl = document.getElementById('setting-admin-new-pw');
  const confirmPwEl = document.getElementById('setting-admin-confirm-pw');

  const username = userEl ? userEl.value.trim() : '';
  const newPw = newPwEl ? newPwEl.value.trim() : '';
  const confirmPw = confirmPwEl ? confirmPwEl.value.trim() : '';

  if (!username) {
    showToast('Admin username or email cannot be empty', 'error');
    return;
  }

  if (newPw || confirmPw) {
    if (newPw.length < 6) {
      showToast('New password must be at least 6 characters long', 'error');
      return;
    }
    if (newPw !== confirmPw) {
      showToast('Passwords do not match. Please check and retype.', 'error');
      return;
    }
  }

  if (!AppState.settings.adminConfig) {
    AppState.settings.adminConfig = { username: 'admin', password: 'pos2in@admin2026', updatedAt: new Date().toISOString() };
  }

  AppState.settings.adminConfig.username = username;
  if (newPw) {
    AppState.settings.adminConfig.password = newPw;
  }
  AppState.settings.adminConfig.updatedAt = new Date().toISOString();

  // If active session is admin, update displayed username
  if (AppState.auth && AppState.auth.role === 'admin') {
    AppState.auth.username = username;
    SafeStorage.setItem('pos2in_auth', JSON.stringify(AppState.auth));
    updateAuthUI();
  }

  if (typeof FirebaseEngine !== 'undefined') {
    FirebaseEngine.saveSettingsDoc(AppState.settings);
  }

  const displayEl = document.getElementById('current-admin-display-username');
  if (displayEl) displayEl.textContent = username;

  if (newPwEl) newPwEl.value = '';
  if (confirmPwEl) confirmPwEl.value = '';

  showToast('Admin master credentials updated & saved to Firebase Cloud!', 'success');
}

function saveAppSettings() {
  const curr = document.getElementById('setting-currency');
  const vip = document.getElementById('setting-vip');
  const reg = document.getElementById('setting-regular');
  const inact = document.getElementById('setting-inactive');

  if (curr && curr.value) AppState.settings.currencySymbol = curr.value;
  if (vip && vip.value) AppState.settings.vipThreshold = Number(vip.value) || AppState.settings.vipThreshold || 15000;
  if (reg && reg.value) AppState.settings.regularThreshold = Number(reg.value) || AppState.settings.regularThreshold || 5000;
  if (inact && inact.value) AppState.settings.inactiveDays = Number(inact.value) || AppState.settings.inactiveDays || 60;

  recalculateAllCustomerMetrics(AppState.customers, AppState.settings);

  if (typeof FirebaseEngine !== 'undefined') {
    FirebaseEngine.saveSettingsDoc(AppState.settings);
  }

  showToast('Settings saved to Firebase Cloud successfully!', 'success');
  onDataLoaded();
}

function exportFullDatabaseJson() {
  const exportData = {
    version: '2.0.0',
    exportDate: new Date().toISOString(),
    settings: AppState.settings,
    customers: AppState.customers
  };
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pos2in_cloud_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported complete database backup (JSON)!', 'success');
}

/**
 * ===============================================================
 * DASHBOARD & ANALYTICS
 * ===============================================================
 */
function setDatePreset(preset) {
  AppState.filters.datePreset = preset;

  const buttons = document.querySelectorAll('.date-preset-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('data-preset') === preset) {
      btn.className = 'date-preset-btn active px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-600 text-white shadow transition-all flex-shrink-0';
    } else {
      btn.className = 'date-preset-btn px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 transition-all flex-shrink-0';
    }
  });

  const startEl = document.getElementById('filter-start-date');
  const endEl = document.getElementById('filter-end-date');
  const monthSel = document.getElementById('filter-specific-month');
  if (monthSel && preset !== 'month') monthSel.value = '';

  const now = new Date();
  const year = now.getFullYear();

  if (preset === 'all') {
    AppState.filters.startDate = '';
    AppState.filters.endDate = '';
    if (startEl) startEl.value = '2020-01-01';
    if (endEl) endEl.value = `${year}-12-31`;
  } else if (preset === 'today') {
    const todayIso = now.toISOString().slice(0, 10);
    AppState.filters.startDate = todayIso;
    AppState.filters.endDate = todayIso;
    if (startEl) startEl.value = todayIso;
    if (endEl) endEl.value = todayIso;
  } else if (preset === 'this_week') {
    const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayIso = now.toISOString().slice(0, 10);
    AppState.filters.startDate = past7;
    AppState.filters.endDate = todayIso;
    if (startEl) startEl.value = past7;
    if (endEl) endEl.value = todayIso;
  } else if (preset === 'this_month') {
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const startM = `${year}-${m}-01`;
    const endM = `${year}-${m}-31`;
    AppState.filters.startDate = startM;
    AppState.filters.endDate = endM;
    if (startEl) startEl.value = startM;
    if (endEl) endEl.value = endM;
  } else if (preset === 'last_month') {
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevY = prevDate.getFullYear();
    const prevM = String(prevDate.getMonth() + 1).padStart(2, '0');
    const startM = `${prevY}-${prevM}-01`;
    const endM = `${prevY}-${prevM}-31`;
    AppState.filters.startDate = startM;
    AppState.filters.endDate = endM;
    if (startEl) startEl.value = startM;
    if (endEl) endEl.value = endM;
  } else if (preset === 'year_2025') {
    AppState.filters.startDate = '2025-01-01';
    AppState.filters.endDate = '2025-12-31';
    if (startEl) startEl.value = '2025-01-01';
    if (endEl) endEl.value = '2025-12-31';
  }

  applyDashboardFilters();
}

function onMonthSelectChanged() {
  const monthSel = document.getElementById('filter-specific-month');
  const yearSel = document.getElementById('filter-specific-year');
  const month = monthSel ? monthSel.value : '';
  const year = yearSel ? yearSel.value : '2025';

  if (!month) {
    setDatePreset('all');
    return;
  }

  AppState.filters.specificMonth = month;
  AppState.filters.specificYear = year;
  AppState.filters.datePreset = 'month';

  const startM = `${year}-${month}-01`;
  const endM = `${year}-${month}-31`;
  AppState.filters.startDate = startM;
  AppState.filters.endDate = endM;

  const startEl = document.getElementById('filter-start-date');
  const endEl = document.getElementById('filter-end-date');
  if (startEl) startEl.value = startM;
  if (endEl) endEl.value = endM;

  const buttons = document.querySelectorAll('.date-preset-btn');
  buttons.forEach(btn => btn.className = 'date-preset-btn px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 transition-all flex-shrink-0');

  applyDashboardFilters();
}

function applyCustomDateFilter() {
  const startEl = document.getElementById('filter-start-date');
  const endEl = document.getElementById('filter-end-date');
  AppState.filters.startDate = startEl ? startEl.value : '';
  AppState.filters.endDate = endEl ? endEl.value : '';
  AppState.filters.datePreset = 'custom';

  const buttons = document.querySelectorAll('.date-preset-btn');
  buttons.forEach(btn => btn.className = 'date-preset-btn px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 transition-all flex-shrink-0');

  applyDashboardFilters();
}

function applyDashboardFilters() {
  const branchSel = document.getElementById('filter-dashboard-branch');
  // Branch users always see only their branch
  const isAdmin = AppState.auth && AppState.auth.role === 'admin';
  let targetBranch = (branchSel && branchSel.value) ? branchSel.value : 'ALL';
  if (!isAdmin && AppState.auth && AppState.auth.branch) {
    targetBranch = AppState.auth.branch;
    if (branchSel) branchSel.value = targetBranch;
  }
  AppState.filters.branch = targetBranch;

  const now = new Date();
  const year = now.getFullYear();
  let startFilter = '2000-01-01';
  let endFilter = '2099-12-31';

  if (AppState.filters.datePreset === 'all') {
    startFilter = '2000-01-01';
    endFilter = '2099-12-31';
  } else if (AppState.filters.datePreset === 'today') {
    const todayIso = now.toISOString().slice(0, 10);
    startFilter = todayIso;
    endFilter = todayIso;
  } else if (AppState.filters.datePreset === 'this_week') {
    startFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    endFilter = now.toISOString().slice(0, 10);
  } else if (AppState.filters.datePreset === 'this_month') {
    const m = String(now.getMonth() + 1).padStart(2, '0');
    startFilter = `${year}-${m}-01`;
    endFilter = `${year}-${m}-31`;
  } else if (AppState.filters.datePreset === 'last_month') {
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevY = prevDate.getFullYear();
    const prevM = String(prevDate.getMonth() + 1).padStart(2, '0');
    startFilter = `${prevY}-${prevM}-01`;
    endFilter = `${prevY}-${prevM}-31`;
  } else if (AppState.filters.datePreset === 'year_2025') {
    startFilter = '2025-01-01';
    endFilter = '2025-12-31';
  } else if (AppState.filters.datePreset === 'month' && AppState.filters.specificMonth) {
    const m = AppState.filters.specificMonth;
    const y = AppState.filters.specificYear || '2025';
    startFilter = `${y}-${m}-01`;
    endFilter = `${y}-${m}-31`;
  } else if (AppState.filters.datePreset === 'custom') {
    startFilter = AppState.filters.startDate || '2000-01-01';
    endFilter = AppState.filters.endDate || '2099-12-31';
  }

  // Filter Invoices
  const filteredInvoices = [];
  const filteredCustomerKeys = new Set();
  const customerOrdersCount = {};

  Object.values(AppState.customers || {}).forEach(c => {
    const custKey = c.phone || ('NAME_' + c.name);
    (c.purchases || []).forEach(p => {
      if (targetBranch !== 'ALL' && p.branch !== targetBranch) return;
      if (p.date && (p.date < startFilter || p.date > endFilter)) return;

      filteredInvoices.push({
        invoiceNo: p.invoiceNo,
        date: p.date,
        branch: p.branch,
        amount: parseNumber(p.amount),
        discount: parseNumber(p.discount),
        customerName: c.name,
        phone: c.phone,
        items: p.items
      });
      filteredCustomerKeys.add(custKey);
      customerOrdersCount[custKey] = (customerOrdersCount[custKey] || 0) + 1;
    });
  });

  let repeatBuyersCount = 0;
  Object.values(customerOrdersCount).forEach(count => {
    if (count > 1) repeatBuyersCount++;
  });

  updateDashboardKPIs(filteredInvoices, filteredCustomerKeys.size, repeatBuyersCount);
  renderDashboardCharts(filteredInvoices);
  renderTopCustomersTable(AppState.customers, targetBranch, startFilter, endFilter);
}

function updateDashboardKPIs(invoices, activeCustomerCount, repeatBuyersCount) {
  let totalRevenue = 0;
  let totalDiscount = 0;

  invoices.forEach(inv => {
    totalRevenue += inv.amount;
    totalDiscount += inv.discount;
  });

  const totalInvoices = invoices.length;
  const aov = totalInvoices > 0 ? Math.round(totalRevenue / totalInvoices) : 0;
  const curr = AppState.settings.currencySymbol || '৳';
  const repeatRate = activeCustomerCount > 0 ? Math.round((repeatBuyersCount / activeCustomerCount) * 100) : 0;
  const totalDbCustomers = Object.keys(AppState.customers || {}).length;

  const revEl = document.getElementById('kpi-total-revenue');
  const ordersEl = document.getElementById('kpi-total-orders');
  const activeCustEl = document.getElementById('kpi-active-customers');
  const totalCustRegisteredEl = document.getElementById('kpi-total-customers-registered');
  const aovEl = document.getElementById('kpi-aov');
  const repeatRateEl = document.getElementById('kpi-repeat-rate');
  const repeatCountEl = document.getElementById('kpi-repeat-count');

  if (revEl) revEl.textContent = `${curr} ${formatNumber(totalRevenue)}`;
  if (ordersEl) ordersEl.textContent = formatNumber(totalInvoices);
  if (activeCustEl) activeCustEl.textContent = formatNumber(activeCustomerCount);
  if (totalCustRegisteredEl) totalCustRegisteredEl.textContent = `${formatNumber(totalDbCustomers)} in database`;
  if (aovEl) aovEl.textContent = `${curr} ${formatNumber(aov)}`;
  if (repeatRateEl) repeatRateEl.textContent = `${repeatRate}%`;
  if (repeatCountEl) repeatCountEl.textContent = `${repeatBuyersCount} repeat buyers`;
}

function renderDashboardCharts(invoices) {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js library not loaded yet, skipping chart render.');
    return;
  }
  
  // 1. Intelligent Daily / Monthly Revenue Progression
  const dailyMap = {};
  const monthMap = {};
  const branchRevenueMap = {};

  (invoices || []).forEach(inv => {
    if (inv.date) {
      const dStr = inv.date.slice(0, 10);
      dailyMap[dStr] = (dailyMap[dStr] || 0) + inv.amount;
      const mStr = inv.date.slice(0, 7);
      monthMap[mStr] = (monthMap[mStr] || 0) + inv.amount;
    }
    const br = inv.branch || 'Other';
    branchRevenueMap[br] = (branchRevenueMap[br] || 0) + inv.amount;
  });

  const sortedDailyKeys = Object.keys(dailyMap).sort();
  const sortedMonthKeys = Object.keys(monthMap).sort();

  // If there are <= 60 distinct days, or if data spans <= 3 months, use Daily grouping to show rich day-by-day progression curve!
  let chartLabels = [];
  let chartData = [];

  const useDaily = (sortedDailyKeys.length <= 60) || (sortedMonthKeys.length <= 3);

  if (useDaily && sortedDailyKeys.length > 0) {
    chartLabels = sortedDailyKeys.map(d => {
      const parts = d.split('-');
      if (parts.length === 3) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mIdx = parseInt(parts[1], 10) - 1;
        return `${parseInt(parts[2], 10)} ${months[mIdx] || ''}`;
      }
      return d;
    });
    chartData = sortedDailyKeys.map(d => Math.round(dailyMap[d]));
  } else if (sortedMonthKeys.length > 0) {
    chartLabels = sortedMonthKeys.map(m => {
      const [y, mo] = m.split('-');
      const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${names[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
    });
    chartData = sortedMonthKeys.map(m => Math.round(monthMap[m]));
  }

  const curr = (AppState.settings && AppState.settings.currencySymbol) ? AppState.settings.currencySymbol : '৳';
  const trendEmpty = document.getElementById('trend-empty-state');
  const salesCtx = document.getElementById('salesTrendChart');

  if (salesCtx) {
    if (!invoices || invoices.length === 0 || chartData.length === 0) {
      if (trendEmpty) trendEmpty.classList.remove('hidden');
    } else {
      if (trendEmpty) trendEmpty.classList.add('hidden');
    }

    if (AppState.charts.salesTrend) AppState.charts.salesTrend.destroy();

    const isSinglePoint = (chartData.length === 1);

    AppState.charts.salesTrend = new Chart(salesCtx, {
      type: 'line',
      data: {
        labels: chartLabels.length ? chartLabels : ['No Data'],
        datasets: [{
          label: 'Daily Sales Revenue',
          data: chartData.length ? chartData : [0],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.10)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: isSinglePoint ? 6 : (chartData.length > 25 ? 2.5 : 4),
          pointHoverRadius: isSinglePoint ? 8 : 6,
          pointBackgroundColor: '#2563eb',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#e0e7ff',
            borderColor: 'rgba(99, 102, 241, 0.3)',
            borderWidth: 1,
            padding: 10,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              label: function(context) {
                return ` Daily Revenue: ${curr} ${formatNumber(context.raw)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: {
              font: { size: 10 },
              callback: function(val) {
                if (val >= 1000000) return `${curr} ${(val / 1000000).toFixed(1)}M`;
                if (val >= 1000) return `${curr} ${(val / 1000).toFixed(0)}k`;
                return `${curr} ${val}`;
              }
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10 },
              maxRotation: 45,
              autoSkip: true,
              maxTicksLimit: 16
            }
          }
        }
      }
    });
  }

  // 2. Branch Revenue Pie (Vibrant, high-contrast, aesthetic palette)
  const branchLabels = Object.keys(branchRevenueMap);
  const branchData = Object.values(branchRevenueMap);
  const totalBranchRev = branchData.reduce((a, b) => a + b, 0);
  const branchEmpty = document.getElementById('branch-empty-state');
  const branchCtx = document.getElementById('branchPieChart');
  const isDark = (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList && typeof document.documentElement.classList.contains === 'function') ? document.documentElement.classList.contains('dark') : true;
  const ringBorder = isDark ? '#0f172a' : '#ffffff';

  // Vibrant, cheerful, high-contrast palette (Sapphire, Amber Gold, Iris Violet, Emerald Mint, Coral Rose, Cyan, Orange, Indigo, Pink)
  const branchColors = [
    '#3b82f6', // Sapphire Blue
    '#f59e0b', // Warm Amber Gold
    '#8b5cf6', // Vibrant Iris Violet
    '#10b981', // Fresh Mint Emerald
    '#f43f5e', // Coral Rose
    '#06b6d4', // Vivid Cyan
    '#f97316', // Sunset Tangerine
    '#6366f1', // Indigo
    '#ec4899', // Bright Pink
    '#14b8a6', // Teal
    '#64748b'  // Slate
  ];

  if (branchCtx) {
    if (branchLabels.length === 0 || totalBranchRev === 0) {
      if (branchEmpty) branchEmpty.classList.remove('hidden');
    } else {
      if (branchEmpty) branchEmpty.classList.add('hidden');
    }

    if (AppState.charts.branchPie) AppState.charts.branchPie.destroy();
    AppState.charts.branchPie = new Chart(branchCtx, {
      type: 'doughnut',
      data: {
        labels: branchLabels.length ? branchLabels : ['No Data'],
        datasets: [{
          data: branchData.length ? branchData : [1],
          backgroundColor: branchColors.slice(0, Math.max(branchLabels.length, 1)),
          borderWidth: 2.5,
          borderColor: ringBorder,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 12,
              font: { size: 11, family: "'Plus Jakarta Sans', sans-serif", weight: '600' },
              color: isDark ? '#94a3b8' : '#475569'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#e0e7ff',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 10,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              label: function(context) {
                const val = context.raw || 0;
                const pct = totalBranchRev > 0 ? ((val / totalBranchRev) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${curr} ${formatNumber(val)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // 3. Customer Segments Pie
  const dashBranchSel = document.getElementById('filter-dashboard-branch');
  const isDashAdmin = AppState.auth && AppState.auth.role === 'admin';
  let dashTargetBranch = 'ALL';
  if (isDashAdmin) {
    dashTargetBranch = (dashBranchSel && dashBranchSel.value) ? dashBranchSel.value : 'ALL';
  } else if (AppState.auth && AppState.auth.branch) {
    dashTargetBranch = AppState.auth.branch;
  }

  const tierCounts = { 'VIP Champion': 0, 'Loyal Regular': 0, 'New Customer': 0, 'At-Risk / Inactive': 0, 'Regular Customer': 0 };
  Object.values(AppState.customers || {}).forEach(rawC => {
    const c = getScopedCustomerData(rawC, dashTargetBranch);
    if (!c) return;
    const t = c.tier || 'Regular Customer';
    if (tierCounts[t] !== undefined) tierCounts[t]++;
    else if (t.includes('VIP')) tierCounts['VIP Champion']++;
    else if (t.includes('Regular')) tierCounts['Loyal Regular']++;
    else if (t.includes('New')) tierCounts['New Customer']++;
    else if (t.includes('At-Risk') || t.includes('Inactive')) tierCounts['At-Risk / Inactive']++;
    else tierCounts['Regular Customer']++;
  });

  const segEmpty = document.getElementById('segment-empty-state');
  const segCtx = document.getElementById('segmentChart');
  if (segCtx) {
    const totalSegs = Object.values(tierCounts).reduce((a, b) => a + b, 0);
    if (totalSegs === 0) {
      if (segEmpty) segEmpty.classList.remove('hidden');
    } else {
      if (segEmpty) segEmpty.classList.add('hidden');
    }

    if (AppState.charts.segmentPie) AppState.charts.segmentPie.destroy();
    AppState.charts.segmentPie = new Chart(segCtx, {
      type: 'doughnut',
      data: {
        labels: ['VIP Champions', 'Loyal Regulars', 'New Customers', 'At-Risk / Inactive', 'Other'],
        datasets: [{
          data: [
            tierCounts['VIP Champion'],
            tierCounts['Loyal Regular'],
            tierCounts['New Customer'],
            tierCounts['At-Risk / Inactive'],
            tierCounts['Regular Customer']
          ],
          backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#f43f5e', '#64748b'],
          borderWidth: 2.5,
          borderColor: ringBorder,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 12,
              font: { size: 11, family: "'Plus Jakarta Sans', sans-serif", weight: '600' },
              color: isDark ? '#94a3b8' : '#475569'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#e0e7ff',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 10,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              label: function(context) {
                const val = context.raw || 0;
                const pct = totalSegs > 0 ? ((val / totalSegs) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${val} customers (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }
}

function renderTopCustomersTable(customers, branch, start, end) {
  const tbody = document.getElementById('top-customers-table-body');
  if (!tbody) return;

  const list = Object.values(customers || []).map(c => {
    let periodSpend = 0;
    let periodVisits = 0;
    (c.purchases || []).forEach(p => {
      if (branch !== 'ALL' && p.branch !== branch) return;
      if (p.date && (p.date < start || p.date > end)) return;
      periodSpend += parseNumber(p.amount);
      periodVisits++;
    });
    return {
      customer: c,
      periodSpend,
      periodVisits
    };
  }).filter(item => item.periodSpend > 0 || item.periodVisits > 0)
    .sort((a, b) => b.periodSpend - a.periodSpend)
    .slice(0, 10);

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400 font-medium">No transactions match active filter</td></tr>';
    return;
  }

  const curr = AppState.settings.currencySymbol || '৳';
  tbody.innerHTML = list.map((item, idx) => {
    const c = item.customer;
    const key = c.phone || ('NAME_' + c.name);
    const encoded = encodeURIComponent(key);
    return `
          <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-xs">
            <td class="py-2.5 px-3 font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span class="font-mono font-bold text-gray-400">#${idx + 1}</span>
              <span>${escapeHtml(c.name || 'Walk-in Customer')}</span>
            </td>
            <td class="py-2.5 px-3 font-mono text-gray-500">${escapeHtml(c.phone || '-')}</td>
            <td class="py-2.5 px-3">${getTierBadgeHtml(c.tier)}</td>
            <td class="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">${escapeHtml(c.primaryBranch || 'Main Branch')}</td>
            <td class="py-2.5 px-3 text-right font-mono font-bold text-brand-600 dark:text-brand-400">${curr} ${formatNumber(item.periodSpend)}</td>
            <td class="py-2.5 px-3 text-right">
              <button onclick="openCustomerModal('${encoded}')" class="px-2.5 py-1 rounded-lg bg-brand-600/10 hover:bg-brand-600/20 text-brand-600 dark:text-brand-400 text-xs font-bold transition-all">
                View
              </button>
            </td>
          </tr>
        `;
  }).join('');
}

/**
 * ===============================================================
 * CUSTOMER DIRECTORY & FILTERING
 * ===============================================================
 */
function setCustomerDatePreset(preset) {
      AppState.pagination.page = 1;
  AppState.filters.customerDatePreset = preset;
  const now = new Date();
  const year = now.getFullYear();

  const presetBtns = document.querySelectorAll('.cust-date-preset-btn');
  presetBtns.forEach(btn => {
    if (btn.getAttribute('data-cust-preset') === preset) {
      btn.className = 'cust-date-preset-btn active px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-brand-600 text-white shadow-sm';
    } else {
      btn.className = 'cust-date-preset-btn px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10';
    }
  });

  const startEl = document.getElementById('filter-customer-start-date');
  const endEl = document.getElementById('filter-customer-end-date');
  const monthSel = document.getElementById('filter-customer-month');
  const ind = document.getElementById('customer-date-filter-indicator');
  const indText = document.getElementById('customer-date-filter-text');
  const clearDateBtn = document.getElementById('btn-clear-customer-date');

  if (monthSel) monthSel.value = '';

  if (preset === 'all') {
    AppState.filters.customerStartDate = null;
    AppState.filters.customerEndDate = null;
    if (startEl) startEl.value = '';
    if (endEl) endEl.value = '';
    if (ind) ind.classList.add('hidden');
    if (clearDateBtn) clearDateBtn.classList.add('hidden');
  } else if (preset === 'today') {
    const todayIso = now.toISOString().slice(0, 10);
    AppState.filters.customerStartDate = todayIso;
    AppState.filters.customerEndDate = todayIso;
    if (startEl) startEl.value = todayIso;
    if (endEl) endEl.value = todayIso;
    if (ind) ind.classList.remove('hidden');
    if (indText) indText.textContent = `Active Filter: Today (${todayIso})`;
    if (clearDateBtn) clearDateBtn.classList.remove('hidden');
  } else if (preset === 'this_week') {
    const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayIso = now.toISOString().slice(0, 10);
    AppState.filters.customerStartDate = past7;
    AppState.filters.customerEndDate = todayIso;
    if (startEl) startEl.value = past7;
    if (endEl) endEl.value = todayIso;
    if (ind) ind.classList.remove('hidden');
    if (indText) indText.textContent = `Active Filter: Last 7 Days (${past7} to ${todayIso})`;
    if (clearDateBtn) clearDateBtn.classList.remove('hidden');
  } else if (preset === 'this_month') {
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const startM = `${year}-${m}-01`;
    const endM = `${year}-${m}-31`;
    AppState.filters.customerStartDate = startM;
    AppState.filters.customerEndDate = endM;
    if (startEl) startEl.value = startM;
    if (endEl) endEl.value = endM;
    if (ind) ind.classList.remove('hidden');
    if (indText) indText.textContent = `Active Filter: This Month (${year}-${m})`;
    if (clearDateBtn) clearDateBtn.classList.remove('hidden');
  } else if (preset === 'last_month') {
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevY = prevMonthDate.getFullYear();
    const prevM = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    const startM = `${prevY}-${prevM}-01`;
    const endM = `${prevY}-${prevM}-31`;
    AppState.filters.customerStartDate = startM;
    AppState.filters.customerEndDate = endM;
    if (startEl) startEl.value = startM;
    if (endEl) endEl.value = endM;
    if (ind) ind.classList.remove('hidden');
    if (indText) indText.textContent = `Active Filter: Last Month (${prevY}-${prevM})`;
    if (clearDateBtn) clearDateBtn.classList.remove('hidden');
  } else if (preset === 'year_2025') {
    AppState.filters.customerStartDate = '2025-01-01';
    AppState.filters.customerEndDate = '2025-12-31';
    if (startEl) startEl.value = '2025-01-01';
    if (endEl) endEl.value = '2025-12-31';
    if (ind) ind.classList.remove('hidden');
    if (indText) indText.textContent = 'Active Filter: Full Year 2025';
    if (clearDateBtn) clearDateBtn.classList.remove('hidden');
  }

  renderCustomerList();
}

function onCustomerMonthSelectChanged() {
      AppState.pagination.page = 1;
  const monthSel = document.getElementById('filter-customer-month');
  const yearSel = document.getElementById('filter-customer-year');
  const month = monthSel ? monthSel.value : '';
  const year = yearSel ? yearSel.value : '2025';

  const startEl = document.getElementById('filter-customer-start-date');
  const endEl = document.getElementById('filter-customer-end-date');
  const ind = document.getElementById('customer-date-filter-indicator');
  const indText = document.getElementById('customer-date-filter-text');
  const clearDateBtn = document.getElementById('btn-clear-customer-date');

  if (!month) {
    clearCustomerDateFilter();
    return;
  }

  const startM = `${year}-${month}-01`;
  const endM = `${year}-${month}-31`;
  AppState.filters.customerDatePreset = 'custom';
  AppState.filters.customerStartDate = startM;
  AppState.filters.customerEndDate = endM;

  if (startEl) startEl.value = startM;
  if (endEl) endEl.value = endM;

  const presetBtns = document.querySelectorAll('.cust-date-preset-btn');
  presetBtns.forEach(btn => btn.className = 'cust-date-preset-btn px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10');

  if (ind) ind.classList.remove('hidden');
  if (indText) indText.textContent = `Active Filter: Month ${year}-${month}`;
  if (clearDateBtn) clearDateBtn.classList.remove('hidden');

  renderCustomerList();
}

function applyCustomerCustomDateFilter() {
      AppState.pagination.page = 1;
  const startEl = document.getElementById('filter-customer-start-date');
  const endEl = document.getElementById('filter-customer-end-date');
  const start = startEl ? startEl.value : null;
  const end = endEl ? endEl.value : null;

  const ind = document.getElementById('customer-date-filter-indicator');
  const indText = document.getElementById('customer-date-filter-text');
  const clearDateBtn = document.getElementById('btn-clear-customer-date');

  if (!start && !end) {
    clearCustomerDateFilter();
    return;
  }

  AppState.filters.customerDatePreset = 'custom';
  AppState.filters.customerStartDate = start || null;
  AppState.filters.customerEndDate = end || null;

  const presetBtns = document.querySelectorAll('.cust-date-preset-btn');
  presetBtns.forEach(btn => btn.className = 'cust-date-preset-btn px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10');

  if (ind) ind.classList.remove('hidden');
  if (indText) indText.textContent = `Active Filter: ${start || 'Start'} to ${end || 'End'}`;
  if (clearDateBtn) clearDateBtn.classList.remove('hidden');

  renderCustomerList();
}

function clearCustomerDateFilter() {
      AppState.pagination.page = 1;
  AppState.filters.customerDatePreset = 'all';
  AppState.filters.customerStartDate = null;
  AppState.filters.customerEndDate = null;
  AppState.filters.customerMonth = '';

  const startEl = document.getElementById('filter-customer-start-date');
  const endEl = document.getElementById('filter-customer-end-date');
  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';

  const monthSel = document.getElementById('filter-customer-month');
  if (monthSel) monthSel.value = '';

  const ind = document.getElementById('customer-date-filter-indicator');
  if (ind) ind.classList.add('hidden');
  const clearDateBtn = document.getElementById('btn-clear-customer-date');
  if (clearDateBtn) clearDateBtn.classList.add('hidden');

  const presetBtns = document.querySelectorAll('.cust-date-preset-btn');
  presetBtns.forEach(btn => {
    if (btn.getAttribute('data-cust-preset') === 'all') {
      btn.className = 'cust-date-preset-btn active px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-brand-600 text-white shadow-sm';
    } else {
      btn.className = 'cust-date-preset-btn px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10';
    }
  });

  renderCustomerList();
}

function resetCustomerFilters() {
      AppState.pagination.page = 1;
  AppState.filters.searchQuery = '';
  AppState.filters.tier = 'ALL';
  AppState.filters.sortBy = 'spend_desc';
  AppState.filters.customerDatePreset = 'all';
  AppState.filters.customerStartDate = null;
  AppState.filters.customerEndDate = null;
  AppState.filters.customerMonth = '';

  const searchInput = document.getElementById('customer-search-input');
  if (searchInput) searchInput.value = '';
  const searchClear = document.getElementById('search-clear-btn');
  if (searchClear) searchClear.classList.add('hidden');

  const sortSelect = document.getElementById('customer-sort-select');
  if (sortSelect) sortSelect.value = 'spend_desc';

  const branchSel = document.getElementById('filter-customer-branch');
  const isAdmin = AppState.auth && AppState.auth.role === 'admin';
  if (branchSel) {
    if (isAdmin) {
      branchSel.value = 'ALL';
      branchSel.disabled = false;
    } else if (AppState.auth && AppState.auth.branch) {
      branchSel.value = AppState.auth.branch;
      branchSel.disabled = true;
    }
  }

  const chips = document.querySelectorAll('.tier-filter-chip');
  chips.forEach(chip => {
    if (chip.getAttribute('data-tier') === 'ALL') {
      chip.classList.add('active', 'bg-brand-600', 'text-white');
    } else {
      chip.classList.remove('active', 'bg-brand-600', 'text-white');
    }
  });

  const presetBtns = document.querySelectorAll('.cust-date-preset-btn');
  presetBtns.forEach(btn => {
    if (btn.getAttribute('data-cust-preset') === 'all') {
      btn.className = 'cust-date-preset-btn active px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-brand-600 text-white shadow-sm';
    } else {
      btn.className = 'cust-date-preset-btn px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10';
    }
  });

  const startEl = document.getElementById('filter-customer-start-date');
  const endEl = document.getElementById('filter-customer-end-date');
  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';

  const monthSel = document.getElementById('filter-customer-month');
  if (monthSel) monthSel.value = '';

  const ind = document.getElementById('customer-date-filter-indicator');
  if (ind) ind.classList.add('hidden');
  const clearDateBtn = document.getElementById('btn-clear-customer-date');
  if (clearDateBtn) clearDateBtn.classList.add('hidden');

  renderCustomerList();
}

function setTierFilter(tier) {
      AppState.pagination.page = 1;
  AppState.filters.tier = tier;
  const chips = document.querySelectorAll('.tier-filter-chip');
  chips.forEach(chip => {
    if (chip.getAttribute('data-tier') === tier) {
      chip.classList.add('active', 'bg-brand-600', 'text-white');
    } else {
      chip.classList.remove('active', 'bg-brand-600', 'text-white');
    }
  });
  renderCustomerList();
}

function setCustomerView(mode) {
  AppState.filters.viewMode = mode;
  const btnCards = document.getElementById('view-mode-cards');
  const btnTable = document.getElementById('view-mode-table');
  const cardsContainer = document.getElementById('customer-cards-container');
  const tableContainer = document.getElementById('customer-table-container');

  if (btnCards && btnTable) {
    if (mode === 'cards') {
      btnCards.className = 'p-2 rounded-lg text-white bg-brand-600 shadow';
      btnTable.className = 'p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white';
      if (cardsContainer) cardsContainer.classList.remove('hidden');
      if (tableContainer) tableContainer.classList.add('hidden');
    } else {
      btnTable.className = 'p-2 rounded-lg text-white bg-brand-600 shadow';
      btnCards.className = 'p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white';
      if (cardsContainer) cardsContainer.classList.add('hidden');
      if (tableContainer) tableContainer.classList.remove('hidden');
    }
  }
  renderCustomerList();
}

function onCustomerSearchInput() {
  const input = document.getElementById('customer-search-input');
  const query = input ? input.value.trim().toLowerCase() : '';
  AppState.filters.searchQuery = query;

  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) {
    if (query) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  renderCustomerList();
}

function clearCustomerSearch() {
  const input = document.getElementById('customer-search-input');
  if (input) input.value = '';
  AppState.filters.searchQuery = '';
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  renderCustomerList();
}

function renderCustomerList() {
      const branchSel = document.getElementById('filter-customer-branch');
      const isAdmin = AppState.auth && AppState.auth.role === 'admin';
      let selectedBranch = 'ALL';
      if (isAdmin) {
        selectedBranch = (branchSel && branchSel.value) ? branchSel.value : 'ALL';
      } else if (AppState.auth && AppState.auth.branch) {
        selectedBranch = AppState.auth.branch;
        if (branchSel) {
          branchSel.value = selectedBranch;
          branchSel.disabled = true;
        }
      }

      const query = AppState.filters.searchQuery || '';
      const tierFilter = AppState.filters.tier || 'ALL';
      const sortBy = AppState.filters.sortBy || 'spend_desc';
      const startDate = AppState.filters.customerStartDate;
      const endDate = AppState.filters.customerEndDate;

      const rawCustomers = Object.values(AppState.customers || {});

      // 1. Branch-scoped customers
      const branchCustomers = [];
      for (let i = 0; i < rawCustomers.length; i++) {
        const scoped = getScopedCustomerData(rawCustomers[i], selectedBranch);
        if (scoped) branchCustomers.push(scoped);
      }

      // 2. Fast Tier Counts
      let vipC = 0, regC = 0, newC = 0, atRiskC = 0;
      for (let i = 0; i < branchCustomers.length; i++) {
        const t = branchCustomers[i].tier || '';
        if (t.includes('VIP')) vipC++;
        else if (t.includes('Loyal Regular') || t.includes('Regular')) regC++;
        else if (t.includes('New Customer') || t.includes('New')) newC++;
        else if (t.includes('At-Risk') || t.includes('Inactive')) atRiskC++;
      }

      const countAll = document.getElementById('count-tier-all');
      const countVip = document.getElementById('count-tier-vip');
      const countReg = document.getElementById('count-tier-regular');
      const countNew = document.getElementById('count-tier-new');
      const countAtRisk = document.getElementById('count-tier-atrisk');
      const headerCustCount = document.getElementById('tab-cust-count');

      if (countAll) countAll.textContent = formatNumber(branchCustomers.length);
      if (countVip) countVip.textContent = formatNumber(vipC);
      if (countReg) countReg.textContent = formatNumber(regC);
      if (countNew) countNew.textContent = formatNumber(newC);
      if (countAtRisk) countAtRisk.textContent = formatNumber(atRiskC);
      if (headerCustCount) headerCustCount.textContent = formatNumber(branchCustomers.length);

      // 3. Fast Filter by Tier, Date Range, Indexed Search Query
      let filtered = branchCustomers.filter(c => {
        if (tierFilter !== 'ALL') {
          if (tierFilter === 'VIP' && !c.tier.includes('VIP')) return false;
          if (tierFilter === 'REGULAR' && !c.tier.includes('Regular')) return false;
          if (tierFilter === 'NEW' && !c.tier.includes('New')) return false;
          if (tierFilter === 'AT_RISK' && (!c.tier.includes('At-Risk') && !c.tier.includes('Inactive'))) return false;
        }

        if (startDate || endDate) {
          const purchases = c.purchases || [];
          let hasDate = false;
          for (let p = 0; p < purchases.length; p++) {
            const d = purchases[p].date;
            if (startDate && d < startDate) continue;
            if (endDate && d > endDate) continue;
            hasDate = true;
            break;
          }
          if (!hasDate) return false;
        }

        if (query) {
          if (c._searchIdx) {
            if (c._searchIdx.indexOf(query) === -1) return false;
          } else {
            const name = (c.name || '').toLowerCase();
            const phone = (c.phone || '').toLowerCase();
            const id = (c.id || '').toLowerCase();
            if (!name.includes(query) && !phone.includes(query) && !id.includes(query)) return false;
          }
        }

        return true;
      });

      // 4. Sort Customers
      filtered.sort((a, b) => {
        if (sortBy === 'spend_desc') return (b.totalSpend || 0) - (a.totalSpend || 0);
        if (sortBy === 'period_spend_desc') return (b.totalSpend || 0) - (a.totalSpend || 0);
        if (sortBy === 'visits_desc') return (b.totalVisits || 0) - (a.totalVisits || 0);
        if (sortBy === 'recent_desc') return (b.lastPurchaseDate || '').localeCompare(a.lastPurchaseDate || '');
        if (sortBy === 'aov_desc') return (b.averageOrderValue || 0) - (a.averageOrderValue || 0);
        if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
        if (sortBy === 'at_risk') {
          const aRisk = (a.tier || '').includes('At-Risk') || (a.tier || '').includes('Inactive') ? 1 : 0;
          const bRisk = (b.tier || '').includes('At-Risk') || (b.tier || '').includes('Inactive') ? 1 : 0;
          return bRisk - aRisk;
        }
        return 0;
      });

      AppState.currentFilteredCustomers = filtered;

      // 5. Pagination Slicing (Renders in < 3ms even with 50,000 items)
      const totalCount = filtered.length;
      const pageSize = AppState.pagination.pageSize || 50;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      AppState.pagination.totalPages = totalPages;
      if (AppState.pagination.page > totalPages) AppState.pagination.page = totalPages;
      if (AppState.pagination.page < 1) AppState.pagination.page = 1;
      const currentPage = AppState.pagination.page;

      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalCount);
      const pageItems = filtered.slice(startIndex, endIndex);

      // Update Pagination Controls
      const paginationBar = document.getElementById('customer-pagination-bar');
      const pageStartEl = document.getElementById('cust-page-start');
      const pageEndEl = document.getElementById('cust-page-end');
      const totalCountEl = document.getElementById('cust-total-count');
      const currentPageEl = document.getElementById('cust-current-page');
      const totalPagesEl = document.getElementById('cust-total-pages');
      const btnFirst = document.getElementById('btn-cust-first');
      const btnPrev = document.getElementById('btn-cust-prev');
      const btnNext = document.getElementById('btn-cust-next');
      const btnLast = document.getElementById('btn-cust-last');

      if (pageStartEl) pageStartEl.textContent = totalCount > 0 ? (startIndex + 1) : 0;
      if (pageEndEl) pageEndEl.textContent = endIndex;
      if (totalCountEl) totalCountEl.textContent = formatNumber(totalCount);
      if (currentPageEl) currentPageEl.textContent = currentPage;
      if (totalPagesEl) totalPagesEl.textContent = totalPages;

      if (btnFirst) btnFirst.disabled = (currentPage === 1);
      if (btnPrev) btnPrev.disabled = (currentPage === 1);
      if (btnNext) btnNext.disabled = (currentPage === totalPages || totalCount === 0);
      if (btnLast) btnLast.disabled = (currentPage === totalPages || totalCount === 0);

      const cardsContainer = document.getElementById('customer-cards-container');
      const tableBody = document.getElementById('customer-table-body');
      const emptyState = document.getElementById('customer-empty-state');
      const tableWrapper = document.getElementById('customer-table-container');
      const curr = AppState.settings.currencySymbol || '৳';

      if (totalCount === 0) {
        if (cardsContainer) cardsContainer.innerHTML = '';
        if (tableBody) tableBody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        if (tableWrapper) tableWrapper.classList.add('hidden');
        if (paginationBar) paginationBar.classList.add('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');
      if (paginationBar) paginationBar.classList.remove('hidden');

      // 6. Active-Only Rendering (Prevents dual 200k DOM allocations)
      if (AppState.filters.viewMode === 'cards') {
        if (tableWrapper) tableWrapper.classList.add('hidden');
        if (tableBody) tableBody.innerHTML = '';
        if (cardsContainer) {
          cardsContainer.classList.remove('hidden');
          cardsContainer.innerHTML = pageItems.map(c => renderCustomerCardHtml(c, curr)).join('');
        }
      } else {
        if (cardsContainer) {
          cardsContainer.classList.add('hidden');
          cardsContainer.innerHTML = '';
        }
        if (tableWrapper) tableWrapper.classList.remove('hidden');
        if (tableBody) {
          tableBody.innerHTML = pageItems.map((c, idx) => renderCustomerTableRowHtml(c, curr, startIndex + idx)).join('');
        }
      }
    }

    
    function goToCustomerPage(pageNum) {
      const totalPages = AppState.pagination.totalPages || 1;
      const target = Math.max(1, Math.min(pageNum, totalPages));
      if (target === AppState.pagination.page) return;
      AppState.pagination.page = target;
      renderCustomerList();

      const searchInput = document.getElementById('customer-search-input');
      if (searchInput) {
        searchInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    window.goToCustomerPage = goToCustomerPage;

    function changeCustomerPageSize(size) {
      AppState.pagination.pageSize = parseInt(size, 10) || 50;
      AppState.pagination.page = 1;
      renderCustomerList();
    }
    window.changeCustomerPageSize = changeCustomerPageSize;

    function renderCustomerCardHtml(c, curr) {
      const key = c.phone || ('NAME_' + c.name);
      const encodedKey = encodeURIComponent(key);
      return `
        <div class="glass-card p-4 rounded-2xl space-y-3 hover:border-brand-500/50 transition-all cursor-pointer flex flex-col justify-between shadow-sm" onclick="openCustomerModal('${encodedKey}')">
          <div>
            <div class="flex items-start justify-between gap-2 mb-2">
              <div>
                <h4 class="font-extrabold text-sm text-gray-900 dark:text-white truncate max-w-[180px]">${escapeHtml(c.name || 'Walk-in Customer')}</h4>
                <div class="flex items-center gap-1.5 text-xs text-gray-500 font-mono mt-0.5">
                  <svg class="svg-icon w-3 h-3 text-gray-400" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <span>${escapeHtml(c.phone || 'No Phone')}</span>
                </div>
              </div>
              ${getTierBadgeHtml(c.tier)}
            </div>

            <div class="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-white/5 text-[11px]">
              <div>
                <span class="text-gray-400 block text-[10px] uppercase font-semibold">Total Spend</span>
                <span class="font-mono font-bold text-brand-600 dark:text-brand-400">${curr} ${formatNumber(c.totalSpend)}</span>
              </div>
              <div>
                <span class="text-gray-400 block text-[10px] uppercase font-semibold">Visits</span>
                <span class="font-mono font-bold text-gray-800 dark:text-gray-200">${c.totalVisits} Orders</span>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5 text-xs">
            <div class="flex items-center gap-1 text-gray-400 text-[11px]">
              <svg class="svg-icon w-3 h-3" viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M19 21v-4"/><path d="M19 17a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4"/><path d="M9 10h1"/><path d="M14 10h1"/><path d="M9 14h1"/><path d="M14 14h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>
              <span class="truncate max-w-[120px]">${escapeHtml(c.primaryBranch || 'Main Branch')}</span>
            </div>
            <button class="px-2.5 py-1 bg-brand-600/10 hover:bg-brand-600/20 text-brand-600 dark:text-brand-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
              <svg class="svg-icon w-3 h-3" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>History</span>
            </button>
          </div>
        </div>
      `;
    }

    function renderCustomerTableRowHtml(c, curr, index) {
      const key = c.phone || ('NAME_' + c.name);
      const encodedKey = encodeURIComponent(key);
      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-xs cursor-pointer" onclick="openCustomerModal('${encodedKey}')">
          <td class="py-3 px-4 font-semibold text-gray-900 dark:text-white font-sans flex items-center gap-2">
            <span class="font-mono text-gray-400 text-[10px]">#${index + 1}</span>
            <span>${escapeHtml(c.name || 'Walk-in Customer')}</span>
          </td>
          <td class="py-3 px-4 font-mono text-gray-600 dark:text-gray-400">${escapeHtml(c.phone || '-')}</td>
          <td class="py-3 px-4 font-sans">${getTierBadgeHtml(c.tier)}</td>
          <td class="py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 font-sans">${escapeHtml(c.primaryBranch || 'Main Branch')}</td>
          <td class="py-3 px-4 text-center font-mono font-bold">${c.totalVisits}</td>
          <td class="py-3 px-4 text-right font-mono font-bold text-brand-600 dark:text-brand-400">${curr} ${formatNumber(c.totalSpend)}</td>
          <td class="py-3 px-4 text-right font-mono text-gray-600 dark:text-gray-400">${curr} ${formatNumber(c.averageOrderValue)}</td>
          <td class="py-3 px-4 font-mono text-gray-500">${formatPos2inDisplayDate(c.lastPurchaseDate)}</td>
          <td class="py-3 px-4 text-center font-sans">
            <button onclick="openCustomerModal('${encodedKey}'); event.stopPropagation();" class="px-2.5 py-1 bg-brand-600/10 hover:bg-brand-600/20 text-brand-600 dark:text-brand-400 rounded-lg text-xs font-bold transition-all">
              View
            </button>
          </td>
        </tr>
      `;
    }


    function getTierBadgeHtml(tier) {
  const t = tier || 'New Customer';
  if (t.includes('VIP')) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1.5 w-fit"><svg class="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span>${escapeHtml(t)}</span></span>`;
  } else if (t.includes('Regular')) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/30 flex items-center gap-1.5 w-fit"><svg class="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg><span>${escapeHtml(t)}</span></span>`;
  } else if (t.includes('New')) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 w-fit"><svg class="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x1="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg><span>${escapeHtml(t)}</span></span>`;
  } else if (t.includes('At-Risk') || t.includes('Inactive') || t.includes('Dormant')) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-500/30 flex items-center gap-1.5 w-fit"><svg class="w-3 h-3 text-rose-600 dark:text-rose-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg><span>${escapeHtml(t)}</span></span>`;
  }
  return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-800 dark:text-slate-300 border border-slate-500/30 flex items-center gap-1.5 w-fit"><svg class="w-3 h-3 text-slate-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><span>${escapeHtml(t)}</span></span>`;
}

function openCustomerModal(encodedKey) {
  const key = decodeURIComponent(encodedKey);
  const rawCust = AppState.customers[key];
  if (!rawCust) {
    showToast('Customer record not found', 'error');
    return;
  }

  const isAdmin = AppState.auth && AppState.auth.role === 'admin';
  const branchSel = document.getElementById('filter-customer-branch');
  let targetBranch = 'ALL';
  if (isAdmin) {
    targetBranch = (branchSel && branchSel.value) ? branchSel.value : 'ALL';
  } else if (AppState.auth && AppState.auth.branch) {
    targetBranch = AppState.auth.branch;
  }

  const cust = getScopedCustomerData(rawCust, targetBranch);
  if (!cust) {
    showToast('Customer has no purchase records for this branch', 'error');
    return;
  }

  AppState.selectedCustomer = cust;
  const modal = document.getElementById('customer-modal');
  const avatarEl = document.getElementById('modal-cust-avatar');
  const nameEl = document.getElementById('modal-cust-name');
  const phoneEl = document.getElementById('modal-cust-phone');
  const idEl = document.getElementById('modal-cust-id');
  const branchEl = document.getElementById('modal-cust-branch');
  const tierEl = document.getElementById('modal-cust-tier');

  const spendEl = document.getElementById('modal-stat-spend');
  const visitsEl = document.getElementById('modal-stat-visits');
  const aovEl = document.getElementById('modal-stat-aov');
  const branchesEl = document.getElementById('modal-stat-branches');

  const firstEl = document.getElementById('modal-first-date');
  const lastEl = document.getElementById('modal-last-date');
  const countEl = document.getElementById('modal-history-count');
  const tableBody = document.getElementById('modal-purchases-table-body');
  const curr = AppState.settings.currencySymbol || '৳';

  const initials = (cust.name || 'CU').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (avatarEl) avatarEl.textContent = initials || 'CU';

  if (nameEl) nameEl.textContent = cust.name || 'Walk-in Customer';
  if (phoneEl) phoneEl.textContent = cust.phone || 'No Phone';
  if (idEl) idEl.textContent = cust.id || 'CUST-XXXX';
  if (branchEl) branchEl.textContent = cust.primaryBranch || (targetBranch !== 'ALL' ? targetBranch : 'Main Branch');
  if (tierEl) tierEl.innerHTML = getTierBadgeHtml(cust.tier);

  if (spendEl) spendEl.textContent = `${curr} ${formatNumber(cust.totalSpend)}`;
  if (visitsEl) visitsEl.textContent = `${cust.totalVisits} Orders`;
  if (aovEl) aovEl.textContent = `${curr} ${formatNumber(cust.averageOrderValue)}`;

  const visitedBranches = Object.keys(cust.branchVisits || {});
  if (branchesEl) branchesEl.textContent = visitedBranches.length > 0 ? visitedBranches.join(', ') : (cust.primaryBranch || (targetBranch !== 'ALL' ? targetBranch : 'Main Branch'));

  if (firstEl) firstEl.textContent = formatPos2inDisplayDate(cust.firstPurchaseDate);
  if (lastEl) lastEl.textContent = formatPos2inDisplayDate(cust.lastPurchaseDate);

  // WhatsApp Button
  const waBtn = document.getElementById('modal-whatsapp-btn');
  if (waBtn) {
    if (cust.phone) {
      waBtn.href = `https://wa.me/${formatWhatsAppNumber(cust.phone)}`;
      waBtn.classList.remove('hidden');
    } else {
      waBtn.classList.add('hidden');
    }
  }

  // Purchases Table
  const sortedPurchases = (cust.purchases || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (countEl) countEl.textContent = sortedPurchases.length;

  if (tableBody) {
    if (sortedPurchases.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-xs text-gray-500">No purchase records available for this branch.</td></tr>';
    } else {
      tableBody.innerHTML = sortedPurchases.map(p => `
            <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-xs">
              <td class="py-2.5 px-3 font-mono font-bold text-brand-600 dark:text-brand-400">${escapeHtml(p.invoiceNo)}</td>
              <td class="py-2.5 px-3 font-mono text-gray-500">${formatPos2inDisplayDate(p.date)}</td>
              <td class="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300">${escapeHtml(p.branch || 'Main Branch')}</td>
              <td class="py-2.5 px-3 text-gray-600 dark:text-gray-400 font-sans">${escapeHtml(p.items || 'General Purchase')}</td>
              <td class="py-2.5 px-3 text-gray-500 font-sans">${escapeHtml(p.salesStaff || '-')}</td>
              <td class="py-2.5 px-3 text-right font-mono font-bold text-gray-900 dark:text-white">${curr} ${formatNumber(p.amount)}</td>
            </tr>
          `).join('');
    }
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeCustomerModal() {
  const modal = document.getElementById('customer-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function copyCustomerPhone(phone) {
  const targetPhone = phone || (AppState.selectedCustomer ? AppState.selectedCustomer.phone : '');
  if (!targetPhone) {
    showToast('No phone number available to copy', 'error');
    return;
  }
  navigator.clipboard.writeText(targetPhone).then(() => {
    showToast(`Copied ${targetPhone} to clipboard!`, 'success');
  }).catch(() => {
    // Fallback copy
    const temp = document.createElement('textarea');
    temp.value = targetPhone;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
    showToast(`Copied ${targetPhone} to clipboard!`, 'success');
  });
}

function exportCustomersToCSV() {
  const customers = AppState.currentFilteredCustomers || [];
  if (customers.length === 0) {
    showToast('No customer records match active filter to export', 'error');
    return;
  }

  let csv = 'ID,Name,Phone,Tier,Primary Branch,Total Spend,Visits,AOV,First Purchase,Last Purchase\n';
  customers.forEach(c => {
    csv += `"${c.id || ''}","${c.name || ''}","${c.phone || ''}","${c.tier || ''}","${c.primaryBranch || ''}",${c.totalSpend || 0},${c.totalVisits || 0},${c.averageOrderValue || 0},"${c.firstPurchaseDate || ''}","${c.lastPurchaseDate || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pos2in_customers_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${customers.length} customer records to CSV!`, 'success');
}

/**
 * ===============================================================
 * POS2IN CSV IMPORT CENTER
 * ===============================================================
 */
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('drop-zone');
  if (zone) zone.classList.add('border-brand-500', 'bg-brand-50/20');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById('drop-zone');
  if (zone) zone.classList.remove('border-brand-500', 'bg-brand-50/20');
}

function handleFileDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  handleDragLeave(e);
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    processSelectedFile(files[0]);
  }
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    processSelectedFile(files[0]);
  }
}

function processSelectedFile(file) {
  if (!file) return;

  const badge = document.getElementById('file-info-badge');
  const nameText = document.getElementById('file-name-text');
  if (nameText) nameText.textContent = file.name;
  if (badge) badge.classList.remove('hidden');

  const reader = new FileReader();
  reader.onload = function (evt) {
    const text = evt.target.result;
    parsePos2inData(text);
  };
  reader.readAsText(file);
}

function parseRawPasteContent(explicit) {
  const ta = document.getElementById('raw-paste-area');
  const pasteStats = document.getElementById('paste-stats');
  if (!ta || !ta.value.trim()) {
    if (explicit) showToast('Please paste CSV text into the box', 'error');
    if (pasteStats) pasteStats.textContent = '0 rows detected';
    return;
  }
  const rawText = ta.value.trim();
  const lineCount = rawText.split(/\r?\n/).filter(l => l.trim().length > 0).length;
  if (pasteStats) pasteStats.textContent = `${Math.max(0, lineCount - 1)} data rows detected`;

  if (explicit) {
    parsePos2inData(rawText);
  }
}

function clearPasteArea() {
  const ta = document.getElementById('raw-paste-area');
  const pasteStats = document.getElementById('paste-stats');
  if (ta) ta.value = '';
  if (pasteStats) pasteStats.textContent = '0 rows detected';
}

function parsePos2inData(text) {
  if (!text || !text.trim()) {
    showToast('File or input is empty', 'error');
    return;
  }

  let rawRows = [];
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      rawRows = Array.isArray(parsedJson) ? parsedJson : (parsedJson.customers || parsedJson.invoices || [parsedJson]);
    } catch (e) {
      rawRows = parseCSV(trimmed);
    }
  } else {
    rawRows = parseCSV(trimmed);
  }

  if (rawRows.length === 0) {
    showToast('No valid CSV / JSON transaction rows detected', 'error');
    return;
  }

  AppState.parsedImportInvoices = rawRows;
  renderImportPreview(rawRows);
  showToast(`Detected ${rawRows.length} transaction entries ready for import!`, 'success');
}

function onImportBranchChanged() {
  if (AppState.parsedImportInvoices && AppState.parsedImportInvoices.length > 0) {
    renderImportPreview(AppState.parsedImportInvoices);
  }
}

function renderImportPreview(rows) {
  const previewBox = document.getElementById('import-preview-section');
  const badgeCount = document.getElementById('preview-badge-count');
  const branchEl = document.getElementById('preview-stat-branch');
  const amountEl = document.getElementById('preview-stat-amount');
  const custEl = document.getElementById('preview-stat-customers');
  const datesEl = document.getElementById('preview-stat-dates');
  const tbody = document.getElementById('preview-table-body');
  const branchSel = document.getElementById('import-branch-select');
  const targetBranch = branchSel ? branchSel.value : 'AUTO';
  const curr = AppState.settings.currencySymbol || '৳';

  // Aggregate preview stats
  const uniqueCusts = new Set();
  let totalAmount = 0;
  let minDate = '';
  let maxDate = '';

  rows.forEach(r => {
    const invNo = getRecordField(r, 'invoiceNo', 'Invoice No', 'InvoiceNo', 'billNo', 'Bill No', 'BillNo', 'invoice', 'voucherNo') || '';
    const dt = getRecordField(r, 'salesDate', 'Sales Date', 'Date', 'date', 'invoiceDate', 'Invoice Date') || '';
    const cust = getRecordField(r, 'customer', 'Customer', 'customerName', 'Customer Name', 'CustomerName', 'name') || 'Walk-in Customer';
    const ph = getRecordField(r, 'phone', 'Phone', 'mobile', 'Mobile', 'contact', 'Contact') || '';
    const amt = parseNumber(getRecordField(r, 'netPayable', 'Net Payable', 'netAmount', 'Net Amount', 'paid', 'Paid', 'amount', 'subTotal', 'Sub Total') || 0);

    if (ph) uniqueCusts.add(ph);
    else if (cust && cust !== 'Walk-in Customer') uniqueCusts.add('NAME_' + cust);

    totalAmount += amt;

    if (dt) {
      if (!minDate || dt < minDate) minDate = dt;
      if (!maxDate || dt > maxDate) maxDate = dt;
    }
  });

  if (badgeCount) badgeCount.textContent = `${rows.length} Entries Validated`;
  if (branchEl) branchEl.textContent = (targetBranch === 'AUTO') ? 'Auto-Detected (CSV)' : targetBranch;
  if (amountEl) amountEl.textContent = `${curr} ${formatNumber(totalAmount)}`;
  if (custEl) custEl.textContent = uniqueCusts.size || rows.length;
  if (datesEl) datesEl.textContent = minDate && maxDate ? `${minDate} to ${maxDate}` : '-';

  if (tbody) {
    tbody.innerHTML = rows.slice(0, 25).map((r, idx) => {
      const invNo = getRecordField(r, 'invoiceNo', 'Invoice No', 'InvoiceNo', 'billNo', 'Bill No', 'BillNo', 'invoice', 'voucherNo') || '-';
      const dt = getRecordField(r, 'salesDate', 'Sales Date', 'Date', 'date', 'invoiceDate', 'Invoice Date') || '-';
      const cust = getRecordField(r, 'customer', 'Customer', 'customerName', 'Customer Name', 'CustomerName', 'name') || 'Walk-in Customer';
      const ph = getRecordField(r, 'phone', 'Phone', 'mobile', 'Mobile', 'contact', 'Contact') || '-';
      const rowBranch = (targetBranch && targetBranch !== 'AUTO')
        ? targetBranch
        : (getRecordField(r, 'branch', 'Branch', 'salesPoint', 'Sales Point') || 'Main Branch');
      const amt = parseNumber(getRecordField(r, 'netPayable', 'Net Payable', 'netAmount', 'Net Amount', 'paid', 'Paid', 'amount', 'subTotal', 'Sub Total') || 0);
      const items = getRecordField(r, 'items', 'Items', 'productModel', 'Product Model/Name', 'Product Model', 'itemName', 'Item Name') || '-';

      return `
            <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-xs">
              <td class="py-2.5 px-3 font-mono font-bold text-gray-400">#${idx + 1}</td>
              <td class="py-2.5 px-3 font-mono font-bold text-brand-600 dark:text-brand-400">${escapeHtml(invNo)}</td>
              <td class="py-2.5 px-3 font-mono text-gray-500">${escapeHtml(dt)}</td>
              <td class="py-2.5 px-3 font-semibold text-gray-900 dark:text-white font-sans">${escapeHtml(cust)}</td>
              <td class="py-2.5 px-3 font-mono text-gray-600 dark:text-gray-400">${escapeHtml(ph)}</td>
              <td class="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300 font-sans">${escapeHtml(rowBranch)}</td>
              <td class="py-2.5 px-3 text-right font-mono font-bold text-gray-900 dark:text-white">${curr} ${formatNumber(amt)}</td>
              <td class="py-2.5 px-3 text-gray-500 font-sans truncate max-w-[150px]">${escapeHtml(items)}</td>
            </tr>
          `;
    }).join('');
  }

  if (previewBox) {
    previewBox.classList.remove('hidden');
    previewBox.scrollIntoView({ behavior: 'smooth' });
  }
}

function cancelImportPreview() {
  AppState.parsedImportInvoices = [];
  const previewBox = document.getElementById('import-preview-section');
  if (previewBox) previewBox.classList.add('hidden');

  const badge = document.getElementById('file-info-badge');
  if (badge) badge.classList.add('hidden');

  const fileInput = document.getElementById('pos-file-input');
  if (fileInput) fileInput.value = '';

  clearPasteArea();
}

async function executeSaveToDatabase() {
  const rows = AppState.parsedImportInvoices;
  if (!rows || rows.length === 0) {
    showToast('No parsed invoices to save', 'error');
    return;
  }

  const branchSel = document.getElementById('import-branch-select');
  const targetBranch = branchSel ? branchSel.value : 'AUTO';
  const btn = document.getElementById('btn-save-sheets') || document.getElementById('btn-execute-import-save');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block animate-spin mr-2"><svg class="svg-icon w-3.5 h-3.5 text-white" viewBox="0 0 24 24"><line x1="12" x2="12" y1="2" y2="6"/><line x1="12" x2="12" y1="18" y2="22"/><line x1="4.93" x2="7.76" y1="4.93" y2="7.76"/><line x1="16.24" x2="19.07" y1="16.24" y2="19.07"/><line x1="2" x2="6" y1="12" y2="12"/><line x1="18" x2="22" y1="12" y2="12"/><line x1="4.93" x2="7.76" y1="19.07" y2="16.24"/><line x1="16.24" x2="19.07" y1="7.76" y2="4.93"/></svg></span> Saving to Firebase Cloud...';
  }

  try {
    const res = await FirebaseEngine.saveImportBatch(targetBranch, rows, (done, total) => {
      if (btn) btn.innerHTML = `<span class="inline-block animate-spin mr-2"><svg class="svg-icon w-3.5 h-3.5 text-white" viewBox="0 0 24 24"><line x1="12" x2="12" y1="2" y2="6"/><line x1="12" x2="12" y1="18" y2="22"/><line x1="4.93" x2="7.76" y1="4.93" y2="7.76"/><line x1="16.24" x2="19.07" y1="16.24" y2="19.07"/><line x1="2" x2="6" y1="12" y2="12"/><line x1="18" x2="22" y1="12" y2="12"/><line x1="4.93" x2="7.76" y1="19.07" y2="16.24"/><line x1="16.24" x2="19.07" y1="7.76" y2="4.93"/></svg></span> Saved ${done}/${total} profiles...`;
    });

    const branchLabel = (targetBranch === 'AUTO') ? 'All Branches' : targetBranch;
    showToast(`Successfully saved ${res.importedInvoices} invoices for [${branchLabel}] in Firebase Database!`, 'success');
    cancelImportPreview();
    onDataLoaded();
    switchTab('dashboard');
  } catch (err) {
    console.error('Import save error:', err);
    showToast('Error saving to Cloud: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="svg-icon w-4 h-4 text-white" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg> Process & Save to Database';
    }
  }
}

// Backward compatibility alias for HTML button
window.executeSaveToGoogleSheets = executeSaveToDatabase;

/**
 * ===============================================================
 * DATA MANAGEMENT & DELETION CENTER
 * ===============================================================
 */
function getDeletionFilterCriteria() {
  const branchSel = document.getElementById('delete-filter-branch') || document.getElementById('delete-branch-select');
  const startEl = document.getElementById('delete-start-date');
  const endEl = document.getElementById('delete-end-date');
  const monthSel = document.getElementById('delete-filter-month') || document.getElementById('delete-month-select');
  const yearSel = document.getElementById('delete-filter-year') || document.getElementById('delete-year-select');

  const branch = branchSel ? branchSel.value : 'ALL';
  let startDate = startEl ? startEl.value : null;
  let endDate = endEl ? endEl.value : null;

  const month = monthSel ? monthSel.value : '';
  const year = yearSel ? yearSel.value : '2025';

  if (month) {
    startDate = `${year}-${month}-01`;
    endDate = `${year}-${month}-31`;
  }

  return { branch, startDate, endDate };
}

function previewDeletionMatches() {
  const crit = getDeletionFilterCriteria();
  let matchCount = 0;
  let matchAmount = 0;
  const matchingInvoices = [];

  Object.values(AppState.customers || {}).forEach(c => {
    (c.purchases || []).forEach(p => {
      if (crit.branch !== 'ALL' && p.branch !== crit.branch) return;
      if (crit.startDate && p.date < crit.startDate) return;
      if (crit.endDate && p.date > crit.endDate) return;
      matchCount++;
      matchAmount += parseNumber(p.amount);
      matchingInvoices.push({
        invoiceNo: p.invoiceNo,
        date: p.date,
        customerName: c.name,
        branch: p.branch,
        amount: p.amount
      });
    });
  });

  const previewBox = document.getElementById('delete-preview-box');
  const countEl = document.getElementById('delete-match-count');
  const amountEl = document.getElementById('delete-match-amount');
  const tbody = document.getElementById('delete-preview-tbody');
  const curr = AppState.settings.currencySymbol || '৳';

  if (countEl) countEl.textContent = `${matchCount} Invoices`;
  if (amountEl) amountEl.textContent = `${curr} ${formatNumber(matchAmount)}`;

  if (tbody) {
    if (matchingInvoices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-xs text-gray-500">No matching records found.</td></tr>';
    } else {
      tbody.innerHTML = matchingInvoices.slice(0, 15).map(m => `
            <tr class="text-[11px]">
              <td class="py-1.5 px-2 font-mono font-bold text-rose-500">${escapeHtml(m.invoiceNo)}</td>
              <td class="py-1.5 px-2 font-mono text-gray-500">${escapeHtml(m.date)}</td>
              <td class="py-1.5 px-2 font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(m.customerName)}</td>
              <td class="py-1.5 px-2 font-semibold text-gray-700 dark:text-gray-300">${escapeHtml(m.branch)}</td>
              <td class="py-1.5 px-2 text-right font-mono font-bold text-gray-900 dark:text-white">${curr} ${formatNumber(m.amount)}</td>
            </tr>
          `).join('');
    }
  }

  if (previewBox) previewBox.classList.remove('hidden');
}

async function executeDeletionByFilter() {
  const crit = getDeletionFilterCriteria();
  if (!confirm(`Are you sure you want to delete records matching Branch: [${crit.branch}], Date: [${crit.startDate || 'Any'} to ${crit.endDate || 'Any'}]?`)) {
    return;
  }

  try {
    const res = await FirebaseEngine.deleteRecords(crit);
    showToast(`Deleted ${res.deletedInvoices} invoices and ${res.deletedCustomers} customer profiles!`, 'success');
    previewDeletionMatches();
    onDataLoaded();
  } catch (err) {
    showToast('Deletion error: ' + err.message, 'error');
  }
}

function onDeleteSearchInput() {
  const input = document.getElementById('delete-search-input');
  const query = input ? input.value.trim().toLowerCase() : '';
  const container = document.getElementById('delete-search-results');

  if (!query || !container) {
    if (container) container.innerHTML = '<div class="text-xs text-gray-400 italic text-center py-6">Type a phone number or invoice number to locate records</div>';
    return;
  }

  const matches = [];
  Object.values(AppState.customers || {}).forEach(c => {
    const matchName = (c.name || '').toLowerCase().includes(query);
    const matchPhone = (c.phone || '').toLowerCase().includes(query);
    const matchId = (c.id || '').toLowerCase().includes(query);

    if (matchName || matchPhone || matchId) {
      matches.push({ type: 'customer', customer: c });
    }

    (c.purchases || []).forEach(p => {
      if ((p.invoiceNo || '').toLowerCase().includes(query)) {
        matches.push({ type: 'invoice', invoice: p, customer: c });
      }
    });
  });

  if (matches.length === 0) {
    container.innerHTML = '<p class="text-xs text-gray-500 py-3 text-center">No matching invoices or customer profiles found.</p>';
    return;
  }

  const curr = AppState.settings.currencySymbol || '৳';
  container.innerHTML = matches.slice(0, 10).map(m => {
    if (m.type === 'customer') {
      const key = m.customer.phone || ('NAME_' + m.customer.name);
      return `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-xs">
              <div>
                <span class="font-bold text-gray-900 dark:text-white">${escapeHtml(m.customer.name)}</span>
                <span class="font-mono text-gray-500 ml-2">${escapeHtml(m.customer.phone || 'No Phone')}</span>
                <span class="text-[10px] text-gray-400 block mt-0.5">(${m.customer.purchases.length} total orders)</span>
              </div>
              <button onclick="deleteSingleCustomer('${encodeURIComponent(key)}')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all">
                Delete Customer
              </button>
            </div>
          `;
    } else {
      return `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-xs">
              <div>
                <span class="font-mono font-bold text-brand-600 dark:text-brand-400">Invoice #${escapeHtml(m.invoice.invoiceNo)}</span>
                <span class="text-gray-500 ml-2">${escapeHtml(m.customer.name)} - ${curr} ${formatNumber(m.invoice.amount)}</span>
              </div>
              <button onclick="deleteSingleInvoice('${escapeHtml(m.invoice.invoiceNo)}')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all">
                Delete Invoice
              </button>
            </div>
          `;
    }
  }).join('');
}

async function deleteSingleCustomer(encodedKey) {
  const key = decodeURIComponent(encodedKey);
  if (!confirm(`Are you sure you want to completely delete this customer profile and all purchase history?`)) return;

  try {
    const res = await FirebaseEngine.deleteRecords({ customerKey: key, deleteCustomerProfile: true });
    showToast('Customer profile deleted!', 'success');
    onDeleteSearchInput();
    onDataLoaded();
  } catch (err) {
    showToast('Deletion error: ' + err.message, 'error');
  }
}

async function deleteSingleInvoice(invNo) {
  if (!confirm(`Delete invoice #${invNo}?`)) return;

  try {
    const res = await FirebaseEngine.deleteRecords({ invoiceNo: invNo });
    showToast(`Invoice #${invNo} deleted!`, 'success');
    onDeleteSearchInput();
    onDataLoaded();
  } catch (err) {
    showToast('Deletion error: ' + err.message, 'error');
  }
}

async function executeServerOrLocalDeletion(criteria) {
  return await FirebaseEngine.deleteRecords(criteria);
}

/**
 * ===============================================================
 * BRANCH OUTLET SETTINGS & CRUD
 * ===============================================================
 */
function renderBranchManager() {
  const container = document.getElementById('branches-grid');
  if (!container) return;

  const branches = AppState.settings.branches || ['Main Branch', 'Dhanmondi Outlet', 'Gulshan Outlet', 'Uttara Outlet', 'Online Store'];
  const securityMap = {};
  (AppState.branchSecurity || []).forEach(b => { securityMap[b.name] = b; });

  const hasBlocked = (AppState.branchSecurity || []).some(b => b.isBlocked);

  // Prepend emergency warning if any branch is blocked
  const emergencyHtml = hasBlocked ? `
        <div class="col-span-full mb-2 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/40 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <svg class="svg-icon w-5 h-5 text-rose-500" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
            <div>
              <p class="text-xs font-bold text-rose-600 dark:text-rose-400">Some branches are locked out</p>
              <p class="text-[11px] text-rose-500">Branches with 5+ failed login attempts are blocked. Click below to reset all at once.</p>
            </div>
          </div>
          <button onclick="handleUnlockAllBranches()" class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow flex items-center gap-1.5">
            <svg class="svg-icon w-3.5 h-3.5" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
            Unlock All Branches
          </button>
        </div>
      ` : '';

  const branchCardsHtml = branches.map(b => {
    const domSafeName = b.replace(/[^a-zA-Z0-9]/g, '_');
    const secInfo = securityMap[b] || { password: b.toLowerCase().replace(/\s+/g, '') + '19', failedAttempts: 0, isBlocked: false };
    const isBlocked = secInfo.isBlocked;
    const failedAttempts = secInfo.failedAttempts || 0;
    const branchPassword = secInfo.password;

    return `
          <div class="glass-card p-4 rounded-2xl border ${isBlocked ? 'border-rose-500/40 bg-rose-50/5' : 'border-slate-200 dark:border-white/10'} space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold">
                  <svg class="svg-icon w-4 h-4" viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M19 21v-4"/><path d="M19 17a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4"/><path d="M9 10h1"/><path d="M14 10h1"/><path d="M9 14h1"/><path d="M14 14h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>
                </div>
                <div>
                  <h4 class="font-bold text-xs text-gray-900 dark:text-white">${escapeHtml(b)}</h4>
                  <span class="text-[10px] ${isBlocked ? 'text-rose-500 font-bold' : 'text-emerald-500 font-semibold'}">${isBlocked ? 'Blocked Outlet' : 'Active Outlet'}</span>
                </div>
              </div>

              <div class="flex items-center gap-1.5">
                ${isBlocked ? `
                  <button onclick="handleUnlockBranch('${escapeHtml(b)}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shadow flex items-center gap-1">
                    <svg class="svg-icon w-3 h-3" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                    <span>Unlock</span>
                  </button>
                ` : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-semibold">${failedAttempts} attempts</span>`}

                <button onclick="openEditBranchModal('${escapeHtml(b)}')" class="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors" title="Rename Branch">
                  <svg class="svg-icon w-3.5 h-3.5" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button onclick="openDeleteBranchModal('${escapeHtml(b)}')" class="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors" title="Delete Branch">
                  <svg class="svg-icon w-3.5 h-3.5" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </div>

            <!-- Password Info -->
            <div class="flex items-center justify-between gap-1 bg-white dark:bg-slate-950 p-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs">
              <span id="pw-text-${domSafeName}" class="font-mono font-bold text-brand-600 dark:text-brand-400">••••••••</span>
              <div class="flex items-center gap-1">
                <button onclick="toggleBranchCardPw('${domSafeName}', '${escapeHtml(branchPassword)}')" class="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white" title="Show/Hide Password">
                  <svg class="svg-icon w-3.5 h-3.5" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button onclick="copyToClipboard('${escapeHtml(branchPassword)}', 'Password copied for ${escapeHtml(b)}!')" class="p-1 text-gray-400 hover:text-brand-600" title="Copy Password">
                  <svg class="svg-icon w-3.5 h-3.5" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
                <button onclick="openEditBranchPasswordModal('${escapeHtml(b)}')" class="p-1 text-gray-400 hover:text-purple-600" title="Change Custom Password">
                  <svg class="svg-icon w-3.5 h-3.5" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </button>
                <button onclick="handleRegenerateBranchPassword('${escapeHtml(b)}')" class="p-1 text-gray-400 hover:text-amber-500" title="Regenerate Default Password">
                  <svg class="svg-icon w-3.5 h-3.5" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                </button>
              </div>
            </div>
          </div>
        `;
  }).join('');
  container.innerHTML = emergencyHtml + branchCardsHtml;
}

function openAddBranchModal() {
  const modal = document.getElementById('add-branch-modal');
  const input = document.getElementById('add-branch-name-input');
  if (input) input.value = '';
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeAddBranchModal() {
  const modal = document.getElementById('add-branch-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function submitNewBranch() {
  const input = document.getElementById('add-branch-name-input');
  const name = input ? input.value.trim() : '';
  if (!name) {
    showToast('Please enter a branch name', 'error');
    return;
  }

  if (!AppState.settings.branches) AppState.settings.branches = [];
  if (AppState.settings.branches.some(b => b.toLowerCase() === name.toLowerCase())) {
    showToast('Branch already exists', 'error');
    return;
  }

  AppState.settings.branches.push(name);

  // Auto-generate initial password
  if (!AppState.settings.branchPasswords) AppState.settings.branchPasswords = {};
  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rand2 = Math.floor(10 + Math.random() * 90);
  const newPw = clean + rand2;
  AppState.settings.branchPasswords[name] = newPw;

  saveAppSettings();
  closeAddBranchModal();
  showToast(`Branch "${name}" created with password: ${newPw}`, 'success');
  loadBranchSecurityData();
}

function openEditBranchModal(branchName) {
  const modal = document.getElementById('edit-branch-modal');
  const oldInput = document.getElementById('edit-branch-old-name');
  const newInput = document.getElementById('edit-branch-new-name-input');
  const currentDisplay = document.getElementById('edit-branch-current-display');
  if (currentDisplay) currentDisplay.textContent = branchName;
  if (oldInput) oldInput.value = branchName;
  if (newInput) newInput.value = branchName;
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeEditBranchModal() {
  const modal = document.getElementById('edit-branch-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function submitEditBranch() {
  const oldInput = document.getElementById('edit-branch-old-name');
  const newInput = document.getElementById('edit-branch-new-name-input');
  const oldName = oldInput ? oldInput.value.trim() : '';
  const newName = newInput ? newInput.value.trim() : '';

  if (!oldName || !newName) {
    showToast('Branch name cannot be empty', 'error');
    return;
  }
  if (oldName === newName) {
    closeEditBranchModal();
    return;
  }

  if ((AppState.settings.branches || []).some(b => b.toLowerCase() === newName.toLowerCase() && b.toLowerCase() !== oldName.toLowerCase())) {
    showToast('A branch with this new name already exists', 'error');
    return;
  }

  // Update branches array
  if (!AppState.settings.branches) AppState.settings.branches = [];
  const idx = AppState.settings.branches.indexOf(oldName);
  if (idx >= 0) {
    AppState.settings.branches[idx] = newName;
  } else {
    AppState.settings.branches.push(newName);
  }

  // Transfer password
  if (!AppState.settings.branchPasswords) AppState.settings.branchPasswords = {};
  if (AppState.settings.branchPasswords[oldName]) {
    AppState.settings.branchPasswords[newName] = AppState.settings.branchPasswords[oldName];
    delete AppState.settings.branchPasswords[oldName];
  } else {
    const clean = newName.toLowerCase().replace(/[^a-z0-9]/g, '');
    AppState.settings.branchPasswords[newName] = clean + Math.floor(10 + Math.random() * 90);
  }

  // Transfer failed login tracking
  if (AppState.settings.failedLogins && AppState.settings.failedLogins[oldName]) {
    AppState.settings.failedLogins[newName] = AppState.settings.failedLogins[oldName];
    delete AppState.settings.failedLogins[oldName];
  }

  // Cascade rename across all customer purchase records
  let modifiedCustomers = [];
  Object.values(AppState.customers || {}).forEach(c => {
    let changed = false;
    (c.purchases || []).forEach(p => {
      if (p.branch === oldName) {
        p.branch = newName;
        changed = true;
      }
    });
    if (changed) {
      modifiedCustomers.push(c);
    }
  });

  recalculateAllCustomerMetrics(AppState.customers, AppState.settings);
  saveAppSettings();

  // If connected to Firebase, persist the modified customer docs
  if (modifiedCustomers.length > 0 && typeof FirebaseEngine !== 'undefined' && FirebaseEngine.isConnected) {
    for (const c of modifiedCustomers) {
      await FirebaseEngine.saveCustomer(c);
    }
  }

  closeEditBranchModal();
  showToast(`Renamed branch "${oldName}" to "${newName}"!`, 'success');
  onDataLoaded();
  loadBranchSecurityData();
}

function openDeleteBranchModal(branchName) {
  const modal = document.getElementById('delete-branch-modal');
  const targetInput = document.getElementById('delete-branch-target-name');
  const nameText = document.getElementById('delete-branch-name-text');
  if (targetInput) targetInput.value = branchName;
  if (nameText) nameText.textContent = branchName;
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeDeleteBranchModal() {
  const modal = document.getElementById('delete-branch-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function confirmDeleteBranchWithData() {
  const targetInput = document.getElementById('delete-branch-target-name');
  const branchName = targetInput ? targetInput.value.trim() : '';
  if (!branchName) return;

  AppState.settings.branches = (AppState.settings.branches || []).filter(b => b !== branchName);
  if (AppState.settings.branchPasswords) delete AppState.settings.branchPasswords[branchName];
  if (AppState.settings.failedLogins) delete AppState.settings.failedLogins[branchName];

  // Purge invoices for this branch from customers
  let modifiedCustomers = [];
  Object.values(AppState.customers || {}).forEach(c => {
    const beforeCount = (c.purchases || []).length;
    c.purchases = (c.purchases || []).filter(p => p.branch !== branchName);
    if (c.purchases.length !== beforeCount) {
      modifiedCustomers.push(c);
    }
  });

  recalculateAllCustomerMetrics(AppState.customers, AppState.settings);
  saveAppSettings();

  if (modifiedCustomers.length > 0 && typeof FirebaseEngine !== 'undefined' && FirebaseEngine.isConnected) {
    for (const c of modifiedCustomers) {
      await FirebaseEngine.saveCustomer(c);
    }
  }

  closeDeleteBranchModal();
  showToast(`Deleted branch "${branchName}" and purged associated invoices.`, 'success');
  onDataLoaded();
  loadBranchSecurityData();
}

/**
 * ===============================================================
 * GENERAL HELPER UTILITIES
 * ===============================================================
 */
function getRecordField(rec, ...candidates) {
  if (!rec || typeof rec !== 'object') return '';
  for (const c of candidates) {
    if (rec[c] !== undefined && rec[c] !== null && String(rec[c]).trim() !== '') {
      return String(rec[c]).trim();
    }
  }
  const recKeys = Object.keys(rec);
  for (const c of candidates) {
    const cleanCand = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const k of recKeys) {
      if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanCand) {
        if (rec[k] !== undefined && rec[k] !== null && String(rec[k]).trim() !== '') {
          return String(rec[k]).trim();
        }
      }
    }
  }
  return '';
}

function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let cur = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(cur.trim());
      if (row.some(cell => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
      cur = '';
    } else {
      cur += char;
    }
  }
  if (cur || row.length) {
    row.push(cur.trim());
    if (row.some(cell => cell.length > 0)) lines.push(row);
  }

  if (lines.length === 0) return [];
  const headers = lines[0].map(h => h.trim());
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = lines[i][idx] !== undefined ? lines[i][idx] : '';
    });
    data.push(obj);
  }
  return data;
}

function normalizePos2inDate(raw) {
  if (!raw) return '';
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const parts = str.split(/[\-\s\/]+/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      let y = parts[0];
      let m = parts[1].toLowerCase();
      let d = parts[2];
      if (months[m]) m = months[m];
      else if (m.length === 1) m = '0' + m;
      if (d.length === 1) d = '0' + d;
      return `${y}-${m}-${d}`;
    } else {
      // DD-MM-YYYY
      let d = parts[0];
      let m = parts[1].toLowerCase();
      let y = parts[2];
      if (months[m]) m = months[m];
      else if (m.length === 1) m = '0' + m;
      if (d.length === 1) d = '0' + d;
      if (y.length === 2) y = '20' + y;
      return `${y}-${m}-${d}`;
    }
  }
  return str;
}

function normalizePos2inPhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/[^\d]/g, '');
  if ((digits.length === 9 || digits.length === 10) && digits.startsWith('1')) {
    digits = '0' + digits;
  } else if (digits.startsWith('880')) {
    digits = '0' + digits.slice(3);
  }
  return digits;
}

function formatCustomerName(name) {
  if (!name || !name.trim()) return 'Walk-in Customer';
  return name.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function parseNumber(val) {
  if (val === null || val === undefined) return 0;
  const clean = String(val).replace(/,/g, '').trim();
  return parseFloat(clean) || 0;
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString('en-US');
}

function formatCurrency(amount) {
  const symbol = AppState.settings.currencySymbol || '৳';
  return `${symbol} ${formatNumber(amount)}`;
}

function formatPos2inDisplayDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
  }
  return dateStr;
}

function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  let clean = phone.replace(/[^\d]/g, '');
  if (clean.startsWith('0')) clean = '880' + clean.slice(1);
  return clean;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setSyncStatus(status, text) {
  const dot = document.getElementById('sync-status-dot');
  const label = document.getElementById('sync-status-text');
  if (!dot || !label) return;

  label.textContent = text;
  if (status === 'ready') {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
  } else if (status === 'syncing') {
    dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-rose-500';
  }
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  const toastIcon = document.getElementById('toast-icon');
  if (!toast || !toastMsg) return;

  toastMsg.innerText = message;

  if (type === 'success') {
    toast.className = 'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl glass-panel border border-emerald-500/40 text-emerald-700 dark:text-emerald-200 text-xs font-bold shadow-2xl flex items-center gap-2.5 animate-fade-in';
    if (toastIcon) toastIcon.innerHTML = '<svg class="svg-icon w-4 h-4 text-emerald-500" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (type === 'error') {
    toast.className = 'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl glass-panel border border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs font-bold shadow-2xl flex items-center gap-2.5 animate-fade-in';
    if (toastIcon) toastIcon.innerHTML = '<svg class="svg-icon w-4 h-4 text-rose-500" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>';
  } else {
    toast.className = 'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl glass-panel border border-brand-500/40 text-brand-700 dark:text-white text-xs font-bold shadow-2xl flex items-center gap-2.5 animate-fade-in';
    if (toastIcon) toastIcon.innerHTML = '<svg class="svg-icon w-4 h-4 text-brand-500" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>';
  }

  toast.classList.remove('hidden');
  toast.style.display = 'flex';

  clearTimeout(window.__toastTimeout);
  window.__toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
    toast.style.display = 'none';
  }, 3500);
}

// Auto-boot on DOM ready
window.addEventListener('DOMContentLoaded', initApp);
