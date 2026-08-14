// transport.js - SAGA Washing Center Transport & Trip Management Module

const TransportModule = {
  selectedCustomerSeq: [], // [{ customer_id, hotel_name, visit_order }]
  allCustomersCache: [],
  selectedStatsMonth: null, // Stores selected 'YYYY-MM' month string

  async init() {
    this.renderLayout();
    await this.renderTripsList();
  },

  renderLayout() {
    const container = document.getElementById('page-transport');
    if (!container) return;

    container.innerHTML = `
      <div class="p-4 sm:p-6 space-y-6">
        <!-- Header & Title -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-truck-fast text-indigo-600 dark:text-indigo-400"></i>
              Transport & Trip Management
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Track vehicle trips, starting/final KM, customer visit sequences, and distance travelled.
            </p>
          </div>
          
          <div class="flex items-center gap-2">
            ${isAdmin() ? `
              <button onclick="TransportModule.openFuelPriceModal()" class="px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-gas-pump"></i> Fuel Price
              </button>
            ` : ''}
            ${canEditTransport() ? `
              <button onclick="TransportModule.openStartTripModal()" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-sm flex items-center gap-2">
                <i class="fa-solid fa-plus-circle"></i> New Trip
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Summary Stats Cards (5 Cards) -->
        <div id="transport-stats-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <!-- Dynamic Stats Cards -->
        </div>

        <!-- Main Content Table Container -->
        <div id="transport-main-container"></div>
      </div>
    `;
  },

  async renderTripsList() {
    const mainContainer = document.getElementById('transport-main-container');
    const statsContainer = document.getElementById('transport-stats-container');
    if (!mainContainer) return;

    mainContainer.innerHTML = `<div class="p-8 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><p>Loading Transport Trips...</p></div>`;

    const [trips, fuelConfig] = await Promise.all([
      DB.getTrips(),
      DB.getFuelPriceSettings()
    ]);

    let inProgressCount = 0;
    let completedCount = 0;
    let totalDistanceKM = 0;

    const currentMonthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    if (!this.selectedStatsMonth) {
      this.selectedStatsMonth = currentMonthKey;
    }

    const monthlyStatsMap = {}; // { 'YYYY-MM': { distance: 0, count: 0 } }

    trips.forEach(t => {
      const dist = parseFloat(t.distance_km || 0);
      if (t.status === 'In Progress') inProgressCount++;
      if (t.status === 'Completed') {
        completedCount++;
        if (t.distance_km) totalDistanceKM += dist;
      }

      // Group monthly distance by start_date or created_at
      const dateStr = t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : '');
      if (dateStr && dateStr.length >= 7) {
        const mKey = dateStr.slice(0, 7);
        if (!monthlyStatsMap[mKey]) {
          monthlyStatsMap[mKey] = { distance: 0, count: 0 };
        }
        if (t.status === 'Completed') {
          monthlyStatsMap[mKey].distance += dist;
          monthlyStatsMap[mKey].count++;
        }
      }
    });

    if (!monthlyStatsMap[currentMonthKey]) {
      monthlyStatsMap[currentMonthKey] = { distance: 0, count: 0 };
    }

    // Calculate Monthly Fuel Cost & Full Cost (sum of monthly fuel costs)
    let fullFuelCostLKR = 0;
    Object.keys(monthlyStatsMap).forEach(mKey => {
      const mDist = monthlyStatsMap[mKey].distance;
      const mPriceConfig = (fuelConfig.monthly_prices && fuelConfig.monthly_prices[mKey]) 
        ? fuelConfig.monthly_prices[mKey] 
        : fuelConfig;
      const ratePerKm = parseFloat(mPriceConfig.cost_per_km || (mPriceConfig.current_price / (mPriceConfig.km_per_litre || 1)) || 37);
      const mCost = mDist * ratePerKm;
      monthlyStatsMap[mKey].fuelCost = mCost;
      monthlyStatsMap[mKey].ratePerKm = ratePerKm;
      fullFuelCostLKR += mCost;
    });

    const availableMonths = Object.keys(monthlyStatsMap).sort().reverse();
    const selectedMonth = availableMonths.includes(this.selectedStatsMonth) ? this.selectedStatsMonth : currentMonthKey;
    const selectedMonthData = monthlyStatsMap[selectedMonth] || { distance: 0, count: 0, fuelCost: 0, ratePerKm: fuelConfig.cost_per_km || 37 };

    const formatMonthLabel = (mKey) => {
      const [yr, mo] = mKey.split('-');
      const d = new Date(parseInt(yr), parseInt(mo) - 1, 1);
      return d.toLocaleString('default', { month: 'short', year: 'numeric' });
    };

    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-slate-400 uppercase">Total Trips</div>
            <div class="text-xl font-extrabold text-slate-800 dark:text-white mt-1">${trips.length}</div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg">
            <i class="fa-solid fa-route"></i>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">In Progress</div>
            <div class="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">${inProgressCount}</div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg">
            <i class="fa-solid fa-spinner fa-spin"></i>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Completed Trips</div>
            <div class="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">${completedCount}</div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg">
            <i class="fa-solid fa-circle-check"></i>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase">Total Distance</div>
            <div class="text-xl font-extrabold text-cyan-600 dark:text-cyan-400 mt-1">${totalDistanceKM.toFixed(1)} KM</div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-lg">
            <i class="fa-solid fa-gauge-high"></i>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <div class="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase flex items-center gap-1">
              <i class="fa-solid fa-calendar-days text-[11px]"></i> Monthly Distance
            </div>
            <button onclick="TransportModule.openMonthlyDistanceModal()" class="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all border border-purple-200/60 dark:border-purple-800/40 shrink-0" title="View Full Monthly Distance & Fuel Cost History">
              <i class="fa-solid fa-clock-rotate-left text-[10px]"></i> History
            </button>
          </div>

          <div class="mt-2">
            <div class="flex items-baseline justify-between gap-2">
              <div class="text-xl font-extrabold text-purple-600 dark:text-purple-400 font-mono">
                ${selectedMonthData.distance.toFixed(1)} KM
              </div>

              <select onchange="TransportModule.changeMonthlyStatMonth(this.value)" class="text-[11px] font-bold bg-slate-50 dark:bg-slate-750 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer shrink-0">
                ${availableMonths.map(m => `
                  <option value="${m}" ${m === selectedMonth ? 'selected' : ''}>
                    ${formatMonthLabel(m)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="text-[10px] font-semibold text-purple-700 dark:text-purple-300 mt-1 font-mono">
              Monthly Fuel Cost: LKR ${selectedMonthData.fuelCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      `;
    }

    let rowsHTML = '';
    if (trips.length === 0) {
      rowsHTML = `
        <tr>
          <td colspan="7" class="px-4 py-8 text-center text-xs text-slate-400">
            No vehicle trips recorded yet. Click <strong>"New Trip"</strong> above to start a trip.
          </td>
        </tr>
      `;
    } else {
      trips.forEach(t => {
        const isCompleted = t.status === 'Completed';

        // Render customer visit order badges
        let customersHTML = '<span class="text-slate-400 text-[11px]">No customers selected</span>';
        if (t.selected_customers && t.selected_customers.length > 0) {
          customersHTML = t.selected_customers.map(c => `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded-md text-[11px] font-semibold border border-indigo-200 dark:border-indigo-800/50 my-0.5">
              <span class="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold">${c.visit_order}</span>
              ${c.hotel_name}
            </span>
          `).join(' ');
        }

        const distanceDisplay = isCompleted ? `
          <div class="font-extrabold text-slate-800 dark:text-white text-xs">${t.distance_km || 0} KM</div>
          <div class="text-[10px] text-slate-400">${t.starting_km} KM ➔ ${t.final_km} KM</div>
        ` : `
          <div class="text-xs font-semibold text-amber-600">Start: ${t.starting_km} KM</div>
          <div class="text-[10px] text-slate-400">Trip Active</div>
        `;

        let actionButtons = '';
        if (!isCompleted) {
          if (canEditTransport()) {
            actionButtons = `
              <button onclick="TransportModule.openCustomerSelectionModal('${t.id}')" class="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center gap-1">
                <i class="fa-solid fa-list-check"></i> Customers
              </button>
              <button onclick="TransportModule.openEndTripModal('${t.id}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                <i class="fa-solid fa-flag-checkered"></i> End Trip
              </button>
            `;
          } else {
            actionButtons = `
              <button onclick="TransportModule.viewTripDetails('${t.id}')" class="px-2 py-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-medium">
                <i class="fa-solid fa-eye"></i> Details
              </button>
            `;
          }
        } else {
          actionButtons = `
            <button onclick="TransportModule.viewTripDetails('${t.id}')" class="px-2 py-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-medium">
              <i class="fa-solid fa-eye"></i> Details
            </button>
            ${canDelete() ? `
              <button onclick="TransportModule.deleteTrip('${t.id}')" class="px-2 py-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg text-xs font-medium">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          `;
        }

        rowsHTML += `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors border-b border-slate-200 dark:border-slate-700">
            <td class="px-4 py-3 text-xs font-mono font-extrabold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
              ${t.trip_id}
            </td>
            <td class="px-4 py-3 text-xs font-bold text-slate-800 dark:text-white whitespace-nowrap">
              <i class="fa-solid fa-user-circle text-slate-400 mr-1"></i> ${t.driver_name || 'Driver'}
            </td>
            <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap font-mono">
              <div>${t.start_date}</div>
              <div class="text-[10px] text-slate-400">${t.start_time}</div>
            </td>
            <td class="px-4 py-3 text-xs">
              <div class="flex flex-wrap items-center gap-1 max-w-xs sm:max-w-md">
                ${customersHTML}
              </div>
              ${t.notes ? `<div class="text-[10px] text-slate-400 italic mt-1"><i class="fa-solid fa-note-sticky mr-1"></i>${t.notes}</div>` : ''}
            </td>
            <td class="px-4 py-3 text-xs text-center whitespace-nowrap">
              ${distanceDisplay}
            </td>
            <td class="px-4 py-3 text-xs text-center whitespace-nowrap">
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isCompleted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 animate-pulse'}">
                ${t.status}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-center whitespace-nowrap">
              <div class="flex items-center justify-center gap-1.5">
                ${actionButtons}
              </div>
            </td>
          </tr>
        `;
      });
    }

    mainContainer.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-truck text-indigo-500"></i> Vehicle Trips Register
            </h2>
            <p class="text-xs text-slate-500">Complete trip lifecycle log with sequence order customer visits.</p>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <th class="px-4 py-3">Trip ID</th>
                <th class="px-4 py-3">Driver</th>
                <th class="px-4 py-3">Start Date/Time</th>
                <th class="px-4 py-3">Customer Visit Sequence</th>
                <th class="px-4 py-3 text-center">Distance (KM)</th>
                <th class="px-4 py-3 text-center">Status</th>
                <th class="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ──────────────────────────────────────────
  // STEP 4-8: START NEW TRIP MODAL
  // ──────────────────────────────────────────
  async openStartTripModal() {
    if (!canEditTransport()) return showToast('Driver or Admin permission required to start trips');
    const todayDate = new Date().toISOString().split('T')[0];
    const defaultTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tripId = await DB.generateTripId();
    const currentDriver = (window.currentUser && (window.currentUser.display_name || window.currentUser.username)) || 'Driver';

    // Auto-calculate default Starting KM from the End KM of the previous trip
    const trips = await DB.getTrips();
    let defaultStartKm = '';
    const previousTrip = trips.find(t => t.final_km !== null && t.final_km !== undefined) || trips[0];
    if (previousTrip) {
      defaultStartKm = previousTrip.final_km !== null && previousTrip.final_km !== undefined 
        ? previousTrip.final_km 
        : (previousTrip.starting_km || '');
    }

    const html = `
      <div id="start-trip-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-play text-indigo-600"></i> Start New Trip (${tripId})
            </h3>
            <button onclick="document.getElementById('start-trip-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onsubmit="TransportModule.saveStartTrip(event)" class="space-y-4 text-left">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Trip ID</label>
                <input type="text" value="${tripId}" readonly class="w-full px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600" />
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Driver Name</label>
                <input type="text" id="trip-driver-name" value="${currentDriver}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Start Date *</label>
                <input type="date" id="trip-start-date" value="${todayDate}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Start Time *</label>
                <input type="text" id="trip-start-time" value="${defaultTime}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-mono" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Starting KM (Odometer Reading) *</label>
              <input type="number" step="0.1" id="trip-starting-km" value="${defaultStartKm}" required placeholder="e.g. 45250" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold text-indigo-600" />
              <p class="text-[10px] text-slate-400 mt-0.5">${defaultStartKm !== '' ? `Auto-filled from previous trip final KM (${defaultStartKm} KM). Editable if needed.` : 'Vehicle kilometre reading at start of trip.'}</p>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onclick="document.getElementById('start-trip-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-play"></i> Start Trip
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  async saveStartTrip(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
      const driver = document.getElementById('trip-driver-name').value;
      const startDate = document.getElementById('trip-start-date').value;
      const startTime = document.getElementById('trip-start-time').value;
      const startingKm = document.getElementById('trip-starting-km').value;

      const record = await DB.addTrip({
        driver_name: driver,
        start_date: startDate,
        start_time: startTime,
        starting_km: startingKm,
        status: 'In Progress'
      });

      await DB.logAction('Start Trip', `Started trip ${record.trip_id} (Start KM: ${startingKm})`, record, 'Transport');

      document.getElementById('start-trip-modal')?.remove();
      showToast(`Trip ${record.trip_id} started!`);
      await this.renderTripsList();

      // Immediately open Customer Selection modal for the new trip (Steps 9-12)
      this.openCustomerSelectionModal(record.id);
    } catch (err) {
      console.error('saveStartTrip error:', err);
      showToast('Failed to start trip: ' + (err.message || err), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ──────────────────────────────────────────
  // STEP 9-12: SELECT CUSTOMERS & ORDER PRESERVATION MODAL
  // ──────────────────────────────────────────
  async openCustomerSelectionModal(tripDbId) {
    if (!canEditTransport()) return showToast('Driver or Admin permission required to edit trip customers');
    const [trip, customers] = await Promise.all([
      DB.getTrip(tripDbId),
      DB.getCustomers()
    ]);

    if (!trip) return;

    this.allCustomersCache = customers || [];
    // Load existing selection or reset
    this.selectedCustomerSeq = trip.selected_customers ? [...trip.selected_customers] : [];

    const html = `
      <div id="cust-select-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4 max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 shrink-0">
            <div>
              <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-list-check text-indigo-600"></i> Select Customers for Trip (${trip.trip_id})
              </h3>
              <p class="text-xs text-slate-400">Click customer buttons in the exact order they will be visited.</p>
            </div>
            <button onclick="document.getElementById('cust-select-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="space-y-4 overflow-y-auto flex-1 pr-1">
            <!-- Selected Sequence Live Preview Box -->
            <div class="bg-indigo-50 dark:bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800/50">
              <div class="text-xs font-bold text-indigo-900 dark:text-indigo-200 mb-2 flex items-center justify-between">
                <span>Intended Visit Sequence Order:</span>
                <button type="button" onclick="TransportModule.clearCustomerSequence()" class="text-[10px] text-rose-600 hover:underline">Reset Order</button>
              </div>
              <div id="cust-seq-badge-list" class="flex flex-wrap items-center gap-1.5 min-h-[32px]">
                <!-- Dynamically rendered sequence tags -->
              </div>
            </div>

            <!-- Customer Search Input -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">Customer List (Click Button to Add/Remove):</label>
                <span class="text-[10px] text-slate-400 font-semibold">Click order = Visit sequence</span>
              </div>
              <div class="relative mb-2">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
                <input type="text" id="cust-search-input" oninput="TransportModule.filterCustomerButtons(this.value)" placeholder="Search customer by name..." class="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 font-medium" />
              </div>

              <!-- Customer Buttons Container (No checkboxes, whole button clickable) -->
              <div id="cust-buttons-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                ${this.renderCustomerButtonsHTML()}
              </div>
            </div>

            <!-- Optional Trip Notes (Step 12) -->
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Trip Notes (Optional)</label>
              <textarea id="trip-notes-input" rows="2" placeholder="e.g. Customer requested delivery after 10:00 AM..." class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600">${trip.notes || ''}</textarea>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <button type="button" onclick="document.getElementById('cust-select-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
            <button type="button" onclick="TransportModule.saveCustomerSelection('${trip.id}')" class="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm flex items-center gap-1.5">
              <i class="fa-solid fa-check"></i> Done (Save Sequence)
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    this.renderSequenceBadges();
  },

  renderCustomerButtonsHTML(query = '') {
    const q = (query || '').toLowerCase().trim();
    const filtered = this.allCustomersCache.filter(c => !q || (c.hotel_name || '').toLowerCase().includes(q));

    if (filtered.length === 0) {
      return `<div class="col-span-2 text-center text-xs text-slate-400 py-6">No matching customers found.</div>`;
    }

    return filtered.map(c => {
      const seqObj = this.selectedCustomerSeq.find(s => s.customer_id === c.id || s.hotel_name === c.hotel_name);
      const isSelected = !!seqObj;
      const orderNum = isSelected ? seqObj.visit_order : '';

      return `
        <button type="button" 
          onclick="TransportModule.toggleCustomerSelection('${c.id}', '${(c.hotel_name || '').replace(/'/g, "\\'")}')" 
          class="p-3 rounded-xl text-left border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-[1.01]' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:border-indigo-300'}">
          <span class="truncate pr-2">${c.hotel_name}</span>
          ${isSelected ? `
            <span class="w-6 h-6 rounded-full bg-white text-indigo-700 font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">#${orderNum}</span>
          ` : `
            <span class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 text-xs flex items-center justify-center shrink-0"><i class="fa-solid fa-plus text-[10px]"></i></span>
          `}
        </button>
      `;
    }).join('');
  },

  filterCustomerButtons(query) {
    const grid = document.getElementById('cust-buttons-grid');
    if (grid) {
      grid.innerHTML = this.renderCustomerButtonsHTML(query);
    }
  },

  toggleCustomerSelection(cid, hotelName) {
    const idx = this.selectedCustomerSeq.findIndex(s => s.customer_id === cid || s.hotel_name === hotelName);
    if (idx >= 0) {
      // Remove from sequence
      this.selectedCustomerSeq.splice(idx, 1);
    } else {
      // Add to sequence preserving exact click time order
      this.selectedCustomerSeq.push({
        customer_id: cid,
        hotel_name: hotelName,
        visit_order: this.selectedCustomerSeq.length + 1
      });
    }

    // Re-index visit orders 1, 2, 3...
    this.selectedCustomerSeq.forEach((item, index) => {
      item.visit_order = index + 1;
    });

    // Update Customer Buttons Grid & Badges dynamically without closing modal
    const searchVal = document.getElementById('cust-search-input')?.value || '';
    this.filterCustomerButtons(searchVal);
    this.renderSequenceBadges();
  },

  clearCustomerSequence() {
    this.selectedCustomerSeq = [];
    const searchVal = document.getElementById('cust-search-input')?.value || '';
    this.filterCustomerButtons(searchVal);
    this.renderSequenceBadges();
  },

  renderSequenceBadges() {
    const badgeContainer = document.getElementById('cust-seq-badge-list');
    if (!badgeContainer) return;

    if (this.selectedCustomerSeq.length === 0) {
      badgeContainer.innerHTML = `<span class="text-slate-400 text-[11px] italic">No customers selected yet. Click customer buttons below to add to visit order.</span>`;
      return;
    }

    badgeContainer.innerHTML = this.selectedCustomerSeq.map((c, i) => `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-lg text-xs font-bold border border-indigo-200 dark:border-indigo-800 shadow-xs animate-fade-in">
        <span class="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-extrabold">#${c.visit_order}</span>
        ${c.hotel_name}
        ${i < this.selectedCustomerSeq.length - 1 ? `<i class="fa-solid fa-arrow-right text-[10px] text-indigo-400 ml-1"></i>` : ''}
      </span>
    `).join('');
  },

  async saveCustomerSelection(tripDbId) {
    const notesInput = document.getElementById('trip-notes-input');
    const notes = notesInput ? notesInput.value : '';

    await DB.updateTrip(tripDbId, {
      selected_customers: this.selectedCustomerSeq,
      notes: notes
    });

    const trip = await DB.getTrip(tripDbId);
    await DB.logAction('Set Trip Customers', `Updated customer sequence for ${trip ? trip.trip_id : tripDbId}`, { selected_customers: this.selectedCustomerSeq }, 'Transport');

    const modal = document.getElementById('cust-select-modal');
    if (modal) modal.remove();

    showToast('Customer visit sequence saved!');
    await this.renderTripsList();
  },

  // ──────────────────────────────────────────
  // STEP 14-19: END / COMPLETE TRIP MODAL (Includes Customer Selection Option)
  // ──────────────────────────────────────────
  async openEndTripModal(tripDbId) {
    if (!canEditTransport()) return showToast('Driver or Admin permission required to end trips');
    const [trip, customers] = await Promise.all([
      DB.getTrip(tripDbId),
      DB.getCustomers()
    ]);

    if (!trip) return;

    this.allCustomersCache = customers || [];
    this.selectedCustomerSeq = trip.selected_customers ? [...trip.selected_customers] : [];

    const todayDate = new Date().toISOString().split('T')[0];
    const defaultEndTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const html = `
      <div id="end-trip-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4 max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 shrink-0">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-flag-checkered text-emerald-600"></i> Complete Trip (${trip.trip_id})
            </h3>
            <button onclick="document.getElementById('end-trip-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onsubmit="TransportModule.saveEndTrip(event, '${trip.id}')" class="space-y-4 text-left overflow-y-auto flex-1 pr-1">
            <!-- Trip Overview Banner -->
            <div class="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-xl text-xs space-y-1">
              <div class="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Driver: <strong>${trip.driver_name}</strong></span>
                <span>Starting KM: <strong class="text-indigo-600 font-mono">${trip.starting_km} KM</strong></span>
              </div>
              <div class="flex justify-between text-slate-500">
                <span>Start: ${trip.start_date} @ ${trip.start_time}</span>
              </div>
            </div>

            <!-- Customer Visit Sequence Section (Available directly in End Trip flow) -->
            <div class="bg-indigo-50/70 dark:bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 space-y-3">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-bold text-indigo-900 dark:text-indigo-200">Visited Customers & Sequence Order:</label>
                <button type="button" onclick="TransportModule.clearCustomerSequence()" class="text-[10px] text-rose-600 hover:underline">Reset Order</button>
              </div>

              <!-- Sequence badges -->
              <div id="cust-seq-badge-list" class="flex flex-wrap items-center gap-1.5 min-h-[30px]"></div>

              <!-- Customer Search Input -->
              <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
                <input type="text" id="cust-search-input" oninput="TransportModule.filterCustomerButtons(this.value)" placeholder="🔍 Search customer to add/update..." class="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 font-medium" />
              </div>

              <!-- Customer Buttons Grid -->
              <div id="cust-buttons-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 p-2 rounded-xl bg-white dark:bg-slate-800">
                ${this.renderCustomerButtonsHTML()}
              </div>
            </div>

            <!-- End Trip Readings -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">End Date *</label>
                <input type="date" id="trip-end-date" value="${todayDate}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">End Time *</label>
                <input type="text" id="trip-end-time" value="${defaultEndTime}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-mono" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Final KM (Odometer Reading) *</label>
              <input type="number" step="0.1" id="trip-final-km" required min="${trip.starting_km}" placeholder="Must be >= ${trip.starting_km}" oninput="TransportModule.calcDistancePreview(${trip.starting_km})" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold text-emerald-600" />
            </div>

            <!-- Live Distance Calculation Box -->
            <div id="distance-preview-box" class="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between text-xs">
              <span class="font-semibold text-emerald-800 dark:text-emerald-300">Calculated Distance Travelled:</span>
              <span id="distance-val-text" class="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">0 KM</span>
            </div>

            <!-- Optional Trip Notes -->
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Trip Notes (Optional)</label>
              <textarea id="trip-notes-input" rows="2" placeholder="Optional final trip remarks..." class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600">${trip.notes || ''}</textarea>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 shrink-0">
              <button type="button" onclick="document.getElementById('end-trip-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-check"></i> Complete & Save Trip
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    this.renderSequenceBadges();
  },

  calcDistancePreview(startKm) {
    const finalInput = document.getElementById('trip-final-km');
    const valText = document.getElementById('distance-val-text');
    if (!finalInput || !valText) return;

    const finalKm = parseFloat(finalInput.value) || 0;
    if (finalKm >= startKm) {
      const dist = (finalKm - startKm).toFixed(1);
      valText.textContent = `${dist} KM`;
      valText.className = 'text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono';
    } else {
      valText.textContent = `Invalid (Must be >= ${startKm})`;
      valText.className = 'text-xs font-bold text-rose-500 font-mono';
    }
  },

  async saveEndTrip(e, tripDbId) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
      const endDate = document.getElementById('trip-end-date').value;
      const endTime = document.getElementById('trip-end-time').value;
      const finalKm = parseFloat(document.getElementById('trip-final-km').value) || 0;
      const notesInput = document.getElementById('trip-notes-input');
      const notes = notesInput ? notesInput.value : '';

      const trip = await DB.getTrip(tripDbId);
      if (!trip) {
        if (btn) btn.disabled = false;
        return;
      }

      if (finalKm < trip.starting_km) {
        if (btn) btn.disabled = false;
        showToast(`Final KM (${finalKm}) cannot be less than Starting KM (${trip.starting_km}).`, 'error');
        return;
      }

      const distanceKm = parseFloat((finalKm - trip.starting_km).toFixed(2));

      await DB.updateTrip(tripDbId, {
        end_date: endDate,
        end_time: endTime,
        final_km: finalKm,
        distance_km: distanceKm,
        selected_customers: this.selectedCustomerSeq,
        notes: notes,
        status: 'Completed'
      });

      await DB.logAction('End Trip', `Completed trip ${trip.trip_id} (Distance: ${distanceKm} KM)`, { trip_id: trip.trip_id, distance_km: distanceKm, selected_customers: this.selectedCustomerSeq }, 'Transport');

      document.getElementById('end-trip-modal')?.remove();
      showToast(`Trip ${trip.trip_id} completed! Distance: ${distanceKm} KM`);
      await this.renderTripsList();
    } catch (err) {
      console.error('saveEndTrip error:', err);
      showToast('Failed to end trip: ' + (err.message || err), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async viewTripDetails(tripDbId) {
    const trip = await DB.getTrip(tripDbId);
    if (!trip) return;

    let custHTML = '<span class="text-slate-400">None selected</span>';
    if (trip.selected_customers && trip.selected_customers.length > 0) {
      custHTML = trip.selected_customers.map(c => `
        <div class="flex items-center gap-2 text-xs py-1 border-b border-slate-100 dark:border-slate-700">
          <span class="w-5 h-5 rounded-full bg-indigo-600 text-white font-extrabold text-[10px] flex items-center justify-center shrink-0">#${c.visit_order}</span>
          <span class="font-bold text-slate-800 dark:text-white">${c.hotel_name}</span>
        </div>
      `).join('');
    }

    const html = `
      <div id="trip-details-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-route text-indigo-600"></i> Trip Details (${trip.trip_id})
            </h3>
            <button onclick="document.getElementById('trip-details-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="space-y-3 text-xs">
            <div class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
              <span class="text-slate-500">Status</span>
              <span class="font-bold text-emerald-600">${trip.status}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
              <span class="text-slate-500">Driver</span>
              <span class="font-bold text-slate-800 dark:text-white">${trip.driver_name}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
              <span class="text-slate-500">Start Time</span>
              <span class="font-mono text-slate-700 dark:text-slate-300">${trip.start_date} @ ${trip.start_time}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
              <span class="text-slate-500">End Time</span>
              <span class="font-mono text-slate-700 dark:text-slate-300">${trip.end_date || 'N/A'} @ ${trip.end_time || 'N/A'}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
              <span class="text-slate-500">Odometer Readings</span>
              <span class="font-mono text-slate-700 dark:text-slate-300">${trip.starting_km} KM ➔ ${trip.final_km || '?'} KM</span>
            </div>
            <div class="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
              <span class="text-slate-500">Distance Travelled</span>
              <span class="font-bold text-indigo-600 text-sm font-mono">${trip.distance_km || 0} KM</span>
            </div>

            <div>
              <span class="block text-slate-500 font-bold mb-1">Customer Visit Sequence:</span>
              <div class="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 max-h-36 overflow-y-auto">
                ${custHTML}
              </div>
            </div>

            ${trip.notes ? `
              <div>
                <span class="block text-slate-500 font-bold mb-1">Trip Notes:</span>
                <div class="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-700 dark:text-slate-300 italic">${trip.notes}</div>
              </div>
            ` : ''}
          </div>

          <div class="pt-2 border-t border-slate-200 dark:border-slate-700 text-right">
            <button onclick="document.getElementById('trip-details-modal').remove()" class="px-4 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl">Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  async deleteTrip(tripDbId) {
    if (!canDelete()) return showToast('Admin permission required to delete trips', 'error');
    try {
      const trip = await DB.getTrip(tripDbId);
      const tripName = trip ? `Trip ${trip.trip_id} (${trip.driver_name || 'Driver'})` : 'this trip record';

      confirmDialog(`Are you sure you want to delete ${tripName}?`, async () => {
        try {
          await DB.deleteTrip(tripDbId);
          await DB.logAction('Delete Trip', `Deleted trip record ${trip ? trip.trip_id : tripDbId}`, { id: tripDbId }, 'Transport');
          showToast('Trip record deleted.');
          await this.renderTripsList();
        } catch (err) {
          console.error('deleteTrip error:', err);
          showToast('Failed to delete trip: ' + (err.message || err), 'error');
        }
      }, 'Delete Trip');
    } catch (err) {
      console.error('deleteTrip fetch error:', err);
    }
  },

  changeMonthlyStatMonth(monthKey) {
    this.selectedStatsMonth = monthKey;
    this.renderTripsList();
  },

  async openFuelPriceModal() {
    if (!isAdmin()) return showToast('Admin permission required to update Fuel Price');
    const fuelConfig = await DB.getFuelPriceSettings();
    const currentMonth = new Date().toISOString().slice(0, 7);

    const html = `
      <div id="fuel-price-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-gas-pump text-purple-600"></i> Configure Fuel Price (Admin)
            </h3>
            <button onclick="document.getElementById('fuel-price-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onsubmit="TransportModule.saveFuelPrice(event)" class="space-y-4 text-left">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Fuel Price (LKR per Litre) *</label>
              <input type="number" step="0.01" id="fuel-price-input" value="${fuelConfig.current_price || 370}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold text-purple-600" oninput="TransportModule.updateFuelRateCalc()" />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vehicle Fuel Efficiency (KM per Litre) *</label>
              <input type="number" step="0.1" id="fuel-km-per-litre" value="${fuelConfig.km_per_litre || 10}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold" oninput="TransportModule.updateFuelRateCalc()" />
              <p class="text-[10px] text-slate-400 mt-0.5">Average kilometres travelled per 1 litre of fuel</p>
            </div>

            <div class="bg-purple-50 dark:bg-purple-950/40 p-3 rounded-xl border border-purple-200 dark:border-purple-800/40 flex justify-between items-center text-xs">
              <span class="font-semibold text-purple-700 dark:text-purple-300">Calculated Fuel Rate per KM:</span>
              <span id="fuel-rate-calc-preview" class="font-mono font-extrabold text-purple-600 dark:text-purple-400 text-sm">
                LKR ${((fuelConfig.current_price || 370) / (fuelConfig.km_per_litre || 10)).toFixed(2)} / KM
              </span>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Effective Month</label>
              <input type="month" id="fuel-effective-month" value="${currentMonth}" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onclick="document.getElementById('fuel-price-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-sm">Save Fuel Rate</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  updateFuelRateCalc() {
    const price = parseFloat(document.getElementById('fuel-price-input')?.value || 0);
    const kmPerL = parseFloat(document.getElementById('fuel-km-per-litre')?.value || 1);
    const rate = kmPerL > 0 ? (price / kmPerL) : 0;
    const preview = document.getElementById('fuel-rate-calc-preview');
    if (preview) preview.textContent = `LKR ${rate.toFixed(2)} / KM`;
  },

  async saveFuelPrice(e) {
    e.preventDefault();
    if (!isAdmin()) return showToast('Admin permission required');
    const price = parseFloat(document.getElementById('fuel-price-input').value) || 0;
    const kmPerL = parseFloat(document.getElementById('fuel-km-per-litre').value) || 1;
    const month = document.getElementById('fuel-effective-month').value || new Date().toISOString().slice(0, 7);

    const costPerKm = kmPerL > 0 ? (price / kmPerL) : price;

    const config = await DB.getFuelPriceSettings();
    config.current_price = price;
    config.km_per_litre = kmPerL;
    config.cost_per_km = costPerKm;

    if (!config.monthly_prices) config.monthly_prices = {};
    config.monthly_prices[month] = {
      price: price,
      km_per_litre: kmPerL,
      cost_per_km: costPerKm,
      updated_at: new Date().toISOString()
    };

    await DB.saveFuelPriceSettings(config);
    await DB.logAction('Update Fuel Price', `Updated fuel price to LKR ${price}/L (LKR ${costPerKm.toFixed(2)}/KM) for ${month}`, config, 'Transport');

    document.getElementById('fuel-price-modal').remove();
    showToast('Fuel price updated successfully!');
    await this.renderTripsList();
  },

  async openMonthlyDistanceModal() {
    const [trips, fuelConfig] = await Promise.all([
      DB.getTrips(),
      DB.getFuelPriceSettings()
    ]);
    
    // Group completed trips by YYYY-MM
    const monthMap = {};
    trips.forEach(t => {
      if (t.status === 'Completed') {
        const dateStr = t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : '');
        if (dateStr && dateStr.length >= 7) {
          const mKey = dateStr.slice(0, 7);
          if (!monthMap[mKey]) {
            monthMap[mKey] = { distance: 0, count: 0, trips: [] };
          }
          monthMap[mKey].distance += parseFloat(t.distance_km || 0);
          monthMap[mKey].count++;
          monthMap[mKey].trips.push(t);
        }
      }
    });

    const monthKeys = Object.keys(monthMap).sort().reverse();
    const currentMonthKey = new Date().toISOString().slice(0, 7);

    let rowsHTML = '';
    let totalFullCostLKR = 0;

    if (monthKeys.length === 0) {
      rowsHTML = `
        <tr>
          <td colspan="5" class="px-4 py-8 text-center text-xs text-slate-400">
            No completed trip distance history found.
          </td>
        </tr>
      `;
    } else {
      monthKeys.forEach(mKey => {
        const data = monthMap[mKey];
        const [yr, mo] = mKey.split('-');
        const dateObj = new Date(parseInt(yr), parseInt(mo) - 1, 1);
        const label = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
        const isCurrent = mKey === currentMonthKey;
        
        const mPriceConfig = fuelConfig.monthly_prices && fuelConfig.monthly_prices[mKey] 
          ? fuelConfig.monthly_prices[mKey] 
          : fuelConfig;
        const ratePerKm = parseFloat(mPriceConfig.cost_per_km || (mPriceConfig.current_price / (mPriceConfig.km_per_litre || 1)) || 37);
        const mFuelCost = data.distance * ratePerKm;
        totalFullCostLKR += mFuelCost;

        rowsHTML += `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors border-b border-slate-200 dark:border-slate-700">
            <td class="px-4 py-3 text-xs font-bold text-slate-800 dark:text-white">
              ${label} ${isCurrent ? '<span class="ml-1.5 px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 rounded-full text-[10px] font-extrabold">Current Month</span>' : ''}
            </td>
            <td class="px-4 py-3 text-xs text-center font-semibold text-slate-600 dark:text-slate-300">
              ${data.count} ${data.count === 1 ? 'trip' : 'trips'}
            </td>
            <td class="px-4 py-3 text-xs text-right font-bold text-purple-600 dark:text-purple-400 font-mono">
              ${data.distance.toFixed(1)} KM
            </td>
            <td class="px-4 py-3 text-xs text-right font-medium text-slate-500 font-mono">
              LKR ${ratePerKm.toFixed(2)}/KM
            </td>
            <td class="px-4 py-3 text-xs text-right font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
              LKR ${mFuelCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </td>
          </tr>
        `;
      });
    }

    const html = `
      <div id="monthly-distance-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <div>
              <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-clock-rotate-left text-purple-600"></i> Monthly Distance & Fuel Cost History
              </h3>
              <p class="text-xs text-slate-500">Calculated using monthly fuel price rates.</p>
            </div>
            <button onclick="document.getElementById('monthly-distance-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="overflow-x-auto max-h-[55vh]">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <th class="px-4 py-3">Month</th>
                  <th class="px-4 py-3 text-center">Trips</th>
                  <th class="px-4 py-3 text-right">Distance</th>
                  <th class="px-4 py-3 text-right">Fuel Rate</th>
                  <th class="px-4 py-3 text-right">Monthly Cost</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
              <tfoot>
                <tr class="bg-purple-50/70 dark:bg-purple-950/40 border-t-2 border-purple-200 dark:border-purple-800/50 font-bold">
                  <td colspan="4" class="px-4 py-3 text-xs text-purple-900 dark:text-purple-200 uppercase font-extrabold">Full Cost (Sum of Monthly Fuel Costs)</td>
                  <td class="px-4 py-3 text-xs text-right text-purple-700 dark:text-purple-300 font-extrabold font-mono text-sm">
                    LKR ${totalFullCostLKR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
            <button onclick="document.getElementById('monthly-distance-modal').remove()" class="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 rounded-xl">
              Close
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  }
};
