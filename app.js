// Retro Clinic System Frontend Controller

const API_BASE = '/api';

// Application State
const state = {
  currentTab: 'search',
  selectedPatient: null,
  activeSuggestionIdx: -1,
  suggestions: [],
};

// Utilities
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = isError ? 'show error' : 'show';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = '';
  }, 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return dateStr;
}

// Tab Switching
function switchTab(tabId) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const targetPanel = document.getElementById(`panel-${tabId}`);
  const targetBtn = document.getElementById(`tab-btn-${tabId}`);

  if (targetPanel) targetPanel.classList.remove('hidden');
  if (targetBtn) targetBtn.classList.add('active');

  state.currentTab = tabId;

  if (tabId === 'table') {
    loadRecordsTable();
  } else if (tabId === 'search') {
    document.getElementById('searchInput').focus();
  } else if (tabId === 'new') {
    initNewRxForm();
  }
}

// API Calls
async function apiSuggest(prefix) {
  try {
    const res = await fetch(`${API_BASE}/suggest?q=${encodeURIComponent(prefix)}&limit=8`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Suggest error:', err);
    return [];
  }
}

async function apiGetHistory(patientName) {
  try {
    const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientName)}/history`);
    if (!res.ok) throw new Error('Failed to fetch patient history');
    return await res.json();
  } catch (err) {
    showToast(err.message, true);
    return [];
  }
}

async function apiGetAllRecords(search = '', date = '') {
  try {
    let url = `${API_BASE}/prescriptions?limit=250`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (date) url += `&date=${encodeURIComponent(date)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch records');
    return await res.json();
  } catch (err) {
    showToast(err.message, true);
    return [];
  }
}

async function apiSavePrescription(payload) {
  const res = await fetch(`${API_BASE}/prescriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to save' }));
    throw new Error(err.error || 'Failed to save record');
  }
  return await res.json();
}

async function apiDeletePrescription(id) {
  const res = await fetch(`${API_BASE}/prescriptions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete prescription');
  return true;
}

// Trie Live Autocomplete Setup
function setupTrieAutocomplete(inputId, dropdownId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = input.value.trim();
    if (val.length === 0) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      state.suggestions = [];
      state.activeSuggestionIdx = -1;
      return;
    }

    debounceTimer = setTimeout(async () => {
      const suggestions = await apiSuggest(val);
      state.suggestions = suggestions;
      state.activeSuggestionIdx = -1;

      if (suggestions.length === 0) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
      }

      dropdown.innerHTML = '';
      suggestions.forEach((name, idx) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `<span>${name}</span><span class="hint">[Trie Match]</span>`;
        item.onmousedown = (e) => {
          e.preventDefault();
          onSelect(name);
          dropdown.classList.add('hidden');
        };
        dropdown.appendChild(item);
      });
      dropdown.classList.remove('hidden');
    }, 120);
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.suggestion-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.activeSuggestionIdx = (state.activeSuggestionIdx + 1) % items.length;
      updateSuggestionHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.activeSuggestionIdx = (state.activeSuggestionIdx - 1 + items.length) % items.length;
      updateSuggestionHighlight(items);
    } else if (e.key === 'Enter') {
      if (state.activeSuggestionIdx >= 0 && state.activeSuggestionIdx < items.length) {
        e.preventDefault();
        const selected = state.suggestions[state.activeSuggestionIdx];
        onSelect(selected);
        dropdown.classList.add('hidden');
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hidden'), 200);
  });
}

function updateSuggestionHighlight(items) {
  items.forEach((it, idx) => {
    if (idx === state.activeSuggestionIdx) {
      it.classList.add('active');
      it.scrollIntoView({ block: 'nearest' });
    } else {
      it.classList.remove('active');
    }
  });
}

// Load and display patient history
async function loadPatientHistory(patientName) {
  state.selectedPatient = patientName;
  const history = await apiGetHistory(patientName);
  renderHistoryView(patientName, history);
  switchTab('history');
}

