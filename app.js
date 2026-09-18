/**
 * PlanetPulse - Carbon Footprint Tracker
 * Core Application Logic & Data Layer
 * Implements 5 Required Features + 3 Decision Points (DP1, DP2, DP3) saved once again and again and finally again
 */ 

// Fixed emission factors specified in Hackathon Product Brief (kg CO2 per unit)
const EMISSION_FACTORS = {
    car: 0.20,          // kg CO2 / km
    bus: 0.08,          // kg CO2 / km
    flight: 0.25,       // kg CO2 / km
    electricity: 0.80,  // kg CO2 / kWh
    veg_meal: 0.50,     // kg CO2 / meal
    non_veg_meal: 2.00  // kg CO2 / meal
};

const CATEGORY_META = {
    car: { name: 'Car Travel', unit: 'km', icon: '🚗', color: '#3b82f6', defaultQty: 15 },
    bus: { name: 'Bus Transit', unit: 'km', icon: '🚌', color: '#10b981', defaultQty: 10 },
    flight: { name: 'Air Flight', unit: 'km', icon: '✈️', color: '#8b5cf6', defaultQty: 500 },
    electricity: { name: 'Electricity', unit: 'kWh', icon: '⚡', color: '#f59e0b', defaultQty: 12 },
    veg_meal: { name: 'Vegetarian Meal', unit: 'meals', icon: '🥗', color: '#14b8a6', defaultQty: 2 },
    non_veg_meal: { name: 'Non-Vegetarian Meal', unit: 'meals', icon: '🥩', color: '#ef4444', defaultQty: 1 }
};

// DP2: Physical Plausibility Thresholds & Real-world Benchmarks
const PLAUSIBILITY_THRESHOLDS = {
    car: { max_single: 2000, unit: 'km', benchmark: '2,000 km (over 24h continuous non-stop driving)' },
    bus: { max_single: 1500, unit: 'km', benchmark: '1,500 km (long-distance express coach)' },
    flight: { max_single: 20000, unit: 'km', benchmark: '20,000 km (Earth half-circumference / longest commercial routes)' },
    electricity: { max_single: 3000, unit: 'kWh', benchmark: '3,000 kWh (typical household monthly consumption is ~300 kWh)' },
    veg_meal: { max_single: 15, unit: 'meals', benchmark: '15 meals (extreme single-day volume)' },
    non_veg_meal: { max_single: 15, unit: 'meals', benchmark: '15 meals (extreme single-day volume)' }
};

// Seed dataset for rich immediate evaluation
function getSeedActivities() {
    const today = new Date();
    const formatDate = (daysAgo) => {
        const d = new Date(today);
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
    };

    return [
        { id: 'act-1', type: 'bus', quantity: 18, unit: 'km', co2_kg: 1.44, date: formatDate(4), note: 'Office commute' },
        { id: 'act-2', type: 'electricity', quantity: 22, unit: 'kWh', co2_kg: 17.60, date: formatDate(3), note: 'HVAC & home office' },
        { id: 'act-3', type: 'veg_meal', quantity: 3, unit: 'meals', co2_kg: 1.50, date: formatDate(2), note: 'Salad & plant-based dinner' },
        { id: 'act-4', type: 'car', quantity: 35, unit: 'km', co2_kg: 7.00, date: formatDate(1), note: 'Supermarket and errands' },
        { id: 'act-5', type: 'non_veg_meal', quantity: 1, unit: 'meals', co2_kg: 2.00, date: formatDate(1), note: 'Steakhouse dinner' },
        { id: 'act-6', type: 'car', quantity: 15, unit: 'km', co2_kg: 3.00, date: formatDate(0), note: 'Morning drop-off' }
    ];
}

// Storage helpers
const STORAGE_KEYS = {
    ACTIVITIES: 'planetpulse_activities_v1',
    TARGET: 'planetpulse_weekly_target_v1',
    THEME: 'planetpulse_theme_v1'
};

class StateManager {
    constructor() {
        this.activities = this.loadActivities();
        this.weeklyTarget = this.loadTarget();
        this.currentFilter = {
            type: 'all',
            dateRange: 'all',
            search: ''
        };
    }

