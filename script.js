/* Ledgerly is a local-first app: storage is centralized and each mutation calls renderApp. */
const STORAGE = { transactions: "ledgerly:transactions:v1", settings: "ledgerly:settings:v1", theme: "ledgerly:theme:v1" };
const CATEGORIES = ["Food", "Travel", "Shopping", "Bills", "Health", "Entertainment", "Other"];
const COLORS = { Food: "#2e8b57", Travel: "#3cb371", Shopping: "#6b8e23", Bills: "#dc2626", Health: "#059669", Entertainment: "#a8d5ba", Other: "#718096" };
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "short" });
const $ = (selector) => document.querySelector(selector);
const dom = {
  balance: $("#balance"), trend: $("#balance-trend"), trendIcon: $("#balance-trend-icon"), period: $("#current-period"),
  income: $("#total-income"), expenses: $("#total-expenses"), incomeDetail: $("#income-detail"), expenseDetail: $("#expense-detail"),
  budget: $("#monthly-budget"), remaining: $("#remaining-budget"), remainingDetail: $("#remaining-detail"), budgetDetail: $("#budget-detail"), progress: $("#budget-progress-bar"), alert: $("#budget-alert"), alertCopy: $("#budget-alert-copy"),
  list: $("#transaction-list"), empty: $("#empty-state"), noResults: $("#no-results-state"), count: $("#transaction-count"),
  search: $("#search-input"), categoryFilter: $("#category-filter"), startDate: $("#start-date-filter"), endDate: $("#end-date-filter"), sort: $("#sort-filter"), reset: $("#reset-filters"),
  categoryChart: $("#category-chart"), monthlyChart: $("#monthly-chart"), categoryEmpty: $("#category-chart-empty"), monthlyEmpty: $("#monthly-chart-empty"), legend: $("#category-legend"),
  transactionModal: $("#transaction-modal"), budgetModal: $("#budget-modal"), insightsModal: $("#insights-modal"), transactionForm: $("#transaction-form"), budgetForm: $("#budget-form"),
  id: $("#transaction-id"), description: $("#description"), amount: $("#amount"), transactionDate: $("#transaction-date"), category: $("#category"), categoryField: $("#category-field"), transactionError: $("#transaction-form-error"), budgetInput: $("#budget-input"), budgetError: $("#budget-form-error"),
  modalTitle: $("#transaction-modal-title"), modalKicker: $("#transaction-modal-kicker"), submit: $("#transaction-submit"), insightList: $("#insight-list"),
  theme: $("#theme-toggle"), exportMenu: $("#export-menu"), exportButton: $("#export-menu-button"), toast: $("#toast"), greeting: $("#day-greeting"),
};
let state = { transactions: [], settings: { monthlyBudget: 0 } };
let charts = { category: null, monthly: null };
let focusBeforeModal = null;
let toastTimeout;