function renderHistoryView(patientName, records) {
  document.getElementById('historyPatientTitle').textContent = `// PATIENT: ${patientName.toUpperCase()}`;
  document.getElementById('historyVisitCount').textContent = `${records.length} VISIT(S)`;
  const timeline = document.getElementById('historyTimeline');
  timeline.innerHTML = '';

  if (records.length === 0) {
    timeline.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--c-text-muted);">
        [No visit records found for this patient name]
      </div>
    `;
    return;
  }

  // Preload latest patient details
  const latest = records[0];

  records.forEach((rx) => {
    const card = document.createElement('div');
    card.className = 'rx-card';
    card.innerHTML = `
      <div class="rx-card-header">
        <div class="rx-card-title">VISIT RECORD #${rx.id}</div>
        <div class="rx-date-badge">${rx.date} @ ${rx.time}</div>
      </div>
      <div class="rx-body">
        <div>
          <span class="rx-field-label">Patient Vitals:</span>
          <div class="rx-field-content" style="border-left-color: var(--c-cyan);">Age: ${rx.age || 'N/A'} | Gender: ${rx.gender || 'N/A'} | Phone: ${rx.phone || 'N/A'}</div>
        </div>
        ${rx.symptoms ? `
        <div>
          <span class="rx-field-label">Symptoms / Diagnosis:</span>
          <div class="rx-field-content" style="border-left-color: var(--c-amber);">${escapeHtml(rx.symptoms)}</div>
        </div>` : ''}
        <div>
          <span class="rx-field-label">Prescription / Medication Instructions:</span>
          <div class="rx-field-content">${escapeHtml(rx.prescription)}</div>
        </div>
      </div>
      <div class="rx-actions">
        <button class="retro-btn cyan print-btn">Print Slip [Rx]</button>
        <button class="retro-btn danger delete-btn">Delete</button>
      </div>
    `;

    card.querySelector('.print-btn').onclick = () => openPrintModal(rx);
    card.querySelector('.delete-btn').onclick = async () => {
      if (confirm(`Are you sure you want to delete this record #${rx.id} for ${rx.patient_name}?`)) {
        try {
          await apiDeletePrescription(rx.id);
          showToast(`Record #${rx.id} deleted.`);
          loadPatientHistory(patientName);
        } catch (e) {
          showToast(e.message, true);
        }
      }
    };

    timeline.appendChild(card);
  });
}

// New Prescription Form Handling
function initNewRxForm(prefillPatient = null) {
  const dateInput = document.getElementById('newRxDate');
  const timeInput = document.getElementById('newRxTime');
  const now = new Date();

  // Set default date and time if empty
  if (!dateInput.value) {
    dateInput.value = now.toISOString().split('T')[0];
  }
  if (!timeInput.value) {
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hours}:${mins}`;
  }

  if (prefillPatient) {
    document.getElementById('newRxName').value = prefillPatient;
    // Attempt to pull latest vitals if available
    apiGetHistory(prefillPatient).then(records => {
      if (records && records.length > 0) {
        const latest = records[0];
        if (latest.age && !document.getElementById('newRxAge').value) {
          document.getElementById('newRxAge').value = latest.age;
        }
        if (latest.gender && !document.getElementById('newRxGender').value) {
          document.getElementById('newRxGender').value = latest.gender;
        }
        if (latest.phone && !document.getElementById('newRxPhone').value) {
          document.getElementById('newRxPhone').value = latest.phone;
        }
      }
    });
  }
}

// Submit New Prescription
async function handleNewRxSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('newRxName').value.trim();
  const age = document.getElementById('newRxAge').value.trim();
  const gender = document.getElementById('newRxGender').value.trim();
  const phone = document.getElementById('newRxPhone').value.trim();
  const date = document.getElementById('newRxDate').value.trim();
  const time = document.getElementById('newRxTime').value.trim();
  const symptoms = document.getElementById('newRxSymptoms').value.trim();
  const prescription = document.getElementById('newRxPrescription').value.trim();

  if (!name) {
    showToast('Error: Patient Name is required!', true);
    document.getElementById('newRxName').focus();
    return;
  }
  if (!prescription) {
    showToast('Error: Prescription details are required!', true);
    document.getElementById('newRxPrescription').focus();
    return;
  }

  const payload = {
    patient_name: name,
    age: age || null,
    gender: gender || null,
    phone: phone || null,
    date: date || null,
    time: time || null,
    symptoms: symptoms || null,
    prescription: prescription
  };

  try {
    const created = await apiSavePrescription(payload);
    showToast(`Prescription saved successfully for ${created.patient_name}!`);
    // Clear form fields
    document.getElementById('newRxSymptoms').value = '';
    document.getElementById('newRxPrescription').value = '';
    // Switch to history tab to view newly saved record
    loadPatientHistory(created.patient_name);
  } catch (err) {
    showToast(err.message, true);
  }
}

// All Records Table
async function loadRecordsTable() {
  const search = document.getElementById('tableSearchInput').value.trim();
  const date = document.getElementById('tableDateInput').value.trim();
  const tbody = document.getElementById('recordsTableBody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading records...</td></tr>';

  const records = await apiGetAllRecords(search, date);
  tbody.innerHTML = '';

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--c-text-muted);">No records found matching filters.</td></tr>';
    return;
  }

  records.forEach(r => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>#${r.id}</td>
      <td style="color: var(--c-cyan); font-weight: bold;">${r.patient_name}</td>
      <td>${r.date} ${r.time}</td>
      <td>${r.phone || '-'}</td>
      <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.symptoms || '-')}</td>
      <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.prescription)}</td>
    `;
    row.onclick = () => {
      loadPatientHistory(r.patient_name);
    };
    tbody.appendChild(row);
  });
}

