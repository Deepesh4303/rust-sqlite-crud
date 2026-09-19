import { PatientTrie } from './trie.js';
import * as db from './db.js';

// Global state
const state = {
  currentTab: 'search',
  selectedPatient: null,
  activeSuggestionIdx: -1,
  suggestions: [],
  trie: new PatientTrie(),
  dbReady: false,
};

// Toast Notification
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = isError ? 'show error' : 'show';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = '';
  }, 3000);
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
window.switchTab = switchTab;

// Autocomplete using JS Trie
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

    debounceTimer = setTimeout(() => {
      const suggestions = state.trie.suggest(val, 8);
      state.suggestions = suggestions;
      state.activeSuggestionIdx = -1;

      if (suggestions.length === 0) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
      }

      dropdown.innerHTML = '';
      suggestions.forEach((name) => {
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
    }, 80);
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

// Patient History
async function loadPatientHistory(patientName) {
  state.selectedPatient = patientName;
  try {
    const history = await db.getPatientHistory(patientName);
    renderHistoryView(patientName, history);
    switchTab('history');
  } catch (err) {
    showToast(err.message, true);
  }
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
          await db.deletePrescription(rx.id);
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

// New Rx Form
function initNewRxForm(prefillPatient = null) {
  const dateInput = document.getElementById('newRxDate');
  const timeInput = document.getElementById('newRxTime');
  const now = new Date();

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
    db.getPatientHistory(prefillPatient).then(records => {
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
window.initNewRxForm = initNewRxForm;

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
    const created = await db.insertPrescription(payload);
    state.trie.insert(created.patient_name);
    showToast(`Prescription saved permanently for ${created.patient_name}!`);
    document.getElementById('newRxSymptoms').value = '';
    document.getElementById('newRxPrescription').value = '';
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

  try {
    const records = await db.getAllPrescriptions(250, search, date);
    tbody.innerHTML = '';

    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--c-text-muted);">No records found matching filters.</td></tr>';
      return;
    }

    records.forEach(r => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>#${r.id}</td>
        <td style="color: var(--c-cyan); font-weight: bold;">${escapeHtml(r.patient_name)}</td>
        <td>${r.date} ${r.time}</td>
        <td>${escapeHtml(r.phone || '-')}</td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.symptoms || '-')}</td>
        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.prescription)}</td>
      `;
      row.onclick = () => {
        loadPatientHistory(r.patient_name);
      };
      tbody.appendChild(row);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--c-red);">Error: ${err.message}</td></tr>`;
  }
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
window.closePrintModal = closePrintModal;

// Backup Export & Import (100% compatible with desktop clinic.exe)
async function exportDatabaseJson() {
  try {
    const data = await db.exportAll();
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

async function importDatabaseJson(file) {
  try {
    const text = await file.text();
    const records = JSON.parse(text);
    const count = await db.importAll(records);
    // Re-index all patient names
    const names = await db.getDistinctPatientNames();
    state.trie = new PatientTrie();
    names.forEach(n => state.trie.insert(n));
    showToast(`Successfully imported ${count} records!`);
    loadRecordsTable();
  } catch (err) {
    showToast(`Import failed: ${err.message}`, true);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

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

// Install prompt handling
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const installBtn = document.getElementById('installAppBtn');
  if (installBtn) {
    installBtn.style.display = 'inline-block';
    installBtn.onclick = async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        console.log(`[PWA] Install prompt outcome: ${outcome}`);
        deferredInstallPrompt = null;
        installBtn.style.display = 'none';
      }
    };
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] App successfully installed');
  showToast('Retro Clinic OS installed successfully!');
  const installBtn = document.getElementById('installAppBtn');
  if (installBtn) installBtn.style.display = 'none';
});

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  if (localStorage.getItem('clinic_crt') === 'off') {
    document.body.classList.add('crt-off');
    document.getElementById('crtToggleBtn').textContent = '[CRT: OFF]';
  }

  // Request persistent storage (prevents OS from clearing data)
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(granted => {
      console.log(`[Storage] Persistent storage granted: ${granted}`);
    });
  }

  // Initialize Native IndexedDB
  const statusEl = document.getElementById('statusPillDb');
  statusEl.textContent = '[DB: CONNECTING...]';

  try {
    await db.openDatabase();
    state.dbReady = true;
    statusEl.textContent = '[DB: PERSISTENT ONLINE]';
    statusEl.classList.add('online');

    // Index all existing patient names into Trie
    const names = await db.getDistinctPatientNames();
    names.forEach(n => state.trie.insert(n));
    console.log(`[Trie] Indexed ${names.length} patient names from local storage`);
  } catch (err) {
    console.error("[Init Error]", err);
    statusEl.textContent = '[DB: ERROR]';
    showToast("DB Initialization failed: " + err.message, true);
  }

  // Autocomplete setup
  setupTrieAutocomplete('searchInput', 'searchSuggestions', (name) => {
    document.getElementById('searchInput').value = name;
    loadPatientHistory(name);
  });

  setupTrieAutocomplete('newRxName', 'newRxSuggestions', (name) => {
    document.getElementById('newRxName').value = name;
    initNewRxForm(name);
  });

  // Form submit
  document.getElementById('newRxForm').addEventListener('submit', handleNewRxSubmit);

  // New visit button in history view
  document.getElementById('btnNewVisitForPatient').addEventListener('click', () => {
    if (state.selectedPatient) {
      initNewRxForm(state.selectedPatient);
      switchTab('new');
    }
  });

  // Table filters
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

  // Export / Import
  document.getElementById('exportBackupBtn').addEventListener('click', exportDatabaseJson);
  
  const importInput = document.getElementById('importBackupInput');
  document.getElementById('importBackupBtn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      importDatabaseJson(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.getElementById('crtToggleBtn').addEventListener('click', toggleCrt);
  document.getElementById('searchInput').focus();
});
