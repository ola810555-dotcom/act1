const STORAGE_KEY = "agenda-telefonica-pro-v1";
const BASE_CATEGORIES = ["Personal", "Trabajo", "Familia", "Emergencia", "Proveedor"];

const elements = {
  form: document.querySelector("#contactForm"),
  contactId: document.querySelector("#contactId"),
  name: document.querySelector("#name"),
  phone: document.querySelector("#phone"),
  secondaryPhone: document.querySelector("#secondaryPhone"),
  email: document.querySelector("#email"),
  company: document.querySelector("#company"),
  category: document.querySelector("#category"),
  categorySuggestions: document.querySelector("#categorySuggestions"),
  birthday: document.querySelector("#birthday"),
  address: document.querySelector("#address"),
  notes: document.querySelector("#notes"),
  favorite: document.querySelector("#favorite"),
  saveButton: document.querySelector("#saveButton"),
  deleteButton: document.querySelector("#deleteButton"),
  resetButton: document.querySelector("#resetButton"),
  exportButton: document.querySelector("#exportButton"),
  seedButton: document.querySelector("#seedButton"),
  importFile: document.querySelector("#importFile"),
  searchInput: document.querySelector("#searchInput"),
  filterCategory: document.querySelector("#filterCategory"),
  sortSelect: document.querySelector("#sortSelect"),
  contactList: document.querySelector("#contactList"),
  detailCard: document.querySelector("#detailCard"),
  totalContacts: document.querySelector("#totalContacts"),
  favoriteContacts: document.querySelector("#favoriteContacts"),
  categoryCount: document.querySelector("#categoryCount"),
  toast: document.querySelector("#toast"),
  pills: Array.from(document.querySelectorAll(".pill")),
};

const state = {
  contacts: loadContacts(),
  selectedId: null,
  activeView: "all",
  searchTerm: "",
  filterCategory: "Todos",
  sortMode: "recent",
};

let toastTimeout = null;

initialize();

function initialize() {
  // Si no hay datos guardados, dejamos una demo para que la interfaz se vea viva desde el inicio.
  if (state.contacts.length === 0) {
    state.contacts = createSeedContacts();
    persistContacts();
  }

  state.selectedId = state.contacts[0]?.id ?? null;

  bindEvents();
  render();
}

function bindEvents() {
  // El formulario sirve tanto para crear como para editar contactos.
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.resetButton.addEventListener("click", resetForm);
  elements.deleteButton.addEventListener("click", deleteSelectedContact);
  elements.exportButton.addEventListener("click", exportContacts);
  elements.seedButton.addEventListener("click", reloadDemoContacts);
  elements.importFile.addEventListener("change", importContacts);

  elements.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim().toLowerCase();
    render();
  });

  elements.filterCategory.addEventListener("change", (event) => {
    state.filterCategory = event.target.value;
    render();
  });

  elements.sortSelect.addEventListener("change", (event) => {
    state.sortMode = event.target.value;
    render();
  });

  elements.pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      state.activeView = pill.dataset.view;
      elements.pills.forEach((item) => item.classList.remove("active"));
      pill.classList.add("active");
      render();
    });
  });

  // Delegacion para que la lista siga funcionando aunque se renderice de nuevo.
  elements.contactList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (actionButton) {
      const contactId = actionButton.closest(".contact-item")?.dataset.id;
      if (!contactId) {
        return;
      }

      const action = actionButton.dataset.action;

      if (action === "favorite") {
        toggleFavorite(contactId);
      }

      if (action === "edit") {
        loadContactIntoForm(contactId);
      }

      if (action === "delete") {
        deleteContact(contactId);
      }

      return;
    }

    const card = event.target.closest(".contact-item");
    if (!card) {
      return;
    }

    state.selectedId = card.dataset.id;
    renderDetail(findContactById(state.selectedId));
    renderList(getVisibleContacts());
  });

  elements.detailCard.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-detail-action]");

    if (!actionButton || !state.selectedId) {
      return;
    }

    const action = actionButton.dataset.detailAction;

    if (action === "edit") {
      loadContactIntoForm(state.selectedId);
    }

    if (action === "favorite") {
      toggleFavorite(state.selectedId);
    }
  });
}

