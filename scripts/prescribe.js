// NHS Dentist Prescribing Portal Engine

// 1. Simulated Database
const PATIENTS = [
  {
    id: "p1",
    surname: "Jenkins",
    forenames: "Sarah Elizabeth",
    dob: "1984-04-12",
    age: 42,
    nhsNo: "485 902 1124",
    address: "24 Maple Drive, Oakwood, London, NW11 8JG",
    allergies: ["Penicillin"],
    medications: ["Salbutamol inhaler"],
    conditions: ["Mild Asthma"]
  },
  {
    id: "p2",
    surname: "Miller",
    forenames: "David John",
    dob: "1952-11-05",
    age: 73,
    nhsNo: "334 192 8856",
    address: "Apartment 4B, Priory Court, London, NW3 2PL",
    allergies: [],
    medications: ["Warfarin (5mg daily)"],
    conditions: ["Atrial Fibrillation"]
  },
  {
    id: "p3",
    surname: "Thompson",
    forenames: "James William",
    dob: "2018-09-23",
    age: 7,
    nhsNo: "902 485 7710",
    address: "8 Richmond Road, London, NW6 4TY",
    allergies: [],
    medications: [],
    conditions: ["Paediatric Patient"]
  },
  {
    id: "p4",
    surname: "Rostova",
    forenames: "Elena",
    dob: "1993-08-14",
    age: 32,
    nhsNo: "778 231 9904",
    address: "102 West Heath Mansions, London, NW3 1TR",
    allergies: ["Sulfa drugs"],
    medications: ["Folic acid"],
    conditions: ["Pregnant (24 weeks)"]
  }
];

const FORMULARY = [
  {
    id: "d1",
    name: "Amoxicillin",
    group: "Antibiotics",
    formulation: "Capsules",
    strength: "500mg",
    standardQty: "15 capsules",
    templates: [
      { label: "Adult (500mg tid)", dose: "500mg three times daily", duration: "5 days", qty: "15 capsules" },
      { label: "Child (250mg/5ml tid)", dose: "250mg (5ml suspension) three times daily", duration: "5 days", qty: "1 bottle (100ml)" }
    ]
  },
  {
    id: "d2",
    name: "Metronidazole",
    group: "Antibiotics",
    formulation: "Tablets",
    strength: "400mg",
    standardQty: "15 tablets",
    templates: [
      { label: "Standard (400mg tid)", dose: "400mg three times daily", duration: "5 days", qty: "15 tablets" }
    ]
  },
  {
    id: "d3",
    name: "Phenoxymethylpenicillin (Penicillin V)",
    group: "Antibiotics",
    formulation: "Tablets",
    strength: "250mg",
    standardQty: "20 tablets",
    templates: [
      { label: "Standard (500mg qid)", dose: "500mg (2 tablets) four times daily", duration: "5 days", qty: "40 tablets" }
    ]
  },
  {
    id: "d4",
    name: "Ibuprofen",
    group: "Analgesics",
    formulation: "Tablets",
    strength: "400mg",
    standardQty: "24 tablets",
    templates: [
      { label: "Standard pain (400mg tds)", dose: "400mg three times daily after food", duration: "5 days", qty: "24 tablets" }
    ]
  },
  {
    id: "d5",
    name: "Paracetamol",
    group: "Analgesics",
    formulation: "Tablets",
    strength: "500mg",
    standardQty: "32 tablets",
    templates: [
      { label: "Standard (1g qds)", dose: "1g (2 tablets) every 4-6 hours (max 4g daily)", duration: "5 days", qty: "32 tablets" }
    ]
  },
  {
    id: "d6",
    name: "Miconazole",
    group: "Antifungals",
    formulation: "Oral Gel",
    strength: "20mg/g (2%)",
    standardQty: "1 tube (80g)",
    templates: [
      { label: "Thrush (2.5ml qds)", dose: "2.5ml four times daily after meals, retain in mouth", duration: "7 days", qty: "1 tube (80g)" }
    ]
  },
  {
    id: "d7",
    name: "Nystatin",
    group: "Antifungals",
    formulation: "Oral Suspension",
    strength: "100,000 units/ml",
    standardQty: "1 bottle (30ml)",
    templates: [
      { label: "Thrush (1ml qds)", dose: "1ml four times daily after meals, retain in mouth", duration: "7 days", qty: "1 bottle (30ml)" }
    ]
  },
  {
    id: "d8",
    name: "Aciclovir",
    group: "Antivirals",
    formulation: "Tablets",
    strength: "200mg",
    standardQty: "25 tablets",
    templates: [
      { label: "Cold Sores (200mg 5x/day)", dose: "200mg five times daily (every 4 hours)", duration: "5 days", qty: "25 tablets" }
    ]
  },
  {
    id: "d9",
    name: "Sodium Fluoride 5000ppm (Duraphat)",
    group: "Dental Care / Fluorides",
    formulation: "Toothpaste",
    strength: "1.1% NaF (5000ppm)",
    standardQty: "1 tube (51g)",
    templates: [
      { label: "High Caries (2cm tid)", dose: "Use 2cm brush stroke three times daily in place of regular toothpaste", duration: "3 months", qty: "1 tube (51g)" }
    ]
  },
  {
    id: "d10",
    name: "Chlorhexidine Gluconate (Corsodyl)",
    group: "Dental Care / Fluorides",
    formulation: "Mouthwash",
    strength: "0.2%",
    standardQty: "1 bottle (300ml)",
    templates: [
      { label: "Standard (10ml bid)", dose: "Rinse mouth with 10ml for 1 minute twice daily", duration: "14 days", qty: "1 bottle (300ml)" }
    ]
  }
];