    loadActivities() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITIES);
            if (!raw) {
                const seed = getSeedActivities();
                this.saveActivities(seed);
                return seed;
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : getSeedActivities();
        } catch (e) {
            return getSeedActivities();
        }
    }

    saveActivities(list) {
        this.activities = list || [];
        try {
            localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(this.activities));
        } catch (e) {
            console.error('Failed to persist activities:', e);
        }
    }

    loadTarget() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.TARGET);
            return raw ? parseFloat(raw) : 50.0;
        } catch (e) {
            return 50.0;
        }
    }

    saveTarget(val) {
        this.weeklyTarget = Math.max(1, parseFloat(val) || 50.0);
        try {
            localStorage.setItem(STORAGE_KEYS.TARGET, this.weeklyTarget.toString());
        } catch (e) {
            console.error('Failed to persist target:', e);
        }
    }

    addActivity(activity) {
        this.activities.unshift(activity);
        this.saveActivities(this.activities);
    }

    deleteActivity(id) {
        this.activities = this.activities.filter(a => a.id !== id);
        this.saveActivities(this.activities);
    }

    resetData() {
        const seed = getSeedActivities();
        this.saveActivities(seed);
        this.saveTarget(50.0);
    }
}

const state = new StateManager();

// Feature 2: CO2 Calculation Core
function calculateCO2(type, quantity) {
    const factor = EMISSION_FACTORS[type];
    if (factor === undefined) {
        throw new Error(`Invalid activity type: ${type}`);
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0) {
        throw new Error('Quantity must be a positive number');
    }
    return Math.round(qty * factor * 1000) / 1000;
}

// DP3: ISO Week bounds & Pace calculation
function getWeekRange() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (isoDay - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return {
        start: startOfWeek,
        end: endOfWeek,
        isoDay,
        startDateStr: startOfWeek.toISOString().split('T')[0],
        endDateStr: endOfWeek.toISOString().split('T')[0]
    };
}

function calculateWeeklyMetrics() {
    const week = getWeekRange();
    const activities = state.activities || [];
    const weekActivities = activities.filter(act => {
        return act.date >= week.startDateStr && act.date <= week.endDateStr;
    });

    const weeklyTotalCO2 = weekActivities.reduce((sum, act) => sum + act.co2_kg, 0);
    const roundedWeekCO2 = Math.round(weeklyTotalCO2 * 100) / 100;
    const target = state.weeklyTarget;
    const percentageUsed = target > 0 ? Math.round((roundedWeekCO2 / target) * 1000) / 10 : 0;
    const isExceeded = roundedWeekCO2 > target;
    const surplusCO2 = isExceeded ? Math.round((roundedWeekCO2 - target) * 100) / 100 : 0;

    const expectedPacePct = Math.round((week.isoDay / 7.0) * 1000) / 10;
    const paceDelta = Math.round((percentageUsed - expectedPacePct) * 10) / 10;

    let paceStatus = 'healthy';
    if (isExceeded) {
        paceStatus = 'exceeded';
    } else if (paceDelta > 15) {
        paceStatus = 'fast';
    }

    const mitigationSwaps = [];
    if (isExceeded) {
        const busKm = Math.round(surplusCO2 / 0.12);
        const vegMeals = Math.ceil(surplusCO2 / 1.50);
        const kwhReduce = Math.round((surplusCO2 / 0.80) * 10) / 10;

        mitigationSwaps.push({
            title: `Transit Substitution`,
            desc: `Switch ~${busKm} km of car driving to public bus to offset your +${surplusCO2} kg surplus.`,
            icon: '🚌'
        });
        mitigationSwaps.push({
            title: `Dietary Shift`,
            desc: `Substitute ${vegMeals} non-veg meals with hearty vegetarian options this week.`,
            icon: '🥗'
        });
        mitigationSwaps.push({
            title: `Energy Conservation`,
            desc: `Conserve ~${kwhReduce} kWh of electricity (dim standby appliances and optimize thermostat).`,
            icon: '⚡'
        });
    }

    return {
        weeklyTotalCO2: roundedWeekCO2,
        target,
        percentageUsed,
        isExceeded,
        surplusCO2,
        week,
        expectedPacePct,
        paceDelta,
        paceStatus,
        mitigationSwaps,
        weekActivityCount: weekActivities.length
    };
}