function handleFormSubmit(event) {
  event.preventDefault();

  const payload = collectFormData();
  const isEditing = Boolean(elements.contactId.value);

  if (isEditing) {
    state.contacts = state.contacts.map((contact) => {
      if (contact.id !== elements.contactId.value) {
        return contact;
      }

      return {
        ...contact,
        ...payload,
        updatedAt: Date.now(),
      };
    });

    showToast("Contacto actualizado correctamente.");
  } else {
    const newContact = {
      id: createId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...payload,
    };

    state.contacts.unshift(newContact);
    state.selectedId = newContact.id;
    showToast("Contacto guardado en la agenda.");
  }

  persistContacts();
  resetForm(false);
  render();
}

function collectFormData() {
  return {
    name: elements.name.value.trim(),
    phone: elements.phone.value.trim(),
    secondaryPhone: elements.secondaryPhone.value.trim(),
    email: elements.email.value.trim(),
    company: elements.company.value.trim(),
    category: elements.category.value || "Personal",
    birthday: elements.birthday.value,
    address: elements.address.value.trim(),
    notes: elements.notes.value.trim(),
    favorite: elements.favorite.checked,
  };
}

function render() {
  const visibleContacts = getVisibleContacts();
  syncSelection(visibleContacts);
  renderStats();
  renderCategorySuggestions();
  renderCategoryFilter();
  renderList(visibleContacts);
  renderDetail(findContactById(state.selectedId));
}

function renderStats() {
  const favorites = state.contacts.filter((contact) => contact.favorite).length;
  const categories = new Set(state.contacts.map((contact) => contact.category).filter(Boolean));

  elements.totalContacts.textContent = String(state.contacts.length);
  elements.favoriteContacts.textContent = String(favorites);
  elements.categoryCount.textContent = String(categories.size);
}

function renderCategoryFilter() {
  const categories = ["Todos", ...new Set([...BASE_CATEGORIES, ...state.contacts.map((contact) => contact.category).filter(Boolean)])];
  const selectedCategory = categories.includes(state.filterCategory) ? state.filterCategory : "Todos";

  elements.filterCategory.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");

  elements.filterCategory.value = selectedCategory;
}

function renderCategorySuggestions() {
  // El campo de categoria acepta texto libre, pero tambien ofrece sugerencias utiles.
  const categories = [...new Set([...BASE_CATEGORIES, ...state.contacts.map((contact) => contact.category).filter(Boolean)])];

  elements.categorySuggestions.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
}