// 2. Application State
const state = {
  authenticated: false,
  enteredPin: "",
  selectedPatient: null,
  selectedDrug: null,
  patientSearch: "",
  drugSearch: "",
  prescription: {
    dose: "",
    route: "Oral",
    duration: "",
    quantity: ""
  },
  sessionPrescriptions: []
};

// 3. Elements mapping
const elements = {
  authScreen: document.querySelector("#auth-screen"),
  appWorkspace: document.querySelector("#app-workspace"),
  pinDisplay: document.querySelector(".pin-display"),
  keypad: document.querySelector(".pin-keypad"),
  
  patientSearch: document.querySelector("#patient-search"),
  patientList: document.querySelector("#patient-list"),
  patientCount: document.querySelector("#patient-count"),
  
  drugSearch: document.querySelector("#drug-search"),
  drugList: document.querySelector("#drug-list"),
  drugCount: document.querySelector("#drug-count"),

  // Form Fields
  inputDose: document.querySelector("#input-dose"),
  inputRoute: document.querySelector("#input-route"),
  inputDuration: document.querySelector("#input-duration"),
  inputQuantity: document.querySelector("#input-quantity"),
  doseTemplates: document.querySelector("#dose-templates"),

  // FP10D overlays
  fpNhsNo: document.querySelector("#fp-nhs-no"),
  fpSurname: document.querySelector("#fp-surname"),
  fpForename: document.querySelector("#fp-forename"),
  fpAddress: document.querySelector("#fp-address"),
  fpDob: document.querySelector("#fp-dob"),
  fpAge: document.querySelector("#fp-age"),
  fpMedDetails: document.querySelector("#fp-med-details"),
  fpDate: document.querySelector("#fp-date"),
  fpSignatureImage: document.querySelector("#fp-signature-image"),

  // Alerts & Submission
  safetyBox: document.querySelector("#safety-alerts-box"),
  alertsCountBadge: document.querySelector("#alerts-count-badge"),
  sigCanvas: document.querySelector("#signature-canvas"),
  btnClearSig: document.querySelector("#btn-clear-sig"),
  btnSubmit: document.querySelector("#btn-submit-prescription"),
  prescHistory: document.querySelector("#prescription-history"),
  sessionPrescCount: document.querySelector("#session-prescriptions-count"),

  // Modal
  epsOverlay: document.querySelector("#eps-success-overlay"),
  btnModalClose: document.querySelector("#btn-modal-close"),
  receiptNhs: document.querySelector("#receipt-nhs"),
  receiptName: document.querySelector("#receipt-name"),
  receiptMed: document.querySelector("#receipt-med"),
  receiptQty: document.querySelector("#receipt-qty"),
  receiptUuid: document.querySelector("#receipt-uuid")
};