function checkAbsurdInput(type, quantity) {
    const threshold = PLAUSIBILITY_THRESHOLDS[type];
    if (!threshold) return { isAbsurd: false };

    const qty = parseFloat(quantity);
    if (qty > threshold.max_single) {
        let suggested = qty / 1000;
        if (suggested < 1) suggested = qty / 100;
        return {
            isAbsurd: true,
            enteredQty: qty,
            unit: threshold.unit,
            maxThreshold: threshold.max_single,
            benchmark: threshold.benchmark,
            suggestedCorrection: Math.round(suggested * 10) / 10
        };
    }
    return { isAbsurd: false };
}

function calculateBreakdown() {
    const activities = state.activities || [];
    const totalCO2 = activities.reduce((sum, act) => sum + act.co2_kg, 0);
    const roundedTotal = Math.round(totalCO2 * 100) / 100;

    const breakdown = {};
    for (const key of Object.keys(EMISSION_FACTORS)) {
        const catActs = activities.filter(a => a.type === key);
        const catCO2 = Math.round(catActs.reduce((s, a) => s + a.co2_kg, 0) * 100) / 100;
        const catQty = Math.round(catActs.reduce((s, a) => s + a.quantity, 0) * 10) / 10;
        const pct = roundedTotal > 0 ? Math.round((catCO2 / roundedTotal) * 1000) / 10 : 0;
        breakdown[key] = {
            ...CATEGORY_META[key],
            co2_kg: catCO2,
            totalQuantity: catQty,
            percentage: pct,
            count: catActs.length
        };
    }

    return {
        totalCO2: roundedTotal,
        totalActivities: activities.length,
        breakdown,
        treesEquivalent: Math.round((roundedTotal / 21.0) * 10) / 10
    };
}

// ==========================================
// UI Rendering & Event Handling
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initActivityForm();
    initTargetControls();
    initFilterControls();
    initDelegatedEvents();
    renderAll();
});

function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.textContent = document.body.classList.contains('light-mode') ? '🌙 Dark Mode' : '☀️ Light Mode';
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem(STORAGE_KEYS.THEME, isLight ? 'light' : 'dark');
            themeBtn.textContent = isLight ? '🌙 Dark Mode' : '☀️ Light Mode';
            renderDonutChart();
        });
    }
}

function initActivityForm() {
    const typeSelect = document.getElementById('activity-type-select');
    const qtyInput = document.getElementById('activity-quantity-input');
    const unitLabel = document.getElementById('activity-unit-label');
    const previewVal = document.getElementById('activity-calc-preview');
    const dateInput = document.getElementById('activity-date-input');
    const form = document.getElementById('log-activity-form');

    if (!typeSelect || !qtyInput || !form) return;

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // SAFEGUARDED PREVIEW UPDATE
    function updatePreview() {
        const type = typeSelect.value;
        const meta = CATEGORY_META[type];
        if (unitLabel && meta) unitLabel.textContent = meta.unit;

        const qty = parseFloat(qtyInput.value);
        if (previewVal) {
            if (!isNaN(qty) && qty >= 0 && meta) {
                const co2 = calculateCO2(type, qty);
                previewVal.textContent = `${co2.toFixed(2)} kg CO₂`;
            } else {
                previewVal.textContent = '0.00 kg CO₂';
            }
        }
    }

    typeSelect.addEventListener('change', updatePreview);
    qtyInput.addEventListener('input', updatePreview);
    updatePreview();

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const type = typeSelect.value;
        const qty = parseFloat(qtyInput.value);
        const date = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().split('T')[0];
        const noteEl = document.getElementById('activity-note-input');
        const note = noteEl ? noteEl.value.trim() : '';

        if (isNaN(qty) || qty <= 0) {
            showToast('Please enter a valid quantity greater than 0', 'error');
            return;
        }

        const absurdCheck = checkAbsurdInput(type, qty);
        if (absurdCheck.isAbsurd) {
            showAbsurdInputModal(absurdCheck, () => {
                commitActivity(type, qty, date, note);
            }, (suggestedVal) => {
                qtyInput.value = suggestedVal;
                updatePreview();
                commitActivity(type, suggestedVal, date, note);
            });
            return;
        }

        commitActivity(type, qty, date, note);
    });
}