function getVisibleContacts() {
  const recentThreshold = Date.now() - 1000 * 60 * 60 * 24 * 14;

  return [...state.contacts]
    .filter((contact) => {
      if (state.activeView === "favorites" && !contact.favorite) {
        return false;
      }

      if (state.activeView === "recent" && contact.updatedAt < recentThreshold) {
        return false;
      }

      if (state.filterCategory !== "Todos" && contact.category !== state.filterCategory) {
        return false;
      }

      if (!state.searchTerm) {
        return true;
      }

      const haystack = [
        contact.name,
        contact.phone,
        contact.secondaryPhone,
        contact.email,
        contact.company,
        contact.address,
        contact.notes,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(state.searchTerm);
    })
    .sort(sortContacts);
}

function sortContacts(first, second) {
  if (state.sortMode === "name-asc") {
    return first.name.localeCompare(second.name, "es", { sensitivity: "base" });
  }

  if (state.sortMode === "name-desc") {
    return second.name.localeCompare(first.name, "es", { sensitivity: "base" });
  }

  if (state.sortMode === "favorites") {
    if (first.favorite === second.favorite) {
      return second.updatedAt - first.updatedAt;
    }

    return Number(second.favorite) - Number(first.favorite);
  }

  return second.updatedAt - first.updatedAt;
}

function renderList(contacts) {
  if (contacts.length === 0) {
    elements.contactList.innerHTML = `
      <article class="empty-state">
        <strong>No hay coincidencias</strong>
        <p>Ajusta la busqueda o crea un nuevo contacto desde el formulario.</p>
      </article>
    `;
    return;
  }

  elements.contactList.innerHTML = contacts.map(createContactCardMarkup).join("");
}

function createContactCardMarkup(contact) {
  const isActive = contact.id === state.selectedId;
  const safeName = escapeHtml(contact.name);
  const safePhone = escapeHtml(contact.phone || "Sin telefono");
  const safeCompany = escapeHtml(contact.company || "Sin empresa");
  const safeCategory = escapeHtml(contact.category || "Sin categoria");
  const safeUpdated = escapeHtml(formatDateTime(contact.updatedAt));
  const avatarText = escapeHtml(getInitials(contact.name));

  return `
    <article class="contact-item ${isActive ? "active" : ""}" data-id="${escapeHtml(contact.id)}">
      <div class="contact-item-top">
        <div class="contact-id">
          <div class="avatar">${avatarText}</div>
          <div>
            <div class="contact-name">${safeName}</div>
            <div class="contact-meta">${safeCompany}</div>
          </div>
        </div>

        <div class="mini-actions">
          <button class="icon-button ${contact.favorite ? "favorite-on" : ""}" type="button" data-action="favorite">
            ${contact.favorite ? "Favorito" : "Fav"}
          </button>
          <button class="icon-button" type="button" data-action="edit">Editar</button>
          <button class="icon-button delete" type="button" data-action="delete">Borrar</button>
        </div>
      </div>

      <div class="contact-item-bottom">
        <span class="chip">${safeCategory}</span>
        ${contact.favorite ? '<span class="chip favorite-badge">Prioritario</span>' : ""}
      </div>

      <div class="contact-meta">${safePhone}</div>
      <div class="muted">Actualizado: ${safeUpdated}</div>
    </article>
  `;
}

function renderDetail(contact) {
  if (!contact) {
    elements.detailCard.classList.add("empty");
    elements.detailCard.innerHTML = `
      <div class="detail-empty">
        <strong>No hay un contacto visible</strong>
        <p>Cuando selecciones una tarjeta, aqui aparecera toda la informacion.</p>
      </div>
    `;
    return;
  }

  elements.detailCard.classList.remove("empty");

  const safeName = escapeHtml(contact.name);
  const safeCategory = escapeHtml(contact.category || "Sin categoria");
  const safeCompany = escapeHtml(contact.company || "Sin empresa");
  const safeAddress = escapeHtml(contact.address || "Sin direccion registrada");
  const safePhone = escapeHtml(contact.phone || "No disponible");
  const safeSecondaryPhone = escapeHtml(contact.secondaryPhone || "No disponible");
  const safeEmail = escapeHtml(contact.email || "No disponible");
  const safeNotes = escapeHtml(contact.notes || "Sin comentarios guardados.");
  const safeBirthday = escapeHtml(formatBirthday(contact.birthday));
  const safeCreated = escapeHtml(formatDateTime(contact.createdAt));
  const safeUpdated = escapeHtml(formatDateTime(contact.updatedAt));

  elements.detailCard.innerHTML = `
    <div class="detail-top">
      <div class="detail-title">
        <div class="avatar">${escapeHtml(getInitials(contact.name))}</div>
        <div>
          <h3>${safeName}</h3>
          <p class="muted">${safeCompany}</p>
        </div>
      </div>

      <div class="mini-actions">
        <button class="icon-button" type="button" data-detail-action="edit">Editar</button>
        <button class="icon-button ${contact.favorite ? "favorite-on" : ""}" type="button" data-detail-action="favorite">
          ${contact.favorite ? "Quitar favorito" : "Marcar favorito"}
        </button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-meta">
        <span>${safeCategory}</span>
        <span>${contact.favorite ? "Contacto prioritario" : "Contacto regular"}</span>
      </div>

      <div class="detail-links">
        <a href="${escapeHtml(getTelLink(contact.phone))}">Llamar: ${safePhone}</a>
        <a href="${escapeHtml(getTelLink(contact.secondaryPhone))}">Alterno: ${safeSecondaryPhone}</a>
      </div>

      <div class="detail-links">
        <a href="${escapeHtml(getMailLink(contact.email))}">Correo: ${safeEmail}</a>
      </div>

      <div class="detail-meta">
        <span>Direccion: ${safeAddress}</span>
        <span>Cumpleanos: ${safeBirthday}</span>
      </div>

      <div class="detail-meta">
        <span>Creado: ${safeCreated}</span>
        <span>Actualizado: ${safeUpdated}</span>
      </div>

      <div class="notes-box">${safeNotes}</div>
    </div>
  `;
}

function syncSelection(visibleContacts) {
  const hasSelectedVisible = visibleContacts.some((contact) => contact.id === state.selectedId);

  if (hasSelectedVisible) {
    return;
  }

  state.selectedId = visibleContacts[0]?.id ?? null;
}

function loadContactIntoForm(contactId) {
  const contact = findContactById(contactId);

  if (!contact) {
    return;
  }

  state.selectedId = contact.id;
  elements.contactId.value = contact.id;
  elements.name.value = contact.name;
  elements.phone.value = contact.phone;
  elements.secondaryPhone.value = contact.secondaryPhone || "";
  elements.email.value = contact.email || "";
  elements.company.value = contact.company || "";
  elements.category.value = contact.category || "Personal";
  elements.birthday.value = contact.birthday || "";
  elements.address.value = contact.address || "";
  elements.notes.value = contact.notes || "";
  elements.favorite.checked = Boolean(contact.favorite);

  elements.saveButton.textContent = "Actualizar contacto";
  elements.deleteButton.disabled = false;

  render();
  showToast("Contacto cargado en el formulario.");
}

function resetForm(showMessage = true) {
  elements.form.reset();
  elements.contactId.value = "";
  elements.saveButton.textContent = "Guardar contacto";
  elements.deleteButton.disabled = true;
  elements.category.value = "Personal";

  if (showMessage) {
    showToast("Formulario listo para un nuevo contacto.");
  }
}

function toggleFavorite(contactId) {
  state.contacts = state.contacts.map((contact) => {
    if (contact.id !== contactId) {
      return contact;
    }

    return {
      ...contact,
      favorite: !contact.favorite,
      updatedAt: Date.now(),
    };
  });

  persistContacts();
  render();
  showToast("Estado de favorito actualizado.");
}

function deleteSelectedContact() {
  if (!elements.contactId.value) {
    return;
  }

  deleteContact(elements.contactId.value);
}

function deleteContact(contactId) {
  const contact = findContactById(contactId);

  if (!contact) {
    return;
  }

  const confirmed = window.confirm(`Se eliminara a ${contact.name}. Deseas continuar?`);
  if (!confirmed) {
    return;
  }

  state.contacts = state.contacts.filter((item) => item.id !== contactId);
  persistContacts();
  resetForm(false);

  if (state.selectedId === contactId) {
    state.selectedId = state.contacts[0]?.id ?? null;
  }

  render();
  showToast("Contacto eliminado.");
}

function exportContacts() {
  const payload = JSON.stringify(state.contacts, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "agenda-telefonica.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
  showToast("Agenda exportada en formato JSON.");
}

function importContacts(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const rawData = JSON.parse(String(reader.result));
      const importedContacts = Array.isArray(rawData) ? rawData : rawData.contacts;

      if (!Array.isArray(importedContacts)) {
        throw new Error("Formato invalido");
      }

      const normalizedContacts = importedContacts.map(normalizeImportedContact).filter(Boolean);

      if (normalizedContacts.length === 0) {
        throw new Error("Sin contactos validos");
      }

      state.contacts = [...normalizedContacts, ...state.contacts];
      persistContacts();
      state.selectedId = state.contacts[0].id;
      render();
      showToast(`${normalizedContacts.length} contactos importados.`);
    } catch (error) {
      showToast("No se pudo importar el archivo.");
    } finally {
      event.target.value = "";
    }
  };

  reader.readAsText(file);
}

