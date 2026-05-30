const elements = {
  llmStatus: document.getElementById("llmStatus"),
  llmNote: document.getElementById("llmNote"),
  triiStatus: document.getElementById("triiStatus"),
  triiNote: document.getElementById("triiNote"),
  storageStatus: document.getElementById("storageStatus"),
  storageNote: document.getElementById("storageNote"),
  lastUpdate: document.getElementById("lastUpdate"),
  statusDot: document.getElementById("statusDot"),
  statusLabel: document.getElementById("statusLabel"),
  messageForm: document.getElementById("messageForm"),
  sampleServiceButton: document.getElementById("sampleServiceButton"),
  sampleProductButton: document.getElementById("sampleProductButton"),
  samplePendingButton: document.getElementById("samplePendingButton"),
  sampleStatsButton: document.getElementById("sampleStatsButton"),
  clearEventsButton: document.getElementById("clearEventsButton"),
  exportButton: document.getElementById("exportButton"),
  businessContext: document.getElementById("businessContext"),
  interpretationRules: document.getElementById("interpretationRules"),
  systemPrompt: document.getElementById("systemPrompt"),
  promptTemplate: document.getElementById("promptTemplate"),
  automaticContextList: document.getElementById("automaticContextList"),
  internalRulesList: document.getElementById("internalRulesList"),
  fallbackRulesList: document.getElementById("fallbackRulesList"),
  ownerContextDetails: document.getElementById("ownerContextDetails"),
  saveContextButton: document.getElementById("saveContextButton"),
  contextSaveState: document.getElementById("contextSaveState"),
  message: document.getElementById("message"),
  workerName: document.getElementById("workerName"),
  workerPhone: document.getElementById("workerPhone"),
  registerUserButton: document.getElementById("registerUserButton"),
  userStatus: document.getElementById("userStatus"),
  sendViaTrii: document.getElementById("sendViaTrii"),
  analysisMode: document.getElementById("analysisMode"),
  summaryKind: document.getElementById("summaryKind"),
  summaryExecution: document.getElementById("summaryExecution"),
  summaryPayment: document.getElementById("summaryPayment"),
  summaryAmount: document.getElementById("summaryAmount"),
  summaryDate: document.getElementById("summaryDate"),
  summaryArea: document.getElementById("summaryArea"),
  validationChecklist: document.getElementById("validationChecklist"),
  extraDataCard: document.getElementById("extraDataCard"),
  extraDataList: document.getElementById("extraDataList"),
  trackingCard: document.getElementById("trackingCard"),
  trackingSummary: document.getElementById("trackingSummary"),
  trackingStats: document.getElementById("trackingStats"),
  workerFeedback: document.getElementById("workerFeedback"),
  clarificationMessage: document.getElementById("clarificationMessage"),
  triiDelivery: document.getElementById("triiDelivery"),
  confidenceState: document.getElementById("confidenceState"),
  missingFieldsSection: document.getElementById("missingFieldsSection"),
  missingFields: document.getElementById("missingFields"),
  normalizedEvent: document.getElementById("normalizedEvent"),
  metricEvents: document.getElementById("metricEvents"),
  metricPending: document.getElementById("metricPending"),
  metricCollected: document.getElementById("metricCollected"),
  metricRevenue: document.getElementById("metricRevenue"),
  eventMix: document.getElementById("eventMix"),
  topCategories: document.getElementById("topCategories"),
  eventsList: document.getElementById("eventsList"),
  savedBadge: document.getElementById("savedBadge"),
  learningSuggestionCard: document.getElementById("learningSuggestionCard"),
  learningSuggestionState: document.getElementById("learningSuggestionState"),
  learningSuggestionReason: document.getElementById("learningSuggestionReason"),
  learningSuggestionContext: document.getElementById("learningSuggestionContext"),
  learningSuggestionRule: document.getElementById("learningSuggestionRule"),
  applySuggestionButton: document.getElementById("applySuggestionButton"),
  usersList: document.getElementById("usersList"),
  usersCount: document.getElementById("usersCount"),
  conversationsList: document.getElementById("conversationsList"),
  conversationsCount: document.getElementById("conversationsCount"),
  learningSuggestionsList: document.getElementById("learningSuggestionsList"),
  suggestionsCount: document.getElementById("suggestionsCount"),
  pendingBadge: document.getElementById("pendingBadge"),
  learningSuggestionSavedNote: document.getElementById("learningSuggestionSavedNote"),
};

let currentLearningSuggestion = null;
let currentUser = null;
let cachedUsers = [];
let cachedEvents = [];

const sampleService = {
  workerName: "José Gómez",
  workerPhone: "+5493544415532",
  message:
    "Hoy arreglé una pérdida de agua en Alberdi, cambié una canilla y cobré 45000. Me pagaron por transferencia y tengo comprobante.",
};

const sampleProduct = {
  workerName: "Micaela Ruiz",
  workerPhone: "+5493515551122",
  message:
    "Hoy vendí 12 botellas de aceite en General Paz por 36000. Ya me pagaron en efectivo y tengo anotado el movimiento.",
};

const samplePending = {
  workerName: "Juan Perez",
  workerPhone: "+5493510000001",
  message:
    "Mañana tengo que ir a hacer una instalación de aire en Nueva Córdoba. Me pidieron presupuesto, pasé 85000 y dijeron que sí.",
};

const sampleStats = {
  workerName: "José Gómez",
  workerPhone: "+5493544415532",
  message: "Cuánto llevo cobrado y cuál fue el trabajo más caro que hice?",
};

boot();

/* ─── Sidebar Navigation ─── */

const sidebarNav = document.getElementById("sidebarNav");
const sidebar = document.getElementById("sidebar");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileOverlay = document.getElementById("mobileOverlay");
const navItems = sidebarNav ? sidebarNav.querySelectorAll(".nav-item") : [];
const pageSections = document.querySelectorAll(".page-section");