function commitActivity(type, quantity, date, note) {
    const co2 = calculateCO2(type, quantity);
    const meta = CATEGORY_META[type];
    const newAct = {
        id: 'act-' + Date.now(),
        type,
        quantity,
        unit: meta.unit,
        co2_kg: co2,
        date,
        note
    };

    state.addActivity(newAct);
    showToast(`Logged ${meta.name}: ${co2.toFixed(2)} kg CO₂ added!`, 'success');

    const qtyInput = document.getElementById('activity-quantity-input');
    const noteInput = document.getElementById('activity-note-input');
    const previewVal = document.getElementById('activity-calc-preview');

    if (qtyInput) qtyInput.value = '';
    if (noteInput) noteInput.value = '';
    if (previewVal) previewVal.textContent = '0.00 kg CO₂';

    renderAll();
}

function initTargetControls() {
    const targetInput = document.getElementById('weekly-target-input');
    const targetForm = document.getElementById('weekly-target-form');

    if (targetInput) {
        targetInput.value = state.weeklyTarget;
    }

    if (targetForm) {
        targetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = parseFloat(targetInput.value);
            if (isNaN(val) || val <= 0) {
                showToast('Target must be a positive number', 'error');
                return;
            }
            state.saveTarget(val);
            showToast(`Weekly target updated to ${val.toFixed(1)} kg CO₂`, 'success');
            renderAll();
        });
    }
}

// Global Event Delegation for Calibrate Buttons
function initDelegatedEvents() {
    document.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('#calibrate-target-btn, #calibrate-target-btn-main');
        if (targetBtn) {
            const metrics = calculateWeeklyMetrics();
            const recommended = Math.ceil(metrics.weeklyTotalCO2 * 1.1);
            state.saveTarget(recommended);
            const input = document.getElementById('weekly-target-input');
            if (input) input.value = recommended;
            showToast(`Calibrated target to ${recommended} kg CO₂ based on active week.`, 'info');
            renderAll();
        }
    });
}