function normalizeImportedContact(contact) {
  // Normalizamos la importacion para evitar errores por datos incompletos o mal formados.
  if (!contact || typeof contact !== "object") {
    return null;
  }

  const name = String(contact.name || "").trim();
  const phone = String(contact.phone || "").trim();

  if (!name || !phone) {
    return null;
  }

  return {
    id: createId(),
    name,
    phone,
    secondaryPhone: String(contact.secondaryPhone || "").trim(),
    email: String(contact.email || "").trim(),
    company: String(contact.company || "").trim(),
    category: String(contact.category || "Personal").trim() || "Personal",
    birthday: String(contact.birthday || "").trim(),
    address: String(contact.address || "").trim(),
    notes: String(contact.notes || "").trim(),
    favorite: Boolean(contact.favorite),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function reloadDemoContacts() {
  const confirmed = window.confirm("Esto reemplazara la agenda actual con los contactos de ejemplo. Continuar?");
  if (!confirmed) {
    return;
  }

  state.contacts = createSeedContacts();
  state.selectedId = state.contacts[0]?.id ?? null;
  persistContacts();
  resetForm(false);
  render();
  showToast("Demo recargada.");
}

function loadContacts() {
  try {
    const savedContacts = window.localStorage.getItem(STORAGE_KEY);
    if (!savedContacts) {
      return [];
    }

    const parsed = JSON.parse(savedContacts);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function persistContacts() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.contacts));
}

function findContactById(contactId) {
  return state.contacts.find((contact) => contact.id === contactId) ?? null;
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  toastTimeout = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2200);
}