function navigateToSection(sectionId) {
  pageSections.forEach((section) => {
    section.classList.toggle("active", section.dataset.page === sectionId);
  });
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.section === sectionId);
  });
  closeMobileSidebar();
}

function closeMobileSidebar() {
  document.body.classList.remove("sidebar-open");
}

if (sidebarNav) {
  sidebarNav.addEventListener("click", (event) => {
    const navItem = event.target.closest(".nav-item");
    if (!navItem) return;
    event.preventDefault();
    const sectionId = navItem.dataset.section;
    if (sectionId) {
      navigateToSection(sectionId);
      history.replaceState(null, "", `#${sectionId}`);
    }
  });
}

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
  });
}

if (mobileOverlay) {
  mobileOverlay.addEventListener("click", closeMobileSidebar);
}

function initFromHash() {
  const hash = location.hash.replace("#", "");
  const valid = [...navItems].some((item) => item.dataset.section === hash);
  if (valid) navigateToSection(hash);
}

window.addEventListener("hashchange", () => {
  const hash = location.hash.replace("#", "");
  const valid = [...navItems].some((item) => item.dataset.section === hash);
  if (valid) navigateToSection(hash);
});

initFromHash();

elements.sampleServiceButton.addEventListener("click", () => applySample(sampleService));
elements.sampleProductButton.addEventListener("click", () => applySample(sampleProduct));
elements.samplePendingButton.addEventListener("click", () => applySample(samplePending));
elements.sampleStatsButton.addEventListener("click", () => applySample(sampleStats));
elements.registerUserButton.addEventListener("click", registerCurrentUser);
elements.clearEventsButton.addEventListener("click", clearAllEvents);
elements.saveContextButton.addEventListener("click", saveOwnerContext);
elements.applySuggestionButton.addEventListener("click", applyLearningSuggestion);
elements.businessContext.addEventListener("input", markContextDirty);
elements.interpretationRules.addEventListener("input", markContextDirty);
elements.systemPrompt.addEventListener("input", markContextDirty);
elements.promptTemplate.addEventListener("input", markContextDirty);

elements.exportButton.addEventListener("click", () => {
  window.open("/api/export.csv", "_blank");
});

elements.learningSuggestionsList.addEventListener("click", async (event) => {
  const approveBtn = event.target.closest("[data-suggestion-id].suggestion-approve-btn");
  if (approveBtn) {
    await approveSuggestion(approveBtn.getAttribute("data-suggestion-id"));
    return;
  }
  const rejectBtn = event.target.closest("[data-suggestion-id].suggestion-reject-btn");
  if (rejectBtn) {
    await rejectSuggestion(rejectBtn.getAttribute("data-suggestion-id"));
    return;
  }
});

elements.eventsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-id]");
  if (!button) return;
  const eventId = button.getAttribute("data-delete-id");
  if (!eventId) return;
  await deleteEventById(eventId);
});

elements.messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    workerName: elements.workerName.value,
    workerPhone: elements.workerPhone.value,
    message: elements.message.value,
    sendViaTrii: elements.sendViaTrii.checked,
  };

  setPendingState(true);

  try {
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo procesar el mensaje.");
    }

    renderAnalysis(data);
    renderMetrics(data.metrics);
    cachedEvents = data.events || data.works || [];
    renderEvents(cachedEvents);
    renderLlmStatus(data.llm);
    renderTriiiStatus(data.trii || null);
    if (data.userProfile) {
      currentUser = data.userProfile;
      persistCurrentUser();
      renderUserStatus(currentUser);
    }
    await loadUsers();
    await loadConversations();
    await loadLearningSuggestions();
    elements.lastUpdate.textContent = formatShortDateTime(new Date());
  } catch (error) {
    elements.analysisMode.textContent = "Error";
    elements.workerFeedback.textContent = error.message;
    elements.clarificationMessage.textContent = "No se pudo completar el procesamiento.";
    elements.triiDelivery.textContent = "No se pudo determinar el estado del envío.";
  } finally {
    setPendingState(false);
  }
});

async function boot() {
  restoreCurrentUser();
  const response = await fetch("/api/state");
  const state = await response.json();

  cachedEvents = state.events || state.works || [];
  cachedUsers = state.users || [];

  renderMetrics(state.metrics);
  renderEvents(cachedEvents);
  renderLlmStatus(state.llm);
  renderTriiiStatus(state.trii);
  renderStorageStatus(state.storage);
  renderOwnerContext(state.ownerContext);
  renderContextOverview(state.agentContextOverview);
  renderUserStatus(currentUser);
  renderLearningSuggestion(null);
  renderUsersList(cachedUsers, cachedEvents);
  renderTopbarStatus(state);
  renderPendingBadge(state.pendingSuggestions || 0);
  elements.lastUpdate.textContent = formatShortDateTime(new Date());

  await loadConversations();
  await loadLearningSuggestions();
}

async function loadUsers() {
  try {
    const response = await fetch("/api/state");
    const state = await response.json();
    cachedUsers = state.users || [];
    cachedEvents = state.events || state.works || [];
    renderUsersList(cachedUsers, cachedEvents);
  } catch {
    /* silent */
  }
}

async function loadConversations() {
  try {
    const response = await fetch("/api/interactions?limit=20");
    const data = await response.json();
    const interactions = data.interactions || [];
    renderConversations(interactions);
  } catch {
    elements.conversationsList.className = "conversations-list empty";
    elements.conversationsList.textContent = "No se pudieron cargar las conversaciones.";
  }
}