function initFilterControls() {
    const typeFilter = document.getElementById('filter-type');
    const dateFilter = document.getElementById('filter-date');
    const searchFilter = document.getElementById('filter-search');
    const resetDataBtn = document.getElementById('reset-demo-data-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');

    if (typeFilter) {
        typeFilter.addEventListener('change', (e) => {
            state.currentFilter.type = e.target.value;
            renderHistoryTable();
        });
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', (e) => {
            state.currentFilter.dateRange = e.target.value;
            renderHistoryTable();
        });
    }

    if (searchFilter) {
        searchFilter.addEventListener('input', (e) => {
            state.currentFilter.search = e.target.value.toLowerCase().trim();
            renderHistoryTable();
        });
    }

    if (resetDataBtn) {
        resetDataBtn.addEventListener('click', () => {
            if (confirm('Reset tracker to initial demo dataset?')) {
                state.resetData();
                showToast('Tracker reset to demo data', 'info');
                renderAll();
            }
        });
    }

    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.activities, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `planetpulse_activities_${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });
    }

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            const headers = ['ID', 'Date', 'Type', 'Quantity', 'Unit', 'CO2_kg', 'Note'];
            const rows = (state.activities || []).map(a => [
                a.id,
                a.date,
                a.type,
                a.quantity,
                a.unit,
                a.co2_kg,
                `"${(a.note || '').replace(/"/g, '""')}"`
            ]);
            const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", encodeURI(csvContent));
            downloadAnchor.setAttribute("download", `planetpulse_activities_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });
    }
}

// Master Render Function
function renderAll() {
    renderDashboardStats();
    renderWeeklyTargetAndNudge();
    renderCategoryBreakdown();
    renderDonutChart();
    renderHistoryTable();
}

function renderDashboardStats() {
    const stats = calculateBreakdown();
    const metrics = calculateWeeklyMetrics();

    const statTotal = document.getElementById('stat-total-co2');
    const statWeek = document.getElementById('stat-week-co2');
    const statCount = document.getElementById('stat-activities-count');
    const statTrees = document.getElementById('stat-trees-offset');

    if (statTotal) statTotal.textContent = `${stats.totalCO2.toFixed(1)} kg`;
    if (statWeek) statWeek.textContent = `${metrics.weeklyTotalCO2.toFixed(1)} kg`;
    if (statCount) statCount.textContent = stats.totalActivities;
    if (statTrees) statTrees.textContent = `${stats.treesEquivalent} trees`;
}

function renderWeeklyTargetAndNudge() {
    const metrics = calculateWeeklyMetrics();
    const targetDisplay = document.getElementById('target-display-value');
    const weekUsedDisplay = document.getElementById('week-used-display');
    const progressBar = document.getElementById('target-progress-bar');
    const paceIndicator = document.getElementById('pace-indicator-badge');
    const paceLineMarker = document.getElementById('pace-line-marker');
    const nudgeContainer = document.getElementById('nudge-banner-container');

    if (targetDisplay) targetDisplay.textContent = `${metrics.target.toFixed(1)} kg CO₂`;
    if (weekUsedDisplay) weekUsedDisplay.textContent = `${metrics.weeklyTotalCO2.toFixed(1)} kg (${metrics.percentageUsed}%)`;

    if (progressBar) {
        const fillWidth = Math.min(100, metrics.percentageUsed);
        progressBar.style.width = `${fillWidth}%`;

        if (metrics.isExceeded) {
            progressBar.className = 'progress-bar-fill exceeded';
        } else if (metrics.percentageUsed >= 80) {
            progressBar.className = 'progress-bar-fill warning';
        } else {
            progressBar.className = 'progress-bar-fill healthy';
        }
    }

    if (paceLineMarker) {
        paceLineMarker.style.left = `${Math.min(100, metrics.expectedPacePct)}%`;
        paceLineMarker.title = `Day ${metrics.week.isoDay}/7 Expected Pace: ${metrics.expectedPacePct}%`;
    }

    if (paceIndicator) {
        if (metrics.isExceeded) {
            paceIndicator.className = 'badge badge-exceeded';
            paceIndicator.textContent = `Target Exceeded (+${metrics.surplusCO2.toFixed(1)} kg)`;
        } else if (metrics.paceDelta > 15) {
            paceIndicator.className = 'badge badge-warning';
            paceIndicator.textContent = `High Burn Rate (+${metrics.paceDelta}% above day ${metrics.week.isoDay} pace)`;
        } else {
            paceIndicator.className = 'badge badge-healthy';
            paceIndicator.textContent = `Healthy Pace (Day ${metrics.week.isoDay}/7 • ${metrics.percentageUsed}% used)`;
        }
    }

    if (nudgeContainer) {
        if (metrics.isExceeded) {
            nudgeContainer.innerHTML = `
                <div class="nudge-card nudge-exceeded" data-testid="nudge-exceeded-flag">
                    <div class="nudge-header">
                        <span class="nudge-icon">🌱</span>
                        <div>
                            <h4 class="nudge-title">Weekly Carbon Budget Exceeded by +${metrics.surplusCO2.toFixed(1)} kg CO₂</h4>
                            <p class="nudge-subtitle">Logging remains 100% active. Let's make constructive adjustments to mitigate the excess:</p>
                        </div>
                    </div>
                    <div class="nudge-swaps-grid">
                        ${metrics.mitigationSwaps.map(swap => `
                            <div class="nudge-swap-item">
                                <span class="swap-icon">${swap.icon}</span>
                                <div>
                                    <strong>${swap.title}</strong>
                                    <p>${swap.desc}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="nudge-actions">
                        <button id="calibrate-target-btn" class="btn btn-sm btn-outline">Calibrate Target for Active Week</button>
                    </div>
                </div>
            `;
        } else if (metrics.percentageUsed >= 80) {
            nudgeContainer.innerHTML = `
                <div class="nudge-card nudge-approaching" data-testid="nudge-approaching-flag">
                    <span class="nudge-icon">⚠️</span>
                    <div>
                        <h4 class="nudge-title">Approaching Weekly Budget (${metrics.percentageUsed}%)</h4>
                        <p class="nudge-subtitle">You have ${(metrics.target - metrics.weeklyTotalCO2).toFixed(1)} kg CO₂ remaining with ${7 - metrics.week.isoDay} days left in the cycle.</p>
                    </div>
                </div>
            `;
        } else {
            nudgeContainer.innerHTML = `
                <div class="nudge-card nudge-normal" data-testid="nudge-on-track-flag">
                    <span class="nudge-icon">✨</span>
                    <div>
                        <h4 class="nudge-title">On Track • Day ${metrics.week.isoDay} of 7</h4>
                        <p class="nudge-subtitle">${(metrics.target - metrics.weeklyTotalCO2).toFixed(1)} kg CO₂ left in this week's budget.</p>
                    </div>
                </div>
            `;
        }
    }
}