function today() { return new Date().toISOString().slice(0, 10); }
function monthKey(value = new Date()) { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function id() { return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function currency(value) { return money.format(value || 0); }
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save() { localStorage.setItem(STORAGE.transactions, JSON.stringify(state.transactions)); localStorage.setItem(STORAGE.settings, JSON.stringify(state.settings)); }

/** Converts existing starter data (signed amounts) into a typed, date-aware model. */
function normalize(raw) {
  const rawAmount = Number(raw.amount);
  const type = raw.type || (rawAmount >= 0 ? "income" : "expense");
  return {
    id: String(raw.id || id()), description: String(raw.description || "Untitled transaction").trim(), amount: Math.abs(rawAmount) || 0,
    type: type === "income" ? "income" : "expense", category: type === "income" ? "Income" : (CATEGORIES.includes(raw.category) ? raw.category : "Other"),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date || "") ? raw.date : today(), createdAt: raw.createdAt || new Date().toISOString(), updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}
function load() {
  const saved = read(STORAGE.transactions, null);
  const legacy = saved === null ? read("transactions", []) : saved;
  state.transactions = Array.isArray(legacy) ? legacy.map(normalize).filter((item) => item.amount > 0) : [];
  const settings = read(STORAGE.settings, {});
  state.settings.monthlyBudget = Math.max(0, Number(settings.monthlyBudget) || 0);
}
function summary(items = state.transactions) { return items.reduce((total, item) => { total[item.type === "income" ? "income" : "expenses"] += item.amount; return total; }, { income: 0, expenses: 0 }); }
function currentMonth() { return state.transactions.filter((item) => item.date.startsWith(monthKey())); }
function radioType() { return document.querySelector('input[name="transaction-type"]:checked').value; }
function hideError(element) { element.hidden = true; element.textContent = ""; }
function showError(element, message) { element.textContent = message; element.hidden = false; }

function renderSummary() {
  const all = summary(); const current = summary(currentMonth()); const budget = state.settings.monthlyBudget;
  const balance = all.income - all.expenses; const remaining = budget - current.expenses; const used = budget ? (current.expenses / budget) * 100 : 0;
  dom.balance.textContent = currency(balance); dom.trend.textContent = `${current.income >= current.expenses ? "+" : ""}${currency(current.income - current.expenses)}`;
  dom.trendIcon.textContent = current.income >= current.expenses ? "↗" : "↘"; dom.trendIcon.style.color = current.income >= current.expenses ? "#8df0c6" : "#ffadb8";
  dom.period.textContent = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date());
  dom.income.textContent = currency(all.income); dom.expenses.textContent = currency(all.expenses);
  dom.incomeDetail.textContent = current.income ? `${currency(current.income)} this month` : "No income this month";
  dom.expenseDetail.textContent = current.expenses ? `${currency(current.expenses)} this month` : "No expenses this month";
  dom.budget.textContent = budget ? currency(budget) : "Not set"; dom.remaining.textContent = budget ? currency(remaining) : "—";
  dom.remaining.classList.toggle("over-budget", budget > 0 && remaining < 0);
  dom.remainingDetail.textContent = budget ? (remaining < 0 ? `${currency(Math.abs(remaining))} over budget` : `${Math.max(0, 100 - used).toFixed(0)}% still available`) : "Waiting for a budget";
  dom.progress.style.width = `${Math.min(used, 100)}%`; dom.progress.style.background = used > 100 ? "var(--red)" : used > 80 ? "var(--orange)" : "var(--purple)";
  dom.budgetDetail.textContent = budget ? `${used.toFixed(0)}% used this month` : "Set a budget to track progress";
  dom.alert.hidden = !(budget && current.expenses > budget);
  if (budget && current.expenses > budget) dom.alertCopy.textContent = `You are ${currency(current.expenses - budget)} above your limit.`;
}

function filteredTransactions() {
  const search = dom.search.value.trim().toLowerCase(); const category = dom.categoryFilter.value; const start = dom.startDate.value; const end = dom.endDate.value;
  const compare = { newest: (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt), oldest: (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt), highest: (a, b) => b.amount - a.amount, lowest: (a, b) => a.amount - b.amount };
  return state.transactions.filter((item) => !search || item.description.toLowerCase().includes(search)).filter((item) => category === "all" || item.category === category).filter((item) => !start || item.date >= start).filter((item) => !end || item.date <= end).sort(compare[dom.sort.value]);
}
function row(item) {
  const tr = document.createElement("tr"); const amountSign = item.type === "income" ? "+" : "−"; const icon = item.type === "income" ? "↓" : "↑";
  tr.innerHTML = `<td><span class="transaction-name"><i class="transaction-avatar ${item.type}">${icon}</i><span class="name"></span></span></td><td><span class="category-pill"></span></td><td class="date-cell"></td><td class="amount ${item.type}">${amountSign}${currency(item.amount)}</td><td class="row-actions"><button class="row-action" data-action="edit" data-id="${item.id}" type="button" aria-label="Edit transaction">✎</button><button class="row-action delete" data-action="delete" data-id="${item.id}" type="button" aria-label="Delete transaction">×</button></td>`;
  tr.querySelector(".name").textContent = item.description; tr.querySelector(".category-pill").textContent = item.category; tr.querySelector(".date-cell").textContent = dateFormat.format(new Date(`${item.date}T12:00:00`)); return tr;
}
function renderTransactions() {
  const items = filteredTransactions(); const filtered = Boolean(dom.search.value || dom.categoryFilter.value !== "all" || dom.startDate.value || dom.endDate.value || dom.sort.value !== "newest");
  dom.list.replaceChildren(...items.map(row)); dom.empty.hidden = state.transactions.length > 0; dom.noResults.hidden = !(state.transactions.length && !items.length); dom.reset.hidden = !filtered;
  dom.count.textContent = state.transactions.length ? `Showing ${items.length} of ${state.transactions.length} transaction${state.transactions.length === 1 ? "" : "s"}` : "";
}
function categoryTotals() { return state.transactions.filter((item) => item.type === "expense").reduce((totals, item) => { totals[item.category] = (totals[item.category] || 0) + item.amount; return totals; }, {}); }
function lastSixMonths() { return Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - index)); return { key: monthKey(date), label: monthFormat.format(date) }; }); }
function renderLegend(totals) {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  dom.legend.replaceChildren(...entries.map(([category, amount]) => { const li = document.createElement("li"); li.innerHTML = "<i class='legend-dot'></i><span></span><b class='legend-amount'></b>"; li.querySelector("i").style.background = COLORS[category]; li.querySelector("span").textContent = category; li.querySelector("b").textContent = currency(amount); return li; }));
}
function renderCharts() {
  const totals = categoryTotals(); const categories = Object.entries(totals).filter(([, amount]) => amount); const months = lastSixMonths();
  const monthly = months.map(({ key }) => state.transactions.filter((item) => item.type === "expense" && item.date.startsWith(key)).reduce((sum, item) => sum + item.amount, 0));
  dom.categoryEmpty.hidden = categories.length > 0; dom.monthlyEmpty.hidden = monthly.some(Boolean); renderLegend(totals);
  if (!window.Chart) return;
  charts.category?.destroy(); charts.monthly?.destroy(); const computed = getComputedStyle(document.body);
  charts.category = new Chart(dom.categoryChart, { type: "doughnut", data: { labels: categories.map(([key]) => key), datasets: [{ data: categories.map(([, value]) => value), backgroundColor: categories.map(([key]) => COLORS[key]), borderWidth: 0, hoverOffset: 4 }] }, options: { cutout: "69%", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.label}: ${currency(context.raw)}` } } } } });
  charts.monthly = new Chart(dom.monthlyChart, { type: "bar", data: { labels: months.map(({ label }) => label), datasets: [{ data: monthly, backgroundColor: "#2e8b57", hoverBackgroundColor: "#1f6f44", borderRadius: 5, maxBarThickness: 34 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `Expenses: ${currency(context.raw)}` } } }, scales: { x: { border: { display: false }, grid: { display: false }, ticks: { color: computed.getPropertyValue("--muted"), font: { size: 10 } } }, y: { beginAtZero: true, border: { display: false }, grid: { color: computed.getPropertyValue("--line") }, ticks: { color: computed.getPropertyValue("--muted"), font: { size: 10 }, callback: (value) => `₹${Number(value) / 1000}k` } } } } });
}
/** Central rendering keeps summary, list, charts, and budget status in sync. */
function renderApp() { renderSummary(); renderTransactions(); renderCharts(); }

function setCategoryOptions() { const options = CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join(""); dom.category.innerHTML = options; dom.categoryFilter.insertAdjacentHTML("beforeend", options); }
function updateTypeUI() { const income = radioType() === "income"; dom.categoryField.hidden = income; dom.category.required = !income; }
function openTransaction(transaction) {
  focusBeforeModal = document.activeElement; dom.transactionForm.reset(); hideError(dom.transactionError); dom.id.value = transaction?.id || ""; dom.description.value = transaction?.description || ""; dom.amount.value = transaction?.amount || ""; dom.transactionDate.value = transaction?.date || today();
  document.querySelector(`input[name="transaction-type"][value="${transaction?.type || "expense"}"]`).checked = true; dom.category.value = transaction?.category || "Food"; updateTypeUI();
  dom.modalTitle.textContent = transaction ? "Edit transaction" : "Add transaction"; $("#transaction-modal-kicker").textContent = transaction ? "UPDATE ENTRY" : "NEW ENTRY"; dom.submit.textContent = transaction ? "Save changes" : "Save transaction";
  dom.transactionModal.hidden = false; document.body.style.overflow = "hidden"; setTimeout(() => dom.description.focus(), 0);
}
function closeModal(modal) { modal.hidden = true; document.body.style.overflow = ""; focusBeforeModal?.focus?.(); }
function submitTransaction(event) {
  event.preventDefault(); const description = dom.description.value.trim(); const amount = Number(dom.amount.value); const type = radioType(); const date = dom.transactionDate.value; const category = type === "income" ? "Income" : dom.category.value;
  if (description.length < 2) return showError(dom.transactionError, "Please add a description of at least 2 characters.");
  if (!Number.isFinite(amount) || amount <= 0) return showError(dom.transactionError, "Enter an amount greater than zero.");
  if (!date) return showError(dom.transactionError, "Please choose a date.");
  const index = state.transactions.findIndex((item) => item.id === dom.id.value); const next = normalize({ id: dom.id.value || id(), description, amount, type, category, date, createdAt: index >= 0 ? state.transactions[index].createdAt : new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (index >= 0) state.transactions.splice(index, 1, next); else state.transactions.push(next); save(); renderApp(); closeModal(dom.transactionModal); toast(index >= 0 ? "Transaction updated." : "Transaction added.");
}
function removeTransaction(transactionId) { const item = state.transactions.find((entry) => entry.id === transactionId); if (!item || !confirm(`Delete “${item.description}”? This cannot be undone.`)) return; state.transactions = state.transactions.filter((entry) => entry.id !== transactionId); save(); renderApp(); toast("Transaction deleted."); }
function openBudget() { focusBeforeModal = document.activeElement; dom.budgetInput.value = state.settings.monthlyBudget || ""; hideError(dom.budgetError); dom.budgetModal.hidden = false; document.body.style.overflow = "hidden"; setTimeout(() => dom.budgetInput.focus(), 0); }
function submitBudget(event) { event.preventDefault(); const value = Number(dom.budgetInput.value); if (!Number.isFinite(value) || value < 0) return showError(dom.budgetError, "Enter a valid zero or positive amount."); state.settings.monthlyBudget = value; save(); renderApp(); closeModal(dom.budgetModal); toast("Monthly budget saved."); }
function clearFilters() { dom.search.value = ""; dom.categoryFilter.value = "all"; dom.startDate.value = ""; dom.endDate.value = ""; dom.sort.value = "newest"; renderTransactions(); }

/** Generates deterministic, explainable insight cards without sending financial data anywhere. */
function buildInsights() {
  const expenses = state.transactions.filter((item) => item.type === "expense"); const current = currentMonth().filter((item) => item.type === "expense"); const currentSpent = current.reduce((sum, item) => sum + item.amount, 0); const budget = state.settings.monthlyBudget; const totals = categoryTotals(); const [top, topAmount] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0] || [];
  const last = new Date(); last.setMonth(last.getMonth() - 1); const previousSpent = expenses.filter((item) => item.date.startsWith(monthKey(last))).reduce((sum, item) => sum + item.amount, 0); const result = [];
  if (!expenses.length) result.push(["✦", "Start with one expense", "Add a few expenses and Ledgerly will identify your spending patterns and budget opportunities."]);
  if (top) result.push(["◌", `${top} is your largest category`, `You have spent ${currency(topAmount)} on ${top}, ${Math.round(topAmount / expenses.reduce((sum, item) => sum + item.amount, 0) * 100)}% of all recorded spending.`]);
  if (budget) result.push(["◎", currentSpent > budget ? "Your budget needs attention" : "You are tracking within budget", currentSpent > budget ? `Current spending is ${currency(currentSpent - budget)} above your ${currency(budget)} monthly target. Consider pausing nonessential purchases.` : `You have ${currency(budget - currentSpent)} left from your ${currency(budget)} budget this month.`]);
  else result.push(["◎", "Set a spending guardrail", "A monthly budget will turn your spending history into a clear remaining amount and an early warning when you exceed it."]);
  if (previousSpent && currentSpent) { const change = (currentSpent - previousSpent) / previousSpent * 100; result.push([change > 0 ? "↗" : "↘", change > 0 ? "Spending is trending up" : "Spending is trending down", `This month is ${Math.abs(change).toFixed(0)}% ${change > 0 ? "higher" : "lower"} than last month so far. ${change > 10 ? "Review discretionary categories for a quick saving opportunity." : "Keep the same pace to maintain control."}`]); }
  else if (currentSpent) result.push(["↗", "Build a comparison baseline", "Keep recording expenses next month to unlock meaningful month-over-month spending trends."]);
  return result;
}
function openInsights() { focusBeforeModal = document.activeElement; const cards = buildInsights().map(([icon, title, description]) => { const item = document.createElement("article"); item.className = "insight-item"; item.innerHTML = "<i></i><div><strong></strong><p></p></div>"; item.querySelector("i").textContent = icon; item.querySelector("strong").textContent = title; item.querySelector("p").textContent = description; return item; }); dom.insightList.replaceChildren(...cards); dom.insightsModal.hidden = false; document.body.style.overflow = "hidden"; setTimeout(() => dom.insightsModal.querySelector("button").focus(), 0); }
function csv(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function download(blob, filename) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
function exportCSV() { if (!state.transactions.length) return toast("Add a transaction before exporting."); const rows = [["Description", "Type", "Category", "Amount (INR)", "Date"], ...state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((item) => [item.description, item.type, item.category, item.type === "expense" ? -item.amount : item.amount, item.date])]; download(new Blob([rows.map((row) => row.map(csv).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }), `ledgerly-transactions-${today()}.csv`); toast("CSV export downloaded."); }
function exportPDF() {
  if (!window.jspdf) return toast("PDF export is unavailable. Check your connection and try again.");
  const { jsPDF } = window.jspdf; const pdf = new jsPDF(); const all = summary(); const current = summary(currentMonth()); const balance = all.income - all.expenses;
  pdf.setFillColor(41, 43, 89); pdf.rect(0, 0, 210, 42, "F"); pdf.setTextColor(255, 255, 255); pdf.setFontSize(22); pdf.text("Ledgerly financial report", 15, 21); pdf.setFontSize(10); pdf.text(`Generated ${dateFormat.format(new Date())}`, 15, 29); pdf.setTextColor(32, 35, 52); pdf.setFontSize(14); pdf.text("Financial snapshot", 15, 57); pdf.setFontSize(10); [
    `Total income: ${currency(all.income)}`, `Total expenses: ${currency(all.expenses)}`, `Total balance: ${currency(balance)}`, `This month's expenses: ${currency(current.expenses)}`, `Monthly budget: ${state.settings.monthlyBudget ? currency(state.settings.monthlyBudget) : "Not set"}`,
  ].forEach((line, index) => pdf.text(line, 15, 67 + index * 7)); pdf.setFontSize(14); pdf.text("Transactions", 15, 109); pdf.setFontSize(8); let y = 118;
  state.transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach((item) => { if (y > 280) { pdf.addPage(); y = 18; } const label = item.description.length > 36 ? `${item.description.slice(0, 33)}...` : item.description; pdf.text(`${item.date}   ${label}`, 15, y); pdf.text(item.category, 109, y); pdf.text(`${item.type === "expense" ? "−" : "+"}${currency(item.amount)}`, 158, y, { align: "right" }); y += 8; });
  pdf.save(`ledgerly-report-${today()}.pdf`); toast("PDF report downloaded.");
}
function toast(message) { clearTimeout(toastTimeout); dom.toast.textContent = message; dom.toast.hidden = false; toastTimeout = setTimeout(() => { dom.toast.hidden = true; }, 3200); }
function applyTheme(theme) { const dark = theme === "dark"; document.body.classList.toggle("dark", dark); dom.theme.textContent = dark ? "☀" : "☾"; dom.theme.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`); localStorage.setItem(STORAGE.theme, theme); }
function activeModal() { return [dom.transactionModal, dom.budgetModal, dom.insightsModal].find((modal) => !modal.hidden); }

function events() {
  [$("#open-transaction-modal"), $("#quick-add-button"), $("#empty-add-button")].forEach((button) => button.addEventListener("click", () => openTransaction()));
  [$("#edit-budget-button"), $("#alert-edit-budget")].forEach((button) => button.addEventListener("click", openBudget)); $("#ai-insights-button").addEventListener("click", openInsights);
  dom.transactionForm.addEventListener("submit", submitTransaction); dom.budgetForm.addEventListener("submit", submitBudget); document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeModal(dom.transactionModal))); document.querySelectorAll("[data-close-budget]").forEach((button) => button.addEventListener("click", () => closeModal(dom.budgetModal))); document.querySelectorAll("[data-close-insights]").forEach((button) => button.addEventListener("click", () => closeModal(dom.insightsModal)));
  document.querySelectorAll('input[name="transaction-type"]').forEach((input) => input.addEventListener("change", updateTypeUI)); dom.list.addEventListener("click", (event) => { const button = event.target.closest("[data-action]"); if (!button) return; const transaction = state.transactions.find((item) => item.id === button.dataset.id); if (button.dataset.action === "edit") openTransaction(transaction); else removeTransaction(button.dataset.id); });
  [dom.search, dom.categoryFilter, dom.startDate, dom.endDate, dom.sort].forEach((element) => element.addEventListener("input", renderTransactions)); dom.reset.addEventListener("click", clearFilters); $("#no-results-clear").addEventListener("click", clearFilters);
  dom.theme.addEventListener("click", () => { applyTheme(document.body.classList.contains("dark") ? "light" : "dark"); renderCharts(); });
  dom.exportButton.addEventListener("click", () => { const opening = dom.exportMenu.hidden; dom.exportMenu.hidden = !opening; dom.exportButton.setAttribute("aria-expanded", String(opening)); }); dom.exportMenu.addEventListener("click", (event) => { const type = event.target.dataset.export; if (!type) return; dom.exportMenu.hidden = true; dom.exportButton.setAttribute("aria-expanded", "false"); type === "csv" ? exportCSV() : exportPDF(); });
  document.addEventListener("click", (event) => { if (!event.target.closest(".export-wrap")) { dom.exportMenu.hidden = true; dom.exportButton.setAttribute("aria-expanded", "false"); } }); document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeModal(backdrop); }));
  document.addEventListener("keydown", (event) => { if (event.key !== "Escape") return; const modal = activeModal(); if (modal) closeModal(modal); else { dom.exportMenu.hidden = true; dom.exportButton.setAttribute("aria-expanded", "false"); } });
}
function init() { load(); setCategoryOptions(); const hour = new Date().getHours(); dom.greeting.textContent = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; applyTheme(localStorage.getItem(STORAGE.theme) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")); events(); renderApp(); }
init();