async function loadLearningSuggestions() {
  try {
    const response = await fetch("/api/learning-suggestions");
    const data = await response.json();
    const suggestions = data.suggestions || [];
    renderLearningSuggestionsList(suggestions);
    const pending = suggestions.filter((s) => s.status === "pending").length;
    renderPendingBadge(pending);
  } catch {
    elements.learningSuggestionsList.className = "learning-suggestions-list empty";
    elements.learningSuggestionsList.textContent = "No se pudieron cargar las sugerencias.";
  }
}

function renderPendingBadge(count) {
  if (!elements.pendingBadge) return;
  const aprendizajesItem = document.querySelector('[data-section="aprendizajes"]');
  if (count > 0) {
    elements.pendingBadge.textContent = String(count);
    elements.pendingBadge.classList.remove("hidden");
    if (aprendizajesItem) aprendizajesItem.classList.add("has-pending");
  } else {
    elements.pendingBadge.classList.add("hidden");
    if (aprendizajesItem) aprendizajesItem.classList.remove("has-pending");
  }
}

function renderLearningSuggestionsList(suggestions) {
  const pending = suggestions.filter((s) => s.status === "pending").length;
  elements.suggestionsCount.textContent = `${suggestions.length} sugerencia${suggestions.length === 1 ? "" : "s"}${pending > 0 ? ` (${pending} pendientes)` : ""}`;

  if (!suggestions.length) {
    elements.learningSuggestionsList.className = "learning-suggestions-list empty";
    elements.learningSuggestionsList.textContent = "Todavia no hay sugerencias guardadas. Cuando el agente detecte una mejora, aparecera aca.";
    return;
  }

  elements.learningSuggestionsList.className = "learning-suggestions-list";
  elements.learningSuggestionsList.innerHTML = suggestions.map((s) => {
    const statusClass = s.status === "approved" ? "approved" : s.status === "rejected" ? "rejected" : "pending";
    const statusLabel = s.status === "approved" ? "Aprobada" : s.status === "rejected" ? "Descartada" : "Pendiente";
    const isPending = s.status === "pending";

    return `
      <div class="suggestion-card ${statusClass}">
        <div class="suggestion-header">
          <div class="suggestion-meta">
            <span class="suggestion-status-badge ${statusClass}">${statusLabel}</span>
            <span class="suggestion-date">${formatShortDateTime(s.createdAt)}</span>
          </div>
          ${s.workerName || s.workerPhone ? `<span class="suggestion-worker">${escapeHtml(s.workerName || "")}${s.workerPhone ? ` · ${escapeHtml(s.workerPhone)}` : ""}</span>` : ""}
        </div>
        ${s.reason ? `<p class="suggestion-reason">${escapeHtml(s.reason)}</p>` : ""}
        <div class="suggestion-details">
          ${s.businessContextAddition ? `<div class="suggestion-detail"><h4>Contexto del negocio</h4><p>${escapeHtml(s.businessContextAddition)}</p></div>` : ""}
          ${s.interpretationRuleAddition ? `<div class="suggestion-detail"><h4>Regla de interpretacion</h4><p>${escapeHtml(s.interpretationRuleAddition)}</p></div>` : ""}
        </div>
        ${s.sourceMessage ? `<p class="suggestion-source"><strong>Mensaje origen:</strong> ${escapeHtml(s.sourceMessage)}</p>` : ""}
        ${isPending ? `
          <div class="suggestion-actions">
            <button class="primary-button suggestion-approve-btn" data-suggestion-id="${escapeHtml(s.id)}" type="button">Aprobar</button>
            <button class="ghost-button danger-button suggestion-reject-btn" data-suggestion-id="${escapeHtml(s.id)}" type="button">Descartar</button>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

async function approveSuggestion(id) {
  try {
    const response = await fetch(`/api/learning-suggestions/${encodeURIComponent(id)}/approve`, {
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo aprobar la sugerencia.");
    }
    if (data.ownerContext) {
      renderOwnerContext(data.ownerContext);
    }
    renderLearningSuggestionsList(data.suggestions || []);
    const pending = (data.suggestions || []).filter((s) => s.status === "pending").length;
    renderPendingBadge(pending);
  } catch (error) {
    alert(error.message);
  }
}

async function rejectSuggestion(id) {
  try {
    const response = await fetch(`/api/learning-suggestions/${encodeURIComponent(id)}/reject`, {
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo descartar la sugerencia.");
    }
    renderLearningSuggestionsList(data.suggestions || []);
    const pending = (data.suggestions || []).filter((s) => s.status === "pending").length;
    renderPendingBadge(pending);
  } catch (error) {
    alert(error.message);
  }
}

function applySample(sample) {
  elements.workerName.value = sample.workerName;
  elements.workerPhone.value = sample.workerPhone;
  elements.message.value = sample.message;
  currentUser = {
    name: sample.workerName,
    phone: sample.workerPhone,
  };
  persistCurrentUser();
  renderUserStatus(currentUser);
}

function restoreCurrentUser() {
  try {
    const saved = JSON.parse(localStorage.getItem("woforyCurrentUser") || "null");
    if (!saved?.phone) return;
    currentUser = saved;
    elements.workerName.value = saved.name || "";
    elements.workerPhone.value = saved.phone || "";
  } catch {
    currentUser = null;
  }
}

function persistCurrentUser() {
  if (!currentUser?.phone) return;
  localStorage.setItem("woforyCurrentUser", JSON.stringify(currentUser));
}

async function registerCurrentUser() {
  const payload = {
    workerName: elements.workerName.value,
    workerPhone: elements.workerPhone.value,
  };

  elements.registerUserButton.disabled = true;
  elements.registerUserButton.textContent = "Guardando...";

  try {
    const response = await fetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo identificar al trabajador.");
    }
    currentUser = data.user;
    persistCurrentUser();
    renderUserStatus(currentUser);
    await loadUsers();
  } catch (error) {
    elements.userStatus.textContent = error.message;
    elements.userStatus.className = "user-status warning";
  } finally {
    elements.registerUserButton.disabled = false;
    elements.registerUserButton.textContent = "Identificar";
  }
}

function renderUserStatus(user) {
  if (!elements.userStatus) return;
  if (!user?.phone) {
    elements.userStatus.className = "user-status";
    elements.userStatus.textContent =
      "El número identifica al trabajador y permite comparar sus registros.";
    return;
  }

  elements.userStatus.className = "user-status success";
  elements.userStatus.textContent = `${user.name || "Trabajador"} identificado por ${user.phone}.`;
}

function renderTopbarStatus(state) {
  const llm = state.llm;
  const trii = state.trii;

  if (llm?.configured) {
    elements.statusDot.className = "status-dot active";
    elements.statusLabel.textContent = "LLM activo";
  } else {
    elements.statusDot.className = "status-dot warning";
    elements.statusLabel.textContent = "LLM no configurado";
  }
}

function renderStorageStatus(storage) {
  if (!storage) return;
  if (storage.mode === "sqlite") {
    elements.storageStatus.textContent = "Datos guardados";
    elements.storageNote.textContent = "Los registros quedan disponibles para revisar y exportar.";
  } else {
    elements.storageStatus.textContent = "Datos guardados";
    elements.storageNote.textContent = "Los registros quedan disponibles para revisar y exportar.";
  }
}

function renderAnalysis(data) {
  if (data.mode === "history-query" || data.historyQuery) {
    renderHistoryQueryAnalysis(data);
    return;
  }

  elements.analysisMode.textContent = data.isComplete ? "Listo para registrar" : "Necesita confirmación";
  elements.workerFeedback.textContent = data.workerFeedback || "Sin respuesta.";
  elements.clarificationMessage.textContent =
    data.clarificationMessage || "No fue necesario pedir aclaración.";
  elements.normalizedEvent.textContent = JSON.stringify(
    data.normalizedEvent || data.normalizedWork || {},
    null,
    2
  );
  renderSummaryCards(data.normalizedEvent || data.normalizedWork || {});
  renderValidationChecklist(
    data.normalizedEvent || data.normalizedWork || {},
    data.missingFields || []
  );
  renderExtraData(data.normalizedEvent || data.normalizedWork || {});
  renderTracking(data.tracking || null);
  renderLearningSuggestion(data.contextLearningSuggestion || null);

  if (data.missingFields?.length) {
    elements.missingFieldsSection.classList.remove("hidden");
    elements.missingFields.className = "chips";
    elements.missingFields.innerHTML = data.missingFields
      .map((field) => `<span>${escapeHtml(labelField(field))}</span>`)
      .join("");
  } else {
    elements.missingFieldsSection.classList.add("hidden");
    elements.missingFields.className = "chips empty";
    elements.missingFields.textContent = "";
  }

  if (typeof data.extractionConfidence === "number") {
    const confidence = Math.round(data.extractionConfidence * 100);
    elements.confidenceState.textContent =
      confidence >= 85
        ? `${confidence}% · Se podría guardar directo`
        : confidence >= 60
          ? `${confidence}% · Conviene revisar o confirmar rápido`
          : `${confidence}% · Mejor pedir aclaración`;
  } else {
    elements.confidenceState.textContent = "Sin score todavía.";
  }

  if (data.triiDelivery) {
    const delivery = data.triiDelivery;
    const providerLabel = delivery.providerLabel || (delivery.provider === "meta" ? "Meta Cloud API" : "Triii");
    if (delivery.ok) {
      elements.triiDelivery.textContent = `Enviado por ${providerLabel} a ${delivery.phone}. Estado ${delivery.status} ${delivery.statusText}.`;
    } else {
      elements.triiDelivery.textContent =
        delivery.note ||
        `${providerLabel} respondió ${delivery.status || "sin estado"} ${delivery.statusText || ""}.`;
    }
  } else {
    elements.triiDelivery.textContent = "No se envió nada por WhatsApp en esta prueba.";
  }
}

function renderHistoryQueryAnalysis(data) {
  elements.analysisMode.textContent = "Consulta de historial";
  elements.workerFeedback.textContent = data.workerFeedback || data.historyQuery?.answer || "Sin respuesta.";
  elements.clarificationMessage.textContent = "No se registró un evento nuevo: fue una consulta sobre registros guardados.";
  elements.normalizedEvent.textContent = JSON.stringify(
    {
      tipo: "consulta_de_historial",
      consulta: data.historyQuery || null,
    },
    null,
    2
  );
  renderSummaryCards({});
  renderValidationChecklist({}, []);
  renderExtraData({});
  renderTracking(null);
  renderLearningSuggestion(null);
  elements.missingFieldsSection.classList.add("hidden");
  elements.missingFields.className = "chips empty";
  elements.missingFields.textContent = "";
  elements.confidenceState.textContent = "Respondido desde el historial guardado.";

  if (data.triiDelivery) {
    const delivery = data.triiDelivery;
    const providerLabel = delivery.providerLabel || (delivery.provider === "meta" ? "Meta Cloud API" : "Triii");
    elements.triiDelivery.textContent = delivery.ok
      ? `Enviado por ${providerLabel} a ${delivery.phone}. Estado ${delivery.status} ${delivery.statusText}.`
      : delivery.note || `${providerLabel} respondió ${delivery.status || "sin estado"} ${delivery.statusText || ""}.`;
  } else {
    elements.triiDelivery.textContent = "No se envió nada por WhatsApp en esta prueba.";
  }
}

function renderOwnerContext(ownerContext) {
  if (!ownerContext) return;
  elements.businessContext.value = ownerContext.businessContext || "";
  elements.interpretationRules.value = ownerContext.interpretationRules || "";
  elements.systemPrompt.value = ownerContext.systemPrompt || "";
  elements.promptTemplate.value = ownerContext.promptTemplate || "";
  elements.contextSaveState.textContent = ownerContext.updatedAt
    ? `Guardado ${formatShortDateTime(ownerContext.updatedAt)}`
    : "Sin cambios";
}

function renderContextOverview(overview) {
  if (!overview) return;
  renderContextBulletList(elements.automaticContextList, overview.automaticContext);
  renderContextBulletList(elements.internalRulesList, overview.internalRules);
  renderContextBulletList(elements.fallbackRulesList, overview.fallbackRules);
}

function renderContextBulletList(container, items) {
  if (!container) return;
  if (!Array.isArray(items) || items.length === 0) {
    container.className = "context-bullets empty";
    container.textContent = "Sin información cargada.";
    return;
  }

  container.className = "context-bullets";
  container.innerHTML = `
    <ul>
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function renderValidationChecklist(event, missingFields) {
  const items = [
    buildChecklistItem("Qué pasó", Boolean(event.economicLabel), event.economicLabel || "Falta definir el evento"),
    buildChecklistItem("Tipo", Boolean(event.economicKind), labelEconomicKind(event.economicKind)),
    buildChecklistItem("Estado", Boolean(event.executionStatus), labelExecutionStatus(event.executionStatus)),
    buildChecklistItem(
      "Cobro",
      Boolean(event.paymentStatus),
      labelPaymentStatus(event.paymentStatus)
    ),
    buildChecklistItem(
      "Monto",
      Boolean(event.amount),
      event.amount ? formatCurrency(event.amount) : "Falta monto"
    ),
    buildChecklistItem(
      "Fecha",
      Boolean(event.date),
      event.date || "Falta fecha"
    ),
    buildChecklistItem(
      "Zona",
      Boolean(event.broadArea),
      event.broadArea || "No se indicó zona"
    ),
    buildChecklistItem(
      "Evidencia",
      Boolean(event.evidenceType),
      event.evidenceType || "No se indicó evidencia",
      true
    ),
  ];

  const requiredMissing = Array.isArray(missingFields) ? missingFields.length : 0;
  const hasAnySignal = items.some((item) => item.checked);

  if (!hasAnySignal) {
    elements.validationChecklist.className = "validation-checklist empty";
    elements.validationChecklist.textContent = "Todavía no hay información validada para mostrar.";
    return;
  }

  elements.validationChecklist.className = "validation-checklist";
  elements.validationChecklist.innerHTML = `
    <div class="validation-summary">
      <strong>${requiredMissing === 0 ? "Base suficiente" : "Faltan datos por confirmar"}</strong>
      <span>${
        requiredMissing === 0
          ? "La información mínima quedó validada."
          : `${requiredMissing} punto${requiredMissing === 1 ? "" : "s"} pendiente${requiredMissing === 1 ? "" : "s"}.`
      }</span>
    </div>
    <div class="validation-list">
      ${items.map(renderChecklistItem).join("")}
    </div>
  `;
}

function renderExtraData(event) {
  const rows = [
    event.commercialStatus && ["Etapa comercial", labelCommercialStatus(event.commercialStatus)],
    event.quotedAmount !== null &&
      event.quotedAmount !== undefined && ["Monto cotizado", formatCurrency(event.quotedAmount)],
    event.startDate && ["Inicio", event.startDate],
    event.endDate && ["Fin", event.endDate],
    event.estimatedDuration && ["Duración", event.estimatedDuration],
    event.collaborators?.length && ["Ayudantes", event.collaborators.join(", ")],
    event.splitRule && ["Reparto", event.splitRule],
    event.grossAmount !== null &&
      event.grossAmount !== undefined && ["Ingreso bruto", formatCurrency(event.grossAmount)],
    event.costAmount !== null &&
      event.costAmount !== undefined && ["Gasto / material", `${formatCurrency(event.costAmount)}${event.costDescription ? ` · ${event.costDescription}` : ""}`],
    event.deductionAmount !== null &&
      event.deductionAmount !== undefined && ["Descuento / retención", `${formatCurrency(event.deductionAmount)}${event.deductionDescription ? ` · ${event.deductionDescription}` : ""}`],
    event.netIncome !== null &&
      event.netIncome !== undefined && ["Ganancia estimada", formatCurrency(event.netIncome)],
    event.quantity !== null &&
      event.quantity !== undefined &&
      event.unit && ["Cantidad / medida", `${event.quantity} ${event.unit}`],
    event.moneyParsingNote && ["Formato del monto", event.moneyParsingNote],
  ].filter(Boolean);

  if (!rows.length) {
    elements.extraDataCard.classList.add("hidden");
    elements.extraDataList.innerHTML = "";
    return;
  }

  elements.extraDataCard.classList.remove("hidden");
  elements.extraDataList.innerHTML = rows
    .map(
      ([label, value]) => `
        <div class="extra-data-item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderTracking(tracking) {
  if (!tracking || !tracking.workerTotals) {
    elements.trackingCard.classList.add("hidden");
    elements.trackingSummary.textContent = "Todavía no hay seguimiento para mostrar.";
    elements.trackingStats.innerHTML = "";
    return;
  }

  const categoryText = tracking.categoryLabel
    ? `${tracking.categoryCount} registro${tracking.categoryCount === 1 ? "" : "s"} de ${tracking.categoryLabel}`
    : "Primer registro de esta línea";
  const comparison = tracking.amountComparison?.message || "Todavía no hay comparación de monto previa.";
  const totals = tracking.workerTotals;

  elements.trackingCard.classList.remove("hidden");
  elements.trackingSummary.textContent = `${categoryText}. ${comparison}`;
  elements.trackingStats.innerHTML = `
    <div class="tracking-stat">
      <span>Registros</span>
      <strong>${totals.totalEvents || 0}</strong>
    </div>
    <div class="tracking-stat">
      <span>Cobrado acumulado</span>
      <strong>${formatCurrency(totals.totalCollected || 0)}</strong>
    </div>
    <div class="tracking-stat">
      <span>Pendientes</span>
      <strong>${totals.pendingEvents || 0}</strong>
    </div>
  `;
}

function buildChecklistItem(label, checked, detail, optional = false) {
  return {
    label,
    checked,
    detail,
    optional,
  };
}

function renderChecklistItem(item) {
  const statusClass = item.checked ? "checked" : item.optional ? "optional" : "missing";
  const statusLabel = item.checked ? "Validado" : item.optional ? "Opcional" : "Pendiente";
  const icon = item.checked ? "✓" : item.optional ? "·" : "!";

  return `
    <div class="check-item ${statusClass}">
      <div class="check-icon" aria-hidden="true">${icon}</div>
      <div class="check-copy">
        <div class="check-head">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${statusLabel}</span>
        </div>
        <p>${escapeHtml(item.detail)}</p>
      </div>
    </div>
  `;
}

async function saveOwnerContext() {
  elements.saveContextButton.disabled = true;
  elements.contextSaveState.textContent = "Guardando...";

  try {
    const response = await fetch("/api/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessContext: elements.businessContext.value,
        interpretationRules: elements.interpretationRules.value,
        systemPrompt: elements.systemPrompt.value,
        promptTemplate: elements.promptTemplate.value,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo guardar la guía.");
    }

    renderOwnerContext(data.ownerContext);
  } catch (error) {
    elements.contextSaveState.textContent = "Error al guardar";
  } finally {
    elements.saveContextButton.disabled = false;
  }
}

function markContextDirty() {
  elements.contextSaveState.textContent = "Cambios sin guardar";
}

function renderLearningSuggestion(suggestion) {
  currentLearningSuggestion = suggestion;

  if (!suggestion || (!suggestion.businessContextAddition && !suggestion.interpretationRuleAddition)) {
    elements.learningSuggestionCard.classList.add("hidden");
    elements.learningSuggestionState.textContent = "Nuevo";
    elements.learningSuggestionReason.textContent =
      "Si el agente detecta una regla o contexto nuevo útil, aparecerá acá.";
    elements.learningSuggestionContext.textContent = "Sin sugerencia.";
    elements.learningSuggestionRule.textContent = "Sin sugerencia.";
    elements.applySuggestionButton.disabled = false;
    elements.applySuggestionButton.textContent = "Aplicar al borrador";
    elements.learningSuggestionSavedNote.classList.add("hidden");
    return;
  }

  elements.learningSuggestionCard.classList.remove("hidden");
  elements.learningSuggestionState.textContent = "Sugerencia";
  elements.learningSuggestionReason.textContent =
    suggestion.reason || "El agente detectó algo que podría convenir sumar a la guía.";
  elements.learningSuggestionContext.textContent =
    suggestion.businessContextAddition || "No sugiere cambios para la descripción del negocio.";
  elements.learningSuggestionRule.textContent =
    suggestion.interpretationRuleAddition || "No sugiere cambios para la guía de lectura.";
  elements.applySuggestionButton.disabled = false;
  elements.applySuggestionButton.textContent = "Aplicar al borrador";
  elements.learningSuggestionSavedNote.classList.remove("hidden");
}

function applyLearningSuggestion() {
  if (!currentLearningSuggestion) return;

  if (currentLearningSuggestion.businessContextAddition) {
    elements.businessContext.value = appendUniqueBlock(
      elements.businessContext.value,
      currentLearningSuggestion.businessContextAddition
    );
  }

  if (currentLearningSuggestion.interpretationRuleAddition) {
    elements.interpretationRules.value = appendUniqueBlock(
      elements.interpretationRules.value,
      currentLearningSuggestion.interpretationRuleAddition
    );
  }

  if (elements.ownerContextDetails) {
    elements.ownerContextDetails.open = true;
    elements.ownerContextDetails.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  elements.learningSuggestionState.textContent = "Aplicada";
  elements.applySuggestionButton.disabled = true;
  elements.applySuggestionButton.textContent = "Aplicada al borrador";
  elements.learningSuggestionSavedNote.classList.add("hidden");
  markContextDirty();
}

function appendUniqueBlock(base, addition) {
  const cleanBase = String(base || "").trim();
  const cleanAddition = String(addition || "").trim();
  if (!cleanAddition) return cleanBase;
  if (cleanBase.toLowerCase().includes(cleanAddition.toLowerCase())) return cleanBase;
  return cleanBase ? `${cleanBase}\n${cleanAddition}` : cleanAddition;
}

function renderMetrics(metrics) {
  elements.metricEvents.textContent = String(metrics.totalEvents || 0);
  elements.metricPending.textContent = String(metrics.pendingEvents || 0);
  elements.metricCollected.textContent = String(metrics.collectedEvents || 0);
  elements.metricRevenue.textContent = formatCurrency(metrics.totalCollected || 0);

  elements.eventMix.innerHTML = `
    <div class="mix-card">
      <div>
        <strong>${metrics.serviceEvents || 0}</strong>
        <span>Servicios</span>
      </div>
      <div>
        <strong>${metrics.productEvents || 0}</strong>
        <span>Productos</span>
      </div>
    </div>
  `;

  elements.topCategories.innerHTML = renderList(
    metrics.topCategories,
    (item) => `
      <div class="list-row">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${item.count} eventos</span>
      </div>
    `,
    "Todavía no hay categorías acumuladas."
  );
}

function renderEvents(events) {
  elements.savedBadge.textContent = `${events.length} registrados`;
  elements.clearEventsButton.disabled = !events.length;
  elements.eventsList.innerHTML = renderList(
    events,
    (event) => `
      <article class="work-card">
        <div class="event-header">
          <div class="event-title-stack">
            <strong>${escapeHtml(event.economicLabel || "Evento sin detalle")}</strong>
            <button class="event-delete-button" type="button" data-delete-id="${escapeHtml(event.id || "")}">
              Eliminar
            </button>
          </div>
          <div class="event-badges">
            <span class="kind-badge">${escapeHtml(labelEconomicKind(event.economicKind))}</span>
            <span class="demo-status ${event.executionStatus === "pendiente" ? "pending" : ""}">
              ${escapeHtml(labelExecutionStatus(event.executionStatus))}
            </span>
            <span class="collection-badge ${event.paymentStatus === "cobrado" ? "paid" : ""}">
              ${escapeHtml(labelPaymentStatus(event.paymentStatus))}
            </span>
          </div>
        </div>
        <p>${escapeHtml(event.eventSummary || "Sin resumen todavía.")}</p>
        <div class="event-meta">
          <span>${formatCurrency(event.amount || 0)}</span>
          <span>${escapeHtml(event.date || "Sin fecha")}</span>
          <span>${escapeHtml(event.broadArea || "Sin zona")}</span>
        </div>
        <div class="event-meta secondary">
          <span>${escapeHtml(event.derivedCategory || "Sin categoría derivada")}</span>
          <span>${escapeHtml(event.evidenceType || "Sin evidencia")}</span>
        </div>
        ${renderEventExtraMeta(event)}
      </article>
    `,
    "Todavía no hay eventos económicos guardados."
  );
}

function renderEventExtraMeta(event) {
  const extras = [
    event.commercialStatus && labelCommercialStatus(event.commercialStatus),
    event.quotedAmount !== null &&
      event.quotedAmount !== undefined &&
      `Cotizado ${formatCurrency(event.quotedAmount)}`,
    event.collaborators?.length && `Con ${event.collaborators.join(", ")}`,
    event.netIncome !== null &&
      event.netIncome !== undefined &&
      `Ganancia estimada ${formatCurrency(event.netIncome)}`,
    event.costAmount !== null &&
      event.costAmount !== undefined &&
      `Gasto ${formatCurrency(event.costAmount)}`,
    event.deductionAmount !== null &&
      event.deductionAmount !== undefined &&
      `Retención ${formatCurrency(event.deductionAmount)}`,
    event.quantity !== null &&
      event.quantity !== undefined &&
      event.unit &&
      `${event.quantity} ${event.unit}`,
  ].filter(Boolean);

  if (!extras.length) return "";
  return `
    <div class="event-meta extra">
      ${extras.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
}

function renderUsersList(users, events) {
  elements.usersCount.textContent = `${users.length} trabajador${users.length === 1 ? "" : "es"}`;

  if (!users.length) {
    elements.usersList.className = "users-list empty";
    elements.usersList.textContent = "Todavía no hay trabajadores registrados.";
    return;
  }

  elements.usersList.className = "users-list";
  elements.usersList.innerHTML = users.map((user) => {
    const phone = normalizePhoneKey(user.phone);
    const userEvents = (events || []).filter((e) => normalizePhoneKey(e.workerPhone) === phone);
    const totalCollected = userEvents
      .filter((e) => e.paymentStatus === "cobrado")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const pendingCount = userEvents.filter((e) => e.paymentStatus !== "cobrado").length;

    return `
      <div class="user-card">
        <div class="user-info">
          <div class="user-name">${escapeHtml(user.name || "Sin nombre")}</div>
          <div class="user-phone">${escapeHtml(user.phone || "-")}</div>
        </div>
        <div class="user-stat">
          <span class="user-stat-value">${userEvents.length}</span>
          <span class="user-stat-label">Eventos</span>
        </div>
        <div class="user-stat">
          <span class="user-stat-value">${formatCurrency(totalCollected)}</span>
          <span class="user-stat-label">Cobrado</span>
        </div>
        <div class="user-stat">
          <span class="user-stat-value">${pendingCount}</span>
          <span class="user-stat-label">Pendientes</span>
        </div>
      </div>
    `;
  }).join("");
}

function normalizePhoneKey(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) return `549${digits.slice(2)}`;
  if (digits.startsWith("9")) return `54${digits}`;
  return `549${digits}`;
}

function renderConversations(interactions) {
  elements.conversationsCount.textContent = `${interactions.length} mensaje${interactions.length === 1 ? "" : "s"}`;

  if (!interactions.length) {
    elements.conversationsList.className = "conversations-list empty";
    elements.conversationsList.textContent = "Todavía no hay conversaciones registradas.";
    return;
  }

  elements.conversationsList.className = "conversations-list";
  elements.conversationsList.innerHTML = interactions.map((interaction) => {
    const input = interaction.input || {};
    const output = interaction.output || {};
    const timestamp = interaction.timestamp || interaction.receivedAt;
    const isQuery = output.historyQuery || interaction.mode === "history-query";
    const modeTag = isQuery
      ? '<span class="conversation-tag query">Consulta</span>'
      : output.isComplete
        ? '<span class="conversation-tag complete">Registrado</span>'
        : '<span class="conversation-tag incomplete">Pendiente</span>';

    return `
      <div class="conversation-card">
        <div class="conversation-header">
          <div>
            <span class="conversation-sender">${escapeHtml(input.workerName || "Sin nombre")}</span>
            <span class="conversation-phone">${escapeHtml(input.workerPhone || "-")}</span>
          </div>
          <span class="conversation-time">${formatShortDateTime(timestamp)}</span>
        </div>
        <div class="conversation-body">
          <div class="conversation-incoming">
            <strong>Mensaje recibido</strong>
            ${escapeHtml(input.message || "-")}
          </div>
          <div class="conversation-response">
            <strong>Respuesta del agente</strong>
            ${escapeHtml(output.workerFeedback || output.clarificationMessage || "Sin respuesta")}
          </div>
        </div>
        <div class="conversation-meta">
          ${modeTag}
          ${output.savedEventIds?.length ? `<span class="conversation-tag">${output.savedEventIds.length} evento${output.savedEventIds.length > 1 ? "s" : ""} guardado${output.savedEventIds.length > 1 ? "s" : ""}</span>` : ""}
          <span class="conversation-tag">${escapeHtml(input.source || "manual-ui")}</span>
        </div>
      </div>
    `;
  }).join("");
}

async function clearAllEvents() {
  const confirmed = window.confirm(
    "¿Querés vaciar toda la lista de eventos económicos? Esta acción elimina los registros guardados."
  );
  if (!confirmed) return;

  elements.clearEventsButton.disabled = true;

  try {
    const response = await fetch("/api/events", {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo vaciar la lista.");
    }
    syncEventsState(data);
  } catch (error) {
    elements.savedBadge.textContent = "Error al borrar";
  } finally {
    elements.clearEventsButton.disabled = false;
  }
}

async function deleteEventById(eventId) {
  const confirmed = window.confirm(
    "¿Querés eliminar este evento económico de la lista?"
  );
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo eliminar el evento.");
    }
    syncEventsState(data);
  } catch (error) {
    elements.savedBadge.textContent = "Error al borrar";
  }
}

function syncEventsState(data) {
  renderMetrics(data.metrics || {});
  cachedEvents = data.events || data.works || [];
  renderEvents(cachedEvents);
  loadUsers();
}

function renderSummaryCards(event) {
  elements.summaryKind.textContent = labelEconomicKind(event.economicKind);
  elements.summaryExecution.textContent = labelExecutionStatus(event.executionStatus);
  elements.summaryPayment.textContent = labelPaymentStatus(event.paymentStatus);
  elements.summaryAmount.textContent = event.amount !== null && event.amount !== undefined ? formatCurrency(event.amount) : "A confirmar";
  elements.summaryDate.textContent = event.date || "A confirmar";
  elements.summaryArea.textContent = event.broadArea || "Sin zona";
}

function renderLlmStatus(llm) {
  if (!llm) return;

  if (llm.mode === "live") {
    elements.llmStatus.textContent = "Modelo LLM activo";
    elements.llmNote.textContent = "Motor de lectura en línea.";
    return;
  }

  if (llm.mode === "heuristic-fallback") {
    elements.llmStatus.textContent = llm.configured
      ? "LLM con apoyo heurístico"
      : "LLM no configurado";
    elements.llmNote.textContent = humanizeLlmNote(llm.note, llm.configured);
    return;
  }

  elements.llmStatus.textContent = llm.configured ? "Configurado" : "No configurado";
  elements.llmNote.textContent = "Sin modelo informado.";
}

function humanizeLlmNote(note, configured) {
  const rawNote = String(note || "").trim();
  if (!rawNote) {
    return configured
      ? "El motor principal no estuvo disponible y usamos una lectura de respaldo."
      : "No hay motor configurado, por eso usamos una lectura de respaldo.";
  }

  const normalized = rawNote.toLowerCase();

  if (normalized.includes("529") || normalized.includes("overloaded_error") || normalized.includes("high load")) {
    return "El motor estuvo ocupado. Usamos una lectura de respaldo.";
  }

  if (normalized.includes("api key")) {
    return "El motor principal no está configurado correctamente.";
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "El motor tardó más de lo esperado. Seguimos con respaldo.";
  }

  return configured
    ? "El motor principal tuvo un inconveniente y usamos respaldo."
    : "No hay motor configurado, por eso usamos respaldo.";
}

function renderTriiiStatus(trii) {
  if (!trii) return;
  elements.triiStatus.textContent = trii.configured ? "Canal disponible" : "Canal no configurado";
  elements.triiNote.textContent = trii.configured
    ? trii.mode === "meta"
      ? `${trii.providerLabel || "Meta Cloud API"} · phoneNumberId ${trii.phoneNumberId || "-"}`
      : `${trii.mode === "v2" ? "Trii V2" : "Trii V1"} · ${trii.mode === "v2" ? `channelId ${trii.channelId}` : `idCanal ${trii.idCanal}`}`
    : "Sin canal WhatsApp configurado.";
}

function setPendingState(isPending) {
  const button = elements.messageForm.querySelector("button[type='submit']");
  button.disabled = isPending;
  button.textContent = isPending ? "Procesando..." : "Procesar mensaje";
}

function renderList(items, renderItem, emptyText) {
  if (!items || !items.length) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }
  return items.map(renderItem).join("");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatShortDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recién";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function labelField(field) {
  const labels = {
    economicLabel: "qué pasó concretamente",
    economicKind: "si fue servicio o producto",
    executionStatus: "si ya se hizo o sigue pendiente",
    paymentStatus: "si ya está cobrado",
    eventSummary: "resumen del evento",
    amount: "monto",
    date: "fecha",
  };
  return labels[field] || field;
}

function labelEconomicKind(value) {
  return value === "producto" ? "Producto" : value === "servicio" ? "Servicio" : "Sin tipo";
}

function labelExecutionStatus(value) {
  return value === "pendiente" ? "Pendiente" : value === "realizado" ? "Realizado" : "Sin estado";
}

function labelPaymentStatus(value) {
  return value === "cobrado"
    ? "Cobrado"
    : value === "pendiente_cobro"
      ? "Pendiente de cobro"
      : "Cobro sin definir";
}

function labelCommercialStatus(value) {
  const labels = {
    cotizacion: "Cotización",
    confirmado: "Confirmado",
    realizado: "Realizado",
    pendiente: "Pendiente",
  };
  return labels[value] || "Sin etapa";
}