function createId() {
  return `contact-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getTelLink(phone) {
  if (!phone) {
    return "#";
  }

  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function getMailLink(email) {
  if (!email) {
    return "#";
  }

  return `mailto:${email}`;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function formatBirthday(value) {
  if (!value) {
    return "No definido";
  }

  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "long",
  }).format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
  // Sanitizamos texto antes de inyectarlo en plantillas HTML.
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createSeedContacts() {
  const now = Date.now();

  return [
    {
      id: createId(),
      name: "Ana Martinez",
      phone: "5555-0101",
      secondaryPhone: "5555-9981",
      email: "ana.martinez@correo.com",
      company: "Studio Norte",
      category: "Trabajo",
      birthday: "1994-06-18",
      address: "Zona 10, Ciudad de Guatemala",
      notes: "Cliente frecuente. Prefiere llamadas por la tarde.",
      favorite: true,
      createdAt: now - 1000 * 60 * 60 * 48,
      updatedAt: now - 1000 * 60 * 30,
    },
    {
      id: createId(),
      name: "Carlos Rivera",
      phone: "5012-7712",
      secondaryPhone: "",
      email: "carlos.rivera@correo.com",
      company: "Familia",
      category: "Familia",
      birthday: "1988-02-07",
      address: "Mixco, Guatemala",
      notes: "Llamar antes de visitar. Tiene contacto de emergencia.",
      favorite: true,
      createdAt: now - 1000 * 60 * 60 * 72,
      updatedAt: now - 1000 * 60 * 90,
    },
    {
      id: createId(),
      name: "Laura Gomez",
      phone: "4433-1122",
      secondaryPhone: "4011-3344",
      email: "laura@servicios.com",
      company: "Servicios del Valle",
      category: "Proveedor",
      birthday: "",
      address: "Villa Nueva",
      notes: "Proveedora de mantenimiento. Responde rapido por correo.",
      favorite: false,
      createdAt: now - 1000 * 60 * 60 * 96,
      updatedAt: now - 1000 * 60 * 60 * 5,
    },
    {
      id: createId(),
      name: "Emergencias Medicas",
      phone: "1555",
      secondaryPhone: "",
      email: "",
      company: "Atencion inmediata",
      category: "Emergencia",
      birthday: "",
      address: "Cobertura nacional",
      notes: "Numero util para reaccion rapida ante incidentes.",
      favorite: true,
      createdAt: now - 1000 * 60 * 60 * 24 * 5,
      updatedAt: now - 1000 * 60 * 15,
    },
  ];
}