// Print Modal
function openPrintModal(rx) {
  const modal = document.getElementById('printModal');
  document.getElementById('slipPatientName').textContent = rx.patient_name;
  document.getElementById('slipDateTime').textContent = `${rx.date} ${rx.time}`;
  document.getElementById('slipVitals').textContent = `Age: ${rx.age || 'N/A'} | Gender: ${rx.gender || 'N/A'} | Phone: ${rx.phone || 'N/A'}`;
  document.getElementById('slipSymptoms').textContent = rx.symptoms || 'None specified';
  document.getElementById('slipPrescription').textContent = rx.prescription;
  modal.classList.remove('hidden');
}

function closePrintModal() {
  document.getElementById('printModal').classList.add('hidden');
}

// Backup Export
async function exportDatabaseJson() {
  try {
    const res = await fetch(`${API_BASE}/export`);
    if (!res.ok) throw new Error('Export failed');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `clinic_backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Database exported successfully as JSON!');
  } catch (err) {
    showToast(err.message, true);
  }
}

// Helper: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// CRT Scanlines Toggle
function toggleCrt() {
  document.body.classList.toggle('crt-off');
  const isOff = document.body.classList.contains('crt-off');
  document.getElementById('crtToggleBtn').textContent = isOff ? '[CRT: OFF]' : '[CRT: ON]';
  localStorage.setItem('clinic_crt', isOff ? 'off' : 'on');
}

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === '1') { e.preventDefault(); switchTab('search'); }
  if (e.altKey && e.key === '2') { e.preventDefault(); switchTab('new'); }
  if (e.altKey && e.key === '3') { e.preventDefault(); switchTab('history'); }
  if (e.altKey && e.key === '4') { e.preventDefault(); switchTab('table'); }
  if (e.key === 'Escape') { closePrintModal(); }
});

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Restore CRT preference
  if (localStorage.getItem('clinic_crt') === 'off') {
    document.body.classList.add('crt-off');
    document.getElementById('crtToggleBtn').textContent = '[CRT: OFF]';
  }

  // Setup Autocomplete for Main Search
  setupTrieAutocomplete('searchInput', 'searchSuggestions', (patientName) => {
    document.getElementById('searchInput').value = patientName;
    loadPatientHistory(patientName);
  });

  // Setup Autocomplete for New Prescription Name input
  setupTrieAutocomplete('newRxName', 'newRxSuggestions', (patientName) => {
    document.getElementById('newRxName').value = patientName;
    initNewRxForm(patientName);
  });

  // New Rx form submit
  document.getElementById('newRxForm').addEventListener('submit', handleNewRxSubmit);

  // New visit button in history view
  document.getElementById('btnNewVisitForPatient').addEventListener('click', () => {
    if (state.selectedPatient) {
      initNewRxForm(state.selectedPatient);
      switchTab('new');
    }
  });

  // Filter triggers in Table view
  document.getElementById('tableSearchInput').addEventListener('input', () => {
    clearTimeout(window._tableSearchTimer);
    window._tableSearchTimer = setTimeout(loadRecordsTable, 250);
  });
  document.getElementById('tableDateInput').addEventListener('change', loadRecordsTable);
  document.getElementById('tableResetBtn').addEventListener('click', () => {
    document.getElementById('tableSearchInput').value = '';
    document.getElementById('tableDateInput').value = '';
    loadRecordsTable();
  });

  // Global Export Button
  document.getElementById('exportBackupBtn').addEventListener('click', exportDatabaseJson);

  // CRT Toggle
  document.getElementById('crtToggleBtn').addEventListener('click', toggleCrt);

  // Default focus
  document.getElementById('searchInput').focus();
});