// 4. Keypad/Authentication handlers
if (elements.keypad) {
  elements.keypad.addEventListener("click", (e) => {
    const btn = e.target.closest(".keypad-btn");
    if (!btn) return;
    
    const key = btn.getAttribute("data-key");
    if (key === "clear") {
      state.enteredPin = "";
    } else if (key === "enter") {
      verifyPin();
    } else if (state.enteredPin.length < 4) {
      state.enteredPin += key;
      if (state.enteredPin.length === 4) {
        // Auto submit when 4 digits are entered
        setTimeout(verifyPin, 150);
      }
    }
    updatePinDisplay();
  });
}

function updatePinDisplay() {
  const dots = elements.pinDisplay.querySelectorAll(".pin-dot");
  dots.forEach((dot, idx) => {
    if (idx < state.enteredPin.length) {
      dot.classList.add("filled");
    } else {
      dot.classList.remove("filled");
    }
  });
}

function verifyPin() {
  const authCard = document.querySelector(".auth-card");
  if (state.enteredPin === "2026") {
    state.authenticated = true;
    elements.authScreen.style.display = "none";
    elements.appWorkspace.style.display = "grid";
    
    // Set date tabled on FP10D
    const today = new Date();
    const formattedDate = today.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    elements.fpDate.textContent = formattedDate;
    
    // Initialize canvas signature size
    resizeCanvas();
    
    // Render directories
    renderPatients();
    renderFormulary();
  } else {
    // Fail verification
    state.enteredPin = "";
    updatePinDisplay();
    
    // Haptic feedback shake animation
    authCard.classList.add("shake");
    setTimeout(() => {
      authCard.classList.remove("shake");
    }, 400);
  }
}

// 5. Search Filters and Selections
elements.patientSearch.addEventListener("input", (e) => {
  state.patientSearch = e.target.value.toLowerCase();
  renderPatients();
});

elements.drugSearch.addEventListener("input", (e) => {
  state.drugSearch = e.target.value.toLowerCase();
  renderFormulary();
});

function renderPatients() {
  const query = state.patientSearch.trim();
  const filtered = PATIENTS.filter(p => {
    return p.surname.toLowerCase().includes(query) ||
           p.forenames.toLowerCase().includes(query) ||
           p.nhsNo.replace(/\s+/g, "").includes(query.replace(/\s+/g, ""));
  });

  elements.patientCount.textContent = `${filtered.length} loaded`;
  elements.patientList.innerHTML = filtered.map(p => {
    const isActive = state.selectedPatient && state.selectedPatient.id === p.id;
    const allergiesHtml = p.allergies.map(a => `<span class="allergy-pill">${a}</span>`).join(" ");
    const medsHtml = p.medications.map(m => `<span class="med-pill">${m.split(" ")[0]}</span>`).join(" ");
    
    return `
      <div class="selector-item${isActive ? " active" : ""}" data-id="${p.id}">
        <div class="title-row">
          <span>${p.surname}, ${p.forenames.split(" ")[0]}</span>
          <span style="font-size:10px; font-family:'JetBrains Mono'">${p.age} y/o</span>
        </div>
        <div class="meta-row">
          <span>NHS: ${p.nhsNo}</span>
        </div>
        ${p.allergies.length || p.medications.length ? `
          <div class="tag-row">
            ${allergiesHtml}
            ${medsHtml}
          </div>
        ` : ""}
      </div>
    `;
  }).join("") || `<p class="chart-note pad-10">No patients match search.</p>`;

  // Bind click listeners
  elements.patientList.querySelectorAll(".selector-item").forEach(item => {
    item.addEventListener("click", () => {
      const id = item.getAttribute("data-id");
      selectPatient(PATIENTS.find(p => p.id === id));
    });
  });
}

