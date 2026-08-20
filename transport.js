// transport.js - SAGA Washing Center Transport & Trip Management Module

const TransportModule = {
  selectedCustomerSeq: [], // [{ customer_id, hotel_name, visit_order }]
  allCustomersCache: [],
  driversCache: [],
  vehiclesCache: [],
  selectedStatsMonth: null, // Stores selected 'YYYY-MM' month string
  tripFilter: 'ongoing', // 'ongoing' | 'completed'
  _startTripAllTrips: [],
  _startTripVehicles: [],

  async init() {
    this.renderLayout();
    await this.renderTripsList();
  },

  // newchanges2.md: when the logged-in user IS a driver, the customer
  // list shown when selecting/ending a trip's stops should only include
  // customers who actually have an order assigned to that driver — not
  // every customer in the system. Admin/staff (managing trips on behalf
  // of a driver) still see everyone. Search bar behavior is unaffected
  // since this only narrows the base list filterCustomerButtons searches.
  async _scopeCustomersToDriver(allCustomers) {
    if (!(typeof isDriver === 'function' && isDriver()) || !currentUser?.driver_id) return allCustomers;
    let orders = [];
    try { orders = await DB.getOrdersByDriver(currentUser.driver_id); } catch (e) { orders = []; }
    const custIds = new Set(orders.map(o => String(o.customer_id)));
    return (allCustomers || []).filter(c => custIds.has(String(c.id)));
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
            ${canEditTransport() ? `
              <button onclick="TransportModule.openStartTripModal()" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-sm flex items-center gap-2">
                <i class="fa-solid fa-plus-circle"></i> New Trip
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Summary Stats Cards -->
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

    const [rawTrips, drivers, vehicles] = await Promise.all([
      DB.getTrips(),
      DB.getDrivers(),
      DB.getVehicles()
    ]);

    this.driversCache = drivers || [];
    this.vehiclesCache = vehicles || [];

    // Order trips by start date (most recent first); created_at breaks ties
    // between trips started on the same date.
    const trips = [...(rawTrips || [])].sort((a, b) => {
      const dateA = a.start_date || (a.created_at ? String(a.created_at).slice(0, 10) : '');
      const dateB = b.start_date || (b.created_at ? String(b.created_at).slice(0, 10) : '');
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

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

    const availableMonths = Object.keys(monthlyStatsMap).sort().reverse();
    const selectedMonth = availableMonths.includes(this.selectedStatsMonth) ? this.selectedStatsMonth : currentMonthKey;
    const selectedMonthData = monthlyStatsMap[selectedMonth] || { distance: 0, count: 0 };

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
            <button onclick="TransportModule.openMonthlyDistanceModal()" class="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all border border-purple-200/60 dark:border-purple-800/40 shrink-0" title="View Full Monthly Distance History">
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

            <div class="text-[10px] font-semibold text-purple-700 dark:text-purple-300 mt-1">
              ${selectedMonthData.count} trip${selectedMonthData.count !== 1 ? 's' : ''} completed this period
            </div>
          </div>
        </div>
      `;
    }

    if (!this.tripFilter) this.tripFilter = 'ongoing';
    const displayTrips = trips.filter(t => this.tripFilter === 'completed' ? t.status === 'Completed' : t.status !== 'Completed');

    let rowsHTML = '';
    if (displayTrips.length === 0) {
      rowsHTML = `
        <tr>
          <td colspan="7" class="px-4 py-8 text-center text-xs text-slate-400">
            ${this.tripFilter === 'completed' ? 'No completed trips yet.' : `No ongoing trips. Click <strong>"New Trip"</strong> above to start a trip.`}
          </td>
        </tr>
      `;
    } else {
      displayTrips.forEach(t => {
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

        // Admin can override the KM range on any trip — ongoing or
        // completed (newchanges2.md) — separate from the driver-facing
        // Start/End Trip flow which stays auto-calibrated/locked.
        const editKmBtn = isAdmin() ? `
          <button onclick="TransportModule.openEditKmModal('${t.id}')" class="px-2 py-1 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg text-xs font-medium">
            <i class="fa-solid fa-gauge-high"></i> Edit KM
          </button>
        ` : '';

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
              ${editKmBtn}
            `;
          } else {
            actionButtons = `
              <button onclick="TransportModule.viewTripDetails('${t.id}')" class="px-2 py-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-medium">
                <i class="fa-solid fa-eye"></i> Details
              </button>
              ${editKmBtn}
            `;
          }
        } else {
          actionButtons = `
            <button onclick="TransportModule.viewTripDetails('${t.id}')" class="px-2 py-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-medium">
              <i class="fa-solid fa-eye"></i> Details
            </button>
            ${editKmBtn}
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
              <div><i class="fa-solid fa-user-circle text-slate-400 mr-1"></i> ${t.driver_name || 'Driver'}</div>
              ${t.vehicle_no ? `<div class="text-[10px] font-semibold text-slate-400 mt-0.5"><i class="fa-solid fa-car-side mr-1"></i>${escapeHtml(t.vehicle_no)}</div>` : ''}
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
        <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-truck text-indigo-500"></i> Vehicle Trips Register
            </h2>
            <p class="text-xs text-slate-500">Complete trip lifecycle log with sequence order customer visits.</p>
          </div>

          <div class="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl shrink-0">
            <button onclick="TransportModule.setTripFilter('ongoing')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${this.tripFilter === 'ongoing' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">
              <i class="fa-solid fa-spinner mr-1"></i> Ongoing (${inProgressCount})
            </button>
            <button onclick="TransportModule.setTripFilter('completed')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${this.tripFilter === 'completed' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">
              <i class="fa-solid fa-circle-check mr-1"></i> Completed (${completedCount})
            </button>
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

  setTripFilter(filter) {
    this.tripFilter = filter;
    this.renderTripsList();
  },

  // ──────────────────────────────────────────
  // START NEW TRIP MODAL
  // ──────────────────────────────────────────
  async openStartTripModal() {
    if (!canEditTransport()) return showToast('Driver or Admin permission required to start trips');
    const todayDate = new Date().toISOString().split('T')[0];
    const defaultTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    const [tripId, trips, drivers, vehicles] = await Promise.all([
      DB.generateTripId(),
      DB.getTrips(),
      DB.getDrivers(),
      DB.getVehicles()
    ]);

    this._startTripAllTrips = trips || [];
    this._startTripVehicles = vehicles || [];

    // A driver/vehicle already on an "In Progress" trip must not be selectable,
    // even if their status field is somehow out of sync — one active trip at a time.
    const activeDriverIds = new Set((trips || []).filter(t => t.status === 'In Progress' && t.driver_id != null).map(t => String(t.driver_id)));
    const activeVehicleIds = new Set((trips || []).filter(t => t.status === 'In Progress' && t.vehicle_id != null).map(t => String(t.vehicle_id)));

    const availableDrivers = (drivers || []).filter(d => (d.status || 'available').toLowerCase() === 'available' && !activeDriverIds.has(String(d.id)));
    const availableVehicles = (vehicles || []).filter(v => (v.status || 'available').toLowerCase() === 'available' && !activeVehicleIds.has(String(v.id)));

    const driverOptionsHTML = availableDrivers.length > 0
      ? availableDrivers.map(d => `<option value="${d.id}">${escapeHtml(d.name)}${d.nickname ? ` (${escapeHtml(d.nickname)})` : ''}</option>`).join('')
      : `<option value="" disabled selected>No drivers available right now</option>`;

    const vehicleOptionsHTML = availableVehicles.length > 0
      ? availableVehicles.map(v => `<option value="${v.id}">${escapeHtml(v.vehicle_no)}${v.model ? ` — ${escapeHtml(v.model)}` : ''}</option>`).join('')
      : `<option value="" disabled selected>No vehicles available right now</option>`;

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
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Trip ID</label>
              <input type="text" value="${tripId}" readonly class="w-full px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Driver *</label>
                <select id="trip-driver-select" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold">
                  <option value="">Select driver...</option>
                  ${driverOptionsHTML}
                </select>
                <p class="text-[10px] text-slate-400 mt-0.5">Only drivers currently "Available" are shown.</p>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vehicle *</label>
                <select id="trip-vehicle-select" required onchange="TransportModule.onStartTripVehicleChange(this.value)" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold">
                  <option value="">Select vehicle...</option>
                  ${vehicleOptionsHTML}
                </select>
                <p class="text-[10px] text-slate-400 mt-0.5">Only vehicles currently "Available" are shown.</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Start Date *</label>
                <input type="date" id="trip-start-date" value="${todayDate}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600" />
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Start Time * <span class="text-slate-400 font-normal">(12-hour)</span></label>
                <input type="text" id="trip-start-time" value="${defaultTime}" required placeholder="e.g. 08:30 AM" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-mono" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Starting KM (Odometer Reading) *</label>
              <input type="number" step="0.1" id="trip-starting-km" required placeholder="Select a vehicle first" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold text-indigo-600" />
              <p id="trip-starting-km-hint" class="text-[10px] text-slate-400 mt-0.5">Select a vehicle to auto-fill starting KM from its last trip.</p>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onclick="document.getElementById('start-trip-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-play"></i> Start & Save
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  // Vehicle-specific KM calibration: the starting KM of a trip is always the
  // final KM recorded at the end of that SAME vehicle's last trip. Locked
  // (read-only) once auto-filled — only editable if the vehicle has no prior
  // trip history yet.
  onStartTripVehicleChange(vehicleId) {
    const kmInput = document.getElementById('trip-starting-km');
    const kmHint = document.getElementById('trip-starting-km-hint');
    if (!kmInput) return;

    if (!vehicleId) {
      kmInput.value = '';
      kmInput.readOnly = false;
      kmInput.classList.remove('bg-slate-100', 'dark:bg-slate-700', 'cursor-not-allowed');
      if (kmHint) kmHint.textContent = 'Select a vehicle to auto-fill starting KM from its last trip.';
      return;
    }

    const vehicleTrips = (this._startTripAllTrips || [])
      .filter(t => String(t.vehicle_id) === String(vehicleId) && t.final_km !== null && t.final_km !== undefined)
      .sort((a, b) => new Date(b.end_date || b.created_at || 0) - new Date(a.end_date || a.created_at || 0));

    if (vehicleTrips.length > 0) {
      const lastFinalKm = vehicleTrips[0].final_km;
      kmInput.value = lastFinalKm;
      kmInput.readOnly = true;
      kmInput.classList.add('bg-slate-100', 'dark:bg-slate-700', 'cursor-not-allowed');
      if (kmHint) kmHint.textContent = `Auto-calibrated from this vehicle's last trip end KM (${lastFinalKm} KM). Locked — cannot be edited.`;
    } else {
      // No prior trips for this vehicle — fall back to the odometer reading
      // recorded when the vehicle was added/edited in the Vehicles tab
      // (newchanges2.md: not every vehicle starts at 0km).
      const vehicle = (this._startTripVehicles || []).find(v => String(v.id) === String(vehicleId));
      const initialKm = vehicle ? (parseFloat(vehicle.initial_km) || 0) : 0;
      kmInput.value = initialKm;
      kmInput.readOnly = false;
      kmInput.classList.remove('bg-slate-100', 'dark:bg-slate-700', 'cursor-not-allowed');
      if (kmHint) kmHint.textContent = `No previous trips for this vehicle — pre-filled from its registered odometer reading (${initialKm} KM). Editable if needed.`;
    }
  },

  async saveStartTrip(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
      const driverId = document.getElementById('trip-driver-select').value;
      const vehicleId = document.getElementById('trip-vehicle-select').value;
      const startDate = document.getElementById('trip-start-date').value;
      const startTime = document.getElementById('trip-start-time').value;
      const startingKmInput = document.getElementById('trip-starting-km');
      const startingKm = startingKmInput ? startingKmInput.value : '';

      if (!driverId) { showToast('Please select a driver', 'error'); return; }
      if (!vehicleId) { showToast('Please select a vehicle', 'error'); return; }
      if (startingKm === '' || startingKm === null) { showToast('Starting KM is required', 'error'); return; }

      // Re-check availability at save time to guard against a race where the
      // driver/vehicle was picked up by another trip after this modal opened.
      const [freshTrips, driver, vehicle] = await Promise.all([
        DB.getTrips(),
        DB.getDriver(driverId),
        DB.getVehicle(vehicleId)
      ]);

      const driverBusy = (freshTrips || []).some(t => t.status === 'In Progress' && String(t.driver_id) === String(driverId));
      if (!driver || driverBusy || (driver.status || 'available').toLowerCase() !== 'available') {
        showToast('Selected driver is no longer available — they may already be on a trip.', 'error');
        return;
      }

      const vehicleBusy = (freshTrips || []).some(t => t.status === 'In Progress' && String(t.vehicle_id) === String(vehicleId));
      if (!vehicle || vehicleBusy || (vehicle.status || 'available').toLowerCase() !== 'available') {
        showToast('Selected vehicle is no longer available — it may already be on a trip.', 'error');
        return;
      }

      const record = await DB.addTrip({
        driver_id: driverId,
        driver_name: driver.name,
        vehicle_id: vehicleId,
        vehicle_no: vehicle.vehicle_no,
        start_date: startDate,
        start_time: startTime,
        starting_km: startingKm,
        status: 'In Progress'
      });

      await Promise.all([
        DB.updateDriver(driverId, { status: 'busy' }),
        DB.updateVehicle(vehicleId, { status: 'busy' })
      ]);

      await DB.logAction('Start Trip', `Started trip ${record.trip_id} for driver "${driver.name}" using vehicle "${vehicle.vehicle_no}" (Start KM: ${startingKm})`, record, 'Transport');

      document.getElementById('start-trip-modal')?.remove();
      showToast(`Trip ${record.trip_id} started!`);
      this.tripFilter = 'ongoing';
      await this.renderTripsList();
    } catch (err) {
      console.error('saveStartTrip error:', err);
      showToast('Failed to start trip: ' + (err.message || err), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ──────────────────────────────────────────
  // SELECT CUSTOMERS & ORDER PRESERVATION MODAL
  // ──────────────────────────────────────────
  async openCustomerSelectionModal(tripDbId) {
    if (!canEditTransport()) return showToast('Driver or Admin permission required to edit trip customers');
    const [trip, customers] = await Promise.all([
      DB.getTrip(tripDbId),
      DB.getCustomers()
    ]);

    if (!trip) return;

    this.allCustomersCache = await this._scopeCustomersToDriver(customers || []);
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

            <!-- Optional Trip Notes -->
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
  // END TRIP MODAL (includes visited-customer selection)
  // ──────────────────────────────────────────
  async openEndTripModal(tripDbId) {
    if (!canEditTransport()) return showToast('Driver or Admin permission required to end trips');
    const [trip, customers] = await Promise.all([
      DB.getTrip(tripDbId),
      DB.getCustomers()
    ]);

    if (!trip) return;

    this.allCustomersCache = await this._scopeCustomersToDriver(customers || []);
    this.selectedCustomerSeq = trip.selected_customers ? [...trip.selected_customers] : [];

    const todayDate = new Date().toISOString().split('T')[0];
    const defaultEndTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    const html = `
      <div id="end-trip-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4 max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 shrink-0">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-flag-checkered text-emerald-600"></i> End Trip (${trip.trip_id})
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
                <span>Vehicle: <strong>${trip.vehicle_no || 'N/A'}</strong></span>
              </div>
              <div class="flex justify-between text-slate-500">
                <span>Start: ${trip.start_date} @ ${trip.start_time}</span>
                <span>Starting KM: <strong class="text-indigo-600 font-mono">${trip.starting_km} KM</strong></span>
              </div>
            </div>

            <!-- Customer Visit Sequence Section (Available directly in End Trip flow) -->
            <div class="bg-indigo-50/70 dark:bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 space-y-3">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-bold text-indigo-900 dark:text-indigo-200">Select Visited Customers (in order):</label>
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
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">End Time * <span class="text-slate-400 font-normal">(12-hour)</span></label>
                <input type="text" id="trip-end-time" value="${defaultEndTime}" required placeholder="e.g. 05:45 PM" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-mono" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">End Km (Odometer Reading) *</label>
              <input type="number" step="0.1" id="trip-final-km" required min="${trip.starting_km}" placeholder="Must be greater than ${trip.starting_km}" oninput="TransportModule.calcDistancePreview(${trip.starting_km})" class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold text-emerald-600" />
            </div>

            <!-- Live Distance Calculation Box -->
            <div id="distance-preview-box" class="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between text-xs">
              <span class="font-semibold text-emerald-800 dark:text-emerald-300">Calculated Distance Travelled:</span>
              <span id="distance-val-text" class="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">0 KM</span>
            </div>

            <!-- Additional Notes -->
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Additional Notes (Optional)</label>
              <textarea id="trip-notes-input" rows="2" placeholder="Optional final trip remarks..." class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600">${trip.notes || ''}</textarea>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 shrink-0">
              <button type="button" onclick="document.getElementById('end-trip-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-check"></i> End Trip
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
    if (finalKm > startKm) {
      const dist = (finalKm - startKm).toFixed(1);
      valText.textContent = `${dist} KM`;
      valText.className = 'text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono';
    } else {
      valText.textContent = `Invalid (Must be > ${startKm})`;
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
        return;
      }

      if (finalKm <= trip.starting_km) {
        showToast(`End Km (${finalKm}) must be greater than Starting Km (${trip.starting_km}).`, 'error');
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

      // Release the driver & vehicle back to "available" now that the trip is done.
      const releaseOps = [];
      if (trip.driver_id) releaseOps.push(DB.updateDriver(trip.driver_id, { status: 'available' }));
      if (trip.vehicle_id) releaseOps.push(DB.updateVehicle(trip.vehicle_id, { status: 'available' }));
      if (releaseOps.length) await Promise.all(releaseOps);

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

    // Distance travelled = End Km - Start Km
    const distanceTravelled = (trip.final_km !== null && trip.final_km !== undefined)
      ? (parseFloat(trip.final_km) - parseFloat(trip.starting_km || 0)).toFixed(2)
      : (trip.distance_km || 0);

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
              <span class="text-slate-500">Vehicle</span>
              <span class="font-bold text-slate-800 dark:text-white">${escapeHtml(trip.vehicle_no || 'N/A')}</span>
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
              <span class="font-bold text-indigo-600 text-sm font-mono">${distanceTravelled} KM</span>
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

  // Admin-only KM override (newchanges2.md) — lets admin correct the
  // starting/end odometer readings on any trip, ongoing or completed. The
  // driver-facing Start/End Trip forms stay locked/auto-calibrated; this is
  // a separate, admin-gated path. Since a vehicle's next trip always derives
  // its Starting KM live from this same vehicle's last trip final_km (see
  // onStartTripVehicleChange), editing final_km here automatically
  // recalibrates whatever trip gets started next for that vehicle.
  async openEditKmModal(tripDbId) {
    if (!isAdmin()) return showToast('Admin permission required to edit KM readings', 'error');
    const trip = await DB.getTrip(tripDbId);
    if (!trip) return;

    const hasEnded = trip.final_km !== null && trip.final_km !== undefined;

    const html = `
      <div id="edit-km-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-gauge-high text-amber-600"></i> Edit KM Range (${trip.trip_id})
            </h3>
            <button onclick="document.getElementById('edit-km-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onsubmit="TransportModule.saveEditKm(event, '${trip.id}')" class="space-y-4 text-left">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Starting KM *</label>
              <input type="number" step="0.1" id="ek-starting-km" value="${trip.starting_km}" required class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold" />
              <p class="text-[10px] text-amber-600 mt-1"><i class="fa-solid fa-triangle-exclamation"></i> Editing this only re-calibrates this trip — it does not shift other trips already recorded for this vehicle.</p>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">End KM ${hasEnded ? '*' : '(trip still in progress)'}</label>
              <input type="number" step="0.1" id="ek-final-km" value="${hasEnded ? trip.final_km : ''}" ${hasEnded ? 'required' : ''} class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-700 rounded-xl text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 font-bold" />
            </div>
            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onclick="document.getElementById('edit-km-modal').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-save"></i> Save
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  async saveEditKm(e, tripDbId) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
      const startingKm = parseFloat(document.getElementById('ek-starting-km').value);
      const finalKmInput = document.getElementById('ek-final-km');
      const finalKmRaw = finalKmInput ? finalKmInput.value : '';
      const hasFinalKm = finalKmRaw !== '';
      const finalKm = hasFinalKm ? parseFloat(finalKmRaw) : null;

      if (isNaN(startingKm)) { showToast('Starting KM is required', 'error'); return; }
      if (hasFinalKm && finalKm <= startingKm) {
        showToast(`End Km (${finalKm}) must be greater than Starting Km (${startingKm}).`, 'error');
        return;
      }

      const update = { starting_km: startingKm };
      if (hasFinalKm) {
        update.final_km = finalKm;
        update.distance_km = +(finalKm - startingKm).toFixed(2);
      }

      await DB.updateTrip(tripDbId, update);
      await DB.logAction('Edit Trip KM', `Edited KM range for trip ${tripDbId}`, { trip_id: tripDbId, ...update }, 'Transport');
      showToast('KM range updated.');
      document.getElementById('edit-km-modal')?.remove();
      await this.renderTripsList();
    } catch (err) {
      console.error('saveEditKm error:', err);
      showToast('Failed to update KM range: ' + (err.message || err), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async deleteTrip(tripDbId) {
    if (!canDelete()) return showToast('Admin permission required to delete trips', 'error');
    try {
      const trip = await DB.getTrip(tripDbId);
      const tripName = trip ? `Trip ${trip.trip_id} (${trip.driver_name || 'Driver'})` : 'this trip record';

      confirmDialog(`Are you sure you want to delete ${tripName}?`, async () => {
        try {
          const trashId = trip ? await DB.addTrash({ entity_type: 'Trip', entity_label: trip.trip_id, payload: trip, deleted_by: currentUser?.display_name }) : null;
          await DB.deleteTrip(tripDbId);
          await DB.logAction('Delete Trip', `Deleted trip record ${trip ? trip.trip_id : tripDbId}`, { id: tripDbId, undo: trashId ? { type: 'restore_trash', trash_id: trashId } : undefined }, 'Transport');
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

  async openMonthlyDistanceModal() {
    const trips = await DB.getTrips();

    // Group completed trips by YYYY-MM
    const monthMap = {};
    trips.forEach(t => {
      if (t.status === 'Completed') {
        const dateStr = t.start_date || (t.created_at ? String(t.created_at).slice(0, 10) : '');
        if (dateStr && dateStr.length >= 7) {
          const mKey = dateStr.slice(0, 7);
          if (!monthMap[mKey]) {
            monthMap[mKey] = { distance: 0, count: 0 };
          }
          monthMap[mKey].distance += parseFloat(t.distance_km || 0);
          monthMap[mKey].count++;
        }
      }
    });

    const monthKeys = Object.keys(monthMap).sort().reverse();
    const currentMonthKey = new Date().toISOString().slice(0, 7);

    let rowsHTML = '';

    if (monthKeys.length === 0) {
      rowsHTML = `
        <tr>
          <td colspan="3" class="px-4 py-8 text-center text-xs text-slate-400">
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
          </tr>
        `;
      });
    }

    const html = `
      <div id="monthly-distance-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
            <div>
              <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-clock-rotate-left text-purple-600"></i> Monthly Distance History
              </h3>
              <p class="text-xs text-slate-500">Completed trip distance grouped by month.</p>
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
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
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