function renderCategoryBreakdown() {
    const stats = calculateBreakdown();
    const container = document.getElementById('category-breakdown-list');
    if (!container) return;

    if (stats.totalActivities === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #94a3b8;">No emissions recorded yet.</div>`;
        return;
    }

    container.innerHTML = Object.entries(stats.breakdown).map(([key, item]) => `
        <div class="category-breakdown-row" data-testid="category-row-${key}">
            <div class="cat-info">
                <span class="cat-icon">${item.icon}</span>
                <div>
                    <div class="cat-name">${item.name}</div>
                    <div class="cat-qty">${item.totalQuantity} ${item.unit} (${item.count} logs)</div>
                </div>
            </div>
            <div class="cat-emissions">
                <div class="cat-co2">${item.co2_kg.toFixed(1)} kg CO₂</div>
                <div class="cat-pct">${item.percentage}%</div>
            </div>
            <div class="cat-bar-container">
                <div class="cat-bar-fill" style="width: ${item.percentage}%; background-color: ${item.color}"></div>
            </div>
        </div>
    `).join('');
}

function renderDonutChart() {
    const canvas = document.getElementById('breakdown-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = 240;
    const height = canvas.height = 240;
    ctx.clearRect(0, 0, width, height);

    const stats = calculateBreakdown();
    const categories = Object.values(stats.breakdown).filter(c => c.co2_kg > 0);

    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = 100;
    const innerRadius = 60;

    if (stats.totalCO2 === 0 || categories.length === 0) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#334155';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = document.body.classList.contains('light-mode') ? '#ffffff' : '#1e293b';
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No Data', centerX, centerY + 4);
        return;
    }

    let startAngle = -Math.PI / 2;

    for (const cat of categories) {
        const sliceAngle = (cat.co2_kg / stats.totalCO2) * 2 * Math.PI;
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, startAngle, startAngle + sliceAngle);
        ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = cat.color;
        ctx.fill();
        startAngle += sliceAngle;
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = document.body.classList.contains('light-mode') ? '#ffffff' : '#0f172a';
    ctx.fill();

    ctx.fillStyle = document.body.classList.contains('light-mode') ? '#0f172a' : '#f8fafc';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${stats.totalCO2.toFixed(1)}`, centerX, centerY - 2);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('kg CO₂ Total', centerX, centerY + 16);
}

function renderHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    const countBadge = document.getElementById('history-count-badge');
    if (!tbody) return;

    let list = [...(state.activities || [])];
    const { type, dateRange, search } = state.currentFilter;

    if (type !== 'all') {
        list = list.filter(a => a.type === type);
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const week = getWeekRange();

    if (dateRange === 'today') {
        list = list.filter(a => a.date === todayStr);
    } else if (dateRange === 'this_week') {
        list = list.filter(a => a.date >= week.startDateStr && a.date <= week.endDateStr);
    } else if (dateRange === 'this_month') {
        const monthPrefix = todayStr.substring(0, 7);
        list = list.filter(a => a.date.startsWith(monthPrefix));
    }

    if (search) {
        list = list.filter(a => (a.note || '').toLowerCase().includes(search) || a.type.toLowerCase().includes(search));
    }

    list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    if (countBadge) countBadge.textContent = `${list.length} records`;

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state-cell" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <p>No activities match your current filter.</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map(item => {
        const meta = CATEGORY_META[item.type] || { name: item.type, icon: '📌', unit: item.unit };
        return `
            <tr data-testid="activity-row-${item.id}">
                <td>${item.date}</td>
                <td>
                    <span class="type-pill" style="border-color: ${meta.color}">
                        ${meta.icon} ${meta.name}
                    </span>
                </td>
                <td>${item.quantity} ${item.unit}</td>
                <td class="font-bold text-emerald">${item.co2_kg.toFixed(2)} kg</td>
                <td class="text-muted">${item.note ? escapeHtml(item.note) : '—'}</td>
                <td>
                    <button class="btn-icon-delete" data-testid="delete-activity-${item.id}" onclick="deleteActivityById('${item.id}')" title="Delete">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.deleteActivityById = function(id) {
    if (confirm('Delete this logged activity?')) {
        state.deleteActivity(id);
        showToast('Activity deleted', 'info');
        renderAll();
    }
};

function showAbsurdInputModal(checkData, onConfirmOverride, onAutoCorrect) {
    const modal = document.getElementById('absurd-input-modal');
    if (!modal) {
        if (confirm(`Extreme input detected: ${checkData.enteredQty} ${checkData.unit} exceeds typical threshold (${checkData.maxThreshold}). Benchmark: ${checkData.benchmark}.\n\nClick OK to confirm override, or Cancel to correct.`)) {
            onConfirmOverride();
        }
        return;
    }

    const msgEl = document.getElementById('absurd-modal-message');
    if (msgEl) {
        msgEl.innerHTML = `
            <p><strong>Plausibility Guardrail Triggered:</strong> You entered <strong>${checkData.enteredQty.toLocaleString()} ${checkData.unit}</strong>.</p>
            <p class="benchmark-highlight">Standard physical benchmark: ${checkData.benchmark}.</p>
            <p>This appears to be an order-of-magnitude typo (e.g. typing meters instead of kilometers, or an accidental extra zero).</p>
        `;
    }

    const autoCorrectBtn = document.getElementById('modal-auto-correct-btn');
    if (autoCorrectBtn) {
        autoCorrectBtn.textContent = `Auto-Correct to ${checkData.suggestedCorrection.toLocaleString()} ${checkData.unit}`;
        autoCorrectBtn.onclick = () => {
            modal.classList.add('hidden');
            onAutoCorrect(checkData.suggestedCorrection);
        };
    }

    const overrideBtn = document.getElementById('modal-override-btn');
    if (overrideBtn) {
        overrideBtn.onclick = () => {
            const checkbox = document.getElementById('modal-override-confirm-cb');
            if (checkbox && !checkbox.checked) {
                alert('Please check the confirmation box to verify this is an intentional aggregate or fleet log.');
                return;
            }
            modal.classList.add('hidden');
            onConfirmOverride();
        };
    }

    const cancelBtn = document.getElementById('modal-cancel-btn');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
        };
    }

    modal.classList.remove('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.PlanetPulseAPI = {
    getFactors: () => ({ ...EMISSION_FACTORS }),
    calculateCO2: (type, qty) => calculateCO2(type, qty),
    getStats: () => calculateBreakdown(),
    getWeeklyMetrics: () => calculateWeeklyMetrics(),
    getActivities: (filter = {}) => {
        let list = [...(state.activities || [])];
        if (filter.type && filter.type !== 'all') list = list.filter(a => a.type === filter.type);
        if (filter.startDate) list = list.filter(a => a.date >= filter.startDate);
        if (filter.endDate) list = list.filter(a => a.date <= filter.endDate);
        return list;
    },
    logActivity: (activityData) => {
        const { type, quantity, date, note, override_absurd } = activityData;
        const absurdCheck = checkAbsurdInput(type, quantity);
        if (absurdCheck.isAbsurd && !override_absurd) {
            return {
                success: false,
                error: 'ABSURD_INPUT_DETECTED',
                details: absurdCheck
            };
        }
        const co2 = calculateCO2(type, quantity);
        const meta = CATEGORY_META[type];
        const newAct = {
            id: 'act-' + Date.now(),
            type,
            quantity: parseFloat(quantity),
            unit: meta.unit,
            co2_kg: co2,
            date: date || new Date().toISOString().split('T')[0],
            note: note || ''
        };
        state.addActivity(newAct);
        renderAll();
        return { success: true, activity: newAct };
    },
    setWeeklyTarget: (val) => {
        state.saveTarget(val);
        renderAll();
        return { success: true, weeklyTarget: state.weeklyTarget };
    },
    resetData: () => {
        state.resetData();
        renderAll();
        return { success: true };
    }
};