function renderFormulary() {
  const query = state.drugSearch.trim();
  const filtered = FORMULARY.filter(d => {
    return d.name.toLowerCase().includes(query) ||
           d.group.toLowerCase().includes(query) ||
           d.formulation.toLowerCase().includes(query);
  });

  // Group by category
  const groups = {};
  for (const d of filtered) {
    if (!groups[d.group]) groups[d.group] = [];
    groups[d.group].push(d);
  }

  elements.drugCount.textContent = `${filtered.length} DPF`;
  
  let html = "";
  for (const [groupName, drugs] of Object.entries(groups)) {
    html += `<div class="group-header">${groupName}</div>`;
    html += drugs.map(d => {
      const isActive = state.selectedDrug && state.selectedDrug.id === d.id;
      return `
        <div class="selector-item${isActive ? " active" : ""}" data-id="${d.id}">
          <div class="title-row">
            <span>${d.name}</span>
            <span class="badge">${d.strength}</span>
          </div>
          <div class="meta-row">
            <span>${d.formulation} &middot; Standard Qty: ${d.standardQty}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  elements.drugList.innerHTML = html || `<p class="chart-note pad-10">No drugs match search.</p>`;

  // Bind click listeners
  elements.drugList.querySelectorAll(".selector-item").forEach(item => {
    item.addEventListener("click", () => {
      const id = item.getAttribute("data-id");
      selectDrug(FORMULARY.find(d => d.id === id));
    });
  });
}

function selectPatient(patient) {
  state.selectedPatient = patient;
  renderPatients();
  updateFp10dPatient();
  runSafetyChecks();
  updateSubmitButtonState();
}

function selectDrug(drug) {
  state.selectedDrug = drug;
  renderFormulary();
  
  // Enable form inputs
  elements.inputDose.disabled = false;
  elements.inputDuration.disabled = false;
  elements.inputQuantity.disabled = false;
  elements.inputRoute.disabled = false;

  // Initialize templates
  elements.doseTemplates.innerHTML = drug.templates.map((t, idx) => {
    return `<span class="template-chip" data-idx="${idx}">${t.label}</span>`;
  }).join("");

  elements.doseTemplates.querySelectorAll(".template-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const idx = parseInt(chip.getAttribute("data-idx"), 10);
      const template = drug.templates[idx];
      applyTemplate(template);
    });
  });

  // Apply first template by default
  if (drug.templates.length > 0) {
    applyTemplate(drug.templates[0]);
  } else {
    state.prescription = { dose: "", route: "Oral", duration: "", quantity: drug.standardQty };
    syncInputsToState();
  }
}

function applyTemplate(template) {
  state.prescription.dose = template.dose;
  state.prescription.duration = template.duration;
  state.prescription.quantity = template.qty;
  state.prescription.route = "Oral";
  syncInputsToState();
}

function syncInputsToState() {
  elements.inputDose.value = state.prescription.dose;
  elements.inputDuration.value = state.prescription.duration;
  elements.inputQuantity.value = state.prescription.quantity;
  elements.inputRoute.value = state.prescription.route;
  
  updateFp10dMedication();
  runSafetyChecks();
  updateSubmitButtonState();
}

// 6. Real-time Form Input sync
elements.inputDose.addEventListener("input", (e) => {
  state.prescription.dose = e.target.value;
  updateFp10dMedication();
});
elements.inputDuration.addEventListener("input", (e) => {
  state.prescription.duration = e.target.value;
  updateFp10dMedication();
});
elements.inputQuantity.addEventListener("input", (e) => {
  state.prescription.quantity = e.target.value;
  updateFp10dMedication();
});
elements.inputRoute.addEventListener("change", (e) => {
  state.prescription.route = e.target.value;
  updateFp10dMedication();
});

// 7. FP10D Render Overlays
function updateFp10dPatient() {
  const p = state.selectedPatient;
  if (!p) return;

  elements.fpNhsNo.textContent = p.nhsNo;
  elements.fpSurname.textContent = p.surname;
  elements.fpForename.textContent = p.forenames;
  elements.fpAddress.textContent = p.address;
  
  // Format Date of Birth
  const dateObj = new Date(p.dob);
  const formattedDob = dateObj.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  elements.fpDob.textContent = formattedDob;
  elements.fpAge.textContent = p.age < 16 ? `${p.age} years` : "-";
}

function updateFp10dMedication() {
  const d = state.selectedDrug;
  const p = state.prescription;
  
  if (!d) {
    elements.fpMedDetails.innerHTML = '<span class="placeholder-text">Select patient and dental drug to construct FP10D...</span>';
    return;
  }

  elements.fpMedDetails.innerHTML = `
    <div class="fp-drug-title">${d.name} ${d.strength} (${d.formulation})</div>
    <div class="fp-instruction">Dose: ${escapeHtml(p.dose || "As directed")}<br>Route: ${p.route} &middot; Duration: ${escapeHtml(p.duration || "-")}</div>
    <div class="fp-quantity">Quantity: ${escapeHtml(p.quantity || d.standardQty)}</div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 8. Clinical Warning Rules Engine
function runSafetyChecks() {
  const patient = state.selectedPatient;
  const drug = state.selectedDrug;
  
  if (!patient || !drug) {
    // Reset to green pass state
    elements.safetyBox.innerHTML = `
      <div class="safety-state green-state">
        <span class="safety-icon">&#10004;</span>
        <p class="safety-title">Safety Check Pending</p>
        <p class="safety-desc">Select both a patient and a medication to run active clinical checks.</p>
      </div>
    `;
    elements.alertsCountBadge.textContent = "0 Alerts";
    elements.alertsCountBadge.className = "badge bg-green";
    return;
  }

  const warnings = [];
  
  // Rule A: Penicillin Allergy Alert
  const allergyMatch = patient.allergies.some(allergy => {
    return allergy.toLowerCase().includes("penicillin") && 
           (drug.name.toLowerCase().includes("amoxicillin") || drug.name.toLowerCase().includes("phenoxymethylpenicillin"));
  });

  if (allergyMatch) {
    warnings.push({
      severity: "high",
      title: "Allergy Alert: Penicillin Sensitivity",
      desc: `Patient <strong>${patient.forenames} ${patient.surname}</strong> is documented as allergic to Penicillin. Do NOT prescribe <strong>${drug.name}</strong>.`
    });
  }

  // Rule B: Drug Interaction with Warfarin (severe interaction alert)
  const isTakingWarfarin = patient.medications.some(med => med.toLowerCase().includes("warfarin"));
  if (isTakingWarfarin && (drug.name.toLowerCase().includes("metronidazole") || drug.name.toLowerCase().includes("miconazole"))) {
    warnings.push({
      severity: "high",
      title: "Drug-Drug Interaction: Warfarin Risk",
      desc: `<strong>Metronidazole/Miconazole</strong> severely increases the anticoagulant effect of <strong>Warfarin</strong>. Risk of major hemorrhage. Check alternative or consult haematologist.`
    });
  }

  // Rule C: Child safety alerts
  if (patient.age <= 12 && drug.formulation === "Tablets" && drug.name !== "Paracetamol") {
    warnings.push({
      severity: "amber",
      title: "Paediatric Notice: Liquid Suspension Suggested",
      desc: `Patient is under 12. Oral liquid suspension is generally preferred to tablets/capsules for ease of swallowing and precise titration.`
    });
  }

  // Rule D: Pregnancy safety warning
  const isPregnant = patient.conditions.some(cond => cond.toLowerCase().includes("pregnant"));
  if (isPregnant && drug.name.toLowerCase().includes("ibuprofen")) {
    warnings.push({
      severity: "amber",
      title: "Pregnancy Notice: NSAID Warning",
      desc: `Avoid NSAIDs like <strong>Ibuprofen</strong> in late pregnancy (third trimester) due to risk of premature closure of fetal ductus arteriosus and renal impairment.`
    });
  }

  // Render Alerts
  if (warnings.length > 0) {
    const highAlerts = warnings.filter(w => w.severity === "high");
    const count = warnings.length;
    
    // Sort so high severity is at the top
    warnings.sort((a, b) => (a.severity === "high" ? -1 : 1));

    elements.alertsCountBadge.textContent = `${count} ${count === 1 ? 'Alert' : 'Alerts'}`;
    elements.alertsCountBadge.className = `badge ${highAlerts.length > 0 ? 'bg-red' : 'bg-warning'}`;
    
    elements.safetyBox.innerHTML = warnings.map(w => {
      const stateClass = w.severity === "high" ? "red-state" : "amber-state";
      const icon = w.severity === "high" ? "&#9888;" : "&#9432;";
      return `
        <div class="safety-state ${stateClass}" style="margin-bottom:8px;">
          <span class="safety-icon">${icon}</span>
          <p class="safety-title">${w.title}</p>
          <p class="safety-desc">${w.desc}</p>
        </div>
      `;
    }).join("");
  } else {
    // Normal Green Pass State
    elements.alertsCountBadge.textContent = "Passed";
    elements.alertsCountBadge.className = "badge bg-green";
    elements.safetyBox.innerHTML = `
      <div class="safety-state green-state">
        <span class="safety-icon">&#10004;</span>
        <p class="safety-title">Safety Check Passed</p>
        <p class="safety-desc">No drug interactions, pregnancy warnings, or allergies detected for this prescription.</p>
      </div>
    `;
  }
}

// 9. Canvas drawing logic
let isDrawing = false;
let sigCanvasContext = null;
let hasSignature = false;

if (elements.sigCanvas) {
  sigCanvasContext = elements.sigCanvas.getContext("2d");
  
  // Set draw lines properties
  sigCanvasContext.strokeStyle = "#000000";
  sigCanvasContext.lineWidth = 2.5;
  sigCanvasContext.lineCap = "round";
  sigCanvasContext.lineJoin = "round";

  // Mouse Draw Event Listeners
  elements.sigCanvas.addEventListener("mousedown", startDrawing);
  elements.sigCanvas.addEventListener("mousemove", draw);
  document.addEventListener("mouseup", stopDrawing);

  // Touch Draw Event Listeners (Mobile/Tablet)
  elements.sigCanvas.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    elements.sigCanvas.dispatchEvent(mouseEvent);
    e.preventDefault();
  }, { passive: false });

  elements.sigCanvas.addEventListener("touchmove", (e) => {
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    elements.sigCanvas.dispatchEvent(mouseEvent);
    e.preventDefault();
  }, { passive: false });
}

function startDrawing(e) {
  isDrawing = true;
  sigCanvasContext.beginPath();
  const rect = elements.sigCanvas.getBoundingClientRect();
  
  // Calculate relative coordinates scaling to canvas viewport size
  const x = (e.clientX - rect.left) * (elements.sigCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (elements.sigCanvas.height / rect.height);
  
  sigCanvasContext.moveTo(x, y);
  
  // Hide placeholder
  const placeholder = document.querySelector(".canvas-placeholder");
  if (placeholder) placeholder.style.display = "none";
}

function draw(e) {
  if (!isDrawing) return;
  const rect = elements.sigCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (elements.sigCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (elements.sigCanvas.height / rect.height);

  sigCanvasContext.lineTo(x, y);
  sigCanvasContext.stroke();
  hasSignature = true;
  updateSubmitButtonState();
}

function stopDrawing() {
  if (!isDrawing) return;
  isDrawing = false;
  sigCanvasContext.closePath();
  
  // Update preview on FP10D
  updateSignaturePreviewOnForm();
}

function updateSignaturePreviewOnForm() {
  if (hasSignature) {
    const dataUrl = elements.sigCanvas.toDataURL();
    elements.fpSignatureImage.src = dataUrl;
    elements.fpSignatureImage.style.display = "block";
  } else {
    elements.fpSignatureImage.style.display = "none";
  }
}

if (elements.btnClearSig) {
  elements.btnClearSig.addEventListener("click", () => {
    clearSignature();
  });
}

function clearSignature() {
  sigCanvasContext.clearRect(0, 0, elements.sigCanvas.width, elements.sigCanvas.height);
  hasSignature = false;
  
  const placeholder = document.querySelector(".canvas-placeholder");
  if (placeholder) placeholder.style.display = "block";

  updateSignaturePreviewOnForm();
  updateSubmitButtonState();
}

function updateSubmitButtonState() {
  // Enabled only if patient, drug are selected, and signature is drawn
  const canPrescribe = state.selectedPatient && state.selectedDrug && hasSignature;
  elements.btnSubmit.disabled = !canPrescribe;
}

// 10. EPS Submission Flow
elements.btnSubmit.addEventListener("click", () => {
  if (!state.selectedPatient || !state.selectedDrug || !hasSignature) return;

  // Add simulated validation processing state
  elements.btnSubmit.disabled = true;
  elements.btnSubmit.textContent = "EPS Encrypting & Transmitting...";

  const submitAction = () => {
    const p = state.selectedPatient;
    const d = state.selectedDrug;
    const presc = state.prescription;
    const uuid = generateUUID();

    // Populate Modal Receipt
    elements.receiptNhs.textContent = p.nhsNo;
    elements.receiptName.textContent = `${p.surname}, ${p.forenames}`;
    elements.receiptMed.textContent = `${d.name} ${d.strength}`;
    elements.receiptQty.textContent = presc.quantity || d.standardQty;
    elements.receiptUuid.textContent = uuid;

    // Show Modal
    elements.epsOverlay.style.display = "flex";

    // Add prescription to historical audit log
    const logItem = {
      uuid: uuid,
      patientName: `${p.surname}, ${p.forenames.split(" ")[0]}`,
      medDetails: `${d.name} ${d.strength}`,
      quantity: presc.quantity || d.standardQty,
      time: new Date().toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    state.sessionPrescriptions.unshift(logItem);
    renderPrescriptionLog();

    // Reset button
    elements.btnSubmit.textContent = "Sign & Submit to EPS";
    clearSignature();
  };

  if (window.location.search.includes("test-submit=true")) {
    submitAction();
  } else {
    setTimeout(submitAction, 1000);
  }
});

elements.btnModalClose.addEventListener("click", () => {
  elements.epsOverlay.style.display = "none";
});

function renderPrescriptionLog() {
  elements.sessionPrescCount.textContent = `${state.sessionPrescriptions.length} issued`;
  
  if (state.sessionPrescriptions.length === 0) {
    elements.prescHistory.innerHTML = '<p class="chart-note pad-10">No prescriptions issued in this session.</p>';
    return;
  }

  elements.prescHistory.innerHTML = state.sessionPrescriptions.map(item => {
    return `
      <div class="history-item">
        <div class="history-item-header">
          <span>Patient: ${item.patientName}</span>
          <span class="status-sent">Sent</span>
        </div>
        <div class="history-item-body">
          <strong>${item.medDetails}</strong> &middot; Qty: ${item.quantity}
        </div>
        <div class="history-item-footer">
          <span class="font-mono text-small" style="color:var(--muted)">ID: ${item.uuid.slice(0, 8)}...</span>
          <span style="color:var(--muted)">${item.time}</span>
        </div>
      </div>
    `;
  }).join("");
}

function generateUUID() {
  return "eps-xxxx-xxxx-xxxx-xxxx".replace(/[x]/g, () => {
    const r = (Math.random() * 16) | 0;
    return r.toString(16);
  });
}

function resizeCanvas() {
  // Read size to render on standard pixel ratios correctly
  if (!elements.sigCanvas) return;
  const rect = elements.sigCanvas.getBoundingClientRect();
  elements.sigCanvas.width = rect.width;
  elements.sigCanvas.height = rect.height;
  
  // Re-establish drawing attributes as resizing resets canvas context properties
  if (sigCanvasContext) {
    sigCanvasContext.strokeStyle = "#000000";
    sigCanvasContext.lineWidth = 2.5;
    sigCanvasContext.lineCap = "round";
    sigCanvasContext.lineJoin = "round";
  }
}

// Ensure responsiveness resize re-binds context
window.addEventListener("resize", () => {
  resizeCanvas();
  updateSignaturePreviewOnForm();
});

// Test hooks for headless screenshots
if (window.location.search.includes("test-unlock=true")) {
  setTimeout(() => {
    state.enteredPin = "2026";
    verifyPin();
  }, 100);
} else if (window.location.search.includes("test-allergy=true")) {
  setTimeout(() => {
    state.enteredPin = "2026";
    verifyPin();
    
    setTimeout(() => {
      // Select Sarah Jenkins (allergy to Penicillin)
      const patient = PATIENTS.find(p => p.id === "p1");
      selectPatient(patient);
      
      // Select Amoxicillin (Penicillin class)
      const drug = FORMULARY.find(d => d.id === "d1");
      selectDrug(drug);
    }, 100);
  }, 100);
} else if (window.location.search.includes("test-interaction=true")) {
  setTimeout(() => {
    state.enteredPin = "2026";
    verifyPin();
    
    setTimeout(() => {
      // Select David Miller (on Warfarin)
      const patient = PATIENTS.find(p => p.id === "p2");
      selectPatient(patient);
      
      // Select Metronidazole (Severe Warfarin Interaction)
      const drug = FORMULARY.find(d => d.id === "d2");
      selectDrug(drug);
    }, 100);
  }, 100);
} else if (window.location.search.includes("test-sign=true")) {
  setTimeout(() => {
    state.enteredPin = "2026";
    verifyPin();
    
    setTimeout(() => {
      const patient = PATIENTS.find(p => p.id === "p2");
      selectPatient(patient);
      const drug = FORMULARY.find(d => d.id === "d2");
      selectDrug(drug);
      
      setTimeout(() => {
        // Draw a simulated signature on canvas
        if (sigCanvasContext && elements.sigCanvas) {
          sigCanvasContext.beginPath();
          sigCanvasContext.moveTo(20, 40);
          sigCanvasContext.quadraticCurveTo(80, 80, 140, 30);
          sigCanvasContext.quadraticCurveTo(180, 20, 240, 60);
          sigCanvasContext.stroke();
          sigCanvasContext.closePath();
          hasSignature = true;
          
          const placeholder = document.querySelector(".canvas-placeholder");
          if (placeholder) placeholder.style.display = "none";
          
          updateSignaturePreviewOnForm();
          updateSubmitButtonState();
        }
      }, 100);
    }, 100);
  }, 100);
} else if (window.location.search.includes("test-submit=true")) {
  setTimeout(() => {
    state.enteredPin = "2026";
    verifyPin();
    
    setTimeout(() => {
      const patient = PATIENTS.find(p => p.id === "p2");
      selectPatient(patient);
      const drug = FORMULARY.find(d => d.id === "d2");
      selectDrug(drug);
      
      setTimeout(() => {
        if (sigCanvasContext && elements.sigCanvas) {
          sigCanvasContext.beginPath();
          sigCanvasContext.moveTo(20, 40);
          sigCanvasContext.quadraticCurveTo(80, 80, 140, 30);
          sigCanvasContext.stroke();
          sigCanvasContext.closePath();
          hasSignature = true;
          updateSignaturePreviewOnForm();
          updateSubmitButtonState();
          
          // Trigger click on submit button
          setTimeout(() => {
            elements.btnSubmit.click();
          }, 150);
        }
      }, 150);
    }, 100);
  }, 100);
}

