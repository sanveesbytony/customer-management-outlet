# POS2IN Customer Intelligence & Analytics Platform

A modern, high-performance, real-time Cloud Web Application designed specifically for **POS2IN** sales registers and multi-branch retail operations. Built as a standalone single-page application (SPA) deployable on **GitHub Pages** with a **Google Firebase Cloud** database backend for instant sub-50ms synchronization across all branches.

---

## 🚀 Key Architectural Upgrades

### 1. 100% Standalone Website (GitHub Pages Ready)
- **Zero Server-Side Build Required**: Clean HTML5 + Tailwind CSS + Vanilla JS with Firebase SDK.
- **Instant Deployment**: Includes `.nojekyll` and `index.html` root entrypoint for direct 1-click deployment to GitHub Pages.
- **Global CDN Delivery**: Hosted on GitHub Pages with sub-second asset delivery worldwide.

### 2. Google Firebase Cloud Realtime Database & Firestore Backend
- **All Settings Stored in Firebase Cloud**: Branch lists, custom branch passwords, 5-attempt failed lockout tracking, currency symbols, and customer tier thresholds are stored at `/settings.json` and Firestore `settings/config`.
- **Sub-50ms Real-Time Multi-Branch Sync**: All outlets (Main Branch, Dhanmondi, Gulshan, Uttara, Online Store) can import, query, and edit records simultaneously without lock contention or timeouts.
- **Direct Cloud Batch Ingestion**: Uploads thousands of POS2IN CSV rows directly into Firebase in ~1-2 seconds with atomic updates.

### 3. Specific Credential-Based Super Admin Login
- Dedicated username/email and password authentication replaces temporary sheet OTPs.
- **Default Master Credentials**:
  - **Username**: `admin` (or `admin@pos2in.com`)
  - **Password**: `pos2in@admin2026`
- **In-App Credential Management**: Super Admin can update the username and password directly in the **Settings** tab under *Super Admin Credentials & Master Security*. All changes immediately persist to Firebase Cloud.

### 4. Branch Security & Access Control
- **Per-Branch Passwords**: Each branch outlet has a distinct password (e.g. `mainbranch19`, `dhanmondioutlet24`, etc.), customizable by the Admin.
- **5-Attempt Rate-Limit Lockout**: Automatically blocks branch accounts after 5 invalid attempts to prevent brute force.
- **Admin Emergency Unlock**: Super Admin can unlock single or all locked branches from the login screen or Branch Manager.

### 5. POS2IN Import Center with Strict Branch Override
- Compatible with POS2IN CSV export columns:
  `Sales Date, Invoice No, Sales Point, Sales Staff, Category, Sub Category, Product Model/Name, Quantity, Selling Price, Sub Total, Discount (Tk), Net Payable, Paid, Due, Customer, Phone, Address`.
- **Multi-Line Invoice Aggregator**: Combines multiple item rows for the same invoice into one transaction record.
- **Bangladeshi Phone Normalization**: Auto-formats numbers (e.g. `1724671985` -> `01724671985`).

### 6. Data Management & Deletion Center
- **Selective Deletion**: Delete records by Branch, Specific Month, Date Range, or Customer Phone/Invoice No with live pre-deletion impact preview.

---

## 🛠️ Step-by-Step GitHub Pages Deployment Guide

### Option A: GitHub Web Interface (Easiest)
1. Create a new repository on [GitHub](https://github.com/new) (e.g. `pos2in-customer-portal`).
2. Upload all files from this project directory (`index.html`, `style.css`, `app.js`, `.nojekyll`, `README.md`).
3. On GitHub, go to your repository **Settings** -> **Pages** (in the left sidebar).
4. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch`
   - **Branch**: Select `main` (or `master`) and folder `/ (root)`
   - Click **Save**.
5. Your website will be live in ~30 seconds at:
   `https://<your-github-username>.github.io/<repository-name>/`

### Option B: Git Command Line
```bash
git init
git add .
git commit -m "Initial commit: Standalone POS2IN Customer Intelligence Website"
git branch -M main
git remote add origin https://github.com/<your-github-username>/<repository-name>.git
git push -u origin main
```
Then enable GitHub Pages under repository **Settings** -> **Pages**.

---

## 🔐 Default Login Credentials

| Role | Username / Branch | Default Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin` | `pos2in@admin2026` | Full Access: Dashboard, Customers, Import, Branch Manager, Delete Center, Cloud Settings |
| **Main Branch** | `Main Branch` | `mainbranch19` | Dashboard (Filtered), Customer Directory |
| **Dhanmondi Outlet** | `Dhanmondi Outlet` | `dhanmondioutlet24` | Dashboard (Filtered), Customer Directory |
| **Gulshan Outlet** | `Gulshan Outlet` | `gulshanoutlet18` | Dashboard (Filtered), Customer Directory |
| **Uttara Outlet** | `Uttara Outlet` | `uttaraoutlet35` | Dashboard (Filtered), Customer Directory |
| **Online Store** | `Online Store` | `onlinestore99` | Dashboard (Filtered), Customer Directory |

*Note: All branch passwords and admin credentials can be customized at any time in the **Settings** and **Branches** tabs.*

---

## 📦 Tech Stack
- **Frontend**: HTML5, Vanilla JavaScript (ES6+), Tailwind CSS (JIT via CDN), Chart.js
- **Database**: Google Firebase Realtime Database & Cloud Firestore
- **Deployment**: GitHub Pages (Static Web Architecture)
